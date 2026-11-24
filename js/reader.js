// The word-by-word reader: rendering, timing loop, gestures, in-reader menus.
import {
  tokenize, prevSentenceStart, nextSentenceStart, sentenceStart, sentenceEnd, paragraphRange, chapterAt,
} from './core/tokenize.js';
import {
  orpIndex, chunkAt, prevChunkStart, delayFor, rampFactor, averageMsPerWord, formatDuration, formatNumber,
} from './core/timing.js';
import * as db from './store.js';
import { settings, update, onChange, clamp, WPM_MIN, WPM_MAX } from './settings.js';
import { renderControls } from './controls.js';
import { enterFullscreen, exitFullscreen, isFullscreen, lockOrientation } from './fullscreen.js';
import { $, esc, toast, vibrate, fmtPct } from './ui.js';
import { icon } from './icons.js';

const HOLD_MS = 220; // press longer than this while playing = pause while held
const TAP_MAX_MS = 350;
const MOVE_SLOP = 12; // px before a press becomes a drag
const SWIPE_MIN = 45; // px horizontal for a swipe
const SPEED_PX = 16; // px of vertical drag per speed step
const SPEED_STEP = 10; // wpm per step

export class Reader {
  constructor(root, { onExit }) {
    this.root = root;
    this.onExit = onExit;
    this.stage = $('#r-stage', root);
    this.wordEl = $('#r-word', root);
    this.preEl = $('.pre', this.wordEl);
    this.pivEl = $('.piv', this.wordEl);
    this.postEl = $('.post', this.wordEl);
    this.ctxEl = $('#r-context', root);
    this.flashEl = $('#r-flash', root);
    this.panel = $('#r-panel', root);
    this.info = { wpm: $('#r-wpm', root), count: $('#r-count', root), chapter: $('#r-chapter', root), left: $('#r-left', root), bar: $('#r-bar', root) };
    this.playing = false;
    this.timer = 0;
    this.doc = null;
    this.bindGestures();
    this.bindKeys();
    $('#r-menu-btn', root).addEventListener('click', () => this.openPanel('menu'));
    onChange((s, patch) => this.onSettings(patch));
    document.addEventListener('visibilitychange', () => {
      if (!this.doc) return;
      if (document.hidden) { this.pause(); this.releaseWake(); } else this.acquireWake();
    });
    window.addEventListener('pagehide', () => this.saveProgress(true));
    document.addEventListener('fullscreenchange', () => {
      if (this.doc && !isFullscreen() && settings().fullscreen && this.playing) this.pause();
      if (this.doc) requestAnimationFrame(() => this.layout());
    });
    window.addEventListener('resize', () => this.doc && this.layout());
  }

  // ---------------------------------------------------------------- lifecycle
  async open(id) {
    this.close(false);
    const [item, content, prog] = await Promise.all([db.get('items', id), db.get('content', id), db.get('progress', id)]);
    if (!item || !content) { toast('Ez a szöveg már nincs meg a telefonon.'); this.onExit(); return; }
    const t = tokenize(content.chapters);
    if (!t.words.length) { toast('Ebben a szövegben nincs mit olvasni.'); this.onExit(); return; }
    this.doc = { item, t, n: t.words.length };
    this.i = clamp(prog?.index ?? 0, 0, t.words.length - 1);
    this.loop = !!prog?.loop;
    this.avgMs = averageMsPerWord(t.words, t.flags, settings());
    this.lastSave = 0;
    this.statWords = 0;
    this.statMs = 0;
    this.trainAcc = 0;
    db.put('items', { ...item, lastOpened: Date.now() });
    this.closePanel();
    this.setPlaying(false);
    this.acquireWake();
    lockOrientation();
    requestAnimationFrame(() => this.render());
    if (!settings().helpSeen) { this.openPanel('help'); update({ helpSeen: true }); }
  }

  close(exit = true) {
    if (!this.doc) return;
    this.pause();
    this.saveProgress(true);
    this.releaseWake();
    this.closePanel();
    this.doc = null;
    if (exit) exitFullscreen();
  }

  // ---------------------------------------------------------------- playback
  play() {
    if (!this.doc || this.playing) return;
    if (this.i >= this.doc.n - 1) this.i = 0; // finished → start over
    if (settings().fullscreen && !isFullscreen()) enterFullscreen();
    this.closePanel();
    this.setPlaying(true);
    this.rampK = 0;
    this.nextAt = performance.now();
    this.playStarted = performance.now();
    this.step();
  }

  pause() {
    if (!this.playing) return;
    clearTimeout(this.timer);
    this.setPlaying(false);
    this.flushStats();
    this.saveProgress(true);
    this.render();
  }

  toggle() { if (this.playing) this.pause(); else this.play(); }

  setPlaying(on) {
    this.playing = on;
    this.root.classList.toggle('paused', !on);
    this.root.classList.toggle('playing', on);
  }

  step() {
    if (!this.playing) return;
    const s = settings();
    const { t } = this.doc;
    const n = chunkAt(t.words, t.flags, this.i, s.chunk);
    this.render(n);
    let d = delayFor(t.words, t.flags, this.i, n, s);
    if (s.ramp) d /= rampFactor(this.rampK++);
    const now = performance.now();
    if (now - this.nextAt > 500) this.nextAt = now; // we were throttled; don't burst
    this.nextAt += d;
    this.timer = setTimeout(() => this.advance(n, d), Math.max(0, this.nextAt - performance.now()));
  }

  advance(n, d) {
    if (!this.playing) return;
    this.statWords += n;
    this.statMs += d;
    if (this.statMs > 15000) this.flushStats();
    this.trainTick(d);
    if (this.i + n >= this.doc.n) {
      if (this.loop) {
        this.i = 0;
        this.flash('Újra az elejéről');
        this.rampK = 0;
        this.nextAt = performance.now() + 1200;
        this.saveProgress(true);
        this.timer = setTimeout(() => this.step(), 1200);
        return;
      }
      this.i = this.doc.n - 1;
      this.pause();
      this.openPanel('end');
      return;
    }
    this.i += n;
    this.saveProgress();
    this.step();
  }

  trainTick(d) {
    const s = settings();
    if (!s.train) return;
    this.trainAcc += d;
    if (this.trainAcc < s.trainEvery * 1000) return;
    this.trainAcc = 0;
    if (s.wpm >= s.trainMax) return;
    update({ wpm: Math.min(s.trainMax, s.wpm + s.trainStep) });
    this.flash(`${settings().wpm} szó/perc`);
  }

  /** Jump while keeping the play state; a short beat lets the eye catch up. */
  jumpTo(i, message) {
    this.i = clamp(i, 0, this.doc.n - 1);
    if (message) this.flash(message);
    if (this.playing) {
      clearTimeout(this.timer);
      this.rampK = 0;
      this.render();
      this.nextAt = performance.now() + 350;
      this.timer = setTimeout(() => this.step(), 350);
    } else this.render();
    this.saveProgress(true);
  }

  stepWord(dir) {
    const { t } = this.doc;
    const size = settings().chunk;
    if (dir > 0) this.i = Math.min(this.doc.n - 1, this.i + chunkAt(t.words, t.flags, this.i, size));
    else this.i = prevChunkStart(t.words, t.flags, this.i, size);
    this.render();
    this.saveProgress();
  }

  sentence(dir) {
    const { flags } = this.doc.t;
    if (settings().haptics) vibrate(10);
    if (dir < 0) this.jumpTo(prevSentenceStart(flags, this.i), '◂ előző mondat');
    else this.jumpTo(nextSentenceStart(flags, this.i), 'következő mondat ▸');
  }

  changeSpeed(steps) {
    const wpm = clamp(settings().wpm + steps * SPEED_STEP, WPM_MIN, WPM_MAX);
    if (wpm === settings().wpm) return;
    update({ wpm });
    this.flash(`${wpm} szó/perc`, true);
  }

  // ---------------------------------------------------------------- rendering
  render(n) {
    if (!this.doc) return;
    const s = settings();
    const { t } = this.doc;
    n ??= chunkAt(t.words, t.flags, this.i, s.chunk);
    this.shown = n;
    const text = t.words.slice(this.i, this.i + n).join(' ');
    const focus = s.orp && n === 1;
    if (focus) {
      const k = orpIndex(text);
      const end = k + ([...text.slice(k)][0]?.length || 1);
      this.preEl.textContent = text.slice(0, k);
      this.pivEl.textContent = text.slice(k, end);
      this.postEl.textContent = text.slice(end);
    } else {
      this.preEl.textContent = text;
      this.pivEl.textContent = '';
      this.postEl.textContent = '';
    }
    this.root.classList.toggle('focus-mode', focus);
    this.layout();
    this.renderInfo();
    if (!this.playing) this.renderContext();
  }

  layout() {
    if (!this.doc) return;
    const s = settings();
    const W = this.stage.clientWidth;
    const focus = this.root.classList.contains('focus-mode');
    this.root.classList.toggle('no-guides', !s.guides);
    this.root.classList.toggle('no-info', !s.cornerInfo);
    const anchor = Math.round(W * (focus ? 0.4 : 0.5));
    this.root.style.setProperty('--anchor', `${anchor}px`);
    const el = this.wordEl;
    el.style.fontSize = `${s.fontSize}px`;
    let w = el.offsetWidth;
    const maxW = W * 0.94;
    if (w > maxW) {
      el.style.fontSize = `${Math.max(12, Math.floor(s.fontSize * (maxW / w)))}px`;
      w = el.offsetWidth;
    }
    let left;
    if (focus) {
      left = anchor - this.preEl.offsetWidth - this.pivEl.offsetWidth / 2;
      left = clamp(left, W * 0.03, Math.max(W * 0.03, W * 0.97 - w));
    } else left = (W - w) / 2;
    el.style.transform = `translate(${Math.round(left)}px, -50%)`;
  }

  renderInfo() {
    const s = settings();
    const { t, n } = this.doc;
    this.info.wpm.textContent = `${s.wpm} sz/p`;
    this.info.count.textContent = `${formatNumber(this.i + 1)} / ${formatNumber(n)}`;
    const ch = chapterAt(t.chapterStarts, this.i);
    this.info.chapter.textContent = t.chapterTitles[ch] || this.doc.item.title;
    const left = formatDuration((n - this.i) * this.avgMs);
    this.info.left.textContent = left.startsWith('<') ? left : `~${left}`;
    this.info.bar.style.transform = `scaleX(${n > 1 ? this.i / (n - 1) : 1})`;
  }

  renderContext() {
    if (!settings().contextLine) { this.ctxEl.innerHTML = ''; return; }
    const { words, flags } = this.doc.t;
    let a = sentenceStart(flags, this.i);
    let b = sentenceEnd(flags, this.i);
    const pre = a < this.i - 14 ? '… ' : '';
    const post = b > this.i + 24 ? ' …' : '';
    a = Math.max(a, this.i - 14);
    b = Math.min(b, this.i + 24);
    const cur = this.shown || 1;
    const parts = [];
    for (let j = a; j <= b; j++) {
      const w = esc(words[j]);
      parts.push(j >= this.i && j < this.i + cur ? `<mark>${w}</mark>` : w);
    }
    this.ctxEl.innerHTML = pre + parts.join(' ') + post;
  }

  flash(text, big = false) {
    const el = this.flashEl;
    el.textContent = text;
    el.classList.toggle('big', big);
    el.classList.remove('show');
    void el.offsetWidth; // restart the transition
    el.classList.add('show');
    clearTimeout(this.flashTimer);
    this.flashTimer = setTimeout(() => el.classList.remove('show'), big ? 650 : 900);
  }

  onSettings(patch) {
    if (!this.doc) return;
    if ('wpm' in patch || 'smartPauses' in patch || 'pauseStrength' in patch) this.avgMs = averageMsPerWord(this.doc.t.words, this.doc.t.flags, settings());
    if ('orientation' in patch) lockOrientation();
    if (!this.playing || !('wpm' in patch)) this.render(); else this.renderInfo();
  }

  // ---------------------------------------------------------------- persistence
  saveProgress(force = false) {
    if (!this.doc) return;
    const now = Date.now();
    if (!force && now - this.lastSave < 2000) return;
    this.lastSave = now;
    const { item, t, n } = this.doc;
    db.put('progress', { id: item.id, index: this.i, total: n, loop: this.loop, word: t.words[this.i], updatedAt: now }).catch(() => {});
  }

  flushStats() {
    if (!this.statWords) return;
    db.addStats(this.statWords, this.statMs).catch(() => {});
    this.statWords = 0;
    this.statMs = 0;
  }

  async acquireWake() {
    try { if (!this.wake && 'wakeLock' in navigator && !document.hidden) this.wake = await navigator.wakeLock.request('screen'); this.wake?.addEventListener?.('release', () => { this.wake = null; }); } catch { this.wake = null; }
  }

  releaseWake() { try { this.wake?.release(); } catch { /* ignore */ } this.wake = null; }

  // ---------------------------------------------------------------- gestures
  bindGestures() {
    const st = this.stage;
    let p = null;
    st.addEventListener('contextmenu', (e) => e.preventDefault());
    st.addEventListener('pointerdown', (e) => {
      if (!this.doc || !e.isPrimary || (e.pointerType === 'mouse' && e.button !== 0)) return;
      st.setPointerCapture?.(e.pointerId);
      p = { x0: e.clientX, y0: e.clientY, t0: performance.now(), mode: null, held: false, applied: 0 };
      if (this.playing) {
        p.holdTimer = setTimeout(() => {
          if (!p || p.mode) return;
          p.held = true;
          this.pause();
          this.root.classList.add('holding');
        }, HOLD_MS);
      }
    });
    st.addEventListener('pointermove', (e) => {
      if (!p || !e.isPrimary) return;
      const dx = e.clientX - p.x0;
      const dy = e.clientY - p.y0;
      if (!p.mode && Math.hypot(dx, dy) > MOVE_SLOP) {
        clearTimeout(p.holdTimer);
        p.mode = Math.abs(dy) > Math.abs(dx) ? 'speed' : 'swipe';
      }
      if (p.mode === 'speed') {
        const steps = Math.trunc(-dy / SPEED_PX) - p.applied;
        if (steps) { p.applied += steps; this.changeSpeed(steps); }
      }
    });
    const end = (e, cancelled) => {
      if (!p || !e.isPrimary) return;
      clearTimeout(p.holdTimer);
      const { mode, held } = p;
      const dx = e.clientX - p.x0;
      const dt = performance.now() - p.t0;
      p = null;
      this.root.classList.remove('holding');
      if (cancelled) { if (held) this.play(); return; }
      if (mode === 'swipe' && Math.abs(dx) >= SWIPE_MIN) {
        const backDir = settings().swipeBack === 'left' ? -1 : 1;
        this.sentence(Math.sign(dx) === backDir ? -1 : 1);
      } else if (!mode && !held && dt <= TAP_MAX_MS) this.tap(e.clientX);
      if (held) this.play();
    };
    st.addEventListener('pointerup', (e) => end(e, false));
    st.addEventListener('pointercancel', (e) => end(e, true));
  }

  tap(x) {
    if (this.playing) { this.pause(); return; }
    const W = this.stage.clientWidth;
    const r = this.stage.getBoundingClientRect();
    const rel = (x - r.left) / W;
    if (rel < 1 / 3) this.stepWord(-1);
    else if (rel > 2 / 3) this.stepWord(1);
    else this.play();
  }

  bindKeys() {
    document.addEventListener('keydown', (e) => {
      if (!this.doc || this.root.hidden || e.target.closest?.('input, textarea, select')) return;
      if (!this.panel.hidden) { if (e.key === 'Escape') this.closePanel(); return; }
      const k = e.key;
      if (k === ' ' || k === 'Enter') this.toggle();
      else if (k === 'ArrowLeft') (e.ctrlKey || this.playing ? this.sentence(-1) : this.stepWord(-1));
      else if (k === 'ArrowRight') (e.ctrlKey || this.playing ? this.sentence(1) : this.stepWord(1));
      else if (k === 'ArrowUp') this.changeSpeed(1);
      else if (k === 'ArrowDown') this.changeSpeed(-1);
      else if (k === 'Escape' || k === 'm') { this.pause(); this.openPanel('menu'); } else return;
      e.preventDefault();
    });
  }

  // ---------------------------------------------------------------- panels
  openPanel(kind) {
    if (!this.doc) return;
    this.pause();
    this.disposeControls?.();
    this.disposeControls = null;
    const p = this.panel;
    p.dataset.kind = kind;
    p.innerHTML = this[`panel_${kind}`]();
    p.hidden = false;
    p.scrollTop = 0;
    p.onclick = (e) => this.onPanelClick(e);
    if (kind === 'menu') this.disposeControls = renderControls($('.rp-quick', p), ['wpm', 'fontSize', 'chunk', 'theme', 'orp', 'smartPauses', 'ramp', 'train']);
    if (kind === 'para' || kind === 'chapters') requestAnimationFrame(() => $('.current', p)?.scrollIntoView({ block: 'center' }));
  }

  closePanel() {
    this.disposeControls?.();
    this.disposeControls = null;
    this.panel.hidden = true;
    this.panel.innerHTML = '';
  }

  head(title) {
    const { item } = this.doc;
    return `<div class="rp-head"><div class="rp-title"><b>${esc(title || item.title)}</b>${title ? '' : `<span>${esc(item.author || '')}</span>`}</div>
      <span class="rp-pct">${fmtPct(this.i, this.doc.n)}</span>
      <button type="button" class="icon-btn" data-act="close" aria-label="Bezárás">${icon('close')}</button></div>`;
  }

  panel_menu() {
    const b = (act, ic, label, extra = '') => `<button type="button" class="rp-act ${extra}" data-act="${act}">${icon(ic)}<span>${label}</span></button>`;
    return `${this.head()}
      <div class="rp-actions">
        ${b('resume', 'play', 'Folytatás', 'primary')}
        ${b('restart', 'restart', 'Elölről')}
        ${b('loop', 'loop', this.loop ? 'Ismétlés: be' : 'Ismétlés: ki', this.loop ? 'on' : '')}
        ${b('para', 'para', 'Bekezdés')}
        ${this.doc.t.chapterStarts.length > 1 ? b('chapters', 'list', 'Fejezetek') : ''}
        ${b('fullscreen', 'expand', 'Teljes képernyő')}
        ${b('help', 'help', 'Gesztusok')}
        ${b('library', 'books', 'Könyvtár')}
      </div>
      <div class="rp-quick controls"></div>
      <a class="rp-more" href="#/settings">Összes beállítás</a>`;
  }

  panel_para() {
    const { words, flags } = this.doc.t;
    const [a] = paragraphRange(flags, Math.max(0, this.i - 250));
    const [, b] = paragraphRange(flags, Math.min(this.doc.n - 1, this.i + 350));
    let html = '<p>';
    for (let j = a; j <= b; j++) {
      html += `<span data-i="${j}"${j === this.i ? ' class="current"' : ''}>${esc(words[j])}</span> `;
      if (flags[j] & 4 && j < b) html += '</p><p>';
    }
    html += '</p>';
    return `${this.head('Bekezdés')}<p class="rp-note">Koppints egy szóra, és onnan folytatod.</p><div class="rp-para">${html}</div>`;
  }

  panel_chapters() {
    const { chapterStarts, chapterTitles } = this.doc.t;
    const cur = chapterAt(chapterStarts, this.i);
    const items = chapterStarts.map((start, k) => `<button type="button" class="rp-chapter${k === cur ? ' current' : ''}" data-jump="${start}">
      <span>${esc(chapterTitles[k] || `${k + 1}.`)}</span><small>${fmtPct(start, this.doc.n)}</small></button>`).join('');
    return `${this.head('Fejezetek')}<div class="rp-chapters">${items}</div>`;
  }

  panel_end() {
    return `${this.head()}<div class="rp-end"><p class="rp-end-word">Vé<span class="piv">g</span>e</p><p>A szöveg végére értél.</p>
      <div class="rp-actions">
        <button type="button" class="rp-act primary" data-act="restart-play">${icon('restart')}<span>Elölről</span></button>
        <button type="button" class="rp-act" data-act="loop-play">${icon('loop')}<span>Ismétlés bekapcsolása</span></button>
        <button type="button" class="rp-act" data-act="library">${icon('books')}<span>Könyvtár</span></button>
      </div></div>`;
  }

  panel_help() {
    const back = settings().swipeBack === 'left' ? 'balra' : 'jobbra';
    const fwd = settings().swipeBack === 'left' ? 'jobbra' : 'balra';
    const row = (g, d) => `<div class="help-row"><b>${g}</b><span>${d}</span></div>`;
    return `${this.head('Gesztusok')}<div class="rp-help">
      <h4>Olvasás közben</h4>
      ${row('Nyomva tartás', 'megáll, amíg nyomod, elengedve folytatja')}
      ${row('Koppintás', 'megállítja')}
      ${row('Húzás fel / le', 'gyorsabb / lassabb')}
      ${row(`Legyintés ${back}`, 'vissza az előző mondat elejére (többször is lehet)')}
      ${row(`Legyintés ${fwd}`, 'egy mondattal előre')}
      <h4>Megállítva</h4>
      ${row('Koppintás jobb oldalt', 'egy szóval előre')}
      ${row('Koppintás bal oldalt', 'egy szóval vissza')}
      ${row('Koppintás középen', 'folytatja')}
      ${row('☰ fent középen', 'menü: elölről, ismétlés, fejezetek, beállítások')}
      <button type="button" class="btn primary wide" data-act="close">Értem</button></div>`;
  }

  onPanelClick(e) {
    const word = e.target.closest('[data-i]');
    if (word) { this.closePanel(); this.jumpTo(Number(word.dataset.i)); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) { this.closePanel(); this.jumpTo(Number(jump.dataset.jump), 'Fejezet eleje'); return; }
    if (e.target.closest('.rp-more')) { this.closePanel(); return; }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    switch (act) {
      case 'close': this.closePanel(); break;
      case 'resume': this.closePanel(); this.play(); break;
      case 'restart': this.closePanel(); this.jumpTo(0, 'Elölről'); break;
      case 'restart-play': this.closePanel(); this.i = 0; this.play(); break;
      case 'loop':
        this.loop = !this.loop;
        this.saveProgress(true);
        e.target.closest('[data-act]').outerHTML = `<button type="button" class="rp-act ${this.loop ? 'on' : ''}" data-act="loop">${icon('loop')}<span>${this.loop ? 'Ismétlés: be' : 'Ismétlés: ki'}</span></button>`;
        toast(this.loop ? 'A szöveg végén újra kezdi.' : 'Ismétlés kikapcsolva.');
        break;
      case 'loop-play': this.loop = true; this.closePanel(); this.i = 0; this.saveProgress(true); this.play(); break;
      case 'para': this.openPanel('para'); break;
      case 'chapters': this.openPanel('chapters'); break;
      case 'help': this.openPanel('help'); break;
      case 'fullscreen': enterFullscreen(); this.closePanel(); break;
      case 'library': this.closePanel(); this.onExit(); break;
      default:
    }
  }
}

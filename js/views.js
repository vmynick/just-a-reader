// Library, browse, editor, settings and stats screens.
import * as docs from './docs.js';
import * as db from './store.js';
import { settings, update } from './settings.js';
import { renderControls } from './controls.js';
import { enterFullscreen, canInstall, installApp, onInstallChange, isInstalledApp } from './fullscreen.js';
import { orpIndex } from './core/timing.js';
import { t, num, mb, readingTime, errText, lang } from './i18n.js';
import { $, esc, toast, ask, sheet, fmtPct, downloadBlob } from './ui.js';
import { icon } from './icons.js';

export const REPO_URL = 'https://github.com/vmynick/just-a-reader';
const ADD_BOOK_URL = `${REPO_URL}/actions/workflows/add-book.yml`;
// Short-text genres: key, "{n} …" count phrase, filter label
const GENRES = [
  ['mese', '{n} mese', 'Mesék'],
  ['novella', '{n} novella', 'Novellák'],
  ['vers', '{n} vers', 'Versek'],
  ['dal', '{n} dal', 'Dalok'],
];
const OTHER_GENRE = ['szoveg', '{n} szöveg', 'Szövegek'];
const coll = new Intl.Collator('hu');
const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

function focusWord(word) {
  const w = word || t('Olvass');
  const k = orpIndex(w);
  return `<span class="pre">${esc(w.slice(0, k))}</span><span class="piv">${esc(w.slice(k, k + 1))}</span><span class="post">${esc(w.slice(k + 1))}</span>`;
}

const backLink = (attrs = '') => `<a class="icon-btn" href="#/" ${attrs} aria-label="${t('Vissza')}">${icon('back')}</a>`;

/** Open the reader from a user tap (fullscreen must start inside the gesture). */
export function openReader(id) {
  enterFullscreen();
  location.hash = `#/read/${encodeURIComponent(id)}`;
}

// ---------------------------------------------------------------- library
export async function renderLibrary(el) {
  const list = await docs.listLibrary();
  const texts = list.filter((x) => x.kind === 'text').sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  const recent = (a, b) => (b.lastOpened || 0) - (a.lastOpened || 0) || coll.compare(a.title, b.title);
  const shorts = list.filter((x) => x.short).sort((a, b) => (b.lastOpened || 0) - (a.lastOpened || 0)
    || coll.compare(a.author, b.author) || coll.compare(a.collection || '', b.collection || '') || (a.n ?? 0) - (b.n ?? 0));
  const SHORT_PREVIEW = 6;
  const showAllShorts = sessionStorage.getItem('jar.allShorts') === '1';
  const books = list.filter((x) => x.kind !== 'text' && !x.short).sort(recent);
  const last = list.filter((x) => x.lastOpened).sort((a, b) => b.lastOpened - a.lastOpened)[0];

  const row = (it) => {
    const p = it.progress;
    const total = p?.total || it.wordCount || 0;
    const pct = fmtPct(p?.index || 0, total);
    const sub = it.kind === 'text' ? t('{n} szó', { n: num(it.wordCount || 0) })
      : it.short ? t('{author}, kb. {time}', { author: esc(it.author), time: readingTime(it.wordCount || 0, settings().wpm) })
        : esc(it.author || it.fileName || '');
    const tools = it.kind === 'text'
      ? `<button type="button" class="icon-btn" data-act="edit" aria-label="${t('Szerkesztés')}">${icon('edit')}</button>
         <button type="button" class="icon-btn" data-act="delete" aria-label="${t('Törlés')}">${icon('trash')}</button>`
      : `<button type="button" class="icon-btn" data-act="more" aria-label="${t('Továbbiak')}">${icon('more')}</button>`;
    return `<li class="row" data-id="${esc(it.id)}">
      <button type="button" class="row-main" data-act="open">
        <span class="row-title">${esc(it.title)}</span>
        <span class="row-sub">${sub}</span>
        <span class="row-pct">${pct}</span>
        <span class="row-bar"><i style="transform:scaleX(${total ? Math.min(1, (p?.index || 0) / Math.max(1, total - 1)) : 0})"></i></span>
      </button>${tools}</li>`;
  };

  const hero = last
    ? `<section class="hero" data-id="${esc(last.id)}">
        <button type="button" class="hero-tap" data-act="open" aria-label="${esc(t('Folytatás: {title}', { title: last.title }))}">
          <span class="hero-word">${focusWord(last.progress?.word)}</span>
        </button>
        <div class="hero-meta">
          <span class="hero-title">${esc(last.title)}</span>
          <span class="hero-sub">${esc(last.author || '')}</span>
        </div>
        <div class="hero-bar"><i style="transform:scaleX(${last.progress?.total ? last.progress.index / Math.max(1, last.progress.total - 1) : 0})"></i></div>
        <button type="button" class="btn primary" data-act="open">${icon('play')}<span>${t('Folytatás, {pct}', { pct: fmtPct(last.progress?.index || 0, last.progress?.total || last.wordCount) })}</span></button>
      </section>`
    : `<section class="hero hero-empty"><span class="hero-word">${focusWord(t('Olvass'))}</span>
        <p>${t('Válassz egy könyvet, vagy írj be egy saját szöveget.')}</p></section>`;

  el.innerHTML = `
    <header class="lib-head">
      <h1 class="brand">Just A Reader</h1>
      <div class="head-actions">
        <button type="button" class="btn small install-btn" data-act="install" ${canInstall() ? '' : 'hidden'}>${icon('download')}<span>${t('Telepítés')}</span></button>
        <a class="icon-btn" href="#/stats" aria-label="${t('Statisztika')}">${icon('chart')}</a>
        <a class="icon-btn" href="#/settings" aria-label="${t('Beállítások')}">${icon('gear')}</a>
      </div>
    </header>
    <div class="lib-grid">
      ${hero}
      <div class="lib-lists">
        <section class="shelf">
          <div class="shelf-head"><h2>${t('Saját szövegek')}</h2>
            <a class="btn small" href="#/new">${icon('plus')}<span>${t('Új szöveg')}</span></a></div>
          ${texts.length ? `<ul class="rows">${texts.map(row).join('')}</ul>` : `<p class="empty">${t('Még nincs saját szöveged. Írj vagy másolj be egyet az „Új szöveg” gombbal.')}</p>`}
        </section>
        <section class="shelf">
          <div class="shelf-head"><h2>${t('Rövid olvasmányok')}</h2>
            <a class="btn small" href="#/browse/short">${icon('plus')}<span>${t('Továbbiak')}</span></a></div>
          ${shorts.length ? `<ul class="rows">${(showAllShorts ? shorts : shorts.slice(0, SHORT_PREVIEW)).map(row).join('')}</ul>` : `<p class="empty">${t('Mesék, versek, novellák, pár perc alatt elolvashatók. A „Továbbiak” gombbal választhatsz.')}</p>`}
          ${shorts.length > SHORT_PREVIEW ? `<button type="button" class="btn ghost small more-toggle" data-act="toggle-shorts">${showAllShorts ? t('Kevesebb mutatása') : t('Mind a {n} mutatása', { n: shorts.length })}</button>` : ''}
        </section>
        <section class="shelf">
          <div class="shelf-head"><h2>${t('Könyveim')}</h2>
            <button type="button" class="btn small" data-act="file">${icon('file')}<span>${t('Fájl megnyitása')}</span></button></div>
          ${books.length ? `<ul class="rows">${books.map(row).join('')}</ul>` : `<p class="empty">${t('Még nincs letöltött könyved.')}</p>`}
          <a class="btn wide" href="#/browse/book">${icon('books')}<span>${t('Könyvek böngészése')}</span></a>
        </section>
      </div>
    </div>
    <input type="file" id="file-input" hidden accept=".epub,.txt,.md,.html,.htm,.xhtml,.fb2,.zip,.pdf,application/epub+zip,text/plain,application/pdf,text/html">`;

  const byId = new Map(list.map((x) => [x.id, x]));
  el._offInstall?.();
  el._offInstall = onInstallChange(() => { const b = $('.install-btn', el); if (b) b.hidden = !canInstall(); });
  el.onclick = async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const id = btn.closest('[data-id]')?.dataset.id;
    const it = byId.get(id);
    switch (btn.dataset.act) {
      case 'open': openReader(id); break;
      case 'edit': location.hash = `#/edit/${encodeURIComponent(id)}`; break;
      case 'delete':
        if (await ask(t('Törlöd ezt a szöveget? „{title}”', { title: it.title }), { ok: t('Törlés'), danger: true })) {
          await docs.deleteDoc(it); toast(t('Szöveg törölve.')); renderLibrary(el);
        }
        break;
      case 'more':
        sheet(it.title, [
          { label: t('Olvasás'), icon: 'play', run: () => openReader(id) },
          { label: t('Elölről kezdés'), icon: 'restart', run: async () => { await docs.resetProgress(id); openReader(id); } },
          { label: t('Törlés a telefonról'), icon: 'trash', danger: true, run: async () => {
            const msg = it.kind === 'book'
              ? t('Törlöd a telefonról: „{title}”? Később újra letöltheted, és onnan folytatod, ahol tartottál.', { title: it.title })
              : t('Törlöd: „{title}”?', { title: it.title });
            if (await ask(msg, { ok: t('Törlés'), danger: true })) { await docs.deleteDoc(it); toast(t('Törölve a telefonról.')); renderLibrary(el); }
          } },
        ]);
        break;
      case 'file': $('#file-input', el).click(); break;
      case 'toggle-shorts':
        sessionStorage.setItem('jar.allShorts', showAllShorts ? '0' : '1');
        renderLibrary(el);
        break;
      case 'install':
        if (await installApp()) toast(t('Telepítve. Ezentúl a „Just A Reader” ikonról indítsd.'), { ms: 6000 });
        break;
      default:
    }
  };
  $('#file-input', el).onchange = async (e) => {
    const files = [...e.target.files];
    e.target.value = '';
    for (const f of files) {
      toast(t('Megnyitás: {name}…', { name: f.name }), { ms: 60000 });
      try { await docs.importFile(f); toast(t('Hozzáadva: {name}', { name: f.name })); } catch (err) { toast(`${f.name}: ${errText(err)}`, { ms: 6000 }); }
    }
    renderLibrary(el);
  };
}

// ---------------------------------------------------------------- browse
export async function renderBrowse(el, initialType) {
  const head = `<header class="sub-head">${backLink()}<h1>${t('Böngészés')}</h1></header>`;
  el.innerHTML = `${head}<p class="loading">${t('Lista betöltése…')}</p>`;
  let cat;
  try { cat = await docs.fetchCatalog(); } catch (err) {
    el.querySelector('.loading').textContent = t('{msg} Ellenőrizd az internetkapcsolatot, és próbáld újra.', { msg: errText(err) });
    return;
  }
  const have = new Set((await db.getAll('items')).map((i) => i.id));
  const progress = new Map((await db.getAll('progress')).map((p) => [p.id, p]));
  const genreKeys = GENRES.map(([k]) => k);
  const state = {
    lang: localStorage.getItem('jar.browseLang') || 'all',
    type: ['short', 'book', 'all'].includes(initialType) || genreKeys.includes(initialType) ? (genreKeys.includes(initialType) ? 'short' : initialType) : localStorage.getItem('jar.browseType') || 'all',
    genre: genreKeys.includes(initialType) ? initialType : 'all',
    q: '', picked: new Set(), open: new Set(),
  };
  const langs = [['hu', t('Magyar')], ['en', t('Angol')], ['all', t('Mind')]];
  const types = [['short', t('Rövid')], ['book', t('Könyvek')], ['all', t('Mind')]];
  const genres = [['all', t('Mind')], ...GENRES.map(([k, , plural]) => [k, t(plural)])];
  const seg = (name, opts, cur) => `<div class="seg" role="radiogroup" data-seg="${name}">${opts.map(([k, l]) => `<button type="button" role="radio" data-v="${k}" aria-checked="${cur === k}">${l}</button>`).join('')}</div>`;

  el.innerHTML = `${head}
    <div class="browse-tools">
      ${seg('type', types, state.type)}
      ${seg('lang', langs, state.lang)}
      <div class="genre-row" ${state.type === 'book' ? 'hidden' : ''}>${seg('genre', genres, state.genre)}</div>
      <label class="search">${icon('search')}<input type="search" placeholder="${t('Cím, szerző vagy gyűjtemény')}" aria-label="${t('Keresés')}"></label>
    </div>
    <div class="browse-list"></div>
    <div class="browse-foot">
      <button type="button" class="btn primary" data-act="download" disabled>${icon('download')}<span></span></button>
    </div>
    <p class="browse-note">${t('Új könyvet vagy mesegyűjteményt a GitHubon tudsz felvenni: a {link} oldalon bemásolod a MEK- vagy Gutenberg-linket. Bármilyen EPUB, TXT vagy PDF fájlt a könyvtárban a „Fájl megnyitása” gombbal is megnyithatsz.', { link: link(ADD_BOOK_URL, t('Könyv hozzáadása')) })}</p>`;

  const listEl = $('.browse-list', el);
  const dlBtn = $('[data-act="download"]', el);
  const langRank = (l) => (l === 'hu' ? 0 : l === 'en' ? 1 : 2);
  const wpm = () => settings().wpm;

  const itemRow = (b) => {
    const installed = have.has(b.id);
    const p = progress.get(b.id);
    const meta = b.short
      ? `${b.words < wpm() * 0.75 ? t('1 percnél rövidebb') : t('kb. {time}', { time: readingTime(b.words, wpm()) })}, ${t('{n} szó', { n: num(b.words) })}`
      : t('{n} ezer szó, kb. {time}', { n: Math.round(b.words / 1000), time: readingTime(b.words, wpm()) });
    const right = installed ? t('Letöltve') : b.short ? '' : `${mb(b.bytes)} MB`;
    return `<li class="brow ${installed ? 'installed' : ''}" data-id="${esc(b.id)}">
      <label>
        ${installed ? `<span class="brow-check done">${icon('check')}</span>` : `<input type="checkbox" ${state.picked.has(b.id) ? 'checked' : ''}><span class="brow-check" aria-hidden="true">${icon('check')}</span>`}
        <span class="brow-text"><span class="row-title">${esc(b.title)}</span>${b.short ? '' : `<span class="row-sub">${esc(b.author)}</span>`}<span class="brow-meta">${meta}</span></span>
        <span class="brow-size">${right}${p?.index ? `<br>${fmtPct(p.index, p.total)}` : ''}</span>
      </label></li>`;
  };

  const draw = () => {
    const q = state.q.toLowerCase();
    const items = cat.books.filter((b) => (state.lang === 'all' || b.lang === state.lang)
      && (state.type === 'all' || (state.type === 'short') === !!b.short)
      && (!b.short || state.genre === 'all' || b.genre === state.genre)
      && (!q || `${b.title} ${b.author} ${b.collection || ''}`.toLowerCase().includes(q)));
    const books = items.filter((b) => !b.short)
      .sort((a, b) => langRank(a.lang) - langRank(b.lang) || coll.compare(a.author, b.author) || coll.compare(a.title, b.title));
    const groups = new Map();
    for (const b of items.filter((x) => x.short)) {
      const key = `${b.lang}|${b.author}|${b.collection}`;
      if (!groups.has(key)) groups.set(key, { key, lang: b.lang, author: b.author, collection: b.collection, genre: b.genre, items: [] });
      groups.get(key).items.push(b);
    }
    const groupList = [...groups.values()].sort((a, b) => langRank(a.lang) - langRank(b.lang) || coll.compare(a.author, b.author) || coll.compare(a.collection, b.collection));

    const groupHtml = (g) => {
      g.items.sort((a, b) => (a.n ?? 0) - (b.n ?? 0));
      const mins = g.items.map((b) => Math.max(1, Math.round(b.words / wpm())));
      const lo = Math.min(...mins);
      const hi = Math.max(...mins);
      const range = lo === hi ? t('{m} perc', { m: lo }) : t('{a}–{b} perc', { a: lo, b: hi });
      const free = g.items.filter((b) => !have.has(b.id));
      const pickedHere = free.filter((b) => state.picked.has(b.id)).length;
      const done = g.items.length - free.length;
      const status = [pickedHere ? t('{n} kijelölve', { n: pickedHere }) : '', done ? t('{n} letöltve', { n: done }) : ''].filter(Boolean).join(', ');
      const countPhrase = (GENRES.find(([k]) => k === g.genre) || OTHER_GENRE)[1];
      const open = q || state.open.has(g.key);
      return `<details class="bgroup" data-group="${esc(g.key)}" ${open ? 'open' : ''}>
        <summary>
          <span class="brow-text"><span class="row-title">${esc(g.collection)}</span><span class="row-sub">${esc(g.author)}</span>
            <span class="brow-meta">${t('{count}, egyenként {range}', { count: t(countPhrase, { n: g.items.length }), range })}${status ? `; ${status}` : ''}</span></span>
          <span class="bgroup-chev" aria-hidden="true">${icon('back')}</span>
        </summary>
        ${free.length ? `<button type="button" class="btn small ghost bgroup-all" data-all="${esc(g.key)}">${pickedHere === free.length ? t('Kijelölés törlése') : t('Mindet kijelölöm')}</button>` : ''}
        <ul class="bgroup-items">${g.items.map(itemRow).join('')}</ul>
      </details>`;
    };

    const parts = [];
    if (groupList.length) parts.push(`${state.type === 'all' ? `<h2 class="browse-h">${t('Rövid szövegek')}</h2>` : ''}<div class="bgroups">${groupList.map(groupHtml).join('')}</div>`);
    if (books.length) parts.push(`${state.type === 'all' ? `<h2 class="browse-h">${t('Könyvek')}</h2>` : ''}<ul class="brows">${books.map(itemRow).join('')}</ul>`);
    listEl.innerHTML = parts.join('') || `<p class="empty">${t('Nincs találat.')}</p>`;
    listEl._groups = groups;
    dlBtn.disabled = !state.picked.size;
    $('span', dlBtn).textContent = state.picked.size ? t('Kijelöltek letöltése ({n})', { n: state.picked.size }) : t('Jelöld ki, amit letöltenél');
  };
  draw();

  el.querySelector('.browse-tools').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    const segEl = b?.closest('[data-seg]');
    if (!segEl) return;
    const name = segEl.dataset.seg;
    state[name] = b.dataset.v;
    if (name === 'lang') localStorage.setItem('jar.browseLang', b.dataset.v);
    if (name === 'type') {
      localStorage.setItem('jar.browseType', b.dataset.v);
      $('.genre-row', el).hidden = b.dataset.v === 'book';
    }
    segEl.querySelectorAll('[data-v]').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
    draw();
  };
  el.querySelector('input[type=search]').oninput = (e) => { state.q = e.target.value; draw(); };
  listEl.addEventListener('toggle', (e) => {
    const key = e.target.dataset?.group;
    if (!key || state.q) return;
    if (e.target.open) state.open.add(key); else state.open.delete(key);
  }, true);
  listEl.onclick = (e) => {
    const allBtn = e.target.closest('[data-all]');
    if (!allBtn) return;
    const g = listEl._groups.get(allBtn.dataset.all);
    const free = g.items.filter((b) => !have.has(b.id));
    const allPicked = free.every((b) => state.picked.has(b.id));
    for (const b of free) { if (allPicked) state.picked.delete(b.id); else state.picked.add(b.id); }
    state.open.add(g.key);
    draw();
  };
  listEl.onchange = (e) => {
    const id = e.target.closest('[data-id]')?.dataset.id;
    if (!id) return;
    if (e.target.checked) state.picked.add(id); else state.picked.delete(id);
    const groupKey = e.target.closest('[data-group]')?.dataset.group;
    if (groupKey) state.open.add(groupKey);
    draw();
  };
  dlBtn.onclick = async () => {
    const picked = cat.books.filter((b) => state.picked.has(b.id));
    dlBtn.disabled = true;
    let ok = 0;
    for (const [k, b] of picked.entries()) {
      $('span', dlBtn).textContent = t('Letöltés: {i} / {n}…', { i: k + 1, n: picked.length });
      try { await docs.downloadCatalogBook(b); have.add(b.id); state.picked.delete(b.id); ok++; } catch (err) { toast(errText(err), { ms: 6000 }); }
    }
    if (ok) toast(t('{n} letöltve. A könyvtárban találod.', { n: ok }), { action: t('Könyvtár'), onAction: () => { location.hash = '#/'; } });
    draw();
  };
}

// ---------------------------------------------------------------- editor
export async function renderEditor(el, id) {
  const existing = id ? await docs.getText(id) : null;
  if (id && !existing) { toast(t('Ez a szöveg már nincs meg.')); location.hash = '#/'; return; }
  el.innerHTML = `<header class="sub-head">${backLink()}<h1>${existing ? t('Szöveg szerkesztése') : t('Új szöveg')}</h1></header>
    <form class="editor">
      <input class="ed-title" name="title" placeholder="${t('Cím (ha üresen hagyod, az első sorból lesz)')}" value="${esc(existing?.item.title || '')}" autocomplete="off">
      <textarea name="text" placeholder="${t('Írd vagy másold be ide a szöveget.')}" spellcheck="false">${esc(existing?.text || '')}</textarea>
      <div class="ed-foot">
        <span class="ed-count"></span>
        <button type="button" class="btn ghost" data-act="paste">${icon('paste')}<span>${t('Beillesztés')}</span></button>
        <button type="submit" class="btn" data-act="save">${icon('save')}<span>${t('Mentés')}</span></button>
        <button type="submit" class="btn primary" data-act="read">${icon('play')}<span>${t('Mentés és olvasás')}</span></button>
      </div>
    </form>`;
  const form = $('form', el);
  const ta = form.elements.text;
  const count = () => { $('.ed-count', el).textContent = t('{n} szó', { n: num((ta.value.match(/\S+/g) || []).length) }); };
  count();
  ta.oninput = count;
  if (!existing) setTimeout(() => ta.focus(), 50);
  $('[data-act="paste"]', el).onclick = async () => {
    try {
      const clip = await navigator.clipboard.readText();
      if (!clip) { toast(t('A vágólap üres.')); return; }
      ta.setRangeText(clip, ta.selectionStart, ta.selectionEnd, 'end');
      count();
    } catch { toast(t('A böngésző nem engedte a beillesztést. Nyomd hosszan a szövegmezőt, és válaszd a Beillesztést.'), { ms: 5000 }); }
  };
  form.onsubmit = async (e) => {
    e.preventDefault();
    if (!ta.value.trim()) { toast(t('Írj vagy másolj be valamennyi szöveget.')); return; }
    const newId = await docs.saveText({ id, title: form.elements.title.value, text: ta.value });
    if (e.submitter?.dataset.act === 'read') openReader(newId);
    else { toast(existing ? t('Szöveg mentve.') : t('Szöveg hozzáadva.')); location.hash = '#/'; }
  };
}

// ---------------------------------------------------------------- settings
let disposeSettings = null;
export async function renderSettings(el) {
  disposeSettings?.forEach((d) => d());
  const installBlock = isInstalledApp()
    ? `<p class="note">${t('Telepített alkalmazásként fut: saját ikonról indul, teljes képernyőn, címsor nélkül.')}</p>`
    : `<p class="note">${t('Telepítve saját ikonról indul „Just A Reader” néven, teljes képernyőn, a böngésző címsora és a webcím nélkül, internet nélkül is.')}</p>
        <button type="button" class="btn primary" data-act="install" ${canInstall() ? '' : 'hidden'}>${icon('download')}<span>${t('Alkalmazás telepítése')}</span></button>
        <p class="note install-manual" ${canInstall() ? 'hidden' : ''}>${t('Chrome-ban: jobb felső ⋮ menü → <b>Alkalmazás telepítése</b> (vagy <b>Hozzáadás a kezdőképernyőhöz</b>).')}</p>`;
  el.innerHTML = `<header class="sub-head">${backLink('data-act="back"')}<h1>${t('Beállítások')}</h1></header>
    <div class="settings">
      <section><h2>Nyelv / Language</h2><div class="controls" data-group="lang"></div></section>
      <section><h2>${t('Megjelenés')}</h2>
        <div class="preview" aria-hidden="true"><span class="hero-word">${focusWord(t('Gárdonyi'))}</span></div>
        <div class="controls" data-group="look"></div></section>
      <section><h2>${t('Olvasás')}</h2><div class="controls" data-group="read"></div></section>
      <section><h2>${t('Fokozatos gyorsítás')}</h2><div class="controls" data-group="train"></div></section>
      <section><h2>${t('Vezérlés')}</h2><div class="controls" data-group="control"></div></section>
      <section><h2>${t('Mentés és visszatöltés')}</h2>
        <p class="note">${t('Minden adatod csak ezen a telefonon van. Mentsd el fájlba a saját szövegeidet, a haladásodat és a beállításaidat, és ha törlődnének, ebből visszatöltheted.')}</p>
        <label class="ctl ctl-toggle"><span class="ctl-text"><span>${t('A letöltött könyveket is tegye bele')}</span><small class="hint">${t('Nagyobb lesz a fájl. Nélkülük is megmarad, hol tartasz, és újra letöltve onnan folytatod.')}</small></span><input type="checkbox" id="bk-books" role="switch"><span class="switch" aria-hidden="true"></span></label>
        <div class="btn-row">
          <button type="button" class="btn" data-act="export">${icon('download')}<span>${t('Mentés fájlba')}</span></button>
          <button type="button" class="btn" data-act="import">${icon('file')}<span>${t('Visszatöltés fájlból')}</span></button>
          <input type="file" id="bk-file" accept=".json,application/json" hidden>
        </div>
        <p class="note storage"></p>
      </section>
      <section><h2>${t('Alkalmazás')}</h2>${installBlock}</section>
      <section><h2>${t('Névjegy')}</h2>
        <p class="note">${t('Just A Reader, {v}. A beépített könyvek közkincsek, a {mek}, a {se} és a Project Gutenberg gyűjteményéből származnak.', { v: esc(document.documentElement.dataset.version || ''), mek: link('https://mek.oszk.hu', t('Magyar Elektronikus Könyvtár')), se: link('https://standardebooks.org', 'Standard Ebooks') })}</p>
        <p class="note">${t('{src}, új könyvet a {add} oldalon vehetsz fel a katalógusba.', { src: link(REPO_URL, t('Forráskód a GitHubon')), add: link(ADD_BOOK_URL, t('Könyv hozzáadása')) })}</p>
        <button type="button" class="btn ghost" data-act="help">${icon('help')}<span>${t('Gesztusok súgója az olvasóban')}</span></button>
      </section>
    </div>`;
  disposeSettings = [
    renderControls($('[data-group="lang"]', el), ['lang']),
    renderControls($('[data-group="look"]', el), ['theme', 'font', 'fontSize', 'bold', 'bg', 'fg', 'pivot', 'orp', 'guides', 'cornerInfo', 'contextLine']),
    renderControls($('[data-group="read"]', el), ['wpm', 'chunk', 'smartPauses', 'pauseStrength', 'ramp']),
    renderControls($('[data-group="train"]', el), ['train', 'trainStep', 'trainEvery', 'trainMax']),
    renderControls($('[data-group="control"]', el), ['orientation', 'fullscreen', 'swipeBack', 'haptics', 'tvMode']),
  ];
  try {
    const est = await navigator.storage?.estimate?.();
    if (est?.usage) $('.storage', el).textContent = t('Tárhely: {mb} MB használatban.', { mb: mb(est.usage) });
  } catch { /* optional */ }
  // Chrome may offer installation only after the page has rendered.
  const syncInstall = () => {
    const btn = $('.settings [data-act="install"]', el);
    const manual = $('.install-manual', el);
    if (btn) btn.hidden = !canInstall();
    if (manual) manual.hidden = canInstall();
  };
  el._offInstall?.();
  el._offInstall = onInstallChange(syncInstall);
  syncInstall();
  const back = $('[data-act="back"]', el);
  back.onclick = (e) => { if (history.length > 1) { e.preventDefault(); history.back(); } };
  el.onclick = async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'export') {
      const data = await docs.exportBackup({ withBooks: $('#bk-books', el).checked });
      downloadBlob(new Blob([JSON.stringify(data)], { type: 'application/json' }), `${t('just-a-reader-mentes')}-${new Date().toLocaleDateString('sv')}.json`);
      toast(t('Mentés kész. A Letöltések mappában találod.'));
    } else if (act === 'import') $('#bk-file', el).click();
    else if (act === 'help') { update({ helpSeen: false }); toast(t('A következő megnyitáskor az olvasó megmutatja a gesztusokat.')); }
    else if (act === 'install') {
      if (await installApp()) { toast(t('Telepítve. Ezentúl a „Just A Reader” ikonról indítsd.'), { ms: 6000 }); renderSettings(el); }
    }
  };
  $('#bk-file', el).onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const r = await docs.importBackup(JSON.parse(await f.text()));
      const missing = r.missingBooks.length ? ` ${t('{n} könyvet tölts le újra a böngészőben, a haladásod megvan.', { n: r.missingBooks.length })}` : '';
      toast(t('Visszatöltve: {n} szöveg/könyv.', { n: r.restored }) + missing, { ms: 7000 });
      renderSettings(el);
    } catch (err) { toast(t('A visszatöltés nem sikerült: {msg}', { msg: errText(err) }), { ms: 6000 }); }
  };
}

// ---------------------------------------------------------------- stats
export async function renderStats(el) {
  const days = (await db.getAll('stats')).sort((a, b) => (a.day < b.day ? 1 : -1));
  const todayKey = new Date().toLocaleDateString('sv');
  const sum = (arr) => arr.reduce((acc, d) => ({ words: acc.words + d.words, ms: acc.ms + d.ms }), { words: 0, ms: 0 });
  const weekAgo = new Date(Date.now() - 6 * 86400000).toLocaleDateString('sv');
  const today = sum(days.filter((d) => d.day === todayKey));
  const week = sum(days.filter((d) => d.day >= weekAgo));
  const all = sum(days);
  const mins = (ms) => Math.round(ms / 60000);
  const avg = (s) => (s.ms ? Math.round(s.words / (s.ms / 60000)) : 0);
  const block = (label, s) => `<div class="stat"><span class="stat-label">${label}</span><span class="stat-num">${num(s.words)}</span><span class="stat-sub">${t('szó, {m} perc', { m: mins(s.ms) })}${s.ms ? t(', átlag {n} szó/perc', { n: avg(s) }) : ''}</span></div>`;
  const dayName = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(lang() === 'en' ? 'en-GB' : 'hu-HU', { year: 'numeric', month: 'short', day: 'numeric', weekday: 'short' });
  el.innerHTML = `<header class="sub-head">${backLink()}<h1>${t('Statisztika')}</h1></header>
    <div class="stats">
      ${block(t('Ma'), today)}${block(t('Az elmúlt 7 napban'), week)}${block(t('Összesen'), all)}
      <h2>${t('Napok')}</h2>
      ${days.length ? `<table class="days"><tbody>${days.slice(0, 30).map((d) => `<tr><td>${dayName(d.day)}</td><td>${t('{n} szó', { n: num(d.words) })}</td><td>${t('{m} perc', { m: mins(d.ms) })}</td></tr>`).join('')}</tbody></table>` : `<p class="empty">${t('Még nincs olvasási adat. Ha olvasol, itt látod, mennyit haladtál.')}</p>`}
    </div>`;
}

// Settings controls rendered from a schema; shared by the settings page and
// the reader's quick menu so both stay in sync.
import { settings, update, onChange, THEMES, FONTS, WPM_MIN, WPM_MAX } from './settings.js';
import { esc } from './ui.js';

export const SCHEMA = {
  wpm: { label: 'Sebesség', type: 'range', min: WPM_MIN, max: WPM_MAX, step: 10, fmt: (v) => `${v} szó/perc` },
  chunk: { label: 'Szavak villanásonként', type: 'seg', options: [[1, '1'], [2, '2'], [3, '3']] },
  theme: { label: 'Téma', type: 'theme' },
  font: { label: 'Betűtípus', type: 'select', options: Object.entries(FONTS).map(([k, v]) => [k, v.name]) },
  fontSize: { label: 'Betűméret', type: 'range', min: 24, max: 160, step: 2, fmt: (v) => `${v} px` },
  bold: { label: 'Félkövér betű', type: 'toggle' },
  bg: { label: 'Háttér színe', type: 'color' },
  fg: { label: 'Betű színe', type: 'color' },
  pivot: { label: 'Fókuszbetű színe', type: 'color' },
  orp: { label: 'Fókuszbetű kiemelése', type: 'toggle', hint: 'A szó egyik betűje színes, és mindig ugyanott áll, így nem kell mozgatnod a szemed.' },
  guides: { label: 'Segédvonalak a szó fölött és alatt', type: 'toggle' },
  smartPauses: { label: 'Okos szünetek', type: 'toggle', hint: 'Mondat végén, vesszőnél és hosszú szónál a szó tovább marad kint.' },
  pauseStrength: { label: 'Szünetek hossza', type: 'range', min: 0.5, max: 2.5, step: 0.1, fmt: (v) => `${Number(v).toFixed(1)}×` },
  ramp: { label: 'Lassú indulás', type: 'toggle', hint: 'Indításkor az első néhány szó lassabban jön.' },
  train: { label: 'Fokozatos gyorsítás', type: 'toggle', hint: 'Olvasás közben magától gyorsul, amíg el nem éri a felső határt.' },
  trainStep: { label: 'Ennyivel gyorsul', type: 'range', min: 5, max: 50, step: 5, fmt: (v) => `+${v} szó/perc` },
  trainEvery: { label: 'Ilyen gyakran', type: 'range', min: 30, max: 300, step: 30, fmt: (v) => `${v} másodpercenként` },
  trainMax: { label: 'Felső határ', type: 'range', min: 200, max: WPM_MAX, step: 10, fmt: (v) => `${v} szó/perc` },
  cornerInfo: { label: 'Sebesség és szószám a sarkokban', type: 'toggle' },
  contextLine: { label: 'Mondat mutatása megállításkor', type: 'toggle' },
  orientation: { label: 'Tájolás olvasáskor', type: 'seg', options: [['landscape', 'Fekvő'], ['portrait', 'Álló'], ['auto', 'Automatikus']] },
  fullscreen: { label: 'Teljes képernyő olvasáskor', type: 'toggle' },
  swipeBack: { label: 'Visszatekerés', type: 'seg', options: [['left', 'Balra legyintés'], ['right', 'Jobbra legyintés']] },
  haptics: { label: 'Rezgés legyintéskor', type: 'toggle' },
  tvMode: { label: 'TV-mód', type: 'toggle', hint: 'Nagyobb betű, sarokinfó és mondat, hogy képernyő-tükrözéskor a TV-n messziről is jól olvasható legyen.' },
};

function controlHtml(key) {
  const c = SCHEMA[key];
  const v = settings()[key];
  const id = `c-${key}-${Math.random().toString(36).slice(2, 7)}`;
  const hint = c.hint ? `<small class="hint">${esc(c.hint)}</small>` : '';
  switch (c.type) {
    case 'range':
      return `<div class="ctl ctl-range" data-key="${key}">
        <label for="${id}"><span>${esc(c.label)}</span><output>${esc(c.fmt(v))}</output></label>
        <div class="range-row">
          <button type="button" class="step" data-step="-1" aria-label="Kevesebb">−</button>
          <input id="${id}" type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${v}">
          <button type="button" class="step" data-step="1" aria-label="Több">+</button>
        </div>${hint}</div>`;
    case 'toggle':
      return `<label class="ctl ctl-toggle" data-key="${key}" for="${id}">
        <span class="ctl-text"><span>${esc(c.label)}</span>${hint}</span>
        <input id="${id}" type="checkbox" role="switch" ${v ? 'checked' : ''}><span class="switch" aria-hidden="true"></span></label>`;
    case 'seg':
      return `<div class="ctl ctl-seg" data-key="${key}"><span class="ctl-label">${esc(c.label)}</span>
        <div class="seg" role="radiogroup" aria-label="${esc(c.label)}">${c.options.map(([ov, ol]) =>
          `<button type="button" role="radio" aria-checked="${String(ov) === String(v)}" data-v="${esc(ov)}">${esc(ol)}</button>`).join('')}</div>${hint}</div>`;
    case 'select':
      return `<div class="ctl ctl-select" data-key="${key}"><label for="${id}">${esc(c.label)}</label>
        <select id="${id}">${c.options.map(([ov, ol]) => `<option value="${esc(ov)}" ${ov === v ? 'selected' : ''}>${esc(ol)}</option>`).join('')}</select></div>`;
    case 'color':
      return `<label class="ctl ctl-color" data-key="${key}" for="${id}"><span>${esc(c.label)}</span><input id="${id}" type="color" value="${esc(v)}"></label>`;
    case 'theme':
      return `<div class="ctl ctl-theme" data-key="theme"><span class="ctl-label">${esc(c.label)}</span>
        <div class="swatches">${Object.entries(THEMES).map(([k, t]) =>
          `<button type="button" class="swatch" data-v="${k}" aria-pressed="${settings().theme === k}" style="--sb:${t.bg};--sf:${t.fg};--sp:${t.pivot}">
            <span class="sw-word">s<b>z</b>ó</span><span class="sw-name">${esc(t.name)}</span></button>`).join('')}</div></div>`;
    default: return '';
  }
}

const parse = (key, raw) => {
  const c = SCHEMA[key];
  if (c.type === 'range') return Number(raw);
  if (c.type === 'seg') return typeof c.options[0][0] === 'number' ? Number(raw) : raw;
  return raw;
};

/** Render controls for `keys` into container. Returns an unsubscribe function. */
export function renderControls(container, keys) {
  container.innerHTML = keys.map(controlHtml).join('');
  const sync = () => {
    const s = settings();
    for (const el of container.querySelectorAll('[data-key]')) {
      const key = el.dataset.key;
      const c = SCHEMA[key];
      const v = s[key];
      if (c.type === 'range') {
        const input = el.querySelector('input');
        if (document.activeElement !== input) input.value = v;
        el.querySelector('output').textContent = c.fmt(v);
      } else if (c.type === 'toggle') el.querySelector('input').checked = !!v;
      else if (c.type === 'seg') el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.v === String(v))));
      else if (c.type === 'select' || c.type === 'color') el.querySelector(c.type === 'select' ? 'select' : 'input').value = v;
      else if (c.type === 'theme') el.querySelectorAll('[data-v]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === s.theme)));
    }
  };
  container.addEventListener('input', (e) => {
    const el = e.target.closest('[data-key]');
    if (!el) return;
    const key = el.dataset.key;
    const t = SCHEMA[key].type;
    if (t === 'range') el.querySelector('output').textContent = SCHEMA[key].fmt(Number(e.target.value));
    if (t === 'range' || t === 'color') update({ [key]: parse(key, e.target.value) });
  });
  container.addEventListener('change', (e) => {
    const el = e.target.closest('[data-key]');
    if (!el) return;
    const key = el.dataset.key;
    const t = SCHEMA[key].type;
    if (t === 'toggle') update({ [key]: e.target.checked });
    else if (t === 'select') update({ [key]: e.target.value });
  });
  container.addEventListener('click', (e) => {
    const el = e.target.closest('[data-key]');
    if (!el) return;
    const key = el.dataset.key;
    const c = SCHEMA[key];
    const stepBtn = e.target.closest('[data-step]');
    if (stepBtn && c.type === 'range') {
      const v = Math.min(c.max, Math.max(c.min, +(settings()[key] + Number(stepBtn.dataset.step) * c.step).toFixed(2)));
      update({ [key]: v });
      return;
    }
    const opt = e.target.closest('[data-v]');
    if (opt && (c.type === 'seg' || c.type === 'theme')) update({ [key]: parse(key, opt.dataset.v) });
  });
  return onChange(sync);
}

// DOM helpers: escaping, toast, confirm dialog, action sheet.
import { icon } from './icons.js';
import { t } from './i18n.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg, { action, onAction, ms = 3200 } = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${action ? `<button type="button">${esc(action)}</button>` : ''}`;
  el.hidden = false;
  el.classList.add('show');
  if (action) el.querySelector('button').onclick = () => { hide(); onAction?.(); };
  clearTimeout(toastTimer);
  const hide = () => { el.classList.remove('show'); el.hidden = true; };
  toastTimer = setTimeout(hide, ms);
}

/** Modal confirm. Resolves true/false. */
export function ask(message, { ok = t('Rendben'), cancel = t('Mégse'), danger = false } = {}) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.innerHTML = `<div class="modal" role="dialog" aria-modal="true">
      <p>${esc(message)}</p>
      <div class="modal-actions">
        <button type="button" class="btn ghost" data-v="0">${esc(cancel)}</button>
        <button type="button" class="btn ${danger ? 'danger' : 'primary'}" data-v="1">${esc(ok)}</button>
      </div></div>`;
    const done = (v) => { wrap.remove(); resolve(v); };
    wrap.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-v]');
      if (b) done(b.dataset.v === '1');
      else if (e.target === wrap) done(false);
    });
    document.body.append(wrap);
    wrap.querySelector('[data-v="1"]').focus();
  });
}

/** Bottom action sheet. actions: [{label, icon, danger, run}] */
export function sheet(title, actions) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-wrap sheet-wrap';
  wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true">
    ${title ? `<h3>${esc(title)}</h3>` : ''}
    ${actions.map((a, i) => `<button type="button" class="sheet-item ${a.danger ? 'danger' : ''}" data-i="${i}">${a.icon ? icon(a.icon) : ''}<span>${esc(a.label)}</span></button>`).join('')}
  </div>`;
  wrap.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (b) { wrap.remove(); actions[Number(b.dataset.i)].run(); } else if (e.target === wrap) wrap.remove();
  });
  document.body.append(wrap);
}

export function fmtPct(index, total) {
  if (!total) return '0%';
  if (index >= total - 1) return '100%';
  return `${Math.floor((index / total) * 100)}%`;
}


export function vibrate(ms) {
  try { navigator.vibrate?.(ms); } catch { /* not supported */ }
}

export function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

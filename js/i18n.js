// UI language: Hungarian source strings are the keys; English lives in js/i18n-en.js.
//   t('Saját szövegek')            → "My texts"
//   t('{n} szó', { n: 3 })         → "3 words"   (English "one||many" plural forms)
import { settings } from './settings.js';
import { EN } from './i18n-en.js';

export function lang() {
  const l = settings().lang || 'auto';
  if (l === 'hu' || l === 'en') return l;
  return /^hu\b/i.test(navigator.language || '') ? 'hu' : 'en';
}

export function t(key, vars) {
  let s = lang() === 'en' ? (EN[key] ?? key) : key;
  if (s.includes('||')) {
    const n = Number(String(vars?.n ?? '').replace(/[^\d.-]/g, ''));
    const [one, many] = s.split('||');
    s = n === 1 ? one : many;
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Translate an error from the core modules (they carry key/vars) or show its message. */
export const errText = (err) => t(err?.key || err?.message || String(err), err?.vars);

const locale = () => (lang() === 'en' ? 'en-US' : 'hu-HU');
export const num = (n) => new Intl.NumberFormat(locale()).format(n);
export const dec1 = (n) => new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
export const mb = (bytes) => dec1(bytes / 1048576);

/** Short duration for the reader corner: "~2 ó 15 p" / "~2 h 15 min". */
export function shortDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return t('<1 p');
  if (m < 60) return t('{m} p', { m });
  return t('{h} ó {m} p', { h: Math.floor(m / 60), m: m % 60 });
}

/** Reading time for lists: "7 perc", "2 óra 15 perc". */
export function readingTime(words, wpm) {
  const m = Math.round(words / wpm);
  if (m < 60) return t('{m} perc', { m: Math.max(1, m) });
  const h = Math.floor(m / 60);
  return m % 60 ? t('{h} óra {m} perc', { h, m: m % 60 }) : t('{h} óra', { h });
}

/** Apply language to static DOM bits (html lang, aria labels outside the views). */
export function applyLangToDom() {
  document.documentElement.lang = lang();
  document.querySelector('#r-menu-btn')?.setAttribute('aria-label', t('Menü'));
  document.querySelector('#v-reader')?.setAttribute('aria-label', t('Olvasó'));
}

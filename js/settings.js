// Settings: defaults, themes, persistence, and applying them as CSS variables.

export const THEMES = {
  ejkek: { name: 'Éjkék', bg: '#161a33', fg: '#ece6d6', pivot: '#f4b63f' },
  amoled: { name: 'AMOLED', bg: '#000000', fg: '#b9b9b9', pivot: '#ff5a4f' },
  papir: { name: 'Papír', bg: '#eef0ec', fg: '#1d2430', pivot: '#b4235a' },
  szepia: { name: 'Szépia', bg: '#efe2c6', fg: '#3b2a17', pivot: '#a0401c' },
  erdo: { name: 'Erdő', bg: '#12261e', fg: '#dfe9d8', pivot: '#e9a23b' },
  kontraszt: { name: 'Kontraszt', bg: '#000000', fg: '#ffe14d', pivot: '#4dd8ff' },
};

export const FONTS = {
  literata: { name: 'Literata', css: "'Literata', 'Noto Serif', Georgia, serif" },
  atkinson: { name: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible', 'Roboto', system-ui, sans-serif" },
  sans: { name: 'Rendszer (sans)', css: "system-ui, 'Roboto', 'Segoe UI', sans-serif" },
  serif: { name: 'Rendszer (serif)', css: "'Noto Serif', Georgia, 'Times New Roman', serif" },
  mono: { name: 'Írógép (mono)', css: "'Roboto Mono', 'Droid Sans Mono', 'Cascadia Mono', monospace" },
};

export const DEFAULTS = {
  wpm: 300,
  chunk: 1,
  orp: true,
  guides: true,
  smartPauses: true,
  pauseStrength: 1,
  ramp: true,
  train: false,
  trainStep: 10,
  trainEvery: 60,
  trainMax: 600,
  theme: 'ejkek',
  bg: THEMES.ejkek.bg,
  fg: THEMES.ejkek.fg,
  pivot: THEMES.ejkek.pivot,
  font: 'literata',
  fontSize: 64,
  bold: false,
  cornerInfo: true,
  contextLine: true,
  orientation: 'landscape',
  fullscreen: true,
  swipeBack: 'left', // finger moves left = go back
  haptics: true,
  tvMode: false,
  lang: 'auto',
  firstRunDone: false,
  helpSeen: false,
};

const KEY = 'jar.settings';
let current = load();
const listeners = new Set();

function load() {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULTS }; }
}

export const settings = () => current;

export function update(patch) {
  if (patch.theme && THEMES[patch.theme]) Object.assign(patch, { bg: THEMES[patch.theme].bg, fg: THEMES[patch.theme].fg, pivot: THEMES[patch.theme].pivot });
  if (('bg' in patch || 'fg' in patch || 'pivot' in patch) && !patch.theme) patch.theme = 'custom';
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  apply();
  for (const fn of listeners) fn(current, patch);
}

export function replaceAll(obj) {
  current = { ...DEFAULTS, ...obj };
  localStorage.setItem(KEY, JSON.stringify(current));
  apply();
  for (const fn of listeners) fn(current, obj);
}

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

export function apply() {
  const s = current;
  const r = document.documentElement.style;
  r.setProperty('--bg', s.bg);
  r.setProperty('--fg', s.fg);
  r.setProperty('--pivot', s.pivot);
  r.setProperty('--word-font', (FONTS[s.font] || FONTS.literata).css);
  r.setProperty('--word-size', `${wordPx(s)}px`);
  document.documentElement.dataset.tv = String(!!s.tvMode);
  r.setProperty('--word-weight', s.bold ? '700' : '400');
  document.documentElement.dataset.light = String(luminance(s.bg) > 0.5);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', s.bg);
}

function luminance(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}

/** Word size on screen: TV mode enlarges it for reading from the sofa. */
export const wordPx = (s) => Math.round(s.fontSize * (s.tvMode ? 1.35 : 1));

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
export const WPM_MIN = 60;
export const WPM_MAX = 1500;

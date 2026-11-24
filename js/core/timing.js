// How long each flash stays on screen, where the focus letter sits, chunking.
import { F_SENT, F_CLAUSE, F_PARA, sentenceStart } from './tokenize.js';

const WORDCHAR = /[\p{L}\p{N}]/u;

export function letterCount(w) {
  let n = 0;
  for (const ch of w) if (WORDCHAR.test(ch)) n++;
  return n;
}

/** Optimal recognition point: index (in UTF-16 units) of the focus letter. */
export function orpIndex(word) {
  const chars = [...word];
  let first = chars.findIndex((c) => WORDCHAR.test(c));
  if (first < 0) first = 0;
  let last = chars.length - 1;
  while (last > first && !WORDCHAR.test(chars[last])) last--;
  const len = last - first + 1;
  const k = len <= 1 ? 0 : len <= 5 ? 1 : len <= 9 ? 2 : len <= 13 ? 3 : 4;
  // Convert code-point index to UTF-16 index.
  return chars.slice(0, first + k).join('').length;
}

/** Number of words to show in the flash starting at i (never crosses a pause point). */
export function chunkAt(words, flags, i, size, maxChars = 18) {
  if (size <= 1 || i >= words.length - 1) return 1;
  let n = 1;
  let chars = words[i].length;
  while (n < size && i + n < words.length) {
    if (flags[i + n - 1] & (F_SENT | F_CLAUSE | F_PARA)) break;
    const add = words[i + n].length + 1;
    if (chars + add > maxChars) break;
    chars += add;
    n++;
  }
  return n;
}

/** Start index of the flash before the one starting at i (respects chunking). */
export function prevChunkStart(words, flags, i, size) {
  if (i <= 0) return 0;
  if (size <= 1) return i - 1;
  let j = sentenceStart(flags, i - 1);
  let prev = j;
  while (j < i) {
    prev = j;
    j += chunkAt(words, flags, j, size);
  }
  return prev;
}

/**
 * Milliseconds for the flash of n words starting at i.
 * settings: { wpm, smartPauses, pauseStrength }
 */
export function delayFor(words, flags, i, n, settings) {
  const base = 60000 / settings.wpm;
  const ms = base * n;
  if (!settings.smartPauses) return ms;
  const lastIdx = Math.min(i + n - 1, flags.length - 1);
  const f = flags[lastIdx];
  const k = settings.pauseStrength ?? 1;
  let extra = 0;
  if (f & F_PARA) extra = 1.6;
  else if (f & F_SENT) extra = 1.1;
  else if (f & F_CLAUSE) extra = 0.5;
  let len = 0;
  for (let j = i; j <= lastIdx; j++) len = Math.max(len, letterCount(words[j]));
  const longWord = len > 8 ? Math.min(0.8, (len - 8) * 0.07) : 0;
  const digits = /\d/.test(words[i]) ? 0.25 : 0;
  return ms + base * (extra * k + longWord + digits);
}

/** Speed multiplier for the k-th flash after (re)starting: gentle ramp-up. */
export function rampFactor(k, steps = 6) {
  return k >= steps ? 1 : 0.55 + 0.45 * (k / steps);
}

/** Average ms per word for the given settings, sampled across the text. */
export function averageMsPerWord(words, flags, settings) {
  const n = words.length;
  if (!n) return 60000 / settings.wpm;
  const samples = Math.min(n, 4000);
  const stride = n / samples;
  let total = 0;
  for (let s = 0; s < samples; s++) total += delayFor(words, flags, Math.floor(s * stride), 1, settings);
  return total / samples;
}

export function formatDuration(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return '<1 p';
  if (m < 60) return `${m} p`;
  return `${Math.floor(m / 60)} ó ${m % 60} p`;
}

export function formatNumber(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

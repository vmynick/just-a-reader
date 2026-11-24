// Chapters → flat word list with sentence / clause / paragraph flags.

export const F_SENT = 1; // last word of a sentence
export const F_CLAUSE = 2; // comma, semicolon, colon, dash, mid-sentence ellipsis
export const F_PARA = 4; // last word of a paragraph

const HAS_WORDCHAR = /[\p{L}\p{N}]/u;
const DASH_ONLY = /^[–—-]+$/;
const OPENERS_ONLY = /^[„“"'«»‘‚(\[{¿¡]+$/;
const NEXT_LOWER = /^[^\p{L}\p{N}]*\p{Ll}/u;
const TRAILING_CLOSERS = /[\s"'”’»«)\]}*]+$/u;
const ABBR = new Set([
  'mr', 'mrs', 'ms', 'dr', 'st', 'prof', 'sr', 'jr', 'vs', 'etc', 'id', 'ifj', 'özv', 'gr', 'br',
  'stb', 'pl', 'kb', 'ill', 'ún', 'sz', 'ld', 'vö', 'uo', 'jan', 'febr', 'márc', 'ápr', 'jún',
  'júl', 'aug', 'szept', 'okt', 'nov', 'dec', 'no', 'nr', 'co', 'inc', 'ltd', 'lt', 'gen', 'capt',
  'col', 'rev', 'fr', 'mt', 'mme', 'mlle', 'messrs', 'esq', 'hon', 'sgt', 'cpl', 'gov', 'pres',
]);

/** Merge punctuation-only tokens into their neighbours ("–", "„", "…"). */
export function splitWords(para) {
  const raw = para.split(/\s+/).filter(Boolean);
  const out = [];
  let prefix = '';
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (HAS_WORDCHAR.test(t)) { out.push(prefix + t); prefix = ''; continue; }
    const last = i === raw.length - 1;
    if (!last && (DASH_ONLY.test(t) || OPENERS_ONLY.test(t))) {
      prefix += t + (DASH_ONLY.test(t) ? ' ' : '');
      continue;
    }
    if (out.length && !prefix) { out[out.length - 1] += (DASH_ONLY.test(t) ? ' ' : '') + t; continue; }
    prefix += `${t} `;
  }
  if (prefix) {
    if (out.length) out[out.length - 1] += ` ${prefix.trim()}`;
    else out.push(prefix.replace(/ $/, '').trim()); // "* * *" scene break
  }
  return out;
}

function flagFor(word, next) {
  const core = word.replace(TRAILING_CLOSERS, '');
  const end = core.slice(-1);
  const nextLower = !!next && NEXT_LOWER.test(next);
  if (end === '!' || end === '?' || end === '…') return nextLower ? F_CLAUSE : F_SENT;
  if (end === '.') {
    if (!next) return F_SENT;
    if (nextLower) return 0; // "1848. március", "stb. után"
    const stem = core.slice(0, -1).replace(/^[^\p{L}\p{N}]+/u, '').toLowerCase();
    if (ABBR.has(stem) || /^\p{L}$/u.test(stem)) return 0; // "Mr. Smith", "J. R."
    return F_SENT;
  }
  if (end === ',' || end === ';' || end === ':') return F_CLAUSE;
  if (next && /^[–—]/.test(next)) return F_CLAUSE;
  if (/[–—]$/.test(word)) return F_CLAUSE;
  return 0;
}

/**
 * @param {{title?: string, text: string}[]} chapters
 * @returns {{words: string[], flags: Uint8Array, chapterStarts: number[], chapterTitles: string[]}}
 */
export function tokenize(chapters) {
  const words = [];
  const flags = [];
  const chapterStarts = [];
  const chapterTitles = [];
  for (const ch of chapters) {
    const start = words.length;
    for (const para of String(ch.text || '').split(/\n+/)) {
      const toks = splitWords(para);
      if (!toks.length) continue;
      for (let i = 0; i < toks.length; i++) {
        words.push(toks[i]);
        flags.push(flagFor(toks[i], toks[i + 1]));
      }
      flags[flags.length - 1] |= F_PARA | F_SENT;
    }
    if (words.length > start) { chapterStarts.push(start); chapterTitles.push(ch.title || ''); }
  }
  return { words, flags: Uint8Array.from(flags), chapterStarts, chapterTitles };
}

export function sentenceStart(flags, i) {
  let j = Math.max(0, Math.min(i, flags.length - 1));
  while (j > 0 && !(flags[j - 1] & F_SENT)) j--;
  return j;
}

export function sentenceEnd(flags, i) {
  let j = Math.max(0, Math.min(i, flags.length - 1));
  while (j < flags.length - 1 && !(flags[j] & F_SENT)) j++;
  return j;
}

/** One swipe back: to the start of this sentence, or the previous one if we just started it. */
export function prevSentenceStart(flags, i) {
  const s = sentenceStart(flags, i);
  if (i - s >= 3) return s;
  return s > 0 ? sentenceStart(flags, s - 1) : 0;
}

export function nextSentenceStart(flags, i) {
  const e = sentenceEnd(flags, i);
  return Math.min(e + 1, flags.length - 1);
}

export function paragraphRange(flags, i) {
  let s = Math.max(0, Math.min(i, flags.length - 1));
  while (s > 0 && !(flags[s - 1] & F_PARA)) s--;
  let e = s;
  while (e < flags.length - 1 && !(flags[e] & F_PARA)) e++;
  return [s, e];
}

export function chapterAt(chapterStarts, i) {
  let lo = 0;
  let hi = chapterStarts.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (chapterStarts[mid] <= i) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

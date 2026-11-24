// HTML / XHTML → text blocks without a DOM, so the same code runs in the
// browser (file import) and in Node (catalog tool, tests).

const NAMED = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", ndash: '–', mdash: '—',
  hellip: '…', lsquo: '‘', rsquo: '’', sbquo: '‚', ldquo: '“', rdquo: '”', bdquo: '„',
  laquo: '«', raquo: '»', lsaquo: '‹', rsaquo: '›', shy: '', zwnj: '', zwj: '', lrm: '', rlm: '',
  thinsp: ' ', ensp: ' ', emsp: ' ', hairsp: ' ', copy: '©', reg: '®', trade: '™', deg: '°',
  middot: '·', bull: '•', minus: '−', prime: '′', Prime: '″', sect: '§', para: '¶',
  dagger: '†', Dagger: '‡', euro: '€', pound: '£', cent: '¢', yen: '¥', iexcl: '¡',
  iquest: '¿', frac12: '½', frac14: '¼', frac34: '¾', sup1: '¹', sup2: '²', sup3: '³',
  ordf: 'ª', ordm: 'º', micro: 'µ', plusmn: '±', not: '¬', macr: '¯', acute: '´',
  cedil: '¸', uml: '¨', brvbar: '¦', curren: '¤', larr: '←', rarr: '→', uarr: '↑', darr: '↓',
  odblac: 'ő', Odblac: 'Ő', udblac: 'ű', Udblac: 'Ű', oelig: 'œ', OElig: 'Œ',
  scaron: 'š', Scaron: 'Š', zcaron: 'ž', Zcaron: 'Ž', ccaron: 'č', Ccaron: 'Č',
  rcaron: 'ř', Rcaron: 'Ř', ecaron: 'ě', Ecaron: 'Ě', dcaron: 'ď', tcaron: 'ť', ncaron: 'ň',
  lstrok: 'ł', Lstrok: 'Ł', imath: 'ı', fnof: 'ƒ', circ: 'ˆ', tilde: '˜',
};
'Agrave Aacute Acirc Atilde Auml Aring AElig Ccedil Egrave Eacute Ecirc Euml Igrave Iacute Icirc Iuml ETH Ntilde Ograve Oacute Ocirc Otilde Ouml times Oslash Ugrave Uacute Ucirc Uuml Yacute THORN szlig agrave aacute acirc atilde auml aring aelig ccedil egrave eacute ecirc euml igrave iacute icirc iuml eth ntilde ograve oacute ocirc otilde ouml divide oslash ugrave uacute ucirc uuml yacute thorn yuml'
  .split(' ').forEach((name, i) => { NAMED[name] = String.fromCharCode(0xc0 + i); });

export function decodeEntities(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === '#') {
      const cp = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!cp || cp > 0x10ffff) return '';
      return String.fromCodePoint(cp);
    }
    return Object.prototype.hasOwnProperty.call(NAMED, e) ? NAMED[e] : m;
  });
}

const BLOCK_TAGS = 'p|div|section|article|aside|header|footer|blockquote|li|ul|ol|dl|dt|dd|tr|table|tbody|thead|tfoot|figure|figcaption|pre|hr|nav|main|body|center|address|h[1-6]|br';
const BLOCK_RE = new RegExp(`<\\/?(?:${BLOCK_TAGS})\\b[^>]*>`, 'gi');

/**
 * Convert an HTML document (or fragment) into blocks.
 * @returns {{text: string, h?: number}[]} paragraphs; headings carry their level in `h`.
 */
export function htmlToBlocks(html) {
  let s = String(html);
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  s = s.replace(/<(head|script|style|title|svg|math|rt|rp|noscript|template|object|iframe)\b[\s\S]*?<\/\1\s*>/gi, ' ');
  // Footnote references: <a epub:type="noteref">1</a>, <sup>12</sup>.
  s = s.replace(/<a\b[^>]*epub:type\s*=\s*["'][^"']*noteref[^"']*["'][^>]*>[\s\S]*?<\/a\s*>/gi, '');
  s = s.replace(/<sup\b[^>]*>\s*(?:<a\b[^>]*>)?\s*[[(]?\s*(?:\d{1,3}|\*{1,3}|[a-z])\s*[\])]?\s*(?:<\/a\s*>)?\s*<\/sup\s*>/gi, '');
  // Links to a #fragment whose visible text is just "12" or "*" are note markers too (MEK).
  s = s.replace(/<a\b[^>]*href\s*=\s*["'][^"']*#[^"']*["'][^>]*>((?:(?!<\/a)[\s\S]){0,120})<\/a\s*>/gi, (m, inner) =>
    (/^\s*[[(]?\s*(?:\d{1,3}|\*{1,3})\s*[\])]?\s*$/.test(inner.replace(/<[^>]*>/g, '')) ? '' : m));
  // Source whitespace is insignificant; collapse it before we add our own line breaks.
  s = s.replace(/\s+/g, ' ');
  s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1\s*>/gi, (_, level, inner) =>
    `\n\u0001${level}${inner.replace(/<br\b[^>]*>/gi, ' ').replace(BLOCK_RE, ' ')}\n`);
  s = s.replace(BLOCK_RE, '\n');
  s = s.replace(/<[^>]*>/g, '');
  s = decodeEntities(s).replace(/[­​﻿]/g, '');

  const blocks = [];
  for (let line of s.split('\n')) {
    let h = 0;
    if (line.charCodeAt(0) === 1) { h = Number(line[1]) || 1; line = line.slice(2); }
    line = line.replace(/\s+/g, ' ').trim().normalize('NFC');
    if (!line) continue;
    blocks.push(h ? { text: line, h } : { text: line });
  }
  return blocks;
}

/** Split a block list into chapters at headings of level <= maxLevel. */
export function blocksToChapters(blocks, fallbackTitle = '', maxLevel = 3) {
  const chapters = [];
  let cur = null;
  for (const b of blocks) {
    if (b.h && b.h <= maxLevel) {
      // Consecutive headings ("Első rész" + "I. fejezet") merge into one title.
      if (cur && cur.lines.length === cur.headingLines) {
        cur.title = cur.title ? `${cur.title} – ${b.text}` : b.text;
        cur.lines.push(b.text); cur.headingLines++;
        continue;
      }
      cur = { title: b.text, lines: [b.text], headingLines: 1 };
      chapters.push(cur);
      continue;
    }
    if (!cur) { cur = { title: fallbackTitle, lines: [], headingLines: 0 }; chapters.push(cur); }
    cur.lines.push(b.text);
  }
  let out = chapters.filter((c) => c.lines.length > c.headingLines || chapters.length === 1);
  // A tiny untitled block before the first heading is a title page ("Molnár Ferenc / A Pál utcai fiúk").
  if (out.length > 1 && out[0].headingLines === 0 && out[0].lines.join(' ').split(' ').length < 30) out = out.slice(1);
  return out.map((c) => ({ title: shortTitle(c.title), text: c.lines.join('\n') }));
}

export function shortTitle(t) {
  t = String(t || '').replace(/\s+/g, ' ').trim();
  return t.length > 90 ? `${t.slice(0, 87)}…` : t;
}

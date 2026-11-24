// Any supported file → book object { title, author, lang, chapters }.
// Shared by the browser importer and the Node catalog tool (no DOM use).
import { readZip, decodeText } from './zip.js';
import { epubToBook, resolvePath } from './epub.js';
import { htmlToBlocks, blocksToChapters, decodeEntities, shortTitle } from './html2text.js';
import { markHeadings } from './headings.js';

export const SUPPORTED_EXT = ['epub', 'txt', 'md', 'html', 'htm', 'xhtml', 'fb2', 'zip', 'pdf'];

const baseName = (name) => String(name || '').replace(/^.*[\\/]/, '').replace(/\.[^.]+$/, '');
const extOf = (name) => (String(name || '').match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();

export function isZip(bytes) {
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

export async function fileToBook(name, bytes) {
  const ext = extOf(name);
  if (isZip(bytes)) {
    const zip = await readZip(bytes);
    if (zip.has('META-INF/container.xml')) return epubToBook(bytes);
    return htmlZipToBook(zip, name);
  }
  const text = decodeText(bytes);
  if (ext === 'fb2' || /<FictionBook\b/.test(text.slice(0, 2000))) return fb2ToBook(text, name);
  if (['html', 'htm', 'xhtml'].includes(ext) || /^\s*(<!doctype html|<html\b|<\?xml)/i.test(text.slice(0, 500))) return htmlToBook(text, name);
  if (['txt', 'md', ''].includes(ext) || !/[\u0000-\u0008]/.test(text.slice(0, 1000))) return textToBook(text, baseName(name));
  throw new Error(`Nem támogatott fájltípus: .${ext}`);
}

function metaFromHtml(html) {
  const meta = (n) => html.match(new RegExp(`<meta\\s+name=["']?${n}["']?\\s+content=["']([^"']*)["']`, 'i'))?.[1];
  let title = meta('dc.title') ? decodeEntities(meta('dc.title')) : '';
  let author = meta('dc.creator') ? decodeEntities(meta('dc.creator')) : '';
  const t = decodeEntities(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
  if (!title && t) {
    const m = t.match(/^([^:]{3,60}?)(?::|\s[-–]\s)\s*(.+)$/);
    if (m) { author = author || m[1].trim(); title = m[2].trim(); } else title = t;
  }
  const lang = (html.match(/<html\b[^>]*\blang=["']?([a-z]{2})/i)?.[1] || html.match(/content-language["']?\s+content=["']?([a-z]{2})/i)?.[1] || '').toLowerCase();
  return { title, author, lang };
}

export function htmlToBook(html, name = '') {
  const file = baseName(name) ? `${baseName(name)}.htm` : 'index.htm';
  return htmlFilesToBook([file], async () => html, name);
}

/** MEK-style zipped HTML: index.htm (table of contents) + chapter files. */
export async function htmlZipToBook(zip, name = '') {
  const htmls = zip.names.filter((n) => /\.x?html?$/i.test(n) && !/(^|\/)mek\.html$/i.test(n));
  if (!htmls.length) throw new Error('A ZIP-ben nincs olvasható HTML vagy EPUB.');
  return htmlFilesToBook(htmls, (n) => zip.text(n), name);
}

// --- HTML books: chapters from the book's own table of contents -------------

const LINK_RE = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
const FRAME_RE = /<i?frame\b[^>]*\bsrc\s*=\s*["']?([^"'\s>]+)/gi;
const stripHead = (h) => h.replace(/<head\b[\s\S]*?<\/head\s*>/i, '');
const plain = (h) => decodeEntities(h.replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');
const SKIP_CHAPTER_RE = /^(tartalom|tartalomjegyzék|jegyzetek|lábjegyzetek|contents|notes|impresszum)\b|^\[\d+\]/i;

function localLinks(html, from, files) {
  const find = (p) => files.find((f) => f.toLowerCase() === p.toLowerCase());
  const out = [];
  for (const m of html.matchAll(LINK_RE)) {
    const h = m[1].match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
    if (!h) continue;
    const href = h[1] ?? h[2] ?? h[3];
    if (/^[a-z][a-z0-9+.-]*:/i.test(href)) continue;
    const [path, frag = ''] = href.split('#');
    const file = path ? find(resolvePath(dirOf(from), path)) : from;
    if (file) out.push({ file, frag, title: plain(m[2]) });
  }
  for (const m of html.matchAll(FRAME_RE)) {
    const file = find(resolvePath(dirOf(from), m[1]));
    if (file) out.push({ file, frag: '', title: '', frame: true });
  }
  return out;
}

function isTocPage(html) {
  const body = stripHead(html);
  if (/<frameset\b/i.test(body)) return true;
  const total = plain(body).length || 1;
  let inLinks = 0;
  let n = 0;
  for (const m of body.matchAll(LINK_RE)) { inLinks += plain(m[2]).length; n++; }
  return n >= 3 && inLinks / total > 0.5;
}

async function discoverToc(files, text) {
  const start = files.find((f) => /(^|\/)index\.html?$/i.test(f)) || (files.length === 1 ? files[0] : null);
  if (!start) return { start: null, toc: [] };
  const toc = [];
  const seen = new Set();
  const expand = async (file, depth) => {
    if (seen.has(file) || depth > 4) return;
    seen.add(file);
    const html = (await text(file)) || '';
    for (const l of localLinks(html, file, files)) {
      if (l.file === file && !l.frag) continue;
      if (l.file !== file && !l.frag) {
        const target = (await text(l.file)) || '';
        if (isTocPage(target)) { await expand(l.file, depth + 1); continue; }
      }
      if (!toc.some((t) => t.file === l.file && t.frag === l.frag)) toc.push(l);
    }
  };
  await expand(start, 0);
  return { start, toc };
}

function words(t) { return (t.match(/\S+/g) || []).length; }

/** Merge chapters too short to stand alone ("ELSŐ RÉSZ") into the next one. */
function mergeTiny(chapters) {
  const out = [];
  let carry = null;
  for (const c of chapters) {
    const cur = carry ? { title: carry.title && c.title ? `${carry.title} – ${c.title}` : carry.title || c.title, text: `${carry.text}\n${c.text}` } : c;
    carry = null;
    if (words(cur.text) < 15 && c !== chapters[chapters.length - 1]) { carry = cur; continue; }
    out.push(cur);
  }
  if (carry) out.push(carry);
  return out.map((c) => ({ title: shortTitle(c.title), text: c.text }));
}

async function htmlFilesToBook(files, text, name) {
  let meta = { title: '', author: '', lang: '' };
  for (const f of files) {
    meta = metaFromHtml((await text(f)) || '');
    if (meta.title) break;
  }
  const title = meta.title || baseName(name);
  const { start, toc } = await discoverToc(files, text);

  let chapters = [];
  if (toc.length >= 2) {
    const fileOrder = [...new Set(toc.map((t) => t.file))];
    for (const file of fileOrder) {
      const body = stripHead((await text(file)) || '');
      const cuts = [];
      for (const e of toc.filter((t) => t.file === file)) {
        let pos = 0;
        if (e.frag) {
          const f = escRe(e.frag);
          const m = new RegExp(`<a\\b[^>]*\\bname\\s*=\\s*["']?${f}(?=["'\\s/>])`, 'i').exec(body)
            || new RegExp(`\\bid\\s*=\\s*["']?${f}(?=["'\\s/>])`, 'i').exec(body);
          if (!m) continue;
          pos = body.lastIndexOf('<', m.index);
        }
        if (!cuts.some((c) => c.pos === pos)) cuts.push({ pos, title: e.title });
      }
      cuts.sort((a, b) => a.pos - b.pos);
      const lead = body.slice(0, cuts.length ? cuts[0].pos : body.length);
      const leadText = htmlToBlocks(lead).map((b) => b.text).join('\n');
      if (leadText) {
        if (chapters.length) chapters[chapters.length - 1].text += `\n${leadText}`;
        else if (file !== start && !isTocPage(lead) && words(leadText) >= 60) chapters.push({ title, text: leadText });
      }
      cuts.forEach((c, i) => {
        const seg = body.slice(c.pos, i + 1 < cuts.length ? cuts[i + 1].pos : body.length);
        const blocks = htmlToBlocks(seg);
        if (!blocks.length) return;
        chapters.push({ title: c.title || blocks.find((b) => b.h)?.text || blocks[0].text.slice(0, 60), text: blocks.map((b) => b.text).join('\n') });
      });
    }
    chapters = mergeTiny(chapters.filter((c) => !SKIP_CHAPTER_RE.test(c.title)));
  }
  if (chapters.length < 2) {
    // No usable table of contents: concatenate the pages and split at heading-like lines.
    const linked = [...new Set(toc.map((t) => t.file))].filter((f) => f !== start);
    const order = [...linked, ...files.filter((f) => f !== start && !linked.includes(f)).sort()];
    const blocks = [];
    for (const f of order.length ? order : files) blocks.push(...markHeadings(htmlToBlocks((await text(f)) || '')));
    const byHeadings = blocksToChapters(blocks, title);
    if (byHeadings.length >= chapters.length) chapters = byHeadings;
  }
  if (!chapters.length) throw new Error('A fájlban nem találtam olvasható szöveget.');
  return { ...meta, title, chapters };
}

export function textToBook(text, title = '') {
  const t = String(text).replace(/\r\n?/g, '\n').replace(/­/g, '').normalize('NFC');
  const paras = /\n[ \t]*\n/.test(t)
    ? t.split(/\n[ \t]*\n+/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
    : t.split('\n').map((p) => p.trim());
  const blocks = markHeadings(paras.filter(Boolean).map((p) => ({ text: p.replace(/\s+/g, ' ') })));
  const chapters = blocksToChapters(blocks, title);
  return { title: title || (blocks[0]?.text.slice(0, 40) ?? ''), author: '', lang: '', chapters };
}

export function fb2ToBook(xml, name = '') {
  const info = xml.match(/<title-info\b[^>]*>([\s\S]*?)<\/title-info>/i)?.[1] || '';
  const pick = (tag, src = info) => decodeEntities(src.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'))?.[1]?.replace(/<[^>]*>/g, '') || '').trim();
  const authorBlock = info.match(/<author\b[^>]*>([\s\S]*?)<\/author>/i)?.[1] || '';
  const author = [pick('last-name', authorBlock), pick('first-name', authorBlock)].filter(Boolean).join(' ');
  const title = pick('book-title') || baseName(name);
  const lang = pick('lang').slice(0, 2).toLowerCase();
  let body = xml.replace(/<binary\b[\s\S]*?<\/binary>/gi, '').replace(/<body\b[^>]*name=["']notes["'][\s\S]*?<\/body>/gi, '');
  body = body.match(/<body\b[^>]*>([\s\S]*)<\/body>/i)?.[1] || body;
  body = body.replace(/<title\b[^>]*>([\s\S]*?)<\/title>/gi, (_, inner) => `<h2>${inner.replace(/<\/?p\b[^>]*>/gi, ' ')}</h2>`)
    .replace(/<subtitle\b[^>]*>/gi, '<p>').replace(/<\/subtitle>/gi, '</p>')
    .replace(/<\/?(section|epigraph|poem|stanza|cite)\b[^>]*>/gi, '<div>')
    .replace(/<v\b[^>]*>/gi, '<p>').replace(/<\/v>/gi, '</p>');
  const chapters = blocksToChapters(htmlToBlocks(body), title);
  return { title, author, lang, chapters };
}

/** Word count helper used by the catalog tool and the UI. */
export function countWords(chapters) {
  let n = 0;
  for (const c of chapters) {
    const m = c.text.match(/\S+/g);
    if (m) n += m.length;
  }
  return n;
}

// EPUB 2/3 → { title, author, lang, chapters: [{ title, text }] }
import { readZip } from './zip.js';
import { htmlToBlocks, blocksToChapters, decodeEntities, shortTitle } from './html2text.js';
import { markHeadings } from './headings.js';

// Front/back matter we do not want to flash word by word.
export const SKIP_TITLE_RE = /^(címlap|borító|cover|tartalom|tartalomjegyzék|contents|table of contents|jegyzetek|lábjegyzetek|notes|endnotes|footnotes|impresszum|colophon|imprint|uncopyright|copyright|title ?page|half ?title|list of illustrations)$/i;
const SKIP_TYPE_RE = /\bepub:type\s*=\s*["'][^"']*\b(titlepage|halftitlepage|imprint|colophon|copyright-page|toc|loi|lot|endnotes|footnotes|rearnotes|cover)\b/i;

function attrs(s) {
  const out = {};
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) out[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3] ?? '');
  return out;
}

function tagText(xml, tag) {
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}\\s*>`, 'gi');
  return [...xml.matchAll(re)].map((m) => decodeEntities(m[1].replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim()).filter(Boolean);
}

export function resolvePath(base, href) {
  const clean = href.split('#')[0];
  const parts = (base + clean).split('/');
  const out = [];
  for (const p of parts) {
    if (p === '..') out.pop();
    else if (p !== '.' && p !== '') out.push(p);
  }
  let path = out.join('/');
  try { path = decodeURIComponent(path); } catch { /* keep */ }
  return path;
}
const dirOf = (p) => (p.includes('/') ? p.slice(0, p.lastIndexOf('/') + 1) : '');

const SHORT_LABEL = /^([\dIVXLCDM]{1,6}|[a-z])\.?$/i;

function parseNcx(xml, base) {
  const toc = [];
  // Walk navPoints keeping a parent stack so "1", "2" children inherit "Első rész".
  const stack = [];
  const re = /<navPoint\b[^>]*>|<\/navPoint\s*>|<navLabel\b[^>]*>[\s\S]*?<\/navLabel\s*>|<content\b([^>]*)\/?>/gi;
  let label = '';
  for (const m of xml.matchAll(re)) {
    const tag = m[0];
    if (/^<navPoint/i.test(tag)) stack.push('');
    else if (/^<\/navPoint/i.test(tag)) stack.pop();
    else if (/^<navLabel/i.test(tag)) {
      label = tagText(tag, 'text')[0] || '';
      if (stack.length) stack[stack.length - 1] = label;
    } else {
      const a = attrs(m[1] || '');
      if (a.src) toc.push({ path: resolvePath(base, a.src), frag: a.src.split('#')[1] || '', title: withParent(label, stack) });
    }
  }
  return toc;
}

function withParent(label, stack) {
  if (SHORT_LABEL.test(label) && stack.length >= 2) {
    const parent = stack[stack.length - 2].split(/\s+[-–—]\s+/)[0];
    if (parent) return `${parent} – ${label.replace(/\.$/, '')}.`;
  }
  return label;
}

function parseNav(xml, base) {
  const navs = [...xml.matchAll(/<nav\b([^>]*)>([\s\S]*?)<\/nav\s*>/gi)];
  const tocNav = navs.find((n) => /toc/.test(n[1])) || navs[0];
  if (!tocNav) return [];
  const toc = [];
  const stack = [];
  const re = /<li\b[^>]*>|<\/li\s*>|<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (const m of tocNav[2].matchAll(re)) {
    if (/^<li/i.test(m[0])) { stack.push(''); continue; }
    if (/^<\/li/i.test(m[0])) { stack.pop(); continue; }
    const a = attrs(m[1] || '');
    const label = decodeEntities(m[2].replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
    if (stack.length) stack[stack.length - 1] = label;
    if (a.href) toc.push({ path: resolvePath(base, a.href), frag: a.href.split('#')[1] || '', title: withParent(label, stack) });
  }
  return toc;
}

export async function epubToBook(bytes) {
  const zip = await readZip(bytes);
  const container = await zip.text('META-INF/container.xml');
  const opfPath = container && attrs(container.match(/<rootfile\b([^>]*)>/i)?.[1] || '')['full-path'];
  if (!opfPath) throw new Error('Hibás EPUB: nem található a tartalomjegyzék (OPF).');
  const opf = await zip.text(opfPath);
  const base = dirOf(opfPath);

  const title = tagText(opf, 'dc:title')[0] || '';
  const author = tagText(opf, 'dc:creator').join(', ');
  const lang = (tagText(opf, 'dc:language')[0] || '').slice(0, 2).toLowerCase();

  const items = new Map();
  for (const m of opf.matchAll(/<item\b([^>]*?)\/?>/gi)) {
    const a = attrs(m[1]);
    if (a.id && a.href) items.set(a.id, { path: resolvePath(base, a.href), type: a['media-type'] || '', props: a.properties || '' });
  }
  const spineTag = opf.match(/<spine\b([^>]*)>/i);
  const spine = [...opf.matchAll(/<itemref\b([^>]*?)\/?>/gi)]
    .map((m) => attrs(m[1]))
    .filter((a) => a.linear !== 'no')
    .map((a) => items.get(a.idref))
    .filter((it) => it && /html|xml/i.test(it.type));

  let toc = [];
  const navItem = [...items.values()].find((i) => /\bnav\b/.test(i.props));
  if (navItem) toc = parseNav((await zip.text(navItem.path)) || '', dirOf(navItem.path));
  if (!toc.length) {
    const ncxId = spineTag && attrs(spineTag[1]).toc;
    const ncxItem = items.get(ncxId) || [...items.values()].find((i) => /ncx/.test(i.type));
    if (ncxItem) toc = parseNcx((await zip.text(ncxItem.path)) || '', dirOf(ncxItem.path));
  }
  const tocByPath = new Map();
  for (const t of toc) if (!tocByPath.has(t.path)) tocByPath.set(t.path, t.title);

  const chapters = [];
  for (const it of spine) {
    const html = await zip.text(it.path);
    if (!html) continue;
    const bodyOpen = html.match(/<body\b[^>]*>[\s\S]{0,600}/i)?.[0] || '';
    if (SKIP_TYPE_RE.test(bodyOpen)) continue;
    const tocTitle = tocByPath.get(it.path);
    if (tocTitle && SKIP_TITLE_RE.test(tocTitle.trim())) continue;
    const raw = htmlToBlocks(html);
    // One file holding many pieces (a poetry collection, several chapters): split at its top headings.
    const levels = {};
    for (const b of raw) if (b.h) levels[b.h] = (levels[b.h] || 0) + 1;
    const top = Math.min(...Object.keys(levels).map(Number));
    if (levels[top] >= 3) {
      for (const part of blocksToChapters(raw, tocTitle || title, top)) {
        if (!SKIP_TITLE_RE.test(part.title)) chapters.push(part);
      }
      continue;
    }
    const blocks = markHeadings(raw);
    if (!blocks.length) continue;
    const words = blocks.reduce((n, b) => n + b.text.split(' ').length, 0);
    const firstHeading = blocks.find((b) => b.h)?.text;
    if (!tocTitle && firstHeading && SKIP_TITLE_RE.test(firstHeading)) continue;
    if (words < 3 && !tocTitle) continue;
    const text = blocks.map((b) => b.text).join('\n');
    if (!tocTitle && !firstHeading && chapters.length) {
      chapters[chapters.length - 1].text += `\n${text}`; // continuation file (split chapters)
      continue;
    }
    chapters.push({ title: shortTitle(tocTitle || firstHeading || `${chapters.length + 1}.`), text });
  }
  if (!chapters.length) throw new Error('Az EPUB-ban nem találtam olvasható szöveget.');
  return { title, author, lang, chapters };
}

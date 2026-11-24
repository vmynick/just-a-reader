#!/usr/bin/env node
// Add books to the catalog: download → convert → books/<lang>/<id>.json + books/catalog.json
//
//   node tools/add-book.mjs <source> [--lang hu] [--title "…"] [--author "…"] [--id x] [--preinstalled]
//   node tools/add-book.mjs --list tools/seed-books.txt
//
// <source> can be:
//   https://mek.oszk.hu/00600/00656/                 (MEK item; EPUB preferred, else zipped HTML)
//   https://standardebooks.org/ebooks/jane-austen/pride-and-prejudice
//   https://www.gutenberg.org/ebooks/1342  or  gutenberg:1342
//   any direct .epub / .txt / .html / .fb2 / .zip URL, or a local file path
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fileToBook, countWords } from '../js/core/convert.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CATALOG = join(ROOT, 'books', 'catalog.json');
const UA = 'Mozilla/5.0 (compatible; just-a-reader-catalog/1.0)';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function slugify(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

async function fetchBytes(url, { tries = 3 } = {}) {
  let lastErr;
  for (let t = 1; t <= tries; t++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow', signal: AbortSignal.timeout(180000) });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return new Uint8Array(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
      if (t < tries) await sleep(2000 * t);
    }
  }
  throw new Error(`${url}: ${lastErr?.message}`);
}

async function fetchText(url) {
  const b = await fetchBytes(url);
  return b ? new TextDecoder('utf-8').decode(b) : null;
}

const metaTag = (html, name) => html.match(new RegExp(`<meta\\s+name=["']${name}["']\\s+content=["']([^"']*)["']`, 'i'))?.[1];

/** Work out what to download for a source spec. */
async function resolve(src) {
  let m;
  if ((m = src.match(/mek\.oszk\.hu\/(\d{5})\/(\d{5})/))) {
    const [, a, b] = m;
    const dir = `https://mek.oszk.hu/${a}/${b}/`;
    const page = (await fetchText(dir)) || '';
    const meta = { title: metaTag(page, 'dc.title'), author: metaTag(page, 'dc.creator'), lang: 'hu' };
    for (const file of [`${b}.epub`, `${b}html.zip`, `${b}.htm`, `${b}.html`]) {
      const bytes = await fetchBytes(dir + file);
      if (bytes) return { id: `mek-${b}`, name: file, bytes, source: dir, meta };
    }
    throw new Error(`MEK ${b}: nincs EPUB/HTML változat.`);
  }
  if ((m = src.match(/standardebooks\.org\/ebooks\/([^?#]+?)\/?(?:[?#].*)?$/))) {
    const path = m[1].replace(/\/downloads.*$/, '');
    const page = `https://standardebooks.org/ebooks/${path}`;
    const html = (await fetchText(page)) || '';
    const links = [...html.matchAll(/href="([^"]*\/downloads\/[^"]+?\.epub)(?:\?[^"]*)?"/g)].map((x) => x[1]);
    const href = links.find((l) => !/_advanced|\.kepub/.test(l)) || `/ebooks/${path}/downloads/${path.replace(/\//g, '_')}.epub`;
    const url = new URL(href, 'https://standardebooks.org').href + '?source=download';
    const bytes = await fetchBytes(url);
    if (!bytes) throw new Error(`Standard Ebooks: nem található: ${url}`);
    return { id: `se-${slugify(path.split('/').slice(0, 2).join('-'))}`, name: 'book.epub', bytes, source: page, meta: { lang: 'en' } };
  }
  if ((m = src.match(/gutenberg\.org\/ebooks\/(\d+)/) || src.match(/^(?:pg|gutenberg):(\d+)$/i))) {
    const n = m[1];
    for (const host of ['https://www.gutenberg.org', 'https://gutenberg.pglaf.org']) {
      for (const file of [`pg${n}.epub`, `pg${n}-images-3.epub`]) {
        try {
          const bytes = await fetchBytes(`${host}/cache/epub/${n}/${file}`, { tries: 2 });
          if (bytes) return { id: `pg-${n}`, name: file, bytes, source: `https://www.gutenberg.org/ebooks/${n}`, meta: {} };
        } catch { /* try next mirror */ }
      }
    }
    throw new Error(`Gutenberg ${n}: nem sikerült letölteni.`);
  }
  if (/^https?:\/\//.test(src)) {
    const bytes = await fetchBytes(src);
    if (!bytes) throw new Error(`Nem található: ${src}`);
    const name = basename(new URL(src).pathname) || 'book';
    return { id: slugify(`${new URL(src).hostname.split('.').slice(-2, -1)[0]}-${name.replace(/\.[^.]+$/, '')}`), name, bytes, source: src, meta: {} };
  }
  const bytes = new Uint8Array(await readFile(src));
  return { id: slugify(basename(src).replace(/\.[^.]+$/, '')), name: basename(src), bytes, source: '', meta: {} };
}

async function loadCatalog() {
  try { return JSON.parse(await readFile(CATALOG, 'utf8')); } catch { return { v: 1, books: [] }; }
}

function sortCatalog(cat) {
  const coll = new Intl.Collator('hu');
  cat.books.sort((a, b) => coll.compare(a.lang, b.lang) || coll.compare(a.author, b.author) || coll.compare(a.title, b.title));
}

export async function addBook(src, opts = {}) {
  const r = await resolve(src);
  const book = await fileToBook(r.name, r.bytes);
  const id = opts.id || r.id;
  const lang = opts.lang || r.meta.lang || book.lang || 'hu';
  const title = (opts.title || r.meta.title || book.title || id).trim();
  const author = (opts.author || r.meta.author || book.author || '').trim();
  const words = countWords(book.chapters);
  if (words < 50) throw new Error(`${id}: gyanúsan rövid (${words} szó).`);
  const out = { v: 1, id, title, author, lang, source: r.source, chapters: book.chapters };
  const rel = `books/${lang}/${id}.json`;
  await mkdir(join(ROOT, 'books', lang), { recursive: true });
  await writeFile(join(ROOT, rel), JSON.stringify(out));
  const bytes = (await stat(join(ROOT, rel))).size;

  const cat = await loadCatalog();
  const entry = { id, title, author, lang, words, chapters: book.chapters.length, bytes, file: rel, source: r.source };
  if (opts.preinstalled) entry.preinstalled = true;
  const i = cat.books.findIndex((b) => b.id === id);
  if (i >= 0) cat.books[i] = { ...cat.books[i], ...entry }; else cat.books.push(entry);
  sortCatalog(cat);
  cat.updated = new Date().toISOString();
  await writeFile(CATALOG, `${JSON.stringify(cat, null, 2)}\n`);
  return entry;
}

function parseArgs(argv) {
  const opts = {};
  const pos = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--preinstalled') opts.preinstalled = true;
    else if (a.startsWith('--')) opts[a.slice(2)] = argv[++i];
    else pos.push(a);
  }
  return { opts, pos };
}

async function main() {
  const { opts, pos } = parseArgs(process.argv.slice(2));
  const jobs = [];
  if (opts.list) {
    for (const line of (await readFile(opts.list, 'utf8')).split(/\r?\n/)) {
      const t = line.replace(/#.*$/, '').trim();
      if (!t) continue;
      const { opts: o, pos: p } = parseArgs(t.match(/"[^"]*"|\S+/g).map((x) => x.replace(/^"|"$/g, '')));
      jobs.push({ src: p[0], opts: o });
    }
  } else if (pos.length) {
    for (const p of pos) jobs.push({ src: p, opts });
  } else {
    console.error('Használat: node tools/add-book.mjs <forrás> [--lang hu] [--title …] [--author …] [--preinstalled]');
    process.exit(2);
  }
  let failed = 0;
  for (const [n, job] of jobs.entries()) {
    try {
      const e = await addBook(job.src, job.opts);
      console.log(`✓ ${e.id}  ${e.author} – ${e.title}  (${e.words} szó, ${e.chapters} fejezet, ${Math.round(e.bytes / 1024)} kB)`);
    } catch (err) {
      failed++;
      console.error(`✗ ${job.src}: ${err.message}`);
    }
    if (n < jobs.length - 1) await sleep(1500);
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();

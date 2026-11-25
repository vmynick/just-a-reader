// Library operations: own texts, imported files, catalog books, backup.
import * as db from './store.js';
import { tokenize } from './core/tokenize.js';
import { remapIndex } from './core/remap.js';
import { countWords, fileToBook, textToBook } from './core/convert.js';
import { settings, replaceAll } from './settings.js';
import { fail } from './core/errors.js';
import { t, lang } from './i18n.js';

export async function listLibrary() {
  const [items, progress] = await Promise.all([db.getAll('items'), db.getAll('progress')]);
  const pm = new Map(progress.map((p) => [p.id, p]));
  return items.map((it) => ({ ...it, progress: pm.get(it.id) }));
}

const autoTitle = (text) => {
  const first = text.trim().split(/\n/)[0].replace(/\s+/g, ' ');
  return first.length > 40 ? `${first.slice(0, 40).replace(/\s\S*$/, '')}…` : first || t('Névtelen szöveg');
};

/** Create or update an own text. Keeps the reading position across edits. */
export async function saveText({ id, title, text }) {
  const now = Date.now();
  const chapters = [{ title: '', text: text.replace(/\r\n?/g, '\n') }];
  const wordCount = countWords(chapters);
  title = title.trim() || autoTitle(text);
  if (id) {
    const [old, oldContent, prog] = await Promise.all([db.get('items', id), db.get('content', id), db.get('progress', id)]);
    if (prog && oldContent) {
      const newWords = tokenize(chapters).words;
      prog.index = remapIndex(tokenize(oldContent.chapters).words, prog.index, newWords);
      prog.total = newWords.length;
      prog.word = newWords[prog.index];
      await db.put('progress', prog);
    }
    await db.saveDoc({ ...old, title, wordCount, updatedAt: now }, chapters);
    return id;
  }
  id = db.uid('t');
  await db.saveDoc({ id, kind: 'text', title, author: '', lang: '', wordCount, createdAt: now, updatedAt: now }, chapters);
  return id;
}

export async function getText(id) {
  const [item, content] = await Promise.all([db.get('items', id), db.get('content', id)]);
  if (!item || !content) return null;
  return { item, text: content.chapters.map((c) => c.text).join('\n\n') };
}

async function saveBook(book, extra) {
  const now = Date.now();
  const id = extra.id || db.uid('f');
  await db.saveDoc({
    id, kind: extra.kind || 'file', title: book.title || t('Névtelen'), author: book.author || '', lang: book.lang || '',
    wordCount: countWords(book.chapters), source: extra.source || '', fileName: extra.fileName || '',
    createdAt: now, updatedAt: now,
  }, book.chapters);
  return id;
}

export async function importFile(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const book = /\.pdf$/i.test(file.name) || file.type === 'application/pdf'
    ? await pdfToBook(bytes, file.name)
    : await fileToBook(file.name, bytes);
  if (!countWords(book.chapters)) throw fail('A fájlban nem találtam szöveget.');
  return saveBook(book, { kind: 'file', fileName: file.name });
}

async function pdfToBook(bytes, name) {
  const pdfjs = await import('../vendor/pdfjs/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('../vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
  const doc = await pdfjs.getDocument({ data: bytes }).promise;
  const paras = [];
  let cur = '';
  const flush = () => { if (cur.trim()) paras.push(cur.trim()); cur = ''; };
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const tc = await page.getTextContent();
    const lines = [];
    let line = null;
    for (const it of tc.items) {
      if (!('str' in it)) continue;
      const y = it.transform[5];
      const h = Math.abs(it.transform[3]) || it.height || 10;
      if (!line || Math.abs(y - line.y) > h * 0.4) { line = { y, h, text: '' }; lines.push(line); }
      line.text += it.str;
      if (it.hasEOL) line = null;
    }
    const clean = lines.map((l) => ({ ...l, text: l.text.replace(/\s+/g, ' ').trim() })).filter((l) => l.text && !/^\d{1,4}$/.test(l.text));
    for (let k = 0; k < clean.length; k++) {
      const l = clean[k];
      const prev = clean[k - 1];
      if (prev && Math.abs(prev.y - l.y) > Math.max(prev.h, l.h) * 1.8) flush();
      if (/[-­]$/.test(cur) && /^\p{Ll}/u.test(l.text)) cur = cur.replace(/[-­]$/, '') + l.text;
      else cur += (cur ? ' ' : '') + l.text;
      if (/[.!?…:”"]$/.test(l.text) && l.text.length < 45) flush();
    }
    flush();
  }
  const meta = await doc.getMetadata().catch(() => null);
  const book = textToBook(paras.join('\n\n'), meta?.info?.Title || name.replace(/\.pdf$/i, ''));
  book.author = meta?.info?.Author || '';
  return book;
}

export async function importSharedText(title, text) {
  return saveText({ title: title || '', text });
}

// ---------------------------------------------------------------- catalog
export async function fetchCatalog() {
  const res = await fetch('books/catalog.json', { cache: 'no-cache' });
  if (!res.ok) throw fail('A könyvlista most nem érhető el.');
  return res.json();
}

export async function downloadCatalogBook(entry) {
  const res = await fetch(entry.file);
  if (!res.ok) throw fail('{title}: a letöltés nem sikerült ({status}).', { title: entry.title, status: res.status });
  const b = await res.json();
  const now = Date.now();
  await db.saveDoc({
    id: entry.id, kind: 'book', title: entry.title || b.title, author: b.author, lang: b.lang, wordCount: entry.words,
    source: b.source, catalogId: entry.id, createdAt: now, updatedAt: now,
    ...(entry.short ? { short: true, collection: entry.collection, n: entry.n ?? 0 } : {}),
  }, b.chapters);
}

export async function deleteDoc(item) {
  // Books keep their progress so a re-download resumes; own texts and files go entirely.
  await db.removeDoc(item.id, { keepProgress: item.kind === 'book' });
}

export async function resetProgress(id) {
  const p = (await db.get('progress', id)) || { id };
  await db.put('progress', { ...p, index: 0, word: '', updatedAt: Date.now() });
}

// ---------------------------------------------------------------- backup
export async function exportBackup({ withBooks }) {
  const [items, content, progress, stats] = await Promise.all(['items', 'content', 'progress', 'stats'].map((s) => db.getAll(s)));
  const keep = new Set(items.filter((i) => withBooks || i.kind === 'text').map((i) => i.id));
  return {
    app: 'just-a-reader', v: 1, exportedAt: new Date().toISOString(),
    settings: settings(),
    items: items.filter((i) => keep.has(i.id) || i.kind === 'book'),
    content: content.filter((c) => keep.has(c.id)),
    progress, stats,
  };
}

export async function importBackup(data) {
  if (data?.app !== 'just-a-reader') throw fail('Ez nem Just A Reader mentés.');
  const contentIds = new Set((data.content || []).map((c) => c.id));
  for (const c of data.content || []) await db.put('content', c);
  let restored = 0;
  const missingBooks = [];
  for (const it of data.items || []) {
    if (contentIds.has(it.id)) { await db.put('items', it); restored++; } else if (it.kind === 'book') missingBooks.push(it.id);
  }
  for (const p of data.progress || []) await db.put('progress', p);
  for (const s of data.stats || []) await db.put('stats', s);
  if (data.settings) replaceAll({ ...data.settings, firstRunDone: true });
  return { restored, missingBooks };
}

export const welcomeText = () => (lang() === 'en' ? WELCOME_EN : WELCOME_HU);

const WELCOME_EN = `Hi! This is a short sample text so you can try the reader.
While it is running, keep your finger on the screen and it stops. Let go and it continues.
Swipe up to go faster. Swipe down to slow down.
If you missed something, flick to the left and it jumps back to the start of the sentence.
A single tap pauses. While paused, tap the right side to step one word forward, the left side to step one back, and the middle to continue.
In the menu you can turn on repeat, so this text starts over at the end.
Happy reading!`;

const WELCOME_HU = `Szia! Ez egy rövid próbaszöveg, hogy kipróbáld az olvasót.
Olvasás közben tartsd nyomva az ujjad a képernyőn, és megáll. Ha elengeded, folytatja.
Húzd az ujjad felfelé, és gyorsul. Lefelé húzva lassul.
Ha lemaradtál valamiről, legyints balra, és visszaugrik a mondat elejére.
Egy koppintás megállítja. Megállítva a jobb oldalra koppintva egy szót lépsz előre, a bal oldalra koppintva egyet vissza, középen pedig folytatod.
A menüben bekapcsolhatod az ismétlést, így ez a szöveg a végén újra kezdődik.
Jó olvasást!`;

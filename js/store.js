// IndexedDB storage. Stores:
//   items    – library entries (metadata only)        key: id
//   content  – chapters of each item                   key: id
//   progress – reading position, kept even if a book is removed so it resumes on re-download
//   stats    – per-day reading totals                  key: day (YYYY-MM-DD)

const DB_NAME = 'just-a-reader';
const DB_VERSION = 1;
let dbPromise;

function open() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, key] of [['items', 'id'], ['content', 'id'], ['progress', 'id'], ['stats', 'day']]) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: key });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(storeNames, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    let result;
    const out = fn(tx);
    if (out && 'onsuccess' in out) out.onsuccess = () => { result = out.result; };
    else result = out;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || Object.assign(new Error('A mentés megszakadt.'), { key: 'A mentés megszakadt.' }));
  });
}

export const get = (store, key) => run(store, 'readonly', (tx) => tx.objectStore(store).get(key));
export const getAll = (store) => run(store, 'readonly', (tx) => tx.objectStore(store).getAll());
export const put = (store, value) => run(store, 'readwrite', (tx) => tx.objectStore(store).put(value));
export const del = (store, key) => run(store, 'readwrite', (tx) => tx.objectStore(store).delete(key));

/** Save an item and its chapters in one transaction. */
export function saveDoc(item, chapters) {
  return run(['items', 'content'], 'readwrite', (tx) => {
    tx.objectStore('items').put(item);
    tx.objectStore('content').put({ id: item.id, chapters });
  });
}

export function removeDoc(id, { keepProgress = false } = {}) {
  const stores = keepProgress ? ['items', 'content'] : ['items', 'content', 'progress'];
  return run(stores, 'readwrite', (tx) => { for (const s of stores) tx.objectStore(s).delete(id); });
}

export async function addStats(words, ms) {
  if (!words && !ms) return;
  const day = new Date().toLocaleDateString('sv'); // YYYY-MM-DD in local time
  const cur = (await get('stats', day)) || { day, words: 0, ms: 0 };
  cur.words += words;
  cur.ms += ms;
  await put('stats', cur);
}

export async function requestPersistence() {
  try { if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist(); } catch { /* optional */ }
}

export const uid = (prefix) => `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

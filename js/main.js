// App shell: routing, first-run setup, share-target inbox, service worker.
import { apply, settings, update } from './settings.js';
import { Reader } from './reader.js';
import { renderLibrary, renderBrowse, renderEditor, renderSettings, renderStats } from './views.js';
import * as docs from './docs.js';
import { requestPersistence } from './store.js';
import { exitFullscreen } from './fullscreen.js';
import { $, toast } from './ui.js';

apply();

const views = {
  library: $('#v-library'), browse: $('#v-browse'), editor: $('#v-editor'),
  settings: $('#v-settings'), stats: $('#v-stats'), reader: $('#v-reader'),
};
const reader = new Reader(views.reader, { onExit: () => { location.hash = '#/'; } });
let current = null;

function show(name) {
  for (const [k, el] of Object.entries(views)) el.hidden = k !== name;
  document.body.dataset.view = name;
  current = name;
}

async function route() {
  const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ''));
  const [page, ...rest] = hash.split('/');
  const arg = rest.join('/');
  if (current === 'reader' && page !== 'read') reader.close(page !== 'settings');
  if (page !== 'read' && page !== 'settings') exitFullscreen();
  window.scrollTo(0, 0);
  switch (page) {
    case 'read': show('reader'); await reader.open(arg); break;
    case 'browse': show('browse'); await renderBrowse(views.browse); break;
    case 'new': show('editor'); await renderEditor(views.editor, null); break;
    case 'edit': show('editor'); await renderEditor(views.editor, arg); break;
    case 'settings': show('settings'); await renderSettings(views.settings); break;
    case 'stats': show('stats'); await renderStats(views.stats); break;
    default: show('library'); await renderLibrary(views.library);
  }
}

async function firstRun() {
  if (settings().firstRunDone) return;
  try {
    const list = await docs.listLibrary();
    if (!list.some((x) => x.kind === 'text')) await docs.saveText({ title: 'Próbaszöveg: így működik', text: docs.WELCOME_TEXT });
    if (current === 'library') renderLibrary(views.library);
    const cat = await docs.fetchCatalog();
    const pre = cat.books.filter((b) => b.preinstalled && !list.some((x) => x.id === b.id));
    if (pre.length) toast(`Első indítás: ${pre.length} könyv letöltése…`, { ms: 60000 });
    for (const b of pre) await docs.downloadCatalogBook(b);
    update({ firstRunDone: true });
    if (pre.length) toast('Kész, a könyvek a könyvtáradban vannak.');
    if (current === 'library') renderLibrary(views.library);
  } catch {
    toast('A kezdő könyveket most nem sikerült letölteni. A következő indításkor újra megpróbálom.', { ms: 6000 });
  }
}

/** Files or text shared to the app (Android "Megosztás") land in this cache via sw.js. */
async function drainShareInbox() {
  if (!('caches' in window)) return;
  const cache = await caches.open('jar-inbox');
  const keys = await cache.keys();
  if (!keys.length) return;
  let added = 0;
  for (const req of keys) {
    const res = await cache.match(req);
    try {
      if (res.headers.get('x-kind') === 'text') {
        const { title, text } = await res.json();
        if (text?.trim()) { await docs.importSharedText(title, text); added++; }
      } else {
        const name = decodeURIComponent(res.headers.get('x-name') || 'megosztott.txt');
        await docs.importFile(new File([await res.blob()], name, { type: res.headers.get('content-type') || '' }));
        added++;
      }
    } catch (err) {
      toast(`A megosztott tartalmat nem sikerült megnyitni: ${err.message}`, { ms: 6000 });
    }
    await cache.delete(req);
  }
  if (added) toast(added === 1 ? 'Megosztott tartalom hozzáadva.' : `${added} megosztott tétel hozzáadva.`);
  if (current === 'library') renderLibrary(views.library);
}

function registerSW() {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.register('sw.js').catch(() => {});
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading || current === 'reader') return;
    reloading = true;
    toast('Új verzió érhető el.', { action: 'Frissítés', onAction: () => location.reload(), ms: 10000 });
  });
}

window.addEventListener('hashchange', route);

(async () => {
  if (location.pathname.endsWith('/share')) history.replaceState(null, '', './#/');
  registerSW();
  requestPersistence();
  await route();
  await drainShareInbox();
  firstRun();
})();

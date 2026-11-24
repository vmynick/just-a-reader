// Service worker: offline app shell, catalog fallback, Android share target.
const VERSION = 'jar-1.0.0';
const RUNTIME = 'jar-runtime';
const INBOX = 'jar-inbox';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'fonts/fonts.css',
  'fonts/literata-latin-400-normal.woff2',
  'fonts/literata-latin-700-normal.woff2',
  'fonts/literata-latin-ext-400-normal.woff2',
  'fonts/literata-latin-ext-700-normal.woff2',
  'fonts/atkinson-hyperlegible-latin-400-normal.woff2',
  'fonts/atkinson-hyperlegible-latin-700-normal.woff2',
  'fonts/atkinson-hyperlegible-latin-ext-400-normal.woff2',
  'fonts/atkinson-hyperlegible-latin-ext-700-normal.woff2',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/favicon-32.png',
  'js/main.js',
  'js/settings.js',
  'js/store.js',
  'js/ui.js',
  'js/icons.js',
  'js/controls.js',
  'js/fullscreen.js',
  'js/reader.js',
  'js/views.js',
  'js/docs.js',
  'js/core/tokenize.js',
  'js/core/timing.js',
  'js/core/remap.js',
  'js/core/zip.js',
  'js/core/html2text.js',
  'js/core/headings.js',
  'js/core/epub.js',
  'js/core/convert.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (![VERSION, RUNTIME, INBOX].includes(key)) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method === 'POST' && url.pathname.endsWith('/share')) { event.respondWith(receiveShare(req)); return; }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  if (url.pathname.endsWith('/books/catalog.json')) { event.respondWith(networkFirst(req)); return; }
  if (url.pathname.includes('/books/')) return; // downloaded books live in IndexedDB
  if (url.pathname.includes('/vendor/')) { event.respondWith(cacheFirst(req, RUNTIME)); return; }
  if (req.mode === 'navigate') {
    event.respondWith(caches.match('index.html').then((r) => r || fetch(req)));
    return;
  }
  event.respondWith(caches.match(req, { ignoreSearch: true }).then((r) => r || fetch(req)));
});

async function networkFirst(req) {
  const cache = await caches.open(RUNTIME);
  try {
    const res = await fetch(req, { cache: 'no-cache' });
    if (res.ok) cache.put(req, res.clone());
    return res;
  } catch {
    return (await cache.match(req)) || new Response('{"v":1,"books":[]}', { headers: { 'content-type': 'application/json' } });
  }
}

async function cacheFirst(req, name) {
  const cache = await caches.open(name);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function receiveShare(req) {
  const form = await req.formData();
  const cache = await caches.open(INBOX);
  const stamp = Date.now();
  const files = form.getAll('file').filter((f) => f && typeof f !== 'string' && f.size);
  let n = 0;
  for (const f of files) {
    await cache.put(new Request(`__inbox/${stamp}-${n++}`), new Response(f, {
      headers: { 'x-name': encodeURIComponent(f.name || 'megosztott'), 'content-type': f.type || 'application/octet-stream' },
    }));
  }
  const text = [form.get('text'), form.get('url')].filter((x) => typeof x === 'string' && x.trim()).join('\n');
  if (!files.length && text) {
    await cache.put(new Request(`__inbox/${stamp}-text`), new Response(JSON.stringify({ title: form.get('title') || '', text }), {
      headers: { 'x-kind': 'text', 'content-type': 'application/json' },
    }));
  }
  return Response.redirect('./#/', 303);
}

/* Course & Calling service worker.
   v10.13 (HOM-5): updates without reinstalling.
   - The page (index.html) is NETWORK-FIRST and revalidates past the HTTP cache (GitHub Pages sends max-age=600),
     so a launch never shows a stale copy while online; the cached copy is only an offline (or very slow network) fallback.
   - version.json is network-only (no-store); the page polls it on launch/resume and reloads itself when newer.
   - Other same-origin files: cache first, refreshed in the background.
   - skipWaiting + clients.claim, old caches deleted on activate. Bump VERSION with every release (byte change = update). */
const VERSION = '10.13';
const CACHE = 'hsh-v10-13';
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './logo.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-512-maskable.png',
  './icons/apple-touch-icon.png',
  './icons/pwa-192.png',
  './icons/pwa-512.png',
  './icons/pwa-maskable-512.png',
  './icons/ios_180.png',
  './favicon.ico',
  './favicon.svg',
  './favicon-32.png',
  './brand/mark-light-bg.svg',
  './brand/mark-dark-bg.svg',
  './brand/primary-dark-bg.svg',
  './brand/primary-light-bg.svg',
  './brand/horizontal-light-bg.svg',
  './brand/primary-dark-bg-static.svg',
  './brand/mark-dark-bg-static.svg',
  './brand/mark-light-bg-static.svg'
];
const NAV_TIMEOUT_MS = 8000;   // after this, fall back to the cached page if the network is very slow

self.addEventListener('install', (e) => {
  // cache:'reload' so the new cache is filled from the network, not from a stale HTTP-cache copy.
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.all(CORE.map((u) => c.add(new Request(u, { cache: 'reload' })).catch(() => {}))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (e) => {
  if (e.data === 'skipWaiting') self.skipWaiting();
  if (e.data === 'version' && e.source) e.source.postMessage({ type: 'sw-version', version: VERSION });
});

function isPageRequest(req, url) {
  return req.mode === 'navigate' || (url.origin === self.location.origin &&
    (url.pathname.endsWith('/') || url.pathname.endsWith('/index.html')));
}

function pageNetworkFirst(req, url) {
  const net = fetch(url.origin + url.pathname + url.search, { cache: 'no-cache', credentials: 'same-origin' })
    .then((res) => {
      if (res && res.ok && res.type === 'basic') {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put('./index.html', copy)).catch(() => {});
      }
      return res;
    });
  const cached = () => caches.match('./index.html').then((c) => c || caches.match(req, { ignoreSearch: true }));
  const timeout = new Promise((resolve) => setTimeout(resolve, NAV_TIMEOUT_MS)).then(cached);
  return Promise.race([net.catch(cached), timeout.then((c) => c || net)])
    .then((res) => res || net)
    .catch(() => cached().then((c) => c || new Response('Offline', { status: 503, headers: { 'content-type': 'text/plain' } })));
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === self.location.origin && url.pathname.endsWith('/version.json')) {
    e.respondWith(fetch(req, { cache: 'no-store' }).catch(() =>
      new Response('{}', { status: 503, headers: { 'content-type': 'application/json' } })));
    return;
  }
  if (isPageRequest(req, url)) { e.respondWith(pageNetworkFirst(req, url)); return; }
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => cached);
      return cached || fetched;
    })
  );
});

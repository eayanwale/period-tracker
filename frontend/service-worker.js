// Minimal offline app-shell cache. The API lives on a different origin
// (API Gateway), so it's never intercepted here — only same-origin static
// assets are cached.
const CACHE_NAME = 'cycle-app-v3';
const PRECACHE_URLS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/api.js',
  './js/cycle.js',
  './js/config.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  // The API now lives on the same origin as the static assets (one
  // container, see ../server/index.js) -- /logs must never be served
  // from this cache, or a stale cached response would hide newly
  // logged/deleted dates.
  if (url.origin !== self.location.origin || url.pathname.startsWith('/logs')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request).then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      });
    })
  );
});

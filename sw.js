// Service worker — app shell cache with versioning.
// Bump CACHE when any shipped file changes: old caches are deleted on activate.
const CACHE = 'ledger-v1';
const SHELL = ['./', './index.html', './styles.css', './app.js', './db.js', './logic.js', './manifest.json',
  './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png'];

self.addEventListener('install', e => {
  // Do NOT skipWaiting here: the page decides when to switch (no mid-session breakage).
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(hit => hit ||
    fetch(e.request).catch(() => e.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});

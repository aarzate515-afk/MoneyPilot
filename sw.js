/* Plan B: offline shell only — no web push. */
const CACHE = 'moneypilot-shell-v1';
const SHELL = ['./', './index.html', './app.css', './app.js', './chart.js', './manifest.json'];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});
self.addEventListener('fetch', (e) => {
  const u = new URL(e.request.url);
  if (u.pathname.includes('/d/')) return; // never cache live data
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});

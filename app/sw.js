// Network first, cache as the offline fallback. Only touches its own caches:
// every GitHub Pages app of the account shares this origin.
const CACHE = 'ascend-v5';
const SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'core/program.js', 'core/progression.js', 'core/player.js', 'core/store.js', 'core/merge.js', 'data/cloud.js', 'data/ai.js', 'data/photos.js', 'core/coach.js', 'data/firebase-config.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((k) => k.startsWith('ascend-') && k !== CACHE).map((k) => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== location.origin || !url.pathname.startsWith(new URL('./', location).pathname)) return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(event.request, copy)); }
        return res;
      })
      .catch(() => caches.match(event.request, { cacheName: CACHE }).then((hit) => hit ?? caches.match('index.html', { cacheName: CACHE }))),
  );
});

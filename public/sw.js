// AlertNet Service Worker - Network First with Cache Fallback for instant updates
const CACHE_NAME = 'alertnet-v2-tactical';

self.addEventListener('install', (e) => {
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((k) => caches.delete(k)) // Purge old v1 caches
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  // Let API calls pass straight through
  if (e.request.url.includes('/api/')) {
    return;
  }

  // Network first: always fetch fresh from server, only fallback to cache if offline
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        const cloned = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(e.request, cloned));
        return response;
      })
      .catch(() => caches.match(e.request))
  );
});

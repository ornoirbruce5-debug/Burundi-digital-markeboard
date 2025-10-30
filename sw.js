// sw.js
// Minimal service worker for Burundi Digital Marketboard
// Caches app shell and provides offline fallback for navigation and images
const CACHE_NAME = 'bdm-shell-v1';
const OFFLINE_URL = '/index.html';
const ASSETS = [
  '/',
  '/index.html',
  '/styles.css',
  '/manifest.json',
  '/placeholder.png',
  '/icons/192.png',
  '/icons/512.png',
  '/src/app.js'
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
  );
});

// Activate: clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
    ))
  );
  self.clients.claim();
});

// Fetch: navigation requests -> try network then cache OFFLINE_URL; other GETs -> cache-first then network
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // For navigation (SPA) serve index.html from network then cache, fallback to cached index.html
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          // Update cached offline page
          caches.open(CACHE_NAME).then(cache => cache.put(OFFLINE_URL, response.clone()));
          return response;
        })
        .catch(() => caches.match(OFFLINE_URL))
    );
    return;
  }

  // For same-origin assets, try cache first
  if (url.origin === location.origin) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        if (cached) return cached;
        return fetch(event.request)
          .then((res) => {
            // Only cache successful, non-opaque responses
            if (!res || res.status !== 200 || res.type === 'opaque') return res;
            const resClone = res.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, resClone));
            return res;
          })
          .catch(() => {
            // If request is for an image, return placeholder
            if (event.request.destination === 'image') {
              return caches.match('/placeholder.png');
            }
          });
      })
    );
    return;
  }

  // For cross-origin requests, try network then fallback to cache
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});

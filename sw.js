/* sw.js — Service Worker
   Cache static assets, dynamic API responses, provide offline fallback.
   Place this file at project root: /sw.js
*/

const CACHE_VERSION = 'v1';
const STATIC_CACHE = `static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `dynamic-${CACHE_VERSION}`;

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/style.css',
  '/app.js',
  '/fallback-hero.jpg',
  '/fallback-product.jpg',
  '/icon-192.png',
  '/icon-512.png'
];

// Install: cache core assets
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then(cache => cache.addAll(STATIC_ASSETS))
  );
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== STATIC_CACHE && k !== DYNAMIC_CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Utility to trim cache
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxItems) {
    await cache.delete(keys[0]);
    await trimCache(cacheName, maxItems);
  }
}

// Fetch handler
self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Navigation requests: Network First, fallback to index.html
  if (req.mode === 'navigate' || (req.method === 'GET' && req.headers.get('accept')?.includes('text/html'))) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(DYNAMIC_CACHE).then(cache => cache.put(req, resClone));
          return res;
        })
        .catch(async () => {
          const cached = await caches.match('/index.html');
          return cached || new Response('<h1>Offline</h1><p>Subira internet</p>', { headers: { 'Content-Type': 'text/html' } });
        })
    );
    return;
  }

  // API requests to supabase endpoints: Network First then cache fallback
  // (we consider same-origin API; Supabase requests are cross-origin so they bypass SW by default unless proxied)
  if (url.origin === self.location.origin && url.pathname.startsWith('/products')) {
    event.respondWith(
      fetch(req)
        .then(res => {
          const resClone = res.clone();
          caches.open(DYNAMIC_CACHE).then(cache => {
            cache.put(req, resClone);
            trimCache(DYNAMIC_CACHE, 60);
          });
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || new Response(JSON.stringify({ error: 'offline' }), { status: 503, headers: { 'Content-Type': 'application/json' }});
        })
    );
    return;
  }

  // Static assets: Cache First
  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // Don't cache opaque responses (third-party) to avoid quota issues
        if (req.method === 'GET' && res && res.status === 200 && res.type !== 'opaque') {
          const resClone = res.clone();
          caches.open(STATIC_CACHE).then(cache => cache.put(req, resClone));
        }
        return res;
      }).catch(() => {
        if (req.destination === 'image') return caches.match('/fallback-product.jpg');
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

// Allow client to skip waiting
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

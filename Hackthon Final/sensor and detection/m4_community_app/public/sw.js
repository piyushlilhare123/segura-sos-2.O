// M4 — Service Worker
// Caches app shell for offline use

const CACHE_NAME = 'adrs-m4-v1';
const APP_SHELL = [
  '/',
  '/index.html',
  '/src/main.jsx',
  '/src/App.jsx',
  '/src/index.css',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap',
  'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  // Network first for API calls; cache first for assets
  const url = new URL(event.request.url);
  const isAPI = url.hostname === 'localhost';

  if (isAPI) {
    // Try network; on failure return a simple offline JSON stub
    event.respondWith(
      fetch(event.request).catch(() =>
        new Response(JSON.stringify({ status: 'offline', data: [] }), {
          headers: { 'Content-Type': 'application/json' }
        })
      )
    );
  } else {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});

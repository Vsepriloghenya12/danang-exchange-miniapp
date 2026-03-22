const CACHE_VERSION = 'cashalot-pwa-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const APP_SHELL = [
  '/',
  '/manifest.webmanifest',
  '/brand/app-icon-192.png?v=30',
  '/brand/app-icon-512.png?v=30',
  '/brand/apple-touch-icon.png?v=30',
  '/brand/main-logo-light.png?v31-light',
  '/brand/main-logo-dark.png?v31-dark'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL.map((u) => new Request(u, { cache: 'reload' }))).catch(() => undefined))
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => ![STATIC_CACHE, RUNTIME_CACHE].includes(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

function isCacheableStatic(request) {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/api/')) return false;
  const dest = request.destination;
  return ['style', 'script', 'image', 'font', 'manifest', 'video'].includes(dest);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);
        cache.put(request, fresh.clone()).catch(() => undefined);
        return fresh;
      } catch {
        return (await caches.match(request)) || (await caches.match('/')) || Response.error();
      }
    })());
    return;
  }

  if (!isCacheableStatic(request)) return;

  event.respondWith((async () => {
    const cached = await caches.match(request);
    const fetchPromise = fetch(request)
      .then(async (response) => {
        if (response && response.ok) {
          const cache = await caches.open(RUNTIME_CACHE);
          cache.put(request, response.clone()).catch(() => undefined);
        }
        return response;
      })
      .catch(() => cached);

    return cached || fetchPromise;
  })());
});

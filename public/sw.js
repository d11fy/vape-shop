/*
 * ڤيب شوب — service worker.
 *
 * Deliberately conservative, because this is a multi-tenant financial app:
 *
 *  - Fingerprinted build assets (/_next/static) and icons are cached
 *    cache-first: they never change under the same URL, so the app shell loads
 *    instantly and survives a flaky connection.
 *  - Pages are NEVER cached. Every HTML response carries one store's data for
 *    one signed-in person; on a shared shop device a cached page could outlive
 *    the session that was allowed to see it. Navigations go to the network and
 *    fall back to a static offline page.
 *  - API calls and server actions (anything not GET) pass straight through.
 *    Money is never "saved offline": a sale queued on a device while stock
 *    moves elsewhere is how shops end up selling what they do not have. The
 *    idempotency keys on every financial action make a retry after
 *    reconnecting safe instead.
 */

const VERSION = 'v1';
const STATIC_CACHE = `vapeshop-static-${VERSION}`;
const OFFLINE_URL = '/offline.html';
const PRECACHE = [
  OFFLINE_URL,
  '/manifest.webmanifest',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key.startsWith('vapeshop-') && key !== STATIC_CACHE)
            .map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Page loads: network only, with an honest offline page when it fails.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(OFFLINE_URL).then((page) => page ?? Response.error())),
    );
    return;
  }

  // Immutable build output and icons: cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
  // Everything else — API routes, RSC payloads, receipts — goes to the network untouched.
});

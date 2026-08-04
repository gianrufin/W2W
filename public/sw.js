/*
 * W2W service worker.
 *
 * Scope is wherever this file is served from, so the same worker works at the
 * root in dev and under /W2W/ on GitHub Pages without any build-time base-path
 * substitution — every path below is resolved relative to the worker's own URL.
 *
 * Strategy by request type:
 *   navigation      network-first, falling back to the cached app shell so the
 *                   app opens offline instead of showing the browser error page
 *   static assets   cache-first (Next fingerprints these, so they are immutable)
 *   map tiles       stale-while-revalidate, capped, so panning over ground you
 *                   have already covered works without a connection
 *   everything else network, untouched
 */

const VERSION = 'w2w-v1';
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const TILE_CACHE = `${VERSION}-tiles`;
const MAX_TILES = 300;

const BASE = new URL('./', self.location).pathname;

const SHELL_URLS = [BASE, `${BASE}manifest.webmanifest`, `${BASE}icons/icon-192.png`];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      // A single missing entry must not fail the whole install.
      .then((cache) => Promise.allSettled(SHELL_URLS.map((u) => cache.add(u))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

function isTile(url) {
  return /tile\.openstreetmap|basemaps\.cartocdn|api\.maptiler/.test(url.hostname + url.pathname);
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith(`${BASE}_next/static/`) ||
    /\.(?:css|js|woff2?|png|jpg|jpeg|svg|webp|ico)$/.test(url.pathname)
  );
}

/** Trim a cache to a maximum entry count, oldest first. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  // App shell — network-first so a fresh deploy is picked up immediately.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(BASE, copy));
          return response;
        })
        .catch(() => caches.match(BASE).then((hit) => hit ?? Response.error())),
    );
    return;
  }

  // Fingerprinted assets — cache-first.
  if (isStaticAsset(url) && url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request).then(
        (hit) =>
          hit ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Map tiles — serve what we have, refresh in the background.
  if (isTile(url)) {
    event.respondWith(
      caches.match(request).then((hit) => {
        const network = fetch(request)
          .then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(TILE_CACHE).then(async (c) => {
                await c.put(request, copy);
                trim(TILE_CACHE, MAX_TILES);
              });
            }
            return response;
          })
          .catch(() => hit ?? Response.error());
        return hit ?? network;
      }),
    );
  }
});

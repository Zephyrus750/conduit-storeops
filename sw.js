/* Conduit service worker. Ported from the chassis (K2B's release patterns):
   the ATOMIC RELEASE SWITCH. Install writes the COMPLETE app shell into one
   release cache, same-origin requests are served cache-first from that
   release only, and a new version takes over solely through the
   install → (user consent) → activate cycle. A running app never mixes
   files from two releases, and updates never flicker in one file at a time
   on store wifi.

   The precache is the shell alone (sw-precache.js, generated): maps come
   from the map route and live in IndexedDB with the outbox and snapshot,
   and every API call goes to the worker uncached. Cache names are
   brand-neutral (suite-*). */

importScripts('./sw-precache.js');

const APP_VERSION = self.PRECACHE.version;
const BUILD = self.PRECACHE.build;
const CACHE_NAME = 'suite-app-' + BUILD;
const ASSETS = self.PRECACHE.files;
// Bundled fallback maps (maps/<no>.svg) survive releases and serve
// network-first, so a re-exported file arrives without an app release.
const MAP_CACHE = 'suite-maps-v1';

/* Install: the whole shell, or nothing. NO skipWaiting: activating at once
   would fire controllerchange and reload the page mid-shift. The new worker
   waits until the app posts SKIP_WAITING after the person accepts the
   update, or until every tab is closed. */
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)));
});

/* Activate: drop every other release cache; the map cache survives. */
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith('suite-app-') && k !== CACHE_NAME).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

/* Messages: SKIP_WAITING (a string or { type }) applies a waiting update;
   GET_VERSION answers on the port with what this worker ships. */
self.addEventListener('message', event => {
  const d = event.data;
  if (!d) return;
  if (d === 'SKIP_WAITING' || d.type === 'SKIP_WAITING') self.skipWaiting();
  if (d.type === 'GET_VERSION' && event.ports && event.ports[0]) event.ports[0].postMessage({ version: APP_VERSION, build: BUILD });
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Cross-origin (the worker API, product images): straight through, uncached.
  if (url.origin !== self.location.origin) return;

  // Bundled maps: network-first with the surviving cache behind it.
  if (url.pathname.includes('/maps/')) {
    event.respondWith(
      fetch(req).then(res => { if (res && res.ok) { const c = res.clone(); caches.open(MAP_CACHE).then(cache => cache.put(req, c)).catch(() => {}); } return res; })
        .catch(() => caches.match(req, { cacheName: MAP_CACHE }).then(c => c || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }))),
    );
    return;
  }

  // Navigations: the shell itself, from this release. ?worker= and other
  // query strings never change which file that is.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('./index.html', { cacheName: CACHE_NAME }).then(c => c || fetch(req))
        .catch(() => new Response('Offline and not installed yet', { status: 503, headers: { 'Content-Type': 'text/plain' } })),
    );
    return;
  }

  // Everything else same-origin: cache-first from this release, network as
  // the fallback for anything not precached (filling the cache for offline).
  event.respondWith(
    caches.match(req, { cacheName: CACHE_NAME, ignoreSearch: true }).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        if (res && res.ok && res.type === 'basic') { const c = res.clone(); caches.open(CACHE_NAME).then(cache => cache.put(url.pathname, c)).catch(() => {}); }
        return res;
      }).catch(() => new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } }));
    }),
  );
});

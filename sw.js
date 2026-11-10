// Plainpen service worker: makes the app work offline. Same-origin GET only.
//  * Pages, scripts and styles: network first, so a new release shows up immediately.
//    The cache is only the offline fallback.
//  * Fonts and the dictionary never change between releases: cache first (fast, offline).
const VERSION = 'plainpen-v3';
const CORE = ['./', 'index.html', 'privacy.html', 'terms.html', 'js/legal.js', 'style.css', 'design/tokens.css', 'manifest.webmanifest', 'icon.svg', 'js/app.js', 'js/engine.js', 'js/lexicon.js', 'js/profile.js', 'js/store.js', 'js/textcase.js', 'js/worker.js', 'js/config.js', 'data/words.txt',
  'fonts/poppins-latin-400-normal.woff2', 'fonts/poppins-latin-500-normal.woff2', 'fonts/poppins-latin-600-normal.woff2', 'fonts/poppins-latin-700-normal.woff2', 'fonts/caveat-latin-600-normal.woff2', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/bmc-button.svg', 'icons/bmc-logo.svg'];
const STATIC = /\/(fonts|data)\//;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  // Web Share Target: text shared from another app is kept on the device. It is read here,
  // parked in a local cache, and the page is opened. It is never forwarded to any server.
  if (req.method === 'POST' && url.origin === self.location.origin && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      try {
        const form = await req.formData();
        const text = [form.get('title'), form.get('text')].filter((v) => typeof v === 'string' && v.trim()).join('\n\n').slice(0, 2000000);
        const c = await caches.open('plainpen-share');
        await c.put('shared-text', new Response(text, { headers: { 'Content-Type': 'text/plain' } }));
      } catch {}
      return Response.redirect('./?shared=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (STATIC.test(url.pathname)) {
      const hit = await cache.match(req, { ignoreSearch: true });
      if (hit) return hit;
    }
    try {
      const fresh = await fetch(req, { cache: 'no-cache' });
      if (fresh && fresh.ok) cache.put(req, fresh.clone());
      return fresh;
    } catch {
      const hit = await cache.match(req, { ignoreSearch: true });
      return hit || new Response('Offline', { status: 503, headers: { 'Content-Type': 'text/plain' } });
    }
  })());
});

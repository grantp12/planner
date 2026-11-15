// Service worker: makes the app work offline.
//
// On a real host it's cache-first: the app opens instantly, even with no
// signal. Bump VERSION whenever you deploy changes so phones pick them up
// (the new version is downloaded in the background and used on next launch).
// On localhost it's network-first, so edits show up on a normal reload.

const VERSION = 'v2';
const CACHE = `planner-${VERSION}`;
const ASSETS = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/styles.css',
  'js/app.js',
  'js/db.js',
  'js/store.js',
  'js/time.js',
  'js/windows.js',
  'js/scheduler.js',
  'js/rollover.js',
  'js/ics.js',
  'js/ui.js',
  'js/views/today.js',
  'js/views/plan.js',
  'js/views/checkin.js',
  'js/views/settings.js',
  'js/views/onboarding.js',
  'js/views/timeline.js',
  'js/views/block-sheet.js',
  'js/views/routine-editor.js',
  'js/views/fields.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
];
const DEV = ['localhost', '127.0.0.1', '[::1]'].includes(self.location.hostname);

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS.map((u) => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('planner-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function fromNetwork(req) {
  const res = await fetch(req);
  if (res.ok) {
    const cache = await caches.open(CACHE);
    cache.put(req, res.clone());
  }
  return res;
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  const offlineFallback = () => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'));
  if (DEV) {
    e.respondWith(fromNetwork(req).catch(offlineFallback));
  } else {
    e.respondWith(caches.match(req, { ignoreSearch: true }).then((hit) => hit || fromNetwork(req).catch(offlineFallback)));
  }
});

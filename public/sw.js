// Service worker: lets Riverbend be installed as an app and played offline.
// Network first, so a connected player always gets the newest version; the
// cache is the fallback when the river is out of signal range.

const CACHE = 'riverbend-v1';
const SHELL = [
  './',
  './data/conditions.json',
  './data/gear.json',
  './data/river.json',
  './data/water.json',
  './icon.svg',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-src.svg',
  './icons/maskable-512.png',
  './js/audio.js',
  './js/fish.js',
  './js/fishcard.js',
  './js/flies.js',
  './js/fx.js',
  './js/insects.js',
  './js/install.js',
  './js/main.js',
  './js/minimap.js',
  './js/rig.js',
  './js/sim.js',
  './js/tackle.js',
  './js/tutorial.js',
  './js/wildlife.js',
  './js/world.js',
  './manifest.webmanifest',
  './style.css',
  './vendor/lines/Line2.js',
  './vendor/lines/LineGeometry.js',
  './vendor/lines/LineMaterial.js',
  './vendor/lines/LineSegments2.js',
  './vendor/lines/LineSegmentsGeometry.js',
  './vendor/three.module.js',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const fonts = url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
  if (url.origin !== self.location.origin && !fonts) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok || res.type === 'opaque') {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./') : Response.error()))),
  );
});

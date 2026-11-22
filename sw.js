// VOITH TURBO — Precision Metrology OS • Service Worker v11.1 (Modular Cache & Offline Engine)
const CACHE_APP = 'voith-metrologia-app-v11-1';
const CACHE_CDN = 'voith-metrologia-cdn-v11-1';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './css/tailwind.css',
    './css/cockpit.css',
    './js/utils.js',
    './js/db.js',
    './js/cloud.js',
    './js/views.js',
    './js/app.js',
    './data/seed.tsv'
];

const BYPASS_HOSTS = ['script.google.com', 'script.googleusercontent.com'];
const CACHE_FIRST_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.sheetjs.com'];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_APP)
            .then((cache) => cache.addAll(APP_SHELL))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys.filter((k) => k !== CACHE_APP && k !== CACHE_CDN).map((k) => caches.delete(k))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch { return; }

    if (BYPASS_HOSTS.some((h) => url.hostname.endsWith(h))) return;

    if (CACHE_FIRST_HOSTS.some((h) => url.hostname.endsWith(h))) {
        event.respondWith(
            caches.open(CACHE_CDN).then((cache) =>
                cache.match(req).then((cached) => {
                    if (cached) return cached;
                    return fetch(req).then((res) => {
                        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
                        return res;
                    });
                })
            )
        );
        return;
    }

    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.open(CACHE_APP).then((cache) =>
                cache.match(req).then((cached) => {
                    const networkFetch = fetch(req, { cache: 'no-cache' }).then((res) => {
                        if (res && res.ok) cache.put(req, res.clone());
                        return res;
                    }).catch(() => cached);
                    return cached || networkFetch;
                })
            )
        );
    }
});

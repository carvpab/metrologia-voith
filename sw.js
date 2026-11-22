// VOITH TURBO — Precision Metrology OS • Service Worker v11.5 (Network-First + Offline Cache)
const CACHE_APP = 'voith-metrologia-app-v11-5';
const CACHE_CDN = 'voith-metrologia-cdn-v11-5';
const APP_SHELL = [
    './',
    './index.html',
    './manifest.json',
    './css/tailwind.css?v=11.5',
    './css/cockpit.css?v=11.5',
    './js/utils.js?v=11.5',
    './js/db.js?v=11.5',
    './js/cloud.js?v=11.5',
    './js/views.js?v=11.5',
    './js/app.js?v=11.5',
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

    // 1. Google Sheets / Apps Script: sempre direto na rede
    if (BYPASS_HOSTS.some((h) => url.hostname.endsWith(h))) return;

    // 2. Fontes e SheetJS: Cache-First
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

    // 3. Arquivos do app (HTML/CSS/JS/TSV): Network-First com fallback automático para cache offline
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.open(CACHE_APP).then((cache) =>
                fetch(req, { cache: 'no-cache' }).then((res) => {
                    if (res && res.ok) cache.put(req, res.clone());
                    return res;
                }).catch(() => cache.match(req))
            )
        );
    }
});

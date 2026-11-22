// VOITH TURBO — Precision Metrology OS • Service Worker v10a4 (Background Cache & Offline Engine)
const CACHE_APP = 'voith-metrologia-app-v10a4';
const CACHE_CDN = 'voith-metrologia-cdn-v10a4';
const APP_SHELL = ['./', './index.html', './manifest.json'];

// Nunca interceptar o Google Apps Script (Cloud Sync e Login precisam ser sempre ao vivo!)
const BYPASS_HOSTS = ['script.google.com', 'script.googleusercontent.com'];
const CACHE_FIRST_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdnjs.cloudflare.com', 'cdn.sheetjs.com'];

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

    // 1. Google Sheets / Apps Script: 100% direto da rede
    if (BYPASS_HOSTS.some((h) => url.hostname.endsWith(h))) return;

    // 2. Fontes, FontAwesome e SheetJS: Cache-First (zero downloads repetidos)
    if (CACHE_FIRST_HOSTS.some((h) => url.hostname.endsWith(h))) {
        event.respondWith(
            caches.open(CACHE_CDN).then((cache) =>
                cache.match(req).then((cached) => {
                    if (cached) return cached;
                    return fetch(req).then((res) => {
                        if (res && (res.ok || res.type === 'opaque')) {
                            cache.put(req, res.clone());
                        }
                        return res;
                    });
                })
            )
        );
        return;
    }

    // 3. Mesmo domínio (index.html, manifest.json): Stale-While-Revalidate (abre em ~15ms e atualiza em segundo plano)
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

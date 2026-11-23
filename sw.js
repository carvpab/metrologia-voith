// Voith Metrology OS v16.20 — Limpa caches antigos do Service Worker para garantir OTA instantâneo
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) {
    e.waitUntil(
        caches.keys().then(function (keys) {
            return Promise.all(keys.map(function (k) { return caches.delete(k); }));
        }).then(function () { return self.clients.claim(); })
    );
});

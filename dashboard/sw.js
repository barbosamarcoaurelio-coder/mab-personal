const CACHE_NAME = 'mab-dashboard-v1';
const URLS_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Instalar Service Worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            return cache.addAll(URLS_TO_CACHE).catch(err => {
                console.log('Cache não pôde ser carregado completamente:', err);
                return cache.add('/index.html');
            });
        })
    );
    self.skipWaiting();
});

// Ativar Service Worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Estratégia: Network First, fallback para Cache
self.addEventListener('fetch', event => {
    // Ignorar requisições não-GET
    if (event.request.method !== 'GET') {
        return;
    }

    // Para APIs GitHub, usar network-first com cache fallback
    if (event.request.url.includes('api.github.com')) {
        event.respondWith(
            fetch(event.request)
                .then(response => {
                    if (!response || response.status !== 200) {
                        return response;
                    }

                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });

                    return response;
                })
                .catch(err => {
                    // Fallback para cache se offline
                    return caches.match(event.request)
                        .then(response => {
                            return response || new Response('Dados não disponíveis offline', {
                                status: 503,
                                statusText: 'Service Unavailable'
                            });
                        });
                })
        );
        return;
    }

    // Para outros recursos, cache-first
    event.respondWith(
        caches.match(event.request).then(response => {
            return response || fetch(event.request).then(response => {
                if (!response || response.status !== 200) {
                    return response;
                }

                const responseToCache = response.clone();
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, responseToCache);
                });

                return response;
            }).catch(err => {
                return new Response('Recurso não disponível', {
                    status: 503,
                    statusText: 'Service Unavailable'
                });
            });
        })
    );
});

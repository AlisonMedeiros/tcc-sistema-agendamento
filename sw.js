const CACHE_NAME = 'gudem-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/style.css',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  const isApiRequest = event.request.url.includes('/servicos') || 
                       event.request.url.includes('/pagamentos') || 
                       event.request.url.includes('/agendamentos') ||
                       event.request.url.includes('/agendar');

  if (isApiRequest) {
      if(event.request.method !== 'GET') {
          return;
      }
      event.respondWith(
        fetch(event.request).then(response => {
            return caches.open(CACHE_NAME).then(cache => {
                cache.put(event.request, response.clone());
                return response;
            });
        }).catch(() => {
            return caches.match(event.request);
        })
      );
      return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
            fetch(event.request).then(res => {
                caches.open(CACHE_NAME).then(cache => {
                    cache.put(event.request, res.clone());
                });
            }).catch(() => {});
            return response;
        }
        return fetch(event.request);
      }
    )
  );
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

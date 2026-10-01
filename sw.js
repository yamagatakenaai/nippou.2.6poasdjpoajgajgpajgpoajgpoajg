const CACHE_NAME = 'nippou-pwa-v2.2.1';
const urlsToCache = [
  './index.html',
  './style.css?v=2.2.1',
  './app.js?v=2.2.1',
  './manifest.json',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  // GASへのPOSTリクエストはキャッシュしないよう除外
  if (event.request.method === 'POST') {
    return;
  }

  // ネットワーク優先のキャッシュ戦略 (データが古くなるのを防ぐため)
  event.respondWith(
    fetch(event.request)
      .then(response => {
        // レスポンスが正常な場合はキャッシュを更新して返す
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // オフライン時はキャッシュから返す
        return caches.match(event.request);
      })
  );
});

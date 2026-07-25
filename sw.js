/* Service Worker v6 - 稳定版 */
/* 提供离线缓存支持，使 PWA 可安装 */

var CACHE_NAME = 'baodan-v6';
var urlsToCache = [
  '/liwenhao/baodanguanli.html',
  '/liwenhao/manifest.json',
  '/liwenhao/icon-192.png',
  '/liwenhao/icon-512.png'
];

self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      return self.clients.claim();
    })
  );
});

self.addEventListener('fetch', function(event) {
  /* 对 APK 文件不缓存，直接走网络 */
  if (event.request.url.indexOf('.apk') !== -1) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(
    caches.match(event.request).then(function(response) {
      return response || fetch(event.request);
    })
  );
});

/* 接收 SKIP_WAITING 消息 */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
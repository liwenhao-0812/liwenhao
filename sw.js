/* Service Worker - 保单管理系统离线缓存 */
var CACHE_NAME = 'policy-manager-v1';
var urlsToCache = [
  '保单管理系统.html',
  'manifest.json',
  'icon-192.png',
  'icon-512.png'
];

/* 安装 */
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      console.log('SW: 缓存资源');
      return cache.addAll(urlsToCache);
    })
  );
});

/* 激活 - 清理旧缓存 */
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
    })
  );
});

/* 拦截请求 - 网络优先，失败回退缓存 */
self.addEventListener('fetch', function(event) {
  /* 跳过非 GET 请求和 CDN 资源 */
  if (event.request.method !== 'GET') return;
  if (event.request.url.indexOf('cdn.jsdelivr.net') !== -1) {
    /* CDN 资源：缓存优先 */
    event.respondWith(
      caches.match(event.request).then(function(response) {
        return response || fetch(event.request).then(function(fetchResponse) {
          return caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, fetchResponse.clone());
            return fetchResponse;
          });
        });
      })
    );
    return;
  }
  /* 本地资源：网络优先，离线时回退缓存 */
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});
/* Service Worker - 保单管理系统离线缓存 v4 */
var CACHE_NAME = 'policy-manager-v4';
var urlsToCache = [
  '/liwenhao/baodanguanli.html',
  '/liwenhao/index.html',
  '/liwenhao/manifest.json',
  '/liwenhao/icon-192.png',
  '/liwenhao/icon-512.png'
];

/* 安装 - 立即激活，不等待旧 SW 释放 */
self.addEventListener('install', function(event) {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache);
    })
  );
});

/* 激活 - 清理旧缓存，接管所有页面 */
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

/* 拦截请求 - 网络优先（HTML），缓存优先（静态资源） */
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;

  /* HTML 文件：网络优先，确保拿到最新版本 */
  if (event.request.url.indexOf('baodanguanli.html') !== -1 || event.request.url.indexOf('index.html') !== -1) {
    event.respondWith(
      fetch(event.request).then(function(fetchResponse) {
        return caches.open(CACHE_NAME).then(function(cache) {
          cache.put(event.request, fetchResponse.clone());
          return fetchResponse;
        });
      }).catch(function() {
        return caches.match(event.request);
      })
    );
    return;
  }

  /* CDN 资源：缓存优先 */
  if (event.request.url.indexOf('cdn.jsdelivr.net') !== -1) {
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

  /* 其他资源：网络优先，离线回退缓存 */
  event.respondWith(
    fetch(event.request).catch(function() {
      return caches.match(event.request);
    })
  );
});

/* 监听来自页面的消息 */
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
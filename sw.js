/* Service Worker - 保单管理系统离线缓存 v3 */
var CACHE_NAME = 'policy-manager-v3';
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
      console.log('SW: 缓存资源');
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
          console.log('SW: 删除旧缓存', name);
          return caches.delete(name);
        })
      );
    }).then(function() {
      /* 接管所有打开的页面，广播更新消息 */
      return self.clients.claim().then(function() {
        return self.clients.matchAll().then(function(clients) {
          clients.forEach(function(client) {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
          });
        });
      });
    })
  );
});

/* 拦截请求 - 网络优先，失败回退缓存 */
self.addEventListener('fetch', function(event) {
  if (event.request.method !== 'GET') return;
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
  /* 本地资源：网络优先，离线时回退缓存 */
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
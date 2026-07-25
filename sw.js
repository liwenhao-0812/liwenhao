/* Service Worker v5 - 自毁清理版 */
/* 激活后立即清除所有缓存并注销自己 */
self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          console.log('SW: 删除缓存', name);
          return caches.delete(name);
        })
      );
    }).then(function() {
      /* 注销自己 */
      return self.registration.unregister();
    }).then(function() {
      console.log('SW: 已注销，所有缓存已清除');
      return self.clients.claim();
    })
  );
});

/* 所有请求直接走网络，不缓存 */
self.addEventListener('fetch', function(event) {
  event.respondWith(fetch(event.request));
});
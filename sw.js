/* Service Worker v10 - 自毁版 */
/* 清除所有缓存并注销自身，彻底移除PWA功能 */

self.addEventListener('install', function(event) {
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.map(function(name) {
          return caches.delete(name);
        })
      );
    }).then(function() {
      /* 清除所有缓存后，注销自己 */
      return self.registration.unregister();
    })
  );
});

self.addEventListener('fetch', function(event) {
  /* 直接走网络，不缓存任何内容 */
  event.respondWith(fetch(event.request));
});
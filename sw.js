const CACHE_NAME = 'jtech-v9';

// 앱 구동에 필수적인 동일 출처 핵심 정적 자산
const CORE_ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.json'
];

// 존재할 경우 함께 캐싱할 아이콘/파비콘 자산 (일부 누락되어도 설치 실패 방지)
const OPTIONAL_ASSETS = [
  './favicon-32x32.png',
  './favicon-16x16.png',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      await cache.addAll(CORE_ASSETS);
      await Promise.allSettled(
        OPTIONAL_ASSETS.map((url) => cache.add(url))
      );
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;

  // Firebase 통신 및 외부 도메인 요청은 캐시하지 않고 네트워크로 직접 전달
  if (
    url.origin !== self.location.origin ||
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firebasedatabase.app') ||
    url.hostname.includes('gstatic.com')
  ) {
    return;
  }

  // 동일 출처 정적 자산: Cache-First (캐시 즉시 응답 + 온라인 시 백그라운드 갱신)
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      const networkUpdate = fetch(request)
        .then((networkResponse) => {
          if (
            networkResponse &&
            networkResponse.status === 200 &&
            networkResponse.type === 'basic'
          ) {
            const responseClone = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(request, responseClone);
            });
          }
          return networkResponse;
        })
        .catch(() => null);

      // 1. 캐시가 있으면 네트워크 응답을 기다리지 않고 즉시 UI 반환
      if (cachedResponse) {
        event.waitUntil(networkUpdate);
        return cachedResponse;
      }

      // 2. 캐시가 없는 최초 요청은 네트워크 응답 반환, 오프라인 페이지 이동 시 index.html 폴백
      return networkUpdate.then((networkResponse) => {
        if (networkResponse) return networkResponse;
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
        return new Response('Offline', { status: 503, statusText: 'Offline' });
      });
    })
  );
});

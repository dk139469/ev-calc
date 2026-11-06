/* 전기차 충전기 계산기 - Service Worker
 * 앱을 수정해서 다시 배포할 때는 CACHE_VERSION 숫자를 올려주세요. (예: v1 -> v2)
 */
const CACHE_VERSION = 'v1';
const CACHE_NAME = 'ev-charger-calc-' + CACHE_VERSION;

// 같은 폴더의 핵심 파일 (하나라도 실패하면 설치 실패)
const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// 외부 CDN 파일 (실패해도 설치는 계속 진행, 이후 사용 시 자동 캐시)
const CDN_ASSETS = [
  'https://unpkg.com/lucide@1.43.0/dist/umd/lucide.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.5.1/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,500;0,600;1,400&family=IBM+Plex+Sans:ital,wght@0,300;0,400;0,500;0,600;0,700;1,400&family=Noto+Sans+KR:wght@300;400;500;600;700&display=swap'
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(CORE_ASSETS);
    await Promise.allSettled(
      CDN_ASSETS.map((url) => cache.add(new Request(url, { mode: 'cors' })))
    );
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('ev-charger-calc-') && k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 페이지 이동: 네트워크 우선(최신 버전 반영) -> 실패 시 캐시된 index.html
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        if (fresh && fresh.ok) {
          const cache = await caches.open(CACHE_NAME);
          cache.put('./index.html', fresh.clone());
        }
        return fresh;
      } catch (err) {
        const cached = await caches.match('./index.html');
        return cached || new Response('오프라인 상태입니다.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    })());
    return;
  }

  // 그 외(JS/CSS/폰트/이미지): 캐시 우선 + 백그라운드 갱신
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(req);

    const network = fetch(req)
      .then((res) => {
        if (res && (res.ok || res.type === 'opaque')) {
          cache.put(req, res.clone());
        }
        return res;
      })
      .catch(() => null);

    if (cached) {
      event.waitUntil(network);
      return cached;
    }
    const res = await network;
    return res || new Response('', { status: 504, statusText: 'Offline' });
  })());
});

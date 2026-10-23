/* 考研词汇 PWA 的 Service Worker：预缓存核心资源 + 音频按需缓存 + 离线优先 */
const VERSION = 'v6';
const CORE_CACHE = `vocab-core-${VERSION}`;
const AUDIO_CACHE = `vocab-audio-${VERSION}`;
const AUDIO_HOST = 'dict.youdao.com';

const CORE_ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './data/vocab.json',
  './data/roots.json',
  './favicon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CORE_CACHE);
      // 逐个添加：单个资源失败不拖垮整个安装
      await Promise.all(
        CORE_ASSETS.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)),
      );
      await precacheBuild(cache);
      await self.skipWaiting();
    })(),
  );
});

/** 读 index.html，把本次构建的 hash 资源（assets/*.js|css）也提前缓存，首次访问后即可离线 */
async function precacheBuild(cache) {
  try {
    const response = await fetch('./index.html', { cache: 'reload' });
    if (!response.ok) return;
    const html = await response.text();
    const urls = Array.from(html.matchAll(/(?:src|href)="([^"]+)"/g))
      .map((match) => match[1])
      .filter((url) => url.includes('/assets/'));
    await Promise.all(
      urls.map((url) => cache.add(new Request(url, { cache: 'reload' })).catch(() => undefined)),
    );
  } catch {
    // 首次安装取不到 index.html 时，退回运行时缓存
  }
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((key) => key !== CORE_CACHE && key !== AUDIO_CACHE)
          .map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  // ignoreVary：预缓存时的请求没有 Origin 头，而页面里带 crossorigin 的请求有，
  // 服务端又回了 `Vary: Origin`，不忽略 Vary 就会「明明缓存了却匹配不到」
  const hit = await cache.match(request, { ignoreVary: true });
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok || response.type === 'opaque') {
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request, { ignoreVary: true });
  const network = fetch(request)
    .then((response) => {
      if (response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);
  return hit || (await network) || new Response('离线且没有缓存', { status: 503 });
}

async function navigationHandler(request) {
  let response = null;
  try {
    response = await fetch(request);
  } catch {
    response = null;
  }
  // 网络不可用，或服务端返回 5xx（部署切换、后端挂了）都回落到缓存的 index.html
  if (response && response.ok) {
    const cache = await caches.open(CORE_CACHE);
    cache.put('./index.html', response.clone());
    return response;
  }
  const cache = await caches.open(CORE_CACHE);
  const fallback =
    (await cache.match('./index.html', { ignoreVary: true })) || (await cache.match('./', { ignoreVary: true }));
  return (
    fallback ||
    new Response('当前离线，且没有缓存页面。请联网打开一次后再试。', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  );
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // 页面导航：网络优先，失败回落缓存的 index.html
  if (request.mode === 'navigate') {
    event.respondWith(navigationHandler(request));
    return;
  }

  // 词典音频：缓存优先，允许 opaque 响应
  if (url.hostname === AUDIO_HOST) {
    event.respondWith(cacheFirst(request, AUDIO_CACHE).catch(() => Response.error()));
    return;
  }

  // 同源静态资源：先给缓存，后台更新
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request, CORE_CACHE));
  }
});

(async () => {
  const cache = await caches.open('vocab-core-v4');
  const keys = await cache.keys();
  const asset = keys.find((request) => request.url.includes('index-DJvzp5HO.js'));
  if (!asset) return 'asset key missing';
  const stored = await cache.match(asset);
  const byString = await cache.match(asset.url);
  const byPath = await cache.match(new URL(asset.url).pathname);
  const plainNew = await cache.match(new Request(asset.url));
  return JSON.stringify(
    {
      keyUrl: asset.url,
      keyMode: asset.mode,
      keyCredentials: asset.credentials,
      keyHeaders: [...asset.headers],
      stored: Boolean(stored),
      storedType: stored?.type,
      storedStatus: stored?.status,
      storedHeaders: stored ? [...stored.headers] : null,
      matchByString: Boolean(byString),
      matchByPath: Boolean(byPath),
      matchPlainNewRequest: Boolean(plainNew),
      liveStyleRequest: Boolean(await cache.match(new Request(asset.url, { mode: 'cors', credentials: 'same-origin' }))),
    },
    null,
    1,
  );
})();

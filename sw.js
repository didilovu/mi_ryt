const ROOT = new URL('./', self.location.href).href;
// Scope the cache to this installation so other apps on the same domain keep their caches.
const PREFIX = `moy-ritm-${new URL(ROOT).pathname}-`;
const CACHE = PREFIX + 'moy-ritm-39f3c57a8174';
const ASSETS = ["assets/charts-BsEDvrt-.js","assets/index-D1kfNtrm.js","assets/index-hW_h-KiG.css","assets/vendor-DkU-GevM.js"];
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(['./', 'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png', ...ASSETS].map(path=>new URL(path,ROOT).href));
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for(const name of await caches.keys()) if(name.startsWith(PREFIX)&&name!==CACHE) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  if(event.request.method!=='GET'||!event.request.url.startsWith(ROOT)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if(event.request.mode==='navigate') return (await cache.match(ROOT,{ignoreVary:true}))||fetch(event.request);
    return (await cache.match(event.request,{ignoreVary:true}))||fetch(event.request);
  })());
});

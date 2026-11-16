/* Know your Chinese service worker: works offline; code is fetched fresh when online, sounds and pictures come from the cache. Bump VERSION when files change. */
const VERSION = 'cp-v12';
const SHELL = [
  './', 'index.html', 'manifest.json', 'css/style.css', 'css/game.css',
  'js/config.js', 'js/course.js', 'js/course-extra.js', 'js/explanations.js', 'js/pinyin.js', 'js/audio.js', 'js/engine.js', 'js/game.js', 'js/practice.js', 'js/access.js', 'js/app.js',
  'sounds/clap.mp3', 'sounds/sad-tune.mp3', 'sounds/emotional-damage.mp3', 'sounds/QuestionTag.mp3', 'sounds/bed.mp3',
  'img/welcome.jpeg', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/maskable-512.png', 'icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// Safari/iOS asks media for byte ranges; answer them from the cached full file.
async function rangeResponse(req, cache) {
  const full = await cache.match(req.url);
  if (!full) return fetch(req);
  const buf = await full.arrayBuffer();
  const m = /bytes=(\d*)-(\d*)/.exec(req.headers.get('range') || '');
  const start = m && m[1] ? +m[1] : 0;
  const end = m && m[2] ? Math.min(+m[2], buf.byteLength - 1) : buf.byteLength - 1;
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: { 'Content-Type': full.headers.get('Content-Type') || 'audio/mpeg', 'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`, 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes' }
  });
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;            // never touch Gemini / other origins
  e.respondWith((async () => {
    const cache = await caches.open(VERSION);
    if (req.headers.has('range')) return rangeResponse(req, cache);
    const isCode = req.mode === 'navigate' || /\.(html|js|css|json)$/.test(url.pathname) || url.pathname.endsWith('/');
    if (isCode) {                                            // code: network first, so a new version never mixes with old files; cache when offline
      try { const res = await fetch(req); if (res && res.ok) cache.put(req, res.clone()); return res; }
      catch (err) {
        const hit = await cache.match(req, { ignoreSearch: true });
        if (hit) return hit;
        if (req.mode === 'navigate') return (await cache.match('index.html')) || Response.error();
        return Response.error();
      }
    }
    const hit = await cache.match(req, { ignoreSearch: true });   // sounds and pictures: cache first
    if (hit) return hit;
    const res = await fetch(req).catch(() => null);
    if (res && res.ok) cache.put(req, res.clone());
    return res || Response.error();
  })());
});

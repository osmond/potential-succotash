const CACHE = 'plant-tracker-v5';
const ASSETS = [
  '/',
  'index.html',
  'styles.css',
  'tailwind.css',
  'app.js',
  'db.js',
  'health.html',
  'manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if(req.method !== 'GET') return;
  const accept = req.headers.get('accept') || '';
  // Network-first for HTML navigations to avoid stale pages
  if(req.mode === 'navigate' || accept.includes('text/html')){
    e.respondWith(
      fetch(req).then(resp => {
        const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy));
        return resp;
      }).catch(() => caches.match(req).then(r => r || caches.match('index.html')))
    );
    return;
  }
  const url = new URL(req.url);
  const isStatic = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');
  if(isStatic){
    // Stale-while-revalidate for JS/CSS
    e.respondWith(
      caches.match(req).then(cached => {
        const fetchPromise = fetch(req).then(resp => {
          const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy));
          return resp;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }
  // Cache-first for other assets
  e.respondWith(
    caches.match(req).then(cached => cached || fetch(req).then(resp => {
      const copy = resp.clone(); caches.open(CACHE).then(c => c.put(req, copy));
      return resp;
    }))
  );
});

self.addEventListener('message', (event) => {
  if(event.data === 'SKIP_WAITING'){
    self.skipWaiting();
  }
});

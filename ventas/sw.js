// Service worker: la app abre aunque no haya conexión. Siempre intenta la red primero (así ves
// las novedades al instante) y usa la copia guardada solo si falla. Supabase y fuentes van directas.
const CACHE = 'ventas-shell-v6';
const SHELL = ['./', 'index.html', 'style.css', 'tokens.css', 'bundle.css', 'app.js', 'plan.js', 'report.js', 'config.js', 'vendor/supabase.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('.apk')) return;
  e.respondWith(
    fetch(r).then(res => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(r, copy)); } return res; })
      .catch(() => caches.match(r).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : null)).then(m => m || Response.error()))
  );
});

// Service worker de «Ventas del mes»: que abra al instante y funcione con mala conexión o sin ella.
// - La página (index.html): sale al instante de la copia guardada y la nueva se descarga por detrás; cuando se instala
//   una versión nueva la app avisa («Hay una versión nueva» → Actualizar).
// - El resto de archivos propios (css, js, tipografía, iconos): se sirven al momento desde la caché y se actualizan en
//   segundo plano. Todos llevan ?v=NN en la página, así una versión nueva nunca mezcla archivos viejos y nuevos.
// - Supabase y la comprobación de conexión (?ping) van siempre directos a la red.
// AL PUBLICAR: subir V aquí y el mismo ?v=NN en index.html.
const V = '30', CACHE = 'ventas-shell-v' + V;
const ASSETS = ['tokens.css', 'bundle.css', 'style.css', 'config.js', 'vendor/supabase.js', 'plan.js', 'report.js', 'app.js'].map(f => f + '?v=' + V);
const SHELL = ['./', 'index.html', ...ASSETS, 'fonts/plus-jakarta-sans-latin.woff2', 'icons/noise.png', 'manifest.webmanifest', 'favicon.svg', 'icons/icon-192.png'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
const put = (req, res) => { if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; };
function page(req, ev) {                                // la página también sale al instante de la caché; la nueva se guarda por detrás
  return caches.match(req, { ignoreSearch: true }).then(m => m || caches.match('./')).then(hit => {
    const net = fetch(req).then(res => put(req, res));
    if (hit) { ev.waitUntil(net.then(() => {}, () => {})); return hit; }
    return net.catch(() => caches.match('index.html').then(m => m || Response.error()));
  });
}
function asset(req, ev) {
  return caches.match(req).then(hit => {
    const net = fetch(req).then(res => put(req, res)).catch(() => hit || Response.error());
    if (hit) { ev.waitUntil(net.then(() => {}, () => {})); return hit; }          // al instante desde la caché; se refresca por detrás
    return net;
  });
}
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin || u.pathname.endsWith('.apk') || u.searchParams.has('ping')) return;
  e.respondWith(r.mode === 'navigate' ? page(r, e) : asset(r, e));
});

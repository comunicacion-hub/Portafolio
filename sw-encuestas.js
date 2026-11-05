/* ==========================================================================
   Mi RCR — Encuestas sin conexión (service worker)
   ──────────────────────────────────────────────────────────────────────────
   Guarda en el teléfono la página pública para responder encuestas, para que
   se pueda abrir y llenar sin internet después de abrirla una vez con
   conexión. Las respuestas no pasan por aquí: Firestore las deja en cola en
   el teléfono y las envía al volver la conexión.

   · Solo atiende la página de la encuesta (responder-encuesta.html y /e/) y
     los archivos que ESA página pide. El resto de la app (index.html y lo
     que carga) va directo a la red, sin pasar por aquí.
   · Con conexión: siempre la versión nueva de la red (si la red no responde
     en 8 s, la copia guardada). Sin conexión: la copia guardada.
   ========================================================================== */
var CACHE = 'rcr-encuestas-v2';
var BASE = new URL('./', self.location).pathname;          // "/" en el dominio
var PAGINAS = ['responder-encuesta.html', 'e/', 'e/index.html'];
var PROPIOS = PAGINAS.concat(['styles.css', 'icons.js', 'encuestas.js']);
var SDK = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) {
    var propios = PROPIOS.map(function (p) {
      return c.add(new Request(BASE + p, { cache: 'reload' })).catch(function () { /* se guardará al usarse */ });
    });
    var sdk = SDK.map(function (u) {
      return fetch(new Request(u, { mode: 'no-cors' })).then(function (r) { return c.put(u, r); }).catch(function () {});
    });
    return Promise.all(propios.concat(sdk));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (ev) {
  ev.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k.indexOf('rcr-encuestas-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function rutaDe(u) {
  try { var x = new URL(u); return x.origin === self.location.origin ? x.pathname : null; } catch (e) { return null; }
}
function esPagina(path) {
  return PAGINAS.some(function (p) { return path === BASE + p; });
}
function esPropio(path) {
  return PROPIOS.some(function (p) { return path === BASE + p; });
}

/* Red primero (8 s como máximo); si falla, la copia guardada */
function redPrimero(req) {
  var clave = new URL(req.url); clave.search = '';
  return caches.open(CACHE).then(function (c) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var t = ctrl ? setTimeout(function () { ctrl.abort(); }, 8000) : null;
    return fetch(req, ctrl ? { signal: ctrl.signal } : undefined).then(function (r) {
      clearTimeout(t);
      if (r && r.ok) c.put(clave.href, r.clone());
      return r;
    }).catch(function () {
      clearTimeout(t);
      return c.match(clave.href).then(function (copia) {
        if (copia) return copia;
        throw new Error('sin red y sin copia');
      });
    });
  });
}

/* Copia primero (SDK con versión fija y tipografía) */
function copiaPrimero(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req.url).then(function (copia) {
      if (copia) return copia;
      return fetch(req).then(function (r) {
        if (r && (r.ok || r.type === 'opaque')) c.put(req.url, r.clone());
        return r;
      });
    });
  });
}

self.addEventListener('fetch', function (ev) {
  var req = ev.request;
  if (req.method !== 'GET') return;
  var path = rutaDe(req.url);

  /* La página de la encuesta */
  if (req.mode === 'navigate') {
    if (path && esPagina(path)) ev.respondWith(redPrimero(req));
    return;
  }

  /* SDK de Firebase (versión fija) y tipografía: no cambian, se guardan */
  var url = new URL(req.url);
  if (SDK.indexOf(url.href) >= 0 || url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    ev.respondWith(copiaPrimero(req));
    return;
  }

  /* Archivos propios pedidos DESDE la página de la encuesta (no desde la app) */
  var desde = rutaDe(req.referrer || '');
  if (desde && esPagina(desde) && path && esPropio(path)) ev.respondWith(redPrimero(req));
});

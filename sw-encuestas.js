/* ==========================================================================
   Mi RCR — Encuestas sin conexión (service worker)
   ──────────────────────────────────────────────────────────────────────────
   Guarda en el teléfono la página pública para responder encuestas, para que
   se pueda abrir y llenar sin internet después de abrirla una vez con
   conexión. Las respuestas no pasan por aquí: Firestore las deja en cola en
   el teléfono y las envía al volver la conexión.

   Solo atiende estos archivos; el resto de la app (index.html, etc.) va a la
   red como siempre. Con conexión se usa siempre la versión nueva (primero la
   red); sin conexión, la guardada.
   ========================================================================== */
var CACHE = 'rcr-encuestas-v1';
var BASE = new URL('./', self.location).pathname;          // "/" en el dominio
var PROPIOS = ['responder-encuesta.html', 'e/', 'e/index.html', 'styles.css', 'icons.js', 'encuestas.js'];
var SDK = [
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore-compat.js'
];

self.addEventListener('install', function (ev) {
  ev.waitUntil(caches.open(CACHE).then(function (c) {
    var propios = PROPIOS.map(function (p) {
      return c.add(BASE + p).catch(function () { /* se guardará al usarse */ });
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

function esPropio(url) {
  if (url.origin !== self.location.origin) return false;
  return PROPIOS.some(function (p) { return url.pathname === BASE + p; });
}

/* Primero la red (con 4 s de espera máxima si ya hay copia); si falla, la copia */
function redPrimero(req) {
  return caches.open(CACHE).then(function (c) {
    var clave = new URL(req.url); clave.search = '';
    var desdeRed = fetch(req).then(function (r) {
      if (r && (r.ok || r.type === 'opaque')) c.put(clave.href, r.clone());
      return r;
    });
    return c.match(clave.href).then(function (copia) {
      if (!copia) return desdeRed;
      var tarde = new Promise(function (ok) { setTimeout(function () { ok(copia); }, 4000); });
      return Promise.race([desdeRed.catch(function () { return copia; }), tarde]);
    });
  });
}

/* Primero la copia (SDK con versión fija y tipografía) */
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
  var url = new URL(req.url);
  if (esPropio(url)) { ev.respondWith(redPrimero(req)); return; }
  if (SDK.indexOf(url.href) >= 0 || url.host === 'fonts.googleapis.com' || url.host === 'fonts.gstatic.com') {
    ev.respondWith(copiaPrimero(req));
  }
});

/* ==========================================================================
   Mi RCR — Fotos de encuestas en Google Drive (Google Apps Script)
   ──────────────────────────────────────────────────────────────────────────
   Recibe las fotos de las preguntas "Subir imagen" desde la página para
   responder (responder-encuesta.html) y las guarda en Google Drive:

     Fotos de encuestas (Mi RCR)/
       Nombre de la encuesta/
         2026-11-26 14.32 · María López · AbCdEf/     ← una carpeta por respuesta
           P3 Foto del lugar (1) · AbCdEf.jpg
           P3 Foto del lugar (2) · AbCdEf.jpg

   AbCdEf es el código de la respuesta: se ve en Datos de Mi RCR y se puede
   buscar ahí. Devuelve el id del archivo y de las carpetas, que quedan en la
   respuesta junto con una copia chica de cada foto.

   Este archivo NO lo usa la página: es una copia para tenerlo a mano. El que
   funciona vive en script.google.com, en la cuenta dueña de la carpeta.

   INSTALACIÓN (una sola vez, con la cuenta de Google dueña de las fotos)
   1. Entra a https://script.google.com → "Nuevo proyecto". Ponle un nombre
      (por ejemplo "Fotos de encuestas Mi RCR").
   2. Borra lo que trae el editor y pega todo este archivo. Guarda (Ctrl+S).
   3. (Opcional) Si quieres una carpeta en particular, pega su ID en
      CARPETA_ID (es la parte final del enlace de la carpeta, después de
      /folders/). Si lo dejas vacío, se crea "Fotos de encuestas (Mi RCR)"
      en tu Mi unidad.
   4. "Implementar" → "Nueva implementación" → engranaje → "Aplicación web".
        · Ejecutar como: Yo
        · Quién tiene acceso: Cualquier usuario
      → "Implementar" → "Autorizar acceso" y acepta los permisos (Drive para
      guardar las fotos; servicio externo para leer la encuesta).
   5. Copia la "URL de la aplicación web" (termina en /exec) y pásala para
      ponerla en encuestas.js (ENC.DRIVE_URL).

   Si después cambias este código: "Implementar" → "Gestionar
   implementaciones" → lápiz → Versión: "Nueva versión" → "Implementar"
   (así la URL no cambia).

   SEGURIDAD
   · Solo acepta fotos JPEG de hasta 12 MB (máximo 20 por pregunta), para
     encuestas que existen, están abiertas y tienen esa pregunta de tipo
     "Subir imagen".
   · Las fotos quedan privadas en tu Drive: solo las ve quien tenga acceso a
     la carpeta.
   ========================================================================== */

var CARPETA_ID = '';                                  // opcional: carpeta donde guardar
var NOMBRE_RAIZ = 'Fotos de encuestas (Mi RCR)';      // si CARPETA_ID queda vacío
var PROYECTO = 'redes-con-rostro';                    // proyecto de Firebase
var MAX_BYTES = 12 * 1024 * 1024;
var MAX_FOTOS = 20;                                   // por pregunta

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    return responder(guardarFoto(d));
  } catch (err) {
    console.error(err);
    return responder({ ok: false, error: 'servidor' });
  }
}

/* Para comprobar que la implementación responde (abrir la URL en el navegador) */
function doGet() {
  return responder({ ok: true, servicio: 'Fotos de encuestas Mi RCR' });
}

function responder(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

/* Error que no se arregla reintentando: la página guarda la respuesta igual,
   con la copia chica de la foto */
function rechazo(codigo) { return { ok: false, error: codigo, permanente: true }; }

function guardarFoto(d) {
  var encId = String(d.encuesta || ''), qid = String(d.pregunta || ''), rid = String(d.respuesta || '');
  if (!/^[A-Za-z0-9]{10,40}$/.test(encId) || !/^[A-Za-z0-9_-]{1,40}$/.test(qid) || !/^[A-Za-z0-9]{10,40}$/.test(rid)) {
    return rechazo('datos');
  }
  /* n: número de la foto en la pregunta; de: cuántas fotos tiene la pregunta */
  var n = d.n == null ? 1 : Number(d.n), de = d.de == null ? 1 : Number(d.de);
  if (!(n >= 1 && n <= MAX_FOTOS && de >= n && de <= MAX_FOTOS && n % 1 === 0 && de % 1 === 0)) return rechazo('datos');
  var m = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(String(d.foto || ''));
  if (!m) return rechazo('formato');
  var bytes = Utilities.base64Decode(m[1]);
  if (bytes.length > MAX_BYTES) return rechazo('grande');
  if (bytes.length < 4 || (bytes[0] & 0xFF) !== 0xFF || (bytes[1] & 0xFF) !== 0xD8) return rechazo('formato');

  var enc = leerEncuesta(encId);
  if (enc === null) return { ok: false, error: 'firestore' };          // se reintenta más tarde
  if (!enc) return rechazo('no-existe');
  if (enc.estado !== 'abierta') return rechazo('cerrada');
  var preg = enc.imagenes[qid];
  if (!preg) return rechazo('pregunta');

  var carpetaEnc = carpetaDe(encId, enc.titulo);
  var quien = limpiar(d.etiqueta, 40);       // primera respuesta de texto corto (suele ser el nombre)
  var carpetaResp = carpetaRespuesta(carpetaEnc, d.fecha, quien, rid, enc.titulo);
  var nombre = nombreArchivo(preg, n, de, rid);
  /* Si la foto ya había llegado (reintento), se devuelve la misma */
  var ya = carpetaResp.getFilesByName(nombre);
  var archivo = ya.hasNext() ? ya.next() : null;
  if (!archivo) {
    archivo = carpetaResp.createFile(Utilities.newBlob(bytes, 'image/jpeg', nombre));
    archivo.setDescription('Encuesta: ' + enc.titulo + '\nPregunta: ' + preg.texto +
      (de > 1 ? ' (foto ' + n + ' de ' + de + ')' : '') +
      (quien ? '\nRespondió: ' + quien : '') +
      '\nCódigo de la respuesta: ' + rid.slice(0, 6) + ' (se busca en Datos de Mi RCR)');
  }
  return { ok: true, id: archivo.getId(), carpeta: carpetaEnc.getId(), carpetaResp: carpetaResp.getId() };
}

/* ── Encuesta desde Firestore (lectura pública, como la página para
   responder). Se guarda 5 minutos para no leerla en cada foto.
   Devuelve { titulo, estado, imagenes: { idPregunta: { texto, p } } } (p es
   el número de la pregunta, como "P3" en Datos), false si no existe o null
   si Firestore no respondió. */
function leerEncuesta(encId) {
  var cache = CacheService.getScriptCache(), clave = 'enc2_' + encId;
  var guardada = cache.get(clave);
  if (guardada) return JSON.parse(guardada);

  var url = 'https://firestore.googleapis.com/v1/projects/' + PROYECTO +
    '/databases/(default)/documents/Encuestas/' + encId +
    '?mask.fieldPaths=titulo&mask.fieldPaths=estado&mask.fieldPaths=preguntas';
  var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (r.getResponseCode() === 404) return false;
  if (r.getResponseCode() !== 200) return null;

  var doc = valor({ mapValue: JSON.parse(r.getContentText()) });
  var imagenes = {}, p = 0;
  (doc.preguntas || []).forEach(function (q) {
    if (!q || q.tipo === 'seccion') return;
    p++;
    if (q.tipo === 'imagen' && q.id) imagenes[q.id] = { texto: String(q.texto || 'Foto'), p: p };
  });
  var enc = { titulo: String(doc.titulo || 'Encuesta'), estado: String(doc.estado || ''), imagenes: imagenes };
  cache.put(clave, JSON.stringify(enc), 300);
  return enc;
}

/* Valor del formato REST de Firestore → valor normal */
function valor(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(valor);
  if ('mapValue' in v) {
    var o = {}, f = v.mapValue.fields || {};
    Object.keys(f).forEach(function (k) { o[k] = valor(f[k]); });
    return o;
  }
  return null;
}

/* ── Carpetas ──────────────────────────────────────────────────────────── */
/* Una por encuesta, dentro de la carpeta principal */
function carpetaDe(encId, titulo) {
  var props = PropertiesService.getScriptProperties(), clave = 'carpeta_' + encId;
  var existente = abrirCarpeta(props.getProperty(clave));
  if (existente) return existente;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    existente = abrirCarpeta(props.getProperty(clave));          // otra foto pudo crearla recién
    if (existente) return existente;
    var nueva = carpetaRaiz().createFolder(limpiar(titulo, 90) || 'Encuesta ' + encId);
    nueva.setDescription('Fotos de la encuesta "' + titulo + '" (Mi RCR, id ' + encId + ')');
    props.setProperty(clave, nueva.getId());
    return nueva;
  } finally {
    lock.releaseLock();
  }
}

/* Una por respuesta, dentro de la carpeta de la encuesta:
   "2026-11-26 14.32 · María López · AbCdEf". El nombre es siempre el mismo
   para la misma respuesta, así sus fotos caen juntas aunque lleguen en
   distintos momentos. */
function carpetaRespuesta(carpetaEnc, fecha, quien, rid, titulo) {
  var nombre = [fechaTexto(fecha), quien, rid.slice(0, 6)].filter(function (x) { return x; }).join(' · ');
  var buscar = function () {
    var it = carpetaEnc.getFoldersByName(nombre);
    while (it.hasNext()) { var c = it.next(); if (!c.isTrashed()) return c; }
    return null;
  };
  var existente = buscar();
  if (existente) return existente;

  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    existente = buscar();
    if (existente) return existente;
    var nueva = carpetaEnc.createFolder(nombre);
    nueva.setDescription('Respuesta ' + rid.slice(0, 6) + ' a la encuesta "' + titulo + '"' +
      (quien ? '\nRespondió: ' + quien : ''));
    return nueva;
  } finally {
    lock.releaseLock();
  }
}

function carpetaRaiz() {
  if (CARPETA_ID) return DriveApp.getFolderById(CARPETA_ID);
  var props = PropertiesService.getScriptProperties();
  var raiz = abrirCarpeta(props.getProperty('raiz'));
  if (raiz) return raiz;
  raiz = DriveApp.createFolder(NOMBRE_RAIZ);
  props.setProperty('raiz', raiz.getId());
  return raiz;
}

/* Carpeta por id, o null si no existe o está en la papelera */
function abrirCarpeta(id) {
  if (!id) return null;
  try {
    var c = DriveApp.getFolderById(id);
    return c.isTrashed() ? null : c;
  } catch (e) {
    return null;
  }
}

/* "P3 Foto del lugar (2) · AbCdEf.jpg": número y texto de la pregunta, el
   número de la foto si hay varias y el código de la respuesta. Es siempre
   el mismo para la misma foto (sirve para no duplicarla). */
function nombreArchivo(preg, n, de, rid) {
  return (preg.p ? 'P' + preg.p + ' ' : '') + limpiar(preg.texto, 50) +
    (de > 1 ? ' (' + n + ')' : '') + ' · ' + rid.slice(0, 6) + '.jpg';
}

/* Fecha y hora en que se respondió: "2026-11-26 14.32" */
function fechaTexto(fecha) {
  var ms = Number(fecha);
  var f = new Date(isFinite(ms) && ms > 0 ? ms : Date.now());
  return Utilities.formatDate(f, Session.getScriptTimeZone(), 'yyyy-MM-dd HH.mm');
}

function limpiar(t, max) {
  t = String(t || '').replace(/[\\/:*?"<>|\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trim() + '…' : t;
}

/* ==========================================================================
   Mi RCR — Perfil "encuestas"
   ──────────────────────────────────────────────────────────────────────────
   · Encuestas: crear / editar encuestas con preguntas de varios tipos y
     lógica condicional ("mostrar solo si…"), y compartir el enlace público.
   · El enlace público (responder-encuesta.html) se responde SIN iniciar sesión
     y guarda cada respuesta dentro de la encuesta (subcolección "Respuestas").

   Colecciones de Firestore
     Encuestas/{id}            { titulo, descripcion, estado: 'abierta'|'cerrada',
                                 preguntas: [Pregunta], creadoPor, creadoPorNombre,
                                 compartido, compartidoCon, editoresCon,
                                 creado, actualizado }
     Encuestas/{id}/Respuestas/{rid}  { respuestas: { <preguntaId>: valor }, enviado }
     (RespuestasEncuesta/{id}: formato antiguo, se mueve solo a la subcolección)

   Pregunta = { id, tipo, texto, requerida, opciones: [..], condicion: null | { pregunta, valor } }
     tipo: corto | largo | unica | multiple | escala | sino | numero | imagen | cuadricula | seccion
     valor guardado: texto, número (escala/numero), lista (multiple),
     JPEG base64 (imagen), { idFila: columna } (cuadricula)

   Reglas de Firestore: ver firestore.rules (en la raíz del repositorio).
   Privacidad: cada encuesta la ven solo creadoPor y los correos de
   compartidoCon; la editan creadoPor y editoresCon.

   Este archivo también lo carga responder-encuesta.html (con un RCR mínimo):
   no debe ejecutar nada al cargarse, solo definir objetos.
   ========================================================================== */

RCR.modulos.encuestas = {
  id: 'encuestas',
  titulo: 'Encuestas',
  icono: 'encuesta',
  workspace: 'encuestas',
  enNav: true,
  crear: { label: 'Nueva encuesta', soloEditor: true, accion: function () { ENC.abrirDatos(null); } },
  mount: function (root) { ENC.mount(root); },
  onShow: function () { if (ENC.cargado) ENC.render(); }
};

var ENC = {
  COL: 'Encuestas',
  COL_RESP: 'RespuestasEncuesta',   // formato antiguo: solo se lee para moverlo
  SUB_RESP: 'Respuestas',           // Encuestas/{id}/Respuestas/{rid}

  /* Respuestas de una encuesta (subcolección: así las reglas de Firestore
     pueden permitir leerlas solo a quien creó la encuesta o la recibió). */
  refResp: function (encId) {
    return RCR.db.collection(ENC.COL).doc(encId).collection(ENC.SUB_RESP);
  },

  /* Lee todas las respuestas de una encuesta. Si quedan del formato antiguo
     y quien mira puede editar la encuesta, las mueve a la subcolección. */
  leerRespuestasDe: async function (encId) {
    var snap = await ENC.refResp(encId).get();
    var lista = snap.docs.map(function (d) { return Object.assign({ _docId: d.id }, d.data()); });
    var viejas = [];
    try {
      viejas = (await RCR.db.collection(ENC.COL_RESP).where('encuestaId', '==', encId).get()).docs;
    } catch (e) { /* la colección antigua ya no se puede leer: no hay nada que mover */ }
    if (!viejas.length) return lista;

    var movidas = false;
    if (ENC.puedeEditarEnc(ENC.buscar(encId))) {
      try { await ENC.migrarRespuestas(encId, viejas); movidas = true; }
      catch (e) { console.warn('ENC.migrarRespuestas:', e); }
    }
    viejas.forEach(function (d) {
      lista.push(Object.assign({ _docId: d.id }, d.data(), movidas ? {} : { _legado: true }));
    });
    return lista;
  },

  migrarRespuestas: async function (encId, docs) {
    for (var i = 0; i < docs.length; i += 200) {
      var lote = RCR.db.batch();
      docs.slice(i, i + 200).forEach(function (d) {
        var x = d.data();
        lote.set(ENC.refResp(encId).doc(d.id), { respuestas: x.respuestas || {}, enviado: x.enviado || null });
        lote.delete(d.ref);
      });
      await lote.commit();
    }
  },

  /* Al cargar: completa en mis encuestas los campos que usan las reglas
     (compartidoCon y editoresCon), por si se crearon antes de existir. */
  completarCampos: function () {
    var yo = String(RCR.user.correo || '').toLowerCase();
    ENC.datos.forEach(function (e) {
      if (String(e.creadoPor || '').toLowerCase() !== yo) return;
      if (Array.isArray(e.compartidoCon) && Array.isArray(e.editoresCon)) return;
      var comp = e.compartido || [];
      var cambios = {
        compartidoCon: comp.map(function (c) { return String(c.correo).toLowerCase(); }),
        editoresCon: comp.filter(function (c) { return c.rol === 'editor'; }).map(function (c) { return String(c.correo).toLowerCase(); })
      };
      RCR.db.collection(ENC.COL).doc(e._docId).update(cambios)
        .then(function () { Object.assign(e, cambios); })
        .catch(function (err) { console.warn('ENC.completarCampos:', err); });
    });
  },

  datos: [],
  conteos: {},
  cargado: false,
  guardando: false,
  borrando: false,
  pendienteBorrar: null,

  /* Borrador del formulario abierto */
  b: null,

  TIPOS: [
    { id: 'corto',    label: 'Texto corto' },
    { id: 'largo',    label: 'Texto largo' },
    { id: 'unica',    label: 'Opción única' },
    { id: 'multiple', label: 'Opción múltiple' },
    { id: 'escala',   label: 'Escala 1 a 5' },
    { id: 'sino',     label: 'Sí / No' },
    { id: 'numero',   label: 'Número' },
    { id: 'imagen',   label: 'Subir imagen' },
    { id: 'cuadricula', label: 'Cuadrícula (tabla)' }
  ],

  /* Cuadrícula: filas (lo que se evalúa) × columnas (las respuestas).
     Se marca una columna por fila. La respuesta es { idFila: 'columna' }. */
  MAX_COLUMNAS: 6,
  /* Rampa ordinal de un solo tono (validada: claro → oscuro, pasos visibles,
     el más claro supera 2:1 sobre blanco). Texto dentro: oscuro en los dos
     primeros pasos, blanco en los demás. */
  RAMPA: ['#9aabff', '#7b90ff', '#506cff', '#3a52d9', '#2a3da8', '#1d2c7a'],
  colorColumna: function (k, n) {
    var idx = n <= 1 ? 2 : Math.round(k * (ENC.RAMPA.length - 1) / (n - 1));
    return { fondo: ENC.RAMPA[idx], texto: idx <= 1 ? '#1d1d1f' : '#ffffff' };
  },
  nuevaFila: function (t) { return { id: 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), t: t }; },

  /* Imágenes: se guardan como JPEG en base64 dentro del documento (como la
     foto del currículo). Firestore admite hasta 1 MB por documento. */
  IMG_APOYO: { lado: 1000, calidad: 0.72 },   // imagen que acompaña una pregunta
  IMG_RESP:  { lado: 1000, calidad: 0.7 },    // foto que sube quien responde
  LIMITE_DOC: 950000,                         // margen bajo el 1 MB de Firestore

  /* Tipos que pueden servir de condición para otra pregunta */
  RAMIFICAN: ['unica', 'multiple', 'sino', 'escala'],

  /* ==========================================================================
     LÓGICA COMPARTIDA (también la usa la página pública)
     ========================================================================== */
  tipoLabel: function (t) {
    var x = ENC.TIPOS.find(function (o) { return o.id === t; });
    return x ? x.label : t;
  },

  /* Escape para valores dentro de atributos (RCR.esc no escapa comillas) */
  attr: function (v) {
    return RCR.esc(v).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  },

  /* Valores posibles de una pregunta (para elegir la condición) */
  valoresDe: function (q) {
    if (!q) return [];
    if (q.tipo === 'sino') return ['Sí', 'No'];
    if (q.tipo === 'escala') return ['1', '2', '3', '4', '5'];
    if (q.tipo === 'unica' || q.tipo === 'multiple') {
      return (q.opciones || []).map(function (o) { return String(o).trim(); }).filter(Boolean);
    }
    return [];
  },

  /* ¿La respuesta "r" cumple la condición "valor"? */
  cumple: function (q, r, valor) {
    if (r == null || r === '') return false;
    if (q.tipo === 'multiple') return Array.isArray(r) && r.indexOf(valor) >= 0;
    return String(r) === String(valor);
  },

  /* Devuelve { <id>: true|false } con la visibilidad de cada pregunta según
     las respuestas dadas. Una pregunta se ve si no tiene condición, o si la
     pregunta de la que depende se ve y su respuesta cumple la condición. */
  visibles: function (preguntas, resp) {
    var vis = {}, porId = {}, secVis = true;
    (preguntas || []).forEach(function (q) {
      porId[q.id] = q;
      var c = q.condicion, ok = true;
      if (c && c.pregunta) {
        var src = porId[c.pregunta];
        ok = !!(src && vis[src.id] && ENC.cumple(src, resp[src.id], c.valor));
      }
      /* Una sección oculta esconde todas sus preguntas (hasta la siguiente) */
      if (ENC.esSeccion(q)) { secVis = ok; vis[q.id] = ok; return; }
      vis[q.id] = secVis && ok;
    });
    return vis;
  },

  /* Las secciones van en la misma lista que las preguntas (tipo 'seccion'):
     agrupan las preguntas que siguen hasta la próxima sección. */
  esSeccion: function (q) { return !!q && q.tipo === 'seccion'; },
  soloPreguntas: function (ps) { return (ps || []).filter(function (q) { return q.tipo !== 'seccion'; }); },

  /* Formatea un valor guardado para mostrarlo */
  /* Texto de una respuesta conociendo su pregunta (la cuadrícula usa ids de fila) */
  fmtRespuesta: function (q, v) {
    if (q && q.tipo === 'cuadricula' && v && typeof v === 'object' && !Array.isArray(v)) {
      return (q.filas || []).filter(function (f) { return v[f.id] != null; })
        .map(function (f) { return f.t + ': ' + v[f.id]; }).join('; ');
    }
    return ENC.fmtValor(v);
  },

  fmtValor: function (v) {
    if (Array.isArray(v)) return v.join(', ');
    if (v && typeof v === 'object') return Object.keys(v).map(function (k) { return v[k]; }).join('; ');
    if (ENC.esImagen(v)) return 'Imagen adjunta';
    if (typeof v === 'number') return String(v).replace('.', ',');
    return v == null ? '' : String(v);
  },

  /* Solo se muestran como imagen los base64 de imagen bien formados (las
     respuestas llegan de fuera: nunca se pinta un valor cualquiera en src). */
  esImagen: function (v) {
    return typeof v === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
  },

  /* Enlace seguro: solo http(s); se agrega https:// si falta. '' si no sirve. */
  urlSegura: function (u) {
    u = String(u || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = 'https://' + u;
    try {
      var p = new URL(u);
      return (p.protocol === 'http:' || p.protocol === 'https:') && p.hostname.indexOf('.') > 0 ? p.href : '';
    } catch (e) { return ''; }
  },

  /* Texto visible del enlace: el que puso quien creó la encuesta o el dominio */
  textoEnlace: function (en) {
    if (!en) return '';
    if (en.texto && String(en.texto).trim()) return String(en.texto).trim();
    try { return new URL(en.url).hostname.replace(/^www\./, ''); } catch (e) { return en.url; }
  },

  /* Lee un archivo de imagen y la reduce a JPEG (lado mayor = o.lado) */
  comprimirImagen: function (file, o) {
    return new Promise(function (ok, mal) {
      if (!file || !/^image\//.test(file.type)) { mal(new Error('no-imagen')); return; }
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var k = Math.min(1, o.lado / Math.max(img.width, img.height));
        var cnv = document.createElement('canvas');
        cnv.width = Math.max(1, Math.round(img.width * k));
        cnv.height = Math.max(1, Math.round(img.height * k));
        var cx = cnv.getContext('2d');
        cx.fillStyle = '#fff';                       // PNG con transparencia → fondo blanco
        cx.fillRect(0, 0, cnv.width, cnv.height);
        cx.drawImage(img, 0, 0, cnv.width, cnv.height);
        URL.revokeObjectURL(url);
        ok(cnv.toDataURL('image/jpeg', o.calidad));
      };
      img.onerror = function () { URL.revokeObjectURL(url); mal(new Error('no-se-pudo-leer')); };
      img.src = url;
    });
  },

  /* Número escrito por la persona ("3,5" o "3.5") → Number, o NaN */
  leerNumero: function (t) {
    t = String(t == null ? '' : t).trim().replace(/\s/g, '');
    if (!/^-?\d+([.,]\d+)?$/.test(t)) return NaN;
    return Number(t.replace(',', '.'));
  },

  /* Imagen y enlace de apoyo de una pregunta o sección, para quien responde */
  apoyoPublico: function (q) {
    var h = '';
    if (q.apoyoImg && ENC.esImagen(q.apoyoImg)) {
      h += '<img class="resp-apoyo-img" src="' + q.apoyoImg + '" alt="Imagen de la pregunta">';
    }
    var url = q.enlace && ENC.urlSegura(q.enlace.url);
    if (url) {
      h += '<a class="resp-enlace" href="' + ENC.attr(url) + '" target="_blank" rel="noopener noreferrer">' +
        ico('link', 15) + '<span>' + RCR.esc(ENC.textoEnlace({ url: url, texto: q.enlace.texto })) + '</span>' +
        ico('chevronRight', 15) + '</a>';
    }
    return h ? '<div class="resp-apoyo">' + h + '</div>' : '';
  },

  fmtFecha: function (d) {
    if (!d) return '';
    try {
      var date = typeof d.toDate === 'function' ? d.toDate()
               : (d.seconds != null ? new Date(d.seconds * 1000) : new Date(d));
      if (isNaN(date.getTime())) return '';
      return date.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return ''; }
  },

  /* Enlace para responder. Con código corto: …/e/?k7m2qx (los enlaces
     largos con ?id= siguen funcionando). La vista previa usa el largo. */
  urlPublica: function (id, previa) {
    var base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
    var e = (ENC.datos || []).find(function (x) { return x._docId === id; });
    if (e && ENC.esCodigo(e.codigo) && !previa) return base + 'e/?' + e.codigo;
    return base + 'responder-encuesta.html?id=' + encodeURIComponent(id) + (previa ? '&previa=1' : '');
  },

  /* ── Código corto del enlace: Codigos/{codigo} = { encuestaId, creadoPor } ── */
  COL_COD: 'Codigos',
  ALFABETO: '23456789abcdefghjkmnpqrstuvwxyz',   // sin 0/o, 1/l/i: no se confunden al dictarlo
  esCodigo: function (c) { return typeof c === 'string' && /^[a-z0-9]{4,12}$/.test(c); },
  nuevoCodigo: function (n) {
    var a = ENC.ALFABETO, out = '', r = new Uint32Array(n);
    (window.crypto || window.msCrypto).getRandomValues(r);
    for (var i = 0; i < n; i++) out += a[r[i] % a.length];
    return out;
  },

  /* Le asigna un código corto a la encuesta si aún no tiene (solo quien la
     puede editar). Devuelve el código, o null si no se pudo (queda el largo). */
  asegurarCodigo: async function (e) {
    if (!e) return null;
    if (ENC.esCodigo(e.codigo)) return e.codigo;
    if (!ENC.puedeEditarEnc(e)) return null;
    for (var intento = 0; intento < 5; intento++) {
      var c = ENC.nuevoCodigo(6);
      try {
        var ref = RCR.db.collection(ENC.COL_COD).doc(c);
        if ((await ref.get()).exists) continue;          // ocupado: otro código
        await ref.set({ encuestaId: e._docId, creadoPor: RCR.user.correo });
        await RCR.db.collection(ENC.COL).doc(e._docId).update({ codigo: c });
        e.codigo = c;
        return c;
      } catch (err) {
        console.warn('ENC.asegurarCodigo:', err);
        return null;
      }
    }
    return null;
  },

  /* ==========================================================================
     LISTADO
     ========================================================================== */
  mount: function (root) {
    root.innerHTML = '<div id="enc-list">' + RCR.cargando('Cargando encuestas') + '</div>';
    ENC.cargar();
  },

  /* Lee las encuestas una sola vez (la usan Encuestas, Resultados y Datos).
     Cada persona ve SOLO las que creó y las que le compartieron por correo.
     Tener acceso al perfil "encuestas" (o ser Admin) no muestra las ajenas. */
  asegurarDatos: function () {
    if (ENC.cargado) return Promise.resolve();
    if (!ENC._leyendo) {
      var col = RCR.db.collection(ENC.COL), yo = RCR.user.correo;
      var consultas = [col.where('creadoPor', '==', yo).get(), col.where('compartidoCon', 'array-contains', String(yo).toLowerCase()).get()];
      ENC._leyendo = Promise.all(consultas).then(function (snaps) {
        var porId = {};
        snaps.forEach(function (snap) {
          snap.docs.forEach(function (d) { porId[d.id] = Object.assign({ _docId: d.id }, d.data()); });
        });
        ENC.datos = Object.keys(porId).map(function (k) { return porId[k]; });
        ENC.ordenar();
        ENC.cargado = true;
        ENC.completarCampos();
      }).finally(function () { ENC._leyendo = null; });
    }
    return ENC._leyendo;
  },

  /* Vuelve a leer las encuestas (p. ej. al llegar una encuesta compartida) */
  recargar: async function () {
    ENC.cargado = false;
    await ENC.asegurarDatos();
    if (document.getElementById('enc-list')) { ENC.render(); ENC.contarRespuestas(); }
    if (window.RES) RES.poblarSel();
    if (window.DAT) DAT.poblarSel();
  },

  /* ── Permisos por encuesta ─────────────────────────────────────────────
     propietario: quien la creó · editor / lector: a quien se la compartieron.
     Nadie más la ve, tampoco el rol Admin de Mi RCR.                       */
  rol: function (e) {
    if (!e || !RCR.user) return null;
    var yo = String(RCR.user.correo || '').toLowerCase();
    if (String(e.creadoPor || '').toLowerCase() === yo) return 'propietario';
    var c = (e.compartido || []).find(function (x) { return String(x.correo || '').toLowerCase() === yo; });
    if (c) return c.rol === 'editor' ? 'editor' : 'lector';
    return null;
  },
  puedeEditarEnc: function (e) {
    var r = ENC.rol(e);
    return r === 'propietario' || r === 'editor' || r === 'admin';
  },
  puedeBorrarEnc: function (e) {
    var r = ENC.rol(e);
    return r === 'propietario' || r === 'admin';
  },
  /* Grupo del listado: mías, compartidas conmigo, o de otras personas (Admin) */
  grupo: function (e) {
    var r = ENC.rol(e);
    return r === 'propietario' ? 'mias' : (r === 'admin' ? 'otras' : 'compartidas');
  },
  GRUPOS: [
    { id: 'mias', titulo: 'Mis encuestas' },
    { id: 'compartidas', titulo: 'Compartidas conmigo' },
    { id: 'otras', titulo: 'De otras personas' }
  ],
  ROL_LABEL: { propietario: 'Propietario', editor: 'Editor', lector: 'Lector', admin: 'Admin' },

  /* <option> agrupadas para los menús de Resultados y Datos */
  opcionesSelect: function (selId) {
    var opt = function (e) {
      return '<option value="' + ENC.attr(e._docId) + '"' + (e._docId === selId ? ' selected' : '') + '>' +
        RCR.esc(e.titulo || 'Sin título') + (e.estado === 'cerrada' ? ' (cerrada)' : '') + '</option>';
    };
    var grupos = ENC.GRUPOS.map(function (g) {
      return { g: g, items: ENC.datos.filter(function (e) { return ENC.grupo(e) === g.id; }) };
    }).filter(function (x) { return x.items.length; });
    if (grupos.length === 1) return grupos[0].items.map(opt).join('');
    return grupos.map(function (x) {
      return '<optgroup label="' + ENC.attr(x.g.titulo) + '">' + x.items.map(opt).join('') + '</optgroup>';
    }).join('');
  },

  cargar: async function () {
    try {
      await ENC.asegurarDatos();
    } catch (e) {
      console.error('ENC.cargar:', e);
      var list = document.getElementById('enc-list');
      if (list) list.innerHTML = RCR.vacio('alert', 'No se pudieron cargar las encuestas', 'Revisa tu conexión y vuelve a intentar.');
      return;
    }
    ENC.render();
    ENC.contarRespuestas();
  },

  ordenar: function () {
    var t = function (x) {
      var d = x.actualizado || x.creado;
      if (!d) return 0;
      return typeof d.toMillis === 'function' ? d.toMillis() : (d.seconds ? d.seconds * 1000 : 0);
    };
    ENC.datos.sort(function (a, b) { return t(b) - t(a); });
  },

  /* Número de respuestas por encuesta (se completa después de pintar) */
  contarRespuestas: function () {
    var contar = function (q) {
      return (typeof q.count === 'function')
        ? q.count().get().then(function (s) { return s.data().count; })
        : q.get().then(function (s) { return s.size; });
    };
    ENC.datos.forEach(function (e) {
      /* Nuevas (dentro de la encuesta) + las que queden del formato antiguo */
      var p = Promise.all([
        contar(ENC.refResp(e._docId)),
        contar(RCR.db.collection(ENC.COL_RESP).where('encuestaId', '==', e._docId)).catch(function () { return 0; })
      ]).then(function (n) { return n[0] + n[1]; });
      p.then(function (n) {
        ENC.conteos[e._docId] = n;
        var el = document.getElementById('enc-n-' + e._docId);
        if (el) el.textContent = n + (n === 1 ? ' respuesta' : ' respuestas');
      }).catch(function () { /* sin permiso de lectura aún: se omite */ });
    });
  },

  render: function () {
    var list = document.getElementById('enc-list');
    if (!list) return;

    if (!ENC.datos.length) {
      list.innerHTML = RCR.vacio('encuesta', 'Aún no hay encuestas',
        RCR.puedeEditar() ? 'Toca + para crear la primera.' : 'Cuando crees o te compartan una encuesta aparecerá aquí.');
      return;
    }

    var grupos = ENC.GRUPOS.map(function (g) {
      return { g: g, items: ENC.datos.filter(function (e) { return ENC.grupo(e) === g.id; }) };
    }).filter(function (x) { return x.items.length; });
    var conTitulos = grupos.length > 1 || (grupos.length === 1 && grupos[0].g.id !== 'mias');

    list.innerHTML = grupos.map(function (x) {
      return (conTitulos ? '<div class="enc-grupo">' + RCR.esc(x.g.titulo) + ' <span>' + x.items.length + '</span></div>' : '') +
        x.items.map(ENC.tarjeta).join('');
    }).join('');
  },

  tarjeta: function (e) {
      var id = e._docId;
      var n = ENC.soloPreguntas(e.preguntas).length;
      var abierta = e.estado !== 'cerrada';
      var nResp = ENC.conteos[id];
      var rol = ENC.rol(e);
      var editable = ENC.puedeEditarEnc(e);
      var autor = (rol !== 'propietario' && e.creadoPor)
        ? ' · De ' + RCR.esc(e.creadoPorNombre || e.creadoPor) : '';
      var nCompartido = (e.compartido || []).length;
      return '' +
      '<div class="card enc-card" onclick="' + (editable ? 'ENC.abrirPreguntas' : 'ENC.previa') + '(\'' + id + '\')">' +
        '<div class="card-top">' +
          '<div class="card-badge-soft">' + ico('encuesta', 22) + '</div>' +
          '<div class="card-info">' +
            '<strong>' + RCR.esc(e.titulo || 'Sin título') + '</strong>' +
            '<small>' + n + (n === 1 ? ' pregunta' : ' preguntas') +
              (ENC.fmtFecha(e.actualizado || e.creado) ? ' · ' + RCR.esc(ENC.fmtFecha(e.actualizado || e.creado)) : '') +
              autor + '</small>' +
          '</div>' +
        '</div>' +
        '<div class="chips-row">' +
          '<span class="chip ' + (abierta ? 'verde' : 'neutro') + '"><span class="chip-dot"></span>' + (abierta ? 'Abierta' : 'Cerrada') + '</span>' +
          '<span class="chip neutro" id="enc-n-' + id + '">' +
            (nResp == null ? '…' : nResp + (nResp === 1 ? ' respuesta' : ' respuestas')) + '</span>' +
          (rol === 'editor' || rol === 'lector'
            ? '<span class="chip enc-chip-rol">' + ico('users', 13) + ENC.ROL_LABEL[rol] + '</span>' : '') +
          (nCompartido && rol === 'propietario'
            ? '<span class="chip neutro">' + ico('users', 13) + 'Compartida con ' + nCompartido + '</span>' : '') +
        '</div>' +
        '<div class="card-icobar" onclick="event.stopPropagation();">' +
          '<button class="btn-ico" title="Compartir enlace" aria-label="Compartir enlace" onclick="ENC.compartir(\'' + id + '\')">' + ico('link', 17) + '</button>' +
          (editable
            ? '<button class="btn-ico" title="Preguntas" aria-label="Editar preguntas" onclick="ENC.abrirPreguntas(\'' + id + '\')">' + ico('help', 17) + '</button>'
            : '<button class="btn-ico" title="Ver preguntas" aria-label="Ver preguntas" onclick="ENC.previa(\'' + id + '\')">' + ico('eye', 17) + '</button>') +
          (editable && ENC.compartirPersonas
            ? '<button class="btn-ico" title="Compartir con personas" aria-label="Compartir con personas" onclick="ENC.compartirPersonas(\'' + id + '\')">' + ico('users', 17) + '</button>' : '') +
          (window.RES && RCR.puedeVerSeccion('encuestas', 'resultados-encuesta')
            ? '<button class="btn-ico" title="Resultados" aria-label="Ver resultados" onclick="RES.abrir(\'' + id + '\')">' + ico('barChart', 17) + '</button>' : '') +
          (ENC.puedeBorrarEnc(e)
            ? '<button class="btn-ico danger" title="Eliminar" aria-label="Eliminar" onclick="ENC.pedirBorrar(\'' + id + '\')">' + ico('trash', 16) + '</button>' : '') +
        '</div>' +
      '</div>';
  },

  /* ==========================================================================
     CONSTRUCTOR DE ENCUESTAS
     ========================================================================== */
  nuevoId: function () {
    return 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  },

  nuevaPregunta: function (tipo) {
    tipo = tipo || 'unica';
    return {
      id: ENC.nuevoId(),
      tipo: tipo,
      texto: '',
      requerida: false,
      opciones: (tipo === 'unica' || tipo === 'multiple') ? ['Opción 1', 'Opción 2'] : [],
      condicion: null
    };
  },

  /* Filas y columnas por defecto de una cuadrícula */
  prepararCuadricula: function (q) {
    if (!Array.isArray(q.filas) || !q.filas.length) q.filas = [ENC.nuevaFila('Fila 1'), ENC.nuevaFila('Fila 2')];
    if (!Array.isArray(q.columnas) || q.columnas.length < 2) q.columnas = ['Columna 1', 'Columna 2', 'Columna 3'];
  },

  nuevaSeccion: function () {
    return { id: ENC.nuevoId(), tipo: 'seccion', texto: '', descripcion: '', condicion: null };
  },

  buscar: function (docId) {
    return ENC.datos.find(function (x) { return x._docId === docId; }) || null;
  },

  /* ── Paso 1: ventana con título, descripción y estado ──────────────────
     Sirve para crear la encuesta (queda sin preguntas) y para editar esos
     datos después, desde la cabecera de la pantalla de preguntas. */
  abrirDatos: function (docId) {
    var e = docId ? ENC.buscar(docId) : null;
    if (docId ? !ENC.puedeEditarEnc(e) : !RCR.puedeEditar()) { RCR.toast('No tienes permiso para editar'); return; }
    var d = e || { titulo: '', descripcion: '', estado: 'abierta' };

    RCR.modal({
      id: 'm-enc-datos',
      persistente: true,
      titulo: docId ? 'Editar encuesta' : 'Nueva encuesta',
      sub: docId ? '' : 'Después de crearla, toca la tarjeta para agregar las preguntas.',
      cuerpo:
        '<div class="form-grp"><label class="form-lbl" for="enc-d-titulo">Título *</label>' +
          '<input class="form-inp" id="enc-d-titulo" maxlength="140" placeholder="Ej. Encuesta de clima laboral" ' +
            'value="' + ENC.attr(d.titulo || '') + '"></div>' +
        '<div class="form-grp"><label class="form-lbl" for="enc-d-desc">Descripción <span class="opt">(opcional)</span></label>' +
          '<textarea class="form-inp" id="enc-d-desc" rows="3" placeholder="Cuéntale a quien responde de qué se trata">' +
            RCR.esc(d.descripcion || '') + '</textarea></div>' +
        '<div class="form-grp" style="margin-bottom:0"><label class="form-lbl" for="enc-d-estado">Estado</label>' +
          '<select class="form-inp" id="enc-d-estado">' +
            '<option value="abierta"' + (d.estado !== 'cerrada' ? ' selected' : '') + '>Abierta — recibe respuestas</option>' +
            '<option value="cerrada"' + (d.estado === 'cerrada' ? ' selected' : '') + '>Cerrada — no recibe respuestas</option>' +
          '</select></div>',
      acciones:
        '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-enc-datos\')">Cancelar</button>' +
        '<button class="btn btn-primary" id="enc-d-save" onclick="ENC.guardarDatos(\'' + (docId || '') + '\')">' +
          (docId ? 'Guardar' : 'Crear') + '</button>'
    });
    setTimeout(function () { var t = document.getElementById('enc-d-titulo'); if (t && !docId) t.focus(); }, 60);
  },

  guardarDatos: async function (docId) {
    if (ENC.guardando) return;
    docId = docId || null;
    var e = docId ? ENC.buscar(docId) : null;
    if (docId ? !ENC.puedeEditarEnc(e) : !RCR.puedeEditar()) { RCR.toast('No tienes permiso para editar'); return; }

    var titulo = document.getElementById('enc-d-titulo').value.trim();
    if (!titulo) { RCR.toast('Ponle un título a la encuesta'); document.getElementById('enc-d-titulo').focus(); return; }
    var data = {
      titulo: titulo,
      descripcion: document.getElementById('enc-d-desc').value.trim(),
      estado: document.getElementById('enc-d-estado').value === 'cerrada' ? 'cerrada' : 'abierta',
      actualizado: firebase.firestore.FieldValue.serverTimestamp()
    };

    ENC.guardando = true;
    var btn = document.getElementById('enc-d-save');
    var txt = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    try {
      var id = docId;
      if (id) {
        await RCR.db.collection(ENC.COL).doc(id).update(data);
      } else {
        data.preguntas = [];
        data.compartido = [];
        data.compartidoCon = [];   // correos que pueden verla (los usan las reglas)
        data.editoresCon = [];     // correos que pueden editarla
        data.creadoPor = RCR.user.correo;
        data.creadoPorNombre = RCR.user.nombre || RCR.user.correo;
        data.creado = firebase.firestore.FieldValue.serverTimestamp();
        id = (await RCR.db.collection(ENC.COL).add(data)).id;
      }
      ENC.guardarLocal(id, data, !docId);
      if (!docId) ENC.asegurarCodigo(ENC.buscar(id));   // enlace corto desde el inicio
      if (ENC.b && ENC.b.docId === id) {
        ENC.b.titulo = data.titulo; ENC.b.descripcion = data.descripcion; ENC.b.estado = data.estado;
        ENC.pintarCabecera();
      }
      RCR.cerrarModal('m-enc-datos');
      RCR.toast(docId ? 'Datos actualizados' : 'Encuesta creada');
    } catch (err) {
      console.error('ENC.guardarDatos:', err);
      RCR.toast('No se pudo guardar. Revisa tu conexión.');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = txt; }
    ENC.guardando = false;
  },

  /* Copia local con fecha aproximada (el servidor pone la real) y repinta */
  guardarLocal: function (id, data, nuevo) {
    var ahora = firebase.firestore.Timestamp.now();
    var local = Object.assign({}, data, { _docId: id, actualizado: ahora });
    if (nuevo) local.creado = ahora;
    var k = ENC.datos.findIndex(function (x) { return x._docId === id; });
    if (k >= 0) Object.assign(ENC.datos[k], local);
    else { ENC.datos.unshift(local); ENC.conteos[id] = 0; }
    ENC.ordenar();
    ENC.render();
    if (window.RES && RES.poblarSel) RES.poblarSel();
    if (window.DAT && DAT.poblarSel) DAT.poblarSel();
  },

  /* ── Paso 2: pantalla de nivel 2 para crear las preguntas ────────────── */
  abrirPreguntas: function (docId) {
    var e = ENC.buscar(docId);
    if (!ENC.puedeEditarEnc(e)) { RCR.toast('No tienes permiso para editar'); return; }
    ENC.b = JSON.parse(JSON.stringify({
      titulo: e.titulo || '', descripcion: e.descripcion || '',
      estado: e.estado || 'abierta', preguntas: e.preguntas || []
    }));
    ENC.b.docId = docId;
    if (!ENC.b.preguntas.length) ENC.b.preguntas.push(ENC.nuevaPregunta('unica'));
    ENC.reordenando = false;
    ENC.foto = ENC.instantanea();

    RCR.subvista({
      titulo: 'Preguntas',
      cuerpo:
        '<div class="enc-sv-tools">' +
          '<button class="enc-sv-btn" id="enc-sv-orden" type="button" title="Reordenar" aria-label="Reordenar preguntas" ' +
            'aria-pressed="false" onclick="ENC.toggleReordenar()">' + ico('sort', 20) + '</button>' +
          '<button class="enc-sv-btn primario" id="enc-save" type="button" title="Guardar" aria-label="Guardar" ' +
            'onclick="ENC.guardar()">' + ico('save', 20) + '</button>' +
        '</div>' +
        '<div class="eb-fondo" aria-hidden="true"></div>' +
        '<div class="eb-techo" aria-hidden="true"></div>' +
        '<div class="eb">' +
          '<div id="enc-sv-head"></div>' +
          '<div id="enc-preguntas"></div>' +
          /* Barra flotante tipo iOS: agregar pregunta o sección */
          '<div class="eb-dock" id="enc-add-q" role="toolbar" aria-label="Agregar">' +
            '<button type="button" class="eb-dock-btn" onclick="ENC.agregarPregunta()">' + ico('plus', 18, 2.2) + '<span>Pregunta</span></button>' +
            '<span class="eb-dock-sep" aria-hidden="true"></span>' +
            '<button type="button" class="eb-dock-btn" onclick="ENC.agregarSeccion()">' + ico('seccion', 18) + '<span>Sección</span></button>' +
          '</div>' +
        '</div>',
      onCerrar: function () { ENC.intentarCerrar(); }
    });
    var box = document.getElementById('enc-preguntas');
    /* Resalta la tarjeta en la que se está escribiendo */
    box.addEventListener('focusin', function (ev) {
      var card = ev.target.closest('.eb-q, .eb-sec');
      box.querySelectorAll('.activa').forEach(function (c) { if (c !== card) c.classList.remove('activa'); });
      if (card) card.classList.add('activa');
    });
    ENC.pintarCabecera();
    ENC.renderPreguntas();

    /* La altura de los textos depende del ancho y de la fuente: se recalcula
       cuando cambia el ancho (barra de scroll, girar el celular, ventana) y
       cuando termina de cargar la tipografía. */
    var anchoPrevio = box.clientWidth;
    if (window.ResizeObserver) {
      ENC._ro && ENC._ro.disconnect();
      ENC._ro = new ResizeObserver(function () {
        if (box.clientWidth === anchoPrevio) return;
        anchoPrevio = box.clientWidth;
        ENC.ajustarAltos();
      });
      ENC._ro.observe(box);
    }
    if (!ENC._alResize) {
      var t;
      ENC._alResize = function () { clearTimeout(t); t = setTimeout(ENC.ajustarAltos, 120); };
      window.addEventListener('resize', ENC._alResize);
    }
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(ENC.ajustarAltos);
    requestAnimationFrame(function () { requestAnimationFrame(ENC.ajustarAltos); });
  },

  ajustarAltos: function () {
    var box = document.getElementById('enc-preguntas');
    if (box) box.querySelectorAll('.eb-autoalto').forEach(ENC.autoAlto);
    var head = document.getElementById('enc-sv-head');
    if (head) head.querySelectorAll('.eb-autoalto').forEach(ENC.autoAlto);
  },

  instantanea: function () { return JSON.stringify(ENC.b ? ENC.b.preguntas : null); },

  intentarCerrar: function () {
    if (!ENC.b || ENC.instantanea() === ENC.foto) { ENC.cerrarPreguntas(); return; }
    RCR.confirmar({
      titulo: '¿Salir sin guardar?',
      texto: 'Los cambios en las preguntas se pierden.',
      label: 'Salir',
      onOk: "RCR.cerrarModal('m-confirm');ENC.cerrarPreguntas();"
    });
  },

  cerrarPreguntas: function () {
    if (ENC._ro) { ENC._ro.disconnect(); ENC._ro = null; }
    ENC.cerrarMenu();
    ENC.b = null;
    ENC.reordenando = false;
    RCR.cerrarSubvista();
  },

  /* Título, descripción y estado arriba de las preguntas */
  pintarCabecera: function () {
    var el = document.getElementById('enc-sv-head');
    if (!el || !ENC.b) return;
    var abierta = ENC.b.estado !== 'cerrada';
    el.innerHTML =
      '<header class="eb-hero">' +
        '<div class="eb-hero-top">' +
          '<span class="eb-estado ' + (abierta ? 'on' : '') + '"><i></i>' + (abierta ? 'Abierta' : 'Cerrada') + '</span>' +
          '<button class="eb-pill" type="button" onclick="ENC.abrirDatos(\'' + ENC.b.docId + '\')" ' +
            'aria-label="Editar título, descripción y estado">' + ico('edit', 14) + 'Editar</button>' +
        '</div>' +
        '<h1 class="eb-hero-tit">' + RCR.esc(ENC.b.titulo || 'Sin título') + '</h1>' +
        (ENC.b.descripcion ? '<p class="eb-hero-desc">' + RCR.esc(ENC.b.descripcion) + '</p>' : '') +
        '<div class="eb-hero-meta" id="enc-sv-meta"></div>' +
      '</header>';
    ENC.pintarMeta();
  },

  /* "3 preguntas · 2 secciones" bajo el título */
  pintarMeta: function () {
    var el = document.getElementById('enc-sv-meta');
    if (!el || !ENC.b) return;
    var nq = ENC.soloPreguntas(ENC.b.preguntas).length;
    var ns = ENC.b.preguntas.length - nq;
    el.textContent = nq + (nq === 1 ? ' pregunta' : ' preguntas') +
      (ns ? ' · ' + ns + (ns === 1 ? ' sección' : ' secciones') : '');
  },

  /* Modo reordenar: lista compacta para arrastrar o mover con flechas */
  toggleReordenar: function () {
    ENC.reordenando = !ENC.reordenando;
    var b = document.getElementById('enc-sv-orden');
    if (b) { b.classList.toggle('activo', ENC.reordenando); b.setAttribute('aria-pressed', String(ENC.reordenando)); }
    var add = document.getElementById('enc-add-q');
    if (add) add.classList.toggle('hidden', ENC.reordenando);
    ENC.renderPreguntas();
  },

  renderOrden: function (box) {
    var ps = ENC.b.preguntas, total = ps.length, nq = 0, ns = 0;
    box.innerHTML =
      '<div class="eb-nota">' + ico('sort', 14) + 'Arrastra o usa las flechas. Toca reordenar otra vez para seguir editando.</div>' +
      '<div class="eb-orden">' +
      ps.map(function (q, i) {
        var sec = ENC.esSeccion(q);
        var t = (q.texto || '').trim() || (sec ? '(sección sin título)' : '(sin texto)');
        return '' +
        '<div class="eb-orden-row' + (sec ? ' sec' : '') + '" draggable="true" data-i="' + i + '" ' +
          'ondragstart="ENC.dragInicio(event,' + i + ')" ondragover="ENC.dragSobre(event)" ' +
          'ondragleave="this.classList.remove(\'sobre\')" ondrop="ENC.soltar(event,' + i + ')" ondragend="ENC.dragFin()">' +
          '<span class="eb-orden-grip" aria-hidden="true">' + ico('grip', 16) + '</span>' +
          '<span class="eb-num' + (sec ? ' sec' : '') + '">' + (sec ? ico('seccion', 13) : (++nq)) + '</span>' +
          '<span class="eb-orden-txt"><strong>' + RCR.esc(t) + '</strong>' +
            '<small>' + (sec ? 'Sección ' + (++ns) : RCR.esc(ENC.tipoLabel(q.tipo))) + (q.condicion ? ' · con condición' : '') + '</small></span>' +
          '<button class="eb-ico" type="button" title="Subir" aria-label="Subir"' + (i === 0 ? ' disabled' : '') + ' onclick="ENC.mover(' + i + ',-1)">' + ico('chevronUp', 16) + '</button>' +
          '<button class="eb-ico" type="button" title="Bajar" aria-label="Bajar"' + (i === total - 1 ? ' disabled' : '') + ' onclick="ENC.mover(' + i + ',1)">' + ico('chevronDown', 16) + '</button>' +
        '</div>';
      }).join('') +
      '</div>';
  },

  dragInicio: function (ev, i) {
    ENC._arrastre = i;
    ev.dataTransfer.effectAllowed = 'move';
    try { ev.dataTransfer.setData('text/plain', String(i)); } catch (e) { /* algunos navegadores */ }
    ev.currentTarget.classList.add('arrastrando');
  },
  dragSobre: function (ev) {
    if (ENC._arrastre == null) return;
    ev.preventDefault();
    ev.currentTarget.classList.add('sobre');
  },
  soltar: function (ev, i) {
    ev.preventDefault();
    var de = ENC._arrastre;
    ENC._arrastre = null;
    if (de == null || de === i) { ENC.renderPreguntas(); return; }
    ENC.moverA(de, i);
  },
  dragFin: function () {
    ENC._arrastre = null;
    document.querySelectorAll('.eb-orden-row').forEach(function (r) { r.classList.remove('arrastrando', 'sobre'); });
  },

  renderPreguntas: function () {
    var box = document.getElementById('enc-preguntas');
    if (!box) return;
    ENC.pintarMeta();
    if (ENC.reordenando) { ENC.renderOrden(box); return; }
    var ps = ENC.b.preguntas;
    var nq = ENC.soloPreguntas(ps).length, kq = 0, ks = 0;
    var chev = '<span class="eb-chev" aria-hidden="true">' + ico('chevronDown', 14, 2.4) + '</span>';

    box.innerHTML = ps.map(function (q, i) {
      /* ── Sección ── */
      if (ENC.esSeccion(q)) {
        ks++;
        return '' +
        '<section class="eb-sec" id="encq-' + q.id + '">' +
          '<div class="eb-sec-head">' +
            ENC.asaHtml(i, 'sección ' + ks) +
            '<span class="eb-sec-tag">' + ico('seccion', 14) + 'Sección ' + ks + '</span>' +
            '<span class="eb-flex"></span>' +
            '<span class="eb-acc">' +
              ENC.botonesApoyo(i) +
              '<button class="eb-ico danger" type="button" title="Eliminar sección" aria-label="Eliminar sección" onclick="ENC.quitarPregunta(' + i + ')">' + ico('trash', 16) + '</button>' +
            '</span>' +
            ENC.botonMas(i) +
          '</div>' +
          '<input class="eb-sec-tit" value="' + ENC.attr(q.texto) + '" placeholder="Título de la sección" maxlength="140" ' +
            'aria-label="Título de la sección" oninput="ENC.setTexto(' + i + ',this.value)">' +
          '<textarea class="eb-sec-desc eb-autoalto" rows="1" placeholder="Descripción (opcional)" aria-label="Descripción de la sección" ' +
            'oninput="ENC.b.preguntas[' + i + '].descripcion=this.value;ENC.autoAlto(this)">' + RCR.esc(q.descripcion || '') + '</textarea>' +
          ENC.apoyoHtml(q, i) +
          '<div class="eb-cond" id="encc-' + q.id + '">' + ENC.condHtml(i) + '</div>' +
        '</section>';
      }

      /* ── Pregunta ── */
      kq++;
      var cuerpo = '';
      if (q.tipo === 'unica' || q.tipo === 'multiple') {
        cuerpo =
          '<div class="eb-opts">' +
            q.opciones.map(function (o, j) {
              return '<div class="eb-opt">' +
                '<span class="eb-mark' + (q.tipo === 'multiple' ? ' cuadro' : '') + '" aria-hidden="true"></span>' +
                '<textarea class="eb-opt-inp eb-autoalto" rows="1" placeholder="Opción ' + (j + 1) + '" aria-label="Opción ' + (j + 1) + '" ' +
                  'onkeydown="ENC.enterLista(event,\'agregarOpcion\',' + i + ')" ' +
                  'oninput="ENC.setOpcion(' + i + ',' + j + ',this.value);ENC.autoAlto(this)">' + RCR.esc(o) + '</textarea>' +
                (q.opciones.length > 2
                  ? '<button class="eb-quitar" type="button" title="Quitar opción" aria-label="Quitar opción ' + (j + 1) + '" onclick="ENC.quitarOpcion(' + i + ',' + j + ')">' + ico('x', 13, 2.6) + '</button>'
                  : '') +
              '</div>';
            }).join('') +
            '<button class="eb-opt-add" type="button" onclick="ENC.agregarOpcion(' + i + ')">' +
              '<span class="eb-mas" aria-hidden="true">' + ico('plus', 13, 2.6) + '</span>Agregar opción</button>' +
          '</div>';
      } else if (q.tipo === 'escala') {
        cuerpo = '<div class="eb-muestra"><div class="eb-escala">' +
          [1, 2, 3, 4, 5].map(function (v) { return '<span>' + v + '</span>'; }).join('') +
          '</div><div class="eb-escala-ext"><span>Bajo</span><span>Alto</span></div></div>';
      } else if (q.tipo === 'sino') {
        cuerpo = '<div class="eb-muestra"><div class="eb-sino"><span>Sí</span><span>No</span></div></div>';
      } else if (q.tipo === 'cuadricula') {
        ENC.prepararCuadricula(q);
        cuerpo =
          '<div class="eb-sub">Filas <small>lo que se evalúa (por ejemplo, cada alimento)</small></div>' +
          ENC.listaGrid(i, q.filas, 'fila') +
          '<div class="eb-sub">Columnas <small>las respuestas posibles, en orden (máx. ' + ENC.MAX_COLUMNAS + ')</small></div>' +
          ENC.listaGrid(i, q.columnas, 'col') +
          '<div class="eb-nota-grid">' + ico('table', 14) + 'Quien responde marca una columna en cada fila.</div>';
      } else if (q.tipo === 'numero') {
        cuerpo = '<div class="eb-muestra"><div class="eb-linea eb-linea-num"><b>123</b>Respuesta con un número</div></div>';
      } else if (q.tipo === 'imagen') {
        cuerpo = '<div class="eb-muestra"><div class="eb-subir">' + ico('image', 20) +
          '<span><strong>Subir una foto</strong>Quien responde podrá adjuntar una imagen o tomarla con el celular.</span></div></div>';
      } else {
        cuerpo = '<div class="eb-muestra"><div class="eb-linea' + (q.tipo === 'largo' ? ' largo' : '') + '">' +
          (q.tipo === 'largo' ? 'Respuesta larga' : 'Respuesta corta') + '</div></div>';
      }

      return '' +
      '<article class="eb-q" id="encq-' + q.id + '">' +
        '<div class="eb-q-head">' +
          ENC.asaHtml(i, 'pregunta ' + kq) +
          '<span class="eb-num">' + kq + '</span>' +
          '<label class="eb-select">' +
            '<select aria-label="Tipo de pregunta" onchange="ENC.setTipo(' + i + ',this.value)">' +
              ENC.TIPOS.map(function (t) {
                return '<option value="' + t.id + '"' + (t.id === q.tipo ? ' selected' : '') + '>' + t.label + '</option>';
              }).join('') +
            '</select>' + chev +
          '</label>' +
          '<span class="eb-flex"></span>' +
          '<span class="eb-acc">' +
            ENC.botonesApoyo(i) +
            '<button class="eb-ico" type="button" title="Duplicar" aria-label="Duplicar pregunta" onclick="ENC.duplicarPregunta(' + i + ')">' + ico('copy', 16) + '</button>' +
            (nq > 1 ? '<button class="eb-ico danger" type="button" title="Eliminar" aria-label="Eliminar pregunta" onclick="ENC.quitarPregunta(' + i + ')">' + ico('trash', 16) + '</button>' : '') +
          '</span>' +
          ENC.botonMas(i) +
        '</div>' +
        '<textarea class="eb-q-txt eb-autoalto" rows="1" placeholder="Escribe la pregunta" aria-label="Texto de la pregunta ' + kq + '" ' +
          'oninput="ENC.setTexto(' + i + ',this.value);ENC.autoAlto(this)">' + RCR.esc(q.texto) + '</textarea>' +
        ENC.apoyoHtml(q, i) +
        cuerpo +
        '<div class="eb-ajustes">' +
          '<label class="eb-fila"><span class="eb-fila-txt">Obligatoria</span>' +
            '<span class="eb-switch"><input type="checkbox" role="switch"' + (q.requerida ? ' checked' : '') +
              ' onchange="ENC.b.preguntas[' + i + '].requerida=this.checked"><i></i></span></label>' +
          (q.tipo === 'multiple' ? ENC.maxHtml(q, i, chev) : '') +
          '<div class="eb-cond" id="encc-' + q.id + '">' + ENC.condHtml(i) + '</div>' +
        '</div>' +
      '</article>';
    }).join('');

    box.querySelectorAll('.eb-autoalto').forEach(ENC.autoAlto);
  },

  /* ── Opción múltiple: cuántas se pueden elegir ─────────────────────────── */
  maxValido: function (q) {
    var n = parseInt(q && q.maxElegir, 10);
    return (q && q.tipo === 'multiple' && n >= 1 && n < (q.opciones || []).length) ? n : 0;
  },

  maxHtml: function (q, i, chev) {
    var n = ENC.maxValido(q), tope = q.opciones.length - 1, ops = '<option value="">Sin límite</option>';
    for (var k = 1; k <= tope; k++) {
      ops += '<option value="' + k + '"' + (k === n ? ' selected' : '') + '>Hasta ' + k + '</option>';
    }
    return '<div class="eb-fila"><span class="eb-fila-txt">Máximo de respuestas</span>' +
      '<label class="eb-select"><select aria-label="Cuántas opciones se pueden elegir" ' +
        'onchange="ENC.b.preguntas[' + i + '].maxElegir=this.value?Number(this.value):null">' + ops + '</select>' + chev + '</label>' +
    '</div>';
  },

  /* ── Arrastrar una tarjeta desde su esquina (mouse y dedo) ─────────────── */
  asaHtml: function (i, nombre) {
    return '<button class="eb-asa" type="button" title="Arrastra para mover" aria-label="Mover ' + nombre + ' (o usa las flechas del teclado)" ' +
      'onpointerdown="ENC.asaInicio(event,' + i + ')" onkeydown="ENC.asaTecla(event,' + i + ')">' + ico('grip', 16) + '</button>';
  },

  /* Con el teclado: flecha arriba / abajo mueve la tarjeta */
  asaTecla: function (ev, i) {
    var d = ev.key === 'ArrowUp' ? -1 : (ev.key === 'ArrowDown' ? 1 : 0);
    if (!d) return;
    ev.preventDefault();
    var id = ENC.b.preguntas[i].id;
    ENC.moverA(i, i + d);
    var asa = document.querySelector('#encq-' + id + ' .eb-asa');
    if (asa) { asa.focus(); asa.closest('.eb-q, .eb-sec').scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  },

  asaInicio: function (ev, i) {
    if (ev.button > 0) return;
    ev.preventDefault();
    var asa = ev.currentTarget;
    var card = asa.closest('.eb-q, .eb-sec');
    var box = document.getElementById('enc-preguntas');
    var scroller = document.getElementById('subvista-body');
    if (!card || !box) return;
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    try { asa.setPointerCapture(ev.pointerId); } catch (e) { /* sin captura */ }

    var d = { card: card, box: box, sc: scroller, y0: ev.clientY, top0: card.offsetTop, scroll0: scroller ? scroller.scrollTop : 0, y: ev.clientY };
    ENC._arr = d;
    card.classList.add('levantada');
    box.classList.add('ordenando');

    var pintar = function () {
      var dy = d.y - d.y0 + (d.sc ? d.sc.scrollTop - d.scroll0 : 0) - (card.offsetTop - d.top0);
      card.style.transform = 'translateY(' + dy + 'px) scale(1.015)';
    };
    var mover = function (e) {
      d.y = e.clientY;
      /* Intercambia con la vecina cuando el puntero pasa su mitad */
      var prev = card.previousElementSibling, next = card.nextElementSibling;
      if (prev && d.y < prev.getBoundingClientRect().top + prev.offsetHeight / 2) box.insertBefore(card, prev);
      else if (next && d.y > next.getBoundingClientRect().top + next.offsetHeight / 2) box.insertBefore(next, card);
      pintar();
    };
    /* Desplaza la pantalla si se arrastra cerca del borde */
    var auto = function () {
      if (ENC._arr !== d) return;
      if (d.sc) {
        var alto = window.innerHeight, v = 0;
        if (d.y < 110) v = -Math.ceil((110 - d.y) / 8);
        else if (d.y > alto - 110) v = Math.ceil((d.y - (alto - 110)) / 8);
        if (v) { d.sc.scrollTop += v; mover({ clientY: d.y }); }
      }
      d.raf = requestAnimationFrame(auto);
    };
    var soltar = function () {
      asa.removeEventListener('pointermove', mover);
      asa.removeEventListener('pointerup', soltar);
      asa.removeEventListener('pointercancel', soltar);
      cancelAnimationFrame(d.raf);
      ENC._arr = null;
      card.style.transform = '';
      card.classList.remove('levantada');
      box.classList.remove('ordenando');
      /* Nuevo orden según el DOM */
      var orden = Array.prototype.map.call(box.children, function (el) { return el.id.replace(/^encq-/, ''); });
      var porId = {};
      ENC.b.preguntas.forEach(function (q) { porId[q.id] = q; });
      var nuevo = orden.map(function (id) { return porId[id]; }).filter(Boolean);
      if (nuevo.length !== ENC.b.preguntas.length) { ENC.renderPreguntas(); return; }
      var cambio = nuevo.some(function (q, k) { return q !== ENC.b.preguntas[k]; });
      ENC.b.preguntas = nuevo;
      if (cambio) ENC.trasMover();
      else ENC.renderPreguntas();
    };
    asa.addEventListener('pointermove', mover);
    asa.addEventListener('pointerup', soltar);
    asa.addEventListener('pointercancel', soltar);
    d.raf = requestAnimationFrame(auto);
  },

  /* ── Menú "⋯" de la tarjeta (en pantallas angostas reemplaza los íconos) ── */
  botonMas: function (i) {
    return '<button class="eb-ico eb-mas-btn" type="button" title="Más acciones" aria-label="Más acciones" aria-haspopup="menu" ' +
      'onclick="ENC.menuAcciones(event,' + i + ')">' + ico('mas', 18) + '</button>';
  },

  menuAcciones: function (ev, i) {
    ev.stopPropagation();
    var btn = ev.currentTarget;
    if (ENC._menu && ENC._menu.btn === btn) { ENC.cerrarMenu(); return; }
    ENC.cerrarMenu();
    var q = ENC.b.preguntas[i], sec = ENC.esSeccion(q);
    var puedeQuitar = sec || ENC.soloPreguntas(ENC.b.preguntas).length > 1;
    var items = [
      { ico: 'image', t: q.apoyoImg ? 'Cambiar imagen' : 'Agregar imagen', fn: function () { ENC.elegirApoyoImg(i); } },
      { ico: 'link', t: q.enlace ? 'Editar enlace' : 'Agregar enlace', fn: function () { ENC.agregarEnlace(i); } }
    ];
    if (!sec) items.push({ ico: 'copy', t: 'Duplicar', fn: function () { ENC.duplicarPregunta(i); } });
    if (puedeQuitar) items.push({ ico: 'trash', t: sec ? 'Eliminar sección' : 'Eliminar pregunta', peligro: true, fn: function () { ENC.quitarPregunta(i); } });

    var m = document.createElement('div');
    m.className = 'eb-menu';
    m.setAttribute('role', 'menu');
    items.forEach(function (it) {
      var b = document.createElement('button');
      b.type = 'button';
      b.setAttribute('role', 'menuitem');
      b.className = 'eb-menu-it' + (it.peligro ? ' peligro' : '');
      b.innerHTML = '<span>' + RCR.esc(it.t) + '</span>' + ico(it.ico, 17);
      b.onclick = function () { ENC.cerrarMenu(); it.fn(); };
      m.appendChild(b);
    });
    document.getElementById('subvista').appendChild(m);
    var r = btn.getBoundingClientRect();
    var top = r.bottom + 6;
    if (top + m.offsetHeight > window.innerHeight - 12) top = Math.max(12, r.top - 6 - m.offsetHeight);
    m.style.top = top + 'px';
    m.style.right = Math.max(12, window.innerWidth - r.right) + 'px';
    requestAnimationFrame(function () { m.classList.add('open'); });
    btn.setAttribute('aria-expanded', 'true');

    var fuera = function (e) { if (!m.contains(e.target) && e.target !== btn && !btn.contains(e.target)) ENC.cerrarMenu(); };
    var tecla = function (e) { if (e.key === 'Escape') { ENC.cerrarMenu(); btn.focus(); } };
    var sc = document.getElementById('subvista-body');
    document.addEventListener('pointerdown', fuera, true);
    document.addEventListener('keydown', tecla);
    if (sc) sc.addEventListener('scroll', ENC.cerrarMenu, { once: true });
    ENC._menu = { el: m, btn: btn, fuera: fuera, tecla: tecla };
    var primero = m.querySelector('button');
    if (primero) primero.focus({ preventScroll: true });
  },

  cerrarMenu: function () {
    var x = ENC._menu;
    if (!x) return;
    ENC._menu = null;
    document.removeEventListener('pointerdown', x.fuera, true);
    document.removeEventListener('keydown', x.tecla);
    x.btn.setAttribute('aria-expanded', 'false');
    x.el.remove();
  },

  /* ── Imagen y enlace de apoyo (los ve quien responde) ──────────────────── */
  botonesApoyo: function (i) {
    var q = ENC.b.preguntas[i];
    return '' +
      '<button class="eb-ico' + (q.apoyoImg ? ' on' : '') + '" type="button" title="' + (q.apoyoImg ? 'Cambiar imagen' : 'Agregar imagen') + '" ' +
        'aria-label="' + (q.apoyoImg ? 'Cambiar imagen' : 'Agregar imagen') + '" onclick="ENC.elegirApoyoImg(' + i + ')">' + ico('image', 16) + '</button>' +
      '<button class="eb-ico' + (q.enlace ? ' on' : '') + '" type="button" title="Agregar enlace" aria-label="Agregar enlace" ' +
        'onclick="ENC.agregarEnlace(' + i + ')">' + ico('link', 16) + '</button>';
  },

  apoyoHtml: function (q, i) {
    var h = '';
    if (q.apoyoImg && ENC.esImagen(q.apoyoImg)) {
      h += '<div class="eb-apoyo-img"><img src="' + q.apoyoImg + '" alt="Imagen de apoyo">' +
        '<button class="eb-quitar sobre" type="button" title="Quitar imagen" aria-label="Quitar imagen" onclick="ENC.quitarApoyoImg(' + i + ')">' + ico('x', 13, 2.6) + '</button></div>';
    }
    if (q.enlace) {
      h += '<div class="eb-opts eb-enlace">' +
        '<div class="eb-opt">' + '<span class="eb-enlace-ico" aria-hidden="true">' + ico('link', 15) + '</span>' +
          '<input class="eb-opt-inp" type="url" inputmode="url" value="' + ENC.attr(q.enlace.url) + '" placeholder="https://… (video, documento, página)" ' +
            'aria-label="Dirección del enlace" oninput="ENC.b.preguntas[' + i + '].enlace.url=this.value">' +
          '<button class="eb-quitar" type="button" title="Quitar enlace" aria-label="Quitar enlace" onclick="ENC.quitarEnlace(' + i + ')">' + ico('x', 13, 2.6) + '</button>' +
        '</div>' +
        '<div class="eb-opt"><span class="eb-enlace-ico" aria-hidden="true">' + ico('edit', 14) + '</span>' +
          '<input class="eb-opt-inp" value="' + ENC.attr(q.enlace.texto || '') + '" maxlength="80" placeholder="Texto del botón (opcional)" ' +
            'aria-label="Texto del enlace" oninput="ENC.b.preguntas[' + i + '].enlace.texto=this.value">' +
        '</div>' +
      '</div>';
    }
    return h;
  },

  elegirApoyoImg: function (i) {
    var q = ENC.b.preguntas[i];
    var inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = 'image/*';
    inp.onchange = function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      RCR.toast('Preparando la imagen…');
      ENC.comprimirImagen(f, ENC.IMG_APOYO).then(function (url) {
        q.apoyoImg = url;
        ENC.renderPreguntas();
      }).catch(function () { RCR.toast('Elige un archivo de imagen (JPG o PNG)'); });
    };
    inp.click();
  },

  quitarApoyoImg: function (i) {
    delete ENC.b.preguntas[i].apoyoImg;
    ENC.renderPreguntas();
  },

  agregarEnlace: function (i) {
    var q = ENC.b.preguntas[i];
    if (!q.enlace) { q.enlace = { url: '', texto: '' }; ENC.renderPreguntas(); }
    ENC.enfocar(q.id, '.eb-enlace input');
  },

  quitarEnlace: function (i) {
    delete ENC.b.preguntas[i].enlace;
    ENC.renderPreguntas();
  },

  /* Los textos crecen con el contenido (como en Notas de iOS) */
  autoAlto: function (el) {
    if (!el || !el.isConnected || !el.offsetParent) return;   // oculto: se ajusta luego
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  },

  /* Enter en una opción, fila o columna agrega la siguiente (sin saltos de línea) */
  enterLista: function (ev, fn, i) {
    if (ev.key !== 'Enter' || ev.isComposing) return;
    ev.preventDefault();
    ENC[fn](i);
  },

  /* Número visible de una pregunta (las secciones no cuentan) */
  numDe: function (id) {
    return ENC.soloPreguntas(ENC.b.preguntas).findIndex(function (p) { return p.id === id; }) + 1;
  },

  /* Bloque "Mostrar solo si…" de la pregunta o sección i */
  condHtml: function (i) {
    var q = ENC.b.preguntas[i];
    var sec = ENC.esSeccion(q);
    var fuentes = ENC.b.preguntas.slice(0, i).filter(function (p) {
      return ENC.RAMIFICAN.indexOf(p.tipo) >= 0 && ENC.valoresDe(p).length;
    });
    if (!fuentes.length) {
      return (i > 0 && !sec)
        ? '<div class="eb-fila nota">' + ico('branch', 14) + '<span>Para mostrar esta pregunta según una respuesta, antes agrega una de opción, escala o Sí/No.</span></div>'
        : '';
    }

    var c = q.condicion;
    var html =
      '<label class="eb-fila"><span class="eb-fila-txt">' + ico('branch', 15) +
        (sec ? 'Mostrar la sección solo si…' : 'Mostrar solo si…') + '</span>' +
        '<span class="eb-switch"><input type="checkbox" role="switch"' + (c ? ' checked' : '') +
          ' onchange="ENC.toggleCond(' + i + ',this.checked)"><i></i></span></label>';

    if (c) {
      var src = ENC.b.preguntas.find(function (p) { return p.id === c.pregunta; });
      var vals = ENC.valoresDe(src);
      var chev = '<span class="eb-chev" aria-hidden="true">' + ico('chevronDown', 14, 2.4) + '</span>';
      html +=
        '<div class="eb-cond-campos">' +
          '<label class="eb-select ancho"><select aria-label="Pregunta de la condición" onchange="ENC.setCondPregunta(' + i + ',this.value)">' +
            fuentes.map(function (p) {
              var t = (p.texto || '').trim() || '(sin texto)';
              return '<option value="' + p.id + '"' + (p.id === c.pregunta ? ' selected' : '') + '>' +
                'P' + ENC.numDe(p.id) + '. ' + RCR.esc(t.length > 60 ? t.slice(0, 60) + '…' : t) + '</option>';
            }).join('') +
          '</select>' + chev + '</label>' +
          '<span class="eb-cond-op">' + (src && src.tipo === 'multiple' ? 'incluye' : 'es') + '</span>' +
          '<label class="eb-select"><select aria-label="Respuesta de la condición" onchange="ENC.setCondValor(' + i + ',this.value)">' +
            vals.map(function (v) {
              return '<option value="' + ENC.attr(v) + '"' + (v === c.valor ? ' selected' : '') + '>' + RCR.esc(v) + '</option>';
            }).join('') +
          '</select>' + chev + '</label>' +
        '</div>';
    }
    return html;
  },

  /* Repinta solo los bloques de condición (no quita el foco del campo en uso) */
  refrescarConds: function () {
    ENC.limpiarCondiciones();
    ENC.b.preguntas.forEach(function (q, i) {
      var el = document.getElementById('encc-' + q.id);
      if (el) el.innerHTML = ENC.condHtml(i);
    });
  },

  /* Quita o corrige condiciones que ya no son válidas (pregunta movida,
     borrada, tipo cambiado u opción eliminada). */
  limpiarCondiciones: function () {
    var ps = ENC.b.preguntas;
    ps.forEach(function (q, i) {
      var c = q.condicion;
      if (!c) return;
      var idx = ps.findIndex(function (p) { return p.id === c.pregunta; });
      var src = ps[idx];
      if (idx < 0 || idx >= i || ENC.RAMIFICAN.indexOf(src.tipo) < 0) { q.condicion = null; return; }
      var vals = ENC.valoresDe(src);
      if (!vals.length) { q.condicion = null; return; }
      if (vals.indexOf(c.valor) < 0) c.valor = vals[0];
    });
  },

  setTexto: function (i, v) {
    ENC.b.preguntas[i].texto = v;
    ENC.refrescarConds();
  },

  setTipo: function (i, tipo) {
    var q = ENC.b.preguntas[i];
    q.tipo = tipo;
    if ((tipo === 'unica' || tipo === 'multiple') && (!q.opciones || q.opciones.length < 2)) {
      q.opciones = ['Opción 1', 'Opción 2'];
    }
    if (tipo === 'cuadricula') ENC.prepararCuadricula(q);
    ENC.limpiarCondiciones();
    ENC.renderPreguntas();
  },

  /* ── Cuadrícula: editar filas y columnas ──────────────────────────────── */
  setFila: function (i, j, v) { ENC.b.preguntas[i].filas[j].t = v; },
  agregarFila: function (i) {
    var q = ENC.b.preguntas[i];
    q.filas.push(ENC.nuevaFila('Fila ' + (q.filas.length + 1)));
    ENC.renderPreguntas();
    ENC.enfocarUltimo(q.id, '.eb-grid-filas .eb-opt-inp');
  },
  quitarFila: function (i, j) {
    var q = ENC.b.preguntas[i];
    if (q.filas.length <= 1) return;
    q.filas.splice(j, 1);
    ENC.renderPreguntas();
  },
  setColumna: function (i, j, v) { ENC.b.preguntas[i].columnas[j] = v; },
  agregarColumna: function (i) {
    var q = ENC.b.preguntas[i];
    if (q.columnas.length >= ENC.MAX_COLUMNAS) { RCR.toast('Máximo ' + ENC.MAX_COLUMNAS + ' columnas'); return; }
    q.columnas.push('Columna ' + (q.columnas.length + 1));
    ENC.renderPreguntas();
    ENC.enfocarUltimo(q.id, '.eb-grid-cols .eb-opt-inp');
  },
  quitarColumna: function (i, j) {
    var q = ENC.b.preguntas[i];
    if (q.columnas.length <= 2) return;
    q.columnas.splice(j, 1);
    ENC.renderPreguntas();
  },
  enfocarUltimo: function (id, sel) {
    var ins = document.querySelectorAll('#encq-' + id + ' ' + sel);
    var u = ins[ins.length - 1];
    if (u) { u.focus(); u.select(); }
  },

  /* Lista editable (filas o columnas de la cuadrícula) */
  listaGrid: function (i, items, tipo) {
    var esFila = tipo === 'fila';
    var min = esFila ? 1 : 2;
    return '<div class="eb-opts ' + (esFila ? 'eb-grid-filas' : 'eb-grid-cols') + '">' +
      items.map(function (it, j) {
        var t = esFila ? it.t : it;
        var marca = esFila
          ? '<span class="eb-grid-n" aria-hidden="true">' + (j + 1) + '</span>'
          : '<span class="eb-grid-color" aria-hidden="true" style="background:' + ENC.colorColumna(j, items.length).fondo + '"></span>';
        return '<div class="eb-opt">' + marca +
          '<textarea class="eb-opt-inp eb-autoalto" rows="1" placeholder="' + (esFila ? 'Fila ' : 'Columna ') + (j + 1) + '" ' +
            'aria-label="' + (esFila ? 'Fila ' : 'Columna ') + (j + 1) + '" ' +
            'onkeydown="ENC.enterLista(event,\'' + (esFila ? 'agregarFila' : 'agregarColumna') + '\',' + i + ')" ' +
            'oninput="ENC.' + (esFila ? 'setFila' : 'setColumna') + '(' + i + ',' + j + ',this.value);ENC.autoAlto(this)">' + RCR.esc(t) + '</textarea>' +
          (items.length > min
            ? '<button class="eb-quitar" type="button" title="Quitar" aria-label="Quitar ' + (esFila ? 'fila ' : 'columna ') + (j + 1) + '" ' +
                'onclick="ENC.' + (esFila ? 'quitarFila' : 'quitarColumna') + '(' + i + ',' + j + ')">' + ico('x', 13, 2.6) + '</button>'
            : '') +
        '</div>';
      }).join('') +
      ((esFila || items.length < ENC.MAX_COLUMNAS)
        ? '<button class="eb-opt-add" type="button" onclick="ENC.' + (esFila ? 'agregarFila' : 'agregarColumna') + '(' + i + ')">' +
            '<span class="eb-mas" aria-hidden="true">' + ico('plus', 13, 2.6) + '</span>' + (esFila ? 'Agregar fila' : 'Agregar columna') + '</button>'
        : '') +
    '</div>';
  },

  setOpcion: function (i, j, v) {
    var q = ENC.b.preguntas[i];
    var antes = String(q.opciones[j]).trim();
    q.opciones[j] = v;
    /* Las condiciones que apuntaban a esta opción siguen al nuevo texto */
    ENC.b.preguntas.forEach(function (p) {
      if (p.condicion && p.condicion.pregunta === q.id && p.condicion.valor === antes) {
        p.condicion.valor = String(v).trim();
      }
    });
    ENC.refrescarConds();
  },

  agregarOpcion: function (i) {
    var q = ENC.b.preguntas[i];
    q.opciones.push('Opción ' + (q.opciones.length + 1));
    ENC.renderPreguntas();
    var inputs = document.querySelectorAll('#encq-' + q.id + ' .eb-opt-inp');
    var ult = inputs[inputs.length - 1];
    if (ult) { ult.focus(); ult.select(); }
  },

  quitarOpcion: function (i, j) {
    ENC.b.preguntas[i].opciones.splice(j, 1);
    ENC.limpiarCondiciones();
    ENC.renderPreguntas();
  },

  agregarPregunta: function () {
    var solo = ENC.soloPreguntas(ENC.b.preguntas);
    var q = ENC.nuevaPregunta(solo.length ? solo[solo.length - 1].tipo : 'unica');
    ENC.b.preguntas.push(q);
    ENC.renderPreguntas();
    ENC.enfocar(q.id, '.eb-q-txt');
  },

  agregarSeccion: function () {
    var s = ENC.nuevaSeccion();
    ENC.b.preguntas.push(s);
    ENC.renderPreguntas();
    ENC.enfocar(s.id, '.eb-sec-tit');
  },

  enfocar: function (id, sel) {
    var el = document.querySelector('#encq-' + id + ' ' + sel);
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
  },

  duplicarPregunta: function (i) {
    var q = JSON.parse(JSON.stringify(ENC.b.preguntas[i]));
    q.id = ENC.nuevoId();
    ENC.b.preguntas.splice(i + 1, 0, q);
    ENC.renderPreguntas();
  },

  quitarPregunta: function (i) {
    /* Siempre queda al menos una pregunta; las secciones se pueden quitar todas */
    if (!ENC.esSeccion(ENC.b.preguntas[i]) && ENC.soloPreguntas(ENC.b.preguntas).length <= 1) return;
    ENC.b.preguntas.splice(i, 1);
    ENC.limpiarCondiciones();
    ENC.renderPreguntas();
  },

  mover: function (i, d) { ENC.moverA(i, i + d); },

  /* Lleva la pregunta de la posición "de" a la posición "a" */
  moverA: function (de, a) {
    var ps = ENC.b.preguntas;
    if (a < 0 || a >= ps.length || a === de) return;
    ps.splice(a, 0, ps.splice(de, 1)[0]);
    ENC.trasMover();
  },

  /* Después de cambiar el orden: quita condiciones que quedaron inválidas */
  trasMover: function () {
    var ps = ENC.b.preguntas;
    var antes = JSON.stringify(ps.map(function (p) { return p.condicion; }));
    ENC.limpiarCondiciones();
    if (JSON.stringify(ps.map(function (p) { return p.condicion; })) !== antes) {
      RCR.toast('Se quitó una condición que dependía de una pregunta posterior');
    }
    ENC.renderPreguntas();
  },

  toggleCond: function (i, on) {
    var q = ENC.b.preguntas[i];
    if (!on) { q.condicion = null; }
    else {
      var fuentes = ENC.b.preguntas.slice(0, i).filter(function (p) {
        return ENC.RAMIFICAN.indexOf(p.tipo) >= 0 && ENC.valoresDe(p).length;
      });
      var src = fuentes[fuentes.length - 1];   // por defecto, la más cercana
      if (!src) return;
      q.condicion = { pregunta: src.id, valor: ENC.valoresDe(src)[0] };
    }
    var el = document.getElementById('encc-' + q.id);
    if (el) el.innerHTML = ENC.condHtml(i);
  },

  setCondPregunta: function (i, pid) {
    var q = ENC.b.preguntas[i];
    var src = ENC.b.preguntas.find(function (p) { return p.id === pid; });
    q.condicion = { pregunta: pid, valor: ENC.valoresDe(src)[0] || '' };
    var el = document.getElementById('encc-' + q.id);
    if (el) el.innerHTML = ENC.condHtml(i);
  },

  setCondValor: function (i, v) {
    var q = ENC.b.preguntas[i];
    if (q.condicion) q.condicion.valor = v;
  },

  /* ── Guardar ───────────────────────────────────────────────────────────── */
  guardar: async function () {
    if (ENC.guardando) return;
    var b = ENC.b;
    if (!b || !b.docId) return;
    if (!ENC.puedeEditarEnc(ENC.buscar(b.docId))) { RCR.toast('No tienes permiso para editar'); return; }
    if (!ENC.soloPreguntas(b.preguntas).length) { RCR.toast('Agrega al menos una pregunta'); return; }
    if (ENC.reordenando) ENC.toggleReordenar();   // para poder señalar errores en la pregunta

    /* Normalizar y validar preguntas y secciones */
    var nq = 0, ns = 0;
    for (var i = 0; i < b.preguntas.length; i++) {
      var q = b.preguntas[i];
      q.texto = String(q.texto || '').trim();
      /* Enlace de apoyo: vacío se quita; mal escrito se avisa */
      if (q.enlace) {
        var u = String(q.enlace.url || '').trim();
        if (!u) { delete q.enlace; }
        else if (!ENC.urlSegura(u)) { ENC.marcarError(q.id, 'El enlace «' + u + '» no es una dirección web válida'); return; }
        else q.enlace = { url: ENC.urlSegura(u), texto: String(q.enlace.texto || '').trim() };
      }
      if (ENC.esSeccion(q)) {
        ns++;
        q.descripcion = String(q.descripcion || '').trim();
        if (!q.texto) { ENC.marcarError(q.id, 'La sección ' + ns + ' no tiene título'); return; }
        continue;
      }
      nq++;
      if (!q.texto) { ENC.marcarError(q.id, 'La pregunta ' + nq + ' no tiene texto'); return; }
      if (q.tipo === 'unica' || q.tipo === 'multiple') {
        var vistas = {};
        q.opciones = q.opciones.map(function (o) { return String(o).trim(); })
          .filter(function (o) { if (!o || vistas[o.toLowerCase()]) return false; vistas[o.toLowerCase()] = 1; return true; });
        if (q.opciones.length < 2) { ENC.marcarError(q.id, 'La pregunta ' + nq + ' necesita al menos 2 opciones distintas'); return; }
      } else if (q.tipo === 'cuadricula') {
        q.opciones = [];
        var vf = {}, vc = {};
        q.filas = (q.filas || []).map(function (f) { return { id: f.id, t: String(f.t || '').trim() }; })
          .filter(function (f) { var k = f.t.toLowerCase(); if (!f.t || vf[k]) return false; vf[k] = 1; return true; });
        q.columnas = (q.columnas || []).map(function (c) { return String(c).trim(); })
          .filter(function (c) { var k = c.toLowerCase(); if (!c || vc[k]) return false; vc[k] = 1; return true; });
        if (!q.filas.length) { ENC.marcarError(q.id, 'La pregunta ' + nq + ' necesita al menos una fila'); return; }
        if (q.columnas.length < 2) { ENC.marcarError(q.id, 'La pregunta ' + nq + ' necesita al menos 2 columnas distintas'); return; }
        if (q.columnas.length > ENC.MAX_COLUMNAS) q.columnas = q.columnas.slice(0, ENC.MAX_COLUMNAS);
      } else {
        q.opciones = [];
      }
    }
    ENC.limpiarCondiciones();

    var data = {
      preguntas: b.preguntas.map(function (q) {
        var cond = q.condicion ? { pregunta: q.condicion.pregunta, valor: q.condicion.valor } : null;
        var x = ENC.esSeccion(q)
          ? { id: q.id, tipo: 'seccion', texto: q.texto, descripcion: q.descripcion, condicion: cond }
          : { id: q.id, tipo: q.tipo, texto: q.texto, requerida: !!q.requerida, opciones: q.opciones, condicion: cond };
        if (ENC.maxValido(q)) x.maxElegir = ENC.maxValido(q);
        if (q.tipo === 'cuadricula') { x.filas = q.filas; x.columnas = q.columnas; }
        if (q.apoyoImg && ENC.esImagen(q.apoyoImg)) x.apoyoImg = q.apoyoImg;
        if (q.enlace) x.enlace = { url: q.enlace.url, texto: q.enlace.texto };
        return x;
      }),
      actualizado: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (JSON.stringify(data.preguntas).length > ENC.LIMITE_DOC) {
      RCR.toast('Las imágenes pesan demasiado para una sola encuesta. Quita alguna e intenta de nuevo.');
      return;
    }

    ENC.guardando = true;
    var btn = document.getElementById('enc-save');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

    try {
      await RCR.db.collection(ENC.COL).doc(b.docId).update(data);
      ENC.guardarLocal(b.docId, data, false);
      ENC.renderPreguntas();            // muestra las opciones ya limpias
      ENC.foto = ENC.instantanea();
      RCR.toast('Preguntas guardadas');
    } catch (e) {
      console.error('ENC.guardar:', e);
      RCR.toast('No se pudo guardar. Revisa tu conexión.');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = ico('save', 20); }
    ENC.guardando = false;
  },

  marcarError: function (qid, msg) {
    RCR.toast(msg);
    var el = document.getElementById('encq-' + qid);
    if (!el) return;
    el.classList.add('enc-q-error');
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { el.classList.remove('enc-q-error'); }, 2400);
  },

  /* ==========================================================================
     COMPARTIR — enlace público para responder (sin login)
     ========================================================================== */
  compartir: function (docId) {
    var e = ENC.datos.find(function (x) { return x._docId === docId; });
    if (!e) return;
    var url = ENC.urlPublica(docId);
    var cerrada = e.estado === 'cerrada';

    RCR.modal({
      id: 'm-enc-compartir',
      titulo: 'Enlace de la encuesta',
      sub: 'Cualquiera con este enlace puede responder, sin iniciar sesión.',
      cuerpo:
        (cerrada
          ? '<div class="enc-aviso">' + ico('alert', 16) + '<span>La encuesta está <strong>cerrada</strong>: el enlace no aceptará respuestas hasta que la abras de nuevo.</span></div>'
          : '') +
        '<div class="form-grp" style="margin-bottom:0">' +
          '<input class="form-inp" id="enc-link-url" value="' + ENC.attr(url) + '" readonly onclick="this.select()">' +
        '</div>',
      acciones:
        '<button class="btn btn-glass" onclick="ENC.previa(\'' + docId + '\')">' + ico('eye', 15) + 'Vista previa</button>' +
        '<button class="btn btn-glass" onclick="ENC.gmail(\'' + docId + '\')">' + ico('mail', 15) + 'Gmail</button>' +
        '<button class="btn btn-primary" onclick="ENC.copiarLink()">' + ico('link', 15) + 'Copiar enlace</button>'
    });

    /* Si todavía no tiene código corto, se crea y se cambia el enlace */
    if (!ENC.esCodigo(e.codigo)) {
      ENC.asegurarCodigo(e).then(function (c) {
        var inp = document.getElementById('enc-link-url');
        if (c && inp) inp.value = ENC.urlPublica(docId);
      });
    }
  },

  copiarLink: function () {
    var input = document.getElementById('enc-link-url');
    if (!input) return;
    var listo = function () { RCR.toast('Enlace copiado'); RCR.cerrarModal('m-enc-compartir'); };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(listo, function () {
        input.select(); document.execCommand('copy'); listo();
      });
    } else {
      input.select(); document.execCommand('copy'); listo();
    }
  },

  /* Abre Gmail con el asunto y el enlace listos; se eligen los destinatarios allí */
  gmail: function (docId) {
    var e = ENC.datos.find(function (x) { return x._docId === docId; });
    if (!e) return;
    var asunto = 'Encuesta: ' + (e.titulo || '');
    var cuerpo = 'Hola,\n\nTe invitamos a responder esta encuesta' +
      (e.descripcion ? ' — ' + e.descripcion : '') + ':\n\n' + ENC.urlPublica(docId) +
      '\n\n¡Gracias!\n' + (RCR.user.nombre || '');
    var url = 'https://mail.google.com/mail/?view=cm&fs=1' +
      '&su=' + encodeURIComponent(asunto) + '&body=' + encodeURIComponent(cuerpo);
    window.open(url, '_blank', 'noopener');
  },

  previa: function (docId) {
    window.open(ENC.urlPublica(docId, true), '_blank', 'noopener');
  },

  /* ==========================================================================
     ELIMINAR (la encuesta y sus respuestas)
     ========================================================================== */
  pedirBorrar: function (docId) {
    var e = ENC.datos.find(function (x) { return x._docId === docId; });
    if (!ENC.puedeBorrarEnc(e)) { RCR.toast('Solo quien creó la encuesta puede eliminarla'); return; }
    ENC.pendienteBorrar = docId;
    var n = ENC.conteos[docId];
    RCR.confirmar({
      titulo: '¿Eliminar la encuesta?',
      texto: '«' + RCR.esc((e && e.titulo) || 'Encuesta') + '» y ' +
        (n ? 'sus <strong>' + n + ' respuestas</strong>' : 'sus respuestas') +
        ' se eliminarán. El enlace dejará de funcionar. Esta acción no se puede deshacer.',
      label: 'Eliminar',
      onOk: 'ENC.borrar()'
    });
  },

  borrar: async function () {
    if (ENC.borrando || !ENC.pendienteBorrar) return;
    ENC.borrando = true;
    var id = ENC.pendienteBorrar;
    var btn = document.getElementById('confirm-ok');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    try {
      /* Primero las respuestas (las reglas consultan la encuesta para
         permitirlo), en lotes de hasta 450; luego la encuesta. */
      var borrarTodas = async function (snap) {
        for (var i = 0; i < snap.docs.length; i += 450) {
          var lote = RCR.db.batch();
          snap.docs.slice(i, i + 450).forEach(function (d) { lote.delete(d.ref); });
          await lote.commit();
        }
      };
      await borrarTodas(await ENC.refResp(id).get());
      var enc = ENC.buscar(id);
      if (enc && ENC.esCodigo(enc.codigo)) {
        try { await RCR.db.collection(ENC.COL_COD).doc(enc.codigo).delete(); }
        catch (e3) { console.warn('ENC.borrar código:', e3); }
      }
      try { await borrarTodas(await RCR.db.collection(ENC.COL_RESP).where('encuestaId', '==', id).get()); }
      catch (e2) { /* formato antiguo ya cerrado */ }
      await RCR.db.collection(ENC.COL).doc(id).delete();
      ENC.datos = ENC.datos.filter(function (x) { return x._docId !== id; });
      delete ENC.conteos[id];
      ENC.render();
      RCR.cerrarModal('m-confirm');
      RCR.toast('Encuesta eliminada');
    } catch (e) {
      console.error('ENC.borrar:', e);
      RCR.toast('No se pudo eliminar');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = 'Eliminar'; }
    ENC.pendienteBorrar = null;
    ENC.borrando = false;
  }
};

window.ENC = ENC;

/* ==========================================================================
   Mi RCR — Perfil "encuestas"
   ──────────────────────────────────────────────────────────────────────────
   · Encuestas: crear / editar encuestas con preguntas de varios tipos y
     lógica condicional ("mostrar solo si…"), y compartir el enlace público.
   · El enlace público (responder-encuesta.html) se responde SIN iniciar sesión
     y guarda cada respuesta en la colección "RespuestasEncuesta".

   Colecciones de Firestore
     Encuestas/{id}            { titulo, descripcion, estado: 'abierta'|'cerrada',
                                 preguntas: [Pregunta], creadoPor, creadoPorNombre,
                                 creado, actualizado }
     RespuestasEncuesta/{id}   { encuestaId, respuestas: { <preguntaId>: valor }, enviado }

   Pregunta = { id, tipo, texto, requerida, opciones: [..], condicion: null | { pregunta, valor } }
     tipo: corto | largo | unica | multiple | escala | sino
     valor guardado: texto (corto/largo/unica/sino), número 1–5 (escala), lista (multiple)

   Reglas de Firestore necesarias (pegar dentro de
   "match /databases/{database}/documents { … }", sin borrar las que ya existen):

     match /Encuestas/{id} {
       allow get: if true;                                  // el enlace público lee la encuesta
       allow list, create, update, delete: if request.auth != null;
     }
     match /RespuestasEncuesta/{id} {
       allow create: if request.resource.data.keys().hasOnly(['encuestaId', 'respuestas', 'enviado'])
         && request.resource.data.encuestaId is string
         && request.resource.data.respuestas is map
         && request.resource.data.enviado == request.time
         && get(/databases/$(database)/documents/Encuestas/$(request.resource.data.encuestaId)).data.estado == 'abierta';
       allow read, delete: if request.auth != null;
       allow update: if false;
     }

   Este archivo también lo carga responder-encuesta.html (con un RCR mínimo):
   no debe ejecutar nada al cargarse, solo definir objetos.
   ========================================================================== */

RCR.modulos.encuestas = {
  id: 'encuestas',
  titulo: 'Encuestas',
  icono: 'encuesta',
  workspace: 'encuestas',
  enNav: true,
  crear: { label: 'Nueva encuesta', soloEditor: true, accion: function () { ENC.abrirForm(null); } },
  mount: function (root) { ENC.mount(root); },
  onShow: function () { if (ENC.cargado) ENC.render(); }
};

var ENC = {
  COL: 'Encuestas',
  COL_RESP: 'RespuestasEncuesta',

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
    { id: 'sino',     label: 'Sí / No' }
  ],

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
    var vis = {}, porId = {};
    (preguntas || []).forEach(function (q) {
      porId[q.id] = q;
      var c = q.condicion;
      if (!c || !c.pregunta) { vis[q.id] = true; return; }
      var src = porId[c.pregunta];
      vis[q.id] = !!(src && vis[src.id] && ENC.cumple(src, resp[src.id], c.valor));
    });
    return vis;
  },

  /* Formatea un valor guardado para mostrarlo */
  fmtValor: function (v) {
    if (Array.isArray(v)) return v.join(', ');
    return v == null ? '' : String(v);
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

  urlPublica: function (id, previa) {
    var base = location.href.split('#')[0].split('?')[0].replace(/[^/]*$/, '');
    return base + 'responder-encuesta.html?id=' + encodeURIComponent(id) + (previa ? '&previa=1' : '');
  },

  /* ==========================================================================
     LISTADO
     ========================================================================== */
  mount: function (root) {
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Encuestas</div>' +
          '<div class="section-sub">Crea encuestas y comparte el enlace</div>' +
        '</div>' +
        '<div class="count-badge" id="enc-count">0</div>' +
      '</div>' +
      '<div id="enc-list">' + RCR.cargando('Cargando encuestas') + '</div>';
    ENC.cargar();
  },

  /* Lee las encuestas una sola vez (la usan Encuestas y Resultados).
     Cada persona ve las encuestas que creó; el Admin ve todas. */
  asegurarDatos: function () {
    if (ENC.cargado) return Promise.resolve();
    if (!ENC._leyendo) {
      var q = RCR.db.collection(ENC.COL);
      if (!RCR.esAdmin()) q = q.where('creadoPor', '==', RCR.user.correo);
      ENC._leyendo = q.get().then(function (snap) {
        ENC.datos = snap.docs.map(function (d) { return Object.assign({ _docId: d.id }, d.data()); });
        ENC.ordenar();
        ENC.cargado = true;
      }).finally(function () { ENC._leyendo = null; });
    }
    return ENC._leyendo;
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
    ENC.datos.forEach(function (e) {
      var q = RCR.db.collection(ENC.COL_RESP).where('encuestaId', '==', e._docId);
      var p = (typeof q.count === 'function')
        ? q.count().get().then(function (s) { return s.data().count; })
        : q.get().then(function (s) { return s.size; });
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
    var cnt = document.getElementById('enc-count');
    if (cnt) cnt.textContent = ENC.datos.length;

    if (!ENC.datos.length) {
      list.innerHTML = RCR.vacio('encuesta', 'Aún no hay encuestas',
        RCR.puedeEditar() ? 'Toca + para crear la primera.' : 'Cuando crees una encuesta aparecerá aquí.');
      return;
    }

    var editable = RCR.puedeEditar();
    list.innerHTML = ENC.datos.map(function (e) {
      var id = e._docId;
      var n = (e.preguntas || []).length;
      var abierta = e.estado !== 'cerrada';
      var nResp = ENC.conteos[id];
      var autor = (RCR.esAdmin() && e.creadoPor && e.creadoPor !== RCR.user.correo)
        ? ' · ' + RCR.esc(e.creadoPorNombre || e.creadoPor) : '';
      return '' +
      '<div class="card enc-card"' + (editable ? ' onclick="ENC.abrirForm(\'' + id + '\')"' : '') + '>' +
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
        '</div>' +
        '<div class="card-icobar" onclick="event.stopPropagation();">' +
          '<button class="btn-ico" title="Compartir enlace" aria-label="Compartir enlace" onclick="ENC.compartir(\'' + id + '\')">' + ico('link', 17) + '</button>' +
          '<button class="btn-ico" title="Vista previa" aria-label="Vista previa" onclick="ENC.previa(\'' + id + '\')">' + ico('eye', 17) + '</button>' +
          (window.RES && RCR.puedeVerSeccion('encuestas', 'resultados-encuesta')
            ? '<button class="btn-ico" title="Ver resultados" aria-label="Ver resultados" onclick="RES.abrir(\'' + id + '\')">' + ico('barChart', 17) + '</button>'
            : '') +
          (editable ?
          '<button class="btn-ico" title="Editar" aria-label="Editar" onclick="ENC.abrirForm(\'' + id + '\')">' + ico('edit', 16) + '</button>' +
          '<button class="btn-ico" title="Duplicar" aria-label="Duplicar" onclick="ENC.duplicar(\'' + id + '\')">' + ico('copy', 16) + '</button>' +
          '<button class="btn-ico danger" title="Eliminar" aria-label="Eliminar" onclick="ENC.pedirBorrar(\'' + id + '\')">' + ico('trash', 16) + '</button>'
          : '') +
        '</div>' +
      '</div>';
    }).join('');
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

  abrirForm: function (docId, base) {
    if (!RCR.puedeEditar()) { RCR.toast('No tienes permiso para editar'); return; }
    var e = docId ? ENC.datos.find(function (x) { return x._docId === docId; }) : (base || null);
    var src = e ? JSON.parse(JSON.stringify({
      titulo: e.titulo || '', descripcion: e.descripcion || '',
      estado: e.estado || 'abierta', preguntas: e.preguntas || []
    })) : null;

    ENC.b = src || { titulo: '', descripcion: '', estado: 'abierta', preguntas: [ENC.nuevaPregunta('unica')] };
    ENC.b.docId = docId || null;

    RCR.modal({
      id: 'm-enc-form',
      persistente: true,
      titulo: docId ? 'Editar encuesta' : 'Nueva encuesta',
      sub: 'Agrega preguntas y, si quieres, condiciones para mostrarlas',
      cuerpo:
        '<div class="form-grp"><label class="form-lbl">Título *</label>' +
          '<input class="form-inp" id="enc-f-titulo" maxlength="140" placeholder="Ej. Encuesta de clima laboral" ' +
            'value="' + ENC.attr(ENC.b.titulo) + '" oninput="ENC.b.titulo=this.value"></div>' +
        '<div class="form-grp"><label class="form-lbl">Descripción <span class="opt">(opcional)</span></label>' +
          '<textarea class="form-inp" id="enc-f-desc" rows="2" placeholder="Cuéntale a quien responde de qué se trata" ' +
            'oninput="ENC.b.descripcion=this.value">' + RCR.esc(ENC.b.descripcion) + '</textarea></div>' +
        '<div class="form-grp"><label class="form-lbl">Estado</label>' +
          '<select class="form-inp" id="enc-f-estado" onchange="ENC.b.estado=this.value">' +
            '<option value="abierta"' + (ENC.b.estado !== 'cerrada' ? ' selected' : '') + '>Abierta — recibe respuestas</option>' +
            '<option value="cerrada"' + (ENC.b.estado === 'cerrada' ? ' selected' : '') + '>Cerrada — no recibe respuestas</option>' +
          '</select></div>' +
        '<div class="seg-sep">Preguntas</div>' +
        '<div id="enc-preguntas"></div>' +
        '<button class="rep-add" type="button" onclick="ENC.agregarPregunta()">' + ico('plus', 15) + 'Agregar pregunta</button>',
      acciones:
        '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-enc-form\')">Cancelar</button>' +
        '<button class="btn btn-primary" id="enc-save" onclick="ENC.guardar()">Guardar</button>'
    });
    ENC.renderPreguntas();
  },

  renderPreguntas: function () {
    var box = document.getElementById('enc-preguntas');
    if (!box) return;
    var ps = ENC.b.preguntas, total = ps.length;

    box.innerHTML = ps.map(function (q, i) {
      var conOpciones = q.tipo === 'unica' || q.tipo === 'multiple';
      var opciones = '';
      if (conOpciones) {
        opciones =
          '<div class="form-lbl">Opciones</div>' +
          '<div class="enc-opts">' +
            q.opciones.map(function (o, j) {
              return '<div class="enc-opt-row">' +
                '<span class="enc-opt-mark ' + (q.tipo === 'multiple' ? 'cuadro' : '') + '"></span>' +
                '<input class="form-inp" value="' + ENC.attr(o) + '" placeholder="Opción ' + (j + 1) + '" ' +
                  'oninput="ENC.setOpcion(' + i + ',' + j + ',this.value)">' +
                (q.opciones.length > 2
                  ? '<button class="btn-ico danger" type="button" title="Quitar opción" aria-label="Quitar opción" onclick="ENC.quitarOpcion(' + i + ',' + j + ')">' + ico('x', 15) + '</button>'
                  : '') +
              '</div>';
            }).join('') +
          '</div>' +
          '<button class="rep-add enc-add-opt" type="button" onclick="ENC.agregarOpcion(' + i + ')">' + ico('plus', 15) + 'Agregar opción</button>';
      } else if (q.tipo === 'escala') {
        opciones = '<div class="form-help">Se responde eligiendo un número del 1 (bajo) al 5 (alto).</div>';
      } else if (q.tipo === 'sino') {
        opciones = '<div class="form-help">Se responde con Sí o No.</div>';
      }

      return '' +
      '<div class="rep-block enc-q" id="encq-' + q.id + '">' +
        '<div class="rep-head">' +
          '<span class="rep-num">Pregunta ' + (i + 1) + '</span>' +
          '<div class="enc-q-tools">' +
            '<button class="btn-ico" type="button" title="Subir" aria-label="Subir pregunta"' + (i === 0 ? ' disabled' : '') + ' onclick="ENC.mover(' + i + ',-1)">' + ico('chevronUp', 16) + '</button>' +
            '<button class="btn-ico" type="button" title="Bajar" aria-label="Bajar pregunta"' + (i === total - 1 ? ' disabled' : '') + ' onclick="ENC.mover(' + i + ',1)">' + ico('chevronDown', 16) + '</button>' +
            '<button class="btn-ico" type="button" title="Duplicar" aria-label="Duplicar pregunta" onclick="ENC.duplicarPregunta(' + i + ')">' + ico('copy', 15) + '</button>' +
            (total > 1 ? '<button class="btn-ico danger" type="button" title="Eliminar" aria-label="Eliminar pregunta" onclick="ENC.quitarPregunta(' + i + ')">' + ico('trash', 15) + '</button>' : '') +
          '</div>' +
        '</div>' +
        '<div class="form-grp">' +
          '<input class="form-inp enc-q-texto" value="' + ENC.attr(q.texto) + '" placeholder="Escribe la pregunta" ' +
            'oninput="ENC.setTexto(' + i + ',this.value)">' +
        '</div>' +
        '<div class="enc-q-fila">' +
          '<select class="form-inp" aria-label="Tipo de pregunta" onchange="ENC.setTipo(' + i + ',this.value)">' +
            ENC.TIPOS.map(function (t) {
              return '<option value="' + t.id + '"' + (t.id === q.tipo ? ' selected' : '') + '>' + t.label + '</option>';
            }).join('') +
          '</select>' +
          '<label class="check-line"><input type="checkbox"' + (q.requerida ? ' checked' : '') +
            ' onchange="ENC.b.preguntas[' + i + '].requerida=this.checked"><span>Obligatoria</span></label>' +
        '</div>' +
        opciones +
        '<div class="enc-cond" id="encc-' + q.id + '">' + ENC.condHtml(i) + '</div>' +
      '</div>';
    }).join('');
  },

  /* Bloque "Mostrar solo si…" de la pregunta i */
  condHtml: function (i) {
    var q = ENC.b.preguntas[i];
    var fuentes = ENC.b.preguntas.slice(0, i).filter(function (p) {
      return ENC.RAMIFICAN.indexOf(p.tipo) >= 0 && ENC.valoresDe(p).length;
    });
    if (!fuentes.length) {
      return i > 0
        ? '<div class="enc-cond-nota">' + ico('branch', 14) + 'Para usar una condición, antes debe haber una pregunta de opción, escala o Sí/No.</div>'
        : '';
    }

    var c = q.condicion;
    var html =
      '<label class="check-line"><input type="checkbox"' + (c ? ' checked' : '') +
        ' onchange="ENC.toggleCond(' + i + ',this.checked)">' +
        '<span>' + ico('branch', 14) + ' Mostrar solo si…</span></label>';

    if (c) {
      var src = ENC.b.preguntas.find(function (p) { return p.id === c.pregunta; });
      var vals = ENC.valoresDe(src);
      html +=
        '<div class="enc-cond-campos">' +
          '<select class="form-inp" aria-label="Pregunta de la condición" onchange="ENC.setCondPregunta(' + i + ',this.value)">' +
            fuentes.map(function (p) {
              var n = ENC.b.preguntas.indexOf(p) + 1;
              var t = (p.texto || '').trim() || '(sin texto)';
              return '<option value="' + p.id + '"' + (p.id === c.pregunta ? ' selected' : '') + '>' +
                'P' + n + '. ' + RCR.esc(t.length > 60 ? t.slice(0, 60) + '…' : t) + '</option>';
            }).join('') +
          '</select>' +
          '<div class="enc-cond-op">' + (src && src.tipo === 'multiple' ? 'incluye' : 'es') + '</div>' +
          '<select class="form-inp" aria-label="Respuesta de la condición" onchange="ENC.setCondValor(' + i + ',this.value)">' +
            vals.map(function (v) {
              return '<option value="' + ENC.attr(v) + '"' + (v === c.valor ? ' selected' : '') + '>' + RCR.esc(v) + '</option>';
            }).join('') +
          '</select>' +
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
    ENC.limpiarCondiciones();
    ENC.renderPreguntas();
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
    var inputs = document.querySelectorAll('#encq-' + q.id + ' .enc-opt-row input');
    var ult = inputs[inputs.length - 1];
    if (ult) { ult.focus(); ult.select(); }
  },

  quitarOpcion: function (i, j) {
    ENC.b.preguntas[i].opciones.splice(j, 1);
    ENC.limpiarCondiciones();
    ENC.renderPreguntas();
  },

  agregarPregunta: function () {
    var ps = ENC.b.preguntas;
    var tipo = ps.length ? ps[ps.length - 1].tipo : 'unica';
    var q = ENC.nuevaPregunta(tipo);
    ps.push(q);
    ENC.renderPreguntas();
    var el = document.querySelector('#encq-' + q.id + ' .enc-q-texto');
    if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
  },

  duplicarPregunta: function (i) {
    var q = JSON.parse(JSON.stringify(ENC.b.preguntas[i]));
    q.id = ENC.nuevoId();
    ENC.b.preguntas.splice(i + 1, 0, q);
    ENC.renderPreguntas();
  },

  quitarPregunta: function (i) {
    if (ENC.b.preguntas.length <= 1) return;
    ENC.b.preguntas.splice(i, 1);
    ENC.limpiarCondiciones();
    ENC.renderPreguntas();
  },

  mover: function (i, d) {
    var ps = ENC.b.preguntas, j = i + d;
    if (j < 0 || j >= ps.length) return;
    var t = ps[i]; ps[i] = ps[j]; ps[j] = t;
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
    if (!RCR.puedeEditar()) { RCR.toast('No tienes permiso para editar'); return; }

    var b = ENC.b;
    var titulo = String(b.titulo || '').trim();
    if (!titulo) { RCR.toast('Ponle un título a la encuesta'); document.getElementById('enc-f-titulo').focus(); return; }
    if (!b.preguntas.length) { RCR.toast('Agrega al menos una pregunta'); return; }

    /* Normalizar y validar preguntas */
    for (var i = 0; i < b.preguntas.length; i++) {
      var q = b.preguntas[i];
      q.texto = String(q.texto || '').trim();
      if (!q.texto) { ENC.marcarError(q.id, 'La pregunta ' + (i + 1) + ' no tiene texto'); return; }
      if (q.tipo === 'unica' || q.tipo === 'multiple') {
        var vistas = {};
        q.opciones = q.opciones.map(function (o) { return String(o).trim(); })
          .filter(function (o) { if (!o || vistas[o.toLowerCase()]) return false; vistas[o.toLowerCase()] = 1; return true; });
        if (q.opciones.length < 2) { ENC.marcarError(q.id, 'La pregunta ' + (i + 1) + ' necesita al menos 2 opciones distintas'); return; }
      } else {
        q.opciones = [];
      }
    }
    ENC.limpiarCondiciones();

    var data = {
      titulo: titulo,
      descripcion: String(b.descripcion || '').trim(),
      estado: b.estado === 'cerrada' ? 'cerrada' : 'abierta',
      preguntas: b.preguntas.map(function (q) {
        return {
          id: q.id, tipo: q.tipo, texto: q.texto, requerida: !!q.requerida,
          opciones: q.opciones,
          condicion: q.condicion ? { pregunta: q.condicion.pregunta, valor: q.condicion.valor } : null
        };
      }),
      actualizado: firebase.firestore.FieldValue.serverTimestamp()
    };

    ENC.guardando = true;
    var btn = document.getElementById('enc-save');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

    try {
      var id = b.docId;
      if (id) {
        await RCR.db.collection(ENC.COL).doc(id).update(data);
      } else {
        data.creadoPor = RCR.user.correo;
        data.creadoPorNombre = RCR.user.nombre || RCR.user.correo;
        data.creado = firebase.firestore.FieldValue.serverTimestamp();
        var ref = await RCR.db.collection(ENC.COL).add(data);
        id = ref.id;
      }
      /* Copia local con fecha aproximada (el servidor pone la real) */
      var ahora = firebase.firestore.Timestamp.now();
      var local = Object.assign({}, data, { _docId: id, actualizado: ahora });
      if (!b.docId) local.creado = ahora;
      var k = ENC.datos.findIndex(function (x) { return x._docId === id; });
      if (k >= 0) ENC.datos[k] = Object.assign(ENC.datos[k], local);
      else { ENC.datos.unshift(local); ENC.conteos[id] = 0; }
      ENC.ordenar();
      ENC.render();
      RCR.cerrarModal('m-enc-form');
      RCR.toast(b.docId ? 'Encuesta actualizada' : 'Encuesta creada');
      if (!b.docId) ENC.compartir(id);
    } catch (e) {
      console.error('ENC.guardar:', e);
      RCR.toast('No se pudo guardar. Revisa tu conexión.');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; }
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

  duplicar: function (docId) {
    var e = ENC.datos.find(function (x) { return x._docId === docId; });
    if (!e) return;
    var copia = JSON.parse(JSON.stringify({ titulo: e.titulo, descripcion: e.descripcion, estado: 'abierta', preguntas: e.preguntas || [] }));
    copia.titulo = 'Copia de ' + (copia.titulo || 'encuesta');
    ENC.abrirForm(null, copia);
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
        '<button class="btn btn-glass" onclick="ENC.gmail(\'' + docId + '\')">' + ico('mail', 15) + 'Gmail</button>' +
        '<button class="btn btn-primary" onclick="ENC.copiarLink()">' + ico('link', 15) + 'Copiar enlace</button>'
    });
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
    if (!RCR.puedeEditar()) { RCR.toast('No tienes permiso para eliminar'); return; }
    var e = ENC.datos.find(function (x) { return x._docId === docId; });
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
      await RCR.db.collection(ENC.COL).doc(id).delete();
      /* Respuestas: en lotes de hasta 450 */
      try {
        var snap = await RCR.db.collection(ENC.COL_RESP).where('encuestaId', '==', id).get();
        for (var i = 0; i < snap.docs.length; i += 450) {
          var lote = RCR.db.batch();
          snap.docs.slice(i, i + 450).forEach(function (d) { lote.delete(d.ref); });
          await lote.commit();
        }
      } catch (e2) { console.warn('ENC.borrar respuestas:', e2); }
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

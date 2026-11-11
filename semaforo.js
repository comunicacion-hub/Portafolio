/* ==========================================================================
   Mi RCR — semaforo.js
   Semáforo de Bienestar: un registro mensual por colaborador.
   Mantiene la estructura de la colección "Semáforo" que ya existe.

   Vista: anillos del mes elegido (uno por área) + dock con los 12 meses
   de un año. Se cambia de año con flechas, así el dock nunca crece.
   ========================================================================== */

window.RCR = window.RCR || { modulos: {} };

RCR.modulos.semaforo = {
  id: 'semaforo',
  titulo: 'Semáforo',
  icono: 'semaforo',
  enNav: true,
  crear: { label: 'Nuevo registro', accion: function () { SEM.abrirForm(); } },

  mount: function (root) {
    root.innerHTML =
      '<div id="sem-list"></div>';
    SEM.cargar();
  },

  onShow: function () { if (SEM.cargado) SEM.render(); }
};

var SEM = {

  COL: 'Semáforo',

  /* Campos tal como están guardados hoy en Firestore. No cambiar las claves:
     los tableros existentes leen estos nombres. */
  CAMPOS: [
    { key: 'carga',     label: 'Carga y ritmo de trabajo',   corto: 'Carga' },
    { key: 'clima',     label: 'Clima y relaciones',         corto: 'Clima' },
    { key: 'emocional', label: 'Estado emocional y energía', corto: 'Emocional' },
    { key: 'liderazgo', label: 'Liderazgo y apoyo',          corto: 'Liderazgo' }
  ],

  OPCIONES: [
    { val: 'Estoy bien',    color: 'verde' },
    { val: 'Más o menos',   color: 'amarillo' },
    { val: 'No estoy bien', color: 'rojo' }
  ],

  /* Cómo se dibuja cada estado: color del anillo, color del texto y qué
     tanto se cierra el anillo (1 = completo). */
  ESTILO: {
    'Estoy bien':    { color: 'var(--green)',  texto: '#15803d', largo: 1 },
    'Más o menos':   { color: 'var(--yellow)', texto: '#b45309', largo: .62 },
    'No estoy bien': { color: 'var(--red)',    texto: '#be123c', largo: .3 }
  },
  SIN_ESTILO: { color: 'var(--border)', texto: 'var(--text-muted)', largo: 0 },

  /* De afuera hacia adentro: Carga, Clima, Emocional, Liderazgo. El anillo
     interior deja un hueco de ~114px para que quepa "Septiembre". */
  RADIOS: [108, 93, 78, 63],

  CAMPO_TEXTO: '¿Cómo te sentiste este mes? ',   // ojo: la clave real lleva espacio final
  CAMPO_TEXTO_VIEJO: '¿Cómo te sentiste este mes?',

  MESES: ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
          'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  CORTOS: ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'],

  datos: [],
  cargado: false,
  anio: null,        // año que muestra el dock
  selId: null,       // registro abierto en los anillos
  editando: false,
  borrador: null,    // { estados: [...], texto: '' } mientras se edita
  seleccion: {},
  guardando: false,
  borrando: false,
  pendienteBorrar: null,

  /* ── Lectura ──────────────────────────────────────────────────────────── */
  cargar: async function () {
    var list = document.getElementById('sem-list');
    list.innerHTML = RCR.cargando('Cargando tus registros');
    try {
      var snap = await RCR.db.collection(SEM.COL)
        .where('Colaborador', '==', RCR.user.nombre)
        .get();
      SEM.datos = snap.docs.map(function (d) {
        return Object.assign({ _docId: d.id }, d.data());
      });
      SEM.ordenar();
      /* Abre el registro más reciente y su año */
      var ultimo = SEM.datos.find(function (r) { return SEM.clave(r.Mes); });
      if (ultimo) {
        SEM.selId = ultimo._docId;
        SEM.anio  = SEM.clave(ultimo.Mes).y;
      }
      SEM.cargado = true;
      SEM.render();
    } catch (e) {
      console.error('SEM.cargar:', e);
      list.innerHTML = RCR.vacio('alert', 'No se pudieron cargar tus registros',
        'Revisa tu conexión y vuelve a intentar.');
    }
  },

  ordenar: function () {
    SEM.datos.sort(function (a, b) { return SEM.orden(b.Mes) - SEM.orden(a.Mes); });
  },

  /* "Julio 2026" -> 202607 para ordenar sin depender del formato de fecha */
  orden: function (mesVal) {
    var c = SEM.clave(mesVal);
    return c ? c.y * 100 + c.m + 1 : 0;
  },

  /* Lee el mes de un registro, venga como "Julio 2026", "julio de 2026"
     o como Timestamp. Devuelve { y, m, k } o null si no se reconoce. */
  clave: function (mesVal) {
    var t = SEM.fmtMes(mesVal).toLowerCase();
    if (!t) return null;
    var m = SEM.MESES.findIndex(function (x) { return t.indexOf(x.toLowerCase()) !== -1; });
    var y = (t.match(/\d{4}/) || [])[0];
    if (m < 0 || !y) return null;
    return { y: +y, m: m, k: y + '-' + m };
  },

  etiqueta: function (r) {
    var c = r && SEM.clave(r.Mes);
    return c ? SEM.MESES[c.m] + ' ' + c.y : (SEM.fmtMes(r && r.Mes) || '—');
  },

  fmtMes: function (val) {
    if (!val) return '';
    if (typeof val === 'string') return val;
    if (typeof val.toDate === 'function')
      return val.toDate().toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
    if (val.seconds != null)
      return new Date(val.seconds * 1000).toLocaleDateString('es-EC', { month: 'long', year: 'numeric' });
    return String(val);
  },

  /* La Fecha vino de Sheets con apóstrofo inicial; se limpia solo al mostrar */
  fechaLegible: function (f) {
    if (!f) return '';
    return String(f).replace(/^'/, '');
  },

  textoDe: function (r) {
    return (r && (r[SEM.CAMPO_TEXTO] || r[SEM.CAMPO_TEXTO_VIEJO])) || '';
  },

  /* "2026-9" -> registro, para pintar el dock */
  mapa: function () {
    var m = {};
    SEM.datos.forEach(function (r) {
      var c = SEM.clave(r.Mes);
      if (c && !m[c.k]) m[c.k] = r;
    });
    return m;
  },

  seleccionado: function () {
    var id = String(SEM.selId || '');
    return SEM.datos.find(function (r) { return String(r._docId) === id; }) || null;
  },

  /* ── Render ───────────────────────────────────────────────────────────── */
  render: function () {
    var list = document.getElementById('sem-list');
    if (!list) return;

    var hoy = new Date();
    if (SEM.anio == null) SEM.anio = hoy.getFullYear();
    var mapa = SEM.mapa();

    /* El registro abierto tiene que ser del año que muestra el dock */
    var sel = SEM.seleccionado();
    var selC = sel && SEM.clave(sel.Mes);
    if (!sel || !selC || selC.y !== SEM.anio) {
      sel = null;
      for (var m = 11; m >= 0; m--) {
        if (mapa[SEM.anio + '-' + m]) { sel = mapa[SEM.anio + '-' + m]; break; }
      }
      SEM.selId = sel ? sel._docId : null;
      if (!sel) SEM.editando = false;
    }

    list.innerHTML =
      '<div class="semx">' +
        SEM.htmlCabecera(sel) +
        SEM.htmlCuerpo(sel) +
        SEM.htmlDock(mapa, hoy) +
      '</div>';

    if (sel) SEM.animarAnillos(SEM.estadosDe(sel));
  },

  estadosDe: function (r) {
    if (SEM.editando && SEM.borrador) return SEM.borrador.estados;
    return SEM.CAMPOS.map(function (c) { return (r && r[c.label]) || ''; });
  },

  htmlCabecera: function (sel) {
    var acciones = '';
    if (sel && !SEM.editando) {
      var id = RCR.esc(String(sel._docId || ''));
      acciones =
        '<div class="semx-cap">' +
          '<button onclick="SEM.editar()">' + ico('edit', 17) + '<span>Editar</span></button>' +
          '<button class="del" aria-label="Eliminar registro de ' + RCR.esc(SEM.etiqueta(sel)) + '"' +
            ' title="Eliminar" onclick="SEM.pedirBorrar(\'' + id + '\')">' + ico('trash', 17) + '</button>' +
        '</div>';
    }
    return '<div class="semx-head">' +
             '<div>' +
               '<div class="semx-eyebrow">Tu bienestar mes a mes</div>' +
               '<h2 class="semx-title">Semáforo</h2>' +
             '</div>' +
             acciones +
           '</div>';
  },

  htmlCuerpo: function (sel) {
    if (!SEM.datos.length) {
      return RCR.vacio('semaforo', 'Todavía no tienes registros',
        'Toca + o un mes de abajo para contar cómo te fue.');
    }
    if (!sel) {
      return RCR.vacio('semaforo', 'Sin registros en ' + SEM.anio,
        'Toca un mes de abajo para registrarlo.');
    }

    var c = SEM.clave(sel.Mes);
    var ed = SEM.editando;
    var est = SEM.estadosDe(sel);
    var fecha = SEM.fechaLegible(sel.Fecha);

    var hero =
      '<div class="semx-hero' + (ed ? ' editando' : '') + '">' +
        '<div class="semx-rings">' +
          SEM.svgAnillos() +
          '<div class="semx-rings-c"><strong>' + SEM.MESES[c.m] + '</strong><small>' + c.y + '</small></div>' +
        '</div>' +
        '<div class="semx-det">' +
          (fecha ? '<div class="semx-meta">Registrado el ' + RCR.esc(fecha) + '</div>' : '') +
          '<div class="semx-rows" id="semx-rows">' + SEM.htmlFilas(est) + '</div>' +
          (ed ? '<div class="semx-hint">Toca un área para cambiar su estado</div>' : '') +
        '</div>' +
      '</div>';

    var texto = SEM.textoDe(sel);
    var pie;
    if (ed) {
      pie =
        '<div class="semx-edit">' +
          '<label class="form-lbl" for="semx-texto">¿Cómo te sentiste este mes? <span class="opt">(opcional)</span></label>' +
          '<textarea class="form-inp" id="semx-texto" maxlength="500" placeholder="Cuéntanos cómo fue tu mes">' +
            RCR.esc(SEM.borrador.texto) + '</textarea>' +
          '<div class="semx-edit-acc">' +
            '<button class="btn btn-glass" onclick="SEM.cancelarEdicion()">Cancelar</button>' +
            '<button class="btn btn-primary" id="semx-save" onclick="SEM.guardarEdicion()">Guardar</button>' +
          '</div>' +
        '</div>';
    } else {
      pie = texto ? '<p class="semx-quote">“' + RCR.esc(texto) + '”</p>' : '';
    }

    return hero + pie;
  },

  svgAnillos: function () {
    var s = '<svg viewBox="0 0 240 240" aria-hidden="true">';
    SEM.RADIOS.forEach(function (r, i) {
      var L = (2 * Math.PI * r).toFixed(2);
      s += '<circle class="semx-track" cx="120" cy="120" r="' + r + '"/>' +
           '<circle class="semx-arc" data-i="' + i + '" cx="120" cy="120" r="' + r + '"' +
             ' stroke-dasharray="' + L + '" stroke-dashoffset="' + L + '"/>';
    });
    return s + '</svg>';
  },

  /* Cierra cada anillo según su estado. Se llama después de pintar para que
     la transición de CSS los anime desde cero. */
  animarAnillos: function (estados, ambito) {
    var arcs = document.querySelectorAll((ambito || '#sem-list') + ' .semx-arc');
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        arcs.forEach(function (a) {
          var i = +a.getAttribute('data-i');
          var st = SEM.ESTILO[estados[i]] || SEM.SIN_ESTILO;
          var L = 2 * Math.PI * SEM.RADIOS[i];
          a.style.stroke = st.color;
          a.setAttribute('stroke-dashoffset', (L * (1 - st.largo)).toFixed(2));
        });
      });
    });
  },

  htmlFilas: function (estados) {
    var ed = SEM.editando;
    return SEM.CAMPOS.map(function (c, i) {
      var v = estados[i];
      var st = SEM.ESTILO[v] || SEM.SIN_ESTILO;
      var dentro =
        '<span class="semx-dot" style="background:' + st.color + '"></span>' +
        '<span class="semx-lab">' + RCR.esc(c.corto) + '<small>' + RCR.esc(c.label) + '</small></span>' +
        '<span class="semx-st" style="color:' + st.texto + '">' + RCR.esc(v || 'Sin respuesta') + '</span>';
      if (!ed) return '<div class="semx-row">' + dentro + '</div>';
      return '<button type="button" class="semx-row" onclick="SEM.ciclo(' + i + ')"' +
               ' aria-label="' + RCR.esc(c.label) + ': ' + RCR.esc(v || 'sin respuesta') + '. Cambiar estado">' +
               dentro + '<span class="semx-sel">' + ico('chevronDown', 15) + '</span>' +
             '</button>';
    }).join('');
  },

  htmlDock: function (mapa, hoy) {
    var hy = hoy.getFullYear(), hm = hoy.getMonth();
    var anios = SEM.datos.map(function (r) { var c = SEM.clave(r.Mes); return c ? c.y : hy; });
    var minA = Math.min.apply(null, anios.concat([hy]));
    var n = 0;

    var meses = SEM.MESES.map(function (nombre, m) {
      var futuro = SEM.anio > hy || (SEM.anio === hy && m > hm);
      var r = mapa[SEM.anio + '-' + m];
      var lb = '<span class="semx-lb">' + SEM.CORTOS[m] + '</span>';
      var etq = nombre + ' ' + SEM.anio;

      if (futuro) {
        return '<button class="semx-mo fut" disabled aria-label="' + etq + ', todavía no llega">' +
                 '<span class="semx-empty fut"></span>' + lb + '</button>';
      }
      if (r) {
        n++;
        var actual = String(r._docId) === String(SEM.selId);
        var luces = SEM.CAMPOS.map(function (c) {
          var st = SEM.ESTILO[r[c.label]] || SEM.SIN_ESTILO;
          return '<i style="background:' + st.color + '"></i>';
        }).join('');
        return '<button class="semx-mo' + (actual ? ' cur' : '') + '" role="option" aria-selected="' + actual + '"' +
                 ' aria-label="' + etq + '" onclick="SEM.elegir(\'' + RCR.esc(String(r._docId)) + '\')">' +
                 '<span class="semx-pole">' + luces + '</span>' + lb + '</button>';
      }
      return '<button class="semx-mo" role="option" aria-selected="false" aria-label="' + etq + ', sin registro. Registrar"' +
               ' onclick="SEM.abrirForm(\'' + etq + '\')">' +
               '<span class="semx-empty">' + ico('plus', 10, 3) + '</span>' + lb + '</button>';
    }).join('');

    return '<div class="semx-dockbox">' +
             '<div class="semx-yr">' +
               '<button class="semx-yb" aria-label="Año anterior" onclick="SEM.cambiarAnio(-1)"' +
                 (SEM.anio <= minA ? ' disabled' : '') + '>' + ico('chevronLeft', 16, 2.4) + '</button>' +
               '<strong>' + SEM.anio + '</strong>' +
               '<button class="semx-yb" aria-label="Año siguiente" onclick="SEM.cambiarAnio(1)"' +
                 (SEM.anio >= hy ? ' disabled' : '') + '>' + ico('chevronRight', 16, 2.4) + '</button>' +
               '<span class="semx-yr-n">' + (n === 1 ? '1 registro' : n + ' registros') + '</span>' +
             '</div>' +
             '<div class="semx-dock" role="listbox" aria-label="Meses de ' + SEM.anio + '">' + meses + '</div>' +
           '</div>';
  },

  /* ── Navegación ───────────────────────────────────────────────────────── */
  elegir: function (docId) {
    if (SEM.guardando) return;
    SEM.editando = false;
    SEM.selId = docId;
    SEM.render();
  },

  cambiarAnio: function (d) {
    if (SEM.guardando) return;
    SEM.anio += d;
    SEM.editando = false;
    SEM.selId = null;   // render() abre el registro más reciente de ese año
    SEM.render();
  },

  /* ── Editar ───────────────────────────────────────────────────────────── */
  editar: function () {
    var r = SEM.seleccionado();
    if (!r || SEM.guardando) return;
    SEM.borrador = {
      estados: SEM.CAMPOS.map(function (c) { return r[c.label] || ''; }),
      texto: SEM.textoDe(r)
    };
    SEM.editando = true;
    SEM.render();
  },

  /* Pasa un área al siguiente estado: bien → más o menos → no estoy bien */
  ciclo: function (i) {
    if (!SEM.editando || SEM.guardando) return;
    var ops = SEM.OPCIONES.map(function (o) { return o.val; });
    var actual = ops.indexOf(SEM.borrador.estados[i]);
    SEM.borrador.estados[i] = ops[(actual + 1) % ops.length];
    document.getElementById('semx-rows').innerHTML = SEM.htmlFilas(SEM.borrador.estados);
    SEM.animarAnillos(SEM.borrador.estados);
    var fila = document.querySelectorAll('#semx-rows .semx-row')[i];
    if (fila) fila.focus();
  },

  cancelarEdicion: function () {
    if (SEM.guardando) return;
    SEM.editando = false;
    SEM.borrador = null;
    SEM.render();
  },

  guardarEdicion: async function () {
    if (SEM.guardando || !SEM.editando) return;
    var r = SEM.seleccionado();
    if (!r) return;

    var b = SEM.borrador;
    var falta = SEM.CAMPOS.find(function (c, i) { return !b.estados[i]; });
    if (falta) { RCR.toast('Falta responder: ' + falta.label); return; }

    var texto = document.getElementById('semx-texto').value.trim();
    var cambios = {};
    SEM.CAMPOS.forEach(function (c, i) { cambios[c.label] = b.estados[i]; });
    cambios[SEM.CAMPO_TEXTO] = texto;
    /* Algunos registros viejos guardaron el comentario sin el espacio final */
    if (Object.prototype.hasOwnProperty.call(r, SEM.CAMPO_TEXTO_VIEJO)) cambios[SEM.CAMPO_TEXTO_VIEJO] = texto;

    SEM.guardando = true;
    var btn = document.getElementById('semx-save');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';

    try {
      await RCR.db.collection(SEM.COL).doc(r._docId).update(cambios);
      Object.assign(r, cambios);
      SEM.editando = false;
      SEM.borrador = null;
      SEM.guardando = false;
      SEM.render();
      RCR.toast('Cambios guardados');
    } catch (e) {
      console.error('SEM.guardarEdicion:', e);
      RCR.toast(e && e.code === 'permission-denied'
        ? 'No tienes permiso para editar este registro'
        : 'No se pudo guardar. Revisa tu conexión.');
      btn.disabled = false; btn.innerHTML = 'Guardar';
      SEM.guardando = false;
    }
  },

  /* ── Formulario (nuevo registro) ──────────────────────────────────────── */
  /* Hoja de vidrio con: anillos que se llenan mientras respondes, meses en
     botones (sin desplegable), las 4 áreas como controles segmentados y el
     comentario con contador. */
  abrirForm: function (mesPre) {
    if (SEM.guardando) return;
    SEM.seleccion = { carga: '', clima: '', emocional: '', liderazgo: '' };

    var hoy  = new Date();
    var dd   = String(hoy.getDate()).padStart(2, '0');
    var mm   = String(hoy.getMonth() + 1).padStart(2, '0');
    var fecha = dd + '/' + mm + '/' + hoy.getFullYear();

    // Meses disponibles: los últimos 12, del más antiguo al más reciente.
    var mapa = SEM.mapa();
    var meses = [];
    for (var i = 11; i >= 0; i--) {
      var d = new Date(hoy.getFullYear(), hoy.getMonth() - i, 1);
      meses.push({ m: d.getMonth(), y: d.getFullYear() });
    }
    // Un mes elegido desde el dock puede ser más antiguo: se agrega al inicio
    var cPre = mesPre ? SEM.clave(mesPre) : null;
    if (cPre && !meses.some(function (x) { return x.m === cPre.m && x.y === cPre.y; })) {
      meses.unshift({ m: cPre.m, y: cPre.y });
    }

    // Mes inicial: el elegido en el dock o, si no, el más reciente sin registro
    var inicial = '';
    if (cPre && !mapa[cPre.k]) {
      inicial = SEM.MESES[cPre.m] + ' ' + cPre.y;
    } else {
      for (var j = meses.length - 1; j >= 0; j--) {
        if (!mapa[meses[j].y + '-' + meses[j].m]) { inicial = SEM.MESES[meses[j].m] + ' ' + meses[j].y; break; }
      }
    }

    var chips = meses.map(function (x) {
      var etq = SEM.MESES[x.m] + ' ' + x.y;
      var ya  = !!mapa[x.y + '-' + x.m];
      var on  = etq === inicial;
      return '<button type="button" class="semf-mes' + (on ? ' on' : '') + '"' + (ya ? ' disabled' : '') +
               ' data-mes="' + RCR.esc(etq) + '" aria-pressed="' + on + '"' +
               ' aria-label="' + RCR.esc(etq) + (ya ? ', ya registrado' : '') + '"' +
               ' onclick="SEM.elegirMes(this)">' +
               '<span class="semf-mes-m">' + SEM.CORTOS[x.m] + '</span>' +
               '<span class="semf-mes-y">' + (ya ? ico('check', 12, 3) : x.y) + '</span>' +
             '</button>';
    }).join('');

    var areas = SEM.CAMPOS.map(function (c, n) {
      var opts = SEM.OPCIONES.map(function (o) {
        return '<button type="button" class="semf-opt" data-campo="' + c.key + '"' +
               ' data-val="' + RCR.esc(o.val) + '" data-color="' + o.color + '" aria-pressed="false"' +
               ' onclick="SEM.elegirOpcion(this,\'' + c.key + '\',\'' + o.color + '\')">' +
                 '<span class="semf-opt-dot"></span>' +
                 '<span>' + RCR.esc(o.val) + '</span>' +
               '</button>';
      }).join('');
      return '<div class="semf-area" id="semf-area-' + c.key + '">' +
               '<div class="semf-q" id="semf-q-' + c.key + '"><span class="semf-n">' + (n + 1) + '</span>' + RCR.esc(c.label) + '</div>' +
               '<div class="semf-seg" role="group" aria-labelledby="semf-q-' + c.key + '">' + opts + '</div>' +
             '</div>';
    }).join('');

    RCR.modal({
      id: 'm-sem',
      titulo: 'Nuevo registro',
      sub: RCR.esc(RCR.user.nombre) + ' · hoy ' + RCR.esc(fecha),
      persistente: true,   // no se cierra al tocar fuera: se perderían las respuestas
      cuerpo:
        '<input type="hidden" id="sem-fecha" value="' + RCR.esc(fecha) + '">' +
        '<input type="hidden" id="sem-mes" value="' + RCR.esc(inicial) + '">' +
        '<div class="semf">' +
          '<div class="semf-hero">' +
            '<div class="semf-mini" id="semf-mini">' + SEM.svgAnillos() +
              '<div class="semf-mini-c" id="semf-cuenta">0/4</div>' +
            '</div>' +
            '<div class="semf-hero-txt">' +
              '<div class="semf-hero-t" id="semf-titulo">' + RCR.esc(inicial || 'Elige un mes') + '</div>' +
              '<div class="semf-hero-s" id="semf-prog" aria-live="polite">Responde las 4 áreas. Los anillos se llenan con tus respuestas.</div>' +
            '</div>' +
          '</div>' +

          '<div class="semf-sec">' +
            '<div class="semf-lbl" id="semf-lbl-mes">Mes del registro</div>' +
            '<div class="semf-meses" role="group" aria-labelledby="semf-lbl-mes">' + chips + '</div>' +
          '</div>' +

          '<div class="semf-sec">' +
            '<div class="semf-lbl">¿Cómo estuviste en cada área?</div>' +
            '<div class="semf-areas">' + areas + '</div>' +
          '</div>' +

          '<div class="semf-sec">' +
            '<label class="semf-lbl" for="sem-texto">¿Cómo te sentiste este mes? <span class="opt">(opcional)</span></label>' +
            '<textarea class="semf-txt" id="sem-texto" maxlength="500" placeholder="Cuéntanos cómo fue tu mes"' +
              ' oninput="SEM.contar(this)"></textarea>' +
            '<div class="semf-cnt" id="semf-cnt">0 / 500</div>' +
          '</div>' +
        '</div>',
      acciones:
        '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-sem\')">Cancelar</button>' +
        '<button class="btn btn-primary" id="sem-save" onclick="SEM.guardar()">Guardar</button>'
    });
  },

  elegirMes: function (btn) {
    if (btn.disabled) return;
    document.querySelectorAll('#m-sem .semf-mes').forEach(function (b) {
      b.classList.remove('on');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    document.getElementById('sem-mes').value = btn.dataset.mes;
    document.getElementById('semf-titulo').textContent = btn.dataset.mes;
  },

  elegirOpcion: function (btn, campo, color) {
    document.querySelectorAll('#m-sem [data-campo="' + campo + '"]').forEach(function (b) {
      b.classList.remove('on');
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('on');
    btn.setAttribute('aria-pressed', 'true');
    SEM.seleccion[campo] = btn.dataset.val;
    var area = document.getElementById('semf-area-' + campo);
    if (area) { area.setAttribute('data-estado', color); area.classList.remove('falta'); }
    SEM.progresoForm();
  },

  /* Actualiza los anillos de la cabecera y el texto de avance */
  progresoForm: function () {
    var estados = SEM.CAMPOS.map(function (c) { return SEM.seleccion[c.key]; });
    var n = estados.filter(Boolean).length;
    var faltan = SEM.CAMPOS.length - n;
    document.getElementById('semf-cuenta').textContent = n + '/' + SEM.CAMPOS.length;
    document.getElementById('semf-prog').textContent =
      faltan === 0 ? 'Todo listo para guardar.' :
      faltan === 1 ? 'Te falta 1 área.' : 'Te faltan ' + faltan + ' áreas.';
    SEM.animarAnillos(estados, '#semf-mini');
  },

  contar: function (el) {
    document.getElementById('semf-cnt').textContent = el.value.length + ' / 500';
  },

  /* ── Guardar (nuevo registro) ─────────────────────────────────────────── */
  guardar: async function () {
    if (SEM.guardando) return;

    var mes = document.getElementById('sem-mes').value;
    if (!mes) { RCR.toast('Elige el mes del registro'); return; }

    var falta = SEM.CAMPOS.find(function (c) { return !SEM.seleccion[c.key]; });
    if (falta) {
      RCR.toast('Falta responder: ' + falta.label);
      /* Lleva la vista al área pendiente y la marca un momento */
      var area = document.getElementById('semf-area-' + falta.key);
      if (area) {
        area.classList.remove('falta');
        void area.offsetWidth;
        area.classList.add('falta');
        area.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    var cMes = SEM.clave(mes);
    if (cMes && SEM.mapa()[cMes.k]) {
      RCR.toast('Ya tienes un registro de ' + mes);
      return;
    }

    SEM.guardando = true;
    var btn = document.getElementById('sem-save');
    var fab = document.getElementById('fab');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    if (fab) fab.classList.add('loading');

    var data = {
      Colaborador: RCR.user.nombre,
      Correo:      RCR.user.correo,
      Mes:         mes,
      Fecha:       "'" + document.getElementById('sem-fecha').value
    };
    SEM.CAMPOS.forEach(function (c) { data[c.label] = SEM.seleccion[c.key]; });
    data[SEM.CAMPO_TEXTO] = document.getElementById('sem-texto').value.trim();

    try {
      var ref = await RCR.db.collection(SEM.COL).add(data);
      SEM.datos.push(Object.assign({ _docId: ref.id }, data));
      SEM.ordenar();
      /* Abre en los anillos el registro recién creado */
      SEM.selId = ref.id;
      if (cMes) SEM.anio = cMes.y;
      SEM.editando = false;
      SEM.render();
      RCR.cerrarModal('m-sem');
      RCR.toast('Registro guardado');
    } catch (e) {
      console.error('SEM.guardar:', e);
      RCR.toast('No se pudo guardar. Revisa tu conexión.');
    }

    btn.disabled = false; btn.innerHTML = 'Guardar';
    if (fab) fab.classList.remove('loading');
    SEM.guardando = false;
  },

  /* ── Eliminar ─────────────────────────────────────────────────────────── */
  pedirBorrar: function (docId) {
    if (SEM.borrando || !docId) return;
    SEM.pendienteBorrar = docId;
    var r = SEM.datos.find(function (x) { return String(x._docId) === String(docId); });
    RCR.confirmar({
      titulo: '¿Eliminar el registro?',
      texto: 'Se borra tu semáforo de ' + RCR.esc(r ? SEM.etiqueta(r).toLowerCase() : 'este mes') + '. No se puede deshacer.',
      label: 'Eliminar',
      onOk: 'SEM.borrar()'
    });
  },

  borrar: async function () {
    if (SEM.borrando || !SEM.pendienteBorrar) return;
    SEM.borrando = true;
    var btn = document.getElementById('confirm-ok');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      await RCR.db.collection(SEM.COL).doc(SEM.pendienteBorrar).delete();
      SEM.datos = SEM.datos.filter(function (r) {
        return String(r._docId) !== String(SEM.pendienteBorrar);
      });
      if (String(SEM.selId) === String(SEM.pendienteBorrar)) SEM.selId = null;
      SEM.editando = false;
      SEM.render();
      RCR.cerrarModal('m-confirm');
      RCR.toast('Registro eliminado');
    } catch (e) {
      console.error('SEM.borrar:', e);
      RCR.toast('No se pudo eliminar');
    }
    btn.disabled = false; btn.innerHTML = 'Eliminar';
    SEM.pendienteBorrar = null;
    SEM.borrando = false;
  }
};

window.SEM = SEM;

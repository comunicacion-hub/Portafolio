/* ==========================================================================
   Mi RCR — Perfil "encuestas" · Resultados (dashboard consolidado)
   ──────────────────────────────────────────────────────────────────────────
   · La encuesta se elige en la barra de arriba, junto al nombre (ícono de
     encuestas → menú con mis encuestas y las compartidas). Al entrar no hay
     ninguna elegida. Con una elegida aparece al lado el botón de compartir.
     El mismo menú sirve en Datos (la encuesta elegida es compartida).
   · El gráfico depende del tipo de pregunta: dona para Sí/No y opción única
     de pocas opciones, barras para opción múltiple o muchas opciones,
     columnas para la escala 1–5, línea para las respuestas por día.
   · Cada gráfico se descarga por separado como imagen PNG (se dibuja en un
     canvas a partir de los datos, no es una captura de pantalla).
   Lee las respuestas de Encuestas/{id}/Respuestas (ver encuestas.js).
   ========================================================================== */

RCR.modulos['resultados-encuesta'] = {
  id: 'resultados-encuesta',
  titulo: 'Resultados',
  icono: 'barChart',
  workspace: 'encuestas',
  enNav: true,
  mount: function (root) { RES.mount(root); },
  onShow: function () { RES.pintarTopbar(); RES.cargarRespuestas(false); }
};

var RES = {
  sel: '',          // al entrar no hay encuesta elegida
  cache: {},        // encuestaId -> [respuestas]
  expandir: {},     // preguntaId -> true (ver todas las respuestas abiertas)
  graficos: {},     // clave -> datos para dibujar el PNG
  COLOR: '#506CFF', // gráficos de una sola serie: índigo de la marca
  /* Categórica (partes de un todo, en orden fijo). Validada: separación para
     daltonismo y visión normal; aqua y amarillo llevan siempre su % al lado. */
  CAT: ['#506cff', '#eb6834', '#1baf7a', '#eda100'],
  MAX_DONA: 4,      // más opciones que esto → barras
  TEXTOS_VISIBLES: 5,
  SECCIONES_SEL: ['resultados-encuesta', 'datos-encuesta'],

  /* ── Montaje ───────────────────────────────────────────────────────────── */
  mount: function (root) {
    root.innerHTML = '<div class="res-wrap"><div id="res-body"></div></div>';
    RES.iniciarTooltip(root);
    RES.iniciar();
    if (!RES._resize) {
      var t;
      RES._resize = function () { clearTimeout(t); t = setTimeout(RES.dibujarSvgs, 150); };
      window.addEventListener('resize', RES._resize);
    }
  },

  iniciar: async function () {
    try {
      await ENC.asegurarDatos();
    } catch (e) {
      console.error('RES.iniciar:', e);
      RES.pintar(RCR.vacio('alert', 'No se pudieron cargar las encuestas', 'Revisa tu conexión y vuelve a intentar.'));
      return;
    }
    RES.pintarTopbar();
    RES.cargarRespuestas(false);
  },

  /* Abre Resultados con una encuesta ya elegida (desde la tarjeta en Encuestas) */
  abrir: function (id) {
    RES.sel = id;
    RCR.ir('resultados-encuesta');
  },

  /* Lo llaman Encuestas y Compartir cuando cambia la lista */
  poblarSel: function () { RES.pintarTopbar(); },

  encuesta: function () {
    return ENC.datos.find(function (e) { return e._docId === RES.sel; }) || null;
  },

  /* ── Menú de encuestas en la barra de arriba ───────────────────────────── */
  pintarTopbar: function () {
    var slot = document.getElementById('topbar-acciones');
    if (!slot || RES.SECCIONES_SEL.indexOf(RCR.activo) < 0) return;
    RES.cerrarMenu();
    if (!ENC.cargado) { slot.innerHTML = ''; return; }
    if (RES.sel && !RES.encuesta()) RES.sel = '';
    var e = RES.encuesta();
    var tit = e ? (e.titulo || 'Sin título') : '';
    /* En Datos, la lupa va primero: al tocarla se estira como una gota */
    var busca = e && RCR.activo === 'datos-encuesta' && window.DAT;
    var html = (busca ? DAT.buscaHtml() : '') +
      '<div class="encsel">' +
        '<button class="btn-add topbar-add encsel-btn' + (e ? ' con' : '') + '" id="encsel-btn" type="button" ' +
          'aria-haspopup="menu" aria-expanded="false" title="' + ENC.attr(e ? 'Encuesta: ' + tit : 'Elegir encuesta') + '" ' +
          'aria-label="' + ENC.attr(e ? 'Encuesta: ' + tit + '. Cambiar' : 'Elegir encuesta') + '" onclick="RES.toggleMenu(event)">' +
          ico('encuesta', 19, 2.1) +
          (e ? '<span class="encsel-tit">' + RCR.esc(tit) + '</span><span class="encsel-chev" aria-hidden="true">' + ico('chevronDown', 14, 2.6) + '</span>' : '') +
        '</button>' +
        '<div class="encsel-menu" id="encsel-menu" role="menu" hidden></div>' +
      '</div>';
    if (e && ENC.compartirPersonas && ENC.puedeEditarEnc(e)) {
      html += '<button class="btn-add topbar-add" type="button" title="Compartir con personas" aria-label="Compartir con personas" ' +
        'onclick="ENC.compartirPersonas(RES.sel)">' + ico('users', 18, 2.2) + '</button>';
    }
    if (e && RCR.activo === 'datos-encuesta') {
      html += '<button class="btn-add topbar-add" id="dat-excel" type="button" title="Descargar en Excel" aria-label="Descargar en Excel" ' +
        'onclick="DAT.excel()" disabled>' + ico('download', 18, 2.2) + '</button>';
    }
    slot.innerHTML = html;
    if (busca) DAT.buscaListo();
    if (RCR.activo === 'datos-encuesta' && window.DAT) DAT.botonExcel(!!(RES.cache[RES.sel] && RES.cache[RES.sel].length));
  },

  toggleMenu: function (ev) {
    if (ev) ev.stopPropagation();
    var m = document.getElementById('encsel-menu');
    if (!m) return;
    if (!m.hidden) { RES.cerrarMenu(); return; }
    m.innerHTML = RES.menuHtml();
    m.hidden = false;
    var b = document.getElementById('encsel-btn');
    if (b) b.setAttribute('aria-expanded', 'true');
    RES._fuera = function (e) { if (!e.target.closest('.encsel')) RES.cerrarMenu(); };
    RES._tecla = function (e) { if (e.key === 'Escape') { RES.cerrarMenu(); var bb = document.getElementById('encsel-btn'); if (bb) bb.focus(); } };
    document.addEventListener('pointerdown', RES._fuera, true);
    document.addEventListener('keydown', RES._tecla);
    var on = m.querySelector('.encsel-it.on') || m.querySelector('.encsel-it');
    if (on) on.focus({ preventScroll: true });
  },

  cerrarMenu: function () {
    var m = document.getElementById('encsel-menu');
    if (m) m.hidden = true;
    var b = document.getElementById('encsel-btn');
    if (b) b.setAttribute('aria-expanded', 'false');
    if (RES._fuera) document.removeEventListener('pointerdown', RES._fuera, true);
    if (RES._tecla) document.removeEventListener('keydown', RES._tecla);
    RES._fuera = RES._tecla = null;
  },

  menuHtml: function () {
    if (!ENC.datos.length) {
      return '<div class="encsel-vacio">Todavía no tienes encuestas.<br>Créalas en la sección Encuestas.</div>';
    }
    var grupos = ENC.GRUPOS.map(function (g) {
      return { g: g, items: ENC.datos.filter(function (e) { return ENC.grupo(e) === g.id; }) };
    }).filter(function (x) { return x.items.length; });
    var html = grupos.map(function (x) {
      return '<div class="encsel-grupo">' + RCR.esc(x.g.titulo) + '</div>' +
        x.items.map(function (e) {
          var on = e._docId === RES.sel, n = ENC.conteos[e._docId];
          var meta = [];
          if (n != null) meta.push(n + (n === 1 ? ' respuesta' : ' respuestas'));
          if (e.estado === 'cerrada') meta.push('Cerrada');
          /* Como un menú de macOS: la marca de la elegida va a la izquierda */
          return '<button class="encsel-it' + (on ? ' on' : '') + '" type="button" role="menuitemradio" aria-checked="' + on + '" ' +
            'onclick="RES.elegir(\'' + e._docId + '\')">' +
            '<span class="encsel-check" aria-hidden="true">' + (on ? ico('check', 14, 2.8) : '') + '</span>' +
            '<span class="encsel-it-txt"><span>' + RCR.esc(e.titulo || 'Sin título') + '</span>' +
              (meta.length ? '<small>' + RCR.esc(meta.join(' · ')) + '</small>' : '') + '</span>' +
          '</button>';
        }).join('');
    }).join('');
    if (RES.sel) {
      html += '<div class="encsel-sep"></div>' +
        '<button class="encsel-it encsel-acc" type="button" role="menuitem" onclick="RES.actualizar()">' +
          '<span class="encsel-check" aria-hidden="true">' + ico('refresh', 14, 2.4) + '</span>' +
          '<span class="encsel-it-txt"><span>Actualizar respuestas</span></span></button>';
      /* En el celular el botón de Excel de la barra se oculta: va aquí */
      var resps = RES.cache[RES.sel];
      if (RCR.activo === 'datos-encuesta' && window.DAT && resps && resps.length) {
        html += '<button class="encsel-it encsel-acc encsel-solo-movil" type="button" role="menuitem" ' +
            'onclick="RES.cerrarMenu();DAT.excel()">' +
          '<span class="encsel-check" aria-hidden="true">' + ico('download', 14, 2.4) + '</span>' +
          '<span class="encsel-it-txt"><span>Descargar en Excel</span></span></button>';
      }
    }
    return html;
  },

  elegir: function (id) {
    RES.sel = id;
    RES.cerrarMenu();
    RES.pintarTopbar();
    if (RCR.activo === 'datos-encuesta' && window.DAT) DAT.onSel(id);
    else RES.cargarRespuestas(false);
  },

  actualizar: function () {
    RES.cerrarMenu();
    if (RCR.activo === 'datos-encuesta' && window.DAT) DAT.cargar(true);
    else RES.cargarRespuestas(true);
  },

  /* Pantalla vacía hasta elegir una encuesta */
  vacioElegir: function () {
    return '<div class="res-elige">' +
      RCR.vacio('encuesta', 'Elige una encuesta',
        'Toca el ícono de encuestas arriba, junto a tu nombre, para ver ' +
        (RCR.activo === 'datos-encuesta' ? 'sus datos.' : 'sus resultados.')) +
    '</div>';
  },

  /* ── Datos ─────────────────────────────────────────────────────────────── */
  cargarRespuestas: async function (forzar) {
    if (!ENC.cargado) return;
    if (!ENC.datos.length) {
      RES.pintar(RCR.vacio('encuesta', 'Aún no tienes encuestas', 'Crea una en la sección Encuestas para ver aquí sus resultados.'));
      return;
    }
    var id = RES.sel;
    if (!id) { RES.pintar(RES.vacioElegir()); return; }
    if (RES.cache[id] && !forzar) { RES.render(); return; }

    RES.pintar(RCR.cargando('Cargando respuestas'));
    try {
      await RES.leerRespuestas(id, forzar);
    } catch (e) {
      console.error('RES.cargarRespuestas:', e);
      if (id === RES.sel) RES.pintar(RCR.vacio('alert', 'No se pudieron cargar las respuestas', 'Revisa tu conexión y vuelve a intentar.'));
      return;
    }
    if (id === RES.sel) RES.render();
  },

  /* Lee (o reutiliza) las respuestas de una encuesta. Datos usa la misma caché
     y la misma encuesta elegida (RES.sel), así ambas secciones van a la par. */
  leerRespuestas: async function (id, forzar) {
    if (RES.cache[id] && !forzar) return RES.cache[id];
    RES.cache[id] = (await ENC.leerRespuestasDe(id))
      .sort(function (a, b) { return RES.ms(b.enviado) - RES.ms(a.enviado); });
    ENC.conteos[id] = RES.cache[id].length;
    return RES.cache[id];
  },

  ms: function (t) {
    if (!t) return 0;
    if (typeof t.toMillis === 'function') return t.toMillis();
    if (t.seconds != null) return t.seconds * 1000;
    var d = new Date(t); return isNaN(d.getTime()) ? 0 : d.getTime();
  },

  diaClave: function (ms) {
    var d = new Date(ms);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  fmtDia: function (ms, conAnio) {
    var o = { day: 'numeric', month: 'short' };
    if (conAnio) o.year = 'numeric';
    return new Date(ms).toLocaleDateString('es-EC', o);
  },

  vacio: function (v) {
    return v == null || v === '' || (Array.isArray(v) && !v.length) ||
      (typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length);
  },

  pct: function (n, base) { return base ? Math.round(n / base * 100) : 0; },

  /* Resumen por pregunta (lo usan el dashboard y las imágenes) */
  resumir: function (enc, resps) {
    var ps = ENC.soloPreguntas(enc.preguntas);
    return ps.map(function (q, i) {
      var vals = resps.map(function (r) { return (r.respuestas || {})[q.id]; })
        .filter(function (v) { return !RES.vacio(v); });
      var s = { q: q, n: i + 1, respondieron: vals.length, filas: null, promedio: null, textos: null };

      if (q.tipo === 'corto' || q.tipo === 'largo') {
        s.textos = resps.filter(function (r) { return !RES.vacio((r.respuestas || {})[q.id]); })
          .map(function (r) { return { v: String(r.respuestas[q.id]), ms: RES.ms(r.enviado) }; });
        return s;
      }

      /* Número: promedio, mínimo, máximo y mediana */
      if (q.tipo === 'numero') {
        var nums = vals.map(Number).filter(isFinite).sort(function (a, b) { return a - b; });
        var fmt = function (x) {
          return (Math.round(x * 100) / 100).toLocaleString('es-EC', { maximumFractionDigits: 2 });
        };
        if (nums.length) {
          var m = nums.length >> 1;
          s.numeros = {
            promedio: fmt(nums.reduce(function (a, b) { return a + b; }, 0) / nums.length),
            min: fmt(nums[0]), max: fmt(nums[nums.length - 1]),
            mediana: fmt(nums.length % 2 ? nums[m] : (nums[m - 1] + nums[m]) / 2)
          };
        }
        s.respondieron = nums.length;
        return s;
      }

      /* Cuadrícula: por cada fila, cuántos eligieron cada columna */
      if (q.tipo === 'cuadricula') {
        var cols = (q.columnas || []).slice();
        var resGrid = vals.filter(function (v) { return v && typeof v === 'object' && !Array.isArray(v); });
        resGrid.forEach(function (v) {   // columnas que ya no existen (encuesta editada)
          Object.keys(v).forEach(function (k) { if (cols.indexOf(String(v[k])) < 0) cols.push(String(v[k])); });
        });
        s.grid = {
          cols: cols,
          filas: (q.filas || []).map(function (f) {
            var cuenta = cols.map(function () { return 0; }), tot = 0;
            resGrid.forEach(function (v) {
              var k = cols.indexOf(String(v[f.id]));
              if (v[f.id] != null && k >= 0) { cuenta[k]++; tot++; }
            });
            return { label: f.t, n: tot, segs: cuenta.map(function (c) { return { n: c, pct: RES.pct(c, tot) }; }) };
          })
        };
        s.respondieron = resGrid.length;
        return s;
      }

      /* Subir imagen: galería de fotos */
      if (q.tipo === 'imagen') {
        s.fotos = resps.filter(function (r) { return ENC.esImagen((r.respuestas || {})[q.id]); })
          .map(function (r) { return { v: r.respuestas[q.id], ms: RES.ms(r.enviado), rid: r._docId }; });
        s.respondieron = s.fotos.length;
        return s;
      }

      /* Conteo por opción; se suman también valores que ya no existen como
         opción (si la encuesta se editó después de recibir respuestas). */
      var orden = ENC.valoresDe(q), cuenta = {};
      orden.forEach(function (o) { cuenta[o] = 0; });
      vals.forEach(function (v) {
        (Array.isArray(v) ? v : [v]).forEach(function (x) {
          var k = String(x);
          if (!(k in cuenta)) { cuenta[k] = 0; orden.push(k); }
          cuenta[k]++;
        });
      });
      s.filas = orden.map(function (o) {
        return { label: o, n: cuenta[o], pct: RES.pct(cuenta[o], vals.length) };
      });

      if (q.tipo === 'escala') {
        var suma = 0, cnt = 0;
        vals.forEach(function (v) { var x = Number(v); if (isFinite(x)) { suma += x; cnt++; } });
        s.promedio = cnt ? (suma / cnt).toFixed(1).replace('.', ',') : null;
      }
      return s;
    });
  },

  /* Respuestas por día, desde la primera hasta la última (máx. 30 días) */
  porDia: function (resps) {
    var mss = resps.map(function (r) { return RES.ms(r.enviado); }).filter(Boolean);
    if (!mss.length) return { dias: [], recortado: false };
    var cuenta = {};
    mss.forEach(function (m) { var k = RES.diaClave(m); cuenta[k] = (cuenta[k] || 0) + 1; });
    var fin = new Date(Math.max.apply(null, mss)); fin.setHours(12, 0, 0, 0);
    var ini = new Date(Math.min.apply(null, mss)); ini.setHours(12, 0, 0, 0);
    var DIA = 86400000, total = Math.round((fin - ini) / DIA) + 1, recortado = total > 30;
    if (recortado) ini = new Date(fin.getTime() - 29 * DIA);
    var dias = [];
    for (var t = ini.getTime(); t <= fin.getTime() + 1000; t += DIA) {
      dias.push({ ms: t, n: cuenta[RES.diaClave(t)] || 0 });
    }
    return { dias: dias, recortado: recortado };
  },

  /* ── Dashboard ─────────────────────────────────────────────────────────── */
  pintar: function (html) {
    var body = document.getElementById('res-body');
    if (body) body.innerHTML = html;
  },

  render: function () {
    var enc = RES.encuesta();
    var resps = RES.cache[RES.sel];
    if (!enc || !resps) return;
    RES.graficos = {};

    var total = resps.length;
    var ultima = total ? RES.ms(resps[0].enviado) : 0;
    var html =
      '<div class="res-resumen">' +
        RES.stat(total, total === 1 ? 'respuesta' : 'respuestas') +
        RES.stat(ENC.soloPreguntas(enc.preguntas).length, 'preguntas') +
        RES.stat(ultima ? RES.fmtDia(ultima) : '—', 'última respuesta') +
      '</div>';

    if (!total) {
      html +=
        '<div class="card res-card">' +
          RCR.vacio('inbox', 'Todavía no hay respuestas',
            enc.estado === 'cerrada' ? 'La encuesta está cerrada.' : 'Comparte el enlace para empezar a recibirlas.') +
          (enc.estado !== 'cerrada'
            ? '<div class="res-centro"><button class="btn btn-primary" onclick="ENC.compartir(\'' + enc._docId + '\')">' + ico('link', 15) + 'Compartir enlace</button></div>'
            : '') +
        '</div>';
      RES.pintar(html);
      return;
    }

    html += RES.tarjetaDias(enc, resps);
    RES.resumir(enc, resps).forEach(function (s) { html += RES.tarjetaPregunta(enc, s); });
    RES.pintar(html);
    RES.dibujarSvgs();
  },

  stat: function (valor, label) {
    return '<div class="res-stat"><span>' + RCR.esc(label) + '</span><strong>' + RCR.esc(valor) + '</strong></div>';
  },

  /* Se mantiene para las cifras de las preguntas de número */
  kpi: function (valor, label) { return RES.stat(valor, label); },

  botonImagen: function (clave) {
    return '<button class="res-dl" type="button" title="Descargar imagen" aria-label="Descargar gráfico como imagen" ' +
      'onclick="RES.png(\'' + clave + '\')">' + ico('download', 15, 2.2) + '</button>';
  },

  cabeza: function (n, titulo, nota, clave) {
    return '<div class="res-card-head">' +
      '<div class="res-card-tit">' +
        (n ? '<span class="res-q-n">P' + n + '</span>' : '') +
        '<h3>' + RCR.esc(titulo) + '</h3>' +
        (nota ? '<small>' + RCR.esc(nota) + '</small>' : '') +
      '</div>' +
      (clave ? RES.botonImagen(clave) : '') +
    '</div>';
  },

  /* Respuestas por día: línea (tendencia en el tiempo); con 1–2 días, columnas */
  tarjetaDias: function (enc, resps) {
    var pd = RES.porDia(resps);
    if (!pd.dias.length) return '';
    var max = Math.max.apply(null, pd.dias.map(function (d) { return d.n; })) || 1;
    var titulo = 'Respuestas por día';
    var sub = (pd.recortado ? 'Últimos 30 días con actividad' : (pd.dias.length === 1 ? RES.fmtDia(pd.dias[0].ms, true) : 'Desde la primera respuesta')) +
      ' · máximo ' + max + ' en un día';
    var linea = pd.dias.length >= 3;
    RES.graficos.dias = { tipo: linea ? 'linea' : 'columnas', titulo: titulo, sub: sub, dias: pd.dias, encuesta: enc.titulo };
    var primero = pd.dias[0], ultimo = pd.dias[pd.dias.length - 1];
    var eje = '<div class="res-cols-eje"><span>' + RES.fmtDia(primero.ms) + '</span>' +
      (pd.dias.length > 1 ? '<span>' + RES.fmtDia(ultimo.ms) + '</span>' : '') + '</div>';

    var cuerpo;
    if (linea) {
      cuerpo = '<div class="res-linea" data-svg="dias" role="img" aria-label="' + ENC.attr(titulo + ': ' + sub) + '"></div>';
    } else {
      cuerpo = '<div class="res-cols" role="img" aria-label="' + ENC.attr(titulo) + '">' + pd.dias.map(function (d) {
        var h = d.n ? Math.max(4, Math.round(d.n / max * 100)) : 0;
        var tip = RES.fmtDia(d.ms) + ': ' + d.n + (d.n === 1 ? ' respuesta' : ' respuestas');
        return '<div class="res-col" data-tip="' + ENC.attr(tip) + '"><div class="res-col-fill" style="height:' + h + '%"></div></div>';
      }).join('') + '</div>';
    }
    return '<div class="card res-card">' + RES.cabeza(0, titulo, sub, 'dias') + cuerpo + eje + '</div>';
  },

  /* Línea con área suave; cada día tiene una zona para el cursor que muestra
     una guía vertical, el punto y el valor (tooltip). Se dibuja al ancho real. */
  svgLinea: function (g, W) {
    var H = 150, pl = 6, pr = 6, pt = 14, pb = 4;
    var d = g.dias, n = d.length;
    var max = Math.max.apply(null, d.map(function (x) { return x.n; })) || 1;
    var paso = (W - pl - pr) / Math.max(1, n - 1);
    var X = function (i) { return pl + i * paso; };
    var Y = function (v) { return pt + (1 - v / max) * (H - pt - pb); };
    var pts = d.map(function (x, i) { return X(i).toFixed(1) + ',' + Y(x.n).toFixed(1); });
    var area = 'M' + X(0).toFixed(1) + ',' + (H - pb) + ' L' + pts.join(' L') + ' L' + X(n - 1).toFixed(1) + ',' + (H - pb) + ' Z';
    var yMax = Y(max).toFixed(1);
    return '<svg width="' + W + '" height="' + H + '" viewBox="0 0 ' + W + ' ' + H + '" aria-hidden="true">' +
      '<line class="res-guia-max" x1="0" x2="' + W + '" y1="' + yMax + '" y2="' + yMax + '"/>' +
      '<line class="res-base" x1="0" x2="' + W + '" y1="' + (H - pb + .5) + '" y2="' + (H - pb + .5) + '"/>' +
      '<path class="res-area" d="' + area + '"/>' +
      '<polyline class="res-trazo" points="' + pts.join(' ') + '"/>' +
      d.map(function (x, i) {
        var tip = RES.fmtDia(x.ms) + ': ' + x.n + (x.n === 1 ? ' respuesta' : ' respuestas');
        var x0 = Math.max(0, X(i) - paso / 2), w = Math.min(W, X(i) + paso / 2) - x0;
        return '<g class="res-pt" data-tip="' + ENC.attr(tip) + '">' +
          '<rect x="' + x0.toFixed(1) + '" y="0" width="' + Math.max(8, w).toFixed(1) + '" height="' + H + '" fill="transparent"/>' +
          '<line class="res-guia" x1="' + X(i).toFixed(1) + '" x2="' + X(i).toFixed(1) + '" y1="' + pt + '" y2="' + (H - pb) + '"/>' +
          '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(x.n).toFixed(1) + '" r="4"/>' +
        '</g>';
      }).join('') +
    '</svg>';
  },

  dibujarSvgs: function () {
    document.querySelectorAll('#res-body [data-svg]').forEach(function (el) {
      var g = RES.graficos[el.getAttribute('data-svg')];
      var W = el.clientWidth;
      if (!g || !W) return;
      if (g.tipo === 'linea') el.innerHTML = RES.svgLinea(g, W);
    });
  },

  /* Dona: anillo con un hueco de 2 px entre partes; el % de la parte principal
     al centro y una leyenda con nombre, % y cantidad (los colores claros
     nunca van sin su número al lado). */
  donaHtml: function (filas, centro) {
    var tot = filas.reduce(function (a, f) { return a + f.n; }, 0) || 1;
    var R = 56, C = 2 * Math.PI * R, acum = 0, conPartes = filas.filter(function (f) { return f.n; }).length;
    var arcos = filas.map(function (f, k) {
      if (!f.n) return '';
      var largo = f.n / tot * C, hueco = conPartes > 1 ? Math.min(2, largo / 2) : 0;
      var tip = f.label + ': ' + f.n + (f.n === 1 ? ' respuesta' : ' respuestas') + ' (' + f.pct + '%)';
      var s = '<circle class="res-arco" r="' + R + '" cx="70" cy="70" stroke="' + RES.CAT[k % RES.CAT.length] + '" ' +
        'stroke-dasharray="' + (largo - hueco).toFixed(2) + ' ' + C.toFixed(2) + '" stroke-dashoffset="' + (-acum).toFixed(2) + '" ' +
        'data-tip="' + ENC.attr(tip) + '"/>';
      acum += largo;
      return s;
    }).join('');
    var leyenda = filas.map(function (f, k) {
      return '<li data-tip="' + ENC.attr(f.label + ': ' + f.n + (f.n === 1 ? ' respuesta' : ' respuestas')) + '">' +
        '<i style="background:' + RES.CAT[k % RES.CAT.length] + '"></i>' +
        '<span class="res-ley-lbl">' + RCR.esc(f.label) + '</span>' +
        '<span class="res-num-pct">' + f.pct + '%</span><span class="res-num-n">' + f.n + '</span></li>';
    }).join('');
    return '<div class="res-dona">' +
      '<div class="res-dona-graf">' +
        '<svg viewBox="0 0 140 140" width="140" height="140" aria-hidden="true">' +
          '<circle class="res-dona-pista" r="' + R + '" cx="70" cy="70"/>' + arcos +
        '</svg>' +
        '<div class="res-dona-c"><strong>' + centro.pct + '%</strong><span>' + RCR.esc(centro.label) + '</span></div>' +
      '</div>' +
      '<ul class="res-ley">' + leyenda + '</ul>' +
    '</div>';
  },

  notaPregunta: function (enc, s) {
    var partes = [s.respondieron + (s.respondieron === 1 ? ' respondió' : ' respondieron')];
    var c = s.q.condicion;
    if (c) {
      var ps = ENC.soloPreguntas(enc.preguntas);
      var k = ps.findIndex(function (p) { return p.id === c.pregunta; });
      if (k >= 0) partes.push('solo si P' + (k + 1) + (ps[k].tipo === 'multiple' ? ' incluye ' : ' = ') + '«' + c.valor + '»');
    }
    if (s.q.tipo === 'multiple') {
      var max = ENC.maxValido(s.q);
      partes.push(max ? 'podían elegir hasta ' + max : 'podían elegir varias');
    }
    return partes.join(' · ');
  },

  /* Porcentajes enteros que suman exactamente 100 (método del mayor resto),
     para las partes de un todo (dona) */
  cien: function (filas) {
    var tot = filas.reduce(function (a, f) { return a + f.n; }, 0);
    if (!tot) return filas.map(function (f) { return Object.assign({}, f, { pct: 0 }); });
    var base = filas.map(function (f, i) {
      var exacto = f.n / tot * 100;
      return { i: i, piso: Math.floor(exacto), resto: exacto - Math.floor(exacto) };
    });
    var falta = 100 - base.reduce(function (a, b) { return a + b.piso; }, 0);
    base.slice().sort(function (a, b) { return b.resto - a.resto; }).slice(0, falta)
      .forEach(function (b) { b.piso++; });
    return filas.map(function (f, i) { return Object.assign({}, f, { pct: base[i].piso }); });
  },

  /* Qué forma lleva cada pregunta cerrada */
  formaDe: function (s) {
    if (s.q.tipo === 'escala') return 'escala';
    if (s.q.tipo === 'sino') return 'dona';
    if (s.q.tipo === 'unica' && s.filas.length <= RES.MAX_DONA) return 'dona';
    return 'barras';
  },

  tarjetaPregunta: function (enc, s) {
    var q = s.q, clave = 'q_' + q.id;
    var nota = RES.notaPregunta(enc, s);
    var card = function (conImagen, cuerpo) {
      return '<div class="card res-card">' + RES.cabeza(s.n, q.texto, nota, conImagen ? clave : '') + cuerpo + '</div>';
    };

    if (!s.respondieron) return card(false, '<div class="res-sin">Nadie respondió esta pregunta todavía.</div>');

    /* Número: el promedio destacado; mínimo, mediana y máximo en una línea */
    if (s.numeros) {
      return card(false,
        '<div class="res-hero"><strong>' + RCR.esc(s.numeros.promedio) + '</strong><span>promedio</span></div>' +
        '<div class="res-num-linea">' +
          '<span>Mínimo <b>' + RCR.esc(s.numeros.min) + '</b></span>' +
          '<span>Mediana <b>' + RCR.esc(s.numeros.mediana) + '</b></span>' +
          '<span>Máximo <b>' + RCR.esc(s.numeros.max) + '</b></span>' +
        '</div>');
    }

    /* Cuadrícula: una barra 100% apilada por fila, con leyenda arriba */
    if (s.grid) {
      var g = s.grid, nc = g.cols.length;
      RES.graficos[clave] = { tipo: 'apiladas', titulo: 'P' + s.n + '. ' + q.texto, sub: nota, grid: g, encuesta: enc.titulo };
      var leyenda = '<div class="res-leyenda">' + g.cols.map(function (c, k) {
        return '<span><i style="background:' + ENC.colorColumna(k, nc).fondo + '"></i>' + RCR.esc(c) + '</span>';
      }).join('') + '</div>';
      var filas = g.filas.map(function (f) {
        var segs = f.segs.map(function (sg, k) {
          if (!sg.n) return '';
          var col = ENC.colorColumna(k, nc);
          var tip = f.label + ' · ' + g.cols[k] + ': ' + sg.n + (sg.n === 1 ? ' respuesta' : ' respuestas') + ' (' + sg.pct + '%)';
          return '<div class="res-seg" style="flex:' + sg.n + ' 1 0;background:' + col.fondo + ';color:' + col.texto + '" ' +
            'data-tip="' + ENC.attr(tip) + '">' + (sg.pct >= 12 ? '<span>' + sg.pct + '%</span>' : '') + '</div>';
        }).join('');
        return '<div class="res-apil-fila">' +
          '<div class="res-apil-lbl">' + RCR.esc(f.label) + '</div>' +
          '<div class="res-apil-barra">' + (f.n ? segs : '<div class="res-apil-vacia">Sin respuestas</div>') + '</div>' +
          '<div class="res-num-n">' + f.n + '</div>' +
        '</div>';
      }).join('');
      return card(true, leyenda + '<div class="res-apil">' + filas + '</div>');
    }

    /* Fotos: galería; al tocar una se ve en grande */
    if (s.fotos) {
      var todasF = !!RES.expandir[q.id], LIM = 12;
      var visF = todasF ? s.fotos : s.fotos.slice(0, LIM);
      RES.fotos[q.id] = s.fotos;
      return card(false,
        '<div class="res-galeria">' + visF.map(function (f, k) {
          return '<button type="button" class="res-foto" onclick="RES.verFoto(\'' + q.id + '\',' + k + ')" ' +
            'aria-label="Ver foto ' + (k + 1) + '"><img src="' + f.v + '" alt="" loading="lazy"></button>';
        }).join('') + '</div>' +
        (s.fotos.length > LIM
          ? '<button class="res-mas" onclick="RES.verTodas(\'' + q.id + '\')">' +
              (todasF ? 'Ver menos' : 'Ver todas (' + s.fotos.length + ')') + '</button>'
          : ''));
    }

    /* Preguntas abiertas: lista de respuestas (no es un gráfico) */
    if (s.textos) {
      var todas = !!RES.expandir[q.id];
      var vis = todas ? s.textos : s.textos.slice(0, RES.TEXTOS_VISIBLES);
      return card(false,
        '<ul class="res-textos">' + vis.map(function (t) {
          return '<li><p>' + RCR.esc(t.v) + '</p>' + (t.ms ? '<small>' + RES.fmtDia(t.ms, true) + '</small>' : '') + '</li>';
        }).join('') + '</ul>' +
        (s.textos.length > RES.TEXTOS_VISIBLES
          ? '<button class="res-mas" onclick="RES.verTodas(\'' + q.id + '\')">' +
              (todas ? 'Ver menos' : 'Ver todas (' + s.textos.length + ')') + '</button>'
          : ''));
    }

    var forma = RES.formaDe(s);
    var base = { titulo: 'P' + s.n + '. ' + q.texto, sub: nota, filas: s.filas, promedio: s.promedio, encuesta: enc.titulo };

    /* Sí / No y opción única de pocas opciones: dona (los % suman 100) */
    if (forma === 'dona') {
      var partes = RES.cien(s.filas);
      var principal = q.tipo === 'sino'
        ? (partes.find(function (f) { return f.label === 'Sí'; }) || partes[0])
        : partes.reduce(function (a, f) { return f.n > a.n ? f : a; }, partes[0]);
      RES.graficos[clave] = Object.assign({ tipo: 'dona', centro: principal }, base, { filas: partes });
      return card(true, RES.donaHtml(partes, principal));
    }

    /* Escala 1–5: promedio y una columna por valor (orden natural) */
    if (forma === 'escala') {
      RES.graficos[clave] = Object.assign({ tipo: 'escala' }, base);
      var maxE = Math.max.apply(null, s.filas.map(function (f) { return f.n; })) || 1;
      return card(true,
        (s.promedio != null ? '<div class="res-hero"><strong>' + s.promedio + '</strong><span>promedio de 5</span></div>' : '') +
        '<div class="res-escala">' + s.filas.map(function (f) {
          var tip = f.label + ': ' + f.n + (f.n === 1 ? ' respuesta' : ' respuestas') + ' (' + f.pct + '%)';
          return '<div class="res-esc-col" data-tip="' + ENC.attr(tip) + '">' +
            '<span class="res-esc-pct">' + (f.n ? f.pct + '%' : '') + '</span>' +
            '<div class="res-esc-pista"><div class="res-esc-fill" style="height:' + (f.n ? Math.max(3, f.n / maxE * 100) : 0) + '%"></div></div>' +
            '<span class="res-esc-lbl">' + RCR.esc(f.label) + '</span>' +
          '</div>';
        }).join('') + '</div>' +
        '<div class="res-escala-ext"><span>Bajo</span><span>Alto</span></div>');
    }

    /* Opción múltiple o muchas opciones: barras horizontales */
    RES.graficos[clave] = Object.assign({ tipo: 'barras' }, base);
    var max = Math.max.apply(null, s.filas.map(function (f) { return f.n; })) || 1;
    return card(true, '<div class="res-barras">' + s.filas.map(function (f) {
      var tip = f.label + ': ' + f.n + (f.n === 1 ? ' respuesta' : ' respuestas') + ' (' + f.pct + '%)';
      return '<div class="res-barra" data-tip="' + ENC.attr(tip) + '">' +
          '<div class="res-barra-lbl">' + RCR.esc(f.label) + '</div>' +
          '<div class="res-barra-pista"><div class="res-barra-fill" style="width:' + (f.n ? Math.max(1.5, f.n / max * 100) : 0) + '%"></div></div>' +
          '<div class="res-num-pct">' + f.pct + '%</div><div class="res-num-n">' + f.n + '</div>' +
        '</div>';
    }).join('') + '</div>');
  },

  fotos: {},

  /* Foto en grande, con botón para descargarla */
  verFoto: function (qid, k) {
    var f = (RES.fotos[qid] || [])[k];
    if (!f || !ENC.esImagen(f.v)) return;
    RES.mostrarFoto(f.v, 'Foto ' + (k + 1) + ' de ' + RES.fotos[qid].length, f.ms ? RES.fmtDia(f.ms, true) : '',
      RES.nombreArchivo((RES.encuesta() || {}).titulo, 'foto ' + (k + 1)));
  },

  mostrarFoto: function (url, titulo, sub, archivo) {
    if (!ENC.esImagen(url)) return;
    RCR.modal({
      id: 'm-res-foto',
      titulo: titulo,
      sub: RCR.esc(sub || ''),
      cuerpo: '<img class="res-foto-grande" src="' + url + '" alt="' + ENC.attr(titulo) + '">',
      acciones:
        '<a class="btn btn-glass" href="' + url + '" download="' + ENC.attr(archivo || 'foto') + '.jpg">' + ico('download', 15) + 'Descargar</a>' +
        '<button class="btn btn-primary" onclick="RCR.cerrarModal(\'m-res-foto\')">Cerrar</button>'
    });
  },

  verTodas: function (qid) {
    RES.expandir[qid] = !RES.expandir[qid];
    RES.render();
  },

  /* ── Tooltip al pasar el cursor por barras y columnas ─────────────────── */
  iniciarTooltip: function (root) {
    var tip = document.getElementById('res-tip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'res-tip';
      tip.className = 'res-tip';
      tip.setAttribute('role', 'tooltip');
      document.body.appendChild(tip);
    }
    root.addEventListener('mousemove', function (e) {
      var t = e.target.closest('[data-tip]');
      if (!t) { tip.classList.remove('show'); return; }
      tip.textContent = t.getAttribute('data-tip');
      tip.classList.add('show');
      var x = e.clientX + 14, y = e.clientY - 12 - tip.offsetHeight;
      if (x + tip.offsetWidth > window.innerWidth - 8) x = e.clientX - 14 - tip.offsetWidth;
      if (y < 8) y = e.clientY + 18;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    });
    root.addEventListener('mouseleave', function () { tip.classList.remove('show'); });
  },

  /* ==========================================================================
     IMAGEN PNG DE UN GRÁFICO
     ========================================================================== */
  png: async function (clave) {
    var g = RES.graficos[clave];
    if (!g) return;
    try {
      if (document.fonts && document.fonts.load) {
        await Promise.all([document.fonts.load('700 26px Outfit'), document.fonts.load('500 16px Outfit')]);
      }
    } catch (e) { /* sin la fuente se usa la del sistema */ }

    var dibujar = {
      columnas: RES.dibujarColumnas, apiladas: RES.dibujarApiladas, dona: RES.dibujarDona,
      escala: RES.dibujarEscala, linea: RES.dibujarLinea
    }[g.tipo] || RES.dibujarBarras;
    var canvas = dibujar(g);
    canvas.toBlob(function (blob) {
      if (!blob) { RCR.toast('No se pudo crear la imagen'); return; }
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = RES.nombreArchivo(g.encuesta, g.titulo) + '.png';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 4000);
      RCR.toast('Imagen descargada');
    }, 'image/png');
  },

  nombreArchivo: function (enc, tit) {
    var s = (enc ? enc + ' - ' : '') + (tit || 'grafico');
    return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w\s.-]+/g, '')
      .trim().replace(/\s+/g, ' ').slice(0, 90) || 'grafico';
  },

  F: function (peso, px) { return peso + ' ' + px + 'px Outfit, "Segoe UI", Arial, sans-serif'; },

  /* Parte un texto en líneas que quepan en "ancho" (máx. "maxLineas") */
  lineas: function (ctx, texto, ancho, maxLineas) {
    var pal = String(texto || '').split(/\s+/), out = [], act = '';
    pal.forEach(function (p) {
      var prueba = act ? act + ' ' + p : p;
      if (ctx.measureText(prueba).width > ancho && act) { out.push(act); act = p; }
      else act = prueba;
    });
    if (act) out.push(act);
    if (out.length > maxLineas) {
      out = out.slice(0, maxLineas);
      var u = out[maxLineas - 1];
      while (u.length && ctx.measureText(u + '…').width > ancho) u = u.slice(0, -1);
      out[maxLineas - 1] = u + '…';
    }
    return out;
  },

  /* Lienzo con encabezado común; devuelve { ctx, y, W, M } */
  lienzo: function (g, altoGrafico, medirExtra) {
    var W = 1000, M = 48, S = 2;
    var tmp = document.createElement('canvas').getContext('2d');
    tmp.font = RES.F(700, 26);
    var lt = RES.lineas(tmp, g.titulo, W - M * 2, 3);
    tmp.font = RES.F(500, 16);
    var ls = g.sub ? RES.lineas(tmp, g.sub, W - M * 2, 2) : [];
    var cabeza = M + lt.length * 34 + (ls.length ? 8 + ls.length * 22 : 0) + 28 + (medirExtra || 0);
    var H = cabeza + altoGrafico + 70;

    var c = document.createElement('canvas');
    c.width = W * S; c.height = H * S;
    var ctx = c.getContext('2d');
    ctx.scale(S, S);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = RES.COLOR; ctx.fillRect(0, 0, W, 6);

    var y = M;
    ctx.textBaseline = 'top';
    ctx.fillStyle = '#002343'; ctx.font = RES.F(700, 26);
    lt.forEach(function (l) { ctx.fillText(l, M, y); y += 34; });
    if (ls.length) {
      y += 8;
      ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 16);
      ls.forEach(function (l) { ctx.fillText(l, M, y); y += 22; });
    }
    y += 28;

    /* Pie */
    ctx.fillStyle = '#9aa3b2'; ctx.font = RES.F(500, 13);
    ctx.textBaseline = 'alphabetic';
    var pie = 'Redes Con Rostro' + (g.encuesta ? ' · ' + g.encuesta : '');
    ctx.fillText(RES.lineas(ctx, pie, W - M * 2, 1)[0], M, H - 28);
    ctx.textBaseline = 'top';

    return { c: c, ctx: ctx, y: y, W: W, M: M };
  },

  /* Barra con el extremo de datos redondeado (4px) y anclada al inicio */
  barra: function (ctx, x, y, w, h, color) {
    if (w <= 0) return;
    var r = Math.min(4, w / 2, h / 2);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w - r, y);
    ctx.arcTo(x + w, y, x + w, y + r, r);
    ctx.lineTo(x + w, y + h - r);
    ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();
  },

  dibujarBarras: function (g) {
    var FILA = 46, conHero = g.promedio != null;
    var L = RES.lienzo(g, g.filas.length * FILA, conHero ? 70 : 0);
    var ctx = L.ctx, y = L.y, M = L.M, W = L.W;

    if (conHero) {
      ctx.fillStyle = '#002343'; ctx.font = RES.F(700, 44);
      var txt = g.promedio;
      ctx.fillText(txt, M, y - 4);
      var w = ctx.measureText(txt).width;
      ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 16);
      ctx.fillText('promedio de 5', M + w + 12, y + 22);
      y += 70;
    }

    ctx.font = RES.F(500, 16);
    var LBL = Math.min(300, Math.max(40, Math.max.apply(null, g.filas.map(function (f) { return ctx.measureText(f.label).width; }))));
    var VAL = 110, x0 = M + LBL + 20, ancho = W - M - VAL - x0;
    var max = Math.max.apply(null, g.filas.map(function (f) { return f.n; })) || 1;
    g.filas.forEach(function (f) {
      var cy = y + FILA / 2;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#333333'; ctx.font = RES.F(500, 16);
      ctx.fillText(RES.lineas(ctx, f.label, LBL, 1)[0], M, cy);
      ctx.fillStyle = '#eef1f6';
      ctx.fillRect(x0, cy - 7, ancho, 14);
      RES.barra(ctx, x0, cy - 7, f.n ? Math.max(3, f.n / max * ancho) : 0, 14, RES.COLOR);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#333333'; ctx.font = RES.F(700, 16);
      ctx.fillText(f.pct + '%', W - M - 44, cy);
      ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 15);
      ctx.fillText(String(f.n), W - M, cy);
      ctx.textAlign = 'left';
      y += FILA;
    });
    return L.c;
  },

  /* Cuadrícula: leyenda arriba y una barra 100% apilada por fila.
     Segmentos separados por 2px del color del fondo; % dentro si cabe. */
  dibujarApiladas: function (g) {
    var FILA = 50, G = g.grid, nc = G.cols.length;
    var tmp = document.createElement('canvas').getContext('2d');
    tmp.font = RES.F(500, 15);
    /* Leyenda en líneas que caben en el ancho */
    var W = 1000, M = 48, lineasLey = [[]], anchoAct = 0;
    G.cols.forEach(function (c, k) {
      var w = 16 + 8 + tmp.measureText(c).width + 24;
      if (anchoAct + w > W - M * 2 && lineasLey[lineasLey.length - 1].length) { lineasLey.push([]); anchoAct = 0; }
      lineasLey[lineasLey.length - 1].push({ c: c, k: k, w: w });
      anchoAct += w;
    });
    var altoLey = lineasLey.length * 28 + 12;
    var L = RES.lienzo(g, altoLey + G.filas.length * FILA, 0);
    var ctx = L.ctx, y = L.y;

    ctx.textBaseline = 'middle';
    lineasLey.forEach(function (ln) {
      var x = M;
      ln.forEach(function (it) {
        ctx.fillStyle = ENC.colorColumna(it.k, nc).fondo;
        RES.redondo(ctx, x, y + 6, 16, 16, 4);
        ctx.fillStyle = '#333333'; ctx.font = RES.F(500, 15);
        ctx.fillText(it.c, x + 24, y + 14);
        x += it.w;
      });
      y += 28;
    });
    y += 12;

    ctx.font = RES.F(500, 16);
    var LBL = Math.min(300, Math.max(60, Math.max.apply(null, G.filas.map(function (f) { return ctx.measureText(f.label).width; }))));
    var NW = 50, x0 = M + LBL + 20, ancho = W - M - NW - x0, H = 22;
    G.filas.forEach(function (f) {
      var cy = y + FILA / 2;
      ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
      ctx.fillStyle = '#333333'; ctx.font = RES.F(500, 16);
      var ll = RES.lineas(ctx, f.label, LBL, 2);
      ll.forEach(function (l, k) { ctx.fillText(l, M, cy + (k - (ll.length - 1) / 2) * 20); });
      if (!f.n) {
        ctx.fillStyle = '#eef1f6'; RES.redondo(ctx, x0, cy - H / 2, ancho, H, 4);
      } else {
        var con = f.segs.filter(function (sg) { return sg.n; }).length;
        var util = ancho - (con - 1) * 2, x = x0, hechos = 0;
        f.segs.forEach(function (sg, k) {
          if (!sg.n) return;
          hechos++;
          var w = sg.n / f.n * util;
          var col = ENC.colorColumna(k, nc);
          ctx.fillStyle = col.fondo;
          /* Extremos redondeados solo en los bordes de la barra */
          RES.redondo(ctx, x, cy - H / 2, w, H, 4, hechos === 1, hechos === con);
          var txt = sg.pct + '%';
          ctx.font = RES.F(700, 13);
          if (ctx.measureText(txt).width + 12 <= w) {
            ctx.fillStyle = col.texto; ctx.textAlign = 'center';
            ctx.fillText(txt, x + w / 2, cy + 1);
            ctx.textAlign = 'left';
          }
          x += w + 2;
        });
      }
      ctx.textAlign = 'right'; ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 15);
      ctx.fillText(String(f.n), W - M, cy);
      ctx.textAlign = 'left';
      y += FILA;
    });
    return L.c;
  },

  /* Rectángulo con esquinas redondeadas (izquierda y/o derecha) */
  redondo: function (ctx, x, y, w, h, r, izq, der) {
    if (w <= 0) return;
    if (izq === undefined) { izq = true; der = true; }
    var ri = izq ? Math.min(r, w / 2, h / 2) : 0, rd = der ? Math.min(r, w / 2, h / 2) : 0;
    ctx.beginPath();
    ctx.moveTo(x + ri, y);
    ctx.lineTo(x + w - rd, y);
    if (rd) ctx.arcTo(x + w, y, x + w, y + rd, rd); else ctx.lineTo(x + w, y);
    ctx.lineTo(x + w, y + h - rd);
    if (rd) ctx.arcTo(x + w, y + h, x + w - rd, y + h, rd); else ctx.lineTo(x + w, y + h);
    ctx.lineTo(x + ri, y + h);
    if (ri) ctx.arcTo(x, y + h, x, y + h - ri, ri); else ctx.lineTo(x, y + h);
    ctx.lineTo(x, y + ri);
    if (ri) ctx.arcTo(x, y, x + ri, y, ri); else ctx.lineTo(x, y);
    ctx.closePath();
    ctx.fill();
  },

  /* Dona con leyenda a la derecha (nombre, % y cantidad) */
  dibujarDona: function (g) {
    var F = g.filas, n = F.length, FILA = 40;
    var alto = Math.max(260, n * FILA + 20);
    var L = RES.lienzo(g, alto, 0);
    var ctx = L.ctx, y = L.y, M = L.M, W = L.W;
    var cx = M + 125, cy = y + alto / 2, R = 115, ancho = 42;
    var tot = F.reduce(function (a, f) { return a + f.n; }, 0) || 1;
    var con = F.filter(function (f) { return f.n; }).length;
    var ang = -Math.PI / 2, HUECO = con > 1 ? 0.03 : 0;
    ctx.lineWidth = ancho;
    ctx.strokeStyle = '#eef1f6';
    ctx.beginPath(); ctx.arc(cx, cy, R - ancho / 2, 0, Math.PI * 2); ctx.stroke();
    F.forEach(function (f, k) {
      if (!f.n) return;
      var barrido = f.n / tot * Math.PI * 2;
      ctx.strokeStyle = RES.CAT[k % RES.CAT.length];
      ctx.beginPath();
      ctx.arc(cx, cy, R - ancho / 2, ang + HUECO / 2, ang + barrido - HUECO / 2);
      ctx.stroke();
      ang += barrido;
    });
    /* Centro: % de la parte principal */
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#002343'; ctx.font = RES.F(700, 40);
    ctx.fillText(g.centro.pct + '%', cx, cy - 8);
    ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 15);
    ctx.fillText(RES.lineas(ctx, g.centro.label, 130, 1)[0], cx, cy + 24);
    /* Leyenda */
    var lx = M + 290, ly = cy - (n * FILA) / 2;
    ctx.textAlign = 'left';
    F.forEach(function (f, k) {
      var yy = ly + k * FILA + FILA / 2;
      ctx.fillStyle = RES.CAT[k % RES.CAT.length];
      RES.redondo(ctx, lx, yy - 8, 16, 16, 4);
      ctx.fillStyle = '#333333'; ctx.font = RES.F(500, 16);
      ctx.fillText(RES.lineas(ctx, f.label, W - M - lx - 150, 1)[0], lx + 28, yy);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#333333'; ctx.font = RES.F(700, 16);
      ctx.fillText(f.pct + '%', W - M - 48, yy);
      ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 15);
      ctx.fillText(String(f.n), W - M, yy);
      ctx.textAlign = 'left';
    });
    return L.c;
  },

  /* Escala 1–5: promedio y una columna por valor, con su % encima */
  dibujarEscala: function (g) {
    var ALTO = 220, conHero = g.promedio != null;
    var L = RES.lienzo(g, ALTO + 40, conHero ? 70 : 0);
    var ctx = L.ctx, y = L.y, M = L.M, W = L.W;
    if (conHero) {
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#002343'; ctx.font = RES.F(700, 44);
      ctx.fillText(g.promedio, M, y - 4);
      var w = ctx.measureText(g.promedio).width;
      ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 16);
      ctx.fillText('promedio de 5', M + w + 12, y + 22);
      y += 70;
    }
    var n = g.filas.length, paso = (W - M * 2) / n, colW = Math.min(90, paso * 0.56);
    var max = Math.max.apply(null, g.filas.map(function (f) { return f.n; })) || 1;
    var base = y + ALTO;
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(M, base + 0.5); ctx.lineTo(W - M, base + 0.5); ctx.stroke();
    g.filas.forEach(function (f, i) {
      var cxx = M + paso * i + paso / 2, x = cxx - colW / 2;
      var h = f.n ? Math.max(4, f.n / max * (ALTO - 30)) : 0;
      if (h) {
        var top = base - h, r = Math.min(6, colW / 2);
        ctx.fillStyle = RES.COLOR;
        ctx.beginPath();
        ctx.moveTo(x, base); ctx.lineTo(x, top + r); ctx.arcTo(x, top, x + r, top, r);
        ctx.lineTo(x + colW - r, top); ctx.arcTo(x + colW, top, x + colW, top + r, r);
        ctx.lineTo(x + colW, base); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#333333'; ctx.font = RES.F(700, 15); ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
        ctx.fillText(f.pct + '%', cxx, top - 6);
      }
      ctx.fillStyle = '#555555'; ctx.font = RES.F(600, 16); ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(f.label, cxx, base + 10);
    });
    ctx.textAlign = 'left';
    return L.c;
  },

  /* Respuestas por día: línea con área y punto en cada día */
  dibujarLinea: function (g) {
    var ALTO = 260;
    var L = RES.lienzo(g, ALTO + 34, 0);
    var ctx = L.ctx, y = L.y, M = L.M, W = L.W;
    var d = g.dias, n = d.length, base = y + ALTO;
    var max = Math.max.apply(null, d.map(function (x) { return x.n; })) || 1;
    var X = function (i) { return M + i * (W - M * 2) / Math.max(1, n - 1); };
    var Y = function (v) { return y + 20 + (1 - v / max) * (ALTO - 20); };
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(M, base + 0.5); ctx.lineTo(W - M, base + 0.5); ctx.stroke();
    ctx.setLineDash([4, 4]);
    ctx.beginPath(); ctx.moveTo(M, Y(max) + 0.5); ctx.lineTo(W - M, Y(max) + 0.5); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 13); ctx.textBaseline = 'bottom';
    ctx.fillText('Máximo: ' + max, M, Y(max) - 6);
    /* Área */
    ctx.beginPath(); ctx.moveTo(X(0), base);
    d.forEach(function (x, i) { ctx.lineTo(X(i), Y(x.n)); });
    ctx.lineTo(X(n - 1), base); ctx.closePath();
    ctx.fillStyle = 'rgba(80,108,255,.12)'; ctx.fill();
    /* Línea */
    ctx.beginPath();
    d.forEach(function (x, i) { if (i) ctx.lineTo(X(i), Y(x.n)); else ctx.moveTo(X(i), Y(x.n)); });
    ctx.strokeStyle = RES.COLOR; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    /* Puntos con anillo blanco */
    d.forEach(function (x, i) {
      ctx.beginPath(); ctx.arc(X(i), Y(x.n), 5, 0, Math.PI * 2);
      ctx.fillStyle = RES.COLOR; ctx.fill();
      ctx.lineWidth = 2; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    });
    ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 13); ctx.textBaseline = 'top';
    ctx.fillText(RES.fmtDia(d[0].ms, true), M, base + 10);
    ctx.textAlign = 'right';
    ctx.fillText(RES.fmtDia(d[n - 1].ms, true), W - M, base + 10);
    ctx.textAlign = 'left';
    return L.c;
  },

  dibujarColumnas: function (g) {
    var ALTO = 260;
    var L = RES.lienzo(g, ALTO + 34, 0);
    var ctx = L.ctx, y = L.y, M = L.M, W = L.W;
    var n = g.dias.length, max = Math.max.apply(null, g.dias.map(function (d) { return d.n; })) || 1;
    var ancho = W - M * 2, paso = ancho / n, gap = Math.min(10, Math.max(2, paso * 0.25));
    var colW = Math.max(2, paso - gap), base = y + ALTO;

    /* Línea base y guía del máximo (recesivas) */
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(M, base + 0.5); ctx.lineTo(W - M, base + 0.5); ctx.stroke();
    if (n > 14) {
      /* Sin número sobre cada columna: una guía recesiva marca el máximo */
      var gy = base - (ALTO - 22) + 0.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(M, gy); ctx.lineTo(W - M, gy); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 13); ctx.textBaseline = 'bottom';
      ctx.fillText('Máximo: ' + max, M, gy - 6);
    }

    g.dias.forEach(function (d, i) {
      if (!d.n) return;
      var h = Math.max(4, d.n / max * (ALTO - 22));
      var x = M + i * paso + gap / 2, top = base - h, r = Math.min(4, colW / 2);
      ctx.fillStyle = RES.COLOR;
      ctx.beginPath();
      ctx.moveTo(x, base);
      ctx.lineTo(x, top + r);
      ctx.arcTo(x, top, x + r, top, r);
      ctx.lineTo(x + colW - r, top);
      ctx.arcTo(x + colW, top, x + colW, top + r, r);
      ctx.lineTo(x + colW, base);
      ctx.closePath();
      ctx.fill();
      if (n <= 14) {
        ctx.fillStyle = '#333333'; ctx.font = RES.F(700, 13); ctx.textAlign = 'center';
        ctx.fillText(String(d.n), x + colW / 2, top - 4);
        ctx.textAlign = 'left';
      }
    });

    ctx.fillStyle = '#777777'; ctx.font = RES.F(500, 13); ctx.textBaseline = 'top';
    ctx.fillText(RES.fmtDia(g.dias[0].ms, true), M, base + 10);
    if (n > 1) {
      ctx.textAlign = 'right';
      ctx.fillText(RES.fmtDia(g.dias[n - 1].ms, true), W - M, base + 10);
      ctx.textAlign = 'left';
    }
    return L.c;
  }
};

window.RES = RES;

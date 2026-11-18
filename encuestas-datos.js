/* ==========================================================================
   Mi RCR — Perfil "encuestas" · Datos (registros de cada respuesta)
   ──────────────────────────────────────────────────────────────────────────
   · La encuesta se elige en el menú de la barra de arriba (el mismo de
     Resultados); la encuesta elegida es compartida (RES.sel) y también la
     caché de respuestas (RES.cache). Excel va en la barra, junto al menú.
   · Tabla con una fila por respuesta y una columna por pregunta, con búsqueda.
     Tocar una fila abre la ficha de esa respuesta (y permite eliminarla).
   · "Excel" descarga un .xlsx con dos hojas: Respuestas y Preguntas.
   ========================================================================== */

RCR.modulos['datos-encuesta'] = {
  id: 'datos-encuesta',
  titulo: 'Datos',
  icono: 'table',
  workspace: 'encuestas',
  enNav: true,
  mount: function (root) { DAT.mount(root); },
  onShow: function () { RES.pintarTopbar(); DAT.cargar(false); }
};

var DAT = {
  /* SheetJS desde su CDN oficial (la versión de npm está desactualizada) */
  LIB_XLSX: 'https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js',
  PAGINA: 100,
  mostrar: 100,
  filtro: '',
  pendienteBorrar: null,
  borrando: false,
  exportando: false,

  /* ── Montaje ───────────────────────────────────────────────────────────── */
  mount: function (root) {
    root.innerHTML = '<div class="res-wrap dat-wrap"><div id="dat-body"></div></div>';
    DAT.iniciar();
  },

  iniciar: async function () {
    try {
      await ENC.asegurarDatos();
    } catch (e) {
      console.error('DAT.iniciar:', e);
      DAT.pintar(RCR.vacio('alert', 'No se pudieron cargar las encuestas', 'Revisa tu conexión y vuelve a intentar.'));
      return;
    }
    RES.pintarTopbar();
    DAT.cargar(false);
  },

  /* Lo llaman Encuestas y Compartir cuando cambia la lista */
  poblarSel: function () { RES.pintarTopbar(); },

  onSel: function (id) {
    RES.sel = id;
    DAT.mostrar = DAT.PAGINA;
    DAT.q = DAT.filtro = '';
    var w = document.getElementById('dat-busca');
    if (w) {
      w.classList.remove('abierta', 'activa');
      var inp = document.getElementById('dat-buscar');
      if (inp) inp.value = '';
      DAT.tabBusca(false);
    }
    DAT.cargar(false);
  },

  onBuscar: function (v) {
    DAT.q = String(v || '');
    DAT.filtro = DAT.q.trim().toLowerCase();
    DAT.mostrar = DAT.PAGINA;
    DAT.render();
  },

  verMas: function () {
    DAT.mostrar += DAT.PAGINA;
    DAT.render(true);
  },

  /* Al acercarse al final de la tabla se cargan más filas solas */
  alScroll: function (el) {
    if (DAT._hayMas && el.scrollTop + el.clientHeight >= el.scrollHeight - 160) DAT.verMas();
  },

  /* ── Buscador en la barra de arriba: una lupa que se estira como gota ──── */
  q: '',          // el texto tal como se escribió (DAT.filtro es para comparar)

  buscaHtml: function () {
    return '<div class="dat-busca" id="dat-busca">' +
      '<div class="dat-busca-gota">' +
        '<button class="dat-busca-ico" id="dat-busca-btn" type="button" title="Buscar" ' +
          'aria-label="Buscar en las respuestas" aria-expanded="false" aria-controls="dat-buscar" ' +
          'onclick="DAT.abrirBusca()">' + ico('search', 18, 2.3) + '</button>' +
        '<input id="dat-buscar" type="search" enterkeyhint="search" autocomplete="off" spellcheck="false" tabindex="-1" ' +
          'placeholder="Buscar en las respuestas" aria-label="Buscar en las respuestas" value="' + ENC.attr(DAT.q) + '" ' +
          'oninput="DAT.onBuscar(this.value)" onkeydown="DAT.teclaBusca(event)" onblur="DAT.blurBusca()">' +
        '<button class="dat-busca-x" type="button" tabindex="-1" title="Cerrar búsqueda" aria-label="Cerrar búsqueda" ' +
          'onmousedown="event.preventDefault()" onclick="DAT.cerrarBusca(true)">' + ico('x', 12, 3) + '</button>' +
      '</div>' +
    '</div>';
  },

  /* Tras pintar la barra: si había una búsqueda, se conserva */
  buscaListo: function () {
    var w = document.getElementById('dat-busca');
    if (!w) return;
    DAT.medirBusca();
    if (DAT.filtro && !w.classList.contains('cubre')) DAT.abrirBusca(true);
    else w.classList.toggle('activa', !!DAT.filtro);
  },

  /* Hasta dónde se estira: si hay espacio libre a la izquierda (computadora),
     crece hacia allá; si no (celular), cubre toda la barra de arriba. */
  medirBusca: function () {
    var w = document.getElementById('dat-busca');
    var tb = w && w.closest('.topbar');
    if (!tb) return;
    var r = w.getBoundingClientRect(), t = tb.getBoundingClientRect();
    var h1 = document.getElementById('topbar-titulo');
    var finTitulo = h1 ? h1.getBoundingClientRect().left + h1.scrollWidth + 36 : t.left;
    var libre = r.right - finTitulo;
    var cubre = libre < 260, m = 8;
    var ancho = cubre ? t.width - 2 * m : Math.min(340, libre);
    var der = cubre ? -(t.right - m - r.right) : 0;
    w.style.setProperty('--gota-w', Math.round(ancho) + 'px');
    w.style.setProperty('--gota-r', Math.round(der) + 'px');
    w.classList.toggle('cubre', cubre);
  },

  tabBusca: function (abierta) {
    var b = document.getElementById('dat-busca-btn');
    var w = document.getElementById('dat-busca');
    if (b) { b.setAttribute('aria-expanded', String(abierta)); b.tabIndex = abierta ? -1 : 0; }
    if (w) w.querySelectorAll('input,.dat-busca-x').forEach(function (el) { el.tabIndex = abierta ? 0 : -1; });
  },

  abrirBusca: function (quieto) {
    var w = document.getElementById('dat-busca');
    var inp = document.getElementById('dat-buscar');
    if (!w || !inp) return;
    if (w.classList.contains('abierta')) { inp.focus(); return; }
    DAT.medirBusca();
    if (quieto) w.classList.add('sin-anim');
    w.classList.remove('activa');
    w.classList.add('abierta');
    DAT.tabBusca(true);
    if (quieto) { void w.offsetWidth; w.classList.remove('sin-anim'); return; }
    inp.focus({ preventScroll: true });
    try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) {}
    if (!DAT._rsz) {
      DAT._rsz = function () {
        var x = document.getElementById('dat-busca');
        if (x && x.classList.contains('abierta')) DAT.medirBusca();
      };
      window.addEventListener('resize', DAT._rsz);
    }
  },

  /* limpiar = true (X o Esc): borra la búsqueda. Si no, solo se recoge y,
     si queda un filtro puesto, la lupa se queda en índigo. */
  cerrarBusca: function (limpiar) {
    var w = document.getElementById('dat-busca');
    var inp = document.getElementById('dat-buscar');
    if (limpiar && DAT.q) {
      if (inp) inp.value = '';
      DAT.onBuscar('');
    }
    if (!w) return;
    w.classList.remove('abierta');
    w.classList.toggle('activa', !!DAT.filtro);
    DAT.tabBusca(false);
    if (limpiar) {
      var b = document.getElementById('dat-busca-btn');
      if (b) b.focus({ preventScroll: true });
    }
  },

  teclaBusca: function (ev) {
    if (ev.key === 'Escape') { ev.preventDefault(); DAT.cerrarBusca(true); }
    else if (ev.key === 'Enter') { ev.preventDefault(); ev.target.blur(); }   // cierra el teclado del celular
  },

  /* Al salir del campo: vacío → se recoge; con texto → sigue abierto en la
     computadora y se recoge en el celular (para ver la barra de nuevo) */
  blurBusca: function () {
    setTimeout(function () {
      var w = document.getElementById('dat-busca');
      if (!w || !w.classList.contains('abierta') || w.contains(document.activeElement)) return;
      if (!DAT.filtro || w.classList.contains('cubre')) DAT.cerrarBusca(false);
    }, 150);
  },

  /* ── Datos ─────────────────────────────────────────────────────────────── */
  pintar: function (html) {
    var body = document.getElementById('dat-body');
    if (body) body.innerHTML = html;
  },

  botonExcel: function (on) {
    var b = document.getElementById('dat-excel');
    if (b) b.disabled = !on;
  },

  cargar: async function (forzar) {
    if (!ENC.cargado) return;
    DAT.botonExcel(false);
    if (!ENC.datos.length) {
      DAT.pintar(RCR.vacio('encuesta', 'Aún no tienes encuestas', 'Crea una en la sección Encuestas para ver aquí sus datos.'));
      return;
    }
    var id = RES.sel;
    if (!id) { DAT.pintar(RES.vacioElegir()); return; }
    if (!RES.cache[id] || forzar) DAT.pintar(RCR.cargando('Cargando respuestas'));
    try {
      await RES.leerRespuestas(id, forzar);
    } catch (e) {
      console.error('DAT.cargar:', e);
      if (id === RES.sel) DAT.pintar(RCR.vacio('alert', 'No se pudieron cargar las respuestas', 'Revisa tu conexión y vuelve a intentar.'));
      return;
    }
    if (id === RES.sel) DAT.render();
  },

  /* "4 nov, 16:55" (con el año solo si no es el actual) */
  fmtFechaHora: function (ms) {
    if (!ms) return '';
    var d = new Date(ms), o = { day: 'numeric', month: 'short' };
    if (d.getFullYear() !== new Date().getFullYear()) o.year = 'numeric';
    return d.toLocaleDateString('es-EC', o) + ', ' +
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  },

  /* Columnas de la tabla y del Excel: una por pregunta; la cuadrícula
     aporta una columna por cada fila ("P7. Pregunta — Frutas"). */
  columnas: function (enc) {
    var out = [];
    ENC.soloPreguntas(enc && enc.preguntas).forEach(function (q, i) {
      var base = 'P' + (i + 1) + '. ' + q.texto;
      if (q.tipo === 'cuadricula') {
        (q.filas || []).forEach(function (f) {
          out.push({ q: q, titulo: base + ' — ' + f.t, val: function (resp) { return ((resp || {})[q.id] || {})[f.id]; } });
        });
      } else {
        out.push({ q: q, titulo: base, val: function (resp) { return (resp || {})[q.id]; } });
      }
    });
    return out;
  },

  /* Respuestas con su número (1 = la más antigua) y el texto para buscar */
  filas: function () {
    var enc = RES.encuesta(), resps = RES.cache[RES.sel] || [], total = resps.length;
    var cols = DAT.columnas(enc);
    var todas = resps.map(function (r, i) {
      var ms = RES.ms(r.enviado);
      return { r: r, n: total - i, ms: ms };
    });
    if (!DAT.filtro) return todas;
    return todas.filter(function (f) {
      var txt = [String(f.n), DAT.fmtFechaHora(f.ms)].concat(cols.map(function (c) {
        return ENC.fmtValor(c.val(f.r.respuestas));
      })).join(' ').toLowerCase();
      return txt.indexOf(DAT.filtro) >= 0;
    });
  },

  /* mantener = true: conserva dónde estaba el scroll de la tabla (Mostrar más) */
  render: function (mantener) {
    var enc = RES.encuesta();
    var resps = RES.cache[RES.sel];
    if (!enc || !resps) return;
    DAT.botonExcel(resps.length > 0);
    DAT._hayMas = false;
    var sc0 = mantener && document.querySelector('#dat-body .dat-scroll');
    var pos = sc0 ? [sc0.scrollTop, sc0.scrollLeft] : null;

    if (!resps.length) {
      DAT.pintar('<div class="card">' + RCR.vacio('inbox', 'Todavía no hay respuestas',
        enc.estado === 'cerrada' ? 'La encuesta está cerrada.' : 'Cuando alguien responda, cada respuesta aparecerá aquí como una fila.') + '</div>');
      return;
    }

    var filas = DAT.filas();
    var vis = filas.slice(0, DAT.mostrar);
    var resumen = DAT.filtro
      ? filas.length + ' de ' + resps.length + ' respuestas coinciden'
      : resps.length + (resps.length === 1 ? ' respuesta' : ' respuestas');

    if (!filas.length) {
      DAT.pintar('<div class="dat-resumen">' + RCR.esc(resumen) + '</div>' +
        '<div class="card">' + RCR.vacio('search', 'Sin coincidencias', 'Prueba con otra palabra.') + '</div>');
      return;
    }

    var cols = DAT.columnas(enc);
    var thead = '<tr><th class="dat-n" scope="col">#</th><th class="dat-fecha" scope="col">Fecha</th>' +
      cols.map(function (c) {
        return '<th scope="col" title="' + ENC.attr(c.titulo) + '">' + RCR.esc(c.titulo) + '</th>';
      }).join('') + '</tr>';

    var tbody = vis.map(function (f) {
      var resp = f.r.respuestas || {};
      return '<tr tabindex="0" onclick="DAT.abrirFicha(\'' + f.r._docId + '\')" ' +
          'onkeydown="if(event.key===\'Enter\')DAT.abrirFicha(\'' + f.r._docId + '\')">' +
        '<td class="dat-n">' + f.n + '</td>' +
        '<td class="dat-fecha">' + RCR.esc(DAT.fmtFechaHora(f.ms) || '—') + '</td>' +
        cols.map(function (c) {
          var q = c.q, v = c.val(resp);
          if (RES.vacio(v)) return '<td class="dat-vacio">—</td>';
          if (ENC.esImagen(v)) return '<td class="dat-img"><img src="' + v + '" alt="Imagen adjunta" loading="lazy"></td>';
          var t = ENC.fmtValor(v);
          return '<td' + (q.tipo === 'escala' || q.tipo === 'numero' ? ' class="dat-num"' : '') + ' title="' + ENC.attr(t) + '">' + RCR.esc(t) + '</td>';
        }).join('') +
      '</tr>';
    }).join('');

    /* Si faltan filas, un pie dentro de la tabla (se cargan solas al bajar) */
    var faltan = filas.length - vis.length;
    DAT._hayMas = faltan > 0;
    var tfoot = faltan > 0
      ? '<tfoot><tr><td class="dat-pie" colspan="' + (cols.length + 2) + '"><div class="dat-pie-in">' +
          'Se muestran ' + vis.length + ' de ' + filas.length +
          '<button class="dat-mas" type="button" onclick="DAT.verMas()">Mostrar más</button>' +
        '</div></td></tr></tfoot>'
      : '';

    DAT.pintar(
      '<div class="dat-resumen">' + RCR.esc(resumen) + '<span>Toca una fila para ver la respuesta completa</span></div>' +
      '<div class="card dat-card">' +
        '<div class="dat-scroll" tabindex="0" aria-label="Tabla de respuestas" onscroll="DAT.alScroll(this)">' +
          '<table class="dat-tabla"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody>' + tfoot + '</table>' +
        '</div>' +
      '</div>'
    );
    if (pos) {
      var sc = document.querySelector('#dat-body .dat-scroll');
      if (sc) { sc.scrollTop = pos[0]; sc.scrollLeft = pos[1]; }
    }
  },

  /* Foto de una respuesta en grande (con descarga) */
  verFoto: function (rid, qid, n, pn) {
    var r = (RES.cache[RES.sel] || []).find(function (x) { return x._docId === rid; });
    var v = r && (r.respuestas || {})[qid];
    if (!ENC.esImagen(v)) return;
    RES.mostrarFoto(v, 'Respuesta #' + n + ' · P' + pn, DAT.fmtFechaHora(RES.ms(r.enviado)),
      RES.nombreArchivo((RES.encuesta() || {}).titulo, 'respuesta ' + n + ' P' + pn));
  },

  /* ── Ficha de una respuesta ────────────────────────────────────────────── */
  abrirFicha: function (rid) {
    var enc = RES.encuesta(), resps = RES.cache[RES.sel] || [];
    var i = resps.findIndex(function (r) { return r._docId === rid; });
    if (!enc || i < 0) return;
    var r = resps[i], resp = r.respuestas || {}, n = resps.length - i;

    var cuerpo = ENC.soloPreguntas(enc.preguntas).map(function (q, k) {
      var v = resp[q.id];
      return '<div class="dat-ficha-item">' +
        '<div class="dat-ficha-q">P' + (k + 1) + '. ' + RCR.esc(q.texto) + '</div>' +
        (RES.vacio(v)
          ? '<div class="dat-ficha-v vacio">Sin respuesta</div>'
          : ENC.esImagen(v)
            ? '<button type="button" class="dat-ficha-img" title="Ver en grande" ' +
                'onclick="DAT.verFoto(\'' + rid + '\',\'' + q.id + '\',' + n + ',' + (k + 1) + ')"><img src="' + v + '" alt="Imagen adjunta"></button>'
            : q.tipo === 'cuadricula'
              ? '<ul class="dat-ficha-grid">' + (q.filas || []).map(function (f) {
                  return '<li><span>' + RCR.esc(f.t) + '</span><strong>' + RCR.esc(v[f.id] != null ? v[f.id] : '—') + '</strong></li>';
                }).join('') + '</ul>'
              : '<div class="dat-ficha-v">' + RCR.esc(ENC.fmtValor(v)) + '</div>') +
      '</div>';
    }).join('');

    RCR.modal({
      id: 'm-dat-ficha',
      titulo: 'Respuesta #' + n,
      sub: RCR.esc(DAT.fmtFechaHora(RES.ms(r.enviado)) || 'Sin fecha'),
      cuerpo: cuerpo,
      acciones:
        (ENC.puedeEditarEnc(enc)
          ? '<button class="btn btn-glass dat-borrar" onclick="DAT.pedirBorrar(\'' + rid + '\')">' + ico('trash', 15) + 'Eliminar</button>'
          : '') +
        '<button class="btn btn-primary" onclick="RCR.cerrarModal(\'m-dat-ficha\')">Cerrar</button>'
    });
  },

  pedirBorrar: function (rid) {
    if (!ENC.puedeEditarEnc(RES.encuesta())) { RCR.toast('No tienes permiso para eliminar'); return; }
    var resps = RES.cache[RES.sel] || [];
    var i = resps.findIndex(function (r) { return r._docId === rid; });
    DAT.pendienteBorrar = rid;
    RCR.cerrarModal('m-dat-ficha');
    RCR.confirmar({
      titulo: '¿Eliminar la respuesta?',
      texto: 'La respuesta #' + (resps.length - i) + ' se quitará de los datos y de los resultados. Esta acción no se puede deshacer.',
      label: 'Eliminar',
      onOk: 'DAT.borrar()'
    });
  },

  borrar: async function () {
    if (DAT.borrando || !DAT.pendienteBorrar) return;
    DAT.borrando = true;
    var rid = DAT.pendienteBorrar, encId = RES.sel;
    var btn = document.getElementById('confirm-ok');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    try {
      var r = (RES.cache[encId] || []).find(function (x) { return x._docId === rid; });
      var ref = (r && r._legado) ? RCR.db.collection(ENC.COL_RESP).doc(rid) : ENC.refResp(encId).doc(rid);
      await ref.delete();
      if (RES.cache[encId]) {
        RES.cache[encId] = RES.cache[encId].filter(function (r) { return r._docId !== rid; });
        ENC.conteos[encId] = RES.cache[encId].length;
      }
      DAT.render(true);
      RCR.cerrarModal('m-confirm');
      RCR.toast('Respuesta eliminada');
    } catch (e) {
      console.error('DAT.borrar:', e);
      RCR.toast('No se pudo eliminar');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = 'Eliminar'; }
    DAT.pendienteBorrar = null;
    DAT.borrando = false;
  },

  /* ==========================================================================
     EXCEL (.xlsx) — hoja "Respuestas" (una fila por respuesta) y "Preguntas"
     ========================================================================== */
  excel: async function () {
    if (DAT.exportando) return;
    var enc = RES.encuesta(), resps = RES.cache[RES.sel];
    if (!enc || !resps || !resps.length) { RCR.toast('No hay respuestas para descargar'); return; }

    DAT.exportando = true;
    var btn = document.getElementById('dat-excel');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner dark"></span>'; }
    try {
      await RCR.cargarLib(DAT.LIB_XLSX);
      var wb = DAT.libro(enc, resps);
      var hoy = new Date();
      var fecha = hoy.getFullYear() + '-' + String(hoy.getMonth() + 1).padStart(2, '0') + '-' + String(hoy.getDate()).padStart(2, '0');
      XLSX.writeFile(wb, RES.nombreArchivo('Datos', enc.titulo || 'encuesta') + ' - ' + fecha + '.xlsx', { compression: true });
      RCR.toast('Excel descargado');
    } catch (e) {
      console.error('DAT.excel:', e);
      RCR.toast('No se pudo crear el Excel. Revisa tu conexión.');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = ico('download', 15) + 'Excel'; }
    DAT.exportando = false;
  },

  /* Arma el libro (función aparte para poder probarla sin descargar) */
  libro: function (enc, resps) {
    var ps = ENC.soloPreguntas(enc.preguntas);
    var asc = resps.slice().sort(function (a, b) { return RES.ms(a.enviado) - RES.ms(b.enviado); });

    /* Hoja 1: Respuestas */
    var colsX = DAT.columnas(enc);
    var cab = ['N°', 'Fecha'].concat(colsX.map(function (c) { return c.titulo; }));
    var aoa = [cab].concat(asc.map(function (r, i) {
      var resp = r.respuestas || {}, ms = RES.ms(r.enviado);
      return [i + 1, ms ? new Date(ms) : ''].concat(colsX.map(function (col) {
        var q = col.q, v = col.val(resp);
        if (RES.vacio(v)) return '';
        if (q.tipo === 'escala' || q.tipo === 'numero') { var x = Number(v); return isFinite(x) ? x : String(v); }
        if (ENC.esImagen(v)) return 'Imagen adjunta (ver en Mi RCR)';
        return Array.isArray(v) ? v.join('; ') : String(v);
      }));
    }));
    var ws = XLSX.utils.aoa_to_sheet(aoa, { cellDates: true });
    for (var f = 1; f < aoa.length; f++) {
      var c = ws[XLSX.utils.encode_cell({ r: f, c: 1 })];
      if (c && c.t === 'd') c.z = 'dd/mm/yyyy hh:mm';
    }
    ws['!cols'] = cab.map(function (h, k) {
      if (k === 0) return { wch: 6 };
      if (k === 1) return { wch: 17 };
      var largo = Math.max(String(h).length * 0.8, 12);
      aoa.slice(1, 200).forEach(function (fila) { largo = Math.max(largo, String(fila[k] == null ? '' : fila[k]).length); });
      return { wch: Math.min(60, Math.ceil(largo) + 2) };
    });
    ws['!autofilter'] = { ref: ws['!ref'] };

    /* Hoja 2: Preguntas */
    var aoa2 = [['N°', 'Pregunta', 'Tipo', 'Obligatoria', 'Opciones', 'Se muestra solo si', 'Enlace de apoyo']].concat(ps.map(function (q, i) {
      var cond = '';
      if (q.condicion) {
        var k = ps.findIndex(function (p) { return p.id === q.condicion.pregunta; });
        if (k >= 0) cond = 'P' + (k + 1) + (ps[k].tipo === 'multiple' ? ' incluye ' : ' = ') + q.condicion.valor;
      }
      var ops = q.tipo === 'cuadricula'
        ? 'Filas: ' + (q.filas || []).map(function (f) { return f.t; }).join('; ') + ' | Columnas: ' + (q.columnas || []).join('; ')
        : (q.opciones || []).join('; ') + (ENC.maxValido(q) ? ' (máx. ' + ENC.maxValido(q) + ')' : '');
      return [i + 1, q.texto, ENC.tipoLabel(q.tipo), q.requerida ? 'Sí' : 'No', ops, cond,
        (q.enlace && ENC.urlSegura(q.enlace.url)) || ''];
    }));
    var ws2 = XLSX.utils.aoa_to_sheet(aoa2);
    ws2['!cols'] = [{ wch: 5 }, { wch: 55 }, { wch: 16 }, { wch: 11 }, { wch: 45 }, { wch: 28 }, { wch: 40 }];

    var wb = XLSX.utils.book_new();
    wb.Props = { Title: enc.titulo || 'Encuesta', Author: 'Redes Con Rostro', CreatedDate: new Date() };
    XLSX.utils.book_append_sheet(wb, ws, 'Respuestas');
    XLSX.utils.book_append_sheet(wb, ws2, 'Preguntas');
    return wb;
  }
};

window.DAT = DAT;

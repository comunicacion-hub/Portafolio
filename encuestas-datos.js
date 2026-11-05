/* ==========================================================================
   Mi RCR — Perfil "encuestas" · Datos (registros de cada respuesta)
   ──────────────────────────────────────────────────────────────────────────
   · El mismo recuadro con menú desplegable de Resultados; la encuesta elegida
     es compartida (RES.sel) y también la caché de respuestas (RES.cache).
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
  onShow: function () { DAT.poblarSel(); DAT.cargar(false); }
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
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Datos</div>' +
          '<div class="section-sub">Registros de cada respuesta</div>' +
        '</div>' +
        '<div class="dat-acciones">' +
          '<button class="btn btn-glass dat-excel" id="dat-excel" title="Descargar en Excel" onclick="DAT.excel()" disabled>' +
            ico('download', 15) + 'Excel</button>' +
          '<button class="btn-ico" title="Actualizar" aria-label="Actualizar datos" onclick="DAT.cargar(true)">' + ico('refresh', 16) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="res-wrap dat-wrap">' +
        '<div class="card res-picker">' +
          '<label class="form-lbl" for="dat-sel">Encuesta</label>' +
          '<div class="res-picker-fila">' +
            '<select class="form-inp" id="dat-sel" onchange="DAT.onSel(this.value)" disabled>' +
              '<option>Cargando…</option>' +
            '</select>' +
            '<button class="btn-ico hidden" id="dat-compartir" title="Compartir con personas" aria-label="Compartir con personas" ' +
              'onclick="ENC.compartirPersonas(RES.sel)">' + ico('users', 17) + '</button>' +
          '</div>' +
        '</div>' +
        '<input class="form-inp dat-buscar" id="dat-buscar" type="search" placeholder="Buscar en las respuestas…" ' +
          'aria-label="Buscar en las respuestas" oninput="DAT.onBuscar(this.value)">' +
        '<div id="dat-body">' + RCR.cargando('Cargando datos') + '</div>' +
      '</div>';
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
    DAT.poblarSel();
    DAT.cargar(false);
  },

  /* ── Menú desplegable (comparte la encuesta elegida con Resultados) ────── */
  poblarSel: function () {
    var sel = document.getElementById('dat-sel');
    if (!sel || !ENC.cargado) return;
    var lista = ENC.datos;
    if (!lista.some(function (e) { return e._docId === RES.sel; })) {
      RES.sel = lista.length ? lista[0]._docId : '';
    }
    if (!lista.length) {
      sel.innerHTML = '<option value="">No tienes encuestas</option>';
      sel.disabled = true;
      return;
    }
    sel.disabled = false;
    sel.innerHTML = ENC.opcionesSelect(RES.sel);
  },

  onSel: function (id) {
    RES.sel = id;
    DAT.mostrar = DAT.PAGINA;
    DAT.filtro = '';
    var b = document.getElementById('dat-buscar');
    if (b) b.value = '';
    DAT.cargar(false);
  },

  onBuscar: function (v) {
    DAT.filtro = String(v || '').trim().toLowerCase();
    DAT.mostrar = DAT.PAGINA;
    DAT.render();
  },

  verMas: function () {
    DAT.mostrar += DAT.PAGINA;
    DAT.render();
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
    if (!id) return;
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

  /* Respuestas con su número (1 = la más antigua) y el texto para buscar */
  filas: function () {
    var enc = RES.encuesta(), resps = RES.cache[RES.sel] || [], total = resps.length;
    var ps = (enc && enc.preguntas) || [];
    var todas = resps.map(function (r, i) {
      var ms = RES.ms(r.enviado);
      return { r: r, n: total - i, ms: ms };
    });
    if (!DAT.filtro) return todas;
    return todas.filter(function (f) {
      var txt = [String(f.n), DAT.fmtFechaHora(f.ms)].concat(ps.map(function (q) {
        return ENC.fmtValor((f.r.respuestas || {})[q.id]);
      })).join(' ').toLowerCase();
      return txt.indexOf(DAT.filtro) >= 0;
    });
  },

  render: function () {
    var enc = RES.encuesta();
    var resps = RES.cache[RES.sel];
    if (ENC.toggleCompartir) ENC.toggleCompartir('dat-compartir', enc);
    if (!enc || !resps) return;
    var ps = enc.preguntas || [];
    DAT.botonExcel(resps.length > 0);

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

    var thead = '<tr><th class="dat-n" scope="col">#</th><th class="dat-fecha" scope="col">Fecha</th>' +
      ps.map(function (q, i) {
        var t = 'P' + (i + 1) + '. ' + q.texto;
        return '<th scope="col" title="' + ENC.attr(t) + '">' + RCR.esc(t) + '</th>';
      }).join('') + '</tr>';

    var tbody = vis.map(function (f) {
      var resp = f.r.respuestas || {};
      return '<tr tabindex="0" onclick="DAT.abrirFicha(\'' + f.r._docId + '\')" ' +
          'onkeydown="if(event.key===\'Enter\')DAT.abrirFicha(\'' + f.r._docId + '\')">' +
        '<td class="dat-n">' + f.n + '</td>' +
        '<td class="dat-fecha">' + RCR.esc(DAT.fmtFechaHora(f.ms) || '—') + '</td>' +
        ps.map(function (q) {
          var v = resp[q.id];
          if (RES.vacio(v)) return '<td class="dat-vacio">—</td>';
          var t = ENC.fmtValor(v);
          return '<td' + (q.tipo === 'escala' ? ' class="dat-num"' : '') + ' title="' + ENC.attr(t) + '">' + RCR.esc(t) + '</td>';
        }).join('') +
      '</tr>';
    }).join('');

    DAT.pintar(
      '<div class="dat-resumen">' + RCR.esc(resumen) + '<span>Toca una fila para ver la respuesta completa</span></div>' +
      '<div class="card dat-card">' +
        '<div class="dat-scroll" tabindex="0" aria-label="Tabla de respuestas">' +
          '<table class="dat-tabla"><thead>' + thead + '</thead><tbody>' + tbody + '</tbody></table>' +
        '</div>' +
      '</div>' +
      (filas.length > vis.length
        ? '<button class="rep-add dat-mas" onclick="DAT.verMas()">Mostrar más (' + (filas.length - vis.length) + ' restantes)</button>'
        : '')
    );
  },

  /* ── Ficha de una respuesta ────────────────────────────────────────────── */
  abrirFicha: function (rid) {
    var enc = RES.encuesta(), resps = RES.cache[RES.sel] || [];
    var i = resps.findIndex(function (r) { return r._docId === rid; });
    if (!enc || i < 0) return;
    var r = resps[i], resp = r.respuestas || {}, n = resps.length - i;

    var cuerpo = (enc.preguntas || []).map(function (q, k) {
      var v = resp[q.id];
      return '<div class="dat-ficha-item">' +
        '<div class="dat-ficha-q">P' + (k + 1) + '. ' + RCR.esc(q.texto) + '</div>' +
        (RES.vacio(v)
          ? '<div class="dat-ficha-v vacio">Sin respuesta</div>'
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
      await RCR.db.collection(ENC.COL_RESP).doc(rid).delete();
      if (RES.cache[encId]) {
        RES.cache[encId] = RES.cache[encId].filter(function (r) { return r._docId !== rid; });
        ENC.conteos[encId] = RES.cache[encId].length;
      }
      DAT.render();
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
    var ps = enc.preguntas || [];
    var asc = resps.slice().sort(function (a, b) { return RES.ms(a.enviado) - RES.ms(b.enviado); });

    /* Hoja 1: Respuestas */
    var cab = ['N°', 'Fecha'].concat(ps.map(function (q, i) { return 'P' + (i + 1) + '. ' + q.texto; }));
    var aoa = [cab].concat(asc.map(function (r, i) {
      var resp = r.respuestas || {}, ms = RES.ms(r.enviado);
      return [i + 1, ms ? new Date(ms) : ''].concat(ps.map(function (q) {
        var v = resp[q.id];
        if (RES.vacio(v)) return '';
        if (q.tipo === 'escala') { var x = Number(v); return isFinite(x) ? x : String(v); }
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
    var aoa2 = [['N°', 'Pregunta', 'Tipo', 'Obligatoria', 'Opciones', 'Se muestra solo si']].concat(ps.map(function (q, i) {
      var cond = '';
      if (q.condicion) {
        var k = ps.findIndex(function (p) { return p.id === q.condicion.pregunta; });
        if (k >= 0) cond = 'P' + (k + 1) + (ps[k].tipo === 'multiple' ? ' incluye ' : ' = ') + q.condicion.valor;
      }
      return [i + 1, q.texto, ENC.tipoLabel(q.tipo), q.requerida ? 'Sí' : 'No', (q.opciones || []).join('; '), cond];
    }));
    var ws2 = XLSX.utils.aoa_to_sheet(aoa2);
    ws2['!cols'] = [{ wch: 5 }, { wch: 55 }, { wch: 16 }, { wch: 11 }, { wch: 45 }, { wch: 28 }];

    var wb = XLSX.utils.book_new();
    wb.Props = { Title: enc.titulo || 'Encuesta', Author: 'Redes Con Rostro', CreatedDate: new Date() };
    XLSX.utils.book_append_sheet(wb, ws, 'Respuestas');
    XLSX.utils.book_append_sheet(wb, ws2, 'Preguntas');
    return wb;
  }
};

window.DAT = DAT;

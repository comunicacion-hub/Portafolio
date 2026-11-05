/* ==========================================================================
   Mi RCR — Perfil "encuestas" · Resultados (dashboard consolidado)
   ──────────────────────────────────────────────────────────────────────────
   · Un recuadro con un menú desplegable para elegir la encuesta (las mismas
     que la persona ve en Encuestas: las suyas y las compartidas con ella).
   · Indicadores (respuestas, preguntas, última respuesta), respuestas por día
     y un gráfico por pregunta. Las preguntas abiertas muestran sus textos.
   · Cada gráfico se descarga por separado como imagen PNG (se dibuja en un
     canvas a partir de los datos, no es una captura de pantalla).
   Lee la colección "RespuestasEncuesta" (ver encuestas.js).
   ========================================================================== */

RCR.modulos['resultados-encuesta'] = {
  id: 'resultados-encuesta',
  titulo: 'Resultados',
  icono: 'barChart',
  workspace: 'encuestas',
  enNav: true,
  mount: function (root) { RES.mount(root); },
  onShow: function () { RES.poblarSel(); RES.cargarRespuestas(false); }
};

var RES = {
  sel: '',
  cache: {},        // encuestaId -> [respuestas]
  expandir: {},     // preguntaId -> true (ver todas las respuestas abiertas)
  graficos: {},     // clave -> datos para dibujar el PNG
  COLOR: '#506CFF', // un solo tono: cada gráfico es de una sola serie
  TEXTOS_VISIBLES: 5,

  /* ── Montaje ───────────────────────────────────────────────────────────── */
  mount: function (root) {
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Resultados</div>' +
          '<div class="section-sub">Dashboard consolidado</div>' +
        '</div>' +
        '<button class="btn-ico" title="Actualizar" aria-label="Actualizar resultados" onclick="RES.cargarRespuestas(true)">' + ico('refresh', 16) + '</button>' +
      '</div>' +
      '<div class="res-wrap">' +
        '<div class="card res-picker">' +
          '<label class="form-lbl" for="res-sel">Encuesta</label>' +
          '<div class="res-picker-fila">' +
            '<select class="form-inp" id="res-sel" onchange="RES.onSel(this.value)" disabled>' +
              '<option>Cargando…</option>' +
            '</select>' +
            '<button class="btn-ico hidden" id="res-compartir" title="Compartir con personas" aria-label="Compartir con personas" ' +
              'onclick="ENC.compartirPersonas(RES.sel)">' + ico('users', 17) + '</button>' +
          '</div>' +
        '</div>' +
        '<div id="res-body">' + RCR.cargando('Cargando resultados') + '</div>' +
      '</div>';
    RES.iniciarTooltip(root);
    RES.iniciar();
  },

  iniciar: async function () {
    try {
      await ENC.asegurarDatos();
    } catch (e) {
      console.error('RES.iniciar:', e);
      RES.pintar(RCR.vacio('alert', 'No se pudieron cargar las encuestas', 'Revisa tu conexión y vuelve a intentar.'));
      return;
    }
    RES.poblarSel();
    RES.cargarRespuestas(false);
  },

  /* Abre Resultados con una encuesta ya elegida (desde la tarjeta en Encuestas) */
  abrir: function (id) {
    RES.sel = id;
    RCR.ir('resultados-encuesta');
  },

  /* ── Menú desplegable de encuestas ─────────────────────────────────────── */
  poblarSel: function () {
    var sel = document.getElementById('res-sel');
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
    RES.cargarRespuestas(false);
  },

  encuesta: function () {
    return ENC.datos.find(function (e) { return e._docId === RES.sel; }) || null;
  },

  /* ── Datos ─────────────────────────────────────────────────────────────── */
  cargarRespuestas: async function (forzar) {
    if (!ENC.cargado) return;
    if (!ENC.datos.length) {
      RES.pintar(RCR.vacio('encuesta', 'Aún no tienes encuestas', 'Crea una en la sección Encuestas para ver aquí sus resultados.'));
      return;
    }
    var id = RES.sel;
    if (!id) return;
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
    var snap = await RCR.db.collection(ENC.COL_RESP).where('encuestaId', '==', id).get();
    RES.cache[id] = snap.docs.map(function (d) { return Object.assign({ _docId: d.id }, d.data()); })
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
    if (ENC.toggleCompartir) ENC.toggleCompartir('res-compartir', enc);
    if (!enc || !resps) return;
    RES.graficos = {};

    var total = resps.length;
    var ultima = total ? RES.ms(resps[0].enviado) : 0;
    var html =
      '<div class="res-kpis">' +
        RES.kpi(total, total === 1 ? 'Respuesta' : 'Respuestas') +
        RES.kpi(ENC.soloPreguntas(enc.preguntas).length, 'Preguntas') +
        RES.kpi(ultima ? RES.fmtDia(ultima) : '—', 'Última respuesta') +
      '</div>';

    if (!total) {
      html +=
        '<div class="card">' +
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
  },

  kpi: function (valor, label) {
    return '<div class="res-kpi"><strong>' + RCR.esc(valor) + '</strong><span>' + RCR.esc(label) + '</span></div>';
  },

  botonImagen: function (clave) {
    return '<button class="btn-ico res-dl" title="Descargar imagen" aria-label="Descargar gráfico como imagen" ' +
      'onclick="RES.png(\'' + clave + '\')">' + ico('download', 16) + '</button>';
  },

  tarjetaDias: function (enc, resps) {
    var pd = RES.porDia(resps);
    if (!pd.dias.length) return '';
    var max = Math.max.apply(null, pd.dias.map(function (d) { return d.n; })) || 1;
    var titulo = 'Respuestas por día';
    var sub = pd.recortado ? 'Últimos 30 días con actividad' : (pd.dias.length === 1 ? RES.fmtDia(pd.dias[0].ms, true) : 'Desde la primera respuesta');
    RES.graficos.dias = { tipo: 'columnas', titulo: titulo, sub: sub, dias: pd.dias, encuesta: enc.titulo };

    var cols = pd.dias.map(function (d) {
      var h = d.n ? Math.max(4, Math.round(d.n / max * 100)) : 0;
      var tip = RES.fmtDia(d.ms) + ': ' + d.n + (d.n === 1 ? ' respuesta' : ' respuestas');
      return '<div class="res-col" data-tip="' + ENC.attr(tip) + '" aria-label="' + ENC.attr(tip) + '">' +
               '<div class="res-col-fill" style="height:' + h + '%"></div></div>';
    }).join('');
    var primero = pd.dias[0], ultimo = pd.dias[pd.dias.length - 1];

    return '' +
      '<div class="card res-card">' +
        '<div class="res-card-head">' +
          '<div class="res-card-tit"><h3>' + titulo + '</h3><small>' + RCR.esc(sub) + ' · máximo ' + max + ' en un día</small></div>' +
          RES.botonImagen('dias') +
        '</div>' +
        '<div class="res-cols" role="img" aria-label="' + ENC.attr(titulo) + '">' + cols + '</div>' +
        '<div class="res-cols-eje"><span>' + RES.fmtDia(primero.ms) + '</span>' +
          (pd.dias.length > 1 ? '<span>' + RES.fmtDia(ultimo.ms) + '</span>' : '') + '</div>' +
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

  tarjetaPregunta: function (enc, s) {
    var q = s.q, clave = 'q_' + q.id;
    var cabeza = function (conBoton) {
      return '<div class="res-card-head">' +
        '<div class="res-card-tit">' +
          '<div class="res-q-meta">Pregunta ' + s.n + ' · ' + RCR.esc(ENC.tipoLabel(q.tipo)) + '</div>' +
          '<h3>' + RCR.esc(q.texto) + '</h3>' +
          '<small>' + RCR.esc(RES.notaPregunta(enc, s)) + '</small>' +
        '</div>' +
        (conBoton ? RES.botonImagen(clave) : '') +
      '</div>';
    };

    if (!s.respondieron) {
      return '<div class="card res-card">' + cabeza(false) +
        '<div class="res-sin">Nadie respondió esta pregunta todavía.</div></div>';
    }

    /* Número: el promedio destacado y tres datos de apoyo */
    if (s.numeros) {
      return '<div class="card res-card">' + cabeza(false) +
        '<div class="res-hero"><strong>' + RCR.esc(s.numeros.promedio) + '</strong><span>promedio</span></div>' +
        '<div class="res-num-fila">' +
          RES.kpi(s.numeros.min, 'Mínimo') + RES.kpi(s.numeros.mediana, 'Mediana') + RES.kpi(s.numeros.max, 'Máximo') +
        '</div>' +
      '</div>';
    }

    /* Cuadrícula: una barra 100% apilada por fila, con leyenda arriba */
    if (s.grid) {
      var g = s.grid, nc = g.cols.length;
      RES.graficos[clave] = {
        tipo: 'apiladas', titulo: 'P' + s.n + '. ' + q.texto, sub: RES.notaPregunta(enc, s),
        grid: g, encuesta: enc.titulo
      };
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
          '<div class="res-apil-n">' + f.n + '</div>' +
        '</div>';
      }).join('');
      return '<div class="card res-card">' + cabeza(true) + leyenda +
        '<div class="res-apil">' + filas + '</div></div>';
    }

    /* Fotos: galería; al tocar una se ve en grande */
    if (s.fotos) {
      var todasF = !!RES.expandir[q.id], LIM = 12;
      var visF = todasF ? s.fotos : s.fotos.slice(0, LIM);
      RES.fotos[q.id] = s.fotos;
      return '<div class="card res-card">' + cabeza(false) +
        '<div class="res-galeria">' + visF.map(function (f, k) {
          return '<button type="button" class="res-foto" onclick="RES.verFoto(\'' + q.id + '\',' + k + ')" ' +
            'aria-label="Ver foto ' + (k + 1) + '"><img src="' + f.v + '" alt="" loading="lazy"></button>';
        }).join('') + '</div>' +
        (s.fotos.length > LIM
          ? '<button class="rep-add res-mas" onclick="RES.verTodas(\'' + q.id + '\')">' +
              (todasF ? 'Ver menos' : 'Ver todas (' + s.fotos.length + ')') + '</button>'
          : '') +
      '</div>';
    }

    /* Preguntas abiertas: lista de respuestas (no es un gráfico) */
    if (s.textos) {
      var todas = !!RES.expandir[q.id];
      var vis = todas ? s.textos : s.textos.slice(0, RES.TEXTOS_VISIBLES);
      return '<div class="card res-card">' + cabeza(false) +
        '<ul class="res-textos">' + vis.map(function (t) {
          return '<li><p>' + RCR.esc(t.v) + '</p>' + (t.ms ? '<small>' + RES.fmtDia(t.ms, true) + '</small>' : '') + '</li>';
        }).join('') + '</ul>' +
        (s.textos.length > RES.TEXTOS_VISIBLES
          ? '<button class="rep-add res-mas" onclick="RES.verTodas(\'' + q.id + '\')">' +
              (todas ? 'Ver menos' : 'Ver todas (' + s.textos.length + ')') + '</button>'
          : '') +
      '</div>';
    }

    /* Preguntas cerradas: barras horizontales */
    RES.graficos[clave] = {
      tipo: 'barras', titulo: 'P' + s.n + '. ' + q.texto, sub: RES.notaPregunta(enc, s),
      filas: s.filas, promedio: s.promedio, encuesta: enc.titulo
    };
    var max = Math.max.apply(null, s.filas.map(function (f) { return f.n; })) || 1;

    var hero = s.promedio != null
      ? '<div class="res-hero"><strong>' + s.promedio + '</strong><span>promedio de 5</span></div>'
      : '';

    var barras = '<div class="res-barras">' + s.filas.map(function (f) {
      var tip = f.label + ': ' + f.n + (f.n === 1 ? ' respuesta' : ' respuestas') + ' (' + f.pct + '%)';
      return '<div class="res-barra" data-tip="' + ENC.attr(tip) + '">' +
          '<div class="res-barra-lbl">' + RCR.esc(f.label) + '</div>' +
          '<div class="res-barra-pista"><div class="res-barra-fill" style="width:' + (f.n ? Math.max(1.5, f.n / max * 100) : 0) + '%"></div></div>' +
          '<div class="res-barra-val"><strong>' + f.pct + '%</strong><span>' + f.n + '</span></div>' +
        '</div>';
    }).join('') + '</div>';

    return '<div class="card res-card">' + cabeza(true) + hero + barras + '</div>';
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

    var canvas = g.tipo === 'columnas' ? RES.dibujarColumnas(g)
      : (g.tipo === 'apiladas' ? RES.dibujarApiladas(g) : RES.dibujarBarras(g));
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

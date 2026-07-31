/* ==========================================================================
   Mi RCR — firmas.js
   Generador de firma visual sobre un PDF. NO guarda nada: todo ocurre en el
   navegador y el resultado se descarga. Flujo:
     1. Adjuntar la firma (subir imagen/foto o dibujarla en el momento).
     2. Adjuntar el PDF a firmar.
     3. Se abre el visor: arrastrar el ícono de firma donde se quiera
        (varias, en distintas páginas; se pueden redimensionar o quitar).
     4. "Firmar" estampa las firmas → "Listo" → "Descargar PDF".
   Requiere pdf-lib (escribir) y pdf.js (previsualizar), cargadas por CDN.
   ========================================================================== */

window.RCR = window.RCR || { modulos: {} };

RCR.modulos.firmas = {
  id: 'firmas',
  titulo: 'Firmas',
  icono: 'firmas',
  enNav: true,
  fab: null,                 // no usa botón flotante; el flujo es guiado

  mount: function (root) {
    root.innerHTML =
      '<div id="fir-root" class="fir-wrap"></div>';
    FIR.reset();
    FIR.pintarInicio();
  },

  onShow: function () {
    /* Al volver a entrar a la sección, se empieza limpio (sin cache) */
    FIR.reset();
    FIR.pdfFirmado = null;
    FIR.pintarInicio();
  }
};

var FIR = {

  LIB_PDFLIB: 'https://cdnjs.cloudflare.com/ajax/libs/pdf-lib/1.17.1/pdf-lib.min.js',
  LIB_PDFJS:  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  PDFJS_WORKER: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',

  ESCALA: 1.4,               // escala de render en pantalla (calidad vs peso)

  firmaDataUrl: null,        // PNG de la firma (subida o dibujada)
  pdfBytes: null,            // ArrayBuffer del PDF original
  pdfNombre: '',             // nombre del archivo subido
  pdfDoc: null,              // documento pdf.js (para render)
  paginas: [],               // { wrap, canvas, ancho, alto } por página
  estampas: [],              // { el, pagina, xRel, yRel, wRel, hRel }
  seq: 0,
  generando: false,

  reset: function () {
    FIR.firmaDataUrl = null;
    FIR.pdfBytes = null;
    FIR.pdfNombre = '';
    FIR.pdfDoc = null;
    FIR.paginas = [];
    FIR.estampas = [];
    FIR.seq = 0;
    FIR.generando = false;
  },

  /* ==========================================================================
     PANTALLA INICIAL — dos "slots" para adjuntar
     ========================================================================== */
  pintarInicio: function () {
    var root = document.getElementById('fir-root');
    if (!root) return;

    var firmaOk = !!FIR.firmaDataUrl;
    var pdfOk = !!FIR.pdfBytes;

    function paso(n, titulo, hecho, cuerpo) {
      return '<div class="fir-paso ' + (hecho ? 'ok' : '') + '">' +
        '<div class="fir-paso-head">' +
          '<span class="fir-paso-num">' + (hecho ? ico('check', 16) : n) + '</span>' +
          '<span class="fir-paso-tit">' + titulo + '</span>' +
          '<span class="fir-paso-estado ' + (hecho ? 'ok' : '') + '">' + (hecho ? 'Completado' : 'Pendiente') + '</span>' +
        '</div>' +
        '<div class="fir-paso-body">' + cuerpo + '</div>' +
      '</div>';
    }

    var pasoFirma = paso(1, 'Crea tu firma', firmaOk,
      (firmaOk
        ? '<div class="fir-firma-info">' +
            '<div><span class="fir-mini-lbl">Método utilizado</span><p>Firma adjuntada</p></div>' +
            '<img class="fir-firma-prev" src="' + FIR.firmaDataUrl + '" alt="Vista previa de tu firma">' +
          '</div>'
        : '<p class="fir-paso-desc">Sube una imagen de tu firma o dibújala aquí mismo.</p>') +
      '<div class="fir-paso-btns">' +
        '<button class="btn btn-glass" onclick="FIR.pedirImagen()">' + ico('upload', 15) + (firmaOk ? 'Cambiar imagen' : 'Subir imagen') + '</button>' +
        '<button class="btn btn-glass" onclick="FIR.abrirDibujo()">' + ico('edit', 15) + 'Dibujar firma</button>' +
      '</div>');

    var pasoDoc = paso(2, 'Adjunta el PDF', pdfOk,
      (pdfOk
        ? '<div class="fir-doc-info">' + ico('filePdf', 20) +
            '<div><p class="fir-doc-nombre">' + RCR.esc(FIR.pdfNombre) + '</p>' +
            '<span class="fir-mini-lbl">' + (FIR.pdfPeso || '') + '</span></div>' +
          '</div>'
        : '<p class="fir-paso-desc">Adjunta el documento PDF que vas a firmar.</p>') +
      '<div class="fir-paso-btns">' +
        '<button class="btn btn-glass" onclick="FIR.pedirPdf()">' + ico('upload', 15) + (pdfOk ? 'Cambiar archivo' : 'Adjuntar PDF') + '</button>' +
      '</div>');

    var pasoRevisar = paso(3, 'Coloca tu firma', false,
      '<p class="fir-paso-desc">Cuando la firma y el documento estén listos, continúa para colocar tu firma sobre el PDF.</p>');

    root.innerHTML =
      '<div class="fir-stepper">' +
        '<div class="fir-step ' + (firmaOk ? 'done' : 'now') + '"><span>1</span>Firma</div>' +
        '<div class="fir-step-line"></div>' +
        '<div class="fir-step ' + (pdfOk ? 'done' : (firmaOk ? 'now' : '')) + '"><span>2</span>Documento</div>' +
        '<div class="fir-step-line"></div>' +
        '<div class="fir-step ' + (firmaOk && pdfOk ? 'now' : '') + '"><span>3</span>Revisar</div>' +
      '</div>' +

      '<div class="fir-pasos">' + pasoFirma + pasoDoc + pasoRevisar + '</div>' +

      '<button class="btn btn-primary fir-continuar"' +
        (firmaOk && pdfOk ? '' : ' disabled') +
        ' onclick="FIR.abrirVisor()">' +
        ico('chevronRight', 16) + 'Continuar y colocar la firma</button>' +

      '<p class="fir-nota">' + ico('info', 14) + ' Tu documento es seguro. No guardamos copias.</p>' +

      '<input type="file" id="fir-file-img" accept="image/png,image/jpeg" style="display:none" onchange="FIR.recibirImagen(event)">' +
      '<input type="file" id="fir-file-pdf" accept="application/pdf" style="display:none" onchange="FIR.recibirPdf(event)">';
  },

  /* ==========================================================================
     ADJUNTAR LA FIRMA
     ========================================================================== */
  pedirImagen: function () { document.getElementById('fir-file-img').click(); },

  recibirImagen: function (ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { RCR.toast('La imagen es muy pesada (máx. 8 MB)'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      /* Se recorta el fondo blanco para que la firma quede "transparente" */
      FIR.prepararFirma(reader.result);
    };
    reader.onerror = function () { RCR.toast('No se pudo leer la imagen'); };
    reader.readAsDataURL(file);
  },

  /* Convierte a PNG y vuelve transparente el fondo claro (útil en fotos) */
  prepararFirma: function (dataUrl) {
    var img = new Image();
    img.onload = function () {
      var c = document.createElement('canvas');
      var max = 800;
      var esc = Math.min(1, max / Math.max(img.width, img.height));
      c.width = Math.round(img.width * esc);
      c.height = Math.round(img.height * esc);
      var ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0, c.width, c.height);
      try {
        var d = ctx.getImageData(0, 0, c.width, c.height);
        var px = d.data;
        for (var i = 0; i < px.length; i += 4) {
          /* pixeles casi blancos -> transparentes */
          if (px[i] > 235 && px[i + 1] > 235 && px[i + 2] > 235) px[i + 3] = 0;
        }
        ctx.putImageData(d, 0, 0);
      } catch (e) { /* si falla (CORS), se deja la imagen tal cual */ }
      FIR.firmaDataUrl = c.toDataURL('image/png');
      FIR.pintarInicio();
    };
    img.onerror = function () { RCR.toast('Imagen no válida'); };
    img.src = dataUrl;
  },

  /* ── Dibujar la firma en el momento ─────────────────────────────────────── */
  abrirDibujo: function () {
    RCR.modal({
      id: 'm-fir-draw',
      titulo: 'Dibuja tu firma',
      sub: 'Con el dedo o el mouse',
      cuerpo:
        '<canvas id="fir-canvas" class="fir-draw-canvas"></canvas>' +
        '<div class="fir-draw-hint">Firma dentro del recuadro</div>',
      acciones:
        '<button class="btn btn-glass" onclick="FIR.limpiarDibujo()">' + ico('refresh', 15) + 'Limpiar</button>' +
        '<button class="btn btn-primary" onclick="FIR.usarDibujo()">' + ico('check', 15) + 'Usar esta firma</button>'
    });
    requestAnimationFrame(FIR.initDibujo);
  },

  initDibujo: function () {
    var c = document.getElementById('fir-canvas');
    if (!c) return;
    /* Ajustar resolución real del canvas a su tamaño en pantalla */
    var rect = c.getBoundingClientRect();
    var dpr = window.devicePixelRatio || 1;
    c.width = Math.round(rect.width * dpr);
    c.height = Math.round(rect.height * dpr);
    var ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#1b1b1b';
    FIR._draw = { ctx: ctx, pintando: false, vacio: true, rect: rect, dpr: dpr };

    function pos(e) {
      var r = c.getBoundingClientRect();
      var t = e.touches && e.touches[0];
      var x = (t ? t.clientX : e.clientX) - r.left;
      var y = (t ? t.clientY : e.clientY) - r.top;
      return { x: x, y: y };
    }
    function abajo(e) { e.preventDefault(); FIR._draw.pintando = true; var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }
    function mueve(e) { if (!FIR._draw.pintando) return; e.preventDefault(); var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); FIR._draw.vacio = false; }
    function arriba(e) { e.preventDefault(); FIR._draw.pintando = false; }

    c.onmousedown = abajo; c.onmousemove = mueve; c.onmouseup = arriba; c.onmouseleave = arriba;
    c.ontouchstart = abajo; c.ontouchmove = mueve; c.ontouchend = arriba;
  },

  limpiarDibujo: function () {
    var c = document.getElementById('fir-canvas');
    if (!c || !FIR._draw) return;
    FIR._draw.ctx.clearRect(0, 0, c.width, c.height);
    FIR._draw.vacio = true;
  },

  usarDibujo: function () {
    var c = document.getElementById('fir-canvas');
    if (!c || !FIR._draw || FIR._draw.vacio) { RCR.toast('Dibuja tu firma primero'); return; }
    /* Recortar el área realmente usada para no dejar mucho espacio en blanco */
    FIR.firmaDataUrl = FIR.recortarCanvas(c);
    RCR.cerrarModal('m-fir-draw');
    FIR.pintarInicio();
  },

  /* Recorta el bounding box no transparente del canvas y devuelve PNG */
  recortarCanvas: function (c) {
    var ctx = c.getContext('2d');
    var w = c.width, h = c.height;
    var d = ctx.getImageData(0, 0, w, h).data;
    var minX = w, minY = h, maxX = 0, maxY = 0, hay = false;
    for (var y = 0; y < h; y++) {
      for (var x = 0; x < w; x++) {
        if (d[(y * w + x) * 4 + 3] > 10) {
          hay = true;
          if (x < minX) minX = x; if (x > maxX) maxX = x;
          if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
      }
    }
    if (!hay) return c.toDataURL('image/png');
    var pad = 8;
    minX = Math.max(0, minX - pad); minY = Math.max(0, minY - pad);
    maxX = Math.min(w, maxX + pad); maxY = Math.min(h, maxY + pad);
    var rec = document.createElement('canvas');
    rec.width = maxX - minX; rec.height = maxY - minY;
    rec.getContext('2d').drawImage(c, minX, minY, rec.width, rec.height, 0, 0, rec.width, rec.height);
    return rec.toDataURL('image/png');
  },

  /* ==========================================================================
     ADJUNTAR EL PDF
     ========================================================================== */
  pedirPdf: function () { document.getElementById('fir-file-pdf').click(); },

  recibirPdf: function (ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = '';
    if (!file) return;
    if (file.type !== 'application/pdf') { RCR.toast('Debe ser un archivo PDF'); return; }
    if (file.size > 25 * 1024 * 1024) { RCR.toast('El PDF es muy pesado (máx. 25 MB)'); return; }
    var reader = new FileReader();
    reader.onload = function () {
      FIR.pdfBytes = reader.result;      // ArrayBuffer
      FIR.pdfNombre = file.name;
      FIR.pdfPeso = (file.size / 1024 / 1024).toFixed(1) + ' MB';
      FIR.pintarInicio();
    };
    reader.onerror = function () { RCR.toast('No se pudo leer el PDF'); };
    reader.readAsArrayBuffer(file);
  },

  /* ==========================================================================
     VISOR — renderiza las páginas y permite colocar firmas
     ========================================================================== */
  abrirVisor: async function () {
    if (!FIR.firmaDataUrl || !FIR.pdfBytes) return;

    RCR.subvista({
      titulo: 'Colocar firma',
      sinBarra: true,
      cuerpo: '<div id="fir-visor-wrap">' + RCR.cargando('Abriendo el documento') + '</div>',
      onCerrar: function () { FIR.volverInicio(); }
    });
    var root = document.getElementById('fir-visor-wrap');

    try {
      await RCR.cargarLib(FIR.LIB_PDFJS);
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = FIR.PDFJS_WORKER;

      /* pdf.js consume el ArrayBuffer, así que se le pasa una copia
         y el original se conserva intacto para pdf-lib al final. */
      var copia = FIR.pdfBytes.slice(0);
      FIR.pdfDoc = await window.pdfjsLib.getDocument({ data: copia }).promise;

      FIR.estampas = [];
      FIR.paginas = [];

      root.innerHTML =
        '<div class="fir-visor-layout">' +
          '<aside class="fir-panel">' +
            '<div class="fir-bar">' +
              '<button class="fir-bar-btn" title="Regresar" aria-label="Regresar" onclick="FIR.volverInicio()">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 19l-7-7 7-7"/><path d="M3 12h18"/></svg>' +
              '</button>' +
              '<button class="fir-bar-btn" title="Añadir otra firma" aria-label="Añadir otra firma" onclick="FIR.agregarEstampa(FIR.paginaVisible())">' +
                '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>' +
              '</button>' +
              '<button class="fir-bar-btn" id="fir-btn-firmar" title="Firmar" aria-label="Firmar" onclick="FIR.firmar()">' + ico('edit', 21, 2.2) + '</button>' +
            '</div>' +
            '<div class="fir-minis" id="fir-minis"></div>' +
          '</aside>' +
          '<div class="fir-viewer" id="fir-viewer"></div>' +
        '</div>';

      var viewer = document.getElementById('fir-viewer');
      var minis  = document.getElementById('fir-minis');

      /* Render a buena resolución fija; el ajuste al ancho lo hace el CSS
         (canvas width:100%), así redimensionar la ventana reescala solo. */
      var escala = FIR.ESCALA;

      for (var n = 1; n <= FIR.pdfDoc.numPages; n++) {
        var page = await FIR.pdfDoc.getPage(n);
        var viewport = page.getViewport({ scale: escala });

        var wrap = document.createElement('div');
        wrap.className = 'fir-page-wrap';
        /* proporción de la página para que el alto acompañe al ancho fluido */
        wrap.style.aspectRatio = viewport.width + ' / ' + viewport.height;
        wrap.dataset.pagina = n;

        var canvas = document.createElement('canvas');
        canvas.className = 'fir-page-canvas';
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        wrap.appendChild(canvas);
        viewer.appendChild(wrap);

        await page.render({ canvasContext: canvas.getContext('2d'), viewport: viewport }).promise;

        FIR.paginas.push({ wrap: wrap, ancho: canvas.width, alto: canvas.height, num: n });

        /* Miniatura lateral (clic = salta a esa página) */
        var mini = document.createElement('button');
        mini.className = 'fir-mini';
        mini.dataset.pagina = n;
        mini.title = 'Página ' + n;
        var mc = document.createElement('canvas');
        var mvp = page.getViewport({ scale: 0.5 });
        mc.width = Math.round(mvp.width); mc.height = Math.round(mvp.height);
        await page.render({ canvasContext: mc.getContext('2d'), viewport: mvp }).promise;
        mini.appendChild(mc);
        var lbl = document.createElement('span'); lbl.textContent = n; mini.appendChild(lbl);
        mini.onclick = (function (num) { return function () { FIR.irPagina(num); }; })(n);
        minis.appendChild(mini);
      }
      FIR.marcarMiniActiva(1);

      /* Al hacer scroll, resalta la miniatura de la página visible */
      viewer.addEventListener('scroll', function () {
        if (FIR._scrollTO) return;
        FIR._scrollTO = setTimeout(function () {
          FIR._scrollTO = null;
          FIR.marcarMiniActiva(FIR.paginaVisible());
        }, 120);
      });

      /* Una primera firma lista para arrastrar, en la primera página */
      FIR.agregarEstampa();

    } catch (e) {
      console.error('FIR.abrirVisor:', e);
      RCR.toast('No se pudo abrir el PDF');
      RCR.cerrarSubvista();
      FIR.pintarInicio();
    }
  },

  volverInicio: function () {
    RCR.cerrarSubvista();
    FIR.reset();            // borra firma y documento (no queda cache al volver)
    FIR.pdfFirmado = null;
    FIR.pintarInicio();
  },

  /* Coloca una nueva firma arrastrable en la página visible */
  agregarEstampa: function (paginaNum) {
    if (!FIR.paginas.length) return;
    var pag = FIR.paginas[Math.max(0, Math.min(FIR.paginas.length - 1, (paginaNum || 1) - 1))];

    /* Tamaño inicial proporcional a la firma, ~28% del ancho de la página */
    var img = new Image();
    img.src = FIR.firmaDataUrl;
    var ratio = (img.width && img.height) ? (img.width / img.height) : 3;

    var wRel = 0.28;
    var wPx = pag.ancho * wRel;
    var hPx = wPx / ratio;
    var hRel = hPx / pag.alto;
    var xRel = 0.1, yRel = 0.1;

    var id = ++FIR.seq;
    var el = document.createElement('div');
    el.className = 'fir-stamp';
    el.dataset.id = id;
    el.style.width = (wRel * 100) + '%';
    el.style.height = (hRel * 100) + '%';
    el.style.left = (xRel * 100) + '%';
    el.style.top = (yRel * 100) + '%';
    el.innerHTML =
      '<img src="' + FIR.firmaDataUrl + '" alt="Firma">' +
      '<div class="fir-stamp-del" title="Quitar" onclick="FIR.quitarEstampa(' + id + ')">' + ico('x', 13) + '</div>' +
      '<div class="fir-stamp-resize" title="Redimensionar">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M4 20 L20 4 M20 4 L13 4 M20 4 L20 11 M4 20 L4 13 M4 20 L11 20"/></svg>' +
      '</div>';
    pag.wrap.appendChild(el);

    var st = { id: id, el: el, pagina: pag.num, xRel: xRel, yRel: yRel, wRel: wRel, hRel: hRel };
    FIR.estampas.push(st);
    FIR.hacerArrastrable(st);
  },

  quitarEstampa: function (id) {
    var i = FIR.estampas.findIndex(function (s) { return s.id === id; });
    if (i < 0) return;
    FIR.estampas[i].el.remove();
    FIR.estampas.splice(i, 1);
  },

  /* Salta a una página (scroll) y la marca activa en el panel de miniaturas */
  irPagina: function (num) {
    var pag = FIR.paginas.find(function (p) { return p.num === num; });
    if (!pag) return;
    pag.wrap.scrollIntoView({ behavior: 'smooth', block: 'start' });
    FIR.marcarMiniActiva(num);
  },

  /* Devuelve el número de la página más visible en el viewer */
  paginaVisible: function () {
    var viewer = document.getElementById('fir-viewer');
    if (!viewer || !FIR.paginas.length) return 1;
    var vr = viewer.getBoundingClientRect();
    var centro = vr.top + vr.height / 2;
    var mejor = FIR.paginas[0].num, minDist = Infinity;
    FIR.paginas.forEach(function (p) {
      var r = p.wrap.getBoundingClientRect();
      var c = r.top + r.height / 2;
      var d = Math.abs(c - centro);
      if (d < minDist) { minDist = d; mejor = p.num; }
    });
    return mejor;
  },

  marcarMiniActiva: function (num) {
    var minis = document.querySelectorAll('.fir-mini');
    minis.forEach(function (m) {
      m.classList.toggle('activa', Number(m.dataset.pagina) === num);
    });
  },

  /* Arrastre y redimensión de una estampa, en coordenadas relativas a su página */
  hacerArrastrable: function (st) {
    var el = st.el;
    var resize = el.querySelector('.fir-stamp-resize');

    function pagInfo() {
      var pag = FIR.paginas.find(function (p) { return p.num === st.pagina; });
      return pag;
    }
    function punto(e) {
      var t = e.touches && e.touches[0];
      return { x: t ? t.clientX : e.clientX, y: t ? t.clientY : e.clientY };
    }

    /* Mover: durante el arrastre la estampa pasa a position:fixed sobre todo,
       así puede cruzar de una página a otra y funciona aunque haya scroll.
       Al soltar, se calcula sobre qué página cayó y se reinserta ahí. */
    function iniMover(e) {
      if (e.target === resize || e.target.closest('.fir-stamp-del')) return;
      e.preventDefault();

      var er = el.getBoundingClientRect();
      var p = punto(e);
      var offX = p.x - er.left;         // desfase del cursor dentro de la estampa
      var offY = p.y - er.top;
      var w = er.width, h = er.height;

      /* Sacar del flujo: fija en pantalla, siguiendo el cursor */
      el.classList.add('arrastrando');
      el.style.position = 'fixed';
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      el.style.left = er.left + 'px';
      el.style.top = er.top + 'px';

      function mover(ev) {
        ev.preventDefault();
        var q = punto(ev);
        el.style.left = (q.x - offX) + 'px';
        el.style.top = (q.y - offY) + 'px';
      }
      function soltar() {
        document.removeEventListener('mousemove', mover);
        document.removeEventListener('mouseup', soltar);
        document.removeEventListener('touchmove', mover);
        document.removeEventListener('touchend', soltar);

        var r2 = el.getBoundingClientRect();
        var cx = r2.left + r2.width / 2, cy = r2.top + r2.height / 2;

        /* Página bajo el centro; si ninguna, se queda en la actual */
        var destino = FIR.paginas.find(function (pp) {
          var r = pp.wrap.getBoundingClientRect();
          return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
        }) || FIR.paginas.find(function (pp) { return pp.num === st.pagina; });

        /* Volver a coordenadas relativas de la página destino */
        var pr = destino.wrap.getBoundingClientRect();
        st.pagina = destino.num;
        st.wRel = w / pr.width;
        st.hRel = h / pr.height;
        st.xRel = Math.max(0, Math.min(1 - st.wRel, (r2.left - pr.left) / pr.width));
        st.yRel = Math.max(0, Math.min(1 - st.hRel, (r2.top - pr.top) / pr.height));

        el.classList.remove('arrastrando');
        el.style.position = 'absolute';
        el.style.width = (st.wRel * 100) + '%';
        el.style.height = (st.hRel * 100) + '%';
        el.style.left = (st.xRel * 100) + '%';
        el.style.top = (st.yRel * 100) + '%';
        destino.wrap.appendChild(el);
        FIR.marcarMiniActiva(destino.num);
      }
      document.addEventListener('mousemove', mover);
      document.addEventListener('mouseup', soltar);
      document.addEventListener('touchmove', mover, { passive: false });
      document.addEventListener('touchend', soltar);
    }

    /* Redimensionar (mantiene proporción) */
    function iniResize(e) {
      e.preventDefault();
      e.stopPropagation();
      var pag = pagInfo(); if (!pag) return;
      var rect = pag.wrap.getBoundingClientRect();
      var ratio = st.wRel / st.hRel;

      function mover(ev) {
        ev.preventDefault();
        var q = punto(ev);
        var nw = (q.x - (rect.left + st.xRel * rect.width)) / rect.width;
        nw = Math.max(0.06, Math.min(1 - st.xRel, nw));
        var nh = (nw / ratio) * (rect.width / rect.height);
        if (st.yRel + nh > 1) { nh = 1 - st.yRel; nw = nh * ratio * (rect.height / rect.width); }
        st.wRel = nw; st.hRel = nh;
        el.style.width = (nw * 100) + '%';
        el.style.height = (nh * 100) + '%';
      }
      function soltar() {
        document.removeEventListener('mousemove', mover);
        document.removeEventListener('mouseup', soltar);
        document.removeEventListener('touchmove', mover);
        document.removeEventListener('touchend', soltar);
      }
      document.addEventListener('mousemove', mover);
      document.addEventListener('mouseup', soltar);
      document.addEventListener('touchmove', mover, { passive: false });
      document.addEventListener('touchend', soltar);
    }

    el.addEventListener('mousedown', iniMover);
    el.addEventListener('touchstart', iniMover, { passive: false });
    resize.addEventListener('mousedown', iniResize);
    resize.addEventListener('touchstart', iniResize, { passive: false });
  },

  /* ==========================================================================
     FIRMAR — estampa las firmas en el PDF con pdf-lib
     ========================================================================== */
  firmar: async function () {
    if (FIR.generando) return;
    if (!FIR.estampas.length) { RCR.toast('Coloca al menos una firma'); return; }

    FIR.generando = true;
    var btn = document.getElementById('fir-btn-firmar');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

    try {
      await RCR.cargarLib(FIR.LIB_PDFLIB);
      var PDFLib = window.PDFLib;

      var pdfDoc = await PDFLib.PDFDocument.load(FIR.pdfBytes.slice(0));
      var paginasPdf = pdfDoc.getPages();

      /* Incrustar la firma una sola vez y reutilizarla */
      var pngBytes = FIR.dataUrlABytes(FIR.firmaDataUrl);
      var firmaImg = await pdfDoc.embedPng(pngBytes);

      FIR.estampas.forEach(function (st) {
        var page = paginasPdf[st.pagina - 1];
        if (!page) return;
        var pw = page.getWidth();
        var ph = page.getHeight();
        /* Coordenadas relativas -> puntos PDF. El origen del PDF está
           abajo-izquierda, por eso se invierte la Y. */
        var w = st.wRel * pw;
        var h = st.hRel * ph;
        var x = st.xRel * pw;
        var y = ph - (st.yRel * ph) - h;
        page.drawImage(firmaImg, { x: x, y: y, width: w, height: h });
      });

      var bytes = await pdfDoc.save();
      FIR.pdfFirmado = new Blob([bytes], { type: 'application/pdf' });
      RCR.cerrarSubvista();
      FIR.pintarListo();

    } catch (e) {
      console.error('FIR.firmar:', e);
      RCR.toast('No se pudo firmar el PDF');
      if (btn) { btn.disabled = false; btn.innerHTML = ico('check', 15) + 'Firmar'; }
    }
    FIR.generando = false;
  },

  dataUrlABytes: function (dataUrl) {
    var b64 = dataUrl.split(',')[1];
    var bin = atob(b64);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  },

  /* ==========================================================================
     ESTADO FINAL
     ========================================================================== */
  pintarListo: function () {
    var root = document.getElementById('fir-root');
    root.innerHTML =
      '<div class="fir-done">' +
        '<div class="fir-done-ico">' + ico('check', 30) + '</div>' +
        '<h3>Listo, firma colocada</h3>' +
        '<p>Tu documento firmado está listo para descargar. No se guardó ninguna copia.</p>' +
        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap">' +
          '<button class="btn btn-glass" onclick="FIR.volverInicio()">' + ico('chevronLeft', 15) + 'Colocar otra firma</button>' +
          '<button class="btn btn-primary" onclick="FIR.descargar()">' + ico('download', 16) + 'Descargar PDF</button>' +
        '</div>' +
      '</div>';
  },

  descargar: function () {
    if (!FIR.pdfFirmado) return;
    var base = FIR.pdfNombre.replace(/\.pdf$/i, '');
    var nombre = base + ' - firmado.pdf';
    var url = URL.createObjectURL(FIR.pdfFirmado);
    var a = document.createElement('a');
    a.href = url; a.download = nombre;
    document.body.appendChild(a); a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
    RCR.toast('PDF descargado');
  }
};

window.FIR = FIR;

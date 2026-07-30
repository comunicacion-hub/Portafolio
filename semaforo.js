/* ==========================================================================
   Mi RCR — semaforo.js
   Semáforo de Bienestar: un registro mensual por colaborador.
   Mantiene la estructura de la colección "Semáforo" que ya existe.
   ========================================================================== */

window.RCR = window.RCR || { modulos: {} };

RCR.modulos.semaforo = {
  id: 'semaforo',
  titulo: 'Semáforo',
  icono: 'semaforo',
  enNav: true,
  fab: { icono: 'plus', label: 'Nuevo registro', accion: function () { SEM.abrirForm(); } },

  mount: function (root) {
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Mis registros</div>' +
          '<div class="section-sub">Cómo te has sentido mes a mes</div>' +
        '</div>' +
        '<div class="count-badge" id="sem-count">0</div>' +
      '</div>' +
      '<div id="sem-list"></div>';
    SEM.cargar();
  },

  onShow: function () { if (SEM.datos.length) SEM.render(); }
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

  CAMPO_TEXTO: '¿Cómo te sentiste este mes? ',   // ojo: la clave real lleva espacio final

  MESES: ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
          'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],

  datos: [],
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
  orden: function (mesTxt) {
    var t = SEM.fmtMes(mesTxt);
    if (!t) return 0;
    var p = t.split(' ');
    var i = SEM.MESES.findIndex(function (m) {
      return m.toLowerCase() === String(p[0] || '').toLowerCase();
    });
    var anio = parseInt(p[1], 10) || 0;
    return anio * 100 + (i + 1);
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

  /* ── Render ───────────────────────────────────────────────────────────── */
  render: function () {
    var list = document.getElementById('sem-list');
    var cnt  = document.getElementById('sem-count');
    if (cnt) cnt.textContent = SEM.datos.length;

    if (!SEM.datos.length) {
      list.innerHTML = RCR.vacio('semaforo', 'Todavía no tienes registros',
        'Toca + para contar cómo te fue este mes.');
      return;
    }

    list.innerHTML = SEM.datos.map(function (r) {
      var mes    = SEM.fmtMes(r.Mes) || '—';
      var partes = mes.split(' ');
      var corto  = (partes[0] || '').substring(0, 3).toUpperCase();
      var anio   = partes[1] || '';

      var chips = SEM.CAMPOS.map(function (c) {
        var v = r[c.label];
        if (!v) return '';
        var o = SEM.OPCIONES.find(function (x) { return x.val === v; });
        var cls = o ? o.color : 'neutro';
        return '<span class="chip ' + cls + '"><span class="chip-dot"></span>' +
               RCR.esc(c.corto) + ': ' + RCR.esc(v) + '</span>';
      }).join('');

      var texto = r[SEM.CAMPO_TEXTO] || r['¿Cómo te sentiste este mes?'] || '';

      return '' +
      '<div class="card">' +
        '<div class="card-top">' +
          '<div class="card-info">' +
            '<strong>' + RCR.esc(mes) + '</strong>' +
            '<small>' + RCR.esc(SEM.fechaLegible(r.Fecha)) + '</small>' +
          '</div>' +
          '<div class="card-actions">' +
            '<button class="btn-ico danger" title="Eliminar" aria-label="Eliminar registro de ' + RCR.esc(mes) + '"' +
              ' onclick="SEM.pedirBorrar(\'' + RCR.esc(String(r._docId || '')) + '\')">' + ico('trash', 16) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="chips-row">' + chips + '</div>' +
        (texto ? '<div class="card-note">' + RCR.esc(texto) + '</div>' : '') +
      '</div>';
    }).join('');
  },

  /* La Fecha vino de Sheets con apóstrofo inicial; se limpia solo al mostrar */
  fechaLegible: function (f) {
    if (!f) return '';
    return String(f).replace(/^'/, '');
  },

  /* ── Formulario ───────────────────────────────────────────────────────── */
  abrirForm: function () {
    if (SEM.guardando) return;
    SEM.seleccion = { carga: '', clima: '', emocional: '', liderazgo: '' };

    var hoy  = new Date();
    var mes  = SEM.MESES[hoy.getMonth()] + ' ' + hoy.getFullYear();
    var dd   = String(hoy.getDate()).padStart(2, '0');
    var mm   = String(hoy.getMonth() + 1).padStart(2, '0');
    var fecha = dd + '/' + mm + '/' + hoy.getFullYear();

    var bloques = SEM.CAMPOS.map(function (c) {
      var opts = SEM.OPCIONES.map(function (o) {
        return '<button type="button" class="sema-opt" data-campo="' + c.key + '"' +
               ' data-val="' + RCR.esc(o.val) + '" data-color="' + o.color + '" aria-pressed="false"' +
               ' onclick="SEM.elegir(this,\'' + c.key + '\',\'' + o.color + '\')">' +
                 '<span class="sema-opt-dot"></span>' +
                 '<span class="sema-opt-label">' + RCR.esc(o.val) + '</span>' +
               '</button>';
      }).join('');
      return '<div class="form-grp">' +
               '<label class="form-lbl">' + RCR.esc(c.label) + '</label>' +
               '<div class="sema-options">' + opts + '</div>' +
             '</div>';
    }).join('');

    RCR.modal({
      id: 'm-sem',
      titulo: 'Registro de ' + mes,
      sub: RCR.esc(RCR.user.nombre),
      cuerpo:
        '<input type="hidden" id="sem-mes" value="' + RCR.esc(mes) + '">' +
        '<input type="hidden" id="sem-fecha" value="' + RCR.esc(fecha) + '">' +
        '<div class="form-grp">' +
          '<label class="form-lbl">Fecha del registro</label>' +
          '<div class="form-static">' + RCR.esc(fecha) + '</div>' +
        '</div>' +
        bloques +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="sem-texto">¿Cómo te sentiste este mes? <span class="opt">(opcional)</span></label>' +
          '<textarea class="form-inp" id="sem-texto" maxlength="500" placeholder="Cuéntanos cómo fue tu mes"></textarea>' +
        '</div>',
      acciones:
        '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-sem\')">Cancelar</button>' +
        '<button class="btn btn-primary" id="sem-save" onclick="SEM.guardar()">Guardar</button>'
    });
  },

  elegir: function (btn, campo, color) {
    document.querySelectorAll('[data-campo="' + campo + '"]').forEach(function (b) {
      b.className = 'sema-opt';
      b.setAttribute('aria-pressed', 'false');
    });
    btn.classList.add('selected-' + color);
    btn.setAttribute('aria-pressed', 'true');
    SEM.seleccion[campo] = btn.dataset.val;
  },

  /* ── Guardar ──────────────────────────────────────────────────────────── */
  guardar: async function () {
    if (SEM.guardando) return;

    var falta = SEM.CAMPOS.find(function (c) { return !SEM.seleccion[c.key]; });
    if (falta) { RCR.toast('Falta responder: ' + falta.label); return; }

    var mes = document.getElementById('sem-mes').value;
    if (SEM.datos.some(function (r) { return SEM.fmtMes(r.Mes) === mes; })) {
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
      texto: 'Se borra tu semáforo de ' + RCR.esc(SEM.fmtMes(r && r.Mes) || 'este mes') + '. No se puede deshacer.',
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

/* ==========================================================================
   Mi RCR — bienestar.js
   Perfil "bienestar": gestión de bienestar del equipo, portado desde la app
   Bienestar360. Secciones: Colaboradores, Seguimiento y Semáforo (consolidado).
   No incluye el dashboard de Inicio ni la sección de Accesos/links.

   Colecciones Firestore (proyecto redes-con-rostro):
     Colaboradores · Seguimiento · Semáforo

   ETAPA 2: "Colaboradores" ya es funcional (lista, filtros, alta/edición,
   ficha, eliminar y foto en Drive). Seguimiento y Semáforo siguen como
   marcador de posición hasta su etapa. El PDF de ficha/consolidado queda
   para una sub-etapa (2b).
   ========================================================================== */

window.RCR = window.RCR || { modulos: {} };

/* Vista provisional mientras se porta cada sección */
RCR._bienestarProximamente = function (root, titulo, sub) {
  root.innerHTML =
    '<div class="section-header">' +
      '<div>' +
        '<div class="section-title">' + RCR.esc(titulo) + '</div>' +
        '<div class="section-sub">' + RCR.esc(sub) + '</div>' +
      '</div>' +
    '</div>' +
    RCR.vacio('tools', 'En construcción',
      'Esta sección se habilitará en una próxima etapa.');
};

/* ==========================================================================
   COLABORADORES
   ========================================================================== */
RCR.modulos.colaboradores = {
  id: 'colaboradores',
  titulo: 'Colaboradores',
  icono: 'users',
  workspace: 'bienestar',
  enNav: true,
  fab: { icono: 'plus', label: 'Nuevo colaborador', accion: function () { COL.abrirForm(null); } },
  mount: function (root) { COL.mount(root); },
  onShow: function () { if (COL.datos.length) COL.render(); }
};

var COL = {
  COL_NOMBRE: 'Colaboradores',
  /* Carpeta de Drive donde viven las fotos (misma que Bienestar360) */
  DRIVE_FOLDER_ID: '17DkSutFnoXTg7NcYjLEHdbqMuRLN8Erd',

  datos: [],
  guardando: false,
  borrando: false,
  pendienteBorrar: null,

  /* Estado de la foto en el formulario abierto */
  foto: { file: null, actual: '', quitar: false, nombre: '' },

  /* Campos del formulario (además del nombre y la foto, que son fijos) */
  CAMPOS: [
    { k: 'Cargo', label: 'Cargo', tipo: 'select',
      ops: ['Coordinador', 'Gestor de Proyectos', 'Directora/Director', 'Socio', 'Profesional de la Salud', 'Otros'] },
    { k: 'Programa/Proyecto', label: 'Programa/Proyecto', tipo: 'select',
      ops: ['General', 'ReCircula', 'Vidrio Mejor Planeta', 'Juntos Por La Vida', 'Dirección Creativa', 'Contabilidad y Transparencia', 'Bienestar Organizacional', 'Otros'] },
    { k: 'Fecha de nacimiento', label: 'Fecha de nacimiento', tipo: 'date' },
    { k: 'Fecha de inicio', label: 'Fecha de inicio', tipo: 'date' },
    { k: 'Fecha de finalización', label: 'Fecha de finalización', tipo: 'date' },
    { k: 'Documento de identidad', label: 'Documento de identidad', tipo: 'text', ph: 'Ej. 0912345678' },
    { k: 'Teléfono principal', label: 'Teléfono principal', tipo: 'text', ph: 'Ej. 0987654321' },
    { k: 'Teléfono secundario', label: 'Teléfono secundario', tipo: 'text', ph: 'Opcional' },
    { k: 'Correo de Redes Con Rostro', label: 'Correo de Redes Con Rostro', tipo: 'email', ph: 'nombre@redesconrostro.org' },
    { k: 'Correo personal', label: 'Correo personal', tipo: 'email', ph: 'correo@gmail.com' },
    { k: 'Domicilio', label: 'Domicilio', tipo: 'text', ph: 'Ciudad, barrio' },
    { k: 'Estado', label: 'Estado', tipo: 'select', ops: ['Activo', 'Inactivo'] },
    { k: 'Talla de chaleco', label: 'Talla de chaleco', tipo: 'select', ops: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
    { k: 'Talla de camiseta', label: 'Talla de camiseta', tipo: 'select', ops: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] }
  ],

  /* Campos que se muestran en la ficha de detalle (etiqueta → clave) */
  FICHA: [
    ['Correo RCR', 'Correo de Redes Con Rostro'],
    ['Correo personal', 'Correo personal'],
    ['Teléfono principal', 'Teléfono principal'],
    ['Teléfono secundario', 'Teléfono secundario'],
    ['Documento de identidad', 'Documento de identidad'],
    ['Domicilio', 'Domicilio'],
    ['Fecha de nacimiento', 'Fecha de nacimiento'],
    ['Fecha de inicio', 'Fecha de inicio'],
    ['Fecha de finalización', 'Fecha de finalización'],
    ['Estado', 'Estado'],
    ['Talla de chaleco', 'Talla de chaleco'],
    ['Talla de camiseta', 'Talla de camiseta']
  ],

  /* Gradiente determinístico por nombre (mismo color para la misma persona) */
  grad: function (nombre) {
    var gs = [
      'linear-gradient(135deg,#33A8DE,#506CFF)',
      'linear-gradient(135deg,#18AE97,#0BC3FF)',
      'linear-gradient(135deg,#F5AD21,#9FDA60)',
      'linear-gradient(135deg,#F82D72,#FF85FF)',
      'linear-gradient(135deg,#FF751F,#FF376F)'
    ];
    var s = String(nombre || '').trim().toLowerCase(), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return gs[h % gs.length];
  },

  avatar: function (c, cls) {
    var n = c.Colaborador || '', ini = RCR.iniciales(n), g = COL.grad(n), foto = c.Foto || '';
    if (foto) {
      return '<div class="' + cls + '" style="background:' + g + '">' +
               '<img src="' + RCR.esc(foto) + '" alt="" ' +
               'onerror="this.parentElement.textContent=\'' + RCR.esc(ini) + '\'"></div>';
    }
    return '<div class="' + cls + '" style="background:' + g + '">' + RCR.esc(ini) + '</div>';
  },

  /* ── Montaje ───────────────────────────────────────────────────────────── */
  mount: function (root) {
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Colaboradores</div>' +
          '<div class="section-sub" id="col-sub">Cargando…</div>' +
        '</div>' +
        '<div class="count-badge" id="col-count">0</div>' +
      '</div>' +
      '<div class="col-filtros">' +
        '<input class="form-inp col-buscar" id="col-f-nombre" type="search" placeholder="Buscar por nombre…" oninput="COL.render()">' +
        '<select class="form-inp col-sel" id="col-f-cargo" onchange="COL.render()"><option value="">Cargo</option></select>' +
        '<select class="form-inp col-sel" id="col-f-programa" onchange="COL.render()"><option value="">Programa</option></select>' +
        '<select class="form-inp col-sel" id="col-f-estado" onchange="COL.render()"><option value="">Estado</option></select>' +
      '</div>' +
      '<div id="col-list">' + RCR.cargando('Cargando colaboradores') + '</div>';
    COL.cargar();
  },

  cargar: async function () {
    try {
      var snap = await RCR.db.collection(COL.COL_NOMBRE).get();
      COL.datos = snap.docs.map(function (d) {
        return Object.assign({ _docId: d.id }, d.data());
      }).sort(function (a, b) {
        return String(a.Colaborador || '').localeCompare(String(b.Colaborador || ''), 'es');
      });
      COL.poblarFiltros();
      COL.render();
    } catch (e) {
      console.error('COL.cargar:', e);
      var list = document.getElementById('col-list');
      if (list) list.innerHTML = RCR.vacio('alert', 'No se pudo cargar la lista',
        'Revisa tu conexión y vuelve a intentar.');
    }
  },

  poblarFiltros: function () {
    var set = function (id, valores, etiqueta) {
      var sel = document.getElementById(id);
      if (!sel) return;
      var actual = sel.value;
      var uniq = valores.filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; })
        .sort(function (a, b) { return String(a).localeCompare(String(b), 'es'); });
      sel.innerHTML = '<option value="">' + etiqueta + '</option>' +
        uniq.map(function (v) { return '<option>' + RCR.esc(v) + '</option>'; }).join('');
      if (uniq.indexOf(actual) >= 0) sel.value = actual;
    };
    set('col-f-cargo', COL.datos.map(function (c) { return c.Cargo; }), 'Cargo');
    set('col-f-programa', COL.datos.map(function (c) { return c['Programa/Proyecto']; }), 'Programa');
    set('col-f-estado', COL.datos.map(function (c) { return c.Estado || 'Activo'; }), 'Estado');
  },

  render: function () {
    var val = function (id) { var el = document.getElementById(id); return el ? el.value : ''; };
    var q = val('col-f-nombre').toLowerCase().trim();
    var fc = val('col-f-cargo'), fp = val('col-f-programa'), fe = val('col-f-estado');

    var d = COL.datos.filter(function (c) {
      if (q && String(c.Colaborador || '').toLowerCase().indexOf(q) < 0) return false;
      if (fc && c.Cargo !== fc) return false;
      if (fp && c['Programa/Proyecto'] !== fp) return false;
      if (fe && (c.Estado || 'Activo') !== fe) return false;
      return true;
    });

    var activos = COL.datos.filter(function (c) { return (c.Estado || 'Activo') === 'Activo'; }).length;
    var sub = document.getElementById('col-sub');
    if (sub) sub.textContent = activos + ' activos · ' + (COL.datos.length - activos) + ' inactivos';
    var cnt = document.getElementById('col-count');
    if (cnt) cnt.textContent = COL.datos.length;

    var list = document.getElementById('col-list');
    if (!list) return;

    if (!d.length) {
      list.innerHTML = RCR.vacio('users',
        COL.datos.length ? 'Sin resultados' : 'Aún no hay colaboradores',
        COL.datos.length ? 'Prueba con otros filtros.' : 'Toca + para registrar al primero.');
      return;
    }

    list.innerHTML = d.map(function (c) {
      var id = c._docId;
      var activo = (c.Estado || 'Activo') === 'Activo';
      var cargo = c.Cargo || '—', prog = c['Programa/Proyecto'] || '—';
      return '' +
      '<div class="card col-card" onclick="COL.abrirFicha(\'' + id + '\')">' +
        '<div class="card-top">' +
          COL.avatar(c, 'col-foto') +
          '<div class="card-info">' +
            '<strong>' + RCR.esc(c.Colaborador || '(sin nombre)') + '</strong>' +
            '<small>' + RCR.esc(cargo) + ' · ' + RCR.esc(prog) + '</small>' +
          '</div>' +
          '<div class="card-actions" onclick="event.stopPropagation();">' +
            '<button class="btn-ico" title="Editar" onclick="COL.abrirForm(\'' + id + '\')">' + ico('edit', 16) + '</button>' +
            '<button class="btn-ico danger" title="Eliminar" onclick="COL.pedirBorrar(\'' + id + '\')">' + ico('trash', 16) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="chips-row">' +
          '<span class="chip ' + (activo ? 'verde' : 'rojo') + '">' +
            '<span class="chip-dot"></span>' + (activo ? 'Activo' : 'Inactivo') +
          '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  },

  /* ── Ficha de detalle ──────────────────────────────────────────────────── */
  abrirFicha: function (docId) {
    var c = COL.datos.find(function (x) { return x._docId === docId; });
    if (!c) return;

    var fields = COL.FICHA.map(function (p) {
      var v = c[p[1]];
      if (!v) return '';
      return '<div class="ficha-blk"><div class="ficha-lbl">' + RCR.esc(p[0]) + '</div>' +
             '<div class="ficha-val">' + RCR.esc(v) + '</div></div>';
    }).filter(Boolean).join('');

    RCR.modal({
      id: 'm-col-ficha',
      titulo: 'Ficha del colaborador',
      cuerpo:
        '<div class="ficha-head">' +
          COL.avatar(c, 'col-foto-lg') +
          '<div>' +
            '<div class="ficha-nombre">' + RCR.esc(c.Colaborador || '—') + '</div>' +
            '<div class="ficha-meta">' + RCR.esc((c.Cargo || '') + (c['Programa/Proyecto'] ? ' · ' + c['Programa/Proyecto'] : '')) + '</div>' +
          '</div>' +
        '</div>' +
        (fields ? '<div class="ficha-grid">' + fields + '</div>'
                : '<div class="section-sub" style="margin-top:12px;">Sin datos adicionales registrados.</div>'),
      acciones:
        '<button class="btn btn-danger" onclick="COL.pedirBorrar(\'' + docId + '\', true)">Eliminar</button>' +
        '<button class="btn btn-primary" onclick="RCR.cerrarModal(\'m-col-ficha\'); COL.abrirForm(\'' + docId + '\')">Editar</button>'
    });
  },

  /* ── Formulario (alta / edición) ───────────────────────────────────────── */
  campoHtml: function (f, val) {
    val = val || '';
    var inner;
    if (f.tipo === 'select') {
      inner = '<select class="form-inp" data-k="' + RCR.esc(f.k) + '">' +
        '<option value="">Seleccionar…</option>' +
        f.ops.map(function (o) {
          return '<option' + (o === val ? ' selected' : '') + '>' + RCR.esc(o) + '</option>';
        }).join('') + '</select>';
    } else {
      var type = f.tipo === 'date' ? 'date' : (f.tipo === 'email' ? 'email' : 'text');
      inner = '<input class="form-inp" type="' + type + '" data-k="' + RCR.esc(f.k) + '"' +
        ' value="' + RCR.esc(val) + '"' + (f.ph ? ' placeholder="' + RCR.esc(f.ph) + '"' : '') + '>';
    }
    return '<div class="form-grp"><label class="form-lbl">' + RCR.esc(f.label) + '</label>' + inner + '</div>';
  },

  abrirForm: function (docId) {
    RCR.cerrarModal('m-col-ficha');
    var c = docId ? COL.datos.find(function (x) { return x._docId === docId; }) : null;
    var nombre = c ? (c.Colaborador || '') : '';
    var fotoActual = c ? (c.Foto || '') : '';

    COL.foto = { file: null, actual: fotoActual, quitar: false, nombre: nombre };

    var previewInner = fotoActual
      ? '<img src="' + RCR.esc(fotoActual) + '" alt="">'
      : RCR.esc(RCR.iniciales(nombre) || '?');

    RCR.modal({
      id: 'm-col-form',
      persistente: true,
      titulo: c ? 'Editar colaborador' : 'Nuevo colaborador',
      sub: 'Completa la información del integrante del equipo',
      cuerpo:
        '<div class="col-foto-fila">' +
          '<div class="col-foto-lg" id="col-foto-prev" style="background:' + COL.grad(nombre) + '">' + previewInner + '</div>' +
          '<div>' +
            '<label class="col-foto-pick">' + ico('image', 15) + ' Seleccionar foto' +
              '<input type="file" id="col-foto-input" accept="image/jpeg,image/png" style="display:none" onchange="COL.previewFoto(this)">' +
            '</label>' +
            '<button type="button" class="btn btn-glass" id="col-foto-del" style="margin-left:8px;' + (fotoActual ? '' : 'display:none;') + '" onclick="COL.quitarFoto()">Quitar</button>' +
            '<div class="form-help" style="margin-top:5px;">JPG o PNG · opcional</div>' +
            '<div id="col-foto-status" style="font-size:12px;margin-top:4px;"></div>' +
          '</div>' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl">Nombre completo *</label>' +
          '<input class="form-inp" id="col-nombre" value="' + RCR.esc(nombre) + '" placeholder="Ej. Laura Pérez" oninput="COL.syncIniciales(this.value)">' +
        '</div>' +
        '<div class="form-grid-2">' +
          COL.CAMPOS.map(function (f) { return COL.campoHtml(f, c ? c[f.k] : ''); }).join('') +
        '</div>',
      acciones:
        '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-col-form\')">Cancelar</button>' +
        '<button class="btn btn-primary" id="col-save" onclick="COL.guardar(' + (docId ? '\'' + docId + '\'' : 'null') + ')">Guardar</button>'
    });
  },

  syncIniciales: function (nombre) {
    var prev = document.getElementById('col-foto-prev');
    if (!prev || prev.querySelector('img')) { if (prev) prev.style.background = COL.grad(nombre); return; }
    prev.style.background = COL.grad(nombre);
    prev.textContent = RCR.iniciales(nombre) || '?';
  },

  previewFoto: function (input) {
    var file = input.files && input.files[0];
    if (!file) return;
    COL.foto.file = file;
    COL.foto.quitar = false;
    var url = URL.createObjectURL(file);
    var prev = document.getElementById('col-foto-prev');
    if (prev) prev.innerHTML = '<img src="' + url + '" alt="">';
    var del = document.getElementById('col-foto-del');
    if (del) del.style.display = '';
  },

  quitarFoto: function () {
    COL.foto.file = null;
    COL.foto.quitar = true;
    var input = document.getElementById('col-foto-input');
    if (input) input.value = '';
    var prev = document.getElementById('col-foto-prev');
    var nombre = (document.getElementById('col-nombre') || {}).value || COL.foto.nombre;
    if (prev) { prev.style.background = COL.grad(nombre); prev.textContent = RCR.iniciales(nombre) || '?'; }
    var del = document.getElementById('col-foto-del');
    if (del) del.style.display = 'none';
  },

  guardar: async function (docId) {
    if (COL.guardando) return;

    var nombre = (document.getElementById('col-nombre').value || '').trim().replace(/[<>"]/g, '');
    if (!nombre) { RCR.toast('El nombre es obligatorio'); return; }

    var data = { Colaborador: nombre };
    document.querySelectorAll('#m-col-form [data-k]').forEach(function (el) {
      data[el.getAttribute('data-k')] = el.value || '';
    });
    if (!data.Estado) data.Estado = 'Activo';
    if (COL.foto.quitar && !COL.foto.file) data.Foto = '';

    COL.guardando = true;
    var btn = document.getElementById('col-save');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

    try {
      var id = docId;
      if (docId) {
        await RCR.db.collection(COL.COL_NOMBRE).doc(docId).update(data);
      } else {
        var ref = await RCR.db.collection(COL.COL_NOMBRE).add(data);
        id = ref.id;
      }

      /* Foto: subir nueva o borrar la anterior (best-effort, no bloquea el guardado) */
      if (COL.foto.file) {
        var statusEl = document.getElementById('col-foto-status');
        if (statusEl) { statusEl.textContent = 'Subiendo foto…'; statusEl.style.color = 'var(--text-muted)'; }
        var url = await COL.subirFoto(COL.foto.file, nombre);
        if (url) {
          data.Foto = url;
          await RCR.db.collection(COL.COL_NOMBRE).doc(id).update({ Foto: url }).catch(function () {});
        } else if (statusEl) {
          RCR.toast('El colaborador se guardó, pero la foto no se pudo subir');
        }
      } else if (COL.foto.quitar && COL.foto.actual) {
        COL.borrarFotoDrive(nombre);
      }

      /* Actualizar memoria local */
      var completo = Object.assign({ _docId: id }, data);
      var i = COL.datos.findIndex(function (x) { return x._docId === id; });
      if (i >= 0) COL.datos[i] = Object.assign(COL.datos[i], completo);
      else COL.datos.push(completo);
      COL.datos.sort(function (a, b) {
        return String(a.Colaborador || '').localeCompare(String(b.Colaborador || ''), 'es');
      });

      COL.poblarFiltros();
      COL.render();
      RCR.cerrarModal('m-col-form');
      RCR.toast(docId ? 'Colaborador actualizado' : 'Colaborador creado');
    } catch (e) {
      console.error('COL.guardar:', e);
      RCR.toast('No se pudo guardar. Revisa tu conexión.');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; }
    COL.guardando = false;
  },

  /* ── Eliminar ──────────────────────────────────────────────────────────── */
  pedirBorrar: function (docId, desdeFicha) {
    var c = COL.datos.find(function (x) { return x._docId === docId; });
    COL.pendienteBorrar = docId;
    if (desdeFicha) RCR.cerrarModal('m-col-ficha');
    RCR.confirmar({
      titulo: '¿Eliminar el colaborador?',
      texto: (c ? '<strong>' + RCR.esc(c.Colaborador) + '</strong>' : 'Este colaborador') +
             ' se eliminará de la lista. Esta acción no se puede deshacer.',
      label: 'Eliminar',
      onOk: 'COL.borrar()'
    });
  },

  borrar: async function () {
    if (COL.borrando || !COL.pendienteBorrar) return;
    COL.borrando = true;
    var id = COL.pendienteBorrar;
    var btn = document.getElementById('confirm-ok');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    try {
      await RCR.db.collection(COL.COL_NOMBRE).doc(id).delete();
      COL.datos = COL.datos.filter(function (x) { return x._docId !== id; });
      COL.poblarFiltros();
      COL.render();
      RCR.cerrarModal('m-confirm');
      RCR.toast('Colaborador eliminado');
    } catch (e) {
      console.error('COL.borrar:', e);
      RCR.toast('No se pudo eliminar');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = 'Eliminar'; }
    COL.pendienteBorrar = null;
    COL.borrando = false;
  },

  /* ── Foto en Google Drive (misma carpeta y mecánica que Bienestar360) ───── */
  _token: null,
  _tokenExp: 0,

  getToken: function () {
    if (COL._token && Date.now() < COL._tokenExp) return Promise.resolve(COL._token);
    return new Promise(function (resolve) {
      if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) { resolve(null); return; }
      try {
        google.accounts.oauth2.initTokenClient({
          client_id: RCR.G_CLIENT,
          scope: 'https://www.googleapis.com/auth/drive',
          callback: function (r) {
            if (r && r.access_token) { COL._token = r.access_token; COL._tokenExp = Date.now() + 55 * 60 * 1000; }
            resolve((r && r.access_token) || null);
          }
        }).requestAccessToken({ prompt: '' });
      } catch (e) { resolve(null); }
    });
  },

  _norm: function (s) { return String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); },

  subirFoto: async function (file, nombreColab) {
    var token = await COL.getToken();
    if (!token) return null;
    var safe = String(nombreColab).replace(/[^a-zA-Z0-9]/g, '_') + '_foto';
    var colabNorm = COL._norm(nombreColab);
    try {
      /* Borrar fotos anteriores del mismo colaborador en la carpeta */
      var q = "'" + COL.DRIVE_FOLDER_ID + "' in parents and trashed = false";
      var sres = await fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)',
        { headers: { Authorization: 'Bearer ' + token } });
      var sdata = await sres.json();
      if (sdata.files) {
        await Promise.all(sdata.files.filter(function (f) { return COL._norm(f.name).indexOf(colabNorm) === 0; })
          .map(function (f) {
            return fetch('https://www.googleapis.com/drive/v3/files/' + f.id,
              { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
          }));
      }
      /* Subir la nueva */
      var meta = { name: safe, parents: [COL.DRIVE_FOLDER_ID] };
      var form = new FormData();
      form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
      form.append('file', file);
      var ures = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
        { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form });
      var udata = await ures.json();
      if (!udata.id) return null;
      /* Hacerla pública para poder incrustarla */
      await fetch('https://www.googleapis.com/drive/v3/files/' + udata.id + '/permissions',
        { method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: 'reader', type: 'anyone' }) });
      return 'https://drive.google.com/thumbnail?id=' + udata.id + '&sz=w400';
    } catch (e) { return null; }
  },

  borrarFotoDrive: async function (nombreColab) {
    var token = await COL.getToken();
    if (!token) return;
    var colabNorm = COL._norm(nombreColab);
    try {
      var q = "'" + COL.DRIVE_FOLDER_ID + "' in parents and trashed = false";
      var sres = await fetch('https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) + '&fields=files(id,name)',
        { headers: { Authorization: 'Bearer ' + token } });
      var sdata = await sres.json();
      if (sdata.files) {
        sdata.files.filter(function (f) { return COL._norm(f.name).indexOf(colabNorm) === 0; })
          .forEach(function (f) {
            fetch('https://www.googleapis.com/drive/v3/files/' + f.id,
              { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
          });
      }
    } catch (e) {}
  }
};

window.COL = COL;

/* ==========================================================================
   SEGUIMIENTO
   Acompañamiento de bienestar: varios registros por colaborador. Se elige un
   colaborador, se listan sus registros y cada uno abre una ficha con barras de
   escala. (Los dos paneles comparativos de Bienestar360 se adaptan aquí a una
   lista + ficha, más adecuada a móvil.)
   ========================================================================== */
RCR.modulos['seguimiento-bienestar'] = {
  id: 'seguimiento-bienestar',
  titulo: 'Seguimiento',
  icono: 'heart',
  workspace: 'bienestar',
  enNav: true,
  fab: { icono: 'plus', label: 'Nuevo registro', accion: function () { SEG.abrirForm(null); } },
  mount: function (root) { SEG.mount(root); },
  onShow: function () { if (SEG.datos.length) { SEG.poblarColabSel(); SEG.render(); } }
};

var SEG = {
  COL_NOMBRE: 'Seguimiento',
  datos: [],
  _colabNombres: [],
  colabSel: '',
  guardando: false,
  borrando: false,
  pendienteBorrar: null,

  /* Escalas: casi todo es 1–10; estos campos son 1–5 */
  MAX: {
    'Manejo emocional': 5, 'Escucha': 5, 'Empatía': 5, 'Comunicación asertiva': 5,
    'Claridad de la comunicación interna': 5, 'Nivel de interés en contenidos': 5
  },
  scaleMax: function (k) { return SEG.MAX[k] || 10; },

  /* Estructura del formulario (grupos y campos) */
  SECCIONES: [
    { grupo: null, campos: [
      { k: 'Seguimiento', tipo: 'select', ops: ['Primero', 'Segundo', 'Tercero'] }
    ] },
    { grupo: 'Apertura del semestre', campos: [
      { k: '¿Cómo inicias este semestre a nivel personal y laboral?', tipo: 'textarea' },
      { k: 'Asuntos personales / familiares / salud que debamos considerar', tipo: 'textarea' },
      { k: 'Metas laborales', tipo: 'textarea' },
      { k: 'Retos laborales', tipo: 'textarea' }
    ] },
    { grupo: 'Satisfacción laboral', campos: [
      { k: 'Nivel de satisfacción laboral (1–10)', tipo: 'num' },
      { k: '¿Qué está dificultando más tu desempeño actualmente?', tipo: 'textarea' },
      { k: '¿Qué hace que estés en ese número y no más bajo?', tipo: 'textarea' },
      { k: '¿Qué necesitarías para subir 1 punto?', tipo: 'textarea' }
    ] },
    { grupo: 'Dimensiones organizacionales (1–10)', par: true, campos: [
      { k: 'Clima laboral con todo el equipo RCR', tipo: 'num' },
      { k: 'Relación con liderazgo', tipo: 'num' },
      { k: 'Trabajo en equipo con su equipo', tipo: 'num' },
      { k: 'Reconocimiento', tipo: 'num' },
      { k: 'Desarrollo profesional', tipo: 'num' },
      { k: 'Carga laboral', tipo: 'num' },
      { k: 'Autonomía', tipo: 'num' },
      { k: 'Sentido/propósito', tipo: 'num' }
    ] },
    { grupo: null, campos: [
      { k: 'Profundizar solo en la dimensión más baja', tipo: 'textarea' }
    ] },
    { grupo: 'Habilidades blandas (1–5)', par: true, campos: [
      { k: 'Manejo emocional', tipo: 'num' },
      { k: 'Escucha', tipo: 'num' },
      { k: 'Empatía', tipo: 'num' },
      { k: 'Comunicación asertiva', tipo: 'num' }
    ] },
    { grupo: null, campos: [
      { k: '¿Cuál deberías fortalecer este semestre para mejorar tu impacto?', tipo: 'textarea' }
    ] },
    { grupo: 'Comunicación interna', campos: [
      { k: 'Claridad de la comunicación interna', tipo: 'num' },
      { k: 'Nivel de interés en contenidos', tipo: 'num' },
      { k: '¿Revisas canales internos regularmente?', tipo: 'select', ops: ['Sí', 'No'] },
      { k: '¿Qué deberíamos mejorar como equipo en comunicación?', tipo: 'textarea' }
    ] }
  ],

  /* Orden y etiquetas cortas de la ficha de detalle */
  FICHA: [
    { t: 'texto', l: '¿Cómo inicias este semestre?', k: '¿Cómo inicias este semestre a nivel personal y laboral?' },
    { t: 'texto', l: 'Asuntos personales / familiares / salud', k: 'Asuntos personales / familiares / salud que debamos considerar' },
    { t: 'texto', l: 'Metas laborales', k: 'Metas laborales' },
    { t: 'texto', l: 'Retos laborales', k: 'Retos laborales' },
    { t: 'escala', l: 'Satisfacción laboral', k: 'Nivel de satisfacción laboral (1–10)' },
    { t: 'texto', l: '¿Qué está dificultando tu desempeño?', k: '¿Qué está dificultando más tu desempeño actualmente?' },
    { t: 'texto', l: '¿Qué te mantiene en ese número?', k: '¿Qué hace que estés en ese número y no más bajo?' },
    { t: 'texto', l: '¿Qué necesitas para subir 1 punto?', k: '¿Qué necesitarías para subir 1 punto?' },
    { t: 'sep', l: 'Dimensiones organizacionales' },
    { t: 'dim', l: 'Clima laboral con el equipo RCR', k: 'Clima laboral con todo el equipo RCR' },
    { t: 'dim', l: 'Relación con liderazgo', k: 'Relación con liderazgo' },
    { t: 'dim', l: 'Trabajo en equipo', k: 'Trabajo en equipo con su equipo' },
    { t: 'dim', l: 'Reconocimiento', k: 'Reconocimiento' },
    { t: 'dim', l: 'Desarrollo profesional', k: 'Desarrollo profesional' },
    { t: 'dim', l: 'Carga laboral', k: 'Carga laboral' },
    { t: 'dim', l: 'Autonomía', k: 'Autonomía' },
    { t: 'dim', l: 'Sentido/propósito', k: 'Sentido/propósito' },
    { t: 'texto', l: 'Profundizar en la dimensión más baja', k: 'Profundizar solo en la dimensión más baja' },
    { t: 'sep', l: 'Habilidades blandas' },
    { t: 'dim', l: 'Manejo emocional', k: 'Manejo emocional' },
    { t: 'dim', l: 'Escucha', k: 'Escucha' },
    { t: 'dim', l: 'Empatía', k: 'Empatía' },
    { t: 'dim', l: 'Comunicación asertiva', k: 'Comunicación asertiva' },
    { t: 'texto', l: '¿Cuál habilidad fortalecer?', k: '¿Cuál deberías fortalecer este semestre para mejorar tu impacto?' },
    { t: 'sep', l: 'Comunicación interna' },
    { t: 'dim', l: 'Claridad de la comunicación interna', k: 'Claridad de la comunicación interna' },
    { t: 'dim', l: 'Interés en contenidos', k: 'Nivel de interés en contenidos' },
    { t: 'texto', l: '¿Revisas canales internos?', k: '¿Revisas canales internos regularmente?' },
    { t: 'texto', l: '¿Qué mejorar en comunicación?', k: '¿Qué deberíamos mejorar como equipo en comunicación?' }
  ],

  /* ── Fechas (soporta Timestamp de Firestore, objeto plano o texto) ──────── */
  fmtFecha: function (d) {
    if (!d || d === '' || d === 'undefined') return '';
    try {
      if (typeof d.toDate === 'function') return d.toDate().toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
      if (d.seconds != null) return new Date(d.seconds * 1000).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
      var s = String(d).trim();
      var date = new Date(s.indexOf('T') >= 0 ? s : s + 'T12:00:00');
      if (isNaN(date.getTime())) return s;
      return date.toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch (e) { return String(d); }
  },
  fechaInput: function (val) {
    if (!val) return '';
    var d = null;
    if (typeof val.toDate === 'function') d = val.toDate();
    else if (val.seconds != null) d = new Date(val.seconds * 1000);
    else {
      var s = String(val).trim();
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      var p = new Date(s); if (!isNaN(p.getTime())) d = p;
    }
    if (!d || isNaN(d.getTime())) return '';
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },
  hoy: function () {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  },

  nombresColabs: function () {
    if (window.COL && COL.datos && COL.datos.length) {
      return COL.datos.map(function (c) { return c.Colaborador; }).filter(Boolean);
    }
    if (SEG._colabNombres.length) return SEG._colabNombres;
    return SEG.datos.map(function (r) { return r.Colaborador; })
      .filter(Boolean).filter(function (v, i, a) { return a.indexOf(v) === i; })
      .sort(function (a, b) { return String(a).localeCompare(String(b), 'es'); });
  },

  /* ── Montaje ───────────────────────────────────────────────────────────── */
  mount: function (root) {
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Seguimiento</div>' +
          '<div class="section-sub">Acompañamiento de bienestar</div>' +
        '</div>' +
        '<div class="count-badge" id="seg-count">0</div>' +
      '</div>' +
      '<select class="form-inp seg-colab-sel" id="seg-colab-sel" onchange="SEG.onColab()">' +
        '<option value="">Selecciona un colaborador…</option>' +
      '</select>' +
      '<div id="seg-list">' + RCR.cargando('Cargando registros') + '</div>';
    SEG.cargar();
  },

  cargar: async function () {
    try {
      var snap = await RCR.db.collection(SEG.COL_NOMBRE).get();
      SEG.datos = snap.docs.map(function (d) { return Object.assign({ _docId: d.id }, d.data()); });
    } catch (e) {
      console.error('SEG.cargar:', e);
      var list = document.getElementById('seg-list');
      if (list) list.innerHTML = RCR.vacio('alert', 'No se pudieron cargar los registros', 'Revisa tu conexión y vuelve a intentar.');
      return;
    }
    if (!(window.COL && COL.datos && COL.datos.length)) {
      try {
        var cs = await RCR.db.collection('Colaboradores').get();
        SEG._colabNombres = cs.docs.map(function (d) { return d.data().Colaborador; })
          .filter(Boolean).sort(function (a, b) { return String(a).localeCompare(String(b), 'es'); });
      } catch (e) { /* sin colaboradores: se derivan de los registros */ }
    }
    SEG.poblarColabSel();
    SEG.render();
  },

  poblarColabSel: function () {
    var sel = document.getElementById('seg-colab-sel');
    if (!sel) return;
    var actual = SEG.colabSel || sel.value;
    sel.innerHTML = '<option value="">Selecciona un colaborador…</option>' +
      SEG.nombresColabs().map(function (n) { return '<option>' + RCR.esc(n) + '</option>'; }).join('');
    if (actual) sel.value = actual;
  },

  onColab: function () {
    var sel = document.getElementById('seg-colab-sel');
    SEG.colabSel = sel ? sel.value : '';
    SEG.render();
  },

  registrosDe: function (nombre) {
    return SEG.datos.filter(function (r) { return r.Colaborador === nombre; })
      .sort(function (a, b) {
        return String(SEG.fechaInput(b.Fecha)).localeCompare(String(SEG.fechaInput(a.Fecha)));
      });
  },

  render: function () {
    var list = document.getElementById('seg-list');
    if (!list) return;
    var cnt = document.getElementById('seg-count');

    if (!SEG.colabSel) {
      if (cnt) cnt.textContent = SEG.datos.length;
      list.innerHTML = RCR.vacio('heart', 'Selecciona un colaborador', 'Elige a alguien para ver sus registros de bienestar.');
      return;
    }

    var recs = SEG.registrosDe(SEG.colabSel);
    if (cnt) cnt.textContent = recs.length;

    if (!recs.length) {
      list.innerHTML = RCR.vacio('inbox', 'Sin registros', 'Aún no hay registros para ' + RCR.esc(SEG.colabSel) + '. Toca + para crear uno.');
      return;
    }

    list.innerHTML = recs.map(function (r) {
      var id = r._docId;
      var sat = r['Nivel de satisfacción laboral (1–10)'];
      return '' +
      '<div class="card col-card" onclick="SEG.abrirFicha(\'' + id + '\')">' +
        '<div class="card-top">' +
          '<div class="card-badge-soft">' + ico('heart', 20) + '</div>' +
          '<div class="card-info">' +
            '<strong>' + RCR.esc(r.Seguimiento || 'Seguimiento') + '</strong>' +
            '<small>' + RCR.esc(SEG.fmtFecha(r.Fecha) || 'Sin fecha') + '</small>' +
          '</div>' +
          '<div class="card-actions" onclick="event.stopPropagation();">' +
            '<button class="btn-ico" title="Editar" onclick="SEG.abrirForm(\'' + id + '\')">' + ico('edit', 16) + '</button>' +
            '<button class="btn-ico danger" title="Eliminar" onclick="SEG.pedirBorrar(\'' + id + '\')">' + ico('trash', 16) + '</button>' +
          '</div>' +
        '</div>' +
        (sat ? '<div class="chips-row"><span class="chip neutro">Satisfacción ' + RCR.esc(sat) + '/10</span></div>' : '') +
      '</div>';
    }).join('');
  },

  /* ── Ficha de detalle ──────────────────────────────────────────────────── */
  abrirFicha: function (docId) {
    var r = SEG.datos.find(function (x) { return x._docId === docId; });
    if (!r) return;

    var escala = function (l, k) {
      var v = r[k]; if (v === '' || v == null) return '';
      var n = parseFloat(v) || 0, max = SEG.scaleMax(k);
      if (!(n > 0 && n <= max)) return '';
      var pct = Math.max(0, Math.min(100, (n / max) * 100));
      return '<div class="seg-blk"><div class="seg-lbl">' + RCR.esc(l) + '</div>' +
        '<div class="seg-scale-row"><div class="seg-track"><div class="seg-fill" style="width:' + pct + '%"></div></div>' +
        '<div class="seg-num">' + n + '/' + max + '</div></div></div>';
    };
    var texto = function (l, k) {
      var v = r[k]; if (!v) return '';
      return '<div class="seg-blk"><div class="seg-lbl">' + RCR.esc(l) + '</div>' +
        '<div class="seg-val">' + RCR.esc(v) + '</div></div>';
    };

    var html = '', dimBuffer = [];
    var flushDims = function () {
      if (dimBuffer.length) { html += '<div class="seg-dims">' + dimBuffer.join('') + '</div>'; dimBuffer = []; }
    };
    SEG.FICHA.forEach(function (f) {
      if (f.t === 'sep') { flushDims(); html += '<div class="seg-sep">' + RCR.esc(f.l) + '</div>'; return; }
      if (f.t === 'dim') { var e = escala(f.l, f.k); if (e) dimBuffer.push(e); return; }
      flushDims();
      html += (f.t === 'escala') ? escala(f.l, f.k) : texto(f.l, f.k);
    });
    flushDims();

    var colab = (window.COL && COL.datos) ? COL.datos.find(function (c) { return c.Colaborador === r.Colaborador; }) : null;
    var meta = [r.Seguimiento, SEG.fmtFecha(r.Fecha), colab && colab['Programa/Proyecto']].filter(Boolean).join(' · ');

    RCR.modal({
      id: 'm-seg-ficha',
      titulo: r.Colaborador || 'Registro',
      sub: RCR.esc(meta),
      cuerpo: html || '<div class="section-sub" style="margin-top:12px;">Sin datos para este registro.</div>',
      acciones:
        '<button class="btn btn-danger" onclick="SEG.pedirBorrar(\'' + docId + '\', true)">Eliminar</button>' +
        '<button class="btn btn-primary" onclick="RCR.cerrarModal(\'m-seg-ficha\'); SEG.abrirForm(\'' + docId + '\')">Editar</button>'
    });
  },

  /* ── Formulario (alta / edición) ───────────────────────────────────────── */
  campoHtml: function (f, val) {
    val = (val == null) ? '' : val;
    var inner;
    if (f.tipo === 'select') {
      inner = '<select class="form-inp" data-k="' + RCR.esc(f.k) + '"><option value="">Seleccionar…</option>' +
        f.ops.map(function (o) { return '<option' + (String(o) === String(val) ? ' selected' : '') + '>' + RCR.esc(o) + '</option>'; }).join('') +
        '</select>';
    } else if (f.tipo === 'textarea') {
      inner = '<textarea class="form-inp" rows="2" data-k="' + RCR.esc(f.k) + '">' + RCR.esc(val) + '</textarea>';
    } else { /* num */
      var max = SEG.scaleMax(f.k);
      inner = '<input class="form-inp" type="number" min="1" max="' + max + '" data-k="' + RCR.esc(f.k) + '"' +
        ' value="' + RCR.esc(val) + '" placeholder="1-' + max + '">';
    }
    var label = f.k;
    return '<div class="form-grp"><label class="form-lbl">' + RCR.esc(label) + '</label>' + inner + '</div>';
  },

  abrirForm: function (docId) {
    RCR.cerrarModal('m-seg-ficha');
    var r = docId ? SEG.datos.find(function (x) { return x._docId === docId; }) : null;
    var nombres = SEG.nombresColabs();
    var colabActual = r ? (r.Colaborador || '') : (SEG.colabSel || '');

    var opcionesColab = '<option value="">Seleccionar…</option>' +
      nombres.map(function (n) { return '<option' + (n === colabActual ? ' selected' : '') + '>' + RCR.esc(n) + '</option>'; }).join('');

    var secciones = SEG.SECCIONES.map(function (s) {
      var campos = s.campos.map(function (f) { return SEG.campoHtml(f, r ? r[f.k] : ''); }).join('');
      var bloque = s.par ? '<div class="form-grid-2">' + campos + '</div>' : campos;
      return (s.grupo ? '<div class="seg-sep">' + RCR.esc(s.grupo) + '</div>' : '') + bloque;
    }).join('');

    RCR.modal({
      id: 'm-seg-form',
      persistente: true,
      titulo: r ? 'Editar registro' : 'Nuevo registro de bienestar',
      sub: 'Registra el acompañamiento del colaborador',
      cuerpo:
        '<div class="form-grid-2">' +
          '<div class="form-grp"><label class="form-lbl">Colaborador *</label>' +
            '<select class="form-inp" id="seg-f-colab">' + opcionesColab + '</select></div>' +
          '<div class="form-grp"><label class="form-lbl">Fecha *</label>' +
            '<input class="form-inp" type="date" id="seg-f-fecha" value="' + RCR.esc(r ? SEG.fechaInput(r.Fecha) : SEG.hoy()) + '"></div>' +
        '</div>' +
        secciones,
      acciones:
        '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-seg-form\')">Cancelar</button>' +
        '<button class="btn btn-primary" id="seg-save" onclick="SEG.guardar(' + (docId ? '\'' + docId + '\'' : 'null') + ')">Guardar</button>'
    });
  },

  guardar: async function (docId) {
    if (SEG.guardando) return;

    var colab = (document.getElementById('seg-f-colab') || {}).value || '';
    var fecha = (document.getElementById('seg-f-fecha') || {}).value || '';
    if (!colab || !fecha) { RCR.toast('Colaborador y fecha son obligatorios'); return; }

    /* Validar rangos de los campos numéricos */
    var errores = [];
    document.querySelectorAll('#m-seg-form [data-k]').forEach(function (el) {
      if (el.type === 'number' && el.value !== '') {
        var k = el.getAttribute('data-k'), max = SEG.scaleMax(k), n = parseFloat(el.value);
        if (!isFinite(n) || n < 1 || n > max) errores.push(k + ': debe estar entre 1 y ' + max);
      }
    });
    if (errores.length) { RCR.toast(errores[0]); return; }

    var data = { Colaborador: colab, Fecha: fecha };
    document.querySelectorAll('#m-seg-form [data-k]').forEach(function (el) {
      data[el.getAttribute('data-k')] = el.value || '';
    });

    SEG.guardando = true;
    var btn = document.getElementById('seg-save');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

    try {
      var id = docId;
      if (docId) {
        await RCR.db.collection(SEG.COL_NOMBRE).doc(docId).update(data);
      } else {
        var ref = await RCR.db.collection(SEG.COL_NOMBRE).add(data);
        id = ref.id;
      }
      var completo = Object.assign({ _docId: id }, data);
      var i = SEG.datos.findIndex(function (x) { return x._docId === id; });
      if (i >= 0) SEG.datos[i] = Object.assign(SEG.datos[i], completo);
      else SEG.datos.push(completo);

      SEG.colabSel = colab;
      SEG.poblarColabSel();
      SEG.render();
      RCR.cerrarModal('m-seg-form');
      RCR.toast(docId ? 'Registro actualizado' : 'Registro guardado');
    } catch (e) {
      console.error('SEG.guardar:', e);
      RCR.toast('No se pudo guardar. Revisa tu conexión.');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; }
    SEG.guardando = false;
  },

  /* ── Eliminar ──────────────────────────────────────────────────────────── */
  pedirBorrar: function (docId, desdeFicha) {
    var r = SEG.datos.find(function (x) { return x._docId === docId; });
    SEG.pendienteBorrar = docId;
    if (desdeFicha) RCR.cerrarModal('m-seg-ficha');
    RCR.confirmar({
      titulo: '¿Eliminar el registro?',
      texto: 'El registro' + (r && r.Fecha ? ' del ' + RCR.esc(SEG.fmtFecha(r.Fecha)) : '') +
             ' se eliminará. Esta acción no se puede deshacer.',
      label: 'Eliminar',
      onOk: 'SEG.borrar()'
    });
  },

  borrar: async function () {
    if (SEG.borrando || !SEG.pendienteBorrar) return;
    SEG.borrando = true;
    var id = SEG.pendienteBorrar;
    var btn = document.getElementById('confirm-ok');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    try {
      await RCR.db.collection(SEG.COL_NOMBRE).doc(id).delete();
      SEG.datos = SEG.datos.filter(function (x) { return x._docId !== id; });
      SEG.render();
      RCR.cerrarModal('m-confirm');
      RCR.toast('Registro eliminado');
    } catch (e) {
      console.error('SEG.borrar:', e);
      RCR.toast('No se pudo eliminar');
    }
    if (btn) { btn.disabled = false; btn.innerHTML = 'Eliminar'; }
    SEG.pendienteBorrar = null;
    SEG.borrando = false;
  }
};

window.SEG = SEG;

/* ── Semáforo (consolidado del equipo) ──────────────────────────────────── */
RCR.modulos['semaforo-consolidado'] = {
  id: 'semaforo-consolidado',
  titulo: 'Semáforo',
  icono: 'semaforo',
  workspace: 'bienestar',
  enNav: true,
  mount: function (root) {
    RCR._bienestarProximamente(root, 'Semáforo', 'Autopercepción mensual del equipo');
  }
};

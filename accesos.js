/* ==========================================================================
   Mi RCR — accesos.js
   Autenticación (Google OAuth restringido al dominio RCR), sesión, roles
   y administración de usuarios habilitados.
   ========================================================================== */

window.RCR = window.RCR || { modulos: {} };

/* ── Configuración Firebase (proyecto redes-con-rostro) ─────────────────── */
RCR.firebaseConfig = {
  apiKey: "AIzaSyB4-Agk4jG2HFMnvLQyB1q4vapZQ01Bh4o",
  authDomain: "redes-con-rostro.firebaseapp.com",
  projectId: "redes-con-rostro",
  storageBucket: "redes-con-rostro.firebasestorage.app",
  messagingSenderId: "138746747295",
  appId: "1:138746747295:web:1ceb9c60d4a4073e6885aa"
};

RCR.G_CLIENT = '138746747295-auk51cb00qdqchmqhhjql2cbavgcga3i.apps.googleusercontent.com';

/* ── Constantes de acceso ───────────────────────────────────────────────── */
RCR.DOMINIO      = '@redesconrostro.org';
RCR.COL_USUARIOS = 'Usuarios';
RCR.SESSION_KEY  = 'mircr_session';   // clave propia: no choca con rcr_session de ReCircula
RCR.ROLES        = ['Admin', 'Editor', 'Visualizador'];

/* Si es true, solo entran los correos dados de alta en la colección Usuarios.
   Dejarlo en false hasta que la colección esté completa; el filtro de dominio
   sigue activo en ambos casos. */
RCR.EXIGIR_REGISTRO = false;

/* ── Estado global de sesión ────────────────────────────────────────────── */
RCR.user = null;   // { correo, nombre, rol, area, iniciales }
RCR.db   = null;
RCR.auth = null;

/* ==========================================================================
   INICIALIZACIÓN
   ========================================================================== */
RCR.initFirebase = function () {
  if (RCR.db) return;
  firebase.initializeApp(RCR.firebaseConfig);
  RCR.db   = firebase.firestore();
  RCR.auth = firebase.auth();
  RCR.auth.setPersistence(firebase.auth.Auth.Persistence.SESSION).catch(function () {});
};

/* ==========================================================================
   LOGIN CON GOOGLE (GSI)
   ========================================================================== */
RCR.gsiListo = false;

RCR.initLogin = function () {
  if (RCR.gsiListo) return true;

  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    RCR.loginError('No se pudo cargar el acceso con Google. Recarga la página.');
    return false;
  }

  RCR.gsiListo = true;
  google.accounts.id.initialize({
    client_id: RCR.G_CLIENT,
    callback: RCR.onCredential,
    auto_select: false
  });
  google.accounts.id.renderButton(
    document.getElementById('g-login-btn'),
    { theme: 'outline', size: 'large', width: 280, text: 'continue_with' }
  );
  return true;
};

RCR.loginError = function (msg) {
  var box = document.getElementById('login-error');
  if (!box) return;
  if (!msg) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = msg;
};

RCR.onCredential = async function (response) {
  RCR.loginError('');
  try {
    var payload = JSON.parse(atob(response.credential.split('.')[1]));
    var correo  = (payload.email || '').toLowerCase();
    var nombreG = payload.name || correo;

    if (!correo.endsWith(RCR.DOMINIO)) {
      RCR.loginError('Este acceso es solo para cuentas <strong>' + RCR.DOMINIO + '</strong>.');
      if (google.accounts) google.accounts.id.disableAutoSelect();
      return;
    }

    var cred = firebase.auth.GoogleAuthProvider.credential(response.credential);
    await RCR.auth.signInWithCredential(cred);

    /* Buscar el registro del colaborador para nombre oficial y rol */
    var reg = null;
    try {
      var snap = await RCR.db.collection(RCR.COL_USUARIOS)
        .where('Correo', '==', correo).limit(1).get();
      if (!snap.empty) reg = Object.assign({ _docId: snap.docs[0].id }, snap.docs[0].data());
    } catch (e) {
      console.warn('Lectura de Usuarios falló:', e);
    }

    if (!reg && RCR.EXIGIR_REGISTRO) {
      await RCR.auth.signOut().catch(function () {});
      RCR.loginError('Tu cuenta todavía no está habilitada en Mi RCR. Escribe a comunicacion@redesconrostro.org.');
      return;
    }
    if (reg && reg.Activo === false) {
      await RCR.auth.signOut().catch(function () {});
      RCR.loginError('Tu acceso a Mi RCR está desactivado. Escribe a comunicacion@redesconrostro.org.');
      return;
    }

    RCR.user = {
      correo:     correo,
      nombre:     (reg && reg.Nombre) ? reg.Nombre : nombreG,
      rol:        (reg && reg.Rol)    ? reg.Rol    : 'Visualizador',
      area:       (reg && reg.Area)   ? reg.Area   : '',
      docId:      reg ? reg._docId : null,
      iniciales:  RCR.iniciales((reg && reg.Nombre) ? reg.Nombre : nombreG)
    };

    RCR.guardarSesion();
    RCR.entrar();

  } catch (e) {
    console.error('onCredential:', e);
    RCR.loginError('No se pudo iniciar sesión. Intenta de nuevo.');
  }
};

RCR.iniciales = function (nombre) {
  return String(nombre || '?').trim().split(/\s+/).slice(0, 2)
    .map(function (w) { return w[0] || ''; }).join('').toUpperCase() || '?';
};

RCR.esAdmin = function () {
  return !!RCR.user && RCR.user.rol === 'Admin';
};

RCR.puedeEditar = function () {
  return !!RCR.user && (RCR.user.rol === 'Admin' || RCR.user.rol === 'Editor');
};

/* ==========================================================================
   SESIÓN
   ========================================================================== */
RCR.guardarSesion = function () {
  try { sessionStorage.setItem(RCR.SESSION_KEY, JSON.stringify(RCR.user)); } catch (e) {}
};

RCR.leerSesion = function () {
  try {
    var raw = sessionStorage.getItem(RCR.SESSION_KEY);
    if (!raw) return null;
    var u = JSON.parse(raw);
    return (u && u.correo) ? u : null;
  } catch (e) { return null; }
};

RCR.logout = function () {
  try { sessionStorage.removeItem(RCR.SESSION_KEY); } catch (e) {}
  if (typeof google !== 'undefined' && google.accounts) google.accounts.id.disableAutoSelect();
  RCR.auth.signOut().catch(function () {});
  RCR.user = null;
  location.reload();
};

/* ==========================================================================
   MÓDULO: ACCESOS (solo Admin)
   ========================================================================== */
RCR.modulos.accesos = {
  id: 'accesos',
  titulo: 'Accesos',
  icono: 'accesos',
  soloAdmin: true,
  enNav: false,           // se abre desde el menú de usuario
  fab: { icono: 'plus', label: 'Agregar usuario', accion: function () { ACC.abrirForm(null); } },

  mount: function (root) {
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Usuarios habilitados</div>' +
          '<div class="section-sub">Quién puede entrar a Mi RCR y con qué rol</div>' +
        '</div>' +
        '<div class="count-badge" id="acc-count">0</div>' +
      '</div>' +
      '<div id="acc-list"></div>';
    ACC.cargar();
  },

  onShow: function () { if (ACC.datos.length) ACC.render(); }
};

var ACC = {
  datos: [],
  guardando: false,
  borrando: false,
  pendienteBorrar: null,

  cargar: async function () {
    var list = document.getElementById('acc-list');
    list.innerHTML = RCR.cargando('Cargando usuarios');
    try {
      var snap = await RCR.db.collection(RCR.COL_USUARIOS).get();
      ACC.datos = snap.docs.map(function (d) {
        return Object.assign({ _docId: d.id }, d.data());
      }).sort(function (a, b) {
        return String(a.Nombre || '').localeCompare(String(b.Nombre || ''), 'es');
      });
      ACC.render();
    } catch (e) {
      console.error('ACC.cargar:', e);
      list.innerHTML = RCR.vacio('alert', 'No se pudo cargar la lista', 'Revisa tu conexión y vuelve a intentar.');
    }
  },

  render: function () {
    var list = document.getElementById('acc-list');
    var cnt  = document.getElementById('acc-count');
    if (cnt) cnt.textContent = ACC.datos.length;

    if (!ACC.datos.length) {
      list.innerHTML = RCR.vacio('users', 'Todavía no hay usuarios dados de alta',
        'Toca + para habilitar al primer colaborador.');
      return;
    }

    list.innerHTML = ACC.datos.map(function (u) {
      var activo = u.Activo !== false;
      var rol    = u.Rol || 'Visualizador';
      return '' +
      '<div class="card">' +
        '<div class="card-top">' +
          '<div class="card-badge">' + RCR.esc(RCR.iniciales(u.Nombre)) + '</div>' +
          '<div class="card-info">' +
            '<strong>' + RCR.esc(u.Nombre || '(sin nombre)') + '</strong>' +
            '<small>' + RCR.esc(u.Correo || '') + '</small>' +
          '</div>' +
          '<div class="card-actions">' +
            '<button class="btn-ico" title="Editar" aria-label="Editar ' + RCR.esc(u.Nombre) + '"' +
              ' onclick="ACC.abrirForm(\'' + RCR.esc(u._docId) + '\')">' + ico('edit', 16) + '</button>' +
            '<button class="btn-ico danger" title="Eliminar" aria-label="Eliminar ' + RCR.esc(u.Nombre) + '"' +
              ' onclick="ACC.pedirBorrar(\'' + RCR.esc(u._docId) + '\')">' + ico('trash', 16) + '</button>' +
          '</div>' +
        '</div>' +
        '<div class="chips-row">' +
          '<span class="chip neutro">' + RCR.esc(rol) + '</span>' +
          (u.Area ? '<span class="chip neutro">' + RCR.esc(u.Area) + '</span>' : '') +
          '<span class="chip ' + (activo ? 'verde' : 'rojo') + '">' +
            '<span class="chip-dot"></span>' + (activo ? 'Activo' : 'Desactivado') +
          '</span>' +
        '</div>' +
      '</div>';
    }).join('');
  },

  abrirForm: function (docId) {
    var u = docId ? ACC.datos.find(function (x) { return x._docId === docId; }) : null;
    var rolOpts = RCR.ROLES.map(function (r) {
      return '<option value="' + r + '"' + (u && u.Rol === r ? ' selected' : '') + '>' + r + '</option>';
    }).join('');

    RCR.modal({
      id: 'm-acc',
      titulo: u ? 'Editar usuario' : 'Nuevo usuario',
      sub: u ? RCR.esc(u.Correo) : 'Solo correos ' + RCR.DOMINIO,
      cuerpo:
        '<div class="form-grp">' +
          '<label class="form-lbl" for="acc-nombre">Nombre completo</label>' +
          '<input class="form-inp" id="acc-nombre" value="' + RCR.esc(u ? (u.Nombre || '') : '') + '" placeholder="Nombre y apellido">' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="acc-correo">Correo institucional</label>' +
          '<input class="form-inp" id="acc-correo" type="email" inputmode="email" autocapitalize="none"' +
            ' value="' + RCR.esc(u ? (u.Correo || '') : '') + '" placeholder="nombre' + RCR.DOMINIO + '">' +
        '</div>' +
        '<div class="form-grid-2">' +
          '<div class="form-grp">' +
            '<label class="form-lbl" for="acc-rol">Rol</label>' +
            '<select class="form-inp" id="acc-rol">' + rolOpts + '</select>' +
          '</div>' +
          '<div class="form-grp">' +
            '<label class="form-lbl" for="acc-area">Área</label>' +
            '<input class="form-inp" id="acc-area" value="' + RCR.esc(u ? (u.Area || '') : '') + '" placeholder="Opcional">' +
          '</div>' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="check-line">' +
            '<input type="checkbox" id="acc-activo"' + (!u || u.Activo !== false ? ' checked' : '') + '>' +
            '<span>Acceso activo</span>' +
          '</label>' +
          '<div class="form-help">Al desactivarlo, la persona deja de entrar sin perder su historial.</div>' +
        '</div>',
      acciones:
        '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-acc\')">Cancelar</button>' +
        '<button class="btn btn-primary" id="acc-save" onclick="ACC.guardar(' +
          (docId ? '\'' + docId + '\'' : 'null') + ')">Guardar</button>'
    });
  },

  guardar: async function (docId) {
    if (ACC.guardando) return;

    var nombre = document.getElementById('acc-nombre').value.trim();
    var correo = document.getElementById('acc-correo').value.trim().toLowerCase();
    var rol    = document.getElementById('acc-rol').value;
    var area   = document.getElementById('acc-area').value.trim();
    var activo = document.getElementById('acc-activo').checked;

    if (!nombre)                        { RCR.toast('Escribe el nombre completo'); return; }
    if (!correo.endsWith(RCR.DOMINIO))  { RCR.toast('El correo debe terminar en ' + RCR.DOMINIO); return; }

    var repetido = ACC.datos.find(function (u) {
      return String(u.Correo || '').toLowerCase() === correo && u._docId !== docId;
    });
    if (repetido) { RCR.toast('Ese correo ya está dado de alta'); return; }

    ACC.guardando = true;
    var btn = document.getElementById('acc-save');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';

    var data = { Nombre: nombre, Correo: correo, Rol: rol, Area: area, Activo: activo };

    try {
      if (docId) {
        await RCR.db.collection(RCR.COL_USUARIOS).doc(docId).update(data);
        var i = ACC.datos.findIndex(function (u) { return u._docId === docId; });
        if (i >= 0) ACC.datos[i] = Object.assign(ACC.datos[i], data);
      } else {
        var ref = await RCR.db.collection(RCR.COL_USUARIOS).add(data);
        ACC.datos.push(Object.assign({ _docId: ref.id }, data));
      }
      ACC.datos.sort(function (a, b) {
        return String(a.Nombre || '').localeCompare(String(b.Nombre || ''), 'es');
      });
      ACC.render();
      RCR.cerrarModal('m-acc');
      RCR.toast(docId ? 'Usuario actualizado' : 'Usuario agregado');
    } catch (e) {
      console.error('ACC.guardar:', e);
      RCR.toast('No se pudo guardar. Revisa tu conexión.');
    }

    btn.disabled = false; btn.innerHTML = 'Guardar';
    ACC.guardando = false;
  },

  pedirBorrar: function (docId) {
    if (ACC.borrando) return;
    var u = ACC.datos.find(function (x) { return x._docId === docId; });
    ACC.pendienteBorrar = docId;
    RCR.confirmar({
      titulo: '¿Quitar el acceso?',
      texto: (u ? RCR.esc(u.Nombre) : 'Esta persona') + ' dejará de entrar a Mi RCR. Sus registros no se borran.',
      label: 'Quitar acceso',
      onOk: 'ACC.borrar()'
    });
  },

  borrar: async function () {
    if (ACC.borrando || !ACC.pendienteBorrar) return;
    ACC.borrando = true;
    var btn = document.getElementById('confirm-ok');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      await RCR.db.collection(RCR.COL_USUARIOS).doc(ACC.pendienteBorrar).delete();
      ACC.datos = ACC.datos.filter(function (u) { return u._docId !== ACC.pendienteBorrar; });
      ACC.render();
      RCR.cerrarModal('m-confirm');
      RCR.toast('Acceso retirado');
    } catch (e) {
      console.error('ACC.borrar:', e);
      RCR.toast('No se pudo quitar el acceso');
    }
    btn.disabled = false; btn.innerHTML = 'Quitar acceso';
    ACC.pendienteBorrar = null;
    ACC.borrando = false;
  }
};

window.ACC = ACC;

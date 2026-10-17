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
RCR.ADMIN_EMAIL  = 'comunicacion@redesconrostro.org';  // admin raíz: siempre entra como Admin
RCR.COL_USUARIOS = 'Usuarios';
RCR.SESSION_KEY  = 'mircr_session';   // clave propia: no choca con rcr_session de ReCircula
RCR.ROLES        = ['Admin', 'Editor', 'Visualizador'];

/* Si es true, solo entran los correos dados de alta en la colección Usuarios
   (más el admin raíz). El filtro de dominio sigue activo en ambos casos. */
RCR.EXIGIR_REGISTRO = true;

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

/* Botón propio: dispara el flujo de Google. Si el One Tap no aparece,
   se hace clic en el botón oficial (oculto) como respaldo. */
RCR.loginGoogle = function () {
  if (typeof google === 'undefined' || !google.accounts || !google.accounts.id) {
    RCR.loginError('No se pudo cargar Google. Revisa tu conexión.');
    return;
  }
  try {
    google.accounts.id.prompt(function (notif) {
      if (notif && (notif.isNotDisplayed && notif.isNotDisplayed() ||
                    notif.isSkippedMoment && notif.isSkippedMoment())) {
        var oficial = document.querySelector('#g-login-btn div[role="button"]');
        if (oficial) oficial.click();
      }
    });
  } catch (e) {
    var oficial = document.querySelector('#g-login-btn div[role="button"]');
    if (oficial) oficial.click();
  }
};

RCR.loginError = function (msg) {
  var box = document.getElementById('login-error');
  if (!box) return;
  if (!msg) { box.classList.add('hidden'); box.innerHTML = ''; return; }
  box.classList.remove('hidden');
  box.innerHTML = msg;
};

/* El payload del JWT viene en base64url y con el texto en UTF-8.
   atob() devuelve un binary string —un carácter por byte—, así que "Gutiérrez"
   llegaría como "GutiÃ©rrez" y ese nombre roto es el que se guardaría en
   Firestore. Hay que reinterpretar los bytes como UTF-8. Además atob() no
   acepta los caracteres - y _ propios de base64url, y sin convertirlos algunos
   tokens hacen fallar el inicio de sesión entero. */
RCR.decodificarJWT = function (token) {
  var b64 = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  var bin = atob(b64);
  var bytes = new Uint8Array(bin.length);
  for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return JSON.parse(new TextDecoder('utf-8').decode(bytes));
};

RCR.onCredential = async function (response) {
  RCR.loginError('');
  try {
    var payload = RCR.decodificarJWT(response.credential);
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

    /* El admin raíz siempre entra como Admin, aunque no esté en Usuarios
       (evita quedar bloqueado al exigir registro). */
    var esRaiz = correo === RCR.ADMIN_EMAIL;

    if (!reg && RCR.EXIGIR_REGISTRO && !esRaiz) {
      await RCR.auth.signOut().catch(function () {});
      RCR.loginError('Tu cuenta todavía no está habilitada en Mi RCR. Escribe a comunicacion@redesconrostro.org.');
      return;
    }
    if (reg && reg.Activo === false && !esRaiz) {
      await RCR.auth.signOut().catch(function () {});
      RCR.loginError('Tu acceso a Mi RCR está desactivado. Escribe a comunicacion@redesconrostro.org.');
      return;
    }

    RCR.user = {
      correo:     correo,
      nombre:     (reg && reg.Nombre) ? reg.Nombre : nombreG,
      rol:        esRaiz ? 'Admin' : ((reg && reg.Rol) ? reg.Rol : 'Visualizador'),
      area:       (reg && reg.Area)   ? reg.Area   : '',
      docId:      reg ? reg._docId : null,
      secciones:  (reg && reg.Secciones && typeof reg.Secciones === 'object') ? reg.Secciones : {},
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
  crear: { label: 'Agregar usuario', accion: function () { ACC.abrirForm(null); } },

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
        ACC.resumenSecciones(u) +
      '</div>';
    }).join('');
  },

  /* Resumen legible de las secciones que ve el usuario, bajo las chips */
  resumenSecciones: function (u) {
    if ((u.Rol || 'Visualizador') === 'Admin') {
      return '<div class="acc-perm-resumen">Ve todas las pestañas y secciones</div>';
    }
    var sec = (u.Secciones && typeof u.Secciones === 'object') ? u.Secciones : {};
    var matriz = (typeof RCR.permMatriz === 'function') ? RCR.permMatriz() : [];
    var partes = matriz.map(function (g) {
      var ids = Array.isArray(sec[g.ws.id]) ? sec[g.ws.id] : [];
      if (!ids.length) return '';
      var nombres = g.mods.filter(function (m) { return ids.indexOf(m.id) >= 0; })
        .map(function (m) { return m.titulo; });
      return '<strong>' + RCR.esc(g.ws.titulo) + ':</strong> ' + RCR.esc(nombres.join(', '));
    }).filter(Boolean);
    if (!partes.length) return '<div class="acc-perm-resumen">Sin secciones asignadas</div>';
    return '<div class="acc-perm-resumen">' + partes.join(' · ') + '</div>';
  },

  abrirForm: function (docId) {
    var u = docId ? ACC.datos.find(function (x) { return x._docId === docId; }) : null;
    var rolActual = u ? (u.Rol || 'Visualizador') : 'Visualizador';  // nuevo usuario: mínimo privilegio
    var rolOpts = RCR.ROLES.map(function (r) {
      return '<option value="' + r + '"' + (rolActual === r ? ' selected' : '') + '>' + r + '</option>';
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
            '<select class="form-inp" id="acc-rol" onchange="ACC.onRolChange()">' + rolOpts + '</select>' +
          '</div>' +
          '<div class="form-grp">' +
            '<label class="form-lbl" for="acc-area">Área</label>' +
            '<input class="form-inp" id="acc-area" value="' + RCR.esc(u ? (u.Area || '') : '') + '" placeholder="Opcional">' +
          '</div>' +
        '</div>' +
        '<div class="form-help" style="margin:-2px 0 10px;">' +
          '<strong>Admin:</strong> ve y edita todo. <strong>Editor:</strong> edita las secciones asignadas. <strong>Visualizador:</strong> solo lectura.' +
        '</div>' +
        '<div class="form-grp" id="acc-perms-grp">' +
          '<label class="form-lbl">Pestañas y secciones que puede ver</label>' +
          '<div id="acc-perms">' + ACC.permHtml(u) + '</div>' +
          '<div class="form-help" id="acc-perms-admin" style="display:none;">El rol Admin ve y edita todo; no requiere selección.</div>' +
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
    ACC.onRolChange();
  },

  /* Casillas de permisos: una por módulo, agrupadas por pestaña */
  permHtml: function (u) {
    var sec = (u && u.Secciones && typeof u.Secciones === 'object') ? u.Secciones : {};
    var matriz = (typeof RCR.permMatriz === 'function') ? RCR.permMatriz() : [];
    if (!matriz.length) return '<div class="form-help">No hay secciones registradas.</div>';
    return matriz.map(function (g) {
      var permitidos = Array.isArray(sec[g.ws.id]) ? sec[g.ws.id] : [];
      var checks = g.mods.map(function (m) {
        var on = permitidos.indexOf(m.id) >= 0;
        return '<label class="check-line acc-perm-mod">' +
                 '<input type="checkbox" class="acc-perm" data-ws="' + RCR.esc(g.ws.id) + '" value="' + RCR.esc(m.id) + '"' + (on ? ' checked' : '') + '>' +
                 '<span>' + RCR.esc(m.titulo) + '</span>' +
               '</label>';
      }).join('');
      return '<div class="acc-perm-ws">' +
               '<div class="acc-perm-ws-head">mi redes con rostro / ' + RCR.esc(g.ws.titulo) + '</div>' +
               '<div class="acc-perm-mods">' + checks + '</div>' +
             '</div>';
    }).join('');
  },

  onRolChange: function () {
    var rol = (document.getElementById('acc-rol') || {}).value;
    var esAdmin = rol === 'Admin';
    var perms = document.getElementById('acc-perms');
    var note = document.getElementById('acc-perms-admin');
    if (perms) perms.style.display = esAdmin ? 'none' : '';
    if (note) note.style.display = esAdmin ? '' : 'none';
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

    /* Recolectar secciones marcadas, agrupadas por pestaña */
    var secciones = {};
    document.querySelectorAll('#acc-perms .acc-perm:checked').forEach(function (cb) {
      var ws = cb.getAttribute('data-ws');
      (secciones[ws] = secciones[ws] || []).push(cb.value);
    });

    var data = { Nombre: nombre, Correo: correo, Rol: rol, Area: area, Activo: activo, Secciones: secciones };

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

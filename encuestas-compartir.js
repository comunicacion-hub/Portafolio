/* ==========================================================================
   Mi RCR — Perfil "encuestas" · Compartir con personas (estilo Drive)
   ──────────────────────────────────────────────────────────────────────────
   · Desde una encuesta se agregan personas de la plataforma (colección
     Usuarios) como Lector (ve la encuesta, sus resultados y sus datos) o
     Editor (además la edita y la comparte).
   · A quien se le comparte: le aparece en "Compartidas conmigo", gana acceso
     al perfil encuestas aunque no lo tenga en Accesos y recibe una
     notificación en la app (campana del topbar, en tiempo real).
   · Aviso a Gmail: al terminar se ofrece abrir Gmail con el correo listo.
     Si se activa la extensión "Trigger Email" de Firebase (plan Blaze),
     poner ENC.CORREO_AUTOMATICO = true y el correo saldrá solo.

   Campos en Encuestas/{id}:
     compartido:    [{ correo, nombre, rol: 'lector'|'editor', por, fecha }]
     compartidoCon: [correo, …]          (para consultar con array-contains)
   Colección Notificaciones/{id}:
     { para, tipo: 'encuesta-compartida', encuestaId, titulo, rol,
       de, deNombre, fecha, leida }

   Reglas de Firestore adicionales (junto a las de encuestas.js):
     match /Notificaciones/{id} {
       allow create: if request.auth != null;
       allow read, update, delete: if request.auth != null
         && resource.data.para == request.auth.token.email;
     }
     // Solo si se activa el correo automático (extensión Trigger Email):
     match /mail/{id} { allow create: if request.auth != null; }
   ========================================================================== */

ENC.CORREO_AUTOMATICO = false;
ENC.COL_NOTIF = 'Notificaciones';
ENC.COL_MAIL = 'mail';
ENC.SECCIONES_COMPARTIDAS = ['encuestas', 'resultados-encuesta', 'datos-encuesta'];

ENC.usuarios = null;   // [{ correo, nombre }] de la colección Usuarios
ENC.sh = null;         // estado de la ventana Compartir abierta
ENC.notifs = [];

/* Enlace a la app que abre directamente una encuesta (?encuesta=ID) */
ENC.urlApp = function (id) {
  var base = location.href.split('#')[0].split('?')[0];
  return base + (id ? '?encuesta=' + encodeURIComponent(id) : '');
};

ENC.cargarUsuarios = async function () {
  if (ENC.usuarios) return ENC.usuarios;
  try {
    var snap = await RCR.db.collection(RCR.COL_USUARIOS).get();
    ENC.usuarios = snap.docs.map(function (d) { return d.data(); })
      .filter(function (u) { return u.Correo && u.Activo !== false; })
      .map(function (u) { return { correo: String(u.Correo).toLowerCase(), nombre: u.Nombre || u.Correo }; })
      .sort(function (a, b) { return a.nombre.localeCompare(b.nombre, 'es'); });
  } catch (e) {
    console.warn('ENC.cargarUsuarios:', e);
    ENC.usuarios = null;   // sin lista: se puede escribir el correo a mano
  }
  return ENC.usuarios;
};

ENC.nombreDe = function (correo) {
  var u = (ENC.usuarios || []).find(function (x) { return x.correo === correo; });
  return u ? u.nombre : correo;
};

/* ==========================================================================
   VENTANA "COMPARTIR CON PERSONAS"
   ========================================================================== */
ENC.compartirPersonas = function (id) {
  var e = ENC.datos.find(function (x) { return x._docId === id; });
  if (!e) return;
  if (!ENC.puedeEditarEnc(e)) { RCR.toast('Solo el propietario o un editor puede compartir esta encuesta'); return; }

  var lista = JSON.parse(JSON.stringify(e.compartido || []));
  ENC.sh = {
    id: id,
    lista: lista,
    original: lista.map(function (x) { return x.correo; }),
    nuevos: [],
    guardando: false
  };

  RCR.modal({
    id: 'm-enc-sh',
    persistente: true,
    titulo: 'Compartir «' + (e.titulo || 'Encuesta') + '»',
    sub: 'Las personas que agregues verán la encuesta, sus resultados y sus datos en su perfil.',
    cuerpo:
      '<div id="enc-sh-paso1">' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="enc-sh-correo">Agregar personas</label>' +
          '<div class="enc-sh-add">' +
            '<input class="form-inp" id="enc-sh-correo" list="enc-sh-usuarios" autocomplete="off" ' +
              'placeholder="Nombre o correo" onkeydown="if(event.key===\'Enter\'){event.preventDefault();ENC.shAgregar();}">' +
            '<select class="form-inp" id="enc-sh-rol" aria-label="Permiso">' +
              '<option value="lector">Lector</option><option value="editor">Editor</option>' +
            '</select>' +
            '<button class="btn btn-primary" type="button" onclick="ENC.shAgregar()">Agregar</button>' +
          '</div>' +
          '<datalist id="enc-sh-usuarios"></datalist>' +
          '<div class="form-help"><strong>Lector:</strong> ve la encuesta, sus resultados y sus datos. ' +
            '<strong>Editor:</strong> además puede editarla y compartirla.</div>' +
        '</div>' +
        '<div class="form-lbl">Personas con acceso</div>' +
        '<div id="enc-sh-lista"></div>' +
      '</div>',
    acciones:
      '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-enc-sh\')">Cancelar</button>' +
      '<button class="btn btn-primary" id="enc-sh-guardar" onclick="ENC.shGuardar()">Guardar</button>'
  });
  ENC.shRender();

  ENC.cargarUsuarios().then(function (us) {
    var dl = document.getElementById('enc-sh-usuarios');
    if (!dl || !us) return;
    dl.innerHTML = us.filter(function (u) { return u.correo !== RCR.user.correo; }).map(function (u) {
      return '<option value="' + ENC.attr(u.correo) + '">' + RCR.esc(u.nombre) + '</option>';
    }).join('');
    ENC.shRender();   // con los nombres oficiales
  });
};

ENC.shRender = function () {
  var box = document.getElementById('enc-sh-lista');
  if (!box || !ENC.sh) return;
  var e = ENC.datos.find(function (x) { return x._docId === ENC.sh.id; }) || {};
  var fila = function (correo, nombre, derecha, nuevo) {
    return '<div class="enc-sh-fila">' +
      '<div class="enc-sh-ava">' + RCR.esc(RCR.iniciales(nombre || correo)) + '</div>' +
      '<div class="enc-sh-info"><strong><span class="enc-sh-nom">' + RCR.esc(nombre || correo) + '</span>' +
        (correo === RCR.user.correo ? '<span class="enc-sh-tu">(tú)</span>' : '') +
        (nuevo ? '<span class="enc-sh-nuevo">Nuevo</span>' : '') + '</strong>' +
        '<small>' + RCR.esc(correo) + '</small></div>' +
      derecha +
    '</div>';
  };

  var html = fila(e.creadoPor || '', e.creadoPorNombre || e.creadoPor, '<span class="enc-sh-fijo">Propietario</span>', false);
  html += ENC.sh.lista.map(function (p, i) {
    var esNuevo = ENC.sh.original.indexOf(p.correo) < 0;
    return fila(p.correo, p.nombre || ENC.nombreDe(p.correo),
      '<select class="form-inp enc-sh-sel" aria-label="Permiso de ' + ENC.attr(p.nombre || p.correo) + '" onchange="ENC.shRol(' + i + ',this.value)">' +
        '<option value="lector"' + (p.rol !== 'editor' ? ' selected' : '') + '>Lector</option>' +
        '<option value="editor"' + (p.rol === 'editor' ? ' selected' : '') + '>Editor</option>' +
      '</select>' +
      '<button class="btn-ico danger" type="button" title="Quitar acceso" aria-label="Quitar acceso a ' + ENC.attr(p.nombre || p.correo) + '" ' +
        'onclick="ENC.shQuitar(' + i + ')">' + ico('x', 15) + '</button>', esNuevo);
  }).join('');
  if (!ENC.sh.lista.length) html += '<div class="enc-sh-vacio">Todavía no la compartiste con nadie.</div>';
  box.innerHTML = html;
};

ENC.shAgregar = function () {
  var inp = document.getElementById('enc-sh-correo');
  var rol = (document.getElementById('enc-sh-rol') || {}).value === 'editor' ? 'editor' : 'lector';
  var v = String((inp && inp.value) || '').trim();
  if (!v) { RCR.toast('Escribe un nombre o un correo'); return; }

  /* Se acepta el correo o el nombre exacto de alguien registrado */
  var us = ENC.usuarios || [];
  var u = us.find(function (x) { return x.correo === v.toLowerCase(); }) ||
          us.find(function (x) { return x.nombre.toLowerCase() === v.toLowerCase(); });
  var correo = u ? u.correo : v.toLowerCase();

  if (correo.indexOf('@') < 0) { RCR.toast('No encontramos a esa persona. Escribe su correo.'); return; }
  if (!correo.endsWith(RCR.DOMINIO)) { RCR.toast('Solo se puede compartir con cuentas ' + RCR.DOMINIO); return; }
  if (ENC.usuarios && !u) { RCR.toast('Esa persona no está registrada en Mi RCR'); return; }

  var e = ENC.datos.find(function (x) { return x._docId === ENC.sh.id; }) || {};
  if (correo === e.creadoPor) { RCR.toast('Es quien creó la encuesta'); return; }
  if (ENC.sh.lista.some(function (p) { return p.correo === correo; })) { RCR.toast('Esa persona ya tiene acceso'); return; }

  ENC.sh.lista.push({
    correo: correo,
    nombre: u ? u.nombre : correo,
    rol: rol,
    por: RCR.user.correo,
    fecha: new Date().toISOString()
  });
  inp.value = '';
  inp.focus();
  ENC.shRender();
};

ENC.shRol = function (i, rol) {
  if (ENC.sh && ENC.sh.lista[i]) ENC.sh.lista[i].rol = rol === 'editor' ? 'editor' : 'lector';
};

ENC.shQuitar = function (i) {
  if (!ENC.sh) return;
  ENC.sh.lista.splice(i, 1);
  ENC.shRender();
};

ENC.shGuardar = async function () {
  var sh = ENC.sh;
  if (!sh || sh.guardando) return;
  var e = ENC.datos.find(function (x) { return x._docId === sh.id; });
  if (!e) return;

  /* Si quedó un correo escrito sin "Agregar", se agrega antes de guardar */
  var pendiente = document.getElementById('enc-sh-correo');
  if (pendiente && pendiente.value.trim()) {
    var antes = sh.lista.length;
    ENC.shAgregar();
    if (sh.lista.length === antes) return;
  }

  var lista = sh.lista.map(function (p) {
    return { correo: p.correo, nombre: p.nombre || p.correo, rol: p.rol === 'editor' ? 'editor' : 'lector',
             por: p.por || RCR.user.correo, fecha: p.fecha || new Date().toISOString() };
  });
  var correos = lista.map(function (p) { return p.correo; });
  var nuevos = lista.filter(function (p) { return sh.original.indexOf(p.correo) < 0; });

  sh.guardando = true;
  var btn = document.getElementById('enc-sh-guardar');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

  try {
    var editores = lista.filter(function (p) { return p.rol === 'editor'; }).map(function (p) { return p.correo; });
    await RCR.db.collection(ENC.COL).doc(sh.id).update({ compartido: lista, compartidoCon: correos, editoresCon: editores });
  } catch (err) {
    console.error('ENC.shGuardar:', err);
    RCR.toast('No se pudo compartir. Revisa tu conexión.');
    if (btn) { btn.disabled = false; btn.innerHTML = 'Guardar'; }
    sh.guardando = false;
    return;
  }

  e.compartido = lista;
  e.compartidoCon = correos;
  e.editoresCon = editores;
  ENC.render();

  /* Avisos a las personas nuevas: notificación en la app (y correo, si está activo) */
  var avisoFallo = false;
  if (nuevos.length) {
    try {
      var lote = RCR.db.batch();
      nuevos.forEach(function (p) {
        lote.set(RCR.db.collection(ENC.COL_NOTIF).doc(), {
          para: p.correo,
          tipo: 'encuesta-compartida',
          encuestaId: sh.id,
          titulo: e.titulo || 'Encuesta',
          rol: p.rol,
          de: RCR.user.correo,
          deNombre: RCR.user.nombre || RCR.user.correo,
          fecha: firebase.firestore.FieldValue.serverTimestamp(),
          leida: false
        });
        if (ENC.CORREO_AUTOMATICO) {
          var m = ENC.mensajeCorreo(e, [p]);
          lote.set(RCR.db.collection(ENC.COL_MAIL).doc(), {
            to: p.correo,
            message: { subject: m.asunto, text: m.texto }
          });
        }
      });
      await lote.commit();
    } catch (err) {
      console.warn('ENC.shGuardar avisos:', err);
      avisoFallo = true;
    }
  }

  sh.guardando = false;
  sh.nuevos = nuevos;

  if (!nuevos.length || ENC.CORREO_AUTOMATICO) {
    RCR.cerrarModal('m-enc-sh');
    RCR.toast(nuevos.length ? 'Compartida y avisada por correo' : 'Accesos actualizados');
    return;
  }

  /* Paso 2: ofrecer el aviso por Gmail (un clic del usuario, sin bloqueo de ventanas) */
  var nombres = nuevos.map(function (p) { return p.nombre || p.correo; });
  var modal = document.getElementById('m-enc-sh');
  if (!modal) return;
  modal.querySelector('.modal-body').innerHTML =
    '<div class="enc-sh-listo">' +
      '<div class="resp-estado-ico">' + ico('check', 26) + '</div>' +
      '<h3>Encuesta compartida</h3>' +
      '<p>' + RCR.esc(nombres.length === 1 ? nombres[0] : nombres.slice(0, -1).join(', ') + ' y ' + nombres[nombres.length - 1]) +
        (nombres.length === 1 ? ' ya la ve' : ' ya la ven') + ' en «Compartidas conmigo»' +
        (avisoFallo ? '.' : ' y ' + (nombres.length === 1 ? 'tiene' : 'tienen') + ' un aviso en la campana de Mi RCR.') + '</p>' +
      '<p class="enc-sh-gm">¿Les avisas también por Gmail? Se abrirá un correo ya escrito; solo tienes que enviarlo.</p>' +
    '</div>';
  modal.querySelector('.modal-footer').innerHTML =
    '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-enc-sh\')">Ahora no</button>' +
    '<button class="btn btn-primary" onclick="ENC.shGmail()">' + ico('mail', 15) + 'Abrir Gmail</button>';
};

ENC.mensajeCorreo = function (e, personas) {
  var yo = RCR.user.nombre || RCR.user.correo;
  var asunto = yo + ' te compartió la encuesta «' + (e.titulo || 'Encuesta') + '»';
  var texto = 'Hola' + (personas.length === 1 ? ' ' + String(personas[0].nombre || '').split(' ')[0] : '') + ',\n\n' +
    yo + ' te compartió la encuesta «' + (e.titulo || 'Encuesta') + '» en Mi RCR' +
    (personas.length === 1 ? ' como ' + (personas[0].rol === 'editor' ? 'editor/a' : 'lector/a') : '') + '.\n\n' +
    'Puedes ver sus resultados y sus datos aquí:\n' + ENC.urlApp(e._docId) + '\n\n' +
    'También la encuentras en Mi RCR → perfil encuestas → «Compartidas conmigo».\n\n' +
    'Saludos,\n' + yo;
  return { asunto: asunto, texto: texto };
};

ENC.shGmail = function () {
  var sh = ENC.sh;
  var e = sh && ENC.datos.find(function (x) { return x._docId === sh.id; });
  if (!e || !sh.nuevos.length) return;
  var m = ENC.mensajeCorreo(e, sh.nuevos);
  var url = 'https://mail.google.com/mail/?view=cm&fs=1' +
    '&to=' + encodeURIComponent(sh.nuevos.map(function (p) { return p.correo; }).join(',')) +
    '&su=' + encodeURIComponent(m.asunto) + '&body=' + encodeURIComponent(m.texto);
  window.open(url, '_blank', 'noopener');
  RCR.cerrarModal('m-enc-sh');
};

/* Botón "Compartir con personas" junto al menú de Resultados y Datos */
ENC.toggleCompartir = function (btnId, e) {
  var b = document.getElementById(btnId);
  if (b) b.classList.toggle('hidden', !(e && ENC.puedeEditarEnc(e)));
};

/* ==========================================================================
   AL ENTRAR: acceso por encuestas compartidas, notificaciones y enlace directo
   ========================================================================== */
ENC.alEntrar = async function () {
  if (!RCR.user || !RCR.db) return;
  await ENC.revisarAcceso();
  ENC.escucharNotif();

  var id = new URLSearchParams(location.search).get('encuesta');
  if (id) {
    history.replaceState(null, '', location.pathname + location.hash);
    ENC.irAEncuesta(id);
  }
};

/* Quien tenga alguna encuesta compartida gana acceso al perfil encuestas */
ENC.revisarAcceso = async function () {
  if (RCR.esAdmin()) return;
  var ya = (RCR.accesoExtra || {}).encuestas;
  if (ya && ya.length) return;
  try {
    var snap = await RCR.db.collection(ENC.COL).where('compartidoCon', 'array-contains', RCR.user.correo).limit(1).get();
    if (snap.empty) return;
    RCR.accesoExtra = RCR.accesoExtra || {};
    RCR.accesoExtra.encuestas = ENC.SECCIONES_COMPARTIDAS.slice();
    if (RCR.refrescarAccesos) RCR.refrescarAccesos();
  } catch (e) {
    console.warn('ENC.revisarAcceso:', e);
  }
};

/* Abre una encuesta (desde una notificación o el enlace del correo) */
ENC.irAEncuesta = async function (id) {
  try {
    await ENC.revisarAcceso();
    await ENC.recargar();
  } catch (e) {
    RCR.toast('No se pudo abrir la encuesta');
    return;
  }
  var e = ENC.datos.find(function (x) { return x._docId === id; });
  if (!e) { RCR.toast('Ya no tienes acceso a esa encuesta'); return; }
  if (!RCR.puedeVerWorkspace('encuestas')) { RCR.toast('No tienes acceso al perfil encuestas'); return; }
  if (RCR.workspaceActivo !== 'encuestas') RCR.cambiarWorkspace('encuestas');
  if (window.RES && RCR.puedeVerSeccion('encuestas', 'resultados-encuesta')) RES.abrir(id);
  else RCR.ir('encuestas');
};

/* ==========================================================================
   NOTIFICACIONES EN LA APP (campana del topbar, en tiempo real)
   ========================================================================== */
ENC.escucharNotif = function () {
  if (ENC._quitarEscucha) return;
  var primera = true;
  ENC._quitarEscucha = RCR.db.collection(ENC.COL_NOTIF)
    .where('para', '==', RCR.user.correo)
    .onSnapshot(function (snap) {
      var antes = {};
      ENC.notifs.forEach(function (n) { antes[n._docId] = true; });
      ENC.notifs = snap.docs.map(function (d) { return Object.assign({ _docId: d.id }, d.data()); })
        .sort(function (a, b) { return RES.ms(b.fecha) - RES.ms(a.fecha); })
        .slice(0, 40);
      if (!primera) {
        var llegadas = ENC.notifs.filter(function (n) { return !antes[n._docId] && !n.leida; });
        if (llegadas.length) {
          var n = llegadas[0];
          RCR.toast((n.deNombre || n.de) + ' te compartió «' + n.titulo + '»');
          ENC.revisarAcceso();
          if (ENC.cargado) ENC.recargar();
        }
      }
      primera = false;
      ENC.renderCampana();
      if (document.getElementById('m-enc-notif')) ENC.renderNotifLista();
    }, function (err) {
      console.warn('ENC.escucharNotif:', err);
    });
};

ENC.renderCampana = function () {
  var b = document.getElementById('topbar-notif');
  if (!b) {
    var der = document.querySelector('.topbar-right');
    if (!der) return;
    b = document.createElement('button');
    b.id = 'topbar-notif';
    b.className = 'btn-add topbar-add topbar-notif hidden';
    b.onclick = ENC.abrirNotif;
    der.insertBefore(b, der.firstChild);
  }
  var sinLeer = ENC.notifs.filter(function (n) { return !n.leida; }).length;
  b.innerHTML = ico('bell', 19, 2.2) + (sinLeer ? '<span class="notif-badge">' + (sinLeer > 9 ? '9+' : sinLeer) + '</span>' : '');
  var etiqueta = sinLeer ? 'Notificaciones (' + sinLeer + ' sin leer)' : 'Notificaciones';
  b.title = etiqueta;
  b.setAttribute('aria-label', etiqueta);
  b.classList.toggle('hidden', !ENC.notifs.length);
};

ENC.abrirNotif = function () {
  RCR.modal({
    id: 'm-enc-notif',
    titulo: 'Notificaciones',
    cuerpo: '<div id="enc-notif-lista"></div>',
    acciones:
      '<button class="btn btn-glass" id="enc-notif-todas" onclick="ENC.marcarTodas()">Marcar todas como leídas</button>' +
      '<button class="btn btn-primary" onclick="RCR.cerrarModal(\'m-enc-notif\')">Cerrar</button>'
  });
  ENC.renderNotifLista();
};

ENC.renderNotifLista = function () {
  var box = document.getElementById('enc-notif-lista');
  if (!box) return;
  var todas = document.getElementById('enc-notif-todas');
  if (todas) todas.disabled = !ENC.notifs.some(function (n) { return !n.leida; });
  if (!ENC.notifs.length) { box.innerHTML = RCR.vacio('bell', 'No tienes notificaciones', ''); return; }
  box.innerHTML = ENC.notifs.map(function (n) {
    var ms = RES.ms(n.fecha);
    return '<button class="enc-notif' + (n.leida ? '' : ' sin-leer') + '" onclick="ENC.notifIr(\'' + n._docId + '\')">' +
      '<span class="enc-notif-ico">' + ico('encuesta', 18) + '</span>' +
      '<span class="enc-notif-txt">' +
        '<strong>' + RCR.esc(n.deNombre || n.de) + '</strong> te compartió «' + RCR.esc(n.titulo) + '»' +
        (n.rol ? ' como ' + (n.rol === 'editor' ? 'editor/a' : 'lector/a') : '') +
        (ms ? '<small>' + RCR.esc(ENC.hace(ms)) + '</small>' : '') +
      '</span>' +
      (n.leida ? '' : '<span class="enc-notif-punto" aria-label="Sin leer"></span>') +
    '</button>';
  }).join('');
};

ENC.hace = function (ms) {
  var min = Math.round((Date.now() - ms) / 60000);
  if (min < 1) return 'Ahora';
  if (min < 60) return 'Hace ' + min + ' min';
  var h = Math.round(min / 60);
  if (h < 24) return 'Hace ' + h + (h === 1 ? ' hora' : ' horas');
  var d = Math.round(h / 24);
  if (d < 7) return 'Hace ' + d + (d === 1 ? ' día' : ' días');
  return new Date(ms).toLocaleDateString('es-EC', { day: 'numeric', month: 'short', year: 'numeric' });
};

ENC.notifIr = function (nid) {
  var n = ENC.notifs.find(function (x) { return x._docId === nid; });
  if (!n) return;
  if (!n.leida) {
    n.leida = true;
    ENC.renderCampana();
    RCR.db.collection(ENC.COL_NOTIF).doc(nid).update({ leida: true }).catch(function (e) { console.warn('notif leida:', e); });
  }
  RCR.cerrarModal('m-enc-notif');
  ENC.irAEncuesta(n.encuestaId);
};

ENC.marcarTodas = async function () {
  var pend = ENC.notifs.filter(function (n) { return !n.leida; });
  if (!pend.length) return;
  pend.forEach(function (n) { n.leida = true; });
  ENC.renderCampana();
  ENC.renderNotifLista();
  try {
    var lote = RCR.db.batch();
    pend.forEach(function (n) { lote.update(RCR.db.collection(ENC.COL_NOTIF).doc(n._docId), { leida: true }); });
    await lote.commit();
  } catch (e) {
    console.warn('ENC.marcarTodas:', e);
  }
};

RCR.alEntrar.push(ENC.alEntrar);

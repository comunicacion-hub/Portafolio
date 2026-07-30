/* ==========================================================================
   Mi RCR — informes.js
   Informe mensual de cumplimiento de actividades por área.
   Cada área trae procesos fijos; dentro de cada proceso el colaborador
   agrega las filas de actividad que necesite.
   ========================================================================== */

window.RCR = window.RCR || { modulos: {} };

/* ==========================================================================
   ÁREAS
   Colores de las cintas tomados de los modelos originales en PDF.
   Para sumar un área nueva basta agregar una entrada aquí.
   ========================================================================== */
var INF_AREAS = {

  recircula: {
    nombre: 'ReCircula',
    logo: 'recircula',
    aliados: ['recircula', 'tesalia', 'rcr'],
    validador: {
      nombre: 'Carlos Andrés Segovia',
      cargo:  'Coordinador Nacional de ReCircula',
      cedula: '0930953559'
    },
    procesos: [
      { key: 'cadena_comercial', nombre: 'Cadena comercial',           color: '#002343' },
      { key: 'fortalecimiento',  nombre: 'Fortalecimiento asociativo', color: '#5BBD70' },
      { key: 'vinculacion',      nombre: 'Vinculación estratégica',    color: '#36C7D6' },
      { key: 'otras',            nombre: 'Otras actividades',          color: '#545454' }
    ]
  },

  juntos_vida: {
    nombre: 'Juntos Por La Vida',
    logo: 'juntos',
    aliados: ['juntos', 'provefrut', 'nintanga', 'procongelados', 'rcr'],
    validador: {
      nombre: 'Aida Yolanda Lisintuña Toaquiza',
      cargo:  'Coordinadora Nacional de Juntos Por La Vida',
      cedula: '0504085333'
    },
    procesos: [
      { key: 'apadrinamiento', nombre: 'Plan de apadrinamiento', color: '#6F2873' },
      { key: 'nutricion',      nombre: 'Plan de nutrición',      color: '#395E27' },
      { key: 'otras',          nombre: 'Otras actividades',      color: '#545454' }
    ]
  },

  vidrio: {
    nombre: 'Vidrio Mejor Planeta',
    logo: 'vidrio',
    aliados: [],                       // el pie usa la franja PIES.vidrio
    validador: {
      nombre: 'Monserrate Gómez',
      cargo:  'Coordinadora Nacional de Vidrio Mejor Planeta',
      cedula: '0930953559'
    },
    procesos: [
      { key: 'cadena_comercial', nombre: 'Cadena comercial',           color: '#5B3D1C' },
      { key: 'fortalecimiento',  nombre: 'Fortalecimiento asociativo', color: '#76753E' },
      { key: 'vinculacion',      nombre: 'Vinculación estratégica',    color: '#DA9632' },
      { key: 'otras',            nombre: 'Otras actividades',          color: '#545454' }
    ]
  },

  redes: {
    nombre: 'Redes Con Rostro',
    logo: 'rcr',
    aliados: [],
    sinPie: true,                      // no lleva franja de logos al pie; el logo va solo en el encabezado
    validador: null,                   // no tiene validador: la firma es solo "Elaborado por"
    procesos: [
      { key: 'principales',     nombre: 'Acciones principales',       color: '#09AF96' },
      { key: 'acompanamiento',  nombre: 'Acciones de acompañamiento', color: '#4996D2' },
      { key: 'otras',           nombre: 'Otras actividades',          color: '#545454' }
    ]
  },

  mediacion: {
    nombre: 'Mediación comunitaria',
    logo: 'rcr',                       // usa el logo de Redes Con Rostro
    aliados: [],
    sinPie: true,                      // sin franja de pie, igual que Redes
    validador: null,                   // firma de una sola columna "Elaborado por"
    tituloEncabezado: 'Mediación comunitaria',   // el recuadro superior dice esto, no el texto genérico
    campoEmpresas: true,               // agrega la fila "Empresas/entidades" en el encabezado
    procesos: [
      { key: 'principales', nombre: 'Acciones principales', color: '#09AF96' }
    ]
  }
};

/* ==========================================================================
   MÓDULO
   ========================================================================== */
RCR.modulos.informes = {
  id: 'informes',
  titulo: 'Informes',
  icono: 'informes',
  enNav: true,
  fab: { icono: 'plus', label: 'Nuevo informe', accion: function () { INF.abrirForm(null); } },

  mount: function (root) {
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Mis informes</div>' +
          '<div class="section-sub">Un informe por mes y por área</div>' +
        '</div>' +
        '<div class="count-badge" id="inf-count">0</div>' +
      '</div>' +
      '<div id="inf-list"></div>';
    INF.cargar();
  },

  onShow: function () { if (INF.cargado) INF.render(); }
};

/* ==========================================================================
   INF
   ========================================================================== */
var INF = {

  COL: 'Informes',

  MESES: ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
          'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'],
  ESTADOS: ['Ejecutado', 'Por ejecutar'],

  datos: [],
  form: null,
  editId: null,
  paso: 0,
  tocado: false,
  cargado: false,
  guardando: false,
  generando: false,
  pendienteBorrar: null,
  borrando: false,

  area: function (key) { return INF_AREAS[key] || null; },

  /* ── Estructura vacía ─────────────────────────────────────────────────── */
  nuevo: function (areaKey) {
    var hoy = new Date();
    var ult = INF.datos[0] || null;      // para heredar cargo y cédula
    var o = {
      correo: RCR.user.correo,
      nombre: RCR.user.nombre,
      area: areaKey || 'recircula',
      mes: INF.MESES[hoy.getMonth()],
      anio: hoy.getFullYear(),
      cargo:  ult ? (ult.cargo || '')  : '',
      cedula: ult ? (ult.cedula || '') : '',
      fecha_cierre: INF.hoyTexto(),
      empresas: '',                    // solo lo usa Mediación comunitaria (campoEmpresas)
      procesos: {},
      medios: ['']
    };
    INF.sembrarProcesos(o);
    return o;
  },

  /* Asegura que existan las listas de todos los procesos del área */
  sembrarProcesos: function (o) {
    var a = INF.area(o.area);
    if (!a) return o;
    o.procesos = o.procesos || {};
    a.procesos.forEach(function (p) {
      if (!Array.isArray(o.procesos[p.key])) o.procesos[p.key] = [];
    });
    return o;
  },

  normalizar: function (d) {
    var o = Object.assign({}, d);
    o.medios = Array.isArray(o.medios) ? o.medios : [];
    if (!o.medios.length) o.medios = [''];
    if (typeof o.empresas !== 'string') o.empresas = '';
    INF.sembrarProcesos(o);
    return o;
  },

  hoyTexto: function () {
    var h = new Date();
    return String(h.getDate()).padStart(2, '0') + '/' +
           String(h.getMonth() + 1).padStart(2, '0') + '/' + h.getFullYear();
  },

  orden: function (d) {
    var i = INF.MESES.indexOf(d.mes);
    return (parseInt(d.anio, 10) || 0) * 100 + (i + 1);
  },

  totalFilas: function (d) {
    var a = INF.area(d.area);
    if (!a) return 0;
    return a.procesos.reduce(function (n, p) {
      return n + ((d.procesos && d.procesos[p.key]) ? d.procesos[p.key].length : 0);
    }, 0);
  },

  totalPendientes: function (d) {
    var a = INF.area(d.area);
    if (!a) return 0;
    return a.procesos.reduce(function (n, p) {
      var fs = (d.procesos && d.procesos[p.key]) || [];
      return n + fs.filter(function (f) { return f.estado === 'Por ejecutar'; }).length;
    }, 0);
  },

  /* ── Lectura ──────────────────────────────────────────────────────────── */
  cargar: async function () {
    var list = document.getElementById('inf-list');
    list.innerHTML = RCR.cargando('Cargando tus informes');
    try {
      var snap = await RCR.db.collection(INF.COL)
        .where('correo', '==', RCR.user.correo).get();
      INF.datos = snap.docs.map(function (d) {
        return INF.normalizar(Object.assign({ _docId: d.id }, d.data()));
      }).sort(function (a, b) { return INF.orden(b) - INF.orden(a); });
      INF.cargado = true;
      INF.render();
    } catch (e) {
      console.error('INF.cargar:', e);
      list.innerHTML = RCR.vacio('alert', 'No se pudieron cargar tus informes',
        'Si es la primera vez, puede faltar el permiso de la colección Informes en las reglas de Firestore.');
    }
  },

  /* ── Vista de la sección ──────────────────────────────────────────────── */
  render: function () {
    var list = document.getElementById('inf-list');
    var cnt  = document.getElementById('inf-count');
    if (!list) return;
    if (cnt) cnt.textContent = INF.datos.length;

    if (!INF.datos.length) {
      list.innerHTML = RCR.vacio('informes', 'Todavía no tienes informes',
        'Toca + para crear el informe del mes.');
      return;
    }

    list.innerHTML = INF.datos.map(function (d) {
      var a = INF.area(d.area);
      var nomArea = a ? a.nombre : d.area;
      var color = a ? a.procesos[0].color : '#545454';
      var filas = INF.totalFilas(d);
      var pend  = INF.totalPendientes(d);
      var sigla = nomArea.split(/\s+/).map(function (w) { return w[0]; }).join('').substring(0, 4).toUpperCase();

      var tags = (a ? a.procesos : []).map(function (p) {
        var n = (d.procesos[p.key] || []).length;
        if (!n) return '';
        return '<span class="inf-proc-tag">' +
                 '<span class="inf-proc-dot" style="background:' + p.color + '"></span>' +
                 RCR.esc(p.nombre) + ' (' + n + ')</span>';
      }).filter(Boolean).join('');

      return '' +
      '<div class="card">' +
        '<div class="card-top">' +
          '<div class="card-badge-soft">' + ico('calendar', 22) + '</div>' +
          '<div class="card-info">' +
            '<strong>' + RCR.esc(d.mes + ' ' + d.anio) + '</strong>' +
            '<small>' + RCR.esc(nomArea) + ' · ' + filas + ' actividad' + (filas === 1 ? '' : 'es') + '</small>' +
          '</div>' +
        '</div>' +
        (tags ? '<div class="chips-row" style="gap:12px;margin-bottom:12px">' + tags + '</div>' : '') +
        (pend ? '<div class="chips-row" style="margin-bottom:12px">' +
                  '<span class="chip amarillo"><span class="chip-dot"></span>' +
                  pend + ' por ejecutar</span></div>' : '') +
        '<div class="cv-res-btns">' +
          '<button class="btn btn-glass" onclick="INF.ver(\'' + d._docId + '\')">' + ico('eye', 15) + 'Ver</button>' +
          '<button class="btn btn-glass" onclick="INF.abrirForm(\'' + d._docId + '\')">' + ico('edit', 15) + 'Editar</button>' +
          '<button class="btn btn-glass" onclick="INF.compartir(\'' + d._docId + '\')">' + ico('link', 15) + 'Compartir</button>' +
          '<button class="btn btn-primary" onclick="INF.descargar(\'' + d._docId + '\',this)">' + ico('download', 15) + 'Descargar PDF</button>' +
          '<button class="btn-ico danger" style="height:auto" aria-label="Eliminar informe"' +
            ' onclick="INF.pedirBorrar(\'' + d._docId + '\')">' + ico('trash', 15) + '</button>' +
        '</div>' +
      '</div>';
    }).join('');
  },

  /* ==========================================================================
     FICHA POR PASOS
     Paso 0 = datos generales, uno por proceso, y el último los medios.
     ========================================================================== */
  pasos: function () {
    var a = INF.area(INF.form.area);
    var lista = [{ tipo: 'datos', tit: 'Datos del informe', sub: 'Área, mes y quién elabora.' }];
    (a ? a.procesos : []).forEach(function (p) {
      lista.push({ tipo: 'proceso', proc: p, tit: p.nombre, sub: 'Agrega una fila por actividad.' });
    });
    lista.push({ tipo: 'medios', tit: 'Medios de verificación', sub: 'Enlaces a la evidencia del mes.' });
    return lista;
  },

  abrirForm: function (docId) {
    INF.editId = docId || null;
    if (docId) {
      var d = INF.datos.find(function (x) { return x._docId === docId; });
      INF.form = INF.normalizar(JSON.parse(JSON.stringify(d)));
    } else {
      INF.form = INF.nuevo(null);
    }
    delete INF.form._docId;
    INF.form.correo = RCR.user.correo;
    INF.form.nombre = RCR.user.nombre;
    INF.paso = 0;
    INF.tocado = false;

    RCR.subvista({
      titulo: docId ? 'Editar informe' : 'Nuevo informe',
      cuerpo:
        '<div class="form-wrap">' +
          '<div id="inf-body"></div>' +
          '<div class="subvista-actions" id="inf-foot"></div>' +
        '</div>',
      onCerrar: function () { INF.intentarCerrar(); }
    });
    INF.pintar();
  },

  intentarCerrar: function () {
    INF.leerPaso();
    if (!INF.tocado) { RCR.cerrarSubvista(); return; }
    RCR.confirmar({
      titulo: '¿Salir sin guardar?',
      texto: 'Los cambios de esta sesión se pierden.',
      label: 'Salir',
      onOk: "RCR.cerrarModal('m-confirm');RCR.cerrarSubvista();"
    });
  },

  pintar: function () {
    var pasos = INF.pasos();
    if (INF.paso >= pasos.length) INF.paso = pasos.length - 1;
    var p = INF.paso;
    var actual = pasos[p];

    var barras = pasos.map(function (_, i) {
      var cls = i < p ? 'done' : (i === p ? 'now' : '');
      return '<button class="cv-step ' + cls + '" aria-label="Paso ' + (i + 1) + '"' +
             ' onclick="INF.ir(' + i + ')"></button>';
    }).join('');

    var cuerpo;
    if (actual.tipo === 'datos')   cuerpo = INF.pasoDatos();
    else if (actual.tipo === 'medios') cuerpo = INF.pasoMedios();
    else cuerpo = INF.pasoProceso(actual.proc);

    document.getElementById('inf-body').innerHTML =
      '<div class="cv-steps">' + barras + '</div>' +
      '<div class="cv-paso-tit">' + (p + 1) + '. ' + RCR.esc(actual.tit) + '</div>' +
      '<div class="cv-paso-sub">' + RCR.esc(actual.sub) + '</div>' +
      cuerpo;

    var ultimo = p === pasos.length - 1;
    document.getElementById('inf-foot').innerHTML =
      (p > 0 ? '<button class="btn btn-glass" onclick="INF.ir(' + (p - 1) + ')">' +
                 ico('chevronLeft', 15) + 'Anterior</button>' : '') +
      (ultimo
        ? '<button class="btn btn-primary" id="inf-save" onclick="INF.guardar()">' +
            ico('save', 15) + 'Guardar informe</button>'
        : '<button class="btn btn-primary" onclick="INF.ir(' + (p + 1) + ')">Siguiente' +
            ico('chevronRight', 15) + '</button>');

    /* Solo se sube el scroll al cambiar de paso (no al agregar/quitar filas). */
    var body = document.getElementById('subvista-body');
    if (body && !INF._mantenerScroll) body.scrollTop = 0;
    INF._mantenerScroll = false;
  },

  ir: function (i) {
    INF.leerPaso();
    var n = INF.pasos().length;
    INF.paso = Math.max(0, Math.min(n - 1, i));
    INF._mantenerScroll = false;      // cambio de paso: subir al inicio
    INF.pintar();
  },

  val: function (id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  },

  leerPaso: function () {
    if (!INF.form) return;
    var pasos = INF.pasos();
    var actual = pasos[INF.paso];
    if (!actual) return;
    if (actual.tipo === 'datos')        INF.leerDatos();
    else if (actual.tipo === 'medios')  INF.leerMedios();
    else                                INF.leerProceso(actual.proc);
    INF.tocado = true;
  },

  /* ── Paso: datos generales ────────────────────────────────────────────── */
  pasoDatos: function () {
    var f = INF.form;
    var a = INF.area(f.area);
    var bloqueada = !!INF.editId;

    var areas = Object.keys(INF_AREAS).map(function (k) {
      return '<option value="' + k + '"' + (f.area === k ? ' selected' : '') + '>' +
             RCR.esc(INF_AREAS[k].nombre) + '</option>';
    }).join('');

    var meses = INF.MESES.map(function (m) {
      return '<option value="' + m + '"' + (f.mes === m ? ' selected' : '') + '>' + m + '</option>';
    }).join('');

    var anioAct = new Date().getFullYear();
    var anios = [];
    for (var y = anioAct + 1; y >= anioAct - 3; y--) {
      anios.push('<option value="' + y + '"' + (String(f.anio) === String(y) ? ' selected' : '') + '>' + y + '</option>');
    }

    return '' +
      '<div class="form-grp">' +
        '<label class="form-lbl" for="inf-area">Área o proyecto</label>' +
        '<select class="form-inp" id="inf-area"' + (bloqueada ? ' disabled' : '') +
          ' onchange="INF.cambiarArea(this.value)">' + areas + '</select>' +
        '<div class="form-help">' +
          (bloqueada
            ? 'El área no se cambia en un informe ya creado.'
            : 'Define los procesos que vas a llenar: ' +
              RCR.esc((a ? a.procesos : []).map(function (p) { return p.nombre; }).join(', ')) + '.') +
        '</div>' +
      '</div>' +
      '<div class="form-grid-2">' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="inf-mes">Mes</label>' +
          '<select class="form-inp" id="inf-mes">' + meses + '</select>' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="inf-anio">Año</label>' +
          '<select class="form-inp" id="inf-anio">' + anios.join('') + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="form-grp">' +
        '<label class="form-lbl" for="inf-cierre">Fecha de cierre</label>' +
        '<input class="form-inp" id="inf-cierre" value="' + RCR.esc(f.fecha_cierre) + '" placeholder="31/07/2026">' +
      '</div>' +
      ((a && a.campoEmpresas)
        ? '<div class="form-grp">' +
            '<label class="form-lbl" for="inf-empresas">Empresas / entidades</label>' +
            '<input class="form-inp" id="inf-empresas" value="' + RCR.esc(f.empresas) + '" placeholder="Con quién se realizó la mediación">' +
          '</div>'
        : '') +
      '<div class="form-grp">' +
        '<label class="form-lbl">Elaborado por</label>' +
        '<div class="form-static">' + RCR.esc(f.nombre) + '</div>' +
      '</div>' +
      '<div class="form-grid-2">' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="inf-cargo">Tu cargo</label>' +
          '<input class="form-inp" id="inf-cargo" value="' + RCR.esc(f.cargo) + '" placeholder="Promotora comunitaria">' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="inf-cedula">Tu cédula</label>' +
          '<input class="form-inp" id="inf-cedula" inputmode="numeric" value="' + RCR.esc(f.cedula) + '" placeholder="0912345678">' +
        '</div>' +
      '</div>';
  },

  leerDatos: function () {
    var f = INF.form;
    f.mes          = INF.val('inf-mes')  || f.mes;
    f.anio         = parseInt(INF.val('inf-anio'), 10) || f.anio;
    f.fecha_cierre = INF.val('inf-cierre');
    f.cargo        = INF.val('inf-cargo');
    f.cedula       = INF.val('inf-cedula');
    if (document.getElementById('inf-empresas')) f.empresas = INF.val('inf-empresas');
  },

  cambiarArea: function (nueva) {
    var f = INF.form;
    if (nueva === f.area) return;
    var conDatos = INF.totalFilas(f) > 0;
    if (conDatos && !confirm('Al cambiar de área se descartan las actividades que ya escribiste. ¿Continuar?')) {
      document.getElementById('inf-area').value = f.area;
      return;
    }
    INF.leerDatos();
    f.area = nueva;
    f.procesos = {};
    INF.sembrarProcesos(f);
    INF.tocado = true;
    INF.pintar();
  },

  /* ── Paso: un proceso ─────────────────────────────────────────────────── */
  pasoProceso: function (proc) {
    var filas = INF.form.procesos[proc.key] || [];

    var cinta =
      '<div class="inf-cinta" style="background:' + proc.color + '">' +
        RCR.esc(proc.nombre) +
        '<small>' + filas.length + ' fila' + (filas.length === 1 ? '' : 's') + '</small>' +
      '</div>';

    if (!filas.length) {
      return cinta +
        RCR.vacio('inbox', 'Sin actividades en este proceso', 'Si no aplica este mes, puedes dejarlo vacío.') +
        INF.btnAgregar(proc.key);
    }

    return cinta + filas.map(function (fila, i) {
      var estados = INF.ESTADOS.map(function (e) {
        return '<option value="' + e + '"' + (fila.estado === e ? ' selected' : '') + '>' + e + '</option>';
      }).join('');
      return '' +
      '<div class="inf-fila">' +
        '<div class="inf-fila-top">' +
          '<span class="rep-num">Actividad ' + (i + 1) + '</span>' +
          '<button class="btn-ico danger" aria-label="Quitar actividad ' + (i + 1) + '"' +
            ' onclick="INF.quitar(\'' + proc.key + '\',' + i + ')">' + ico('trash', 15) + '</button>' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl">Fecha</label>' +
          '<input class="form-inp" id="inf-' + proc.key + '-' + i + '-fecha" value="' + RCR.esc(fila.fecha) + '" placeholder="02/07/2026">' +
          '<div class="form-help">Si la actividad tomó varios días, puedes escribir un rango.</div>' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl">Actividad</label>' +
          '<textarea class="form-inp" id="inf-' + proc.key + '-' + i + '-actividad" style="min-height:72px">' + RCR.esc(fila.actividad) + '</textarea>' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl">Estado</label>' +
          '<select class="form-inp" id="inf-' + proc.key + '-' + i + '-estado">' + estados + '</select>' +
        '</div>' +
        '<div class="form-grp" style="margin-bottom:0">' +
          '<label class="form-lbl">Observaciones <span class="opt">(opcional)</span></label>' +
          '<textarea class="form-inp" id="inf-' + proc.key + '-' + i + '-observaciones" style="min-height:52px">' + RCR.esc(fila.observaciones) + '</textarea>' +
        '</div>' +
      '</div>';
    }).join('') + INF.btnAgregar(proc.key);
  },

  leerProceso: function (proc) {
    var filas = INF.form.procesos[proc.key] || [];
    INF.form.procesos[proc.key] = filas.map(function (_, i) {
      return {
        fecha:         INF.val('inf-' + proc.key + '-' + i + '-fecha'),
        actividad:     INF.val('inf-' + proc.key + '-' + i + '-actividad'),
        estado:        INF.val('inf-' + proc.key + '-' + i + '-estado') || 'Ejecutado',
        observaciones: INF.val('inf-' + proc.key + '-' + i + '-observaciones')
      };
    });
  },

  btnAgregar: function (procKey) {
    return '<button class="rep-add" onclick="INF.agregar(\'' + procKey + '\')">' +
             ico('plus', 15) + 'Agregar actividad</button>';
  },

  agregar: function (procKey) {
    INF.leerPaso();
    INF.form.procesos[procKey].push({ fecha: '', actividad: '', estado: 'Ejecutado', observaciones: '' });
    INF._mantenerScroll = true;
    INF.pintar();
  },

  quitar: function (procKey, i) {
    INF.leerPaso();
    INF.form.procesos[procKey].splice(i, 1);
    INF._mantenerScroll = true;
    INF.pintar();
  },

  /* ── Paso: medios de verificación ─────────────────────────────────────── */
  pasoMedios: function () {
    var m = INF.form.medios.length ? INF.form.medios : [''];
    return m.map(function (url, i) {
      return '<div class="inf-medio">' +
               '<input class="form-inp" id="inf-medio-' + i + '" value="' + RCR.esc(url) + '"' +
                 ' inputmode="url" placeholder="https://drive.google.com/…">' +
               (m.length > 1
                 ? '<button class="btn-ico danger" aria-label="Quitar enlace"' +
                   ' onclick="INF.quitarMedio(' + i + ')">' + ico('trash', 15) + '</button>'
                 : '') +
             '</div>';
    }).join('') +
    '<button class="rep-add" onclick="INF.agregarMedio()">' + ico('plus', 15) + 'Agregar otro enlace</button>' +
    '<div class="form-help" style="margin-top:14px">Normalmente la carpeta de Drive con la evidencia del mes.</div>';
  },

  leerMedios: function () {
    INF.form.medios = INF.form.medios.map(function (_, i) { return INF.val('inf-medio-' + i); });
  },

  agregarMedio: function () { INF.leerPaso(); INF.form.medios.push(''); INF._mantenerScroll = true; INF.pintar(); },
  quitarMedio: function (i) { INF.leerPaso(); INF.form.medios.splice(i, 1); INF._mantenerScroll = true; INF.pintar(); },

  /* ==========================================================================
     GUARDAR
     ========================================================================== */
  guardar: async function () {
    if (INF.guardando) return;
    INF.leerPaso();
    var f = INF.form;

    if (!f.cargo)  { RCR.toast('Falta tu cargo (paso 1)');  INF.ir(0); return; }
    if (!f.cedula) { RCR.toast('Falta tu cédula (paso 1)'); INF.ir(0); return; }

    var repetido = INF.datos.find(function (d) {
      return d._docId !== INF.editId && d.area === f.area &&
             d.mes === f.mes && String(d.anio) === String(f.anio);
    });
    if (repetido) {
      RCR.toast('Ya tienes un informe de ' + INF.area(f.area).nombre + ' de ' + f.mes + ' ' + f.anio);
      INF.ir(0);
      return;
    }

    /* Se descartan filas y enlaces vacíos */
    Object.keys(f.procesos).forEach(function (k) {
      f.procesos[k] = f.procesos[k].filter(function (x) { return x.actividad || x.fecha; });
    });
    f.medios = f.medios.filter(Boolean);

    if (INF.totalFilas(f) === 0) { RCR.toast('Agrega al menos una actividad'); INF.ir(1); return; }

    INF.guardando = true;
    var btn = document.getElementById('inf-save');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

    var data = Object.assign({}, f, { actualizado: firebase.firestore.FieldValue.serverTimestamp() });
    delete data._docId;

    try {
      var id = INF.editId;
      if (id) {
        await RCR.db.collection(INF.COL).doc(id).set(data, { merge: true });
        var i = INF.datos.findIndex(function (d) { return d._docId === id; });
        if (i >= 0) INF.datos[i] = INF.normalizar(Object.assign({ _docId: id }, f));
      } else {
        data.creado = firebase.firestore.FieldValue.serverTimestamp();
        var ref = await RCR.db.collection(INF.COL).add(data);
        INF.datos.push(INF.normalizar(Object.assign({ _docId: ref.id }, f)));
      }
      INF.datos.sort(function (a, b) { return INF.orden(b) - INF.orden(a); });
      INF.tocado = false;
      INF.render();
      RCR.cerrarSubvista();
      RCR.toast(id ? 'Informe actualizado' : 'Informe guardado');
    } catch (e) {
      console.error('INF.guardar:', e);
      RCR.toast('No se pudo guardar. Revisa tu conexión.');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = ico('save', 15) + 'Guardar informe'; }
    INF.guardando = false;
  },

  /* ── Eliminar ─────────────────────────────────────────────────────────── */
  pedirBorrar: function (docId) {
    if (INF.borrando) return;
    var d = INF.datos.find(function (x) { return x._docId === docId; });
    INF.pendienteBorrar = docId;
    RCR.confirmar({
      titulo: '¿Eliminar el informe?',
      texto: 'Se borra el informe de ' + RCR.esc(d ? (d.mes + ' ' + d.anio) : 'este mes') + '. No se puede deshacer.',
      label: 'Eliminar',
      onOk: 'INF.borrar()'
    });
  },

  borrar: async function () {
    if (INF.borrando || !INF.pendienteBorrar) return;
    INF.borrando = true;
    var btn = document.getElementById('confirm-ok');
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>';
    try {
      await RCR.db.collection(INF.COL).doc(INF.pendienteBorrar).delete();
      INF.datos = INF.datos.filter(function (d) { return d._docId !== INF.pendienteBorrar; });
      INF.render();
      RCR.cerrarModal('m-confirm');
      RCR.toast('Informe eliminado');
    } catch (e) {
      console.error('INF.borrar:', e);
      RCR.toast('No se pudo eliminar');
    }
    btn.disabled = false; btn.innerHTML = 'Eliminar';
    INF.pendienteBorrar = null;
    INF.borrando = false;
  },

  /* ==========================================================================
     VER — formulario de solo lectura (no el PDF), a pantalla completa
     ========================================================================== */
  /* ==========================================================================
     COMPARTIR — link público de solo lectura (ver-informe.html), sin login.
     No guarda nada nuevo: el link apunta al mismo documento por su ID.
     ========================================================================== */
  compartir: function (docId) {
    var base = location.href.replace(/[^/]*$/, '');
    var url = base + 'ver-informe.html?id=' + encodeURIComponent(docId);

    RCR.modal({
      id: 'm-inf-compartir',
      titulo: 'Link para ver el informe',
      sub: 'Cualquiera con este enlace puede ver el PDF, sin iniciar sesión.',
      cuerpo:
        '<div class="form-grp" style="margin-bottom:0">' +
          '<input class="form-inp" id="inf-link-url" value="' + RCR.esc(url) + '" readonly ' +
            'onclick="this.select()">' +
        '</div>',
      acciones:
        '<button class="btn btn-primary" style="width:100%" onclick="INF.copiarLink()">' +
          ico('link', 15) + 'Copiar enlace</button>'
    });
  },

  copiarLink: function () {
    var input = document.getElementById('inf-link-url');
    if (!input) return;
    var hacerToastYcerrar = function () {
      RCR.toast('Enlace copiado');
      RCR.cerrarModal('m-inf-compartir');
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(input.value).then(hacerToastYcerrar, function () {
        input.select(); document.execCommand('copy'); hacerToastYcerrar();
      });
    } else {
      input.select(); document.execCommand('copy'); hacerToastYcerrar();
    }
  },

  ver: function (docId) {
    var d = INF.datos.find(function (x) { return x._docId === docId; });
    if (!d) return;
    d = INF.normalizar(d);
    var a = INF.area(d.area);
    if (!a) return;

    function campo(lbl, val) {
      return '<div class="form-grp">' +
               '<label class="form-lbl">' + lbl + '</label>' +
               '<div class="form-static">' + (val ? RCR.esc(val) : '—') + '</div>' +
             '</div>';
    }

    var html = '<div class="form-wrap">';

    /* Datos generales */
    html += '<div class="inf-ver-sec"><h3 class="inf-ver-h">' + RCR.esc(a.nombre) + '</h3>';
    html += '<div class="form-2col">' +
              campo('Colaborador(a)', d.nombre) +
              campo('Mes y año', d.mes + ' ' + d.anio) +
              campo('Cargo', d.cargo) +
              campo('Fecha de cierre', d.fecha_cierre) +
            '</div>';
    if (a.campoEmpresas) html += campo('Empresas / entidades', d.empresas);
    html += '</div>';

    /* Cada proceso con sus actividades */
    a.procesos.forEach(function (p) {
      var filas = (d.procesos[p.key] || []).filter(function (f) {
        return f.fecha || f.actividad || f.observaciones;
      });
      if (!filas.length) return;
      html += '<div class="inf-ver-sec">' +
                '<div class="inf-ver-cinta" style="background:' + p.color + '">' + RCR.esc(p.nombre) + '</div>';
      filas.forEach(function (f) {
        html += '<div class="inf-ver-act">' +
                  '<div class="inf-ver-act-top">' +
                    '<span class="inf-ver-fecha">' + RCR.esc(f.fecha || '—') + '</span>' +
                    '<span class="inf-ver-estado ' + (f.estado === 'Por ejecutar' ? 'pend' : 'ok') + '">' +
                      RCR.esc(f.estado || 'Ejecutado') + '</span>' +
                  '</div>' +
                  '<div class="inf-ver-actividad">' + RCR.esc(f.actividad || '—') + '</div>' +
                  (f.observaciones ? '<div class="inf-ver-obs">' + RCR.esc(f.observaciones) + '</div>' : '') +
                '</div>';
      });
      html += '</div>';
    });

    /* Medios de verificación */
    var medios = (d.medios || []).filter(Boolean);
    if (medios.length) {
      html += '<div class="inf-ver-sec"><label class="form-lbl">Medios de verificación</label>';
      medios.forEach(function (m) {
        html += '<a class="inf-ver-link" href="' + RCR.esc(m) + '" target="_blank" rel="noopener">' + RCR.esc(m) + '</a>';
      });
      html += '</div>';
    }

    /* Firmas */
    html += '<div class="inf-ver-sec"><div class="form-2col">';
    html += campo('Elaborado por', d.nombre + ' · ' + d.cargo + ' · ' + d.cedula);
    html += '</div></div>';

    /* Acciones */
    html += '<div class="subvista-actions">' +
              '<button class="btn btn-primary" onclick="INF.descargar(\'' + docId + '\',this)">' +
                ico('download', 15) + 'Descargar PDF</button>' +
            '</div>';

    html += '</div>';

    RCR.subvista({ titulo: 'Informe · ' + d.mes + ' ' + d.anio, cuerpo: html });
  },

  /* ==========================================================================
     PDF — texto real con pdfmake
     Ventajas frente a la versión imagen: texto seleccionable y buscable,
     nítido a cualquier zoom, archivo liviano. pdfmake maneja de fábrica los
     saltos de página que no parten filas y repite el encabezado de la tabla.
     ========================================================================== */
  LIB_PDFMAKE: 'https://cdnjs.cloudflare.com/ajax/libs/pdfmake/0.2.10/pdfmake.min.js',

  descargar: async function (docId, btn) {
    if (INF.generando) return;
    var d = INF.datos.find(function (x) { return x._docId === docId; });
    if (!d) return;
    var a = INF.area(d.area);
    if (!a) { RCR.toast('Área no reconocida'); return; }

    INF.generando = true;
    var txt = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    RCR.toast('Generando el PDF');

    try {
      await RCR.cargarLib(INF.LIB_PDFMAKE);
      if (!window.registrarOutfit || !registrarOutfit()) {
        console.warn('Outfit no disponible; se usa la fuente por defecto de pdfmake.');
      }

      var nombre = 'Informe ' + a.nombre + ' - ' + d.mes + ' ' + d.anio + '.pdf';

      /* 1ª pasada: contar páginas. El background va contando el nº de página
         más alto que pdfmake solicita; así sabemos cuál es la última para
         colocar la franja solo ahí. */
      INF.totalPaginas = 1;
      INF._contando = true; INF._maxPag = 1;
      var docConteo = INF.docDefinicion(d, a);
      var bgOriginal = docConteo.background;
      docConteo.background = function (currentPage) {
        if (currentPage > INF._maxPag) INF._maxPag = currentPage;
        return null;                         // en el conteo no se dibuja nada
      };
      await new Promise(function (resolve) {
        pdfMake.createPdf(docConteo).getBuffer(function () { resolve(); });
      });
      INF._contando = false;
      INF.totalPaginas = INF._maxPag;

      /* 2ª pasada: documento real, ya con el total de páginas conocido. */
      var doc = INF.docDefinicion(d, a);

      await new Promise(function (resolve, reject) {
        try {
          pdfMake.createPdf(doc).download(nombre, function () { resolve(); });
        } catch (e) { reject(e); }
      });

      RCR.toast('PDF descargado');
    } catch (e) {
      console.error('INF.descargar:', e);
      RCR.toast('No se pudo generar el PDF');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = txt; }
    INF.generando = false;
  },

  /* Medidas del documento (en puntos) */
  PDF: {
    margen: 40,
    anchoUtil: 595.28 - 80,          // A4 menos márgenes
    colFecha: 62, colEstado: 66, colObs: 108,
    gris: '#EBEBEB', borde: '#D9DCDF', bordeSuave: '#E6E6E6',
    textoTabla: '#2C2C2C', tit: '#1B1B1B'
  },

  /* Estructura del informe para pdfmake */
  docDefinicion: function (d, a) {
    var P = INF.PDF;
    var content = [];

    /* ── Encabezado: SOLO la tabla de datos. El logo lo aporta la hoja de
         fondo (window.FONDOS), así que aquí no se dibuja; la tabla se ubica a
         la derecha del logo del fondo mediante un margen izquierdo. ────────── */
    var tablaDatos = {
      table: {
        widths: ['auto', '*', 'auto', '*'],
        body: (function () {
          var filas = [
            [{ text: a.tituloEncabezado || 'Informe de cumplimiento de actividades',
               colSpan: 4, alignment: 'center',
               bold: true, fontSize: 9.5, color: '#333', margin: [0, 3, 0, 3] }, {}, {}, {}],
            [
              { text: 'Colaborador(a):', bold: true, fontSize: 9, margin: [0, 2, 0, 2] },
              { text: d.nombre, fontSize: 9, margin: [0, 2, 0, 2] },
              { text: 'Mes y año:', bold: true, fontSize: 9, margin: [0, 2, 0, 2] },
              { text: d.mes + ' ' + d.anio, fontSize: 9, margin: [0, 2, 0, 2] }
            ],
            [
              { text: 'Cargo:', bold: true, fontSize: 9, margin: [0, 2, 0, 2] },
              { text: d.cargo, fontSize: 9, margin: [0, 2, 0, 2] },
              { text: 'Fecha de cierre:', bold: true, fontSize: 9, margin: [0, 2, 0, 2] },
              { text: d.fecha_cierre, fontSize: 9, margin: [0, 2, 0, 2] }
            ]
          ];
          if (a.campoEmpresas) {
            filas.push([
              { text: 'Empresas/entidades:', bold: true, fontSize: 9, margin: [0, 2, 0, 2] },
              { text: d.empresas || '', colSpan: 3, fontSize: 9, margin: [0, 2, 0, 2] }, {}, {}
            ]);
          }
          return filas;
        })()
      },
      layout: {
        hLineWidth: function () { return 0.7; },
        vLineWidth: function () { return 0.7; },
        hLineColor: function () { return '#C9CDD1'; },
        vLineColor: function () { return '#C9CDD1'; }
      },
      /* margen izquierdo: deja pasar el logo del fondo (que llega ~33% del ancho).
         33% de 595pt ≈ 196pt; menos el margen de página (40) ≈ 156pt. */
      margin: [175, 8, 0, 20]
    };
    content.push(tablaDatos);

    /* ── Subtítulo ──────────────────────────────────────────────────────── */
    content.push({
      text: [
        'Informe de ', { text: 'cumplimiento', bold: true }, ' de actividades – ',
        { text: d.mes + ' ' + d.anio, bold: true }
      ],
      alignment: 'center', fontSize: 13, color: '#3d3d3d', margin: [0, 0, 0, 24]
    });

    /* ── Un bloque por proceso ──────────────────────────────────────────── */
    a.procesos.forEach(function (p) {
      var filas = d.procesos[p.key] || [];
      if (!filas.length) return;

      /* Cinta de título con el color del proceso */
      content.push({
        table: { widths: ['*'], body: [[
          { text: p.nombre, alignment: 'center', bold: true, color: '#ffffff',
            fontSize: 11.5, fillColor: p.color, margin: [0, 6, 0, 6] }
        ]]},
        layout: 'noBorders',
        margin: [0, 0, 0, 0]
      });

      var body = [[
        { text: 'Fecha', style: 'th' },
        { text: 'Actividad', style: 'th' },
        { text: 'Estado', style: 'th' },
        { text: 'Observaciones', style: 'th' }
      ]];

      filas.forEach(function (f) {
        var ok = f.estado !== 'Por ejecutar';
        body.push([
          { text: f.fecha || '', style: 'td', alignment: 'center', color: '#555' },
          { text: f.actividad || '', style: 'td' },
          { text: f.estado || 'Ejecutado', style: 'tdEstado',
            color: ok ? '#1B7F45' : '#A96A12', fillColor: ok ? '#E8F7EE' : '#FFF4E0' },
          { text: f.observaciones || '', style: 'td', color: '#555' }
        ]);
      });

      content.push({
        table: {
          headerRows: 1,
          widths: [P.colFecha, '*', P.colEstado, P.colObs],
          body: body
        },
        layout: {
          hLineWidth: function () { return 0.5; },
          vLineWidth: function () { return 0.5; },
          hLineColor: function () { return P.bordeSuave; },
          vLineColor: function () { return P.bordeSuave; }
        },
        margin: [0, 0, 0, 22]
      });
    });

    /* ── Medios de verificación ─────────────────────────────────────────── */
    var medios = (d.medios || []).filter(Boolean);
    if (medios.length) {
      content.push({ text: 'Medios de verificación', bold: true, fontSize: 11, color: '#4a4a4a', margin: [0, 4, 0, 6] });
      medios.forEach(function (m) {
        content.push({ text: m, link: m, color: '#1a56c4', fontSize: 9.5, margin: [0, 0, 0, 2] });
      });
    }

    /* ── Tabla de firmas: solo "Elaborado por", recuadro angosto y centrado.
         Se centra con columnas espaciadoras a los lados (pdfmake no centra
         tablas por sí solo). ─ */
    var firmaTabla = {
      table: {
        widths: [200],
        body: [
          [ { text: 'Elaborado por', style: 'thFirma' } ],
          [ { text: ' ', margin: [0, 22, 0, 22] } ],
          [ { text: d.nombre, style: 'tdFirma' } ],
          [ { text: d.cargo, style: 'tdFirma' } ],
          [ { text: d.cedula, style: 'tdFirma' } ]
        ]
      },
      layout: {
        hLineWidth: function () { return 0.7; },
        vLineWidth: function () { return 0.7; },
        hLineColor: function () { return '#C9CDD1'; },
        vLineColor: function () { return '#C9CDD1'; }
      }
    };
    var firmas = {
      unbreakable: true,
      margin: [0, 22, 0, 0],
      columns: [ { width: '*', text: '' }, { width: 200, stack: [firmaTabla] }, { width: '*', text: '' } ]
    };
    content.push(firmas);

    /* Capas oficiales A4 (sin recortar ni escalar el diseño):
         - logo   -> SOLO en la 1ª página.
         - franja -> SOLO en la última página.
       Ambas se dibujan por background a tamaño A4 completo, así cada elemento
       queda en la posición exacta de la hoja original. Para saber cuál es la
       última página se usa doble pasada (INF.totalPaginas). */
    var capaLogo   = window.FONDO_LOGO   ? window.FONDO_LOGO[d.area]   : null;
    var capaFranja = window.FONDO_FRANJA ? window.FONDO_FRANJA[d.area] : null;
    var totalPag   = INF.totalPaginas || 1;    // lo fija la 1ª pasada

    var doc = {
      pageSize: 'A4',
      pageMargins: [P.margen, 64, P.margen, capaFranja ? 150 : 60],
      defaultStyle: { font: window.__outfitListo ? 'Outfit' : undefined, fontSize: 10, color: P.textoTabla },
      styles: {
        th: { bold: true, fontSize: 10, color: '#4a4a4a', fillColor: P.gris, alignment: 'center', margin: [0, 5, 0, 5] },
        td: { fontSize: 10, margin: [0, 4, 0, 4], lineHeight: 1.15 },
        tdEstado: { bold: true, fontSize: 9, alignment: 'center', margin: [0, 5, 0, 5] },
        thFirma: { bold: true, fontSize: 10.5, color: '#333', alignment: 'center', margin: [0, 6, 0, 6] },
        tdFirma: { fontSize: 10.5, color: '#333', alignment: 'center', margin: [0, 6, 0, 6] }
      },
      content: content,
      background: function (currentPage) {
        var capas = [];
        if (capaLogo && currentPage === 1) {
          capas.push({ image: capaLogo, width: 595.28, height: 841.89, absolutePosition: { x: 0, y: 0 } });
        }
        if (capaFranja && currentPage === totalPag) {
          capas.push({ image: capaFranja, width: 595.28, height: 841.89, absolutePosition: { x: 0, y: 0 } });
        }
        return capas.length ? capas : null;
      }
    };

    return doc;
  },

  /* (En desuso) Fila de logos del pie con logos sueltos, en una sola fila de columnas:
       [ logo del área ] [ espaciador flexible ] [ aliado ][gap][ aliado ]…
     Todos a la MISMA ALTURA con su ancho natural (respetan su proporción).
  /* Fila de logos del pie con logos sueltos, en una sola fila de columnas:
       [ logo del área ] [ espaciador flexible ] [ aliado ][gap][ aliado ]…
     Se dimensionan por ÁREA VISUAL: cada logo ocupa una superficie parecida
     (ancho × alto ≈ constante), así los apaisados no se ven gigantes ni los
     compactos diminutos. La altura se acota a un rango suave para que la fila
     quede prolija. Todo dentro del ancho útil A4. */
  footerLogos: function (logoArea, aliados) {
    var P = INF.PDF;
    var AREA = 1150;         // superficie objetivo por logo, en pt²
    var H_MIN = 20, H_MAX = 34;

    function celda(L) {
      var alto = Math.sqrt(AREA / L.ar);          // alto = sqrt(area/ar)
      alto = Math.max(H_MIN, Math.min(H_MAX, alto));
      var ancho = Math.round(alto * L.ar);
      return { width: ancho, image: L.src, fit: [ancho, Math.round(alto)] };
    }

    var cols = [];

    /* Logo del área, a la izquierda */
    if (logoArea) cols.push(celda(logoArea));

    /* Espaciador flexible: empuja los aliados hacia la derecha */
    cols.push({ width: '*', text: '' });

    /* Aliados, a la derecha, separados por un gap fijo uniforme */
    var GAP = 16;
    (aliados || []).forEach(function (L, i) {
      if (i > 0) cols.push({ width: GAP, text: '' });
      cols.push(celda(L));
    });

    return {
      margin: [P.margen, 8, P.margen, 18],
      columns: cols,
      columnGap: 0,
      alignment: 'center'
    };
  },




  /* ==========================================================================
     PLANTILLA DEL DOCUMENTO
     ========================================================================== */
  plantillaHTML: function (d) {
    d = INF.normalizar(d);
    var a = INF.area(d.area);
    if (!a) return '<div class="infdoc">Área no reconocida.</div>';

    var enc =
      '<div class="infdoc-enc" data-bloque="enc">' +
        '<div class="infdoc-enc-logo">' + logoImg(a.logo, 50) + '</div>' +
        '<div class="infdoc-enc-tabla">' +
          '<div class="infdoc-enc-tit">' + RCR.esc(a.tituloEncabezado || 'Informe de cumplimiento de actividades') + '</div>' +
          '<div class="infdoc-enc-fila">' +
            '<div class="infdoc-enc-c"><span class="infdoc-enc-l">Colaborador(a):</span>' +
              '<span class="infdoc-enc-v">' + RCR.esc(d.nombre) + '</span></div>' +
            '<div class="infdoc-enc-c"><span class="infdoc-enc-l">Mes y año:</span>' +
              '<span class="infdoc-enc-v">' + RCR.esc(d.mes + ' ' + d.anio) + '</span></div>' +
          '</div>' +
          '<div class="infdoc-enc-fila">' +
            '<div class="infdoc-enc-c"><span class="infdoc-enc-l">Cargo:</span>' +
              '<span class="infdoc-enc-v">' + RCR.esc(d.cargo) + '</span></div>' +
            '<div class="infdoc-enc-c"><span class="infdoc-enc-l">Fecha de cierre:</span>' +
              '<span class="infdoc-enc-v">' + RCR.esc(d.fecha_cierre) + '</span></div>' +
          '</div>' +
          (a.campoEmpresas
            ? '<div class="infdoc-enc-fila">' +
                '<div class="infdoc-enc-c" style="flex:1"><span class="infdoc-enc-l">Empresas/entidades:</span>' +
                  '<span class="infdoc-enc-v">' + RCR.esc(d.empresas || '') + '</span></div>' +
              '</div>'
            : '') +
        '</div>' +
      '</div>' +
      '<div class="infdoc-subtit" data-bloque="subtit">Informe de <b>cumplimiento</b> de actividades – ' +
        '<b>' + RCR.esc(d.mes + ' ' + d.anio) + '</b></div>';

    var cuerpo = a.procesos.map(function (p) {
      var filas = d.procesos[p.key] || [];
      if (!filas.length) return '';
      return '<div class="infdoc-proc" data-bloque="proc">' +
        '<div class="infdoc-proc-tit" style="background:' + p.color + '">' + RCR.esc(p.nombre) + '</div>' +
        '<table class="infdoc-t"><thead><tr>' +
          '<th class="infdoc-c1">Fecha</th><th>Actividad</th>' +
          '<th class="infdoc-c3">Estado</th><th class="infdoc-c4">Observaciones</th>' +
        '</tr></thead><tbody>' +
        filas.map(function (f) {
          var ok = f.estado !== 'Por ejecutar';
          return '<tr>' +
            '<td class="infdoc-c1">' + RCR.esc(f.fecha) + '</td>' +
            '<td>' + RCR.esc(f.actividad).replace(/\n/g, '<br>') + '</td>' +
            '<td class="infdoc-c3"><span class="infdoc-pill ' + (ok ? 'ok' : 'pend') + '">' +
              RCR.esc(f.estado || 'Ejecutado') + '</span></td>' +
            '<td class="infdoc-c4">' + (f.observaciones ? RCR.esc(f.observaciones).replace(/\n/g, '<br>') : '') + '</td>' +
          '</tr>';
        }).join('') +
        '</tbody></table></div>';
    }).join('');

    var medios = d.medios.filter(Boolean);
    var cierre =
      (medios.length
        ? '<div data-bloque="medios">' +
            '<div class="infdoc-cierre-tit">Medios de verificación</div>' +
            '<div class="infdoc-medios">' +
              medios.map(function (m) { return '<div>' + RCR.esc(m) + '</div>'; }).join('') +
            '</div>' +
          '</div>'
        : '') +
      /* Tabla de firma: solo "Elaborado por", recuadro angosto. */
      '<div data-bloque="validacion" data-atomico="1">' +
        '<table class="infdoc-val infdoc-val-solo">' +
          '<tr><th>Elaborado por</th></tr>' +
          '<tr><td class="firma"></td></tr>' +
          '<tr><td>' + RCR.esc(d.nombre) + '</td></tr>' +
          '<tr><td>' + RCR.esc(d.cargo) + '</td></tr>' +
          '<tr><td>' + RCR.esc(d.cedula) + '</td></tr>' +
        '</table>' +
      '</div>' +
      (a.sinPie ? '' :
        '<div data-bloque="aliados" data-atomico="1" data-borde="1">' +
          '<div class="infdoc-pie">' + pieImg(d.area, 702) + '</div>' +
        '</div>');

    return '<div class="infdoc">' + enc + cuerpo + cierre + '</div>';
  }
};

window.INF       = INF;
window.INF_AREAS = INF_AREAS;

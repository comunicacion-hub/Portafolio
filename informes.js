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
  LIB_CANVAS: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  LIB_PDF:    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',

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
          '<div class="inf-area-badge" style="background:' + color + '">' + RCR.esc(sigla) + '</div>' +
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
          '<button class="btn btn-primary" onclick="INF.descargar(\'' + d._docId + '\',this)">' + ico('download', 15) + 'PDF</button>' +
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

    RCR.modal({
      id: 'm-inf',
      titulo: docId ? 'Editar informe' : 'Nuevo informe',
      sub: RCR.esc(RCR.user.nombre),
      cuerpo: '<div id="inf-body"></div>',
      acciones: '<div id="inf-foot" style="display:flex;gap:10px;flex:1;"></div>',
      persistente: true,
      onCerrar: function () { INF.intentarCerrar(); }
    });
    INF.pintar();
  },

  intentarCerrar: function () {
    INF.leerPaso();
    if (!INF.tocado) { RCR.cerrarModal('m-inf'); return; }
    RCR.confirmar({
      titulo: '¿Salir sin guardar?',
      texto: 'Los cambios de esta sesión se pierden.',
      label: 'Salir',
      onOk: "RCR.cerrarModal('m-confirm');RCR.cerrarModal('m-inf');"
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

    var body = document.querySelector('#m-inf .modal-body');
    if (body) body.scrollTop = 0;
  },

  ir: function (i) {
    INF.leerPaso();
    var n = INF.pasos().length;
    INF.paso = Math.max(0, Math.min(n - 1, i));
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
      '</div>' +
      (a ? '<div class="form-grp" style="margin-bottom:0">' +
             '<label class="form-lbl">Validado por</label>' +
             '<div class="form-static" style="font-weight:500;font-size:13px;line-height:1.5">' +
               RCR.esc(a.validador.nombre) + '<br>' +
               '<span style="color:var(--text-muted);font-size:12px">' + RCR.esc(a.validador.cargo) + '</span>' +
             '</div>' +
             '<div class="form-help">Se completa solo según el área.</div>' +
           '</div>' : '');
  },

  leerDatos: function () {
    var f = INF.form;
    f.mes          = INF.val('inf-mes')  || f.mes;
    f.anio         = parseInt(INF.val('inf-anio'), 10) || f.anio;
    f.fecha_cierre = INF.val('inf-cierre');
    f.cargo        = INF.val('inf-cargo');
    f.cedula       = INF.val('inf-cedula');
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
    INF.pintar();
  },

  quitar: function (procKey, i) {
    INF.leerPaso();
    INF.form.procesos[procKey].splice(i, 1);
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

  agregarMedio: function () { INF.leerPaso(); INF.form.medios.push(''); INF.pintar(); },
  quitarMedio: function (i) { INF.leerPaso(); INF.form.medios.splice(i, 1); INF.pintar(); },

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
      RCR.cerrarModal('m-inf');
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
     VISTA PREVIA
     ========================================================================== */
  ver: function (docId) {
    var d = INF.datos.find(function (x) { return x._docId === docId; });
    if (!d) return;
    RCR.modal({
      id: 'm-inf-ver',
      titulo: 'Vista previa',
      sub: RCR.esc(d.mes + ' ' + d.anio),
      cuerpo: '<div class="cv-prev-wrap" id="inf-prev-wrap">' +
                '<div class="cv-prev-esc" id="inf-prev-esc">' + INF.plantillaHTML(d) + '</div>' +
              '</div>',
      acciones:
        '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-inf-ver\')">Cerrar</button>' +
        '<button class="btn btn-primary" onclick="INF.descargar(\'' + docId + '\',this)">' +
          ico('download', 15) + 'Descargar PDF</button>'
    });

    requestAnimationFrame(function () {
      var wrap = document.getElementById('inf-prev-wrap');
      var esc  = document.getElementById('inf-prev-esc');
      if (!wrap || !esc || !esc.firstChild) return;
      var k = Math.min(1, wrap.clientWidth / 702);
      esc.style.transform = 'scale(' + k + ')';
      esc.style.height = (esc.firstChild.offsetHeight * k) + 'px';
    });
  },

  /* ==========================================================================
     PDF
     Se captura bloque por bloque y se acomodan en páginas: así el corte
     nunca cae en mitad de una fila de la tabla.
     ========================================================================== */
  descargar: async function (docId, btn) {
    if (INF.generando) return;
    var d = INF.datos.find(function (x) { return x._docId === docId; });
    if (!d) return;

    INF.generando = true;
    var txt = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    RCR.toast('Generando el PDF');

    try {
      await RCR.cargarLib(INF.LIB_CANVAS);
      await RCR.cargarLib(INF.LIB_PDF);

      var box = document.getElementById('inf-render');
      if (!box) {
        box = document.createElement('div');
        box.id = 'inf-render';
        box.style.cssText = 'position:fixed;left:-10000px;top:0;z-index:-1;';
        document.body.appendChild(box);
      }
      box.innerHTML = INF.plantillaHTML(d);

      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await new Promise(function (r) { setTimeout(r, 200); });

      var ESCALA = 2;
      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      var PW = pdf.internal.pageSize.getWidth();
      var PH = pdf.internal.pageSize.getHeight();
      var MX = (PW - 702 * 0.75) / 2;     // 702 px de contenido a 96 dpi
      var MY = 40;
      var UTIL = PH - MY * 2;
      var ANCHO = 702 * 0.75;

      var bloques = box.querySelectorAll('[data-bloque]');
      var UTIL_CSS = UTIL / 0.75;                // alto útil de página en px CSS
      var y = MY;

      for (var b = 0; b < bloques.length; b++) {
        var el = bloques[b];
        var cortes = INF.cortesSeguros(el);      // px CSS, relativos al bloque
        var canvas = await html2canvas(el, {
          scale: ESCALA, backgroundColor: null, useCORS: true, logging: false
        });
        var altoCss = canvas.height / ESCALA;
        var libre = (MY + UTIL - y) / 0.75;      // px CSS que quedan en la página

        /* 1. Entra tal cual en lo que queda */
        if (altoCss <= libre + 0.5) {
          INF.pegar(pdf, canvas, ESCALA, 0, altoCss, MX, y, ANCHO);
          y += altoCss * 0.75 + 6;
          continue;
        }

        /* 2. No entra aquí pero sí en una página limpia: se pasa entero */
        if (altoCss <= UTIL_CSS + 0.5) {
          pdf.addPage(); y = MY;
          INF.pegar(pdf, canvas, ESCALA, 0, altoCss, MX, y, ANCHO);
          y += altoCss * 0.75 + 6;
          continue;
        }

        /* 3. Más alto que una página: se parte, y si se puede, por borde de fila */
        var arriba = 0;
        while (arriba < altoCss - 0.5) {
          libre = (MY + UTIL - y) / 0.75;
          if (libre < 60) { pdf.addPage(); y = MY; libre = UTIL_CSS; }

          var pendiente = altoCss - arriba;
          if (pendiente <= libre + 0.5) {
            INF.pegar(pdf, canvas, ESCALA, arriba, pendiente, MX, y, ANCHO);
            y += pendiente * 0.75;
            arriba = altoCss;
            break;
          }

          var corte = INF.mejorCorte(cortes, arriba, libre, altoCss);
          if (corte === null) corte = arriba + libre;
          INF.pegar(pdf, canvas, ESCALA, arriba, corte - arriba, MX, y, ANCHO);
          arriba = corte;
          pdf.addPage(); y = MY;
        }
        y += 6;
      }

      var a = INF.area(d.area);
      pdf.save('Informe ' + (a ? a.nombre : d.area) + ' - ' + d.mes + ' ' + d.anio + '.pdf');
      box.innerHTML = '';
      RCR.toast('PDF descargado');

    } catch (e) {
      console.error('INF.descargar:', e);
      RCR.toast('No se pudo generar el PDF');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = txt; }
    INF.generando = false;
  },

  /* Coloca un recorte del canvas en el PDF */
  pegar: function (pdf, canvas, escala, topCss, altoCss, x, y, ancho) {
    var t = document.createElement('canvas');
    t.width  = canvas.width;
    t.height = Math.round(altoCss * escala);
    var ctx = t.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, t.width, t.height);
    ctx.drawImage(canvas, 0, Math.round(topCss * escala), canvas.width, t.height,
                  0, 0, canvas.width, t.height);
    pdf.addImage(t.toDataURL('image/jpeg', 0.94), 'JPEG', x, y, ancho, altoCss * 0.75);
  },

  /* Bordes de fila donde se puede cortar sin partir una celda */
  cortesSeguros: function (el) {
    var base = el.getBoundingClientRect().top;
    var puntos = [];
    el.querySelectorAll('tr').forEach(function (tr) {
      var r = tr.getBoundingClientRect();
      puntos.push(r.top - base);
      puntos.push(r.bottom - base);
    });
    return puntos.sort(function (a, b) { return a - b; });
  },

  /* Corte más bajo que quepa en el espacio disponible */
  mejorCorte: function (cortes, desde, disponible, altoTotal) {
    var limite = desde + disponible;
    var mejor = null;
    for (var i = 0; i < cortes.length; i++) {
      var c = cortes[i];
      if (c > desde + 24 && c <= limite && c < altoTotal - 1) mejor = c;
    }
    return mejor;
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
          '<div class="infdoc-enc-tit">Informe de cumplimiento de actividades</div>' +
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
      /* La tabla de validación y los logos nunca se parten */
      '<div data-bloque="validacion" data-atomico="1">' +
        '<table class="infdoc-val">' +
          '<tr><th></th><th>Elaborado por</th><th>Validado por</th></tr>' +
          '<tr><td class="l"></td><td class="firma"></td><td class="firma"></td></tr>' +
          '<tr><td class="l">Nombre</td><td>' + RCR.esc(d.nombre) + '</td>' +
            '<td>' + RCR.esc(a.validador.nombre) + '</td></tr>' +
          '<tr><td class="l">Cargo</td><td>' + RCR.esc(d.cargo) + '</td>' +
            '<td>' + RCR.esc(a.validador.cargo) + '</td></tr>' +
          '<tr><td class="l">C.I.</td><td>' + RCR.esc(d.cedula) + '</td>' +
            '<td>' + RCR.esc(a.validador.cedula) + '</td></tr>' +
        '</table>' +
        '<div class="infdoc-aliados">' +
          a.aliados.map(function (k) { return logoImg(k, 34); }).join('') +
        '</div>' +
      '</div>';

    return '<div class="infdoc">' + enc + cuerpo + cierre + '</div>';
  }
};

window.INF       = INF;
window.INF_AREAS = INF_AREAS;

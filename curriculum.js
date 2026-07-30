/* ==========================================================================
   Mi RCR — curriculum.js
   Ficha de currículum por pasos, guardada en Firestore (un documento por
   colaborador) y descargable en PDF con el diseño institucional.
   ========================================================================== */

window.RCR = window.RCR || { modulos: {} };

/* ==========================================================================
   CATÁLOGOS
   ========================================================================== */
var CV_CAT = {

  aniosExperiencia: ['Menos de 1 año', '1 a 3 años', '3 a 5 años', 'Más de 5 años'],

  areasExperiencia: [
    'Comunicación estratégica', 'Comunicación comunitaria', 'Diseño gráfico',
    'Producción audiovisual', 'Gestión cultural', 'Educación ambiental',
    'Migración', 'Economía circular', 'Derechos humanos', 'Juventudes',
    'Género', 'Facilitación comunitaria', 'Investigación social', 'Otro'
  ],
  areasExperienciaMax: 3,

  nivelAcademico: [
    'Bachillerato', 'Tecnólogo', 'Licenciatura', 'Ingeniería',
    'Maestría', 'Doctorado', 'Curso o certificación'
  ],

  competencias: [
    { key: 'desarrollo_comunitario', titulo: 'Desarrollo comunitario', opciones: [
      'Diagnóstico participativo', 'Mediación comunitaria', 'Organización social',
      'Fortalecimiento organizacional', 'Participación ciudadana',
      'Desarrollo territorial', 'Gestión de voluntariado',
      'Monitoreo y evaluación de acciones sociales'
    ]},
    { key: 'formacion_facilitacion', titulo: 'Formación y facilitación', opciones: [
      'Facilitación de talleres', 'Diseño de metodologías participativas',
      'Capacitación de grupos', 'Educación popular', 'Educación ambiental',
      'Formación de líderes'
    ]},
    { key: 'comunicacion', titulo: 'Comunicación', opciones: [
      'Comunicación estratégica', 'Comunicación comunitaria',
      'Comunicación para el desarrollo', 'Gestión de redes sociales',
      'Redacción institucional', 'Storytelling', 'Producción de contenidos'
    ]},
    { key: 'ofimatica', titulo: 'Ofimática', opciones: [
      'Word', 'Excel', 'PowerPoint', 'Google Workspace'
    ]}
  ],

  experienciaSocial: [
    'Migración y movilidad humana', 'Derechos humanos', 'Juventudes',
    'Niñez y adolescencia', 'Género', 'Diversidades', 'Medio ambiente',
    'Cambio climático', 'Economía circular', 'Seguridad alimentaria',
    'Cultura', 'Arte comunitario', 'Emprendimiento', 'Empleabilidad',
    'Desarrollo local', 'Participación ciudadana', 'Prevención de violencia',
    'Salud comunitaria', 'Inclusión social'
  ],

  nivelIdioma: ['Básico', 'Intermedio', 'Avanzado', 'Nativo']
};

/* ==========================================================================
   MÓDULO
   ========================================================================== */
RCR.modulos.curriculum = {
  id: 'curriculum',
  titulo: 'Currículum',
  icono: 'curriculum',
  enNav: true,
  fab: { icono: 'plus', label: 'Llenar mi ficha', accion: function () { CV.abrirForm(); } },

  mount: function (root) {
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Mi currículum</div>' +
          '<div class="section-sub">Llena la ficha una vez y descarga tu CV cuando lo necesites</div>' +
        '</div>' +
      '</div>' +
      '<div id="cv-cont"></div>';
    CV.cargar();
  },

  onShow: function () { CV.render(); }
};

/* ==========================================================================
   CV
   ========================================================================== */
var CV = {

  COL: 'Curriculums',

  LIB_CANVAS: 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
  LIB_PDF:    'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',

  datos: null,      // ficha guardada
  form: null,       // copia de trabajo
  paso: 0,
  tocado: false,
  guardando: false,
  generando: false,
  cargado: false,

  /* ── Estructura vacía ─────────────────────────────────────────────────── */
  nueva: function () {
    return {
      correo: RCR.user.correo,
      nombre: RCR.user.nombre,
      ciudad: '', provincia: '', telefono: '', linkedin: '',
      foto_b64: '',
      perfil: { profesion: '', anios_experiencia: '', areas_experiencia: [], fortalezas: '' },
      formacion: [],
      experiencia: [],
      proyectos: [],
      competencias: { desarrollo_comunitario: [], formacion_facilitacion: [], comunicacion: [], ofimatica: [] },
      experiencia_social: [],
      idiomas: []
    };
  },

  /* Rellena lo que falte para que una ficha vieja no rompa el formulario */
  normalizar: function (d) {
    var base = CV.nueva();
    var o = Object.assign(base, d || {});
    o.perfil       = Object.assign(CV.nueva().perfil, d && d.perfil ? d.perfil : {});
    o.competencias = Object.assign(CV.nueva().competencias, d && d.competencias ? d.competencias : {});
    ['formacion', 'experiencia', 'proyectos', 'idiomas', 'experiencia_social'].forEach(function (k) {
      if (!Array.isArray(o[k])) o[k] = [];
    });
    if (!Array.isArray(o.perfil.areas_experiencia)) o.perfil.areas_experiencia = [];
    CV_CAT.competencias.forEach(function (g) {
      if (!Array.isArray(o.competencias[g.key])) o.competencias[g.key] = [];
    });
    return o;
  },

  /* ── Lectura ──────────────────────────────────────────────────────────── */
  cargar: async function () {
    var cont = document.getElementById('cv-cont');
    cont.innerHTML = RCR.cargando('Buscando tu ficha');
    try {
      var doc = await RCR.db.collection(CV.COL).doc(RCR.user.correo).get();
      CV.datos = doc.exists ? CV.normalizar(doc.data()) : null;
      CV.cargado = true;
      CV.render();
    } catch (e) {
      console.error('CV.cargar:', e);
      cont.innerHTML = RCR.vacio('alert', 'No se pudo cargar tu ficha',
        'Revisa tu conexión y vuelve a entrar a la sección.');
    }
  },

  /* ── Vista de la sección ──────────────────────────────────────────────── */
  render: function () {
    var cont = document.getElementById('cv-cont');
    if (!cont || !CV.cargado) return;

    if (!CV.datos) {
      cont.innerHTML = RCR.vacio('curriculum', 'Todavía no llenas tu ficha',
        'Toca + para empezar. Puedes guardarla y seguir después.');
      CV.pintarFab('plus', 'Llenar mi ficha');
      return;
    }

    var d   = CV.datos;
    var pct = CV.completitud(d);
    var ini = RCR.iniciales(d.nombre);
    var sub = [d.perfil.profesion, d.ciudad].filter(Boolean).join(' · ');

    cont.innerHTML =
      '<div class="cv-resumen">' +
        '<div class="cv-res-top">' +
          '<div class="cv-res-foto">' +
            (d.foto_b64 ? '<img src="' + d.foto_b64 + '" alt="">' : RCR.esc(ini)) +
          '</div>' +
          '<div class="cv-res-info">' +
            '<strong>' + RCR.esc(d.nombre) + '</strong>' +
            '<small>' + RCR.esc(sub || d.correo) + '</small>' +
          '</div>' +
        '</div>' +
        '<div class="cv-barra"><span style="width:' + pct + '%"></span></div>' +
        '<div class="cv-barra-txt">Ficha completa al ' + pct + '%' +
          (pct < 100 ? ' — puedes seguir llenándola cuando quieras' : '') + '</div>' +
        '<div class="cv-res-btns">' +
          '<button class="btn btn-glass" onclick="CV.ver()">' + ico('eye', 15) + 'Ver</button>' +
          '<button class="btn btn-glass" onclick="CV.abrirForm()">' + ico('edit', 15) + 'Editar</button>' +
          '<button class="btn btn-primary" id="cv-pdf" onclick="CV.descargar()">' + ico('download', 15) + 'PDF</button>' +
        '</div>' +
      '</div>';

    CV.pintarFab('edit', 'Editar mi ficha');
  },

  pintarFab: function (icono, label) {
    var fab = document.getElementById('fab');
    if (!fab || RCR.activo !== 'curriculum') return;
    fab.innerHTML = ico(icono, 24, 2.4);
    fab.setAttribute('aria-label', label);
  },

  completitud: function (d) {
    var checks = [
      !!d.ciudad, !!d.provincia, !!d.telefono,
      !!d.perfil.profesion, !!d.perfil.anios_experiencia,
      d.perfil.areas_experiencia.length > 0, !!d.perfil.fortalezas,
      d.formacion.length > 0, d.experiencia.length > 0, d.proyectos.length > 0,
      CV_CAT.competencias.some(function (g) { return (d.competencias[g.key] || []).length > 0; }),
      d.experiencia_social.length > 0, d.idiomas.length > 0
    ];
    return Math.round(checks.filter(Boolean).length / checks.length * 100);
  },

  /* ==========================================================================
     FORMULARIO POR PASOS
     ========================================================================== */
  PASOS: [
    { tit: 'Datos de contacto',    sub: 'Cómo te ubican y qué aparece en la cabecera de tu CV.' },
    { tit: 'Perfil profesional',   sub: 'Tu ocupación, tu experiencia y en qué eres fuerte.' },
    { tit: 'Formación académica',  sub: 'Agrega cada título o certificación que quieras mostrar.' },
    { tit: 'Experiencia laboral',  sub: 'Empieza por el cargo más reciente.' },
    { tit: 'Proyectos destacados', sub: 'Los primeros tres aparecen en el CV.' },
    { tit: 'Competencias',         sub: 'Marca lo que manejas en cada grupo.' },
    { tit: 'Experiencia social',   sub: 'Los temas en los que has trabajado.' },
    { tit: 'Idiomas',              sub: 'Último paso: agrega tus idiomas y guarda.' }
  ],

  abrirForm: function () {
    CV.form = CV.datos ? JSON.parse(JSON.stringify(CV.datos)) : CV.nueva();
    CV.form.correo = RCR.user.correo;
    CV.form.nombre = RCR.user.nombre;
    CV.paso = 0;
    CV.tocado = false;

    RCR.modal({
      id: 'm-cv',
      titulo: CV.datos ? 'Editar mi ficha' : 'Mi ficha',
      sub: RCR.esc(RCR.user.nombre),
      cuerpo: '<div id="cv-body"></div>',
      acciones: '<div id="cv-foot" style="display:flex;gap:10px;flex:1;"></div>',
      persistente: true,
      onCerrar: function () { CV.intentarCerrar(); }
    });
    CV.pintar();
  },

  intentarCerrar: function () {
    CV.leerPaso();
    if (!CV.tocado) { RCR.cerrarModal('m-cv'); return; }
    RCR.confirmar({
      titulo: '¿Salir sin guardar?',
      texto: 'Los cambios de esta sesión se pierden. Tu ficha guardada no cambia.',
      label: 'Salir',
      onOk: "RCR.cerrarModal('m-confirm');RCR.cerrarModal('m-cv');"
    });
  },

  pintar: function () {
    var p = CV.paso;
    var barras = CV.PASOS.map(function (_, i) {
      var cls = i < p ? 'done' : (i === p ? 'now' : '');
      return '<button class="cv-step ' + cls + '" aria-label="Paso ' + (i + 1) + '"' +
             ' onclick="CV.ir(' + i + ')"></button>';
    }).join('');

    document.getElementById('cv-body').innerHTML =
      '<div class="cv-steps">' + barras + '</div>' +
      '<div class="cv-paso-tit">' + (p + 1) + '. ' + RCR.esc(CV.PASOS[p].tit) + '</div>' +
      '<div class="cv-paso-sub">' + RCR.esc(CV.PASOS[p].sub) + '</div>' +
      CV['paso' + p]();

    var ultimo = p === CV.PASOS.length - 1;
    document.getElementById('cv-foot').innerHTML =
      (p > 0 ? '<button class="btn btn-glass" onclick="CV.ir(' + (p - 1) + ')">' +
                 ico('chevronLeft', 15) + 'Anterior</button>' : '') +
      (ultimo
        ? '<button class="btn btn-primary" id="cv-save" onclick="CV.guardar()">' +
            ico('save', 15) + 'Guardar ficha</button>'
        : '<button class="btn btn-primary" onclick="CV.ir(' + (p + 1) + ')">Siguiente' +
            ico('chevronRight', 15) + '</button>');

    var body = document.querySelector('#m-cv .modal-body');
    if (body) body.scrollTop = 0;
  },

  ir: function (i) {
    CV.leerPaso();
    CV.paso = Math.max(0, Math.min(CV.PASOS.length - 1, i));
    CV.pintar();
  },

  val: function (id) {
    var el = document.getElementById(id);
    return el ? el.value.trim() : '';
  },

  leerPaso: function () {
    if (!CV.form) return;
    var fn = CV['leer' + CV.paso];
    if (fn) fn();
    CV.tocado = true;
  },

  /* ── Paso 0: contacto ─────────────────────────────────────────────────── */
  paso0: function () {
    var f = CV.form;
    return '' +
      '<div class="form-grp">' +
        '<label class="form-lbl">Colaborador</label>' +
        '<div class="form-static">' + RCR.esc(f.nombre) + '</div>' +
        '<div class="form-help">Se toma de tu cuenta. Si está mal escrito, avisa a comunicación.</div>' +
      '</div>' +
      '<div class="form-grp">' +
        '<label class="form-lbl">Correo electrónico</label>' +
        '<div class="form-static">' + RCR.esc(f.correo) + '</div>' +
      '</div>' +
      '<div class="form-grid-2">' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="cv-ciudad">Ciudad de residencia</label>' +
          '<input class="form-inp" id="cv-ciudad" value="' + RCR.esc(f.ciudad) + '" placeholder="Guayaquil">' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="cv-provincia">Provincia</label>' +
          '<input class="form-inp" id="cv-provincia" value="' + RCR.esc(f.provincia) + '" placeholder="Guayas">' +
        '</div>' +
      '</div>' +
      '<div class="form-grid-2">' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="cv-telefono">Teléfono</label>' +
          '<input class="form-inp" id="cv-telefono" type="tel" inputmode="tel" value="' + RCR.esc(f.telefono) + '" placeholder="+593 …">' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl" for="cv-linkedin">LinkedIn <span class="opt">(opcional)</span></label>' +
          '<input class="form-inp" id="cv-linkedin" value="' + RCR.esc(f.linkedin) + '" placeholder="linkedin.com/in/…">' +
        '</div>' +
      '</div>' +
      '<div class="form-grp">' +
        '<label class="form-lbl">Fotografía <span class="opt">(opcional)</span></label>' +
        '<div class="cv-foto-fila">' +
          '<div class="cv-res-foto" id="cv-foto-prev">' +
            (f.foto_b64 ? '<img src="' + f.foto_b64 + '" alt="">' : RCR.esc(RCR.iniciales(f.nombre))) +
          '</div>' +
          '<div style="flex:1">' +
            '<button class="btn btn-glass" onclick="document.getElementById(\'cv-foto\').click()">' +
              ico('image', 15) + (f.foto_b64 ? 'Cambiar foto' : 'Subir foto') + '</button>' +
            '<input type="file" id="cv-foto" accept="image/*" class="hidden" onchange="CV.subirFoto(this)">' +
          '</div>' +
        '</div>' +
        '<div class="form-help">Se recorta en círculo y se reduce automáticamente. Usa una foto de frente, con fondo claro.</div>' +
      '</div>';
  },

  leer0: function () {
    var f = CV.form;
    f.ciudad    = CV.val('cv-ciudad');
    f.provincia = CV.val('cv-provincia');
    f.telefono  = CV.val('cv-telefono');
    f.linkedin  = CV.val('cv-linkedin');
  },

  subirFoto: function (input) {
    var file = input.files && input.files[0];
    if (!file) return;
    if (!/^image\//.test(file.type)) { RCR.toast('Elige un archivo de imagen'); return; }

    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var LADO = 500;
        var lado = Math.min(img.width, img.height);
        var cnv = document.createElement('canvas');
        cnv.width = LADO; cnv.height = LADO;
        cnv.getContext('2d').drawImage(
          img,
          (img.width - lado) / 2, (img.height - lado) / 2, lado, lado,
          0, 0, LADO, LADO
        );
        CV.form.foto_b64 = cnv.toDataURL('image/jpeg', 0.82);
        CV.tocado = true;
        var prev = document.getElementById('cv-foto-prev');
        if (prev) prev.innerHTML = '<img src="' + CV.form.foto_b64 + '" alt="">';
        RCR.toast('Foto lista');
      };
      img.onerror = function () { RCR.toast('No se pudo leer la imagen'); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  },

  /* ── Paso 1: perfil ───────────────────────────────────────────────────── */
  paso1: function () {
    var p = CV.form.perfil;
    var anios = ['<option value="">Selecciona…</option>'].concat(
      CV_CAT.aniosExperiencia.map(function (a) {
        return '<option value="' + RCR.esc(a) + '"' + (p.anios_experiencia === a ? ' selected' : '') + '>' + RCR.esc(a) + '</option>';
      })
    ).join('');

    return '' +
      '<div class="form-grp">' +
        '<label class="form-lbl" for="cv-profesion">Profesión u ocupación principal</label>' +
        '<input class="form-inp" id="cv-profesion" value="' + RCR.esc(p.profesion) + '" placeholder="Título universitario u ocupación">' +
      '</div>' +
      '<div class="form-grp">' +
        '<label class="form-lbl" for="cv-anios">Años de experiencia</label>' +
        '<select class="form-inp" id="cv-anios">' + anios + '</select>' +
      '</div>' +
      '<div class="form-grp">' +
        '<label class="form-lbl">Áreas de experiencia <span class="opt">(hasta ' + CV_CAT.areasExperienciaMax + ')</span></label>' +
        CV.picks('perfil.areas_experiencia', CV_CAT.areasExperiencia, CV_CAT.areasExperienciaMax) +
      '</div>' +
      '<div class="form-grp">' +
        '<label class="form-lbl" for="cv-fortalezas">Tus principales fortalezas</label>' +
        '<textarea class="form-inp" id="cv-fortalezas" placeholder="Una por línea">' + RCR.esc(p.fortalezas) + '</textarea>' +
        '<div class="form-help">Escribe una por línea: así salen como lista en el CV.</div>' +
      '</div>';
  },

  leer1: function () {
    var p = CV.form.perfil;
    p.profesion         = CV.val('cv-profesion');
    p.anios_experiencia = CV.val('cv-anios');
    p.fortalezas        = CV.val('cv-fortalezas');
  },

  /* ── Paso 2: formación ────────────────────────────────────────────────── */
  paso2: function () {
    var lista = CV.form.formacion;
    if (!lista.length) return CV.avisoLista('formacion', 'Agregar estudio');

    return lista.map(function (it, i) {
      var niveles = ['<option value="">Nivel…</option>'].concat(
        CV_CAT.nivelAcademico.map(function (n) {
          return '<option value="' + RCR.esc(n) + '"' + (it.nivel === n ? ' selected' : '') + '>' + RCR.esc(n) + '</option>';
        })
      ).join('');
      return '' +
      '<div class="rep-block">' +
        CV.repHead('Estudio ' + (i + 1), 'formacion', i) +
        '<div class="form-grp">' +
          '<label class="form-lbl">Título obtenido</label>' +
          '<input class="form-inp" id="cv-for-' + i + '-titulo" value="' + RCR.esc(it.titulo) + '" placeholder="Licenciatura en…">' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl">Institución</label>' +
          '<input class="form-inp" id="cv-for-' + i + '-institucion" value="' + RCR.esc(it.institucion) + '">' +
        '</div>' +
        '<div class="form-grid-2">' +
          '<div class="form-grp">' +
            '<label class="form-lbl">País</label>' +
            '<input class="form-inp" id="cv-for-' + i + '-pais" value="' + RCR.esc(it.pais) + '" placeholder="Ecuador">' +
          '</div>' +
          '<div class="form-grp">' +
            '<label class="form-lbl">Año de graduación</label>' +
            '<input class="form-inp" id="cv-for-' + i + '-anio" inputmode="numeric" value="' + RCR.esc(it.anio) + '" placeholder="2022">' +
          '</div>' +
        '</div>' +
        '<div class="form-grp" style="margin-bottom:0">' +
          '<label class="form-lbl">Nivel académico</label>' +
          '<select class="form-inp" id="cv-for-' + i + '-nivel">' + niveles + '</select>' +
        '</div>' +
      '</div>';
    }).join('') + CV.btnAgregar('formacion', 'Agregar otro estudio');
  },

  leer2: function () {
    CV.form.formacion = CV.form.formacion.map(function (_, i) {
      return {
        titulo:      CV.val('cv-for-' + i + '-titulo'),
        institucion: CV.val('cv-for-' + i + '-institucion'),
        pais:        CV.val('cv-for-' + i + '-pais'),
        anio:        CV.val('cv-for-' + i + '-anio'),
        nivel:       CV.val('cv-for-' + i + '-nivel')
      };
    });
  },

  /* ── Paso 3: experiencia laboral ──────────────────────────────────────── */
  paso3: function () {
    var lista = CV.form.experiencia;
    if (!lista.length) return CV.avisoLista('experiencia', 'Agregar experiencia');

    return lista.map(function (it, i) {
      var actual = !!it.actualidad;
      return '' +
      '<div class="rep-block">' +
        CV.repHead('Experiencia ' + (i + 1), 'experiencia', i) +
        '<div class="form-grp">' +
          '<label class="form-lbl">Organización</label>' +
          '<input class="form-inp" id="cv-exp-' + i + '-organizacion" value="' + RCR.esc(it.organizacion) + '">' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl">Cargo desempeñado</label>' +
          '<input class="form-inp" id="cv-exp-' + i + '-cargo" value="' + RCR.esc(it.cargo) + '">' +
        '</div>' +
        '<div class="form-grid-2">' +
          '<div class="form-grp">' +
            '<label class="form-lbl">Fecha de inicio</label>' +
            '<input class="form-inp" id="cv-exp-' + i + '-fecha_inicio" value="' + RCR.esc(it.fecha_inicio) + '" placeholder="04, 2022">' +
          '</div>' +
          '<div class="form-grp">' +
            '<label class="form-lbl">Fecha de finalización</label>' +
            '<input class="form-inp" id="cv-exp-' + i + '-fecha_fin" value="' + RCR.esc(it.fecha_fin) + '"' +
              ' placeholder="05, 2024"' + (actual ? ' disabled' : '') + '>' +
          '</div>' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="check-line">' +
            '<input type="checkbox" id="cv-exp-' + i + '-actualidad"' + (actual ? ' checked' : '') +
              ' onchange="CV.toggleActual(' + i + ', this.checked)">' +
            '<span>Sigo en este cargo</span>' +
          '</label>' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl">Principales actividades</label>' +
          '<textarea class="form-inp" id="cv-exp-' + i + '-actividades" placeholder="Una por línea, máximo 4">' +
            RCR.esc((it.actividades || []).join('\n')) + '</textarea>' +
          '<div class="form-help">Máximo 4 líneas. Las demás no entran al CV.</div>' +
        '</div>' +
        '<div class="form-grp" style="margin-bottom:0">' +
          '<label class="form-lbl">Principal logro en el cargo</label>' +
          '<textarea class="form-inp" id="cv-exp-' + i + '-logro" style="min-height:60px">' + RCR.esc(it.logro) + '</textarea>' +
        '</div>' +
      '</div>';
    }).join('') + CV.btnAgregar('experiencia', 'Agregar otra experiencia');
  },

  toggleActual: function (i, on) {
    var el = document.getElementById('cv-exp-' + i + '-fecha_fin');
    if (!el) return;
    el.disabled = on;
    if (on) el.value = '';
    CV.tocado = true;
  },

  leer3: function () {
    CV.form.experiencia = CV.form.experiencia.map(function (_, i) {
      var chk = document.getElementById('cv-exp-' + i + '-actualidad');
      var act = chk ? chk.checked : false;
      return {
        organizacion: CV.val('cv-exp-' + i + '-organizacion'),
        cargo:        CV.val('cv-exp-' + i + '-cargo'),
        fecha_inicio: CV.val('cv-exp-' + i + '-fecha_inicio'),
        fecha_fin:    act ? '' : CV.val('cv-exp-' + i + '-fecha_fin'),
        actualidad:   act,
        actividades:  CV.lineas(CV.val('cv-exp-' + i + '-actividades'), 4),
        logro:        CV.val('cv-exp-' + i + '-logro')
      };
    });
  },

  /* ── Paso 4: proyectos ────────────────────────────────────────────────── */
  paso4: function () {
    var lista = CV.form.proyectos;
    if (!lista.length) return CV.avisoLista('proyectos', 'Agregar proyecto');

    return lista.map(function (it, i) {
      return '' +
      '<div class="rep-block">' +
        CV.repHead('Proyecto ' + (i + 1), 'proyectos', i) +
        '<div class="form-grp">' +
          '<label class="form-lbl">Nombre del proyecto</label>' +
          '<input class="form-inp" id="cv-pro-' + i + '-nombre" value="' + RCR.esc(it.nombre) + '">' +
        '</div>' +
        '<div class="form-grid-2">' +
          '<div class="form-grp">' +
            '<label class="form-lbl">Organización</label>' +
            '<input class="form-inp" id="cv-pro-' + i + '-organizacion" value="' + RCR.esc(it.organizacion) + '">' +
          '</div>' +
          '<div class="form-grp">' +
            '<label class="form-lbl">Tu rol</label>' +
            '<input class="form-inp" id="cv-pro-' + i + '-rol" value="' + RCR.esc(it.rol) + '">' +
          '</div>' +
        '</div>' +
        '<div class="form-grp">' +
          '<label class="form-lbl">Qué hiciste</label>' +
          '<textarea class="form-inp" id="cv-pro-' + i + '-descripcion" style="min-height:60px" maxlength="240">' + RCR.esc(it.descripcion) + '</textarea>' +
        '</div>' +
        '<div class="form-grp" style="margin-bottom:0">' +
          '<label class="form-lbl">Resultados del proyecto</label>' +
          '<textarea class="form-inp" id="cv-pro-' + i + '-resultados" style="min-height:60px" maxlength="240">' + RCR.esc(it.resultados) + '</textarea>' +
        '</div>' +
      '</div>';
    }).join('') + CV.btnAgregar('proyectos', 'Agregar otro proyecto');
  },

  leer4: function () {
    CV.form.proyectos = CV.form.proyectos.map(function (_, i) {
      return {
        nombre:       CV.val('cv-pro-' + i + '-nombre'),
        organizacion: CV.val('cv-pro-' + i + '-organizacion'),
        rol:          CV.val('cv-pro-' + i + '-rol'),
        descripcion:  CV.val('cv-pro-' + i + '-descripcion'),
        resultados:   CV.val('cv-pro-' + i + '-resultados')
      };
    });
  },

  /* ── Paso 5: competencias ─────────────────────────────────────────────── */
  paso5: function () {
    return CV_CAT.competencias.map(function (g) {
      return '<div class="cv-comp-grupo">' +
               '<label class="form-lbl">' + RCR.esc(g.titulo) + '</label>' +
               CV.picks('competencias.' + g.key, g.opciones, 0) +
             '</div>';
    }).join('');
  },
  leer5: function () {},

  /* ── Paso 6: experiencia social ───────────────────────────────────────── */
  paso6: function () {
    return '<div class="form-grp">' +
             '<label class="form-lbl">Temas en los que has trabajado</label>' +
             CV.picks('experiencia_social', CV_CAT.experienciaSocial, 0) +
           '</div>';
  },
  leer6: function () {},

  /* ── Paso 7: idiomas ──────────────────────────────────────────────────── */
  paso7: function () {
    var lista = CV.form.idiomas;
    if (!lista.length) return CV.avisoLista('idiomas', 'Agregar idioma');

    return lista.map(function (it, i) {
      var niveles = ['<option value="">Nivel…</option>'].concat(
        CV_CAT.nivelIdioma.map(function (n) {
          return '<option value="' + RCR.esc(n) + '"' + (it.nivel === n ? ' selected' : '') + '>' + RCR.esc(n) + '</option>';
        })
      ).join('');
      return '' +
      '<div class="rep-block">' +
        CV.repHead('Idioma ' + (i + 1), 'idiomas', i) +
        '<div class="form-grid-2" style="margin-bottom:0">' +
          '<div class="form-grp" style="margin-bottom:0">' +
            '<label class="form-lbl">Idioma</label>' +
            '<input class="form-inp" id="cv-idi-' + i + '-idioma" value="' + RCR.esc(it.idioma) + '" placeholder="Español">' +
          '</div>' +
          '<div class="form-grp" style="margin-bottom:0">' +
            '<label class="form-lbl">Nivel</label>' +
            '<select class="form-inp" id="cv-idi-' + i + '-nivel">' + niveles + '</select>' +
          '</div>' +
        '</div>' +
      '</div>';
    }).join('') + CV.btnAgregar('idiomas', 'Agregar otro idioma');
  },

  leer7: function () {
    CV.form.idiomas = CV.form.idiomas.map(function (_, i) {
      return { idioma: CV.val('cv-idi-' + i + '-idioma'), nivel: CV.val('cv-idi-' + i + '-nivel') };
    });
  },

  /* ── Piezas reutilizables del formulario ──────────────────────────────── */
  repHead: function (etiqueta, lista, i) {
    return '<div class="rep-head">' +
             '<span class="rep-num">' + RCR.esc(etiqueta) + '</span>' +
             '<button class="btn-ico danger" aria-label="Quitar ' + RCR.esc(etiqueta) + '"' +
               ' onclick="CV.quitar(\'' + lista + '\',' + i + ')">' + ico('trash', 15) + '</button>' +
           '</div>';
  },

  btnAgregar: function (lista, texto) {
    return '<button class="rep-add" onclick="CV.agregar(\'' + lista + '\')">' +
             ico('plus', 15) + RCR.esc(texto) + '</button>';
  },

  avisoLista: function (lista, texto) {
    return RCR.vacio('inbox', 'Nada agregado todavía', 'También puedes dejarlo vacío y seguir.') +
           CV.btnAgregar(lista, texto);
  },

  agregar: function (lista) {
    CV.leerPaso();
    var vacios = {
      formacion:   { titulo: '', institucion: '', pais: '', anio: '', nivel: '' },
      experiencia: { organizacion: '', cargo: '', fecha_inicio: '', fecha_fin: '', actualidad: false, actividades: [], logro: '' },
      proyectos:   { nombre: '', organizacion: '', rol: '', descripcion: '', resultados: '' },
      idiomas:     { idioma: '', nivel: '' }
    };
    CV.form[lista].push(JSON.parse(JSON.stringify(vacios[lista])));
    CV.pintar();
  },

  quitar: function (lista, i) {
    CV.leerPaso();
    CV.form[lista].splice(i, 1);
    CV.pintar();
  },

  /* Chips de selección múltiple. La ruta admite "perfil.areas_experiencia". */
  picks: function (ruta, opciones, max) {
    var sel = CV.getRuta(ruta) || [];
    var key = ruta.replace(/\./g, '-');
    return '<div class="pick-grid">' +
      opciones.map(function (o) {
        var on = sel.indexOf(o) >= 0;
        return '<button type="button" class="pick' + (on ? ' on' : '') + '"' +
               ' aria-pressed="' + on + '"' +
               ' onclick="CV.togglePick(\'' + ruta + '\',this,' + (max || 0) + ')"' +
               ' data-val="' + RCR.esc(o) + '">' + RCR.esc(o) + '</button>';
      }).join('') +
    '</div>' +
    (max ? '<div class="form-help" id="hint-' + key + '">' +
             sel.length + ' de ' + max + ' seleccionadas</div>' : '');
  },

  getRuta: function (ruta) {
    return ruta.split('.').reduce(function (o, k) { return o ? o[k] : undefined; }, CV.form);
  },

  togglePick: function (ruta, btn, max) {
    var arr = CV.getRuta(ruta);
    if (!arr) return;
    var v = btn.dataset.val;
    var i = arr.indexOf(v);

    if (i >= 0) {
      arr.splice(i, 1);
      btn.classList.remove('on');
      btn.setAttribute('aria-pressed', 'false');
    } else {
      if (max && arr.length >= max) { RCR.toast('Puedes elegir hasta ' + max); return; }
      arr.push(v);
      btn.classList.add('on');
      btn.setAttribute('aria-pressed', 'true');
    }

    var hint = document.getElementById('hint-' + ruta.replace(/\./g, '-'));
    if (hint && max) hint.textContent = arr.length + ' de ' + max + ' seleccionadas';
    CV.tocado = true;
  },

  lineas: function (txt, max) {
    var arr = String(txt || '').split('\n')
      .map(function (s) { return s.trim().replace(/^[\u2022\-\u2013]\s*/, ''); })
      .filter(Boolean);
    return max ? arr.slice(0, max) : arr;
  },

  /* ==========================================================================
     GUARDAR
     ========================================================================== */
  guardar: async function () {
    if (CV.guardando) return;
    CV.leerPaso();

    var f = CV.form;
    if (!f.perfil.profesion) { RCR.toast('Falta tu profesión u ocupación (paso 2)'); CV.ir(1); return; }

    /* Se descartan los bloques que quedaron completamente vacíos */
    f.formacion   = f.formacion.filter(function (x) { return x.titulo || x.institucion; });
    f.experiencia = f.experiencia.filter(function (x) { return x.organizacion || x.cargo; });
    f.proyectos   = f.proyectos.filter(function (x) { return x.nombre; });
    f.idiomas     = f.idiomas.filter(function (x) { return x.idioma; });

    CV.guardando = true;
    var btn = document.getElementById('cv-save');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }

    var data = Object.assign({}, f, {
      id_colaborador: RCR.user.docId || '',
      actualizado: firebase.firestore.FieldValue.serverTimestamp()
    });

    try {
      await RCR.db.collection(CV.COL).doc(RCR.user.correo).set(data, { merge: true });
      CV.datos  = CV.normalizar(f);
      CV.tocado = false;
      CV.render();
      RCR.cerrarModal('m-cv');
      RCR.toast('Ficha guardada');
    } catch (e) {
      console.error('CV.guardar:', e);
      RCR.toast('No se pudo guardar. Revisa tu conexión.');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = ico('save', 15) + 'Guardar ficha'; }
    CV.guardando = false;
  },

  /* ==========================================================================
     VISTA PREVIA
     ========================================================================== */
  ver: function () {
    if (!CV.datos) return;
    RCR.modal({
      id: 'm-cv-ver',
      titulo: 'Vista previa',
      sub: 'Así se ve tu CV al descargarlo',
      cuerpo: '<div class="cv-prev-wrap" id="cv-prev-wrap">' +
                '<div class="cv-prev-esc" id="cv-prev-esc">' + CV.plantillaHTML(CV.datos) + '</div>' +
              '</div>',
      acciones:
        '<button class="btn btn-glass" onclick="RCR.cerrarModal(\'m-cv-ver\')">Cerrar</button>' +
        '<button class="btn btn-primary" onclick="CV.descargar()">' + ico('download', 15) + 'Descargar PDF</button>'
    });

    /* La hoja mide 794px: se reduce al ancho disponible del modal */
    requestAnimationFrame(function () {
      var wrap = document.getElementById('cv-prev-wrap');
      var esc  = document.getElementById('cv-prev-esc');
      if (!wrap || !esc || !esc.firstChild) return;
      var k = Math.min(1, wrap.clientWidth / 794);
      esc.style.transform = 'scale(' + k + ')';
      esc.style.height = (esc.firstChild.offsetHeight * k) + 'px';
    });
  },

  /* ==========================================================================
     PDF
     ========================================================================== */
  descargar: async function () {
    if (CV.generando || !CV.datos) return;
    CV.generando = true;

    var btn = document.getElementById('cv-pdf');
    var txt = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="spinner"></span>'; }
    RCR.toast('Generando tu PDF');

    try {
      await RCR.cargarLib(CV.LIB_CANVAS);
      await RCR.cargarLib(CV.LIB_PDF);

      var box = document.getElementById('cv-render');
      if (!box) {
        box = document.createElement('div');
        box.id = 'cv-render';
        document.body.appendChild(box);
      }
      box.innerHTML = CV.plantillaHTML(CV.datos);

      if (document.fonts && document.fonts.ready) await document.fonts.ready;
      await new Promise(function (r) { setTimeout(r, 150); });

      var canvas = await html2canvas(box.firstChild, {
        scale: 2, backgroundColor: '#ffffff', useCORS: true, logging: false
      });

      var jsPDF = window.jspdf.jsPDF;
      var pdf = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
      var pw  = pdf.internal.pageSize.getWidth();
      var ph  = pdf.internal.pageSize.getHeight();

      /* Alto en píxeles del canvas que cabe en una página A4 */
      var pagPx = Math.floor(canvas.width * ph / pw);
      var altoPt = canvas.height * pw / canvas.width;

      /* Si se pasa por poco, se reduce para que quepa en una sola página */
      if (altoPt > ph && altoPt <= ph * 1.16) {
        var k = ph / altoPt;
        var w = pw * k;
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.94), 'JPEG', (pw - w) / 2, 0, w, ph);
        pdf.save('CV - ' + CV.datos.nombre + '.pdf');
        box.innerHTML = '';
        RCR.toast('PDF descargado');
        if (btn) { btn.disabled = false; btn.innerHTML = txt; }
        CV.generando = false;
        return;
      }

      var total = Math.max(1, Math.ceil(canvas.height / pagPx));

      for (var p = 0; p < total; p++) {
        var alto  = Math.min(pagPx, canvas.height - p * pagPx);
        var trozo = document.createElement('canvas');
        trozo.width  = canvas.width;
        trozo.height = alto;
        var ctx = trozo.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, trozo.width, trozo.height);
        ctx.drawImage(canvas, 0, p * pagPx, canvas.width, alto, 0, 0, canvas.width, alto);

        if (p > 0) pdf.addPage();
        pdf.addImage(trozo.toDataURL('image/jpeg', 0.94), 'JPEG',
                     0, 0, pw, alto * pw / canvas.width);
      }

      pdf.save('CV - ' + CV.datos.nombre + '.pdf');
      box.innerHTML = '';
      RCR.toast('PDF descargado');

    } catch (e) {
      console.error('CV.descargar:', e);
      RCR.toast('No se pudo generar el PDF');
    }

    if (btn) { btn.disabled = false; btn.innerHTML = txt; }
    CV.generando = false;
  },

  /* ==========================================================================
     PLANTILLA DEL DOCUMENTO (vista previa y PDF usan la misma)
     ========================================================================== */
  tituloDoc: function (icono, texto) {
    return '<div class="cvdoc-tit">' +
             '<span class="cvdoc-tit-ico">' + ico(icono, 13) + '</span>' +
             '<h3>' + RCR.esc(texto) + '</h3>' +
           '</div>';
  },

  plantillaHTML: function (d) {
    d = CV.normalizar(d);

    /* ── Columna izquierda ─────────────────────────────────────────────── */
    var perfilTxt = [];
    if (d.perfil.profesion)         perfilTxt.push(d.perfil.profesion + '.');
    if (d.perfil.anios_experiencia) perfilTxt.push(d.perfil.anios_experiencia + ' de experiencia profesional.');
    if (d.perfil.areas_experiencia.length)
      perfilTxt.push('Experiencia en ' + CV.enumerar(d.perfil.areas_experiencia) + '.');

    var comp = CV_CAT.competencias.map(function (g) {
      var sel = d.competencias[g.key] || [];
      if (!sel.length) return '';
      return '<div class="cvdoc-sub">' + RCR.esc(g.titulo) + '</div>' +
             '<ul class="cvdoc-lista">' +
               sel.map(function (s) { return '<li>' + RCR.esc(s) + '</li>'; }).join('') +
             '</ul>';
    }).join('');

    var idiomas = d.idiomas.map(function (i) {
      return '<div class="cvdoc-idioma"><b>' + RCR.esc(i.idioma) + ':</b> ' + RCR.esc(i.nivel) + '</div>';
    }).join('');

    var fortalezas = CV.trocear(d.perfil.fortalezas).map(function (t) {
      return '<li>' + RCR.esc(t) + '</li>';
    }).join('');

    var izq =
      '<div class="cvdoc-foto">' +
        (d.foto_b64 ? '<img src="' + d.foto_b64 + '" alt="">' : RCR.esc(RCR.iniciales(d.nombre))) +
      '</div>' +
      (perfilTxt.length
        ? CV.tituloDoc('user', 'Perfil profesional') +
          '<p class="cvdoc-p">' + RCR.esc(perfilTxt.join(' ')) + '</p>' +
          '<div class="cvdoc-sep"></div>'
        : '') +
      (comp ? CV.tituloDoc('tools', 'Competencias') + comp + '<div class="cvdoc-sep"></div>' : '') +
      (idiomas
        ? CV.tituloDoc('globe', 'Idiomas') + idiomas + (fortalezas ? '<div class="cvdoc-sep"></div>' : '')
        : '') +
      (fortalezas
        ? CV.tituloDoc('award', 'Fortalezas') + '<ul class="cvdoc-lista">' + fortalezas + '</ul>'
        : '');

    /* ── Columna derecha ───────────────────────────────────────────────── */
    var contacto = [];
    var lugar = [d.ciudad, d.provincia].filter(Boolean).join(', ');
    if (lugar)      contacto.push('<i>' + ico('mapPin', 11) + RCR.esc(lugar) + '</i>');
    if (d.telefono) contacto.push('<i>' + ico('phone', 11) + RCR.esc(d.telefono) + '</i>');
    if (d.correo)   contacto.push('<i>' + ico('mail', 11) + RCR.esc(d.correo) + '</i>');
    if (d.linkedin) contacto.push('<i>' + ico('link', 11) + RCR.esc(d.linkedin) + '</i>');

    var experiencia = d.experiencia.map(function (e) {
      var hasta = e.actualidad ? 'Presente' : e.fecha_fin;
      var rango = [e.fecha_inicio, hasta].filter(Boolean).join(' – ');
      return '<div class="cvdoc-item">' +
               '<div class="cvdoc-org">' + RCR.esc(e.organizacion) + '</div>' +
               '<div class="cvdoc-cargo">' + RCR.esc(e.cargo) +
                 (rango ? ' <em>| ' + RCR.esc(rango) + '</em>' : '') + '</div>' +
               ((e.actividades || []).length
                 ? '<ul class="cvdoc-lista">' +
                     e.actividades.map(function (a) { return '<li>' + RCR.esc(a) + '</li>'; }).join('') +
                   '</ul>' : '') +
               (e.logro ? '<div class="cvdoc-logro">' + RCR.esc(e.logro) + '</div>' : '') +
             '</div>';
    }).join('');

    var educacion = d.formacion.map(function (f) {
      var linea = [f.anio, f.institucion, f.pais].filter(Boolean).join(' | ');
      return '<div class="cvdoc-item">' +
               '<div class="cvdoc-org" style="font-size:11.5px">' + RCR.esc(f.titulo) + '</div>' +
               (linea ? '<div class="cvdoc-cargo"><em>' + RCR.esc(linea) + '</em></div>' : '') +
               (f.nivel ? '<div class="cvdoc-cargo" style="font-size:10px">' + RCR.esc(f.nivel) + '</div>' : '') +
             '</div>';
    }).join('');

    var proyectos = d.proyectos.slice(0, 3).map(function (p) {
      return '<div class="cvdoc-proy">' +
               '<div class="cvdoc-proy-ico">' + ico('star', 14) + '</div>' +
               '<strong>' + RCR.esc(p.nombre) + '</strong>' +
               (p.rol || p.organizacion
                 ? '<small>' + RCR.esc([p.rol, p.organizacion].filter(Boolean).join(' · ')) + '</small>' : '') +
               (p.descripcion ? '<p style="margin-top:5px">' + RCR.esc(p.descripcion) + '</p>' : '') +
               (p.resultados ? '<small>' + RCR.esc(p.resultados) + '</small>' : '') +
             '</div>';
    }).join('');

    var temas = d.experiencia_social.map(function (t) {
      return '<span class="cvdoc-tag">' + RCR.esc(t) + '</span>';
    }).join('');

    var der =
      '<div class="cvdoc-nombre">' + RCR.esc(d.nombre) + '</div>' +
      (contacto.length ? '<div class="cvdoc-contacto">' + contacto.join('<b>|</b>') + '</div>' : '') +
      (experiencia ? CV.tituloDoc('briefcase', 'Experiencia laboral') +
                     '<div class="cvdoc-time">' + experiencia + '</div>' +
                     '<div class="cvdoc-sep"></div>' : '') +
      (educacion   ? CV.tituloDoc('graduation', 'Educación') +
                     '<div class="cvdoc-time">' + educacion + '</div>' +
                     '<div class="cvdoc-sep"></div>' : '') +
      (proyectos   ? CV.tituloDoc('star', 'Proyectos destacados') +
                     '<div class="cvdoc-proys">' + proyectos + '</div>' +
                     (temas ? '<div class="cvdoc-sep"></div>' : '') : '') +
      (temas       ? CV.tituloDoc('heart', 'Temas de trabajo') +
                     '<div class="cvdoc-tags">' + temas + '</div>' : '');

    return '<div class="cvdoc">' +
             '<div class="cvdoc-izq">' + izq + '</div>' +
             '<div class="cvdoc-der">' + der + '</div>' +
           '</div>';
  },

  /* "a, b y c" */
  enumerar: function (arr) {
    var a = arr.map(function (s) { return String(s).toLowerCase(); });
    if (a.length <= 1) return a.join('');
    return a.slice(0, -1).join(', ') + ' y ' + a[a.length - 1];
  },

  /* Corta el texto de fortalezas en viñetas */
  trocear: function (txt) {
    var t = String(txt || '').trim();
    if (!t) return [];
    var partes = t.split(/[\n;]+/).map(function (s) {
      return s.trim().replace(/^[\u2022\-\u2013]\s*/, '');
    }).filter(Boolean);
    if (partes.length === 1 && partes[0].indexOf(',') > 0 && partes[0].length > 45) {
      partes = partes[0].split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    }
    return partes;
  }
};

window.CV     = CV;
window.CV_CAT = CV_CAT;

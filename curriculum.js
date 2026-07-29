/* ==========================================================================
   Mi RCR — curriculum.js
   Ficha de currículum + generación de PDF.
   ESTADO: catálogos y modelo de datos definidos. Formulario y PDF pendientes.
   ========================================================================== */

window.RCR = window.RCR || { modulos: {} };

/* ==========================================================================
   CATÁLOGOS ACORDADOS
   ========================================================================== */
var CV_CAT = {

  aniosExperiencia: [
    'Menos de 1 año', '1 a 3 años', '3 a 5 años', 'Más de 5 años'
  ],

  /* Opción múltiple, máximo 3 */
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

  /* Cuatro bloques de competencias */
  competencias: [
    {
      key: 'desarrollo_comunitario',
      titulo: 'Desarrollo comunitario',
      opciones: [
        'Diagnóstico participativo', 'Mediación comunitaria', 'Organización social',
        'Fortalecimiento organizacional', 'Participación ciudadana',
        'Desarrollo territorial', 'Gestión de voluntariado',
        'Monitoreo y evaluación de acciones sociales'
      ]
    },
    {
      key: 'formacion_facilitacion',
      titulo: 'Formación y facilitación',
      opciones: [
        'Facilitación de talleres', 'Diseño de metodologías participativas',
        'Capacitación de grupos', 'Educación popular', 'Educación ambiental',
        'Formación de líderes'
      ]
    },
    {
      key: 'comunicacion',
      titulo: 'Comunicación',
      opciones: [
        'Comunicación estratégica', 'Comunicación comunitaria',
        'Comunicación para el desarrollo', 'Gestión de redes sociales',
        'Redacción institucional', 'Storytelling', 'Producción de contenidos'
      ]
    },
    {
      key: 'ofimatica',
      titulo: 'Ofimática',
      opciones: ['Word', 'Excel', 'PowerPoint', 'Google Workspace']
    }
  ],

  /* Opción múltiple, sin límite */
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
   MODELO DE DATOS — colección "Curriculums", un documento por colaborador
   ========================================================================== */
var CV_MODELO = {
  id_colaborador: '',        // se toma de la sesión, no se pide en la ficha
  correo: '',
  nombre: '',
  ciudad: '',
  provincia: '',
  telefono: '',
  linkedin: '',
  foto_url: '',

  perfil: {
    profesion: '',
    anios_experiencia: '',
    areas_experiencia: [],   // máx 3
    fortalezas: ''
  },

  formacion: [],             // { titulo, institucion, pais, anio, nivel }
  experiencia: [],           // { organizacion, cargo, fecha_inicio, fecha_fin, actualidad, actividades[], logro }
  proyectos: [],             // { nombre, organizacion, rol, descripcion, resultados }

  competencias: {
    desarrollo_comunitario: [],
    formacion_facilitacion: [],
    comunicacion: [],
    ofimatica: []
  },

  experiencia_social: [],
  idiomas: [],               // { idioma, nivel }

  actualizado: null
};

/* ==========================================================================
   MÓDULO
   ========================================================================== */
RCR.modulos.curriculum = {
  id: 'curriculum',
  titulo: 'Currículum',
  icono: 'curriculum',
  enNav: true,

  mount: function (root) {
    root.innerHTML =
      '<div class="section-header">' +
        '<div>' +
          '<div class="section-title">Mi currículum</div>' +
          '<div class="section-sub">Llena la ficha una vez y descarga tu CV cuando lo necesites</div>' +
        '</div>' +
      '</div>' +
      RCR.vacio('curriculum', 'Sección en construcción',
        'La ficha y la descarga en PDF se habilitan en la próxima entrega.');
  }
};

window.CV_CAT    = CV_CAT;
window.CV_MODELO = CV_MODELO;

/* ==========================================================================
   Mi RCR — bienestar.js
   Perfil "bienestar": gestión de bienestar del equipo, portada desde la app
   Bienestar360. Secciones: Colaboradores, Seguimiento y Semáforo (consolidado).
   No incluye el dashboard de Inicio ni la sección de Accesos/links.

   ETAPA 1: los módulos quedan registrados con un marcador de posición. En las
   etapas siguientes se reemplaza el mount() de cada uno por su funcionalidad
   real (tablas, fichas, filtros y PDFs), reusando la colección correspondiente
   del proyecto Firestore "redes-con-rostro".
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

/* ── Colaboradores ──────────────────────────────────────────────────────── */
RCR.modulos.colaboradores = {
  id: 'colaboradores',
  titulo: 'Colaboradores',
  icono: 'users',
  workspace: 'bienestar',
  enNav: true,
  mount: function (root) {
    RCR._bienestarProximamente(root, 'Colaboradores', 'Directorio del equipo');
  }
};

/* ── Seguimiento ────────────────────────────────────────────────────────── */
RCR.modulos['seguimiento-bienestar'] = {
  id: 'seguimiento-bienestar',
  titulo: 'Seguimiento',
  icono: 'heart',
  workspace: 'bienestar',
  enNav: true,
  mount: function (root) {
    RCR._bienestarProximamente(root, 'Seguimiento', 'Acompañamiento de bienestar');
  }
};

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

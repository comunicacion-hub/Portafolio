/* ==========================================================================
   Mi RCR — Iconos SVG
   Uso:  ico('plus')            -> svg 24x24 por defecto
         ico('plus', 16)        -> tamaño personalizado
         ico('plus', 16, 2.4)   -> grosor de trazo personalizado
   Todos los iconos heredan el color con currentColor.
   ========================================================================== */

window.ICONS = {

  /* ── Navegación / módulos ─────────────────────────────────────────── */
  semaforo:
    '<rect x="7" y="2" width="10" height="20" rx="5"/>' +
    '<circle cx="12" cy="7" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="17" r="1.6"/>',

  curriculum:
    '<rect x="3" y="4" width="18" height="16" rx="2.5"/>' +
    '<circle cx="8.5" cy="10" r="2.2"/>' +
    '<path d="M5 16.5c.8-1.6 2-2.4 3.5-2.4s2.7.8 3.5 2.4"/>' +
    '<path d="M15 9.5h4M15 13h4"/>',

  informes:
    '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/>' +
    '<path d="M14 2v5h5"/><path d="M9 13h6M9 17h4"/>',

  firmas:
    '<path d="M3 18c3.5 0 3-11 6-11s2.5 8 5 8c1.6 0 2.3-1.4 3-2.6"/>' +
    '<path d="M14 20.5h7"/>',

  accesos:
    '<path d="M12 2l7.5 3.4V11c0 4.7-3.1 8.6-7.5 10-4.4-1.4-7.5-5.3-7.5-10V5.4z"/>' +
    '<path d="M9.3 12.2l1.9 1.9 3.6-3.7"/>',

  /* ── Acciones ─────────────────────────────────────────────────────── */
  plus:        '<path d="M12 5v14M5 12h14"/>',
  x:           '<path d="M18 6L6 18M6 6l12 12"/>',
  check:       '<path d="M20 6L9 17l-5-5"/>',
  edit:        '<path d="M11 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-6"/>' +
               '<path d="M18.4 2.6a2 2 0 0 1 2.8 2.8L12 14.6l-4 1 1-4z"/>',
  trash:       '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>' +
               '<path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>',
  eye:         '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>' +
               '<circle cx="12" cy="12" r="2.8"/>',
  download:    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
               '<polyline points="7 10 12 15 17 10"/><path d="M12 15V3"/>',
  upload:      '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>' +
               '<polyline points="17 8 12 3 7 8"/><path d="M12 3v12"/>',
  save:        '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>' +
               '<polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>',
  refresh:     '<path d="M21 12a9 9 0 1 1-3-6.7"/><polyline points="21 3 21 9 15 9"/>',
  search:      '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4.3-4.3"/>',
  filter:      '<path d="M4 5h16l-6.5 8v6l-3-1.6V13z"/>',
  logout:      '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>' +
               '<polyline points="16 17 21 12 16 7"/><path d="M21 12H9"/>',

  /* ── Chevrons ─────────────────────────────────────────────────────── */
  chevronRight:'<polyline points="9 18 15 12 9 6"/>',
  chevronLeft: '<polyline points="15 18 9 12 15 6"/>',
  chevronDown: '<polyline points="6 9 12 15 18 9"/>',

  /* ── Datos personales / CV ────────────────────────────────────────── */
  user:        '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users:       '<path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9.5" cy="7" r="4"/>' +
               '<path d="M22 21v-2a4 4 0 0 0-3-3.9"/><path d="M16.5 3.1a4 4 0 0 1 0 7.8"/>',
  briefcase:   '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>' +
               '<path d="M2 13h20"/>',
  graduation:  '<path d="M22 9L12 4 2 9l10 5z"/><path d="M6 11.4V17c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.6"/>',
  star:        '<path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 17.8 6.2 20.9l1.1-6.5L2.6 9.8l6.5-.9z"/>',
  award:       '<circle cx="12" cy="9" r="6"/><path d="M8.2 13.9L7 22l5-3 5 3-1.2-8.1"/>',
  globe:       '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/>' +
               '<path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z"/>',
  tools:       '<path d="M14.7 6.3a4 4 0 0 0 5.3 5.3l-8.5 8.5a2.5 2.5 0 0 1-3.5-3.5z"/>' +
               '<path d="M6.5 3l3 3-2 2-3-3a1.4 1.4 0 0 1 2-2z"/>',
  heart:       '<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1l8.8 8.8 8.8-8.8a5 5 0 0 0 0-7.1z"/>',

  /* ── Contacto ─────────────────────────────────────────────────────── */
  mail:        '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2.5 6.5L12 13l9.5-6.5"/>',
  phone:       '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.2a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  mapPin:      '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  link:        '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7L11.5 5"/>' +
               '<path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7L12.5 19"/>',
  calendar:    '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/>' +
               '<path d="M8 3v4M16 3v4"/>',

  /* ── Archivos ─────────────────────────────────────────────────────── */
  file:        '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>',
  filePdf:     '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>' +
               '<path d="M9 15h1.2a1.3 1.3 0 0 0 0-2.6H9V18"/><path d="M13.5 12.4V18h.8a1.6 1.6 0 0 0 1.6-1.6v-2.4a1.6 1.6 0 0 0-1.6-1.6z"/>',
  fileCheck:   '<path d="M14 2H7a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7z"/><path d="M14 2v5h5"/>' +
               '<polyline points="9 15 11 17 15 13"/>',
  image:       '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.8"/>' +
               '<path d="M21 16l-5.5-5L5 20"/>',

  /* ── Estados / avisos ─────────────────────────────────────────────── */
  alert:       '<path d="M10.3 3.9L2.4 17.5A1.8 1.8 0 0 0 4 20.2h16a1.8 1.8 0 0 0 1.6-2.7L13.7 3.9a1.8 1.8 0 0 0-3.4 0z"/>' +
               '<path d="M12 9v4"/><circle cx="12" cy="16.6" r=".8" fill="currentColor" stroke="none"/>',
  info:        '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/>' +
               '<circle cx="12" cy="8" r=".8" fill="currentColor" stroke="none"/>',
  clock:       '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
  inbox:       '<path d="M21 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-6"/>' +
               '<path d="M3 13l3-9h12l3 9"/><path d="M9 13a3 3 0 0 0 6 0"/>',
};

/* Construye el SVG. */
window.ico = function (name, size, stroke) {
  var inner = window.ICONS[name];
  if (!inner) return '';
  var s = size || 24;
  var w = stroke || 2;
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="' + s + '" height="' + s + '"' +
    ' fill="none" stroke="currentColor" stroke-width="' + w + '"' +
    ' stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>';
};

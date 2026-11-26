/* ==========================================================================
   Mi RCR — Menús desplegables con estilo propio (como los de macOS)
   ──────────────────────────────────────────────────────────────────────────
   Los <select> de toda la app siguen siendo <select> (el valor, el onchange
   y los formularios no cambian), pero en la computadora el menú que se abre
   es propio: una lista de vidrio con la marca de la opción elegida a la
   izquierda y la opción activa en índigo.
   · Se abre con clic, Espacio, Enter o las flechas. Dentro: ↑ ↓, Inicio,
     Fin, escribir las primeras letras para saltar, Enter elige, Esc cierra.
   · En pantallas táctiles se deja el selector del sistema (en el iPhone es
     el menú de iOS, pensado para el dedo).
   · Un <select> con la clase "nativo" (o múltiple) conserva el del navegador.
   ========================================================================== */
(function () {
  var fino = window.matchMedia ? window.matchMedia('(hover: hover) and (pointer: fine)') : null;
  var abierto = null;   // { sel, menu, items, activo, buscar, tBuscar }

  function sirve(el) {
    return !!el && el.tagName === 'SELECT' && !el.multiple && !(el.size > 1) && !el.disabled &&
      !el.classList.contains('nativo') && (!fino || fino.matches);
  }

  /* Opciones visibles (con los títulos de los grupos) */
  function opciones(sel) {
    var out = [];
    var op = function (o, gDis) {
      if (o.hidden) return;
      out.push({ i: o.index, label: (o.label || o.textContent || '').trim(), disabled: o.disabled || gDis });
    };
    Array.prototype.forEach.call(sel.children, function (n) {
      if (n.tagName === 'OPTGROUP') {
        out.push({ grupo: n.label || '' });
        Array.prototype.forEach.call(n.children, function (o) { op(o, n.disabled); });
      } else if (n.tagName === 'OPTION') {
        op(n, false);
      }
    });
    return out;
  }

  function abrir(sel) {
    cerrar(false);
    var lista = opciones(sel);
    var menu = document.createElement('div');
    menu.className = 'sel-menu';
    menu.setAttribute('role', 'listbox');
    menu.tabIndex = -1;
    var nombre = sel.getAttribute('aria-label') || (sel.labels && sel.labels[0] ? sel.labels[0].textContent : '');
    if (nombre) menu.setAttribute('aria-label', nombre.trim());

    var items = [];
    lista.forEach(function (x) {
      if (x.grupo != null) {
        var g = document.createElement('div');
        g.className = 'sel-grupo';
        g.textContent = x.grupo;
        menu.appendChild(g);
        return;
      }
      var on = x.i === sel.selectedIndex;
      var it = document.createElement('div');
      it.className = 'sel-it' + (on ? ' on' : '') + (x.disabled ? ' off' : '');
      it.id = 'sel-it-' + x.i;
      it.setAttribute('role', 'option');
      it.setAttribute('aria-selected', String(on));
      if (x.disabled) it.setAttribute('aria-disabled', 'true');
      it.innerHTML = '<span class="sel-check" aria-hidden="true">' + (on && window.ico ? ico('check', 13, 2.6) : '') +
        '</span><span class="sel-txt"></span>';
      it.querySelector('.sel-txt').textContent = x.label || ' ';
      it.setAttribute('data-k', String(items.length));
      items.push({ el: it, i: x.i, disabled: x.disabled, txt: x.label.toLowerCase() });
      menu.appendChild(it);
    });
    if (!items.length) return;

    document.body.appendChild(menu);
    abierto = { sel: sel, menu: menu, items: items, activo: -1, buscar: '', tBuscar: 0 };
    sel.setAttribute('aria-expanded', 'true');
    colocar();

    var k = items.findIndex(function (x) { return x.i === sel.selectedIndex && !x.disabled; });
    if (k < 0) k = items.findIndex(function (x) { return !x.disabled; });
    marcar(k, true);
    menu.focus({ preventScroll: true });

    menu.addEventListener('mousedown', function (e) { e.preventDefault(); });   // el foco no se va
    menu.addEventListener('mousemove', function (e) {
      var el = e.target.closest('.sel-it');
      if (el && !el.classList.contains('off')) marcar(+el.getAttribute('data-k'), false);
    });
    menu.addEventListener('click', function (e) {
      var el = e.target.closest('.sel-it');
      if (el && !el.classList.contains('off')) elegir(+el.getAttribute('data-k'));
    });
    document.addEventListener('mousedown', fuera, true);
    document.addEventListener('scroll', alScroll, true);
    window.addEventListener('resize', cerrarSinFoco);
  }

  /* Debajo del select (o arriba si no cabe), siempre dentro de la ventana */
  function colocar() {
    var a = abierto, m = a.menu, r = a.sel.getBoundingClientRect();
    var vw = window.innerWidth, vh = window.innerHeight, margen = 8, sep = 4;
    m.style.minWidth = Math.round(Math.min(r.width, vw - 2 * margen)) + 'px';
    m.style.maxWidth = Math.round(Math.min(380, vw - 2 * margen)) + 'px';
    var abajo = vh - r.bottom - sep - margen, arriba = r.top - sep - margen;
    var alto = m.scrollHeight;
    var haciaArriba = alto > abajo && arriba > abajo;
    m.style.maxHeight = Math.round(Math.min(420, Math.max(120, haciaArriba ? arriba : abajo))) + 'px';
    var mw = m.offsetWidth, mh = m.offsetHeight;
    m.style.left = Math.round(Math.min(Math.max(margen, r.left), vw - mw - margen)) + 'px';
    m.style.top = Math.round(haciaArriba ? r.top - sep - mh : r.bottom + sep) + 'px';
    m.classList.toggle('arriba', haciaArriba);
  }

  function marcar(k, centrar) {
    var a = abierto;
    if (!a || k < 0 || k >= a.items.length) return;
    if (a.activo >= 0 && a.items[a.activo]) a.items[a.activo].el.classList.remove('act');
    a.activo = k;
    var el = a.items[k].el, m = a.menu;
    el.classList.add('act');
    m.setAttribute('aria-activedescendant', el.id);
    if (centrar) {
      m.scrollTop = el.offsetTop - (m.clientHeight - el.offsetHeight) / 2;
    } else if (el.offsetTop < m.scrollTop) {
      m.scrollTop = el.offsetTop - 5;
    } else if (el.offsetTop + el.offsetHeight > m.scrollTop + m.clientHeight) {
      m.scrollTop = el.offsetTop + el.offsetHeight - m.clientHeight + 5;
    }
  }

  function mover(d) {
    var a = abierto, n = a.items.length, k = a.activo;
    for (var j = 0; j < n; j++) {
      k += d;
      if (k < 0 || k >= n) return;
      if (!a.items[k].disabled) { marcar(k, false); return; }
    }
  }

  function extremo(final) {
    var a = abierto, n = a.items.length;
    for (var j = 0; j < n; j++) {
      var k = final ? n - 1 - j : j;
      if (!a.items[k].disabled) { marcar(k, false); return; }
    }
  }

  /* Escribir las primeras letras salta a la opción que empieza así */
  function buscarLetra(ch) {
    var a = abierto;
    clearTimeout(a.tBuscar);
    a.buscar += ch.toLowerCase();
    a.tBuscar = setTimeout(function () { if (abierto) abierto.buscar = ''; }, 700);
    var n = a.items.length, ini = a.buscar.length === 1 ? a.activo + 1 : a.activo;
    for (var j = 0; j < n; j++) {
      var k = ((ini + j) % n + n) % n, it = a.items[k];
      if (!it.disabled && it.txt.indexOf(a.buscar) === 0) { marcar(k, false); return; }
    }
  }

  function elegir(k) {
    var a = abierto;
    var it = a && a.items[k];
    if (!it || it.disabled) return;
    var sel = a.sel, cambio = sel.selectedIndex !== it.i;
    cerrar(true);
    if (!cambio) return;
    sel.selectedIndex = it.i;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function cerrar(devolverFoco) {
    var a = abierto;
    if (!a) return;
    abierto = null;
    clearTimeout(a.tBuscar);
    a.menu.remove();
    a.sel.removeAttribute('aria-expanded');
    document.removeEventListener('mousedown', fuera, true);
    document.removeEventListener('scroll', alScroll, true);
    window.removeEventListener('resize', cerrarSinFoco);
    if (devolverFoco && document.contains(a.sel)) a.sel.focus({ preventScroll: true });
  }

  function cerrarSinFoco() { cerrar(false); }
  function fuera(e) { if (abierto && !abierto.menu.contains(e.target)) cerrar(false); }
  function alScroll(e) { if (abierto && e.target !== abierto.menu) cerrar(false); }

  /* Clic en un select: en vez del menú del navegador, el propio */
  document.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    var sel = e.target && e.target.closest ? e.target.closest('select') : null;
    if (!sirve(sel)) return;
    if (e.sourceCapabilities && e.sourceCapabilities.firesTouchEvents) return;   // toque: el del sistema
    e.preventDefault();
    if (abierto && abierto.sel === sel) { cerrar(true); return; }
    sel.focus({ preventScroll: true });
    abrir(sel);
  }, true);

  /* Teclado. Se escucha en window y en captura para que, con el menú
     abierto, Esc solo cierre el menú (no la ventana en la que está). */
  window.addEventListener('keydown', function (e) {
    var a = abierto, k = e.key, maneja = true;
    if (!a) {
      if (!sirve(e.target) || e.ctrlKey || e.metaKey) return;
      if (k === ' ' || k === 'Enter' || k === 'ArrowDown' || k === 'ArrowUp' || k === 'F4') {
        e.preventDefault();
        abrir(e.target);
      }
      return;
    }
    if (k === 'Escape') cerrar(true);
    else if (k === 'Tab') { cerrar(true); maneja = false; }
    else if (k === 'ArrowDown') mover(1);
    else if (k === 'ArrowUp') mover(-1);
    else if (k === 'Home' || k === 'PageUp') extremo(false);
    else if (k === 'End' || k === 'PageDown') extremo(true);
    else if (k === 'Enter' || (k === ' ' && !a.buscar)) elegir(a.activo);
    else if (k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) buscarLetra(k);
    else maneja = false;
    if (maneja) { e.preventDefault(); e.stopImmediatePropagation(); }
  }, true);

  RCR.selMenu = { cerrar: function () { cerrar(false); }, abierto: function () { return !!abierto; } };
})();

/* okie-arrange: press and hold a tile to arrange the start screen where it is.
 *
 *   hold      a tile (a favorite or a room) held for ~0.45 s lifts up and the edit mode of its widget turns on; in edit mode 0.2 s is enough
 *   drag      the tile follows the finger and the others make room, in a grid in both directions (a list keeps its vertical drag)
 *   keep      letting go saves the new order; Reset (in the bar that shows while editing) puts back what it was when the editing started
 *   safety    a move of more than 8 px before the hold is a scroll or a swipe and cancels it; the tap that ends a drag is swallowed
 *   Resize    the height grip of the widget (phones and short windows) shows in the same edit mode
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  var HOLD_MS = 450, HOLD_EDIT_MS = 200, SLOP = 8;

  // ---- pure ---------------------------------------------------------------------------------------------------------------------------------------

  /** The slot nearest to a point (slots: [{x,y,w,h}] in the order they have now) → index */
  function nearestSlot(cx, cy, slots) {
    var best = 0, bd = Infinity;
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i], dx = cx - (s.x + s.w / 2), dy = cy - (s.y + s.h / 2), d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  /** The order after the item at index `at` is dropped on slot `to` */
  function moved(order, at, to) {
    var o = order.slice(); if (at < 0 || at >= o.length) return o;
    to = Math.max(0, Math.min(o.length - 1, to));
    var it = o.splice(at, 1)[0]; o.splice(to, 0, it); return o;
  }

  /** Where every card goes: { id: {dx, dy} } to move from its own slot to the slot of its place in the new order (the dragged one is left out) */
  function shifts(order, next, slots, dragged) {
    var out = {};
    next.forEach(function (id, k) {
      var from = order.indexOf(id);
      if (id === dragged || from < 0 || from === k) return;
      out[id] = { dx: slots[k].x - slots[from].x, dy: slots[k].y - slots[from].y };
    });
    return out;
  }

  /** Has the pointer left the tile far enough, before the hold, to be a scroll? (px, layout pixels) */
  function isScroll(dx, dy, zoom) { var z = zoom || 1; return Math.sqrt(dx * dx + dy * dy) / z > SLOP; }

  var api = { HOLD_MS: HOLD_MS, HOLD_EDIT_MS: HOLD_EDIT_MS, SLOP: SLOP, nearestSlot: nearestSlot, moved: moved, shifts: shifts, isScroll: isScroll };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.arrange = api;

  var core = g.OkieMotor.core, UI = g.OkieMotor.ui, h = UI.h;
  core.registerStrings('en', { 'ar.reset': 'Reset', 'ar.done': 'Done', 'ar.hint': 'Drag to arrange', 'ar.reset_note': 'Back to how it was when you started editing' });
  core.registerStrings('de', { 'ar.reset': 'Zurücksetzen', 'ar.done': 'Fertig', 'ar.hint': 'Zum Ordnen ziehen', 'ar.reset_note': 'Zurück auf den Stand vor dem Bearbeiten' });

  var CSS = [
    '.w1-editbar{display:none;position:fixed;left:50%;bottom:calc(26px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:2999;align-items:center;gap:6px;padding:5px;border-radius:999px;background:rgba(28,26,24,.72);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.16),0 8px 24px rgba(0,0,0,.28);}',
    '.w1-editbar.on{display:flex;animation:ar-in .22s cubic-bezier(.23,1,.32,1) both;}.stage[data-mobile="true"] .w1-editbar{bottom:calc(98px + env(safe-area-inset-bottom,0px));}@keyframes ar-in{from{opacity:0;transform:translateX(-50%) translateY(8px) scale(.96);}to{opacity:1;transform:translateX(-50%);}}',
    '.w1-editbar .ar-hint{padding:0 8px 0 12px;font-size:13px;color:rgba(255,255,255,.7);white-space:nowrap;}',
    '.w1-editbar button{border:0;border-radius:999px;padding:9px 16px;font:inherit;font-size:14px;font-weight:600;color:#fff;background:rgba(255,255,255,.14);cursor:pointer;}',
    '.w1-editbar button.done{background:#fff;color:#1d1b19;}',
    '.w1-editbar button:disabled{opacity:.4;}',
    '@media (hover:hover) and (pointer:fine){.w1-editbar button:not(.done):hover{background:rgba(255,255,255,.24);}}',
    // the lifted tile
    '.arr-lift{z-index:6!important;scale:1.04;box-shadow:0 18px 40px rgba(0,0,0,.35);transition:scale .2s cubic-bezier(.23,1,.32,1),box-shadow .2s!important;}',
    '.arr-moving{transition:transform .22s cubic-bezier(.23,1,.32,1)!important;}',
    '.w1.arranging,.w1.arranging *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}',
    '@media (max-width:640px){.w1-editbar .ar-hint{display:none;}}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  /** The bar that shows while a widget is edited, at the bottom middle of the screen (mount it in the stage, add class on): Reset and Done. o: { onReset(), onDone() } → element */
  function editBar(ctx, o) {
    var t = function (k) { return core.t(k, ctx.lang()); };
    var reset = h('button', { type: 'button', title: t('ar.reset_note'), onclick: function () { if (ctx.haptic) ctx.haptic('tap'); o.onReset(); } }, t('ar.reset'));
    var done = h('button.done', { type: 'button', onclick: function () { if (ctx.haptic) ctx.haptic('tap'); o.onDone(); } }, t('ar.done'));
    return h('div.w1-editbar', { role: 'toolbar' }, h('span.ar-hint', null, t('ar.hint')), reset, done);
  }

  /**
   * A drag in a grid, in both directions. Returns { start(id, x, y, pid), end(), active() }.
   * o: { scroller(), nodes() -> {id: el}, order() -> [ids], apply(next), haptic(kind) }
   */
  function gridSorter(ctx, o) {
    var drag = null;
    function zoom() { return (ctx.host && ctx.host._zoom) || 1; }
    function end(abort) {
      if (!drag) return;
      var d = drag; drag = null;
      window.removeEventListener('pointermove', d.move, true); window.removeEventListener('pointerup', d.up, true); window.removeEventListener('pointercancel', d.up, true);
      var nodes = o.nodes();
      Object.keys(nodes).forEach(function (i) { var n = nodes[i]; if (!n) return; n.style.transform = ''; n.classList.remove('arr-lift', 'arr-moving'); });
      if (!abort && d.next.join() !== d.order.join()) o.apply(d.next);
    }
    function start(id, x0, y0, pid) {
      end(true);
      var nodes = o.nodes(), scroller = o.scroller(), order = o.order().slice(), at = order.indexOf(id), node = nodes[id];
      if (at < 0 || !node) return false;
      var slots = order.map(function (i) { var n = nodes[i]; return { x: n.offsetLeft, y: n.offsetTop, w: n.offsetWidth, h: n.offsetHeight }; });
      var s0 = scroller.scrollTop, d = { order: order, next: order.slice() };
      order.forEach(function (i) { if (i !== id) nodes[i].classList.add('arr-moving'); });
      node.classList.add('arr-lift'); node.style.transition = 'none';
      var lastTarget = at;
      d.move = function (ev) {
        if (ev.pointerId !== pid) return;
        if (ev.cancelable) ev.preventDefault();
        var br = UI.screenRect(scroller);
        if (ev.clientY < br.top + 44) scroller.scrollTop -= 12; else if (ev.clientY > br.bottom - 44) scroller.scrollTop += 12;
        var z = zoom(), dx = (ev.clientX - x0) / z, dy = (ev.clientY - y0) / z + (scroller.scrollTop - s0);
        node.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
        var cx = slots[at].x + slots[at].w / 2 + dx, cy = slots[at].y + slots[at].h / 2 + dy, target = nearestSlot(cx, cy, slots);
        if (target !== lastTarget) {
          lastTarget = target; d.next = moved(order, at, target);
          var sh = shifts(order, d.next, slots, id);
          order.forEach(function (i) { if (i === id) return; var s = sh[i]; nodes[i].style.transform = s ? 'translate(' + s.dx + 'px,' + s.dy + 'px)' : ''; });
          if (o.haptic) o.haptic('detent');
        }
      };
      d.up = function (ev) { if (ev && ev.pointerId !== pid) return; end(ev && ev.type === 'pointercancel'); };
      drag = d;
      window.addEventListener('pointermove', d.move, true); window.addEventListener('pointerup', d.up, true); window.addEventListener('pointercancel', d.up, true);
      return true;
    }
    return { start: start, end: end, active: function () { return !!drag; } };
  }

  /**
   * Hold a tile to arrange. o: {
   *   current() -> { order, nodes, save, sorter } | null     what can be arranged right now (the favorites, the rooms)
   *   layout() -> 'grid' | 'list'
   *   editing() -> bool, enter()                              the edit mode of the widget
   *   skip: a selector for what must not start a hold }
   * Returns { dispose() }.
   */
  function hold(ctx, scroller, o) {
    var skip = o.skip || 'button.mv,.mv,.fv-x,.rm-del,.rm-ord,input,select,textarea,a,.w1-grip,.lmc,.row-sw,.sw,.qc-icon';
    var st = null, dragging = false, grid = null, widget = scroller.closest ? scroller.closest('.w1') : null;
    function zoom() { return (ctx.host && ctx.host._zoom) || 1; }
    function hap(k) { if (ctx.haptic) ctx.haptic(k); }
    function idAt(ord, el) {
      var nodes = ord.nodes || {}, ids = Object.keys(nodes);
      for (var i = 0; i < ids.length; i++) { var n = nodes[ids[i]]; if (n && n.contains && n.contains(el)) return ids[i]; }
      return null;
    }
    function clear() {
      if (st) { clearTimeout(st.timer); window.removeEventListener('pointermove', onMove, true); window.removeEventListener('pointerup', onUp, true); window.removeEventListener('pointercancel', onUp, true); }
      st = null;
    }
    function onDown(e) {
      if (e.button != null && e.button !== 0) return;
      if (e.target.closest && e.target.closest(skip)) return;
      var ord = o.current(); if (!ord || !ord.nodes) return;
      var id = idAt(ord, e.target); if (!id) return;
      clear();
      st = { id: id, x: e.clientX, y: e.clientY, pid: e.pointerId, ord: ord, timer: setTimeout(fire, o.editing() ? HOLD_EDIT_MS : HOLD_MS) };
      window.addEventListener('pointermove', onMove, true); window.addEventListener('pointerup', onUp, true); window.addEventListener('pointercancel', onUp, true);
    }
    function onMove(e) {
      if (!st || e.pointerId !== st.pid) return;
      st.lx = e.clientX; st.ly = e.clientY;
      if (!dragging && isScroll(e.clientX - st.x, e.clientY - st.y, zoom())) clear();      // a scroll or a swipe: not a hold
    }
    function onUp() { if (!dragging) clear(); }
    function fire() {
      if (!st) return;
      var s = st; clearTimeout(s.timer);
      if (!o.editing()) o.enter();
      if (g.OkieMotor.polish && g.OkieMotor.polish.releasePress) g.OkieMotor.polish.releasePress();      // the press shrink gives way to the lift
      var ord = o.current() || s.ord, x = s.lx != null ? s.lx : s.x, y = s.ly != null ? s.ly : s.y, ok = false;
      hap('switch');
      if (o.layout() === 'grid') {
        if (!grid) grid = gridSorter(ctx, { scroller: function () { return scroller; }, nodes: function () { return (o.current() || ord).nodes; }, order: function () { return (o.current() || ord).order; }, apply: function (next) { (o.current() || ord).save(next); }, haptic: hap });
        ok = grid.start(s.id, x, y, s.pid);
      } else if (ord.sorter) {
        ord.sorter.start({ button: 0, pointerId: s.pid, clientX: x, clientY: y, currentTarget: scroller, preventDefault: function () {} }, s.id); ok = true;
      }
      if (!ok) { clear(); return; }
      dragging = true; if (widget) widget.classList.add('arranging');
      // the finger that ends a drag must not also tap the tile
      var swallow = function (ev) { ev.stopPropagation(); ev.preventDefault(); };
      window.addEventListener('click', swallow, true);
      var finish = function () {
        window.removeEventListener('pointerup', finish, true); window.removeEventListener('pointercancel', finish, true);
        dragging = false; if (widget) widget.classList.remove('arranging'); clear(); hap('tap');
        setTimeout(function () { window.removeEventListener('click', swallow, true); }, 350);
      };
      window.addEventListener('pointerup', finish, true); window.addEventListener('pointercancel', finish, true);
    }
    function onTouchMove(e) { if (dragging && e.cancelable) e.preventDefault(); }      // while a tile is carried the page stays still
    function onMenu(e) { if (st || dragging) e.preventDefault(); }
    scroller.addEventListener('pointerdown', onDown);
    scroller.addEventListener('touchmove', onTouchMove, { passive: false });
    scroller.addEventListener('contextmenu', onMenu);
    return { dispose: function () { clear(); scroller.removeEventListener('pointerdown', onDown); scroller.removeEventListener('touchmove', onTouchMove); scroller.removeEventListener('contextmenu', onMenu); } };
  }

  api.hold = hold; api.editBar = editBar; api.gridSorter = gridSorter;
})(typeof globalThis !== 'undefined' ? globalThis : window);

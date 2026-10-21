/* okie-overlay: the one glass window for every popup, toasts, undo pill.
 *
 * FSC: "all open in the same window: it grows out of the button that opened it,
 * dims the card and puts its close button underneath. A proper dialog for
 * keyboards and screen readers - focus moves in and back, Escape closes, and
 * reduce motion shortens the animation."  Toasts: bottom-centre, four types,
 * auto-dismiss after three seconds.  Undo: a destructive call waits six
 * seconds under an undo pill, so undoing means nothing was ever sent.
 */
(function (g) {
  'use strict';

  // ------------------------------------------------- undo queue (pure) ----
  /**
   * createUndoQueue({ setTimeout, clearTimeout, delayMs })
   * defer(label, commit) -> { id, undo(), flush() }
   * Only the commit fires when time runs out; undo() means it never fires.
   */
  function createUndoQueue(o) {
    o = o || {};
    var st = o.setTimeout || g.setTimeout, ct = o.clearTimeout || g.clearTimeout;
    var delay = o.delayMs == null ? 6000 : o.delayMs;
    var items = new Map(), seq = 0, listeners = [];
    function emit() { var list = Array.from(items.values()).map(function (x) { return { id: x.id, label: x.label }; }); listeners.forEach(function (fn) { fn(list); }); }
    return {
      defer: function (label, commit) {
        var id = ++seq, entry = { id: id, label: label, done: false };
        entry.timer = st(function () { if (entry.done) return; entry.done = true; items.delete(id); emit(); commit(); }, delay);
        items.set(id, entry); emit();
        return {
          id: id,
          undo: function () { if (entry.done) return false; entry.done = true; ct(entry.timer); items.delete(id); emit(); return true; },
          flush: function () { if (entry.done) return; entry.done = true; ct(entry.timer); items.delete(id); emit(); commit(); },
        };
      },
      pending: function () { return items.size; },
      onChange: function (fn) { listeners.push(fn); },
    };
  }

  // ------------------------------------------------ morph popup maths ----
  /**
   * morphRects(i) -> where the popup, its close button and the button it grows out of sit, in the frame's own (zoomed) units.
   * i = { frame:{left,top,width,offsetWidth}, anchor:{left,top,width,height}|null, innerW, innerH, width, ratio, placement, contentH }
   * Same maths as Fast Search Card's popup: the frame's zoom is rect width / offset width; an anchored popup lines up with the
   * button ("anchor" = right edges, "anchor-left" = left edges, top on the button) and may use the room down to 62px above the
   * window's bottom edge; the close button sits 14px under it, centred.
   */
  function morphRects(i) {
    var ow = i.frame.offsetWidth, l = ow ? i.frame.width / ow : 1;
    if (!l) return null;
    var vh = i.innerH / l, vw = i.innerW / l, top = i.frame.top / l;
    var mx = vw / 2 - i.frame.left / l, my = vh / 2 - top;
    var von = i.anchor
      ? { l: (i.anchor.left - i.frame.left) / l, t: (i.anchor.top - i.frame.top) / l, w: i.anchor.width / l, h: i.anchor.height / l }
      : { l: mx - 9, t: my - 9, w: 18, h: 18 };
    var anchored = i.placement === 'anchor' || i.placement === 'anchor-left';
    var maxH = anchored ? Math.max(200, Math.round(vh - top - von.t - 62)) : Math.max(200, Math.min(Math.round(vh * (i.ratio || 0.74)), Math.round(vh - 124)));
    var C = Math.max(240, Math.min(i.width, Math.min(ow || vw, vw) - 40));
    var N = i.contentH ? i.contentH : Math.min(maxH, 320);
    var A = Math.round(i.placement === 'anchor' ? von.l + von.w - C : i.placement === 'anchor-left' ? von.l : mx - C / 2);
    var E = Math.round(anchored ? von.t : my - N / 2);
    return { l: l, von: von, maxH: maxH, C: C, N: N, A: A, E: E, bx: A + (C - 36) / 2, by: E + N + 14 };
  }

  // ----------------------------------------------------- focus helpers ----
  var FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';
  function focusables(root) {
    return Array.prototype.filter.call(root.querySelectorAll(FOCUSABLE), function (el) { return el.offsetParent !== null || el === root.activeElement; });
  }

  // -------------------------------------------------------- DOM layer ----
  function createOverlay(host, opts) {
    var ui = (typeof module !== 'undefined' && module.exports) ? require('./okie-ui.js') : g.OkieMotor.ui;
    var h = ui.h;
    opts = opts || {};
    var reduce = !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var layer = h('div.ov-layer');
    var toasts = h('div.ov-toasts', { 'aria-live': 'polite' });
    var undoBar = h('div.ov-undo');
    host.appendChild(layer); host.appendChild(toasts); host.appendChild(undoBar);
    var stack = [];
    var PK = 'cubic-bezier(.34,1.28,.32,1)', RK = 'cubic-bezier(.45,0,.15,1)';

    /** One veil for every popup: fixed to the whole window and kept outside the card's clip, so it also dims and blurs the Home Assistant toolbar (FSC does the same). */
    function mountDim(onClick) {
      var rn = host.getRootNode && host.getRootNode();
      var d = h('div.ov-dim', { 'aria-hidden': 'true' });
      d.addEventListener('click', onClick);
      (rn && rn.nodeType === 11 ? rn : host).appendChild(d);
      return d;
    }

    // ---- sheet ----
    function sheet(o) {
      var origin = o.origin || null;
      var prevFocus = (host.getRootNode && host.getRootNode().activeElement) || document.activeElement;
      var dim = mountDim(function () { close('dim'); });
      var win = h('div.ov-win.glass-panel', { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || 'Dialog', tabindex: '-1' });
      if (o.width) win.style.width = typeof o.width === 'number' ? o.width + 'px' : o.width;
      var body = h('div.ov-body');
      var closeBtn = h('button.ov-close', { 'aria-label': (o.closeLabel || 'Close'), html: ui.icon('close', 20) });
      var wrap = h('div.ov-wrap', null, win, closeBtn);
      var el = h('div.ov-sheet', null, wrap);
      var closed = false;

      function close(reason) {
        if (closed) return; closed = true;
        stack = stack.filter(function (s) { return s !== api; });
        document.removeEventListener('keydown', onKey, true);
        var done = function () { el.remove(); dim.remove(); if (o.onClose) o.onClose(reason); try { if (prevFocus && prevFocus.focus) prevFocus.focus(); } catch (e) {} };
        if (reduce) { done(); return; }
        el.classList.add('out');
        dim.style.transition = 'opacity .16s ease'; dim.style.opacity = '0';
        setTimeout(done, 160);
      }
      function onKey(e) {
        if (stack[stack.length - 1] !== api) return;
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close('escape'); return; }
        if (e.key !== 'Tab') return;
        var f = focusables(el);
        if (!f.length) { e.preventDefault(); return; }
        var first = f[0], last = f[f.length - 1];
        var active = host.getRootNode ? host.getRootNode().activeElement : document.activeElement;
        if (e.shiftKey && (active === first || active === win)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
      var api = { close: close, el: el, body: body, win: win };
      var content = typeof o.content === 'function' ? o.content(close, api) : o.content;
      if (o.title && !o.hideTitle) body.appendChild(h('h2.ov-title', null, o.title));
      if (content) body.appendChild(content);
      win.appendChild(body);
      closeBtn.addEventListener('click', function () { close('button'); });
      layer.appendChild(el);
      if (!reduce) dim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'ease-out' });
      var anchored = false;
      if (o.anchor && o.anchor.getBoundingClientRect) {
        // a popup that grows out of its button (FSC "morph popup"): right edges line up, a little above the button
        var z = (opts.zoom && opts.zoom()) || 1, hr = host.getBoundingClientRect(), ar = o.anchor.getBoundingClientRect();
        wrap.style.position = 'absolute';
        wrap.style.right = ((hr.right - ar.right) / z) + 'px';
        wrap.style.top = ((ar.top - hr.top) / z + (o.anchorDY == null ? -21 : o.anchorDY)) + 'px';
        el.classList.add('anchored'); anchored = true;
      }
      stack.push(api);
      document.addEventListener('keydown', onKey, true);

      // grow out of the origin button
      if (!reduce && anchored) {
        win.style.transformOrigin = 'right top';
        win.animate([{ transform: 'scale(.35)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 380, easing: 'cubic-bezier(.34,1.18,.24,1)' });
      } else if (!reduce && origin && origin.getBoundingClientRect) {
        var hostRect = host.getBoundingClientRect();
        var r = origin.getBoundingClientRect();
        var ox = r.left + r.width / 2 - hostRect.left, oy = r.top + r.height / 2 - hostRect.top;
        win.style.transformOrigin = ox + 'px ' + oy + 'px';
        win.animate([{ transform: 'scale(.2)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 260, easing: 'cubic-bezier(.2,.8,.2,1)' });
      } else if (!reduce) {
        win.animate([{ transform: 'scale(.96)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 200, easing: 'ease-out' });
      }
      var f0 = focusables(win)[0];
      (f0 || win).focus();
      return api;
    }

    // ---- morph popup (FSC's window: grows out of its button, dims the whole window, close button underneath) ----
    var X_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.76 17.24L12 12M17.24 6.76L12 12M12 12L6.76 6.76M12 12L17.24 17.24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    var OFFSET = { left: 'offsetLeft', top: 'offsetTop', width: 'offsetWidth', height: 'offsetHeight' };
    /**
     * morph({ anchor, width, placement:'anchor'|'anchor-left'|'center', className, title, padding, closeLabel, content(close, api), onClose })
     * Fast Search Card timings: grow 0.52s on (.34,1.28,.32,1), shrink back 0.5s on (.45,0,.15,1), content fades in blurred
     * after 0.12s, the dim fades in 0.34s / out 0.44s. When the content changes size the window glides to the new size.
     */
    function morph(o) {
      o = o || {};
      var frame = (opts.frame && opts.frame()) || host;
      var placement = o.placement || 'center', width = o.width || 440;
      var prevFocus = (host.getRootNode && host.getRootNode().activeElement) || document.activeElement;
      var closed = false, cur = null, ro = null;
      var dim = mountDim(function () { close('dim'); });
      var dialog = h('div.morph-popup-dialog', { role: 'dialog', 'aria-modal': 'true', 'aria-label': o.title || 'Dialog', tabindex: '-1' });
      var popup = h('div.morph-popup' + (o.className ? '.' + o.className : ''));
      var inh = h('div.morph-popup-inhalt');
      if (o.padding) inh.style.padding = o.padding;
      var xBtn = h('button.morph-popup-x', { type: 'button', 'aria-label': o.closeLabel || 'Close', html: X_SVG });
      popup.appendChild(inh); dialog.appendChild(popup); dialog.appendChild(xBtn);
      frame.appendChild(dialog);

      function rectsNow(contentH) {
        var fr = frame.getBoundingClientRect();
        var ar = o.anchor && o.anchor.getBoundingClientRect ? o.anchor.getBoundingClientRect() : null;
        return morphRects({
          frame: { left: fr.left, top: fr.top, width: fr.width, offsetWidth: frame.offsetWidth },
          anchor: ar && { left: ar.left, top: ar.top, width: ar.width, height: ar.height },
          innerW: g.innerWidth, innerH: g.innerHeight, width: width, ratio: o.maxHeightRatio, placement: placement, contentH: contentH,
        });
      }
      function measure() {
        var base = rectsNow(0); if (!base) return null;
        inh.style.width = base.C + 'px'; inh.style.maxHeight = base.maxH + 'px';
        return rectsNow(inh.offsetHeight);
      }
      function place(R) {
        popup.style.left = R.A + 'px'; popup.style.top = R.E + 'px'; popup.style.width = R.C + 'px'; popup.style.height = R.N + 'px';
        xBtn.style.left = R.bx + 'px'; xBtn.style.top = R.by + 'px';
      }
      /** where an element is right now (mid-animation too), in its own units */
      function nowAt(el, keys, fallback) {
        var run = el._tw && el._tw.playState === 'running', out = {};
        keys.forEach(function (k) { out[k] = run ? el[OFFSET[k]] : fallback[k]; });
        return out;
      }
      function glide(el, to, from, dur, ease) {
        if (el._tw) el._tw.cancel();
        var a = {}, b = {};
        Object.keys(to).forEach(function (k) { a[k] = from[k] + 'px'; b[k] = to[k] + 'px'; el.style[k] = to[k] + 'px'; });
        el._tw = el.animate([a, b], { duration: dur, easing: ease });
      }
      function relayout() {
        if (closed || !cur) return;
        var R = measure(); if (!R) return;
        if (R.A === cur.A && R.E === cur.E && R.C === cur.C && R.N === cur.N) return;
        var d = reduce ? 180 : 520, ease = reduce ? 'ease-out' : PK;
        var pf = nowAt(popup, ['left', 'top', 'width', 'height'], { left: cur.A, top: cur.E, width: cur.C, height: cur.N });
        var bf = nowAt(xBtn, ['left', 'top'], { left: cur.bx, top: cur.by });
        glide(popup, { left: R.A, top: R.E, width: R.C, height: R.N }, pf, d, ease);
        glide(xBtn, { left: R.bx, top: R.by }, bf, d, ease);
        cur = R;
      }

      function onKey(e) {
        if (stack[stack.length - 1] !== api) return;
        if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close('escape'); return; }
        if (e.key !== 'Tab') return;
        var f = focusables(dialog);
        if (!f.length) { e.preventDefault(); return; }
        var first = f[0], last = f[f.length - 1];
        var active = host.getRootNode ? host.getRootNode().activeElement : document.activeElement;
        if (e.shiftKey && (active === first || active === dialog)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }

      function close(reason) {
        if (closed) return; closed = true;
        stack = stack.filter(function (s) { return s !== api; });
        document.removeEventListener('keydown', onKey, true);
        if (ro) ro.disconnect();
        var done = function () { dialog.remove(); dim.remove(); if (o.onClose) o.onClose(reason); try { if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true }); } catch (e) {} };
        if (!cur) { done(); return; }
        var back = rectsNow(cur.N) || cur, v = back.von;
        var pf = nowAt(popup, ['left', 'top', 'width', 'height'], { left: cur.A, top: cur.E, width: cur.C, height: cur.N });
        var bf = nowAt(xBtn, ['left', 'top'], { left: cur.bx, top: cur.by });
        [popup, xBtn].forEach(function (el) { if (el._tw) el._tw.cancel(); el.style.pointerEvents = 'none'; });
        var D = reduce ? 180 : 500, ease = reduce ? 'ease-out' : RK;
        var keep = { duration: D, easing: ease, fill: 'forwards' };
        popup.animate([{ left: pf.left + 'px', top: pf.top + 'px', width: pf.width + 'px', height: pf.height + 'px', borderRadius: '32px' },
          { left: v.l + 'px', top: v.t + 'px', width: v.w + 'px', height: v.h + 'px', borderRadius: v.w / 2 + 'px' }], keep);
        popup.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduce ? 140 : 300, delay: reduce ? 0 : 50, easing: 'ease-in-out', fill: 'both' });
        xBtn.animate([{ left: bf.left + 'px', top: bf.top + 'px', opacity: 1 }, { left: v.l + 'px', top: v.t + v.h + 14 + 'px', opacity: 0 }],
          { duration: D, easing: ease, fill: 'forwards' });
        inh.animate([{ opacity: 1, filter: 'blur(0px)' }, { opacity: 0, filter: 'blur(8px)' }], { duration: reduce ? 120 : 200, easing: 'ease-out', fill: 'forwards' });
        dim.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 440, easing: 'ease-out', fill: 'forwards' });
        setTimeout(done, Math.max(D, 440) + 20);
      }

      var api = { close: close, el: dialog, popup: popup, body: inh, win: popup, relayout: relayout };
      var content = typeof o.content === 'function' ? o.content(close, api) : o.content;
      if (content) inh.appendChild(content);
      xBtn.addEventListener('click', function (e) { e.stopPropagation(); close('button'); });
      popup.addEventListener('click', function (e) { e.stopPropagation(); });

      var R = measure();
      if (!R) { dialog.remove(); dim.remove(); return sheet({ title: o.title, content: o.content, onClose: o.onClose }); }   // the card is hidden: nothing to grow out of
      place(R); cur = R;
      stack.push(api);
      document.addEventListener('keydown', onKey, true);

      var v = R.von, F = reduce ? { duration: 180, easing: 'ease-out' } : { duration: 520, easing: PK };
      dim.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 340, easing: 'ease-out' });
      popup._tw = popup.animate([{ left: v.l + 'px', top: v.t + 'px', width: v.w + 'px', height: v.h + 'px', borderRadius: v.w / 2 + 'px' },
        { left: R.A + 'px', top: R.E + 'px', width: R.C + 'px', height: R.N + 'px', borderRadius: '32px' }], F);
      xBtn._tw = xBtn.animate([{ left: v.l + 'px', top: v.t + v.h + 14 + 'px' }, { left: R.bx + 'px', top: R.by + 'px' }], F);
      xBtn.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reduce ? 120 : 200, delay: reduce ? 40 : 150, easing: 'ease-out', fill: 'backwards' });
      inh.animate([{ opacity: 0, filter: 'blur(8px)' }, { opacity: 1, filter: 'blur(0px)' }], { duration: reduce ? 120 : 220, delay: reduce ? 40 : 120, easing: 'ease-out', fill: 'backwards' });

      if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(function () { relayout(); }); ro.observe(inh); ro.observe(frame); }
      var f0 = focusables(popup)[0] || dialog;
      try { f0.focus({ preventScroll: true }); } catch (e) {}
      return api;
    }

    // ---- toasts ----
    function toast(type, msg, o) {
      o = o || {};
      if (opts.enabled && opts.enabled() === false) return null;
      var t = h('div.ov-toast.glass.' + (type || 'info'), { role: type === 'error' ? 'alert' : 'status' },
        h('i.dot'), h('span', null, msg));
      if (o.closable !== false && opts.closable && opts.closable()) {
        t.appendChild(h('button.ov-x', { 'aria-label': 'Close', onclick: function () { t.remove(); }, html: ui.icon('close', 14) }));
      }
      toasts.appendChild(t);
      while (toasts.children.length > 3) toasts.firstChild.remove();
      var ms = o.ms == null ? 3000 : o.ms;
      var timer = setTimeout(function () { t.classList.add('out'); setTimeout(function () { t.remove(); }, 200); }, ms);
      t._timer = timer;
      return t;
    }

    // ---- undo pill ----
    var queue = createUndoQueue({});
    var handles = new Map();
    function renderUndo(list) {
      undoBar.innerHTML = '';
      list.forEach(function (x) {
        undoBar.appendChild(h('div.ov-pill.glass', null,
          h('span', null, x.label),
          h('button.ov-undo-btn', { onclick: function () { var hd = handles.get(x.id); if (hd && hd.undo() && hd.onUndo) { handles.delete(x.id); hd.onUndo(); } } }, opts.undoLabel || 'Undo')));
      });
    }
    queue.onChange(renderUndo);
    function defer(label, commit, onUndo) {
      var hd = queue.defer(label, function () { handles.delete(hd.id); commit(); });
      hd.onUndo = onUndo;
      handles.set(hd.id, hd);
      return hd;
    }

    return {
      sheet: sheet, morph: morph, toast: toast, defer: defer,
      closeAll: function () { stack.slice().forEach(function (s) { s.close('closeAll'); }); },
      get open() { return stack.length; },
    };
  }

  var CSS = [
    '.ov-layer{position:absolute;inset:0;z-index:9999;pointer-events:none;}',
    '.stage[data-mobile="true"] .ov-layer{position:fixed;top:var(--okie-fixed-top,0px);left:0;right:0;bottom:0;}',      // on a phone the page is longer than the screen: a card opens in the middle of what you see, not in the middle of the page
    '.ov-sheet{position:absolute;inset:0;pointer-events:none;display:flex;align-items:center;justify-content:center;}.ov-wrap{pointer-events:auto;}',
    '.ov-sheet.anchored{display:block;}.ov-sheet.anchored .ov-close{display:none;}',
    '.ov-sheet.out{opacity:0;transition:opacity .16s ease;}',
    '.ov-dim{position:fixed;inset:0;z-index:9998;background:rgba(20,20,24,.28);-webkit-backdrop-filter:blur(2.8px);backdrop-filter:blur(2.8px);}',
    '.ov-wrap{position:relative;display:flex;flex-direction:column;align-items:center;gap:14px;max-width:calc(100% - 24px);max-height:calc(100vh - 24px);max-height:calc(100dvh - 24px);}',
    '.ov-win{width:min(560px,100%);max-height:calc(100vh - 90px);max-height:calc(100dvh - 90px);overflow:auto;border-radius:35px;padding:22px;scrollbar-width:none;color:#fff;}',
    '.ov-win::-webkit-scrollbar{display:none;}',
    '.ov-title{margin:0 0 14px;font-size:20px;font-weight:600;letter-spacing:-.01em;}',
    '.ov-close{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;flex:none;background:rgba(30,30,30,.55);-webkit-backdrop-filter:var(--glass-backdrop);backdrop-filter:var(--glass-backdrop);border:1px solid var(--glass-border-color);transition:transform .16s;}.ov-close:hover{transform:scale(1.09);}',
    // the morph popup: FSC's glass window, grown out of the button that opened it
    '.morph-popup-dialog{position:absolute;inset:0;pointer-events:none;outline:none;}',
    '.morph-popup{position:absolute;z-index:9999;overflow:hidden;box-sizing:border-box;pointer-events:auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;border-radius:32px;color:rgba(255,255,255,.96);background:linear-gradient(180deg,rgba(255,255,255,.14) 0%,rgba(255,255,255,.04) 42%,rgba(255,255,255,0) 100%),rgba(58,60,66,.58);-webkit-backdrop-filter:var(--okie-popup-backdrop,blur(34px) saturate(190%));backdrop-filter:var(--okie-popup-backdrop,blur(34px) saturate(190%));box-shadow:inset 0 1px 0 rgba(255,255,255,.34),inset 0 -1px 0 rgba(0,0,0,.18),0 1px 2px rgba(0,0,0,.16),0 26px 64px rgba(0,0,0,.36);}',
    '.morph-popup-inhalt{position:absolute;top:0;left:0;display:flex;flex-direction:column;box-sizing:border-box;text-align:left;padding:20px 20px 18px;overflow-y:auto;scrollbar-width:none;}.morph-popup-inhalt::-webkit-scrollbar{display:none;}',
    '@media(max-width:768px){.morph-popup--filter .morph-popup-inhalt{padding:18px 18px 16px!important;}}',
    '.morph-popup-x{position:absolute;z-index:10000;pointer-events:auto;width:36px;height:36px;border-radius:999px;border:none;padding:0;cursor:pointer;display:grid;place-items:center;color:rgba(255,255,255,.9);background:rgba(58,60,66,.72);-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);box-shadow:inset 0 1px 0 rgba(255,255,255,.24),0 8px 20px rgba(0,0,0,.3);transition:transform .16s ease;}',
    '.morph-popup-x:hover{transform:scale(1.09);}.morph-popup--filter~.morph-popup-x svg{display:block;height:21px;width:21px;}',
    '.ov-toasts{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);z-index:60;display:flex;flex-direction:column;gap:8px;align-items:center;pointer-events:none;}',
    '.ov-toast{pointer-events:auto;display:flex;align-items:center;gap:10px;padding:10px 16px;border-radius:9999px;font-size:14px;animation:ov-in .22s ease-out;}',
    '.ov-toast.out{opacity:0;transform:translateY(6px);transition:all .2s ease;}',
    '.ov-toast .dot{width:8px;height:8px;border-radius:50%;background:#8ab4ff;flex:none;}',
    '.ov-toast.success .dot{background:#34c759;}.ov-toast.error .dot{background:#ff3b30;}.ov-toast.warning .dot{background:#ff9f0a;}',
    '.ov-x{opacity:.6;margin-left:4px;}',
    '.ov-undo{position:absolute;left:50%;bottom:76px;transform:translateX(-50%);z-index:60;display:flex;flex-direction:column;gap:8px;}',
    '.ov-pill{display:flex;align-items:center;gap:14px;padding:10px 12px 10px 18px;border-radius:9999px;font-size:14px;animation:ov-in .22s ease-out;}',
    '.ov-undo-btn{padding:6px 14px;border-radius:9999px;background:#fff;color:#1d1b19;font-weight:600;font-size:13px;}',
    '@keyframes ov-in{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:none;}}',
  ].join('\n');

  var api = { createOverlay: createOverlay, createUndoQueue: createUndoQueue, morphRects: morphRects, CSS: CSS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.overlay = api; }
})(typeof globalThis !== 'undefined' ? globalThis : window);

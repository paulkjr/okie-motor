/* okie-controls: reusable control widgets for the detail view.
 *
 *   createDial     circular slider, spring-animated, touch + mouse + keyboard
 *   createSlider   linear glass slider (horizontal or vertical)
 *   createPower    big round power button
 *   createSegment  pill segmented control
 *   createChips    row of selectable chips
 *   throttle       leading+trailing throttle for live service calls while dragging
 */
(function (g) {
  'use strict';
  var FBK = function (el, limit) { var F = g.OkieMotor && g.OkieMotor.feedback; if (F) F.detent(el, limit); };      // a step of a slider or dial → the card ticks (okie-feedback)

  var isNode = typeof module !== 'undefined' && module.exports;
  if (isNode || typeof document === 'undefined') { if (isNode) module.exports = { throttle: throttle }; return; }

  var UI = g.OkieMotor.ui, L = g.OkieMotor.logic, h = UI.h;

  // The dial look (settings.thermo: glow blur, spread, strength and the tick density) is one rule for every wheel, dial and slider: the card says where to read it and tells when it changed.
  var lookSrc = null, lookSubs = [];
  function currentLook() { return L.dialLook(lookSrc ? lookSrc() : null); }
  function setLookSource(fn) { lookSrc = fn; }
  function notifyLook() { lookSubs = lookSubs.filter(function (fn) { try { return fn() !== false; } catch (e) { return false; } }); }
  /** Call `apply` whenever the look changes, for as long as `root` is on the page. */
  function watchLook(root, apply) { var seen = false; lookSubs.push(function () { if (root.isConnected) seen = true; else if (seen) return false; apply(); return true; }); }

  function throttle(fn, ms) {
    var last = 0, timer = 0, pendingArgs = null;
    function fire() { last = Date.now(); timer = 0; var a = pendingArgs; pendingArgs = null; if (a) fn.apply(null, a); }
    var t = function () {
      pendingArgs = arguments;
      var wait = ms - (Date.now() - last);
      if (wait <= 0) { clearTimeout(timer); fire(); }
      else if (!timer) timer = setTimeout(fire, wait);
    };
    t.flush = function () { clearTimeout(timer); if (pendingArgs) fire(); };
    t.cancel = function () { clearTimeout(timer); timer = 0; pendingArgs = null; };
    return t;
  }

  // ---------------------------------------------------------------- dial ----
  /**
   * opts: { min, max, step, value, size, label, gradient:[c0,c1] | color, disabled,
   *         format(v) -> string, onInput(v), onChange(v), ariaLabel }
   */
  function createDial(o) {
    var size = o.size || 260, c = size / 2, r = c - 26, stroke = 18;
    var min = o.min, max = o.max, step = o.step || 1;
    var value = o.value == null ? min : o.value;
    var shown = { x: value, v: 0 };
    var raf = 0, dragging = false, lastDrag = value, disabled = !!o.disabled;
    var gid = 'dg' + Math.random().toString(36).slice(2, 8);
    var A0 = L.ARC.start, A1 = L.ARC.start + L.ARC.sweep;

    var ns = 'http://www.w3.org/2000/svg';
    function svgEl(tag, attrs) { var e = document.createElementNS(ns, tag); Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, attrs[k]); }); return e; }
    var svg = svgEl('svg', { viewBox: '0 0 ' + size + ' ' + size, width: size, height: size, class: 'dial-svg' });
    var defs = svgEl('defs');
    var grad = svgEl('linearGradient', { id: gid, x1: '0', y1: '1', x2: '1', y2: '0' });
    var stops = o.gradient || [o.color || '#f5a30b', o.color || '#f5a30b'];
    grad.appendChild(svgEl('stop', { offset: '0', 'stop-color': stops[0] }));
    grad.appendChild(svgEl('stop', { offset: '1', 'stop-color': stops[1] }));
    defs.appendChild(grad); svg.appendChild(defs);
    var track = svgEl('path', { d: L.arcPath(c, c, r, A0, A1), fill: 'none', stroke: 'rgba(255,255,255,.14)', 'stroke-width': stroke, 'stroke-linecap': 'round' });
    var val = svgEl('path', { d: '', fill: 'none', stroke: 'url(#' + gid + ')', 'stroke-width': stroke, 'stroke-linecap': 'round' });
    var thumb = svgEl('circle', { r: 13, fill: '#fff', stroke: 'rgba(0,0,0,.18)', 'stroke-width': 1 });
    // glow (a blurred, widened copy of the value arc) and ticks (along the sweep, lit up to the value): both follow the dial look
    var gf = svgEl('filter', { id: gid + 'f', x: '-60%', y: '-60%', width: '220%', height: '220%' }), blurEl = svgEl('feGaussianBlur', { stdDeviation: '0' });
    gf.appendChild(blurEl); defs.appendChild(gf);
    var glowPath = svgEl('path', { d: '', fill: 'none', stroke: 'url(#' + gid + ')', 'stroke-width': stroke, 'stroke-linecap': 'round', filter: 'url(#' + gid + 'f)', opacity: '0', 'pointer-events': 'none' });
    var tg = svgEl('g', { 'pointer-events': 'none' }), tickAngles = [];
    svg.appendChild(track); svg.appendChild(glowPath); svg.appendChild(tg); svg.appendChild(val); svg.appendChild(thumb);
    function paintTicks(a) { for (var i = 0; i < tickAngles.length; i++) { var ln = tg.childNodes[i]; if (ln) ln.setAttribute('opacity', tickAngles[i] <= a + 0.01 ? '.78' : '.26'); } }
    function applyLook() {
      var lk = currentLook(), gl = L.dialGlow(lk, size);
      blurEl.setAttribute('stdDeviation', gl.sigma.toFixed(2));
      glowPath.setAttribute('stroke-width', String(stroke + gl.widen * 2)); glowPath.setAttribute('opacity', gl.alpha.toFixed(3));
      glowPath.style.display = gl.sigma <= 0 || gl.alpha < 0.02 ? 'none' : '';
      tg.innerHTML = ''; tickAngles = L.dialTickAngles(lk, A0, A1 - A0);
      var ri = r + stroke / 2 + 5;
      tickAngles.forEach(function (ang, i) { var big = i % 8 === 0, p1 = L.polar(c, c, ri, ang), p2 = L.polar(c, c, ri + (big ? 8 : 4.5), ang); tg.appendChild(svgEl('line', { x1: p1.x.toFixed(1), y1: p1.y.toFixed(1), x2: p2.x.toFixed(1), y2: p2.y.toFixed(1), stroke: '#fff', 'stroke-width': big ? 1.6 : 1.1, 'stroke-linecap': 'round' })); });
      draw(shown.x);
    }

    var center = h('div.dial-center');
    var root = h('div.dial', { role: 'slider', tabindex: disabled ? '-1' : '0', 'aria-label': o.ariaLabel || o.label || '', 'aria-valuemin': String(min), 'aria-valuemax': String(max), style: { width: size + 'px', height: size + 'px' } }, svg, center);

    function draw(v) {
      var a = L.angleForValue(v, min, max);
      if (v <= min + 1e-9) val.setAttribute('d', '');
      else val.setAttribute('d', L.arcPath(c, c, r, A0, Math.max(A0 + 0.01, a)));
      var p = L.polar(c, c, r, a);
      thumb.setAttribute('cx', p.x.toFixed(2)); thumb.setAttribute('cy', p.y.toFixed(2));
      glowPath.setAttribute('d', val.getAttribute('d')); paintTicks(a);
      var frac = (v - min) / (max - min);
      root.style.setProperty('--frac', String(frac));
      center.innerHTML = '';
      var txt = o.format ? o.format(v) : String(Math.round(v));
      center.appendChild(h('div.dial-val', null, txt));
      if (o.label) center.appendChild(h('div.dial-lbl', null, o.label));
      if (o.centerExtra) center.appendChild(o.centerExtra());
      root.setAttribute('aria-valuenow', String(Math.round(v * 100) / 100));
      root.setAttribute('aria-valuetext', txt);
      root.classList.toggle('dis', disabled);
    }
    function animateTo(target) {
      cancelAnimationFrame(raf);
      var last = performance.now();
      (function tick(now) {
        var dt = Math.min(0.05, (now - last) / 1000); last = now;
        L.springStep(shown, target, dt);
        draw(shown.x);
        if (!L.springSettled(shown, target, 0.002 * (max - min))) raf = requestAnimationFrame(tick);
        else { shown.x = target; shown.v = 0; draw(target); }
      })(last);
    }

    function fromEvent(e) {
      var rect = UI.screenRect(svg);
      var v = L.valueFromPointer(rect.left + rect.width / 2, rect.top + rect.height / 2, e.clientX, e.clientY, { min: min, max: max, step: step });
      // do not let a fast drag wrap across the gap from one end to the other
      if (Math.abs(v - lastDrag) > 0.6 * (max - min)) v = lastDrag > (min + max) / 2 ? max : min;
      return v;
    }
    function down(e) {
      if (disabled) return;
      dragging = true; cancelAnimationFrame(raf);
      try { root.setPointerCapture(e.pointerId); } catch (er) {}
      lastDrag = value;
      move(e);
    }
    function move(e) {
      if (!dragging) return;
      var v = fromEvent(e);
      var gap = Math.max(step || 1, (max - min) / 40), stepped = Math.round(v / gap) !== Math.round(value / gap);
      lastDrag = v; value = v; shown.x = v; shown.v = 0; draw(v);
      if (stepped) FBK(root, v <= min || v >= max);
      if (o.onInput) o.onInput(v);
    }
    function up(e) {
      if (!dragging) return;
      dragging = false;
      try { root.releasePointerCapture(e.pointerId); } catch (er) {}
      if (o.onChange) o.onChange(value);
    }
    root.addEventListener('pointerdown', down);
    root.addEventListener('pointermove', move);
    root.addEventListener('pointerup', up);
    root.addEventListener('pointercancel', up);
    root.addEventListener('keydown', function (e) {
      if (disabled) return;
      var d = 0, big = (max - min) / 10;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = step;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -step;
      else if (e.key === 'PageUp') d = big; else if (e.key === 'PageDown') d = -big;
      else if (e.key === 'Home') d = min - value; else if (e.key === 'End') d = max - value;
      else return;
      e.preventDefault();
      var v = L.clamp(L.snap(value + d, step, min), min, max);
      value = v; animateTo(v);
      if (o.onInput) o.onInput(v);
      clearTimeout(root._kt); root._kt = setTimeout(function () { if (o.onChange) o.onChange(value); }, 350);
    });

    applyLook(); watchLook(root, applyLook);
    return {
      el: root,
      get value() { return value; },
      get dragging() { return dragging; },
      /** External update (state change from HA): spring there unless the user is dragging. */
      set: function (v, anim) {
        if (dragging) return;
        value = v;
        if (anim === false) { shown.x = v; shown.v = 0; draw(v); } else animateTo(v);
      },
      setRange: function (a, b, s) { min = a; max = b; if (s) step = s; root.setAttribute('aria-valuemin', String(a)); root.setAttribute('aria-valuemax', String(b)); draw(shown.x); },
      setDisabled: function (b) { disabled = !!b; root.tabIndex = disabled ? -1 : 0; draw(shown.x); },
      setGradient: function (a, b) { var st = grad.querySelectorAll('stop'); st[0].setAttribute('stop-color', a); st[1].setAttribute('stop-color', b); },
      redraw: function () { draw(shown.x); },
      dispose: function () { cancelAnimationFrame(raf); },
    };
  }

  // -------------------------------------------------------------- slider ----
  /** opts: { min, max, step, value, vertical, onInput, onChange, ariaLabel, format, color } */
  function createSlider(o) {
    var min = o.min, max = o.max, step = o.step || 1, value = o.value == null ? min : o.value;
    var vertical = !!o.vertical, dragging = false, disabled = !!o.disabled;
    var glow = h('div.sl-glow'), fill = h('div.sl-fill'); var knob = h('div.sl-knob');
    var label = o.format ? h('div.sl-val') : null;
    var el = h('div.slider' + (vertical ? '.v' : ''), { role: 'slider', tabindex: '0', 'aria-label': o.ariaLabel || '', 'aria-valuemin': String(min), 'aria-valuemax': String(max) }, glow, fill, knob, label);
    var glowSpreadPx = 0;
    if (o.color) el.style.setProperty('--sl', o.color);
    function draw(v) {
      var f = (v - min) / (max - min); f = Math.min(1, Math.max(0, f));
      if (vertical) { fill.style.height = (f * 100) + '%'; glow.style.height = 'calc(' + (f * 100) + '% + ' + glowSpreadPx + 'px)'; knob.style.bottom = 'calc(' + (f * 100) + '% - 3px)'; }
      else { fill.style.width = (f * 100) + '%'; glow.style.width = 'calc(' + (f * 100) + '% + ' + glowSpreadPx + 'px)'; knob.style.left = 'calc(' + (f * 100) + '% - 3px)'; }
      if (label) label.textContent = o.format(v);
      el.setAttribute('aria-valuenow', String(v));
      el.classList.toggle('dis', disabled);
    }
    function fromEvent(e) {
      var r = UI.screenRect(el);
      var f = vertical ? 1 - (e.clientY - r.top) / r.height : (e.clientX - r.left) / r.width;
      f = Math.min(1, Math.max(0, f));
      return L.clamp(L.snap(min + f * (max - min), step, min), min, max);
    }
    var lastTap = { t: 0, x: 0, y: 0 }, downAt = null;
    el.addEventListener('pointerdown', function (e) {
      if (disabled) return;
      var now = Date.now();
      if (o.onDoubleTap && now - lastTap.t < 340 && Math.abs(e.clientX - lastTap.x) < 28 && Math.abs(e.clientY - lastTap.y) < 28) { lastTap.t = 0; downAt = null; o.onDoubleTap(); return; }      // two quick taps: the caller decides (settings: back to the default)
      downAt = { x: e.clientX, y: e.clientY };
      dragging = true; try { el.setPointerCapture(e.pointerId); } catch (er) {} value = fromEvent(e); draw(value); if (o.onInput) o.onInput(value);
    });
    el.addEventListener('pointermove', function (e) { if (!dragging) return; var gap = Math.max(step || 1, (max - min) / 20), before = Math.round(value / gap); value = fromEvent(e); draw(value); if (Math.round(value / gap) !== before) FBK(el, value <= min || value >= max); if (o.onInput) o.onInput(value); });
    var end = function (e) {
      if (!dragging) return; dragging = false; try { el.releasePointerCapture(e.pointerId); } catch (er) {}
      if (downAt && e.type === 'pointerup' && Math.abs(e.clientX - downAt.x) < 8 && Math.abs(e.clientY - downAt.y) < 8) lastTap = { t: Date.now(), x: e.clientX, y: e.clientY };      // a tap, not a drag
      if (o.onChange) o.onChange(value);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    el.addEventListener('keydown', function (e) {
      if (disabled) return;
      var d = 0;
      if (e.key === 'ArrowRight' || e.key === 'ArrowUp') d = step; else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') d = -step;
      else if (e.key === 'PageUp') d = (max - min) / 10; else if (e.key === 'PageDown') d = -(max - min) / 10;
      else if (e.key === 'Home') d = min - value; else if (e.key === 'End') d = max - value; else return;
      e.preventDefault(); value = L.clamp(L.snap(value + d, step, min), min, max); draw(value);
      if (o.onInput) o.onInput(value);
      clearTimeout(el._kt); el._kt = setTimeout(function () { if (o.onChange) o.onChange(value); }, 350);
    });
    function applyLook() {
      var gl = L.sliderGlow(currentLook());
      var fade = gl.blur > 0.2 ? Math.round(Math.max(6, gl.blur * 2.2)) : 0;      // the light fades out over this many px: a plain gradient, a blurred layer drew vertical streaks into the track on the iPad
      glowSpreadPx = Math.round(gl.spread * 2) + fade; glow.style.setProperty('--gf', fade + 'px'); glow.style.filter = 'none'; glow.style.opacity = gl.alpha.toFixed(3); draw(value);
    }
    applyLook(); watchLook(el, applyLook);
    return { el: el, get value() { return value; }, set: function (v) { if (dragging) return; value = v; draw(v); }, setRange: function (a, b, s) { min = a; max = b; if (s) step = s; draw(value); }, setDisabled: function (b) { disabled = !!b; draw(value); } };
  }

  // --------------------------------------------------------------- power ----
  function createPower(o) {
    var btn = h('button.power', { 'aria-label': o.label || 'Power', 'aria-pressed': 'false', onclick: function () { if (o.onToggle) o.onToggle(); }, html: UI.icon(o.icon || 'power', 30) });
    return { el: btn, set: function (on) { btn.classList.toggle('on', !!on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); }, setDisabled: function (b) { btn.disabled = !!b; } };
  }

  // ------------------------------------------------------------- segment ----
  /** options: [{id, label, icon?}] */
  function createSegment(o) {
    var el = h('div.segment', { role: 'radiogroup', 'aria-label': o.ariaLabel || '' });
    var current = o.value;
    function render() {
      el.innerHTML = '';
      o.options.forEach(function (op) {
        el.appendChild(h('button.sg' + (op.id === current ? '.on' : ''), { role: 'radio', 'aria-checked': op.id === current ? 'true' : 'false', title: op.label, onclick: function () { if (current === op.id) return; current = op.id; render(); if (o.onChange) o.onChange(op.id); } },
          op.icon ? h('span', { html: UI.icon(op.icon, 18) }) : null, op.noLabel ? null : h('span', null, op.label)));
      });
    }
    render();
    return { el: el, set: function (v) { current = v; render(); } };
  }

  // --------------------------------------------------------------- chips ----
  function createChips(o) {
    var el = h('div.chiprow');
    var current = o.value;
    function render() {
      el.innerHTML = '';
      o.options.forEach(function (op) {
        var b = h('button.cp' + (op.id === current ? '.on' : ''), { 'aria-pressed': op.id === current ? 'true' : 'false', onclick: function () { current = op.id; render(); if (o.onChange) o.onChange(op.id); } },
          op.swatch ? h('i.sw', { style: { background: op.swatch } }) : null, op.label ? h('span', null, op.label) : null);
        if (op.title) b.title = op.title;
        el.appendChild(b);
      });
    }
    render();
    return { el: el, set: function (v) { current = v; render(); } };
  }

  var CSS = [
    '.dial{position:relative;touch-action:none;user-select:none;cursor:pointer;flex:none;}',
    '.dial.dis{opacity:.45;cursor:default;}',
    '.dial-svg{position:absolute;inset:0;overflow:visible;}',
    '.dial-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;gap:4px;}',
    '.dial-val{font-size:54px;font-weight:300;letter-spacing:-.03em;line-height:1;}',
    '.dial-lbl{font-size:13px;color:var(--okie-text-dim);text-transform:uppercase;letter-spacing:.08em;}',
    '.slider{position:relative;height:56px;border-radius:9999px;background:rgba(120,120,128,.3);-webkit-backdrop-filter:blur(24px) saturate(1.4);backdrop-filter:blur(24px) saturate(1.4);overflow:hidden;touch-action:none;cursor:pointer;flex:1;}',
    '.slider.v{width:64px;height:220px;flex:none;}',
    '.sl-fill{position:absolute;left:0;bottom:0;background:var(--sl,#fff);height:100%;width:0;}',      // iOS style: the fill is the track cut straight, no handle, no glow
    '.sl-glow{display:none;position:absolute;left:0;bottom:0;background:linear-gradient(90deg,var(--sl,#fff) 0,var(--sl,#fff) calc(100% - var(--gf,0px)),transparent 100%);height:100%;width:0;pointer-events:none;}',      // light that spills from the filled part into the track (the dial look)
    '.slider.v .sl-fill,.slider.v .sl-glow{width:100%;}.slider.v .sl-glow{height:0;background:linear-gradient(0deg,var(--sl,#fff) 0,var(--sl,#fff) calc(100% - var(--gf,0px)),transparent 100%);}',
    '.sl-knob{display:none;position:absolute;background:rgba(0,0,0,.3);border-radius:3px;width:4px;top:50%;height:24px;margin:-12px 0 0 -16px;pointer-events:none;}',
    '.slider.v .sl-knob{height:4px;width:24px;left:50%;right:auto;top:auto;margin:0 0 0 -12px;transform:translateY(18px);}',
    '.sl-val{position:absolute;left:20px;top:50%;transform:translateY(-50%);font-weight:600;color:#1d1b19;mix-blend-mode:normal;pointer-events:none;}',
    '.slider.dis{opacity:.45;}',
    '.power{width:76px;height:76px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);color:var(--okie-text);transition:background .2s,color .2s,transform .12s;flex:none;}',
    '.power.on{background:#fff;color:#1d1b19;}',
    '.power:disabled{opacity:.4;}',
    '.segment{display:inline-flex;gap:4px;padding:4px;border-radius:9999px;background:rgba(255,255,255,.1);max-width:100%;overflow-x:auto;scrollbar-width:none;}',
    '.sg{display:inline-flex;align-items:center;gap:7px;padding:9px 16px;border-radius:9999px;font-size:14px;font-weight:500;white-space:nowrap;}',
    '.sg.on{background:#fff;color:#1d1b19;}',
    '.chiprow{display:flex;gap:8px;flex-wrap:wrap;}',
    // the text field every sheet and list uses (event form, tasks, assistant): a dark glass box, not the browser's white one
    '.s-text{box-sizing:border-box;width:100%;max-width:340px;min-width:0;height:44px;padding:0 16px;border:0;outline:0;border-radius:14px;background:rgba(255,255,255,.1);color:var(--okie-text,#fff);font:inherit;font-size:15px;-webkit-appearance:none;appearance:none;color-scheme:dark;transition:background .15s ease,box-shadow .15s ease;}',
    'textarea.s-text{display:block;height:auto;min-height:44px;padding:12px 16px;line-height:1.4;}.s-text::placeholder{color:var(--okie-text-dim);opacity:1;}.s-text:focus{background:rgba(255,255,255,.15);box-shadow:0 0 0 2px rgba(255,255,255,.4);}',
    'select.s-text{padding-right:40px;background-image:url("data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 12 8%22 fill=%22none%22 stroke=%22%23fff%22 stroke-opacity=%22.7%22 stroke-width=%221.8%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M1 1.5l5 5 5-5%22/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 16px center;background-size:12px 8px;}',
    '.cp{display:inline-flex;align-items:center;gap:8px;padding:9px 16px;border-radius:9999px;font-size:14px;font-weight:500;background:rgba(255,255,255,.1);}',
    '.cp.on{background:#fff;color:#1d1b19;}',
    '.cp .sw{width:16px;height:16px;border-radius:50%;display:inline-block;border:1px solid rgba(255,255,255,.3);}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  g.OkieMotor.controls = { setLookSource: setLookSource, notifyLook: notifyLook, createDial: createDial, createSlider: createSlider, createPower: createPower, createSegment: createSegment, createChips: createChips, throttle: throttle, CSS: CSS };
})(typeof globalThis !== 'undefined' ? globalThis : window);

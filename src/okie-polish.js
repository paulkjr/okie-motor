/* okie-polish: touch and accessibility details for the whole card (after Emil Kowalski's apple-design notes).
 *
 *   hit areas      small controls get an invisible touch area of at least 44 screen px (the card is zoomed down on tablets, which shrinks every control with it).
 *                  Controls in a row grow only upwards and downwards, so a neighbour never loses its own spot.
 *   press feedback a control reacts on pointer-down, not on release (a small shrink); iOS only styles :active when a touch listener exists
 *   feel pass      (after emilkowalski/skills: emil-design-eng + mobile-native) hover effects only where a real pointer hovers (no sticky hover after a tap);
 *                  plain "ease" on short transitions becomes a strong ease-out; press = 120 ms in / 160 ms out, interruptible (Web Animations), touch waits 60 ms so a scroll start never flashes;
 *                  no tap-highlight box, no double-tap zoom delay, no long-press callout on controls, scrollers keep their scroll to themselves, 16 px form fields on touch
 *   reduced motion slides, springs and loops become a short fade (prefers-reduced-motion)
 *   transparency   prefers-reduced-transparency: no blur, near solid surfaces;  prefers-contrast: more: stronger text and a clear edge
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;

  var HIT = 'calc(44px / var(--okie-zoom,1))';
  var ISOLATED = ['.dt-circ', '.ios-back', '.ts-back', '.ios-info-btn', '.ios-changed', '.th-sw', '.th-sched', '.vc-rs', '.vs-run', '.vs-edit', '.ts-stb', '.sw', '.category-icon', '.ai-button', '.filter-main-button', '.island-ruheknopf', '.qc-icon', '.ios-switch', '.th-stp', '.rm-power', '.dt-bubble'];
  var ROWS = ['.dt-tab', '.w1-tab', '.w1-view button', '.ts-day', '.cp', '.vc-job', '.ts-add', '.act', '.th-power', '.wx-loc', '.w1-edit'];
  var COLS = ['.vpm-item'];                                   // icons stacked in a column: they grow sideways only
  var PRESSABLE = 'button,[role="button"],[role="tab"],[role="switch"],.device-card,.device-list-item,.cp,.w1-tab';
  var SCROLLERS = ['.w1-body', '.cam-strip', '.wheel', '.island-list', '.island-list-reiter', '.nc-list', '.ov-win', '.morph-popup-inhalt', '.results-container', '.subcategory-row', '.okie-scroll'];
  var HAS_WAAPI = typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function';
  var EASE = 'cubic-bezier(.23,1,.32,1)';                      // strong ease-out: starts fast, so the interface answers at once
  var HOVER_MQ = '@media (hover:hover) and (pointer:fine)';
  var pseudo = function (list) { return list.map(function (s) { return s + '::before'; }).join(','); };
  var where = function (list) { return list.map(function (s) { return ':where(' + s + ')'; }).join(','); };

  var CSS = [
    where(ISOLATED.concat(ROWS, COLS)) + '{position:relative;}',
    pseudo(ISOLATED) + '{content:"";position:absolute;left:50%;top:50%;width:max(100%,' + HIT + ');height:max(100%,' + HIT + ');transform:translate(-50%,-50%);}',
    pseudo(ROWS) + '{content:"";position:absolute;left:0;right:0;top:50%;height:max(100%,' + HIT + ');transform:translateY(-50%);}',
    pseudo(COLS) + '{content:"";position:absolute;top:0;bottom:0;left:50%;width:max(100%,' + HIT + ');transform:translateX(-50%);}',
    HAS_WAAPI ? '' : ':where(' + PRESSABLE + '):where(:active){scale:.97;}',
    ':host{-webkit-tap-highlight-color:transparent;-webkit-text-size-adjust:100%;text-size-adjust:100%;}',
    ':where(button,input,select,textarea,.device-card,.device-list-item,.cp,.w1-tab){touch-action:manipulation;}',
    ':where(button,[role="button"],[role="tab"],[role="switch"],.device-card,.device-list-item,.cp,.w1-tab){-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}',
    ':where(' + SCROLLERS.join(',') + '){overscroll-behavior:contain;}',
    '@media (pointer:coarse){.ios-input,.gd-input,.lss-select,.lme-select{font-size:16px;}}',
    ':where([role="button"],[role="tab"],[role="switch"],a,label,select,summary){touch-action:manipulation;}',
    '@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation-duration:.14s!important;animation-delay:0s!important;animation-iteration-count:1!important;transition-duration:.14s!important;transition-delay:0s!important;scroll-behavior:auto!important;}:where(' + PRESSABLE + '):where(:active){scale:1;}}',
    '@media (prefers-reduced-transparency:reduce){*,*::before,*::after{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;}',
    '.glass-panel,.detail-wrap,.search-panel,.morph-popup,.vpm-more-popup,.island-wertekapsel,.island-pill{background:rgb(38,35,32)!important;}',
    '.dt-circ,.cam-pill,.cc-chip,.fd-back,.w1-tab:not(.on),.w1-view,.dt-menu .dt-bar,.rc-chip,.rc-live{background:rgba(38,35,32,.92)!important;}}',
    '@media (prefers-contrast:more){:host{--okie-text-dim:rgba(255,255,255,.9);}.glass-panel,.detail-wrap,.search-panel,.device-card,.device-list-item{outline:1px solid rgba(255,255,255,.55);outline-offset:-1px;}.ios-item-subtitle,.ios-text,.ios-section-header,.vc-tl,.vs-jk,.ts-prof-hint{color:rgba(255,255,255,.88)!important;}}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  // iOS Safari applies :active only when something listens for touches: an empty passive listener switches it on, so the press shows at once
  if (!g.__okieActiveOn) { g.__okieActiveOn = true; try { document.addEventListener('touchstart', function () {}, { passive: true }); } catch (e) { /* no touch events */ } }


  // ---- pure helpers --------------------------------------------------------------------------------------------------------------------------------

  // split a selector list on top-level commas (":is(a,b)" stays whole)
  function splitSel(sel) {
    var out = [], depth = 0, cur = '';
    for (var i = 0; i < sel.length; i++) {
      var c = sel.charAt(i);
      if (c === '(' || c === '[') depth++; else if (c === ')' || c === ']') depth--;
      if (c === ',' && depth === 0) { out.push(cur); cur = ''; } else cur += c;
    }
    if (cur.trim()) out.push(cur);
    return out;
  }

  // every top-level rule whose selector uses :hover moves into (hover:hover) and (pointer:fine); a tap on a touch screen no longer leaves it stuck
  function gateHover(css) {
    var out = '', i = 0, n = css.length;
    while (i < n) {
      var open = -1, q = '';
      for (var j = i; j < n; j++) {                            // find the next "{" outside quotes and comments
        var c = css.charAt(j);
        if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; }
        if (c === '"' || c === "'") { q = c; continue; }
        if (c === '/' && css.charAt(j + 1) === '*') { var e = css.indexOf('*/', j + 2); j = e < 0 ? n : e + 1; continue; }
        if (c === '{') { open = j; break; }
        if (c === ';' ) { break; }                            // a statement such as @import
      }
      if (open < 0) { out += css.slice(i); break; }
      var depth = 1, k = open + 1; q = '';
      for (; k < n && depth > 0; k++) {
        var d = css.charAt(k);
        if (q) { if (d === '\\') k++; else if (d === q) q = ''; continue; }
        if (d === '"' || d === "'") { q = d; continue; }
        if (d === '{') depth++; else if (d === '}') depth--;
      }
      var head = css.slice(i, open), body = css.slice(open + 1, k - 1), lead = head.match(/^\s*/)[0], sel = head.slice(lead.length);
      if (sel.charAt(0) === '@') {
        var at = /^@(media|supports)\b/.test(sel) && !/hover\s*:\s*hover/.test(sel);
        out += lead + sel + '{' + (at ? gateHover(body) : body) + '}';
      } else {
        var hov = [], rest = [];
        splitSel(sel).forEach(function (one) { (/:hover/.test(one) && !/:not\([^)]*:hover/.test(one) ? hov : rest).push(one.trim()); });
        if (!hov.length) out += lead + sel + '{' + body + '}';
        else out += lead + (rest.length ? rest.join(',') + '{' + body + '}' : '') + HOVER_MQ + '{' + hov.join(',') + '{' + body + '}}';
      }
      i = k;
    }
    return out;
  }

  // plain "ease" / "ease-out" in a short transition or animation becomes the strong ease-out; slow ambient motion (1 s or more) and loops stay as designed
  function strongEase(css) {
    return String(css || '').replace(/\b(transition|animation)(\s*:\s*)([^;}]+)/g, function (m, prop, colon, val) {
      if (/\binfinite\b/.test(val)) return m;
      var long = false;
      val.replace(/(^|[\s,])(\d*\.?\d+)(m?s)(?=[\s,;]|$)/g, function (x, a, num, unit) { if (unit === 's' && parseFloat(num) >= 1) long = true; return x; });
      if (long) return m;
      return prop + colon + val.replace(/(^|[\s,])ease(?:-out)?(?=[\s,;]|$)/g, '$1' + EASE);
    });
  }

  function feel(css) { return strongEase(gateHover(css)); }

  // ---- Safari without var() in backdrop-filter --------------------------------------------------------------------------------------------------------
  // Safari 26 on macOS 14 knows only -webkit-backdrop-filter, and it drops it when its value comes from var(): every glass surface of the card lost its blur there.
  // bfRules finds those declarations (with the @media / @supports they sit in), bfCss writes them again with the value worked out, in a stylesheet that comes last.

  function bfScan(css, chain, out) {
    var i = 0, n = css.length;
    while (i < n) {
      var open = -1, q = '';
      for (var j = i; j < n; j++) {
        var c = css.charAt(j);
        if (q) { if (c === '\\') j++; else if (c === q) q = ''; continue; }
        if (c === '"' || c === "'") { q = c; continue; }
        if (c === '/' && css.charAt(j + 1) === '*') { var e = css.indexOf('*/', j + 2); j = e < 0 ? n : e + 1; continue; }
        if (c === '{') { open = j; break; }
        if (c === ';') break;
      }
      if (open < 0) return;
      var depth = 1, k = open + 1; q = '';
      for (; k < n && depth > 0; k++) {
        var d = css.charAt(k);
        if (q) { if (d === '\\') k++; else if (d === q) q = ''; continue; }
        if (d === '"' || d === "'") { q = d; continue; }
        if (d === '{') depth++; else if (d === '}') depth--;
      }
      var sel = css.slice(i, open).replace(/\/\*[\s\S]*?\*\//g, '').trim(), body = css.slice(open + 1, k - 1);
      if (sel.charAt(0) === '@') { if (/^@(media|supports)\b/.test(sel)) bfScan(body, chain.concat([sel]), out); }
      else if (sel) {
        var re = /(?:^|;)\s*(?:-webkit-)?backdrop-filter\s*:\s*([^;]*)/g, m, last = null;
        while ((m = re.exec(body))) { if (/var\(/.test(m[1])) last = m[1]; }
        if (last) { var imp = /!important\s*$/.test(last); out.push({ chain: chain, sel: sel, value: last.replace(/\s*!important\s*$/, '').trim(), important: imp }); }
      }
      i = k;
    }
  }
  function bfRules(css) { var out = []; bfScan(String(css || ''), [], out); return out; }

  /** resolve(valueText) -> the value with its var() worked out ('' when it cannot be) */
  function bfCss(rules, resolve) {
    return rules.map(function (r) {
      var v = resolve(r.value); if (!v || /var\(/.test(v)) v = 'none';
      var rule = r.sel + '{-webkit-backdrop-filter:' + v + (r.important ? '!important' : '') + ';}';
      return r.chain.reduceRight(function (inner, pre) { return pre + '{' + inner + '}'; }, rule);
    }).join('\n');
  }
  var needsBfShim = function () { try { if (g.__okieBfShim) return true; var C = g.CSS; return !!C && typeof C.supports === 'function' && !C.supports('backdrop-filter', 'blur(1px)') && C.supports('-webkit-backdrop-filter', 'blur(1px)'); } catch (e) { return false; } };      // (g.CSS: this file has its own variable called CSS)


  // ---- press feedback ------------------------------------------------------------------------------------------------------------------------------
  // WAAPI instead of :active so it can be interrupted half way: letting go mid-press eases back from where it is, never from a jump

  var scaleOf = function (el) { var v = getComputedStyle(el).scale; var n = parseFloat(v); return v && v !== 'none' && isFinite(n) ? n : 1; };
  // Small controls shrink under the finger. A card, a row, or a button against the edge of its card would show a gap when it shrinks, so those light up instead:
  // a soft tint over their own surface (an inset shadow, so the blur behind a glass card stays untouched).
  var BIG = '.rc-go,.lmc-go,.rm-card,.rc.open,.camcard,.gcard';
  var PRESS_ALL = PRESSABLE + ',' + BIG;
  var isSmall = function (el) {
    if (el.matches(BIG) || el.closest('.rc-go,.lmc-go')) return false;
    var r = el.getBoundingClientRect(); return r.width <= 150 && r.height <= 110;
  };
  /** The tint for a surface with this background colour: a light surface is dimmed, a dark, coloured or see-through one is brightened. Returns a colour string. */
  function tintFor(bg) {
    var m = /rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+%?))?/.exec(String(bg || ''));
    if (!m) return 'rgba(255,255,255,.12)';
    var a = m[4] == null ? 1 : (/%$/.test(m[4]) ? parseFloat(m[4]) / 100 : parseFloat(m[4]));
    var lum = (0.2126 * +m[1] + 0.7152 * +m[2] + 0.0722 * +m[3]) / 255;
    if (a < 0.5) return 'rgba(255,255,255,.12)';
    return lum > 0.62 ? 'rgba(0,0,0,.09)' : 'rgba(255,255,255,.17)';
  }
  var pressable = function (e) {
    var path = e.composedPath ? e.composedPath() : [e.target];
    for (var i = 0; i < path.length; i++) {
      var n = path[i];
      if (n && n.nodeType === 1 && n.matches && n.matches(PRESS_ALL)) return (n.disabled || n.getAttribute('aria-disabled') === 'true') ? null : n;
    }
    return null;
  };

  var releasePress = function () {};
  if (HAS_WAAPI && !g.__okiePress) {
    g.__okiePress = true;
    var cur = null, timer = 0;
    var reduce = function () { try { return matchMedia('(prefers-reduced-motion:reduce)').matches; } catch (e) { return false; } };
    var down = function (el) {
      if (isSmall(el)) {
        var base = scaleOf(el);
        cur = { el: el, small: true, base: base, anim: el.animate([{ scale: String(base) }, { scale: String(base * 0.97) }], { duration: 120, easing: EASE, fill: 'forwards' }) };
      } else {
        var cs = getComputedStyle(el), sh = cs.boxShadow, from = sh === 'none' ? 'none' : sh, to = (sh === 'none' ? '' : sh + ', ') + 'inset 0 0 0 999px ' + tintFor(cs.backgroundColor);
        cur = { el: el, small: false, base: from, anim: el.animate([{ boxShadow: from }, { boxShadow: to }], { duration: 100, easing: EASE, fill: 'forwards' }) };
      }
    };
    var up = function () {
      clearTimeout(timer);
      var c = cur; cur = null;
      if (!c || c.pending) return;
      var back;
      if (c.small) { var from = scaleOf(c.el); c.anim.cancel(); back = c.el.animate([{ scale: String(from) }, { scale: String(c.base) }], { duration: 160, easing: EASE }); }
      else { var now = getComputedStyle(c.el).boxShadow; c.anim.cancel(); back = c.el.animate([{ boxShadow: now }, { boxShadow: c.base }], { duration: 220, easing: EASE }); }
      back.onfinish = back.oncancel = function () { try { back.cancel(); } catch (e) { /* gone */ } };
    };
    releasePress = function () { clearTimeout(timer); if (cur && cur.pending) cur = null; else up(); };
    document.addEventListener('pointerdown', function (e) {
      if ((e.button || 0) !== 0 || reduce()) return;
      up();
      var el = pressable(e);
      if (!el) return;
      if (e.pointerType === 'mouse') down(el);
      else {                                                    // touch/pen: wait 60 ms so the start of a scroll never flashes a press
        var pending = el; timer = setTimeout(function () { down(pending); }, 60);
        cur = { el: el, pending: true, base: 1, anim: { cancel: function () {} } };
        cur.pendingEl = pending;
      }
    }, true);
    document.addEventListener('pointerup', function () {
      var c = cur;
      if (c && c.pending) { clearTimeout(timer); var el = c.el; cur = null; down(el); setTimeout(up, 70); return; }   // a quick tap still shows its press
      up();
    }, true);
    document.addEventListener('pointercancel', function () { clearTimeout(timer); if (cur && cur.pending) cur = null; else up(); }, true);
    document.addEventListener('dragstart', function () { clearTimeout(timer); if (cur && cur.pending) cur = null; else up(); }, true);
  }

  g.OkieMotor.polish = { bfRules: bfRules, bfCss: bfCss, needsBfShim: needsBfShim, tintFor: tintFor, releasePress: function () { releasePress(); }, feel: feel, gateHover: gateHover, strongEase: strongEase, EASE: EASE, CSS: CSS, HIT: HIT, ISOLATED: ISOLATED, ROWS: ROWS };
})(typeof globalThis !== 'undefined' ? globalThis : window);

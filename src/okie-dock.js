/* okie-dock: the left rail ("vision pro menu") with the shortcuts to the system
 * apps. A dark glass pill, vertically centred on the panel, 20px icons; on hover
 * it widens and each icon grows a label. On phones it becomes a bottom bar with
 * a "more" popup. Order, visibility and the "Configure items" list come from
 * settings.sidebar.items; the rules are pure and tested.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // Home, Energy, Forecast, Calendar, Music, News, Tips, Schedules, Server, Tasks, Settings, Changelog (what you use most first, the housekeeping last)
  var DEFAULT_ORDER = ['home', 'lights', 'energy', 'weather', 'calendar', 'music', 'sensors', 'news', 'tips', 'schedules', 'server', 'tasks', 'settings', 'changelog', 'assistant'];
  var DEFAULT_OFF = { assistant: 1 };
  var ICON = { home: 'home', changelog: 'code', energy: 'bolt', weather: 'cloud', tips: 'tips', news: 'newsbook', tasks: 'checklist', schedules: 'calclock', server: 'server', settings: 'gear', calendar: 'calendar', music: 'music', lights: 'bulb', sensors: 'door', assistant: 'spark' };

  /**
   * dockItems({ available: [ids that exist], saved: [ids]|null }) -> ordered ids to show.
   * saved is the user's "Configure items" list (order + which are on); null = defaults.
   */
  function dockItems(o) {
    var avail = new Set(o.available || []);
    var order = (o.saved && o.saved.length ? o.saved : DEFAULT_ORDER.filter(function (id) { return !DEFAULT_OFF[id]; }));
    var out = [], seen = new Set();
    order.forEach(function (id) { if (id === 'home' || avail.has(id)) { if (!seen.has(id)) { seen.add(id); out.push(id); } } });
    if (!seen.has('home')) out.unshift('home');                    // Home is always there
    return out;
  }
  /** Every configurable id with its on/off state, in the saved order then the rest (for the Configure items page). */
  function configurable(o) {
    var avail = new Set(o.available || []);
    var base = DEFAULT_ORDER.filter(function (id) { return id === 'home' || avail.has(id); });
    var saved = (o.saved || []).filter(function (id) { return base.indexOf(id) >= 0; });
    var rest = base.filter(function (id) { return saved.indexOf(id) < 0; });
    var onSet = new Set(o.saved && o.saved.length ? o.saved : base.filter(function (id) { return !DEFAULT_OFF[id]; }));
    return saved.concat(rest).map(function (id) { return { id: id, on: id === 'home' ? true : onSet.has(id) }; });
  }
  /** How many fit the vertical rail (34px item + 8px gap, 24px padding) before the rest go behind "more". */
  function visibleCount(total, railHeight) {
    var per = 42, fit = Math.max(3, Math.floor((railHeight - 24 + 8) / per));
    return total <= fit ? total : Math.max(3, fit - 1);
  }

  /**
   * A finger has no hover, and it hides the icon it touches. So on a touch screen the rail opens the moment a finger lands (same spring as the hover), the row under the finger
   * lights up across the whole row, the highlight follows the finger while it slides over the rail, and lifting the finger on a row goes into that app (lifting off the rail
   * goes nowhere). The rail folds again a moment later. pressStep({ type }) -> { open }: a finger or pen landing; releaseStep({ index }) -> { go, fold }: index of the row
   * under the finger when it lifts (-1 = none), fold = ms until the rail closes.
   */
  var FOLD_TAP = 1400, FOLD_TOUCH = 2600, FOLD_MISS = 400;
  function isTouch(type) { return !!type && type !== 'mouse'; }
  function pressStep(o) { return { open: isTouch(o.type), fold: FOLD_TOUCH }; }
  function releaseStep(o) { return o.index >= 0 ? { go: true, fold: FOLD_TAP } : { go: false, fold: FOLD_MISS }; }

  var api = { pressStep: pressStep, releaseStep: releaseStep, isTouch: isTouch, dockItems: dockItems, configurable: configurable, visibleCount: visibleCount, DEFAULT_ORDER: DEFAULT_ORDER, ICON: ICON };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------- UI ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;
  core.registerStrings('en', { 'dock.home': 'Home', 'dock.more': 'More', 'dock.weather': 'Weather' });
  core.registerStrings('de', { 'dock.home': 'Start', 'dock.more': 'Mehr', 'dock.weather': 'Wetter' });

  g.OkieMotor.defaults = Object.assign(g.OkieMotor.defaults || {}, {});

  var CSS = [
    '.vision-pro-menu{pointer-events:none;z-index:1000;}.vision-pro-menu>*{pointer-events:auto;}',
    // FSC drives the rail with one spring (stiffness 380, damping 32): on hover the whole pill slides 144px right while each label grows
    // 128px + 16px, so the icons stay put and the labels slide out over the page. --okie-spring is that spring sampled as an easing curve.
    '.vision-pro-menu{--okie-spring:cubic-bezier(.2,.9,.25,1);--okie-spring-t:.42s;}',
    '@supports (transition-timing-function:linear(0,1)){.vision-pro-menu{--okie-spring:linear(0,.0364,.1239,.2371,.3586,.477,.5856,.6807,.761,.8269,.8793,.9199,.9504,.9726,.9882,.9987,1.0052,1.0089,1.0106,1.0109,1.0104,1.0094,1.0081,1.0068,1.0055,1.0043,1.0033,1.0025,1);}}',
    '.vision-pro-menu--desktop{position:absolute;right:100%;margin-right:12px;top:calc(60px + var(--fsc-panel-h,672px)/2);transform:translate(0,-50%);will-change:transform;opacity:1;transition:opacity .42s ease,transform var(--okie-spring-t) var(--okie-spring);}',
    '.stage .vision-pro-menu--desktop{z-index:3;}',      // beside the column it only has to beat the column; high values would float it over Home Assistant\'s header when the page scrolls
    '@media (hover:hover){.vision-pro-menu--desktop:hover{transform:translate(calc(var(--vpm-lw,128px) + 16px),-50%);}}',
    '.vision-pro-menu--desktop.is-open{transform:translate(calc(var(--vpm-lw,128px) + 16px),-50%);}',      // a finger: the rail opens on the touch (no hover on a touch screen)
    '.vision-pro-menu--desktop:has(:focus-visible){transform:translate(calc(var(--vpm-lw,128px) + 16px),-50%);}',     // keyboard users get the labels too; a mouse click does not pin it open
    '.stage[data-zen-revealed="false"] .vision-pro-menu--desktop,.stage[data-zen-revealed="false"] .vision-pro-menu--mobile{opacity:0;pointer-events:none;}',
    '.stage[data-zen-revealed="true"] .vision-pro-menu{transition:opacity .42s ease .74s,transform var(--okie-spring-t) var(--okie-spring);}',
    '.vpm-wrapper{display:flex;flex-direction:column;align-items:stretch;position:relative;}',
    '.vpm-menu{position:relative;display:flex;flex-direction:column;list-style:none;margin:0;padding:12px;border-radius:32px;color:rgb(179,179,179);z-index:999;background:transparent;border:0;box-shadow:0 8px 32px rgba(0,0,0,.1);}',
    '.vpm-menu::before{content:"";position:absolute;inset:0;border-radius:inherit;background:rgba(18,18,18,calc(.3 + var(--glass-tint-alpha,.4) * .85));-webkit-backdrop-filter:var(--glass-backdrop);backdrop-filter:var(--glass-backdrop);z-index:-1;pointer-events:none;}',
    '@media (hover:hover){.vision-pro-menu--desktop:hover .vpm-menu::before{-webkit-backdrop-filter:blur(calc(10px + var(--background-blur,0px))) saturate(240%);backdrop-filter:blur(calc(10px + var(--background-blur,0px))) saturate(240%);}}',
    '.vision-pro-menu--desktop.is-open .vpm-menu::before{-webkit-backdrop-filter:blur(calc(10px + var(--background-blur,0px))) saturate(240%);backdrop-filter:blur(calc(10px + var(--background-blur,0px))) saturate(240%);}',
    '.vpm-menu li{display:block;margin:0;padding:0;}.vpm-menu li+li{margin-top:.5rem;}',
    '.vpm-item{display:flex;align-items:center;gap:0;padding:7px;border-radius:28px;color:inherit;font-size:14px;font-weight:500;white-space:nowrap;min-height:35.5px;height:35.5px;width:100%;text-align:left;transition:background-color .2s,color .2s,transform .08s cubic-bezier(.16,1,.3,1);}',
    '.vpm-item:hover,.vpm-item:focus-visible{background-color:rgba(230,230,230,.2);color:#f2f2f2;}',
    // a finger: the row under it lights up across the whole row (the finger hides the icon), icon a little bigger, the name bright; the rail does not scroll the page
    '.vision-pro-menu--desktop .vpm-menu{touch-action:none;}',
    '.vpm-item.touch{background-color:rgba(255,255,255,.34);color:#fff;}.vpm-item.touch .vpm-icon svg{transform:scale(1.2);}.vpm-item.touch .vpm-label{font-weight:700;}',
    '.vpm-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:20px;height:20px;min-width:20px;}.vpm-icon svg{display:block;width:20px;height:20px;transition:transform .2s ease-out;}',
    '.vpm-label{display:inline-block;opacity:0;overflow:hidden;white-space:nowrap;width:0;margin-left:0;transition:opacity var(--okie-spring-t) var(--okie-spring),width var(--okie-spring-t) var(--okie-spring),margin-left var(--okie-spring-t) var(--okie-spring);}',
    '@media (hover:hover){.vision-pro-menu--desktop:hover .vpm-label{opacity:1;width:var(--vpm-lw,128px);margin-left:16px;transition:opacity var(--okie-spring-t) var(--okie-spring) .08s,width var(--okie-spring-t) var(--okie-spring),margin-left var(--okie-spring-t) var(--okie-spring);}}',
    '.vision-pro-menu--desktop.is-open .vpm-label{opacity:1;width:var(--vpm-lw,128px);margin-left:16px;transition:opacity var(--okie-spring-t) var(--okie-spring) .08s,width var(--okie-spring-t) var(--okie-spring),margin-left var(--okie-spring-t) var(--okie-spring);}',
    '.vision-pro-menu--desktop:has(:focus-visible) .vpm-label{opacity:1;width:var(--vpm-lw,128px);margin-left:16px;}',
    // phones: bottom bar
    '.vision-pro-menu--mobile{position:fixed;bottom:calc(.5rem + env(safe-area-inset-bottom,0px));left:0;right:0;margin:0 auto;width:max-content;max-width:calc(100vw - 2rem);}',
    '.vision-pro-menu--mobile .vpm-menu{flex-direction:row;padding:6px;}.vision-pro-menu--mobile .vpm-menu li+li{margin:0 0 0 .5rem;}',
    '.vision-pro-menu--mobile .vpm-label{display:none;}.vision-pro-menu--mobile .vpm-item{border-radius:50%;padding:.75rem;width:auto;height:auto;min-height:0;}',
    '.vpm-more-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.05);z-index:1000;cursor:default;animation:vpm-fade .15s ease both;}.vpm-more-backdrop.closing{animation:vpm-fade-out .15s ease both;}',
    '.vpm-more-popup{position:relative;right:0;margin:0 0 12px;min-width:240px;max-width:300px;padding:20px;border-radius:35px;display:flex;flex-direction:column;gap:4px;list-style:none;z-index:1001;-webkit-backdrop-filter:none!important;backdrop-filter:none!important;transform-origin:bottom right;outline:none;background:radial-gradient(circle at 50% 0,rgba(255,255,255,.06),rgba(255,255,255,.02) 70%),rgba(26,26,30,.93)!important;box-shadow:0 12px 36px rgba(0,0,0,.45);animation:vpm-pop var(--okie-spring-t) var(--okie-spring) both;}',
    '.vpm-more-popup.closing{animation:vpm-pop-out .16s ease both;pointer-events:none;}.vpm-more-popup::before{display:none!important;}.vpm-more-popup li{list-style:none;margin:0;padding:0;}',
    '@keyframes vpm-pop{from{opacity:0;transform:scale(.95) translateY(8px);}to{opacity:1;transform:none;}}@keyframes vpm-pop-out{from{opacity:1;transform:none;}to{opacity:0;transform:scale(.95) translateY(8px);}}@keyframes vpm-fade{from{opacity:0;}to{opacity:1;}}@keyframes vpm-fade-out{from{opacity:1;}to{opacity:0;}}',
    '.vpm-more-item{display:flex;align-items:center;gap:14px;width:100%;box-sizing:border-box;padding:12px 16px;border-radius:16px;color:rgb(217,217,217);font-size:14px;white-space:nowrap;text-align:left;cursor:pointer;transition:background-color .15s ease,color .15s ease;}',
    '.vpm-more-item:hover,.vpm-more-item:focus-visible{background-color:rgba(255,255,255,.18);color:#fff;}',
    '.vpm-more-icon{display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;width:20px;height:20px;color:currentColor;}.vpm-more-icon svg{display:block;width:20px;height:20px;}',
    '.vpm-more-label{flex:1;font-weight:500;letter-spacing:-.01em;overflow:hidden;text-overflow:ellipsis;}',
    '.vision-pro-menu--mobile .vpm-item--more.is-open{background-color:rgba(230,230,230,.25);color:#fff;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  /** create(ctx, { items: () => [{id, icon, label, act}], mobile: () => bool }) -> { el, render(), setActive(id) } */
  function create(ctx, o) {
    var root = h('div.vision-pro-menu'), active = 'home';
    var isOpen = false, idle = 0, mobileNow = false, press = null, touchedAt = 0, cur = [];
    function setOpen(v, foldMs) {
      isOpen = !!v && !mobileNow; clearTimeout(idle); root.classList.toggle('is-open', isOpen);
      if (isOpen) idle = setTimeout(function () { setOpen(false); }, foldMs || FOLD_TOUCH);       // opened by a finger: it folds away again by itself
    }
    var doc = typeof document !== 'undefined' ? document : null;
    function outside(e) { if (isOpen && !(e.composedPath ? e.composedPath().indexOf(root) >= 0 : root.contains(e.target))) setOpen(false); }
    if (doc) doc.addEventListener('pointerdown', outside, true);
    /** The names open as wide as the longest one needs (a fixed width cut "Energy Dashboard" and "Forecast Home" short). */
    function measureLabels() {
      var mx = 0, ls = root.querySelectorAll('.vpm-label');
      for (var k = 0; k < ls.length; k++) mx = Math.max(mx, ls[k].scrollWidth);
      if (mx) root.style.setProperty('--vpm-lw', Math.max(110, Math.min(260, Math.ceil(mx) + 6)) + 'px');
    }
    root.addEventListener('pointerenter', measureLabels);
    function indexAt(x, y) {
      var scope = root.getRootNode && root.getRootNode().elementFromPoint ? root.getRootNode() : doc, el = scope && scope.elementFromPoint ? scope.elementFromPoint(x, y) : null;
      var b = el && el.closest ? el.closest('.vpm-item') : null;
      return b && root.contains(b) ? +b.getAttribute('data-i') : -1;
    }
    function light(i) {
      var rows = root.querySelectorAll('.vpm-item');
      for (var k = 0; k < rows.length; k++) rows[k].classList.toggle('touch', +rows[k].getAttribute('data-i') === i);
    }
    // A quick tap on an icon goes straight into the app, as on a phone. Holding the finger on the rail for a moment (a third of a second) opens it, so names show and the row under the finger lights up;
    // slide along it, lift on a row to go there (lifting off the rail goes nowhere). Nothing opens by a finger that only passes by.
    var holdT = 0, held = false;
    root.addEventListener('pointerdown', function (e) {
      if (mobileNow || !pressStep({ type: e.pointerType }).open) return;
      var i0 = indexAt(e.clientX, e.clientY);
      press = { id: e.pointerId, i: i0, x: e.clientX, y: e.clientY }; held = false; clearTimeout(holdT);
      holdT = setTimeout(function () {
        if (!press) return; held = true; measureLabels(); setOpen(true, FOLD_TOUCH); light(press.i); if (ctx.haptic) ctx.haptic('tap');
      }, 320);
    }, true);
    root.addEventListener('pointermove', function (e) {
      if (!press || e.pointerId !== press.id) return;
      if (!held) { if (Math.abs(e.clientX - press.x) + Math.abs(e.clientY - press.y) > 14) { clearTimeout(holdT); press = null; } return; }      // moved before the hold: not for the rail
      var i = indexAt(e.clientX, e.clientY);
      if (i !== press.i) { press.i = i; light(i); if (i >= 0 && ctx.haptic) ctx.haptic('detent'); }
      clearTimeout(idle); idle = setTimeout(function () { setOpen(false); }, FOLD_TOUCH);
    }, true);
    root.addEventListener('pointerup', function (e) {
      clearTimeout(holdT);
      if (!press || e.pointerId !== press.id) return;
      var wasHeld = held, p = press; press = null; held = false;
      if (!wasHeld) return;                                                        // a quick tap: the click that follows goes into the app
      var i = indexAt(e.clientX, e.clientY); if (i < 0) i = -1; light(-1);
      var st = releaseStep({ index: i }); touchedAt = Date.now(); setOpen(true, st.fold);
      if (st.go && cur[i]) cur[i].act();
    }, true);
    root.addEventListener('pointercancel', function (e) { clearTimeout(holdT); if (press && e.pointerId === press.id) { var h = held; press = null; held = false; light(-1); if (h) setOpen(true, FOLD_MISS); } }, true);
    function clicked(e, it) { if (e && e.detail !== 0 && Date.now() - touchedAt < 700) return; it.act(); }      // a finger already went on its lift; a mouse click and the keyboard come here
    var sig = '';
    function paintActive() {      // only the active row changed: no new rows
      var rows = root.querySelectorAll('.vpm-item[data-i]');
      for (var k = 0; k < rows.length; k++) { var it = cur[+rows[k].getAttribute('data-i')], on = !!it && it.id === active; rows[k].classList.toggle('on', on); if (on) rows[k].setAttribute('aria-current', 'page'); else rows[k].removeAttribute('aria-current'); }
    }
    function render() {
      var items = o.items(), mobile = o.mobile(); mobileNow = mobile; cur = items;
      var s0 = (mobile ? 'm' : 'd') + '|' + items.map(function (it) { return it.id + ':' + it.icon + ':' + it.label; }).join('|');
      if (s0 === sig && root.firstChild) { paintActive(); return; }      // the same rows as before: they stay (a new set of rows on every screen change was most of the cost of going home)
      sig = s0;
      root.innerHTML = ''; root.className = 'vision-pro-menu ' + (mobile ? 'vision-pro-menu--mobile' : 'vision-pro-menu--desktop') + (isOpen && !mobile ? ' is-open' : '');
      var wrap = h('div.vpm-wrapper'), ul = h('ul.vpm-menu.' + (mobile ? 'glass-panel' : 'dockbg'), { role: 'menu' });
      var shown = items, more = [];
      if (mobile && items.length > 5) { shown = items.slice(0, 4); more = items.slice(4); }       // FSC: more than 5 -> the first 4 and a "more" popup
      shown.forEach(function (it, n) {
        ul.appendChild(h('li', { role: 'none' }, h('button.vpm-item' + (it.id === active ? '.on' : ''), { role: 'menuitem', 'data-i': String(n), 'aria-label': it.label, 'aria-current': it.id === active ? 'page' : null, onclick: function (e) { clicked(e, it); } },
          h('span.vpm-icon', { html: UI.icon(it.icon, 20) }), h('span.vpm-label', null, it.label))));
      });
      if (more.length) {
        var open = false, back = null, pop = null, moreBtn = null;
        var closePop = function () {
          if (!open) return; open = false;
          if (moreBtn) moreBtn.classList.remove('is-open');
          var b = back, p = pop; back = pop = null;
          if (p) { p.classList.add('closing'); }
          if (b) b.classList.add('closing');
          setTimeout(function () { if (p) p.remove(); if (b) b.remove(); }, 160);
        };
        moreBtn = h('button.vpm-item.vpm-item--more', { role: 'menuitem', 'aria-label': core.t('dock.more', ctx.lang()), 'aria-haspopup': 'true', onclick: function () {
          if (open) { closePop(); return; }
          open = true; moreBtn.classList.add('is-open');
          back = h('div.vpm-more-backdrop', { onclick: closePop });
          pop = h('ul.vpm-more-popup.glass-panel', { role: 'dialog', 'aria-label': core.t('dock.more', ctx.lang()), tabindex: '-1', onkeydown: function (e) { if (e.key === 'Escape') { closePop(); moreBtn.focus(); } } }, more.map(function (it) {
            return h('li', { role: 'none' }, h('button.vpm-more-item', { role: 'menuitem', title: it.label, 'aria-label': it.label, onclick: function () { closePop(); it.act(); } },
              h('span.vpm-more-icon', { html: UI.icon(it.icon, 20) }), h('span.vpm-more-label', null, it.label)));
          }));
          wrap.insertBefore(back, ul); wrap.insertBefore(pop, ul);      // like FSC: backdrop and popup live inside the dock (backdrop under the popup, so its rows can be tapped), popup above the pill in the flow
          try { pop.focus({ preventScroll: true }); } catch (e) { /* not focusable yet */ }
        } }, h('span.vpm-icon', { html: UI.icon('more', 20) }), h('span.vpm-label', null, core.t('dock.more', ctx.lang())));
        ul.appendChild(h('li', { role: 'none' }, moreBtn));
      }
      wrap.appendChild(ul); root.appendChild(wrap);
      if (!mobile) { measureLabels(); setTimeout(measureLabels, 400); }
    }
    return { el: root, render: render, dispose: function () { clearTimeout(idle); if (doc) doc.removeEventListener('pointerdown', outside, true); }, setActive: function (id) { if (id !== active) { active = id; render(); } }, get active() { return active; } };
  }
  api.create = create;
  g.OkieMotor.dock = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

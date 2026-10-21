/* okie-card: <okie-motor-card>, the Lovelace card that hosts everything.
 *
 *   type: custom:okie-motor-card
 *   squircle: soft            # none | soft | standard | strong
 *   start: bento              # bento | browse (open with the search panel)
 *   weather_entity: weather.home
 *   power_entity: sensor.house_power
 *   wallpaper: /local/hemma/room.jpg
 *   top_offset: 56            # px kept free above the card, for kiosk dashboards that hide the header
 *   scale: 100                # content size in percent (40-130); also a slider in Settings > Appearance
 *   cameras: { image: /local/house.jpg, lastEntity: image.patio_last_motion, clipsUrl: https://... }   # all optional
 *   language: auto            # auto | en | de
 *
 * The frame follows Fast Search Card: a 1200px design column scaled with CSS zoom,
 * rows status island -> search row -> bento, the dock to the left of the column,
 * a lock page (clock + greeting) in front that a swipe, scroll, key or tap on the
 * grip lifts, and a detail panel that takes the place of the search row + bento.
 * Features plug in through window.OkieMotor.{bento,detail,notify,rest,apps}; every
 * one of them is optional, so the card degrades to "search + minimal detail" alone.
 */
(function (g) {
  'use strict';

  var isNode = typeof module !== 'undefined' && module.exports;
  var core = isNode ? require('./okie-core.js') : g.OkieMotor.core;
  var L = isNode ? require('./okie-logic.js') : g.OkieMotor.logic;
  var FB = isNode ? require('./okie-feedback.js') : g.OkieMotor.feedback;

  var DEFAULTS = {
    language: 'auto', timeFormat: 'auto',
    start: 'bento',
    topCategory: 'devices', chip: 'all', layout: 'grid',
    squircle: 'none',
    quickEnabled: true, quickControl: L.DEFAULT_QUICK,
    favorites: [], rooms: [], roomOrder: {}, roomsOrder: [], roomEdits: {}, cardStyle: {}, roomsExtra: [], roomsHidden: [], roomNames: {}, learning: 'normal',
    visibility: { hidden: false, disabled: false, diagnostic: false },
    excluded: ['switch.schedule_*'],     // the Scheduler component's helper switches belong to the Schedules app, not the device list
    limits: { max: 0, areaOnly: true, hideUnavailable: true },
    weather_entity: '', power_entity: '', weatherPlaces: [], weatherCities: [], calendarColors: {}, calendarHidden: null,      // weatherPlaces: other weather entities you added on the weather screen (the + button)
    wallpaper: '', wallpaperView: false, bgMode: 'auto',
    sync: { enabled: true },      // the same settings on every screen (okie-sync.js)
    glass: { brightness: 100, blur: 20, contrast: 100, saturation: 100, grayscale: 0, tint: 76, cardBlur: 60, cardTint: 21, cardStyle: 'dark', cardEdge: 14 },      // cardBlur: frosted blur behind the device cards (px, 0 = clear); cardTint: how much light or dark tint they carry (%); cardStyle: light (white) or dark glass; cardEdge: the thin light rim that keeps clear glass readable (%)
    thermo: { glowBlur: 80, glowSpread: 15, glowOpacity: 65, ticks: 100, c0: '#1446be', c1: '#2d82ff', c2: '#ff962d', c3: '#ff2d55', cool: 69, warm: 75 },      // the Thermo Dial's look (okie-thermo.js DEFAULT_LOOK)
    toasts: { enabled: true, closable: false },
    sidebar: { show: true, always: true, items: null },
    videos: { enabled: true, mobile: true, path: '/local/fast-search-videos' },
    zen: { enabled: true, text: 'auto', name: '', quoteEntity: 'sensor.quote_of_the_day', keepOpen: true },
    search: { filterBy: 'categories', columns: 5, recent: 'standard', typewriter: true, context: true, chips: true, filterButton: true, count: true, timeSort: true, ai: true },
    island: { show: true, fold: true, toCapsuleSec: 30, toButtonSec: 60, liveShow: true, live: { timers: true, vacuums: true, covers: true, media: true, scripts: true, climate: false, lights: false, switches: false } },
    bento: { enabled: true, deckPages: null, swap: false, w1: true, w2: true, w3: 'todos', w4: 'news', w1mode: 'favorites', w1layout: 'list', pages: ['weather', 'todos', 'news', 'calendar', 'tips'], slideSec: 8, news_entity: '', w1height: 0, camerasCard: true, feederCard: true, feederDesign: 'compact', feeder: 'auto', leftWidgets: [], rightCards: [], rightOrder: null, wrheight: 0, oneWidget: true, pagesVer: 0 },
    suggest: { enabled: true, max: 10 },
    mobile: { autoOpen: false }, haptic: true, sound: false,
    height: 'auto', top_offset: 0,
    lightModesLook: { active: true, chevron: true, hint: true },      // what the light modes card shows: the Active mark, the colored arrow, the "Tap to run" line
    lightModesLayout: 'horizontal',   // the light modes card: 'horizontal' = the modes side by side in one row as tall as the thermostat card, 'compact' = a thin strip of pictures only, 'vertical' = stacked, separated by lines
    lightModes: null,            // null = the three Govee shortcuts the card ships with (Cozy lights, Let's go to sleep, Turn up the lights); a list = your own modes (Settings > General > Light modes)
    vacuum: { jobs: [] },        // your own vacuum jobs: [{ id, name, kind: both|vacuum|mop|room|other, command, params }], sent through vacuum.send_command
    thermoSched: { profiles: {} },      // the degrees Comfort, Sleep, Eco and Away start with in a thermostat's schedule: { eco: { low, high } }
    cameras: { image: '', snapshot: false, lastEntity: '', clipsUrl: '', recordings: true, liveSeconds: 120 },     // image: your own picture for the Cameras card (else the last motion picture, else a built-in one); lastEntity: the image entity of the last motion; clipsUrl: a recordings page for the history
    centerView: true,            // on a wide screen the column and the lock page sit in the middle of the window, not at the top
    textScale: 100,              // text size in percent (70-140): only the text, the cards and the menu keep their size
    scale: 80,                   // content size in percent: the column (menu, search bar, cards) shrinks or grows, the background stays
    splash: 'none',
  };

  if (isNode || typeof HTMLElement === 'undefined') {
    if (isNode) module.exports = { DEFAULTS: DEFAULTS };
    return;
  }

  var UI = g.OkieMotor.ui, S = g.OkieMotor.search, OV = g.OkieMotor.overlay, SQ = g.OkieMotor.squircle;
  var h = UI.h;

  core.registerStrings('en', {
    'card.home': 'Home', 'card.devices': 'Devices', 'card.back': 'Back', 'card.more': 'More', 'card.settings': 'Settings',
    'card.undo': 'Undo', 'card.close': 'Close', 'card.loading': 'Loading…', 'card.nodetail': 'Details are not available yet.',
    'card.user': 'Notifications', 'card.on': 'On', 'card.off': 'Off', 'card.retry': 'Retry', 'card.broken': 'This view hit a problem.',
  });
  core.registerStrings('de', {
    'card.home': 'Start', 'card.devices': 'Geräte', 'card.back': 'Zurück', 'card.more': 'Mehr', 'card.settings': 'Einstellungen',
    'card.undo': 'Rückgängig', 'card.close': 'Schließen', 'card.loading': 'Lädt…', 'card.nodetail': 'Details sind noch nicht verfügbar.',
    'card.user': 'Mitteilungen', 'card.on': 'An', 'card.off': 'Aus', 'card.retry': 'Erneut versuchen', 'card.broken': 'In dieser Ansicht ist ein Problem aufgetreten.',
  });

  var feelOf = function (css) { var P = !isNode && g.OkieMotor.polish; return P && P.feel ? P.feel(css) : css; };      // hover only where a pointer hovers, strong ease-out (okie-polish)
  var SPRING = 'cubic-bezier(.34,1.18,.24,1)', PANEL_EASE = 'cubic-bezier(.32,.72,0,1)';

  var CARD_CSS = [
    ':host{display:block;position:relative;}',
    '.stage[data-settled="true"]{transition:padding-top .52s ' + PANEL_EASE + ';}',
    '.stage{position:relative;width:100%;min-height:max(200px,calc(100vh - var(--okie-top,0px)));min-height:max(200px,calc(100svh - var(--okie-top,0px)));box-sizing:border-box;overflow:hidden;border-radius:var(--okie-stage-radius,0);padding:0 0 16px;}',
    '.bg{position:absolute;inset:0;background-size:cover;background-position:center;opacity:0;transition:opacity .6s ease;pointer-events:none;filter:brightness(var(--okie-bg-brightness,100%));}',
    '.bg.on{opacity:1;}',
    // a phone scrolls a long page: a picture that covers the whole page is zoomed far in, so there it covers the screen and stays put while the page scrolls
    // a card that fills the whole window (a tablet in full screen, or a kiosk) puts the picture under the status bar too: else the system shows the page's own light background there as a bright strip
    '.stage[data-mobile="true"] .bg,.stage[data-bleed="true"] .bg{position:fixed;inset:auto;top:0;left:0;width:100vw;height:100vh;height:100lvh;}',
    '.bg::after{content:"";position:absolute;inset:0;background:var(--okie-bg-overlay,rgba(18,15,12,.28));}',
    // the 1200px design column
    '.main-container{position:relative;width:1200px;max-width:100%;margin:0 auto;}',
    '.statsbar{margin-bottom:12px;}',
    '.panel-region{position:relative;height:calc(var(--fsc-grid-h,464px) + 118px);}',
    '.stage[data-w1grow="true"] .panel-region{height:calc(var(--fsc-grid-h,464px) + 118px + var(--okie-w1-extra,0px));}',
    '.panel-region .search-row{position:absolute;left:0;right:0;top:0;}',
    '.content-area{position:absolute;left:0;right:0;top:118px;height:var(--fsc-grid-h,464px);}',
    '.v-start{height:100%;}',
    '.search-row,.content-area{transition:transform .52s ' + PANEL_EASE + ',opacity .42s ease;transform-origin:50% 0;}',
    '.stage[data-dock="off"] .vision-pro-menu{display:none;}',
    '.stage[data-dock="panel"][data-search="closed"][data-detail="closed"] .vision-pro-menu{opacity:0;pointer-events:none;}',
    '.stage[data-bento="off"] .content-area{display:none;}',
    // lock page: only the island capsule and the curtain show
    '.stage[data-zen-revealed="false"] .search-row,.stage[data-zen-revealed="false"] .content-area{opacity:0;pointer-events:none;}',
    '.stage[data-zen-revealed="true"] .search-row{transition:transform .52s ' + PANEL_EASE + ',opacity .42s ease .62s;}',
    '.stage[data-zen-revealed="true"] .content-area{transition:transform .52s ' + PANEL_EASE + ',opacity .42s ease .72s;}',
    // detail open: search row and bento step back, the detail panel steps forward
    '.stage[data-search="open"] .content-area{opacity:0;transform:scale(.97);filter:blur(8px);pointer-events:none;transition-delay:0s;}',
    '.content-area{transition:transform .52s ' + PANEL_EASE + ',opacity .42s ease,filter .42s ease;}',
    '.stage[data-detail="open"] .search-row,.stage[data-detail="open"] .content-area{transform:scale(.86);opacity:0;pointer-events:none;transition-delay:0s;}',
    '.detail-wrap{position:absolute;left:0;right:0;top:0;height:var(--fsc-detail-h,var(--fsc-panel-h,560px));z-index:1;border-radius:35px;overflow:hidden;opacity:0;pointer-events:none;transform:scale(1.04);transition:transform .52s ' + PANEL_EASE + ',opacity .36s ease;}',
    '.stage[data-detail="open"] .detail-wrap{opacity:1;pointer-events:auto;transform:none;}',
    '.v-over{position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;border-radius:inherit;overflow:hidden;}',
    // fallback detail
    '.fd{display:flex;flex-direction:column;gap:16px;padding:22px;height:100%;}',
    '.fd-top{display:flex;align-items:center;gap:12px;}',
    '.fd-back{width:44px;height:44px;border-radius:50%;background:rgba(0,0,0,.5);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);display:grid;place-items:center;}',
    '.fd-title{font-size:20px;font-weight:600;}.fd-sub{font-size:13px;color:var(--okie-text-dim);}',
    '.fd-state{font-size:56px;font-weight:300;letter-spacing:-.02em;margin-top:12px;}',
    '.fd-btn{align-self:flex-start;padding:12px 22px;border-radius:9999px;background:#fff;color:#1d1b19;font-weight:600;}',
    // phones: no zoom, the column fills the width, the bento stacks and scrolls, the dock is a bottom bar.
    // --okie-gap-top keeps everything clear of the status bar (safe area or top_offset, whichever is bigger, capped at 48px)
    '.stage[data-dockbottom="true"]{padding-bottom:calc(96px + env(safe-area-inset-bottom,0px));}',
    '.stage[data-mobile="true"]{padding-left:0;padding-right:0;}',
    '.stage[data-mobile="true"] .main-container{width:100%;}',
    '.stage[data-mobile="true"] .panel-region{height:auto;min-height:var(--fsc-panel-h,560px);}',
    '.stage[data-mobile="true"] .panel-region .search-row{position:relative;}',
    '.stage[data-mobile="true"] .content-area{position:relative;top:auto;height:auto;margin-top:16px;}',
    '.stage[data-mobile="true"] .detail-wrap{position:fixed;left:8px;right:8px;top:calc((var(--okie-fixed-top,0px) + 8px) / var(--okie-zoom,1));bottom:calc(env(safe-area-inset-bottom,0px) + 92px);height:auto;z-index:900;}',
    '.stage[data-mobile="true"] .search-panel[data-open="true"]{position:fixed;left:8px;right:8px;top:calc((var(--okie-fixed-top,0px) + 8px) / var(--okie-zoom,1));bottom:calc(env(safe-area-inset-bottom,0px) + 92px);height:auto;z-index:900;}',
    '.stage[data-mobile="true"][data-detail="open"] .statsbar,.stage[data-mobile="true"][data-search="open"] .statsbar{opacity:0;pointer-events:none;}.statsbar{transition:opacity .3s;}',
    '.stage[data-mobile="true"] .zen-curtain{padding-top:calc(var(--zen-top,12px) + var(--okie-gap-top,0px));}',      // anchored in the card like FSC's curtain, so it starts below the header
  ].join('\n');

  // =========================================================================
  class OkieMotorCard extends HTMLElement {
    constructor() {
      super();
      this._root = this.attachShadow({ mode: 'open' });
      this._hass = null; this._config = null; this._ready = false; this._queued = false;
      this._nav = { mode: 'start', itemId: null, appId: null }; this._stack = [];
      this._prevStates = null; this._regSig = '';
      this._disposers = [];
      this._zoom = 1; this._locked = false;
    }

    static getStubConfig() { return { squircle: 'soft', start: 'bento' }; }
    getCardSize() { return 8; }
    getGridOptions() { return { columns: 'full', rows: 'auto', min_columns: 6, min_rows: 5 }; }

    setConfig(config) {
      this._config = Object.assign({}, config || {});
      if (this._settings) { this._settings.setBase(this._config); this._applyLook(); }
      this._maybeInit();
    }

    set hass(hs) {
      this._hass = hs;
      if (!this._ready) { this._maybeInit(); return; }
      if (this._queued) return;
      this._queued = true;
      requestAnimationFrame(() => { this._queued = false; this._sync(); });
    }
    get hass() { return this._hass; }

    connectedCallback() {
      // Home Assistant detaches and re-attaches cards as you switch views: rebuild at once instead of waiting for the next state push
      if (!this._ready) this._maybeInit();
      else { this._restore(); }
    }
    disconnectedCallback() {
      [this._startView, this._detailView, this._appView].forEach(function (v) { try { if (v && v.dispose) v.dispose(); } catch (e) { /* closing anyway */ } });
      this._startView = this._detailView = this._appView = null;
      this._disposers.forEach(function (d) { try { d(); } catch (e) {} });
      this._disposers = []; if (this._offFeedback) { this._offFeedback(); this._offFeedback = null; }
      this._ready = false; this._root.innerHTML = ''; this._restoreRoot();
      [this._search, this._island, this._zenView, this._dock].forEach(function (m) { try { if (m && m.dispose) m.dispose(); } catch (e) {} });
      this._search = this._island = this._zenView = this._dock = null;
      if (this._modules) this._modules.forEach(function (m) { if (m && m.dispose) m.dispose(); });
      this._modules = [];
    }

    // ---------------------------------------------------------- setup ----
    _maybeInit() {
      if (this._ready || !this._config || !this._hass) return;
      this._ready = true;
      var defaults = Object.assign({}, DEFAULTS, g.OkieMotor.defaults || {});
      this._store = core.createStore({ prefix: 'okie:' });
      this._settings = core.createSettings({ store: this._store, defaults: defaults, config: this._config });
      if (g.OkieMotor.controls && g.OkieMotor.controls.setLookSource) g.OkieMotor.controls.setLookSource(() => this._settings.get().thermo);      // the dial look is one rule for every dial and slider
      this._engine = S.createEngine({ store: this._store, lang: this._lang(), speed: this._settings.get().learning });
      this._importFsc();
      this._bus = core.createBus();
      this._modules = [];
      this._buildDom();
      this._buildCtx();
      this._applyLook();
      this._rebuildCollection(true);
      this._mountParts();
      this._mountModules();
      this._renderDock();
      var remeasure = UI.rafBatch(() => { this._measure(); this._renderDock(); });
      g.addEventListener('resize', remeasure);
      this._disposers.push(function () { g.removeEventListener('resize', remeasure); });
      // The old setup's page script (okie-ai-bridge.js, the kiosk lock on /okie-tablet) cancels every touchmove it finds no scroller for. It looks from the event target, which the shadow root
      // retargets to this card, so it never sees the lists inside and nothing scrolled on a touch tablet. A touch that starts in something that scrolls stays inside the card.
      var keepScroll = (e) => {
        var p = e.composedPath ? e.composedPath() : [];
        for (var i = 0; i < p.length; i++) {
          var n = p[i]; if (n === this) break; if (!n || n.nodeType !== 1) continue;
          var cs = g.getComputedStyle(n);
          if (L.canScroll({ overflowX: cs.overflowX, overflowY: cs.overflowY, scrollWidth: n.scrollWidth, clientWidth: n.clientWidth, scrollHeight: n.scrollHeight, clientHeight: n.clientHeight })) { e.stopPropagation(); return; }
        }
      };
      this._root.addEventListener('touchmove', keepScroll, { passive: true });
      this._disposers.push(() => this._root.removeEventListener('touchmove', keepScroll));
      var lastNote = 0, touched = () => { var n = Date.now(); if (this._locked || n - lastNote < 5000) return; lastNote = n; this._noteOpen(true); };      // keeps "used in the last 15 minutes" fresh while you use it
      var touchEvs = ['pointerdown', 'touchstart', 'keydown', 'wheel'];
      touchEvs.forEach(function (e) { g.addEventListener(e, touched, { passive: true, capture: true }); });
      this._disposers.push(function () { touchEvs.forEach(function (e) { g.removeEventListener(e, touched, true); }); });
      if (typeof ResizeObserver === 'function') { var ro = new ResizeObserver(remeasure); ro.observe(this); this._disposers.push(function () { ro.disconnect(); }); }
      var onKey = (e) => { if (e.key === 'Escape' && !this._locked && (this._nav.mode === 'detail' || this._nav.mode === 'app') && !this._search.isOpen()) { var a = this._root.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; this._back(); } };
      this.addEventListener('keydown', onKey);
      this._disposers.push(() => this.removeEventListener('keydown', onKey));
      requestAnimationFrame(() => this._measure());
      var s = this._settings.get();
      var wantLock = !!(s.zen && s.zen.enabled && s.start !== 'browse') && !(s.zen.keepOpen !== false && this._recentlyOpen());
      this._show('start', {}, true);
      this._setLocked(wantLock, true);
      this._restoreNav();
      this._disposers.push(this._bus.on('nav', (n) => this._noteNav(n)));
      var autoOpen = (s.start === 'browse') || (this._mobile && s.mobile && s.mobile.autoOpen) || s.bento.enabled === false;
      if (autoOpen && !wantLock) setTimeout(() => { if (this._search) this._search.open({ focus: false }); }, 60);
      if (g.OkieMotor.splash) g.OkieMotor.splash.run(this._ctx);
      this._openFromUrl();
      this._disposers.push(this._settings.on('change', (p) => this._onSettings(p)));
      this._disposers.push(this._bus.on('island-refresh', () => { if (this._island) this._island.update(); }));
      this._disposers.push(this._bus.on('notes', () => this._updateIsland(true)));
      this._disposers.push(this._bus.on('rest', (e) => this._onRest(e)));
      this._disposers.push(g.OkieMotor.apps.on('change', () => { this._renderDock(); }));
    }

    /** A link like .../okie-tablet/home?okie_open=climate.living_room (the iPhone widget uses it) opens that device's screen right away, once per page load. */
    _openFromUrl() {
      var id = null;
      try { id = new URLSearchParams(g.location.search).get('okie_open'); } catch (e) { /* no address to read */ }
      if (!id || this._deepDone || !this._hass || !this._hass.states[id]) return;
      this._deepDone = true;
      setTimeout(() => {
        try { if (this._locked) this._setLocked(false, true); this._openDetail(id); } catch (e) { /* the device is gone */ }
        try { var u = new URL(g.location.href); u.searchParams.delete('okie_open'); g.history.replaceState(g.history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* the link stays, harmless */ }      // a reload does not open it again
      }, 900);
    }

    _lang() {
      var s = this._settings && this._settings.get().language;
      if (s && s !== 'auto') return core.pickLang(s);
      var hs = this._hass || {};
      return core.pickLang((hs.locale && hs.locale.language) || hs.language || (g.navigator && navigator.language));
    }
    _t(k, v) { return core.t(k, this._lang(), v); }

    /** (Safari without var() in backdrop-filter) writes the glass values into plain CSS; runs after every change of the look */
    _syncBf() {
      if (!this._bfRules || !this._bfStyle || !this._stage) return;
      var st = this._stage, cache = {}, PL = g.OkieMotor.polish;
      try {
        var css = PL.bfCss(this._bfRules, function (v) {
          if (cache[v] !== undefined) return cache[v];
          st.style.setProperty('--okie-bfprobe', v);
          var out = getComputedStyle(st).getPropertyValue('--okie-bfprobe').trim(); cache[v] = out; return out;
        });
        st.style.removeProperty('--okie-bfprobe');
        if (css !== this._bfLast) { this._bfLast = css; this._bfStyle.textContent = css; }
      } catch (e) { /* the plain rules stay */ }
    }

    _buildDom() {
      var r = this._root;
      r.innerHTML = '';
      var cssAll = L.scaleFonts(feelOf(UI.BASE_CSS + '\n' + CARD_CSS + '\n' + OV.CSS + '\n' + (g.OkieMotor.extraCss || []).join('\n')));
      r.appendChild(h('style', null, cssAll));
      var PL = !isNode && g.OkieMotor.polish;
      this._bfRules = PL && PL.needsBfShim && PL.needsBfShim() ? PL.bfRules(cssAll) : null;      // Safari 26 drops -webkit-backdrop-filter when it comes from var(): the same rules again with the value worked out
      this._bfStyle = this._bfRules ? h('style') : null; if (this._bfStyle) r.appendChild(this._bfStyle);
      this._syncBf();      // every pixel font size follows the Text size setting
      if (this._offFeedback) this._offFeedback();
      var self0 = this; this._offFeedback = FB.wire(r, function () { return self0._settings ? self0._settings.get() : {}; });
      this._bg = h('div.bg');
      this._vStart = h('div.v.v-start', { hidden: true });
      this._vOver = h('div.v-over');
      this._detailWrap = h('div.detail-wrap.glass-panel', null, this._vOver);
      this._contentArea = h('div.content-area', null, this._vStart);
      this._panelRegion = h('div.panel-region');
      this._statsHost = h('div.statsbar');
      this._main = h('div.main-container', null, this._statsHost, this._panelRegion);
      this._stage = h('div.stage', { dataset: { zenRevealed: 'true', detail: 'closed', mobile: 'false', hoehe: 'voll' } }, this._bg, this._main);
      r.appendChild(this._stage);
      this._overlay = OV.createOverlay(this._stage, {
        enabled: () => this._settings.get().toasts.enabled,
        closable: () => this._settings.get().toasts.closable,
        undoLabel: this._t('card.undo'),
        frame: () => this._main,                  // the popups live in the zoomed column, like FSC's
      });
    }

    /** Once per browser: take Fast Search Card's favorites and learned use from its own IndexedDB, so Okie starts with the same favorites and suggestions. */
    _importFsc() {
      var self = this;
      try {
        if (this._store.get('fscImported', false)) return;
        try {      // the tab and view the big carousel was left on ("sug grid", "fav list")
          var last = String(g.localStorage.getItem('bentoZenW1Tab') || '').split(/\s+/);
          if (last[0]) this._settings.set({ bento: { w1mode: last[0] === 'sug' ? 'suggestions' : 'favorites', w1layout: last[1] === 'list' ? 'list' : 'grid' } });
        } catch (e) { /* storage blocked */ }
        var idb = g.indexedDB; if (!idb || typeof idb.databases !== 'function') return;      // never open a database that does not exist (that would create an empty one and break FSC)
        idb.databases().then(function (dbs) {
          if (!dbs || !dbs.some(function (d) { return d.name === 'FastSearchDB'; })) return;
          var rq = idb.open('FastSearchDB');
          rq.onsuccess = function () {
            var db = rq.result;
            if (!db.objectStoreNames.contains('favorites') || !db.objectStoreNames.contains('userPatterns')) { db.close(); return; }
            var tx = db.transaction(['favorites', 'userPatterns'], 'readonly'), fav = tx.objectStore('favorites').getAll(), pat = tx.objectStore('userPatterns').getAll();
            tx.oncomplete = function () {
              db.close();
              try {
                var ids = (fav.result || []).slice().sort(function (a, b) { return String(a.added_date).localeCompare(String(b.added_date)); }).map(function (x) { return x.entity_id; }).filter(Boolean);
                if (ids.length && !(self._settings.get().favorites || []).length) self._settings.set({ favorites: ids.slice(0, 24) });
                var rows = (pat.result || []).map(function (p) { return { id: p.entity_id, ts: Date.parse(p.timestamp), type: p.action_type === 'suggestion_ignored' ? 'ignore' : 'use', hour: p.context && p.context.hour }; });
                if (rows.length) self._engine.importPatterns(rows);
                self._store.set('fscImported', true);
                if (self._bus) self._bus.emit('island-refresh');
              } catch (e) { /* partial import is fine */ }
            };
          };
        }, function () {});
      } catch (e) { /* nothing to import */ }
    }
    _buildCtx() {
      var self = this;
      this._ctx = {
        host: this, root: this._root, stage: this._stage,
        hass: function () { return self._hass; },
        lang: function () { return self._lang(); },
        t: function (k, v) { return self._t(k, v); },
        settings: this._settings, store: this._store, engine: this._engine, bus: this._bus,
        call: function (domain, service, data) {
          try { return Promise.resolve(self._hass.callService(domain, service, data)); } catch (e) { return Promise.reject(e); }
        },
        callWS: function (msg) { return self._hass.callWS(msg); },
        toast: function (type, msg, o) {
          var n = self._settings.get().notifications || {};
          if (L.inQuietHours(Date.now(), n.quietFrom, n.quietTo) && (type === 'info' || type === 'success')) return null;   // quiet hours: only warnings and errors speak
          if (type === 'error') self._ctx.haptic(30);
          return self._overlay.toast(type, msg, o);
        },
        sheet: function (o) { return self._overlay.sheet(o); },
        morph: function (o) { return self._overlay.morph(o); },
        defer: function (label, fn, onUndo) { return self._overlay.defer(label, fn, onUndo); },
        openDetail: function (id, origin) { self._openDetail(id, origin); },
        weatherId: function () { var w = self._weatherEntity(); return w ? w.entity_id : null; },
        openApp: function (id, o) { self._openApp(id, false, !!(o && o.push)); },
        openStart: function () { self._show('start'); },
        voice: function () { self._setLocked(false); self._show('start'); if (self._search) self._search.voice(); },      // the microphone on the lock page: the start screen opens and the assistant listens
        voiceHere: function (cb) { return !!(self._search && self._search.listenHere && self._search.listenHere(cb)); },      // the microphone on the lock page listens in place
        voiceOk: function () { return !!(self._search && self._search.canVoice && self._search.canVoice()); },
        openBrowse: function (q) { self._setLocked(false); self._show('start'); if (self._search) { self._search.open({ focus: false }); if (q != null) self._search.setQuery(q); } },
        back: function () { self._back(); },
        apps: function () { return g.OkieMotor.apps.list(); },
        usageScore: function (id) { return self._engine.usageOf(id); },
        favorites: {
          has: function (id) { return self._settings.get().favorites.indexOf(id) >= 0; },
          toggle: function (id) {
            var f = self._settings.get().favorites.slice(); var i = f.indexOf(id);
            if (i >= 0) f.splice(i, 1); else f.push(id);
            self._settings.set({ favorites: f }); return i < 0;
          },
        },
        compactAvailable: function () { return !!(g.OkieMotor.detail && g.OkieMotor.detail.renderCompact); },
        renderCompact: function (el, id) { return g.OkieMotor.detail.renderCompact(el, self._ctx, id); },
        prefetch: function (id) { if (g.OkieMotor.detail && g.OkieMotor.detail.prefetch) g.OkieMotor.detail.prefetch(self._ctx, id); },
        item: function (id) { return self._engine.getItem(id); },
        state: function (id) { return self._hass && self._hass.states[id]; },
        /** Localised state text: Home Assistant's own formatter when it has one ("Partly cloudy"), else a readable fallback. */
        formatState: function (st) {
          try { if (self._hass.formatEntityState) return self._hass.formatEntityState(st); } catch (e) { /* fall through */ }
          return String(st.state).replace(/[-_]/g, ' ');
        },
        navState: function () { return self._nav; },
        zoom: function () { return self._zoom; },
        haptic: function (k) { FB.fire(self._settings.get(), k); },      // a kind ('tap', 'switch', 'detent', 'limit', 'error') or the older number of milliseconds; Android vibrates, an iPhone gets a light tick, and Tick sound adds a soft click
        suggestions: function (n) { var sg = self._settings.get().suggest; return sg && sg.enabled === false ? [] : self._engine.suggest(Math.min(n || 10, sg && sg.max ? sg.max : 10)); },
        panelHeight: function () { return self._lay ? self._lay.panelH : 560; },
        statusValues: function () { return self._statusValues(); },
        contextLine: function () { return self._contextLine(); },
        liveActivities: function () { return self._liveActivities(); },
        lock: function () { self._setLocked(true); },
        unlock: function () { self._setLocked(false); },
        isLocked: function () { return self._locked; },
      };
    }

    _mountParts() {
      var ctx = this._ctx, self = this;
      var SE = g.OkieMotor.searchui, IS = g.OkieMotor.island, ZN = g.OkieMotor.zen, DK = g.OkieMotor.dock;
      // status island
      var scrim = h('div.island-verdunkler', { dataset: { an: 'nein' } });
      this._stage.appendChild(scrim);
      this._island = IS.create(ctx, {
        values: function () { return self._statusValues(); },
        notes: function () { return ctx._notify ? ctx._notify.all() : []; },
        openCenter: function (origin) { if (g.OkieMotor.notify && g.OkieMotor.notify.openCenter) g.OkieMotor.notify.openCenter(ctx, origin); else self._openApp('settings'); },
        scrim: scrim,
        mobile: function () { return !!self._mobile; },
        openEnergy: function () { self._openApp('energy'); },
        openWeather: function () { var w = self._weatherEntity(); if (w) self._openDetail(w.entity_id); },
        openCategory: function (key) {
          var dom = { lights: 'light', switches: 'switch', climate: 'climate', covers: 'cover', media: 'media_player', cleaning: 'vacuum', security: 'lock', utilities: 'valve' }[key];
          if (!dom || !self._search) return;
          ctx.settings.set({ topCategory: 'devices', chip: dom }); self._search.open();
        },
      });
      this._statsHost.appendChild(this._island.el);
      // search row
      this._search = SE.create(ctx);
      this._panelRegion.appendChild(this._search.el);
      this._panelRegion.appendChild(this._contentArea);
      this._panelRegion.appendChild(this._detailWrap);
      this._search.mount();
      // dock
      this._dock = DK.create(ctx, { items: function () { return self._dockItems(); }, mobile: function () { return self._dockBottom; } });
      this._main.appendChild(this._dock.el);
      // lock page
      var z = (ctx.settings.get().zen || {});
      if (z.enabled !== false) {
        this._zenView = ZN.create(ctx, { reveal: function () { self._setLocked(false); } });
        this._stage.appendChild(this._zenView.el);
        if (typeof ResizeObserver === 'function') {      // the island follows the text block, so a long quote pushes it down
          var ro = new ResizeObserver(UI.rafBatch(function () { self._placeIsland(); }));
          ro.observe(this._zenView.el.querySelector('.zen-above')); this._disposers.push(function () { ro.disconnect(); });
        }
      }
      // the bus tells the search panel and the island when the screen changes
      this._disposers.push(this._bus.on('nav', function (n) { if (n.mode !== 'start') self._syncFixedTop(); if (n.mode !== 'start' && self._search) self._search.close(); }));
      this._disposers.push(this._bus.on('search', function (e) { if (e.open) self._syncFixedTop(); self._stage.dataset.search = e.open ? 'open' : 'closed'; }));
    }

    _mountModules() {
      // each feature module gets one chance to attach persistent pieces
      var ctx = this._ctx, self = this;
      ['chronicle', 'notify', 'rest', 'wallpaper', 'rooms', 'sync'].forEach(function (name) {
        var m = g.OkieMotor[name];
        if (m && m.mount) { var inst = m.mount(ctx, { stage: self._stage }); if (inst) self._modules.push(inst); }
      });
      this._updateIsland(true);
    }

    // ---------------------------------------------------------- look ----
    /** The bottom edge of Home Assistant's own header when it is fixed over the page (px from the window top), else 0 (kiosk dashboard, harness).
     *  The header lives in hui-root's shadow root, a few shadow roots above this card: walk up and take the first fixed `.header` at the top. */
    _headerBottom() {
      var n = this, hops = 0;
      while (n && hops++ < 16) {
        var root = n.getRootNode ? n.getRootNode() : null;
        if (!root) return 0;
        var hd = root.querySelector ? root.querySelector('.header') : null;
        if (hd) {
          var r = hd.getBoundingClientRect(), cs = g.getComputedStyle(hd);
          if (cs.position === 'fixed' && r.height > 0 && r.top <= 1) return Math.round(r.bottom);
        }
        n = root.host;
      }
      return 0;
    }

    /** Full-screen phone panels are fixed to the window: they start below HA's header, which the card itself already sits under.
     *  Cheap enough to redo whenever a panel opens, since the header may not have been laid out yet when the card first measured. */
    _syncFixedTop() {
      if (!this._stage) return;
      var off = Math.max(0, +this._settings.get().top_offset || 0);
      this._stage.style.setProperty('--okie-fixed-top', this._mobile ? 'max(env(safe-area-inset-top, 0px), ' + L.panelTop(off, this._headerBottom()) + 'px)' : off + 'px');
    }

    /**
     * 1 where the engine zooms the text of the zoomed column with its boxes (Chrome, Firefox), else the zoom: iOS and iPadOS web views zoom the boxes but draw the text at its pixel size, which is
     * 1 / zoom too big for the layout (rings, dials and cards overflow). Measured with two identical words, one in the zoomed column and one outside it.
     */
    _textZoom(z) {
      if (z === 1 || !z) return 1;
      try {
        var mk = function (parent) { var e = g.document.createElement('span'); e.textContent = '88% Wg'; e.setAttribute('aria-hidden', 'true'); e.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden;white-space:nowrap;font:600 40px/1 sans-serif;pointer-events:none;'; parent.appendChild(e); return e; };
        var inZ = mk(this._main), out = mk(this._stage), a = inZ.offsetWidth, b = out.offsetWidth;
        inZ.remove(); out.remove();
        if (!a || !b) return 1;
        var r = b / a;                                              // 1 where the text is zoomed with the column; about the zoom where it is not
        return r > 0.97 ? 1 : Math.max(Math.min(z, 1), Math.min(1, +r.toFixed(3)));
      } catch (e) { return 1; }
    }

    /** FSC's layout maths: the zoom from the width, the panel height from the room left in the window. */
    _measure() {
      if (!this._stage || !this.isConnected) return;
      var s = this._settings.get();
      var w = this.clientWidth || (this.getBoundingClientRect().width) || g.innerWidth || 1280;
      var mobile = w < 768;
      var touch = false; try { touch = !!(g.matchMedia && g.matchMedia('(pointer:coarse)').matches); } catch (e) { touch = false; }
      var z = mobile ? L.phoneZoom(s.scale) : L.scaledZoom(w, s.scale);      // no extra shrink on a tablet: iPad Safari will not draw letters under 9 px, so a smaller column gets letters too big for it (0.39.1 did that to the thermostat)
      this._mobile = mobile; this._zoom = z;
      var gutter = (w - Math.min(1200 * z, w)) / 2;                // the dock needs room at the left of the column, else it becomes a bottom bar
      this._dockBottom = mobile || gutter < 72;
      var rc = this.getBoundingClientRect(), top = rc.top, off = Math.max(0, +s.top_offset || 0);      // read once, before anything is written: a second read after the writes would lay the page out again
      var avail = Math.max(0, (g.innerHeight || 800) - Math.max(0, top) - off);
      var lay = L.layoutFor(avail / z, !mobile && touch);       // a touch tablet lets the panel reach lower (the column is zoomed down, the window has the room)
      if (s.height && s.height !== 'auto' && typeof s.height === 'number') lay = L.layoutFor(s.height / z + 137);
      if (mobile) lay = { panelH: Math.max(440, Math.round((g.innerHeight || 800) - Math.max(0, top) - off - 220)), gridH: 0, w34: 160, rung: 'boden' };
      this._lay = lay; this._avail = avail;
      var st = this._stage;
      st.style.setProperty('--okie-gap-top', mobile ? 'max(env(safe-area-inset-top, 0px), ' + Math.min(off, 48) + 'px)' : off + 'px');
      st.style.paddingTop = 'calc(var(--okie-gap-top) + var(--okie-center, 0px))';
      this._syncFixedTop();
      st.style.setProperty('--okie-top', Math.max(0, top) + 'px');
      st.dataset.bleed = (!mobile && (touch || (rc.left <= 1 && Math.abs(rc.width - (g.innerWidth || 0)) <= 2))) ? 'true' : 'false';      // the picture fills the whole screen (under the status bar) on a touch tablet like on a phone, and on a card as wide as the window
      st.style.setProperty('--fsc-panel-h', lay.panelH + 'px');
      st.style.setProperty('--fsc-grid-h', lay.gridH + 'px');
      st.style.setProperty('--w34-row-height', lay.w34 + 'px');
      this._main.style.zoom = z === 1 ? '' : String(z);
      this._main.style.setProperty('--okie-fz', String(this._textZoom(z)));      // iOS web views zoom the boxes of the column but not its text: the text follows the zoom itself (see L.scaleFonts)
      this._main.style.width = mobile && z < 1 ? w + 'px' : '';      // a smaller phone column keeps the layout of the full-width one and sits in the middle
      var center = 0, always = s.centerView !== false, dh = (mobile || (s.height && s.height !== 'auto')) ? lay.panelH : L.layoutFor(avail / z, false).panelH;      // a device's own screen keeps the height it was designed for (672 at most): the taller panel of a tablet is for the start screen and the lists
      // The top of the column is the same on every screen: it is placed from the height of the START screen's column (measured once it is laid out, for this window and zoom), never from the screen that is open,
      // so the column does not jump when you go from the Home Screen to an app or between its tabs. An app or a list opens taller by growing downwards (never past the bottom of the window).
      if (!mobile && (always || L.userScale(s.scale) < 1)) {
        st.style.setProperty('--okie-center', '0px');
        var mhz = this._main.offsetHeight * z, bias = touch ? L.TABLET_CENTER_BIAS : 1;      // offsetHeight is in layout pixels in every engine; the zoom turns it into screen pixels
        var homeKey = [Math.round(w), Math.round(g.innerHeight || 0), z, lay.panelH, s.height || '', s.scale].join('|');
        var atHome = (!this._nav || this._nav.mode === 'start') && st.dataset.detail !== 'open';
        if (atHome) this._homeShown = { key: homeKey, h: mhz };
        var ref = this._homeShown && this._homeShown.key === homeKey ? this._homeShown.h : mhz;
        center = L.centerGap(avail, ref, s.scale, always, bias);
        var tallNav = !!this._nav && (this._nav.mode === 'app' || (this._nav.mode === 'detail' && /^weather\./.test(this._nav.itemId || '')));      // the apps and the forecast; a device's own view (the thermostat...) keeps its designed height
        if (touch && tallNav && !(s.height && s.height !== 'auto')) {
          var sbz = (this._main.offsetHeight - this._panelRegion.offsetHeight) * z;      // what is above the panel (the search row), in screen pixels
          dh = Math.max(lay.panelH, Math.min(920, Math.floor((avail - center - sbz - 28) / z)));
        }
      }
      st.dataset.tablet = !mobile && touch ? 'true' : 'false';
      st.style.setProperty('--fsc-detail-h', dh + 'px');
      st.style.setProperty('--okie-center', center + 'px');
      if (!st.dataset.settled) { var stg0 = st; g.requestAnimationFrame(function () { g.requestAnimationFrame(function () { stg0.dataset.settled = 'true'; }); }); }
      st.style.setProperty('--okie-zoom', String(z));            // the lock page text scales with the column, so the island still lands between the status line and the greeting
      var hoehe = mobile ? 'boden' : lay.rung;
      if (st.dataset.hoehe !== hoehe) st.dataset.hoehe = hoehe;
      var mb = mobile ? 'true' : 'false';
      var changed = st.dataset.mobile !== mb;
      st.dataset.mobile = mb; st.dataset.dockbottom = this._dockBottom ? 'true' : 'false';
      if (this._bus) this._bus.emit('resize', { avail: avail, rung: lay.rung, width: w, zoom: z, panelH: lay.panelH });
      if (this._island && this._island.layout) this._island.layout();      // phone or desktop metrics for the pill
      this._centerLock();
      this._placeIsland();
      return changed;
    }

    _applyLook() { this._applyLook0(); this._syncBf(); }
    _applyLook0() {
      var s = this._settings.get();
      var gl = s.glass;
      this.style.setProperty('--okie-fs', String(L.textScale(s.textScale)));
      this.style.setProperty('--okie-tile-clip', SQ.clipPath(s.squircle));
      this.style.setProperty('--card-clip-path', SQ.clipPath(s.squircle));
      this.style.setProperty('--glass-blur-amount', (gl.blur == null ? 20 : gl.blur) + 'px');
      var local = !!s.wallpaper && !g.OkieMotor.wallpaperInView;      // inside Home Assistant the whole view carries the wallpaper
      var bright = (gl.brightness == null ? 100 : gl.brightness) + '%', sat = gl.saturation == null ? 100 : gl.saturation;
      this.style.setProperty('--background-brightness', local ? '100%' : bright);        // the picture carries "Opacity" itself when the card paints it, else the glass does
      this.style.setProperty('--okie-bg-brightness', local ? bright : '100%');
      this.style.setProperty('--background-contrast', (gl.contrast == null ? 100 : gl.contrast) + '%');
      this.style.setProperty('--background-saturation', sat + '%');
      this.style.setProperty('--okie-saturate', String(+(1.8 * sat / 100).toFixed(3)));      // a plain number: percent * percent / percent is not understood by every Safari
      this.style.setProperty('--background-grayscale', (gl.grayscale || 0) + '%');
      var hr = new Date().getHours(), mode = s.bgMode === 'auto' ? (hr >= 7 && hr < 19 ? 'light' : 'dark') : s.bgMode;
      this.style.setProperty('--okie-bg-overlay', mode === 'light' ? 'rgba(255,255,255,.16)' : 'rgba(18,15,12,.34)');
      this.style.setProperty('--glass-tint-alpha', String((gl.tint == null ? 40 : gl.tint) / 100));
      var cardBlur = gl.cardBlur == null ? 0 : +gl.cardBlur, cardTint = gl.cardTint == null ? 10 : +gl.cardTint;
      this.style.setProperty('--okie-card-bf', cardBlur > 0 ? 'blur(' + cardBlur + 'px) saturate(1.5)' : 'none');      // none (not blur(0)) keeps the cards off the GPU when the setting is off
      var dark = gl.cardStyle === 'dark', edge = gl.cardEdge == null ? 14 : +gl.cardEdge;
      this.style.setProperty('--okie-card-bg', dark ? 'rgba(22,19,17,' + (+Math.min(0.88, cardTint / 100 * 2.4).toFixed(3)) + ')' : 'rgba(255,255,255,' + (+(cardTint / 100).toFixed(3)) + ')');      // dark glass: the same slider, 2.4 times as strong (10 % = a quarter dark)
      this.style.setProperty('--okie-card-edge', edge > 0 ? 'inset 0 0 0 1px rgba(255,255,255,' + (+(edge / 100).toFixed(3)) + '),inset 0 1.5px 0 rgba(255,255,255,' + (+Math.min(0.9, edge / 100 * 1.8).toFixed(3)) + ')' : 'none');
      this._stage.dataset.cardblur = cardBlur > 0 ? 'on' : 'off';      // a mask on a parent hides the picture from a blurred card, so the scroll fades step aside while Card blur is on
      this._stage.dataset.dock = s.sidebar.show === false ? 'off' : (s.sidebar.always === false ? 'panel' : 'always');
      this._stage.dataset.bento = s.bento.enabled === false ? 'off' : 'on';
      this._bg.style.backgroundImage = local ? 'url("' + String(s.wallpaper).replace(/"/g, '%22') + '")' : '';
      this._bg.classList.toggle('on', local);
      this._paintRoot(local ? String(s.wallpaper) : '', mode, gl.brightness == null ? 100 : +gl.brightness);
      this._measure();
    }

    /** On a touch screen the strip behind the status bar belongs to the page, not to the card (a picture in the card cannot reach it): paint the page's root in the
     *  colour of the picture's top edge, with the card's own darkening on top, so there is no pale line above the wallpaper. Put back when the card goes. */
    _paintRoot(url, mode, bright) {
      var doc = g.document, root = doc && doc.documentElement; if (!root) return;
      var touch = false; try { touch = !!(g.matchMedia && g.matchMedia('(pointer:coarse)').matches); } catch (e) { touch = false; }
      if (!touch || !url) { this._restoreRoot(); return; }
      var self = this, ov = mode === 'light' ? [255, 255, 255, 0.16] : [18, 15, 12, 0.34], k = Math.max(0, bright) / 100;
      var apply = function () {
        var c = self._rootTop; if (!c || !self.isConnected) return;
        var rgb = c.map(function (v, i) { return Math.round(Math.max(0, Math.min(255, v * k)) * (1 - ov[3]) + ov[i] * ov[3]); }), css = 'rgb(' + rgb.join(',') + ')';
        if (!self._rootSaved) {
          var meta = doc.querySelector('meta[name="theme-color"]');
          self._rootSaved = { bg: root.style.getPropertyValue('background-color'), prio: root.style.getPropertyPriority('background-color'), meta: meta, theme: meta ? meta.getAttribute('content') : null };
        }
        root.style.setProperty('background-color', css, 'important');
        if (self._rootSaved.meta) self._rootSaved.meta.setAttribute('content', css);
      };
      if (this._rootUrl !== url) {
        this._rootUrl = url; this._rootTop = null;
        var img = new Image(); img.crossOrigin = 'anonymous';
        img.onload = function () {
          if (self._rootUrl !== url) return;
          try {
            var cv = doc.createElement('canvas'); cv.width = 32; cv.height = 4; var cx = cv.getContext('2d');
            cx.drawImage(img, 0, 0, img.naturalWidth, Math.max(1, Math.round(img.naturalHeight * 0.04)), 0, 0, 32, 4);
            var d = cx.getImageData(0, 0, 32, 4).data, n = d.length / 4, r = 0, gr = 0, b = 0;
            for (var i = 0; i < d.length; i += 4) { r += d[i]; gr += d[i + 1]; b += d[i + 2]; }
            self._rootTop = [r / n, gr / n, b / n];
          } catch (e) { self._rootTop = [28, 26, 24]; }      // a picture from another site cannot be read: a dark neutral
          apply();
        };
        img.onerror = function () { if (self._rootUrl === url) { self._rootTop = [28, 26, 24]; apply(); } };
        img.src = url;
      } else apply();
    }
    _restoreRoot() {
      this._rootUrl = ''; this._rootTop = null; var sv = this._rootSaved; if (!sv) return; this._rootSaved = null;
      var root = g.document && g.document.documentElement; if (root) { if (sv.bg) root.style.setProperty('background-color', sv.bg, sv.prio); else root.style.removeProperty('background-color'); }
      if (sv.meta && sv.theme != null) sv.meta.setAttribute('content', sv.theme);
    }

    _onSettings(p) {
      this._applyLook();
      if (p && p.thermo !== undefined && g.OkieMotor.controls && g.OkieMotor.controls.notifyLook) g.OkieMotor.controls.notifyLook();
      if (p && p.centerView !== undefined) { this._measure(); }
      if (p && p.bento && p.bento.oneWidget !== undefined) this._rebuildStart();      // one swipeable card or separate ones: the start screen is built again
      if (p && p.language !== undefined) { this._engine.setLang(this._lang()); this._renderDock(); if (this._search) this._search.refreshLabels(); }
      if (p && p.learning) this._engine.setSpeed(p.learning);
      if (p && (p.visibility || p.excluded || p.limits)) this._rebuildCollection(true);
      if (p && p.search && this._search) this._search.applySettings();
      if (p && (p.quickControl || p.quickEnabled !== undefined || p.layout || p.search)) { if (this._search) this._search.rerun(); }
      if (p && p.sidebar) this._renderDock();
      if (p && p.zen) { var on = !!(this._settings.get().zen || {}).enabled; if (!on && this._zenView) { this._setLocked(false); this._zenView.dispose(); this._zenView.el.remove(); this._zenView = null; } }
      this._updateIsland(true);
    }

    // ----------------------------------------------------------- sync ----
    _regSignature() {
      var hs = this._hass;
      return [Object.keys(hs.states).length, hs.entities ? Object.keys(hs.entities).length : 0, hs.areas ? Object.keys(hs.areas).length : 0, hs.devices ? Object.keys(hs.devices).length : 0].join('|');
    }
    _rebuildCollection(force) {
      var hs = this._hass, s = this._settings.get();
      var sig = this._regSignature();
      var refs = [hs.entities, hs.areas, hs.devices];
      var same = this._regRefs && refs.every((r, i) => r === this._regRefs[i]);
      if (!force && same && sig === this._regSig) return false;
      this._regSig = sig; this._regRefs = refs;
      var items = S.buildCollection(hs, { includeHidden: s.visibility.hidden, includeDisabled: s.visibility.disabled, includeDiagnostic: s.visibility.diagnostic });
      items = items.filter(function (i) { var st = hs.states[i.id]; return !(st && st.attributes && Array.isArray(st.attributes.entries)); });   // news feed sensors belong to the News app
      if (g.OkieMotor.gadgets) items = g.OkieMotor.gadgets.apply(items, hs.states, hs.areas);      // the Kindle and the AWTRIX: one tile each instead of dozens of entities
      if (s.limits && s.limits.max > 0) items = items.slice(0, s.limits.max);
      this._engine.setCollection(items);
      this._engine.setExcluded(s.excluded);
      this._engine.setFilters({ areaOnly: !!(s.limits && s.limits.areaOnly), hideUnavailable: !!(s.limits && s.limits.hideUnavailable) });   // live: area-less sensors still feed the island and alerts
      this._prevStates = hs.states;
      if (this._search && this._ready) { this._search.rerun(); }
      return true;
    }
    _sync() {
      var hs = this._hass;
      if (!this._rebuildCollection(false)) {
        var prev = this._prevStates || {}, cur = hs.states, changed = [];
        for (var id in cur) {
          if (cur[id] !== prev[id]) {
            var it = this._engine.getItem(id);
            if (it) {
              var patch = { state: cur[id].state };
              var fn = cur[id].attributes && cur[id].attributes.friendly_name; if (fn && L.decodeEntities) fn = L.decodeEntities(fn);      // (a name like 50&quot; TV is stored decoded; the raw one would put the entity back into the text)
              if (fn && fn !== it.name) patch.name = fn;
              this._engine.patch(id, patch);
            }
            changed.push({ id: id, old: prev[id] || null, next: cur[id] });
          }
        }
        this._prevStates = cur;
        if (changed.length) this._bus.emit('states', changed);
      }
      this._search.update();
      this._updateIsland(false);
      if (this._zenView) { this._zenView.update(); this._centerLock(); this._placeIsland(); }
      if (this._startView && this._startView.update) this._startView.update();
      if (this._detailView && this._detailView.update) this._detailView.update();
      if (this._appView && this._appView.update) this._appView.update();
      this._modules.forEach(function (m) { if (m && m.update) m.update(); });
    }

    // -------------------------------------------------------- island ----
    _weatherEntity() {
      var id = this._settings.get().weather_entity;
      if (id && this._hass.states[id]) return this._hass.states[id];
      var k = Object.keys(this._hass.states).filter(function (x) { return x.indexOf('weather.') === 0; })[0];
      return k ? this._hass.states[k] : null;
    }
    /** What the capsule and the lock page show: weather and house power. */
    _statusValues() {
      var hs = this._hass, s = this._settings.get(), out = [], IS = g.OkieMotor.island;
      var w = this._weatherEntity();
      if (w) {
        var wt = w.attributes.temperature;
        out.push({ icon: UI.domainIcon('weather', null, w.state), text: wt != null ? Math.round(wt) + '°' : this._ctx.formatState(w) });
      }
      var pid = s.power_entity || (IS && IS.autoPower(this._engine.all(), hs.states));
      var pe = pid && hs.states[pid];
      if (pe) out.push({ icon: 'bolt', text: IS.fmtPower(pe.state, pe.attributes.unit_of_measurement || '') });
      return out;
    }
    _contextLine() {
      var rec = this._ctx.chronicle && this._ctx.chronicle.recent ? this._ctx.chronicle.recent(1)[0] : null;
      if (!rec) return '';
      return L.shortName(rec.name, rec.area) + ' · ' + rec.text + ' · ' + L.relativeTime(Date.now() - rec.ts, this._lang());
    }
    _liveActivities() {
      var IS = g.OkieMotor.island, s = this._settings.get();
      if (s.island && s.island.liveShow === false) return [];
      var items = this._engine.all().filter(function (i) { return !this._engine.isExcluded(i); }, this);
      return IS.liveActivities(items, this._hass.states, { enabled: (s.island && s.island.live) || undefined });
    }
    _updateIsland(force) {
      if (!this._island) return;
      var notes = this._ctx._notify ? this._ctx._notify.all().map(function (n) { return n.id; }).join(',') : '';
      var live = this._liveActivities().map(function (a) { return a.id + a.value; }).join(',');
      var sig = [this._statusValues().map(function (v) { return v.text; }).join('|'), notes, live, this._lang()].join('~');
      if (!force && sig === this._islandSig) return;
      this._islandSig = sig;
      this._island.update();
    }

    // ---------------------------------------------------------- dock ----
    _dockItems() {
      var A = g.OkieMotor.apps, DK = g.OkieMotor.dock, self = this, hs = this._hass;
      var avail = ['home'];
      DK.DEFAULT_ORDER.forEach(function (id) {
        if (id === 'home') return;
        if (id === 'weather') { if (self._weatherEntity()) avail.push(id); }
        else if (A.get(id === 'settings' ? 'settings' : id)) avail.push(id);
      });
      var saved = this._settings.get().sidebar.items;
      saved = saved && saved.length ? saved.map(function (x) { return String(x).replace(/^app:/, ''); }) : null;
      // a menu item that did not exist when the list was saved (Server, Music): put it in once, after the one it belongs next to; switching it off afterwards sticks
      var self2 = this; [['server', 'schedules'], ['music', 'calendar']].forEach(function (nw) {
        var flag = nw[0] === 'server' ? 'dock.addedServer' : 'dock.added.' + nw[0];
        if (saved && avail.indexOf(nw[0]) >= 0 && saved.indexOf(nw[0]) < 0 && !self2._store.get(flag, false)) {
          self2._store.set(flag, true); var at = saved.indexOf(nw[1]); saved = saved.slice(); saved.splice(at >= 0 ? at + 1 : saved.length, 0, nw[0]);
          self2._settings.set({ sidebar: { items: saved.slice() } });
        }
      });
      var ids = DK.dockItems({ available: avail, saved: saved });
      var out = ids.map(function (id) {
        var app = A.get(id);
        var label = id === 'home' ? self._t('card.home') : (id === 'weather' ? ((self._weatherEntity() && self._weatherEntity().attributes.friendly_name) || core.t('dock.weather', self._lang())) : (app ? (app.nameKey ? self._t(app.nameKey) : app.name) : id));
        var act = id === 'home' ? function () { self._home(); }
          : (id === 'weather' ? function () { var w = self._weatherEntity(); if (w) self._openDetail(w.entity_id); } : function () { self._openApp(id); });
        return { id: id, icon: DK.ICON[id] || (app && app.icon) || 'grid', label: label, act: act };
      });
      return out;
    }
    _renderDock() {
      if (!this._dock) return;
      var nav = this._nav;
      var cur = nav.mode === 'app' ? nav.appId : (nav.mode === 'detail' ? '' : 'home');
      this._dock.setActive(cur);
      this._dock.render();
    }
    /** Home: leave whatever is open; on the start screen itself it brings the lock page back. */
    _home() {
      if (this._nav.mode !== 'start') { this._show('start'); return; }
      if (this._search && this._search.isOpen()) { this._search.close(); return; }
      var z = this._settings.get().zen;
      if (z && z.enabled !== false && this._zenView) this._setLocked(true);
    }

    // ------------------------------------------------------- lock page ----
    /** FSC puts the notification capsule 44px below the lock text block (its --zen-island-y is measured, not fixed). */
    /** On a wide screen the lock page (clock, greeting, status line and the notification pill below them) sits in the middle of the window instead of at the top. */
    _centerLock() {
      var zv = this._zenView, st = this._stage; if (!zv || !st) return;
      var shift = 0;
      if (!this._mobile && this._settings.get().centerView !== false) {
        var above = zv.el.querySelector('.zen-above'), pill = st.querySelector('.island-anchor') || st.querySelector('.island-holder');
        var ah = above ? above.getBoundingClientRect().height : 0;                              // sizes as they are on screen: the lock block is zoomed with the column
        if (ah > 0) {
          var total = ah + 44 + (pill ? pill.getBoundingClientRect().height : 0);              // the pill sits 44 px below the text block
          shift = Math.max(0, Math.floor((st.clientHeight - total) / 2) - 16);                 // 16 px is where the block starts without a shift
        }
      }
      if (shift !== this._zenShift) { this._zenShift = shift; st.style.setProperty('--zen-shift', shift + 'px'); }
    }
    _placeIsland() {
      var zv = this._zenView, holder = this._stage && this._stage.querySelector('.island-holder');
      if (!zv || !holder || !this._locked) return;
      var above = zv.el.querySelector('.zen-above'); if (!above) return;
      // Measure without touching the holder: resetting its transform here would restart its slide animation on every update (the capsule hopped).
      var r = holder.getBoundingClientRect(), zf = holder.offsetHeight ? r.height / holder.offsetHeight : 1;
      var m = null; try { m = new DOMMatrixReadOnly(getComputedStyle(holder).transform); } catch (e) { /* no transform yet */ }
      var natural = r.top - (m ? m.f : 0) * (zf || 1), bottom = above.getBoundingClientRect().bottom;
      var y = Math.max(0, Math.round((bottom + 44 - natural) / (zf || 1)));
      if (y !== this._islandY) { this._islandY = y; this._stage.style.setProperty('--zen-island-y', y + 'px'); }
    }
    /** Home Assistant sometimes rebuilds the card (a reconnect, a view change, the browser reloading the tab): within 15 minutes of the last touch it comes back on the start screen, not the lock page. */
    _recentlyOpen() {
      try { var t = +g.sessionStorage.getItem('okie:openAt'); return t > 0 && (g.__okieBridge ? true : Date.now() - t < 15 * 60000); } catch (e) { return false; }      // in the Okie Home app the page lives as long as the app does: coming back to it never shows the lock page again, closing the app does
    }
    /** Where you are (an app or a device screen), kept for as long as the page lives, so a page that is built again (iOS took it from memory while the app was away) comes back to it. */
    _noteNav(n) { try { g.sessionStorage.setItem('okie:nav', JSON.stringify(n && n.mode !== 'start' ? { m: n.mode, a: n.appId || '', i: n.itemId || '' } : null)); } catch (e) { /* private mode */ } }
    _restoreNav() {
      if (!g.__okieBridge || this._locked) return;
      var n = null; try { n = JSON.parse(g.sessionStorage.getItem('okie:nav') || 'null'); } catch (e) { n = null; }
      if (!n || /[?&]okie_open=/.test(g.location.search || '')) return;      // a link from a widget wins
      try {
        if (n.m === 'app' && n.a && g.OkieMotor.apps.get(n.a)) this._openApp(n.a, true);
        else if (n.m === 'detail' && n.i && this._engine.getItem(n.i)) this._openDetail(n.i, null, true);
      } catch (e) { /* the screen is gone: the start screen stays */ }
    }
    _noteOpen(on) { try { g.sessionStorage.setItem('okie:openAt', on ? String(Date.now()) : '0'); } catch (e) { /* private mode */ } }
    _setLocked(on, silent) {
      on = !!on && !!this._zenView;
      this._locked = on;
      this._noteOpen(!on);
      this._stage.dataset.zenRevealed = on ? 'false' : 'true';
      if (this._island) this._island.setLocked(on);
      if (on) {
        if (this._search) this._search.close();
        if (this._nav.mode !== 'start') { this._clearOver(); this._nav = { mode: 'start', itemId: null, appId: null }; this._stage.dataset.detail = 'closed'; this._measure(); }
        if (this._zenView) { this._zenView.update(); if (!silent) this._zenView.focus(); }
        if (this._zenView) this._zenView.el.style.display = '';
      } else {
        if (this._startView && this._startView.stagger && !silent) this._startView.stagger();
        if (this._zenView) { var el = this._zenView.el; clearTimeout(this._zenHide); this._zenHide = setTimeout(() => { if (!this._locked) el.style.display = 'none'; }, 700); }
      }
      this._renderDock();
      if (on) { this._centerLock(); this._placeIsland(); }
      if (this._bus) this._bus.emit('lock', { locked: on });
    }
    _onRest(e) {
      if (!e) return;
      if (e.phase === 'saver' || e.phase === 'deep') this._setLocked(true, true);
      var hr = new Date().getHours();
      this._stage.dataset.nacht = hr >= 22 || hr < 6 ? 'ja' : 'nein';
      if (e.phase === 'deep') this._stage.dataset.ambient = 'tief'; else delete this._stage.dataset.ambient;
      if (this._island && this._island.setAmbient) this._island.setAmbient(e.phase === 'deep');
    }

    // ------------------------------------------------------ navigation ----
    _animateIn(el) {
      if (!el || !el.animate || (g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches)) return;
      el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 280, easing: 'cubic-bezier(.2,.8,.2,1)' });
    }
    _clearOver() {
      if (this._detailView && this._detailView.dispose) this._detailView.dispose();
      if (this._appView && this._appView.dispose) this._appView.dispose();
      this._detailView = null; this._appView = null;
      this._vOver.innerHTML = '';
    }
    _closeOver() { this._clearOver(); this._stage.dataset.detail = 'closed'; this._measure(); }
    /** The start screen built again (a setting changed what it is made of). */
    _rebuildStart() {
      try { if (this._startView && this._startView.dispose) this._startView.dispose(); } catch (e) { /* the old one goes away anyway */ }
      this._startView = null; if (this._vStart) this._vStart.innerHTML = '';
      if (g.OkieMotor.bento && this._vStart) this._startView = g.OkieMotor.bento.render(this._vStart, this._ctx);
      this._measure();
    }
    _show(mode, opts, silent) {
      this._closeOver();
      this._nav = { mode: 'start', itemId: null, appId: null };
      this._vStart.hidden = false;
      if (!this._startView && g.OkieMotor.bento) this._startView = g.OkieMotor.bento.render(this._vStart, this._ctx);
      else if (this._startView && this._startView.show) this._startView.show();
      this._stack = [];
      this._renderDock();
      this._bus.emit('nav', this._nav);
    }
    _openDetail(id, origin, restoring) {
      var item = this._engine.getItem(id);
      if (!item) return;
      if (item.domain === 'gadget' && g.OkieMotor.apps.get('gadget-' + id.slice(7))) return this._openApp('gadget-' + id.slice(7));
      if (item.domain === 'todo' && g.OkieMotor.apps.get('tasks')) return this._openApp('tasks');
      if (item.domain === 'calendar' && g.OkieMotor.apps.get('calendar')) return this._openApp('calendar');
      if (item.domain === 'media_player' && g.OkieMotor.music && g.OkieMotor.apps.get('music')) {      // a Spotify (music) player opens the Music screen, a TV keeps its own view
        var ms = this._hass && this._hass.states[id];
        if (ms && g.OkieMotor.music.isMusic(id, ms)) { try { this._ctx.store.set('music.player', id); } catch (e) { /* the screen picks the best player itself */ } return this._openApp('music'); }
      }
      if (!restoring) this._stack.push(Object.assign({}, this._nav));       // going back must not push again, or back loops forever
      this._clearOver();
      this._nav = { mode: 'detail', itemId: id, appId: null };
      this._stage.dataset.detail = 'open'; this._measure();
      var d = g.OkieMotor.detail, self = this;
      this._detailView = this._boundary(this._vOver, function () { return (d && d.render) ? d.render(self._vOver, self._ctx, id) : self._fallbackDetail(id); }, 'detail ' + id);
      this._animateIn(this._vOver);
      this._renderDock();
      this._bus.emit('nav', this._nav);
    }
    _openApp(appId, restoring, push) {
      var app = g.OkieMotor.apps.get(appId);
      if (!app) return;
      if (this._locked) this._setLocked(false, true);
      if (!restoring && (this._nav.mode !== 'app' || (push && this._nav.appId !== appId))) this._stack.push(Object.assign({}, this._nav));      // push: opened from a view you come back to (the editor of the light modes from a room)
      this._clearOver();
      this._nav = { mode: 'app', itemId: null, appId: appId };
      this._stage.dataset.detail = 'open'; this._measure();
      var self = this;
      var inst = this._boundary(this._vOver, function () { return app.render(self._vOver, self._ctx); }, 'app ' + appId);
      this._appView = (inst && (inst.update || inst.dispose)) ? inst : { dispose: typeof inst === 'function' ? inst : null };
      this._animateIn(this._vOver);
      this._renderDock();
      this._bus.emit('nav', this._nav);
    }
    _back() {
      var self = this, v = this._detailView;
      if (this._nav.mode === 'detail' && v && v.beforeClose) {
        if (this._backing) return;                                          // the wheel is already rolling out: a second tap changes nothing
        var p = v.beforeClose();
        if (p && p.then) {
          this._backing = true; this._ctx.haptic(8);
          p.then(function () { self._backing = false; if (self._detailView === v) self._backNow(true); });
          return;
        }
      }
      this._backNow();
    }
    _backNow(hapticDone) {
      if (!hapticDone) this._ctx.haptic(8);
      var prev = this._stack.pop();
      if (prev && prev.mode === 'detail' && prev.itemId) { this._openDetail(prev.itemId, null, true); return; }
      if (prev && prev.mode === 'app' && prev.appId) { this._openApp(prev.appId, true); return; }
      this._show('start');
    }
    /** A view that throws while rendering leaves a retry box inside the panel; the dock and back button still work. */
    _boundary(container, build, label) {
      var self = this, before = container.children.length;
      try { return build(); }
      catch (e) {
        if (g.console) console.error('[okie] ' + label + ' failed', e);
        Array.prototype.slice.call(container.children, before).forEach(function (c) { c.remove(); });
        var box = h('div.eb', { role: 'alert', style: { margin: '24px' } }, h('span', null, this._t('card.broken')),
          h('div', { style: { display: 'flex', gap: '8px' } },
            h('button.eb-retry', { onclick: function () { box.remove(); self._detailView = self._appView = null; if (self._nav.mode === 'detail') self._openDetail(self._nav.itemId); else if (self._nav.mode === 'app') self._openApp(self._nav.appId); } }, this._t('card.retry')),
            h('button.eb-retry', { onclick: function () { self._back(); } }, this._t('card.back'))));
        container.appendChild(box);
        return null;
      }
    }
    _restore() { this._renderDock(); this._measure(); }

    _fallbackDetail(id) {
      var self = this, item = this._engine.getItem(id);
      var ctx = this._ctx;
      var stateEl = h('div.fd-state'), btn = h('button.fd-btn', { onclick: function () {
        var a = L.quickAction(Object.assign({}, item, { state: (ctx.state(id) || {}).state }), Object.assign({}, L.DEFAULT_QUICK, { cover: 'tap', lock: 'tap' }));
        if (a) ctx.call(a.domain, a.service, a.data).catch(function () { ctx.toast('error', item.name); });
      } }, 'Toggle');
      var root = h('div.fd', null,
        h('div.fd-top', null, h('button.fd-back', { 'aria-label': this._t('card.back'), onclick: function () { self._back(); }, html: UI.icon('back', 22) }),
          h('div', null, h('div.fd-title', null, item.name), h('div.fd-sub', null, item.area || item.domain))),
        stateEl, btn);
      var paint = function () { var s = ctx.state(id); if (s) stateEl.textContent = L.describeState(item.domain, s, ctx.lang()); btn.hidden = !L.quickAction(Object.assign({}, item, { state: s && s.state }), Object.assign({}, L.DEFAULT_QUICK, { cover: 'tap', lock: 'tap' })); };
      paint();
      this._vOver.appendChild(root);
      return { update: paint, dispose: function () {} };
    }
  }

  /** Settings > About > Diagnostics: what this browser, window and card measure, for a bug report (no personal data). */
  g.OkieMotor.diagInfo = function (host) {
    var L2 = [], nav = g.navigator || {}, vv = g.visualViewport, scr = g.screen || {};
    var add = function (k, v) { L2.push(k + ': ' + v); };
    var r1 = function (n) { return Math.round(n * 100) / 100; };
    try {
      add('browser', String(nav.userAgent || '').replace(/^Mozilla\/5\.0 /, '').slice(0, 120));
      add('window', (g.innerWidth || 0) + ' x ' + (g.innerHeight || 0) + ' px, screen ' + (scr.width || 0) + ' x ' + (scr.height || 0) + ', pixel ratio ' + r1(g.devicePixelRatio || 1) + (vv ? ', page zoom ' + r1(vv.scale) + ' (' + Math.round(vv.width) + ' x ' + Math.round(vv.height) + ')' : ''));
      add('touch', (g.matchMedia && g.matchMedia('(hover: none) and (pointer: coarse)').matches ? 'yes' : 'no') + ', zoom property ' + (g.CSS && CSS.supports && CSS.supports('zoom', '.5') ? 'yes' : 'no'));
      if (host && host._main) {
        add('card', 'width ' + host.clientWidth + ', zoom ' + r1(host._zoom) + ', ' + (host._mobile ? 'phone' : 'wide') + ', panel ' + (host._lay ? host._lay.panelH + ' (' + host._lay.rung + ')' : '-') + ', size setting ' + ((host._settings && host._settings.get().scale) || 100) + '%');
        var probe = document.createElement('div'); probe.style.cssText = 'position:absolute;left:-9999px;top:0;width:100px;height:10px;'; host._main.appendChild(probe);
        var pr = probe.getBoundingClientRect(); add('zoom test', 'a 100 px box is ' + r1(pr.width) + ' px by rect, ' + probe.offsetWidth + ' by offsetWidth (zoom ' + r1(host._zoom) + ')'); host._main.removeChild(probe);
        // every scrolling area on screen: its size, whether a nudge by code moves it, and the boxes around it (height / content height, and overflow where it clips)
        var chainOf = function (el) {
          var out = [], e = el, n = 0;
          while (e && n < 6) { var cs = g.getComputedStyle(e); out.push(String(e.className || e.tagName).split(' ')[0].slice(0, 14) + ' ' + e.clientHeight + '/' + e.scrollHeight + (/(auto|scroll|hidden)/.test(cs.overflowY) ? ' ' + cs.overflowY : '')); e = e.parentElement; n++; }
          return out.join(' < ');
        };
        var scrollers = [].slice.call(host._root.querySelectorAll('.dt-body, .okie-scroll, .w1-body')).filter(function (b) { var r = b.getBoundingClientRect(); return r.width > 0 && r.height > 0; }).slice(0, 4);
        scrollers.forEach(function (b, i) {
          var s0 = b.scrollTop, room = b.scrollHeight - b.clientHeight; b.scrollTop = s0 + (s0 + 5 <= room ? 5 : -5); var moved = b.scrollTop !== s0; b.scrollTop = s0;
          add('scroll area ' + (i + 1), b.scrollHeight + ' of ' + b.clientHeight + ' px, top ' + Math.round(s0) + ', ' + (moved ? 'scrolls' : room <= 1 ? 'nothing to scroll' : 'does not scroll by code'));
          add('  boxes', chainOf(b));
        });
        var wf = g.OkieMotor.weather && g.OkieMotor.weather.lastForecast; if (wf) add('weather forecast', wf.daily + ' days and ' + wf.hourly + ' hours from Home Assistant');
        var dt = host._root.querySelector('.dt'); if (dt) add('detail view', dt.clientWidth + ' x ' + dt.clientHeight + ' (design px), tab ' + (dt.dataset.tab || '-'));
      }
      add('thermostat', g.OkieMotor.layoutInfo ? g.OkieMotor.layoutInfo() : '-');
      add('fonts', ['Okie Sora', 'Okie Manrope', 'Inter'].map(function (f) { try { return f + ' ' + (document.fonts.check('16px "' + f + '"') ? 'ok' : (f === 'Inter' ? 'missing' : 'not used yet')); } catch (e) { return f + ' ?'; } }).join(', '));
    } catch (e) { add('error', String(e && e.message || e)); }
    return L2.join('\n');
  };

  if (!customElements.get('okie-motor-card')) customElements.define('okie-motor-card', OkieMotorCard);
  g.customCards = g.customCards || [];
  g.customCards.push({ type: 'okie-motor-card', name: 'Okie Motor', description: 'Search, browse and control everything: lock page, bento start, devices, detail views.' });
  g.OkieMotor.card = { DEFAULTS: DEFAULTS, element: OkieMotorCard };
})(typeof globalThis !== 'undefined' ? globalThis : window);

// Injected into the dashboard page by the Okie Home app (DashboardView.swift). Not part of the card: it only talks to the card's page from outside.
// What it does for a device screen that a widget opened (the thermostat):
//   open(id)   open that device's screen (or "app:calendar", one of the card's own screens) right now when the card is already running (no page reload), true when it worked
//   openWhenReady(id)  the same on a cold start: tries every 100 ms until the card is up
//   watch()    tell the app (message "okieOpened") as soon as the screen is on, so the loading cover can go
//   arm()      the next Back on that screen is the user leaving it: on the Controls page it goes to the Home Screen (message "okieHome"),
//              on another tab (Schedule, History, ...) it goes back to Controls first, like a Back inside the screen
(function () {
  if (window.__okieBridge) return;
  var B = window.__okieBridge = { armed: false, host: null };
  function post(name, v) { try { window.webkit.messageHandlers[name].postMessage(v == null ? '1' : v); } catch (e) { /* not in the app */ } }
  function deep(sel, root) {
    root = root || document;
    var f = root.querySelector(sel); if (f) return f;
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) { var s = all[i].shadowRoot; if (s) { var r = deep(sel, s); if (r) return r; } }
    return null;
  }
  function findHost(root) {
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      if (typeof all[i]._openDetail === 'function') return all[i];
      if (all[i].shadowRoot) { var r = findHost(all[i].shadowRoot); if (r) return r; }
    }
    return null;
  }
  // iOS web views have no navigator.vibrate, so the card falls back to a hidden-switch trick that does nothing here: give it a vibrate that the app answers with the phone's own haptics
  try { Object.defineProperty(navigator, 'vibrate', { configurable: true, writable: true, value: function (p) { var ms = Array.isArray(p) ? (p[0] || 0) : (+p || 0); post('okieHaptic', String(Math.round(ms))); return true; } }); } catch (e) { /* stays as it was */ }
  B.deep = deep;
  // The card's start-up animation (Settings > Appearance > Splash screen, about 3 s when it is on) is pointless when a widget asks for one screen: take it away while the screen is opened.
  B.splashSetting = null; B.splashRemoved = false;
  try { var o = JSON.parse(localStorage.getItem('okie:settings') || '{}'); if (typeof o === 'string') o = JSON.parse(o); B.splashSetting = (o && o.splash) || null; } catch (e) { /* no settings yet */ }
  B.killSplash = function () {
    var n = 0, iv = setInterval(function () {
      var sp = deep('.splash'); if (sp && sp.parentNode) { sp.parentNode.removeChild(sp); B.splashRemoved = true; }
      if (++n > 75) clearInterval(iv);
    }, 80);
  };
  // A screen opened from a widget fills the whole phone screen (no margin round it, no dock under it), the way the thermostat's controls do: a style in the card's own shadow root, taken
  // away again when the screen is left, so the dashboard looks as usual the next time.
  B.fullscreen = function (on) {
    try {
      var h = B.host || findHost(document), root = h && h.shadowRoot; if (!root) return;
      var old = root.getElementById('okie-full'); if (old) old.parentNode.removeChild(old);
      if (!on) return;
      var st = document.createElement('style'); st.id = 'okie-full';
      st.textContent = '.stage[data-mobile="true"] .detail-wrap{left:0!important;right:0!important;top:var(--okie-gap-top,env(safe-area-inset-top,0px))!important;bottom:0!important;border-radius:0!important;}' +
        '.vpm-wrapper,.vision-pro-menu{display:none!important;}';
      root.appendChild(st);
    } catch (e) { /* the screen stays as the card draws it */ }
  };
  // The iPad centring fix lives in the card now (okie-motor v0.43.0: src/okie-logic.js columnHeight + TABLET_CENTER_BIAS, shared with Safari). This copy only works for an OLDER card that does not have it yet
  // (the app can be installed before the server): a web view reports a zoomed element at its unzoomed height, so such a card centres its column too high; centre it from the real height, a bit above the middle.
  B.fixCentre = function () {
    var h = B.host || findHost(document);
    if (!h || !h._stage || !h._main || typeof h._measure !== 'function') return false;
    if (window.OkieMotor && OkieMotor.logic && typeof OkieMotor.logic.columnHeight === 'function') return true;       // the card does it itself
    if (h.__okieCentre) return true;
    function fix() {
      try {
        var st = h._stage, m = h._main, z = h._zoom || 1;
        if (h._mobile || st.dataset.detail === 'open') return;
        var shown = m.offsetHeight * z;
        st.style.setProperty('--okie-center', Math.max(0, Math.floor((h._avail - shown) / 2 * 0.78)) + 'px');
      } catch (e) { /* the card keeps its own value */ }
    }
    var orig = h._measure;
    h._measure = function () { var r = orig.apply(this, arguments); fix(); return r; };
    h.__okieCentre = true; fix();
    return true;
  };
  (function () { var n = 0, iv = setInterval(function () { if (B.fixCentre() || ++n > 80) clearInterval(iv); }, 250); })();
  // The card's screensaver (Settings > Screensaver & deep rest: after a few minutes without a touch it goes back to the lock page and then to a near-black "deep rest") is for wall tablets that run all
  // day. In the Okie Home app it looked like a broken screen (Paul: "random, 5 minutes later, stays like that"), so the app keeps it off on this device (the setting belongs to this device only).
  B.noScreensaver = function () {
    var h = B.host || findHost(document), set = h && h._settings;
    if (!set || typeof set.get !== 'function' || typeof set.set !== 'function') return false;
    try { var r = set.get().rest || {}; if (String(r.lockAfter) !== 'never' || r.enabled) set.set({ rest: { lockAfter: 'never', enabled: false } }); } catch (e) { /* the card keeps its own */ }
    return true;
  };
  (function () { var n = 0, iv = setInterval(function () { if (B.noScreensaver() || ++n > 80) { clearInterval(iv); /* and again later: a settings sync from another screen must not bring it back */ setInterval(B.noScreensaver, 60000); } }, 250); })();
  // The page script of the old setup (/local/okie-ai-bridge.js, kiosk lock on /okie-tablet) cancels every touchmove it finds no scroller for, looking from the event target, which the card's
  // shadow root retargets to the card, so no list inside it ever scrolled on the iPad. A document/window-level preventDefault on a touch that starts in something that scrolls is dropped here
  // (the card does the same from 0.43.4); handlers on the elements themselves (dials, drags) are untouched.
  (function () {
    function scrollsUnder(e) {
      var p = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < p.length; i++) {
        var n = p[i]; if (!n || n.nodeType !== 1) continue;
        var cs = getComputedStyle(n), sc = function (o) { return o === 'auto' || o === 'scroll' || o === 'overlay'; };
        if ((sc(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) || (sc(cs.overflowX) && n.scrollWidth > n.clientWidth + 1)) return true;
      }
      return false;
    }
    var pd0 = Event.prototype.preventDefault;
    Event.prototype.preventDefault = function () {
      try {
        if (this.type === 'touchmove') {
          var ct = this.currentTarget;
          if ((ct === document || ct === window || ct === document.documentElement || ct === document.body) && scrollsUnder(this)) return;
        }
      } catch (e) { /* never in the way */ }
      return pd0.apply(this, arguments);
    };
  })();
  B.arm = function () { B.armed = true; };
  B.open = function (id) {
    try {
      var h = (B.host && B.host.isConnected) ? B.host : (B.host = findHost(document));
      var app = String(id).indexOf('app:') === 0 ? String(id).slice(4) : null;          // "app:calendar": one of the card's own screens (calendar, tasks, ...), not a device
      if (!h || !h._hass || !h._hass.states) return false;
      if (app) { if (typeof h._openApp !== 'function') return false; if (h._locked) h._setLocked(false, true); h._openApp(app); }
      else { if (!h._hass.states[id]) return false; if (h._locked) h._setLocked(false, true); h._openDetail(id); }
      if (B.hostAt == null) { B.hostAt = Math.round(performance.now()); B.killSplash(); }
      B.fullscreen(true);
      return true;
    } catch (e) { return false; }
  };
  // A cold start: open the screen the moment the card is ready (the card's own ?okie_open= waits a fixed 0.9 s). Falls back to that link if the card never gets ready.
  B.openWhenReady = function (id) {
    var n = 0, iv = setInterval(function () {
      if (B.open(id)) { clearInterval(iv); B.arm(); B.watch(); }
      else if (++n > 120) { clearInterval(iv); try { var u = new URL(location.href); u.searchParams.set('okie_open', id); location.replace(u.toString()); } catch (e) { /* stays on the dashboard */ } }
    }, 100);
  };
  // How long the picture / video at the top of the screen takes (it downloads after the screen is up): told to the app as a note for the log.
  B.watchMedia = function () {
    var n = 0, t0 = performance.now(), iv = setInterval(function () {
      var vs = []; try { (function walk(root) { root.querySelectorAll('video').forEach(function (v) { vs.push(v); }); root.querySelectorAll('*').forEach(function (e) { if (e.shadowRoot) walk(e.shadowRoot); }); })(document); } catch (e) { /* none */ }
      var ready = vs.filter(function (v) { return v.readyState >= 3 && v.currentTime > 0; });
      if (ready.length || ++n > 160) { clearInterval(iv); post('okieNote', JSON.stringify({ video_ready_after_screen_ms: ready.length ? Math.round(performance.now() - t0) : null, videos: vs.length, src: vs[0] && (vs[0].currentSrc || vs[0].src || '').slice(-60) })); }
    }, 125);
  };
  B.watch = function () {
    var n = 0, iv = setInterval(function () {
      if (deep('.dt-top') && !deep('.splash')) { clearInterval(iv); B.watchMedia(); post('okieOpened', JSON.stringify({ card_ready_ms: B.hostAt, screen_on_ms: Math.round(performance.now()), splash: B.splashSetting, splash_removed: B.splashRemoved })); } else if (++n > 80) clearInterval(iv);
    }, 150);
  };
  // Speech recognition: a web view has no SpeechRecognition, so the card's microphone did nothing. The app listens (message okieSpeech, App/SpeechBridge.swift) and sends the words back through
  // window.__okieSpeech; the page gets a SpeechRecognition with the usual start / stop / onresult / onend that talks to it.
  (function () {
    try { if (!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.okieSpeech)) return; } catch (e) { return; }
    var cur = null, END_QUIET = 1500, NOBODY = 7000;
    function Rec() { this.lang = 'en-US'; this.interimResults = false; this.continuous = false; this.maxAlternatives = 1; }
    // The speaking is over when the words stop changing for a moment (or nobody speaks at all for a while): the recognizer is told to stop, as in a browser. Without this the app listened until a second tap.
    function quiet(r, ms) { clearTimeout(r._q); r._q = setTimeout(function () { if (cur === r) r.stop(); }, ms); }
    Rec.prototype.start = function () { cur = this; this._last = ''; this._sent = false; quiet(this, NOBODY + 3000); post('okieSpeech', JSON.stringify({ cmd: 'start', lang: this.lang })); };
    Rec.prototype.stop = function () { clearTimeout(this._q); post('okieSpeech', JSON.stringify({ cmd: 'stop' })); };
    Rec.prototype.abort = Rec.prototype.stop;
    window.SpeechRecognition = window.webkitSpeechRecognition = Rec;
    function deliver(r, text, final) { var item = [{ transcript: text || '', confidence: 0.9 }]; item.isFinal = !!final; if (final) r._sent = true; if (r.onresult) r.onresult({ resultIndex: 0, results: [item] }); }
    window.__okieSpeech = function (o) {
      var r = cur; if (!r || !o) return;
      if (o.ev === 'start') { quiet(r, NOBODY); if (r.onstart) r.onstart({}); }
      else if (o.ev === 'result') {
        var text = o.text || '';
        if (text !== r._last) { r._last = text; quiet(r, o.final ? 250 : END_QUIET); }
        if (r.interimResults || o.final) deliver(r, text, !!o.final);      // dictation without interim results gets the words once, at the end
      }
      else if (o.ev === 'error') { clearTimeout(r._q); cur = null; if (r.onerror) r.onerror({ error: o.error || 'not-allowed' }); if (r.onend) r.onend({}); }
      else if (o.ev === 'end') { clearTimeout(r._q); cur = null; if (!r.interimResults && r._last && !r._sent) deliver(r, r._last, true); if (r.onend) r.onend({}); }
    };
  })();
  // The card file reaches the page under a web address that only changes when Hemma is reloaded, so the web view keeps serving an old copy after an install. Ask the server which version it has
  // (okie-version.json, never cached) and when it is not the one that is running, clear the web view's cache and load the page again (the app does it on message okiePurge), once per server version.
  B.purge = function () { post('okiePurge'); };
  B.checkStale = function () {
    var run = window.OkieMotor && window.OkieMotor.version; if (!run || B.checking) return;
    B.checking = true;
    fetch('/hemma_scripts/okie-version.json?t=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
      B.checking = false;
      if (!j || !j.version || j.version === run) return;
      var tried = ''; try { tried = localStorage.getItem('okieStaleTried') || ''; } catch (e) { /* none */ }
      if (tried === j.version) return;                         // cleared once for this version already: no loop if it did not help
      try { localStorage.setItem('okieStaleTried', j.version); } catch (e) { /* none */ }
      post('okiePurge', j.version);
    }).catch(function () { B.checking = false; });
  };
  [4000, 15000].forEach(function (ms) { setTimeout(B.checkStale, ms); });
  document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(B.checkStale, 1500); });
  // Pull the whole screen down from the top to refresh (the app clears its copy of the card and loads the page again, see okiePurge). It is done here from the touch events, which still arrive when a page script
  // cancels the scrolling: a single finger that starts in the top third, not in a list, a dial, a slider or a field, and goes down far enough more than sideways.
  (function () {
    var PULL = 120, st = null, ind = null, icon = null;
    function blocked(e) {
      var p = e.composedPath ? e.composedPath() : [];
      for (var i = 0; i < p.length; i++) {
        var n = p[i]; if (!n || n.nodeType !== 1) continue;
        var tag = n.tagName; if (/^(INPUT|TEXTAREA|SELECT|CANVAS|VIDEO|IFRAME)$/.test(tag)) return true;
        var cs = getComputedStyle(n);
        if (cs.touchAction === 'none') return true;                      // dials, sliders, drag handles
        var sc = function (o) { return o === 'auto' || o === 'scroll' || o === 'overlay'; };
        if ((sc(cs.overflowY) && n.scrollHeight > n.clientHeight + 1) || (sc(cs.overflowX) && n.scrollWidth > n.clientWidth + 1)) return true;      // a list: it scrolls
      }
      return false;
    }
    function build() {
      if (ind) return;
      ind = document.createElement('div');
      ind.setAttribute('style', 'position:fixed;left:50%;top:0;width:44px;height:44px;margin-left:-22px;border-radius:50%;background:rgba(255,255,255,.94);box-shadow:0 6px 20px rgba(0,0,0,.35);z-index:2147483647;pointer-events:none;display:none;align-items:center;justify-content:center;color:#1d1b19;');
      ind.innerHTML = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 5v5h-5M4 19v-5h5M5.6 9A7 7 0 0 1 19 8M18.4 15A7 7 0 0 1 5 16"/></svg>';
      icon = ind.firstChild; (document.body || document.documentElement).appendChild(ind);
    }
    function show(p) { build(); ind.style.display = 'flex'; ind.style.transform = 'translateY(' + (-50 + 130 * Math.min(1, p)) + 'px)'; ind.style.opacity = String(Math.min(1, p * 1.4)); icon.style.transform = 'rotate(' + (p * 300) + 'deg)'; }
    function hide() { if (ind) ind.style.display = 'none'; }
    document.addEventListener('touchstart', function (e) {
      st = null; if (e.touches.length !== 1 || B.armed) return;
      var t = e.touches[0]; if (t.clientY > window.innerHeight * 0.35 || blocked(e)) return;
      st = { x: t.clientX, y: t.clientY, p: 0 };
    }, { capture: true, passive: true });
    document.addEventListener('touchmove', function (e) {
      if (!st) return;
      var t = e.touches[0], dy = t.clientY - st.y, dx = Math.abs(t.clientX - st.x);
      if (dy < 12 || dx > dy * 0.7) { if (st.p) hide(); st.p = 0; if (dx > 30 && dx > dy) st = null; return; }
      st.p = dy / PULL; show(st.p);
    }, { capture: true, passive: true });
    function finish() {
      var go = st && st.p >= 1; st = null;
      if (!go) { hide(); return; }
      ind.style.transition = 'transform .2s'; icon.style.transition = 'transform .6s linear'; icon.style.transform = 'rotate(720deg)';
      post('okiePurge', 'pull');
      setTimeout(hide, 4000);
    }
    document.addEventListener('touchend', finish, { capture: true, passive: true });
    document.addEventListener('touchcancel', function () { st = null; hide(); }, { capture: true, passive: true });
  })();
  document.addEventListener('click', function (e) {
    if (!B.armed) return;
    var p = e.composedPath ? e.composedPath() : [];
    for (var i = 0; i < p.length; i++) {
      var b = p[i];
      if (b && b.classList && b.classList.contains('dt-circ') && b.parentNode && b.parentNode.classList && b.parentNode.classList.contains('dt-top') && b === b.parentNode.firstElementChild) {
        var on = deep('.dt-tab.on'), tab = on && on.dataset && on.dataset.tab;
        if (tab && tab !== 'controls') {                        // inside another page: back to the main thermostat page first
          var c = deep('.dt-tab[data-tab="controls"]');
          if (c) { e.stopImmediatePropagation(); e.preventDefault(); c.click(); return; }
        }
        B.armed = false;
        B.fullscreen(false);
        post('okieHome');
        return;
      }
    }
  }, true);
})();

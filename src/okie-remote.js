/* okie-remote: the TV remote of a device screen, drawn after the "Smart TV Remote" concept (dark, soft, one colour).
 *
 *   var r = OkieMotor.remote.create(ctx, item, { send(key), svc(domain, service, data), keys }) -> { el, update(), dispose() }
 *
 * Top: power, the name pill with the connection dot and a gear (every other key sits behind it), back / home / the * key.
 * The dial: turn the ring for the volume (the blue arc, fine at the bottom and faster the further round it goes), tap the
 * four sides of the disc for the arrows, tap the middle for OK. Below it: rewind / play-pause / fast-forward. Favourites:
 * the streaming apps as vector tiles, the slider icon edits them.
 * Everything is drawn with CSS and SVG against a 560 wide design; one unit scales with the width of the column.
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;

  core.registerStrings('en', {
    'rx.favs': 'Favourites', 'rx.inputs': 'Inputs', 'rx.edit_favs': 'Edit favourites', 'rx.voice': 'Voice', 'rx.vol': 'Volume', 'rx.ok': 'OK (select)', 'rx.playpause': 'Play / pause',
    'rx.no_app': '{app} is not on this TV', 'rx.up': 'Move up', 'rx.down': 'Move down', 'rx.show': 'Show', 'rx.power': 'Power',
  });
  core.registerStrings('de', {
    'rx.favs': 'Favoriten', 'rx.inputs': 'Eingänge', 'rx.edit_favs': 'Favoriten bearbeiten', 'rx.voice': 'Sprache', 'rx.vol': 'Lautstärke', 'rx.ok': 'OK (auswählen)', 'rx.playpause': 'Wiedergabe / Pause',
    'rx.no_app': '{app} ist nicht auf diesem Fernseher', 'rx.up': 'Nach oben', 'rx.down': 'Nach unten', 'rx.show': 'Anzeigen', 'rx.power': 'Ein/Aus',
  });

  // the apps of the favourites, with the name Roku and Samsung give them in the source list and (Samsung) the app id for a direct start
  var APPS = [
    { id: 'netflix', label: 'Netflix', re: /netflix/i, tizen: '11101200001' },
    { id: 'prime', label: 'Prime Video', re: /prime|amazon/i, tizen: '3201512006785' },
    { id: 'disney', label: 'Disney+', re: /disney/i, tizen: '3201901017640' },
    { id: 'spotify', label: 'Spotify', re: /spotify/i, tizen: '3201606009684' },
    { id: 'youtube', label: 'YouTube', re: /youtube/i, tizen: '111299001912' },
    { id: 'bbc', label: 'BBC iPlayer', re: /bbc|iplayer/i },
    { id: 'chrome', label: 'Browser', re: /chrome|browser|internet/i },
    { id: 'play', label: 'Google Play', re: /play\s*(store)?\b|google play/i },
  ];
  var A_BY = {}; APPS.forEach(function (a) { A_BY[a.id] = a; });
  var DEFAULT_FAVS = APPS.map(function (a) { return a.id; });

  var ARC0 = -138, ARC1 = 138;      // the volume scale runs over 276 degrees, the gap sits at the bottom
  var R_OUT = 214, R_BAND = 180, W_BAND = 56, R_DISC = 152, R_DOT = 115;
  var VOL_K = 2.2;      // the scale is a curve, not a line: fine steps turning it from the bottom, faster per degree the further round it goes

  function pt(r, deg) { var a = deg * Math.PI / 180; return [r * Math.sin(a), -r * Math.cos(a)]; }
  function arcPath(r, a0, a1) { var p0 = pt(r, a0), p1 = pt(r, a1); return 'M' + p0[0].toFixed(2) + ' ' + p0[1].toFixed(2) + 'A' + r + ' ' + r + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + p1[0].toFixed(2) + ' ' + p1[1].toFixed(2); }
  var STOPS = [[0, [15, 57, 71]], [.5, [8, 104, 138]], [1, [0, 168, 230]]];      // dark teal at the start of the scale, the clear blue at the end of the arc
  function mix(t) {
    var i = t < .5 ? 0 : 1, a = STOPS[i], b = STOPS[i + 1], k = (t - a[0]) / (b[0] - a[0]);
    return 'rgb(' + [0, 1, 2].map(function (c) { return Math.round(a[1][c] + (b[1][c] - a[1][c]) * k); }).join(',') + ')';
  }
  function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  function pctOfAngle(deg) { var af = clamp01((deg - ARC0) / (ARC1 - ARC0)); return Math.round(100 * Math.pow(af, VOL_K)); }
  function angleFracOfPct(pc) { return Math.pow(clamp01(pc / 100), 1 / VOL_K); }

  var ICON = {
    back: '<path d="M20 12H5M11 5.5 4.5 12 11 18.5"/>',
    home: '<path d="M3 11.2 12 3.5l9 7.7M5.2 9.6V20.5h13.6V9.6"/><path d="M9.8 20.5v-5.2h4.4v5.2"/>',
    options: '<circle cx="5" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="2" fill="currentColor" stroke="none"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
    power: '<path d="M12 3.5v8.2"/><path d="M7.2 6.6a7.4 7.4 0 1 0 9.6 0"/>',
    play: '<path d="M8 5l11 7-11 7z" fill="currentColor" stroke="none"/>',
    pause: '<rect x="7" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="13" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
    playpause: '<path d="M3 5v14l9-7z" fill="currentColor" stroke="none"/><rect x="14.5" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="19" y="5" width="3" height="14" rx="1" fill="currentColor" stroke="none"/>',
    rew: '<path d="M20 5v14l-9-7z" fill="currentColor" stroke="none"/><path d="M11 5v14l-9-7z" fill="currentColor" stroke="none"/>',
    ff: '<path d="M4 5v14l9-7z" fill="currentColor" stroke="none"/><path d="M13 5v14l9-7z" fill="currentColor" stroke="none"/>',
    sliders: '<path d="M8 3.5v9.1M8 17.4v3.1M16 3.5v3.1M16 11.4v9.1"/><circle cx="8" cy="15" r="2.4"/><circle cx="16" cy="9" r="2.4"/>',
  };
  function ico(name, size, stroke, w) { return '<svg viewBox="0 0 24 24" width="' + size + '" height="' + size + '" fill="none" stroke="' + stroke + '" stroke-width="' + (w || 1.6) + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICON[name] + '</svg>'; }

  function create(ctx, item, hooks) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var stop = [], heldUntil = 0, vol = 0, volSent = -1, volTimer = 0, rep = 0, repTimer = 0, dragging = false;
    var uid = 'rx' + Math.random().toString(36).slice(2, 7);

    function attrs() { var s = ctx.state(item.id); return (s && s.attributes) || {}; }
    function tvOff() { var st = (ctx.state(item.id) || {}).state; return !st || st === 'off' || st === 'unavailable'; }   // a standby TV refuses volume commands
    function canSet() { return !!((attrs().supported_features || 0) & 4); }

    // ---- top: power, the name pill with the microphone
    var pw = h('button.rx-b.rx-pw', { type: 'button', 'aria-label': t('rx.power'), html: ico('power', 40, 'currentColor', 1.7), onclick: function () { ctx.haptic(10); var s = (ctx.state(item.id) || {}).state; hooks.svc('media_player', s === 'off' ? 'turn_on' : 'turn_off', {}); } });
    var dot = h('span.rx-dot'), nm = h('span.rx-nm', null, item.name);
    var mic = h('button.rx-b.rx-gear', { type: 'button', 'aria-label': t('rx.voice'), title: t('rx.voice'), html: ico('mic', 30, 'rgba(255,255,255,.78)', 1.5), onclick: function () { ctx.haptic(8); if (ctx.voice) ctx.voice(); } });
    var pill = h('div.rx-pill', null, dot, nm, mic);
    var top = h('div.rx-top', null, pw, pill);

    // ---- back / home / Options
    function nav(cls, label, icon, size, fn) { var b = h('button.rx-b.' + cls, { type: 'button', 'aria-label': label, title: label, html: ico(icon, size, 'rgba(255,255,255,.78)', 1.4), onclick: function () { ctx.haptic(8); fn(); } }); b.setIcon = function (name) { b.innerHTML = ico(name, size, 'rgba(255,255,255,.78)', 1.4); }; return b; }
    var navRow = h('div.rx-nav', null,
      nav('rx-sm', core.t('d.rk.back', ctx.lang()), 'back', 40, function () { hooks.send('back'); }),
      nav('rx-lg', core.t('d.rk.home', ctx.lang()), 'home', 56, function () { hooks.send('home'); }),
      nav('rx-sm', core.t('d.rk.menu', ctx.lang()), 'options', 32, function () { hooks.send('menu'); }));

    // ---- transport: rewind / play-pause / fast-forward, between the dial and the favourites; a smaller echo of the row above
    var rewBtn = nav('rx-sm', core.t('d.rk.rew', ctx.lang()), 'rew', 40, function () { hooks.send('rew'); });
    var playBtn = nav('rx-md', t('rx.playpause'), 'playpause', 46, function () { hooks.send('play'); });
    var ffBtn = nav('rx-sm', core.t('d.rk.ff', ctx.lang()), 'ff', 40, function () { hooks.send('ff'); });
    var transRow = h('div.rx-nav.rx-trans', null, rewBtn, playBtn, ffBtn);

    // ---- the dial
    var arcG = '', dots = '';
    [[0, -1], [0, 1], [-1, 0], [1, 0]].forEach(function (d, i) { dots += '<circle class="rx-dt" data-k="' + ['up', 'down', 'left', 'right'][i] + '" cx="' + d[0] * R_DOT + '" cy="' + d[1] * R_DOT + '" r="3.6"/>'; });
    var dialSvg = '<svg class="rx-dialsvg" viewBox="-280 -240 560 500" width="100%" role="group" aria-label="' + t('rx.vol') + '">' +
      '<defs>' +
      '<filter id="' + uid + 'a" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="10" dy="14" stdDeviation="15" flood-color="#000" flood-opacity=".3"/><feDropShadow dx="-6" dy="-8" stdDeviation="12" flood-color="#fff" flood-opacity=".08"/></filter>' +
      '<filter id="' + uid + 'b" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="5" dy="7" stdDeviation="7" flood-color="#000" flood-opacity=".35"/></filter>' +
      '<linearGradient id="' + uid + 'c" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#29ac26"/><stop offset="1" stop-color="#1f2124"/></linearGradient>' +
      '<linearGradient id="' + uid + 'd" x1=".15" y1="0" x2=".85" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset="1" stop-color="#fff" stop-opacity=".06"/></linearGradient>' +
      '<linearGradient id="' + uid + 'e" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#b8afa8"/><stop offset="1" stop-color="#8d857f"/></linearGradient>' +
      '<radialGradient id="' + uid + 'f" cx=".5" cy=".5" r=".5"><stop offset=".86" stop-color="#000" stop-opacity=".26"/><stop offset="1" stop-color="#000" stop-opacity=".1"/></radialGradient>' +
      '</defs>' +
      '<circle r="' + R_OUT + '" fill="rgba(255,255,255,.03)" stroke="rgba(255,255,255,.2)" stroke-width="1.6"/>' +
      '<circle r="' + R_BAND + '" fill="none" stroke="rgba(0,0,0,.2)" stroke-width="' + W_BAND + '"/>' +
      '<g class="rx-arc"></g><circle class="rx-end" r="5" fill="#00a5e0"/>' +
      '<circle r="' + R_DISC + '" fill="url(#' + uid + 'd)" filter="url(#' + uid + 'a)"/>' +
      '<circle r="' + (R_DISC - 1) + '" fill="none" stroke="#fff" stroke-width="1.2" opacity=".28"/>' +
      dots +
      '<circle r="63" fill="url(#' + uid + 'f)"/>' +
      '<g class="rx-mid"><circle r="50" fill="url(#' + uid + 'e)" filter="url(#' + uid + 'b)"/><circle r="49" fill="none" stroke="#cfc6bf" stroke-opacity=".45" stroke-width="1"/>' +
      '<circle r="10" fill="#2b2b2b"/></g>' +
      '<g class="rx-sc" fill="rgba(255,255,255,.45)" font-size="23" text-anchor="middle"><circle cx="-160" cy="179" r="3.4"/><circle cx="160" cy="179" r="3.4"/><text x="-168" y="217">0</text><text x="170" y="224">100</text></g></svg>';
    var dial = h('div.rx-dial', { html: dialSvg });
    var svgEl = dial.firstChild, arcEl = svgEl.querySelector('.rx-arc'), endEl = svgEl.querySelector('.rx-end'), midEl = svgEl.querySelector('.rx-mid');
    function drawArc(pc) {
      var a1 = ARC0 + (ARC1 - ARC0) * angleFracOfPct(pc), n = Math.max(1, Math.ceil(pc * 1.6)), out = '';
      for (var i = 0; i < n; i++) {
        var s0 = ARC0 + (a1 - ARC0) * i / n, s1 = ARC0 + (a1 - ARC0) * (i + 1) / n + (i < n - 1 ? 0.8 : 0);
        out += '<path d="' + arcPath(R_BAND, s0, s1) + '" fill="none" stroke="' + mix((i + 1) / n) + '" stroke-width="' + W_BAND + '"/>';
      }
      arcEl.innerHTML = pc > 0 ? out : '';
      var e = pt(R_OUT + 2, a1); endEl.setAttribute('cx', e[0].toFixed(2)); endEl.setAttribute('cy', e[1].toFixed(2));
      endEl.style.display = pc > 0 ? '' : 'none';
    }
    function setVol(pc, silent) { vol = Math.max(0, Math.min(100, pc)); drawArc(vol); if (!silent) pw.dataset.v = vol; }

    function local(e) {                                               // pointer -> design units around the dial's centre
      var r = svgEl.getBoundingClientRect(), k = 560 / Math.max(1, r.width);
      var x = (e.clientX - r.left) * k - 280, y = (e.clientY - r.top) * k - 240;
      return { x: x, y: y, r: Math.hypot(x, y), a: Math.atan2(x, -y) * 180 / Math.PI };
    }
    function pushVol(pc) {
      if (tvOff()) return;
      if (canSet()) {
        if (volTimer) return;
        volTimer = setTimeout(function () { volTimer = 0; if (volSent === vol) return; volSent = vol; hooks.svc('media_player', 'volume_set', { volume_level: vol / 100 }); }, 160);
      } else {                                                       // a TV that only knows the volume keys: one key per two percent
        var step = function () { var cur = volSent < 0 ? Math.round((attrs().volume_level || 0) * 100) : volSent; if (Math.abs(vol - cur) < 2) return false; hooks.send(vol > cur ? 'vup' : 'vdown'); volSent = cur + (vol > cur ? 2 : -2); return true; };
        if (rep) return;
        rep = setInterval(function () { if (!step()) { clearInterval(rep); rep = 0; } }, 120);
      }
    }
    var press = null;
    function startKey(k) { hooks.send(k); clearTimeout(repTimer); clearInterval(repTimer); repTimer = setTimeout(function () { repTimer = setInterval(function () { hooks.send(k); }, 140); }, 450); }
    function endPress() {
      clearTimeout(repTimer); clearInterval(repTimer); repTimer = 0;
      if (press && press.dot) press.dot.classList.remove('on');
      midEl.classList.remove('on');
      press = null; dragging = false;
    }
    svgEl.addEventListener('pointerdown', function (e) {
      if (e.button) return;
      var p = local(e); e.preventDefault();
      try { svgEl.setPointerCapture(e.pointerId); } catch (er) { /* the move still arrives */ }
      if (p.r > R_DISC + 2 && p.r < R_OUT + 26) { if (tvOff()) { ctx.haptic(6); return; } dragging = true; press = { vol: true }; ctx.haptic(6); setVol(pctOfAngle(p.a), true); volSent = -2; pushVol(); return; }
      if (p.r <= 62) { press = { mid: true }; midEl.classList.add('on'); ctx.haptic(10); hooks.send('ok'); return; }
      if (p.r <= R_DISC) {
        var k = Math.abs(p.a) < 45 ? 'up' : Math.abs(p.a) > 135 ? 'down' : p.a < 0 ? 'left' : 'right';
        var d = svgEl.querySelector('.rx-dt[data-k="' + k + '"]'); if (d) d.classList.add('on');
        press = { dot: d }; ctx.haptic(6); startKey(k);
      }
    });
    svgEl.addEventListener('pointermove', function (e) { if (!dragging) return; var p = local(e); setVol(pctOfAngle(p.a), true); heldUntil = Date.now() + 1500; pushVol(); });
    svgEl.addEventListener('pointerup', function () { if (dragging) heldUntil = Date.now() + 1500; endPress(); });
    svgEl.addEventListener('pointercancel', endPress);
    svgEl.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    stop.push(function () { endPress(); clearTimeout(volTimer); clearInterval(rep); });

    // ---- favourites
    var favTitle = h('div.rx-ft', null, t('rx.favs')), edit = h('button.rx-ed', { type: 'button', 'aria-label': t('rx.edit_favs'), title: t('rx.edit_favs'), html: ico('sliders', 26, 'rgba(255,255,255,.55)', 1.5), onclick: function () { openEditor(); } });
    var grid = h('div.rx-pgs'), pdots = h('div.rx-pd', { 'aria-hidden': 'true' }), favCard = h('div.rx-fav', null, favTitle, edit, grid, pdots);
    function favIds() { var m = (ctx.settings.get().tvApps || {})[item.id]; return Array.isArray(m) ? m.filter(function (id) { return A_BY[id]; }) : DEFAULT_FAVS.slice(); }
    function launch(app) {
      ctx.haptic(10);
      var list = attrs().source_list || [], src = list.filter(function (x) { return app.re.test(String(x)); })[0];
      if (src) { hooks.svc('media_player', 'select_source', { source: src }); return; }
      if (app.tizen) { hooks.svc('media_player', 'play_media', { media_content_type: 'app', media_content_id: app.tizen }); return; }
      ctx.toast('error', t('rx.no_app', { app: app.label }));
    }
    var srcSig = '';
    function srcList() { return (attrs().source_list || []).map(String).filter(function (x) { return !APPS.some(function (a) { return a.re.test(x); }); }); }
    function paintSrc() { var cur = String(attrs().source || ''); Array.prototype.forEach.call(grid.querySelectorAll('.rx-src'), function (b) { b.classList.toggle('on', b.dataset.s === cur); }); }
    function drawFavs() {                                                // eight tiles to a page (four by two), swipe sideways for more, dots show the page
      var tiles = [], apps = 0;
      favIds().forEach(function (id) { var a = A_BY[id]; tiles.push(h('button.rx-app', { type: 'button', 'aria-label': a.label, title: a.label, html: g.OkieMotor.tvlogos.svg(id), onclick: function () { launch(a); } })); });
      apps = tiles.length; srcSig = srcList().join('|');
      srcList().forEach(function (sname) { tiles.push(h('button.rx-app.rx-src', { type: 'button', 'aria-label': sname, title: sname, dataset: { s: sname }, onclick: function () { ctx.haptic(8); hooks.svc('media_player', 'select_source', { source: sname }); } }, h('span', null, sname))); });      // the TV's own sources (TV, HDMI ...) follow the apps
      grid.innerHTML = '';
      [[0, apps, 'f'], [apps, tiles.length, 'i']].forEach(function (r) { for (var k = r[0]; k < r[1]; k += 8) { var pg = h('div.rx-pg', { dataset: { kind: r[2] } }); tiles.slice(k, Math.min(k + 8, r[1])).forEach(function (t) { pg.appendChild(t); }); grid.appendChild(pg); } });
      pdots.innerHTML = ''; pdots.hidden = grid.children.length < 2;
      Array.prototype.forEach.call(grid.children, function (_, n) { pdots.appendChild(h('i', { onclick: function () { grid.scrollTo({ left: n * grid.clientWidth, behavior: 'smooth' }); } })); });
      pageDot(); paintSrc();
      favCard.dataset.empty = tiles.length ? '' : '1';
    }
    function pageDot() { var n = Math.round(grid.scrollLeft / Math.max(1, grid.clientWidth)), pg = grid.children[n]; favTitle.textContent = pg && pg.dataset.kind === 'i' ? t('rx.inputs') : t('rx.favs'); Array.prototype.forEach.call(pdots.children, function (d, i) { d.classList.toggle('on', i === n); }); }
    grid.addEventListener('scroll', pageDot, { passive: true });
    function saveFavs(ids) { var m = {}; m[item.id] = ids; ctx.settings.set({ tvApps: m }); drawFavs(); }
    function openEditor() {
      var box = h('div.rx-edbox');
      function draw() {
        box.innerHTML = '';
        var on = favIds(), rest = APPS.filter(function (a) { return on.indexOf(a.id) < 0; }).map(function (a) { return a.id; });
        on.concat(rest).forEach(function (id, i) {
          var a = A_BY[id], isOn = on.indexOf(id) >= 0;
          var row = h('div.rx-er' + (isOn ? '.on' : ''), null,
            h('span.rx-et', { html: g.OkieMotor.tvlogos.svg(id, .55) }), h('span.rx-en', null, a.label),
            isOn && i > 0 ? h('button', { type: 'button', 'aria-label': t('rx.up'), onclick: function () { var x = on.slice(); x.splice(i, 1); x.splice(i - 1, 0, id); saveFavs(x); draw(); }, html: '▲' }) : h('span.sp'),
            isOn && i < on.length - 1 ? h('button', { type: 'button', 'aria-label': t('rx.down'), onclick: function () { var x = on.slice(); x.splice(i, 1); x.splice(i + 1, 0, id); saveFavs(x); draw(); }, html: '▼' }) : h('span.sp'),
            h('button.sw' + (isOn ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': isOn ? 'true' : 'false', 'aria-label': t('rx.show') + ' ' + a.label, onclick: function () { saveFavs(isOn ? on.filter(function (x) { return x !== id; }) : on.concat(id)); draw(); } }, h('i')));
          box.appendChild(row);
        });
      }
      draw();
      ctx.sheet({ title: t('rx.edit_favs'), content: function () { return box; } });
    }

    var el = h('div.rmx', null, h('div.rx', null, top, navRow, dial, transRow, favCard));
    drawFavs(); setVol(0);
    function fit() {                                                  // scale the remote to the scroller's real height: down so it never needs to scroll, up so it never leaves the bottom of the card empty
      var sc = el.closest && el.closest('.okie-scroll'); if (!sc || !el.isConnected) return;
      el.style.width = ''; el.style.margin = ''; favCard.style.marginTop = ''; sc.scrollTop = 0;
      var W = el.parentElement ? el.parentElement.clientWidth : sc.clientWidth;
      if (!W || sc.clientHeight < 160) return;
      el.style.width = W + 'px';
      for (var i = 0; i < 5; i++) {                                  // target the scroller's own overflow (not a guessed margin), the width-to-height scaling isn't perfectly linear so a few passes close the gap
        var over = sc.scrollHeight - sc.clientHeight; if (over <= 0) break;
        var hh = el.offsetHeight, w = parseFloat(el.style.width) || W;
        var target = Math.max(120, hh - over - 1);                   // shave off exactly the overflow, plus a point of slack
        el.style.width = Math.max(120, Math.floor(w * target / hh)) + 'px';
      }
      for (var j = 0; j < 6; j++) {                                  // the shrink above is conservative (a point per pass); grow back in small steps to use all of what's actually free (on a tall narrow column this is how it reaches down the card, not just across it)
        var w2 = parseFloat(el.style.width); if (w2 >= W) break;
        el.style.width = Math.min(W, w2 + 4) + 'px';
        if (sc.scrollHeight > sc.clientHeight) { el.style.width = w2 + 'px'; break; }
      }
      if (parseFloat(el.style.width) < W) el.style.margin = '0 auto';
      // push the favourites card down to the bottom of the card: grow its own top margin directly and measure the real overflow after
      // each step, the same way the width above converges. CSS tricks for this (percentage min-height, flex auto-margins) turned out to
      // be silently inert in this exact layout on iOS WebKit, so this does the equivalent by hand with numbers the browser just reported.
      // scrollHeight can never read BELOW clientHeight (it floors there even while under-filling), so a shrink-down-from-overshoot
      // loop can land short and wrongly read "no overflow" too early. Growing in small steps only ever has to detect real
      // overflow, which scrollHeight always reports honestly, so it reliably finds the exact edge instead.
      favCard.style.marginTop = '0px';
      for (var k = 0; k < 150; k++) {
        var mtCur = parseFloat(favCard.style.marginTop) || 0;
        favCard.style.marginTop = (mtCur + 6) + 'px';
        if (sc.scrollHeight > sc.clientHeight) { favCard.style.marginTop = mtCur + 'px'; break; }
      }
    }
    var fitTimer = setTimeout(fit, 0), ro = null;
    stop.push(function () { clearTimeout(fitTimer); if (ro) ro.disconnect(); });
    function watch() { var sc = el.closest && el.closest('.okie-scroll'); if (!sc) { fitTimer = setTimeout(watch, 120); return; } fit(); if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(fit); ro.observe(sc); } }
    fitTimer = setTimeout(watch, 60);

    return {
      el: el,
      dispose: function () { stop.forEach(function (f) { try { f(); } catch (e) { /* gone already */ } }); stop = []; },
      update: function () {
        var s = ctx.state(item.id) || {}, a = s.attributes || {}, on = s.state && s.state !== 'off' && s.state !== 'unavailable', gone = s.state === 'unavailable';
        pw.classList.toggle('on', !!on); dot.classList.toggle('gone', !!gone); dot.classList.toggle('off', !on && !gone);
        nm.textContent = item.name;
        paintPlay();
        if (srcList().join('|') !== srcSig) drawFavs(); else paintSrc();
        el.classList.toggle('gone', !!gone); dial.classList.toggle('tvoff', !on);
        if (!dragging && Date.now() > heldUntil && a.volume_level != null) { setVol(Math.round(a.volume_level * 100), true); volSent = -1; }
      },
    };
  }

  // ---- the look: 1 unit = 1 / 560 of the column, like the concept's width
  function u(n) { return 'calc(' + n + ' * var(--u))'; }
  var CSS = [
    '.rmx{container-type:inline-size;width:100%;box-sizing:border-box;background:none;color:rgba(255,255,255,.7);font-family:Poppins,"Avenir Next","Helvetica Neue",system-ui,sans-serif;}',
    '.rx{--u:.6px;--u:min(calc(100cqw / 560), 1.1px);max-width:calc(560 * 1.1px);margin:0 auto;padding:' + u(14) + ' 0 0;display:flex;flex-direction:column;align-items:stretch;}',
    '.rmx.gone{opacity:.55;}',
        '.rx-b{-webkit-appearance:none;appearance:none;border:1px solid rgba(255,255,255,.13);padding:0;margin:0;display:grid;place-items:center;flex:none;border-radius:50%;background:linear-gradient(150deg,rgba(255,255,255,.17),rgba(255,255,255,.05));-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);color:rgba(255,255,255,.78);cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;box-shadow:0 ' + u(6) + ' ' + u(16) + ' rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.22);transition:box-shadow .12s ease,transform .12s ease;}',
        '.rx-b:active{transform:scale(.96);box-shadow:0 ' + u(2) + ' ' + u(6) + ' rgba(0,0,0,.3),inset 0 1px 6px rgba(0,0,0,.25);}',
    '.rx-b:focus-visible,.rx-app:focus-visible,.rx-ed:focus-visible{outline:2px solid #00a5e0;outline-offset:2px;}',
    '.rx-top{display:flex;align-items:center;gap:' + u(28) + ';padding:0 ' + u(38) + ' 0 ' + u(47) + ';}',
    '.rx-pw{width:' + u(94) + ';height:' + u(94) + ';color:rgba(255,255,255,.5);}.rx-pw.on{color:#2aa4ec;}.rx-pw svg{width:' + u(40) + ';height:' + u(40) + ';}',
        '.rx-pill{flex:1;min-width:0;height:' + u(94) + ';border-radius:' + u(47) + ';display:flex;align-items:center;gap:' + u(14) + ';padding:0 ' + u(18) + ' 0 ' + u(26) + ';border:1px solid rgba(255,255,255,.12);background:linear-gradient(150deg,rgba(255,255,255,.14),rgba(255,255,255,.04));-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);box-shadow:0 ' + u(6) + ' ' + u(16) + ' rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.2);}',
    '.rx-dot{width:' + u(9) + ';height:' + u(9) + ';border-radius:50%;background:#2fbf63;flex:none;}.rx-dot.off{background:#c9a33f;}.rx-dot.gone{background:#8a3b36;}',
    '.rx-nm{flex:1;min-width:0;font-size:' + u(22) + ';line-height:1.2;letter-spacing:.01em;color:rgba(255,255,255,.82);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.rx-gear{width:' + u(62) + ';height:' + u(62) + ';}.rx-gear svg{width:' + u(30) + ';height:' + u(30) + ';}',
    '.rx-nav{display:flex;align-items:center;justify-content:center;gap:' + u(63) + ';margin-top:' + u(20) + ';}',
    '.rx-sm{width:' + u(82) + ';height:' + u(82) + ';}.rx-lg{width:' + u(116) + ';height:' + u(116) + ';}.rx-sm svg{width:' + u(40) + ';height:' + u(40) + ';}.rx-lg svg{width:' + u(56) + ';height:' + u(56) + ';}',
    '.rx-md{width:' + u(96) + ';height:' + u(96) + ';}.rx-md svg{width:' + u(46) + ';height:' + u(46) + ';}',
    '.rx-tsm{width:' + u(56) + ';height:' + u(56) + ';}.rx-tlg{width:' + u(78) + ';height:' + u(78) + ';}.rx-tsm svg{width:' + u(26) + ';height:' + u(26) + ';}.rx-tlg svg{width:' + u(36) + ';height:' + u(36) + ';}',
    '.rx-trans{gap:' + u(40) + ';margin-top:' + u(20) + ';}',
    '.rx-dial{margin-top:' + u(8) + ';touch-action:none;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}.rx-dial.tvoff .rx-arc,.rx-dial.tvoff .rx-end{opacity:.35;}.rx-dialsvg{display:block;overflow:visible;cursor:pointer;}',
    '.rx-dt{fill:rgba(255,255,255,.62);transition:fill .1s ease,r .1s ease;}.rx-dt.on{fill:#fff;}.rx-mid{transition:transform .12s ease;transform-origin:0 0;}.rx-mid.on{transform:scale(.94);}',
        '.rx-fav{position:relative;margin:' + u(20) + ' ' + u(40) + ' 0;padding:' + u(24) + ' ' + u(44) + ' ' + u(28) + ';border-radius:' + u(34) + ';border:1px solid rgba(255,255,255,.1);background:linear-gradient(160deg,rgba(255,255,255,.1),rgba(255,255,255,.03));-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:inset 0 1px 0 rgba(255,255,255,.18),0 ' + u(6) + ' ' + u(18) + ' rgba(0,0,0,.2);}',
    '.rx-ft{text-align:center;font-size:' + u(22) + ';color:rgba(255,255,255,.5);letter-spacing:.01em;line-height:' + u(30) + ';}',
    '.rx-ed{-webkit-appearance:none;appearance:none;border:0;background:none;position:absolute;right:' + u(30) + ';top:' + u(30) + ';width:' + u(44) + ';height:' + u(44) + ';display:grid;place-items:center;padding:0;cursor:pointer;border-radius:' + u(12) + ';}.rx-ed svg{width:' + u(26) + ';height:' + u(26) + ';}',
    '.rx-pgs{display:flex;overflow-x:auto;overflow-y:hidden;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:none;touch-action:pan-x pan-y;margin-top:' + u(20) + ';}.rx-pgs::-webkit-scrollbar{display:none;}',
    '.rx-pg{flex:0 0 100%;box-sizing:border-box;padding-right:2px;scroll-snap-align:start;display:grid;grid-template-columns:repeat(4,1fr);gap:' + u(22) + ';align-content:start;}',
    '.rx-pd{display:flex;justify-content:center;align-items:center;gap:' + u(14) + ';margin-top:' + u(22) + ';height:' + u(10) + ';}.rx-pd[hidden]{display:none;}.rx-pd i{width:' + u(10) + ';height:' + u(10) + ';border-radius:50%;background:rgba(255,255,255,.4);transition:background .2s,transform .2s;cursor:pointer;}.rx-pd i.on{background:#fff;transform:scale(1.15);}',
    '.rx-app{-webkit-appearance:none;appearance:none;border:0;padding:0;aspect-ratio:1;width:100%;border-radius:' + u(15) + ';display:grid;place-items:center;cursor:pointer;touch-action:manipulation;-webkit-tap-highlight-color:transparent;border:1px solid rgba(255,255,255,.1);background:linear-gradient(160deg,rgba(255,255,255,.16),rgba(255,255,255,.06));box-shadow:0 ' + u(4) + ' ' + u(10) + ' rgba(0,0,0,.24),inset 0 1px 0 rgba(255,255,255,.2);transition:transform .1s ease,filter .1s ease;}',
    '.rx-app:active{transform:scale(.95);filter:brightness(.85);}.rx-app svg{display:block;width:calc(var(--w) * var(--u));height:calc(var(--h) * var(--u));}',
    '.rx-fav[data-empty="1"] .rx-pgs,.rx-fav[data-empty="1"] .rx-pd{display:none;}',
    '.rx-src{font:inherit;color:rgba(255,255,255,.85);}.rx-src span{display:block;max-width:100%;padding:0 ' + u(6) + ';font-size:' + u(15) + ';font-weight:600;line-height:1.15;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.rx-src.on{border-color:rgba(255,255,255,.5);background:linear-gradient(160deg,rgba(255,255,255,.3),rgba(255,255,255,.12));color:#fff;}',
    // the sheets (keys, favourites)
    '.rx-edbox{display:flex;flex-direction:column;gap:8px;min-width:min(86vw,360px);padding:4px 2px 10px;}',
    '.rx-er{display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:14px;background:rgba(255,255,255,.06);color:#fff;}.rx-er:not(.on){opacity:.6;}.rx-et{width:46px;height:46px;border-radius:11px;background:#27292c;display:grid;place-items:center;flex:none;}.rx-en{flex:1;font-size:15px;font-weight:600;}.rx-er button:not(.sw){width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,.1);color:#fff;font-size:12px;}.rx-er .sp{width:34px;}',
    '.rx-et svg{width:calc(var(--w) * .55px);height:calc(var(--h) * .55px);}.rx-er .sw{width:46px;height:28px;border-radius:14px;background:rgba(255,255,255,.18);position:relative;flex:none;}.rx-er .sw i{position:absolute;top:3px;left:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .15s ease;}.rx-er .sw.on{background:#0a95cf;}.rx-er .sw.on i{transform:translateX(18px);}',
    '.rx-kg,.rx-sg{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}.rx-sg{grid-template-columns:repeat(2,1fr);}.rx-kb{min-height:44px;border-radius:14px;background:rgba(255,255,255,.1);color:#fff;font-size:14px;font-weight:600;padding:0 8px;}.rx-kb:active{background:rgba(255,255,255,.26);}.rx-sl{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.6);margin-top:8px;}',
  ].join('');

  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
  g.OkieMotor.remote = { create: create, APPS: APPS, pctOfAngle: pctOfAngle };
  if (typeof module !== 'undefined' && module.exports) module.exports = { pctOfAngle: pctOfAngle, APPS: APPS };
})(typeof globalThis !== 'undefined' ? globalThis : window);

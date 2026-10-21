/* okie-robomap: the robot vacuum's cleaning map drawn on OUR floor plan (the Home map), instead of the robot's own pictures.
 *
 * The Roomba+ integration serves what the robot cleaned as coordinates (GET /api/roomba_plus/<entry>/missions/latest/map.json: the cleaned cells in
 * millimetres, the outline of the cleaned area in metres, the places it got stuck, and - once iRobot's room layout has reached Home Assistant - the rooms
 * as polygons). Those coordinates live in the robot's own map frame, so they are moved onto the floor plan with a transform that is worked out ONCE per
 * robot map by laying the cleaned area over the floor of the plan (fitCoverage) and then remembered. The baked fit below is the one for the map
 * the robot has now; a new robot map is lined up the first time a whole-home clean has been seen on it.
 *
 * Everything in here is plan arithmetic (the floor plan's own upright coordinates, x 340-1120, y 90-1900) and is unit-tested; the screen part sits at
 * the bottom and is checked in the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // the walkable floor of the plan (the plan's own coordinates); the patio is outside
  var FLOOR = [[351, 625], [1065, 625], [1065, 1882], [462, 1882], [462, 1300], [351, 1300]];
  // the rooms the robot knows by name, as areas of that plan (used to tint a room by when it was last cleaned)
  var ROOMS = {
    'living room': [[351, 625], [1065, 625], [1065, 908], [815, 908], [815, 1163], [1065, 1163], [1065, 1290], [351, 1300]],
    'kitchen': [[815, 908], [1065, 908], [1065, 1163], [815, 1163]],
    'bedroom': [[462, 1300], [917, 1300], [917, 1882], [462, 1882]],
  };
  // robot map id -> how its metres land on the plan: a mirror of x, a turn in degrees, plan units per metre (across, and down if it differs) and where the robot's origin lands
  var BAKED = {
    'v2tcgLwmTcGPirig_FgbJw': { mir: 1, deg: 0, s: 110.46, sy: 113.55, tx: 767.9, ty: 876.6 },      // width and height fitted on their own: the cleaned area's edges land on the plan's outer walls and not over them
  };

  function inPoly(x, y, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var xi = poly[i][0], yi = poly[i][1], xj = poly[j][0], yj = poly[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  /** A robot position in metres -> plan units. `nudge` ({ dx, dy, rot, scale }) is the hand adjustment on top of the fit. */
  function toPlan(fit, x, y, nudge) {
    var th = fit.deg * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th), X = fit.mir ? -x : x;
    var sy = fit.sy || fit.s, px = fit.s * (c * X - sn * y) + fit.tx, py = sy * (sn * X + c * y) + fit.ty;      // (the plan is drawn a touch wider or taller than the metres: width and height may have their own scale)
    if (nudge && (nudge.dx || nudge.dy || nudge.rot || nudge.scale)) {
      var a = (nudge.rot || 0) * Math.PI / 180, k = 1 + (nudge.scale || 0) / 100, ox = fit.tx, oy = fit.ty, rx = px - ox, ry = py - oy;      // turn and scale around the robot's origin, then slide
      px = ox + k * (Math.cos(a) * rx - Math.sin(a) * ry) + (nudge.dx || 0); py = oy + k * (Math.sin(a) * rx + Math.cos(a) * ry) + (nudge.dy || 0);
    }
    return [px, py];
  }
  function fitFor(pmapId, saved) { return (saved && saved[pmapId]) || BAKED[pmapId] || null; }

  // ---- lining a new robot map up with the floor plan -------------------------------------------------------------
  var X0 = 300, Y0 = 560, grids = {};
  function gridOf(cell) {      // the floor of the plan as a raster of cells (a coarse one for the wide search, a fine one for the last steps)
    if (grids[cell]) return grids[cell];
    var G = { cell: cell, nx: Math.ceil((1120 - X0) / cell), ny: Math.ceil((1930 - Y0) / cell), nFloor: 0, gen: 0 };
    G.mask = new Uint8Array(G.nx * G.ny); G.seen = new Uint16Array(G.nx * G.ny);
    for (var j = 0; j < G.ny; j++) for (var i = 0; i < G.nx; i++) if (inPoly(X0 + (i + .5) * cell, Y0 + (j + .5) * cell, FLOOR)) { G.mask[j * G.nx + i] = 1; G.nFloor++; }
    return (grids[cell] = G);
  }
  /** How well the cleaned cells (metres) fill the floor when moved by (mir, deg, s, tx, ty): overlap of the two shapes. Points off the plan count against it. */
  function overlap(G, P, mir, deg, s, tx, ty, grow) {
    G.gen++; if (G.gen > 60000) { G.seen.fill(0); G.gen = 1; }
    var th = deg * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th), n = 0, inter = 0, out = 0, r = grow || 0, cell = G.cell, nx = G.nx, ny = G.ny, seen = G.seen, mask = G.mask, gen = G.gen;
    for (var p = 0; p < P.length; p++) {
      var x = mir ? -P[p][0] : P[p][0], y = P[p][1], px = s * (c * x - sn * y) + tx, py = s * (sn * x + c * y) + ty, ci = Math.floor((px - X0) / cell), cj = Math.floor((py - Y0) / cell);
      for (var a = -r; a <= r; a++) for (var b = -r; b <= r; b++) {
        var i = ci + a, j = cj + b;
        if (i < 0 || j < 0 || i >= nx || j >= ny) { out++; continue; }
        var k = j * nx + i; if (seen[k] !== gen) { seen[k] = gen; n++; if (mask[k]) inter++; }
      }
    }
    return { iou: inter / (n + G.nFloor - inter + out * 0.2), inside: n ? inter / n : 0 };
  }
  var tick = function () { return new Promise(function (r) { setTimeout(r, 0); }); };
  /**
   * Find the transform that lays the cleaned cells (metres) over the plan's floor: a search over mirror, turn, scale and shift, coarse then fine.
   * Needs a clean that covered a good part of the home (a few hundred cells at least). -> { mir, deg, s, tx, ty, iou, inside } or null when nothing fits well.
   */
  function fitCoverage(points, o) {
    o = o || {}; var COARSE = gridOf(12), FINE = gridOf(4);
    var pts = points.filter(function (p) { return isFinite(p[0]) && isFinite(p[1]); });
    if (pts.length < (o.min || 300)) return Promise.resolve(null);
    var stride = Math.max(1, Math.floor(pts.length / 700)), sub = pts.filter(function (_, i) { return i % stride === 0; });
    var cx = 0, cy = 0; pts.forEach(function (p) { cx += p[0]; cy += p[1]; }); cx /= pts.length; cy /= pts.length;
    var fcx = 0, fcy = 0; FLOOR.forEach(function (p) { fcx += p[0]; fcy += p[1]; }); fcx /= FLOOR.length; fcy /= FLOOR.length;
    var best = { iou: 0 }, turns = [0, 90, 180, 270], ti = 0;
    // a robot's map is straightened to its walls, so the four right angles are tried and only a degree or two of give is allowed afterwards (a twist would be a wrong fit)
    function coarse() {
      if (ti >= turns.length) return Promise.resolve();
      var deg = turns[ti++];
      for (var mir = 0; mir < 2; mir++) for (var s = 96; s <= 132; s += 3) {
        var th = deg * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th), mx = mir ? -cx : cx, bx = s * (c * mx - sn * cy), by = s * (sn * mx + c * cy);
        for (var dx = -120; dx <= 120; dx += 12) for (var dy = -120; dy <= 120; dy += 12) {
          var r = overlap(COARSE, sub, mir, deg, s, fcx - bx + dx, fcy - by + dy, 0);
          if (r.iou > best.iou) best = { iou: r.iou, mir: mir, deg: deg, s: s, tx: fcx - bx + dx, ty: fcy - by + dy };
        }
      }
      return tick().then(coarse);
    }
    return coarse().then(function () {
      var b = best, base = b.deg, steps = [[.8, .8, 6], [.4, .4, 3], [.2, .2, 1.5]];
      for (var rd = 0; rd < steps.length; rd++) {
        var st = steps[rd], nb = null;
        for (var dd = -4; dd <= 4; dd++) for (var ds = -4; ds <= 4; ds++) for (var dx = -4; dx <= 4; dx++) for (var dy = -4; dy <= 4; dy++) {
          var dg = b.deg + dd * st[0]; if (Math.abs(dg - base) > 1.5) continue;
          var s2 = b.s + ds * st[1] * 2, tx2 = b.tx + dx * st[2], ty2 = b.ty + dy * st[2], r2 = overlap(FINE, pts, b.mir, dg, s2, tx2, ty2, 2);
          if (!nb || r2.iou > nb.iou) nb = { iou: r2.iou, inside: r2.inside, mir: b.mir, deg: dg, s: s2, tx: tx2, ty: ty2 };
        }
        b = nb;
      }
      return b.iou >= (o.minIou || 0.35) && b.inside >= 0.85 ? { mir: b.mir, deg: ((b.deg % 360) + 360) % 360, s: b.s, tx: b.tx, ty: b.ty, iou: b.iou, inside: b.inside } : null;
    });
  }

  // ---- the layer drawn over the plan -----------------------------------------------------------------------------
  function f1(n) { return (Math.round(n * 10) / 10); }
  function ringPath(ring, fit, nudge) {
    return ring.map(function (p, i) { var q = toPlan(fit, p[0], p[1], nudge); return (i ? 'L' : 'M') + f1(q[0]) + ' ' + f1(q[1]); }).join('') + 'Z';
  }
  /** The cleaned area: the outline of the last clean (and the holes in it) as one filled shape on the plan. */
  function ringsOf(shape) {      // the outline arrives as polygons made of rings (the first is the edge, the others are holes); a bare ring or list of rings works too
    var rings = [];
    (function walk(a) { if (!Array.isArray(a) || !a.length) return; if (typeof a[0][0] === 'number') rings.push(a); else a.forEach(walk); })(shape);
    return rings;
  }
  function cleanedPath(shape, fit, nudge) { return ringsOf(shape).filter(function (r) { return r.length > 2; }).map(function (r) { return ringPath(r, fit, nudge); }).join(''); }
  /** Where the robot got stuck or its brush stalled, on the plan: [{ x, y, event }]. */
  function stuckSpots(events, fit, nudge) {
    return (events || []).filter(function (e) { return e && e.pose && isFinite(e.pose[0]) && isFinite(e.pose[1]); }).map(function (e) {
      var q = toPlan(fit, e.pose[0], e.pose[1], nudge); return { x: f1(q[0]), y: f1(q[1]), event: String(e.event || '') };
    });
  }
  /** How each known room was last cleaned: 'fresh' (a day), 'old', or 'unknown' -> { 'bedroom': 'fresh', ... } keyed by lower-case room name. */
  function roomStates(history, now) {
    var out = {}; history = history || {};
    Object.keys(history).forEach(function (n) {
      var t = Date.parse(history[n]); if (isNaN(t)) return;
      out[String(n).toLowerCase()] = now - t < 86400000 ? 'fresh' : 'old';
    });
    return out;
  }
  /**
   * The SVG that goes into the plan (its own upright coordinates).
   *   data    the map.json payload   fit  how it lands   layers  { area, stuck, rooms }   o  { nudge, history, now }
   * Rooms the robot knows by name get a faint tint (green: cleaned within a day), the cleaned area is a soft blue shape, stuck spots are amber dots.
   */
  function overlaySvg(data, fit, layers, o) {
    o = o || {}; layers = layers || { area: true, stuck: true, rooms: true };
    var s = '<g class="rm-ovl" pointer-events="none">';
    if (layers.rooms) {
      var apiRooms = data && data.rooms && Object.keys(data.rooms).length;
      if (apiRooms) Object.keys(data.rooms).forEach(function (n) { s += '<path class="rm-room" d="' + ringPath(data.rooms[n], fit, o.nudge) + '" fill="rgba(255,255,255,.06)" stroke="rgba(255,255,255,.55)" stroke-width="3" stroke-dasharray="14 10"/>'; });
      else {
        var st = roomStates(o.history, o.now || Date.now());
        Object.keys(ROOMS).forEach(function (n) {
          var tone = st[n]; if (!tone) return;
          s += '<polygon class="rm-room ' + tone + '" points="' + ROOMS[n].map(function (p) { return p[0] + ',' + p[1]; }).join(' ') + '" fill="' + (tone === 'fresh' ? 'rgba(50,215,75,.16)' : 'rgba(255,159,10,.14)') + '" stroke="' + (tone === 'fresh' ? 'rgba(50,215,75,.75)' : 'rgba(255,159,10,.7)') + '" stroke-width="3" stroke-dasharray="14 10"/>';
        });
      }
    }
    if (layers.area && data && data.coverage_poly && fit) s += '<path class="rm-area" d="' + cleanedPath(data.coverage_poly, fit, o.nudge) + '" fill="rgba(70,165,255,.30)" fill-rule="evenodd" stroke="rgba(130,205,255,.95)" stroke-width="3.5" stroke-linejoin="round"/>';
    if (layers.stuck && data && fit) stuckSpots(data.escape_events, fit, o.nudge).forEach(function (p) { s += '<circle class="rm-stuck" cx="' + p.x + '" cy="' + p.y + '" r="9" fill="#ff9f0a" stroke="rgba(0,0,0,.55)" stroke-width="3"/>'; });
    return s + '</g>';
  }
  /** Which config entry the robot belongs to: the entry_id in the attributes of one of its device's entities (its events carry it). */
  function entryIdOf(states, registry, vacId) {
    var dev = registry && registry[vacId] && registry[vacId].device_id, found = null;
    Object.keys(states || {}).some(function (id) {
      var a = states[id] && states[id].attributes; if (!a || !a.entry_id) return false;
      var r = registry && registry[id]; if (dev && r && r.device_id === dev) { found = a.entry_id; return true; } return false;
    });
    if (found) return found;
    Object.keys(states || {}).some(function (id) { var a = states[id] && states[id].attributes; if (a && a.entry_id && id.indexOf('event.') === 0 && /roomba|mission|stuck/.test(id)) { found = a.entry_id; return true; } return false; });
    return found;
  }

  var api = { FLOOR: FLOOR, ROOMS: ROOMS, BAKED: BAKED, inPoly: inPoly, toPlan: toPlan, fitFor: fitFor, fitCoverage: fitCoverage, ringsOf: ringsOf, cleanedPath: cleanedPath, stuckSpots: stuckSpots, roomStates: roomStates, overlaySvg: overlaySvg, entryIdOf: entryIdOf };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.robomap = api;

  // ===================================================================== the screen part ====
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;
  core.registerStrings('en', {
    'rm.area': 'Cleaned area', 'rm.stuck': 'Stuck spots', 'rm.rooms': 'Rooms', 'rm.adjust': 'Adjust', 'rm.last': 'Last clean {when}', 'rm.nofit': 'This robot map is not lined up with the floor plan yet. That happens by itself after one whole-home clean.', 'rm.nodata': 'No cleaning map from the robot yet.',
    'rm.loading': 'Loading the cleaning map…', 'rm.pics': 'The robot’s own pictures', 'rm.adj_title': 'Line the cleaning up with the floor plan', 'rm.adj_hint': 'Slide, turn or resize the blue area until it sits on the floor. This is kept on this device.',
    'rm.reset': 'Back to automatic', 'rm.done': 'Done', 'rm.left': 'Left', 'rm.right': 'Right', 'rm.up': 'Up', 'rm.down': 'Down', 'rm.turn_l': 'Turn left', 'rm.turn_r': 'Turn right', 'rm.smaller': 'Smaller', 'rm.bigger': 'Bigger', 'rm.cleaned': 'cleaned {when}', 'rm.today': 'today', 'rm.stuck_n': '{n} stuck spots',
  });
  core.registerStrings('de', {
    'rm.area': 'Gereinigte Fläche', 'rm.stuck': 'Stellen zum Festfahren', 'rm.rooms': 'Räume', 'rm.adjust': 'Anpassen', 'rm.last': 'Letzte Reinigung {when}', 'rm.nofit': 'Diese Roboterkarte ist noch nicht auf den Grundriss ausgerichtet. Das passiert von selbst nach einer Reinigung der ganzen Wohnung.', 'rm.nodata': 'Noch keine Reinigungskarte vom Roboter.',
    'rm.loading': 'Reinigungskarte wird geladen…', 'rm.pics': 'Die Bilder des Roboters', 'rm.adj_title': 'Reinigung auf den Grundriss ausrichten', 'rm.adj_hint': 'Die blaue Fläche verschieben, drehen oder skalieren, bis sie auf dem Boden liegt. Wird auf diesem Gerät gespeichert.',
    'rm.reset': 'Zurück zu automatisch', 'rm.done': 'Fertig', 'rm.left': 'Links', 'rm.right': 'Rechts', 'rm.up': 'Hoch', 'rm.down': 'Runter', 'rm.turn_l': 'Nach links drehen', 'rm.turn_r': 'Nach rechts drehen', 'rm.smaller': 'Kleiner', 'rm.bigger': 'Größer', 'rm.cleaned': 'gereinigt {when}', 'rm.today': 'heute', 'rm.stuck_n': '{n} Problemstellen',
  });

  /** Can the floor plan be shown here? (its card is a dashboard resource of Home Assistant.) */
  function available() { return !!(g.customElements && g.customElements.get('floorplan-card') && g.OkieMotor.gadgets && g.OkieMotor.gadgets.makeFloorplan); }

  /**
   * The map section of a robot's screen: the floor plan with the cleaned area, stuck spots and room tints over it.
   * opts: { pictures: [{ kind, url }] }  -> { update(X), dispose() }
   */
  function mount(ctx, box, vacId, opts) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, GD = g.OkieMotor.gadgets, disposed = false, el = null, mo = null, data = null, fit = null, status = 'loading', pmap = '', pics = (opts && opts.pictures) || [];
    var layers = Object.assign({ area: true, stuck: true, rooms: true }, ctx.store.get('robomap.layers', null) || {}), loadedAt = 0, lastKey = '', loading = false, history = null, summary = null;
    var title = h('div.vc-tl.rm-tl', null, h('span', null, core.t('vc.map', ctx.lang())), h('button.rm-adj', { type: 'button', hidden: true, onclick: openAdjust }, t('rm.adjust')));
    var holder = h('div.rm-plan'), note = h('div.rm-note', { hidden: true }), cap = h('div.rm-cap'), rooms = h('div.rm-rooms'), chips = h('div.vc-jobrow.rm-layers');
    var picsBox = h('details.rm-pics', { hidden: true }, h('summary', null, t('rm.pics'))), builtNarrow = null, ro = null;
    box.appendChild(title); box.appendChild(holder); box.appendChild(chips); box.appendChild(note); box.appendChild(cap); box.appendChild(rooms); box.appendChild(picsBox);
    // the plan is made once the box has a width: upright on a phone, side-on on a wide screen; it is made again if the screen turns the other way
    function build() {
      var w = box.clientWidth; if (!w || disposed) return;
      var narrow = !!(ctx.host && ctx.host._mobile) || w < 560; if (narrow === builtNarrow && el) return;
      builtNarrow = narrow; if (mo) { mo.disconnect(); mo = null; } holder.innerHTML = ''; el = null;
      holder.style.height = narrow ? 'min(68vh,560px)' : Math.round(Math.max(260, Math.min(480, (w - 32) / 1.95))) + 'px';
      el = GD.makeFloorplan(ctx, narrow ? 'portrait' : 'landscape'); if (el) { holder.appendChild(el); watch(); }
    }

    function nudgeAll() { return ctx.store.get('robomap.nudge', null) || {}; }
    function planGroup() { var sr = el && el.shadowRoot, pg = sr && sr.getElementById('pg'); return pg ? (pg.querySelector(':scope > g > g') || (pg.firstElementChild && pg.firstElementChild.firstElementChild)) : null; }
    function inject() {
      var inner = planGroup(); if (!inner) return false;
      var old = inner.querySelector('.rm-ovl'); if (old) old.remove();
      if (data && fit) inner.insertAdjacentHTML('beforeend', overlaySvg(data, fit, layers, { nudge: nudgeAll()[pmap], history: history, now: Date.now() }));
      return true;
    }
    function watch() {
      var tries = 0, sr = el && el.shadowRoot;
      (function wait() {
        if (disposed || !el) return; var pg = el.shadowRoot && el.shadowRoot.getElementById('pg');
        if (pg) { inject(); mo = new MutationObserver(function () { var inner = planGroup(); if (inner && !inner.querySelector('.rm-ovl')) inject(); }); mo.observe(pg, { childList: true }); return; }
        if (tries++ < 40) setTimeout(wait, 100);
      })();
    }
    function say(msg) { note.textContent = msg || ''; note.hidden = !msg; }
    function drawChips() {
      chips.innerHTML = '';
      [['area', t('rm.area')], ['stuck', t('rm.stuck')], ['rooms', t('rm.rooms')]].forEach(function (c) {
        chips.appendChild(h('button.vc-job.rm-chip' + (layers[c[0]] ? '.on' : ''), { type: 'button', 'aria-pressed': layers[c[0]] ? 'true' : 'false', onclick: function () { layers[c[0]] = !layers[c[0]]; ctx.store.set('robomap.layers', layers); drawChips(); inject(); } }, c[1]));
      });
    }
    function drawText() {
      var n = data && data.escape_events ? data.escape_events.length : 0, parts = [];
      if (summary && summary.ended_at) parts.push(t('rm.last', { when: whenText(Date.parse(summary.ended_at)) }));
      if (summary && summary.area_sqft) parts.push(Math.round(summary.area_sqft) + ' ft²');
      if (summary && summary.duration_min) parts.push(summary.duration_min + ' min');
      if (n) parts.push(t('rm.stuck_n', { n: n }));
      cap.textContent = parts.join(' · '); cap.hidden = !parts.length;
      rooms.innerHTML = '';
      var st = roomStates(history, Date.now());
      Object.keys(history || {}).forEach(function (rn) { var ts = Date.parse(history[rn]); if (isNaN(ts)) return; rooms.appendChild(h('span.rm-rc.' + (st[String(rn).toLowerCase()] || 'old'), null, h('b', null, rn), ' ' + t('rm.cleaned', { when: whenText(ts) }))); });
      rooms.hidden = !rooms.children.length;
      title.querySelector('.rm-adj').hidden = !(data && fit);
    }
    function whenText(ms) {
      var d = new Date(ms), now = new Date(), same = d.toDateString() === now.toDateString(), tf = ctx.settings.get().timeFormat, o = { hour: 'numeric', minute: '2-digit' };
      if (tf === '12h') o.hour12 = true; else if (tf === '24h') o.hourCycle = 'h23';
      var tm = d.toLocaleTimeString(ctx.lang() === 'de' ? 'de' : 'en-US', o);
      return (same ? t('rm.today') : d.toLocaleDateString(ctx.lang() === 'de' ? 'de' : 'en-US', { month: 'short', day: 'numeric' })) + ' ' + tm;
    }
    function drawPictures() {
      picsBox.querySelectorAll(':scope > :not(summary)').forEach(function (n) { n.remove(); });
      picsBox.hidden = !pics.length; if (!pics.length) return;
      var kind = ctx.store.get('robomap.pic', '') || pics[0].kind, cur = pics.filter(function (p) { return p.kind === kind; })[0] || pics[0], hs = ctx.hass();
      var row = h('div.vc-jobrow');
      pics.forEach(function (p) { row.appendChild(h('button.vc-job.rm-chip' + (p.kind === cur.kind ? '.on' : ''), { type: 'button', dataset: { map: p.kind }, onclick: function () { ctx.store.set('robomap.pic', p.kind); drawPictures(); } }, core.t('vc.map_' + p.kind, ctx.lang()))); });
      picsBox.appendChild(row); picsBox.appendChild(h('img.vc-mapimg', { alt: '', decoding: 'async', src: hs.hassUrl ? hs.hassUrl(cur.url) : cur.url }));
    }
    function entry() { var hs = ctx.hass(); return entryIdOf(hs.states, hs.entities, vacId); }
    function pick(states, re) { var ids = Object.keys(states).filter(function (id) { return re.test(id); }); var reg = ctx.hass().entities || {}, dev = reg[vacId] && reg[vacId].device_id; return ids.filter(function (id) { return !dev || (reg[id] && reg[id].device_id === dev); })[0] || ids[0] || null; }
    function load(force) {
      if (loading || disposed) return; var states = ctx.hass().states, e = entry();
      var sId = pick(states, /_last_mission_summary$/), hId = pick(states, /_room_cleaning_history$/);
      summary = sId && states[sId] ? states[sId].attributes : null; history = hId && states[hId] && states[hId].attributes ? (states[hId].attributes.rooms || null) : null;
      var key = [summary && summary.ended_at, sId && states[sId] && states[sId].state].join('|');
      if (!force && data && key === lastKey && Date.now() - loadedAt < 600000) { drawText(); return; }
      if (!e) { status = 'nodata'; say(t('rm.nodata')); drawText(); return; }
      loading = true; if (!data) say(t('rm.loading'));
      Promise.resolve(ctx.hass().callApi('GET', 'roomba_plus/' + e + '/missions/latest/map.json')).then(function (d) {
        loading = false; if (disposed) return; data = d; lastKey = key; loadedAt = Date.now(); pmap = d.pmap_id || '';
        var saved = ctx.store.get('robomap.fits', null) || {}; fit = fitFor(pmap, saved);
        if (fit) { say(''); drawText(); inject(); return; }
        var cells = (d.coverage_mm || []).map(function (p) { return [p[0] / 1000, p[1] / 1000]; });
        say(t('rm.nofit')); drawText();
        fitCoverage(cells).then(function (r) { if (disposed) return; if (r) { saved = Object.assign({}, ctx.store.get('robomap.fits', null) || {}); saved[pmap] = r; ctx.store.set('robomap.fits', saved); fit = r; say(''); } drawText(); inject(); });
      }, function () { loading = false; if (disposed) return; if (!data) say(t('rm.nodata')); drawText(); });
    }
    function openAdjust() {
      ctx.sheet({ title: t('rm.adj_title'), width: 'min(460px,100%)', content: function (close) {
        var n = Object.assign({ dx: 0, dy: 0, rot: 0, scale: 0 }, nudgeAll()[pmap] || {});
        function save() { var all = Object.assign({}, nudgeAll()); all[pmap] = n; ctx.store.set('robomap.nudge', all); inject(); }
        function btn(label, fn, cls) { return h('button.act' + (cls || ''), { type: 'button', onclick: fn }, label); }
        var pad = h('div.rm-pad', null,
          btn('↑ ' + t('rm.up'), function () { n.dy -= 6; save(); }), btn('← ' + t('rm.left'), function () { n.dx -= 6; save(); }), btn(t('rm.right') + ' →', function () { n.dx += 6; save(); }), btn('↓ ' + t('rm.down'), function () { n.dy += 6; save(); }),
          btn('⟲ ' + t('rm.turn_l'), function () { n.rot -= 1; save(); }), btn(t('rm.turn_r') + ' ⟳', function () { n.rot += 1; save(); }), btn('− ' + t('rm.smaller'), function () { n.scale -= 1; save(); }), btn('+ ' + t('rm.bigger'), function () { n.scale += 1; save(); }));
        return h('div', null, h('p.dim', null, t('rm.adj_hint')), pad, h('div.actrow', null,
          btn(t('rm.reset'), function () { n.dx = n.dy = n.rot = n.scale = 0; var all = Object.assign({}, nudgeAll()); delete all[pmap]; ctx.store.set('robomap.nudge', all); inject(); }), btn(t('rm.done'), close, '.primary')));
      } });
    }
    drawChips(); drawPictures(); build(); if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(function () { requestAnimationFrame(build); }); ro.observe(box); } load(true);
    return {
      update: function (X) { if (X && X.maps) { var sig = X.maps.map(function (m) { return m.kind + m.url; }).join(); if (sig !== (pics._sig || '')) { pics = X.maps; pics._sig = sig; drawPictures(); } } if (el) el.hass = ctx.hass(); load(false); },
      dispose: function () { disposed = true; if (mo) mo.disconnect(); if (ro) ro.disconnect(); if (GD && GD.releaseFloorplan) GD.releaseFloorplan(); },
    };
  }
  api.available = available; api.mount = mount;

  var CSS = [
    '.rm-tl{display:flex;align-items:center;justify-content:space-between;gap:10px;}.rm-adj{padding:4px 12px;border-radius:9999px;background:rgba(255,255,255,.12);font-size:12px;font-weight:600;text-transform:none;letter-spacing:0;}.rm-adj[hidden]{display:none;}',
    '.rm-plan{position:relative;margin:8px 0 10px;border-radius:18px;overflow:hidden;background:rgba(0,0,0,.18);}.rm-plan>*{display:block;height:100%;}',
    '.rm-layers{margin:0 0 8px;}.rm-chip.on{background:#fff;color:#1d1b19;}',
    '.rm-note{padding:10px 14px;border-radius:14px;background:rgba(255,255,255,.08);font-size:13px;color:var(--okie-text-dim);line-height:1.4;margin-bottom:8px;}.rm-note[hidden]{display:none;}',
    '.rm-cap{font-size:13px;color:var(--okie-text-dim);margin:2px 2px 8px;}.rm-cap[hidden]{display:none;}',
    '.rm-rooms{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px;}.rm-rooms[hidden]{display:none;}.rm-rc{padding:5px 12px;border-radius:9999px;font-size:12px;background:rgba(255,255,255,.08);}.rm-rc b{font-weight:600;}.rm-rc.fresh{background:rgba(50,215,75,.2);color:#8df5a3;}.rm-rc.old{background:rgba(255,159,10,.18);color:#ffc86b;}',
    '.rm-pics{margin-top:6px;}.rm-pics[hidden]{display:none;}.rm-pics summary{cursor:pointer;font-size:13px;color:var(--okie-text-dim);padding:6px 2px;}.rm-pics .vc-mapimg{margin-top:8px;}',
    '.rm-pad{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0;}.rm-pad .act{justify-content:center;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
})(typeof globalThis !== 'undefined' ? globalThis : window);

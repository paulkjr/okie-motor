/* okie-vacuum: the screen of a robot vacuum (Roomba and friends).
 *
 * A little robot that moves with what the vacuum does (rests on its dock while docked, roams while cleaning, drives home when returning), the state and when it
 * changed, the battery (with the charging bolt), the controls as four round keys (start or pause, stop, return to dock, locate), tiles for the water tank, the bin and the pad,
 * the last clean, and the mission statistics. The numbers come from the vacuum's own attributes and from the sensors of the same device (the iRobot integration
 * puts the battery, the missions and the rest in sensors next to the vacuum): they are found through the entity registry, else by the name they share.
 *
 * The pure part (finding the sensors, the numbers) is unit-tested; the DOM part is checked in the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // ---------------------------------------------------------- pure ----
  function objId(id) { return String(id).split('.')[1] || ''; }
  /** The sensors that belong to the same device as the vacuum: the same device in the registry, or an entity id that starts with the vacuum's name (vacuum.robo_home -> sensor.robo_home_battery). */
  function siblings(states, vacId, registry) {
    var dev = registry && registry[vacId] && registry[vacId].device_id, base = objId(vacId) + '_', out = [];
    Object.keys(states || {}).forEach(function (id) {
      if (id === vacId) return;
      var dom = id.split('.')[0]; if (dom !== 'sensor' && dom !== 'binary_sensor') return;
      var r = registry && registry[id];
      if ((dev && r && r.device_id === dev) || objId(id).indexOf(base) === 0) out.push(id);
    });
    return out;
  }
  var ROLES = {
    battery: ['battery'], charging: ['charging'], binFull: ['bin_full'], tank: ['tank_level'], total: ['total_missions'], ok: ['successful_missions'], canceled: ['canceled_missions', 'cancelled_missions'],
    failed: ['failed_missions'], scrubs: ['scrubs'], avg: ['average_mission_time'], cleanTime: ['total_cleaning_time'], area: ['total_cleaned_area'], cycles: ['battery_cycles'], last: ['last_mission_start_time']
  };
  /** Which sibling plays which part: { battery: 'sensor.x_battery', total: ..., last: ... } (what is not there is missing). */
  function roles(states, ids) {
    var out = {};
    Object.keys(ROLES).forEach(function (role) {
      var hit = ids.filter(function (id) { var o = objId(id); return ROLES[role].some(function (s) { return o === s || o.slice(-(s.length + 1)) === '_' + s; }); })[0];
      if (hit) out[role] = hit;
    });
    if (!out.battery) { var b = ids.filter(function (id) { var s = states[id]; return s && s.attributes && s.attributes.device_class === 'battery' && id.indexOf('sensor.') === 0; })[0]; if (b) out.battery = b; }
    if (!out.charging) { var c = ids.filter(function (id) { var s = states[id]; return s && s.attributes && s.attributes.device_class === 'battery_charging'; })[0]; if (c) out.charging = c; }
    if (!out.last) { var l = ids.filter(function (id) { var s = states[id]; return s && s.attributes && s.attributes.device_class === 'timestamp' && /mission|clean/.test(id); })[0]; if (l) out.last = l; }
    return out;
  }
  /** A sensor's state as a number, or null (unknown, unavailable, text). */
  function numberOf(states, id) {
    var s = id && states[id]; if (!s || s.state === 'unknown' || s.state === 'unavailable' || s.state === '' || s.state == null) return null;
    var n = parseFloat(s.state); return isFinite(n) ? n : null;
  }
  /** Battery 0-100 from the vacuum itself or its battery sensor. */
  function batteryOf(states, vac, r) {
    var a = (vac && vac.attributes) || {}, n = a.battery_level != null ? parseFloat(a.battery_level) : numberOf(states, r.battery);
    return isFinite(n) && n != null ? Math.max(0, Math.min(100, Math.round(n))) : null;
  }
  function isCharging(states, vac, r) {
    var s = r.charging && states[r.charging]; if (s) return s.state === 'on';
    var a = (vac && vac.attributes) || {}; return a.battery_icon ? /charging/.test(String(a.battery_icon)) : null;
  }
  /** "reusableWet" -> "Reusable wet"; the "no pad" values give ''. */
  function padLabel(p) {
    var s = String(p == null ? '' : p).trim(); if (!s || /^(none|invalid|unknown|null)$/i.test(s)) return '';
    s = s.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase(); return s.charAt(0).toUpperCase() + s.slice(1);
  }
  /** How the robot is drawn: docked / cleaning / returning / paused / error / idle. */
  function visualState(state) {
    switch (state) {
      case 'docked': return 'docked'; case 'cleaning': return 'cleaning'; case 'returning': return 'returning'; case 'paused': return 'paused'; case 'error': return 'error';
      default: return 'idle';
    }
  }
  /** The three parts of the mission bar in percent of the total: [ok, canceled, failed] (the rest, if any, is nothing). */
  function missionShares(ok, canceled, failed, total) {
    var t = total != null ? total : (ok || 0) + (canceled || 0) + (failed || 0); if (!t) return [0, 0, 0];
    var p = function (v) { return Math.max(0, Math.min(100, (v || 0) / t * 100)); };
    return [p(ok), p(canceled), p(failed)];
  }
  /** "419 min" is long: 7 h. Other numbers keep their unit. */
  function fmtStat(v, unit) {
    if (v == null) return '–';
    if (unit === 'min' && v >= 120) return (Math.round(v / 6) / 10) + ' h';
    var n = Math.abs(v) >= 100 || v % 1 === 0 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
    return n + (unit ? ' ' + unit : '');
  }
  /** Colour of a battery level: green, amber, red. */
  function batteryTone(pct) { return pct == null ? 'neutral' : pct <= 20 ? 'low' : pct <= 50 ? 'mid' : 'good'; }

  /** What needs the owner now: [{ id: 'error' | 'bin_gone' | 'bin_full' | 'tank_low' | 'lid_open' | 'battery_low', detail? }], most important first. */
  function attention(state, attrs, battery, charging, due) {
    var a = attrs || {}, out = [];
    if (state === 'error') out.push({ id: 'error', detail: String(a.error || '') });
    if (a.bin_present === false) out.push({ id: 'bin_gone' }); else if (a.bin_full === true) out.push({ id: 'bin_full' });
    var tank = a.tank_level != null ? parseFloat(a.tank_level) : null;
    if (a.tank_present !== false && tank != null && isFinite(tank) && tank <= 15) out.push({ id: 'tank_low' });
    if (a.lid_closed === false) out.push({ id: 'lid_open' });
    if (battery != null && battery <= 15 && !charging && state !== 'docked') out.push({ id: 'battery_low' });
    if (due && due.length) out.push({ id: 'maintenance', detail: due.join(', ') });
    return out;
  }
  var ACTIVE = { cleaning: 1, returning: 1, paused: 1 };
  /** The cleans in Home Assistant's history of the vacuum ([{ s: state, lu: seconds }]): from the moment it starts to the moment it rests again. Newest first. */
  function runsFromHistory(rows, now) {
    var out = [], cur = null;
    (rows || []).forEach(function (r) {
      var s = r.s != null ? r.s : r.state, lu = r.lu != null ? r.lu * 1000 : Date.parse(r.last_updated || r.last_changed); if (!isFinite(lu)) return;
      if (ACTIVE[s]) { if (!cur) cur = { start: lu, end: null, ended: '', open: true }; }
      else if (cur) { cur.end = lu; cur.ended = s; cur.open = false; out.push(cur); cur = null; }
    });
    if (cur) { cur.end = now; out.push(cur); }
    out.forEach(function (r) { r.mins = Math.max(0, Math.round((r.end - r.start) / 60000)); });
    return out.reverse();
  }
  /** The next time a schedule of the Scheduler starts something on this vacuum: { ts, name } or null. */
  function nextSchedule(states, vacId) {
    var best = null;
    Object.keys(states || {}).forEach(function (id) {
      if (!/^switch\.schedule_/.test(id)) return;
      var s = states[id], a = (s && s.attributes) || {};
      if (!s || s.state !== 'on' || [].concat(a.entities || []).indexOf(vacId) < 0 || !a.next_trigger) return;
      var ts = Date.parse(a.next_trigger); if (!isFinite(ts)) return;
      if (!best || ts < best.ts) best = { ts: ts, name: a.friendly_name || '' };
    });
    return best;
  }

  var DEV_DOMAINS = { sensor: 1, binary_sensor: 1, select: 1, switch: 1, button: 1, image: 1, calendar: 1, number: 1 };
  /** Everything that belongs to the same device as the vacuum, of every kind (selects, switches, buttons, images ...), like siblings() but not only sensors. */
  function members(states, vacId, registry) {
    var dev = registry && registry[vacId] && registry[vacId].device_id, base = objId(vacId) + '_', out = [];
    Object.keys(states || {}).forEach(function (id) {
      if (id === vacId || !DEV_DOMAINS[id.split('.')[0]]) return;
      var r = registry && registry[id];
      if ((dev && r && r.device_id === dev) || objId(id).indexOf(base) === 0) out.push(id);
    });
    return out;
  }
  function nameOf(states, id, vacName) {
    var s = states[id], f = (s && s.attributes && s.attributes.friendly_name) || objId(id).replace(/_/g, ' ');
    if (vacName && f.indexOf(vacName) === 0) f = f.slice(vacName.length);
    return f.replace(/^\s*(Setting|Maintenance|Status|Rooms)\s*[–-]\s*/i, '').trim();
  }
  var MAINT_KEYS = [['filter_remaining_hours', 'filter'], ['brush_remaining_hours', 'brush'], ['part_dirt_bag', 'clean_base_bag'], ['part_edge_brush', 'side_brush'], ['pad_remaining_hours', 'pad']];
  /**
   * What a Roomba+ robot offers next to the vacuum itself: your favorites, the cleaning mode and room selectors, the settings, the maintenance counters, the maps.
   * Everything is optional: with the plain iRobot integration most of this is simply missing and the screen shows less.
   */
  function ext(states, vacId, registry) {
    var vac = (states || {})[vacId] || {}, a = vac.attributes || {}, vacName = a.friendly_name || '', ids = members(states, vacId, registry);
    var out = { favorites: [], favBtn: {}, modeSel: null, modes: [], zoneSel: null, zoneBtn: null, rooms: [], zones: [], passesSel: null, padSels: [], switches: [], maint: [], due: [], maps: [], nextClean: null };
    var at = function (id) { return (states[id] && states[id].attributes) || {}; }, buttons = [], selects = [];
    ids.forEach(function (id) {
      var dom = id.split('.')[0], o = objId(id), A = at(id);
      if (dom === 'select') selects.push(id);
      else if (dom === 'button') buttons.push(id);
      else if (dom === 'switch') out.switches.push({ id: id, label: nameOf(states, id, vacName), on: states[id].state === 'on' });
      else if (dom === 'image') {
        var st = states[id].state; if (!A.entity_picture || st === 'unavailable' || st === 'unknown') return;
        out.maps.push({ id: id, kind: /rooms/.test(o) ? 'rooms' : /coverage/.test(o) ? 'coverage' : 'path', url: A.entity_picture });
      } else if (dom === 'sensor') {
        if (/_next_clean$/.test(o) && isFinite(Date.parse(states[id].state))) out.nextClean = Date.parse(states[id].state);
        var mk = MAINT_KEYS.filter(function (k) { return o.slice(-k[0].length) === k[0]; })[0], rem = numberOf(states, id), mx = parseFloat(A.max_hours);
        if (mk && rem != null && isFinite(mx) && mx > 0) out.maint.push({ id: id, key: mk[1], label: nameOf(states, id, vacName), remaining: rem, max: mx, threshold: parseFloat(A.threshold_hours) });
      } else if (dom === 'binary_sensor' && /maintenance_due$/.test(o) && states[id].state === 'on') out.due = [].concat(A.due || []);
    });
    selects.forEach(function (id) {
      var A = at(id), opts = A.options || [], o = objId(id);
      if (opts.indexOf('vacuum_and_mop') >= 0) { out.modeSel = id; out.modes = ['vacuum', 'mop', 'vacuum_and_mop', 'vacuum_then_mop'].filter(function (m) { return opts.indexOf(m) >= 0; }); }
      else if (A.region_icons || A.region_areas_m2 || (A.pmap_id && opts.length)) {
        if (out.zoneSel && !A.is_active_map) return;
        out.zoneSel = id; var regs = Object.keys(A.region_icons || A.region_areas_m2 || {});
        out.rooms = opts.filter(function (n) { return regs.indexOf(n) >= 0; }); out.zones = opts.filter(function (n) { return regs.indexOf(n) < 0; });
      } else if (/passes/.test(o)) out.passesSel = id;
      else if (/pad_wetness/.test(o)) out.padSels.push(id);
    });
    out.zoneBtn = buttons.filter(function (id) { return /_clean_smart_zone$/.test(id); })[0] || null;
    ((a.favorites) || []).forEach(function (f) {
      if (!f || !f.id || !f.name) return; out.favorites.push({ id: String(f.id), name: String(f.name) });
      var b = buttons.filter(function (id) { return id.slice(-(String(f.id).length + 5)) === '_fav_' + f.id; })[0]; if (b) out.favBtn[f.id] = b;
    });
    out.maint.forEach(function (m) { m.reset = buttons.filter(function (id) { return id.slice(-(m.key.length + 7)) === '_reset_' + m.key; })[0] || null; m.due = out.due.indexOf(m.key) >= 0 || m.remaining <= 0; });
    out.maps.sort(function (x, y) { return ['path', 'rooms', 'coverage'].indexOf(x.kind) - ['path', 'rooms', 'coverage'].indexOf(y.kind); });
    return out;
  }

  var pureApi = { members: members, ext: ext, siblings: siblings, roles: roles, numberOf: numberOf, batteryOf: batteryOf, isCharging: isCharging, padLabel: padLabel, visualState: visualState, missionShares: missionShares, fmtStat: fmtStat, batteryTone: batteryTone,
    attention: attention, runsFromHistory: runsFromHistory, nextSchedule: nextSchedule };
  if (isNode) { module.exports = pureApi; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ DOM ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, L = g.OkieMotor.logic, h = UI.h;

  core.registerStrings('en', {
    'vc.start': 'Start', 'vc.pause': 'Pause', 'vc.stop': 'Stop', 'vc.dock': 'Dock', 'vc.locate': 'Locate',
    'vc.battery': 'Battery', 'vc.charging': 'Charging', 'vc.tank': 'Water tank', 'vc.no_tank': 'No tank', 'vc.bin': 'Bin', 'vc.bin_ok': 'OK', 'vc.bin_full': 'Full', 'vc.bin_gone': 'Missing', 'vc.pad': 'Pad',
    'vc.last': 'Last clean', 'vc.missions': 'Missions', 'vc.mission_n': '{n} missions', 'vc.ok': 'Successful', 'vc.canceled': 'Cancelled', 'vc.failed': 'Failed', 'vc.scrubs': 'Scrubs', 'vc.avg': 'Average mission',
    'vc.clean_time': 'Cleaning time', 'vc.area': 'Cleaned area', 'vc.cycles': 'Battery cycles',
    'vc.al.error': 'The robot needs help', 'vc.al.error_d': 'The robot needs help: {d}', 'vc.al.bin_gone': 'The bin is missing', 'vc.al.bin_full': 'The bin is full: empty it', 'vc.al.tank_low': 'The water tank is almost empty', 'vc.al.lid_open': 'The tank lid is open', 'vc.al.battery_low': 'The battery is low',
    'vc.al.maintenance': 'Maintenance due: {d}', 'vc.fav': 'Favorites', 'vc.mode': 'Cleaning mode', 'vc.m.vacuum': 'Vacuum', 'vc.m.mop': 'Mop', 'vc.m.vacuum_and_mop': 'Vacuum & Mop', 'vc.m.vacuum_then_mop': 'Vacuum, then Mop',
    'vc.rooms': 'Rooms', 'vc.rooms_hint': 'One tap cleans just that room.', 'vc.options': 'Settings', 'vc.maint': 'Maintenance', 'vc.due': 'Due', 'vc.h_left': '{n} h left', 'vc.replaced': 'Replaced', 'vc.confirm': 'Tap again', 'vc.reset_done': 'Counter reset',
    'vc.map': 'Map', 'vc.map_path': 'Cleaning path', 'vc.map_rooms': 'Rooms', 'vc.map_coverage': 'Coverage', 'vc.started': 'Started: {n}', 'vc.mp.docked': 'Maintenance part',
    'vc.jobs': 'Jobs', 'vc.next': 'Next clean', 'vc.recent': 'Recent cleans', 'vc.today': 'Today', 'vc.tomorrow': 'Tomorrow', 'vc.yesterday': 'Yesterday', 'vc.running': 'Running', 'vc.lt_min': '<1 min',
  });
  core.registerStrings('de', {
    'vc.start': 'Start', 'vc.pause': 'Pause', 'vc.stop': 'Stopp', 'vc.dock': 'Station', 'vc.locate': 'Finden',
    'vc.battery': 'Akku', 'vc.charging': 'Lädt', 'vc.tank': 'Wassertank', 'vc.no_tank': 'Kein Tank', 'vc.bin': 'Behälter', 'vc.bin_ok': 'OK', 'vc.bin_full': 'Voll', 'vc.bin_gone': 'Fehlt', 'vc.pad': 'Pad',
    'vc.last': 'Letzte Reinigung', 'vc.missions': 'Einsätze', 'vc.mission_n': '{n} Einsätze', 'vc.ok': 'Erfolgreich', 'vc.canceled': 'Abgebrochen', 'vc.failed': 'Fehlgeschlagen', 'vc.scrubs': 'Wischgänge', 'vc.avg': 'Mittlerer Einsatz',
    'vc.clean_time': 'Reinigungszeit', 'vc.area': 'Gereinigte Fläche', 'vc.cycles': 'Ladezyklen',
    'vc.al.error': 'Der Roboter braucht Hilfe', 'vc.al.error_d': 'Der Roboter braucht Hilfe: {d}', 'vc.al.bin_gone': 'Der Behälter fehlt', 'vc.al.bin_full': 'Der Behälter ist voll: bitte leeren', 'vc.al.tank_low': 'Der Wassertank ist fast leer', 'vc.al.lid_open': 'Der Tankdeckel ist offen', 'vc.al.battery_low': 'Der Akku ist schwach',
    'vc.al.maintenance': 'Wartung fällig: {d}', 'vc.fav': 'Favoriten', 'vc.mode': 'Reinigungsmodus', 'vc.m.vacuum': 'Saugen', 'vc.m.mop': 'Wischen', 'vc.m.vacuum_and_mop': 'Saugen & Wischen', 'vc.m.vacuum_then_mop': 'Erst saugen, dann wischen',
    'vc.rooms': 'Räume', 'vc.rooms_hint': 'Ein Tipp reinigt nur diesen Raum.', 'vc.options': 'Einstellungen', 'vc.maint': 'Wartung', 'vc.due': 'Fällig', 'vc.h_left': 'noch {n} h', 'vc.replaced': 'Ersetzt', 'vc.confirm': 'Nochmal tippen', 'vc.reset_done': 'Zähler zurückgesetzt',
    'vc.map': 'Karte', 'vc.map_path': 'Reinigungsweg', 'vc.map_rooms': 'Räume', 'vc.map_coverage': 'Abdeckung', 'vc.started': 'Gestartet: {n}', 'vc.mp.docked': 'Wartungsteil',
    'vc.jobs': 'Aufträge', 'vc.next': 'Nächste Reinigung', 'vc.recent': 'Letzte Reinigungen', 'vc.today': 'Heute', 'vc.tomorrow': 'Morgen', 'vc.yesterday': 'Gestern', 'vc.running': 'Läuft', 'vc.lt_min': '<1 Min.',
  });
  function T(ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; }
  function svc(ctx, item, service) {
    return ctx.call('vacuum', service, { entity_id: item.id }).then(function (r) { ctx.engine.recordUse(item.id); return r; }, function (e) { ctx.toast('error', core.t('d.failed', ctx.lang(), { name: item.name })); throw e; });
  }

  var REG = { at: 0, p: null };      // the registry list, one request for all vacuums, kept for a few minutes
  function registry(ctx) {
    if (REG.p && Date.now() - REG.at < 300000) return REG.p;
    REG.at = Date.now();
    return (REG.p = Promise.resolve(ctx.callWS({ type: 'config/entity_registry/list' })).then(function (list) { var m = {}; (list || []).forEach(function (e) { m[e.entity_id] = e; }); return m; }, function () { REG.p = null; return {}; }));
  }

  /** The robot: a round body with a bumper, a button and a sensor, a dock below it. data-state moves it (CSS): rests on the dock, roams, drives home, waits. */
  function robot() {
    var svg = '<svg viewBox="0 0 200 200" width="100%" height="100%" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle class="vc-halo" cx="100" cy="100" r="92" fill="currentColor" fill-opacity=".07" stroke="none"/>' +
      '<path class="vc-trail" d="M52 128c14-34 38-52 62-48s34 26 18 44" stroke-width="1.6" stroke-dasharray="1 7" opacity="0"/>' +
      '<rect class="vc-dock" x="62" y="150" width="76" height="22" rx="7" stroke-width="2.4" opacity=".75"/>' +
      '<g class="vc-bot"><g class="vc-turn">' +
      '<circle cx="100" cy="98" r="48" stroke-width="2.6" fill="currentColor" fill-opacity=".08"/><circle cx="100" cy="98" r="40" stroke-width="1.2" opacity=".35"/>' +
      '<path d="M66 82a40 40 0 0 1 68 0" stroke-width="5" opacity=".9"/><path d="M82 62l-3-8M100 58v-9M118 62l3-8" stroke-width="2" opacity=".5"/>' +
      '<circle cx="100" cy="98" r="11" stroke-width="2.4"/><circle class="vc-led" cx="100" cy="98" r="5" fill="currentColor" stroke="none" opacity=".45"/>' +
      '<circle cx="100" cy="124" r="3.4" fill="currentColor" stroke="none" opacity=".5"/>' +
      '<path d="M138 112l9 6" stroke-width="2.2" opacity=".5"/></g></g>' +
      '<g class="vc-bolt" fill="currentColor" stroke="none" opacity="0"><path d="M3 -9L-6 2H-1L-3 10L6 -2H1Z" transform="translate(100 158)"/></g></svg>';
    return h('div.vc-art', { html: svg });
  }

  function render(ctx, item, o) {
    var t = T(ctx), alive = true, reg = {}, hs0 = ctx.hass();
    var features = ((ctx.state(item.id) || {}).attributes || {}).supported_features || 0;
    var art = robot(), stateEl = h('div.vc-state'), subEl = h('div.vc-sub'), batEl = h('div.vc-bat');
    var head = h('div.vc-head', null, stateEl, h('div.vc-line', null, subEl, batEl));
    function key(id, icon, label, onclick) {
      return h('div.vc-key', null, h('button.vc-btn', { type: 'button', 'aria-label': label, dataset: { act: id }, onclick: function () { ctx.haptic && ctx.haptic(8); onclick(); }, html: icon.indexOf('<svg') === 0 ? icon : UI.icon(icon, 24) }), h('span', null, label));
    }
    var startBtn = key('start', 'play', t('vc.start'), function () { var s = (ctx.state(item.id) || {}).state; svc(ctx, item, s === 'cleaning' ? 'pause' : 'start').catch(function () {}); });
    var keys = h('div.vc-keys', null, startBtn);
    if (L.has(features, 8)) keys.appendChild(key('stop', '<svg class="oi" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2.4" fill="currentColor"/></svg>', t('vc.stop'), function () { svc(ctx, item, 'stop').catch(function () {}); }));
    keys.appendChild(key('dock', 'home', t('vc.dock'), function () { svc(ctx, item, 'return_to_base').catch(function () {}); }));
    if (L.has(features, 512)) keys.appendChild(key('locate', 'search', t('vc.locate'), function () { svc(ctx, item, 'locate').catch(function () {}); }));
    var favEl = h('div.vc-jobs.vc-fav'), modeEl = h('div.vc-jobs.vc-mode'), roomsEl = h('div.vc-jobs.vc-rooms'), optEl = h('div.vc-card.vc-opt'), maintEl = h('div.vc-card.vc-maint'), mapEl = h('div.vc-card.vc-map'), robotMap = null, sigs = {}, mapState = { kind: '' }, confirm = { key: '', t: 0 };
    var alerts = h('div.vc-alerts'), jobsEl = h('div.vc-jobs'), next = h('div.vc-card.vc-next'), runsEl = h('div.vc-card.vc-runs');
    var tiles = h('div.vc-tiles'), last = h('div.vc-last'), mis = h('div.vc-mis'), jobsSig = '', prevState = null, runs = { rows: null, at: 0, loading: false };
    var root = h('div.dctl.vc', { dataset: { state: 'idle' } }, head, alerts, art, keys, favEl, jobsEl, modeEl, roomsEl, tiles, next, last, runsEl, optEl, maintEl, mapEl, mis);

    function clock(iso) {
      var d = new Date(iso); if (!isFinite(d)) return '';
      var tf = ctx.settings.get().timeFormat, op = { hour: 'numeric', minute: '2-digit' };
      if (tf === '12' || tf === '12h') op.hour12 = true; else if (tf === '24' || tf === '24h') op.hour12 = false;
      try { return d.toLocaleTimeString(ctx.lang(), op); } catch (e) { return ''; }
    }
    function dayLabel(ts) {
      var d0 = new Date(), d1 = new Date(ts), n; d0.setHours(0, 0, 0, 0); d1.setHours(0, 0, 0, 0); n = Math.round((d1 - d0) / 86400000);
      if (n === 0) return t('vc.today'); if (n === 1) return t('vc.tomorrow'); if (n === -1) return t('vc.yesterday');
      try { return new Date(ts).toLocaleDateString(ctx.lang(), { weekday: 'short', day: 'numeric', month: 'short' }); } catch (e) { return ''; }
    }
    function runJob(j) {
      var VS = g.OkieMotor.vacSchedule, calls = VS.jobCalls(j, item.id); ctx.haptic && ctx.haptic(10);
      calls.reduce(function (p, c) { return p.then(function () { return ctx.call(c.domain, c.service, c.data); }); }, Promise.resolve()).then(function () { ctx.engine.recordUse(item.id); ctx.toast('success', core.t('vs.job_started', ctx.lang(), { n: j.name })); }, function () { ctx.toast('error', core.t('vs.job_failed', ctx.lang())); });
    }
    /** The cleans of the last days, from the history of the vacuum. */
    function loadRuns(force) {
      if (!alive || runs.loading || (!force && Date.now() - runs.at < 60000)) return;
      runs.loading = true; var end = Date.now();
      Promise.resolve(ctx.callWS({ type: 'history/history_during_period', start_time: new Date(end - 7 * 86400000).toISOString(), end_time: new Date(end).toISOString(), entity_ids: [item.id], include_start_time_state: true, significant_changes_only: false, minimal_response: true, no_attributes: true }))
        .then(function (res) { runs.rows = runsFromHistory((res && res[item.id]) || [], Date.now()); }, function () { runs.rows = null; })
        .then(function () { runs.loading = false; runs.at = Date.now(); if (alive) drawRuns(); });
    }
    function drawRuns() {
      runsEl.innerHTML = ''; var rows = runs.rows || [];
      if (rows.length) {
        runsEl.appendChild(h('div.vc-tl', null, t('vc.recent')));
        rows.slice(0, 5).forEach(function (r) {
          var span = clock(new Date(r.start).toISOString()) + (r.open ? ' …' : ' – ' + clock(new Date(r.end).toISOString()));
          runsEl.appendChild(h('div.vc-run' + (r.ended === 'error' ? '.bad' : ''), { dataset: { mins: String(r.mins) } }, h('span.vc-rd', null, dayLabel(r.start)), h('span.vc-rt', null, span), h('b', null, r.open ? t('vc.running') : (r.mins < 1 ? t('vc.lt_min') : fmtStat(r.mins, 'min')))));
        });
      }
      runsEl.hidden = !rows.length;
    }
    /** Rebuild a section only when what it shows changed, so a button is not replaced under a finger. */
    function section(el, sig, build) { if (sigs[el.className] === sig) return; sigs[el.className] = sig; el.innerHTML = ''; el.hidden = !build(); }
    function act(domain, service, data, okMsg) {
      ctx.haptic && ctx.haptic(8);
      return Promise.resolve(ctx.call(domain, service, data)).then(function (r) { if (okMsg) ctx.toast('success', okMsg); return r; }, function (e) { ctx.toast('error', core.t('d.failed', ctx.lang(), { name: item.name })); throw e; });
    }
    function chip(cls, icon, text, onclick, extra) {
      return h('button.vc-job' + (cls ? '.' + cls : ''), Object.assign({ type: 'button', onclick: onclick }, extra || {}), icon ? h('span.vc-ji', { html: icon }) : null, h('span', null, text), cls && /(^|\.)run/.test(cls) ? h('span.vc-jp', { html: UI.icon('play', 14) }) : null);
    }
    function nativeSelect(id, label, options, value) {
      var sel = h('select.src-sel', { 'aria-label': label, onchange: function () { act('select', 'select_option', { entity_id: id, option: this.value }).catch(function () {}); } });
      options.forEach(function (o) { sel.appendChild(h('option', { value: o }, o)); }); sel.value = value;
      return h('div.vc-orow', null, h('span', null, label), h('div.src-selw', null, sel, h('span.src-chev', { html: UI.icon('chevdown', 16) })));
    }
    function drawExt(X, states, a) {
      var VS = g.OkieMotor.vacSchedule, kicon = function (k) { return VS ? VS.kindIcon(k, 16) : ''; };
      // your iRobot favorites
      section(favEl, 'f' + X.favorites.map(function (f) { return f.id + f.name; }).join('~'), function () {
        if (!X.favorites.length) return false;
        favEl.appendChild(h('div.vc-tl', null, t('vc.fav'))); var row = h('div.vc-jobrow');
        X.favorites.forEach(function (f) {
          row.appendChild(chip('run', kicon(VS ? VS.favoriteKind(f.name) : 'vacuum'), f.name, function () { act('roomba_plus', 'run_favorite', { entity_id: item.id, favorite_id: f.id }, t('vc.started', { n: f.name })).then(function () { ctx.engine.recordUse(item.id); }).catch(function () {}); }, { dataset: { fav: f.id } }));
        });
        favEl.appendChild(row); return true;
      });
      // how the next room clean cleans
      var cur = X.modeSel && states[X.modeSel] ? states[X.modeSel].state : '';
      section(modeEl, 'm' + X.modes.join() + cur, function () {
        if (!X.modeSel || !X.modes.length) return false;
        modeEl.appendChild(h('div.vc-tl', null, t('vc.mode'))); var row = h('div.vc-jobrow');
        X.modes.forEach(function (m) {
          row.appendChild(chip('pick' + (cur === m ? '.on' : ''), kicon(m === 'mop' ? 'mop' : m === 'vacuum' ? 'vacuum' : 'both'), t('vc.m.' + m), function () { act('select', 'select_option', { entity_id: X.modeSel, option: m }).catch(function () {}); }, { dataset: { mode: m }, 'aria-pressed': cur === m ? 'true' : 'false' }));
        });
        modeEl.appendChild(row); return true;
      });
      // one tap cleans one room
      section(roomsEl, 'r' + X.rooms.concat(X.zones).join('~') + (X.zoneBtn || ''), function () {
        var names = X.rooms.concat(X.zones); if (!X.zoneSel || !X.zoneBtn || !names.length) return false;
        roomsEl.appendChild(h('div.vc-tl', null, t('vc.rooms'))); var row = h('div.vc-jobrow');
        names.forEach(function (n) {
          row.appendChild(chip('run', kicon('room'), n.trim(), function () {
            act('select', 'select_option', { entity_id: X.zoneSel, option: n }).then(function () { return act('button', 'press', { entity_id: X.zoneBtn }, t('vc.started', { n: n.trim() })); }).then(function () { ctx.engine.recordUse(item.id); }).catch(function () {});
          }, { dataset: { room: n } }));
        });
        roomsEl.appendChild(row); roomsEl.appendChild(h('div.vc-hint', null, t('vc.rooms_hint'))); return true;
      });
      // the settings of the robot
      var selSig = [X.passesSel].concat(X.padSels).map(function (id) { return id ? id + (states[id] || {}).state : ''; }).join('|');
      section(optEl, 'o' + X.switches.map(function (s) { return s.id + s.on; }).join() + selSig, function () {
        if (!X.switches.length && !X.passesSel && !X.padSels.length) return false;
        optEl.appendChild(h('div.vc-tl', null, t('vc.options')));
        [X.passesSel].concat(X.padSels).forEach(function (id) {
          if (!id || !states[id]) return;
          var A = states[id].attributes || {}, label = (A.friendly_name || id).replace((a.friendly_name || '\u0000'), '').replace(/^\s*(Setting)\s*[–-]\s*/i, '').trim();
          optEl.appendChild(nativeSelect(id, label, A.options || [], states[id].state));
        });
        X.switches.forEach(function (s) {
          optEl.appendChild(h('div.vc-orow', { dataset: { sw: s.id } }, h('span', null, s.label),
            h('button.sw' + (s.on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': s.on ? 'true' : 'false', 'aria-label': s.label, onclick: function () { act('switch', 'toggle', { entity_id: s.id }).catch(function () {}); } }, h('i'))));
        });
        return true;
      });
      // maintenance
      section(maintEl, 'k' + X.maint.map(function (m) { return m.id + m.remaining + m.due; }).join() + (confirm.key || ''), function () {
        if (!X.maint.length) return false;
        maintEl.appendChild(h('div.vc-tl', null, t('vc.maint')));
        X.maint.forEach(function (m) {
          var pct = Math.max(0, Math.min(100, m.remaining / m.max * 100)), asking = confirm.key === m.id;
          var rs = m.reset ? h('button.vc-rs' + (asking ? '.ask' : ''), { type: 'button', dataset: { reset: m.key }, onclick: function () {
            if (confirm.key !== m.id) { confirm = { key: m.id, t: Date.now() }; sigs[maintEl.className] = ''; drawExt(ext(ctx.hass().states, item.id, reg), ctx.hass().states, (ctx.state(item.id) || {}).attributes || {}); setTimeout(function () { if (confirm.key === m.id && Date.now() - confirm.t >= 3900) { confirm = { key: '', t: 0 }; sigs[maintEl.className] = ''; if (alive) drawExt(ext(ctx.hass().states, item.id, reg), ctx.hass().states, (ctx.state(item.id) || {}).attributes || {}); } }, 4000); return; }
            confirm = { key: '', t: 0 }; act('button', 'press', { entity_id: m.reset }, t('vc.reset_done')).catch(function () {});
          } }, asking ? t('vc.confirm') : t('vc.replaced')) : null;
          maintEl.appendChild(h('div.vc-mrow' + (m.due ? '.due' : ''), { dataset: { part: m.key } }, h('div.vc-mt', null, h('span', null, m.label), h('b', null, m.due ? t('vc.due') : t('vc.h_left', { n: Math.round(m.remaining) }))),
            h('div.vc-bar', null, h('i.' + (m.due ? 'low' : pct < 25 ? 'mid' : 'good'), { style: { width: Math.max(2, pct) + '%' } })), rs));
        });
        return true;
      });
      // the map
      var RM = g.OkieMotor.robomap;
      if (RM && RM.available()) {      // our floor plan with what the robot cleaned drawn over it; the robot's own pictures sit behind a fold
        if (!robotMap) { mapEl.innerHTML = ''; robotMap = RM.mount(ctx, mapEl, item.id, { pictures: X.maps }); }
        mapEl.hidden = false; robotMap.update(X); return;
      }
      var kinds = X.maps.map(function (m) { return m.kind; }); if (kinds.indexOf(mapState.kind) < 0) mapState.kind = kinds[0] || '';
      var curMap = X.maps.filter(function (m) { return m.kind === mapState.kind; })[0], hsn = ctx.hass(), url = curMap ? (hsn.hassUrl ? hsn.hassUrl(curMap.url) : curMap.url) : '';
      section(mapEl, 'p' + kinds.join() + mapState.kind, function () {
        if (!curMap) return false;
        mapEl.appendChild(h('div.vc-tl', null, t('vc.map')));
        if (X.maps.length > 1) { var row = h('div.vc-jobrow'); X.maps.forEach(function (m) { row.appendChild(chip('pick' + (m.kind === mapState.kind ? '.on' : ''), '', t('vc.map_' + m.kind), function () { mapState.kind = m.kind; sigs[mapEl.className] = ''; drawExt(ext(ctx.hass().states, item.id, reg), ctx.hass().states, (ctx.state(item.id) || {}).attributes || {}); }, { dataset: { map: m.kind } })); }); mapEl.appendChild(row); }
        mapEl.appendChild(h('img.vc-mapimg', { alt: t('vc.map'), decoding: 'async' }));
        return true;
      });
      var img = mapEl.querySelector('.vc-mapimg'); if (img && url && img.getAttribute('src') !== url) img.setAttribute('src', url);
    }
    function tile(cls, label, value, sub, bar, tone) {
      return h('div.vc-tile' + (cls ? '.' + cls : ''), null, h('div.vc-tl', null, label), h('div.vc-tv', null, value), sub ? h('div.vc-ts', null, sub) : null,
        bar != null ? h('div.vc-bar', null, h('i.' + (tone || 'neutral'), { style: { width: Math.max(2, Math.min(100, bar)) + '%' } })) : null);
    }
    function draw(st) {
      var hsn = ctx.hass(), states = hsn.states, a = st.attributes || {};
      var ids = siblings(states, item.id, reg), r = roles(states, ids);
      var vs = visualState(st.state); root.dataset.state = vs;
      stateEl.textContent = L.stateLabel(st.state, ctx.lang());
      var ago = st.last_changed ? L.relativeTime(Date.now() - Date.parse(st.last_changed), ctx.lang()) : '';
      subEl.textContent = ago;
      var bat = batteryOf(states, st, r), chg = isCharging(states, st, r);
      batEl.innerHTML = ''; batEl.hidden = bat == null;
      if (bat != null) { batEl.appendChild(h('span.vc-bt.' + batteryTone(bat), null, bat + '%')); if (chg) batEl.appendChild(h('span.vc-bolt', { html: UI.icon('bolt', 16), 'aria-label': t('vc.charging') })); }
      // the keys follow what the vacuum can do now
      var cl = st.state === 'cleaning';
      var sb = startBtn.querySelector('button'); sb.innerHTML = UI.icon(cl ? 'pause' : 'play', 24); startBtn.lastChild.textContent = cl ? t('vc.pause') : t('vc.start');
      sb.disabled = cl && !L.has(features, 4);
      [['stop', cl || st.state === 'paused' || st.state === 'returning'], ['dock', st.state !== 'docked' && st.state !== 'returning']].forEach(function (p) { var b = keys.querySelector('[data-act="' + p[0] + '"]'); if (b) b.disabled = !p[1]; });
      // what needs you, your own jobs, the next scheduled clean
      var X = ext(states, item.id, reg), dueLabels = X.maint.filter(function (m) { return m.due; }).map(function (m) { return m.label; });
      var al = attention(st.state, a, bat, chg, dueLabels); alerts.innerHTML = '';
      al.forEach(function (x) { alerts.appendChild(h('div.vc-alert', { role: 'status', dataset: { alert: x.id } }, h('span.vc-ai', { html: UI.icon('warn', 18) }), t(x.id === 'error' && x.detail ? 'vc.al.error_d' : 'vc.al.' + x.id, { d: x.detail }))); });
      alerts.hidden = !al.length;
      var VS = g.OkieMotor.vacSchedule, js = VS ? VS.jobsFrom((ctx.settings.get().vacuum || {}).jobs) : [], sig = js.map(function (j) { return j.id + '|' + j.name + '|' + j.kind; }).join('~');
      if (sig !== jobsSig) {
        jobsSig = sig; jobsEl.innerHTML = '';
        if (js.length) {
          jobsEl.appendChild(h('div.vc-tl', null, t('vc.jobs')));
          var jr = h('div.vc-jobrow');
          js.forEach(function (j) { jr.appendChild(h('button.vc-job', { type: 'button', dataset: { job: j.id }, onclick: function () { runJob(j); } }, h('span.vc-ji', { html: VS.kindIcon(j.kind, 16) }), h('span', null, j.name), h('span.vc-jp', { html: UI.icon('play', 14) }))); });
          jobsEl.appendChild(jr);
        }
        jobsEl.hidden = !js.length;
      }
      drawExt(X, states, a);
      var nx = nextSchedule(states, item.id), rn = X.nextClean; if (rn && (!nx || rn < nx.ts)) nx = { ts: rn, name: '' }; next.innerHTML = '';
      if (nx) { next.appendChild(h('div.vc-tl', null, t('vc.next'))); next.appendChild(h('div.vc-lv', null, dayLabel(nx.ts) + ' · ' + clock(new Date(nx.ts).toISOString()) + (nx.name ? ' · ' + nx.name : ''))); }
      next.hidden = !nx;
      if (prevState != null && prevState !== st.state) setTimeout(function () { loadRuns(true); }, 2500);       // a clean began or ended: the recorder has it a moment later
      prevState = st.state;
      // tiles
      tiles.innerHTML = '';
      if (bat != null) tiles.appendChild(tile('', t('vc.battery'), bat + '%', chg ? t('vc.charging') : '', bat, batteryTone(bat)));
      var tank = a.tank_level != null ? parseFloat(a.tank_level) : numberOf(states, r.tank);
      if (a.tank_present === false) tiles.appendChild(tile('', t('vc.tank'), t('vc.no_tank'), '', null));
      else if (tank != null && isFinite(tank)) tiles.appendChild(tile('', t('vc.tank'), Math.round(tank) + '%', '', tank, 'water'));
      var full = a.bin_full != null ? !!a.bin_full : (r.binFull && states[r.binFull] ? states[r.binFull].state === 'on' : null);
      if (a.bin_present === false) tiles.appendChild(tile('warn', t('vc.bin'), t('vc.bin_gone'), '', null));
      else if (full != null) tiles.appendChild(tile(full ? 'warn' : '', t('vc.bin'), full ? t('vc.bin_full') : t('vc.bin_ok'), '', null));
      var pad = padLabel(a.detected_pad); if (pad) tiles.appendChild(tile('', t('vc.pad'), pad, '', null));
      tiles.hidden = !tiles.children.length;
      // last clean
      last.innerHTML = '';
      var lastIso = r.last && states[r.last] && states[r.last].state;
      if (lastIso && isFinite(Date.parse(lastIso))) {
        last.appendChild(h('div.vc-tl', null, t('vc.last'))); last.appendChild(h('div.vc-lv', null, clock(lastIso) + ' · ' + L.relativeTime(Date.now() - Date.parse(lastIso), ctx.lang())));
      } last.hidden = !last.children.length;
      // missions
      mis.innerHTML = '';
      var total = numberOf(states, r.total), ok = numberOf(states, r.ok), cn = numberOf(states, r.canceled), fl = numberOf(states, r.failed);
      var rows = [['scrubs', 'vc.scrubs'], ['avg', 'vc.avg'], ['cleanTime', 'vc.clean_time'], ['area', 'vc.area'], ['cycles', 'vc.cycles']].map(function (p) {
        var v = numberOf(states, r[p[0]]); if (v == null) return null;
        var unit = (states[r[p[0]]].attributes || {}).unit_of_measurement || ''; if (/^(Scrubs|Missions)$/.test(unit)) unit = '';
        return h('div.vc-row', null, h('span', null, t(p[1])), h('b', null, fmtStat(v, unit)));
      }).filter(Boolean);
      if (total != null) {
        var sh = missionShares(ok, cn, fl, total);
        mis.appendChild(h('div.vc-tl', null, t('vc.missions')));
        mis.appendChild(h('div.vc-mn', null, t('vc.mission_n', { n: Math.round(total) })));
        mis.appendChild(h('div.vc-mbar', null, h('i.ok', { style: { width: sh[0] + '%' } }), h('i.cn', { style: { width: sh[1] + '%' } }), h('i.fl', { style: { width: sh[2] + '%' } })));
        mis.appendChild(h('div.vc-leg', null, [['ok', 'vc.ok', ok], ['cn', 'vc.canceled', cn], ['fl', 'vc.failed', fl]].filter(function (x) { return x[2] != null; }).map(function (x) { return h('span', null, h('i.' + x[0]), t(x[1]) + ' ' + Math.round(x[2])); })));
      }
      rows.forEach(function (rw) { mis.appendChild(rw); });
      mis.hidden = !mis.children.length;
    }
    // the sensors next to the vacuum: found through the registry once it has answered, drawn at once by name before that
    registry(ctx).then(function (m) { if (!alive) return; reg = m; draw(ctx.state(item.id) || {}); });
    loadRuns();
    return { el: root, dispose: function () { alive = false; if (robotMap) robotMap.dispose(); }, update: function (st) { draw(st); } };
  }

  var CSS = [
    '.vc{gap:18px;align-items:stretch;width:100%;}',
    '.vc-head{display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;}.vc-state{font-size:40px;font-weight:300;letter-spacing:-.02em;line-height:1.05;}',
    '.vc-line{display:flex;align-items:center;justify-content:center;gap:14px;font-size:15px;color:var(--okie-text-dim);}.vc-bat{display:flex;align-items:center;gap:6px;font-weight:700;}.vc-bat[hidden]{display:none;}',
    '.vc-bt{color:#fff;}.vc-bt.low{color:#ff7a6e;}.vc-bt.mid{color:#ffc266;}.vc-bt.good{color:#8fe3a8;}.vc-bolt{color:#8fe3a8;display:grid;}',
    '.vc-art{width:min(230px,62vw);aspect-ratio:1;align-self:center;color:rgba(255,255,255,.9);position:relative;}.vc-art svg{display:block;overflow:visible;}',
    // the robot: where it is and how it moves
    '.vc-bot{transform-box:fill-box;transform-origin:center;transition:transform .9s cubic-bezier(.3,.8,.3,1);}.vc-turn{transform-box:fill-box;transform-origin:center;}',
    '.vc[data-state="docked"] .vc-bot{transform:translate(0,6px);}.vc[data-state="docked"] .vc-bolt{opacity:.95;color:#8fe3a8;}.vc[data-state="docked"] .vc-led{animation:vc-pulse 2.6s ease-in-out infinite;}',
    '.vc[data-state="idle"] .vc-bot,.vc[data-state="paused"] .vc-bot{transform:translate(-4px,-14px);}.vc[data-state="paused"] .vc-art{opacity:.7;}',
    '.vc[data-state="cleaning"] .vc-bot{animation:vc-roam 11s ease-in-out infinite;}.vc[data-state="cleaning"] .vc-turn{animation:vc-spin 11s ease-in-out infinite;}.vc[data-state="cleaning"] .vc-trail{opacity:.55;}',
    '.vc[data-state="returning"] .vc-bot{animation:vc-home 3.2s ease-in-out infinite alternate;}',
    '.vc[data-state="error"] .vc-art{color:#ff8a7e;}.vc[data-state="error"] .vc-led{animation:vc-pulse 1s ease-in-out infinite;}',
    '@keyframes vc-roam{0%{transform:translate(-30px,-8px)}25%{transform:translate(8px,-34px)}50%{transform:translate(34px,-6px)}75%{transform:translate(2px,10px)}100%{transform:translate(-30px,-8px)}}',
    '@keyframes vc-spin{0%{transform:rotate(-14deg)}50%{transform:rotate(20deg)}100%{transform:rotate(-14deg)}}@keyframes vc-home{from{transform:translate(-26px,-16px)}to{transform:translate(0,6px)}}@keyframes vc-pulse{0%,100%{opacity:.25}50%{opacity:.9}}',
    '@media (prefers-reduced-motion:reduce){.vc-bot,.vc-turn,.vc-led{animation:none !important;}}',
    '.vc-keys{display:flex;justify-content:center;gap:12px;flex-wrap:wrap;}.vc-key{display:flex;flex-direction:column;align-items:center;gap:8px;font-size:12.5px;font-weight:600;color:rgba(255,255,255,.8);}',
    '.vc-btn{width:68px;height:68px;border-radius:24px;background:rgba(255,255,255,.14);display:grid;place-items:center;color:#fff;transition:background .15s ease,transform .12s ease;touch-action:manipulation;}.vc-btn:active{background:rgba(255,255,255,.28);transform:scale(.96);}.vc-btn[disabled]{opacity:.35;pointer-events:none;}',
    '.vc-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(138px,1fr));gap:10px;}.vc-tiles[hidden],.vc-last[hidden],.vc-mis[hidden]{display:none;}',
    '.vc-tile{padding:14px 16px;border-radius:20px;background:rgba(255,255,255,.09);display:flex;flex-direction:column;gap:4px;min-width:0;}.vc-tile.warn{background:rgba(255,130,100,.2);}',
    '.vc-tl{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--okie-text-dim);}.vc-tv{font-size:24px;font-weight:600;line-height:1.15;overflow-wrap:anywhere;}.vc-ts{font-size:12.5px;color:var(--okie-text-dim);}',
    '.vc-bar{height:6px;border-radius:999px;background:rgba(255,255,255,.14);overflow:hidden;margin-top:6px;}.vc-bar i{display:block;height:100%;border-radius:999px;background:#fff;}.vc-bar i.good{background:#8fe3a8;}.vc-bar i.mid{background:#ffc266;}.vc-bar i.low{background:#ff7a6e;}.vc-bar i.water{background:#7fb8ff;}',
    '.vc-last{padding:14px 16px;border-radius:20px;background:rgba(255,255,255,.09);display:flex;flex-direction:column;gap:4px;}.vc-lv{font-size:18px;font-weight:600;}',
    '.vc-mis{padding:16px;border-radius:22px;background:rgba(255,255,255,.09);display:flex;flex-direction:column;gap:10px;}.vc-mn{font-size:26px;font-weight:600;}',
    '.vc-mbar{display:flex;height:10px;border-radius:999px;overflow:hidden;background:rgba(255,255,255,.1);}.vc-mbar i{display:block;height:100%;}.vc-mbar .ok{background:#8fe3a8;}.vc-mbar .cn{background:#ffc266;}.vc-mbar .fl{background:#ff7a6e;}',
    '.vc-leg{display:flex;flex-wrap:wrap;gap:6px 16px;font-size:13px;color:rgba(255,255,255,.8);}.vc-leg i{display:inline-block;width:9px;height:9px;border-radius:50%;margin-right:6px;}.vc-leg .ok{background:#8fe3a8;}.vc-leg .cn{background:#ffc266;}.vc-leg .fl{background:#ff7a6e;}',
    '.vc-row{display:flex;justify-content:space-between;gap:12px;padding:8px 0;border-top:1px solid rgba(255,255,255,.08);font-size:14px;}.vc-row span{color:var(--okie-text-dim);}.vc-row b{font-weight:600;}',
    '.vc-card{padding:14px 16px;border-radius:20px;background:rgba(255,255,255,.09);display:flex;flex-direction:column;gap:4px;}.vc-runs{padding:16px;border-radius:22px;gap:2px;}.vc-card .vc-lv{font-size:18px;font-weight:600;}',
    '.vc-job.on{background:#fff;color:#1d1b19;}.vc-job.on .vc-ji{color:#1d1b19;}.vc-hint{font-size:12.5px;color:var(--okie-text-dim);margin-top:8px;}',
    '.vc-opt .vc-tl,.vc-maint .vc-tl,.vc-map .vc-tl{margin-bottom:4px;}.vc-orow{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid rgba(255,255,255,.08);font-size:14.5px;}.vc-orow:first-of-type{border-top:0;}.vc-orow .src-selw{flex:none;min-width:130px;}',
    '.vc-mrow{padding:10px 0;border-top:1px solid rgba(255,255,255,.08);display:flex;flex-wrap:wrap;align-items:center;gap:6px 12px;}.vc-mrow:first-of-type{border-top:0;}.vc-mt{flex:1 1 100%;display:flex;justify-content:space-between;gap:10px;font-size:14.5px;}.vc-mt b{font-weight:600;}.vc-mrow.due .vc-mt b{color:#ff9d92;}.vc-mrow .vc-bar{flex:1 1 140px;margin:0;}',
    '.vc-rs{padding:7px 13px;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:12.5px;font-weight:600;flex:none;}.vc-rs.ask{background:#fff;color:#1d1b19;}',
    '.vc-mapimg{display:block;width:100%;height:auto;border-radius:14px;background:rgba(255,255,255,.06);margin-top:6px;}',
    '.vc-alerts{display:flex;flex-direction:column;gap:8px;}.vc-alerts[hidden],.vc-jobs[hidden],.vc-next[hidden],.vc-runs[hidden],.vc-card[hidden]{display:none;}',
    '.vc-alert{display:flex;align-items:center;gap:10px;padding:12px 14px;border-radius:18px;background:rgba(255,150,80,.22);color:#ffdcbc;font-size:14px;font-weight:600;text-align:left;}.vc-ai{display:grid;flex:none;}',
    '.vc-jobrow{display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;}.vc-job{display:inline-flex;align-items:center;gap:8px;padding:11px 14px;border-radius:999px;background:rgba(255,255,255,.14);color:#fff;font-size:14px;font-weight:600;touch-action:manipulation;}.vc-job:active{background:rgba(255,255,255,.28);}',
    '.vc-ji{display:inline-flex;}.vc-jp{display:inline-flex;opacity:.7;}',
    '.vc-run{display:flex;align-items:baseline;gap:10px;padding:8px 0;border-top:1px solid rgba(255,255,255,.08);font-size:14px;}.vc-rd{flex:none;width:76px;color:var(--okie-text-dim);}.vc-rt{flex:1;min-width:0;font-variant-numeric:tabular-nums;}.vc-run b{font-weight:600;}.vc-run.bad b{color:#ff9d92;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  g.OkieMotor.vacuum = Object.assign({ render: render, CSS: CSS, registry: registry }, pureApi);
})(typeof globalThis !== 'undefined' ? globalThis : window);

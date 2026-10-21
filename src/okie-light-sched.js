/* okie-light-sched: schedules, history and context for the light modes (the tabs of the Light modes view).
 *
 * A schedule of a mode is a Home Assistant automation that Okie Motor writes (config/automation/config/<id>), so it runs on the server with no screen open:
 *   - at a time, on the days you pick
 *   - at sunrise or sunset, with an offset ("30 min before sunset")
 *   - when something happens: someone arrives or leaves, motion, a door or window opens, a light or the TV turns on ...
 *   - optionally only after dark
 * The automation carries the whole schedule in its description (after "okie-lm:"), so the card can read it back and edit it; the ids start with
 * "okie_lm_" and nothing else is ever touched. Schedules made before with the Scheduler component are still listed (switch and delete only).
 *
 * The pure part (specs, the automation they make, reading it back, the state choices of an entity, merging the runs of the history) is unit-tested;
 * the DOM part is checked in the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var LM = isNode ? require('./okie-light-modes.js') : (g.OkieMotor && g.OkieMotor.lightModes);
  var TS = isNode ? require('./okie-thermo-sched.js') : (g.OkieMotor && g.OkieMotor.thermoSchedule);
  if (!LM || !TS) return;
  var DAYS = TS.DAYS, WEEKDAYS = TS.WEEKDAYS, WEEKEND = TS.WEEKEND;

  var PREFIX = 'okie_lm_', MARK = 'okie-lm:', MAX_OFFSET = 360, FOR_MIN = [0, 1, 5, 10, 30, 60], OFFSETS = [5, 10, 15, 30, 45, 60, 90, 120];
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var str = function (v, n) { return String(v == null ? '' : v).trim().slice(0, n || 80); };

  // ---------------------------------------------------------------- specs ----
  /** A schedule made safe: { kind: 'time'|'sun'|'event', days, dark, time | event + offset | when: { entity, to, forMin } }; null when it cannot run. */
  function cleanSpec(s) {
    if (!s || typeof s !== 'object') return null;
    var kind = s.kind === 'sun' ? 'sun' : (s.kind === 'event' ? 'event' : 'time');
    var days = DAYS.filter(function (d) { return [].concat(s.days || []).indexOf(d) >= 0; });
    if (!days.length) days = DAYS.slice();
    var out = { kind: kind, days: days, dark: s.dark === true && kind !== 'sun' };
    if (kind === 'time') {
      var m = /^(\d{1,2}):(\d{2})/.exec(String(s.time || ''));
      if (!m || +m[1] > 23 || +m[2] > 59) return null;
      out.time = pad(+m[1]) + ':' + m[2];
    } else if (kind === 'sun') {
      out.event = s.event === 'sunrise' ? 'sunrise' : 'sunset';
      out.offset = Math.max(-MAX_OFFSET, Math.min(MAX_OFFSET, Math.round(+s.offset || 0)));
    } else {
      var w = s.when || {}, e = str(w.entity, 120), to = str(w.to, 40);
      if (!/^[a-z_]+\.[a-z0-9_]+$/.test(e) || !to) return null;
      out.when = { entity: e, to: to, forMin: FOR_MIN.indexOf(+w.forMin) >= 0 ? +w.forMin : 0 };
    }
    return out;
  }
  /** Minutes (signed) as the offset of Home Assistant's sun trigger: "-00:30:00", "01:15:00"; '' for none. */
  function offsetString(min) { var m = Math.round(+min || 0); if (!m) return ''; var a = Math.abs(m); return (m < 0 ? '-' : '') + pad(Math.floor(a / 60)) + ':' + pad(a % 60) + ':00'; }
  function triggersFor(spec) {
    if (spec.kind === 'time') return [{ platform: 'time', at: spec.time + ':00' }];
    if (spec.kind === 'sun') { var t = { platform: 'sun', event: spec.event }, o = offsetString(spec.offset); if (o) t.offset = o; return [t]; }
    var tr = { platform: 'state', entity_id: spec.when.entity, to: spec.when.to };
    if (spec.when.forMin) tr.for = spec.when.forMin >= 60 ? { hours: Math.floor(spec.when.forMin / 60), minutes: spec.when.forMin % 60, seconds: 0 } : { hours: 0, minutes: spec.when.forMin, seconds: 0 };
    return [tr];
  }
  function conditionsFor(spec) {
    var out = [];
    if (spec.days.length < 7) out.push({ condition: 'time', weekday: spec.days.slice() });
    if (spec.dark) out.push({ condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' });
    return out;
  }
  /** The steps of a mode as automation actions (target and data apart, the way Home Assistant writes them). */
  function actionsFor(mode) {
    return LM.actionsFor(mode).map(function (a) {
      var d = Object.assign({}, a.service_data || {}), act = { service: a.service }, target = {};
      if (a.entity_id) target.entity_id = a.entity_id;
      if (d.area_id) { target.area_id = d.area_id; delete d.area_id; }
      if (Object.keys(target).length) act.target = target;
      if (Object.keys(d).length) act.data = d;
      return act;
    });
  }
  function dur(min) { var a = Math.abs(min), h = Math.floor(a / 60), m = a % 60; return (h ? h + ' h' : '') + (h && m ? ' ' : '') + (m ? m + ' min' : ''); }
  function daysText(days) { return days.length === 7 ? '' : (days.join() === WEEKDAYS.join() ? 'Mon - Fri' : (days.join() === WEEKEND.join() ? 'weekend' : days.join(' '))); }
  function nameOf(states, e) { var s = states && states[e]; return (s && s.attributes && s.attributes.friendly_name) || e; }
  /** The schedule in plain English, for the name of the automation in Home Assistant. */
  function plain(spec, states) {
    var t;
    if (spec.kind === 'time') t = 'at ' + spec.time;
    else if (spec.kind === 'sun') t = (spec.offset ? dur(spec.offset) + (spec.offset < 0 ? ' before ' : ' after ') : 'at ') + spec.event;
    else t = 'when ' + nameOf(states, spec.when.entity) + ' is ' + spec.when.to + (spec.when.forMin ? ' for ' + dur(spec.when.forMin) : '');
    return [t, daysText(spec.days), spec.dark ? 'after dark' : ''].filter(Boolean).join(', ');
  }
  function autoId(modeId, taken) {
    var base = PREFIX + String(modeId).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24), id;
    do { id = base + '_' + Math.floor(Math.random() * 46656).toString(36); } while (taken && taken.indexOf(id) >= 0);
    return id;
  }
  /** The automation (the body of config/automation/config/<id>) that runs `mode` on `spec`. */
  function buildAuto(spec, mode, id, states) {
    var clean = cleanSpec(spec);
    return { id: id, alias: 'Okie · ' + mode.name + ' · ' + plain(clean, states), description: 'Made by Okie Motor (light modes). ' + MARK + JSON.stringify({ mode: mode.id, spec: clean }),
      trigger: triggersFor(clean), condition: conditionsFor(clean), action: actionsFor(mode), mode: 'single' };
  }
  /** Read one of our automations back: { id, modeId, spec, alias } or null when it is not one of ours. */
  function parseAuto(cfg) {
    if (!cfg || typeof cfg !== 'object') return null;
    var i = String(cfg.description || '').indexOf(MARK); if (i < 0) return null;
    try {
      var j = JSON.parse(String(cfg.description).slice(i + MARK.length)), spec = cleanSpec(j && j.spec);
      return spec && j.mode ? { id: String(cfg.id || ''), modeId: String(j.mode), spec: spec, alias: String(cfg.alias || '') } : null;
    } catch (e) { return null; }
  }

  // ------------------------------------------------------ what can happen ----
  var MOTION = ['motion', 'occupancy', 'presence', 'moving'], DOOR = ['door', 'window', 'garage_door', 'opening'];
  function dc(states, e) { var s = states && states[e]; return (s && s.attributes && s.attributes.device_class) || ''; }
  /** The states of an entity worth waiting for: [{ id, key }] (key: the text to look up, 'ls.st_<key>'). */
  function stateChoices(entity, states) {
    var dom = String(entity).split('.')[0], c = dc(states, entity);
    if (dom === 'person' || dom === 'device_tracker') return [{ id: 'home', key: 'arrive' }, { id: 'not_home', key: 'leave' }];
    if (dom === 'binary_sensor') {
      if (MOTION.indexOf(c) >= 0) return [{ id: 'on', key: 'motion_on' }, { id: 'off', key: 'motion_off' }];
      if (DOOR.indexOf(c) >= 0) return [{ id: 'on', key: 'opens' }, { id: 'off', key: 'closes' }];
      return [{ id: 'on', key: 'on' }, { id: 'off', key: 'off' }];
    }
    if (dom === 'lock') return [{ id: 'locked', key: 'locked' }, { id: 'unlocked', key: 'unlocked' }];
    if (dom === 'cover') return [{ id: 'open', key: 'opens' }, { id: 'closed', key: 'closes' }];
    if (dom === 'media_player') return [{ id: 'playing', key: 'playing' }, { id: 'paused', key: 'paused' }, { id: 'idle', key: 'idle' }, { id: 'off', key: 'off' }, { id: 'on', key: 'on' }];
    return [{ id: 'on', key: 'on' }, { id: 'off', key: 'off' }];
  }
  /** The entities to choose from, in groups: [{ key, ids }] (people, motion, doors and windows, lights and switches, media players, other sensors). */
  function eventGroups(states) {
    var g = { people: [], motion: [], doors: [], devices: [], media: [], other: [] };
    Object.keys(states || {}).forEach(function (e) {
      var dom = e.split('.')[0], c = dc(states, e);
      if (dom === 'person') g.people.push(e);
      else if (dom === 'binary_sensor') { if (MOTION.indexOf(c) >= 0) g.motion.push(e); else if (DOOR.indexOf(c) >= 0) g.doors.push(e); else if (['smoke', 'gas', 'battery', 'battery_charging', 'connectivity', 'update', 'problem'].indexOf(c) < 0 && !(states[e].attributes || {}).entity_category) g.other.push(e); }
      else if (dom === 'lock' || dom === 'cover') g.doors.push(e);
      else if (dom === 'light' || dom === 'switch' || dom === 'fan' || dom === 'input_boolean') g.devices.push(e);
      else if (dom === 'media_player') g.media.push(e);
    });
    var by = function (a, b) { return nameOf(states, a) < nameOf(states, b) ? -1 : 1; };
    return ['people', 'motion', 'doors', 'devices', 'media', 'other'].map(function (k) { return { key: k, ids: g[k].sort(by) }; }).filter(function (x) { return x.ids.length; });
  }

  // -------------------------------------------------------------- history ----
  var BY_RANK = { you: 3, schedule: 2, elsewhere: 1 };
  /**
   * The runs of the modes, newest first: [{ modeId, at (ms), by: 'you' | 'schedule' | 'elsewhere' }].
   * rows: logbook rows of the scripts, scenes and our automations (when in seconds); local: [{ id, at }] this device ran; autos: { automation entity id: modeId }.
   * The same run seen twice (a tap and the script it started) is one run: within 90 seconds the more personal source wins.
   */
  function mergeRuns(modes, rows, local, autos, now, days) {
    var owner = {}, runs = [];
    (modes || []).forEach(function (m) { m.run.forEach(function (it) { if ((it.type === 'script' || it.type === 'scene') && !owner[it.entity]) owner[it.entity] = m.id; }); });
    (rows || []).forEach(function (r) {
      var at = Math.round(+r.when * 1000); if (!isFinite(at)) return;
      if (autos && autos[r.entity_id]) runs.push({ modeId: autos[r.entity_id], at: at, by: 'schedule' });
      else if (owner[r.entity_id]) runs.push({ modeId: owner[r.entity_id], at: at, by: (r.context_domain === 'automation' || r.context_event_type === 'automation_triggered') ? 'schedule' : (r.context_user_id ? 'you' : 'elsewhere') });
    });
    (local || []).forEach(function (l) { if (l && l.id && isFinite(+l.at)) runs.push({ modeId: l.id, at: +l.at, by: 'you' }); });
    var known = {}; (modes || []).forEach(function (m) { known[m.id] = true; });
    var from = now - (days || 7) * 86400000;
    runs = runs.filter(function (r) { return known[r.modeId] && r.at >= from && r.at <= now + 60000; }).sort(function (a, b) { return a.at - b.at; });
    var out = [];
    runs.forEach(function (r) {
      for (var i = out.length - 1; i >= 0 && r.at - out[i].at <= 90000; i--) {
        if (out[i].modeId !== r.modeId) continue;
        if (BY_RANK[r.by] > BY_RANK[out[i].by]) out[i].by = r.by;
        return;
      }
      out.push({ modeId: r.modeId, at: r.at, by: r.by });
    });
    return out.sort(function (a, b) { return b.at - a.at; });
  }
  /** Runs per day for the last `n` days, oldest first: [{ day: 'YYYY-MM-DD', count, today }]. */
  function bucketDays(runs, now, n) {
    var out = [], d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    for (var i = n - 1; i >= 0; i--) { var d = new Date(d0.getTime()); d.setDate(d.getDate() - i); out.push({ start: d.getTime(), day: d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()), count: 0, today: i === 0 }); }
    runs.forEach(function (r) { for (var j = out.length - 1; j >= 0; j--) if (r.at >= out[j].start) { out[j].count++; break; } });
    return out.map(function (b) { return { day: b.day, count: b.count, today: b.today }; });
  }

  var pureApi = { PREFIX: PREFIX, MARK: MARK, OFFSETS: OFFSETS, FOR_MIN: FOR_MIN, cleanSpec: cleanSpec, offsetString: offsetString, triggersFor: triggersFor, conditionsFor: conditionsFor, autoActions: actionsFor, plain: plain,
    autoId: autoId, buildAuto: buildAuto, parseAuto: parseAuto, stateChoices: stateChoices, eventGroups: eventGroups, mergeRuns: mergeRuns, bucketDays: bucketDays, dur: dur };
  if (isNode) { module.exports = pureApi; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor.lightSched = pureApi;     // the DOM part below adds to it

  // ------------------------------------------------------------ DOM ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;

  core.registerStrings('en', {
    'ls.tab_modes': 'Modes', 'ls.tab_context': 'Used by', 'ls.tab_history': 'History', 'ls.tab_schedule': 'Schedule', 'ls.tab_settings': 'Look',
    'ls.none': 'Nothing is scheduled yet.', 'ls.none_hint': 'Run a mode at a time, at sunrise or sunset, or when something happens, like someone arriving home.',
    'ls.add': 'Add a schedule', 'ls.all': 'All', 'ls.new_t': 'New schedule', 'ls.edit_t': 'Edit schedule', 'ls.mode': 'Mode', 'ls.when': 'When',
    'ls.k_time': 'At a time', 'ls.k_sunrise': 'Sunrise', 'ls.k_sunset': 'Sunset', 'ls.k_event': 'When something happens',
    'ls.time': 'Time', 'ls.offset': 'Offset', 'ls.at_sun': 'Right at {s}', 'ls.before': 'Before', 'ls.after': 'After', 'ls.min': '{n} min',
    'ls.what': 'What happens', 'ls.pick': 'Choose…', 'ls.becomes': 'It', 'ls.for': 'For at least', 'ls.right_away': 'Right away',
    'ls.days': 'Days', 'ls.every': 'Every day', 'ls.weekdays': 'Mon - Fri', 'ls.weekend': 'Weekend',
    'ls.dark': 'Only after dark', 'ls.dark_hint': 'It is skipped while the sun is up.',
    'ls.save': 'Save schedule', 'ls.delete': 'Delete', 'ls.cancel': 'Cancel', 'ls.back': 'Schedule', 'ls.saved': 'Schedule saved', 'ls.deleted': 'Schedule deleted',
    'ls.failed': 'The schedule could not be saved. Writing automations needs a Home Assistant administrator.', 'ls.no_entity': 'Choose what has to happen first', 'ls.no_mode': 'Add a mode first',
    'ls.save_first': 'Save the mode first, then you can schedule it here.', 'ls.legacy': 'Scheduler', 'ls.preview': 'Runs',
    'ls.g_people': 'People', 'ls.g_motion': 'Motion', 'ls.g_doors': 'Doors and windows', 'ls.g_devices': 'Lights and switches', 'ls.g_media': 'TVs and speakers', 'ls.g_other': 'Other sensors',
    'ls.st_arrive': 'Arrives home', 'ls.st_leave': 'Leaves home', 'ls.st_motion_on': 'Detects motion', 'ls.st_motion_off': 'No more motion', 'ls.st_opens': 'Opens', 'ls.st_closes': 'Closes',
    'ls.st_on': 'Turns on', 'ls.st_off': 'Turns off', 'ls.st_locked': 'Locks', 'ls.st_unlocked': 'Unlocks', 'ls.st_playing': 'Starts playing', 'ls.st_paused': 'Pauses', 'ls.st_idle': 'Goes idle',
    'ls.sunrise': 'sunrise', 'ls.sunset': 'sunset', 'ls.s_time': 'At {t}', 'ls.s_sun': 'At {s}', 'ls.s_before': '{d} before {s}', 'ls.s_after': '{d} after {s}', 'ls.s_event': '{n}: {st}', 'ls.s_for': 'for {d}', 'ls.s_dark': 'after dark',
    'ls.h_week': 'Last 7 days', 'ls.h_runs': '{n} runs', 'ls.h_none': 'Nothing ran in the last 7 days.', 'ls.h_none_hint': 'Every run of a mode shows here: your taps, schedules and scripts started somewhere else.',
    'ls.by_you': 'by you', 'ls.by_schedule': 'by a schedule', 'ls.by_else': 'from somewhere else', 'ls.today': 'Today', 'ls.yesterday': 'Yesterday', 'ls.loading': 'Loading…',
    'ls.c_none': 'Nothing else in Home Assistant uses this mode.', 'ls.c_direct': 'This mode sets lights directly, so nothing else uses it.', 'ls.c_run': 'Run', 'ls.c_steps': 'What it does', 'ls.c_used': 'Also used by',
    'ls.c_automation': 'Automation', 'ls.c_script': 'Script', 'ls.c_scene': 'Scene',
    'ls.set_layout': 'Layout', 'ls.set_look': 'Look', 'ls.set_active': 'Mark the active mode', 'ls.set_active_d': 'The mode that ran last gets a tint and says Active.',
    'ls.set_chevron': 'Color the arrow', 'ls.set_chevron_d': 'The arrow at the end of the card takes the color of the active mode.', 'ls.set_hint': 'Show “Tap to run”', 'ls.set_hint_d': 'The small line under each name.',
    'ls.set_where': 'Where the cards show', 'ls.set_where_d': 'You choose that for each mode: open it on the Modes tab and pick Favorites and rooms under “Where it shows”.',
  });
  core.registerStrings('de', {
    'ls.tab_modes': 'Modi', 'ls.tab_context': 'Verwendet von', 'ls.tab_history': 'Verlauf', 'ls.tab_schedule': 'Zeitplan', 'ls.tab_settings': 'Aussehen',
    'ls.none': 'Noch nichts geplant.', 'ls.none_hint': 'Starte einen Modus zu einer Uhrzeit, bei Sonnenauf- oder -untergang oder wenn etwas passiert, zum Beispiel wenn jemand nach Hause kommt.',
    'ls.add': 'Zeitplan hinzufügen', 'ls.all': 'Alle', 'ls.new_t': 'Neuer Zeitplan', 'ls.edit_t': 'Zeitplan bearbeiten', 'ls.mode': 'Modus', 'ls.when': 'Wann',
    'ls.k_time': 'Zu einer Uhrzeit', 'ls.k_sunrise': 'Sonnenaufgang', 'ls.k_sunset': 'Sonnenuntergang', 'ls.k_event': 'Wenn etwas passiert',
    'ls.time': 'Uhrzeit', 'ls.offset': 'Versatz', 'ls.at_sun': 'Genau bei {s}', 'ls.before': 'Davor', 'ls.after': 'Danach', 'ls.min': '{n} Min.',
    'ls.what': 'Was passiert', 'ls.pick': 'Wählen…', 'ls.becomes': 'Es', 'ls.for': 'Mindestens', 'ls.right_away': 'Sofort',
    'ls.days': 'Tage', 'ls.every': 'Jeden Tag', 'ls.weekdays': 'Mo - Fr', 'ls.weekend': 'Wochenende',
    'ls.dark': 'Nur nach Einbruch der Dunkelheit', 'ls.dark_hint': 'Solange die Sonne scheint, wird es übersprungen.',
    'ls.save': 'Zeitplan speichern', 'ls.delete': 'Löschen', 'ls.cancel': 'Abbrechen', 'ls.back': 'Zeitplan', 'ls.saved': 'Zeitplan gespeichert', 'ls.deleted': 'Zeitplan gelöscht',
    'ls.failed': 'Der Zeitplan konnte nicht gespeichert werden. Automationen schreiben darf nur ein Home-Assistant-Administrator.', 'ls.no_entity': 'Wähle zuerst, was passieren muss', 'ls.no_mode': 'Lege zuerst einen Modus an',
    'ls.save_first': 'Speichere zuerst den Modus, dann kannst du ihn hier planen.', 'ls.legacy': 'Scheduler', 'ls.preview': 'Läuft',
    'ls.g_people': 'Personen', 'ls.g_motion': 'Bewegung', 'ls.g_doors': 'Türen und Fenster', 'ls.g_devices': 'Lichter und Schalter', 'ls.g_media': 'Fernseher und Lautsprecher', 'ls.g_other': 'Weitere Sensoren',
    'ls.st_arrive': 'Kommt nach Hause', 'ls.st_leave': 'Verlässt das Haus', 'ls.st_motion_on': 'Erkennt Bewegung', 'ls.st_motion_off': 'Keine Bewegung mehr', 'ls.st_opens': 'Öffnet sich', 'ls.st_closes': 'Schließt sich',
    'ls.st_on': 'Geht an', 'ls.st_off': 'Geht aus', 'ls.st_locked': 'Wird abgeschlossen', 'ls.st_unlocked': 'Wird aufgeschlossen', 'ls.st_playing': 'Spielt ab', 'ls.st_paused': 'Pausiert', 'ls.st_idle': 'Ist untätig',
    'ls.sunrise': 'Sonnenaufgang', 'ls.sunset': 'Sonnenuntergang', 'ls.s_time': 'Um {t}', 'ls.s_sun': 'Bei {s}', 'ls.s_before': '{d} vor {s}', 'ls.s_after': '{d} nach {s}', 'ls.s_event': '{n}: {st}', 'ls.s_for': 'für {d}', 'ls.s_dark': 'nach Einbruch der Dunkelheit',
    'ls.h_week': 'Letzte 7 Tage', 'ls.h_runs': '{n} Starts', 'ls.h_none': 'In den letzten 7 Tagen lief nichts.', 'ls.h_none_hint': 'Jeder Start eines Modus erscheint hier: deine Taps, Zeitpläne und anderswo gestartete Skripte.',
    'ls.by_you': 'von dir', 'ls.by_schedule': 'von einem Zeitplan', 'ls.by_else': 'von woanders', 'ls.today': 'Heute', 'ls.yesterday': 'Gestern', 'ls.loading': 'Lädt…',
    'ls.c_none': 'Sonst nutzt nichts in Home Assistant diesen Modus.', 'ls.c_direct': 'Dieser Modus stellt Lichter direkt ein, also nutzt ihn nichts anderes.', 'ls.c_run': 'Starten', 'ls.c_steps': 'Was er tut', 'ls.c_used': 'Außerdem verwendet von',
    'ls.c_automation': 'Automation', 'ls.c_script': 'Skript', 'ls.c_scene': 'Szene',
    'ls.set_layout': 'Anordnung', 'ls.set_look': 'Aussehen', 'ls.set_active': 'Aktiven Modus markieren', 'ls.set_active_d': 'Der zuletzt gestartete Modus bekommt eine Tönung und „Aktiv“.',
    'ls.set_chevron': 'Pfeil einfärben', 'ls.set_chevron_d': 'Der Pfeil am Ende der Karte übernimmt die Farbe des aktiven Modus.', 'ls.set_hint': '„Zum Starten tippen“ zeigen', 'ls.set_hint_d': 'Die kleine Zeile unter jedem Namen.',
    'ls.set_where': 'Wo die Karten erscheinen', 'ls.set_where_d': 'Das wählst du für jeden Modus: öffne ihn bei den Modi und wähle unter „Wo er erscheint“ die Favoriten und Räume.',
  });
  var T = function (ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; };
  var BADGE = function (m) { return 'linear-gradient(150deg,' + m.color[0] + ',' + m.color[1] + ')'; };
  function clockText(ctx, hhmm) {
    var p = String(hhmm).split(':'), d = new Date(2000, 0, 1, +p[0], +p[1] || 0), tf = ctx.settings.get().timeFormat, o = { hour: 'numeric', minute: '2-digit' };
    if (tf === '12h') o.hour12 = true; else if (tf === '24h') o.hour12 = false;
    try { return d.toLocaleTimeString(ctx.lang() === 'de' ? 'de-DE' : undefined, o); } catch (e) { return hhmm; }
  }
  function nameFor(ctx, e) { return nameOf(ctx.hass().states, e); }
  function daysLabel(ctx, days) {
    var t = T(ctx);
    return days.length === 7 ? t('ls.every') : (days.join() === WEEKDAYS.join() ? t('ls.weekdays') : (days.join() === WEEKEND.join() ? t('ls.weekend') : days.map(function (d) { return core.t('dt.' + d, ctx.lang()); }).join(' ')));
  }
  /** One schedule in words: { when: "30 min before sunset", extra: ["Mon - Fri", "after dark"] }. */
  function describe(ctx, spec) {
    var t = T(ctx), when, extra = [];
    if (spec.kind === 'time') when = t('ls.s_time', { t: clockText(ctx, spec.time) });
    else if (spec.kind === 'sun') { var s = t('ls.' + spec.event), d = dur(spec.offset).replace(/ min$/, ' ' + (ctx.lang() === 'de' ? 'Min.' : 'min')); when = !spec.offset ? t('ls.s_sun', { s: s }) : t(spec.offset < 0 ? 'ls.s_before' : 'ls.s_after', { d: d, s: s }); }
    else {
      var ch = stateChoices(spec.when.entity, ctx.hass().states).filter(function (c) { return c.id === spec.when.to; })[0];
      when = t('ls.s_event', { n: nameFor(ctx, spec.when.entity), st: ch ? t('ls.st_' + ch.key) : spec.when.to });
      if (spec.when.forMin) when += ' ' + t('ls.s_for', { d: dur(spec.when.forMin) });
    }
    if (spec.days.length < 7) extra.push(daysLabel(ctx, spec.days));
    if (spec.dark) extra.push(t('ls.s_dark'));
    return { when: when, extra: extra };
  }

  // ------------------------------------------------------- the automations ----
  /** Read, write and delete our automations (the REST config API of Home Assistant), switch them with automation.toggle. */
  function api(ctx) {
    var hs = function () { return ctx.hass(); };
    return {
      available: function () { return !!(hs() && hs().callApi); },
      list: function () {
        var st = hs().states, rows = Object.keys(st).filter(function (k) { return k.indexOf('automation.') === 0 && String((st[k].attributes || {}).id || '').indexOf(PREFIX) === 0; });
        return Promise.all(rows.map(function (eid) {
          var id = st[eid].attributes.id;
          return Promise.resolve(hs().callApi('GET', 'config/automation/config/' + id)).then(function (cfg) {
            var p = parseAuto(Object.assign({ id: id }, cfg));
            return p ? Object.assign(p, { eid: eid, enabled: st[eid].state !== 'off', last: st[eid].attributes.last_triggered || null }) : null;
          }, function () { return null; });
        })).then(function (l) { return l.filter(Boolean); });
      },
      save: function (cfg) { return Promise.resolve(hs().callApi('POST', 'config/automation/config/' + cfg.id, cfg)); },
      remove: function (id) { return Promise.resolve(hs().callApi('DELETE', 'config/automation/config/' + id)); },
      toggle: function (eid) { return ctx.call('automation', 'toggle', { entity_id: eid }); },
      /** Our automations by entity id: { automation entity id: modeId } (for the history). */
      owners: function () {
        var st = hs().states, out = {};
        Object.keys(st).forEach(function (k) { var id = k.indexOf('automation.') === 0 && String((st[k].attributes || {}).id || ''); if (id && id.indexOf(PREFIX) === 0) out[k] = id; });
        return out;
      },
    };
  }
  /** After a mode changed (steps or name) its schedules run the new version. */
  function rewrite(ctx, oldMode, newMode) {
    var A = api(ctx); if (!A.available()) return Promise.resolve();
    return A.list().then(function (list) {
      return Promise.all(list.filter(function (a) { return a.modeId === oldMode.id; }).map(function (a) { return A.save(buildAuto(a.spec, newMode, a.id, ctx.hass().states)); }));
    }, function () {});
  }
  /** A mode is gone: so are its schedules. */
  function removeFor(ctx, mode) {
    var A = api(ctx); if (!A.available()) return Promise.resolve();
    return A.list().then(function (list) { return Promise.all(list.filter(function (a) { return a.modeId === mode.id; }).map(function (a) { return A.remove(a.id); })); }, function () {});
  }

  // ---------------------------------------------------------- Schedule tab ----
  /**
   * The schedules of the modes: a list (switch, tap to edit) and an editor for a new one. opts: { mode } shows only that mode (inside the editor of a mode), else every mode with a filter.
   * Returns { dispose }.
   */
  function schedulePage(ctx, body, opts) {
    opts = opts || {};
    var t = T(ctx), A = api(ctx), view = 'list', filter = opts.mode || '', F = null, autos = [], legacy = [], pending = [], disposed = false;
    var hs = function () { return ctx.hass(); };
    var modes = function () { return LM.modesNow(ctx); };
    var modeBy = function (id) { return modes().filter(function (m) { return m.id === id; })[0] || null; };
    function loadLegacy() {
      var s = hs().services;
      if (!(s && s.scheduler && s.scheduler.add)) return Promise.resolve();
      return Promise.resolve(ctx.callWS({ type: 'scheduler' })).then(function (r) { legacy = Array.isArray(r) ? r : []; }, function () {});
    }
    function refresh() {
      return Promise.all([A.available() ? A.list() : Promise.resolve([]), loadLegacy()]).then(function (r) {
        if (disposed) return;
        var now = Date.now(), have = {}; r[0].forEach(function (a) { have[a.id] = true; });
        pending = pending.filter(function (p) { return !have[p.id] && now - p.at < 20000; });
        autos = r[0].concat(pending.map(function (p) { return p.auto; }));
        if (view === 'list') drawList();
      }, function () { if (!disposed && view === 'list') drawList(); });
    }
    function legacyRows() {
      var out = [];
      modes().forEach(function (m) { LM.entriesFor(legacy, m).forEach(function (e) { out.push({ legacy: true, modeId: m.id, e: e }); }); });
      return out;
    }
    function rowsNow() {
      var order = {}; modes().forEach(function (m, i) { order[m.id] = i; });
      return autos.map(function (a) { return { legacy: false, modeId: a.modeId, a: a }; }).concat(legacyRows())
        .filter(function (r) { return (!filter || r.modeId === filter) && modeBy(r.modeId); })
        .sort(function (x, y) {
          var kx = String(x.legacy ? x.e.time : (x.a.spec.time || x.a.spec.event || '~')), ky = String(y.legacy ? y.e.time : (y.a.spec.time || y.a.spec.event || '~'));
          return (order[x.modeId] - order[y.modeId]) || (kx < ky ? -1 : (kx > ky ? 1 : 0));
        });
    }
    function sw(on, label, fn) {
      var b = h('button.sw' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label });
      b.onclick = function (ev) { ev.stopPropagation(); on = !on; b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); fn(on); };
      return b;
    }
    function drawList() {
      if (disposed) return;
      body.innerHTML = '';
      var wrap = h('div.lss');
      if (!opts.mode && modes().length > 1) {
        var chips = h('div.chiprow.lss-filter');
        chips.appendChild(h('button.cp' + (filter ? '' : '.on'), { type: 'button', 'aria-pressed': filter ? 'false' : 'true', dataset: { mode: '' }, onclick: function () { filter = ''; drawList(); } }, t('ls.all')));
        modes().forEach(function (m) { chips.appendChild(h('button.cp' + (filter === m.id ? '.on' : ''), { type: 'button', dataset: { mode: m.id }, 'aria-pressed': filter === m.id ? 'true' : 'false', onclick: function () { filter = m.id; drawList(); } }, m.name)); });
        wrap.appendChild(chips);
      }
      var rows = rowsNow();
      if (!rows.length) wrap.appendChild(h('div.ts-hint', null, t('ls.none') + ' ' + t('ls.none_hint')));
      rows.forEach(function (r) {
        var m = modeBy(r.modeId), info, on, label = m.name;
        if (r.legacy) {
          var e = r.e; on = e.enabled;
          info = { when: t('ls.s_time', { t: clockText(ctx, e.time) }), extra: [daysLabel(ctx, e.days), t('ls.legacy')] };
        } else { on = r.a.enabled; info = describe(ctx, r.a.spec); }
        var chipsEl = h('div.ts-chips', null, h('span.ts-chip.neutral', null, info.when));
        info.extra.forEach(function (x) { chipsEl.appendChild(h('span.ts-chip.neutral.dim', null, x)); });
        var row = h('div.ts-row.lsr' + (on ? '' : '.off'), { dataset: r.legacy ? { sid: r.e.sid, mode: m.id } : { id: r.a.id, mode: m.id }, tabindex: '0' },
          h('span.lsr-badge', { style: { background: BADGE(m) }, html: UI.icon(m.icon, 18) }),
          h('div.ts-main', null, h('div.ts-nm', null, m.name), chipsEl),
          r.legacy ? h('button.vs-edit.lsr-del', { type: 'button', onclick: function (ev) { ev.stopPropagation(); delLegacy(r.e); } }, t('ls.delete')) : null,
          sw(on, label, function (v) { if (r.legacy) ctx.call('switch', 'toggle', { entity_id: r.e.sw }); else if (r.a.eid) { r.a.enabled = v; A.toggle(r.a.eid); } }));
        if (!r.legacy) { row.onclick = function () { openForm(r.a); }; row.onkeydown = function (ev) { if (ev.key === 'Enter') openForm(r.a); }; }
        wrap.appendChild(row);
      });
      wrap.appendChild(h('button.ts-add.lss-add', { type: 'button', onclick: function () { openForm(null); }, html: UI.icon('plus', 18) + '<span>' + t('ls.add') + '</span>' }));
      body.appendChild(wrap);
    }
    function delLegacy(e) {
      (e.slots > 1 ? ctx.call('scheduler', 'edit', { entity_id: e.sw, timeslots: (e.sc.timeslots || []).filter(function (s, i) { return i !== e.slot; }).map(TS.cleanSlot) }) : ctx.call('scheduler', 'remove', { entity_id: e.sw }))
        .then(function () { ctx.toast('success', t('ls.deleted')); setTimeout(refresh, 400); }, function () { ctx.toast('error', t('ls.failed')); });
    }

    // ---- the editor ----
    function kindOf(spec) { return spec.kind === 'sun' ? spec.event : spec.kind; }
    function openForm(a) {
      var m0 = filter || (a && a.modeId) || (modes()[0] && modes()[0].id) || '';
      if (a) {
        var s = a.spec;
        F = { id: a.id, eid: a.eid, modeId: a.modeId, kind: kindOf(s), time: s.time || '20:00', dir: s.kind === 'sun' ? (s.offset < 0 ? 'before' : (s.offset > 0 ? 'after' : 'at')) : 'at', min: s.kind === 'sun' && s.offset ? Math.abs(s.offset) : 30,
          days: s.days.slice(), dark: !!s.dark, entity: s.when ? s.when.entity : '', to: s.when ? s.when.to : '', forMin: s.when ? s.when.forMin : 0 };
      } else F = { id: null, eid: null, modeId: m0, kind: 'time', time: nowSlot(), dir: 'at', min: 30, days: DAYS.slice(), dark: false, entity: '', to: '', forMin: 0 };
      view = 'form'; drawForm();
    }
    function nowSlot() { var d = new Date(), m = Math.ceil(d.getMinutes() / 5) * 5, hh = d.getHours() + (m >= 60 ? 1 : 0); return pad(hh % 24) + ':' + pad(m % 60); }
    function specOf() {
      var k = F.kind;
      if (k === 'time') return cleanSpec({ kind: 'time', time: F.time, days: F.days, dark: F.dark });
      if (k === 'sunrise' || k === 'sunset') return cleanSpec({ kind: 'sun', event: k, offset: F.dir === 'before' ? -F.min : (F.dir === 'after' ? F.min : 0), days: F.days });
      return cleanSpec({ kind: 'event', when: { entity: F.entity, to: F.to, forMin: F.forMin }, days: F.days, dark: F.dark });
    }
    function drawForm() {
      if (disposed || view !== 'form') return;
      var keepY = (body.closest && body.closest('.dt-body')) ? body.closest('.dt-body').scrollTop : 0; body.innerHTML = '';
      var wrap = h('div.lss.lss-form');
      if (!opts.mode) wrap.appendChild(h('div.ts-eh', null, h('button.ts-back', { type: 'button', onclick: back, html: UI.icon('chevleft', 18) + '<span>' + t('ls.back') + '</span>' }), h('div.ts-et', null, F.id ? t('ls.edit_t') : t('ls.new_t'))));
      else wrap.appendChild(h('div.lbl', null, F.id ? t('ls.edit_t') : t('ls.new_t')));
      if (!modes().length) { wrap.appendChild(h('div.ts-hint', null, t('ls.no_mode'))); body.appendChild(wrap); return; }
      if (!opts.mode) {
        wrap.appendChild(h('div.lbl', null, t('ls.mode')));
        var mr = h('div.chiprow.lss-modes');
        modes().forEach(function (m) { mr.appendChild(h('button.cp' + (F.modeId === m.id ? '.on' : ''), { type: 'button', dataset: { mode: m.id }, 'aria-pressed': F.modeId === m.id ? 'true' : 'false', onclick: function () { F.modeId = m.id; drawForm(); } }, m.name)); });
        wrap.appendChild(mr);
      }
      wrap.appendChild(h('div.lbl', null, t('ls.when')));
      var kr = h('div.chiprow.lss-kinds');
      [['time', 'ls.k_time'], ['sunrise', 'ls.k_sunrise'], ['sunset', 'ls.k_sunset'], ['event', 'ls.k_event']].forEach(function (k) {
        kr.appendChild(h('button.cp' + (F.kind === k[0] ? '.on' : ''), { type: 'button', dataset: { kind: k[0] }, 'aria-pressed': F.kind === k[0] ? 'true' : 'false', onclick: function () { F.kind = k[0]; if (k[0] === 'sunrise' || k[0] === 'sunset') F.dark = false; drawForm(); } }, t(k[1])));
      });
      wrap.appendChild(kr);
      if (F.kind === 'time') {
        var hours = [], mins = []; for (var i = 0; i < 24; i++) hours.push(pad(i)); for (var j = 0; j < 60; j += 5) mins.push(pad(j));
        var tm = /^(\d\d):(\d\d)/.exec(F.time), mm = pad(Math.round(+tm[2] / 5) * 5 % 60);
        var wh = g.OkieMotor.detail.createWheel({ values: hours, value: tm[1], label: 'Hour', onChange: function (v) { F.time = v + ':' + (wm ? wm.value : mm); } });
        var wm = g.OkieMotor.detail.createWheel({ values: mins, value: mm, label: 'Minute', onChange: function (v) { F.time = wh.value + ':' + v; } });
        wrap.appendChild(h('div.wheels.ts-wheels', null, wh.el, h('div.colon', null, ':'), wm.el));
      } else if (F.kind === 'sunrise' || F.kind === 'sunset') {
        wrap.appendChild(h('div.lbl', null, t('ls.offset')));
        var dr = h('div.chiprow.lss-dir');
        [['at', t('ls.at_sun', { s: t('ls.' + F.kind) })], ['before', t('ls.before')], ['after', t('ls.after')]].forEach(function (o) {
          dr.appendChild(h('button.cp' + (F.dir === o[0] ? '.on' : ''), { type: 'button', dataset: { dir: o[0] }, 'aria-pressed': F.dir === o[0] ? 'true' : 'false', onclick: function () { F.dir = o[0]; drawForm(); } }, o[1]));
        });
        wrap.appendChild(dr);
        if (F.dir !== 'at') {
          var or = h('div.chiprow.lss-mins');
          OFFSETS.forEach(function (n) { or.appendChild(h('button.cp' + (F.min === n ? '.on' : ''), { type: 'button', dataset: { min: String(n) }, 'aria-pressed': F.min === n ? 'true' : 'false', onclick: function () { F.min = n; drawForm(); } }, n >= 60 && n % 60 === 0 ? (n / 60) + ' h' : t('ls.min', { n: n }))); });
          wrap.appendChild(or);
        }
      } else {
        wrap.appendChild(h('div.lbl', null, t('ls.what')));
        var sel = h('select.src-sel.lss-select', { 'aria-label': t('ls.what') }), st = hs().states;
        sel.appendChild(h('option', { value: '' }, t('ls.pick')));
        eventGroups(st).forEach(function (grp) {
          var og = h('optgroup', { label: t('ls.g_' + grp.key) });
          grp.ids.forEach(function (e) { og.appendChild(h('option', { value: e }, nameOf(st, e))); });
          sel.appendChild(og);
        });
        if (F.entity && !st[F.entity]) sel.appendChild(h('option', { value: F.entity }, F.entity));
        sel.value = F.entity || '';
        sel.onchange = function () { F.entity = sel.value; var ch = F.entity ? stateChoices(F.entity, st) : []; if (!ch.some(function (c) { return c.id === F.to; })) F.to = ch[0] ? ch[0].id : ''; drawForm(); };
        wrap.appendChild(h('div.src-selw', null, sel, h('span.src-chev', { html: UI.icon('chevdown', 16) })));
        if (F.entity) {
          var sr = h('div.chiprow.lss-states');
          stateChoices(F.entity, st).forEach(function (c) { sr.appendChild(h('button.cp' + (F.to === c.id ? '.on' : ''), { type: 'button', dataset: { to: c.id }, 'aria-pressed': F.to === c.id ? 'true' : 'false', onclick: function () { F.to = c.id; drawForm(); } }, t('ls.st_' + c.key))); });
          wrap.appendChild(sr);
          wrap.appendChild(h('div.lbl', null, t('ls.for')));
          var fr = h('div.chiprow.lss-for');
          FOR_MIN.forEach(function (n) { fr.appendChild(h('button.cp' + (F.forMin === n ? '.on' : ''), { type: 'button', dataset: { for: String(n) }, 'aria-pressed': F.forMin === n ? 'true' : 'false', onclick: function () { F.forMin = n; drawForm(); } }, n ? t('ls.min', { n: n }) : t('ls.right_away'))); });
          wrap.appendChild(fr);
        }
      }
      wrap.appendChild(h('div.lbl', null, t('ls.days')));
      var dayRow = h('div.chiprow.ts-dayrow.lss-days');
      DAYS.forEach(function (d) { var on = F.days.indexOf(d) >= 0; dayRow.appendChild(h('button.cp' + (on ? '.on' : ''), { type: 'button', dataset: { day: d }, 'aria-pressed': on ? 'true' : 'false', onclick: function () { var i = F.days.indexOf(d); if (i >= 0) { if (F.days.length > 1) F.days.splice(i, 1); } else F.days.push(d); F.days = DAYS.filter(function (x) { return F.days.indexOf(x) >= 0; }); drawForm(); } }, core.t('dt.' + d, ctx.lang()))); });
      wrap.appendChild(dayRow);
      var quick = h('div.chiprow.ts-quick');
      [['ls.every', DAYS], ['ls.weekdays', WEEKDAYS], ['ls.weekend', WEEKEND]].forEach(function (q) { quick.appendChild(h('button.cp.ghost', { type: 'button', onclick: function () { F.days = q[1].slice(); drawForm(); } }, t(q[0]))); });
      wrap.appendChild(quick);
      if (F.kind !== 'sunrise' && F.kind !== 'sunset') {
        wrap.appendChild(h('div.lss-opt', null, h('div.lss-optt', null, h('b', null, t('ls.dark')), h('span', null, t('ls.dark_hint'))),
          sw(F.dark, t('ls.dark'), function (v) { F.dark = v; refreshPreview(); })));
      }
      var pv = h('div.lss-preview'); wrap.appendChild(pv);
      function refreshPreview() { var sp = specOf(), m = modeBy(F.modeId); pv.innerHTML = ''; if (!sp || !m) return; var d = describe(ctx, sp); pv.appendChild(h('span', null, t('ls.preview') + ': '));  pv.appendChild(h('b', null, m.name + ' · ' + [d.when].concat(d.extra).join(' · '))); }
      refreshPreview();
      var acts = h('div.vs-actions');
      acts.appendChild(h('button.act.primary.lss-save', { type: 'button', onclick: save }, t('ls.save')));
      acts.appendChild(h('button.act.lss-cancel', { type: 'button', onclick: back }, t('ls.cancel')));
      wrap.appendChild(acts);
      if (F.id) wrap.appendChild(h('button.act.danger.lss-del', { type: 'button', onclick: del }, t('ls.delete')));
      body.appendChild(wrap);
      var y = body.closest && body.closest('.dt-body'); if (y) y.scrollTop = keepY;
    }
    function back() { view = 'list'; F = null; drawList(); refresh(); }
    function save() {
      var m = modeBy(F.modeId), sp = specOf();
      if (!m) { ctx.toast('error', t('ls.no_mode')); return; }
      if (!sp) { ctx.toast('error', t('ls.no_entity')); return; }
      var id = F.id || autoId(m.id, autos.map(function (a) { return a.id; })), cfg = buildAuto(sp, m, id, hs().states);
      A.save(cfg).then(function () {
        ctx.toast('success', t('ls.saved'));
        var auto = { id: id, eid: F.eid || null, modeId: m.id, spec: sp, alias: cfg.alias, enabled: true };
        autos = autos.filter(function (a) { return a.id !== id; }); autos.push(auto); pending = pending.filter(function (p) { return p.id !== id; });
        if (!F.eid) pending.push({ id: id, at: Date.now(), auto: auto });
        view = 'list'; F = null; drawList(); setTimeout(refresh, 900);
      }, function () { ctx.toast('error', t('ls.failed')); });
    }
    function del() {
      var id = F.id; A.remove(id).then(function () {
        ctx.toast('success', t('ls.deleted')); autos = autos.filter(function (a) { return a.id !== id; }); pending = pending.filter(function (p) { return p.id !== id; }); view = 'list'; F = null; drawList(); setTimeout(refresh, 900);
      }, function () { ctx.toast('error', t('ls.failed')); });
    }
    drawList(); refresh();
    return { dispose: function () { disposed = true; }, refresh: refresh };
  }

  // ----------------------------------------------------------- History tab ----
  /** When each mode ran in the last 7 days: a bar for every day and the runs, newest first. */
  function historyPage(ctx, body) {
    var t = T(ctx), A = api(ctx), disposed = false, modes = LM.modesNow(ctx), now = Date.now();
    body.innerHTML = ''; body.appendChild(h('div.ts-hint', null, t('ls.loading')));
    var ids = [], owners = A.available() ? A.owners() : {};
    modes.forEach(function (m) { m.run.forEach(function (it) { if ((it.type === 'script' || it.type === 'scene') && ids.indexOf(it.entity) < 0) ids.push(it.entity); }); });
    ids = ids.concat(Object.keys(owners));
    var q = ids.length ? Promise.resolve(ctx.callWS({ type: 'logbook/get_events', start_time: new Date(now - 7 * 86400000).toISOString(), end_time: new Date(now).toISOString(), entity_ids: ids })).then(function (r) { return Array.isArray(r) ? r : []; }, function () { return []; }) : Promise.resolve([]);
    q.then(function (rows) {
      if (disposed) return;
      var autoOwner = {}; Object.keys(owners).forEach(function (eid) { var id = owners[eid], m = modes.filter(function (x) { return id.indexOf(PREFIX + String(x.id).toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 24) + '_') === 0; })[0]; if (m) autoOwner[eid] = m.id; });
      var runs = mergeRuns(modes, rows, ctx.store.get('lm.log', []), autoOwner, now, 7), days = bucketDays(runs, now, 7), max = Math.max(1, Math.max.apply(null, days.map(function (d) { return d.count; })));
      body.innerHTML = '';
      var wrap = h('div.lsh');
      var chart = h('div.lsh-chart'), total = runs.length;
      days.forEach(function (d) {
        var dt = new Date(d.day + 'T12:00:00'), lbl = core.t('dt.' + DAYS[(dt.getDay() + 6) % 7], ctx.lang());
        chart.appendChild(h('div.lsh-col' + (d.today ? '.today' : ''), { dataset: { day: d.day, count: String(d.count) } }, h('span.lsh-n', null, d.count ? String(d.count) : ''), h('span.lsh-bar', { style: { height: Math.max(4, Math.round(d.count / max * 64)) + 'px' } }), h('span.lsh-d', null, lbl)));
      });
      wrap.appendChild(h('div.lsh-top', null, h('div.lsh-h', null, t('ls.h_week')), h('div.lsh-t', null, t('ls.h_runs', { n: total }))));
      wrap.appendChild(chart);
      var mc = h('div.lsh-modes');
      modes.forEach(function (m) { var n = runs.filter(function (r) { return r.modeId === m.id; }).length; mc.appendChild(h('span.lsh-mode', { dataset: { mode: m.id } }, h('i', { style: { background: BADGE(m) } }), m.name + ' · ' + n)); });
      wrap.appendChild(mc);
      if (!runs.length) { wrap.appendChild(h('div.ts-hint', null, t('ls.h_none') + ' ' + t('ls.h_none_hint'))); body.appendChild(wrap); return; }
      var feed = h('div.lsh-feed'), lastDay = '';
      runs.forEach(function (r) {
        var m = modes.filter(function (x) { return x.id === r.modeId; })[0], d = new Date(r.at), dk = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
        if (dk !== lastDay) {
          lastDay = dk; var ago = Math.round((new Date(now).setHours(0, 0, 0, 0) - new Date(r.at).setHours(0, 0, 0, 0)) / 86400000);
          feed.appendChild(h('div.lbl.lsh-day', null, ago === 0 ? t('ls.today') : (ago === 1 ? t('ls.yesterday') : d.toLocaleDateString(ctx.lang() === 'de' ? 'de-DE' : undefined, { weekday: 'long', day: 'numeric', month: 'short' }))));
        }
        feed.appendChild(h('div.ts-row.lsh-row', { dataset: { mode: m.id, by: r.by } }, h('span.lsr-badge', { style: { background: BADGE(m) }, html: UI.icon(m.icon, 18) }),
          h('div.ts-main', null, h('div.ts-nm', null, m.name), h('div.ts-chips', null, h('span.ts-chip.neutral', null, clockText(ctx, pad(d.getHours()) + ':' + pad(d.getMinutes()))), h('span.ts-chip.neutral.dim', null, t(r.by === 'you' ? 'ls.by_you' : (r.by === 'schedule' ? 'ls.by_schedule' : 'ls.by_else')))))));
      });
      wrap.appendChild(feed); body.appendChild(wrap);
    });
    return { dispose: function () { disposed = true; } };
  }

  // ----------------------------------------------------------- Context tab ----
  /** For each mode: what it does, and what else in Home Assistant uses its scripts and scenes (automations, other scripts and scenes). */
  function contextPage(ctx, body) {
    var t = T(ctx), A = api(ctx), disposed = false, modes = LM.modesNow(ctx), hs = function () { return ctx.hass(); }, st = hs().states;
    body.innerHTML = '';
    var mine = A.available() ? A.owners() : {};
    function entry(id) {
      var s = st[id]; if (!s) return null; var dom = id.split('.')[0], ic = UI.domainIcon(dom, null, s.state);
      var right = null;
      if (dom === 'automation') { var on = s.state !== 'off'; right = h('button.sw' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': (s.attributes && s.attributes.friendly_name) || id, onclick: function (ev) { ev.stopPropagation(); on = !on; this.classList.toggle('on', on); this.setAttribute('aria-checked', on ? 'true' : 'false'); ctx.call('automation', 'toggle', { entity_id: id }); } }); }
      else right = h('button.vs-edit', { type: 'button', onclick: function () { ctx.call(dom, 'turn_on', { entity_id: id }).then(function () { ctx.toast('success', t('ls.c_run')); }, function () {}); } }, t('ls.c_run'));
      return h('div.ts-row.lsc-row', { dataset: { id: id } }, h('span.ts-ic', { html: ic ? UI.icon(ic, 18) : '' }), h('div.ts-main', null, h('div.ts-nm', null, (s.attributes && s.attributes.friendly_name) || id), h('div.ts-chips', null, h('span.ts-chip.neutral', null, t('ls.c_' + dom)))), right);
    }
    modes.forEach(function (m) {
      var sec = h('div.lsc', { dataset: { mode: m.id } });
      sec.appendChild(h('div.lsc-head', null, h('span.lsr-badge', { style: { background: BADGE(m) }, html: UI.icon(m.icon, 18) }), h('b', null, m.name)));
      sec.appendChild(h('div.lbl', null, t('ls.c_steps')));
      m.run.forEach(function (it) { sec.appendChild(h('div.lme-step.lsc-step', null, h('span', null, LM.describeItem(it, st, t)))); });
      var ents = []; m.run.forEach(function (it) { if ((it.type === 'script' || it.type === 'scene') && ents.indexOf(it.entity) < 0) ents.push(it.entity); });
      var holder = h('div.lsc-used'); sec.appendChild(holder); body.appendChild(sec);
      if (!ents.length) { holder.appendChild(h('div.ts-hint', null, t('ls.c_direct'))); return; }
      Promise.all(ents.map(function (e) { return Promise.resolve(ctx.callWS({ type: 'search/related', item_type: 'entity', item_id: e })).then(function (r) { return r || {}; }, function () { return {}; }); })).then(function (res) {
        if (disposed) return;
        var seen = {}, list = [];
        res.forEach(function (r) { ['automation', 'script', 'scene'].forEach(function (d) { (r[d] || []).forEach(function (id) { if (!seen[id] && ents.indexOf(id) < 0 && !mine[id] && st[id]) { seen[id] = true; list.push(id); } }); }); });
        if (!list.length) { holder.appendChild(h('div.ts-hint', null, t('ls.c_none'))); return; }
        holder.appendChild(h('div.lbl', null, t('ls.c_used')));
        list.slice(0, 12).forEach(function (id) { var e = entry(id); if (e) holder.appendChild(e); });
      });
    });
    return { dispose: function () { disposed = true; } };
  }

  var CSS = [
    '.lsr-badge{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;color:#fff;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);}',
    '.lss{display:flex;flex-direction:column;gap:10px;}.lss-filter{margin:0 0 2px;}',
    '.lsr{cursor:pointer;}.lsr.off .ts-nm,.lsr.off .ts-chips,.lsr.off .lsr-badge{opacity:.5;}.lsr .ts-chips{flex-wrap:wrap;}.ts-chip.dim{opacity:.75;}.lsr .vs-edit{margin-left:auto;}',
    '.lss-add{margin-top:4px;width:100%;}.lss-form .lbl{margin-top:6px;}',
    '.lss-select{width:100%;}.lss-opt{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.08);}',
    '.lss-optt{display:flex;flex-direction:column;gap:2px;min-width:0;}.lss-optt b{font-size:15px;font-weight:650;}.lss-optt span{font-size:12px;color:var(--okie-text-dim);}',
    '.lss-preview{padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.06);font-size:13px;color:var(--okie-text-dim);}.lss-preview b{color:var(--okie-text);font-weight:650;}',
    '.lsh{display:flex;flex-direction:column;gap:12px;}.lsh-top{display:flex;align-items:baseline;justify-content:space-between;}.lsh-h{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--okie-text-dim);}.lsh-t{font-size:13px;color:var(--okie-text-dim);}',
    '.lsh-chart{display:grid;grid-template-columns:repeat(7,1fr);gap:8px;align-items:end;padding:10px 12px 8px;border-radius:18px;background:rgba(255,255,255,.07);}',
    '.lsh-col{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;min-height:96px;}.lsh-n{font-size:12px;font-weight:700;font-variant-numeric:tabular-nums;min-height:14px;}',
    '.lsh-bar{display:block;width:100%;max-width:34px;border-radius:8px;background:rgba(255,255,255,.28);}.lsh-col.today .lsh-bar{background:#f5a30b;}.lsh-d{font-size:11px;color:var(--okie-text-dim);}',
    '.lsh-modes{display:flex;flex-wrap:wrap;gap:8px;}.lsh-mode{display:inline-flex;align-items:center;gap:7px;padding:5px 12px 5px 8px;border-radius:999px;background:rgba(255,255,255,.1);font-size:13px;}.lsh-mode i{width:12px;height:12px;border-radius:50%;display:block;}',
    '.lsh-feed{display:flex;flex-direction:column;gap:8px;}.lsh-day{margin-top:8px;}',
    '.lsc{display:flex;flex-direction:column;gap:8px;margin:0 0 18px;}.lsc-head{display:flex;align-items:center;gap:12px;font-size:17px;}.lsc-step{font-size:13px;}.lsc-used{display:flex;flex-direction:column;gap:8px;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  Object.assign(pureApi, { schedulePage: schedulePage, historyPage: historyPage, contextPage: contextPage, api: api, rewrite: rewrite, removeFor: removeFor, describe: describe, CSS: CSS });
})(typeof window !== 'undefined' ? window : globalThis);

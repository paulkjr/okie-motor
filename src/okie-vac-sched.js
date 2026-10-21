/* okie-vac-sched: the weekly schedule of a robot vacuum (the Schedule tab of a vacuum device).
 *
 * The same planner as the thermostat's: a tab per weekday, the entries of that day with a name, what they do and the time, an Add button.
 * What an entry does is a JOB:
 *   - Clean              vacuum.start, what the robot does by itself
 *   - Return to dock     vacuum.return_to_base
 *   - your own jobs      vacuum.send_command with a command and its parameters, for example a room, two passes, or "vacuum and mop" / "mop only"
 *                        as soon as you know the parameters your robot takes (the iRobot integration passes them to the robot untouched).
 *                        Each has a name and a kind (vacuum & mop, vacuum, mop, room, other: only the picture), is kept in the settings
 *                        (vacuum.jobs), shows up as a button on the vacuum screen and can be put in any schedule.
 *
 * The schedules themselves live in the Scheduler component (HACS: nielsfaber/scheduler-component), the same way as the thermostat's:
 * an entry is one time slot of one schedule, the list comes from its websocket command `scheduler`, changes go through scheduler.add / edit / remove.
 *
 * The pure part (jobs, reading and building the actions) is unit-tested; the DOM part is checked in the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var TS = isNode ? require('./okie-thermo-sched.js') : (g.OkieMotor && g.OkieMotor.thermoSchedule);
  if (!TS) return;
  var DAYS = TS.DAYS, WEEKDAYS = TS.WEEKDAYS, WEEKEND = TS.WEEKEND, expandDays = TS.expandDays, clockOf = TS.clockOf, cleanSlot = TS.cleanSlot, onDay = TS.onDay;

  var KINDS = ['both', 'vacuum', 'mop', 'room', 'other'];
  var BUILTIN = ['clean', 'dock'];
  var MODES = ['vacuum', 'mop', 'vacuum_and_mop', 'vacuum_then_mop'];

  /** JSON with sorted keys, to compare two parameter objects. */
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  /** The text of the parameters box -> { ok, value }: empty is fine (no parameters), anything else must be a JSON object. */
  function parseParams(text) {
    var s = String(text == null ? '' : text).trim();
    if (!s) return { ok: true, value: null };
    try { var v = JSON.parse(s); return v && typeof v === 'object' && !Array.isArray(v) ? { ok: true, value: v } : { ok: false, value: null }; } catch (e) { return { ok: false, value: null }; }
  }
  function names(v) { return (Array.isArray(v) ? v : []).map(function (x) { return String(x == null ? '' : x); }).filter(function (x, i, all) { return x.trim() && all.indexOf(x) === i; }); }
  /** The picture of a room job follows what it does: vacuum and mop, vacuum, mop, or just a room. */
  function roomsKind(mode) { return mode === 'vacuum_and_mop' || mode === 'vacuum_then_mop' ? 'both' : mode === 'vacuum' ? 'vacuum' : mode === 'mop' ? 'mop' : 'room'; }
  /**
   * One saved job made safe. Two kinds:
   *   { type: 'rooms', regions: [...], zones: [...], mode, passes }  clean these rooms / zones (Roomba+: roomba_plus.clean_room / clean_zone), optionally in a mode and with one or two passes
   *   { command, params }                                          a command for vacuum.send_command
   * null when it cannot be used.
   */
  function cleanJob(j) {
    if (!j || typeof j !== 'object') return null;
    var name = String(j.name == null ? '' : j.name).trim().slice(0, 40), id = String(j.id || '');
    if (!name || !id || BUILTIN.indexOf(id) >= 0 || id.indexOf('fav:') === 0) return null;
    if (j.type === 'rooms') {
      var regions = names(j.regions), zones = names(j.zones); if (!regions.length && !zones.length) return null;
      var mode = MODES.indexOf(j.mode) >= 0 ? j.mode : '', passes = j.passes === 'one' || j.passes === 'two' ? j.passes : '';
      return { id: id, name: name, type: 'rooms', kind: roomsKind(mode), regions: regions, zones: zones, mode: mode, passes: passes, command: '', params: null };
    }
    var command = String(j.command == null ? '' : j.command).trim(); if (!command) return null;
    var params = j.params && typeof j.params === 'object' && !Array.isArray(j.params) && Object.keys(j.params).length ? j.params : null;
    return { id: id, name: name, type: 'command', kind: KINDS.indexOf(j.kind) >= 0 ? j.kind : 'other', command: command, params: params };
  }
  /** The saved jobs (settings vacuum.jobs), without the broken and the doubled ones. */
  function jobsFrom(list) {
    var seen = {};
    return (Array.isArray(list) ? list : []).map(cleanJob).filter(function (j) { if (!j || seen[j.id]) return false; seen[j.id] = true; return true; });
  }
  function newJobId(jobs) {
    var id; do { id = 'j' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); } while ((jobs || []).some(function (j) { return j.id === id; }));
    return id;
  }
  /** Which picture a favorite gets from its name ("Vacuum and Mop Everywhere", "Around Litter box" ...). */
  function favoriteKind(name) {
    var n = String(name || '').toLowerCase(), v = /vacuum|vac\b|saug/.test(n), m = /mop|wisch/.test(n);
    return v && m ? 'both' : m ? 'mop' : v ? 'vacuum' : 'room';
  }
  /** The favorites of the vacuum (its `favorites` attribute: [{ id, name }]) as jobs. They are not saved: they come from your iRobot account. */
  function favJobs(favorites) {
    return (Array.isArray(favorites) ? favorites : []).filter(function (f) { return f && f.id && f.name; }).map(function (f) {
      return { id: 'fav:' + f.id, name: String(f.name), type: 'favorite', favorite: String(f.id), kind: favoriteKind(f.name), derived: true };
    });
  }
  /** The service calls of a job on this vacuum, in order. */
  function jobCalls(job, vacId) {
    if (job.id === 'clean') return [{ domain: 'vacuum', service: 'start', data: { entity_id: vacId } }];
    if (job.id === 'dock') return [{ domain: 'vacuum', service: 'return_to_base', data: { entity_id: vacId } }];
    if (job.type === 'favorite') return [{ domain: 'roomba_plus', service: 'run_favorite', data: { entity_id: vacId, favorite_id: job.favorite } }];
    if (job.type === 'rooms') {
      var extra = {}; if (job.mode) extra.cleaning_mode = job.mode; if (job.passes) extra.two_pass = job.passes === 'two';
      var out = [];
      if (job.regions && job.regions.length) out.push({ domain: 'roomba_plus', service: 'clean_room', data: Object.assign({ entity_id: vacId, room_name: job.regions.slice() }, extra) });
      if (job.zones && job.zones.length) out.push({ domain: 'roomba_plus', service: 'clean_zone', data: Object.assign({ entity_id: vacId, zone_name: job.zones.slice() }, extra) });
      return out;
    }
    var d = { entity_id: vacId, command: job.command }; if (job.params) d.params = job.params;
    return [{ domain: 'vacuum', service: 'send_command', data: d }];
  }
  /** The first service call of a job (most jobs have just one). */
  function jobCall(job, vacId) { return jobCalls(job, vacId)[0]; }
  /** The actions of a schedule slot for a job. */
  function jobActions(job, vacId) {
    return jobCalls(job, vacId).map(function (c) {
      var data = Object.assign({}, c.data); delete data.entity_id;
      var act = { service: c.domain + '.' + c.service, entity_id: vacId }; if (Object.keys(data).length) act.service_data = data;
      return act;
    });
  }
  /** Actions as the Scheduler hands them back, made comparable: the entity wherever it was put, the data without it. */
  function normActions(actions, vacId) {
    return (actions || []).map(function (a) {
      var d = Object.assign({}, a.service_data || {}), ids = [].concat(a.entity_id || [], d.entity_id || []).sort().join(','); delete d.entity_id;
      return { s: String(a.service || ''), e: ids, d: d };
    }).filter(function (a) { return a.e.split(',').indexOf(vacId) >= 0; });
  }
  /** What one time slot does to this vacuum -> { job: 'clean' | 'dock' | <a job's id> | 'other', label?, command?, params? } or null when it does not touch it. */
  function readSlot(slot, vacId, jobs) {
    var mine = normActions((slot && slot.actions) || [], vacId).filter(function (a) { return /^(vacuum|roomba_plus)\./.test(a.s); }); if (!mine.length) return null;      // a light or a switch on the same entity id is not a vacuum action
    var sig = stable(mine), same = function (j) { return stable(normActions(jobActions(j, vacId), vacId)) === sig; };
    if (same({ id: 'clean' })) return { job: 'clean' };
    if (same({ id: 'dock' })) return { job: 'dock' };
    var m = (jobs || []).filter(same)[0]; if (m) return { job: m.id };
    var first = mine[0], sv = first.s;
    if (sv === 'vacuum.start' || sv === 'vacuum.turn_on') return { job: 'clean' };
    if (sv === 'vacuum.return_to_base') return { job: 'dock' };
    if (sv === 'vacuum.send_command') return { job: 'other', label: String(first.d.command || ''), command: first.d.command, params: first.d.params && typeof first.d.params === 'object' ? first.d.params : null };
    if (sv === 'roomba_plus.run_favorite') return { job: 'other', label: 'favorite' };
    return { job: 'other', label: sv.replace(/^[a-z_]+\./, '') };
  }
  /** The entries (one per time slot) that act on this vacuum, from the Scheduler's list. */
  function entriesFor(schedules, vacId, jobs) {
    var out = [];
    (schedules || []).forEach(function (sc) {
      (sc.timeslots || []).forEach(function (slot, idx) {
        var e = readSlot(slot, vacId, jobs); if (!e) return;
        out.push(Object.assign(e, { sid: sc.schedule_id, sw: sc.entity_id || ('switch.schedule_' + sc.schedule_id), slot: idx, slots: sc.timeslots.length,
          name: sc.name || '', days: expandDays(sc.weekdays), enabled: sc.enabled !== false, start: slot.start, time: clockOf(slot.start), sc: sc }));
      });
    });
    return out;
  }
  /** The job an entry runs (a built-in, a favorite, one of yours, or null for a command that is not in your list). */
  function jobOf(entry, jobs) {
    if (entry.job === 'clean' || entry.job === 'dock') return { id: entry.job };
    return (jobs || []).filter(function (j) { return j.id === entry.job; })[0] || null;
  }

  var pureApi = { KINDS: KINDS, MODES: MODES, stable: stable, parseParams: parseParams, cleanJob: cleanJob, jobsFrom: jobsFrom, newJobId: newJobId, favoriteKind: favoriteKind, favJobs: favJobs, roomsKind: roomsKind,
    jobCall: jobCall, jobCalls: jobCalls, jobActions: jobActions, readSlot: readSlot, entriesFor: entriesFor, jobOf: jobOf };
  if (isNode) { module.exports = pureApi; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ DOM ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, CT = g.OkieMotor.controls, h = UI.h;

  core.registerStrings('en', {
    'vs.favorite': 'Favorite', 'vs.type': 'Type', 'vs.type_rooms': 'Rooms', 'vs.type_command': 'Command', 'vs.rooms': 'Rooms', 'vs.rooms_all': 'Nothing picked: every room.', 'vs.mode': 'Mode', 'vs.mode_default': 'As set on the robot',
    'vs.passes': 'Passes', 'vs.passes_one': 'One pass', 'vs.passes_two': 'Two passes', 'vs.rooms_help': 'Rooms are matched by name with your iRobot map. If a room does nothing, try Run now, and check the room names in Roomba+ > Configure.', 'vs.job_rooms_empty': 'This robot has no rooms to pick',
    'vs.job_clean': 'Clean', 'vs.job_dock': 'Return to dock', 'vs.k.both': 'Vacuum & Mop', 'vs.k.vacuum': 'Vacuum', 'vs.k.mop': 'Mop', 'vs.k.room': 'Room', 'vs.k.other': 'Other',
    'vs.what': 'What it does', 'vs.jobs': 'Jobs', 'vs.jobs_hint': 'A job is a command your robot understands, for example one room, two passes, or "mop only". Make one once, then use it in any schedule or start it with one tap on the robot screen.',
    'vs.job_new': 'New job', 'vs.job_edit': 'Edit job', 'vs.job_name': 'Name', 'vs.job_name_ph': 'Name, for example Kitchen mop', 'vs.job_kind': 'Picture', 'vs.job_command': 'Command', 'vs.job_params': 'Parameters (JSON, optional)',
    'vs.job_params_bad': 'The parameters must be a JSON object, like {"ordered":1}.',
    'vs.job_help': 'Command "start" with the room parameters cleans just that room. What your robot accepts depends on its model and firmware.',
    'vs.job_save': 'Save job', 'vs.job_saved': 'Job saved', 'vs.job_deleted': 'Job deleted', 'vs.job_run': 'Run now', 'vs.job_started': 'Started: {n}', 'vs.job_failed': 'The robot did not accept it',
    'vs.built_in': 'Built in', 'vs.job_missing': 'Unknown job', 'vs.job_name_empty': 'Give the job a name', 'vs.job_cmd_empty': 'A job needs a command',
    'vs.empty_day': 'Nothing is scheduled for this day.', 'vs.add': 'Add', 'vs.new': 'New schedule', 'vs.edit': 'Edit schedule', 'vs.name': 'Name', 'vs.name_ph': 'Name, for example Cat litter',
    'vs.time': 'Time', 'vs.days': 'Days', 'vs.every': 'Every day', 'vs.weekdays': 'Mon - Fri', 'vs.weekend': 'Weekend', 'vs.save': 'Save schedule', 'vs.delete': 'Delete', 'vs.back': 'Back',
    'vs.saved': 'Schedule saved', 'vs.failed': 'The schedule could not be saved', 'vs.read_fail': 'The schedules could not be read.', 'vs.loading': 'Loading…', 'vs.sun': 'at sunrise or sunset',
    'vs.day_empty': 'Pick at least one day', 'vs.edit_job': 'Edit',
  });
  core.registerStrings('de', {
    'vs.favorite': 'Favorit', 'vs.type': 'Art', 'vs.type_rooms': 'Räume', 'vs.type_command': 'Befehl', 'vs.rooms': 'Räume', 'vs.rooms_all': 'Nichts gewählt: alle Räume.', 'vs.mode': 'Modus', 'vs.mode_default': 'Wie am Roboter eingestellt',
    'vs.passes': 'Durchgänge', 'vs.passes_one': 'Ein Durchgang', 'vs.passes_two': 'Zwei Durchgänge', 'vs.rooms_help': 'Räume werden über den Namen mit deiner iRobot-Karte abgeglichen. Tut ein Raum nichts, probiere „Jetzt starten“ und prüfe die Raumnamen unter Roomba+ > Konfigurieren.', 'vs.job_rooms_empty': 'Dieser Roboter hat keine Räume zur Auswahl',
    'vs.job_clean': 'Reinigen', 'vs.job_dock': 'Zur Station', 'vs.k.both': 'Saugen & Wischen', 'vs.k.vacuum': 'Saugen', 'vs.k.mop': 'Wischen', 'vs.k.room': 'Raum', 'vs.k.other': 'Anderes',
    'vs.what': 'Was passiert', 'vs.jobs': 'Aufträge', 'vs.jobs_hint': 'Ein Auftrag ist ein Befehl, den dein Roboter versteht, zum Beispiel ein Raum, zwei Durchgänge oder „nur wischen“. Einmal anlegen, dann in jedem Zeitplan nutzen oder mit einem Tipp auf dem Roboter-Bildschirm starten.',
    'vs.job_new': 'Neuer Auftrag', 'vs.job_edit': 'Auftrag bearbeiten', 'vs.job_name': 'Name', 'vs.job_name_ph': 'Name, zum Beispiel Küche wischen', 'vs.job_kind': 'Symbol', 'vs.job_command': 'Befehl', 'vs.job_params': 'Parameter (JSON, optional)',
    'vs.job_params_bad': 'Die Parameter müssen ein JSON-Objekt sein, zum Beispiel {"ordered":1}.',
    'vs.job_help': 'Der Befehl „start“ mit den Raum-Parametern reinigt nur diesen Raum. Was dein Roboter annimmt, hängt von Modell und Firmware ab.',
    'vs.job_save': 'Auftrag speichern', 'vs.job_saved': 'Auftrag gespeichert', 'vs.job_deleted': 'Auftrag gelöscht', 'vs.job_run': 'Jetzt starten', 'vs.job_started': 'Gestartet: {n}', 'vs.job_failed': 'Der Roboter hat es nicht angenommen',
    'vs.built_in': 'Eingebaut', 'vs.job_missing': 'Unbekannter Auftrag', 'vs.job_name_empty': 'Gib dem Auftrag einen Namen', 'vs.job_cmd_empty': 'Ein Auftrag braucht einen Befehl',
    'vs.empty_day': 'Für diesen Tag ist nichts geplant.', 'vs.add': 'Hinzufügen', 'vs.new': 'Neuer Zeitplan', 'vs.edit': 'Zeitplan bearbeiten', 'vs.name': 'Name', 'vs.name_ph': 'Name, zum Beispiel Katzenklo',
    'vs.time': 'Zeit', 'vs.days': 'Tage', 'vs.every': 'Jeden Tag', 'vs.weekdays': 'Mo - Fr', 'vs.weekend': 'Wochenende', 'vs.save': 'Zeitplan speichern', 'vs.delete': 'Löschen', 'vs.back': 'Zurück',
    'vs.saved': 'Zeitplan gespeichert', 'vs.failed': 'Der Zeitplan konnte nicht gespeichert werden', 'vs.read_fail': 'Die Zeitpläne konnten nicht gelesen werden.', 'vs.loading': 'Lädt…', 'vs.sun': 'bei Sonnenauf- oder -untergang',
    'vs.day_empty': 'Wähle mindestens einen Tag', 'vs.edit_job': 'Bearbeiten',
  });

  function T(ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; }
  var PARAMS_PH = '{"regions":[{"region_id":"1","type":"rid"}],"pmap_id":"...","user_pmapv_id":"...","ordered":1}';      // the same in every language
  var DROP = '<path d="M12 3.5c3.2 4 5 6.4 5 9.2a5 5 0 0 1-10 0c0-2.8 1.8-5.2 5-9.2z"/>';
  function svg(inner, size) { return '<svg class="oi" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + inner + '</svg>'; }
  /** The picture of a kind: the robot, a drop for the mop, both side by side, a door for a room. */
  function kindIcon(kind, size) {
    size = size || 20;
    if (kind === 'mop') return svg(DROP, size);
    if (kind === 'both') return '<span class="vs-duo">' + UI.icon('vacuum', Math.round(size * .8)) + svg(DROP, Math.round(size * .7)) + '</span>';
    if (kind === 'room') return UI.icon('door', size);
    if (kind === 'dock') return UI.icon('home', size);
    if (kind === 'other') return UI.icon('play', size);
    return UI.icon('vacuum', size);
  }
  function todayKey() { return DAYS[(new Date().getDay() + 6) % 7]; }

  function render(ctx, item, root) {
    var t = T(ctx), hs = ctx.hass();
    var has = !!(hs.services && hs.services.scheduler && hs.services.scheduler.add);
    var wrap = h('div.ts.vs'); root.appendChild(wrap);
    if (!has) { wrap.appendChild(h('div.note-l.warn', null, t('dt.sched_missing'))); return { update: function () {}, dispose: function () {} }; }

    var S = { sched: [], loaded: false, failed: false, day: todayKey(), view: 'list', E: null, J: null, disposed: false, sig: '', openJobs: false }, reloadT = 0, X = null, regMap = {};
    var Vac = g.OkieMotor.vacuum;
    /** What Roomba+ offers for this robot (rooms, modes, favorites); empty with the plain iRobot integration. */
    function xt() { return X || { favorites: [], rooms: [], zones: [], zoneSel: null, modeSel: null, modes: [] }; }
    function refreshX() { if (Vac && Vac.ext) X = Vac.ext(ctx.hass().states, item.id, regMap); }
    if (Vac && Vac.registry) Vac.registry(ctx).then(function (m) { regMap = m || {}; refreshX(); if (!S.disposed && S.view === 'list') draw(); });
    function jobs() { return jobsFrom((ctx.settings.get().vacuum || {}).jobs); }
    function favs() { return favJobs(((ctx.state(item.id) || {}).attributes || {}).favorites); }
    function listed() { return favs().concat(jobs()); }
    function allJobs() { return [{ id: 'clean', kind: 'vacuum', builtin: true }, { id: 'dock', kind: 'dock', builtin: true }].concat(listed()); }
    function canRooms() { var x = xt(); return !!(x.zoneSel && (x.rooms.length || x.zones.length)); }
    function jobName(j) { return j.builtin ? t('vs.job_' + j.id) : j.name; }
    function jobKindLabel(j) { return j.id === 'dock' ? t('vs.job_dock') : (j.builtin ? t('vs.job_clean') : t('vs.k.' + j.kind)); }
    function clock(hhmm) {
      var m = /^(\d\d):(\d\d)/.exec(hhmm || ''); if (!m) return hhmm || '';
      var tf = ctx.settings.get().timeFormat, o = { hour: 'numeric', minute: '2-digit' };
      if (tf === '12' || tf === '12h') o.hour12 = true; else if (tf === '24' || tf === '24h') o.hour12 = false;
      try { return new Date(2000, 0, 1, +m[1], +m[2]).toLocaleTimeString(ctx.lang(), o); } catch (e) { return hhmm; }
    }
    function dayName(d) { return t('dt.' + d); }
    function load() {
      return ctx.callWS({ type: 'scheduler' }).then(function (r) { S.sched = Array.isArray(r) ? r : []; S.failed = false; }, function () { S.failed = true; })
        .then(function () { S.loaded = true; if (!S.disposed && S.view === 'list') draw(); });
    }
    function entries() { return entriesFor(S.sched, item.id, listed()); }
    function reloadSoon(ms) { clearTimeout(reloadT); reloadT = setTimeout(load, ms || 450); }
    function keepScroll(fn) { var y = (root.closest && root.closest('.dt-body')) || null, top = y ? y.scrollTop : 0; fn(); if (y) y.scrollTop = top; }

    // ---------------------------------------------------------- the list ----
    function drawList() {
      wrap.innerHTML = '';
      var all = entries();
      var tabs = h('div.ts-days', { role: 'tablist' });
      DAYS.forEach(function (d) {
        var n = onDay(all, d).length;
        tabs.appendChild(h('button.ts-day' + (S.day === d ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': S.day === d ? 'true' : 'false', dataset: { day: d }, onclick: function () { S.day = d; drawList(); } },
          dayName(d), n ? h('i', { 'aria-hidden': 'true' }) : null));
      });
      wrap.appendChild(tabs);
      if (!S.loaded) wrap.appendChild(h('div.note-l', null, t('vs.loading')));
      else if (S.failed) wrap.appendChild(h('div.note-l.warn', null, t('vs.read_fail')));
      var list = h('div.ts-list'), todays = onDay(all, S.day);
      if (S.loaded && !S.failed && !todays.length) list.appendChild(h('div.note-l.ts-empty', null, t('vs.empty_day')));
      todays.forEach(function (e) { list.appendChild(row(e)); });
      wrap.appendChild(list);
      wrap.appendChild(h('button.ts-add', { type: 'button', onclick: function () { newEntry(); }, html: UI.icon('plus', 18) + '<span>' + t('vs.add') + '</span>' }));
      wrap.appendChild(jobsPanel());
    }
    function row(e) {
      var editable = !!e.time, j = jobOf(e, listed()), builtinJ = e.job === 'clean' || e.job === 'dock';
      var kind = e.job === 'dock' ? 'dock' : (builtinJ ? 'vacuum' : (j ? j.kind : 'other'));
      var label = builtinJ ? t('vs.job_' + e.job) : (j ? j.name : (e.label ? e.label : t('vs.job_missing')));
      var sw = h('button.sw' + (e.enabled ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': e.enabled ? 'true' : 'false', 'aria-label': e.name || label,
        onclick: function (ev) { ev.stopPropagation(); ctx.haptic && ctx.haptic(8); ctx.call('switch', 'toggle', { entity_id: e.sw }).then(function () { reloadSoon(350); }, function () { ctx.toast('error', t('vs.failed')); }); } }, h('i'));
      return h('div.ts-row' + (e.enabled ? '' : '.off'), { role: 'button', tabindex: '0', dataset: { sid: e.sid, job: e.job },
        onclick: function () { if (editable) editEntry(e); }, onkeydown: function (k) { if ((k.key === 'Enter' || k.key === ' ') && editable) { k.preventDefault(); editEntry(e); } } },
        h('span.ts-ic', { html: kindIcon(kind, 20) }),
        h('div.ts-main', null, h('div.ts-nm', null, e.name || label), e.name && e.name !== label ? h('div.ts-chips', null, h('span.ts-chip.neutral.vs-chip', null, label)) : null),
        h('div.ts-time', null, e.time ? clock(e.time) : t('vs.sun')),
        sw);
    }

    // ------------------------------------------------------------- jobs ----
    function jobsPanel() {
      var box = h('div.ts-prof.vs-jobs' + (S.openJobs ? '.open' : ''));
      box.appendChild(h('button.ts-prof-h', { type: 'button', 'aria-expanded': S.openJobs ? 'true' : 'false', onclick: function () { S.openJobs = !S.openJobs; keepScroll(drawList); } },
        h('span', null, t('vs.jobs')), h('span.ts-chev', { html: UI.icon('chevdown', 18) })));
      if (!S.openJobs) return box;
      box.appendChild(h('div.ts-prof-hint', null, t('vs.jobs_hint')));
      allJobs().forEach(function (j) {
        var run = h('button.vs-run', { type: 'button', 'aria-label': t('vs.job_run') + ': ' + jobName(j), onclick: function (ev) { ev.stopPropagation(); runJob(j); }, html: UI.icon('play', 16) });
        var sub = j.builtin ? t('vs.built_in') : j.derived ? t('vs.favorite') : t('vs.k.' + j.kind);
        box.appendChild(h('div.ts-prow.vs-jrow', { dataset: { job: j.id } }, h('span.ts-ic', { html: kindIcon(j.id === 'dock' ? 'dock' : j.kind, 18) }),
          h('div.ts-pn', null, jobName(j), h('div.vs-jk', null, sub)), run,
          j.builtin || j.derived ? null : h('button.vs-edit', { type: 'button', onclick: function () { editJob(j); } }, t('vs.edit_job'))));
      });
      box.appendChild(h('button.ts-add.vs-newjob', { type: 'button', onclick: function () { newJob(); }, html: UI.icon('plus', 18) + '<span>' + t('vs.job_new') + '</span>' }));
      return box;
    }
    function runJob(j) {
      var calls = jobCalls(j, item.id); ctx.haptic && ctx.haptic(10);
      calls.reduce(function (p, c) { return p.then(function () { return ctx.call(c.domain, c.service, c.data); }); }, Promise.resolve())
        .then(function () { ctx.toast('success', t('vs.job_started', { n: jobName(j) })); }, function () { ctx.toast('error', t('vs.job_failed')); });
    }
    function saveJobs(list) { ctx.settings.set({ vacuum: { jobs: list } }); }
    function newJob() { S.J = { isNew: true, id: newJobId(jobs()), type: canRooms() ? 'rooms' : 'command', name: '', kind: 'both', command: 'start', params: '', regions: [], zones: [], mode: '', passes: '' }; S.view = 'job'; drawJob(); }
    function editJob(j) {
      S.J = { isNew: false, id: j.id, type: j.type === 'rooms' ? 'rooms' : 'command', name: j.name, kind: j.kind, command: j.command || 'start', params: j.params ? JSON.stringify(j.params) : '', regions: (j.regions || []).slice(), zones: (j.zones || []).slice(), mode: j.mode || '', passes: j.passes || '' };
      S.view = 'job'; drawJob();
    }
    function chipRow(cls, items, isOn, onPick, labelOf, iconOf) {
      var row = h('div.chiprow.' + cls);
      items.forEach(function (it) { var on = isOn(it); row.appendChild(h('button.cp.vs-job' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': on ? 'true' : 'false', dataset: { v: String(it.v) }, onclick: function () { onPick(it); } }, iconOf ? h('span.vs-ji', { html: iconOf(it) }) : null, h('span', null, labelOf(it)))); });
      return row;
    }
    function drawJob() {
      var J = S.J, x = xt(), rooms = canRooms(); wrap.innerHTML = '';
      wrap.appendChild(h('div.ts-eh', null, h('button.ts-back', { type: 'button', onclick: back, html: UI.icon('chevleft', 18) + '<span>' + t('vs.back') + '</span>' }), h('div.ts-et', null, J.isNew ? t('vs.job_new') : t('vs.job_edit'))));
      wrap.appendChild(h('div.lbl', null, t('vs.job_name')));
      wrap.appendChild(h('input.ts-name.vs-jname', { type: 'text', value: J.name, placeholder: t('vs.job_name_ph'), maxlength: '40', 'aria-label': t('vs.job_name'), oninput: function () { J.name = this.value; } }));
      if (rooms) {
        wrap.appendChild(h('div.lbl', null, t('vs.type')));
        var types = h('div.chiprow.vs-types');
        [['rooms', 'vs.type_rooms'], ['command', 'vs.type_command']].forEach(function (p) { types.appendChild(h('button.cp.vs-job' + (J.type === p[0] ? '.on' : ''), { type: 'button', 'aria-pressed': J.type === p[0] ? 'true' : 'false', dataset: { type: p[0] }, onclick: function () { J.type = p[0]; drawJob(); } }, t(p[1]))); });
        wrap.appendChild(types);
      } else J.type = 'command';
      var bad = null;
      if (J.type === 'rooms') {
        wrap.appendChild(h('div.lbl', null, t('vs.rooms')));
        var rr = h('div.chiprow.vs-roomchips'), allHint = h('div.ts-hint.vs-allhint', null, t('vs.rooms_all'));
        function drawRooms() {
          rr.innerHTML = ''; allHint.hidden = J.regions.length + J.zones.length > 0;
          x.rooms.map(function (n) { return { n: n, z: false }; }).concat(x.zones.map(function (n) { return { n: n, z: true }; })).forEach(function (it) {
            var list = it.z ? J.zones : J.regions, on = list.indexOf(it.n) >= 0;
            rr.appendChild(h('button.cp.vs-job' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': on ? 'true' : 'false', dataset: { room: it.n, zone: it.z ? '1' : '0' }, onclick: function () { var i = list.indexOf(it.n); if (i >= 0) list.splice(i, 1); else list.push(it.n); drawRooms(); } }, h('span.vs-ji', { html: kindIcon('room', 16) }), h('span', null, it.n.trim())));
          });
        }
        drawRooms(); wrap.appendChild(rr); wrap.appendChild(allHint);
        wrap.appendChild(h('div.lbl', null, t('vs.mode')));
        var modeItems = [{ v: '' }].concat(MODES.map(function (m) { return { v: m }; }));
        var mrow = chipRow('vs-modes', modeItems, function (it) { return J.mode === it.v; }, function (it) { J.mode = it.v; drawJob(); }, function (it) { return it.v ? t('vc.m.' + it.v) : t('vs.mode_default'); }, function (it) { return kindIcon(it.v ? roomsKind(it.v) : 'room', 16); });
        wrap.appendChild(mrow);
        wrap.appendChild(h('div.lbl', null, t('vs.passes')));
        wrap.appendChild(chipRow('vs-passes', [{ v: '' }, { v: 'one' }, { v: 'two' }], function (it) { return J.passes === it.v; }, function (it) { J.passes = it.v; drawJob(); }, function (it) { return it.v ? t('vs.passes_' + it.v) : t('vs.mode_default'); }));
        wrap.appendChild(h('div.ts-hint', null, t('vs.rooms_help')));
      } else {
        wrap.appendChild(h('div.lbl', null, t('vs.job_kind')));
        var kinds = h('div.chiprow.vs-kinds');
        function drawKinds() { kinds.innerHTML = ''; KINDS.forEach(function (k) { kinds.appendChild(h('button.cp.vs-job' + (J.kind === k ? '.on' : ''), { type: 'button', 'aria-pressed': J.kind === k ? 'true' : 'false', dataset: { kind: k }, onclick: function () { J.kind = k; drawKinds(); } }, h('span.vs-ji', { html: kindIcon(k, 16) }), h('span', null, t('vs.k.' + k)))); }); }
        drawKinds(); wrap.appendChild(kinds);
        wrap.appendChild(h('div.lbl', null, t('vs.job_command')));
        wrap.appendChild(h('input.ts-name.vs-jcmd', { type: 'text', value: J.command, maxlength: '60', autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': t('vs.job_command'), oninput: function () { J.command = this.value; } }));
        wrap.appendChild(h('div.lbl', null, t('vs.job_params')));
        var ta = h('textarea.ts-name.vs-jparams', { rows: '4', placeholder: PARAMS_PH, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': t('vs.job_params'), oninput: function () { J.params = this.value; if (bad) bad.hidden = true; } });
        ta.value = J.params; wrap.appendChild(ta);
        bad = h('div.note-l.warn.vs-bad', null, t('vs.job_params_bad')); bad.hidden = true; wrap.appendChild(bad);
        wrap.appendChild(h('div.ts-hint', null, t('vs.job_help')));
      }
      function build() {
        var name = String(J.name || '').trim(); if (!name) { ctx.toast('error', t('vs.job_name_empty')); return null; }
        if (J.type === 'rooms') {
          var regs = J.regions.slice(), zs = J.zones.slice(); if (!regs.length && !zs.length) regs = x.rooms.slice();
          if (!regs.length && !zs.length) { ctx.toast('error', t('vs.job_rooms_empty')); return null; }
          return cleanJob({ id: J.id, name: name, type: 'rooms', regions: regs, zones: zs, mode: J.mode, passes: J.passes });
        }
        var p = parseParams(J.params); if (!p.ok) { if (bad) bad.hidden = false; return null; }
        if (!String(J.command || '').trim()) { ctx.toast('error', t('vs.job_cmd_empty')); return null; }
        return cleanJob({ id: J.id, name: name, kind: J.kind, command: J.command, params: p.value });
      }
      var row2 = h('div.vs-actions');
      row2.appendChild(h('button.act.primary.ts-save.vs-jsave', { type: 'button', onclick: function () {
        var j = build(); if (!j) return;
        var cur = jobs(), next = cur.some(function (y) { return y.id === j.id; }) ? cur.map(function (y) { return y.id === j.id ? j : y; }) : cur.concat([j]);
        saveJobs(next); ctx.toast('success', t('vs.job_saved')); S.openJobs = true; back();
      } }, t('vs.job_save')));
      row2.appendChild(h('button.act.vs-jtest', { type: 'button', onclick: function () { var j = build(); if (j) runJob(j); } }, t('vs.job_run')));
      wrap.appendChild(row2);
      if (!J.isNew) wrap.appendChild(h('button.act.danger.ts-del.vs-jdel', { type: 'button', onclick: function () {
        var id = J.id; saveJobs(jobs().filter(function (y) { return y.id !== id; })); ctx.toast('success', t('vs.job_deleted')); S.openJobs = true; back();
      } }, t('vs.delete')));
    }

    // ----------------------------------------------------------- the editor ----
    function now5() { var d = new Date(), m = Math.ceil(d.getMinutes() / 5) * 5, hh = d.getHours() + (m >= 60 ? 1 : 0); return ('0' + (hh % 24)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
    function newEntry() { S.E = { isNew: true, name: '', time: now5(), days: [S.day], job: 'clean' }; S.view = 'edit'; drawEdit(); }
    function editEntry(e) { S.E = { isNew: false, e: e, name: e.name, time: e.time, days: e.days.slice(), job: e.job, keep: e.job === 'other' ? e : null }; S.view = 'edit'; drawEdit(); }
    function back() { S.view = 'list'; S.E = null; S.J = null; draw(); }
    function drawEdit() {
      var E = S.E; wrap.innerHTML = '';
      wrap.appendChild(h('div.ts-eh', null, h('button.ts-back', { type: 'button', onclick: back, html: UI.icon('chevleft', 18) + '<span>' + t('vs.back') + '</span>' }), h('div.ts-et', null, E.isNew ? t('vs.new') : t('vs.edit'))));
      wrap.appendChild(h('div.lbl', null, t('vs.name')));
      wrap.appendChild(h('input.ts-name', { type: 'text', value: E.name, placeholder: t('vs.name_ph'), maxlength: '40', 'aria-label': t('vs.name'), oninput: function () { E.name = this.value; } }));

      var hours = [], mins = []; for (var i = 0; i < 24; i++) hours.push(('0' + i).slice(-2)); for (var j = 0; j < 60; j += 5) mins.push(('0' + j).slice(-2));
      var tm = /^(\d\d):(\d\d)/.exec(E.time || '07:00'), mm = ('0' + (Math.round(+tm[2] / 5) * 5 % 60)).slice(-2);
      var wh = g.OkieMotor.detail.createWheel({ values: hours, value: tm[1], label: 'Hour', onChange: function (v) { E.time = v + ':' + (wm ? wm.value : mm); } });
      var wm = g.OkieMotor.detail.createWheel({ values: mins, value: mm, label: 'Minute', onChange: function (v) { E.time = wh.value + ':' + v; } });
      wrap.appendChild(h('div.lbl', null, t('vs.time'))); wrap.appendChild(h('div.wheels.ts-wheels', null, wh.el, h('div.colon', null, ':'), wm.el));

      var dayRow = h('div.chiprow.ts-dayrow');
      function drawDays() { dayRow.innerHTML = ''; DAYS.forEach(function (d) { var on = E.days.indexOf(d) >= 0; dayRow.appendChild(h('button.cp' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': on ? 'true' : 'false', dataset: { day: d }, onclick: function () { var i2 = E.days.indexOf(d); if (i2 >= 0) E.days.splice(i2, 1); else E.days.push(d); drawDays(); } }, dayName(d))); }); }
      drawDays();
      var quick = h('div.chiprow.ts-quick');
      [['vs.every', DAYS], ['vs.weekdays', WEEKDAYS], ['vs.weekend', WEEKEND]].forEach(function (q) { quick.appendChild(h('button.cp.ghost', { type: 'button', onclick: function () { E.days = q[1].slice(); drawDays(); } }, t(q[0]))); });
      wrap.appendChild(h('div.lbl', null, t('vs.days'))); wrap.appendChild(dayRow); wrap.appendChild(quick);

      // what it does: one chip per job
      var picks = h('div.chiprow.vs-picks');
      function drawPicks() {
        picks.innerHTML = '';
        var list = allJobs();
        if (E.job === 'other' && E.keep) list = list.concat([{ id: 'other', kind: 'other', name: E.keep.label || t('vs.job_missing') }]);
        else if (E.job !== 'other' && !list.some(function (x) { return x.id === E.job; })) list = list.concat([{ id: E.job, kind: 'other', name: t('vs.job_missing') }]);
        list.forEach(function (j) {
          var on = E.job === j.id;
          picks.appendChild(h('button.cp.vs-job' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': on ? 'true' : 'false', dataset: { job: j.id }, onclick: function () { E.job = j.id; ctx.haptic && ctx.haptic(6); drawPicks(); } },
            h('span.vs-ji', { html: kindIcon(j.id === 'dock' ? 'dock' : j.kind, 16) }), h('span', null, j.builtin ? t('vs.job_' + j.id) : (j.name || ''))));
        });
      }
      drawPicks();
      wrap.appendChild(h('div.lbl', null, t('vs.what'))); wrap.appendChild(picks);

      wrap.appendChild(h('button.act.primary.ts-save', { type: 'button', onclick: function () { doSave(); } }, t('vs.save')));
      if (!E.isNew) wrap.appendChild(h('button.act.danger.ts-del', { type: 'button', onclick: function () { doDelete(); } }, t('vs.delete')));
    }
    function doSave() {
      var E = S.E;
      if (!E.days.length) { ctx.toast('error', t('vs.day_empty')); return; }
      var actions;
      if (E.job === 'other' && E.keep) actions = (E.keep.sc.timeslots[E.keep.slot].actions || []).slice();          // a command that is not in the job list stays as it was
      else { var job = allJobs().filter(function (x) { return x.id === E.job; })[0] || { id: 'clean' }; actions = jobActions(job, item.id); }
      var jn = (allJobs().filter(function (x) { return x.id === E.job; })[0]) || null;
      var name = String(E.name || '').trim() || (jn ? jobName(jn) : t('vs.job_clean'));
      var slot = { start: (E.time || '07:00') + ':00', actions: actions };
      var days = DAYS.filter(function (d) { return E.days.indexOf(d) >= 0; }), p;
      if (E.isNew) p = ctx.call('scheduler', 'add', { weekdays: days, timeslots: [slot], repeat_type: 'repeat', name: name });
      else {
        var e = E.e, slots = (e.sc.timeslots || []).map(function (s, i) { return i === e.slot ? slot : cleanSlot(s); });
        p = ctx.call('scheduler', 'edit', { entity_id: e.sw, weekdays: days, timeslots: slots, name: name });
      }
      p.then(function () { ctx.toast('success', t('vs.saved')); if (days.indexOf(S.day) < 0) S.day = days[0]; S.view = 'list'; S.E = null; draw(); reloadSoon(500); }, function () { ctx.toast('error', t('vs.failed')); });
    }
    function doDelete() {
      var e = S.E.e; S.view = 'list'; S.E = null; drawList();
      var rowEl = wrap.querySelector('.ts-row[data-sid="' + e.sid + '"]'); if (rowEl) rowEl.style.display = 'none';
      ctx.defer(t('dt.sched_deleted'),
        function () {
          var done = e.slots > 1
            ? ctx.call('scheduler', 'edit', { entity_id: e.sw, timeslots: (e.sc.timeslots || []).filter(function (s, i) { return i !== e.slot; }).map(cleanSlot) })
            : ctx.call('scheduler', 'remove', { entity_id: e.sw });
          done.then(function () { reloadSoon(400); }, function () { if (rowEl) rowEl.style.display = ''; ctx.toast('error', t('dt.delete')); });
        },
        function () { if (rowEl) rowEl.style.display = ''; });
    }

    function draw() { if (S.disposed) return; if (S.view === 'edit') drawEdit(); else if (S.view === 'job') drawJob(); else drawList(); }
    draw(); load();
    return {
      update: function () {
        refreshX();
        var st = ctx.hass().states, sig = Object.keys(st).filter(function (k) { return /^switch\.schedule_/.test(k); }).map(function (k) { return k + st[k].state + (st[k].last_updated || ''); }).join('|');
        if (sig !== S.sig) { var first = S.sig === ''; S.sig = sig; if (!first) reloadSoon(350); }
      },
      dispose: function () { S.disposed = true; clearTimeout(reloadT); },
    };
  }

  var CSS = [
    '.vs-duo{display:inline-flex;align-items:center;gap:1px;}',
    '.vs-chip{font-weight:600;font-size:13px;min-width:0;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.vs .ts-chips{min-width:0;}',
    '.vs-job{display:inline-flex;align-items:center;gap:7px;}.vs-ji{display:inline-flex;}',
    '.vs-jrow{align-items:center;}.vs-jk{font-size:12px;font-weight:500;color:var(--okie-text-dim);margin-top:2px;}',
    '.vs-run{width:40px;height:40px;border-radius:50%;background:rgba(255,255,255,.16);color:#fff;display:grid;place-items:center;flex:none;}.vs-run:active{background:rgba(255,255,255,.3);}',
    '.vs-edit{padding:8px 14px;border-radius:999px;background:rgba(255,255,255,.12);font-size:13px;font-weight:600;flex:none;}',
    '.vs-newjob{margin:6px 16px 14px;width:auto;}',
    'textarea.ts-name{resize:vertical;min-height:84px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px;line-height:1.4;}',
    '.vs-actions{display:flex;gap:10px;flex-wrap:wrap;align-items:center;}.vs-jtest{background:rgba(255,255,255,.14);color:#fff;}',
    '.vs-bad[hidden]{display:none;}.vs-roomchips,.vs-modes,.vs-passes,.vs-types{margin-bottom:2px;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  g.OkieMotor.vacSchedule = Object.assign({ render: render, CSS: CSS, kindIcon: kindIcon }, pureApi);
})(typeof globalThis !== 'undefined' ? globalThis : window);

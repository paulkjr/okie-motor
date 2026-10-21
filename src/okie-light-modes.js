/* okie-light-modes: lighting "modes" (Cozy lights, Let's go to sleep, Turn up the lights ...) as fancy cards.
 *
 * A mode has a name, a picture, a colour and a list of things it does, in order:
 *   - run a script or a scene            (your Govee shortcuts are scripts: they keep doing exactly what they do)
 *   - set some lights                    on (with a brightness) or off
 *   - set all the lights of a room       on (with a brightness) or off
 * and where it shows: the Favorites tab of the start screen and the rooms you pick (the Living Room, for example).
 * Modes are edited in Settings > General > Light modes: change one, add more, put any of them on a weekly schedule (the Scheduler component).
 *
 * The pure part (modes, their service calls, schedule matching) is unit-tested; the DOM part is checked in the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var TS = isNode ? require('./okie-thermo-sched.js') : (g.OkieMotor && g.OkieMotor.thermoSchedule);
  if (!TS) return;
  var DAYS = TS.DAYS, WEEKDAYS = TS.WEEKDAYS, WEEKEND = TS.WEEKEND, expandDays = TS.expandDays, clockOf = TS.clockOf, cleanSlot = TS.cleanSlot, onDay = TS.onDay;

  var ICONS = ['flame', 'moon', 'sun', 'bulb', 'star', 'heart', 'spark', 'tv', 'home', 'bolt'];
  var COLORS = [['#ff8a5c', '#c8423f'], ['#7c7cff', '#2f2f8f'], ['#f5a30b', '#b4560a'], ['#3fb8b4', '#17696a'], ['#ff7ab8', '#a82a72'], ['#5bc27a', '#1f6b3b']];

  function str(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 80); }
  function ids(v) { var seen = {}; return [].concat(v == null ? [] : v).map(function (x) { return str(x, 120); }).filter(function (x) { if (!x || seen[x]) return false; seen[x] = true; return true; }); }
  function pct(v) { var n = parseFloat(v); return isFinite(n) ? Math.max(1, Math.min(100, Math.round(n))) : null; }
  function hex(c, d) { return /^#[0-9a-f]{6}$/i.test(String(c)) ? String(c).toLowerCase() : d; }
  function norm(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  /** One thing a mode does, made safe; null when it cannot be used. */
  function cleanItem(it) {
    if (!it || typeof it !== 'object') return null;
    if (it.type === 'script' || it.type === 'scene') { var e = str(it.entity, 120); return new RegExp('^' + it.type + '\\.').test(e) ? { type: it.type, entity: e } : null; }
    var state = it.state === 'off' ? 'off' : 'on';
    if (it.type === 'lights') { var es = ids(it.entities).filter(function (x) { return /^light\./.test(x); }); return es.length ? { type: 'lights', entities: es, state: state, brightness: state === 'on' ? pct(it.brightness) : null } : null; }
    if (it.type === 'area') { var a = str(it.area, 80); return a ? { type: 'area', area: a, state: state, brightness: state === 'on' ? pct(it.brightness) : null } : null; }
    return null;
  }
  /** One saved mode made safe: { id, name, icon, color: [from, to], run: [...], showIn: { favorites, rooms: [...] } }; null when it has no name or nothing to do. */
  function cleanMode(m) {
    if (!m || typeof m !== 'object') return null;
    var id = str(m.id, 40), name = str(m.name, 40), run = (Array.isArray(m.run) ? m.run : []).map(cleanItem).filter(Boolean);
    if (!id || !name || !run.length) return null;
    var c = Array.isArray(m.color) ? m.color : [], si = m.showIn || {};
    return { id: id, name: name, icon: ICONS.indexOf(m.icon) >= 0 ? m.icon : 'bulb', color: [hex(c[0], COLORS[0][0]), hex(c[1], COLORS[0][1])], run: run,
      showIn: { favorites: si.favorites !== false, rooms: ids(si.rooms) } };
  }
  function modesFrom(list) { var seen = {}; return (Array.isArray(list) ? list : []).map(cleanMode).filter(function (m) { if (!m || seen[m.id]) return false; seen[m.id] = true; return true; }); }
  function newId(list) { var id; do { id = 'm' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36); } while ((list || []).some(function (m) { return m.id === id; })); return id; }
  /** The three modes the card ships with: your Govee shortcuts. They run the scripts, so they do exactly what they did. */
  function defaultModes() {
    return modesFrom([
      { id: 'cozy', name: 'Cozy lights', icon: 'flame', color: COLORS[0], run: [{ type: 'script', entity: 'script.govee_cozy_lights' }], showIn: { favorites: true, rooms: ['living_room'] } },
      { id: 'sleep', name: "Let's go to sleep", icon: 'moon', color: COLORS[1], run: [{ type: 'script', entity: 'script.govee_lets_go_to_sleep' }], showIn: { favorites: true, rooms: ['living_room'] } },
      { id: 'bright', name: 'Turn up the lights', icon: 'sun', color: COLORS[2], run: [{ type: 'script', entity: 'script.govee_turn_up_the_lights' }], showIn: { favorites: true, rooms: ['living_room'] } },
    ]);
  }
  /** The modes in use: the saved list, else the three it ships with. */
  function modesOf(saved) { return saved == null ? defaultModes() : modesFrom(saved); }

  /** The service calls of a mode, in order. */
  function callsFor(mode) {
    var out = [];
    mode.run.forEach(function (it) {
      if (it.type === 'script') out.push({ domain: 'script', service: 'turn_on', data: { entity_id: it.entity } });
      else if (it.type === 'scene') out.push({ domain: 'scene', service: 'turn_on', data: { entity_id: it.entity } });
      else {
        var target = it.type === 'lights' ? { entity_id: it.entities.slice() } : { area_id: it.area };
        if (it.state === 'off') out.push({ domain: 'light', service: 'turn_off', data: target });
        else out.push({ domain: 'light', service: 'turn_on', data: it.brightness ? Object.assign({ brightness_pct: it.brightness }, target) : target });
      }
    });
    return out;
  }
  /** The same as Scheduler actions. */
  function actionsFor(mode) {
    return callsFor(mode).map(function (c) {
      var d = Object.assign({}, c.data), a = { service: c.domain + '.' + c.service };
      if (d.entity_id) { a.entity_id = d.entity_id; delete d.entity_id; }
      if (Object.keys(d).length) a.service_data = d;
      return a;
    });
  }
  function stable(v) {
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
    return JSON.stringify(v === undefined ? null : v);
  }
  /** Actions as the Scheduler hands them back, made comparable (the entity wherever it was put). */
  function normActions(actions) {
    return (actions || []).map(function (a) {
      var d = Object.assign({}, a.service_data || {}), e = [].concat(a.entity_id || [], d.entity_id || []).sort(); delete d.entity_id;
      return { s: String(a.service || ''), e: e, d: d };
    });
  }
  /** The entries (one per time slot) of the Scheduler's list that run exactly this mode. */
  function entriesFor(schedules, mode) {
    var want = stable(normActions(actionsFor(mode))), out = [];
    (schedules || []).forEach(function (sc) {
      (sc.timeslots || []).forEach(function (slot, idx) {
        if (stable(normActions(slot.actions)) !== want) return;
        out.push({ sid: sc.schedule_id, sw: sc.entity_id || ('switch.schedule_' + sc.schedule_id), slot: idx, slots: sc.timeslots.length, name: sc.name || '', days: expandDays(sc.weekdays), enabled: sc.enabled !== false, time: clockOf(slot.start), start: slot.start, sc: sc });
      });
    });
    return out.sort(function (a, b) { return String(a.time || '99:99') < String(b.time || '99:99') ? -1 : 1; });
  }
  /** Everything a mode points at exists (a script that was deleted hides the card instead of showing one that fails). */
  function available(mode, states, areas) {
    return mode.run.every(function (it) {
      if (it.type === 'script' || it.type === 'scene') return !!(states && states[it.entity]);
      if (it.type === 'lights') return it.entities.some(function (e) { return !!(states && states[e]); });
      return !areas || !!areas[it.area] || Object.keys(areas).some(function (k) { return norm(k) === norm(it.area); });
    });
  }
  /** Does the mode show in `where`: { favorites: true } or { room: { id, name, baseName, areaId } }. */
  function visibleIn(mode, where) {
    if (where && where.favorites) return mode.showIn.favorites;
    var r = where && where.room; if (!r) return false;
    var keys = [r.id, r.name, r.baseName, r.areaId].filter(Boolean).map(norm);
    return mode.showIn.rooms.some(function (x) { return keys.indexOf(norm(x)) >= 0; });
  }
  /** A line that tells what a mode does: "Script: Govee shortcut: Cozy lights", "3 lights on at 40%". */
  function describeItem(it, states, tr) {
    var nameOf = function (e) { var s = states && states[e]; return (s && s.attributes && s.attributes.friendly_name) || e; };
    if (it.type === 'script') return tr('lm.d_script', { n: nameOf(it.entity) });
    if (it.type === 'scene') return tr('lm.d_scene', { n: nameOf(it.entity) });
    var what = it.type === 'lights' ? (it.entities.length === 1 ? nameOf(it.entities[0]) : tr('lm.d_n_lights', { n: it.entities.length })) : tr('lm.d_room', { n: it.area });
    return it.state === 'off' ? tr('lm.d_off', { w: what }) : (it.brightness ? tr('lm.d_on_at', { w: what, p: it.brightness }) : tr('lm.d_on', { w: what }));
  }

  /** When a mode last ran: the newest of its scripts' last_triggered, its scenes' activation time (the state of a scene) and the time this device ran it (`local`: { modeId: ms }). 0 = not known. */
  function ranAt(mode, states, local) {
    var best = +((local && local[mode.id]) || 0);
    mode.run.forEach(function (it) {
      var st = states && states[it.entity], v = 0;
      if (it.type === 'script' && st && st.attributes && st.attributes.last_triggered) v = Date.parse(st.attributes.last_triggered);
      else if (it.type === 'scene' && st && st.state && st.state !== 'unknown' && st.state !== 'unavailable') v = Date.parse(st.state);
      if (v > best) best = v;      // a date that cannot be read is NaN, and NaN is never bigger
    });
    return best;
  }
  /** The mode that ran last (its id), or null when nothing is known. A tie goes to the one listed first. */
  function activeMode(modes, states, local) {
    var best = null, at = 0;
    modes.forEach(function (m) { var t = ranAt(m, states, local); if (t > at) { at = t; best = m.id; } });
    return best;
  }

  var pureApi = { ICONS: ICONS, ranAt: ranAt, activeMode: activeMode, COLORS: COLORS, cleanItem: cleanItem, cleanMode: cleanMode, modesFrom: modesFrom, newId: newId, defaultModes: defaultModes, modesOf: modesOf, callsFor: callsFor, actionsFor: actionsFor,
    normActions: normActions, entriesFor: entriesFor, available: available, visibleIn: visibleIn, describeItem: describeItem };
  if (isNode) { module.exports = pureApi; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ DOM ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;

  core.registerStrings('en', {
    'lm.title': 'Light modes', 'lm.ran': '{n} started', 'lm.failed': 'That mode could not run', 'lm.running': 'Running',
    'lm.desc': 'Shortcuts for your lights: cards on the Favorites tab and in the rooms you choose.', 'lm.count': '{n} modes',
    'lm.intro': 'A mode runs a script or a scene, sets some lights or all the lights of a room. Your Govee shortcuts are scripts, so they keep doing what they did.',
    'lm.add': 'Add a mode', 'lm.edit': 'Edit', 'lm.run': 'Run now', 'lm.delete': 'Delete', 'lm.save': 'Save mode', 'lm.back': 'Modes', 'lm.reset': 'Back to the original three',
    'lm.new': 'New mode', 'lm.edit_t': 'Edit mode', 'lm.name': 'Name', 'lm.name_ph': 'Name, for example Movie night', 'lm.icon': 'Picture', 'lm.color': 'Color', 'lm.does': 'What it does',
    'lm.add_script': 'Script or scene', 'lm.add_lights': 'Some lights', 'lm.add_room': 'A room\'s lights', 'lm.pick': 'Choose…', 'lm.on': 'On', 'lm.off': 'Off', 'lm.bright': 'Brightness', 'lm.keep_bright': 'Keep brightness',
    'lm.add_item': 'Add', 'lm.remove': 'Remove', 'lm.nothing': 'Add at least one thing for it to do', 'lm.name_empty': 'Give the mode a name', 'lm.saved': 'Mode saved', 'lm.deleted': 'Mode deleted',
    'lm.show': 'Where it shows', 'lm.show_fav': 'Favorites', 'lm.show_rooms': 'Rooms', 'lm.missing': 'Not found on this Home Assistant: the card is hidden until it is back',
    'lm.sched': 'Schedule', 'lm.sched_add': 'Add a schedule', 'lm.sched_none': 'Not scheduled yet.', 'lm.sched_time': 'Time', 'lm.sched_days': 'Days', 'lm.sched_save': 'Save schedule', 'lm.sched_saved': 'Schedule saved', 'lm.sched_deleted': 'Schedule deleted',
    'lm.sched_failed': 'The schedule could not be saved', 'lm.sched_needs': 'Schedules need the Scheduler component (HACS: nielsfaber/scheduler-component).', 'lm.every': 'Every day', 'lm.weekdays': 'Mon - Fri', 'lm.weekend': 'Weekend', 'lm.sched_hint': 'Runs even when no screen is open.',
    'lm.d_script': 'Runs the script {n}', 'lm.d_scene': 'Activates the scene {n}', 'lm.d_n_lights': '{n} lights', 'lm.d_room': 'the lights in {n}', 'lm.d_off': 'Turns {w} off', 'lm.d_on': 'Turns {w} on', 'lm.d_on_at': 'Turns {w} on at {p}%',
    'lm.sub': 'Tap to run', 'lm.active': 'Active', 'lm.layout': 'Layout', 'lm.layout_h': 'Side by side', 'lm.layout_v': 'Stacked', 'lm.layout_c': 'Icons only', 'lm.edit_all': 'Edit light modes', 'lm.app_sub': 'Tap a row to run it. Edit, add or schedule them here.',
  });
  core.registerStrings('de', {
    'lm.title': 'Lichtmodi', 'lm.ran': '{n} gestartet', 'lm.failed': 'Der Modus konnte nicht laufen', 'lm.running': 'Läuft',
    'lm.desc': 'Kurzbefehle für deine Lichter: Karten bei den Favoriten und in den Räumen, die du wählst.', 'lm.count': '{n} Modi',
    'lm.intro': 'Ein Modus startet ein Skript oder eine Szene, stellt einige Lichter oder alle Lichter eines Raums ein. Deine Govee-Kurzbefehle sind Skripte, sie tun also weiter, was sie taten.',
    'lm.add': 'Modus hinzufügen', 'lm.edit': 'Bearbeiten', 'lm.run': 'Jetzt starten', 'lm.delete': 'Löschen', 'lm.save': 'Modus speichern', 'lm.back': 'Modi', 'lm.reset': 'Zurück zu den ursprünglichen drei',
    'lm.new': 'Neuer Modus', 'lm.edit_t': 'Modus bearbeiten', 'lm.name': 'Name', 'lm.name_ph': 'Name, zum Beispiel Filmabend', 'lm.icon': 'Symbol', 'lm.color': 'Farbe', 'lm.does': 'Was er tut',
    'lm.add_script': 'Skript oder Szene', 'lm.add_lights': 'Einige Lichter', 'lm.add_room': 'Lichter eines Raums', 'lm.pick': 'Wählen…', 'lm.on': 'An', 'lm.off': 'Aus', 'lm.bright': 'Helligkeit', 'lm.keep_bright': 'Helligkeit lassen',
    'lm.add_item': 'Hinzufügen', 'lm.remove': 'Entfernen', 'lm.nothing': 'Füge mindestens etwas hinzu, das er tut', 'lm.name_empty': 'Gib dem Modus einen Namen', 'lm.saved': 'Modus gespeichert', 'lm.deleted': 'Modus gelöscht',
    'lm.show': 'Wo er erscheint', 'lm.show_fav': 'Favoriten', 'lm.show_rooms': 'Räume', 'lm.missing': 'In diesem Home Assistant nicht gefunden: die Karte bleibt verborgen, bis es wieder da ist',
    'lm.sched': 'Zeitplan', 'lm.sched_add': 'Zeitplan hinzufügen', 'lm.sched_none': 'Noch nicht geplant.', 'lm.sched_time': 'Zeit', 'lm.sched_days': 'Tage', 'lm.sched_save': 'Zeitplan speichern', 'lm.sched_saved': 'Zeitplan gespeichert', 'lm.sched_deleted': 'Zeitplan gelöscht',
    'lm.sched_failed': 'Der Zeitplan konnte nicht gespeichert werden', 'lm.sched_needs': 'Zeitpläne brauchen die Scheduler-Komponente (HACS: nielsfaber/scheduler-component).', 'lm.every': 'Jeden Tag', 'lm.weekdays': 'Mo - Fr', 'lm.weekend': 'Wochenende', 'lm.sched_hint': 'Läuft auch, wenn kein Bildschirm offen ist.',
    'lm.d_script': 'Startet das Skript {n}', 'lm.d_scene': 'Aktiviert die Szene {n}', 'lm.d_n_lights': '{n} Lichter', 'lm.d_room': 'die Lichter in {n}', 'lm.d_off': 'Schaltet {w} aus', 'lm.d_on': 'Schaltet {w} ein', 'lm.d_on_at': 'Schaltet {w} auf {p} % ein',
    'lm.sub': 'Zum Starten tippen', 'lm.active': 'Aktiv', 'lm.layout': 'Anordnung', 'lm.layout_h': 'Nebeneinander', 'lm.layout_v': 'Untereinander', 'lm.layout_c': 'Nur Symbole', 'lm.edit_all': 'Lichtmodi bearbeiten', 'lm.app_sub': 'Zeile antippen zum Starten. Hier bearbeiten, hinzufügen oder planen.',
  });
  function T(ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; }
  function modesNow(ctx) { return modesOf(ctx.settings.get().lightModes); }
  /** The look switches of the card: which things it shows (all on by default). */
  function lookOf(ctx) { return Object.assign({ active: true, chevron: true, hint: true }, ctx.settings.get().lightModesLook); }
  /** 'horizontal' (side by side), 'vertical' (stacked) or 'compact' (a thin strip of pictures only). */
  function layoutOf(ctx) { var v = ctx.settings.get().lightModesLayout; return v === 'vertical' || v === 'compact' ? v : 'horizontal'; }
  function areasOf(ctx) { var hs = ctx.hass(); return (hs && hs.areas) || null; }
  function dayName(ctx, d) { return core.t('dt.' + d, ctx.lang()); }

  /** Run a mode: its calls one after the other. */
  function run(ctx, mode, el) {
    var t = T(ctx), calls = callsFor(mode); ctx.haptic && ctx.haptic(12);
    if (el) el.dataset.run = '1';
    var last = Object.assign({}, ctx.store.get('lm.last', {})), before = last[mode.id];      // this device remembers what it ran, for the modes that leave no trace in Home Assistant (lights, rooms)
    last[mode.id] = Date.now(); ctx.store.set('lm.last', last); if (ctx.bus) ctx.bus.emit('lm-ran', mode.id);
    var log = (ctx.store.get('lm.log', []) || []).slice(-79); log.push({ id: mode.id, at: Date.now() }); ctx.store.set('lm.log', log);
    return calls.reduce(function (p, c) { return p.then(function () { return ctx.call(c.domain, c.service, c.data); }); }, Promise.resolve())
      .then(function () { ctx.toast('success', t('lm.ran', { n: mode.name })); if (el) { el.dataset.run = ''; el.classList.remove('done'); void el.offsetWidth; el.classList.add('done'); } },
        function () { ctx.toast('error', t('lm.failed')); if (el) el.dataset.run = ''; var l2 = Object.assign({}, ctx.store.get('lm.last', {})); if (before) l2[mode.id] = before; else delete l2[mode.id]; ctx.store.set('lm.last', l2); if (ctx.bus) ctx.bus.emit('lm-ran', mode.id); });
  }

  /**
   * The light modes that show in `where` ({ favorites: true } or { room }) as ONE card, like the thermostat card: a column of picture keys, a line, the names,
   * every mode separated from the next by a line, and a colored chevron that opens the editor. A tap on a row runs the mode. null when there is none.
   * It redraws itself when the modes change in Settings.
   */
  function strip(ctx, where) {
    var t = T(ctx), root = h('div.lm-strip'), offs = [], shown = [], rowsById = {}, go = null, ro = null;
    /** The mode that ran last gives the chevron its color and its row a tint ("Active"); with none known the chevron stays gray. */
    function paint() {
      if (!shown.length) return;
      var hs = ctx.hass(), look = lookOf(ctx), act = activeMode(shown, hs && hs.states, ctx.store.get('lm.last', {})), m = null;
      shown.forEach(function (x) { var r = rowsById[x.id]; if (!r) return; var on = x.id === act; if (on) m = x; var mark = on && look.active; r.row.dataset.active = mark ? '1' : '0'; r.sub.textContent = mark ? t('lm.active') : (look.hint ? t('lm.sub') : ''); });
      var col = m && look.chevron ? m.color[0] : '#8d8a86';
      if (go) go.style.setProperty('--lm-go', col);
      root.firstChild && root.firstChild.style.setProperty('--lm-go', col);
    }
    function draw() {
      var hs = ctx.hass(), list = modesNow(ctx).filter(function (m) { return visibleIn(m, where) && available(m, hs && hs.states, areasOf(ctx)); });
      root.innerHTML = ''; root.hidden = !list.length; shown = list; rowsById = {}; go = null; if (!list.length) return;
      var edit = function () { if (ctx.haptic) ctx.haptic(8); ctx.openApp('lightmodes', { push: true }); };
      var lay = layoutOf(ctx), horiz = lay === 'horizontal', compact = lay === 'compact', rowish = horiz || compact, body = h('div.lmc-body');
      if (!rowish) body.appendChild(h('button.lmc-head', { type: 'button', 'aria-label': t('lm.edit_all'), onclick: edit }, h('span.lmc-cap', null, t('lm.title')), h('span.lmc-n', null, t('lm.count', { n: list.length }))));
      list.forEach(function (m) {
        var row = h('button.lmc-row', { type: 'button', dataset: { mode: m.id }, 'aria-label': m.name });
        row.style.setProperty('--lm-a', m.color[0]); row.style.setProperty('--lm-b', m.color[1]);
        row.onclick = function () { run(ctx, m, row); };
        row.appendChild(h('span.lmc-ic', { html: UI.icon(m.icon, 24) }));
        var sub = h('span.lmc-sub', null, t('lm.sub')); rowsById[m.id] = { row: row, sub: sub };
        if (compact) row.title = m.name;      // pictures only: the name is the tooltip and the label for a screen reader
        else row.appendChild(h('span.lmc-t', null, h('b', null, m.name), sub));
        if (lay === 'vertical') row.appendChild(h('span.lmc-play', { html: UI.icon('play', 16) }));
        body.appendChild(row);
      });
      go = h('button.rc-go.lmc-go', { type: 'button', 'aria-label': t('lm.edit_all'), onclick: edit, html: UI.icon('chevron', 26) });
      var cardEl = h('div.rc.lmc' + (compact ? '.lmc-c' : horiz ? '.lmc-h' : '.lmc-v'), { dataset: { more: '0' } }, body, go);
      root.appendChild(cardEl); root.dataset.lay = lay;
      // while the start screen is arranged (hold a card) a bar covers the card, like the bar of every other card: the layout, and a pencil that opens the editor; the modes do not run meanwhile
      var seg = h('span.rm-seg', { role: 'group', 'aria-label': t('lm.layout') });
      [['horizontal', 'lm.layout_h'], ['vertical', 'lm.layout_v'], ['compact', 'lm.layout_c']].forEach(function (o) {
        seg.appendChild(h('button' + (lay === o[0] ? '.on' : ''), { type: 'button', 'aria-pressed': lay === o[0] ? 'true' : 'false', onclick: function (e) { e.stopPropagation(); if (lay === o[0]) return; if (ctx.haptic) ctx.haptic(8); ctx.settings.set({ lightModesLayout: o[0] }); } }, t(o[1])));
      });
      root.appendChild(h('div.fv-sw.lmbar', null, h('b', null, t('lm.title')), seg, h('button.mv.fv-edit', { type: 'button', 'aria-label': t('lm.edit_all'), title: t('lm.edit_all'), html: UI.icon('pencil', 18), onclick: function (e) { e.stopPropagation(); edit(); } })));
      // side by side: while there is more to scroll to, the arrow washes in over the edge of the row (its left side fades out); at the end of the row it is just the arrow.
      if (ro) { ro.disconnect(); ro = null; }
      if (rowish) {
        var fade = function () { cardEl.dataset.more = body.scrollLeft + body.clientWidth < body.scrollWidth - 2 ? '1' : '0'; cardEl.dataset.fit = body.scrollWidth <= body.clientWidth + 2 ? '1' : '0'; };
        body.addEventListener('scroll', fade, { passive: true }); requestAnimationFrame(fade);
        if (g.ResizeObserver) { ro = new g.ResizeObserver(function () { if (root.isConnected) fade(); }); ro.observe(body); }
      }
      paint();
    }
    draw();
    /** True (and unsubscribed) once the strip has been on screen and is gone again: the view that held it was rebuilt. */
    function gone() {
      if (root.isConnected) { root._seen = true; return false; }
      if (!root._seen) return false;
      offs.forEach(function (f) { if (typeof f === 'function') f(); }); offs = []; if (ro) { ro.disconnect(); ro = null; }
      return true;
    }
    // follow what runs: a script or scene that fired somewhere else (a schedule, another device) moves the color too
    if (ctx.bus) {
      offs.push(ctx.bus.on('states', function (ch) { if (!gone() && ch.some(function (c) { return /^(script|scene)\./.test(c.id); })) paint(); }));
      offs.push(ctx.bus.on('lm-ran', function () { if (!gone()) paint(); }));
    }
    offs.push(ctx.settings.on('change', function (p) { if (!gone() && p && (p.lightModes !== undefined || p.lightModesLayout !== undefined || p.lightModesLook !== undefined)) draw(); }));
    return root;
  }

  // ------------------------------------------------- Settings > Light modes ----
  /** The page: your modes, an editor for each, schedules. `b` is the page body of the Settings app. */
  function settingsPage(ctx, b) {
    var t = T(ctx), view = { id: 'list' }, E = null, sched = [], schedLoaded = false, disposed = false, schedInst = null;
    var hs = function () { return ctx.hass(); };
    var hasSched = function () { var s = hs().services; return !!(s && s.scheduler && s.scheduler.add); };
    function loadSched() { if (!hasSched()) return Promise.resolve(); return ctx.callWS({ type: 'scheduler' }).then(function (r) { sched = Array.isArray(r) ? r : []; schedLoaded = true; }, function () { schedLoaded = true; }); }
    function saveModes(list) { ctx.settings.set({ lightModes: list }); }
    function entityList(domain) { var st = hs().states; return Object.keys(st).filter(function (k) { return k.indexOf(domain + '.') === 0; }).sort(function (a, c) { return nameOf(a) < nameOf(c) ? -1 : 1; }); }
    function nameOf(e) { var s = hs().states[e]; return (s && s.attributes && s.attributes.friendly_name) || e; }
    function areaChoices() { var a = areasOf(ctx) || {}; return Object.keys(a).map(function (k) { return { id: k, name: (a[k] && (a[k].name || a[k].area_name)) || k }; }).sort(function (x, y) { return x.name < y.name ? -1 : 1; }); }

    function drawList() {
      b.innerHTML = ''; var modes = modesNow(ctx), states = hs().states;
      b.appendChild(h('div.ios-text', null, t('lm.intro')));
      var card = h('div.ios-card.lme-list');
      modes.forEach(function (m, i) {
        var ok = available(m, states, areasOf(ctx));
        var sub = m.run.map(function (it) { return describeItem(it, states, t); }).join(' · ');
        if (i) card.appendChild(h('div.ios-divider'));
        card.appendChild(h('div.ios-item.lme-row' + (ok ? '' : '.missing'), { dataset: { mode: m.id } },
          h('span.lme-badge', { style: { background: 'linear-gradient(150deg,' + m.color[0] + ',' + m.color[1] + ')' }, html: UI.icon(m.icon, 20) }),
          h('div.ios-item-content', null, h('div.ios-item-label', null, m.name), h('div.ios-item-subtitle', null, ok ? sub : t('lm.missing'))),
          h('button.vs-run', { type: 'button', 'aria-label': t('lm.run') + ': ' + m.name, onclick: function (e) { e.stopPropagation(); run(ctx, m); }, html: UI.icon('play', 16) }),
          h('button.vs-edit.lme-edit', { type: 'button', onclick: function () { openEdit(m); } }, t('lm.edit'))));
      });
      if (!modes.length) card.appendChild(h('div.ios-item', null, h('div.ios-item-content', null, h('div.ios-item-subtitle', null, t('lm.sched_none')))));
      b.appendChild(card);
      b.appendChild(h('button.ts-add.lme-new', { type: 'button', onclick: function () { openEdit(null); }, html: UI.icon('plus', 18) + '<span>' + t('lm.add') + '</span>' }));
      b.appendChild(h('button.ts-add.lme-reset', { type: 'button', onclick: function () { ctx.settings.reset('lightModes'); drawList(); } }, t('lm.reset')));
    }
    function openEdit(m) {
      var list = modesNow(ctx);
      E = m ? { isNew: false, id: m.id, name: m.name, icon: m.icon, color: m.color.slice(), run: JSON.parse(JSON.stringify(m.run)), showIn: JSON.parse(JSON.stringify(m.showIn)), orig: m }
        : { isNew: true, id: newId(list), name: '', icon: 'bulb', color: COLORS[3].slice(), run: [], showIn: { favorites: true, rooms: [] }, orig: null };
      view = { id: 'edit' }; (schedLoaded ? Promise.resolve() : loadSched()).then(drawEdit); drawEdit();
    }
    function curMode() { return cleanMode({ id: E.id, name: E.name || 'x', icon: E.icon, color: E.color, run: E.run, showIn: E.showIn }); }
    function drawEdit() {
      if (disposed || view.id !== 'edit') return;
      var keepY = (b.closest && b.closest('.dt-body')) ? b.closest('.dt-body').scrollTop : 0; if (schedInst) { schedInst.dispose(); schedInst = null; } b.innerHTML = '';
      b.appendChild(h('div.ts-eh', null, h('button.ts-back', { type: 'button', onclick: function () { view = { id: 'list' }; drawList(); }, html: UI.icon('chevleft', 18) + '<span>' + t('lm.back') + '</span>' }), h('div.ts-et', null, E.isNew ? t('lm.new') : t('lm.edit_t'))));
      var body = h('div.lme-form'); b.appendChild(body);
      body.appendChild(h('div.lbl', null, t('lm.name')));
      body.appendChild(h('input.ts-name.lme-name', { type: 'text', value: E.name, placeholder: t('lm.name_ph'), maxlength: '40', 'aria-label': t('lm.name'), oninput: function () { E.name = this.value; } }));
      // picture and colour
      body.appendChild(h('div.lbl', null, t('lm.icon')));
      var ir = h('div.chiprow.lme-icons'); ICONS.forEach(function (ic) { ir.appendChild(h('button.cp.lme-ic' + (E.icon === ic ? '.on' : ''), { type: 'button', dataset: { icon: ic }, 'aria-pressed': E.icon === ic ? 'true' : 'false', onclick: function () { E.icon = ic; drawEdit(); }, html: UI.icon(ic, 20) })); });
      body.appendChild(ir);
      body.appendChild(h('div.lbl', null, t('lm.color')));
      var cr = h('div.chiprow.lme-colors'); COLORS.forEach(function (c, i) { var on = E.color[0] === c[0]; cr.appendChild(h('button.lme-sw' + (on ? '.on' : ''), { type: 'button', dataset: { color: String(i) }, 'aria-pressed': on ? 'true' : 'false', 'aria-label': t('lm.color') + ' ' + (i + 1), style: { background: 'linear-gradient(150deg,' + c[0] + ',' + c[1] + ')' }, onclick: function () { E.color = c.slice(); drawEdit(); } })); });
      body.appendChild(cr);
      // what it does
      body.appendChild(h('div.lbl', null, t('lm.does')));
      var steps = h('div.lme-steps');
      E.run.forEach(function (it, i) { steps.appendChild(h('div.lme-step', { dataset: { i: String(i) } }, h('span', null, describeItem(it, hs().states, t)), h('button.lme-x', { type: 'button', 'aria-label': t('lm.remove'), onclick: function () { E.run.splice(i, 1); drawEdit(); }, html: UI.icon('close', 16) }))); });
      if (!E.run.length) steps.appendChild(h('div.ts-hint', null, t('lm.nothing')));
      body.appendChild(steps);
      body.appendChild(addPanel());
      // where it shows
      body.appendChild(h('div.lbl', null, t('lm.show')));
      var sh = h('div.chiprow.lme-show');
      sh.appendChild(h('button.cp.lme-fav' + (E.showIn.favorites ? '.on' : ''), { type: 'button', 'aria-pressed': E.showIn.favorites ? 'true' : 'false', onclick: function () { E.showIn.favorites = !E.showIn.favorites; drawEdit(); } }, t('lm.show_fav')));
      areaChoices().forEach(function (a) {
        var on = E.showIn.rooms.some(function (r) { return norm(r) === norm(a.id); });
        sh.appendChild(h('button.cp.lme-room' + (on ? '.on' : ''), { type: 'button', dataset: { area: a.id }, 'aria-pressed': on ? 'true' : 'false', onclick: function () {
          if (on) E.showIn.rooms = E.showIn.rooms.filter(function (r) { return norm(r) !== norm(a.id); }); else E.showIn.rooms.push(a.id); drawEdit();
        } }, a.name));
      });
      body.appendChild(sh);
      // schedule
      var sbox = h('div.lme-sched'); body.appendChild(sbox); sbox.appendChild(h('div.lbl', null, t('lm.sched')));
      if (E.isNew) sbox.appendChild(h('div.ts-hint', null, core.t('ls.save_first', ctx.lang())));
      else if (g.OkieMotor.lightSched) { var sh = h('div.lme-schedbody'); sbox.appendChild(sh); schedInst = g.OkieMotor.lightSched.schedulePage(ctx, sh, { mode: E.orig.id }); }
      // buttons
      var row = h('div.vs-actions');
      row.appendChild(h('button.act.primary.lme-save', { type: 'button', onclick: save }, t('lm.save')));
      row.appendChild(h('button.act.lme-test', { type: 'button', onclick: function () { var m = curMode(); if (m) run(ctx, m); else ctx.toast('error', t('lm.nothing')); } }, t('lm.run')));
      body.appendChild(row);
      if (!E.isNew) body.appendChild(h('button.act.danger.lme-del', { type: 'button', onclick: function () { var id = E.id, gone = E.orig; saveModes(modesNow(ctx).filter(function (x) { return x.id !== id; })); if (gone && g.OkieMotor.lightSched) g.OkieMotor.lightSched.removeFor(ctx, gone); ctx.toast('success', t('lm.deleted')); view = { id: 'list' }; drawList(); } }, t('lm.delete')));
      var y = b.closest && b.closest('.dt-body'); if (y) y.scrollTop = keepY;
    }
    /** The three ways to add a step: a script or scene, some lights, all the lights of a room. */
    function addPanel() {
      var box = h('div.lme-add'), kind = ['script', 'lights', 'area'], cur = view.addKind || 'script';
      var tabs = h('div.chiprow.lme-kinds');
      [['script', 'lm.add_script'], ['lights', 'lm.add_lights'], ['area', 'lm.add_room']].forEach(function (k) { tabs.appendChild(h('button.cp' + (cur === k[0] ? '.on' : ''), { type: 'button', dataset: { kind: k[0] }, 'aria-pressed': cur === k[0] ? 'true' : 'false', onclick: function () { view.addKind = k[0]; drawEdit(); } }, t(k[1]))); });
      box.appendChild(tabs);
      var state = view.addState || 'on', bright = view.addBright == null ? 60 : view.addBright, keep = !!view.addKeep;
      var picked = view.addPicked || [];
      function stateRow() {
        var r = h('div.chiprow.lme-state');
        ['on', 'off'].forEach(function (s) { r.appendChild(h('button.cp' + (state === s ? '.on' : ''), { type: 'button', dataset: { state: s }, 'aria-pressed': state === s ? 'true' : 'false', onclick: function () { view.addState = s; drawEdit(); } }, t('lm.' + s))); });
        return r;
      }
      function brightRow() {
        if (state === 'off') return null;
        var val = h('span.lme-bv', null, keep ? t('lm.keep_bright') : bright + '%');
        var inp = h('input.lme-range', { type: 'range', min: '1', max: '100', step: '1', value: String(bright), 'aria-label': t('lm.bright'), disabled: keep });
        inp.oninput = function () { view.addBright = +inp.value; val.textContent = inp.value + '%'; };
        var chk = h('button.cp' + (keep ? '.on' : ''), { type: 'button', 'aria-pressed': keep ? 'true' : 'false', onclick: function () { view.addKeep = !keep; drawEdit(); } }, t('lm.keep_bright'));
        return h('div.lme-bright', null, h('span.lbl', null, t('lm.bright')), inp, val, chk);
      }
      function done(it) { var c = cleanItem(it); if (!c) return; E.run.push(c); view.addPicked = []; drawEdit(); }
      if (cur === 'script') {
        var sel = h('select.src-sel.lme-select', { 'aria-label': t('lm.add_script') }); sel.appendChild(h('option', { value: '' }, t('lm.pick')));
        entityList('script').concat(entityList('scene')).forEach(function (e) { sel.appendChild(h('option', { value: e }, nameOf(e) + '  (' + e.split('.')[0] + ')')); });
        box.appendChild(h('div.src-selw', null, sel, h('span.src-chev', { html: UI.icon('chevdown', 16) })));
        box.appendChild(h('button.act.lme-additem', { type: 'button', onclick: function () { if (!sel.value) return; done({ type: sel.value.split('.')[0], entity: sel.value }); } }, t('lm.add_item')));
      } else if (cur === 'lights') {
        var lr = h('div.chiprow.lme-lights');
        entityList('light').forEach(function (e) { var on = picked.indexOf(e) >= 0; lr.appendChild(h('button.cp' + (on ? '.on' : ''), { type: 'button', dataset: { light: e }, 'aria-pressed': on ? 'true' : 'false', onclick: function () { var i = picked.indexOf(e); if (i >= 0) picked.splice(i, 1); else picked.push(e); view.addPicked = picked; drawEdit(); } }, nameOf(e))); });
        box.appendChild(lr); box.appendChild(stateRow()); var br = brightRow(); if (br) box.appendChild(br);
        box.appendChild(h('button.act.lme-additem', { type: 'button', onclick: function () { done({ type: 'lights', entities: picked, state: state, brightness: view.addKeep ? null : (view.addBright == null ? bright : view.addBright) }); } }, t('lm.add_item')));
      } else {
        var ar = h('div.chiprow.lme-areas'), chosen = view.addArea || '';
        areaChoices().forEach(function (a) { ar.appendChild(h('button.cp' + (chosen === a.id ? '.on' : ''), { type: 'button', dataset: { area: a.id }, 'aria-pressed': chosen === a.id ? 'true' : 'false', onclick: function () { view.addArea = a.id; drawEdit(); } }, a.name)); });
        box.appendChild(ar); box.appendChild(stateRow()); var br2 = brightRow(); if (br2) box.appendChild(br2);
        box.appendChild(h('button.act.lme-additem', { type: 'button', onclick: function () { if (chosen) done({ type: 'area', area: chosen, state: state, brightness: view.addKeep ? null : (view.addBright == null ? bright : view.addBright) }); } }, t('lm.add_item')));
      }
      return box;
    }
    function save() {
      var name = String(E.name || '').trim(); if (!name) { ctx.toast('error', t('lm.name_empty')); return; }
      var m = cleanMode({ id: E.id, name: name, icon: E.icon, color: E.color, run: E.run, showIn: E.showIn }); if (!m) { ctx.toast('error', t('lm.nothing')); return; }
      var cur = modesNow(ctx), next = cur.some(function (x) { return x.id === m.id; }) ? cur.map(function (x) { return x.id === m.id ? m : x; }) : cur.concat([m]);
      // schedules that ran the old version run the new one
      var rewrites = [];
      if (E.orig && stable(actionsFor(E.orig)) !== stable(actionsFor(m)) && hasSched()) {
        entriesFor(sched, E.orig).forEach(function (e) { rewrites.push(ctx.call('scheduler', 'edit', { entity_id: e.sw, timeslots: (e.sc.timeslots || []).map(function (s, i) { var c = cleanSlot(s); if (i === e.slot) c.actions = actionsFor(m); return c; }) })); });
      }
      if (E.orig && g.OkieMotor.lightSched && (E.orig.name !== m.name || stable(actionsFor(E.orig)) !== stable(actionsFor(m)))) rewrites.push(g.OkieMotor.lightSched.rewrite(ctx, E.orig, m));      // its schedules (automations) run the new version
      saveModes(next); ctx.toast('success', t('lm.saved'));
      Promise.all(rewrites).then(function () { return loadSched(); }).then(function () { view = { id: 'list' }; drawList(); }, function () { view = { id: 'list' }; drawList(); });
    }
    drawList(); loadSched();
    return { dispose: function () { disposed = true; if (schedInst) { schedInst.dispose(); schedInst = null; } } };
  }

  var CSS = [
    '.lm-strip{margin:0 0 12px;}.lm-strip[hidden]{display:none;}',
    '.lm-strip{position:relative;}.w1.editing .lm-strip>.rc{pointer-events:none;}.lm-strip .lmbar{border-radius:26px;}.lm-strip[data-lay="compact"] .lmbar{border-radius:16px;padding:0 6px;}.lm-strip[data-lay="compact"] .lmbar .mv{width:26px;height:26px;}.lm-strip[data-lay="compact"] .lmbar .mv svg{width:14px;height:14px;}.lm-strip[data-lay="compact"] .lmbar .rm-seg button{padding:3px 7px;font-size:11px;}.lm-strip[data-lay="compact"] .lmbar b{display:none;}',
    '.rc.lmc{--lm-go:#8d8a86;background:linear-gradient(90deg,color-mix(in srgb,var(--lm-go) 14%,transparent),transparent 58%),var(--okie-tile,rgba(255,255,255,.1));}',
    '.lmc-body{flex:1;min-width:0;display:flex;flex-direction:column;}',
    '.lmc-head{display:flex;align-items:center;gap:12px;padding:13px 16px 11px;border:0;background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;}',
    '.lmc-cap{flex:1;min-width:0;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--okie-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.lmc-n{flex:none;font-size:12px;color:var(--okie-text-faint);}',
    '.lmc-row{position:relative;display:flex;align-items:stretch;width:100%;min-height:64px;padding:0;border:0;border-top:1px solid rgba(255,255,255,.14);background:none;color:inherit;font:inherit;text-align:left;cursor:pointer;overflow:hidden;-webkit-tap-highlight-color:transparent;transition:background .2s ease;}',
    '.lmc-row:active{background:rgba(255,255,255,.08);}.lmc-row[data-run="1"]{background:color-mix(in srgb,var(--lm-a) 24%,transparent);}',
    '.lmc-row::after{content:"";position:absolute;inset:0;background:linear-gradient(115deg,transparent 35%,rgba(255,255,255,.22) 50%,transparent 65%);transform:translateX(-120%);pointer-events:none;}.lmc-row.done::after{animation:lm-sheen .75s ease-out;}@keyframes lm-sheen{from{transform:translateX(-120%)}to{transform:translateX(120%)}}',
    '.lmc-ic{flex:none;width:64px;display:grid;place-items:center;border-right:1px solid rgba(255,255,255,.14);color:var(--lm-a);}.lmc-ic svg{width:24px;height:24px;filter:drop-shadow(0 0 9px color-mix(in srgb,var(--lm-a) 60%,transparent));}',
    '.lmc-row[data-run="1"] .lmc-ic{animation:lm-pulse 1s ease-in-out infinite;}@keyframes lm-pulse{0%,100%{opacity:1}50%{opacity:.45}}',
    '.lmc-t{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:2px;padding:10px 14px;}.lmc-t b{font-size:16px;font-weight:650;letter-spacing:-.01em;color:var(--okie-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.lmc-t span{font-size:13px;color:var(--okie-text-dim);}',
    '.lmc-play{flex:none;width:54px;display:grid;place-items:center;color:var(--okie-text-faint);}',
    '.rc.lmc .lmc-go{border-left:0;background:var(--lm-go,#8d8a86);transition:background .45s ease;}',
    '.lmc-row[data-active="1"]{background:color-mix(in srgb,var(--lm-a) 15%,transparent);}.lmc-row[data-active="1"] .lmc-sub{color:var(--lm-a);font-weight:650;}',
    '.lmc-h .lmc-body,.lmc-c .lmc-body{flex-direction:row;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;scroll-snap-type:x proximity;overscroll-behavior-x:contain;}.lmc-h .lmc-body::-webkit-scrollbar{display:none;}',
    '.lmc-h .lmc-row{flex:1 0 112px;min-width:112px;scroll-snap-align:start;min-height:124px;flex-direction:column;align-items:flex-start;justify-content:space-between;gap:10px;padding:16px 16px 14px;border-top:0;border-left:1px solid rgba(255,255,255,.14);}.lmc-h .lmc-row:first-child{border-left:0;}',
    '.rc.lmc .lmc-go{position:relative;}.rc.lmc .lmc-go::before{content:"";position:absolute;right:100%;top:0;bottom:0;width:52px;background:linear-gradient(to right,transparent,var(--lm-go,#8d8a86));opacity:0;pointer-events:none;transition:opacity .25s ease;}',
    '.lmc-h[data-more="1"] .lmc-go::before,.lmc-c[data-more="1"] .lmc-go::before{opacity:1;}',
    '.lmc-h .lmc-body::-webkit-scrollbar,.lmc-c .lmc-body::-webkit-scrollbar{display:none;}',
    '.lmc-c .lmc-row{flex:1 1 0;min-width:40px;min-height:32px;height:32px;padding:0;align-items:center;justify-content:center;border-top:0;border-left:1px solid rgba(255,255,255,.14);scroll-snap-align:start;}.lmc-c .lmc-row:first-child{border-left:0;}',
    '.lmc-c .lmc-ic{width:auto;border-right:0;display:block;}.lmc-c .lmc-ic svg{width:18px;height:18px;filter:none;}',
    '.lmc-c .lmc-row[data-active="1"]::before{content:"";position:absolute;left:34%;right:34%;bottom:2px;height:2px;border-radius:2px;background:var(--lm-a);}',
    '.rc.lmc-c{min-height:0;border-radius:16px;-webkit-clip-path:inset(0 round 16px);clip-path:inset(0 round 16px);}.rc.lmc-c .lmc-go{width:40px;}.lmc-c .lmc-go svg{width:16px;height:16px;}.lmc-c .lmc-go::before{width:30px;}.lmc-c[data-fit="1"] .lmc-go::before{opacity:1;}',
    '.stage[data-mobile="true"] .lmc-h .lmc-row{padding:14px 12px 12px;}.stage[data-mobile="true"] .lmc-h .lmc-t b{font-size:15px;}',
    '.lmc-h .lmc-ic{width:auto;border-right:0;display:block;}.lmc-h .lmc-ic svg{width:28px;height:28px;}',
    '.lmc-h .lmc-t{flex:none;width:100%;padding:0;gap:3px;}.lmc-h .lmc-t b{white-space:normal;font-size:16px;line-height:1.15;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
    '.lme-layout{align-items:center;gap:8px;margin:0 0 10px;}.lme-layout .lbl{margin-right:4px;}.lml{display:flex;flex-direction:column;gap:10px;margin:0 0 6px;}.lmc-sub:empty{display:none;}',
    // the editor in Settings
    '.lme-list .lme-row{display:flex;align-items:center;gap:12px;}.lme-list .ios-item-content{flex:1;min-width:0;}.lme-form{padding-top:6px;}.lme-badge{width:40px;height:40px;border-radius:14px;display:grid;place-items:center;color:#fff;flex:none;box-shadow:inset 0 1px 0 rgba(255,255,255,.3);}.lme-row.missing{opacity:.6;}',
    '.lme-new,.lme-reset{margin-top:12px;width:100%;}.lme-form{display:flex;flex-direction:column;gap:12px;}',
    '.lme-ic{width:44px;height:44px;padding:0;display:grid;place-items:center;border-radius:14px;}.lme-sw{width:44px;height:44px;border-radius:14px;border:2px solid transparent;flex:none;}.lme-sw.on{border-color:#fff;box-shadow:0 0 0 2px rgba(0,0,0,.25);}',
    '.lme-steps{display:flex;flex-direction:column;gap:8px;}.lme-step{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;border-radius:16px;background:rgba(255,255,255,.1);font-size:14px;}',
    '.lme-x{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,.14);display:grid;place-items:center;flex:none;}',
    '.lme-add{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:18px;background:rgba(255,255,255,.07);}.lme-select{width:100%;}',
    '.lme-bright{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}.lme-range{flex:1;min-width:120px;}.lme-bv{min-width:46px;font-variant-numeric:tabular-nums;font-weight:600;}',
    '.lme-sched{display:flex;flex-direction:column;gap:10px;}.lme-srow .vs-edit{margin-left:auto;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  /** The Look tab: how the card is laid out and what it shows. */
  function lookTab(ctx, b) {
    var t = T(ctx), lt = function (k) { return core.t(k, ctx.lang()); };
    function sw(on, label, fn) {
      var x = h('button.sw' + (on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label });
      x.onclick = function () { on = !on; x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); fn(on); };
      return x;
    }
    function opt(key, label, desc, flag) {
      return h('div.lss-opt.lml-opt', { dataset: { look: key } }, h('div.lss-optt', null, h('b', null, lt(label)), h('span', null, lt(desc))), sw(lookOf(ctx)[flag], lt(label), function (v) { var o = {}; o[flag] = v; ctx.settings.set({ lightModesLook: o }); }));
    }
    b.innerHTML = '';
    var cur = layoutOf(ctx), lay = h('div.chiprow.lme-layout');
    [['horizontal', 'lm.layout_h'], ['vertical', 'lm.layout_v'], ['compact', 'lm.layout_c']].forEach(function (o) {
      lay.appendChild(h('button.cp' + (cur === o[0] ? '.on' : ''), { type: 'button', dataset: { layout: o[0] }, 'aria-pressed': cur === o[0] ? 'true' : 'false', onclick: function () { ctx.settings.set({ lightModesLayout: o[0] }); lookTab(ctx, b); } }, t(o[1])));
    });
    b.appendChild(h('div.lbl', null, lt('ls.set_layout'))); b.appendChild(lay);
    b.appendChild(h('div.lbl', null, lt('ls.set_look')));
    var box = h('div.lml');
    box.appendChild(opt('active', 'ls.set_active', 'ls.set_active_d', 'active'));
    box.appendChild(opt('chevron', 'ls.set_chevron', 'ls.set_chevron_d', 'chevron'));
    box.appendChild(opt('hint', 'ls.set_hint', 'ls.set_hint_d', 'hint'));
    b.appendChild(box);
    b.appendChild(h('div.lbl', null, lt('ls.set_where')));
    b.appendChild(h('div.ts-hint', null, lt('ls.set_where_d')));
    b.appendChild(h('button.ts-add.lme-reset', { type: 'button', onclick: function () { ctx.settings.reset('lightModes'); ctx.toast('success', t('lm.saved')); } }, t('lm.reset')));
    return { dispose: function () {} };
  }

  /** The Light modes view (opened by the chevron of the card): the same bar of tabs as a device: Modes, Used by, History, Schedule, Look. */
  function renderApp(container, ctx) {
    var t = T(ctx), inst = null, LS = function () { return g.OkieMotor.lightSched; };
    var tabs = [['modes', 'sliders', 'ls.tab_modes'], ['context', 'spark', 'ls.tab_context'], ['history', 'chart', 'ls.tab_history'], ['schedule', 'clock', 'ls.tab_schedule'], ['settings', 'gear', 'ls.tab_settings']]
      .map(function (x) { return { id: x[0], icon: x[1], label: core.t(x[2], ctx.lang()) }; });
    var start = ctx.store.get('lm.tab', 'modes');
    var shell = g.OkieMotor.appshell.create(container, ctx, { id: 'lightmodes', title: t('lm.title'), subtitle: t('lm.app_sub'), icon: 'bulb', gradient: ['#5a360e', '#d6892b'], tabs: tabs, startTab: tabs.some(function (x) { return x.id === start; }) ? start : 'modes',
      onTab: function (id, body) {
        if (inst && inst.dispose) inst.dispose(); inst = null;
        if (id) ctx.store.set('lm.tab', id);
        if (id === 'modes') inst = settingsPage(ctx, body);
        else if (id === 'settings') inst = lookTab(ctx, body);
        else if (LS() && id === 'schedule') inst = LS().schedulePage(ctx, body, {});
        else if (LS() && id === 'history') inst = LS().historyPage(ctx, body);
        else if (LS() && id === 'context') inst = LS().contextPage(ctx, body);
      } });
    return { update: function () {}, dispose: function () { if (inst && inst.dispose) inst.dispose(); shell.dispose(); } };
  }
  if (g.OkieMotor.apps) g.OkieMotor.apps.register({ id: 'lightmodes', nameKey: 'lm.title', name: 'Light modes', icon: 'bulb', color: '#f5a30b', order: 60, category: 'lights', render: renderApp });

  g.OkieMotor.lightModes = Object.assign({ strip: strip, settingsPage: settingsPage, run: run, modesNow: modesNow, CSS: CSS }, pureApi);
})(typeof globalThis !== 'undefined' ? globalThis : window);

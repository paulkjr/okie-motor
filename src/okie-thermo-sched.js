/* okie-thermo-sched: the weekly schedule of a thermostat (the Schedule tab of a climate device).
 *
 * Like the schedules of the Google Home app: a tab per weekday, the entries of that day with a name (Comfort, Sleep, Eco, Away ...),
 * their degrees and the time, and an Add button. An entry does not only switch the thermostat on and off: it sets a mode and degrees
 * (cool to 72, heat to 66, a heat/cool range 66-72, off, or one of the thermostat's presets such as Nest's Eco).
 *
 * The schedules themselves are kept by the Scheduler component (HACS: nielsfaber/scheduler-component): an entry is one time slot of
 * one schedule whose actions are climate.* service calls. The list comes from its websocket command `scheduler` (the switch entities only
 * show the first action of a slot), changes go through the services scheduler.add / edit / remove.
 *
 * "Comfort", "Sleep", "Eco" and "Away" are profiles: the degrees a new entry of that name starts with. Change what Eco means once and
 * one tap updates every schedule that is called Eco.
 *
 * The pure part (reading and building the actions, the days, the profiles) is unit-tested; the DOM part is checked in the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // @pure:start (tools/make-widget.py cuts this part into the iPhone widget: keep it free of DOM and of anything outside this block)
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var WEEKDAYS = ['mon', 'tue', 'wed', 'thu', 'fri'], WEEKEND = ['sat', 'sun'];

  /** The weekdays of a schedule as plain day names, in week order ('daily', 'workday' and 'weekend' are the Scheduler's shorthands). */
  function expandDays(w) {
    var out = [];
    (w && w.length ? w : ['daily']).forEach(function (d) {
      var s = String(d).toLowerCase();
      if (s === 'daily') out = out.concat(DAYS);
      else if (s === 'workday') out = out.concat(WEEKDAYS);
      else if (s === 'weekend') out = out.concat(WEEKEND);
      else if (DAYS.indexOf(s.slice(0, 3)) >= 0) out.push(s.slice(0, 3));
    });
    return DAYS.filter(function (d) { return out.indexOf(d) >= 0; });
  }
  /** "07:30:00" -> "07:30"; null for a start that is not a clock time (the Scheduler also has sunrise and sunset). */
  function clockOf(start) { var m = /^(\d{1,2}):(\d{2})/.exec(String(start == null ? '' : start)); return m ? ('0' + m[1]).slice(-2) + ':' + m[2] : null; }
  function toNum(v) { var n = parseFloat(v); return isFinite(n) ? n : null; }

  /**
   * What one time slot does to this thermostat, read from its actions.
   * -> { mode: 'cool' | 'heat' | 'heat_cool' | 'off' | 'preset' | 'keep', temp, low, high, preset } or null when the slot does not touch it
   */
  function readSlot(slot, climateId) {
    var mode = null, temp = null, low = null, high = null, preset = null, touched = false;
    ((slot && slot.actions) || []).forEach(function (a) {
      var ids = [].concat(a.entity_id || []); if (ids.indexOf(climateId) < 0) return;
      var d = a.service_data || {}, sv = String(a.service || '');
      if (sv === 'climate.set_hvac_mode') { touched = true; if (d.hvac_mode) mode = d.hvac_mode; }
      else if (sv === 'climate.set_temperature') {
        touched = true; if (d.hvac_mode) mode = d.hvac_mode;
        if (d.target_temp_low != null || d.target_temp_high != null) { low = toNum(d.target_temp_low); high = toNum(d.target_temp_high); }
        if (d.temperature != null) temp = toNum(d.temperature);
      } else if (sv === 'climate.set_preset_mode') { touched = true; if (d.preset_mode && d.preset_mode !== 'none') preset = d.preset_mode; }
      else if (sv === 'climate.turn_off') { touched = true; mode = 'off'; }
      else if (sv === 'climate.turn_on') { touched = true; }
    });
    if (!touched) return null;
    if (mode === 'off') return { mode: 'off' };
    if (preset && !mode && temp == null && low == null && high == null) return { mode: 'preset', preset: preset };
    if (mode === 'heat_cool' || low != null || high != null) return { mode: 'heat_cool', low: low, high: high };
    if (mode === 'heat' || mode === 'cool') return { mode: mode, temp: temp };
    return { mode: 'keep', temp: temp };
  }

  /**
   * The service calls of an entry. A mode change comes first, then the degrees. `exitPreset` (usually 'none') is sent first when the thermostat has presets,
   * so a schedule that follows an Eco one gets the thermostat out of Eco again.
   */
  function buildActions(e, climateId, exitPreset) {
    var A = function (service, data) { return { service: service, entity_id: climateId, service_data: data }; }, out = [];
    if (e.mode !== 'preset' && exitPreset) out.push(A('climate.set_preset_mode', { preset_mode: exitPreset }));
    switch (e.mode) {
      case 'off': out.push(A('climate.set_hvac_mode', { hvac_mode: 'off' })); break;
      case 'preset': out.push(A('climate.set_preset_mode', { preset_mode: e.preset || 'eco' })); break;
      case 'heat_cool': out.push(A('climate.set_hvac_mode', { hvac_mode: 'heat_cool' }), A('climate.set_temperature', { target_temp_low: e.low, target_temp_high: e.high })); break;
      case 'heat': case 'cool': out.push(A('climate.set_hvac_mode', { hvac_mode: e.mode }), A('climate.set_temperature', { temperature: e.temp })); break;
      default: out.push(A('climate.set_temperature', { temperature: e.temp }));
    }
    return out;
  }

  /** The entries (one per time slot) that act on this thermostat, from the Scheduler's list. */
  function entriesFor(schedules, climateId) {
    var out = [];
    (schedules || []).forEach(function (sc) {
      (sc.timeslots || []).forEach(function (slot, idx) {
        var e = readSlot(slot, climateId); if (!e) return;
        out.push(Object.assign(e, { sid: sc.schedule_id, sw: sc.entity_id || ('switch.schedule_' + sc.schedule_id), slot: idx, slots: sc.timeslots.length,
          name: sc.name || '', days: expandDays(sc.weekdays), enabled: sc.enabled !== false, start: slot.start, time: clockOf(slot.start), sc: sc }));
      });
    });
    return out;
  }
  /** The entries of one weekday, earliest first. */
  function onDay(entries, day) {
    return (entries || []).filter(function (e) { return e.days.indexOf(day) >= 0; }).sort(function (a, b) { return String(a.time || '99:99') < String(b.time || '99:99') ? -1 : String(a.time || '99:99') > String(b.time || '99:99') ? 1 : 0; });
  }

  var PROFILE_IDS = ['comfort', 'sleep', 'eco', 'away'];
  /** The degrees a profile starts with: heat to `low`, cool to `high` (Fahrenheit or Celsius). The user's own values win. */
  function profileDefaults(unit, own) {
    var f = unit !== '°C', base = f
      ? { comfort: { low: 68, high: 74 }, sleep: { low: 66, high: 72 }, eco: { low: 62, high: 80 }, away: { low: 60, high: 82 } }
      : { comfort: { low: 20, high: 23 }, sleep: { low: 19, high: 22 }, eco: { low: 17, high: 27 }, away: { low: 15, high: 28 } };
    PROFILE_IDS.forEach(function (id) { var o = own && own[id]; if (o) { if (toNum(o.low) != null) base[id].low = toNum(o.low); if (toNum(o.high) != null) base[id].high = toNum(o.high); } });
    return base;
  }
  /** Which profile a name belongs to ('Eco', 'eco', a translated name), or ''. */
  function matchProfile(name, labels) {
    var n = String(name || '').trim().toLowerCase(); if (!n) return '';
    for (var i = 0; i < PROFILE_IDS.length; i++) { var id = PROFILE_IDS[i]; if (n === id || (labels && labels[id] && n === String(labels[id]).toLowerCase())) return id; }
    return '';
  }
  /** Which icon an entry gets, from its name. */
  function iconFor(name, labels) {
    var p = matchProfile(name, labels), n = String(name || '').toLowerCase();
    if (p) return p;
    if (/sleep|night|bed|schlaf|nacht/.test(n)) return 'sleep';
    if (/eco|save|spar/.test(n)) return 'eco';
    if (/away|out|trip|vacation|weg|urlaub/.test(n)) return 'away';
    if (/comfort|home|day|morning|komfort|zuhause|morgen|tag/.test(n)) return 'comfort';
    return 'clock';
  }
  /** A slot without the empty fields the Scheduler hands out (it refuses null for stop and the like), for writing it back. */
  function cleanSlot(slot) {
    var o = {}; Object.keys(slot || {}).forEach(function (k) { var v = slot[k]; if (v == null || (Array.isArray(v) && !v.length && k !== 'actions')) return; o[k] = v; });
    return o;
  }
  // @pure:end

  var pureApi = { DAYS: DAYS, WEEKDAYS: WEEKDAYS, WEEKEND: WEEKEND, expandDays: expandDays, clockOf: clockOf, readSlot: readSlot, buildActions: buildActions, entriesFor: entriesFor, onDay: onDay,
    PROFILE_IDS: PROFILE_IDS, profileDefaults: profileDefaults, matchProfile: matchProfile, iconFor: iconFor, cleanSlot: cleanSlot };
  if (isNode) { module.exports = pureApi; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ DOM ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, CT = g.OkieMotor.controls, h = UI.h;

  core.registerStrings('en', {
    'ts.empty_day': 'Nothing is scheduled for this day.', 'ts.add': 'Add', 'ts.new': 'New schedule', 'ts.edit': 'Edit schedule', 'ts.name': 'Name', 'ts.name_ph': 'Name, for example Comfort',
    'ts.time': 'Time', 'ts.days': 'Days', 'ts.every': 'Every day', 'ts.weekdays': 'Mon - Fri', 'ts.weekend': 'Weekend', 'ts.mode': 'What it does',
    'ts.m.cool': 'Cool to', 'ts.m.heat': 'Heat to', 'ts.m.heat_cool': 'Heat · Cool', 'ts.m.preset': 'Preset', 'ts.m.off': 'Off', 'ts.m.keep': 'Set to',
    'ts.heat': 'Heat to', 'ts.cool': 'Cool to', 'ts.temp': 'Temperature', 'ts.save': 'Save schedule', 'ts.delete': 'Delete', 'ts.back': 'Back',
    'ts.preset_hint': 'In a preset the thermostat chooses the degrees itself.', 'ts.preset_pick': 'Preset', 'ts.saved': 'Schedule saved', 'ts.failed': 'The schedule could not be saved',
    'ts.p.comfort': 'Comfort', 'ts.p.sleep': 'Sleep', 'ts.p.eco': 'Eco', 'ts.p.away': 'Away',
    'ts.profiles': 'Comfort, Sleep, Eco & Away', 'ts.profiles_hint': 'The degrees a new entry of that name starts with. Change what Eco means once, then update every schedule called Eco in one tap.',
    'ts.update_n': 'Update {n}', 'ts.updated': 'Schedules updated', 'ts.read_fail': 'The schedules could not be read.', 'ts.loading': 'Loading…', 'ts.heat_short': 'Heat', 'ts.cool_short': 'Cool',
    'ts.off_chip': 'Off', 'ts.sun': 'at sunrise or sunset', 'ts.name_empty': 'Give it a name', 'ts.day_empty': 'Pick at least one day',
  });
  core.registerStrings('de', {
    'ts.empty_day': 'Für diesen Tag ist nichts geplant.', 'ts.add': 'Hinzufügen', 'ts.new': 'Neuer Zeitplan', 'ts.edit': 'Zeitplan bearbeiten', 'ts.name': 'Name', 'ts.name_ph': 'Name, zum Beispiel Komfort',
    'ts.time': 'Zeit', 'ts.days': 'Tage', 'ts.every': 'Jeden Tag', 'ts.weekdays': 'Mo - Fr', 'ts.weekend': 'Wochenende', 'ts.mode': 'Was passiert',
    'ts.m.cool': 'Kühlen auf', 'ts.m.heat': 'Heizen auf', 'ts.m.heat_cool': 'Heizen · Kühlen', 'ts.m.preset': 'Voreinstellung', 'ts.m.off': 'Aus', 'ts.m.keep': 'Einstellen auf',
    'ts.heat': 'Heizen auf', 'ts.cool': 'Kühlen auf', 'ts.temp': 'Temperatur', 'ts.save': 'Zeitplan speichern', 'ts.delete': 'Löschen', 'ts.back': 'Zurück',
    'ts.preset_hint': 'In einer Voreinstellung wählt das Thermostat die Grad selbst.', 'ts.preset_pick': 'Voreinstellung', 'ts.saved': 'Zeitplan gespeichert', 'ts.failed': 'Der Zeitplan konnte nicht gespeichert werden',
    'ts.p.comfort': 'Komfort', 'ts.p.sleep': 'Schlafen', 'ts.p.eco': 'Eco', 'ts.p.away': 'Abwesend',
    'ts.profiles': 'Komfort, Schlafen, Eco & Abwesend', 'ts.profiles_hint': 'Die Grad, mit denen ein neuer Eintrag dieses Namens startet. Ändere einmal, was Eco bedeutet, und aktualisiere mit einem Tipp alle Zeitpläne namens Eco.',
    'ts.update_n': '{n} aktualisieren', 'ts.updated': 'Zeitpläne aktualisiert', 'ts.read_fail': 'Die Zeitpläne konnten nicht gelesen werden.', 'ts.loading': 'Lädt…', 'ts.heat_short': 'Heizen', 'ts.cool_short': 'Kühlen',
    'ts.off_chip': 'Aus', 'ts.sun': 'bei Sonnenauf- oder -untergang', 'ts.name_empty': 'Gib einen Namen ein', 'ts.day_empty': 'Wähle mindestens einen Tag',
  });

  function T(ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; }
  var LEAF = '<path d="M5 19c0-8 5-13 14-14 0 9-4 14-12 14M5 19c3-4 6-7 10-9"/>';
  var DOOR = '<path d="M6 20V5h9v15M6 20h12M12 12v.5"/>';
  function icon(kind, size) {
    if (kind === 'eco') return '<svg class="oi" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + LEAF + '</svg>';
    if (kind === 'away') return '<svg class="oi" width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + DOOR + '</svg>';
    return UI.icon(kind === 'sleep' ? 'moon' : kind === 'comfort' ? 'heart' : 'clock', size);
  }
  function todayKey() { return DAYS[(new Date().getDay() + 6) % 7]; }

  /** A - value + control: the degrees of one setpoint. */
  function stepper(o) {
    var v = o.value, val = h('div.ts-stv', { 'aria-live': 'polite' }), lbl = o.label ? h('div.ts-stl', null, o.label) : null;
    function fmt(x) { return o.step < 1 ? (Math.round(x * 10) / 10).toFixed(1) : String(Math.round(x)); }
    function set(x, quiet) { v = Math.min(o.max, Math.max(o.min, Math.round(x / o.step) * o.step)); val.textContent = fmt(v) + (o.unit || ''); if (!quiet && o.onChange) o.onChange(v); }
    function bump(d) { o.haptic && o.haptic(6); set(v + d * o.step); }
    var minus = h('button.ts-stb', { type: 'button', 'aria-label': o.minusLabel || '-', onclick: function () { bump(-1); }, html: '&minus;' });
    var plus = h('button.ts-stb', { type: 'button', 'aria-label': o.plusLabel || '+', onclick: function () { bump(1); }, html: '+' });
    var el = h('div.ts-st' + (o.cls ? '.' + o.cls : ''), null, lbl, minus, val, plus);
    set(v, true);
    return { el: el, get value() { return v; }, set: function (x) { set(x, true); } };
  }

  function render(ctx, item, root) {
    var t = T(ctx), hs = ctx.hass();
    var has = !!(hs.services && hs.services.scheduler && hs.services.scheduler.add);
    var wrap = h('div.ts'); root.appendChild(wrap);
    if (!has) { wrap.appendChild(h('div.note-l.warn', null, t('dt.sched_missing'))); return { update: function () {}, dispose: function () {} }; }

    var S = { sched: [], loaded: false, failed: false, day: todayKey(), view: 'list', E: null, disposed: false, sig: '', openProf: false }, reloadT = 0;
    function A() { return (ctx.state(item.id) || {}).attributes || {}; }
    function unit() { var a = A(), u = hs.config && hs.config.unit_system && hs.config.unit_system.temperature; return u === '°F' || u === '°C' ? u : (toNum(a.max_temp) > 45 ? '°F' : '°C'); }
    function limits() {
      var a = A(), f = unit() === '°F', min = toNum(a.min_temp), max = toNum(a.max_temp), step = toNum(a.target_temp_step) || toNum(a.target_temperature_step) || (f ? 1 : 0.5);
      return { min: min != null ? min : (f ? 50 : 10), max: max != null ? max : (f ? 90 : 32), step: step, gap: Math.max(step * 2, f ? 2 : 1) };
    }
    function modes() {
      var a = A(), hm = a.hvac_modes || ['off', 'heat', 'cool', 'heat_cool'], out = [];
      if (hm.indexOf('cool') >= 0) out.push('cool');
      if (hm.indexOf('heat') >= 0) out.push('heat');
      if (hm.indexOf('heat_cool') >= 0) out.push('heat_cool');
      if (presets().length) out.push('preset');
      if (hm.indexOf('off') >= 0) out.push('off');
      return out;
    }
    function presets() { return (A().preset_modes || []).filter(function (p) { return p !== 'none'; }); }
    function exitPreset() { return (A().preset_modes || []).indexOf('none') >= 0 ? 'none' : null; }
    function labels() { return { comfort: t('ts.p.comfort'), sleep: t('ts.p.sleep'), eco: t('ts.p.eco'), away: t('ts.p.away') }; }
    function profiles() { return profileDefaults(unit(), (ctx.settings.get().thermoSched || {}).profiles); }
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
    function entries() { return entriesFor(S.sched, item.id); }
    function reloadSoon(ms) { clearTimeout(reloadT); reloadT = setTimeout(load, ms || 450); }

    function chipsOf(e) {
      var u = unit().replace('°', '°'), c = function (cls, txt) { return h('span.ts-chip.' + cls, null, txt); };
      if (e.mode === 'heat_cool') return [c('heat', fmtN(e.low) + '°'), c('cool', fmtN(e.high) + '°')];
      if (e.mode === 'heat') return [c('heat', fmtN(e.temp) + '°')];
      if (e.mode === 'cool') return [c('cool', fmtN(e.temp) + '°')];
      if (e.mode === 'off') return [c('neutral', t('ts.off_chip'))];
      if (e.mode === 'preset') return [c('neutral', String(e.preset))];
      return [c('neutral', e.temp != null ? fmtN(e.temp) + '°' : '–')];
    }
    function fmtN(x) { return x == null ? '–' : (Math.round(x * 10) / 10 % 1 ? (Math.round(x * 10) / 10).toFixed(1) : String(Math.round(x))); }

    // ---------------------------------------------------------- the list ----
    function drawList() {
      wrap.innerHTML = '';
      var all = entries(), today = todayKey();
      var tabs = h('div.ts-days', { role: 'tablist' });
      DAYS.forEach(function (d) {
        var n = onDay(all, d).length;
        tabs.appendChild(h('button.ts-day' + (S.day === d ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': S.day === d ? 'true' : 'false', dataset: { day: d }, onclick: function () { S.day = d; drawList(); } },
          dayName(d), n ? h('i', { 'aria-hidden': 'true' }) : null));
      });
      wrap.appendChild(tabs);
      if (!S.loaded) wrap.appendChild(h('div.note-l', null, t('ts.loading')));
      else if (S.failed) wrap.appendChild(h('div.note-l.warn', null, t('ts.read_fail')));
      var list = h('div.ts-list'), todays = onDay(all, S.day);
      if (S.loaded && !S.failed && !todays.length) list.appendChild(h('div.note-l.ts-empty', null, t('ts.empty_day')));
      todays.forEach(function (e) { list.appendChild(row(e)); });
      wrap.appendChild(list);
      wrap.appendChild(h('button.ts-add', { type: 'button', onclick: function () { newEntry(); }, html: UI.icon('plus', 18) + '<span>' + t('ts.add') + '</span>' }));
      wrap.appendChild(profilesPanel(all));
    }
    function row(e) {
      var editable = !!e.time, lab = labels();
      var sw = h('button.sw' + (e.enabled ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': e.enabled ? 'true' : 'false', 'aria-label': e.name || e.sw,
        onclick: function (ev) { ev.stopPropagation(); ctx.haptic && ctx.haptic(8); ctx.call('switch', 'toggle', { entity_id: e.sw }).then(function () { reloadSoon(350); }, function () { ctx.toast('error', t('ts.failed')); }); } }, h('i'));
      var r = h('div.ts-row' + (e.enabled ? '' : '.off'), { role: 'button', tabindex: '0', dataset: { sid: e.sid },
        onclick: function () { if (editable) editEntry(e); }, onkeydown: function (k) { if ((k.key === 'Enter' || k.key === ' ') && editable) { k.preventDefault(); editEntry(e); } } },
        h('span.ts-ic', { html: icon(iconFor(e.name, lab), 20) }),
        h('div.ts-main', null, h('div.ts-nm', null, e.name || t('ts.m.' + (e.mode === 'heat_cool' ? 'heat_cool' : e.mode))), h('div.ts-chips', null, chipsOf(e))),
        h('div.ts-time', null, e.time ? clock(e.time) : t('ts.sun')),
        sw);
      return r;
    }

    // ---------------------------------------------------------- profiles ----
    function profilesPanel(all) {
      var lab = labels(), prof = profiles(), L = limits(), box = h('div.ts-prof' + (S.openProf ? '.open' : ''));
      box.appendChild(h('button.ts-prof-h', { type: 'button', 'aria-expanded': S.openProf ? 'true' : 'false', onclick: function () { S.openProf = !S.openProf; drawList(); } },
        h('span', null, t('ts.profiles')), h('span.ts-chev', { html: UI.icon('chevdown', 18) })));
      if (!S.openProf) return box;
      box.appendChild(h('div.ts-prof-hint', null, t('ts.profiles_hint')));
      PROFILE_IDS.forEach(function (id) {
        var p = prof[id], stale = all.filter(function (e) { return e.mode === 'heat_cool' && matchProfile(e.name, lab) === id && (e.low !== p.low || e.high !== p.high); });
        var lo = stepper({ value: p.low, min: L.min, max: L.max - L.gap, step: L.step, unit: '°', cls: 'sm.heat', label: t('ts.heat_short'), haptic: ctx.haptic, onChange: function (v) { if (hi.value < v + L.gap) hi.set(Math.min(L.max, v + L.gap)); save(); } });
        var hi = stepper({ value: p.high, min: L.min + L.gap, max: L.max, step: L.step, unit: '°', cls: 'sm.cool', label: t('ts.cool_short'), haptic: ctx.haptic, onChange: function (v) { if (lo.value > v - L.gap) lo.set(Math.max(L.min, v - L.gap)); save(); } });
        var saveT = 0;
        function save() { clearTimeout(saveT); saveT = setTimeout(function () { var cur = ((ctx.settings.get().thermoSched || {}).profiles) || {}, next = Object.assign({}, cur); next[id] = { low: lo.value, high: hi.value }; ctx.settings.set({ thermoSched: { profiles: next } }); drawListKeep(); }, 500); }
        var upd = stale.length ? h('button.ts-upd', { type: 'button', onclick: function () { updateProfile(id, lo.value, hi.value, stale); } }, t('ts.update_n', { n: stale.length })) : null;
        box.appendChild(h('div.ts-prow', { dataset: { profile: id } }, h('span.ts-ic', { html: icon(id, 18) }), h('div.ts-pn', null, lab[id]), lo.el, hi.el, upd));
      });
      return box;
    }
    function drawListKeep() { if (S.view === 'list' && !S.disposed) { var y = (root.closest && root.closest('.dt-body')) || null, top = y ? y.scrollTop : 0; drawList(); if (y) y.scrollTop = top; } }
    function updateProfile(id, low, high, list) {
      var jobs = list.map(function (e) { return writeSlot(e, buildActions({ mode: 'heat_cool', low: low, high: high }, item.id, exitPreset())); });
      Promise.all(jobs).then(function () { ctx.toast('success', t('ts.updated')); reloadSoon(500); }, function () { ctx.toast('error', t('ts.failed')); });
    }
    /** Replace the actions of one slot of a schedule, keeping its other slots. */
    function writeSlot(e, actions) {
      var slots = (e.sc.timeslots || []).map(function (s, i) { var c = cleanSlot(s); if (i === e.slot) c.actions = actions; return c; });
      return ctx.call('scheduler', 'edit', { entity_id: e.sw, timeslots: slots });
    }

    // ----------------------------------------------------------- the editor ----
    function now5() { var d = new Date(), m = Math.ceil(d.getMinutes() / 5) * 5, hh = d.getHours() + (m >= 60 ? 1 : 0); return ('0' + (hh % 24)).slice(-2) + ':' + ('0' + (m % 60)).slice(-2); }
    function seedFrom(name) {
      var id = matchProfile(name, labels()), p = profiles()[id || 'comfort'], ms = modes(), mode = ms.indexOf('heat_cool') >= 0 ? 'heat_cool' : (ms.indexOf('cool') >= 0 ? 'cool' : ms[0] || 'cool');
      var L = limits(), mid = Math.round((p.low + p.high) / 2 / L.step) * L.step;
      return { mode: mode, low: p.low, high: p.high, temp: mode === 'heat' ? p.low : mode === 'cool' ? p.high : mid, preset: presets().indexOf('eco') >= 0 ? 'eco' : presets()[0] || null };
    }
    function newEntry() {
      var seed = seedFrom('comfort');
      S.E = { isNew: true, name: t('ts.p.comfort'), time: now5(), days: [S.day], mode: seed.mode, low: seed.low, high: seed.high, temp: seed.temp, preset: seed.preset, touched: false };
      S.view = 'edit'; drawEdit();
    }
    function editEntry(e) {
      var L = limits(), seed = seedFrom(e.name);
      S.E = { isNew: false, e: e, name: e.name, time: e.time, days: e.days.slice(), mode: e.mode, low: e.low != null ? e.low : seed.low, high: e.high != null ? e.high : seed.high, temp: e.temp != null ? e.temp : seed.temp,
        preset: e.preset || seed.preset, touched: true };
      S.view = 'edit'; drawEdit();
    }
    function back() { S.view = 'list'; S.E = null; draw(); }
    function drawEdit() {
      var E = S.E, L = limits(), lab = labels(), prof = profiles(); wrap.innerHTML = '';
      wrap.appendChild(h('div.ts-eh', null, h('button.ts-back', { type: 'button', onclick: back, html: UI.icon('chevleft', 18) + '<span>' + t('ts.back') + '</span>' }), h('div.ts-et', null, E.isNew ? t('ts.new') : t('ts.edit'))));

      // name: the four profiles as chips, or anything you type
      var nameIn = h('input.ts-name', { type: 'text', value: E.name, placeholder: t('ts.name_ph'), maxlength: '40', 'aria-label': t('ts.name'), oninput: function () { E.name = this.value; markChips(); } });
      var chipRow = h('div.chiprow');
      PROFILE_IDS.forEach(function (id) { chipRow.appendChild(h('button.cp', { type: 'button', dataset: { profile: id }, onclick: function () { pickProfile(id); } }, lab[id])); });
      function markChips() { Array.prototype.forEach.call(chipRow.children, function (b) { var on = matchProfile(E.name, lab) === b.dataset.profile; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); }
      function pickProfile(id) {
        E.name = lab[id]; nameIn.value = E.name;
        if (!E.touched || E.isNew) { var s = seedFrom(id); E.low = s.low; E.high = s.high; if (E.mode === 'heat_cool') { /* keep the mode */ } else if (E.mode === 'heat') E.temp = s.low; else if (E.mode === 'cool') E.temp = s.high; drawTemps(); }
        markChips(); ctx.haptic && ctx.haptic(6);
      }
      wrap.appendChild(h('div.lbl', null, t('ts.name'))); wrap.appendChild(chipRow); wrap.appendChild(nameIn); markChips();

      // time
      var hours = [], mins = []; for (var i = 0; i < 24; i++) hours.push(('0' + i).slice(-2)); for (var j = 0; j < 60; j += 5) mins.push(('0' + j).slice(-2));
      var tm = /^(\d\d):(\d\d)/.exec(E.time || '07:00'), mm = ('0' + (Math.round(+tm[2] / 5) * 5 % 60)).slice(-2);
      var wh = g.OkieMotor.detail.createWheel({ values: hours, value: tm[1], label: 'Hour', onChange: function (v) { E.time = v + ':' + (wm ? wm.value : mm); } });
      var wm = g.OkieMotor.detail.createWheel({ values: mins, value: mm, label: 'Minute', onChange: function (v) { E.time = wh.value + ':' + v; } });
      wrap.appendChild(h('div.lbl', null, t('ts.time'))); wrap.appendChild(h('div.wheels.ts-wheels', null, wh.el, h('div.colon', null, ':'), wm.el));

      // days
      var dayRow = h('div.chiprow.ts-dayrow');
      function drawDays() { dayRow.innerHTML = ''; DAYS.forEach(function (d) { var on = E.days.indexOf(d) >= 0; dayRow.appendChild(h('button.cp' + (on ? '.on' : ''), { type: 'button', 'aria-pressed': on ? 'true' : 'false', dataset: { day: d }, onclick: function () { var i2 = E.days.indexOf(d); if (i2 >= 0) E.days.splice(i2, 1); else E.days.push(d); drawDays(); } }, dayName(d))); }); }
      drawDays();
      var quick = h('div.chiprow.ts-quick');
      [['ts.every', DAYS], ['ts.weekdays', WEEKDAYS], ['ts.weekend', WEEKEND]].forEach(function (q) { quick.appendChild(h('button.cp.ghost', { type: 'button', onclick: function () { E.days = q[1].slice(); drawDays(); } }, t(q[0]))); });
      wrap.appendChild(h('div.lbl', null, t('ts.days'))); wrap.appendChild(dayRow); wrap.appendChild(quick);

      // what it does
      var ms = modes(); if (E.mode && ms.indexOf(E.mode) < 0 && E.mode !== 'keep') ms.push(E.mode);
      var seg = CT.createSegment({ options: ms.map(function (m) { return { id: m, label: t('ts.m.' + m) }; }).concat(E.mode === 'keep' ? [{ id: 'keep', label: t('ts.m.keep') }] : []), value: E.mode, ariaLabel: t('ts.mode'), onChange: function (v) { E.mode = v; E.touched = true; drawTemps(); } });
      var temps = h('div.ts-temps');
      function drawTemps() {
        temps.innerHTML = '';
        var stOpt = function (extra) { return Object.assign({ min: L.min, max: L.max, step: L.step, unit: '°', haptic: ctx.haptic }, extra); };
        if (E.mode === 'heat_cool') {
          var lo = stepper(stOpt({ value: E.low, max: L.max - L.gap, cls: 'heat', label: t('ts.heat'), onChange: function (v) { E.low = v; E.touched = true; if (E.high < v + L.gap) { E.high = Math.min(L.max, v + L.gap); hi.set(E.high); } } }));
          var hi = stepper(stOpt({ value: E.high, min: L.min + L.gap, cls: 'cool', label: t('ts.cool'), onChange: function (v) { E.high = v; E.touched = true; if (E.low > v - L.gap) { E.low = Math.max(L.min, v - L.gap); lo.set(E.low); } } }));
          temps.appendChild(lo.el); temps.appendChild(hi.el);
        } else if (E.mode === 'heat' || E.mode === 'cool' || E.mode === 'keep') {
          temps.appendChild(stepper(stOpt({ value: E.temp, cls: E.mode === 'heat' ? 'heat' : E.mode === 'cool' ? 'cool' : '', label: t('ts.temp'), onChange: function (v) { E.temp = v; E.touched = true; } })).el);
        } else if (E.mode === 'preset') {
          var row2 = h('div.chiprow');
          presets().forEach(function (p) { row2.appendChild(h('button.cp' + (E.preset === p ? '.on' : ''), { type: 'button', 'aria-pressed': E.preset === p ? 'true' : 'false', onclick: function () { E.preset = p; drawTemps(); } }, p)); });
          temps.appendChild(h('div.lbl', null, t('ts.preset_pick'))); temps.appendChild(row2); temps.appendChild(h('div.ts-hint', null, t('ts.preset_hint')));
        }
      }
      drawTemps();
      wrap.appendChild(h('div.lbl', null, t('ts.mode'))); wrap.appendChild(seg.el); wrap.appendChild(temps);

      // save / delete
      var save = h('button.act.primary.ts-save', { type: 'button', onclick: function () { doSave(); } }, t('ts.save'));
      wrap.appendChild(save);
      if (!E.isNew) wrap.appendChild(h('button.act.danger.ts-del', { type: 'button', onclick: function () { doDelete(); } }, t('ts.delete')));
    }
    function doSave() {
      var E = S.E, L = limits();
      var name = String(E.name || '').trim() || (E.mode === 'off' ? t('ts.m.off') : t('ts.p.comfort'));
      if (!E.days.length) { ctx.toast('error', t('ts.day_empty')); return; }
      var entry = { mode: E.mode, temp: E.temp, low: E.low, high: E.high, preset: E.preset };
      var slot = { start: (E.time || '07:00') + ':00', actions: buildActions(entry, item.id, exitPreset()) };
      var days = DAYS.filter(function (d) { return E.days.indexOf(d) >= 0; });
      var p;
      if (E.isNew) p = ctx.call('scheduler', 'add', { weekdays: days, timeslots: [slot], repeat_type: 'repeat', name: name });
      else {
        var e = E.e, slots = (e.sc.timeslots || []).map(function (s, i) { return i === e.slot ? slot : cleanSlot(s); });
        p = ctx.call('scheduler', 'edit', { entity_id: e.sw, weekdays: days, timeslots: slots, name: name });
      }
      p.then(function () { ctx.toast('success', t('ts.saved')); if (days.indexOf(S.day) < 0) S.day = days[0]; S.view = 'list'; S.E = null; draw(); reloadSoon(500); }, function () { ctx.toast('error', t('ts.failed')); });
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

    function draw() { if (S.disposed) return; if (S.view === 'edit') drawEdit(); else drawList(); }
    draw(); load();
    return {
      update: function () {
        var st = ctx.hass().states, sig = Object.keys(st).filter(function (k) { return /^switch\.schedule_/.test(k); }).map(function (k) { return k + st[k].state + (st[k].last_updated || ''); }).join('|');
        if (sig !== S.sig) { var first = S.sig === ''; S.sig = sig; if (!first) reloadSoon(350); }
      },
      dispose: function () { S.disposed = true; clearTimeout(reloadT); },
    };
  }

  var CSS = [
    '.ts{display:flex;flex-direction:column;gap:14px;width:100%;}',
    '.ts-days{display:flex;justify-content:space-between;border-bottom:1px solid rgba(255,255,255,.16);margin:0 -2px;}',
    '.ts-day{position:relative;flex:1;padding:12px 0 14px;font-size:15px;font-weight:500;color:var(--okie-text-dim);min-width:0;}.ts-day.on{color:#fff;font-weight:700;}',
    '.ts-day.on::after{content:"";position:absolute;left:16%;right:16%;bottom:-1px;height:3px;border-radius:3px 3px 0 0;background:#fff;}',
    '.ts-day i{position:absolute;top:7px;left:calc(50% + 12px);width:6px;height:6px;border-radius:50%;background:#ffb04a;}',
    '.ts-list{display:flex;flex-direction:column;gap:10px;}.ts-empty{padding:26px 10px;}',
    '.ts-row{display:flex;align-items:center;gap:14px;padding:14px 16px;border-radius:20px;background:rgba(255,255,255,.09);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s ease;}.ts-row:active{background:rgba(255,255,255,.16);}.ts-row.off{opacity:.55;}',
    '.ts-row:focus-visible{outline:2px solid rgba(255,255,255,.7);outline-offset:-2px;}',
    '.ts-ic{width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);flex:none;}',
    '.ts-main{flex:1;min-width:0;}.ts-nm{font-weight:600;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.ts-chips{display:flex;gap:6px;margin-top:6px;flex-wrap:nowrap;}',
    '.ts-chip{padding:3px 12px;border-radius:999px;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;}.ts-chip.heat{background:rgba(255,128,84,.3);color:#ffd5c4;}.ts-chip.cool{background:rgba(104,158,255,.3);color:#d3e3ff;}.ts-chip.neutral{background:rgba(255,255,255,.16);color:#fff;}',
    '.ts-time{flex:none;font-size:15px;font-variant-numeric:tabular-nums;color:rgba(255,255,255,.82);text-align:right;white-space:nowrap;}',
    '.ts-add{display:flex;align-items:center;justify-content:center;gap:8px;width:100%;padding:14px;border-radius:999px;border:1.5px solid rgba(255,255,255,.34);font-size:15px;font-weight:600;color:#fff;}.ts-add:active{background:rgba(255,255,255,.12);}',
    '.ts-prof{border-radius:20px;background:rgba(255,255,255,.06);overflow:hidden;}',
    '.ts-prof-h{display:flex;align-items:center;justify-content:space-between;width:100%;padding:14px 16px;font-size:14px;font-weight:600;color:rgba(255,255,255,.88);text-align:left;}.ts-chev{transition:transform .2s ease;}.ts-prof.open .ts-chev{transform:rotate(180deg);}',
    '.ts-prof-hint{padding:0 16px 8px;font-size:12.5px;line-height:1.4;color:var(--okie-text-dim);}',
    '.ts-prow{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;padding:10px 16px 14px;border-top:1px solid rgba(255,255,255,.08);}.ts-pn{font-weight:600;flex:1 1 90px;min-width:70px;}',
    '.ts-upd{flex:1 1 100%;padding:9px 14px;border-radius:999px;background:#fff;color:#1d1b19;font-size:13.5px;font-weight:700;}',
    '.ts-st{display:flex;align-items:center;gap:12px;}.ts-stl{flex:none;width:76px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--okie-text-dim);}',
    '.ts-stv{min-width:92px;text-align:center;font-size:36px;font-weight:600;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}',
    '.ts-stb{width:46px;height:46px;border-radius:50%;background:rgba(255,255,255,.14);color:#fff;font-size:26px;line-height:1;display:grid;place-items:center;padding:0;touch-action:manipulation;}.ts-stb:active{background:rgba(255,255,255,.26);}',
    '.ts-st.heat .ts-stv{color:#ffb090;}.ts-st.cool .ts-stv{color:#a9c6ff;}',
    '.ts-st.sm{gap:6px;}.ts-st.sm .ts-stl{width:auto;font-size:11px;}.ts-st.sm .ts-stv{min-width:46px;font-size:20px;}.ts-st.sm .ts-stb{width:32px;height:32px;font-size:19px;}',
    '.ts-eh{display:flex;align-items:center;gap:10px;}.ts-back{display:inline-flex;align-items:center;gap:4px;padding:8px 14px 8px 8px;border-radius:999px;background:rgba(255,255,255,.12);font-size:14px;font-weight:600;}.ts-et{font-size:20px;font-weight:700;}',
    '.ts-name{width:100%;box-sizing:border-box;padding:13px 16px;border-radius:16px;border:0;background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:16px;outline:none;}.ts-name::placeholder{color:var(--okie-text-dim);}.ts-name:focus{background:rgba(255,255,255,.16);}',
    '.ts-wheels{align-self:flex-start;}.ts-temps{display:flex;flex-direction:column;gap:12px;}.ts-hint{font-size:13px;color:var(--okie-text-dim);}',
    '.cp.ghost{background:rgba(255,255,255,.06);font-size:13px;}.ts-quick{margin-top:-6px;}',
    '.ts-save{align-self:flex-start;}.ts-del{align-self:flex-start;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  g.OkieMotor.thermoSchedule = Object.assign({ render: render, CSS: CSS }, pureApi);
})(typeof globalThis !== 'undefined' ? globalThis : window);

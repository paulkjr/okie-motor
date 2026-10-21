/* okie-feeds: data rules for todos, calendar, the house chronicle and tips.
 *
 * Pure functions first (tested under node), then thin async fetchers that take
 * the card ctx. Home Assistant APIs used:
 *   todo/item/list (ws), todo.add_item / update_item / remove_item (services)
 *   GET calendars/<entity>?start&end (rest), calendar/event/create|update|delete (ws)
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var L = isNode ? require('./okie-logic.js') : g.OkieMotor.logic;

  var DAY = 86400000;

  // ----------------------------------------------------------- todos ----
  /** HA due is 'YYYY-MM-DD' (all day) or an ISO date-time. */
  function parseDue(due) {
    if (!due) return null;
    var s = String(due);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var p = s.split('-'); var d = new Date(+p[0], +p[1] - 1, +p[2], 23, 59, 59, 999);   // due that day = overdue only after it ends
      return { ms: d.getTime(), hasTime: false, startOfDay: new Date(+p[0], +p[1] - 1, +p[2]).getTime() };
    }
    var t = Date.parse(s.replace(' ', 'T'));
    return isNaN(t) ? null : { ms: t, hasTime: true, startOfDay: new Date(new Date(t).getFullYear(), new Date(t).getMonth(), new Date(t).getDate()).getTime() };
  }
  function isDone(it) { return it.status === 'completed'; }

  /**
   * todoView(items, now, opts) -> { overdue, today, upcoming, undated, done }
   * Identical overdue tasks that a provider reopened per missed period collapse
   * into one row with a count ("3x due").
   */
  function todoView(items, now, opts) {
    opts = opts || {};
    var out = { overdue: [], today: [], upcoming: [], undated: [], done: [] };
    items.forEach(function (it) {
      if (isDone(it)) { out.done.push(it); return; }
      var d = parseDue(it.due);
      if (!d) { out.undated.push(it); return; }
      if (d.ms < now) out.overdue.push(Object.assign({}, it, { _due: d }));
      else if (d.startOfDay <= now && now < d.startOfDay + DAY) out.today.push(Object.assign({}, it, { _due: d }));
      else out.upcoming.push(Object.assign({}, it, { _due: d }));
    });
    var byDue = function (a, b) { return a._due.ms - b._due.ms; };
    out.overdue.sort(byDue); out.today.sort(byDue); out.upcoming.sort(byDue);
    if (opts.stack !== false) out.overdue = stackOverdue(out.overdue);
    return out;
  }
  function stackOverdue(list) {
    var map = new Map(), res = [];
    list.forEach(function (it) {
      var key = String(it.summary || '').trim().toLowerCase() + '|' + (it.list || '');
      if (map.has(key)) { var first = map.get(key); first.count++; first.stacked.push(it); if (it._due.ms > first._due.ms) first._due = it._due; }
      else { var c = Object.assign({}, it, { count: 1, stacked: [it] }); map.set(key, c); res.push(c); }
    });
    return res;
  }
  function dueLabel(it, now, lang) {
    var de = lang === 'de', d = it._due || parseDue(it.due);
    if (!d) return '';
    // a date-only task counts calendar days; a timed one counts elapsed days
    var days = d.hasTime ? Math.floor(Math.abs(now - d.ms) / DAY) : Math.abs(Math.round((startOfDay(now) - d.startOfDay) / DAY));
    var time = d.hasTime ? new Date(d.ms).toLocaleTimeString(de ? 'de' : 'en', { hour: '2-digit', minute: '2-digit', hour12: false }) : '';
    if (d.ms < now) {
      var n = it.count > 1 ? it.count + '× ' : '';
      if (days < 1) return n + (de ? 'Heute fällig' : 'Due today');
      return n + (de ? 'Überfällig seit ' + days + (days === 1 ? ' Tag' : ' Tagen') : 'Overdue by ' + days + (days === 1 ? ' day' : ' days'));
    }
    if (d.startOfDay <= now && now < d.startOfDay + DAY) return (de ? 'Heute' : 'Today') + (time ? ' ' + time : '');
    return (de ? 'In ' + days + ' Tagen' : 'In ' + days + ' days') + (time ? ' ' + time : '');
  }
  /** Search before adding: matching existing items from all lists while the title is typed. */
  function matchTitle(items, text, limit) {
    var q = String(text || '').trim().toLowerCase();
    if (q.length < 2) return [];
    var seen = new Set();
    return items.filter(function (it) {
      if (isDone(it) || String(it.summary).toLowerCase().indexOf(q) < 0) return false;
      var k = String(it.summary).trim().toLowerCase() + '|' + (it.list || '');
      if (seen.has(k)) return false; seen.add(k); return true;           // stacked reopenings count once
    }).slice(0, limit || 5);
  }

  // -------------------------------------------------------- calendar ----
  function evTime(v) {
    if (!v) return null;
    if (typeof v === 'object') v = v.dateTime || v.date;
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) { var p = v.split('-'); return { ms: new Date(+p[0], +p[1] - 1, +p[2]).getTime(), allDay: true }; }
    var t = Date.parse(String(v).replace(' ', 'T'));
    return isNaN(t) ? null : { ms: t, allDay: false };
  }
  function parseEvent(raw, calendar) {
    var s = evTime(raw.start), e = evTime(raw.end);
    if (!s) return null;
    var allDay = s.allDay;
    return {
      id: raw.uid || raw.recurrence_id || (calendar + '|' + raw.summary + '|' + s.ms), uid: raw.uid || '', recurrenceId: raw.recurrence_id || '',
      title: raw.summary || '', start: s.ms, end: e ? e.ms : s.ms + (allDay ? DAY : 3600000), allDay: allDay,
      location: raw.location || '', description: raw.description || '', calendar: calendar, recurring: !!raw.rrule || !!raw.recurrence_id, rrule: raw.rrule || '',
    };
  }
  /** Next event as hero, four follow-ups. Events that already ended are dropped. */
  function nextEvents(events, now, n) {
    var up = events.filter(function (e) { return e.end > now; }).sort(function (a, b) { return a.start - b.start || a.title.localeCompare(b.title); });
    return { hero: up[0] || null, rest: up.slice(1, (n || 5)) };
  }
  function eventsOnDay(events, dayStartMs) {
    var end = dayStartMs + DAY;
    return events.filter(function (e) { return e.start < end && e.end > dayStartMs; }).sort(function (a, b) { return (b.allDay - a.allDay) || a.start - b.start; });
  }
  var RECURRENCE = { none: '', daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };   // five presets
  function eventLabel(e, now, lang) {
    var de = lang === 'de', loc = de ? 'de' : 'en';
    if (e.allDay) {
      var diff = Math.round((e.start - startOfDay(now)) / DAY);
      return diff === 0 ? (de ? 'Heute' : 'Today') : diff === 1 ? (de ? 'Morgen' : 'Tomorrow') : new Date(e.start).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' });
    }
    var d = startOfDay(e.start), td = startOfDay(now);
    var t = new Date(e.start).toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit', hour12: false });
    if (d === td) return (de ? 'Heute ' : 'Today ') + t;
    if (d === td + DAY) return (de ? 'Morgen ' : 'Tomorrow ') + t;
    return new Date(e.start).toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + t;
  }
  function startOfDay(ms) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); }
  /** Month grid cells (Monday first), 6 rows x 7 columns, each {ms, inMonth}. */
  function monthGrid(year, month) {
    var first = new Date(year, month, 1), lead = (first.getDay() + 6) % 7, cells = [];
    for (var i = 0; i < 42; i++) { var d = new Date(year, month, 1 - lead + i); cells.push({ ms: d.getTime(), day: d.getDate(), inMonth: d.getMonth() === month }); }
    return cells;
  }
  /** Week starts on Monday. */
  function weekStart(ms) { var d = new Date(ms), diff = (d.getDay() + 6) % 7; return new Date(d.getFullYear(), d.getMonth(), d.getDate() - diff).getTime(); }
  function addDays(ms, n) { var d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); }
  /** The week as day columns: seven, then five, then three on narrow screens, finally the compact week grid. */
  function weekColumns(width) { return width >= 760 ? 7 : width >= 560 ? 5 : width >= 380 ? 3 : 0; }
  /**
   * Overlap layout for timed events in one day column: events that overlap share the
   * width side by side. -> [{ ev, col, cols }]
   */
  function layoutOverlaps(events) {
    var sorted = events.slice().sort(function (a, b) { return a.start - b.start || b.end - a.end; });
    var out = [], cluster = [], clusterEnd = -Infinity;
    function flush() {
      var colEnds = [];
      cluster.forEach(function (it) {
        var c = 0; while (c < colEnds.length && colEnds[c] > it.ev.start) c++;
        colEnds[c] = it.ev.end; it.col = c;
      });
      cluster.forEach(function (it) { it.cols = colEnds.length; out.push(it); });
      cluster = []; clusterEnd = -Infinity;
    }
    sorted.forEach(function (ev) {
      if (cluster.length && ev.start >= clusterEnd) flush();
      cluster.push({ ev: ev, col: 0, cols: 1 }); clusterEnd = Math.max(clusterEnd, ev.end);
    });
    if (cluster.length) flush();
    return out;
  }
  /** Fetch window for a view: what the calendar needs to load. */
  function viewRange(view, anchorMs) {
    var d = new Date(anchorMs);
    if (view === 'day') { var s = startOfDay(anchorMs); return [s, s + DAY]; }
    if (view === 'week') { var w = weekStart(anchorMs); return [w, w + 7 * DAY]; }
    if (view === 'month') { var first = new Date(d.getFullYear(), d.getMonth(), 1).getTime(); var g0 = weekStart(first); return [g0, g0 + 42 * DAY]; }
    return [new Date(d.getFullYear(), 0, 1).getTime(), new Date(d.getFullYear() + 1, 0, 1).getTime()];
  }
  function stepAnchor(view, anchorMs, dir) {
    var d = new Date(anchorMs);
    if (view === 'day') return addDays(anchorMs, dir);
    if (view === 'week') return addDays(anchorMs, 7 * dir);
    if (view === 'month') return new Date(d.getFullYear(), d.getMonth() + dir, 1).getTime();
    return new Date(d.getFullYear() + dir, d.getMonth(), 1).getTime();
  }
  /** Event -> the service payload HA's calendar/event/create expects. */
  function eventPayload(f) {
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var ymd = function (ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
    var hms = function (ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':00'; };
    var ev = { summary: f.title };
    if (f.allDay) { ev.dtstart = ymd(f.start); ev.dtend = ymd(addDays(f.start, Math.max(1, Math.round(((f.end || f.start) - f.start) / DAY)))); }
    else { ev.dtstart = ymd(f.start) + ' ' + hms(f.start); ev.dtend = ymd(f.end) + ' ' + hms(f.end); }
    if (f.location) ev.location = f.location;
    if (f.description) ev.description = f.description;
    if (f.recurrence && RECURRENCE[f.recurrence]) ev.rrule = RECURRENCE[f.recurrence];
    return ev;
  }

  // ---- how the calendar looks: a colour per calendar, the dots under a day, the agenda ----
  var CAL_PALETTE = ['#0a84ff', '#32d74b', '#ff9f0a', '#ff453a', '#bf5af2', '#64d2ff', '#ffd60a', '#ff6482', '#ac8e68'];   // the iPhone's: blue, green, orange, red, purple, cyan, yellow, pink, brown
  /** One colour per calendar that never changes: the one saved for it, else the first palette colour nobody uses yet (calendars taken in name order). */
  function calendarColors(ids, saved) {
    var out = {}, used = {}; saved = saved || {};
    ids.forEach(function (id) { if (saved[id]) { out[id] = saved[id]; used[saved[id]] = 1; } });
    ids.slice().sort().forEach(function (id) {
      if (out[id]) return;
      var free = CAL_PALETTE.filter(function (c) { return !used[c]; });
      var c = free.length ? free[0] : CAL_PALETTE[Object.keys(out).length % CAL_PALETTE.length];
      out[id] = c; used[c] = 1;
    });
    return out;
  }
  /** The dots under a day number: one per event in time order, three at most, and how many more there are. */
  function dayDots(events, max) {
    max = max || 3;
    return { dots: events.slice(0, max).map(function (e) { return e.color || CAL_PALETTE[0]; }), more: Math.max(0, events.length - max) };
  }
  /** The agenda: the chosen day (always, empty or not), then each following day that has something, up to `limit` events. */
  function agendaDays(events, dayMs, span, limit) {
    var out = [], count = 0;
    for (var i = 0; i < (span || 14); i++) {
      var d = addDays(dayMs, i), evs = eventsOnDay(events, d);
      if (i > 0 && !evs.length) continue;
      if (i > 0 && limit && count >= limit) break;
      out.push({ day: d, events: evs }); count += evs.length;
    }
    return out;
  }
  /** A time of day the way the card is set to show it ('12h', '24h' or the language's habit). */
  function timeText(ms, lang, tf, hourOnly) {
    var o = hourOnly ? { hour: 'numeric' } : { hour: 'numeric', minute: '2-digit' };
    if (tf === '12h') o.hour12 = true; else if (tf === '24h' || (!tf && lang === 'de')) { o.hourCycle = 'h23'; if (!hourOnly) o.hour = '2-digit'; }   // (hour12:false would print midnight as 24)
    var txt = new Date(ms).toLocaleTimeString(lang === 'de' ? 'de' : 'en-US', o);
    return (hourOnly && o.hourCycle === 'h23') ? txt.replace(/^(\d)(?=\D|$)/, '0$1') + ':00' : txt;
  }

  // ---- a robot's own cleaning schedule shows up as a calendar: it belongs under Schedules, not among your appointments ----
  /** Calendars that share a device with a vacuum (the robot's schedule): { calendarId: vacuumId }. `entities` is Home Assistant's entity registry (entity_id -> { device_id }). */
  function robotCalendars(states, entities) {
    var out = {}, byDevice = {}; entities = entities || {};
    Object.keys(states || {}).forEach(function (id) { if (id.indexOf('vacuum.') === 0 && entities[id] && entities[id].device_id) byDevice[entities[id].device_id] = id; });
    Object.keys(states || {}).forEach(function (id) {
      if (id.indexOf('calendar.') !== 0) return;
      var dev = entities[id] && entities[id].device_id; if (dev && byDevice[dev]) out[id] = byDevice[dev];
    });
    return out;
  }
  var BYDAY = { MO: 'mon', TU: 'tue', WE: 'wed', TH: 'thu', FR: 'fri', SA: 'sat', SU: 'sun' }, DAYKEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  /**
   * The weekly cleanings of a robot, read from its calendar events (a week or more of them): one row per time of day, shaped like a Scheduler
   * schedule so the Schedules overview can list it. -> [{ id, kind:'schedule', name, entities:[vacuum], weekdays, slots:[HH:MM], next, enabled, domain:'vacuum', robot:true }]
   */
  function robotSchedules(events, calendarId, vacuumId, robotName, now) {
    var groups = {}, order = [];
    events.filter(function (e) { return e.calendar === calendarId && !e.allDay; }).forEach(function (e) {
      var d = new Date(e.start), clock = (d.getHours() < 10 ? '0' : '') + d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes(), key = clock + '|' + (e.title || '');
      var m = /BYDAY=([A-Z,]+)/.exec(e.rrule || ''), days = m ? m[1].split(',').map(function (x) { return BYDAY[x]; }).filter(Boolean) : [DAYKEYS[d.getDay()]];
      if (!groups[key]) { groups[key] = { clock: clock, title: e.title || '', days: {}, next: null }; order.push(key); }
      days.forEach(function (x) { groups[key].days[x] = 1; });
      if (e.end > now && (groups[key].next == null || e.start < groups[key].next)) groups[key].next = Math.max(e.start, now);
    });
    return order.map(function (k) {
      var gp = groups[k], wd = DAYKEYS.slice(1).concat(DAYKEYS[0]).filter(function (x) { return gp.days[x]; });
      return { id: 'robot:' + calendarId + ':' + k, kind: 'schedule', name: [robotName, gp.title].filter(Boolean).join(' · '), entities: [vacuumId], weekdays: wd, slots: [gp.clock], next: gp.next, enabled: true, domain: 'vacuum', robot: true };
    }).sort(function (a, b) { return a.slots[0].localeCompare(b.slots[0]); });
  }

  /**
   * The strip of periods above a calendar view: the days, weeks, months or years around the one shown, as words.
   * -> [{ ms, label, active, today, sub }]; ms is the start of that period (what the view moves to when it is tapped).
   */
  function periodStrip(view, anchorMs, now, lang, wide) {      // wide: a long strip to scroll through (the calendar), not just the few around the shown one
    var loc = lang === 'de' ? 'de' : 'en-US', out = [], a = new Date(anchorMs), i, up = function (x) { return String(x).toUpperCase().replace(/\.$/, ''); };
    var mk = function (ms, label, active, today, sub) { return { ms: ms, label: label, active: !!active, today: !!today, sub: sub || '' }; };
    if (view === 'day') {
      var d0 = startOfDay(anchorMs), n0 = startOfDay(now);
      for (i = wide ? -30 : -3; i <= (wide ? 120 : 10); i++) { var ms = addDays(d0, i), d = new Date(ms); out.push(mk(ms, up(d.toLocaleDateString(loc, { weekday: 'short' })) + ' ' + d.getDate(), i === 0, ms === n0, up(d.toLocaleDateString(loc, { month: 'short' })))); }
    } else if (view === 'week') {
      var w0 = weekStart(anchorMs), nw = weekStart(now);
      for (i = wide ? -26 : -2; i <= (wide ? 78 : 8); i++) {
        var ws = addDays(w0, 7 * i), a1 = new Date(ws), b1 = new Date(addDays(ws, 6)), mo = function (x) { return up(x.toLocaleDateString(loc, { month: 'short' })); };
        out.push(mk(ws, a1.getMonth() === b1.getMonth() ? mo(a1) + ' ' + a1.getDate() + '–' + b1.getDate() : mo(a1) + ' ' + a1.getDate() + ' – ' + mo(b1) + ' ' + b1.getDate(), i === 0, ws === nw));
      }
    } else if (view === 'month') {
      var nm = new Date(now);
      for (i = wide ? -24 : -6; i <= (wide ? 60 : 12); i++) {
        var m = new Date(a.getFullYear(), a.getMonth() + i, 1);
        out.push(mk(m.getTime(), up(m.toLocaleDateString(loc, { month: 'long' })) + (m.getMonth() === 0 && i !== 0 ? ' ' + m.getFullYear() : ''), i === 0, m.getFullYear() === nm.getFullYear() && m.getMonth() === nm.getMonth(), String(m.getFullYear())));
      }
    } else {
      var ny = new Date(now).getFullYear();
      for (i = wide ? -10 : -3; i <= (wide ? 20 : 6); i++) { var y = a.getFullYear() + i; out.push(mk(new Date(y, a.getMonth(), 1).getTime(), String(y), i === 0, y === ny)); }
    }
    return out;
  }

  /** Calendar groups bundle several calendars under one switch + colour. */
  function applyGroups(events, groups, enabled) {
    var map = {}; (groups || []).forEach(function (gr) { (gr.calendars || []).forEach(function (c) { map[c] = gr; }); });
    return events.filter(function (e) { var gr = map[e.calendar]; return !enabled || !gr || enabled.indexOf(gr.id) >= 0; }).map(function (e) { var gr = map[e.calendar]; return Object.assign({}, e, { color: gr ? gr.color : e.color, group: gr ? gr.id : null }); });
  }
  /** Event rules: title contains / from a calendar / all-day / past -> colour, icon, dim, hide. */
  function applyRules(ev, rules, now) {
    var res = Object.assign({}, ev);
    (rules || []).forEach(function (r) {
      var hit = (r.type === 'title' && ev.title.toLowerCase().indexOf(String(r.value).toLowerCase()) >= 0)
        || (r.type === 'calendar' && ev.calendar === r.value) || (r.type === 'allday' && ev.allDay) || (r.type === 'past' && ev.end < now);
      if (!hit) return;
      if (r.color) res.color = r.color; if (r.icon) res.icon = r.icon; if (r.dim) res.dim = true; if (r.hide) res.hidden = true;
    });
    return res;
  }

  // ------------------------------------------------------- chronicle ----
  var PHRASES = {
    en: {
      window: { on: 'Open', off: 'Closed' }, door: { on: 'Open', off: 'Closed' }, garage_door: { on: 'Open', off: 'Closed' }, opening: { on: 'Open', off: 'Closed' },
      motion: { on: 'Motion detected', off: 'Motion cleared' }, occupancy: { on: 'Occupied', off: 'Clear' }, presence: { on: 'Present', off: 'Away' },
      smoke: { on: 'Smoke detected', off: 'Clear' }, moisture: { on: 'Wet', off: 'Dry' },
    },
    de: {
      window: { on: 'Offen', off: 'Geschlossen' }, door: { on: 'Offen', off: 'Geschlossen' }, garage_door: { on: 'Offen', off: 'Geschlossen' }, opening: { on: 'Offen', off: 'Geschlossen' },
      motion: { on: 'Bewegung erkannt', off: 'Bewegung beendet' }, occupancy: { on: 'Belegt', off: 'Frei' }, presence: { on: 'Anwesend', off: 'Abwesend' },
      smoke: { on: 'Rauch erkannt', off: 'Frei' }, moisture: { on: 'Nass', off: 'Trocken' },
    },
  };
  /** "Window Kitchen -> Open" instead of "On": device classes speak. Returns null for noise. */
  var QUIET_DOMAINS = { sensor: 1, weather: 1, sun: 1, update: 1, image: 1, todo: 1, tts: 1, stt: 1, event: 1, number: 1, text: 1, input_number: 1, input_text: 1, input_datetime: 1, zone: 1, conversation: 1, script: 1, scene: 1, button: 1, input_button: 1 };   // scripts and scenes flip on/off every time they run
  function phraseFor(item, oldState, newState, lang) {
    if (!oldState || oldState === newState) return null;
    if (newState === 'unavailable' || newState === 'unknown' || oldState === 'unavailable' || oldState === 'unknown') return null;
    var l = lang === 'de' ? 'de' : 'en', d = item.domain;
    if (QUIET_DOMAINS[d]) return null;                                                         // numeric or bookkeeping flapping is not news
    if (/^\d{4}-\d\d-\d\d[T ]\d\d:\d\d/.test(String(newState))) return null;              // a timestamp state is "last triggered", not something that happened to the house
    var text;
    if (d === 'binary_sensor') { var p = PHRASES[l][item.deviceClass]; text = p ? p[newState === 'on' ? 'on' : 'off'] : L.stateLabel(newState, l); }
    else text = L.stateLabel(newState, l);
    return { text: text, kind: d };
  }
  /** Entries: [{id, ts, ...}] newest last. Repeated flaps of one entity fold into one entry with a count. */
  function foldFlaps(entries, windowMs, minCount) {
    windowMs = windowMs || 10 * 60000; minCount = minCount || 3;
    var out = [], byId = new Map();
    entries.forEach(function (e) {
      var run = byId.get(e.id);
      if (run && e.ts - run.last <= windowMs) { run.count++; run.last = e.ts; run.entry.text = e.text; run.entry.ts = e.ts; run.entry.folded = run.count >= minCount; run.entry.count = run.count; }
      else { var entry = Object.assign({}, e, { count: 1, folded: false }); out.push(entry); byId.set(e.id, { last: e.ts, count: 1, entry: entry }); }
    });
    return out;
  }
  function pushChronicle(list, entry, max) { list.push(entry); while (list.length > (max || 200)) list.shift(); return list; }
  function groupByDay(entries, now, lang) {
    var days = new Map();
    entries.slice().reverse().forEach(function (e) { var k = startOfDay(e.ts); if (!days.has(k)) days.set(k, []); days.get(k).push(e); });
    return Array.from(days.entries()).map(function (kv) {
      var diff = Math.round((startOfDay(now) - kv[0]) / DAY), de = lang === 'de';
      return { day: kv[0], title: diff === 0 ? (de ? 'Heute' : 'Today') : diff === 1 ? (de ? 'Gestern' : 'Yesterday') : new Date(kv[0]).toLocaleDateString(de ? 'de' : 'en', { weekday: 'long', day: 'numeric', month: 'long' }), entries: kv[1] };
    });
  }

  // ------------------------------------------------------------ tips ----
  var TIPS = {
    en: [
      { t: 'Hold to unlock', b: 'Locks and covers open only when you press and hold the icon. Closing and locking stay one tap.' },
      { t: 'Type, Tab, chip', b: 'Type "kit", press Tab and the room becomes a chip. Add "light" the same way to scope the search.' },
      { t: 'Learns your habits', b: 'The suggestions shelf reorders itself from what you use. Reset it any time in Settings.' },
      { t: 'Video backgrounds', b: 'Drop clips like light_on.mp4 into /config/www/okie-videos and detail views play them.' },
      { t: 'Schedules', b: 'With the Scheduler component installed, every device gets a Schedule tab.' },
      { t: 'Hide the noise', b: 'Excluded patterns like *_linkquality keep diagnostic entities out of search.' },
    ],
    de: [
      { t: 'Halten zum Entriegeln', b: 'Schlösser und Rollos öffnen nur bei langem Drücken. Schließen und Verriegeln bleibt ein Tipp.' },
      { t: 'Tippen, Tab, Chip', b: '"kü" tippen, Tab drücken: der Raum wird zum Chip. Mit "Licht" genauso eingrenzen.' },
      { t: 'Lernt deine Gewohnheiten', b: 'Die Vorschläge ordnen sich nach deiner Nutzung. In den Einstellungen zurücksetzbar.' },
      { t: 'Video-Hintergründe', b: 'Clips wie light_on.mp4 nach /config/www/okie-videos legen, die Detailansicht spielt sie ab.' },
      { t: 'Zeitpläne', b: 'Mit der Scheduler-Komponente bekommt jedes Gerät einen Zeitplan-Tab.' },
      { t: 'Rauschen ausblenden', b: 'Ausschlussmuster wie *_linkquality halten Diagnose-Entitäten aus der Suche.' },
    ],
  };

  // ---- news: every feed sensor of fast-news-reader / feedparser -------------------------------
  /**
   * newsFeeds(states, configured) -> [{ id, title, entries:[{key,title,link,image,published,feed,summary}] }]
   * A feed sensor is any sensor whose attributes carry an `entries` list (+ usually `channel`).
   * `configured` (optional entity id) is always included, even if it looks odd.
   */
  function newsFeeds(states, configured) {
    var out = [];
    Object.keys(states || {}).forEach(function (id) {
      var st = states[id];
      if (!st || !st.attributes) return;
      var isFeed = id.indexOf('sensor.') === 0 && Array.isArray(st.attributes.entries);
      if (!isFeed && id !== configured) return;
      var entries = Array.isArray(st.attributes.entries) ? st.attributes.entries : [];
      var ch = st.attributes.channel || {};
      var title = st.attributes.friendly_name || ch.title || id;
      out.push({ id: id, title: title, entries: entries.map(function (e) {
        var img = e.image && typeof e.image === 'object' ? (e.image.href || e.image.url || '') : (e.image || '');
        return { key: e.id || e.link || e.title, title: e.title || '', link: e.link || '', image: img, published: e.published || '', summary: e.summary || '', feed: title };
      }) });
    });
    return out;
  }
  /** newsCounts(feeds, readKeys) -> { unread, total, feeds } */
  function newsCounts(feeds, read) {
    var set = new Set(read || []), unread = 0, total = 0;
    feeds.forEach(function (f) { f.entries.forEach(function (e) { total++; if (!set.has(e.key)) unread++; }); });
    return { unread: unread, total: total, feeds: feeds.length };
  }
  /** newsList(feeds, readKeys, tab, limit) -> merged entries, newest first when `published` parses, flagged unread. */
  function newsList(feeds, read, tab, limit) {
    var set = new Set(read || []), all = [];
    feeds.forEach(function (f, fi) { f.entries.forEach(function (e, ei) {
      var ms = Date.parse(e.published); all.push(Object.assign({}, e, { unread: !set.has(e.key), _ms: isNaN(ms) ? 0 : ms, _o: fi * 10000 + ei }));
    }); });
    all.sort(function (a, b) { return (b._ms - a._ms) || (a._o - b._o); });
    if (tab === 'unread') all = all.filter(function (e) { return e.unread; });
    else if (tab === 'read') all = all.filter(function (e) { return !e.unread; });
    return limit ? all.slice(0, limit) : all;
  }

  var api = {
    newsFeeds: newsFeeds, newsCounts: newsCounts, newsList: newsList,
    parseDue: parseDue, todoView: todoView, stackOverdue: stackOverdue, dueLabel: dueLabel, matchTitle: matchTitle,
    weekStart: weekStart, addDays: addDays, weekColumns: weekColumns, layoutOverlaps: layoutOverlaps, viewRange: viewRange, stepAnchor: stepAnchor, eventPayload: eventPayload,
    parseEvent: parseEvent, nextEvents: nextEvents, eventsOnDay: eventsOnDay, RECURRENCE: RECURRENCE, eventLabel: eventLabel, monthGrid: monthGrid, startOfDay: startOfDay, applyGroups: applyGroups, applyRules: applyRules,
    periodStrip: periodStrip, robotCalendars: robotCalendars, robotSchedules: robotSchedules, calendarColors: calendarColors, dayDots: dayDots, agendaDays: agendaDays, timeText: timeText, CAL_PALETTE: CAL_PALETTE,
    phraseFor: phraseFor, foldFlaps: foldFlaps, pushChronicle: pushChronicle, groupByDay: groupByDay, TIPS: TIPS, DAY: DAY,
  };

  // ---- async fetchers (browser only; take the card ctx) ----
  function todoEntities(ctx) { return Object.keys(ctx.hass().states).filter(function (k) { return k.indexOf('todo.') === 0; }); }
  api.fetchTodos = function (ctx, ids) {
    ids = ids || todoEntities(ctx);
    return Promise.all(ids.map(function (id) {
      return Promise.resolve(ctx.callWS({ type: 'todo/item/list', entity_id: id })).then(function (r) {
        var name = (ctx.state(id) && ctx.state(id).attributes.friendly_name) || id;
        return ((r && r.items) || []).map(function (it) { return Object.assign({ list: id, listName: name }, it); });
      }, function () { return []; });
    })).then(function (lists) { return [].concat.apply([], lists); });
  };
  api.todoEntities = todoEntities;
  api.calendarEntities = function (ctx) { return Object.keys(ctx.hass().states).filter(function (k) { return k.indexOf('calendar.') === 0; }); };
  /** The calendars switched off. They are kept in the synced settings (`calendarHidden`), so the card on every screen and the Okie Home app agree; a device that never had the setting starts from what it had.
   *  A robot's schedule calendar is switched off the first time it is seen (you can switch it on again). */
  api.hiddenCalendars = function (ctx) {
    var sh = ctx.settings.get().calendarHidden, shared = Array.isArray(sh);
    var hidden = shared ? sh.slice() : (ctx.store.get('cal.hidden', []) || []), seen = ctx.store.get('cal.seen', []) || [], changed = !shared, hs = ctx.hass();
    Object.keys(robotCalendars(hs.states, hs.entities)).forEach(function (id) {
      if (seen.indexOf(id) >= 0) return;
      seen = seen.concat(id); changed = true; if (hidden.indexOf(id) < 0) hidden = hidden.concat(id);
    });
    if (changed) { ctx.store.set('cal.seen', seen); api.setHiddenCalendars(ctx, hidden); }
    return hidden;
  };
  api.setHiddenCalendars = function (ctx, hidden) {
    var list = (hidden || []).slice(); ctx.store.set('cal.hidden', list);
    var sh = ctx.settings.get().calendarHidden; if (!Array.isArray(sh) || JSON.stringify(sh) !== JSON.stringify(list)) ctx.settings.set({ calendarHidden: list });
  };
  /** The colours picked for the calendars (calendar id -> #rrggbb), the synced ones over this device's own. */
  api.savedCalendarColors = function (ctx) { return Object.assign({}, ctx.store.get('cal.colors', {}) || {}, ctx.settings.get().calendarColors || {}); };
  api.setCalendarColors = function (ctx, colors) {
    ctx.store.set('cal.colors', colors);
    var sh = ctx.settings.get().calendarColors || {}; if (JSON.stringify(sh) !== JSON.stringify(colors)) ctx.settings.set({ calendarColors: Object.assign({}, colors) });
  };
  api.robotCalendarsOf = function (ctx) { var hs = ctx.hass(); return robotCalendars(hs.states, hs.entities); };
  api.fetchEvents = function (ctx, fromMs, toMs, ids) {
    ids = ids || api.calendarEntities(ctx);
    var q = '?start=' + encodeURIComponent(new Date(fromMs).toISOString()) + '&end=' + encodeURIComponent(new Date(toMs).toISOString());
    return Promise.all(ids.map(function (id) {
      return Promise.resolve(ctx.hass().callApi('GET', 'calendars/' + id + q)).then(function (rows) { return (rows || []).map(function (r) { return parseEvent(r, id); }).filter(Boolean); }, function () { return []; });
    })).then(function (lists) { return [].concat.apply([], lists); });
  };

  if (isNode) module.exports = api;
  else { g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.feeds = api; }
})(typeof globalThis !== 'undefined' ? globalThis : window);

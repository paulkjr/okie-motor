'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/okie-feeds.js');

const NOW = new Date(2026, 9, 5, 14, 0, 0).getTime();   // 5 Oct 2026, 14:00 local
const D = F.DAY;
const day = (offset, h, m) => { const d = new Date(2026, 9, 5 + offset, h || 0, m || 0); return d.getTime(); };
const ymd = off => { const d = new Date(2026, 9, 5 + off); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

// ---- todos -------------------------------------------------------------------
test('due parsing: a date-only task is overdue only after that day ends', () => {
  const a = F.parseDue(ymd(0));
  assert.equal(a.hasTime, false);
  assert.ok(a.ms > NOW, 'due today at midnight is not overdue at 14:00');
  assert.ok(F.parseDue(ymd(-1)).ms < NOW);
  assert.equal(F.parseDue('nonsense'), null);
  assert.equal(F.parseDue(null), null);
  assert.equal(F.parseDue('2026-10-05 09:30:00').hasTime, true);
});

test('todo view: overdue, today, upcoming, undated, done; overdue is oldest first', () => {
  const items = [
    { summary: 'later', status: 'needs_action', due: ymd(5) },
    { summary: 'late-2', status: 'needs_action', due: ymd(-2) },
    { summary: 'late-9', status: 'needs_action', due: ymd(-9) },
    { summary: 'today', status: 'needs_action', due: ymd(0) },
    { summary: 'someday', status: 'needs_action' },
    { summary: 'finished', status: 'completed', due: ymd(-1) },
  ];
  const v = F.todoView(items, NOW);
  assert.deepEqual(v.overdue.map(i => i.summary), ['late-9', 'late-2']);
  assert.deepEqual(v.today.map(i => i.summary), ['today']);
  assert.deepEqual(v.upcoming.map(i => i.summary), ['later']);
  assert.deepEqual(v.undated.map(i => i.summary), ['someday']);
  assert.deepEqual(v.done.map(i => i.summary), ['finished']);
});

test('stacking: identical overdue tasks collapse into one row with a count', () => {
  const items = [-3, -2, -1].map(o => ({ summary: 'Take out trash', status: 'needs_action', due: ymd(o), list: 'todo.a' }))
    .concat([{ summary: 'Take out trash', status: 'needs_action', due: ymd(-1), list: 'todo.b' }]);
  const v = F.todoView(items, NOW);
  assert.equal(v.overdue.length, 2, 'different lists do not merge');
  const a = v.overdue.find(i => i.list === 'todo.a');
  assert.equal(a.count, 3);
  assert.equal(F.dueLabel(a, NOW, 'de').startsWith('3× '), true);
  assert.equal(F.todoView(items, NOW, { stack: false }).overdue.length, 4);
});

test('due labels: overdue by N days, today, in N days, German', () => {
  const od = { summary: 'x', status: 'needs_action', due: ymd(-126) };
  const a = F.todoView([od], NOW).overdue[0];
  assert.equal(F.dueLabel(a, NOW, 'en'), 'Overdue by 126 days');
  assert.equal(F.dueLabel(a, NOW, 'de'), 'Überfällig seit 126 Tagen');
  const fut = F.todoView([{ summary: 'y', status: 'needs_action', due: ymd(238) }], NOW).upcoming[0];
  assert.ok(F.dueLabel(fut, NOW, 'en').startsWith('In 238 days'));
  const td = F.todoView([{ summary: 'z', status: 'needs_action', due: ymd(0) }], NOW).today[0];
  assert.equal(F.dueLabel(td, NOW, 'en'), 'Today');
});

test('search before adding: matching open items appear while typing', () => {
  const items = [{ summary: 'Buy milk', status: 'needs_action' }, { summary: 'Milk the cow', status: 'completed' }, { summary: 'Call Anna', status: 'needs_action' }];
  assert.deepEqual(F.matchTitle(items, 'milk').map(i => i.summary), ['Buy milk']);
  assert.deepEqual(F.matchTitle(items, 'm'), [], 'too short');
  const dup = [{ summary: 'Trash', status: 'needs_action', list: 'a' }, { summary: 'trash ', status: 'needs_action', list: 'a' }, { summary: 'Trash', status: 'needs_action', list: 'b' }];
  assert.equal(F.matchTitle(dup, 'tra').length, 2, 'same title in the same list counts once');
});

// ---- calendar ---------------------------------------------------------------
test('event parsing: timed, all-day (date only), and fallbacks', () => {
  const t = F.parseEvent({ summary: 'Dinner', start: { dateTime: '2026-10-05T18:00:00+02:00' }, end: { dateTime: '2026-10-05T19:30:00+02:00' } }, 'calendar.family');
  assert.equal(t.allDay, false); assert.equal(t.end - t.start, 90 * 60000); assert.equal(t.calendar, 'calendar.family');
  const a = F.parseEvent({ summary: 'Holiday', start: { date: '2026-10-07' }, end: { date: '2026-10-08' } }, 'calendar.x');
  assert.equal(a.allDay, true); assert.equal(a.end - a.start, D);
  const s = F.parseEvent({ summary: 'HA string', start: '2026-10-05 08:00:00' }, 'calendar.x');
  assert.equal(s.end - s.start, 3600000, 'missing end defaults to one hour');
  assert.equal(F.parseEvent({ summary: 'bad' }, 'c'), null);
  const r = F.parseEvent({ summary: 'Series', uid: 'u1', recurrence_id: '20261005', start: '2026-10-05 08:00:00', rrule: 'FREQ=WEEKLY' }, 'c');
  assert.equal(r.uid, 'u1'); assert.equal(r.recurrenceId, '20261005'); assert.equal(r.recurring, true);
});

test('next events: hero + four follow-ups, finished events dropped, ties by title', () => {
  const mk = (title, sh, eh) => ({ id: title, title, start: day(0, sh), end: day(0, eh), allDay: false, calendar: 'c' });
  const evs = [mk('past', 8, 9), mk('e', 20, 21), mk('b', 15, 16), mk('a', 15, 16), mk('c', 17, 18), mk('d', 18, 19), mk('now', 13, 15)];
  const n = F.nextEvents(evs, NOW, 5);
  assert.equal(n.hero.title, 'now', 'a running event is the hero');
  assert.deepEqual(n.rest.map(e => e.title), ['a', 'b', 'c', 'd']);
});

test('events on a day include multi-day spans and sort all-day first', () => {
  const evs = [
    { id: 1, title: 'timed', start: day(0, 9), end: day(0, 10), allDay: false },
    { id: 2, title: 'trip', start: day(-1), end: day(2), allDay: true },
    { id: 3, title: 'tomorrow', start: day(1, 9), end: day(1, 10), allDay: false },
  ];
  assert.deepEqual(F.eventsOnDay(evs, day(0)).map(e => e.title), ['trip', 'timed']);
});

test('five recurrence presets', () => {
  assert.deepEqual(Object.keys(F.RECURRENCE), ['none', 'daily', 'weekly', 'monthly', 'yearly']);
  assert.equal(F.RECURRENCE.weekly, 'FREQ=WEEKLY');
});

test('event labels: today / tomorrow with time, German too', () => {
  const t = { start: day(0, 18), end: day(0, 19), allDay: false };
  assert.equal(F.eventLabel(t, NOW, 'en'), 'Today 18:00');
  assert.equal(F.eventLabel(Object.assign({}, t, { start: day(1, 7) }), NOW, 'de'), 'Morgen 07:00');
  assert.equal(F.eventLabel({ start: day(0), end: day(1), allDay: true }, NOW, 'en'), 'Today');
});

test('month grid: 42 cells, Monday first, flags the visible month', () => {
  const cells = F.monthGrid(2026, 9);                      // October 2026 starts on a Thursday
  assert.equal(cells.length, 42);
  assert.equal(new Date(cells[0].ms).getDay(), 1, 'first column is Monday');
  assert.equal(cells.filter(c => c.inMonth).length, 31);
  assert.equal(cells[3].day, 1); assert.equal(cells[3].inMonth, true);
});

test('calendar groups bundle calendars under one switch and colour; event rules recolour and hide', () => {
  const evs = [{ id: 1, title: 'A', calendar: 'calendar.mum', start: 1, end: 2 }, { id: 2, title: 'B', calendar: 'calendar.dad', start: 1, end: 2 }, { id: 3, title: 'C', calendar: 'calendar.work', start: 1, end: 2 }];
  const groups = [{ id: 'family', color: '#4f8cff', calendars: ['calendar.mum', 'calendar.dad'] }];
  const all = F.applyGroups(evs, groups, ['family']);
  assert.equal(all.length, 3); assert.equal(all[0].color, '#4f8cff'); assert.equal(all[0].group, 'family');
  assert.equal(F.applyGroups(evs, groups, []).length, 1, 'switching the group off hides its calendars');
  const r = F.applyRules({ title: 'Dentist', calendar: 'calendar.work', allDay: false, end: 5 }, [{ type: 'title', value: 'dent', color: 'red', icon: 'tooth' }, { type: 'past', dim: true }], 10);
  assert.equal(r.color, 'red'); assert.equal(r.icon, 'tooth'); assert.equal(r.dim, true);
  assert.equal(F.applyRules({ title: 'x', allDay: true, end: 99 }, [{ type: 'allday', hide: true }], 10).hidden, true);
});

// ---- chronicle ---------------------------------------------------------------
test('chronicle phrases speak device classes, not "On"', () => {
  assert.equal(F.phraseFor({ domain: 'binary_sensor', deviceClass: 'window' }, 'off', 'on', 'en').text, 'Open');
  assert.equal(F.phraseFor({ domain: 'binary_sensor', deviceClass: 'window' }, 'on', 'off', 'de').text, 'Geschlossen');
  assert.equal(F.phraseFor({ domain: 'binary_sensor', deviceClass: 'motion' }, 'off', 'on', 'en').text, 'Motion detected');
  assert.equal(F.phraseFor({ domain: 'lock' }, 'locked', 'unlocked', 'en').text, 'Unlocked');
  assert.equal(F.phraseFor({ domain: 'light' }, 'off', 'on', 'de').text, 'An');
});

test('chronicle ignores noise: sensors, unavailable flaps, no-ops', () => {
  assert.equal(F.phraseFor({ domain: 'sensor' }, '20', '21', 'en'), null);
  assert.equal(F.phraseFor({ domain: 'light' }, 'on', 'unavailable', 'en'), null);
  assert.equal(F.phraseFor({ domain: 'light' }, 'unavailable', 'on', 'en'), null);
  assert.equal(F.phraseFor({ domain: 'light' }, 'on', 'on', 'en'), null);
  assert.equal(F.phraseFor({ domain: 'light' }, undefined, 'on', 'en'), null);
});

test('repeated flaps fold into one entry with a count', () => {
  const M = 60000;
  const e = (id, ts, text) => ({ id, ts, text });
  const folded = F.foldFlaps([e('a', 0, 'On'), e('a', 1 * M, 'Off'), e('a', 2 * M, 'On'), e('b', 3 * M, 'On'), e('a', 40 * M, 'Off')], 10 * M, 3);
  assert.equal(folded.length, 3, 'a-run, b, later a');
  assert.equal(folded[0].count, 3); assert.equal(folded[0].folded, true); assert.equal(folded[0].text, 'On');
  assert.equal(folded[1].folded, false);
  assert.equal(folded[2].count, 1);
});

test('chronicle list is capped and grouped by day, newest first', () => {
  const list = []; for (let i = 0; i < 250; i++) F.pushChronicle(list, { id: 'x' + i, ts: i }, 200);
  assert.equal(list.length, 200); assert.equal(list[0].id, 'x50');
  const days = F.groupByDay([{ id: 'o', ts: day(-1, 10) }, { id: 'n', ts: day(0, 9) }, { id: 'n2', ts: day(0, 13) }], NOW, 'en');
  assert.deepEqual(days.map(d => d.title), ['Today', 'Yesterday']);
  assert.deepEqual(days[0].entries.map(e => e.id), ['n2', 'n']);
});

test('tips exist in both languages with a title and body', () => {
  ['en', 'de'].forEach(l => { assert.ok(F.TIPS[l].length >= 5); F.TIPS[l].forEach(t => { assert.ok(t.t && t.b); }); });
  assert.equal(F.TIPS.en.length, F.TIPS.de.length);
});

// ---- calendar views ------------------------------------------------------------
test('week starts on Monday and steps in whole weeks', () => {
  const wed = new Date(2026, 9, 7, 15).getTime();
  assert.equal(new Date(F.weekStart(wed)).getDay(), 1);
  assert.equal(new Date(F.weekStart(wed)).getDate(), 5);
  assert.equal(new Date(F.weekStart(new Date(2026, 9, 4).getTime())).getDate(), 28, 'a Sunday belongs to the week before');
  assert.equal(new Date(F.stepAnchor('week', wed, 1)).getDate(), 14);
  assert.equal(new Date(F.stepAnchor('month', wed, -1)).getMonth(), 8);
  assert.equal(new Date(F.stepAnchor('year', wed, 1)).getFullYear(), 2027);
  assert.equal(new Date(F.stepAnchor('day', wed, -1)).getDate(), 6);
});

test('week columns step down: 7, 5, 3, compact grid', () => {
  assert.deepEqual([1200, 800, 760, 700, 560, 500, 380, 379, 200].map(F.weekColumns), [7, 7, 7, 5, 5, 3, 3, 0, 0]);
});

test('overlapping events share the width; separate events keep full width', () => {
  const ev = (id, a, b) => ({ id, start: a, end: b });
  const lay = F.layoutOverlaps([ev('a', 9, 11), ev('b', 10, 12), ev('c', 10.5, 11.5), ev('d', 13, 14)]);
  const by = Object.fromEntries(lay.map(l => [l.ev.id, l]));
  assert.equal(by.a.cols, 3); assert.equal(by.b.cols, 3); assert.equal(by.c.cols, 3);
  assert.deepEqual([by.a.col, by.b.col, by.c.col].sort(), [0, 1, 2]);
  assert.equal(by.d.cols, 1); assert.equal(by.d.col, 0);
  // touching events (one ends exactly when the next begins) do not overlap
  const t = F.layoutOverlaps([ev('x', 9, 10), ev('y', 10, 11)]);
  assert.ok(t.every(l => l.cols === 1));
});

test('view ranges cover what each view shows', () => {
  const d = new Date(2026, 9, 15).getTime();
  const [m0, m1] = F.viewRange('month', d);
  assert.equal(new Date(m0).getDay(), 1); assert.equal((m1 - m0) / F.DAY, 42);
  assert.ok(m0 <= new Date(2026, 9, 1).getTime() && m1 > new Date(2026, 9, 31).getTime());
  const [w0, w1] = F.viewRange('week', d); assert.equal((w1 - w0) / F.DAY, 7);
  const [y0, y1] = F.viewRange('year', d); assert.equal(new Date(y0).getMonth(), 0); assert.equal(new Date(y1).getFullYear(), 2027);
  const [d0, d1] = F.viewRange('day', d); assert.equal(d1 - d0, F.DAY);
});

test('event payload for HA: timed, all-day, recurrence preset, optional fields', () => {
  const timed = F.eventPayload({ title: 'Dinner', start: new Date(2026, 9, 5, 18, 30).getTime(), end: new Date(2026, 9, 5, 20).getTime(), allDay: false, location: 'Home', recurrence: 'weekly' });
  assert.deepEqual(timed, { summary: 'Dinner', dtstart: '2026-10-05 18:30:00', dtend: '2026-10-05 20:00:00', location: 'Home', rrule: 'FREQ=WEEKLY' });
  const allDay = F.eventPayload({ title: 'Trip', start: new Date(2026, 9, 7).getTime(), end: new Date(2026, 9, 9).getTime(), allDay: true });
  assert.equal(allDay.dtstart, '2026-10-07'); assert.equal(allDay.dtend, '2026-10-09'); assert.ok(!('rrule' in allDay));
  const one = F.eventPayload({ title: 'x', start: new Date(2026, 9, 7).getTime(), end: new Date(2026, 9, 7).getTime(), allDay: true });
  assert.equal(one.dtend, '2026-10-08', 'an all-day event spans at least one day');
});

// ---- news feeds --------------------------------------------------------------
test('news feeds: finds every sensor with an entries list, flattens image objects', () => {
  const states = {
    'sensor.tagesschau': { state: '2', attributes: { friendly_name: 'Tagesschau', entries: [{ title: 'A', link: 'http://a', image: { href: 'http://img/a.jpg' }, published: '2026-10-05T10:00:00Z' }, { title: 'B', link: 'http://b', published: '2026-10-05T12:00:00Z' }] } },
    'sensor.heise': { state: '1', attributes: { channel: { title: 'heise online' }, entries: [{ title: 'C', id: 'c-1' }] } },
    'sensor.power': { state: '12', attributes: { unit_of_measurement: 'W' } },
    'light.kitchen': { state: 'on', attributes: { entries: [1] } },
  };
  const feeds = F.newsFeeds(states);
  assert.deepEqual(feeds.map(f => f.id), ['sensor.tagesschau', 'sensor.heise']);
  assert.equal(feeds[0].entries[0].image, 'http://img/a.jpg');
  assert.equal(feeds[1].title, 'heise online');
  assert.equal(feeds[1].entries[0].key, 'c-1');
});

test('news counts and list: unread across feeds, newest first, read tab', () => {
  const feeds = F.newsFeeds({
    'sensor.a': { attributes: { friendly_name: 'A', entries: [{ title: 'old', link: 'x1', published: '2026-10-01T00:00:00Z' }, { title: 'new', link: 'x2', published: '2026-10-05T00:00:00Z' }] } },
    'sensor.b': { attributes: { friendly_name: 'B', entries: [{ title: 'mid', link: 'x3', published: '2026-10-03T00:00:00Z' }] } },
  });
  assert.deepEqual(F.newsCounts(feeds, []), { unread: 3, total: 3, feeds: 2 });
  assert.deepEqual(F.newsCounts(feeds, ['x2']), { unread: 2, total: 3, feeds: 2 });
  assert.deepEqual(F.newsList(feeds, ['x2'], 'unread').map(e => e.title), ['mid', 'old']);
  assert.deepEqual(F.newsList(feeds, ['x2'], 'read').map(e => e.title), ['new']);
  assert.deepEqual(F.newsList(feeds, [], 'all', 2).map(e => e.title), ['new', 'mid']);
});

test('phrases: timestamp states and bookkeeping domains are not news', () => {
  const light = { domain: 'light', deviceClass: null };
  assert.equal(F.phraseFor({ domain: 'event', deviceClass: null }, 'a', 'b', 'en'), null);
  assert.equal(F.phraseFor({ domain: 'camera', deviceClass: null }, 'idle', '2026-10-06T15:20:24.242270+00:00', 'en'), null, 'an ISO timestamp is a last-triggered time');
  assert.equal(F.phraseFor({ domain: 'todo', deviceClass: null }, '3', '4', 'en'), null);
  assert.equal(F.phraseFor({ domain: 'input_number', deviceClass: null }, '3', '4', 'en'), null);
  assert.ok(F.phraseFor(light, 'off', 'on', 'en'), 'a light still is news');
});

// ---- calendar look: colours, dots, agenda ------------------------------------------
test('every calendar gets its own colour and keeps it: the saved one wins, a new one takes the first free colour', () => {
  const a = F.calendarColors(['calendar.work', 'calendar.family', 'calendar.birthdays']);
  assert.equal(new Set(Object.values(a)).size, 3, 'no two calendars share a colour');
  assert.equal(a['calendar.birthdays'], F.CAL_PALETTE[0], 'name order decides the first colours');
  const b = F.calendarColors(['calendar.work', 'calendar.family', 'calendar.birthdays', 'calendar.aaa'], a);
  ['calendar.work', 'calendar.family', 'calendar.birthdays'].forEach(id => assert.equal(b[id], a[id], id + ' keeps its colour when a calendar is added'));
  assert.ok(!Object.values(a).includes(b['calendar.aaa']), 'the new calendar takes a colour nobody uses');
  const many = F.calendarColors(Array.from({ length: 12 }, (_, i) => 'calendar.c' + i));
  assert.equal(Object.keys(many).length, 12, 'more calendars than colours still all get one');
  assert.equal(F.calendarColors(['calendar.x'], { 'calendar.x': '#123456' })['calendar.x'], '#123456');
});

test('day dots: one per event in order, three at most, the rest counted', () => {
  const ev = c => ({ color: c });
  assert.deepEqual(F.dayDots([]), { dots: [], more: 0 });
  assert.deepEqual(F.dayDots([ev('#a'), ev('#b')]), { dots: ['#a', '#b'], more: 0 });
  assert.deepEqual(F.dayDots([ev('#a'), ev('#b'), ev('#c'), ev('#d'), ev('#e')]), { dots: ['#a', '#b', '#c'], more: 2 });
});

test('agenda: the chosen day always shows (empty too), then only the days that have something, capped', () => {
  const day = n => new Date(2026, 9, 14 + n).getTime(), at = (n, h) => day(n) + h * 3600000;
  const evs = [
    { id: 'a', title: 'A', start: at(0, 9), end: at(0, 10), allDay: false },
    { id: 'b', title: 'B', start: at(2, 9), end: at(2, 10), allDay: false },
    { id: 'c', title: 'C', start: at(2, 8), end: at(2, 8.5), allDay: false },
    { id: 'd', title: 'D', start: day(5), end: day(6), allDay: true },
  ];
  const ag = F.agendaDays(evs, day(0), 14);
  assert.deepEqual(ag.map(x => (x.day - day(0)) / F.DAY), [0, 2, 5], 'empty days in between are left out');
  assert.deepEqual(ag[1].events.map(e => e.id), ['c', 'b'], 'in time order');
  const quiet = F.agendaDays(evs, day(3), 14);
  assert.equal(quiet[0].events.length, 0); assert.equal((quiet[0].day - day(3)), 0, 'a quiet chosen day is still the first entry');
  assert.deepEqual(quiet.map(x => (x.day - day(0)) / F.DAY), [3, 5]);
  assert.equal(F.agendaDays(evs, day(0), 14, 1).length, 1, 'once the cap is reached no further day is added (the chosen day always shows)');
  assert.equal(F.agendaDays(evs, day(0), 14, 2).length, 2, 'a day is added whole, so the list may run a little past the cap');
  assert.equal(F.agendaDays(evs, day(0), 1).length, 1, 'span limits how far ahead it looks');
});

test('time text follows the card setting: 12h, 24h, else the language habit; hour labels too', () => {
  const t = new Date(2026, 9, 14, 14, 5).getTime();
  assert.match(F.timeText(t, 'en', '12h'), /^2:05\s?PM$/);
  assert.equal(F.timeText(t, 'en', '24h'), '14:05');
  assert.equal(F.timeText(t, 'de', undefined), '14:05');
  assert.match(F.timeText(t, 'en', undefined), /PM$/);
  assert.equal(F.timeText(new Date(2026, 9, 14, 7).getTime(), 'en', '24h', true), '07:00');
  assert.match(F.timeText(new Date(2026, 9, 14, 7).getTime(), 'en', '12h', true), /^7\s?AM$/);
});

// ---- a robot's schedule is a calendar: found by its device, read as weekly cleanings -------------------
test('a calendar that shares a device with a vacuum is the robot\'s schedule', () => {
  const states = { 'vacuum.robo': {}, 'calendar.robo_schedule': {}, 'calendar.family': {}, 'calendar.work': {}, 'light.x': {} };
  const entities = { 'vacuum.robo': { device_id: 'd1' }, 'calendar.robo_schedule': { device_id: 'd1' }, 'calendar.family': {}, 'calendar.work': { device_id: 'd2' } };
  assert.deepEqual(F.robotCalendars(states, entities), { 'calendar.robo_schedule': 'vacuum.robo' });
  assert.deepEqual(F.robotCalendars(states, {}), {}, 'without a registry nothing is guessed');
  assert.deepEqual(F.robotCalendars({}, entities), {});
});

test('robot cleanings become one schedule row per time of day, with the weekdays and the next start', () => {
  const day = (n, h, m) => new Date(2026, 9, 14 + n, h, m || 0).getTime(), now = day(0, 12);
  const byday = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const ev = (n, h, title, m) => ({ calendar: 'calendar.robo', title: title || 'Cleaning', start: day(n, h, m), end: day(n, h + 1, m), allDay: false, rrule: 'FREQ=WEEKLY;BYDAY=' + byday[new Date(2026, 9, 14 + n).getDay()] });
  const week = [0, 1, 2, 3, 4, 5, 6].map(n => ev(n, 16));
  const rows = F.robotSchedules(week, 'calendar.robo', 'vacuum.robo', 'Home Robot', now);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Home Robot · Cleaning'); assert.deepEqual(rows[0].slots, ['16:00']);
  assert.deepEqual(rows[0].weekdays, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], 'Monday first');
  assert.equal(rows[0].next, day(0, 16), 'today 16:00 is still ahead at noon'); assert.equal(rows[0].kind, 'schedule'); assert.equal(rows[0].domain, 'vacuum'); assert.deepEqual(rows[0].entities, ['vacuum.robo']);
  // after the cleaning, the next start is tomorrow's
  assert.equal(F.robotSchedules(week, 'calendar.robo', 'vacuum.robo', 'R', day(0, 18))[0].next, day(1, 16));
  // two times of day -> two rows, earliest first; a weekday-only one lists only those days; other calendars and all-day events are ignored
  const mixed = [ev(0, 9, 'Mop'), ev(1, 9, 'Mop'), ev(0, 16), ev(1, 16, 'Cleaning'), { calendar: 'calendar.other', title: 'X', start: day(0, 5), end: day(0, 6), allDay: false }, { calendar: 'calendar.robo', title: 'Hol', start: day(0, 0), end: day(1, 0), allDay: true }];
  const m = F.robotSchedules(mixed, 'calendar.robo', 'vacuum.robo', 'R', now);
  assert.deepEqual(m.map(x => x.slots[0]), ['09:00', '16:00']);
  assert.deepEqual(m[0].weekdays, ['wed', 'thu'], 'two recurring weekday events: Wednesday and Thursday (14 and 15 Oct 2026)');
});

// ---- the strip of periods above a calendar view ----------------------------------------
test('the period strip: days, weeks, months and years around the one shown, the shown one active, today marked', () => {
  const now = new Date(2026, 9, 14, 12).getTime();       // Wed 14 Oct 2026
  const day = F.periodStrip('day', now, now, 'en');
  assert.equal(day.length, 14); assert.equal(day.filter(x => x.active).length, 1); assert.equal(day.find(x => x.active).label, 'WED 14'); assert.equal(day.find(x => x.today).ms, new Date(2026, 9, 14).getTime());
  assert.equal(day[0].label, 'SUN 11', 'three days back'); assert.equal(day[1].ms - day[0].ms, F.DAY);
  const wk = F.periodStrip('week', now, now, 'en'); assert.equal(wk.find(x => x.active).label, 'OCT 12–18'); assert.equal(new Date(wk.find(x => x.active).ms).getDay(), 1, 'a week starts on Monday');
  assert.ok(wk.some(x => /OCT 26 – NOV 1/.test(x.label)), 'a week across two months names both'); assert.equal(wk.find(x => x.today).label, 'OCT 12–18');
  const mo = F.periodStrip('month', now, now, 'en'); assert.equal(mo.find(x => x.active).label, 'OCTOBER'); assert.equal(mo.find(x => x.active).sub, '2026'); assert.ok(mo.some(x => x.label === 'JANUARY 2027'), 'January names its year'); assert.equal(mo.find(x => x.label === 'NOVEMBER').ms, new Date(2026, 10, 1).getTime());
  const yr = F.periodStrip('year', now, now, 'en'); assert.deepEqual(yr.map(x => x.label), ['2023', '2024', '2025', '2026', '2027', '2028', '2029', '2030', '2031', '2032']); assert.equal(yr.find(x => x.active).label, '2026');
  // looking at another month: that one is active and today stays marked where it is
  const away = F.periodStrip('month', new Date(2027, 1, 10).getTime(), now, 'en'); assert.equal(away.find(x => x.active).label, 'FEBRUARY'); assert.equal(away.find(x => x.today).label, 'OCTOBER 2026'.replace(' 2026', ''));
  const de = F.periodStrip('month', now, now, 'de'); assert.equal(de.find(x => x.active).label, 'OKTOBER');
});

// ---- calendars shared between screens (settings: calendarHidden, calendarColors) ----------------------------
function fakeCtx(settings, store, states) {
  const st = Object.assign({}, store || {}), set = Object.assign({ calendarHidden: null, calendarColors: {} }, settings || {}), writes = [];
  return {
    writes, st, set,
    hass: () => ({ states: states || {}, entities: {} }),
    store: { get: (k, d) => (k in st ? st[k] : d), set: (k, v) => { st[k] = v; } },
    settings: { get: () => set, set: o => { Object.assign(set, o); writes.push(o); } },
  };
}

test('calendars: a screen that never had the shared setting starts from its own list and shares it', () => {
  const c = fakeCtx(null, { 'cal.hidden': ['calendar.a'], 'cal.seen': [] }, { 'calendar.a': { state: 'off' } });
  assert.deepEqual(F.hiddenCalendars(c), ['calendar.a']);
  assert.deepEqual(c.set.calendarHidden, ['calendar.a']);
});

test('calendars: the shared list wins over this device\'s own, and a change is written to both', () => {
  const c = fakeCtx({ calendarHidden: ['calendar.shared'] }, { 'cal.hidden': ['calendar.old'], 'cal.seen': [] }, {});
  assert.deepEqual(F.hiddenCalendars(c), ['calendar.shared']);
  F.setHiddenCalendars(c, ['calendar.shared', 'calendar.b']);
  assert.deepEqual(c.set.calendarHidden, ['calendar.shared', 'calendar.b']);
  assert.deepEqual(c.st['cal.hidden'], ['calendar.shared', 'calendar.b']);
  const before = c.writes.length; F.setHiddenCalendars(c, ['calendar.shared', 'calendar.b']);
  assert.equal(c.writes.length, before, 'nothing changed: nothing written');
});

test('calendars: picked colours are shared, the synced ones over the local ones', () => {
  const c = fakeCtx({ calendarColors: { 'calendar.a': '#ff453a' } }, { 'cal.colors': { 'calendar.a': '#0a84ff', 'calendar.b': '#32d74b' } }, {});
  assert.deepEqual(F.savedCalendarColors(c), { 'calendar.a': '#ff453a', 'calendar.b': '#32d74b' });
  F.setCalendarColors(c, { 'calendar.a': '#ff453a', 'calendar.b': '#bf5af2' });
  assert.deepEqual(c.set.calendarColors, { 'calendar.a': '#ff453a', 'calendar.b': '#bf5af2' });
});

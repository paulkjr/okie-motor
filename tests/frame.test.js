'use strict';
// The pure rules behind the FSC-style frame: lock page text, dock, island, device icons, layout maths.
const test = require('node:test');
const assert = require('node:assert/strict');
const Z = require('../src/okie-zen.js');
const D = require('../src/okie-dock.js');
const I = require('../src/okie-island.js');
const IC = require('../src/okie-icons.js');
const L = require('../src/okie-logic.js');

// ---- lock page ----------------------------------------------------------------
test('zen: the part of the day follows the hour and the greeting is stable within an hour', () => {
  assert.equal(Z.daypart(6), 'morning'); assert.equal(Z.daypart(12), 'afternoon'); assert.equal(Z.daypart(18), 'evening'); assert.equal(Z.daypart(23), 'evening');
  assert.equal(Z.greeting('en', 9, 5), Z.greeting('en', 9, 5), 'same hour, same words');
  assert.notEqual(Z.greeting('en', 9, 5), Z.greeting('en', 9, 6), 'next hour, other words');
  assert.match(Z.greeting('de', 9, 0, 'Alex'), /, Alex$/);
  assert.ok(Z.GREETINGS.en.morning.length >= 6 && Z.GREETINGS.de.evening.length >= 6);
});

test('zen: quotes come as text plus an optional attribution, only where the source is solid', () => {
  const q = Z.quote('en', 3);
  assert.match(q.text, /^“.+”$/);
  Z.QUOTES.en.concat(Z.QUOTES.de).forEach(([text, by]) => { assert.ok(text.length > 8); assert.ok(by === '' || /^[A-Z]/.test(by)); });
  assert.equal(Z.quote('de', 0).text.startsWith('“'), true);
});

test('zen: swipe, scroll and keys that reveal the start screen', () => {
  assert.ok(Z.isRevealKey('Enter') && Z.isRevealKey(' ') && Z.isRevealKey('ArrowUp'));
  assert.ok(!Z.isRevealKey('a') && !Z.isRevealKey('Tab'));
  assert.equal(Z.dragProgress(-20), 0); assert.equal(Z.dragProgress(150), 0.5); assert.equal(Z.dragProgress(900), 1);
  assert.equal(Z.REVEAL_DRAG_PX, 60);
});

// ---- dock ---------------------------------------------------------------------
test('dock: defaults follow FSC order, hide what does not exist and keep Home first', () => {
  const avail = ['home', 'changelog', 'energy', 'weather', 'tips', 'news', 'tasks', 'schedules', 'settings', 'calendar', 'assistant'];
  assert.deepEqual(D.dockItems({ available: avail, saved: null }), ['home', 'energy', 'weather', 'calendar', 'news', 'tips', 'schedules', 'tasks', 'settings', 'changelog']);
  assert.deepEqual(D.dockItems({ available: ['settings', 'tasks'], saved: null }), ['home', 'tasks', 'settings']);
  assert.deepEqual(D.dockItems({ available: avail, saved: ['settings', 'tips'] }), ['home', 'settings', 'tips'], 'Home is always added');
  assert.deepEqual(D.dockItems({ available: ['home', 'tasks'], saved: ['tasks', 'tasks', 'ghost'] }), ['home', 'tasks'], 'no duplicates, no unknown ids');
});

test('dock: the configure list keeps saved order first and flags what is on', () => {
  const avail = ['home', 'energy', 'settings', 'changelog', 'assistant'];
  const fresh = D.configurable({ available: avail, saved: null });
  assert.deepEqual(fresh.map(x => x.id), ['home', 'energy', 'settings', 'changelog', 'assistant']);
  assert.deepEqual(fresh.filter(x => x.on).map(x => x.id), ['home', 'energy', 'settings', 'changelog'], 'the assistant is off by default');
  const saved = D.configurable({ available: avail, saved: ['settings', 'home'] });
  assert.deepEqual(saved.map(x => x.id).slice(0, 2), ['settings', 'home']);
  assert.equal(saved.find(x => x.id === 'energy').on, false);
  assert.equal(saved.find(x => x.id === 'home').on, true);
});

test('dock: how many icons fit a rail before the rest go behind "more"', () => {
  assert.equal(D.visibleCount(5, 600), 5);
  assert.ok(D.visibleCount(30, 300) >= 3 && D.visibleCount(30, 300) < 30);
});

test('dock: a finger opens the rail on the touch and goes where it lifts; a mouse keeps the hover', () => {
  assert.equal(D.pressStep({ type: 'touch' }).open, true);
  assert.equal(D.pressStep({ type: 'pen' }).open, true);
  assert.equal(D.pressStep({ type: 'mouse' }).open, false);
  assert.equal(D.pressStep({ type: '' }).open, false);
  const on = D.releaseStep({ index: 2 }), off = D.releaseStep({ index: -1 });
  assert.equal(on.go, true); assert.equal(off.go, false);
  assert.ok(on.fold > off.fold && off.fold > 0);
});

// ---- island -------------------------------------------------------------------
test('island: levels, start level and badge follow the worst notification', () => {
  const c = I.levelCounts([{ severity: 'info' }, { severity: 'warning' }, { severity: 'info' }], [{ id: 'x' }]);
  assert.deepEqual(c, { critical: 0, warning: 1, info: 2, live: 1 });
  assert.equal(I.startLevel(c), 'warning');
  assert.equal(I.startLevel({ critical: 0, warning: 0, info: 0, live: 2 }), 'live');
  assert.equal(I.startLevel({ critical: 0, warning: 0, info: 0, live: 0 }), 'info');
  assert.equal(I.badgeLevel(c), 'warning'); assert.equal(I.badgeCount(c), 3, 'running things never badge');
  assert.equal(I.badgeLevel({ critical: 0, warning: 0, info: 0, live: 4 }), null);
  assert.deepEqual(I.stack({ critical: 2, warning: 0, info: 1, live: 0 }), ['critical', 'info']);
});

test('island: live activities from states, only the sources that are switched on', () => {
  const items = [
    { id: 'timer.tea', domain: 'timer', name: 'Tea' }, { id: 'vacuum.rob', domain: 'vacuum', name: 'Rob' }, { id: 'media_player.tv', domain: 'media_player', name: 'TV' },
    { id: 'light.a', domain: 'light', name: 'A' }, { id: 'cover.b', domain: 'cover', name: 'Blind' },
  ];
  const states = { 'timer.tea': { state: 'active', attributes: { remaining: '0:03:00' } }, 'vacuum.rob': { state: 'docked', attributes: {} }, 'media_player.tv': { state: 'playing', attributes: { media_title: 'News' } }, 'light.a': { state: 'on', attributes: {} }, 'cover.b': { state: 'closing', attributes: {} } };
  const def = I.liveActivities(items, states).map(a => a.id).sort();
  assert.deepEqual(def, ['cover.b', 'media_player.tv', 'timer.tea'], 'lights are off by default, a docked vacuum is not running');
  assert.deepEqual(I.liveActivities(items, states, { enabled: { lights: 1 } }).map(a => a.id), ['light.a']);
  assert.equal(I.liveActivities(items, states)[0].value.length > 0, true);
});

test('island: the power value picks the strongest sensor and formats kW', () => {
  const items = [{ id: 'sensor.a', domain: 'sensor', deviceClass: 'power' }, { id: 'sensor.b', domain: 'sensor', deviceClass: 'power' }, { id: 'sensor.t', domain: 'sensor', deviceClass: 'temperature' }];
  assert.equal(I.autoPower(items, { 'sensor.a': { state: '120' }, 'sensor.b': { state: '1700' }, 'sensor.t': { state: '9999' } }), 'sensor.b');
  assert.equal(I.autoPower(items, {}), null);
  assert.equal(I.fmtPower('1700', 'W'), '1.7 kW'); assert.equal(I.fmtPower('412', 'W'), '412 W'); assert.equal(I.fmtPower('2.5', 'kW'), '2.5 kW'); assert.equal(I.fmtPower('n/a', 'W'), 'n/a');
});

test('island: dismissed notes stay away, snoozed ones come back when the time is up', () => {
  const notes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const hidden = { a: { until: 0 }, b: { until: 5000 } };
  assert.deepEqual(I.visibleNotes(notes, hidden, 4000).map(n => n.id), ['c']);
  assert.deepEqual(I.visibleNotes(notes, hidden, 6000).map(n => n.id), ['b', 'c']);
});

// ---- device icons -------------------------------------------------------------
test('icons: every kind the mapping can return has a drawing', () => {
  const samples = [['light'], ['switch'], ['switch', 'outlet'], ['media_player'], ['media_player', 'speaker'], ['climate', null, 'cool'], ['climate', null, 'heat'], ['climate'], ['cover'], ['cover', 'garage'], ['fan'], ['vacuum'], ['lock'], ['camera'],
    ['binary_sensor', 'motion'], ['binary_sensor', 'door'], ['binary_sensor', 'window'], ['binary_sensor', 'smoke'], ['binary_sensor'], ['sensor', 'temperature'], ['sensor', 'humidity'], ['sensor', 'battery'], ['sensor', 'power'], ['sensor'],
    ['weather', null, 'rainy'], ['weather', null, 'sunny'], ['weather', null, 'clear-night'], ['weather'], ['scene'], ['script'], ['automation'], ['alarm_control_panel'], ['person'], ['humidifier'], ['water_heater'], ['siren'], ['unknown_domain']];
  samples.forEach(([d, dc, st]) => { const k = IC.kind(d, dc, st, {}); assert.ok(IC.KINDS.includes(k), d + '/' + dc + ' -> ' + k); });
});

// ---- layout maths -------------------------------------------------------------
test('layout: FSC zoom and height ladder reproduce the measured window', () => {
  assert.equal(L.zoomFor(600), 1); assert.equal(L.zoomFor(1920), 1); assert.equal(L.zoomFor(1080), 0.65);
  assert.ok(Math.abs(L.zoomFor(1512) - 0.9408) < 0.001, 'the 1512px window measured on the live card');
  const lay = L.layoutFor(698);                                   // 1512x712 window: (712 - 56) / 0.9408
  assert.deepEqual([lay.panelH, lay.gridH, lay.rung], [561, 465, 'kompakt']);
  assert.equal(L.layoutFor(2000).panelH, 672); assert.equal(L.layoutFor(100).panelH, 380);
  assert.equal(L.layoutFor(2000).rung, 'voll'); assert.equal(L.layoutFor(100).rung, 'boden'); assert.equal(L.layoutFor(600).rung, 'abwerfen');
  assert.ok(lay.w34 >= 150 && lay.w34 <= 200);
});

test('layout: search grid columns by width, typewriter and recency windows', () => {
  assert.deepEqual([1200, 1000, 700, 500, 300].map(w => L.gridColumns(w, 5)), [5, 4, 3, 2, 1]);
  assert.equal(L.gridColumns(1200, 6), 6); assert.equal(L.gridColumns(1200, 3), 5, 'only 4/5/6 are valid choices');
  const lines = ['Last: Lamp', 'Search devices'];
  assert.equal(L.typistAt(lines, 0).text, ''); assert.equal(L.typistAt(lines, 45 * 4).text, 'Last');
  assert.equal(L.typistAt(lines, 45 * 10 + 100).text, 'Last: Lamp', 'holds the full line');
  assert.equal(L.typistAt([], 100).line, -1);
  const now = Date.parse('2026-10-06T12:00:00');
  const items = [{ id: 'a', t: now - 2 * 60000 }, { id: 'b', t: now - 40 * 60000 }, { id: 'c', t: now - 5 * 3600000 }, { id: 'd', t: now - 30 * 3600000 }];
  const b = L.recentBuckets(items, it => it.t, now, L.TIME_SORT.standard);
  assert.deepEqual(b.map(x => x.key + ':' + x.items.map(i => i.id).join('')), ['15:a', '60:b', 'today:c', 'earlier:d']);
});

// ---- assistant in the search bar ------------------------------------------------
test('search: a request reads like a request, a device name does not', () => {
  ['turn off the kitchen lights', 'is the front door locked?', 'schalte das Licht an', 'mach das Licht aus', 'what is the temperature in the kitchen', 'dim the lamp please'].forEach(q => assert.equal(L.looksLikeAsk(q), true, q));
  ['kitchen', 'living room light', 'lamp', 'tv', 'front door', 'Küche Licht', ''].forEach(q => assert.equal(L.looksLikeAsk(q), false, q));
});

test('assistant: the entities an Assist answer acted on become tiles, without duplicates or non-entities', () => {
  const SY = require('../src/okie-system.js');
  const resp = { response: { data: { success: [{ name: 'Lamp', type: 'entity', id: 'light.lamp' }, { name: 'Living', type: 'area', id: 'living_room' }], targets: [{ name: 'Lamp', type: 'entity', id: 'light.lamp' }, { name: 'Strip', type: 'entity', id: 'light.strip' }], failed: [] }, speech: { plain: { speech: 'Done' } } } };
  assert.deepEqual(SY.targetsOf(resp), ['light.lamp', 'light.strip']);
  assert.deepEqual(SY.targetsOf({ response: { data: {} } }), []);
  assert.deepEqual(SY.targetsOf(null), []);
  assert.equal(SY.speechOf(resp), 'Done');
});

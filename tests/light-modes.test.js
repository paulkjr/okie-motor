'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LM = require('../src/okie-light-modes.js');

test('light modes: the three shortcuts run their scripts exactly as before', () => {
  const d = LM.defaultModes();
  assert.deepEqual(d.map(m => m.name), ['Cozy lights', "Let's go to sleep", 'Turn up the lights']);
  assert.deepEqual(LM.callsFor(d[0]), [{ domain: 'script', service: 'turn_on', data: { entity_id: 'script.govee_cozy_lights' } }]);
  assert.deepEqual(LM.callsFor(d[1]), [{ domain: 'script', service: 'turn_on', data: { entity_id: 'script.govee_lets_go_to_sleep' } }]);
  assert.deepEqual(LM.callsFor(d[2]), [{ domain: 'script', service: 'turn_on', data: { entity_id: 'script.govee_turn_up_the_lights' } }]);
  assert.ok(d.every(m => m.showIn.favorites && m.showIn.rooms.join() === 'living_room'));
  assert.equal(LM.modesOf(null).length, 3); assert.equal(LM.modesOf(undefined).length, 3); assert.equal(LM.modesOf([]).length, 0, 'an empty saved list means no modes, not the defaults');
});

test('light modes: a saved mode is made safe (name, picture, colour, steps)', () => {
  const m = LM.cleanMode({ id: 'a', name: '  Movie night  ', icon: 'nope', color: ['#ABCDEF', 'bad'], run: [{ type: 'scene', entity: 'scene.movie' }, { type: 'scene', entity: 'light.x' }, null, { type: 'lights', entities: ['light.a', 'light.a', 'switch.b'], state: 'on', brightness: 150 }, { type: 'area', area: 'living_room', state: 'off', brightness: 50 }, { type: 'weird' }] });
  assert.equal(m.name, 'Movie night'); assert.equal(m.icon, 'bulb'); assert.equal(m.color[0], '#abcdef'); assert.equal(m.color[1], LM.COLORS[0][1]);
  assert.deepEqual(m.run, [{ type: 'scene', entity: 'scene.movie' }, { type: 'lights', entities: ['light.a'], state: 'on', brightness: 100 }, { type: 'area', area: 'living_room', state: 'off', brightness: null }]);
  assert.deepEqual(m.showIn, { favorites: true, rooms: [] });
  assert.equal(LM.cleanMode({ id: 'a', name: '', run: [{ type: 'script', entity: 'script.x' }] }), null, 'no name');
  assert.equal(LM.cleanMode({ id: 'a', name: 'x', run: [] }), null, 'nothing to do');
  assert.equal(LM.cleanMode({ id: '', name: 'x', run: [{ type: 'script', entity: 'script.x' }] }), null, 'no id');
  assert.deepEqual(LM.modesFrom([m, m, null, 'x']).map(x => x.id), ['a'], 'doubles and junk dropped');
  assert.ok(/^m[0-9a-z]+$/.test(LM.newId([])) && LM.newId([{ id: 'x' }]) !== LM.newId([{ id: 'x' }]));
});

test('light modes: lights and rooms become light.turn_on / turn_off calls, in order', () => {
  const m = LM.cleanMode({ id: 'a', name: 'x', run: [{ type: 'script', entity: 'script.a' }, { type: 'lights', entities: ['light.a', 'light.b'], state: 'on', brightness: 40 }, { type: 'lights', entities: ['light.c'], state: 'on' }, { type: 'area', area: 'kitchen', state: 'off' }, { type: 'area', area: 'living_room', state: 'on', brightness: 20 }] });
  assert.deepEqual(LM.callsFor(m), [
    { domain: 'script', service: 'turn_on', data: { entity_id: 'script.a' } },
    { domain: 'light', service: 'turn_on', data: { brightness_pct: 40, entity_id: ['light.a', 'light.b'] } },
    { domain: 'light', service: 'turn_on', data: { entity_id: ['light.c'] } },
    { domain: 'light', service: 'turn_off', data: { area_id: 'kitchen' } },
    { domain: 'light', service: 'turn_on', data: { brightness_pct: 20, area_id: 'living_room' } }]);
  assert.deepEqual(LM.actionsFor(m), [
    { service: 'script.turn_on', entity_id: 'script.a' },
    { service: 'light.turn_on', entity_id: ['light.a', 'light.b'], service_data: { brightness_pct: 40 } },
    { service: 'light.turn_on', entity_id: ['light.c'] },
    { service: 'light.turn_off', service_data: { area_id: 'kitchen' } },
    { service: 'light.turn_on', service_data: { brightness_pct: 20, area_id: 'living_room' } }]);
});

test('light modes: schedules that run exactly this mode are found, however the Scheduler hands the actions back', () => {
  const [cozy, sleep] = LM.defaultModes();
  const sc = [
    { schedule_id: 'a', name: 'Cozy', weekdays: ['daily'], enabled: true, timeslots: [{ start: '20:30:00', actions: LM.actionsFor(cozy) }] },
    { schedule_id: 'b', name: 'Sleep', weekdays: ['workday'], enabled: false, entity_id: 'switch.schedule_b', timeslots: [{ start: '22:00:00', actions: LM.actionsFor(sleep) }, { start: '07:00:00', actions: LM.actionsFor(cozy) }] },
    { schedule_id: 'c', name: 'In data', weekdays: ['sat'], timeslots: [{ start: '09:00:00', actions: [{ service: 'script.turn_on', service_data: { entity_id: 'script.govee_cozy_lights' } }] }] },
    { schedule_id: 'd', name: 'Other', weekdays: ['daily'], timeslots: [{ start: '08:00:00', actions: [{ service: 'script.turn_on', entity_id: 'script.other' }] }] },
  ];
  const e = LM.entriesFor(sc, cozy);
  assert.deepEqual(e.map(x => x.sid + ':' + x.time), ['b:07:00', 'c:09:00', 'a:20:30']);
  assert.equal(e[0].sw, 'switch.schedule_b'); assert.equal(e[0].enabled, false); assert.equal(e[0].slots, 2); assert.equal(e[0].slot, 1);
  assert.equal(e[2].days.length, 7); assert.equal(e[2].sw, 'switch.schedule_a');
  assert.deepEqual(LM.entriesFor(sc, sleep).map(x => x.sid), ['b']);
  assert.deepEqual(LM.entriesFor([], cozy), []); assert.deepEqual(LM.entriesFor(undefined, cozy), []);
});

test('light modes: a card shows only where it is wanted and only when what it runs exists', () => {
  const [cozy] = LM.defaultModes(), room = (o) => ({ room: Object.assign({ id: 'living_room', name: 'Living Room' }, o) });
  assert.ok(LM.visibleIn(cozy, { favorites: true }));
  assert.ok(LM.visibleIn(cozy, room()), 'by id');
  assert.ok(LM.visibleIn(cozy, room({ id: 'living-room' })), 'the id spelled with a hyphen');
  assert.ok(LM.visibleIn(cozy, room({ id: 'x', name: 'Living Room' })), 'by name');
  assert.ok(!LM.visibleIn(cozy, room({ id: 'kitchen', name: 'Kitchen' })));
  assert.ok(!LM.visibleIn(Object.assign({}, cozy, { showIn: { favorites: false, rooms: [] } }), { favorites: true }));
  const states = { 'script.govee_cozy_lights': {} };
  assert.ok(LM.available(cozy, states, null)); assert.ok(!LM.available(cozy, {}, null), 'a deleted script hides the card');
  const area = LM.cleanMode({ id: 'r', name: 'r', run: [{ type: 'area', area: 'living_room' }] });
  assert.ok(LM.available(area, {}, { living_room: {} })); assert.ok(LM.available(area, {}, { 'living-room': {} })); assert.ok(!LM.available(area, {}, { kitchen: {} }));
  const lights = LM.cleanMode({ id: 'l', name: 'l', run: [{ type: 'lights', entities: ['light.a', 'light.b'] }] });
  assert.ok(LM.available(lights, { 'light.b': {} }, null), 'one of the lights is enough'); assert.ok(!LM.available(lights, {}, null));
});

test('light modes: each step is described in plain words', () => {
  const tr = (k, v) => k + JSON.stringify(v || {}), states = { 'script.a': { attributes: { friendly_name: 'My script' } } };
  assert.equal(LM.describeItem({ type: 'script', entity: 'script.a' }, states, tr), 'lm.d_script{"n":"My script"}');
  assert.equal(LM.describeItem({ type: 'lights', entities: ['light.a', 'light.b'], state: 'on', brightness: 30 }, states, tr), 'lm.d_on_at{"w":"lm.d_n_lights{\\"n\\":2}","p":30}');
  assert.ok(/lm\.d_off/.test(LM.describeItem({ type: 'area', area: 'kitchen', state: 'off' }, states, tr)));
});

test('light modes: the mode that ran last is the active one, whichever way it was run', () => {
  const [cozy, sleep, bright] = LM.defaultModes(), modes = [cozy, sleep, bright];
  const script = (when) => ({ attributes: { last_triggered: when } });
  const st = {
    'script.govee_cozy_lights': script('2026-10-12T20:00:00+00:00'),
    'script.govee_lets_go_to_sleep': script('2026-10-12T22:30:00+00:00'),
    'script.govee_turn_up_the_lights': script(null),
  };
  assert.equal(LM.activeMode(modes, st, {}), sleep.id, 'the script that fired last');
  assert.equal(LM.ranAt(bright, st, {}), 0, 'a script that never ran has no time');
  assert.equal(LM.activeMode(modes, {}, {}), null, 'nothing known: no active mode');
  assert.equal(LM.activeMode(modes, undefined, undefined), null);
  // this device ran the third one a moment ago (a tap): it wins over older script times
  assert.equal(LM.activeMode(modes, st, { [bright.id]: Date.parse('2026-10-12T23:00:00+00:00') }), bright.id);
  assert.equal(LM.activeMode(modes, st, { [cozy.id]: Date.parse('2026-10-12T21:00:00+00:00') }), sleep.id, 'an older tap does not beat a newer script run');
  // a scene counts through its state (the time it was activated); junk and unknown are ignored
  const movie = LM.cleanMode({ id: 'mv', name: 'Movie', run: [{ type: 'scene', entity: 'scene.movie' }] });
  assert.equal(LM.activeMode([cozy, movie], { 'script.govee_cozy_lights': script('2026-10-12T20:00:00+00:00'), 'scene.movie': { state: '2026-10-12T21:15:00+00:00' } }, {}), 'mv');
  assert.equal(LM.ranAt(movie, { 'scene.movie': { state: 'unknown' } }, {}), 0);
  assert.equal(LM.ranAt(movie, { 'scene.movie': { state: 'banana' } }, {}), 0);
  // a tie goes to the mode listed first
  assert.equal(LM.activeMode([cozy, sleep], {}, { [cozy.id]: 5, [sleep.id]: 5 }), cozy.id);
});

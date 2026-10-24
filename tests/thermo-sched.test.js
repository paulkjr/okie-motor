'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const S = require('../src/okie-thermo-sched.js');

const ID = 'climate.living_room';
const slot = (start, actions) => ({ start, actions });
const act = (service, data, id) => ({ service, entity_id: id || ID, service_data: data });

test('schedule days: shorthands of the Scheduler expand to plain days in week order', () => {
  assert.deepEqual(S.expandDays(['daily']), S.DAYS);
  assert.deepEqual(S.expandDays(['workday']), ['mon', 'tue', 'wed', 'thu', 'fri']);
  assert.deepEqual(S.expandDays(['weekend']), ['sat', 'sun']);
  assert.deepEqual(S.expandDays(['sun', 'mon', 'wed']), ['mon', 'wed', 'sun']);
  assert.deepEqual(S.expandDays(undefined), S.DAYS);
  assert.deepEqual(S.expandDays(['Monday', 'fri']), ['mon', 'fri']);
});

test('schedule time: a clock time is cut to HH:MM, sunrise and sunset are not clock times', () => {
  assert.equal(S.clockOf('07:30:00'), '07:30');
  assert.equal(S.clockOf('7:05'), '07:05');
  assert.equal(S.clockOf('sunrise+00:30:00'), null);
  assert.equal(S.clockOf(null), null);
});

test('reading a slot: what it does to the thermostat comes from its climate actions', () => {
  assert.deepEqual(S.readSlot(slot('06:00:00', [act('climate.set_hvac_mode', { hvac_mode: 'heat_cool' }), act('climate.set_temperature', { target_temp_low: 66, target_temp_high: 71 })]), ID), { mode: 'heat_cool', low: 66, high: 71 });
  assert.deepEqual(S.readSlot(slot('06:00:00', [act('climate.set_hvac_mode', { hvac_mode: 'cool' }), act('climate.set_temperature', { temperature: 72 })]), ID), { mode: 'cool', temp: 72 });
  assert.deepEqual(S.readSlot(slot('06:00:00', [act('climate.set_temperature', { temperature: '70', hvac_mode: 'heat' })]), ID), { mode: 'heat', temp: 70 });
  assert.deepEqual(S.readSlot(slot('06:00:00', [act('climate.set_temperature', { temperature: 70 })]), ID), { mode: 'keep', temp: 70 });
  assert.deepEqual(S.readSlot(slot('06:00:00', [act('climate.turn_off', {})]), ID), { mode: 'off' });
  assert.deepEqual(S.readSlot(slot('06:00:00', [act('climate.set_hvac_mode', { hvac_mode: 'off' })]), ID), { mode: 'off' });
  assert.deepEqual(S.readSlot(slot('06:00:00', [act('climate.set_preset_mode', { preset_mode: 'eco' })]), ID), { mode: 'preset', preset: 'eco' });
  assert.equal(S.readSlot(slot('06:00:00', [act('light.turn_on', {}, 'light.kitchen')]), ID), null);              // another device: not ours
  assert.equal(S.readSlot(slot('06:00:00', [act('climate.set_temperature', { temperature: 70 }, 'climate.bedroom')]), ID), null);
  assert.deepEqual(S.readSlot(slot('06:00:00', [{ service: 'climate.set_temperature', entity_id: [ID, 'climate.bedroom'], service_data: { temperature: 71 } }]), ID), { mode: 'keep', temp: 71 });
});

test('building the actions: a mode first, then the degrees; leaving a preset comes first', () => {
  const cool = S.buildActions({ mode: 'cool', temp: 72 }, ID);
  assert.deepEqual(cool.map(a => a.service), ['climate.set_hvac_mode', 'climate.set_temperature']);
  assert.deepEqual(cool[1].service_data, { temperature: 72 });
  const range = S.buildActions({ mode: 'heat_cool', low: 62, high: 80 }, ID, 'none');
  assert.deepEqual(range.map(a => a.service), ['climate.set_preset_mode', 'climate.set_hvac_mode', 'climate.set_temperature']);
  assert.deepEqual(range[0].service_data, { preset_mode: 'none' });
  assert.deepEqual(range[2].service_data, { target_temp_low: 62, target_temp_high: 80 });
  assert.deepEqual(S.buildActions({ mode: 'off' }, ID).map(a => a.service_data), [{ hvac_mode: 'off' }]);
  const pre = S.buildActions({ mode: 'preset', preset: 'eco' }, ID, 'none');                    // a preset does not leave itself first
  assert.deepEqual(pre.map(a => a.service_data), [{ preset_mode: 'eco' }]);
  assert.ok(S.buildActions({ mode: 'heat', temp: 66 }, ID).every(a => a.entity_id === ID));
});

test('what is built reads back the same', () => {
  for (const e of [{ mode: 'cool', temp: 72 }, { mode: 'heat', temp: 66 }, { mode: 'heat_cool', low: 66, high: 71 }, { mode: 'off' }, { mode: 'preset', preset: 'eco' }, { mode: 'keep', temp: 70 }]) {
    const back = S.readSlot(slot('07:00:00', S.buildActions(e, ID, 'none')), ID);
    assert.deepEqual(back, Object.assign({}, e, e.mode === 'keep' ? {} : {}), JSON.stringify(e));
  }
});

test('entries: one per time slot that acts on this thermostat, a day lists them earliest first', () => {
  const schedules = [
    { schedule_id: 'a1', entity_id: 'switch.schedule_a1', name: 'Sleep', weekdays: ['daily'], enabled: true, timeslots: [slot('21:45:00', S.buildActions({ mode: 'heat_cool', low: 66, high: 70 }, ID))] },
    { schedule_id: 'b2', name: 'Comfort', weekdays: ['mon', 'tue'], enabled: false, timeslots: [slot('06:00:00', S.buildActions({ mode: 'heat_cool', low: 66, high: 71 }, ID)), slot('19:00:00', S.buildActions({ mode: 'heat_cool', low: 66, high: 71 }, ID))] },
    { schedule_id: 'c3', name: 'Kitchen light', weekdays: ['daily'], enabled: true, timeslots: [slot('07:00:00', [act('light.turn_on', {}, 'light.kitchen')])] },
  ];
  const all = S.entriesFor(schedules, ID);
  assert.equal(all.length, 3);      // Sleep + the two slots of Comfort; the kitchen light is not ours
  assert.equal(all.filter(e => e.sid === 'b2').length, 2);
  assert.equal(all.find(e => e.sid === 'b2' && e.slot === 1).slots, 2);
  assert.equal(all.find(e => e.sid === 'b2').sw, 'switch.schedule_b2');                          // no entity id in the list: derived
  assert.equal(all.find(e => e.sid === 'b2').enabled, false);
  assert.deepEqual(S.onDay(all, 'mon').map(e => e.time), ['06:00', '19:00', '21:45']);
  assert.deepEqual(S.onDay(all, 'sun').map(e => e.name), ['Sleep']);
});

test('profiles: Eco is a wide range, the user changes win, Celsius has its own numbers', () => {
  const f = S.profileDefaults('°F');
  assert.deepEqual(f.eco, { low: 62, high: 80 });
  assert.ok(f.comfort.low > f.sleep.low - 3 && f.comfort.high >= f.sleep.high);
  const c = S.profileDefaults('°C', { eco: { low: '16', high: 26 } });
  assert.deepEqual(c.eco, { low: 16, high: 26 });
  assert.deepEqual(c.comfort, { low: 20, high: 23 });
  assert.equal(S.matchProfile('Eco'), 'eco');
  assert.equal(S.matchProfile('  SLEEP '), 'sleep');
  assert.equal(S.matchProfile('Schlafen', { sleep: 'Schlafen' }), 'sleep');
  assert.equal(S.matchProfile('Party'), '');
});

test('icons follow the name, a slot is cleaned of empty fields before it is written back', () => {
  assert.equal(S.iconFor('Eco'), 'eco');
  assert.equal(S.iconFor('Night mode'), 'sleep');
  assert.equal(S.iconFor('Vacation'), 'away');
  assert.equal(S.iconFor('Morning'), 'comfort');
  assert.equal(S.iconFor('X'), 'clock');
  assert.deepEqual(S.cleanSlot({ start: '06:00:00', stop: null, conditions: [], condition_type: 'and', actions: [] }), { start: '06:00:00', condition_type: 'and', actions: [] });
});

test('saving an edit keeps what else the slot does: only the thermostat calls of the card are replaced', () => {
  const own = S.buildActions({ mode: 'heat', temp: 21 }, 'climate.a', 'none');
  const light = { service: 'light.turn_on', entity_id: 'light.hall', service_data: {} }, fan = { service: 'climate.set_fan_mode', entity_id: 'climate.a', service_data: { fan_mode: 'low' } }, scene = { service: 'scene.turn_on', entity_id: 'scene.night', service_data: {} };
  const old = [light, { service: 'climate.set_preset_mode', entity_id: 'climate.a', service_data: { preset_mode: 'eco' } }, fan, { service: 'climate.set_temperature', entity_id: ['climate.a', 'climate.b'], service_data: { temperature: 19 } }, scene];
  const m = S.mergeActions(old, own, 'climate.a');
  assert.deepEqual(m.slice(0, 1), [light], 'what came before stays first');
  assert.deepEqual(m.slice(1, 1 + own.length), own, 'the card calls sit where its first old call was');
  assert.ok(m.includes(fan) && m.includes(scene) && m.includes(light), 'the fan mode, the scene and the light are still there');
  assert.deepEqual(m.filter(a => a.entity_id.length === 1 && a.entity_id[0] === 'climate.b').map(a => a.service_data.temperature), [19], 'a call for two thermostats keeps the other one');
  assert.equal(m.filter(a => [].concat(a.entity_id).includes('climate.a') && ['climate.set_temperature', 'climate.set_hvac_mode', 'climate.set_preset_mode'].includes(a.service)).length, own.length, 'no old card call of this thermostat is left');
  assert.equal(S.readSlot({ actions: m }, 'climate.a').temp, 21, 'the entry reads back what was written');
  assert.deepEqual(S.mergeActions([light], own, 'climate.a'), [light, ...own], 'a slot without card calls gets them at the end');
  assert.deepEqual(S.mergeActions(undefined, own, 'climate.a'), own);
  assert.equal(old.length, 5, 'the input is not changed'); assert.deepEqual(old[3].entity_id, ['climate.a', 'climate.b']);
});

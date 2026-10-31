'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const LS = require('../src/okie-light-sched.js');
const LM = require('../src/okie-light-modes.js');
const [cozy, sleep] = LM.defaultModes();

test('light schedules: a spec is made safe', () => {
  assert.deepEqual(LS.cleanSpec({ kind: 'time', time: '7:05', days: ['sat', 'mon', 'x'] }), { kind: 'time', days: ['mon', 'sat'], dark: false, time: '07:05' });
  assert.equal(LS.cleanSpec({ kind: 'time', time: '25:00' }), null);
  assert.equal(LS.cleanSpec({ kind: 'time' }), null);
  assert.deepEqual(LS.cleanSpec({ kind: 'time', time: '20:30:00', days: [] }).days.length, 7, 'no days means every day');
  const sun = LS.cleanSpec({ kind: 'sun', event: 'sunrise', offset: 900, dark: true });
  assert.deepEqual(sun, { kind: 'sun', days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], dark: false, event: 'sunrise', offset: 360 }, 'offset is capped, dark makes no sense at sunrise');
  assert.equal(LS.cleanSpec({ kind: 'sun', event: 'banana' }).event, 'sunset');
  assert.equal(LS.cleanSpec({ kind: 'event', when: { entity: 'person.paul', to: 'home', forMin: 7 } }).when.forMin, 0, 'only the offered waits');
  assert.equal(LS.cleanSpec({ kind: 'event', when: { entity: 'not an entity', to: 'on' } }), null);
  assert.equal(LS.cleanSpec({ kind: 'event', when: { entity: 'light.a' } }), null, 'a state to wait for is needed');
  assert.equal(LS.cleanSpec(null), null);
});

test('light schedules: the automation Home Assistant runs', () => {
  const a = LS.buildAuto({ kind: 'sun', event: 'sunset', offset: -30, days: ['mon', 'tue', 'wed', 'thu', 'fri'] }, cozy, 'okie_lm_cozy_ab1');
  assert.equal(a.id, 'okie_lm_cozy_ab1'); assert.equal(a.mode, 'single');
  assert.deepEqual(a.trigger, [{ platform: 'sun', event: 'sunset', offset: '-00:30:00' }]);
  assert.deepEqual(a.condition, [{ condition: 'time', weekday: ['mon', 'tue', 'wed', 'thu', 'fri'] }]);
  assert.deepEqual(a.action, [{ service: 'script.turn_on', target: { entity_id: 'script.govee_cozy_lights' } }]);
  assert.equal(a.alias, 'Okie · Cozy lights · 30 min before sunset, Mon - Fri');
  const t = LS.buildAuto({ kind: 'time', time: '22:00', dark: true }, sleep, 'x');
  assert.deepEqual(t.trigger, [{ platform: 'time', at: '22:00:00' }]);
  assert.deepEqual(t.condition, [{ condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' }], 'every day: no weekday condition');
  const e = LS.buildAuto({ kind: 'event', when: { entity: 'person.paul', to: 'home', forMin: 0 } }, cozy, 'y', { 'person.paul': { attributes: { friendly_name: 'Paul' } } });
  assert.deepEqual(e.trigger, [{ platform: 'state', entity_id: 'person.paul', to: 'home' }]); assert.match(e.alias, /when Paul is home/);
  const f = LS.buildAuto({ kind: 'event', when: { entity: 'binary_sensor.hall', to: 'off', forMin: 90 } }, cozy, 'z');
  // forMin 90 is not one of the offered waits: it is cleaned to 0
  assert.deepEqual(f.trigger[0].for, undefined);
  const g = LS.buildAuto({ kind: 'event', when: { entity: 'binary_sensor.hall', to: 'off', forMin: 60 } }, cozy, 'z');
  assert.deepEqual(g.trigger[0].for, { hours: 1, minutes: 0, seconds: 0 });
  assert.equal(LS.offsetString(0), ''); assert.equal(LS.offsetString(75), '01:15:00'); assert.equal(LS.offsetString(-5), '-00:05:00');
});

test('light schedules: lights and rooms become target and data', () => {
  const m = LM.cleanMode({ id: 'm', name: 'Movie', run: [{ type: 'lights', entities: ['light.a', 'light.b'], state: 'on', brightness: 40 }, { type: 'area', area: 'kitchen', state: 'off' }, { type: 'scene', entity: 'scene.movie' }] });
  assert.deepEqual(LS.autoActions(m), [
    { service: 'light.turn_on', target: { entity_id: ['light.a', 'light.b'] }, data: { brightness_pct: 40 } },
    { service: 'light.turn_off', target: { area_id: 'kitchen' } },
    { service: 'scene.turn_on', target: { entity_id: 'scene.movie' } }]);
});

test('light schedules: our automation is read back, others are left alone', () => {
  const spec = { kind: 'event', days: ['sat', 'sun'], dark: true, when: { entity: 'binary_sensor.patio_motion', to: 'on', forMin: 5 } };
  const cfg = LS.buildAuto(spec, sleep, 'okie_lm_sleep_q1');
  const back = LS.parseAuto(JSON.parse(JSON.stringify(cfg)));
  assert.equal(back.id, 'okie_lm_sleep_q1'); assert.equal(back.modeId, 'sleep'); assert.deepEqual(back.spec, LS.cleanSpec(spec));
  assert.equal(LS.parseAuto({ id: 'mine', alias: 'x', description: 'My own automation' }), null);
  assert.equal(LS.parseAuto({ id: 'k', description: 'okie-lm:{broken' }), null);
  assert.equal(LS.parseAuto({ id: 'k', description: 'okie-lm:{"mode":"x","spec":{"kind":"time","time":"99:99"}}' }), null);
  assert.equal(LS.parseAuto(null), null);
  const ids = []; for (let i = 0; i < 50; i++) ids.push(LS.autoId('cozy mode!', ids));
  assert.ok(ids.every(x => /^okie_lm_cozy_mode__?[a-z0-9]+$/.test(x) || /^okie_lm_cozy_mode_[a-z0-9]+$/.test(x)) && new Set(ids).size === 50);
});

test('light schedules: what an entity can become, and which entities are offered', () => {
  const st = {
    'person.paul': {}, 'binary_sensor.hall_motion': { attributes: { device_class: 'motion' } }, 'binary_sensor.kitchen_window': { attributes: { device_class: 'window' } },
    'binary_sensor.smoke': { attributes: { device_class: 'smoke' } }, 'binary_sensor.diag': { attributes: { entity_category: 'diagnostic' } }, 'binary_sensor.washer_done': {},
    'light.lamp': { attributes: { friendly_name: 'Lamp' } }, 'switch.fan': {}, 'media_player.tv': {}, 'lock.front': {}, 'sensor.temp': {},
  };
  const keys = e => LS.stateChoices(e, st).map(c => c.id + ':' + c.key).join();
  assert.equal(keys('person.paul'), 'home:arrive,not_home:leave');
  assert.equal(keys('binary_sensor.hall_motion'), 'on:motion_on,off:motion_off');
  assert.equal(keys('binary_sensor.kitchen_window'), 'on:opens,off:closes');
  assert.equal(keys('lock.front'), 'locked:locked,unlocked:unlocked');
  assert.equal(keys('media_player.tv'), 'playing:playing,paused:paused,idle:idle,off:off,on:on');
  assert.equal(keys('light.lamp'), 'on:on,off:off');
  const groups = LS.eventGroups(st).map(x => x.key + '=' + x.ids.join('|'));
  assert.deepEqual(groups, ['people=person.paul', 'motion=binary_sensor.hall_motion', 'doors=binary_sensor.kitchen_window|lock.front', 'devices=light.lamp|switch.fan', 'media=media_player.tv', 'other=binary_sensor.washer_done']);
});

test('light schedules: the history merges every source into one list of runs', () => {
  const now = Date.parse('2026-10-12T22:00:00Z'), sec = ms => ms / 1000;
  const modes = [cozy, sleep];
  const rows = [
    { when: sec(now - 3600e3), entity_id: 'script.govee_cozy_lights', context_user_id: 'u1' },                                               // tapped in the app (seen by a user id)
    { when: sec(now - 3600e3 + 20e3), entity_id: 'script.govee_cozy_lights', context_user_id: 'u1' },                                         // the same run, 20 s later in the log
    { when: sec(now - 26 * 3600e3), entity_id: 'script.govee_lets_go_to_sleep', context_domain: 'automation' },                              // started by an automation
    { when: sec(now - 26 * 3600e3 + 2e3), entity_id: 'automation.okie_lm_sleep_x' },                                                          // and the automation itself
    { when: sec(now - 5 * 3600e3), entity_id: 'script.govee_cozy_lights' },                                                                   // from somewhere else
    { when: sec(now - 9 * 86400e3), entity_id: 'script.govee_cozy_lights' },                                                                  // too old
    { when: sec(now - 4 * 3600e3), entity_id: 'script.unrelated' },
  ];
  const local = [{ id: 'cozy', at: now - 3600e3 + 5e3 }, { id: 'gone', at: now - 1000 }];
  const runs = LS.mergeRuns(modes, rows, local, { 'automation.okie_lm_sleep_x': 'sleep' }, now, 7);
  assert.deepEqual(runs.map(r => r.modeId + ':' + r.by), ['cozy:you', 'cozy:elsewhere', 'sleep:schedule']);
  assert.ok(runs[0].at > runs[1].at && runs[1].at > runs[2].at, 'newest first');
  const days = LS.bucketDays(runs, now, 7);
  assert.equal(days.length, 7); assert.equal(days[6].today, true); assert.equal(days.reduce((s, d) => s + d.count, 0), 3);
  assert.equal(days[6].count, 2, 'two runs today');
  assert.deepEqual(LS.mergeRuns(modes, [], [], {}, now, 7), []);
  assert.deepEqual(LS.mergeRuns(modes, undefined, undefined, undefined, now), []);
});

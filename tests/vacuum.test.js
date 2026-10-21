'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../src/okie-vacuum.js');

const st = (state, attrs) => ({ state, attributes: attrs || {} });
// what the user's Roomba (iRobot integration) really has next to it
const states = {
  'vacuum.robo_home': st('docked', { bin_full: false, tank_level: 70, detected_pad: 'reusableWet', supported_features: 13084 }),
  'sensor.robo_home_battery': st('100', { device_class: 'battery', unit_of_measurement: '%' }),
  'binary_sensor.robo_home_charging': st('on'),
  'binary_sensor.robo_home_bin_full': st('off'),
  'sensor.robo_home_tank_level': st('70', { unit_of_measurement: '%' }),
  'sensor.robo_home_battery_cycles': st('unknown'),
  'sensor.robo_home_total_missions': st('420', { unit_of_measurement: 'Missions' }),
  'sensor.robo_home_successful_missions': st('273'),
  'sensor.robo_home_canceled_missions': st('66'),
  'sensor.robo_home_failed_missions': st('80'),
  'sensor.robo_home_scrubs': st('9'),
  'sensor.robo_home_average_mission_time': st('419', { unit_of_measurement: 'min' }),
  'sensor.robo_home_last_mission_start_time': st('2026-10-11T19:59:55+00:00', { device_class: 'timestamp' }),
  'sensor.other_battery': st('50'),
  'light.kitchen': st('on'),
};

test('vacuum: the sensors of its device are found by the registry, or by the name they share', () => {
  const byName = V.siblings(states, 'vacuum.robo_home');
  assert.ok(byName.includes('sensor.robo_home_battery') && byName.includes('binary_sensor.robo_home_charging'));
  assert.ok(!byName.includes('sensor.other_battery') && !byName.includes('light.kitchen') && !byName.includes('vacuum.robo_home'));
  const reg = { 'vacuum.robo_home': { device_id: 'D1' }, 'sensor.other_battery': { device_id: 'D1' } };       // another name, same device: still found
  assert.ok(V.siblings(states, 'vacuum.robo_home', reg).includes('sensor.other_battery'));
});

test('vacuum: every sensor gets its part (battery, charging, missions, last clean)', () => {
  const ids = V.siblings(states, 'vacuum.robo_home'), r = V.roles(states, ids);
  assert.equal(r.battery, 'sensor.robo_home_battery'); assert.equal(r.charging, 'binary_sensor.robo_home_charging'); assert.equal(r.binFull, 'binary_sensor.robo_home_bin_full');
  assert.equal(r.tank, 'sensor.robo_home_tank_level'); assert.equal(r.total, 'sensor.robo_home_total_missions'); assert.equal(r.ok, 'sensor.robo_home_successful_missions');
  assert.equal(r.canceled, 'sensor.robo_home_canceled_missions'); assert.equal(r.failed, 'sensor.robo_home_failed_missions'); assert.equal(r.avg, 'sensor.robo_home_average_mission_time');
  assert.equal(r.cycles, 'sensor.robo_home_battery_cycles', 'battery cycles is not the battery'); assert.equal(r.last, 'sensor.robo_home_last_mission_start_time');
  const other = V.roles({ 'sensor.x_level': st('80', { device_class: 'battery' }), 'binary_sensor.x_dock': st('on', { device_class: 'battery_charging' }) }, ['sensor.x_level', 'binary_sensor.x_dock']);
  assert.equal(other.battery, 'sensor.x_level'); assert.equal(other.charging, 'binary_sensor.x_dock');          // by device class when the name says nothing
});

test('vacuum: numbers, battery and charging', () => {
  assert.equal(V.numberOf(states, 'sensor.robo_home_total_missions'), 420);
  assert.equal(V.numberOf(states, 'sensor.robo_home_battery_cycles'), null);                      // unknown
  assert.equal(V.numberOf(states, 'sensor.missing'), null);
  const r = V.roles(states, V.siblings(states, 'vacuum.robo_home'));
  assert.equal(V.batteryOf(states, states['vacuum.robo_home'], r), 100);
  assert.equal(V.batteryOf(states, { attributes: { battery_level: 42.4 } }, {}), 42);
  assert.equal(V.batteryOf(states, { attributes: {} }, {}), null);
  assert.equal(V.isCharging(states, states['vacuum.robo_home'], r), true);
  assert.equal(V.isCharging(states, { attributes: { battery_icon: 'mdi:battery-charging-80' } }, {}), true);
  assert.equal(V.isCharging(states, { attributes: {} }, {}), null);
  assert.equal(V.batteryTone(10), 'low'); assert.equal(V.batteryTone(35), 'mid'); assert.equal(V.batteryTone(80), 'good'); assert.equal(V.batteryTone(null), 'neutral');
});

test('vacuum: pad names, the drawing state and the mission bar', () => {
  assert.equal(V.padLabel('reusableWet'), 'Reusable wet'); assert.equal(V.padLabel('disposable_dry'), 'Disposable dry');
  assert.equal(V.padLabel('invalid'), ''); assert.equal(V.padLabel(null), ''); assert.equal(V.padLabel('none'), '');
  assert.equal(V.visualState('docked'), 'docked'); assert.equal(V.visualState('cleaning'), 'cleaning'); assert.equal(V.visualState('returning'), 'returning');
  assert.equal(V.visualState('paused'), 'paused'); assert.equal(V.visualState('error'), 'error'); assert.equal(V.visualState('idle'), 'idle'); assert.equal(V.visualState('whatever'), 'idle');
  const sh = V.missionShares(273, 66, 80, 420);
  assert.ok(Math.abs(sh[0] - 65) < 0.01 && Math.abs(sh[1] - 15.714) < 0.01 && Math.abs(sh[2] - 19.048) < 0.01);
  assert.deepEqual(V.missionShares(0, 0, 0, 0), [0, 0, 0]);
  assert.deepEqual(V.missionShares(5, 0, 0, null).map(Math.round), [100, 0, 0]);
});

test('vacuum: long times become hours, other numbers keep their unit', () => {
  assert.equal(V.fmtStat(419, 'min'), '7 h'); assert.equal(V.fmtStat(95, 'min'), '95 min'); assert.equal(V.fmtStat(130, 'min'), '2.2 h');
  assert.equal(V.fmtStat(9, ''), '9'); assert.equal(V.fmtStat(12.34, 'm²'), '12.3 m²'); assert.equal(V.fmtStat(null, 'h'), '–');
});

test('vacuum: what needs attention, most important first', () => {
  assert.deepEqual(V.attention('docked', { bin_full: false, tank_level: 70, tank_present: true, lid_closed: true }, 100, true), []);
  assert.deepEqual(V.attention('docked', { bin_full: true }, 100, true).map(x => x.id), ['bin_full']);
  assert.deepEqual(V.attention('docked', { bin_present: false, bin_full: true }, 100, true).map(x => x.id), ['bin_gone']);           // a missing bin is not also "full"
  assert.deepEqual(V.attention('docked', { tank_level: 10, tank_present: true }, 100, true).map(x => x.id), ['tank_low']);
  assert.deepEqual(V.attention('docked', { tank_level: 0, tank_present: false }, 100, true), []);                                   // no tank on the robot: nothing to refill
  assert.deepEqual(V.attention('docked', { lid_closed: false }, 100, true).map(x => x.id), ['lid_open']);
  assert.deepEqual(V.attention('cleaning', {}, 12, false).map(x => x.id), ['battery_low']);
  assert.deepEqual(V.attention('docked', {}, 12, true), [], 'low but charging on the dock is fine');
  const e = V.attention('error', { error: 'Stuck on a cliff', bin_full: true }, 50, false);
  assert.deepEqual(e.map(x => x.id), ['error', 'bin_full']);
  assert.equal(e[0].detail, 'Stuck on a cliff');
});

test('vacuum: the cleans of the history run from the start to the moment it rests again, newest first', () => {
  const m = 60000, now = 100 * 3600e3, s = (state, minAgo) => ({ s: state, lu: (now - minAgo * m) / 1000 });
  const rows = [s('docked', 3000), s('cleaning', 2900), s('returning', 2880), s('docked', 2870), s('cleaning', 130), s('paused', 128), s('cleaning', 127), s('returning', 124), s('docked', 121)];
  const runs = V.runsFromHistory(rows, now);
  assert.equal(runs.length, 2);
  assert.deepEqual(runs.map(r => r.mins), [9, 30]);                                  // newest first; the pause belongs to the clean
  assert.equal(runs[0].ended, 'docked'); assert.equal(runs[0].open, false);
  const going = V.runsFromHistory([s('docked', 60), s('cleaning', 20)], now);         // still running now
  assert.equal(going.length, 1); assert.equal(going[0].open, true); assert.equal(going[0].mins, 20);
  const bad = V.runsFromHistory([s('docked', 60), s('cleaning', 20), s('error', 15)], now);
  assert.equal(bad[0].ended, 'error');
  assert.deepEqual(V.runsFromHistory([], now), []);
  assert.equal(V.runsFromHistory([{ state: 'cleaning', last_updated: new Date(now - 5 * m).toISOString() }, { state: 'docked', last_updated: new Date(now).toISOString() }], now)[0].mins, 5, 'the long history format works too');
});

test('vacuum: the next scheduled clean is the earliest enabled schedule that acts on it', () => {
  const sw = (state, entities, next, name) => ({ state, attributes: { entities, next_trigger: next, friendly_name: name } });
  const S = {
    'switch.schedule_a': sw('on', ['vacuum.r'], '2026-10-12T20:00:00+00:00', 'Cat litter'),
    'switch.schedule_b': sw('on', ['vacuum.r', 'light.x'], '2026-10-12T13:30:00+00:00', 'Morning'),
    'switch.schedule_c': sw('off', ['vacuum.r'], '2026-10-12T08:00:00+00:00', 'Off one'),
    'switch.schedule_d': sw('on', ['climate.t'], '2026-10-12T07:00:00+00:00', 'Thermostat'),
    'switch.schedule_e': sw('on', ['vacuum.r'], null, 'No trigger'),
  };
  const n = V.nextSchedule(S, 'vacuum.r');
  assert.equal(n.name, 'Morning'); assert.equal(n.ts, Date.parse('2026-10-12T13:30:00+00:00'));
  assert.equal(V.nextSchedule(S, 'vacuum.other'), null);
  assert.equal(V.nextSchedule({}, 'vacuum.r'), null);
});

// what Roomba+ really puts next to the user's Combo j7+ (read from the server)
const RP = (() => {
  const s = {};
  s['vacuum.robo_home'] = st('docked', { friendly_name: 'Home Robot', supported_features: 29468, favorites: [
    { id: '15cf250c', name: 'Vacuum and Mop Everywhere' }, { id: '3dcbfbc8', name: 'Around Litter box' }, { id: 'b7198729', name: 'Vacuum Everywhere' }] });
  s['select.robo_home_prime_cleaning_mode'] = st('unknown', { options: ['vacuum', 'mop', 'vacuum_and_mop', 'vacuum_then_mop'] });
  s['select.living_room_robo_home_cloud_zone_x1e'] = st('Bedroom', { options: ['Bedroom', 'Living Room', 'Kitchen ', 'Cat Litter'], region_icons: { Bedroom: 'mdi:bed-king', 'Living Room': 'mdi:sofa' }, region_areas_m2: { Bedroom: 8.9, 'Living Room': 22.1 }, is_active_map: true, pmap_id: 'x1E' });
  s['select.living_room_robo_home_cleaning_passes'] = st('One pass', { options: ['Auto', 'One pass', 'Two passes'], friendly_name: 'Home Robot Setting – Cleaning passes' });
  s['select.living_room_robo_home_reusable_pad_wetness'] = st('2', { options: ['1', '2', '3'], friendly_name: 'Home Robot Reusable pad wetness' });
  s['switch.living_room_robo_home_edge_clean'] = st('on', { friendly_name: 'Home Robot Setting – Edge clean' });
  s['switch.living_room_robo_home_child_lock'] = st('off', { friendly_name: 'Home Robot Setting – Child lock' });
  s['button.living_room_robo_home_clean_smart_zone'] = st('unknown');
  s['button.living_room_robo_home_fav_15cf250c'] = st('unknown'); s['button.living_room_robo_home_fav_3dcbfbc8'] = st('unknown');
  s['button.living_room_robo_home_reset_filter'] = st('unknown'); s['button.living_room_robo_home_reset_brush'] = st('unknown'); s['button.living_room_robo_home_reset_clean_base_bag'] = st('unknown');
  s['sensor.living_room_robo_home_filter_remaining_hours'] = st('0', { threshold_hours: 52, max_hours: 53, unit_of_measurement: 'h', friendly_name: 'Home Robot Maintenance – Filter' });
  s['sensor.living_room_robo_home_brush_remaining_hours'] = st('259', { threshold_hours: 312, max_hours: 312, unit_of_measurement: 'h', friendly_name: 'Home Robot Maintenance – Brushes' });
  s['sensor.living_room_robo_home_part_dirt_bag'] = st('0', { threshold_hours: 29, max_hours: 53, unit_of_measurement: 'h', friendly_name: 'Home Robot Maintenance – Dust Bag' });
  s['sensor.living_room_robo_home_part_edge_brush'] = st('103', {});                                     // no max: not a countdown we can draw
  s['binary_sensor.living_room_robo_home_maintenance_due'] = st('on', { due: ['filter', 'clean_base_bag'] });
  s['sensor.living_room_robo_home_next_clean'] = st('2026-10-12T20:00:00+00:00', { device_class: 'timestamp' });
  s['image.robo_home_map'] = st('2026-10-11T23:29:01+00:00', { entity_picture: '/api/image_proxy/image.robo_home_map?token=a' });
  s['image.robo_home_rooms_map'] = st('2026-10-11T23:29:01+00:00', { entity_picture: '/api/image_proxy/image.robo_home_rooms_map?token=b' });
  s['image.living_room_robo_home_coverage_map'] = st('unavailable', { entity_picture: '/api/image_proxy/x?token=c' });
  s['sensor.other_robot_filter_remaining_hours'] = st('9', { max_hours: 10 });
  s['switch.kitchen_light'] = st('on');
  return s;
})();
// the entity registry puts all of them on one device although half of them start with the room's name
const RPreg = {}; Object.keys(RP).forEach(id => { if (!/other_robot|kitchen_light/.test(id)) RPreg[id] = { device_id: 'DEV' }; });

test('vacuum+: everything Roomba+ puts next to the robot is found through the device', () => {
  const e = V.ext(RP, 'vacuum.robo_home', RPreg);
  assert.deepEqual(e.favorites.map(f => f.name), ['Vacuum and Mop Everywhere', 'Around Litter box', 'Vacuum Everywhere']);
  assert.equal(e.favBtn['15cf250c'], 'button.living_room_robo_home_fav_15cf250c'); assert.equal(e.favBtn['b7198729'], undefined);
  assert.equal(e.modeSel, 'select.robo_home_prime_cleaning_mode'); assert.deepEqual(e.modes, ['vacuum', 'mop', 'vacuum_and_mop', 'vacuum_then_mop']);
  assert.equal(e.zoneSel, 'select.living_room_robo_home_cloud_zone_x1e'); assert.equal(e.zoneBtn, 'button.living_room_robo_home_clean_smart_zone');
  assert.deepEqual(e.rooms, ['Bedroom', 'Living Room']); assert.deepEqual(e.zones, ['Kitchen ', 'Cat Litter']);
  assert.equal(e.passesSel, 'select.living_room_robo_home_cleaning_passes'); assert.deepEqual(e.padSels, ['select.living_room_robo_home_reusable_pad_wetness']);
  assert.deepEqual(e.switches.map(x => x.label + ':' + x.on), ['Edge clean:true', 'Child lock:false']);
  assert.deepEqual(e.maps.map(m => m.kind), ['path', 'rooms'], 'the unavailable coverage map is left out, the order is path, rooms, coverage');
  assert.equal(e.nextClean, Date.parse('2026-10-12T20:00:00+00:00'));
});

test('vacuum+: maintenance counters know what is due and which button resets them', () => {
  const e = V.ext(RP, 'vacuum.robo_home', RPreg), by = Object.fromEntries(e.maint.map(m => [m.key, m]));
  assert.deepEqual(Object.keys(by).sort(), ['brush', 'clean_base_bag', 'filter'], 'a counter without a maximum is not drawn');
  assert.equal(by.filter.due, true); assert.equal(by.filter.reset, 'button.living_room_robo_home_reset_filter'); assert.equal(by.filter.label, 'Filter');
  assert.equal(by.brush.due, false); assert.equal(by.brush.remaining, 259); assert.equal(by.brush.max, 312); assert.equal(by.brush.label, 'Brushes');
  assert.equal(by.clean_base_bag.due, true); assert.equal(by.clean_base_bag.label, 'Dust Bag'); assert.equal(by.clean_base_bag.reset, 'button.living_room_robo_home_reset_clean_base_bag');
  assert.deepEqual(e.due, ['filter', 'clean_base_bag']);
  assert.deepEqual(V.attention('docked', {}, 100, true, e.due).map(x => x.id + ':' + (x.detail || '')), ['maintenance:filter, clean_base_bag']);
});

test('vacuum+: with the plain iRobot integration the extras are simply missing', () => {
  const plain = { 'vacuum.robo_home': st('docked', { friendly_name: 'Home Robot' }), 'sensor.robo_home_battery': st('100') };
  const e = V.ext(plain, 'vacuum.robo_home', {});
  assert.deepEqual([e.favorites, e.maint, e.maps, e.switches, e.rooms, e.zones], [[], [], [], [], [], []]);
  assert.equal(e.modeSel, null); assert.equal(e.zoneSel, null); assert.equal(e.nextClean, null);
  assert.deepEqual(V.members(plain, 'vacuum.robo_home', {}), ['sensor.robo_home_battery']);
});

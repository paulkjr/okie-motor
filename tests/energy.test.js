'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const E = require('../src/okie-energy.js');

const prefs = {
  energy_sources: [
    { type: 'grid', flow_from: [{ stat_energy_from: 'sensor.grid_in' }], flow_to: [{ stat_energy_to: 'sensor.grid_out' }] },
    { type: 'solar', stat_energy_from: 'sensor.solar' },
    { type: 'battery', stat_energy_from: 'sensor.bat_out', stat_energy_to: 'sensor.bat_in' },
  ],
  device_consumption: [{ stat_consumption: 'sensor.fridge' }],
};

test('sources are read from HA energy preferences, including the older grid shape', () => {
  const s = E.sourcesFromPrefs(prefs);
  assert.deepEqual(s.gridIn, ['sensor.grid_in']); assert.deepEqual(s.gridOut, ['sensor.grid_out']);
  assert.deepEqual(s.solar, ['sensor.solar']); assert.deepEqual(s.batteryIn, ['sensor.bat_in']); assert.deepEqual(s.batteryOut, ['sensor.bat_out']);
  assert.deepEqual(s.devices, ['sensor.fridge']);
  assert.equal(E.allIds(s).length, 6);
  const old = E.sourcesFromPrefs({ energy_sources: [{ type: 'grid', stat_energy_from: 'sensor.old_in', stat_energy_to: 'sensor.old_out', flow_from: [], flow_to: [] }] });
  assert.deepEqual(old.gridIn, ['sensor.old_in']); assert.deepEqual(old.gridOut, ['sensor.old_out']);
  assert.equal(E.allIds(E.sourcesFromPrefs(null)).length, 0);
});

test('home consumption: in minus out, never negative', () => {
  assert.equal(E.homeConsumption({ gridIn: 5, gridOut: 2, solar: 6, batteryIn: 1, batteryOut: 0.5 }), 8.5);
  assert.equal(E.homeConsumption({ gridIn: 0, gridOut: 9, solar: 2, batteryIn: 0, batteryOut: 0 }), 0);
});

test('summary adds up several statistics and reports the solar self-use share', () => {
  const stats = { 'sensor.grid_in': [{ change: 1 }, { change: 2 }], 'sensor.grid_out': [{ change: 1 }], 'sensor.solar': [{ change: 4 }, { change: 1 }], 'sensor.bat_in': [{ change: 0 }], 'sensor.bat_out': [{ change: 0.5 }] };
  const sm = E.summarize(stats, E.sourcesFromPrefs(prefs));
  assert.equal(sm.gridIn, 3); assert.equal(sm.solar, 5); assert.equal(sm.home, 3 + 5 + 0.5 - 1);
  assert.equal(sm.selfUse, 0.8);
  assert.equal(E.summarize({}, E.sourcesFromPrefs(prefs)).selfUse, 0, 'no solar means no share, not NaN');
});

test('bucket totals line up the series by time', () => {
  const stats = { a: [{ start: 1, change: 1 }, { start: 2, change: 2 }], b: [{ start: 2, change: 3 }, { start: 3, change: 4 }] };
  assert.deepEqual(E.bucketTotals(stats, ['a', 'b']), [{ t: 1, v: 1 }, { t: 2, v: 5 }, { t: 3, v: 4 }]);
  assert.deepEqual(E.bucketTotals({}, ['x']), []);
});

test('range windows: hourly today, daily week and month, ending after today', () => {
  const now = new Date(2026, 9, 15, 14).getTime();
  const t = E.rangeWindow('today', now), w = E.rangeWindow('7d', now), m = E.rangeWindow('30d', now);
  assert.equal(t.period, 'hour'); assert.equal((t.end - t.start) / 3600000, 24);
  assert.equal(w.period, 'day'); assert.equal((w.end - w.start) / 86400000, 7);
  assert.equal((m.end - m.start) / 86400000, 30);
  assert.ok(t.start <= now && now < t.end);
});

test('kWh formatting follows the language', () => {
  assert.equal(E.fmtKwh(12.345, false), '12.3 kWh'); assert.equal(E.fmtKwh(12.345, true), '12,3 kWh');
});

// ------------------------------------------------------------ the house ----
const real = () => ({
  'sensor.energy_server_power': { state: '12.4', attributes: { kwh_today: 0.106, cost_per_month: 1.52, system: { uptime_s: 1183546 } } },
  'sensor.energy_server_energy_today': { state: '0.106', attributes: {} },
  'sensor.energy_server_cost_month': { state: '1.52', attributes: {} },
  'sensor.energy_home_average_power': { state: '1743', attributes: {} },
  'sensor.energy_last_bill': { state: '190.71', attributes: { period_start: '2026-08-07', period_end: '2026-09-04', days: 29, kwh: 1213, marginal_cents: 16.31, history: [{ period_end: '2026-09-04', kwh: 1213, total: 190.71 }, { period_end: '2026-08-06', kwh: 1203, total: 189.09 }] } },
  'sensor.energy_devices': { state: '3', attributes: { devices: [{ entity: 'light.a', name: 'A', watts: 9, kind: 'light', lamp: true }, { entity: 'light.b', name: 'B', watts: 20, kind: 'light', lamp: false }, { entity: 'switch.c', name: 'C', watts: 5, kind: 'plug' }] } },
  'sensor.teco_last_bill_cost': { state: '190.71', attributes: {} }, 'sensor.teco_last_bill_usage': { state: '1213.0', attributes: {} }, 'sensor.teco_service_days': { state: '29', attributes: {} },
  'sensor.teco_last_bill_rate': { state: '0.15722', attributes: {} }, 'sensor.teco_service_period_start': { state: '2026-08-07', attributes: {} }, 'sensor.teco_service_period_end': { state: '2026-09-04', attributes: {} },
  'light.a': { state: 'on', attributes: { brightness: 255 } }, 'light.b': { state: 'on', attributes: { brightness: 128 } }, 'switch.c': { state: 'off', attributes: {} },
});

test('house: the numbers of the Overview card are read from the same sensors', () => {
  const h = E.readHouse(real());
  assert.equal(h.has, true);
  assert.equal(h.serverW, 12.4); assert.equal(h.serverKwh, 0.106); assert.equal(h.serverCost, 1.52);
  assert.ok(Math.abs(h.homeW - 1742.82) < 0.05, 'the average draw comes from the TECO bill: kWh / (days x 24)');
  assert.ok(Math.abs(h.homeKwhDay - 41.83) < 0.05);
  assert.equal(h.bill.total, 190.71); assert.equal(h.bill.kwh, 1213); assert.equal(h.bill.days, 29); assert.equal(h.bill.teco, true);
  assert.equal(h.bill.start, '2026-08-07'); assert.equal(h.bill.end, '2026-09-04'); assert.ok(Math.abs(h.bill.rateCents - 15.722) < 0.001);
  assert.deepEqual(h.bill.history.map(x => x.period_end), ['2026-08-06', '2026-09-04'], 'oldest first');
  assert.equal(h.hasDevices, true); assert.equal(h.devices.length, 3);
});

test('house: without TECO the uploaded bill and the average power sensor are used', () => {
  const st = real(); ['sensor.teco_last_bill_cost', 'sensor.teco_last_bill_usage', 'sensor.teco_service_days', 'sensor.teco_last_bill_rate', 'sensor.teco_service_period_start', 'sensor.teco_service_period_end'].forEach(k => delete st[k]);
  const h = E.readHouse(st);
  assert.equal(h.homeW, 1743); assert.equal(h.bill.teco, false); assert.equal(h.bill.total, 190.71); assert.equal(h.bill.kwh, 1213); assert.equal(h.bill.start, '2026-08-07');
  assert.ok(Math.abs(h.bill.rateCents - 190.71 / 1213 * 100) < 0.001);
  assert.equal(h.bill.marginalCents, 16.31);
});

test('house: nothing is invented when the sensors are missing, unavailable or unknown', () => {
  assert.equal(E.readHouse({}).has, false); assert.equal(E.readHouse(undefined).has, false);
  const st = { 'sensor.energy_server_power': { state: 'unavailable', attributes: {} }, 'sensor.energy_last_bill': { state: 'unknown', attributes: {} } };
  const h = E.readHouse(st);
  assert.equal(h.has, false); assert.equal(h.serverW, null); assert.equal(h.bill, null); assert.equal(h.homeW, null); assert.deepEqual(h.devices, []);
});

test('house: what the lights and plugs draw now (lights scale with brightness, only lamps light the windows)', () => {
  const st = real(), h = E.readHouse(st);
  assert.ok(Math.abs(h.dev.w - (9 + 20 * 128 / 255)) < 1e-9); assert.equal(h.dev.on, 2); assert.equal(h.dev.lights, 1);
  assert.equal(E.deviceWatts([{ entity: 'light.x', watts: 10, kind: 'light' }], { 'light.x': { state: 'on', attributes: { brightness: 3 } } }).w, 1, 'never below a tenth');
  assert.equal(E.deviceWatts([{ entity: 'light.x', watts: 10, kind: 'light' }], {}).on, 0);
  assert.equal(E.deviceWatts(undefined, undefined).w, 0);
});

test('house: the flow lines speed up with the power and stand still without it', () => {
  assert.equal(E.flowSeconds(0, 100), null); assert.equal(E.flowSeconds(0.4, 100), null);
  assert.equal(E.flowSeconds(100, 100), 0.9); assert.equal(E.flowSeconds(1e6, 100), 0.9);
  assert.ok(E.flowSeconds(1, 1000) > 4 && E.flowSeconds(1, 1000) <= 4.5);
  assert.ok(E.flowSeconds(500, 1000) < E.flowSeconds(100, 1000));
});

test('house: the estimated kWh of the devices today comes from their on-times', () => {
  const list = [{ entity: 'light.a', watts: 10, kind: 'light' }, { entity: 'switch.b', watts: 100, kind: 'plug' }];
  const res = {
    'light.a': [{ s: 'on', lu: 1000, a: { brightness: 255 } }, { s: 'off', lu: 1000 + 3600 }],                       // one hour at full brightness: 10 Wh
    'switch.b': [{ state: 'off', last_updated: 0 }, { state: 'on', last_updated: 5000 }],                             // on from 5000 s until the end (1800 s later): 50 Wh
  };
  assert.ok(Math.abs(E.histKwh(list, res, 0, 6800) - (0.010 + 0.05)) < 1e-9);
  assert.equal(E.histKwh(list, { 'light.a': [{ s: 'on', lu: -500 }] }, 0, 3600) > 0, true, 'a state from before midnight counts from midnight');
  assert.equal(E.histKwh(list, {}, 0, 100), 0); assert.equal(E.histKwh(undefined, undefined, 0, 1), 0);
});

test('house: numbers read like the card: kW above 1000 W, dollars with cents under ten', () => {
  assert.equal(E.fmtW(12.4), '12 W'); assert.equal(E.fmtW(1743), '1.74 kW'); assert.equal(E.fmtW(1743, true), '1,74 kW'); assert.equal(E.fmtW(null), '—');
  assert.equal(E.fmtN(0.106), '0.11'); assert.equal(E.fmtN(41.83), '41.8'); assert.equal(E.fmtN(1213), '1213'); assert.equal(E.fmtN(41.83, true), '41,8');
  assert.equal(E.fmtUsd(1.5), '$1.50'); assert.equal(E.fmtUsd(190.71), '$191'); assert.equal(E.fmtUsd(1234), '$1,234'); assert.equal(E.fmtUsd(null), '—');
});

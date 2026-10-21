'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/okie-rest.js');

const S = 1000;
const cfg = { enabled: true, saverAfterSec: 300, deepAfterSec: 120, awaySaverAfterSec: 60, screenEntity: 'switch.screen', screenOffScript: 'script.dim', screenOnScript: 'script.bright' };
const mk = c => R.createMachine(Object.assign({}, cfg, c));

test('idle -> clock page after the saver time, then deep rest after the extra time', () => {
  const m = mk(); const t0 = 1e6;
  m.activity(t0);
  assert.equal(m.tick(t0 + 299 * S).phase, 'active');
  const a = m.tick(t0 + 300 * S);
  assert.equal(a.phase, 'saver'); assert.equal(a.changed, true); assert.equal(a.dim, 0);
  assert.equal(m.tick(t0 + 300 * S + 119 * S).phase, 'saver');
  const b = m.tick(t0 + 300 * S + 120 * S);
  assert.equal(b.phase, 'deep'); assert.ok(b.dim > 0.5);
});

test('disabled machine never leaves active', () => {
  const m = mk({ enabled: false }); m.activity(0);
  assert.equal(m.tick(10 * 3600 * S).phase, 'active');
});

test('nobody home: the clock page comes sooner', () => {
  const m = mk(); m.activity(0);
  assert.equal(m.tick(59 * S, { nobodyHome: true }).phase, 'active');
  assert.equal(m.tick(60 * S, { nobodyHome: true }).phase, 'saver');
  const m2 = mk(); m2.activity(0);
  assert.equal(m2.tick(60 * S, { nobodyHome: false }).phase, 'active');
});

test('quiet hours dim deeper than daytime', () => {
  const day = mk(), night = mk();
  [day, night].forEach(m => { m.activity(0); m.tick(300 * S); });
  const d = day.tick(420 * S, { quiet: false }), n = night.tick(420 * S, { quiet: true });
  assert.ok(n.dim > d.dim, n.dim + ' > ' + d.dim);
});

test('display handoff: off when deep rest begins, on again at wake, only once each', () => {
  const m = mk(); m.activity(0); m.tick(300 * S);
  const deep = m.tick(420 * S);
  assert.deepEqual(deep.effects, [{ type: 'display', on: false, entity: 'switch.screen', script: 'script.dim' }]);
  assert.deepEqual(m.tick(430 * S).effects, [], 'no repeat while resting');
  const wake = m.activity(500 * S, 'binary_sensor.hall_motion');
  assert.equal(wake.phase, 'active'); assert.equal(wake.wakeSource, 'binary_sensor.hall_motion');
  assert.deepEqual(wake.effects, [{ type: 'display', on: true, entity: 'switch.screen', script: 'script.bright' }]);
  assert.deepEqual(m.activity(501 * S).effects, [], 'already awake');
});

test('waking from the clock page (not deep) does not touch the display', () => {
  const m = mk(); m.activity(0); m.tick(300 * S);
  assert.deepEqual(m.activity(310 * S).effects, []);
});

test('no display entity configured: no handoff effect at all', () => {
  const m = mk({ screenEntity: '', screenOffScript: '' }); m.activity(0); m.tick(300 * S);
  assert.deepEqual(m.tick(420 * S).effects, []);
});

test('burn-in shift: the text block moves every three minutes and wraps around', () => {
  const m = mk(); m.activity(0); m.tick(300 * S); const deep = m.tick(420 * S);
  const first = deep.shift;
  assert.deepEqual(first, R.SHIFTS[0]);
  assert.deepEqual(m.tick(420 * S + 179 * S).shift, R.SHIFTS[0]);
  const next = m.tick(420 * S + 180 * S);
  assert.equal(next.changed, true); assert.deepEqual(next.shift, R.SHIFTS[1]);
  let t = 420 * S + 180 * S;
  for (let i = 0; i < R.SHIFTS.length - 1; i++) { t += 180 * S; m.tick(t); }
  assert.deepEqual(m.tick(t).shift, R.SHIFTS[0], 'full cycle returns to the start');
  assert.ok(R.SHIFTS.every(([x, y]) => Math.abs(x) <= 14 && Math.abs(y) <= 14), 'only a few pixels');
});

test('activity resets the timers', () => {
  const m = mk(); m.activity(0);
  m.tick(200 * S); m.activity(250 * S);
  assert.equal(m.tick(500 * S).phase, 'active', '250 + 300 = 550');
  assert.equal(m.tick(550 * S).phase, 'saver');
});

test('wake sources: only a configured entity switching on wakes', () => {
  const ch = (id, a, b) => ({ id, old: { state: a }, next: { state: b } });
  const ids = ['binary_sensor.motion', 'binary_sensor.doorbell'];
  assert.deepEqual(R.wakeHit([ch('binary_sensor.motion', 'off', 'on'), ch('light.x', 'off', 'on')], ids), ['binary_sensor.motion']);
  assert.deepEqual(R.wakeHit([ch('binary_sensor.motion', 'on', 'off')], ids), [], 'switching off does not wake');
  assert.deepEqual(R.wakeHit([ch('binary_sensor.doorbell', 'off', 'on')], []), [], 'nothing configured');
  assert.deepEqual(R.wakeHit([{ id: 'binary_sensor.motion', old: null, next: { state: 'on' } }], ids), [], 'first sighting is not a change');
});

test('photo frame round-robin', () => {
  assert.equal(R.nextPhoto(['a', 'b', 'c'], -1), 0);
  assert.equal(R.nextPhoto(['a', 'b', 'c'], 2), 0);
  assert.equal(R.nextPhoto([], 0), -1);
  assert.equal(R.nextPhoto(['only'], 0), 0);
});

test('back to the lock page after: the choice wins, without it the dashboard\'s enabled / saverAfterSec still work', () => {
  const R = require('../src/okie-rest.js');
  const base = { enabled: false, saverAfterSec: 300, deepAfterSec: 120 };
  assert.equal(R.effectiveRest(base).enabled, false, 'untouched: off, as before');
  assert.deepEqual([R.effectiveRest(Object.assign({}, base, { lockAfter: '30' })).enabled, R.effectiveRest(Object.assign({}, base, { lockAfter: '30' })).saverAfterSec], [true, 30], 'a choice switches it on with that many seconds');
  assert.equal(R.effectiveRest(Object.assign({}, base, { lockAfter: '120' })).saverAfterSec, 120);
  assert.equal(R.effectiveRest({ enabled: true, saverAfterSec: 300, lockAfter: 'never' }).enabled, false, 'never beats a dashboard that turned it on');
  const yaml = R.effectiveRest({ enabled: true, saverAfterSec: 300, lockAfter: '' });
  assert.deepEqual([yaml.enabled, yaml.saverAfterSec], [true, 300], 'a dashboard that only sets enabled / saverAfterSec keeps working');
  // the machine really waits that long
  const m = R.createMachine(R.effectiveRest({ enabled: false, saverAfterSec: 300, deepAfterSec: 120, awaySaverAfterSec: 60, lockAfter: '60' }));
  assert.equal(m.tick(0).phase, 'active'); assert.equal(m.tick(59000).phase, 'active'); assert.equal(m.tick(60000).phase, 'saver', 'one minute without a touch: the lock page');
  m.activity(61000); assert.equal(m.tick(100000).phase, 'active', 'a touch starts the time again');
});

test('back to the lock page after: the row shows the current choice, also for a dashboard\'s own numbers', () => {
  const R = require('../src/okie-rest.js');
  const v = rest => R.lockValue({ rest });
  assert.equal(v({ enabled: false, saverAfterSec: 300 }), 'never');
  assert.equal(v({ enabled: true, saverAfterSec: 300 }), '300');
  assert.equal(v({ enabled: true, saverAfterSec: 100 }), '120', 'the nearest of the four times');
  assert.equal(v({ enabled: true, saverAfterSec: 900 }), '300');
  assert.equal(v({ enabled: false, saverAfterSec: 300, lockAfter: '60' }), '60', 'the choice itself');
  assert.equal(v({ enabled: true, saverAfterSec: 300, lockAfter: 'never' }), 'never');
  const row = R.SETTINGS_ROWS.find(r => r.id === 'r_lock');
  assert.deepEqual(row.options.map(o => o.id), ['30', '60', '120', '300', 'never']);
  assert.ok(!R.SETTINGS_ROWS.some(r => r.id === 'r_on' || r.id === 'r_saver'), 'the old toggle and seconds slider are replaced by this one row');
});

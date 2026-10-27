'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/okie-logic.js');

const it = (id, state, extra) => Object.assign({ id, domain: id.split('.')[0], state, name: id, labels: [] }, extra || {});

// ---- quick control ----------------------------------------------------------
test('quick control: safe devices flip with a tap', () => {
  ['light', 'switch', 'fan', 'input_boolean', 'media_player'].forEach(d => {
    const a = L.quickAction(it(d + '.x', 'on'));
    assert.equal(a.mode, 'tap', d);
    assert.equal(a.service, 'toggle');
    assert.deepEqual(a.data, { entity_id: d + '.x' });
  });
});

test('quick control: risky direction needs a hold, safe direction stays a tap', () => {
  assert.equal(L.quickAction(it('lock.door', 'locked')).service, 'unlock');
  assert.equal(L.quickAction(it('lock.door', 'locked')).mode, 'hold');
  assert.equal(L.quickAction(it('lock.door', 'unlocked')).service, 'lock');
  assert.equal(L.quickAction(it('lock.door', 'unlocked')).mode, 'tap');
  assert.equal(L.quickAction(it('cover.blind', 'closed')).service, 'open_cover');
  assert.equal(L.quickAction(it('cover.blind', 'closed')).mode, 'hold');
  assert.equal(L.quickAction(it('cover.blind', 'open')).service, 'close_cover');
  assert.equal(L.quickAction(it('cover.blind', 'open')).mode, 'tap');
});

test('quick control: per-domain Off / Tap / Hold', () => {
  assert.equal(L.quickAction(it('light.a', 'on'), { light: 'off' }), null);
  assert.equal(L.quickAction(it('light.a', 'on'), { light: 'hold' }).mode, 'hold');
  assert.equal(L.quickAction(it('lock.a', 'locked'), { lock: 'tap' }).mode, 'tap');
  assert.equal(L.quickAction(it('sensor.a', '5')), null, 'sensors have no quick action');
  assert.equal(L.quickAction(it('light.a', 'unavailable')), null);
});

test('quick control: climate, vacuum toggle sensibly', () => {
  assert.equal(L.quickAction(it('climate.a', 'off')).service, 'turn_on');
  assert.equal(L.quickAction(it('climate.a', 'heat')).service, 'turn_off');
  assert.equal(L.quickAction(it('vacuum.a', 'docked')).service, 'start');
  assert.equal(L.quickAction(it('vacuum.a', 'cleaning')).service, 'return_to_base');
});

// ---- browse -----------------------------------------------------------------
const house = [
  it('light.a', 'on', { name: 'A', areaId: 'k', area: 'Kitchen' }),
  it('light.b', 'off', { name: 'B', areaId: 'l', area: 'Living' }),
  it('switch.c', 'off', { name: 'C', areaId: null, area: null }),
  it('lock.d', 'locked', { name: 'D', areaId: 'h', area: 'Hall' }),
  it('binary_sensor.e', 'off', { name: 'E', deviceClass: 'door', areaId: 'h', area: 'Hall' }),
  it('binary_sensor.f', 'off', { name: 'F', deviceClass: 'occupancy', areaId: 'h', area: 'Hall' }),
  it('sensor.t1', '20', { deviceClass: 'temperature', areaId: 'k', area: 'Kitchen', unit: '°C' }),
  it('sensor.t2', '22', { deviceClass: 'temperature', areaId: 'k', area: 'Kitchen', unit: '°C' }),
  it('sensor.h1', '55', { deviceClass: 'humidity', areaId: 'k', area: 'Kitchen', unit: '%' }),
  it('sensor.junk', 'abc', { deviceClass: 'temperature', areaId: 'k', area: 'Kitchen' }),
];

test('chip filters: lights, switches, security (lock + door contact, not occupancy)', () => {
  assert.deepEqual(L.applyChipFilter(house, 'lights').map(i => i.id), ['light.a', 'light.b']);
  assert.deepEqual(L.applyChipFilter(house, 'switches').map(i => i.id), ['switch.c']);
  assert.deepEqual(L.applyChipFilter(house, 'security').map(i => i.id), ['lock.d', 'binary_sensor.e']);
  assert.equal(L.applyChipFilter(house, 'all'), house);
  assert.deepEqual(L.applyChipFilter(house, 'favorites', { favorites: ['light.b'] }).map(i => i.id), ['light.b']);
  assert.deepEqual(L.applyChipFilter(house, 'suggestions', { suggestions: [house[0]] }).map(i => i.id), ['light.a']);
});

test('top categories: Devices / Sensors / Actions', () => {
  assert.ok(L.inTopCategory(house[0], 'devices'));
  assert.ok(L.inTopCategory(house[6], 'sensors'));
  assert.ok(!L.inTopCategory(house[6], 'devices'));
  assert.ok(L.inTopCategory(it('scene.x', 'x'), 'actions'));
});

test('group by area: alphabetical, unassigned last, items sorted by name', () => {
  const gs = L.groupItems(house.slice(0, 4), 'area', { otherLabel: 'No room' });
  assert.deepEqual(gs.map(g => g.title), ['Hall', 'Kitchen', 'Living', 'No room']);
  assert.equal(gs[3].key, '~none');
});

test('group by category and by usage', () => {
  const gs = L.groupItems(house.slice(0, 4), 'category', { domainLabel: d => d.toUpperCase() });
  assert.deepEqual(gs.map(g => g.title), ['LIGHT', 'LOCK', 'SWITCH']);
  const usage = { 'light.b': 5, 'switch.c': 9 };
  const u = L.groupItems(house.slice(0, 4), 'usage', { usageScore: id => usage[id] || 0 });
  assert.deepEqual(u[0].items.map(i => i.id), ['switch.c', 'light.b', 'light.a', 'lock.d']);
});

test('area sensors: average temperature, humidity, ignores junk values', () => {
  const s = L.areaSensors(house, 'k');
  assert.equal(s.temperature.value, 21);
  assert.equal(s.temperature.unit, '°C');
  assert.equal(s.humidity.value, 55);
  assert.deepEqual(L.areaSensors(house, 'l'), {});
});

// ---- video -----------------------------------------------------------------
test('state normalisation: four buckets, weather verbatim', () => {
  assert.equal(L.normalizeState('light', 'on'), 'on');
  assert.equal(L.normalizeState('media_player', 'playing'), 'on');
  assert.equal(L.normalizeState('media_player', 'idle'), 'off');
  assert.equal(L.normalizeState('climate', 'heat'), 'on');
  assert.equal(L.normalizeState('cover', 'opening'), 'open');
  assert.equal(L.normalizeState('cover', 'closed'), 'closed');
  assert.equal(L.normalizeState('weather', 'partlycloudy'), 'partlycloudy');
  assert.equal(L.normalizeState('weather', 'clear-night'), 'clear_night');
  assert.equal(L.normalizeState('light', 'unavailable'), 'off');
});

test('video candidates follow steps 1-4 in order', () => {
  assert.deepEqual(L.videoCandidates('binary_sensor', 'motion', 'on'),
    ['binary_sensor_motion_on.mp4', 'binary_sensor_on.mp4', 'binary_sensor_motion.mp4', 'binary_sensor.mp4']);
  assert.deepEqual(L.videoCandidates('light', null, 'off'), ['light_off.mp4', 'light.mp4']);
});

function existsIn(set) { return url => Promise.resolve(set.has(url.split('/').pop())); }

test('video fallback: most specific clip wins', async () => {
  const u = await L.resolveVideo({ base: '/local/v', domain: 'binary_sensor', deviceClass: 'motion', state: 'on',
    exists: existsIn(new Set(['binary_sensor_motion_on.mp4', 'binary_sensor_motion.mp4'])) });
  assert.equal(u, '/local/v/binary_sensor_motion_on.mp4');
});

test('video fallback: one clip per device class covers every state (step 3)', async () => {
  const u = await L.resolveVideo({ base: '/local/v/', domain: 'binary_sensor', deviceClass: 'motion', state: 'off',
    exists: existsIn(new Set(['binary_sensor_motion.mp4'])) });
  assert.equal(u, '/local/v/binary_sensor_motion.mp4');
});

test('video fallback: domain_state (light_on.mp4) before the domain default', async () => {
  const u = await L.resolveVideo({ base: '/v', domain: 'light', state: 'on', exists: existsIn(new Set(['light_on.mp4', 'light.mp4'])) });
  assert.equal(u, '/v/light_on.mp4');
});

test('video fallback: random default pool pick, then icon background', async () => {
  const have = new Set(['default_1.mp4', 'default_7.mp4']);
  const a = await L.resolveVideo({ base: '/v', domain: 'sensor', state: '5', exists: existsIn(have), rng: () => 0 });
  const b = await L.resolveVideo({ base: '/v', domain: 'sensor', state: '5', exists: existsIn(have), rng: () => 0.99 });
  assert.equal(a, '/v/default_1.mp4');
  assert.equal(b, '/v/default_7.mp4');
  const none = await L.resolveVideo({ base: '/v', domain: 'sensor', state: '5', exists: existsIn(new Set()) });
  assert.equal(none, null);
  // no default_1 means no pool: the other nine probes never happen
  const probed = [];
  await L.resolveVideo({ base: '/v', domain: 'sensor', state: '5', exists: u => { probed.push(u); return Promise.resolve(false); } });
  assert.equal(probed.filter(u => /default_/.test(u)).length, 1, probed.join(','));
});

test('video fallback: weather uses descriptive state verbatim', async () => {
  const u = await L.resolveVideo({ base: '/v', domain: 'weather', state: 'pouring', exists: existsIn(new Set(['weather_pouring.mp4'])) });
  assert.equal(u, '/v/weather_pouring.mp4');
});

// ---- height ladder ----------------------------------------------------------
test('height ladder: full -> compact -> rows -> stacked', () => {
  assert.equal(L.pickRung(900), 'full');
  assert.equal(L.pickRung(576), 'full');
  assert.equal(L.pickRung(575), 'compact');
  assert.equal(L.pickRung(480), 'compact');
  assert.equal(L.pickRung(479), 'rows');
  assert.equal(L.pickRung(360), 'rows');
  assert.equal(L.pickRung(200), 'stacked');
});

test('a 1024x768 tablet with the HA header and island still fits a rung', () => {
  const avail = L.availableHeight(768, 56, 70);   // header + island band
  assert.equal(avail, 642);
  assert.equal(L.pickRung(avail), 'full');
  assert.equal(L.pickRung(L.availableHeight(600, 56, 70)), 'rows');
});

test('square widgets stay square: (width - gaps) / columns', () => {
  assert.equal(L.squareSize(1000, 16, 4), 238);
  assert.equal(L.squareSize(0, 16, 4), 0);
});

// ---- slider -----------------------------------------------------------------
test('slider geometry: arc runs 135 -> 405 degrees, value maps linearly', () => {
  assert.equal(L.angleForValue(0, 0, 100), 135);
  assert.equal(L.angleForValue(100, 0, 100), 405);
  assert.equal(L.angleForValue(50, 0, 100), 270);
});

test('slider pointer: top = middle, left-bottom = min, right-bottom = max, gap snaps', () => {
  const o = { min: 0, max: 100, step: 1 };
  assert.equal(L.valueFromPointer(100, 100, 100, 0, o), 50);              // straight up
  assert.equal(L.valueFromPointer(100, 100, 100 - 70, 100 + 70, o), 0);   // 135deg (bottom-left)
  assert.equal(L.valueFromPointer(100, 100, 100 + 70, 100 + 70, o), 100); // 45deg (bottom-right)
  assert.equal(L.valueFromPointer(100, 100, 100 - 5, 100 + 90, o), 0);    // gap, nearer to the left end
  assert.equal(L.valueFromPointer(100, 100, 100 + 5, 100 + 90, o), 100);  // gap, nearer to the right end
});

test('slider step snapping and clamping', () => {
  const o = { min: 16, max: 30, step: 0.5 };
  const v = L.valueFromPointer(100, 100, 100, 0, o);
  assert.equal(v, 23);
  assert.equal(L.valueFromPointer(100, 100, 100, 0, { min: 0, max: 255, step: 5 }) % 5, 0);
});

test('arc path is well formed and temp colour runs cold to warm', () => {
  const p = L.arcPath(100, 100, 80, 135, 405);
  assert.match(p, /^M[\d.\-]+ [\d.\-]+ A80 80 0 1 1 [\d.\-]+ [\d.\-]+$/);
  assert.equal(L.tempColor(0), 'rgb(79,140,255)');
  assert.equal(L.tempColor(1), 'rgb(255,176,32)');
  assert.equal(L.tempColor(5), 'rgb(255,176,32)');
});

// ---- history ----------------------------------------------------------------
const T0 = Date.UTC(2026, 9, 5, 0, 0, 0);
const H = 3600000;
const rows = [
  { state: 'off', last_changed: new Date(T0 - 2 * H).toISOString() },
  { state: 'on', last_changed: new Date(T0 + 1 * H).toISOString() },
  { state: 'off', last_changed: new Date(T0 + 3 * H).toISOString() },
  { state: 'on', last_changed: new Date(T0 + 5 * H).toISOString() },
  { state: 'off', last_changed: new Date(T0 + 5.5 * H).toISOString() },
];
const win = [T0, T0 + 8 * H];

test('segments are clamped to the window and the open tail runs to its end', () => {
  const s = L.toSegments(rows, win[0], win[1]);
  assert.equal(s[0].from, T0);                         // starts mid-segment, clamped
  assert.equal(s[s.length - 1].to, T0 + 8 * H);
  assert.equal(s.reduce((a, x) => a + (x.to - x.from), 0), 8 * H, 'segments tile the window');
});

test('durations by state and stats (changes, active time, average run)', () => {
  const s = L.toSegments(rows, win[0], win[1]);
  const d = L.durationsByState(s);
  assert.equal(d.on, 2.5 * H);
  const st = L.historyStats(s);
  assert.equal(st.changes, 4);
  assert.equal(st.activeMs, 2.5 * H);
  assert.equal(st.runs, 2);
  assert.equal(st.avgActiveRunMs, 1.25 * H);
  assert.ok(Math.abs(st.activePct - 2.5 / 8) < 1e-9);
});

test('time-of-day analysis: minutes active per local hour', () => {
  const s = L.toSegments(rows, win[0], win[1]);
  const hrs = L.hourlyActivity(s);
  assert.equal(hrs.length, 24);
  assert.ok(Math.abs(hrs.reduce((a, b) => a + b, 0) - 150) < 1e-6, 'sums to 2.5h of activity in minutes');
});

test('numeric series for sensors with min / max / avg, junk states skipped', () => {
  const r = [
    { state: '20', last_changed: new Date(T0).toISOString() },
    { state: 'unavailable', last_changed: new Date(T0 + H).toISOString() },
    { state: '24', last_changed: new Date(T0 + 2 * H).toISOString() },
  ];
  const ns = L.numericSeries(L.toSegments(r, T0, T0 + 3 * H));
  assert.equal(ns.points.length, 2);
  assert.equal(ns.min, 20); assert.equal(ns.max, 24); assert.equal(ns.avg, 22);
});

test('bucketing keeps long histories light', () => {
  const pts = Array.from({ length: 1000 }, (_, i) => ({ t: i, v: i }));
  const b = L.bucketSeries(pts, 100);
  assert.equal(b.length, 100);
  assert.ok(b[0].v < b[99].v);
  assert.equal(L.bucketSeries(pts.slice(0, 5), 100).length, 5);
});

test('duration formatting', () => {
  assert.equal(L.fmtDuration(20000), '<1 min');
  assert.equal(L.fmtDuration(35 * 60000), '35 min');
  assert.equal(L.fmtDuration(90 * 60000), '1 h 30 min');
  assert.equal(L.fmtDuration(72 * H), '3 d');
});

// ---- state text -------------------------------------------------------------
test('describeState: lights show brightness, covers show position, climate shows current and target', () => {
  assert.equal(L.describeState('light', { state: 'on', attributes: { brightness: 128 } }, 'en'), 'On · 50%');
  assert.equal(L.describeState('light', { state: 'on', attributes: { brightness: 128 } }, 'de'), 'An · 50 %');
  assert.equal(L.describeState('light', { state: 'off', attributes: {} }, 'en'), 'Off');
  assert.equal(L.describeState('cover', { state: 'open', attributes: { current_position: 40 } }, 'en'), 'Open · 40%');
  assert.equal(L.describeState('cover', { state: 'open', attributes: { current_position: 100 } }, 'en'), 'Open');
  assert.equal(L.describeState('climate', { state: 'heat', attributes: { current_temperature: 21.5, temperature: 22 } }, 'en'), 'Heating · 21.5° → 22°');
  assert.equal(L.describeState('climate', { state: 'heat', attributes: { current_temperature: 21.5, temperature: 22 } }, 'de'), 'Heizen · 21,5° → 22°');
  assert.equal(L.describeState('climate', { state: 'off', attributes: { current_temperature: 19 } }, 'en'), 'Off · 19°');
});

test('describeState: sensors with units, media title, unavailable, weather, scenes', () => {
  assert.equal(L.describeState('sensor', { state: '21.04', attributes: { unit_of_measurement: '°C' } }, 'en'), '21 °C');
  assert.equal(L.describeState('sensor', { state: '21.5', attributes: { unit_of_measurement: '°C' } }, 'de'), '21,5 °C');
  assert.equal(L.describeState('media_player', { state: 'playing', attributes: { media_title: 'Song' } }, 'en'), 'Song');
  assert.equal(L.describeState('light', { state: 'unavailable', attributes: {} }, 'de'), 'Nicht verfügbar');
  assert.equal(L.describeState('weather', { state: 'partlycloudy', attributes: { temperature: 17 } }, 'en'), '17° · partlycloudy');
  assert.equal(L.describeState('scene', { state: 'scening', attributes: {} }, 'en'), 'Run');
  assert.equal(L.describeState('lock', { state: 'locked', attributes: {} }, 'de'), 'Verriegelt');
});

test('isOn: which tiles go white', () => {
  assert.equal(L.isOn('light', 'on'), true);
  assert.equal(L.isOn('cover', 'open'), true);
  assert.equal(L.isOn('cover', 'closed'), false);
  assert.equal(L.isOn('lock', 'unlocked'), true);
  assert.equal(L.isOn('sensor', 'on'), false);
  assert.equal(L.isOn('media_player', 'playing'), true);
});

test('shortName strips the area prefix but never empties a name', () => {
  assert.equal(L.shortName('Kitchen Ceiling', 'Kitchen'), 'Ceiling');
  assert.equal(L.shortName('Kitchen', 'Kitchen'), 'Kitchen');
  assert.equal(L.shortName('Kitchenette Lamp', 'Kitchen'), 'Kitchenette Lamp');
  assert.equal(L.shortName('Lamp', null), 'Lamp');
  assert.equal(L.shortName('Anziehraum Klima Climate', 'Anziehraum'), 'Klima Climate');
});

// ---- spring physics ----------------------------------------------------------
test('spring settles on its target within a second and only overshoots a little', () => {
  const s = { x: 0, v: 0 }; let t = 0, peak = 0;
  while (!L.springSettled(s, 100, 0.01) && t < 3) { L.springStep(s, 100, 1 / 60); t += 1 / 60; peak = Math.max(peak, s.x); }
  assert.ok(t < 1.5, 'settled in ' + t);
  assert.ok(Math.abs(s.x - 100) < 0.05);
  assert.ok(peak < 102, 'overshoot ' + peak);
});

test('spring stays stable at a big time step (tab was in the background)', () => {
  const s = { x: 0, v: 0 };
  L.springStep(s, 50, 0.5);
  assert.ok(Number.isFinite(s.x) && Math.abs(s.x - 50) < 5);
  for (let i = 0; i < 10; i++) L.springStep(s, 50, 0.5);
  assert.ok(Math.abs(s.x - 50) < 0.01);
});

// ---- chart maths -------------------------------------------------------------
test('nice ticks: round steps that cover the data', () => {
  const a = L.niceTicks(0, 97, 5);
  assert.deepEqual(a.ticks, [0, 20, 40, 60, 80, 100]);
  const b = L.niceTicks(20.1, 22.9, 5);
  assert.equal(b.step, 1);
  assert.deepEqual(b.ticks, [20, 21, 22, 23]);
  assert.equal(L.niceTicks(20.1, 20.9, 5).step, 0.2);
  const flat = L.niceTicks(21, 21, 4);
  assert.ok(flat.max > flat.min, 'flat series still gets an axis');
});

test('line path maps min/max to the box edges and closes the area', () => {
  const pts = [{ t: 0, v: 10 }, { t: 50, v: 20 }, { t: 100, v: 30 }];
  const r = L.linePath(pts, { x: 10, y: 5, w: 200, h: 100 }, { t0: 0, t1: 100, v0: 10, v1: 30 });
  assert.equal(r.d, 'M10 105L110 55L210 5');
  assert.ok(r.area.endsWith('L210 105L10 105Z'));
  assert.deepEqual(L.linePath([], { x: 0, y: 0, w: 1, h: 1 }, {}), { d: '', area: '', xy: [] });
});

test('relative time in EN and DE', () => {
  assert.equal(L.relativeTime(10000, 'en'), 'just now');
  assert.equal(L.relativeTime(5 * 60000, 'en'), '5 min ago');
  assert.equal(L.relativeTime(3 * 3600000, 'de'), 'vor 3 Std.');
  assert.equal(L.relativeTime(86400000, 'en'), '1 day ago');
  assert.equal(L.relativeTime(3 * 86400000, 'de'), 'vor 3 Tagen');
});
test('feature bit test', () => {
  assert.equal(L.has(4 | 8, 4), true);
  assert.equal(L.has(8, 4), false);
  assert.equal(L.has(undefined, 4), false);
});

test('quiet hours wrap midnight and ignore equal bounds', () => {
  const at = (h, m) => new Date(2026, 9, 5, h, m).getTime();
  assert.equal(L.inQuietHours(at(23, 0), '22:00', '07:00'), true);
  assert.equal(L.inQuietHours(at(3, 30), '22:00', '07:00'), true);
  assert.equal(L.inQuietHours(at(7, 0), '22:00', '07:00'), false, 'end is exclusive');
  assert.equal(L.inQuietHours(at(12, 0), '22:00', '07:00'), false);
  assert.equal(L.inQuietHours(at(13, 0), '12:00', '14:00'), true, 'same-day window');
  assert.equal(L.inQuietHours(at(13, 0), '09:00', '09:00'), false);
  assert.equal(L.inQuietHours(at(13, 0), '', ''), false);
});

// ---- FSC frame maths (measured on the user's live Fast Search Card) -----------------
test('zoom follows FSC: 1 on phones, 0.65 floor, 1 at 1600px and up', () => {
  assert.equal(L.zoomFor(390), 1);
  assert.equal(L.zoomFor(699), 1);
  assert.equal(L.zoomFor(700), 0.65);
  assert.equal(L.zoomFor(1000), 0.65);
  assert.ok(Math.abs(L.zoomFor(1512) - 0.940769) < 1e-4, 'the live card at 1512px reported zoom 0.940769');
  assert.equal(L.zoomFor(1600), 1);
  assert.equal(L.zoomFor(2560), 1);
});

test('layout heights: the live window (1512x712, 56px header) gets panel 560, grid 464, compact', () => {
  const avail = (712 - 56) / L.zoomFor(1512);                  // 697 design px
  const l = L.layoutFor(avail);
  assert.equal(l.panelH, 560); assert.equal(l.gridH, 464); assert.equal(l.rung, 'kompakt');
  assert.ok(Math.abs(l.w34 - 196) <= 1, 'small tiles were 196 high there, got ' + l.w34);
});

test('layout ladder: full 576 grid on a tall screen, then compact, drop W3/W4, stacked floor', () => {
  assert.deepEqual(L.layoutFor(900), { panelH: 672, gridH: 576, w34: 200, rung: 'voll' });
  assert.equal(L.layoutFor(760).rung, 'kompakt');
  assert.equal(L.layoutFor(640).rung, 'abwerfen');
  assert.equal(L.layoutFor(540).rung, 'boden');
  assert.equal(L.layoutFor(100).panelH, 380, 'never below the floor');
});

test('grid columns by panel width, with the 4/5/6 setting only on wide screens', () => {
  assert.equal(L.gridColumns(1200, 6), 6); assert.equal(L.gridColumns(1200), 5);
  assert.equal(L.gridColumns(1023, 6), 4); assert.equal(L.gridColumns(900, 5), 4);
  assert.equal(L.gridColumns(700, 5), 3); assert.equal(L.gridColumns(420, 5), 2); assert.equal(L.gridColumns(300, 5), 1);
});

// ---- typewriter, recency buckets, entities -------------------------------------------
test('typewriter: types, holds, deletes, pauses, then the next line', () => {
  const lines = ['Hello', 'Hi'];
  const at = ms => L.typistAt(lines, ms, { typeMs: 100, holdMs: 1000, delMs: 50, gapMs: 200 });
  assert.deepEqual(at(0), { text: '', line: 0 });
  assert.equal(at(250).text, 'He');
  assert.equal(at(500).text, 'Hello');
  assert.equal(at(1400).text, 'Hello', 'holds');
  assert.equal(at(500 + 1000 + 100).text, 'Hel', 'deleting: 2 chars gone after 100 ms');
  assert.equal(at(500 + 1000 + 250).text, '', 'fully deleted');
  assert.equal(at(500 + 1000 + 250 + 200).line, 1, 'next line after the pause');
  const total = (5 * 100 + 1000 + 5 * 50 + 200) + (2 * 100 + 1000 + 2 * 50 + 200);
  assert.deepEqual(at(total), at(0), 'loops');
  assert.deepEqual(L.typistAt([], 123), { text: '', line: -1 });
});

test('recent buckets: newest first, grouped by age, empties dropped, "earlier" catches the rest', () => {
  const now = new Date(2026, 9, 6, 15, 0).getTime(), M = 60000;
  const mk = (id, minAgo) => ({ id, ts: now - minAgo * M });
  const items = [mk('old', 60 * 24 * 3), mk('a', 3), mk('b', 40), mk('c', 90), mk('d', 8)];
  const b = L.recentBuckets(items, i => i.ts, now, [15, 60, 'today']);
  assert.deepEqual(b.map(x => x.key), ['15', '60', 'today', 'earlier']);
  assert.deepEqual(b[0].items.map(i => i.id), ['a', 'd'], 'newest first inside a bucket');
  assert.deepEqual(b[1].items.map(i => i.id), ['b']);
  assert.deepEqual(b[2].items.map(i => i.id), ['c']);
  assert.deepEqual(b[3].items.map(i => i.id), ['old']);
  assert.deepEqual(L.recentBuckets([mk('x', 5)], i => i.ts, now, [15, 60]).map(x => x.key), ['15']);
  assert.deepEqual(Object.keys(L.TIME_SORT), ['fine', 'standard', 'coarse']);
});

test('html entities in names become characters; active count for chip badges', () => {
  assert.equal(L.decodeEntities('50&quot; Crystal UHD'), '50" Crystal UHD');
  assert.equal(L.decodeEntities('Tom &amp; Jerry&#39;s'), "Tom & Jerry's");
  assert.equal(L.decodeEntities(null), '');
  const items = [{ id: 'a', domain: 'light' }, { id: 'b', domain: 'light' }, { id: 'c', domain: 'sensor' }];
  const st = { a: 'on', b: 'off', c: 'on' };
  assert.equal(L.activeCount(items, i => st[i.id]), 1, 'sensors never count as on');
});

// ---- the words on a tile, exactly like Fast Search Card -----------------------------
test('tile state: the table word for most things, nothing for plain numeric sensors, a hint for batteries', () => {
  const T = (id, state, attrs) => L.tileState({ id, domain: id.split('.')[0] }, { state, attributes: attrs || {} }, 'en');
  assert.equal(T('climate.living_room', 'cool', { hvac_action: 'cooling', current_temperature: 71, temperature: 70 }), 'Cooling', 'no temperatures on the tile');
  assert.equal(T('switch.kindle', 'on'), 'On');
  assert.equal(T('script.feed', 'off'), 'Off', 'scripts show on/off, not "Run"');
  assert.equal(T('vacuum.jess', 'idle'), 'Idle');
  assert.equal(T('binary_sensor.charging', 'off', { device_class: 'battery_charging' }), 'Not charging');
  assert.equal(T('binary_sensor.door', 'on', { device_class: 'door' }), 'Open');
  assert.equal(T('sensor.kindle_battery', '52', { device_class: 'battery', unit_of_measurement: '%' }), 'Battery OK');
  assert.equal(T('sensor.battery', '8', { device_class: 'battery' }), 'Battery almost empty!');
  assert.equal(T('sensor.room_temp', '21', { device_class: 'temperature', unit_of_measurement: '°C' }), 'Optimal temperature');
  assert.equal(T('sensor.weight', '80', { unit_of_measurement: 'g' }), '', 'a plain number has no sentence (the value sits in the icon area)');
  assert.equal(T('sensor.mode', 'using battery'), 'using battery', 'words pass through');
  assert.equal(L.tileState({ id: 'climate.x', domain: 'climate' }, { state: 'cool', attributes: {} }, 'de'), JSON.parse(JSON.stringify(L.fscStateText('cool', 'climate', null, 'de'))));
});
test('tile "on" rule (FSC bd): sensors never, docked vacuums yes, scripts only just after they ran', () => {
  assert.equal(L.fscActive('on', 'light'), true);
  assert.equal(L.fscActive('idle', 'vacuum'), false);
  assert.equal(L.fscActive('docked', 'vacuum'), true);
  assert.equal(L.fscActive('cool', 'climate'), true);
  assert.equal(L.fscActive('off', 'climate'), false);
  assert.equal(L.fscActive('50', 'sensor'), false);
  assert.equal(L.fscActive('off', 'script', { last_triggered: new Date(Date.now() - 60000).toISOString() }), true);
  assert.equal(L.fscActive('off', 'script', { last_triggered: new Date(Date.now() - 3600000).toISOString() }), false);
  assert.equal(L.fscActive('open', 'sensor'), true, 'the shared word list wins before the domain rule');
});
test('sensor value on a tile (FSC wd): rounding per device class', () => {
  assert.deepEqual(L.sensorValue('21.456', { device_class: 'temperature', unit_of_measurement: '°C' }), { value: '21.5', unit: '°C' });
  assert.deepEqual(L.sensorValue('52.4', { device_class: 'battery', unit_of_measurement: '%' }), { value: '52', unit: '%' });
  assert.deepEqual(L.sensorValue('1700', { device_class: 'power', unit_of_measurement: 'W' }), { value: '1.7', unit: 'kW' });
  assert.deepEqual(L.sensorValue('38', { unit_of_measurement: 'photos' }), { value: '38', unit: 'photos' });
  assert.deepEqual(L.sensorValue('hello', {}), { value: 'hello', unit: '' });
});

test('content size: 100% is FSC\'s own zoom, smaller shrinks the column, bad values mean 100%', () => {
  const L = require('../src/okie-logic.js');
  assert.equal(L.scaledZoom(1512, 100), L.zoomFor(1512));
  assert.ok(Math.abs(L.scaledZoom(1512, 70) - L.zoomFor(1512) * 0.7) < 1e-9);
  assert.equal(L.scaledZoom(1512, 'abc'), L.zoomFor(1512));
  assert.equal(L.scaledZoom(1512, 0), L.zoomFor(1512));
  assert.equal(L.scaledZoom(1512, 10), L.zoomFor(1512) * 0.4);          // floor at 40%
  assert.equal(L.scaledZoom(393, 60), 1);                               // phones keep their own layout
});

test('content size: larger than 100% never makes the column wider than the card', () => {
  const L = require('../src/okie-logic.js');
  assert.equal(L.scaledZoom(1000, 130), 1000 / 1200);                   // 0.65 x 1.3 would be 0.845, the card is only 1000 wide
  assert.equal(L.scaledZoom(1920, 130), 1.3);
  assert.ok(L.scaledZoom(800, 130) >= L.zoomFor(800));                  // never below FSC's own zoom
});

test('content size: a smaller column is centred in the leftover height, 100% leaves layout alone', () => {
  const L = require('../src/okie-logic.js');
  assert.equal(L.centerGap(800, 500, 70), 150);
  assert.equal(L.centerGap(800, 500, 100), 0);
  assert.equal(L.centerGap(800, 500, 120), 0);
  assert.equal(L.centerGap(400, 500, 70), 0);                           // never negative
  assert.equal(L.centerGap(800, 500, 100, true), 150, 'centred at 100% when asked to');
  assert.equal(L.centerGap(800, 500, 120, true), 150, 'and above it');
  assert.equal(L.centerGap(400, 500, 120, true), 0, 'never negative, centred or not');
  assert.equal(L.centerGap(801, 500, 100, true), 150, 'whole pixels');
});

test('phone panels start below the Home Assistant header, not 8px from the top of the window', () => {
  assert.equal(L.panelTop(0, 56), 56);                                  // the live case: top_offset 0, a 56px header over the page
  assert.equal(L.panelTop(0, 0), 0);                                    // kiosk dashboard with no header: nothing to clear
  assert.equal(L.panelTop(56, 0), 48);                                  // top_offset alone keeps its old 48px cap
  assert.equal(L.panelTop(30, 56), 56);                                 // whichever is bigger
  assert.equal(L.panelTop(0, 999), 120);                                // a bogus measurement cannot push the panel off the screen
  assert.equal(L.panelTop('x', undefined), 0);
});

test('content size on a phone: 100% changes nothing, smaller shrinks the column, larger stops at 100%', () => {
  assert.equal(L.phoneZoom(100), 1);
  assert.equal(L.phoneZoom(80), 0.8);
  assert.equal(L.phoneZoom(130), 1);
  assert.equal(L.phoneZoom(5), 0.7);                                    // text must stay in proportion on iOS (9px minimum)
  assert.equal(L.phoneZoom(53), 0.7);
  assert.equal(L.phoneZoom('x'), 1);
});

test('names: an HTML entity in a saved or incoming name is shown as the character (50&quot; TV)', () => {
  assert.equal(L.decodeEntities('50&quot; Crystal UHD (UN50U8000FFXZA)'), '50" Crystal UHD (UN50U8000FFXZA)');
  assert.equal(L.shortName('50&quot; TV', ''), '50" TV');
  assert.equal(L.shortName('Kitchen &amp; Dining Light', 'Kitchen &amp; Dining'), 'Light');
});

test('a touch tablet lets the panel reach lower than a desktop window', () => {
  assert.equal(L.layoutFor(2000).panelH, 672);
  assert.equal(L.layoutFor(2000, true).panelH, 840);
  assert.equal(L.layoutFor(900, true).panelH, 763, 'below the cap it follows the room');
  assert.equal(L.layoutFor(100, true).panelH, 380, 'never below the floor');
});

test('the list of cards on a tablet never ends in the middle of a card (w1Extra)', () => {
  const bottoms = [106, 216, 350, 484, 594, 704, 814, 995, 1105, 1215];       // card bottoms (px from the top of the list)
  assert.equal(L.w1Extra(bottoms, 520, 0, 400, 24), 0, 'nothing to show: no extra');
  assert.equal(L.w1Extra(bottoms, 520, 700, 0, 24), 0, 'no room: no extra');
  assert.equal(L.w1Extra(bottoms, 520, 300, 400, 24), 300, 'everything fits: all of it');
  // room for 200 more px: the box may reach 720 - 24 = 696 at most for a card bottom: the last whole card is the one ending at 594 -> 594 + 24 - 520
  assert.equal(L.w1Extra(bottoms, 520, 700, 200, 24), 98);
  assert.equal(L.w1Extra(bottoms, 520, 700, 40, 24), 0, 'not even one more card fits');
  assert.equal(L.w1Extra([], 520, 700, 200, 24), 0, 'no cards, no extra');
});

test('the column height is the zoomed one on every engine (iOS web views report the unzoomed box)', () => {
  assert.equal(L.columnHeight(404.5, 778, 0.52), 404.5, 'an engine that already reports the zoomed height');
  assert.ok(Math.abs(L.columnHeight(778, 778, 0.52) - 404.56) < 0.01, 'iOS: box = layout height -> layout x zoom');
  assert.equal(L.columnHeight(500, 500, 1), 500, 'no zoom: as it is');
  assert.equal(L.columnHeight(300, 300, undefined), 300);
});

test('a touch tablet centres a little above the middle (centerGap bias)', () => {
  assert.equal(L.centerGap(1124, 404, 100, true), 360);
  assert.equal(L.centerGap(1124, 404, 100, true, L.TABLET_CENTER_BIAS), 280);
  assert.equal(L.centerGap(1124, 404, 100, true, 0), 360, 'a bad bias is ignored');
  assert.equal(L.centerGap(300, 404, 100, true, 0.78), 0, 'taller than the room: no gap');
});

test('canScroll: only a scroll box with more inside than shows', () => {
  const box = o => Object.assign({ overflowX: 'visible', overflowY: 'visible', scrollWidth: 100, clientWidth: 100, scrollHeight: 100, clientHeight: 100 }, o);
  assert.equal(L.canScroll(box({})), false);
  assert.equal(L.canScroll(box({ overflowY: 'auto', scrollHeight: 400 })), true);
  assert.equal(L.canScroll(box({ overflowY: 'auto', scrollHeight: 100 })), false);          // nothing more inside
  assert.equal(L.canScroll(box({ overflowY: 'hidden', scrollHeight: 400 })), false);         // clipped, not scrollable by a finger
  assert.equal(L.canScroll(box({ overflowX: 'auto', scrollWidth: 300 })), true);             // sideways strips count too
});

test('rightLayout: the right column lays out the cards that are in it', () => {
  let r = L.rightLayout({ order: ['w:slider', 'w:deck', 'w:feeder'] });
  assert.equal(r.areas, '"w2" "w34" "w5"');
  assert.equal(r.rows, 'minmax(250px,1fr) minmax(250px,1fr) var(--okie-feed-h,92px)', 'two sliding cards share the room and are the same height');
  r = L.rightLayout({ order: ['w:deck', 'w:feeder', 'w:slider', 'light.lamp'] });
  assert.equal(r.names.join(), 'w34,w5,w2,p0');
  assert.equal(r.rows, '250px var(--okie-feed-h,92px) 250px auto', 'the two sliding cards are the same height, the favorite is as high as it is');
  r = L.rightLayout({ order: ['w:deck', 'w:feeder'] });                   // the sliding card went to the list: the cameras card takes the free height
  assert.equal(r.areas, '"w34" "w5"');
  assert.equal(r.rows.indexOf('minmax(var(--w34-row-height'), 0);
  r = L.rightLayout({ order: ['light.a', 'w:slider', 'light.b'] });        // favorites can sit between and above the cards
  assert.equal(r.names.join(), 'p0,w2,p1');
  assert.equal(r.rows.split(' ')[0], 'auto');
  r = L.rightLayout({ order: ['light.a'] });
  assert.equal(r.areas, '"p0"');
});

test('rightLayout: one card keeps the height the sliding card had with the cameras card under it', () => {
  let r = L.rightLayout({ order: ['w:slider', 'w:feeder'], reserve: true });
  assert.equal(r.areas, '"w2" "w5" "w34r"');                                                             // a free row where the cameras card was
  assert.equal(r.rows, 'minmax(250px,1fr) var(--okie-feed-h,92px) var(--w34-row-height,196px)');
  r = L.rightLayout({ order: ['w:slider'], reserve: true });
  assert.equal(r.rows, 'minmax(250px,1fr) var(--w34-row-height,196px)');
  r = L.rightLayout({ order: ['w:slider', 'light.a'], reserve: true });                                  // favorites in the column: no free row, the card still leaves the room
  assert.equal(r.areas, '"w2" "p0"');
  assert.ok(/^max\(250px,calc\(var\(--fsc-grid-h,464px\) - var\(--w34-row-height,196px\) - 24px\)\) auto$/.test(r.rows), r.rows);
  r = L.rightLayout({ order: ['w:slider', 'w:deck', 'w:feeder'], reserve: true });                       // the cameras card is there: nothing to keep free
  assert.equal(r.areas, '"w2" "w34" "w5"');
});

test('snapHeight: a column height sticks to a height that means something', () => {
  const targets = [{ v: 576, kind: 'grid' }, { v: 650, kind: 'other' }, { v: 700, kind: 'card' }];
  assert.deepEqual(L.snapHeight(660, targets, 22), { h: 650, hit: targets[1] });
  assert.equal(L.snapHeight(690, targets, 22).h, 700);
  assert.equal(L.snapHeight(610, targets, 22).hit, null);                 // between two: stays where it is
  assert.equal(L.snapHeight(610, targets, 22).h, 610);
  assert.equal(L.snapHeight(676, [{ v: 650, kind: 'other' }, { v: 700, kind: 'card' }], 30).h, 700);      // the nearer one wins
  assert.equal(L.snapHeight(500, [], 22).h, 500);
});

test('panelExtra: a column height set with its handle makes the panel exactly that tall; an unset column fills the room (both set used to leave a strip of nothing under the columns)', () => {
  const room = 500, grid = 722, auto = 352;
  assert.equal(L.panelExtra(auto, grid, room, [0, 0], 200), auto, 'nothing set: the panel fills the room');
  assert.equal(L.panelExtra(auto, grid, room, [785, 784], 200), 63, 'both set: as tall as the taller column');
  assert.equal(L.panelExtra(auto, grid, room, [785, 0], 200), auto, 'one set: the other column still fills the room, so the panel does too');
  assert.equal(L.panelExtra(auto, grid, room, [0, 600], 200), auto);
  assert.equal(L.panelExtra(auto, grid, room, [500, 500], 200), -222, 'shorter than the normal panel: the panel gets shorter');
  assert.equal(L.panelExtra(auto, grid, room, [2000, 0], 200), room, 'a column never reaches past the room');
  assert.equal(L.panelExtra(auto, grid, room, [150, 150], 200), auto, 'under the least height counts as not set');
  assert.equal(L.panelExtra(auto, grid, room, [undefined, null], 200), auto);
  assert.equal(L.panelExtra(0, grid, room, [], 200), 0, 'a desktop without heights is unchanged');
  assert.equal(L.panelExtra(auto, grid, room, ['785', '784.4'], 200), 63, 'saved numbers may be strings');
});

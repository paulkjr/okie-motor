'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const R = require('../src/okie-robomap.js');
const M = require('./data/robomap-mission.json');
const PMAP = M.pmap_id, FIT = R.BAKED[PMAP];
const pts = M.coverage_mm.map(p => [p[0] / 1000, p[1] / 1000]);

test('the baked fit lays the last whole-home clean inside the floor of the plan', () => {
  const inside = pts.filter(p => { const q = R.toPlan(FIT, p[0], p[1]); return R.inPoly(q[0], q[1], R.FLOOR); }).length / pts.length;
  assert.ok(inside > 0.97, 'inside ' + inside);
  // the edge of the cleaned area does not cross the outer walls of the plan: nothing but a hair's breadth outside
  const edge = M.coverage_poly[0][0], out = edge.filter(p => { const q = R.toPlan(FIT, p[0], p[1]); return !R.inPoly(q[0], q[1], R.FLOOR); }).length;
  assert.ok(out / edge.length < 0.015, 'edge points outside the floor: ' + out + ' of ' + edge.length);
  assert.deepEqual(R.fitFor(PMAP), FIT); assert.equal(R.fitFor('unknown'), null);
  assert.deepEqual(R.fitFor('x', { x: { mir: 0, deg: 1, s: 2, tx: 3, ty: 4 } }), { mir: 0, deg: 1, s: 2, tx: 3, ty: 4 }, 'a saved fit wins');
});

test('a hand nudge slides, turns and scales around the robot\'s own origin; zero nudge changes nothing', () => {
  const o = R.toPlan(FIT, 0, 0), p = R.toPlan(FIT, 2, 3);
  assert.deepEqual(R.toPlan(FIT, 2, 3, { dx: 0, dy: 0, rot: 0, scale: 0 }), p);
  const s = R.toPlan(FIT, 2, 3, { dx: 10, dy: -4 }); assert.ok(Math.abs(s[0] - p[0] - 10) < 1e-9 && Math.abs(s[1] - p[1] + 4) < 1e-9);
  const origin = R.toPlan(FIT, 0, 0, { rot: 30, scale: 10 }); assert.ok(Math.abs(origin[0] - o[0]) < 1e-9 && Math.abs(origin[1] - o[1]) < 1e-9, 'the origin stays put');
  const big = R.toPlan(FIT, 2, 3, { scale: 10 }), d0 = Math.hypot(p[0] - o[0], p[1] - o[1]), d1 = Math.hypot(big[0] - o[0], big[1] - o[1]); assert.ok(Math.abs(d1 / d0 - 1.1) < 1e-9);
  const rot = R.toPlan(FIT, 2, 3, { rot: 90 }), dot = (p[0] - o[0]) * (rot[0] - o[0]) + (p[1] - o[1]) * (rot[1] - o[1]); assert.ok(Math.abs(dot) < 1e-6, 'a quarter turn is perpendicular');
});

test('lining up a robot map finds the same fit from the cleaned cells alone (mirror, turn, scale, place)', async () => {
  const r = await R.fitCoverage(pts);
  assert.ok(r, 'a fit is found'); assert.equal(r.mir, FIT.mir);
  const dDeg = Math.abs(((r.deg - FIT.deg + 540) % 360) - 180); assert.ok(dDeg < 2, 'turn ' + r.deg + ' vs ' + FIT.deg);
  assert.ok(Math.abs(r.s / FIT.s - 1) < 0.06, 'scale ' + r.s); assert.ok(Math.hypot(r.tx - FIT.tx, r.ty - FIT.ty) < 40, 'place ' + r.tx + ',' + r.ty);
  assert.ok(r.iou > 0.4 && r.inside > 0.93, 'fit quality ' + r.iou + ' ' + r.inside);
});

test('lining up needs a real clean: too few cells, or a shape that cannot be the plan, gives no fit', async () => {
  assert.equal(await R.fitCoverage(pts.slice(0, 100)), null);
  const far = []; for (let i = 0; i < 400; i++) far.push([(i % 20) * 3, Math.floor(i / 20) * 3]);      // a 57 m x 57 m block of cells
  assert.equal(await R.fitCoverage(far), null);
});

test('the cleaned area, the stuck spots and the room tints are drawn in plan coordinates', () => {
  const d = { coverage_poly: M.coverage_poly, escape_events: M.escape_events, rooms: {} };
  const path = R.cleanedPath(d.coverage_poly, FIT); assert.equal((path.match(/Z/g) || []).length, R.ringsOf(d.coverage_poly).length, 'one closed shape per ring'); assert.ok(R.ringsOf(d.coverage_poly).length > 1, 'the edge and its holes'); assert.ok(path[0] === 'M');
  const nums = path.match(/-?\d+(\.\d+)?/g).map(Number); assert.ok(nums.every(n => n > 200 && n < 2000), 'every point is on the plan');
  const spots = R.stuckSpots(d.escape_events, FIT); assert.equal(spots.length, M.escape_events.length); assert.ok(spots.every(p => p.event && isFinite(p.x) && isFinite(p.y)));
  assert.equal(R.stuckSpots([{ event: 'x' }, null, { pose: ['a', 1] }], FIT).length, 0, 'broken events are skipped');
  const now = Date.parse('2026-10-14T21:00:00Z'), st = R.roomStates({ Bedroom: '2026-10-14T20:00:32Z', Kitchen: '2026-10-10T20:00:00Z', Lounge: 'not a date' }, now);
  assert.deepEqual(st, { bedroom: 'fresh', kitchen: 'old' });
  const svg = R.overlaySvg(d, FIT, { area: true, stuck: true, rooms: true }, { history: { Bedroom: '2026-10-14T20:00:32Z' }, now });
  assert.match(svg, /class="rm-area"/); assert.match(svg, /fill-rule="evenodd"/); assert.equal((svg.match(/class="rm-stuck"/g) || []).length, spots.length); assert.match(svg, /rm-room fresh/); assert.ok(!/rm-room old/.test(svg), 'only rooms with a known clean are tinted');
  const off = R.overlaySvg(d, FIT, { area: false, stuck: false, rooms: false }, {}); assert.ok(!/rm-area|rm-stuck|rm-room/.test(off)); assert.match(off, /^<g class="rm-ovl"/);
  const withRooms = R.overlaySvg(Object.assign({}, d, { rooms: { Bedroom: [[0, 8], [3, 8], [3, 5], [0, 5]] } }), FIT, { rooms: true }, {});
  assert.match(withRooms, /class="rm-room" d="M/); assert.ok(!/rm-room fresh/.test(withRooms), 'the robot\'s own room outlines replace the tints when it has them');
});

test('which config entry a robot belongs to: the entry_id on an entity of its device', () => {
  const states = { 'vacuum.r': { attributes: {} }, 'event.r_stuck': { attributes: { entry_id: 'E1' } }, 'event.other': { attributes: { entry_id: 'E2' } }, 'sensor.x': { attributes: {} } };
  const reg = { 'vacuum.r': { device_id: 'd1' }, 'event.r_stuck': { device_id: 'd1' }, 'event.other': { device_id: 'd9' } };
  assert.equal(R.entryIdOf(states, reg, 'vacuum.r'), 'E1');
  assert.equal(R.entryIdOf({ 'event.robo_home_mission_completed': { attributes: { entry_id: 'E3' } } }, {}, 'vacuum.r'), 'E3', 'without a registry, an event of a robot is a good guess');
  assert.equal(R.entryIdOf({}, {}, 'vacuum.r'), null);
});

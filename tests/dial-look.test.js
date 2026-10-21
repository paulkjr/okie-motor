'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/okie-logic.js');

test('dial look: the numbers stay inside their range and fall back to the wheel defaults', () => {
  assert.deepEqual(L.dialLook(undefined), { glowBlur: 80, glowSpread: 15, glowOpacity: 65, ticks: 100 });
  assert.deepEqual(L.dialLook({ glowBlur: 500, glowSpread: -4, glowOpacity: 'x', ticks: 10 }), { glowBlur: 200, glowSpread: 0, glowOpacity: 65, ticks: 40 });
  assert.equal(L.dialLook({ ticks: 130 }).ticks, 130);
  assert.equal(L.dialLook({ glowBlur: 0 }).glowBlur, 0, 'zero blur is a real choice, not a missing value');
});

test('dial look: a smaller dial gets a proportionally smaller glow, and no blur or strength means no glow', () => {
  const big = L.dialGlow({}, 420), small = L.dialGlow({}, 130);
  assert.ok(big.sigma > small.sigma * 2.5 && small.sigma > 0.8);
  assert.ok(small.widen < big.widen);
  assert.equal(L.dialGlow({ glowBlur: 0 }, 260).sigma, 0);
  assert.equal(L.dialGlow({ glowOpacity: 0 }, 260).alpha, 0);
  assert.ok(L.dialGlow({ glowOpacity: 100 }, 260).alpha <= 0.9 + 1e-9);
  assert.ok(L.dialGlow({ glowBlur: 160 }, 260).sigma > L.dialGlow({ glowBlur: 40 }, 260).sigma);
});

test('dial look: the tick density sets how many ticks run along the sweep, both ends get one', () => {
  const a = L.dialTickAngles({}, 135, 270);
  assert.equal(a.length, 65); assert.equal(a[0], 135); assert.equal(a[a.length - 1], 405);
  assert.ok(L.dialTickAngles({ ticks: 40 }, 135, 270).length < a.length);
  assert.ok(L.dialTickAngles({ ticks: 160 }, 135, 270).length > a.length);
  const even = L.dialTickAngles({}, 0, 64).map((x, i, all) => i ? x - all[i - 1] : 1);
  assert.ok(even.every(d => Math.abs(d - 1) < 1e-9), 'evenly spaced');
});

test('dial look: the slider glow follows the same numbers', () => {
  const g = L.sliderGlow({});
  assert.ok(g.blur > 5 && g.blur < 20 && g.spread > 0 && g.alpha > 0.3 && g.alpha <= 0.8);
  assert.equal(L.sliderGlow({ glowBlur: 0 }).blur, 0);
  assert.equal(L.sliderGlow({ glowOpacity: 0 }).alpha, 0);
});

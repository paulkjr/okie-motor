'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../src/okie-thermo.js');

test('colour: blue up to 69F, orange by 75F, red at the top, the same for Celsius thermostats', () => {
  assert.deepEqual(T.colorFor(50, 50, 90, '°F'), { r: 20, g: 70, b: 190 });          // bottom of the range: deep blue
  assert.deepEqual(T.colorFor(69, 50, 90, '°F'), { r: 45, g: 130, b: 255 });         // 69F: blue
  assert.deepEqual(T.colorFor(75, 50, 90, '°F'), { r: 255, g: 150, b: 45 });         // 75F: orange
  assert.deepEqual(T.colorFor(90, 50, 90, '°F'), { r: 255, g: 45, b: 85 });          // top: red
  const mid = T.colorFor(72, 50, 90, '°F');
  assert.ok(mid.r > 45 && mid.r < 255 && mid.b < 255 && mid.b > 45, 'blends between blue and orange');
  assert.deepEqual(T.colorFor(22.2222, 10, 32.2222, '°C'), T.colorFor(72, 50, 90, '°F'), '22.2C is 72F');
  assert.deepEqual(T.colorFor(5, 16, 30, '°C'), T.colorFor(16, 16, 30, '°C'), 'below the range it is the bottom colour, not an error');
});

test('rotation: one Fahrenheit degree turns the wheel the same as 1.8 Celsius-scaled degrees', () => {
  assert.equal(T.rotationFor(50, 50, '°F'), 0);
  assert.ok(Math.abs(T.rotationFor(51, 50, '°F') - 236 / 69) < 1e-9);
  assert.ok(Math.abs(T.rotationFor(21, 20, '°C') - 236 / 69 * 1.8) < 1e-9);
  assert.ok(T.rotationFor(80, 50, '°F') > T.rotationFor(70, 50, '°F'), 'warmer turns further');
});

test('snapTo: lands on the thermostat grid and stays inside its range', () => {
  assert.equal(T.snapTo(71.4, 50, 90, 1), 71);
  assert.equal(T.snapTo(71.6, 50, 90, 1), 72);
  assert.equal(T.snapTo(21.3, 16, 30, 0.5), 21.5);
  assert.equal(T.snapTo(21.2, 16, 30, 0.5), 21);
  assert.equal(T.snapTo(200, 50, 90, 1), 90);
  assert.equal(T.snapTo(-5, 50, 90, 1), 50);
  assert.equal(T.snapTo(70.2, 50, 90, 0), 70, 'a missing step counts as 1');
});

test('fmt: whole degrees on a one-degree thermostat, a decimal when it moves in halves, a comma in German', () => {
  assert.equal(T.fmt(71.6, 1), '72');
  assert.equal(T.fmt(21.5, 0.5), '21.5');
  assert.equal(T.fmt(21, 0.5), '21.0');
  assert.equal(T.fmt(21.5, 0.5, true), '21,5');
  assert.equal(T.fmt(null, 1), '–');
  assert.equal(T.fmt(NaN, 1), '–');
});

test('flick physics: a careful single move does not coast, a fast flick keeps going and slows down', () => {
  assert.equal(T.nudgeVelocity(0, 1, 500), 0, 'a pause between moves resets the speed');
  assert.equal(T.nudgeVelocity(0.3, 1, 0), 0);
  const v = T.nudgeVelocity(0, 0.5, 10);                                                // 0.05 degrees per ms
  assert.ok(Math.abs(v - 0.55 * 0.05) < 1e-12);
  assert.ok(Math.abs(T.nudgeVelocity(0.1, 0.5, 10) - (0.1 * 0.45 + 0.55 * 0.05)) < 1e-12, 'blends with the last speed');
  let vel = 0.05, dist = 0, frames = 0;
  while (Math.abs(vel) >= 0.006 && frames < 1000) { const s = T.coastStep(vel, 16); dist += s.delta; vel = s.velocity; frames++; }
  assert.ok(dist > 0.3 && dist < 6, 'a flick coasts a few degrees, not zero and not forever: ' + dist);
  assert.ok(frames < 120, 'and it stops within about two seconds');
  assert.equal(T.coastStep(0.05, 1000).delta, 0.05 * 48, 'a long frame (tab in the background) is capped, the value cannot jump');
  assert.ok(T.coastStep(-0.05, 16).delta < 0, 'it coasts the way it was going');
});

test('trust your own number: for 15 seconds after sending, a stale report from the thermostat does not move the dial', () => {
  const base = { pendingAt: 1000, pendingValue: 70 };
  assert.deepEqual(T.resolveTarget(Object.assign({ server: 72, now: 3000 }, base)), { value: 70, pending: true });     // still the old target on the server
  assert.deepEqual(T.resolveTarget(Object.assign({ server: 70, now: 3000 }, base)), { value: 70, pending: false });    // it caught up
  assert.deepEqual(T.resolveTarget(Object.assign({ server: 72, now: 17000 }, base)), { value: 72, pending: false });   // gave up waiting: the server wins again
  assert.deepEqual(T.resolveTarget({ server: 72, pendingAt: 0, pendingValue: null, now: 3000 }), { value: 72, pending: false }, 'nothing sent: show the server');
  assert.deepEqual(T.resolveTarget(Object.assign({ server: null, now: 3000 }, base)), { value: 70, pending: true }, 'no target reported yet: keep ours');
});

test('the fonts of the Thermo Dial project are embedded (Sora and Manrope as woff2), not fetched from a font server', () => {
  const fs = require('node:fs'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../src/okie-thermo-fonts.js'), 'utf8');
  assert.ok(src.includes('font-family:"Okie Sora"') && src.includes('font-family:"Okie Manrope"'));
  assert.ok(!/https?:\/\/fonts\./.test(src.replace(/https:\/\/github\.com[^\s)]*|https:\/\/openfontlicense\.org/g, '')), 'no font server in the CSS');
  const blobs = [...src.matchAll(/base64,([A-Za-z0-9+/=]+)\)/g)].map(m => Buffer.from(m[1], 'base64'));
  assert.equal(blobs.length, 2);
  blobs.forEach(b => { assert.equal(b.slice(0, 4).toString('latin1'), 'wOF2', 'a real woff2 file'); assert.ok(b.length > 5000 && b.length < 80000); });
  assert.ok(/SIL Open Font License/.test(src), 'the licence is named in the file');
  const css = fs.readFileSync(path.join(__dirname, '../src/okie-thermo.js'), 'utf8');
  assert.ok(/\.th-num\{font-family:"Okie Sora"/.test(css) && /\.dctl\.thermo\{[^}]*"Okie Manrope"/.test(css), 'the dial uses them');
});

test('glow of the design: a 65 % drop shadow of the rim, blur 80 and spread 15 (a 34 px band blurred with sigma 40): soft, symmetric, gone within 60 units', () => {
  assert.ok(Math.abs(T.glowAlpha(0) - 0.213) < 0.01, 'about 21 % at the rim');
  assert.ok(T.glowAlpha(0) < 0.65 * 0.4, 'a blurred thin band is far fainter than the 65 % it is set to');
  for (const d of [5, 15, 30, 45]) assert.ok(Math.abs(T.glowAlpha(d) - T.glowAlpha(-d)) < 1e-9, 'inside and outside are the same: ' + d);
  let prev = T.glowAlpha(0);
  for (const d of [10, 20, 30, 40, 50, 60]) { const a = T.glowAlpha(d); assert.ok(a < prev, 'fades away from the rim at ' + d); prev = a; }
  assert.ok(T.glowAlpha(60) < 0.005, 'nothing visible 60 units from the rim');
});

test('dial look: the shipped look gives the same colours, glow and ticks as before it was adjustable', () => {
  const D = T.DEFAULT_LOOK;
  assert.deepEqual(T.colorFor(50, 50, 90, '°F', D), T.colorFor(50, 50, 90, '°F'));
  assert.deepEqual(T.colorFor(90, 50, 90, '°F', D), { r: 255, g: 45, b: 85 });
  assert.equal(T.tickCount(D), 197);
  assert.equal(T.glowReach(D), 65);
  assert.ok(Math.abs(T.glowAlpha(0, D) - 0.214) < 0.002, 'peak of the glow at the rim: ' + T.glowAlpha(0, D));
});

test('dial look: your own scale colours and the two temperatures where it changes', () => {
  const look = { c0: '#000000', c1: '#00ff00', c2: '#ffff00', c3: '#ffffff', cool: 60, warm: 80 };
  assert.deepEqual(T.colorFor(50, 50, 90, '°F', look), { r: 0, g: 0, b: 0 }, 'bottom of the range');
  assert.deepEqual(T.colorFor(60, 50, 90, '°F', look), { r: 0, g: 255, b: 0 }, 'the cool limit');
  assert.deepEqual(T.colorFor(80, 50, 90, '°F', look), { r: 255, g: 255, b: 0 }, 'the warm limit');
  assert.deepEqual(T.colorFor(90, 50, 90, '°F', look), { r: 255, g: 255, b: 255 }, 'top of the range');
  const c = T.colorFor(21, 10, 32, '°C', look);                                     // 21 C = 69.8 F, between the limits
  assert.ok(c.g === 255 && c.r > 0 && c.r < 255, 'Celsius is converted before the limits apply: ' + JSON.stringify(c));
});

test('dial look: bad values fall back to safe ones, the warm limit stays above the cool one', () => {
  const n = T.normalizeLook({ glowBlur: 999, glowSpread: -4, glowOpacity: 500, ticks: 5, c0: 'nope', c1: '#ABCDEF', cool: 80, warm: 60 });
  assert.equal(n.glowBlur, 200); assert.equal(n.glowSpread, 0); assert.equal(n.glowOpacity, 100); assert.equal(n.ticks, 40);
  assert.equal(n.c0, T.DEFAULT_LOOK.c0, 'not a colour: the shipped one'); assert.equal(n.c1.toLowerCase(), '#abcdef');
  assert.ok(n.warm > n.cool);
  assert.deepEqual(T.normalizeLook(null), T.DEFAULT_LOOK);
});

test('dial look: glow blur, spread and strength do what their names say; tick density changes the count', () => {
  const base = T.DEFAULT_LOOK;
  const wide = Object.assign({}, base, { glowBlur: 160 }), thin = Object.assign({}, base, { glowBlur: 20 });
  assert.ok(T.glowReach(wide) > T.glowReach(base) && T.glowReach(thin) < T.glowReach(base), 'blur sets how far the glow reaches');
  assert.ok(T.glowAlpha(40, wide) > T.glowAlpha(40, thin), 'a soft glow is still visible further out than a tight one');
  const fat = Object.assign({}, base, { glowSpread: 40 });
  assert.ok(T.glowAlpha(20, fat) > T.glowAlpha(20, base), 'spread pushes the strong part outwards');
  assert.ok(Math.abs(T.glowAlpha(0, Object.assign({}, base, { glowOpacity: 100 })) / T.glowAlpha(0, base) - 100 / 65) < 0.01, 'strength scales the whole glow');
  assert.equal(T.glowAlpha(0, Object.assign({}, base, { glowOpacity: 0 })), 0, 'strength 0 is no glow');
  assert.ok(T.tickCount(Object.assign({}, base, { ticks: 160 })) > 197 && T.tickCount(Object.assign({}, base, { ticks: 40 })) < 197);
  assert.equal(T.rgbToHex(T.hexToRgb('#2d82ff')), '#2d82ff');
});

test('dial look: the card ships the same default look the dial falls back to', () => {
  assert.deepEqual(require('../src/okie-card.js').DEFAULTS.thermo, T.DEFAULT_LOOK);
});

test('thermo: a colour temperature becomes the colour of that light', () => {
  const warm = T.kelvinToRgb(2700), neutral = T.kelvinToRgb(4000), cool = T.kelvinToRgb(6500), cold = T.kelvinToRgb(10000);
  assert.equal(warm.r, 255); assert.ok(warm.g > 150 && warm.g < 185 && warm.b > 70 && warm.b < 110, 'warm white is amber: ' + JSON.stringify(warm));
  assert.ok(neutral.g > warm.g && neutral.b > warm.b, 'neutral is whiter than warm');
  assert.ok(cool.r > 240 && cool.g > 240 && cool.b > 240, 'daylight is nearly white');
  assert.ok(cold.b === 255 && cold.r < 220, 'a cold white leans blue');
  assert.deepEqual(T.kelvinToRgb('nonsense'), T.kelvinToRgb(2700), 'junk falls back to warm white');
});

test('thermo: the colour a light shines in (colour temperature mode, rgb, nothing known, last seen)', () => {
  assert.deepEqual(T.lightRgb({ color_mode: 'color_temp', color_temp_kelvin: 2700, rgb_color: [10, 20, 30] }), T.kelvinToRgb(2700), 'colour temperature wins in that mode');
  assert.deepEqual(T.lightRgb({ color_mode: 'rgb', rgb_color: [255, 90, 79], color_temp_kelvin: 4000 }), { r: 255, g: 90, b: 79 });
  assert.deepEqual(T.lightRgb({ color_mode: 'xy', rgb_color: [300, -5, 79.4] }), { r: 255, g: 0, b: 79 }, 'channels are clamped and rounded');
  assert.deepEqual(T.lightRgb({ color_temp: 370 }), T.kelvinToRgb(1000000 / 370), 'mireds work too');
  assert.deepEqual(T.lightRgb({ brightness: 90 }), T.WARM_WHITE, 'a light that says nothing is warm white');
  assert.deepEqual(T.lightRgb({}, { r: 1, g: 2, b: 3 }), { r: 1, g: 2, b: 3 }, 'the last colour seen is the fallback');
  assert.deepEqual(T.lightRgb({ rgb_color: ['x', 1, 2] }), T.WARM_WHITE, 'a broken rgb is ignored');
  assert.deepEqual(T.lightRgb(null), T.WARM_WHITE);
});

test('thermo: the glow gets stronger as the light gets brighter', () => {
  assert.equal(T.glowGain(0), 0); assert.equal(T.glowGain(100), 1); assert.equal(T.glowGain(150), 1); assert.equal(T.glowGain(-5), 0); assert.equal(T.glowGain('x'), 0);
  let prev = 0; for (let p = 1; p <= 100; p++) { const gn = T.glowGain(p); assert.ok(gn > prev, 'rises at ' + p); prev = gn; }
  assert.ok(T.glowGain(50) > .5 && T.glowGain(50) < .7, 'a bit gentler in the middle than a straight line');
});

test('thermo: a percent wheel turns through the same sweep as the thermostat', () => {
  assert.ok(Math.abs(100 * T.DEG_PER_PCT - 236) < 1e-9);
});

test('thermo: a flick keeps its speed, a drag that rested before the finger lifted does not coast', () => {
  const T = require('../src/okie-thermo.js');
  assert.equal(T.releaseVelocity(0.12, 30), 0.12);          // lifted right out of a move: it coasts
  assert.equal(T.releaseVelocity(0.12, 90), 0.12);
  assert.equal(T.releaseVelocity(0.12, 91), 0);             // rested for a moment: no flick
  assert.equal(T.releaseVelocity(-0.3, 400), 0);
});

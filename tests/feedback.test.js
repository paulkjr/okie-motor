'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/okie-feedback.js');

test('kinds and the older millisecond calls map to a profile', () => {
  assert.equal(F.profile('switch').kind, 'switch');
  assert.equal(F.profile(8).kind, 'tap');
  assert.equal(F.profile(12).kind, 'switch');
  assert.equal(F.profile(30).kind, 'error');
  assert.equal(F.profile(5).kind, 'detent');
  assert.equal(F.profile().kind, 'tap');
});

test('haptic and sound follow the two settings', () => {
  assert.deepEqual(Object.keys(F.plan('tap', { haptic: true, sound: false }, null, 0)).sort(), ['skipped', 'sound', 'vibrate']);
  assert.equal(F.plan('tap', { haptic: true }, null, 0).vibrate, 8);
  assert.equal(F.plan('tap', { haptic: false }, null, 0).vibrate, 0);
  assert.equal(F.plan('tap', { haptic: true }, null, 0).sound, null);
  assert.equal(F.plan('tap', { haptic: false, sound: true }, null, 0).sound.kind, 'tap');
});

test('ticks are spaced; an error always goes through', () => {
  assert.equal(F.plan('detent', { haptic: true }, 100, 110).skipped, true);
  assert.equal(F.plan('detent', { haptic: true }, 100, 100 + F.MIN_GAP).skipped, false);
  assert.equal(F.plan('error', { haptic: true }, 100, 101).skipped, false);
});

test('every kind has what the sound needs', () => {
  F.KEEP.forEach(k => { const p = F.profile(k); assert.ok(p.ms > 0 && p.hz > 0 && p.len > 0 && p.gain > 0 && p.gain < 0.2, k); });
});

test('the settings page has both rows and the card default', () => {
  const fs = require('fs'), set = fs.readFileSync(__dirname + '/../src/okie-settings.js', 'utf8'), card = fs.readFileSync(__dirname + '/../src/okie-card.js', 'utf8');
  assert.ok(/id: 'm_sound'/.test(set) && /path: 'sound'/.test(set));
  assert.ok(/haptic: true, sound: false/.test(card));
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const A = require('../src/okie-arrange.js');
const F = require('../src/okie-feedback.js');

const slots = [{ x: 0, y: 0, w: 100, h: 80 }, { x: 110, y: 0, w: 100, h: 80 }, { x: 220, y: 0, w: 100, h: 80 }, { x: 0, y: 90, w: 100, h: 80 }, { x: 110, y: 90, w: 100, h: 80 }];

test('the nearest slot is found in both directions of a grid', () => {
  assert.equal(A.nearestSlot(50, 40, slots), 0);
  assert.equal(A.nearestSlot(160, 40, slots), 1);
  assert.equal(A.nearestSlot(60, 130, slots), 3);
  assert.equal(A.nearestSlot(400, 400, slots), 4);
  assert.equal(A.nearestSlot(270, 20, slots), 2);
});

test('dropping on another slot moves the card and keeps the rest in order', () => {
  assert.deepEqual(A.moved(['a', 'b', 'c', 'd'], 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(A.moved(['a', 'b', 'c', 'd'], 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(A.moved(['a', 'b'], 0, 9), ['b', 'a']);
  assert.deepEqual(A.moved(['a', 'b'], 5, 0), ['a', 'b']);
});

test('the others move to the slot of their new place', () => {
  const order = ['a', 'b', 'c', 'd', 'e'], next = A.moved(order, 0, 3);      // a goes to slot 3: b c d move one slot back
  const s = A.shifts(order, next, slots, 'a');
  assert.deepEqual(s.b, { dx: -110, dy: 0 });
  assert.deepEqual(s.c, { dx: -110, dy: 0 });
  assert.deepEqual(s.d, { dx: 220, dy: -90 });      // d wraps from the start of the second row to the end of the first
  assert.equal(s.a, undefined);
  assert.equal(s.e, undefined);
});

test('a card that did not change place has no shift', () => {
  const order = ['a', 'b', 'c'];
  assert.deepEqual(A.shifts(order, order, slots, 'a'), {});
});

test('a move before the hold is a scroll; a small one is not; zoom counts', () => {
  assert.equal(A.isScroll(0, 12, 1), true);
  assert.equal(A.isScroll(3, 3, 1), false);
  assert.equal(A.isScroll(0, 12, 2), false);
  assert.ok(A.HOLD_EDIT_MS < A.HOLD_MS);
});

test('an answer is made readable aloud', () => {
  assert.equal(F.speakable('**Done.** The *patio light* is [off](http://x.y) now 💡'), 'Done. The patio light is off now');
  assert.equal(F.speakable('- one\n- two\n\n```js\ncode()\n```\nthree'), 'one. two. three');
  const long = ('This is a sentence. ').repeat(40);
  assert.ok(F.speakable(long).length <= 330 && F.speakable(long).endsWith('.'));
  assert.equal(F.speakable(null), '');
});

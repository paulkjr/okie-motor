'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../src/okie-logic.js');

test('text size: the setting becomes a multiplier between 0.7 and 1.4, odd values mean normal', () => {
  assert.equal(L.textScale(100), 1); assert.equal(L.textScale(70), 0.7); assert.equal(L.textScale(140), 1.4); assert.equal(L.textScale(125), 1.25);
  assert.equal(L.textScale(10), 0.7); assert.equal(L.textScale(900), 1.4);
  assert.equal(L.textScale(undefined), 1); assert.equal(L.textScale('x'), 1); assert.equal(L.textScale(0), 1); assert.equal(L.textScale('110'), 1.1);
});

test('text size: every font size of a stylesheet follows the setting and the zoom of an engine that does not zoom text', () => {
  const css = '.a{font-size:13px;line-height:20px;width:100px}.b{font-size: 12.5px;color:red}.c{font-size:14px!important}.d{height:13px}';
  const out = L.scaleFonts(css);
  const px = n => `max(calc(${n}px*var(--okie-fs,1)*var(--okie-fz,1)),min(calc(${n}px*var(--okie-fs,1)),calc(11px*var(--okie-fs,1))))`;
  assert.equal(out, `.a{font-size:${px(13)};line-height:20px;width:100px}.b{font-size: ${px(12.5)};color:red}.c{font-size:${px(14)}!important}.d{height:13px}`);
  // sizes worked out from a box follow the zoom
  assert.equal(L.scaleFonts('.x{font-size:calc(var(--th-h)*.3)}.y{font-size:var(--th-num)}'), '.x{font-size:calc((calc(var(--th-h)*.3))*var(--okie-fz,1))}.y{font-size:calc((var(--th-num))*var(--okie-fz,1))}');
  // relative sizes and keywords stay
  const keep = '.w{font-size:1.2em}.v{font-size:50%}.u{font-size:inherit}';
  assert.equal(L.scaleFonts(keep), keep);
  assert.equal(L.scaleFonts(''), ''); assert.equal(L.scaleFonts(undefined), '');
  // twice is harmless
  assert.equal(L.scaleFonts(out), out);
  assert.equal(L.scaleFonts(L.scaleFonts('.y{font-size:var(--th-num)}')), L.scaleFonts('.y{font-size:var(--th-num)}'));
});

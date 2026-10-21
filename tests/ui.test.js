'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const UI = require('../src/okie-ui.js');

test('an engine that reports a zoomed column at its layout size is told apart from one that scales it', () => {
  assert.equal(UI.reportsUnzoomed(1000, 1000, 0.8), true, 'older Safari: rectangle = layout size although the column is shown at 80%');
  assert.equal(UI.reportsUnzoomed(800, 1000, 0.8), false, 'Chrome, Firefox, current Safari: the rectangle already carries the zoom');
  assert.equal(UI.reportsUnzoomed(1000, 1000, 1), false, 'no zoom, nothing to correct');
  assert.equal(UI.reportsUnzoomed(0, 0, 0.8), false, 'a hidden column cannot be measured');
});

function fakeColumn(zoom, layoutW, reportedW) {
  return { nodeType: 1, style: { zoom: String(zoom) }, offsetWidth: layoutW, parentNode: null, getBoundingClientRect: () => ({ width: reportedW }) };
}
test('screenRect gives pointer-pixel geometry in both kinds of engine', () => {
  const real = { left: 160, top: 80, right: 560, bottom: 120, width: 400, height: 40 };            // where a slider really is on screen at zoom .8
  const modern = { nodeType: 1, style: {}, parentNode: fakeColumn(0.8, 1000, 800), getBoundingClientRect: () => real };
  assert.deepEqual(UI.screenRect(modern), real, 'a scaling engine is used as it is');
  const old = { nodeType: 1, style: {}, parentNode: fakeColumn(0.8, 1000, 1000), getBoundingClientRect: () => ({ left: 200, top: 100, right: 700, bottom: 150, width: 500, height: 50 }) };
  const fixed = UI.screenRect(old);
  assert.deepEqual([fixed.left, fixed.top, fixed.width, fixed.height], [160, 80, 400, 40], 'an unscaling engine is brought to screen pixels');
  const plain = { nodeType: 1, style: {}, parentNode: null, getBoundingClientRect: () => real };
  assert.equal(UI.screenRect(plain), real, 'outside any zoomed column nothing changes');
});

test('pull to open: progress along the pill and where letting go opens it', () => {
  assert.equal(UI.pullProgress(-20, 100), 0);
  assert.equal(UI.pullProgress(50, 100), 0.5);
  assert.equal(UI.pullProgress(400, 100), 1);
  assert.equal(UI.pullProgress(10, 0), 0);
  assert.equal(UI.pullOpens(0.3), false);
  assert.equal(UI.pullOpens(0.55), true);
  assert.equal(UI.pullOpens(1), true);
});

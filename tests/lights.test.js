'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../src/okie-lights.js');

test('what counts as a light, and whether it dims', () => {
  assert.equal(M.isLight('light.patio'), true);
  assert.equal(M.isLight('switch.patio'), false);
  assert.equal(M.isLight(null), false);
  assert.equal(M.dimmable({ supported_color_modes: ['brightness'] }), true);
  assert.equal(M.dimmable({ supported_color_modes: ['color_temp', 'xy'] }), true);
  assert.equal(M.dimmable({ supported_color_modes: ['onoff'] }), false, 'on/off only: a toggle, no bar');
  assert.equal(M.dimmable({ supported_color_modes: ['unknown'] }), false);
  assert.equal(M.dimmable({}), false);
  assert.equal(M.dimmable(null), false);
});

test('brightness in percent: 0 when off, 100 when on without a value, never 0 while on', () => {
  assert.equal(M.pctOf({ state: 'off', attributes: { brightness: 200 } }), 0);
  assert.equal(M.pctOf({ state: 'on', attributes: {} }), 100);
  assert.equal(M.pctOf({ state: 'on', attributes: { brightness: 255 } }), 100);
  assert.equal(M.pctOf({ state: 'on', attributes: { brightness: 128 } }), 50);
  assert.equal(M.pctOf({ state: 'on', attributes: { brightness: 1 } }), 1, 'a very dim light still reads as on');
  assert.equal(M.pctOf(undefined), 0);
});

test('the finger on the bar: the handle centre runs from half a handle in to half a handle in', () => {
  assert.equal(M.pctFromX(100, 100, 300, 36), 0, 'left of the first position clamps to 0');
  assert.equal(M.pctFromX(118, 100, 300, 36), 0);
  assert.equal(M.pctFromX(250, 100, 300, 36), 50);
  assert.equal(M.pctFromX(382, 100, 300, 36), 100);
  assert.equal(M.pctFromX(900, 100, 300, 36), 100, 'past the end clamps to 100');
  assert.equal(M.pctFromX(50, 0, 30, 36), 0, 'a bar narrower than the handle is 0, not NaN');
});

test('the tabs: favorites first when there are any, rooms that have lights, then All', () => {
  const ids = ['light.a', 'light.b', 'light.c'];
  const rooms = [{ id: 'living-room', name: 'Living Room', ids: ['light.a', 'switch.x'] }, { id: 'kitchen', name: 'Kitchen', ids: ['sensor.t'] }, { id: 'bedroom', name: 'Bedroom', ids: ['light.b', 'light.c'] }];
  const labels = { fav: 'Favorites', all: 'All lights' };
  const tabs = M.buildTabs(ids, ['light.b', 'light.zzz', 'switch.x'], rooms, labels);
  assert.deepEqual(tabs.map(t => t.id), ['fav', 'room:living-room', 'room:bedroom', 'all']);
  assert.deepEqual(tabs[0].ids, ['light.b'], 'only real lights, only hearted ones');
  assert.deepEqual(tabs[1].ids, ['light.a'], 'a room lists only its lights');
  assert.equal(tabs[3].name, 'All lights');
  assert.deepEqual(M.buildTabs(ids, [], rooms, labels).map(t => t.id), ['fav', 'room:living-room', 'room:bedroom', 'all'], 'Favorites is always there, so you can fill it');
  assert.deepEqual(M.buildTabs(ids, [], rooms, labels)[0].ids, []);
  assert.deepEqual(M.buildTabs([], ['light.a'], rooms, labels), [], 'no lights at all: no tabs');
});

test('a room you made yourself shows as a tab even before it has a light', () => {
  const tabs = M.buildTabs(['light.a'], [], [{ id: 'garage', name: 'Garage', ids: [], extra: true }, { id: 'attic', name: 'Attic', ids: [] }], { fav: 'F', all: 'A' });
  assert.deepEqual(tabs.map(t => t.id), ['fav', 'room:garage', 'all'], 'an empty room of Home Assistant stays hidden, an empty room you made stays');
});

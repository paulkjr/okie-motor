'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Y = require('../src/okie-sync.js');

const user = { favorites: ['light.a', 'climate.b'], glass: { cardTint: 30 }, scale: 80, rest: { enabled: false }, rooms: [{ id: 'r1', name: 'Kitchen', ids: ['light.a'] }] };

test('shared() leaves out what belongs to one screen, and does not change the original', () => {
  const s = Y.shared(user);
  assert.equal(s.scale, undefined); assert.equal(s.rest, undefined);
  assert.deepEqual(s.favorites, ['light.a', 'climate.b']); assert.equal(s.glass.cardTint, 30);
  assert.equal(user.scale, 80);
});

test('combine() puts the shared settings of another screen next to this screen\'s own size', () => {
  const c = Y.combine({ favorites: ['x'], glass: { cardTint: 10 } }, user);
  assert.deepEqual(c.favorites, ['x']); assert.equal(c.scale, 80); assert.deepEqual(c.rest, { enabled: false });
});

test('size() counts the values so a rich set beats an empty one', () => {
  assert.equal(Y.size({}), 0); assert.equal(Y.size({ a: [] }), 1); assert.ok(Y.size(user) > Y.size({ favorites: ['a'] }));
});

test('a screen that was never synced keeps its richer settings, else takes the shared ones', () => {
  assert.equal(Y.firstSyncWinner(Y.shared(user), { favorites: ['a'] }), 'local');
  assert.equal(Y.firstSyncWinner({}, Y.shared(user)), 'remote');
  assert.equal(Y.firstSyncWinner({ a: 1 }, { b: 2 }), 'remote');
});

test('export then import gives the same settings, with the stamp', () => {
  const file = Y.buildExport(user, { version: '0.40.0', now: Date.UTC(2026, 9, 19, 12, 0, 0) });
  assert.equal(file.app, 'okie-motor'); assert.equal(file.exported, '2026-10-19T12:00:00.000Z');
  const r = Y.parseImport(JSON.stringify(file));
  assert.equal(r.ok, true); assert.deepEqual(r.settings, user); assert.equal(r.favorites, 2); assert.equal(r.version, '0.40.0');
});

test('import refuses anything that is not our file', () => {
  assert.equal(Y.parseImport('nope').error, 'json');
  assert.equal(Y.parseImport(JSON.stringify({ hello: 1 })).error, 'notours');
  assert.equal(Y.parseImport(JSON.stringify({ app: 'okie-motor' })).error, 'nosettings');
  assert.equal(Y.parseImport(JSON.stringify({ app: 'okie-motor', settings: [1] })).error, 'nosettings');
  assert.equal(Y.parseImport('{"app":"okie-motor","settings":{"a":"' + 'x'.repeat(1100000) + '"}}').error, 'toobig');
});

test('the file name carries the date', () => {
  assert.equal(Y.fileName(new Date(2026, 9, 5)), 'okie-motor-settings-2026-10-05.json');
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../src/okie-rooms.js');

test('rooms: a configured list is cleaned up (names, unique ids, entity ids only)', () => {
  const rooms = R.normalizeRooms([
    { name: ' Living Room ', items: ['climate.living_room', 'climate.living_room', 'not-an-entity', 42], area: 'Living Room' },
    { name: 'Patio', entities: ['light.patio_light', 'camera.front_door_live_view'], icon: 'sun' },
    { name: 'Patio', items: [] },
    { items: ['light.x'] }, null, 'x',
  ]);
  assert.deepEqual(rooms.map(r => r.id), ['living-room', 'patio', 'patio-2']);
  assert.deepEqual(rooms[0].items, ['climate.living_room']);
  assert.deepEqual(rooms[0].areas, ['Living Room']);
  assert.deepEqual(rooms[1].items, ['light.patio_light', 'camera.front_door_live_view']);
  assert.equal(rooms[1].icon, 'sun');
  assert.deepEqual(R.normalizeRooms(undefined), []);
});

test('rooms: without a list every Home Assistant area with devices is a room, in alphabetical order', () => {
  const rooms = R.buildRooms([], { Bedroom: ['light.bed', 'media_player.tv'], Kitchen: [], 'Living Room': ['climate.living_room'] });
  assert.deepEqual(rooms.map(r => r.name), ['Bedroom', 'Living Room']);
  assert.deepEqual(rooms[0].ids, ['light.bed', 'media_player.tv']);
  assert.equal(rooms[0].custom, false);
});

test('rooms: a configured list wins; its own devices come first, then the devices of its areas, without doubles', () => {
  const areas = { 'Living Room': ['climate.living_room', 'media_player.tv', 'switch.couch_lamp_socket'], Bedroom: ['switch.bedlight'] };
  const rooms = R.buildRooms([
    { name: 'Living Room', area: 'living room', items: ['switch.kindle_fire_screen', 'media_player.tv'] },
    { name: 'Patio', items: ['light.patio_light', 'camera.front_door_live_view'] },
  ], areas);
  assert.deepEqual(rooms.map(r => r.name), ['Living Room', 'Patio']);
  assert.deepEqual(rooms[0].ids, ['switch.kindle_fire_screen', 'media_player.tv', 'climate.living_room', 'switch.couch_lamp_socket'], 'area names match without regard to capitals');
  assert.deepEqual(rooms[1].ids, ['light.patio_light', 'camera.front_door_live_view']);
  assert.ok(rooms.every(r => r.custom === true));
  assert.deepEqual(R.buildRooms([{ name: 'Nowhere', area: 'Garage' }], areas)[0].ids, [], 'an area that does not exist is simply empty');
});

test('rooms: the icon follows the name unless the room names its own', () => {
  const ic = name => R.roomIcon({ name });
  assert.equal(ic('Bedroom'), 'moon'); assert.equal(ic('Living Room'), 'tv'); assert.equal(ic('Patio'), 'sun'); assert.equal(ic('Kitchen'), 'flame');
  assert.equal(ic('Front door'), 'door'); assert.equal(ic('Wohnzimmer'), 'tv'); assert.equal(ic('Schlafzimmer'), 'moon'); assert.equal(ic('Something else'), 'homeroom');
  assert.equal(R.roomIcon({ name: 'Bedroom', icon: 'star' }), 'star');
});

test('rooms: a room counts the devices that exist and the ones that are on', () => {
  const states = { 'light.a': 'on', 'light.b': 'off', 'media_player.tv': 'playing', 'sensor.t': '21' };
  const resolve = id => states[id] === undefined ? null : { domain: id.split('.')[0], state: states[id] };
  const isOn = (d, s) => d !== 'sensor' && ['on', 'playing'].indexOf(s) >= 0;
  assert.deepEqual(R.summarize({ ids: ['light.a', 'light.b', 'media_player.tv', 'sensor.t', 'light.gone'] }, resolve, isOn), { total: 4, on: 2 });
  assert.deepEqual(R.summarize({ ids: [] }, resolve, isOn), { total: 0, on: 0 });
  assert.equal(R.slug('Wohn-Zimmer 2!'), 'wohn-zimmer-2');
});

test('rooms: the saved order of the devices comes first, new devices are added at the end, gone ones are ignored', () => {
  assert.deepEqual(R.applyOrder(['a.1', 'b.2', 'c.3', 'd.4'], ['c.3', 'a.1']), ['c.3', 'a.1', 'b.2', 'd.4']);
  assert.deepEqual(R.applyOrder(['a.1', 'b.2'], ['gone.9', 'b.2']), ['b.2', 'a.1'], 'a device that left the room is skipped');
  assert.deepEqual(R.applyOrder(['a.1', 'b.2'], undefined), ['a.1', 'b.2']);
  assert.deepEqual(R.applyOrder(['a.1', 'b.2'], ['b.2', 'b.2', 42, null]), ['b.2', 'a.1'], 'doubles and junk are ignored');
});

test('rooms: a card moves one step up or down and stays where it is at the ends', () => {
  const ids = ['a.1', 'b.2', 'c.3'];
  assert.deepEqual(R.moveId(ids, 'b.2', -1), ['b.2', 'a.1', 'c.3']);
  assert.deepEqual(R.moveId(ids, 'b.2', 1), ['a.1', 'c.3', 'b.2']);
  assert.deepEqual(R.moveId(ids, 'a.1', -1), ids);
  assert.deepEqual(R.moveId(ids, 'c.3', 1), ids);
  assert.deepEqual(R.moveId(ids, 'x.9', 1), ids);
  assert.deepEqual(ids, ['a.1', 'b.2', 'c.3'], 'the original list is not changed');
});

test('rooms: a room made from a Home Assistant area only takes real devices, and the list you wrote yourself may hold anything', () => {
  assert.ok(['light', 'switch', 'climate', 'media_player', 'camera', 'vacuum', 'cover'].every(R.isDeviceDomain));
  assert.ok(['sensor', 'binary_sensor', 'button', 'number', 'select', 'update', 'text', 'event'].every(d => !R.isDeviceDomain(d)));
});

test('rooms: your own changes: put a device in, take one out, and what the area brings stays editable', () => {
  const base = ['light.a', 'light.b', 'climate.c'];
  assert.deepEqual(R.applyEdits(base, { add: ['sensor.x'], remove: ['light.b'] }), ['light.a', 'climate.c', 'sensor.x']);
  assert.deepEqual(R.applyEdits(base, undefined), base);
  let e = R.toggleDevice(base, undefined, 'light.b');                       // take a device of the room out
  assert.deepEqual(e, { add: [], remove: ['light.b'] });
  assert.deepEqual(R.applyEdits(base, e), ['light.a', 'climate.c']);
  e = R.toggleDevice(base, e, 'light.b');                                    // and put it back: no trace of the change is left
  assert.deepEqual(e, { add: [], remove: [] });
  e = R.toggleDevice(base, e, 'switch.new');                                  // a device from elsewhere
  assert.deepEqual(e, { add: ['switch.new'], remove: [] });
  assert.deepEqual(R.applyEdits(base, e).slice(-1), ['switch.new']);
  e = R.toggleDevice(base, e, 'switch.new');
  assert.deepEqual(e, { add: [], remove: [] });
});

test('rooms: the rooms carry your changes and still know what they were before', () => {
  const rooms = R.buildRooms([], { 'Living Room': ['light.a', 'light.b'] }, { 'living-room': { add: ['camera.z'], remove: ['light.a'] } });
  assert.deepEqual(rooms[0].ids, ['light.b', 'camera.z']);
  assert.deepEqual(rooms[0].base, ['light.a', 'light.b']);
  const custom = R.buildRooms([{ name: 'Patio', items: ['light.p'] }], {}, { patio: { add: ['camera.q'] } });
  assert.deepEqual([custom[0].ids, custom[0].base], [['light.p', 'camera.q'], ['light.p']]);
});

test('rooms: the thermostat and the TV have a tall card; every other device only has the row; your choice wins', () => {
  assert.equal(R.canTall('climate'), true); assert.equal(R.canTall('media_player'), true); assert.equal(R.canTall('light'), false);
  assert.equal(R.resolveStyle(undefined, 'climate'), 'tall');
  assert.equal(R.resolveStyle('compact', 'media_player'), 'compact');
  assert.equal(R.resolveStyle('tall', 'light'), 'compact', 'a light has no tall card');
  assert.equal(R.resolveStyle('nonsense', 'climate'), 'tall');
  assert.equal(R.resolveStyle('large', 'media_player'), 'large', 'a music player has the big cover size');
  assert.equal(R.resolveStyle('large', 'climate'), 'tall', 'only a music player has it');
});

test('rooms: a room can be given another name and keeps its id, its devices and where it stands', () => {
  const rooms = R.buildRooms([], { 'Front door': ['light.p', 'camera.c'], Bedroom: ['light.b'] }, { 'front-door': { remove: ['light.p'] } }, [{ name: 'Garage' }], { 'front-door': '  Patio ', bedroom: '', garage: 'Workshop' });
  assert.deepEqual(rooms.map(r => r.id), ['bedroom', 'front-door', 'garage']);
  assert.deepEqual(rooms.map(r => r.name), ['Bedroom', 'Patio', 'Workshop'], 'a name you gave wins, an empty one means the original');
  assert.deepEqual(rooms.map(r => r.baseName), ['Bedroom', 'Front door', 'Garage']);
  assert.deepEqual(rooms[1].ids, ['camera.c'], 'its devices and your changes to them stay');
  assert.equal(R.applyNames([{ id: 'a', name: 'A' }], { a: 5 })[0].name, 'A', 'a name that is not text is ignored');
});

test('rooms: a camera has a tall card too', () => {
  assert.equal(R.canTall('camera'), true);
  assert.equal(R.resolveStyle(undefined, 'camera'), 'tall');
  assert.equal(R.resolveStyle('compact', 'camera'), 'compact');
});

test('rooms: the rooms follow the order that was arranged, new rooms come after, rooms that are gone are ignored', () => {
  const rooms = [{ id: 'living', name: 'Living' }, { id: 'bed', name: 'Bedroom' }, { id: 'patio', name: 'Patio' }];
  assert.deepEqual(R.applyRoomOrder(rooms, ['patio', 'living']).map(r => r.id), ['patio', 'living', 'bed']);
  assert.deepEqual(R.applyRoomOrder(rooms, ['gone', 'bed']).map(r => r.id), ['bed', 'living', 'patio']);
  assert.deepEqual(R.applyRoomOrder(rooms, undefined).map(r => r.id), ['living', 'bed', 'patio']);
  assert.equal(R.applyRoomOrder(rooms, ['bed'])[0], rooms[1], 'the room objects themselves come back');
});

test('rooms: a new order for the part of a list that is shown keeps the rest after it', () => {
  assert.deepEqual(R.mergeOrder(['a', 'b', 'c', 'd'], ['c', 'a']), ['c', 'a', 'b', 'd']);
  assert.deepEqual(R.mergeOrder(['a', 'b'], ['b', 'a']), ['b', 'a']);
  assert.deepEqual(R.mergeOrder(undefined, ['x']), ['x']);
});

test('fmtTime and playPos: the time line of the big cover card', () => {
  assert.equal(R.fmtTime(134), '2:14');
  assert.equal(R.fmtTime(388), '6:28');
  assert.equal(R.fmtTime(5), '0:05');
  assert.equal(R.fmtTime(3725), '1:02:05');
  assert.equal(R.fmtTime(undefined), '0:00');
  const t0 = Date.parse('2026-10-21T10:00:00Z');
  assert.equal(R.playPos({ media_position: 100, media_position_updated_at: '2026-10-21T10:00:00Z' }, true, t0 + 14000), 114, 'plays on from the time it was reported');
  assert.equal(R.playPos({ media_position: 100, media_position_updated_at: '2026-10-21T10:00:00Z' }, false, t0 + 14000), 100, 'paused: stays');
  assert.equal(R.playPos({ media_position: 380, media_duration: 388, media_position_updated_at: '2026-10-21T10:00:00Z' }, true, t0 + 60000), 388, 'never past the end');
  assert.equal(R.playPos({}, true, t0), null);
  assert.equal(R.isTvItem({ id: 'media_player.spotify_paul', name: 'Spotify Paul' }), false);
  assert.equal(R.isTvItem({ id: 'media_player.living_room_tv', name: 'Living Room TV' }), true);
});

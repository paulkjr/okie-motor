'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../src/okie-sensors.js');

const st = (state, a, ts) => ({ state, attributes: a || {}, last_changed: ts || '2026-10-27T10:00:00Z' });

test('the kind of a sensor comes from its device class, else from the words in its name', () => {
  assert.equal(S.kindOf('door', 'x'), 'door'); assert.equal(S.kindOf('garage_door', 'x'), 'door'); assert.equal(S.kindOf('window', 'x'), 'window');
  assert.equal(S.kindOf('motion', 'x'), 'motion'); assert.equal(S.kindOf('occupancy', 'x'), 'motion'); assert.equal(S.kindOf('moisture', 'x'), 'water'); assert.equal(S.kindOf('smoke', 'x'), 'smoke'); assert.equal(S.kindOf('gas', 'x'), 'smoke');
  assert.equal(S.kindOf('opening', 'Kitchen Fenster'), 'window', 'an opening called window'); assert.equal(S.kindOf('opening', 'Back'), 'door');
  assert.equal(S.kindOf('', 'Hallway Motion'), 'motion'); assert.equal(S.kindOf('', 'Haustür'), 'door'); assert.equal(S.kindOf('', 'Something'), 'other'); assert.equal(S.kindOf(undefined, undefined), 'other');
});

test('the words of a state: Closed / Open, Clear / Motion, in both languages, and unavailable', () => {
  assert.equal(S.stateWord('door', 'off', 'en'), 'Closed'); assert.equal(S.stateWord('window', 'on', 'en'), 'Open'); assert.equal(S.stateWord('window', 'on', 'de'), 'Offen');
  assert.equal(S.stateWord('motion', 'on', 'en'), 'Motion'); assert.equal(S.stateWord('motion', 'off', 'de'), 'Ruhig'); assert.equal(S.stateWord('water', 'on', 'en'), 'Wet'); assert.equal(S.stateWord('other', 'on', 'en'), 'On');
  assert.equal(S.stateWord('door', 'unavailable', 'en'), 'Unavailable'); assert.equal(S.stateWord('door', 'unknown', 'de'), 'Nicht verfügbar'); assert.deepEqual(S.wordsOf('nonsense', 'en'), ['Off', 'On']);
});

test('the list of sensors: only binary sensors that tell something, the ones that need a look first, then by room and name', () => {
  const states = {
    'binary_sensor.front_door': st('off', { device_class: 'door', friendly_name: 'Front Door' }), 'binary_sensor.lr_window': st('on', { device_class: 'window', friendly_name: 'Living Room Window' }),
    'binary_sensor.hall_motion': st('off', { device_class: 'motion' }), 'binary_sensor.phone_battery': st('on', { device_class: 'battery' }), 'binary_sensor.robo_maint': st('on', {}), 'binary_sensor.dead': st('unavailable', { device_class: 'door' }),
    'sensor.temp': st('21', { device_class: 'temperature' }), 'light.x': st('on'),
  };
  const items = { 'binary_sensor.front_door': { name: 'Front Door', area: 'Hallway', deviceClass: 'door' }, 'binary_sensor.lr_window': { name: 'Living Room Window', area: 'Living Room', deviceClass: 'window' }, 'binary_sensor.robo_maint': { name: 'Robo due', area: '', category: 'diagnostic' }, 'binary_sensor.hall_motion': { name: 'Hall Motion', area: 'Hallway', deviceClass: 'motion' } };
  const rows = S.list(states, id => items[id] || null, it => it.name === 'Hall Motion' && false, 'en');
  assert.equal(rows[0].id, 'binary_sensor.lr_window'); assert.equal(rows[0].word, 'Open'); assert.equal(rows[0].kind, 'window');
  assert.ok(!rows.some(r => r.id === 'binary_sensor.phone_battery'), 'a battery is not a sensor of the home'); assert.ok(!rows.some(r => r.id === 'binary_sensor.robo_maint'), 'a diagnostic entity stays out'); assert.ok(!rows.some(r => /^sensor\./.test(r.id)));
  assert.equal(rows.find(r => r.id === 'binary_sensor.dead').dead, true);
  const left = S.list(states, id => items[id] || null, it => it.name === 'Hall Motion', 'en'); assert.ok(!left.some(r => r.id === 'binary_sensor.hall_motion'), 'an excluded one stays out');
  assert.equal(S.attention(rows), 1, 'only the open window needs a look, not the unavailable one'); assert.deepEqual(S.list(null, null, null, 'en'), []);
});

test('the readings: temperature and the like with a number, grouped by room', () => {
  const states = { 'sensor.t': st('21.5', { device_class: 'temperature', unit_of_measurement: '°C' }), 'sensor.h': st('48', { device_class: 'humidity', unit_of_measurement: '%' }), 'sensor.bad': st('unknown', { device_class: 'temperature' }), 'sensor.power': st('300', { device_class: 'power' }) };
  const r = S.readings(states, id => ({ name: id, area: id === 'sensor.t' ? 'Kitchen' : 'Bedroom' }), null);
  assert.deepEqual(r.map(x => x.id), ['sensor.h', 'sensor.t']); assert.equal(r[1].value, 21.5); assert.equal(r[1].unit, '°C');
  const g = S.byArea([{ area: 'Kitchen', id: 'a' }, { area: '', id: 'b' }, { area: 'Bedroom', id: 'c' }, { area: 'Kitchen', id: 'd' }]);
  assert.deepEqual(g.map(x => x.area), ['Bedroom', 'Kitchen', '']); assert.deepEqual(g[1].rows.map(x => x.id), ['a', 'd']);
});

test('photos: a door gets the door, other sensors the window sensor, blinds get the blind but a garage door none', () => {
  assert.equal(S.photoKey('door'), 'door'); assert.equal(S.photoKey('window'), 'window'); assert.equal(S.photoKey('motion'), 'window');
  assert.equal(S.coverPhotoKey('blind'), 'blinds'); assert.equal(S.coverPhotoKey(''), 'blinds'); assert.equal(S.coverPhotoKey(undefined), 'blinds'); assert.equal(S.coverPhotoKey('garage'), null); assert.equal(S.coverPhotoKey('gate'), null);
});

test('recent events: the newest first, only on / off changes of known sensors, with the words of their kind', () => {
  const kinds = { 'binary_sensor.a': 'door', 'binary_sensor.b': 'window' };
  const rows = [{ when: 100, entity_id: 'binary_sensor.a', state: 'off', name: 'Front Door' }, { when: 300, entity_id: 'binary_sensor.b', state: 'on', name: 'Window' }, { when: 200, entity_id: 'binary_sensor.a', state: 'unavailable' }, { when: 250, entity_id: 'light.x', state: 'on' }, { when: 50, entity_id: 'binary_sensor.a', state: 'on', name: 'Front Door' }, null];
  const ev = S.eventRows(rows, kinds, 'en', 3);
  assert.deepEqual(ev.map(e => [e.id, e.word, e.ts, e.on]), [['binary_sensor.b', 'Open', 300000, true], ['binary_sensor.a', 'Closed', 100000, false], ['binary_sensor.a', 'Open', 50000, true]]);
  assert.equal(S.eventRows(rows, kinds, 'en', 1).length, 1); assert.deepEqual(S.eventRows(null, kinds, 'en'), []);
});

test('when an event happened: the time today, Yesterday with the time, a weekday before', () => {
  const now = new Date(2026, 9, 27, 15, 0, 0).getTime();
  assert.match(S.whenLabel(new Date(2026, 9, 27, 10, 23, 45).getTime(), now, 'en'), /10:23:45/);
  assert.match(S.whenLabel(new Date(2026, 9, 26, 20, 41, 0).getTime(), now, 'en'), /^Yesterday .*8:41/); assert.match(S.whenLabel(new Date(2026, 9, 26, 20, 41, 0).getTime(), now, 'de'), /^Gestern /);
  assert.match(S.whenLabel(new Date(2026, 9, 22, 18, 22, 0).getTime(), now, 'en'), /^[A-Z][a-z]{2} .*6:22/);
});

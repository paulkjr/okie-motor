'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const O = require('../src/okie-owlet.js');

const P = 'bedroom_owlet_sock';
const base = {
  ['sensor.' + P + '_heart_rate']: '128', ['binary_sensor.' + P + '_base_station_on']: 'on', ['binary_sensor.' + P + '_sock_off']: 'off',
  ['binary_sensor.' + P + '_charging']: 'off', ['binary_sensor.' + P + '_data_stale']: 'off',
};
const status = extra => O.sockStatus(id => Object.assign({}, base, extra)[id], P);

test('owlet: only the sock entities belong to the Owlet item (not the camera, not other sensors)', () => {
  assert.ok(O.owns('sensor.bedroom_owlet_sock_heart_rate'));
  assert.ok(O.owns('binary_sensor.bedroom_owlet_sock_low_oxygen_alert'));
  assert.ok(O.owns('sensor.nursery_owlet_sock_ac000w041725608_movement'));
  assert.ok(!O.owns('camera.nursery_cam'));
  assert.ok(!O.owns('switch.couch_lamp_socket'));
  assert.ok(!O.owns('sensor.owlet_cam_temperature'));
});

test('owlet: thirty sock sensors fold into ONE item that keeps the room of the heart-rate sensor', () => {
  const items = [
    { id: 'sensor.bedroom_owlet_sock_heart_rate', areaId: 'bedroom' },
    { id: 'binary_sensor.bedroom_owlet_sock_charging', areaId: null },
    { id: 'light.kitchen', areaId: 'kitchen' },
  ];
  const states = Object.fromEntries(items.map(i => [i.id, { state: 'on' }]));
  const out = O.fold(items, states, { bedroom: { name: 'Bedroom' } });
  assert.deepEqual(out.map(i => i.id), ['light.kitchen', 'gadget.owlet']);
  const ow = out[1];
  assert.equal(ow.domain, 'gadget'); assert.equal(ow.deviceClass, 'owlet'); assert.equal(ow.area, 'Bedroom');
  assert.equal(O.fold(items.slice(2), { 'light.kitchen': { state: 'on' } }, {}).length, 1, 'no sock: nothing added');
});

test('owlet: the light follows the base station - red alarms beat yellow, yellow beats charging, worn and reading is green', () => {
  assert.deepEqual(status({}), { level: 'green', why: '' });
  assert.deepEqual(status({ ['binary_sensor.' + P + '_low_oxygen_alert']: 'on', ['binary_sensor.' + P + '_low_battery_alert']: 'on' }), { level: 'red', why: 'low_oxygen' });
  assert.deepEqual(status({ ['binary_sensor.' + P + '_high_heart_rate_alert']: 'on' }), { level: 'red', why: 'high_heart_rate' });
  assert.deepEqual(status({ ['binary_sensor.' + P + '_sock_disconnected_alert']: 'on', ['binary_sensor.' + P + '_charging']: 'on' }), { level: 'yellow', why: 'sock_disconnected' });
  assert.deepEqual(status({ ['binary_sensor.' + P + '_charging']: 'on' }), { level: 'blue', why: 'charging' });
  assert.deepEqual(status({ ['binary_sensor.' + P + '_sock_off']: 'on' }), { level: 'idle', why: 'not_worn' });
  assert.deepEqual(status({ ['binary_sensor.' + P + '_data_stale']: 'on' }), { level: 'yellow', why: 'stale' });
  assert.deepEqual(status({ ['binary_sensor.' + P + '_base_station_on']: 'off' }), { level: 'off', why: 'base_off' });
  assert.deepEqual(status({ ['sensor.' + P + '_heart_rate']: 'unavailable', ['binary_sensor.' + P + '_base_station_on']: 'unavailable' }), { level: 'off', why: 'offline' });
});

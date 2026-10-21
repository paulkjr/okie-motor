'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../src/okie-gadgets.js');

const st = ids => Object.fromEntries(ids.map(i => [i, { state: 'on', attributes: { friendly_name: i } }]));
const items = ids => ids.map(id => ({ id, domain: id.split('.')[0], name: id, areaId: id === 'switch.kindle_fire_screen' ? 'hall' : null, area: null }));
const IDS = ['switch.kindle_fire_screen', 'number.kindle_fire_brightness', 'sensor.kindle_fire_battery', 'light.awtrix_2c2c5c_matrix', 'input_text.awtrix_message', 'script.send_awtrix_message', 'light.kitchen', 'sensor.house_power'];

test('gadgets: the entities of the Kindle and the AWTRIX are found by their ids', () => {
  const [kindle, awtrix] = G.GADGETS;
  assert.deepEqual(G.membersOf(kindle, st(IDS)), ['switch.kindle_fire_screen', 'number.kindle_fire_brightness', 'sensor.kindle_fire_battery']);
  assert.deepEqual(G.membersOf(awtrix, st(IDS)), ['light.awtrix_2c2c5c_matrix', 'input_text.awtrix_message', 'script.send_awtrix_message']);
  assert.deepEqual(G.membersOf(kindle, {}), []);
});

test('gadgets: a row names its entity without the gadget prefix', () => {
  const [kindle, awtrix] = G.GADGETS, s = st(IDS);
  assert.equal(G.find(kindle, 'switch.screen', s), 'switch.kindle_fire_screen');
  assert.equal(G.find(kindle, 'sensor.battery', s), 'sensor.kindle_fire_battery');
  assert.equal(G.find(awtrix, 'light.matrix', s), 'light.awtrix_2c2c5c_matrix');
  assert.equal(G.find(awtrix, 'input_text.message', s), 'input_text.awtrix_message');
  assert.equal(G.find(awtrix, 'script.send_awtrix_message', s), 'script.send_awtrix_message', 'an absolute id is taken as it is');
  assert.equal(G.find(kindle, 'switch.nothing', s), null);
});

test('gadgets: the collection holds ONE tile per gadget and none of its entities', () => {
  const out = G.apply(items(IDS), st(IDS), { hall: { name: 'Hallway' } });
  assert.deepEqual(out.map(i => i.id).sort(), ['gadget.awtrix', 'gadget.kindle', 'light.kitchen', 'sensor.house_power']);
  const k = out.find(i => i.id === 'gadget.kindle');
  assert.equal(k.domain, 'gadget'); assert.equal(k.name, 'Kindle Fire'); assert.equal(k.areaId, 'hall'); assert.equal(k.area, 'Hallway'); assert.equal(k.deviceClass, 'tv');
  assert.equal(out.find(i => i.id === 'gadget.awtrix').deviceClass, 'light');
  const none = G.apply(items(['light.kitchen']), st(['light.kitchen']), {});
  assert.deepEqual(none.map(i => i.id), ['light.kitchen'], 'no tile for a gadget that is not there');
});

test('gadgets: labels lose the device name', () => {
  const s = { 'switch.kindle_fire_screen': { attributes: { friendly_name: 'Kindle Fire Cycle screens' } }, 'sensor.x': { attributes: { friendly_name: 'awtrix_2c2c5c Free ram' } } };
  assert.equal(G.labelOf(G.GADGETS[0], 'switch.kindle_fire_screen', s), 'Cycle screens');
  assert.equal(G.labelOf(G.GADGETS[1], 'sensor.x', s), 'Free ram');
});

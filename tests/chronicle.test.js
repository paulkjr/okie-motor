'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/okie-core.js');
const S = require('../src/okie-search.js');
const C = require('../src/okie-chronicle.js');
const { makeHass } = require('./fixtures.js');

function setup() {
  const store = core.createStore({ localStorage: null, idb: null, setTimeout: fn => fn() });
  const engine = S.createEngine({ store });
  engine.setCollection(S.buildCollection(makeHass(), { includeHidden: true }));
  let t = 1000;
  const rec = C.createRecorder({ store, engine, lang: () => 'en', now: () => (t += 1000) });
  return { rec, store, engine };
}
const ch = (id, a, b) => ({ id, old: { state: a }, next: { state: b } });

test('recorder keeps meaningful changes and phrases them by device class', () => {
  const { rec } = setup();
  rec.handle([ch('binary_sensor.kitchen_window', 'off', 'on'), ch('light.kitchen_ceiling', 'on', 'off'), ch('sensor.kitchen_temperature', '20', '21')]);
  const r = rec.recent(10);
  assert.equal(r.length, 2);
  assert.ok(r.some(e => e.name === 'Kitchen Window' && e.text === 'Open'));
  assert.ok(!r.some(e => e.domain === 'sensor'));
});

test('recorder respects excluded patterns and skips unknown entities and first sightings', () => {
  const { rec, engine } = setup();
  engine.setExcluded(['light.kitchen_*']);
  assert.equal(rec.handle([ch('light.kitchen_ceiling', 'on', 'off')]).length, 0);
  assert.equal(rec.handle([ch('light.nope', 'on', 'off')]).length, 0);
  assert.equal(rec.handle([{ id: 'light.bedroom_main', old: null, next: { state: 'on' } }]).length, 0);
});

test('persists across reloads and caps at 200', () => {
  const { rec, store, engine } = setup();
  for (let i = 0; i < 230; i++) rec.handle([ch('light.bedroom_main', i % 2 ? 'on' : 'off', i % 2 ? 'off' : 'on')]);
  assert.equal(rec.raw().length, 200);
  const again = C.createRecorder({ store, engine, lang: () => 'en' });
  assert.equal(again.raw().length, 200);
});

test('newest first, flaps fold, change events fire, clear empties', () => {
  const { rec } = setup();
  let fired = 0; rec.on('change', () => fired++);
  rec.handle([ch('light.kitchen_ceiling', 'on', 'off')]);
  rec.handle([ch('light.kitchen_ceiling', 'off', 'on')]);
  rec.handle([ch('light.kitchen_ceiling', 'on', 'off')]);
  rec.handle([ch('lock.front_door', 'locked', 'unlocked')]);
  const r = rec.recent(5);
  assert.equal(r[0].name, 'Front Door Lock');
  assert.equal(r[1].count, 3); assert.equal(r[1].folded, true);
  assert.equal(fired, 4);
  rec.clear(); assert.equal(rec.recent().length, 0);
});

test('seed: the logbook fills the history from before the card started, once, in time order', () => {
  const { rec } = setup();
  const now = Date.now();
  const rows = [
    { when: (now - 3600e3) / 1000, entity_id: 'light.kitchen_ceiling', state: 'on' },
    { when: (now - 600e3) / 1000, entity_id: 'binary_sensor.kitchen_window', state: 'on' },
    { when: new Date(now - 1200e3).toISOString(), entity_id: 'light.kitchen_counter', state: 'off' },
    { when: (now - 100e3) / 1000, entity_id: 'sensor.kitchen_temperature', state: '21' },     // numbers are not news
    { when: (now - 90e3) / 1000, entity_id: 'light.does_not_exist', state: 'on' },            // unknown entity
    { when: (now - 80e3) / 1000, entity_id: 'light.kitchen_ceiling', state: 'unavailable' },  // not a real change
  ];
  assert.equal(rec.seed(rows).length, 3);
  const raw = rec.raw();
  assert.deepEqual(raw.map(e => e.id), ['light.kitchen_ceiling', 'light.kitchen_counter', 'binary_sensor.kitchen_window']);
  assert.equal(rec.recent(1)[0].name, 'Kitchen Window');
  assert.equal(rec.seed(rows).length, 0, 'seeding twice adds nothing');
});

test('seed keeps live entries and caps the list at 200', () => {
  const { rec } = setup();
  rec.handle([ch('light.kitchen_ceiling', 'off', 'on')]);
  const now = Date.now(), rows = [];
  for (let i = 0; i < 250; i++) rows.push({ when: (now - (i + 5) * 60e3) / 1000, entity_id: i % 2 ? 'light.kitchen_counter' : 'light.kitchen_ceiling', state: i % 2 ? 'on' : 'off' });
  rec.seed(rows);
  assert.equal(rec.raw().length, 200);
});

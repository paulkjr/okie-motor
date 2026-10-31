'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/okie-core.js');

test('LRU evicts the least recently used and refreshes on get', () => {
  const c = core.createLRU(3);
  c.set('a', 1); c.set('b', 2); c.set('c', 3);
  assert.equal(c.get('a'), 1);          // a is now freshest
  c.set('d', 4);                         // evicts b
  assert.equal(c.has('b'), false);
  assert.equal(c.get('a'), 1);
  assert.equal(c.size, 3);
});

test('LRU of 30 keeps exactly 30 queries', () => {
  const c = core.createLRU(30);
  for (let i = 0; i < 45; i++) c.set('q' + i, i);
  assert.equal(c.size, 30);
  assert.equal(c.has('q14'), false);
  assert.equal(c.has('q15'), true);
});

test('bus delivers, unsubscribes, and isolates handler errors', () => {
  const b = core.createBus();
  const seen = [];
  const off = b.on('x', v => seen.push(v));
  b.on('x', () => { throw new Error('boom'); });
  const origErr = console.error; console.error = () => {};
  b.emit('x', 1);
  console.error = origErr;
  off();
  b.emit('x', 2);
  assert.deepEqual(seen, [1]);
});

function fakeLS() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), removeItem: k => m.delete(k), _m: m };
}
function fakeIdb() {
  const db = new Map(); const batches = [];
  return { get: k => Promise.resolve(db.has(k) ? db.get(k) : null), setMany: e => { batches.push(e.length); e.forEach(([k, v]) => db.set(k, v)); return Promise.resolve(); }, _db: db, _batches: batches };
}

test('store: sync read from memory, mirrored to localStorage, batched into one IDB transaction', async () => {
  const ls = fakeLS(), idb = fakeIdb();
  let queued = null;
  const s = core.createStore({ localStorage: ls, idb, setTimeout: fn => { queued = fn; } });
  s.set('a', { x: 1 }); s.set('b', 2); s.set('c', 3);
  assert.deepEqual(s.get('a'), { x: 1 });
  assert.equal(ls.getItem('okie:b'), '2');
  assert.equal(idb._batches.length, 0, 'nothing written to IDB before the flush');
  queued();
  await s.flush();
  assert.deepEqual(idb._batches, [3], 'three writes, one transaction');
});

test('store: survives reload via localStorage, and via IDB for big values', async () => {
  const ls = fakeLS(), idb = fakeIdb();
  const s1 = core.createStore({ localStorage: ls, idb, flushDelayMs: 0, setTimeout: fn => fn() });
  s1.set('small', [1, 2, 3]);
  const big = 'x'.repeat(70 * 1024);
  s1.set('big', big);
  await s1.flush();
  const s2 = core.createStore({ localStorage: ls, idb, setTimeout: fn => fn() });
  assert.deepEqual(s2.get('small'), [1, 2, 3]);
  assert.equal(s2.get('big'), null, 'oversized value is not kept in localStorage');
  assert.equal(await s2.getAsync('big'), big, 'but IndexedDB still has it');
});

test('store: works with no storage at all (private mode)', async () => {
  const s = core.createStore({ localStorage: null, idb: null, setTimeout: fn => fn() });
  s.set('k', 5);
  assert.equal(s.get('k'), 5);
  assert.equal(await s.getAsync('missing', 'dflt'), 'dflt');
});

test('store: a throwing localStorage never breaks writes', () => {
  const ls = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() {} };
  const s = core.createStore({ localStorage: ls, idb: null, setTimeout: fn => fn() });
  s.set('k', 1);
  assert.equal(s.get('k'), 1);
});

test('i18n: language pick, fallback chain, interpolation', () => {
  core.registerStrings('en', { 'a.hello': 'Hello {name}', 'a.only_en': 'only en' });
  core.registerStrings('de', { 'a.hello': 'Hallo {name}', 'a.only_de': 'nur de' });
  assert.equal(core.t('a.hello', 'de', { name: 'Paul' }), 'Hallo Paul');
  assert.equal(core.t('a.hello', 'en', { name: 'Paul' }), 'Hello Paul');
  assert.equal(core.t('a.hello', 'fr', { name: 'Paul' }), 'Hello Paul', 'unknown language falls back to English');
  assert.equal(core.t('a.only_de', 'en'), 'nur de', 'missing English falls back to German like FSC');
  assert.equal(core.t('a.nope', 'en'), 'a.nope');
});

test('registry: register, order, lookup by category, unregister, change events', () => {
  const r = core.createRegistry();
  const events = [];
  r.on('change', e => events.push(e.type + ':' + e.id));
  const off = r.register({ id: 'todos', name: 'Todos', category: 'system', order: 20 });
  r.register({ id: 'calendar', name: 'Calendar', category: 'system', order: 10 });
  r.register({ id: 'bambu', name: 'Printer', category: 'integration', domain: 'sensor' });
  assert.deepEqual(r.list({ category: 'system' }).map(a => a.id), ['calendar', 'todos']);
  assert.equal(r.list({ domain: 'sensor' })[0].id, 'bambu');
  assert.equal(r.get('todos').name, 'Todos');
  off();
  assert.equal(r.get('todos'), null);
  assert.deepEqual(events, ['register:todos', 'register:calendar', 'register:bambu', 'unregister:todos']);
  assert.throws(() => r.register({}));
});

test('settings: defaults < config < user, only user changes persist', () => {
  const store = core.createStore({ localStorage: null, idb: null, setTimeout: fn => fn() });
  const s = core.createSettings({ store, defaults: { squircle: 'soft', quick: { light: 'tap', lock: 'hold' }, favorites: [] }, config: { squircle: 'strong' } });
  assert.equal(s.get().squircle, 'strong');
  s.set({ quick: { lock: 'tap' } });
  assert.deepEqual(s.get().quick, { light: 'tap', lock: 'tap' }, 'nested merge keeps siblings');
  assert.deepEqual(store.get('settings'), { quick: { lock: 'tap' } }, 'only the user change is stored');
  s.set({ favorites: ['light.a'] });
  s.set({ favorites: ['light.b'] });
  assert.deepEqual(s.get().favorites, ['light.b'], 'arrays are replaced, not merged');
});

test('settings: a YAML edit still applies to untouched keys, changed() and reset()', () => {
  const store = core.createStore({ localStorage: null, idb: null, setTimeout: fn => fn() });
  const mk = config => core.createSettings({ store, defaults: { a: 1, b: { c: 2, d: 3 } }, config });
  const s1 = mk({}); s1.set({ b: { c: 9 } });
  const s2 = mk({ a: 5 });                         // user edited YAML later
  assert.equal(s2.get().a, 5);
  assert.equal(s2.get().b.c, 9);
  assert.deepEqual(s2.changed(), ['b.c']);
  s2.reset('b.c');
  assert.equal(s2.get().b.c, 2);
  assert.deepEqual(s2.changed(), []);
  let n = 0; s2.on('change', () => n++); s2.set({ a: 7 }); s2.reset();
  assert.equal(n, 2); assert.equal(s2.get().a, 5);
});

test('controls: throttle fires immediately, then at most once per window, and flushes the last value', async () => {
  const { throttle } = require('../src/okie-controls.js');
  const calls = [];
  const t = throttle(v => calls.push(v), 40);
  t(1); t(2); t(3);
  assert.deepEqual(calls, [1], 'leading call only');
  await new Promise(r => setTimeout(r, 60));
  assert.deepEqual(calls, [1, 3], 'trailing call carries the latest value');
  t(4); t.cancel(); await new Promise(r => setTimeout(r, 60));
  assert.deepEqual(calls, [1, 3], 'cancel drops a pending call');
});

test('settings: reset() tells listeners which key went back, defaultOf() reads the shipped value', () => {
  const store = core.createStore({ localStorage: null, idb: null, setTimeout: fn => fn() });
  const s = core.createSettings({ store, defaults: { scale: 100, glass: { blur: 20, tint: 40 } }, config: { scale: 90 } });
  const seen = []; s.on('change', p => seen.push(p));
  s.set({ glass: { blur: 60 }, scale: 50 });
  assert.equal(s.defaultOf('glass.blur'), 20);
  assert.equal(s.defaultOf('scale'), 90);                  // a YAML value is the "original" for that card
  assert.equal(s.defaultOf('nope.deeper'), undefined);
  s.reset('glass.blur');
  assert.equal(s.get().glass.blur, 20);
  assert.deepEqual(seen[seen.length - 1], { glass: { blur: 20 } });
  s.reset('scale');
  assert.deepEqual(seen[seen.length - 1], { scale: 90 });
  s.reset();
  assert.deepEqual(seen[seen.length - 1], {});
});

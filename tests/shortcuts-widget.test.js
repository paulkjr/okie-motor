'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
global.document = { createElement() { return {}; }, addEventListener() {} }; global.window = global;
const UI = require('../src/okie-ui.js');

// The widget is a Scriptable script (top-level await, no module system): run it without Scriptable's globals, so it only exports its pure part.
const SRC = fs.readFileSync(path.join(__dirname, '..', 'widget', 'okie-shortcuts-widget.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function load() { const m = { exports: {} }; await new AsyncFunction('module', SRC)(m); return m.exports; }

test('shortcuts widget: the bed light and the three light modes of the card', async () => {
  const W = await load();
  assert.deepEqual(W.TILES.map(t => t.id), ['bed', 'cozy', 'sleep', 'bright']);
  assert.deepEqual(W.TILES.map(t => t.entity), ['switch.bedlight', 'script.govee_cozy_lights', 'script.govee_lets_go_to_sleep', 'script.govee_turn_up_the_lights']);
  assert.deepEqual(W.TILES.slice(1).map(t => t.name), ["Cozy lights", "Let's go to sleep", "Turn up the lights"], 'the names of the card\'s own light modes');
  const LM = require('../src/okie-light-modes.js');
  if (LM && LM.defaultModes) LM.defaultModes().forEach((m, i) => assert.equal(m.run[0].entity, W.TILES[i + 1].entity, m.name));
});

test('shortcuts widget: the icons are the card\'s own', async () => {
  const W = await load();
  ['flame', 'moon', 'sun', 'bulb'].forEach(n => assert.equal(W.ICON_INNER[n], UI.ICONS[n], n));
  W.TILES.forEach(t => assert.ok(W.ICON_INNER[t.icon], t.icon + ' is in the widget'));
  assert.ok(W.shapesOf(W.ICON_INNER.sun).length === 2 && W.parsePath(W.shapesOf(W.ICON_INNER.bulb)[0].d).length > 5);
});

test('shortcuts widget: the buttons sit inside the widget, do not overlap, and a small widget has one', async () => {
  const W = await load();
  for (const [size, w, h, n] of [['medium', 338, 158, 4], ['large', 338, 354, 4], ['medium', 292, 141, 4], ['large', 364, 382, 4]]) {
    const L = W.layout(w, h, size, n);
    assert.equal(L.tiles.length, n);
    L.tiles.forEach(t => {
      assert.ok(t.x >= 0 && t.y >= 0 && t.x + t.w <= w + .01 && t.y + t.h <= h + .01, size + ' tile inside');
      assert.ok(t.cx - t.d / 2 >= t.x - .01 && t.cx + t.d / 2 <= t.x + t.w + .01 && t.cy - t.d / 2 >= t.y - .01, 'the round button inside its tile');
      assert.ok(t.w >= 60 && t.h >= 60, 'a tap box big enough to hit');
    });
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) { const a = L.tiles[i], b = L.tiles[j]; assert.ok(a.x + a.w <= b.x + .01 || b.x + b.w <= a.x + .01 || a.y + a.h <= b.y + .01 || b.y + b.h <= a.y + .01, 'no overlap ' + i + ' ' + j); }
  }
  assert.equal(W.layout(338, 158, 'medium', 4).tiles.every(t => t.y === W.layout(338, 158, 'medium', 4).tiles[0].y), true, 'one row of four');
  assert.equal(W.layout(158, 158, 'small', 1).tiles.length, 1); assert.equal(W.layout(158, 158, 'small', 1).title, null);
  assert.equal(W.layout(338, 354, 'large', 4).rows, 2);
});

test('shortcuts widget: what a tap does', async () => {
  const W = await load(), bed = W.TILES[0], cozy = W.TILES[1];
  assert.deepEqual(W.actionFor(bed, { state: 'off' }), { domain: 'switch', service: 'turn_on', data: { entity_id: 'switch.bedlight' } });
  assert.deepEqual(W.actionFor(bed, { state: 'on' }), { domain: 'switch', service: 'turn_off', data: { entity_id: 'switch.bedlight' } });
  assert.equal(W.actionFor(bed, null).service, 'turn_on', 'no state known: on');
  assert.equal(W.actionFor({ kind: 'switch', entity: 'light.lamp' }, { state: 'on' }).domain, 'light');
  assert.deepEqual(W.actionFor(cozy, null), { domain: 'script', service: 'turn_on', data: { entity_id: 'script.govee_cozy_lights' } });
  assert.equal(W.actionFor({ kind: 'script', entity: 'scene.movie' }, null).domain, 'scene');
});

test('shortcuts widget: the words under a button and in the banner', async () => {
  const W = await load(), bed = W.TILES[0], cozy = W.TILES[1];
  assert.deepEqual(W.tileWords(bed, { state: 'on' }, 'en'), { name: 'bedLight', sub: 'On' });
  assert.deepEqual(W.tileWords(bed, { state: 'off' }, 'de'), { name: 'bedLight', sub: 'Aus' });
  assert.equal(W.tileWords(bed, { state: 'unavailable' }, 'en').sub, ''); assert.equal(W.tileWords(bed, null, 'en').sub, '');
  assert.deepEqual(W.tileWords(cozy, null, 'en'), { name: 'Cozy lights', sub: '' });
  assert.equal(W.doneWords(bed, { state: 'off' }, 'en').title, 'bedLight on ✓');
  assert.equal(W.doneWords(bed, { state: 'on' }, 'en').title, 'bedLight off ✓');
  assert.equal(W.doneWords(cozy, null, 'en').title, 'Cozy lights ✓');
});

test('shortcuts widget: nothing is switched while a widget is only drawn', async () => {
  const calls = SRC.match(/'\/api\/services\/'/g) || [];
  assert.equal(calls.length, 1, 'one place sends a service call: runTile');
  assert.ok(/!config\.runsInWidget && q\.tile/.test(SRC));
  assert.ok(!/runTile\(/.test(SRC.slice(SRC.indexOf('const got = await load(cfg);\n  Script.setWidget'))), 'the widget run does not call runTile');
});

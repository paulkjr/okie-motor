'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const L = require('../src/okie-logic.js');

const known = ['weather', 'todos', 'news', 'calendar', 'tips', 'd:cameras', 'd:sensors', 'd:map'], deck = ['d:cameras', 'd:sensors', 'd:map'];

test('the keys of the cards in the right column: the first two keep their old names', () => {
  assert.deepEqual([0, 1, 2, 3].map(L.stackKey), ['w:slider', 'w:deck', 'w:s2', 'w:s3']);
  assert.deepEqual(['w:slider', 'w:deck', 'w:s2', 'w:s7', 'w:feeder', 'light.x', 'w:s'].map(L.stackIndex), [0, 1, 2, 7, -1, -1, -1]);
});

test('stacks from the settings of before: one swipeable card, or the sliding card and the deck as two', () => {
  const one = L.migrateStacks({}, { known, deck, w2: true });
  assert.deepEqual(one, [['weather', 'todos', 'news', 'calendar', 'tips', 'd:cameras', 'd:sensors', 'd:map']], 'nothing saved: one card with every page');
  assert.deepEqual(L.migrateStacks({ pages: ['calendar', 'weather'], pagesVer: 2 }, { known, deck, w2: true }), [['calendar', 'weather']], 'a list saved after the deck pages existed has no more than it names');
  assert.deepEqual(L.migrateStacks({ pages: ['calendar', 'weather', 'd:map'], pagesVer: 2 }, { known, deck, w2: true }), [['calendar', 'weather', 'd:map']]);
  assert.deepEqual(L.migrateStacks({ oneWidget: false }, { known, deck, w2: true }), [['weather', 'todos', 'news', 'calendar', 'tips'], deck], 'two cards: the pages and the deck');
  assert.deepEqual(L.migrateStacks({ oneWidget: false, deckPages: ['sensors', 'd:cameras'] }, { known, deck, w2: true }), [['weather', 'todos', 'news', 'calendar', 'tips'], ['d:sensors', 'd:cameras']]);
  assert.deepEqual(L.migrateStacks({}, { known, deck: [], w2: true }), [['weather', 'todos', 'news', 'calendar', 'tips']], 'no deck pages: just the pages');
  assert.deepEqual(L.migrateStacks({ oneWidget: false }, { known, deck, w2: false }), [deck], 'the sliding card switched off: only the deck');
  assert.deepEqual(L.migrateStacks({ stacks: [['weather', 'nonsense', 'weather'], [], ['d:map']] }, { known, deck, w2: true }), [['weather'], ['d:map']], 'saved stacks are cleaned');
});

test('adding a widget gives it a card of its own, removing takes it out and drops an empty card', () => {
  const s = [['weather', 'todos'], ['d:cameras']];
  assert.deepEqual(L.addPage(s, 'news'), [['weather', 'todos'], ['d:cameras'], ['news']]); assert.deepEqual(L.addPage(s, 'todos'), s, 'already on a card'); assert.notEqual(L.addPage(s, 'todos'), s, 'a copy');
  assert.deepEqual(L.removePage(s, 'todos'), [['weather'], ['d:cameras']]); assert.deepEqual(L.removePage(s, 'd:cameras'), [['weather', 'todos']]); assert.deepEqual(L.removePage(s, 'x'), s);
  assert.deepEqual(s, [['weather', 'todos'], ['d:cameras']], 'the original is not touched');
});

test('dropping a card on another merges its pages into it', () => {
  const s = [['weather'], ['d:cameras', 'd:sensors'], ['calendar']];
  assert.deepEqual(L.mergeStacks(s, 2, 0), [['weather', 'calendar'], ['d:cameras', 'd:sensors']]); assert.deepEqual(L.mergeStacks(s, 0, 1), [['d:cameras', 'd:sensors', 'weather'], ['calendar']]);
  assert.deepEqual(L.mergeStacks(s, 1, 1), s); assert.deepEqual(L.mergeStacks(s, 5, 0), s); assert.deepEqual(L.mergeStacks(s, 0, -1), s);
});

test('after the cards change, the keys of the right column follow them', () => {
  const before = [['weather'], ['d:cameras'], ['calendar']], after = L.mergeStacks(before, 2, 0);      // the third card joined the first
  const map = L.stackMap(before, after); assert.deepEqual(map, [0, 1, 0]);
  assert.deepEqual(L.remapStackKeys(['w:deck', 'light.lamp', 'w:s2', 'w:slider', 'w:feeder'], map), ['w:deck', 'light.lamp', 'w:slider', 'w:feeder'], 'the merged card is gone, the order of the rest stays');
  const gone = L.removePage(before, 'd:cameras'); assert.deepEqual(L.stackMap(before, gone), [0, -1, 1]);
  assert.deepEqual(L.remapStackKeys(['w:s2', 'w:deck', 'w:slider'], L.stackMap(before, gone)), ['w:deck', 'w:slider'], 'the third card is now the second; the removed one is gone');
});

test('the grid of the right column knows a third card and more', () => {
  const lay = L.rightLayout({ order: ['w:slider', 'w:deck', 'w:s2', 'w:feeder'] });
  assert.deepEqual(lay.names, ['w2', 'w34', 'ws2', 'w5']); assert.match(lay.rows, /var\(--w34-row-height,196px\) var\(--w34-row-height,196px\)/);
  const two = L.rightLayout({ order: ['w:s2', 'light.lamp'] }); assert.deepEqual(two.names, ['ws2', 'p0']);
});

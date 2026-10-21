'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');

// The widget is a Scriptable script (top-level await, no module system): run it without Scriptable's globals, so it only exports its pure part.
const SRC = fs.readFileSync(path.join(__dirname, '..', 'widget', 'okie-feed-widget.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function load() { const m = { exports: {} }; await new AsyncFunction('module', SRC)(m); return m.exports; }

const NOW = Date.parse('2026-10-14T03:30:00Z');       // 11:30 PM in New York
const mins = n => NOW - n * 60000;

test('feed widget: when they were fed, in words', async () => {
  const W = await load();
  assert.equal(W.fedText(null, NOW, 'en'), 'Not fed yet');
  assert.equal(W.fedText(mins(1), NOW, 'en'), 'Just now');
  assert.equal(W.fedText(mins(12), NOW, 'en'), '12 min ago');
  assert.match(W.fedText(mins(59), NOW, 'en'), /59 min ago/);
  assert.equal(W.fedText(mins(5), NOW, 'de'), 'vor 5 Min');
  assert.match(W.fedText(mins(60 * 30), NOW, 'en'), /^(Yesterday|[A-Z][a-z]{2}) /, 'a day or more ago');
  assert.match(W.fedText(mins(180), NOW, 'en'), /^(Today|Yesterday) \d{1,2}:\d{2}\s?[AP]M$/, 'a few hours ago: the clock time');
});

test('feed widget: a tap asks first when they were fed a moment ago', async () => {
  const W = await load();
  assert.equal(W.tooSoon(mins(3), NOW), true);
  assert.equal(W.tooSoon(mins(9.9), NOW), true);
  assert.equal(W.tooSoon(mins(10.1), NOW), false);
  assert.equal(W.tooSoon(mins(180), NOW), false);
  assert.equal(W.tooSoon(null, NOW), false);
  assert.equal(W.tooSoon(mins(3), NOW, 2), false, 'the limit can be changed');
  assert.equal(W.tooSoon(NOW + 5 * 3600e3, NOW), false, 'a time in the future (the clocks differ) does not block');
});

test('feed widget: the script to run is the wanted one, else one about feeding', async () => {
  const W = await load(), st = (id, name) => ({ entity_id: id, attributes: { friendly_name: name } });
  const all = [st('light.x', 'Lamp'), st('script.goodnight', 'Goodnight'), st('script.feed_the_beasts_2', 'Feed the Beasts'), st('script.feed_cats_old', 'Old')];
  assert.equal(W.pickScript(all, 'script.feed_the_beasts_2'), 'script.feed_the_beasts_2');
  assert.equal(W.pickScript(all, 'script.goodnight'), 'script.goodnight', 'the wanted one, when it exists');
  assert.equal(W.pickScript(all, 'script.gone'), 'script.feed_cats_old', 'else one whose name says feed (the first by id)');
  assert.equal(W.pickScript([st('script.goodnight', 'Goodnight')], 'script.gone'), null);
  assert.equal(W.pickScript(null, 'x'), null);
  assert.equal(W.pickScript([st('script.a', 'Füttern')], null), 'script.a');
});

test('feed widget: what the face shows from the script state', async () => {
  const W = await load();
  const d = W.summarize({ state: 'off', attributes: { friendly_name: 'Feed the Beasts', last_triggered: new Date(mins(12)).toISOString() } }, NOW, 'en');
  assert.equal(d.name, 'Feed the Beasts'); assert.equal(d.last, '12 min ago'); assert.equal(d.lastTs, mins(12)); assert.equal(d.unavailable, false); assert.equal(d.running, false);
  assert.equal(W.summarize({ state: 'on', attributes: {} }, NOW, 'en').running, true);
  const none = W.summarize({ state: 'off', attributes: {} }, NOW, 'en');
  assert.equal(none.lastTs, null); assert.equal(none.last, 'Not fed yet');
  assert.equal(W.summarize(null, NOW, 'en').unavailable, true);
  assert.equal(W.summarize({ state: 'unavailable', attributes: {} }, NOW, 'en').unavailable, true);
});

test('feed widget: the cat is a head, two ears, two eyes and a nose inside its box, and the script never calls the feeding script on its own', async () => {
  const W = await load(), c = W.CAT;
  assert.equal(c.ears.length, 2); assert.equal(c.eyes.length, 2); assert.equal(c.nose.length, 3);
  const pts = [].concat(c.ears.flat(), c.nose);
  pts.forEach(([x, y]) => assert.ok(Math.abs(x) <= .5 && Math.abs(y) <= .5, 'a point inside the box'));
  [c.head].concat(c.eyes).forEach(e => assert.ok(Math.abs(e.x) + e.w / 2 <= .5 && Math.abs(e.y) + e.h / 2 <= .5));
  assert.equal(c.ears[0][0][0], -c.ears[1][0][0], 'the ears mirror each other');
  // the one place that feeds is feed(): called only for a tap (?feed=1) and for the menu's "Feed the beasts now", never while a widget is drawn
  const calls = SRC.match(/script\/turn_on/g) || [];
  assert.equal(calls.length, 1);
  assert.ok(/!config\.runsInWidget && q\.feed === '1'/.test(SRC));
  const widgetBranch = SRC.slice(SRC.indexOf('if (!cfg.token) {\n    const w = new ListWidget()'));
  assert.ok(!/feed\(/.test(widgetBranch.split('if (typeof Script')[0]), 'the widget run does not feed');
});

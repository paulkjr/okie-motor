'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const FD = require('../src/okie-feeder.js');

const st = o => Object.fromEntries(Object.entries(o).map(([id, a]) => [id, { state: 'off', attributes: a }]));

test('feeder: the script is found by "feed" in its id or its name, or taken from the setting', () => {
  const s = st({ 'script.goodnight': {}, 'script.feed_the_beasts_2': { friendly_name: 'Feed The Beasts' }, 'script.zoo': { friendly_name: 'Feed cats' }, 'light.feeder_lamp': {} });
  assert.equal(FD.pick(s, 'auto'), 'script.feed_the_beasts_2');
  assert.equal(FD.pick(s, undefined), 'script.feed_the_beasts_2');
  assert.equal(FD.pick(s, 'script.zoo'), 'script.zoo');
  assert.equal(FD.pick(s, 'script.not_there'), 'script.feed_the_beasts_2', 'a setting that is not a real entity falls back to the search');
  assert.equal(FD.pick(s, 'off'), null);
  assert.equal(FD.pick(st({ 'script.goodnight': {} }), 'auto'), null);
  assert.equal(FD.pick(st({ 'script.futtern': {} }), 'auto'), 'script.futtern', 'German too');
  assert.equal(FD.pick(null, 'auto'), null);
});

test('feeder: when it last ran, and when a tap needs a second one', () => {
  const now = Date.parse('2026-10-20T12:00:00Z');
  assert.equal(FD.lastFed({ attributes: { last_triggered: '2026-10-20T11:55:00Z' } }), Date.parse('2026-10-20T11:55:00Z'));
  assert.equal(FD.lastFed({ attributes: { last_triggered: null } }), null);
  assert.equal(FD.lastFed({ attributes: {} }), null);
  assert.equal(FD.lastFed(null), null);
  assert.equal(FD.recent(now - 9 * 60000, now, 10), true);
  assert.equal(FD.recent(now - 10 * 60000, now, 10), false);
  assert.equal(FD.recent(null, now, 10), false);
  assert.equal(FD.recent(now + 60000, now, 10), false, 'a clock that is ahead is not "recent"');
});

test('feeder: "Today 6:09 AM", "Yesterday ...", a weekday after that', () => {
  const now = new Date(2026, 9, 20, 12, 0).getTime();
  const words = { today: 'Today', yesterday: 'Yesterday' }, clock = ms => new Date(ms).getHours() + ':' + String(new Date(ms).getMinutes()).padStart(2, '0'), wd = d => 'Day' + d.getDay();
  assert.equal(FD.when(new Date(2026, 9, 20, 6, 9).getTime(), now, words, clock, wd), 'Today 6:09');
  assert.equal(FD.when(new Date(2026, 9, 19, 21, 0).getTime(), now, words, clock, wd), 'Yesterday 21:00');
  assert.equal(FD.when(new Date(2026, 9, 17, 8, 5).getTime(), now, words, clock, wd), 'Day6 8:05');
});

test('feeder: six looks (the row and the five designs of the iOS widget), an unknown choice is the row, each look has its height', () => {
  assert.deepEqual(FD.ORDER, ['compact', 'classic', 'peek', 'leaves', 'neon', 'bowl']);
  assert.deepEqual(FD.ORDER.slice(1), ['classic', 'peek', 'leaves', 'neon', 'bowl'], 'the same ids as the FeederDesign of the iOS app');
  ['compact', 'classic', 'peek', 'leaves', 'neon', 'bowl'].forEach(id => assert.equal(FD.designId(id), id));
  [undefined, null, '', 'neon2', 'toString', 42].forEach(v => assert.equal(FD.designId(v), 'compact', 'bad value ' + String(v)));
  assert.equal(FD.heightOf('compact'), 92, 'the row keeps its height');
  ['classic', 'peek', 'leaves', 'neon', 'bowl'].forEach(id => assert.equal(FD.heightOf(id), 158, id + ' is as high as the widget'));
  assert.equal(FD.heightOf('nope'), 92);
});

test('feeder: the peeking cat sets the name on two lines, the others on one', () => {
  assert.deepEqual(FD.splitTitle('Feed The Beasts'), { first: 'Feed The', last: 'Beasts' });
  assert.deepEqual(FD.splitTitle('Futter'), { first: 'Futter', last: '' });
  assert.deepEqual(FD.splitTitle('  '), { first: '', last: '' });
  assert.ok(FD.DESIGNS.peek.title.two > 0);
  ['classic', 'leaves', 'neon', 'bowl'].forEach(id => assert.ok(!FD.DESIGNS[id].title.two, id));
});

test('feeder: every picture a design uses is in the art file, small and a WebP, and every design has its colours', () => {
  const ART = require('../src/okie-feeder-art.js');
  let bytes = 0;
  Object.keys(ART).forEach(k => { assert.match(ART[k].u, /^data:image\/webp;base64,/, k); assert.ok(ART[k].w > 0 && ART[k].h > 0, k); bytes += ART[k].u.length; });
  assert.ok(bytes < 200 * 1024, 'the art stays small (' + Math.round(bytes / 1024) + ' KB)');
  Object.keys(FD.DESIGNS).filter(id => id !== 'compact').forEach(id => {
    const d = FD.DESIGNS[id];
    (d.art || []).forEach(a => { assert.ok(ART[a.k], id + ' uses ' + a.k); assert.ok(a.x !== undefined || a.r !== undefined, id + ': ' + a.k + ' hangs on an edge'); assert.ok(a.w > 0 && a.y !== undefined); });
    if (d.scene) assert.ok(ART[d.scene], id + ' scene');
    assert.match(d.accent, /^#[0-9a-f]{6}$/i, id + ' accent');
    if (!d.glass) { assert.match(d.top, /^#[0-9a-f]{6}$/i, id); assert.match(d.bottom, /^#[0-9a-f]{6}$/i, id); }
    assert.ok(d.title.size > 0 && d.line.size > 0, id + ' text sizes');
  });
});

test('feeder: the settings row offers exactly the looks, and the card starts on the row', () => {
  const S = require('../src/okie-settings.js'), row = S.ROWS.find(r => r.id === 'feeder_design');
  assert.ok(row, 'a settings row');
  assert.equal(row.path, 'bento.feederDesign');
  assert.deepEqual(row.options.map(o => o.id), FD.ORDER);
  const card = require('fs').readFileSync(require('path').join(__dirname, '../src/okie-card.js'), 'utf8');
  assert.match(card, /feederDesign: 'compact'/);
});

test('feeder: the picture file is listed before the card in the harness page (the bundle is built in that order)', () => {
  const html = require('fs').readFileSync(require('path').join(__dirname, '../harness/index.html'), 'utf8');
  assert.ok(html.indexOf('okie-feeder-art.js') > 0 && html.indexOf('okie-feeder-art.js') < html.indexOf('okie-feeder.js'));
});

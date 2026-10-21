'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const ST = require('../src/okie-settings.js');
const core = require('../src/okie-core.js');

test('path helpers read and build nested values', () => {
  assert.equal(ST.getPath({ a: { b: { c: 3 } } }, 'a.b.c'), 3);
  assert.equal(ST.getPath({ a: 1 }, 'a.b.c'), undefined);
  assert.deepEqual(ST.setPartial('glass.blur', 30), { glass: { blur: 30 } });
  assert.deepEqual(ST.setPartial('squircle', 'strong'), { squircle: 'strong' });
});

const row = id => ST.ROWS.find(r => r.id === id);

test('search finds a setting by name, description or option, in both languages', () => {
  assert.ok(ST.rowMatches(row('squircle'), 'card shape', 'en'));
  assert.ok(ST.rowMatches(row('squircle'), 'strong', 'en'), 'option label');
  assert.ok(ST.rowMatches(row('g_blur'), 'blurry', 'en'), 'description word');
  assert.ok(ST.rowMatches(row('squircle'), 'kartenform', 'de'));
  assert.ok(ST.rowMatches(row('language'), 'sprache', 'de'));
  assert.ok(ST.rowMatches(row('v_diag'), 'diagnos', 'en'), 'prefix');
  assert.ok(!ST.rowMatches(row('g_blur'), 'wallpaper', 'en'));
  assert.ok(ST.rowMatches(row('g_blur'), '', 'en'), 'empty query matches everything');
  assert.ok(ST.rowMatches(row('qc'), 'qick control', 'en'), 'typo tolerant');
});

test('every setting has a label and description in both languages', () => {
  ST.ROWS.forEach(r => {
    ['en', 'de'].forEach(l => { assert.ok(ST.pick(r.label, l), r.id + ' label ' + l); assert.ok(ST.pick(r.desc, l), r.id + ' desc ' + l); });
    assert.ok(['general', 'appearance', 'filter', 'about'].includes(r.tab), r.id);
    if (r.type === 'segment' || r.type === 'multi') assert.ok(r.options && r.options.length >= 2, r.id + ' options');
    if (r.path) assert.ok(typeof r.path === 'string');
  });
  const ids = ST.ROWS.map(r => r.id);
  assert.equal(new Set(ids).size, ids.length, 'row ids are unique');
});

test('the Changed filter lists only rows whose value differs from the default', () => {
  const store = core.createStore({ localStorage: null, idb: null, setTimeout: fn => fn() });
  const s = core.createSettings({ store, defaults: { squircle: 'none', glass: { blur: 40, contrast: 100 }, quickControl: { light: 'tap' } } });
  assert.deepEqual(ST.changedRows(ST.ROWS, s.changed()), []);
  s.set({ squircle: 'strong', glass: { blur: 20 }, quickControl: { light: 'off' } });
  const ids = ST.changedRows(ST.ROWS, s.changed()).map(r => r.id).sort();
  assert.deepEqual(ids, ['g_blur', 'qcdomains', 'squircle']);
  s.reset('glass.blur');
  assert.ok(!ST.changedRows(ST.ROWS, s.changed()).some(r => r.id === 'g_blur'));
});

test('every row path refers to something the card actually has a default for', () => {
  const card = require('../src/okie-card.js');
  const D = card.DEFAULTS;
  ST.ROWS.forEach(r => ST.pathsOf(r).forEach(p => {
    const v = ST.getPath(D, p);
    assert.ok(v !== undefined, r.id + ' (' + p + ') has no default');
  }));
});

test('module-contributed rows (notifications, rest) have defaults, strings and valid tabs too', () => {
  const card = require('../src/okie-card.js');
  const R = require('../src/okie-rest.js'), N = require('../src/okie-notify.js');
  const D = Object.assign({}, card.DEFAULTS, R.DEFAULTS, N.DEFAULTS);
  const rows = R.SETTINGS_ROWS.concat(N.SETTINGS_ROWS);
  assert.ok(rows.length >= 12);
  rows.forEach(r => {
    assert.ok(ST.getPath(D, r.path) !== undefined, r.id + ' (' + r.path + ') has no default');
    ['en', 'de'].forEach(l => { assert.ok(ST.pick(r.label, l), r.id + ' label ' + l); assert.ok(ST.pick(r.desc, l), r.id + ' desc ' + l); });
    assert.equal(r.tab, 'general');
  });
  const all = ST.ROWS.concat(rows).map(r => r.id);
  assert.equal(new Set(all).size, all.length, 'row ids stay unique across modules');
});

test('sub-pages: every row on a page names a page that exists, and every page has something in it', () => {
  const rows = ST.allRows([]);
  rows.filter(r => r.page).forEach(r => assert.ok(ST.PAGES[r.page], r.id + ' is on page ' + r.page));
  Object.keys(ST.PAGES).forEach(id => {
    const pg = ST.PAGES[id];
    assert.ok(['general', 'appearance', 'filter', 'about'].includes(pg.tab), id + ' tab');
    ['en', 'de'].forEach(l => { assert.ok(ST.pick(pg.label, l), id + ' label ' + l); assert.ok(ST.pick(pg.desc, l), id + ' desc ' + l); });
    assert.ok(rows.some(r => r.page === id) || (pg.links || []).length, id + ' is empty');
    (pg.links || []).forEach(l => assert.ok(ST.PAGES[l], id + ' links to ' + l));
  });
});

test('module rows land on the sub-page that matches their group', () => {
  const R = require('../src/okie-rest.js'), N = require('../src/okie-notify.js');
  const rows = ST.allRows(R.SETTINGS_ROWS.concat(N.SETTINGS_ROWS));
  assert.ok(rows.filter(r => r.id.startsWith('r_') && r.id !== 'r_lock').every(r => r.page === 'widgets'), 'screensaver rows sit under Configure widgets');
  const lock = rows.find(r => r.id === 'r_lock');
  assert.ok(lock && !lock.page && lock.tab === 'general', '"Back to the lock page after" is on the General tab itself, easy to find');
  assert.ok(rows.filter(r => r.id.startsWith('n_')).every(r => r.page === 'toasts'), 'notification rows sit under Notifications');
});

test('inverted toggles ("Hide ...") show the opposite of the stored flag and write every path', () => {
  const hide = ST.ROWS.find(r => r.id === 'v_diag');
  assert.deepEqual(ST.pathsOf(hide), ['visibility.diagnostic', 'visibility.disabled']);
  assert.equal(ST.toggleValue(hide, { visibility: { diagnostic: false, disabled: false } }), true);
  assert.equal(ST.toggleValue(hide, { visibility: { diagnostic: true, disabled: true } }), false);
  assert.deepEqual(ST.togglePartial(hide, false), { visibility: { diagnostic: true, disabled: true } });
  assert.deepEqual(ST.togglePartial(hide, true), { visibility: { diagnostic: false, disabled: false } });
  const plain = ST.ROWS.find(r => r.id === 'zen_on');
  assert.deepEqual(ST.togglePartial(plain, true), { zen: { enabled: true } });
});

test('the Changed filter sees a row with several paths', () => {
  const hide = ST.ROWS.find(r => r.id === 'v_diag');
  assert.deepEqual(ST.changedRows([hide], ['visibility.disabled']).map(r => r.id), ['v_diag']);
  assert.deepEqual(ST.changedRows([hide], ['glass.blur']), []);
});

test('card shape options use the FSC names and keep the ids the squircle module knows', () => {
  const sq = ST.ROWS.find(r => r.id === 'squircle');
  const SQ = require('../src/okie-squircle.js');
  assert.deepEqual(sq.options.map(o => ST.pick(o.label, 'en')), ['Standard', 'Prominent', 'Balanced', 'Subtle']);
  sq.options.forEach(o => assert.ok(SQ.names.includes(o.id), o.id));
});

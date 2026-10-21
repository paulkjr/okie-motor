'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../src/okie-core.js');
const S = require('../src/okie-search.js');
const { makeHass } = require('./fixtures.js');

function engine(extra) {
  let t = 1700000000000;
  const e = S.createEngine(Object.assign({
    store: core.createStore({ localStorage: null, idb: null, setTimeout: fn => fn() }),
    now: () => t,
  }, extra || {}));
  e.setCollection(S.buildCollection(makeHass()));
  e._advance = ms => { t += ms; };
  return e;
}
const ids = r => r.results.map(x => x.item.id);

// ---- collection ----------------------------------------------------------
test('buildCollection hides hidden/diagnostic entities by default and resolves areas', () => {
  const items = S.buildCollection(makeHass());
  const byId = Object.fromEntries(items.map(i => [i.id, i]));
  assert.ok(!byId['light.hidden_one'], 'hidden entity is not leaked');
  assert.ok(!byId['sensor.phone_battery'], 'diagnostic entity is not leaked');
  assert.equal(byId['light.kitchen_ceiling'].area, 'Kitchen');
  const all = S.buildCollection(makeHass(), { includeHidden: true, includeDiagnostic: true });
  assert.ok(all.find(i => i.id === 'light.hidden_one'));
  assert.ok(all.find(i => i.id === 'sensor.phone_battery'));
});

test('buildCollection resolves area through the device when the entity has none', () => {
  const hass = makeHass();
  hass.devices = { d1: { id: 'd1', area_id: 'garage' } };
  hass.states['switch.opener'] = { entity_id: 'switch.opener', state: 'off', attributes: { friendly_name: 'Opener' } };
  hass.entities['switch.opener'] = { entity_id: 'switch.opener', device_id: 'd1' };
  const it = S.buildCollection(hass).find(i => i.id === 'switch.opener');
  assert.equal(it.areaId, 'garage');
  assert.equal(it.area, 'Garage');
});

// ---- fuzzy ----------------------------------------------------------------
test('typo tolerance: kitchn / kitchen, lvingroom', () => {
  const e = engine();
  assert.ok(ids(e.search('kitchn ceiling')).includes('light.kitchen_ceiling'));
  assert.equal(ids(e.search('thermostat'))[0].startsWith('climate.'), true);
  assert.ok(ids(e.search('termostat')).some(i => i.startsWith('climate.')), 'one missing letter still finds thermostats');
});

test('partial matching: "coff" finds the coffee machine first', () => {
  assert.equal(ids(engine().search('coff'))[0], 'switch.coffee_machine');
});

test('German umlaut folding: kueche / kuche / Küche all hit Küche Spots', () => {
  const e = engine();
  ['kueche', 'kuche', 'Küche'].forEach(q => assert.ok(ids(e.search(q)).includes('light.kuche_spots'), q));
});

test('every query word must land: unrelated words return nothing', () => {
  assert.deepEqual(ids(engine().search('zzzzqx')), []);
});

test('exact name beats a partial name match', () => {
  assert.equal(ids(engine().search('garage door'))[0], 'cover.garage_door');
});

// ---- intent ---------------------------------------------------------------
test('intent: "living room light" -> area + domain, pre-filtered', () => {
  const e = engine();
  const r = e.search('living room light');
  assert.equal(r.intent.area.id, 'living_room');
  assert.equal(r.intent.domain, 'light');
  assert.deepEqual(ids(r).sort(), ['light.living_room_lamp', 'light.living_room_strip']);
});

test('intent: German synonyms "Lampe Schlafzimmer" style (area typed in German domain word)', () => {
  const e = engine();
  const r = e.search('lampen bedroom');
  assert.equal(r.intent.domain, 'light');
  assert.equal(r.intent.area.id, 'bedroom');
  assert.deepEqual(ids(r), ['light.bedroom_main']);
});

test('intent: sensor type words become domain+deviceClass', () => {
  const e = engine();
  const r = e.search('temperature kitchen');
  assert.equal(r.intent.deviceClass, 'temperature');
  assert.deepEqual(ids(r), ['sensor.kitchen_temperature']);
});

test('intent: state word narrows when anchored ("kitchen on")', () => {
  const e = engine();
  const r = e.search('kitchen on');
  assert.equal(r.intent.state, 'on');
  r.results.forEach(x => assert.equal(x.item.areaId, 'kitchen'));
  assert.ok(ids(r).includes('light.kitchen_ceiling'));
  assert.ok(!ids(r).includes('light.kitchen_counter'), 'off light excluded');
});

test('intent: a bare state word is just text, not a filter', () => {
  const r = engine().search('on');
  assert.equal(r.intent.state, null);
});

test('intent: pre-filter shrinks the search space', () => {
  const e = engine();
  const intent = e.parseIntent('kitchen light');
  assert.equal(intent.area.id, 'kitchen');
  assert.equal(intent.domain, 'light');
  assert.equal(intent.text, '');
});

test('intent falls back to plain fuzzy when the filtered pool is empty', () => {
  const r = engine().search('garden light movie');
  assert.equal(r.relaxed, true);
  assert.ok(ids(r).includes('scene.movie_night'));
});

test('typed prefix of a multi-word area: "living r" reads as Living Room', () => {
  const r = engine().search('living r lamp');
  assert.equal(r.intent.area.id, 'living_room');
});

// ---- scoring --------------------------------------------------------------
test('score = fuzzy*0.7 + relevance*0.3 + prefix bonus', () => {
  const e = engine();
  const r = e.search('kitchen ceiling').results[0];
  const expect = r.fuzzy * 0.7 + r.relevance * 0.3 + 0.15;
  assert.ok(Math.abs(r.score - expect) < 1e-9, `${r.score} vs ${expect}`);
});

test('prefix bonus applies only when the name starts with the query', () => {
  const e = engine();
  const bonus = r => r.score - (r.fuzzy * 0.7 + r.relevance * 0.3);
  const starts = e.search('kitchen counter').results.find(x => x.item.id === 'light.kitchen_counter');
  const inside = e.search('counter').results.find(x => x.item.id === 'light.kitchen_counter');
  assert.ok(Math.abs(bonus(starts) - 0.15) < 1e-9);
  assert.ok(Math.abs(bonus(inside)) < 1e-9);
});

test('door/window words are text, not hard filters ("front door" still finds the lock)', () => {
  const r = engine().search('front door');
  assert.equal(r.intent.deviceClass, null);
  assert.ok(ids(r).includes('lock.front_door'));
  assert.ok(ids(r).includes('camera.front_door'));
});

test('15+ domain synonym groups, DE and EN', () => {
  assert.ok(Object.keys(S.DOMAIN_SYNONYMS).length >= 15);
  const e = engine();
  ['rollo', 'blinds', 'saugroboter', 'steckdose', 'heizung', 'kamera', 'schloss', 'ventilator'].forEach(w => {
    assert.ok(e.parseIntent(w).domain, w + ' should map to a domain');
  });
});

// ---- cache ----------------------------------------------------------------
test('LRU cache: repeat query is served from cache and invalidated by a new collection', () => {
  const e = engine();
  assert.equal(e.search('lamp').cached, false);
  assert.equal(e.search('lamp').cached, true);
  e.setCollection(S.buildCollection(makeHass()));
  assert.equal(e.search('lamp').cached, false);
});

test('cache holds at most 30 distinct queries', () => {
  const e = engine();
  for (let i = 0; i < 40; i++) e.search('light ' + i);
  assert.equal(e.cacheSize, 30);
});

test('search is fast: well under 30 ms for a 2000 entity house', () => {
  const e = engine();
  const big = [];
  for (let i = 0; i < 2000; i++) big.push({ id: 'sensor.thing_' + i, name: 'Thing number ' + i, domain: 'sensor', state: '1', areaId: 'kitchen', area: 'Kitchen', labels: [] });
  e.setCollection(big);
  e.search('warmup');
  const t0 = process.hrtime.bigint();
  e.search('thing 17');
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.ok(ms < 30, ms + ' ms');
});

// ---- chip completion -------------------------------------------------------
test('ghost completion: Kit -> chen (area), lam -> domain, Temp -> sensor', () => {
  const e = engine();
  const a = e.complete('Kit');
  assert.equal(a.kind, 'area'); assert.equal(a.ghost, 'chen'); assert.equal(a.value, 'kitchen');
  const d = e.complete('lam');
  assert.equal(d.kind, 'domain'); assert.equal(d.value, 'light');
  const s = e.complete('Temp');
  assert.equal(s.kind, 'sensor'); assert.equal(s.value, 'temperature'); assert.equal(s.ghost, 'erature');
  assert.equal(e.complete('k'), null, 'too short');
  assert.equal(e.complete('qqq'), null);
});

test('a chip scopes the search exactly like a typed filter', () => {
  const e = engine();
  const r = e.search('', { chips: [{ kind: 'area', value: 'kitchen' }, { kind: 'domain', value: 'light' }] });
  assert.deepEqual(ids(r).sort(), ['light.kitchen_ceiling', 'light.kitchen_counter']);
});

// ---- excluded patterns ------------------------------------------------------
test('excluded patterns: wildcards, live preview, template library, import/export', () => {
  const e = engine();
  assert.ok(ids(e.search('linkquality')).includes('sensor.kitchen_sensor_linkquality'));
  const preview = e.previewExcluded(['*_linkquality']).map(i => i.id);
  assert.deepEqual(preview, ['sensor.kitchen_sensor_linkquality']);
  e.setExcluded(['*_linkquality']);
  assert.ok(!ids(e.search('linkquality')).includes('sensor.kitchen_sensor_linkquality'));
  assert.ok(ids(e.search('linkquality', { includeExcluded: true })).includes('sensor.kitchen_sensor_linkquality'));
  const json = e.exportExcluded();
  const e2 = engine();
  e2.importExcluded(json);
  assert.deepEqual(e2.getExcluded(), ['*_linkquality']);
  assert.throws(() => e2.importExcluded('{"nope":1}'));
  assert.ok(S.EXCLUDE_TEMPLATES.length >= 3);
});

// ---- FSC's entity filters: dead states and missing areas -----------------------
test('hideUnavailable keeps unavailable/unknown entities out of search, suggestions and isExcluded', () => {
  const e = engine();
  const victim = e.all().find(i => i.id === 'light.kitchen_ceiling');
  assert.ok(ids(e.search('kitchen ceiling')).includes(victim.id), 'visible while the filter is off');
  e.patch(victim.id, { state: 'unavailable' });
  assert.ok(ids(e.search('kitchen ceiling')).includes(victim.id), 'unavailable stays findable until the filter is on');
  assert.ok(e.suggest(100).map(i => i.id).includes(victim.id), 'and suggestible');
  e.setFilters({ hideUnavailable: true });
  assert.ok(!ids(e.search('kitchen ceiling')).includes(victim.id));
  assert.ok(e.suggest(100).length > 5 && !e.suggest(100).map(i => i.id).includes(victim.id));
  assert.equal(e.isExcluded(victim), true);
  assert.ok(ids(e.search('kitchen ceiling', { includeExcluded: true })).includes(victim.id));
  e.patch(victim.id, { state: 'on' });                                          // it comes back by itself the moment it recovers
  assert.ok(ids(e.search('kitchen ceiling')).includes(victim.id));
  ['unknown', 'disabled', 'None'].forEach(st => { e.patch(victim.id, { state: st }); assert.equal(e.isExcluded(victim), true, st); });
});

test('a device that matches the words but is unavailable is reported as offline, not replaced by the closest live match', () => {
  const e = engine();
  const lamp = e.all().find(i => i.id === 'light.bedroom_main');
  e.setFilters({ hideUnavailable: true });
  e.patch(lamp.id, { state: 'unavailable' });
  const r = e.search('bed light');                                              // the live case: "bed light" while the bed light is offline
  assert.deepEqual(r.offline.map(i => i.id), [lamp.id]);
  assert.ok(!ids(r).includes(lamp.id), 'it is still kept out of the live results');
  assert.deepEqual(e.search('bedroom light').offline.map(i => i.id), [lamp.id]);
  assert.deepEqual(e.search('kitchen ceiling').offline, [], 'nothing offline matches');
  assert.deepEqual(e.search('bedroom light', { includeExcluded: true }).offline, [], 'asked for everything: nothing is held back');
  e.patch(lamp.id, { state: 'off' });                                           // it recovers: back in the list, no note
  const back = e.search('bed light');
  assert.deepEqual(back.offline, []);
  assert.ok(ids(back).includes(lamp.id));
  e.patch(lamp.id, { state: 'unavailable' });
  e.setFilters({});                                                             // the filter is off: it is simply listed
  assert.deepEqual(e.search('bed light').offline, []);
  assert.ok(ids(e.search('bed light')).includes(lamp.id));
});

test('a working device without a room is reported as unassigned instead of being invisible', () => {
  const e = engine();
  const scene = e.all().find(i => i.id === 'scene.movie_night');
  assert.ok(scene && !scene.areaId, 'fixture has a working device without a room');
  e.setFilters({ areaOnly: true });
  const r = e.search('movie night');
  assert.ok(!ids(r).includes(scene.id), 'still kept out of the list itself');
  assert.deepEqual(r.unassigned.map(i => i.id), [scene.id]);
  assert.deepEqual(r.offline, []);
  assert.deepEqual(e.search('kitchen ceiling').unassigned, [], 'a live match with a room needs no note');
  assert.deepEqual(e.search('movie night', { includeExcluded: true }).unassigned, []);
  e.setFilters({});                                                              // the filter is off: it is simply listed
  assert.deepEqual(e.search('movie night').unassigned, []);
  assert.ok(ids(e.search('movie night')).includes(scene.id));
  e.setFilters({ areaOnly: true, hideUnavailable: true });
  e.patch(scene.id, { state: 'unavailable' });                                   // no room and offline: nothing useful to show
  const dead = e.search('movie night');
  assert.deepEqual([dead.unassigned, dead.offline], [[], []]);
});

test('an offline match is not mentioned when a live device fits just as well', () => {
  const e = engine();
  e.setFilters({ hideUnavailable: true });
  e.patch('light.kitchen_counter', { state: 'unavailable' });
  const r = e.search('kitchen ceiling');
  assert.ok(ids(r).includes('light.kitchen_ceiling'));
  assert.deepEqual(r.offline, []);
});

test('areaOnly hides arealess entities from search and browsing but not from isExcluded (alerts and the island still see them)', () => {
  const e = engine();
  const arealess = e.all().find(i => !i.areaId);
  assert.ok(arealess, 'fixture has an entity without area');
  assert.equal(e.isHidden(arealess), false);
  e.setFilters({ areaOnly: true });
  assert.equal(e.isHidden(arealess), true);
  assert.equal(e.isExcluded(arealess), false);
  assert.ok(!ids(e.search(arealess.name)).includes(arealess.id));
  e.setFilters({});
  assert.ok(ids(e.search(arealess.name)).includes(arealess.id));
});

test('wildcard ? and anchoring', () => {
  const rx = S.wildcardToRegExp('light.k?tchen*');
  assert.ok(rx.test('light.kitchen_ceiling'));
  assert.ok(!rx.test('xlight.kitchen_ceiling'));
});

// ---- predictions ------------------------------------------------------------
test('cold start: suggestions bootstrap from domain priority and live state, not sensors', () => {
  const s = engine().suggest(5);
  assert.ok(s.length === 5);
  assert.ok(s.every(i => i.domain !== 'sensor'), 'no sensors on a cold shelf: ' + s.map(i => i.id));
  assert.equal(s[0].domain, 'light');
});

test('learning: used entity rises to the top after a few uses', () => {
  const e = engine();
  for (let i = 0; i < 6; i++) { e.recordUse('fan.bedroom_fan'); e._advance(60000); }
  assert.equal(e.suggest(1)[0].id, 'fan.bedroom_fan');
});

test('exponential decay: old use fades, recent use wins', () => {
  const e = engine();
  for (let i = 0; i < 6; i++) e.recordUse('fan.bedroom_fan');
  e._advance(90 * 86400000);                       // ~6 half-lives later
  for (let i = 0; i < 6; i++) e.recordUse('cover.living_room_blinds');
  assert.equal(e.suggest(1)[0].id, 'cover.living_room_blinds');
});

test('learning speed changes the half-life', () => {
  const slow = engine({ speed: 'slow' }), fast = engine({ speed: 'fast' });
  [slow, fast].forEach(e => { for (let i = 0; i < 6; i++) e.recordUse('fan.bedroom_fan'); for (let i = 0; i < 6; i++) e.recordUse('lock.front_door'); });
  [slow, fast].forEach(e => e._advance(20 * 86400000));
  [slow, fast].forEach(e => { for (let i = 0; i < 2; i++) e.recordUse('lock.front_door'); });
  // after 20 days: fast has forgotten the fan, slow still remembers it, so the gap differs
  const gapSlow = slow.search('fan').results[0].relevance;
  const gapFast = fast.search('fan').results[0].relevance;
  assert.ok(gapSlow > gapFast, `${gapSlow} > ${gapFast}`);
});

test('negative learning: ignored suggestions lose confidence, use forgives', () => {
  const e = engine();
  for (let i = 0; i < 6; i++) e.recordUse('fan.bedroom_fan');
  const before = e.search('fan').results[0].relevance;
  e.recordIgnored(['fan.bedroom_fan', 'fan.bedroom_fan', 'fan.bedroom_fan', 'fan.bedroom_fan']);
  const after = e.search('fan').results[0].relevance;
  assert.ok(after < before, `${after} < ${before}`);
  e.recordUse('fan.bedroom_fan'); e.recordUse('fan.bedroom_fan');
  const forgiven = e.search('fan').results[0].relevance;
  assert.ok(forgiven > after);
});

test('usage persists through the store and reset clears it', () => {
  const store = core.createStore({ localStorage: null, idb: null, setTimeout: fn => fn() });
  const e1 = engine({ store });
  for (let i = 0; i < 6; i++) e1.recordUse('fan.bedroom_fan');
  const e2 = engine({ store });
  assert.equal(e2.suggest(1)[0].id, 'fan.bedroom_fan');
  e2.resetLearning();
  assert.notEqual(e2.suggest(1)[0].id, 'fan.bedroom_fan');
});

test('patch: live state change re-filters without rebuilding the collection', () => {
  const e = engine();
  assert.ok(!ids(e.search('kitchen on')).includes('light.kitchen_counter'));
  e.patch('light.kitchen_counter', { state: 'on' });
  assert.ok(ids(e.search('kitchen on')).includes('light.kitchen_counter'));
});

test('patch: a rename becomes searchable immediately', () => {
  const e = engine();
  assert.notEqual(ids(e.search('zebra lamp'))[0], 'light.kitchen_counter');
  e.patch('light.kitchen_counter', { name: 'Zebra Lamp' });
  assert.equal(ids(e.search('zebra lamp'))[0], 'light.kitchen_counter');
});

test('default settings hide the Scheduler helper switches from the device list and search', () => {
  const D = require('../src/okie-card.js').DEFAULTS;
  assert.ok(D.excluded.includes('switch.schedule_*'));
  const e = engine();
  const list = S.buildCollection(makeHass()); list.push({ id: 'switch.schedule_a1b2c3', name: 'Schedule: lights', domain: 'switch', state: 'on', labels: [] });
  e.setCollection(list); e.setExcluded(D.excluded);
  assert.ok(!ids(e.search('schedule lights')).includes('switch.schedule_a1b2c3'));
  assert.ok(ids(e.search('coffee')).includes('switch.coffee_machine'), 'real switches stay');
});

test('friendly names with HTML entities are decoded when the collection is built', () => {
  const hass = makeHass();
  hass.states['media_player.tv'] = { entity_id: 'media_player.tv', state: 'on', attributes: { friendly_name: '50&quot; Crystal UHD' } };
  const it = S.buildCollection(hass).find(i => i.id === 'media_player.tv');
  assert.equal(it.name, '50" Crystal UHD');
});

test('importUsage seeds learning from another card and never overwrites what was learned here', () => {
  const e = engine();
  const ids0 = e.suggest(6).map(i => i.id);
  const pick = e.all().find(i => !ids0.includes(i.id) && i.domain === 'light');
  assert.equal(e.importUsage([{ id: pick.id, n: 40 }, { id: 'later.arrives', n: 5 }, { id: pick.id, n: 3 }, { id: 'bad', n: 0 }]), 2, 'ids are kept even before the entity exists; repeats and zero counts are ignored');
  e.recordUse(ids0[0]); e.recordUse(ids0[0]); e.recordUse(ids0[0]); e.recordUse(ids0[0]); e.recordUse(ids0[0]);
  assert.ok(e.suggest(8).map(i => i.id).includes(pick.id), 'a heavily used device from the other card is suggested');
  assert.equal(e.importUsage([{ id: ids0[0], n: 99 }]), 0, 'what this card already learned stays');
});

test('importPatterns replays another card\'s history in time order: clicks add, ignores subtract, old use fades', () => {
  const e = engine();
  const DAY = 86400000, now = 1700000000000;
  const [a, b] = e.all().filter(i => i.domain === 'light').slice(0, 2);
  const done = e.importPatterns([
    { id: a.id, ts: now - 1 * DAY, type: 'use', hour: 20 }, { id: a.id, ts: now - 2 * DAY, type: 'use', hour: 20 }, { id: a.id, ts: now - 3 * DAY, type: 'use', hour: 21 },
    { id: b.id, ts: now - 60 * DAY, type: 'use', hour: 8 }, { id: b.id, ts: now - 1 * DAY, type: 'ignore' }, { id: 'x', ts: 0, type: 'use' },
  ]);
  assert.equal(done, 5, 'the entry without a time is skipped');
  assert.ok(e.usageOf(a.id) > e.usageOf(b.id), 'three recent clicks outweigh one old click with an ignore');
});

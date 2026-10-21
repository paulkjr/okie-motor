'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const T = require('../src/okie-thermo.js');

// The widget is a Scriptable script (top-level await, no module system): run it the way the tests can, without Scriptable's globals, so it only exports its pure part.
const SRC = fs.readFileSync(path.join(__dirname, '..', 'widget', 'okie-thermostat-widget.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function load() { const m = { exports: {} }; await new AsyncFunction('module', SRC)(m); return m.exports; }

test('widget: the colours are the thermostat card\'s own', async () => {
  const W = await load();
  for (const [v, min, max, unit] of [[50, 50, 90, '°F'], [60, 50, 90, '°F'], [69, 50, 90, '°F'], [72, 50, 90, '°F'], [75, 50, 90, '°F'], [82, 50, 90, '°F'], [90, 50, 90, '°F'], [21, 7, 35, '°C'], [24, 7, 35, '°C'], [30, 7, 35, '°C']]) {
    assert.deepEqual(W.colorFor(v, min, max, unit), T.colorFor(v, min, max, unit), 'colour at ' + v + unit);
  }
});

test('widget: a thermostat state becomes the face (target, now, what it is doing, colour)', async () => {
  const W = await load();
  const cool = W.summarize({ state: 'cool', attributes: { friendly_name: 'Google Nest', current_temperature: 71, temperature: 70, hvac_action: 'cooling', min_temp: 50, max_temp: 90, current_humidity: 65 } }, '°F');
  assert.equal(cool.name, 'Google Nest'); assert.equal(cool.tgt, 70); assert.equal(cool.cur, 71); assert.equal(cool.status, 'Cooling'); assert.equal(cool.humidity, 65); assert.equal(cool.off, false);
  assert.deepEqual(cool.rgb, T.colorFor(70, 50, 90, '°F'));
  assert.equal(W.summarize({ state: 'cool', attributes: { current_temperature: 71, temperature: 71, hvac_action: 'idle' } }, '°F').status, 'Cool · idle');
  assert.equal(W.summarize({ state: 'heat', attributes: { temperature: 68, hvac_action: 'heating' } }, '°F').status, 'Heating');
  const range = W.summarize({ state: 'heat_cool', attributes: { target_temp_low: 68, target_temp_high: 76, current_temperature: 72 } }, '°F');
  assert.equal(range.tgt, 72, 'a heat/cool range shows its middle'); assert.equal(range.status, 'Heat/Cool');
  const off = W.summarize({ state: 'off', attributes: { current_temperature: 70, temperature: 72 } }, '°F');
  assert.equal(off.off, true); assert.equal(off.status, 'Off'); assert.deepEqual(off.rgb, { r: 150, g: 150, b: 150 }, 'an off thermostat is grey');
  const gone = W.summarize({ state: 'unavailable', attributes: {} }, '°F');
  assert.equal(gone.unavailable, true); assert.equal(gone.status, 'Not reachable'); assert.equal(gone.tgt, null);
  assert.equal(W.summarize(null, '°F').unavailable, true, 'no state at all is "not reachable"');
  assert.equal(W.summarize({ state: 'cool', attributes: { current_temperature: 21 } }, '°C').tgt, 21, 'no target: the temperature now');
  assert.equal(W.summarize({ state: 'cool', attributes: { temperature: 22 } }, '°C').min, 7, 'the Celsius range defaults');
});

test('widget: the temperature is shown without noise', async () => {
  const W = await load();
  assert.equal(W.fmtTemp(71), '71'); assert.equal(W.fmtTemp(21.5), '21.5'); assert.equal(W.fmtTemp(21.04), '21'); assert.equal(W.fmtTemp(null), '–'); assert.equal(W.fmtTemp(NaN), '–');
});

test('widget: the three mode icons follow what the thermostat can do, the active one is the mode it is in', async () => {
  const W = await load();
  const st = (state, hvac_modes) => W.summarize({ state, attributes: { temperature: 70, current_temperature: 71, hvac_modes } }, '°F');
  assert.deepEqual(W.modeIcons(st('cool', ['off', 'heat', 'cool', 'heat_cool'])), [{ id: 'heat', active: false }, { id: 'cool', active: true }, { id: 'heat_cool', active: false }]);
  assert.deepEqual(W.modeIcons(st('heat', ['off', 'heat', 'cool'])).map(m => m.id), ['heat', 'cool'], 'no heat/cool mode, no third icon');
  assert.deepEqual(W.modeIcons(st('auto', ['off', 'auto', 'heat', 'cool'])).filter(m => m.active).map(m => m.id), ['heat_cool'], 'auto shows as the third icon');
  assert.equal(W.modeIcons(st('off', ['off', 'heat', 'cool'])).some(m => m.active), false, 'an off thermostat has no active icon');
  assert.equal(W.modeIcons(W.summarize({ state: 'cool', attributes: {} }, '°F')).length, 3, 'unknown modes: all three');
  assert.equal(W.modeIcons(W.summarize(null, '°F')).some(m => m.active), false);
});

test('widget: the line under the number', async () => {
  const W = await load();
  const cool = W.summarize({ state: 'cool', attributes: { current_temperature: 71, temperature: 70, hvac_action: 'cooling', current_humidity: 65.4 } }, '°F');
  assert.equal(W.statusLine(cool, false), 'Now 71°F · Cooling');
  assert.equal(W.statusLine(cool, true), 'Now 71°F · Cooling · 65%', 'the medium widget adds the humidity');
  assert.equal(W.statusLine(W.summarize({ state: 'off', attributes: { current_temperature: 73 } }, '°F'), true), 'Now 73°F · Off');
  assert.equal(W.statusLine(W.summarize({ state: 'cool', attributes: { current_temperature: 21, temperature: 22, hvac_action: 'idle' } }, '°C'), false), 'Now 21°C · Cool · idle');
  assert.equal(W.statusLine(W.summarize({ state: 'unavailable', attributes: {} }, '°F'), true), 'Not reachable right now');
});

test('widget: the picture is made at the widget\'s own size on this phone, at the screen\'s scale (sharp)', () => {
  assert.ok(/function widgetPt\(/.test(SRC) && /Device\.screenSize\(\)/.test(SRC), 'the size comes from the phone');
  assert.ok(/ctx\.respectScreenScale = true/.test(SRC) && !/respectScreenScale = false/.test(SRC), 'one picture pixel per screen pixel');
  assert.ok(/852: \[158, 338\]/.test(SRC), 'Apple\'s sizes for a 393 x 852 phone: 158 square, 338 x 158');
});

test('widget: the script holds no token and asks for it on the phone', () => {
  assert.ok(!/eyJ[A-Za-z0-9_-]{20,}/.test(SRC), 'no token in the file');
  assert.ok(/Keychain\.set\(KEY\.token/.test(SRC), 'the token goes to the Keychain');
});

test('widget: a number is measured so the unit sits right behind it (a 1 is narrower)', async () => {
  const W = await load();
  assert.ok(W.numWidth('71', 100) < W.numWidth('70', 100), 'a 1 is narrower than a 0');
  assert.ok(W.numWidth('71', 200) > W.numWidth('71', 100) * 1.99, 'scales with the size');
  assert.ok(W.numWidth('21.5', 100) > W.numWidth('21', 100), 'a decimal is wider');
  assert.equal(W.numWidth('', 100), 0);
});

test('widget: the big thermostat page is complete and its script parses', async () => {
  const W = await load();
  const html = W.bigHtml({ url: 'https://example.test', token: 'TOKEN-FOR-TEST', entity: 'climate.living_room', unit: '°F' });
  assert.ok(html.indexOf('<!doctype html>') === 0 && html.indexOf('</html>') > 0);
  const script = html.split('<script>')[1].split('</script>')[0];
  assert.doesNotThrow(() => new Function(script), 'the page script is valid');
  for (const id of ['wheel', 'zone', 'num', 'minus', 'plus', 'modes', 'power']) assert.ok(html.indexOf('id="' + id + '"') > 0, 'has #' + id);
  assert.ok(script.indexOf('function colorFor') >= 0 && script.indexOf('function summarize') >= 0, 'the colour logic is the same code');
  assert.ok(/"entity":"climate\.living_room"/.test(script) && /"url":"https:\/\/example\.test"/.test(script), 'the page is given the address and the entity');
  assert.ok(/\/api\/services\//.test(script) && /service\('climate'/.test(script) && /set_temperature/.test(script) && /set_hvac_mode/.test(script), 'it can set the temperature and the mode');
  assert.equal(html.split('TOKEN-FOR-TEST').length - 1, 1, 'the token is in the page once, nowhere else');
  assert.equal((html.match(/@font-face/g) || []).length, 2, 'the card\'s two fonts are in the page');
  assert.ok(/"Okie Sora"/.test(html) && /"Okie Manrope"/.test(html), 'the number is Sora, the rest Manrope');
  assert.ok(/function intro\(\)/.test(script) && /thBuzz/.test(html) && /function coast\(\)/.test(script), 'the wheel rolls in, the number shakes, a flick coasts');
  assert.ok(!/requestAnimationFrame/.test(script), 'the animations run on timers, which a hidden page keeps running too');
});

test('widget: the big thermostat has the five tabs of the card and each one has its pane', async () => {
  const W = await load();
  const html = W.bigHtml({ url: 'https://example.test', token: 'T', entity: 'climate.living_room', unit: '°F' });
  for (const id of ['controls', 'context', 'history', 'schedule', 'settings']) assert.ok(html.indexOf('id="p-' + id + '"') > 0, 'pane ' + id);
  const script = html.split('<script>')[1].split('</script>')[0];
  for (const fn of ['selectTab', 'showTab', 'drawHistory', 'drawContext', 'drawSchedule', 'drawSettings', 'animateWheel']) assert.ok(script.indexOf('function ' + fn + '(') > 0, 'function ' + fn);
  assert.ok(/scheduler/.test(script) && /\/add'|'add'/.test(script) && /'remove'/.test(script), 'the schedule tab adds and removes with the Scheduler component');
  assert.ok(/set_preset_mode/.test(script) && /set_fan_mode/.test(script), 'the settings tab sets the preset and the fan');
  assert.ok(/\/api\/history\/period\//.test(script) && /\/api\/template/.test(script), 'history and context come from the Home Assistant API');
  assert.ok(!/@[A-Z]+@/.test(html), 'no placeholder is left in the page');
  assert.ok(html.indexOf('id="bubble"') > 0 && html.indexOf('id="menu"') > 0, 'the tab menu is a bubble');
  assert.ok(/var R0 = H \* 0\.43/.test(script) && /yTop = 0/.test(script) && /\(hh \* hh \+ 0\.16 \* W \* W\) \/ \(0\.8 \* W\)/.test(script), 'the wheel keeps its bottom and reaches up to the top of the controls (the state line)');
  assert.ok(/setAttribute\('switch', ''\)/.test(script) && /function haptic\(/.test(script) && /hxLabel\.click\(\)/.test(script), 'the wheel ticks through a hidden switch (the haptic WebKit gives a toggled switch)');
  assert.ok(/function buzz\(\)[^\n]*haptic\(\)/.test(script), 'a tick for every degree the number changes');
  assert.ok(/"haptics":true/.test(script), 'haptics are on unless the script says false');
  assert.ok(html.indexOf('id="sched"') > 0 && /\$\('sched'\)\.addEventListener\('click', function \(\) \{ selectTab\('schedule'\)/.test(script), '"Set smart schedule" opens the Schedule tab');
  assert.ok(html.indexOf('Set smart schedule') < html.indexOf('id="modes"') && html.indexOf('id="modes"') < html.indexOf('id="power"'), 'bottom: the schedule link, then the modes, then the power button (like the card)');
  assert.ok(/function openMenu\(/.test(script) && /function closeMenu\(/.test(script), 'the bubble opens into the menu and closes again');
  assert.ok(/closeMenu\(\); selectTab\(id\)/.test(script), 'choosing a tab closes the menu');
  assert.ok(html.indexOf('class="prog"') > 0 && /stroke-dasharray:107px/.test(html) && /function setRing\(/.test(script), 'holding the power button draws the card\'s circle around the icon');
  assert.ok(/strokeDashoffset = \(107 \* \(1 - p\)\)\.toFixed\(2\) \+ 'px'/.test(script), 'the circle\'s offset is set with its unit (a bare number is ignored by CSS)');
});

test('widget: the History tab counts exactly like the card (its own code, cut out of src/okie-logic.js)', async () => {
  const W = await load(), L = require('../src/okie-logic.js');
  const mine = new Function(W.LOGIC_SRC + '\nreturn { toSegments, durationsByState, historyStats, hourlyActivity, fmtDuration, stateLabel, isActive, relativeTime, RANGES };')();
  const H = 3600000, now = Date.UTC(2026, 9, 8, 12), rows = [
    { state: 'off', last_changed: new Date(now - 24 * H).toISOString() }, { state: 'cool', last_changed: new Date(now - 20 * H).toISOString() },
    { state: 'off', last_changed: new Date(now - 15 * H).toISOString() }, { state: 'heat', last_changed: new Date(now - 4 * H).toISOString() }];
  const a = mine.toSegments(rows, now - 24 * H, now), b = L.toSegments(rows, now - 24 * H, now);
  assert.deepEqual(a, b);
  assert.deepEqual(mine.historyStats(a), L.historyStats(b));
  assert.deepEqual(mine.durationsByState(a), L.durationsByState(b));
  assert.deepEqual(mine.hourlyActivity(a), L.hourlyActivity(b));
  assert.equal(mine.fmtDuration(13 * H), L.fmtDuration(13 * H)); assert.equal(mine.stateLabel('cool', 'en'), L.stateLabel('cool', 'en'));
  assert.deepEqual(mine.RANGES, L.RANGES);
  assert.equal(mine.relativeTime(3 * H, 'en'), L.relativeTime(3 * H, 'en'));
});

test('widget: a tap opens the big thermostat in this script (Scriptable) or the dashboard', () => {
  assert.ok(/scriptable:\/\/\/run\?scriptName=/.test(SRC) && /open=big/.test(SRC) && /entity=/.test(SRC), 'the tap runs this script with open=big and the entity');
  assert.ok(/const TAP = 'big'/.test(SRC), 'the big thermostat is the default tap');
});

test('widget: the schedule code in the page is the card\'s own (the same readings and the same actions)', async () => {
  const W = await load(), S = require('../src/okie-thermo-sched.js');
  assert.ok(W.SCHED_SRC && W.SCHED_SRC.length > 2000, 'the schedule code is cut into the widget');
  const inPage = new Function(W.SCHED_SRC + '\nreturn { readSlot: readSlot, buildActions: buildActions, entriesFor: entriesFor, onDay: onDay, expandDays: expandDays, profileDefaults: profileDefaults, matchProfile: matchProfile, iconFor: iconFor, cleanSlot: cleanSlot, DAYS: DAYS };')();
  const ID = 'climate.living_room', act = (service, data) => ({ service, entity_id: ID, service_data: data });
  const samples = [{ mode: 'heat_cool', low: 66, high: 71 }, { mode: 'cool', temp: 72 }, { mode: 'heat', temp: 66 }, { mode: 'off' }, { mode: 'preset', preset: 'eco' }, { mode: 'keep', temp: 70 }];
  for (const e of samples) {
    assert.deepEqual(inPage.buildActions(e, ID, 'none'), S.buildActions(e, ID, 'none'), JSON.stringify(e));
    assert.deepEqual(inPage.readSlot({ start: '07:00:00', actions: S.buildActions(e, ID, 'none') }, ID), S.readSlot({ start: '07:00:00', actions: S.buildActions(e, ID, 'none') }, ID));
  }
  const sched = [{ schedule_id: 'a', name: 'Eco', weekdays: ['workday'], enabled: true, timeslots: [{ start: '09:00:00', actions: S.buildActions({ mode: 'heat_cool', low: 62, high: 80 }, ID) }] }];
  assert.deepEqual(JSON.parse(JSON.stringify(inPage.entriesFor(sched, ID))), JSON.parse(JSON.stringify(S.entriesFor(sched, ID))));
  assert.deepEqual(inPage.profileDefaults('°F'), S.profileDefaults('°F'));
  assert.deepEqual(inPage.expandDays(['weekend']), ['sat', 'sun']);
  assert.equal(inPage.iconFor('Eco'), 'eco');
});

test('widget: the page has the weekly schedule (the Scheduler list, the weekday tabs, the entry editor) and no mark is left over', async () => {
  const W = await load(), html = W.bigHtml({ url: 'https://ha.example', token: 't', entity: 'climate.living_room', unit: '°F' });
  assert.ok(!/\/\*@[A-Z]+@\*\//.test(html), 'every mark is filled');
  for (const piece of ['/api/scheduler/list', 'ts-days', 'schEdit', 'buildActions(', 'Comfort, Sleep, Eco & Away', 'function entriesFor']) assert.ok(html.includes(piece), piece);
  const script = html.match(/<script>([\s\S]*)<\/script>/)[1];
  assert.doesNotThrow(() => new Function(script), 'the page script parses');
});

test('widget: the Dial look maths in the page is the card\'s own (defaults, limits, glow, ticks)', async () => {
  const W = await load();
  assert.ok(W.LOOK_SRC && W.LOOK_SRC.includes('function normalizeLook'), 'the look code is cut into the widget');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const inPage = new Function('clamp', W.LOOK_SRC + '\nreturn { DEFAULT_LOOK: DEFAULT_LOOK, normalizeLook: normalizeLook, glowAlpha: glowAlpha, glowReach: glowReach, tickCount: tickCount, glowShape: glowShape };')(clamp);
  assert.deepEqual(inPage.DEFAULT_LOOK, T.DEFAULT_LOOK);
  for (const l of [undefined, {}, { ticks: 40, c0: '#00ff88', cool: 60, warm: 59 }, { glowBlur: 500, glowSpread: -3, glowOpacity: 120, c1: 'nope', cool: 'x' }, { ticks: 160, warm: 99, cool: 98 }]) {
    assert.deepEqual(inPage.normalizeLook(l), T.normalizeLook(l), JSON.stringify(l));
    for (const d of [-30, -4, 0, 9, 40]) assert.equal(inPage.glowAlpha(d, l), T.glowAlpha(d, l));
    assert.equal(inPage.glowReach(l), T.glowReach(l)); assert.equal(inPage.tickCount(l), T.tickCount(l));
  }
});

test('widget: saved colours reach the home screen picture, bad values are ignored', async () => {
  const W = await load(), before = JSON.stringify(W.LOOK);
  W.applyLook({ c0: 'nope', c1: '#112233', cool: 10, warm: 5 });
  assert.equal(W.LOOK.c1, '#112233'); assert.equal(W.LOOK.c0, '#1446be'); assert.equal(W.LOOK.cool, 69, 'limits out of range are ignored');
  W.applyLook({ cool: 62, warm: 80, c3: '#ffffff' });
  assert.equal(W.LOOK.cool, 62); assert.equal(W.LOOK.warm, 80); assert.equal(W.LOOK.c3, '#ffffff');
  assert.equal(W.applyLook(null), W.LOOK); assert.ok(before.length > 10);
});

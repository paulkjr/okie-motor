'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const C = require('../src/okie-weather.js');

// The widget is a Scriptable script (top-level await, no module system): run it without Scriptable's globals, so it only exports its pure part.
const SRC = fs.readFileSync(path.join(__dirname, '..', 'widget', 'okie-weather-widget.js'), 'utf8');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
async function load() { const m = { exports: {} }; await new AsyncFunction('module', SRC)(m); return m.exports; }

test('weather widget: the code of the card\'s weather screen in it is the card\'s own (rebuild with tools/make-widget.py after a change)', async () => {
  const W = await load();
  const m = /\/\/ @pure:start[^\n]*\n([\s\S]*?)\n  \/\/ @pure:end/.exec(fs.readFileSync(path.join(__dirname, '..', 'src', 'okie-weather.js'), 'utf8'));
  const pure = m[1].split('\n').map(l => l.startsWith('  ') ? l.slice(2) : l).join('\n');
  assert.ok(SRC.indexOf(pure) >= 0, 'the generated block is out of date');
  assert.deepEqual(W.iconKind('partlycloudy', true), C.iconKind('partlycloudy', true));
  assert.deepEqual(W.skyStops(true, 'x'), C.skyStops(true, 'x'));
  assert.equal(W.pictureSvg({ main: 'cloud', back: 'sun' }, true).replace(/wxm\d+/g, 'm'), C.pictureSvg({ main: 'cloud', back: 'sun' }, true).replace(/wxm\d+/g, 'm'));
});

test('weather widget: a weather state with its forecasts becomes the face', async () => {
  const W = await load(), H = 3600e3, now = Date.now();
  const hourly = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ datetime: new Date(now + i * H).toISOString(), temperature: 70 + i, condition: i < 4 ? 'partlycloudy' : 'clear-night' }));
  const daily = [0, 1, 2].map(i => ({ datetime: new Date(now + i * 24 * H).toISOString(), temperature: 88 - i, templow: 66 + i, condition: 'sunny' }));
  const d = W.summarize({ st: { state: 'partlycloudy', attributes: { friendly_name: 'Forecast Home', temperature: 76.4, humidity: 65, wind_speed: 13, wind_speed_unit: 'mph', wind_bearing: 0, pressure: 30, pressure_unit: 'inHg' } }, sun: { state: 'below_horizon', attributes: {} }, daily, hourly }, 'en');
  assert.equal(d.name, 'Home'); assert.equal(d.temp, 76); assert.equal(d.cond, 'Partly cloudy'); assert.equal(d.night, true);
  assert.deepEqual(d.kind, { main: 'cloud', back: 'moon' });
  assert.equal(d.hi, 88); assert.equal(d.lo, 66); assert.equal(d.hours.length, 6); assert.equal(d.hours[0].label, 'Now'); assert.equal(d.days.length, 3);
  assert.deepEqual(d.rows.map(r => r.id), ['humidity', 'wind', 'pressure']); assert.equal(d.rows[1].value, '13 mph N');
  const none = W.summarize({ st: null }, 'en');
  assert.equal(none.unavailable, true); assert.equal(none.temp, null); assert.equal(none.hours.length, 0);
  const day = W.summarize({ st: { state: 'sunny', attributes: { temperature: 80 } }, sun: { state: 'above_horizon', attributes: {} } }, 'de');
  assert.equal(day.night, false); assert.deepEqual(day.kind, { main: 'sun', back: null }); assert.equal(day.cond, 'Sonnig');
});

test('weather widget: the sky colour runs from the top stop to the bottom stop', async () => {
  const W = await load(), st = [[0, 0, 0], [100, 200, 50], [200, 100, 250]];
  assert.deepEqual(W.skyAt(st, 0), [0, 0, 0]); assert.deepEqual(W.skyAt(st, 1), [200, 100, 250]); assert.deepEqual(W.skyAt(st, .5), [100, 200, 50]);
  assert.deepEqual(W.skyAt([[10, 20, 30]], .5), [10, 20, 30]);
  assert.equal(W.fmtTemp(71.4), '71'); assert.equal(W.fmtTemp(null), '–');
});

test('weather widget: the full-screen page has both pages, the sky, the days, the rows and the hours', async () => {
  const W = await load(), H = 3600e3, now = Date.now();
  const d = W.summarize({ st: { state: 'clear-night', attributes: { friendly_name: 'Forecast Home', temperature: 77, humidity: 60 } }, sun: { state: 'below_horizon', attributes: {} },
    daily: [0, 1].map(i => ({ datetime: new Date(now + i * 24 * H).toISOString(), temperature: 80, templow: 70, condition: 'rainy' })), hourly: [0, 1, 2].map(i => ({ datetime: new Date(now + i * H).toISOString(), temperature: 70, condition: 'cloudy' })) }, 'en');
  const html = W.bigHtml(d, 'en');
  assert.equal((html.match(/class="pg"/g) || []).length, 2);
  assert.ok(html.indexOf('class="stars"') > 0, 'stars at night');
  assert.ok(html.indexOf('Clear night') > 0 && html.indexOf('>Home<') > 0 && html.indexOf('Humidity') > 0 && html.indexOf('Next hours') > 0);
  assert.equal((html.match(/class="d"/g) || []).length, 2); assert.equal((html.match(/class="h"/g) || []).length, 3);
  assert.ok(html.indexOf('p.scrollLeft=p.clientWidth') > 0, 'it opens on the second page');
  const dayHtml = W.bigHtml(W.summarize({ st: { state: 'sunny', attributes: { temperature: 80 } }, sun: { state: 'above_horizon', attributes: {} } }, 'en'), 'en');
  assert.equal(dayHtml.indexOf('class="stars"'), -1, 'no stars by day');
});

test('weather widget: it finds the weather entity of the house when the wanted one does not exist', async () => {
  const W = await load(), st = ids => ids.map(entity_id => ({ entity_id }));
  assert.equal(W.pickWeather(st(['light.a', 'weather.forecast_home', 'weather.berlin']), 'weather.berlin'), 'weather.berlin', 'the wanted one, when it exists');
  assert.equal(W.pickWeather(st(['weather.berlin', 'weather.forecast_home']), 'weather.home'), 'weather.forecast_home', 'the usual name');
  assert.equal(W.pickWeather(st(['weather.berlin', 'weather.home']), 'weather.nope'), 'weather.home');
  assert.equal(W.pickWeather(st(['weather.paris', 'weather.berlin']), null), 'weather.berlin', 'else the first');
  assert.equal(W.pickWeather(st(['light.a']), 'weather.home'), null); assert.equal(W.pickWeather(null, 'x'), null);
});

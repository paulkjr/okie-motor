'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const W = require('../src/okie-weather.js');

test('the sky picture uses the card icons: sun, moon, rain, cloud; a cloud with the sun or moon behind it when partly cloudy', () => {
  assert.deepEqual(W.iconKind('sunny', false), { main: 'sun', back: null });
  assert.deepEqual(W.iconKind('clear-night', true), { main: 'moon', back: null });
  assert.deepEqual(W.iconKind('rainy', false), { main: 'rain', back: null });
  assert.deepEqual(W.iconKind('pouring', true), { main: 'rain', back: null });
  assert.deepEqual(W.iconKind('cloudy', false), { main: 'cloud', back: null });
  assert.deepEqual(W.iconKind('partlycloudy', false), { main: 'cloud', back: 'sun' });
  assert.deepEqual(W.iconKind('partlycloudy', true), { main: 'cloud', back: 'moon' });
  assert.deepEqual(W.iconKind('sunny', true), { main: 'moon', back: null }, 'a sunny state at night shows the moon');
  assert.deepEqual(W.iconKind('fog', false), { main: 'cloud', back: null });
});

test('night: the sun entity decides, else the condition, else the hour', () => {
  assert.equal(W.isNight('below_horizon', 'sunny', 12), true);
  assert.equal(W.isNight('above_horizon', 'clear-night', 3), false);
  assert.equal(W.isNight(undefined, 'clear-night', 12), true);
  assert.equal(W.isNight(undefined, 'sunny', 23), true);
  assert.equal(W.isNight(undefined, 'sunny', 14), false);
});

test('the stars are the same every time and stay in the upper part', () => {
  const a = W.starField(30, 11), b = W.starField(30, 11);
  assert.deepEqual(a, b);
  assert.equal(a.length, 30);
  assert.ok(a.every(s => s.x >= 0 && s.x <= 100 && s.y >= 0 && s.y <= 60 && s.r >= 0.8 && s.d > 2));
  assert.notDeepEqual(a, W.starField(30, 12));
});

test('the detail rows only list what the weather gives', () => {
  const rows = W.detailRows({ humidity: 70, wind_speed: 14.2, wind_speed_unit: 'km/h', wind_bearing: 300, pressure: 1014.4, pressure_unit: 'hPa', uv_index: 3 }, null, null, 'en', () => '');
  assert.deepEqual(rows.map(r => r.id), ['humidity', 'wind', 'pressure', 'uv']);
  assert.equal(rows[1].value, '14 km/h NW');
  assert.equal(rows[3].value, '3.0');
  const full = W.detailRows({ apparent_temperature: 16.4, humidity: 71, visibility: 9.5, visibility_unit: 'km', dew_point: 11, cloud_coverage: 58, wind_gust_speed: 26, wind_speed_unit: 'km/h' }, { next_rising: '2026-10-14T06:00:00Z', next_setting: '2026-10-13T17:00:00Z' }, 'waxing_gibbous', 'de', iso => iso.slice(11, 16));
  assert.deepEqual(full.map(r => r.id), ['feels', 'humidity', 'gusts', 'visibility', 'dew', 'clouds', 'sunrise', 'sunset', 'moon']);
  assert.equal(full[0].label, 'Gefühlt');
  assert.equal(full[3].value, '9.5 km');
  assert.equal(full[8].value, 'Waxing gibbous');
  assert.deepEqual(W.detailRows({}, null, null, 'en', () => ''), []);
});

test('the next hours start with Now, skip hours that are gone and stop at the limit', () => {
  const now = Date.parse('2026-10-13T20:30:00Z'), H = 3600e3;
  const list = [-2, -1, 0, 1, 2, 3].map((d, i) => ({ datetime: new Date(Date.parse('2026-10-13T20:00:00Z') + d * H).toISOString(), temperature: 10 + i, condition: 'cloudy' }));
  const hrs = W.hourItems(list, now, 'en', t => 'h' + new Date(t).getUTCHours(), 3);
  assert.equal(hrs.length, 3);
  assert.equal(hrs[0].label, 'Now');
  assert.ok(hrs.every(x => x.temp >= 12));
  assert.deepEqual(W.hourItems(null, now, 'en', () => '', 3), []);
});

test('the next days and the words of a condition', () => {
  const d = W.dayItems([{ datetime: '2026-10-13T12:00:00Z', temperature: 17.4, templow: 9.2, condition: 'sunny' }, { datetime: '2026-10-14T12:00:00Z', temperature: 18 }], 'en', 6);
  assert.equal(d.length, 2); assert.equal(d[0].hi, 17); assert.equal(d[0].lo, 9); assert.equal(d[1].lo, null);
  assert.equal(W.condText('en', 'partlycloudy'), 'Partly cloudy');
  assert.equal(W.condText('de', 'clear-night'), 'Klare Nacht');
  assert.equal(W.condText('en', 'something-new'), 'Something new');
  assert.equal(W.compass(0), 'N'); assert.equal(W.compass(95), 'E'); assert.equal(W.compass(350), 'N'); assert.equal(W.compass(null), '');
});

test('the place is the name without the source word, and the places to offer are listed once each', () => {
  assert.equal(W.placeName('Forecast Home'), 'Home');
  assert.equal(W.placeName('Wetter Berlin'), 'Berlin');
  assert.equal(W.placeName('Weather: Tampa'), 'Tampa');
  assert.equal(W.placeName('Forecast'), 'Forecast');
  assert.equal(W.placeName('Home'), 'Home');
  const states = { 'weather.home': { attributes: { friendly_name: 'Forecast Home' } }, 'weather.berlin': { attributes: { friendly_name: 'Forecast Berlin' } }, 'weather.paris': { attributes: {} }, 'sensor.x': { attributes: {} } };
  const l = W.placeList('weather.home', ['weather.paris', 'weather.gone', 'weather.home'], states);
  assert.deepEqual(l.map(p => p.id), ['weather.home', 'weather.paris', 'weather.berlin']);
  assert.deepEqual(l.map(p => p.name), ['Home', 'weather.paris', 'Berlin']);
  assert.deepEqual(l.map(p => [p.shown, p.added]), [[true, false], [false, true], [false, false]]);
});

test('the four sky icons are the card\'s own drawings, and the widget can read them', () => {
  const UI = require('../src/okie-ui.js');
  ['cloud', 'sun', 'moon', 'rain'].forEach(n => assert.equal(W.ICON_INNER[n], UI.ICONS[n], n));
  assert.deepEqual(W.shapesOf(W.ICON_INNER.sun).map(s => s.circle ? 'circle' : 'path'), ['circle', 'path']);
  assert.deepEqual(W.shapesOf(W.ICON_INNER.sun)[0].circle, [12, 12, 4]);
  assert.equal(W.shapesOf(W.ICON_INNER.cloud).length, 1);
});

test('svg path data becomes absolute segments, arcs become curves that stay on the 24 grid', () => {
  const box = segs => { const xs = [], ys = []; segs.forEach(s => { for (let i = 1; i < s.length; i += 2) { xs.push(s[i]); ys.push(s[i + 1]); } }); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const cloud = W.parsePath(W.shapesOf(W.ICON_INNER.cloud)[0].d);
  assert.equal(cloud[0][0], 'M'); assert.deepEqual(cloud[0].slice(1), [7, 18]); assert.equal(cloud[cloud.length - 1][0], 'Z');
  assert.ok(cloud.filter(s => s[0] === 'C').length >= 4, 'the arcs became curves');
  const [x0, y0, x1, y1] = box(cloud); assert.ok(x0 >= 1 && y0 >= 2 && x1 <= 23 && y1 <= 19, JSON.stringify([x0, y0, x1, y1]));
  const rays = W.parsePath(W.shapesOf(W.ICON_INNER.sun)[1].d); assert.equal(rays.filter(s => s[0] === 'M').length, 8); assert.deepEqual(rays[1], ['L', 12, 4]);
  const moon = W.parsePath(W.ICON_INNER.moon.match(/d="([^"]+)"/)[1]), mb = box(moon); assert.ok(mb[0] >= 1 && mb[2] <= 21 && mb[1] >= 2 && mb[3] <= 23, JSON.stringify(mb));
  const rain = W.parsePath(W.shapesOf(W.ICON_INNER.rain)[0].d); assert.equal(rain.filter(s => s[0] === 'M').length, 4);
  assert.deepEqual(W.parsePath('M1 1h2v2H1z'), [['M', 1, 1], ['L', 3, 1], ['L', 3, 3], ['L', 1, 3], ['Z']]);
  assert.deepEqual(W.parsePath('M0 0l-.5 2'), [['M', 0, 0], ['L', -0.5, 2]]);
});

test('the sky picture: one icon, or the cloud over a masked sun or moon; the sky colours by night, rain and day', () => {
  assert.ok(!/mask/.test(W.pictureSvg({ main: 'sun', back: null }, true)));
  const both = W.pictureSvg({ main: 'cloud', back: 'moon' }, false);
  assert.ok(/<mask id="wxm\d+"/.test(both) && /mask="url\(#wxm\d+\)"/.test(both));
  assert.notEqual(W.pictureSvg({ main: 'cloud', back: 'sun' }, false).match(/wxm\d+/)[0], both.match(/wxm\d+/)[0], 'every picture has its own mask id');
  assert.equal(W.skyStops(true, 'clear-night').length, 3);
  assert.deepEqual(W.skyStops(false, 'sunny'), [[27, 74, 130], [74, 143, 208]]);
  assert.deepEqual(W.skyStops(false, 'rainy')[0], [44, 62, 85]);
});

test('cities: Open-Meteo codes become the card\'s condition words', () => {
  assert.equal(W.omCondition(0, true), 'sunny');
  assert.equal(W.omCondition(1, false), 'clear-night');
  assert.equal(W.omCondition(2, true), 'partlycloudy');
  assert.equal(W.omCondition(3, true), 'cloudy');
  assert.equal(W.omCondition(61, true), 'rainy');
  assert.equal(W.omCondition(65, true), 'pouring');
  assert.equal(W.omCondition(75, true), 'snowy');
  assert.equal(W.omCondition(95, true), 'lightning');
  assert.equal(W.omCondition(99, true), 'lightning-rainy');
  assert.equal(W.omCondition(45, true), 'fog');
  assert.equal(W.omCondition(999, true), 'cloudy');
});

test('cities: the city search answer and the forecast address', () => {
  const list = W.omCities({ results: [{ name: 'Paris', admin1: 'Île-de-France', country: 'France', latitude: 48.85, longitude: 2.35 }, { name: 'Bad' }] });
  assert.deepEqual(list, [{ name: 'Paris', sub: 'Île-de-France, France', lat: 48.85, lon: 2.35 }]);
  assert.deepEqual(W.omCities(null), []);
  assert.match(W.omUrl(48.85, 2.35, true), /temperature_unit=fahrenheit&wind_speed_unit=mph/);
  assert.match(W.omUrl(48.85, 2.35, false), /temperature_unit=celsius&wind_speed_unit=kmh/);
  assert.match(W.omSearchUrl('São Paulo', 'de'), /name=S%C3%A3o%20Paulo.*language=de/);
});

test('cities: a forecast answer is read on the city\'s own clock and shaped like a weather entity', () => {
  const answer = {
    utc_offset_seconds: 7200, timezone: 'Europe/Paris',
    current: { time: '2026-10-20T15:00', temperature_2m: 18.4, apparent_temperature: 17, relative_humidity_2m: 60, weather_code: 2, is_day: 1, wind_speed_10m: 12, wind_direction_10m: 270, wind_gusts_10m: 25, pressure_msl: 1015, cloud_cover: 40 },
    hourly: { time: ['2026-10-20T14:00', '2026-10-20T15:00', '2026-10-20T16:00', '2026-10-21T00:00'], temperature_2m: [18, 18.4, 17, 12], weather_code: [2, 2, 3, 0], is_day: [1, 1, 1, 0], dew_point_2m: [9, 9.5, 9, 8], visibility: [24000, 24140, 20000, 15000] },
    daily: { time: ['2026-10-20', '2026-10-21'], weather_code: [2, 61], temperature_2m_max: [19, 15], temperature_2m_min: [9, 8], sunrise: ['2026-10-20T08:10', '2026-10-21T08:11'], sunset: ['2026-10-20T18:40', '2026-10-21T18:38'], uv_index_max: [3.2, 1], precipitation_probability_max: [10, 70] },
  };
  const c = W.fromOpenMeteo(answer, false, 'en');
  assert.equal(c.state, 'partlycloudy');
  assert.equal(c.night, false);
  assert.equal(c.attributes.temperature, 18.4);
  assert.equal(c.attributes.wind_speed_unit, 'km/h');
  assert.equal(c.attributes.pressure_unit, 'hPa');
  assert.equal(c.attributes.visibility, 24.1);
  assert.equal(c.attributes.dew_point, 9.5);
  assert.equal(c.attributes.uv_index, 3.2);
  assert.equal(c.sun.next_rising, '2026-10-20T06:10:00.000Z', 'sunrise 08:10 at +02:00 is 06:10 UTC');
  assert.equal(c.hourly[0].datetime, '2026-10-20T13:00:00.000Z', 'it starts at the hour that is on now (15:00 local)... minus nothing: 14:00 local is within the last hour');
  assert.equal(c.hourly[c.hourly.length - 1].night, true);
  assert.equal(c.hourly[c.hourly.length - 1].midnight, true, 'midnight on the city\'s clock');
  assert.equal(c.daily.length, 2);
  assert.equal(c.daily[1].condition, 'rainy');
  assert.equal(c.daily[1].precipitation_probability, 70);
  const f = W.fromOpenMeteo(answer, true, 'en');
  assert.equal(f.attributes.pressure_unit, 'inHg');
  assert.equal(f.attributes.pressure, 29.97);
  assert.equal(f.attributes.visibility_unit, 'mi');
  assert.equal(W.fromOpenMeteo(null, false, 'en'), null);
});

test('hours and days of a city keep their own labels and night flag; days are not capped by default', () => {
  const now = Date.parse('2026-10-20T13:30:00Z');
  const hrs = W.hourItems([{ datetime: '2026-10-20T13:00:00.000Z', label: '3 PM', condition: 'sunny', temperature: 18.4, night: false, midnight: false, day: 'Tue' }, { datetime: '2026-10-20T22:00:00.000Z', label: '12 AM', condition: 'clear-night', temperature: 12, night: true, midnight: true, day: 'Wed' }], now, 'en', () => 'x', 168);
  assert.deepEqual(hrs.map(x => [x.label, x.night, x.midnight, x.day]), [['Now', false, false, 'Tue'], ['12 AM', true, true, 'Wed']]);
  const days = W.dayItems(Array.from({ length: 16 }, (_, i) => ({ datetime: '2026-10-' + (10 + i) + 'T12:00:00Z', label: 'D' + i, condition: 'sunny', temperature: 20, templow: 10 })), 'en', 99);
  assert.equal(days.length, 16);
  assert.equal(days[3].label, 'D3');
});

test('weather: the home place lookup (it sends the home coordinates to bigdatacloud.net) is off by default and only runs when the setting is on', () => {
  const fs = require('fs'), path = require('path'), src = n => fs.readFileSync(path.join(__dirname, '../src', n), 'utf8');
  assert.match(src('okie-card.js'), /weatherPlaceLookup: false/);
  const S = require('../src/okie-settings.js'), row = S.ROWS.find(r => r.id === 'weather_place');
  assert.ok(row && row.type === 'toggle' && row.path === 'weatherPlaceLookup', 'a switch for it in Settings');
  const w = src('okie-weather.js'), at = w.indexOf('function homePlace('), net = w.indexOf('bigdatacloud', at);
  assert.ok(at > 0 && net > at, 'the lookup is in homePlace');
  assert.ok(w.slice(at, net).includes('weatherPlaceLookup'), 'the setting is checked before anything is sent');
  assert.equal((w.match(/bigdatacloud\.net\/data/g) || []).length, 1, 'one place sends it');
});

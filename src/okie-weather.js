/* okie-weather: the weather screen, two pages (after the usual phone weather layout).
 *
 *   page 1  the day and the place, the picture of the sky (the same cloud, sun, moon and rain icons as everywhere, the moon or the sun peeking behind a cloud),
 *           the condition, the big temperature and the next days with their high and low. At night the sky is dark and has stars.
 *   page 2  the details (feels like, humidity, wind, pressure, visibility, dew point, UV, clouds, sunrise and sunset, the moon) and the next hours
 *   phone   one page at a time, swipe sideways for the other (two dots show where you are)
 *   wide    both pages side by side: page 1 takes the place of the picture on the left, page 2 is the Controls tab on the right
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // ---- pure ---------------------------------------------------------------------------------------------------------------------------------------
  // @pure:start (the iPhone widget, widget/okie-weather-widget.js, gets this block as it is: tools/make-widget.py)

  var COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  function compass(deg) { if (deg == null || isNaN(+deg)) return ''; return COMPASS[Math.round((((+deg % 360) + 360) % 360) / 45) % 8]; }

  /** Is it night: the sun entity says so; else a clear-night condition; else the hour. */
  function isNight(sunState, weatherState, hour) {
    if (sunState === 'below_horizon') return true;
    if (sunState === 'above_horizon') return false;
    if (weatherState === 'clear-night') return true;
    return hour < 6 || hour >= 20;
  }

  /** Which of the card's own weather icons make the picture: { main, back } (back sits behind the cloud at the top right). Single icons match domainIcon: sun, moon, rain, cloud. */
  function iconKind(state, night) {
    if (state === 'rainy' || state === 'pouring') return { main: 'rain', back: null };
    if (state === 'clear-night') return { main: 'moon', back: null };
    if (state === 'sunny') return { main: night ? 'moon' : 'sun', back: null };
    if (state === 'partlycloudy') return { main: 'cloud', back: night ? 'moon' : 'sun' };
    return { main: 'cloud', back: null };
  }

  /** A fixed scatter of stars: [{ x, y (percent), r (px), d (twinkle seconds), s (delay seconds) }]; the same every time, so the sky does not jump on every update. */
  function starField(n, seed) {
    var a = (seed || 7) >>> 0, out = [];
    function rnd() { a = (a * 1664525 + 1013904223) >>> 0; return a / 4294967296; }
    for (var i = 0; i < n; i++) out.push({ x: Math.round(rnd() * 1000) / 10, y: Math.round(rnd() * 600) / 10, r: Math.round((0.8 + rnd() * 1.9) * 10) / 10, d: Math.round((2.2 + rnd() * 3.4) * 10) / 10, s: Math.round(rnd() * 50) / 10 });
    return out;
  }

  var S = {
    en: { add_city: 'Add a city', search_city: 'Search a city', my_place: 'My location', no_city: 'No city found', cities: 'Cities', c_sunny: 'Sunny', 'c_clear-night': 'Clear night', c_partlycloudy: 'Partly cloudy', c_cloudy: 'Cloudy', c_rainy: 'Rain', c_pouring: 'Heavy rain', c_snowy: 'Snow', 'c_snowy-rainy': 'Sleet', c_lightning: 'Thunderstorm', 'c_lightning-rainy': 'Thunderstorm with rain', c_hail: 'Hail', c_fog: 'Fog', c_windy: 'Windy', 'c_windy-variant': 'Windy and cloudy', c_exceptional: 'Exceptional', feels: 'Feels like', places: 'Places', add_place: 'Add a place', remove: 'Remove', here: 'Shown now', none_more: 'There is no other weather place yet. In Home Assistant add the Weather integration once more with another place (Settings > Devices & services > Add integration, for example Met.no or OpenWeatherMap). It shows up here.', tap_place: 'Choose a place', humidity: 'Humidity', wind: 'Wind', gusts: 'Gusts', pressure: 'Pressure', visibility: 'Visibility', dew: 'Dew point', uv: 'UV index', clouds: 'Clouds', sunrise: 'Sunrise', sunset: 'Sunset', moon: 'Moon', now: 'Now', hours: 'Next hours', today: 'Today' },
    de: { add_city: 'Stadt hinzufügen', search_city: 'Stadt suchen', my_place: 'Mein Standort', no_city: 'Keine Stadt gefunden', cities: 'Städte', c_sunny: 'Sonnig', 'c_clear-night': 'Klare Nacht', c_partlycloudy: 'Teils bewölkt', c_cloudy: 'Bewölkt', c_rainy: 'Regen', c_pouring: 'Starkregen', c_snowy: 'Schnee', 'c_snowy-rainy': 'Schneeregen', c_lightning: 'Gewitter', 'c_lightning-rainy': 'Gewitter mit Regen', c_hail: 'Hagel', c_fog: 'Nebel', c_windy: 'Windig', 'c_windy-variant': 'Windig und bewölkt', c_exceptional: 'Außergewöhnlich', feels: 'Gefühlt', places: 'Orte', add_place: 'Ort hinzufügen', remove: 'Entfernen', here: 'Gerade angezeigt', none_more: 'Es gibt noch keinen anderen Wetter-Ort. Füge in Home Assistant die Wetter-Integration noch einmal mit einem anderen Ort hinzu (Einstellungen > Geräte & Dienste > Integration hinzufügen, zum Beispiel Met.no oder OpenWeatherMap). Er erscheint dann hier.', tap_place: 'Ort wählen', humidity: 'Luftfeuchte', wind: 'Wind', gusts: 'Böen', pressure: 'Luftdruck', visibility: 'Sicht', dew: 'Taupunkt', uv: 'UV-Index', clouds: 'Bewölkung', sunrise: 'Sonnenaufgang', sunset: 'Sonnenuntergang', moon: 'Mond', now: 'Jetzt', hours: 'Nächste Stunden', today: 'Heute' },
  };
  var tx = function (lang, k) { return (S[lang === 'de' ? 'de' : 'en'] || S.en)[k] || k; };
  /** the condition as words: 'partlycloudy' -> 'Partly cloudy' (a condition we do not know is shown as Home Assistant gives it) */
  var condText = function (lang, state) { var w = (S[lang === 'de' ? 'de' : 'en'] || S.en)['c_' + state]; return w || String(state || '').replace(/[-_]/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }); };
  var num = function (v, d) { var n = +v; return isFinite(n) ? (d ? n.toFixed(d) : String(Math.round(n))) : null; };

  /** The rows of page 2, only those the weather entity (and the sun, and the moon) really give. a = weather attributes, sun = sun.sun attributes, moonState = sensor.moon state. */
  function detailRows(a, sun, moonState, lang, fmtTime) {
    var rows = [], at = a || {}, push = function (id, v) { if (v != null && v !== '') rows.push({ id: id, label: tx(lang, id), value: v }); };
    push('feels', at.apparent_temperature != null ? num(at.apparent_temperature) + '°' : null);
    push('humidity', at.humidity != null ? num(at.humidity) + '%' : null);
    if (at.wind_speed != null) push('wind', num(at.wind_speed) + ' ' + (at.wind_speed_unit || '') + (compass(at.wind_bearing) ? ' ' + compass(at.wind_bearing) : ''));
    if (at.wind_gust_speed != null) push('gusts', num(at.wind_gust_speed) + ' ' + (at.wind_speed_unit || ''));
    push('pressure', at.pressure != null ? num(at.pressure) + ' ' + (at.pressure_unit || '') : null);
    push('visibility', at.visibility != null ? num(at.visibility, +at.visibility < 10 ? 1 : 0) + ' ' + (at.visibility_unit || '') : null);
    push('dew', at.dew_point != null ? num(at.dew_point) + '°' : null);
    push('uv', at.uv_index != null ? num(at.uv_index, 1) : null);
    push('clouds', at.cloud_coverage != null ? num(at.cloud_coverage) + '%' : null);
    var s = sun || {};
    if (s.next_rising && fmtTime) push('sunrise', fmtTime(s.next_rising));
    if (s.next_setting && fmtTime) push('sunset', fmtTime(s.next_setting));
    if (moonState) push('moon', String(moonState).replace(/_/g, ' ').replace(/^./, function (c) { return c.toUpperCase(); }));
    return rows.map(function (r) { return r; }).filter(function (r) { return r.value.replace(/[\s°%]/g, '') !== 'null'; });
  }

  /** The next hours: [{ label ('Now', then the hour), cond, temp, night }] from a forecast list, never a past hour. */
  function hourItems(list, now, lang, fmtHour, limit) {
    var out = [], n = limit || 8;
    (list || []).forEach(function (f) {
      var t = Date.parse(f.datetime); if (isNaN(t) || t < now - 3600e3 + 1) return;
      if (out.length >= n) return;
      var h = new Date(t).getHours(), own = f.night !== undefined;      // a city's hours come with their own clock (night, midnight, label, weekday)
      out.push({ label: out.length === 0 ? tx(lang, 'now') : (f.label || fmtHour(t)), cond: f.condition, temp: f.temperature != null ? Math.round(f.temperature) : null, night: own ? !!f.night : (h < 6 || h >= 20), midnight: own ? !!f.midnight : (h === 0 && out.length > 0), day: f.day || new Date(t).toLocaleDateString(lang, { weekday: 'short' }) });
    });
    return out;
  }

  /** The next days: [{ label, cond, hi, lo }] */
  function dayItems(list, lang, limit) {
    return (list || []).slice(0, limit || 6).map(function (f) {
      return { label: f.label || new Date(f.datetime).toLocaleDateString(lang, { weekday: 'short' }), cond: f.condition, hi: f.temperature != null ? Math.round(f.temperature) : null, lo: f.templow != null ? Math.round(f.templow) : null };
    });
  }

  /** "Forecast Home" -> "Home": the weather entity is usually named after its source, the place is what you want to read */
  function placeName(name) { var n = String(name || '').replace(/^\s*(forecast|weather|wetter|vorhersage)\s*[:\-–]?\s+/i, '').trim(); return n || String(name || ''); }

  /** the weather places to offer: the one shown, the ones you added, then every other weather entity, once each: [{ id, name, shown, added }] */
  function placeList(shownId, added, states) {
    var out = [], seen = {}, name = function (id) { var st = states[id]; return placeName((st && st.attributes && st.attributes.friendly_name) || id); };
    var add = function (id, isAdded) { if (!states[id] || seen[id]) return; seen[id] = 1; out.push({ id: id, name: name(id), shown: id === shownId, added: !!isAdded }); };
    add(shownId, false); (added || []).forEach(function (id) { add(id, true); });
    Object.keys(states).filter(function (k) { return k.indexOf('weather.') === 0; }).sort().forEach(function (id) { add(id, false); });
    return out;
  }

  /** The four icons of the card (the same drawings as src/okie-ui.js), on a 24 x 24 grid: the markup inside the svg */
  var ICON_INNER = {
    cloud: '<path d="M7 18a4 4 0 0 1-.5-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1 0 9H7z"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5z"/>',
    rain: '<path d="M7 15a4 4 0 0 1-.5-8A6 6 0 0 1 18 6a4.5 4.5 0 0 1 0 9H7zM8 19l-1 2M12 19l-1 2M16 19l-1 2"/>',
  };
  var CLOUD_T = 'translate(0 5.6) scale(.84)', BACK_T = 'translate(10 -1.4) scale(.72)';
  var uidSvg = 0;
  /** The sky picture as svg markup: the icon of iconKind(), with the sun or the moon behind a cloud (cut out where the cloud is). big = the large picture (thin line) */
  function pictureSvg(kind, big) {
    var sw = big ? 0.62 : 1.3, main = ICON_INNER[kind.main] || '';
    var head = '<svg class="oi" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="' + sw + '" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
    if (!kind.back) return head + main + '</svg>';
    var id = 'wxm' + (++uidSvg), back = ICON_INNER[kind.back] || '';
    return head + '<defs><mask id="' + id + '" maskUnits="userSpaceOnUse" x="-3" y="-3" width="30" height="30"><rect x="-3" y="-3" width="30" height="30" fill="#fff"/>' +
      '<g transform="' + CLOUD_T + '" fill="#000" stroke="#000" stroke-width="' + (sw / 0.84 + 2.6) + '">' + main + '</g></mask></defs>' +
      '<g mask="url(#' + id + ')"><g transform="' + BACK_T + '" stroke-width="' + (sw / 0.72) + '">' + back + '</g></g>' +
      '<g transform="' + CLOUD_T + '" stroke-width="' + (sw / 0.84) + '">' + main + '</g></svg>';
  }

  /** The sky behind everything: the colours from top to bottom (rgb strings), for the card's css and for the widget's drawing */
  function skyStops(night, state) {
    if (night) return [[6, 21, 42], [10, 45, 68], [14, 106, 103]];
    if (state === 'rainy' || state === 'pouring') return [[44, 62, 85], [70, 103, 138]];
    return [[27, 74, 130], [74, 143, 208]];
  }

  /** The shapes of an icon's markup: [{ circle: [cx, cy, r] } | { d: 'path data' }] (the widget draws these itself) */
  function shapesOf(inner) {
    var out = [], m, re = /<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"\/>|<path d="([^"]+)"\/>/g;
    while ((m = re.exec(inner))) out.push(m[4] != null ? { d: m[4] } : { circle: [+m[1], +m[2], +m[3]] });
    return out;
  }

  /** An svg elliptical arc as cubic curves: [['C', x1, y1, x2, y2, x, y], ...] */
  function arcToCurves(x1, y1, rx, ry, phi, fa, fs, x2, y2) {
    if (!rx || !ry) return [['L', x2, y2]];
    var r = phi * Math.PI / 180, sinP = Math.sin(r), cosP = Math.cos(r), dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    var x1p = cosP * dx + sinP * dy, y1p = -sinP * dx + cosP * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    var lam = x1p * x1p / (rx * rx) + y1p * y1p / (ry * ry); if (lam > 1) { var sq = Math.sqrt(lam); rx *= sq; ry *= sq; }
    var rx2 = rx * rx, ry2 = ry * ry, den = rx2 * y1p * y1p + ry2 * x1p * x1p;
    var co = Math.sqrt(Math.max(0, (rx2 * ry2 - rx2 * y1p * y1p - ry2 * x1p * x1p) / den)) * (fa === fs ? -1 : 1);
    var cxp = co * rx * y1p / ry, cyp = -co * ry * x1p / rx;
    var cx = cosP * cxp - sinP * cyp + (x1 + x2) / 2, cy = sinP * cxp + cosP * cyp + (y1 + y2) / 2;
    var ang = function (ux, uy, vx, vy) { return Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy); };
    var th1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry), dth = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dth > 0) dth -= 2 * Math.PI; else if (fs && dth < 0) dth += 2 * Math.PI;
    var n = Math.max(1, Math.ceil(Math.abs(dth) / (Math.PI / 2) - 1e-9)), out = [];
    var X = function (u, v) { return cosP * rx * u - sinP * ry * v + cx; }, Y = function (u, v) { return sinP * rx * u + cosP * ry * v + cy; };
    for (var i = 0; i < n; i++) {
      var t1 = th1 + dth * i / n, t2 = th1 + dth * (i + 1) / n, a = 4 / 3 * Math.tan((t2 - t1) / 4);
      var e1 = [Math.cos(t1), Math.sin(t1)], e2 = [Math.cos(t2), Math.sin(t2)];
      var c1 = [e1[0] - a * e1[1], e1[1] + a * e1[0]], c2 = [e2[0] + a * e2[1], e2[1] - a * e2[0]];
      out.push(['C', X(c1[0], c1[1]), Y(c1[0], c1[1]), X(c2[0], c2[1]), Y(c2[0], c2[1]), i === n - 1 ? x2 : X(e2[0], e2[1]), i === n - 1 ? y2 : Y(e2[0], e2[1])]);
    }
    return out;
  }

  /** svg path data (M L H V C A Z, small or capital) as absolute segments: [['M', x, y], ['L', x, y], ['C', x1, y1, x2, y2, x, y], ['Z']] */
  function parsePath(d) {
    var tok = String(d).match(/[MmLlHhVvCcAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/g) || [], i = 0, out = [], cmd = '', x = 0, y = 0, sx = 0, sy = 0;
    var num = function () { return parseFloat(tok[i++]); };
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      var rel = cmd === cmd.toLowerCase(), c = cmd.toUpperCase();
      if (c === 'Z') { out.push(['Z']); x = sx; y = sy; continue; }
      if (c === 'M') { var mx = num(), my = num(); x = rel ? x + mx : mx; y = rel ? y + my : my; sx = x; sy = y; out.push(['M', x, y]); cmd = rel ? 'l' : 'L'; }
      else if (c === 'L') { var lx = num(), ly = num(); x = rel ? x + lx : lx; y = rel ? y + ly : ly; out.push(['L', x, y]); }
      else if (c === 'H') { var hx = num(); x = rel ? x + hx : hx; out.push(['L', x, y]); }
      else if (c === 'V') { var vy = num(); y = rel ? y + vy : vy; out.push(['L', x, y]); }
      else if (c === 'C') { var a1 = num(), b1 = num(), a2 = num(), b2 = num(), ex = num(), ey = num(); if (rel) { a1 += x; b1 += y; a2 += x; b2 += y; ex += x; ey += y; } out.push(['C', a1, b1, a2, b2, ex, ey]); x = ex; y = ey; }
      else if (c === 'A') { var rx = num(), ry = num(), ph = num(), fa = num(), fs = num(), ax = num(), ay = num(); if (rel) { ax += x; ay += y; } arcToCurves(x, y, rx, ry, ph, fa, fs, ax, ay).forEach(function (s) { out.push(s); }); x = ax; y = ay; }
      else break;
    }
    return out;
  }
  // @pure:end

  // ---- cities (Open-Meteo: no key, no account; only the coordinates of a city you chose are sent) ------------------------------------------------------
  /** Open-Meteo's weather codes as Home Assistant's condition words (the pictures and colours follow those) */
  function omCondition(code, isDay) {
    code = +code;
    if (code === 0 || code === 1) return isDay ? 'sunny' : 'clear-night';
    if (code === 2) return 'partlycloudy';
    if (code === 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if ([51, 53, 55, 56, 57, 61, 63, 66, 67, 80, 81].indexOf(code) >= 0) return 'rainy';
    if (code === 65 || code === 82) return 'pouring';
    if ([71, 73, 75, 77, 85, 86].indexOf(code) >= 0) return 'snowy';
    if (code === 95) return 'lightning';
    if (code === 96 || code === 99) return 'lightning-rainy';
    return 'cloudy';
  }
  /** "2026-10-20T14:00" in the city's own clock -> the real moment (ms). offsetS = utc_offset_seconds of the answer. */
  function omMoment(text, offsetS) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(text || '')); if (!m) return NaN;
    return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0)) - (+offsetS || 0) * 1000;
  }
  /** The address of the forecast of a city. f = Fahrenheit (and miles per hour), else Celsius (and km/h). */
  function omUrl(lat, lon, f) {
    return 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(lat) + '&longitude=' + encodeURIComponent(lon) +
      '&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m,wind_direction_10m,wind_gusts_10m,pressure_msl,cloud_cover' +
      '&hourly=temperature_2m,weather_code,is_day,dew_point_2m,visibility&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset,uv_index_max,precipitation_probability_max' +
      '&forecast_days=16&timezone=auto&temperature_unit=' + (f ? 'fahrenheit' : 'celsius') + '&wind_speed_unit=' + (f ? 'mph' : 'kmh');
  }
  function omSearchUrl(q, lang) { return 'https://geocoding-api.open-meteo.com/v1/search?name=' + encodeURIComponent(q) + '&count=10&format=json&language=' + (lang === 'de' ? 'de' : 'en'); }
  /** The answer of the city search as a list: [{ name, sub, lat, lon }] */
  function omCities(json) {
    return ((json && json.results) || []).filter(function (r) { return r && r.name && isFinite(r.latitude) && isFinite(r.longitude); }).map(function (r) {
      return { name: r.name, sub: [r.admin1, r.country].filter(Boolean).join(', '), lat: +r.latitude, lon: +r.longitude };
    });
  }
  /**
   * The forecast answer made into what a Home Assistant weather entity gives (so the screen paints a city exactly like the house):
   * { state, attributes, sun, night, daily: [{ datetime, label, condition, temperature, templow, precipitation_probability }], hourly: [{ datetime, label, condition, temperature, night, midnight, day }] }.
   * Hours and weekdays are read on the city's own clock (`tz` is the answer's timezone name), not the viewer's.
   */
  function fromOpenMeteo(o, f, lang) {
    if (!o || !o.current) return null;
    var off = o.utc_offset_seconds || 0, tz = o.timezone || 'UTC', cur = o.current, loc = lang === 'de' ? 'de' : 'en-US';
    var fmt = function (opts) { try { return new Intl.DateTimeFormat(loc, Object.assign({ timeZone: tz }, opts)); } catch (e) { return new Intl.DateTimeFormat(loc, opts); } };
    var wdF = fmt({ weekday: 'short' }), hrF = fmt({ hour: 'numeric' }), hrNum = fmt({ hour: 'numeric', hourCycle: 'h23' });
    var isDay = +cur.is_day === 1, at = {};
    var put = function (k, v) { if (v != null && isFinite(v)) at[k] = v; };
    put('temperature', cur.temperature_2m); put('apparent_temperature', cur.apparent_temperature); put('humidity', cur.relative_humidity_2m);
    put('wind_speed', cur.wind_speed_10m); at.wind_speed_unit = f ? 'mph' : 'km/h'; put('wind_bearing', cur.wind_direction_10m); put('wind_gust_speed', cur.wind_gusts_10m);
    if (cur.pressure_msl != null) { at.pressure = f ? Math.round(cur.pressure_msl * 0.02953 * 100) / 100 : cur.pressure_msl; at.pressure_unit = f ? 'inHg' : 'hPa'; }
    put('cloud_coverage', cur.cloud_cover);
    var hr = o.hourly || {}, dy = o.daily || {}, times = hr.time || [], nowT = omMoment(cur.time, off), start = 0;
    for (var i = 0; i < times.length; i++) { if (omMoment(times[i], off) >= nowT - 3599e3) { start = i; break; } }
    if (hr.visibility && hr.visibility[start] != null) { var vm = hr.visibility[start]; at.visibility = f ? Math.round(vm / 1609.34 * 10) / 10 : Math.round(vm / 100) / 10; at.visibility_unit = f ? 'mi' : 'km'; }
    if (hr.dew_point_2m && hr.dew_point_2m[start] != null) at.dew_point = hr.dew_point_2m[start];
    if (dy.uv_index_max && dy.uv_index_max[0] != null) at.uv_index = dy.uv_index_max[0];
    var sun = {};
    if (dy.sunrise && dy.sunrise[0]) sun.next_rising = new Date(omMoment(dy.sunrise[0], off)).toISOString();
    if (dy.sunset && dy.sunset[0]) sun.next_setting = new Date(omMoment(dy.sunset[0], off)).toISOString();
    var hourly = [];
    for (var j = start; j < Math.min(times.length, start + 168); j++) {
      var tms = omMoment(times[j], off), day = hr.is_day ? +hr.is_day[j] === 1 : true, hh = +hrNum.format(new Date(tms));
      hourly.push({ datetime: new Date(tms).toISOString(), label: hrF.format(new Date(tms)), condition: omCondition(hr.weather_code && hr.weather_code[j], day), temperature: hr.temperature_2m ? hr.temperature_2m[j] : null, night: !day, midnight: hh === 0 && hourly.length > 0, day: wdF.format(new Date(tms)) });
    }
    var daily = (dy.time || []).map(function (d, k) {
      var ms = omMoment(d, off) + 12 * 3600e3;
      return { datetime: new Date(ms).toISOString(), label: wdF.format(new Date(ms)), condition: omCondition(dy.weather_code && dy.weather_code[k], true), temperature: dy.temperature_2m_max ? dy.temperature_2m_max[k] : null, templow: dy.temperature_2m_min ? dy.temperature_2m_min[k] : null, precipitation_probability: dy.precipitation_probability_max ? dy.precipitation_probability_max[k] : null };
    });
    return { state: omCondition(cur.weather_code, isDay), attributes: at, sun: sun, night: !isDay, tz: tz, daily: daily, hourly: hourly };
  }

  var api = { omCondition: omCondition, omMoment: omMoment, omUrl: omUrl, omSearchUrl: omSearchUrl, omCities: omCities, fromOpenMeteo: fromOpenMeteo, ICON_INNER: ICON_INNER, pictureSvg: pictureSvg, skyStops: skyStops, shapesOf: shapesOf, parsePath: parsePath, placeName: placeName, placeList: placeList, condText: condText, compass: compass, isNight: isNight, iconKind: iconKind, starField: starField, detailRows: detailRows, hourItems: hourItems, dayItems: dayItems, tx: tx };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.weather = api;

  // ---- screen -------------------------------------------------------------------------------------------------------------------------------------

  var UI = g.OkieMotor.ui, h = UI.h;


  var CSS = [
    '.dt[data-wx="true"] .dt-iconbg,.dt[data-wx="true"] .dt-head,.dt[data-wx="true"] .dt-video{display:none;}',
    '.wxd-sky{position:absolute;inset:0;z-index:0;overflow:hidden;transition:background .8s ease;}',
    '.wxd-stars{position:absolute;left:0;right:0;top:0;height:100%;pointer-events:none;}',
    '.wxd-star{position:absolute;border-radius:50%;background:#fff;box-shadow:0 0 6px rgba(255,255,255,.7);opacity:.25;animation:wxd-tw var(--d,3s) ease-in-out var(--s,0s) infinite alternate;}',
    '@keyframes wxd-tw{from{opacity:.15;transform:scale(.7);}to{opacity:1;transform:scale(1.15);}}',
    '@media (prefers-reduced-motion:reduce){.wxd-star{animation:none;opacity:.7;}}',
    '.wxd-hero{position:relative;z-index:1;flex:1;min-height:0;display:flex;flex-direction:column;align-items:center;padding:0 18px 78px;color:#fff;text-align:center;}',
    '.wxd-date{margin-top:4px;font-size:22px;font-weight:300;line-height:1.2;}',
    '.wxd-loc{display:inline-flex;align-items:center;gap:6px;font-size:26px;font-weight:700;line-height:1.25;color:#fff;background:none;border:0;padding:0;font-family:inherit;}.wxd-loc.pick{cursor:pointer;}.wxd-loc svg{opacity:.7;}',
    '.wxd-art{position:relative;margin:auto 0 0;width:min(190px,40vw);height:min(190px,40vw);color:#fff;}',
    '.wxd-art svg,.wxd-mini svg{position:absolute;inset:0;width:100%;height:100%;display:block;}',
    '.wxd-cond{margin-top:16px;font-size:21px;font-weight:300;opacity:.95;}',
    '.wxd-temp{font-size:min(132px,28vw);font-weight:200;line-height:1;letter-spacing:-.04em;margin:2px 0 auto;text-shadow:0 2px 24px rgba(0,0,0,.18);}',
    '.wxd-days{display:flex;justify-content:flex-start;gap:4px;width:100%;margin-top:22px;overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior-x:contain;}.wxd-days::-webkit-scrollbar,.wxd-hours::-webkit-scrollbar{display:none;}',
    '.wxd-d{flex:0 0 calc((100% - 20px) / 6);min-width:0;scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;gap:7px;font-size:15px;}.wxd-d .dn{opacity:.9;}.wxd-d .hi{font-size:19px;font-weight:600;}.wxd-d .lo{font-size:17px;opacity:.55;}.wxd-d .wxd-mini{width:38px;height:38px;}',
    '.wxd-body{display:flex;flex-direction:column;gap:22px;width:100%;color:#fff;padding-bottom:88px;}',
    '.wxd-head2{display:none;flex-direction:column;align-items:center;text-align:center;}.wxd-head2 .wxd-date{font-size:21px;}.wxd-head2 .wxd-loc{font-size:24px;}',
    '.wxd-rows{display:flex;flex-direction:column;}',
    '.wxd-r{display:flex;justify-content:space-between;align-items:baseline;gap:14px;padding:12px 2px;border-top:1px solid rgba(255,255,255,.12);font-size:18px;}.wxd-r:first-child{border-top:0;}',
    '.wxd-r .k{font-weight:300;opacity:.88;}.wxd-r .v{font-weight:500;text-align:right;}',
    '.wxd-hours-t{font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.55;margin-bottom:12px;}',
    '.wxd-hours{display:flex;justify-content:flex-start;gap:2px;padding:18px 0 4px;border-top:1px solid rgba(255,255,255,.12);overflow-x:auto;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;scrollbar-width:none;overscroll-behavior-x:contain;}',
    '.wxd-h{flex:0 0 calc((100% - 10px) / 6);min-width:0;scroll-snap-align:start;display:flex;flex-direction:column;align-items:center;gap:12px;font-size:14px;}.wxd-h .tm{opacity:.7;font-weight:400;white-space:nowrap;}.wxd-h .tm.dayname{opacity:1;font-weight:700;}.wxd-h .tp{font-size:17px;font-weight:400;}.wxd-h .wxd-mini{width:32px;height:32px;opacity:.95;}',
    '.wxd-mini{position:relative;width:32px;height:32px;color:#fff;}',
    // the bottom bar of the screen: a round "+" at the left (places), and on a phone the two dots in the middle
    '.wxd-dots{position:absolute;left:0;right:0;bottom:12px;height:44px;pointer-events:none;z-index:5;}',
    '.wxd-plus{position:absolute;left:calc(max(260px,42%) + 18px);bottom:0;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;border:0;padding:0;color:#fff;background:rgba(255,255,255,.18);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);pointer-events:auto;cursor:pointer;}',
    '.wxd-pl{display:flex;flex-direction:column;gap:6px;margin-top:10px;}.wxd-p{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:16px;background:rgba(255,255,255,.08);border:0;color:inherit;font:inherit;text-align:left;width:100%;}.wxd-p b{flex:1;font-weight:600;}.wxd-p em{font-style:normal;font-size:13px;opacity:.65;}',
    '.wxd-note{font-size:14px;line-height:1.45;opacity:.75;margin-top:12px;}',
    '.wxd-arrow{display:inline-grid;place-items:center;}.wxd-arrow svg{opacity:.95!important;}',
    '.wxd-prow{display:flex;align-items:center;gap:6px;}.wxd-prow .wxd-p{flex:1;min-width:0;}.wxd-x{flex:none;width:34px;height:34px;border-radius:17px;display:grid;place-items:center;border:0;background:rgba(255,255,255,.08);color:inherit;}',
    '@media (min-width:641px){.wxd-dd{display:flex;position:absolute;left:0;width:50%;bottom:19px;justify-content:center;align-items:center;gap:14px;pointer-events:none;}.wxd-dd[hidden]{display:none;}.wxd-dd i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.4);}.wxd-dd i.on{background:#fff;}.wxd-dd i.arrow{width:auto;height:auto;background:none;color:rgba(255,255,255,.45);}.wxd-dd i.arrow.on{color:#fff;}}',
    '@media (min-width:641px){.dt[data-wx="true"]{grid-template-columns:minmax(300px,1fr) minmax(300px,1fr);}.wxd-plus{left:calc(50% + 18px);}}',      // wide: the sky and the details are the same width, not a narrow sky next to a wide list
    '@media (max-width:640px){',
    // a phone: ONE tall page (the sky and the day first, the details and the next hours under it, scroll down); the sky stays behind and fades to dark as you scroll; sideways = the next place
    '.dt[data-wx="true"]{display:block;overflow-x:hidden;overflow-y:auto;scrollbar-width:none;overscroll-behavior-y:contain;-webkit-overflow-scrolling:touch;background:linear-gradient(rgba(0,0,0,var(--wx-fade,0)),rgba(0,0,0,var(--wx-fade,0))),var(--wx-bg,linear-gradient(180deg,#1b4a82,#4a8fd0));background-attachment:local,scroll;}',
    '.dt[data-wx="true"]::-webkit-scrollbar{display:none;}',
    '.dt[data-wx="true"]>.dt-hero{height:100%;min-height:100%;background:none!important;}.dt[data-wx="true"]>.dt-hero .wxd-sky{display:none;}',
    '.dt[data-wx="true"]>.dt-main{height:auto;min-height:0;padding-bottom:110px;}.dt[data-wx="true"] .dt-bodyhost{flex:0 0 auto;height:auto;overflow:visible;}.dt[data-wx="true"] .dt-body{overflow:visible;height:auto;max-height:none;}.dt[data-wx="true"] .wxd-body{padding-bottom:8px;}',
    '.wxd-head2{display:flex;margin-top:2px;}.wxd-r{padding:9px 2px;}',
    '.wxd-plus{left:16px;}',
    '.wxd-dd{display:flex;position:absolute;left:0;right:0;bottom:19px;justify-content:center;align-items:center;gap:14px;pointer-events:none;}',
    '.wxd-dd[hidden]{display:none;}',
    '.wxd-dd i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.4);transition:background .2s,transform .2s;}.wxd-dd i.on{background:#fff;transform:scale(1.15);}.wxd-dd i.arrow{width:auto;height:auto;background:none;color:rgba(255,255,255,.45);display:grid;place-items:center;}.wxd-dd i.arrow.on{color:#fff;background:none;}',
    '.wxd-art{width:min(240px,58vw);height:min(240px,58vw);}.wxd-temp{font-size:min(140px,34vw);}',
    '}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  /** the picture: a cloud with the sun or the moon behind it (cut out where the cloud is, so no line runs through it), or a single icon; always the card's own icons */
  function picture(kind, cls) {
    var big = cls.indexOf('wxd-art') === 0, wrap = h('div.' + cls, { 'aria-hidden': 'true' });
    wrap.innerHTML = pictureSvg(kind, big);
    return wrap;
  }

  /** the twinkling stars of a night sky: a layer to put behind the content */
  function makeStars() {
    var stars = h('div.wxd-stars');
    starField(34, 11).forEach(function (s) { var d = h('i.wxd-star', { style: { left: s.x + '%', top: s.y + '%', width: s.r + 'px', height: s.r + 'px' } }); d.style.setProperty('--d', s.d + 's'); d.style.setProperty('--s', s.s + 's'); stars.appendChild(d); });
    return stars;
  }
  function skyBg(night, state) {
    var st = skyStops(night, state), rgb = function (c) { return 'rgb(' + c.join(',') + ')'; };
    return 'linear-gradient(180deg,' + st.map(function (c, i) { return rgb(c) + ' ' + Math.round(i * 100 / (st.length - 1)) + '%'; }).join(',') + ')';
  }
  api.picture = picture; api.makeStars = makeStars; api.skyBg = skyBg;

  /** The name of the place the house is at ("Lutz"): Home Assistant's own latitude and longitude, looked up once with a free reverse look-up and kept. null until known. */
  var homePlaceMem = null;
  function homePlace(ctx, done) {
    var hs = ctx.hass(), c = hs && hs.config; if (!c || !isFinite(c.latitude) || !isFinite(c.longitude)) return null;
    var key = (+c.latitude).toFixed(2) + ',' + (+c.longitude).toFixed(2), saved = ctx.store.get('wx.place', null);
    if (saved && saved.key === key && saved.name) return saved.name;
    if (homePlaceMem && homePlaceMem.key === key) return homePlaceMem.name || null;
    homePlaceMem = { key: key, name: '' };
    var url = 'https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=' + encodeURIComponent(c.latitude) + '&longitude=' + encodeURIComponent(c.longitude) + '&localityLanguage=' + (ctx.lang() === 'de' ? 'de' : 'en');
    Promise.resolve(g.fetch(url)).then(function (r) { return r.json(); }).then(function (j) {
      var name = (j && (j.city || j.locality || j.principalSubdivision)) || '';
      if (name) { homePlaceMem.name = name; ctx.store.set('wx.place', { key: key, name: name }); if (done) done(); }
    }, function () { /* offline: the entity's own name stays */ });
    return null;
  }

  /** create(ctx, item) -> { sky, hero, body, dots, watch(root), update(state), dispose() }.
   *  The screen shows one place at a time: the weather entity it was opened for, or a city added with the plus (Open-Meteo); a swipe sideways goes to the next place. */
  function create(ctx, item) {
    var lang = ctx.lang(), dead = false;
    var fmtTime = function (iso) { var tf = ctx.settings.get().timeFormat, o = { hour: 'numeric', minute: '2-digit' }; if (tf === '12h') o.hour12 = true; else if (tf === '24h') o.hour12 = false; var d = new Date(iso); return isNaN(d) ? '' : d.toLocaleTimeString(lang, o); };
    var fmtHour = function (t) { var tf = ctx.settings.get().timeFormat, o = { hour: 'numeric' }; if (tf === '12h') o.hour12 = true; else if (tf === '24h') { o.hour12 = false; o.minute = '2-digit'; } return new Date(t).toLocaleTimeString(lang, o); };
    var fahrenheit = function () { var hs = ctx.hass(), u = hs && hs.config && hs.config.unit_system && hs.config.unit_system.temperature; return u === '°F'; };
    var cities = function () { return (ctx.settings.get().weatherCities || []).filter(function (c) { return c && c.name && isFinite(c.lat) && isFinite(c.lon); }); };
    var cityKey = function (c) { return (+c.lat).toFixed(3) + ',' + (+c.lon).toFixed(3); };
    var isHome = function () { return !!(ctx.weatherId && ctx.weatherId() === item.id); };      // the card's main weather entity: shown with the place's real name and the location arrow
    var cur = null;                                           // null: the entity of this screen; else the city shown

    var sky = h('div.wxd-sky'), stars = makeStars();
    sky.appendChild(stars);
    var date = h('div.wxd-date'), loc = h('button.wxd-loc', { type: 'button' }), artHost = h('div.wxd-arthost', { style: { display: 'contents' } }), cond = h('div.wxd-cond'), temp = h('div.wxd-temp'), days = h('div.wxd-days');
    var hero = h('div.wxd-hero', null, date, loc, artHost, cond, temp, days);
    var rows = h('div.wxd-rows'), hoursT = h('div.wxd-hours-t', null, tx(lang, 'hours')), hours = h('div.wxd-hours'), hoursBox = h('div', { hidden: true }, hoursT, hours);
    var date2 = h('div.wxd-date'), loc2 = h('button.wxd-loc', { type: 'button' }), head2 = h('div.wxd-head2', null, date2, loc2);
    var body = h('div.wxd-body', null, head2, rows, hoursBox);
    var plus = h('button.wxd-plus', { type: 'button', 'aria-label': tx(lang, 'add_place'), title: tx(lang, 'add_place'), html: UI.icon('plus', 22), onclick: function () { openPlaces(); } });
    var dd = h('div.wxd-dd', { 'aria-hidden': 'true' });
    var dots = h('div.wxd-dots', null, plus, dd);
    var rootEl = null;

    // the places in the order of the screen: the house (or the entity opened), then the cities you added
    function pageList() { return [null].concat(cities()); }
    function pageIndex() { if (!cur) return 0; var k = cityKey(cur), l = cities(); for (var i = 0; i < l.length; i++) if (cityKey(l[i]) === k) return i + 1; return 0; }
    function go(i) {
      var l = pageList(); if (i < 0 || i >= l.length || (l[i] ? cityKey(l[i]) : '') === (cur ? cityKey(cur) : '')) return;
      cur = l[i]; if (ctx.haptic) ctx.haptic(8);
      if (rootEl) rootEl.scrollTop = 0;
      lastKey = ''; paint(); fetchForecasts(true);
    }
    function drawDots() {
      var n = pageList().length, i = pageIndex(), sig = n + ':' + i + ':' + isHome();
      if (dd.dataset.sig === sig) return; dd.dataset.sig = sig; dd.innerHTML = '';
      dd.hidden = n < 2;
      for (var k = 0; k < n; k++) { var d = h('i' + (k === i ? '.on' : '')); if (k === 0 && isHome()) { d.classList.add('arrow'); d.innerHTML = UI.icon('pin', 12); } dd.appendChild(d); }
    }

    // places: the cities you added, the entity of this screen, every other weather entity of Home Assistant, and a search to add a city
    function places() { return placeList(item.id, ctx.settings.get().weatherPlaces, ctx.hass().states); }
    function openPlaces() {
      ctx.sheet({ title: tx(lang, 'places'), width: 'min(460px,100%)', content: function (close) {
        var box = h('div'), q = h('input.s-text', { type: 'search', placeholder: tx(lang, 'search_city'), 'aria-label': tx(lang, 'add_city') }), found = h('div.wxd-pl'), timer = 0, token = 0;
        function draw() {
          box.innerHTML = '';
          var pl = h('div.wxd-pl');
          pl.appendChild(h('button.wxd-p', { type: 'button', onclick: function () { close(); go(0); } }, h('span', { html: UI.icon(isHome() ? 'pin' : 'cloud', 20) }), h('b', null, titleText(null)), h('em', null, !cur ? tx(lang, 'here') : '')));
          cities().forEach(function (c) {
            pl.appendChild(h('div.wxd-prow', null,
              h('button.wxd-p', { type: 'button', onclick: function () { close(); cur = c; go(pageIndex() === 0 ? 0 : pageIndex()); cur = c; lastKey = ''; paint(); fetchForecasts(true); drawDots(); } }, h('span', { html: UI.icon('cloud', 20) }), h('b', null, c.name), h('em', null, c.sub || '')),
              h('button.wxd-x', { type: 'button', 'aria-label': tx(lang, 'remove'), onclick: function () { ctx.settings.set({ weatherCities: cities().filter(function (x) { return cityKey(x) !== cityKey(c); }) }); if (cur && cityKey(cur) === cityKey(c)) { cur = null; lastKey = ''; paint(); } drawDots(); draw(); }, html: UI.icon('close', 16) })));
          });
          places().filter(function (p) { return !p.shown; }).forEach(function (p) {
            var added = !!p.added;
            pl.appendChild(h('button.wxd-p', { type: 'button', onclick: function () {
              if (!added) { var cur2 = (ctx.settings.get().weatherPlaces || []).slice(); cur2.push(p.id); ctx.settings.set({ weatherPlaces: cur2 }); }
              close(); ctx.openDetail(p.id);
            } }, h('span', { html: UI.icon('cloud', 20) }), h('b', null, p.name), h('em', null, added ? '' : tx(lang, 'add_place'))));
          });
          box.appendChild(pl);
          box.appendChild(h('div.wxd-note', null, tx(lang, 'add_city')));
          box.appendChild(q); box.appendChild(found);
        }
        q.addEventListener('input', function () {
          clearTimeout(timer); var v = q.value.trim(), my = ++token; found.innerHTML = '';
          if (v.length < 2) return;
          timer = setTimeout(function () {
            Promise.resolve(g.fetch(omSearchUrl(v, lang))).then(function (r) { return r.json(); }).then(function (j) {
              if (my !== token) return; var list = omCities(j); found.innerHTML = '';
              if (!list.length) { found.appendChild(h('div.wxd-note', null, tx(lang, 'no_city'))); return; }
              list.forEach(function (c) {
                found.appendChild(h('button.wxd-p', { type: 'button', onclick: function () {
                  var have = cities(); if (!have.some(function (x) { return cityKey(x) === cityKey(c); })) ctx.settings.set({ weatherCities: have.concat([c]) });
                  close(); cur = c; lastKey = ''; if (rootEl) rootEl.scrollTop = 0; paint(); fetchForecasts(true); drawDots();
                } }, h('span', { html: UI.icon('cloud', 20) }), h('b', null, c.name), h('em', null, c.sub || '')));
              });
            }, function () { if (my === token) found.appendChild(h('div.wxd-note', null, tx(lang, 'no_city'))); });
          }, 350);
        });
        draw(); return box;
      } });
    }
    [loc, loc2].forEach(function (b) { b.addEventListener('click', function () { openPlaces(); }); });

    function titleText(c) { if (c) return c.name; return (isHome() && homePlace(ctx, function () { paint(); })) || placeName(item.name); }

    // the forecasts: the entity's through Home Assistant, a city's from Open-Meteo; every day and every hour the source gives
    var daily = [], hourly = [], fetchedAt = 0, fetching = false, lastKey = '', cityCache = {};
    function fetchForecasts(force) {
      if (cur) {
        var c = cur, k = cityKey(c), hit = cityCache[k];
        if (fetching || dead || (!force && hit && Date.now() - hit.at < 15 * 60000)) return;
        fetching = true;
        Promise.resolve(g.fetch(omUrl(c.lat, c.lon, fahrenheit()))).then(function (r) { return r.json(); }).then(function (j) {
          fetching = false; var d = fromOpenMeteo(j, fahrenheit(), lang); if (d) cityCache[k] = { at: Date.now(), data: d }; paint();
        }, function () { fetching = false; });
        return;
      }
      if (fetching || dead || (!force && Date.now() - fetchedAt < 15 * 60000)) return;
      fetching = true;
      var ask = function (type) {
        return Promise.resolve(ctx.callWS({ type: 'call_service', domain: 'weather', service: 'get_forecasts', target: { entity_id: item.id }, service_data: { type: type }, return_response: true }))
          .then(function (r) { return (((r && r.response) || {})[item.id] || {}).forecast || []; }, function () { return []; });
      };
      Promise.all([ask('daily'), ask('hourly')]).then(function (res) { daily = res[0]; hourly = res[1]; fetchedAt = Date.now(); fetching = false; api.lastForecast = { daily: daily.length, hourly: hourly.length, t: fetchedAt }; paint(); }, function () { fetching = false; });
    }

    /** what the screen paints now: the entity's or the city's weather in one shape */
    function source() {
      var hs = ctx.hass();
      if (cur) {
        var hit = cityCache[cityKey(cur)]; if (!hit) return { state: 'cloudy', a: {}, sun: null, moon: null, night: false, daily: [], hourly: [], loading: true };
        var d = hit.data; return { state: d.state, a: d.attributes, sun: d.sun, moon: null, night: d.night, tz: d.tz, daily: d.daily, hourly: d.hourly };
      }
      var st = ctx.state(item.id); if (!st) return null;
      var sunSt = hs.states['sun.sun'], moonSt = hs.states['sensor.moon'];
      return { state: st.state, a: st.attributes || {}, sun: sunSt && sunSt.attributes, moon: moonSt && moonSt.state, night: isNight(sunSt && sunSt.state, st.state, new Date().getHours()), daily: daily, hourly: hourly };
    }

    function paint() {
      if (dead) return;
      var v = source(); if (!v) return;
      var now = new Date(), a = v.a;
      var dtxt; try { dtxt = now.toLocaleDateString(lang, Object.assign({ weekday: 'long', month: 'long', day: 'numeric' }, v.tz ? { timeZone: v.tz } : {})); } catch (e) { dtxt = now.toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' }); }      // a city's own date
      date.textContent = dtxt; date2.textContent = dtxt;
      var name = titleText(cur), arrow = !cur && isHome() && name !== placeName(item.name) ? 1 : 0;
      [loc, loc2].forEach(function (b) { b.innerHTML = ''; if (!cur && isHome()) b.appendChild(h('span.wxd-arrow', { html: UI.icon('pin', 18) })); b.appendChild(document.createTextNode(name)); b.classList.add('pick'); b.title = tx(lang, 'tap_place'); });
      cond.textContent = condText(lang, v.state);
      temp.textContent = a.temperature != null ? Math.round(a.temperature) + '°' : '–';
      var key = (cur ? cityKey(cur) : '') + '|' + v.state + '|' + v.night;
      if (key !== lastKey) {
        lastKey = key;
        artHost.innerHTML = ''; artHost.appendChild(picture(iconKind(v.state, v.night), 'wxd-art'));
        sky.dataset.night = String(v.night);
        var bg = skyBg(v.night, v.state); sky.style.background = bg; if (rootEl) rootEl.style.setProperty('--wx-bg', bg);
        stars.style.display = v.night ? '' : 'none';
      }
      days.innerHTML = '';
      dayItems(v.daily, lang, 99).forEach(function (d) { days.appendChild(h('div.wxd-d', null, h('span.dn', null, d.label), picture(iconKind(d.cond, false), 'wxd-mini'), h('span.hi', null, d.hi != null ? d.hi + '°' : ''), h('span.lo', null, d.lo != null ? d.lo + '°' : ''))); });
      days.hidden = !v.daily.length;
      rows.innerHTML = '';
      detailRows(a, v.sun, v.moon, lang, fmtTime).forEach(function (r) { rows.appendChild(h('div.wxd-r', null, h('span.k', null, r.label), h('span.v', null, r.value))); });
      hours.innerHTML = '';
      var hi = hourItems(v.hourly, Date.now(), lang, fmtHour, 168);
      hi.forEach(function (x) { hours.appendChild(h('div.wxd-h', null, h('span.tm' + (x.midnight ? '.dayname' : ''), null, x.midnight ? x.day : x.label), picture(iconKind(x.cond, x.night), 'wxd-mini'), h('span.tp', null, x.temp != null ? x.temp + '°' : ''))); });
      hoursBox.hidden = !hi.length;
      drawDots();
    }

    // the screen is on a phone one tall page: scrolling down fades the sky to dark (the details read on a calm ground), a swipe sideways goes to the next place
    function watch(root) {
      rootEl = root;
      var bg = sky.style.background; if (bg) root.style.setProperty('--wx-bg', bg);
      root.addEventListener('scroll', function () { var f = Math.min(1, root.scrollTop / Math.max(1, root.clientHeight * 0.6)) * 0.78; root.style.setProperty('--wx-fade', String(Math.round(f * 100) / 100)); }, { passive: true });
      var x0 = 0, y0 = 0, down = false;
      root.addEventListener('pointerdown', function (e) { down = !(e.target.closest && e.target.closest('.wxd-days,.wxd-hours,button,input,select')); x0 = e.clientX; y0 = e.clientY; });
      root.addEventListener('pointerup', function (e) {
        if (!down) return; down = false; var dx = e.clientX - x0, dy = e.clientY - y0, z = (ctx.host && ctx.host._zoom) || 1;
        if (Math.abs(dx) > 60 * z && Math.abs(dx) > Math.abs(dy) * 1.6) go(pageIndex() + (dx < 0 ? 1 : -1));
      });
      root.addEventListener('pointercancel', function () { down = false; });
    }

    return { sky: sky, hero: hero, body: body, dots: dots, watch: watch, update: function () { paint(); fetchForecasts(); }, dispose: function () { dead = true; } };
  }

  api.create = create;
})(typeof globalThis !== 'undefined' ? globalThis : window);

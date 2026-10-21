#!/usr/bin/env node
// A pretend Home Assistant for testing the Okie Home app. No npm packages: plain http plus a hand-written WebSocket.
// Run:  node mock/server.js        (PORT=8123 by default; see README.md for the test name and password)
'use strict';
const http = require('http');
const crypto = require('crypto');

const PORT = Number(process.env.PORT || 8123);
const EXPIRES_IN = Number(process.env.EXPIRES_IN || 1800);   // seconds an access token lives (set 90 to watch the refresh)
const MFA = process.env.MFA === '1';                          // ask for a (fake) authenticator code after the password
const DRIFT = process.env.DRIFT !== '0';                      // let the room temperature creep toward the target
const VERSION = '2026.10.0-mock';

// Only a hash of the test password lives here; the password itself is written in README.md.
const TEST_USER = 'okie-test';
const TEST_PASSWORD_SHA256 = '18bdf55268b6fd539d88ffe3780f9bf5c535269517d9fc474b3019037f0003a1';
const MFA_CODE = '123456';

// ---------------------------------------------------------------- small helpers
const sha256 = s => crypto.createHash('sha256').update(s).digest('hex');
const rnd = n => crypto.randomBytes(n).toString('hex');
function haTime(d = new Date()) {                               // 2026-10-18T22:40:00.123456+00:00, the way HA writes it
  return d.toISOString().replace('Z', '000+00:00');
}
function localISO(d) {                                          // 2026-10-18T09:00:00-05:00
  const p = (n, w = 2) => String(n).padStart(w, '0');
  const off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-', a = Math.abs(off);
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${sign}${p(Math.floor(a / 60))}:${p(a % 60)}`;
}
const dayStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const log = (...a) => console.log(new Date().toLocaleTimeString(), ...a);

// ---------------------------------------------------------------- entities
const entities = new Map();
let seq = 0;
const ctx = () => ({ id: (++seq).toString(16).padStart(26, '0').toUpperCase(), parent_id: null, user_id: null });

function put(id, state, attributes) {
  const now = haTime();
  entities.set(id, { entity_id: id, state, attributes, last_changed: now, last_reported: now, last_updated: now, context: ctx() });
}
const light = (id, name, on, brightness, modes) => put(id, on ? 'on' : 'off',
  { supported_color_modes: modes, color_mode: on ? modes[0] : null, brightness: on ? brightness : null, friendly_name: name, supported_features: 44 });

function seed() {
  entities.clear();
  put('climate.living_room', 'heat', {
    hvac_modes: ['off', 'heat', 'cool', 'heat_cool'], min_temp: 50, max_temp: 90, target_temp_step: 1,
    current_temperature: 70, temperature: 72, target_temp_high: null, target_temp_low: null,
    current_humidity: 41, hvac_action: 'heating', friendly_name: 'Living Room', supported_features: 27,
  });
  put('switch.bedlight', 'off', { friendly_name: 'Bedlight' });
  light('light.living_room_lamp', 'Living Room Lamp', true, 180, ['color_temp', 'hs']);
  light('light.kitchen', 'Kitchen', false, 0, ['onoff']);
  light('light.office_desk', 'Office Desk', true, 255, ['brightness']);
  put('light.garage', 'unavailable', { friendly_name: 'Garage', supported_color_modes: ['onoff'] });
  const script = (id, name, last) => put(id, 'off', { last_triggered: last, mode: 'single', current: 0, friendly_name: name });
  script('script.govee_cozy_lights', 'Govee Cozy Lights', haTime(new Date(Date.now() - 5 * 3600e3)));
  script('script.govee_lets_go_to_sleep', "Govee Let's Go To Sleep", haTime(new Date(Date.now() - 26 * 3600e3)));
  script('script.govee_turn_up_the_lights', 'Govee Turn Up The Lights', null);
  script('script.feed_the_beasts_2', 'Feed The Beasts', haTime(new Date(Date.now() - 3 * 3600e3)));
  put('weather.forecast_home', 'sunny', { temperature: 68, temperature_unit: '°F', humidity: 40, pressure: 30.0, wind_speed: 6, friendly_name: 'Forecast Home' });
  put('cover.garage_door', 'closed', { friendly_name: 'Garage Door', supported_features: 11, device_class: 'garage' });
  put('media_player.living_room_tv', 'paused', { friendly_name: 'Living Room TV', supported_features: 152461, volume_level: 0.3 });
  for (const c of CALENDARS) put(c.id, 'off', { message: '', all_day: false, start_time: null, end_time: null, location: '', description: '', offset_reached: false, friendly_name: c.name });
  refreshCalendarStates(false);
}

// ---------------------------------------------------------------- calendars (dates are relative to now, so the week view is never empty)
const CALENDARS = [
  { id: 'calendar.living_room_home_robot_schedule', name: "Home Robot Schedule" },
  { id: 'calendar.holidays_in_united_states', name: 'Holidays in United States' },
  { id: 'calendar.robot_vacuum_schedule', name: 'Robot Vacuum Schedule' },      // the app must hide this one
];
const mondayOf = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
const at = (day, h, m = 0) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);

const USER_DATA = new Map();         // frontend/get_user_data and set_user_data (the Okie Motor card keeps its settings there)
USER_DATA.set('okie_motor_settings', { t: 1, data: { favorites: ['light.kitchen'], weatherCities: [{ name: 'Tokyo', sub: 'Tokyo, Japan', lat: 35.6895, lon: 139.6917 }], calendarHidden: ['calendar.holidays_in_united_states'], calendarColors: { 'calendar.living_room_home_robot_schedule': '#ff453a' } } });
const CREATED = [];                  // events made with calendar.create_event (kept until the mock restarts)

function eventsFor(calId, from, to) {
  const out = [];
  const add = (summary, s, e, allDay, extra = {}) => {
    if (!(s < to && e > from)) return;
    out.push({
      summary, ...extra,
      start: allDay ? { date: dayStr(s) } : { dateTime: localISO(s) },
      end: allDay ? { date: dayStr(e) } : { dateTime: localISO(e) },
    });
  };
  const weeks = [];
  for (let w = mondayOf(new Date(from.getTime() - 86400e3)); w < to; w = new Date(w.getFullYear(), w.getMonth(), w.getDate() + 7)) weeks.push(w);
  const dayOf = (w, k) => new Date(w.getFullYear(), w.getMonth(), w.getDate() + k);
  if (calId === CALENDARS[0].id) {
    for (const w of weeks) {
      const plan = [
        [0, 8, 30, 9, 30, 'Dentist – Alex', 'Main Street Dental'],
        [1, 18, 0, 19, 30, 'Dinner with the Millers', '14 Oak Lane'],
        [2, 12, 0, 13, 0, 'Lunch with Sam', ''],
        [3, 15, 30, 16, 0, 'Vet – feed check', 'Okie Vet'],
        [4, 19, 0, 22, 0, 'Movie night', ''],
        [5, 10, 0, 11, 30, 'Farmers market', 'Town square'],
        [6, 14, 0, 15, 0, 'Call Mom', ''],
      ];
      for (const [k, h1, m1, h2, m2, name, loc] of plan) add(name, at(dayOf(w, k), h1, m1), at(dayOf(w, k), h2, m2), false, { location: loc, description: '' });
      add('Trash day', dayOf(w, 3), dayOf(w, 4), true);                  // an all-day one every week
    }
  } else if (calId === CALENDARS[1].id) {
    for (const [y, m, d, name] of [[2026, 9, 12, 'Columbus Day'], [2026, 9, 31, 'Halloween'], [2026, 10, 3, 'Election Day'], [2026, 10, 11, 'Veterans Day'], [2026, 10, 26, 'Thanksgiving Day'], [2026, 11, 25, 'Christmas Day'], [2027, 0, 1, "New Year's Day"]]) {
      const s = new Date(y, m, d);
      add(name, s, new Date(y, m, d + 1), true);
    }
    // so the current week shows a holiday too
    const t = new Date(); add('Mock Appreciation Day', new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1), new Date(t.getFullYear(), t.getMonth(), t.getDate() + 2), true);
  } else if (calId === CALENDARS[2].id) {
    for (let d = new Date(from.getFullYear(), from.getMonth(), from.getDate()); d < to; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) add('Vacuum run (robot)', at(d, 10), at(d, 11), false);
  }
  for (const c of CREATED) if (c.calendar === calId) { const s = new Date(c.sd), e = new Date(c.ed); if (s < to && e > from) out.push(c.ev); }
  return out.sort((a, b) => (a.start.dateTime || a.start.date).localeCompare(b.start.dateTime || b.start.date));
}
function refreshCalendarStates(broadcastChange = true) {
  const now = new Date();
  for (const c of CALENDARS) {
    const evs = eventsFor(c.id, now, new Date(now.getTime() + 14 * 86400e3));
    const next = evs[0];
    let state = 'off', attrs = { message: '', all_day: false, start_time: null, end_time: null, location: '', description: '', offset_reached: false, friendly_name: c.name, supported_features: c.id === CALENDARS[0].id ? 1 : 0 };
    if (next) {
      const s = new Date((next.start.dateTime || next.start.date + 'T00:00:00')), e = new Date((next.end.dateTime || next.end.date + 'T00:00:00'));
      state = s <= now && e > now ? 'on' : 'off';
      attrs = { ...attrs, message: next.summary, all_day: !!next.start.date, start_time: dayStr(s) + ' ' + s.toTimeString().slice(0, 8), end_time: dayStr(e) + ' ' + e.toTimeString().slice(0, 8), location: next.location || '' };
    }
    const cur = entities.get(c.id);
    if (!cur || cur.state !== state || JSON.stringify(cur.attributes) !== JSON.stringify(attrs)) setState(c.id, state, attrs, true, broadcastChange);
  }
}

// ---------------------------------------------------------------- state changes + the live feed
const sockets = new Set();            // authenticated websocket clients: { send(obj), subs: [id] }

function setState(id, state, attributes, replaceAttrs = false, broadcast = true) {
  const old = entities.get(id);
  if (!old) return null;
  const now = haTime();
  const next = {
    ...old, state: String(state ?? old.state), last_updated: now, last_reported: now,
    attributes: replaceAttrs ? attributes : { ...old.attributes, ...(attributes || {}) }, context: ctx(),
  };
  if (next.state !== old.state) next.last_changed = now;
  entities.set(id, next);
  if (broadcast) {
    const msg = ws => ws.subs.forEach(sid => ws.send({ id: sid, type: 'event', event: { event_type: 'state_changed', data: { entity_id: id, old_state: old, new_state: next }, origin: 'LOCAL', time_fired: now, context: next.context } }));
    sockets.forEach(msg);
  }
  return next;
}

function climateRecalc(id) {
  const e = entities.get(id); if (!e) return;
  const a = e.attributes, t = a.current_temperature;
  let act = 'off';
  if (e.state === 'heat') act = a.temperature > t ? 'heating' : 'idle';
  else if (e.state === 'cool') act = t > a.temperature ? 'cooling' : 'idle';
  else if (e.state === 'heat_cool') act = a.target_temp_low > t ? 'heating' : t > a.target_temp_high ? 'cooling' : 'idle';
  if (a.hvac_action !== act) setState(id, e.state, { hvac_action: act });
}

// ---------------------------------------------------------------- services
const idsOf = data => { const v = data && data.entity_id; return !v ? [] : Array.isArray(v) ? v : String(v).split(',').map(s => s.trim()).filter(Boolean); };
const domainOf = id => id.split('.')[0];
let lastClimateMode = 'heat';

function runScript(id) {
  const e = entities.get(id); if (!e) return;
  setState(id, 'on', { last_triggered: haTime(), current: 1 });
  setTimeout(() => setState(id, 'off', { current: 0 }), 1500);
}

function turn(id, how, data = {}) {
  const e = entities.get(id); if (!e) return null;
  const d = domainOf(id);
  const on = how === 'toggle' ? e.state !== 'on' : how === 'turn_on';
  switch (d) {
    case 'light': {
      if (e.state === 'unavailable') return e;
      const attrs = {};
      if (on) {
        const modes = e.attributes.supported_color_modes || ['onoff'];
        if (!modes.includes('onoff')) attrs.brightness = data.brightness_pct != null ? Math.round(Number(data.brightness_pct) * 2.55) : (data.brightness != null ? Number(data.brightness) : (e.attributes.brightness || 255));
        attrs.color_mode = modes[0];
      } else { attrs.brightness = null; attrs.color_mode = null; }
      return setState(id, on ? 'on' : 'off', attrs);
    }
    case 'switch': case 'input_boolean': case 'fan': return setState(id, on ? 'on' : 'off');
    case 'script': if (on) runScript(id); return entities.get(id);
    case 'scene': case 'button': case 'input_button': return setState(id, haTime());
    case 'climate': {
      const goOff = how === 'turn_off' || (how === 'toggle' && e.state !== 'off');
      if (goOff) { if (e.state !== 'off') lastClimateMode = e.state; return setState(id, 'off', { hvac_action: 'off' }); }
      const r = setState(id, lastClimateMode || 'heat'); climateRecalc(id); return r;
    }
    case 'cover': return setState(id, on ? 'open' : 'closed');
    default: return setState(id, on ? 'on' : 'off');
  }
}

function callService(domain, service, data) {
  const ids = idsOf(data), changed = [];
  if (domain === 'calendar' && service === 'create_event') {          // only the first calendar can be written to (supported_features 1)
    const id = ids[0]; if (id !== CALENDARS[0].id || !data.summary) return null;
    const allDay = !!data.start_date, sd = allDay ? new Date(data.start_date + 'T00:00:00') : new Date(String(data.start_date_time).replace(' ', 'T')), ed = allDay ? new Date(data.end_date + 'T00:00:00') : new Date(String(data.end_date_time).replace(' ', 'T'));
    if (isNaN(sd) || isNaN(ed)) return null;
    const ev = { summary: data.summary, location: data.location || '', description: data.description || '', start: allDay ? { date: dayStr(sd) } : { dateTime: localISO(sd) }, end: allDay ? { date: dayStr(ed) } : { dateTime: localISO(ed) } };
    CREATED.push({ calendar: id, sd: sd.getTime(), ed: ed.getTime(), ev }); refreshCalendarStates(true);
    return [];
  }
  const keep = e => { if (e) changed.push(e); };
  if ((domain === 'homeassistant' || ['light', 'switch', 'input_boolean', 'fan', 'script', 'scene', 'climate', 'cover'].includes(domain)) && ['turn_on', 'turn_off', 'toggle'].includes(service)) {
    ids.forEach(id => keep(turn(id, service, data)));
    return changed;
  }
  if (domain === 'script' && !['reload', 'turn_on', 'turn_off', 'toggle'].includes(service)) { runScript('script.' + service); return [entities.get('script.' + service)].filter(Boolean); }
  if ((domain === 'button' || domain === 'input_button') && service === 'press') { ids.forEach(id => keep(turn(id, 'turn_on'))); return changed; }
  if (domain === 'climate') {
    for (const id of ids) {
      const e = entities.get(id); if (!e) continue;
      if (service === 'set_temperature') {
        const a = {};
        if (data.temperature != null) a.temperature = Number(data.temperature);
        if (data.target_temp_low != null) a.target_temp_low = Number(data.target_temp_low);
        if (data.target_temp_high != null) a.target_temp_high = Number(data.target_temp_high);
        keep(setState(id, data.hvac_mode || e.state, a));
        climateRecalc(id);
      } else if (service === 'set_hvac_mode') {
        const m = data.hvac_mode;
        const a = m === 'heat_cool' ? { temperature: null, target_temp_low: 68, target_temp_high: 76 } : { temperature: e.attributes.temperature ?? 72, target_temp_low: null, target_temp_high: null };
        if (m !== 'off') lastClimateMode = m;
        keep(setState(id, m, a)); climateRecalc(id);
      } else return null;
    }
    return ids.map(id => entities.get(id)).filter(Boolean);
  }
  if (domain === 'cover' && ['open_cover', 'close_cover', 'stop_cover'].includes(service)) {
    ids.forEach(id => { if (service !== 'stop_cover') keep(setState(id, service === 'open_cover' ? 'open' : 'closed')); });
    return changed;
  }
  if (domain === 'media_player') {
    for (const id of ids) {
      const e = entities.get(id); if (!e) continue;
      if (service === 'media_play_pause') keep(setState(id, e.state === 'playing' ? 'paused' : 'playing'));
      else if (service === 'media_play') keep(setState(id, 'playing'));
      else if (service === 'media_pause') keep(setState(id, 'paused'));
      else if (service === 'turn_off') keep(setState(id, 'off'));
      else if (service === 'turn_on') keep(setState(id, 'paused'));
      else if (['media_next_track', 'media_previous_track', 'volume_up', 'volume_down', 'volume_set'].includes(service)) keep(e);
      else return null;
    }
    return changed;
  }
  return null;       // unknown service
}

// ---------------------------------------------------------------- auth
const flows = new Map();            // flow_id -> { step, user }
const codes = new Map();            // auth code -> client_id
const accessTokens = new Map();     // token -> expiry ms
const REFRESH_PREFIX = 'mock-refresh-';     // any refresh token that starts like this is good (so restarting the mock does not sign the app out)

function newAccess() {
  const t = 'mock-access-' + rnd(16);
  accessTokens.set(t, Date.now() + EXPIRES_IN * 1000);
  return t;
}
const tokenOK = t => { const x = accessTokens.get(t); if (!x) return false; if (x < Date.now()) { accessTokens.delete(t); return false; } return true; };
const bearer = req => { const m = /^Bearer (.+)$/.exec(req.headers.authorization || ''); return m ? m[1] : null; };
const schema = fields => fields.map(name => ({ type: 'string', name, required: true }));
const HANDLER = ['homeassistant', null];

function formStep(flow_id, step_id, fields, errors) {
  return { type: 'form', flow_id, handler: HANDLER, step_id, data_schema: schema(fields), errors: errors || {}, description_placeholders: null, last_step: null, preview: null };
}
function entryDone(flow_id, clientId) {
  const code = rnd(16);
  codes.set(code, clientId);
  return { version: 1, type: 'create_entry', flow_id, handler: HANDLER, result: code, description: null, description_placeholders: null, context: { source: 'user' } };
}

function loginFlow(req, res, parts, body) {
  if (parts.length === 2) {           // POST /auth/login_flow
    if (req.method !== 'POST') return send(res, 405, { message: 'Method not allowed' });
    if (!body.client_id || !body.redirect_uri || !Array.isArray(body.handler)) return send(res, 400, { message: 'Invalid or missing client_id / redirect_uri / handler' });
    const id = rnd(16);
    flows.set(id, { step: 'init', clientId: body.client_id });
    return send(res, 200, formStep(id, 'init', ['username', 'password']));
  }
  const id = parts[2], flow = flows.get(id);
  if (req.method === 'DELETE') { flows.delete(id); return send(res, 200, { message: 'Flow aborted' }); }
  if (!flow) return send(res, 404, { message: 'Invalid flow specified' });
  if (flow.step === 'init') {
    const ok = body.username === TEST_USER && sha256(String(body.password || '')) === TEST_PASSWORD_SHA256;
    if (!ok) return send(res, 200, formStep(id, 'init', ['username', 'password'], { base: 'invalid_auth' }));
    if (MFA) { flow.step = 'mfa'; return send(res, 200, formStep(id, 'mfa', ['code'])); }
    flows.delete(id);
    return send(res, 200, entryDone(id, flow.clientId));
  }
  if (flow.step === 'mfa') {
    if (body.code !== MFA_CODE) return send(res, 200, formStep(id, 'mfa', ['code'], { base: 'invalid_code' }));
    flows.delete(id);
    return send(res, 200, entryDone(id, flow.clientId));
  }
  return send(res, 400, { message: 'Bad flow' });
}

function tokenEndpoint(req, res, body) {
  const bad = (error, desc) => send(res, 400, { error, error_description: desc });
  if (body.grant_type === 'authorization_code') {
    const cid = codes.get(body.code);
    if (!cid || cid !== body.client_id) return bad('invalid_request', 'Invalid code');
    codes.delete(body.code);
    return send(res, 200, { access_token: newAccess(), token_type: 'Bearer', refresh_token: REFRESH_PREFIX + rnd(24), expires_in: EXPIRES_IN, ha_auth_provider: 'homeassistant' });
  }
  if (body.grant_type === 'refresh_token') {
    if (!String(body.refresh_token || '').startsWith(REFRESH_PREFIX)) return bad('invalid_grant', 'Invalid refresh token');
    return send(res, 200, { access_token: newAccess(), token_type: 'Bearer', expires_in: EXPIRES_IN });
  }
  return bad('unsupported_grant_type', 'Unsupported grant type');
}

// ---------------------------------------------------------------- http
const recent = [];                  // what the app sent (see /mock/log)
function send(res, code, obj, type = 'application/json') {
  const b = typeof obj === 'string' ? obj : JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': type, 'Content-Length': Buffer.byteLength(b) });
  res.end(b);
}
function readBody(req) {
  return new Promise(resolve => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw) return resolve({});
      const ct = req.headers['content-type'] || '';
      try { resolve(ct.includes('x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(raw)) : JSON.parse(raw)); }
      catch { resolve({ __bad: true }); }
    });
  });
}

const DASHBOARD_HTML = `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><title>Mock dashboard</title>
<body style="font:20px -apple-system,sans-serif;background:#2a231d;color:#fff;padding:40px">
<h1>Mock Home Assistant dashboard</h1><p>Pretend Okie dashboard page served by the mock.</p>
<p id=t>checking sign-in…</p>
<script>try{var t=JSON.parse(localStorage.getItem('hassTokens')||'null');document.getElementById('t').textContent=t&&t.access_token?'Signed in: the app handed over a token ('+t.access_token.slice(0,12)+'…) for '+t.hassUrl:'NOT signed in: no hassTokens in localStorage';}catch(e){document.getElementById('t').textContent='error '+e}</script>`;

async function handle(req, res) {
  const url = new URL(req.url, 'http://mock');
  const path = url.pathname.replace(/\/+$/, '') || '/';
  const parts = path.split('/').filter(Boolean);
  const body = req.method === 'GET' || req.method === 'HEAD' ? {} : await readBody(req);
  const entry = { t: new Date().toISOString(), m: req.method, p: url.pathname + url.search, auth: !!req.headers.authorization };
  recent.push(entry); if (recent.length > 300) recent.shift();
  res.on('finish', () => { entry.status = res.statusCode; log(req.method, url.pathname + (url.search || ''), res.statusCode); });

  // ---- test helpers (not part of Home Assistant)
  if (parts[0] === 'mock') {
    if (parts[1] === 'log') return send(res, 200, recent);
    if (parts[1] === 'reset') { seed(); sockets.forEach(ws => ws.close()); return send(res, 200, { ok: true }); }
    if (parts[1] === 'expire') { accessTokens.clear(); return send(res, 200, { ok: true, note: 'every access token is now invalid; the app must refresh' }); }
    if (parts[1] === 'set' && req.method === 'POST') {       // {"entity_id":"light.kitchen","state":"on","attributes":{...}}
      if (!entities.has(body.entity_id)) return send(res, 404, { message: 'Entity not found' });
      const e = setState(body.entity_id, body.state ?? entities.get(body.entity_id).state, body.attributes);
      if (domainOf(body.entity_id) === 'climate') climateRecalc(body.entity_id);
      return send(res, 200, e);
    }
    return send(res, 404, { message: 'unknown mock helper' });
  }

  // ---- sign-in
  if (parts[0] === 'auth') {
    if (body.__bad) return send(res, 400, { message: 'Bad JSON' });
    if (parts[1] === 'login_flow') return loginFlow(req, res, parts, body);
    if (parts[1] === 'token' && req.method === 'POST') return tokenEndpoint(req, res, body);
    return send(res, 404, { message: 'Not found' });
  }

  // ---- REST API
  if (parts[0] === 'api') {
    if (parts[1] === 'websocket') return send(res, 426, { message: 'Upgrade required' });
    if (!tokenOK(bearer(req))) return send(res, 401, 'Unauthorized', 'text/plain');
    if (parts.length === 1) return send(res, 200, { message: 'API running.' });
    if (parts[1] === 'config') return send(res, 200, { version: VERSION, location_name: 'Mock Home', latitude: 28.1511, longitude: -82.4612, unit_system: { temperature: '°F' }, time_zone: Intl.DateTimeFormat().resolvedOptions().timeZone });
    if (parts[1] === 'states') {
      if (parts.length === 2) return send(res, 200, [...entities.values()]);
      const id = parts.slice(2).join('/');
      if (req.method === 'GET') return entities.has(id) ? send(res, 200, entities.get(id)) : send(res, 404, { message: 'Entity not found.' });
      if (req.method === 'POST') {
        if (!entities.has(id)) put(id, 'unknown', {});
        return send(res, 200, setState(id, body.state, body.attributes || {}, true));
      }
    }
    if (parts[1] === 'services' && parts.length === 2 && req.method === 'GET') return send(res, 200, [{ domain: 'scheduler', services: { add: {}, edit: {}, remove: {} } }, { domain: 'climate', services: {} }]);
    if (parts[1] === 'scheduler' && parts[2] === 'list') {          // one pretend schedule of the Scheduler component: Comfort every weekday at 07:00
      const act = [{ service: 'climate.set_hvac_mode', entity_id: 'climate.living_room', service_data: { hvac_mode: 'heat_cool' } }, { service: 'climate.set_temperature', entity_id: 'climate.living_room', service_data: { target_temp_low: 68, target_temp_high: 74 } }];
      return send(res, 200, [{ schedule_id: 'abc123', entity_id: 'switch.schedule_abc123', name: 'Comfort', enabled: true, weekdays: ['workday'], timeslots: [{ start: '07:00:00', actions: act }] }]);
    }
    if (parts[1] === 'history' && parts[2] === 'period') {          // a day of the thermostat: cooling, idle, cooling
      const now = Date.now(), ago = h => new Date(now - h * 3600e3).toISOString();
      return send(res, 200, [[{ state: 'cool', last_changed: ago(24) }, { state: 'off', last_changed: ago(15) }, { state: 'cool', last_changed: ago(9) }, { state: 'heat_cool', last_changed: ago(3) }]]);
    }
    if (parts[1] === 'services' && parts[2] === 'weather' && parts[3] === 'get_forecasts' && req.method === 'POST') {
      const id = body.entity_id, hourly = body.type === 'hourly', n = hourly ? 48 : 10, conds = ['sunny', 'sunny', 'partlycloudy', 'cloudy', 'rainy', 'sunny'];
      const list = [];
      for (let i = 0; i < n; i++) {
        const d = new Date(Date.now() + i * (hourly ? 3600e3 : 86400e3));
        if (hourly) d.setMinutes(0, 0, 0);
        const base = hourly ? 66 + Math.round(8 * Math.sin((d.getHours() - 8) / 24 * 2 * Math.PI)) : 78 + (i % 3);
        list.push({ datetime: d.toISOString(), condition: conds[(hourly ? Math.floor(i / 3) : i) % conds.length], temperature: base, ...(hourly ? {} : { templow: base - 15 }) });
      }
      return send(res, 200, { changed_states: [], service_response: { [id]: { forecast: list } } });
    }
    if (parts[1] === 'services' && parts.length === 4 && req.method === 'POST') {
      const changed = callService(parts[2], parts[3], body);
      return changed ? send(res, 200, changed) : send(res, 400, { message: `Service ${parts[2]}.${parts[3]} not found.` });
    }
    if (parts[1] === 'template' && req.method === 'POST') {          // only {{ area_name('<entity>') }} is understood
      const m = /area_name\('([^']+)'\)/.exec(String(body.template || ''));
      const areas = { 'switch.bedlight': 'Bedroom', 'light.living_room_lamp': 'Living Room', 'light.kitchen': 'Kitchen', 'light.office_desk': 'Office' };
      return send(res, 200, m ? (areas[m[1]] || '') : '', 'text/plain');
    }
    if (parts[1] === 'calendars') {
      if (parts.length === 2) return send(res, 200, CALENDARS.map(c => ({ entity_id: c.id, name: c.name })));
      const cal = CALENDARS.find(c => c.id === parts[2]);
      if (!cal) return send(res, 404, { message: 'Calendar not found' });
      const start = new Date(url.searchParams.get('start')), end = new Date(url.searchParams.get('end'));
      if (isNaN(start) || isNaN(end)) return send(res, 400, { message: 'Invalid start/end' });
      return send(res, 200, eventsFor(cal.id, start, end));
    }
    return send(res, 404, { message: 'Not found' });
  }

  // ---- anything else is "the dashboard"
  if (req.method === 'GET') return send(res, 200, DASHBOARD_HTML, 'text/html; charset=utf-8');
  return send(res, 404, { message: 'Not found' });
}

// ---------------------------------------------------------------- websocket (RFC 6455 by hand)
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';

function frame(op, payload) {
  const len = payload.length;
  let h;
  if (len < 126) h = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { h = Buffer.alloc(4); h[0] = 0x80 | op; h[1] = 126; h.writeUInt16BE(len, 2); }
  else { h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([h, payload]);
}

function upgrade(req, socket) {
  const url = new URL(req.url, 'http://mock');
  const key = req.headers['sec-websocket-key'];
  if (url.pathname !== '/api/websocket' || !key || (req.headers.upgrade || '').toLowerCase() !== 'websocket') { socket.end('HTTP/1.1 404 Not Found\r\nConnection: close\r\n\r\n'); return; }
  const accept = crypto.createHash('sha1').update(key + GUID).digest('base64');
  socket.write(['HTTP/1.1 101 Switching Protocols', 'Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Accept: ${accept}`, '', ''].join('\r\n'));
  socket.setNoDelay(true);

  const ws = { subs: [], authed: false, open: true };
  ws.send = obj => { if (ws.open) socket.write(frame(1, Buffer.from(JSON.stringify(obj)))); };
  ws.close = () => { if (ws.open) { ws.open = false; try { socket.write(frame(8, Buffer.alloc(0))); socket.end(); } catch {} } sockets.delete(ws); };
  log('WS open');
  recent.push({ t: new Date().toISOString(), m: 'WS', p: 'open' });
  ws.send({ type: 'auth_required', ha_version: VERSION });

  const onMessage = text => {
    let m; try { m = JSON.parse(text); } catch { return; }
    recent.push({ t: new Date().toISOString(), m: 'WS<', p: m.type + (m.event_type ? ':' + m.event_type : '') + (m.id ? '#' + m.id : '') });
    if (!ws.authed) {
      if (m.type === 'auth' && tokenOK(m.access_token)) { ws.authed = true; sockets.add(ws); ws.send({ type: 'auth_ok', ha_version: VERSION }); }
      else { ws.send({ type: 'auth_invalid', message: 'Invalid access token or password' }); ws.close(); }
      return;
    }
    const ok = (result = null) => ws.send({ id: m.id, type: 'result', success: true, result });
    switch (m.type) {
      case 'ping': return ws.send({ id: m.id, type: 'pong' });
      case 'frontend/get_user_data': return ok({ value: USER_DATA.has(m.key) ? USER_DATA.get(m.key) : null });
      case 'frontend/set_user_data': USER_DATA.set(m.key, m.value); return ok(null);
      case 'get_states': return ok([...entities.values()]);
      case 'subscribe_events': if (!m.event_type || m.event_type === 'state_changed') ws.subs.push(m.id); return ok();
      case 'call_service': { const c = callService(m.domain, m.service, { ...(m.service_data || {}), ...(m.target || {}) }); return c ? ok({ context: ctx() }) : ws.send({ id: m.id, type: 'result', success: false, error: { code: 'not_found', message: 'Service not found.' } }); }
      case 'get_config': return ok({ version: VERSION, location_name: 'Mock Home' });
      default: return ws.send({ id: m.id, type: 'result', success: false, error: { code: 'unknown_command', message: 'Unknown command.' } });
    }
  };

  let buf = Buffer.alloc(0), partial = [];
  socket.on('data', chunk => {
    buf = Buffer.concat([buf, chunk]);
    for (;;) {
      if (buf.length < 2) return;
      const fin = !!(buf[0] & 0x80), op = buf[0] & 0x0f, masked = !!(buf[1] & 0x80);
      let len = buf[1] & 0x7f, off = 2;
      if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
      let mask = null;
      if (masked) { if (buf.length < off + 4) return; mask = buf.subarray(off, off + 4); off += 4; }
      if (buf.length < off + len) return;
      const payload = Buffer.from(buf.subarray(off, off + len));
      if (mask) for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i % 4];
      buf = buf.subarray(off + len);
      if (op === 8) { ws.close(); return; }
      if (op === 9) { socket.write(frame(10, payload)); continue; }
      if (op === 10) continue;
      if (op === 1 || op === 2 || op === 0) {
        partial.push(payload);
        if (fin) { const text = Buffer.concat(partial).toString('utf8'); partial = []; onMessage(text); }
      }
    }
  });
  const gone = () => { if (ws.open) log('WS closed'); ws.open = false; sockets.delete(ws); };
  socket.on('close', gone); socket.on('error', gone);
  const ping = setInterval(() => { if (ws.open) socket.write(frame(9, Buffer.alloc(0))); else clearInterval(ping); }, 25000);
  socket.on('close', () => clearInterval(ping));
}

// ---------------------------------------------------------------- start
seed();
if (DRIFT) setInterval(() => {         // the room slowly follows the thermostat, so the app shows live changes without anyone touching it
  const e = entities.get('climate.living_room'); if (!e) return;
  const a = e.attributes;
  if (a.hvac_action === 'heating' && a.current_temperature < a.temperature) setState(e.entity_id, e.state, { current_temperature: a.current_temperature + 1 }), climateRecalc(e.entity_id);
  else if (a.hvac_action === 'cooling' && a.current_temperature > a.temperature) setState(e.entity_id, e.state, { current_temperature: a.current_temperature - 1 }), climateRecalc(e.entity_id);
}, 20000);
setInterval(() => refreshCalendarStates(true), 60000);

const server = http.createServer((req, res) => handle(req, res).catch(err => { console.error(err); try { send(res, 500, { message: String(err) }); } catch {} }));
server.on('upgrade', upgrade);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock Home Assistant on http://localhost:${PORT}  (MFA ${MFA ? 'on' : 'off'}, token life ${EXPIRES_IN}s)`);
  const nets = require('os').networkInterfaces();
  for (const list of Object.values(nets)) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  also on http://${n.address}:${PORT}`);
});

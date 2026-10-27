/* okie-sensors: the Sensors menu, the screen of one door / window / motion sensor and the sensors card of the slider.
 *
 *  - the menu (an app in the dock): every binary sensor that tells you something (doors, windows, motion, water, smoke ...) and the readings (temperature,
 *    humidity ...), the ones that need a look first, then room by room. A tap opens the screen of that sensor
 *  - the screen of a binary sensor (its Controls tab): what it says right now, since when, a switch for its notifications and the recent events of the
 *    doors and windows
 *  - the card (a page of the slider, like the cameras card): a photo, the sensor it shows, a bell with the number of open ones and a pill into the menu
 *
 * The rules (what is a sensor, what kind, the words for its states, the order, the recent events) are pure and unit-tested; the screens are checked in the browser.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // binary sensors that say nothing about the home (the battery of a device, its connection ...) stay out of the menu
  var SKIP = { battery: 1, battery_charging: 1, connectivity: 1, update: 1, plug: 1, power: 1, running: 1, light: 1, cold: 1, heat: 1, problem: 1, tamper: 1, lock: 1 };
  var READINGS = { temperature: 1, humidity: 1, illuminance: 1, pressure: 1, carbon_dioxide: 1, pm25: 1, pm10: 1, aqi: 1, volatile_organic_compounds: 1, moisture: 1, sound_pressure: 1, atmospheric_pressure: 1 };
  var WORDS = {
    en: { door: ['Closed', 'Open'], window: ['Closed', 'Open'], motion: ['Clear', 'Motion'], water: ['Dry', 'Wet'], smoke: ['Clear', 'Alarm'], other: ['Off', 'On'], dead: 'Unavailable' },
    de: { door: ['Geschlossen', 'Offen'], window: ['Geschlossen', 'Offen'], motion: ['Ruhig', 'Bewegung'], water: ['Trocken', 'Nass'], smoke: ['In Ordnung', 'Alarm'], other: ['Aus', 'Ein'], dead: 'Nicht verfügbar' },
  };

  /** 'door' | 'window' | 'motion' | 'water' | 'smoke' | 'other' from the device class, else from the words in the name. */
  function kindOf(deviceClass, name) {
    switch (deviceClass) {
      case 'door': case 'garage_door': return 'door';
      case 'window': return 'window';
      case 'motion': case 'occupancy': case 'presence': case 'moving': return 'motion';
      case 'moisture': return 'water';
      case 'smoke': case 'gas': case 'carbon_monoxide': case 'fire': case 'safety': return 'smoke';
    }
    var n = String(name || '').toLowerCase();
    if (/window|fenster/.test(n)) return 'window';
    if (/door|tür|tuer|gate|tor\b/.test(n)) return 'door';
    if (deviceClass === 'opening') return 'door';
    if (/motion|bewegung|presence|anwesen/.test(n)) return 'motion';
    return 'other';
  }
  function wordsOf(kind, lang) { var d = WORDS[lang === 'de' ? 'de' : 'en']; return d[kind] || d.other; }
  /** What a sensor says: Closed / Open, Clear / Motion ... */
  function stateWord(kind, state, lang) {
    var d = WORDS[lang === 'de' ? 'de' : 'en'];
    if (state === 'unavailable' || state === 'unknown') return d.dead;
    return wordsOf(kind, lang)[state === 'on' ? 1 : 0];
  }
  function isDead(state) { return state === 'unavailable' || state === 'unknown'; }

  /**
   * The binary sensors for the menu and the card: [{ id, name, area, kind, on, dead, ts, word }], the ones that need a look (open, wet, motion) first, then by room and name.
   * get(id) -> an item of the search engine ({ name, area, domain, deviceClass }), excluded(item) -> true to leave one out.
   */
  function list(states, get, excluded, lang) {
    var out = [];
    Object.keys(states || {}).forEach(function (id) {
      if (id.indexOf('binary_sensor.') !== 0) return;
      var st = states[id], it = (get && get(id)) || null, a = (st && st.attributes) || {}, dc = (it && it.deviceClass) || a.device_class || '';
      if (!st || SKIP[dc] || (it && (it.category || (excluded && excluded(it))))) return;      // a diagnostic entity of a device is not a sensor of the home
      var name = (it && it.name) || a.friendly_name || id, kind = kindOf(dc, name), dead = isDead(st.state), on = st.state === 'on';
      out.push({ id: id, name: name, area: (it && it.area) || '', kind: kind, on: on, dead: dead, ts: Date.parse(st.last_changed) || 0, word: stateWord(kind, st.state, lang) });
    });
    return out.sort(function (x, y) { return (y.on ? 1 : 0) - (x.on ? 1 : 0) || String(x.area).localeCompare(String(y.area)) || String(x.name).localeCompare(String(y.name)); });
  }
  /** The numeric readings (temperature, humidity ...): [{ id, name, area, cls, value, unit }]. */
  function readings(states, get, excluded) {
    var out = [];
    Object.keys(states || {}).forEach(function (id) {
      if (id.indexOf('sensor.') !== 0) return;
      var st = states[id], it = (get && get(id)) || null, a = (st && st.attributes) || {}, dc = (it && it.deviceClass) || a.device_class || '', v = parseFloat(st && st.state);
      if (!st || !READINGS[dc] || !isFinite(v) || (it && (it.category || (excluded && excluded(it))))) return;
      out.push({ id: id, name: (it && it.name) || a.friendly_name || id, area: (it && it.area) || '', cls: dc, value: v, unit: a.unit_of_measurement || '' });
    });
    return out.sort(function (x, y) { return String(x.area).localeCompare(String(y.area)) || String(x.name).localeCompare(String(y.name)); });
  }
  /** How many sensors want a look right now (open, wet, motion), not counting the muted ones' bell. */
  function attention(rows) { return rows.filter(function (r) { return r.on && !r.dead; }).length; }
  /** Rows by room, in the order they come: [{ area, rows }] (no room: last). */
  function byArea(rows) {
    var map = {}, order = [];
    rows.forEach(function (r) { var k = r.area || ''; if (!map[k]) { map[k] = { area: k, rows: [] }; order.push(k); } map[k].rows.push(r); });
    return order.sort(function (a, b) { return (a === '') - (b === '') || a.localeCompare(b); }).map(function (k) { return map[k]; });
  }
  /** The photo for a binary sensor: a door gets the door, everything else the sensor on a window. */
  function photoKey(kind) { return kind === 'door' ? 'door' : 'window'; }
  /** The photo for a cover: blinds and shades get the blind; a garage door, a gate and the like none. */
  function coverPhotoKey(deviceClass) { return /^(garage|gate|door|damper)$/.test(deviceClass || '') ? null : 'blinds'; }
  /** Logbook rows ({ when seconds, entity_id, name, state }) -> the newest first: [{ id, name, word, on, ts, kind }]. Rows that are not an on / off change are dropped. */
  function eventRows(rows, kinds, lang, limit) {
    return (rows || []).filter(function (r) { return r && (r.state === 'on' || r.state === 'off') && kinds[r.entity_id]; })
      .map(function (r) { var k = kinds[r.entity_id]; return { id: r.entity_id, name: r.name || r.entity_id, kind: k, on: r.state === 'on', word: stateWord(k, r.state, lang), ts: (+r.when || 0) * 1000 }; })
      .sort(function (a, b) { return b.ts - a.ts; }).slice(0, limit || 4);
  }
  /** "10:23:45 AM" today, "Yesterday 8:41 PM" the day before, "Mon 6:22 PM" before that. */
  function whenLabel(ts, now, lang) {
    var de = lang === 'de', loc = de ? 'de-DE' : 'en-US', d = new Date(ts), n = new Date(now);
    var day = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); }, diff = Math.round((day(n) - day(d)) / 86400000);
    var time = function (sec) { return d.toLocaleTimeString(loc, sec ? { hour: 'numeric', minute: '2-digit', second: '2-digit' } : { hour: 'numeric', minute: '2-digit' }); };
    if (diff <= 0) return time(true);
    if (diff === 1) return (de ? 'Gestern ' : 'Yesterday ') + time(false);
    return d.toLocaleDateString(loc, { weekday: 'short' }) + ' ' + time(false);
  }

  var api = { kindOf: kindOf, wordsOf: wordsOf, stateWord: stateWord, list: list, readings: readings, attention: attention, byArea: byArea, photoKey: photoKey, coverPhotoKey: coverPhotoKey, eventRows: eventRows, whenLabel: whenLabel };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.sensors = api;

  // ===================================================================== screens ====
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, L = g.OkieMotor.logic, h = UI.h;

  core.registerStrings('en', {
    'app.sensors': 'Sensors', 'sn.view': 'View Sensors', 'sn.none': 'No sensors found.', 'sn.attention': 'Needs a look', 'sn.all_ok': 'Everything is quiet', 'sn.open_n': '{n} open or active', 'sn.total': '{n} sensors', 'sn.readings': 'Readings', 'sn.other_room': 'Other',
    'sn.updated': 'Last updated {t}', 'sn.notif_on': 'Notifications on', 'sn.notif_off': 'Notifications off', 'sn.events': 'Recent events', 'sn.view_all': 'View All', 'sn.no_events': 'No events yet.', 'sn.alert_1': '1 sensor needs a look', 'sn.alert_n': '{n} sensors need a look',
    'sn.blind_opening': '{n}: Opening', 'sn.blind_closing': '{n}: Closing', 'sn.blind_open': '{n}: Open', 'sn.blind_closed': '{n}: Closed', 'sn.blind_at': '{n}: {p}% open',
  });
  core.registerStrings('de', {
    'app.sensors': 'Sensoren', 'sn.view': 'Sensoren ansehen', 'sn.none': 'Keine Sensoren gefunden.', 'sn.attention': 'Braucht einen Blick', 'sn.all_ok': 'Alles ruhig', 'sn.open_n': '{n} offen oder aktiv', 'sn.total': '{n} Sensoren', 'sn.readings': 'Messwerte', 'sn.other_room': 'Sonstige',
    'sn.updated': 'Zuletzt aktualisiert {t}', 'sn.notif_on': 'Benachrichtigungen an', 'sn.notif_off': 'Benachrichtigungen aus', 'sn.events': 'Letzte Ereignisse', 'sn.view_all': 'Alle ansehen', 'sn.no_events': 'Noch keine Ereignisse.', 'sn.alert_1': '1 Sensor braucht einen Blick', 'sn.alert_n': '{n} Sensoren brauchen einen Blick',
    'sn.blind_opening': '{n}: Öffnet', 'sn.blind_closing': '{n}: Schließt', 'sn.blind_open': '{n}: Offen', 'sn.blind_closed': '{n}: Geschlossen', 'sn.blind_at': '{n}: {p}% offen',
  });

  var KIND_ICON = { door: 'door', window: 'window', motion: 'motion', water: 'drop', smoke: 'flame', other: 'pulse' };
  var READ_ICON = { temperature: 'thermostat', humidity: 'drop', illuminance: 'sun', pressure: 'gauge', atmospheric_pressure: 'gauge', carbon_dioxide: 'wind', pm25: 'wind', pm10: 'wind', aqi: 'wind', volatile_organic_compounds: 'wind', moisture: 'drop', sound_pressure: 'volume' };
  function T(ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; }
  function sensorsOf(ctx) { var hs = ctx.hass(); return list(hs.states, ctx.engine.getItem, ctx.engine.isExcluded, ctx.lang()); }
  function readingsOf(ctx) { var hs = ctx.hass(); return readings(hs.states, ctx.engine.getItem, ctx.engine.isExcluded); }
  function ago(ctx, ts) { return L.relativeTime(Math.max(0, Date.now() - ts), ctx.lang()); }
  function muted(ctx) { return ctx.store.get('sensors.mute', null) || []; }
  function isMuted(ctx, id) { return muted(ctx).indexOf(id) >= 0; }
  function toggleMute(ctx, id) { var m = muted(ctx).filter(function (x) { return x !== id; }); if (m.length === muted(ctx).length) m.push(id); ctx.store.set('sensors.mute', m); ctx.bus && ctx.bus.emit && ctx.bus.emit('sensors-mute', id); return m.indexOf(id) >= 0; }
  function art(key) { var a = g.OkieMotor.sensorArt || {}; return key ? a[key] || '' : ''; }

  // ---- the menu
  function renderSensors(container, ctx) {
    var t = T(ctx), sig = '', disposed = false;
    var shell = g.OkieMotor.appshell.create(container, ctx, { id: 'sensors', title: t('app.sensors'), subtitle: '', icon: 'door', gradient: ['#2a2430', '#5a4a68'], photo: art('door'), tabs: [], onTab: function () {} });
    var body = shell.body, root = h('div.sn-app');
    body.appendChild(root);
    function rowFor(r) {
      var tone = r.dead ? 'dead' : r.on ? 'on' : 'off';
      return h('button.sn-row', { type: 'button', dataset: { tone: tone, id: r.id }, onclick: function () { ctx.openDetail(r.id); } },
        h('span.sn-ic', { html: UI.icon(KIND_ICON[r.kind] || 'pulse', 22) }),
        h('span.sn-tx', null, h('b', null, r.name), h('span', null, [r.area, r.ts ? ago(ctx, r.ts) : ''].filter(Boolean).join(' · '))),
        h('span.sn-pill', null, r.word), h('span.sn-chev', { html: UI.icon('chevron', 16) }));
    }
    function readRow(r) {
      return h('button.sn-row', { type: 'button', dataset: { tone: 'off', id: r.id }, onclick: function () { ctx.openDetail(r.id); } },
        h('span.sn-ic', { html: UI.icon(READ_ICON[r.cls] || 'gauge', 22) }), h('span.sn-tx', null, h('b', null, r.name), h('span', null, r.area)),
        h('span.sn-val', null, String(Math.round(r.value * 10) / 10).replace('.', ctx.lang() === 'de' ? ',' : '.') + (r.unit ? ' ' + r.unit : '')), h('span.sn-chev', { html: UI.icon('chevron', 16) }));
    }
    function draw() {
      var rows = sensorsOf(ctx), reads = readingsOf(ctx);
      var key = rows.map(function (r) { return r.id + r.word + r.ts; }).join() + '|' + reads.map(function (r) { return r.id + r.value; }).join();
      if (key === sig) return; sig = key; root.innerHTML = '';
      var n = attention(rows); shell.setSubtitle(rows.length ? (n ? t('sn.open_n', { n: n }) : t('sn.all_ok')) : '');
      if (!rows.length && !reads.length) { root.appendChild(h('div.sn-empty', null, h('span', { html: UI.icon('door', 44) }), h('div', null, t('sn.none')))); return; }
      var need = rows.filter(function (r) { return r.on && !r.dead; });
      if (need.length) { root.appendChild(h('div.lbl', null, t('sn.attention'))); need.forEach(function (r) { root.appendChild(rowFor(r)); }); }
      byArea(rows.filter(function (r) { return !(r.on && !r.dead); })).forEach(function (grp) {
        root.appendChild(h('div.lbl', null, grp.area || t('sn.other_room'))); grp.rows.forEach(function (r) { root.appendChild(rowFor(r)); });
      });
      if (reads.length) { root.appendChild(h('div.lbl', null, t('sn.readings'))); reads.forEach(function (r) { root.appendChild(readRow(r)); }); }
      if (shell.refreshScroll) shell.refreshScroll();
    }
    draw();
    return { update: function () { if (!disposed) draw(); }, dispose: function () { disposed = true; shell.dispose(); } };
  }

  // ---- the screen of one binary sensor (the Controls tab of the detail view)
  function sensorArtSvg(kind) {
    if (kind === 'door' || kind === 'window') {
      return '<svg viewBox="0 0 136 150" width="100%" height="100%" aria-hidden="true"><g fill="none" stroke="#5aa2ff" stroke-linecap="round" opacity=".7"><path d="M92 36a34 34 0 0 1 0 38" stroke-width="3"/><path d="M104 28a50 50 0 0 1 0 54" stroke-width="3" opacity=".6"/><path d="M116 20a66 66 0 0 1 0 70" stroke-width="3" opacity=".35"/></g>'
        + '<rect x="6" y="14" width="46" height="122" rx="22" fill="#f1f1f1"/><rect x="62" y="40" width="28" height="64" rx="12" fill="#e4e4e4"/><circle cx="29" cy="112" r="2.4" fill="#a8a8a8"/></svg>';
    }
    return '';
  }
  function binaryControl(ctx, item, o) {
    var t = T(ctx), lang = ctx.lang(), st0 = ctx.state(item.id) || { state: item.state, attributes: {} };
    var kind = kindOf(st0.attributes.device_class || item.deviceClass, item.name), contact = kind === 'door' || kind === 'window';
    var nameEl = h('div.sn-name', null, item.name), roomEl = h('div.sn-room', null, item.area || '');
    var dot = h('i.sn-dot'), word = h('div.sn-word'), upd = h('div.sn-upd');
    var illus = h('div.sn-art', { html: sensorArtSvg(kind) || UI.icon(KIND_ICON[kind] || 'pulse', 72) });
    var notifIc = h('span.sn-nic', { html: UI.icon('bell', 20) }), notifTx = h('span'), notif = h('button.sn-notif', { type: 'button', onclick: function () { toggleMute(ctx, item.id); paintNotif(); } }, notifIc, notifTx, h('span.sn-chev', { html: UI.icon('chevron', 16) }));
    function paintNotif() { var m = isMuted(ctx, item.id); notif.dataset.off = m ? '1' : ''; notifTx.textContent = t(m ? 'sn.notif_off' : 'sn.notif_on'); notif.setAttribute('aria-pressed', m ? 'false' : 'true'); }
    var evBox = h('div.sn-evs'), evHead = h('div.sn-evh', null, h('span', null, t('sn.events')), h('button', { type: 'button', onclick: function () { if (o && o.openTab) o.openTab('history'); } }, t('sn.view_all')));
    var root = h('div.dctl.sn-ctl', null, h('div.sn-top', null, h('div.sn-hd', null, nameEl, roomEl, h('div.sn-st', null, dot, word), upd, notif), illus), evHead, evBox);
    var kinds = {}, token = 0, dead = false, loadedFor = '';
    function loadEvents() {
      var rows = sensorsOf(ctx).filter(function (r) { return r.kind === 'door' || r.kind === 'window' || r.id === item.id; });
      rows.forEach(function (r) { kinds[r.id] = r.kind; }); kinds[item.id] = kind;
      var ids = Object.keys(kinds), key = ids.join(); if (key === loadedFor) return; loadedFor = key; var my = ++token;
      var now = Date.now();
      Promise.resolve(ctx.callWS({ type: 'logbook/get_events', start_time: new Date(now - 3 * 86400000).toISOString(), end_time: new Date(now).toISOString(), entity_ids: ids })).then(function (r) {
        if (dead || my !== token) return; drawEvents(eventRows(Array.isArray(r) ? r : [], kinds, lang, 4));
      }, function () { if (!dead && my === token) drawEvents([]); });
    }
    function drawEvents(evs) {
      evBox.innerHTML = '';
      if (!evs.length) { evBox.appendChild(h('div.sn-noev', null, t('sn.no_events'))); return; }
      evs.forEach(function (e) {
        evBox.appendChild(h('div.sn-ev', null, h('span.sn-eic', { html: UI.icon(KIND_ICON[e.kind] || 'pulse', 22) }), h('span.sn-etx', null, h('b', null, e.name), h('span', null, e.word)), h('span.sn-etm', null, whenLabel(e.ts, Date.now(), lang)), h('i.sn-edot', { dataset: { on: e.on ? '1' : '' } })));
      });
    }
    paintNotif();
    return { el: root, dispose: function () { dead = true; }, update: function (st) {
      var on = st.state === 'on', dd = isDead(st.state), ts = Date.parse(st.last_updated || st.last_changed) || Date.now();
      dot.dataset.on = dd ? 'dead' : (on ? '1' : ''); word.textContent = stateWord(kind, st.state, lang);
      upd.textContent = t('sn.updated', { t: new Date(ts).toLocaleTimeString(lang === 'de' ? 'de-DE' : 'en-US', { hour: 'numeric', minute: '2-digit' }) });
      loadEvents();
    } };
  }
  api.control = binaryControl; api.isMuted = isMuted; api.photo = art;

  // ---- the blinds illustration (used by the cover screen): the shade comes down over the window as far as it is closed
  /** An SVG of a window with a roller shade; position 0..100 is how far it is open (100: all the way up). dir: 'opening' | 'closing' | '' shows an arrow. */
  api.blindSvg = function (position, dir) {
    var p = Math.max(0, Math.min(100, isFinite(position) ? position : 0)), box = 96, top = 22, full = box, shade = Math.round(full * (1 - p / 100)), slats = '';
    for (var i = 0; i < 5; i++) { var y = top + 4 + i * ((full - 10) / 5); if (y - top < shade - 4) slats += '<rect x="14" y="' + y.toFixed(1) + '" width="92" height="10" rx="2" fill="#bdbdbd"/>'; }
    var arrow = dir === 'closing' ? '<path d="M60 136v26M52 154l8 8 8-8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' : dir === 'opening' ? '<path d="M60 162v-26M52 144l8-8 8 8" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' : '';
    return '<svg viewBox="0 0 120 170" width="100%" height="100%" aria-hidden="true"><rect x="6" y="8" width="108" height="14" rx="4" fill="#d6d6d6"/><rect x="9" y="22" width="102" height="' + full + '" fill="none" stroke="#d6d6d6" stroke-width="3"/>' + slats
      + '<rect x="10" y="' + (top + shade - 2) + '" width="100" height="3" fill="#9a9a9a" opacity="' + (shade > 4 ? 1 : 0) + '"/>' + arrow + '</svg>';
  };

  // ---- the card of the slider
  function buildCard(ctx) {
    var t = T(ctx), cur = 0, timer = 0, disposed = false, shown = '';
    var pic = h('div.cc-pic'), shade = h('div.cc-shade'), badge = h('i.cam-badge', { hidden: true });
    var chipDot = h('i.sn-dot'), chipName = h('b'), chipSub = h('span'), chipIc = h('span.sn-cic');
    var chip = h('div.sn-chip', null, chipIc, h('span.sn-ctx', null, h('span.sn-cn', null, chipDot, chipName), chipSub));
    var bell = h('button.cc-bell', { type: 'button', 'aria-label': t('app.sensors'), title: t('app.sensors'), dataset: { alert: 'false' }, onclick: function (e) { e.stopPropagation(); ctx.openApp('sensors'); }, html: UI.icon('bell', 26) }, badge);
    var pill = h('button.cam-pill', { type: 'button', 'aria-label': t('sn.view') }, h('span.cam-pill-ic', { html: UI.icon('expand', 20) }), h('span', null, t('sn.view')));
    UI.pullPill(pill, function () { ctx.openApp('sensors'); });
    var el = h('section.camcard.gcard.sncard', { dataset: { gadget: 'sensors' }, role: 'group', 'aria-label': t('app.sensors'), onclick: function () { ctx.openApp('sensors'); } }, pic, shade, chip, h('div.cam-cluster', null, bell, pill));
    function show(url) { if (!url || shown === url) return; shown = url; pic.style.backgroundImage = 'url("' + url + '")'; pic.classList.add('on'); }
    function draw() {
      var rows = sensorsOf(ctx); if (!rows.length) { chip.hidden = true; return; }
      var pool = rows.filter(function (r) { return r.kind === 'door' || r.kind === 'window'; }); if (!pool.length) pool = rows;
      var r = pool[cur % pool.length];
      chip.hidden = false; chipName.textContent = r.name; chipSub.textContent = r.word + (r.ts ? ' · ' + ago(ctx, r.ts) : ''); chipDot.dataset.on = r.dead ? 'dead' : (r.on ? '1' : '');
      chipIc.innerHTML = UI.icon(KIND_ICON[r.kind] || 'pulse', 30); show(art(photoKey(r.kind)));
      var n = attention(rows); bell.dataset.alert = n ? 'true' : 'false'; badge.hidden = !n; badge.textContent = String(n);
      bell.setAttribute('aria-label', n ? (n === 1 ? t('sn.alert_1') : t('sn.alert_n', { n: n })) : t('app.sensors'));
    }
    timer = setInterval(function () { if (!disposed && !document.hidden) { cur++; draw(); } }, 7000);      // the card shows one sensor after the other
    draw();
    return { el: el, update: function () { draw(); }, dispose: function () { disposed = true; clearInterval(timer); } };
  }
  api.buildCard = buildCard; api.count = function (ctx) { return sensorsOf(ctx).length; }; api.any = function (ctx) { return sensorsOf(ctx).length + readingsOf(ctx).length > 0; };
  api.listOf = sensorsOf;

  g.OkieMotor.apps.register({ id: 'sensors', nameKey: 'app.sensors', name: 'Sensors', icon: 'door', color: '#7a5a96', order: 47, category: 'system', render: renderSensors });

  var CSS = [
    '.sn-app{display:flex;flex-direction:column;gap:8px;padding-bottom:12px;}.sn-app .lbl{margin-top:10px;}',
    '.sn-row{display:flex;align-items:center;gap:12px;width:100%;padding:10px 14px 10px 10px;border-radius:18px;background:rgba(255,255,255,.07);text-align:left;color:inherit;min-height:58px;}.sn-row:hover{background:rgba(255,255,255,.11);}',
    '.sn-ic{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);}.sn-row[data-tone="on"] .sn-ic{background:rgba(255,168,64,.28);color:#ffb865;}.sn-row[data-tone="dead"]{opacity:.5;}',
    '.sn-tx{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}.sn-tx b{font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.sn-tx span{font-size:12px;color:rgba(255,255,255,.62);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.sn-pill{flex:none;padding:4px 11px;border-radius:999px;font-size:12px;font-weight:700;background:rgba(80,200,120,.2);color:#7be0a0;}.sn-row[data-tone="on"] .sn-pill{background:rgba(255,168,64,.25);color:#ffc47e;}.sn-row[data-tone="dead"] .sn-pill{background:rgba(255,255,255,.12);color:rgba(255,255,255,.7);}.sn-val{flex:none;font-size:15px;font-weight:700;font-variant-numeric:tabular-nums;}.sn-chev{flex:none;opacity:.5;display:grid;}',
    '.sn-empty{display:flex;flex-direction:column;align-items:center;gap:12px;padding:60px 20px;color:rgba(255,255,255,.7);}',
    '.sn-ctl{display:flex;flex-direction:column;gap:14px;}.sn-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;}.sn-hd{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}.sn-name{font-size:28px;font-weight:700;letter-spacing:-.01em;line-height:1.1;}.sn-room{font-size:16px;color:rgba(255,255,255,.7);margin-bottom:10px;}',
    '.sn-st{display:flex;align-items:center;gap:12px;font-size:34px;font-weight:700;letter-spacing:-.02em;}.sn-word{line-height:1.1;}.sn-upd{font-size:14px;color:rgba(255,255,255,.66);margin:2px 0 12px 32px;}',
    '.sn-dot{display:inline-block;flex:none;width:16px;height:16px;border-radius:50%;background:#34c759;box-shadow:0 0 0 4px rgba(52,199,89,.22);}.sn-dot[data-on="1"]{background:#ffa83c;box-shadow:0 0 0 4px rgba(255,168,60,.25);}.sn-dot[data-on="dead"]{background:#8a8f98;box-shadow:none;}',
    '.sn-art{flex:none;width:clamp(86px,26%,150px);aspect-ratio:136/150;display:grid;place-items:center;color:rgba(255,255,255,.8);}.sn-art svg{display:block;}',
    '.sn-notif{display:flex;align-items:center;gap:12px;align-self:flex-start;min-width:260px;max-width:100%;padding:8px 16px 8px 8px;border-radius:999px;background:rgba(255,255,255,.1);color:#fff;font-size:15px;}.sn-nic{flex:none;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#2f7bff;}.sn-notif[data-off="1"] .sn-nic{background:rgba(255,255,255,.22);}.sn-notif>span:nth-child(2){flex:1;text-align:left;}',
    '.sn-evh{display:flex;align-items:center;justify-content:space-between;margin-top:6px;font-size:13px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:rgba(255,255,255,.62);}.sn-evh button{font-size:14px;text-transform:none;letter-spacing:0;color:rgba(255,255,255,.7);}',
    '.sn-evs{display:flex;flex-direction:column;gap:8px;}.sn-ev{display:flex;align-items:center;gap:14px;padding:10px 16px 10px 12px;border-radius:16px;background:rgba(255,255,255,.07);}.sn-eic{flex:none;display:grid;place-items:center;width:34px;}.sn-etx{flex:1;min-width:0;display:flex;flex-direction:column;}.sn-etx b{font-size:16px;font-weight:600;}.sn-etx span{font-size:14px;color:rgba(255,255,255,.66);}.sn-etm{flex:none;font-size:13px;color:rgba(255,255,255,.66);font-variant-numeric:tabular-nums;}',
    '.sn-edot{flex:none;width:12px;height:12px;border-radius:50%;background:#34c759;}.sn-edot[data-on="1"]{background:#4a8dff;}.sn-noev{padding:14px 4px;font-size:14px;color:rgba(255,255,255,.6);}',
    '.sn-chip{position:absolute;left:14px;top:14px;display:flex;align-items:center;gap:12px;padding:8px 18px 8px 12px;border-radius:18px;background:rgba(0,0,0,.34);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);max-width:calc(100% - 100px);}.sn-chip[hidden]{display:none;}.sn-cic{flex:none;display:grid;place-items:center;}.sn-ctx{display:flex;flex-direction:column;min-width:0;}.sn-cn{display:flex;align-items:center;gap:10px;font-size:22px;font-weight:600;letter-spacing:.01em;}.sn-cn b{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.sn-cn .sn-dot{width:11px;height:11px;box-shadow:none;}.sn-ctx>span{font-size:15px;color:rgba(255,255,255,.82);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.dctl.sn-ctl{align-items:stretch;}',
    '.bl-ctl{gap:8px;}.bl-name{align-self:flex-start;font-size:28px;font-weight:700;letter-spacing:-.01em;line-height:1.1;}.bl-room{align-self:flex-start;font-size:16px;color:rgba(255,255,255,.7);margin-bottom:8px;}.bl-art{width:min(210px,50%);aspect-ratio:120/170;color:#fff;}.bl-status{font-size:22px;font-weight:500;margin:6px 0 10px;text-align:center;}',
    '.bl-keys{display:flex;gap:22px;justify-content:center;}.bl-k{width:68px;height:68px;border-radius:50%;border:1.5px solid rgba(255,255,255,.42);display:grid;place-items:center;color:#fff;transition:background .2s,color .2s;}.bl-k:hover{background:rgba(255,255,255,.1);}.bl-k.on{background:#fff;color:#14161a;border-color:#fff;}.bl-k[hidden]{display:none;}.bl-pos{width:min(420px,100%);margin-top:10px;}',
    '.sncard .cc-bell{position:absolute;right:16px;top:14px;}.sncard .cam-cluster{justify-content:flex-start;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
})(typeof globalThis !== 'undefined' ? globalThis : window);

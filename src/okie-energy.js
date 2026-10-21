/* okie-energy: the Energy app. Reads Home Assistant's own energy preferences
 * (energy/get_prefs) and long-term statistics, so a configured Energy
 * dashboard needs no wizard. Shows grid import/export, solar, battery and the
 * derived home consumption, as cards and an hourly or daily bar chart.
 * The maths is pure and unit-tested.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var L = isNode ? require('./okie-logic.js') : g.OkieMotor.logic;

  var DAY = 86400000;

  /** Pull the statistic ids out of energy/get_prefs. */
  function sourcesFromPrefs(prefs) {
    var out = { gridIn: [], gridOut: [], solar: [], batteryIn: [], batteryOut: [], devices: [] };
    ((prefs && prefs.energy_sources) || []).forEach(function (s) {
      if (s.type === 'grid') {
        (s.flow_from || []).forEach(function (f) { if (f.stat_energy_from) out.gridIn.push(f.stat_energy_from); });
        (s.flow_to || []).forEach(function (f) { if (f.stat_energy_to) out.gridOut.push(f.stat_energy_to); });
        if (s.stat_energy_from && !(s.flow_from || []).length) out.gridIn.push(s.stat_energy_from);     // older prefs shape
        if (s.stat_energy_to && !(s.flow_to || []).length) out.gridOut.push(s.stat_energy_to);
      } else if (s.type === 'solar' && s.stat_energy_from) out.solar.push(s.stat_energy_from);
      else if (s.type === 'battery') { if (s.stat_energy_from) out.batteryOut.push(s.stat_energy_from); if (s.stat_energy_to) out.batteryIn.push(s.stat_energy_to); }
    });
    ((prefs && prefs.device_consumption) || []).forEach(function (d) { if (d.stat_consumption) out.devices.push(d.stat_consumption); });
    return out;
  }
  function allIds(src) { return [].concat(src.gridIn, src.gridOut, src.solar, src.batteryIn, src.batteryOut, src.devices); }
  /** Sum the `change` values of a statistics series. */
  function sumChange(series) { return (series || []).reduce(function (a, p) { return a + (p.change || 0); }, 0); }
  function sumIds(stats, ids) { return ids.reduce(function (a, id) { return a + sumChange(stats[id]); }, 0); }
  /** Per-bucket totals of several ids, aligned on the bucket start time. */
  function bucketTotals(stats, ids) {
    var map = new Map();
    ids.forEach(function (id) { (stats[id] || []).forEach(function (p) { map.set(p.start, (map.get(p.start) || 0) + (p.change || 0)); }); });
    return Array.from(map.entries()).sort(function (a, b) { return a[0] - b[0]; }).map(function (e) { return { t: e[0], v: e[1] }; });
  }
  /** Home consumption = what came in (grid + solar + battery out) minus what left (export + battery charge). */
  function homeConsumption(t) { return Math.max(0, t.gridIn + t.solar + t.batteryOut - t.gridOut - t.batteryIn); }
  function summarize(stats, src) {
    var t = { gridIn: sumIds(stats, src.gridIn), gridOut: sumIds(stats, src.gridOut), solar: sumIds(stats, src.solar), batteryIn: sumIds(stats, src.batteryIn), batteryOut: sumIds(stats, src.batteryOut) };
    t.home = homeConsumption(t);
    t.selfUse = t.solar > 0 ? Math.max(0, Math.min(1, (t.solar - t.gridOut) / t.solar)) : 0;     // share of solar used in the house
    return t;
  }
  /** Chart window for a range: hourly for today, daily for a week or a month. */
  function rangeWindow(range, now) {
    var d = new Date(now), sod = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    if (range === 'today') return { start: sod, end: sod + DAY, period: 'hour' };
    if (range === '7d') return { start: sod - 6 * DAY, end: sod + DAY, period: 'day' };
    return { start: sod - 29 * DAY, end: sod + DAY, period: 'day' };
  }
  function fmtKwh(v, de) { var s = (Math.round(v * 10) / 10).toFixed(1); return (de ? s.replace('.', ',') : s) + ' kWh'; }

  // ------------------------------------------------------------ the house ----
  // The numbers come from the sensors the homelab "energy-mqtt" service publishes (the same ones the Home Energy card of the Overview reads).
  var SENSORS = {
    server_power: 'sensor.energy_server_power', server_energy: 'sensor.energy_server_energy_today', server_cost: 'sensor.energy_server_cost_month',
    home_power: 'sensor.energy_home_average_power', bill: 'sensor.energy_last_bill', devices: 'sensor.energy_devices', containers: 'sensor.energy_containers',
    teco_cost: 'sensor.teco_last_bill_cost', teco_usage: 'sensor.teco_last_bill_usage', teco_days: 'sensor.teco_service_days', teco_due: 'sensor.teco_due_date',
    teco_rate: 'sensor.teco_last_bill_rate', teco_start: 'sensor.teco_service_period_start', teco_end: 'sensor.teco_service_period_end',
  };
  function okState(states, id) { var s = states && states[id]; return s && s.state !== 'unavailable' && s.state !== 'unknown' ? s : null; }
  function numState(states, id) { var s = okState(states, id); if (!s) return null; var v = parseFloat(s.state); return isNaN(v) ? null : v; }
  /** What the listed lights and plugs draw now (estimated from on/off and brightness): { w, on, lights } (lights: only lamps inside the house light its windows). */
  function deviceWatts(list, states) {
    var total = 0, on = 0, lights = 0;
    (list || []).forEach(function (d) {
      var s = states && states[d.entity]; if (!s || s.state !== 'on') return;
      var w = Number(d.watts) || 0, b = s.attributes && s.attributes.brightness;
      if (d.kind === 'light' && b != null) w = w * Math.max(0.1, b / 255);
      total += w; on += 1; if (d.lamp != null ? d.lamp : d.kind === 'light') lights += 1;
    });
    return { w: total, on: on, lights: lights };
  }
  /** Everything the House, Electricity, Server and Devices tabs show, read from the states. has: false when none of the sensors exist. */
  function readHouse(states) {
    var S = SENSORS, sv = okState(states, S.server_power), bill = okState(states, S.bill), dev = okState(states, S.devices), ba = (bill && bill.attributes) || {};
    var tCost = numState(states, S.teco_cost), tUse = numState(states, S.teco_usage), tDays = numState(states, S.teco_days), tDue = okState(states, S.teco_due), tRate = numState(states, S.teco_rate);
    var teco = tCost != null && tUse != null && tDays > 0;
    var homeW = numState(states, S.home_power); if (teco) homeW = tUse / (tDays * 24) * 1000;
    var list = (dev && dev.attributes && dev.attributes.devices) || [];
    var total = teco ? tCost : (bill ? parseFloat(bill.state) : null);
    var cont = okState(states, S.containers);
    return {
      has: !!(sv || bill || dev || homeW != null),
      serverW: sv ? parseFloat(sv.state) : null, serverAttr: (sv && sv.attributes) || {}, serverKwh: numState(states, S.server_energy), serverCost: numState(states, S.server_cost),
      homeW: homeW, homeKwhDay: homeW == null ? null : homeW * 24 / 1000,
      devices: list, hasDevices: !!dev, dev: deviceWatts(list, states),
      containers: (cont && cont.attributes && cont.attributes.containers) || null,
      bill: total == null || isNaN(total) ? null : {
        total: total, kwh: teco ? tUse : ba.kwh, days: teco ? tDays : ba.days, teco: teco,
        start: teco ? ((okState(states, S.teco_start) || {}).state || null) : (ba.period_start || null), end: teco ? ((okState(states, S.teco_end) || {}).state || null) : (ba.period_end || null),
        due: tDue ? tDue.state : (ba.due_date || null), rateCents: tRate != null ? tRate * 100 : (total && (teco ? tUse : ba.kwh) ? total / (teco ? tUse : ba.kwh) * 100 : null),
        marginalCents: ba.marginal_cents || null, history: Array.isArray(ba.history) ? ba.history.slice(0, 12).reverse() : [],
      },
    };
  }
  /** Seconds one pulse of a flow line takes for `w` watts out of `max` (null: nothing flows, the line is still). */
  function flowSeconds(w, max) { return w > 0.5 ? Math.max(0.9, Math.min(4.5, 4.5 - 3.6 * Math.min(1, w / max))) : null; }
  /** Estimated kWh today of the listed devices from their on-times (rows: Home Assistant's history, minimal or full) since startT (s), until endT (s). */
  function histKwh(list, res, startT, endT) {
    var total = 0;
    (list || []).forEach(function (d) {
      var rows = (res && res[d.entity]) || [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i], t0 = Math.max(startT, r.lu || r.last_updated || startT), nx = rows[i + 1], t1 = nx ? (nx.lu || nx.last_updated || endT) : endT;
        if (r.s !== 'on' && r.state !== 'on') continue;
        var a = r.a || r.attributes || {}, w = Number(d.watts) || 0;
        if (d.kind === 'light' && a.brightness != null) w = w * Math.max(0.1, a.brightness / 255);
        total += w * Math.max(0, t1 - t0) / 3600 / 1000;
      }
    });
    return total;
  }
  function fmtN(v, de) { var s = v >= 100 ? String(Math.round(v)) : v >= 10 ? v.toFixed(1) : v.toFixed(2); return de ? s.replace('.', ',') : s; }
  function fmtW(v, de) { if (v == null || isNaN(v)) return '—'; return v >= 1000 ? (de ? (v / 1000).toFixed(2).replace('.', ',') : (v / 1000).toFixed(2)) + ' kW' : Math.round(v) + ' W'; }
  function fmtUsd(v) { return v == null || isNaN(v) ? '—' : '$' + (v < 10 ? v.toFixed(2) : Math.round(v).toLocaleString('en-US')); }

  var api = { SENSORS: SENSORS, readHouse: readHouse, deviceWatts: deviceWatts, flowSeconds: flowSeconds, histKwh: histKwh, fmtN: fmtN, fmtW: fmtW, fmtUsd: fmtUsd, sourcesFromPrefs: sourcesFromPrefs, allIds: allIds, sumChange: sumChange, sumIds: sumIds, bucketTotals: bucketTotals, homeConsumption: homeConsumption, summarize: summarize, rangeWindow: rangeWindow, fmtKwh: fmtKwh };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------- UI ----
  var UI = g.OkieMotor.ui, CT = g.OkieMotor.controls, core = g.OkieMotor.core, h = UI.h;
  core.registerStrings('en', { 'app.energy': 'Energy Dashboard', 'e.today': 'Today', 'e.7d': '7 days', 'e.30d': '30 days', 'e.home': 'Home', 'e.grid_in': 'From grid', 'e.grid_out': 'To grid', 'e.solar': 'Solar', 'e.battery': 'Battery', 'e.now': 'Right now', 'e.self': 'Solar used at home', 'e.none': 'No energy sources are set up. Configure the Energy dashboard in Home Assistant first.', 'e.loading': 'Loading statistics…', 'e.chart': 'Consumption' });
  core.registerStrings('de', { 'app.energy': 'Energie Dashboard', 'e.today': 'Heute', 'e.7d': '7 Tage', 'e.30d': '30 Tage', 'e.home': 'Haus', 'e.grid_in': 'Netzbezug', 'e.grid_out': 'Einspeisung', 'e.solar': 'Solar', 'e.battery': 'Batterie', 'e.now': 'Gerade jetzt', 'e.self': 'Solar im Haus genutzt', 'e.none': 'Keine Energiequellen eingerichtet. Richte zuerst das Energie-Dashboard in Home Assistant ein.', 'e.loading': 'Statistiken werden geladen…', 'e.chart': 'Verbrauch' });
  core.registerStrings('en', {
    'e.tab_house': 'Home', 'e.tab_elec': 'Electricity', 'e.tab_server': 'Server', 'e.tab_devices': 'Devices', 'e.tab_grid': 'Grid',
    'e.srv_today': 'Server · today', 'e.home_avg': 'Home · avg / day', 'e.dev_today': 'Devices · today', 'e.lights_devices': 'Lights & devices', 'e.last_bill': 'Last bill', 'e.electricity': 'Electricity', 'e.server': 'Server',
    'e.avg': 'avg', 'e.per_mo': '/mo', 'e.n_on': '{n} on', 'e.nosensors': 'The home energy sensors are not set up here (sensor.energy_server_power, sensor.energy_last_bill, sensor.energy_devices and the TECO sensors). The Grid tab still shows the Home Assistant Energy dashboard.',
    'e.avg_draw': 'Average draw', 'e.per_day': 'per day', 'e.per_month': 'per month', 'e.daily': 'Daily usage, last {n} days on record (kWh)', 'e.daily_none': 'Daily usage from TECO is not available yet.', 'e.daily_wait': 'Loading daily usage…',
    'e.daily_note': 'TECO publishes daily numbers together with each bill, so this ends where your last bill ends.', 'e.latest_day': 'Latest day', 'e.highest': 'Highest', 'e.lowest': 'Lowest',
    'e.no_bill': 'No bill yet. Upload one in Settings, or connect the TECO Billing app.', 'e.bill': 'Last bill', 'e.days_n': '{n} days', 'e.kwh_day': 'kWh/day', 'e.average': 'average', 'e.avg_price': 'Average price',
    'e.cents_kwh': '{c}¢ per kWh, all charges', 'e.next_kwh': 'Next kWh costs', 'e.top_tier': '(top tier, riders and tax)', 'e.due': 'Due', 'e.source': 'Source', 'e.src_teco': 'your TECO account (updates itself)', 'e.src_upload': 'the bill you uploaded', 'e.per_bill': 'Usage per bill (kWh)',
    'e.now_w': 'now', 'e.today_k': 'today', 'e.per_month_c': 'per month', 'e.cost': 'Cost', 'e.cost_v': '{d} a day · {y} a year', 'e.price_used': 'Price used', 'e.cents_only': '{c}¢ per kWh', 'e.estimate_of': 'Estimate made of', 'e.up_for': 'Up for',
    'e.disk': 'Disk', 'e.memory': 'Memory', 'e.srv_unavail': 'The server sensors are not available right now.', 'e.containers': 'Containers', 'e.no_containers': 'The container list is not available yet.',
    'e.srv_note': 'Backups, restarts and the reboot stay on the Home energy card of your Overview dashboard.', 'e.dev_sum': '≈{w} now · {on} of {n} on', 'e.dev_est': '{k} today (est.)',
    'e.no_devices': 'No devices are set up yet. Add them in Settings → Lights & devices on the home page.', 'e.all_off': 'All off', 'e.all_off_done': 'Turned off {n}', 'e.already_off': 'Everything is already off.',
    'e.dev_note': 'Watts are estimates from the numbers you set (lights scale with brightness).', 'e.not_found': 'not found in Home Assistant', 'e.unavail': 'unavailable', 'e.off': 'off', 'e.failed': 'That did not work',
    'e.src_bill': 'uploaded bill', 'e.src_teco_avg': 'TECO account average', 'e.src_manual': 'typed by you',
  });
  core.registerStrings('de', {
    'e.tab_house': 'Haus', 'e.tab_elec': 'Strom', 'e.tab_server': 'Server', 'e.tab_devices': 'Geräte', 'e.tab_grid': 'Netz',
    'e.srv_today': 'Server · heute', 'e.home_avg': 'Haus · Ø pro Tag', 'e.dev_today': 'Geräte · heute', 'e.lights_devices': 'Lichter & Geräte', 'e.last_bill': 'Letzte Rechnung', 'e.electricity': 'Strom', 'e.server': 'Server',
    'e.avg': 'Ø', 'e.per_mo': '/Monat', 'e.n_on': '{n} an', 'e.nosensors': 'Die Haus-Energie-Sensoren sind hier nicht eingerichtet (sensor.energy_server_power, sensor.energy_last_bill, sensor.energy_devices und die TECO-Sensoren). Der Reiter Netz zeigt weiter das Energie-Dashboard von Home Assistant.',
    'e.avg_draw': 'Durchschnittliche Leistung', 'e.per_day': 'pro Tag', 'e.per_month': 'pro Monat', 'e.daily': 'Tagesverbrauch, letzte {n} Tage (kWh)', 'e.daily_none': 'Der Tagesverbrauch von TECO ist noch nicht verfügbar.', 'e.daily_wait': 'Lädt den Tagesverbrauch…',
    'e.daily_note': 'TECO veröffentlicht die Tageswerte zusammen mit jeder Rechnung, deshalb endet das hier, wo deine letzte Rechnung endet.', 'e.latest_day': 'Letzter Tag', 'e.highest': 'Höchster', 'e.lowest': 'Niedrigster',
    'e.no_bill': 'Noch keine Rechnung. Lade eine in den Einstellungen hoch oder verbinde die TECO-Billing-App.', 'e.bill': 'Letzte Rechnung', 'e.days_n': '{n} Tage', 'e.kwh_day': 'kWh/Tag', 'e.average': 'Durchschnitt', 'e.avg_price': 'Durchschnittspreis',
    'e.cents_kwh': '{c} ¢ pro kWh, alle Kosten', 'e.next_kwh': 'Die nächste kWh kostet', 'e.top_tier': '(oberste Stufe, Zuschläge und Steuer)', 'e.due': 'Fällig', 'e.source': 'Quelle', 'e.src_teco': 'dein TECO-Konto (aktualisiert sich selbst)', 'e.src_upload': 'die hochgeladene Rechnung', 'e.per_bill': 'Verbrauch pro Rechnung (kWh)',
    'e.now_w': 'jetzt', 'e.today_k': 'heute', 'e.per_month_c': 'pro Monat', 'e.cost': 'Kosten', 'e.cost_v': '{d} am Tag · {y} im Jahr', 'e.price_used': 'Verwendeter Preis', 'e.cents_only': '{c} ¢ pro kWh', 'e.estimate_of': 'Schätzung aus', 'e.up_for': 'Läuft seit',
    'e.disk': 'Festplatte', 'e.memory': 'Speicher', 'e.srv_unavail': 'Die Server-Sensoren sind gerade nicht verfügbar.', 'e.containers': 'Container', 'e.no_containers': 'Die Containerliste ist noch nicht verfügbar.',
    'e.srv_note': 'Backups, Neustarts und der Server-Reboot bleiben auf der Haus-Energie-Karte deines Overview-Dashboards.', 'e.dev_sum': '≈{w} jetzt · {on} von {n} an', 'e.dev_est': '{k} heute (geschätzt)',
    'e.no_devices': 'Es sind noch keine Geräte eingerichtet. Füge sie auf der Startseite unter Einstellungen → Lichter & Geräte hinzu.', 'e.all_off': 'Alle aus', 'e.all_off_done': '{n} ausgeschaltet', 'e.already_off': 'Alles ist schon aus.',
    'e.dev_note': 'Watt sind Schätzungen aus den Werten, die du eingestellt hast (Lichter skalieren mit der Helligkeit).', 'e.not_found': 'in Home Assistant nicht gefunden', 'e.unavail': 'nicht verfügbar', 'e.off': 'aus', 'e.failed': 'Das hat nicht geklappt',
    'e.src_bill': 'hochgeladene Rechnung', 'e.src_teco_avg': 'Durchschnitt des TECO-Kontos', 'e.src_manual': 'von dir eingegeben',
  });

  function barChart(points, win, de) {
    var W = 640, H = 200, pad = { l: 36, r: 8, t: 8, b: 24 };
    var max = Math.max.apply(null, points.map(function (p) { return p.v; }).concat([0.1]));
    var ax = L.niceTicks(0, max, 4), bw = (W - pad.l - pad.r) / Math.max(1, (win.end - win.start) / (win.period === 'hour' ? 3600000 : DAY));
    var grid = ax.ticks.map(function (v) { var y = H - pad.b - v / ax.max * (H - pad.t - pad.b); return '<line x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '" stroke="rgba(255,255,255,.1)"/><text x="' + (pad.l - 6) + '" y="' + (y + 4) + '" text-anchor="end" fill="rgba(244,241,237,.55)" font-size="11">' + v + '</text>'; }).join('');
    var bars = points.map(function (p) {
      var x = pad.l + (p.t - win.start) / (win.period === 'hour' ? 3600000 : DAY) * bw, hh = p.v / ax.max * (H - pad.t - pad.b);
      return '<rect x="' + (x + 1) + '" y="' + (H - pad.b - hh) + '" width="' + Math.max(1, bw - 2) + '" height="' + Math.max(0, hh) + '" rx="2" fill="#f5a30b" opacity=".9"><title>' + (Math.round(p.v * 100) / 100) + ' kWh</title></rect>';
    }).join('');
    var step = win.period === 'hour' ? 6 : (win.end - win.start) / DAY > 10 ? 7 : 1, labels = '';
    for (var i = 0; i < (win.end - win.start) / (win.period === 'hour' ? 3600000 : DAY); i += step) {
      var tt = win.start + i * (win.period === 'hour' ? 3600000 : DAY);
      labels += '<text x="' + (pad.l + i * bw + bw / 2) + '" y="' + (H - 6) + '" text-anchor="middle" fill="rgba(244,241,237,.55)" font-size="11">' + (win.period === 'hour' ? new Date(tt).getHours() + ':00' : new Date(tt).getDate()) + '</text>';
    }
    var el = h('div.chart'); el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="chart-svg">' + grid + bars + labels + '</svg>'; return el;
  }

  /** The Grid tab: Home Assistant's own Energy dashboard (grid, solar, battery, home) for today, 7 and 30 days. */
  function renderGrid(ctx, body, refresh) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, de = ctx.lang() === 'de';
    var range = ctx.store.get('energy.range', 'today'), token = 0, disposed = false;
    var seg = CT.createSegment({ options: ['today', '7d', '30d'].map(function (r) { return { id: r, label: t('e.' + r) }; }), value: range, ariaLabel: t('app.energy'), onChange: function (r) { range = r; ctx.store.set('energy.range', r); load(); } });
    body.innerHTML = ''; body.appendChild(h('div.hhead', { style: { marginBottom: '12px' } }, seg.el));
    var holder = h('div.eh-gridbody'); body.appendChild(holder);
    function card(label, value, sub) { return h('div.stat', null, h('div.stat-v', null, value), h('div.stat-l', null, label), sub ? h('div.stat-l', null, sub) : null); }
    function load() {
      var my = ++token; holder.innerHTML = ''; holder.appendChild(h('div.note-l', null, t('e.loading')));
      Promise.resolve(ctx.callWS({ type: 'energy/get_prefs' })).then(function (prefs) {
        var src = sourcesFromPrefs(prefs), ids = allIds(src);
        if (!ids.length) { holder.innerHTML = ''; holder.appendChild(h('div.note-l', null, t('e.none'))); return; }
        var win = rangeWindow(range, Date.now());
        return Promise.resolve(ctx.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(win.start).toISOString(), end_time: new Date(win.end).toISOString(), statistic_ids: ids, period: win.period, types: ['change'] })).then(function (stats) {
          if (my !== token || disposed) return;
          var sm = summarize(stats, src); holder.innerHTML = '';
          var live = ctx.settings.get().power_entity && ctx.state(ctx.settings.get().power_entity);
          if (live) holder.appendChild(h('div.stat', { style: { marginBottom: '10px' } }, h('div.stat-v', null, live.state + ' ' + (live.attributes.unit_of_measurement || '')), h('div.stat-l', null, t('e.now'))));
          var cards = h('div.cards.c4');
          cards.appendChild(card(t('e.home'), fmtKwh(sm.home, de)));
          cards.appendChild(card(t('e.grid_in'), fmtKwh(sm.gridIn, de), sm.gridOut ? t('e.grid_out') + ' ' + fmtKwh(sm.gridOut, de) : ''));
          if (src.solar.length) cards.appendChild(card(t('e.solar'), fmtKwh(sm.solar, de), Math.round(sm.selfUse * 100) + '% ' + t('e.self')));
          if (src.batteryIn.length || src.batteryOut.length) cards.appendChild(card(t('e.battery'), fmtKwh(sm.batteryOut, de), '↑ ' + fmtKwh(sm.batteryIn, de)));
          holder.appendChild(cards);
          // chart: derived home consumption per bucket
          var per = {}; [['gridIn', src.gridIn], ['gridOut', src.gridOut], ['solar', src.solar], ['batteryIn', src.batteryIn], ['batteryOut', src.batteryOut]].forEach(function (kv) { per[kv[0]] = bucketTotals(stats, kv[1]); });
          var all = new Map(); Object.keys(per).forEach(function (k) { per[k].forEach(function (p) { var o = all.get(p.t) || { gridIn: 0, gridOut: 0, solar: 0, batteryIn: 0, batteryOut: 0 }; o[k] = p.v; all.set(p.t, o); }); });
          var points = Array.from(all.entries()).sort(function (a, b) { return a[0] - b[0]; }).map(function (e) { return { t: e[0], v: homeConsumption(e[1]) }; });
          holder.appendChild(h('div.lbl', { style: { margin: '14px 0 6px' } }, t('e.chart')));
          holder.appendChild(barChart(points, win, de));
          if (refresh) refresh();
        });
      }).catch(function () { holder.innerHTML = ''; holder.appendChild(h('div.note-l', null, t('e.none'))); });
    }
    load();
    return { dispose: function () { disposed = true; } };
  }

  // ---------------------------------------------------------- the House tab ----
  // The isometric house of the Home Energy card of the Overview, drawn the same way (cream card, black outline), reading the same sensors.
  var INK = 'var(--eh-ink,rgba(255,255,255,.92))', PAPER = 'var(--eh-paper,#2b2622)', MUTED = 'var(--eh-muted,rgba(255,255,255,.6))', YELLOW = 'var(--eh-yellow,#ffd84a)', WHITE = 'var(--eh-white,rgba(255,255,255,.28))', HOVER = 'var(--eh-hover,rgba(255,255,255,.07))',
    SOFT = 'var(--eh-soft,rgba(255,255,255,.1))', SOFT2 = 'var(--eh-soft2,rgba(255,255,255,.17))', WIN = 'var(--eh-win,rgba(255,255,255,.05))', DARK = 'var(--eh-dark,#1c1a18)';
  var C30 = Math.cos(Math.PI / 6), S30 = Math.sin(Math.PI / 6);
  function P(o, x, y, z) { return [o.x + (x - y) * C30 * o.s, o.y + (x + y) * S30 * o.s - z * o.s]; }
  function pts(o, list) { return list.map(function (p) { var q = P(o, p[0], p[1], p[2]); return q[0].toFixed(1) + ',' + q[1].toFixed(1); }).join(' '); }
  function poly(o, list, fill, extra) { return '<polygon points="' + pts(o, list) + '" fill="' + fill + '" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round" ' + (extra || '') + '/>'; }
  function line(o, a, b, w, col, extra) { var p = P(o, a[0], a[1], a[2]), q = P(o, b[0], b[1], b[2]); return '<line x1="' + p[0].toFixed(1) + '" y1="' + p[1].toFixed(1) + '" x2="' + q[0].toFixed(1) + '" y2="' + q[1].toFixed(1) + '" stroke="' + (col || INK) + '" stroke-width="' + (w || 2) + '" stroke-linecap="round" ' + (extra || '') + '/>'; }
  function box(o, x, y, z, w, d, hh, top, left, right) {
    return poly(o, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + hh], [x, y + d, z + hh]], left) + poly(o, [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + hh], [x + w, y, z + hh]], right) +
      poly(o, [[x, y, z + hh], [x + w, y, z + hh], [x + w, y + d, z + hh], [x, y + d, z + hh]], top);
  }
  function quadR(o, x, y0, y1, z0, z1, fill, k) { return poly(o, [[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], fill, k ? 'data-k="' + k + '"' : ''); }
  function quadL(o, y, x0, x1, z0, z1, fill, k) { return poly(o, [[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill, k ? 'data-k="' + k + '"' : ''); }
  var TILE_ICON = {
    bolt: '<path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z"/>',
    server: '<rect x="3" y="3" width="18" height="7" rx="1.5"/><rect x="3" y="14" width="18" height="7" rx="1.5"/><circle cx="7" cy="6.5" r="1" fill="' + PAPER + '"/><circle cx="7" cy="17.5" r="1" fill="' + PAPER + '"/>',
    bulb: '<path d="M12 2a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z"/><rect x="9" y="19.5" width="6" height="2.5" rx="1"/>',
    bill: '<path d="M6 2h12a1 1 0 0 1 1 1v19l-3-2-3 2-3-2-3 2V3a1 1 0 0 1 1-1z"/><rect x="8.5" y="6" width="7" height="1.6" fill="' + PAPER + '"/><rect x="8.5" y="10" width="7" height="1.6" fill="' + PAPER + '"/><rect x="8.5" y="14" width="4" height="1.6" fill="' + PAPER + '"/>',
  };
  function tileIcon(name) { return '<svg viewBox="0 0 24 24" width="26" height="26" fill="' + INK + '" style="opacity:.68">' + TILE_ICON[name] + '</svg>'; }

  function scene() {
    // viewBox 520 x 366; the three text columns above start at x = 0, 173 and 347
    var o = { x: 238, y: 86, s: 34 }, s = '';
    s += poly(o, [[-1.4, -0.6, 0], [8.8, -0.6, 0], [8.8, 6.6, 0], [-1.4, 6.6, 0]], HOVER, 'stroke-opacity="0"');
    s += box(o, 0, 0.6, 0, 3, 4, 1.9, WHITE, SOFT, SOFT2);                                                       // garage
    s += quadL(o, 4.6, 0.35, 2.65, 0.05, 1.45, WHITE);
    for (var i = 1; i < 4; i++) s += line(o, [0.35, 4.6, 0.05 + i * 0.35], [2.65, 4.6, 0.05 + i * 0.35], 1, INK, 'opacity=".45"');
    s += box(o, 3, 0, 0, 5, 4.6, 2.8, WHITE, SOFT, SOFT2);                                                       // house
    var rh = 1.5;
    s += poly(o, [[3, 4.6, 2.8], [8, 4.6, 2.8], [8, 2.3, 2.8 + rh], [3, 2.3, 2.8 + rh]], DARK);
    s += poly(o, [[8, 0, 2.8], [8, 4.6, 2.8], [8, 2.3, 2.8 + rh]], SOFT2);
    for (var r = 1; r < 5; r++) s += line(o, [3 + r, 4.6, 2.8], [3 + r, 2.3, 2.8 + rh], 1, INK, 'opacity=".28"');
    s += quadR(o, 8, 0.9, 3.7, 0.5, 2.3, WIN, 'win');                                                            // windows glow yellow while a lamp is on
    s += line(o, [8, 2.3, 0.5], [8, 2.3, 2.3], 2); s += line(o, [8, 0.9, 1.4], [8, 3.7, 1.4], 2);
    s += quadL(o, 4.6, 3.75, 5.15, 0.9, 2.1, WIN, 'win2'); s += quadL(o, 4.6, 6.2, 7.6, 0.9, 2.1, WIN, 'win3'); s += quadL(o, 4.6, 5.4, 5.95, 0.05, 1.7, DARK);
    var hub = P(o, 3.4, 4.6, 2.3), pb = P(o, -1.0, 4.6, 0), pt = P(o, -1.0, 4.6, 4.0);                              // the grid pole and its wire
    s += '<line x1="' + pb[0] + '" y1="' + pb[1] + '" x2="' + pt[0] + '" y2="' + pt[1] + '" stroke="' + INK + '" stroke-width="3.5" stroke-linecap="round"/>';
    s += line(o, [-1.0, 3.9, 3.7], [-1.0, 5.3, 3.7], 3.5, INK);
    var sv = { x: 0.3, y: 5.5 };                                                                                  // the server cabinet in front of the garage
    s += '<g class="eh-hit" data-open="server" tabindex="0" role="button" aria-label="Server">';
    s += box(o, sv.x, sv.y, 0, 1.1, 0.9, 1.3, WHITE, SOFT, SOFT2);
    s += quadL(o, sv.y + 0.9, sv.x + 0.12, sv.x + 0.98, 0.75, 1.02, WHITE); s += quadL(o, sv.y + 0.9, sv.x + 0.12, sv.x + 0.98, 0.32, 0.6, WHITE);
    var l1 = P(o, sv.x + 0.25, sv.y + 0.9, 0.885), l2 = P(o, sv.x + 0.25, sv.y + 0.9, 0.46);
    s += '<circle class="eh-led" cx="' + l1[0] + '" cy="' + l1[1] + '" r="2.2" fill="' + INK + '"/><circle class="eh-led" style="animation-delay:.7s" cx="' + l2[0] + '" cy="' + l2[1] + '" r="2.2" fill="' + INK + '"/>';
    s += '</g>';
    function d(list) { return 'M' + list.map(function (q) { var v = P(o, q[0], q[1], q[2]); return v[0].toFixed(1) + ' ' + v[1].toFixed(1); }).join(' L'); }
    var lp = { x: 8.2, y: 5.95 };
    var wire = d([[-1.0, 4.6, 3.7], [3.4, 4.6, 2.3]]), down = d([[3.4, 4.6, 2.3], [3.4, 4.6, 0.05], [3.4, 5.95, 0.05]]), toServer = d([[3.4, 5.95, 0.05], [1.4, 5.95, 0.05]]), toLamp = d([[3.4, 5.95, 0.05], [lp.x, lp.y, 0.05]]);
    s += '<path class="eh-base" d="' + wire + '"/><path class="eh-base" d="' + down + '"/><path class="eh-base" d="' + toServer + '"/><path class="eh-base" d="' + toLamp + '"/>';
    s += '<path data-k="fGrid" class="eh-pulse" d="' + wire + '"/><path data-k="fDown" class="eh-pulse" d="' + down + '"/><path data-k="fServer" class="eh-pulse" d="' + toServer + '"/><path data-k="fLamp" class="eh-pulse y" d="' + toLamp + '"/>';
    var lb = P(o, lp.x, lp.y, 0), lt = P(o, lp.x, lp.y, 2.0);                                                     // the floor lamp at the end of the line
    s += '<g class="eh-hit" data-open="devices" tabindex="0" role="button" aria-label="Lights and devices">';
    s += '<line x1="' + lb[0] + '" y1="' + lb[1] + '" x2="' + lt[0] + '" y2="' + lt[1] + '" stroke="' + INK + '" stroke-width="3" stroke-linecap="round"/>';
    s += '<ellipse cx="' + lb[0] + '" cy="' + lb[1] + '" rx="10" ry="4.5" fill="' + WHITE + '" stroke="' + INK + '" stroke-width="2"/>';
    s += '<path data-k="shade" d="M' + (lt[0] - 14) + ' ' + (lt[1] + 4) + ' L' + (lt[0] - 8) + ' ' + (lt[1] - 15) + ' L' + (lt[0] + 8) + ' ' + (lt[1] - 15) + ' L' + (lt[0] + 14) + ' ' + (lt[1] + 4) + ' Z" fill="' + WHITE + '" stroke="' + INK + '" stroke-width="2" stroke-linejoin="round"/>';
    s += '</g>';
    s += '<g class="eh-hit" data-open="home" tabindex="0" role="button" aria-label="Electricity">';                // the badge on the meter
    s += '<circle cx="' + hub[0] + '" cy="' + hub[1] + '" r="13" fill="' + PAPER + '" stroke="' + INK + '" stroke-width="2"/><g transform="translate(' + (hub[0] - 8) + ' ' + (hub[1] - 8) + ') scale(.67)"><path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" fill="' + INK + '"/></g>';
    s += '</g>';
    var serverTop = P(o, sv.x + 0.55, sv.y + 0.45, 1.3), lampTop = [lt[0], lt[1] - 15];                           // leaders from each number column down to the thing it describes
    function leader(x0, target, gap) { return '<path class="eh-leader" d="M' + x0 + ' 0 V' + (target[1] - gap).toFixed(1) + ' H' + (target[0] - (target[0] > x0 ? 3 : -3)).toFixed(1) + '" fill="none"/><circle cx="' + target[0].toFixed(1) + '" cy="' + (target[1] - gap).toFixed(1) + '" r="2.6" fill="' + INK + '" opacity=".55"/>'; }
    s += leader(6, serverTop, 6) + leader(179, [hub[0], hub[1] - 15], 0) + leader(353, lampTop, 6);
    return '<svg class="eh-scene" viewBox="0 0 520 366" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Home energy">' + s + '</svg>';
  }
  var esc = function (v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  function shortDate(iso, lang) { try { return new Date(iso + 'T12:00:00').toLocaleDateString(lang === 'de' ? 'de-DE' : 'en-US', { month: 'short', day: 'numeric' }); } catch (e) { return iso; } }

  /** The House tab: three headline numbers, the house with its flow lines, four tiles. A tap on a number, a tile or a part of the house opens the tab that tells more (go). */
  function houseTab(ctx, body, go) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, de = ctx.lang() === 'de';
    var hist = null, histAt = 0, histBusy = false, disposed = false;
    body.innerHTML = '';
    if (!readHouse(ctx.hass().states).has) { body.appendChild(h('div.note-l', null, t('e.nosensors'))); return { update: function () {}, dispose: function () {} }; }
    var card = h('div.eh-card');
    card.innerHTML = '<div class="eh-wrap"><div class="eh-top">' +
      '<div class="eh-stat" data-open="server" tabindex="0" role="button"><div class="n" data-k="nServer">—</div><div class="l">' + esc(t('e.srv_today')) + '</div></div>' +
      '<div class="eh-stat" data-open="home" tabindex="0" role="button"><div class="n" data-k="nHome">—</div><div class="l">' + esc(t('e.home_avg')) + '</div></div>' +
      '<div class="eh-stat" data-open="devices" tabindex="0" role="button"><div class="n" data-k="nDev">—</div><div class="l">' + esc(t('e.dev_today')) + '</div></div></div>' +
      scene() + '<div class="eh-tiles">' +
      '<div class="eh-tile" data-open="home" tabindex="0" role="button">' + tileIcon('bolt') + '<div><div class="t">' + esc(t('e.electricity')) + '</div><div class="s" data-k="tHome">—</div></div></div>' +
      '<div class="eh-tile" data-open="server" tabindex="0" role="button">' + tileIcon('server') + '<div><div class="t">' + esc(t('e.server')) + '</div><div class="s" data-k="tServer">—</div></div></div>' +
      '<div class="eh-tile" data-open="devices" tabindex="0" role="button">' + tileIcon('bulb') + '<div><div class="t">' + esc(t('e.lights_devices')) + '</div><div class="s" data-k="tDev">—</div></div></div>' +
      '<div class="eh-tile" data-open="bill" tabindex="0" role="button">' + tileIcon('bill') + '<div><div class="t">' + esc(t('e.last_bill')) + '</div><div class="s" data-k="tBill">—</div></div></div>' +
      '</div></div>';
    body.appendChild(card);
    var $ = function (k) { return card.querySelector('[data-k="' + k + '"]'); };
    var open = function (e) { var el = e.target && e.target.closest ? e.target.closest('[data-open]') : null; if (el) { e.preventDefault(); if (ctx.haptic) ctx.haptic(8); go(el.getAttribute('data-open')); } };
    card.addEventListener('click', open);
    card.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') open(e); });
    var kwhHtml = function (v) { return v == null || isNaN(v) ? '—' : fmtN(v, de) + '<span class="u"> kWh</span>'; };
    function flow(k, w, max) { var el = $(k); if (!el) return; var sec = flowSeconds(w, max); el.classList.toggle('off', sec == null); if (sec != null) el.style.setProperty('--dur', sec.toFixed(2) + 's'); }
    function maybeHistory(list) {
      var now = Date.now(); if (histBusy || now - histAt < 300000 || !list.length || !ctx.callWS) return;
      histBusy = true; histAt = now; var start = new Date(); start.setHours(0, 0, 0, 0);
      Promise.resolve(ctx.callWS({ type: 'history/history_during_period', start_time: start.toISOString(), end_time: new Date().toISOString(), entity_ids: list.map(function (d) { return d.entity; }), include_start_time_state: true, significant_changes_only: false, minimal_response: false, no_attributes: false }))
        .then(function (res) { histBusy = false; if (disposed) return; hist = histKwh(list, res, start.getTime() / 1000, Date.now() / 1000); paint(); }, function () { histBusy = false; });
    }
    function paint() {
      var H = readHouse(ctx.hass().states), b = H.bill;
      $('nServer').innerHTML = kwhHtml(H.serverKwh); $('nHome').innerHTML = kwhHtml(H.homeKwhDay); $('nDev').innerHTML = kwhHtml(hist);
      $('tHome').innerHTML = H.homeW == null ? '—' : '≈' + esc(fmtW(H.homeW, de)) + ' <small>' + esc(t('e.avg')) + '</small>';
      $('tServer').innerHTML = H.serverW == null ? '—' : '≈' + esc(fmtW(H.serverW, de)) + (H.serverCost != null ? ' <small>' + esc(fmtUsd(H.serverCost)) + esc(t('e.per_mo')) + '</small>' : '');
      $('tDev').innerHTML = H.hasDevices ? '≈' + esc(fmtW(H.dev.w, de)) + ' <small>' + esc(t('e.n_on', { n: H.dev.on })) + '</small>' : '—';
      $('tBill').innerHTML = !b ? '—' : esc(fmtUsd(b.total)) + ' <small>' + (b.kwh ? Math.round(b.kwh).toLocaleString(de ? 'de-DE' : 'en-US') + ' kWh' : '') + '</small>';
      var lit = H.dev.lights > 0; card.classList.toggle('lit', lit);
      ['win', 'win2', 'win3'].forEach(function (k) { var e = $(k); if (e) e.setAttribute('fill', lit ? YELLOW : WIN); });
      var sh = $('shade'); if (sh) sh.setAttribute('fill', lit ? YELLOW : WHITE);
      var homeW = H.homeW != null ? H.homeW : 0, srvW = H.serverW || 0;
      flow('fGrid', Math.max(homeW, srvW + H.dev.w), Math.max(homeW, 500)); flow('fDown', Math.max(homeW, srvW + H.dev.w), Math.max(homeW, 500)); flow('fServer', srvW, 40); flow('fLamp', H.dev.w, 150);
      maybeHistory(H.devices);
    }
    paint();
    return { update: paint, dispose: function () { disposed = true; } };
  }

  // ---------------------------------------------------------- shared pieces ----
  function statCards(items) { var c = h('div.cards.c4'); items.forEach(function (x) { c.appendChild(h('div.stat', null, h('div.stat-v', { html: x[0] }), h('div.stat-l', null, x[1]))); }); return c; }
  function kvTable(rows) { var t = h('div.eh-kv'); rows.forEach(function (r) { if (r) t.appendChild(h('div.eh-kvr', null, h('span.k', null, r[0]), h('span.v', { html: r[1] }))); }); return t; }
  /** Little bar chart with a label under each bar (the usage of each bill). The last bar is the newest. */
  function labelBars(vals, labels, titles) {
    var w = 520, hh = 120, top = 8, bottom = 22, n = vals.length, max = Math.max.apply(null, vals) || 1, bw = w / n, gap = Math.min(6, bw * 0.25), out = '';
    vals.forEach(function (v, i) {
      var bh = Math.max(2, (hh - top - bottom) * v / max), x = i * bw + gap / 2;
      out += '<g><title>' + esc(titles[i] || '') + '</title><rect x="' + x.toFixed(1) + '" y="' + (hh - bottom - bh).toFixed(1) + '" width="' + (bw - gap).toFixed(1) + '" height="' + bh.toFixed(1) + '" rx="3" fill="' + (i === n - 1 ? '#f5a30b' : 'rgba(255,255,255,.3)') + '"/></g>';
      if (labels[i]) out += '<text x="' + (x + (bw - gap) / 2).toFixed(1) + '" y="' + (hh - 6) + '" text-anchor="middle" font-size="10" fill="rgba(244,241,237,.6)">' + esc(labels[i]) + '</text>';
    });
    var el = h('div.eh-bars'); el.innerHTML = '<svg viewBox="0 0 520 ' + hh + '" role="img">' + out + '</svg>'; return el;
  }

  // ------------------------------------------------------ the Electricity tab ----
  function elecTab(ctx, body, focus) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, de = ctx.lang() === 'de', disposed = false, daily;
    var H = readHouse(ctx.hass().states), b = H.bill;
    function draw() {
      if (disposed) return; body.innerHTML = '';
      if (H.homeW == null && !b) { body.appendChild(h('div.note-l', null, t('e.no_bill'))); return; }
      if (H.homeW != null) body.appendChild(statCards([['≈' + esc(fmtW(H.homeW, de)), t('e.avg_draw')], [fmtN(H.homeW * 24 / 1000, de) + '<small> kWh</small>', t('e.per_day')], [Math.round(H.homeW * 24 * 30 / 1000).toLocaleString(de ? 'de-DE' : 'en-US') + '<small> kWh</small>', t('e.per_month')]]));
      if (daily === undefined) body.appendChild(h('div.note-l', null, t('e.daily_wait')));
      else if (!daily || !daily.length) body.appendChild(h('div.note-l', null, t('e.daily_none')));
      else {
        var vals = daily.map(function (x) { return x.change; }), max = Math.max.apply(null, vals), min = Math.min.apply(null, vals), lab = function (x) { return new Date(x.start).toLocaleDateString(de ? 'de-DE' : 'en-US', { month: 'short', day: 'numeric' }); };
        body.appendChild(h('div.lbl', { style: { margin: '14px 0 6px' } }, t('e.daily', { n: daily.length })));
        body.appendChild(barChart(daily.map(function (x) { return { t: x.start, v: x.change }; }), { start: daily[0].start, end: daily[daily.length - 1].start + DAY, period: 'day' }, de));
        body.appendChild(kvTable([[t('e.latest_day'), esc(lab(daily[daily.length - 1])) + ' · ' + fmtN(vals[vals.length - 1], de) + ' kWh'], [t('e.highest'), fmtN(max, de) + ' kWh'], [t('e.lowest'), fmtN(min, de) + ' kWh']]));
        body.appendChild(h('div.note-l', null, t('e.daily_note')));
      }
      var billBox = h('div.eh-billbox', { dataset: { sec: 'bill' } });
      billBox.appendChild(h('div.lbl', { style: { margin: '18px 0 6px' } }, t('e.bill')));
      if (!b) billBox.appendChild(h('div.note-l', null, t('e.no_bill')));
      else {
        var span = b.start && b.end ? shortDate(b.start, ctx.lang()) + ' – ' + shortDate(b.end, ctx.lang()) : t('e.bill');
        billBox.appendChild(statCards([[esc(fmtUsd(b.total)), span], [b.kwh ? Math.round(b.kwh).toLocaleString(de ? 'de-DE' : 'en-US') + '<small> kWh</small>' : '—', b.days ? t('e.days_n', { n: b.days }) : ''], [b.kwh && b.days ? fmtN(b.kwh / b.days, de) + '<small> ' + esc(t('e.kwh_day')) + '</small>' : '—', t('e.average')]]));
        billBox.appendChild(kvTable([[t('e.avg_price'), b.rateCents != null ? esc(t('e.cents_kwh', { c: b.rateCents.toFixed(2) })) : '—'], b.marginalCents ? [t('e.next_kwh'), Number(b.marginalCents).toFixed(2) + '¢ <span class="m">' + esc(t('e.top_tier')) + '</span>'] : null, b.due ? [t('e.due'), esc(shortDate(b.due, ctx.lang()))] : null, [t('e.source'), esc(t(b.teco ? 'e.src_teco' : 'e.src_upload'))]]));
        if (b.history.length > 1) {
          billBox.appendChild(h('div.lbl', { style: { margin: '14px 0 6px' } }, t('e.per_bill')));
          billBox.appendChild(labelBars(b.history.map(function (x) { return x.kwh; }), b.history.map(function (x) { return shortDate(x.period_end, ctx.lang()).split(' ')[0]; }), b.history.map(function (x) { return shortDate(x.period_end, ctx.lang()) + ': ' + Math.round(x.kwh).toLocaleString('en-US') + ' kWh, ' + fmtUsd(x.total); })));
          billBox.appendChild(kvTable(b.history.slice().reverse().slice(0, 6).map(function (x) { return [esc(shortDate(x.period_end, ctx.lang())), Math.round(x.kwh).toLocaleString(de ? 'de-DE' : 'en-US') + ' kWh · ' + esc(fmtUsd(x.total))]; })));
        }
      }
      body.appendChild(billBox);
      if (focus === 'bill') requestAnimationFrame(function () { try { billBox.scrollIntoView({ block: 'start' }); } catch (e) { /* no scrolling */ } focus = null; });
    }
    draw();
    if (ctx.callWS) Promise.resolve(ctx.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(Date.now() - 60 * DAY).toISOString(), statistic_ids: ['teco:energy_consumption'], period: 'day', types: ['change'] }))
      .then(function (r) { daily = ((r && r['teco:energy_consumption']) || []).filter(function (x) { return x.change != null; }).slice(-30); draw(); }, function () { daily = null; draw(); });
    else daily = null;
    return { update: function () {}, dispose: function () { disposed = true; } };
  }

  // ---------------------------------------------------------- the Server tab ----
  function serverTab(ctx, body) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, de = ctx.lang() === 'de', sig = '';
    var SRC = { teco: 'e.src_teco_avg', bill: 'e.src_bill', manual: 'e.src_manual' };
    function draw() {
      var H = readHouse(ctx.hass().states), a = H.serverAttr, sys = a.system || {}, next = JSON.stringify([H.serverW, a, H.containers]);
      if (next === sig) return; sig = next; body.innerHTML = '';
      if (H.serverW == null) body.appendChild(h('div.note-l', null, t('e.srv_unavail')));
      else {
        body.appendChild(statCards([['≈' + esc(fmtW(H.serverW, de)), t('e.now_w')], [a.kwh_today != null ? fmtN(a.kwh_today, de) + '<small> kWh</small>' : '—', t('e.today_k')], [esc(fmtUsd(a.cost_per_month)), t('e.per_month_c')]]));
        body.appendChild(kvTable([
          [t('e.cost'), esc(t('e.cost_v', { d: fmtUsd(a.cost_per_day), y: fmtUsd(a.cost_per_year) }))],
          [t('e.price_used'), (a.price_cents != null ? esc(t('e.cents_only', { c: Number(a.price_cents).toFixed(2) })) : '—') + (SRC[a.price_source] ? ' <span class="m">(' + esc(t(SRC[a.price_source])) + ')</span>' : '')],
          [t('e.estimate_of'), 'CPU ' + (a.cpu_package_w != null ? a.cpu_package_w + ' W' : '—') + ' + ' + t('e.memory').toLowerCase() + ' ' + (a.dram_w != null ? a.dram_w + ' W' : '—') + (a.assumed_rest_of_system_w != null ? ' + ' + a.assumed_rest_of_system_w + ' W' : '')],
          [t('e.up_for'), sys.uptime_s != null ? Math.floor(sys.uptime_s / 86400) + ' d ' + Math.floor(sys.uptime_s % 86400 / 3600) + ' h' : '—'],
          [t('e.disk'), sys.disk_used_gb != null ? sys.disk_used_gb + ' / ' + sys.disk_total_gb + ' GB' : '—'],
          [t('e.memory'), (sys.mem_used_pct != null ? sys.mem_used_pct + '% / ' + sys.mem_total_gb + ' GB' : '—') + (sys.load1 != null ? ' · load ' + sys.load1 : '') + (sys.temp_c != null ? ' · ' + sys.temp_c + '°C' : '')],
        ]));
      }
      body.appendChild(h('div.lbl', { style: { margin: '18px 0 6px' } }, t('e.containers')));
      if (!H.containers || !H.containers.length) body.appendChild(h('div.note-l', null, t('e.no_containers')));
      else {
        var list = h('div.eh-cts');
        H.containers.forEach(function (c) { var up = c.state === 'running'; list.appendChild(h('div.eh-ct' + (up ? '.up' : '.down'), { dataset: { name: c.name } }, h('i'), h('b', null, c.name), h('span', null, String(c.status || c.state || '').replace(/^Up /, '').replace(/^Exited /, 'stopped ')))); });
        body.appendChild(list);
      }
      body.appendChild(h('div.note-l', null, t('e.srv_note')));
    }
    draw();
    return { update: draw, dispose: function () {} };
  }

  // --------------------------------------------------------- the Devices tab ----
  function devicesTab(ctx, body) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, de = ctx.lang() === 'de', key = '', rows = {}, summary = h('div.eh-sum'), dragging = null, disposed = false, hist = null;
    function call(domain, service, data) { return Promise.resolve(ctx.call(domain, service, data)).catch(function () { ctx.toast('error', t('e.failed')); }); }
    function build(list) {
      body.innerHTML = ''; rows = {}; body.appendChild(summary);
      if (!list.length) { body.appendChild(h('div.note-l', null, t('e.no_devices'))); return; }
      var box = h('div.eh-devs');
      list.forEach(function (d) {
        var light = d.kind === 'light', sub = h('div.ts-chips'), sw = h('button.sw', { type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': d.name });
        sw.onclick = function () { var on = !sw.classList.contains('on'); sw.classList.toggle('on', on); call(d.entity.split('.')[0], on ? 'turn_on' : 'turn_off', { entity_id: d.entity }); };
        var sl = null, pct = null;
        if (light) {
          sl = h('input.eh-range', { type: 'range', min: '1', max: '100', 'aria-label': d.name }); pct = h('span.eh-pct', null, '100%');
          sl.oninput = function () { dragging = d.entity; pct.textContent = sl.value + '%'; };
          sl.onchange = function () { dragging = null; call('light', 'turn_on', { entity_id: d.entity, brightness_pct: +sl.value }); };
        }
        var row = h('div.ts-row.eh-dev', { dataset: { entity: d.entity } }, h('span.ts-ic', { html: UI.icon(light ? 'bulb' : 'plug', 18) }), h('div.ts-main', null, h('div.ts-nm', null, d.name), sub), sw);
        var wrap = h('div.eh-devw', null, row); if (light) wrap.appendChild(h('div.eh-br', null, sl, pct));
        rows[d.entity] = { d: d, row: row, sub: sub, sw: sw, sl: sl, pct: pct, br: light ? wrap.lastChild : null }; box.appendChild(wrap);
      });
      body.appendChild(box);
      body.appendChild(h('div.vs-actions', null, h('button.act.eh-alloff', { type: 'button', onclick: function () {
        var on = list.filter(function (d) { var s = ctx.hass().states[d.entity]; return s && s.state === 'on'; }).map(function (d) { return d.entity; });
        if (!on.length) { ctx.toast('info', t('e.already_off')); return; }
        call('homeassistant', 'turn_off', { entity_id: on }).then(function () { ctx.toast('success', t('e.all_off_done', { n: on.length })); });
      } }, t('e.all_off'))));
      body.appendChild(h('div.note-l', null, t('e.dev_note')));
    }
    function paint() {
      if (disposed) return; var H = readHouse(ctx.hass().states), states = ctx.hass().states, k = H.devices.map(function (d) { return d.entity; }).join('|');
      if (k !== key) { key = k; build(H.devices); }
      Object.keys(rows).forEach(function (e) {
        var r = rows[e], st = states[e], avail = !!st && st.state !== 'unavailable' && st.state !== 'unknown', on = !!st && st.state === 'on', b = st && st.attributes && st.attributes.brightness, light = r.d.kind === 'light';
        var w = (Number(r.d.watts) || 0) * (light && b != null ? Math.max(0.1, b / 255) : 1);
        r.row.classList.toggle('off', !on); r.row.classList.toggle('na', !avail); r.sw.classList.toggle('on', on); r.sw.setAttribute('aria-checked', on ? 'true' : 'false'); r.sw.disabled = !avail;
        r.sub.textContent = !st ? t('e.not_found') : !avail ? t('e.unavail') : on ? (light && b != null ? Math.round(b / 2.55) + '% · ' : '') + '≈' + Math.round(w) + ' W' : t('e.off');
        if (r.br) { r.br.style.display = on && avail ? '' : 'none'; if (dragging !== e && b != null) { r.sl.value = String(Math.max(1, Math.round(b / 2.55))); r.pct.textContent = r.sl.value + '%'; } }
      });
      summary.textContent = t('e.dev_sum', { w: fmtW(H.dev.w, de), on: H.dev.on, n: H.devices.length }) + (hist != null ? ' · ' + t('e.dev_est', { k: fmtN(hist, de) + ' kWh' }) : '');
    }
    var start = new Date(); start.setHours(0, 0, 0, 0);
    var list0 = readHouse(ctx.hass().states).devices;
    if (list0.length && ctx.callWS) Promise.resolve(ctx.callWS({ type: 'history/history_during_period', start_time: start.toISOString(), end_time: new Date().toISOString(), entity_ids: list0.map(function (d) { return d.entity; }), include_start_time_state: true, significant_changes_only: false, minimal_response: false, no_attributes: false }))
      .then(function (res) { hist = histKwh(list0, res, start.getTime() / 1000, Date.now() / 1000); paint(); }, function () {});
    paint();
    return { update: paint, dispose: function () { disposed = true; } };
  }

  // -------------------------------------------------------------- the app ----
  function render(container, ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, inst = null, shell = null;
    var has = readHouse(ctx.hass().states).has, saved = ctx.store.get('energy.tab', has ? 'house' : 'grid');
    var defs = [['house', 'home', 'e.tab_house'], ['electricity', 'bolt', 'e.tab_elec'], ['server', 'server', 'e.tab_server'], ['devices', 'bulb', 'e.tab_devices'], ['grid', 'chart', 'e.tab_grid']];
    var tabs = defs.map(function (x) { return { id: x[0], icon: x[1], label: t(x[2]) }; }), focus = null;
    function go(target) { focus = target === 'bill' ? 'bill' : null; var id = target === 'home' || target === 'bill' ? 'electricity' : target; if (shell) shell.showTab(id); }
    shell = g.OkieMotor.appshell.create(container, ctx, { id: 'energy', title: t('app.energy'), subtitle: '', icon: 'bolt', gradient: ['#3a2a0a', '#b87a0f'], tabs: tabs, startTab: tabs.some(function (x) { return x.id === saved; }) ? saved : (has ? 'house' : 'grid'),
      onTab: function (id, body) {
        if (inst && inst.dispose) inst.dispose(); inst = null; if (id) ctx.store.set('energy.tab', id);
        var refresh = function () { if (shell) shell.refreshScroll(); };
        if (id === 'house') inst = houseTab(ctx, body, go);
        else if (id === 'electricity') { inst = elecTab(ctx, body, focus); focus = null; }
        else if (id === 'server') inst = serverTab(ctx, body);
        else if (id === 'devices') inst = devicesTab(ctx, body);
        else if (id === 'grid') inst = renderGrid(ctx, body, refresh);
      } });
    return { update: function () { if (inst && inst.update) inst.update(); }, dispose: function () { if (inst && inst.dispose) inst.dispose(); shell.dispose(); } };
  }
  g.OkieMotor.apps.register({ id: 'energy', nameKey: 'app.energy', name: 'Energy Dashboard', icon: 'bolt', color: '#f5a30b', order: 50, category: 'system', render: render });
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat(['.cards.c4{grid-template-columns:repeat(auto-fit,minmax(130px,1fr));}', [
    // the house card is glass like the other cards (it follows Card glass, Card blur and Card edge in Settings), drawn in white ink
    '.eh-card{--eh-ink:rgba(255,255,255,.92);--eh-paper:#2b2622;--eh-muted:rgba(255,255,255,.6);--eh-yellow:#ffd84a;--eh-line:rgba(255,255,255,.18);--eh-white:rgba(255,255,255,.28);--eh-hover:rgba(255,255,255,.07);--eh-dim:rgba(255,255,255,.78);--eh-soft:rgba(255,255,255,.1);--eh-soft2:rgba(255,255,255,.17);--eh-win:rgba(255,255,255,.05);--eh-dark:#1c1a18;--eh-line2:rgba(255,255,255,.2);',
    'container-type:inline-size;background:var(--okie-tile,rgba(255,255,255,.1));-webkit-backdrop-filter:var(--okie-card-bf,none);backdrop-filter:var(--okie-card-bf,none);box-shadow:var(--okie-card-edge,none);border:1px solid var(--glass-border-color,rgba(255,255,255,.2));border-radius:26px;padding:18px 18px 16px;box-sizing:border-box;color:var(--okie-text,#fff);max-width:640px;margin:0 auto;}',
    '.eh-wrap{max-width:560px;margin:0 auto;}.eh-top{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}',
    '.eh-stat .n{font-size:26px;font-weight:700;line-height:1.05;letter-spacing:-.3px;}.eh-stat .n .u{font-size:.52em;font-weight:700;letter-spacing:.5px;color:var(--eh-muted);}',
    '.eh-stat .l{margin-top:4px;font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--eh-muted);}',
    'svg.eh-scene{display:block;width:100%;height:auto;margin:4px 0 6px;}.eh-tiles{display:grid;grid-template-columns:1fr 1fr;gap:10px;}',
    '.eh-tile{display:flex;align-items:center;gap:12px;border:1px solid rgba(255,255,255,.22);border-radius:18px;padding:12px 14px;background:rgba(255,255,255,.07);min-width:0;transition:background .15s ease;}.eh-tile>div{min-width:0;}',
    '.eh-tile .t{font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;}.eh-tile .s{font-size:14px;color:var(--eh-dim);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.eh-tile .s small{color:var(--eh-muted);font-size:12px;}',
    '.eh-base{fill:none;stroke:var(--eh-line2);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;}',
    '.eh-pulse{fill:none;stroke:var(--eh-ink);stroke-width:4;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1 26;animation:eh-flow var(--dur,3s) linear infinite;}.eh-pulse.y{stroke:var(--eh-yellow);}.eh-pulse.off{opacity:0;}',
    '@keyframes eh-flow{to{stroke-dashoffset:-27}}.eh-led{animation:eh-blink 1.6s steps(2,start) infinite;}@keyframes eh-blink{50%{opacity:.25}}',
    '.eh-hit,.eh-stat[data-open],.eh-tile[data-open]{cursor:pointer;-webkit-tap-highlight-color:transparent;}.eh-hit:hover{opacity:.8;}.eh-tile[data-open]:hover{background:rgba(255,255,255,.14);}.eh-stat[data-open]:hover .n{text-decoration:underline;text-decoration-thickness:2px;}',
    '.eh-card [data-open]:focus-visible{outline:2px solid var(--eh-ink);outline-offset:2px;}.eh-card.lit [data-k="win"],.eh-card.lit [data-k="win2"],.eh-card.lit [data-k="win3"],.eh-card.lit [data-k="shade"]{filter:drop-shadow(0 0 7px rgba(255,216,74,.75));}.eh-stat .n{text-shadow:0 1px 10px rgba(0,0,0,.25);}.eh-leader{stroke:var(--eh-ink);stroke-width:1;opacity:.35;stroke-dasharray:2 3;}',
    '@media (prefers-reduced-motion:reduce){.eh-pulse,.eh-led{animation:none;}}',
    '@container (max-width:460px){.eh-stat .n{font-size:20px;}.eh-stat .l{font-size:10px;letter-spacing:1px;}.eh-tile{padding:10px;gap:8px;}.eh-tile svg{width:22px;height:22px;}.eh-tile .s{font-size:13px;white-space:normal;}.eh-tile .s small{display:block;}.eh-tile .t{font-size:11px;letter-spacing:1px;}}',
    // the other tabs use the glass of the rest of the app
    '.stat-v small{font-size:.55em;font-weight:600;opacity:.7;}',
    '.eh-kv{display:flex;flex-direction:column;margin:8px 0;border-radius:16px;background:rgba(255,255,255,.07);padding:2px 14px;}.eh-kvr{display:flex;gap:14px;justify-content:space-between;align-items:baseline;padding:10px 0;border-top:1px solid rgba(255,255,255,.1);font-size:14px;}.eh-kvr:first-child{border-top:0;}',
    '.eh-kvr .k{color:var(--okie-text-dim);font-size:13px;flex:none;max-width:42%;}.eh-kvr .v{text-align:right;min-width:0;}.eh-kvr .m{color:var(--okie-text-dim);font-size:12px;}',
    '.eh-bars svg{display:block;width:100%;height:auto;}.eh-bars{margin:6px 0;padding:8px 10px 2px;border-radius:16px;background:rgba(255,255,255,.07);}',
    '.eh-cts{display:flex;flex-direction:column;border-radius:16px;background:rgba(255,255,255,.07);padding:2px 14px;}.eh-ct{display:grid;grid-template-columns:14px 1fr auto;gap:10px;align-items:center;padding:10px 0;border-top:1px solid rgba(255,255,255,.1);font-size:14px;}.eh-ct:first-child{border-top:0;}',
    '.eh-ct i{width:10px;height:10px;border-radius:50%;background:#7a7a7a;display:block;}.eh-ct.up i{background:#34c759;}.eh-ct.down i{background:#ff6b61;}.eh-ct span{color:var(--okie-text-dim);font-size:12px;}',
    '.eh-sum{font-size:15px;margin:0 0 12px;font-weight:600;}.eh-devs{display:flex;flex-direction:column;gap:10px;}.eh-devw{display:flex;flex-direction:column;gap:6px;}.eh-dev{cursor:default;}.eh-dev.off .ts-chips,.eh-dev.na{opacity:.6;}',
    '.eh-br{display:flex;align-items:center;gap:12px;padding:0 6px 0 56px;}.eh-range{flex:1;min-width:0;accent-color:#f5a30b;}.eh-pct{width:44px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums;color:var(--okie-text-dim);}',
  ].join('\n')]);
  g.OkieMotor.energy = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

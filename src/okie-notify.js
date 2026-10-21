/* okie-notify: the island's message button, the notification center, toasts.
 *
 * Messages come from two places:
 *   - Home Assistant's own persistent notifications (websocket subscription)
 *   - alerts derived from live states (smoke, gas, water, tamper, open alarms,
 *     low batteries), so a safety problem shows up without any automation
 * The center filters by severity and by source and has a second tab, the house
 * chronicle ("Verlauf"). Quiet hours dim the info-level toasts.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var core = isNode ? require('./okie-core.js') : g.OkieMotor.core;
  var L = isNode ? require('./okie-logic.js') : g.OkieMotor.logic;

  // ------------------------------------------------------------ pure ----
  var SEVERITY = { critical: 3, warning: 2, info: 1 };
  var CRITICAL_CLASSES = { smoke: 1, gas: 1, carbon_monoxide: 1, safety: 1, tamper: 1, moisture: 1, fire: 1 };

  var T = {
    en: { smoke: 'Smoke detected', gas: 'Gas detected', carbon_monoxide: 'Carbon monoxide', safety: 'Safety alert', tamper: 'Tampering', moisture: 'Water leak', fire: 'Fire', problem: 'Problem', battery: 'Battery low', triggered: 'Alarm triggered', jammed: 'Lock jammed' },
    de: { smoke: 'Rauch erkannt', gas: 'Gas erkannt', carbon_monoxide: 'Kohlenmonoxid', safety: 'Sicherheitswarnung', tamper: 'Manipulation', moisture: 'Wasserleck', fire: 'Feuer', problem: 'Problem', battery: 'Batterie schwach', triggered: 'Alarm ausgelöst', jammed: 'Schloss klemmt' },
  };

  /**
   * deriveAlerts(items, states, opts) -> [{ id, severity, source, title, text, ts, entity }]
   * opts: { lang, batteryThreshold, isExcluded(item) }
   */
  function deriveAlerts(items, states, opts) {
    opts = opts || {};
    var l = opts.lang === 'de' ? 'de' : 'en', tt = T[l], thr = opts.batteryThreshold == null ? 15 : opts.batteryThreshold;
    var out = [];
    items.forEach(function (it) {
      if (opts.isExcluded && opts.isExcluded(it)) return;
      var st = states[it.id]; if (!st) return;
      var ts = Date.parse(st.last_changed) || 0, dc = it.deviceClass || (st.attributes && st.attributes.device_class);
      // like FSC: the device is the title, the reason the second line
      var mk = function (sev, source, reason) { out.push({ id: 'alert:' + it.id, severity: sev, source: source, title: it.name, text: reason, ts: ts, entity: it.id }); };
      if (it.domain === 'binary_sensor' && st.state === 'on') {
        if (CRITICAL_CLASSES[dc]) mk('critical', 'safety', tt[dc] || tt.safety);
        else if (dc === 'problem') mk('warning', 'system', tt.problem);
        else if (dc === 'battery') mk('warning', 'safety', tt.battery);
      } else if (it.domain === 'alarm_control_panel' && st.state === 'triggered') mk('critical', 'safety', tt.triggered);
      else if (it.domain === 'lock' && st.state === 'jammed') mk('warning', 'system', tt.jammed);
      else if (it.domain === 'sensor' && dc === 'battery') {
        var v = parseFloat(st.state);
        if (opts.numericBattery !== false && !isNaN(v) && v <= thr) mk('warning', 'battery', tt.battery + ' · ' + Math.round(v) + '%');   // FSC has no percentage warnings: off unless switched on
      }
    });
    return sortNotes(out);
  }
  function sortNotes(list) { return list.slice().sort(function (a, b) { return SEVERITY[b.severity] - SEVERITY[a.severity] || b.ts - a.ts; }); }

  /** Persistent notification -> note (HA sends info-level by default). */
  function fromPersistent(n) {
    var title = n.title || '';
    var sev = /error|fail|alert|critical|fehler/i.test(title + ' ' + n.message) ? 'warning' : 'info';
    return { id: 'pn:' + n.notification_id, severity: sev, source: 'home-assistant', title: title || n.message.slice(0, 60), text: title ? n.message : '', ts: Date.parse(n.created_at) || 0, persistent: n.notification_id };
  }
  function filterNotes(list, f) {
    f = f || {};
    return list.filter(function (n) { return (!f.severity || f.severity === 'all' || n.severity === f.severity) && (!f.source || f.source === 'all' || n.source === f.source); });
  }
  /** "1 critical, 2 warnings" capsule data. */
  function summary(list) {
    var c = { critical: 0, warning: 0, info: 0 };
    list.forEach(function (n) { c[n.severity]++; });
    var top = c.critical ? 'critical' : (c.warning ? 'warning' : (c.info ? 'info' : null));
    return { counts: c, total: list.length, top: top };
  }
  function sources(list) { return Array.from(new Set(list.map(function (n) { return n.source; }))).sort(); }
  /** Should a transient toast be shown right now? Info toasts rest during quiet hours. */
  function toastAllowed(type, quiet) { return !(quiet && (type === 'info' || type === 'success')); }

  var DEFAULTS = {
    notifications: { alerts: true, battery: false, batteryThreshold: 15, quietFrom: '22:00', quietTo: '07:00', versionWatch: true },
  };
  var SETTINGS_ROWS = [
    { id: 'n_alerts', tab: 'general', group: { en: 'Notifications', de: 'Mitteilungen' }, type: 'toggle', path: 'notifications.alerts', label: { en: 'Safety alerts', de: 'Sicherheitswarnungen' }, desc: { en: 'Show smoke, gas, water and tamper alerts from your sensors in the island.', de: 'Rauch-, Gas-, Wasser- und Manipulationswarnungen deiner Sensoren in der Leiste zeigen.' } },
    { id: 'n_battery', tab: 'general', group: { en: 'Notifications', de: 'Mitteilungen' }, type: 'toggle', path: 'notifications.battery', label: { en: 'Low battery warnings', de: 'Batteriewarnungen' }, desc: { en: 'Warn when a battery sensor drops below the threshold.', de: 'Warnen, wenn ein Batterie-Sensor unter die Schwelle fällt.' } },
    { id: 'n_thr', tab: 'general', group: { en: 'Notifications', de: 'Mitteilungen' }, type: 'slider', path: 'notifications.batteryThreshold', min: 5, max: 40, step: 1, unit: '%', label: { en: 'Battery threshold', de: 'Batterie-Schwelle' }, desc: { en: 'Below this level a battery counts as low.', de: 'Unter diesem Stand gilt eine Batterie als schwach.' } },
    { id: 'n_qfrom', tab: 'general', group: { en: 'Quiet hours', de: 'Ruhezeiten' }, type: 'text', path: 'notifications.quietFrom', placeholder: '22:00', label: { en: 'Quiet hours start', de: 'Ruhezeit ab' }, desc: { en: 'Info toasts rest and deep rest dims further. Format 22:00.', de: 'Info-Toasts pausieren und der Tiefschlaf dimmt stärker. Format 22:00.' } },
    { id: 'n_qto', tab: 'general', group: { en: 'Quiet hours', de: 'Ruhezeiten' }, type: 'text', path: 'notifications.quietTo', placeholder: '07:00', label: { en: 'Quiet hours end', de: 'Ruhezeit bis' }, desc: { en: 'When quiet hours end, in 24 hour format.', de: 'Wann die Ruhezeit endet, im 24-Stunden-Format.' } },
  ];

  var api = { deriveAlerts: deriveAlerts, fromPersistent: fromPersistent, filterNotes: filterNotes, summary: summary, sources: sources, sortNotes: sortNotes, toastAllowed: toastAllowed, SEVERITY: SEVERITY , DEFAULTS: DEFAULTS, SETTINGS_ROWS: SETTINGS_ROWS };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor.defaults = Object.assign(g.OkieMotor.defaults || {}, DEFAULTS);
  g.OkieMotor.settingsRows = (g.OkieMotor.settingsRows || []).concat(SETTINGS_ROWS);

  // ------------------------------------------------------------- UI ----
  var UI = g.OkieMotor.ui, h = UI.h, CT = g.OkieMotor.controls, F = g.OkieMotor.feeds;


  core.registerStrings('en', {
    'n.center': 'Notifications', 'n.history': 'History', 'n.all': 'All', 'n.critical': 'Critical', 'n.warning': 'Warnings', 'n.info': 'Info', 'n.none': 'All quiet. Nothing needs your attention.',
    'n.dismiss': 'Dismiss', 'n.src.home-assistant': 'Home Assistant', 'n.src.safety': 'Safety', 'n.src.battery': 'Batteries', 'n.src.system': 'System', 'n.by_room': 'By room', 'n.by_type': 'By type', 'n.by_time': 'By time',
    'n.nohist': 'Nothing has happened yet.', 'n.summary': '{n} message', 'n.summary_n': '{n} messages', 'n.new_version': 'A newer version is available', 'n.reload': 'Reload', 'n.dismissed': 'Notification dismissed',
  });
  core.registerStrings('de', {
    'n.center': 'Mitteilungen', 'n.history': 'Verlauf', 'n.all': 'Alle', 'n.critical': 'Kritisch', 'n.warning': 'Warnungen', 'n.info': 'Info', 'n.none': 'Alles ruhig. Nichts braucht deine Aufmerksamkeit.',
    'n.dismiss': 'Verwerfen', 'n.src.home-assistant': 'Home Assistant', 'n.src.safety': 'Sicherheit', 'n.src.battery': 'Batterien', 'n.src.system': 'System', 'n.by_room': 'Nach Raum', 'n.by_type': 'Nach Typ', 'n.by_time': 'Nach Zeit',
    'n.nohist': 'Es ist noch nichts passiert.', 'n.summary': '{n} Nachricht', 'n.summary_n': '{n} Nachrichten', 'n.new_version': 'Eine neuere Version ist verfügbar', 'n.reload': 'Neu laden', 'n.dismissed': 'Mitteilung verworfen',
  });

  var CSS = [
    '.isl-note{position:relative;display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:9999px;background:rgba(255,255,255,.1);font-size:13px;font-weight:600;}',
    '.isl-note.critical{background:rgba(239,77,58,.4);animation:n-pulse 1.8s ease-in-out infinite;}.isl-note.warning{background:rgba(255,176,32,.35);}',
    '@keyframes n-pulse{50%{box-shadow:0 0 0 6px rgba(239,77,58,.18);}}',
    '.isl-ver{display:inline-flex;align-items:center;gap:8px;padding:4px 10px;font-size:12px;color:var(--okie-text-dim);}.isl-ver button{padding:3px 10px;border-radius:9999px;background:#fff;color:#1d1b19;font-weight:600;font-size:12px;}',
    '.nc{display:flex;flex-direction:column;gap:12px;}.nc-top{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;}',
    '.nc-sum{display:inline-flex;gap:8px;padding:6px 12px;border-radius:9999px;background:rgba(255,255,255,.1);font-size:13px;}',
    '.nc-list{display:flex;flex-direction:column;gap:8px;max-height:46vh;overflow:auto;scrollbar-width:none;}.nc-list::-webkit-scrollbar{display:none;}',
    '.nr{display:flex;gap:12px;align-items:flex-start;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.08);}',
    '.nr i{width:10px;height:10px;border-radius:50%;margin-top:6px;flex:none;background:#8ab4ff;}.nr.critical i{background:#ef4d3a;}.nr.warning i{background:#ffb020;}',
    '.nr-m{flex:1;min-width:0;}.nr-t{font-weight:600;}.nr-s{font-size:13px;color:var(--okie-text-dim);margin-top:2px;}.nr-w{font-size:12px;color:var(--okie-text-faint);white-space:nowrap;}',
    '.hday{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--okie-text-dim);margin:10px 0 4px;}.hrow{display:flex;justify-content:space-between;gap:10px;padding:7px 4px;border-bottom:1px solid var(--okie-line);font-size:14px;}.hrow span:last-child{color:var(--okie-text-dim);white-space:nowrap;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  function mount(ctx) {
    var persistent = new Map(), unsub = null, derived = [], sig = '', notice = null;
    var cfg = function () { return ctx.settings.get().notifications; };
    var lang = function () { return ctx.lang(); };
    var t = function (k, v) { return core.t(k, lang(), v); };

    function all() {
      var list = Array.from(persistent.values()).map(fromPersistent);
      var extra = notice ? [notice] : [];
      return sortNotes(derived.concat(list, extra));
    }
    function recompute() {
      var c = cfg();
      var items = ctx.engine.all();
      derived = c.alerts ? deriveAlerts(items, ctx.hass().states, { lang: lang(), batteryThreshold: c.batteryThreshold, numericBattery: !!c.battery, isExcluded: ctx.engine.isExcluded }).filter(function (n) { return c.battery || n.source !== 'battery'; }) : [];
      var s = all().map(function (n) { return n.id; }).join('|');
      if (s !== sig) { sig = s; ctx.bus.emit('notes', all()); }
    }
    // Home Assistant persistent notifications over the websocket
    try {
      var conn = ctx.hass().connection;
      if (conn && conn.subscribeMessage) {
        Promise.resolve(conn.subscribeMessage(function (msg) {
          if (msg.type === 'removed') Object.keys(msg.notifications || {}).forEach(function (k) { persistent.delete(k); });
          else Object.keys(msg.notifications || {}).forEach(function (k) { persistent.set(k, msg.notifications[k]); });
          recompute();
        }, { type: 'persistent_notification/subscribe' })).then(function (u) { unsub = u; }, function () {});
      }
    } catch (e) { /* older HA: only derived alerts */ }

    // version watcher: quiet line + reload only when the running code is provably older
    var watchTimer = 0;
    // A plain reload can be answered from the browser's cache (the script's ?v= stamp only changes when Home Assistant re-stamps it), so first fetch the very same address
    // again with "reload" (that replaces the cached copy), then reload the page.
    function hardReload() {
      var urls = [], done = false;
      try { performance.getEntriesByType('resource').forEach(function (r) { if (/\/okie-motor(\.min)?\.js(\?|$)/.test(r.name) && urls.indexOf(r.name) < 0) urls.push(r.name); }); } catch (e) { /* no resource timing */ }
      function go() { if (done) return; done = true; location.reload(); }
      setTimeout(go, 4000);                                      // never get stuck on a slow connection
      Promise.all(urls.map(function (u) { return fetch(u, { cache: 'reload' }).catch(function () {}); })).then(go, go);
    }
    function watch() {
      if (!cfg().versionWatch || !g.OkieMotor.version || !g.OkieMotor.versionUrl) return;
      fetch(g.OkieMotor.versionUrl + '?_=' + Date.now(), { cache: 'no-store' }).then(function (r) { return r.ok ? r.json() : null; }).then(function (j) {
        if (!j || !j.build || !g.OkieMotor.build) return;
        if (j.build > g.OkieMotor.build && !notice) {
          notice = { id: 'ver:' + j.build, severity: 'info', source: 'system', title: t('n.new_version'), text: t('n.reload'), ts: Date.now(), action: hardReload };
          recompute();
        }
      }, function () {});
    }
    if (g.OkieMotor.versionUrl) { watch(); watchTimer = setInterval(watch, 30 * 60000); }

    recompute();
    return {
      update: recompute,
      all: all,
      dispose: function () { clearInterval(watchTimer); if (unsub) { try { unsub(); } catch (e) {} } },
    };
  }

  function openCenter(ctx, origin, startTab) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var inst = ctx._notify; var notes = inst ? inst.all() : [];
    var tab = startTab === 'history' ? 'history' : 'notes', sev = 'all', src = 'all', group = 'time';
    ctx.sheet({ title: t('n.center'), origin: origin, width: 'min(680px,100%)', content: function (close) {
      var root = h('div.nc'), body = h('div');
      var seg = CT.createSegment({ options: [{ id: 'notes', label: t('n.center') }, { id: 'history', label: t('n.history') }], value: tab, onChange: function (v) { tab = v; draw(); } });
      function draw() {
        body.innerHTML = '';
        if (tab === 'notes') drawNotes(); else drawHistory();
      }
      function drawNotes() {
        notes = (inst ? inst.all() : []);
        var s = summary(notes);
        var chips = h('div.chiprow');
        ['all', 'critical', 'warning', 'info'].forEach(function (k) { chips.appendChild(h('button.cp' + (sev === k ? '.on' : ''), { onclick: function () { sev = k; draw(); } }, t('n.' + k) + (k !== 'all' ? ' ' + s.counts[k] : ''))); });
        var schips = h('div.chiprow');
        ['all'].concat(sources(notes)).forEach(function (k) { schips.appendChild(h('button.cp' + (src === k ? '.on' : ''), { onclick: function () { src = k; draw(); } }, k === 'all' ? t('n.all') : t('n.src.' + k))); });
        body.appendChild(h('div.nc-top', null, h('span.nc-sum', null, s.total === 1 ? t('n.summary', { n: 1 }) : t('n.summary_n', { n: s.total }))));
        body.appendChild(chips); body.appendChild(schips);
        var list = h('div.nc-list'); body.appendChild(list);
        var shown = filterNotes(notes, { severity: sev, source: src });
        if (!shown.length) list.appendChild(h('div.note-l', null, t('n.none')));
        shown.forEach(function (n) {
          list.appendChild(h('div.nr.' + n.severity, null, h('i'), h('div.nr-m', null, h('div.nr-t', null, n.title), n.text ? h('div.nr-s', null, n.text) : null),
            h('div.nr-w', null, n.ts ? L.relativeTime(Date.now() - n.ts, ctx.lang()) : ''),
            n.persistent ? h('button.mini', { 'aria-label': t('n.dismiss'), onclick: function () { ctx.call('persistent_notification', 'dismiss', { notification_id: n.persistent }).then(function () { ctx.toast('success', t('n.dismissed')); setTimeout(draw, 300); }, function () {}); }, html: UI.icon('close', 16) }) : (n.entity ? h('button.mini', { 'aria-label': n.title, onclick: function () { close(); ctx.openDetail(n.entity); }, html: UI.icon('chevron', 16) }) : null)));
        });
      }
      function drawHistory() {
        var gseg = CT.createSegment({ options: [{ id: 'time', label: t('n.by_time') }, { id: 'room', label: t('n.by_room') }, { id: 'type', label: t('n.by_type') }], value: group, onChange: function (v) { group = v; draw(); } });
        body.appendChild(gseg.el);
        var rec = ctx.chronicle;
        var days = rec ? rec.days(ctx.lang()) : [];
        if (!days.length) { body.appendChild(h('div.note-l', null, t('n.nohist'))); return; }
        var list = h('div.nc-list'); body.appendChild(list);
        days.forEach(function (d) {
          list.appendChild(h('div.hday', null, d.title));
          var entries = d.entries.slice();
          if (group !== 'time') entries.sort(function (a, b) { var ka = group === 'room' ? a.area : a.domain, kb = group === 'room' ? b.area : b.domain; return String(ka).localeCompare(String(kb)) || b.ts - a.ts; });
          entries.forEach(function (e) {
            list.appendChild(h('div.hrow', null, h('span', null, e.name + ' → ' + e.text + (e.folded ? ' ×' + e.count : '')), h('span', null, group === 'room' ? (e.area || '') : new Date(e.ts).toLocaleTimeString(ctx.lang(), { hour: '2-digit', minute: '2-digit' }))));
          });
        });
      }
      root.appendChild(seg.el); root.appendChild(body); draw();
      return root;
    } });
  }

  api.mount = function (ctx) { var inst = mount(ctx); ctx._notify = inst; return inst; };
  api.openCenter = openCenter;
  g.OkieMotor.notify = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

/* okie-server: the Server app. How the machine under Home Assistant is doing (processor, memory, storage, network, backups, updates)
 * and the apps that run on it, as glass cards in the same look as everything else.
 *
 * Numbers come from Home Assistant's System Monitor integration (sensor.system_monitor_*), the router's sensors (eero) and the backup
 * and update entities; whatever is missing is simply left out. The apps are links (a web address, or a Home Assistant page like
 * /lovelace/files); the list starts with the ones from the old Server Utility dashboard and is edited on screen (kept per device).
 *
 * The reading and formatting rules are pure and unit-tested; the screen is checked in the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  var GIB = { B: 1 / 1073741824, kB: 1 / 1048576, KiB: 1 / 1048576, MB: 1 / 1024, MiB: 1 / 1024, GB: 1, GiB: 1, TB: 1024, TiB: 1024 };
  var IDS = {
    cpu: ['sensor.system_monitor_processor_use', 'sensor.processor_use'],
    temp: ['sensor.system_monitor_processor_temperature', 'sensor.processor_temperature'],
    ramPct: ['sensor.system_monitor_memory_usage', 'sensor.memory_use_percent'],
    ramUse: ['sensor.system_monitor_memory_use', 'sensor.memory_use'],
    ramFree: ['sensor.system_monitor_memory_free', 'sensor.memory_free'],
    diskPct: ['sensor.system_monitor_disk_usage', 'sensor.disk_use_percent'],
    diskUse: ['sensor.system_monitor_disk_use', 'sensor.disk_use'],
    diskFree: ['sensor.system_monitor_disk_free', 'sensor.disk_free'],
    load: ['sensor.system_monitor_load_5_min', 'sensor.load_5m'],
    up: ['sensor.system_monitor_uptime', 'sensor.uptime'],
  };

  function usable(st) { return st && st.state !== 'unavailable' && st.state !== 'unknown' && st.state !== ''; }
  function read(states, ids) {
    for (var i = 0; i < ids.length; i++) {
      var st = states[ids[i]];
      if (usable(st)) { var v = parseFloat(st.state); if (isFinite(v)) return { v: v, unit: st.attributes && st.attributes.unit_of_measurement }; }
    }
    return null;
  }
  function gib(r) { return r ? r.v * (GIB[r.unit] != null ? GIB[r.unit] : 1) : null; }
  function clampPct(v) { return v == null ? null : Math.max(0, Math.min(100, v)); }

  /** Processor, memory, storage, load and uptime from the System Monitor sensors. Anything missing is null. */
  function readStats(states, now) {
    var cpu = read(states, IDS.cpu), temp = read(states, IDS.temp), rp = read(states, IDS.ramPct), ru = read(states, IDS.ramUse), rf = read(states, IDS.ramFree);
    var dp = read(states, IDS.diskPct), du = read(states, IDS.diskUse), df = read(states, IDS.diskFree), load = read(states, IDS.load), upSt = null;
    IDS.up.forEach(function (id) { if (!upSt && usable(states[id]) && !isNaN(Date.parse(states[id].state))) upSt = states[id]; });
    var ramTotal = ru && rf ? gib(ru) + gib(rf) : null, diskTotal = du && df ? gib(du) + gib(df) : null;
    return {
      cpu: cpu ? { pct: clampPct(cpu.v) } : null,
      temp: temp ? { v: temp.v, unit: temp.unit || '°C' } : null,
      ram: rp || ru ? { pct: clampPct(rp ? rp.v : (ramTotal ? gib(ru) / ramTotal * 100 : null)), usedGiB: ru ? gib(ru) : null, totalGiB: ramTotal } : null,
      disk: dp || du ? { pct: clampPct(dp ? dp.v : (diskTotal ? gib(du) / diskTotal * 100 : null)), usedGiB: du ? gib(du) : null, totalGiB: diskTotal } : null,
      load: load ? load.v : null,
      uptimeMs: upSt ? Math.max(0, (now || Date.now()) - Date.parse(upSt.state)) : null,
    };
  }

  var VIRTUAL = /^(lo|docker\d*|br[-_].*|veth.*|hassio|tailscale\d*|virbr.*|zt.*|cni.*|flannel.*)$/;
  /** The network card's sensors: the busiest real interface (not docker, bridges, loopback) that has both throughput-in and -out. */
  function netIds(states) {
    var found = {};
    Object.keys(states).forEach(function (id) {
      var m = /^sensor\.(?:system_monitor_)?network_throughput_(in|out)_(.+)$/.exec(id);
      if (m) { (found[m[2]] = found[m[2]] || {})[m[1]] = id; }
    });
    var names = Object.keys(found).filter(function (n) { return found[n].in && found[n].out; });
    if (!names.length) return null;
    var real = names.filter(function (n) { return !VIRTUAL.test(n); }), pool = real.length ? real : names;
    var load = function (n) { var a = parseFloat((states[found[n].in] || {}).state), b = parseFloat((states[found[n].out] || {}).state); return (isFinite(a) ? a : 0) + (isFinite(b) ? b : 0); };
    pool.sort(function (a, b) { return load(b) - load(a) || a.localeCompare(b); });
    return { inId: found[pool[0]].in, outId: found[pool[0]].out, iface: pool[0] };
  }
  /** Current throughput of that interface: { inV, outV } in the sensors' own unit (MB/s). */
  function readRates(states, ids) {
    if (!ids) return null;
    var a = read(states, [ids.inId]), b = read(states, [ids.outId]);
    return a || b ? { inV: a ? a.v : 0, outV: b ? b.v : 0, unit: (a && a.unit) || (b && b.unit) || 'MB/s' } : null;
  }

  /** Is the internet up, and what is the public address: from the router's sensors (eero) or any that look like them. */
  function readNetwork(states) {
    var ids = Object.keys(states), conn = null, ip = null;
    var wan = states['binary_sensor.eero_wan_status'] ? 'binary_sensor.eero_wan_status' : ids.filter(function (id) { return /^binary_sensor\..*(wan|internet)/.test(id); })[0];
    if (wan && usable(states[wan])) conn = states[wan].state === 'on';
    var ipId = states['sensor.eero_external_ip'] ? 'sensor.eero_external_ip' : ids.filter(function (id) { return /^sensor\..*(external|public)_ip/.test(id); })[0];
    if (ipId && usable(states[ipId])) ip = states[ipId].state;
    return { connected: conn, publicIp: ip };
  }

  /** The backup sensors: last good one, the next planned one, and what the manager is doing. */
  function readBackup(states) {
    var ts = function (id) { var st = states[id]; if (!usable(st)) return null; var t = Date.parse(st.state); return isNaN(t) ? null : t; };
    var last = ts('sensor.backup_last_successful_automatic_backup'), next = ts('sensor.backup_next_scheduled_automatic_backup');
    var st = states['sensor.backup_backup_manager_state'];
    if (last == null && next == null && !st) return null;
    return { last: last, next: next, state: st && usable(st) ? st.state : null };
  }

  /** Everything with an update waiting: [{ id, name, installed, latest }]. */
  function readUpdates(states) {
    return Object.keys(states).filter(function (id) { return id.indexOf('update.') === 0 && states[id].state === 'on'; }).map(function (id) {
      var a = states[id].attributes || {}, name = String(a.friendly_name || a.title || id).replace(/\s+Update$/i, '');
      return { id: id, name: name, installed: a.installed_version || '', latest: a.latest_version || '' };
    }).sort(function (a, b) { return a.name.localeCompare(b.name); });
  }

  // ---- the apps ---------------------------------------------------------------------------------------
  var DEFAULT_APPS = [      // starting links, all pages of Home Assistant itself; add your own (Jellyfin, AdGuard, Grafana ...) with the pencil
    { id: 'addons', name: 'Add-ons', icon: 'server', color: '#32d74b', url: '/hassio/dashboard' },
    { id: 'settings', name: 'Settings', icon: 'gear', color: '#0a84ff', url: '/config' },
    { id: 'logbook', name: 'Logbook', icon: 'book', color: '#ff9f0a', url: '/logbook' },
    { id: 'history', name: 'History', icon: 'chart', color: '#bf5af2', url: '/history' },
    { id: 'energy', name: 'Energy', icon: 'bolt', color: '#ffd60a', url: '/energy' },
  ];
  var APP_ICONS = ['shield', 'key', 'cloud', 'film', 'book', 'folder', 'flow', 'tablet', 'doorbell', 'camera', 'server', 'tv', 'speaker', 'bolt', 'gear', 'chart'];
  var APP_COLORS = ['#32d74b', '#0a84ff', '#64d2ff', '#bf5af2', '#ff9f0a', '#ffd60a', '#ff6482', '#ac8e68', '#5ac8fa'];

  function isInternal(url) { return /^\//.test(String(url || '')); }
  /** What was typed in the add form -> an app, or null when the name or address is empty. A bare address gets https://. */
  function sanitizeApp(o, taken) {
    var name = String((o && o.name) || '').trim(), url = String((o && o.url) || '').trim();
    if (!name || !url) return null;
    if (!isInternal(url) && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) url = 'https://' + url;
    var base = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'app', id = base, n = 2;
    while ((taken || []).indexOf(id) >= 0) id = base + '-' + (n++);
    var icon = APP_ICONS.indexOf(o.icon) >= 0 ? o.icon : 'server';
    return { id: id, name: name, icon: icon, color: o.color || APP_COLORS[((taken || []).length) % APP_COLORS.length], url: url };
  }
  function appsFilter(apps, q) {
    var s = String(q || '').trim().toLowerCase();
    return s ? apps.filter(function (a) { return a.name.toLowerCase().indexOf(s) >= 0; }) : apps;
  }

  // ---- words and numbers ------------------------------------------------------------------------------
  function tone(pct) { return pct == null ? 'ok' : pct < 70 ? 'ok' : pct < 90 ? 'warn' : 'bad'; }
  function storageState(pct) { return pct == null ? null : pct < 85 ? 'healthy' : pct < 95 ? 'filling' : 'full'; }
  function fmtSize(v) { if (v == null) return '–'; return v >= 1000 ? (v / 1024).toFixed(v >= 10240 ? 0 : 1) + ' TB' : (v >= 100 ? Math.round(v) : v.toFixed(1)) + ' GB'; }
  function fmtRate(v, unit) {
    if (v == null) return '–';
    var mb = unit === 'kB/s' ? v / 1000 : unit === 'B/s' ? v / 1e6 : unit === 'GB/s' ? v * 1000 : v;
    if (mb >= 1) return mb.toFixed(mb >= 10 ? 0 : 1) + ' MB/s';
    return Math.round(mb * 1000) + ' KB/s';
  }
  function fmtUptime(ms, lang) {
    if (ms == null) return '';
    var de = lang === 'de', d = Math.floor(ms / 86400000), h = Math.floor(ms / 3600000), m = Math.max(1, Math.floor(ms / 60000));
    if (d >= 2) return d + (de ? ' Tage' : ' days');
    if (h >= 1) return h + (de ? ' Std.' : ' h');
    return m + (de ? ' Min.' : ' min');
  }
  /** "Today 3:01 AM", "Tomorrow 3:00 AM", "Oct 14, 3:01 AM". */
  function whenText(ms, now, lang, tf) {
    if (ms == null) return '';
    var de = lang === 'de', loc = de ? 'de' : 'en-US', o = { hour: 'numeric', minute: '2-digit' };
    if (tf === '12h') o.hour12 = true; else if (tf === '24h' || (!tf && de)) { o.hourCycle = 'h23'; o.hour = '2-digit'; }
    var time = new Date(ms).toLocaleTimeString(loc, o), day = function (t) { var d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
    var diff = Math.round((day(ms) - day(now)) / 86400000);
    var word = diff === 0 ? (de ? 'Heute' : 'Today') : diff === 1 ? (de ? 'Morgen' : 'Tomorrow') : diff === -1 ? (de ? 'Gestern' : 'Yesterday') : new Date(ms).toLocaleDateString(loc, { month: 'short', day: 'numeric' });
    return word + ' ' + time;
  }

  var api = {
    readStats: readStats, netIds: netIds, readRates: readRates, readNetwork: readNetwork, readBackup: readBackup, readUpdates: readUpdates,
    DEFAULT_APPS: DEFAULT_APPS, APP_ICONS: APP_ICONS, isInternal: isInternal, sanitizeApp: sanitizeApp, appsFilter: appsFilter,
    tone: tone, storageState: storageState, fmtSize: fmtSize, fmtRate: fmtRate, fmtUptime: fmtUptime, whenText: whenText,
  };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.server = api;

  // ===================================================================== screen ====
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, L = g.OkieMotor.logic, h = UI.h;

  core.registerStrings('en', {
    'app.server': 'Server', 'sv.system': 'System', 'sv.cpu': 'Processor', 'sv.ram': 'Memory', 'sv.storage': 'Storage', 'sv.network': 'Network', 'sv.apps': 'Apps', 'sv.search': 'Search apps',
    'sv.healthy': 'Healthy', 'sv.filling': 'Filling up', 'sv.full': 'Almost full', 'sv.used_of': '{u} used of {t}', 'sv.free': '{f} free', 'sv.connected': 'Connected', 'sv.offline': 'Offline', 'sv.ip': 'Public IP', 'sv.in': 'Down', 'sv.out': 'Up',
    'sv.up': 'Up {d}', 'sv.backup': 'Backup', 'sv.last': 'Last', 'sv.next': 'Next', 'sv.none_yet': 'None yet', 'sv.updates': 'Updates', 'sv.updates_n': '{n} waiting', 'sv.updates_1': '1 waiting', 'sv.all_current': 'Everything is up to date',
    'sv.good': 'All good', 'sv.edit': 'Edit apps', 'sv.add': 'Add app', 'sv.name': 'Name', 'sv.address': 'Address', 'sv.addr_hint': 'A web address, or a Home Assistant page like /lovelace/files', 'sv.icon': 'Icon', 'sv.reset': 'Back to the original apps',
    'sv.remove': 'Remove', 'sv.no_match': 'No app matches.', 'sv.no_data': 'No system numbers yet. Add the System Monitor integration in Home Assistant.', 'sv.done': 'Done', 'sv.save': 'Add', 'sv.load': 'Load {n}',
  });
  core.registerStrings('de', {
    'app.server': 'Server', 'sv.system': 'System', 'sv.cpu': 'Prozessor', 'sv.ram': 'Speicher', 'sv.storage': 'Speicherplatz', 'sv.network': 'Netzwerk', 'sv.apps': 'Apps', 'sv.search': 'Apps suchen',
    'sv.healthy': 'In Ordnung', 'sv.filling': 'Füllt sich', 'sv.full': 'Fast voll', 'sv.used_of': '{u} von {t} belegt', 'sv.free': '{f} frei', 'sv.connected': 'Verbunden', 'sv.offline': 'Offline', 'sv.ip': 'Öffentliche IP', 'sv.in': 'Runter', 'sv.out': 'Hoch',
    'sv.up': 'Läuft seit {d}', 'sv.backup': 'Sicherung', 'sv.last': 'Letzte', 'sv.next': 'Nächste', 'sv.none_yet': 'Noch keine', 'sv.updates': 'Updates', 'sv.updates_n': '{n} warten', 'sv.updates_1': '1 wartet', 'sv.all_current': 'Alles ist aktuell',
    'sv.good': 'Alles gut', 'sv.edit': 'Apps bearbeiten', 'sv.add': 'App hinzufügen', 'sv.name': 'Name', 'sv.address': 'Adresse', 'sv.addr_hint': 'Eine Web-Adresse oder eine Home-Assistant-Seite wie /lovelace/files', 'sv.icon': 'Symbol',
    'sv.reset': 'Zurück zu den Original-Apps', 'sv.remove': 'Entfernen', 'sv.no_match': 'Keine App passt.', 'sv.no_data': 'Noch keine Systemwerte. Füge die System-Monitor-Integration in Home Assistant hinzu.', 'sv.done': 'Fertig', 'sv.save': 'Hinzufügen', 'sv.load': 'Last {n}',
  });

  function renderServer(container, ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, lang = function () { return ctx.lang(); };
    var tf = function () { return ctx.settings.get().timeFormat; };
    var apps = ctx.store.get('server.apps', null) || DEFAULT_APPS.map(function (a) { return Object.assign({}, a); }), query = '', editing = false, disposed = false, lastSide = false, ro = null, histAt = 0, histToken = 0;
    var shell = null;
    var keepApps = function () { ctx.store.set('server.apps', apps); };

    // ---- the status cards (System, Storage, Network): in the picture on wide screens, on top on a phone
    function ring(label) {
      var NS = 'http://www.w3.org/2000/svg', arc = document.createElementNS(NS, 'circle'), val = h('b', null, '–'), sub = h('small');
      arc.setAttribute('class', 'ga'); arc.setAttribute('cx', '60'); arc.setAttribute('cy', '60'); arc.setAttribute('r', '46'); arc.setAttribute('pathLength', '100');
      var svg = h('div.sv-gr'); svg.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="gt" cx="60" cy="60" r="46"/></svg>';
      svg.firstChild.appendChild(arc);
      var el = h('div.sv-g', null, h('div.sv-gw', null, svg, h('div.sv-gv', null, val, sub)), h('div.sv-gl', null, label));
      var cap = h('div.sv-gc'); el.appendChild(cap);
      return { el: el, set: function (pct, big, small, caption) {
        arc.style.strokeDasharray = (pct == null ? 0 : pct) + ' 100'; arc.style.stroke = 'var(--sv-' + tone(pct) + ')';
        val.textContent = big; sub.textContent = small || ''; cap.textContent = caption || '';
      } };
    }
    var cpu = ring(t('sv.cpu')), ram = ring(t('sv.ram'));
    var upEl = h('span.sv-meta');
    var sysCard = h('section.sv-card.sv-sys', null, h('div.sv-h', null, h('b', null, t('sv.system')), upEl), h('div.sv-rings', null, cpu.el, ram.el), h('div.sv-nodata', { hidden: true }, t('sv.no_data')));
    var stBadge = h('span.sv-badge'), stBar = h('i'), stText = h('div.sv-st');
    var stoCard = h('section.sv-card.sv-sto', null, h('div.sv-h', null, h('b', null, t('sv.storage')), stBadge), h('div.sv-bar', null, stBar), stText);
    var netBadge = h('span.sv-badge'), ipEl = h('span.sv-ip'), inEl = h('b'), outEl = h('b'), chart = h('div.sv-chart');
    var netCard = h('section.sv-card.sv-net', null, h('div.sv-h', null, h('b', null, t('sv.network')), netBadge),
      h('div.sv-rates', null, h('span.sv-rin', null, h('em', { html: '↓' }), h('small', null, t('sv.in')), inEl), h('span.sv-rout', null, h('em', { html: '↑' }), h('small', null, t('sv.out')), outEl), ipEl), chart);
    var stack = h('div.sv-stack', null, sysCard, stoCard, netCard);

    // ---- the apps
    var search = h('input.s-text.sv-q', { type: 'search', placeholder: t('sv.search'), 'aria-label': t('sv.search'), autocomplete: 'off', spellcheck: false, oninput: function () { query = search.value; drawApps(); } });
    var grid = h('div.sv-apps'), appsHead = h('div.sv-ah', null, h('b', null, t('sv.apps')));
    var tail = h('div.sv-tail');
    function go(app) {
      ctx.haptic(8);
      if (isInternal(app.url)) { try { history.pushState(null, '', app.url); window.dispatchEvent(new CustomEvent('location-changed', { detail: { replace: false } })); } catch (e) {} }
      else window.open(app.url, '_blank', 'noopener');
    }
    function tile(app) {
      var el = h('div.sv-tile' + (editing ? '.edit' : ''), { role: 'button', tabindex: '0', 'aria-label': app.name, style: { '--tc': app.color || '#64d2ff' }, onclick: function () { if (!editing) go(app); },
        onkeydown: function (e) { if ((e.key === 'Enter' || e.key === ' ') && !editing) { e.preventDefault(); go(app); } } },
        h('span.sv-ic', { html: UI.ICONS && UI.ICONS[app.icon] ? UI.icon(app.icon, 26) : '' }, UI.ICONS && UI.ICONS[app.icon] ? null : app.name.charAt(0).toUpperCase()), h('span.sv-tn', null, app.name));
      if (editing) el.appendChild(h('button.sv-x', { 'aria-label': t('sv.remove') + ': ' + app.name, onclick: function (e) { e.stopPropagation(); apps = apps.filter(function (a) { return a.id !== app.id; }); keepApps(); drawApps(); }, html: UI.icon('minus', 14) }));
      return el;
    }
    function drawApps() {
      grid.innerHTML = '';
      var list = appsFilter(apps, query);
      list.forEach(function (a) { grid.appendChild(tile(a)); });
      if (editing) grid.appendChild(h('button.sv-tile.sv-new', { 'aria-label': t('sv.add'), onclick: openAdd }, h('span.sv-ic', { html: UI.icon('plus', 26) }), h('span.sv-tn', null, t('sv.add'))));
      if (!list.length && !editing) grid.appendChild(h('div.note-l.sv-nomatch', null, t('sv.no_match')));
      appsHead.querySelector('.sv-ah-n') && appsHead.querySelector('.sv-ah-n').remove();
      appsHead.appendChild(h('span.sv-ah-n', null, String(list.length)));
      if (shell) shell.refreshScroll();
    }
    function toggleEdit() {
      editing = !editing; drawApps(); drawTail();
    }
    function openAdd(origin) {
      ctx.sheet({ title: t('sv.add'), width: 'min(440px,100%)', content: function (close) {
        var f = { name: '', url: '', icon: 'server' };
        var name = h('input.s-text', { type: 'text', placeholder: t('sv.name'), 'aria-label': t('sv.name'), autocomplete: 'off', oninput: function () { f.name = name.value; } });
        var url = h('input.s-text', { type: 'text', placeholder: 'https://…', 'aria-label': t('sv.address'), autocomplete: 'off', autocapitalize: 'off', spellcheck: false, oninput: function () { f.url = url.value; } });
        var icons = h('div.sv-icons');
        APP_ICONS.forEach(function (ic) {
          var b = h('button.sv-pick' + (ic === f.icon ? '.on' : ''), { 'aria-label': ic, onclick: function () { f.icon = ic; Array.prototype.forEach.call(icons.children, function (x) { x.classList.toggle('on', x === b); }); }, html: UI.icon(ic, 22) });
          icons.appendChild(b);
        });
        var save = h('button.act.primary', { onclick: function () {
          var app = sanitizeApp(f, apps.map(function (a) { return a.id; }));
          if (!app) { (f.name.trim() ? url : name).focus(); return; }
          apps = apps.concat(app); keepApps(); close(); drawApps();
        } }, t('sv.save'));
        return h('div.cf', null, name, url, h('div.dim', null, t('sv.addr_hint')), h('div.lbl', null, t('sv.icon')), icons, save);
      } });
    }
    function drawTail() {
      tail.innerHTML = '';
      if (editing) {
        tail.appendChild(h('div.sv-edbar', null, h('button.act', { onclick: function () { apps = DEFAULT_APPS.map(function (a) { return Object.assign({}, a); }); keepApps(); drawApps(); } }, t('sv.reset')), h('button.act.primary', { onclick: toggleEdit }, t('sv.done'))));
      }
    }

    // ---- backups and updates
    var bkCard = h('section.sv-card.sv-bk'), upCard = h('section.sv-card.sv-up');
    function drawBackup(states) {
      var b = readBackup(states); bkCard.hidden = !b; if (!b) return;
      var now = Date.now();
      bkCard.innerHTML = '';
      bkCard.appendChild(h('div.sv-h', null, h('b', null, t('sv.backup')), b.state && b.state !== 'idle' ? h('span.sv-badge.warn', null, b.state) : null));
      bkCard.appendChild(h('div.sv-kv', null, h('span', null, t('sv.last')), h('b', null, b.last ? whenText(b.last, now, lang(), tf()) : t('sv.none_yet'))));
      if (b.next) bkCard.appendChild(h('div.sv-kv', null, h('span', null, t('sv.next')), h('b', null, whenText(b.next, now, lang(), tf()))));
    }
    function drawUpdates(states) {
      var list = readUpdates(states); upCard.innerHTML = '';
      upCard.appendChild(h('div.sv-h', null, h('b', null, t('sv.updates')), list.length ? h('span.sv-badge.warn', null, list.length === 1 ? t('sv.updates_1') : t('sv.updates_n', { n: list.length })) : h('span.sv-badge.ok', null, '✓')));
      if (!list.length) { upCard.appendChild(h('div.sv-ok', null, t('sv.all_current'))); return; }
      list.slice(0, 8).forEach(function (u) {
        upCard.appendChild(h('div.sv-kv', null, h('span', null, u.name), h('b', null, u.latest ? String(u.latest).slice(0, 14) : '')));
      });
      if (list.length > 8) upCard.appendChild(h('div.dim', null, '+' + (list.length - 8)));
    }

    // ---- live numbers
    function paint() {
      if (disposed) return;
      var states = ctx.hass().states, S = readStats(states, Date.now());
      var any = !!(S.cpu || S.ram || S.disk);
      sysCard.querySelector('.sv-rings').hidden = !(S.cpu || S.ram); sysCard.querySelector('.sv-nodata').hidden = !!(S.cpu || S.ram);
      cpu.el.hidden = !S.cpu; ram.el.hidden = !S.ram;
      if (S.cpu) cpu.set(S.cpu.pct, Math.round(S.cpu.pct) + '%', '', S.temp ? Math.round(S.temp.v) + S.temp.unit : (S.load != null ? 'load ' + S.load : ''));
      if (S.ram) ram.set(S.ram.pct, Math.round(S.ram.pct) + '%', '', S.ram.usedGiB != null && S.ram.totalGiB ? fmtSize(S.ram.usedGiB) + ' / ' + fmtSize(S.ram.totalGiB) : '');
      upEl.textContent = S.uptimeMs != null ? t('sv.up', { d: fmtUptime(S.uptimeMs, lang()) }) : '';
      var D = S.disk; stoCard.hidden = !D || D.pct == null;
      if (D && D.pct != null) {
        var ss = storageState(D.pct); stBadge.textContent = t('sv.' + ss); stBadge.className = 'sv-badge ' + (ss === 'healthy' ? 'ok' : ss === 'filling' ? 'warn' : 'bad');
        stBar.style.width = D.pct + '%'; stBar.style.background = 'var(--sv-' + tone(D.pct) + ')';
        stText.textContent = D.usedGiB != null && D.totalGiB ? t('sv.used_of', { u: fmtSize(D.usedGiB), t: fmtSize(D.totalGiB) }) : Math.round(D.pct) + '%';
      }
      var N = readNetwork(states), ids = netIds(states), R = readRates(states, ids);
      netCard.hidden = !(N.connected != null || N.publicIp || R);
      if (N.connected != null) { netBadge.textContent = t(N.connected ? 'sv.connected' : 'sv.offline'); netBadge.className = 'sv-badge ' + (N.connected ? 'ok' : 'bad'); } else { netBadge.textContent = ''; netBadge.className = 'sv-badge'; }
      ipEl.textContent = N.publicIp ? t('sv.ip') + ' ' + N.publicIp : '';
      var rates = netCard.querySelector('.sv-rates'); rates.classList.toggle('norate', !R);
      if (R) { inEl.textContent = fmtRate(R.inV, R.unit); outEl.textContent = fmtRate(R.outV, R.unit); }
      chart.hidden = !R;
      if (R && Date.now() - histAt > 120000) loadChart(ids);
      drawBackup(states); drawUpdates(states);
      var n = readUpdates(states).length;
      if (shell) shell.setSubtitle(n ? (n === 1 ? t('sv.updates_1') : t('sv.updates_n', { n: n })) : (any || N.connected != null ? t('sv.good') : ''));
    }
    function loadChart(ids) {
      histAt = Date.now(); var my = ++histToken, to = Date.now(), from = to - 3600e3;
      var one = function (id) {
        var path = 'history/period/' + new Date(from).toISOString() + '?filter_entity_id=' + encodeURIComponent(id) + '&end_time=' + encodeURIComponent(new Date(to).toISOString()) + '&minimal_response&no_attributes';
        return Promise.resolve(ctx.hass().callApi('GET', path)).then(function (res) {
          return ((res && res[0]) || []).map(function (r) { return { t: Date.parse(r.last_changed || r.last_updated), v: parseFloat(r.state) }; }).filter(function (p) { return isFinite(p.t) && isFinite(p.v); });
        }, function () { return []; });
      };
      Promise.all([one(ids.inId), one(ids.outId)]).then(function (both) {
        if (my !== histToken || disposed) return;
        var edge = function (pts) { return pts.length ? [{ t: from, v: pts[0].v }].concat(pts, [{ t: to, v: pts[pts.length - 1].v }]) : pts; };      // the value holds until the next reading: draw it all the way across
        var a = L.bucketSeries(edge(both[0]), 48), b = L.bucketSeries(edge(both[1]), 48);
        if (a.length < 2 && b.length < 2) { chart.innerHTML = ''; return; }
        var max = Math.max.apply(null, a.concat(b).map(function (p) { return p.v; }).concat([0.05])), W = 320, H = 70, box = { x: 0, y: 6, w: W, h: H - 10 }, sc = { t0: from, t1: to, v0: 0, v1: max };
        var la = L.linePath(a, box, sc), lb = L.linePath(b, box, sc);
        chart.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true"><defs><linearGradient id="svg-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#64d2ff" stop-opacity=".45"/><stop offset="1" stop-color="#64d2ff" stop-opacity="0"/></linearGradient></defs>'
          + (la.area ? '<path d="' + la.area + '" fill="url(#svg-in)"/><path d="' + la.d + '" fill="none" stroke="#64d2ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' : '')
          + (lb.d ? '<path d="' + lb.d + '" fill="none" stroke="#32d74b" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"/>' : '') + '</svg>';
      });
    }

    // ---- shell and layout
    var searchRow = h('div.sv-sr', null, h('span.sv-si', { html: UI.icon('search', 18) }), search);
    var appsBlock = h('div.sv-main', null, searchRow, appsHead, grid, tail), info = h('div.sv-two', null, bkCard, upCard);
    shell = g.OkieMotor.appshell.create(container, ctx, {
      id: 'server', title: t('app.server'), subtitle: '', icon: 'server', gradient: ['#1d2a3d', '#3d5a7a'], slim: true, tabs: [],
      actions: [{ icon: 'pencil', label: t('sv.edit'), onClick: toggleEdit }], onTab: function () {},
    });
    var body = shell.body;
    function isSide() { var a = shell.hero.getBoundingClientRect(), b = shell.main.getBoundingClientRect(); return a.width > 0 && b.width > 0 && b.left >= a.right - 2; }
    function place() {
      var side = isSide(); lastSide = side;
      shell.el.dataset.stack = side ? '1' : '';
      body.innerHTML = '';
      if (side) { shell.hero.appendChild(stack); body.appendChild(appsBlock); body.appendChild(info); }
      else { body.appendChild(appsBlock); body.appendChild(stack); body.appendChild(info); }      // a phone: the apps first (what you tap most), then how the machine is doing
      shell.refreshScroll();
    }
    body.appendChild(appsBlock); body.appendChild(stack); body.appendChild(info);
    drawApps(); drawTail(); paint();
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(function () { requestAnimationFrame(function () { if (!disposed && isSide() !== lastSide) place(); }); }); ro.observe(shell.el); }
    requestAnimationFrame(place);
    var timer = setInterval(function () { if (!disposed) paint(); }, 10000);
    return { update: paint, dispose: function () { disposed = true; clearInterval(timer); if (ro) ro.disconnect(); shell.dispose(); } };
  }

  g.OkieMotor.apps.register({ id: 'server', nameKey: 'app.server', name: 'Server', icon: 'server', color: '#5e8bc7', order: 65, category: 'system', render: renderServer });

  var CSS = [
    '.sv-stack,.sv-main{--sv-ok:#32d74b;--sv-warn:#ff9f0a;--sv-bad:#ff453a;}',
    '.sv-stack{display:flex;flex-direction:column;gap:12px;margin:18px 0 14px;}',
    '.dt-hero>.sv-stack{position:relative;z-index:2;flex:1;min-height:0;margin:2px 16px 16px;overflow-y:auto;scrollbar-width:none;}.dt-hero>.sv-stack::-webkit-scrollbar{display:none;}.dt[data-stack="1"] .dt-iconbg{display:none;}',
    '.sv-card{padding:14px 16px;border-radius:22px;background:rgba(255,255,255,.07);}.sv-card[hidden]{display:none;}',
    '.dt-hero>.sv-stack .sv-card{background:rgba(20,18,16,.42);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);}',
    '.sv-h{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:10px;}.sv-h b{font-size:15px;font-weight:600;}.sv-meta{font-size:12px;color:var(--okie-text-dim);}',
    '.sv-badge{padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:600;letter-spacing:.02em;background:rgba(255,255,255,.12);}.sv-badge:empty{display:none;}.sv-badge.ok{background:rgba(50,215,75,.22);color:#6df08a;}.sv-badge.warn{background:rgba(255,159,10,.22);color:#ffc15a;}.sv-badge.bad{background:rgba(255,69,58,.24);color:#ff8a82;}',
    '.sv-rings{display:flex;justify-content:space-around;gap:10px;}.sv-rings[hidden]{display:none;}.sv-g{display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0;}.sv-g[hidden]{display:none;}',
    '.sv-gw{position:relative;width:104px;height:104px;}.sv-gr svg{width:100%;height:100%;transform:rotate(-90deg);display:block;}.sv-gr circle{fill:none;stroke-width:10;}.sv-gr .gt{stroke:rgba(255,255,255,.14);}.sv-gr .ga{stroke:var(--sv-ok);stroke-linecap:round;stroke-dasharray:0 100;transition:stroke-dasharray .8s cubic-bezier(.2,.8,.2,1),stroke .4s ease;}',
    '.sv-gv{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}.sv-gv b{font-size:26px;font-weight:600;letter-spacing:-.02em;}.sv-gv small{font-size:11px;color:var(--okie-text-dim);}',
    '.sv-gl{font-size:13px;font-weight:600;}.sv-gc{font-size:12px;color:var(--okie-text-dim);min-height:15px;text-align:center;}.sv-nodata{font-size:13px;color:var(--okie-text-dim);line-height:1.45;}.sv-nodata[hidden]{display:none;}',
    '.sv-bar{height:10px;border-radius:9999px;background:rgba(255,255,255,.14);overflow:hidden;}.sv-bar i{display:block;height:100%;width:0;border-radius:9999px;transition:width .8s cubic-bezier(.2,.8,.2,1),background .4s ease;}.sv-st{margin-top:8px;font-size:13px;color:var(--okie-text-dim);}',
    '.sv-rates{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;margin-bottom:6px;font-size:13px;}.sv-rates span{display:inline-flex;align-items:baseline;gap:5px;}.sv-rates em{font-style:normal;font-weight:700;}.sv-rin em{color:#64d2ff;}.sv-rout em{color:#32d74b;}.sv-rates small{color:var(--okie-text-dim);}.sv-rates b{font-weight:600;font-size:14px;}.sv-rates.norate .sv-rin,.sv-rates.norate .sv-rout{display:none;}.sv-ip{margin-left:auto;font-size:12px;color:var(--okie-text-dim);}',
    '.sv-chart{height:70px;}.sv-chart[hidden]{display:none;}.sv-chart svg{width:100%;height:70px;display:block;}',
    '.sv-main{min-width:0;}.sv-sr{position:relative;margin-bottom:14px;}.sv-si{position:absolute;left:14px;top:50%;transform:translateY(-50%);color:var(--okie-text-dim);display:grid;pointer-events:none;}.sv-q{max-width:none;padding-left:42px;border-radius:9999px;}',
    '.sv-ah{display:flex;align-items:baseline;gap:8px;margin:0 2px 10px;}.sv-ah b{font-size:17px;font-weight:600;}.sv-ah-n{font-size:12px;color:var(--okie-text-dim);}',
    '.sv-apps{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px;}',
    '.sv-tile{position:relative;display:flex;flex-direction:column;align-items:center;gap:10px;padding:16px 8px 12px;min-width:0;border-radius:20px;background:rgba(255,255,255,.07);cursor:pointer;text-align:center;transition:background .15s ease;}.sv-tile:hover{background:rgba(255,255,255,.11);}.sv-tile:active{background:rgba(255,255,255,.18);}.sv-tile.edit{cursor:default;}',
    '.sv-ic{display:grid;place-items:center;width:52px;height:52px;border-radius:16px;font-size:20px;font-weight:700;color:var(--tc);background:color-mix(in srgb,var(--tc) 24%,rgba(255,255,255,.05));}.sv-tn{font-size:13px;font-weight:500;line-height:1.2;max-width:100%;overflow:hidden;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;}',
    '.sv-tile.edit .sv-ic{animation:sv-wob .5s ease-in-out infinite alternate;}@keyframes sv-wob{from{transform:rotate(-2deg);}to{transform:rotate(2deg);}}@media (prefers-reduced-motion:reduce){.sv-tile.edit .sv-ic{animation:none;}}',
    '.sv-x{position:absolute;top:6px;left:6px;width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:rgba(255,69,58,.9);color:#fff;}.sv-new{border:1.5px dashed rgba(255,255,255,.25);background:none;}.sv-new .sv-ic{color:var(--okie-text-dim);background:rgba(255,255,255,.06);}',
    '.sv-nomatch{grid-column:1/-1;}.sv-edbar{display:flex;gap:10px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap;}',
    '.sv-two{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-top:16px;}.sv-main+.sv-stack+.sv-two{margin-top:0;}',
    '.sv-kv{display:flex;justify-content:space-between;gap:12px;padding:5px 0;font-size:14px;}.sv-kv span{color:var(--okie-text-dim);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.sv-kv b{font-weight:600;white-space:nowrap;}.sv-ok{font-size:14px;color:var(--okie-text-dim);}',
    '.sv-icons{display:grid;grid-template-columns:repeat(auto-fill,minmax(46px,1fr));gap:8px;}.sv-pick{height:46px;border-radius:14px;display:grid;place-items:center;background:rgba(255,255,255,.08);}.sv-pick.on{background:#fff;color:#1d1b19;}',
    '@media (max-width:640px){.sv-gw{width:96px;height:96px;}.sv-gv b{font-size:24px;}}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
})(typeof globalThis !== 'undefined' ? globalThis : window);

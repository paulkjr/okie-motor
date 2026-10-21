/* okie-detail: the detail view. Five tabs per device: Controls, Context,
 * History, Schedule, Settings. Hero side plays a state-matched background
 * video with FSC's six-step fallback, falling back to an icon on a gradient.
 *
 * Contract used by okie-card:
 *   OkieMotor.detail.render(container, ctx, id)       -> { update(), dispose() }
 *   OkieMotor.detail.renderCompact(el, ctx, id)       -> { update(), dispose() }
 *   OkieMotor.detail.prefetch(ctx, id)
 *   OkieMotor.detail.sparkline(ctx, id, container)
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, L = g.OkieMotor.logic, CT = g.OkieMotor.controls, DM = g.OkieMotor.domains, core = g.OkieMotor.core, S = g.OkieMotor.search;
  var h = UI.h;

  core.registerStrings('en', {
    'dt.controls': 'Controls', 'dt.context': 'Context', 'dt.history': 'History', 'dt.schedule': 'Schedule', 'dt.settings': 'Settings',
    'dt.related': 'Related', 'dt.same_area': 'In this room', 'dt.nothing_related': 'No scene, script or automation uses this device yet.', 'dt.nothing_related_hint': 'This tab lists the ones that do, and the scenes and scripts of its room, each with a Run button. Add one in Home Assistant that uses this device and it shows up here.', 'dt.run': 'Run', 'dt.running': 'Started',
    'dt.24h': '24 hours', 'dt.7d': '7 days', 'dt.30d': '30 days', 'dt.changes': 'Changes', 'dt.avg_run': 'Avg. on-time', 'dt.active': 'Active', 'dt.min': 'Min', 'dt.max': 'Max', 'dt.avg': 'Avg',
    'dt.by_hour': 'Time of day', 'dt.durations': 'Time in each state', 'dt.loading': 'Loading history…', 'dt.no_history': 'No history for this period.', 'dt.history_failed': 'Could not load history.',
    'dt.sched_none': 'No schedules for this device yet.', 'dt.sched_add': 'New schedule', 'dt.sched_time': 'Time', 'dt.sched_days': 'Days', 'dt.sched_action': 'Action', 'dt.sched_save': 'Save schedule',
    'dt.sched_missing': 'Schedules need the Scheduler component (HACS: nielsfaber/scheduler-component).', 'dt.sched_deleted': 'Schedule deleted', 'dt.sched_saved': 'Schedule saved', 'dt.sched_na': 'This device type cannot be scheduled.',
    'dt.sched_next': 'Next: {t}', 'dt.sched_off': 'Paused', 'dt.delete': 'Delete',
    'dt.entity_id': 'Entity ID', 'dt.area': 'Room', 'dt.class': 'Device class', 'dt.changed': 'Last changed', 'dt.favorite': 'Favorite', 'dt.hide': 'Hide from search', 'dt.hidden': 'Hidden from search', 'dt.unhide': 'Show in search again',
    'dt.quick': 'Quick control', 'dt.attrs': 'Attributes', 'dt.copied': 'Copied', 'dt.copy': 'Copy', 'dt.q_off': 'Off', 'dt.q_tap': 'Tap', 'dt.q_hold': 'Hold', 'dt.back': 'Back', 'dt.fav_add': 'Add to favorites', 'dt.fav_remove': 'Remove from favorites',
    'dt.on': 'On', 'dt.off': 'Off', 'dt.open': 'Open', 'dt.close': 'Close', 'dt.lock': 'Lock', 'dt.unlock': 'Unlock', 'dt.start': 'Start', 'dt.dock': 'Dock', 'dt.run_scene': 'Run',
    'dt.control_broke': 'These controls hit a problem.', 'dt.retry': 'Retry', 'dt.mon': 'Mon', 'dt.tue': 'Tue', 'dt.wed': 'Wed', 'dt.thu': 'Thu', 'dt.fri': 'Fri', 'dt.sat': 'Sat', 'dt.sun': 'Sun', 'dt.more': 'More',
  });
  core.registerStrings('de', {
    'dt.controls': 'Steuerung', 'dt.context': 'Kontext', 'dt.history': 'Verlauf', 'dt.schedule': 'Zeitplan', 'dt.settings': 'Einstellungen',
    'dt.related': 'Zugehörig', 'dt.same_area': 'In diesem Raum', 'dt.nothing_related': 'Noch keine Szene, kein Skript und keine Automation nutzt dieses Gerät.', 'dt.nothing_related_hint': 'Dieser Tab zeigt die, die es nutzen, und die Szenen und Skripte seines Raums, jeweils mit einem Ausführen-Knopf. Lege in Home Assistant eine an, die dieses Gerät nutzt, und sie erscheint hier.', 'dt.run': 'Ausführen', 'dt.running': 'Gestartet',
    'dt.24h': '24 Stunden', 'dt.7d': '7 Tage', 'dt.30d': '30 Tage', 'dt.changes': 'Wechsel', 'dt.avg_run': 'Ø Einschaltdauer', 'dt.active': 'Aktiv', 'dt.min': 'Min', 'dt.max': 'Max', 'dt.avg': 'Ø',
    'dt.by_hour': 'Tageszeit', 'dt.durations': 'Zeit je Zustand', 'dt.loading': 'Verlauf wird geladen…', 'dt.no_history': 'Kein Verlauf in diesem Zeitraum.', 'dt.history_failed': 'Verlauf konnte nicht geladen werden.',
    'dt.sched_none': 'Noch keine Zeitpläne für dieses Gerät.', 'dt.sched_add': 'Neuer Zeitplan', 'dt.sched_time': 'Uhrzeit', 'dt.sched_days': 'Tage', 'dt.sched_action': 'Aktion', 'dt.sched_save': 'Zeitplan speichern',
    'dt.sched_missing': 'Zeitpläne brauchen die Scheduler-Komponente (HACS: nielsfaber/scheduler-component).', 'dt.sched_deleted': 'Zeitplan gelöscht', 'dt.sched_saved': 'Zeitplan gespeichert', 'dt.sched_na': 'Dieser Gerätetyp lässt sich nicht planen.',
    'dt.sched_next': 'Nächster: {t}', 'dt.sched_off': 'Pausiert', 'dt.delete': 'Löschen',
    'dt.entity_id': 'Entitäts-ID', 'dt.area': 'Raum', 'dt.class': 'Geräteklasse', 'dt.changed': 'Zuletzt geändert', 'dt.favorite': 'Favorit', 'dt.hide': 'In der Suche ausblenden', 'dt.hidden': 'In der Suche ausgeblendet', 'dt.unhide': 'Wieder in der Suche zeigen',
    'dt.quick': 'Schnellsteuerung', 'dt.attrs': 'Attribute', 'dt.copied': 'Kopiert', 'dt.copy': 'Kopieren', 'dt.q_off': 'Aus', 'dt.q_tap': 'Tippen', 'dt.q_hold': 'Halten', 'dt.back': 'Zurück', 'dt.fav_add': 'Zu Favoriten', 'dt.fav_remove': 'Aus Favoriten entfernen',
    'dt.on': 'An', 'dt.off': 'Aus', 'dt.open': 'Öffnen', 'dt.close': 'Schließen', 'dt.lock': 'Verriegeln', 'dt.unlock': 'Entriegeln', 'dt.start': 'Start', 'dt.dock': 'Zurück', 'dt.run_scene': 'Ausführen',
    'dt.control_broke': 'Diese Steuerung hat ein Problem.', 'dt.retry': 'Erneut versuchen', 'dt.mon': 'Mo', 'dt.tue': 'Di', 'dt.wed': 'Mi', 'dt.thu': 'Do', 'dt.fri': 'Fr', 'dt.sat': 'Sa', 'dt.sun': 'So', 'dt.more': 'Mehr',
  });

  var DOMAIN_GRADIENT = {
    light: ['#5a3a08', '#b8760f'], switch: ['#123a29', '#2a7a55'], climate: ['#1b2f5a', '#a8561b'], cover: ['#183d2a', '#2d7a52'], lock: ['#3a1713', '#9a3626'],
    media_player: ['#2b1850', '#6a3fb8'], fan: ['#0f3a3a', '#1f8f8f'], vacuum: ['#14342a', '#2a7a58'], camera: ['#13284a', '#2f5fb0'], sensor: ['#262a30', '#4a5360'],
    binary_sensor: ['#2a2430', '#5a4a68'], weather: ['#17314f', '#3d77b3'], scene: ['#3a2150', '#9a4fb0'], script: ['#2a2e18', '#707a2a'], automation: ['#3a2a12', '#9a6a1a'],
  };

  // ------------------------------------------------------------ history ----
  var histCache = new Map();
  function fetchHistory(ctx, id, range) {
    var key = id + '|' + range, now = Date.now(), hit = histCache.get(key);
    if (hit && now - hit.t < 60000) return hit.p;
    var to = now, from = now - L.RANGES[range];
    var path = 'history/period/' + new Date(from).toISOString() + '?filter_entity_id=' + encodeURIComponent(id) + '&end_time=' + encodeURIComponent(new Date(to).toISOString()) + '&minimal_response&no_attributes';
    var p = Promise.resolve(ctx.hass().callApi('GET', path)).then(function (res) { return { rows: (res && res[0]) || [], from: from, to: to }; });
    histCache.set(key, { t: now, p: p });
    p.catch(function () { histCache.delete(key); });
    return p;
  }
  function prefetch(ctx, id) {
    var st = ctx.state(id);
    if (!st) return;
    fetchHistory(ctx, id, '24h').catch(function () {});
    warmVideo(ctx, id);
  }

  var NS = 'http://www.w3.org/2000/svg';
  function fmtTime(ts, range, lang) {
    var d = new Date(ts);
    if (range === '24h') return d.toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' });
    return d.toLocaleDateString(lang, { month: 'short', day: 'numeric' });
  }
  function timeTicks(from, to, range) {
    var out = [], step = range === '24h' ? 6 * 3600000 : (range === '7d' ? 86400000 : 7 * 86400000);
    var t = Math.ceil(from / step) * step;
    for (; t < to; t += step) out.push(t);
    return out;
  }

  function lineChart(series, from, to, range, lang, unit) {
    var W = 640, H = 220, pad = { l: 40, r: 12, t: 10, b: 26 };
    var pts = L.bucketSeries(series.points, 220);
    var ax = L.niceTicks(series.min, series.max, 4);
    var box = { x: pad.l, y: pad.t, w: W - pad.l - pad.r, h: H - pad.t - pad.b };
    var lp = L.linePath(pts, box, { t0: from, t1: to, v0: ax.min, v1: ax.max });
    var grid = ax.ticks.map(function (v) {
      var y = box.y + box.h - (v - ax.min) / (ax.max - ax.min) * box.h;
      return '<line x1="' + box.x + '" x2="' + (box.x + box.w) + '" y1="' + y + '" y2="' + y + '" stroke="rgba(255,255,255,.1)"/><text x="' + (box.x - 8) + '" y="' + (y + 4) + '" text-anchor="end" fill="rgba(244,241,237,.55)" font-size="11">' + (Math.round(v * 10) / 10) + '</text>';
    }).join('');
    var xl = timeTicks(from, to, range).map(function (t) {
      var x = box.x + (t - from) / (to - from) * box.w;
      return '<text x="' + x + '" y="' + (H - 6) + '" text-anchor="middle" fill="rgba(244,241,237,.55)" font-size="11">' + fmtTime(t, range === '24h' ? '24h' : 'd', lang) + '</text>';
    }).join('');
    var gid = 'lg' + Math.random().toString(36).slice(2, 7);
    var wrap = h('div.chart');
    wrap.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" class="chart-svg"><defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7de4ff" stop-opacity=".45"/><stop offset="1" stop-color="#7de4ff" stop-opacity="0"/></linearGradient></defs>'
      + grid + xl + '<path d="' + lp.area + '" fill="url(#' + gid + ')"/><path d="' + lp.d + '" fill="none" stroke="#7de4ff" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>'
      + '<line class="xh" y1="' + box.y + '" y2="' + (box.y + box.h) + '" stroke="rgba(255,255,255,.5)" stroke-dasharray="3 3" visibility="hidden"/><circle class="xd" r="4.5" fill="#fff" visibility="hidden"/></svg><div class="tip" hidden></div>';
    var svg = wrap.firstChild, xh = svg.querySelector('.xh'), xd = svg.querySelector('.xd'), tip = wrap.querySelector('.tip');
    function show(e) {
      var r = UI.screenRect(svg), fx = (e.clientX - r.left) / r.width * W;
      var best = null, bd = 1e9;
      lp.xy.forEach(function (q, i) { var d = Math.abs(q.x - fx); if (d < bd) { bd = d; best = i; } });
      if (best == null) return;
      var q = lp.xy[best], p = pts[best];
      xh.setAttribute('x1', q.x); xh.setAttribute('x2', q.x); xh.setAttribute('visibility', 'visible');
      xd.setAttribute('cx', q.x); xd.setAttribute('cy', q.y); xd.setAttribute('visibility', 'visible');
      tip.hidden = false; tip.textContent = (Math.round(p.v * 10) / 10) + (unit ? ' ' + unit : '') + ' · ' + fmtTime(p.t, range, lang) + (range === '24h' ? '' : ' ' + new Date(p.t).toLocaleTimeString(lang, { hour: '2-digit', minute: '2-digit' }));
      tip.style.left = Math.min(r.width - 140, Math.max(0, q.x / W * r.width - 60)) + 'px';
    }
    function hide() { xh.setAttribute('visibility', 'hidden'); xd.setAttribute('visibility', 'hidden'); tip.hidden = true; }
    svg.addEventListener('pointermove', show); svg.addEventListener('pointerleave', hide); svg.addEventListener('pointerdown', show);
    return wrap;
  }

  function stateColor(state) { return L.isActive(state) ? '#2fa35c' : (state === 'unavailable' || state === 'unknown' ? '#8a4a4a' : 'rgba(255,255,255,.22)'); }

  function renderHistory(ctx, item, root) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var range = ctx.store.get('dt.range', '24h');
    var seg = CT.createSegment({ options: ['24h', '7d', '30d'].map(function (r) { return { id: r, label: t('dt.' + r) }; }), value: range, ariaLabel: t('dt.history'), onChange: function (r) { range = r; ctx.store.set('dt.range', r); load(); } });
    var body = h('div.hbody');
    root.appendChild(h('div.hhead', null, seg.el)); root.appendChild(body);
    var token = 0;
    function load() {
      var my = ++token;
      body.innerHTML = ''; body.appendChild(h('div.note-l', null, t('dt.loading')));
      fetchHistory(ctx, item.id, range).then(function (d) {
        if (my !== token) return;
        body.innerHTML = '';
        var segs = L.toSegments(d.rows, d.from, d.to);
        if (!segs.length) { body.appendChild(h('div.note-l', null, t('dt.no_history'))); return; }
        var num = L.numericSeries(segs);
        var numeric = num.points.length >= Math.max(3, segs.length * 0.6);
        var unit = (ctx.state(item.id) || { attributes: {} }).attributes.unit_of_measurement || '';
        if (numeric) {
          body.appendChild(h('div.cards', null,
            card(t('dt.min'), fmt(num.min) + unit), card(t('dt.avg'), fmt(num.avg) + unit), card(t('dt.max'), fmt(num.max) + unit)));
          body.appendChild(lineChart(num, d.from, d.to, range, ctx.lang(), unit));
        } else {
          var st = L.historyStats(segs);
          body.appendChild(h('div.cards', null, card(t('dt.changes'), String(st.changes)), card(t('dt.avg_run'), st.runs ? L.fmtDuration(st.avgActiveRunMs) : '–'), card(t('dt.active'), Math.round(st.activePct * 100) + '%')));
          // state timeline
          var total = d.to - d.from, tl = h('div.timeline');
          segs.forEach(function (s) { tl.appendChild(h('i', { style: { width: ((s.to - s.from) / total * 100) + '%', background: stateColor(s.state) }, title: s.state + ' · ' + L.fmtDuration(s.to - s.from) })); });
          body.appendChild(tl);
          // durations by state
          var dur = L.durationsByState(segs);
          body.appendChild(h('div.lbl', null, t('dt.durations')));
          var list = h('div.kv');
          Object.keys(dur).sort(function (a, b) { return dur[b] - dur[a]; }).forEach(function (k) {
            list.appendChild(h('div.kvr', null, h('span', null, L.stateLabel(k, ctx.lang())), h('b', null, L.fmtDuration(dur[k]))));
          });
          body.appendChild(list);
          // time of day
          var hrs = L.hourlyActivity(segs), mx = Math.max.apply(null, hrs) || 1;
          body.appendChild(h('div.lbl', null, t('dt.by_hour')));
          var bars = h('div.hours');
          hrs.forEach(function (m, i) { bars.appendChild(h('div.hr', { title: i + ':00 · ' + Math.round(m) + ' min' }, h('i', { style: { height: Math.max(2, m / mx * 100) + '%' } }), i % 6 === 0 ? h('span', null, String(i)) : null)); });
          body.appendChild(bars);
        }
      }, function () { if (my === token) { body.innerHTML = ''; body.appendChild(h('div.note-l', null, t('dt.history_failed'))); } });
    }
    function fmt(v) { return v == null ? '–' : String(Math.round(v * 10) / 10).replace('.', ctx.lang() === 'de' ? ',' : '.'); }
    function card(label, value) { return h('div.stat', null, h('div.stat-v', null, value), h('div.stat-l', null, label)); }
    load();
    return { dispose: function () { token++; } };
  }

  function sparkline(ctx, id, container) {
    fetchHistory(ctx, id, '24h').then(function (d) {
      var num = L.numericSeries(L.toSegments(d.rows, d.from, d.to));
      if (num.points.length < 3) return;
      var W = 300, H = 56, pts = L.bucketSeries(num.points, 80);
      var lp = L.linePath(pts, { x: 2, y: 4, w: W - 4, h: H - 8 }, { t0: d.from, t1: d.to, v0: num.min, v1: num.max });
      container.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" style="width:100%;height:56px"><path d="' + lp.d + '" fill="none" stroke="#7de4ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/></svg>';
    }, function () {});
  }

  // ------------------------------------------------------------ context ----
  function renderContext(ctx, item, root) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var body = h('div.ctxbody'); root.appendChild(body);
    var related = { scene: [], script: [], automation: [] }, alive = true;
    function entry(id) {
      var it = ctx.engine.getItem(id); if (!it) return null;
      var svcName = it.domain === 'automation' ? 'trigger' : 'turn_on';
      return h('div.ctxrow', null, h('span', { html: UI.icon(UI.domainIcon(it.domain), 22) }), h('span.ctxname', null, it.name),
        h('button.act', { onclick: function () { ctx.call(it.domain, svcName, { entity_id: id }).then(function () { ctx.toast('success', t('dt.running') + ': ' + it.name); ctx.engine.recordUse(id); }, function () { ctx.toast('error', it.name); }); } }, h('span', { html: UI.icon('play', 16) }), h('span', null, t('dt.run'))));
    }
    function draw() {
      if (!alive) return;
      body.innerHTML = '';
      var seen = new Set(), relIds = [];
      ['scene', 'script', 'automation'].forEach(function (d) { related[d].forEach(function (id) { if (!seen.has(id)) { seen.add(id); relIds.push(id); } }); });
      var area = ctx.engine.all().filter(function (i) { return (i.domain === 'scene' || i.domain === 'script') && item.areaId && i.areaId === item.areaId && !seen.has(i.id); });
      var nameHit = ctx.engine.all().filter(function (i) { return (i.domain === 'scene' || i.domain === 'script' || i.domain === 'automation') && !seen.has(i.id) && !area.includes(i) && L.shortName(item.name, item.area).length > 3 && i.name.toLowerCase().indexOf(L.shortName(item.name, item.area).toLowerCase()) >= 0; });
      var sec = function (title, ids) { if (!ids.length) return; body.appendChild(h('div.lbl', null, title)); ids.slice(0, 12).forEach(function (id) { var e = entry(id); if (e) body.appendChild(e); }); };
      sec(t('dt.related'), relIds.concat(nameHit.map(function (i) { return i.id; })));
      sec(t('dt.same_area'), area.map(function (i) { return i.id; }));
      if (!body.children.length) { body.appendChild(h('div.note-l', null, t('dt.nothing_related'))); body.appendChild(h('div.note-l.ctx-hint', null, t('dt.nothing_related_hint'))); }
    }
    draw();
    Promise.resolve(ctx.callWS({ type: 'search/related', item_type: 'entity', item_id: item.id })).then(function (r) {
      ['scene', 'script', 'automation'].forEach(function (d) { related[d] = (r && r[d]) || []; });
      draw();
    }, function () {});
    return { dispose: function () { alive = false; } };
  }

  // ----------------------------------------------------------- schedule ----
  var DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  function createWheel(o) {
    var rowH = 44, el = h('div.wheel', { tabindex: '0', role: 'listbox', 'aria-label': o.label || '' });
    var inner = h('div.wheel-in');
    el.appendChild(inner);
    o.values.forEach(function (v) { inner.appendChild(h('div.wi', { role: 'option' }, v)); });
    var idx = Math.max(0, o.values.indexOf(o.value));
    function go(i, smooth) { idx = Math.min(o.values.length - 1, Math.max(0, i)); el.scrollTo({ top: idx * rowH, behavior: smooth ? 'smooth' : 'auto' }); }
    var timer = 0;
    el.addEventListener('scroll', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { var i = Math.round(el.scrollTop / rowH); if (i !== idx) { idx = i; if (o.onChange) o.onChange(o.values[i]); } mark(); }, 90);
    }, { passive: true });
    el.addEventListener('keydown', function (e) { if (e.key === 'ArrowDown') { e.preventDefault(); go(idx + 1, true); if (o.onChange) o.onChange(o.values[idx]); } else if (e.key === 'ArrowUp') { e.preventDefault(); go(idx - 1, true); if (o.onChange) o.onChange(o.values[idx]); } });
    function mark() { Array.prototype.forEach.call(inner.children, function (c, i) { c.classList.toggle('sel', i === idx); c.setAttribute('aria-selected', i === idx ? 'true' : 'false'); }); }
    requestAnimationFrame(function () { go(idx, false); mark(); });
    return { el: el, get value() { return o.values[idx]; }, set: function (v) { go(o.values.indexOf(v), false); mark(); } };
  }

  function actionsFor(item, t) {
    switch (item.domain) {
      case 'light': case 'switch': case 'fan': case 'input_boolean': case 'media_player': case 'humidifier':
        return [{ id: 'on', label: t('dt.on'), service: item.domain + '.turn_on' }, { id: 'off', label: t('dt.off'), service: item.domain + '.turn_off' }];
      case 'climate': return [{ id: 'on', label: t('dt.on'), service: 'climate.turn_on' }, { id: 'off', label: t('dt.off'), service: 'climate.turn_off' }];
      case 'cover': return [{ id: 'open', label: t('dt.open'), service: 'cover.open_cover' }, { id: 'close', label: t('dt.close'), service: 'cover.close_cover' }];
      case 'lock': return [{ id: 'lock', label: t('dt.lock'), service: 'lock.lock' }, { id: 'unlock', label: t('dt.unlock'), service: 'lock.unlock' }];
      case 'vacuum': return [{ id: 'start', label: t('dt.start'), service: 'vacuum.start' }, { id: 'dock', label: t('dt.dock'), service: 'vacuum.return_to_base' }];
      case 'scene': return [{ id: 'run', label: t('dt.run_scene'), service: 'scene.turn_on' }];
      case 'script': return [{ id: 'run', label: t('dt.run_scene'), service: 'script.turn_on' }];
      default: return [];
    }
  }

  function renderSchedule(ctx, item, root) {
    if (item.domain === 'vacuum' && g.OkieMotor.vacSchedule) return g.OkieMotor.vacSchedule.render(ctx, item, root);                  // a robot vacuum gets the weekly schedule with jobs (clean, dock, a room, mop ...)
    if (item.domain === 'climate' && g.OkieMotor.thermoSchedule) return g.OkieMotor.thermoSchedule.render(ctx, item, root);      // a thermostat gets the weekly schedule with degrees, not just on and off
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var hs = ctx.hass();
    var has = !!(hs.services && hs.services.scheduler && hs.services.scheduler.add);
    var list = h('div.sched-list'), form = h('div.sched-form');
    root.appendChild(list);
    var acts = actionsFor(item, t);
    function mine() {
      var states = ctx.hass().states;
      return Object.keys(states).filter(function (k) { return /^switch\.schedule_/.test(k) && (states[k].attributes.entities || []).indexOf(item.id) >= 0; });
    }
    function drawList() {
      list.innerHTML = '';
      var ids = mine();
      if (!ids.length) list.appendChild(h('div.note-l', null, t('dt.sched_none')));
      ids.forEach(function (id) {
        var st = ctx.state(id), a = st.attributes;
        var slots = (a.timeslots || []).map(function (s) { return String(s).slice(0, 5); }).join(', ');
        var days = (a.weekdays || []).map(function (d) { return t('dt.' + String(d).slice(0, 3)); }).join(' ');
        var next = a.next_trigger ? t('dt.sched_next', { t: new Date(a.next_trigger).toLocaleString(ctx.lang(), { weekday: 'short', hour: '2-digit', minute: '2-digit' }) }) : '';
        var on = st.state === 'on';
        list.appendChild(h('div.schedrow', null,
          h('div.sr-main', null, h('div.sr-t', null, a.name || slots || id), h('div.sr-s', null, [slots, days, on ? next : t('dt.sched_off')].filter(Boolean).join(' · '))),
          h('button.sw' + (on ? '.on' : ''), { role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': a.name || id, onclick: function () { ctx.call('switch', 'toggle', { entity_id: id }).catch(function () {}); } }, h('i')),
          h('button.mini', { 'aria-label': t('dt.delete'), onclick: function () {
            var row = this.closest('.schedrow'); row.style.display = 'none';
            ctx.defer(t('dt.sched_deleted'),
              function () { ctx.call('scheduler', 'remove', { entity_id: id }).catch(function () { row.style.display = ''; ctx.toast('error', t('dt.delete')); }); },
              function () { row.style.display = ''; });
          }, html: UI.icon('trash', 18) })));
      });
    }
    drawList();
    if (!has) { root.appendChild(h('div.note-l.warn', null, t('dt.sched_missing'))); return { update: drawList, dispose: function () {} }; }
    if (!acts.length) { root.appendChild(h('div.note-l', null, t('dt.sched_na'))); return { update: drawList, dispose: function () {} }; }
    // add form: stacked wheel cards (iOS style), day chips, action
    var hours = [], mins = [];
    for (var i = 0; i < 24; i++) hours.push((i < 10 ? '0' : '') + i);
    for (var j = 0; j < 60; j += 5) mins.push((j < 10 ? '0' : '') + j);
    var now = new Date();
    var wh = createWheel({ values: hours, value: (now.getHours() < 10 ? '0' : '') + now.getHours(), label: 'Hour' });
    var wm = createWheel({ values: mins, value: mins[Math.min(mins.length - 1, Math.round(now.getMinutes() / 5))], label: 'Minute' });
    var selDays = new Set(DAYS);
    var dayRow = h('div.chiprow');
    function drawDays() { dayRow.innerHTML = ''; DAYS.forEach(function (d) { dayRow.appendChild(h('button.cp' + (selDays.has(d) ? '.on' : ''), { 'aria-pressed': selDays.has(d) ? 'true' : 'false', onclick: function () { if (selDays.has(d)) selDays.delete(d); else selDays.add(d); if (!selDays.size) selDays.add(d); drawDays(); } }, t('dt.' + d))); }); }
    drawDays();
    var actSel = acts[0].id;
    var actSeg = CT.createSegment({ options: acts.map(function (a) { return { id: a.id, label: a.label }; }), value: actSel, ariaLabel: t('dt.sched_action'), onChange: function (v) { actSel = v; } });
    var save = h('button.act.primary', { onclick: function () {
      var a = acts.filter(function (x) { return x.id === actSel; })[0];
      ctx.call('scheduler', 'add', {
        weekdays: DAYS.filter(function (d) { return selDays.has(d); }),
        timeslots: [{ start: wh.value + ':' + wm.value + ':00', actions: [{ service: a.service, entity_id: item.id }] }],
        repeat_type: 'repeat', name: item.name + ' ' + a.label + ' ' + wh.value + ':' + wm.value,
      }).then(function () { ctx.toast('success', t('dt.sched_saved')); setTimeout(drawList, 600); }, function () { ctx.toast('error', t('dt.sched_save')); });
    } }, t('dt.sched_save'));
    form.appendChild(h('div.lbl', null, t('dt.sched_add')));
    form.appendChild(h('div.wheels', null, wh.el, h('div.colon', null, ':'), wm.el));
    form.appendChild(h('div.lbl', null, t('dt.sched_days'))); form.appendChild(dayRow);
    form.appendChild(h('div.lbl', null, t('dt.sched_action'))); form.appendChild(actSeg.el);
    form.appendChild(save);
    root.appendChild(form);
    return { update: drawList, dispose: function () {} };
  }

  // ----------------------------------------------------------- settings ----
  function renderSettings(ctx, item, root) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var st = ctx.state(item.id) || { attributes: {} };
    function kv(label, val, copy) {
      var row = h('div.kvr', null, h('span', null, label), h('b', null, val || '–'));
      if (copy) row.appendChild(h('button.mini', { 'aria-label': t('dt.copy'), onclick: function () { try { navigator.clipboard.writeText(val); ctx.toast('success', t('dt.copied')); } catch (e) {} }, html: UI.icon('check', 16) }));
      return row;
    }
    var extras = null;
    if (item.domain === 'climate' && DM.climateExtras) { extras = DM.climateExtras(ctx, item); if (!extras.empty) { extras.set(st.attributes); root.appendChild(extras.el); } else extras = null; }
    var look = null;
    if (item.domain === 'climate' && g.OkieMotor.thermo && g.OkieMotor.thermo.lookPanel) { look = g.OkieMotor.thermo.lookPanel(ctx, item); root.appendChild(look.el); }
    root.appendChild(h('div.kv', null,
      kv(t('dt.entity_id'), item.id, true), kv(t('dt.area'), item.area), kv(t('dt.class'), st.attributes.device_class || item.deviceClass),
      kv(t('dt.changed'), st.last_changed ? L.relativeTime(Date.now() - Date.parse(st.last_changed), ctx.lang()) : '')));
    // favorite
    var fav = ctx.favorites.has(item.id);
    var favBtn = h('button.act', { onclick: function () { var on = ctx.favorites.toggle(item.id); favBtn.lastChild.textContent = on ? t('dt.fav_remove') : t('dt.fav_add'); } }, h('span', { html: UI.icon('heart', 18) }), h('span', null, fav ? t('dt.fav_remove') : t('dt.fav_add')));
    // hide from search
    var excluded = ctx.settings.get().excluded.indexOf(item.id) >= 0;
    var hideBtn = h('button.act', { onclick: function () {
      var ex = ctx.settings.get().excluded.slice(), i = ex.indexOf(item.id);
      if (i >= 0) ex.splice(i, 1); else ex.push(item.id);
      ctx.settings.set({ excluded: ex }); hideBtn.lastChild.textContent = i >= 0 ? t('dt.hide') : t('dt.unhide');
    } }, h('span', { html: UI.icon('eye', 18) }), h('span', null, excluded ? t('dt.unhide') : t('dt.hide')));
    root.appendChild(h('div.actrow', null, favBtn, hideBtn));
    // quick control for this domain
    var q = ctx.settings.get().quickControl[item.domain];
    if (q !== undefined || L.DEFAULT_QUICK[item.domain]) {
      var qseg = CT.createSegment({ options: [{ id: 'off', label: t('dt.q_off') }, { id: 'tap', label: t('dt.q_tap') }, { id: 'hold', label: t('dt.q_hold') }], value: q || L.DEFAULT_QUICK[item.domain] || 'off', ariaLabel: t('dt.quick'), onChange: function (v) { var o = {}; o[item.domain] = v; ctx.settings.set({ quickControl: o }); } });
      root.appendChild(h('div.lbl', null, t('dt.quick') + ' · ' + item.domain)); root.appendChild(qseg.el);
    }
    // attributes
    var det = h('details.attrs', null, h('summary', null, t('dt.attrs')));
    var al = h('div.kv');
    Object.keys(st.attributes).forEach(function (k) { var v = st.attributes[k]; al.appendChild(h('div.kvr', null, h('span', null, k.replace(/_/g, ' ')), h('b', null, typeof v === 'object' ? JSON.stringify(v).slice(0, 120) : String(v)))); });
    det.appendChild(al); root.appendChild(det);
    return { dispose: function () { if (look) look.dispose(); }, update: function () { if (extras) extras.set((ctx.state(item.id) || { attributes: {} }).attributes); } };
  }

  // -------------------------------------------------------------- video ----
  // Does this clip exist? One HEAD per file, remembered in memory and in the store
  // (missing clips for 6 h, present ones for a day) so a missing pack is not re-probed every open.
  var probe = new Map();
  var PROBE_TTL = { no: 6 * 3600000, yes: 24 * 3600000 };
  function exists(url, ctx) {
    if (probe.has(url)) return probe.get(url);
    var saved = ctx && ctx.store.get('video.probe', {}) || {}, hit = saved[url], now = Date.now();
    if (hit && now - hit[1] < (hit[0] ? PROBE_TTL.yes : PROBE_TTL.no)) { var r = Promise.resolve(!!hit[0]); probe.set(url, r); return r; }
    var p = fetch(url, { method: 'HEAD' }).then(function (res) { return res.ok && /video|octet/.test(res.headers.get('content-type') || 'video'); }, function () { return false; });
    probe.set(url, p);
    p.then(function (ok) { if (!ctx) return; var m = ctx.store.get('video.probe', {}) || {}; m[url] = [ok ? 1 : 0, now]; ctx.store.set('video.probe', m); });
    return p;
  }
  function videoFor(ctx, item, st) {
    var cfg = ctx.settings.get().videos;
    if (!cfg || !cfg.enabled || (cfg.mobile === false && ctx.host && ctx.host._mobile)) return Promise.resolve(null);
    return L.resolveVideo({ base: cfg.path, domain: item.domain, deviceClass: (st.attributes && st.attributes.device_class) || item.deviceClass, state: st.state, exists: function (u) { return exists(u, ctx); } });
  }
  function warmVideo(ctx, id) { var it = ctx.engine.getItem(id), st = ctx.state(id); if (it && st) videoFor(ctx, it, st).catch(function () {}); }

  // ------------------------------------------------------------- render ----
  var TABS = [{ id: 'controls', icon: 'sliders' }, { id: 'context', icon: 'spark' }, { id: 'history', icon: 'chart' }, { id: 'schedule', icon: 'clock' }, { id: 'settings', icon: 'gear' }];

  function render(container, ctx, id) {
    var item = ctx.engine.getItem(id);
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var st = ctx.state(id) || { state: item.state, attributes: {} };
    var grad = DOMAIN_GRADIENT[item.domain] || ['#26282c', '#4a4f58'];
    var hero = h('div.dt-hero', { style: { background: 'linear-gradient(160deg,' + grad[0] + ',' + grad[1] + ')' } });
    var iconBg = h('div.dt-iconbg');
    var vidA = h('video.dt-video', { muted: true, loop: true, autoplay: true, playsInline: true, preload: 'auto' }), vidB = h('video.dt-video', { muted: true, loop: true, autoplay: true, playsInline: true, preload: 'auto' });
    vidA.muted = vidB.muted = true;
    var back = h('button.dt-circ', { 'aria-label': t('dt.back'), onclick: function () { ctx.back(); }, html: UI.icon('back', 22) });
    var heart = h('button.dt-circ', { 'aria-label': t('dt.fav_add'), 'aria-pressed': 'false', onclick: function () { var on = ctx.favorites.toggle(id); heart.classList.toggle('on', on); heart.setAttribute('aria-pressed', on ? 'true' : 'false'); } }, h('span', { html: UI.icon('heart', 20) }));
    heart.classList.toggle('on', ctx.favorites.has(id));
    var title = h('div.dt-title', null, item.name), sub = h('div.dt-sub');
    hero.appendChild(iconBg); hero.appendChild(vidA); hero.appendChild(vidB);
    hero.appendChild(h('div.dt-top', null, back, h('div.dt-head', null, title, sub), heart));
    var wx = null;      // the weather screen has two pages: the first fills the hero, the second is the Controls tab (okie-weather)
    if (item.domain === 'weather' && g.OkieMotor.weather && g.OkieMotor.weather.create) { try { wx = g.OkieMotor.weather.create(ctx, item); hero.insertBefore(wx.sky, hero.firstChild); hero.appendChild(wx.hero); } catch (e) { wx = null; } }
    iconBg.innerHTML = UI.icon(UI.domainIcon(item.domain, item.deviceClass, st.state), 170);

    var bar = h('div.dt-bar', { role: 'tablist' });
    // on a phone the five tabs sit behind a round bubble (it shows the open tab); a tap opens it into the row, a choice or a tap elsewhere closes it
    var bubble = h('button.dt-bubble', { 'aria-haspopup': 'true', 'aria-expanded': 'false', onclick: function (e) { e.stopPropagation(); ctx.haptic(10); openMenu(); } });
    var menu = h('div.dt-menu', null, bubble, bar);
    function openMenu() { menu.classList.add('open'); bubble.setAttribute('aria-expanded', 'true'); }
    function closeMenu() { menu.classList.remove('open'); bubble.setAttribute('aria-expanded', 'false'); }
    var body = h('div.dt-body.okie-scroll');
    var bodyHost = h('div.dt-bodyhost', null, body);
    var main = h('div.dt-main', null, menu, bodyHost);
    var root = h('div.dt', { dataset: { domain: item.domain } }, hero, main);
    if (wx) root.dataset.wx = 'true';
    if (DM.usesDial && DM.usesDial(ctx, item)) root.dataset.dial = 'true';      // the wheel runs edge to edge on the Controls tab
    container.appendChild(root);
    if (wx) { container.appendChild(wx.dots); wx.watch(root); }
    var sbar = UI.attachScrollbar(body, bodyHost);

    var tab = 'controls', active = null, control = null, leaving = 0;   // always open on the controls; a tap on a light should not land on last week's history
    root.addEventListener('pointerdown', function (e) { if (menu.classList.contains('open') && !(e.composedPath ? e.composedPath() : [e.target]).some(function (n) { return n === menu; })) closeMenu(); });
    function markTab(id2) {
      Array.prototype.forEach.call(bar.children, function (b) { var on = b.dataset.tab === id2; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      TABS.forEach(function (tb) { if (tb.id === id2) { bubble.innerHTML = UI.icon(tb.icon, 17); bubble.setAttribute('aria-label', t('dt.' + tb.id) + ' (menu)'); } });
    }
    // leaving the controls of a thermostat: the wheel rolls out to the right first (the way it rolled in), then the next tab appears; the last tap wins
    function selectTab(id2) {
      if (tab === 'controls' && id2 !== 'controls' && control && control.rollOut) {
        var mine = ++leaving; markTab(id2);
        control.rollOut().then(function () { if (mine === leaving) showTab(id2); });
        return;
      }
      showTab(id2);
    }
    function showTab(id2) {
      tab = id2; leaving = 0; root.dataset.tab = id2;      // the thermostat's dial runs edge to edge only on its controls; every other tab keeps the usual padding
      if (active && active.dispose) active.dispose();
      control = null; body.innerHTML = ''; body.scrollTop = 0;
      markTab(id2);
      var wrap = h('div.tabwrap'); body.appendChild(wrap);
      if (id2 === 'controls') {
        // a broken domain control leaves a retry box here; hero, tabs and back button keep working
        wrap.appendChild(UI.guard(function () {
          var c = DM.forItem(item.domain)(ctx, item, { openTab: selectTab, wx: wx });
          c.update(ctx.state(id) || st); control = c; return c.el;
        }, { label: 'controls ' + item.domain, text: t('dt.control_broke'), retry: t('dt.retry') }));
        active = { dispose: function () { if (control && control.dispose) control.dispose(); }, update: function () { if (control) control.update(ctx.state(id) || st); } };
      } else if (id2 === 'context') active = renderContext(ctx, item, wrap);
      else if (id2 === 'history') active = renderHistory(ctx, item, wrap);
      else if (id2 === 'schedule') active = renderSchedule(ctx, item, wrap);
      else active = renderSettings(ctx, item, wrap);
      requestAnimationFrame(function () { sbar.update(); });
    }
    TABS.forEach(function (tb) {
      bar.appendChild(h('button.dt-tab', { role: 'tab', dataset: { tab: tb.id }, 'aria-label': t('dt.' + tb.id), title: t('dt.' + tb.id), onclick: function () { ctx.haptic(10); closeMenu(); selectTab(tb.id); } }, h('span', { html: UI.icon(tb.icon, 20) })));
    });
    showTab(tab);

    // ---- video background, swapped when the normalised state changes ----
    var curKey = '', front = vidA, backV = vidB, token = 0;
    function applyVideo() {
      var s = ctx.state(id) || st;
      var key = L.normalizeState(item.domain, s.state);
      if (key === curKey) return;
      curKey = key;
      var my = ++token;
      videoFor(ctx, item, s).then(function (url) {
        if (my !== token) return;
        if (!url) { front.classList.remove('on'); backV.classList.remove('on'); return; }
        if (front.getAttribute('src') === url) return;
        backV.src = url;
        var show = function () { if (my !== token) return; backV.classList.add('on'); front.classList.remove('on'); var tmp = front; front = backV; backV = tmp; try { front.play(); } catch (e) {} };
        if (backV.readyState >= 3) show(); else backV.addEventListener('canplay', show, { once: true });
        backV.load();
      }, function () {});
    }
    applyVideo();

    function update() {
      var s = ctx.state(id); if (!s) return;
      sub.textContent = [item.area, L.describeState(item.domain, s, ctx.lang())].filter(Boolean).join(' · ');
      iconBg.innerHTML = UI.icon(UI.domainIcon(item.domain, s.attributes.device_class || item.deviceClass, s.state), 170);
      if (wx) wx.update();
      if (control) control.update(s);
      else if (active && active.update && tab !== 'controls') active.update();
      applyVideo();
    }
    update();
    // before the card closes the view (back arrow, Escape): a thermostat's wheel rolls out to the right first, the way it does when another tab is chosen; null = nothing to wait for
    return { update: update, beforeClose: function () { return (tab === 'controls' && control && control.rollOut) ? control.rollOut() : null; }, dispose: function () { token++; if (wx) { wx.dispose(); if (wx.dots.parentNode) wx.dots.remove(); } if (active && active.dispose) active.dispose(); sbar.destroy(); vidA.removeAttribute('src'); vidB.removeAttribute('src'); } };
  }

  function renderCompact(el, ctx, id) {
    var item = ctx.engine.getItem(id);
    var c = DM.forItem(item.domain)(ctx, item, { compact: true });
    el.appendChild(c.el);
    var st = ctx.state(id); if (st) c.update(st);
    var off = ctx.bus.on('states', function (list) { if (list.some(function (x) { return x.id === id; })) { var s = ctx.state(id); if (s) c.update(s); } });
    return { update: function () { var s = ctx.state(id); if (s) c.update(s); }, dispose: function () { off(); c.dispose(); } };
  }

  var CSS = [
    '.dt{display:grid;grid-template-columns:minmax(260px,42%) 1fr;height:100%;min-height:0;}',
    '.dt-hero{position:relative;overflow:hidden;display:flex;flex-direction:column;}',
    '.dt-iconbg{position:absolute;inset:0;display:grid;place-items:center;opacity:.22;}',
    '.dt[data-domain="vacuum"] .dt-iconbg{display:none;}',                                    // the robot of the vacuum screen is the picture
    '.dt-video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0;transition:opacity .6s ease;}',
    '.dt-video.on{opacity:1;}',
    '.dt-hero::after{content:"";position:absolute;inset:0;background:linear-gradient(to bottom,rgba(0,0,0,.35),transparent 30%,transparent 70%,rgba(0,0,0,.25));pointer-events:none;}',
    '.dt-top{position:relative;z-index:2;display:flex;align-items:center;gap:12px;padding:18px;}',
    '.dt-head{flex:1;text-align:center;min-width:0;}.dt-title{font-weight:600;font-size:16px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.dt-sub{font-size:13px;color:rgba(255,255,255,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.dt-circ{width:40px;height:40px;border-radius:50%;background:rgba(20,18,16,.55);display:grid;place-items:center;flex:none;-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);}',
    '.dt-circ.on{background:#fff;color:#e0492f;}',
    '.dt-main{display:flex;flex-direction:column;min-width:0;min-height:0;padding:18px 20px 12px;}',
    '.dt-menu{align-self:flex-end;margin-bottom:16px;}.dt-bubble{display:none;}.dt-bar{display:flex;gap:4px;padding:5px;border-radius:9999px;background:rgba(255,255,255,.1);}.dt-main>.dt-bar{align-self:flex-end;margin-bottom:16px;}',      // a bare tab bar (Settings and the other apps) is a normal pill; only a device's detail view wraps it in the bubble menu on phones
    '.dt-tab{width:44px;height:40px;border-radius:9999px;display:grid;place-items:center;color:var(--okie-text-dim);}.dt-tab.on{background:#fff;color:#1d1b19;}',
    '.dt-bodyhost{position:relative;flex:1;min-height:0;}',
    '.dt-body{position:absolute;inset:0;padding:4px 8px 24px;}',      // fills its host by position, not by height:100%: a percentage height inside a flexible box is "auto" in some Safari versions, and then the box grows with its content and never scrolls
    '.tabwrap{display:flex;flex-direction:column;gap:16px;align-items:center;}',
    '.hhead{align-self:flex-start;}.hbody{display:flex;flex-direction:column;gap:16px;width:100%;}',
    '.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}.stat{padding:14px;border-radius:18px;background:rgba(255,255,255,.08);}.stat-v{font-size:24px;font-weight:600;}.stat-l{font-size:12px;color:var(--okie-text-dim);margin-top:2px;text-transform:uppercase;letter-spacing:.06em;}',
    '.chart{position:relative;}.chart-svg{width:100%;height:220px;display:block;}.tip{position:absolute;top:0;padding:6px 10px;border-radius:12px;background:rgba(20,18,16,.85);font-size:12px;white-space:nowrap;pointer-events:none;}',
    '.timeline{display:flex;height:34px;border-radius:12px;overflow:hidden;background:rgba(255,255,255,.05);}.timeline i{display:block;height:100%;}',
    '.hours{display:flex;align-items:flex-end;gap:3px;height:90px;}.hr{position:relative;flex:1;height:100%;display:flex;align-items:flex-end;}.hr i{display:block;width:100%;border-radius:4px 4px 0 0;background:#7de4ff;opacity:.85;}.hr span{position:absolute;bottom:-18px;left:50%;transform:translateX(-50%);font-size:10px;color:var(--okie-text-dim);}',
    '.hbody .hours{margin-bottom:20px;}',
    '.note-l{padding:20px;text-align:center;color:var(--okie-text-dim);font-size:14px;}.note-l.ctx-hint{padding-top:0;font-size:13px;line-height:1.45;}.note-l.warn{background:rgba(255,176,32,.14);color:#ffd990;border-radius:14px;}',
    '.ctxbody{display:flex;flex-direction:column;gap:8px;width:100%;}.ctxrow{display:flex;align-items:center;gap:12px;padding:10px 12px 10px 16px;border-radius:18px;background:rgba(255,255,255,.08);}.ctxname{flex:1;font-weight:500;}',
    '.sched-list{display:flex;flex-direction:column;gap:8px;width:100%;}.schedrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.08);}.sr-main{flex:1;min-width:0;}.sr-t{font-weight:600;}.sr-s{font-size:13px;color:var(--okie-text-dim);}',
    '.sw{position:relative;width:48px;height:28px;border-radius:9999px;background:rgba(255,255,255,.2);flex:none;transition:background .2s;}.sw i{position:absolute;left:3px;top:3px;width:22px;height:22px;border-radius:50%;background:#fff;transition:transform .2s;}.sw.on{background:#2fa35c;}.sw.on i{transform:translateX(20px);}',
    '.mini{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.1);flex:none;}',
    '.sched-form{display:flex;flex-direction:column;gap:12px;width:100%;align-items:flex-start;}.wheels{display:flex;align-items:center;gap:6px;padding:6px 18px;border-radius:22px;background:rgba(255,255,255,.08);}.colon{font-size:28px;font-weight:300;}',
    '.wheel{height:132px;width:76px;overflow-y:auto;scroll-snap-type:y mandatory;scrollbar-width:none;padding:44px 0;-webkit-mask-image:linear-gradient(transparent,#000 30%,#000 70%,transparent);mask-image:linear-gradient(transparent,#000 30%,#000 70%,transparent);}.wheel::-webkit-scrollbar{display:none;}',
    '.wi{height:44px;display:grid;place-items:center;font-size:26px;font-weight:300;scroll-snap-align:center;color:var(--okie-text-dim);}.wi.sel{color:var(--okie-text);font-weight:500;}',
    '.act.primary{background:#fff;color:#1d1b19;}',
    '.attrs{width:100%;}.attrs summary{cursor:pointer;padding:10px 0;color:var(--okie-text-dim);}',
    '@media (min-width:641px){.dt[data-remote]{grid-template-columns:minmax(260px,1fr) minmax(250px,330px);}}',      // a TV's remote: the picture is wider than the remote, like holding a real one
    '@media (min-width:641px){.dt[data-dial]{grid-template-columns:minmax(260px,1fr) minmax(300px,451px);}}',      // a thermostat: the glass column is 451 px wide like in the design (the card there is 1101 px: 650 picture + 451 glass), the picture takes the rest
    '@media (max-width:640px){.dt{grid-template-columns:1fr;grid-template-rows:170px 1fr;}.dt-iconbg svg{width:90px;height:90px;}.dt-main{padding:14px 14px 10px;}}',
    // the phone's menu: a round bubble that opens into the row (same as the iPhone widget's big thermostat)
    '@media (max-width:640px){.dt-main>.dt-bar{align-self:center;}.dt-menu{position:relative;align-self:center;width:186px;height:36px;margin-bottom:16px;flex:none;}',
    '.dt-bubble{position:absolute;left:50%;top:1px;width:34px;height:34px;margin-left:-17px;border-radius:50%;border:0;padding:0;display:grid;place-items:center;background:#fff;color:#1d1b19;box-shadow:0 3px 12px rgba(0,0,0,.35);transition:opacity .16s ease,transform .26s cubic-bezier(.2,.8,.2,1);}.dt-bubble svg{width:17px;height:17px;}',
    '.dt-menu .dt-bar{position:absolute;left:0;right:0;top:-3px;height:42px;box-sizing:border-box;justify-content:center;align-items:center;gap:2px;padding:4px;background:rgba(255,255,255,.14);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);opacity:0;pointer-events:none;-webkit-clip-path:inset(4px 76px 4px 76px round 17px);clip-path:inset(4px 76px 4px 76px round 17px);transition:opacity .2s ease,clip-path .32s cubic-bezier(.2,.8,.2,1),-webkit-clip-path .32s cubic-bezier(.2,.8,.2,1);}',
    '.dt-menu.open .dt-bar{opacity:1;pointer-events:auto;-webkit-clip-path:inset(0 0 0 0 round 21px);clip-path:inset(0 0 0 0 round 21px);}.dt-menu.open .dt-bubble{opacity:0;transform:scale(.55);pointer-events:none;}',
    '.dt-menu .dt-tab{width:34px;height:34px;flex:none;}.dt-menu .dt-tab svg{width:17px;height:17px;}}',
    '[data-rung="compact"] .dt-top{padding:12px;}[data-rung="rows"] .dt-iconbg svg,[data-rung="stacked"] .dt-iconbg svg{width:110px;height:110px;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  g.OkieMotor.detail = { createWheel: createWheel, render: render, renderCompact: renderCompact, prefetch: prefetch, sparkline: sparkline, CSS: CSS, _fetchHistory: fetchHistory };
})(typeof globalThis !== 'undefined' ? globalThis : window);

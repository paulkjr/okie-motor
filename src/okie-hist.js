/* okie-hist: the shared History look, used by the Owlet History tab (okie-owlet.js pageHistory) and the History tab of
 * every number sensor's screen (okie-detail.js). One engine: a change here reaches both.
 *
 *   OkieMotor.hist.period(mode, anchor, now)        -> { A, Bfull, B, D, period, pA, pB }: a day, a week (Monday-Sunday) or a
 *                                                      month like the Calendar, and the one before it
 *   OkieMotor.hist.series(ctx, id, start, end, p)   -> Promise<[{ t, mean, min, max }]>: HA's long-term statistics, else the
 *                                                      same buckets from the recorded states
 *   OkieMotor.hist.statesIn(ctx, ids, start, end)   -> Promise<{ id: [[t, state]] }>
 *   OkieMotor.hist.lineChart(rows, color, id, a, b, lo, hi) -> svg + end dot (html string)
 *   OkieMotor.hist.strip()                          -> a date strip of its own: fn(ctx, view, anchor, onPick) -> the
 *                                                      Calendar's strip element (okie-apps.js renderCalendar), same look and feel
 *   OkieMotor.hist.seg(mode, labels, onPick)        -> the Day / Week / Month pill
 *   OkieMotor.hist.renderSensor(ctx, item, root)    -> the number sensor's History tab: { dispose }
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;

  core.registerStrings('en', {
    'hx.history': 'History', 'hx.day': 'Day', 'hx.week': 'Week', 'hx.month': 'Month', 'hx.avg': 'Avg.', 'hx.min_max': 'Min {a} · Max {b}',
    'hx.this_day': 'This day', 'hx.this_week': 'This week', 'hx.this_month': 'This month', 'hx.lowest': 'Lowest', 'hx.average': 'Average', 'hx.highest': 'Highest',
    'hx.at': 'at {t}', 'hx.on': 'on {t}', 'hx.vs_yday': 'vs yesterday', 'hx.vs_prev_w': 'vs last week', 'hx.vs_prev_m': 'vs last month', 'hx.no_read': 'No readings for this time.',
  });
  core.registerStrings('de', {
    'hx.history': 'Verlauf', 'hx.day': 'Tag', 'hx.week': 'Woche', 'hx.month': 'Monat', 'hx.avg': 'Ø', 'hx.min_max': 'Min {a} · Max {b}',
    'hx.this_day': 'Dieser Tag', 'hx.this_week': 'Diese Woche', 'hx.this_month': 'Dieser Monat', 'hx.lowest': 'Tiefster', 'hx.average': 'Mittel', 'hx.highest': 'Höchster',
    'hx.at': 'um {t}', 'hx.on': 'am {t}', 'hx.vs_yday': 'ggü. gestern', 'hx.vs_prev_w': 'ggü. Vorwoche', 'hx.vs_prev_m': 'ggü. Vormonat', 'hx.no_read': 'Keine Werte in dieser Zeit.',
  });

  // ------------------------------------------------------------ data ----
  var DAY = 864e5, BUCKET = { '5minute': 3e5, hour: 36e5, day: DAY }, rangeC = {};
  function dayStart(ms) { var d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }
  function addDays(ms, n) { var d = new Date(ms); d.setDate(d.getDate() + n); return d.getTime(); }
  function cachedP(key, end, fn) {
    var c = rangeC[key], ttl = end > Date.now() - 6e5 ? 60000 : 36e5;
    if (c && Date.now() - c.at < ttl) return c.p;
    var p = Promise.resolve().then(fn).catch(function () { delete rangeC[key]; return null; });
    rangeC[key] = { at: Date.now(), p: p }; return p;
  }
  function toMs(v) { return typeof v === 'number' ? (v < 1e12 ? v * 1000 : v) : Date.parse(v); }
  /** statesIn(ctx, ids, start, end) -> Promise<{ id: [[t, state]] }>: what Home Assistant recorded (about the last 10 days). */
  function statesIn(ctx, list, start, end) {
    return cachedP('h|' + list.join() + '|' + start + '|' + end, end, function () {
      return Promise.resolve(ctx.callWS({ type: 'history/history_during_period', start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), entity_ids: list, minimal_response: true, no_attributes: true, significant_changes_only: false })).then(function (res) {
        res = res || {}; var out = {}; list.forEach(function (id) { out[id] = (res[id] || []).map(function (r) { return [(r.lu || r.lc || 0) * 1000, r.s]; }); }); return out;
      });
    });
  }
  function bucketize(rows, start, end, step) {
    var b = {};
    rows.forEach(function (r) { var v = parseFloat(r[1]); if (!isFinite(v) || r[0] < start || r[0] >= end) return; var k = start + Math.floor((r[0] - start) / step) * step, x = b[k] || (b[k] = { t: k, sum: 0, n: 0, min: v, max: v }); x.sum += v; x.n++; x.min = Math.min(x.min, v); x.max = Math.max(x.max, v); });
    return Object.keys(b).map(function (k) { var x = b[k]; return { t: x.t, mean: x.sum / x.n, min: x.min, max: x.max }; }).sort(function (a, c) { return a.t - c.t; });
  }
  /** series(ctx, id, start, end, period) -> Promise<[{ t, mean, min, max }]>: Home Assistant's long-term statistics of the sensor
   *  (kept for years); when it keeps none, the same buckets worked out from its recorded readings. */
  function series(ctx, id, start, end, period) {
    return cachedP('s|' + id + '|' + start + '|' + end + '|' + period, end, function () {
      return Promise.resolve(ctx.callWS({ type: 'recorder/statistics_during_period', start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), statistic_ids: [id], period: period, types: ['mean', 'min', 'max'] })).then(function (r) {
        var rows = ((r || {})[id] || []).map(function (x) { return { t: toMs(x.start), mean: x.mean, min: x.min, max: x.max }; }).filter(function (x) { return isFinite(x.t) && x.mean != null; });
        if (rows.length) return rows;
        return statesIn(ctx, [id], start, end).then(function (S) { return bucketize((S && S[id]) || [], start, end, BUCKET[period]); });
      });
    }).then(function (x) { return x || []; });
  }
  function summary(rows) {
    if (!rows || !rows.length) return null;
    var n = 0, sum = 0, lo = Infinity, hi = -Infinity, loT = null, hiT = null;
    rows.forEach(function (r) { var a = r.min != null ? r.min : r.mean, b = r.max != null ? r.max : r.mean; sum += r.mean; n++; if (a < lo) { lo = a; loT = r.t; } if (b > hi) { hi = b; hiT = r.t; } });
    return { avg: sum / n, min: lo, max: hi, minT: loT, maxT: hiT };
  }
  /** Hourly statistics joined into 3-hour steps (the week chart: a clear line, the same readings). */
  function merge3h(rows) {
    var out = [], step = 3 * 36e5;
    (rows || []).forEach(function (r) { var k = Math.floor(r.t / step) * step, x = out[out.length - 1]; if (!x || x.t !== k) out.push(x = { t: k, sum: 0, n: 0, min: r.min, max: r.max }); x.sum += r.mean; x.n++; x.min = Math.min(x.min, r.min != null ? r.min : r.mean); x.max = Math.max(x.max, r.max != null ? r.max : r.mean); });
    return out.map(function (x) { return { t: x.t, mean: x.sum / x.n, min: x.min, max: x.max }; });
  }
  /** The Calendar's periods: A = the start, Bfull = the end, B = the end or now, D = the last day in it; pA..pB = the one before. */
  function period(mode, anc, now) {
    var FD = g.OkieMotor.feeds, ad = new Date(anc);
    var A = mode === 'month' ? new Date(ad.getFullYear(), ad.getMonth(), 1).getTime() : mode === 'week' ? FD.weekStart(anc) : dayStart(anc);
    var Bfull = mode === 'month' ? new Date(new Date(A).getFullYear(), new Date(A).getMonth() + 1, 1).getTime() : addDays(A, mode === 'week' ? 7 : 1);
    var pA = mode === 'month' ? new Date(new Date(A).getFullYear(), new Date(A).getMonth() - 1, 1).getTime() : addDays(A, mode === 'week' ? -7 : -1);
    return { A: A, Bfull: Bfull, B: Math.min(Bfull, now), D: dayStart(Math.min(now, Bfull - 1)), period: mode === 'month' ? 'day' : 'hour', pA: pA, pB: A };
  }

  // ------------------------------------------------------------ chart ----
  /** The chart of a History card: a glowing line of the averages, a dot at the newest one (the scale and times are drawn by the caller). */
  function lineChart(rows, color, id, a, b, lo, hi) {
    var W = 600, H = 100, x = function (t) { return (t - a) / (b - a) * W; }, y = function (v) { return H - 6 - (v - lo) / Math.max(1e-6, hi - lo) * (H - 12); };
    if (!rows.length) return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><path d="M0 ' + H / 2 + 'H' + W + '" stroke="' + color + '" stroke-opacity=".25" stroke-width="2" fill="none" stroke-dasharray="4 6" vector-effect="non-scaling-stroke"/></svg>';
    var step = rows.length > 1 ? Math.min.apply(null, rows.slice(1).map(function (r, i) { return r.t - rows[i].t; })) : 1, d = '', area = '', seg = [];
    function flush() {
      if (!seg.length) return;
      var p = 'M' + seg[0][0].toFixed(1) + ' ' + seg[0][1].toFixed(1);
      for (var i = 1; i < seg.length; i++) { var p0 = seg[i - 1], p1 = seg[i], mx = (p0[0] + p1[0]) / 2; p += ' C' + mx.toFixed(1) + ' ' + p0[1].toFixed(1) + ' ' + mx.toFixed(1) + ' ' + p1[1].toFixed(1) + ' ' + p1[0].toFixed(1) + ' ' + p1[1].toFixed(1); }
      d += p; area += p + ' L' + seg[seg.length - 1][0].toFixed(1) + ' ' + H + ' L' + seg[0][0].toFixed(1) + ' ' + H + 'Z'; seg = [];
    }
    rows.forEach(function (r, i) { if (i && r.t - rows[i - 1].t > step * 3.5) flush(); seg.push([x(r.t + step / 2), y(r.mean)]); });
    var last = [x(rows[rows.length - 1].t + step / 2), y(rows[rows.length - 1].mean)];
    flush();
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none"><defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="' + color + '" stop-opacity=".3"/><stop offset="1" stop-color="' + color + '" stop-opacity="0"/></linearGradient><filter id="' + id + 'b" x="-5%" y="-50%" width="110%" height="200%"><feGaussianBlur stdDeviation="3"/></filter></defs>' +
      '<path d="' + area + '" fill="url(#' + id + ')"/><path d="' + d + '" stroke="' + color + '" stroke-width="6" stroke-opacity=".6" fill="none" filter="url(#' + id + 'b)"/><path d="' + d + '" stroke="' + color + '" stroke-width="2.4" fill="none" vector-effect="non-scaling-stroke"/></svg>' +
      '<i class="osh-dot" style="left:' + (last[0] / W * 100).toFixed(2) + '%;top:' + (last[1] / H * 100).toFixed(2) + '%;background:' + color + ';color:' + color + '"></i>';
  }
  /** An even scale (four equal steps) around the readings: [lo, hi] in whole steps of `step`; floor = the scale without readings. */
  function niceScale(s, step, floor, cap) {
    if (!s) return [floor, floor + step * 4];
    var lo = Math.floor((s.min - step / 2) / step) * step, hi = Math.ceil((s.max + step / 2) / step) * step;
    if (cap != null) hi = Math.min(cap, hi);
    while ((hi - lo) / step < 4 || Math.round((hi - lo) / step) % 4) lo -= step;
    return [lo, hi];
  }
  /** A step for any sensor: 1, 2, 2.5 or 5 times a power of ten, so the four steps cover the readings. */
  function autoStep(s) {
    var span = s ? Math.max(s.max - s.min, Math.abs(s.avg) * 0.02, 1e-3) : 1, raw = span / 3, p = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }
  function decimals(step) { return step >= 1 ? 0 : step >= 0.1 ? 1 : 2; }
  /** x-axis labels for the period: hours (Day), weekdays (Week) or dates (Month). */
  function xLabels(box, mode, A, Bfull, lang) {
    var n = mode === 'day' ? 8 : 7;
    for (var i = 0; i < n; i++) {
      var tt = A + (Bfull - A) * i / n, s = mode === 'day' ? new Date(tt).toLocaleTimeString(lang, { hour: 'numeric' }) : new Date(tt).toLocaleDateString(lang, mode === 'week' ? { weekday: 'short' } : { month: 'short', day: 'numeric' });
      box.appendChild(h('span', { style: { left: (i / n * 100) + '%' } }, s));
    }
  }
  var ARROW = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6"/></svg>';      // up = more, turned for less
  function delta(el, diff, txt, vs) { el.innerHTML = ''; if (diff == null) return; el.appendChild(h('span.ows-arr' + (diff < 0 ? '.dn' : ''), { html: ARROW })); el.appendChild(h('b', null, txt)); if (vs) el.appendChild(document.createTextNode(' ' + vs)); }
  function seg(mode, labels, onPick) {
    return h('div.osh-seg', null, ['day', 'week', 'month'].map(function (m) { return h('button' + (m === mode ? '.on' : ''), { type: 'button', onclick: function () { if (m !== mode) onPick(m); } }, labels[m]); }));
  }

  // ------------------------------------------------------------ the date strip ----
  /** strip() -> fn(ctx, view, anchor, onPick): the Calendar's strip of dates (okie-apps.js renderCalendar), the same look and feel:
   *  the days / weeks / months as spaced capitals, the shown one bold at the left edge (with its month or year beside it), today's red dot;
   *  scroll it with a finger and the period at the left edge is picked as it passes (a tick each), tap one to go there, it grows at both ends.
   *  Each screen keeps one strip across its redraws so it never jumps under the finger. */
  function strip() {
    var ds = { el: null, view: '', ms: {}, auto: 0, pick: 0, timer: 0, dragAt: 0, growing: false, onPick: null, left: 0, ctx: null, touching: false, handAt: 0 };
    return function dateStrip(ctx, view, anchor, onPick) {
      var FD = g.OkieMotor.feeds; ds.onPick = onPick; ds.ctx = ctx;
      if (!ds.el) {
        ds.el = h('div.cal-strip.osh-strip', { role: 'tablist' });
        // only a hand picks a date: a finger on the strip, its glide after the lift, or a wheel. A scroll the page causes (the strip
        // moved into a redrawn page starts at 0 again) never does - that once jumped the History to a January a year back.
        var hand = function () { ds.handAt = Date.now(); };
        ds.el.addEventListener('touchstart', function () { ds.touching = true; hand(); }, { passive: true });
        ds.el.addEventListener('touchend', function () { ds.touching = false; hand(); }, { passive: true });
        ds.el.addEventListener('touchcancel', function () { ds.touching = false; hand(); }, { passive: true });
        ds.el.addEventListener('pointerdown', hand, { passive: true });
        ds.el.addEventListener('wheel', hand, { passive: true });
        ds.el.addEventListener('scroll', function () {
          var strip = ds.el;
          strip.style.setProperty('--ml', strip.scrollLeft > 4 ? '26px' : '0px');
          if (!ds.touching && Date.now() - ds.handAt > 2500) return;      // not the user's hand: leave the date alone
          ds.left = strip.scrollLeft;
          if (Date.now() < ds.auto) return;      // a glide of ours, not the finger
          ds.dragAt = Date.now();
          if (strip.scrollLeft < 700) grow(-1); else if (strip.scrollWidth - strip.clientWidth - strip.scrollLeft < 700) grow(1);
          if (ds.pick) return;
          ds.pick = requestAnimationFrame(function () {
            ds.pick = 0;
            var x = strip.scrollLeft + 2, best = null, bd = 1e9;
            Object.keys(ds.ms).forEach(function (k) { var b = ds.ms[k], d = Math.abs(b.offsetLeft - x); if (d < bd) { bd = d; best = b; } });
            if (!best || best.classList.contains('on')) return;
            highlight(best._it); if (ds.ctx.haptic) ds.ctx.haptic('detent');
            clearTimeout(ds.timer); ds.timer = setTimeout(function () { if (ds.onPick) ds.onPick(best._it.ms); }, 170);      // the page follows once the scrolling slows down
          });
        }, { passive: true });
      }
      var strip = ds.el, lang = ctx.lang();
      function btn(it) {
        var b = h('button.cs' + (it.active ? '.on' : '') + (it.today ? '.today' : ''), { type: 'button', role: 'tab', 'aria-selected': it.active ? 'true' : 'false', 'aria-label': it.label + (it.sub ? ' ' + it.sub : ''), onclick: function () {
          if (Date.now() - ds.dragAt < 250) return;      // the finger that scrolled does not also pick what it lifted on
          if (ds.onPick) ds.onPick(it.ms);
        } }, it.label, it.active && it.sub && (ds.view === 'month' || ds.view === 'day') ? h('span', null, it.sub) : null);
        b._it = it; ds.ms[it.ms] = b; return b;
      }
      function highlight(act) {
        Object.keys(ds.ms).forEach(function (k) {
          var b = ds.ms[k], on = +k === act.ms; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
          var sp = b.querySelector('span'); if (sp) sp.remove();
          if (on && act.sub && (ds.view === 'month' || ds.view === 'day')) b.appendChild(h('span', null, act.sub));
        });
      }
      function glide(b, smooth) {
        ds.auto = Date.now() + (smooth ? 700 : 400);
        var left = Math.max(0, b.offsetLeft - 2); ds.left = left;
        if (smooth) { try { strip.scrollTo({ left: left, behavior: 'smooth' }); return; } catch (e) { /* jump instead */ } }
        strip.scrollLeft = left;
      }
      function grow(dir) {
        if (ds.growing) return; ds.growing = true;
        try {
          var kids = strip.children; if (!kids.length) return;
          var HI = { day: 120, week: 78, month: 60 }, LO = { day: 30, week: 26, month: 24 }, edge = dir < 0 ? kids[0]._it.ms : kids[kids.length - 1]._it.ms;
          var from = FD.stepAnchor(ds.view, edge, dir < 0 ? -(HI[ds.view] || 60) : (LO[ds.view] || 24));
          var more = FD.periodStrip(ds.view, from, Date.now(), ds.ctx.lang(), true).filter(function (it) { it.active = false; return dir < 0 ? it.ms < edge : it.ms > edge; });
          if (!more.length) return;
          ds.auto = Date.now() + 200;
          if (dir < 0) { var w0 = strip.scrollWidth, first = kids[0]; more.forEach(function (it) { strip.insertBefore(btn(it), first); }); strip.scrollLeft += strip.scrollWidth - w0; }
          else more.forEach(function (it) { strip.appendChild(btn(it)); });
        } finally { ds.growing = false; }
      }
      var items = FD.periodStrip(view, anchor, Date.now(), lang, true), act = items.filter(function (it) { return it.active; })[0], have = ds.view === view && act && ds.ms[act.ms];
      if (have) {      // already in the strip: the highlight moves; it glides there unless the finger is still on it
        highlight(act);
        var keep = ds.left, recent = Date.now() - ds.dragAt < 400;
        requestAnimationFrame(function () { ds.auto = Date.now() + 300; strip.scrollLeft = keep; if (!recent) glide(have, true); });      // put back where it was (moving it between pages resets the scroll)
        return strip;
      }
      strip.innerHTML = ''; ds.ms = {}; ds.view = view;
      items.forEach(function (it) { strip.appendChild(btn(it)); });
      requestAnimationFrame(function () { var on = strip.querySelector('.on'); if (on) { glide(on, false); ds.left = strip.scrollLeft; } });
      return strip;
    };
  }

  // ------------------------------------------------------------ a number sensor's History tab ----
  /** The sensor's colour and icon: the Owlet sock's vitals as on its own pages, the rest by the kind of reading. */
  var COLORS = { temperature: '#ff9f45', humidity: '#4fd6e8', moisture: '#4fd6e8', power: '#ffd34f', energy: '#ffd34f', current: '#ffd34f', voltage: '#ffd34f', battery: '#5ee08f',
    illuminance: '#ffe17a', carbon_dioxide: '#b8e986', pm25: '#b8e986', pm10: '#b8e986', volatile_organic_compounds: '#b8e986', pressure: '#9a7bff', atmospheric_pressure: '#9a7bff', signal_strength: '#9a7bff', speed: '#7de4ff', wind_speed: '#7de4ff' };
  function lookOf(item, st) {
    var dc = (st.attributes || {}).device_class || item.deviceClass || '', id = item.id;
    if (/owlet_sock.*_heart_rate$/.test(id)) return { icon: 'heart', iconColor: '#ff4d6a', line: '#5ee08f' };
    if (/owlet_sock.*_o2_saturation(_10_minute_average)?$/.test(id)) return { icon: 'lungs', iconColor: '#4fd6e8', line: '#4fd6e8' };
    var c = COLORS[dc] || '#7de4ff';
    return { icon: UI.domainIcon(item.domain, dc, st.state), iconColor: c, line: c };
  }
  /** Is this a number sensor (its History is a chart)? */
  function isNumber(item, st) {
    if (!item || !st || (item.domain !== 'sensor' && item.domain !== 'number' && item.domain !== 'input_number')) return false;
    return (st.attributes || {}).state_class != null || (st.attributes || {}).unit_of_measurement != null || isFinite(parseFloat(st.state));
  }

  var views = {};      // per sensor: the chosen Day / Week / Month and date, kept while the card is open
  function renderSensor(ctx, item, root) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, lang = ctx.lang(), dead = false;
    var host = h('div.hx'), dateStrip = strip(); root.appendChild(host); root.style.minHeight = '100%';      // the chart fills the page
    var v = views[item.id] || (views[item.id] = { mode: 'day', day: null });
    function draw() {
      if (dead) return;
      var now = Date.now(), today = dayStart(now), mode = v.mode, anc = v.day != null && v.day <= today ? v.day : today, P = period(mode, anc, now);
      var st = ctx.state(item.id) || { state: '', attributes: {} }, unit = (st.attributes || {}).unit_of_measurement || '', look = lookOf(item, st);
      function set(m, d) { v.mode = m; v.day = d; if (ctx.haptic) ctx.haptic(8); draw(); }
      var avg = h('b', null, '--'), mm = h('div.osh-mm', null, ''), plot = h('div.osh-plot'), yax = h('div.osh-y'), xax = h('div.osh-x');
      var chart = h('div.hx-card.osh-chart.hx-chart', null,
        h('div.osh-cl', null, h('div.hx-ch', null, h('span.osh-ic', { style: { color: look.iconColor }, html: UI.icon(look.icon, 26) }), item.name),
          h('div.osh-avg', null, h('span', null, t('hx.avg') + ' '), avg, h('span', null, unit ? ' ' + unit : '')), mm),
        h('div.osh-cr', null, plot, xax), yax);
      var grid = h('div.osh-cmpg'), sumC = h('div.hx-card.osh-cmp.hx-sum', null, h('div.hx-ch', null, h('span', { html: UI.icon('rows', 24) }), t(mode === 'day' ? 'hx.this_day' : mode === 'week' ? 'hx.this_week' : 'hx.this_month')), grid);
      host.innerHTML = '';
      host.appendChild(h('div.osh-head', null, h('div.hx-head', null, h('span', { html: UI.icon('chart', 28) }), t('hx.history')),
        dateStrip(ctx, mode, P.A, function (ms) { set(mode, Math.min(ms, today)); }),
        seg(mode, { day: t('hx.day'), week: t('hx.week'), month: t('hx.month') }, function (m) { set(m, P.D); })));
      host.appendChild(chart); host.appendChild(sumC);
      Promise.all([series(ctx, item.id, P.A, P.B, P.period), series(ctx, item.id, P.pA, P.pB, P.period)]).then(function (R) {
        if (dead || !chart.isConnected) return;
        var rows = mode === 'week' ? merge3h(R[0]) : R[0], s = summary(R[0]), prev = summary(R[1]);
        var step = autoStep(s), dec = decimals(step), sc = niceScale(s, step, s ? s.avg : 0, (st.attributes || {}).unit_of_measurement === '%' ? 100 : null);
        var f = function (x) { return x == null ? '--' : (Math.round(x * Math.pow(10, dec)) / Math.pow(10, dec)).toFixed(dec).replace('.', lang === 'de' ? ',' : '.'); };
        var vd = s ? (s.max - s.min <= 1 ? 2 : s.max - s.min <= 12 ? 1 : 0) : 0, fv = function (x) { var d2 = Math.max(dec, vd), r = (Math.round(x * Math.pow(10, d2)) / Math.pow(10, d2)).toFixed(d2); return r.replace('.', lang === 'de' ? ',' : '.'); };
        avg.textContent = s ? fv(s.avg) : '--';
        mm.textContent = s ? t('hx.min_max', { a: fv(s.min), b: fv(s.max) }) : t('hx.no_read');
        plot.innerHTML = lineChart(rows, look.line, 'hx' + Math.random().toString(36).slice(2, 7), P.A, P.Bfull, sc[0], sc[1]);
        for (var i = 4; i >= 0; i--) yax.appendChild(h('span', null, f(sc[0] + (sc[1] - sc[0]) * i / 4)));
        xLabels(xax, mode, P.A, P.Bfull, lang);
        var when = function (ms) { if (ms == null) return ''; var d = new Date(ms); return t(mode === 'day' ? 'hx.at' : 'hx.on', { t: mode === 'day' ? d.toLocaleTimeString(lang, { hour: 'numeric', minute: '2-digit' }) : mode === 'week' ? d.toLocaleDateString(lang, { weekday: 'short' }) + ' ' + d.toLocaleTimeString(lang, { hour: 'numeric' }) : d.toLocaleDateString(lang, { month: 'short', day: 'numeric' }) }); };
        var u = unit ? '<span>' + String(unit).replace(/[&<>"]/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }) + '</span>' : '';
        function cell(iconHtml, label, val, sub, diff) {
          var dEl = h('div.osh-delta'); if (diff != null) delta(dEl, diff, (diff >= 0 ? '+' : '') + fv(diff) + (unit ? ' ' + unit : ''), '');
          return h('div.osh-cmpi', null, h('div.osh-cmph', null, h('span', { style: { color: look.iconColor }, html: iconHtml }), label), h('div.osh-cmpv', { html: s ? '<b>' + fv(val) + '</b>' + u : '--' }), diff != null ? dEl : null, h('div.osh-cmpvs', null, sub));
        }
        var vs = t(mode === 'day' ? 'hx.vs_yday' : mode === 'week' ? 'hx.vs_prev_w' : 'hx.vs_prev_m');
        grid.appendChild(cell('<span style="display:flex;transform:scaleY(-1)">' + ARROW + '</span>', t('hx.lowest'), s && s.min, s ? when(s.minT) : ''));
        grid.appendChild(cell(UI.icon(look.icon, 18), t('hx.average'), s && s.avg, prev ? vs : '', s && prev ? s.avg - prev.avg : null));
        grid.appendChild(cell(ARROW, t('hx.highest'), s && s.max, s ? when(s.maxT) : ''));
      });
    }
    draw();
    return { dispose: function () { dead = true; } };
  }

  // ------------------------------------------------------------ styles ----
  // The History look shared by the Owlet History tab and the sensor screens (the user's History reference, 2026-11-19).
  var CSS = [
    '.osh-head{display:flex;align-items:center;gap:12px;padding:0 2px;}.osh-strip{flex:1;min-width:0;}',
    '.osh-seg,.osh-nav{display:flex;align-items:center;gap:2px;padding:3px;border-radius:999px;background:rgba(255,255,255,.08);box-shadow:var(--okie-card-edge,none);}',
    '.osh-seg button,.osh-nav button{border:0;background:none;color:inherit;font:inherit;font-size:14px;font-weight:500;padding:6px 14px;border-radius:999px;cursor:pointer;display:flex;align-items:center;gap:8px;}',
    '.osh-seg button.on{background:#fff;color:#1d1b19;font-weight:600;}.osh-nav button{padding:6px 9px;}.osh-nav button.off{opacity:.3;cursor:default;}.osh-nav .osh-date{position:relative;padding:6px 10px;}',
    // :is(...) so these win over the Owlet card surface (.ow-page), which loads after this file
    ':is(.ow-page,.hx-card).osh-chart{flex:1 1 auto;flex-direction:row;align-items:stretch;gap:12px;padding:12px 14px 8px 18px;}',
    '.osh-cl{flex:none;width:170px;display:flex;flex-direction:column;justify-content:center;gap:4px;}.osh-cl .ows-ch,.osh-cl .hx-ch{margin-bottom:4px;}.osh-ic{display:flex;}.osh-ic svg{filter:drop-shadow(0 0 5px currentColor);}',
    '.osh-avg span{font-size:15px;opacity:.85;}.osh-avg b{font-size:28px;font-weight:600;font-variant-numeric:tabular-nums;}.osh-mm{font-size:13px;opacity:.7;}',
    '.osh-cr{flex:1;min-width:0;display:flex;flex-direction:column;}.osh-plot{position:relative;flex:1;min-height:44px;}.osh-plot svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible;}',
    '.osh-dot{position:absolute;width:10px;height:10px;border-radius:50%;transform:translate(-50%,-50%);box-shadow:0 0 10px currentColor;}',
    '.osh-x{position:relative;height:16px;margin-top:4px;}.osh-x span{position:absolute;top:0;font-size:11px;opacity:.7;white-space:nowrap;}',
    '.osh-y{flex:none;width:30px;display:flex;flex-direction:column;justify-content:space-between;padding:0 0 18px;font-size:11px;opacity:.7;text-align:right;}',
    '.osh-delta{display:flex;align-items:center;gap:5px;font-size:12px;opacity:.85;white-space:nowrap;}.osh-delta b{font-weight:600;color:#5ee08f;}.osh-delta .ows-arr.dn+b{color:#ff9f6b;}',
    '.ows-arr{display:flex;color:#5ee08f;}.ows-arr.dn{color:#ff9f6b;transform:scaleY(-1);}',
    ':is(.ow-page,.hx-card).osh-cmp{gap:8px;padding:12px 14px;}.osh-cmpg{flex:1;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;}',
    '.osh-cmpi{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;border-radius:14px;background:rgba(255,255,255,.05);box-shadow:var(--okie-card-edge,none);padding:8px 4px;text-align:center;}',
    '.osh-cmph{display:flex;align-items:center;gap:5px;font-size:11px;white-space:nowrap;font-weight:600;}.osh-cmph span{display:flex;}',
    '.osh-cmpv b{font-size:22px;font-weight:600;font-variant-numeric:tabular-nums;}.osh-cmpv span{font-size:12px;margin:0 2px;opacity:.85;}.osh-cmpvs{font-size:10.5px;opacity:.6;}',
    // the sensor screen's tab: the same cards on the Motor's card surface
    '.hx{display:flex;flex-direction:column;gap:12px;flex:1;align-self:stretch;width:100%;min-width:0;box-sizing:border-box;}.osh-head{min-width:0;}',
    '.hx-card{min-width:0;display:flex;border-radius:18px;background:var(--okie-tile,rgba(255,255,255,.08));-webkit-backdrop-filter:var(--okie-card-bf,none);backdrop-filter:var(--okie-card-bf,none);box-shadow:var(--okie-card-edge,none);box-sizing:border-box;}',
    '.hx-head{flex:none;display:flex;align-items:center;gap:12px;font-size:21px;font-weight:700;padding:0 2px;}.hx-head span{display:flex;opacity:.9;}',
    '.hx-ch{display:flex;align-items:center;gap:10px;font-size:16px;font-weight:600;}.hx-ch>span{display:flex;opacity:.9;}',
    '.hx-sum{flex-direction:column;}.hx-chart{min-height:300px;}.hx-chart .hx-ch{align-items:flex-start;}.hx-sum{flex:none;}.hx-sum .osh-cmpi{padding:10px 4px;}',
    '@media (max-width:700px){.hx .osh-head{flex-wrap:wrap;}.hx .hx-head{display:none;}.hx .osh-strip{flex-basis:100%;order:2;}.hx .hx-chart{flex-direction:column;min-height:0;padding:14px 16px 10px;}.hx .hx-chart .osh-cl{width:auto;}.hx .hx-chart .osh-cr{min-height:170px;}.hx .hx-chart .osh-y{display:none;}.hx .osh-x span:nth-child(even){display:none;}}',
  ].join('\n');

  g.OkieMotor.hist = { DAY: DAY, dayStart: dayStart, addDays: addDays, cachedP: cachedP, statesIn: statesIn, bucketize: bucketize, series: series, summary: summary, merge3h: merge3h,
    period: period, lineChart: lineChart, niceScale: niceScale, autoStep: autoStep, xLabels: xLabels, ARROW: ARROW, delta: delta, seg: seg, strip: strip,
    isNumber: isNumber, lookOf: lookOf, renderSensor: renderSensor, CSS: CSS };
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
})(typeof window !== 'undefined' ? window : globalThis);

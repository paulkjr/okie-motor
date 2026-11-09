/* okie-owlet: the Owlet camera's split live-view + glass info panel, used by the
 * Cameras app (okie-cameras.js) when the selected camera matches
 * settings.cameras.owlet.entity (same slot pattern as LensLink, okie-lenslink.js).
 *
 * The panel has several swipeable pages, dots like okie-weather.js's city pager:
 *   - Comfort: this camera's own room temperature + humidity sensors (real data)
 *   - Morning report, Sleep trends, Health patterns, Sleep positions: Owlet's sock
 *     reports these, styled after Owlet's own app, but with no sock paired yet
 *     these pages show demo data clearly marked "Demo - add a Dream Sock" so
 *     nothing here is mistaken for a real reading.
 * The live view gets a small top-right temp/humidity badge (same idea as Owlet's
 * own live view overlay, redrawn in Okie's icon set) and, like every other
 * camera's live view, a bottom-right full-screen button (okie-cameras.js).
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;

  core.registerStrings('en', {
    'owl.comfort': 'Comfort Temp', 'owl.humidity': 'Humidity', 'owl.warmer': 'Warmer', 'owl.cooler': 'Cooler',
    'owl.morning': 'Morning Report', 'owl.restful': 'Restful', 'owl.total_sleep': 'Total Night Sleep',
    'owl.trends': 'Weekly Sleep Trends', 'owl.longest': 'Longest Stretch', 'owl.wakings': 'Wakings',
    'owl.health': 'Health Patterns', 'owl.oxygen': 'Oxygen', 'owl.pulse': 'Pulse Rate', 'owl.today_avg': 'Today\'s avg',
    'owl.positions': 'Sleep Positions', 'owl.back': 'Back', 'owl.tummy': 'Tummy', 'owl.side': 'Side',
    'owl.demo': 'Demo - add a Dream Sock for real readings',
  });
  core.registerStrings('de', {
    'owl.comfort': 'Komforttemperatur', 'owl.humidity': 'Luftfeuchtigkeit', 'owl.warmer': 'Wärmer', 'owl.cooler': 'Kühler',
    'owl.morning': 'Morgenbericht', 'owl.restful': 'Erholsam', 'owl.total_sleep': 'Schlaf insgesamt',
    'owl.trends': 'Wöchentlicher Schlaftrend', 'owl.longest': 'Längste Phase', 'owl.wakings': 'Aufwachen',
    'owl.health': 'Gesundheitswerte', 'owl.oxygen': 'Sauerstoff', 'owl.pulse': 'Puls', 'owl.today_avg': 'Heute Ø',
    'owl.positions': 'Schlafpositionen', 'owl.back': 'Rücken', 'owl.tummy': 'Bauch', 'owl.side': 'Seite',
    'owl.demo': 'Demo – für echte Werte einen Dream Sock hinzufügen',
  });

  function T(ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; }

  /** settings.cameras.owlet = { entity, tempEntity, humidityEntity }; the two sensors fall back to this camera's own
   *  temperature/humidity sensors (same "name starts with the camera's key" match okie-cameras.js uses for alerts). */
  function configFor(ctx, cameraId) {
    var cc = (ctx.settings.get().cameras || {}).owlet;
    if (!cc || !cc.entity || cc.entity !== cameraId) return null;
    var cams = g.OkieMotor.cameras, key = cams ? cams.cameraKey(cameraId) : '';
    function auto(deviceClass) {
      var hs = ctx.hass(); if (!hs || !key) return '';
      var hit = Object.keys(hs.states).filter(function (id) {
        if (id.indexOf('sensor.') !== 0) return false;
        var obj = id.slice(7), st = hs.states[id];
        return (obj === key || obj.indexOf(key + '_') === 0) && st.attributes && st.attributes.device_class === deviceClass;
      }).sort()[0];
      return hit || '';
    }
    return { entity: cc.entity, tempEntity: cc.tempEntity || auto('temperature'), humidityEntity: cc.humidityEntity || auto('humidity') };
  }

  function num(ctx, id) { var st = id && ctx.state(id); var n = st ? parseFloat(st.state) : NaN; return isFinite(n) ? n : null; }
  function unitOf(ctx, id) { var st = id && ctx.state(id); return (st && st.attributes && st.attributes.unit_of_measurement) || ''; }

  // ---- demo data (deterministic by day-of-week, clearly not live readings) ----
  var DEMO = {
    stretch: [6.5, 8, 7, 11, 5.5, 9, 8.5],         // hours, "longest stretch" per weekday
    wakings: [3, 2, 3, 2, 4, 2, 1],
    oxygen: [97, 98, 96, 98, 97, 99, 98],          // %
    pulse: 128,                                    // bpm, today's avg
    positions: { back: 6.2, tummy: 0.4, side: 2.1 },// hours
    restful: 0.82, totalSleepMin: 7 * 60 + 26,
  };
  function weekdayLabels(lang) {
    var base = new Date(); base.setDate(base.getDate() - base.getDay());
    var out = []; for (var i = 0; i < 7; i++) { var d = new Date(base); d.setDate(base.getDate() + i); out.push(d.toLocaleDateString(lang, { weekday: 'narrow' })); }
    return out;
  }
  function fmtHm(min) { return Math.floor(min / 60) + 'h ' + (min % 60) + 'm'; }

  // ---- small chart builders (plain divs, no canvas: easy to theme, cheap to redraw) ----
  function barChart(values, max, labels, unitFn) {
    var wrap = h('div.ow-bars');
    values.forEach(function (v, i) {
      var pct = Math.max(4, Math.round((v / max) * 100));
      wrap.appendChild(h('div.ow-bar-col', null,
        h('div.ow-bar-track', null, h('div.ow-bar-fill', { style: { height: pct + '%' } })),
        h('div.ow-bar-v', null, unitFn ? unitFn(v) : String(v)),
        h('div.ow-bar-l', null, labels[i])));
    });
    return wrap;
  }
  function dotRow(values, max, labels) {
    var wrap = h('div.ow-dots-row');
    values.forEach(function (v, i) {
      var pct = Math.max(6, Math.round((v / max) * 100));
      wrap.appendChild(h('div.ow-dot-col', null, h('div.ow-dot-track', null, h('div.ow-dot', { style: { bottom: pct + '%' } })), h('div.ow-bar-l', null, labels[i])));
    });
    return wrap;
  }
  function ring(pct, label, sub) {
    var deg = Math.round(360 * Math.max(0, Math.min(1, pct)));
    return h('div.ow-ring', { style: { '--ow-ring-deg': deg + 'deg' } },
      h('div.ow-ring-face', null, h('span', { html: UI.icon('moon', 26) }), h('b', null, label), sub ? h('em', null, sub) : null));
  }

  /** The Comfort page: real temp/humidity, a static comfort-zone bar with a marker (no control - these sensors don't take a setpoint). */
  function pageComfort(ctx, cfg) {
    var t = T(ctx);
    var tEl = h('div.ow-big'), tUnit = h('span.ow-unit'), marker = h('div.ow-zone-dot'), hVal = h('b'), hRow = h('div.ow-sub-row', null, h('span', { html: UI.icon('drop', 20) }), h('span', null, t('owl.humidity')), hVal);
    var page = h('div.ow-page.ow-comfort',
      h('div.ow-head', null, h('span', { html: UI.icon('thermo', 22) }), h('span', null, t('owl.comfort'))),
      h('div.ow-bigrow', null, tEl, tUnit),
      h('div.ow-zone', null, h('div.ow-zone-track'), marker),
      h('div.ow-zone-labels', null, h('span', null, t('owl.cooler')), h('span', null, t('owl.warmer'))),
      hRow);
    function draw() {
      var tv = num(ctx, cfg.tempEntity), hv = num(ctx, cfg.humidityEntity);
      tEl.textContent = tv != null ? Math.round(tv) : '--'; tUnit.textContent = cfg.tempEntity ? (unitOf(ctx, cfg.tempEntity) || '°') : '';
      hVal.textContent = hv != null ? Math.round(hv) + '%' : '--';
      var frac = tv != null ? Math.max(0, Math.min(1, (tv - 60) / (80 - 60))) : 0.5;   // 60-80F comfort span, purely cosmetic
      marker.style.left = (6 + frac * 88) + '%';
    }
    draw();
    return { el: page, update: draw };
  }

  function pageMorning(ctx) {
    var t = T(ctx);
    return { el: h('div.ow-page.ow-morning',
      h('div.ow-head', null, h('span', { html: UI.icon('moon', 22) }), h('span', null, t('owl.morning')), h('span.ow-demo', null, t('owl.demo'))),
      ring(DEMO.restful, t('owl.restful')),
      h('div.ow-sub-row.ow-center', null, h('b', null, t('owl.total_sleep') + ': ' + fmtHm(DEMO.totalSleepMin)))), update: function () {} };
  }

  function pageTrends(ctx) {
    var t = T(ctx), labels = weekdayLabels(ctx.lang());
    return { el: h('div.ow-page.ow-trends',
      h('div.ow-head', null, h('span', { html: UI.icon('gauge', 22) }), h('span', null, t('owl.trends')), h('span.ow-demo', null, t('owl.demo'))),
      h('div.ow-subhead', null, t('owl.longest')), barChart(DEMO.stretch, 12, labels, function (v) { return v + 'h'; }),
      h('div.ow-subhead', null, t('owl.wakings')), dotRow(DEMO.wakings, 5, labels)), update: function () {} };
  }

  function pageHealth(ctx) {
    var t = T(ctx), labels = weekdayLabels(ctx.lang());
    return { el: h('div.ow-page.ow-health',
      h('div.ow-head', null, h('span', { html: UI.icon('lungs', 22) }), h('span', null, t('owl.health')), h('span.ow-demo', null, t('owl.demo'))),
      h('div.ow-subhead', null, t('owl.oxygen')), barChart(DEMO.oxygen, 100, labels, function (v) { return v + '%'; }),
      h('div.ow-sub-row', null, h('span', { html: UI.icon('heart', 20) }), h('span', null, t('owl.pulse') + ' · ' + t('owl.today_avg')), h('b', null, DEMO.pulse + ' bpm'))), update: function () {} };
  }

  function pagePositions(ctx) {
    var t = T(ctx), p = DEMO.positions, max = Math.max(p.back, p.tummy, p.side) || 1;
    function row(label, v) { return h('div.ow-posrow', null, h('span.ow-posl', null, label), h('div.ow-postrack', null, h('div.ow-posfill', { style: { width: Math.round((v / max) * 100) + '%' } })), h('span.ow-posv', null, v.toFixed(1) + 'h')); }
    return { el: h('div.ow-page.ow-positions',
      h('div.ow-head', null, h('span', { html: UI.icon('person', 22) }), h('span', null, t('owl.positions')), h('span.ow-demo', null, t('owl.demo'))),
      row(t('owl.back'), p.back), row(t('owl.tummy'), p.tummy), row(t('owl.side'), p.side)), update: function () {} };
  }

  /** panel(ctx, cfg) -> { el, update(), dispose() }: the right-hand glass column, several swipeable pages with dots. */
  function panel(ctx, cfg) {
    var pages = [pageComfort(ctx, cfg), pageMorning(ctx), pageTrends(ctx), pageHealth(ctx), pagePositions(ctx)];
    var track = h('div.ow-track'); pages.forEach(function (p) { track.appendChild(p.el); });
    var dots = h('div.ow-dots'); pages.forEach(function (_, i) { dots.appendChild(h('i' + (i === 0 ? '.on' : ''))); });
    var root = h('div.ow-panel', track, dots);
    var cur = 0, x0 = 0, y0 = 0, down = false;
    function go(i) {
      i = Math.max(0, Math.min(pages.length - 1, i)); if (i === cur) return;
      cur = i; track.style.transform = 'translateX(' + (-100 * cur) + '%)';
      Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle('on', k === cur); });
      if (ctx.haptic) ctx.haptic(6);
    }
    track.addEventListener('pointerdown', function (e) { down = true; x0 = e.clientX; y0 = e.clientY; });
    track.addEventListener('pointerup', function (e) {
      if (!down) return; down = false; var dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.6) go(cur + (dx < 0 ? 1 : -1));
    });
    track.addEventListener('pointercancel', function () { down = false; });
    return { el: root, update: function () { pages.forEach(function (p) { p.update(); }); }, dispose: function () {} };
  }

  /** liveBadge(ctx, cfg) -> a small node for the live view's top-right corner: this camera's own temp + humidity, Owlet's own layout redrawn in Okie's icons. */
  function liveBadge(ctx, cfg) {
    var tEl = h('b'), hEl = h('b');
    var el = h('div.ow-badge',
      h('span.ow-badge-i', null, h('span', { html: UI.icon('thermo', 16) }), tEl),
      h('span.ow-badge-i', null, h('span', { html: UI.icon('drop', 16) }), hEl));
    function draw() {
      var tv = num(ctx, cfg.tempEntity), hv = num(ctx, cfg.humidityEntity);
      tEl.textContent = tv != null ? Math.round(tv) + '°' : '--'; hEl.textContent = hv != null ? Math.round(hv) + '%' : '--';
    }
    draw();
    return { el: el, update: draw };
  }

  var CSS = [
    // the live feed replaces the hero's big camera icon, same trick okie-lenslink.js uses
    '.dt[data-owlet-hero="1"] .dt-iconbg,.dt[data-owlet-hero="1"] .dt-video{display:none;}',
    '.owlet-hero-wrap{position:absolute;inset:0;}',
    '.owlet-hero-wrap .cam-player{position:absolute;inset:0;width:100%;height:100%;margin:0;aspect-ratio:auto;border-radius:0;-webkit-clip-path:none;clip-path:none;cursor:default;}',
    '.owlet-hero-wrap .cam-player .cam-snap{object-fit:cover;}',
    '.ow-badge{position:absolute;top:14px;right:14px;display:flex;gap:8px;z-index:3;}',
    '.ow-badge-i{display:flex;align-items:center;gap:4px;padding:5px 10px;border-radius:999px;background:rgba(10,14,22,.55);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;}',
    '.ow-badge-i svg{opacity:.9;}',
    '.ow-panel{display:flex;flex-direction:column;gap:10px;padding:2px 2px 4px;overflow:hidden;}',
    '.ow-track{display:flex;transition:transform .32s cubic-bezier(.22,.9,.32,1);touch-action:pan-y;}',
    '.ow-page{flex:0 0 100%;min-width:0;display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:20px;background:var(--okie-tile,rgba(255,255,255,.08));-webkit-backdrop-filter:var(--okie-card-bf,none);backdrop-filter:var(--okie-card-bf,none);border:1px solid var(--glass-border-color,rgba(255,255,255,.16));box-sizing:border-box;}',
    '.ow-head{display:flex;align-items:center;gap:8px;font-size:15px;font-weight:700;}',
    '.ow-head svg{flex:none;}',
    '.ow-demo{margin-left:auto;font-size:10.5px;font-weight:700;opacity:.6;text-align:right;max-width:120px;line-height:1.25;}',
    '.ow-bigrow{display:flex;align-items:baseline;gap:4px;}',
    '.ow-big{font-size:48px;font-weight:700;letter-spacing:-.02em;}',
    '.ow-unit{font-size:20px;font-weight:600;opacity:.65;}',
    '.ow-zone{position:relative;height:10px;border-radius:999px;background:linear-gradient(90deg,#34c6ff,#8ef0c0,#ffcf5c,#ff8a5c);margin-top:2px;}',
    '.ow-zone-dot{position:absolute;top:50%;width:18px;height:18px;border-radius:50%;background:#fff;border:3px solid rgba(0,0,0,.25);box-shadow:0 1px 4px rgba(0,0,0,.4);transform:translate(-50%,-50%);transition:left .4s;}',
    '.ow-zone-labels{display:flex;justify-content:space-between;font-size:11px;font-weight:600;opacity:.6;}',
    '.ow-sub-row{display:flex;align-items:center;gap:8px;font-size:13.5px;opacity:.9;}',
    '.ow-sub-row b{margin-left:auto;font-variant-numeric:tabular-nums;}',
    '.ow-sub-row.ow-center{justify-content:center;}',
    '.ow-subhead{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;opacity:.55;margin-top:2px;}',
    '.ow-bars{display:flex;align-items:flex-end;gap:6px;height:84px;}',
    '.ow-bar-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;}',
    '.ow-bar-track{flex:1;width:10px;border-radius:5px;background:rgba(255,255,255,.12);display:flex;align-items:flex-end;}',
    '.ow-bar-fill{width:100%;border-radius:5px;background:linear-gradient(180deg,#7fd8ff,#3a8bff);}',
    '.ow-bar-v{font-size:10px;font-weight:700;opacity:.8;}',
    '.ow-bar-l{font-size:10px;font-weight:600;opacity:.55;}',
    '.ow-dots-row{display:flex;align-items:flex-end;gap:6px;height:44px;}',
    '.ow-dot-col{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;}',
    '.ow-dot-track{position:relative;flex:1;width:100%;}',
    '.ow-dot{position:absolute;left:50%;width:8px;height:8px;border-radius:50%;background:#ff7fb0;transform:translate(-50%,50%);}',
    '.ow-ring{position:relative;width:118px;height:118px;border-radius:50%;margin:4px auto;background:conic-gradient(#30d6c4 var(--ow-ring-deg,0deg),rgba(255,255,255,.12) 0);display:flex;align-items:center;justify-content:center;}',
    '.ow-ring-face{width:94px;height:94px;border-radius:50%;background:var(--okie-card-bg,rgba(10,14,22,.85));display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;text-align:center;}',
    '.ow-ring-face b{font-size:13.5px;font-weight:700;}.ow-ring-face em{font-style:normal;font-size:10px;opacity:.6;}',
    '.ow-posrow{display:flex;align-items:center;gap:10px;font-size:13px;}',
    '.ow-posl{width:46px;flex:none;font-weight:600;opacity:.8;}',
    '.ow-postrack{flex:1;height:10px;border-radius:5px;background:rgba(255,255,255,.12);overflow:hidden;}',
    '.ow-posfill{height:100%;border-radius:5px;background:linear-gradient(90deg,#8ef0c0,#30d6c4);}',
    '.ow-posv{width:38px;flex:none;text-align:right;font-variant-numeric:tabular-nums;opacity:.85;}',
    '.ow-dots{display:flex;justify-content:center;gap:6px;}',
    '.ow-dots i{width:6px;height:6px;border-radius:50%;background:rgba(255,255,255,.25);}',
    '.ow-dots i.on{background:#fff;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  g.OkieMotor.owlet = { configFor: configFor, panel: panel, liveBadge: liveBadge };
})(typeof globalThis !== 'undefined' ? globalThis : window);

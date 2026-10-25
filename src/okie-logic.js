/* okie-logic: the pure rules behind the UI (no DOM, fully unit-tested).
 *
 *  - quick control (tap vs hold, safe vs risky direction)
 *  - browse categories, grouping, area sensors
 *  - video background fallback (six steps) and state normalisation
 *  - bento height ladder
 *  - circular slider geometry
 *  - history analytics (segments, durations, stats, time-of-day, series)
 */
(function (g) {
  'use strict';

  // ------------------------------------------------------ quick control ----
  var DEFAULT_QUICK = {
    light: 'tap', switch: 'tap', fan: 'tap', input_boolean: 'tap', media_player: 'tap',
    climate: 'tap', vacuum: 'tap', scene: 'tap', script: 'tap', cover: 'hold', lock: 'hold',
  };

  /**
   * quickAction(item, cfg) -> { mode:'tap'|'hold', domain, service, data } | null
   * cfg: per-domain 'off' | 'tap' | 'hold'. For cover/lock the "hold" setting
   * only guards the risky direction (opening / unlocking); the safe direction
   * (closing / locking) stays a single tap, as FSC does on purpose.
   */
  function quickAction(item, cfg) {
    cfg = cfg || DEFAULT_QUICK;
    var d = item.domain;
    var setting = cfg[d];
    if (!setting || setting === 'off') return null;
    if (item.state === 'unavailable' || item.state === 'unknown') return null;
    var id = { entity_id: item.id };
    var out = null, risky = false;
    switch (d) {
      case 'light': case 'switch': case 'fan': case 'input_boolean': case 'media_player':
        out = { domain: d, service: 'toggle', data: id }; break;
      case 'climate':
        out = { domain: d, service: item.state === 'off' ? 'turn_on' : 'turn_off', data: id }; break;
      case 'vacuum':
        out = { domain: d, service: item.state === 'cleaning' ? 'return_to_base' : 'start', data: id }; break;
      case 'scene': out = { domain: 'scene', service: 'turn_on', data: id }; break;
      case 'script': out = { domain: 'script', service: 'turn_on', data: id }; break;
      case 'cover':
        if (item.state === 'closed' || item.state === 'closing') { out = { domain: d, service: 'open_cover', data: id }; risky = true; }
        else out = { domain: d, service: 'close_cover', data: id };
        break;
      case 'lock':
        if (item.state === 'locked' || item.state === 'locking') { out = { domain: d, service: 'unlock', data: id }; risky = true; }
        else out = { domain: d, service: 'lock', data: id };
        break;
      default: return null;
    }
    if (setting === 'hold') out.mode = (d === 'cover' || d === 'lock') ? (risky ? 'hold' : 'tap') : 'hold';
    else out.mode = 'tap';
    return out;
  }

  // ------------------------------------------------------------ browse ----
  // The four top-level categories from FSC's header: Devices, Sensors, Actions, Custom.
  var TOP_CATEGORIES = {
    devices: { id: 'devices', domains: ['light', 'switch', 'input_boolean', 'climate', 'cover', 'media_player', 'fan', 'lock', 'vacuum', 'camera', 'alarm_control_panel', 'humidifier', 'water_heater', 'siren'] },
    sensors: { id: 'sensors', domains: ['sensor', 'binary_sensor', 'weather', 'person', 'device_tracker', 'sun'] },
    actions: { id: 'actions', domains: ['scene', 'script', 'automation', 'button', 'input_button'] },
    custom: { id: 'custom', domains: [] },
  };

  // The pill row under the search field (screenshot: All, Favorites, Suggestions, Lights, ...).
  var CHIP_FILTERS = [
    { id: 'all', icon: 'grid' },
    { id: 'favorites', icon: 'heart' },
    { id: 'suggestions', icon: 'spark' },
    { id: 'lights', domains: ['light'] },
    { id: 'switches', domains: ['switch', 'input_boolean'] },
    { id: 'climate', domains: ['climate', 'humidifier', 'water_heater', 'fan'] },
    { id: 'covers', domains: ['cover'] },
    { id: 'media', domains: ['media_player'] },
    { id: 'cleaning', domains: ['vacuum'] },
    { id: 'security', domains: ['lock', 'alarm_control_panel', 'camera', 'siren'], binary: ['door', 'window', 'garage_door', 'smoke', 'safety', 'motion', 'gas'] },
  ];

  function inTopCategory(item, cat) {
    var c = TOP_CATEGORIES[cat];
    return !!c && c.domains.indexOf(item.domain) >= 0;
  }

  function applyChipFilter(items, chipId, ctx) {
    ctx = ctx || {};
    var chip = CHIP_FILTERS.filter(function (c) { return c.id === chipId; })[0];
    if (!chip || chipId === 'all') return items;
    if (chipId === 'favorites') {
      var fav = new Set(ctx.favorites || []);
      return items.filter(function (i) { return fav.has(i.id); });
    }
    if (chipId === 'suggestions') {
      var sug = new Set((ctx.suggestions || []).map(function (i) { return i.id; }));
      return items.filter(function (i) { return sug.has(i.id); });
    }
    return items.filter(function (i) {
      if (chip.domains && chip.domains.indexOf(i.domain) >= 0) return true;
      return !!(chip.binary && i.domain === 'binary_sensor' && chip.binary.indexOf(i.deviceClass) >= 0);
    });
  }

  /**
   * groupItems(items, mode, ctx) -> [{ key, title, areaId, items }]
   * mode: 'area' | 'category' | 'usage'
   * ctx: { usageScore(id), domainLabel(domain), otherLabel }
   */
  function groupItems(items, mode, ctx) {
    ctx = ctx || {};
    var other = ctx.otherLabel || 'Other';
    var groups = new Map();
    function add(key, title, areaId, it) {
      if (!groups.has(key)) groups.set(key, { key: key, title: title, areaId: areaId || null, items: [] });
      groups.get(key).items.push(it);
    }
    if (mode === 'usage') {
      var sorted = items.slice().sort(function (a, b) {
        var ua = ctx.usageScore ? ctx.usageScore(a.id) : 0, ub = ctx.usageScore ? ctx.usageScore(b.id) : 0;
        return ub - ua || a.name.localeCompare(b.name);
      });
      return [{ key: 'usage', title: ctx.usageTitle || 'Most used', areaId: null, items: sorted }];
    }
    items.forEach(function (it) {
      if (mode === 'category') add(it.domain, ctx.domainLabel ? ctx.domainLabel(it.domain) : it.domain, null, it);
      else if (it.areaId) add('a:' + it.areaId, it.area, it.areaId, it);
      else add('~none', other, null, it);
    });
    var out = Array.from(groups.values());
    out.sort(function (a, b) {
      if (a.key === '~none') return 1;
      if (b.key === '~none') return -1;
      return a.title.localeCompare(b.title);
    });
    out.forEach(function (gr) { gr.items.sort(function (a, b) { return a.name.localeCompare(b.name); }); });
    return out;
  }

  /** Temperature / humidity of an area, from its sensors (average if several). */
  function areaSensors(all, areaId) {
    var acc = { temperature: [], humidity: [] }, unit = {};
    all.forEach(function (it) {
      if (it.areaId !== areaId || it.domain !== 'sensor') return;
      var k = it.deviceClass;
      if (k !== 'temperature' && k !== 'humidity') return;
      var v = parseFloat(it.state);
      if (isNaN(v)) return;
      acc[k].push(v);
      if (it.unit) unit[k] = it.unit;
    });
    var out = {};
    ['temperature', 'humidity'].forEach(function (k) {
      if (!acc[k].length) return;
      var avg = acc[k].reduce(function (a, b) { return a + b; }, 0) / acc[k].length;
      out[k] = { value: Math.round(avg * 10) / 10, unit: unit[k] || (k === 'temperature' ? '°C' : '%') };
    });
    return out;
  }

  // ------------------------------------------------------------- video ----
  var ON_LIKE = { on: 1, playing: 1, heat: 1, cool: 1, heat_cool: 1, auto: 1, dry: 1, fan_only: 1, home: 1, cleaning: 1, returning: 1, active: 1, buffering: 1, armed_away: 1, armed_home: 1, armed_night: 1, unlocked: 1, locked: 0 };

  /** HA state -> one of on / off / open / closed. Weather keeps its descriptive state. */
  function normalizeState(domain, state) {
    var s = String(state == null ? '' : state).toLowerCase();
    if (domain === 'weather') return s.replace(/-/g, '_');
    if (domain === 'cover') return (s === 'open' || s === 'opening') ? 'open' : 'closed';
    if (domain === 'lock') return s === 'locked' || s === 'locking' ? 'on' : 'off';
    return ON_LIKE[s] ? 'on' : 'off';
  }

  /** Ordered file-name candidates for steps 1-4 of FSC's fallback hierarchy. */
  function videoCandidates(domain, deviceClass, state) {
    var st = normalizeState(domain, state);
    var dc = deviceClass ? String(deviceClass).toLowerCase().replace(/-/g, '_') : '';
    var list = [];
    if (dc) list.push(domain + '_' + dc + '_' + st + '.mp4');   // 1 most specific
    list.push(domain + '_' + st + '.mp4');                      // 2 domain + state
    if (dc) list.push(domain + '_' + dc + '.mp4');              // 3 device class
    list.push(domain + '.mp4');                                 // 4 domain default
    return list;
  }

  /**
   * resolveVideo({ base, domain, deviceClass, state, exists, rng, pool }) -> Promise<url|null>
   *   exists(url) -> Promise<boolean>
   * Steps: 1 {domain}_{dc}_{state}  2 {domain}_{state}  3 {domain}_{dc}  4 {domain}
   *        5 default_1..default_N random pick  6 null (caller shows icon background)
   */
  function resolveVideo(o) {
    var base = String(o.base || '').replace(/\/+$/, '') + '/';
    var cands = videoCandidates(o.domain, o.deviceClass, o.state);
    var rng = o.rng || Math.random;
    var pool = o.pool || 10;
    var exists = o.exists;
    var i = 0;
    function next() {
      if (i < cands.length) {
        var url = base + cands[i++];
        return Promise.resolve(exists(url)).then(function (ok) { return ok ? url : next(); });
      }
      // step 5: random default clip from the pool. default_1 is the canary: if it is
      // missing there is no pool, and the other nine probes are skipped.
      var first = base + 'default_1.mp4';
      return Promise.resolve(exists(first)).then(function (ok1) {
        if (!ok1) return null;                                                // step 6: icon background
        var names = [];
        for (var n = 2; n <= pool; n++) names.push(base + 'default_' + n + '.mp4');
        return Promise.all(names.map(function (u) { return Promise.resolve(exists(u)); })).then(function (flags) {
          var live = [first].concat(names.filter(function (u, ix) { return flags[ix]; }));
          return live[Math.min(live.length - 1, Math.floor(rng() * live.length))];
        });
      });
    }
    return next();
  }

  // ----------------------------------------------------- height ladder ----
  // full -> compact -> dropping rows -> stacked floor (FSC v1.1.2389).
  var LADDER = [
    { name: 'full', min: 576 },
    { name: 'compact', min: 480 },
    { name: 'rows', min: 360 },
    { name: 'stacked', min: 0 },
  ];
  /** Height the card really has: window - its top offset - the island band. */
  function availableHeight(win, cardTop, island) {
    return Math.max(0, win - Math.max(0, cardTop) - (island || 0));
  }
  function pickRung(available) {
    for (var i = 0; i < LADDER.length; i++) if (available >= LADDER[i].min) return LADDER[i].name;
    return 'stacked';
  }
  /** Square widgets: W3/W4 take the row height so they stay square at any width. */
  function squareSize(gridWidth, gap, cols) {
    cols = cols || 4; gap = gap == null ? 16 : gap;
    return Math.max(0, Math.floor((gridWidth - gap * (cols - 1)) / cols));
  }

  // ------------------------------------------------- FSC frame maths ----
  /** The whole card is laid out at 1200 design px and zoomed down on narrower screens (measured from FSC). */
  function zoomFor(vw) { if (vw < 700) return 1; return clamp(0.65 + ((vw - 1080) / 520) * 0.35, 0.65, 1); }
  /** The "content size" setting (percent) as a factor; unusable values mean 100%. */
  /** The text size setting (percent, 70-140) as a multiplier; anything odd means 1. */
  function textScale(pct) { var n = +pct; if (!isFinite(n) || n <= 0) return 1; return clamp(n, 70, 140) / 100; }
  /**
   * Makes every pixel font size of a stylesheet follow the text size setting: font-size:13px -> font-size:calc(13px*var(--okie-fs,1)).
   * Only text moves: boxes, icons and spacing keep their size. --okie-fz is 1 where the engine zooms text with the column, else the zoom (the card measures it): see _measure.
   */
  function scaleFonts(css) {
    return String(css || '').replace(/(font-size:\s*)([^;}]*?)(\s*!important)?(?=[;}])/g, function (m, a, v, imp) {
      v = v.trim(); imp = imp || '';
      if (v.indexOf('--okie-fz') >= 0) return m;                                  // already done
      var px = /^(\d+(?:\.\d+)?)px$/.exec(v);
      // a pixel size follows the text size setting and, where the engine does not zoom text with the column (iOS web views), the zoom as well, but not below 11 px (the text stays readable)
      if (px) return a + 'max(calc(' + px[1] + 'px*var(--okie-fs,1)*var(--okie-fz,1)),min(calc(' + px[1] + 'px*var(--okie-fs,1)),calc(11px*var(--okie-fs,1))))' + imp;
      if (/^(calc|clamp|min|max|var)\(/.test(v)) return a + 'calc((' + v + ')*var(--okie-fz,1))' + imp;      // sizes worked out from the size of a box (the big numbers) follow the zoom; the text setting does not touch them
      return m;
    });
  }
  function userScale(pct) { var n = +pct; if (!isFinite(n) || n <= 0) n = 100; return clamp(n, 40, 130) / 100; }
  /** The column's zoom: FSC's width-based zoom times the user's size, never wider than the card itself. Phones stay at 1. */
  function scaledZoom(vw, pct) { if (vw < 700) return 1; var base = zoomFor(vw); return Math.min(base * userScale(pct), Math.max(vw / 1200, base)); }
  /** On a phone the column can only shrink (it is the full width at 100%): the same layout, smaller, centred, with the background around it.
   *  Not below 70%: iOS Safari will not draw text under 9px, so a smaller column would get bigger text than the rest of the layout. */
  function phoneZoom(pct) { return clamp(userScale(pct), 0.7, 1); }
  /** Where a full-screen phone panel may start, in px from the top of the window: below the status bar / top_offset (up to 48) and below
   *  Home Assistant's own header when it is on screen (up to 120). The panels are fixed to the window, the card itself sits under the header. */
  function panelTop(offset, header) {
    var o = clamp(+offset || 0, 0, 48), h = clamp(+header || 0, 0, 120);
    return Math.max(o, h);
  }
  /** Room to leave above a column that is shorter than the window, so it sits in the middle. `always` centres at any content size; without it only a column made smaller than 100% is centred. */
  function centerGap(avail, shown, pct, always, bias) { if (!always && userScale(pct) >= 1) return 0; return Math.max(0, Math.floor((avail - shown) / 2 * (bias > 0 && bias <= 1 ? bias : 1))); }
  /**
   * How much taller than its normal height the panel of the start screen is (`--okie-w1-extra`; may be negative: a shorter panel). A column whose height was set with its handle makes the panel exactly that tall; a column
   * that was not set fills the room (`auto`, on a tablet the window minus a margin). The panel is as tall as the taller of the two columns, so with both columns set it follows them (it used to stay at `auto` and left
   * a strip of nothing under the columns, which made the whole block look pushed to the top). heights: the two saved heights (0 = not set); a height under `hmin` counts as not set; a column never reaches past the room.
   */
  function panelExtra(auto, gridH, room, heights, hmin) {
    var extras = (heights || []).map(function (px) { px = Math.round(+px) || 0; return px >= (hmin || 0) && px > 0 ? Math.min(px, gridH + room) - gridH : null; });
    if (!extras.some(function (e) { return e != null; })) return auto;
    return Math.max.apply(null, extras.map(function (e) { return e == null ? auto : e; }));
  }
  /** The real height of the zoomed column. iOS web views (the iPad's Safari and the Okie Home app) report a zoomed element at its UNzoomed size: when the box height equals the layout height
   *  and the zoom is not 1, the real height is the layout height times the zoom. Other engines already give the zoomed height. */
  /** canScroll({ overflowX, overflowY, scrollWidth, clientWidth, scrollHeight, clientHeight }) -> true when a finger can scroll this box (a scroll box with more inside than shows). */
  function canScroll(b) {
    var sc = function (o) { return o === 'auto' || o === 'scroll' || o === 'overlay'; };
    return (sc(b.overflowY) && b.scrollHeight > b.clientHeight + 1) || (sc(b.overflowX) && b.scrollWidth > b.clientWidth + 1);
  }
  /**
   * rightLayout({ order }) -> { names, areas, rows }: the grid of the right column for the cards that are in it, top to bottom. order: their keys (w:slider, w:deck, w:feeder, or a favorite's id).
   * A favorite is a card of its own height (an auto row, area p0, p1 ...). With favorites in the column the sliding card keeps the height it has without them (the column scrolls), and with no
   * sliding card in it the cameras card takes the free height.
   */
  function rightLayout(o) {
    var NAME = { 'w:slider': 'w2', 'w:deck': 'w34', 'w:feeder': 'w5' };
    var ROW = { 'w:slider': 'minmax(250px,1fr)', 'w:deck': 'var(--w34-row-height,196px)', 'w:feeder': 'var(--okie-feed-h,92px)' };
    var order = o.order || [], names = [], rows = [], n = 0, widgets = [], cards = 0;
    order.forEach(function (k) {
      if (NAME[k]) { names.push(NAME[k]); rows.push(ROW[k]); widgets.push(k); } else { names.push('p' + n++); rows.push('auto'); cards++; }
    });
    var si = order.indexOf('w:slider');
    // o.reserve: the cameras card is a page of the sliding card (one card) - the card keeps the height it had with the cameras card under it
    var reserve = !!o.reserve && si >= 0 && order.indexOf('w:deck') < 0;
    if (si >= 0 && cards) {
      var others = widgets.filter(function (k) { return k !== 'w:slider'; }).map(function (k) { return ' - ' + ROW[k]; }).join('') + (reserve ? ' - ' + ROW['w:deck'] : '');
      rows[si] = 'max(250px,calc(var(--fsc-grid-h,464px)' + others + ' - ' + (24 * (widgets.length - 1 + (reserve ? 1 : 0))) + 'px))';
    } else if (reserve) { names.push('w34r'); rows.push(ROW['w:deck']); }      // a free row at the end: the card takes the rest, as before
    if (si < 0 && order.length && order[0] === 'w:deck') rows[0] = 'minmax(var(--w34-row-height,196px),1fr)';
    return { names: names, areas: names.map(function (x) { return '"' + x + '"'; }).join(' '), rows: rows.join(' ') };
  }
  /**
   * snapHeight(h, targets, radius) -> { h, hit }: a column height pulled with its handle sticks to the nearest of the heights that mean something (within radius px).
   * targets: [{ v, kind }] - kind: "other" (the other column's height: both the same), "card" (a height that ends right after a whole card), "grid" (the automatic height).
   */
  function snapHeight(h, targets, radius) {
    var best = null, bd = radius == null ? 22 : radius;
    (targets || []).forEach(function (t) { var d = Math.abs(t.v - h); if (d <= bd) { bd = d; best = t; } });
    return best ? { h: Math.round(best.v), hit: best } : { h: Math.round(h), hit: null };
  }
  function columnHeight(rectH, layoutH, zoom) { return zoom && zoom !== 1 && Math.abs(rectH - layoutH) <= 1.5 ? layoutH * zoom : rectH; }
  /** A touch tablet centres a little above the middle (a column dead in the middle looks low): this share of the free space goes above it. */
  var TABLET_CENTER_BIAS = 0.78;
  /**
   * How much taller than the grid the list of cards may be on a tablet (design px) so that no card is cut off at the bottom.
   * bottoms: the bottom edge of every card (px from the top of the scrolling list), shown: the height of the box now, slack: how much longer the list is than the box,
   * room: the space left under the column, pad: what the box keeps free under its last card. Everything fits -> all of it; else up to the last card that still ends in the room.
   */
  function w1Extra(bottoms, shown, slack, room, pad) {
    if (!(slack > 0) || !(room > 0)) return 0;
    if (slack <= room) return Math.floor(slack);
    var limit = shown + room - pad, best = 0;
    for (var i = 0; i < (bottoms || []).length; i++) { var need = bottoms[i] + pad - shown; if (bottoms[i] <= limit && need > best) best = need; }
    return Math.max(0, Math.floor(best));
  }
  /**
   * From the height the card has (in design px, i.e. already divided by the zoom) to the panel and grid heights.
   * 1512x712 with a 56px HA header -> avail 697 -> panel 560, grid 464, compact (what FSC shows there).
   * rung: voll (grid 576) > kompakt > abwerfen (W3/W4 dropped) > boden (stacked floor)
   */
  function layoutFor(availDesign, tall) {
    var panelH = clamp(Math.round(availDesign - 137), 380, tall ? 840 : 672);      // a tablet has the room (its column is zoomed down), so the panel may reach lower
    var gridH = panelH - 96;
    var rung = gridH >= 540 ? 'voll' : gridH >= 440 ? 'kompakt' : gridH >= 340 ? 'abwerfen' : 'boden';
    return { panelH: panelH, gridH: gridH, w34: clamp(Math.round(gridH * 0.42), 150, 200), rung: rung };
  }
  /** Device grid columns by the width the panel has (FSC breakpoints); `setting` is the user's 4/5/6 for wide screens. */
  function gridColumns(width, setting) {
    var wide = setting === 4 || setting === 5 || setting === 6 ? setting : 5;
    if (width >= 1024) return wide;
    if (width >= 868) return 4;
    if (width >= 581) return 3;
    if (width >= 361) return 2;
    return 1;
  }

  // ---------------------------------------------- typewriter + recency ----
  /**
   * The search bar's typing line as a pure function of time: type each line, hold, delete, pause, next.
   * -> { text, line } at t ms after the loop started.
   */
  function typistAt(lines, t, cfg) {
    cfg = cfg || {};
    var type = cfg.typeMs || 45, hold = cfg.holdMs || 2800, del = cfg.delMs || 22, gap = cfg.gapMs || 450;
    if (!lines.length) return { text: '', line: -1 };
    var total = 0, spans = lines.map(function (ln) { var d = ln.length * type + hold + ln.length * del + gap; total += d; return d; });
    var x = ((t % total) + total) % total, i = 0;
    while (x >= spans[i]) { x -= spans[i]; i++; }
    var ln = lines[i], typeEnd = ln.length * type, holdEnd = typeEnd + hold, delEnd = holdEnd + ln.length * del;
    var n = x < typeEnd ? Math.floor(x / type) : (x < holdEnd ? ln.length : (x < delEnd ? ln.length - Math.floor((x - holdEnd) / del) : 0));
    return { text: ln.slice(0, Math.max(0, Math.min(ln.length, n))), line: i };
  }
  /**
   * Recent activity buckets: items sorted newest first and grouped by how long ago they changed.
   * windows: minutes (numbers) and the string 'today'. -> [{ key, minutes|today, items }] (empty buckets dropped)
   */
  function recentBuckets(items, tsOf, now, windows) {
    var d = new Date(now), startOfToday = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    var bounds = windows.map(function (w) { return w === 'today' ? { key: 'today', from: startOfToday } : { key: String(w), minutes: w, from: now - w * 60000 }; })
      .sort(function (a, b) { return b.from - a.from; });                         // narrowest window first
    var out = bounds.map(function (b) { return Object.assign({ items: [] }, b); });
    var earlier = { key: 'earlier', items: [] };
    items.slice().sort(function (a, b) { return tsOf(b) - tsOf(a); }).forEach(function (it) {
      var ts = tsOf(it), placed = false;
      for (var i = 0; i < out.length; i++) if (ts >= out[i].from) { out[i].items.push(it); placed = true; break; }
      if (!placed) earlier.items.push(it);
    });
    out.push(earlier);
    return out.filter(function (b) { return b.items.length; });
  }
  var TIME_SORT = { fine: [5, 15, 30, 60], standard: [15, 60, 'today'], coarse: [60, 360, 720] };
  /** &quot; and friends in a friendly name become real characters (FSC shows them raw). */
  function decodeEntities(s) {
    return String(s == null ? '' : s).replace(/&(quot|amp|lt|gt|apos|#39|#x27|nbsp);/g, function (m, e) { return { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", '#39': "'", '#x27': "'", nbsp: ' ' }[e]; });
  }
  /** How many of these items are on right now (the number in the chip badge). */
  /** Does a search text read like a request to the assistant rather than a device name? */
  var ASK_VERBS = /^(turn|switch|set|make|dim|brighten|open|close|start|stop|lock|unlock|play|pause|what|whats|what's|is|are|how|why|when|who|where|can|could|please|schalte|schalt|mach|mache|stell|stelle|öffne|schließe|schliesse|starte|stoppe|wie|was|ist|sind|warum|wann|wer|wo|kannst|bitte)\b/i;
  function looksLikeAsk(q) {
    var s = String(q || '').trim();
    if (s.length < 5) return false;
    var words = s.split(/\s+/).length;
    return /[?？]$/.test(s) || words >= 4 || (words >= 2 && ASK_VERBS.test(s));
  }
  function activeCount(items, stateOf) { return items.filter(function (i) { return isOn(i.domain, stateOf(i)); }).length; }

  // ---------------------------------------------------------- slider ----
  var ARC = { start: 135, sweep: 270 };   // gap at the bottom, like a gauge
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }
  function snap(v, step, min) { return step ? Math.round((v - min) / step) * step + min : v; }
  /** pointer position -> value. Dead zone at the bottom snaps to the nearer end. */
  function valueFromPointer(cx, cy, x, y, o) {
    var min = o.min, max = o.max;
    var deg = Math.atan2(y - cy, x - cx) * 180 / Math.PI;      // 0 = east, clockwise positive (screen coords)
    var rel = (deg - ARC.start + 360) % 360;                    // 0..360 along the sweep from the start
    if (rel > ARC.sweep) rel = (rel - ARC.sweep) < (360 - rel) ? ARC.sweep : 0;   // gap: nearer end wins
    var v = min + (rel / ARC.sweep) * (max - min);
    return clamp(snap(v, o.step, min), min, max);
  }
  function angleForValue(v, min, max) { return ARC.start + clamp((v - min) / (max - min), 0, 1) * ARC.sweep; }
  // ---- the dial look: one set of numbers (glow blur, spread, strength, tick density) for every wheel, dial and slider ----
  var DIAL_LOOK = { glowBlur: 80, glowSpread: 15, glowOpacity: 65, ticks: 100 };
  /** Whatever the settings hold, a look the controls can draw: numbers inside their range (the defaults are the thermostat wheel's). */
  function dialLook(raw) {
    raw = raw || {};
    function num(k, lo, hi) { var v = raw[k] == null || raw[k] === '' ? NaN : +raw[k]; return isFinite(v) ? clamp(v, lo, hi) : DIAL_LOOK[k]; }
    return { glowBlur: num('glowBlur', 0, 200), glowSpread: num('glowSpread', 0, 60), glowOpacity: num('glowOpacity', 0, 100), ticks: num('ticks', 40, 160) };
  }
  /** The glow of a round dial of this size in px: the blur (sigma), how much wider than the arc it is, how strong. The wheel's numbers are for a 420 px design: a smaller dial gets a proportionally smaller glow. */
  function dialGlow(look, size) {
    var lk = dialLook(look), s = (size || 260) / 420;
    return { sigma: lk.glowBlur <= 0 ? 0 : Math.max(0.8, lk.glowBlur / 2 * s * 0.6), widen: lk.glowSpread * s * 0.5, alpha: lk.glowOpacity / 100 * 0.9 };
  }
  /** The angles (degrees) of the ticks along a dial's sweep: 64 at 100 %, more or fewer with the tick density; both ends get one. */
  function dialTickAngles(look, start, sweep) {
    var n = Math.max(1, Math.round(64 * dialLook(look).ticks / 100)), out = [];
    for (var i = 0; i <= n; i++) out.push(start + sweep * i / n);
    return out;
  }
  /** The light that spills from the filled part of a slider into its track: blur in px, how much further it reaches, how strong. */
  function sliderGlow(look) { var lk = dialLook(look); return { blur: lk.glowBlur * 0.14, spread: lk.glowSpread * 0.12, alpha: lk.glowOpacity / 100 * 0.8 }; }
  function polar(cx, cy, r, deg) { var a = deg * Math.PI / 180; return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }; }
  /** SVG arc path from degree a0 to a1 (clockwise). */
  function arcPath(cx, cy, r, a0, a1) {
    var p0 = polar(cx, cy, r, a0), p1 = polar(cx, cy, r, a1);
    var large = (a1 - a0) > 180 ? 1 : 0;
    return 'M' + p0.x.toFixed(2) + ' ' + p0.y.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + large + ' 1 ' + p1.x.toFixed(2) + ' ' + p1.y.toFixed(2);
  }
  /** Cold-to-warm colour for temperature sliders (blue 0 -> orange 1). */
  function tempColor(t) {
    t = clamp(t, 0, 1);
    var c0 = [79, 140, 255], c1 = [255, 176, 32];
    var m = c0.map(function (v, i) { return Math.round(v + (c1[i] - v) * t); });
    return 'rgb(' + m.join(',') + ')';
  }

  // ---------------------------------------------------------- physics ----
  /** One semi-implicit Euler step of a damped spring (stiffness k, damping c, unit mass). Mutates and returns s = {x, v}. */
  function springStep(s, target, dt, o) {
    var k = (o && o.k) || 170, c = (o && o.c) || 22;
    var n = Math.max(1, Math.ceil(dt / (1 / 240)));     // substeps keep it stable at large dt
    var h = dt / n;
    for (var i = 0; i < n; i++) { s.v += (-k * (s.x - target) - c * s.v) * h; s.x += s.v * h; }
    return s;
  }
  function springSettled(s, target, eps) { eps = eps || 0.001; return Math.abs(s.x - target) < eps && Math.abs(s.v) < eps * 20; }

  // --------------------------------------------------------- history ----
  var ACTIVE = { on: 1, open: 1, opening: 1, playing: 1, home: 1, heat: 1, cool: 1, heat_cool: 1, cleaning: 1, unlocked: 1, armed_away: 1, armed_home: 1, auto: 1, detected: 1 };

  /** rows: [{state, last_changed}] sorted by time -> segments clamped to [from, to]. */
  function toSegments(rows, from, to) {
    var segs = [];
    for (var i = 0; i < rows.length; i++) {
      var s = Date.parse(rows[i].last_changed || rows[i].last_updated);
      if (isNaN(s)) continue;
      var e = i + 1 < rows.length ? Date.parse(rows[i + 1].last_changed || rows[i + 1].last_updated) : to;
      var a = Math.max(s, from), b = Math.min(isNaN(e) ? to : e, to);
      if (b > a) segs.push({ state: rows[i].state, from: a, to: b });
    }
    return segs;
  }
  function durationsByState(segs) {
    var out = {};
    segs.forEach(function (s) { out[s.state] = (out[s.state] || 0) + (s.to - s.from); });
    return out;
  }
  function isActive(state) { return !!ACTIVE[state]; }
  function historyStats(segs) {
    var activeMs = 0, total = 0, runs = [], cur = 0;
    segs.forEach(function (s) {
      var d = s.to - s.from;
      total += d;
      if (isActive(s.state)) { activeMs += d; cur += d; }
      else if (cur) { runs.push(cur); cur = 0; }
    });
    if (cur) runs.push(cur);
    var changes = 0;
    for (var i = 1; i < segs.length; i++) if (segs[i].state !== segs[i - 1].state) changes++;
    return {
      changes: changes,
      activeMs: activeMs,
      activePct: total ? activeMs / total : 0,
      avgActiveRunMs: runs.length ? runs.reduce(function (a, b) { return a + b; }, 0) / runs.length : 0,
      runs: runs.length,
    };
  }
  /** Minutes the entity was active in each hour of the day, summed over the window. */
  function hourlyActivity(segs) {
    var out = new Array(24).fill(0);
    segs.forEach(function (s) {
      if (!isActive(s.state)) return;
      var t = s.from;
      while (t < s.to) {
        var d = new Date(t);
        var next = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours() + 1).getTime();
        var end = Math.min(next, s.to);
        out[d.getHours()] += (end - t) / 60000;
        t = end;
      }
    });
    return out;
  }
  /** Numeric points for sensors; returns { points, min, max, avg }. */
  function numericSeries(segs) {
    var pts = [], sum = 0, min = Infinity, max = -Infinity;
    segs.forEach(function (s) {
      var v = parseFloat(s.state);
      if (isNaN(v)) return;
      pts.push({ t: s.from, v: v });
      sum += v; if (v < min) min = v; if (v > max) max = v;
    });
    return { points: pts, min: pts.length ? min : null, max: pts.length ? max : null, avg: pts.length ? sum / pts.length : null };
  }
  /** Downsample to n buckets by averaging (keeps charts light on a wall tablet). */
  function bucketSeries(points, n) {
    if (points.length <= n) return points.slice();
    var out = [], size = points.length / n;
    for (var i = 0; i < n; i++) {
      var a = Math.floor(i * size), b = Math.max(a + 1, Math.floor((i + 1) * size));
      var slice = points.slice(a, b), sv = 0;
      slice.forEach(function (p) { sv += p.v; });
      out.push({ t: slice[Math.floor(slice.length / 2)].t, v: sv / slice.length });
    }
    return out;
  }
  // ------------------------------------------------------- chart maths ----
  /** "Nice" axis: steps of 1, 2, 2.5 or 5 x 10^n covering [min, max]. */
  function niceTicks(min, max, count) {
    count = count || 5;
    if (!(max > min)) { var pad = Math.abs(min) * 0.05 || 1; min -= pad; max += pad; }
    var raw = (max - min) / count, mag = Math.pow(10, Math.floor(Math.log10(raw))), f = raw / mag;
    var step = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * mag;
    var lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, ticks = [];
    for (var v = lo; v <= hi + step * 1e-9; v += step) ticks.push(Math.round(v / step * 1e6) / 1e6 * step);
    return { ticks: ticks, min: lo, max: hi, step: step };
  }
  /** Map points {t,v} into a box; returns SVG path data for the line and for the filled area. */
  function linePath(points, box, sc) {
    if (!points.length) return { d: '', area: '', xy: [] };
    var xy = points.map(function (p) {
      return { x: box.x + (sc.t1 === sc.t0 ? 0 : (p.t - sc.t0) / (sc.t1 - sc.t0)) * box.w, y: box.y + box.h - (sc.v1 === sc.v0 ? 0.5 : (p.v - sc.v0) / (sc.v1 - sc.v0)) * box.h };
    });
    var f = function (n) { return (Math.round(n * 100) / 100); };
    var d = xy.map(function (q, i) { return (i ? 'L' : 'M') + f(q.x) + ' ' + f(q.y); }).join('');
    var last = xy[xy.length - 1], first = xy[0];
    return { d: d, area: d + 'L' + f(last.x) + ' ' + f(box.y + box.h) + 'L' + f(first.x) + ' ' + f(box.y + box.h) + 'Z', xy: xy };
  }

  /** "3 min ago" / "vor 3 Min." from a millisecond age. */
  function relativeTime(ageMs, lang) {
    var de = lang === 'de', m = Math.round(ageMs / 60000);
    if (ageMs < 45000) return de ? 'gerade eben' : 'just now';
    if (m < 60) return de ? 'vor ' + m + ' Min.' : m + ' min ago';
    var hrs = Math.round(m / 60);
    if (hrs < 24) return de ? 'vor ' + hrs + ' Std.' : hrs + ' h ago';
    var d = Math.round(hrs / 24);
    return de ? 'vor ' + d + (d === 1 ? ' Tag' : ' Tagen') : d + (d === 1 ? ' day ago' : ' days ago');
  }
  /** Bit test for HA supported_features. */
  function has(features, bit) { return ((features || 0) & bit) === bit; }

  /** Quiet hours like "22:00" -> "07:00" (wraps midnight). Equal times mean never quiet. */
  function inQuietHours(nowMs, from, to) {
    function mins(s) { var m = /^(\d{1,2}):(\d{2})/.exec(s || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; }
    var a = mins(from), b = mins(to);
    if (a == null || b == null || a === b) return false;
    var d = new Date(nowMs), cur = d.getHours() * 60 + d.getMinutes();
    return a < b ? (cur >= a && cur < b) : (cur >= a || cur < b);
  }

  var RANGES = { '24h': 86400000, '7d': 7 * 86400000, '30d': 30 * 86400000 };

  function fmtDuration(ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return '<1 min';
    if (m < 60) return m + ' min';
    var h = Math.floor(m / 60), r = m % 60;
    if (h < 48) return h + ' h' + (r ? ' ' + r + ' min' : '');
    return Math.round(h / 24) + ' d';
  }

  // ------------------------------------------------------ state text ----
  var LABELS = {
    en: { on: 'On', off: 'Off', open: 'Open', closed: 'Closed', locked: 'Locked', unlocked: 'Unlocked', playing: 'Playing', paused: 'Paused', idle: 'Idle', standby: 'Standby', home: 'Home', not_home: 'Away', heat: 'Heating', cool: 'Cooling', heat_cool: 'Auto', auto: 'Auto', dry: 'Dry', fan_only: 'Fan', docked: 'Docked', cleaning: 'Cleaning', returning: 'Returning', opening: 'Opening', closing: 'Closing', locking: 'Locking', unlocking: 'Unlocking', unavailable: 'Unavailable', unknown: 'Unknown', armed_home: 'Armed home', armed_away: 'Armed away', disarmed: 'Disarmed', triggered: 'Triggered', detected: 'Detected', clear: 'Clear' },
    de: { on: 'An', off: 'Aus', open: 'Offen', closed: 'Geschlossen', locked: 'Verriegelt', unlocked: 'Entriegelt', playing: 'Spielt', paused: 'Pausiert', idle: 'Bereit', standby: 'Standby', home: 'Zuhause', not_home: 'Unterwegs', heat: 'Heizen', cool: 'Kühlen', heat_cool: 'Auto', auto: 'Auto', dry: 'Trocknen', fan_only: 'Lüfter', docked: 'Angedockt', cleaning: 'Saugt', returning: 'Kehrt zurück', opening: 'Öffnet', closing: 'Schließt', locking: 'Verriegelt…', unlocking: 'Entriegelt…', unavailable: 'Nicht verfügbar', unknown: 'Unbekannt', armed_home: 'Scharf (zuhause)', armed_away: 'Scharf (abwesend)', disarmed: 'Unscharf', triggered: 'Ausgelöst', detected: 'Erkannt', clear: 'Frei' },
  };
  function stateLabel(state, lang) {
    var m = LABELS[lang === 'de' ? 'de' : 'en'];
    return m[state] || String(state);
  }
  // ----- the state words Fast Search Card puts on its tiles (its own tables, English and German) -----
  var FSC_STATE = {"en":{"states":{"on":"On","off":"Off","home":"Home","not_home":"Away","unknown":"Unknown","unavailable":"Unavailable","heat":"Heating","cool":"Cooling","heat_cool":"Auto","dry":"Drying","fan_only":"Fan only","auto":"Automatic","open":"Open","closed":"Closed","opening":"Opening","closing":"Closing","stopped":"Stopped","locked":"Locked","unlocked":"Unlocked","locking":"Locking...","unlocking":"Unlocking...","jammed":"Jammed","disarmed":"Disarmed","armed_home":"Armed Home","armed_away":"Armed Away","armed_night":"Armed Night","armed_vacation":"Armed Vacation","armed_custom_bypass":"Armed Custom","pending":"Pending...","triggered":"Triggered","arming":"Arming...","playing":"Playing","paused":"Paused","idle":"Idle","standby":"Standby","buffering":"Buffering","docked":"Docked","cleaning":"Cleaning","returning":"Returning","error":"Error","clear-night":"Clear Night","cloudy":"Cloudy","fog":"Foggy","hail":"Hail","lightning":"Lightning","lightning-rainy":"Lightning Rain","partlycloudy":"Partly Cloudy","pouring":"Heavy Rain","rainy":"Rainy","snowy":"Snowy","snowy-rainy":"Sleet","sunny":"Sunny","windy":"Windy","windy-variant":"Windy","exceptional":"Exceptional","recording":"Recording","streaming":"Streaming","active":"Active","scening":"Scene"},"deviceClasses":{"battery":{"on":"Low","off":"Normal"},"battery_charging":{"on":"Charging","off":"Not charging"},"cold":{"on":"Cold","off":"Normal"},"connectivity":{"on":"Connected","off":"Disconnected"},"door":{"on":"Open","off":"Closed"},"garage_door":{"on":"Open","off":"Closed"},"gas":{"on":"Gas detected","off":"Clear"},"heat":{"on":"Hot","off":"Normal"},"light":{"on":"Light detected","off":"Dark"},"lock":{"on":"Unlocked","off":"Locked"},"moisture":{"on":"Wet","off":"Dry"},"motion":{"on":"Motion detected","off":"No motion"},"moving":{"on":"Moving","off":"Stopped"},"occupancy":{"on":"Occupied","off":"Clear"},"opening":{"on":"Open","off":"Closed"},"plug":{"on":"Plugged in","off":"Unplugged"},"power":{"on":"On","off":"Off"},"presence":{"on":"Present","off":"Away"},"problem":{"on":"Problem","off":"OK"},"running":{"on":"Running","off":"Stopped"},"safety":{"on":"Unsafe","off":"Safe"},"smoke":{"on":"Smoke detected","off":"Clear"},"sound":{"on":"Sound detected","off":"Quiet"},"tamper":{"on":"Tampered","off":"OK"},"update":{"on":"Update available","off":"Up to date"},"vibration":{"on":"Vibration","off":"No vibration"},"window":{"on":"Open","off":"Closed"}}},"de":{"states":{"on":"Ein","off":"Aus","home":"Zuhause","not_home":"Abwesend","unknown":"Unbekannt","unavailable":"Nicht verfügbar","heat":"Heizen","cool":"Kühlen","heat_cool":"Auto","dry":"Entfeuchten","fan_only":"Nur Lüfter","auto":"Automatisch","open":"Offen","closed":"Geschlossen","opening":"Öffnet","closing":"Schließt","stopped":"Gestoppt","locked":"Verriegelt","unlocked":"Entriegelt","locking":"Verriegelt...","unlocking":"Entriegelt...","jammed":"Verklemmt","disarmed":"Deaktiviert","armed_home":"Zuhause scharf","armed_away":"Abwesend scharf","armed_night":"Nacht scharf","armed_vacation":"Urlaub scharf","armed_custom_bypass":"Teilscharf","pending":"Aktiviert...","triggered":"Ausgelöst","arming":"Wird scharf...","playing":"Wiedergabe","paused":"Pausiert","idle":"Bereit","standby":"Standby","buffering":"Puffert","docked":"Ladestation","cleaning":"Reinigt","returning":"Kehrt zurück","error":"Fehler","clear-night":"Klare Nacht","cloudy":"Bewölkt","fog":"Neblig","hail":"Hagel","lightning":"Gewitter","lightning-rainy":"Gewitterregen","partlycloudy":"Teilweise bewölkt","pouring":"Starkregen","rainy":"Regnerisch","snowy":"Schnee","snowy-rainy":"Schneeregen","sunny":"Sonnig","windy":"Windig","windy-variant":"Windig","exceptional":"Außergewöhnlich","recording":"Aufnahme","streaming":"Streaming","active":"Aktiv","scening":"Szene"},"deviceClasses":{"battery":{"on":"Niedrig","off":"Normal"},"battery_charging":{"on":"Lädt","off":"Lädt nicht"},"cold":{"on":"Kalt","off":"Normal"},"connectivity":{"on":"Verbunden","off":"Getrennt"},"door":{"on":"Offen","off":"Geschlossen"},"garage_door":{"on":"Offen","off":"Geschlossen"},"gas":{"on":"Gas erkannt","off":"Kein Gas"},"heat":{"on":"Heiß","off":"Normal"},"light":{"on":"Licht erkannt","off":"Dunkel"},"lock":{"on":"Entriegelt","off":"Verriegelt"},"moisture":{"on":"Feucht","off":"Trocken"},"motion":{"on":"Bewegung","off":"Keine Bewegung"},"moving":{"on":"Bewegt sich","off":"Stillstand"},"occupancy":{"on":"Belegt","off":"Frei"},"opening":{"on":"Offen","off":"Geschlossen"},"plug":{"on":"Eingesteckt","off":"Ausgesteckt"},"power":{"on":"Ein","off":"Aus"},"presence":{"on":"Anwesend","off":"Abwesend"},"problem":{"on":"Problem","off":"OK"},"running":{"on":"Läuft","off":"Gestoppt"},"safety":{"on":"Unsicher","off":"Sicher"},"smoke":{"on":"Rauch erkannt","off":"Kein Rauch"},"sound":{"on":"Geräusch erkannt","off":"Still"},"tamper":{"on":"Manipulation","off":"OK"},"update":{"on":"Update verfügbar","off":"Aktuell"},"vibration":{"on":"Vibration","off":"Keine Vibration"},"window":{"on":"Offen","off":"Geschlossen"}}}};
  /** FSC's xd(): label for a state, binary sensors by device class; unknown states pass through untouched. */
  function fscStateText(state, domain, deviceClass, lang) {
    var t = FSC_STATE[lang === 'de' ? 'de' : 'en'];
    if (domain === 'binary_sensor' && deviceClass && t.deviceClasses[deviceClass]) return t.deviceClasses[deviceClass][state] || t.states[state] || state;
    return t.states[state] || state;
  }
  var HINTS = {
    en: { temperature: { cold: 'Cool - Consider heating', optimal: 'Optimal temperature', warm: 'Warm - Ventilation recommended', hot: 'Very warm - Cooling recommended' }, humidity: { low: 'Too dry - Humidifier recommended', optimal: 'Optimal humidity', high: 'Too humid - Ventilation recommended' }, co2: { good: 'Good air quality', moderate: 'Moderate air quality', poor: 'Poor air - Ventilate!' }, battery: { critical: 'Battery almost empty!', low: 'Battery low', good: 'Battery OK', full: 'Battery full' } },
    de: { temperature: { cold: 'Kühl - Heizung erwägen', optimal: 'Optimale Temperatur', warm: 'Warm - Lüften empfohlen', hot: 'Sehr warm - Kühlung empfohlen' }, humidity: { low: 'Zu trocken - Befeuchter empfohlen', optimal: 'Optimale Luftfeuchtigkeit', high: 'Zu feucht - Lüften empfohlen' }, co2: { good: 'Gute Luftqualität', moderate: 'Mäßige Luftqualität', poor: 'Schlechte Luft - Lüften!' }, battery: { critical: 'Batterie fast leer!', low: 'Batterie schwach', good: 'Batterie OK', full: 'Batterie voll' } },
  };
  /** The sentence under a numeric sensor tile ("Battery OK"); most sensors have none (FSC shows the value in the icon area instead). */
  function sensorHint(state, deviceClass, unit, lang) {
    var a = HINTS[lang === 'de' ? 'de' : 'en'], v = parseFloat(state);
    if (!state || !deviceClass || !a[deviceClass] && deviceClass !== 'battery' || isNaN(v)) { if (!(deviceClass && a[deviceClass])) { if (unit !== '%' && unit !== 'ppm') return null; } }
    if (isNaN(v)) return null;
    if (deviceClass === 'temperature') { if (v < 18) return a.temperature.cold; if (v <= 24) return a.temperature.optimal; if (v <= 27) return a.temperature.warm; return a.temperature.hot; }
    if (deviceClass === 'humidity') { if (v < 30) return a.humidity.low; if (v <= 60) return a.humidity.optimal; return a.humidity.high; }
    if (deviceClass === 'co2' || unit === 'ppm') { if (v < 800) return a.co2.good; if (v <= 1200) return a.co2.moderate; return a.co2.poor; }
    if (deviceClass === 'battery' || unit === '%') { if (v <= 10) return a.battery.critical; if (v <= 30) return a.battery.low; if (v < 90) return a.battery.good; return a.battery.full; }
    return null;
  }
  /** FSC's tile line (its getDisplayState): numeric sensors only get the hint (or nothing), everything else the table word. */
  function tileState(item, st, lang) {
    if (!st) return '';
    var a = st.attributes || {};
    if (item.domain === 'sensor' && !isNaN(parseFloat(st.state))) return sensorHint(st.state, a.device_class, a.unit_of_measurement, lang) || '';
    return fscStateText(st.state, item.domain, a.device_class || item.deviceClass, lang);
  }
  /** FSC's bd(): is the tile "on" (white card)? Sensors never are; scripts and scenes only for five minutes after they ran. */
  function fscActive(state, domain, attrs) {
    if (!state) return false;
    var i = String(state).toLowerCase();
    if (['on', 'ein', 'an', 'open', 'offen', 'home', 'zuhause', 'playing', 'active', 'aktiv'].indexOf(i) >= 0) return true;
    switch (domain) {
      case 'cover': return i === 'open' || i === 'offen';
      case 'lock': return i === 'unlocked' || i === 'entriegelt';
      case 'binary_sensor': return i === 'on' || i === 'true';
      case 'media_player': return ['playing', 'paused', 'on'].indexOf(i) >= 0;
      case 'climate': return i !== 'off' && i !== 'aus';
      case 'vacuum': return ['cleaning', 'returning', 'docked'].indexOf(i) >= 0;
      case 'person': case 'device_tracker': return i === 'home' || i === 'zuhause';
      case 'alarm_control_panel': return ['armed_home', 'armed_away', 'armed_night', 'triggered'].indexOf(i) >= 0;
      case 'timer': return i === 'active' || i === 'paused';
      case 'automation': case 'script': case 'scene': return !!(attrs && attrs.last_triggered) && (Date.now() - new Date(attrs.last_triggered)) / 60000 < 5;
      case 'sensor': return false;
      default: return i === 'on' || i === 'ein';
    }
  }
  /** FSC's wd(): the big value on a sensor tile, rounded per device class. */
  function sensorValue(state, attrs) {
    var unit = (attrs && attrs.unit_of_measurement) || '', dc = attrs && attrs.device_class, v = parseFloat(state);
    if (isNaN(v)) return { value: state, unit: '' };
    var n, u = unit;
    if (dc === 'temperature' || dc === 'energy') n = v.toFixed(1);
    else if (dc === 'humidity' || dc === 'battery') n = String(Math.round(v));
    else if (dc === 'power') { if (v >= 1000) { n = (v / 1000).toFixed(1); u = 'kW'; } else n = String(Math.round(v)); }
    else n = (unit && (unit.indexOf('°') >= 0 || unit === 'K')) ? v.toFixed(1) : (v % 1 === 0 ? String(v) : v.toFixed(1));
    return { value: n, unit: u };
  }

  /** One-line text for a tile or row. st = { state, attributes }. */
  function describeState(domain, st, lang) {
    var a = st.attributes || {}, s = st.state, de = lang === 'de';
    var pct = function (n) { return Math.round(n) + (de ? ' %' : '%'); };
    var num = function (n) { return String(Math.round(n * 10) / 10).replace('.', de ? ',' : '.'); };
    if (s === 'unavailable' || s === 'unknown') return stateLabel(s, lang);
    if (domain === 'sensor') {
      var v = parseFloat(s);
      var u = a.unit_of_measurement ? ' ' + a.unit_of_measurement : '';
      return isNaN(v) ? s : num(v) + u;
    }
    if (domain === 'light' && s === 'on' && a.brightness != null) return stateLabel('on', lang) + ' · ' + pct(a.brightness / 255 * 100);
    if (domain === 'cover') {
      var p = a.current_position;
      if ((s === 'open' || s === 'opening') && p != null && p > 0 && p < 100) return stateLabel('open', lang) + ' · ' + pct(p);
    }
    if (domain === 'climate') {
      var cur = a.current_temperature != null ? num(a.current_temperature) + '°' : '';
      var tgt = a.temperature != null ? ' → ' + num(a.temperature) + '°' : '';
      if (s === 'off') return stateLabel('off', lang) + (cur ? ' · ' + cur : '');
      return stateLabel(s, lang) + (cur ? ' · ' + cur : '') + (cur ? tgt : '');
    }
    if (domain === 'media_player' && s === 'playing' && a.media_title) return String(a.media_title);
    if (domain === 'media_player' && s === 'playing' && a.volume_level != null) return stateLabel('playing', lang);
    if (domain === 'weather') return (a.temperature != null ? num(a.temperature) + '° · ' : '') + s.replace(/[-_]/g, ' ');
    if (domain === 'scene' || domain === 'script') return de ? 'Ausführen' : 'Run';
    return stateLabel(s, lang);
  }
  var ON_STATES = { on: 1, open: 1, opening: 1, playing: 1, home: 1, heat: 1, cool: 1, heat_cool: 1, auto: 1, dry: 1, fan_only: 1, cleaning: 1, returning: 1, unlocked: 1, unlocking: 1, armed_home: 1, armed_away: 1, triggered: 1 };
  /** Does a tile read as "on" (white tile, coloured icon)? Sensors never do except active binary ones. */
  function isOn(domain, state) {
    if (domain === 'sensor' || domain === 'weather' || domain === 'person') return false;
    if (domain === 'scene' || domain === 'script') return false;
    return !!ON_STATES[state];
  }

  /** "Kitchen Ceiling" inside the Kitchen section reads better as "Ceiling" (FSC shows area + short name). */
  function shortName(name, area) {
    var n = decodeEntities(name || ''), a = decodeEntities(area || '');      // (an older saved name may still hold &quot;)
    if (a && n.length > a.length + 1 && n.toLowerCase().indexOf(a.toLowerCase() + ' ') === 0) return n.slice(a.length + 1);
    return n;
  }

  var api = {
    shortName: shortName, stateLabel: stateLabel, describeState: describeState, fscStateText: fscStateText, sensorHint: sensorHint, tileState: tileState, sensorValue: sensorValue, fscActive: fscActive, isOn: isOn, LABELS: LABELS,
    DEFAULT_QUICK: DEFAULT_QUICK, quickAction: quickAction,
    TOP_CATEGORIES: TOP_CATEGORIES, CHIP_FILTERS: CHIP_FILTERS, inTopCategory: inTopCategory,
    applyChipFilter: applyChipFilter, groupItems: groupItems, areaSensors: areaSensors,
    normalizeState: normalizeState, videoCandidates: videoCandidates, resolveVideo: resolveVideo,
    zoomFor: zoomFor, textScale: textScale, scaleFonts: scaleFonts, userScale: userScale, scaledZoom: scaledZoom, phoneZoom: phoneZoom, panelTop: panelTop, centerGap: centerGap, panelExtra: panelExtra, columnHeight: columnHeight, snapHeight: snapHeight, canScroll: canScroll, rightLayout: rightLayout, TABLET_CENTER_BIAS: TABLET_CENTER_BIAS, w1Extra: w1Extra, layoutFor: layoutFor, gridColumns: gridColumns, typistAt: typistAt, recentBuckets: recentBuckets, TIME_SORT: TIME_SORT, decodeEntities: decodeEntities, activeCount: activeCount, looksLikeAsk: looksLikeAsk,
    LADDER: LADDER, availableHeight: availableHeight, pickRung: pickRung, squareSize: squareSize,
    springStep: springStep, springSettled: springSettled,
    ARC: ARC, dialLook: dialLook, dialGlow: dialGlow, dialTickAngles: dialTickAngles, sliderGlow: sliderGlow, valueFromPointer: valueFromPointer, angleForValue: angleForValue, polar: polar, arcPath: arcPath, tempColor: tempColor, snap: snap, clamp: clamp,
    inQuietHours: inQuietHours, niceTicks: niceTicks, linePath: linePath, relativeTime: relativeTime, has: has,
    RANGES: RANGES, toSegments: toSegments, durationsByState: durationsByState, historyStats: historyStats,
    hourlyActivity: hourlyActivity, numericSeries: numericSeries, bucketSeries: bucketSeries, isActive: isActive, fmtDuration: fmtDuration,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.logic = api; }
})(typeof globalThis !== 'undefined' ? globalThis : window);

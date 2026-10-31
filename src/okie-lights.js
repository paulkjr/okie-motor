/* okie-lights: the Lights screen. Every light of the home in one place.
 *
 * Tabs along the top: Favorites (the lights you hearted), one for each room that has lights, and All. A switch in the corner shows them as square
 * tiles or as long rows. Each light has a toggle and, when it can dim, a brightness bar in the style of macOS / iOS (a soft track that fills with
 * the light's own colour and a big white round handle). Tapping the light itself opens its own card (the wheel, colours, schedule).
 *
 * The rules (what counts as a light, whether it dims, its brightness in percent, the tabs, where the finger is on the bar) are pure and
 * unit-tested; the screen is checked in the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  function isLight(id) { return typeof id === 'string' && id.indexOf('light.') === 0; }
  /** Can this light be dimmed? Any colour mode other than on/off says yes; a light that tells nothing about its modes does not. */
  function dimmable(attrs) {
    var m = (attrs && attrs.supported_color_modes) || [];
    return m.some(function (x) { return x !== 'onoff' && x !== 'unknown'; });
  }
  /** 0 when off, else 1..100 (a light that is on but says nothing about brightness counts as 100). */
  function pctOf(st) {
    if (!st || st.state !== 'on') return 0;
    var b = st.attributes && st.attributes.brightness;
    return b == null ? 100 : Math.max(1, Math.min(100, Math.round(b / 255 * 100)));
  }
  /** Where the finger is on the bar, 0..100: the handle's centre runs from half a handle inside the left edge to half a handle inside the right one. */
  function pctFromX(x, left, width, thumb) {
    var span = width - thumb;
    if (!(span > 0)) return 0;
    return Math.max(0, Math.min(100, Math.round((x - left - thumb / 2) / span * 100)));
  }
  /** The tabs: Favorites (always, so you can fill it), each room that has lights, then All. `rooms` = [{ id, name, ids }]. Each tab lists only light ids. */
  function buildTabs(lightIds, favorites, rooms, labels) {
    var have = {}; lightIds.forEach(function (id) { have[id] = true; });
    var tabs = [], fav = (favorites || []).filter(function (id) { return have[id]; });
    if (lightIds.length) tabs.push({ id: 'fav', name: labels.fav, ids: fav });
    (rooms || []).forEach(function (r) {
      var ids = (r.ids || []).filter(function (id) { return have[id]; });
      if (ids.length || r.extra) tabs.push({ id: 'room:' + r.id, name: r.name, ids: ids });      // a room you made yourself shows even before it has a light
    });
    if (lightIds.length) tabs.push({ id: 'all', name: labels.all, ids: lightIds.slice() });
    return tabs;
  }

  var api = { isLight: isLight, dimmable: dimmable, pctOf: pctOf, pctFromX: pctFromX, buildTabs: buildTabs };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  // -------------------------------------------------------------- UI ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, CT = g.OkieMotor.controls, h = UI.h;

  core.registerStrings('en', {
    'app.lights': 'Lights', 'lt.fav': 'Favorites', 'lt.all': 'All lights', 'lt.sub': '{on} on · {n} lights', 'lt.sub1': '{on} on · 1 light', 'lt.on': 'On', 'lt.off': 'Off', 'lt.unavail': 'Unavailable',
    'lt.none': 'No lights in this room yet.', 'lt.nofav': 'No favorites yet.', 'lt.hold': 'Tap Add to put lights here.', 'lt.drag': 'Drag the lamp up or down to dim', 'lt.rm_room': 'Remove this room', 'lt.rm_light': 'Take out of the list', 'lt.pin': 'Show on the start screen', 'lt.rm_sure': 'Remove?', 'lt.bright_pct': 'Brightness {n}%', 'lt.add': 'Add', 'lt.active': '{n} lights on', 'lt.active1': '1 light on', 'lt.active0': 'No lights on', 'lt.new_room': 'New room', 'lt.fav_title': 'Favorite lights', 'lt.in_fav': '{n} favorite lights', 'lt.add_fav': 'Add or remove favorite lights', 'lt.tiles': 'Tiles', 'lt.rows': 'Rows', 'lt.all_off': 'Turn all off', 'lt.all_on': 'Turn all on', 'lt.failed': 'Could not change {name}', 'lt.bright': 'Brightness',
  });
  core.registerStrings('de', {
    'app.lights': 'Lichter', 'lt.fav': 'Favoriten', 'lt.all': 'Alle Lichter', 'lt.sub': '{on} an · {n} Lichter', 'lt.sub1': '{on} an · 1 Licht', 'lt.on': 'An', 'lt.off': 'Aus', 'lt.unavail': 'Nicht verfügbar',
    'lt.none': 'Noch keine Lichter in diesem Raum.', 'lt.nofav': 'Noch keine Favoriten.', 'lt.hold': 'Tippe auf Hinzufügen, um Lichter hier einzufügen.', 'lt.drag': 'Lampe hoch oder runter ziehen zum Dimmen', 'lt.rm_room': 'Diesen Raum entfernen', 'lt.rm_light': 'Aus der Liste nehmen', 'lt.pin': 'Auf dem Startbildschirm zeigen', 'lt.rm_sure': 'Entfernen?', 'lt.bright_pct': 'Helligkeit {n} %', 'lt.add': 'Hinzufügen', 'lt.active': '{n} Lichter an', 'lt.active1': '1 Licht an', 'lt.active0': 'Keine Lichter an', 'lt.new_room': 'Neuer Raum', 'lt.fav_title': 'Lieblingslichter', 'lt.in_fav': '{n} Lieblingslichter', 'lt.add_fav': 'Lieblingslichter hinzufügen oder entfernen', 'lt.tiles': 'Kacheln', 'lt.rows': 'Zeilen', 'lt.all_off': 'Alle ausschalten', 'lt.all_on': 'Alle einschalten', 'lt.failed': '{name} ließ sich nicht ändern', 'lt.bright': 'Helligkeit',
  });

  var THUMB = 24;      // px, the round handle of the brightness bar

  function rgbOf(a) {
    var TH = g.OkieMotor.thermo, c = TH && TH.lightRgb ? TH.lightRgb(a || {}, null) : null;
    return c || { r: 255, g: 167, b: 87 };      // a light that says nothing about its colour: warm white
  }

  /** The brightness bar: a soft track that fills with the light's colour, a big white handle. Drag it, or tap the track. */
  function makeBar(o) {
    var fill = h('div.lt-fill'), thumb = h('div.lt-thumb'), track = h('div.lt-track', null, fill);
    var el = h('div.lt-sl', { role: 'slider', tabindex: '0', 'aria-label': o.label, 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0' }, track, thumb);
    var value = 0, hold = 0, dragging = false, x0 = 0, moved = false, send = CT.throttle(function (v) { o.onInput(v); }, 160);
    function draw(v) {
      value = v; var f = v / 100;
      thumb.style.left = 'calc(' + (f * 100) + '% - ' + (f * THUMB) + 'px)';
      fill.style.width = v > 0 ? 'calc(' + (f * 100) + '% - ' + (f * THUMB) + 'px + ' + (THUMB / 2) + 'px)' : '0';
      el.setAttribute('aria-valuenow', String(v)); el.dataset.empty = v > 0 ? '' : '1';
    }
    function onMove(e) {
      if (!dragging) return;
      if (!moved && Math.abs(e.clientX - x0) < 4) return;
      moved = true; var v = api.pctFromX(e.clientX, el.getBoundingClientRect().left, el.getBoundingClientRect().width, THUMB); draw(v); el.classList.add('drag'); send(v);
    }
    el.addEventListener('pointerdown', function (e) {
      if (e.button != null && e.button > 0) return;
      dragging = true; moved = false; x0 = e.clientX;
      try { el.setPointerCapture(e.pointerId); } catch (x) { /* a browser without capture: the bar still follows while the pointer stays on it */ }
      e.stopPropagation();
    });
    el.addEventListener('pointermove', onMove);
    function end(e) {
      if (!dragging) return; dragging = false; el.classList.remove('drag'); send.cancel();
      var v = moved ? value : api.pctFromX(e.clientX, el.getBoundingClientRect().left, el.getBoundingClientRect().width, THUMB);      // a tap on the track jumps there
      draw(v); hold = Date.now() + 1500; o.onCommit(v);
    }
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', function () { if (dragging) { dragging = false; el.classList.remove('drag'); send.cancel(); } });
    el.addEventListener('click', function (e) { e.stopPropagation(); });
    el.addEventListener('keydown', function (e) {
      var d = e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 5 : e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -5 : 0;
      if (!d) return; e.preventDefault(); var v = Math.max(0, Math.min(100, value + d)); draw(v); send(v);
    });
    return { el: el, set: function (v) { if (!dragging && Date.now() >= hold) draw(v); }, get dragging() { return dragging; } };
  }

  /** The favorites of the Lights screen as plain functions, so the pinned row on the start screen can switch them. */
  function lightishIn(id, S) {
    if (isLight(id)) return true;
    if (typeof id !== 'string' || id.indexOf('switch.') !== 0) return false;
    var st = S[id], hay = id + ' ' + ((st && st.attributes && st.attributes.friendly_name) || '');
    return /light|lamp|licht|leucht|bulb/i.test(hay) && !/schedule|awtrix|matrix|timer|automation|mode|auto_|sensor/i.test(hay);
  }
  function favIdsOf(settings, S) {
    var own = settings.lightsFav, base = Array.isArray(own) ? own : (settings.favorites || []);
    return base.filter(function (id) { var st = S[id]; return !!st && st.state !== 'unavailable' && st.state !== 'unknown' && lightishIn(id, S); });
  }
  api.favOn = function (settings, S) { return favIdsOf(settings, S).some(function (id) { return S[id].state === 'on'; }); };
  api.toggleFav = function (ctx) {
    var hs = ctx.hass(), S = (hs && hs.states) || {}, ids = favIdsOf(ctx.settings.get(), S), on = ids.some(function (id) { return S[id].state === 'on'; });
    ['light', 'switch'].forEach(function (d) { var ii = ids.filter(function (x) { return x.indexOf(d + '.') === 0; }); if (ii.length) ctx.call(d, on ? 'turn_off' : 'turn_on', { entity_id: ii }); });
    return !on;
  };

  function render(container, ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var RM = g.OkieMotor.rooms, AS = g.OkieMotor.appshell;
    var view = ctx.store.get('lights.view', 'tiles') === 'rows' ? 'rows' : 'tiles', tabId = ctx.store.get('lights.tab', ''), disposed = false;
    var AR = g.OkieMotor.arrange, editing = false, barEl = null, holder = null, snap = null, heart = null, tl = g.OkieMotor.tiles.create(ctx, new Map()), cards = {}, tabsNow = [], sig = '', wrap = null, strip = h('div.lt-strip'), shell = null, strips = {};

    function states() { var hs = ctx.hass(); return (hs && hs.states) || {}; }
    /** A light, or a smart switch that runs a light ("bedLight", "Lampe"): those are switch.* in Home Assistant, but belong on this screen. */
    function lightish(id) {
      if (isLight(id)) return true;
      if (typeof id !== 'string' || id.indexOf('switch.') !== 0) return false;
      var st = states()[id], nm = (st && st.attributes && st.attributes.friendly_name) || '';
      var hay = id + ' ' + nm; return /light|lamp|licht|leucht|bulb/i.test(hay) && !/schedule|awtrix|matrix|timer|automation|mode|auto_|sensor/i.test(hay);
    }
    function lightIds() {
      var S = states(), ids = Object.keys(S).filter(function (id) { return lightish(id) && usable(id); });
      return ids.sort(function (a, b) { return nameOf(a).localeCompare(nameOf(b)); });
    }
    function nameOf(id) { var it = ctx.engine.getItem && ctx.engine.getItem(id), st = states()[id]; return (it && it.name) || (st && st.attributes && st.attributes.friendly_name) || id; }
    function areaOf(id) { var it = ctx.engine.getItem && ctx.engine.getItem(id); return (it && it.area) || ''; }
    /** The lights of the Favorites tab: the ones you picked here; until you pick, the lights among the start screen's favorites. */
    function usable(id) { var st = states()[id]; return !!st && st.state !== 'unavailable' && st.state !== 'unknown'; }
    function favLights() {
      var own = ctx.settings.get().lightsFav, S = states();
      var base = Array.isArray(own) ? own : (ctx.settings.get().favorites || []);
      return base.filter(function (id) { return lightish(id) && S[id]; });
    }
    function openFavPicker() {
      var RMx = g.OkieMotor.rooms; if (!RMx || !RMx.openPicker) return;
      RMx.openPicker(ctx, {
        title: t('lt.fav_title'), only: lightish, onClose: function () { drawStrip(); drawCards(); },
        members: function () { return favLights(); },
        count: function (n) { return t('lt.in_fav', { n: n }); },
        toggle: function (id) { var f = favLights(), i = f.indexOf(id); if (i >= 0) f.splice(i, 1); else f.push(id); ctx.settings.set({ lightsFav: f }); },
      });
    }
    function tabs() {
      var rooms = RM && RM.rooms ? RM.rooms(ctx).map(function (r) { return { id: r.id, name: r.name, ids: r.ids.filter(lightish), extra: !!r.extra }; }) : [];
      var out = buildTabs(lightIds(), favLights(), rooms, { fav: t('lt.fav'), all: t('lt.all') }), saved = ctx.settings.get().lightsOrder || {};
      out.forEach(function (tb) { var o = saved[tb.id]; if (tb.id !== 'fav' && tb.id !== 'all' && Array.isArray(o)) tb.ids = o.filter(function (x) { return tb.ids.indexOf(x) >= 0; }).concat(tb.ids.filter(function (x) { return o.indexOf(x) < 0; })); });
      return out;
    }
    function current() { var f = tabsNow.filter(function (x) { return x.id === tabId; })[0]; return f || tabsNow[0] || null; }
    function onCount(ids) { var S = states(); return ids.filter(function (id) { return S[id] && S[id].state === 'on'; }).length; }

    function call(service, data, name) {
      return ctx.call(String(data.entity_id || 'light.x').split('.')[0], service, data).catch(function (e) { ctx.toast('error', t('lt.failed', { name: name })); throw e; });
    }

    /** The same cards as on the start screen (tl.makeTile = the square one, tl.makeRow = the long one with the switch); a long row of a light that dims gets the brightness bar under it. */
    function itemFor(id) {
      var it = ctx.engine.getItem && ctx.engine.getItem(id); if (it) return it;
      var hs = ctx.hass(), st = hs && hs.states && hs.states[id], a = (st && st.attributes) || {}, r = (hs && hs.entities && hs.entities[id]) || {};
      var dev = r.device_id && hs.devices ? hs.devices[r.device_id] : null, areaId = r.area_id || (dev && dev.area_id) || null;
      return { id: id, domain: id.split('.')[0], deviceClass: a.device_class || null, name: a.friendly_name || r.name || id, areaId: areaId, area: areaId && hs.areas && hs.areas[areaId] ? hs.areas[areaId].name : null, labels: r.labels || [], state: st && st.state, unit: null, icon: a.icon || r.icon || null, category: r.entity_category || null };
    }
    var LAMP = '<div class="lt-art"><div class="lt-halo cone"></div><div class="lt-beam cone"></div><svg viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="ltg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgb(var(--lc,255,232,184))" stop-opacity=".72"/><stop offset=".5" stop-color="rgb(var(--lc,255,232,184))" stop-opacity=".5"/><stop offset=".85" stop-color="rgb(var(--lc,255,232,184))" stop-opacity=".12"/><stop offset=".97" stop-color="rgb(var(--lc,255,232,184))" stop-opacity="0"/><stop offset="1" stop-color="rgb(var(--lc,255,232,184))" stop-opacity="0"/></linearGradient><linearGradient id="ltb" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#8f8f95"/><stop offset=".5" stop-color="#a4a4aa"/><stop offset="1" stop-color="#8f8f95"/></linearGradient><linearGradient id="ltl" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#d9d5cc"/><stop offset=".5" stop-color="#f4f1ea"/><stop offset="1" stop-color="#d9d5cc"/></linearGradient><linearGradient id="ltm" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000"/><stop offset=".14" stop-color="#fff"/><stop offset=".86" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient><mask id="ltmk" maskUnits="userSpaceOnUse" x="0" y="72" width="100" height="100"><rect x="0" y="72" width="100" height="100" fill="url(#ltm)"/></mask><radialGradient id="lth"><stop offset="0" stop-color="rgb(var(--lc,255,232,184))" stop-opacity=".2"/><stop offset=".6" stop-color="rgb(var(--lc,255,232,184))" stop-opacity=".07"/><stop offset="1" stop-color="rgb(var(--lc,255,232,184))" stop-opacity="0"/></radialGradient></defs><ellipse class="disc" cx="50" cy="77" rx="34" ry="4"/><line class="cord" x1="50" y1="0" x2="50" y2="28"/><rect class="collar" x="46.9" y="26.5" width="6.2" height="6" rx="1.2"/><polygon class="shade" points="41.5,32 58.5,32 92,77 8,77"/><line class="rim" x1="8" y1="77" x2="92" y2="77"/></svg></div>';
    function cur0IsFav() { var c = current(); return !!c && c.id === 'fav'; }
    function makeCard(id) {
      var item = itemFor(id), tile = view !== 'rows', el = tile ? tl.makeTile(item) : tl.makeRow(item), bar = null, a0 = ((states()[id] || {}).attributes) || {}, dim = dimmable(a0), lamp = null, sw = null, shownPct = 0, hold = 0, dragging = false;
      function setPct(v, commit) {
        v = Math.max(0, Math.min(100, Math.round(v)));
        if (commit) { if (v <= 0) call('turn_off', { entity_id: id }, item.name).catch(function () {}); else call('turn_on', { entity_id: id, brightness_pct: v }, item.name).catch(function () {}); ctx.engine.recordUse && ctx.engine.recordUse(id); }
        else if (v > 0) call('turn_on', { entity_id: id, brightness_pct: v }, item.name).catch(function () {});
      }
      if (!tile && dim) {
        bar = makeBar({ label: t('lt.bright'), onInput: function (v) { setPct(v, false); }, onCommit: function (v) { setPct(v, true); } });
        el.appendChild(h('div.lt-slw', null, bar.el));
      }
      if (tile) {
        el.classList.add('lt-tile'); el._ic.btn.style.display = 'none';
        lamp = h('div.lt-lamp', { html: LAMP, title: dim ? t('lt.drag') : '' });
        el.insertBefore(lamp, el.firstChild);
        sw = h('button.sw.lt-sw', { type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': item.name }, h('i'));
        sw.addEventListener('click', function (e) { e.stopPropagation(); var on = !sw.classList.contains('on'); sw.classList.toggle('on', on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); if (ctx.haptic) ctx.haptic(10); call(on ? 'turn_on' : 'turn_off', { entity_id: id }, item.name).catch(function () {}); });
        sw.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
        el.appendChild(sw);
        if (dim) {   // the lamp is the hidden dimmer: drag it up and down, the light cone grows and fades with it
          var drag = null, moved = false, send = CT.throttle(function (v) { setPct(v, false); }, 160);
          lamp.addEventListener('pointerdown', function (e) {
            if (el.parentNode && el.parentNode.classList.contains('editing')) return; drag = { y: e.clientY, v: shownPct || 0, h: Math.max(80, lamp.getBoundingClientRect().height * 1.6) }; moved = false;
            try { lamp.setPointerCapture(e.pointerId); } catch (_) {}
          });
          lamp.addEventListener('pointermove', function (e) {
            if (!drag) return; var dy = drag.y - e.clientY; if (!moved && Math.abs(dy) < 6) return; moved = true; el.classList.add('dragging');
            var v = Math.max(1, Math.min(100, Math.round(drag.v + dy / drag.h * 100))); dragging = true; shownPct = v; paintLamp(v, true); el._state.textContent = t('lt.bright_pct', { n: v }); send(v);
          });
          function end(e) { if (!drag) return; var was = moved; drag = null; dragging = false; send.cancel(); if (was) hold = Date.now() + 1500; el.classList.remove('dragging'); if (was) { setPct(shownPct, true); e.preventDefault(); } }
          lamp.addEventListener('pointerup', end); lamp.addEventListener('pointercancel', end);
          lamp.addEventListener('click', function (e) { if (moved) { e.stopPropagation(); moved = false; } });
        }
      }
      function paintLamp(v, on) {
        var op = on ? String(Math.max(0.2, v / 100)) : '0'; lamp.querySelectorAll('.cone').forEach(function (c) { c.style.opacity = op; });      // as on the watch: the same beam, its strength follows the brightness
      }
      if (cur0IsFav()) el.appendChild(h('button.lt-x', { type: 'button', 'aria-label': t('lt.rm_light'), title: t('lt.rm_light'), html: UI.icon('minus', 14), onclick: function (e) { e.stopPropagation(); var f = favLights(); f.splice(f.indexOf(id), 1); ctx.settings.set({ lightsFav: f }); } }));
      el.dataset.id = id;
      function paint() {
        if (dragging || Date.now() < hold) { el.classList.toggle('lit', true); return; }   // do not fight the finger while HA is still catching up
        tl.paint(el, item); el.classList.remove('active');   // glass like the dashboard cards, not the white tile
        var st = states()[id], a = (st && st.attributes) || {}, c = rgbOf(a), on = !!st && st.state === 'on', gone = !st || st.state === 'unavailable';
        el.style.setProperty('--lc', c.r + ',' + c.g + ',' + c.b);
        shownPct = on ? pctOf(st) : 0;
        if (bar) { bar.set(shownPct); bar.el.classList.toggle('dis', gone); }
        el.classList.toggle('lit', on);
        if (tile) {
          el.classList.toggle('lit', on); paintLamp(shownPct, on);
          sw.classList.toggle('on', on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.disabled = gone;
          if (on && dim) el._state.textContent = t('lt.bright_pct', { n: shownPct });
        }
      }
      return { el: el, paint: paint };
    }

    function drawStrip() {
      strip.innerHTML = '';
      var pills = h('div.lt-pills', { role: 'tablist' }), cur = current();
      tabsNow.forEach(function (tb) {
        var cnt = h('span.cnt', null, String(tb.ids.length));
        pills.appendChild(h('button.lt-pill' + (cur && cur.id === tb.id ? '.on' : ''), { type: 'button', role: 'tab', 'aria-selected': cur && cur.id === tb.id ? 'true' : 'false', dataset: { tab: tb.id }, onclick: function () { tabId = tb.id; ctx.store.set('lights.tab', tabId); drawStrip(); drawCards(); } }, h('span', null, tb.name), cnt));
      });
      var toggle = h('div.lt-view', null,
        h('button' + (view === 'tiles' ? '.on' : ''), { type: 'button', 'aria-label': t('lt.tiles'), title: t('lt.tiles'), 'aria-pressed': view === 'tiles' ? 'true' : 'false', html: UI.icon('grid', 18), onclick: function () { setView('tiles'); } }),
        h('button' + (view === 'rows' ? '.on' : ''), { type: 'button', 'aria-label': t('lt.rows'), title: t('lt.rows'), 'aria-pressed': view === 'rows' ? 'true' : 'false', html: UI.icon('list', 18), onclick: function () { setView('rows'); } }));
      var RMx = g.OkieMotor.rooms;
      if (RMx && RMx.openNewRoom) strip.appendChild(h('button.lt-plus', { type: 'button', 'aria-label': t('lt.new_room'), title: t('lt.new_room'), html: UI.icon('plus', 20), onclick: function () { RMx.openNewRoom(ctx, function () { drawStrip(); drawCards(); }); } }));
      strip.appendChild(pills); strip.appendChild(toggle);
      function fade() { var l = pills.scrollLeft > 2, r = pills.scrollLeft + pills.clientWidth < pills.scrollWidth - 2; pills.classList.toggle('fl', l); pills.classList.toggle('fr', r); }
      pills.addEventListener('scroll', fade, { passive: true }); requestAnimationFrame(fade); setTimeout(fade, 300);
      var on = pills.querySelector('.lt-pill.on');
      if (on) requestAnimationFrame(function () {   // bring the chosen tab into view only if it hangs out of the strip
        var pr = pills.getBoundingClientRect(), r = on.getBoundingClientRect();
        if (r.right > pr.right - 20 || r.left < pr.left) pills.scrollLeft += r.left - pr.left - 12;
        fade();
      });
    }
    function setView(v) { if (v === view) return; view = v; ctx.store.set('lights.view', v); drawStrip(); drawCards(); }

    /** The Add button: lights into Favorites, or into the room you are looking at. */
    function openAdd() {
      var RMx = g.OkieMotor.rooms, cur = current(); if (!RMx || !cur) return;
      if (cur.id.indexOf('room:') === 0 && RMx.openRoomPicker) RMx.openRoomPicker(ctx, cur.id.slice(5), function () { drawStrip(); drawCards(); });
      else openFavPicker();
    }
    /** Take a room out of the Lights tabs: a room you made is deleted, one that came from Home Assistant is only hidden (the + sheet brings it back). Two taps, so a slip does not remove it. */
    function rmButton(cur) {
      var armed = false, timer = 0, b = h('button.lt-rm', { type: 'button', 'aria-label': t('lt.rm_room'), title: t('lt.rm_room'), html: UI.icon('trash', 18) });
      b.addEventListener('click', function () {
        if (!armed) { armed = true; b.classList.add('arm'); b.innerHTML = ''; b.appendChild(h('span', null, t('lt.rm_sure'))); clearTimeout(timer); timer = setTimeout(function () { armed = false; b.classList.remove('arm'); b.innerHTML = UI.icon('trash', 18); }, 3000); return; }
        clearTimeout(timer);
        var rid = cur.id.slice(5), st = ctx.settings.get(), r = RM && RM.rooms ? RM.rooms(ctx).filter(function (x) { return x.id === rid; })[0] : null;
        if (r && r.extra) ctx.settings.set({ roomsExtra: (st.roomsExtra || []).filter(function (x) { return String((x && x.name) || '').toLowerCase() !== String(r.name).toLowerCase() && (x && x.id) !== rid; }) });
        else ctx.settings.set({ roomsHidden: (st.roomsHidden || []).concat([rid]) });
        tabId = 'fav'; ctx.store.set('lights.tab', tabId); if (ctx.haptic) ctx.haptic(10);
        tabsNow = tabs(); drawStrip(); drawCards();
      });
      return b;
    }
    function drawCards() {
      var body = shell.body, keep = body.scrollTop; body.innerHTML = ''; cards = {};
      var cur = current();
      wrap = h('div.lt-wrap.' + view + (view === 'rows' ? '.device-list-container' : ''));
      var on = cur ? onCount(cur.ids) : 0, head = h('div.lt-head', null, h('div.lt-ht', null, t(on === 0 ? 'lt.active0' : on === 1 ? 'lt.active1' : 'lt.active', { n: on })),
        cur && cur.id.indexOf('room:') === 0 ? rmButton(cur) : null,
        cur && cur.id !== 'all' ? h('button.lt-add', { type: 'button', onclick: openAdd }, h('span', null, t('lt.add')), h('i', { html: UI.icon('plus', 16) })) : null);
      wrap.appendChild(head);
      if (!cur) { wrap.appendChild(h('div.lt-empty', null, t('lt.nofav'))); body.appendChild(wrap); shell.refreshScroll(); return; }
      wrap.classList.toggle('editing', editing);
      wrap.addEventListener('click', function (e) { if (editing && !(e.target.closest && e.target.closest('.lt-x,.lt-addbox,.lt-rm'))) { e.stopPropagation(); e.preventDefault(); } }, true);
      cur.ids.forEach(function (id) { var c = makeCard(id); cards[id] = c; wrap.appendChild(c.el); });
      if (cur.id !== 'all') wrap.appendChild(h('button.lt-addbox', { type: 'button', onclick: openAdd }, h('i', { html: UI.icon('plus', 18) }), h('span', null, t('lt.add'))));
      if (!cur.ids.length) wrap.appendChild(h('div.lt-empty', null, t(cur.id === 'fav' ? 'lt.nofav' : 'lt.none'), h('div.lt-hint', null, t('lt.hold'))));
      body.appendChild(wrap); paintAll(); body.scrollTop = keep; shell.refreshScroll();
    }
    function paintAll() {
      Object.keys(cards).forEach(function (id) { cards[id].paint(); });
      var ht = wrap && wrap.querySelector('.lt-ht'), cur0 = current();
      if (ht && cur0) { var n0 = onCount(cur0.ids); ht.textContent = t(n0 === 0 ? 'lt.active0' : n0 === 1 ? 'lt.active1' : 'lt.active', { n: n0 }); }
      var cur = current(), all = lightIds(), n = all.length, on = onCount(all);
      shell.setSubtitle(n === 1 ? t('lt.sub1', { on: on }) : t('lt.sub', { on: on, n: n }));
    }
    function allSwitch() {
      var cur = current(); if (!cur) return;
      var any = onCount(cur.ids) > 0;
      ['light', 'switch'].forEach(function (d) { var ids = cur.ids.filter(function (x) { return x.indexOf(d + '.') === 0; }); if (ids.length) ctx.call(d, any ? 'turn_off' : 'turn_on', { entity_id: ids }).catch(function () { ctx.toast('error', t('lt.failed', { name: cur.name })); }); });
      if (ctx.haptic) ctx.haptic(10);
    }

    function saveOrder(next) {
      var cur = current(); if (!cur) return;
      if (cur.id === 'fav') ctx.settings.set({ lightsFav: next.slice() });
      else { var o = Object.assign({}, ctx.settings.get().lightsOrder || {}); o[cur.id] = next.slice(); ctx.settings.set({ lightsOrder: o }); }
      if (ctx.haptic) ctx.haptic(8);
    }
    function nodesNow() { var n = {}; Object.keys(cards).forEach(function (k) { n[k] = cards[k].el; }); return n; }
    function setEditing(on) {
      if (on === editing) return; editing = on;
      if (wrap) wrap.classList.toggle('editing', on);
      if (on) {
        var s0 = ctx.settings.get(); snap = { fav: s0.lightsFav ? s0.lightsFav.slice() : null, order: JSON.parse(JSON.stringify(s0.lightsOrder || {})) };
        if (AR && !barEl) { barEl = AR.editBar(ctx, { onDone: function () { setEditing(false); }, onReset: function () { if (snap) ctx.settings.set({ lightsFav: snap.fav, lightsOrder: snap.order }); } }); ctx.stage.appendChild(barEl); }
      }
      if (barEl) barEl.classList.toggle('on', on);
    }
    tabsNow = tabs();
    shell = AS.create(container, ctx, {
      id: 'lights', title: t('app.lights'), subtitle: '', icon: 'bulb', gradient: ['#3b2a10', '#c98a1c'], header: strip, slim: true,
      actions: [
        { icon: 'heart', label: t('lt.pin'), onClick: function () { var on = ctx.favorites.toggle('gadget.lights'); paintHeart(on); } },
        { icon: 'power', label: t('lt.all_off'), onClick: allSwitch }],
    });
    heart = shell.el.querySelector('.dt-acts .dt-circ.act');      // the first action; the pencil before it is not the heart
    function paintHeart(on) { if (!heart) return; if (on == null) on = ctx.favorites.has('gadget.lights'); heart.classList.toggle('on', !!on); heart.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    paintHeart();
    if (AR) holder = AR.hold(ctx, shell.body, { current: function () { var c = current(); return c ? { order: c.ids.slice(), nodes: nodesNow(), save: saveOrder } : null; }, layout: function () { return 'grid'; }, editing: function () { return editing; }, enter: function () { setEditing(true); } });
    sig = JSON.stringify(tabsNow.map(function (x) { return [x.id, x.ids]; }));
    drawStrip(); drawCards();

    function refresh() {
      if (disposed) return;
      var next = tabs(), s2 = JSON.stringify(next.map(function (x) { return [x.id, x.ids]; }));
      if (s2 !== sig) { sig = s2; tabsNow = next; drawStrip(); drawCards(); return; }
      paintAll(); paintHeart();
    }
    var offSet = ctx.settings.on ? ctx.settings.on('change', function (p) { if (p && (p.lightsFav !== undefined || p.lightsOrder !== undefined || p.roomsExtra !== undefined || p.roomsHidden !== undefined || p.favorites !== undefined)) refresh(); }) : null;
    return {
      update: function () {
        if (disposed) return;
        var next = tabs(), s2 = JSON.stringify(next.map(function (x) { return [x.id, x.ids]; }));
        if (s2 !== sig) { sig = s2; tabsNow = next; drawStrip(); drawCards(); return; }
        paintAll(); paintHeart();
      },
      dispose: function () { disposed = true; if (offSet) offSet(); if (holder) holder.dispose(); if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl); shell.dispose(); },
    };
  }

  g.OkieMotor.apps.register({ id: 'lights', nameKey: 'app.lights', name: 'Lights', icon: 'bulb', color: '#f5a30b', order: 20, category: 'lights', render: render });
  g.OkieMotor.lights = api;

  var CSS = [
    '.lt-strip{display:flex;align-items:center;gap:10px;padding:16px 14px 6px;min-width:0;}.lt-pills{flex:1;min-width:0;display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;}.lt-pills::-webkit-scrollbar{display:none;}',
    '.lt-pills.fr{-webkit-mask-image:linear-gradient(to right,#000 calc(100% - 34px),transparent);mask-image:linear-gradient(to right,#000 calc(100% - 34px),transparent);}.lt-pills.fl{-webkit-mask-image:linear-gradient(to right,transparent,#000 34px);mask-image:linear-gradient(to right,transparent,#000 34px);}.lt-pills.fl.fr{-webkit-mask-image:linear-gradient(to right,transparent,#000 34px,#000 calc(100% - 34px),transparent);mask-image:linear-gradient(to right,transparent,#000 34px,#000 calc(100% - 34px),transparent);}.lt-rm{margin-left:auto;margin-right:8px;height:36px;min-width:36px;padding:0 10px;border-radius:9999px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:var(--okie-text,#fff);font:inherit;font-size:13px;font-weight:600;display:inline-grid;place-items:center;cursor:pointer;}.lt-rm.arm{background:#ff453a;border-color:#ff453a;color:#fff;}',
    '.lt-pill{flex:none;display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:9999px;border:1px solid var(--glass-border-color,rgba(255,255,255,.14));background:var(--okie-tile,rgba(255,255,255,.1));color:var(--okie-text,#fff);font:inherit;font-size:15px;font-weight:600;white-space:nowrap;cursor:pointer;-webkit-tap-highlight-color:transparent;}',
    '.lt-pill .cnt{min-width:24px;height:24px;padding:0 7px;border-radius:12px;display:inline-grid;place-items:center;font-size:12px;background:rgba(255,255,255,.14);}.lt-pill.on{background:#fff;color:#1b1b1d;border-color:#fff;}.lt-pill.on .cnt{background:rgba(0,0,0,.12);}',
    '.lt-view{flex:none;display:inline-flex;padding:3px;border-radius:12px;background:rgba(255,255,255,.12);}.lt-view button{width:40px;height:36px;border-radius:9px;display:grid;place-items:center;color:var(--okie-text,#fff);opacity:.75;}.lt-view button.on{background:#fff;color:#1b1b1d;opacity:1;box-shadow:0 1px 4px rgba(0,0,0,.25);}',
    '.lt-wrap{box-sizing:border-box;min-height:100%;padding:20px 14px 28px;display:grid;gap:12px;align-content:start;grid-auto-rows:min-content;}.lt-wrap.rows{display:flex;}.lt-wrap.tiles{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));}',
    '.lt-empty{grid-column:1/-1;padding:36px 16px;text-align:center;opacity:.75;font-size:16px;font-weight:600;}.lt-hint{margin-top:6px;font-size:13px;font-weight:400;opacity:.8;}.lt-head{grid-column:1/-1;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:2px 2px 0;}.lt-ht{font-size:21px;font-weight:700;letter-spacing:-.01em;}.lt-add{flex:none;display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border-radius:9999px;background:#fff;color:#1b1b1d;font-size:14px;font-weight:700;}.lt-add i{display:inline-grid;place-items:center;}.lt-plus{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:var(--okie-tile,rgba(255,255,255,.12));border:1px solid var(--glass-border-color,rgba(255,255,255,.14));color:var(--okie-text,#fff);}',
    '.lt-slw{padding:0 2px 2px;}.lt-sl{position:relative;height:' + THUMB + 'px;touch-action:pan-y;cursor:pointer;outline:none;-webkit-tap-highlight-color:transparent;}',
    '.lt-track{position:absolute;left:0;right:0;top:50%;height:8px;margin-top:-4px;border-radius:4px;overflow:hidden;background:linear-gradient(90deg,rgba(255,255,255,.10),rgba(255,255,255,.20));box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);}',
    '.lt-fill{height:100%;border-radius:4px;background:linear-gradient(90deg,rgba(var(--lc),.35),rgb(var(--lc)));}',
    '.lt-thumb{position:absolute;top:0;width:' + THUMB + 'px;height:' + THUMB + 'px;border-radius:50%;background:#fff;box-shadow:0 1px 6px rgba(0,0,0,.4);transition:transform .15s ease;}.lt-sl.drag .lt-thumb{transform:scale(1.08);}.lt-sl.dis{opacity:.4;pointer-events:none;}',
    '.lt-sl:focus-visible .lt-thumb{box-shadow:0 0 0 3px rgba(79,140,255,.7);}',
    // tiles: the icon and switch on top, then the name, then the bar
    '.lt-wrap .device-card,.lt-wrap .device-list-item{background:linear-gradient(145deg,rgba(255,255,255,.20),rgba(255,255,255,.07));-webkit-backdrop-filter:blur(28px) saturate(1.5);backdrop-filter:blur(28px) saturate(1.5);border:1px solid rgba(255,255,255,.22);box-shadow:inset 0 1px 0 rgba(255,255,255,.32),0 8px 24px rgba(0,0,0,.14);}.lt-wrap .device-card.lit,.lt-wrap .device-list-item.lit{background:linear-gradient(145deg,rgba(255,255,255,.30),rgba(255,255,255,.12));}.lt-wrap .device-list-item.lit{}',
    '.lt-tile{position:relative;overflow:hidden;}.lt-lamp{position:absolute;left:10px;right:10px;top:4px;height:70%;touch-action:none;cursor:ns-resize;display:flex;justify-content:center;}.lt-lamp .lt-art{position:relative;height:100%;aspect-ratio:1/1;flex:none;}.lt-lamp .lt-art svg{position:absolute;left:0;top:0;width:100%;height:100%;overflow:visible;}.lt-lamp .cone{position:absolute;pointer-events:none;transition:opacity .45s ease;opacity:0;}.lt-lamp .lt-beam{left:14.5%;width:71%;top:77%;height:66%;background:linear-gradient(to bottom,rgba(var(--lc,255,232,184),.75) 0,rgba(var(--lc,255,232,184),.55) 28%,rgba(var(--lc,255,232,184),.25) 62%,rgba(var(--lc,255,232,184),0) 100%);-webkit-mask-image:linear-gradient(to right,transparent 0,#000 18%,#000 82%,transparent 100%);mask-image:linear-gradient(to right,transparent 0,#000 18%,#000 82%,transparent 100%);}.lt-lamp .lt-halo{left:-22%;width:144%;top:55%;height:95%;background:radial-gradient(ellipse 50% 50% at 50% 35%,rgba(var(--lc,255,232,184),.22) 0,rgba(var(--lc,255,232,184),.07) 55%,rgba(var(--lc,255,232,184),0) 100%);}.lt-tile.dragging .lt-lamp .cone{transition:none;}.lt-lamp .cord{stroke:rgba(255,255,255,.4);stroke-width:1;}.lt-lamp .collar{fill:#6f6f75;transition:fill .3s;}.lt-lamp .shade{fill:url(#ltb);transition:fill .3s;}.lt-tile.lit .lt-lamp .collar{fill:#cfcbc2;}.lt-tile.lit .lt-lamp .shade{fill:url(#ltl);}.lt-lamp .disc{fill:#ffedc7;opacity:.1;transition:opacity .45s;}.lt-lamp .rim{stroke:rgba(255,255,255,.3);stroke-width:.9;stroke-linecap:round;transition:stroke .45s;}.lt-tile.lit .lt-lamp .disc{opacity:1;}.lt-tile.lit .lt-lamp .rim{stroke:rgba(255,255,255,.6);}.lt-tile .device-info{position:relative;margin-top:auto;padding-right:52px;}.lt-tile .lt-sw{position:absolute;right:14px;bottom:14px;}.lt-tile.lit .lt-sw.on{background:#34c759;}',
    '.lt-wrap.rows{display:flex;flex-direction:column;gap:12px;}.lt-wrap.tiles .device-card{min-width:0;}.lt-wrap .lt-slw{margin-top:-2px;}.device-list-item.active .lt-track{background:rgba(0,0,0,.12);box-shadow:none;}.device-list-item.active .lt-thumb{box-shadow:0 0 0 1px rgba(0,0,0,.1),0 2px 8px rgba(0,0,0,.35);}',
    '.lt-addbox{display:none;grid-column:1/-1;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:16px;border-radius:26px;border:1.5px dashed rgba(255,255,255,.5);background:transparent;color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer;}.lt-addbox svg{width:18px;height:18px;}',
    '.lt-wrap.editing .lt-addbox{display:flex;}.lt-wrap.editing .device-card,.lt-wrap.editing .device-list-item{outline:1.5px dashed rgba(255,255,255,.55);outline-offset:-3px;}.lt-wrap.editing .device-card>*:not(.lt-x),.lt-wrap.editing .device-list-item>*:not(.lt-x){pointer-events:none;}.lt-wrap.editing .lt-sw,.lt-wrap.editing .lt-lamp{pointer-events:none;}',
    '.lt-x{display:none;position:absolute;top:8px;right:8px;z-index:5;width:24px;height:24px;padding:0;border-radius:50%;border:1.5px solid rgba(255,255,255,.92);place-items:center;background:#e0393e;color:#fff;cursor:pointer;}.lt-wrap.editing .lt-x{display:grid;}.lt-x svg{width:14px;height:14px;}.lt-wrap .device-list-item .lt-x{top:-6px;right:-6px;}.lt-wrap.rows .device-list-item{position:relative;overflow:visible;}',
    '@media (max-width:640px){.lt-strip{padding:14px 12px 4px;}.lt-wrap{padding:18px 12px 30px;}.lt-wrap.tiles{grid-template-columns:repeat(2,minmax(0,1fr));}}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
})(typeof globalThis !== 'undefined' ? globalThis : window);

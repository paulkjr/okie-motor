/* okie-gadgets: one card (and one view with tabs) for a gadget that Home Assistant lists as dozens of entities, the Kindle Fire and the AWTRIX display.
 *
 * In the search, the lists and the rooms the gadget is ONE tile; a tap opens a view with a bar of tabs (Screen, Rotation, Power, Info ...) that holds every one of its entities
 * as a control: a switch, a slider, a choice, a button, a text field with its Send button, the picture of its screen. The entities themselves are left out of the search.
 * The pure part (which entities belong to a gadget, the collection with the one tile) is unit-tested.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  var GADGETS = [
    {
      id: 'kindle', name: 'Kindle Fire', icon: 'tv', picture: 'image.screen_preview', status: 'sensor.showing_on_the_kindle', match: /(^|[._])kindle_fire_/, prefix: /^kindle_fire_/, area: 'switch.kindle_fire_screen', gradient: ['#1f2a33', '#3d6b85'],
      tabs: [
        { id: 'screen', icon: 'tv', label: 'Screen', rows: [['image', 'image.screen_preview'], ['value', 'sensor.showing_on_the_kindle'], ['buttons', ['button.previous_screen', 'button.update_screen_preview']], ['choice', 'select.full_screen_card'], ['switch', 'switch.screen'], ['switch', 'switch.cycle_screens'],
          ['text', 'text.screen_message', 'Show'], ['text', 'text.say', 'Say'], ['slider', 'number.brightness'], ['slider', 'number.volume'], ['slider', 'number.say_speed'], ['buttons', ['button.refresh_cards', 'button.play_chime', 'button.stop_sound']]] },
        { id: 'rotation', icon: 'refresh', label: 'Rotation', rows: [['title', 'Rotate through'], ['switch', 'switch.rotate_dashboard'], ['switch', 'switch.rotate_slideshow'], ['switch', 'switch.rotate_weather'], ['switch', 'switch.rotate_quote'], ['switch', 'switch.rotate_camera'], ['slider', 'number.rotate_every'], ['slider', 'number.weather_forecast_days'],
          ['title', 'Slideshow'], ['value', 'sensor.slideshow_photos'], ['slider', 'number.slideshow_seconds_per_photo'], ['choice', 'select.slideshow_effect'], ['choice', 'select.slideshow_fit'], ['switch', 'switch.slideshow_shuffle'], ['buttons', ['button.slideshow_previous_photo', 'button.slideshow_next_photo']],
          ['title', 'Patio cam'], ['switch', 'switch.patio_cam_on_motion'], ['slider', 'number.patio_cam_on_motion_seconds'], ['switch', 'switch.record_patio_clips'], ['slider', 'number.patio_clip_length'], ['buttons', ['button.show_patio_cam_now', 'button.record_patio_clip_now']]] },
        { id: 'photos', icon: 'image', label: 'Photos', rows: [['photos', 'text.photos_sign_in']] },
        { id: 'power', icon: 'battery', label: 'Power', rows: [['value', 'sensor.battery'], ['value', 'sensor.charge_mode'], ['value', 'sensor.battery_temperature'], ['value', 'sensor.battery_voltage'], ['switch', 'switch.battery_care'], ['slider', 'number.start_charging_at'], ['slider', 'number.stop_charging_at'], ['switch', 'switch.drain_while_plugged_in'], ['buttons', ['button.restart']]] },
        { id: 'info', icon: 'info', label: 'Info', rows: [['value', 'sensor.dashboard_status'], ['value', 'sensor.orientation'], ['value', 'sensor.wi_fi_signal'], ['value', 'sensor.uptime'], ['value', 'sensor.board_temperature'], ['value', 'sensor.tilt_x'], ['value', 'sensor.tilt_y'], ['value', 'sensor.tilt_z']] },
      ],
    },
    {
      id: 'awtrix', name: 'AWTRIX', icon: 'light', picture: 'image.live_view', status: 'sensor.current_app', match: /(^|[._])awtrix(_|$)|awtrix/, prefix: /^(awtrix_[0-9a-f]{6}_|awtrix_)/, area: 'light.awtrix_2c2c5c_matrix', gradient: ['#1f1f33', '#5b4aa8'],
      tabs: [
        { id: 'display', icon: 'grid', label: 'Display', rows: [['image', 'image.live_view'], ['value', 'sensor.current_app'], ['switch', 'light.matrix'], ['text', 'input_text.message', 'Send', 'script.send_awtrix_message'], ['choice', 'input_select.color'], ['choice', 'input_select.icon']] },
        { id: 'settings', icon: 'sliders', label: 'Settings', rows: [['choice', 'select.brightness_mode'], ['choice', 'select.transition_effect'], ['switch', 'switch.transition'], ['title', 'Indicators'], ['switch', 'light.indicator_1'], ['switch', 'light.indicator_2'], ['switch', 'light.indicator_3']] },
        { id: 'info', icon: 'info', label: 'Info', rows: [['value', 'sensor.battery'], ['value', 'sensor.temperature'], ['value', 'sensor.humidity'], ['value', 'sensor.illuminance'], ['value', 'sensor.wifi_strength'], ['value', 'sensor.uptime'], ['value', 'sensor.version'], ['value', 'sensor.ip_address'], ['value', 'sensor.free_ram']] },
      ],
    },
  ];

  /** The entity ids of a gadget in `states`. */
  function membersOf(def, states) { return Object.keys(states || {}).filter(function (id) { return def.match.test(id); }); }
  /** The entity of a row spec ('switch.screen') among the members: its id without the gadget's prefix is the spec's name. Absolute ids ('script.send_awtrix_message') are taken as they are. */
  function find(def, spec, states) {
    var dom = spec.split('.')[0], tail = spec.slice(dom.length + 1), hit = null;
    if (states && states[spec]) return spec;
    membersOf(def, states).forEach(function (id) { if (!hit && id.split('.')[0] === dom && id.slice(dom.length + 1).replace(def.prefix, '') === tail) hit = id; });
    return hit;
  }
  /** The collection with each gadget's entities folded into ONE item: { id: 'gadget.kindle', domain: 'gadget', deviceClass: <picture kind>, name, area, state }. */
  function apply(items, states, areas) {
    var out = items, extra = [];
    GADGETS.forEach(function (def) {
      var mem = membersOf(def, states); if (!mem.length) return;
      var set = {}; mem.forEach(function (id) { set[id] = true; });
      out = out.filter(function (i) { return !set[i.id]; });
      var ref = find(def, def.area, states), areaId = null;
      items.forEach(function (i) { if (i.id === ref) areaId = i.areaId; });
      if (!areaId) items.forEach(function (i) { if (!areaId && set[i.id] && i.areaId) areaId = i.areaId; });
      extra.push({ id: 'gadget.' + def.id, domain: 'gadget', deviceClass: def.icon, name: def.name, areaId: areaId, area: areaId && areas && areas[areaId] ? areas[areaId].name : null, labels: [], state: '', unit: null, icon: null, category: null });
    });
    return out.concat(extra);
  }
  function labelOf(def, id, states) {
    var s = states && states[id], n = (s && s.attributes && s.attributes.friendly_name) || id;
    n = String(n).replace(/^(kindle fire|awtrix_[0-9a-f]{6}|awtrix)\s+/i, '');
    return n.charAt(0).toUpperCase() + n.slice(1);
  }

  /** Is this entity part of a gadget (and so shown only inside its view)? */
  function owns(id) { return GADGETS.some(function (d) { return d.match.test(id); }); }

  var api = { GADGETS: GADGETS, owns: owns, membersOf: membersOf, find: find, apply: apply, labelOf: labelOf };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor.gadgets = api;

  // ------------------------------------------------------------ DOM ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;
  core.registerStrings('en', { 'gd.send': 'Send', 'gd.empty': 'Nothing of this is set up here.', 'gd.on': 'On', 'gd.off': 'Off', 'gd.map': 'Home map', 'gd.map_none': 'The floor plan card of the Overview dashboard is not loaded here.', 'gd.photos_https': 'The photo manager opens when Home Assistant is used through its https address (it lives on the same server, port 8765).' });
  core.registerStrings('de', { 'gd.send': 'Senden', 'gd.empty': 'Hier ist davon nichts eingerichtet.', 'gd.on': 'An', 'gd.off': 'Aus', 'gd.map': 'Hausplan', 'gd.map_none': 'Die Grundriss-Karte des Overview-Dashboards ist hier nicht geladen.', 'gd.photos_https': 'Die Fotoverwaltung öffnet sich, wenn Home Assistant über seine https-Adresse genutzt wird (sie liegt auf demselben Server, Port 8765).' });

  function unitOf(s) { var u = s && s.attributes && s.attributes.unit_of_measurement; return u ? ' ' + u : ''; }
  function valueText(s) {
    if (!s) return '—';
    var d = s.attributes && s.attributes.device_class, v = s.state;
    if (v === 'unavailable' || v === 'unknown') return v;
    if (d === 'duration' && !isNaN(+v)) { var sec = +v; return Math.floor(sec / 86400) + ' d ' + Math.floor(sec % 86400 / 3600) + ' h'; }
    if (d === 'timestamp') return v;
    var n = parseFloat(v); if (!isNaN(n) && String(n) === String(v).trim() || (!isNaN(n) && /^-?\d+(\.\d+)?$/.test(v))) return (Math.round(n * 100) / 100) + unitOf(s);
    return String(v).charAt(0).toUpperCase() + String(v).slice(1) + unitOf(s);
  }

  function renderGadget(def, container, ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, painters = [], shell = null, heart = null, onMsg = null, offZoom = null;
    shell = g.OkieMotor.appshell.create(container, ctx, {
      actions: [{ icon: 'heart', label: core.t('dt.fav_add', ctx.lang()), onClick: function () { var on = ctx.favorites.toggle('gadget.' + def.id); if (heart) { heart.classList.toggle('on', on); heart.setAttribute('aria-pressed', on ? 'true' : 'false'); } } }],
      id: 'gadget-' + def.id, title: def.name, subtitle: '', icon: def.icon === 'light' ? 'grid' : def.icon, gradient: def.gradient,
      tabs: def.tabs.map(function (tb) { return { id: tb.id, icon: tb.icon, label: tb.label }; }), startTab: ctx.store.get('gadget.' + def.id + '.tab', def.tabs[0].id),
      onTab: function (id, body) { painters = []; if (onMsg) { g.removeEventListener('message', onMsg); onMsg = null; } if (offZoom) { offZoom(); offZoom = null; } if (id) ctx.store.set('gadget.' + def.id + '.tab', id); drawTab(def.tabs.filter(function (x) { return x.id === id; })[0] || def.tabs[0], body); },
    });
    heart = shell.el.querySelector('.dt-acts .dt-circ.act'); if (heart) { var fav = ctx.favorites.has('gadget.' + def.id); heart.classList.toggle('on', fav); heart.setAttribute('aria-pressed', fav ? 'true' : 'false'); }
    function st(id) { return ctx.hass().states[id]; }
    function call(domain, service, data) { return Promise.resolve(ctx.call(domain, service, data)).catch(function () { ctx.toast('error', 'That did not work'); }); }
    function rowFor(spec) {
      var kind = spec[0], states = ctx.hass().states;
      if (kind === 'title') return h('div.lbl.gd-title', null, spec[1]);
      if (kind === 'photos') return photosRow(find(def, spec[1], states));
      if (kind === 'buttons') {
        var ids = spec[1].map(function (s) { return find(def, s, states); }).filter(Boolean); if (!ids.length) return null;
        var row = h('div.vs-actions.gd-buttons');
        ids.forEach(function (id) { row.appendChild(h('button.act', { type: 'button', dataset: { entity: id }, onclick: function () { if (ctx.haptic) ctx.haptic(10); call(id.split('.')[0], 'press', { entity_id: id }); } }, labelOf(def, id, states))); });
        return row;
      }
      var id = find(def, spec[1], states); if (!id) return null;
      var dom = id.split('.')[0], name = labelOf(def, id, states);
      if (kind === 'image') {
        var img = h('img.gd-img' + (def.id === 'awtrix' ? '.pixel' : ''), { alt: name }), box = h('div.gd-shot', { dataset: { entity: id } }, img);
        painters.push(function () { var s = st(id), u = s && s.attributes && s.attributes.entity_picture; if (u) { var src = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(s.state); if (img.getAttribute('src') !== src) img.src = src; } });
        return box;
      }
      if (kind === 'value') {
        var val = h('span.v'); painters.push(function () { val.textContent = valueText(st(id)); });
        return h('div.eh-kvr.gd-val', { dataset: { entity: id } }, h('span.k', null, name), val);
      }
      if (kind === 'switch') {
        var sw = h('button.sw', { type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': name });
        sw.onclick = function () { var on = !sw.classList.contains('on'); sw.classList.toggle('on', on); if (ctx.haptic) ctx.haptic(10); call(dom, on ? 'turn_on' : 'turn_off', { entity_id: id }); };
        painters.push(function () { var s = st(id), on = !!s && s.state === 'on'; sw.classList.toggle('on', on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); sw.disabled = !s || s.state === 'unavailable'; });
        return h('div.lss-opt.gd-sw', { dataset: { entity: id } }, h('div.lss-optt', null, h('b', null, name)), sw);
      }
      if (kind === 'slider') {
        var s0 = st(id) || { attributes: {} }, a = s0.attributes, min = a.min != null ? +a.min : 0, max = a.max != null ? +a.max : 100, step = a.step != null ? +a.step : (max - min <= 20 ? 0.05 : 1);
        if (dom === 'number' && max - min > 20) step = 1;
        var rng = h('input.eh-range', { type: 'range', min: String(min), max: String(max), step: String(step), 'aria-label': name }), out = h('span.gd-out'), drag = false;
        rng.oninput = function () { drag = true; out.textContent = rng.value + unitOf(st(id)); };
        rng.onchange = function () { drag = false; call(dom, 'set_value', { entity_id: id, value: +rng.value }); };
        painters.push(function () { var s = st(id); if (!s) return; if (!drag) { rng.value = String(parseFloat(s.state)); out.textContent = (Math.round(parseFloat(s.state) * 100) / 100) + unitOf(s); } rng.disabled = s.state === 'unavailable'; });
        return h('div.gd-slider', { dataset: { entity: id } }, h('div.gd-sl', null, h('span', null, name), out), rng);
      }
      if (kind === 'choice') {
        var opts = (st(id) && st(id).attributes.options) || [], cur = h('div.chiprow.gd-choice', { dataset: { entity: id } });
        var wrap = h('div.gd-ch', null, h('div.lbl', null, name), cur);
        if (opts.length > 8) {
          var sel = h('select.src-sel', { 'aria-label': name }); opts.forEach(function (o) { sel.appendChild(h('option', { value: o }, o)); });
          sel.onchange = function () { call(dom, 'select_option', { entity_id: id, option: sel.value }); };
          cur.appendChild(h('div.src-selw', null, sel, h('span.src-chev', { html: UI.icon('chevdown', 16) })));
          painters.push(function () { var s = st(id); if (s && sel.value !== s.state) sel.value = s.state; });
        } else {
          var chips = opts.map(function (o) { var b = h('button.cp', { type: 'button', dataset: { opt: o }, 'aria-pressed': 'false', onclick: function () { call(dom, 'select_option', { entity_id: id, option: o }); } }, o); cur.appendChild(b); return b; });
          painters.push(function () { var s = st(id); chips.forEach(function (b) { var on = !!s && s.state === b.dataset.opt; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); }); });
        }
        return wrap;
      }
      if (kind === 'text') {
        var label = spec[2] || t('gd.send'), also = spec[3], input = h('input.ts-name.gd-input', { type: 'text', placeholder: name, 'aria-label': name }), go = h('button.act.primary', { type: 'button' }, label);
        var send = function () { var v = input.value.trim(); if (!v) return; call(dom, 'set_value', { entity_id: id, value: v }).then(function () { if (also) call(also.split('.')[0], 'turn_on', { entity_id: also }); input.value = ''; ctx.toast('success', label); }); };
        go.onclick = send; input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
        return h('div.gd-text', { dataset: { entity: id } }, input, go);
      }
      return null;
    }
    /**
     * The photo manager of the Kindle deck (upload, order, edit each photo), embedded the way the Overview card does it: a one-time code goes into
     * text.kindle_fire_photos_sign_in (only a signed-in Home Assistant user can set it), the deck page on port 8765 trades it for its own session.
     */
    function photosRow(ent) {
      var base = (location.protocol === 'https:' && /^[a-z]/i.test(location.hostname)) ? 'https://' + location.hostname + ':8765' : '';
      if (!base) return h('div.note-l.gd-nophotos', null, t('gd.photos_https'));
      var frame = h('iframe.gd-photos', { title: 'Photos', allow: 'clipboard-write' }), last = 0;
      frame.style.colorScheme = 'normal';      // a different color scheme than the page inside makes the frame opaque: glass needs it see-through
      function open() {
        var s = ent && st(ent);
        if (!s || s.state === 'unavailable') { frame.src = base + '/slideshow'; return; }      // no sign-in on offer: the deck asks for its own access code
        var b = new Uint8Array(24); (g.crypto || g.msCrypto).getRandomValues(b);
        var code = Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
        Promise.resolve(ctx.call('text', 'set_value', { entity_id: ent, value: code })).then(function () { frame.src = base + '/ha-login#c=' + code; }, function () { frame.src = base + '/slideshow'; });
      }
      onMsg = function (ev) {
        var m = ev.data; if (ev.source !== frame.contentWindow || ev.origin !== base || !m || typeof m !== 'object') return;
        if (m.kdeck === 'relogin' && Date.now() - last > 8000) { last = Date.now(); open(); }
        else if (m.kdeck === 'editor') frame.classList.toggle('tall', !!m.open);
        else if (m.kdeck === 'ready') skin();
      };
      function skin() { try { frame.contentWindow.postMessage({ kdeck: 'skin', skin: 'glass' }, base); } catch (e) { /* the page is not up yet: it asks again when it is */ } }
      frame.addEventListener('load', skin);
      g.addEventListener('message', onMsg);
      // the card is scaled as a whole (Content size); a scaled frame keeps drawing its page at full size in a narrower window, which leaves an empty strip.
      // So the frame is scaled back to 1 (its 100% width then is the space it has).
      // and as tall as the room it has, so the last settings can be reached (the page scrolls inside the frame)
      var fit = function (z) { z = +z > 0 ? +z : 1; frame.style.zoom = String(1 / z); frame.style.height = Math.max(320, Math.round(room() * z)) + 'px'; };
      var room = function () { var b = frame.closest ? frame.closest('.dt-body') : null; return b && b.clientHeight ? b.clientHeight - 4 : 560; };
      var refit = function () { fit(parseFloat(getComputedStyle(ctx.stage).getPropertyValue('--okie-zoom')) || 1); }, offBus = null, ro = null;
      refit();
      if (ctx.bus) offBus = ctx.bus.on('resize', function (e) { if (e && e.zoom) fit(e.zoom); });
      // the view's body gets its final height after the frame is built (an app opens taller on a tablet): the frame follows it, so the page inside is never cut short with empty room under it
      requestAnimationFrame(function () { var b = frame.closest && frame.closest('.dt-body'); if (b && typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(refit); ro.observe(b); } refit(); });
      offZoom = function () { if (typeof offBus === 'function') offBus(); if (ro) ro.disconnect(); };
      open();
      return h('div.gd-photosw', null, frame);
    }
    function drawTab(tab, body) {
      body.innerHTML = ''; var wrap = h('div.gd-tab'); var any = false;
      tab.rows.forEach(function (spec) { var r = rowFor(spec); if (r) { wrap.appendChild(r); if (spec[0] !== 'title') any = true; } });
      if (!any) wrap.appendChild(h('div.note-l', null, t('gd.empty')));
      body.appendChild(wrap); paintAll(); if (shell) shell.refreshScroll();
    }
    function paintAll() { painters.forEach(function (p) { try { p(); } catch (e) { /* one row never stops the rest */ } }); }
    return { update: paintAll, dispose: function () { if (onMsg) g.removeEventListener('message', onMsg); if (offZoom) offZoom(); shell.dispose(); } };
  }

  /**
   * The cards under the cameras card of the start screen: the Kindle (the picture of its screen), the AWTRIX (its live matrix) and the home map.
   * Each looks like the cameras card: the picture, a chip that says what it shows, a pill that opens the view. Returns [{ el, update }].
   */
  function buildCards(ctx) {
    var out = [], states = ctx.hass().states;
    function card(key, name, open) {
      var chip = h('div.cc-chip'), pill = h('button.cam-pill', { type: 'button', 'aria-label': name }, h('span.cam-pill-ic', { html: UI.icon('expand', 20) }), h('span', null, name));
      UI.pullPill(pill, open);
      var el = h('section.camcard.gcard', { dataset: { gadget: key }, role: 'group', 'aria-label': name, onclick: open }, h('div.cc-shade'), chip, h('div.cam-cluster', null, pill));
      return { el: el, chip: chip };
    }
    GADGETS.forEach(function (def) {
      if (!membersOf(def, states).length) return;
      var c = card(def.id, def.name, function () { ctx.openDetail('gadget.' + def.id); }), img = h('img.gc-img' + (def.id === 'awtrix' ? '.pixel' : ''), { alt: '' });
      c.el.insertBefore(img, c.el.firstChild);
      var upd = function () {
        var st = ctx.hass().states, pid = find(def, def.picture, st), sid = find(def, def.status, st), p = pid && st[pid], u = p && p.attributes && p.attributes.entity_picture;
        if (u) { var src = u + (u.indexOf('?') >= 0 ? '&' : '?') + 'v=' + encodeURIComponent(p.state); if (img.getAttribute('src') !== src) img.src = src; }
        c.chip.textContent = def.name + (sid && st[sid] ? ' · ' + valueText(st[sid]) : '');
      };
      upd(); out.push({ el: c.el, update: upd });
    });
    if (g.customElements && g.customElements.get('floorplan-card')) {
      var m = card('map', core.t('gd.map', ctx.lang()), function () { ctx.openApp('homemap'); });
      m.el.classList.add('map'); m.el.insertBefore(h('span.gc-art', { html: UI.icon('home', 96) }), m.el.firstChild); m.chip.textContent = core.t('gd.map', ctx.lang());
      out.push({ el: m.el, update: function () {} });
    }
    return out;
  }
  api.buildCards = buildCards;

  // The map card takes the look from its config only while this device has no saved look of its own ("floorplan_skin"). Here it is always Glass, so the saved
  // look is put aside for the moment the config is read, and put back at once: the Overview keeps the look that was chosen for it.
  function savedSkin() { try { return g.localStorage.getItem('floorplan_skin'); } catch (e) { return null; } }
  function withoutSavedSkin(fn) {
    var saved = savedSkin();
    try { if (saved != null) g.localStorage.removeItem('floorplan_skin'); } catch (e) { /* no storage */ }
    try { fn(); } finally { try { if (saved != null) g.localStorage.setItem('floorplan_skin', saved); } catch (e) { /* no storage */ } }
  }

  /**
   * The Okie look for the home map. The floor plan card draws thick walls and, for a screen, stretches the plan to fill it; here the walls are about half as thick, the plan keeps its own shape
   * (centred), the device names are smaller and quieter and the lines to them fainter, so the plan is lighter and the text balanced. All of it is a style sheet added inside the card (its shadow
   * root is open) and one hook on its layout step: the card itself is not changed.
   */
  function styleMap(el) {
    var root = el && el.shadowRoot; if (!root || root.querySelector('#okie-map-look')) return;
    var ink = '#f4f1ea', sel = function (attr) { var o = []; for (var n = 20; n <= 30; n++) o.push('svg.plan rect[fill="' + ink + '"][' + attr + '="' + n + '"]'); return o.join(','); };
    var css = sel('width') + '{transform-box:fill-box;transform-origin:center;transform:scaleX(.46);}' +
      sel('height') + '{transform-box:fill-box;transform-origin:center;transform:scaleY(.46);}' +
      '.nm{font-size:21px!important;font-weight:600!important;letter-spacing:1.1px!important;stroke-width:6px!important;}' +
      '.nm.sb{font-size:16px!important;font-weight:500!important;letter-spacing:.7px!important;opacity:.8;}' +
      '.rm{font-weight:600;opacity:.65;}.ld{opacity:.28!important;}';
    var st = document.createElement('style'); st.id = 'okie-map-look'; st.textContent = css; root.appendChild(st);
    var match = el._match;
    if (typeof match === 'function') el._match = function () { match.call(this); if (this._sy && this._sy !== 1 && this._setGeo) this._setGeo(this._gk || 'land', 1); };      // no stretching to the screen
    try { if (el._match) el._match(); } catch (e) { /* the card lays itself out anyway */ }
  }

  /** The home map: the floor plan card of the Overview dashboard, shown as it is (it is loaded by Home Assistant as a dashboard resource). */
  function renderMap(container, ctx) {
    var shell = g.OkieMotor.appshell.create(container, ctx, { id: 'homemap', title: core.t('gd.map', ctx.lang()), subtitle: '', icon: 'home', gradient: ['#27313a', '#4f6b62'], tabs: [], bare: true, onTab: function () {} }), el = null;
    if (g.customElements && g.customElements.get('floorplan-card')) {
      // the card's own Glass look and, on a phone, its upright drawing that fills the screen (the card picks the side-by-side one on a wide screen)
      var phone = !!(ctx.host && ctx.host._mobile), box = h('div.gd-map');
      shell.body.appendChild(box);
      el = document.createElement('floorplan-card'); withoutSavedSkin(function () { el.setConfig({ bare: true, skin: 'glass', orient: phone ? 'portrait' : 'landscape' }); }); el.hass = ctx.hass();
      box.appendChild(el); styleMap(el);
    } else shell.body.appendChild(h('div.note-l', null, core.t('gd.map_none', ctx.lang())));
    return { update: function () { if (el) el.hass = ctx.hass(); }, dispose: function () {
      if (el) { try { var back = savedSkin() || 'eink'; withoutSavedSkin(function () { document.createElement('floorplan-card').setConfig({ skin: back }); }); } catch (e) { /* the look is shared by every map on the page: hand the Overview its own back */ } }
      shell.dispose();
    } };
  }
  g.OkieMotor.apps.register({ id: 'homemap', nameKey: 'gd.map', name: 'Home map', icon: 'home', color: '#4f6b62', order: 71, category: 'devices', render: renderMap });
  /** A floor plan card in the card's Glass look, for the robot's map to draw on (null when the card is not loaded). */
  api.makeFloorplan = function (ctx, orient) {
    if (!(g.customElements && g.customElements.get('floorplan-card'))) return null;
    var el = document.createElement('floorplan-card'); withoutSavedSkin(function () { el.setConfig({ bare: true, skin: 'glass', orient: orient }); }); el.hass = ctx.hass(); return el;
  };
  api.releaseFloorplan = function () { try { var back = savedSkin() || 'eink'; withoutSavedSkin(function () { document.createElement('floorplan-card').setConfig({ skin: back }); }); } catch (e) { /* the look is shared by every map on the page */ } };

  GADGETS.forEach(function (def) {
    g.OkieMotor.apps.register({ id: 'gadget-' + def.id, name: def.name, icon: def.icon === 'light' ? 'grid' : def.icon, color: def.gradient[1], order: 70, category: 'devices', render: function (container, ctx) { return renderGadget(def, container, ctx); } });
  });
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([[
    '.gd-tab{display:flex;flex-direction:column;gap:12px;}.gd-title{margin-top:10px;}',
    // the cards under the cameras card: stacked on a phone, one row you swipe through (the next card peeks in) on a wide screen
    // (the cameras area is one slider card now; its css is in okie-bento)
    '.gc-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:-2;}.gc-img.pixel{object-fit:contain;image-rendering:pixelated;background:#000;}',
    '.gcard.map{background:linear-gradient(150deg,#27313a,#4f6b62);}.gc-art{position:absolute;right:18px;top:12px;z-index:-2;opacity:.3;}.gd-map{border-radius:18px;overflow:hidden;min-height:320px;}.dt[data-bare] .dt-body{padding:0;overflow:hidden;}.dt[data-bare] .gd-map{position:absolute;inset:0;min-height:0;border-radius:0;}.gd-map floorplan-card{display:block;height:100%;}',
    '.gd-photosw{border-radius:18px;overflow:hidden;background:transparent;}.gd-photos{display:block;width:100%;height:560px;border:0;background:transparent;}',
    '.gd-shot{display:flex;justify-content:center;padding:8px;border-radius:18px;background:rgba(0,0,0,.28);}.gd-img{display:block;max-width:100%;max-height:260px;border-radius:10px;}.gd-img.pixel{image-rendering:pixelated;width:100%;max-height:none;}',
    '.gd-val{border-radius:0;}.gd-tab .eh-kvr{padding:10px 14px;border-radius:14px;background:rgba(255,255,255,.07);border-top:0;}',
    '.gd-slider{display:flex;flex-direction:column;gap:6px;padding:10px 14px 6px;border-radius:16px;background:rgba(255,255,255,.07);}.gd-sl{display:flex;justify-content:space-between;font-size:14px;}.gd-out{color:var(--okie-text-dim);font-variant-numeric:tabular-nums;}',
    '.gd-text{display:flex;gap:10px;align-items:center;}.gd-input{flex:1;min-width:0;}.gd-buttons{flex-wrap:wrap;}.gd-ch{display:flex;flex-direction:column;gap:6px;}',
  ].join('\n')]);
})(typeof globalThis !== 'undefined' ? globalThis : window);

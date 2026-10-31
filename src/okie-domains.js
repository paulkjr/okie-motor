/* okie-domains: per-domain control panels for the detail view's Controls tab
 * (and the list view's inline "..." tray).
 *
 * Each entry is a factory:  (ctx, item, opts) -> { el, update(state), dispose() }
 * opts.compact renders the small variant used inside list rows.
 * Registered on window.OkieMotor.domains so a plugin can add or replace one.
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, L = g.OkieMotor.logic, CT = g.OkieMotor.controls, core = g.OkieMotor.core;
  var h = UI.h;

  core.registerStrings('en', {
    'd.brightness': 'Brightness', 'd.dimmer': 'Dimmer', 'd.brighter': 'Brighter', 'd.target': 'Target', 'd.now': 'Now', 'd.position': 'Position', 'd.open': 'Open', 'd.close': 'Close', 'd.stop': 'Stop',
    'd.lock': 'Lock', 'd.unlock': 'Unlock', 'd.hold_unlock': 'Hold to unlock', 'd.latch': 'Open latch', 'd.start': 'Start', 'd.pause': 'Pause', 'd.dock': 'Return to dock', 'd.locate': 'Locate',
    'd.run': 'Run', 'd.trigger': 'Run now', 'd.arm_home': 'Arm home', 'd.arm_away': 'Arm away', 'd.arm_night': 'Arm night', 'd.disarm': 'Disarm', 'd.code': 'Code',
    'd.speed': 'Speed', 'd.oscillate': 'Oscillate', 'd.warm': 'Warm', 'd.neutral': 'Neutral', 'd.cool': 'Cool', 'd.volume': 'Volume', 'd.source': 'Source', 'd.source_pick': 'Choose a source', 'd.mute': 'Mute', 'd.remote': 'Remote', 'd.rk.home': 'Home', 'd.rk.back': 'Back', 'd.rk.menu': 'Options', 'd.rk.replay': 'Replay', 'd.rk.up': 'Up', 'd.rk.down': 'Down', 'd.rk.left': 'Left', 'd.rk.right': 'Right', 'd.rk.rew': 'Rewind', 'd.rk.play': 'Play / pause', 'd.rk.ff': 'Fast forward', 'd.rk.vdown': 'Vol \u2212', 'd.rk.vup': 'Vol +', 'd.rk.chdown': 'Ch \u2212', 'd.rk.chup': 'Ch +', 'd.rk.ok': 'OK', 'd.tv_unreachable': 'The TV cannot be reached right now. It is most likely switched off.',
    'd.humidity': 'Humidity', 'd.forecast': 'Forecast', 'd.wind': 'Wind', 'd.battery': 'Battery', 'd.updated': 'Updated {t}', 'd.nothing_playing': 'Nothing playing',
    'd.mode.off': 'Off', 'd.mode.heat': 'Heat', 'd.mode.cool': 'Cool', 'd.mode.auto': 'Auto', 'd.mode.heat_cool': 'Heat/Cool', 'd.mode.dry': 'Dry', 'd.mode.fan_only': 'Fan',
    'd.preset': 'Preset', 'd.fan_mode': 'Fan', 'th.mode.heat': 'Heating', 'th.mode.cool': 'Cooling', 'th.mode.heat_cool': 'Heat/Cool', 'd.failed': 'Could not reach {name}', 'd.power': 'Power', 'd.toggle': 'Toggle', 'd.no_picture': 'No picture available',
  });
  core.registerStrings('de', {
    'd.brightness': 'Helligkeit', 'd.dimmer': 'Dunkler', 'd.brighter': 'Heller', 'd.target': 'Ziel', 'd.now': 'Jetzt', 'd.position': 'Position', 'd.open': 'Öffnen', 'd.close': 'Schließen', 'd.stop': 'Stopp',
    'd.lock': 'Verriegeln', 'd.unlock': 'Entriegeln', 'd.hold_unlock': 'Zum Entriegeln halten', 'd.latch': 'Falle öffnen', 'd.start': 'Start', 'd.pause': 'Pause', 'd.dock': 'Zurück zur Station', 'd.locate': 'Finden',
    'd.run': 'Ausführen', 'd.trigger': 'Jetzt ausführen', 'd.arm_home': 'Scharf (zuhause)', 'd.arm_away': 'Scharf (abwesend)', 'd.arm_night': 'Scharf (Nacht)', 'd.disarm': 'Unscharf', 'd.code': 'Code',
    'd.speed': 'Stufe', 'd.oscillate': 'Schwenken', 'd.warm': 'Warm', 'd.neutral': 'Neutral', 'd.cool': 'Kalt', 'd.volume': 'Lautstärke', 'd.source': 'Quelle', 'd.source_pick': 'Quelle wählen', 'd.mute': 'Stumm', 'd.remote': 'Fernbedienung', 'd.rk.home': 'Start', 'd.rk.back': 'Zur\u00fcck', 'd.rk.menu': 'Optionen', 'd.rk.replay': 'Wiederholen', 'd.rk.up': 'Hoch', 'd.rk.down': 'Runter', 'd.rk.left': 'Links', 'd.rk.right': 'Rechts', 'd.rk.rew': 'Zur\u00fcckspulen', 'd.rk.play': 'Wiedergabe / Pause', 'd.rk.ff': 'Vorspulen', 'd.rk.vdown': 'Leiser', 'd.rk.vup': 'Lauter', 'd.rk.chdown': 'Kanal \u2212', 'd.rk.chup': 'Kanal +', 'd.rk.ok': 'OK', 'd.tv_unreachable': 'Der Fernseher ist gerade nicht erreichbar, wahrscheinlich ist er ausgeschaltet.',
    'd.humidity': 'Luftfeuchte', 'd.forecast': 'Vorhersage', 'd.wind': 'Wind', 'd.battery': 'Akku', 'd.updated': 'Aktualisiert {t}', 'd.nothing_playing': 'Es läuft nichts',
    'd.mode.off': 'Aus', 'd.mode.heat': 'Heizen', 'd.mode.cool': 'Kühlen', 'd.mode.auto': 'Auto', 'd.mode.heat_cool': 'Heizen/Kühlen', 'd.mode.dry': 'Trocknen', 'd.mode.fan_only': 'Lüfter',
    'd.preset': 'Voreinstellung', 'd.fan_mode': 'Lüfter', 'th.mode.heat': 'Heizen', 'th.mode.cool': 'Kühlen', 'th.mode.heat_cool': 'Heizen/Kühlen', 'd.failed': '{name} nicht erreichbar', 'd.power': 'Ein/Aus', 'd.toggle': 'Umschalten', 'd.no_picture': 'Kein Bild verfügbar',
  });

  function T(ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; }
  /** Service call that reports failure as a toast instead of a console error. */
  function svc(ctx, item, domain, service, data) {
    return ctx.call(domain, service, Object.assign({ entity_id: item.id }, data || {})).then(function (r) { ctx.engine.recordUse(item.id); return r; }, function (e) {
      ctx.toast('error', core.t('d.failed', ctx.lang(), { name: item.name }));
      throw e;
    });
  }
  function noop() {}
  function attrs(ctx, id) { var s = ctx.state(id); return (s && s.attributes) || {}; }
  function fnum(v, d) { return (v == null || isNaN(parseFloat(v))) ? d : parseFloat(v); }
  function tempUnit(ctx) { var hs = ctx.hass(); return (hs.config && hs.config.unit_system && hs.config.unit_system.temperature) || '°C'; }
  function pctFmt(v) { return Math.round(v) + '%'; }

  function btn(label, icon, onclick, cls) {
    return h('button.act' + (cls ? '.' + cls : ''), { onclick: onclick, 'aria-label': label }, icon ? h('span', { html: UI.icon(icon, 20) }) : null, h('span', null, label));
  }

  var D = {};

  // ---------------------------------------------------------------- light ----
  var LIGHT_COLORS = [['#ff5a4f', [255, 90, 79]], ['#ffb020', [255, 176, 32]], ['#ffe14f', [255, 225, 79]], ['#4fd16e', [79, 209, 110]], ['#38c8e8', [56, 200, 232]], ['#4f8cff', [79, 140, 255]], ['#a96bff', [169, 107, 255]], ['#ff6bc4', [255, 107, 196]]];
  function lightDimmable(ctx, id) { var modes = attrs(ctx, id).supported_color_modes || []; return modes.length ? modes.some(function (m) { return m !== 'onoff'; }) : true; }      // legacy lights send no modes

  /**
   * The Controls of a dimmable light: the thermostat's wheel with percent instead of degrees. The rim and the glow are the colour the light shines in (its colour temperature or its
   * colour), and the glow gets stronger as the light gets brighter. Turn the wheel (drag, scroll, arrow keys) and the light follows, a tap turns it off or on.
   */
  function lightDial(ctx, item, o, hasCT, hasColor) {
    var t = T(ctx), TH = g.OkieMotor.thermo, root = h('div.dctl.thermo');
    var last = ctx.store.get('light.rgb.' + item.id, null);
    var presets = [['warm', 2700], ['neutral', 4000], ['cool', 6000]];
    var modes = hasCT ? presets.map(function (p) { var c = TH.kelvinToRgb(p[1]); return { id: String(p[1]), label: t('d.' + p[0]), swatch: 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')' }; }) : [];
    var swatches = hasColor ? LIGHT_COLORS.map(function (c, i) { return { id: String(i), css: c[0], label: c[0] }; }) : [];
    var th = TH.create({
      unit: '%', min: 0, max: 100, step: 1, value: 0, haptic: ctx.haptic, look: ctx.settings.get().thermo, modes: modes, swatches: swatches, stepper: true, stepSize: 5,
      cls: 'light', degPerUnit: TH.DEG_PER_PCT, sens: .3, liveMs: 200, buzzStep: 2, tapPower: true, dragWhenOff: true, gainOf: TH.glowGain,
      labels: { lower: t('d.dimmer'), raise: t('d.brighter'), eyebrow: t('d.brightness'), offNote: t('th.light_off'), schedule: t('th.light_sched'), unavailable: t('th.unavailable'), turnOff: t('th.turn_off'), turnOn: t('th.turn_on'), colors: t('th.colors') },
      onSend: function (v) { if (v <= 0) svc(ctx, item, 'light', 'turn_off').catch(noop); else svc(ctx, item, 'light', 'turn_on', { brightness_pct: Math.round(v) }).catch(noop); },
      onMode: function (id) { svc(ctx, item, 'light', 'turn_on', { color_temp_kelvin: parseInt(id, 10) }).catch(noop); },
      onSwatch: function (id) { svc(ctx, item, 'light', 'turn_on', { rgb_color: LIGHT_COLORS[parseInt(id, 10)][1] }).catch(noop); },
      onOff: function () { svc(ctx, item, 'light', 'turn_off').catch(noop); },
      onOn: function () { svc(ctx, item, 'light', 'turn_on').catch(noop); },
      onSchedule: o.openTab ? function () { o.openTab('schedule'); } : null,
    });
    root.appendChild(th.el);
    function update(st) {
      var a = st.attributes || {}, on = st.state === 'on';
      var pct = on ? (a.brightness != null ? Math.round(a.brightness / 255 * 100) : 100) : 0;
      if (on) {
        var c = TH.lightRgb(a, last), key = c.r + ',' + c.g + ',' + c.b;
        if (!last || last.r + ',' + last.g + ',' + last.b !== key) { last = c; ctx.store.set('light.rgb.' + item.id, c); }      // an off light keeps the colour it last had
      }
      th.setColor(last || TH.WARM_WHITE);
      th.set(pct); th.setOff(st.state === 'off'); th.setUnavailable(st.state === 'unavailable');
      var kel = +a.color_temp_kelvin;
      th.setCurrent(on && a.color_mode === 'color_temp' && kel > 0 ? Math.round(kel / 100) * 100 + ' K' : '');
      th.setMode(on && a.color_mode === 'color_temp' && kel > 0 ? String([2700, 4000, 6000].reduce(function (b, v) { return Math.abs(v - kel) < Math.abs(b - kel) ? v : b; }, 2700)) : null);
      var hit = null;
      if (on && a.color_mode !== 'color_temp' && Array.isArray(a.rgb_color)) LIGHT_COLORS.forEach(function (lc, i) { if (lc[1].every(function (v, k) { return Math.abs(v - a.rgb_color[k]) <= 3; })) hit = String(i); });
      th.setSwatch(hit);
    }
    return { el: root, update: update, rollOut: function () { return th.rollOut(); }, dispose: function () { th.dispose(); } };
  }

  D.light = function (ctx, item, o) {
    var t = T(ctx), a0 = attrs(ctx, item.id), modes = a0.supported_color_modes || [];
    var dimmable = lightDimmable(ctx, item.id);
    if (dimmable && !o.compact && g.OkieMotor.thermo && g.OkieMotor.thermo.create) {
      return lightDial(ctx, item, o, modes.indexOf('color_temp') >= 0, modes.some(function (m) { return ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].indexOf(m) >= 0; }));
    }
    var hasCT = modes.indexOf('color_temp') >= 0;
    var hasColor = modes.some(function (m) { return ['hs', 'xy', 'rgb', 'rgbw', 'rgbww'].indexOf(m) >= 0; });
    var send = CT.throttle(function (v) { svc(ctx, item, 'light', 'turn_on', { brightness_pct: Math.max(1, Math.round(v)) }).catch(noop); }, 180);
    var power = CT.createPower({ label: t('d.power'), icon: 'power', onToggle: function () {
      var on = (ctx.state(item.id) || {}).state === 'on';
      svc(ctx, item, 'light', on ? 'turn_off' : 'turn_on').catch(noop);
    } });
    var root = h('div.dctl' + (o.compact ? '.compact' : ''));
    var dial = null, slider = null, ctRow = null, colorRow = null;
    if (dimmable) {
      if (o.compact) {
        slider = CT.createSlider({ min: 0, max: 100, step: 1, value: 0, ariaLabel: t('d.brightness'), format: pctFmt, color: '#f5a30b',
          onInput: function (v) { if (v > 0) send(v); }, onChange: function (v) { send.cancel(); if (v <= 0) svc(ctx, item, 'light', 'turn_off').catch(noop); else svc(ctx, item, 'light', 'turn_on', { brightness_pct: Math.round(v) }).catch(noop); } });
        root.appendChild(h('div.crow', null, slider.el, power.el));
      } else {
        dial = CT.createDial({ min: 0, max: 100, step: 1, value: 0, label: t('d.brightness'), ariaLabel: t('d.brightness'), gradient: ['#c97b0a', '#ffd470'], format: pctFmt,
          onInput: function (v) { if (v > 0) send(v); },
          onChange: function (v) { send.cancel(); if (v <= 0) svc(ctx, item, 'light', 'turn_off').catch(noop); else svc(ctx, item, 'light', 'turn_on', { brightness_pct: Math.round(v) }).catch(noop); } });
        root.appendChild(h('div.dwrap', null, dial.el, power.el));
      }
    } else root.appendChild(h('div.dwrap', null, power.el));
    if (hasCT && !o.compact) {
      var pairs = [['warm', 2700], ['neutral', 4000], ['cool', 6000]];
      ctRow = CT.createChips({ options: pairs.map(function (p) { return { id: String(p[1]), label: t('d.' + p[0]) }; }), value: null, onChange: function (id) { svc(ctx, item, 'light', 'turn_on', { color_temp_kelvin: parseInt(id, 10) }).catch(noop); } });
      root.appendChild(ctRow.el);
    }
    if (hasColor && !o.compact) {
      var sw = LIGHT_COLORS;
      colorRow = CT.createChips({ options: sw.map(function (s, i) { return { id: String(i), swatch: s[0], title: s[0] }; }), value: null, onChange: function (id) { svc(ctx, item, 'light', 'turn_on', { rgb_color: sw[parseInt(id, 10)][1] }).catch(noop); } });
      root.appendChild(colorRow.el);
    }
    function update(st) {
      var on = st.state === 'on', pct = on && st.attributes.brightness != null ? Math.round(st.attributes.brightness / 255 * 100) : (on ? 100 : 0);
      power.set(on); power.setDisabled(st.state === 'unavailable');
      if (dial) { dial.set(pct); dial.setDisabled(!on && false); }
      if (slider) slider.set(pct);
      if (ctRow && st.attributes.color_temp_kelvin) {
        var near = [2700, 4000, 6000].reduce(function (b, v) { return Math.abs(v - st.attributes.color_temp_kelvin) < Math.abs(b - st.attributes.color_temp_kelvin) ? v : b; }, 2700);
        ctRow.set(String(near));
      }
    }
    return { el: root, update: update, dispose: function () { send.cancel(); if (dial) dial.dispose(); } };
  };

  // -------------------------------------------------------------- climate ----
  /** The preset and fan buttons of a thermostat: they live under the Settings tab of the thermo card (the design has none under the dial). */
  function climateExtras(ctx, item) {
    var t = T(ctx), a0 = attrs(ctx, item.id), root = h('div.climx'), presetRow = null, fanRow = null;
    if (a0.preset_modes && a0.preset_modes.length) { presetRow = CT.createChips({ options: a0.preset_modes.map(function (p) { return { id: p, label: p }; }), value: null, onChange: function (p) { svc(ctx, item, 'climate', 'set_preset_mode', { preset_mode: p }).catch(noop); } }); root.appendChild(h('div.lbl', null, t('d.preset'))); root.appendChild(presetRow.el); }
    if (a0.fan_modes && a0.fan_modes.length) { fanRow = CT.createChips({ options: a0.fan_modes.map(function (p) { return { id: p, label: p }; }), value: null, onChange: function (p) { svc(ctx, item, 'climate', 'set_fan_mode', { fan_mode: p }).catch(noop); } }); root.appendChild(h('div.lbl', null, t('d.fan_mode'))); root.appendChild(fanRow.el); }
    return { el: root, empty: !presetRow && !fanRow, set: function (a) { if (presetRow) presetRow.set(a.preset_mode); if (fanRow) fanRow.set(a.fan_mode); } };
  }
  // The detail view's Controls are the Thermo Dial (okie-thermo.js); the list row's tray keeps the small minus / value / plus.
  D.climate = function (ctx, item, o) {
    var t = T(ctx), a0 = attrs(ctx, item.id), unit = tempUnit(ctx);
    var min = fnum(a0.min_temp, 7), max = fnum(a0.max_temp, 35), step = fnum(a0.target_temp_step, unit === '°F' ? 1 : 0.5);
    var lastMode = ctx.store.get('climate.last.' + item.id, 'heat');
    var power = CT.createPower({ label: t('d.power'), onToggle: function () {
      var cur = (ctx.state(item.id) || {}).state;
      if (cur === 'off') svc(ctx, item, 'climate', 'set_hvac_mode', { hvac_mode: lastMode }).catch(noop);
      else svc(ctx, item, 'climate', 'set_hvac_mode', { hvac_mode: 'off' }).catch(noop);
    } });
    var root = h('div.dctl');
    if (o.compact) {
      var val = h('div.cval'), minus = h('button.stp', { 'aria-label': '-', onclick: function () { var v = fnum((ctx.state(item.id).attributes || {}).temperature, min) - step; svc(ctx, item, 'climate', 'set_temperature', { temperature: Math.max(min, v) }).catch(noop); }, html: UI.icon('minus', 20) });
      var plus = h('button.stp', { 'aria-label': '+', onclick: function () { var v = fnum((ctx.state(item.id).attributes || {}).temperature, min) + step; svc(ctx, item, 'climate', 'set_temperature', { temperature: Math.min(max, v) }).catch(noop); }, html: UI.icon('plus', 20) });
      root.classList.add('compact'); root.appendChild(h('div.crow', null, minus, val, plus, power.el));
      return { el: root, update: function (st) { val.textContent = fnum(st.attributes.temperature, '–') + '°'; power.set(st.state !== 'off'); }, dispose: noop };
    }
    root.classList.add('thermo');
    function modeId(m) { return m; }
    var TH = g.OkieMotor.thermo;
    var modes = (a0.hvac_modes || ['off', 'heat']).filter(function (m, i, all) { return m !== 'off' && !(m === 'auto' && all.indexOf('heat_cool') >= 0); }).map(function (m) { var own = t('th.mode.' + m); return { id: modeId(m), label: own !== 'th.mode.' + m ? own : t('d.mode.' + m) }; });
    // heat/cool: HA sends target_temp_low/high and a null target, so the wheel gives way to two steppers
    function bump(key, dir) {
      var a = (ctx.state(item.id) || { attributes: {} }).attributes, lo = fnum(a.target_temp_low, min), hi = fnum(a.target_temp_high, max);
      if (key === 'low') lo = Math.min(hi - step, Math.max(min, lo + dir * step)); else hi = Math.max(lo + step, Math.min(max, hi + dir * step));
      svc(ctx, item, 'climate', 'set_temperature', { target_temp_low: lo, target_temp_high: hi }).catch(noop);
    }
    var th = TH.create({
      unit: unit, min: min, max: max, step: step, value: min, comma: ctx.lang() === 'de', modes: modes, haptic: ctx.haptic, look: ctx.settings.get().thermo, stepper: true,
      labels: { lower: t('th.lower'), raise: t('th.raise'), eyebrow: t('th.eyebrow'), now: t('th.now'), hold: t('th.hold'), offNote: t('th.off_note'), schedule: t('th.schedule'), unavailable: t('th.unavailable'), min: t('th.min'), max: t('th.max') },
      onSend: function (v) { svc(ctx, item, 'climate', 'set_temperature', { temperature: v }).catch(noop); },
      onMode: function (m) { svc(ctx, item, 'climate', 'set_hvac_mode', { hvac_mode: m }).catch(noop); },
      onOff: function () { svc(ctx, item, 'climate', 'set_hvac_mode', { hvac_mode: 'off' }).catch(noop); },
      onOn: function () { svc(ctx, item, 'climate', 'set_hvac_mode', { hvac_mode: lastMode }).catch(noop); },
      onSchedule: o.openTab ? function () { o.openTab('schedule'); } : null,
      onBump: bump,
    });
    root.appendChild(th.el);
    function update(st) {
      var a = st.attributes;
      th.setRange(fnum(a.min_temp, min), fnum(a.max_temp, max), fnum(a.target_temp_step, step), unit);
      var ranged = a.temperature == null && (a.target_temp_low != null || a.target_temp_high != null);
      th.setRanged(ranged, fnum(a.target_temp_low, null), fnum(a.target_temp_high, null));
      th.set(ranged ? (fnum(a.target_temp_low, min) + fnum(a.target_temp_high, max)) / 2 : fnum(a.temperature, fnum(a.current_temperature, min)));
      th.setOff(st.state === 'off'); th.setUnavailable(st.state === 'unavailable');
      th.setCurrent(a.current_temperature != null ? t('d.now') + ' ' + a.current_temperature + unit : '');
      var act = a.hvac_action, modeName = t('d.mode.' + st.state);
      th.setTitle(item.name, st.state === 'unavailable' ? t('th.unavailable') : st.state === 'off' ? t('th.st.off') : act === 'cooling' ? t('th.st.cooling') : act === 'heating' ? t('th.st.heating') : act === 'drying' ? t('th.st.drying') : act === 'fan' ? t('th.st.fan') : act === 'idle' ? modeName + ' · ' + t('th.st.idle') : modeName);
      th.setMode(st.state === 'off' ? null : st.state);
      if (st.state !== 'off' && st.state !== 'unavailable') { lastMode = st.state; ctx.store.set('climate.last.' + item.id, st.state); }
    }
    return { el: root, update: update, rollOut: function () { return th.rollOut(); }, dispose: function () { th.dispose(); } };
  };

  // ---------------------------------------------------------------- cover ----
  D.cover = function (ctx, item, o) {
    var t = T(ctx), a0 = attrs(ctx, item.id), f = a0.supported_features || 0;
    var canPos = L.has(f, 4), canStop = L.has(f, 8), canTilt = L.has(f, 128);
    var send = CT.throttle(function (v) { svc(ctx, item, 'cover', 'set_cover_position', { position: Math.round(v) }).catch(noop); }, 250);
    var SN = g.OkieMotor.sensors;
    if (!o.compact && SN && SN.blindSvg) return blindsControl(ctx, item, o, canPos, canStop);      // the blinds screen: the name, a window with its shade, what it is doing, three round keys
    var root = h('div.dctl' + (o.compact ? '.compact' : ''));
    var slider = null;
    if (canPos) {
      slider = CT.createSlider({ min: 0, max: 100, step: 1, value: 0, vertical: !o.compact, ariaLabel: t('d.position'), format: o.compact ? pctFmt : null, color: '#2fa35c', onInput: send, onChange: function (v) { send.cancel(); svc(ctx, item, 'cover', 'set_cover_position', { position: Math.round(v) }).catch(noop); } });
    }
    var posEl = h('div.bigval');
    var buttons = h('div.actrow', null,
      btn(t('d.open'), 'chevron', function () { svc(ctx, item, 'cover', 'open_cover').catch(noop); }, 'up'),
      canStop ? btn(t('d.stop'), 'pause', function () { svc(ctx, item, 'cover', 'stop_cover').catch(noop); }) : null,
      btn(t('d.close'), 'chevdown', function () { svc(ctx, item, 'cover', 'close_cover').catch(noop); }));
    if (o.compact) root.appendChild(h('div.crow', null, slider ? slider.el : null, buttons));
    else root.appendChild(h('div.dwrap.cov', null, slider ? slider.el : null, h('div.covside', null, posEl, buttons)));
    var tilt = null;
    if (canTilt && !o.compact) {
      tilt = CT.createSlider({ min: 0, max: 100, step: 1, value: 0, ariaLabel: 'Tilt', format: pctFmt, color: '#2fa35c', onChange: function (v) { svc(ctx, item, 'cover', 'set_cover_tilt_position', { tilt_position: Math.round(v) }).catch(noop); } });
      root.appendChild(h('div.lbl', null, 'Tilt')); root.appendChild(tilt.el);
    }
    return { el: root, dispose: function () { send.cancel(); }, update: function (st) {
      var p = st.attributes.current_position;
      if (slider && p != null) slider.set(p);
      posEl.textContent = p != null ? Math.round(p) + '%' : L.stateLabel(st.state, ctx.lang());
      if (tilt && st.attributes.current_tilt_position != null) tilt.set(st.attributes.current_tilt_position);
    } };
  };

  /** The screen of a cover with a position (blinds, shades): name and room, a window whose shade follows the position, what it is doing, open / stop / close. */
  function blindsControl(ctx, item, o, canPos, canStop) {
    var t = T(ctx), SN = g.OkieMotor.sensors, art = h('div.bl-art'), status = h('div.bl-status');
    var run = function (s) { return function () { ctx.haptic && ctx.haptic(10); svc(ctx, item, 'cover', s).catch(noop); }; };
    var kOpen = h('button.bl-k', { type: 'button', 'aria-label': t('d.open'), title: t('d.open'), onclick: run('open_cover'), html: UI.icon('prev', 26) });
    var kStop = h('button.bl-k', { type: 'button', 'aria-label': t('d.stop'), title: t('d.stop'), onclick: run('stop_cover'), html: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor"/></svg>' });
    var kClose = h('button.bl-k', { type: 'button', 'aria-label': t('d.close'), title: t('d.close'), onclick: run('close_cover'), html: UI.icon('next', 26) });
    if (!canStop) kStop.hidden = true;
    var send = CT.throttle(function (v) { svc(ctx, item, 'cover', 'set_cover_position', { position: Math.round(v) }).catch(noop); }, 250);
    var slider = canPos ? CT.createSlider({ min: 0, max: 100, step: 1, value: 0, ariaLabel: t('d.position'), format: pctFmt, color: '#ffffff', onInput: send, onChange: function (v) { send.cancel(); svc(ctx, item, 'cover', 'set_cover_position', { position: Math.round(v) }).catch(noop); } }) : null;
    var root = h('div.dctl.bl-ctl', null, h('div.bl-name', null, item.name), h('div.bl-room', null, item.area || ''), art, status, h('div.bl-keys', null, kOpen, kStop, kClose), slider ? h('div.bl-pos', null, slider.el) : null);
    return { el: root, dispose: function () { send.cancel(); }, update: function (st) {
      var p = st.attributes.current_position, dir = st.state === 'opening' ? 'opening' : st.state === 'closing' ? 'closing' : '', n = item.name;
      var open = p != null ? p : (st.state === 'open' || st.state === 'opening' ? 100 : 0);
      art.innerHTML = SN.blindSvg(open, dir);
      status.textContent = dir === 'opening' ? t('sn.blind_opening', { n: n }) : dir === 'closing' ? t('sn.blind_closing', { n: n }) : (p != null && p > 0 && p < 100 ? t('sn.blind_at', { n: n, p: Math.round(p) }) : t(open > 0 ? 'sn.blind_open' : 'sn.blind_closed', { n: n }));
      kOpen.classList.toggle('on', dir === 'opening'); kClose.classList.toggle('on', dir === 'closing');
      if (slider && p != null) slider.set(p);
    } };
  }

  // ------------------------------------------------------------------ fan ----
  D.fan = function (ctx, item, o) {
    var t = T(ctx), a0 = attrs(ctx, item.id), f = a0.supported_features || 0;
    var step = fnum(a0.percentage_step, 1);
    var send = CT.throttle(function (v) { svc(ctx, item, 'fan', 'set_percentage', { percentage: Math.round(v) }).catch(noop); }, 250);
    var power = CT.createPower({ label: t('d.power'), icon: 'fan', onToggle: function () { var on = (ctx.state(item.id) || {}).state === 'on'; svc(ctx, item, 'fan', on ? 'turn_off' : 'turn_on').catch(noop); } });
    var root = h('div.dctl' + (o.compact ? '.compact' : ''));
    var dial = null, slider = null;
    if (L.has(f, 1)) {
      if (o.compact) { slider = CT.createSlider({ min: 0, max: 100, step: step, value: 0, ariaLabel: t('d.speed'), format: pctFmt, color: '#1fa5a5', onInput: send, onChange: function (v) { send.cancel(); svc(ctx, item, 'fan', 'set_percentage', { percentage: Math.round(v) }).catch(noop); } }); root.appendChild(h('div.crow', null, slider.el, power.el)); }
      else { dial = CT.createDial({ min: 0, max: 100, step: step, value: 0, label: t('d.speed'), ariaLabel: t('d.speed'), gradient: ['#1b8f8f', '#6be3df'], format: pctFmt, onInput: send, onChange: function (v) { send.cancel(); svc(ctx, item, 'fan', 'set_percentage', { percentage: Math.round(v) }).catch(noop); } }); root.appendChild(h('div.dwrap', null, dial.el, power.el)); }
    } else root.appendChild(h('div.dwrap', null, power.el));
    var osc = null, presets = null;
    if (L.has(f, 2) && !o.compact) { osc = CT.createChips({ options: [{ id: 'osc', label: t('d.oscillate') }], value: null, onChange: function () { var on = !!(ctx.state(item.id).attributes || {}).oscillating; svc(ctx, item, 'fan', 'oscillate', { oscillating: !on }).catch(noop); } }); root.appendChild(osc.el); }
    if (L.has(f, 8) && a0.preset_modes && !o.compact) { presets = CT.createChips({ options: a0.preset_modes.map(function (p) { return { id: p, label: p }; }), value: null, onChange: function (p) { svc(ctx, item, 'fan', 'set_preset_mode', { preset_mode: p }).catch(noop); } }); root.appendChild(presets.el); }
    return { el: root, dispose: function () { send.cancel(); if (dial) dial.dispose(); }, update: function (st) {
      var on = st.state === 'on', p = on ? fnum(st.attributes.percentage, 100) : 0;
      power.set(on); if (dial) dial.set(p); if (slider) slider.set(p);
      if (osc) osc.set(st.attributes.oscillating ? 'osc' : null);
      if (presets) presets.set(st.attributes.preset_mode);
    } };
  };

  // ----------------------------------------------------------------- lock ----
  D.lock = function (ctx, item, o) {
    var t = T(ctx), f = attrs(ctx, item.id).supported_features || 0;
    var big = h('button.lockbig'), ringSvg = h('svg.ring', { viewBox: '0 0 48 48', html: '<circle cx="24" cy="24" r="22" fill="none" stroke="#ffb020" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="138" stroke-dashoffset="138" transform="rotate(-90 24 24)"/>' });
    var circ = ringSvg.firstChild, icon = h('span.lk-ic'), lbl = h('div.lk-lbl'), hint = h('div.lbl');
    big.appendChild(ringSvg); big.appendChild(icon);
    function locked() { var s = (ctx.state(item.id) || {}).state; return s === 'locked' || s === 'locking'; }
    UI.onTapOrHold(big, {
      holdMs: 1000,
      hold: function () { if (locked()) svc(ctx, item, 'lock', 'unlock').catch(noop); },
      tap: function () { if (!locked()) svc(ctx, item, 'lock', 'lock').catch(noop); else ctx.toast('info', t('d.hold_unlock')); },
      onProgress: function (p) { if (locked()) circ.style.strokeDashoffset = String(138 * (1 - p)); },
    });
    var root = h('div.dctl', null, h('div.dwrap', null, big), lbl, hint);
    if (L.has(f, 1) && !o.compact) root.appendChild(btn(t('d.latch'), 'door', function () { svc(ctx, item, 'lock', 'open').catch(noop); }));
    return { el: root, dispose: noop, update: function (st) {
      var lk = st.state === 'locked';
      icon.innerHTML = UI.icon(lk ? 'lock' : 'unlock', 54); big.classList.toggle('on', !lk);
      lbl.textContent = L.stateLabel(st.state, ctx.lang()); lbl.className = 'lk-lbl';
      hint.textContent = lk ? t('d.hold_unlock') : t('d.lock');
    } };
  };

  /** Many sources (a Roku lists every app): a drop-down instead of a wall of chips. The native picker, so a phone shows its own wheel. */
  var SOURCE_CHIPS_MAX = 6;
  function sourceSelect(o) {
    var sel = h('select.src-sel', { 'aria-label': o.label }), cur = '';
    sel.appendChild(h('option', { value: '' }, o.placeholder));
    o.options.forEach(function (s) { sel.appendChild(h('option', { value: s }, s)); });
    sel.addEventListener('change', function () { if (sel.value) { cur = sel.value; o.onChange(sel.value); } });
    var el = h('div.src-selw', null, sel, h('span.src-chev', { html: UI.icon('chevdown', 18) }));
    return { el: el, set: function (v) { if (document.activeElement === sel || (sel.getRootNode && sel.getRootNode().activeElement === sel)) return; var want = o.options.indexOf(v) >= 0 ? v : ''; if (sel.value !== want) sel.value = want; } };
  }

  // ------------------------------------------------------------ TV remote ----
  // Samsung and Roku TVs: the remote entity of the same device and the key names, like the floor plan card of the main dashboard.
  var RKEYS = {
    roku: { up: 'up', down: 'down', left: 'left', right: 'right', ok: 'select', back: 'back', home: 'home', menu: 'info', replay: 'instant_replay', play: 'play', rew: 'reverse', ff: 'forward', vup: 'volume_up', vdown: 'volume_down', mute: 'volume_mute', chup: 'channel_up', chdown: 'channel_down' },
    samsung: { up: 'KEY_UP', down: 'KEY_DOWN', left: 'KEY_LEFT', right: 'KEY_RIGHT', ok: 'KEY_ENTER', back: 'KEY_RETURN', home: 'KEY_HOME', menu: 'KEY_MENU', replay: 'KEY_PRECH', play: 'KEY_PLAY', rew: 'KEY_REWIND', ff: 'KEY_FF', vup: 'KEY_VOLUP', vdown: 'KEY_VOLDOWN', mute: 'KEY_MUTE', chup: 'KEY_CHUP', chdown: 'KEY_CHDOWN' }
  };
  var RPATH = { up: 'M12 7l6 8H6z', down: 'M12 17l-6-8h12z', left: 'M7 12l8-6v12z', right: 'M17 12l-8-6v12z', back: 'M11 5 4 12l7 7v-4c5 0 8 1 9 5 0-6-3-10-9-10z', home: 'M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z', menu: 'M11 2h2v7.2l6.2-3.6 1 1.7L14 11l6.2 3.6-1 1.7-6.2-3.6V20h-2v-7.3l-6.2 3.6-1-1.7L10 11 3.8 7.3l1-1.7 6.2 3.6z', replay: 'M12 5V2L7 6.5 12 11V8a6 6 0 1 1-6 6H4a8 8 0 1 0 8-9z', play: 'M6 5v14l8-7zM16 5h3v14h-3z', rew: 'M11 12l8-6v12zM3 12l8-6v12z', ff: 'M13 12 5 6v12zM21 12l-8-6v12z' };
  var REMOTES = {};      // media_player id -> Promise of {brand, remote} or null (one registry lookup per TV)
  function findRemote(ctx, id) {
    if (REMOTES[id]) return REMOTES[id];
    var obj = id.split('.')[1], hs = ctx.hass(), guess = hs.states['remote.' + obj] ? 'remote.' + obj : null;
    var named = function (r) { var nm = id + ' ' + String((hs.states[id] && hs.states[id].attributes.friendly_name) || ''); return r.platform === 'roku' ? 'roku' : r.platform === 'samsungtv' ? 'samsung' : (!r.platform ? (/roku|tcl/i.test(nm) ? 'roku' : /samsung|crystal|uhd/i.test(nm) ? 'samsung' : null) : null); };
    return (REMOTES[id] = ctx.callWS({ type: 'config/entity_registry/get', entity_id: id }).then(function (r) {
      var done = function (remote) { var brand = named(r); return brand && remote ? { brand: brand, remote: remote } : null; };
      if (guess) return done(guess);
      if (!r.device_id) return null;
      return ctx.callWS({ type: 'config/entity_registry/list' }).then(function (all) {
        var m = all.filter(function (x) { return x.device_id === r.device_id && x.entity_id.indexOf('remote.') === 0; })[0];
        return done(m && m.entity_id);
      });
    }).catch(function () { return null; }));
  }
  // The apps a TV can start from its remote: the first source whose name fits (Roku and Samsung list their apps as sources).
  var RAPPS = [{ id: 'netflix', label: 'Netflix', re: /netflix/i }, { id: 'disney', label: 'Disney+', re: /disney/i }, { id: 'appletv', label: 'Apple TV+', re: /apple\s*tv/i }, { id: 'hbomax', label: 'HBO max', re: /hbo|^max\b|\bmax$/i }];
  function remotePanel(ctx, item, info, powerEl) {
    var t = T(ctx), keys = RKEYS[info.brand], timer = 0, rep = 0;
    function send(k) { ctx.haptic(8); ctx.call('remote', 'send_command', { entity_id: info.remote, command: [keys[k]] }).then(function () { ctx.engine.recordUse(item.id); }, function () { ctx.toast('error', core.t('d.failed', ctx.lang(), { name: item.name })); }); }
    function stop() { clearTimeout(timer); clearInterval(rep); timer = rep = 0; }
    function key(k, label, cls, repeat, icon) {
      var b = h('button.rk' + (cls ? '.' + cls : ''), { 'aria-label': label || k, title: label || k, dataset: { key: k } });
      b.innerHTML = (RPATH[k] ? '<svg viewBox="0 0 24 24" width="' + (icon || 20) + '" height="' + (icon || 20) + '" fill="currentColor" aria-hidden="true"><path d="' + RPATH[k] + '"/></svg>' : '') + (label && !RPATH[k] ? label : '');
      b.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        send(k); stop();
        if (repeat) timer = setTimeout(function () { rep = setInterval(function () { send(k); }, 140); }, 450);       // hold = repeat (arrows, volume, channel)
      });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { b.addEventListener(ev, stop); });
      b.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); send(k); } });
      b.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      return b;
    }
    var gap = function () { return h('span'); };
    var note = h('div.rm-note', { hidden: true }, t('d.tv_unreachable'));
    var apps = h('div.rapps'), appsSig = '';
    // a tall, skinny remote like the real one: power, back + home, the pad, replay + options, the transport keys, volume and channel, the apps
    var body = h('div.rmb', null,
      h('div.rm-top', null, powerEl || gap()),
      h('div.rm2', null, key('back', t('d.rk.back')), key('home', t('d.rk.home'))),
      h('div.rdpad', null, gap(), key('up', t('d.rk.up'), '', true), gap(), key('left', t('d.rk.left'), '', true), key('ok', t('d.rk.ok'), 'ok'), key('right', t('d.rk.right'), '', true), gap(), key('down', t('d.rk.down'), '', true), gap()),
      h('div.rm2', null, key('replay', t('d.rk.replay')), key('menu', t('d.rk.menu'))),
      h('div.rm3', null, key('rew', t('d.rk.rew'), '', false, 18), key('play', t('d.rk.play'), '', false, 18), key('ff', t('d.rk.ff'), '', false, 18)),
      h('div.rm3', null, key('vdown', t('d.rk.vdown'), '', true), key('mute', t('d.mute')), key('vup', t('d.rk.vup'), '', true)),
      h('div.rm3', null, key('chdown', t('d.rk.chdown'), '', true), gap(), key('chup', t('d.rk.chup'), '', true)),
      apps);
    var el = h('div.rmt', null, note, body);
    function drawApps() {
      var st = ctx.state(item.id), list = (st && st.attributes && st.attributes.source_list) || [], found = RAPPS.map(function (a) { return { a: a, src: list.filter(function (x) { return a.re.test(String(x)); })[0] || null }; }).filter(function (x) { return x.src; });
      var sig = found.map(function (x) { return x.a.id + ':' + x.src; }).join('|'); if (sig === appsSig) return; appsSig = sig; apps.innerHTML = ''; apps.hidden = !found.length;
      found.forEach(function (x) { apps.appendChild(h('button.rk.rapp', { type: 'button', 'aria-label': x.src, title: x.src, onclick: function () { ctx.haptic(8); svc(ctx, item, 'media_player', 'select_source', { source: x.src }).catch(noop); } }, x.a.label)); });
    }
    return { el: el, dispose: stop, update: function () {
      var s = ctx.state(item.id), r = ctx.state(info.remote), gone = (s && s.state === 'unavailable') || (r && r.state === 'unavailable');
      note.hidden = !gone; drawApps();
      Array.prototype.forEach.call(el.querySelectorAll('.rk,.rapp'), function (b) { b.disabled = !!gone; });
    } };
  }

  // --------------------------------------------------------- media_player ----
  D.media_player = function (ctx, item, o) {
    var t = T(ctx), a0 = attrs(ctx, item.id), f = a0.supported_features || 0, hs = ctx.hass();
    var art = h('div.art'), title = h('div.mp-title'), sub = h('div.mp-sub');
    var play = h('button.tr.big', { 'aria-label': 'Play/Pause', onclick: function () { var s = (ctx.state(item.id) || {}).state; svc(ctx, item, 'media_player', s === 'playing' ? 'media_pause' : 'media_play').catch(noop); } });
    var prev = h('button.tr', { 'aria-label': 'Previous', onclick: function () { svc(ctx, item, 'media_player', 'media_previous_track').catch(noop); }, html: UI.icon('prev', 22) });
    var next = h('button.tr', { 'aria-label': 'Next', onclick: function () { svc(ctx, item, 'media_player', 'media_next_track').catch(noop); }, html: UI.icon('next', 22) });
    var power = CT.createPower({ label: t('d.power'), onToggle: function () { var s = (ctx.state(item.id) || {}).state; svc(ctx, item, 'media_player', s === 'off' ? 'turn_on' : 'turn_off').catch(noop); } });
    var vol = L.has(f, 4) ? CT.createSlider({ min: 0, max: 100, step: 1, value: 0, ariaLabel: t('d.volume'), format: pctFmt, color: '#8e5be8', onChange: function (v) { svc(ctx, item, 'media_player', 'volume_set', { volume_level: v / 100 }).catch(noop); } }) : null;
    var srcRow = null, srcLbl = null;
    var root = h('div.dctl' + (o.compact ? '.compact' : ''));
    if (!o.compact) root.appendChild(h('div.mp', null, art, h('div.mp-meta', null, title, sub)));
    else root.appendChild(h('div.mp-meta', null, title, sub));
    var hasPower = L.has(f, 128) || L.has(f, 256), actrow = h('div.actrow.center', null, L.has(f, 16) ? prev : null, play, L.has(f, 32) ? next : null, hasPower ? power.el : null);
    var tvLike = !o.compact && a0.device_class === 'tv';
    if (tvLike) actrow.style.display = 'none';      // a TV with a remote gets the remote's own buttons instead; this row comes back when it has none (a moment, once the remote is known)
    root.appendChild(actrow);
    if (vol) root.appendChild(vol.el);
    if (a0.source_list && a0.source_list.length && L.has(f, 2048) && !o.compact) {
      var pickSource = function (s) { svc(ctx, item, 'media_player', 'select_source', { source: s }).catch(noop); };
      srcRow = a0.source_list.length > SOURCE_CHIPS_MAX
        ? sourceSelect({ options: a0.source_list, placeholder: t('d.source_pick'), label: t('d.source'), onChange: pickSource })
        : CT.createChips({ options: a0.source_list.map(function (s) { return { id: s, label: s }; }), value: null, onChange: pickSource });
      srcLbl = h('div.lbl', null, t('d.source')); root.appendChild(srcLbl); root.appendChild(srcRow.el);
    }
    var remote = null, gone = false;
    if (!o.compact && a0.device_class !== 'speaker' && a0.device_class !== 'receiver') {
      findRemote(ctx, item.id).then(function (info) {
        if (gone) return;
        if (!info) { actrow.style.display = ''; return; }
        if (hasPower) power.el.classList.add('rm-power');
        var RK = RKEYS[info.brand];
        var hooks = {
          keys: RK,
          send: function (k) { ctx.haptic(8); ctx.call('remote', 'send_command', { entity_id: info.remote, command: [RK[k]] }).then(function () { ctx.engine.recordUse(item.id); }, function () { ctx.toast('error', core.t('d.failed', ctx.lang(), { name: item.name })); }); },
          svc: function (domain, service, data) { return svc(ctx, item, domain, service, data).catch(noop); },
        };
        remote = g.OkieMotor.remote && g.OkieMotor.remote.create ? g.OkieMotor.remote.create(ctx, item, hooks) : remotePanel(ctx, item, info, hasPower ? power.el : null);
        // like a real remote: the transport keys and the power key are in the remote, so the row above is gone; the remote stands beside the picture, the volume and the sources
        actrow.style.display = 'none';
        if (srcRow && g.OkieMotor.remote && g.OkieMotor.remote.create) { srcRow.el.style.display = 'none'; if (srcLbl) srcLbl.style.display = 'none'; }      // the new remote carries the sources in its favourites
        root.insertBefore(remote.el, root.firstChild); root.classList.add('tv');
        var dt = root.closest && root.closest('.dt'); if (dt) dt.dataset.remote = '1';      // the picture takes the width, the remote is as skinny as a real one
        remote.update();
      });
    }
    return { el: root, dispose: function () { gone = true; if (remote) remote.dispose(); var dt = root.closest && root.closest('.dt'); if (dt) delete dt.dataset.remote; }, update: function (st) {
      var a = st.attributes, pl = st.state === 'playing';
      if (remote) remote.update();
      title.textContent = a.media_title || (st.state === 'off' ? L.stateLabel('off', ctx.lang()) : t('d.nothing_playing'));
      sub.textContent = [a.media_artist, a.media_album_name].filter(Boolean).join(' · ') || a.source || '';
      play.innerHTML = UI.icon(pl ? 'pause' : 'play', 28);
      power.set(st.state !== 'off');
      if (vol && a.volume_level != null) vol.set(Math.round(a.volume_level * 100));
      var pic = a.entity_picture_local || a.entity_picture;
      art.style.backgroundImage = pic ? 'url("' + (hs.hassUrl ? hs.hassUrl(pic) : pic) + '")' : '';
      art.classList.toggle('empty', !pic);
      if (srcRow) srcRow.set(a.source);
    } };
  };

  // ------------------------------------------------------ switch & friends ----
  function toggleControl(ctx, item, o, icon) {
    var t = T(ctx);
    var power = CT.createPower({ label: t('d.power'), icon: icon, onToggle: function () { svc(ctx, item, item.domain, 'toggle').catch(noop); } });
    var lbl = h('div.lk-lbl');
    return { el: h('div.dctl' + (o.compact ? '.compact' : ''), null, h('div.dwrap', null, power.el), o.compact ? null : lbl), dispose: noop, update: function (st) { power.set(st.state === 'on'); power.setDisabled(st.state === 'unavailable'); lbl.textContent = L.stateLabel(st.state, ctx.lang()); } };
  }
  D.switch = function (ctx, item, o) { return toggleControl(ctx, item, o, 'power'); };
  D.input_boolean = D.switch;
  D.humidifier = function (ctx, item, o) {
    var t = T(ctx), a0 = attrs(ctx, item.id);
    var send = CT.throttle(function (v) { svc(ctx, item, 'humidifier', 'set_humidity', { humidity: Math.round(v) }).catch(noop); }, 300);
    var dial = CT.createDial({ min: fnum(a0.min_humidity, 0), max: fnum(a0.max_humidity, 100), step: 1, value: 0, label: t('d.humidity'), gradient: ['#4f8cff', '#7de4ff'], format: pctFmt, onInput: send, onChange: function (v) { send.cancel(); svc(ctx, item, 'humidifier', 'set_humidity', { humidity: Math.round(v) }).catch(noop); } });
    var power = CT.createPower({ label: t('d.power'), onToggle: function () { svc(ctx, item, 'humidifier', 'toggle').catch(noop); } });
    return { el: h('div.dctl', null, h('div.dwrap', null, dial.el, power.el)), dispose: function () { send.cancel(); dial.dispose(); }, update: function (st) { dial.set(fnum(st.attributes.humidity, 0)); power.set(st.state === 'on'); } };
  };
  D.water_heater = function (ctx, item) {
    var t = T(ctx), a0 = attrs(ctx, item.id);
    var send = CT.throttle(function (v) { svc(ctx, item, 'water_heater', 'set_temperature', { temperature: v }).catch(noop); }, 400);
    var dial = CT.createDial({ min: fnum(a0.min_temp, 30), max: fnum(a0.max_temp, 70), step: 1, value: 40, label: t('d.target'), gradient: ['#ffb020', '#f0731b'], format: function (v) { return Math.round(v) + '°'; }, onInput: send, onChange: function (v) { send.cancel(); svc(ctx, item, 'water_heater', 'set_temperature', { temperature: v }).catch(noop); } });
    return { el: h('div.dctl', null, h('div.dwrap', null, dial.el)), dispose: function () { send.cancel(); dial.dispose(); }, update: function (st) { dial.set(fnum(st.attributes.temperature, 40)); } };
  };

  // --------------------------------------------------------------- vacuum ----
  D.vacuum = function (ctx, item, o) {
    if (!o.compact && g.OkieMotor.vacuum) return g.OkieMotor.vacuum.render(ctx, item, o);      // the full screen: the little robot, battery, keys, tanks and the mission statistics
    var t = T(ctx);
    var status = h('div.bigval'), bat = h('div.lbl');
    var startPause = h('button.act', { onclick: function () { var s = (ctx.state(item.id) || {}).state; svc(ctx, item, 'vacuum', s === 'cleaning' ? 'pause' : 'start').catch(noop); } });
    var root = h('div.dctl' + (o.compact ? '.compact' : ''), null, o.compact ? null : status, o.compact ? null : bat,
      h('div.actrow', null, startPause, btn(t('d.dock'), 'home', function () { svc(ctx, item, 'vacuum', 'return_to_base').catch(noop); }), o.compact ? null : btn(t('d.locate'), 'search', function () { svc(ctx, item, 'vacuum', 'locate').catch(noop); })));
    return { el: root, dispose: noop, update: function (st) {
      status.textContent = L.stateLabel(st.state, ctx.lang());
      bat.textContent = st.attributes.battery_level != null ? t('d.battery') + ' ' + st.attributes.battery_level + '%' : '';
      var cl = st.state === 'cleaning';
      startPause.innerHTML = UI.icon(cl ? 'pause' : 'play', 20) + '<span>' + (cl ? t('d.pause') : t('d.start')) + '</span>';
    } };
  };

  // ---------------------------------------------------------- run buttons ----
  function runControl(ctx, item, o, label, service, domain) {
    var t = T(ctx);
    var b = h('button.runbig', { onclick: function () { svc(ctx, item, domain, service).then(function () { ctx.toast('success', item.name); }).catch(noop); } }, h('span', { html: UI.icon('play', 32) }), h('span', null, label));
    return { el: h('div.dctl', null, h('div.dwrap', null, b)), dispose: noop, update: noop };
  }
  D.scene = function (ctx, item, o) { return runControl(ctx, item, o, T(ctx)('d.run'), 'turn_on', 'scene'); };
  D.script = function (ctx, item, o) { return runControl(ctx, item, o, T(ctx)('d.run'), 'turn_on', 'script'); };
  D.button = function (ctx, item, o) { return runControl(ctx, item, o, T(ctx)('d.run'), 'press', item.domain); };   // button.press or input_button.press
  D.input_button = D.button;
  D.automation = function (ctx, item, o) {
    var t = T(ctx), tg = toggleControl(ctx, item, o, 'bolt');
    var trig = btn(t('d.trigger'), 'play', function () { svc(ctx, item, 'automation', 'trigger').then(function () { ctx.toast('success', item.name); }).catch(noop); });
    tg.el.appendChild(trig);
    return tg;
  };

  // --------------------------------------------------------------- camera ----
  D.camera = function (ctx, item) {
    var CM = g.OkieMotor.cameras;
    if (CM && CM.liveView) { var lv = CM.liveView(ctx, item.id); return { el: h('div.dctl', null, lv.el), dispose: lv.dispose, update: lv.update }; }      // Home Assistant's live picture; the snapshot below is the fallback
    var t = T(ctx), hs = ctx.hass(), img = h('img.cam', { alt: item.name, draggable: false }), none = h('div.lbl', { hidden: true }, t('d.no_picture'));
    var timer = 0;
    function refresh() {
      var st = ctx.state(item.id); if (!st) return;
      var pic = st.attributes.entity_picture;
      if (!pic) { img.hidden = true; none.hidden = false; return; }
      var url = hs.hassUrl ? hs.hassUrl(pic) : pic;
      img.src = url + (url.indexOf('?') > 0 ? '&' : '?') + '_t=' + Date.now();
      img.hidden = false; none.hidden = true;
    }
    timer = setInterval(refresh, 10000);
    return { el: h('div.dctl', null, img, none), dispose: function () { clearInterval(timer); }, update: function (st) { if (!img.src) refresh(); } };
  };

  // -------------------------------------------------- alarm control panel ----
  D.alarm_control_panel = function (ctx, item) {
    var t = T(ctx), a0 = attrs(ctx, item.id), needCode = !!a0.code_format;
    var code = needCode ? h('input.codein', { type: 'password', inputmode: 'numeric', placeholder: t('d.code'), autocomplete: 'off', 'aria-label': t('d.code') }) : null;
    function go(service) { return function () { svc(ctx, item, 'alarm_control_panel', service, needCode ? { code: code.value } : {}).catch(noop); }; }
    var stateEl = h('div.bigval');
    var root = h('div.dctl', null, stateEl, code, h('div.actrow', null, btn(t('d.arm_home'), 'home', go('alarm_arm_home')), btn(t('d.arm_away'), 'shield', go('alarm_arm_away')), btn(t('d.arm_night'), 'moon', go('alarm_arm_night')), btn(t('d.disarm'), 'unlock', go('alarm_disarm'), 'danger')));
    return { el: root, dispose: noop, update: function (st) { stateEl.textContent = L.stateLabel(st.state, ctx.lang()); } };
  };

  // -------------------------------------------------------------- sensors ----
  D.sensor = function (ctx, item, o) {
    var big = h('div.bigval'), unit = h('span.unit'), lbl = h('div.lbl'), spark = h('div.spark');
    var root = h('div.dctl', null, h('div.bigrow', null, big, unit), lbl, o.compact ? null : spark);
    var loaded = false;
    function loadSpark() {
      if (loaded || o.compact || !g.OkieMotor.detail || !g.OkieMotor.detail.sparkline) return;
      loaded = true; g.OkieMotor.detail.sparkline(ctx, item.id, spark);
    }
    return { el: root, dispose: noop, update: function (st) {
      var v = parseFloat(st.state);
      big.textContent = isNaN(v) ? st.state : String(Math.round(v * 10) / 10).replace('.', ctx.lang() === 'de' ? ',' : '.');
      unit.textContent = st.attributes.unit_of_measurement || '';
      var age = Date.now() - Date.parse(st.last_updated || st.last_changed || Date.now());
      lbl.textContent = core.t('d.updated', ctx.lang(), { t: L.relativeTime(age, ctx.lang()) });
      loadSpark();
    } };
  };
  D.binary_sensor = function (ctx, item, o) {
    if (!(o && o.compact) && g.OkieMotor.sensors && g.OkieMotor.sensors.control) return g.OkieMotor.sensors.control(ctx, item, o || {});      // the sensor screen (okie-sensors)
    var big = h('div.bigval'), lbl = h('div.lbl');
    return { el: h('div.dctl', null, big, lbl), dispose: noop, update: function (st) {
      var dc = st.attributes.device_class, on = st.state === 'on';
      var words = { door: ['Closed', 'Open'], window: ['Closed', 'Open'], garage_door: ['Closed', 'Open'], motion: ['Clear', 'Motion'], occupancy: ['Clear', 'Occupied'], smoke: ['Clear', 'Smoke'], moisture: ['Dry', 'Wet'], presence: ['Away', 'Present'], opening: ['Closed', 'Open'], lock: ['Locked', 'Unlocked'] }[dc];
      big.textContent = words ? words[on ? 1 : 0] : L.stateLabel(st.state, ctx.lang());
      var age = Date.now() - Date.parse(st.last_changed || Date.now());
      lbl.textContent = L.relativeTime(age, ctx.lang());
    } };
  };

  // -------------------------------------------------------------- weather ----
  D.weather = function (ctx, item) {
    if (arguments[2] && arguments[2].wx) { var wxs = arguments[2].wx; return { el: wxs.body, dispose: noop, update: function () { wxs.update(); } }; }      // the weather screen (okie-weather): page 2 is this tab
    var t = T(ctx), temp = h('div.bigval'), cond = h('div.lbl'), extra = h('div.lbl'), fc = h('div.fcrow');
    var fetched = false;
    function load() {
      if (fetched) return; fetched = true;
      ctx.callWS({ type: 'call_service', domain: 'weather', service: 'get_forecasts', target: { entity_id: item.id }, service_data: { type: 'daily' }, return_response: true }).then(function (r) {
        var list = (((r && r.response) || {})[item.id] || {}).forecast || [];
        fc.innerHTML = '';
        list.slice(0, 7).forEach(function (d) {
          var day = new Date(d.datetime).toLocaleDateString(ctx.lang(), { weekday: 'short' });
          fc.appendChild(h('div.fcd', null, h('div.fcdn', null, day), h('span', { html: UI.icon(UI.domainIcon('weather', null, d.condition), 22) }), h('div.fct', null, Math.round(d.temperature) + '°', d.templow != null ? h('span.lo', null, ' ' + Math.round(d.templow) + '°') : null)));
        });
      }, function () {});
    }
    return { el: h('div.dctl', null, temp, cond, extra, fc), dispose: noop, update: function (st) {
      var a = st.attributes;
      temp.textContent = a.temperature != null ? Math.round(a.temperature) + '°' : '–';
      cond.textContent = ctx.formatState(st);
      extra.textContent = [a.humidity != null ? t('d.humidity') + ' ' + a.humidity + '%' : null, a.wind_speed != null ? t('d.wind') + ' ' + Math.round(a.wind_speed) + ' ' + (a.wind_speed_unit || '') : null].filter(Boolean).join(' · ');
      load();
    } };
  };

  // -------------------------------------------------------------- default ----
  D._default = function (ctx, item) {
    var big = h('div.bigval'), list = h('div.kv');
    return { el: h('div.dctl', null, big, list), dispose: noop, update: function (st) {
      big.textContent = L.describeState(item.domain, st, ctx.lang());
      list.innerHTML = '';
      Object.keys(st.attributes).filter(function (k) { return ['friendly_name', 'icon', 'entity_picture', 'supported_features', 'attribution'].indexOf(k) < 0 && typeof st.attributes[k] !== 'object'; }).slice(0, 10)
        .forEach(function (k) { list.appendChild(h('div.kvr', null, h('span', null, k.replace(/_/g, ' ')), h('b', null, String(st.attributes[k])))); });
    } };
  };

  function forItem(domain) { return D[domain] || D._default; }

  var CSS = [
    '.dctl{display:flex;flex-direction:column;align-items:center;gap:18px;width:100%;}',
    '.dctl.compact{align-items:stretch;gap:10px;}',
    '.rangebox{display:flex;flex-direction:column;gap:12px;min-width:240px;}.rr{display:flex;align-items:center;gap:12px;}.rr span{width:40px;color:var(--okie-text-dim);font-size:13px;}.rv{min-width:70px;text-align:center;font-size:26px;font-weight:300;}',
    '.dwrap{display:flex;align-items:center;justify-content:center;gap:28px;flex-wrap:wrap;}',
    '.crow{display:flex;align-items:center;gap:10px;}',
    '.crow .power{width:48px;height:48px;}.crow .power svg{width:22px;height:22px;}',
    '.lbl{font-size:12px;color:var(--okie-text-dim);text-transform:uppercase;letter-spacing:.08em;align-self:flex-start;}',
    '.dial-extra{font-size:14px;color:var(--okie-text-dim);}',
    '.actrow{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}.actrow.center{align-items:center;}',
    '.act{display:inline-flex;align-items:center;gap:8px;padding:12px 18px;border-radius:9999px;background:rgba(255,255,255,.12);font-size:14px;font-weight:600;}',
    '.act:hover{background:rgba(255,255,255,.2);}.act.danger{background:rgba(239,77,58,.28);}',
    '.tr{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);}.tr.big{width:68px;height:68px;background:#fff;color:#1d1b19;}',
    // the TV remote
    '.src-selw{position:relative;align-self:stretch;}.src-sel{-webkit-appearance:none;appearance:none;width:100%;height:52px;border-radius:16px;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.12);color:#fff;font:inherit;font-size:16px;font-weight:600;padding:0 46px 0 18px;text-overflow:ellipsis;outline:none;}.src-sel:focus-visible{box-shadow:0 0 0 2px rgba(255,255,255,.7);}.src-sel option{color:#1d1b19;}.src-chev{position:absolute;right:16px;top:50%;transform:translateY(-50%);pointer-events:none;color:rgba(255,255,255,.8);display:grid;}',
    '.rmt{display:flex;flex-direction:column;gap:7px;width:100%;max-width:290px;align-self:center;}.rmb{display:flex;flex-direction:column;align-items:stretch;gap:7px;}',
    '.rm-top{display:flex;justify-content:center;}.power.rm-power{width:44px;height:44px;}.power.rm-power svg{width:21px;height:21px;}',
    '.rm2{display:grid;grid-template-columns:1fr 1fr;gap:7px;}.rm3{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;}.rapps{display:grid;grid-template-columns:1fr 1fr;gap:7px;}.rapps[hidden]{display:none;}',
    '.rk{height:38px;border-radius:15px;background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.12);color:#fff;font-size:13px;font-weight:600;display:flex;align-items:center;justify-content:center;gap:6px;padding:0 6px;touch-action:manipulation;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;transition:background .12s ease;}',
    '.rk:active{background:rgba(255,255,255,.28);}.rk[disabled]{opacity:.4;pointer-events:none;}',
    '.rdpad{display:grid;grid-template-columns:repeat(3,50px);gap:4px;justify-content:center;justify-items:center;align-items:center;margin:2px 0;}.rdpad .rk{width:50px;height:50px;border-radius:50%;padding:0;}.rk.ok{background:#fff;color:#1d1b19;border-color:#fff;}.rk.ok:active{background:rgba(255,255,255,.8);}',
    '.dctl.tv .mp{display:none;}.dctl.tv .rmx{flex:1 0 auto;}',
    '@media (max-width:640px){.dctl.tv{min-height:100%;box-sizing:border-box;}.dctl.tv .rmt{flex:1 0 auto;max-width:340px;}.dctl.tv .rmb{flex:1;justify-content:space-between;}.dctl.tv .rk{height:46px;}.dctl.tv .rdpad{grid-template-columns:repeat(3,58px);}.dctl.tv .rdpad .rk{width:58px;height:58px;}}',      // a phone: the remote takes the whole height under the picture
    '.rm-note{font-size:13px;color:#ffd990;background:rgba(255,176,32,.14);border-radius:14px;padding:10px 12px;text-align:center;}.rm-note[hidden]{display:none;}',
    '.stp{width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.14);display:grid;place-items:center;}.cval{min-width:60px;text-align:center;font-size:20px;font-weight:600;}',
    '.dwrap.cov{align-items:stretch;gap:36px;}.covside{display:flex;flex-direction:column;justify-content:center;gap:18px;align-items:flex-start;}',
    '.bigval{font-size:64px;font-weight:300;letter-spacing:-.03em;line-height:1.05;}.bigrow{display:flex;align-items:baseline;gap:8px;}.unit{font-size:24px;color:var(--okie-text-dim);}',
    '.lockbig{position:relative;width:150px;height:150px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);transition:background .2s,color .2s;}',
    '.lockbig.on{background:#fff;color:#1d1b19;}.lockbig .ring{position:absolute;inset:-4px;width:calc(100% + 8px);height:calc(100% + 8px);pointer-events:none;}',
    '.lk-lbl{font-size:18px;font-weight:600;}',
    '.runbig{display:flex;align-items:center;gap:12px;padding:22px 36px;border-radius:9999px;background:#fff;color:#1d1b19;font-size:20px;font-weight:700;}',
    '.mp{display:flex;gap:18px;align-items:center;align-self:stretch;}.art{width:132px;height:132px;border-radius:20px;background:rgba(255,255,255,.1) center/cover;flex:none;}.mp-meta{min-width:0;}.mp-title{font-size:22px;font-weight:600;}.mp-sub{color:var(--okie-text-dim);margin-top:4px;}',
    '.cam{width:100%;max-height:380px;object-fit:cover;border-radius:22px;background:rgba(0,0,0,.3);}',
    '.codein{padding:14px 18px;border-radius:9999px;background:rgba(255,255,255,.12);border:0;font-size:18px;text-align:center;width:200px;}',
    '.fcrow{display:flex;gap:10px;flex-wrap:wrap;justify-content:center;}.fcd{display:flex;flex-direction:column;align-items:center;gap:6px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.1);min-width:70px;}.fcdn{font-size:13px;color:var(--okie-text-dim);}.fct{font-weight:600;}.lo{color:var(--okie-text-dim);font-weight:400;}',
    '.kv{display:flex;flex-direction:column;gap:6px;align-self:stretch;}.kvr{display:flex;justify-content:space-between;gap:12px;padding:8px 14px;border-radius:12px;background:rgba(255,255,255,.07);font-size:14px;}.kvr span{color:var(--okie-text-dim);text-transform:capitalize;}',
    '.spark{align-self:stretch;}.climx{display:flex;flex-direction:column;gap:14px;align-self:stretch;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  /** Whether the Controls of this device are the big wheel (a thermostat, a dimmable light): the detail view then lets the wheel run edge to edge. */
  function usesDial(ctx, item) { return item.domain === 'climate' || (item.domain === 'light' && lightDimmable(ctx, item.id) && !!(g.OkieMotor.thermo && g.OkieMotor.thermo.create)); }
  g.OkieMotor.domains = { factories: D, forItem: forItem, svc: svc, climateExtras: climateExtras, usesDial: usesDial, CSS: CSS };
})(typeof globalThis !== 'undefined' ? globalThis : window);

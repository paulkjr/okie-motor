/* okie-island: the status row. A values capsule on the left (weather, power), an
 * orb on the right. Tap the orb and it morphs into a centred summary capsule;
 * tap that and it opens the list: severity selector, source tabs, rows with
 * snooze and dismiss, live activities, and a link to the notification center.
 * Idle folds it back (30 s to the capsule, a minute more to the orb).
 * The pure parts (levels, summaries, live activities) are unit-tested.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var core = isNode ? require('./okie-core.js') : g.OkieMotor.core;
  var L = isNode ? require('./okie-logic.js') : g.OkieMotor.logic;

  var LEVELS = ['critical', 'warning', 'info', 'live'];             // the four steps of the selector
  var COLOR = { critical: 'rgb(255,59,48)', warning: 'rgb(255,159,10)', info: 'rgb(10,132,255)', live: 'rgb(52,199,89)' };

  /** Counts per level for the capsule/orb; `live` counts running activities. */
  function levelCounts(notes, live) {
    var c = { critical: 0, warning: 0, info: 0, live: (live || []).length };
    (notes || []).forEach(function (n) { if (c[n.severity] != null) c[n.severity]++; });
    return c;
  }
  /** The level the panel opens on: the most severe one that has something, else info. */
  function startLevel(counts) { for (var i = 0; i < 3; i++) if (counts[LEVELS[i]]) return LEVELS[i]; return counts.live ? 'live' : 'info'; }
  /** Badge colour of the orb follows the worst notification (running activities do not badge). */
  function badgeLevel(counts) { return counts.critical ? 'critical' : (counts.warning ? 'warning' : (counts.info ? 'info' : null)); }
  function badgeCount(counts) { return counts.critical + counts.warning + counts.info; }
  /** Up to three overlapping circles in the capsule: one per level present, worst first. */
  function stack(counts) { var out = []; ['critical', 'warning', 'info'].forEach(function (k) { if (counts[k]) out.push(k); }); return out.slice(0, 3); }

  /**
   * Live activities from states: timers, vacuums, media, moving covers, running scripts.
   * opts.enabled: { timers, vacuums, covers, media, scripts, automations, climate, lights, switches }
   */
  function liveActivities(items, states, opts) {
    var en = (opts && opts.enabled) || { timers: 1, vacuums: 1, covers: 1, media: 1, scripts: 1 };
    var out = [];
    items.forEach(function (it) {
      var st = states[it.id]; if (!st) return;
      var s = st.state, d = it.domain;
      if (d === 'timer' && en.timers && s === 'active') out.push({ id: it.id, kind: 'timers', icon: 'clock', name: it.name, value: (st.attributes && st.attributes.remaining) || '' });
      else if (d === 'vacuum' && en.vacuums && (s === 'cleaning' || s === 'returning')) out.push({ id: it.id, kind: 'vacuums', icon: 'vacuum', name: it.name, value: s });
      else if (d === 'media_player' && en.media && s === 'playing') out.push({ id: it.id, kind: 'media', icon: 'speaker', name: it.name, value: (st.attributes && st.attributes.media_title) || s });
      else if (d === 'cover' && en.covers && (s === 'opening' || s === 'closing')) out.push({ id: it.id, kind: 'covers', icon: 'blinds', name: it.name, value: s });
      else if (d === 'script' && en.scripts && s === 'on') out.push({ id: it.id, kind: 'scripts', icon: 'script', name: it.name, value: '' });
      else if (d === 'climate' && en.climate && (s === 'heat' || s === 'cool')) out.push({ id: it.id, kind: 'climate', icon: 'thermostat', name: it.name, value: s });
      else if (d === 'light' && en.lights && s === 'on') out.push({ id: it.id, kind: 'lights', icon: 'bulb', name: it.name, value: '' });
      else if (d === 'switch' && en.switches && s === 'on') out.push({ id: it.id, kind: 'switches', icon: 'toggle', name: it.name, value: '' });
    });
    out.forEach(function (a) { var st = states[a.id]; a.changedAt = Date.parse((st && (st.last_changed || st.last_updated)) || '') || 0; });
    return out;
  }
  /** The strongest power sensor (about the whole house) when no entity is configured. */
  function autoPower(items, states) {
    var best = null, bv = -1;
    items.forEach(function (it) {
      if (it.domain !== 'sensor' || it.deviceClass !== 'power') return;
      var v = parseFloat((states[it.id] || {}).state);
      if (!isNaN(v) && v > bv) { bv = v; best = it; }
    });
    return best ? best.id : null;
  }
  function fmtPower(value, unit) {
    var v = parseFloat(value); if (isNaN(v)) return String(value);
    if (unit === 'W' && v >= 1000) return (Math.round(v / 100) / 10) + ' kW';
    return (Math.round(v * 10) / 10) + ' ' + (unit || '');
  }
  /** Dismissed/snoozed notes stay hidden: dismiss until the id changes, snooze until a time. */
  function visibleNotes(notes, hidden, now) {
    return notes.filter(function (n) { var h = hidden[n.id]; return !h || (h.until && h.until <= now); });
  }

  // ---------------------------------------------------- FSC's island rules ----
  /** Groups the "N lights on" ticker uses (FSC: domain -> group), in FSC's order. */
  var GROUP_OF = { light: 'lights', switch: 'switches', climate: 'climate', fan: 'climate', humidifier: 'climate', cover: 'covers', media_player: 'media', vacuum: 'cleaning', dishwasher: 'cleaning', washing_machine: 'cleaning', air_purifier: 'cleaning', camera: 'security', lock: 'security', siren: 'security', alert: 'security', alarm_control_panel: 'security', valve: 'utilities' };
  var GROUPS = ['lights', 'switches', 'climate', 'covers', 'media', 'cleaning', 'security', 'utilities'];
  var GROUP_ICON = { lights: 'bulb', switches: 'toggle', climate: 'thermostat', covers: 'blinds', media: 'speaker', cleaning: 'vacuum', security: 'lock', utilities: 'toggle' };
  var GROUP_TEXT = {
    lights: { en: function (n) { return n + (n === 1 ? ' light' : ' lights') + ' on'; }, de: function (n) { return n + (n === 1 ? ' Licht' : ' Lichter') + ' an'; } },
    switches: { en: function (n) { return n + (n === 1 ? ' switch' : ' switches') + ' on'; }, de: function (n) { return n + ' Schalter an'; } },
    climate: { en: function (n) { return n + ' climate active'; }, de: function (n) { return n + ' Klima aktiv'; } },
    covers: { en: function (n) { return n + (n === 1 ? ' cover' : ' covers') + ' open'; }, de: function (n) { return n + (n === 1 ? ' Rollo' : ' Rollos') + ' offen'; } },
    media: { en: function (n) { return n + ' media active'; }, de: function (n) { return n + ' Medien aktiv'; } },
    cleaning: { en: function (n) { return n + ' cleaning active'; }, de: function (n) { return n + ' Reinigung aktiv'; } },
    security: { en: function (n) { return n + ' security active'; }, de: function (n) { return n + ' Sicherheit aktiv'; } },
    utilities: { en: function (n) { return n + ' active'; }, de: function (n) { return n + ' aktiv'; } },
  };
  var GROUP_NAME = {
    lights: { en: 'Lights', de: 'Lichter' }, switches: { en: 'Switches', de: 'Schalter' }, climate: { en: 'Climate', de: 'Klima' }, covers: { en: 'Covers', de: 'Rollos' },
    media: { en: 'Media', de: 'Medien' }, cleaning: { en: 'Cleaning', de: 'Reinigung' }, security: { en: 'Security', de: 'Sicherheit' }, utilities: { en: 'Utilities', de: 'Sonstiges' },
    scripts: { en: 'Scripts', de: 'Skripte' }, automations: { en: 'Automations', de: 'Automationen' }, scenes: { en: 'Scenes', de: 'Szenen' }, timer: { en: 'Timers', de: 'Timer' },
  };
  function groupOf(item, st) { return (item.domain === 'fan' && st && st.attributes && st.attributes.device_class === 'air_purifier') ? 'cleaning' : (GROUP_OF[item.domain] || null); }
  /** Is this device "on" for the ticker? */
  function groupActive(item, state) {
    var d = item.domain, s = state;
    if (s === 'unavailable' || s === 'unknown') return false;
    switch (d) {
      case 'light': case 'switch': case 'fan': case 'humidifier': case 'siren': case 'alert': return s === 'on';
      case 'climate': return s !== 'off';
      case 'cover': return s === 'open' || s === 'opening' || s === 'closing';
      case 'media_player': return s === 'playing' || s === 'on';
      case 'vacuum': return s === 'cleaning' || s === 'returning';
      case 'dishwasher': case 'washing_machine': case 'air_purifier': return s === 'on' || s === 'running';
      case 'lock': return s === 'unlocked' || s === 'unlocking' || s === 'open';
      case 'alarm_control_panel': return /^armed|triggered|arming|pending/.test(s);
      case 'camera': return s === 'recording' || s === 'streaming';
      case 'valve': return s === 'open' || s === 'opening';
    }
    return false;
  }
  /** The rolling "3 lights on" list: one entry per group that has active devices, in FSC's order. */
  function rollList(items, states, lang) {
    var l = lang === 'de' ? 'de' : 'en', counts = {};
    (items || []).forEach(function (it) {
      var st = states[it.id]; if (!st) return;
      var grp = groupOf(it, st); if (!grp || !GROUP_TEXT[grp]) return;
      if (groupActive(it, st.state)) counts[grp] = (counts[grp] || 0) + 1;
    });
    return GROUPS.filter(function (k) { return counts[k] > 0; }).map(function (k) { return { key: k, label: GROUP_TEXT[k][l](counts[k]), count: counts[k], icon: GROUP_ICON[k] }; });
  }
  /** Tabs of the live list: "All" plus one per group present. */
  function liveTabs(acts, lang) {
    var l = lang === 'de' ? 'de' : 'en', c = {};
    acts.forEach(function (a) { var k = a.group || 'utilities'; c[k] = (c[k] || 0) + 1; });
    var keys = GROUPS.filter(function (k) { return c[k]; }).concat(Object.keys(c).filter(function (k) { return GROUPS.indexOf(k) < 0; }).sort());
    if (!keys.length) return [];
    return [{ key: 'all', label: l === 'de' ? 'Alle' : 'All', count: acts.length }].concat(keys.map(function (k) { return { key: k, label: (GROUP_NAME[k] || {})[l] || k, count: c[k] }; }));
  }
  /** "2 warnings" / "1 critical" / "3 infos" (FSC's wording). */
  function severityText(level, n, lang) {
    if (lang === 'de') return level === 'critical' ? (n === 1 ? '1 Kritisch' : n + ' Kritische') : (level === 'warning' ? (n === 1 ? '1 Warnung' : n + ' Warnungen') : (n === 1 ? '1 Info' : n + ' Infos'));
    return level === 'critical' ? n + ' critical' : (level === 'warning' ? (n === 1 ? '1 warning' : n + ' warnings') : (n === 1 ? '1 info' : n + ' infos'));
  }
  /** The width FSC gives the pill: capsule (text-driven), expanded panel, or clamped to the room it has. */
  function pillWidth(o) {
    var Fe = o.mobile ? 28 : 30, Ie = 4 * Fe + 16, ze = o.mobile ? 130 : 190;
    var Pe = 3 * Fe - 24 + 16 + 10 + (o.textW || 100) + 30 + 18 + 2;
    var Be = Math.max(46 + ze + 12 + Ie + 2, 470);
    var He = o.mobile ? (o.expanded ? 390 : Math.min(390, Pe)) : (o.expanded ? Be : Pe);
    return o.room > 60 ? Math.min(He, o.room) : He;
  }
  /** The stage the pill starts in: the lock page (and deep rest) show the button, a quiet page the capsule. */
  function startStadium(locked, deep) { return locked ? (deep ? 'knopf' : 'mini') : 'knopf'; }

  var api = { LEVELS: LEVELS, levelCounts: levelCounts, startLevel: startLevel, badgeLevel: badgeLevel, badgeCount: badgeCount, stack: stack, liveActivities: liveActivities, autoPower: autoPower, fmtPower: fmtPower, visibleNotes: visibleNotes, COLOR: COLOR, rollList: rollList, liveTabs: liveTabs, severityText: severityText, pillWidth: pillWidth, startStadium: startStadium, groupOf: groupOf, GROUPS: GROUPS };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------- UI ----
  var UI = g.OkieMotor.ui, h = UI.h;
  core.registerStrings('en', {
    'isl.notifications': '{n} notifications', 'isl.notification': '1 notification', 'isl.none': 'No notifications', 'isl.all': 'All', 'isl.center': 'Open notification center', 'isl.all_acts': 'Open all activities',
    'isl.snooze': 'Remind me later', 'isl.dismiss': 'Done', 'isl.close': 'Close', 'isl.open': 'Open notifications', 'isl.empty': 'Nothing in this selection', 'isl.quiet': 'All quiet', 'isl.new': 'New notification', 'isl.done_word': 'done',
    'isl.level.critical': 'Critical', 'isl.level.warning': 'Warnings', 'isl.level.info': 'Info', 'isl.level.live': 'Show running', 'isl.open_island': 'Open island',
    'isl.src.home-assistant': 'Notice', 'isl.src.safety': 'Sensor', 'isl.src.battery': 'Battery', 'isl.src.system': 'System',
  });
  core.registerStrings('de', {
    'isl.notifications': '{n} Mitteilungen', 'isl.notification': '1 Mitteilung', 'isl.none': 'Keine Mitteilungen', 'isl.all': 'Alle', 'isl.center': 'Mitteilungszentrale öffnen', 'isl.all_acts': 'Alle Aktivitäten öffnen',
    'isl.snooze': 'Später erinnern', 'isl.dismiss': 'Erledigt', 'isl.close': 'Schließen', 'isl.open': 'Mitteilungen öffnen', 'isl.empty': 'Nichts in dieser Auswahl', 'isl.quiet': 'Alles ruhig', 'isl.new': 'Neue Meldung', 'isl.done_word': 'fertig',
    'isl.level.critical': 'Kritische Meldungen', 'isl.level.warning': 'Warnungen', 'isl.level.info': 'Hinweise', 'isl.level.live': 'Laufendes anzeigen', 'isl.open_island': 'Insel öffnen',
    'isl.src.home-assistant': 'Hinweis', 'isl.src.safety': 'Sensor', 'isl.src.battery': 'Batterie', 'isl.src.system': 'System',
  });

  var CSS = [
    '@keyframes island-panel-ein{0%{filter:blur(14px);opacity:0;transform:scale(.965);}100%{filter:blur(0);opacity:1;transform:scale(1);}}',
    '@keyframes island-ring{to{stroke-dashoffset:40.84;}}@keyframes island-band{to{transform:translate(var(--island-bandweg,-100%));}}',
    '@keyframes isl-in{from{opacity:0;transform:translateY(-9px);filter:blur(3px);}to{opacity:1;transform:none;filter:blur(0);}}@keyframes isl-out{from{opacity:1;transform:none;filter:blur(0);}to{opacity:0;transform:translateY(8px);filter:blur(3px);}}',
    '@keyframes isl-char{from{opacity:0;transform:translateY(11px);}to{opacity:1;transform:none;}}',
    '.statsbar-bento-wrapper{min-height:60px;position:relative;}',
    '.stage .island-holder{animation:zen-fade-in .8s var(--zen-ease) 704ms backwards;position:relative;transform:translateY(var(--zen-island-y,220px));transition:transform .62s var(--zen-ease) 90ms;z-index:2;}',
    '.stage[data-zen-revealed="true"] .island-holder{transform:translateY(0);}',
    '.stage[data-ambient="tief"] .island-anchor[data-stadium="knopf"]{justify-content:center;}.stage[data-ambient="tief"] .island-anchor[data-stadium="knopf"] .island-wertekapsel{display:none;}',
    '.island-pill{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;}',
    '.island-pill.glass-panel{border-radius:34px!important;transition:width .46s cubic-bezier(.34,1.18,.24,1),min-height .46s cubic-bezier(.34,1.18,.24,1),padding .46s cubic-bezier(.34,1.18,.24,1),border-radius .46s cubic-bezier(.34,1.18,.24,1),transform .42s cubic-bezier(.34,1.18,.24,1),opacity .24s ease,box-shadow .4s ease;}',
    '.island-pill[data-wischt="ja"]{transition:none;}',
    '.island-pill.glass-panel[data-thema="dunkel"],.island-pill.glass-panel[data-thema="hell"]{color:#fff;--island-tinte:hsla(0,0%,100%,.95);--island-gegentinte:#1d1d1f;--island-ink-soft:hsla(0,0%,100%,.6);--island-fach:hsla(0,0%,100%,.1);--island-fach2:hsla(0,0%,100%,.16);--island-strich:hsla(0,0%,100%,.14);--island-feld-grund:rgba(0,0,0,.25);}',
    '.island-wertekapsel{color:#fff;}.island-pill.glass-panel::before{border-radius:inherit;}',
    '.island-pill.glass-panel{-webkit-backdrop-filter:var(--glass-backdrop);backdrop-filter:var(--glass-backdrop);background:var(--glass-tint-bg)!important;}.island-pill.glass-panel::before{-webkit-backdrop-filter:none;backdrop-filter:none;background:none;}',
    '.island-pill.glass-panel[data-ruhe="alert"]{border-radius:999px!important;min-height:var(--island-mini-h,44px)!important;overflow:visible;padding:0!important;width:var(--island-mini-h,44px)!important;}',
    '.island-pill[data-ruhe="alert"] .island-head{display:none;}',
    '.island-ruheknopf{align-items:center;cursor:pointer;display:flex;height:var(--island-mini-h,44px);justify-content:center;position:relative;touch-action:manipulation;width:100%;}.island-ruheknopf .island-eck{right:-3px;top:-3px;}',
    '.island-anchor{transition:transform .52s cubic-bezier(.34,1.18,.24,1);align-items:flex-start;display:inline-flex;overflow:visible;pointer-events:auto;position:relative;}.island-anchor[data-ruhe="alert"]{transform:none;}',
    '.island-holder{pointer-events:none;position:relative;z-index:2;}.island-holder:not([data-appeared="true"]) .island-pill.glass-panel,.island-holder:not([data-appeared="true"]) .island-wertekapsel{opacity:0;}',
    '.island-anchor[data-stadium="knopf"]{justify-content:space-between;width:100%;}.island-anchor:not([data-stadium="knopf"]){justify-content:center;}',
    '.island-wertekapsel{align-items:center;-webkit-backdrop-filter:var(--glass-backdrop);backdrop-filter:var(--glass-backdrop);background:var(--glass-tint-bg);border-radius:34px;box-shadow:0 8px 32px rgba(0,0,0,.12);display:flex;flex:0 0 auto;font-size:var(--island-schrift,14.5px);font-variant-numeric:tabular-nums;font-weight:650;gap:12px;height:var(--island-mini-h,44px);letter-spacing:-.01em;padding:0 16px;transition:opacity .26s ease,transform .42s cubic-bezier(.34,1.18,.24,1);white-space:nowrap;}',
    '.island-anchor:not([data-stadium="knopf"]) .island-wertekapsel{left:0;opacity:0;pointer-events:none;position:absolute;transform:scale(.94) translate(-8px);}',
    '.island-wertekapsel .island-wert{align-items:center;display:inline-flex;gap:6px;}.island-wertekapsel svg,.island-wsymbol{flex:0 0 auto;height:15px;opacity:.75;width:15px;}',
    '.island-pill .island-head:active{transform:none;}',
    '.island-head{align-items:center;background:none;border:none;color:inherit;cursor:pointer;display:flex;flex-direction:row;flex-shrink:0;font:inherit;gap:0;min-height:var(--island-h,64px);min-width:0;padding:0 10px;text-align:left;touch-action:manipulation;width:100%;}',
    '.island-zeile1{display:flex;flex:0 0 auto;font-weight:650;gap:10px;min-width:0;white-space:nowrap;}.island-zeile1,.island-zeile2{align-items:center;font-size:var(--island-schrift,12.5px);line-height:1.15;overflow:hidden;}',
    '.island-zeile2{display:grid;font-weight:500;height:22px;opacity:.55;transition:height .32s cubic-bezier(.34,1.18,.24,1),opacity .2s ease;}.island-z1-roll{align-items:center;display:inline-flex;gap:10px;min-width:0;}',
    '.island-eck{background:#ff3b30;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,.25);color:#fff;display:grid;font-size:11px;font-style:normal;font-variant-numeric:tabular-nums;font-weight:700;height:17px;min-width:17px;padding:0 4px;place-items:center;position:absolute;right:-3px;top:-3px;}',
    '.island-eck--amber{background:#ff9f0a;}.island-eck--blau{background:#0a84ff;}.island-eck--rot{background:#ff3b30;}',
    '.island-ring{animation-fill-mode:forwards;animation-name:island-ring;animation-timing-function:linear;}',
    '.island-list-shell{display:grid;grid-template-rows:0fr;transition:grid-template-rows .46s cubic-bezier(.32,1.18,.42,1);}.island-list-shell>div{overflow:hidden;}.island-list-shell[data-open="true"]{grid-template-rows:1fr;}',
    '.island-liste{display:flex;flex-direction:column;min-height:0;}',
    '.island-list-reiter{display:flex;flex-shrink:0;gap:6px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding:8px 10px 2px;}.island-list-reiter::-webkit-scrollbar{display:none;}',
    '.island-list-reiter-knopf{align-items:center;background:var(--island-fach,rgba(0,0,0,.06));border-radius:14px;color:var(--island-tinte,rgba(29,29,31,.7));cursor:pointer;display:inline-flex;flex-shrink:0;font-size:13px;font-weight:600;gap:6px;letter-spacing:-.01em;padding:6px 12px;transition:background .2s ease,color .2s ease,transform .18s ease;white-space:nowrap;}',
    '.island-list-reiter-knopf:hover{background:var(--island-fach2,rgba(0,0,0,.1));transform:scale(1.03);}.island-list-reiter-knopf:active{transform:scale(.96);}.island-list-reiter-knopf.is-active{background:var(--island-tinte,rgba(29,29,31,.9));color:var(--island-gegentinte,#fff);}',
    '.island-list-reiter-zahl{background:var(--island-fach,rgba(0,0,0,.08));border-radius:7px;color:var(--island-ink-soft,rgba(29,29,31,.65));font-size:11px;font-style:normal;font-variant-numeric:tabular-nums;font-weight:500;line-height:14px;min-width:16px;padding:0 5px;text-align:center;}.island-list-reiter-knopf.is-active .island-list-reiter-zahl{background:rgba(255,255,255,.22);color:rgba(255,255,255,.9);}',
    '.island-list-flaeche{border-top:1px solid var(--island-strich,rgba(29,29,31,.12));display:flex;margin-top:8px;min-height:0;padding-top:8px;position:relative;}',
    '.island-list{display:flex;flex-direction:column;height:236px;-webkit-mask-image:linear-gradient(180deg,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(180deg,#000 calc(100% - 24px),transparent);overflow-y:auto;padding:0 0 2px;scrollbar-width:none;width:100%;}.island-list::-webkit-scrollbar{display:none;}',
    '.island-list.is-scrolling{-webkit-mask-image:linear-gradient(180deg,transparent 0,#000 24px,#000 calc(100% - 24px),transparent);mask-image:linear-gradient(180deg,transparent 0,#000 24px,#000 calc(100% - 24px),transparent);}',
    '.island-row{align-items:center;background:none;border:none;border-radius:12px;color:var(--island-tinte,rgba(29,29,31,.92));cursor:pointer;display:flex;font:inherit;gap:12px;margin:0;padding:10px;text-align:left;touch-action:manipulation;transition:background-color .14s ease,transform .14s ease;width:100%;}',
    '.island-row:hover{background-color:var(--island-fach,rgba(0,0,0,.05));}.island-row:active{background-color:var(--island-fach2,rgba(0,0,0,.09));transform:scale(.985);}',
    '.island-ticker-icon{height:22px;min-width:22px;width:22px;}.island-row-icon,.island-ticker-icon{align-items:center;background:var(--island-fach,rgba(0,0,0,.06));border-radius:50%;display:flex;flex-shrink:0;justify-content:center;}',
    '.island-row-icon{height:34px;min-width:34px;transition:background-color .14s ease;width:34px;}.island-row:hover .island-row-icon{background:var(--island-fach2,rgba(0,0,0,.1));}',
    '.island-row-name{flex:1;font-size:var(--island-fs,13.5px);font-weight:600;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.island-row-value{color:var(--island-ink-soft,rgba(29,29,31,.6));flex-shrink:0;font-size:calc(var(--island-fs,13.5px) - 1px);font-variant-numeric:tabular-nums;}',
    '.island-pill[data-stadium="mini"]{min-height:var(--island-mini-h,44px)!important;}.island-pill[data-stadium="mini"] .island-head{height:var(--island-mini-h,44px);min-height:var(--island-mini-h,44px);padding:0;}',
    '.island-pill[data-stadium="mini"]:hover{transform:scale(1.025);}.island-pill[data-stadium="mini"]:active{transform:scale(.975);}.island-pill[data-stadium="knopf"]:hover{transform:scale(1.04);}.island-pill[data-stadium="knopf"]:active{transform:scale(.96);}',
    '.island-meldkapsel{align-items:center;cursor:pointer;display:flex;flex:1 1 auto;font-size:var(--island-schrift,14.5px);font-weight:650;gap:10px;white-space:nowrap;}.island-meldkapsel .island-mtext{margin-right:auto;}',
    '.island-mstapel{display:flex;}.island-mstapel,.island-mstufe{align-items:center;flex:0 0 auto;}',
    '.island-mstufe{border-radius:50%;color:#fff;display:inline-flex;font-style:normal;height:var(--island-kreis,30px);justify-content:center;width:var(--island-kreis,30px);}.island-mstufe+.island-mstufe{margin-left:-12px;}',
    '.island-mstufe:first-child{z-index:3;}.island-mstufe:nth-child(2){z-index:2;}.island-mstufe:nth-child(3){z-index:1;}',
    '.island-mstufe--alarm{background:#ff3b30;}.island-mstufe--warn{background:#ff9f0a;}.island-mstufe--info{background:#0a84ff;}.island-mstufe--leer{background:var(--island-fach,hsla(0,0%,100%,.12));color:inherit;}.island-mstufe--leer svg{height:17px;width:17px;}.island-mstufe svg{height:15px;width:15px;}',
    '.island-mpfeil{flex:0 0 auto;height:18px;opacity:.45;width:18px;}',
    '.island-pill:not([data-stadium="mini"]) .island-meldkapsel,.island-pill[data-stadium="knopf"] .island-feld,.island-pill[data-stadium="mini"] .island-feld{display:none;}',
    '.island-kopfkugel{background:#fff;border:1px solid rgba(0,0,0,.06);border-radius:999px;box-shadow:0 8px 24px rgba(0,0,0,.22);color:#1d1d1f;display:grid;height:var(--island-mini-h,44px);left:50%;opacity:0;place-items:center;pointer-events:none;position:absolute;top:0;transform:translate(-50%,-55%) scale(.55);transition:opacity .2s ease,transform .34s cubic-bezier(.34,1.35,.36,1);width:var(--island-mini-h,44px);z-index:4;}',
    '.island-anchor[data-stadium="geraete"] .island-kopfkugel,.island-anchor[data-stadium="meldungen"] .island-kopfkugel{opacity:1;transform:translate(-50%,-55%) scale(1);}',
    '.island-pill[data-stadium="geraete"],.island-pill[data-stadium="meldungen"]{animation:island-panel-ein .42s cubic-bezier(.16,1,.3,1) .17s backwards;}',
    '.island-verdunkler{-webkit-backdrop-filter:none;backdrop-filter:none;background:rgba(20,20,24,0);border-radius:0;inset:0;pointer-events:none;position:fixed;transition:background .32s ease,backdrop-filter .32s ease;z-index:3;}.island-verdunkler[data-an="ja"]{-webkit-backdrop-filter:blur(1.4px);backdrop-filter:blur(1.4px);background:rgba(20,20,24,.14);pointer-events:auto;}',
    '.island-schliesser{-webkit-backdrop-filter:blur(24px) saturate(180%);backdrop-filter:blur(24px) saturate(180%);background:rgba(58,60,66,.72);border:0;border-radius:999px;box-shadow:0 6px 20px rgba(0,0,0,.22);color:rgba(255,255,255,.9);cursor:pointer;display:grid;height:36px;left:50%;opacity:0;padding:0;place-items:center;pointer-events:none;position:absolute;top:calc(var(--island-formhoehe,300px) + 14px);transform:translate(-50%) scale(.8);transition:opacity .22s ease,transform .18s cubic-bezier(.16,1,.3,1),top .42s cubic-bezier(.34,1.18,.24,1);width:36px;z-index:3;}',
    '.island-schliesser svg{display:block;height:21px;width:21px;}.island-schliesser:hover{transform:translate(-50%) scale(1.09);}',
    '.island-anchor[data-stadium="geraete"] .island-schliesser,.island-anchor[data-stadium="meldungen"] .island-schliesser{opacity:1;pointer-events:auto;transform:translate(-50%) scale(1);}',
    '.island-anchor[data-live="ja"] .island-pill[data-ruhe="alert"]{box-shadow:0 0 0 2.5px #34c759,0 8px 32px rgba(0,0,0,.12);}',
    '.island-wert{align-items:center;display:inline-flex;font-size:var(--island-schrift);font-variant-numeric:tabular-nums;font-weight:650;height:26px;letter-spacing:-.01em;white-space:nowrap;}',
    '.island-spalte{display:none;flex:0 1 auto;flex-direction:column;gap:0;justify-content:center;line-height:1.1;margin-left:0;opacity:0;overflow:hidden;padding-top:1px;text-align:left;transition:width .46s cubic-bezier(.34,1.18,.24,1),margin .46s cubic-bezier(.34,1.18,.24,1),opacity .22s ease;width:0;}',
    '.island-pill[data-stadium="geraete"] .island-spalte--live,.island-pill[data-stadium="meldungen"] .island-spalte--meld{display:flex;margin-left:0;margin-right:auto;opacity:1;transition-delay:0s,0s,.14s;width:var(--island-spalte,190px);}',
    '.island-pill[data-stadium="geraete"] .island-feld,.island-pill[data-stadium="meldungen"] .island-feld{margin-left:0;}',
    '.island-spalte .island-zeile1{justify-content:flex-start;}.island-spalte .island-z1-roll{flex:1;min-width:0;}.island-z1-zelle{align-items:center;display:grid;min-width:0;overflow:hidden;width:100%;}.island-spalte .island-zeile2,.island-z1-zelle{justify-items:start;}',
    '.island-feld{align-items:center;background:var(--island-feld-grund,rgba(0,0,0,.1));border-radius:24px;display:flex;flex:0 0 auto;gap:0;margin-left:auto;padding:8px;position:relative;}',
    '.island-schieber{background:#fff;box-shadow:0 2px 8px rgba(0,0,0,.15);left:8px;pointer-events:none;position:absolute;top:8px;transition:transform .42s cubic-bezier(.34,1.35,.36,1),opacity .2s ease;z-index:1;}.island-schieber,.island-stufe{border-radius:50%;height:var(--island-kreis);width:var(--island-kreis);}',
    '.island-stufe{align-items:center;color:inherit;cursor:pointer;display:inline-flex;flex:0 0 auto;justify-content:center;opacity:.5;position:relative;transition:color .25s ease,opacity .25s ease,transform .14s ease;z-index:2;}.island-stufe:hover:not([data-an="ja"]){opacity:.8;}.island-stufe:active{transform:scale(.94);}.island-stufe[data-an="ja"]{color:rgba(0,0,0,.85);opacity:1;}',
    '.island-tupfen{border-radius:999px;flex:0 0 auto;font-style:normal;height:7px;width:7px;}.island-tupfen--rot{background:#ff3b30;}.island-tupfen--amber{background:#ff9f0a;}.island-tupfen--blau{background:#0a84ff;}',
    '.island-meld{align-items:flex-start;border-radius:14px;display:flex;gap:11px;padding:10px;text-align:left;}.island-meld+.island-meld{box-shadow:inset 0 1px 0 var(--island-strich,rgba(29,29,31,.12));}.island-meld:hover{background:var(--island-fach,rgba(0,0,0,.05));}.island-meld .island-tupfen{margin-top:5px;}',
    '.island-meld-rumpf{display:flex;flex:1;flex-direction:column;min-width:0;}.island-meld-titel{display:block;font-size:13.5px;font-weight:650;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.island-meld-grund{color:var(--island-ink-soft);font-size:12.5px;margin-top:2px;}',
    '.island-meld-fuss{align-items:center;color:var(--island-ink-soft);display:flex;font-size:11.5px;gap:8px;margin-top:7px;opacity:.8;}.island-meld-marke{background:var(--island-fach,rgba(0,0,0,.06));border-radius:6px;font-style:normal;padding:1px 7px;}',
    '.island-meld-knoepfe{display:flex;flex:0 0 auto;gap:7px;margin-top:1px;}.island-meld-rund{background:var(--island-fach,rgba(0,0,0,.06));border:0;border-radius:999px;color:inherit;cursor:pointer;display:grid;height:27px;opacity:.75;padding:0;place-items:center;width:27px;}.island-meld-rund:hover{opacity:1;}',
    '.island-meld-leer{color:var(--island-ink-soft);font-size:13px;padding:14px 10px;}',
    '.island-fusslink{align-items:center;background:none;border:0;box-shadow:inset 0 1px 0 var(--island-strich,rgba(29,29,31,.12));box-sizing:border-box;color:var(--island-tinte,rgba(29,29,31,.92));cursor:pointer;display:flex;font:inherit;font-size:13px;font-weight:600;justify-content:space-between;margin:8px 0 0;padding:15px 10px 19px;width:100%;text-align:left;}.island-fusslink:hover{opacity:.75;}.island-fusspfeil{font-size:15px;line-height:1;opacity:.6;}',
    '.island-band{white-space:nowrap;}.island-band,.island-band-teil{align-items:center;display:inline-flex;flex:0 0 auto;}.island-band-teil{gap:7px;}.island-band-teil+.island-band-teil{padding-left:48px;}',
    '.island-band.laeuft{animation:island-band linear infinite;}.island-band.laeuft[data-pause="ja"],.island-pill:hover .island-band.laeuft,.island-pill[data-dekor="still"] .island-band.laeuft{animation-play-state:paused;}',
    '.island-zeile1:has(.island-band.laeuft),.island-zeile2:has(.island-band.laeuft){-webkit-mask:linear-gradient(90deg,#000,#000 calc(100% - 18px),transparent);mask:linear-gradient(90deg,#000,#000 calc(100% - 18px),transparent);}',
    '.island-zeile1:has(.island-band.laeuft:not([data-pause="ja"])),.island-zeile2:has(.island-band.laeuft:not([data-pause="ja"])){-webkit-mask:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 18px),transparent);mask:linear-gradient(90deg,transparent,#000 12px,#000 calc(100% - 18px),transparent);}',
    '.isl-in{animation:isl-in .5s cubic-bezier(.22,1,.36,1) both;}.isl-out{animation:isl-out .5s cubic-bezier(.22,1,.36,1) both;pointer-events:none;}.isl-c{display:inline-block;animation:isl-char .25s cubic-bezier(.3,1,.4,1) both;}',
    '@media (prefers-reduced-motion:reduce){.island-band.laeuft{animation:none;}.island-schieber{transition:none;}}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  // small SVG set, FSC's own icons
  function svg(inner, size, vb, sw) { return '<svg width="' + size + '" height="' + size + '" viewBox="' + (vb || '0 0 24 24') + '" fill="none" aria-hidden="true">' + inner + '</svg>'; }
  var ICON = {
    bell: function (s) { return svg('<path d="M19 8C20.66 8 22 6.66 22 5C22 3.34 20.66 2 19 2C17.34 2 16 3.34 16 5C16 6.66 17.34 8 19 8Z" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M21 12V15C21 18.31 18.31 21 15 21H9C5.69 21 3 18.31 3 15V9C3 5.69 5.69 3 9 3H12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>', s); },
    bang: function (s) { return svg('<path d="M12 4v10M12 19.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>', s); },
    warn: function (s) { return svg('<path d="M10.3 3.9 2 18a2 2 0 0 0 1.7 3h16.6A2 2 0 0 0 22 18L13.7 3.9a2 2 0 0 0-3.4 0z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/><path d="M12 9.5v4M12 16.6h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>', s); },
    info: function (s) { return svg('<circle cx="12" cy="12" r="8.5" stroke="currentColor" stroke-width="1.7"/><path d="M12 11v5M12 7.6h.01" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>', s); },
    chev13: function () { return '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="opacity:.45;flex-shrink:0"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>'; },
    mpfeil: '<svg class="island-mpfeil" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6L15 12L9 18" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    done: function (s) { return svg('<circle cx="12" cy="12" r="9" stroke="rgb(48,209,88)" stroke-width="1.8"/><path d="M8 12.5l2.6 2.6L16 9.5" stroke="rgb(48,209,88)" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/>', s); },
    clock: function () { return svg('<circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/><path d="M12 7.5V12l3 1.8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>', 14); },
    x14: function () { return svg('<path d="M6 6l12 12M18 6L6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>', 14); },
    pulse: function () { return '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path d="M3 12h3.5l2-5.5 3.5 11 2.5-7 1.5 3H21" stroke-linecap="round" stroke-linejoin="round"/></svg>'; },
    card: '<svg class="island-wsymbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M5 7H6" stroke-linecap="round" stroke-linejoin="round"/><path d="M2 17.71V6.29C2 5.02 2.99 4 4.22 4H19.78C21.01 4 22 5.02 22 6.29V17.71C22 18.98 21.01 20 19.78 20H4.22C2.99 20 2 18.98 2 17.71Z"/><path d="M11.67 9L10 12H14L12.33 15" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    closeX: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6.76 17.24L12 12M17.24 6.76L12 12M12 12L6.76 6.76M12 12L17.24 17.24" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  var SEV_ICON = { critical: 'bang', warning: 'warn', info: 'info' };
  var SEV_CLS = { critical: 'island-mstufe--alarm', warning: 'island-mstufe--warn', info: 'island-mstufe--info' };
  var LEVEL_ORDER = ['critical', 'warning', 'info'];

  /** Replaces the single child of `host` (a one-cell grid) with a fresh node when `key` changed: new in from above, old out downwards. */
  function swapIn(host, key, build) {
    if (host.__key === key) return false;
    host.__key = key;
    var old = host.firstElementChild, n = build();
    if (!n) { if (old) { old.classList.add('isl-out'); setTimeout(function () { old.remove(); }, 500); } return true; }
    n.style.gridArea = '1 / 1'; n.classList.add('isl-in'); host.appendChild(n);
    if (old) { old.classList.add('isl-out'); old.style.gridArea = '1 / 1'; setTimeout(function () { old.remove(); }, 500); }
    return true;
  }
  /** FSC's marquee: when the text is wider than its column it scrolls (700ms delay, 45px/s, pauses at the end of each loop). */
  function band(host, nodes) {
    var wrap = h('span.island-band'), a = h('span.island-band-teil', null, nodes);
    wrap.appendChild(a); host.appendChild(wrap);
    function measure() {
      var line = host.closest('.island-zeile1,.island-zeile2'); if (!line) return;
      var w = a.offsetWidth, cw = line.clientWidth || parseInt(getComputedStyle(line).getPropertyValue('--island-spalte'), 10) || 0;
      var running = wrap.classList.contains('laeuft');
      if (!w || !cw || w <= cw + 4) { if (running) { wrap.classList.remove('laeuft'); wrap.style.animation = ''; if (wrap.children[1]) wrap.children[1].remove(); } return; }
      if (!running) { var c = h('span.island-band-teil', { 'aria-hidden': 'true' }, nodes.map(function (n) { return n.cloneNode(true); })); wrap.appendChild(c); wrap.classList.add('laeuft'); }
      var dist = w + 48; wrap.style.setProperty('--island-bandweg', '-' + dist + 'px'); wrap.style.animationDuration = Math.max(6, dist / 45).toFixed(1) + 's'; wrap.style.animationDelay = '700ms';
    }
    if (typeof ResizeObserver === 'function') { var ro = new ResizeObserver(measure); ro.observe(a); var line = host.closest('.island-zeile1,.island-zeile2'); if (line) ro.observe(line); wrap.__ro = ro; }
    setTimeout(measure, 0);
    wrap.addEventListener('animationiteration', function () { wrap.dataset.pause = 'ja'; setTimeout(function () { delete wrap.dataset.pause; }, 5000); });
    return wrap;
  }

  /**
   * create(ctx, { values(): [{icon,text}], notes(): [], openCenter(origin), openCategory(key), scrim: element, mobile(): bool })
   *   -> { el, update(), setLocked(b), setAmbient(b), close(), dispose() }
   * One glass element (the pill) morphs between button -> capsule -> devices / notifications panel, exactly like FSC.
   */
  function create(ctx, o) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var lang = function () { return ctx.lang() === 'de' ? 'de' : 'en'; };
    var mob = function () { return !!(o.mobile && o.mobile()); };
    var holder = h('div.island-holder', { dataset: { appeared: 'true' } }), wrap = h('div.statsbar-bento-wrapper', null, holder);
    var anchor = h('span.island-anchor', { dataset: { expanded: 'false', detail: 'false', ruhe: 'alert', stadium: 'knopf', live: 'nein' } });
    var values = h('div.island-wertekapsel');
    var ball = h('div.island-kopfkugel', { html: ICON.bell(21), 'aria-hidden': 'true' });
    var pill = h('div.island-pill.glass-panel', { dataset: { expanded: 'false', ruhe: 'alert', stadium: 'knopf', thema: 'dunkel', dekor: 'wach' } });
    var tint = h('span', { 'aria-hidden': 'true', style: { position: 'absolute', inset: '0', borderRadius: 'inherit', pointerEvents: 'none', transition: 'background-color .4s ease' } });
    var eck = h('i.island-eck', { hidden: true });
    var ruheBtn = h('span.island-ruheknopf', { role: 'button', tabindex: '0', 'aria-label': t('isl.open_island'), onclick: function (e) { e.stopPropagation(); go('mini'); }, html: ICON.bell(21) });
    ruheBtn.appendChild(eck);
    // head: capsule | live column | notification column | severity stepper
    var mtext = h('span.island-mtext'), mstapel = h('span.island-mstapel', { 'aria-hidden': 'true' });
    var meldkapsel = h('span.island-meldkapsel', { role: 'button', tabindex: '0', onclick: function (e) { e.stopPropagation(); var c = counts(); listKind = 'meldungen'; level = c.critical ? 'critical' : (c.warning ? 'warning' : 'info'); tab = 'all'; go('meldungen'); } }, mstapel, mtext, h('span', { html: ICON.mpfeil }));
    meldkapsel.lastChild.replaceWith(meldkapsel.lastChild.firstChild);
    var liveZ1 = h('span.island-z1-zelle'), liveZ2 = h('span.island-zeile2'), liveZ1Line = h('span.island-zeile1', null, h('span.island-z1-roll', null, liveZ1));
    var spLive = h('span.island-spalte.island-spalte--live', null, liveZ1Line, liveZ2);
    var meldZ1 = h('span.island-zeile1'), meldZ2 = h('span.island-zeile2');
    var spMeld = h('span.island-spalte.island-spalte--meld', null, meldZ1, meldZ2);
    var schieber = h('i.island-schieber', { 'aria-hidden': 'true' });
    var stufen = LEVEL_ORDER.map(function (k) { return h('span.island-stufe', { role: 'button', tabindex: '0', 'aria-label': t('isl.level.' + k), dataset: { an: 'nein' }, onclick: function (e) { e.stopPropagation(); if (stadium === 'meldungen' && level === k) go('mini'); else { listKind = 'meldungen'; level = k; tab = 'all'; go('meldungen'); } }, html: ICON[SEV_ICON[k]](16) }); });
    var liveStufe = h('span.island-stufe', { role: 'button', tabindex: '0', 'aria-label': t('isl.level.live'), dataset: { an: 'nein' }, onclick: function (e) { e.stopPropagation(); if (stadium !== 'geraete') { if (live().length) { listKind = 'geraete'; go('geraete'); } else openCenter('live'); } else go('mini'); }, html: ICON.pulse() });
    var feld = h('span.island-feld', null, schieber, stufen[0], stufen[1], stufen[2], liveStufe);
    var head = h('button.island-head', { 'aria-label': t('isl.open'), onmousedown: function (e) { e.preventDefault(); }, onclick: function () { if (swiped() || expanded()) return; openCenter(); } }, meldkapsel, spLive, spMeld, feld);
    var shellInner = h('div'), shell = h('div.island-list-shell', { dataset: { open: 'false' } }, shellInner);
    var closer = h('button.island-schliesser', { 'aria-label': t('isl.close'), onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.stopPropagation(); go('mini'); }, html: ICON.closeX });
    pill.appendChild(tint); pill.appendChild(head); pill.appendChild(shell);
    anchor.appendChild(values); anchor.appendChild(ball); anchor.appendChild(pill); anchor.appendChild(closer);
    holder.appendChild(anchor);

    var scrim = o.scrim, level = null, tab = 'all', listKind = 'geraete', stadium = 'knopf', locked = false, deep = false, textW = 100;
    var takeover = null, doneInfo = null, takeTimer = 0, doneTimer = 0, foldTimer = 0, seenAlerts = null, bootAt = Date.now(), lastLive = null, rollIdx = 0, tickIdx = 0, lastSwipe = 0, rollTimer = 0;
    var hidden = ctx.store.get('island.hidden', {});
    var liveTab = 'all';
    function cfg() { return ctx.settings.get().island || {}; }
    function notes() { return L && visibleNotes(o.notes ? o.notes() : [], hidden, Date.now()); }
    var memo = null;
    function live() { if (memo) return memo.acts; return (ctx.liveActivities ? ctx.liveActivities() : []).map(function (a) { return Object.assign({ group: a.kind === 'timers' ? 'timer' : (a.kind === 'scripts' ? 'scripts' : GROUP_OF[a.id.split('.')[0]] || 'utilities') }, a); }); }
    function counts() { return levelCounts(notes(), live()); }
    function roll() { if (memo) return memo.rl; var items = (ctx.engine && ctx.engine.all ? ctx.engine.all() : []).filter(function (i) { return !ctx.engine.isHidden || !ctx.engine.isHidden(i); }); return rollList(items, ctx.hass().states, lang()); }
    function withMemo(fn) { var own = !memo; if (own) memo = { acts: live(), rl: roll() }; try { return fn(); } finally { if (own) memo = null; } }
    function expanded() { return stadium === 'geraete' || stadium === 'meldungen'; }
    function swiped() { return performance.now() - lastSwipe < 400; }
    function openCenter(tabName) { go('knopf'); if (o.openCenter) o.openCenter(pill, tabName); }
    function openEntity(id) { go('knopf'); ctx.openDetail(id); }

    // ---- geometry: width and metrics as FSC computes them ----
    function layout() {
      var m = mob(), exp = expanded(), Fe = m ? 28 : 30, ze = m ? 130 : 190;
      var w = pillWidth({ mobile: m, expanded: exp, textW: textW, room: holder.clientWidth });
      var s = pill.style;
      s.setProperty('--island-h', m ? '62px' : '72px'); s.setProperty('--island-mini-h', m ? '40px' : '44px'); s.setProperty('--island-schrift', m ? '13px' : '14.5px');
      s.setProperty('--island-kreis', Fe + 'px'); s.setProperty('--island-spalte', ze + 'px');
      s.position = 'relative'; s.display = 'inline-flex'; s.flexDirection = 'column'; s.alignItems = 'stretch'; s.justifyContent = 'center'; s.whiteSpace = 'nowrap'; s.touchAction = 'manipulation';
      s.minHeight = 'var(--island-h)'; s.width = w + 'px';
      s.padding = stadium === 'mini' ? '0 8px' : (m ? '0 10px' : '0 12px 0 14px');
      anchor.style.height = m ? '56px' : '64px';
      holder.style.cssText = 'display:flex;justify-content:center;margin-bottom:12px;position:relative;min-height:' + (m ? '64px' : '72px') + (exp ? ';z-index:5' : '');      // an opened island lies above the dimmer and the search bar (both z-index 3): below them its list was blurred and the search bar covered its rows
      var ph = pill.offsetHeight; if (ph > 0) anchor.style.setProperty('--island-formhoehe', ph + 'px');
    }
    if (typeof ResizeObserver === 'function') {
      var roH = new ResizeObserver(function () { layout(); }); roH.observe(holder);
      var roT = new ResizeObserver(function () { var w = mtext.offsetWidth; if (w && w !== textW) { textW = w; layout(); } }); roT.observe(mtext);
      var roP = new ResizeObserver(function () { var ph = pill.offsetHeight; if (ph > 0) anchor.style.setProperty('--island-formhoehe', ph + 'px'); }); roP.observe(pill);
    }

    // ---- state changes ----
    function go(next) {
      if (next === 'geraete' && !live().length) next = 'mini';
      stadium = next;
      var exp = expanded(), ruhe = next === 'knopf' ? 'alert' : '';
      anchor.dataset.stadium = next; anchor.dataset.expanded = String(exp); anchor.dataset.ruhe = ruhe;
      pill.dataset.stadium = next; pill.dataset.expanded = String(exp); pill.dataset.ruhe = ruhe;
      pill.setAttribute('aria-expanded', exp ? 'true' : 'false');
      if (ruhe === 'alert') { if (ruheBtn.parentNode !== pill) pill.insertBefore(ruheBtn, head); } else if (ruheBtn.parentNode === pill) ruheBtn.remove();      // (isConnected is false while the island is still detached at start)
      if (scrim) scrim.dataset.an = exp ? 'ja' : 'nein';
      shell.dataset.open = String(exp);
      if (exp) { if (!level && listKind === 'meldungen') level = startLevel(counts()); drawList(); }
      layout(); paintAll(); resetFold(); watchOutside();
    }
    function resetFold() {
      clearTimeout(foldTimer);
      var c = cfg(); if (c.fold === false || takeover) return;
      if (expanded()) foldTimer = setTimeout(function () { go('mini'); }, (c.toCapsuleSec || 30) * 1000);
      else if (stadium === 'mini' && !locked) foldTimer = setTimeout(function () { go('knopf'); }, (c.toButtonSec || 60) * 1000);
    }
    var outsideOn = false;
    function onOutside(e) { var p = e.composedPath ? e.composedPath() : [e.target]; if (p.indexOf(pill) < 0) go('mini'); }
    function watchOutside() {
      if (expanded() && !outsideOn) { outsideOn = true; setTimeout(function () { if (outsideOn) document.addEventListener('pointerdown', onOutside); }, 0); }
      else if (!expanded() && outsideOn) { outsideOn = false; document.removeEventListener('pointerdown', onOutside); }
    }
    if (scrim) scrim.addEventListener('click', function () { go('mini'); });
    function onKey(e) { if (e.key === 'Escape' && stadium !== 'knopf') go(locked && !deep ? 'mini' : (expanded() ? 'mini' : 'knopf')); }
    document.addEventListener('keydown', onKey);
    pill.addEventListener('pointerdown', resetFold);

    // swipe right folds the capsule back to the button
    var sw = null;
    head.addEventListener('pointerdown', function (e) {
      if (pill.dataset.ruhe !== '' || (e.target.closest && e.target.closest('.island-stufe,.island-wert,.island-list-reiter-knopf,.island-meld-rund,.island-row,.island-fusslink'))) return;
      sw = { x: e.clientX, t: performance.now(), dx: 0, cap: false, id: e.pointerId };
    });
    head.addEventListener('pointermove', function (e) {
      if (!sw) return; sw.dx = Math.max(0, e.clientX - sw.x);
      if (!sw.cap) { if (sw.dx <= 8) return; sw.cap = true; pill.dataset.wischt = 'ja'; try { head.setPointerCapture(sw.id); } catch (er) { /* fine */ } }
      var r = Math.min(1, sw.dx / 260); pill.style.transform = 'translateX(' + sw.dx + 'px) scale(' + (1 - 0.12 * r) + ')'; pill.style.opacity = String(1 - 0.75 * r);
    });
    function endSwipe() {
      if (!sw) return; var s = sw; sw = null; if (!s.cap) return;
      lastSwipe = performance.now(); delete pill.dataset.wischt; pill.style.transform = ''; pill.style.opacity = '';
      var v = s.dx / Math.max(1, performance.now() - s.t);
      if (s.dx > 90 || (v > 0.6 && s.dx > 24)) go('knopf');
    }
    head.addEventListener('pointerup', endSwipe); head.addEventListener('pointercancel', endSwipe);

    // ---- painting ----
    function paintValues() {
      var vals = o.values(); values.innerHTML = '';
      vals.forEach(function (v) {
        var node = h('span.island-wert', { role: 'button', tabindex: '0' }, h('span', { html: v.icon === 'bolt' ? ICON.card : UI.icon(v.icon, 15) }), v.text);
        node.style.opacity = '1'; node.style.cursor = 'pointer';
        if (v.icon === 'bolt') node.addEventListener('click', function (e) { e.stopPropagation(); if (o.openEnergy) o.openEnergy(); }); else node.addEventListener('click', function (e) { e.stopPropagation(); if (o.openWeather) o.openWeather(); });
        values.appendChild(node);
      });
      values.hidden = !vals.length || cfg().show === false || locked;
      values.style.display = locked ? 'none' : '';
    }
    function paintStack(c) {
      var inner = '';
      var any = LEVEL_ORDER.filter(function (k) { return c[k]; });
      mstapel.innerHTML = '';
      if (!any.length) mstapel.appendChild(h('i.island-mstufe.island-mstufe--leer', { html: ICON.bell(17) }));
      else any.forEach(function (k) { mstapel.appendChild(h('i.island-mstufe.' + SEV_CLS[k], { html: ICON[SEV_ICON[k]](15) })); });
      var total = badgeCount(c);
      mtext.textContent = total + ' ' + (lang() === 'de' ? 'Mitteilungen' : 'notifications');
    }
    function paintStepper(c) {
      var De = stadium === 'geraete' ? 3 : (stadium === 'meldungen' ? LEVEL_ORDER.indexOf(level) : -1);
      var Fe = mob() ? 28 : 30;
      schieber.style.transform = 'translateX(' + Math.max(0, De) * Fe + 'px)'; schieber.style.opacity = De >= 0 ? '1' : '0';
      stufen.concat([liveStufe]).forEach(function (el, i) { el.dataset.an = i === De ? 'ja' : 'nein'; });
    }
    function paintMeldColumn(c) {
      var lv = level || (c.critical ? 'critical' : (c.warning ? 'warning' : 'info'));
      var n = lv === 'critical' ? c.critical : (lv === 'warning' ? c.warning : c.info);
      var s1 = severityText(lv, n, lang()), s2 = badgeCount(c) + ' ' + (lang() === 'de' ? 'Mitteilungen' : 'notifications');
      if (meldZ1.__t !== s1) { meldZ1.__t = s1; meldZ1.innerHTML = ''; meldZ1.appendChild(band(meldZ1, [document.createTextNode(s1)])); }
      if (meldZ2.__t !== s2) { meldZ2.__t = s2; meldZ2.innerHTML = ''; meldZ2.appendChild(band(meldZ2, [document.createTextNode(s2)])); }
    }
    function charRoll(el, text, soft) {
      var prev = el.__chars || [], chars = String(text).split('');
      if (el.__text === text) return; el.__text = text; el.__chars = chars;
      el.innerHTML = '';
      chars.forEach(function (ch, i) { var s = h('span', { style: { display: 'inline-block' } }, ch === ' ' ? ' ' : ch); if (prev.length && prev[i] !== ch) s.className = 'isl-c'; el.appendChild(s); });
    }
    function tickItems(acts, rl) { return acts.length ? acts : rl; }
    function paintLive(c) {
      var acts = live(), rl = roll(), busy = acts.length > 0, items = tickItems(acts, rl);
      anchor.dataset.live = busy ? 'ja' : 'nein';
      // line 1 (desktop only): which group is rolling by
      var z1 = busy && !mob() && rl.length ? rl[rollIdx % rl.length] : null;
      liveZ1Line.style.display = z1 ? '' : 'none';
      if (z1) swapIn(liveZ1, 'z1:' + z1.key + z1.label, function () { var n = h('span', { role: 'button', tabindex: '0', style: { display: 'inline-flex', alignItems: 'center', cursor: 'pointer', whiteSpace: 'nowrap' }, onclick: function (e) { e.stopPropagation(); go('knopf'); if (o.openCategory) o.openCategory(z1.key); } }); n.appendChild(band(n, [document.createTextNode(z1.label)])); return n; });
      // line 2: alert takeover, "done", the ticker (live activity or roll list) or "all quiet"
      var latest = busy ? acts.reduce(function (a, b) { return (b.changedAt || 0) > (a.changedAt || 0) ? b : a; }, acts[0]) : null;
      var pick = expanded() && latest ? latest : (items.length ? items[tickIdx % items.length] : null);
      var key = takeover ? 'takeover:' + takeover.id : (doneInfo ? 'done:' + doneInfo.id : (pick ? (busy ? 'live:' + pick.id : 'fakt:' + pick.key) : 'still'));
      swapIn(liveZ2, key, function () {
        var holderEl = h('span', { style: { display: 'inline-flex', alignItems: 'center', minWidth: '0' } }), inner;
        if (takeover) {
          var ring = '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" style="flex-shrink:0;transform:rotate(-90deg)"><circle cx="8" cy="8" r="6.5" stroke="rgba(29,29,31,0.18)" stroke-width="2" fill="none"/><circle cx="8" cy="8" r="6.5" stroke="' + (takeover.severity === 'warning' ? 'rgb(255,159,10)' : 'rgb(10,132,255)') + '" stroke-width="2" fill="none" stroke-linecap="round" stroke-dasharray="40.84" class="island-ring" style="animation-duration:' + takeMs + 'ms"/></svg>';
          inner = [h('span', { style: { display: 'flex', flexShrink: '0' }, html: takeover.severity === 'warning' ? ICON.warn(15) : ICON.info(15) }), h('span', { style: { fontWeight: '600', whiteSpace: 'nowrap' } }, takeover.label || t('isl.new')), h('span', { html: ring, style: { display: 'inline-flex' } })];
        } else if (doneInfo) {
          inner = [h('span', { style: { display: 'flex', flexShrink: '0' }, html: ICON.done(16) }), h('span', { style: { fontWeight: '600', whiteSpace: 'nowrap' } }, doneInfo.label), h('span', { style: { color: 'var(--island-ink-soft)', flexShrink: '0' } }, t('isl.done_word'))];
        } else if (pick && busy) {
          var st = h('span.isl-status', { style: { color: 'var(--island-ink-soft)', whiteSpace: 'nowrap', flexShrink: '0', display: 'inline-flex', overflow: 'hidden' } }); charRoll(st, pick.value || '');
          var it = h('span', { role: 'button', tabindex: '0', style: { display: 'inline-flex', alignItems: 'center', gap: '7px', minWidth: '0', cursor: 'pointer' }, onclick: function (e) { e.stopPropagation(); openEntity(pick.id); } },
            h('span.island-ticker-icon', { html: UI.icon(pick.icon || 'toggle', 15) }), h('span', { style: { fontWeight: '600', whiteSpace: 'nowrap' } }, pick.name || pick.label), pick.value ? st : null);
          inner = [it];
        } else if (pick) {
          inner = [h('span', { role: 'button', tabindex: '0', style: { display: 'inline-flex', alignItems: 'center', gap: '7px', minWidth: '0', cursor: 'pointer' }, onclick: function (e) { e.stopPropagation(); go('knopf'); if (o.openCategory) o.openCategory(pick.key); } },
            h('span', { style: { display: 'flex', flexShrink: '0', opacity: '.9' }, html: UI.icon(pick.icon || 'toggle', 14) }), h('span', { style: { color: 'var(--island-ink-soft)', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' } }, pick.label))];
        } else {
          inner = [h('span', { style: { color: 'var(--island-ink-soft)' } }, t('isl.quiet'))];
        }
        holderEl.appendChild(band(holderEl, inner)); return holderEl;
      });
      // the ticker's running value changes in place
      if (pick && busy && !takeover && !doneInfo) { liveZ2.querySelectorAll('.isl-status').forEach(function (el) { charRoll(el, pick.value || ''); }); }
    }
    var takeMs = 6000, bootGrace = 5000;
    function checkAlerts() {
      var alerts = notes().filter(function (n) { return n.severity === 'warning' || n.severity === 'info'; });
      var ids = new Set(alerts.map(function (a) { return a.id; }));
      if (!seenAlerts) { seenAlerts = ids; return; }
      var fresh = alerts.filter(function (a) { return !seenAlerts.has(a.id); });
      seenAlerts.forEach(function (id) { if (!ids.has(id)) seenAlerts.delete(id); });
      fresh.forEach(function (a) { seenAlerts.add(a.id); });
      if (takeover && !ids.has(takeover.id)) { clearTimeout(takeTimer); takeover = null; }
      if (!fresh.length || Date.now() - bootAt < bootGrace) return;
      var a = fresh[0]; takeover = { id: a.id, severity: a.severity, label: a.title || a.text || '' };
      clearTimeout(takeTimer); takeTimer = setTimeout(function () { takeover = null; paintAll(); resetFold(); }, takeMs);
    }
    function checkDone(acts) {
      if (lastLive && !acts.some(function (a) { return a.id === lastLive.id; })) { doneInfo = { id: lastLive.id, label: lastLive.name }; clearTimeout(doneTimer); doneTimer = setTimeout(function () { doneInfo = null; paintAll(); }, 2000); }
      lastLive = acts[0] ? { id: acts[0].id, name: acts[0].name } : null;
    }
    function paintTone() {
      var s = pill.style;
      if (doneInfo && !takeover) { s.boxShadow = '0 10px 34px rgba(0,0,0,0.18), 0 0 22px rgba(48,209,88,0.2)'; tint.style.backgroundColor = 'rgba(48,209,88,0.08)'; }
      else if (takeover) { var warn = takeover.severity === 'warning'; s.boxShadow = warn ? '0 10px 34px rgba(0,0,0,0.18), 0 0 26px rgba(255,159,10,0.25)' : '0 10px 34px rgba(0,0,0,0.18), 0 0 26px rgba(10,132,255,0.22)'; tint.style.backgroundColor = warn ? 'rgba(255,159,10,0.1)' : 'rgba(10,132,255,0.08)'; }
      else { s.boxShadow = '0 10px 34px rgba(0,0,0,0.18)'; tint.style.backgroundColor = 'rgba(0,0,0,0)'; }
    }
    // ---- the list below the head ----
    function drawList() {
      shellInner.innerHTML = '';
      var c = counts(), box;
      if (listKind === 'geraete') {
        var acts = live(), tabs = liveTabs(acts, lang());
        if (!tabs.some(function (x) { return x.key === liveTab; })) liveTab = 'all';
        var shown = liveTab === 'all' ? acts : acts.filter(function (a) { return (a.group || 'utilities') === liveTab; });
        var reiter = h('div.island-list-reiter');
        tabs.forEach(function (x, i) { var b = h('button.island-list-reiter-knopf' + (x.key === liveTab ? '.is-active' : ''), { type: 'button', onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.stopPropagation(); liveTab = x.key; drawList(); } }, x.label, h('i.island-list-reiter-zahl', null, String(x.count))); b.style.animation = 'isl-char .22s cubic-bezier(.16,1,.3,1) ' + (0.03 * i) + 's both'; reiter.appendChild(b); });
        var list = h('div.island-list');
        list.addEventListener('scroll', function () { list.classList.toggle('is-scrolling', list.scrollTop > 0); });
        shown.forEach(function (a) { list.appendChild(h('button.island-row', { onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.stopPropagation(); go('mini'); ctx.openDetail(a.id); }, title: a.name }, h('span.island-row-icon', { html: UI.icon(a.icon || 'toggle', 18) }), h('span.island-row-name', null, a.name), a.value ? h('span.island-row-value', null, a.value) : null, h('span', { html: ICON.chev13() }))); });
        box = h('div.island-liste', null, tabs.length ? reiter : null, h('div.island-list-flaeche', null, list));
      } else {
        var mine = notes().filter(function (n) { return level ? n.severity === level : true; });
        var srcLabel = function (n) { return t('isl.src.' + n.source) || n.source; };
        var labels = []; mine.forEach(function (n) { var l = srcLabel(n); if (labels.indexOf(l) < 0) labels.push(l); });
        if (tab !== 'all' && labels.indexOf(tab) < 0) tab = 'all';
        var reiter2 = h('div.island-list-reiter');
        [{ key: 'all', label: t('isl.all'), n: mine.length }].concat(labels.map(function (l) { return { key: l, label: l, n: mine.filter(function (x) { return srcLabel(x) === l; }).length }; })).forEach(function (x) {
          reiter2.appendChild(h('button.island-list-reiter-knopf' + (x.key === tab ? '.is-active' : ''), { type: 'button', onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.stopPropagation(); tab = x.key; drawList(); } }, x.label, h('i.island-list-reiter-zahl', null, String(x.n))));
        });
        var list2 = h('div.island-list.island-list--meldungen');
        var show = mine.filter(function (n) { return tab === 'all' || srcLabel(n) === tab; });
        if (!show.length) list2.appendChild(h('div.island-meld-leer', null, t('isl.empty')));
        show.forEach(function (n) {
          var dot = n.severity === 'critical' ? 'rot' : (n.severity === 'warning' ? 'amber' : 'blau');
          var row = h('div.island-meld', null, h('i.island-tupfen.island-tupfen--' + dot),
            h('span.island-meld-rumpf', null, h('span.island-meld-titel', null, n.title || n.text || n.id), (n.text && n.text !== n.title) ? h('span.island-meld-grund', null, n.text) : null,
              h('span.island-meld-fuss', null, n.ts ? L.relativeTime(Date.now() - n.ts, ctx.lang()) : '', h('i.island-meld-marke', null, srcLabel(n)))),
            h('span.island-meld-knoepfe', null,
              h('button.island-meld-rund', { type: 'button', title: t('isl.snooze'), onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.stopPropagation(); hidden[n.id] = { until: Date.now() + 3600000 }; ctx.store.set('island.hidden', hidden); update(); }, html: ICON.clock() }),
              h('button.island-meld-rund', { type: 'button', title: t('isl.dismiss'), onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.stopPropagation(); if (n.persistent) ctx.call('persistent_notification', 'dismiss', { notification_id: n.persistent }).catch(function () {}); hidden[n.id] = { until: 0 }; ctx.store.set('island.hidden', hidden); update(); }, html: ICON.x14() })));
          if (n.entity) { row.style.cursor = 'pointer'; row.addEventListener('click', function () { go('knopf'); ctx.openDetail(n.entity); }); }
          else if (n.action) { row.style.cursor = 'pointer'; row.addEventListener('click', function () { n.action(); }); }
          list2.appendChild(row);
        });
        box = h('div.island-liste', null, reiter2, h('div.island-list-flaeche', null, list2));
      }
      shellInner.appendChild(box);
      shellInner.appendChild(h('button.island-fusslink', { type: 'button', onmousedown: function (e) { e.preventDefault(); }, onclick: function (e) { e.stopPropagation(); openCenter(listKind === 'geraete' ? 'live' : undefined); } }, listKind === 'geraete' ? t('isl.all_acts') : t('isl.center'), h('span.island-fusspfeil', null, '›')));
    }
    function paintAll() { withMemo(paintAllNow); }
    function paintAllNow() {
      var c = counts();
      paintValues(); paintStack(c); paintStepper(c); paintMeldColumn(c); paintLive(c); paintTone();
      var b = badgeLevel(c), n = badgeCount(c);
      eck.hidden = !n; eck.textContent = String(n); eck.className = 'island-eck ' + (b === 'critical' ? 'island-eck--rot' : (b === 'warning' ? 'island-eck--amber' : 'island-eck--blau'));
      var tintOnly = pill.dataset.thema; layout();
    }
    function update() {
      withMemo(function () { var acts = live(); checkAlerts(); checkDone(acts); paintAll(); if (expanded()) drawList(); });
    }
    function setLocked(b) {
      locked = !!b;
      var next = startStadium(locked, deep);
      if (expanded() && !locked) { /* keep the panel the user opened */ } else go(next === 'mini' && !locked ? 'knopf' : next);
      update();
    }
    function setAmbient(b) { deep = !!b; if (locked && !expanded()) go(startStadium(true, deep)); }
    rollTimer = setInterval(function () { if (document.hidden) return; var n = (live().length ? live() : roll()).length; if (n > 1) tickIdx++; if (roll().length > 1) rollIdx++; if (stadium !== 'knopf') paintLive(counts()); }, 4000);
    go('knopf');
    return { el: wrap, update: update, layout: layout, setLocked: setLocked, setAmbient: setAmbient, close: function () { go(locked && !deep ? 'mini' : 'knopf'); }, dispose: function () { clearInterval(rollTimer); clearTimeout(foldTimer); clearTimeout(takeTimer); clearTimeout(doneTimer); document.removeEventListener('keydown', onKey); document.removeEventListener('pointerdown', onOutside); }, get stadium() { return stadium; } };
  }
  api.create = create;
  g.OkieMotor.island = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

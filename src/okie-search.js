/* okie-search: fuzzy search, intent parser, chip completion, predictions.
 *
 * Mirrors what FSC documents (docs/FEATURES.md, "Search"):
 *   - typo-tolerant, partial matching, persistent collection, LRU of 30 queries
 *   - intent parser: "living room light" -> { area, domain } pre-filter
 *   - score = fuzzy * 0.7 + relevance * 0.3 + prefix bonus
 *   - domain-synonym groups in DE and EN
 *   - chip input: type "Kit", ghost "chen", Tab -> area chip
 *   - predictions with exponential decay, cold-start bootstrap, negative learning
 *   - excluded patterns with wildcards, import/export as JSON
 *
 * Written from the feature description, not from FSC's bundle. Pure logic, no
 * DOM: everything here is unit-tested under node (tests/search.test.js).
 */
(function (g) {
  'use strict';

  var core = (typeof module !== 'undefined' && module.exports) ? require('./okie-core.js') : g.OkieMotor.core;

  // ------------------------------------------------------ normalisation ----
  function norm(s) {
    return String(s == null ? '' : s)
      .toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/ae/g, 'a').replace(/oe/g, 'o').replace(/ue/g, 'u'); // kueche == Kuche == Küche
  }
  function tokens(s) {
    return norm(s).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  }

  // Optimal-string-alignment distance with an early exit once it exceeds max.
  function osa(a, b, max) {
    var al = a.length, bl = b.length;
    if (Math.abs(al - bl) > max) return max + 1;
    if (!al) return bl;
    if (!bl) return al;
    var prev2 = null;
    var prev = new Array(bl + 1), cur = new Array(bl + 1);
    var i, j;
    for (j = 0; j <= bl; j++) prev[j] = j;
    for (i = 1; i <= al; i++) {
      cur[0] = i;
      var rowMin = cur[0];
      for (j = 1; j <= bl; j++) {
        var cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
        var v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
        if (prev2 && i > 1 && j > 1 &&
            a.charCodeAt(i - 1) === b.charCodeAt(j - 2) && a.charCodeAt(i - 2) === b.charCodeAt(j - 1)) {
          v = Math.min(v, prev2[j - 2] + 1); // transposition
        }
        cur[j] = v;
        if (v < rowMin) rowMin = v;
      }
      if (rowMin > max) return max + 1;
      prev2 = prev; prev = cur; cur = new Array(bl + 1);
    }
    return prev[bl];
  }

  function isSubsequence(q, t) {
    var i = 0;
    for (var j = 0; j < t.length && i < q.length; j++) if (q[i] === t[j]) i++;
    return i === q.length;
  }

  // How well does one query token match one text token? 0..1, below 0.45 = no.
  function tokenScore(q, t) {
    if (q === t) return 1;
    if (t.indexOf(q) === 0) return q.length >= 2 ? 0.88 + 0.1 * (q.length / t.length) : 0.55;
    if (q.length >= 3 && t.indexOf(q) > 0) return 0.62 + 0.1 * (q.length / t.length);
    var allowed = q.length <= 3 ? 0 : (q.length <= 6 ? 1 : 2);
    if (allowed) {
      var d = osa(q, t, allowed);
      if (d <= allowed) return 0.82 - 0.14 * (d - 1);
      // typo inside a typed prefix: "kitchn" vs "kitchen" is covered above, "kitchn" vs "kitchenette" here
      if (q.length >= 4 && t.length > q.length) {
        for (var L = q.length - 1; L <= q.length + 1; L++) {
          if (L > 0 && L <= t.length && osa(q, t.slice(0, L), 1) <= 1) return 0.7;
        }
      }
    }
    if (q.length >= 3 && isSubsequence(q, t)) return 0.4 + 0.15 * (q.length / t.length);
    return 0;
  }

  // ------------------------------------------------------- vocabulary ----
  // Fifteen+ domain-synonym groups, DE + EN. Keys are HA domains.
  var DOMAIN_SYNONYMS = {
    light: ['light', 'lights', 'lamp', 'lamps', 'bulb', 'licht', 'lichter', 'lampe', 'lampen', 'leuchte', 'leuchten', 'beleuchtung', 'strahler'],
    switch: ['switch', 'switches', 'plug', 'plugs', 'outlet', 'socket', 'schalter', 'steckdose', 'steckdosen', 'zwischenstecker'],
    climate: ['climate', 'thermostat', 'thermostats', 'heating', 'heater', 'cooling', 'ac', 'aircon', 'klima', 'heizung', 'heizkorper', 'klimaanlage'],
    cover: ['cover', 'covers', 'blind', 'blinds', 'shutter', 'shutters', 'curtain', 'curtains', 'garage', 'gate', 'awning', 'rollo', 'rollos', 'rolladen', 'jalousie', 'jalousien', 'vorhang', 'markise', 'tor'],
    lock: ['lock', 'locks', 'deadbolt', 'schloss', 'turschloss', 'schlosser'],
    media_player: ['media', 'player', 'tv', 'television', 'speaker', 'speakers', 'music', 'radio', 'sonos', 'fernseher', 'lautsprecher', 'musik', 'receiver'],
    fan: ['fan', 'fans', 'ventilator', 'ventilatoren', 'luftung', 'lufter'],
    sensor: ['sensor', 'sensors', 'measurement', 'messwert', 'messwerte', 'fuhler'],
    binary_sensor: ['motion', 'presence', 'occupancy', 'contact', 'bewegung', 'bewegungsmelder', 'anwesenheit', 'kontakt', 'melder', 'smoke', 'rauchmelder'],
    camera: ['camera', 'cameras', 'cam', 'cams', 'doorbell', 'kamera', 'kameras', 'turklingel'],
    vacuum: ['vacuum', 'vacuums', 'robot', 'roomba', 'saugroboter', 'staubsauger', 'roboter', 'sauger'],
    scene: ['scene', 'scenes', 'mood', 'szene', 'szenen', 'stimmung'],
    script: ['script', 'scripts', 'skript', 'skripte'],
    automation: ['automation', 'automations', 'automatisierung', 'automatisierungen', 'routine'],
    weather: ['weather', 'forecast', 'wetter', 'vorhersage'],
    alarm_control_panel: ['alarm', 'alarms', 'alarmanlage', 'security'],
    humidifier: ['humidifier', 'dehumidifier', 'luftbefeuchter', 'entfeuchter'],
    water_heater: ['boiler', 'warmwasser', 'waterheater'],
    person: ['person', 'people', 'who', 'wer', 'personen'],
    siren: ['siren', 'sirene'],
  };

  // Sensor types: word -> { domain, deviceClass }. "temp" completes to temperature.
  var SENSOR_TYPES = {
    temperature: { domain: 'sensor', deviceClass: 'temperature', words: ['temperature', 'temp', 'temperatur', 'warm', 'cold', 'kalt'] },
    humidity: { domain: 'sensor', deviceClass: 'humidity', words: ['humidity', 'feuchtigkeit', 'luftfeuchtigkeit', 'luftfeuchte'] },
    power: { domain: 'sensor', deviceClass: 'power', words: ['power', 'watt', 'leistung', 'verbrauch'] },
    energy: { domain: 'sensor', deviceClass: 'energy', words: ['energy', 'kwh', 'energie', 'strom'] },
    battery: { domain: 'sensor', deviceClass: 'battery', words: ['battery', 'batterie', 'akku'] },
    illuminance: { domain: 'sensor', deviceClass: 'illuminance', words: ['illuminance', 'lux', 'brightness', 'helligkeit'] },
    pressure: { domain: 'sensor', deviceClass: 'pressure', words: ['pressure', 'druck', 'luftdruck'] },
    co2: { domain: 'sensor', deviceClass: 'carbon_dioxide', words: ['co2', 'carbon', 'kohlendioxid'] },
    // door/window words also name locks, covers and cameras ("front door"), so they
    // complete as chips but never act as a hard filter when merely typed.
    door: { domain: 'binary_sensor', deviceClass: 'door', ambiguous: true, words: ['door', 'tur', 'haustur'] },
    window: { domain: 'binary_sensor', deviceClass: 'window', ambiguous: true, words: ['window', 'windows', 'fenster'] },
  };

  var DOMAIN_LABELS = {
    light: { en: 'Light', de: 'Lampe', icon: 'mdi:lightbulb' },
    switch: { en: 'Switch', de: 'Schalter', icon: 'mdi:toggle-switch' },
    climate: { en: 'Climate', de: 'Klima', icon: 'mdi:thermostat' },
    cover: { en: 'Cover', de: 'Rollo', icon: 'mdi:window-shutter' },
    lock: { en: 'Lock', de: 'Schloss', icon: 'mdi:lock' },
    media_player: { en: 'Media', de: 'Medien', icon: 'mdi:speaker' },
    fan: { en: 'Fan', de: 'Ventilator', icon: 'mdi:fan' },
    sensor: { en: 'Sensor', de: 'Sensor', icon: 'mdi:eye' },
    binary_sensor: { en: 'Motion', de: 'Melder', icon: 'mdi:motion-sensor' },
    camera: { en: 'Camera', de: 'Kamera', icon: 'mdi:cctv' },
    vacuum: { en: 'Vacuum', de: 'Saugroboter', icon: 'mdi:robot-vacuum' },
    scene: { en: 'Scene', de: 'Szene', icon: 'mdi:palette' },
    script: { en: 'Script', de: 'Skript', icon: 'mdi:script-text' },
    automation: { en: 'Automation', de: 'Automation', icon: 'mdi:robot' },
    weather: { en: 'Weather', de: 'Wetter', icon: 'mdi:weather-partly-cloudy' },
    alarm_control_panel: { en: 'Alarm', de: 'Alarm', icon: 'mdi:shield-home' },
    humidifier: { en: 'Humidifier', de: 'Luftbefeuchter', icon: 'mdi:air-humidifier' },
    water_heater: { en: 'Boiler', de: 'Boiler', icon: 'mdi:water-boiler' },
    person: { en: 'Person', de: 'Person', icon: 'mdi:account' },
    siren: { en: 'Siren', de: 'Sirene', icon: 'mdi:bullhorn' },
  };

  // Cold-start ranking when there is no usage history yet.
  var DOMAIN_PRIORITY = {
    light: 0.9, climate: 0.8, cover: 0.7, media_player: 0.7, lock: 0.7, switch: 0.6, fan: 0.55,
    vacuum: 0.5, camera: 0.5, scene: 0.5, alarm_control_panel: 0.5, weather: 0.4, sensor: 0.3,
    binary_sensor: 0.3, script: 0.3, automation: 0.2, person: 0.2,
  };

  var STATE_WORDS = {
    on: 'on', an: 'on', ein: 'on', active: 'on', aktiv: 'on',
    off: 'off', aus: 'off',
    open: 'open', offen: 'open', geoffnet: 'open',
    closed: 'closed', zu: 'closed', geschlossen: 'closed', close: 'closed',
    locked: 'locked', verriegelt: 'locked',
    unlocked: 'unlocked', entriegelt: 'unlocked',
  };
  var ACTIVE_STATES = { on: 1, open: 1, opening: 1, playing: 1, home: 1, heat: 1, cool: 1, heat_cool: 1, auto: 1, cleaning: 1, unlocked: 1, armed_away: 1, armed_home: 1 };

  function singular(w) {
    // lights -> light, lampen -> lampe; only used as a second try, never required.
    if (w.length > 4 && /en$/.test(w)) return w.slice(0, -1);
    if (w.length > 3 && /s$/.test(w)) return w.slice(0, -1);
    return w;
  }

  // Reverse index of every synonym -> domain, built once.
  var SYNONYM_TO_DOMAIN = {};
  Object.keys(DOMAIN_SYNONYMS).forEach(function (domain) {
    DOMAIN_SYNONYMS[domain].forEach(function (w) { SYNONYM_TO_DOMAIN[norm(w)] = domain; });
  });
  var WORD_TO_SENSOR = {};
  Object.keys(SENSOR_TYPES).forEach(function (k) {
    if (SENSOR_TYPES[k].ambiguous) return;
    SENSOR_TYPES[k].words.forEach(function (w) { WORD_TO_SENSOR[norm(w)] = k; });
  });

  function lookupDomainWord(w) {
    if (SYNONYM_TO_DOMAIN[w]) return SYNONYM_TO_DOMAIN[w];
    var s = singular(w);
    if (SYNONYM_TO_DOMAIN[s]) return SYNONYM_TO_DOMAIN[s];
    if (w.length >= 5) { // one-typo tolerance on longer words
      var best = null;
      for (var k in SYNONYM_TO_DOMAIN) {
        if (k.length >= 5 && Math.abs(k.length - w.length) <= 1 && osa(w, k, 1) <= 1) { best = SYNONYM_TO_DOMAIN[k]; break; }
      }
      return best;
    }
    return null;
  }
  function lookupSensorWord(w) {
    if (WORD_TO_SENSOR[w]) return WORD_TO_SENSOR[w];
    var s = singular(w);
    if (WORD_TO_SENSOR[s]) return WORD_TO_SENSOR[s];
    return null;
  }

  function decodeEntities(s) {
    return String(s == null ? '' : s).replace(/&(quot|amp|lt|gt|apos|#39|#x27|nbsp);/g, function (m, e) { return { quot: '"', amp: '&', lt: '<', gt: '>', apos: "'", '#39': "'", '#x27': "'", nbsp: ' ' }[e]; });
  }
  // ------------------------------------------------ collection builder ----
  /**
   * Turn a Home Assistant `hass` object into search items.
   * opts: { includeHidden, includeDisabled, includeDiagnostic, lang }
   */
  function buildCollection(hass, opts) {
    opts = opts || {};
    var states = (hass && hass.states) || {};
    var reg = (hass && hass.entities) || {};
    var devices = (hass && hass.devices) || {};
    var areas = (hass && hass.areas) || {};
    var out = [];
    Object.keys(states).forEach(function (id) {
      var st = states[id];
      var r = reg[id] || {};
      if (r.hidden && !opts.includeHidden) return;
      if (r.disabled_by && !opts.includeDisabled) return;
      if ((r.entity_category === 'diagnostic' || r.entity_category === 'config') && !opts.includeDiagnostic) return;
      var domain = id.split('.')[0];
      var dev = r.device_id ? devices[r.device_id] : null;
      var areaId = r.area_id || (dev && dev.area_id) || null;
      var area = areaId && areas[areaId] ? areas[areaId] : null;
      var attrs = st.attributes || {};
      out.push({
        id: id,
        domain: domain,
        deviceClass: attrs.device_class || null,
        name: decodeEntities(attrs.friendly_name || r.name || id),
        areaId: areaId,
        area: area ? area.name : null,
        labels: r.labels || [],
        state: st.state,
        unit: attrs.unit_of_measurement || null,
        icon: attrs.icon || r.icon || null,
        category: r.entity_category || null,
      });
    });
    return out;
  }

  // ---------------------------------------------------------- engine ----
  var HALF_LIFE_DAYS = { slow: 30, normal: 14, fast: 5 };
  var DAY_MS = 86400000;

  function wildcardToRegExp(pat) {
    var esc = String(pat).toLowerCase().replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + esc + '$');
  }

  var DEFAULT_EXCLUDE_TEMPLATES = [
    { id: 'link-quality', label: 'Link quality / RSSI', patterns: ['*_linkquality', '*_rssi', '*_signal_strength', '*_signal_level'] },
    { id: 'last-seen', label: 'Last seen / uptime', patterns: ['*_last_seen', '*_uptime', '*_last_boot'] },
    { id: 'updates', label: 'Update entities', patterns: ['update.*'] },
    { id: 'batteries', label: 'Battery levels', patterns: ['sensor.*_battery', 'sensor.*_battery_level'] },
  ];

  /**
   * opts: { store, now: () => ms, lang, speed: 'slow'|'normal'|'fast', cacheSize }
   */
  function createEngine(opts) {
    opts = opts || {};
    var store = opts.store || core.createStore({ localStorage: null, idb: null });
    var nowFn = opts.now || Date.now;
    var lang = opts.lang || 'en';
    var speed = opts.speed || 'normal';
    var cache = core.createLRU(opts.cacheSize || 30);

    var items = [];
    var byId = new Map();
    var excluded = [];            // compiled wildcard patterns
    var excludedSrc = store.get('search.excluded', []) || [];
    var areaIndex = [];           // [{id, name, norm, tokens}]
    var usage = store.get('search.usage', {}) || {};

    function compileExcluded() {
      excluded = excludedSrc.map(function (p) { return wildcardToRegExp(p); });
    }
    compileExcluded();

    // FSC drops entities whose live state is unavailable/unknown/disabled/None and (by default) the ones without an area.
    var hideDead = false, areaOnly = false;
    var DEAD = { unavailable: 1, unknown: 1, disabled: 1, None: 1 };
    function setFilters(f) {
      f = f || {};
      hideDead = !!f.hideUnavailable; areaOnly = !!f.areaOnly;
      cache.clear();
    }
    /** Left out everywhere (search, suggestions, island, alerts): the user's patterns, and dead entities when that filter is on. */
    function isExcluded(item) {
      if (hideDead && DEAD[item.state] === 1) return true;
      return matchesExcluded(item);
    }
    /** Only the user's own exclude patterns (no state involved). */
    function matchesExcluded(item) {
      if (!excluded.length) return false;
      var idl = item.id.toLowerCase();
      var nm = String(item.name || '').toLowerCase();
      for (var i = 0; i < excluded.length; i++) if (excluded[i].test(idl) || excluded[i].test(nm)) return true;
      return false;
    }
    /** Left out of what the user searches and browses: everything isExcluded drops, plus arealess entities when "only with area" is on. */
    function isHidden(item) {
      return isExcluded(item) || (areaOnly && !item.areaId);
    }

    function prepare(item) {
      var d = DOMAIN_LABELS[item.domain];
      var objectId = item.id.split('.').slice(1).join('.');
      var fields = [
        { w: 1.0, toks: tokens(item.name) },
        { w: 0.82, toks: tokens(item.area || '') },
        { w: 0.76, toks: tokens(objectId) },
        { w: 0.7, toks: tokens(item.labels.join(' ')) },
        { w: 0.7, toks: tokens([item.domain.replace(/_/g, ' '), d ? d.en : '', d ? d.de : '', item.deviceClass || ''].join(' ')) },
      ];
      item._f = fields;
      item._nameNorm = norm(item.name);
      item._nameToks = fields[0].toks;
    }

    function rebuildAreas() {
      var seen = new Map();
      items.forEach(function (it) { if (it.areaId && !seen.has(it.areaId)) seen.set(it.areaId, it.area); });
      areaIndex = Array.from(seen.entries()).map(function (e) {
        return { id: e[0], name: e[1], norm: norm(e[1]), toks: tokens(e[1]) };
      });
    }

    function setCollection(list) {
      items = (list || []).map(function (x) { return Object.assign({ labels: [], domain: String(x.id).split('.')[0] }, x); });
      byId = new Map();
      items.forEach(function (it) { prepare(it); byId.set(it.id, it); });
      rebuildAreas();
      cache.clear();
    }

    // ----------------------------------------------------- scoring ----
    // mode 'all': every query word must land (normal). mode 'any': at least one
    // lands, unmatched words just pull the score down (used after a failed intent).
    function fuzzyFor(item, qToks, mode) {
      if (!qToks.length) return 0;
      var total = 0, landed = 0;
      for (var qi = 0; qi < qToks.length; qi++) {
        var q = qToks[qi], best = 0;
        for (var fi = 0; fi < item._f.length; fi++) {
          var f = item._f[fi];
          for (var ti = 0; ti < f.toks.length; ti++) {
            var raw = tokenScore(q, f.toks[ti]);
            if (raw < 0.45) continue;
            var s = raw * (0.6 + 0.4 * f.w);
            if (s > best) best = s;
          }
        }
        if (best === 0) { if (mode === 'any') continue; return 0; } // every query word has to land somewhere
        total += best; landed++;
      }
      if (!landed) return 0;
      var score = total / qToks.length;
      // A query that accounts for the whole name reads as "that is the one".
      if (item._nameToks.length && item._nameToks.length <= qToks.length) {
        var covered = item._nameToks.every(function (nt) { return qToks.some(function (q) { return tokenScore(q, nt) >= 0.45; }); });
        if (covered) score = Math.min(1, score + 0.05);
      }
      return score;
    }

    function usageScore(id, now) {
      var u = usage[id];
      if (!u) return 0;
      var hl = (HALF_LIFE_DAYS[speed] || 14) * DAY_MS;
      var decayed = u.w * Math.pow(2, -(now - u.t) / hl);
      return decayed;
    }
    function maxUsage(now) {
      var m = 0;
      for (var id in usage) { var s = usageScore(id, now); if (s > m) m = s; }
      return m;
    }
    function confidence(id) {
      var u = usage[id];
      var ign = u ? (u.ign || 0) : 0;
      return 1 / (1 + 0.25 * ign); // negative learning
    }
    function hourBoost(id, now) {
      var u = usage[id];
      if (!u || !u.hours) return 0;
      var h = new Date(now).getHours();
      var tot = 0;
      for (var i = 0; i < 24; i++) tot += u.hours[i] || 0;
      return tot ? (u.hours[h] || 0) / tot : 0;
    }
    function relevance(item, now, maxU) {
      var u = maxU > 0 ? usageScore(item.id, now) / maxU : 0;
      var active = ACTIVE_STATES[item.state] ? 1 : 0;
      var dp = DOMAIN_PRIORITY[item.domain] || 0.2;
      var rel = 0.5 * u * confidence(item.id) + 0.2 * active + 0.3 * dp;
      rel += 0.1 * hourBoost(item.id, now) * confidence(item.id);
      return Math.min(1, rel);
    }

    // ----------------------------------------------- intent parser ----
    function matchArea(words) {
      // longest n-gram first so "living room" wins over "living"
      for (var n = Math.min(3, words.length); n >= 1; n--) {
        for (var i = 0; i + n <= words.length; i++) {
          var phrase = words.slice(i, i + n).join(' ');
          var joined = words.slice(i, i + n).join('');
          for (var a = 0; a < areaIndex.length; a++) {
            var ar = areaIndex[a];
            var an = ar.toks.join(' ');
            var aj = ar.toks.join('');
            var hit = phrase === an || joined === aj;
            if (!hit && phrase.length >= 3 && n === ar.toks.length && an.indexOf(phrase) === 0) hit = true; // typed prefix of a whole-area phrase
            if (!hit && n === 1 && ar.toks.length === 1 && phrase.length >= 3 && aj.indexOf(phrase) === 0) hit = true;
            if (!hit && phrase.length >= 5 && Math.abs(an.length - phrase.length) <= 1 && osa(phrase, an, 1) <= 1) hit = true;
            if (!hit && n === 1 && ar.toks.length > 1 && ar.toks.indexOf(phrase) >= 0 && phrase.length >= 4) hit = true; // "living" -> Living Room
            if (hit) return { area: ar, from: i, to: i + n };
          }
        }
      }
      return null;
    }

    function parseIntent(query, chips) {
      var words = tokens(query);
      var intent = { area: null, domain: null, deviceClass: null, state: null, text: '', consumed: [] };
      (chips || []).forEach(function (c) {
        if (c.kind === 'area') { var ar = areaIndex.filter(function (x) { return x.id === c.value; })[0]; if (ar) intent.area = { id: ar.id, name: ar.name }; }
        if (c.kind === 'domain') intent.domain = c.value;
        if (c.kind === 'sensor') { var st = SENSOR_TYPES[c.value]; if (st) { intent.domain = st.domain; intent.deviceClass = st.deviceClass; } }
      });
      var used = new Array(words.length).fill(false);

      if (!intent.area) {
        var am = matchArea(words);
        if (am) { intent.area = { id: am.area.id, name: am.area.name }; for (var k = am.from; k < am.to; k++) used[k] = true; }
      }
      if (!intent.domain) {
        for (var i = 0; i < words.length; i++) {
          if (used[i]) continue;
          var sw = lookupSensorWord(words[i]);
          if (sw) { intent.domain = SENSOR_TYPES[sw].domain; intent.deviceClass = SENSOR_TYPES[sw].deviceClass; used[i] = true; break; }
        }
      }
      if (!intent.domain) {
        for (var j = 0; j < words.length; j++) {
          if (used[j]) continue;
          var dm = lookupDomainWord(words[j]);
          if (dm) { intent.domain = dm; used[j] = true; break; }
        }
      }
      // A state word only counts as a state when something else anchors the query.
      if (intent.area || intent.domain) {
        for (var s = 0; s < words.length; s++) {
          if (used[s]) continue;
          if (STATE_WORDS[words[s]]) { intent.state = STATE_WORDS[words[s]]; used[s] = true; break; }
        }
      }
      intent.text = words.filter(function (w, ix) { return !used[ix]; }).join(' ');
      intent.consumed = words.filter(function (w, ix) { return used[ix]; });
      return intent;
    }

    function stateMatches(item, want) {
      if (!want) return true;
      var s = item.state;
      if (want === 'on') return s === 'on' || s === 'playing' || s === 'open' || s === 'heat' || s === 'cool' || s === 'home' || s === 'cleaning';
      if (want === 'off') return s === 'off' || s === 'idle' || s === 'standby' || s === 'paused' || s === 'closed';
      return s === want;
    }

    // ---------------------------------------------------- search ----
    /**
     * Devices that fit every word of the query but that the list keeps out: the ones Home Assistant reports as unavailable ("hide unavailable")
     * and the working ones that have no room ("only with area"). Searching "bed light" must say that the bed light is offline instead of
     * showing the closest TV, and "lights" must find the lights that were never given a room. Only when nothing live fits as well.
     * -> { offline: [item], unassigned: [item] }
     */
    function hiddenMatches(query, live, relaxed) {
      var none = { offline: [], unassigned: [] };
      if (!hideDead && !areaOnly) return none;
      var q = tokens(query);
      if (!q.length) return none;
      var off = [], un = [];
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        var dead = DEAD[it.state] === 1;
        if (dead ? !hideDead : !(areaOnly && !it.areaId)) continue;               // it is listed anyway
        if (dead && areaOnly && !it.areaId) continue;                             // no room AND offline: nothing useful to show
        if (matchesExcluded(it)) continue;
        var fz = fuzzyFor(it, q, 'all');
        if (fz >= 0.5) (dead ? off : un).push({ item: it, fuzzy: fz });
      }
      var rank = function (a, b) { return b.fuzzy - a.fuzzy || a.item.name.length - b.item.name.length || a.item.name.localeCompare(b.item.name); };
      off.sort(rank); un.sort(rank);
      var best = Math.max(off.length ? off[0].fuzzy : 0, un.length ? un[0].fuzzy : 0);
      if (!best) return none;
      if (!relaxed && live.length && live[0].fuzzy >= best) return none;           // something live fits as well or better: no need to mention the others
      var pick = function (l) { return l.slice(0, 4).map(function (r) { return r.item; }); };
      return { offline: pick(off), unassigned: pick(un) };
    }

    /**
     * search(query, { chips, limit, includeExcluded })
     * -> { results: [{ item, score, fuzzy, relevance }], intent, relaxed, offline: [item], unassigned: [item], tookMs, cached }
     */
    function search(query, o) {
      o = o || {};
      var t0 = Date.now();
      var chips = o.chips || [];
      var limit = o.limit || 50;
      var key = [String(query || ''), JSON.stringify(chips), limit, o.includeExcluded ? 1 : 0].join('\u0001');
      var hit = cache.get(key);
      if (hit) return Object.assign({}, hit, { cached: true });

      var now = nowFn();
      var intent = parseIntent(query, chips);
      var qToks = tokens(intent.text);
      var maxU = maxUsage(now);

      var qFull = tokens(query).join(' ');
      function run(pool, useIntentFilter, mode) {
        var res = [];
        var q = qToks;
        for (var i = 0; i < pool.length; i++) {
          var it = pool[i];
          if (!o.includeExcluded && isHidden(it)) continue;
          if (useIntentFilter) {
            if (intent.area && it.areaId !== intent.area.id) continue;
            if (intent.domain && it.domain !== intent.domain && !(it.domain === 'gadget' && it.deviceClass === intent.domain)) continue;      // the Lights app answers "lights" too
            if (intent.deviceClass && it.deviceClass !== intent.deviceClass) continue;
            if (intent.state && !stateMatches(it, intent.state)) continue;
          }
          var fz;
          if (!q.length) fz = 0.5; // filter-only query ("kitchen light"): everything left matches
          else fz = fuzzyFor(it, q, mode);
          if (fz <= 0) continue;
          var rel = relevance(it, now, maxU);
          var prefix = (qFull && it._nameToks.join(' ').indexOf(qFull) === 0) ? 0.15 : 0;
          res.push({ item: it, fuzzy: fz, relevance: rel, score: fz * 0.7 + rel * 0.3 + prefix });
        }
        res.sort(function (a, b) { return b.score - a.score || a.item.name.localeCompare(b.item.name); });
        return res;
      }

      var hasFilter = !!(intent.area || intent.domain || intent.deviceClass || intent.state);
      var results = run(items, hasFilter, 'all');
      var relaxed = false;
      if (!results.length && hasFilter) {
        // The parser may have misread a word (or consumed all of them); fall back
        // to plain fuzzy over everything, letting a partial match through.
        relaxed = true;
        intent = { area: null, domain: null, deviceClass: null, state: null, text: String(query || ''), consumed: [] };
        qToks = tokens(query);
        results = run(items, false, 'any');
      }
      var hid = o.includeExcluded ? { offline: [], unassigned: [] } : hiddenMatches(query, results, relaxed);
      var out = { results: results.slice(0, limit), total: results.length, intent: intent, relaxed: relaxed, offline: hid.offline, unassigned: hid.unassigned, tookMs: Date.now() - t0, cached: false };
      cache.set(key, out);
      return out;
    }

    /** Live-update an item (state flips, renames) without rebuilding the collection. */
    function patch(id, fields) {
      var it = byId.get(id);
      if (!it) return false;
      var renamed = fields.name != null && fields.name !== it.name;
      Object.assign(it, fields);
      if (renamed) prepare(it);
      cache.clear();
      return true;
    }
    function getItem(id) { return byId.get(id) || null; }

    // ------------------------------------------------ chip ghost ----
    /**
     * complete(partial) -> { ghost, full, kind, value, icon } | null
     * "Kit" -> chen (area), "lam" -> Lampe (domain), "Temp" -> eratur (sensor)
     */
    function complete(partial) {
      var p = norm(partial).trim();
      if (p.length < 2) return null;
      var cands = [];
      areaIndex.forEach(function (a) {
        a.toks.concat([a.toks.join(' ')]).forEach(function (cand) {
          if (cand.indexOf(p) === 0 && cand.length > p.length) cands.push({ kind: 'area', value: a.id, full: a.name, ghost: a.name.slice(p.length), rank: 0 });
        });
        if (a.toks.length && a.toks[0].indexOf(p) === 0 && !cands.some(function (c) { return c.value === a.id; })) {
          cands.push({ kind: 'area', value: a.id, full: a.name, ghost: a.name.slice(p.length), rank: 0 });
        }
      });
      Object.keys(DOMAIN_LABELS).forEach(function (d) {
        var lbl = DOMAIN_LABELS[d][lang === 'de' ? 'de' : 'en'];
        var cand = norm(lbl);
        if (cand.indexOf(p) === 0 && cand.length > p.length) cands.push({ kind: 'domain', value: d, full: lbl, ghost: lbl.slice(p.length), icon: DOMAIN_LABELS[d].icon, rank: 1 });
        else DOMAIN_SYNONYMS[d].some(function (w) {
          var nw = norm(w);
          if (nw.indexOf(p) === 0 && nw.length > p.length && /^[a-z]/.test(nw)) {
            cands.push({ kind: 'domain', value: d, full: lbl, ghost: lbl.length > p.length && norm(lbl).indexOf(p) === 0 ? lbl.slice(p.length) : w.slice(p.length), icon: DOMAIN_LABELS[d].icon, rank: 1.5 });
            return true;
          }
          return false;
        });
      });
      Object.keys(SENSOR_TYPES).forEach(function (k) {
        SENSOR_TYPES[k].words.some(function (w) {
          var nw = norm(w);
          if (nw.indexOf(p) === 0 && nw.length > p.length) {
            var label = k.charAt(0).toUpperCase() + k.slice(1);
            cands.push({ kind: 'sensor', value: k, full: label, ghost: norm(label).indexOf(p) === 0 ? label.slice(p.length) : w.slice(p.length), rank: 2 });
            return true;
          }
          return false;
        });
      });
      if (!cands.length) return null;
      cands.sort(function (a, b) { return a.rank - b.rank || a.ghost.length - b.ghost.length || a.full.localeCompare(b.full); });
      return cands[0];
    }

    // ------------------------------------------------ predictions ----
    function persistUsage() { store.set('search.usage', usage); }

    function recordUse(id) {
      var now = nowFn();
      var u = usage[id] || { w: 0, t: now, n: 0, hours: new Array(24).fill(0), ign: 0 };
      var hl = (HALF_LIFE_DAYS[speed] || 14) * DAY_MS;
      u.w = u.w * Math.pow(2, -(now - u.t) / hl) + 1;   // decay what was there, add this use
      u.t = now;
      u.n = (u.n || 0) + 1;
      var h = new Date(now).getHours();
      u.hours = (u.hours || new Array(24).fill(0)).map(function (v) { return v * 0.98; });
      u.hours[h] += 1;
      u.ign = Math.max(0, (u.ign || 0) - 2);            // using it forgives past ignores
      usage[id] = u;
      cache.clear();
      persistUsage();
    }
    /** Seeds the learning from another card's use counts ([{id, n}]); never overwrites what this card has learned itself. */
    function importUsage(list) {
      var now = nowFn(), changed = 0;
      (list || []).forEach(function (e) {
        if (!e || !e.id || !(e.n > 0) || usage[e.id]) return;
        usage[e.id] = { w: e.n, t: now, n: e.n, hours: new Array(24).fill(0), ign: 0 }; changed++;
      });
      if (changed) { cache.clear(); persistUsage(); }
      return changed;
    }
    /** Replays another card's history ([{id, ts, type: 'use'|'ignore', hour}]) in time order, with the same decay as live use. */
    function importPatterns(list) {
      var rows = (list || []).filter(function (e) { return e && e.id && e.ts > 0; }).sort(function (a, b) { return a.ts - b.ts; }), done = 0;
      rows.forEach(function (e) {
        var u = usage[e.id] || { w: 0, t: e.ts, n: 0, hours: new Array(24).fill(0), ign: 0 };
        if (e.type === 'ignore') { u.ign = Math.min(12, (u.ign || 0) + 1); }
        else {
          var hl = (HALF_LIFE_DAYS[speed] || 14) * DAY_MS;
          u.w = u.w * Math.pow(2, -(e.ts - u.t) / hl) + 1; u.t = e.ts; u.n = (u.n || 0) + 1;
          u.hours = (u.hours || new Array(24).fill(0)).map(function (v) { return v * 0.98; }); u.hours[(e.hour != null ? e.hour : new Date(e.ts).getHours()) % 24] += 1;
          u.ign = Math.max(0, (u.ign || 0) - 2);
        }
        usage[e.id] = u; done++;
      });
      if (done) { cache.clear(); persistUsage(); }
      return done;
    }
    function recordIgnored(ids) {
      var now = nowFn();
      (ids || []).forEach(function (id) {
        var u = usage[id] || { w: 0, t: now, n: 0, hours: new Array(24).fill(0), ign: 0 };
        u.ign = Math.min(12, (u.ign || 0) + 1);
        usage[id] = u;
      });
      cache.clear();
      persistUsage();
    }
    function resetLearning() { usage = {}; cache.clear(); persistUsage(); }

    function totalEvents() { var n = 0; for (var id in usage) n += usage[id].n || 0; return n; }

    /** Suggestions: learned when there is history, bootstrapped from domain priority + live state when not. */
    function suggest(n, o) {
      o = o || {};
      var now = nowFn();
      var maxU = maxUsage(now);
      var cold = totalEvents() < 5;
      var pool = items.filter(function (it) { return !isHidden(it) && (!o.domain || it.domain === o.domain); });
      var scored = pool.map(function (it) {
        var rel = relevance(it, now, maxU);
        var s = cold ? (0.3 * (DOMAIN_PRIORITY[it.domain] || 0.2) + (ACTIVE_STATES[it.state] ? 0.2 : 0) + 0.0001) : rel;
        // Sensors/automations clutter a "what do I want" shelf unless actually used.
        if (cold && (it.domain === 'sensor' || it.domain === 'binary_sensor' || it.domain === 'automation' || it.domain === 'person')) s *= 0.4;
        return { item: it, score: s };
      });
      scored.sort(function (a, b) { return b.score - a.score || a.item.name.localeCompare(b.item.name); });
      var want = n || 6;
      if (!cold) return scored.slice(0, want).map(function (x) { return x.item; });
      // Nothing learned yet: show a mix (lamp, TV, robot, speaker, lock...) instead of ten lights; one per kind first, then fill up.
      var per = {}, out = [], rest = [];
      scored.forEach(function (x) { var d = x.item.domain; per[d] = (per[d] || 0) + 1; (per[d] <= 1 ? out : rest).push(x.item); });
      return out.concat(rest).slice(0, want);
    }

    // --------------------------------------- excluded patterns ----
    function setExcluded(patterns) {
      excludedSrc = Array.from(new Set((patterns || []).map(function (p) { return String(p).trim(); }).filter(Boolean)));
      compileExcluded();
      store.set('search.excluded', excludedSrc);
      cache.clear();
    }
    function previewExcluded(patterns) {
      var rx = (patterns || []).map(wildcardToRegExp);
      return items.filter(function (it) {
        var idl = it.id.toLowerCase(), nm = String(it.name || '').toLowerCase();
        return rx.some(function (r) { return r.test(idl) || r.test(nm); });
      });
    }
    function exportExcluded() { return JSON.stringify({ version: 1, patterns: excludedSrc }, null, 2); }
    function importExcluded(json) {
      var data = JSON.parse(json);
      var list = Array.isArray(data) ? data : data && data.patterns;
      if (!Array.isArray(list)) throw new Error('expected {"patterns": [...]} or an array');
      setExcluded(list.filter(function (p) { return typeof p === 'string'; }));
      return excludedSrc.slice();
    }

    return {
      setCollection: setCollection,
      patch: patch,
      getItem: getItem,
      search: search,
      complete: complete,
      parseIntent: function (q, chips) { return parseIntent(q, chips); },
      recordUse: recordUse,
      importUsage: importUsage,
      importPatterns: importPatterns,
      recordIgnored: recordIgnored,
      resetLearning: resetLearning,
      suggest: suggest,
      setExcluded: setExcluded,
      setFilters: setFilters,
      getExcluded: function () { return excludedSrc.slice(); },
      previewExcluded: previewExcluded,
      exportExcluded: exportExcluded,
      importExcluded: importExcluded,
      setSpeed: function (s) { speed = HALF_LIFE_DAYS[s] ? s : 'normal'; cache.clear(); },
      setLang: function (l) { lang = l; },
      all: function () { return items; },
      usageOf: function (id) { return usageScore(id, nowFn()); },
      isExcluded: isExcluded,
      isHidden: isHidden,
      get size() { return items.length; },
      get cacheSize() { return cache.size; },
      get areas() { return areaIndex.map(function (a) { return { id: a.id, name: a.name }; }); },
    };
  }

  var api = {
    createEngine: createEngine,
    buildCollection: buildCollection,
    norm: norm,
    tokens: tokens,
    osa: osa,
    tokenScore: tokenScore,
    DOMAIN_SYNONYMS: DOMAIN_SYNONYMS,
    DOMAIN_LABELS: DOMAIN_LABELS,
    SENSOR_TYPES: SENSOR_TYPES,
    EXCLUDE_TEMPLATES: DEFAULT_EXCLUDE_TEMPLATES,
    wildcardToRegExp: wildcardToRegExp,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.search = api; }
})(typeof globalThis !== 'undefined' ? globalThis : window);

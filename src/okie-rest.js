/* okie-rest: screensaver, deep rest, wake sources, display handoff, photo frame.
 *
 *   active --idle--> saver (the locked clock page) --more idle--> deep rest
 *   deep rest dims with an overlay, shrinks the clock, fades the text and moves
 *   the text block a few pixels every three minutes against burn-in; inside the
 *   quiet hours the dim is deeper.
 *   Wake sources (a motion sensor, a doorbell, a critical alert) wake it like a
 *   touch. When nobody is home the return to the clock page comes sooner.
 *   Display handoff switches a screen entity (for example Fully Kiosk's screen
 *   switch) off when deep rest begins and on again at wake.
 *   Photo frame: during deep rest the picture behind the clock cycles through a
 *   media folder, resolved fresh for every change.
 *
 * createMachine is pure (injected time) and fully unit-tested.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var core = isNode ? require('./okie-core.js') : g.OkieMotor.core;
  var L = isNode ? require('./okie-logic.js') : g.OkieMotor.logic;

  var SHIFTS = [[0, 0], [14, -10], [-12, 12], [10, 14], [-14, -8]];   // burn-in offsets, px
  var SHIFT_MS = 3 * 60000;

  /**
   * cfg: { enabled, saverAfterSec, deepAfterSec, awaySaverAfterSec, screenEntity, screenOffScript, screenOnScript }
   * createMachine(cfg) ->
   *   activity(now, source?) -> result      a touch / key / wake
   *   tick(now, env) -> result              env: { nobodyHome, quiet }
   * result: { phase, changed, dim, shift, effects: [{type:'display', on, entity, script}] }
   */
  function createMachine(cfgIn) {
    var cfg = cfgIn || {};
    var m = { phase: 'active', since: 0, lastActivity: null, shiftIdx: 0, shiftAt: 0, wakeSource: null };
    function dim(quiet) { return m.phase === 'deep' ? (quiet ? 0.9 : 0.72) : 0; }
    function res(changed, effects, quiet) { return { phase: m.phase, changed: !!changed, dim: dim(quiet), shift: SHIFTS[m.shiftIdx], effects: effects || [], wakeSource: m.wakeSource }; }
    function displayEffect(on) { return { type: 'display', on: on, entity: cfg.screenEntity || '', script: on ? (cfg.screenOnScript || '') : (cfg.screenOffScript || '') }; }
    return {
      get phase() { return m.phase; },
      setConfig: function (c) { cfg = c || {}; },
      activity: function (now, source) {
        m.lastActivity = now; m.wakeSource = source || null;
        if (m.phase === 'active') return res(false);
        var was = m.phase;
        m.phase = 'active'; m.since = now; m.shiftIdx = 0;
        return res(true, was === 'deep' ? [displayEffect(true)] : []);
      },
      tick: function (now, env) {
        env = env || {};
        if (!cfg.enabled) return res(false);
        if (m.lastActivity == null) m.lastActivity = now;
        if (m.phase === 'active') {
          var limit = (env.nobodyHome ? (cfg.awaySaverAfterSec || cfg.saverAfterSec) : cfg.saverAfterSec) * 1000;
          if (now - m.lastActivity >= limit) { m.phase = 'saver'; m.since = now; return res(true); }
        } else if (m.phase === 'saver') {
          if (now - m.since >= cfg.deepAfterSec * 1000) { m.phase = 'deep'; m.since = now; m.shiftAt = now; return res(true, cfg.screenEntity || cfg.screenOffScript ? [displayEffect(false)] : [], env.quiet); }
        } else if (m.phase === 'deep') {
          if (now - m.shiftAt >= SHIFT_MS) { m.shiftAt = now; m.shiftIdx = (m.shiftIdx + 1) % SHIFTS.length; return res(true, [], env.quiet); }
        }
        return res(false, [], env.quiet);
      },
    };
  }
  /** Round-robin through the photo list, never repeating the same one twice in a row. */
  function nextPhoto(list, i) { return list.length ? (i + 1) % list.length : -1; }
  /** Which of the configured wake entities just turned on / rang? */
  function wakeHit(changes, wakeIds) {
    var set = new Set(wakeIds || []);
    return changes.filter(function (c) { return set.has(c.id) && c.next && c.old && c.old.state !== c.next.state && (c.next.state === 'on' || c.next.state === 'detected' || c.next.state === 'ringing' || c.next.state === 'home' && false); })
      .map(function (c) { return c.id; });
  }

  var yes = function (en, de) { return { en: en, de: de }; };
  var GRP = yes('Screensaver & deep rest', 'Bildschirmschoner & Tiefschlaf');
  var DEFAULTS = {
    rest: { enabled: false, lockAfter: '', saverAfterSec: 300, deepAfterSec: 120, awaySaverAfterSec: 60, wakeEntities: '', screenEntity: '', screenOffScript: '', screenOnScript: '', photoFolder: '', photoSec: 30 },
  };
  var SETTINGS_ROWS = [
    { id: 'r_lock', tab: 'general', onTab: true, group: GRP, type: 'segment', path: 'rest.lockAfter', read: lockValue, label: yes('Back to the lock page after', 'Zurück zur Sperrseite nach'),
      desc: yes('How long the card waits without a touch before it returns to the clock and quote page, then dims deeply. Meant for wall tablets; phones never do it.', 'Wie lange die Karte ohne Berührung wartet, bis sie zur Uhr- und Zitat-Seite zurückkehrt und dann stark dimmt. Gedacht für Wandtablets; Handys tun das nie.'),
      options: [{ id: '30', label: yes('30 seconds', '30 Sekunden') }, { id: '60', label: yes('1 minute', '1 Minute') }, { id: '120', label: yes('2 minutes', '2 Minuten') }, { id: '300', label: yes('5 minutes', '5 Minuten') }, { id: 'never', label: yes('Never', 'Nie') }] },
    { id: 'r_deep', tab: 'general', group: GRP, type: 'slider', path: 'rest.deepAfterSec', min: 30, max: 1800, step: 30, unit: 's', label: yes('Time until deep rest', 'Zeit bis zum Tiefschlaf'), desc: yes('Further quiet seconds before the screen dims and starts moving against burn-in.', 'Weitere ruhige Sekunden, bis der Bildschirm dimmt und sich gegen Einbrennen bewegt.') },
    { id: 'r_away', tab: 'general', group: GRP, type: 'slider', path: 'rest.awaySaverAfterSec', min: 15, max: 600, step: 15, unit: 's', label: yes('Idle time when nobody is home', 'Leerlauf, wenn niemand zuhause ist'), desc: yes('The clock page comes sooner when every person is away.', 'Die Uhrzeit-Seite kommt früher, wenn alle Personen weg sind.') },
    { id: 'r_wake', tab: 'general', group: GRP, type: 'text', path: 'rest.wakeEntities', placeholder: 'binary_sensor.hall_motion, binary_sensor.doorbell', label: yes('Wake sources', 'Weck-Quellen'), desc: yes('Entities that wake the card like a touch when they switch on: a motion sensor or a doorbell. A critical alert always wakes it.', 'Entitäten, die die Karte wie eine Berührung wecken, wenn sie angehen: Bewegungsmelder oder Türklingel. Ein kritischer Alarm weckt immer.') },
    { id: 'r_screen', tab: 'general', group: GRP, type: 'entity', domain: 'switch', path: 'rest.screenEntity', label: yes('Display handoff entity', 'Display-Übergabe-Entität'), desc: yes('A screen switch, for example Fully Kiosk. It is switched off at deep rest and on again at wake.', 'Ein Bildschirm-Schalter, z. B. Fully Kiosk. Er wird im Tiefschlaf aus- und beim Aufwachen eingeschaltet.') },
    { id: 'r_off', tab: 'general', group: GRP, type: 'entity', domain: 'script', path: 'rest.screenOffScript', label: yes('Script when deep rest begins', 'Skript beim Tiefschlaf'), desc: yes('Optional script to run when the display is handed off.', 'Optionales Skript beim Abgeben des Displays.') },
    { id: 'r_on2', tab: 'general', group: GRP, type: 'entity', domain: 'script', path: 'rest.screenOnScript', label: yes('Script at wake', 'Skript beim Aufwachen'), desc: yes('Optional script to run when the card wakes up.', 'Optionales Skript beim Aufwachen der Karte.') },
    { id: 'r_photo', tab: 'general', group: GRP, type: 'text', path: 'rest.photoFolder', placeholder: 'media-source://media_source/local/photos', label: yes('Photo frame folder', 'Fotorahmen-Ordner'), desc: yes('During deep rest the picture behind the clock cycles through this media folder.', 'Im Tiefschlaf wechselt das Bild hinter der Uhr durch diesen Medienordner.') },
    { id: 'r_photosec', tab: 'general', group: GRP, type: 'slider', path: 'rest.photoSec', min: 10, max: 300, step: 10, unit: 's', label: yes('Seconds per photo', 'Sekunden pro Foto'), desc: yes('How long each photo stays.', 'Wie lange jedes Foto bleibt.') },
  ];

  var LOCK_CHOICES = ['30', '60', '120', '300'];
  /** The settings as the screensaver machine reads them: "Back to the lock page after" wins; without it the older enabled / saverAfterSec pair (a dashboard's YAML) still works. */
  function effectiveRest(r) {
    var c = Object.assign({}, r), v = c.lockAfter == null ? '' : String(c.lockAfter);
    if (v === 'never') c.enabled = false;
    else if (v && +v > 0) { c.enabled = true; c.saverAfterSec = +v; }
    return c;
  }
  /** Which choice of the row is the current one (for a dashboard that only sets enabled / saverAfterSec: the nearest of the four times, or never). */
  function lockValue(settings) {
    var r = (settings && settings.rest) || {}, v = r.lockAfter == null ? '' : String(r.lockAfter);
    if (v === 'never' || LOCK_CHOICES.indexOf(v) >= 0) return v;
    if (!r.enabled) return 'never';
    var s = +r.saverAfterSec || 300;
    return LOCK_CHOICES.reduce(function (best, c) { return Math.abs(+c - s) < Math.abs(+best - s) ? c : best; }, LOCK_CHOICES[0]);
  }

  var api = { createMachine: createMachine, effectiveRest: effectiveRest, lockValue: lockValue, SHIFTS: SHIFTS, SHIFT_MS: SHIFT_MS, nextPhoto: nextPhoto, wakeHit: wakeHit , DEFAULTS: DEFAULTS, SETTINGS_ROWS: SETTINGS_ROWS };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor.defaults = Object.assign(g.OkieMotor.defaults || {}, DEFAULTS);
  g.OkieMotor.settingsRows = (g.OkieMotor.settingsRows || []).concat(SETTINGS_ROWS);

  // ------------------------------------------------------------- UI ----
  var UI = g.OkieMotor.ui, h = UI.h;

  var CSS = [
    '.rest{position:absolute;inset:0;z-index:3;pointer-events:none;display:none;align-items:center;justify-content:center;flex-direction:column;background:#0b0a09;color:#fff;overflow:hidden;cursor:pointer;}',
    '.rest.on{display:flex;animation:rest-in .6s ease;}@keyframes rest-in{from{opacity:0;}to{opacity:1;}}',
    '.rest .photo{position:absolute;inset:0;background:center/cover;opacity:0;transition:opacity 2s ease;}.rest .photo.on{opacity:1;}',
    '.rest .shade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity 1.5s ease;pointer-events:none;}',
    '.rest .txt{position:relative;text-align:center;transition:transform 4s ease,opacity 1.5s ease;text-shadow:0 2px 24px rgba(0,0,0,.45);}',
    '.rest .clk{font-size:min(22vw,168px);font-weight:200;letter-spacing:-.04em;line-height:1;transition:font-size 1.5s ease;}',
    '.rest .dte{font-size:22px;margin-top:10px;opacity:.85;}.rest .ctxl{font-size:15px;margin-top:18px;opacity:.7;}',
    '.rest.deep .clk{font-size:min(12vw,92px);}.rest.deep .txt{opacity:.55;}.rest.deep .dte,.rest.deep .ctxl{opacity:.35;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  api.mount = function (ctx) {
    var cfg = function () {
      var r = ctx.settings.get().rest || {}, c = effectiveRest(r), desk = false;
      try { desk = !!(g.matchMedia && g.matchMedia('(hover: hover) and (pointer: fine)').matches); } catch (e) { /* no media query: treat as a wall display */ }
      if (ctx.host && ctx.host._mobile) return Object.assign({}, c, { enabled: false });
      if (desk && LOCK_CHOICES.indexOf(String(r.lockAfter)) < 0) return Object.assign({}, c, { enabled: false });      // a computer with a mouse never goes dark on its own, unless you picked a time in the settings
      return c;
    };      // a phone is not a wall display: no return to the clock page there
    var machine = createMachine(cfg());
    var layer = h('div.rest', { role: 'dialog', 'aria-label': 'Screensaver', tabindex: '-1' });
    var photoA = h('div.photo'), photoB = h('div.photo'), shade = h('div.shade');
    var clock = h('div.clk'), date = h('div.dte'), ctxl = h('div.ctxl'), txt = h('div.txt', null, clock, date, ctxl);
    layer.appendChild(photoA); layer.appendChild(photoB); layer.appendChild(shade);
    ctx.stage.appendChild(layer);
    var photos = [], photoIdx = -1, photoFront = photoA, photoTimer = 0, photosAt = 0, lastAct = 0;

    function lang() { return ctx.lang(); }
    function paintClock() {
      var tf = ctx.settings.get().timeFormat, o = { hour: '2-digit', minute: '2-digit' };
      if (tf === '12h') o.hour12 = true; else if (tf === '24h') o.hour12 = false;
      var d = new Date();
      clock.textContent = d.toLocaleTimeString(lang(), o);
      date.textContent = d.toLocaleDateString(lang(), { weekday: 'long', day: 'numeric', month: 'long' });
      var rec = ctx.chronicle && ctx.chronicle.recent(1)[0];
      ctxl.textContent = rec ? L.shortName(rec.name, rec.area) + ' · ' + rec.text + ' · ' + L.relativeTime(Date.now() - rec.ts, lang()) : '';
    }
    function nobodyHome() {
      var st = ctx.hass().states, people = Object.keys(st).filter(function (k) { return k.indexOf('person.') === 0; });
      return people.length > 0 && people.every(function (k) { return st[k].state !== 'home'; });
    }
    function quiet() { var n = ctx.settings.get().notifications || {}; return L.inQuietHours(Date.now(), n.quietFrom, n.quietTo); }

    function runEffects(list) {
      (list || []).forEach(function (e) {
        if (e.type !== 'display') return;
        if (e.entity) ctx.call('homeassistant', e.on ? 'turn_on' : 'turn_off', { entity_id: e.entity }).catch(function () {});
        if (e.script) ctx.call('script', 'turn_on', { entity_id: e.script }).catch(function () {});
      });
    }
    function apply(r) {
      layer.classList.toggle('on', r.phase === 'deep');
      layer.classList.toggle('deep', r.phase === 'deep');
      shade.style.opacity = String(r.dim);
      txt.style.transform = 'translate(' + r.shift[0] + 'px,' + r.shift[1] + 'px)';
      if (r.phase !== 'active') paintClock();
      if (r.phase === 'deep') startPhotos(); else stopPhotos();
      if (r.changed) ctx.bus.emit('rest', { phase: r.phase });
      runEffects(r.effects);
    }

    // photo frame: resolved fresh for every change
    function loadPhotos() {
      var folder = cfg().photoFolder;
      if (!folder) return Promise.resolve([]);
      if (photos.length && Date.now() - photosAt < 10 * 60000) return Promise.resolve(photos);
      return Promise.resolve(ctx.callWS({ type: 'media_source/browse_media', media_content_id: folder })).then(function (r) {
        photos = ((r && r.children) || []).filter(function (k) { return k.media_class === 'image' && !k.can_expand; }); photosAt = Date.now(); return photos;
      }, function () { return []; });
    }
    function showNextPhoto() {
      loadPhotos().then(function (list) {
        if (!list.length) return;
        photoIdx = nextPhoto(list, photoIdx);
        return Promise.resolve(ctx.callWS({ type: 'media_source/resolve_media', media_content_id: list[photoIdx].media_content_id, expires: 3600 })).then(function (res) {
          var back = photoFront === photoA ? photoB : photoA;
          back.style.backgroundImage = 'url("' + res.url + '")';
          back.classList.add('on'); photoFront.classList.remove('on'); photoFront = back;
        });
      }).catch(function () {});
    }
    function startPhotos() { if (photoTimer || !cfg().photoFolder) return; showNextPhoto(); photoTimer = setInterval(showNextPhoto, Math.max(10, cfg().photoSec) * 1000); }
    function stopPhotos() { clearInterval(photoTimer); photoTimer = 0; photoA.classList.remove('on'); photoB.classList.remove('on'); }

    // activity: any touch/key/wheel counts, throttled to once a second
    function touch() { var n = Date.now(); if (n - lastAct < 1000 && machine.phase === 'active') return; lastAct = n; apply(machine.activity(n)); }
    var evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'];
    evs.forEach(function (e) { g.addEventListener(e, touch, { passive: true, capture: true }); });
    layer.addEventListener('click', function () { apply(machine.activity(Date.now())); });
    function back() { if (!g.document.hidden) { lastAct = Date.now(); apply(machine.activity(lastAct, 'return')); } }      // the time the page was out of sight (another app in front) is not idle time
    g.document.addEventListener('visibilitychange', back);

    // wake sources and critical alerts
    var offStates = ctx.bus.on('states', function (changes) {
      var ids = String(cfg().wakeEntities || '').split(/[\s,]+/).filter(Boolean);
      var hit = wakeHit(changes, ids);
      if (hit.length) apply(machine.activity(Date.now(), hit[0]));
    });
    var offNotes = ctx.bus.on('notes', function (list) { if (list.some(function (n) { return n.severity === 'critical'; })) apply(machine.activity(Date.now(), 'alert')); });

    var timer = setInterval(function () {
      machine.setConfig(cfg());
      apply(machine.tick(Date.now(), { nobodyHome: nobodyHome(), quiet: quiet() }));
      if (machine.phase !== 'active') paintClock();
    }, 5000);

    return {
      machine: machine,
      update: function () { machine.setConfig(cfg()); },
      dispose: function () { clearInterval(timer); g.document.removeEventListener('visibilitychange', back); stopPhotos(); evs.forEach(function (e) { g.removeEventListener(e, touch, true); }); offStates(); offNotes(); layer.remove(); },
    };
  };
  g.OkieMotor.rest = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

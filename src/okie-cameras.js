/* okie-cameras: every camera Home Assistant knows, one tap from the start screen.
 *
 *   - the Cameras CARD under the top-right slider: the last motion picture, a "View Cameras" pill and a bell with the number of
 *     new motion events; the pill opens the Cameras app, the bell opens the motion history
 *   - the Cameras app: a grid of cameras, tap one for the live view, the other cameras stay one tap away underneath
 *   - the Motion history app: the ring and motion events of the last seven days, newest first, the newest with its picture
 *   - liveView(): what the detail view of a camera uses too (it stops by itself after two minutes: an open stream drains a battery camera
 *     and blocks its motion events)
 *   - the optional slider page "Cameras"
 *
 * Live video comes from Home Assistant itself: its picture-entity card in live mode, built with the frontend's card helpers, so
 * WebRTC, HLS and MJPEG work for whatever integration the camera belongs to (Ring, UniFi, Frigate, generic ...). Where the helpers do not
 * exist (the browser test page) a snapshot that refreshes every few seconds stands in.
 *
 * The pure part (which sensors belong to which camera, the event list from the history, days, unseen counts) is unit-tested.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // ---------------------------------------------------------- pure ----
  // "camera.front_door_live_view" and "binary_sensor.front_door_motion" belong together: strip what integrations append to the name.
  var TRAIL = /_(live_view|snapshot|last_recording|last_activity|cam|camera|stream|sd|hd|main|sub|mainstream|substream|fluent|clear|high|low|profile\d*|channel_\d+)$/;
  function cameraKey(id) {
    var o = String(id).split('.').slice(1).join('.') || String(id), prev;
    do { prev = o; o = o.replace(TRAIL, ''); } while (o !== prev && o);
    return o || (String(id).split('.')[1] || String(id));
  }
  var ALERT_WORDS = /(motion|ding|doorbell|ring|person|pet|animal|vehicle|package|visitor|intrusion|sound|occupancy|human|moving)/;
  var ALERT_CLASSES = { motion: 1, occupancy: 1, sound: 1, moving: 1, doorbell: 1 };
  var ALERT_WINDOW_MS = 120000;          // an event (a ring, a motion) counts as "now" for two minutes
  function objectOf(id) { return String(id).slice(String(id).indexOf('.') + 1); }
  function domainOf(id) { return String(id).split('.')[0]; }
  function looksLikeAlert(id, st) { var dc = st && st.attributes && st.attributes.device_class; return !!ALERT_CLASSES[dc] || ALERT_WORDS.test(objectOf(id)); }
  /**
   * Does this entity say "something is happening at a camera right now"?
   *  - a binary_sensor that looks like motion / occupancy / sound / a ring and is on
   *  - an event entity (Home Assistant's Ring integration reports motion and the doorbell that way) whose last event is under two minutes old
   */
  function isAlertSensor(id, st, now) {
    if (!st) return false;
    var dom = domainOf(id), looks = looksLikeAlert(id, st);
    if (dom === 'binary_sensor') return looks && st.state === 'on';
    if (dom === 'event') {
      if (!looks) return false;
      var ts = Date.parse(st.state);
      return isFinite(ts) && now - ts > -5000 && now - ts < ALERT_WINDOW_MS;
    }
    return false;
  }
  function keysOf(cameraIds) { return cameraIds.map(function (id) { return { id: id, key: cameraKey(id) }; }).filter(function (k) { return k.key; }); }
  /** the camera whose name the sensor starts with; the longest name wins */
  function ownerOf(sid, keys) {
    var obj = objectOf(sid), best = null;
    keys.forEach(function (k) { if ((obj === k.key || obj.indexOf(k.key + '_') === 0) && (!best || k.key.length > best.key.length)) best = k; });
    return best;
  }

  /**
   * cameraAlerts(states, cameraIds, now) -> { byCamera: { id: [sensorId, ...] }, ids: [...], total }
   * An alerting sensor belongs to the camera whose name it starts with (the longest match wins).
   */
  function cameraAlerts(states, cameraIds, now) {
    now = now == null ? Date.now() : now;
    var keys = keysOf(cameraIds), byCamera = {}, ids = [];
    cameraIds.forEach(function (id) { byCamera[id] = []; });
    Object.keys(states || {}).forEach(function (sid) {
      if (!isAlertSensor(sid, states[sid], now)) return;
      var best = ownerOf(sid, keys);
      if (best) { byCamera[best.id].push(sid); ids.push(sid); }
    });
    return { byCamera: byCamera, ids: ids, total: ids.length };
  }

  /**
   * listCameras(states, { hideUnavailable, excluded(id), now }) -> [{ id, name, state, picture, unavailable, alerts: [...] }]
   * Cameras that see something come first, then working ones, then the offline ones, each group by name.
   */
  function listCameras(states, o) {
    o = o || {};
    var ids = Object.keys(states || {}).filter(function (k) { return k.indexOf('camera.') === 0 && !(o.excluded && o.excluded(k)); });
    var al = cameraAlerts(states, ids, o.now);
    var list = ids.map(function (id) {
      var st = states[id], a = st.attributes || {};
      return { id: id, name: a.friendly_name || id.split('.')[1].replace(/_/g, ' '), state: st.state, picture: a.entity_picture || '', unavailable: st.state === 'unavailable' || st.state === 'unknown', alerts: al.byCamera[id] || [] };
    }).filter(function (c) { return !(o.hideUnavailable && c.unavailable); });
    function rank(c) { return c.alerts.length ? 0 : (c.unavailable ? 2 : 1); }
    list.sort(function (a, b) { return rank(a) - rank(b) || a.name.localeCompare(b.name); });
    return list;
  }

  // ---- the last motion picture and the history of events
  // an image entity called "...last_motion", "...last_ring", "...last_event" (the Kindle deck's "Patio last motion" is one)
  var LAST_IMAGE = /(^|_)last_(motion|ring|ding|event|activity|person|doorbell)(_|$)|(^|_)(motion|doorbell)_(snapshot|image|picture)(_|$)/;
  /** lastMotionImage(states, explicitEntityId) -> { id, picture, ts, kind } | null */
  function lastMotionImage(states, explicit) {
    var id = explicit && states && states[explicit] ? explicit : null;
    if (!id) id = Object.keys(states || {}).filter(function (k) { return k.indexOf('image.') === 0 && LAST_IMAGE.test(objectOf(k)); }).sort()[0] || null;
    if (!id) return null;
    var st = states[id], a = st.attributes || {}, ts = Date.parse(st.state);
    return { id: id, picture: a.entity_picture || '', ts: isFinite(ts) ? ts : 0, kind: a.kind || '' };
  }

  /** every event or binary sensor that reports motion or a ring for one of the cameras, whatever it says right now: [{ id, camera }] */
  function alertSources(states, cameraIds) {
    var keys = keysOf(cameraIds), out = [];
    Object.keys(states || {}).forEach(function (sid) {
      var dom = domainOf(sid);
      if ((dom !== 'event' && dom !== 'binary_sensor') || !looksLikeAlert(sid, states[sid])) return;
      var best = ownerOf(sid, keys);
      if (best) out.push({ id: sid, camera: best.id });
    });
    return out;
  }
  /** "ring" for the doorbell, "motion" for everything else */
  function kindOf(id, st) {
    var dc = st && st.attributes && st.attributes.device_class;
    return dc === 'doorbell' || /(^|_)(ding|doorbell|ring|visitor)(_|$)/.test(objectOf(id)) ? 'ring' : 'motion';
  }

  /**
   * eventsFromHistory(result, sources, states, dedupeMs) -> [{ ts, id, camera, kind }], newest first
   * result is Home Assistant's history/history_during_period answer ({ entityId: [{ s: state, lu: lastUpdatedSeconds }, ...] }).
   * An event entity carries the time of its event as its state; a binary sensor counts when it turns on. The same thing reported twice
   * (by the event and by the sensor) within a few seconds is one event.
   */
  function eventsFromHistory(result, sources, states, dedupeMs) {
    var out = [];
    (sources || []).forEach(function (src) {
      var rows = (result && result[src.id]) || [], dom = domainOf(src.id), kind = kindOf(src.id, states && states[src.id]);
      rows.forEach(function (r) {
        var s = r.s != null ? r.s : r.state;
        var lu = r.lu != null ? r.lu * 1000 : (r.last_updated ? Date.parse(r.last_updated) : NaN);
        if (dom === 'binary_sensor') { if (s === 'on' && isFinite(lu)) out.push({ ts: lu, id: src.id, camera: src.camera, kind: kind }); return; }
        var ts = Date.parse(s); if (!isFinite(ts)) ts = lu;
        if (isFinite(ts)) out.push({ ts: ts, id: src.id, camera: src.camera, kind: kind });
      });
    });
    out.sort(function (a, b) { return b.ts - a.ts; });
    var win = dedupeMs == null ? 4000 : dedupeMs, kept = [];
    out.forEach(function (e) { if (!kept.some(function (k) { return k.camera === e.camera && k.kind === e.kind && Math.abs(k.ts - e.ts) <= win; })) kept.push(e); });
    return kept;
  }
  var DAY = 86400000;
  function startOfDay(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
  /** groupByDay(events, now) -> [{ daysAgo, start, events }] newest day first (events keep their order) */
  function groupByDay(events, now) {
    var today = startOfDay(now), groups = [], by = {};
    (events || []).forEach(function (e) {
      var s = startOfDay(e.ts), n = Math.round((today - s) / DAY);
      if (!by[s]) { by[s] = { daysAgo: n, start: s, events: [] }; groups.push(by[s]); }
      by[s].events.push(e);
    });
    return groups;
  }
  /** how many events are newer than the moment the history was last opened */
  function unseenCount(events, seenAt) { return (events || []).filter(function (e) { return e.ts > (seenAt || 0); }).length; }

  /** The server's recordings page (the Ring clips recorder): cameras.clipsUrl, else https://<this host>:8765/ring; cameras.recordings = false turns it off. */
  function recordingsBase(cfg, loc) {
    cfg = cfg || {};
    if (cfg.recordings === false) return '';
    if (cfg.clipsUrl) return safeHttpUrl(cfg.clipsUrl);            // an address from settings (settings can be imported): only a web address or a path, never javascript: or data:
    return loc && loc.protocol === 'https:' && loc.hostname ? 'https://' + loc.hostname + ':8765/ring' : '';
  }
  /** An address that is a web address (http or https) or a path on this site, else ''. It is parsed the way the browser parses it, so "java\tscript:" and upper case schemes do not get through. */
  function safeHttpUrl(v) {
    var s = typeof v === 'string' ? v.trim() : '';
    if (!s) return '';
    try { var u = new URL(s, 'https://okie-motor.invalid/'); return u.protocol === 'http:' || u.protocol === 'https:' ? s : ''; } catch (e) { return ''; }
  }
  /** The link that opens the recording of one event: the page plays the clip that was running at that second (embed = a page for a frame, it tells the dashboard when it is closed). */
  function recordingLink(base, tsMs) { base = safeHttpUrl(base); return base ? base + (base.indexOf('?') < 0 ? '?' : '&') + 'ts=' + Math.round(tsMs / 1000) + '&embed=1' : ''; }

  var pureApi = {
    recordingsBase: recordingsBase, recordingLink: recordingLink, safeHttpUrl: safeHttpUrl,
    cameraKey: cameraKey, isAlertSensor: isAlertSensor, cameraAlerts: cameraAlerts, listCameras: listCameras,
    lastMotionImage: lastMotionImage, alertSources: alertSources, kindOf: kindOf, eventsFromHistory: eventsFromHistory, groupByDay: groupByDay, unseenCount: unseenCount,
  };
  if (isNode) { module.exports = pureApi; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------ DOM ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, L = g.OkieMotor.logic, h = UI.h;

  core.registerStrings('en', {
    'app.cameras': 'Cameras', 'app.camhistory': 'Motion history', 'cam.view': 'View Cameras', 'cam.n': '{n} cameras', 'cam.n1': '1 camera', 'cam.none': 'No cameras found in Home Assistant', 'cam.all': 'All cameras',
    'cam.live': 'Live', 'cam.motion': 'Motion', 'cam.unavailable': 'Offline', 'cam.snap_note': 'Live video is not available here, showing a snapshot that refreshes every few seconds.',
    'cam.alert_n': '{n} alerts', 'cam.alert_1': '1 alert', 'cam.no_picture': 'No picture', 'cam.open': 'Open {name}',
    'cam.records': 'Motion records', 'cam.history': 'Motion history', 'cam.last_motion': 'Last motion', 'cam.new_n': '{n} new motion events', 'cam.new_1': '1 new motion event', 'cam.event_motion': 'Motion', 'cam.event_ring': 'Doorbell',
    'cam.today': 'Today', 'cam.yesterday': 'Yesterday', 'cam.history_none': 'No motion in the last 7 days', 'cam.history_fail': 'The history could not be loaded', 'cam.loading': 'Loading…',
    'cam.new': 'New', 'cam.watch': 'Watch live', 'cam.clips': 'Open recordings', 'cam.play_clip': 'Watch the recording', 'cam.no_clip': 'There is no recording of this event', 'cam.close_clip': 'Close', 'cam.events_n': '{n} events', 'cam.events_1': '1 event',
    'cam.paused': 'Live view paused to spare the camera\'s battery', 'cam.resume': 'Keep watching',
    'cam.full': 'Full screen', 'cam.exit_full': 'Close full screen', 'cam.rotate': 'Rotate',
    'cam.sound_on': 'Sound on', 'cam.sound_off': 'Sound off', 'cam.record': 'Record a {n} s clip', 'cam.rec': 'REC', 'cam.rec_saved': 'Clip saved to Owlet Clips', 'cam.clips_none': 'Set your Recordings page in Settings first', 'cam.rec_fail': 'The clip could not start', 'cam.zoom_reset': 'double-tap to reset', 'cam.volume': 'Volume',
  });
  core.registerStrings('de', {
    'app.cameras': 'Kameras', 'app.camhistory': 'Bewegungsverlauf', 'cam.view': 'Kameras ansehen', 'cam.n': '{n} Kameras', 'cam.n1': '1 Kamera', 'cam.none': 'Keine Kameras in Home Assistant gefunden', 'cam.all': 'Alle Kameras',
    'cam.live': 'Live', 'cam.motion': 'Bewegung', 'cam.unavailable': 'Offline', 'cam.snap_note': 'Live-Video ist hier nicht verfügbar, es gibt ein Standbild, das sich alle paar Sekunden erneuert.',
    'cam.alert_n': '{n} Meldungen', 'cam.alert_1': '1 Meldung', 'cam.no_picture': 'Kein Bild', 'cam.open': '{name} öffnen',
    'cam.records': 'Bewegungsaufnahmen', 'cam.history': 'Bewegungsverlauf', 'cam.last_motion': 'Letzte Bewegung', 'cam.new_n': '{n} neue Bewegungen', 'cam.new_1': '1 neue Bewegung', 'cam.event_motion': 'Bewegung', 'cam.event_ring': 'Klingel',
    'cam.today': 'Heute', 'cam.yesterday': 'Gestern', 'cam.history_none': 'Keine Bewegung in den letzten 7 Tagen', 'cam.history_fail': 'Der Verlauf konnte nicht geladen werden', 'cam.loading': 'Lädt…',
    'cam.new': 'Neu', 'cam.watch': 'Live ansehen', 'cam.clips': 'Aufnahmen öffnen', 'cam.play_clip': 'Aufnahme ansehen', 'cam.no_clip': 'Zu diesem Ereignis gibt es keine Aufnahme', 'cam.close_clip': 'Schließen', 'cam.events_n': '{n} Ereignisse', 'cam.events_1': '1 Ereignis',
    'cam.paused': 'Live-Ansicht pausiert, um den Akku der Kamera zu schonen', 'cam.resume': 'Weiter ansehen',
    'cam.full': 'Vollbild', 'cam.exit_full': 'Vollbild schließen', 'cam.rotate': 'Drehen',
    'cam.sound_on': 'Ton an', 'cam.sound_off': 'Ton aus', 'cam.record': '{n}-s-Clip aufnehmen', 'cam.rec': 'REC', 'cam.rec_saved': 'Clip in Owlet Clips gespeichert', 'cam.clips_none': 'Lege zuerst deine Aufnahmen-Seite in den Einstellungen fest', 'cam.rec_fail': 'Der Clip konnte nicht starten', 'cam.zoom_reset': 'Doppeltippen zum Zurücksetzen', 'cam.volume': 'Lautstärke',
  });

  function T(ctx) { return function (k, v) { return core.t(k, ctx.lang(), v); }; }
  function isExcluded(ctx) { var e = ctx.engine; return function (id) { try { var it = e && e.getItem && e.getItem(id); return !!(it && e.isExcluded && e.isExcluded(it)); } catch (er) { return false; } }; }
  function cameras(ctx, withOffline) {
    var hs = ctx.hass(); if (!hs) return [];
    return listCameras(hs.states, { hideUnavailable: !withOffline, excluded: isExcluded(ctx), now: Date.now() });
  }
  function countLabel(ctx, n) { return n === 1 ? T(ctx)('cam.n1') : T(ctx)('cam.n', { n: n }); }
  function hassUrl(ctx, u) { var hs = ctx.hass(); return u ? (hs && hs.hassUrl ? hs.hassUrl(u) : u) : ''; }
  /** the camera's current still, never from the browser cache */
  function snapUrl(ctx, id, bust) {
    var hs = ctx.hass(), st = hs && hs.states[id], pic = st && st.attributes && st.attributes.entity_picture;
    if (!pic) return '';
    var url = hassUrl(ctx, pic);
    return url + (url.indexOf('?') > 0 ? '&' : '?') + '_t=' + (bust || Date.now());
  }
  function lastMotion(ctx) { var hs = ctx.hass(), cc = ctx.settings.get().cameras || {}; return hs ? lastMotionImage(hs.states, cc.lastEntity) : null; }
  function rel(ctx, ts) { return L.relativeTime(Math.max(0, Date.now() - ts), ctx.lang()); }
  function loc(ctx) { return ctx.lang() === 'de' ? 'de-DE' : 'en-US'; }
  function clock(ctx, ts) {
    var tf = ctx.settings.get().timeFormat, o = { hour: 'numeric', minute: '2-digit' };
    if (tf === '12' || tf === '12h') o.hour12 = true; else if (tf === '24' || tf === '24h') o.hour12 = false;
    return new Date(ts).toLocaleTimeString(loc(ctx), o);
  }
  /** a picture into a background layer: preloaded so a slow or failing one never blanks the card, with a fallback */
  function paint(el, url, fallback) {
    if (!url || el._shown === url) return; el._shown = url;
    var img = new Image();
    img.onload = function () { if (el._shown === url) { el.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")'; el.classList.add('on'); } };
    img.onerror = function () { if (fallback && fallback !== url) { el._shown = ''; paint(el, fallback); } };
    img.src = url;
  }

  // Home Assistant's own cards draw a white frame on some browsers: clear every shadow root below the live card (once each)
  var CLEAR_CSS = ':host,*{background:transparent!important;box-shadow:none!important;border:none!important;border-radius:0!important;}'
    + 'ha-card{transition:none!important;padding:0!important;margin:0!important;}video,img{background:#000!important;object-fit:contain!important;}'
    + 'video{max-height:none!important;}';      // Home Assistant caps its player at 100vh - 97px (for its own pages): sideways on a phone that left the picture ¾ high and stuck to the top
  function clearFrames(root, depth) {
    if (!root || depth > 6 || !root.querySelectorAll) return;
    var all = root.querySelectorAll('*');
    for (var i = 0; i < all.length; i++) {
      var sr = all[i].shadowRoot; if (!sr) continue;
      if (!sr.__okieClear) { sr.__okieClear = true; var st = document.createElement('style'); st.textContent = CLEAR_CSS; sr.appendChild(st); }
      clearFrames(sr, depth + 1);
    }
    // a theme can pad the card with a rule that outranks the sheet above: inline wins
    var cards = root.querySelectorAll('ha-card');
    for (var c = 0; c < cards.length; c++) {
      var cs = cards[c].style;
      cs.setProperty('transition', 'none', 'important'); cs.setProperty('padding', '0', 'important'); cs.setProperty('margin', '0', 'important'); cs.setProperty('border-radius', '0', 'important');
    }
  }

  /**
   * liveView(ctx, id) -> { el, update(), dispose(), live }
   * Home Assistant's own live picture when its card helpers are there, else a snapshot every 3 seconds. An open stream keeps a battery camera
   * awake and blocks its motion events, so the live picture stops by itself after two minutes and waits for a tap.
   */
  var LIVE_MS = 120000;
  // what the page-level full-screen layer needs besides the camera styles (it is outside the card, so nothing else reaches it)
  var FULL_BASE = '*{box-sizing:border-box;}button{font:inherit;border:0;margin:0;cursor:pointer;-webkit-tap-highlight-color:transparent;-webkit-user-select:none;user-select:none;}'
    + ':host{--okie-ok:#34c759;--okie-warn:#ff9f0a;--okie-danger:#ff3b30;}' + String((g.OkieMotor.ui && g.OkieMotor.ui.BASE_CSS) || '').split('\n').filter(function (l) { return /okie-batt/.test(l); }).join('')      // the Motor's one battery
    + '.cam-full{font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","Segoe UI",Roboto,sans-serif;color:#fff;-webkit-text-size-adjust:100%;}button:active{transform:scale(.96);}';
  /** The full-screen camera's extras (the user's request, 2026-11-19): Sound (the live video unmuted), Record (a manual clip through a
   *  Home Assistant command named rest_command.<camera>_clip, e.g. the Owlet recorder's clip into the Jellyfin "Owlet Clips" folder),
   *  and pinch zoom with a drag to look around (double-tap resets). -> { buttons, overlays, attach(frame), onDispose(fn), dispose() } */
  var CLIP_S = 30;
  /** rtcPlayer(ctx, id) -> Promise<{ video, close() }>: the camera over WebRTC through Home Assistant's go2rtc (camera/webrtc/offer). It carries
   *  the camera's own sound (Opus), which Home Assistant's HLS stream drops: the full-screen view uses it so Sound has something to play. */
  function rtcPlayer(ctx, id) {
    var hs = ctx.hass(), conn = hs && hs.connection;
    if (!conn || !conn.subscribeMessage || !g.RTCPeerConnection) return Promise.reject(new Error('no webrtc'));
    return Promise.resolve(hs.callWS({ type: 'camera/capabilities', entity_id: id })).then(function (c) {
      if (!c || (c.frontend_stream_types || []).indexOf('web_rtc') < 0) throw new Error('no webrtc');
      return Promise.resolve(hs.callWS({ type: 'camera/webrtc/get_client_config', entity_id: id })).catch(function () { return {}; });
    }).then(function (cfg) {
      var pc = new RTCPeerConnection((cfg && cfg.configuration) || {}), ms = new MediaStream(), sid = null, pend = [], unsub = null, closed = false;
      pc.addTransceiver('video', { direction: 'recvonly' }); pc.addTransceiver('audio', { direction: 'recvonly' });
      var video = document.createElement('video'); video.className = 'cam-rtc'; video.autoplay = true; video.muted = true; video.playsInline = true; video.setAttribute('playsinline', ''); video.setAttribute('muted', ''); video.srcObject = ms;
      var sink = document.createElement('audio'); sink.muted = true; sink.srcObject = ms;      // some engines feed a remote stream to the audio engine only while an element plays it
      pc.ontrack = function (e) { if (ms.getTracks().indexOf(e.track) < 0) ms.addTrack(e.track); try { var p = video.play(); if (p && p.catch) p.catch(function () {}); var q = sink.play(); if (q && q.catch) q.catch(function () {}); } catch (er) { /* on the next tap */ } };
      function send(c) { Promise.resolve(hs.callWS({ type: 'camera/webrtc/candidate', entity_id: id, session_id: sid, candidate: c })).catch(function () {}); }
      pc.onicecandidate = function (e) { if (!e.candidate || !e.candidate.candidate) return; var c = { candidate: e.candidate.candidate, sdpMid: e.candidate.sdpMid, sdpMLineIndex: e.candidate.sdpMLineIndex }; if (sid) send(c); else pend.push(c); };
      return pc.createOffer().then(function (o) { return pc.setLocalDescription(o).then(function () { return o; }); }).then(function (o) {
        return new Promise(function (resolve, reject) {
          var to = setTimeout(function () { reject(new Error('webrtc timeout')); }, 12000);
          Promise.resolve(conn.subscribeMessage(function (m) {
            if (closed || !m) return;
            if (m.type === 'session') { sid = m.session_id; pend.splice(0).forEach(send); }
            else if (m.type === 'answer') { pc.setRemoteDescription({ type: 'answer', sdp: m.answer }).catch(function () {}); }
            else if (m.type === 'candidate') {
              var c = m.candidate; if (typeof c === 'string') c = { candidate: c, sdpMLineIndex: 0 };
              else if (c) c = { candidate: c.candidate, sdpMid: c.sdpMid != null ? c.sdpMid : c.sdp_mid, sdpMLineIndex: c.sdpMLineIndex != null ? c.sdpMLineIndex : (c.sdp_m_line_index != null ? c.sdp_m_line_index : 0) };
              if (c && c.candidate) pc.addIceCandidate(c).catch(function () {});
            } else if (m.type === 'error') { clearTimeout(to); reject(new Error(m.message || 'webrtc error')); }
          }, { type: 'camera/webrtc/offer', entity_id: id, offer: o.sdp })).then(function (u) { unsub = u; }, function (e) { clearTimeout(to); reject(e); });
          video.addEventListener('loadeddata', function () { clearTimeout(to); resolve(); }, { once: true });
        });
      }).then(function () {
        return { video: video, close: function () { closed = true; try { if (unsub) unsub(); } catch (e) { /* gone */ } try { pc.close(); } catch (e) { /* closed */ } video.srcObject = null; sink.srcObject = null; video.remove(); } };
      }, function (e) { closed = true; try { if (unsub) unsub(); } catch (er) { /* gone */ } try { pc.close(); } catch (er) { /* closed */ } throw e; });
    });
  }
  function fullExtras(ctx, id, box, cardOf, opts) {
    opts = opts || {};
    var t = T(ctx), hs = ctx.hass() || {}, st = hs.states && hs.states[id], obj = id.split('.')[1] || '', done = [], soundOn = false, soundT = 0;
    var buttons = h('div.cam-fs-extra'), overlays = [];
    function videos(root, out, depth) { out = out || []; if (!root || depth > 8) return out; var v = root.querySelectorAll ? root.querySelectorAll('video') : []; for (var i = 0; i < v.length; i++) out.push(v[i]); var all = root.querySelectorAll ? root.querySelectorAll('*') : []; for (var j = 0; j < all.length; j++) if (all[j].shadowRoot) videos(all[j].shadowRoot, out, (depth || 0) + 1); return out; }
    // Volume: an iPhone ignores a video's own volume, so the sound runs through the phone's audio engine with a gain we can set
    var vol = Math.max(0, Math.min(1, +ctx.store.get('cam.vol', 1))), AC = null, routes = typeof WeakMap === 'function' ? new WeakMap() : null;
    var IOS = /iP(hone|ad|od)/.test(navigator.userAgent || '') || (/Macintosh/.test(navigator.userAgent || '') && navigator.maxTouchPoints > 1);
    function route(v) {
      try {
        if (IOS && !v.srcObject) return null;      // an iPhone plays HLS (the stream away from home) silent through the audio engine: unmute it plainly, its buttons set the volume
        var A = g.AudioContext || g.webkitAudioContext; if (!A || !routes) return null;
        AC = AC || new A(); if (AC.state === 'suspended' && AC.resume) AC.resume();
        var key = v.srcObject || v.currentSrc || v.src, r = routes.get(v);
        if (!r || r.key !== key) {
          if (r && r.src) { try { r.src.disconnect(); } catch (e) { /* gone */ } }
          var stream = !!v.srcObject, src = stream ? AC.createMediaStreamSource(v.srcObject) : (r && !r.stream ? r.src : AC.createMediaElementSource(v)), gn = AC.createGain();
          src.connect(gn); gn.connect(AC.destination); r = { key: key, src: src, gain: gn, stream: stream }; routes.set(v, r);
        }
        return r;
      } catch (e) { return null; }
    }
    function applySound() {
      var c = cardOf();
      var rtcOn = box.classList.contains('rtc-on');
      videos(c && (c.shadowRoot || c), [], 0).concat(videos(box, [], 0)).forEach(function (v) {
        var active = rtcOn ? v.classList.contains('cam-rtc') : !v.classList.contains('cam-rtc');
        if (!active) { v.muted = true; return; }      // one player speaks: the live WebRTC one when it runs, the backup stays silent
        if (IOS) { v.muted = !soundOn; if (soundOn) { try { var pi = v.play(); if (pi && pi.catch) pi.catch(function () {}); } catch (e) { /* next tap */ } } return; }      // iPhone / iPad: plain unmute (its audio engine plays a live stream silent), the side buttons set the volume
        var r = soundOn ? route(v) : (routes && routes.get(v));
        if (r) { r.gain.gain.value = soundOn ? vol : 0; v.muted = r.stream ? true : !soundOn; }      // a live (WebRTC) stream plays through the gain only
        else { v.muted = !soundOn; try { v.volume = vol; } catch (e) { /* read-only here */ } }
        if (soundOn) { try { var p = v.play(); if (p && p.catch) p.catch(function () {}); } catch (e) { /* plays on the next tap */ } }
      });
    }
    // Sound: only cameras that stream (Home Assistant's STREAM feature, bit 2)
    if (st && ((st.attributes || {}).supported_features & 2)) {
      var snd = h('button.cam-fs-btn', { type: 'button', 'aria-pressed': 'false', 'aria-label': t('cam.sound_on'), html: UI.icon('volume-off', 22), onclick: function () {
        // the user's rule (2026-11-19): the slider shows only after a tap on the speaker. Tap = sound on + slider; tap while the slider shows = mute
        if (ctx.haptic) ctx.haptic(8);
        var noSlider = IOS;      // iPhone / iPad: the speaker is a plain on / off, the side buttons set the volume
        if (soundOn && (!volw.hidden || noSlider)) { soundOn = false; volw.hidden = true; clearTimeout(volT); }
        else { soundOn = true; showVol(); }
        snd.innerHTML = UI.icon(soundOn ? 'volume' : 'volume-off', 22); snd.setAttribute('aria-pressed', soundOn ? 'true' : 'false'); snd.setAttribute('aria-label', t(soundOn ? 'cam.sound_off' : 'cam.sound_on'));
        applySound(); clearInterval(soundT); if (soundOn) soundT = setInterval(applySound, 1500);      // the player can rebuild its video: keep it unmuted
      } });
      var volT = 0;
      function showVol() { if (IOS) return;      // no slider where the phone's own buttons are the only volume
        volw.hidden = false; clearTimeout(volT); volT = setTimeout(function () { volw.hidden = true; }, 3000); }      // hides 3 s after the last touch
      var slider = h('input.cam-vol', { type: 'range', min: '0', max: '100', step: '1', value: String(Math.round(vol * 100)), 'aria-label': t('cam.volume') });
      slider.addEventListener('input', function () { vol = (+slider.value || 0) / 100; ctx.store.set('cam.vol', vol); applySound(); });
      ['input', 'pointerdown', 'touchstart'].forEach(function (ev) { slider.addEventListener(ev, function () { if (!volw.hidden) showVol(); }, { passive: true }); });
      var volw = h('div.cam-volw', { hidden: true }, slider);
      buttons.appendChild(volw); buttons.appendChild(snd);
    }
    // Record: a manual clip when Home Assistant has a clip command for this camera
    var svc = hs.services && hs.services.rest_command && hs.services.rest_command[obj + '_clip'] ? obj + '_clip' : null;
    var pill = h('div.cam-rec', { hidden: true }), recT = 0;
    if (svc) {
      var recBtn = h('button.cam-fs-btn.cam-recbtn', { type: 'button', 'aria-label': t('cam.record', { n: CLIP_S }), html: '<i></i>', onclick: function () {
        if (ctx.haptic) ctx.haptic(12);
        if (recT) {      // a second tap stops the clip (it is still saved)
          clearInterval(recT); recT = 0; recBtn.classList.remove('on');
          Promise.resolve(ctx.call('rest_command', svc, { seconds: 0 })).then(function () { pill.hidden = false; pill.textContent = t('cam.rec_saved'); setTimeout(function () { if (!recT) pill.hidden = true; }, 3500); });
          return;
        }
        var until = Date.now() + CLIP_S * 1000;
        Promise.resolve(ctx.call('rest_command', svc, { seconds: CLIP_S })).then(function () {
          recBtn.classList.add('on'); pill.hidden = false;
          var tick = function () { var left = until - Date.now(), el = CLIP_S - Math.max(0, Math.ceil(left / 1000)), mm = function (s) { return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
            if (left <= 0) { clearInterval(recT); recT = 0; recBtn.classList.remove('on'); pill.innerHTML = ''; pill.appendChild(document.createTextNode(t('cam.rec_saved'))); setTimeout(function () { if (!recT) pill.hidden = true; }, 3500); return; }
            pill.innerHTML = '<i></i>' + t('cam.rec') + ' ' + mm(el) + ' / ' + mm(CLIP_S); };
          tick(); recT = setInterval(tick, 500);
        }, function () { pill.hidden = false; pill.textContent = t('cam.rec_fail'); setTimeout(function () { pill.hidden = true; }, 3500); });
      } });
      buttons.appendChild(recBtn); overlays.push(pill);
    }
    // The baby's vitals on the Owlet camera: one small glass strip bottom-left, live from the sock (the user's request, 2026-11-19)
    var OW = g.OkieMotor.owlet, vitEl = null, vitT = 0;
    if (!opts.owl && OW && OW.vitalsFor && OW.vitalsFor(ctx, id)) {      // the Owlet camera's own screen has its cards
      vitEl = h('div.cam-vitals'); overlays.push(vitEl);
      var drawVit = function () {
        var v = OW.vitalsFor(ctx, id); if (!v) { vitEl.hidden = true; return; } vitEl.hidden = false; vitEl.dataset.level = v.level || '';
        var f = function (n, d) { return n == null ? '--' : (d ? (Math.round(n * 10) / 10).toFixed(1) : String(Math.round(n))); };
        var item = function (icon, color, val, unit) { return h('span.cam-vi', null, h('i', { style: { color: color }, html: UI.icon(icon, 17) }), h('b', null, val), h('small', null, unit)); };
        vitEl.innerHTML = '';
        vitEl.appendChild(h('span.cam-vdot'));
        vitEl.appendChild(item('heart', '#ff4d6a', f(v.hr), 'bpm'));
        vitEl.appendChild(item('lungs', '#4fd6e8', f(v.o2), '%'));
        vitEl.appendChild(item('thermo', '#5ee08f', f(v.temp, 1), v.tempUnit));
      };
      drawVit(); vitT = setInterval(drawVit, 2000); done.push(function () { clearInterval(vitT); });
    }
    // Zoom: pinch (two fingers), drag when zoomed, double-tap back; a wheel with Ctrl (or a trackpad pinch) on a computer
    // messages on the full-screen layer itself (the card's toasts sit behind it), the camera flash and its shutter sound
    var msg = h('div.cam-msg', { hidden: true }), msgT = 0, flash = h('div.cam-flash');
    overlays.push(msg); overlays.push(flash);
    function notify(text) { msg.textContent = text; msg.hidden = false; clearTimeout(msgT); msgT = setTimeout(function () { msg.hidden = true; }, 3200); }
    function shutter() {
      flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
      try { var A = g.AudioContext || g.webkitAudioContext; if (!A) return; var ac = new A(), n = Math.floor(ac.sampleRate * 0.09), buf = ac.createBuffer(1, n, ac.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3) * (i < n * 0.35 || i > n * 0.5 ? 1 : 0.2);      // two quick clicks, like a camera
        var src = ac.createBufferSource(), gn = ac.createGain(); gn.gain.value = 0.5; src.buffer = buf; src.connect(gn); gn.connect(ac.destination); src.start(); setTimeout(function () { try { ac.close(); } catch (e) { /* closed */ } }, 400);
      } catch (e) { /* no sound here */ }
    }
    var zs = 1, zbase = 1, zx = 0, zy = 0, chip = h('div.cam-zoom', { hidden: true }), chipT = 0;
    overlays.push(chip);
    function clampPan() { var W = box.offsetWidth, H = box.offsetHeight, cw = Math.min(W, H * 16 / 9), ch = cw * 9 / 16, mx = Math.max(0, (cw * zs - W) / 2), my = Math.max(0, (ch * zs - H) / 2); zx = Math.max(-mx, Math.min(mx, zx)); zy = Math.max(-my, Math.min(my, zy)); }      // the picture's own edges (16:9 inside the screen), so a drag never shows black
    function applyZoom(show) {
      if (zs <= 1.01) { zs = 1; zx = 0; zy = 0; }
      clampPan(); box.style.transform = zs === 1 ? '' : 'translate(' + zx + 'px,' + zy + 'px) scale(' + zs + ')';
      if (show) { chip.hidden = Math.abs(zs - zbase) < 0.02; chip.textContent = zs.toFixed(1) + '×  ·  ' + t('cam.zoom_reset'); clearTimeout(chipT); chipT = setTimeout(function () { chip.hidden = true; }, 1800); }
    }
    function attach(frame) {
      var p0 = null, lastTap = 0;
      var dist = function (a, b) { return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY); };
      frame.addEventListener('touchstart', function (e) {
        if (e.target.closest && e.target.closest('.cam-fs-bar, .cow-lp, .cow button, .cow-card')) { p0 = null; return; }      // the panels and buttons get their own touches (the list scrolls, Stop is pressed), not the picture
        if (e.touches.length === 2) p0 = { d: dist(e.touches[0], e.touches[1]), s: zs };
        else if (e.touches.length === 1) {
          var now = Date.now(); if (now - lastTap < 300) { zs = zbase; zx = 0; zy = 0; applyZoom(true); lastTap = 0; return; } lastTap = now;
          p0 = { x: e.touches[0].clientX, y: e.touches[0].clientY, zx: zx, zy: zy };
        }
      }, { passive: true });
      frame.addEventListener('touchmove', function (e) {
        if (!p0) return;
        if (e.touches.length === 2 && p0.d) { e.preventDefault(); zs = Math.max(1, Math.min(5, p0.s * dist(e.touches[0], e.touches[1]) / Math.max(1, p0.d))); applyZoom(true); }
        else if (e.touches.length === 1 && p0.x != null && zs > 1) {
          e.preventDefault(); var dx = e.touches[0].clientX - p0.x, dy = e.touches[0].clientY - p0.y, turned = /rotate/.test(frame.style.transform || '');
          zx = p0.zx + (turned ? dy : dx); zy = p0.zy + (turned ? -dx : dy); applyZoom(false);      // a turned picture: the finger's sideways is its up
        }
      }, { passive: false });
      frame.addEventListener('touchend', function (e) { if (!e.touches.length) p0 = null; }, { passive: true });
      frame.addEventListener('wheel', function (e) { if (!e.ctrlKey) return; e.preventDefault(); zs = Math.max(1, Math.min(5, zs * (e.deltaY < 0 ? 1.1 : 0.9))); applyZoom(true); }, { passive: false });
      frame.addEventListener('dblclick', function () { zs = zbase; zx = 0; zy = 0; applyZoom(true); });
    }
    return { buttons: buttons, overlays: overlays, attach: attach, onDispose: function (fn) { done.push(fn); },
      toggleSound: function () { if (typeof snd !== 'undefined' && snd) snd.click(); return soundOn; },
      record: function () { if (typeof recBtn !== 'undefined' && recBtn) { recBtn.click(); return true; } return false; },
      recording: function () { return !!recT; }, notify: notify, shutter: shutter, resetZoom: function () { zs = zbase; zx = 0; zy = 0; applyZoom(false); },
      setBaseZoom: function (z) { var nz = Math.max(1, z || 1); if (Math.abs(nz - zbase) < 0.01) return; zbase = nz; zs = zbase; zx = 0; zy = 0; applyZoom(false); },      // the upright phone opens zoomed in to fill the screen; only when it changes, so a resize keeps where the finger moved it
      dispose: function () { clearInterval(soundT); clearInterval(recT); if (typeof volT !== 'undefined') clearTimeout(volT); clearTimeout(chipT); soundOn = false; applySound(); if (AC && AC.close) { try { AC.close(); } catch (e) { /* closed */ } } box.style.transform = ''; done.forEach(function (fn) { try { fn(); } catch (e) { /* gone */ } }); } };
  }
  function liveView(ctx, id) {
    var t = T(ctx), box = h('div.cam-player'), img = h('img.cam-snap', { alt: '', draggable: false });
    var note = h('div.cam-note', { hidden: true }, t('cam.snap_note'));
    var card = null, timer = 0, stopT = 0, fixT = 0, disposed = false, out = { el: box, live: false };
    var pause = h('button.cam-paused', { type: 'button', hidden: true, onclick: function () { start(); } }, h('span', { html: UI.icon('play', 26) }), h('span', null, t('cam.paused')), h('b', null, t('cam.resume')));
    box.appendChild(pause);
    // tap the picture (or the corner button) for full screen: the player moves to a layer over the whole window and back again
    var full = null;
    function closeFull() {
      if (!full) return; var f = full; full = null;
      if (f.extras) f.extras.dispose();
      document.removeEventListener('keydown', f.onKey, true); window.removeEventListener('resize', f.layout); document.removeEventListener('fullscreenchange', f.onFs); document.removeEventListener('webkitfullscreenchange', f.onFs);
      try { var fe = document.fullscreenElement || document.webkitFullscreenElement; if (fe) (document.exitFullscreen || document.webkitExitFullscreen).call(document); } catch (e) { /* already out */ }
      box.classList.remove('full'); box.style.cssText = '';
      if (f.home.parentNode) f.home.parentNode.replaceChild(box, f.home);
      var lay = f.shell.getRootNode && f.shell.getRootNode().host; f.shell.remove(); if (lay && lay.hasAttribute && lay.hasAttribute('data-okie-cam-full')) lay.remove();
    }
    function openFull() {
      var stage = ctx.stage; if (full || disposed || !stage) return;
      var home = h('div.cam-player.holder'), rot = false;      // upright unless the turn button says otherwise (turning the phone turns the page itself)       // a stand-in keeps the page from jumping while the player is away
      box.parentNode.replaceChild(home, box);
      var frame = h('div.cam-fs-frame');
      var rotBtn = h('button.cam-fs-btn', { type: 'button', 'aria-label': t('cam.rotate'), html: UI.icon('refresh', 20), onclick: function () { rot = !(rot === null ? isPortrait() : rot); layout(); } });
      var OWm = g.OkieMotor.owlet, owl = !!(OWm && OWm.camScreen && OWm.vitalsFor && OWm.vitalsFor(ctx, id));      // the baby's camera gets the Owlet screen
      var extras = fullExtras(ctx, id, box, function () { return card; }, { owl: owl });
      // the sound lives on WebRTC: swap the picture to it once it plays (the HLS picture stays underneath if it never does)
      var rtc = null, rtcGone = false;
      rtcPlayer(ctx, id).then(function (r) { if (rtcGone || !full) { r.close(); return; } rtc = r; box.appendChild(r.video); box.classList.add('rtc-on'); }, function () { /* the HLS picture, without sound */ });
      extras.onDispose(function () { rtcGone = true; box.classList.remove('rtc-on'); if (rtc) rtc.close(); });
      var closeBtn = h('button.cam-fs-btn', { type: 'button', 'aria-label': t('cam.exit_full'), html: UI.icon('close', 22), onclick: closeFull });
      var shell = h('div.cam-full', { role: 'dialog', 'aria-modal': 'true' }, frame);
      // sizes in the layer's own units: on a phone the card runs at a zoom, and the screen's pixels made the picture ¾ size and stuck to the top
      // the Kindle's baby monitor is captured on a 1707 px wide page and shrunk to the tablet: lay it out iPad-wide (1180) and scale it up, so it has the iPad's proportions
      var kz = g.__okieKiosk ? Math.max(1, (g.innerWidth || 1180) / 1180) : 1;
      function size() { var vv = g.visualViewport; return { W: Math.round((vv ? vv.width : g.innerWidth) / kz), H: Math.round((vv ? vv.height : g.innerHeight) / kz) }; }      // the screen, now that the layer sits on the page
      function isPortrait() { var z = size(); return z.H > z.W; }
      function layout() {
        var z = size(), W = z.W, H = z.H, turn = rot === null ? H > W : rot;
        frame.style.width = (turn ? H : W) + 'px'; frame.style.height = (turn ? W : H) + 'px';
        frame.style.transform = turn ? 'translate(' + W + 'px,0) rotate(90deg)' : '';
        frame.style.setProperty('--cam-fh', (turn ? W : H) + 'px');
      }
      box.classList.add('full'); frame.appendChild(box);
      var scr = owl ? OWm.camScreen(ctx, id, {
        back: function () { closeFull(); }, close: function () { closeFull(); },
        sound: function () { return extras.toggleSound(); },
        mic: function () { if (ctx.toast) ctx.toast('info', T(ctx)('owl.cam_mic_off')); },
        fullscreen: function () { try { var fe = document.fullscreenElement || document.webkitFullscreenElement; if (fe) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else { var rq = shell.requestFullscreen || shell.webkitRequestFullscreen; if (rq) rq.call(shell); } } catch (e) { /* the layer already covers the screen */ } },
        fit: function () { frame.classList.toggle('cow-fit'); extras.resetZoom(); },
        record: function (b) { var was = extras.recording(); if (!extras.record()) return; if (was) { b.classList.remove('rec'); return; } b.classList.add('rec'); var w = setInterval(function () { if (!extras.recording()) { b.classList.remove('rec'); clearInterval(w); } }, 600); },
        notify: function (text) { extras.notify(text); },
        snapshot: function () {
          var hs2 = ctx.hass() || {}, sv = (id.split('.')[1] || '') + '_snap', T2 = T(ctx);
          if (!(hs2.services && hs2.services.rest_command && hs2.services.rest_command[sv])) { extras.notify(T2('owl.cam_snap_fail')); return; }
          extras.shutter(); if (ctx.haptic) ctx.haptic(15);
          Promise.resolve(ctx.call('rest_command', sv, {})).then(function () { extras.notify(T2('owl.cam_snap_saved')); }, function () { extras.notify(T2('owl.cam_snap_fail')); });
        },
        // the clips (Jellyfin) open inside the camera screen with an X; leaving the app for a new page had no way back
        clips: function () {
          // the Recordings page from Settings (cameras.clipsUrl), for example your Jellyfin; nothing is guessed
          var cu = safeHttpUrl(((ctx.settings.get() || {}).cameras || {}).clipsUrl || ''), u; if (!cu) { extras.notify(T(ctx)('cam.clips_none')); return; }
          try { u = new URL(cu, location.origin); } catch (e) { return; }
          if (frame.querySelector('.cam-clips')) return;
          var box = h('div.cam-clips', null, h('iframe', { src: u.toString(), allow: 'autoplay; fullscreen', referrerpolicy: 'no-referrer' }),
            h('button.cam-fs-btn.cam-clipsx', { type: 'button', 'aria-label': T(ctx)('cam.close_clip'), html: UI.icon('close', 22), onclick: function (e) { e.stopPropagation(); box.remove(); } }));
          frame.appendChild(box);
        },
      }) : null;
      if (scr) { frame.classList.add('cow-on'); frame.appendChild(scr.el); extras.onDispose(function () { scr.dispose(); }); }
      else frame.appendChild(h('div.cam-fs-bar', null, extras.buttons, rotBtn, closeBtn));
      // upright phone (the user's 9:16 reference): the picture fills the screen, zoomed in, and a finger moves it around
      var fillUpright = function () { if (!scr) return; var z = size(); extras.setBaseZoom(z.H > z.W && z.W <= 600 ? z.H / (z.W * 9 / 16) : 1); };
      extras.overlays.forEach(function (o) { frame.appendChild(o); }); extras.attach(frame);
      // the buttons show on a touch and fade after 3 s, like a streaming app; a tap on the picture while they show hides them
      var uiT = 0, inBar = function (e) { return e.target && e.target.closest && e.target.closest('.cam-fs-bar, .cow button, .cow-card, .cow-lp'); };
      var showUI = function () { frame.classList.remove('ui-hide'); clearTimeout(uiT); uiT = setTimeout(function () { frame.classList.add('ui-hide'); }, 3000); };
      frame.addEventListener('click', function (e) { if (inBar(e) || frame.classList.contains('ui-hide')) showUI(); else { clearTimeout(uiT); frame.classList.add('ui-hide'); } });
      ['pointerdown', 'input'].forEach(function (ev) { frame.addEventListener(ev, function (e) { if (inBar(e)) showUI(); }, true); });
      frame.addEventListener('mousemove', function (e) { if (e.movementX || e.movementY) showUI(); });
      showUI(); extras.onDispose(function () { clearTimeout(uiT); });
      // the layer goes on the page itself, not inside the dashboard: Home Assistant's page around the card boxed it in (on a phone the picture
      // was ¾ of the height and stuck to the top), so it has its own little root with the camera styles
      var layer = document.createElement('div'); layer.setAttribute('data-okie-cam-full', '');
      layer.style.cssText = 'position:fixed;inset:0;z-index:2147483000;' + (kz !== 1 ? 'zoom:' + kz.toFixed(4) + ';' : '');
      var lroot = layer.attachShadow ? layer.attachShadow({ mode: 'open' }) : layer;
      var lcss = document.createElement('style'); lcss.textContent = ':host{all:initial;}' + FULL_BASE + CSS; lroot.appendChild(lcss); lroot.appendChild(shell);
      (document.body || stage).appendChild(layer); layout(); fillUpright();
      // turning the phone: the window settles in steps, so lay out again a moment later (the picture was left pushed down)
      var relayout = function () { var lf = function () { layout(); fillUpright(); }; lf(); requestAnimationFrame(lf); setTimeout(lf, 250); setTimeout(lf, 700); }, turned = function () { rot = false; relayout(); };      // the phone turned: upright again
      window.addEventListener('orientationchange', turned); if (g.visualViewport) g.visualViewport.addEventListener('resize', relayout);
      extras.onDispose(function () { window.removeEventListener('orientationchange', turned); if (g.visualViewport) g.visualViewport.removeEventListener('resize', relayout); });
      var f = full = { shell: shell, home: home, layout: layout, extras: extras,
        onKey: function (e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); closeFull(); } },
        onFs: function () { if (!(document.fullscreenElement || document.webkitFullscreenElement)) closeFull(); } };
      document.addEventListener('keydown', f.onKey, true); window.addEventListener('resize', relayout); f.layout = relayout;
      try { var rq = shell.requestFullscreen || shell.webkitRequestFullscreen; if (rq) { var pr = rq.call(shell); if (pr && pr.then) pr.then(function () { document.addEventListener('fullscreenchange', f.onFs); layout(); }, function () { /* the window stays the full screen */ }); else { document.addEventListener('webkitfullscreenchange', f.onFs); layout(); } } } catch (e) { /* no native full screen here: the layer already covers the window */ }
    }
    box.appendChild(h('button.cam-expand', { type: 'button', 'aria-label': t('cam.full'), html: UI.icon('expand', 18), onclick: function (e) { e.stopPropagation(); openFull(); } }));
    box.addEventListener('click', function (e) { if (full || (e.target.closest && e.target.closest('.cam-paused'))) return; openFull(); });
    function snap() { var u = snapUrl(ctx, id); if (u) img.src = u; }
    function fallback() {
      if (disposed || timer) return;
      box.appendChild(img); box.appendChild(note); note.hidden = false; snap(); timer = setInterval(snap, 3000);
    }
    function stop(showPause) {
      clearTimeout(stopT); clearInterval(fixT); out.live = false;
      if (card && card.parentNode) card.remove(); card = null;
      pause.hidden = !showPause;
    }
    function start() {
      if (disposed) return; pause.hidden = true;
      var helpers = null;
      try { helpers = typeof g.loadCardHelpers === 'function' ? g.loadCardHelpers() : null; } catch (e) { helpers = null; }
      if (!helpers || !helpers.then) { fallback(); return; }
      helpers.then(function (hp) {
        return hp.createCardElement({ type: 'picture-entity', entity: id, camera_view: 'live', show_name: false, show_state: false, aspect_ratio: '16:9', tap_action: { action: 'none' }, hold_action: { action: 'none' } });
      }).then(function (el) {
        if (disposed) return;
        card = el; card.classList.add('cam-card'); card.hass = ctx.hass(); box.appendChild(card); out.live = true;
        var n = 0; clearInterval(fixT); fixT = setInterval(function () { clearFrames(card && card.shadowRoot, 0); if (++n > 40) clearInterval(fixT); }, 400);
        var sec = +((ctx.settings.get().cameras || {}).liveSeconds); clearTimeout(stopT); if (!g.__okieKiosk) stopT = setTimeout(function () { stop(true); }, (sec > 0 ? sec * 1000 : LIVE_MS));      // the Kindle's baby monitor never pauses
      }).catch(fallback);
    }
    start();
    out.update = function () { if (card) card.hass = ctx.hass(); };
    out.dispose = function () { disposed = true; closeFull(); clearInterval(timer); timer = 0; stop(false); };
    return out;
  }

  // ------------------------------------------- the event feed (shared) ----
  var feeds = typeof WeakMap === 'function' ? new WeakMap() : null;
  /** the motion and ring events of the last seven days for this card, kept fresh while somebody listens (the bell, the history) */
  function feedFor(ctx) {
    var f = feeds && feeds.get(ctx); if (f) return f;
    var events = [], listeners = [], loading = false, failed = false, loaded = false, lastSig = '', poll = 0, pokeT = 0;
    if (!ctx.store.get('cam.seenAt', 0)) ctx.store.set('cam.seenAt', Date.now());      // the first time nothing is "new": only events from now on count
    function emit() { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* a listener went away */ } }); }
    function sources() { var hs = ctx.hass(); return hs ? alertSources(hs.states, cameras(ctx, true).map(function (c) { return c.id; })) : []; }
    function sig() { var hs = ctx.hass(); return hs ? sources().map(function (s) { var st = hs.states[s.id]; return s.id + '@' + (st ? st.last_updated : ''); }).join('|') : ''; }
    function refresh() {
      var hs = ctx.hass(), src = sources();
      if (!hs || !src.length || loading) return Promise.resolve();
      loading = true;
      var end = Date.now(), start = end - 7 * DAY, mySig = sig();
      return Promise.resolve(ctx.callWS({ type: 'history/history_during_period', start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), entity_ids: src.map(function (s) { return s.id; }), include_start_time_state: false, significant_changes_only: false, minimal_response: true, no_attributes: true }))
        .then(function (res) { events = eventsFromHistory(res, src, hs.states).filter(function (e) { return e.ts >= start; }); failed = false; loaded = true; lastSig = mySig; })
        .catch(function () { failed = true; })
        .then(function () { loading = false; emit(); });
    }
    f = {
      events: function () { return events; },
      loaded: function () { return loaded; }, failed: function () { return failed; }, loading: function () { return loading; },
      seenAt: function () { return +ctx.store.get('cam.seenAt', 0) || 0; },
      unseen: function () { return unseenCount(events, f.seenAt()); },
      markSeen: function () { ctx.store.set('cam.seenAt', Date.now()); emit(); },
      refresh: refresh,
      /** every Home Assistant push: fetch again, soon, when one of the sensors moved */
      poke: function () { if (!listeners.length) return; var s = sig(); if (s !== lastSig && !loading) { clearTimeout(pokeT); pokeT = setTimeout(refresh, 1200); } },
      on: function (fn) {
        listeners.push(fn);
        if (listeners.length === 1) { refresh(); poll = setInterval(refresh, 300000); }
        return function () { listeners = listeners.filter(function (x) { return x !== fn; }); if (!listeners.length) { clearInterval(poll); clearTimeout(pokeT); } };
      },
    };
    if (feeds) feeds.set(ctx, f);
    return f;
  }

  // ------------------------------------------------------- the card ----
  /** buildCard(ctx) -> { el, update(), dispose() }: the last motion picture, the bell with the number of new events, the View Cameras pill */
  function buildCard(ctx) {
    var t = T(ctx), feed = feedFor(ctx), art = g.OkieMotor.cameraArt;
    var pic = h('div.cc-pic'), shade = h('div.cc-shade'), chip = h('div.cc-chip');
    var badge = h('i.cam-badge', { hidden: true });
    var bell = h('button.cc-bell', { type: 'button', 'aria-label': t('cam.history'), title: t('cam.history'), dataset: { alert: 'false' }, onclick: function (e) { e.stopPropagation(); ctx.openApp('camhistory'); }, html: UI.icon('bell', 26) }, badge);
    var pill = h('button.cam-pill', { type: 'button', 'aria-label': t('cam.view') },
      h('span.cam-pill-ic', { html: UI.icon('expand', 20) }), h('span', null, t('cam.view')));
    UI.pullPill(pill, function () { ctx.openApp('cameras'); });
    var el = h('section.camcard', { role: 'group', 'aria-label': t('app.cameras'), onclick: function () { ctx.openApp('cameras'); } },
      pic, shade, chip, h('div.cam-cluster', null, bell, pill));

    function picture() {
      var cc = ctx.settings.get().cameras || {}, hs = ctx.hass(), lm = lastMotion(ctx);
      return { url: cc.image || (lm && lm.picture ? hassUrl(ctx, lm.picture) : '') || art, lm: lm, fallback: art, hs: hs };
    }
    function draw() {
      var p = picture(); paint(pic, p.url, p.fallback);
      chip.textContent = p.lm && p.lm.ts ? t('cam.last_motion') + ' · ' + rel(ctx, p.lm.ts) : '';
      chip.hidden = !chip.textContent;
      var hs = p.hs, al = hs ? cameraAlerts(hs.states, cameras(ctx, true).map(function (c) { return c.id; }), Date.now()) : { ids: [], total: 0 };
      var seen = feed.seenAt(), fresh = al.ids.filter(function (id) { var s = hs.states[id], ts = Date.parse(domainOf(id) === 'event' ? s.state : s.last_changed); return !isFinite(ts) || ts > seen; }).length;     // a motion that just happened counts before the list is fetched again
      var live = al.total, n = Math.max(feed.unseen(), fresh);
      bell.dataset.alert = live ? 'true' : 'false';
      badge.hidden = !n; badge.textContent = n > 99 ? '99+' : String(n);
      bell.setAttribute('aria-label', n ? (n === 1 ? t('cam.new_1') : t('cam.new_n', { n: n })) : t('cam.history'));
      // Settings (not the camera's own live view) is where "record the Owlet camera" lives now; keep the real
      // recorder entity matching that preference on every tick, whether or not anyone has the camera open.
      var OW = g.OkieMotor.owlet, owCfg = OW && hs && OW.configFor(ctx, (ctx.settings.get().cameras || {}).owlet && ctx.settings.get().cameras.owlet.entity);
      if (owCfg) OW.reconcileRecording(ctx, owCfg);
    }
    var off = feed.on(draw), tick = setInterval(draw, 60000);
    draw();
    return { el: el, update: function () { feed.poke(); draw(); }, dispose: function () { off(); clearInterval(tick); } };
  }

  // ------------------------------------------------------ the apps ----
  function renderApp(container, ctx) {
    var t = T(ctx), body = null, cur = null, live = null, llPanel = null, timers = [], disposed = false, feed = feedFor(ctx), offRecs = null;
    var shell = g.OkieMotor.appshell.create(container, ctx, {
      id: 'cameras', title: t('app.cameras'), subtitle: '', icon: 'camera', gradient: ['#13284a', '#2f5fb0'],
      onTab: function (id, b) { body = b; if (shell) draw(); },       // the shell calls this once while it is still being built
    });
    body = body || shell.body;

    function stopLive() {
      if (live) { live.dispose(); live = null; }
      if (llPanel) { llPanel.dispose(); llPanel = null; }
      if (offRecs) { offRecs(); offRecs = null; }
      if (shell.el.dataset.owletHero) {
        delete shell.el.dataset.owletHero;
        var w = shell.hero.querySelector('.owlet-hero-wrap'); if (w) w.parentNode.removeChild(w);
      }
    }
    function clear() { stopLive(); timers.forEach(clearInterval); timers = []; body.innerHTML = ''; body.scrollTop = 0; }
    function stateText(c) { return c.unavailable ? t('cam.unavailable') : (c.alerts.length ? t('cam.motion') : ''); }

    /** a camera's still; when it has none (a Ring live view cannot give one) the first working camera borrows the last motion picture */
    function thumb(c, primary, cls) {
      var img = h('img' + (cls || ''), { alt: '', draggable: false, loading: 'lazy' }), borrowed = false;
      function borrow() { var lm = lastMotion(ctx); if (primary && lm && lm.picture && !borrowed) { borrowed = true; img.src = hassUrl(ctx, lm.picture); return true; } return false; }
      function set() { var u = snapUrl(ctx, c.id); if (u && !borrowed) img.src = u; else if (!u) borrow(); }
      img.addEventListener('error', function () { if (!borrow()) img.classList.add('bad'); });
      img.addEventListener('load', function () { img.classList.remove('bad'); });
      set(); img._set = set;
      return img;
    }

    function drawGrid() {
      clear();
      var list = cameras(ctx, true), online = list.filter(function (c) { return !c.unavailable; }).length;
      shell.setSubtitle(list.length ? countLabel(ctx, online) : '');
      if (!list.length) { body.appendChild(h('div.cam-empty', null, h('span', { html: UI.icon('camera', 44) }), h('div', null, t('cam.none')))); return; }
      var grid = h('div.cam-grid'), imgs = [], first = true;
      list.forEach(function (c) {
        var primary = first && !c.unavailable; if (primary) first = false;
        var img = thumb(c, primary); imgs.push(img);
        var tile = h('button.cam-tile' + (c.unavailable ? '.off' : '') + (c.alerts.length ? '.alert' : ''), { type: 'button', disabled: c.unavailable, 'aria-label': t('cam.open', { name: c.name }), dataset: { id: c.id }, onclick: function () { cur = c.id; draw(); } },
          img, h('span.cam-nopic', { html: UI.icon('camera', 28) }), h('span.cam-shade'),
          h('span.cam-info', null, h('span.cam-name', null, c.name), h('span.cam-st', null, stateText(c))),
          h('span.cam-play', { html: UI.icon('play', 18) }));
        grid.appendChild(tile);
      });
      body.appendChild(grid);
      timers.push(setInterval(function () { imgs.forEach(function (i) { i._set(); }); }, 15000));
    }

    function drawLive() {
      var list = cameras(ctx, true), c = list.filter(function (x) { return x.id === cur; })[0];
      if (!c) { var st = ctx.hass().states[cur]; if (!st) { cur = null; return drawGrid(); } c = { id: cur, name: (st.attributes && st.attributes.friendly_name) || cur, state: st.state, unavailable: st.state === 'unavailable', alerts: [] }; }
      clear();
      var title = h('div.cam-live-name', null, c.name), chip = h('span.cam-chip' + (c.alerts.length ? '.alert' : ''), null, c.alerts.length ? t('cam.motion') : t('cam.live'));
      var top = h('div.cam-live-top', null,
        h('button.act.cam-back', { type: 'button', onclick: function () { cur = null; draw(); } }, h('span', { html: UI.icon('back', 16) }), t('cam.all')), title, chip);
      live = liveView(ctx, c.id);

      // The Owlet camera gets the same hero-takeover treatment: a top-right
      // temp/humidity badge over the live picture and a swipeable glass panel of its own
      // (okie-owlet.js) in the same side column every other detail view uses (the thermostat
      // dial) - not a one-off layout.
      var OW = g.OkieMotor.owlet, owCfg = OW && OW.configFor(ctx, c.id);
      if (owCfg) {
        var owBadge = OW.liveBadge(ctx, owCfg);
        llPanel = OW.panel(ctx, owCfg);
        shell.hero.insertBefore(h('div.owlet-hero-wrap', null, live.el, owBadge.el), shell.hero.firstChild);
        shell.el.dataset.owletHero = '1';
        timers.push(setInterval(function () { owBadge.update(); }, 30000));
        // the same motion-records list every other camera gets (okie-cameras.js's generic feed):
        // honest, not Owlet-specific - it will say "no motion" until a real motion/ding sensor exists for it
        var owRecs = h('div.cam-recs');
        function drawOwRecs() {
          var evs = feed.events().filter(function (e) { return e.camera === c.id; }).slice(0, 80);
          owRecs.innerHTML = '';
          owRecs.appendChild(h('div.cr-head', null, h('span', null, t('cam.records')), evs.length ? h('span.ch-n', null, evs.length === 1 ? t('cam.events_1') : t('cam.events_n', { n: evs.length })) : null));
          if (!feed.loaded()) owRecs.appendChild(h('div.ch-note', null, feed.failed() ? t('cam.history_fail') : t('cam.loading')));
          else if (!evs.length) owRecs.appendChild(h('div.ch-note', null, feed.failed() ? t('cam.history_fail') : t('cam.history_none')));
          else eventList(ctx, evs, { openedSeen: Infinity, showCamera: false }).forEach(function (n) { owRecs.appendChild(n); });
        }
        offRecs = feed.on(drawOwRecs); drawOwRecs();
        body.appendChild(h('div.cam-live.cam-live-ll', null, top, llPanel.el, owRecs));
        shell.setSubtitle(c.name);
        return;
      }

      var strip = h('div.cam-strip');
      list.filter(function (x) { return x.id !== c.id && !x.unavailable; }).forEach(function (x) {
        strip.appendChild(h('button.cam-minitile', { type: 'button', 'aria-label': t('cam.open', { name: x.name }), onclick: function () { cur = x.id; draw(); } }, thumb(x, false), h('span.cam-shade'), h('span.cam-name', null, x.name)));
      });
      // under the picture: this camera's motion records, newest first, each with a play button (the history of the last 7 days)
      var recs = h('div.cam-recs');
      function drawRecs() {
        var evs = feed.events().filter(function (e) { return e.camera === c.id; }).slice(0, 80);
        recs.innerHTML = '';
        recs.appendChild(h('div.cr-head', null, h('span', null, t('cam.records')), evs.length ? h('span.ch-n', null, evs.length === 1 ? t('cam.events_1') : t('cam.events_n', { n: evs.length })) : null));
        if (!feed.loaded()) recs.appendChild(h('div.ch-note', null, feed.failed() ? t('cam.history_fail') : t('cam.loading')));
        else if (!evs.length) recs.appendChild(h('div.ch-note', null, feed.failed() ? t('cam.history_fail') : t('cam.history_none')));
        else eventList(ctx, evs, { openedSeen: Infinity, showCamera: false }).forEach(function (n) { recs.appendChild(n); });
      }
      offRecs = feed.on(drawRecs); drawRecs();
      body.appendChild(h('div.cam-live', null, top, live.el, recs, strip.children.length ? strip : null));
      shell.setSubtitle(c.name);
    }
    function draw() { if (disposed) return; if (cur) drawLive(); else drawGrid(); }
    draw();

    return {
      update: function () {
        if (live) live.update();
        if (llPanel) llPanel.update();
        if (cur) feed.poke();
        // alerts and offline states move the tiles' marks without redrawing the images
        if (!cur) {
          var hs = ctx.hass(); if (!hs) return;
          var list = cameras(ctx, true), have = Array.prototype.map.call(body.querySelectorAll('.cam-tile'), function (e) { return e.dataset.id; }).join(',');
          if (list.map(function (x) { return x.id; }).join(',') !== have) drawGrid();
        }
      },
      dispose: function () { disposed = true; clear(); shell.dispose(); },
    };
  }

  /** The recording of one event: the server's Ring page in a full-screen frame (watch, download, trim, star), closed again by its own close button or by ours. */
  function openRecording(ctx, ev) {
    var t = T(ctx), stage = ctx.stage, base = recordingsBase((ctx.settings.get() || {}).cameras, g.location);
    if (!stage || !base) return null;
    var frame = h('iframe.rec-frame', { title: t('cam.play_clip') });
    frame.setAttribute('allow', 'fullscreen; autoplay'); frame.setAttribute('allowfullscreen', ''); frame.setAttribute('src', recordingLink(base, ev.ts));
    var x = h('button.cam-fs-btn.rec-x', { type: 'button', 'aria-label': t('cam.close_clip'), html: UI.icon('close', 22), onclick: function () { close(); } });
    var shell = h('div.cam-full.rec-full', { role: 'dialog', 'aria-modal': 'true' }, frame, x);
    function close() { g.removeEventListener('message', onMsg); document.removeEventListener('keydown', onKey, true); if (shell.parentNode) shell.parentNode.removeChild(shell); }
    function onMsg(e) {
      if (e.source !== frame.contentWindow || !e.data) return;
      if (e.data.okieRing === 'close') close();
      else if (e.data.okieRing === 'none') { close(); try { ctx.toast('info', t('cam.no_clip')); } catch (er) {} }
    }
    function onKey(e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close(); } }
    g.addEventListener('message', onMsg); document.addEventListener('keydown', onKey, true);
    stage.appendChild(shell);
    return { close: close, shell: shell };
  }

  /**
   * The motion records as day groups: a day header and a card of rows (icon, what, when, a round play button when the recordings page is set up; tap the row to watch it).
   * o: { openedSeen: events newer than this get the "New" tag (Infinity = none), showCamera: put the camera's name in the row, pic: { url, lm } = the newest picture, shown on the row it belongs to }
   * Returns the nodes to append.
   */
  function eventList(ctx, evs, o) {
    var t = T(ctx), cc = ctx.settings.get().cameras || {}, canPlay = !!recordingsBase(cc, g.location), out = [], pic = o.pic || {};
    function kindLabel(k) { return k === 'ring' ? t('cam.event_ring') : t('cam.event_motion'); }
    function dayLabel(gr) {
      if (gr.daysAgo === 0) return t('cam.today'); if (gr.daysAgo === 1) return t('cam.yesterday');
      return new Date(gr.start).toLocaleDateString(loc(ctx), { weekday: 'long', month: 'short', day: 'numeric' });
    }
    function camName(id) { var hs = ctx.hass(), st = hs && hs.states[id]; return (st && st.attributes && st.attributes.friendly_name) || String(id).split('.')[1].replace(/_/g, ' '); }
    groupByDay(evs, Date.now()).forEach(function (gr) {
      var rows = h('div.ch-card');
      gr.events.forEach(function (e, i) {
        var isNew = e.ts > (o.openedSeen == null ? Infinity : o.openedSeen), withPic = pic.url && pic.lm && pic.lm.ts && Math.abs(e.ts - pic.lm.ts) < 180000;
        if (i) rows.appendChild(h('div.ios-divider'));
        var row = h('div.ch-row' + (isNew ? '.new' : '') + (canPlay ? '.play' : ''), canPlay ? { role: 'button', tabindex: '0', 'aria-label': t('cam.play_clip') + ': ' + kindLabel(e.kind) + ' ' + clock(ctx, e.ts), onclick: function () { ctx.haptic && ctx.haptic(8); openRecording(ctx, e); }, onkeydown: function (k) { if (k.key === 'Enter' || k.key === ' ') { k.preventDefault(); openRecording(ctx, e); } } } : null,
          h('span.ch-ic' + (e.kind === 'ring' ? '.ring' : ''), { html: UI.icon(e.kind === 'ring' ? 'bell' : 'camera', 18) }),
          h('div.ch-main', null, h('div.ch-t', null, kindLabel(e.kind) + (o.showCamera ? ' · ' + camName(e.camera) : '')), h('div.ch-s', null, clock(ctx, e.ts) + ' · ' + rel(ctx, e.ts))),
          isNew ? h('span.ch-newtag', null, t('cam.new')) : null,
          withPic ? h('span.ch-thumb', { style: { backgroundImage: 'url("' + pic.url.replace(/"/g, '%22') + '")' } }) : null,
          canPlay ? h('span.ch-play', { html: UI.icon('play', 15) }) : null);
        rows.appendChild(row);
      });
      out.push(h('div.ch-day', null, h('span', null, dayLabel(gr)), h('span.ch-n', null, gr.events.length === 1 ? t('cam.events_1') : t('cam.events_n', { n: gr.events.length }))));
      out.push(rows);
    });
    return out;
  }

  function renderHistory(container, ctx) {
    var t = T(ctx), feed = feedFor(ctx), body = null, disposed = false, openedSeen = feed.seenAt(), marked = false;
    var shell = g.OkieMotor.appshell.create(container, ctx, {
      id: 'camhistory', title: t('app.camhistory'), subtitle: '', icon: 'bell', gradient: ['#3a1417', '#a83a40'],
      onTab: function (id, b) { body = b; if (shell) draw(); },
    });
    body = body || shell.body;
    function draw() {
      if (disposed || !body) return;
      var evs = feed.events(), lm = lastMotion(ctx), cc = ctx.settings.get().cameras || {};
      body.innerHTML = ''; var keepTop = body.scrollTop;
      var wrap = h('div.ch');
      // the newest picture, big
      var url = lm && lm.picture ? hassUrl(ctx, lm.picture) : '';
      var watch = h('button.cam-pill.ch-watch', { type: 'button' }, h('span.cam-pill-ic', { html: UI.icon('expand', 18) }), h('span', null, t('cam.watch')));
      var hero = h('div.ch-hero' + (url ? '' : '.none'), null,
        url ? h('div.ch-pic', { style: { backgroundImage: 'url("' + url.replace(/"/g, '%22') + '")' } }) : null,
        h('div.ch-shade'),
        h('div.ch-herotext', null, h('div.ch-h1', null, t('cam.last_motion')), h('div.ch-h2', null, lm && lm.ts ? clock(ctx, lm.ts) + ' · ' + rel(ctx, lm.ts) : (evs[0] ? clock(ctx, evs[0].ts) + ' · ' + rel(ctx, evs[0].ts) : ''))),
        watch);
      UI.pullPill(watch, function () { ctx.openApp('cameras'); });
      wrap.appendChild(hero);
      if (!feed.loaded()) wrap.appendChild(h('div.ch-note', null, feed.failed() ? t('cam.history_fail') : t('cam.loading')));
      else if (!evs.length) wrap.appendChild(h('div.ch-note', null, feed.failed() ? t('cam.history_fail') : t('cam.history_none')));
      eventList(ctx, evs, { openedSeen: openedSeen, showCamera: true, pic: { url: url, lm: lm } }).forEach(function (n) { wrap.appendChild(n); });
      var allClips = recordingsBase(cc, g.location); if (allClips) wrap.appendChild(h('a.act.ch-clips', { href: allClips, target: '_blank', rel: 'noopener' }, t('cam.clips')));
      body.appendChild(wrap); body.scrollTop = keepTop;
      shell.setSubtitle(evs.length ? (evs.length === 1 ? t('cam.events_1') : t('cam.events_n', { n: evs.length })) : '');
      if (feed.loaded() && !marked) { marked = true; feed.markSeen(); }      // the bell on the card goes back to zero once the list has been shown
    }
    var off = feed.on(draw);
    draw();
    return { update: function () { feed.poke(); }, dispose: function () { disposed = true; off(); shell.dispose(); } };
  }

  g.OkieMotor.apps.register({ id: 'cameras', nameKey: 'app.cameras', name: 'Cameras', icon: 'camera', color: '#2f5fb0', order: 55, category: 'system', render: renderApp });
  g.OkieMotor.apps.register({ id: 'camhistory', nameKey: 'app.camhistory', name: 'Motion history', icon: 'bell', color: '#a83a40', order: 56, category: 'system', render: renderHistory });

  // CSS for the card, the apps, the live player and the optional slider page
  var CSS = [
    // the card
    '.camcard{position:relative;border-radius:24px;-webkit-clip-path:inset(0 round 24px);clip-path:inset(0 round 24px);-webkit-transform:translateZ(0);transform:translateZ(0);overflow:hidden;color:#fff;cursor:pointer;min-height:150px;isolation:isolate;background:#1c1916;display:flex;flex-direction:column;justify-content:flex-end;padding:0 18px 16px;box-sizing:border-box;grid-area:w34;}',
    '.cc-pic{position:absolute;inset:-14px;z-index:-2;background-size:cover;background-position:center;filter:blur(6px) saturate(1.18) brightness(1.02);opacity:0;transition:opacity .7s ease;}.cc-pic.on{opacity:1;}',
    '.cc-shade{position:absolute;inset:0;z-index:-1;background:linear-gradient(to top,rgba(10,8,6,.62),rgba(10,8,6,.05) 62%,rgba(10,8,6,.2));}',
    '.cc-chip{position:absolute;left:16px;top:14px;padding:4px 11px;border-radius:12px;font-size:12px;font-weight:600;background:rgba(0,0,0,.34);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.5),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.5),24px));color:rgba(255,255,255,.92);}.cc-chip[hidden]{display:none;}',
    '.cam-cluster{display:flex;flex-direction:column;align-items:flex-start;gap:10px;}',
    '.camcard .cam-cluster{flex-direction:row;align-items:center;justify-content:space-between;gap:12px;width:100%;}',
    '.cc-bell{position:relative;flex:none;width:54px;height:54px;border-radius:50%;display:grid;place-items:center;color:#fff;background:radial-gradient(circle at 34% 28%,#d4585d,#b23c42 70%);box-shadow:0 10px 26px rgba(120,20,26,.4),inset 0 1px 0 rgba(255,255,255,.3);transition:transform .25s cubic-bezier(.34,1.18,.24,1);}',
    '.cc-bell:hover{transform:scale(1.07);}.cc-bell:active{transform:scale(.94);}',
    '.cc-bell[data-alert="true"]{animation:cam-bell 2.4s ease-in-out infinite;}@keyframes cam-bell{0%,100%{transform:none;}8%{transform:rotate(14deg);}16%{transform:rotate(-12deg);}24%{transform:rotate(8deg);}32%{transform:none;}}',
    '.cc-bell[data-alert="true"]::after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 0 rgba(212,88,93,.7);animation:cam-ping 1.8s infinite;}',
    '.cam-badge{position:absolute;top:-5px;right:-5px;min-width:22px;height:22px;padding:0 6px;box-sizing:border-box;border-radius:11px;background:#fff;color:#b23c42;font-size:12px;font-weight:800;font-style:normal;display:grid;place-items:center;z-index:2;box-shadow:0 2px 8px rgba(0,0,0,.3);}.cam-badge[hidden]{display:none;}',
    '.cam-pill{display:flex;align-items:center;gap:14px;padding:7px 24px 7px 7px;border-radius:999px;background:rgba(74,66,42,.76);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px)) saturate(140%);backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px)) saturate(140%);color:#fff;font-size:16px;font-weight:500;letter-spacing:.01em;box-shadow:inset 0 1px 0 rgba(255,255,255,.14);transition:transform .25s cubic-bezier(.34,1.18,.24,1);}',
    '.cam-pill:hover{transform:scale(1.03);}.cam-pill:active{transform:scale(.97);}',
    '.cam-pill-ic{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.2);flex:none;touch-action:none;cursor:grab;position:relative;z-index:1;will-change:transform;}',
    // pull to open (UI.pullPill): the round button follows the finger and turns, a light fills the track behind it, the word drifts off, spreads and blurs
    '.cam-pill{position:relative;overflow:hidden;-webkit-user-select:none;user-select:none;}.cam-pill>span:not(.cam-pill-ic){position:relative;z-index:1;display:inline-block;}',
    '.cam-pill::before{content:"";position:absolute;left:0;top:0;bottom:0;width:calc(51px + var(--pull,0) * (100% - 65px));border-radius:999px;background:linear-gradient(90deg,rgba(255,255,255,.1),rgba(255,255,255,.3));opacity:calc(var(--pull,0) * 2);pointer-events:none;}',
    '.cam-pill.pulling{transform:none!important;}.cam-pill.pulling .cam-pill-ic{cursor:grabbing;background:rgba(255,255,255,.34);}',
    '.cam-pill.pull-snap .cam-pill-ic,.cam-pill.pull-snap .cam-pill-ic svg{transition:transform .32s cubic-bezier(.3,1.35,.45,1);}.cam-pill.pull-snap>span:not(.cam-pill-ic){transition:opacity .3s,transform .3s,letter-spacing .3s,filter .3s;}.cam-pill.pull-snap::before{transition:width .3s ease,opacity .3s ease;}',
    '.stage[data-hoehe="abwerfen"] .camcard{display:none;}',
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]) .bento[data-cams="on"] .w34{display:none;}',      // the wide screen has one row under the slider: the card takes it, Tasks and News make room
    '.stage[data-mobile="true"] .camcard,.stage[data-hoehe="boden"] .camcard{min-height:200px;grid-area:auto;}',
    '.camcard .cam-pill{min-width:0;order:1;}.camcard .cc-bell{order:2;}.stage[data-hoehe="kompakt"] .cc-bell{width:46px;height:46px;}.stage[data-hoehe="kompakt"] .cam-pill-ic{width:36px;height:36px;}.stage[data-hoehe="kompakt"] .cam-pill{font-size:15px;}',
    // the Cameras app
    '.cam-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(210px,1fr));gap:14px;padding:4px 2px 24px;}',
    '.cam-tile{position:relative;display:block;aspect-ratio:16/9;border-radius:22px;overflow:hidden;background:linear-gradient(160deg,#1b2433,#0f141c);color:#fff;text-align:left;padding:0;transition:transform .25s cubic-bezier(.34,1.18,.24,1);}',
    '.cam-tile:hover{transform:scale(1.025);}.cam-tile:active{transform:scale(.97);}',
    '.cam-tile img,.cam-minitile img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}.cam-tile img.bad,.cam-minitile img.bad{visibility:hidden;}',
    '.cam-nopic{position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.28);z-index:0;}.cam-tile img,.cam-minitile img{z-index:1;}.cam-shade{position:absolute;inset:0;z-index:2;background:linear-gradient(to top,rgba(8,10,14,.72),rgba(8,10,14,0) 58%);}',
    '.cam-info{position:absolute;left:14px;right:14px;bottom:11px;z-index:3;display:flex;flex-direction:column;gap:1px;}',
    '.cam-name{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.cam-st{font-size:12px;color:rgba(255,255,255,.75);min-height:15px;}',
    '.cam-tile.alert .cam-st{color:#ff9a9a;font-weight:600;}.cam-tile.alert::after{content:"";position:absolute;top:12px;right:12px;width:10px;height:10px;border-radius:50%;background:#ff4d4f;z-index:3;box-shadow:0 0 0 0 rgba(255,77,79,.7);animation:cam-ping 1.8s infinite;}',
    '.cam-tile.off{opacity:.55;}.cam-play{position:absolute;right:12px;bottom:12px;z-index:3;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.22);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.4),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.4),24px));}',
    '@keyframes cam-ping{0%{box-shadow:0 0 0 0 rgba(255,77,79,.65);}100%{box-shadow:0 0 0 12px rgba(255,77,79,0);}}',
    '.cam-empty{display:flex;flex-direction:column;align-items:center;gap:14px;padding:70px 20px;color:rgba(255,255,255,.7);text-align:center;}',
    '.cam-live{display:flex;flex-direction:column;gap:14px;padding:2px 2px 24px;}',
    '.cam-recs{display:flex;flex-direction:column;gap:6px;}.cr-head{display:flex;justify-content:space-between;align-items:baseline;margin:6px 6px 0;font-size:17px;font-weight:700;}.cam-recs .ch-day{margin-top:10px;}.cam-recs .ch-play{width:38px;height:38px;}.cam-recs .ch-play svg{width:17px;height:17px;}',
    '.cam-live-top{display:flex;align-items:center;gap:12px;min-width:0;}.cam-back{display:inline-flex;align-items:center;gap:6px;flex:none;}.cam-live-name{flex:1;min-width:0;font-size:18px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.cam-chip{flex:none;padding:4px 11px;border-radius:12px;font-size:12px;font-weight:700;background:rgba(255,255,255,.18);}.cam-chip.alert{background:#e0393e;}',
    '.cam-player{position:relative;width:100%;aspect-ratio:16/9;border-radius:26px;overflow:hidden;background:#000;cursor:zoom-in;-webkit-clip-path:inset(0 round 26px);clip-path:inset(0 round 26px);-webkit-transform:translateZ(0);transform:translateZ(0);}',
    '.cam-player.holder{background:rgba(0,0,0,.28);cursor:default;}',
    '.cam-expand{position:absolute;right:12px;bottom:12px;z-index:4;width:38px;height:38px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;color:#fff;background:rgba(20,20,24,.46);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.6),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.6),24px));opacity:.92;}',
    '.cam-full{position:fixed;inset:0;z-index:10001;background:#000;overflow:hidden;}.cam-fs-frame{position:absolute;left:0;top:0;transform-origin:0 0;display:flex;align-items:center;justify-content:center;}',
    '.cam-player.full{position:relative;aspect-ratio:auto;border-radius:0;cursor:default;-webkit-clip-path:none;clip-path:none;-webkit-transform:none;transform:none;width:100%;height:100%;display:flex;align-items:center;justify-content:center;}',
    '.cam-player.full .cam-card{height:auto;width:100%;max-width:calc(var(--cam-fh,100vh) * 1.7778);}.cam-player.full .cam-expand{display:none;}.cam-player.full .cam-snap{max-height:100%;}',
    '.cam-fs-extra{display:contents;}.cam-recbtn i{display:block;width:18px;height:18px;border-radius:50%;background:#ff3b30;box-shadow:0 0 0 3px rgba(255,255,255,.9);transition:border-radius .2s ease,transform .2s ease;}.cam-recbtn.on i{border-radius:4px;transform:scale(.8);animation:camrec 1.2s ease-in-out infinite;}@keyframes camrec{50%{opacity:.45;}}',
    '.cam-rec,.cam-zoom{position:absolute;z-index:6;display:flex;align-items:center;gap:8px;padding:7px 14px;border-radius:999px;color:#fff;font-size:14px;font-weight:600;font-variant-numeric:tabular-nums;background:rgba(40,40,46,.62);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px));pointer-events:none;}',
    '.cam-rec{top:calc(env(safe-area-inset-top,0px) + 14px);left:16px;}.cam-rec i{width:10px;height:10px;border-radius:50%;background:#ff3b30;}.cam-zoom{bottom:16px;left:50%;transform:translateX(-50%);}.cam-rec[hidden],.cam-zoom[hidden]{display:none;}',
    '.cam-player.full{transform-origin:center center;will-change:transform;}',
    '.cam-vitals{position:absolute;z-index:6;left:calc(env(safe-area-inset-left,0px) + 16px);bottom:calc(env(safe-area-inset-bottom,0px) + 16px);display:flex;align-items:center;gap:14px;padding:8px 16px 8px 12px;border-radius:999px;color:#fff;background:rgba(22,22,26,.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.12);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px));pointer-events:none;}.cam-vitals[hidden]{display:none;}',
    '.cam-vdot{width:8px;height:8px;border-radius:50%;background:#8e8e93;flex:none;}.cam-vitals[data-level=green] .cam-vdot{background:#34c759;box-shadow:0 0 8px #34c759;}.cam-vitals[data-level=yellow] .cam-vdot{background:#ffcc00;}.cam-vitals[data-level=red] .cam-vdot{background:#ff3b30;box-shadow:0 0 8px #ff3b30;}.cam-vitals[data-level=blue] .cam-vdot{background:#0a84ff;}',
    '.cam-vi{display:flex;align-items:baseline;gap:4px;}.cam-vi i{display:flex;align-self:center;margin-right:2px;}.cam-vi i svg{filter:drop-shadow(0 0 4px currentColor);}.cam-vi b{font-size:17px;font-weight:600;font-variant-numeric:tabular-nums;}.cam-vi small{font-size:12px;opacity:.75;}',
    // ---- the Owlet camera screen (okie-owlet.js camScreen), the user's reference (2026-11-19)
    '.cow{position:absolute;inset:0;z-index:5;pointer-events:none;color:#fff;}.cow>*{pointer-events:auto;}.cow>.cow-scrim{pointer-events:none;position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.38),rgba(0,0,0,0) 22%,rgba(0,0,0,0) 72%,rgba(0,0,0,.42));}',
    '.cow-fade{transition:opacity .3s ease;}.cam-fs-frame.ui-hide .cow-fade{opacity:0;pointer-events:none;}',
    '.cow-b{width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;color:#fff;background:rgba(28,30,29,.46);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.8),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.8),24px));}.cow-b.on{color:#4fe39a;}',
    '.cow-tl{position:absolute;top:calc(env(safe-area-inset-top,0px) + 22px);left:calc(env(safe-area-inset-left,0px) + 28px);display:flex;align-items:center;gap:14px;}',
    '.cow-logo{display:flex;color:#3fe0b0;fill:none;filter:drop-shadow(0 0 6px rgba(63,224,176,.5));}.cow-brand{font-size:25px;font-weight:700;letter-spacing:-.01em;margin-left:-4px;}',
    '.cow-sep{width:1px;height:26px;background:rgba(255,255,255,.25);display:block;}.cow-live{display:flex;align-items:center;gap:8px;font-size:17px;font-weight:500;}.cow-live i{width:10px;height:10px;border-radius:50%;background:#8e8e93;}.cow-live[data-on="1"] i{background:#34c759;box-shadow:0 0 8px #34c759;}',
    '.cow-tr{position:absolute;top:calc(env(safe-area-inset-top,0px) + 22px);right:calc(env(safe-area-inset-right,0px) + 28px);display:flex;gap:14px;}',
    '.cow-rail{position:absolute;left:calc(env(safe-area-inset-left,0px) + 28px);top:43%;transform:translateY(-50%);display:flex;flex-direction:column;gap:16px;}.cow-rail .cow-b{width:56px;height:56px;}.cow-rail .cow-b.on{color:#4fe39a;background:rgba(52,199,120,.2);box-shadow:inset 0 0 0 1.5px rgba(79,227,154,.55);}',
    '.cow-vit{position:absolute;right:calc(env(safe-area-inset-right,0px) + 28px);top:calc(env(safe-area-inset-top,0px) + 17%);display:flex;flex-direction:column;gap:10px;width:206px;}',
    '.cow-card{display:flex;align-items:center;gap:14px;height:82px;padding:10px 16px 10px 14px;border-radius:22px;box-sizing:border-box;background:rgba(28,30,29,.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);-webkit-backdrop-filter:blur(clamp(6px,var(--glass-blur-amount,20px),28px));backdrop-filter:blur(clamp(6px,var(--glass-blur-amount,20px),28px));cursor:pointer;}',
    '.cow-ic{display:flex;flex:none;width:40px;justify-content:center;}.cow-ic svg{filter:drop-shadow(0 0 5px currentColor);}.cow-cv{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;}',
    '.cow-num{display:flex;align-items:baseline;gap:5px;white-space:nowrap;}.cow-num b{font-size:28px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1;}.cow-num small{font-size:15px;opacity:.9;}.cow-num sub{font-size:.7em;}',
    '.cow-wave{height:20px;}.cow-wave svg{width:100%;height:100%;display:block;overflow:visible;}.cow-wave svg>path:first-of-type{display:none;}.cow-wave.dash svg path{stroke-dasharray:5 5;}',
    '.cow-bar{position:relative;height:6px;border-radius:3px;background:rgba(255,255,255,.18);margin-top:7px;}.cow-bar i{position:absolute;left:0;top:0;bottom:0;width:var(--p,0%);border-radius:3px;background:#34c759;}.cow-bar b{position:absolute;top:50%;left:var(--p,0%);width:10px;height:10px;border-radius:50%;background:#4fe39a;transform:translate(-50%,-50%);box-shadow:0 0 6px #4fe39a;}',
    '.cow-who{position:absolute;left:calc(env(safe-area-inset-left,0px) + 40px);bottom:calc(env(safe-area-inset-bottom,0px) + 30px);text-shadow:0 1px 6px rgba(0,0,0,.4);}.cow-nm{font-size:27px;font-weight:700;letter-spacing:-.01em;}.cow-st{display:flex;align-items:center;gap:8px;font-size:15px;margin-top:4px;}.cow-st i{width:10px;height:10px;border-radius:50%;background:#8e8e93;}.cow-st[data-on="1"] i{background:#34c759;}',
    '.cow-pill{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 22px);transform:translateX(-50%);display:flex;gap:12px;padding:8px;border-radius:999px;background:rgba(28,30,29,.46);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.8),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.8),24px));}.cow-pill{gap:16px;padding:9px 12px;}.cow-pill .cow-b{width:58px;height:58px;background:rgba(255,255,255,.08);box-shadow:none;}.cow-pill .cow-b.rec{color:#ff3b30;}',
    '.cow-stat{position:absolute;right:calc(env(safe-area-inset-right,0px) + 28px);bottom:calc(env(safe-area-inset-bottom,0px) + 22px);display:flex;align-items:center;gap:16px;padding:10px 20px 10px 14px;border-radius:22px;background:rgba(28,30,29,.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);-webkit-backdrop-filter:blur(clamp(6px,var(--glass-blur-amount,20px),28px));backdrop-filter:blur(clamp(6px,var(--glass-blur-amount,20px),28px));}',
    '.cow-sock{display:flex;width:38px;height:38px;}.cow-sock svg{width:100%;height:100%;}.cow-sk{display:flex;flex-direction:column;gap:3px;font-size:14px;}.cow-batt{font-size:15px;font-weight:600;}.cow-net{display:flex;align-items:center;gap:8px;font-size:16px;font-weight:500;}.cow-net>span:first-child{display:flex;color:#4fe39a;}.cow-stat:not([data-on="1"]) .cow-net>span:first-child{color:#8e8e93;}',
    // the picture fills the screen on the Owlet screen (fit toggles back to the whole picture)
    '.cow-on .cam-player.full .cam-card{width:max(100%,calc(var(--cam-fh,100vh) * 1.7778));max-width:none;flex:none;}.cow-on.cow-fit .cam-player.full .cam-card{width:100%;max-width:calc(var(--cam-fh,100vh) * 1.7778);}',
    '.cow-on .cam-player .cam-rtc,.cow-on .cam-player.full .cam-snap{object-fit:cover;}.cow-on.cow-fit .cam-player .cam-rtc,.cow-on.cow-fit .cam-player.full .cam-snap{object-fit:contain;}',
    '.cow-on .cam-rec{left:50%;transform:translateX(-50%);}',
    '.cam-msg{position:absolute;z-index:9;left:50%;top:calc(env(safe-area-inset-top,0px) + 84px);transform:translateX(-50%);padding:9px 16px;border-radius:999px;color:#fff;font-size:15px;font-weight:600;white-space:nowrap;background:rgba(28,30,29,.78);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);pointer-events:none;}.cam-msg[hidden]{display:none;}',
    '.cam-flash{position:absolute;inset:0;z-index:8;background:#fff;opacity:0;pointer-events:none;}.cam-flash.go{animation:camflash .45s ease-out;}@keyframes camflash{0%{opacity:.85;}100%{opacity:0;}}',
    '.cam-clips{position:absolute;inset:0;z-index:10;background:#101010;}.cam-clips iframe{position:absolute;inset:0;width:100%;height:100%;border:0;}.cam-clipsx{position:absolute;top:calc(env(safe-area-inset-top,0px) + 14px);right:calc(env(safe-area-inset-right,0px) + 14px);z-index:2;}',
    '@media (orientation:portrait){.cow-on .cam-player.full .cam-card{width:100%;max-width:calc(var(--cam-fh,100vh) * 1.7778);}.cow-on .cam-player .cam-rtc,.cow-on .cam-player.full .cam-snap{object-fit:contain;}}',      // upright: the whole picture (filling would crop it to a strip)
    // a phone: the same layout, smaller
    '@media (max-height:520px),(max-width:600px){.cow{zoom:.66;}}',
    '.cow-pc,.cow-bar2{display:none;}',
    // Lullabies panel and hold-to-talk (2026-11-20, the user's approved mockup)
    '.cow.lp-open .cow-vit{display:none;}.cow-mic.talking{background:#ff3b30;color:#fff;box-shadow:0 0 0 4px rgba(255,59,48,.3);}',
    '.cow-talk{position:absolute;top:calc(env(safe-area-inset-top,0px) + 90px);left:50%;transform:translateX(-50%);display:flex;align-items:center;gap:10px;padding:10px 18px;border-radius:999px;background:rgba(255,59,48,.88);font-size:15px;font-weight:600;white-space:nowrap;z-index:7;}.cow-talk[hidden]{display:none;}.cow-talk svg{flex:none;}',
    '.cow-lp{position:absolute;right:calc(env(safe-area-inset-right,0px) + 28px);top:calc(env(safe-area-inset-top,0px) + 92px);bottom:calc(env(safe-area-inset-bottom,0px) + 104px);width:340px;display:flex;flex-direction:column;gap:12px;padding:16px;border-radius:26px;box-sizing:border-box;background:rgba(24,26,25,.62);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);-webkit-backdrop-filter:blur(clamp(6px,var(--glass-blur-amount,20px),28px));backdrop-filter:blur(clamp(6px,var(--glass-blur-amount,20px),28px));z-index:6;}.cow-lp[hidden]{display:none;}',
    '.cow-lph{display:flex;align-items:center;justify-content:space-between;}.cow-lph b{font-size:21px;font-weight:700;}.cow-lpx{width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;color:#fff;background:rgba(255,255,255,.08);}',
    '.cow-seg{display:flex;padding:3px;border-radius:999px;background:rgba(255,255,255,.08);}.cow-seg button{flex:1;padding:8px 0;border-radius:999px;color:#fff;background:none;font-size:14px;font-weight:500;}.cow-seg button.on{background:#fff;color:#1d1b19;font-weight:600;}',
    '.cow-lpnote{font-size:13px;opacity:.75;}.cow-lpnote[hidden]{display:none;}.cow-lpempty{font-size:14px;opacity:.7;padding:10px 4px;}',
    '.cow-lprows{flex:1;min-height:0;overflow-y:auto;display:flex;flex-direction:column;gap:6px;scrollbar-width:none;-webkit-overflow-scrolling:touch;}.cow-lprows::-webkit-scrollbar{display:none;}',
    '.cow-lpr{display:flex;align-items:center;gap:12px;padding:9px 12px 9px 9px;border-radius:15px;color:#fff;background:rgba(255,255,255,.05);text-align:left;flex:none;}.cow-lpr.on{background:rgba(52,199,120,.18);box-shadow:inset 0 0 0 1px rgba(79,227,154,.5);}',
    '.cow-lpr i{display:flex;align-items:center;justify-content:center;width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.1);color:#4fe39a;flex:none;}.cow-lpr span{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px;}.cow-lpr b{font-size:15px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.cow-lpr small{font-size:12.5px;opacity:.6;}.cow-lpr em{display:flex;flex:none;}',
    '.cow-lph{gap:8px;}.cow-lph b{flex:1;}.cow-lpren.on{background:#fff;color:#1d1b19;}.cow-lpr.ren{cursor:default;}.cow-lpin{width:100%;box-sizing:border-box;padding:6px 10px;border-radius:10px;border:0;background:rgba(255,255,255,.12);color:#fff;font:inherit;font-size:15px;}',
    '.cow-lpadd{width:100%;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border-radius:15px;color:#fff;background:none;border:1px dashed rgba(255,255,255,.3);font-size:14px;}',
    '.cow-lpctl{display:flex;align-items:center;gap:6px;flex-wrap:wrap;}.cow-lptim{display:flex;gap:6px;}.cow-chip{display:flex;align-items:center;gap:5px;padding:7px 11px;border-radius:999px;color:#fff;background:rgba(255,255,255,.08);font-size:13px;white-space:nowrap;}.cow-chip.on{background:#fff;color:#1d1b19;font-weight:600;}.cow-chip.stop{margin-left:auto;}',
    '.cow-lpvol{display:flex;align-items:center;gap:10px;font-size:13px;}.cow-lpvol>span:first-child{display:flex;}.cow-lpvol input{flex:1;accent-color:#4fe39a;}',
    // upright phone, the user's 9:16 reference (2026-11-19): no rail, the cards top right, one glass bar (name | sock | online), three round buttons under it
    '@media (orientation:portrait) and (max-width:600px){',
    '.cow-rail{display:none;}.cow-vit{top:calc(env(safe-area-inset-top,0px) + 12.5%);}',
    '.cow-bar2{display:block;position:absolute;left:calc(env(safe-area-inset-left,0px) + 18px);right:calc(env(safe-area-inset-right,0px) + 18px);bottom:calc(env(safe-area-inset-bottom,0px) + 150px);height:104px;border-radius:32px;background:rgba(28,30,29,.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);-webkit-backdrop-filter:blur(clamp(6px,var(--glass-blur-amount,20px),28px));backdrop-filter:blur(clamp(6px,var(--glass-blur-amount,20px),28px));}',
    '.cow-who{left:calc(env(safe-area-inset-left,0px) + 52px);bottom:calc(env(safe-area-inset-bottom,0px) + 174px);}',
    '.cow-stat{right:calc(env(safe-area-inset-right,0px) + 30px);bottom:calc(env(safe-area-inset-bottom,0px) + 150px);height:104px;padding:0 0 0 26px;border-radius:0;background:none;box-shadow:inset 1px 0 0 rgba(255,255,255,.18);-webkit-backdrop-filter:none;backdrop-filter:none;}',
    '.cow-pill{bottom:calc(env(safe-area-inset-bottom,0px) + 36px);gap:76px;padding:0;background:none;box-shadow:none;-webkit-backdrop-filter:none;backdrop-filter:none;align-items:center;}',
    '.cow-pill .cow-b{width:70px;height:70px;background:rgba(28,30,29,.5);box-shadow:inset 0 0 0 1px rgba(255,255,255,.1);-webkit-backdrop-filter:blur(16px);backdrop-filter:blur(16px);}',
    '.cow-pill .k-rec{width:80px;height:80px;color:#4fe39a;background:rgba(40,120,80,.25);box-shadow:inset 0 0 0 2px #4fe39a,0 0 18px rgba(79,227,154,.35);}.cow-pill .k-rec svg{width:30px;height:30px;}',
    '.cow-lo{display:none;}.cow-pc{display:flex;}.cow-pill .k-clips{order:1;}.cow-pill .k-rec{order:2;}.cow-pill .k-snap{order:3;}',
    '.cow-lp{left:calc(env(safe-area-inset-left,0px) + 18px);right:calc(env(safe-area-inset-right,0px) + 18px);width:auto;top:calc(env(safe-area-inset-top,0px) + 12.5%);bottom:calc(env(safe-area-inset-bottom,0px) + 270px);}',
    '}',
    '.cam-fs-bar{transition:opacity .3s ease;}.cam-fs-frame.ui-hide .cam-fs-bar{opacity:0;pointer-events:none;}',
    '.cam-player .cam-rtc{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:2;}.cam-player.rtc-on .cam-card{visibility:hidden;}',
    '.cam-volw{display:flex;align-items:center;height:44px;padding:0 16px;border-radius:22px;background:rgba(40,40,46,.62);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px));}.cam-volw[hidden]{display:none;}',
    '.cam-vol{width:120px;margin:0;accent-color:#fff;height:28px;}',
    '.cam-fs-bar{position:absolute;top:calc(env(safe-area-inset-top,0px) + 12px);right:12px;display:flex;gap:10px;z-index:5;}',
    '.cam-fs-btn{width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;padding:0;color:#fff;background:rgba(40,40,46,.62);-webkit-backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px));backdrop-filter:blur(clamp(6px,calc(var(--glass-blur-amount,20px)*0.7),24px));}',
    '.cam-player .cam-card{--video-max-height:none;display:block;width:100%;height:100%;--ha-card-border-radius:0;--ha-card-box-shadow:none;--ha-card-border-width:0;--ha-card-background:transparent;--card-background-color:transparent;}',
    '.cam-player .cam-snap{width:100%;height:100%;object-fit:contain;display:block;}.cam-note{position:absolute;left:12px;right:12px;bottom:10px;padding:6px 10px;border-radius:10px;font-size:11.5px;background:rgba(0,0,0,.55);color:rgba(255,255,255,.85);}',
    '.cam-paused{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:16px;text-align:center;background:rgba(0,0,0,.72);color:#fff;font-size:13.5px;}.cam-paused[hidden]{display:none;}.cam-paused b{margin-top:4px;padding:8px 18px;border-radius:999px;background:#fff;color:#1d1b19;font-size:14px;}',
    '.cam-strip{display:flex;gap:10px;overflow-x:auto;padding:2px 0 6px;scrollbar-width:none;}.cam-strip::-webkit-scrollbar{display:none;}',
    '.cam-minitile{position:relative;flex:0 0 132px;aspect-ratio:16/9;border-radius:14px;overflow:hidden;background:#141b27;color:#fff;padding:0;}.cam-minitile .cam-name{position:absolute;left:8px;right:8px;bottom:5px;z-index:3;font-size:11.5px;}',
    // the Motion history app
    '.ch{display:flex;flex-direction:column;gap:6px;padding:2px 2px 28px;}',
    '.ch-hero{position:relative;border-radius:24px;overflow:hidden;min-height:190px;background:linear-gradient(160deg,#3a2a24,#150f0d);display:flex;align-items:flex-end;justify-content:space-between;gap:12px;padding:16px;box-sizing:border-box;margin-bottom:8px;}',
    '.ch-pic{position:absolute;inset:0;background-size:cover;background-position:center;}.ch-shade{position:absolute;inset:0;background:linear-gradient(to top,rgba(10,8,6,.7),rgba(10,8,6,.05) 65%);}',
    '.ch-herotext{position:relative;display:flex;flex-direction:column;gap:2px;min-width:0;}.ch-h1{font-size:12.5px;font-weight:600;color:rgba(255,255,255,.78);text-transform:uppercase;letter-spacing:.06em;}.ch-h2{font-size:20px;font-weight:700;}',
    '.ch-watch{position:relative;flex:none;padding:5px 18px 5px 5px;font-size:14px;}.ch-watch .cam-pill-ic{width:34px;height:34px;}',
    '.ch-note{padding:30px 10px;text-align:center;color:rgba(255,255,255,.7);}',
    '.ch-day{display:flex;justify-content:space-between;align-items:baseline;margin:14px 6px 6px;font-size:13px;font-weight:700;letter-spacing:.02em;text-transform:uppercase;color:rgba(255,255,255,.85);}.ch-n{font-size:12px;font-weight:500;color:rgba(255,255,255,.55);text-transform:none;}',
    '.ch-card{border-radius:20px;background:rgba(255,255,255,.08);overflow:hidden;}',
    '.ch-row{display:flex;align-items:center;gap:12px;padding:12px 14px;}.ch-row.new{background:rgba(224,57,62,.12);}',
    '.ch-ic{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;flex:none;background:rgba(255,255,255,.14);}.ch-ic.ring{background:#b23c42;}',
    '.ch-main{flex:1;min-width:0;}.ch-t{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.ch-s{font-size:12.5px;color:rgba(255,255,255,.65);margin-top:1px;}',
    '.ch-newtag{flex:none;padding:2px 9px;border-radius:9px;font-size:11px;font-weight:800;background:#e0393e;}',
    '.ch-thumb{flex:none;width:58px;height:42px;border-radius:10px;background-size:cover;background-position:center;}',
    '.ch-clips{align-self:center;margin-top:16px;text-decoration:none;display:inline-block;}',
    '.ch-row.play{cursor:pointer;-webkit-tap-highlight-color:transparent;transition:background .12s ease;}.ch-row.play:active{background:rgba(255,255,255,.12);}.ch-row.play:focus-visible{outline:2px solid rgba(255,255,255,.7);outline-offset:-2px;}',
    '.ch-play{flex:none;width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.16);color:#fff;}.ch-play svg{margin-left:2px;}',
    '.rec-full{background:#000;}.rec-frame{position:absolute;inset:0;width:100%;height:100%;border:0;background:#0b0b0d;}.rec-x{position:absolute;top:calc(env(safe-area-inset-top,0px) + 12px);left:12px;z-index:6;}',
    // the optional slider page
    '.w2-page[data-page="cameras"]{padding:0 18px 52px;justify-content:flex-end;cursor:pointer;}',
    '.cam-pic{position:absolute;inset:-10px;background-size:cover;background-position:center;filter:blur(1.5px) saturate(1.18) brightness(1.08);opacity:0;transition:opacity .7s ease;}.cam-pic.on{opacity:1;}',
    '.cam-pageshade{position:absolute;inset:0;background:linear-gradient(to top,rgba(10,8,6,.6),rgba(10,8,6,.04) 60%,rgba(10,8,6,.16));}',
    '.cam-bellwrap{position:relative;align-self:flex-end;margin-right:12%;width:58px;height:58px;}',
    '.cam-bell{position:absolute;inset:0;border-radius:50%;display:grid;place-items:center;color:#fff;background:radial-gradient(circle at 34% 28%,#d4585d,#b23c42 70%);box-shadow:0 10px 26px rgba(120,20,26,.4),inset 0 1px 0 rgba(255,255,255,.3);}',
    '.cam-bellwrap[data-alert="true"] .cam-bell{animation:cam-bell 2.4s ease-in-out infinite;}',
    '.cam-bellwrap[data-alert="true"]::after{content:"";position:absolute;inset:0;border-radius:50%;box-shadow:0 0 0 0 rgba(212,88,93,.7);animation:cam-ping 1.8s infinite;}',
    '.stage[data-hoehe="kompakt"] .cam-bellwrap{display:none;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  g.OkieMotor.cameras = Object.assign({ liveView: liveView, snapUrl: snapUrl, cameras: cameras, countLabel: countLabel, buildCard: buildCard, feedFor: feedFor, CSS: CSS }, pureApi);
})(typeof globalThis !== 'undefined' ? globalThis : window);

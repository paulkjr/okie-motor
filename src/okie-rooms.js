/* okie-rooms: rooms as cards.
 *
 * The Start screen gets a "Rooms" tab next to Favorites and Suggestions: one card per room (Living Room, Bedroom, Patio ...), and a room opens
 * like the Tips app: a hero with the room's name and, under it, a card for every device in the room (tap to open it, tap the icon to switch it).
 *
 * Where the rooms come from:
 *   1. the dashboard configuration (shared by every device that shows the dashboard):
 *        rooms:
 *          - name: Living Room
 *            area: Living Room                      # optional: every device Home Assistant has in this area (a list works too)
 *            items: [climate.living_room, media_player.living_room_65_tcl_roku_tv, switch.kindle_fire_screen]
 *          - name: Patio
 *            items: [light.patio_light, camera.front_door_live_view]
 *   2. without a `rooms` list: the areas of Home Assistant, one room per area that has devices.
 *
 * The pure part (normalizeRooms, buildRooms, roomIcon, summarize) is unit-tested; the UI below is exercised by the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // ------------------------------------------------------------ pure ----
  function slug(s) { return String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'room'; }
  function dedupe(list) { var seen = {}; return list.filter(function (x) { if (seen[x]) return false; seen[x] = true; return true; }); }
  function entityIds(v) { return dedupe([].concat(v == null ? [] : v).map(function (x) { return typeof x === 'string' ? x.trim() : ''; }).filter(function (x) { return x.indexOf('.') > 0; })); }
  function names(v) { return dedupe([].concat(v == null ? [] : v).map(function (x) { return typeof x === 'string' ? x.trim() : ''; }).filter(Boolean)); }

  /** The `rooms` setting as clean data: [{ id, name, items: [entity ids], areas: [area names], icon }]. Rooms without a name are dropped, ids are unique. */
  function normalizeRooms(raw) {
    if (!Array.isArray(raw)) return [];
    var taken = {}, out = [];
    raw.forEach(function (r) {
      if (!r || typeof r !== 'object') return;
      var name = String(r.name == null ? '' : r.name).trim();
      if (!name) return;
      var base = slug(r.id || name), id = base, n = 2;
      while (taken[id]) id = base + '-' + (n++);
      taken[id] = true;
      out.push({ id: id, name: name, items: entityIds(r.items || r.entities), areas: names(r.areas || r.area), icon: r.icon ? String(r.icon) : '' });
    });
    return out;
  }
  /** What counts as a device when a room is filled from a Home Assistant area: things you switch or watch, not every sensor, button and setting the device brings along. */
  var DEVICE_DOMAINS = ['light', 'switch', 'climate', 'media_player', 'cover', 'fan', 'lock', 'vacuum', 'camera', 'humidifier', 'water_heater', 'valve', 'lawn_mower', 'siren', 'alarm_control_panel'];
  function isDeviceDomain(domain) { return DEVICE_DOMAINS.indexOf(domain) >= 0; }
  function cleanEdit(e) { return { add: entityIds(e && e.add), remove: entityIds(e && e.remove) }; }
  /** A room's devices after your own changes: the ones you took out are gone, the ones you added come at the end. */
  function applyEdits(ids, edit) {
    var e = cleanEdit(edit), gone = {}; e.remove.forEach(function (id) { gone[id] = true; });
    return dedupe((ids || []).filter(function (id) { return !gone[id]; }).concat(e.add));
  }
  /** Put a device into a room or take it out. base = the room's devices before any change of yours; returns the new edit { add, remove }. */
  function toggleDevice(base, edit, id) {
    var e = cleanEdit(edit), inBase = (base || []).indexOf(id) >= 0, has = applyEdits(base, e).indexOf(id) >= 0;
    if (has) { e.add = e.add.filter(function (x) { return x !== id; }); if (inBase && e.remove.indexOf(id) < 0) e.remove.push(id); }
    else { e.remove = e.remove.filter(function (x) { return x !== id; }); if (!inBase && e.add.indexOf(id) < 0) e.add.push(id); }
    return e;
  }

  /**
   * The rooms to show. raw = the `rooms` setting, areaMap = { 'Living Room': [entity ids of that area] } from Home Assistant, edits = { roomId: { add, remove } } (your changes).
   * `base` of a room is its list before your changes.
   * A configured list wins (its own items first, then the devices of its areas); without one every area that has devices is a room.
   * -> [{ id, name, icon, ids: [entity ids], custom }]
   */
  /** A room keeps its id (so its devices and order stay) when you give it another name. baseName is the name it had before. */
  function applyNames(rooms, names) {
    names = names || {};
    rooms.forEach(function (r) { r.baseName = r.name; var n = typeof names[r.id] === 'string' ? names[r.id].trim() : ''; if (n) r.name = n; });
    return rooms;
  }
  function buildRooms(raw, areaMap, edits, extras, names) {
    var all = buildBase(raw, areaMap, edits);
    var taken = {}; all.forEach(function (r) { taken[r.id] = true; });
    normalizeRooms(extras).forEach(function (r) {                    // rooms you made yourself in the app: empty until you put devices in
      var base = r.id, id = base, n = 2; while (taken[id]) id = base + '-' + (n++); taken[id] = true;
      var room = { id: id, name: r.name, icon: r.icon, ids: [], custom: true, extra: true };
      room.base = []; room.ids = applyEdits([], (edits || {})[id]); all.push(room);
    });
    return applyNames(all, names);
  }
  function buildBase(raw, areaMap, edits) {
    areaMap = areaMap || {}; edits = edits || {};
    function fin(r) { r.base = r.ids.slice(); r.ids = applyEdits(r.ids, edits[r.id]); return r; }
    var custom = normalizeRooms(raw), keys = Object.keys(areaMap);
    if (custom.length) {
      return custom.map(function (r) {
        var list = r.items.slice();
        r.areas.forEach(function (a) { keys.forEach(function (k) { if (k.toLowerCase() === a.toLowerCase()) list = list.concat(areaMap[k] || []); }); });
        return fin({ id: r.id, name: r.name, icon: r.icon, ids: dedupe(list), custom: true });
      });
    }
    return keys.sort(function (a, b) { return a.localeCompare(b); }).filter(function (k) { return (areaMap[k] || []).length; })
      .map(function (k) { return fin({ id: slug(k), name: k, icon: '', ids: dedupe(areaMap[k]), custom: false }); });
  }
  /** A fitting icon (a name of OkieMotor.ui.ICONS) from the room's name, unless the room names one itself. */
  function roomIcon(room) {
    if (room && room.icon) return room.icon;
    var n = String(room && room.name || '').toLowerCase();
    if (/bed|schlaf|sleep|nursery|kinder/.test(n)) return 'moon';
    if (/living|wohn|lounge|tv|salon|den\b/.test(n)) return 'tv';
    if (/patio|garden|garten|outside|outdoor|terrass|balkon|balcony|yard|porch|deck/.test(n)) return 'sun';
    if (/kitchen|küche|kueche|dining|esszimmer/.test(n)) return 'flame';
    if (/front|door|entry|eingang|hall|flur|garage/.test(n)) return 'door';
    if (/office|büro|buero|study|work/.test(n)) return 'gauge';
    return 'homeroom';
  }
  /** How many devices a room has and how many of them are on. resolve(id) -> { domain, state } or null (a device that does not exist is not counted). */
  function summarize(room, resolve, isOn) {
    var total = 0, on = 0;
    (room.ids || []).forEach(function (id) { var d = resolve(id); if (!d) return; total++; if (isOn(d.domain, d.state)) on++; });
    return { total: total, on: on };
  }

  /** The saved order of a room's devices first (the ones that are still in the room), then the others the way the room lists them. */
  function applyOrder(ids, saved) {
    var inRoom = {}; (ids || []).forEach(function (id) { inRoom[id] = true; });
    var first = dedupe([].concat(saved || []).filter(function (id) { return typeof id === 'string' && inRoom[id]; }));
    var done = {}; first.forEach(function (id) { done[id] = true; });
    return first.concat((ids || []).filter(function (id) { return !done[id]; }));
  }
  /** Move one id a step up (-1) or down (+1) in a list; the list stays as it is at the ends. */
  function moveId(ids, id, dir) {
    var out = ids.slice(), i = out.indexOf(id), j = i + dir;
    if (i < 0 || j < 0 || j >= out.length) return out;
    out[i] = out[j]; out[j] = id; return out;
  }

  /** The rooms in the order that was arranged (saved ids first), the others after them in the order they come. */
  function applyRoomOrder(rooms, saved) {
    var by = {}; rooms.forEach(function (r) { by[r.id] = r; });
    return applyOrder(rooms.map(function (r) { return r.id; }), saved).map(function (id) { return by[id]; });
  }
  /** A new order for the part of a list that is shown: those first, then whatever else the list holds. */
  function mergeOrder(all, shown) {
    var inShown = {}; shown.forEach(function (id) { inShown[id] = true; });
    return shown.concat((all || []).filter(function (id) { return !inShown[id]; }));
  }

  /** Which devices have a taller card as an alternative to the usual row. */
  function canTall(domain) { return domain === 'climate' || domain === 'media_player' || domain === 'camera'; }
  /** 'tall' or 'compact' for a device: what you chose, else the tall card for the devices that have one. */
  function resolveStyle(saved, domain) {
    if (!canTall(domain)) return 'compact';
    if (saved === 'large' && domain === 'media_player') return 'large';      // a music player has a third size: the big cover (a TV falls back to the tall card)
    return saved === 'compact' || saved === 'tall' ? saved : 'tall';
  }
  /** m:ss (h:mm:ss from an hour on) of a number of seconds. */
  function fmtTime(sec) {
    var s = Math.max(0, Math.floor(+sec || 0)), h0 = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60;
    return (h0 ? h0 + ':' + (m < 10 ? '0' : '') : '') + m + ':' + (r < 10 ? '0' : '') + r;
  }
  /** Where a track is now, in seconds: the position the player reported plus the time since it did (while it plays), never past the end; null when the player does not say. */
  function playPos(a, playing, now) {
    var p = a && a.media_position != null ? +a.media_position : NaN; if (!isFinite(p)) return null;
    if (playing && a.media_position_updated_at) { var t0 = Date.parse(a.media_position_updated_at); if (t0) p += Math.max(0, ((now == null ? Date.now() : now) - t0) / 1000); }
    var d = +a.media_duration; if (d > 0) p = Math.min(p, d);
    return Math.max(0, p);
  }
  /** A TV (or screen) and not a speaker or music player. */
  function isTvItem(item) { return item.deviceClass === 'tv' || /tv|roku|crystal|samsung|display|fernseh/i.test(item.name + ' ' + item.id); }

  /** The rooms that are not hidden. */
  function visibleRooms(rooms, hidden) { var h = {}; [].concat(hidden || []).forEach(function (id) { h[id] = true; }); return rooms.filter(function (r) { return !h[r.id]; }); }

  var api = { fmtTime: fmtTime, playPos: playPos, isTvItem: isTvItem, applyNames: applyNames, visibleRooms: visibleRooms, canTall: canTall, resolveStyle: resolveStyle, DEVICE_DOMAINS: DEVICE_DOMAINS, isDeviceDomain: isDeviceDomain, applyEdits: applyEdits, toggleDevice: toggleDevice, applyOrder: applyOrder, moveId: moveId, applyRoomOrder: applyRoomOrder, mergeOrder: mergeOrder, slug: slug, normalizeRooms: normalizeRooms, buildRooms: buildRooms, roomIcon: roomIcon, summarize: summarize };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  // -------------------------------------------------------------- UI ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, L = g.OkieMotor.logic, h = UI.h;

  core.registerStrings('en', {
    'b.rooms': 'Rooms', 'rm.sub': '{n} devices · {on} on', 'rm.sub1': '1 device · {on} on', 'rm.sub0': 'No devices yet',
    'rm.live': 'Live', 'rm.rename': 'Rename this room', 'rm.rename_save': 'Save', 'rm.rename_orig': 'Use the original name', 'rm.rename_name': 'Name of the room',
    'rm.style_row': 'Row', 'rm.style_tall': 'Tall', 'rm.style_large': 'Large', 'rm.style_title': 'Card type',
    'rm.reorder': 'Edit this room', 'rm.done': 'Done', 'rm.up': 'Move up', 'rm.down': 'Move down', 'rm.top': 'Move to the top', 'rm.remove': 'Take out of this room', 'rm.drag': 'Drag to move',
    'rm.to_right': 'Move to the right', 'rm.to_left': 'Move to the left', 'rm.fav_title': 'Favorites', 'rm.in_fav': '{n} favorites', 'rm.add_fav': 'Add or remove favorites', 'rm.add_room': 'New room', 'rm.new_title': 'New room', 'rm.new_name': 'Name of the room', 'rm.new_make': 'Add', 'rm.hidden': 'Hidden rooms', 'rm.show_again': 'Show again', 'rm.unfav': 'Take out of the favorites', 'rm.hide_room': 'Remove this room',
    'rm.add': 'Add devices', 'rm.add_title': 'Devices in {room}', 'rm.search': 'Search devices', 'rm.scope_devices': 'Devices', 'rm.scope_sensors': 'Sensors', 'rm.scope_all': 'Everything',
    'rm.in_room': '{n} in this room', 'rm.more': '{n} more: type to narrow it down', 'rm.nomatch': 'Nothing found',
    'rm.humidity': 'Humidity', 'rm.nothing': 'Nothing playing', 'rm.off': 'Off', 'rm.tv': 'Smart TV', 'rm.speaker': 'Speaker', 'rm.open': 'Open',
    'rm.none': 'No rooms yet. Give your devices an area in Home Assistant, or add a rooms list to the dashboard.', 'rm.empty': 'Nothing in this room yet. Add devices to the room under items in the dashboard, or put them in this area in Home Assistant.',
  });
  core.registerStrings('de', {
    'b.rooms': 'Räume', 'rm.sub': '{n} Geräte · {on} an', 'rm.sub1': '1 Gerät · {on} an', 'rm.sub0': 'Noch keine Geräte',
    'rm.live': 'Live', 'rm.rename': 'Raum umbenennen', 'rm.rename_save': 'Speichern', 'rm.rename_orig': 'Ursprünglichen Namen verwenden', 'rm.rename_name': 'Name des Raums',
    'rm.style_row': 'Zeile', 'rm.style_tall': 'Groß', 'rm.style_large': 'Sehr groß', 'rm.style_title': 'Kartentyp',
    'rm.reorder': 'Raum bearbeiten', 'rm.done': 'Fertig', 'rm.up': 'Nach oben', 'rm.down': 'Nach unten', 'rm.top': 'Ganz nach oben', 'rm.remove': 'Aus diesem Raum nehmen', 'rm.drag': 'Zum Verschieben ziehen',
    'rm.to_right': 'Nach rechts verschieben', 'rm.to_left': 'Nach links verschieben', 'rm.fav_title': 'Favoriten', 'rm.in_fav': '{n} Favoriten', 'rm.add_fav': 'Favoriten hinzufügen oder entfernen', 'rm.add_room': 'Neuer Raum', 'rm.new_title': 'Neuer Raum', 'rm.new_name': 'Name des Raums', 'rm.new_make': 'Hinzufügen', 'rm.hidden': 'Ausgeblendete Räume', 'rm.show_again': 'Wieder anzeigen', 'rm.unfav': 'Aus den Favoriten nehmen', 'rm.hide_room': 'Diesen Raum entfernen',
    'rm.add': 'Geräte hinzufügen', 'rm.add_title': 'Geräte in {room}', 'rm.search': 'Geräte suchen', 'rm.scope_devices': 'Geräte', 'rm.scope_sensors': 'Sensoren', 'rm.scope_all': 'Alles',
    'rm.in_room': '{n} in diesem Raum', 'rm.more': '{n} weitere: Suche eingrenzen', 'rm.nomatch': 'Nichts gefunden',
    'rm.humidity': 'Feuchtigkeit', 'rm.nothing': 'Es läuft nichts', 'rm.off': 'Aus', 'rm.tv': 'Smart-TV', 'rm.speaker': 'Lautsprecher', 'rm.open': 'Öffnen',
    'rm.none': 'Noch keine Räume. Gib deinen Geräten in Home Assistant einen Bereich oder füge dem Dashboard eine Raumliste hinzu.', 'rm.empty': 'In diesem Raum ist noch nichts. Füge Geräte unter items im Dashboard hinzu oder lege sie in Home Assistant in diesen Bereich.',
  });

  var CSS = [
    '.rm-list{display:flex;flex-direction:column;gap:10px;}.rm-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;}',
    '.rm-card{display:flex;align-items:center;gap:14px;width:100%;box-sizing:border-box;padding:14px 16px;border-radius:22px;border:1px solid var(--glass-border-color);-webkit-backdrop-filter:var(--okie-card-bf,none);backdrop-filter:var(--okie-card-bf,none);background:var(--okie-tile,rgba(255,255,255,.1));color:var(--okie-text);font:inherit;text-align:left;cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .15s ease,background .2s ease;}',
    '.rm-card:hover{background:rgba(255,255,255,.16);}.rm-card:focus-visible{outline:2px solid rgba(255,255,255,.7);outline-offset:2px;}',
    '.rm-ic{flex:none;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.14);}.rm-ic svg{width:24px;height:24px;}',
    '.rm-txt{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px;}.rm-name{font-size:17px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.rm-sub{font-size:13px;color:var(--okie-text-dim);}',
    '.rm-chev{flex:none;opacity:.6;}.rm-chev svg{width:18px;height:18px;display:block;}',
    '.rm-card.on .rm-ic{background:rgba(255,255,255,.9);color:#1d1b19;}',
    '.rm-grid .rm-card{flex-direction:column;align-items:flex-start;gap:10px;padding:16px;}.rm-grid .rm-chev{display:none;}',
    // the taller cards of a room: the thermostat (big number, its colour on the right) and the TV / speaker (picture tile, now playing, controls)
    '.rc{position:relative;display:flex;box-sizing:border-box;width:100%;border-radius:26px;border:1px solid var(--glass-border-color);-webkit-backdrop-filter:var(--okie-card-bf,none);backdrop-filter:var(--okie-card-bf,none);background:var(--okie-tile,rgba(255,255,255,.1));color:var(--okie-text);overflow:hidden;-webkit-tap-highlight-color:transparent;text-align:left;font:inherit;}',
    '.rc.open{cursor:pointer;transition:transform .15s ease;}.rc:focus-visible{outline:2px solid rgba(255,255,255,.7);outline-offset:2px;}.rc.unav{opacity:.55;}',
    '.rc-climate{min-height:124px;background:linear-gradient(90deg,rgba(var(--rc-rgb,255,255,255),var(--rc-tint,0)),transparent 62%),var(--okie-tile,rgba(255,255,255,.1));}',
    '.rc-climate .rc-num{text-shadow:0 0 34px rgba(var(--rc-rgb,255,255,255),.34);}',
    '.rc-climate .rc-sub b,.rc-climate .rc-cap{transition:color .4s ease;}',
    '.rc-modes{flex:none;width:64px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;border-right:1px solid rgba(255,255,255,.12);}',
    '.rc-modes i{display:grid;place-items:center;color:rgba(255,255,255,.35);transition:color .25s ease;}.rc-modes i svg{width:22px;height:22px;}.rc-modes i.on{color:var(--rc-accent,#fff);}',
    '.rc-main{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px;padding:14px 16px;}',
    '.rc-cap{font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--okie-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.rc-num{display:flex;align-items:flex-start;gap:4px;font-family:"Okie Sora",var(--okie-font);font-weight:800;font-size:54px;line-height:1;letter-spacing:-.03em;}.rc-num sup{font-size:17px;font-weight:700;letter-spacing:0;margin-top:5px;color:var(--okie-text-dim);}',
    '.rc-sub{font-size:13px;color:var(--okie-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.rc-sub b{color:var(--okie-text);font-weight:700;}',
    '.rc-go{flex:none;width:66px;border:0;display:grid;place-items:center;background:var(--rc-accent,#ff2d55);color:#fff;transition:background .4s ease;}.rc-go svg{width:26px;height:26px;}',
    '.rc{-webkit-clip-path:inset(0 round 26px);clip-path:inset(0 round 26px);}',
    '.rc-cam{display:block;aspect-ratio:16/9;min-height:0;background:#14110f;}.rc-shot{position:absolute;inset:0;overflow:hidden;}',
    '.rc-shot-ph{position:absolute;inset:0;display:grid;place-items:center;color:rgba(255,255,255,.3);}.rc-shot-ph svg{width:46px;height:46px;}',
    '.rc-shot img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .4s ease;}.rc-cam.has .rc-shot img{opacity:1;}',
    '.rc-shade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,rgba(0,0,0,.34),rgba(0,0,0,0) 36%,rgba(0,0,0,.66));}',
    '.rc-chip{position:absolute;left:14px;top:12px;padding:4px 11px;border-radius:12px;font-size:12px;font-weight:700;background:rgba(0,0,0,.36);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;}',
    '.rc-cap2{position:absolute;left:16px;right:118px;bottom:14px;display:flex;flex-direction:column;gap:2px;color:#fff;text-shadow:0 1px 8px rgba(0,0,0,.5);}.rc-cap2 .rc-name{font-size:19px;}.rc-cap2 .rc-sub{color:rgba(255,255,255,.8);}',
    '.rc-live{position:absolute;right:12px;bottom:12px;display:flex;align-items:center;gap:8px;padding:10px 15px;border:0;border-radius:999px;background:rgba(255,255,255,.22);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;font:inherit;font-size:14px;font-weight:700;}.rc-live svg{width:18px;height:18px;}',
    '.rm-ren{display:none;align-items:center;gap:10px;align-self:flex-start;border:0;border-radius:999px;padding:11px 18px;background:rgba(255,255,255,.18);color:#fff;font:inherit;font-size:14px;font-weight:700;cursor:pointer;}.rm-ren svg{width:18px;height:18px;}.rm-list.editing .rm-ren{display:flex;}',
    '.rc-media{flex-direction:column;min-height:166px;}',
    // a speaker or music player (Spotify): one row - the cover, what is playing, play-pause and next
    // the third size of a music player: a big cover on the left; who is playing, the song, the artist, the progress and the controls on the right
    '.rc-cover{flex-direction:row;align-items:center;gap:18px;min-height:178px;padding:17px;}',
    '.cv-art{flex:none;width:144px;height:144px;border-radius:24px;overflow:hidden;display:grid;place-items:center;background:rgba(0,0,0,.3);color:rgba(255,255,255,.85);box-shadow:0 8px 22px rgba(0,0,0,.4),inset 0 0 0 1px rgba(255,255,255,.08);}.cv-art svg{width:44px;height:44px;}.cv-art img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.cv-main{flex:1;min-width:0;align-self:stretch;display:flex;flex-direction:column;justify-content:space-between;gap:6px;}',
    '.cv-head{display:flex;align-items:center;gap:10px;}.cv-cap{flex:1;min-width:0;font-size:13px;font-weight:500;letter-spacing:.15em;text-transform:uppercase;color:rgba(255,255,255,.78);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.cv-logo{flex:none;width:30px;height:30px;display:block;}.cv-logo svg{width:100%;height:100%;display:block;}',
    '.cv-title{font-size:23px;font-weight:800;line-height:1.12;letter-spacing:-.01em;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.cv-artist{font-size:16px;font-weight:500;color:rgba(255,255,255,.86);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.cv-bar{position:relative;height:6px;border-radius:3px;background:rgba(255,255,255,.26);cursor:pointer;margin-top:8px;}.cv-bar i{position:absolute;left:0;top:0;bottom:0;width:0;border-radius:3px;background:#55c2f5;box-shadow:0 0 9px rgba(85,194,245,.5);}',
    '.cv-ctl{display:grid;grid-template-columns:1fr auto 1fr;align-items:start;margin-top:6px;}',
    '.cv-time{font-size:14px;font-weight:500;color:rgba(255,255,255,.9);font-variant-numeric:tabular-nums;}.cv-time.r{justify-self:end;}',
    '.cv-btns{display:flex;align-items:center;gap:16px;}',
    '.rc-cover .rc-tr{width:42px;height:42px;}.rc-cover .rc-tr svg{width:27px;height:27px;}.rc-cover .rc-tr.nx svg{transform:scaleX(-1);}',
    '.rc-cover .rc-tr.play,.rc-cover .rc-pw{width:60px;height:60px;background:#fff;color:#1d1b19;}.rc-cover .rc-tr.play svg{width:28px;height:28px;}.rc-cover .rc-pw svg{width:24px;height:24px;}.rc-cover .rc-tr.play:disabled{background:rgba(255,255,255,.2);color:rgba(255,255,255,.6);opacity:1;}',
    '.rc-music{flex-direction:row;align-items:center;gap:12px;min-height:0;padding:14px 12px 14px 14px;}',
    '.rc-mopen{flex:1;min-width:0;display:flex;align-items:center;gap:14px;border-radius:18px;}',
    '.rc-music .rc-art{width:84px;height:84px;border-radius:18px;box-shadow:0 4px 14px rgba(0,0,0,.35);}',
    '.rc-mid{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px;}',
    '.rc-mcap{font-size:11.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--okie-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.rc-music .rc-np{gap:3px;}.rc-music .rc-np b{font-size:18px;line-height:1.15;}.rc-music .rc-np span{font-size:14px;color:rgba(255,255,255,.8);}',
    '.rc-ctl{flex:none;display:flex;align-items:center;gap:4px;}',
    '.rc-music .rc-tr.play,.rc-music .rc-pw{width:52px;height:52px;background:#fff;color:#1d1b19;}.rc-music .rc-tr.play svg{width:24px;height:24px;}.rc-music .rc-pw svg{width:22px;height:22px;}.rc-music .rc-tr.play:disabled{background:rgba(255,255,255,.2);color:rgba(255,255,255,.6);opacity:1;}',
    '.rc-music .rc-tr.nx{width:42px;height:42px;}.rc-music .rc-tr.nx svg{width:24px;height:24px;}',
    '.rc-top{display:flex;align-items:center;gap:14px;padding:14px 16px 12px;}',
    '.rc-art{flex:none;width:76px;height:76px;border-radius:20px;display:grid;place-items:center;background:rgba(0,0,0,.28);overflow:hidden;color:rgba(255,255,255,.85);}.rc-art svg{width:38px;height:38px;}.rc-art img{width:100%;height:100%;object-fit:cover;display:block;}',
    '.rc-ttl{min-width:0;flex:1;display:flex;flex-direction:column;gap:3px;}.rc-name{font-size:19px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.rc-pw{flex:none;width:44px;height:44px;border-radius:50%;border:0;display:grid;place-items:center;background:rgba(255,255,255,.14);color:#fff;}.rc-pw svg{width:20px;height:20px;}.rc-pw.on{background:#fff;color:#1d1b19;}',
    '.rc-bot{display:flex;align-items:center;gap:12px;margin-top:auto;padding:10px 16px 12px;border-top:1px solid rgba(255,255,255,.12);background:rgba(0,0,0,.14);}',
    '.rc-np{min-width:0;flex:1;display:flex;flex-direction:column;gap:2px;}.rc-np b{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.rc-np span{font-size:12.5px;color:var(--okie-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.rc-tr{flex:none;width:44px;height:44px;border-radius:50%;border:0;display:grid;place-items:center;background:transparent;color:#fff;}.rc-tr svg{width:26px;height:26px;}.rc-tr:disabled{opacity:.3;}.rc-tr:active{transform:scale(.92);}',
    // changing the order: every card gets an up and a down button, the card itself does nothing meanwhile
    '.rm-item{position:relative;}.rm-ord{display:none;}.rm-list.editing .rm-item>:first-child{pointer-events:none;}',
    '.rm-list.editing .rm-ord{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:0 12px;border-radius:26px;background:rgba(20,18,16,.66);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);z-index:3;}',
    '.rm-ord b{margin-right:auto;font-size:13px;font-weight:700;letter-spacing:.04em;color:rgba(255,255,255,.8);text-transform:uppercase;}',
    '.rm-ord button{width:46px;height:46px;border-radius:50%;border:0;display:grid;place-items:center;background:rgba(255,255,255,.92);color:#1d1b19;}.rm-ord button svg{width:22px;height:22px;}.rm-ord button:disabled{opacity:.3;}',
    '.rm-ord .up svg{transform:rotate(180deg);}',
    '.rm-ord{gap:6px;padding:0 10px;}.rm-ord button{width:38px;height:38px;flex:none;}.rm-ord button svg{width:20px;height:20px;}.rm-ord b{min-width:0;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;}',
    '.rm-ord,.rm-item{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}.rm-item.drag{will-change:transform;}',
    '.rm-ord .grip{background:transparent;color:rgba(255,255,255,.85);width:32px;touch-action:none;cursor:grab;}.rm-ord .grip svg{width:22px;height:22px;}',
    '.rm-ord .rm-x{background:rgba(255,80,80,.92);color:#fff;}',
    // the same strip on the Start screen: over a room card of the Rooms tab and over a favorite
    '.w1.editing .rm-wrap .rm-ord{position:absolute;inset:0;display:flex;align-items:center;justify-content:flex-end;gap:6px;padding:0 10px;border-radius:22px;background:rgba(20,18,16,.8);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);z-index:3;}',
    '.w1.editing .rm-wrap>.rm-card{pointer-events:none;}.rm-ord.hz .up svg{transform:rotate(90deg);}.rm-ord.hz .dn svg{transform:rotate(-90deg);}',
    '.w1.editing .rm-grid .rm-ord{flex-wrap:wrap;align-content:flex-end;justify-content:flex-end;padding:10px;}.w1.editing .rm-grid .rm-ord b{flex:1 0 100%;margin:0 0 auto;}',
    '.fv-sw .mv{flex:none;width:38px;height:38px;border-radius:50%;border:0;display:grid;place-items:center;background:rgba(255,255,255,.92);color:#1d1b19;}.fv-sw .mv svg{width:20px;height:20px;}.fv-sw .mv:disabled{opacity:.3;}',
    '.fv-sw .up svg{transform:rotate(180deg);}.fv-sw.hz .up svg{transform:rotate(90deg);}.fv-sw.hz .dn svg{transform:rotate(-90deg);}.fv-sw.hz{justify-content:flex-end;flex-wrap:wrap;align-content:flex-end;padding:10px;gap:6px;}.fv-sw.hz b{flex:1 0 100%;}',
    '.fv-sw .grip{background:transparent;color:rgba(255,255,255,.85);width:32px;touch-action:none;cursor:grab;}.fv-sw{gap:6px;}',
    '.fv-sw{gap:4px;padding:0 10px;}.fv-sw .mv,.fv-sw .fv-x{width:34px;height:34px;}.fv-sw .mv svg,.fv-sw .fv-x svg{width:18px;height:18px;}.fv-sw .grip{width:26px;}.fv-sw .rm-seg button{padding:7px 9px;font-size:12px;}',
    '.rm-ord .grip,.fv-sw .grip{flex:none;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.18);color:#fff;}.rm-ord .grip svg,.fv-sw .grip svg{width:24px;height:24px;}',
    '.fv-item,.rm-wrap{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}.fv-item.drag,.rm-wrap.drag{z-index:6;box-shadow:0 18px 40px rgba(0,0,0,.45);border-radius:26px;transition:none;will-change:transform;}',
    '.rm-item.drag{z-index:6;box-shadow:0 18px 40px rgba(0,0,0,.45);border-radius:26px;transition:none;}.rm-item.drag .rm-ord{background:rgba(20,18,16,.82);}',
    '.fv-item{position:relative;}.fv-sw{display:none;position:absolute;inset:0;z-index:3;align-items:center;gap:10px;padding:0 14px;border-radius:26px;background:rgba(20,18,16,.66);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);}',
    '.w1.editing .fv-sw{display:flex;}.fv-item.sw-on>:first-child{pointer-events:none;}.w1.editing .fv-item>:first-child{pointer-events:none;}',
    '.fv-sw b{min-width:0;flex:1;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:rgba(255,255,255,.85);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.rm-seg{display:inline-flex;flex:none;padding:3px;gap:2px;border-radius:14px;background:rgba(255,255,255,.14);}.rm-seg button{white-space:nowrap;border:0;border-radius:11px;padding:8px 11px;background:transparent;color:rgba(255,255,255,.85);font:inherit;font-size:13px;font-weight:700;cursor:pointer;}.rm-seg button.on{background:#fff;color:#1d1b19;}',
    '.rm-newrow{display:flex;gap:10px;align-items:center;margin-bottom:10px;}.rm-newrow .rm-q{margin:0;flex:1;}.rm-mk{flex:none;border:0;border-radius:16px;padding:13px 20px;background:#fff;color:#1d1b19;font:inherit;font-size:15px;font-weight:700;cursor:pointer;}',
    '.fv-sw .fv-side{flex:none;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.22);color:#fff;}.fv-sw .fv-side svg{width:20px;height:20px;}.fv-sw .fv-side.r svg{transform:rotate(180deg);}',
    '.fv-sw .fv-x{flex:none;width:38px;height:38px;border-radius:50%;border:0;display:grid;place-items:center;background:rgba(255,80,80,.92);color:#fff;}.fv-sw .fv-x svg{width:18px;height:18px;}',
    '.rm-wrap{position:relative;}.rm-del{display:none;position:absolute;top:-8px;right:-6px;z-index:5;width:22px;height:22px;padding:0;border-radius:50%;border:1.5px solid rgba(255,255,255,.92);place-items:center;background:#e0393e;color:#fff;}.rm-del svg{width:11px;height:11px;}.w1.editing .rm-del{display:grid;}',
    // the cross that takes a card out is a small badge on the card's corner, outside the box
    '.fv-item>.fv-x,.rm-item>.rm-x{display:none;position:absolute;top:-8px;right:-6px;z-index:7;width:22px;height:22px;padding:0;border-radius:50%;border:1.5px solid rgba(255,255,255,.92);place-items:center;background:#e0393e;color:#fff;}.fv-item>.fv-x svg,.rm-item>.rm-x svg{width:11px;height:11px;}',
    '.w1.editing .fv-item>.fv-x,.rm-list.editing .rm-item>.rm-x{display:grid;}',
    '.w1.editing .w1-body{padding-top:12px;}',
    '.w1.editing .rm-add{display:flex;}.w1-body>.rm-add{margin-top:10px;}',
    '.rm-add{display:none;align-items:center;justify-content:center;gap:10px;width:100%;box-sizing:border-box;padding:16px;border-radius:26px;border:1.5px dashed rgba(255,255,255,.5);background:transparent;color:#fff;font:inherit;font-size:16px;font-weight:700;cursor:pointer;}',
    '.rm-list.editing .rm-add{display:flex;}.rm-add svg{width:22px;height:22px;}',
    '.rm-q{width:100%;box-sizing:border-box;margin:2px 0 10px;padding:12px 16px;border-radius:16px;border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.1);color:#fff;font:inherit;font-size:16px;outline:none;}.rm-q::placeholder{color:rgba(255,255,255,.55);}',
    '.rm-cnt{margin:10px 2px 6px;font-size:12.5px;color:var(--okie-text-dim);}',
    '.rm-pick{display:flex;flex-direction:column;gap:6px;}.rm-pr{display:flex;align-items:center;gap:12px;width:100%;box-sizing:border-box;padding:10px 12px;border-radius:18px;border:0;background:rgba(255,255,255,.08);color:#fff;font:inherit;text-align:left;cursor:pointer;}',
    '.rm-pr.on{background:rgba(255,255,255,.2);}.rm-pr .pi{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);}.rm-pr .pi svg{width:20px;height:20px;}',
    '.rm-pr .pt{min-width:0;flex:1;display:flex;flex-direction:column;gap:1px;}.rm-pr .pt b{font-size:15px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.rm-pr .pt span{font-size:12px;color:var(--okie-text-dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.rm-pr .ck{flex:none;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;border:2px solid rgba(255,255,255,.4);}.rm-pr.on .ck{background:#fff;border-color:#fff;color:#1d1b19;}.rm-pr .ck svg{width:16px;height:16px;opacity:0;}.rm-pr.on .ck svg{opacity:1;}',
    '.rm-hint{padding:18px 6px;color:var(--okie-text-dim);font-size:14px;line-height:1.4;text-align:center;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  var GRADIENTS = [['#2a3550', '#6b82b8'], ['#4a2f3a', '#b3677f'], ['#2e4a3a', '#6fb08a'], ['#4d3a22', '#c79a55'], ['#33284d', '#8a6fc4'], ['#1f3f4a', '#5fa8bf']];

  /** { 'Living Room': [ids] } from the areas Home Assistant knows, for the devices the card shows. */
  function areaMap(ctx) {
    var hs = ctx.hass(), map = {};
    Object.keys((hs && hs.states) || {}).forEach(function (id) {
      var it = ctx.engine.getItem(id);
      if (it && it.area && isDeviceDomain(it.domain)) (map[it.area] = map[it.area] || []).push(id);
    });
    return map;
  }
  function roomsEvery(ctx) { var s = ctx.settings.get(); return buildRooms(s.rooms, areaMap(ctx), s.roomEdits, s.roomsExtra, s.roomNames); }
  function roomsNow(ctx) { var s = ctx.settings.get(); return applyRoomOrder(visibleRooms(roomsEvery(ctx), s.roomsHidden), s.roomsOrder); }
  /** The item of a device: the card's own, or (for a device named in the rooms list that the card hides, e.g. a diagnostic one) one made from its state. */
  function itemOf(ctx, id) {
    var it = ctx.engine.getItem(id);
    if (it) return it;
    var hs = ctx.hass(), st = hs && hs.states && hs.states[id];
    if (!st) return null;
    var a = st.attributes || {}, r = (hs.entities && hs.entities[id]) || {}, dev = r.device_id && hs.devices ? hs.devices[r.device_id] : null, areaId = r.area_id || (dev && dev.area_id) || null;
    return { id: id, domain: id.split('.')[0], deviceClass: a.device_class || null, name: a.friendly_name || r.name || id, areaId: areaId, area: areaId && hs.areas && hs.areas[areaId] ? hs.areas[areaId].name : null, labels: r.labels || [], state: st.state, unit: a.unit_of_measurement || null, icon: a.icon || r.icon || null, category: r.entity_category || null };
  }
  function orderOf(ctx, room) { var o = ctx.settings.get().roomOrder; return applyOrder(room.ids, o && o[room.id]); }
  function roomItems(ctx, room) { return orderOf(ctx, room).map(function (id) { return itemOf(ctx, id); }).filter(Boolean); }
  function stats(ctx, room) {
    return summarize(room, function (id) { var it = itemOf(ctx, id), st = it && ctx.state(id); return it && st ? { domain: it.domain, state: st.state } : null; }, L.isOn);
  }
  function subtitle(ctx, room) {
    var s = stats(ctx, room), t = function (k, v) { return core.t(k, ctx.lang(), v); };
    return s.total === 0 ? t('rm.sub0') : (s.total === 1 ? t('rm.sub1', { on: s.on }) : t('rm.sub', { n: s.total, on: s.on }));
  }


  // ------------------------------------------------- the taller cards ----
  function tUnit(ctx) { var hs = ctx.hass(); return (hs && hs.config && hs.config.unit_system && hs.config.unit_system.temperature) || '°C'; }
  function openIt(ctx, el, item) { el.classList.add('open'); el.setAttribute('role', 'button'); el.tabIndex = 0; el.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('button.rc-pw,button.rc-tr')) return; ctx.openDetail(item.id, el); }); el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.openDetail(item.id, el); } }); }
  var MODE_ICON = { heat: 'flame', cool: 'snowflake', heat_cool: 'sun', auto: 'sun', dry: 'drop', fan_only: 'fan' };

  /** The thermostat: its modes on the left (the running one lit), the target in big numbers, how warm it is now, and its colour as the button that opens it. */
  function climateCard(ctx, item) {
    var TH = g.OkieMotor.thermo, t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var modesBox = h('div.rc-modes'), cap = h('div.rc-cap', null, L.shortName(item.name, item.area)), num = h('div.rc-num'), sub = h('div.rc-sub');
    var go = h('button.rc-go', { type: 'button', 'aria-label': t('rm.open'), html: UI.icon('chevron', 26), onclick: function (e) { e.stopPropagation(); ctx.openDetail(item.id, el); } });
    var el = h('div.rc.rc-climate', null, modesBox, h('div.rc-main', null, cap, num, sub), go);
    openIt(ctx, el, item);
    var modeKey = '';
    function modeName(m) { var k = 'th.mode.' + m, v = t(k); return v !== k ? v : L.stateLabel(m, ctx.lang()); }
    function update() {
      var st = ctx.state(item.id); if (!st) return;
      var a = st.attributes || {}, unit = tUnit(ctx), step = a.target_temp_step || (unit === '°F' ? 1 : 0.5), comma = ctx.lang() === 'de';
      var min = a.min_temp != null ? +a.min_temp : (unit === '°F' ? 45 : 7), max = a.max_temp != null ? +a.max_temp : (unit === '°F' ? 95 : 35);
      var target = a.temperature != null ? +a.temperature : (a.target_temp_low != null && a.target_temp_high != null ? (+a.target_temp_low + +a.target_temp_high) / 2 : (a.current_temperature != null ? +a.current_temperature : min));
      var off = st.state === 'off', gone = st.state === 'unavailable' || st.state === 'unknown';
      el.classList.toggle('unav', gone);
      var c = TH.colorFor(target, min, max, unit, ctx.settings.get().thermo);
      // the very same colour rule as the Thermo Dial: its scale (your Dial look settings) at the temperature it is set to; the arrow, the lit mode, the glow of the number and the tint all follow it
      el.style.setProperty('--rc-accent', off || gone ? 'rgba(255,255,255,.22)' : 'rgb(' + c.r + ',' + c.g + ',' + c.b + ')');
      el.style.setProperty('--rc-rgb', off || gone ? '255,255,255' : c.r + ',' + c.g + ',' + c.b);
      el.style.setProperty('--rc-tint', off || gone ? '0' : '.18');
      num.innerHTML = ''; num.appendChild(document.createTextNode(off || gone ? '–' : TH.fmt(target, step, comma))); if (!off && !gone) num.appendChild(h('sup', null, unit));
      var parts = [];
      if (a.current_temperature != null) parts.push(t('d.now') + ' ' + a.current_temperature + unit);
      if (gone) parts = [L.stateLabel(st.state, ctx.lang())];
      else if (off) parts.push(t('rm.off')); else parts.push(modeName(st.state));
      if (a.current_humidity != null && !gone) parts.push(t('rm.humidity') + ' ' + Math.round(a.current_humidity) + '%');
      sub.textContent = parts.join(' · ');
      var modes = (a.hvac_modes || []).filter(function (m, i, all) { return m !== 'off' && !(m === 'auto' && all.indexOf('heat_cool') >= 0); }).slice(0, 4), key = modes.join(',');
      if (key !== modeKey) { modeKey = key; modesBox.innerHTML = ''; modes.forEach(function (m) { modesBox.appendChild(h('i', { dataset: { mode: m }, title: modeName(m), html: UI.icon(MODE_ICON[m] || 'thermostat', 22) })); }); }
      Array.prototype.forEach.call(modesBox.children, function (i) { i.classList.toggle('on', !off && !gone && i.dataset.mode === st.state); });
    }
    return { el: el, update: update };
  }

  var CV_PREV = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4.2" y="5" width="2.7" height="14" rx="1.2" fill="currentColor"/><path d="M19.6 6.3v11.4a.9.9 0 0 1-1.4.75L9.7 12.75a.9.9 0 0 1 0-1.5l8.5-5.7a.9.9 0 0 1 1.4.75z" fill="currentColor"/></svg>';
  var CV_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.6v12.8a1 1 0 0 0 1.52.85l10.3-6.4a1 1 0 0 0 0-1.7L9.52 4.75A1 1 0 0 0 8 5.6z" fill="currentColor"/></svg>';
  var CV_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.8" width="4.3" height="14.4" rx="1.5" fill="currentColor"/><rect x="13.7" y="4.8" width="4.3" height="14.4" rx="1.5" fill="currentColor"/></svg>';
  var CV_SPOTIFY = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M5.3 8.5c4.1-1.2 9-.9 13.1.9" fill="none" stroke="#0b0b0b" stroke-width="2" stroke-linecap="round"/><path d="M6 12c3.5-1 7.2-.7 10.4.9" fill="none" stroke="#0b0b0b" stroke-width="1.7" stroke-linecap="round"/><path d="M6.7 15.3c2.8-.8 5.5-.5 8 .8" fill="none" stroke="#0b0b0b" stroke-width="1.4" stroke-linecap="round"/></svg>';
  /**
   * The third size of a music player (Spotify, Cast): the cover big on the left; on the right who is playing, the song, the artist, a progress line with the times and the controls (previous, play and pause, next).
   * Tap the line to jump in the track when the player can. Power shows instead of the controls while a player that can be switched on is off.
   */
  function coverCard(ctx, item) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var spot = /spotify/i.test(item.id + ' ' + item.name);
    var art = h('div.cv-art', { html: UI.icon('speaker', 44) }), cap = h('div.cv-cap'), npT = h('div.cv-title'), npS = h('div.cv-artist');
    var logo = h('span.cv-logo', { html: CV_SPOTIFY }); if (!spot) logo.style.display = 'none';
    var fill = h('i'), bar = h('div.cv-bar', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': '100' }, fill), tl = h('div.cv-time'), tr = h('div.cv-time.r');
    var pw = h('button.rc-pw', { type: 'button', 'aria-label': t('d.power'), html: UI.icon('power', 24), onclick: function (e) { e.stopPropagation(); ctx.call('media_player', 'turn_on', { entity_id: item.id }).catch(function () {}); } });
    var prev = h('button.rc-tr.pv', { type: 'button', 'aria-label': 'Previous', html: CV_PREV, onclick: function (e) { e.stopPropagation(); ctx.call('media_player', 'media_previous_track', { entity_id: item.id }).catch(function () {}); } });
    var play = h('button.rc-tr.play', { type: 'button', 'aria-label': 'Play / pause', onclick: function (e) { e.stopPropagation(); ctx.call('media_player', 'media_play_pause', { entity_id: item.id }).catch(function () {}); } });
    var next = h('button.rc-tr.nx', { type: 'button', 'aria-label': 'Next', html: CV_PREV, onclick: function (e) { e.stopPropagation(); ctx.call('media_player', 'media_next_track', { entity_id: item.id }).catch(function () {}); } });
    var el = h('div.rc.rc-media.rc-cover', null, art, h('div.cv-main', null, h('div.cv-head', null, cap, logo), h('div', null, npT, npS), bar, h('div.cv-ctl', null, tl, h('div.cv-btns', null, pw, prev, play, next), tr)));
    openIt(ctx, el, item);
    var attrs = {}, playing = false, picture = '';
    bar.addEventListener('click', function (e) {
      e.stopPropagation();
      var d = +attrs.media_duration; if (!(d > 0) || !((attrs.supported_features || 0) & 2)) return;
      var r = bar.getBoundingClientRect(); if (r.width < 4) return;
      ctx.call('media_player', 'media_seek', { entity_id: item.id, seek_position: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * d }).catch(function () {});
    });
    function paintTime() {
      var d = +attrs.media_duration, p = playPos(attrs, playing);
      if (p == null || !(d > 0)) { fill.style.width = '0'; tl.textContent = ''; tr.textContent = ''; return; }
      fill.style.width = (p / d * 100).toFixed(2) + '%'; bar.setAttribute('aria-valuenow', String(Math.round(p / d * 100)));
      tl.textContent = fmtTime(p); tr.textContent = fmtTime(d);
    }
    var seen = false, tick = setInterval(function () { if (el.isConnected) { seen = true; if (playing) paintTime(); } else if (seen) clearInterval(tick); }, 1000);
    function update() {
      var st = ctx.state(item.id); if (!st) return;
      var a = attrs = st.attributes || {}, s = st.state, gone = s === 'unavailable' || s === 'unknown', off = s === 'off' || s === 'standby';
      playing = s === 'playing';
      var canOn = a.supported_features == null || (a.supported_features & 128) !== 0, showPw = off && canOn;
      el.classList.toggle('unav', gone);
      cap.textContent = item.name;
      npT.textContent = gone ? '–' : (a.media_title || (off ? t('rm.off') : t('rm.nothing')));
      npS.textContent = gone ? L.stateLabel(s, ctx.lang()) : off ? '' : [a.media_artist || a.media_series_title || '', a.media_title ? '' : (a.app_name || '')].filter(Boolean).join(' · ');
      pw.style.display = showPw ? '' : 'none'; prev.style.display = play.style.display = next.style.display = showPw ? 'none' : '';
      play.innerHTML = playing ? CV_PAUSE : CV_PLAY;
      play.disabled = prev.disabled = next.disabled = gone || off;
      paintTime();
      var pic = !gone && !off && a.entity_picture_local ? a.entity_picture_local : (!gone && !off && a.entity_picture ? a.entity_picture : '');
      if (pic !== picture) { picture = pic; art.innerHTML = ''; if (pic) { var img = h('img', { src: pic, alt: '' }); img.addEventListener('error', function () { art.innerHTML = UI.icon('speaker', 44); picture = ''; }); art.appendChild(img); } else art.innerHTML = UI.icon('speaker', 44); }
    }
    update();
    return { el: el, update: update };
  }
  /** A speaker or music player (Spotify ...): one row - the cover, who and what is playing, play-pause and next. Power shows only while it is off and only when it can be switched on. */
  function musicCard(ctx, item) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var art = h('div.rc-art', { html: UI.icon('speaker', 38) }), cap = h('div.rc-mcap'), npT = h('b'), npS = h('span');
    var pw = h('button.rc-pw', { type: 'button', 'aria-label': t('d.power'), html: UI.icon('power', 22), onclick: function (e) { e.stopPropagation(); ctx.call('media_player', 'turn_on', { entity_id: item.id }).catch(function () {}); } });
    var play = h('button.rc-tr.play', { type: 'button', 'aria-label': 'Play / pause', onclick: function (e) { e.stopPropagation(); ctx.call('media_player', 'media_play_pause', { entity_id: item.id }).catch(function () {}); } });
    var next = h('button.rc-tr.nx', { type: 'button', 'aria-label': 'Next', html: UI.icon('next', 26), onclick: function (e) { e.stopPropagation(); ctx.call('media_player', 'media_next_track', { entity_id: item.id }).catch(function () {}); } });
    var open = h('div.rc-mopen', null, art, h('div.rc-mid', null, cap, h('div.rc-np', null, npT, npS)));
    var el = h('div.rc.rc-media.rc-music', null, open, h('div.rc-ctl', null, pw, play, next));
    openIt(ctx, open, item); open.style.cursor = 'pointer';
    var picture = '';
    function update() {
      var st = ctx.state(item.id); if (!st) return;
      var a = st.attributes || {}, s = st.state, gone = s === 'unavailable' || s === 'unknown', off = s === 'off' || s === 'standby', playing = s === 'playing';
      var canOn = a.supported_features == null || (a.supported_features & 128) !== 0;      // a player that cannot be switched on (Spotify) has no power button
      el.classList.toggle('unav', gone);
      cap.textContent = item.name;
      npT.textContent = gone ? '–' : (a.media_title || (off ? t('rm.off') : t('rm.nothing')));
      npS.textContent = gone || off ? (gone ? L.stateLabel(s, ctx.lang()) : '') : [a.media_artist || a.media_series_title || '', a.media_title ? '' : (a.app_name || '')].filter(Boolean).join(' · ');
      pw.style.display = off && canOn ? '' : 'none'; play.style.display = next.style.display = off && canOn ? 'none' : '';
      play.innerHTML = UI.icon(playing ? 'pause' : 'play', 24);
      play.disabled = next.disabled = gone || off;
      var pic = !gone && !off && a.entity_picture_local ? a.entity_picture_local : (!gone && !off && a.entity_picture ? a.entity_picture : '');
      if (pic !== picture) { picture = pic; art.innerHTML = ''; if (pic) { var img = h('img', { src: pic, alt: '' }); img.addEventListener('error', function () { art.innerHTML = UI.icon('speaker', 38); picture = ''; }); art.appendChild(img); } else art.innerHTML = UI.icon('speaker', 38); }
    }
    update();      // filled at once, not on the next state change
    return { el: el, update: update };
  }
  /** The TV / speaker: a picture tile, its name and what it is, then what is playing with play-pause and next. */
  function mediaCard(ctx, item) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var isTv = isTvItem(item);
    if (!isTv) return musicCard(ctx, item);
    var art = h('div.rc-art', { html: UI.icon(isTv ? 'tv' : 'speaker', 38) }), name = h('div.rc-name', null, item.name), what = h('div.rc-sub');
    var pw = h('button.rc-pw', { type: 'button', 'aria-label': t('d.power'), html: UI.icon('power', 20), onclick: function (e) { e.stopPropagation(); var on = ((ctx.state(item.id) || {}).state || 'off') !== 'off'; ctx.call('media_player', on ? 'turn_off' : 'turn_on', { entity_id: item.id }).catch(function () {}); } });
    var npT = h('b'), npS = h('span');
    var play = h('button.rc-tr', { type: 'button', 'aria-label': 'Play / pause', onclick: function (e) { e.stopPropagation(); ctx.call('media_player', 'media_play_pause', { entity_id: item.id }).catch(function () {}); } });
    var next = h('button.rc-tr', { type: 'button', 'aria-label': 'Next', html: UI.icon('next', 26), onclick: function (e) { e.stopPropagation(); ctx.call('media_player', 'media_next_track', { entity_id: item.id }).catch(function () {}); } });
    var top = h('div.rc-top', null, art, h('div.rc-ttl', null, name, what), pw), bot = h('div.rc-bot', null, h('div.rc-np', null, npT, npS), play, next);
    var el = h('div.rc.rc-media', null, top, bot);
    openIt(ctx, top, item); el.classList.remove('open'); top.style.cursor = 'pointer';
    var picture = '';
    function update() {
      var st = ctx.state(item.id); if (!st) return;
      var a = st.attributes || {}, s = st.state, gone = s === 'unavailable' || s === 'unknown', off = s === 'off' || s === 'standby', playing = s === 'playing';
      el.classList.toggle('unav', gone);
      pw.classList.toggle('on', !off && !gone);
      what.textContent = gone ? L.stateLabel(s, ctx.lang()) : (a.source || a.app_name || t(isTv ? 'rm.tv' : 'rm.speaker'));
      npT.textContent = gone ? '–' : (a.media_title || (off ? t('rm.off') : (playing ? t('rm.speaker') : t('rm.nothing'))));
      npS.textContent = gone || off ? '' : [a.media_artist || a.media_series_title || '', a.app_name && a.media_title ? a.app_name : ''].filter(Boolean).join(' · ');
      play.innerHTML = UI.icon(playing ? 'pause' : 'play', 26);
      play.disabled = next.disabled = gone || off;
      var pic = !gone && !off && a.entity_picture_local ? a.entity_picture_local : (!gone && !off && a.entity_picture ? a.entity_picture : '');
      if (pic !== picture) { picture = pic; art.innerHTML = ''; if (pic) { var img = h('img', { src: pic, alt: '' }); img.addEventListener('error', function () { art.innerHTML = UI.icon(isTv ? 'tv' : 'speaker', 38); picture = ''; }); art.appendChild(img); } else art.innerHTML = UI.icon(isTv ? 'tv' : 'speaker', 38); }
    }
    return { el: el, update: update };
  }
  /** A camera: its latest picture as a big card (16:9) with its name and a Live button that opens it. The picture is fetched again every 20 seconds. */
  function cameraCard(ctx, item) {
    var CM = g.OkieMotor.cameras, t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var img = h('img', { alt: '', draggable: 'false' }), chip = h('span.rc-chip'), name = h('div.rc-name', null, item.name), sub = h('div.rc-sub');
    var live = h('button.rc-live', { type: 'button', html: UI.icon('expand', 18) + '<span></span>', onclick: function (e) { e.stopPropagation(); ctx.openDetail(item.id, el); } });
    live.lastChild.textContent = t('rm.live');
    var el = h('div.rc.rc-cam', null, h('div.rc-shot', null, h('div.rc-shot-ph', { html: UI.icon('camera', 46) }), img, h('div.rc-shade'), chip, h('div.rc-cap2', null, name, sub), live));
    openIt(ctx, el, item);
    var shown = '';
    function update() {
      var st = ctx.state(item.id); if (!st) return;
      var gone = st.state === 'unavailable' || st.state === 'unknown';
      el.classList.toggle('unav', gone);
      chip.textContent = L.stateLabel(st.state, ctx.lang());
      sub.textContent = item.area || '';
      var pic = !gone && CM && CM.snapUrl ? CM.snapUrl(ctx, item.id, Math.floor(Date.now() / 20000)) : '';
      if (pic && pic !== shown) {
        shown = pic; var pre = new Image();
        pre.onload = function () { if (shown === pic) { img.src = pic; el.classList.add('has'); } };
        pre.src = pic;
      } else if (!pic) { shown = ''; el.classList.remove('has'); }
    }
    return { el: el, update: update };
  }
  /** The card of a device in a room: taller ones for thermostats, TVs / speakers and cameras, the usual row for everything else. */
  function richCard(ctx, item) {
    if (item.domain === 'climate') return climateCard(ctx, item);
    if (item.domain === 'media_player') return styleOf(ctx, item) === 'large' && !isTvItem(item) ? coverCard(ctx, item) : mediaCard(ctx, item);
    if (item.domain === 'camera') return cameraCard(ctx, item);
    return null;
  }

  /** 'tall' or 'compact' for this device (see resolveStyle). */
  function styleOf(ctx, item) { var m = ctx.settings.get().cardStyle; return resolveStyle(m && m[item.id], item.domain); }
  function setStyle(ctx, item, style) { var o = {}; o[item.id] = style; ctx.settings.set({ cardStyle: o }); }
  /** The Row | Tall switch of a device (null for the devices that only have one kind of card). */
  function styleSwitch(ctx, item, onChange) {
    if (!canTall(item.domain)) return null;
    var t = function (k) { return core.t(k, ctx.lang()); }, cur = styleOf(ctx, item);
    var seg = h('span.rm-seg', { role: 'group', 'aria-label': t('rm.style_title') });
    var opts = [['compact', 'rm.style_row'], ['tall', 'rm.style_tall']];
    if (item.domain === 'media_player' && !isTvItem(item)) opts.push(['large', 'rm.style_large']);      // a music player: the big cover card
    opts.forEach(function (p) {
      seg.appendChild(h('button' + (cur === p[0] ? '.on' : ''), { type: 'button', 'aria-pressed': cur === p[0] ? 'true' : 'false', onclick: function () { if (styleOf(ctx, item) === p[0]) return; setStyle(ctx, item, p[0]); if (ctx.haptic) ctx.haptic(8); if (onChange) onChange(p[0]); } }, t(p[1])));
    });
    return seg;
  }
  /** A device's card for a list: the tall one when that is its type; richCard returns { el, update } or null for the usual row. */
  function cardFor(ctx, item) { var st = styleOf(ctx, item); return st === 'tall' || st === 'large' ? richCard(ctx, item) : null; }
  /**
   * The card of a device in the Favorites / Suggestions list, with what shows while the widget is being edited: the Row | Tall switch and (for the favorites) a button that takes it out.
   * opts: { onRemove }
   */
  function listCard(ctx, item, makeRow, onChange, rich, opts) {
    opts = opts || {};
    var t = function (k) { return core.t(k, ctx.lang()); };
    var c = cardFor(ctx, item), el = c ? c.el : makeRow(item);
    if (c) { rich.push(c); c.update(); }      // paint it at once: until the next state change it would stay empty (no number, no modes)
    var sw = styleSwitch(ctx, item, onChange);
    if (!sw && !opts.onRemove && !opts.order && !opts.side && !opts.grip) return el;
    var mv = opts.order ? orderButtons(ctx, opts.order, item.id, false) : {};
    var grip = mv.grip; if (!grip && opts.grip) { grip = gripButton(ctx); opts.grip(grip); }      // a card that is not in a sortable list still has its handle (it carries the card to the other column)
    var bar = h('div.fv-sw', null, grip, h('b', null, L.shortName(item.name, item.area)), sw, opts.side ? sideButton(ctx, opts.side) : null);
    var node = h('div.fv-item', { dataset: { id: item.id } }, el, bar);
    if (opts.onRemove) node.appendChild(h('button.fv-x', { type: 'button', 'aria-label': t('rm.unfav'), title: t('rm.unfav'), html: UI.icon('close', 18), onclick: function () { opts.onRemove(); } }));
    return node;
  }
  /** The drag handle of a card while the arrangement is edited (same one as in the list). */
  function gripButton(ctx) { var t = function (k) { return core.t(k, ctx.lang()); }; return h('button.mv.grip', { type: 'button', 'aria-label': t('rm.drag'), title: t('rm.drag'), html: SVG_GRIP }); }
  /** The round arrow of a card while the arrangement is edited: take it to the other column. side: { dir: 'right' | 'left', onMove() } */
  function sideButton(ctx, side) {
    var key = side.dir === 'right' ? 'rm.to_right' : 'rm.to_left', label = core.t(key, ctx.lang());
    return h('button.mv.fv-side.' + (side.dir === 'right' ? 'r' : 'l'), { type: 'button', 'aria-label': label, title: label, html: UI.icon('back', 20), onclick: function (e) { e.stopPropagation(); if (ctx.haptic) ctx.haptic(8); side.onMove(); } });
  }
  /** A favorite as a tile in the grid: while edited a strip over it moves it earlier or later (o.side: and to the other column). */
  function tileOrder(ctx, tile, item, o) {
    var mv = orderButtons(ctx, o, item.id, true), t = function (k) { return core.t(k, ctx.lang()); };
    var node = h('div.fv-item', { dataset: { id: item.id } }, tile, h('div.fv-sw.hz', null, h('b', null, L.shortName(item.name, item.area)), mv.up, mv.dn, o.side ? sideButton(ctx, o.side) : null));
    if (o.remove) node.appendChild(h('button.fv-x', { type: 'button', 'aria-label': t('rm.unfav'), title: t('rm.unfav'), html: UI.icon('close', 18), onclick: function () { o.remove(item.id); } }));
    return node;
  }
  /** The dashed "+" button at the end of the favorites while they are edited: opens the list to add or take out. */
  function addButton(ctx, kind, onClose) {
    var t = function (k) { return core.t(k, ctx.lang()); };
    var b = h('button.rm-add', { type: 'button', dataset: { add: kind }, html: UI.icon('plus', 22) + '<span></span>', onclick: function () { if (kind === 'rooms') openNewRoom(ctx, onClose); else openFavoritesPicker(ctx, onClose); } });
    b.lastChild.textContent = t(kind === 'rooms' ? 'rm.add_room' : 'rm.add_fav');
    return b;
  }

  var A = function () { return g.OkieMotor.apps; };
  function appId(room) { return 'room:' + room.id; }

  /** The room as an app, like Tips: hero, back button, then a card for every device. */
  var SVG_GRIP = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="9" cy="6" r="1.8"/><circle cx="15" cy="6" r="1.8"/><circle cx="9" cy="12" r="1.8"/><circle cx="15" cy="12" r="1.8"/><circle cx="9" cy="18" r="1.8"/><circle cx="15" cy="18" r="1.8"/></svg>';

  /**
   * The sheet to choose what is in a list (a room, the favorites): search, a few filters, one tap to put a device in or take it out.
   * cfg: { title, members() -> ids now in the list, toggle(id), count(n) -> text, onClose }
   */
  function openPicker(ctx, cfg) {
    var CT = g.OkieMotor.controls, t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var scope = 'devices', query = '';
    var input = h('input.rm-q', { type: 'search', placeholder: t('rm.search'), 'aria-label': t('rm.search'), autocomplete: 'off' });
    var counter = h('div.rm-cnt'), list = h('div.rm-pick');
    var chips = CT.createChips({ options: [{ id: 'devices', label: t('rm.scope_devices') }, { id: 'sensors', label: t('rm.scope_sensors') }, { id: 'all', label: t('rm.scope_all') }], value: scope, onChange: function (v) { scope = v; draw(); } });
    function candidates() {
      var hs = ctx.hass(), inList = {}; cfg.members().forEach(function (id) { inList[id] = true; });
      var words = query.toLowerCase().split(/\s+/).filter(Boolean), out = [];
      var GD = g.OkieMotor.gadgets, ids = Object.keys((hs && hs.states) || {});
      if (GD) ids = ids.filter(function (id) { return !GD.owns(id); }).concat(ctx.engine.all().filter(function (i) { return i.domain === 'gadget'; }).map(function (i) { return i.id; }));      // the Kindle and the AWTRIX: one entry each, not their entities
      ids.forEach(function (id) {
        var dom = id.split('.')[0], sensor = dom === 'sensor' || dom === 'binary_sensor';
        if (cfg.only && !cfg.only(id)) return;      // a list of its own kind (the Lights screen: only lights)
        if (scope === 'devices' && !isDeviceDomain(dom) && dom !== 'gadget') return;
        if (scope === 'sensors' && !sensor) return;
        var it = itemOf(ctx, id); if (!it) return;
        var hay = (it.name + ' ' + (it.area || '') + ' ' + id).toLowerCase();
        if (words.some(function (w) { return hay.indexOf(w) < 0; })) return;
        out.push({ it: it, on: !!inList[id] });
      });
      var hs2 = ctx.hass(), gone = function (x) { var st = hs2 && hs2.states && hs2.states[x.it.id]; return st && (st.state === 'unavailable' || st.state === 'unknown') ? 1 : 0; };
      out.sort(function (a, b) { return (b.on - a.on) || (gone(a) - gone(b)) || String(a.it.area || '~').localeCompare(String(b.it.area || '~')) || a.it.name.localeCompare(b.it.name); });
      return out;
    }
    function draw() {
      var all = candidates(), shown = all.slice(0, 60);
      counter.textContent = cfg.count(cfg.members().length) + (all.length > shown.length ? ' · ' + t('rm.more', { n: all.length - shown.length }) : '');
      list.innerHTML = '';
      if (!shown.length) list.appendChild(h('div.rm-hint', null, t('rm.nomatch')));
      shown.forEach(function (c) {
        var st = ctx.state(c.it.id), stateText = st ? L.stateLabel(st.state, ctx.lang()) : '', ic = c.it.domain === 'gadget' ? (c.it.deviceClass === 'light' ? 'grid' : 'tv') : UI.domainIcon(c.it.domain, c.it.deviceClass, st && st.state);
        list.appendChild(h('button.rm-pr' + (c.on ? '.on' : ''), { type: 'button', dataset: { id: c.it.id }, 'aria-pressed': c.on ? 'true' : 'false', onclick: function () { cfg.toggle(c.it.id); if (ctx.haptic) ctx.haptic(8); draw(); } },
          h('span.pi', { html: ic ? UI.icon(ic, 20) : '' }),
          h('span.pt', null, h('b', null, c.it.name), h('span', null, [c.it.area, stateText].filter(Boolean).join(' · '))),
          h('span.ck', { html: UI.icon('check', 16) })));
      });
    }
    var timer = 0;
    input.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { query = input.value; draw(); }, 120); });
    ctx.sheet({ title: cfg.title, onClose: cfg.onClose, content: function () { var box = h('div', null, input, cfg.only ? null : chips.el, counter, list); draw(); return box; } });
  }
  /** The picker of a room. */
  function openRoomPicker(ctx, roomId, onClose) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    function current() { return roomsNow(ctx).filter(function (r) { return r.id === roomId; })[0]; }
    var r0 = current();
    openPicker(ctx, {
      title: t('rm.add_title', { room: r0 ? r0.name : '' }), onClose: onClose,
      members: function () { var r = current(); return r ? r.ids : []; },
      count: function (n) { return t('rm.in_room', { n: n }); },
      toggle: function (id) { var r = current(); if (!r) return; var o = {}; o[r.id] = toggleDevice(r.base, (ctx.settings.get().roomEdits || {})[r.id], id); ctx.settings.set({ roomEdits: o }); },
    });
  }
  /** The picker of the favorites. */
  function openFavoritesPicker(ctx, onClose) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    openPicker(ctx, {
      title: t('rm.fav_title'), onClose: onClose,
      members: function () { return (ctx.settings.get().favorites || []).slice(); },
      count: function (n) { return t('rm.in_fav', { n: n }); },
      toggle: function (id) { ctx.favorites.toggle(id); },
    });
  }
  /** The sheet to make a room or bring a hidden one back. */
  function openNewRoom(ctx, onClose) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var input = h('input.rm-q', { type: 'text', placeholder: t('rm.new_name'), 'aria-label': t('rm.new_name'), autocomplete: 'off', maxlength: '40' });
    var back = h('div.rm-pick'), api2 = null;
    function create() {
      var name = input.value.trim(); if (!name) { input.focus(); return; }
      var extras = (ctx.settings.get().roomsExtra || []).concat([{ name: name }]);
      ctx.settings.set({ roomsExtra: extras });
      if (api2) api2.close('created');
    }
    var add = h('button.rm-mk', { type: 'button', onclick: create }, t('rm.new_make'));
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); create(); } });
    function drawHidden() {
      back.innerHTML = '';
      var hid = ctx.settings.get().roomsHidden || [];
      var rooms = roomsEvery(ctx).filter(function (r) { return hid.indexOf(r.id) >= 0; });
      if (!rooms.length) return;
      back.appendChild(h('div.rm-cnt', null, t('rm.hidden')));
      rooms.forEach(function (r) {
        back.appendChild(h('button.rm-pr', { type: 'button', dataset: { id: r.id }, onclick: function () { ctx.settings.set({ roomsHidden: (ctx.settings.get().roomsHidden || []).filter(function (x) { return x !== r.id; }) }); drawHidden(); } },
          h('span.pi', { html: UI.icon(roomIcon(r), 20) }), h('span.pt', null, h('b', null, r.name), h('span', null, t('rm.show_again'))), h('span.ck', { html: UI.icon('plus', 16) })));
      });
    }
    drawHidden();
    api2 = ctx.sheet({ title: t('rm.new_title'), onClose: onClose, content: function () { return h('div', null, h('div.rm-newrow', null, input, add), back); } });
  }

  var activeSort = null;
  /**
   * Dragging a card by its handle (the devices of a room, the rooms, the favorites). While the finger is down the cards only slide (transforms): nothing is moved in the page,
   * because moving the card the finger holds makes a touch screen drop the finger's connection to it and the drag never ends. The order is applied when the finger lets go.
   * o: { scroller() -> the element that scrolls, nodes() -> { id: element }, order() -> the ids now, apply(ids) -> a new order, settle() -> nothing changed }
   */
  function createSorter(ctx, o) {
    var drag = null;
    function end(abort) {
      if (!drag) return;
      var d = drag; drag = null; if (activeSort === end) activeSort = null;
      window.removeEventListener('pointermove', d.move, true); window.removeEventListener('pointerup', d.end, true); window.removeEventListener('pointercancel', d.end, true);
      var nodes = o.nodes();
      Object.keys(nodes).forEach(function (i) { var n = nodes[i]; if (!n) return; n.style.transform = ''; n.style.transition = ''; n.classList.remove('drag'); });
      if (!abort && d.newOrder.join() !== o.order().join()) o.apply(d.newOrder); else if (o.settle) o.settle();
    }
    function start(e, id) {
      if (e.button != null && e.button !== 0) return;
      e.preventDefault();
      end(true);
      var nodes = o.nodes(), scroller = o.scroller(), grip = e.currentTarget, pid = e.pointerId, node = nodes[id], z = (ctx.host && ctx.host._zoom) || 1, ids0 = o.order().slice(), at = ids0.indexOf(id), n = ids0.length;
      if (at < 0 || !node) return;
      var tops = ids0.map(function (i) { return nodes[i].offsetTop; }), hs = ids0.map(function (i) { return nodes[i].offsetHeight; });
      var gap = n > 1 ? Math.max(0, tops[1] - tops[0] - hs[0]) : 0, y0 = e.clientY, s0 = scroller.scrollTop;
      node.classList.add('drag'); node.style.transition = 'none';
      ids0.forEach(function (i) { if (i !== id) nodes[i].style.transition = 'transform .16s ease'; });
      var d = { newOrder: ids0.slice() };
      d.move = function (ev) {
        if (ev.pointerId !== pid) return;
        if (ev.cancelable) ev.preventDefault();
        var y = ev.clientY, br = UI.screenRect(scroller);
        if (y < br.top + 44) scroller.scrollTop -= 12; else if (y > br.bottom - 44) scroller.scrollTop += 12;
        var dy = (y - y0) / z + (scroller.scrollTop - s0);
        dy = Math.max(tops[0] - tops[at], Math.min(tops[n - 1] + hs[n - 1] - tops[at] - hs[at], dy));
        node.style.transform = 'translateY(' + dy + 'px)';
        var c = tops[at] + hs[at] / 2 + dy, target = at;                             // the slot under the middle of the card
        if (c < tops[0]) target = 0; else if (c >= tops[n - 1]) target = n - 1;
        else for (var k = 0; k < n; k++) { if (c >= tops[k] && c < tops[k] + hs[k] + gap) { target = k; break; } }
        var shift = hs[at] + gap;
        ids0.forEach(function (i, k) {
          if (i === id) return;
          var off = (at < target && k > at && k <= target) ? -shift : ((at > target && k >= target && k < at) ? shift : 0);
          nodes[i].style.transform = off ? 'translateY(' + off + 'px)' : '';
        });
        var no = ids0.slice(); no.splice(at, 1); no.splice(target, 0, id); d.newOrder = no;
      };
      d.end = function (ev) { if (ev && ev.pointerId !== pid) return; end(ev && ev.type === 'pointercancel'); };      // a cancelled touch keeps the old order
      drag = d; activeSort = end;
      window.addEventListener('pointermove', d.move, true); window.addEventListener('pointerup', d.end, true); window.addEventListener('pointercancel', d.end, true);
      try { grip.setPointerCapture(pid); } catch (er) { /* the window listeners still get the moves */ }
    }
    return { start: start, end: end, active: function () { return !!drag; } };
  }

  /** What changes a card's place while a list is edited: the handle to drag it by in a list, earlier / later buttons in a grid (a drag there would be two-dimensional). o: { sorter, order (the ids now), save(ids) } */
  function orderButtons(ctx, o, id, hz) {
    var t = function (k) { return core.t(k, ctx.lang()); };
    var i = o.order.indexOf(id), last = o.order.length - 1;
    function go(next) { if (next.join() !== o.order.join()) o.save(next); }
    function btn(cls, key, html, fn, off) {
      var b = h('button.mv.' + cls, { type: 'button', 'aria-label': t(key), title: t(key), html: html, onclick: fn }); b.disabled = !!off; return b;
    }
    var out = { grip: null, up: null, dn: null };
    if (hz) {      // a grid cannot be dragged one way only: earlier / later
      out.up = btn('up', 'rm.up', UI.icon('chevdown', 22), function () { go(moveId(o.order, id, -1)); }, i <= 0);
      out.dn = btn('dn', 'rm.down', UI.icon('chevdown', 22), function () { go(moveId(o.order, id, 1)); }, i >= last);
    } else if (o.sorter) {
      out.grip = h('button.mv.grip', { type: 'button', 'aria-label': t('rm.drag'), title: t('rm.drag'), html: SVG_GRIP });
      out.grip.addEventListener('pointerdown', function (e) { o.sorter.start(e, id); });
    }
    return out;
  }

  function renderRoom(container, ctx, roomId) {
    var TL = g.OkieMotor.tiles, t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var room0 = roomsNow(ctx).filter(function (r) { return r.id === roomId; })[0] || { id: roomId, name: roomId, ids: [], icon: '' };
    var idx = Math.max(0, roomsNow(ctx).map(function (r) { return r.id; }).indexOf(roomId));
    var editing = false, pen = null, room = room0;
    var shell = g.OkieMotor.appshell.create(container, ctx, { id: room0.id, title: room0.name, subtitle: subtitle(ctx, room0), icon: roomIcon(room0), gradient: GRADIENTS[idx % GRADIENTS.length], tabs: [], onTab: function () {},
      actions: [{ icon: 'pencil', label: t('rm.reorder'), onClick: function () { toggleEdit(); } }] });
    pen = shell.el.querySelector('.dt-acts .dt-circ');
    var registry = new Map(), tl = TL.create(ctx, registry);
    var list = null, rich = [], nodes = {}, order = [];

    function saveOrder() { var o = {}; o[room.id] = order.slice(); ctx.settings.set({ roomOrder: o }); }       // kept per room
    function syncOrderFromDom() { order = Array.prototype.filter.call(list.children, function (n) { return n.classList.contains('rm-item'); }).map(function (n) { return n.dataset.id; }); }
    function put() { order.forEach(function (x) { list.insertBefore(nodes[x], addBtn); }); }
    function take(id) { var cur = (ctx.settings.get().roomEdits || {})[room.id], o = {}; o[room.id] = toggleDevice(room.base, cur, id); ctx.settings.set({ roomEdits: o }); build(); }

    var addBtn = null;
    var sorter = createSorter(ctx, { scroller: function () { return shell.body; }, nodes: function () { return nodes; }, order: function () { return order; },
      apply: function (no) { order = no; put(); saveOrder(); } });
    function endDrag(abort) { sorter.end(abort); }
    function startDrag(e, id) { sorter.start(e, id); }

    function build() {
      endDrag(true);
      var scroll = shell.body.scrollTop;
      shell.body.innerHTML = ''; registry.clear(); rich = []; nodes = {};
      room = roomsNow(ctx).filter(function (r) { return r.id === roomId; })[0] || room0;
      if (g.OkieMotor.lightModes) { var lms = g.OkieMotor.lightModes.strip(ctx, { room: { id: room.id, name: room.name, baseName: room.baseName, areaId: room.areaId } }); if (lms) shell.body.appendChild(lms); }      // the light modes of this room (the Living Room: Cozy lights ...)
      var items = roomItems(ctx, room); order = items.map(function (x) { return x.id; });
      list = h('div.device-list-container.rm-list' + (editing ? '.editing' : ''));
      var ren = h('button.rm-ren', { type: 'button', html: UI.icon('pencil', 18) + '<span></span>', onclick: openRename });
      ren.lastChild.textContent = t('rm.rename');
      list.appendChild(ren);
      items.forEach(function (x) {
        var card = UI.guard(function () {
          var c = cardFor(ctx, x);
          if (c) { rich.push(c); return c.el; }
          return tl.makeRow(x);
        }, { label: 'tile ' + x.id, text: x.name, compact: true, retry: t('card.retry') });
        var sw = styleSwitch(ctx, x, function () { build(); });
        var grip = h('button.grip', { type: 'button', 'aria-label': t('rm.drag'), title: t('rm.drag'), html: SVG_GRIP });
        grip.addEventListener('pointerdown', function (e) { startDrag(e, x.id); });
        var ord = h('div.rm-ord', null, grip, h('b', null, L.shortName(x.name, x.area)), sw,
          null);
        nodes[x.id] = h('div.rm-item', { dataset: { id: x.id } }, card, ord,
          h('button.rm-x', { type: 'button', 'aria-label': t('rm.remove'), title: t('rm.remove'), html: UI.icon('close', 18), onclick: function () { take(x.id); } }));
        list.appendChild(nodes[x.id]);
      });
      addBtn = h('button.rm-add', { type: 'button', html: UI.icon('plus', 22) + '<span></span>', onclick: function () { openRoomPicker(ctx, roomId, function () { build(); updateSubtitle(); }); } });
      addBtn.lastChild.textContent = t('rm.add');
      list.appendChild(addBtn);
      if (!items.length) list.insertBefore(h('div.rm-hint', null, t('rm.empty')), addBtn);
      shell.body.appendChild(list);
      update(); shell.body.scrollTop = scroll;
    }
    function updateSubtitle() { shell.setSubtitle(subtitle(ctx, room)); }
    /** Give the room another name: it keeps its devices, their order and its place in the list. */
    function openRename() {
      var names = ctx.settings.get().roomNames || {}, input = h('input.rm-q', { type: 'text', value: room.name, maxlength: '40', 'aria-label': t('rm.rename_name'), autocomplete: 'off' });
      var sheet = null;
      function save(name) {
        var o = {}; o[room.id] = name; ctx.settings.set({ roomNames: o });
        room = roomsNow(ctx).filter(function (r) { return r.id === roomId; })[0] || room;
        var ti = shell.el.querySelector('.dt-title'); if (ti) ti.textContent = room.name;
        if (sheet) sheet.close('saved');
      }
      var ok = h('button.rm-mk', { type: 'button', onclick: function () { var v = input.value.trim(); if (!v) { input.focus(); return; } save(v === room.baseName ? '' : v); } }, t('rm.rename_save'));
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } });
      var box = h('div', null, h('div.rm-newrow', null, input, ok));
      if (names[room.id]) box.appendChild(h('button.rm-pr', { type: 'button', onclick: function () { save(''); } }, h('span.pt', null, h('b', null, t('rm.rename_orig')), h('span', null, room.baseName))));
      sheet = ctx.sheet({ title: t('rm.rename'), content: function () { return box; } });
      setTimeout(function () { try { input.focus(); input.select(); } catch (e) { /* no focus */ } }, 60);
    }
    // ---- hold a card to arrange, like on the Home Screen: the same hold, the same bar at the bottom middle (Reset, Done) and a tap away from the list ends it ----
    var AR = g.OkieMotor.arrange, barEl = null, snapRoom = null, holder = null;
    function resetRoom() {
      if (!snapRoom) return;
      var o1 = {}, o2 = {}, o3 = {}; o1[room.id] = snapRoom.order.slice(); o2[room.id] = { add: snapRoom.edit.add.slice(), remove: snapRoom.edit.remove.slice() };
      Object.keys(snapRoom.styles).forEach(function (id) { o3[id] = snapRoom.styles[id]; });
      ctx.settings.set({ roomOrder: o1, roomEdits: o2, cardStyle: o3 }); build(); if (ctx.haptic) ctx.haptic(8);
    }
    function outTapRoom(e) {
      if (!editing) return;
      var path = e.composedPath ? e.composedPath() : [e.target];
      if (path.some(function (el) { return el === list || el === barEl || el === pen || (el && el.classList && el.classList.contains('ov-layer')); })) return;
      toggleEdit();
    }
    function toggleEdit() {
      endDrag(true);
      editing = !editing; list.classList.toggle('editing', editing);
      if (editing) {
        var s0 = ctx.settings.get(), ed = (s0.roomEdits || {})[room.id] || {}, st = {};
        roomItems(ctx, room).forEach(function (x) { if (canTall(x.domain)) st[x.id] = resolveStyle((s0.cardStyle || {})[x.id], x.domain); });
        snapRoom = { order: ((s0.roomOrder || {})[room.id] || []).slice(), edit: { add: (ed.add || []).slice(), remove: (ed.remove || []).slice() }, styles: st };
        if (AR && !barEl) { barEl = AR.editBar(ctx, { onDone: function () { if (editing) toggleEdit(); }, onReset: resetRoom }); ctx.stage.appendChild(barEl); }
        window.addEventListener('pointerdown', outTapRoom, true);
      } else { snapRoom = null; window.removeEventListener('pointerdown', outTapRoom, true); }
      if (barEl) barEl.classList.toggle('on', editing);
      if (pen) { pen.innerHTML = UI.icon(editing ? 'check' : 'pencil', 20); pen.setAttribute('aria-pressed', editing ? 'true' : 'false'); pen.title = editing ? t('rm.done') : t('rm.reorder'); pen.setAttribute('aria-label', editing ? t('rm.done') : t('rm.reorder')); }
    }
    function update() {
      registry.forEach(function (el, id) { var s = ctx.state(id); if (s && s !== el._lastState) tl.paint(el, el._item, s); });
      rich.forEach(function (c) { c.update(); });
      updateSubtitle();
    }
    build();
    if (AR) holder = AR.hold(ctx, shell.body, { current: function () { return { order: order, nodes: nodes, save: function (no) { order = no; put(); saveOrder(); }, sorter: sorter }; }, layout: function () { return 'list'; }, editing: function () { return editing; }, enter: function () { if (!editing) toggleEdit(); } });
    return { update: update, dispose: function () { endDrag(true); window.removeEventListener('pointerdown', outTapRoom, true); if (holder) holder.dispose(); if (barEl && barEl.parentNode) barEl.parentNode.removeChild(barEl); shell.dispose(); } };
  }

  /** Make sure every room can be opened as an app (and that an app of a room that is gone is removed). */
  var registered = {};
  function syncApps(ctx) {
    var rooms = roomsNow(ctx), seen = {};
    rooms.forEach(function (r, i) {
      seen[r.id] = true;
      var key = r.name + '|' + roomIcon(r) + '|' + i;       // the place in the list counts: the apps follow the order that was arranged
      if (registered[r.id] && registered[r.id].key === key) return;
      if (registered[r.id]) registered[r.id].off();
      var rid = r.id;
      registered[r.id] = { key: key, off: A().register({ id: appId(r), name: r.name, icon: roomIcon(r), color: GRADIENTS[i % GRADIENTS.length][1], order: 200 + i, category: 'rooms', render: function (container, c) { return renderRoom(container, c, rid); } }) };
    });
    Object.keys(registered).forEach(function (id) { if (!seen[id]) { registered[id].off(); delete registered[id]; } });
    return rooms;
  }

  /** The cards of the Rooms tab. layout: 'list' | 'grid'. While the widget is edited every card has a button that removes the room, and a "New room" button ends the list. */
  function renderCards(ctx, layout, scroller) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var rooms = syncApps(ctx), wrap = h('div');
    function removeRoom(r) {
      var s = ctx.settings.get();
      if (r.extra) ctx.settings.set({ roomsExtra: (s.roomsExtra || []).filter(function (x) { return slug(x && x.name) !== slug(r.name) && slug(x && x.id) !== r.id; }) });
      else ctx.settings.set({ roomsHidden: (s.roomsHidden || []).concat([r.id]) });
    }
    if (!rooms.length) wrap.appendChild(h('div.rm-hint', null, t('rm.none')));
    else {
      var grid = layout === 'grid', box = h('div.' + (grid ? 'rm-grid' : 'rm-list')), nodes = {}, ids = rooms.map(function (r) { return r.id; });
      var o = { order: ids, nodes: nodes, save: function (next) { ctx.settings.set({ roomsOrder: next }); if (ctx.haptic) ctx.haptic(8); } }; wrap._order = o;      // wrap._order: what a press and hold on a card rearranges (okie-arrange)      // the order of the rooms, kept like the rest of what is arranged here
      o.sorter = createSorter(ctx, { scroller: function () { return scroller || wrap.parentNode; }, nodes: function () { return nodes; }, order: function () { return ids; }, apply: o.save });
      rooms.forEach(function (r) {
        var s = stats(ctx, r);
        var card = h('button.rm-card' + (s.on ? '.on' : ''), { type: 'button', dataset: { room: r.id }, 'aria-label': r.name, onclick: function () { if (ctx.haptic) ctx.haptic(8); ctx.openApp(appId(r)); } },
          h('span.rm-ic', { html: UI.icon(roomIcon(r), 24) }),
          h('span.rm-txt', null, h('span.rm-name', null, r.name), h('span.rm-sub', null, subtitle(ctx, r))),
          h('span.rm-chev', { html: UI.icon('chevron', 18) }));
        var mv = orderButtons(ctx, o, r.id, grid);
        var bar = h('div.rm-ord' + (grid ? '.hz' : ''), null, mv.grip, h('b', null, r.name), mv.up, mv.dn);
        nodes[r.id] = h('div.rm-wrap.rm-item', { dataset: { id: r.id } }, card, bar, h('button.rm-del', { type: 'button', 'aria-label': t('rm.hide_room'), title: t('rm.hide_room'), html: UI.icon('close', 16), onclick: function () { removeRoom(r); } }));
        box.appendChild(nodes[r.id]);
      });
      wrap.appendChild(box);
    }
    wrap.appendChild(addButton(ctx, 'rooms'));
    return wrap;
  }

  /** The cards redraw when anything about the rooms changes: their names, their devices or how many are on. */
  function signature(ctx) {
    return roomsNow(ctx).map(function (r) { var s = stats(ctx, r); return r.id + ':' + r.name + ':' + r.ids.length + ':' + s.total + ':' + s.on; }).join('|');
  }

  // ------------------------------------------------ across devices ----
  // What you arrange here (rooms, their devices and order, the card types) is kept in Home Assistant's own storage for your user, so the phone, the iPad and the
  // wall tablet show the same thing. Newest change wins; a device pulls on start, when it comes back to the foreground and every five minutes.
  var SYNC_KEY = 'okie_motor_rooms', SYNC_FIELDS = ['rooms', 'roomEdits', 'roomOrder', 'roomsOrder', 'cardStyle', 'roomsExtra', 'roomsHidden', 'roomNames', 'lightsFav', 'lightsOrder'];
  function snapshot(ctx) { var s = ctx.settings.get(), o = {}; SYNC_FIELDS.forEach(function (k) { o[k] = s[k]; }); return o; }
  function hasData(snap) { return SYNC_FIELDS.some(function (k) { var v = snap[k]; return Array.isArray(v) ? v.length > 0 : (v && typeof v === 'object' ? Object.keys(v).length > 0 : !!v); }); }
  var applying = false;
  function pushNow(ctx) {
    var t = Date.now(); ctx.store.set('rooms.t', t);
    return ctx.callWS({ type: 'frontend/set_user_data', key: SYNC_KEY, value: { t: t, data: snapshot(ctx) } }).catch(function () { /* offline or no permission: the local copy still works */ });
  }
  function pullNow(ctx) {
    return ctx.callWS({ type: 'frontend/get_user_data', key: SYNC_KEY }).then(function (r) {
      var v = r && r.value;
      if (!v || typeof v !== 'object' || !v.data) { if (hasData(snapshot(ctx))) return pushNow(ctx); return null; }      // nothing stored yet: this device's arrangement becomes the shared one
      if ((+v.t || 0) <= (+ctx.store.get('rooms.t', 0) || 0)) return null;
      applying = true;
      try {
        SYNC_FIELDS.forEach(function (k) { ctx.settings.reset(k); });
        var o = {}; SYNC_FIELDS.forEach(function (k) { if (v.data[k] !== undefined) o[k] = v.data[k]; });
        ctx.settings.set(o); ctx.store.set('rooms.t', +v.t);
      } finally { applying = false; }
      return true;
    }, function () { return null; });
  }
  api.sync = { pull: pullNow, push: pushNow, KEY: SYNC_KEY, FIELDS: SYNC_FIELDS };

  api.mount = function (ctx) {
    syncApps(ctx);
    var pushTimer = 0, pullTimer = setInterval(function () { pullNow(ctx); }, 5 * 60000);
    var offSync = ctx.settings.on('change', function (p) { if (!applying && p && SYNC_FIELDS.some(function (k) { return p[k] !== undefined; })) { clearTimeout(pushTimer); pushTimer = setTimeout(function () { pushNow(ctx); }, 900); } });
    function visible() { if (document.visibilityState === 'visible') pullNow(ctx); }
    document.addEventListener('visibilitychange', visible);
    pullNow(ctx);
    var off = ctx.settings.on('change', function (p) { if (p && (p.rooms !== undefined || p.roomsExtra !== undefined || p.roomsHidden !== undefined || p.roomsOrder !== undefined || p.roomEdits !== undefined || p.roomNames !== undefined)) syncApps(ctx); });
    var timer = setInterval(function () { syncApps(ctx); }, 60000);      // an area changed in Home Assistant
    return { dispose: function () { off(); offSync(); clearTimeout(pushTimer); clearInterval(pullTimer); document.removeEventListener('visibilitychange', visible); clearInterval(timer); Object.keys(registered).forEach(function (id) { registered[id].off(); }); registered = {}; } };
  };
  api.gripButton = gripButton; api.sideButton = sideButton;
  api.styleOf = styleOf; api.listCard = listCard; api.richCard = richCard; api.addButton = addButton; api.openRoomPicker = openRoomPicker; api.openPicker = openPicker; api.openNewRoom = openNewRoom;
  api.createSorter = createSorter; api.endDrag = function () { if (activeSort) activeSort(true); }; api.tileOrder = tileOrder; api.rooms = roomsNow; api.renderCards = renderCards; api.signature = signature; api.roomItems = roomItems; api.renderRoom = renderRoom;
  g.OkieMotor.defaults = Object.assign(g.OkieMotor.defaults || {}, { rooms: [], roomOrder: {}, roomsOrder: [], roomEdits: {}, cardStyle: {}, roomsExtra: [], roomsHidden: [], roomNames: {}, lightsFav: null, lightsOrder: {} });
  g.OkieMotor.rooms = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

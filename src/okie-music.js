/* okie-music: the Music screen. What is playing on a music player of Home Assistant (Spotify first), drawn like the screen of Apple's new speaker:
 * a rounded album picture with the title over its foot, the progress, the keys, a volume pill and a device button; and a LYRICS mode that runs the
 * words along with the song (the current line big and bright, the rest dim; tap a line to jump there).
 *
 * The player is any media_player that plays music (the Spotify integration's one by preference). Position is worked out between updates from
 * media_position and media_position_updated_at, so the bar and the lyrics move smoothly. Lyrics come from LRCLIB (lrclib.net, free, synced, no key),
 * asked for only when the lyrics mode is opened, with the title, artist, album and length of the song and nothing else.
 *
 * The rules (choosing the player, the position, reading synced lyrics, the colour of the picture) are pure and unit-tested; the screen is checked in
 * the browser smoke test.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // media_player supported_features bits
  var F = { pause: 1, seek: 2, volume: 4, mute: 8, prev: 16, next: 32, playMedia: 512, source: 2048, play: 16384, shuffle: 32768, browse: 131072, repeat: 262144 };
  function has(features, bit) { return !!((features || 0) & bit); }
  var LIVE = { playing: 1, paused: 1, buffering: 1, idle: 1, on: 1 };

  /** Is this a music player? (the Spotify one, one with an app that says music, or one that carries an artist) */
  function isMusic(id, st) {
    var a = (st && st.attributes) || {};
    return /spotify/i.test(id) || /spotify|music|tidal|deezer|youtube music/i.test(String(a.app_name || '')) || a.media_content_type === 'music' || !!a.media_artist;
  }
  /** Which player the Music screen shows: the one you chose, else the best music player (playing, then paused, then Spotify's). null when there is none. */
  function pickPlayer(states, preferred) {
    var best = null, bestScore = -1;
    Object.keys(states || {}).forEach(function (id) {
      if (id.indexOf('media_player.') !== 0) return;
      var st = states[id]; if (!st || !isMusic(id, st) || st.state === 'unavailable' || st.state === 'unknown') return;
      var a = st.attributes || {}, sc = 1;
      if (st.state === 'playing') sc += 60; else if (st.state === 'paused' || st.state === 'buffering') sc += 40; else if (LIVE[st.state]) sc += 10;
      if (/spotify/i.test(id)) sc += 10;
      if (a.media_title) sc += 8;
      if (preferred && id === preferred && sc > 0) sc += 1000;
      if (sc > bestScore) { bestScore = sc; best = id; }
    });
    return best;
  }
  /** What the screen shows: the song, the picture, where it is in the song right now, what the player can do. */
  function nowPlaying(st, now) {
    if (!st) return null;
    var a = st.attributes || {}, playing = st.state === 'playing', dur = parseFloat(a.media_duration), pos = parseFloat(a.media_position), upd = Date.parse(a.media_position_updated_at);
    if (!isFinite(dur) || dur <= 0) dur = null;
    if (!isFinite(pos)) pos = 0;
    if (playing && isFinite(upd)) pos += Math.max(0, (now - upd) / 1000);
    if (dur != null) pos = Math.min(pos, dur); pos = Math.max(0, pos);
    var f = a.supported_features || 0;
    return {
      state: st.state, playing: playing, title: a.media_title || '', artist: a.media_artist || '', album: a.media_album_name || '', art: a.entity_picture || a.entity_picture_local || '',
      duration: dur, position: pos, volume: isFinite(parseFloat(a.volume_level)) ? parseFloat(a.volume_level) : null, muted: !!a.is_volume_muted, shuffle: !!a.shuffle, repeat: a.repeat || 'off',
      source: a.source || '', sources: Array.isArray(a.source_list) ? a.source_list.slice() : [], app: a.app_name || '',
      browse: canBrowse(f), phase: libraryPhase(st),
      can: { seek: has(f, F.seek), volume: has(f, F.volume), prev: has(f, F.prev), next: has(f, F.next), source: has(f, F.source), shuffle: has(f, F.shuffle), repeat: has(f, F.repeat), pause: has(f, F.pause) || has(f, F.play) },
    };
  }
  function repeatNext(mode) { return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off'; }

  // ---- the library (what Home Assistant lets you browse on the Spotify player) ----
  /** Home Assistant offers browsing and playing from the library only while a Spotify device is active and has something loaded: both feature bits are then on. */
  function canBrowse(features) { return has(features, F.browse) && has(features, F.playMedia); }
  /** How far the player is from the library: 'ready' · 'open' (no device is running anywhere: Spotify lists only running ones) · 'pick' (devices are known, none is active) · 'load' (a device is active, nothing is loaded yet) · 'offline' · 'none'. */
  function libraryPhase(st) {
    if (!st) return 'none';
    if (st.state === 'unavailable' || st.state === 'unknown') return 'offline';
    var a = st.attributes || {};
    if (canBrowse(a.supported_features)) return 'ready';
    if (!(Array.isArray(a.source_list) && a.source_list.length)) return 'open';
    return a.source ? 'load' : 'pick';
  }
  /** The kind of screen the card runs on and how Spotify names it in its device list: { re, phone } or null (a computer). */
  function deviceKind(ua, touch) {
    ua = String(ua || '');
    if (/iPhone/.test(ua)) return { re: /iphone/i, phone: true };
    if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return { re: /ipad/i, phone: false };
    if (/Android/.test(ua)) return { re: /android|tablet|galaxy|pixel|fire/i, phone: /Mobile/.test(ua) };
    return null;
  }
  /** This screen's own entry in the list of Spotify devices, or null. */
  function hereSource(sources, kind) {
    if (!kind) return null;
    for (var i = 0; i < (sources || []).length; i++) if (kind.re.test(sources[i])) return sources[i];
    return null;
  }
  /** A browse_media answer -> { title, id, type, cls, kidsCls, playable, expandable, art, kids, hidden }. The id and the type are kept exactly as Home Assistant sent them: playing hands them straight back. */
  function browseNode(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var one = function (r) {
      return { title: String(r.title || ''), id: r.media_content_id == null ? '' : String(r.media_content_id), type: String(r.media_content_type || ''), cls: String(r.media_class || ''), kidsCls: String(r.children_media_class || ''),
        playable: !!r.can_play, expandable: !!r.can_expand, art: typeof r.thumbnail === 'string' && /^(https:|\/|data:image\/)/.test(r.thumbnail) ? r.thumbnail : '' };
    };
    var n = one(raw);
    n.kids = Array.isArray(raw.children) ? raw.children.filter(function (c) { return c && typeof c === 'object' && c.media_content_id != null; }).map(one) : [];
    n.hidden = raw.not_shown > 0 ? raw.not_shown : 0;
    return n;
  }
  /** A level with one folder and nothing else (an account) is skipped: you land on your library. Returns that folder or null. */
  function stepInto(node) { return node && node.kids.length === 1 && node.kids[0].expandable && !node.kids[0].playable ? node.kids[0] : null; }
  /** Pictures for playlists, albums and the like; plain rows for songs and folders. */
  function layoutOf(node) { return /^(playlist|album|artist|podcast|show|genre|season)$/.test(node && node.kidsCls) ? 'grid' : 'list'; }
  /** The icon that stands in for a missing picture. */
  function iconFor(cls) { return ({ playlist: 'list', album: 'music', artist: 'person', podcast: 'mic', show: 'mic', track: 'notefill', music: 'notefill', episode: 'notefill', directory: 'folder', app: 'folder' })[cls] || 'music'; }
  /** What went wrong when a browse call failed: 'asleep' (the player stopped offering it: Spotify went to sleep), 'login' (Home Assistant lost the Spotify login) or 'other'. */
  function browseProblem(err) {
    var m = String(err && (err.message || err.code) || err || '').toLowerCase();
    if (/does not support browsing|not supported/.test(m)) return 'asleep';
    if (/auth|token|unauthor|forbidden|401|403|premium|login|log in/.test(m)) return 'login';
    return 'other';
  }
  function fmtClock(sec) { sec = Math.max(0, Math.round(sec || 0)); var m = Math.floor(sec / 60), s = sec % 60; return m + ':' + (s < 10 ? '0' : '') + s; }

  // ---- synced lyrics (LRC): [mm:ss.xx] words ----
  /** An LRC text -> [{ t seconds, text }] in time order. Several stamps on a line, the offset tag and the metadata tags are understood. */
  function parseLrc(text) {
    var out = [], offset = 0;
    String(text || '').split(/\r?\n/).forEach(function (raw) {
      var line = raw.trim(), off = /^\[offset:\s*([+-]?\d+)\s*\]$/i.exec(line);
      if (off) { offset = parseInt(off[1], 10) / 1000; return; }
      var stamps = [], rest = line, m;
      while ((m = /^\[(\d{1,3}):(\d{2})(?:[.:](\d{1,3}))?\]\s*/.exec(rest))) { stamps.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + (m[3] ? parseInt(m[3], 10) / Math.pow(10, m[3].length) : 0)); rest = rest.slice(m[0].length); }
      if (!stamps.length) return;
      stamps.forEach(function (t) { out.push({ t: Math.max(0, t - offset), text: rest.trim() }); });
    });
    return out.sort(function (a, b) { return a.t - b.t; });
  }
  /** The line that is being sung at `pos` seconds (a quarter second early so the eye is there first); -1 before the first line. */
  function lineAt(lines, pos) {
    var lo = 0, hi = lines.length - 1, ans = -1, p = pos + 0.25;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (lines[mid].t <= p) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
    return ans;
  }
  function lrclibUrl(o) {
    var q = ['artist_name=' + encodeURIComponent(o.artist || ''), 'track_name=' + encodeURIComponent(o.title || '')];
    if (o.album) q.push('album_name=' + encodeURIComponent(o.album));
    if (o.duration) q.push('duration=' + Math.round(o.duration));
    return 'https://lrclib.net/api/get?' + q.join('&');
  }
  /** What LRCLIB answered -> { kind: 'synced'|'plain'|'instrumental'|'none', lines } */
  function pickLyrics(resp) {
    if (!resp || typeof resp !== 'object') return { kind: 'none', lines: [] };
    if (resp.instrumental) return { kind: 'instrumental', lines: [] };
    var syn = parseLrc(resp.syncedLyrics); if (syn.length) return { kind: 'synced', lines: syn };
    var plain = String(resp.plainLyrics || '').split(/\r?\n/).map(function (x) { return x.trimEnd ? x.trimEnd() : x.replace(/\s+$/, ''); });
    while (plain.length && !plain[plain.length - 1]) plain.pop();
    return plain.length ? { kind: 'plain', lines: plain.map(function (x) { return { t: null, text: x }; }) } : { kind: 'none', lines: [] };
  }

  // ---- the colour of the picture, for the panel behind it ----
  /** The average colour of an RGBA pixel list (flat array), ignoring transparent pixels. -> [r, g, b] */
  function averageColor(px) {
    var r = 0, gg = 0, b = 0, n = 0;
    for (var i = 0; i + 3 < px.length; i += 4) { if (px[i + 3] < 40) continue; r += px[i]; gg += px[i + 1]; b += px[i + 2]; n++; }
    return n ? [Math.round(r / n), Math.round(gg / n), Math.round(b / n)] : [58, 74, 90];
  }
  /** Two colours for the panel behind the picture: the picture's own colour pulled dark, so the text on it stays readable. */
  function tintPair(rgb) {
    var mx = Math.max(rgb[0], rgb[1], rgb[2]) || 1, lift = Math.min(4, 150 / mx), c = rgb.map(function (v) { return Math.round(v * lift); });
    var dark = function (k) { return 'rgb(' + c.map(function (v) { return Math.round(v * k); }).join(',') + ')'; };
    return [dark(0.74), dark(0.5)];
  }

  var api = { pickPlayer: pickPlayer, isMusic: isMusic, nowPlaying: nowPlaying, repeatNext: repeatNext, canBrowse: canBrowse, libraryPhase: libraryPhase, deviceKind: deviceKind, hereSource: hereSource, browseNode: browseNode, stepInto: stepInto, layoutOf: layoutOf, iconFor: iconFor, browseProblem: browseProblem, fmtClock: fmtClock, parseLrc: parseLrc, lineAt: lineAt, lrclibUrl: lrclibUrl, pickLyrics: pickLyrics, averageColor: averageColor, tintPair: tintPair, FEATURES: F };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.music = api;

  // ===================================================================== screen ====
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, CT = g.OkieMotor.controls, h = UI.h;

  core.registerStrings('en', {
    'app.music': 'Music', 'mu.nothing': 'Nothing is playing', 'mu.nothing_sub': 'Start a song in Spotify and it shows up here.', 'mu.devices': 'Play on', 'mu.volume': 'Volume', 'mu.mute': 'Mute', 'mu.more': 'More', 'mu.shuffle': 'Shuffle', 'mu.repeat': 'Repeat', 'mu.r_off': 'Off', 'mu.r_all': 'All', 'mu.r_one': 'One',
    'mu.lyrics': 'Lyrics', 'mu.lyrics_off': 'Back to the picture', 'mu.ly_loading': 'Looking for the lyrics…', 'mu.ly_none': 'No lyrics found for this song.', 'mu.ly_instr': 'Instrumental', 'mu.ly_plain': 'These lyrics are not timed.', 'mu.prev': 'Previous', 'mu.next': 'Next', 'mu.play': 'Play', 'mu.pause': 'Pause', 'mu.players': 'Players',
    'mu.full': 'Full screen', 'mu.full_off': 'Close', 'mu.here': 'This tablet', 'mu.here_p': 'This phone', 'mu.here_t': 'Play on this tablet', 'mu.here_b': 'Open the Spotify app on this tablet once. It then shows up in this list; pick it and the sound comes out of the tablet or the Bluetooth speaker connected to it.', 'mu.open_spotify': 'Open Spotify',
    'mu.setup_t': 'Connect Spotify', 'mu.setup_b': 'Home Assistant can show and control your Spotify. You make a free Spotify app once, then log in from Home Assistant yourself; nothing here sees your password.',
    'mu.s1': 'Open developer.spotify.com/dashboard, log in and create an app. Redirect URI: https://my.home-assistant.io/redirect/oauth (tick Web API).', 'mu.s2': 'Copy its Client ID and Client secret.', 'mu.s3': 'Tap Set up in Home Assistant, paste them when asked, and log in to Spotify.',
    'mu.s_btn': 'Set up in Home Assistant', 'mu.s_dev': 'Open the Spotify developer page', 'mu.s_note': 'Spotify Premium is needed, both to create the Spotify app and to control the music from here.',
    'mu.library': 'Library', 'mu.browse': 'Browse your Spotify', 'mu.back': 'Back', 'mu.play_all': 'Play', 'mu.shuffle_play': 'Shuffle', 'mu.playing_on': 'Playing on {d}', 'mu.play_here': 'Play here', 'mu.loading': 'Loading…', 'mu.empty': 'Nothing here.',
    'mu.err': 'This could not be loaded.', 'mu.err_login': 'Home Assistant is not logged in to Spotify any more.', 'mu.retry': 'Try again', 'mu.refresh': 'Refresh', 'mu.relogin': 'Log in to Spotify again', 'mu.not_shown': '{n} more are not shown.',
    'mu.g_open_t': 'Open Spotify on this tablet', 'mu.g_open_b': 'Spotify only lists devices that are running. Open the Spotify app here and start any song for a second; this page notices by itself.',
    'mu.g_pick_t': 'Choose where it plays', 'mu.g_pick_b': 'Spotify knows these devices. Pick this tablet to send the sound to its speaker.',
    'mu.g_load_t': 'Start one song first', 'mu.g_load_b': 'Spotify is on {d}, but nothing is loaded yet. Play any song in the Spotify app once and your library opens here.',
    'mu.g_off_t': 'Spotify is not reachable', 'mu.g_off_b': 'Home Assistant cannot reach Spotify right now. If this stays, log in again.',
    'mu.g_sleep_t': 'Spotify went to sleep', 'mu.g_sleep_b': 'Open the Spotify app again; the library comes back by itself.', 'mu.dev_fail': 'That device did not answer. Open Spotify on it and try again.', 'mu.starting': 'Starting {d}…',
  });
  core.registerStrings('de', {
    'app.music': 'Musik', 'mu.nothing': 'Es läuft nichts', 'mu.nothing_sub': 'Starte ein Lied in Spotify, dann erscheint es hier.', 'mu.devices': 'Wiedergabe auf', 'mu.volume': 'Lautstärke', 'mu.mute': 'Stumm', 'mu.more': 'Mehr', 'mu.shuffle': 'Zufall', 'mu.repeat': 'Wiederholen', 'mu.r_off': 'Aus', 'mu.r_all': 'Alle', 'mu.r_one': 'Eins',
    'mu.lyrics': 'Songtext', 'mu.lyrics_off': 'Zurück zum Bild', 'mu.ly_loading': 'Songtext wird gesucht…', 'mu.ly_none': 'Kein Songtext für dieses Lied gefunden.', 'mu.ly_instr': 'Instrumental', 'mu.ly_plain': 'Dieser Songtext ist nicht zeitlich abgestimmt.', 'mu.prev': 'Zurück', 'mu.next': 'Weiter', 'mu.play': 'Abspielen', 'mu.pause': 'Pause', 'mu.players': 'Player',
    'mu.full': 'Vollbild', 'mu.full_off': 'Schließen', 'mu.here': 'Dieses Tablet', 'mu.here_p': 'Dieses Handy', 'mu.here_t': 'Auf diesem Tablet abspielen', 'mu.here_b': 'Öffne einmal die Spotify-App auf diesem Tablet. Dann erscheint es in dieser Liste; wähle es aus, und der Ton kommt aus dem Tablet oder dem damit verbundenen Bluetooth-Lautsprecher.', 'mu.open_spotify': 'Spotify öffnen',
    'mu.setup_t': 'Spotify verbinden', 'mu.setup_b': 'Home Assistant kann dein Spotify anzeigen und steuern. Du legst einmal eine kostenlose Spotify-App an und meldest dich dann selbst in Home Assistant an; hier sieht niemand dein Passwort.',
    'mu.s1': 'developer.spotify.com/dashboard öffnen, anmelden und eine App anlegen. Redirect-URI: https://my.home-assistant.io/redirect/oauth (Web API anhaken).', 'mu.s2': 'Client-ID und Client-Secret kopieren.', 'mu.s3': 'Auf In Home Assistant einrichten tippen, beides einfügen und bei Spotify anmelden.',
    'mu.s_btn': 'In Home Assistant einrichten', 'mu.s_dev': 'Spotify-Entwicklerseite öffnen', 'mu.s_note': 'Es braucht Spotify Premium, sowohl um die Spotify-App anzulegen als auch um die Musik von hier aus zu steuern.',
    'mu.library': 'Bibliothek', 'mu.browse': 'Dein Spotify durchsuchen', 'mu.back': 'Zurück', 'mu.play_all': 'Abspielen', 'mu.shuffle_play': 'Zufall', 'mu.playing_on': 'Wiedergabe auf {d}', 'mu.play_here': 'Hier abspielen', 'mu.loading': 'Lädt…', 'mu.empty': 'Hier ist nichts.',
    'mu.err': 'Das konnte nicht geladen werden.', 'mu.err_login': 'Home Assistant ist nicht mehr bei Spotify angemeldet.', 'mu.retry': 'Nochmal versuchen', 'mu.refresh': 'Aktualisieren', 'mu.relogin': 'Bei Spotify neu anmelden', 'mu.not_shown': '{n} weitere werden nicht angezeigt.',
    'mu.g_open_t': 'Spotify auf diesem Tablet öffnen', 'mu.g_open_b': 'Spotify listet nur Geräte, auf denen es läuft. Öffne hier die Spotify-App und starte kurz irgendein Lied; diese Seite merkt das von selbst.',
    'mu.g_pick_t': 'Wähle, wo es spielt', 'mu.g_pick_b': 'Spotify kennt diese Geräte. Wähle dieses Tablet, damit der Ton aus seinem Lautsprecher kommt.',
    'mu.g_load_t': 'Starte zuerst ein Lied', 'mu.g_load_b': 'Spotify ist auf {d}, aber es ist noch nichts geladen. Spiele einmal irgendein Lied in der Spotify-App ab, dann öffnet sich hier deine Bibliothek.',
    'mu.g_off_t': 'Spotify ist nicht erreichbar', 'mu.g_off_b': 'Home Assistant erreicht Spotify gerade nicht. Wenn das so bleibt, melde dich neu an.',
    'mu.g_sleep_t': 'Spotify ist eingeschlafen', 'mu.g_sleep_b': 'Öffne die Spotify-App noch einmal; die Bibliothek kommt von selbst zurück.', 'mu.dev_fail': 'Das Gerät hat nicht geantwortet. Öffne Spotify darauf und versuche es nochmal.', 'mu.starting': '{d} startet…',
  });

  function renderMusic(container, ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); }, disposed = false, lyricsOn = false, playerId = pickPlayer(ctx.hass().states, ctx.store.get('music.player', null)), lastTrack = '', lyr = null, lyrKey = '', lyrToken = 0, activeLine = -2, tint = null, tintFor = '', dragging = false, bars = [], lf = null, np = null;
    var shell = g.OkieMotor.appshell.create(container, ctx, { id: 'music', title: t('app.music'), subtitle: '', icon: 'music', gradient: ['#0f2a22', '#1db954'], slim: true, tabs: [], heroDomain: 'media_player', onTab: function () {}, actions: [{ icon: 'heart', label: t('dt.fav_add'), onClick: function () { if (!playerId) { ctx.toast('error', t('mu.nothing')); return; } ctx.favorites.toggle(playerId); paintHeart(); } }] });
    var heart = shell.el.querySelector('.dt-acts .dt-circ.act');      // the heart pins the player to the favorites, like the heart in every device screen
    function paintHeart() { if (!heart) return; var on = !!(playerId && ctx.favorites.has(playerId)); heart.classList.toggle('on', on); heart.setAttribute('aria-pressed', on ? 'true' : 'false'); }
    var body = shell.body, root = h('div.mu'), call = function (svc, data) { return ctx.call('media_player', svc, Object.assign({ entity_id: playerId }, data || {})).catch(function () { ctx.toast('error', t('app.music')); }); };

    // ---- a progress bar (the player has one, the full-screen lyrics another): tap or drag to seek
    function makeBar() {
      var fill = h('i'), knob = h('b'), bar = h('div.mu-bar', { role: 'slider', tabindex: '0', 'aria-label': t('app.music') }, h('div.mu-track', null, fill, knob)), tl = h('span'), tr = h('span');
      var b = { bar: bar, fill: fill, knob: knob, tl: tl, tr: tr, times: h('div.mu-tm', null, tl, tr) };
      var frac = function (e) { var r = bar.getBoundingClientRect(); return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))); };
      var show = function (f) { fill.style.width = f * 100 + '%'; knob.style.left = f * 100 + '%'; tl.textContent = fmtClock(f * np.duration); tr.textContent = '−' + fmtClock(np.duration * (1 - f)); };
      bar.addEventListener('pointerdown', function (e) { if (!np || !np.duration || !np.can.seek) return; dragging = true; try { bar.setPointerCapture(e.pointerId); } catch (er) { /* no capture */ } show(frac(e)); });
      bar.addEventListener('pointermove', function (e) { if (dragging) show(frac(e)); });
      bar.addEventListener('pointerup', function (e) { if (!dragging) return; dragging = false; call('media_seek', { seek_position: Math.round(frac(e) * np.duration * 10) / 10 }); });
      bar.addEventListener('pointercancel', function () { dragging = false; });
      bars.push(b); return b;
    }

    // ---- the pieces of the player
    var devBtn = h('button.mu-rb', { type: 'button', 'aria-label': t('mu.devices'), onclick: openDevices, html: UI.icon('notefill', 22) });
    var volBtn = h('button.mu-pill-b', { type: 'button', 'aria-label': t('mu.volume'), onclick: openVolume, html: UI.icon('volume', 24) });
    var castBtn = h('button.mu-pill-b', { type: 'button', 'aria-label': t('mu.devices'), onclick: openDevices, html: UI.icon('cast', 24) });
    var libBtn = h('button.mu-pill-b', { type: 'button', 'aria-label': t('mu.library'), title: t('mu.library'), onclick: openLib, html: UI.icon('grid', 24), hidden: true });
    var top = h('div.mu-top', null, devBtn, h('div.mu-pill', null, libBtn, castBtn, volBtn));
    var art = h('div.mu-art'), artImg = h('img', { alt: '', decoding: 'async', draggable: false }), title = h('div.mu-t'), artist = h('div.mu-a'), moreBtn = h('button.mu-more', { type: 'button', 'aria-label': t('mu.more'), onclick: openMore, html: UI.icon('more', 20) });
    art.appendChild(artImg); art.appendChild(h('div.mu-frost'));
    art.appendChild(h('button.mu-cta', { type: 'button', onclick: openLib, html: UI.icon('grid', 20) + '<span>' + t('mu.browse') + '</span>' }));      // an empty player offers your Spotify instead of a blank picture
    var ti = h('div.mu-ti', null, h('div.mu-txt', null, title, artist), moreBtn);
    var lyBox = h('div.mu-ly', { hidden: true }), lyHead = h('div.mu-lh'), lyList = h('div.mu-ll');
    lyBox.appendChild(lyHead); lyBox.appendChild(lyList);
    var mainBar = makeBar(), prog = h('div.mu-prog', null, mainBar.bar, mainBar.times), info = h('div.mu-info', null, ti, prog);
    var lyFull = h('button.mu-lx', { type: 'button', hidden: true, 'aria-label': t('mu.full'), title: t('mu.full'), onclick: openLyricsFull, html: UI.icon('expand', 20) });
    var stage = h('div.mu-stage', null, art, lyBox, lyFull, info);
    var lyBtn = h('button.mu-k.sm', { type: 'button', 'aria-label': t('mu.lyrics'), 'aria-pressed': 'false', onclick: toggleLyrics, html: UI.icon('quote', 30) });
    var prevBtn = h('button.mu-k', { type: 'button', 'aria-label': t('mu.prev'), onclick: function () { call('media_previous_track'); }, html: UI.icon('rewind', 44) });
    var playBtn = h('button.mu-k.big', { type: 'button', 'aria-label': t('mu.pause'), onclick: function () { ctx.haptic(10); call(np && np.playing ? 'media_pause' : 'media_play'); } });
    var nextBtn = h('button.mu-k', { type: 'button', 'aria-label': t('mu.next'), onclick: function () { call('media_next_track'); }, html: UI.icon('ffwd', 44) });
    var listBtn = h('button.mu-k.sm', { type: 'button', 'aria-label': t('mu.devices'), onclick: openDevices, html: UI.icon('list', 28) });
    var keys = h('div.mu-keys', null, lyBtn, prevBtn, playBtn, nextBtn, listBtn);
    var player = h('div.mu-player', null, top, stage, keys);
    // everything is drawn in one scale (the picture is 629 wide): --u is one of its pixels; the picture is sized to the room it has
    function sizeStage() {
      var w = root.clientWidth; if (!w || disposed) return;
      root.style.setProperty('--u', (w / 629).toFixed(3) + 'px');
      var sw = stage.clientWidth, sh = stage.clientHeight; if (!sw || !sh) return;
      var wide = sw > 480, f = wide ? 0.66 + 0.24 * Math.max(0, Math.min(1, (sh / sw - 0.7) / 0.5)) : 0.97;      // a taller panel (a tablet) gets a bigger picture, not a small one floating in empty space
      var gap = 14 * (root.clientWidth / 629), ih = info.offsetHeight || 150 * (root.clientWidth / 629), room = Math.max(60, sh - ih - gap);      // the picture ends above the title, the bar and the 3 dots: nothing of it lies under them
      var aw = Math.min(sw * f, room * 0.96), ah = aw / 0.96;
      art.style.width = Math.round(aw) + 'px'; art.style.height = Math.round(ah) + 'px';
      var tall = sh > ah + ih + 120;             // a phone: the picture, then its title under it, not far apart on a tall panel
      root.classList.toggle('flow', tall);
      art.style.top = tall ? '' : Math.max(0, Math.round((room - ah) / 2)) + 'px';
    }
    var setup = h('div.mu-setup', { hidden: true });
    root.appendChild(player); root.appendChild(setup); body.appendChild(root);
    var roSize = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(function () { requestAnimationFrame(sizeStage); }) : null; if (roSize) roSize.observe(root); requestAnimationFrame(sizeStage);

    var np = null;
    function setupView() {
      setup.innerHTML = '';
      setup.appendChild(h('div.mu-si', { html: UI.icon('music', 54) }));
      setup.appendChild(h('div.mu-st', null, t('mu.setup_t')));
      setup.appendChild(h('p', null, t('mu.setup_b')));
      setup.appendChild(h('ol', null, h('li', null, t('mu.s1')), h('li', null, t('mu.s2')), h('li', null, t('mu.s3'))));
      setup.appendChild(h('div.mu-sb', null, h('a.act.primary', { href: '/config/integrations/dashboard/add?domain=spotify', target: '_top' }, t('mu.s_btn')), h('a.act', { href: 'https://developer.spotify.com/dashboard', target: '_blank', rel: 'noopener' }, t('mu.s_dev'))));
      setup.appendChild(h('p.dim', null, t('mu.s_note')));
    }
    setupView();

    // ---- sheets
    /** The kind of screen this card runs on, and what its Spotify player is called in the list (Spotify names it after the device). */
    function thisDevice() { var nav = g.navigator || {}; return deviceKind(nav.userAgent, (nav.maxTouchPoints || 0) > 1); }
    function openDevices() {
      ctx.sheet({ title: t('mu.devices'), width: 'min(420px,100%)', content: function (close) {
        var states = ctx.hass().states, others = Object.keys(states).filter(function (id) { return id.indexOf('media_player.') === 0 && isMusic(id, states[id]) && states[id].state !== 'unavailable'; });
        var box = h('div.mu-dev');
        var me = thisDevice(), anyHere = false;
        if (np && np.sources.length) {
          box.appendChild(h('div.lbl', null, t('mu.devices')));
          var srcs = np.sources.slice().sort(function (a, b) { return (me && me.re.test(b) ? 1 : 0) - (me && me.re.test(a) ? 1 : 0); });      // this tablet's own player first
          srcs.forEach(function (s) {
            var here = !!(me && me.re.test(s)); anyHere = anyHere || here;
            box.appendChild(h('button.mu-row' + (s === np.source ? '.on' : ''), { type: 'button', onclick: function () { call('select_source', { source: s }); close(); } }, h('span', null, s, here ? h('em.mu-here-b', null, t(me.phone ? 'mu.here_p' : 'mu.here')) : null), s === np.source ? h('span', { html: UI.icon('check', 16) }) : null));
          });
        }
        if (me && !anyHere) box.appendChild(h('div.mu-here', null, h('div.t', null, t('mu.here_t')), h('p', null, t('mu.here_b')), h('a.act.primary', { href: 'spotify://' }, t('mu.open_spotify'))));      // Spotify lists only the players that are running: the app on this tablet joins the list once it is open
        if (others.length > 1) {
          box.appendChild(h('div.lbl', null, t('mu.players')));
          others.forEach(function (id) { box.appendChild(h('button.mu-row' + (id === playerId ? '.on' : ''), { type: 'button', onclick: function () { playerId = id; ctx.store.set('music.player', id); lastTrack = ''; close(); paint(true); } }, h('span', null, (states[id].attributes.friendly_name || id)), id === playerId ? h('span', { html: UI.icon('check', 16) }) : null)); });
        }
        if (!box.children.length) box.appendChild(h('div.note-l', null, t('mu.nothing_sub')));
        return box;
      } });
    }
    function openVolume() {
      ctx.sheet({ title: t('mu.volume'), width: 'min(420px,100%)', content: function () {
        var muted = !!(np && np.muted);
        var sl = CT.createSlider({ min: 0, max: 100, step: 1, value: np && np.volume != null ? Math.round(np.volume * 100) : 0, ariaLabel: t('mu.volume'), format: function (v) { return Math.round(v) + '%'; }, color: '#ffffff', onChange: function (v) { call('volume_set', { volume_level: v / 100 }); } });
        var mute = h('button.mu-vol-b' + (muted ? '.on' : ''), { type: 'button', 'aria-label': t('mu.mute'), 'aria-pressed': muted ? 'true' : 'false', html: UI.icon('volume', 24), onclick: function () { muted = !muted; mute.classList.toggle('on', muted); mute.setAttribute('aria-pressed', muted ? 'true' : 'false'); call('volume_mute', { is_volume_muted: muted }); } });
        return h('div.mu-vol', null, mute, sl.el);      // one wide bar (it was squeezed into a small round dot) and a button that mutes
      } });
    }
    function openMore() {
      ctx.sheet({ title: t('mu.more'), width: 'min(380px,100%)', content: function (close) {
        var box = h('div.mu-dev');
        var sh = h('button.mu-row' + (np && np.shuffle ? '.on' : ''), { type: 'button', onclick: function () { call('shuffle_set', { shuffle: !(np && np.shuffle) }); close(); } }, h('span.mu-ri', { html: UI.icon('shuffle', 18) }), h('span', null, t('mu.shuffle')), h('span.dim', null, np && np.shuffle ? '✓' : ''));
        var rp = h('button.mu-row' + (np && np.repeat !== 'off' ? '.on' : ''), { type: 'button', onclick: function () { call('repeat_set', { repeat: repeatNext(np ? np.repeat : 'off') }); close(); } }, h('span.mu-ri', { html: UI.icon('repeat', 18) }), h('span', null, t('mu.repeat')), h('span.dim', null, t('mu.r_' + (np ? np.repeat : 'off'))));
        if (!np || np.can.shuffle) box.appendChild(sh); if (!np || np.can.repeat) box.appendChild(rp);
        if (!box.children.length) box.appendChild(h('div.note-l', null, '–'));
        return box;
      } });
    }

    // ---- the library: your Spotify (what Home Assistant lets you browse), opened from the grid button or from an empty player.
    // Home Assistant offers browsing and playing only while a Spotify device is active and has something loaded (two feature bits). Until then a short guide leads there (open Spotify
    // on this tablet, pick the tablet, start one song) and the library opens by itself as soon as the bits appear. Every update is checked, not only the first: Spotify lets an idle
    // device go after a while, and then the library says so instead of failing.
    var libEl = null, libStack = [], libCache = {}, libToken = 0, libState = null, libView = '', libAsleep = false, libHold = 0, gateSig = '', liveSig = '', pollT = 0, pollN = 0, libPending = '', pendingFrom = '', pendingT = 0, kindHere = thisDevice();
    function refreshSpotify() { if (playerId) ctx.call('homeassistant', 'update_entity', { entity_id: playerId }).catch(function () { /* the next poll of Home Assistant brings the state anyway */ }); }
    function startPoll() {
      if (pollT) return; pollN = 0; refreshSpotify();
      pollT = setInterval(function () { if (disposed || !libEl || (np && np.browse) || ++pollN > 20) { stopPoll(); return; } refreshSpotify(); }, 8000);      // asks Home Assistant to look again every 8 seconds, for about 2.5 minutes while the guide is open
    }
    function stopPoll() { if (pollT) { clearInterval(pollT); pollT = 0; } }
    function tap(el, fn) { el.addEventListener('click', fn); el.addEventListener('keydown', function (e) { if (e.target === el && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); fn(e); } }); return el; }
    function mediaUrl(u) { return /^\//.test(u) && ctx.hass().hassUrl ? ctx.hass().hassUrl(u) : u; }
    function topOf() { return libStack[libStack.length - 1]; }
    function liveKey() { return [np.title, np.artist, np.state, np.art, libPending, np.source, np.sources.join()].join('|'); }

    function openLib() {
      if (disposed || libEl || !playerId) return;
      libEl = h('div.mu-lib', { role: 'dialog', 'aria-label': t('mu.library') }); root.appendChild(libEl);
      libStack = []; libState = null; libView = ''; libAsleep = false; libHold = 0; gateSig = ''; liveSig = ''; libSync(true);
    }
    function closeLib() { stopPoll(); clearTimeout(pendingT); libToken++; libPending = ''; if (libEl && libEl.parentNode) libEl.parentNode.removeChild(libEl); libEl = null; }
    /** Called on every update: which view the library is in follows the two feature bits. */
    function libSync(force) {
      if (!libEl || !np) return;
      if (np.browse) {
        stopPoll();
        if (libView !== 'browse') { if (Date.now() < libHold) return; libView = 'browse'; libAsleep = false; if (libStack.length) drawLib(); else startRoot(); return; }
        if (libAsleep) { libAsleep = false; drawLib(); return; }
        if (force) drawLib(); else paintLibLive(false);
        return;
      }
      startPoll();
      if (libView === 'browse') { if (!libAsleep) { libAsleep = true; drawLib(); } return; }      // it was open and the player stopped offering it: what you were looking at stays, with a note on top
      libView = 'gate';
      var sig = [np.phase, np.source, np.sources.join('|')].join('~'); if (force || sig !== gateSig) { gateSig = sig; drawGate(); }
    }
    function openSpotifyLink() { return h('a.act.primary', { href: 'spotify://' }, t('mu.open_spotify')); }
    function refreshBtn() { return h('button.act', { type: 'button', onclick: function () { stopPoll(); startPoll(); } }, t('mu.refresh')); }
    function reloginLink() { return h('a.mu-relog', { href: '/config/integrations/integration/spotify', target: '_top' }, t('mu.relogin')); }
    /** Send the music to a device of the list, then wait until Spotify really reports it (an unknown name is ignored by Home Assistant without an error). */
    function useDevice(name) {
      ctx.haptic(10); call('select_source', { source: name });
      var until = Date.now() + 7000;
      (function wait() {
        if (disposed) return; var s = ctx.hass().states[playerId];
        if (s && s.attributes.source === name) { refreshSpotify(); return; }
        if (Date.now() > until) { ctx.toast('error', t('mu.dev_fail')); return; }
        setTimeout(wait, 500);
      })();
    }
    function libHead(label, extra) { return h('div.mu-lh2', null, h('button.mu-lb', { type: 'button', 'aria-label': t('mu.back'), onclick: libBack, html: UI.icon('chevleft', 22) }), h('div.mu-lt0', null, label), extra || null); }
    function drawGate() {
      if (!libEl) return; libEl.innerHTML = '';
      var ph = np.phase, here = hereSource(np.sources, kindHere), box = h('div.mu-gate'), btns = h('div.mu-gb'), tt = 'mu.g_open_t', bb = 'mu.g_open_b';
      if (ph === 'pick') { tt = 'mu.g_pick_t'; bb = 'mu.g_pick_b'; } else if (ph === 'load') { tt = 'mu.g_load_t'; bb = 'mu.g_load_b'; } else if (ph === 'offline') { tt = 'mu.g_off_t'; bb = 'mu.g_off_b'; } else if (ph === 'ready') { tt = 'mu.g_sleep_t'; bb = 'mu.g_sleep_b'; }      // 'ready' here: the features say yes but the browse call said no
      box.appendChild(h('div.mu-si', { html: UI.icon('music', 44) })); box.appendChild(h('div.t', null, t(tt))); box.appendChild(h('p', null, t(bb, { d: np.source || '' })));
      if (ph === 'pick') np.sources.slice().sort(function (a, b) { return (a === here ? 0 : 1) - (b === here ? 0 : 1); }).forEach(function (s) {      // this tablet first
        box.appendChild(h('button.mu-row', { type: 'button', onclick: function () { useDevice(s); } }, h('span', null, s, s === here ? h('em.mu-here-b', null, t(kindHere && kindHere.phone ? 'mu.here_p' : 'mu.here')) : null)));
      });
      if (ph === 'load' && here && np.source !== here) btns.appendChild(h('button.act.primary', { type: 'button', onclick: function () { useDevice(here); } }, t('mu.here_t')));
      if (ph !== 'offline') btns.appendChild(openSpotifyLink());
      btns.appendChild(refreshBtn()); box.appendChild(btns); box.appendChild(reloginLink());
      libEl.appendChild(libHead(t('mu.library'))); libEl.appendChild(box);
    }
    function sleepBanner() { return h('div.mu-sleep', null, h('div.t', null, t('mu.g_sleep_t')), h('p', null, t('mu.g_sleep_b')), h('div.mu-gb', null, openSpotifyLink(), refreshBtn())); }
    function devStrip() {
      var here = hereSource(np.sources, kindHere);
      return h('div.mu-ls', null, h('button.mu-lsb', { type: 'button', onclick: openDevices }, t('mu.playing_on', { d: np.source || '–' })), here && np.source !== here ? h('button.mu-chip', { type: 'button', onclick: function () { useDevice(here); } }, t('mu.play_here')) : null);
    }
    function miniBar() {
      var url = np.art ? mediaUrl(np.art) : '', play = h('button.mu-k', { type: 'button', 'aria-label': np.playing ? t('mu.pause') : t('mu.play'), disabled: !np.can.pause, html: UI.icon(np.playing ? 'pausefill' : 'playfill', 28), onclick: function (e) { e.stopPropagation(); call(np.playing ? 'media_pause' : 'media_play'); } });
      return tap(h('div.mu-mini', { role: 'button', tabindex: '0', 'aria-label': t('app.music') }, url ? h('img', { src: url, alt: '', draggable: false }) : h('span.mu-ph', { html: UI.icon('music', 20) }),
        h('div.mu-mt', null, h('b', null, libPending ? t('mu.starting', { d: libPending }) : (np.title || t('mu.nothing'))), h('span', null, libPending ? '' : np.artist)), play), closeLib);      // a tap anywhere else on it goes back to the player
    }
    function paintLibLive(force) {
      if (!libEl || libView !== 'browse' || !np) return;
      if (libPending && pendingFrom !== [np.title, np.state, np.artist].join('|')) libPending = '';      // the song changed: it started
      var key = liveKey(); if (!force && key === liveSig) return; liveSig = key;
      var ls = libEl.querySelector('.mu-ls'), mn = libEl.querySelector('.mu-mini'); if (ls) ls.replaceWith(devStrip()); if (mn) mn.replaceWith(miniBar());
    }
    function drawLib() {
      if (!libEl || !np) return; libEl.innerHTML = '';
      var cur = topOf(), n = cur && cur.n, acts = null;
      if (!libState && n && n.playable && np.browse) acts = h('div.mu-lacts', null,
        h('button.mu-chip.pri', { type: 'button', onclick: function () { playNode(n, false); }, html: UI.icon('playfill', 16) + '<span>' + t('mu.play_all') + '</span>' }),
        h('button.mu-chip', { type: 'button', onclick: function () { playNode(n, true); }, html: UI.icon('shuffle', 16) + '<span>' + t('mu.shuffle_play') + '</span>' }));
      libEl.appendChild(libHead(libState && libState.loading ? libState.loading : (n && n.title) || t('mu.library'), acts));
      if (libAsleep) libEl.appendChild(sleepBanner());
      libEl.appendChild(devStrip());
      var body = h('div.mu-lbody');
      if (libState && libState.loading) body.appendChild(h('div.mu-lm', null, t('mu.loading')));
      else if (libState && libState.error) body.appendChild(errBox());
      else if (n) fillNode(body, n);
      libEl.appendChild(body); body.scrollTop = (!libState && cur && cur.top) || 0;
      libEl.appendChild(miniBar()); liveSig = liveKey();
    }
    function errBox() {
      var box = h('div.mu-gate'); box.appendChild(h('p', null, t(libState.error === 'login' ? 'mu.err_login' : 'mu.err')));
      box.appendChild(h('div.mu-gb', null, h('button.act.primary', { type: 'button', onclick: libState.retry }, t('mu.retry')))); if (libState.error === 'login') box.appendChild(reloginLink());
      return box;
    }
    function fillNode(body, n) {
      if (!n.kids.length) { body.appendChild(h('div.mu-lm', null, t('mu.empty'))); return; }
      var grid = layoutOf(n) === 'grid', wrap = h(grid ? 'div.mu-grid' : 'div.mu-list');
      n.kids.forEach(function (c) { wrap.appendChild(grid ? tileFor(c) : rowFor(c)); });
      body.appendChild(wrap); if (n.hidden) body.appendChild(h('div.mu-lm.small', null, t('mu.not_shown', { n: n.hidden })));
    }
    function artOf(c, size) { return c.art ? h('img', { src: mediaUrl(c.art), alt: '', loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer', draggable: false }) : h('span.mu-ph', { html: UI.icon(iconFor(c.cls), size) }); }
    function playChip(c) { return c.playable && c.expandable ? h('button.mu-tp', { type: 'button', 'aria-label': t('mu.play_all') + ' ' + c.title, html: UI.icon('playfill', 18), onclick: function (e) { e.stopPropagation(); playNode(c); } }) : null; }
    function openItem(c) { if (c.expandable) openNode(c); else if (c.playable) playNode(c); }
    function tileFor(c) { return tap(h('div.mu-tile', { role: 'button', tabindex: '0' }, h('div.mu-tc', null, artOf(c, 34), playChip(c)), h('div.mu-tn', null, c.title)), function () { openItem(c); }); }
    function rowFor(c) { return tap(h('div.mu-row.mu-lr', { role: 'button', tabindex: '0' }, h('span.mu-rc', null, artOf(c, 20)), h('span.mu-rt', null, c.title), playChip(c) || (c.expandable ? h('span.mu-chev', { html: UI.icon('chevron', 16) }) : null)), function () { openItem(c); }); }

    /** One level of the library: the answer is kept for as long as this screen is open. The id and the type go to Home Assistant exactly as it gave them. */
    function browseAt(id, type) {
      var key = type + '|' + id; if (libCache[key]) return Promise.resolve(libCache[key]);
      var msg = { type: 'media_player/browse_media', entity_id: playerId }; if (id) { msg.media_content_id = id; msg.media_content_type = type; }
      return ctx.callWS(msg).then(function (raw) { var n = browseNode(raw); if (!n) throw new Error('empty'); libCache[key] = n; return n; });
    }
    function descend(n) { var s = stepInto(n); return s ? browseAt(s.id, s.type).then(descend) : n; }
    function startRoot() {
      var my = ++libToken; libState = { loading: t('mu.library') }; libStack = []; drawLib();
      browseAt('', '').then(descend).then(function (n) { if (my !== libToken || !libEl) return; libState = null; libStack = [{ n: n, top: 0 }]; drawLib(); }, function (e) { if (my === libToken && libEl) libFail(e, startRoot); });
    }
    function openNode(c) {
      var my = ++libToken, sc = libEl && libEl.querySelector('.mu-lbody'); if (topOf() && sc) topOf().top = sc.scrollTop;
      libState = { loading: c.title }; drawLib();
      browseAt(c.id, c.type).then(function (n) { if (my !== libToken || !libEl) return; libState = null; libStack.push({ n: n, top: 0 }); drawLib(); }, function (e) { if (my === libToken && libEl) libFail(e, function () { openNode(c); }); });
    }
    function libFail(e, retry) {
      var k = browseProblem(e);
      if (k === 'asleep') { libState = null; libHold = Date.now() + 5000; refreshSpotify(); startPoll(); if (libStack.length) { libAsleep = true; drawLib(); } else { libView = 'gate'; gateSig = ''; drawGate(); } return; }
      libState = { error: k, retry: function () { libState = null; retry(); } }; drawLib();
    }
    function libBack() {
      if (libState) { libToken++; libState = null; if (!libStack.length) { closeLib(); return; } drawLib(); return; }
      if (libStack.length > 1) { libStack.pop(); drawLib(); return; }
      closeLib();
    }
    /** Play a song, a playlist, an album, your Liked songs: Home Assistant is handed the item exactly as it listed it. A song plays on its own; a list plays from its start (shuffled when asked). */
    function playNode(c, shuffle) {
      if (!np || !np.browse) { libSync(true); return; }
      ctx.haptic(10);
      var pre = shuffle != null && shuffle !== !!np.shuffle ? ctx.call('media_player', 'shuffle_set', { entity_id: playerId, shuffle: shuffle }) : Promise.resolve();
      pre.then(function () {
        libPending = c.title; pendingFrom = [np.title, np.state, np.artist].join('|'); clearTimeout(pendingT); pendingT = setTimeout(function () { libPending = ''; paintLibLive(true); }, 6000); paintLibLive(true);
        return ctx.call('media_player', 'play_media', { entity_id: playerId, media_content_id: c.id, media_content_type: c.type });
      }).catch(function () { libPending = ''; paintLibLive(true); ctx.toast('error', t('mu.err')); });
    }

    // ---- lyrics
    function toggleLyrics() { lyricsOn = !lyricsOn; lyBtn.classList.toggle('on', lyricsOn); lyBtn.setAttribute('aria-pressed', lyricsOn ? 'true' : 'false'); lyBtn.setAttribute('aria-label', lyricsOn ? t('mu.lyrics_off') : t('mu.lyrics')); root.dataset.lyrics = lyricsOn ? '1' : ''; art.hidden = lyricsOn; ti.hidden = lyricsOn; lyBox.hidden = !lyricsOn; lyFull.hidden = !lyricsOn; if (lyricsOn) loadLyrics(); else closeLyricsFull(); }
    function loadLyrics() {
      if (!np || !np.title) return;
      var key = [np.artist, np.title].join('|');
      if (key === lyrKey && lyr) { drawLyrics(); return; }
      lyrKey = key; lyr = null; var my = ++lyrToken; [lyList, lf && lf.list].forEach(function (l) { if (l) { l.innerHTML = ''; l.appendChild(h('div.mu-lm', null, t('mu.ly_loading'))); } }); lyHead.innerHTML = ''; activeLine = -2;
      var cache = ctx.store.get('music.lyrics', null) || {}, hit = cache[key];
      var finish = function (res) { if (my !== lyrToken || disposed) return; lyr = res; drawLyrics(); };
      if (hit) { finish(hit); return; }
      var f = g.__okieFetch || g.fetch;
      Promise.resolve(f(lrclibUrl({ artist: np.artist, title: np.title, album: np.album, duration: np.duration }))).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (j) {
        var res = pickLyrics(j); if (res.kind !== 'none') { var c2 = Object.assign({}, ctx.store.get('music.lyrics', null) || {}); var ks = Object.keys(c2); if (ks.length > 30) delete c2[ks[0]]; c2[key] = res; ctx.store.set('music.lyrics', c2); }
        finish(res);
      }, function () { finish({ kind: 'none', lines: [] }); });
    }
    function fillLyrics(list, head) {
      list.innerHTML = ''; if (head) head.innerHTML = '';
      if (head && np) head.appendChild(h('div.mu-lt', null, h('b', null, np.title), h('span', null, np.artist)));
      if (!lyr || lyr.kind === 'none') { list.appendChild(h('div.mu-lm', null, t('mu.ly_none'))); return; }
      if (lyr.kind === 'instrumental') { list.appendChild(h('div.mu-lm', null, t('mu.ly_instr'))); return; }
      if (lyr.kind === 'plain') list.appendChild(h('div.mu-lm.small', null, t('mu.ly_plain')));
      lyr.lines.forEach(function (ln, i) {
        var el = h('div.mu-l' + (ln.text ? '' : '.gap'), { dataset: { i: String(i) }, role: lyr.kind === 'synced' ? 'button' : null, onclick: lyr.kind === 'synced' && np && np.can.seek ? function () { call('media_seek', { seek_position: Math.max(0, ln.t) }); } : null }, ln.text || '♪');
        list.appendChild(el);
      });
    }
    function drawLyrics() {
      fillLyrics(lyList, lyHead); if (lf) { fillLyrics(lf.list, null); lf.sync(); }
      activeLine = -2; markLine(true);
    }
    function markLine(force) {
      if (!lyr || lyr.kind !== 'synced' || !np) return;
      var i = lineAt(lyr.lines, np.position); if (i === activeLine && !force) return; activeLine = i;
      var mark = function (list, scroller, frac, head) {
        var els = list.querySelectorAll('.mu-l'); Array.prototype.forEach.call(els, function (e, k) { e.classList.toggle('on', k === i); e.classList.toggle('past', k < i); });
        var cur = els[Math.max(0, i)]; if (!cur) return; var want = Math.max(0, cur.offsetTop - scroller.clientHeight * frac - (head ? head.offsetHeight : 0));
        try { scroller.scrollTo({ top: want, behavior: force ? 'auto' : 'smooth' }); } catch (e2) { scroller.scrollTop = want; }
      };
      if (lyricsOn) mark(lyList, lyBox, 0.32, lyHead);
      if (lf) mark(lf.list, lf.scroller, 0.36, null);
    }

    // ---- the lyrics over the whole screen; the controls step aside after a moment while it plays, a tap brings them back
    function openLyricsFull() {
      var stg = ctx.stage; if (lf || disposed || !stg) return;
      var list = h('div.mu-lfl'), scroller = h('div.mu-lfs', null, list), hideT = 0;
      var lart = h('img', { alt: '', decoding: 'async', draggable: false }), ltitle = h('div.mu-lt1'), lartist = h('div.mu-lt2');
      var closeBtn = h('button.mu-lfb', { type: 'button', 'aria-label': t('mu.full_off'), title: t('mu.full_off'), onclick: closeLyricsFull, html: UI.icon('close', 24) });
      var topBar = h('div.mu-lftop', null, lart, h('div.mu-lftx', null, ltitle, lartist), closeBtn);
      var lbar = makeBar();
      var lprev = h('button.mu-k', { type: 'button', 'aria-label': t('mu.prev'), onclick: function () { call('media_previous_track'); }, html: UI.icon('rewind', 40) });
      var lplay = h('button.mu-k.big', { type: 'button', onclick: function () { ctx.haptic(10); call(np && np.playing ? 'media_pause' : 'media_play'); } });
      var lnext = h('button.mu-k', { type: 'button', 'aria-label': t('mu.next'), onclick: function () { call('media_next_track'); }, html: UI.icon('ffwd', 40) });
      var ui = h('div.mu-lfui', null, lbar.bar, lbar.times, h('div.mu-lfk', null, lprev, lplay, lnext));
      var el = h('div.mu-lf', { role: 'dialog', 'aria-modal': 'true', dataset: { ui: '1' } }, scroller, topBar, ui);
      ['--mu-a', '--mu-b'].forEach(function (v) { var x = root.style.getPropertyValue(v); if (x) el.style.setProperty(v, x); });
      var showUi = function () { el.dataset.ui = '1'; clearTimeout(hideT); hideT = 0; if (np && np.playing) hideT = setTimeout(function () { hideT = 0; el.dataset.ui = '0'; }, 3200); };
      var hideUi = function () { clearTimeout(hideT); hideT = 0; el.dataset.ui = '0'; };
      el.addEventListener('click', function (e) {
        if (e.target.closest && e.target.closest('button, .mu-bar, .mu-l')) { showUi(); return; }          // a control or a line: it did its job, the controls stay a while
        if (el.dataset.ui === '1') hideUi(); else showUi();                                                // the background: show or hide the controls
      });
      el.addEventListener('mousemove', function () { if (el.dataset.ui !== '1') showUi(); });
      var onKey = function (e) { if (e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); closeLyricsFull(); } else showUi(); };
      var onFs = function () { if (!(document.fullscreenElement || document.webkitFullscreenElement)) closeLyricsFull(); };
      document.addEventListener('keydown', onKey, true);
      lf = { el: el, list: list, scroller: scroller, bar: lbar, hideT: function () { return hideT; },
        sync: function () {
          if (!np) return; ltitle.textContent = np.title || ''; lartist.textContent = np.artist || ''; var src = artImg.getAttribute('src'); if (src) lart.setAttribute('src', src); lart.hidden = !src;
          lplay.innerHTML = UI.icon(np.playing ? 'pausefill' : 'playfill', 46); lplay.setAttribute('aria-label', np.playing ? t('mu.pause') : t('mu.play')); lprev.disabled = !np.can.prev; lnext.disabled = !np.can.next;
          if (np.playing && el.dataset.ui === '1' && !hideT) showUi(); else if (!np.playing) { clearTimeout(hideT); hideT = 0; el.dataset.ui = '1'; }      // paused: the controls stay
        },
        close: function () { clearTimeout(hideT); document.removeEventListener('keydown', onKey, true); document.removeEventListener('fullscreenchange', onFs); document.removeEventListener('webkitfullscreenchange', onFs); },
      };
      stg.appendChild(el);
      if (lyr) fillLyrics(list, null); else { list.appendChild(h('div.mu-lm', null, t('mu.ly_loading'))); loadLyrics(); }
      lf.sync(); showUi(); activeLine = -2; markLine(true); tick();
      try { var rq = el.requestFullscreen || el.webkitRequestFullscreen; if (rq) { var pr = rq.call(el); if (pr && pr.then) pr.then(function () { if (!lf) return; document.addEventListener('fullscreenchange', onFs); }, function () { /* the window stays the full screen */ }); else document.addEventListener('webkitfullscreenchange', onFs); } } catch (e) { /* the window stays the full screen */ }
    }
    function closeLyricsFull() {
      if (!lf) return; var f = lf; lf = null; f.close(); bars = bars.filter(function (b) { return b !== f.bar; });
      try { if ((document.fullscreenElement || document.webkitFullscreenElement) === f.el) { var ex = document.exitFullscreen || document.webkitExitFullscreen; if (ex) { var pr = ex.call(document); if (pr && pr.catch) pr.catch(function () {}); } } } catch (e) { /* closing anyway */ }
      if (f.el.parentNode) f.el.parentNode.removeChild(f.el); activeLine = -2; markLine(true);
    }

    // ---- the picture's colour behind everything
    function paintTint(url) {
      if (!url || tintFor === url) return; tintFor = url;
      var img = new Image(); img.crossOrigin = 'anonymous';
      img.onload = function () {
        if (disposed || tintFor !== url) return;
        try { var c = document.createElement('canvas'); c.width = c.height = 16; var cx = c.getContext('2d'); cx.drawImage(img, 0, 0, 16, 16); var p = tintPair(averageColor(cx.getImageData(0, 0, 16, 16).data)); root.style.setProperty('--mu-a', p[0]); root.style.setProperty('--mu-b', p[1]); if (lf) { lf.el.style.setProperty('--mu-a', p[0]); lf.el.style.setProperty('--mu-b', p[1]); } } catch (e) { /* a picture from another site cannot be read: the default colours stay */ }
      };
      img.src = url;
    }

    // ---- painting
    var lastPaintKey = '';
    function paint(force) {
      if (disposed) return;
      var states = ctx.hass().states; if (!playerId || !states[playerId] || states[playerId].state === 'unavailable') playerId = pickPlayer(states, ctx.store.get('music.player', null));
      var st = playerId && states[playerId];
      if (!st) { var any = Object.keys(states).filter(function (id) { return /^media_player\.spotify/.test(id); })[0]; if (any) st = states[any]; }      // Spotify is set up but not reachable right now: show the quiet player, not the set-up help
      np = st ? nowPlaying(st, Date.now()) : null;
      var empty = !np || (!np.title && np.state !== 'playing' && np.state !== 'paused');
      player.hidden = !np; setup.hidden = !!np; paintHeart(); if (!np) { closeLib(); return; }
      root.dataset.empty = empty ? '1' : '';
      libBtn.hidden = !(playerId && /spotify/i.test(playerId)); if (libBtn.hidden && libEl) closeLib(); else libSync(false);      // checked on every update, not once: the two feature bits come and go with Spotify's active device
      var url = np.art ? (ctx.hass().hassUrl ? ctx.hass().hassUrl(np.art) : np.art) : '';
      var key = [np.title, np.artist, url, np.state, np.shuffle, np.repeat, np.volume, np.can.seek, np.sources.join(), np.source, np.phase].join('|');
      if (force || key !== lastPaintKey) {
        lastPaintKey = key;
        title.textContent = np.title || t('mu.nothing'); artist.textContent = np.title ? np.artist : t('mu.nothing_sub');
        if (artImg.getAttribute('src') !== url) { if (url) artImg.setAttribute('src', url); else artImg.removeAttribute('src'); }
        art.classList.toggle('noimg', !url); paintTint(url); sizeStage();
        playBtn.innerHTML = UI.icon(np.playing ? 'pausefill' : 'playfill', 46); playBtn.setAttribute('aria-label', np.playing ? t('mu.pause') : t('mu.play'));
        prevBtn.disabled = !np.can.prev; nextBtn.disabled = !np.can.next; volBtn.disabled = !np.can.volume; volBtn.setAttribute('aria-label', t('mu.volume') + (np.volume != null ? ' ' + Math.round(np.volume * 100) + '%' : ''));
        devBtn.hidden = !(np.sources.length || true);
        var track = np.artist + '|' + np.title; if (track !== lastTrack) { lastTrack = track; if (lyricsOn) loadLyrics(); }
        if (shell && shell.setSubtitle) shell.setSubtitle(np.playing ? np.artist : '');
        if (lf) lf.sync();
      }
      tick();
    }
    function tick() {
      if (disposed || !np) return;
      var states = ctx.hass().states, st = playerId && states[playerId]; if (st) np = nowPlaying(st, Date.now());
      var d = np.duration, p = np.position;
      bars.forEach(function (b) {
        if (!dragging) { b.fill.style.width = d ? (p / d * 100) + '%' : '0%'; b.knob.style.left = d ? (p / d * 100) + '%' : '0%'; b.tl.textContent = fmtClock(p); b.tr.textContent = d ? '−' + fmtClock(d - p) : ''; b.bar.setAttribute('aria-valuenow', String(Math.round(p))); b.bar.setAttribute('aria-valuemax', String(Math.round(d || 0))); }
        b.bar.classList.toggle('dis', !np.can.seek || !d);
      });
      if (lyricsOn || lf) markLine(false);
    }
    paint(true);
    var timer = setInterval(tick, 250);
    return { update: function () { paint(false); }, dispose: function () { disposed = true; closeLib(); closeLyricsFull(); clearInterval(timer); if (roSize) roSize.disconnect(); shell.dispose(); } };
  }

  g.OkieMotor.apps.register({ id: 'music', nameKey: 'app.music', name: 'Music', icon: 'music', color: '#1db954', order: 45, category: 'system', render: renderMusic });

  var CSS = [
    '.mu{--u:1px;--mu-a:#42586d;--mu-b:#2d3d4b;position:relative;display:flex;flex-direction:column;height:100%;min-height:380px;border-radius:30px;overflow:hidden;background:linear-gradient(170deg,var(--mu-a),var(--mu-b));transition:background .6s ease;color:#fff;}',
    '.mu-player{position:relative;display:flex;flex-direction:column;flex:1;min-height:0;padding:calc(20*var(--u)) calc(17*var(--u)) calc(30*var(--u));}.mu-player[hidden]{display:none;}',
    '.mu-top{display:flex;align-items:center;justify-content:space-between;flex:none;position:relative;z-index:3;}',
    '.mu-rb{width:max(42px,calc(50*var(--u)));height:max(42px,calc(50*var(--u)));border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.2);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#fff;}.mu-rb[hidden]{display:none;}',
    '.mu-pill{display:flex;align-items:center;height:max(42px,calc(50*var(--u)));border-radius:9999px;background:rgba(255,255,255,.2);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);}.mu-pill-b{display:grid;place-items:center;width:max(46px,calc(62*var(--u)));height:100%;border-radius:9999px;color:#fff;}.mu-pill-b:disabled{opacity:.4;}',
    '.mu-stage{position:relative;flex:1;min-height:0;margin:calc(-12*var(--u)) 0 calc(18*var(--u));}',
    '.mu-art{position:absolute;left:50%;top:0;transform:translateX(-50%);border-radius:calc(30*var(--u));overflow:hidden;background:rgba(255,255,255,.12);box-shadow:0 calc(18*var(--u)) calc(44*var(--u)) rgba(0,0,0,.32);z-index:1;}.mu-art[hidden]{display:none;}.mu-art img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:block;}.mu-art.noimg::before{content:"";position:absolute;inset:0;background:linear-gradient(150deg,rgba(255,255,255,.22),rgba(255,255,255,.05));}',
    '.mu-frost{display:none;position:absolute;left:0;right:0;bottom:0;height:46%;background:linear-gradient(to bottom,rgba(214,226,238,0),rgba(214,226,238,.42) 62%,rgba(214,226,238,.5));-webkit-backdrop-filter:blur(calc(14*var(--u))) saturate(1.1);backdrop-filter:blur(calc(14*var(--u))) saturate(1.1);-webkit-mask-image:linear-gradient(to bottom,transparent 0,#000 55%);mask-image:linear-gradient(to bottom,transparent 0,#000 55%);}',
    '.mu-info{position:absolute;left:calc(25*var(--u));right:calc(25*var(--u));bottom:calc(-6*var(--u));z-index:2;}',
    '.mu-ti{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;margin-bottom:calc(20*var(--u));}.mu-ti[hidden]{display:none;}.mu-txt{min-width:0;}',
    '.mu-t{font-size:max(20px,calc(36*var(--u)));font-weight:500;letter-spacing:0;line-height:1.1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-shadow:0 1px 10px rgba(0,0,0,.4),0 0 2px rgba(0,0,0,.2);}.mu-a{margin-top:calc(6*var(--u));font-size:max(15px,calc(25*var(--u)));font-weight:500;color:rgba(255,255,255,.9);text-shadow:0 1px 8px rgba(0,0,0,.45),0 0 2px rgba(0,0,0,.25);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.mu-more{flex:none;width:max(30px,calc(36*var(--u)));height:max(30px,calc(36*var(--u)));margin-bottom:calc(8*var(--u));border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.3);color:#fff;}',
    '.mu-bar{position:relative;height:calc(26*var(--u));min-height:20px;display:flex;align-items:center;cursor:pointer;touch-action:none;}.mu-bar.dis{cursor:default;}.mu-track{position:relative;width:100%;height:max(5px,calc(7.500*var(--u)));border-radius:9999px;background:rgba(255,255,255,.36);}.mu-track i{position:absolute;left:0;top:0;bottom:0;border-radius:9999px;background:#fff;width:0;}.mu-track b{position:absolute;top:50%;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.4);left:0;opacity:0;transition:opacity .15s ease;}.mu-bar:active b,.mu-bar:hover b{opacity:1;}.mu-bar.dis b{display:none;}',
    '.mu-vol{display:flex;align-items:center;gap:14px;width:100%;min-width:min(340px,72vw);box-sizing:border-box;padding:6px 0 4px;}.mu-vol .slider{flex:1;min-width:0;height:64px;}.mu-vol-b{flex:none;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.16);color:#fff;transition:background .2s,opacity .2s;}.mu-vol-b.on{background:rgba(255,255,255,.34);opacity:.55;}',
    '.mu-tm{display:flex;justify-content:space-between;font-size:max(12px,calc(18*var(--u)));color:rgba(255,255,255,.85);text-shadow:0 1px 6px rgba(0,0,0,.4);font-variant-numeric:tabular-nums;margin-top:calc(2*var(--u));}',
    '.mu-keys{flex:none;display:flex;align-items:center;justify-content:space-between;padding:0 calc(8*var(--u));}.mu-k{display:grid;place-items:center;width:max(48px,calc(84*var(--u)));height:max(48px,calc(70*var(--u)));color:#fff;border-radius:calc(20*var(--u));transition:background .15s ease,opacity .15s ease;}.mu-k svg{width:max(28px,calc(44*var(--u)));height:max(28px,calc(44*var(--u)));}.mu-k:hover{background:rgba(255,255,255,.08);}.mu-k:disabled{opacity:.35;}.mu-k.big{width:max(60px,calc(96*var(--u)));}.mu-k.big svg{width:max(34px,calc(52*var(--u)));height:max(34px,calc(52*var(--u)));}.mu-k.sm{width:max(44px,calc(58*var(--u)));}.mu-k.sm svg{width:max(26px,calc(32*var(--u)));height:max(26px,calc(32*var(--u)));}.mu-k.on{background:rgba(255,255,255,.9);color:#1d2a36;}',
    '.mu.flow .mu-stage{display:flex;flex-direction:column;align-items:center;justify-content:center;}.mu.flow .mu-art{position:relative;left:auto;top:auto;transform:none;flex:none;}.mu.flow .mu-info{position:relative;left:auto;right:auto;bottom:auto;width:100%;box-sizing:border-box;padding:0 calc(25*var(--u));margin-top:calc(14*var(--u));}',
    '.mu-ly{position:absolute;left:0;right:0;top:0;bottom:calc(64*var(--u));overflow-y:auto;scrollbar-width:none;padding:30px calc(25*var(--u)) 40px;-webkit-mask-image:linear-gradient(transparent 0,#000 7%,#000 88%,transparent 100%);mask-image:linear-gradient(transparent 0,#000 7%,#000 88%,transparent 100%);}.mu-ly::-webkit-scrollbar{display:none;}.mu-ly[hidden]{display:none;}',
    '.mu[data-lyrics="1"] .mu-info{bottom:0;}.mu[data-lyrics="1"].flow .mu-info{margin-top:0;}.mu[data-lyrics="1"] .mu-stage{display:block;}.mu[data-lyrics="1"].flow .mu-info{position:absolute;left:calc(25*var(--u));right:calc(25*var(--u));bottom:0;width:auto;padding:0;}',
    '.mu-lh{margin:0 0 14px;}.mu-lt b{display:block;font-size:15px;font-weight:600;}.mu-lt span{font-size:13px;color:rgba(255,255,255,.65);}',
    '.mu-ll{display:flex;flex-direction:column;gap:14px;padding:8px 4px 60%;}.mu-l{font-size:max(19px,calc(29*var(--u)));font-weight:700;line-height:1.2;letter-spacing:-.01em;color:rgba(255,255,255,.38);transition:color .35s ease;cursor:default;text-align:left;}.mu-l[role="button"]{cursor:pointer;}.mu-l.on{color:#fff;}.mu-l.past{color:rgba(255,255,255,.3);}.mu-l.gap{font-size:20px;letter-spacing:.3em;}',
    '.mu-lm{padding:24px 4px;font-size:17px;color:rgba(255,255,255,.7);}.mu-lm.small{padding:0 0 4px;font-size:13px;}',
    '.mu-setup{padding:26px 22px;display:flex;flex-direction:column;gap:12px;}.mu-setup[hidden]{display:none;}.mu-si{opacity:.7;}.mu-st{font-size:24px;font-weight:700;}.mu-setup p{margin:0;font-size:14px;line-height:1.5;color:rgba(255,255,255,.78);}.mu-setup ol{margin:0;padding-left:20px;display:flex;flex-direction:column;gap:8px;font-size:14px;line-height:1.45;color:rgba(255,255,255,.85);}.mu-sb{display:flex;flex-wrap:wrap;gap:10px;margin-top:4px;}.mu-sb .act{text-decoration:none;}',
    '.mu-here-b{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:9999px;background:rgba(255,255,255,.22);font-style:normal;font-size:11px;font-weight:600;letter-spacing:.02em;vertical-align:1px;}.mu-here{margin-top:6px;padding:14px 16px;border-radius:16px;background:rgba(255,255,255,.06);border:1px dashed rgba(255,255,255,.22);}.mu-here .t{font-size:14px;font-weight:700;margin-bottom:4px;}.mu-here p{margin:0 0 10px;font-size:12.5px;line-height:1.45;color:rgba(255,255,255,.75);}.mu-here .act{text-decoration:none;display:inline-block;}',
    '.mu-lx{position:absolute;top:0;right:calc(25*var(--u));z-index:4;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.22);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#fff;}.mu-lx[hidden]{display:none;}',
    '.mu-lf{--u:1px;position:fixed;inset:0;z-index:10001;display:flex;flex-direction:column;background:linear-gradient(170deg,var(--mu-a,#42586d),var(--mu-b,#2d3d4b));color:#fff;overflow:hidden;--lf:clamp(26px,5.4vmin,62px);-webkit-user-select:none;user-select:none;}.mu-lf[data-ui="0"]{cursor:none;}',
    '.mu-lfs{position:absolute;inset:0;overflow-y:auto;scrollbar-width:none;padding:calc(max(env(safe-area-inset-top,0px),18px) + 92px) max(7vw,26px) 0;-webkit-mask-image:linear-gradient(transparent 0,#000 12%,#000 82%,transparent 100%);mask-image:linear-gradient(transparent 0,#000 12%,#000 82%,transparent 100%);}.mu-lfs::-webkit-scrollbar{display:none;}',
    '.mu-lfl{display:flex;flex-direction:column;gap:calc(var(--lf)*.55);max-width:1100px;margin:0 auto;padding-bottom:55vh;}.mu-lf .mu-l{font-size:var(--lf);line-height:1.16;color:rgba(255,255,255,.34);}.mu-lf .mu-l.on{color:#fff;}.mu-lf .mu-l.past{color:rgba(255,255,255,.26);}.mu-lf .mu-l.gap{font-size:calc(var(--lf)*.6);}.mu-lf .mu-lm{font-size:calc(var(--lf)*.6);padding:0;}.mu-lf .mu-lm.small{font-size:calc(var(--lf)*.42);}',
    '.mu-lftop,.mu-lfui{position:absolute;left:0;right:0;z-index:2;transition:opacity .4s ease,transform .4s ease;}.mu-lftop{top:0;display:flex;align-items:center;gap:14px;padding:calc(max(env(safe-area-inset-top,0px),18px) + 4px) max(5vw,22px) 26px;background:linear-gradient(rgba(0,0,0,.28),transparent);}',
    '.mu-lftop img{width:52px;height:52px;border-radius:10px;object-fit:cover;flex:none;box-shadow:0 4px 14px rgba(0,0,0,.3);}.mu-lftop img[hidden]{display:none;}.mu-lftx{flex:1;min-width:0;}.mu-lt1{font-size:18px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.mu-lt2{font-size:14px;color:rgba(255,255,255,.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.mu-lfb{flex:none;width:48px;height:48px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.22);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#fff;}',
    '.mu-lfui{bottom:0;padding:34px max(7vw,26px) calc(max(env(safe-area-inset-bottom,0px),18px) + 12px);background:linear-gradient(transparent,rgba(0,0,0,.34));}.mu-lfui .mu-tm{font-size:13px;}.mu-lfk{display:flex;align-items:center;justify-content:center;gap:clamp(20px,6vw,64px);margin-top:4px;}',
    '.mu-lf[data-ui="0"] .mu-lftop{opacity:0;transform:translateY(-14px);pointer-events:none;}.mu-lf[data-ui="0"] .mu-lfui{opacity:0;transform:translateY(14px);pointer-events:none;}',
    '.mu-dev{display:flex;flex-direction:column;gap:8px;}.mu-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:13px 16px;border-radius:16px;background:rgba(255,255,255,.08);text-align:left;font-size:15px;}.mu-row.on{background:rgba(255,255,255,.2);font-weight:600;}.mu-ri{display:grid;margin-right:4px;}.mu-vol{padding:6px 4px 10px;}',
    // the library
    '.mu-cta{display:none;position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:2;align-items:center;gap:8px;padding:13px 22px;border-radius:9999px;background:#1db954;color:#06210f;font-size:15px;font-weight:700;white-space:nowrap;box-shadow:0 6px 18px rgba(0,0,0,.35);}.mu[data-empty="1"] .mu-cta{display:inline-flex;}.mu-cta svg{width:20px;height:20px;}',
    '.mu-lib{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;border-radius:inherit;overflow:hidden;background:linear-gradient(170deg,var(--mu-a),var(--mu-b));color:#fff;}',
    '.mu-lh2{flex:none;display:flex;align-items:center;gap:10px;padding:14px 14px 8px;}.mu-lb{flex:none;width:44px;height:44px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.2);color:#fff;}.mu-lt0{flex:1;min-width:0;font-size:20px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.mu-lacts{display:flex;gap:8px;flex:none;}',
    '.mu-chip{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 15px;border-radius:9999px;background:rgba(255,255,255,.2);color:#fff;font-size:14px;font-weight:600;white-space:nowrap;}.mu-chip.pri{background:#fff;color:#14301f;}.mu-chip svg{flex:none;}',
    '.mu-ls{flex:none;display:flex;align-items:center;justify-content:space-between;gap:10px;margin:0 14px 6px;padding:6px 6px 6px 12px;border-radius:14px;background:rgba(255,255,255,.1);font-size:13px;color:rgba(255,255,255,.85);}.mu-lsb{min-height:32px;text-align:left;color:inherit;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.mu-lbody{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:6px 14px 14px;}',
    '.mu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(132px,1fr));gap:16px 12px;}.mu-tile{cursor:pointer;min-width:0;}.mu-tc{position:relative;aspect-ratio:1;border-radius:14px;overflow:hidden;background:rgba(255,255,255,.12);display:grid;place-items:center;}.mu-tc img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}.mu-tn{margin-top:6px;font-size:13px;font-weight:600;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}',
    '.mu-tp{position:absolute;right:8px;bottom:8px;width:40px;height:40px;border-radius:50%;display:grid;place-items:center;background:#1db954;color:#06210f;box-shadow:0 3px 10px rgba(0,0,0,.4);}',
    '.mu-list{display:flex;flex-direction:column;gap:6px;}.mu-lr{justify-content:flex-start;gap:12px;padding:8px 10px;cursor:pointer;min-height:56px;}.mu-rc{position:relative;flex:none;width:44px;height:44px;border-radius:8px;overflow:hidden;display:grid;place-items:center;background:rgba(255,255,255,.12);}.mu-rc img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;}.mu-rt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:15px;}.mu-lr .mu-tp{position:static;width:38px;height:38px;flex:none;}.mu-chev{flex:none;opacity:.6;display:grid;}.mu-ph{display:grid;place-items:center;color:rgba(255,255,255,.7);}',
    '.mu-mini{flex:none;display:flex;align-items:center;gap:12px;margin:0 12px 12px;padding:8px 10px;border-radius:18px;background:rgba(0,0,0,.28);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);cursor:pointer;}.mu-mini>img,.mu-mini>.mu-ph{flex:none;width:44px;height:44px;border-radius:8px;object-fit:cover;background:rgba(255,255,255,.12);}.mu-mt{flex:1;min-width:0;}.mu-mt b{display:block;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.mu-mt span{display:block;font-size:12px;color:rgba(255,255,255,.7);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.mu-mini .mu-k{flex:none;width:48px;height:48px;}',
    '.mu-lib>.mu-gate{flex:1;min-height:0;}.mu-gate,.mu-sleep{padding:18px 18px 22px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;}.mu-sleep{flex:none;margin:0 14px 8px;padding:14px 16px;border-radius:16px;background:rgba(0,0,0,.28);gap:6px;}.mu-gate .t,.mu-sleep .t{font-size:22px;font-weight:700;}.mu-sleep .t{font-size:16px;}.mu-gate p,.mu-sleep p{margin:0;font-size:14px;line-height:1.5;color:rgba(255,255,255,.8);}.mu-gb{display:flex;flex-wrap:wrap;gap:10px;margin-top:2px;}.mu-gb .act{text-decoration:none;}.mu-relog{align-self:flex-start;font-size:13px;color:rgba(255,255,255,.75);text-decoration:underline;padding:6px 0;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
})(typeof globalThis !== 'undefined' ? globalThis : window);

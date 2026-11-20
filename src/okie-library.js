/* okie-library: "My library" as a second source of the Music screen. Your own music on a Navidrome server (or any Subsonic server) next to Spotify.
 *
 * The server speaks the Subsonic API. The card talks to it directly (https, with the CORS headers the server's proxy adds) and plays the songs itself with an
 * <audio> element, so no Home Assistant integration or media player is involved. The music screen only needs a "player" that looks like a Home Assistant
 * media_player (a state with attributes, a call(service, data) and a browse answer shaped like media_player/browse_media), so everything it already draws
 * (the picture, the bar, the keys, lyrics, the library grid) works for both sources.
 *
 * Login: the password is typed once, turned into the Subsonic token (md5(password + salt)) and thrown away; only the user name, the salt and the token are kept.
 * The player lives for as long as the page does, so a song keeps playing when you leave the Music screen.
 *
 * The rules (token, URLs, browse answers, queue, shuffle, repeat) are pure and unit-tested with a fake <audio> and a fake fetch.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  var TYPE = 'okie-library';
  // media_player supported_features bits (the same ones okie-music.js reads)
  var BIT = { pause: 1, seek: 2, volume: 4, mute: 8, prev: 16, next: 32, playMedia: 512, play: 16384, shuffle: 32768, browse: 131072, repeat: 262144 };

  // ---------------------------------------------------------------- md5 (the Subsonic token is md5(password + salt))
  function utf8(str) {
    if (typeof TextEncoder !== 'undefined') return Array.prototype.slice.call(new TextEncoder().encode(String(str)));
    var s = unescape(encodeURIComponent(String(str))), out = []; for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i)); return out;
  }
  var MD5_S = [7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21];
  var MD5_K = []; for (var ki = 0; ki < 64; ki++) MD5_K[ki] = Math.floor(Math.abs(Math.sin(ki + 1)) * 4294967296) | 0;
  function md5(str) {
    var bytes = utf8(str), len = bytes.length, total = (((len + 8) >> 6) + 1) * 64, buf = new Array(total), i, j;
    for (i = 0; i < total; i++) buf[i] = 0;
    for (i = 0; i < len; i++) buf[i] = bytes[i];
    buf[len] = 0x80;
    var bits = len * 8, lo = bits >>> 0, hi = Math.floor(bits / 4294967296);
    for (i = 0; i < 4; i++) { buf[total - 8 + i] = (lo >>> (8 * i)) & 255; buf[total - 4 + i] = (hi >>> (8 * i)) & 255; }
    var a0 = 0x67452301 | 0, b0 = 0xefcdab89 | 0, c0 = 0x98badcfe | 0, d0 = 0x10325476 | 0;
    for (var off = 0; off < total; off += 64) {
      var M = []; for (j = 0; j < 16; j++) M[j] = buf[off + j * 4] | (buf[off + j * 4 + 1] << 8) | (buf[off + j * 4 + 2] << 16) | (buf[off + j * 4 + 3] << 24);
      var A = a0, B = b0, C = c0, D = d0;
      for (i = 0; i < 64; i++) {
        var F, gi;
        if (i < 16) { F = (B & C) | (~B & D); gi = i; } else if (i < 32) { F = (D & B) | (~D & C); gi = (5 * i + 1) % 16; } else if (i < 48) { F = B ^ C ^ D; gi = (3 * i + 5) % 16; } else { F = C ^ (B | ~D); gi = (7 * i) % 16; }
        F = (F + A + MD5_K[i] + M[gi]) | 0;
        A = D; D = C; C = B; B = (B + ((F << MD5_S[i]) | (F >>> (32 - MD5_S[i])))) | 0;
      }
      a0 = (a0 + A) | 0; b0 = (b0 + B) | 0; c0 = (c0 + C) | 0; d0 = (d0 + D) | 0;
    }
    var hex = ''; [a0, b0, c0, d0].forEach(function (w) { for (var k = 0; k < 4; k++) hex += ('0' + ((w >>> (8 * k)) & 255).toString(16)).slice(-2); });
    return hex;
  }

  // ---------------------------------------------------------------- the server address and the login
  /** What you typed -> the server's base address: https:// added when missing, no trailing slash, no /rest. '' when empty. */
  function normUrl(raw) {
    var s = String(raw == null ? '' : raw).trim(); if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    return s.replace(/\/rest(\/.*)?$/i, '').replace(/\/+$/, '');
  }
  function newSalt() {
    var hex = '', c = g.crypto || (typeof globalThis !== 'undefined' && globalThis.crypto);
    try { var u = new Uint8Array(8); c.getRandomValues(u); for (var i = 0; i < u.length; i++) hex += ('0' + u[i].toString(16)).slice(-2); return hex; } catch (e) { /* no crypto: fall back */ }
    for (var j = 0; j < 16; j++) hex += Math.floor(Math.random() * 16).toString(16); return hex;
  }
  /** user + password -> { u, s, t }. The password is not part of the answer. */
  function authFor(user, password, salt) { var s = salt || newSalt(); return { u: String(user == null ? '' : user).trim(), s: s, t: md5(String(password == null ? '' : password) + s) }; }
  function validConfig(c) { return !!(c && typeof c === 'object' && /^https?:\/\//.test(c.url || '') && c.u && c.t && c.s); }

  var enc = encodeURIComponent;
  function query(cfg, params) {
    var q = ['u=' + enc(cfg.u), 't=' + enc(cfg.t), 's=' + enc(cfg.s), 'v=1.16.1', 'c=okie', 'f=json'];
    Object.keys(params || {}).forEach(function (k) { var v = params[k]; if (v == null) return; (Array.isArray(v) ? v : [v]).forEach(function (x) { q.push(enc(k) + '=' + enc(x)); }); });
    return q.join('&');
  }
  function apiUrl(cfg, method, params) { return cfg.url + '/rest/' + method + '.view?' + query(cfg, params); }
  function coverUrl(cfg, id, size) { return id ? apiUrl(cfg, 'getCoverArt', { id: id, size: size || 300 }) : ''; }
  /** The original file, never transcoded. */
  function streamUrl(cfg, id) { return apiUrl(cfg, 'stream', { id: id, format: 'raw' }); }

  function fail(kind, msg) { var e = new Error(msg || kind); e.kind = kind; return e; }
  /** A Subsonic answer -> its payload, or an error with kind 'login' (wrong user or password) or 'other'. */
  function unwrap(j) {
    var r = j && j['subsonic-response'];
    if (!r || typeof r !== 'object') throw fail('other', 'no answer');
    if (r.status !== 'ok') { var code = r.error && r.error.code; throw fail(code === 40 || code === 41 || code === 44 ? 'login' : 'other', (r.error && r.error.message) || 'failed'); }
    return r;
  }
  /** One API call -> Promise of the payload. kind 'net' when the server cannot be reached at all (also what a blocked certificate or CORS looks like). */
  function call(cfg, method, params, fetchFn) {
    var f = fetchFn || (g.fetch && g.fetch.bind(g));
    if (!f) return Promise.reject(fail('net', 'no fetch'));
    return Promise.resolve().then(function () { return f(apiUrl(cfg, method, params)); }).then(
      function (res) { if (!res || !res.ok) throw fail(res && res.status === 401 ? 'login' : 'other', 'http ' + (res && res.status)); return res.json(); },
      function () { throw fail('net', 'unreachable'); }
    ).then(unwrap);
  }
  /** The login form: check the address and the password with a ping, then keep only { url, u, t, s }. */
  function connect(rawUrl, user, password, fetchFn) {
    var url = normUrl(rawUrl); if (!url) return Promise.reject(fail('url', 'no address'));
    if (!String(user || '').trim()) return Promise.reject(fail('login', 'no user'));
    var cfg = Object.assign({ url: url }, authFor(user, password));
    return call(cfg, 'ping', {}, fetchFn).then(function () { return cfg; });
  }

  // ---------------------------------------------------------------- songs and the browse answers (shaped like media_player/browse_media)
  function song(s) { return { id: String(s.id), title: String(s.title || ''), artist: String(s.artist || ''), album: String(s.album || ''), cover: s.coverArt != null ? String(s.coverArt) : '', duration: +s.duration || 0, starred: !!s.starred }; }
  function listOf(x) { return Array.isArray(x) ? x : x ? [x] : []; }
  function node(title, id, o) {
    o = o || {};
    return { title: title, media_content_id: id, media_content_type: TYPE, media_class: o.cls || 'directory', children_media_class: o.kids || 'directory', can_play: !!o.play, can_expand: o.expand !== false, thumbnail: o.thumb || '' };
  }
  var DEFAULT_LABELS = { root: 'My library', playlists: 'Playlists', starred: 'Liked songs', newest: 'Recently added', frequent: 'Most played', recent: 'Recently played', albums: 'All albums', artists: 'Artists', random: 'Random mix' };
  function rootNode(labels) {
    var L = Object.assign({}, DEFAULT_LABELS, labels || {}), n = node(L.root, 'root', { kids: 'directory' });
    n.children = [
      node(L.playlists, 'playlists', { kids: 'playlist' }),
      node(L.starred, 'starred', { kids: 'track', play: true }),
      node(L.newest, 'albums:newest', { kids: 'album' }),
      node(L.frequent, 'albums:frequent', { kids: 'album' }),
      node(L.recent, 'albums:recent', { kids: 'album' }),
      node(L.albums, 'albums:alphabeticalByName', { kids: 'album' }),
      node(L.artists, 'artists', { kids: 'artist' }),
      node(L.random, 'random', { cls: 'track', play: true, expand: false }),
    ];
    return n;
  }
  /** The songs behind a list id: 'playlist:ID', 'album:ID', 'starred', 'random'. Promise of { title, songs }. */
  function songsFor(cfg, id, fetchFn) {
    var m = /^(playlist|album):(.+)$/.exec(id);
    if (m && m[1] === 'playlist') return call(cfg, 'getPlaylist', { id: m[2] }, fetchFn).then(function (r) { var p = r.playlist || {}; return { title: p.name || '', songs: listOf(p.entry).map(song) }; });
    if (m) return call(cfg, 'getAlbum', { id: m[2] }, fetchFn).then(function (r) { var a = r.album || {}; return { title: a.name || '', songs: listOf(a.song).map(song) }; });
    if (id === 'starred') return call(cfg, 'getStarred2', {}, fetchFn).then(function (r) { return { title: '', songs: listOf((r.starred2 || {}).song).map(song) }; });
    if (id === 'random') return call(cfg, 'getRandomSongs', { size: 60 }, fetchFn).then(function (r) { return { title: '', songs: listOf((r.randomSongs || {}).song).map(song) }; });
    return Promise.reject(fail('other', 'unknown list ' + id));
  }
  function songNode(cfg, s, ctxId, withArtist) {
    return node(withArtist && s.artist ? s.title + ' · ' + s.artist : s.title, 'song:' + s.id + (ctxId ? '|' + ctxId : ''), { cls: 'track', kids: 'track', play: true, expand: false, thumb: coverUrl(cfg, s.cover, 120) });
  }
  function albumNode(cfg, a, withArtist) {
    var title = String(a.name || a.title || ''), artist = String(a.artist || '');
    return node(withArtist && artist ? title + ' · ' + artist : title, 'album:' + a.id, { cls: 'album', kids: 'track', play: true, thumb: coverUrl(cfg, a.coverArt != null ? String(a.coverArt) : '', 300) });
  }
  /** One level of the library -> Promise of a browse answer (title, children, ...). */
  function browse(cfg, id, labels, fetchFn) {
    id = id || 'root';
    if (id === 'root') return Promise.resolve(rootNode(labels));
    var L = Object.assign({}, DEFAULT_LABELS, labels || {}), m;
    if (id === 'playlists') return call(cfg, 'getPlaylists', {}, fetchFn).then(function (r) {
      var n = node(L.playlists, id, { kids: 'playlist' });
      n.children = listOf((r.playlists || {}).playlist).map(function (p) { return node(String(p.name || ''), 'playlist:' + p.id, { cls: 'playlist', kids: 'track', play: true, thumb: coverUrl(cfg, p.coverArt != null ? String(p.coverArt) : '', 300) }); });
      return n;
    });
    if ((m = /^albums:(newest|frequent|recent|alphabeticalByName|random)$/.exec(id))) return call(cfg, 'getAlbumList2', { type: m[1], size: m[1] === 'alphabeticalByName' ? 500 : 60 }, fetchFn).then(function (r) {
      var n = node(L[m[1] === 'alphabeticalByName' ? 'albums' : m[1]] || L.albums, id, { kids: 'album' });
      n.children = listOf((r.albumList2 || {}).album).map(function (a) { return albumNode(cfg, a, true); });
      return n;
    });
    if (id === 'artists') return call(cfg, 'getArtists', {}, fetchFn).then(function (r) {
      var n = node(L.artists, id, { kids: 'artist' }), kids = [];
      listOf((r.artists || {}).index).forEach(function (ix) { listOf(ix.artist).forEach(function (a) { kids.push(node(String(a.name || ''), 'artist:' + a.id, { cls: 'artist', kids: 'album', thumb: coverUrl(cfg, a.coverArt != null ? String(a.coverArt) : '', 300) })); }); });
      n.children = kids; return n;
    });
    if ((m = /^artist:(.+)$/.exec(id))) return call(cfg, 'getArtist', { id: m[1] }, fetchFn).then(function (r) {
      var a = r.artist || {}, n = node(String(a.name || ''), id, { cls: 'artist', kids: 'album' });
      n.children = listOf(a.album).map(function (x) { return albumNode(cfg, x, false); }); return n;
    });
    if (/^(playlist|album):/.test(id) || id === 'starred') return songsFor(cfg, id, fetchFn).then(function (r) {
      var isAlbum = /^album:/.test(id), n = node(r.title || L.starred, id, { cls: isAlbum ? 'album' : 'playlist', kids: 'track', play: true });
      n.children = r.songs.map(function (s) { return songNode(cfg, s, id, !isAlbum); }); return n;
    });
    return Promise.reject(fail('other', 'unknown id ' + id));
  }
  /** What a play_media id means -> Promise of { songs, start }. 'song:ID|CTX' plays the song inside the list it was picked from. */
  function resolvePlay(cfg, id, fetchFn) {
    var m = /^song:([^|]+)(?:\|(.+))?$/.exec(id);
    if (m) {
      if (!m[2]) return call(cfg, 'getSong', { id: m[1] }, fetchFn).then(function (r) { return { songs: [song(r.song || { id: m[1] })], start: 0 }; });
      return songsFor(cfg, m[2], fetchFn).then(function (r) { var at = 0; r.songs.forEach(function (s, i) { if (s.id === m[1]) at = i; }); return { songs: r.songs, start: at }; });
    }
    return songsFor(cfg, id, fetchFn).then(function (r) { return { songs: r.songs, start: 0 }; });
  }

  // ---------------------------------------------------------------- the player
  function shuffled(n, first) {
    var a = []; for (var i = 0; i < n; i++) a.push(i);
    for (var j = n - 1; j > 0; j--) { var k = Math.floor(Math.random() * (j + 1)), t = a[j]; a[j] = a[k]; a[k] = t; }
    if (first != null && first >= 0) { var at = a.indexOf(first); if (at > 0) { a.splice(at, 1); a.unshift(first); } }
    return a;
  }
  function Player(cfg, o) {
    o = o || {};
    var self = this, audio = o.audio || new g.Audio(), fetchFn = o.fetch, nav = o.navigator !== undefined ? o.navigator : g.navigator;
    var listeners = [], errListeners = [], queue = [], order = [], pos = -1, shuffle = false, repeat = 'off', stars = {}, errRun = 0, scrobbled = '', volumeOk = false;
    audio.preload = 'auto';
    try { var v0 = audio.volume; audio.volume = 0.5; volumeOk = audio.volume === 0.5; audio.volume = v0; } catch (e) { volumeOk = false; }      // iOS keeps the volume to the buttons on the side: the slider is hidden there

    function cur() { return pos >= 0 && order[pos] != null ? queue[order[pos]] || null : null; }
    function emit() { listeners.slice().forEach(function (fn) { try { fn(); } catch (e) { /* a listener must not stop the player */ } }); }
    function emitErr(k) { errListeners.slice().forEach(function (fn) { try { fn(k); } catch (e) { /* same */ } }); }
    function ping(method, params) { try { call(cfg, method, params, fetchFn).catch(function () { /* play counts are nice to have */ }); } catch (e) { /* same */ } }
    function submit() { var s = cur(); if (s && scrobbled !== s.id && (audio.currentTime >= 30 || audio.currentTime >= (audio.duration || s.duration || 1e9) / 2)) { scrobbled = s.id; ping('scrobble', { id: s.id, submission: 'true', time: Date.now() }); } }
    function sessionInfo() {
      var s = cur(), ms = nav && nav.mediaSession; if (!ms) return;
      try {
        if (s && g.MediaMetadata) ms.metadata = new g.MediaMetadata({ title: s.title, artist: s.artist, album: s.album, artwork: s.cover ? [{ src: coverUrl(cfg, s.cover, 512), sizes: '512x512' }] : [] });
        ms.playbackState = !s ? 'none' : audio.paused ? 'paused' : 'playing';
      } catch (e) { /* the lock screen is a bonus */ }
    }
    function load() {
      var s = cur(); if (!s) { audio.pause(); return Promise.resolve(); }
      audio.src = streamUrl(cfg, s.id); scrobbled = '';
      ping('scrobble', { id: s.id, submission: 'false' });
      var p = audio.play(); sessionInfo(); emit();
      return p && p.catch ? p.catch(function () { /* the browser asks for a tap first: the play key then works */ }) : Promise.resolve();
    }
    function rebuild(first) { order = shuffle ? shuffled(queue.length, first) : queue.map(function (_, i) { return i; }); pos = shuffle ? 0 : (first != null ? first : 0); }
    function step(dir, auto) {
      if (!queue.length) return;
      submit();
      var n = pos + dir;
      if (n >= order.length) {
        if (repeat === 'all') n = 0;
        else if (auto) { audio.pause(); try { audio.currentTime = 0; } catch (e) { /* nothing to rewind */ } emit(); return; }      // the list is over
        else return;      // the Next key on the last song does nothing
      }
      if (n < 0) n = repeat === 'all' ? order.length - 1 : 0;
      pos = n; load();
    }
    audio.addEventListener('ended', function () { errRun = 0; if (repeat === 'one') { submit(); try { audio.currentTime = 0; } catch (e) { /* ok */ } scrobbled = ''; audio.play(); emit(); return; } step(1, true); });
    audio.addEventListener('error', function () {
      if (!cur() || !audio.src) return;
      errRun++; emitErr('play');
      if (errRun < 3 && pos + 1 < order.length) setTimeout(function () { step(1, true); }, 500); else { audio.pause(); emit(); }
    });
    ['play', 'pause', 'loadedmetadata', 'durationchange', 'playing'].forEach(function (ev) { audio.addEventListener(ev, function () { if (ev === 'playing') errRun = 0; sessionInfo(); emit(); }); });
    if (nav && nav.mediaSession) {
      var h = function (a, fn) { try { nav.mediaSession.setActionHandler(a, fn); } catch (e) { /* not supported */ } };
      h('play', function () { self.call('media_play'); }); h('pause', function () { self.call('media_pause'); });
      h('nexttrack', function () { self.call('media_next_track'); }); h('previoustrack', function () { self.call('media_previous_track'); });
      h('seekto', function (d) { if (d && d.seekTime != null) self.call('media_seek', { seek_position: d.seekTime }); });
    }

    /** Play a list of songs from index `start`; `wantShuffle` (true/false) sets shuffle, null keeps it. */
    this.playSongs = function (songs, start, wantShuffle) {
      if (!songs || !songs.length) return Promise.resolve();
      queue = songs.slice(); songs.forEach(function (s) { stars[s.id] = !!s.starred; });
      if (wantShuffle != null) shuffle = !!wantShuffle;
      rebuild(start || 0); return load();
    };
    /** Home Assistant style services, so the music screen drives this like any media_player. */
    this.call = function (svc, d) {
      d = d || {};
      switch (svc) {
        case 'media_play': { var p = audio.play(); return p && p.catch ? p.catch(function () { /* wait for a tap */ }) : Promise.resolve(); }
        case 'media_pause': audio.pause(); return Promise.resolve();
        case 'media_next_track': step(1, false); return Promise.resolve();
        case 'media_previous_track': if (audio.currentTime > 3 || pos <= 0) { try { audio.currentTime = 0; } catch (e) { /* ok */ } emit(); } else step(-1, false); return Promise.resolve();
        case 'media_seek': try { audio.currentTime = Math.max(0, +d.seek_position || 0); } catch (e) { /* not seekable yet */ } emit(); return Promise.resolve();
        case 'volume_set': if (volumeOk) audio.volume = Math.max(0, Math.min(1, +d.volume_level || 0)); emit(); return Promise.resolve();
        case 'volume_mute': audio.muted = !!d.is_volume_muted; emit(); return Promise.resolve();
        case 'shuffle_set': { var c = cur(), want = !!d.shuffle; if (want !== shuffle) { shuffle = want; if (queue.length) { var at = c ? queue.indexOf(c) : 0; order = shuffle ? shuffled(queue.length, at) : queue.map(function (_, i) { return i; }); pos = shuffle ? 0 : Math.max(0, at); } } emit(); return Promise.resolve(); }
        case 'repeat_set': repeat = d.repeat === 'all' || d.repeat === 'one' ? d.repeat : 'off'; emit(); return Promise.resolve();
        case 'play_media': return resolvePlay(cfg, String(d.media_content_id || ''), fetchFn).then(function (r) { return self.playSongs(r.songs, r.start, null); });
        default: return Promise.resolve();
      }
    };
    this.browse = function (id, labels) { return browse(cfg, id, labels, fetchFn); };
    this.isStarred = function () { var s = cur(); return !!(s && stars[s.id]); };
    /** Like or unlike the song that plays. Promise of the new state. */
    this.toggleStar = function () {
      var s = cur(); if (!s) return Promise.resolve(false);
      var on = !stars[s.id]; stars[s.id] = on; emit();
      return call(cfg, on ? 'star' : 'unstar', { id: s.id }, fetchFn).then(function () { return on; }, function () { stars[s.id] = !on; emit(); throw fail('other', 'star failed'); });
    };
    this.current = cur;
    this.queueLength = function () { return queue.length; };
    this.onChange = function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; };
    this.onError = function (fn) { errListeners.push(fn); return function () { errListeners = errListeners.filter(function (x) { return x !== fn; }); }; };
    this.coverFor = function (s, size) { return s ? coverUrl(cfg, s.cover, size) : ''; };
    this.stop = function () { audio.pause(); queue = []; order = []; pos = -1; try { audio.removeAttribute('src'); audio.load(); } catch (e) { /* ok */ } sessionInfo(); emit(); };
    /** A media_player look-alike for okie-music.js. */
    this.state = function () {
      var s = cur(), dur = audio.duration, a = { source: '', source_list: [] };
      var feats = BIT.pause | BIT.play | BIT.seek | BIT.mute | BIT.prev | BIT.next | BIT.playMedia | BIT.shuffle | BIT.repeat | BIT.browse | (volumeOk ? BIT.volume : 0);
      a.supported_features = feats; a.shuffle = shuffle; a.repeat = repeat; a.volume_level = audio.volume; a.is_volume_muted = !!audio.muted;
      if (s) {
        a.media_title = s.title; a.media_artist = s.artist; a.media_album_name = s.album; a.entity_picture = coverUrl(cfg, s.cover, 600);
        a.media_duration = isFinite(dur) && dur > 0 ? dur : s.duration; a.media_position = audio.currentTime || 0; a.media_position_updated_at = new Date().toISOString();
      }
      return { state: !s ? 'idle' : audio.paused ? 'paused' : 'playing', attributes: a };
    };
  }

  // ---------------------------------------------------------------- one player for the whole page
  var shared = null;
  /** The player for this login; a song keeps playing when the Music screen is closed and opened again. A different login replaces it. */
  function playerFor(cfg, o) {
    var key = cfg.url + '|' + cfg.u + '|' + cfg.t;
    if (shared && shared.key === key) return shared.player;
    if (shared) shared.player.stop();
    shared = { key: key, player: new Player(cfg, o) }; return shared.player;
  }
  function dropPlayer() { if (shared) { shared.player.stop(); shared = null; } }

  var api = { md5: md5, normUrl: normUrl, authFor: authFor, validConfig: validConfig, apiUrl: apiUrl, coverUrl: coverUrl, streamUrl: streamUrl, unwrap: unwrap, call: call, connect: connect, rootNode: rootNode, browse: browse, songsFor: songsFor, resolvePlay: resolvePlay, Player: Player, playerFor: playerFor, dropPlayer: dropPlayer, shuffled: shuffled, TYPE: TYPE, BIT: BIT, DEFAULT_LABELS: DEFAULT_LABELS };
  if (isNode) { module.exports = api; return; }
  g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.library = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

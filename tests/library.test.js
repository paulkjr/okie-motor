'use strict';
const test = require('node:test'), assert = require('node:assert/strict'), crypto = require('node:crypto');
const L = require('../src/okie-library.js');
const M = require('../src/okie-music.js');

// ---- a fake <audio> and a fake Subsonic server
class FakeAudio {
  constructor() { this.src = ''; this.paused = true; this.currentTime = 0; this.duration = NaN; this.muted = false; this._v = 1; this.ev = {}; this.plays = 0; }
  get volume() { return this._v; } set volume(x) { this._v = x; }
  addEventListener(n, fn) { (this.ev[n] = this.ev[n] || []).push(fn); }
  fire(n) { (this.ev[n] || []).forEach(f => f()); }
  play() { this.paused = false; this.plays++; this.fire('play'); return Promise.resolve(); }
  pause() { this.paused = true; this.fire('pause'); }
  removeAttribute() { this.src = ''; } load() {}
}
class IosAudio extends FakeAudio { get volume() { return 1; } set volume(x) { /* iOS ignores it */ } }
const cfg = { url: 'https://h.example:8451', u: 'alex', t: 'tok', s: 'salt' };
const SONGS = [1, 2, 3].map(i => ({ id: 's' + i, title: 'Song ' + i, artist: 'Band', album: 'Rec', coverArt: 'al-1', duration: 100 + i }));
function server(calls) {
  return async function (url) {
    const u = new URL(url); calls.push(u.pathname.replace('/rest/', '').replace('.view', '') + (u.searchParams.get('id') ? ':' + u.searchParams.get('id') : ''));
    const m = u.pathname.replace('/rest/', '').replace('.view', ''), ok = body => ({ ok: true, status: 200, json: async () => ({ 'subsonic-response': Object.assign({ status: 'ok', version: '1.16.1' }, body) }) });
    if (u.searchParams.get('t') === 'bad') return ok({ status: 'failed', error: { code: 40, message: 'Wrong username or password' } });
    if (m === 'ping') return ok({});
    if (m === 'getPlaylists') return ok({ playlists: { playlist: [{ id: 'p1', name: 'Run', coverArt: 'pl-p1' }, { id: 'p2', name: 'Chill' }] } });
    if (m === 'getPlaylist') return ok({ playlist: { id: 'p1', name: 'Run', entry: SONGS } });
    if (m === 'getAlbum') return ok({ album: { id: 'al1', name: 'Rec', song: SONGS } });
    if (m === 'getAlbumList2') return ok({ albumList2: { album: [{ id: 'al1', name: 'Rec', artist: 'Band', coverArt: 'al-1' }, { id: 'al2', name: 'Solo', artist: 'One' }] } });
    if (m === 'getArtists') return ok({ artists: { index: [{ name: 'B', artist: [{ id: 'ar1', name: 'Band' }] }, { name: 'O', artist: { id: 'ar2', name: 'One' } }] } });
    if (m === 'getArtist') return ok({ artist: { id: 'ar1', name: 'Band', album: [{ id: 'al1', name: 'Rec', coverArt: 'al-1' }] } });
    if (m === 'getStarred2') return ok({ starred2: { song: [Object.assign({}, SONGS[1], { starred: '2026-01-01' })] } });
    if (m === 'getRandomSongs') return ok({ randomSongs: { song: SONGS } });
    if (m === 'getSong') return ok({ song: SONGS[2] });
    if (m === 'star' || m === 'unstar' || m === 'scrobble') return ok({});
    return { ok: false, status: 404, json: async () => ({}) };
  };
}

test('md5 matches the reference values and Node\'s own md5 (also for accents and long strings)', () => {
  assert.equal(L.md5(''), 'd41d8cd98f00b204e9800998ecf8427e');
  assert.equal(L.md5('abc'), '900150983cd24fb0d6963f7d28e17f72');
  assert.equal(L.md5('The quick brown fox jumps over the lazy dog'), '9e107d9d372bb6826bd81d3542a419d6');
  for (const s of ['pässwörd123', 'ñ漢字🎵', 'x'.repeat(55), 'x'.repeat(56), 'x'.repeat(64), 'x'.repeat(1000), 'a'.repeat(119)]) assert.equal(L.md5(s), crypto.createHash('md5').update(s).digest('hex'), s.slice(0, 12));
});

test('the token is md5(password + salt) and the password is not kept', () => {
  const a = L.authFor(' alex ', 'sesame', 'c19b2d');
  assert.deepEqual(a, { u: 'alex', s: 'c19b2d', t: crypto.createHash('md5').update('sesamec19b2d').digest('hex') });
  assert.ok(!JSON.stringify(a).includes('sesame'));
  const b = L.authFor('alex', 'sesame'); assert.match(b.s, /^[0-9a-f]{16}$/); assert.equal(b.t, L.md5('sesame' + b.s));
});

test('the server address you type is cleaned up', () => {
  assert.equal(L.normUrl('home.example.org:8451/'), 'https://home.example.org:8451');
  assert.equal(L.normUrl(' https://x.y/rest/ping.view '), 'https://x.y');
  assert.equal(L.normUrl('http://10.0.0.5:4533///'), 'http://10.0.0.5:4533');
  assert.equal(L.normUrl('   '), ''); assert.equal(L.normUrl(null), '');
});

test('URLs carry the login, the client name and json; streams are never transcoded; no cover id means no cover URL', () => {
  const u = new URL(L.streamUrl(cfg, 'a b'));
  assert.equal(u.origin, 'https://h.example:8451'); assert.equal(u.pathname, '/rest/stream.view');
  assert.equal(u.searchParams.get('u'), 'alex'); assert.equal(u.searchParams.get('t'), 'tok'); assert.equal(u.searchParams.get('s'), 'salt');
  assert.equal(u.searchParams.get('c'), 'okie'); assert.equal(u.searchParams.get('f'), 'json'); assert.equal(u.searchParams.get('id'), 'a b'); assert.equal(u.searchParams.get('format'), 'raw');
  assert.equal(L.coverUrl(cfg, '', 300), ''); assert.equal(new URL(L.coverUrl(cfg, 'al-1', 120)).searchParams.get('size'), '120');
  assert.ok(L.validConfig(cfg)); assert.ok(!L.validConfig({ url: 'x', u: 'a', t: 'b', s: 'c' })); assert.ok(!L.validConfig(null));
});

test('connect: a good login keeps only url, user, salt and token; a wrong one says login; an unreachable server says net', async () => {
  const calls = [], f = server(calls);
  const ok = await L.connect('h.example:8451', 'alex', 'sesame', f);
  assert.deepEqual(Object.keys(ok).sort(), ['s', 't', 'u', 'url']); assert.equal(ok.url, 'https://h.example:8451'); assert.deepEqual(calls, ['ping']);
  const f2 = async url => f(url.replace(/t=[0-9a-f]+/, 't=bad'));
  await assert.rejects(() => L.connect('h.example:8451', 'alex', 'nope', f2), e => e.kind === 'login');
  await assert.rejects(() => L.connect('h.example:8451', 'alex', 'x', async () => { throw new TypeError('Failed to fetch'); }), e => e.kind === 'net');
  await assert.rejects(() => L.connect('', 'alex', 'x', f), e => e.kind === 'url');
  await assert.rejects(() => L.connect('h', '  ', 'x', f), e => e.kind === 'login');
  await assert.rejects(() => L.connect('h', 'alex', 'x', async () => ({ ok: false, status: 502, json: async () => ({}) })), e => e.kind === 'other');
});

test('browse answers have the shape okie-music.js reads (title, id, type, class, can_play, can_expand, children)', async () => {
  const f = server([]), root = M.browseNode(await L.browse(cfg, '', null, f));
  assert.equal(root.title, 'My library'); assert.equal(root.kids.length, 8);
  assert.deepEqual(root.kids.map(k => k.id), ['playlists', 'starred', 'albums:newest', 'albums:frequent', 'albums:recent', 'albums:alphabeticalByName', 'artists', 'random']);
  assert.ok(root.kids.every(k => k.type === L.TYPE));
  const rnd = root.kids.find(k => k.id === 'random'); assert.ok(rnd.playable && !rnd.expandable, 'the random mix plays at once');
  assert.ok(root.kids.find(k => k.id === 'playlists').expandable);
  assert.equal(M.stepInto(root), null, 'eight entries are not skipped as a single account');
  assert.equal(M.browseNode(await L.browse(cfg, '', { root: 'Meine Musik', playlists: 'Wiedergabelisten' }, f)).kids[0].title, 'Wiedergabelisten');

  const pls = M.browseNode(await L.browse(cfg, 'playlists', null, f));
  assert.deepEqual(pls.kids.map(k => k.title), ['Run', 'Chill']); assert.equal(pls.kids[0].id, 'playlist:p1'); assert.ok(pls.kids[0].playable && pls.kids[0].expandable);
  assert.match(pls.kids[0].art, /^https:\/\/h\.example:8451\/rest\/getCoverArt\.view\?/); assert.equal(pls.kids[1].art, '', 'no picture, no URL');
  assert.equal(M.layoutOf(pls), 'grid');

  const albums = M.browseNode(await L.browse(cfg, 'albums:newest', null, f));
  assert.deepEqual(albums.kids.map(k => k.title), ['Rec · Band', 'Solo · One']); assert.equal(albums.kids[0].id, 'album:al1');
  const artists = M.browseNode(await L.browse(cfg, 'artists', null, f)); assert.deepEqual(artists.kids.map(k => k.id), ['artist:ar1', 'artist:ar2'], 'a single artist object is read like a list');
  const artist = M.browseNode(await L.browse(cfg, 'artist:ar1', null, f)); assert.equal(artist.title, 'Band'); assert.equal(artist.kids[0].title, 'Rec');
  const album = M.browseNode(await L.browse(cfg, 'album:al1', null, f));
  assert.equal(album.title, 'Rec'); assert.ok(album.playable); assert.deepEqual(album.kids.map(k => k.title), ['Song 1', 'Song 2', 'Song 3']);
  assert.equal(album.kids[1].id, 'song:s2|album:al1', 'a song remembers the list it was picked from');
  assert.ok(album.kids[0].playable && !album.kids[0].expandable); assert.equal(M.layoutOf(album), 'list');
  const pl = M.browseNode(await L.browse(cfg, 'playlist:p1', null, f)); assert.equal(pl.kids[0].title, 'Song 1 · Band', 'in a playlist the artist is shown');
  const liked = M.browseNode(await L.browse(cfg, 'starred', null, f)); assert.equal(liked.kids.length, 1);
  await assert.rejects(() => L.browse(cfg, 'nonsense', null, f));
});

test('play ids: a song plays inside its list from its own place; a list plays from the start; the random mix is 60 asked songs', async () => {
  const f = server([]);
  let r = await L.resolvePlay(cfg, 'song:s2|album:al1', f); assert.equal(r.songs.length, 3); assert.equal(r.start, 1);
  r = await L.resolvePlay(cfg, 'song:s3', f); assert.deepEqual(r.songs.map(s => s.id), ['s3']); assert.equal(r.start, 0);
  r = await L.resolvePlay(cfg, 'playlist:p1', f); assert.equal(r.songs.length, 3); assert.equal(r.start, 0);
  r = await L.resolvePlay(cfg, 'random', f); assert.equal(r.songs.length, 3);
  r = await L.resolvePlay(cfg, 'song:gone|album:al1', f); assert.equal(r.start, 0, 'a song that is no longer in the list starts the list');
  await assert.rejects(() => L.resolvePlay(cfg, 'junk', f));
});

function mk(AudioCls) { const audio = new (AudioCls || FakeAudio)(), calls = []; const p = new L.Player(cfg, { audio, fetch: server(calls), navigator: null }); return { audio, p, calls }; }

test('the state looks like a media_player, so okie-music.js reads it', async () => {
  const { p, audio } = mk();
  let np = M.nowPlaying(p.state(), Date.now());
  assert.equal(np.state, 'idle'); assert.equal(np.title, ''); assert.ok(np.browse, 'the library button shows'); assert.equal(np.phase, 'ready'); assert.deepEqual(np.sources, []);
  await p.call('play_media', { media_content_id: 'album:al1', media_content_type: L.TYPE });
  audio.duration = 200; audio.currentTime = 12;
  np = M.nowPlaying(p.state(), Date.now());
  assert.equal(np.state, 'playing'); assert.equal(np.title, 'Song 1'); assert.equal(np.artist, 'Band'); assert.equal(np.album, 'Rec');
  assert.equal(np.duration, 200); assert.ok(Math.abs(np.position - 12) < 1); assert.match(np.art, /getCoverArt\.view\?.*size=600/);
  assert.ok(np.can.seek && np.can.prev && np.can.next && np.can.shuffle && np.can.repeat && np.can.pause && np.can.volume);
  assert.equal(audio.src, L.streamUrl(cfg, 's1'));
  audio.pause(); assert.equal(M.nowPlaying(p.state(), Date.now()).state, 'paused');
});

test('iOS has no volume control for web audio: the volume key is switched off there', () => {
  assert.ok(M.nowPlaying(mk(FakeAudio).p.state(), Date.now()).can.volume);
  assert.ok(!M.nowPlaying(mk(IosAudio).p.state(), Date.now()).can.volume);
});

test('next, previous, shuffle and repeat', async () => {
  const { p, audio } = mk(); const title = () => p.current().title;
  await p.playSongs(SONGS.map(s => ({ id: s.id, title: s.title, artist: 'B', album: 'A', cover: '', duration: 100 })), 0, false);
  assert.equal(title(), 'Song 1');
  await p.call('media_next_track'); assert.equal(title(), 'Song 2');
  await p.call('media_next_track'); assert.equal(title(), 'Song 3');
  await p.call('media_next_track'); assert.equal(title(), 'Song 3', 'Next on the last song does nothing');
  audio.currentTime = 1; await p.call('media_previous_track'); assert.equal(title(), 'Song 2', 'Previous within 3 seconds goes back a song');
  audio.currentTime = 40; await p.call('media_previous_track'); assert.equal(title(), 'Song 2'); assert.equal(audio.currentTime, 0, 'later it restarts the song');
  // the end of a song moves on; the end of the list stops
  audio.fire('ended'); assert.equal(title(), 'Song 3'); audio.paused = false; audio.fire('ended'); assert.ok(audio.paused, 'the list is over: it stops'); assert.equal(M.nowPlaying(p.state(), Date.now()).state, 'paused');
  // repeat all wraps, repeat one replays
  await p.call('repeat_set', { repeat: 'all' }); audio.paused = false; audio.fire('ended'); assert.equal(title(), 'Song 1', 'repeat all wraps around'); assert.equal(M.nowPlaying(p.state()).repeat, 'all');
  await p.call('repeat_set', { repeat: 'one' }); const before = audio.plays; audio.fire('ended'); assert.equal(title(), 'Song 1'); assert.equal(audio.plays, before + 1, 'repeat one plays the same song again');
  await p.call('repeat_set', { repeat: 'sideways' }); assert.equal(M.nowPlaying(p.state()).repeat, 'off');
});

test('shuffle keeps the song that plays, visits every song once, and turning it off continues in order from there', async () => {
  const { p } = mk(); const list = Array.from({ length: 12 }, (_, i) => ({ id: 'x' + i, title: 'T' + i, artist: '', album: '', cover: '', duration: 1 }));
  await p.playSongs(list, 4, true); assert.equal(p.current().id, 'x4', 'a shuffled list still starts with the song you picked');
  const seen = [p.current().id]; for (let i = 0; i < 11; i++) { await p.call('media_next_track'); seen.push(p.current().id); }
  assert.equal(new Set(seen).size, 12, 'every song exactly once'); assert.ok(M.nowPlaying(p.state()).shuffle);
  await p.call('shuffle_set', { shuffle: false }); const at = p.current().id; await p.call('media_next_track');
  assert.equal(p.current().id, 'x' + ((+at.slice(1) + 1) % 12 === 0 ? 11 : +at.slice(1) + 1) , 'unshuffled it goes on in the list\'s own order'.replace('x', 'x'));
  const a = L.shuffled(8, 3); assert.equal(a[0], 3); assert.deepEqual(a.slice().sort((x, y) => x - y), [0, 1, 2, 3, 4, 5, 6, 7]);
});

test('a broken song is skipped (three times at most), the error is reported, and the list is not stuck', async () => {
  const { p, audio } = mk(); const errs = []; p.onError(k => errs.push(k));
  await p.playSongs(SONGS.map(s => ({ id: s.id, title: s.title, artist: '', album: '', cover: '', duration: 1 })), 0, false);
  audio.fire('error'); assert.deepEqual(errs, ['play']);
  await new Promise(r => setTimeout(r, 600)); assert.equal(p.current().title, 'Song 2', 'it moved on by itself');
});

test('like / unlike goes to the server and rolls back when it fails; play counts are sent', async () => {
  const { p, calls } = mk();
  await p.call('play_media', { media_content_id: 'starred', media_content_type: L.TYPE });
  assert.equal(p.current().id, 's2'); assert.ok(p.isStarred(), 'the server says it is liked');
  assert.equal(await p.toggleStar(), false); assert.ok(!p.isStarred()); assert.ok(calls.includes('unstar:s2'));
  assert.equal(await p.toggleStar(), true); assert.ok(calls.includes('star:s2'));
  assert.ok(calls.includes('scrobble:s2'), 'the server is told what plays now');
  const bad = new L.Player(cfg, { audio: new FakeAudio(), fetch: async url => { if (/star/.test(url)) throw new Error('down'); return server([])(url); }, navigator: null });
  await bad.call('play_media', { media_content_id: 'album:al1', media_content_type: L.TYPE });
  await assert.rejects(() => bad.toggleStar()); assert.ok(!bad.isStarred(), 'the heart goes back when the server did not get it');
});

test('listeners hear changes and can leave; the page keeps one player per login', async () => {
  const { p, audio } = mk(); let n = 0; const off = p.onChange(() => n++);
  await p.playSongs([{ id: 'a', title: 'A', artist: '', album: '', cover: '', duration: 1 }], 0); const after = n; assert.ok(after > 0);
  audio.pause(); assert.ok(n > after); off(); const k = n; audio.play(); assert.equal(n, k, 'a listener that left hears nothing');
  const f = new FakeAudio(); const one = L.playerFor(cfg, { audio: f, fetch: server([]), navigator: null });
  assert.equal(L.playerFor(Object.assign({}, cfg), {}), one, 'the same login gets the same player');
  const two = L.playerFor(Object.assign({}, cfg, { t: 'other' }), { audio: new FakeAudio(), fetch: server([]), navigator: null }); assert.notEqual(two, one, 'a different login gets a new one');
  L.dropPlayer();
});

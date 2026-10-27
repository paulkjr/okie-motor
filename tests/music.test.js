'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const M = require('../src/okie-music.js');

const st = (state, a) => ({ state, attributes: a || {} });

test('which player the Music screen shows: a music player, playing before paused before idle, Spotify\'s over others, your choice over all', () => {
  const states = {
    'media_player.tv': st('playing', { app_name: 'Netflix', media_title: 'A Show' }),
    'media_player.roku': st('off'),
    'media_player.spotify_alex': st('paused', { media_title: 'Song', media_artist: 'Band' }),
    'media_player.kitchen': st('playing', { media_content_type: 'music', media_title: 'Radio' }),
  };
  assert.equal(M.pickPlayer(states), 'media_player.kitchen', 'a playing music player beats a paused Spotify');
  assert.equal(M.pickPlayer(Object.assign({}, states, { 'media_player.kitchen': st('idle', {}) })), 'media_player.spotify_alex');
  assert.equal(M.pickPlayer(states, 'media_player.spotify_alex'), 'media_player.spotify_alex', 'the one you chose wins');
  assert.equal(M.pickPlayer({ 'media_player.tv': states['media_player.tv'] }), null, 'a TV with an app is not a music player');
  assert.equal(M.pickPlayer({ 'media_player.spotify_x': st('unavailable') }, 'media_player.spotify_x'), null, 'unavailable counts for nothing');
  assert.equal(M.pickPlayer({}), null);
  assert.equal(M.pickPlayer({ 'media_player.spotify_x': st('playing', { media_title: 'Hi' }), 'media_player.spotify_y': st('playing', { media_title: 'Hi' }) }, 'media_player.spotify_y'), 'media_player.spotify_y');
});

test('what is playing: the song, the position worked out between updates, what the player can do', () => {
  const now = Date.parse('2026-10-15T12:00:30Z');
  const a = { media_title: 'Song', media_artist: 'Band', media_album_name: 'Album', media_duration: 200, media_position: 10, media_position_updated_at: '2026-10-15T12:00:00Z', entity_picture: '/api/art', volume_level: 0.4, shuffle: true, repeat: 'all', source: 'iPhone', source_list: ['iPhone', 'TV'], supported_features: 2 + 4 + 16 + 32 + 32768 };
  const p = M.nowPlaying(st('playing', a), now);
  assert.equal(p.title, 'Song'); assert.equal(p.artist, 'Band'); assert.equal(p.album, 'Album'); assert.equal(p.art, '/api/art'); assert.equal(p.duration, 200);
  assert.equal(p.position, 40, '10 s at the update + 30 s since'); assert.equal(p.playing, true); assert.equal(p.volume, 0.4); assert.equal(p.shuffle, true); assert.equal(p.repeat, 'all'); assert.deepEqual(p.sources, ['iPhone', 'TV']);
  assert.deepEqual(p.can, { seek: true, volume: true, prev: true, next: true, source: false, shuffle: true, repeat: false, pause: false });
  assert.equal(M.nowPlaying(st('paused', a), now).position, 10, 'a paused song stays where it is');
  assert.equal(M.nowPlaying(st('playing', Object.assign({}, a, { media_position: 190 })), now).position, 200, 'never past the end');
  assert.equal(M.nowPlaying(st('playing', { media_title: 'x' }), now).position, 0); assert.equal(M.nowPlaying(null, now), null);
  assert.equal(M.nowPlaying(st('idle', {}), now).duration, null);
});

test('keys and clocks: repeat cycles off, all, one; times read m:ss', () => {
  assert.deepEqual(['off', 'all', 'one'].map(M.repeatNext), ['all', 'one', 'off']);
  assert.deepEqual([0, 4, 59, 60, 337, 3600.4].map(M.fmtClock), ['0:00', '0:04', '0:59', '1:00', '5:37', '60:00']);
});

test('synced lyrics: the stamps are read, in time order, with several stamps on a line and the offset tag; the line being sung is found', () => {
  const lrc = '[ar:Someone]\n[offset:+500]\n[00:05.00] first line\n[00:10.50]second line\n[00:20.1][00:40.2] sung twice\n[00:30.00]\n\nplain words without a stamp\n[01:05]last';
  const L = M.parseLrc(lrc);
  assert.deepEqual(L.map(x => x.text), ['first line', 'second line', 'sung twice', '', 'sung twice', 'last']);
  assert.ok(Math.abs(L[0].t - 4.5) < 1e-9, 'a +500 ms offset moves every line half a second earlier'); assert.ok(Math.abs(L[1].t - 10) < 1e-9); assert.ok(Math.abs(L[4].t - 39.7) < 1e-9);
  assert.ok(L.every((x, i, a) => !i || a[i - 1].t <= x.t), 'in time order'); assert.ok(Math.abs(L[5].t - 64.5) < 1e-9, 'a stamp without hundredths');
  assert.equal(M.lineAt(L, 0), -1, 'before the first line'); assert.equal(M.lineAt(L, 4.4), 0, 'a quarter second early'); assert.equal(M.lineAt(L, 9.5), 0); assert.equal(M.lineAt(L, 9.8), 1); assert.equal(M.lineAt(L, 30), 3); assert.equal(M.lineAt(L, 1000), 5);
  assert.deepEqual(M.parseLrc(''), []); assert.deepEqual(M.parseLrc(null), []);
  assert.equal(M.parseLrc('[00:01.5]x')[0].t, 1.5); assert.equal(M.parseLrc('[00:01.50]x')[0].t, 1.5); assert.ok(Math.abs(M.parseLrc('[00:01.123]x')[0].t - 1.123) < 1e-9);
});

test('the lyrics service: the question carries title, artist, album and length; the answer becomes synced, plain, instrumental or none', () => {
  const u = M.lrclibUrl({ title: 'A & B', artist: 'Band/Co', album: 'Alb', duration: 199.6 });
  assert.equal(u, 'https://lrclib.net/api/get?artist_name=Band%2FCo&track_name=A%20%26%20B&album_name=Alb&duration=200');
  assert.ok(!/album_name/.test(M.lrclibUrl({ title: 't', artist: 'a' })) && !/duration/.test(M.lrclibUrl({ title: 't', artist: 'a' })), 'what is not known is left out');
  assert.equal(M.pickLyrics({ syncedLyrics: '[00:01.00] a\n[00:02.00] b', plainLyrics: 'a\nb' }).kind, 'synced');
  const plain = M.pickLyrics({ syncedLyrics: '', plainLyrics: 'one\ntwo\n\n' }); assert.equal(plain.kind, 'plain'); assert.deepEqual(plain.lines.map(x => x.text), ['one', 'two']); assert.equal(plain.lines[0].t, null);
  assert.equal(M.pickLyrics({ instrumental: true }).kind, 'instrumental'); assert.equal(M.pickLyrics({}).kind, 'none'); assert.equal(M.pickLyrics(null).kind, 'none'); assert.equal(M.pickLyrics('x').kind, 'none');
});

test('the colour behind the picture: the average of its pixels, pulled dark enough for white text', () => {
  const px = [200, 100, 50, 255, 100, 50, 150, 255, 0, 0, 0, 0];      // two opaque pixels and a transparent one
  assert.deepEqual(M.averageColor(px), [150, 75, 100]); assert.deepEqual(M.averageColor([]), [58, 74, 90], 'nothing to average: the default');
  const [a, b] = M.tintPair([255, 255, 255]); const lum = c => c.match(/\d+/g).map(Number).reduce((x, y) => x + y, 0) / 3;
  assert.ok(lum(a) < 125 && lum(b) < lum(a), 'white is pulled down, the second colour is darker'); assert.match(a, /^rgb\(\d+,\d+,\d+\)$/);
  const bright = M.tintPair([20, 10, 5]); assert.ok(lum(bright[0]) > 8, 'a dark picture is lifted a little instead of going black');
});

test('the library opens only when Home Assistant offers both browsing and playing, and the phase says what is missing on the way there', () => {
  const B = M.FEATURES.browse, P = M.FEATURES.playMedia, S = M.FEATURES.source;
  assert.equal(B, 131072); assert.equal(P, 512);
  assert.equal(M.canBrowse(B | P | S), true); assert.equal(M.canBrowse(B), false, 'browsing without playing is not enough'); assert.equal(M.canBrowse(S), false); assert.equal(M.canBrowse(undefined), false);
  const idle = (a, state) => st(state || 'idle', Object.assign({ supported_features: S }, a));
  assert.equal(M.libraryPhase(null), 'none');
  assert.equal(M.libraryPhase(idle({}, 'unavailable')), 'offline');
  assert.equal(M.libraryPhase(idle({})), 'open', 'Spotify lists only running devices: none known');
  assert.equal(M.libraryPhase(idle({ source_list: [] })), 'open');
  assert.equal(M.libraryPhase(idle({ source_list: ['iPad', 'iPhone'] })), 'pick', 'devices known, none active');
  assert.equal(M.libraryPhase(idle({ source_list: ['iPad'], source: 'iPad' })), 'load', 'a device is active, nothing is loaded');
  assert.equal(M.libraryPhase(idle({ supported_features: B | P | S, source_list: ['iPad'], source: 'iPad' }, 'paused')), 'ready');
  const p = M.nowPlaying(idle({ supported_features: B | P | S, source_list: ['iPad'], source: 'iPad' }, 'playing'), 0); assert.equal(p.browse, true); assert.equal(p.phase, 'ready');
  const q = M.nowPlaying(idle({}), 0); assert.equal(q.browse, false); assert.equal(q.phase, 'open');
});

test('this tablet\'s own entry in the Spotify device list is found by the kind of screen, this tablet first', () => {
  const ipadUa = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15', desktopSafariOnIpad = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15';
  assert.equal(M.deviceKind(ipadUa, true).phone, false); assert.equal(M.deviceKind(desktopSafariOnIpad, true).phone, false, 'an iPad that says Macintosh but has a touch screen');
  assert.equal(M.deviceKind(desktopSafariOnIpad, false), null, 'a real Mac is not a tablet');
  assert.equal(M.deviceKind('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)', true).phone, true);
  assert.equal(M.deviceKind('Mozilla/5.0 (Linux; Android 13; SM-X700) AppleWebKit', true).phone, false); assert.equal(M.deviceKind('Mozilla/5.0 (Linux; Android 13; Pixel 7) Mobile Safari', true).phone, true);
  assert.equal(M.deviceKind('', false), null); assert.equal(M.deviceKind(undefined, true), null);
  const list = ['Living Room TV', 'Pauls iPad', 'iPhone'];
  assert.equal(M.hereSource(list, M.deviceKind(ipadUa, true)), 'Pauls iPad'); assert.equal(M.hereSource(list, M.deviceKind('iPhone', false)), 'iPhone');
  assert.equal(M.hereSource(['Living Room TV'], M.deviceKind(ipadUa, true)), null); assert.equal(M.hereSource(list, null), null); assert.equal(M.hereSource(undefined, M.deviceKind(ipadUa, true)), null);
});

test('a browse answer is read into plain nodes; the id and the type are kept exactly as Home Assistant wrote them, so playing can hand them straight back', () => {
  const raw = { title: 'Playlists', media_class: 'directory', media_content_id: 'current_user_playlists', media_content_type: 'spotify://current_user_playlists', children_media_class: 'playlist', can_play: false, can_expand: true, not_shown: 3,
    children: [
      { title: 'Focus', media_class: 'playlist', media_content_id: 'spotify:playlist:37i9dQ', media_content_type: 'spotify://playlist', children_media_class: 'track', can_play: true, can_expand: true, thumbnail: 'https://i.scdn.co/image/abc' },
      { title: 'No id', media_class: 'playlist', media_content_type: 'spotify://playlist', can_play: true },
      { title: 'Odd picture', media_class: 'track', media_content_id: 'spotify:track:1', media_content_type: 'spotify://track', can_play: true, thumbnail: 'javascript:alert(1)' },
      null, 'x',
    ] };
  const n = M.browseNode(raw);
  assert.equal(n.title, 'Playlists'); assert.equal(n.id, 'current_user_playlists'); assert.equal(n.type, 'spotify://current_user_playlists'); assert.equal(n.kidsCls, 'playlist'); assert.equal(n.hidden, 3); assert.equal(n.expandable, true); assert.equal(n.playable, false);
  assert.equal(n.kids.length, 2, 'an item without an id, and junk, is dropped');
  assert.deepEqual([n.kids[0].id, n.kids[0].type, n.kids[0].playable, n.kids[0].expandable, n.kids[0].art], ['spotify:playlist:37i9dQ', 'spotify://playlist', true, true, 'https://i.scdn.co/image/abc']);
  assert.equal(n.kids[1].art, '', 'a picture address that is not https, a path or an image is not used'); assert.equal(n.kids[1].expandable, false);
  assert.equal(M.browseNode(null), null); assert.equal(M.browseNode('x'), null); assert.deepEqual(M.browseNode({ title: 'Empty' }).kids, []); assert.equal(M.browseNode({ title: 'Empty' }).hidden, 0);
  assert.equal(M.browseNode({ children: [{ media_content_id: 0, title: 'zero' }] }).kids[0].id, '0', 'an id of 0 is still an id');
});

test('an account level with one folder is skipped, pictures go to playlists and albums and plain rows to songs, and a failed browse is told apart', () => {
  const folder = { title: 'Account', id: 'a', type: 'spotify://library', expandable: true, playable: false }, kids = k => ({ kids: k });
  assert.equal(M.stepInto(kids([folder])), folder); assert.equal(M.stepInto(kids([folder, folder])), null, 'two folders: you choose');
  assert.equal(M.stepInto(kids([Object.assign({}, folder, { playable: true })])), null, 'one playable thing is not an account'); assert.equal(M.stepInto(kids([Object.assign({}, folder, { expandable: false })])), null); assert.equal(M.stepInto(kids([])), null); assert.equal(M.stepInto(null), null);
  ['playlist', 'album', 'artist', 'podcast'].forEach(c => assert.equal(M.layoutOf({ kidsCls: c }), 'grid', c));
  ['track', 'episode', 'directory', '', undefined].forEach(c => assert.equal(M.layoutOf({ kidsCls: c }), 'list', String(c))); assert.equal(M.layoutOf(null), 'list');
  assert.equal(M.iconFor('playlist'), 'list'); assert.equal(M.iconFor('artist'), 'person'); assert.equal(M.iconFor('nonsense'), 'music');
  assert.equal(M.browseProblem({ code: 'unknown_error', message: 'Player does not support browsing media' }), 'asleep');
  assert.equal(M.browseProblem({ message: 'Spotify authentication failed (401)' }), 'login'); assert.equal(M.browseProblem(new Error('Token refresh failed')), 'login'); assert.equal(M.browseProblem({ message: 'Premium required' }), 'login');
  assert.equal(M.browseProblem({ message: 'timeout' }), 'other'); assert.equal(M.browseProblem(null), 'other'); assert.equal(M.browseProblem('boom'), 'other');
});

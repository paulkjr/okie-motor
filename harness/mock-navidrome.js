#!/usr/bin/env node
// A pretend Navidrome (Subsonic API) for the browser harness: login alex / sesame, 2 albums, 6 songs, 2 playlists, covers (SVG) and real playable audio
// (generated WAV, with Range support like the real server). Not shipped.   node harness/mock-navidrome.js   ->   http://127.0.0.1:4590
const http = require('http'), crypto = require('crypto');
const PORT = +process.env.PORT || 4590, USER = 'alex', PASS = 'sesame';
const md5 = s => crypto.createHash('md5').update(s).digest('hex');
const ALBUMS = [
  { id: 'al1', name: 'Waking the Test', artist: 'Test Band', artistId: 'ar1', color: ['#ff3a28', '#4a0d08'], hz: 330 },
  { id: 'al2', name: 'Night Drive', artist: 'Neon Fox', artistId: 'ar2', color: ['#3a6bff', '#0b1a4a'], hz: 262 },
];
const SONGS = [];
ALBUMS.forEach((a, ai) => ['Opening', 'Middle Part', 'Closing Time'].forEach((t, i) => SONGS.push({ id: 's' + (ai * 3 + i + 1), title: a.name.split(' ')[0] + ' · ' + t, artist: a.artist, album: a.name, albumId: a.id, coverArt: a.id, duration: 12 + i * 4, track: i + 1, hz: a.hz * (1 + i * 0.125) })));
const starred = new Set(['s2']);
const wav = (sec, hz) => {
  const rate = 22050, n = rate * sec, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.round(Math.sin(2 * Math.PI * hz * i / rate) * 3000 * Math.min(1, i / 2000, (n - i) / 2000)), 44 + i * 2);
  return buf;
};
const cover = a => `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.color[0]}"/><stop offset="1" stop-color="${a.color[1]}"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><text x="150" y="170" font-size="64" text-anchor="middle" fill="#fff" font-family="sans-serif">${a.name[0]}</text></svg>`;
const song = s => Object.assign({}, s, { starred: starred.has(s.id) ? '2026-01-01T00:00:00Z' : undefined, suffix: 'wav', contentType: 'audio/wav' });
const alb = a => ({ id: a.id, name: a.name, artist: a.artist, artistId: a.artistId, coverArt: a.id, songCount: 3 });
const log = [];
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x'), m = u.pathname.replace('/rest/', '').replace('.view', ''), q = u.searchParams;
  const cors = { 'Access-Control-Allow-Origin': req.headers.origin || '*', 'Access-Control-Allow-Headers': 'Range, Content-Type', 'Access-Control-Expose-Headers': 'Content-Range, Accept-Ranges, Content-Length', Vary: 'Origin' };
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); return res.end(); }
  if (u.pathname === '/__log') { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); return res.end(JSON.stringify(log.slice(-50))); }
  if (u.pathname === '/ping') { res.writeHead(200, cors); return res.end('pong'); }
  const json = (body, status) => { res.writeHead(200, Object.assign({ 'Content-Type': 'application/json' }, cors)); res.end(JSON.stringify({ 'subsonic-response': Object.assign({ status: status || 'ok', version: '1.16.1', type: 'navidrome', openSubsonic: true }, body) })); };
  if (!(q.get('u') === USER && q.get('t') === md5(PASS + q.get('s')))) return json({ error: { code: 40, message: 'Wrong username or password' } }, 'failed');
  log.push(m + (q.get('id') ? ':' + q.get('id') : '') + (m === 'scrobble' ? ':sub=' + q.get('submission') : ''));
  switch (m) {
    case 'ping': return json({});
    case 'getPlaylists': return json({ playlists: { playlist: [{ id: 'p1', name: 'Morning Run', songCount: 4, coverArt: 'al1' }, { id: 'p2', name: 'Cool Down', songCount: 2 }] } });
    case 'getPlaylist': return json({ playlist: { id: q.get('id'), name: q.get('id') === 'p1' ? 'Morning Run' : 'Cool Down', entry: (q.get('id') === 'p1' ? [SONGS[0], SONGS[4], SONGS[2], SONGS[3]] : [SONGS[5], SONGS[1]]).map(song) } });
    case 'getAlbum': { const a = ALBUMS.find(x => x.id === q.get('id')); return a ? json({ album: Object.assign(alb(a), { song: SONGS.filter(s => s.albumId === a.id).map(song) }) }) : json({ error: { code: 70, message: 'not found' } }, 'failed'); }
    case 'getAlbumList2': return json({ albumList2: { album: ALBUMS.map(alb) } });
    case 'getArtists': return json({ artists: { index: [{ name: 'N', artist: [{ id: 'ar2', name: 'Neon Fox', coverArt: 'al2' }] }, { name: 'T', artist: [{ id: 'ar1', name: 'Test Band', coverArt: 'al1' }] }] } });
    case 'getArtist': { const a = ALBUMS.find(x => x.artistId === q.get('id')); return json({ artist: { id: q.get('id'), name: a.artist, album: [alb(a)] } }); }
    case 'getStarred2': return json({ starred2: { song: SONGS.filter(s => starred.has(s.id)).map(song) } });
    case 'getRandomSongs': return json({ randomSongs: { song: SONGS.map(song) } });
    case 'getSong': return json({ song: song(SONGS.find(s => s.id === q.get('id')) || SONGS[0]) });
    case 'star': starred.add(q.get('id')); return json({});
    case 'unstar': starred.delete(q.get('id')); return json({});
    case 'scrobble': return json({});
    case 'getCoverArt': { const a = ALBUMS.find(x => x.id === q.get('id')) || ALBUMS[0]; res.writeHead(200, Object.assign({ 'Content-Type': 'image/svg+xml' }, cors)); return res.end(cover(a)); }
    case 'stream': {
      const s = SONGS.find(x => x.id === q.get('id')); if (!s) { res.writeHead(404, cors); return res.end(); }
      const buf = wav(s.duration, s.hz), r = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
      if (r) { const a = r[1] ? +r[1] : 0, b = r[2] ? Math.min(+r[2], buf.length - 1) : buf.length - 1; res.writeHead(206, Object.assign({ 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${a}-${b}/${buf.length}`, 'Content-Length': b - a + 1 }, cors)); return res.end(buf.subarray(a, b + 1)); }
      res.writeHead(200, Object.assign({ 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Content-Length': buf.length }, cors)); return res.end(buf);
    }
    default: return json({ error: { code: 0, message: 'not implemented: ' + m } }, 'failed');
  }
}).listen(PORT, '127.0.0.1', () => console.log('mock Navidrome on http://127.0.0.1:' + PORT + '  (user alex / password sesame)'));

#!/usr/bin/env node
// Tiny static server for the browser harness (no dependencies):
//   npm run serve   ->   http://127.0.0.1:4651/harness/index.html      (add ?zen=1 for the lock page, ?lang=de for German)
//                        http://127.0.0.1:4651/harness/bundle.html     (the built dist/okie-motor.js instead of src/)
// Paste harness/smoke.js into the browser console on either page to run the 29 end-to-end checks.
const http = require('http'), fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
const port = +process.env.PORT || 4651;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.mp4': 'video/mp4' };
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/harness/index.html';
  const f = path.join(root, p);
  if (!f.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(f, (err, data) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  });
}).listen(port, '127.0.0.1', () => console.log('Okie Motor harness on http://127.0.0.1:' + port + '/harness/index.html'));

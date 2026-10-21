#!/usr/bin/env node
// Turns a .woff2 font into a plain .ttf (iOS cannot load woff2). No packages: Node's own Brotli plus the WOFF2 rules for the transformed glyf / loca / hmtx tables.
// Usage: node tools/woff2-to-ttf.js in.woff2 out.ttf
'use strict';
const fs = require('fs');
const zlib = require('zlib');

const KNOWN = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm', 'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern', 'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC', 'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar', 'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty', 'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat', 'Gloc', 'Feat', 'Sill'];

function convert(buf) {
  if (buf.toString('latin1', 0, 4) !== 'wOF2') throw new Error('not a woff2 file');
  const flavor = buf.readUInt32BE(4), numTables = buf.readUInt16BE(12), compSize = buf.readUInt32BE(20);
  let p = 48;
  const base128 = () => { let v = 0; for (let i = 0; i < 5; i++) { const b = buf[p++]; v = v * 128 + (b & 127); if (!(b & 128)) return v; } throw new Error('bad base128'); };
  const tables = [];
  for (let i = 0; i < numTables; i++) {
    const flags = buf[p++], idx = flags & 63, ver = flags >> 6;
    const tag = idx === 63 ? (p += 4, buf.toString('latin1', p - 4, p)) : KNOWN[idx];
    const origLength = base128();
    const transformed = (tag === 'glyf' || tag === 'loca') ? ver === 0 : ver === 1;
    const transformLength = transformed ? base128() : origLength;
    tables.push({ tag, origLength, transformed, len: transformLength });
  }
  const data = zlib.brotliDecompressSync(buf.subarray(p, p + compSize));
  let off = 0;
  for (const t of tables) { t.data = data.subarray(off, off + t.len); off += t.len; }
  const by = tag => tables.find(t => t.tag === tag);

  // ---- glyf + loca
  const glyf = by('glyf'), loca = by('loca');
  let glyphBoxes = null, numGlyphs = 0;
  if (glyf && glyf.transformed) {
    const d = glyf.data;
    numGlyphs = d.readUInt16BE(4);
    const sizes = [];
    for (let i = 0; i < 7; i++) sizes.push(d.readUInt32BE(8 + i * 4));
    let q = 36;
    const streams = sizes.map(s => { const r = { buf: d.subarray(q, q + s), p: 0 }; q += s; return r; });
    const [nCont, nPts, flagS, glyphS, compS, bboxS, instrS] = streams;
    const u8 = s => s.buf[s.p++];
    const u16 = s => { const v = s.buf.readUInt16BE(s.p); s.p += 2; return v; };
    const i16 = s => { const v = s.buf.readInt16BE(s.p); s.p += 2; return v; };
    const u255 = s => { const b = u8(s); if (b === 253) return u16(s); if (b === 255) return 253 + u8(s); if (b === 254) return 506 + u8(s); return b; };
    const bboxBitmapLen = ((numGlyphs + 31) >> 5) << 2;
    const bitmap = bboxS.buf.subarray(0, bboxBitmapLen); bboxS.p = bboxBitmapLen;
    const sign = (flag, v) => (flag & 1) ? v : -v;
    const out = [], offsets = [0];
    glyphBoxes = [];
    let total = 0;
    for (let g = 0; g < numGlyphs; g++) {
      const nc = i16(nCont);
      let glyph = Buffer.alloc(0);
      let box = [0, 0, 0, 0];
      const hasBox = (bitmap[g >> 3] >> (7 - (g & 7))) & 1;
      if (nc > 0) {
        const ends = []; let pts = 0;
        for (let c = 0; c < nc; c++) { pts += u255(nPts); ends.push(pts - 1); }
        const xs = [], ys = [], on = []; let x = 0, y = 0;
        for (let i = 0; i < pts; i++) {
          let flag = u8(flagS); const onc = !(flag >> 7); flag &= 127;
          let dx, dy; const gp = glyphS.p, b = glyphS.buf;
          if (flag < 10) { dx = 0; dy = sign(flag, ((flag & 14) << 7) + b[gp]); glyphS.p += 1; }
          else if (flag < 20) { dx = sign(flag, (((flag - 10) & 14) << 7) + b[gp]); dy = 0; glyphS.p += 1; }
          else if (flag < 84) { const b0 = flag - 20, b1 = b[gp]; dx = sign(flag, 1 + (b0 & 0x30) + (b1 >> 4)); dy = sign(flag >> 1, 1 + ((b0 & 0x0c) << 2) + (b1 & 0x0f)); glyphS.p += 1; }
          else if (flag < 120) { const b0 = flag - 84; dx = sign(flag, 1 + (((b0 / 12) | 0) << 8) + b[gp]); dy = sign(flag >> 1, 1 + ((((b0 % 12) >> 2)) << 8) + b[gp + 1]); glyphS.p += 2; }
          else if (flag < 124) { const b2 = b[gp + 1]; dx = sign(flag, (b[gp] << 4) + (b2 >> 4)); dy = sign(flag >> 1, ((b2 & 0x0f) << 8) + b[gp + 2]); glyphS.p += 3; }
          else { dx = sign(flag, (b[gp] << 8) + b[gp + 1]); dy = sign(flag >> 1, (b[gp + 2] << 8) + b[gp + 3]); glyphS.p += 4; }
          x += dx; y += dy; xs.push(x); ys.push(y); on.push(onc);
        }
        const il = u255(glyphS);
        const instr = instrS.buf.subarray(instrS.p, instrS.p + il); instrS.p += il;
        if (hasBox) { box = [i16(bboxS), i16(bboxS), i16(bboxS), i16(bboxS)]; }
        else box = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
        const parts = [];
        const h = Buffer.alloc(10); h.writeInt16BE(nc, 0); box.forEach((v, i) => h.writeInt16BE(v, 2 + i * 2)); parts.push(h);
        const e = Buffer.alloc(nc * 2 + 2); ends.forEach((v, i) => e.writeUInt16BE(v, i * 2)); e.writeUInt16BE(il, nc * 2); parts.push(e, Buffer.from(instr));
        parts.push(Buffer.from(on.map(o => (o ? 1 : 0))));            // flags: on-curve bit only, coordinates as 16-bit deltas
        const cx = Buffer.alloc(pts * 2), cy = Buffer.alloc(pts * 2); let px = 0, py = 0;
        for (let i = 0; i < pts; i++) { cx.writeInt16BE(xs[i] - px, i * 2); cy.writeInt16BE(ys[i] - py, i * 2); px = xs[i]; py = ys[i]; }
        parts.push(cx, cy);
        glyph = Buffer.concat(parts);
      } else if (nc < 0) {
        const start = compS.p; let more = true, instr = false;
        while (more) {
          const f = u16(compS); u16(compS);
          compS.p += (f & 1) ? 4 : 2;
          if (f & 8) compS.p += 2; else if (f & 0x40) compS.p += 4; else if (f & 0x80) compS.p += 8;
          more = !!(f & 0x20); if (f & 0x100) instr = true;
        }
        const comp = compS.buf.subarray(start, compS.p);
        let il = 0, instrBytes = Buffer.alloc(0);
        if (instr) { il = u255(glyphS); instrBytes = instrS.buf.subarray(instrS.p, instrS.p + il); instrS.p += il; }
        box = [i16(bboxS), i16(bboxS), i16(bboxS), i16(bboxS)];
        const h = Buffer.alloc(10); h.writeInt16BE(-1, 0); box.forEach((v, i) => h.writeInt16BE(v, 2 + i * 2));
        const parts = [h, comp];
        if (instr) { const l = Buffer.alloc(2); l.writeUInt16BE(il, 0); parts.push(l, Buffer.from(instrBytes)); }
        glyph = Buffer.concat(parts);
      }
      glyphBoxes.push(box);
      const pad = (4 - (glyph.length & 3)) & 3;
      out.push(glyph, Buffer.alloc(pad));
      total += glyph.length + pad; offsets.push(total);
    }
    glyf.data = Buffer.concat(out); glyf.transformed = false;
    const lb = Buffer.alloc(offsets.length * 4); offsets.forEach((v, i) => lb.writeUInt32BE(v, i * 4));
    if (loca) { loca.data = lb; loca.transformed = false; }
    const head = by('head'); if (head) { head.data = Buffer.from(head.data); head.data.writeInt16BE(1, 50); }    // long loca offsets
  }

  // ---- hmtx
  const hmtx = by('hmtx');
  if (hmtx && hmtx.transformed) {
    const d = hmtx.data, hh = by('hhea').data, nH = hh.readUInt16BE(34), nG = numGlyphs || by('maxp').data.readUInt16BE(4);
    const flags = d[0]; let q = 1;
    const adv = []; for (let i = 0; i < nH; i++) { adv.push(d.readUInt16BE(q)); q += 2; }
    const lsb = [], rest = [];
    if (flags & 1) for (let i = 0; i < nH; i++) lsb.push(glyphBoxes[i][0]); else for (let i = 0; i < nH; i++) { lsb.push(d.readInt16BE(q)); q += 2; }
    if (flags & 2) for (let i = nH; i < nG; i++) rest.push(glyphBoxes[i][0]); else for (let i = nH; i < nG; i++) { rest.push(d.readInt16BE(q)); q += 2; }
    const o = Buffer.alloc(nH * 4 + (nG - nH) * 2);
    for (let i = 0; i < nH; i++) { o.writeUInt16BE(adv[i], i * 4); o.writeInt16BE(lsb[i], i * 4 + 2); }
    rest.forEach((v, i) => o.writeInt16BE(v, nH * 4 + i * 2));
    hmtx.data = o; hmtx.transformed = false;
  }

  // ---- put the sfnt together
  const sorted = tables.slice().sort((a, b) => (a.tag < b.tag ? -1 : 1));
  const n = sorted.length, hdr = 12 + n * 16;
  let pos = hdr; sorted.forEach(t => { t.offset = pos; pos += (t.data.length + 3) & ~3; });
  const file = Buffer.alloc(pos);
  let sr = 1, es = 0; while (sr * 2 <= n) { sr *= 2; es++; }
  file.writeUInt32BE(flavor, 0); file.writeUInt16BE(n, 4); file.writeUInt16BE(sr * 16, 6); file.writeUInt16BE(es, 8); file.writeUInt16BE(n * 16 - sr * 16, 10);
  const sum = b => { let s = 0; const l = b.length & ~3; for (let i = 0; i < l; i += 4) s = (s + b.readUInt32BE(i)) >>> 0; if (b.length & 3) { const t = Buffer.alloc(4); b.copy(t, 0, l); s = (s + t.readUInt32BE(0)) >>> 0; } return s; };
  sorted.forEach((t, i) => {
    const r = 12 + i * 16;
    if (t.tag === 'head') { t.data = Buffer.from(t.data); t.data.writeUInt32BE(0, 8); }
    file.write(t.tag, r, 'latin1'); file.writeUInt32BE(sum(t.data), r + 4); file.writeUInt32BE(t.offset, r + 8); file.writeUInt32BE(t.data.length, r + 12);
    t.data.copy(file, t.offset);
  });
  const head = sorted.find(t => t.tag === 'head');
  if (head) file.writeUInt32BE((0xB1B0AFBA - sum(file)) >>> 0, head.offset + 8);
  return file;
}

if (require.main === module) {
  const [, , input, output] = process.argv;
  if (!input || !output) { console.error('usage: node woff2-to-ttf.js in.woff2 out.ttf'); process.exit(1); }
  fs.writeFileSync(output, convert(fs.readFileSync(input)));
  console.log(`${input} -> ${output}`);
}
module.exports = { convert };

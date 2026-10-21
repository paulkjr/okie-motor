'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createUndoQueue, morphRects } = require('../src/okie-overlay.js');

function fakeTimers() {
  let now = 0, id = 0; const jobs = new Map();
  return {
    setTimeout: (fn, ms) => { jobs.set(++id, { fn, at: now + ms }); return id; },
    clearTimeout: i => jobs.delete(i),
    advance(ms) { now += ms; Array.from(jobs.entries()).filter(([, j]) => j.at <= now).sort((a, b) => a[1].at - b[1].at).forEach(([i, j]) => { jobs.delete(i); j.fn(); }); },
  };
}

test('undo queue: the call waits six seconds and then commits', () => {
  const t = fakeTimers(); const q = createUndoQueue(t);
  let sent = 0; q.defer('Task deleted', () => sent++);
  t.advance(5999); assert.equal(sent, 0); assert.equal(q.pending(), 1);
  t.advance(1); assert.equal(sent, 1); assert.equal(q.pending(), 0);
});

test('undo queue: undoing means nothing was ever sent', () => {
  const t = fakeTimers(); const q = createUndoQueue(t);
  let sent = 0; const h = q.defer('Event deleted', () => sent++);
  t.advance(3000);
  assert.equal(h.undo(), true);
  t.advance(10000);
  assert.equal(sent, 0);
  assert.equal(h.undo(), false, 'second undo is a no-op');
});

test('undo queue: flush commits immediately, several entries are independent, listeners see the list', () => {
  const t = fakeTimers(); const q = createUndoQueue(t);
  const seen = []; q.onChange(l => seen.push(l.map(x => x.label).join('|')));
  let a = 0, b = 0;
  const ha = q.defer('A', () => a++); q.defer('B', () => b++);
  ha.flush();
  assert.equal(a, 1); assert.equal(b, 0);
  t.advance(6000); assert.equal(b, 1); assert.equal(a, 1, 'flushed entry does not fire twice');
  assert.deepEqual(seen, ['A', 'A|B', 'B', '']);
});

// numbers measured on the real Fast Search Card, iPhone page 393 x 703 (column at 0,56; the grid button at 16,104 in column units)
const phone = { frame: { left: 0, top: 56, width: 393, offsetWidth: 393 }, innerW: 393, innerH: 703, ratio: 0.74 };
const grid = { left: 16, top: 160, width: 36, height: 36 };

test('morph popup: the category window is 353 wide on a phone and lines up with its button', () => {
  const r = morphRects({ ...phone, anchor: grid, width: 360, placement: 'anchor-left', contentH: 159 });
  assert.equal(r.C, 353);                                  // 393 - 40, not the 360 asked for
  assert.equal(r.A, 16); assert.equal(r.E, 104);           // left edges line up, top on the button (column-relative)
  assert.equal(r.N, 159);
  assert.equal(r.bx, 174.5); assert.equal(r.by, 104 + 159 + 14);   // the close button is 36 wide, centred, 14px under
});

test('morph popup: "anchor" lines the right edges up, "center" sits in the middle of the window', () => {
  const right = morphRects({ ...phone, anchor: { left: 330, top: 160, width: 44, height: 44 }, width: 280, placement: 'anchor', contentH: 200 });
  assert.equal(right.A + right.C, 330 + 44);
  const mid = morphRects({ ...phone, anchor: null, width: 300, placement: 'center', contentH: 200 });
  assert.equal(mid.A, Math.round(393 / 2 - 150));
  assert.equal(mid.E, Math.round((703 / 2 - 56) - 100));
});

test('morph popup: zoomed column - sizes come out in the column\'s own units', () => {
  // the 1200 px column shown at 1.26: rect width 1512, offsetWidth 1200
  const r = morphRects({ frame: { left: 0, top: 56, width: 1512, offsetWidth: 1200 }, anchor: { left: 126, top: 200, width: 55.44, height: 55.44 }, innerW: 1512, innerH: 800, width: 360, placement: 'anchor-left', contentH: 159 });
  assert.equal(Math.round(r.l * 100), 126);
  assert.equal(r.C, 360); assert.equal(r.A, 100);
  assert.equal(r.maxH, Math.max(200, Math.round(800 / 1.26 - 56 / 1.26 - r.von.t - 62)));
});

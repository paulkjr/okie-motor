'use strict';
// feel pass: pure CSS transforms of okie-polish (loaded outside a browser the module only exports nothing, so test via a stub document)
const assert = require('assert');
global.document = { addEventListener() {} };
global.window = global;
global.OkieMotor = {};
require('../src/okie-polish.js');
const P = global.OkieMotor.polish;
const test = (n, f) => { try { f(); console.log('ok  ' + n); } catch (e) { console.error('FAIL ' + n + '\n' + e.message); process.exitCode = 1; } };

test('hover rule moves into a hover media query', () => {
  const o = P.gateHover('.a{color:red}.b:hover{color:blue}');
  assert(o.includes('.a{color:red}'));
  assert(o.includes('@media (hover:hover) and (pointer:fine){.b:hover{color:blue}}'));
});
test('mixed selector list keeps the non-hover part', () => {
  const o = P.gateHover('.a:hover,.a.on{x:1}');
  assert(o.includes('.a.on{x:1}'));
  assert(o.includes('(pointer:fine){.a:hover{x:1}}'));
});
test('nested in @media recurses, keyframes and gated rules stay', () => {
  const o = P.gateHover('@media (max-width:600px){.a:hover{x:1}}@keyframes k{from{a:1}to{a:2}}@media (hover:hover){.c:hover{y:1}}');
  assert(o.includes('@media (max-width:600px){@media (hover:hover) and (pointer:fine){.a:hover{x:1}}}'));
  assert(o.includes('@keyframes k{from{a:1}to{a:2}}'));
  assert(o.includes('@media (hover:hover){.c:hover{y:1}}'));
});
test('braces inside strings and :not(:hover) are left alone', () => {
  const o = P.gateHover('.a::after{content:"}{"}.b:not(:hover){x:1}');
  assert.strictEqual(o, '.a::after{content:"}{"}.b:not(:hover){x:1}');
});
test('short ease becomes strong ease-out, slow and looping motion stays', () => {
  assert(P.strongEase('.a{transition:opacity .2s ease;}').includes('opacity .2s ' + P.EASE));
  assert(P.strongEase('.a{animation:ov-in .22s ease-out}').includes('ov-in .22s ' + P.EASE));
  assert.strictEqual(P.strongEase('.a{transition:transform 4s ease}'), '.a{transition:transform 4s ease}');
  assert.strictEqual(P.strongEase('.a{animation:p 1.1s ease-out infinite}'), '.a{animation:p 1.1s ease-out infinite}');
  assert.strictEqual(P.strongEase('.a{transition:transform .5s var(--zen-ease)}'), '.a{transition:transform .5s var(--zen-ease)}');
  assert.strictEqual(P.strongEase('.a{transition:width .4s cubic-bezier(.34,1.18,.24,1)}'), '.a{transition:width .4s cubic-bezier(.34,1.18,.24,1)}');
});

test('no stylesheet shrinks a card, a row or an edge button on press (only the small controls do, through okie-polish)', () => {
  const fs = require('fs'), dir = __dirname + '/../src/', css = fs.readdirSync(dir).filter(f => /^okie-.*\.js$/.test(f)).map(f => fs.readFileSync(dir + f, 'utf8')).join('\n');
  const bad = [...css.matchAll(/([^{}'"]*):active([^{}'"]*)\{[^}]*transform:\s*scale\(/g)].map(m => (m[1] + ':active' + m[2]).trim()).filter(sel => /(^|[\s,])(button:not\(:disabled\)|\[role=button\]|\.device-card|\.device-list-item|\.rm-card|\.rc(\.open)?|\.rc-go|\.lmc-go|\.camcard|\.gcard)$/.test(sel.replace(/:active$/, '')));
  assert.deepEqual(bad, []);
});

test('press tint: dim a light surface, brighten a dark, coloured or see-through one', () => {
  assert.ok(/^rgba\(0,0,0/.test(P.tintFor('rgb(255, 255, 255)')));
  assert.ok(/^rgba\(0,0,0/.test(P.tintFor('rgba(214, 208, 200, 1)')));
  assert.ok(/^rgba\(255,255,255,\.17/.test(P.tintFor('rgb(102, 102, 240)')));
  assert.ok(/^rgba\(255,255,255,\.12/.test(P.tintFor('rgba(0, 0, 0, 0)')));
  assert.ok(/^rgba\(255,255,255,\.12/.test(P.tintFor('rgba(255, 255, 255, 0.1)')));
  assert.ok(/^rgba\(255,255,255/.test(P.tintFor('')));
});

test('backdrop-filter that comes from var() is found with its @media, and written again with the value worked out', () => {
  const css = '.glass{background:red;-webkit-backdrop-filter:var(--glass-backdrop);backdrop-filter:var(--glass-backdrop);}.plain{-webkit-backdrop-filter:blur(8px);}@media (max-width:600px){.m,.n::before{-webkit-backdrop-filter:var(--okie-card-bf,none)!important;}}.x:hover{backdrop-filter:blur(calc(10px + var(--b,0px))) saturate(240%)}@keyframes k{from{opacity:0}}';
  const rules = P.bfRules(css);
  assert.equal(rules.length, 3);
  assert.deepEqual(rules.map(r => r.sel), ['.glass', '.m,.n::before', '.x:hover']);
  assert.deepEqual(rules[1].chain, ['@media (max-width:600px)']);
  assert.equal(rules[1].important, true);
  const out = P.bfCss(rules, v => v === 'var(--glass-backdrop)' ? 'blur(20px) saturate(1.8)' : v === 'var(--okie-card-bf,none)' ? 'none' : 'blur(calc(10px + 0px)) saturate(240%)');
  assert.ok(out.includes('.glass{-webkit-backdrop-filter:blur(20px) saturate(1.8);}'));
  assert.ok(out.includes('@media (max-width:600px){.m,.n::before{-webkit-backdrop-filter:none!important;}}'));
  assert.ok(out.includes('.x:hover{-webkit-backdrop-filter:blur(calc(10px + 0px)) saturate(240%);}'));
  assert.equal(P.bfCss(rules, () => '').split('none').length - 1, 3, 'an unresolved value turns the filter off instead of leaving a broken one');
});

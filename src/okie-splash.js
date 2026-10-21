/* okie-splash: a "hello" drawn with SVG strokes (two strokes with a pen lift
 * between them), or a quiet progress bar, then a spring reveal: the UI comes
 * in from blur to clear, scaling up with a small Y translate.
 * Setting: splash = none | progress | handwritten.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // Two strokes: "hell" in one pen movement, then the "o".
  var STROKES = [
    'M18 98 C14 70 22 30 30 22 C38 14 38 40 30 70 C28 82 34 60 48 58 C60 56 58 82 62 96 C70 90 80 70 76 62 C72 56 62 64 66 80 C68 92 82 94 90 84 C100 70 104 30 112 22 C120 16 118 50 108 74 C106 84 112 92 122 84 C130 70 134 30 142 22 C150 16 148 50 138 74 C136 84 142 92 152 84',
    'M168 72 C152 64 160 98 180 92 C198 86 192 58 174 64 C178 68 192 72 208 64',
  ];
  /** Timeline in ms: stroke 1, pen lift, stroke 2, hold, fade. */
  var TIMING = { s1: 1100, lift: 260, s2: 520, hold: 380, fade: 520 };
  function total() { return TIMING.s1 + TIMING.lift + TIMING.s2 + TIMING.hold + TIMING.fade; }
  var api = { STROKES: STROKES, TIMING: TIMING, total: total };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, h = UI.h;
  var CSS = [
    '.splash{position:absolute;inset:0;z-index:90;display:grid;place-items:center;background:radial-gradient(ellipse at 50% 40%,#2b2723,#0e0d0c);transition:opacity .5s ease,filter .5s ease;}',
    '.splash.out{opacity:0;filter:blur(14px);pointer-events:none;}',
    '.splash svg{width:min(60vw,360px);height:auto;overflow:visible;}',
    '.splash path{fill:none;stroke:#f4f1ed;stroke-width:5;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1;}',
    '.splash .bar{width:min(50vw,260px);height:4px;border-radius:2px;background:rgba(255,255,255,.14);overflow:hidden;}',
    '.splash .bar i{display:block;height:100%;width:0;background:#fff;border-radius:2px;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  g.OkieMotor.defaults = Object.assign(g.OkieMotor.defaults || {}, { splash: 'none' });
  var yes = function (en, de) { return { en: en, de: de }; };
  g.OkieMotor.settingsRows = (g.OkieMotor.settingsRows || []).concat([
    { id: 'splash', tab: 'appearance', group: yes('Start-up', 'Start'), type: 'segment', path: 'splash', label: yes('Splash screen', 'Startbild'), desc: yes('Nothing, a quiet progress bar, or a handwritten "hello".', 'Nichts, ein ruhiger Fortschrittsbalken oder ein handgeschriebenes "hello".'),
      options: [{ id: 'none', label: yes('None', 'Keins') }, { id: 'progress', label: yes('Progress', 'Fortschritt') }, { id: 'handwritten', label: yes('Handwritten', 'Handschrift') }] },
  ]);

  var played = false;
  /** Spring-like reveal of the UI pieces (blur to clear, scale up, small Y translate). */
  function reveal(stage) {
    var reduce = g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return;
    ['.island', '.dock', '.panel'].forEach(function (sel, i) {
      var el = stage.querySelector(sel); if (!el || !el.animate) return;
      el.animate([{ opacity: 0, filter: 'blur(14px)', transform: (el.classList.contains('island') ? 'translateX(-50%) ' : '') + 'translateY(14px) scale(.96)' }, { opacity: 1, filter: 'blur(0)', transform: (el.classList.contains('island') ? 'translateX(-50%) ' : '') + 'none' }],
        { duration: 650, delay: i * 90, easing: 'cubic-bezier(.2,1.25,.3,1)', fill: 'backwards' });
    });
  }
  api.run = function (ctx, done) {
    var mode = ctx.settings.get().splash;
    if (played || !mode || mode === 'none') { played = true; reveal(ctx.stage); if (done) done(); return null; }
    played = true;
    var el = h('div.splash', { 'aria-hidden': 'true' });
    var T = TIMING;
    if (mode === 'handwritten') {
      var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('viewBox', '0 0 230 120');
      var paths = STROKES.map(function (d) { var p = document.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('d', d); p.setAttribute('pathLength', '1'); svg.appendChild(p); return p; });
      el.appendChild(svg); ctx.stage.appendChild(el);
      if (paths[0].animate) {
        paths[0].animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: T.s1, easing: 'ease-in-out', fill: 'forwards' });
        paths[1].animate([{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: T.s2, delay: T.s1 + T.lift, easing: 'ease-out', fill: 'forwards' });
      } else paths.forEach(function (p) { p.style.strokeDashoffset = '0'; });
    } else {
      var fill = h('i'); el.appendChild(h('div.bar', null, fill)); ctx.stage.appendChild(el);
      if (fill.animate) fill.animate([{ width: '0%' }, { width: '100%' }], { duration: 900, easing: 'cubic-bezier(.3,.7,.2,1)', fill: 'forwards' });
    }
    var wait = mode === 'handwritten' ? T.s1 + T.lift + T.s2 + T.hold : 1000;
    setTimeout(function () { el.classList.add('out'); reveal(ctx.stage); setTimeout(function () { el.remove(); if (done) done(); }, T.fade); }, wait);
    return el;
  };
  g.OkieMotor.splash = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

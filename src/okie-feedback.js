/* okie-feedback: the small taps and ticks the card gives back.
 *
 *   kinds     tap (a button), switch (a toggle), detent (a step of a slider or dial), limit (the end of a slider or dial), error
 *   haptic    Android vibrates; an iPhone gets a light tick through a hidden switch (iOS 17.4 and newer)
 *   sound     an optional soft tick (Settings > Mobile > Tick sound), made on the spot with Web Audio, no file
 *   spacing   at most one tick every 28 ms (a fast drag over a dial must not become a buzz); an error always goes through
 *   One listener on the card turns every click on a button, switch or tab into a tap, and every step of a slider into a detent, so no screen has to ask for it.
 */
(function (g) {
  'use strict';

  var MIN_GAP = 28;
  var KINDS = {
    tap:    { ms: 8,  hz: 1500, len: 0.012, gain: 0.045 },
    switch: { ms: 12, hz: 1050, len: 0.016, gain: 0.06 },
    detent: { ms: 4,  hz: 2300, len: 0.006, gain: 0.025 },
    limit:  { ms: 18, hz: 700,  len: 0.022, gain: 0.07 },
    error:  { ms: 30, hz: 420,  len: 0.05,  gain: 0.08 },
  };
  var KEEP = Object.keys(KINDS);

  /** A kind name or a number of milliseconds (the older calls) → { kind, ms, hz, len, gain } */
  function profile(k) {
    if (typeof k === 'string' && KINDS[k]) return Object.assign({ kind: k }, KINDS[k]);
    var ms = +k > 0 ? +k : KINDS.tap.ms;
    var kind = ms >= 25 ? 'error' : ms >= 12 ? 'switch' : ms <= 5 ? 'detent' : 'tap';
    return Object.assign({ kind: kind }, KINDS[kind], { ms: ms });
  }

  /** What to do for one request: { vibrate (ms or 0), sound (the profile or null) }; settings: { haptic, sound } */
  function plan(k, settings, last, now) {
    var p = profile(k), s = settings || {};
    if (p.kind !== 'error' && last != null && now - last < MIN_GAP) return { vibrate: 0, sound: null, skipped: true };
    return { vibrate: s.haptic === false ? 0 : p.ms, sound: s.sound === true ? p : null, skipped: false };
  }

  /** Which element a click belongs to: 'switch' | 'tap' | '' */
  var SWITCH = '.sw,[role="switch"],.th-sw,input[type="checkbox"]';
  var TAPPY = 'button,[role="button"],[role="tab"],.device-card,.device-list-item,.w1-tab,.cp,summary';
  function kindOf(el) {
    if (!el || !el.closest) return '';
    if (el.closest(SWITCH)) return 'switch';
    if (el.closest(TAPPY)) return 'tap';
    return '';
  }

  /** An answer of the assistant (markdown) as a sentence to say: no marks, no links, no emoji, not a whole page */
  function speakable(md, max) {
    var s = String(md == null ? '' : md);
    s = s.replace(/```[\s\S]*?```/g, ' ').replace(/`([^`]*)`/g, '$1').replace(/!\[[^\]]*\]\([^)]*\)/g, ' ').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/https?:\/\/\S+/g, ' ').replace(/^\s{0,3}#{1,6}\s*/gm, '').replace(/^\s*[-*+]\s+/gm, '').replace(/^\s*\d+[.)]\s+/gm, '')
      .replace(/[*_~>|]/g, '').replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '').replace(/\s*\n+\s*/g, '. ').replace(/\.\s*\./g, '.').replace(/\s+/g, ' ').trim();
    var lim = max || 320;
    if (s.length > lim) { var cut = s.slice(0, lim), at = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? ')); s = (at > 80 ? cut.slice(0, at + 1) : cut.replace(/\s+\S*$/, '') + '…'); }
    return s;
  }

  // ---- browser side ---------------------------------------------------------------------------------------------------------------------------------
  var last = null, audio = null, tickLabel = null;

  function iosTick() {
    try {
      if (!tickLabel) {
        var l = document.createElement('label'), i = document.createElement('input');
        i.type = 'checkbox'; i.setAttribute('switch', ''); l.appendChild(i); l.setAttribute('aria-hidden', 'true'); l.setAttribute('data-okie-haptic', ''); l.style.display = 'none';
        (document.head || document.documentElement).appendChild(l); tickLabel = l;
      }
      tickLabel.click(); return true;
    } catch (e) { return false; }
  }

  function beep(p) {
    try {
      var AC = g.AudioContext || g.webkitAudioContext; if (!AC) return;
      if (!audio) audio = new AC();
      if (audio.state === 'suspended') audio.resume();
      var t = audio.currentTime, o = audio.createOscillator(), v = audio.createGain();
      o.type = 'sine'; o.frequency.setValueAtTime(p.hz, t); o.frequency.exponentialRampToValueAtTime(p.hz * 0.6, t + p.len);
      v.gain.setValueAtTime(0.0001, t); v.gain.exponentialRampToValueAtTime(p.gain, t + 0.002); v.gain.exponentialRampToValueAtTime(0.0001, t + p.len);
      o.connect(v); v.connect(audio.destination); o.start(t); o.stop(t + p.len + 0.01);
    } catch (e) { /* no audio here */ }
  }

  /** fire(settings, kind | ms) → whether anything went out */
  function fire(settings, k) {
    var now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
    var a = plan(k, settings, last, now);
    if (a.skipped) return false;
    last = now;
    try {
      if (a.vibrate) { if (g.navigator && navigator.vibrate) navigator.vibrate(a.vibrate); else iosTick(); }
      if (a.sound) beep(a.sound);
    } catch (e) { /* not every browser vibrates */ }
    return true;
  }

  /** One listener on the card's root: clicks on controls and the steps of sliders and dials. Returns the function that removes it. */
  function wire(root, getSettings) {
    function onClick(e) {
      if (e.detail === 0) return;                                  // a key press, not a touch
      var path = e.composedPath ? e.composedPath() : [e.target], el = null;
      for (var i = 0; i < path.length; i++) { if (path[i] && path[i].nodeType === 1) { el = path[i]; break; } }
      var k = kindOf(el);
      if (k) fire(getSettings(), k);
    }
    function onDetent(e) { fire(getSettings(), e.detail && e.detail.limit ? 'limit' : 'detent'); }
    root.addEventListener('click', onClick, true);
    root.addEventListener('okie-detent', onDetent);
    return function () { root.removeEventListener('click', onClick, true); root.removeEventListener('okie-detent', onDetent); };
  }

  /** A slider or dial says it moved one step (or hit its end). */
  function detent(el, limit) {
    try { el.dispatchEvent(new CustomEvent('okie-detent', { bubbles: true, composed: true, detail: { limit: !!limit } })); } catch (e) { /* no events */ }
  }

  var api = { KINDS: KINDS, KEEP: KEEP, MIN_GAP: MIN_GAP, profile: profile, plan: plan, speakable: speakable, kindOf: kindOf, fire: fire, wire: wire, detent: detent, tick: iosTick };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.feedback = api; }
})(typeof globalThis !== 'undefined' ? globalThis : window);

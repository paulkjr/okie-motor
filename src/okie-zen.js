/* okie-zen: the lock page. Date, big clock, weather + power, a greeting or quote,
 * a context line ("Last: ..."), and the grip. Swipe up, scroll, press a key or tap
 * the grip to reveal the start screen. Timings and sizes follow Fast Search Card's
 * own lock page (measured from the live card, see docs/FSC-LAYOUT-SPEC.md).
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  // ------------------------------------------------------------- text ----
  var GREETINGS = {
    en: {
      morning: ['Good morning', 'Rise and shine', 'Good to see you', 'Ready for a good day', 'A fresh start', 'The day is yours', 'Coffee first', 'Off to a good start'],
      afternoon: ['Good afternoon', 'Keep it going', "You're doing great", 'Nice to see you', 'Halfway there', 'Welcome back', 'All under control', 'Take a little breather'],
      evening: ['Good evening', 'Almost done', 'Time to relax', 'You earned this', 'Make yourself comfortable', 'The evening is yours', 'Well done today', 'Time to wind down'],
    },
    de: {
      morning: ['Guten Morgen', 'Einen schönen Morgen', 'Schön, dass du da bist', 'Bereit für einen guten Tag', 'Ein frischer Start', 'Der Tag gehört dir', 'Erst mal einen Kaffee', 'Guter Start in den Tag'],
      afternoon: ['Guten Tag', 'Schönen Nachmittag', 'Weiter so', 'Du machst das gut', 'Halbzeit', 'Willkommen zurück', 'Alles im Griff', 'Gönn dir eine kleine Pause'],
      evening: ['Guten Abend', 'Schönen Abend', 'Fast geschafft', 'Zeit zum Entspannen', 'Mach es dir gemütlich', 'Der Abend gehört dir', 'Gut gemacht heute', 'Zeit, runterzufahren'],
    },
  };
  // Attributions only where the source is solid; everything else stays anonymous.
  var QUOTES = {
    en: [
      ['Well begun is half done.', ''], ['Simplicity is the ultimate sophistication.', ''], ['The best way out is always through.', 'Robert Frost'],
      ['Do what you can, with what you have, where you are.', ''], ['It always seems impossible until it is done.', ''], ['Whatever you are, be a good one.', ''],
      ['Quality is not an act, it is a habit.', 'Will Durant'], ['The secret of getting ahead is getting started.', ''], ['A journey of a thousand miles begins with a single step.', 'Lao Tzu'],
      ['Small things done well make a big difference.', ''], ['Make it simple, but significant.', ''], ['Home is where the good lights are.', ''],
    ],
    de: [
      ['Frisch gewagt ist halb gewonnen.', ''], ['In der Ruhe liegt die Kraft.', ''], ['Der Weg ist das Ziel.', ''],
      ['Wer rastet, der rostet.', ''], ['Aller Anfang ist leicht, ein Anfang ist schwer.', ''], ['Kleine Dinge, gut gemacht, machen den Unterschied.', ''],
      ['Zuhause ist, wo das Licht für dich brennt.', ''], ['Jeder Tag ist ein neuer Anfang.', ''], ['Einfachheit ist die höchste Stufe der Vollendung.', ''],
      ['Eine Reise von tausend Meilen beginnt mit dem ersten Schritt.', 'Laotse'], ['Wo ein Wille ist, ist auch ein Weg.', ''], ['Gut Ding will Weile haben.', ''],
    ],
  };
  function daypart(hour) { return hour < 12 ? 'morning' : (hour < 18 ? 'afternoon' : 'evening'); }
  /** Deterministic per hour so it does not flicker on re-render, different each hour. */
  function pick(list, seed) { return list[Math.abs(seed) % list.length]; }
  function greeting(lang, hour, seed, name) {
    var l = lang === 'de' ? 'de' : 'en';
    var g0 = pick(GREETINGS[l][daypart(hour)], seed);
    return name ? g0 + ', ' + name : g0;
  }
  function quote(lang, seed) {
    var q = pick(QUOTES[lang === 'de' ? 'de' : 'en'], seed);
    return { text: '“' + q[0] + '”', by: q[1] ? '— ' + q[1] : '' };
  }
  /** A quote from a sensor ("Quote of the day"): the same look the user's Fast Search Card bridge gives it. */
  function entityQuote(text, author) {
    var n = String(text).length;
    return { text: '"' + text + '"' + (author ? '\n\u2014 ' + author : ''), size: n < 60 ? 34 : (n < 100 ? 28 : (n < 150 ? 23 : 19)),
      get css() { return 'white-space:pre-wrap;word-break:break-word;max-width:min(900px,90vw);margin-left:auto;margin-right:auto;text-align:center;font-size:' + this.size + 'px;line-height:1.35;'; } };
  }
  /** Is a swipe/scroll/key a "reveal" gesture? */
  var REVEAL_DRAG_PX = 60, REVEAL_WHEEL = 20;
  function isRevealKey(key) { return key === 'Enter' || key === ' ' || key === 'ArrowUp' || key === 'ArrowDown' || key === 'PageUp' || key === 'PageDown'; }
  function dragProgress(dy) { return Math.max(0, Math.min(1, dy / 300)); }

  var api = { greeting: greeting, quote: quote, entityQuote: entityQuote, daypart: daypart, GREETINGS: GREETINGS, QUOTES: QUOTES, REVEAL_DRAG_PX: REVEAL_DRAG_PX, REVEAL_WHEEL: REVEAL_WHEEL, isRevealKey: isRevealKey, dragProgress: dragProgress };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------- UI ----
  var UI = g.OkieMotor.ui, L = g.OkieMotor.logic, core = g.OkieMotor.core, h = UI.h;
  core.registerStrings('en', { 'zen.open': 'Open the start screen', 'zen.swipe': 'Swipe up', 'zen.voice': 'Ask the assistant', 'zen.listening': 'Listening...', 'zen.done': 'Done', 'zen.failed': 'That did not work' });
  core.registerStrings('de', { 'zen.open': 'Startbildschirm öffnen', 'zen.swipe': 'Nach oben wischen', 'zen.voice': 'Den Assistenten fragen', 'zen.listening': 'Ich höre zu...', 'zen.done': 'Erledigt', 'zen.failed': 'Das hat nicht geklappt' });

  var CSS = [
    '@keyframes zen-materialize{0%{filter:blur(20px);opacity:0;}100%{filter:blur(0);opacity:1;}}',
    '@keyframes zen-fade-in{0%{opacity:0;}100%{opacity:1;}}',
    '@keyframes zen-breathe{0%,100%{opacity:.45;transform:translateY(0) scaleX(1);}50%{opacity:.95;transform:translateY(-5px) scaleX(1.05);}}',
    '.zen-curtain{position:absolute;inset:0;z-index:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding-top:calc(var(--zen-top,16px) + var(--zen-shift,0px));opacity:1;transition:opacity .3s .26s;touch-action:none;cursor:default;outline:none;}',
    '.stage[data-zen-revealed="true"] .zen-curtain{opacity:0;pointer-events:none;transition:opacity .26s;}',
    '.zen-above{display:flex;flex-direction:column;align-items:center;gap:0;width:calc(100% / var(--okie-zoom,1));zoom:var(--okie-zoom,1);transition:transform 1.6s ease;}',
    '.zen-clock{line-height:1.05;text-align:center;}',
    '.zen-date{animation:zen-materialize .8s var(--zen-ease) 0s backwards;color:rgba(255,255,255,.85);font-size:19px;font-weight:600;letter-spacing:.2px;text-shadow:0 2px 16px rgba(0,0,0,.3);}',
    '.zen-time{animation:zen-materialize .8s var(--zen-ease) .11s backwards;color:#fff;font-size:82px;font-variant-numeric:tabular-nums;font-weight:500;letter-spacing:-2.5px;line-height:1.05;margin-top:2px;text-shadow:0 3px 26px rgba(0,0,0,.32);}',
    '.zen-status{animation:zen-materialize .8s var(--zen-ease) .18s backwards;display:flex;align-items:center;justify-content:center;gap:14px;margin-top:6px;color:rgba(255,255,255,.8);font-size:19px;font-weight:600;text-shadow:0 2px 12px rgba(0,0,0,.3);}',
    '.zen-status-teil{display:inline-flex;align-items:center;gap:5px;}.zen-status svg{opacity:.85;}',
    '.zen-greet{animation:zen-materialize .8s var(--zen-ease) .22s backwards;color:#fff;font-size:var(--zen-greet-size,45px);font-weight:500;letter-spacing:-.9px;margin-top:var(--zen-gap-clock-greet,120px);text-align:center;text-shadow:0 2px 22px rgba(0,0,0,.34);}',
    '.zen-kontext{animation:zen-materialize .8s var(--zen-ease) .32s backwards;color:rgba(255,255,255,.66);font-size:calc(var(--zen-greet-size,45px)*.46);font-weight:500;letter-spacing:-.2px;margin-top:12px;text-align:center;text-shadow:0 2px 18px rgba(0,0,0,.3);white-space:nowrap;}',
    '.zen-grip{animation:zen-fade-in .8s var(--zen-ease) .55s backwards;position:absolute;bottom:var(--zen-grip-bottom,8px);left:50%;margin-left:-58px;width:116px;height:5px;padding:0;}',
    '.zen-mic{animation:zen-fade-in .8s var(--zen-ease) .6s backwards;position:absolute;bottom:calc(var(--zen-grip-bottom,8px) + 34px);left:50%;margin-left:-26px;width:52px;height:52px;border-radius:50%;display:grid;place-items:center;color:#fff;background:rgba(255,255,255,.16);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.22);transition:background .2s,transform .16s cubic-bezier(.23,1,.32,1),opacity 1.4s;}.zen-mic[hidden]{display:none;}@media (hover:hover) and (pointer:fine){.zen-mic:hover{background:rgba(255,255,255,.26);}}.stage[data-ambient="tief"] .zen-mic{opacity:0;pointer-events:none;}',
    '.zen-grip i{display:block;width:100%;height:100%;border-radius:999px;background:rgba(255,255,255,.6);box-shadow:0 0 16px rgba(255,255,255,.4);animation:zen-breathe 3s cubic-bezier(.4,0,.3,1) infinite;}',
    '.zen-grip::before{content:"";position:absolute;inset:-18px -30px;}',
    '.zen-date,.zen-greet,.zen-grip,.zen-kontext,.zen-status,.zen-time{transition:opacity 1.4s;}',
    '.stage[data-ambient="tief"] .zen-time{opacity:.72;}',
    '.stage[data-ambient="tief"] .zen-date,.stage[data-ambient="tief"] .zen-greet,.stage[data-ambient="tief"] .zen-grip,.stage[data-ambient="tief"] .zen-kontext,.stage[data-ambient="tief"] .zen-status{opacity:0;}',
    '.stage[data-ambient="tief"][data-nacht="ja"] .zen-time{color:rgb(242,223,196);opacity:.66;}',
    '.stage[data-ambient="tief"] .zen-grip i{animation-play-state:paused;}',
    '@media (max-width:768px){.zen-time{font-size:68px;}.zen-status{font-size:13px;}.zen-greet{white-space:normal;}.zen-kontext{padding:0 24px;white-space:normal;}.zen-curtain{--zen-top:12px;--zen-grip-bottom:14px;--zen-greet-size:30px;--zen-gap-clock-greet:84px;padding:var(--zen-top) 16px 84px;}}',
    // listening on the lock page: the microphone turns red and pulses, what is heard shows above it, then the answer
    '.zen-mic.listening{background:#ff3b30;color:#fff;animation:zen-rec 1.2s ease-out infinite;}@keyframes zen-rec{0%{box-shadow:0 0 0 0 rgba(255,59,48,.6),inset 0 0 0 1px rgba(255,255,255,.3);}70%{box-shadow:0 0 0 20px rgba(255,59,48,0),inset 0 0 0 1px rgba(255,255,255,.3);}100%{box-shadow:0 0 0 0 rgba(255,59,48,0),inset 0 0 0 1px rgba(255,255,255,.3);}}',
    '.zen-voice{position:absolute;left:50%;transform:translateX(-50%);bottom:calc(var(--zen-grip-bottom,8px) + 34px + 52px + 20px);max-width:min(84%,680px);padding:12px 22px;border-radius:24px;background:rgba(20,18,16,.42);-webkit-backdrop-filter:blur(18px) saturate(1.6);backdrop-filter:blur(18px) saturate(1.6);box-shadow:inset 0 0 0 1px rgba(255,255,255,.18);color:#fff;font-size:20px;font-weight:600;line-height:1.3;text-align:center;z-index:3;pointer-events:none;}.zen-voice[hidden]{display:none;}.zen-voice[data-mode="reply"]{font-weight:500;}.zen-voice.busy::after{content:" ...";opacity:.7;}',
    '@media (prefers-reduced-motion:reduce){.zen-date,.zen-time,.zen-status,.zen-greet,.zen-kontext,.zen-grip,.zen-grip i,.zen-mic{animation:none!important;}}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  /**
   * create(ctx, { reveal() }) -> { el, update(), dispose() }
   * ctx.contextLine() may return the "Last: ..." text.
   */
  function create(ctx, o) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var date = h('div.zen-date'), time = h('div.zen-time'), status = h('div.zen-status'), greet = h('div.zen-greet'), kontext = h('div.zen-kontext');
    var clock = h('div.zen-clock', null, date, time, status);
    var above = h('div.zen-above', null, clock, greet, kontext);
    var grip = h('button.zen-grip', { 'aria-label': t('zen.open'), onclick: function () { o.reveal(); } }, h('i'));
    var mic = h('button.zen-mic', { type: 'button', hidden: true, 'aria-label': t('zen.voice'), title: t('zen.voice'), html: UI.icon('mic', 22), onclick: function (e) { e.stopPropagation(); listen(); } });      // one tap: it listens right here; with no speech recognition the start screen opens and the assistant listens
    var voice = h('div.zen-voice', { hidden: true, 'aria-live': 'polite' }), voiceT = 0;
    var el = h('div.zen-curtain', { role: 'region', 'aria-label': t('zen.open'), tabindex: '0' }, above, voice, mic, grip);
    /** The microphone on the lock page: listen here (the words show live), when the speaking stops the assistant does it and the answer shows, and is said aloud. */
    function listen() {
      var heard = false;
      var cb = {
        state: function (on) {
          mic.classList.toggle('listening', on);
          if (on) { heard = false; clearTimeout(voiceT); voice.classList.remove('busy'); voice.dataset.mode = 'listen'; voice.textContent = t('zen.listening'); voice.hidden = false; }
          else if (heard) voice.classList.add('busy');      // the words are in, the answer is on its way
          else { voice.hidden = true; }
        },
        words: function (txt) { heard = true; voice.dataset.mode = 'listen'; voice.textContent = txt; voice.hidden = false; },
        reply: function (txt, failed) { voice.classList.remove('busy'); voice.dataset.mode = 'reply'; voice.textContent = failed ? t('zen.failed') : (txt || t('zen.done')); voice.hidden = false; clearTimeout(voiceT); voiceT = setTimeout(function () { voice.hidden = true; }, 9000); },
      };
      if (ctx.voiceHere && ctx.voiceHere(cb)) return;
      if (ctx.voice) ctx.voice();
    }

    function hour12() { var tf = ctx.settings.get().timeFormat; return tf === '12h' ? true : (tf === '24h' ? false : undefined); }
    function paint() {
      var d = new Date(), lang = ctx.lang(), z = ctx.settings.get().zen || {};
      var opt = { hour: 'numeric', minute: '2-digit' }; var h12 = hour12(); if (h12 !== undefined) opt.hour12 = h12; else opt.hour12 = undefined;
      date.textContent = d.toLocaleDateString(lang, { weekday: 'long', month: 'long', day: 'numeric' });
      time.textContent = d.toLocaleTimeString(lang, opt);
      // weather + power, the same values as the status row
      status.innerHTML = '';
      var vals = ctx.statusValues ? ctx.statusValues() : [];
      vals.forEach(function (v, i) { status.appendChild(h('span.zen-status-teil', null, h('span', { html: UI.icon(v.icon, i ? 16 : 18) }), v.text)); });
      status.hidden = !vals.length;
      var seed = Math.floor(d.getTime() / 3600000);
      var who = z.name || ((ctx.hass().user && ctx.hass().user.name) || '').split(' ')[0];
      var mode = z.text || 'auto', qe = z.quoteEntity === undefined ? 'sensor.quote_of_the_day' : z.quoteEntity;
      var qs = qe && ctx.hass().states[qe], qraw = qs && qs.state != null ? String(qs.state) : '';
      var qline = (qraw && qraw !== 'unavailable' && qraw !== 'unknown' && qraw !== 'none') ? entityQuote(qraw, qs.attributes && (qs.attributes.a || qs.attributes.author)) : null;
      var asEntity = mode === 'auto' && qline;
      greet.style.cssText = '';
      if (mode === 'none') { greet.hidden = true; }
      else if (asEntity) { greet.hidden = false; greet.textContent = qline.text; greet.style.cssText = qline.css; }
      else if (mode === 'greeting' || mode === 'auto') { greet.hidden = false; greet.textContent = greeting(lang, d.getHours(), seed, who); }
      else { var q = quote(lang, seed); greet.hidden = false; greet.innerHTML = ''; greet.appendChild(document.createTextNode(q.text)); if (q.by) { greet.appendChild(document.createElement('br')); greet.appendChild(document.createTextNode(q.by)); } }
      var line = ctx.contextLine ? ctx.contextLine() : '';
      kontext.textContent = line; kontext.hidden = !line;
      mic.hidden = !(ctx.voiceOk && ctx.voiceOk());
    }
    paint();
    var timer = setInterval(paint, 15000);

    // --- reveal gestures ---
    var sy = 0, dy = 0, drag = false;
    el.addEventListener('pointerdown', function (e) { if (e.target.closest('.zen-mic')) return; drag = true; sy = e.clientY; dy = 0; try { el.setPointerCapture(e.pointerId); } catch (er) {} });
    el.addEventListener('pointermove', function (e) {
      if (!drag) return;
      dy = sy - e.clientY;
      if (dy > 0) { above.style.transition = 'none'; above.style.transform = 'translateY(' + (-dy * 0.4) + 'px)'; above.style.opacity = String(1 - dragProgress(dy)); }
    });
    function endDrag() {
      if (!drag) return; drag = false;
      above.style.transition = ''; above.style.transform = ''; above.style.opacity = '';
      if (dy > REVEAL_DRAG_PX) o.reveal();
    }
    el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);
    el.addEventListener('wheel', function (e) { if (e.deltaY > REVEAL_WHEEL) { e.preventDefault(); o.reveal(); } }, { passive: false });
    el.addEventListener('keydown', function (e) { if (isRevealKey(e.key)) { e.preventDefault(); o.reveal(); } });

    return { el: el, update: paint, focus: function () { el.focus({ preventScroll: true }); }, dispose: function () { clearInterval(timer); } };
  }
  api.create = create;
  g.OkieMotor.zen = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

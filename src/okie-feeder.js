/* okie-feeder: the "Feed the Beasts" card under the cameras on the start screen of a wide screen: when the pets were last fed, and one tap feeds them (a script of Home Assistant).
 * Fed less than 10 minutes ago, the first tap only asks ("Tap again to feed anyway"), so a second person does not feed them twice. The pure part (which script is the feeder, when it last ran,
 * whether a tap needs a second one, the words) is unit-tested.
 * The card has six looks (setting `bento.feederDesign`, chosen with the pencil on the card while the start screen is arranged): "compact", the row of the first version, and the five designs of the
 * feeder widget of the iOS app (Orange cat, Peeking cat, Green leaves, Neon bowl, Bowl). Those are drawn in the widget's design units (a card 158 high; the pictures hang on the left or the right edge, so a
 * card wider than the widget's 338 only gets more room in the middle) with the widget's art, small WebP images from okie-feeder-art.js. Change a design in both places.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  var FEED = /feed|f[uü]tter/i;
  /** The id of the feeding script: the one set in `bento.feeder`, else the first script whose id or name says feed. null when there is none (or it is switched off). */
  function pick(states, setting) {
    if (setting === 'off' || setting === false) return null;
    states = states || {};
    if (setting && setting !== 'auto' && states[setting]) return setting;
    var ids = Object.keys(states).filter(function (id) { return id.indexOf('script.') === 0 && (FEED.test(id) || FEED.test((states[id].attributes || {}).friendly_name || '')); }).sort();
    return ids.length ? ids[0] : null;
  }
  /** When the script last ran, in ms; null when it never did. */
  function lastFed(state) {
    var v = state && state.attributes && state.attributes.last_triggered, t = v ? Date.parse(v) : NaN;
    return isNaN(t) ? null : t;
  }
  /** Fed within the last `minutes`: a tap then needs a second one. */
  function recent(ms, now, minutes) { return ms != null && now - ms >= 0 && now - ms < (minutes || 10) * 60000; }
  /** "Today 6:09 AM" / "Yesterday 9:00 PM" / "Mon 6:09 AM": the words are given (today, yesterday), the clock is the card's own text. */
  function when(ms, now, words, clock, weekday) {
    var d = new Date(ms), n = new Date(now), day0 = function (x) { return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime(); };
    var diff = Math.round((day0(n) - day0(d)) / 86400000), w = diff === 0 ? words.today : diff === 1 ? words.yesterday : weekday(d);
    return w + ' ' + clock(ms);
  }

  // ------------------------------------------------------- designs ----
  /** The looks of the card. Art: { k: picture, w: width, x: from the left | r: from the right, y: from the top, op: opacity, rot: degrees, flip, fade: share of the width its left edge fades in over }. Text: { size, x, y, w | r (from the right), track }; a number is px, a string is a CSS length. */
  var DESIGNS = {
    compact: { h: 92 },
    classic: { h: 158, glass: true, accent: '#ff962d',
      art: [{ k: 'paws', w: 48, r: 14, y: 8, op: 0.3, rot: 8 }, { k: 'badgeOrange', w: 70, x: 20, y: 44 }],
      title: { size: 19, x: 108, y: 48, r: 14 }, line: { size: 14, x: 108, y: 82, r: 14 } },
    peek: { h: 158, top: '#2f2926', bottom: '#1c1917', accent: '#ff962d',
      art: [{ k: 'peek', w: 206, r: -2, y: 63 }],
      title: { size: 22, x: 20, y: 30, w: 130, two: 26 }, line: { size: 13, x: 20, y: 96, w: 110 } },
    leaves: { h: 158, top: '#222d22', bottom: '#141b14', accent: '#8f9c74',
      art: [{ k: 'leaf', w: 112, r: -12, y: 58, op: 0.95 }, { k: 'leaf', w: 78, x: -22, y: -16, op: 0.9, rot: 150, flip: true }, { k: 'badgeCream', w: 70, x: 20, y: 44 }],
      title: { size: 17, x: 108, y: 49, r: 4 }, line: { size: 14, x: 108, y: 82, r: 52 } },
    neon: { h: 158, top: '#1d1513', bottom: '#110c0b', accent: '#ff7a1f',
      art: [{ k: 'ring', w: 86, x: 12, y: 36 }, { k: 'neonBowl', w: 118, r: -2, y: 76, fade: 0.08 }],
      title: { size: 17, x: 108, y: 49, r: 4 }, line: { size: 14, x: 108, y: 82, w: 120 } },
    bowl: { h: 158, top: '#3b2b23', bottom: '#1a1210', accent: '#ff962d', scene: 'bowlScene',
      art: [],
      title: { size: 15, x: '38.8%', y: 57, r: '2.7%', track: 0.02 }, line: { size: 11.5, x: '38.8%', y: 83, r: '17.5%' } },
  };
  var ORDER = ['compact', 'classic', 'peek', 'leaves', 'neon', 'bowl'];
  /** A saved choice made safe: anything that is not a design is the compact row. */
  function designId(v) { return Object.prototype.hasOwnProperty.call(DESIGNS, v) ? v : 'compact'; }
  /** How high the card is in this design (the grid row of the right column follows it). */
  function heightOf(v) { return DESIGNS[designId(v)].h; }
  /** "Feed The Beasts" -> { first: "Feed The", last: "Beasts" }: the peeking cat sets the name on two lines. */
  function splitTitle(s) { var w = String(s == null ? '' : s).trim().split(/\s+/).filter(Boolean); return w.length < 2 ? { first: w[0] || '', last: '' } : { first: w.slice(0, -1).join(' '), last: w[w.length - 1] }; }

  var api = { pick: pick, lastFed: lastFed, recent: recent, when: when, DESIGNS: DESIGNS, ORDER: ORDER, designId: designId, heightOf: heightOf, splitTitle: splitTitle };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;
  g.OkieMotor.feeder = api;

  // ------------------------------------------------------------ DOM ----
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, F = g.OkieMotor.feeds, h = UI.h, ART = g.OkieMotor.feederArt || {};
  core.registerStrings('en', { 'fd.title': 'Feed the beasts', 'fd.feed': 'Feed', 'fd.confirm': 'Feed anyway', 'fd.again': 'Fed just now. Tap again to feed anyway', 'fd.feeding': 'Feeding...', 'fd.last': 'Fed {when}', 'fd.never': 'Not fed yet', 'fd.today': 'Today', 'fd.yesterday': 'Yesterday',
    'fd.design': 'Look of the feeder card', 'fd.design_hint': 'Tap a look to use it. It is the same set as the feeder widget of the iPhone and iPad app.', 'fd.done': 'Done', 'fd.edit': 'Change the look',
    'fd.d.compact': 'Compact', 'fd.d.classic': 'Orange cat', 'fd.d.peek': 'Peeking cat', 'fd.d.leaves': 'Green leaves', 'fd.d.neon': 'Neon bowl', 'fd.d.bowl': 'Bowl' });
  core.registerStrings('de', { 'fd.title': 'Tiere füttern', 'fd.feed': 'Füttern', 'fd.confirm': 'Trotzdem', 'fd.again': 'Gerade gefüttert. Nochmal tippen, um trotzdem zu füttern', 'fd.feeding': 'Füttere...', 'fd.last': 'Zuletzt {when}', 'fd.never': 'Noch nicht gefüttert', 'fd.today': 'Heute', 'fd.yesterday': 'Gestern',
    'fd.design': 'Aussehen der Futter-Karte', 'fd.design_hint': 'Ein Aussehen antippen, um es zu nehmen. Es sind dieselben wie beim Futter-Widget der iPhone- und iPad-App.', 'fd.done': 'Fertig', 'fd.edit': 'Aussehen ändern',
    'fd.d.compact': 'Kompakt', 'fd.d.classic': 'Orange Katze', 'fd.d.peek': 'Spähende Katze', 'fd.d.leaves': 'Grüne Blätter', 'fd.d.neon': 'Neon-Napf', 'fd.d.bowl': 'Napf' });
  var CAT = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="31" fill="#2a1a10"/><circle cx="32" cy="32" r="29" fill="none" stroke="#ff8a1f" stroke-width="3"/>' +
    '<path d="M16 31 L20 14 L31 23 Z M48 31 L44 14 L33 23 Z" fill="#ff8a1f"/><ellipse cx="32" cy="38" rx="17" ry="15" fill="#ff8a1f"/>' +
    '<circle cx="26" cy="36" r="2.6" fill="#2a1a10"/><circle cx="38" cy="36" r="2.6" fill="#2a1a10"/><path d="M29.5 41.5 L34.5 41.5 L32 45 Z" fill="#2a1a10"/></svg>';

  /** Puts a card element into a design: its pictures and its text boxes. Returns { titles: [the name's boxes], line, go } for the text. */
  function skin(el, id) {
    var bar = [].filter.call(el.children, function (c) { return c.classList.contains('wm'); })[0];      // the bar of the arrangement (added by the start screen) stays on top through a change of look
    [].slice.call(el.children).forEach(function (c) { if (c !== bar) el.removeChild(c); });
    var parts = dress(el, id);
    if (bar) el.appendChild(bar);
    return parts;
  }
  function dress(el, id) {
    var d = DESIGNS[id];
    el.dataset.design = id; el.style.background = '';
    el.classList.toggle('fdi', id !== 'compact'); el.classList.toggle('glass', !!d.glass);
    if (id === 'compact') {
      var title = h('div.fdc-title'), sub = h('div.fdc-sub'), go = h('span.fdc-go');
      el.appendChild(h('span.fdc-badge', { html: CAT })); el.appendChild(h('div.fdc-text', null, title, sub)); el.appendChild(go);
      return { titles: [title], line: sub, go: go };
    }
    if (d.top) { el.style.setProperty('--fdc-top', d.top); el.style.setProperty('--fdc-bot', d.bottom); }
    el.style.setProperty('--fdc-accent', d.accent);
    if (d.scene && ART[d.scene]) el.style.background = 'url(' + ART[d.scene].u + ') center bottom / cover no-repeat, ' + d.bottom;
    d.art.forEach(function (a) {
      var im = ART[a.k]; if (!im) return;
      var st = { width: a.w + 'px', height: Math.round(a.w * im.h / im.w * 10) / 10 + 'px', top: a.y + 'px' };
      if (a.r != null) st.right = a.r + 'px'; else st.left = a.x + 'px';
      if (a.op != null) st.opacity = a.op;
      if (a.fade) st.webkitMaskImage = st.maskImage = 'linear-gradient(90deg,transparent,#000 ' + a.fade * 100 + '%)';      // the picture has its own dark ground: its left edge melts into the card
      if (a.rot || a.flip) st.transform = (a.rot ? 'rotate(' + a.rot + 'deg)' : '') + (a.flip ? ' scaleX(-1)' : '');
      el.appendChild(h('img.fdi-art', { src: im.u, alt: '', style: st }));
    });
    function box(t, top) {
      var st = { top: top + 'px', '--fdc-fs': t.size + 'px', left: typeof t.x === 'number' ? t.x + 'px' : t.x };
      if (t.w != null) st.width = t.w + 'px'; else st.right = typeof t.r === 'number' ? t.r + 'px' : t.r;
      return st;
    }
    var titles = [h('div.fdi-t', { style: box(d.title, d.title.y) })];
    if (d.title.two) titles.push(h('div.fdi-t', { style: box(d.title, d.title.y + d.title.two) }));
    if (d.title.track != null) titles.forEach(function (x) { x.style.letterSpacing = d.title.track + 'em'; });
    var line = h('div.fdi-l', { style: box(d.line, d.line.y) });
    titles.forEach(function (x) { el.appendChild(x); }); el.appendChild(line);
    return { titles: titles, line: line, go: h('span.fdc-go') };
  }
  /** The name into the card's title box(es): the peeking cat sets it on two lines. */
  function setTitle(parts, name) {
    if (parts.titles.length === 2) { var sp = splitTitle(name); parts.titles[0].textContent = sp.first; parts.titles[1].textContent = sp.last; }
    else parts.titles[0].textContent = name;
  }
  /** A card in a design at the width of the widget (338), for the picker: the same drawing as the real card, not a picture of it. */
  function preview(id, tx) {
    var card = h('section.device-list-item.fdc', { style: { width: '338px', height: DESIGNS[id].h + 'px' } }), parts = skin(card, id);
    setTitle(parts, tx.name); parts.line.textContent = tx.line; parts.go.textContent = tx.go;
    return card;
  }

  /** The card; null when the house has no feeding script. Returns { el, update, dispose, text, design }. */
  function buildCard(ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var st0 = ctx.hass() && ctx.hass().states, id = pick(st0, (ctx.settings.get().bento || {}).feeder);
    if (!id) return null;
    var armedUntil = 0, feeding = 0, timer = null, design = null, parts = null, said = { name: '', line: '', go: '' };
    var el = h('section.device-list-item.fdc', { role: 'button', tabindex: '0', dataset: { feeder: id } });
    function wanted() { return designId((ctx.settings.get().bento || {}).feederDesign); }
    function state() { var s = ctx.hass() && ctx.hass().states[id]; return s || null; }
    function paint() {
      if (design !== wanted()) { design = wanted(); parts = skin(el, design); }
      var s = state(), now = Date.now(), ms = lastFed(s), armed = armedUntil > now, busy = feeding > now || (s && s.state === 'on');
      var name = (s && s.attributes && s.attributes.friendly_name) || t('fd.title');
      setTitle(parts, name); el.setAttribute('aria-label', name);
      var line = armed ? t('fd.again') : busy ? t('fd.feeding') : ms == null ? t('fd.never')
        : t('fd.last', { when: when(ms, now, { today: t('fd.today'), yesterday: t('fd.yesterday') }, function (m) { return F.timeText(m, ctx.lang(), ctx.settings.get().timeFormat); }, function (d) { return d.toLocaleDateString(ctx.lang() === 'de' ? 'de' : 'en-US', { weekday: 'short' }); }) });
      parts.line.textContent = line;
      parts.go.textContent = armed ? t('fd.confirm') : t('fd.feed');
      said = { name: name, line: ms == null ? t('fd.never') : line, go: t('fd.feed') };
      el.classList.toggle('armed', armed); el.classList.toggle('busy', !!busy);
    }
    function press() {
      var s = state(), now = Date.now();
      if (recent(lastFed(s), now, 10) && armedUntil <= now) {            // fed a moment ago: the first tap only asks
        armedUntil = now + 6000; if (ctx.haptic) ctx.haptic(10); paint();
        clearTimeout(timer); timer = setTimeout(paint, 6100);
        return;
      }
      armedUntil = 0; feeding = now + 4000; if (ctx.haptic) ctx.haptic(14); paint();
      Promise.resolve(ctx.call('script', 'turn_on', { entity_id: id })).then(function () { setTimeout(paint, 1200); }, function () { feeding = 0; paint(); if (ctx.toast) ctx.toast('error', t('fd.title')); });
    }
    el.addEventListener('click', press);
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); press(); } });
    paint();
    return { el: el, update: paint, dispose: function () { clearTimeout(timer); }, text: function () { return said; }, design: wanted };
  }
  api.buildCard = buildCard;

  /** The picker of the pencil on the card: every look, drawn live with this house's words, a tap uses it. */
  function openPicker(ctx, card) {
    var t = function (k) { return core.t(k, ctx.lang()); };
    ctx.sheet({ title: t('fd.design'), width: 'min(540px,100%)', content: function (close) {
      var box = h('div.fd-pick'), grid = h('div.fd-grid'), opts = {}, tx = card ? card.text() : { name: t('fd.title'), line: t('fd.never'), go: t('fd.feed') };
      ORDER.forEach(function (id) {
        var holder = h('div.fd-scale', null, preview(id, tx));
        var b = h('button.fd-opt', { type: 'button', 'aria-label': t('fd.d.' + id), onclick: function () { if (ctx.haptic) ctx.haptic('switch'); ctx.settings.set({ bento: { feederDesign: id } }); if (card) card.update(); mark(); } }, holder, h('span.fd-name', null, t('fd.d.' + id)));
        opts[id] = { b: b, holder: holder }; grid.appendChild(b);
      });
      function mark() { var cur = designId((ctx.settings.get().bento || {}).feederDesign); ORDER.forEach(function (id) { opts[id].b.classList.toggle('on', id === cur); opts[id].b.setAttribute('aria-pressed', id === cur ? 'true' : 'false'); }); }
      function fit() { ORDER.forEach(function (id) { var o = opts[id], w = o.holder.clientWidth; if (!w) return; var z = w / 338; o.holder.style.height = Math.round(DESIGNS[id].h * z) + 'px'; o.holder.firstChild.style.transform = 'scale(' + z + ')'; }); }
      mark();
      box.appendChild(h('div.pe-hint', null, t('fd.design_hint'))); box.appendChild(grid);
      box.appendChild(h('div.pe-foot', null, h('button.done', { type: 'button', onclick: close }, t('fd.done'))));
      requestAnimationFrame(fit); setTimeout(fit, 120);
      return box;
    } });
  }
  api.openPicker = openPicker;

  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([[
    '.device-list-item.fdc{display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:12px;box-sizing:border-box;padding:0 14px 0 12px;height:var(--okie-feed-h,92px);min-height:0;cursor:pointer;min-width:0;}',
    '.fdc-badge{flex:none;display:block;width:52px;height:52px;}.fdc-badge svg{display:block;width:100%;height:100%;}',
    '.fdc-text{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:4px;}',
    '.fdc-title{font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;opacity:.72;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.fdc-sub{font-size:14.5px;font-weight:600;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.fdc-go{flex:none;padding:7px 13px;border-radius:20px;background:rgba(255,255,255,.16);font-size:14px;font-weight:700;white-space:nowrap;transition:background .2s,color .2s;}',
    '.fdc.armed .fdc-go{background:#ff8a1f;color:#1c1c1e;}.fdc.busy .fdc-go{opacity:.55;}',
    // the designs of the iOS widget: drawn in its units (158 high), the pictures and the text hang on the edges
    '.device-list-item.fdc.fdi{display:block;padding:0;gap:0;height:var(--okie-feed-h,158px);color:#fff;}',
    '.fdc.fdi:not(.glass){background:linear-gradient(180deg,var(--fdc-top,#2f2926),var(--fdc-bot,#1c1917));-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:inset 0 0 0 1px rgba(255,255,255,.10);}',
    '.fdi-art{position:absolute;display:block;max-width:none;pointer-events:none;-webkit-user-drag:none;user-select:none;-webkit-user-select:none;}',
    '.fdi-t{position:absolute;box-sizing:border-box;font-size:var(--fdc-fs);font-family:"Okie Manrope",var(--okie-font);font-weight:800;text-transform:uppercase;letter-spacing:.09em;line-height:1.36;color:rgba(255,255,255,.94);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.fdi-l{position:absolute;box-sizing:border-box;font-size:var(--fdc-fs);font-family:"Okie Sora",var(--okie-font);font-weight:600;line-height:1.26;color:rgba(255,255,255,.7);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;transition:color .2s,opacity .2s;}',
    '.fdc.fdi.armed .fdi-l{color:var(--fdc-accent,#ff962d);}.fdc.fdi.busy .fdi-l{opacity:.7;}',
    // the picker
    '.fd-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;align-items:start;margin:12px 0 4px;}',
    '.fd-opt{display:flex;flex-direction:column;gap:7px;padding:7px 7px 8px;border:0;border-radius:22px;background:rgba(255,255,255,.08);color:inherit;font:inherit;cursor:pointer;text-align:center;box-shadow:inset 0 0 0 2px transparent;transition:box-shadow .15s,background .15s;}',
    '.fd-opt.on{box-shadow:inset 0 0 0 2px #ff962d;background:rgba(255,150,45,.14);}',
    '.fd-scale{position:relative;width:100%;overflow:hidden;border-radius:16px;pointer-events:none;}',
    '.fd-scale>.fdc{position:absolute;left:0;top:0;transform-origin:0 0;flex:none;cursor:default;}',
    '.fd-name{font-size:13px;font-weight:600;opacity:.86;}',
  ].join('\n')]);
})(typeof globalThis !== 'undefined' ? globalThis : window);

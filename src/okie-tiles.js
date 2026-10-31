/* okie-tiles: device cards, list rows and the quick-control icon.
 * Shared by the search panel and the bento. The look follows Fast Search Card's
 * `device-card` (measured from the live card): square, glass when off, white when
 * on, text that fades out at the right edge, an orange ring around the icon that
 * fills while you hold a risky action.
 * create(ctx, registry) -> { makeTile, makeRow, makeAppTile, makeSystemTile, paint }
 * Every tile made is recorded in `registry` (id -> element) so the owner can
 * repaint it when Home Assistant reports a new state.
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;
  var UI = g.OkieMotor.ui, L = g.OkieMotor.logic, core = g.OkieMotor.core, IC = g.OkieMotor.icons;
  var h = UI.h;

  var RING = 289;                                         // circumference of r=46, FSC's dasharray

  function create(ctx, registry) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var engine = ctx.engine;
    registry = registry || new Map();

    function itemState(item) { var hs = ctx.hass(); if (item.id === 'gadget.lights') return ctx.state(item.id); return hs && hs.states[item.id]; }
    function liveItem(item) { return Object.assign({}, item, { state: (itemState(item) || {}).state }); }
    function currentAction(item) { return ctx.settings.get().quickEnabled ? L.quickAction(liveItem(item), ctx.settings.get().quickControl) : null; }

    /** The icon is the switch: tap safe devices, hold risky ones. A ring shows on hover and fills during a hold. */
    function makeIconButton(item) {
      var host = h('span.device-icon');
      var ring = h('svg.qc-ring', { viewBox: '0 0 100 100', 'aria-hidden': 'true', html: '<circle class="qc-track" cx="50" cy="50" r="46"/><circle class="qc-fg" cx="50" cy="50" r="46"/>' });
      var btn = h('span.qc-icon', { role: 'button', tabindex: '-1', 'aria-label': item.name }, ring, host);
      var fg = ring.querySelector('.qc-fg');
      function wire() {
        var a = currentAction(item);
        btn.classList.toggle('qc', !!a); btn.classList.toggle('hold', !!(a && a.mode === 'hold'));
      }
      function fire() {
        var a = currentAction(item); if (!a) return;
        var el = btn.closest('.device-card,.device-list-item');
        if (el) el.classList.add('pending');
        btn.classList.add('pop'); setTimeout(function () { btn.classList.remove('pop'); }, 220);
        ctx.call(a.domain, a.service, a.data).then(function () { engine.recordUse(item.id); }, function () {
          ctx.toast('error', t('browse.failed', { action: a.service.replace(/_/g, ' '), name: item.name }));
        }).then(function () { if (el) el.classList.remove('pending'); });
      }
      UI.onTapOrHold(btn, {
        holdMs: 1000,
        hold: function () { fire(); },
        tap: function () {
          var a = currentAction(item);
          if (!a) { ctx.openDetail(item.id, btn.closest('.device-card,.device-list-item')); return; }
          if (a.mode === 'tap') fire(); else ctx.toast('info', t('browse.hold'));
        },
        onProgress: function (p) { btn.classList.toggle('pressing', p > 0); fg.style.strokeDashoffset = String(RING * (1 - p)); },
      });
      btn.addEventListener('pointerdown', function () { btn.classList.add('pressing'); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) { btn.addEventListener(ev, function () { btn.classList.remove('pressing'); }); });
      return { btn: btn, iconHost: host, wire: wire };
    }

    function paint(el, item, hs) {
      var s = hs || itemState(item) || { state: item.state, attributes: {} };
      var on = L.fscActive(s.state, item.domain, s.attributes);     // FSC's own rule for the white "on" tile
      el.classList.toggle('active', on);
      el.classList.toggle('unavail', s.state === 'unavailable');
      el.dataset.d = item.domain;
      el._ic.iconHost.innerHTML = IC.deviceSvg(item, s.state, on, 64, s.attributes);
      el._ic.wire();
      el._state.textContent = L.tileState(item, s, ctx.lang());
      if (el._sw) { el._sw.classList.toggle('on', s.state === 'on'); el._sw.setAttribute('aria-checked', s.state === 'on' ? 'true' : 'false'); el._sw.disabled = s.state === 'unavailable'; }
      el._lastState = s;
    }

    function wireOpen(el, item) {
      el.addEventListener('click', function () { ctx.openDetail(item.id, el); });
      el.addEventListener('keydown', function (e) { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); ctx.openDetail(item.id, el); } });
      el.addEventListener('pointerenter', function () { ctx.prefetch(item.id); });
      el.addEventListener('pointerdown', function () { ctx.prefetch(item.id); });
    }

    function makeTile(item) {
      var ic = makeIconButton(item);
      var tile = h('div.device-card.tile', { role: 'button', tabindex: '0', 'aria-label': t('browse.open_detail', { name: item.name }) },
        ic.btn,
        h('div.device-info', null, h('div.device-area', null, item.area || ''), h('div.device-name', null, L.shortName(item.name, item.area)), h('div.device-state')));
      tile._item = item; tile._ic = ic; tile._state = tile.querySelector('.device-state');
      wireOpen(tile, item); paint(tile, item); registry.set(item.id, tile);
      return tile;
    }

    function makeRow(item) {
      var ic = makeIconButton(item);
      var TOG = ['light', 'switch', 'fan', 'input_boolean', 'humidifier', 'automation', 'siren', 'remote'], pin = item.id === 'gadget.lights', togg = pin || TOG.indexOf(item.domain) >= 0;
      var sw = togg ? h('button.sw.row-sw', { type: 'button', role: 'switch', 'aria-checked': 'false', 'aria-label': item.name }, h('i')) : null;
      var more = !togg && ctx.compactAvailable() ? h('button.device-list-actions', { 'aria-label': t('browse.more'), 'aria-expanded': 'false', html: UI.icon('more', 20) }) : null;
      var status = h('div.device-list-status');
      var content = h('div.device-list-content', null, h('div.device-list-area', null, item.area || ''), h('div.device-list-name', null, item.name), status);
      var iconBox = h('div.device-list-icon', null, ic.btn);
      var row = h('div.device-list-item.tile', { role: 'button', tabindex: '0', 'aria-label': t('browse.open_detail', { name: item.name }) }, h('div.device-list-row', null, iconBox, content, sw || more));
      row._item = item; row._sw = sw;
      if (sw) {
        sw.addEventListener('click', function (e) { e.stopPropagation(); var on = !sw.classList.contains('on'); sw.classList.toggle('on', on); sw.setAttribute('aria-checked', on ? 'true' : 'false'); if (ctx.haptic) ctx.haptic(10); if (pin) { g.OkieMotor.lights.toggleFav(ctx); return; } ctx.call(item.domain, on ? 'turn_on' : 'turn_off', { entity_id: item.id }); });
        sw.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      } row._ic = ic; row._state = status;
      wireOpen(row, item);
      if (more) {
        var tray = null;
        more.addEventListener('click', function (e) {
          e.stopPropagation();
          if (tray) { tray.remove(); tray = null; more.classList.remove('open'); more.setAttribute('aria-expanded', 'false'); return; }
          tray = h('div.tray'); row.appendChild(tray); more.classList.add('open'); more.setAttribute('aria-expanded', 'true');
          ctx.renderCompact(tray, item.id);
        });
        more.addEventListener('pointerdown', function (e) { e.stopPropagation(); });
      }
      paint(row, item); registry.set(item.id, row);
      return row;
    }

    /** A coloured system tile (to-do, news, ...): solid brand colour, white text. line1 dim, line2 bold. */
    function makeSystemTile(o) {
      var tile = h('div.device-card.system-card', { role: 'button', tabindex: '0', 'aria-label': o.label, style: { background: o.color } },
        h('span.qc-icon.static', null, h('span.device-icon', { html: UI.icon(o.icon, 44) })),
        h('div.device-info', null, h('div.device-state', null, o.line1 || ''), h('div.device-name', null, o.line2 || '')));
      tile.addEventListener('click', o.open);
      tile.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); o.open(); } });
      tile.set = function (l1, l2) { tile.querySelector('.device-state').textContent = l1; tile.querySelector('.device-name').textContent = l2; };
      return tile;
    }

    /** An app in the "Apps" category of the search panel. */
    function makeAppTile(app) {
      var nm = app.nameKey ? t(app.nameKey) : app.name;
      var tile = h('div.device-card.settings-card', { role: 'button', tabindex: '0', 'aria-label': nm },
        h('span.qc-icon.static', null, h('span.device-icon', { html: UI.icon(app.icon || 'grid', 44) })),
        h('div.device-info', null, h('div.device-area', null, t('browse.apps')), h('div.device-name', null, nm)));
      tile.addEventListener('click', function () { ctx.openApp(app.id); });
      tile.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ctx.openApp(app.id); } });
      return tile;
    }

    return { makeTile: makeTile, makeRow: makeRow, makeAppTile: makeAppTile, makeSystemTile: makeSystemTile, paint: paint, makeIconButton: makeIconButton };
  }

  var CSS = [
    '@keyframes okie-spin{to{transform:rotate(360deg);}}',
    '@keyframes pendingPulse{0%,100%{opacity:0;}50%{opacity:1;}}',
    '@keyframes skeletonPulse{0%,100%{opacity:.5;}50%{opacity:1;}}',
    '.device-card{position:relative;aspect-ratio:1/1;min-width:130px;min-height:130px;width:100%;padding:20px;border-radius:24px;clip-path:var(--card-clip-path,none);-webkit-clip-path:var(--card-clip-path,none);background:var(--okie-tile,rgba(255,255,255,.1));-webkit-backdrop-filter:var(--okie-card-bf,none);backdrop-filter:var(--okie-card-bf,none);box-shadow:var(--okie-card-edge,none);display:flex;flex-direction:column;justify-content:space-between;cursor:pointer;overflow:hidden;box-sizing:border-box;container-type:inline-size;text-align:left;contain-intrinsic-size:auto 120px;transition:background .2s,transform .08s cubic-bezier(.16,1,.3,1);}',
    '.device-card::before{content:"";position:absolute;inset:0;background:linear-gradient(135deg,rgba(255,255,255,.1),rgba(255,255,255,.05));opacity:0;pointer-events:none;transition:opacity .2s;}',
    '@media (hover:hover){.device-card:hover::before{opacity:1;}.device-card:hover{background:rgba(255,255,255,.18);}}',
    '.device-card.active{background:#fff;}',
    '@media (hover:hover){.device-card.active:hover{background:#fff;}}',
    '',
    '.device-card:focus-visible,.device-list-item:focus-visible{outline:none;box-shadow:inset 0 0 0 2px #fff;}',
    '.device-card.unavail{opacity:.5;}',
    '.device-card.pending::after,.device-list-item.pending::after{content:"";position:absolute;inset:-2px;border:2px solid rgba(100,180,255,.55);border-radius:inherit;opacity:0;pointer-events:none;animation:pendingPulse 1.1s ease-out infinite;}',
    '.qc-icon{position:relative;display:inline-flex;align-items:center;justify-content:center;align-self:flex-start;cursor:pointer;touch-action:none;transition:transform .15s;}',
    '.qc-icon.pressing{transform:scale(.9);}.qc-icon.pop{transform:scale(1.12);}.qc-icon.static{cursor:inherit;}',
    '.qc-ring{position:absolute;left:-10px;top:-10px;width:calc(100% + 20px);height:calc(100% + 20px);transform:rotate(-90deg);opacity:0;pointer-events:none;transition:opacity .2s;}',
    '.qc-icon.qc.hold:hover .qc-ring,.qc-icon.hold.pressing .qc-ring{opacity:1;}',
    '.qc-icon.qc:not(.hold).pressing .qc-ring{opacity:.7;}',
    '.qc-track{fill:none;stroke:rgba(255,159,10,.5);stroke-width:6;}.qc-fg{fill:none;stroke:rgb(255,159,10);stroke-width:6;stroke-linecap:round;stroke-dasharray:289;stroke-dashoffset:289;}',
    '.device-icon{display:inline-flex;line-height:0;}.device-icon svg{width:clamp(40px,27cqw,64px);height:auto;aspect-ratio:1;display:block;}',
    '.device-card.active .device-icon svg:not(.rich){color:rgba(0,0,0,.85);}',
    '.device-info{display:flex;flex-direction:column;text-align:left;width:100%;min-width:0;}',
    '.device-area,.device-name,.device-state{position:relative;margin:0;font-size:18px;line-height:1.15;overflow:hidden;white-space:nowrap;-webkit-text-fill-color:transparent;-webkit-background-clip:text;background-clip:text;}',
    '@container (max-width:180px){.device-area,.device-name,.device-state{font-size:16px;}}',
    '.device-area{background-image:linear-gradient(90deg,rgba(255,255,255,.85) 80%,transparent);color:rgba(255,255,255,.85);}',
    '.device-name{background-image:linear-gradient(90deg,#fff 80%,transparent);color:#fff;font-weight:600;}',
    '.device-state{background-image:linear-gradient(90deg,rgba(255,255,255,.85) 85%,transparent);color:rgba(255,255,255,.85);}',
    '.device-card.active .device-area{background-image:linear-gradient(90deg,rgba(0,0,0,.6) 80%,transparent);color:rgba(0,0,0,.6);}',
    '.device-card.active .device-name{background-image:linear-gradient(90deg,rgba(0,0,0,.9) 80%,transparent);color:rgba(0,0,0,.9);}',
    '.device-card.active .device-state{background-image:linear-gradient(90deg,rgba(0,0,0,.7) 85%,transparent);color:rgba(0,0,0,.7);}',
    '.device-card.system-card .device-area,.device-card.system-card .device-name,.device-card.system-card .device-state{-webkit-text-fill-color:#fff;background:none;color:#fff;}',
    '.device-card.system-card .device-state{opacity:.85;}.device-card.system-card::before{display:none;}',
    '.device-card.settings-card{border:1px solid rgba(0,145,255,.5);box-shadow:0 8px 32px rgba(0,145,255,.3);}',
    '.device-card.settings-card .device-area,.device-card.settings-card .device-name{-webkit-text-fill-color:rgba(255,255,255,.95);background:none;}',
    '.device-card mark,.device-list-name mark{background:rgba(255,220,0,.3);border-radius:2px;color:inherit;font-weight:700;padding:0 2px;}',
    // little loops: only the fan and a cleaning vacuum; a motion sensor pings once
    '.device-card.active[data-d="fan"] svg.k-fan,.device-list-item.active[data-d="fan"] svg.k-fan{animation:okie-spin 2.4s linear infinite;}',
    '.device-card.active[data-d="vacuum"] svg.k-vacuum{animation:okie-spin 3.2s linear infinite;}',
    '@keyframes okie-ping{from{transform:scale(1.35);opacity:.5;}to{transform:none;opacity:1;}}',
    '.device-card.active[data-d="binary_sensor"] svg.k-motion{animation:okie-ping .9s ease-out 1;}',
    // grid / list containers
    '.device-grid-container{display:grid;gap:16px;grid-template-columns:repeat(var(--device-grid-columns,5),1fr);}',
    '.device-list-container{display:flex;flex-direction:column;gap:12px;width:100%;}',
    // list rows
    '.device-list-item{position:relative;border-radius:24px;clip-path:var(--card-clip-path,none);background:var(--okie-tile,rgba(255,255,255,.1));-webkit-backdrop-filter:var(--okie-card-bf,none);backdrop-filter:var(--okie-card-bf,none);box-shadow:var(--okie-card-edge,none);padding:16px 20px;display:flex;flex-direction:column;gap:14px;cursor:pointer;overflow:hidden;transition:background .2s,transform .08s cubic-bezier(.16,1,.3,1);}',
    '@media (hover:hover){.device-list-item:hover{background:rgba(255,255,255,.18);}}',
    '.device-list-item.active,.device-list-item.active:hover{background:#fff;}',
    '.device-list-row{display:flex;align-items:center;gap:16px;width:100%;}',
    '.device-list-icon{display:flex;align-items:center;justify-content:center;width:68px;min-width:68px;height:68px;border-radius:50%;background:rgba(255,255,255,.15);transition:.3s;}.device-list-item.active .device-list-icon{background:rgba(0,0,0,.08);box-shadow:0 0 20px rgba(0,0,0,.05);}',
    '.device-list-icon .qc-icon{align-self:center;}.device-list-icon .device-icon svg{width:36px;}',
    '.device-list-content{display:flex;flex-direction:column;flex:1;min-width:0;}',
    '.device-list-area{color:rgba(255,255,255,.6);font-size:11px;font-weight:500;letter-spacing:.5px;line-height:1.2;text-transform:uppercase;}',
    '.device-list-name{color:rgba(255,255,255,.95);font-size:16px;font-weight:600;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.device-list-status{color:rgba(255,255,255,.7);font-size:13px;line-height:1.2;}',
    '.device-list-item.active .device-list-area{color:rgba(0,0,0,.6);}.device-list-item.active .device-list-name{color:rgba(0,0,0,.9);}.device-list-item.active .device-list-status{color:rgba(0,0,0,.7);}',
    '.device-list-actions{display:flex;align-items:center;justify-content:center;width:44px;min-width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,.06);color:rgba(255,255,255,.7);transition:background .2s,color .2s;}',
    '.device-list-actions.open{background:rgba(255,255,255,.92);color:rgb(28,28,30);}.device-list-item.active .device-list-actions{background:rgba(0,0,0,.06);color:rgba(0,0,0,.55);}.device-list-item.active .device-list-actions.open{background:rgb(28,28,30);color:#fff;}',
    '.tray{margin-top:2px;padding:14px;border-radius:18px;background:rgba(20,18,16,.6);color:#fff;cursor:default;}',
    '@media (max-width:768px){.device-card{padding:16px;}.device-area,.device-name,.device-state{font-size:16px;}.device-grid-container{gap:13px;}.device-list-item{gap:12px;padding:12px 16px;}.device-list-icon{width:56px;min-width:56px;height:56px;}}',
    '@media (max-width:480px){.device-card{min-width:120px;min-height:120px;padding:14px;}.device-area,.device-name,.device-state{font-size:14px;}}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
  g.OkieMotor.tiles = { create: create, CSS: CSS };
})(typeof globalThis !== 'undefined' ? globalThis : window);

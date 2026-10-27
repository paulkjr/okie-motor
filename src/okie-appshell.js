/* okie-appshell: the shared frame for apps (Settings, Todos, Calendar, ...).
 *
 *   var shell = OkieMotor.appshell.create(container, ctx, {
 *     id, title, subtitle, icon, gradient: [c0, c1],
 *     tabs: [{ id, icon, label }],  onTab(id, body), actions: [{ icon, label, onClick }]
 *   });
 *   shell.body        scrollable content element
 *   shell.setSubtitle(text), shell.setTabs(...), shell.showTab(id), shell.dispose()
 *
 * Same look as the detail view: hero with back button on the left (a video from
 * <videos.path>/<id>.mp4 or <videos.path>/system-entities/<id>.mp4 when present),
 * content on the right with an icon tab bar.
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;

  var probe = new Map();
  function exists(url) {
    if (probe.has(url)) return probe.get(url);
    var p = fetch(url, { method: 'HEAD' }).then(function (r) { return r.ok && /video|octet/.test(r.headers.get('content-type') || 'video'); }, function () { return false; });
    probe.set(url, p); return p;
  }

  function create(container, ctx, o) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var grad = o.gradient || ['#1f2430', '#44506a'];
    var vid = h('video.dt-video', { muted: true, loop: true, autoplay: true, playsInline: true });
    vid.muted = true;
    var back = h('button.dt-circ', { 'aria-label': t('card.back'), onclick: function () { ctx.back(); }, html: UI.icon('back', 22) });
    var title = h('div.dt-title', null, o.title), sub = h('div.dt-sub', null, o.subtitle || '');
    var acts = h('div.dt-acts');
    (o.actions || []).forEach(function (a) { acts.appendChild(h('button.dt-circ', { 'aria-label': a.label, title: a.label, onclick: a.onClick, html: UI.icon(a.icon, 20) })); });
    var hero = h('div.dt-hero', { style: { background: 'linear-gradient(160deg,' + grad[0] + ',' + grad[1] + ')' } },
      h('div.dt-iconbg', { html: UI.icon(o.icon || 'grid', 170) }), vid,
      h('div.dt-top', null, back, h('div.dt-head', null, title, sub), acts.children.length ? acts : h('span', { style: { width: '40px' } })));
    if (o.photo) { hero.insertBefore(h('div.dt-photo', { style: { backgroundImage: 'url("' + o.photo + '")' } }), hero.firstChild); var ib = hero.querySelector('.dt-iconbg'); if (ib) ib.style.display = 'none'; }      // a picture instead of the big icon
    var bar = h('div.dt-bar', { role: 'tablist' });
    var body = h('div.dt-body.okie-scroll');
    var host = h('div.dt-bodyhost', null, body);
    if (o.tabsBottom) bar.classList.add('bottom');      // an app can keep its tab pill under the content (the Calendar)
    var main = o.tabsBottom ? h('div.dt-main', null, o.header || null, host, bar) : h('div.dt-main', null, o.header || null, bar, host);
    var root = h('div.dt', null, hero, main);
    if (o.slim) root.dataset.slim = '1';
    if (o.bare) root.dataset.bare = '1';      // no picture at the side: a thin bar with the back button, the title and the actions over the full-width screen (the home map)
    container.appendChild(root);
    var sb = UI.attachScrollbar(body, host);
    var tabs = o.tabs || [], current = null;

    function showTab(id) {
      current = id;
      Array.prototype.forEach.call(bar.children, function (b) { var on = b.dataset.tab === id; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false'); });
      body.innerHTML = ''; body.scrollTop = 0;
      if (o.onTab) o.onTab(id, body);
      requestAnimationFrame(function () { sb.update(); });
    }
    function drawTabs() {
      bar.innerHTML = ''; bar.hidden = tabs.length < 2;
      tabs.forEach(function (tb) {
        bar.appendChild(h('button.dt-tab' + (tb.icon ? '' : '.txt'), { role: 'tab', dataset: { tab: tb.id }, 'aria-label': tb.label, title: tb.label, onclick: function () { showTab(tb.id); } }, tb.icon ? h('span', { html: UI.icon(tb.icon, 20) }) : h('span', { style: { fontSize: '13px', fontWeight: 600 } }, tb.label)));
      });
    }
    drawTabs();

    // optional looping video behind the hero
    var cfg = ctx.settings.get().videos;
    if (cfg && cfg.enabled && !(cfg.mobile === false && ctx.host && ctx.host._mobile)) {
      var base = String(cfg.path).replace(/\/+$/, '') + '/', L = g.OkieMotor.logic;
      // a clip named for the app, or (heroDomain) the clip the devices of that kind get in their own screens, with the same fallbacks
      (o.heroDomain && L && L.resolveVideo ? L.resolveVideo({ base: cfg.path, domain: o.heroDomain, deviceClass: '', state: o.heroState || 'idle', exists: exists }) : [base + o.id + '.mp4', base + 'system-entities/' + o.id + '.mp4'].reduce(function (p, url) {
        return p.then(function (found) { return found || exists(url).then(function (ok) { return ok ? url : null; }); });
      }, Promise.resolve(null))).then(function (url) { if (url) { vid.src = url; vid.addEventListener('canplay', function () { vid.classList.add('on'); }, { once: true }); } });
    }

    if (tabs.length) showTab(o.startTab && tabs.some(function (x) { return x.id === o.startTab; }) ? o.startTab : tabs[0].id);
    else if (o.onTab) o.onTab(null, body);

    return {
      el: root, body: body, host: host, bar: bar, hero: hero, main: main,
      setSubtitle: function (s) { sub.textContent = s; },
      setTabs: function (n) { tabs = n; drawTabs(); },
      showTab: showTab,
      get tab() { return current; },
      refreshScroll: function () { sb.update(); },
      dispose: function () { sb.destroy(); vid.removeAttribute('src'); },
    };
  }

  var CSS = '.dt-acts{display:flex;gap:6px;}.dt-tab.txt{width:auto;min-width:44px;padding:0 14px;white-space:nowrap;flex:none;}.dt-main>.dt-bar.bottom{align-self:center;margin:12px 0 0;}.dt[data-bare]{grid-template-columns:1fr;grid-template-rows:auto minmax(0,1fr);background:linear-gradient(160deg,rgba(26,32,36,.94),rgba(40,52,50,.94));}.dt[data-bare] .dt-hero{background:none!important;overflow:visible;}.dt[data-bare] .dt-iconbg,.dt[data-bare] .dt-video,.dt[data-bare] .dt-hero::after{display:none;}.dt[data-bare] .dt-top{padding:12px 16px 0;}.dt[data-bare] .dt-main{padding:4px 12px 12px;}@media (max-width:640px){.dt[data-slim] .dt-iconbg{display:none;}.dt[data-slim] .dt-top{padding:12px 14px;}}';
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
  g.OkieMotor.appshell = { create: create };
})(typeof globalThis !== 'undefined' ? globalThis : window);

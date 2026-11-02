/* okie-pull-refresh: pull the whole start screen down from the top (not from a list or a slider) and the app clears its
 * copy of the page and loads it again, so a newly installed card shows at once.
 *
 *   OkieMotor.pullRefresh.wire(stage)   stage = the card's top-level .stage element
 *
 * Inside the Okie Home app this posts okiePurge to the native bridge, which clears the web view's cache and reloads
 * from the server (DashboardView.swift already listens for it). In a plain browser it re-fetches the card's own script
 * bypassing the cache, then reloads the page, the same trick the "new version" notice already uses.
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;
  var UI = g.OkieMotor.ui, core = g.OkieMotor.core, h = UI.h;

  core.registerStrings('en', { 'pr.refresh': 'Pull down to refresh', 'pr.release': 'Release to refresh', 'pr.working': 'Refreshing' });
  core.registerStrings('de', { 'pr.refresh': 'Zum Aktualisieren ziehen', 'pr.release': 'Loslassen zum Aktualisieren', 'pr.working': 'Wird aktualisiert' });

  var AT = 36;                                   // design px to pull before letting go refreshes (iOS eats some of the drag deciding whether to take the gesture itself, so this has to be forgiving)
  var MAX = 70;
  var EXCLUDE = '.okie-scroll,.rx-pgs,.cal-strip,.w1-body,.cam-strip,.wheel,.results-container,.subcategory-row,.nc-list,.island-list,.island-list-reiter,.ov-win,.morph-popup-inhalt,.cam-pill-ic,button,[role="button"],a,input,textarea,select,.rx-dialsvg,.dt-grip';
  var ICON = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11M7 10l5 5 5-5"/></svg>';

  function bridge() { try { return g.webkit && g.webkit.messageHandlers && g.webkit.messageHandlers.okiePurge; } catch (e) { return null; } }

  function hardReloadWeb() {
    var urls = [], done = false;
    try { performance.getEntriesByType('resource').forEach(function (r) { if (/\/okie-motor(\.min)?\.js(\?|$)/.test(r.name) && urls.indexOf(r.name) < 0) urls.push(r.name); }); } catch (e) { /* no resource timing */ }
    function go() { if (done) return; done = true; location.reload(); }
    setTimeout(go, 4000);
    if (!urls.length) { go(); return; }
    Promise.all(urls.map(function (u) { return fetch(u, { cache: 'reload' }).catch(function () {}); })).then(go, go);
  }

  function wire(stage) {
    if (!stage || stage.__pullRefreshWired) return;
    stage.__pullRefreshWired = true;
    var lang = function () { try { return (document.documentElement.lang || 'en').slice(0, 2); } catch (e) { return 'en'; } };
    var t = function (k) { return core.t(k, lang()); };
    var ind = h('div.pr-ind', { 'aria-live': 'polite' }, h('span.pr-ic', { html: ICON }), h('span.pr-tx'));
    stage.appendChild(ind);
    var st = null, busy = false;

    function paint(p) {
      ind.style.setProperty('--pr-p', p.toFixed(3));
      ind.querySelector('.pr-ic').style.transform = 'rotate(' + Math.min(180, p * 180).toFixed(1) + 'deg)';
      ind.querySelector('.pr-tx').textContent = p >= 1 ? t('pr.release') : t('pr.refresh');
    }
    function eligible(target) {
      if (busy) return false;
      if (stage.dataset.search === 'open' || stage.dataset.detail !== 'closed' || stage.dataset.zenRevealed === 'false') return false;
      if (stage.querySelector('.ov-win,.morph-popup')) return false;
      if (target.closest && target.closest(EXCLUDE)) return false;
      return true;
    }
    function start() {
      busy = true; ind.classList.add('on', 'go');
      ind.querySelector('.pr-tx').textContent = t('pr.working');
      var b = bridge();
      if (b) { try { b.postMessage(String((g.OkieMotor && g.OkieMotor.build) || '')); } catch (e) { hardReloadWeb(); } }
      else hardReloadWeb();
    }
    function end(cancel) {
      var s = st; st = null;
      if (!s) return;
      if (!cancel && s.p >= 1) { ind.style.setProperty('--pr-p', '1'); start(); return; }
      ind.classList.remove('on'); ind.classList.add('snap');
      ind.style.setProperty('--pr-p', '0');
      setTimeout(function () { ind.classList.remove('snap'); }, 260);
    }
    stage.addEventListener('pointerdown', function (e) {
      if (e.button || busy) return;
      if (!eligible(e.target)) return;
      st = { id: e.pointerId, x: e.clientX, y: e.clientY, active: false, p: 0 };
    });
    stage.addEventListener('pointermove', function (e) {
      if (!st || e.pointerId !== st.id) return;
      var dx = e.clientX - st.x, dy = e.clientY - st.y;
      if (!st.active) {
        if (dy < 8 || Math.abs(dx) > dy * 1.3) { if (dy < -4 || Math.abs(dx) > 16) st = null; return; }
        st.active = true; ind.classList.add('on');
      }
      var pull = Math.min(MAX, dy * 0.8);
      st.p = Math.min(1, pull / AT);
      paint(st.p);
    });
    stage.addEventListener('pointerup', function (e) { if (st && e.pointerId === st.id) end(false); });
    stage.addEventListener('pointercancel', function (e) { if (st && e.pointerId === st.id) end(true); });

    return { reset: function () { busy = false; ind.classList.remove('on', 'go', 'snap'); ind.style.setProperty('--pr-p', '0'); } };
  }

  var CSS = [
    '.pr-ind{position:absolute;left:50%;top:calc(var(--okie-top,0px) + 10px);transform:translate(-50%,calc(-100% - 10px));display:flex;align-items:center;gap:8px;padding:9px 16px;border-radius:9999px;border:1px solid rgba(255,255,255,.14);background:linear-gradient(150deg,rgba(255,255,255,.16),rgba(255,255,255,.05));-webkit-backdrop-filter:blur(14px) saturate(1.3);backdrop-filter:blur(14px) saturate(1.3);color:rgba(255,255,255,.85);font-size:13px;font-weight:600;white-space:nowrap;opacity:0;pointer-events:none;z-index:950;box-shadow:0 6px 16px rgba(0,0,0,.26),inset 0 1px 0 rgba(255,255,255,.2);}',
    '.pr-ind.on{opacity:calc(var(--pr-p,0) * .4 + .6);transform:translate(-50%,calc(-100% + (10px + 100%) * var(--pr-p,0) - 10px));}',
    '.pr-ind.snap{transition:transform .26s cubic-bezier(.23,1,.32,1),opacity .26s ease;}',
    '.pr-ind.go{opacity:1;transform:translate(-50%,10px);}',
    '.pr-ind.go .pr-ic{animation:pr-spin 0.9s linear infinite;}',
    '.pr-ic{display:flex;width:22px;height:22px;}',
    '@keyframes pr-spin{to{transform:rotate(360deg);}}',
    '@media (prefers-reduced-motion:reduce){.pr-ind.go .pr-ic{animation:none;}}',
  ].join('');

  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
  g.OkieMotor.pullRefresh = { wire: wire };
})(typeof globalThis !== 'undefined' ? globalThis : window);

/* okie-wallpaper: use any image as the whole view's background.
 *
 * By default the card paints the image on its own background layer, so it shows
 * on every dashboard. With "Cover the whole view" (wallpaperView) the card also
 * replaces --lovelace-background inside Home Assistant so the image sits behind
 * the header and sidebar too; HA re-applies theme variables on its own, so a
 * MutationObserver puts ours back whenever it is overwritten. That wallpaper is
 * applied the moment this script loads (before the card exists), so a Safari
 * boot shows no flash of the old picture and no double image.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  /** CSS value for the background shorthand; the url is quoted and escaped. */
  function cssBackground(url) {
    var safe = String(url).replace(/[\\"\n\r]/g, function (c) { return c === '\\' ? '\\\\' : (c === '"' ? '%22' : ''); });
    return 'center / cover no-repeat url("' + safe + '") fixed';
  }
  /** Only plain image-ish addresses are accepted: relative, http(s) or a data/blob image. No javascript: and friends. */
  function acceptable(url) {
    var u = String(url || '').trim();
    if (!u) return false;
    if (/^(javascript|vbscript|file):/i.test(u)) return false;
    if (/^data:/i.test(u)) return /^data:image\//i.test(u);
    return /^(https?:|blob:|\/|\.\/|\.\.\/)/i.test(u) || /^[\w\-./%]+$/.test(u);
  }
  var api = { cssBackground: cssBackground, acceptable: acceptable };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  var root = document.documentElement, VARS = ['--lovelace-background', '--view-background'];
  var wanted = '', observer = null, applying = false;
  function inHA() { return !!document.querySelector('home-assistant'); }
  function apply() {
    if (applying) return; applying = true;
    try {
      VARS.forEach(function (v) {
        if (wanted) { if (root.style.getPropertyValue(v) !== wanted) root.style.setProperty(v, wanted); }
        else if (root.dataset.okieWp) root.style.removeProperty(v);
      });
      if (wanted) root.dataset.okieWp = '1'; else delete root.dataset.okieWp;
    } finally { applying = false; }
  }
  function set(url, view) {
    wanted = view && acceptable(url) ? cssBackground(url) : '';          // the view only carries it when asked to; the card paints its own layer otherwise
    g.OkieMotor.wallpaperInView = !!wanted && inHA();
    if (!inHA()) return;
    apply();
    if (wanted && !observer && typeof MutationObserver === 'function') {
      observer = new MutationObserver(function () { if (!applying && wanted) apply(); });
      observer.observe(root, { attributes: true, attributeFilter: ['style'] });
    }
    if (!wanted && observer) { observer.disconnect(); observer = null; }
  }

  // Early apply: the saved wallpaper goes on before anything else paints.
  try {
    var saved = JSON.parse(localStorage.getItem('okie:settings') || '{}');
    if (saved && saved.wallpaper && saved.wallpaperView) set(saved.wallpaper, true);
  } catch (e) { /* storage blocked: the card applies it later */ }

  api.mount = function (ctx) {
    var cur = null;
    function sync() { var st = ctx.settings.get(), key = (st.wallpaper || '') + '|' + (st.wallpaperView ? 1 : 0); if (key !== cur) { cur = key; set(st.wallpaper, !!st.wallpaperView); ctx.host._applyLook && ctx.host._applyLook(); } }
    sync();
    var off = ctx.settings.on('change', sync);
    return { update: sync, dispose: function () { off(); /* the view keeps its wallpaper after the card goes away */ } };
  };
  g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.wallpaper = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

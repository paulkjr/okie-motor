/* okie-sync: one set of settings on every screen, and export / import of them.
 *
 * Everything you set (favorites, rooms, design, glass, lock page, ...) is kept in Home Assistant's own storage for your user, so the browser, the phone app, the iPad and the
 * wall tablet show the same thing. Newest change wins; a screen pulls on start, when it comes back to the foreground and every five minutes. What belongs to one screen only
 * (its size) stays on that screen. "Export" saves all of it as a file, "Import" loads such a file (like a WordPress export), also into another Home Assistant.
 * Inside the Okie Home app the file goes through the iOS share sheet and file picker (window.webkit.messageHandlers.okieBackup).
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;

  var KEY = 'okie_motor_settings';
  var DEVICE_ONLY = ['scale', 'rest', 'top_offset'];      // the size and the screensaver belong to one screen
  var MAX_BYTES = 1024 * 1024;

  function clone(o) { return JSON.parse(JSON.stringify(o == null ? {} : o)); }
  function isPlain(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  /** The part of the user's settings that is shared between screens. */
  function shared(user) { var o = clone(user); DEVICE_ONLY.forEach(function (k) { delete o[k]; }); return o; }
  function deviceOnly(user) { var o = {}; DEVICE_ONLY.forEach(function (k) { if (user && user[k] !== undefined) o[k] = clone(user[k]); }); return o; }
  /** Every setting that has a value: the shared copy of another screen plus this screen's own. */
  function combine(remoteShared, localUser) { return Object.assign(clone(remoteShared), deviceOnly(localUser)); }
  /** How many single values a settings object holds (to tell a rich set from an empty one). */
  function size(o) {
    if (Array.isArray(o)) return o.length ? o.reduce(function (n, v) { return n + Math.max(1, size(v)); }, 0) : 0;
    if (isPlain(o)) return Object.keys(o).reduce(function (n, k) { return n + Math.max(1, size(o[k])); }, 0);
    return o === undefined || o === null ? 0 : 1;
  }
  /** Which copy a screen that was never synced should keep: the richer one; on a tie the one in Home Assistant. */
  function firstSyncWinner(localShared, remoteShared) { return size(localShared) > size(remoteShared) ? 'local' : 'remote'; }

  /** The file: everything, also the one-screen settings, with a stamp. */
  function buildExport(user, meta) {
    meta = meta || {};
    return { app: 'okie-motor', format: 1, version: String(meta.version || ''), exported: new Date(meta.now == null ? Date.now() : meta.now).toISOString(), settings: clone(user) };
  }
  /** Reads the text of an exported file: { ok, settings, exported, version, favorites, items } or { ok: false, error }. */
  function parseImport(text) {
    var s = String(text == null ? '' : text);
    if (s.length > MAX_BYTES) return { ok: false, error: 'toobig' };
    var o; try { o = JSON.parse(s); } catch (e) { return { ok: false, error: 'json' }; }
    if (!isPlain(o) || o.app !== 'okie-motor') return { ok: false, error: 'notours' };
    if (!isPlain(o.settings)) return { ok: false, error: 'nosettings' };
    var fav = Array.isArray(o.settings.favorites) ? o.settings.favorites.length : 0;
    return { ok: true, settings: o.settings, exported: o.exported || '', version: o.version || '', favorites: fav, items: size(o.settings) };
  }
  function stamp(d) { var p = function (n) { return (n < 10 ? '0' : '') + n; }; d = d || new Date(); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); }
  function fileName(d) { return 'okie-motor-settings-' + stamp(d) + '.json'; }

  var api = { KEY: KEY, DEVICE_ONLY: DEVICE_ONLY, shared: shared, deviceOnly: deviceOnly, combine: combine, size: size, firstSyncWinner: firstSyncWinner, buildExport: buildExport, parseImport: parseImport, fileName: fileName };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, h = UI.h;
  var live = null;                // the mounted instance: { ctx, pushNow, applyUser }

  function de(ctx) { try { return String(ctx.lang()).slice(0, 2) === 'de'; } catch (e) { return false; } }
  function say(ctx, en, deText) { return de(ctx) ? deText : en; }
  function userOf(ctx) { return ctx.store.get('settings', {}) || {}; }

  api.mount = function (ctx) {
    var applying = false, pushTimer = 0, pulled = false, off = null, timer = 0;
    var noop = function () { return null; };
    function enabled() { var s = (ctx.settings.get().sync || {}); return s.enabled !== false; }
    function pushNow() {
      if (!enabled()) return Promise.resolve(null);
      var t = Date.now(); ctx.store.set('settings.t', t);
      return ctx.callWS({ type: 'frontend/set_user_data', key: KEY, value: { t: t, data: shared(userOf(ctx)) } }).catch(noop);
    }
    /** Replaces this screen's settings; the old ones are kept once in "settings.backup" so nothing is lost for good. */
    function applyUser(next, keepBackup) {
      if (keepBackup !== false) { try { ctx.store.set('settings.backup', { t: Date.now(), data: userOf(ctx) }); } catch (e) { /* storage full */ } }
      applying = true;
      try { ctx.settings.reset(); ctx.settings.set(next); } finally { applying = false; }
    }
    function pullNow() {
      if (!enabled()) { pulled = true; return Promise.resolve(null); }
      return ctx.callWS({ type: 'frontend/get_user_data', key: KEY }).then(function (r) {
        var v = r && r.value, mine = shared(userOf(ctx)), t0 = +ctx.store.get('settings.t', 0) || 0;
        pulled = true;
        if (!v || typeof v !== 'object' || !v.data) { return size(mine) > 0 ? pushNow() : null; }      // nothing stored yet: this screen's settings become the shared ones
        if (t0 === 0 && size(mine) > 0 && firstSyncWinner(mine, v.data) === 'local') return pushNow();   // never synced and richer than the shared copy: do not wipe it
        if ((+v.t || 0) <= t0) return null;
        applyUser(combine(v.data, userOf(ctx)));
        ctx.store.set('settings.t', +v.t);
        return true;
      }, function () { pulled = true; return null; });
    }
    off = ctx.settings.on('change', function () {
      if (applying || !pulled) return;                      // a first pull comes before any push, so a fresh screen never overwrites the shared copy
      clearTimeout(pushTimer); pushTimer = setTimeout(pushNow, 900);
    });
    function visible() { if (document.visibilityState === 'visible') pullNow(); }
    document.addEventListener('visibilitychange', visible);
    timer = setInterval(pullNow, 5 * 60000);
    pullNow();
    live = { ctx: ctx, pushNow: pushNow, applyUser: applyUser };
    return { dispose: function () { if (off) off(); clearTimeout(pushTimer); clearInterval(timer); document.removeEventListener('visibilitychange', visible); if (live && live.ctx === ctx) live = null; } };
  };

  // ------------------------------------------------------------ export / import ----
  function bridge() { try { return g.webkit && g.webkit.messageHandlers && g.webkit.messageHandlers.okieBackup; } catch (e) { return null; } }

  api.exportNow = function (ctx) {
    ctx = ctx || (live && live.ctx); if (!ctx) return;
    var text = JSON.stringify(buildExport(userOf(ctx), { version: g.OkieMotor.version }), null, 2), name = fileName();
    var native = bridge();
    if (native) { native.postMessage({ action: 'export', name: name, json: text }); return; }
    try {
      var url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
      var a = h('a', { href: url, download: name, style: { display: 'none' } });
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
      ctx.toast('success', say(ctx, 'Settings exported: ' + name, 'Einstellungen exportiert: ' + name));
    } catch (e) {
      ctx.sheet({ title: say(ctx, 'Export settings', 'Einstellungen exportieren'), content: function (close) {
        var ta = h('textarea', { readonly: true, rows: 10, style: { width: '100%', font: '12px monospace' } }, text);
        return h('div', null, h('p', null, say(ctx, 'Copy this text into a file named ' + name + '.', 'Kopiere diesen Text in eine Datei namens ' + name + '.')), ta, h('div.actrow', null, h('button.act', { onclick: close }, ctx.t ? ctx.t('card.close') : 'OK')));
      } });
    }
  };

  api.importFlow = function (ctx) {
    ctx = ctx || (live && live.ctx); if (!ctx) return;
    var native = bridge();
    if (native) { native.postMessage({ action: 'import' }); return; }       // the app answers with importText()
    var inp = h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' } });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0]; if (!f) return;
      var fr = new FileReader(); fr.onload = function () { api.importText(String(fr.result), ctx); inp.remove(); }; fr.readAsText(f);
    });
    document.body.appendChild(inp); inp.click();
  };

  /** Called with the text of a file (by the file picker above or by the app). Asks once, then replaces the settings of this screen and shares them. */
  api.importText = function (text, ctx) {
    ctx = ctx || (live && live.ctx); if (!ctx) return;
    var r = parseImport(text);
    if (!r.ok) {
      var why = { json: ['That is not a settings file.', 'Das ist keine Einstellungsdatei.'], notours: ['That file is not from the Okie Motor.', 'Diese Datei stammt nicht vom Okie Motor.'], nosettings: ['The file has no settings in it.', 'Die Datei enthält keine Einstellungen.'], toobig: ['The file is too big.', 'Die Datei ist zu groß.'] }[r.error] || ['Could not read the file.', 'Datei nicht lesbar.'];
      ctx.toast('error', say(ctx, why[0], why[1])); return;
    }
    var when = r.exported ? r.exported.slice(0, 10) : '';
    ctx.sheet({ title: say(ctx, 'Import settings', 'Einstellungen importieren'), content: function (close) {
      return h('div', null,
        h('p', null, say(ctx, 'Replace the settings of this card with the file' + (when ? ' from ' + when : '') + '? It holds ' + r.favorites + ' favorites and ' + r.items + ' settings in all. Your current settings are kept once as a backup.',
          'Die Einstellungen dieser Karte durch die Datei' + (when ? ' vom ' + when : '') + ' ersetzen? Sie enthält ' + r.favorites + ' Favoriten und insgesamt ' + r.items + ' Einstellungen. Deine jetzigen Einstellungen bleiben einmal als Sicherung erhalten.')),
        h('div.actrow', null,
          h('button.act', { onclick: close }, ctx.t ? ctx.t('card.close') : 'Cancel'),
          h('button.act.danger', { onclick: function () {
            if (live) { live.applyUser(r.settings); live.pushNow(); } else { ctx.settings.reset(); ctx.settings.set(r.settings); }
            ctx.toast('success', say(ctx, 'Settings imported', 'Einstellungen importiert')); close();
          } }, say(ctx, 'Import', 'Importieren'))));
    } });
  };

  g.OkieMotor.defaults = Object.assign(g.OkieMotor.defaults || {}, { sync: { enabled: true } });
  g.OkieMotor.sync = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);

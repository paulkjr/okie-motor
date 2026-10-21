/* okie-core: shared plumbing for the Okie motor modules.
 *
 * - LRU:     small memory cache (FSC "Memory cache. LRU. Volatile.")
 * - store:   three-tier persistence (memory -> localStorage -> IndexedDB), the
 *            same split FSC documents. Reads are synchronous from the memory
 *            mirror; writes land in memory at once, in localStorage when the
 *            value is small, and in IndexedDB as one batched transaction.
 * - bus:     tiny event emitter
 * - i18n:    t(key) with EN/DE dictionaries and a German-to-English fallback
 *            chain (modules register their own strings)
 *
 * Everything is injectable so it runs the same under node tests and in the
 * browser. Loaded as a classic/module script: it publishes window.OkieMotor.core
 * and, under node, module.exports.
 */
(function (g) {
  'use strict';

  // --------------------------------------------------------------- LRU ----
  function createLRU(max) {
    var limit = Math.max(1, max | 0 || 30);
    var map = new Map();
    return {
      get: function (key) {
        if (!map.has(key)) return undefined;
        var v = map.get(key);
        map.delete(key);
        map.set(key, v); // refresh recency
        return v;
      },
      set: function (key, value) {
        if (map.has(key)) map.delete(key);
        map.set(key, value);
        if (map.size > limit) map.delete(map.keys().next().value); // oldest first
      },
      has: function (key) { return map.has(key); },
      clear: function () { map.clear(); },
      get size() { return map.size; },
    };
  }

  // --------------------------------------------------------------- bus ----
  function createBus() {
    var handlers = {};
    return {
      on: function (name, fn) {
        (handlers[name] = handlers[name] || []).push(fn);
        return function () { handlers[name] = (handlers[name] || []).filter(function (f) { return f !== fn; }); };
      },
      emit: function (name, payload) {
        (handlers[name] || []).slice().forEach(function (fn) {
          try { fn(payload); } catch (e) { if (g.console) console.error('[okie] handler for ' + name + ' failed', e); }
        });
      },
    };
  }

  // ------------------------------------------------------------- store ----
  var LS_LIMIT = 64 * 1024; // values above this go to IndexedDB only

  function defaultIdbAdapter(indexedDB) {
    if (!indexedDB) return null;
    var dbp = null;
    function open() {
      if (dbp) return dbp;
      dbp = new Promise(function (resolve, reject) {
        var req = indexedDB.open('okie-motor', 1);
        req.onupgradeneeded = function () { req.result.createObjectStore('kv'); };
        req.onsuccess = function () { resolve(req.result); };
        req.onerror = function () { reject(req.error); };
      });
      return dbp;
    }
    return {
      get: function (key) {
        return open().then(function (db) {
          return new Promise(function (resolve, reject) {
            var r = db.transaction('kv', 'readonly').objectStore('kv').get(key);
            r.onsuccess = function () { resolve(r.result === undefined ? null : r.result); };
            r.onerror = function () { reject(r.error); };
          });
        });
      },
      // One transaction for the whole batch, as FSC does.
      setMany: function (entries) {
        return open().then(function (db) {
          return new Promise(function (resolve, reject) {
            var tx = db.transaction('kv', 'readwrite');
            var os = tx.objectStore('kv');
            entries.forEach(function (e) { os.put(e[1], e[0]); });
            tx.oncomplete = function () { resolve(); };
            tx.onerror = function () { reject(tx.error); };
          });
        });
      },
    };
  }

  /**
   * opts: { prefix, localStorage, idb (adapter), flushDelayMs, setTimeout }
   * idb adapter shape: { get(key): Promise<value|null>, setMany([[k,v]...]): Promise }
   */
  function createStore(opts) {
    opts = opts || {};
    var prefix = opts.prefix || 'okie:';
    var ls = opts.localStorage !== undefined ? opts.localStorage : safeLocalStorage();
    var idb = opts.idb !== undefined ? opts.idb : defaultIdbAdapter((function () { try { return g.indexedDB; } catch (e) { return null; } })());   // the getter can throw in a locked-down frame
    var delay = opts.flushDelayMs == null ? 250 : opts.flushDelayMs;
    var timer = opts.setTimeout || g.setTimeout;
    var mem = new Map();
    var pending = new Map();
    var scheduled = false;
    var flushes = 0;

    function readLS(key) {
      if (!ls) return undefined;
      try {
        var raw = ls.getItem(prefix + key);
        return raw == null ? undefined : JSON.parse(raw);
      } catch (e) { return undefined; }
    }
    function writeLS(key, value) {
      if (!ls) return;
      try {
        var raw = JSON.stringify(value);
        if (raw.length > LS_LIMIT) { ls.removeItem(prefix + key); return; }
        ls.setItem(prefix + key, raw);
      } catch (e) { /* quota or private mode: memory + idb still hold it */ }
    }

    function flush() {
      scheduled = false;
      if (!pending.size) return Promise.resolve();
      var entries = Array.from(pending.entries());
      pending.clear();
      flushes++;
      if (!idb) return Promise.resolve();
      return idb.setMany(entries).catch(function (e) {
        if (g.console) console.warn('[okie] indexedDB write failed', e);
      });
    }

    return {
      /** Synchronous read: memory, then localStorage. */
      get: function (key, fallback) {
        if (mem.has(key)) return mem.get(key);
        var v = readLS(key);
        if (v !== undefined) { mem.set(key, v); return v; }
        return fallback === undefined ? null : fallback;
      },
      /** Async read that also consults IndexedDB (for big values). */
      getAsync: function (key, fallback) {
        var sync = this.get(key, undefined);
        if (sync !== null && sync !== undefined) return Promise.resolve(sync);
        if (!idb) return Promise.resolve(fallback === undefined ? null : fallback);
        return idb.get(key).then(function (v) {
          if (v === null || v === undefined) return fallback === undefined ? null : fallback;
          mem.set(key, v);
          return v;
        }, function () { return fallback === undefined ? null : fallback; });
      },
      set: function (key, value) {
        mem.set(key, value);
        writeLS(key, value);
        pending.set(key, value);
        if (!scheduled) { scheduled = true; timer(flush, delay); }
      },
      flush: flush,
      get flushCount() { return flushes; },
    };
  }

  function safeLocalStorage() {
    try { return g.localStorage || null; } catch (e) { return null; }
  }

  // -------------------------------------------------------------- i18n ----
  var dicts = { en: {}, de: {} };
  function registerStrings(lang, strings) {
    dicts[lang] = Object.assign(dicts[lang] || {}, strings);
  }
  function pickLang(lang) {
    var l = String(lang || (g.navigator && g.navigator.language) || 'en').toLowerCase().slice(0, 2);
    return dicts[l] ? l : 'en';
  }
  function t(key, lang, vars) {
    var l = pickLang(lang);
    var s = (dicts[l] && dicts[l][key]);
    if (s === undefined) s = dicts.en[key];
    if (s === undefined) s = (dicts.de[key]);
    if (s === undefined) return key;
    if (vars) s = s.replace(/\{(\w+)\}/g, function (m, k) { return vars[k] == null ? m : vars[k]; });
    return s;
  }

  // ---------------------------------------------------------- registry ----
  /**
   * The plugin framework: system entities ("apps") register once and the card
   * discovers them by id, category or domain. Mirrors FSC's SystemEntityRegistry.
   * app: { id, name, icon, color, category, domain?, order?, render(container, ctx) -> dispose? }
   */
  function createRegistry() {
    var apps = new Map();
    var bus = createBus();
    return {
      register: function (app) {
        if (!app || !app.id) throw new Error('app needs an id');
        apps.set(app.id, Object.assign({ order: 100, category: 'system' }, app));
        bus.emit('change', { id: app.id, type: 'register' });
        return function () { apps.delete(app.id); bus.emit('change', { id: app.id, type: 'unregister' }); };
      },
      get: function (id) { return apps.get(id) || null; },
      list: function (filter) {
        var all = Array.from(apps.values());
        if (filter && filter.category) all = all.filter(function (a) { return a.category === filter.category; });
        if (filter && filter.domain) all = all.filter(function (a) { return a.domain === filter.domain; });
        return all.sort(function (a, b) { return a.order - b.order || a.name.localeCompare(b.name); });
      },
      on: bus.on,
    };
  }

  // ----------------------------------------------------------- settings ----
  function isObj(v) { return v && typeof v === 'object' && !Array.isArray(v); }
  function deepMerge(a, b) {
    if (!isObj(a) || !isObj(b)) return b === undefined ? a : b;
    var out = Object.assign({}, a);
    Object.keys(b).forEach(function (k) { out[k] = isObj(a[k]) && isObj(b[k]) ? deepMerge(a[k], b[k]) : b[k]; });
    return out;
  }
  function flatten(o, prefix, out) {
    out = out || {};
    Object.keys(o || {}).forEach(function (k) {
      var key = prefix ? prefix + '.' + k : k;
      if (isObj(o[k])) flatten(o[k], key, out); else out[key] = o[k];
    });
    return out;
  }
  /**
   * Effective settings = defaults < card config (YAML) < what the user changed.
   * Only the user's changes are persisted, so a YAML edit still takes effect
   * for anything the user has not touched. changed() lists the paths whose
   * effective value differs from defaults+config (the "Changed" filter).
   */
  function createSettings(o) {
    var store = o.store, key = o.key || 'settings';
    var base = deepMerge(o.defaults || {}, o.config || {});
    var user = store.get(key, {}) || {};
    var bus = createBus();
    var eff = deepMerge(base, user);
    function recompute() { eff = deepMerge(base, user); }
    return {
      get: function () { return eff; },
      set: function (partial) {
        user = deepMerge(user, partial);
        recompute();
        store.set(key, user);
        bus.emit('change', partial);
      },
      reset: function (path) {
        if (!path) user = {};
        else {
          var parts = path.split('.'), cur = user;
          for (var i = 0; i < parts.length - 1 && cur; i++) cur = cur[parts[i]];
          if (cur) delete cur[parts[parts.length - 1]];
        }
        recompute(); store.set(key, user);
        var partial = {};                                    // listeners look at the keys of a change: say which one went back to its default
        if (path) { var ks = path.split('.'), t = partial, v = eff; for (var j = 0; j < ks.length; j++) { v = v == null ? v : v[ks[j]]; if (j < ks.length - 1) t = t[ks[j]] = {}; else t[ks[j]] = v; } }
        bus.emit('change', partial);
      },
      defaultOf: function (path) { var v = base; String(path).split('.').forEach(function (k) { v = v == null ? v : v[k]; }); return v; },
      setBase: function (config) { base = deepMerge(o.defaults || {}, config || {}); recompute(); },
      changed: function () {
        var a = flatten(eff), b = flatten(base);
        return Object.keys(a).filter(function (k) { return JSON.stringify(a[k]) !== JSON.stringify(b[k]); });
      },
      on: bus.on,
    };
  }

  var api = {
    createSettings: createSettings, deepMerge: deepMerge, flatten: flatten,
    createRegistry: createRegistry,
    createLRU: createLRU,
    createBus: createBus,
    createStore: createStore,
    registerStrings: registerStrings,
    t: t,
    pickLang: pickLang,
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else {
    g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.core = api;
    g.OkieMotor.apps = g.OkieMotor.apps || createRegistry();   // shared plugin registry
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);

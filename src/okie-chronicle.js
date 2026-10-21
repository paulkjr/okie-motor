/* okie-chronicle: "what the whole house did", fed by the live state stream.
 * No polling: the card emits `states` on its bus, this turns the interesting
 * changes into entries ("Window Kitchen -> Open"), keeps the latest 200 in the
 * persistent store, and exposes them to the bento tile and the notification
 * center's Verlauf tab.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var F = isNode ? require('./okie-feeds.js') : g.OkieMotor.feeds;
  var core = isNode ? require('./okie-core.js') : g.OkieMotor.core;

  /**
   * createRecorder({ store, engine, lang(), now() })
   * handle([{id, old, next}]) -> entries appended
   */
  function createRecorder(o) {
    var bus = core.createBus();
    var list = (o.store.get('chronicle', []) || []).slice();
    var nowFn = o.now || Date.now;
    var tick = 0;
    function handle(changes) {
      var added = [];
      changes.forEach(function (c) {
        if (!c.old || !c.next) return;
        var item = o.engine.getItem(c.id);
        if (!item || o.engine.isExcluded(item)) return;
        var ph = F.phraseFor(item, c.old.state, c.next.state, o.lang());
        if (!ph) return;
        var entry = { id: c.id, ts: nowFn(), name: item.name, area: item.area || '', domain: item.domain, deviceClass: item.deviceClass || null, text: ph.text, state: c.next.state, seq: ++tick };
        F.pushChronicle(list, entry, 200);
        added.push(entry);
      });
      if (added.length) { o.store.set('chronicle', list); bus.emit('change', added); }
      return added;
    }
    /** seed(events): logbook rows [{entity_id, state, when}] from before the card started; merged by time, no duplicates. */
    function seed(events) {
      var have = {}; list.forEach(function (e) { have[e.id + '@' + e.ts] = 1; });
      var added = [];
      (events || []).forEach(function (ev) {
        if (!ev || !ev.entity_id || ev.state == null) return;
        var item = o.engine.getItem(ev.entity_id);
        if (!item || o.engine.isExcluded(item)) return;
        var ts = typeof ev.when === 'number' ? (ev.when < 1e12 ? Math.round(ev.when * 1000) : ev.when) : Date.parse(ev.when);
        if (!ts || isNaN(ts) || have[ev.entity_id + '@' + ts]) return;
        var ph = F.phraseFor(item, '\u0000', ev.state, o.lang());          // the logbook only says where it went, so any previous state will do
        if (!ph) return;
        have[ev.entity_id + '@' + ts] = 1;
        added.push({ id: ev.entity_id, ts: ts, name: item.name, area: item.area || '', domain: item.domain, deviceClass: item.deviceClass || null, text: ph.text, state: ev.state, seq: ++tick });
      });
      if (!added.length) return added;
      Array.prototype.push.apply(list, added);
      list.sort(function (a, b) { return a.ts - b.ts || a.seq - b.seq; });
      while (list.length > 200) list.shift();
      o.store.set('chronicle', list); bus.emit('change', added);
      return added;
    }
    return {
      handle: handle, seed: seed,
      /** Raw entries, oldest first. */
      raw: function () { return list.slice(); },
      /** Folded entries, newest first (repeated flaps become one row with a count). */
      recent: function (n) { return F.foldFlaps(list).slice().reverse().slice(0, n || 5); },
      days: function (lang) { return F.groupByDay(F.foldFlaps(list), nowFn(), lang); },
      clear: function () { list.length = 0; o.store.set('chronicle', list); bus.emit('change', []); },
      on: bus.on,
    };
  }

  var api = { createRecorder: createRecorder };
  if (isNode) module.exports = api;
  else {
    g.OkieMotor = g.OkieMotor || {}; g.OkieMotor.chronicle = api;
    api.mount = function (ctx) {
      var rec = createRecorder({ store: ctx.store, engine: ctx.engine, lang: function () { return ctx.lang(); } });
      ctx.chronicle = rec;
      var off = ctx.bus.on('states', function (changes) { rec.handle(changes); });
      // a wall tablet reloads: ask Home Assistant what the house did in the last hours, so "Last: ..." is right at once
      var gone = false;
      try {
        var end = new Date(), start = new Date(end.getTime() - 6 * 3600000);
        Promise.resolve(ctx.callWS({ type: 'logbook/get_events', start_time: start.toISOString(), end_time: end.toISOString() })).then(function (r) { if (!gone && Array.isArray(r)) rec.seed(r); }, function () { /* no logbook: live changes only */ });
      } catch (e) { /* older Home Assistant */ }
      return { dispose: function () { gone = true; off(); } };
    };
  }
})(typeof globalThis !== 'undefined' ? globalThis : window);

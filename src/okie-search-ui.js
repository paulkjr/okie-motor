/* okie-search-ui: the search row (FSC "search panel").
 *
 * One persistent glass pill under the status row. Collapsed it is a 94px pill with a
 * typewriter line ("Last: <what changed last>"); focus or tap grows it into the full
 * panel (radius 47 -> 35, height = panel height) which covers the bento and shows the
 * results: sub-category chips with live "on" counts, groups with count badges, the
 * tile grid (4/5/6 columns by width) or the list. The filter button opens a small
 * popup that grows out of it: VIEW (Tiles / List) and FILTER BY (Categories / Rooms /
 * Recent). Typing parses area / domain chips and shows a ghost completion; Tab
 * accepts it. Everything about searching itself lives in okie-search / okie-logic.
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, L = g.OkieMotor.logic, S = g.OkieMotor.search, core = g.OkieMotor.core, TL = g.OkieMotor.tiles;
  var h = UI.h;

  core.registerStrings('en', {
    'browse.devices': 'Devices', 'browse.sensors': 'Sensors', 'browse.actions': 'Actions', 'browse.custom': 'Custom', 'browse.apps': 'Apps',
    'fm.what': 'What is this?', 'fm.close': 'Close',
    'fm.info_cat': 'Which collection is searched: devices, sensors, actions (scripts, automations, scenes) or custom (system pages such as settings and marketplace). The bar below then shows the matching subcategories.',
    'fm.info_view': 'How results are laid out: Tiles shows large cards side by side, List stacks them narrow — more devices at a glance.',
    'fm.info_filter': 'What the bar below the search groups by: Categories (lights, covers …), Rooms or last used. One choice is always set — the bar is never empty.',
    'chip.all': 'All', 'chip.favorites': 'Favorites', 'chip.suggestions': 'Suggestions', 'chip.lights': 'Lights', 'chip.switches': 'Switches',
    'chip.climate': 'Climate', 'chip.covers': 'Covers', 'chip.media': 'Media', 'chip.cleaning': 'Cleaning', 'chip.security': 'Security',
    'browse.noroom': 'No room', 'browse.mostused': 'Most used',
    'browse.empty': 'Nothing found', 'browse.empty_hint': 'Try fewer words, or check the visibility filters in Settings.',
    'browse.relaxed': 'No exact match, showing the closest', 'browse.offline': 'Found, but Home Assistant reports it as unavailable. Check that the device is on and online.', 'browse.unassigned': 'Found, but it has no room in Home Assistant, so the list normally hides it. Give it a room there to see it everywhere.', 'browse.accept': 'Accept suggestion', 'browse.more': 'More',
    'browse.category': 'Category', 'browse.hold': 'Hold to confirm', 'browse.failed': 'Could not {action} {name}', 'browse.open_detail': 'Open {name}',
    'browse.clear': 'Clear', 'browse.filters': 'Filters', 'browse.search': 'Search',
    'layout.grid': 'Tiles', 'layout.list': 'List',
    's.view': 'View', 's.filterby': 'Filter by', 's.categories': 'Categories', 's.rooms': 'Rooms', 's.recent': 'Recent',
    's.last': 'Last: {name}', 's.ph_devices': 'Search devices…', 's.ph_sensors': 'Search sensors…', 's.ph_actions': 'Search actions…', 's.ph_custom': 'Search apps…',
    's.ai': 'AI assistant', 's.ai_off': 'Back to search', 's.ai_ph': 'Ask your home…', 's.ai_ex1': 'Turn off the living room lights', 's.ai_ex2': 'Is the front door locked?', 's.ai_ex3': 'What is the temperature in the kitchen?', 's.ai_ask': 'Ask the assistant', 's.ai_hello': 'Ask me anything about your home, or tell me what to do.', 's.ai_thinking': 'Thinking…', 's.ai_mic': 'Speak', 's.ai_clear': 'New chat', 's.today': 'Today', 's.earlier': 'Earlier', 's.min': 'Last {n} min', 's.hour': 'Last hour', 's.hours': 'Last {n} hours',
  });
  core.registerStrings('de', {
    'browse.devices': 'Geräte', 'browse.sensors': 'Sensoren', 'browse.actions': 'Aktionen', 'browse.custom': 'Benutzerdefiniert', 'browse.apps': 'Apps',
    'fm.what': 'Was ist das?', 'fm.close': 'Schließen',
    'fm.info_cat': 'Welcher Bestand durchsucht wird: Geräte, Sensoren, Aktionen (Skripte, Automationen, Szenen) oder Benutzerdefiniert (Systemseiten wie Einstellungen und Marktplatz). Die Leiste darunter zeigt anschließend die passenden Unterkategorien.',
    'fm.info_view': 'Wie die Ergebnisse dargestellt werden: Kacheln zeigt große Karten nebeneinander, Liste stapelt sie schmal untereinander — mehr Geräte auf einen Blick.',
    'fm.info_filter': 'Wonach die Leiste unter der Suche gruppiert: Kategorien (Lichter, Rollos …), Räume oder Zuletzt benutzt. Eine der Wahlen ist immer gesetzt — die Leiste ist nie leer.',
    'chip.all': 'Alle', 'chip.favorites': 'Favoriten', 'chip.suggestions': 'Vorschläge', 'chip.lights': 'Lichter', 'chip.switches': 'Schalter',
    'chip.climate': 'Klima', 'chip.covers': 'Rollos', 'chip.media': 'Medien', 'chip.cleaning': 'Reinigung', 'chip.security': 'Sicherheit',
    'browse.noroom': 'Ohne Raum', 'browse.mostused': 'Meist genutzt',
    'browse.empty': 'Nichts gefunden', 'browse.empty_hint': 'Weniger Wörter versuchen oder die Sichtbarkeitsfilter in den Einstellungen prüfen.',
    'browse.relaxed': 'Kein genauer Treffer, zeige das Ähnlichste', 'browse.offline': 'Gefunden, aber Home Assistant meldet es als nicht verfügbar. Prüfe, ob das Gerät an und online ist.', 'browse.unassigned': 'Gefunden, aber es hat keinen Raum in Home Assistant, daher blendet die Liste es normalerweise aus. Gib ihm dort einen Raum, dann siehst du es überall.', 'browse.accept': 'Vorschlag übernehmen', 'browse.more': 'Mehr',
    'browse.category': 'Kategorie', 'browse.hold': 'Zum Bestätigen halten', 'browse.failed': '{action} fehlgeschlagen: {name}', 'browse.open_detail': '{name} öffnen',
    'browse.clear': 'Leeren', 'browse.filters': 'Filter', 'browse.search': 'Suchen',
    'layout.grid': 'Kacheln', 'layout.list': 'Liste',
    's.view': 'Ansicht', 's.filterby': 'Filtern nach', 's.categories': 'Kategorien', 's.rooms': 'Räume', 's.recent': 'Zuletzt',
    's.last': 'Zuletzt: {name}', 's.ph_devices': 'Geräte suchen…', 's.ph_sensors': 'Sensoren suchen…', 's.ph_actions': 'Aktionen suchen…', 's.ph_custom': 'Apps suchen…',
    's.ai': 'KI-Assistent', 's.ai_off': 'Zurück zur Suche', 's.ai_ph': 'Frag dein Zuhause…', 's.ai_ex1': 'Schalte die Wohnzimmerlichter aus', 's.ai_ex2': 'Ist die Haustür abgeschlossen?', 's.ai_ex3': 'Wie warm ist es in der Küche?', 's.ai_ask': 'Den Assistenten fragen', 's.ai_hello': 'Frag mich etwas über dein Zuhause oder sag mir, was ich tun soll.', 's.ai_thinking': 'Denkt nach…', 's.ai_mic': 'Sprechen', 's.ai_clear': 'Neuer Chat', 's.today': 'Heute', 's.earlier': 'Früher', 's.min': 'Letzte {n} Min.', 's.hour': 'Letzte Stunde', 's.hours': 'Letzte {n} Stunden',
  });

  var CHUNK = 60;

  function create(ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var engine = ctx.engine;
    var registry = new Map();
    var tl = TL.create(ctx, registry);
    var cfg = function () { return ctx.settings.get().search; };
    var st = { ai: false, aiBusy: false, open: false, query: '', chips: [], selectedChip: -1, ghost: null, plan: null, pos: null, secs: [], count: 0, relaxed: false, offline: [], unassigned: [], t0: Date.now(), line: '' };
    var searchTimer = 0, typeTimer = 0, io = null, ro = null, ranOnce = false;

    // ------------------------------------------------------------ DOM ----
    var catBtn = h('button.category-icon', { 'aria-label': t('browse.category'), onclick: function (e) { e.stopPropagation(); if (!st.ai) openCategorySheet(); } }, h('span', { html: UI.icon('grid', 24) }));
    var chipBox = h('div.chipbox');
    var input = h('input.search-input', { type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: false, placeholder: ' ', 'aria-label': t('browse.search'), enterkeyhint: 'search' });
    var ghostEl = h('div.ghost-mirror', { 'aria-hidden': 'true' }, h('span.typed'), h('span.rest'));
    var typedEl = h('span.tt');
    var typist = h('div.fsc-tippzeile', { 'aria-hidden': 'true' }, typedEl, h('span.fsc-caret'));
    var accept = h('button.accept', { 'aria-label': t('browse.accept'), hidden: true, onclick: function (e) { e.stopPropagation(); acceptGhost(); input.focus(); }, html: UI.icon('check', 18) });
    var inputBox = h('div.search-input-container.v4-layout', null, ghostEl, typist, input, accept);
    var filterBtn = h('button.filter-main-button', { 'aria-label': t('browse.filters'), 'aria-haspopup': 'dialog', onclick: function (e) { e.stopPropagation(); openFilterSheet(); }, html: UI.icon('filterlines', 22) });
    var SYS = function () { return g.OkieMotor.system && g.OkieMotor.system.assistant; };
    var SpeechRec = g.SpeechRecognition || g.webkitSpeechRecognition;
    var aiBtn = h('button.ai-button', { 'aria-label': t('s.ai'), 'aria-pressed': 'false', title: t('s.ai'), onclick: function (e) { e.stopPropagation(); setAi(!st.ai); }, html: UI.icon('spark', 20) });
    var micBtn = SpeechRec ? h('button.ai-mic', { hidden: true, 'aria-label': t('s.ai_mic'), title: t('s.ai_mic'), onclick: function (e) { e.stopPropagation(); startVoice(); }, html: UI.icon('mic', 18) }) : null;
    var wrapper = h('div.search-wrapper', null, catBtn, chipBox, inputBox, h('div.such-aktion', null, micBtn, aiBtn, filterBtn));
    function applyUiSettings() {
      var c = cfg(); filterBtn.hidden = c.filterButton === false; panel.classList.toggle('no-count', c.count === false);
      var aiOk = c.ai !== false && !!SYS(); aiBtn.hidden = !aiOk; panel.dataset.aiok = String(aiOk);
      if (micBtn) { micBtn.hidden = !aiOk; panel.dataset.mic = String(aiOk); }      // the microphone is there from the start: one tap opens the assistant and listens
      if (!aiOk && st.ai) setAi(false);
    }
    var results = h('div.results-container.no-scrollbar');
    var sentinel = h('div.sentinel');
    var panel = h('div.search-panel.glass-panel', { dataset: { open: 'false' } }, wrapper, results);
    var root = h('div.search-row', null, panel);

    // ------------------------------------------------------- typewriter ----
    function lines() {
      if (st.ai) return [SYS() && SYS().history(ctx).length ? t('y.followup') : t('y.ask_anything') + '...'];
      var out = [], c = cfg();
      if (c.context) {
        var rec = ctx.chronicle && ctx.chronicle.recent ? ctx.chronicle.recent(1)[0] : null;
        if (rec && rec.name) out.push(t('s.last', { name: L.shortName(rec.name, rec.area) }));
      }
      out.push(t('s.ph_' + ctx.settings.get().topCategory));
      return out;
    }
    var reduced = !!(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches);
    function tick() {
      if (!panel.isConnected || document.visibilityState === 'hidden') return;
      var ls = lines(), txt;
      if (!cfg().typewriter || reduced) txt = ls[0];
      else txt = L.typistAt(ls, Date.now() - st.t0, {}).text;
      if (txt !== st.line) { st.line = txt; typedEl.textContent = txt; }
    }
    function startTypist() { clearInterval(typeTimer); tick(); typeTimer = setInterval(tick, 60); }

    // -------------------------------------------------------------- chips ----
    function renderChips() {
      chipBox.innerHTML = '';
      st.chips.forEach(function (c, i) {
        chipBox.appendChild(h('button.chip.' + c.kind + (i === st.selectedChip ? '.sel' : ''), {
          'aria-label': c.label + ', ' + t('browse.clear'),
          onclick: function (e) {
            e.stopPropagation();
            if (st.selectedChip === i) { st.chips.splice(i, 1); st.selectedChip = -1; renderChips(); run(); }
            else { st.selectedChip = i; renderChips(); }
          },
        }, c.icon ? h('span', { html: UI.icon(c.icon, 14) }) : null, h('span', null, c.label)));
      });
    }
    function lastWord() { var m = /(\S+)$/.exec(input.value); return m ? m[1] : ''; }
    function syncHas() { inputBox.dataset.has = input.value ? 'true' : 'false'; }
    function updateGhost() {
      var w = lastWord();
      var c = !st.ai && w && input.selectionStart === input.value.length ? engine.complete(w) : null;
      st.ghost = c;
      ghostEl.firstChild.textContent = input.value;
      ghostEl.lastChild.textContent = c ? c.ghost : '';
      accept.hidden = !c;
      syncHas();
    }
    function acceptGhost() {
      var c = st.ghost;
      if (!c) return false;
      var w = lastWord();
      input.value = input.value.slice(0, input.value.length - w.length).replace(/\s+$/, '');
      st.chips.push({ kind: c.kind, value: c.value, label: c.full, icon: c.kind === 'domain' ? UI.domainIcon(c.value) : null });
      st.selectedChip = -1; st.query = input.value;
      renderChips(); updateGhost(); run();
      return true;
    }
    function clearAll() { input.value = ''; st.query = ''; st.chips = []; st.selectedChip = -1; renderChips(); updateGhost(); }

    input.addEventListener('focus', function () { open({ focus: false }); });
    input.addEventListener('input', function () {
      open({ focus: false });
      st.query = input.value; st.selectedChip = -1; renderChips(); updateGhost();
      clearTimeout(searchTimer);
      if (!st.ai) searchTimer = setTimeout(run, 110);       // typed text shows instantly; search follows
    });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' && st.ghost && !e.shiftKey) { e.preventDefault(); acceptGhost(); return; }
      if (e.key === 'Backspace' && input.value === '' && st.chips.length) {
        e.preventDefault();
        if (st.selectedChip === st.chips.length - 1) { st.chips.pop(); st.selectedChip = -1; renderChips(); run(); }   // second tap removes
        else { st.selectedChip = st.chips.length - 1; renderChips(); }                                                // first tap selects
        return;
      }
      if (e.key === 'Enter' && !e.isComposing) {
        var q = input.value.trim();
        if (st.ai) { e.preventDefault(); if (q) send(q); return; }
        if (q && cfg().ai !== false && SYS() && st.count === 0 && !st.chips.length) { e.preventDefault(); askFromSearch(q); return; }   // nothing found: ask instead
      }
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (st.ai && !input.value) { setAi(false); return; }
        if (input.value || st.chips.length) { clearAll(); if (!st.ai) run(); } else close();
      }
    });
    input.addEventListener('keyup', updateGhost);
    input.addEventListener('click', updateGhost);
    wrapper.addEventListener('pointerdown', function (e) {
      if (st.open || e.target.closest('button')) return;
      open();                         // anywhere on the collapsed pill opens it
      // the panel now covers the spot that was tapped: the click that follows this press must not land on a result under the finger (it opened Tasks)
      var until = Date.now() + 600, eat = function (ev) { if (Date.now() < until && !wrapper.contains(ev.target)) { ev.stopPropagation(); ev.preventDefault(); } };
      ctx.stage.addEventListener('click', eat, true); setTimeout(function () { ctx.stage.removeEventListener('click', eat, true); }, 650);
    });
    wrapper.addEventListener('click', function (e) { if (!e.target.closest('button,input')) input.focus(); });

    // ----------------------------------------------------- popups ----
    // ---- the two popups (FSC "morph" windows): a small-caps label with an info button, then a row of round choices ----
    var SV = function (inner) { return '<svg viewBox="0 0 24 24">' + inner + '</svg>'; }, RND = ' stroke-linecap="round" stroke-linejoin="round"';
    var INFO_SVG = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9.2" stroke-width="1.9"/><path d="M12 11v5.4M12 7.6h.01" stroke-width="2" stroke-linecap="round"/></svg>';
    var ICON = {
      devices: SV('<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>'),
      sensors: SV('<path d="M12 22L12 2"' + RND + '/><path d="M20.57 17.55L3.43 7.25"' + RND + '/><path d="M3.43 17.55L20.57 7.25"' + RND + '/>'),
      actions: SV('<path d="M4.4 13.61C3.52 13.14 3 12.59 3 12C3 10.34 7.03 9 12 9C16.97 9 21 10.34 21 12C21 12.71 20.25 13.37 19 13.89"/><path d="M12 11.01L12.01 11"/><path d="M16.88 6C16.88 4.98 16.62 4.25 16.09 3.98C14.61 3.23 11.58 6.21 9.33 10.64C7.07 15.07 6.44 19.27 7.91 20.02C8.44 20.29 9.17 20.08 9.98 19.5"/><path d="M9.6 4.25C8.94 3.87 8.36 3.75 7.91 3.98C6.44 4.73 7.07 8.93 9.33 13.36C11.58 17.79 14.61 20.77 16.09 20.02C17.4 19.35 17.04 15.96 15.36 12.1"/>'),
      custom: SV('<path d="M21 7.35L21 16.65C21 16.86 20.88 17.07 20.69 17.17L12.29 21.84C12.11 21.94 11.89 21.94 11.71 21.84L3.31 17.17C3.12 17.07 3 16.86 3 16.65L3 7.35C3 7.14 3.12 6.93 3.31 6.83L11.71 2.16C11.89 2.06 12.11 2.06 12.29 2.16L20.69 6.83C20.88 6.93 21 7.14 21 7.35Z"/><path d="M20.5 16.72L12.29 12.16C12.11 12.06 11.89 12.06 11.71 12.16L3.5 16.72"/><path d="M3.53 7.29L11.71 11.84C11.89 11.94 12.11 11.94 12.29 11.84L20.5 7.28"/><path d="M12 21L12 3"/>'),
      grid: SV('<rect x="5" y="5" width="5" height="5"/><rect x="14" y="5" width="5" height="5"/><rect x="5" y="14" width="5" height="5"/><rect x="14" y="14" width="5" height="5"/>'),
      list: SV('<path d="M8 6L20 6"' + RND + '/><path d="M4 6.01L4.01 6"' + RND + '/><path d="M4 12.01L4.01 12"' + RND + '/><path d="M4 18.01L4.01 18"' + RND + '/><path d="M8 12L20 12"' + RND + '/><path d="M8 18L20 18"' + RND + '/>'),
      tag: SV('<path d="M20.4 13.1l-7.3 7.3a2 2 0 0 1-2.8 0l-6.6-6.6A2 2 0 0 1 3.1 12.4V5.1a2 2 0 0 1 2-2h7.3c.5 0 1 .2 1.4.6l6.6 6.6a2 2 0 0 1 0 2.8z" stroke-linejoin="round"/><circle cx="8.1" cy="8.1" r="1.5"/>'),
      room: SV('<path d="M10 18V15C10 13.9 10.9 13 12 13V13C13.1 13 14 13.9 14 15V18"' + RND + '/><path d="M2 8L11.73 3.13C11.9 3.05 12.1 3.05 12.27 3.13L22 8"' + RND + '/><path d="M20 11V19C20 20.1 19.1 21 18 21H6C4.9 21 4 20.1 4 19V11"' + RND + '/>'),
      recent: SV('<circle cx="12" cy="12" r="9"' + RND + '/><path d="M12 7.5V12L15 13.5"' + RND + '/>'),
    };
    function wahl(svg, label, on, pick) {
      return h('button.filter-modal-wahl' + (on ? '.active' : ''), { type: 'button', 'aria-pressed': on ? 'true' : 'false', onclick: pick }, h('span.filter-modal-symbol', { html: svg }), label);
    }
    function modalGroup(label, info, choices) {
      var shown = null;
      var btn = h('button.filter-modal-infoknopf', { type: 'button', 'aria-label': t('fm.what'), 'aria-expanded': 'false', html: INFO_SVG });
      var row = h('div.filter-modal-zeile');
      var box = h('div.filter-modal-gruppe', null, h('div.filter-modal-kopfzeile', null, h('span.filter-modal-label', null, label), btn), row);
      btn.addEventListener('click', function () {
        if (shown) { shown.remove(); shown = null; } else { shown = h('div.filter-modal-infotext', null, info); box.insertBefore(shown, row); }
        btn.classList.toggle('active', !!shown); btn.setAttribute('aria-expanded', shown ? 'true' : 'false');
      });
      choices.forEach(function (c) { row.appendChild(c); });
      return box;
    }
    function openCategorySheet() {
      var cur = ctx.settings.get().topCategory;
      ctx.morph({
        anchor: catBtn, width: 360, placement: 'anchor-left', className: 'morph-popup--filter', padding: '22px 22px 18px', title: t('browse.category'), closeLabel: t('fm.close'),
        content: function (close) {
          return modalGroup(t('browse.category'), t('fm.info_cat'), ['devices', 'sensors', 'actions', 'custom'].map(function (id) {
            return wahl(ICON[id], t('browse.' + id), id === cur, function () {
              ctx.settings.set({ topCategory: id, chip: 'all' });
              st.t0 = Date.now(); renderSubChips(); open({ focus: false }); run(); close();
            });
          }));
        },
      });
    }
    function openFilterSheet() {
      ctx.morph({
        anchor: filterBtn, width: 280, placement: 'anchor', className: 'morph-popup--filter', padding: '22px 22px 18px', title: t('s.view'), closeLabel: t('fm.close'),
        content: function () {
          var s = ctx.settings.get(), c = s.search, box = h('div');
          function group(title, info, opts, cur, set) {      // choosing keeps the window open, like FSC: the bar behind it changes at once
            var btns = [];
            var choices = opts.map(function (o) {
              var b = wahl(o.svg, o.label, o.id === cur, function () {
                btns.forEach(function (x) { x.classList.remove('active'); x.setAttribute('aria-pressed', 'false'); });
                b.classList.add('active'); b.setAttribute('aria-pressed', 'true'); set(o.id);
              });
              btns.push(b); return b;
            });
            return modalGroup(title, info, choices);
          }
          box.appendChild(group(t('s.view'), t('fm.info_view'), [{ id: 'grid', svg: ICON.grid, label: t('layout.grid') }, { id: 'list', svg: ICON.list, label: t('layout.list') }], s.layout, function (v) { ctx.settings.set({ layout: v }); run(); }));
          var fb = [{ id: 'categories', svg: ICON.tag, label: t('s.categories') }, { id: 'rooms', svg: ICON.room, label: t('s.rooms') }];
          if (c.timeSort !== false) fb.push({ id: 'recent', svg: ICON.recent, label: t('s.recent') });
          box.appendChild(group(t('s.filterby'), t('fm.info_filter'), fb, c.filterBy, function (v) { ctx.settings.set({ search: { filterBy: v } }); run(); }));
          return box;
        },
      });
    }

    // ------------------------------------------------------- planning ----
    function recentTitle(b) {
      if (b.key === 'today') return t('s.today');
      if (b.key === 'earlier') return t('s.earlier');
      if (b.minutes < 60) return t('s.min', { n: b.minutes });
      if (b.minutes === 60) return t('s.hour');
      return t('s.hours', { n: b.minutes / 60 });
    }
    function tsOf(it) {
      var hs = ctx.hass(), s = hs && hs.states[it.id];
      var v = s && (s.last_changed || s.last_updated);
      var n = v ? Date.parse(v) : 0;
      return isNaN(n) ? 0 : n;
    }
    function groupTitle(d) { var lb = S.DOMAIN_LABELS[d]; return lb ? lb[ctx.lang() === 'de' ? 'de' : 'en'] : d; }

    function buildPlan() {
      var s = ctx.settings.get(), c = s.search;
      var q = st.query.trim();
      var searching = !!(q || st.chips.length);
      st.relaxed = false; st.offline = []; st.unassigned = [];
      if (searching) {
        var res = engine.search(q, { chips: st.chips, limit: 300 });
        st.relaxed = res.relaxed; st.offline = res.offline || []; st.unassigned = res.unassigned || []; st.count = res.results.length;
        return { flat: true, groups: [{ key: 'results', title: '', items: res.results.map(function (r) { return r.item; }) }] };
      }
      if (s.topCategory === 'custom') return { apps: ctx.apps(), groups: [] };
      var all = engine.all().filter(function (i) { return !engine.isHidden(i) && L.inTopCategory(i, s.topCategory); });
      var items = L.applyChipFilter(all, s.chip, { favorites: s.favorites, suggestions: s.chip === 'suggestions' ? ctx.suggestions(12) : [] });
      st.count = items.length;
      if (c.filterBy === 'recent' && c.timeSort !== false) {
        var win = L.TIME_SORT[c.recent] || L.TIME_SORT.standard;
        return { flat: false, groups: L.recentBuckets(items, tsOf, Date.now(), win).map(function (b) { return { key: b.key, title: recentTitle(b), areaId: null, items: b.items }; }) };
      }
      return { flat: false, groups: L.groupItems(items, c.filterBy === 'rooms' ? 'area' : 'category', {
        usageScore: function (id) { return ctx.usageScore(id); }, domainLabel: groupTitle, otherLabel: t('browse.noroom'), usageTitle: t('browse.mostused'),
      }) };
    }

    // ---------------------------------------------------- sub chips ----
    var subRow = h('div.subcategory-row', { role: 'tablist' });
    function chipItems(chipId) {
      var s = ctx.settings.get();
      var all = engine.all().filter(function (i) { return !engine.isHidden(i) && L.inTopCategory(i, s.topCategory); });
      return L.applyChipFilter(all, chipId, { favorites: s.favorites, suggestions: chipId === 'suggestions' ? ctx.suggestions(12) : [] });
    }
    function renderSubChips() {
      subRow.innerHTML = '';
      var s = ctx.settings.get(), cur = s.chip;
      if (s.topCategory === 'custom' || !cfg().chips) { subRow.hidden = true; return; }
      subRow.hidden = false;
      var hs = ctx.hass();
      L.CHIP_FILTERS.forEach(function (c) {
        var items = c.id === 'all' || c.id === 'suggestions' ? (c.id === 'all' ? chipItems('all') : []) : chipItems(c.id);
        if (c.id !== 'all' && c.id !== 'suggestions' && c.id !== 'favorites' && !items.length) return;          // no lights, no Lights chip
        var n = c.id === 'suggestions' ? 0 : L.activeCount(items, function (i) { var x = hs && hs.states[i.id]; return x && x.state; });
        subRow.appendChild(h('button.subcategory-chip' + (c.id === cur ? '.on' : ''), {
          role: 'tab', 'aria-selected': c.id === cur ? 'true' : 'false', 'data-chip': c.id,
          onclick: function () { ctx.settings.set({ chip: c.id }); renderSubChips(); run(); },
        }, h('span', null, t('chip.' + c.id)), n ? h('span.cnt', { 'aria-label': n + ' on' }, String(n)) : null));
      });
    }

    // --------------------------------------------------------- render ----
    function areaSensorsEl(areaId) {
      var s = L.areaSensors(engine.all(), areaId), box = h('div.secsens');
      if (s.temperature) box.appendChild(h('span.rs', null, h('span', { html: UI.icon('thermostat', 14) }), s.temperature.value + s.temperature.unit));
      if (s.humidity) box.appendChild(h('span.rs', null, h('span', { html: UI.icon('drop', 14) }), s.humidity.value + s.humidity.unit));
      return box;
    }
    function columns() { var c = cfg().columns; return L.gridColumns(panel.clientWidth || 1200, +c); }
    function applyColumns() { results.style.setProperty('--device-grid-columns', String(columns())); }

    function run() {
      ranOnce = true;
      if (st.ai) { drawChat(); return; }
      var plan = buildPlan();
      st.plan = plan; st.pos = { g: 0, i: 0, grid: null };
      registry.clear(); st.secs = [];
      results.innerHTML = '';
      results.scrollTop = 0;
      applyColumns();
      var searching = !!(st.query.trim() || st.chips.length);
      if (!searching) { renderSubChips(); results.appendChild(subRow); }
      var list = ctx.settings.get().layout === 'list';
      if (plan.apps) {
        var grid = h('div.device-grid-container'); plan.apps.forEach(function (a) { grid.appendChild(tl.makeAppTile(a)); });
        results.appendChild(grid); return;
      }
      var qq = st.query.trim();
      var total = plan.groups.reduce(function (n, gr) { return n + gr.items.length; }, 0);
      var canAsk = cfg().ai !== false && !!SYS() && qq && (L.looksLikeAsk(qq) || (!total && qq.length >= 3));
      if (canAsk) results.insertBefore(h('button.ai-ask', { onclick: function () { askFromSearch(qq); } }, h('span.ai-ask-ic', { html: UI.icon('spark', 18) }), h('span.ai-ask-t', null, h('b', null, t('s.ai_ask')), h('i', null, '“' + qq + '”')), h('span', { html: UI.icon('chevron', 16) })), results.firstChild);
      if (st.unassigned.length) results.appendChild(hiddenBlock(st.unassigned, list, 'browse.unassigned'));
      if (st.offline.length) results.appendChild(hiddenBlock(st.offline, list, 'browse.offline'));
      if (st.relaxed) results.appendChild(h('div.note', null, t('browse.relaxed')));
      if (!total && (st.offline.length || st.unassigned.length)) return;      // those devices are the answer: no "nothing found" under them
      if (!total) { results.appendChild(h('div.empty', null, h('div.empty-t', null, t('browse.empty')), h('div.empty-s', null, canAsk ? t('s.ai_hello') : t('browse.empty_hint')))); return; }
      renderChunk(list);
      results.appendChild(sentinel);
      if (io) io.disconnect();
      if (typeof IntersectionObserver === 'function') {
        io = new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) renderChunk(ctx.settings.get().layout === 'list'); }, { root: results, rootMargin: '400px' });
        io.observe(sentinel);
      }
    }

    /** What matched but the list normally keeps out (offline in Home Assistant, or no room): the same tiles under a short note, so "bed light" is never answered with the closest TV. */
    function hiddenBlock(list, asRows, noteKey) {
      var sec = h('section.group.offline'), grid = h('div.' + (asRows ? 'device-list-container' : 'device-grid-container'));
      sec.appendChild(h('div.note', null, t(noteKey)));
      list.forEach(function (item) {
        grid.appendChild(UI.guard(function () { return asRows ? tl.makeRow(item) : tl.makeTile(item); }, { label: 'tile ' + item.id, text: item.name, compact: true, retry: t('card.retry') }));
      });
      sec.appendChild(grid); return sec;
    }

    function renderChunk(list) {
      var plan = st.plan, pos = st.pos, budget = CHUNK, c = cfg();
      if (!plan || !plan.groups) return;
      while (budget > 0 && pos.g < plan.groups.length) {
        var gr = plan.groups[pos.g];
        if (!pos.grid) {
          if (!gr.items.length) { pos.g++; continue; }
          var sec = h('section.group');
          if (gr.title) {
            var hd = h('div.group-title', null, h('span.gt', null, gr.title), h('span.gcount', null, String(gr.items.length)));
            if (c.filterBy === 'rooms' && gr.areaId) { var sens = areaSensorsEl(gr.areaId); sec._sens = sens; sec._area = gr.areaId; hd.appendChild(sens); }
            sec.appendChild(hd);
          }
          pos.grid = h('div.' + (list ? 'device-list-container' : 'device-grid-container')); sec.appendChild(pos.grid);
          results.insertBefore(sec, sentinel.parentNode === results ? sentinel : null);
          st.secs.push(sec);
        }
        var item = gr.items[pos.i++];
        pos.grid.appendChild(UI.guard(function () { return list ? tl.makeRow(item) : tl.makeTile(item); }, { label: 'tile ' + item.id, text: item.name, compact: true, retry: t('card.retry') }));
        budget--;
        if (pos.i >= gr.items.length) { pos.g++; pos.i = 0; pos.grid = null; }
      }
    }

    // ------------------------------------------------------------- AI ----
    var rec = null;
    function setAi(on, o) {
      on = !!on && cfg().ai !== false && !!SYS();
      if (on === st.ai) return;
      st.ai = on; panel.dataset.ai = String(on); aiBtn.classList.toggle('on', on); aiBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
      aiBtn.setAttribute('aria-label', on ? t('s.ai_off') : t('s.ai')); aiBtn.title = on ? t('s.ai_off') : t('s.ai');
      if (micBtn) micBtn.hidden = !(cfg().ai !== false && !!SYS());
      catBtn.firstChild.innerHTML = UI.icon(on ? 'spark' : 'grid', 24);      // like FSC: the category button turns into the AI mark while you talk to the assistant
      if (!on && rec) { try { rec.stop(); } catch (e) { /* already stopped */ } }
      st.t0 = Date.now(); tick();
      if (!st.open) open({ focus: false });
      clearAll(); if (!(o && o.voice)) input.focus({ preventScroll: true });      // talking: no keyboard
      run();
    }
    function canVoice() { return !!SpeechRec && cfg().ai !== false && !!SYS(); }
    /** The microphone: opens the assistant if it is not open and listens; a second tap stops and sends. Must run inside the tap (the browser asks for it). */
    function startVoice() {
      if (!canVoice()) return;
      if (!st.ai) setAi(true, { voice: true });
      if (!st.open) open({ focus: false });
      toggleMic();
    }
    function askFromSearch(q) { setAi(true); send(q); }
    function drawChat() {
      registry.clear(); st.secs = []; results.innerHTML = ''; results.scrollTop = 0;
      var hist = SYS() ? SYS().history(ctx) : [];
      var view = SYS().view(ctx, {
        busy: st.aiBusy, onRate: drawChat, suggest: function (x) { send(x); }, examples: [t('s.ai_ex1'), t('s.ai_ex2'), t('s.ai_ex3')],
        targets: function (ids) {         // the devices the assistant acted on, as the usual tiles
          var grid = h('div.device-grid-container.aic-targets');
          ids.slice(0, 6).forEach(function (id) { var it = engine.getItem(id); if (it) grid.appendChild(UI.guard(function () { return tl.makeTile(it); }, { label: 'tile ' + id, text: it.name, compact: true, retry: t('card.retry') })); });
          return grid.children.length ? grid : null;
        },
      });
      results.appendChild(view);
      if (hist.length) results.appendChild(h('button.ai-new', { onclick: function () { SYS().clear(ctx); drawChat(); } }, t('s.ai_clear')));
      applyColumns();
    }
    function send(text) {
      text = String(text || '').trim();
      if (!text || st.aiBusy || !SYS()) return;
      input.value = ''; st.query = ''; updateGhost(); st.aiBusy = true;
      if (ctx.haptic) ctx.haptic(8);
      var pending = SYS().ask(ctx, text), spoken = st.voiceTurn; st.voiceTurn = false;
      drawChat();                      // shows the question at once; the answer follows
      pending.then(function (reply) { st.aiBusy = false; if (st.ai) drawChat(); if (spoken) speakReply(reply); }, function () { st.aiBusy = false; if (st.ai) drawChat(); });
    }
    /** A question that was spoken is answered aloud too (Settings > Assistant > Speak the answer). */
    function speakReply(reply) {
      try {
        var a = ctx.settings.get().assistant || {}, F = g.OkieMotor.feedback;
        if (a.voiceReply === false || !reply || !g.speechSynthesis || !g.SpeechSynthesisUtterance || !F) return;
        var txt = F.speakable(reply.text); if (!txt) return;
        var u = new g.SpeechSynthesisUtterance(txt); u.lang = ctx.lang() === 'de' ? 'de-DE' : 'en-US';
        g.speechSynthesis.cancel(); g.speechSynthesis.speak(u);
      } catch (e) { /* no speech output here */ }
    }
    /**
     * Listens through the browser's (or the app's) speech recognition and stops by itself when the speaking stops: a second and a half of quiet after words is the end of the question, and a long
     * silence at the start gives up. hh: { state(on), words(text), done(text) } - the words are live while it listens, done comes once with what was said (nothing when nobody spoke).
     */
    var END_QUIET = 1500, NOBODY = 7000;
    function listenWith(hh) {
      if (!SpeechRec) return false;
      if (rec) { try { rec.stop(); } catch (e) { /* already stopped */ } return true; }      // a second tap stops and sends
      var r = rec = new SpeechRec(), last = '', quietT = 0;
      r.lang = ctx.lang() === 'de' ? 'de-DE' : 'en-US'; r.interimResults = true; r.maxAlternatives = 1;
      function quiet(ms) { clearTimeout(quietT); quietT = setTimeout(function () { try { r.stop(); } catch (e) { /* ended */ } }, ms); }
      hh.state(true); if (ctx.haptic) ctx.haptic('switch');
      r.onstart = function () { quiet(NOBODY); };
      r.onresult = function (e) {
        var txt = '', fin = false;
        for (var i = 0; i < e.results.length; i++) { txt += e.results[i][0].transcript; if (e.results[i].isFinal) fin = true; }
        if (txt === last) return;      // nothing new was said: the quiet keeps counting
        last = txt; hh.words(txt); quiet(fin ? 250 : END_QUIET);
      };
      r.onerror = function () { /* denied or no speech: the field stays as it is */ };
      r.onend = function () { clearTimeout(quietT); if (rec === r) rec = null; hh.state(false); if (last.trim()) hh.done(last.trim()); };
      try { r.start(); quiet(NOBODY + 3000); } catch (e) { clearTimeout(quietT); rec = null; hh.state(false); }
      return true;
    }
    function toggleMic() {
      listenWith({
        state: function (on) { micBtn.classList.toggle('on', on); },
        words: function (txt) { input.value = txt; st.query = txt; updateGhost(); },
        done: function () { if (st.ai && input.value.trim()) { st.voiceTurn = true; send(input.value); } },
      });
    }
    /**
     * The microphone of the lock page: listens in place (no screen opens), then asks the assistant and says the answer. cb: { state(on), words(text), reply(text) }
     * Returns false when there is no speech recognition or no assistant (the lock page then opens the start screen as before).
     */
    function listenHere(cb) {
      if (!canVoice()) return false;
      return listenWith({
        state: cb.state, words: cb.words,
        done: function (txt) {
          cb.words(txt);
          SYS().ask(ctx, txt).then(function (reply) { cb.reply(reply && reply.text ? reply.text : ''); speakReply(reply); }, function () { cb.reply('', true); });
        },
      });
    }

    // ----------------------------------------------------------- open ----
    function open(o) {
      if (st.open) { if (!o || o.focus !== false) input.focus({ preventScroll: true }); return; }
      st.open = true; panel.dataset.open = 'true'; root.classList.add('open');
      if (!ranOnce) run(); else { renderSubChips(); update(true); }
      if (!o || o.focus !== false) input.focus({ preventScroll: true });
      if (ctx.bus) ctx.bus.emit('search', { open: true });
    }
    function close() {
      if (!st.open) return;
      st.open = false; panel.dataset.open = 'false'; root.classList.remove('open');
      input.blur(); results.scrollTop = 0;
      if (ctx.bus) ctx.bus.emit('search', { open: false });
    }
    function onOutside(e) {
      if (!st.open) return;
      var path = e.composedPath ? e.composedPath() : [];
      if (path.indexOf(panel) >= 0) return;
      for (var i = 0; i < path.length; i++) { var c = path[i].classList; if (c && (c.contains('ov-layer') || c.contains('ov-sheet') || c.contains('morph-popup-dialog') || c.contains('vision-pro-menu'))) return; }
      close();
    }
    ctx.stage.addEventListener('pointerdown', onOutside, true);

    // --------------------------------------------------------- updates ----
    var lastSub = 0;
    function update(force) {
      if (!st.open && !force) return;
      var hs = ctx.hass();
      if (!hs) return;
      registry.forEach(function (el, id) { var s = hs.states[id]; if (s && s !== el._lastState) tl.paint(el, el._item, s); });
      st.secs.forEach(function (sec) {
        if (!sec._sens) return;
        var fresh = areaSensorsEl(sec._area);
        if (fresh.textContent !== sec._sens.textContent) { sec._sens.replaceWith(fresh); sec._sens = fresh; }
      });
      if (subRow.isConnected && (force || Date.now() - lastSub > 1500)) { lastSub = Date.now(); renderSubChips(); }
    }

    function mount() {
      applyUiSettings(); renderChips(); updateGhost(); startTypist(); applyColumns();
      if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(function () { applyColumns(); }); ro.observe(panel); }
    }
    function dispose() {
      clearTimeout(searchTimer); clearInterval(typeTimer); if (rec) { try { rec.stop(); } catch (e) { /* closing anyway */ } }
      if (io) io.disconnect(); if (ro) ro.disconnect();
      ctx.stage.removeEventListener('pointerdown', onOutside, true);
    }

    return {
      el: root, panel: panel, mount: mount, voice: startVoice, listenHere: listenHere, canVoice: canVoice, isListening: function () { return !!rec; }, update: update, dispose: dispose, rerun: run,
      refreshLabels: function () { st.t0 = Date.now(); applyUiSettings(); renderSubChips(); run(); },
      applySettings: function () { applyUiSettings(); },
      focus: function () { open(); },
      open: open, close: close, isOpen: function () { return st.open; }, setAi: setAi, isAi: function () { return st.ai; }, ask: askFromSearch,
      setQuery: function (q) { open({ focus: false }); input.value = q; st.query = q; updateGhost(); run(); },
      state: st, registry: registry,
      _acceptGhost: acceptGhost, _input: input,
    };
  }

  var CSS = [
    '.search-row{position:relative;height:94px;flex:none;z-index:3;}.stage[data-mobile="true"][data-search="open"] .search-row{z-index:900;}',
    '.search-panel{position:absolute;left:0;right:0;top:0;height:94px;border-radius:47px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,.25);transition:height .42s cubic-bezier(.32,.72,0,1),border-radius .42s cubic-bezier(.32,.72,0,1);}',
    '.search-panel[data-open="true"]{height:var(--fsc-panel-h,560px);border-radius:35px;}',
    '.search-wrapper{position:relative;height:94px;flex:none;display:flex;align-items:center;gap:12px;padding:16px 76px 16px 20px;box-sizing:border-box;cursor:text;}',
    '.search-wrapper::after{content:"";position:absolute;left:20px;right:20px;bottom:0;height:1px;background:rgba(255,255,255,.1);opacity:0;transition:opacity .3s;}',
    '.search-panel[data-open="true"] .search-wrapper::after{opacity:1;}',
    '.category-icon{width:24px;height:24px;flex:none;display:grid;place-items:center;color:rgba(255,255,255,.9);cursor:pointer;transition:transform .2s cubic-bezier(.34,1.18,.24,1),color .2s;}',
    '.category-icon:hover{transform:scale(1.12);color:#fff;}',
    '.chipbox{display:flex;gap:6px;flex:none;}.chipbox:empty{display:none;}',
    '.chip{display:inline-flex;align-items:center;gap:6px;padding:5px 12px;border-radius:9999px;font-size:15px;font-weight:500;background:rgba(66,165,245,.18);color:#bfe0ff;border:1px solid rgba(66,165,245,.4);transition:background .15s,box-shadow .15s;}',
    '.chip.domain{background:rgba(192,132,252,.18);color:#e6d3ff;border-color:rgba(192,132,252,.4);}',
    '.chip.sensor{background:rgba(52,211,153,.18);color:#c3f5df;border-color:rgba(52,211,153,.4);}',
    '.chip.sel{background:rgba(255,255,255,.9);color:#1d1b19;box-shadow:0 0 0 3px rgba(255,255,255,.35);}',
    '.search-input-container{position:relative;flex:1;min-width:0;height:34px;display:flex;align-items:center;}',
    '.search-input,.ghost-mirror,.fsc-tippzeile{font-size:24px;line-height:30px;font-weight:400;letter-spacing:0;}',
    '.search-input{position:relative;z-index:1;width:100%;min-width:0;background:transparent;border:0;outline:0;padding:0;color:rgba(255,255,255,.95);caret-color:#fff;font-family:inherit;}',
    '.search-input::placeholder{color:transparent;}',
    '.search-input-container[data-has="false"] .search-input{caret-color:transparent;}',
    '.ghost-mirror{position:absolute;left:0;top:0;bottom:0;display:flex;align-items:center;white-space:pre;pointer-events:none;overflow:hidden;max-width:100%;}',
    '.ghost-mirror .typed{color:transparent;}.ghost-mirror .rest{color:rgba(255,255,255,.3);}',
    '.fsc-tippzeile{position:absolute;left:0;top:0;bottom:0;max-width:100%;display:flex;align-items:center;white-space:nowrap;overflow:hidden;color:rgba(255,255,255,.92);pointer-events:none;}',
    '.search-input-container[data-has="true"] .fsc-tippzeile{display:none;}',
    '.fsc-caret{display:inline-block;width:2px;height:1.1em;margin-left:2px;border-radius:1px;background:#fff;box-shadow:0 0 8px rgba(255,255,255,.55);animation:fsc-caret-takt 1.1s steps(1) infinite;}',
    '@keyframes fsc-caret-takt{0%,55%{opacity:1;}56%,100%{opacity:0;}}',
    '.search-input-container[data-has="true"] .accept{display:grid;}',
    '.accept{position:absolute;right:0;z-index:2;width:34px;height:34px;border-radius:50%;background:#fff;color:#1d1b19;display:grid;place-items:center;}.accept[hidden]{display:none;}',
    '.such-aktion{position:absolute;right:20px;top:50%;transform:translateY(-50%);display:flex;align-items:center;gap:2px;}',
    '.search-panel[data-aiok="true"] .search-wrapper{padding-right:172px;}',
    '.ai-button,.ai-mic{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:rgba(255,255,255,.9);transition:background .2s,color .2s,transform .2s cubic-bezier(.34,1.18,.24,1);}.ai-button[hidden],.ai-mic[hidden]{display:none;}',
    '.ai-button:hover,.ai-mic:hover{background:rgba(255,255,255,.14);transform:scale(1.06);}.ai-button:active,.ai-mic:active{transform:scale(.94);}.ai-button.on,.ai-mic.on{background:#fff;color:#1d1b19;}',
    '.ai-mic.on{background:#ff3b30;color:#fff;animation:ai-rec 1.2s ease-out infinite;}@keyframes ai-rec{0%{box-shadow:0 0 0 0 rgba(255,59,48,.6);}70%{box-shadow:0 0 0 14px rgba(255,59,48,0);}100%{box-shadow:0 0 0 0 rgba(255,59,48,0);}}',
    '@keyframes ai-in{from{opacity:0;transform:translateY(8px) scale(.97);}to{opacity:1;transform:none;}}',
    '.ai-new{display:block;margin:0 auto 18px;padding:8px 16px;border-radius:9999px;background:rgba(255,255,255,.1);font-size:13px;}.ai-new:hover{background:rgba(255,255,255,.18);}',
    '.ai-ask{display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;margin-bottom:12px;border-radius:20px;text-align:left;background:linear-gradient(135deg,rgba(124,92,255,.35),rgba(10,132,255,.28));border:1px solid rgba(255,255,255,.16);transition:transform .08s cubic-bezier(.16,1,.3,1),background .2s;}',
    '.ai-ask:hover{background:linear-gradient(135deg,rgba(124,92,255,.5),rgba(10,132,255,.4));}.ai-ask:active{transform:scale(.985);}',
    '.ai-ask-ic{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.18);flex:none;}.ai-ask-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px;}.ai-ask-t b{font-size:15px;font-weight:600;}.ai-ask-t i{font-style:normal;font-size:13px;color:rgba(255,255,255,.75);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.filter-main-button{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;color:rgba(255,255,255,.9);background:transparent;transition:background .2s,transform .2s cubic-bezier(.34,1.18,.24,1);}',
    '.filter-main-button:hover{background:rgba(255,255,255,.14);transform:scale(1.06);}.filter-main-button:active{transform:scale(.94);}',
    // results
    '.stage[data-cardblur="on"] .results-container{-webkit-mask-image:none;mask-image:none;}.results-container{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:10px 20px 40px;box-sizing:border-box;scrollbar-width:none;opacity:0;transform:translateY(8px);pointer-events:none;transition:opacity .25s,transform .25s;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 28px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 28px),transparent);}',
    '.results-container::-webkit-scrollbar{display:none;}',
    '.search-panel[data-open="true"] .results-container{opacity:1;transform:none;pointer-events:auto;transition-delay:.12s;}',
    '.subcategory-row{display:flex;gap:10px;overflow-x:auto;scrollbar-width:none;padding:4px 0 14px;}.subcategory-row::-webkit-scrollbar{display:none;}.subcategory-row[hidden]{display:none;}',
    '.subcategory-chip{flex:none;height:42px;padding:8px 16px;box-sizing:border-box;border-radius:20px;font-size:17px;display:inline-flex;align-items:center;gap:8px;white-space:nowrap;color:rgba(255,255,255,.9);background:rgba(255,255,255,.08);transition:background .2s,transform .08s cubic-bezier(.16,1,.3,1);}',
    '.subcategory-chip:hover{background:rgba(255,255,255,.16);}.subcategory-chip:active{transform:scale(.96);}.subcategory-chip.on{background:rgba(255,255,255,.25);color:#fff;}',
    '.search-panel.no-count .subcategory-chip .cnt{display:none;}.subcategory-chip .cnt{border-radius:10px;font-size:14px;font-weight:500;line-height:20px;padding:0 7px;background:rgba(255,255,255,.1);}',
    '.group{margin-top:8px;}',
    '.group-title{display:flex;align-items:center;gap:10px;padding:10px 0;margin-bottom:14px;border-bottom:1px solid rgba(255,255,255,.12);font-size:18px;font-weight:500;color:rgba(255,255,255,.95);}',
    '.gcount{border-radius:9px;font-size:13px;font-weight:600;line-height:20px;padding:0 8px;background:rgba(255,255,255,.16);}',
    '.secsens{margin-left:auto;display:flex;gap:14px;color:rgba(255,255,255,.7);font-size:13px;font-weight:400;}.rs{display:inline-flex;align-items:center;gap:4px;}',
    '.note{padding:8px 12px;border-radius:12px;background:rgba(255,159,10,.16);color:#ffd990;font-size:13px;margin-bottom:10px;}',
    '.empty{padding:60px 20px;text-align:center;}.empty-t{font-size:20px;font-weight:600;}.empty-s{margin-top:6px;color:rgba(255,255,255,.7);font-size:14px;}',
    '.sentinel{height:1px;}',
    // popups
    '.filter-modal-gruppe{margin-top:20px;}.filter-modal-gruppe:first-child{margin-top:0;}@media(max-width:768px){.filter-modal-gruppe{margin-top:16px;}}',
    '.filter-modal-kopfzeile{align-items:center;display:flex;gap:6px;margin:0 4px 12px;}',
    '.filter-modal-label{font-size:11px;font-weight:600;letter-spacing:.07em;opacity:.42;text-transform:uppercase;}',
    '.filter-modal-infoknopf{background:none;background-clip:padding-box!important;border:4px solid transparent;box-sizing:content-box;color:inherit;cursor:pointer;display:grid;height:16px;margin:-4px;opacity:.4;padding:0;place-items:center;transition:opacity .16s ease;width:16px;}',
    '.filter-modal-infoknopf:hover{opacity:.85;}.filter-modal-infoknopf.active{opacity:1;}.filter-modal-infoknopf svg{fill:none;height:14px;stroke:currentColor;width:14px;}',
    '.filter-modal-infotext{background:#ffffff14;border-radius:14px;color:#ffffffb8;font-size:12px;line-height:1.5;margin:-4px 4px 12px;padding:11px 13px;}',
    '.filter-modal-zeile{display:flex;gap:4px;justify-content:flex-start;margin-left:-6px;}',
    '.filter-modal-wahl{font-family:revert;align-items:center;background:none;border:none;box-sizing:border-box;color:#ffffffb8;cursor:pointer;display:flex;flex:0 0 76px;flex-direction:column;font-size:12.5px;font-weight:500;gap:10px;letter-spacing:-.01em;padding:8px 2px;text-align:center;transition:color .2s ease;}',
    '.filter-modal-symbol{background:#ffffff21;border-radius:999px;box-shadow:inset 0 1px #fff3;display:grid;height:56px;place-items:center;transition:background .22s ease,color .22s ease,box-shadow .22s ease,transform .22s cubic-bezier(.34,1.3,.4,1);width:56px;}',
    '.filter-modal-symbol svg{fill:none;height:19px;stroke:currentColor;stroke-width:1.7;width:19px;}',
    '.filter-modal-wahl:hover .filter-modal-symbol{transform:scale(1.06);}.filter-modal-wahl.active{color:#fff;font-weight:600;}',
    '.filter-modal-wahl.active .filter-modal-symbol{background:#fffffff2;box-shadow:inset 0 1px #fff,0 2px 5px #0000001f,0 10px 24px #0000003d;color:#1d1d1f;}',
    // phones
    '.stage[data-mobile="true"] .search-row,.stage[data-mobile="true"] .search-wrapper{height:74px;}',
    '.stage[data-mobile="true"] .search-panel{height:74px;border-radius:37px;}.stage[data-mobile="true"] .search-panel[data-open="true"]{height:auto;border-radius:35px;}',
    '.stage[data-mobile="true"] .search-wrapper{padding:13px 61px 13px 16px;gap:10px;}.stage[data-mobile="true"] .search-panel[data-aiok="true"] .search-wrapper{padding-right:164px;}.stage[data-mobile="true"] .ai-button,.stage[data-mobile="true"] .ai-mic,.stage[data-mobile="true"] .filter-main-button{width:35px;height:35px;}.stage[data-mobile="true"] .category-icon{width:19px;height:19px;}.stage[data-mobile="true"] .category-icon svg,.stage[data-mobile="true"] .filter-main-button svg,.stage[data-mobile="true"] .ai-button svg{width:19px;height:19px;}.stage[data-mobile="true"] .such-aktion{right:16px;gap:0;}',
    '.stage[data-mobile="true"] .search-input,.stage[data-mobile="true"] .ghost-mirror,.stage[data-mobile="true"] .fsc-tippzeile{font-size:19px;line-height:24px;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
  g.OkieMotor.searchui = { create: create, CSS: CSS };
})(typeof globalThis !== 'undefined' ? globalThis : window);

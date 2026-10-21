/* okie-apps: the Calendar and To-do system apps.
 *
 * Calendar: Day / Week / Month / Year over Home Assistant's own calendar
 * entities (nothing leaves your install). Week as day columns that step down
 * from seven to five to three on narrow screens. Events: create, edit, delete
 * (six-second undo), five recurrence presets, quick title chips.
 * To-do: every todo.* list; overdue in red and stacked; search before adding;
 * dictation; undo on delete.
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, L = g.OkieMotor.logic, F = g.OkieMotor.feeds, CT = g.OkieMotor.controls, core = g.OkieMotor.core;
  var h = UI.h;

  core.registerStrings('en', {
    'app.calendar': 'Calendar', 'app.todos': 'Tasks', 'c.search': 'Search', 'c.search_ph': 'Search events', 'c.nofound': 'No events found', 'c.day': 'Day', 'c.week': 'Week', 'c.month': 'Month', 'c.year': 'Year', 'c.today': 'Today', 'c.new': 'New event', 'c.edit': 'Edit event', 'c.none': 'No events', 'c.allday': 'All day',
    'c.title': 'Title', 'c.calendar': 'Calendar', 'c.start': 'Starts', 'c.end': 'Ends', 'c.repeat': 'Repeat', 'c.location': 'Location', 'c.desc': 'Description', 'c.save': 'Save', 'c.delete': 'Delete', 'c.deleted': 'Event deleted', 'c.saved': 'Event saved',
    'c.quick': 'Quick titles', 'c.no_cal': 'No calendar can be written to. Add a local calendar in Home Assistant.', 'c.rec.none': 'Never', 'c.rec.daily': 'Daily', 'c.rec.weekly': 'Weekly', 'c.rec.monthly': 'Monthly', 'c.rec.yearly': 'Yearly',
    'c.sheet': 'Events: drag up for more, down for less', 'c.calendars': 'Calendars', 'c.robot_note': 'The robot’s own cleaning times. They are listed under Schedules.', 'c.color': 'Colour', 'c.event_1': '1 event', 'c.events_n': '{n} events', 'c.cal_none': 'No calendars yet.', 'c.shown': 'Shown', 'c.hidden_n': '{n} hidden',
    'c.sync_title': 'Add your iPhone calendar', 'c.sync_body': 'Share a calendar from your iPhone as a link and Home Assistant reads it. No Apple ID or password needed, and nothing changes on your iPhone. It updates every time you open this Calendar.',
    'c.sync_s1': 'iPhone: Calendar app, Calendars, tap the (i) next to the calendar, turn on Public Calendar, tap Share Link, then Copy.', 'c.sync_s2': 'Tap the button below, give it a name, paste the link into Calendar URL and submit. Do the same for each calendar you want.', 'c.sync_s3': 'It shows up in the list above and you pick its colour. Anyone with the link can read that calendar, so keep it to yourself; you can switch Public Calendar off again any time.', 'c.sync_btn': 'Set up in Home Assistant', 'c.until': 'until',
    'c.q1': 'Meeting', 'c.q2': 'Birthday', 'c.q3': 'Doctor', 'c.q4': 'Dinner', 'c.q5': 'Reminder', 'c.confirm_delete': 'Delete this event?', 'c.recurring_note': 'Repeating event: the change applies to the whole series.',
    't.add': 'Add a task', 't.all': 'All lists', 't.open': '{n} open', 't.overdue': '{n} overdue', 't.none': 'Nothing to do. Enjoy the quiet.', 't.deleted': 'Task deleted', 't.due_none': 'No date', 't.due_today': 'Today', 't.due_tomorrow': 'Tomorrow', 't.due_week': 'Next week',
    't.similar': 'Already on your lists', 't.list': 'List', 't.dictate': 'Dictate', 't.listening': 'Listening…', 't.done': 'Done', 't.pick_date': 'Pick a date',
  });
  core.registerStrings('de', {
    'app.calendar': 'Kalender', 'app.todos': 'Aufgaben', 'c.search': 'Suchen', 'c.search_ph': 'Termine suchen', 'c.nofound': 'Keine Termine gefunden', 'c.day': 'Tag', 'c.week': 'Woche', 'c.month': 'Monat', 'c.year': 'Jahr', 'c.today': 'Heute', 'c.new': 'Neuer Termin', 'c.edit': 'Termin bearbeiten', 'c.none': 'Keine Termine', 'c.allday': 'Ganztägig',
    'c.title': 'Titel', 'c.calendar': 'Kalender', 'c.start': 'Beginn', 'c.end': 'Ende', 'c.repeat': 'Wiederholen', 'c.location': 'Ort', 'c.desc': 'Beschreibung', 'c.save': 'Speichern', 'c.delete': 'Löschen', 'c.deleted': 'Termin gelöscht', 'c.saved': 'Termin gespeichert',
    'c.quick': 'Schnelltitel', 'c.no_cal': 'In keinen Kalender kann geschrieben werden. Lege in Home Assistant einen lokalen Kalender an.', 'c.rec.none': 'Nie', 'c.rec.daily': 'Täglich', 'c.rec.weekly': 'Wöchentlich', 'c.rec.monthly': 'Monatlich', 'c.rec.yearly': 'Jährlich',
    'c.sheet': 'Termine: nach oben ziehen für mehr, nach unten für weniger', 'c.calendars': 'Kalender', 'c.robot_note': 'Die Reinigungszeiten des Roboters. Sie stehen unter Zeitpläne.', 'c.color': 'Farbe', 'c.event_1': '1 Termin', 'c.events_n': '{n} Termine', 'c.cal_none': 'Noch keine Kalender.', 'c.shown': 'Sichtbar', 'c.hidden_n': '{n} ausgeblendet',
    'c.sync_title': 'iPhone-Kalender hinzufügen', 'c.sync_body': 'Gib einen Kalender vom iPhone als Link frei und Home Assistant liest ihn. Keine Apple-ID und kein Passwort nötig, auf dem iPhone ändert sich nichts. Er wird bei jedem Öffnen dieses Kalenders aktualisiert.',
    'c.sync_s1': 'iPhone: Kalender-App, Kalender, auf das (i) neben dem Kalender tippen, Öffentlicher Kalender einschalten, Link teilen, Kopieren.', 'c.sync_s2': 'Auf den Knopf unten tippen, einen Namen geben, den Link bei Kalender-URL einfügen und bestätigen. Für jeden gewünschten Kalender wiederholen.', 'c.sync_s3': 'Er erscheint in der Liste oben und du wählst seine Farbe. Wer den Link hat, kann den Kalender lesen, also behalte ihn für dich; Öffentlicher Kalender lässt sich jederzeit wieder ausschalten.', 'c.sync_btn': 'In Home Assistant einrichten', 'c.until': 'bis',
    'c.q1': 'Besprechung', 'c.q2': 'Geburtstag', 'c.q3': 'Arzt', 'c.q4': 'Abendessen', 'c.q5': 'Erinnerung', 'c.confirm_delete': 'Diesen Termin löschen?', 'c.recurring_note': 'Wiederkehrender Termin: Die Änderung gilt für die ganze Serie.',
    't.add': 'Aufgabe hinzufügen', 't.all': 'Alle Listen', 't.open': '{n} offen', 't.overdue': '{n} überfällig', 't.none': 'Nichts zu tun. Genieße die Ruhe.', 't.deleted': 'Aufgabe gelöscht', 't.due_none': 'Kein Datum', 't.due_today': 'Heute', 't.due_tomorrow': 'Morgen', 't.due_week': 'Nächste Woche',
    't.similar': 'Steht schon auf deinen Listen', 't.list': 'Liste', 't.dictate': 'Diktieren', 't.listening': 'Hört zu…', 't.done': 'Fertig', 't.pick_date': 'Datum wählen',
  });

  var COLORS = ['#4f8cff', '#2fa35c', '#f5a30b', '#e0492f', '#8e5be8', '#1fa5a5', '#e05fa8'];
  function colorFor(id, map) { if (!map[id]) map[id] = COLORS[Object.keys(map).length % COLORS.length]; return map[id]; }
  var pad = function (n) { return (n < 10 ? '0' : '') + n; };
  var ymd = function (ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  var hm = function (ms) { var d = new Date(ms); return pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  var parseLocal = function (date, time) { var p = date.split('-'), t = (time || '00:00').split(':'); return new Date(+p[0], +p[1] - 1, +p[2], +t[0], +t[1]).getTime(); };

  // =========================================================== calendar ====
  function renderCalendar(container, ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var lang = function () { return ctx.lang(); };
    var tt = function (ms, hourOnly) { return F.timeText(ms, lang(), ctx.settings.get().timeFormat, hourOnly); };
    var view = 'week', pickMs = null, anchor = Date.now(), sel = F.startOfDay(Date.now()), events = [], vis = [], token = 0, disposed = false, swipedAt = 0;
    var hidden = F.hiddenCalendars(ctx), saved = F.savedCalendarColors(ctx), colors = {};
    var shell = null, body = null, ro = null;

    function paintColors() {
      var ids = F.calendarEntities(ctx); colors = F.calendarColors(ids, saved);
      if (ids.some(function (id) { return saved[id] !== colors[id]; })) { saved = Object.assign({}, saved, colors); F.setCalendarColors(ctx, saved); }
    }
    function weekSel(a) { var n = Date.now(), w = F.weekStart(a); return n >= w && n < w + 7 * F.DAY ? F.startOfDay(n) : w; }      // today when it is in the shown week, else the first day of it
    function monthSel(a) { var n = new Date(), d = new Date(a); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() ? F.startOfDay(n.getTime()) : new Date(d.getFullYear(), d.getMonth(), 1).getTime(); }

    var strip = h('div.cal-strip', { role: 'tablist' }), nav = h('div.cal-nav', null, strip), sheetFull = false, sheetScroll = 0, lastHostH = 0;
    shell = g.OkieMotor.appshell.create(container, ctx, {
      id: 'calendar', title: t('app.calendar'), subtitle: '', icon: 'calendar', gradient: ['#1d2b4d', '#3d62b3'], header: nav, slim: true, tabsBottom: true,
      tabs: ['day', 'week', 'month', 'year'].map(function (v) { return { id: v, label: t('c.' + v) }; }), startTab: view,
      actions: [{ icon: 'plus', label: t('c.new'), onClick: function () { openForm(null); } }, { icon: 'search', label: t('c.search'), onClick: function () { openSearch(); } }, { icon: 'calendar', label: t('c.today'), onClick: function () { anchor = Date.now(); sel = F.startOfDay(anchor); pickMs = null; ctx.haptic && ctx.haptic(8); load(); } }, { icon: 'list', label: t('c.calendars'), onClick: function (ev) { openCalendars(ev && ev.currentTarget); } }],
      onTab: function (id) {
        if (id) {
          var prev = view; view = id; ctx.store.set('cal.view', id);
          if (shell) { if (id === 'day' && prev === 'month') anchor = sel; else if (id === 'month') sel = prev === 'day' ? F.startOfDay(anchor) : monthSel(anchor); else if (id === 'week') sel = weekSel(anchor); }
        }
        if (shell) load();
      },
    });
    body = shell.body;
    shell.bar.addEventListener('click', function (e) { var b = e.target.closest && e.target.closest('.dt-tab'); if (b && b.dataset.tab === view) { anchor = Date.now(); sel = F.startOfDay(anchor); pickMs = null; } }, true);      // the tab you are on, tapped again: back to today

    // swipe sideways: on the list (or grid) to the next / previous view (Day, Week, Month, Year), on the strip of dates to the next / previous days, weeks, months or years
    function onSwipe(el, fn, skip) {
      var sx = 0, sy = 0, down = false;
      el.addEventListener('touchstart', function (e) { if (e.touches.length !== 1 || (skip && e.target.closest && e.target.closest(skip))) { down = false; return; } var p = e.touches[0]; sx = p.clientX; sy = p.clientY; down = true; }, { passive: true });
      el.addEventListener('touchend', function (e) {
        if (!down) return; down = false; var p = e.changedTouches[0], dx = p.clientX - sx, dy = p.clientY - sy;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) { swipedAt = Date.now(); ctx.haptic(8); fn(dx < 0 ? 1 : -1); }
      }, { passive: true });
      el.addEventListener('touchcancel', function () { down = false; }, { passive: true });
    }
    var VIEWS = ['day', 'week', 'month', 'year'];
    onSwipe(shell.host, function (d) { var i = VIEWS.indexOf(view) + d; if (i >= 0 && i < VIEWS.length) shell.showTab(VIEWS[i]); }, '.cal-grab,.cal-strip');      // the strip of dates scrolls with the finger (below), it does not switch the view

    function step(d) { anchor = F.stepAnchor(view, anchor, d); if (view === 'month') sel = monthSel(anchor); else if (view === 'week') sel = weekSel(anchor); load(); }
    var stripView = '', stripMs = {}, stripAuto = 0, stripPick = 0, stripT = 0, stripDragAt = 0;
    function chooseMs(ms) { anchor = ms; if (view === 'month') sel = monthSel(ms); else if (view === 'week') sel = weekSel(ms); else if (view === 'day') sel = ms; }
    function highlight(act) {      // the shown period bold, the others dim; the month and the day also say their year / month beside it
      Object.keys(stripMs).forEach(function (k) {
        var b = stripMs[k], on = +k === act.ms; b.classList.toggle('on', on); b.setAttribute('aria-selected', on ? 'true' : 'false');
        var sp = b.querySelector('span'); if (sp) sp.remove();
        if (on && act.sub && (view === 'month' || view === 'day')) b.appendChild(h('span', null, act.sub));
      });
    }
    function glideTo(b) {      // the strip settles with the shown period at its left edge; the scroll events this causes are not the finger's
      stripAuto = Date.now() + 700;
      try { strip.scrollTo({ left: Math.max(0, b.offsetLeft - 2), behavior: 'smooth' }); } catch (e) { strip.scrollLeft = Math.max(0, b.offsetLeft - 2); }
    }
    function drawStrip() {      // the days, weeks, months or years as words in a long strip you scroll with a finger: the shown one bold, the others dim; tap one to go there
      var items = F.periodStrip(view, anchor, Date.now(), lang(), true), act = items.filter(function (it) { return it.active; })[0];
      var have = stripView === view && act && stripMs[act.ms];
      if (have) { highlight(act); if (Date.now() - stripDragAt > 400) glideTo(have); return; }      // already in the strip: the highlight moves (and it glides there unless the finger is still on it); rebuilding it made it jump
      strip.innerHTML = ''; stripMs = {}; stripView = view;
      items.forEach(function (it) { strip.appendChild(stripBtn(it)); });
      var on = strip.querySelector('.on'); if (on) { stripAuto = Date.now() + 400; strip.scrollLeft = Math.max(0, on.offsetLeft - 2); }
    }
    function stripBtn(it) {
      var b = h('button.cs' + (it.active ? '.on' : '') + (it.today ? '.today' : ''), { type: 'button', role: 'tab', 'aria-selected': it.active ? 'true' : 'false', 'aria-label': it.label + (it.sub ? ' ' + it.sub : ''), onclick: function () {
        if (Date.now() - stripDragAt < 250) return;      // the finger that scrolled the strip does not also pick what it lifted on
        chooseMs(it.ms); load();
      } }, it.label, it.active && it.sub && (view === 'month' || view === 'day') ? h('span', null, it.sub) : null);
      b._it = it; stripMs[it.ms] = b; return b;
    }
    /** The strip has no end: near either end it grows by another stretch of days, weeks, months or years (the far years too). */
    var stripGrowing = false, HI = { day: 120, week: 78, month: 60, year: 20 }, LO = { day: 30, week: 26, month: 24, year: 10 };      // how far periodStrip reaches after / before the period it is built around
    function growStrip(dir) {
      if (stripGrowing) return; stripGrowing = true;
      try {
        var kids = strip.children; if (!kids.length) return;
        var edge = dir < 0 ? kids[0]._it.ms : kids[kids.length - 1]._it.ms;
        var from = F.stepAnchor(view, edge, dir < 0 ? -(HI[view] || 60) : (LO[view] || 24));      // built so that its reach ends at (before) or starts at (after) the edge
        var more = F.periodStrip(view, from, Date.now(), lang(), true).filter(function (it) { it.active = false; return dir < 0 ? it.ms < edge : it.ms > edge; });
        if (!more.length) return;
        stripAuto = Date.now() + 200;
        if (dir < 0) { var w0 = strip.scrollWidth, first = kids[0]; more.forEach(function (it) { strip.insertBefore(stripBtn(it), first); }); strip.scrollLeft += strip.scrollWidth - w0; }
        else more.forEach(function (it) { strip.appendChild(stripBtn(it)); });
      } finally { stripGrowing = false; }
    }
    // Scrolling the strip picks the dates as it goes: the period at the left edge is the shown one, it ticks (haptic) each time another one passes, and the calendar below follows when the finger rests.
    strip.addEventListener('scroll', function () {
      strip.style.setProperty('--ml', strip.scrollLeft > 4 ? '26px' : '0px');
      if (Date.now() < stripAuto) return;      // a glide of ours, not the finger
      stripDragAt = Date.now();
      if (strip.scrollLeft < 700) growStrip(-1); else if (strip.scrollWidth - strip.clientWidth - strip.scrollLeft < 700) growStrip(1);
      if (stripPick) return;
      stripPick = requestAnimationFrame(function () {
        stripPick = 0;
        var x = strip.scrollLeft + 2, best = null, bd = 1e9;
        Object.keys(stripMs).forEach(function (k) { var b = stripMs[k], d = Math.abs(b.offsetLeft - x); if (d < bd) { bd = d; best = b; } });
        if (!best || best.classList.contains('on')) return;
        highlight(best._it); if (ctx.haptic) ctx.haptic('detent');
        clearTimeout(stripT); stripT = setTimeout(function () { if (disposed) return; chooseMs(best._it.ms); load(); }, 170);      // the calendar loads once the scrolling slows down, not for every period it passes
      });
    }, { passive: true });
    function load() {
      var my = ++token, r = F.viewRange(view, anchor);
      if (view === 'month') r = [r[0], r[1] + 14 * F.DAY];      // the agenda reads on past the last cell
      hidden = F.hiddenCalendars(ctx); paintColors(); drawStrip();
      F.fetchEvents(ctx, r[0], r[1], F.calendarEntities(ctx).filter(function (id) { return hidden.indexOf(id) < 0; })).then(function (list) {
        if (my !== token || disposed) return;
        events = list; draw();
      });
      draw();
    }
    function chip(e, compact) {
      return h('button.ev' + (compact ? '.c' : ''), { style: { '--ec': e.color || '#0a84ff' }, onclick: function (ev) { ev.stopPropagation(); openEvent(e, ev.currentTarget); } },
        h('i'), h('span.evx', null, e.allDay || compact ? null : h('small', null, tt(e.start)), h('b', null, e.title)));
    }
    function draw() {
      if (!shell || disposed) return;
      var keep = body.scrollTop, oldSheet = shell.host.querySelector('.cal-sheet');
      if (oldSheet) { sheetScroll = (oldSheet.querySelector('.cal-sheet-list') || {}).scrollTop || 0; oldSheet.remove(); }
      body.style.paddingBottom = '';
      events.forEach(function (e) { e.color = colors[e.calendar] || F.CAL_PALETTE[0]; });
      vis = events.filter(function (e) { return hidden.indexOf(e.calendar) < 0; });
      body.innerHTML = '';
      if (view === 'month') drawMonth(); else if (view === 'week') drawWeek(); else if (view === 'day') drawDay(); else drawYear();
      if (view === 'month' || view === 'week') body.scrollTop = keep;
      shell.refreshScroll();
    }
    function dayName(ms, style) { return new Date(ms).toLocaleDateString(lang(), { weekday: style || 'short' }); }

    // ---- month: a quiet grid with colour dots, and the agenda of the chosen day
    function pick(c) {
      if (Date.now() - swipedAt < 350) return;
      if (!c.inMonth) { anchor = c.ms; sel = c.ms; load(); return; }
      if (sel === c.ms) { anchor = c.ms; view = 'day'; shell.showTab('day'); return; }      // a second tap opens the day
      sel = c.ms; draw();
    }
    function drawMonth() {
      var ref = new Date(anchor), cells = F.monthGrid(ref.getFullYear(), ref.getMonth()), todayStart = F.startOfDay(Date.now()), roomy = body.clientWidth >= 520 && (shell.host.clientHeight || 0) >= 700;      // tall rows only when there is room for them above the sheet
      var grid = h('div.mg' + (roomy ? '.roomy' : ''));
      for (var i = 0; i < 7; i++) grid.appendChild(h('div.mgh', null, dayName(cells[i].ms, roomy ? 'short' : 'narrow')));
      cells.forEach(function (c) {
        var evs = F.eventsOnDay(vis, c.ms), dd = F.dayDots(evs), n = evs.length, dots = h('div.mgdots');
        dd.dots.forEach(function (col) { dots.appendChild(h('i', { style: { '--ec': col } })); });
        var label = new Date(c.ms).toLocaleDateString(lang(), { weekday: 'long', day: 'numeric', month: 'long' }) + (n ? ', ' + t(n === 1 ? 'c.event_1' : 'c.events_n', { n: n }) : '');
        grid.appendChild(h('div.mgc' + (c.inMonth ? '' : '.out') + (c.ms === todayStart ? '.today' : '') + (c.ms === sel ? '.sel' : ''), {
          role: 'button', tabindex: '0', 'aria-label': label, 'aria-pressed': c.ms === sel ? 'true' : 'false', onclick: function () { pick(c); },
          onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(c); } } }, h('div.mgd', null, String(c.day)), dots));
      });
      body.appendChild(grid);
      mountSheet();
    }
    // the sheet under the month: the day you picked and then only the days that have something on; grab the line and pull it up for more, down for less
    function mountSheet() {
      var host = shell.host, hh = host.clientHeight || 520, peek = Math.max(150, Math.round(hh * 0.3)), full = Math.max(peek + 90, hh - 6); lastHostH = hh;      // pulled all the way up it stops just under the month names
      var zoom = function () { return (ctx.host && ctx.host._zoom) || 1; };      // the card is zoomed down on a tablet: a finger moves further on the screen than in the card's own pixels
      var list = h('div.cal-sheet-list'), grab = h('div.cal-grab', { role: 'button', tabindex: '0', 'aria-label': t('c.sheet'), 'aria-expanded': sheetFull ? 'true' : 'false' }, h('i'));
      dayGroups(F.agendaDays(vis, sel, 45, 60)).forEach(function (el) { list.appendChild(el); });
      var sheet = h('div.cal-sheet' + (sheetFull ? '.open' : ''), { style: { height: (sheetFull ? full : peek) + 'px' } }, grab, list);
      host.appendChild(sheet); body.style.paddingBottom = (peek + 14) + 'px'; list.scrollTop = sheetFull ? sheetScroll : 0;
      var drag = null;
      function settle(open) { sheetFull = open; sheet.classList.remove('drag'); sheet.classList.toggle('open', open); sheet.style.height = (open ? full : peek) + 'px'; grab.setAttribute('aria-expanded', open ? 'true' : 'false'); if (!open) list.scrollTop = 0; }
      grab.addEventListener('pointerdown', function (e) { drag = { y: e.clientY, h: sheet.offsetHeight, t: Date.now(), moved: false }; sheet.classList.add('drag'); try { grab.setPointerCapture(e.pointerId); } catch (er) { /* no capture */ } });
      grab.addEventListener('pointermove', function (e) { if (!drag) return; var dy = (e.clientY - drag.y) / zoom(); if (Math.abs(dy) > 4) drag.moved = true; sheet.style.height = Math.max(peek * 0.7, Math.min(full, drag.h - dy)) + 'px'; });
      var end = function (e) {
        if (!drag) return; var d = drag, dy = (e.clientY - d.y) / zoom(), quick = Date.now() - d.t < 280 && Math.abs(dy) > 24; drag = null;
        if (!d.moved) { settle(!sheetFull); return; }                                       // a tap on the line opens or closes it
        settle(quick ? dy < 0 : sheet.offsetHeight > (peek + full) / 2);                  // a flick goes the way it was flicked, a slow drag to the nearer end
      };
      grab.addEventListener('pointerup', end); grab.addEventListener('pointercancel', end);
      grab.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); settle(!sheetFull); } else if (e.key === 'ArrowUp') settle(true); else if (e.key === 'ArrowDown') settle(false); });
    }
    function agRow(e) {
      var el = h('button.ag-ev', { style: { '--ec': e.color || F.CAL_PALETTE[0] }, onclick: function () { openEvent(e, el); } },
        h('i'), h('span.ag-t', null, e.allDay ? t('c.allday') : tt(e.start)),
        h('span.ag-m', null, h('b', null, e.title || '—'), e.location ? h('small', null, e.location) : null));
      return el;
    }
    function dayGroups(days) {      // one block per day: its date at the left, its entries at the right ("No events" for an empty one)
      var loc = lang(), todayStart = F.startOfDay(Date.now());
      return days.map(function (gp) {
        var d = new Date(gp.day), rows = h('div.ag-rows');
        if (!gp.events.length) rows.appendChild(h('div.ag-none', null, t('c.none')));
        gp.events.forEach(function (e) { rows.appendChild(agRow(e)); });
        return h('div.ag-day' + (gp.day === todayStart ? '.today' : gp.day < todayStart ? '.past' : ''), null, h('div.ag-dl', null, h('span', null, d.toLocaleDateString(loc, { weekday: 'short' })), h('b', null, String(d.getDate()))), rows);
      });
    }
    function agenda() {      // the whole week, every day in a row
      var box = h('div.cal-agenda'), w = F.weekStart(anchor), days = [];
      for (var i = 0; i < 7; i++) { var dd = F.addDays(w, i); days.push({ day: dd, events: F.eventsOnDay(vis, dd) }); }
      dayGroups(days).forEach(function (el) { box.appendChild(el); });
      return box;
    }

    function drawWeek() {      // the week is the day list: all seven days of it, today marked, earlier days dimmed
      var box = agenda(); box.classList.add('solo'); body.appendChild(box);
    }
    function drawDay() {
      var d = F.startOfDay(anchor), evs = F.eventsOnDay(vis, d);
      var allday = evs.filter(function (e) { return e.allDay; }), timed = evs.filter(function (e) { return !e.allDay; });
      allday.forEach(function (e) { body.appendChild(chip(e)); });
      if (!evs.length) body.appendChild(h('div.note-l', null, t('c.none')));
      var HOUR = 52, grid = h('div.dg', { style: { height: (24 * HOUR) + 'px' } });
      for (var hr = 0; hr < 24; hr++) grid.appendChild(h('div.dgl', { style: { top: (hr * HOUR) + 'px' } }, h('span', null, tt(new Date(2000, 0, 1, hr).getTime(), true))));
      F.layoutOverlaps(timed.map(function (e) { return Object.assign({}, e, { start: Math.max(e.start, d), end: Math.min(e.end, d + F.DAY) }); })).forEach(function (l) {
        var top = (l.ev.start - d) / 3600000 * HOUR, ht = Math.max(24, (l.ev.end - l.ev.start) / 3600000 * HOUR - 2);
        var src = timed.filter(function (e) { return e.id === l.ev.id; })[0] || l.ev;
        var el = h('button.dge', { style: { top: top + 'px', height: ht + 'px', left: 'calc(48px + (100% - 52px) * ' + (l.col / l.cols) + ')', width: 'calc((100% - 52px) / ' + l.cols + ' - 3px)', '--ec': src.color || F.CAL_PALETTE[0] }, onclick: function (e) { openEvent(src, e.currentTarget); } }, h('b', null, src.title), h('span', null, tt(src.start) + ' – ' + tt(src.end)));
        grid.appendChild(el);
      });
      // the red line: at the time now (today) or where it was put; its pill is dragged (or the hours are tapped) to choose a time, and the plus then starts the new event there
      var isToday = F.startOfDay(Date.now()) === d;
      if (pickMs != null && F.startOfDay(pickMs) !== d) pickMs = null;
      if (isToday || pickMs != null) {
        var line = h('div.dgnow'), pill = h('button.dgpill', { type: 'button', 'aria-label': t('c.start') });
        var place = function () { var at = pickMs != null ? pickMs : Date.now(), top = (at - d) / 3600000 * HOUR; line.style.top = top + 'px'; pill.style.top = top + 'px'; pill.textContent = tt(at); };
        var setAt = function (px) { var mins = Math.round(Math.max(0, Math.min(24 * 60 - 5, px / HOUR * 60)) / 5) * 5, at = d + mins * 60000; if (at !== pickMs) { pickMs = at; if (ctx.haptic) ctx.haptic(5); place(); } };
        place(); grid.appendChild(line); grid.appendChild(pill);
        var drag = null;
        pill.addEventListener('pointerdown', function (e) { drag = { y: e.clientY, top: ((pickMs != null ? pickMs : Date.now()) - d) / 3600000 * HOUR }; pill.classList.add('drag'); try { pill.setPointerCapture(e.pointerId); } catch (er) { /* no capture */ } e.preventDefault(); e.stopPropagation(); });
        pill.addEventListener('pointermove', function (e) { if (drag) setAt(drag.top + (e.clientY - drag.y) / ((ctx.host && ctx.host._zoom) || 1)); });
        var done = function () { drag = null; pill.classList.remove('drag'); };
        pill.addEventListener('pointerup', done); pill.addEventListener('pointercancel', done);
      }
      grid.addEventListener('click', function (e) { if (e.target !== grid) return; var px = e.offsetY; pickMs = d + Math.round(Math.max(0, Math.min(24 * 60 - 5, px / HOUR * 60)) / 5) * 5 * 60000; if (ctx.haptic) ctx.haptic(5); draw(); });
      body.appendChild(grid);
      requestAnimationFrame(function () { body.scrollTop = Math.max(0, (F.startOfDay(Date.now()) === d ? (new Date().getHours() - 1) : 7) * HOUR); });
    }
    function drawYear() {
      var y = new Date(anchor).getFullYear(), wrap = h('div.yr'), has = {};
      vis.forEach(function (e) { for (var t0 = F.startOfDay(e.start); t0 < e.end; t0 = F.addDays(t0, 1)) has[t0] = 1; });
      for (var m = 0; m < 12; m++) {
        var cells = F.monthGrid(y, m), box = h('div.ym', { role: 'button', tabindex: '0', onclick: (function (mm) { return function () { anchor = new Date(y, mm, 1).getTime(); view = 'month'; shell.showTab('month'); }; })(m) },
          h('div.ymt', null, new Date(y, m, 1).toLocaleDateString(lang(), { month: 'long' })));
        var mini = h('div.ymg');
        cells.slice(0, 42).forEach(function (c) { mini.appendChild(h('i' + (c.inMonth ? '' : '.out') + (has[c.ms] && c.inMonth ? '.has' : ''), null, c.inMonth ? String(c.day) : '')); });
        box.appendChild(mini); wrap.appendChild(box);
      }
      body.appendChild(wrap);
    }

    // ------------------------------------------------------- event sheets
    function openEvent(e, origin) {
      ctx.sheet({ title: e.title, origin: origin, content: function (close) {
        var loc = lang(), dfmt = { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }, day = function (ms) { return new Date(ms).toLocaleDateString(loc, dfmt); };
        var lastMs = e.allDay ? e.end - 1 : e.end, same = F.startOfDay(e.start) === F.startOfDay(Math.max(e.start, lastMs));
        var main = same ? day(e.start) : day(e.start) + ' – ' + day(lastMs);
        var sub = e.allDay ? t('c.allday') : (same ? tt(e.start) + ' – ' + tt(e.end) : tt(e.start) + ' – ' + tt(e.end));
        var calName = (ctx.state(e.calendar) || { attributes: {} }).attributes.friendly_name || e.calendar;
        var row = function (ic, a, b) { return h('div.evd', null, h('span.evd-i', { html: UI.icon(ic, 18) }), h('div.evd-t', null, h('b', null, a), b ? h('small', null, b) : null)); };
        var rows = h('div.evd-list', null, row('clock', main, sub), e.location ? row('pin', e.location) : null, e.description ? row('note', e.description) : null,
          h('div.evd', null, h('span.evd-i', null, h('i.evd-dot', { style: { background: e.color || F.CAL_PALETTE[0] } })), h('div.evd-t', null, h('b', null, calName))));
        return h('div', null, rows, e.recurring ? h('p.dim', null, t('c.recurring_note')) : null,
          h('div.actrow', null, h('button.act', { onclick: function () { close(); openForm(e); } }, t('c.edit')), h('button.act.danger', { onclick: function () { close(); removeEvent(e); } }, t('c.delete'))));
      } });
    }
    function removeEvent(e) {
      var before = events; events = events.filter(function (x) { return x !== e; }); draw();
      ctx.defer(t('c.deleted'), function () {
        var msg = { type: 'calendar/event/delete', entity_id: e.calendar, uid: e.uid || e.id };
        if (e.recurrenceId) { msg.recurrence_id = e.recurrenceId; msg.recurrence_range = 'THISANDFUTURE'; }
        Promise.resolve(ctx.callWS(msg)).then(load, function () { events = before; draw(); ctx.toast('error', t('c.delete')); });
      }, function () { events = before; draw(); });
    }
    function isWritable(id) { var s = ctx.state(id); return !!s && s.attributes.supported_features != null && L.has(s.attributes.supported_features, 1); }      // an iCloud or link calendar is read only: it never offers to save into it
    function writable() { var robots = F.robotCalendarsOf(ctx); return F.calendarEntities(ctx).filter(function (id) { return isWritable(id) && !robots[id]; }); }      // never into a robot's schedule
    // the calendars that come from outside (an iPhone link, CalDAV) are only fetched by Home Assistant once a day: ask for a fresh copy whenever the calendar opens
    function refreshOutside() {
      var now = Date.now(); if (now - (renderCalendar.lastRefresh || 0) < 300000) return;
      var ids = F.calendarEntities(ctx).filter(function (id) { return !isWritable(id); }); if (!ids.length) return;
      renderCalendar.lastRefresh = now;
      Promise.resolve(ctx.call('homeassistant', 'update_entity', { entity_id: ids })).then(function () { setTimeout(function () { if (!disposed) load(); }, 2500); }, function () {});
    }
    // the magnifying glass: events by title or place, from two months back to a year ahead; a tap on one goes to its day
    function openSearch() {
      ctx.sheet({ title: t('c.search'), width: 'min(560px,100%)', content: function (close) {
        var all = null, list = h('div.cs-list'), q = h('input.s-text', { type: 'search', placeholder: t('c.search_ph'), 'aria-label': t('c.search') });
        function show() {
          list.innerHTML = '';
          var s0 = q.value.trim().toLowerCase(); if (!s0 || !all) return;
          var hit = all.filter(function (e) { return (e.title || '').toLowerCase().indexOf(s0) >= 0 || (e.location || '').toLowerCase().indexOf(s0) >= 0; }).sort(function (a, b) { return a.start - b.start; }).slice(0, 60);
          if (!hit.length) list.appendChild(h('div.note-l', null, t('c.nofound')));
          hit.forEach(function (e) {
            list.appendChild(h('button.ag-ev', { style: { '--ec': colors[e.calendar] || F.CAL_PALETTE[0] }, onclick: function () { close(); anchor = e.start; sel = F.startOfDay(e.start); pickMs = null; if (view === 'day') load(); else shell.showTab('day'); } },
              h('i'), h('span.ag-t', null, new Date(e.start).toLocaleDateString(lang(), { weekday: 'short', month: 'short', day: 'numeric' })), h('span.ag-m', null, h('b', null, e.title || '—'), e.location ? h('small', null, e.location) : null)));
          });
        }
        q.addEventListener('input', show);
        var now = F.startOfDay(Date.now());
        F.fetchEvents(ctx, F.addDays(now, -60), F.addDays(now, 400), F.calendarEntities(ctx).filter(function (id) { return hidden.indexOf(id) < 0; })).then(function (r) { all = r; show(); });
        setTimeout(function () { try { q.focus(); } catch (er) { /* none */ } }, 80);
        return h('div', null, q, list);
      } });
    }
    function openForm(e) {
      var cals = writable();
      ctx.sheet({ title: e ? t('c.edit') : t('c.new'), width: 'min(560px,100%)', content: function (close) {
        if (!cals.length) return h('div.note-l', null, t('c.no_cal'));
        var f = e ? { title: e.title, start: e.start, end: e.end, allDay: e.allDay, location: e.location, description: e.description, calendar: e.calendar, recurrence: 'none' }
          : { title: '', start: (view === 'day' && pickMs != null && F.startOfDay(pickMs) === F.startOfDay(anchor)) ? pickMs : Math.ceil((view === 'day' || view === 'week' ? anchor : view === 'month' && sel !== F.startOfDay(Date.now()) ? sel + 9 * 3600000 : Date.now()) / 1800000) * 1800000, allDay: false, location: '', description: '', calendar: cals[0], recurrence: 'none' };
        if (!e) f.end = f.start + 3600000;
        var titleIn = h('input.s-text', { type: 'text', value: f.title, placeholder: t('c.title'), 'aria-label': t('c.title'), oninput: function () { f.title = titleIn.value; } });
        var quick = h('div.chiprow');
        [1, 2, 3, 4, 5].forEach(function (i) { quick.appendChild(h('button.cp', { onclick: function () { titleIn.value = t('c.q' + i); f.title = titleIn.value; } }, t('c.q' + i))); });
        var calSel = h('select.s-text', { 'aria-label': t('c.calendar'), onchange: function () { f.calendar = calSel.value; } }, cals.map(function (id) { return h('option', { value: id, selected: id === f.calendar }, (ctx.state(id) || { attributes: {} }).attributes.friendly_name || id); }));
        var allDay = h('input', { type: 'checkbox', checked: f.allDay, 'aria-label': t('c.allday'), onchange: function () { f.allDay = allDay.checked; sd.hidden = ed.hidden = st.hidden = et.hidden = f.allDay && false; st.hidden = et.hidden = f.allDay; } });
        var sd = h('input.s-text', { type: 'date', value: ymd(f.start), 'aria-label': t('c.start') }), st = h('input.s-text', { type: 'time', value: hm(f.start), hidden: f.allDay });
        var ed = h('input.s-text', { type: 'date', value: ymd(f.end), 'aria-label': t('c.end') }), et = h('input.s-text', { type: 'time', value: hm(f.end), hidden: f.allDay });
        var rec = CT.createSegment({ options: Object.keys(F.RECURRENCE).map(function (k) { return { id: k, label: t('c.rec.' + k) }; }), value: f.recurrence, ariaLabel: t('c.repeat'), onChange: function (v) { f.recurrence = v; } });
        var loc = h('input.s-text', { type: 'text', value: f.location, placeholder: t('c.location'), 'aria-label': t('c.location'), oninput: function () { f.location = loc.value; } });
        var desc = h('textarea.s-text', { rows: 3, placeholder: t('c.desc'), 'aria-label': t('c.desc'), oninput: function () { f.description = desc.value; } }, f.description);
        var save = h('button.act.primary', { onclick: function () {
          f.start = parseLocal(sd.value, f.allDay ? '00:00' : st.value); f.end = parseLocal(ed.value, f.allDay ? '00:00' : et.value);
          if (f.allDay && f.end <= f.start) f.end = F.addDays(f.start, 1);
          if (!f.allDay && f.end <= f.start) f.end = f.start + 3600000;
          if (!f.title.trim()) { titleIn.focus(); return; }
          var payload = F.eventPayload(f);
          var msg = e ? { type: 'calendar/event/update', entity_id: f.calendar, uid: e.uid || e.id, event: payload } : { type: 'calendar/event/create', entity_id: f.calendar, event: payload };
          Promise.resolve(ctx.callWS(msg)).then(function () { ctx.toast('success', t('c.saved')); close(); load(); }, function () { ctx.toast('error', t('c.save')); });
        } }, t('c.save'));
        return h('div.cf', null, titleIn, quick, calSel,
          h('label.cf-ad', null, allDay, h('span', null, t('c.allday'))),
          h('div.cf-row', null, h('span', null, t('c.start')), sd, st), h('div.cf-row', null, h('span', null, t('c.end')), ed, et),
          h('div.lbl', null, t('c.repeat')), rec.el, loc, desc, save);
      } });
    }

    // ---- the calendars: which are shown, which colour, and how to add the iPhone's
    function openCalendars(origin) {
      ctx.sheet({ title: t('c.calendars'), origin: origin, width: 'min(540px,100%)', content: function () {
        var ids = F.calendarEntities(ctx).sort(), list = h('div.cs-list'), robots = F.robotCalendarsOf(ctx);
        var keepHidden = function () { F.setHiddenCalendars(ctx, hidden); load(); };
        if (!ids.length) list.appendChild(h('div.note-l', null, t('c.cal_none')));
        ids.forEach(function (id) {
          var name = (ctx.state(id) || { attributes: {} }).attributes.friendly_name || id, on = hidden.indexOf(id) < 0, pal = h('div.cs-pal', { hidden: true });
          var dot = h('button.cs-dot', { style: { background: colors[id] }, 'aria-label': t('c.color') + ': ' + name, 'aria-expanded': 'false', onclick: function () { pal.hidden = !pal.hidden; dot.setAttribute('aria-expanded', pal.hidden ? 'false' : 'true'); } });
          F.CAL_PALETTE.forEach(function (c) {
            var sw = h('button' + (colors[id] === c ? '.on' : ''), { style: { background: c }, 'aria-label': c, onclick: function () {
              saved = Object.assign({}, saved); saved[id] = c; F.setCalendarColors(ctx, saved); colors[id] = c; dot.style.background = c;
              Array.prototype.forEach.call(pal.children, function (b) { b.classList.toggle('on', b === sw); }); draw();
            } }); pal.appendChild(sw);
          });
          var sw = h('button.sw' + (on ? '.on' : ''), { role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': t('c.shown') + ': ' + name, onclick: function () {
            on = !on; sw.classList.toggle('on', on); sw.setAttribute('aria-checked', on ? 'true' : 'false');
            hidden = hidden.filter(function (x) { return x !== id; }); if (!on) hidden.push(id); keepHidden();
          } }, h('i'));
          list.appendChild(h('div.cs-item', null, h('div.cs-row', null, dot, h('div.cs-n', null, name, h('small', null, robots[id] ? t('c.robot_note') : id)), sw), pal));
        });
        var help = h('div.cs-help', null, h('b', null, t('c.sync_title')), h('p', null, t('c.sync_body')),
          h('ol', null, h('li', null, t('c.sync_s1')), h('li', null, t('c.sync_s2')), h('li', null, t('c.sync_s3'))),
          h('a.act.primary', { href: '/config/integrations/dashboard/add?domain=remote_calendar', target: '_top' }, t('c.sync_btn')));
        return h('div', null, list, help);
      } });
    }

    var offStates = ctx.bus.on('states', function (ch) { if (ch.some(function (c) { return c.id.indexOf('calendar.') === 0; })) load(); });
    if (typeof ResizeObserver !== 'undefined') { ro = new ResizeObserver(function () { requestAnimationFrame(function () { if (!disposed && view === 'month' && Math.abs((shell.host.clientHeight || 0) - lastHostH) > 24) draw(); }); }); ro.observe(shell.el); }
    load(); refreshOutside();
    return { update: function () {}, dispose: function () { disposed = true; offStates(); if (ro) ro.disconnect(); shell.dispose(); } };
  }

  // =============================================================== todos ====
  function renderTodos(container, ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var lang = function () { return ctx.lang(); };
    var items = [], current = ctx.store.get('todo.list', 'all'), disposed = false, hidden = new Set();
    var lists = F.todoEntities(ctx);
    var chips = h('div.chiprow.td-lists');
    var input = h('input.s-text.td-in', { type: 'text', placeholder: t('t.add'), 'aria-label': t('t.add'), autocomplete: 'off', oninput: function () { similar(); } });
    var due = 'none', customDate = '';
    var dueSeg = CT.createSegment({ options: [{ id: 'none', label: t('t.due_none') }, { id: 'today', label: t('t.due_today') }, { id: 'tomorrow', label: t('t.due_tomorrow') }, { id: 'week', label: t('t.due_week') }], value: 'none', ariaLabel: 'Due', onChange: function (v) { due = v; customDate = ''; dateIn.value = ''; } });
    var dateIn = h('input.s-text.td-date', { type: 'date', 'aria-label': t('t.pick_date'), onchange: function () { customDate = dateIn.value; due = 'custom'; dueSeg.set(null); } });
    var mic = null, SR = g.SpeechRecognition || g.webkitSpeechRecognition;
    if (SR) {
      mic = h('button.mini.td-mic', { 'aria-label': t('t.dictate'), onclick: function () {
        var rec = new SR(); rec.lang = lang() === 'de' ? 'de-DE' : 'en-US'; rec.interimResults = false;
        mic.classList.add('on'); input.placeholder = t('t.listening');
        rec.onresult = function (e) { input.value = e.results[0][0].transcript; similar(); };
        rec.onend = function () { mic.classList.remove('on'); input.placeholder = t('t.add'); };
        try { rec.start(); } catch (er) { mic.classList.remove('on'); }
      }, html: UI.icon('mic', 18) });
    }
    var addBtn = h('button.act.primary', { onclick: add }, h('span', { html: UI.icon('plus', 18) }));
    var sim = h('div.td-sim');
    var listSel = lists.length > 1 ? h('select.s-text', { 'aria-label': t('t.list') }, lists.map(function (id) { return h('option', { value: id }, (ctx.state(id) || { attributes: {} }).attributes.friendly_name || id); })) : null;
    var header = h('div.td-head', null, h('div.td-add', null, input, mic, addBtn), h('div.td-opts', null, dueSeg.el, dateIn, listSel), sim, chips);
    var shell = g.OkieMotor.appshell.create(container, ctx, { id: 'tasks', title: t('app.todos'), subtitle: '', icon: 'list', gradient: ['#173a2c', '#2a7a58'], header: header, tabs: [], onTab: function () { if (shell) draw(); } });
    var body = shell.body;

    function dueDate() {
      var now = new Date(), base = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      if (due === 'today') return ymd(base.getTime()); if (due === 'tomorrow') return ymd(F.addDays(base.getTime(), 1)); if (due === 'week') return ymd(F.addDays(base.getTime(), 7));
      return due === 'custom' && customDate ? customDate : '';
    }
    function add() {
      var title = input.value.trim(); if (!title) return;
      var target = listSel ? listSel.value : (current !== 'all' ? current : lists[0]);
      if (current !== 'all' && listSel) target = current;
      var data = { entity_id: target, item: title }; var dd = dueDate(); if (dd) data.due_date = dd;
      ctx.call('todo', 'add_item', data).then(function () { input.value = ''; sim.innerHTML = ''; load(); }, function () { ctx.toast('error', title); });
    }
    function similar() {
      sim.innerHTML = '';
      var m = F.matchTitle(items, input.value, 4);
      if (!m.length) return;
      sim.appendChild(h('div.lbl', null, t('t.similar')));
      m.forEach(function (it) { sim.appendChild(h('div.td-s', null, it.summary, h('span', null, it.listName))); });
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    function load() { F.fetchTodos(ctx).then(function (list) { if (disposed) return; items = list; draw(); }); }
    function draw() {
      // list chips with counts
      chips.innerHTML = '';
      var openBy = {}; items.forEach(function (it) { if (it.status !== 'completed') openBy[it.list] = (openBy[it.list] || 0) + 1; });
      chips.appendChild(h('button.cp' + (current === 'all' ? '.on' : ''), { onclick: function () { current = 'all'; ctx.store.set('todo.list', 'all'); draw(); } }, t('t.all')));
      lists.forEach(function (id) { chips.appendChild(h('button.cp' + (current === id ? '.on' : ''), { onclick: function () { current = id; ctx.store.set('todo.list', id); draw(); } }, ((ctx.state(id) || { attributes: {} }).attributes.friendly_name || id) + ' ' + (openBy[id] || 0))); });
      body.innerHTML = '';
      var shown = items.filter(function (it) { return (current === 'all' || it.list === current) && !hidden.has(it.uid || it.summary + it.list); });
      var v = F.todoView(shown, Date.now());
      shell.setSubtitle(t('t.open', { n: shown.filter(function (i) { return i.status !== 'completed'; }).length }) + (v.overdue.length ? ' · ' + t('t.overdue', { n: v.overdue.length }) : ''));
      var groups = [['overdue', v.overdue], ['today', v.today], ['upcoming', v.upcoming], ['undated', v.undated], ['done', v.done]];
      var total = 0;
      groups.forEach(function (gp) {
        gp[1].forEach(function (it) { total++; body.appendChild(row(it, gp[0])); });
      });
      if (!total) body.appendChild(h('div.note-l', null, t('t.none')));
      shell.refreshScroll();
    }
    function row(it, kind) {
      var done = kind === 'done';
      var chk = h('button.chk' + (done ? '.on' : ''), { role: 'checkbox', 'aria-checked': done ? 'true' : 'false', 'aria-label': it.summary, onclick: function (e) {
        e.stopPropagation(); var next = done ? 'needs_action' : 'completed';
        (it.stacked || [it]).forEach(function (x) { ctx.call('todo', 'update_item', { entity_id: x.list, item: x.uid || x.summary, status: next }).catch(function () { ctx.toast('error', it.summary); }); });
        chk.classList.toggle('on', !done); setTimeout(load, 450);
      }, html: done ? UI.icon('check', 14) : '' });
      var del = h('button.mini', { 'aria-label': t('c.delete'), onclick: function (e) {
        e.stopPropagation(); var keyOf = (it.uid || it.summary + it.list); hidden.add(keyOf); draw();
        ctx.defer(t('t.deleted'), function () { ctx.call('todo', 'remove_item', { entity_id: it.list, item: (it.stacked || [it]).map(function (x) { return x.uid || x.summary; }) }).then(function () { hidden.delete(keyOf); load(); }, function () { hidden.delete(keyOf); draw(); ctx.toast('error', it.summary); }); }, function () { hidden.delete(keyOf); draw(); });
      }, html: UI.icon('trash', 16) });
      var label = it._due ? F.dueLabel(it, Date.now(), lang()) : '';
      return h('div.tdrow.' + kind, null, chk, h('div.tdm', null, h('div.tdtt', null, it.summary), label ? h('div.tdds', null, label) : null, current === 'all' && lists.length > 1 ? h('div.tdds', null, it.listName) : null), del);
    }
    var sig = '';
    load();
    return { update: function () {
      var s = lists.map(function (id) { return id + (ctx.state(id) || {}).state; }).join('|');
      if (s !== sig) { if (sig) load(); sig = s; }
    }, dispose: function () { disposed = true; shell.dispose(); } };
  }

  g.OkieMotor.apps.register({ id: 'tasks', nameKey: 'app.todos', name: 'Tasks', icon: 'list', color: '#2fa35c', order: 30, category: 'system', render: renderTodos });
  g.OkieMotor.apps.register({ id: 'calendar', nameKey: 'app.calendar', name: 'Calendar', icon: 'calendar', color: '#4f8cff', order: 40, category: 'system', render: renderCalendar });

  var CSS = [
    '.cal-nav{margin:0 0 10px;min-width:0;}',
    '.cal-strip{--cal-accent:#ff453a;position:relative;display:flex;align-items:baseline;gap:22px;overflow-x:auto;overflow-y:hidden;scrollbar-width:none;touch-action:pan-x pan-y;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scroll-padding-left:2px;--ml:0px;padding:6px 36px 12px 2px;-webkit-mask-image:linear-gradient(90deg,transparent 0,#000 var(--ml),#000 70%,transparent 100%);mask-image:linear-gradient(90deg,transparent 0,#000 var(--ml),#000 70%,transparent 100%);}.cal-strip::-webkit-scrollbar{display:none;}',
    '.cs{position:relative;flex:none;scroll-snap-align:start;padding:4px 0;font-size:14px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;white-space:nowrap;color:var(--okie-text-dim);opacity:.6;transition:opacity .15s ease,color .15s ease;}.cs:hover{opacity:.9;}',
    '.cs.on{opacity:1;color:var(--okie-text);font-size:19px;letter-spacing:.12em;}.cs.on span{margin-left:10px;font-size:12px;font-weight:500;letter-spacing:.06em;color:var(--okie-text-dim);}',
    '.cs.today::after{content:"";position:absolute;left:50%;bottom:-3px;width:5px;height:5px;margin-left:-2.5px;border-radius:50%;background:var(--cal-accent);}',
    '.cal-sheet{--cal-accent:#ff453a;position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;flex-direction:column;border-radius:26px;background:rgba(24,21,19,.82);-webkit-backdrop-filter:blur(22px);backdrop-filter:blur(22px);box-shadow:inset 0 1px 0 rgba(255,255,255,.1);transition:height .34s cubic-bezier(.2,.8,.2,1);overflow:hidden;}.cal-sheet.drag{transition:none;}.cal-sheet.open{background:rgba(24,21,19,.93);}',
    '.cal-grab{flex:none;display:grid;place-items:center;padding:12px 0 10px;cursor:grab;touch-action:none;-webkit-user-select:none;user-select:none;}.cal-grab:active{cursor:grabbing;}.cal-grab i{display:block;width:46px;height:5px;border-radius:3px;background:rgba(255,255,255,.4);}',
    '.cal-sheet-list{flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:0 14px 14px;scrollbar-width:none;}.cal-sheet-list::-webkit-scrollbar{display:none;}.cal-sheet:not(.open) .cal-sheet-list{overflow:hidden;}',
    '.mg{--cal-accent:#ff453a;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px 0;}.mgh{font-size:11px;font-weight:600;letter-spacing:.08em;color:var(--okie-text-dim);text-align:center;padding:4px 0 8px;text-transform:uppercase;}',
    '.mgc{position:relative;display:flex;flex-direction:column;align-items:center;gap:3px;padding:3px 0;min-height:46px;border-radius:14px;cursor:pointer;}.mgc.out{opacity:.35;}',
    '.mgd{display:grid;place-items:center;width:32px;height:32px;border-radius:50%;font-size:16px;font-weight:500;transition:background .18s ease;}.mgc.sel .mgd{background:rgba(255,255,255,.22);}.mgc.today .mgd{background:var(--cal-accent);color:#fff;font-weight:700;}.mgc.today.sel .mgd{box-shadow:0 0 0 2px rgba(255,255,255,.85);}',
    '.mgdots{display:flex;gap:3px;height:6px;}.mgdots i{width:6px;height:6px;border-radius:50%;background:var(--ec);}',
    '.mg.roomy .mgc{min-height:64px;padding-top:6px;}.mg.roomy .mgd{width:36px;height:36px;font-size:17px;}.mg.roomy .mgdots i{width:7px;height:7px;}.mg.roomy .mgdots{height:7px;gap:4px;}',
    '.cal-agenda{--cal-accent:#ff453a;display:flex;flex-direction:column;gap:6px;margin-top:14px;padding:16px 14px 12px;border-radius:24px;background:rgba(255,255,255,.07);}',
    '.cal-agenda.solo{margin-top:0;background:rgba(20,18,16,.38);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);}.ag-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;padding:0 4px 8px;}.ag-big{font-size:22px;font-weight:700;letter-spacing:-.01em;}.ag-big span{margin-left:10px;font-size:15px;font-weight:500;color:var(--okie-text-dim);}.ag-cnt{font-size:12px;color:var(--okie-text-dim);white-space:nowrap;}',
    '.ag-day{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;padding:6px 0;border-top:1px solid var(--okie-line);}.ag-day:first-of-type{border-top:0;}',
    '.ag-dl{display:flex;flex-direction:column;align-items:center;font-size:10px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;color:var(--okie-text-dim);padding-top:4px;}.ag-dl b{font-size:20px;letter-spacing:0;line-height:1.15;color:var(--okie-text);font-weight:600;}.ag-day.today .ag-dl b{color:var(--cal-accent);}.ag-day.past{opacity:.5;}.cal-sheet .ag-day:first-child{border-top:0;}',
    '.ag-rows{display:flex;flex-direction:column;gap:2px;min-width:0;}.ag-none{padding:8px 4px;font-size:14px;color:var(--okie-text-dim);}',
    '.ag-ev{display:grid;grid-template-columns:8px 62px minmax(0,1fr);align-items:start;gap:10px;width:100%;text-align:left;padding:8px;border-radius:14px;transition:background .15s ease;}.ag-ev:hover,.ag-ev:active{background:rgba(255,255,255,.08);}',
    '.ag-ev i{width:8px;height:8px;border-radius:50%;background:var(--ec);margin-top:6px;}.ag-t{font-size:12px;color:var(--okie-text-dim);padding-top:3px;white-space:nowrap;}.ag-m b{display:block;font-size:15px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}.ag-m small{display:block;font-size:12px;color:var(--okie-text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.evd-list{display:flex;flex-direction:column;gap:14px;margin-bottom:14px;}.evd{display:flex;gap:14px;align-items:flex-start;}.evd-i{width:22px;flex:none;display:grid;place-items:center;color:var(--okie-text-dim);padding-top:2px;}.evd-dot{display:block;width:12px;height:12px;border-radius:50%;margin-top:3px;}.evd-t{min-width:0;}.evd-t b{display:block;font-weight:600;font-size:16px;overflow-wrap:anywhere;}.evd-t small{display:block;font-size:14px;color:var(--okie-text-dim);margin-top:2px;}',
    '.cs-list{display:flex;flex-direction:column;gap:8px;margin-bottom:16px;}.cs-item{border-radius:18px;background:rgba(255,255,255,.07);overflow:hidden;}.cs-row{display:flex;align-items:center;gap:12px;padding:10px 14px;}.cs-dot{width:26px;height:26px;border-radius:50%;flex:none;box-shadow:inset 0 0 0 2px rgba(255,255,255,.4);}.cs-n{flex:1;min-width:0;font-weight:600;}.cs-n small{display:block;font-weight:400;font-size:12px;color:var(--okie-text-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.cs-pal{display:flex;gap:10px;flex-wrap:wrap;padding:4px 14px 14px 52px;}.cs-pal[hidden]{display:none;}.cs-pal button{width:28px;height:28px;border-radius:50%;}.cs-pal button.on{box-shadow:0 0 0 2px #fff;}',
    '.cs-help{padding:16px;border-radius:20px;background:rgba(255,255,255,.07);display:flex;flex-direction:column;gap:10px;}.cs-help b{font-size:16px;}.cs-help p,.cs-help li{margin:0;font-size:13px;line-height:1.45;color:var(--okie-text-dim);}.cs-help ol{margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;}.cs-help .act{align-self:flex-start;text-decoration:none;}',
    '.ev{display:flex;align-items:flex-start;gap:7px;width:100%;max-width:100%;padding:6px 9px;border-radius:12px;background:color-mix(in srgb,var(--ec) 32%,transparent);font-size:12px;text-align:left;}.ev i{width:7px;height:7px;border-radius:50%;background:var(--ec);flex:none;margin-top:4px;}.evx{display:flex;flex-direction:column;min-width:0;}.ev small{font-size:11px;opacity:.78;}.ev b{font-weight:600;white-space:normal;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;}.ev.c{padding:1px 6px;font-size:11px;}',
    '.wk{display:grid;grid-template-columns:repeat(var(--cols),minmax(0,1fr));gap:8px;}.wkc{display:flex;flex-direction:column;gap:5px;padding:8px;border-radius:16px;background:rgba(255,255,255,.06);min-height:220px;}.wkc.today{box-shadow:inset 0 0 0 2px #fff;}',
    '.wkh{display:flex;justify-content:space-between;align-items:baseline;cursor:pointer;color:var(--okie-text-dim);font-size:12px;text-transform:uppercase;}.wkh b{font-size:20px;color:var(--okie-text);}',
    '.cwk{display:flex;flex-direction:column;gap:6px;}.cwr{display:flex;gap:10px;padding:8px 10px;border-radius:14px;background:rgba(255,255,255,.06);}.cwr.today{box-shadow:inset 0 0 0 2px #fff;}.cwd{width:70px;font-weight:600;font-size:13px;flex:none;}.cwe{display:flex;flex-direction:column;gap:4px;min-width:0;}',
    '.dg{position:relative;margin-top:8px;}.dgl{position:absolute;left:0;right:0;border-top:1px solid var(--okie-line);font-size:11px;color:var(--okie-text-dim);}.dgl span{position:absolute;top:2px;left:0;}',
    '.dge{position:absolute;padding:5px 8px;border-radius:10px;background:color-mix(in srgb,var(--ec) 55%,#222);border-left:4px solid var(--ec);font-size:12px;text-align:left;overflow:hidden;display:flex;flex-direction:column;}.dge b{font-size:13px;}.dge span{opacity:.8;}',
    '.dgnow{position:absolute;left:44px;right:0;height:2px;margin-top:-1px;background:#ef4d3a;}',
    '.dgpill{position:absolute;left:0;transform:translateY(-50%);z-index:2;padding:3px 8px;border-radius:12px;border:0;background:#ef4d3a;color:#fff;font-size:11px;font-weight:700;white-space:nowrap;cursor:grab;touch-action:none;box-shadow:0 1px 6px rgba(0,0,0,.35);}.dgpill.drag{cursor:grabbing;transform:translateY(-50%) scale(1.08);}',
    '.yr{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:12px;}.ym{padding:10px;border-radius:16px;background:rgba(255,255,255,.06);cursor:pointer;}.ymt{font-weight:600;font-size:14px;margin-bottom:6px;text-transform:capitalize;}.ymg{display:grid;grid-template-columns:repeat(7,1fr);gap:2px;font-size:9px;text-align:center;}.ymg i{font-style:normal;padding:2px 0;border-radius:4px;}.ymg i.out{opacity:0;}.ymg i.has{background:#ff453a;color:#fff;}',
    '.cf{display:flex;flex-direction:column;gap:10px;}.cf .s-text{max-width:none;border-radius:16px;}.cf textarea.s-text{resize:none;}.cf-row{display:flex;gap:8px;align-items:center;}.cf-row .s-text{flex:1;max-width:none;padding:0 12px;}.cf,.cf>*{min-width:0;max-width:100%;}.cf .segment{display:flex;}.cf .sg{flex:1 1 auto;justify-content:center;padding:9px 8px;}@media (max-width:640px){.cf-row{flex-wrap:wrap;gap:4px 8px;}.cf-row span{width:100%;}}.cf-row span{width:60px;font-size:13px;color:var(--okie-text-dim);}.cf-ad{display:flex;gap:10px;align-items:center;}',
    '.dim{color:var(--okie-text-dim);}',
    '.td-head{display:flex;flex-direction:column;gap:10px;margin-bottom:12px;}.td-add{display:flex;gap:8px;align-items:center;}.td-in{max-width:none;flex:1;}.td-opts{display:flex;gap:8px;flex-wrap:wrap;align-items:center;}.td-date{max-width:170px;}.td-mic.on{background:#ef4d3a;}',
    '.td-s{display:flex;justify-content:space-between;font-size:13px;padding:5px 10px;border-radius:10px;background:rgba(255,255,255,.06);margin-top:4px;}.td-s span{color:var(--okie-text-dim);}',
    '.tdrow{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:18px;background:rgba(255,255,255,.08);margin-bottom:8px;}.tdrow.overdue{background:#d8473a;}.tdrow.done{opacity:.55;}.tdrow.done .tdtt{text-decoration:line-through;}',
    '.tdm{flex:1;min-width:0;}.tdtt{font-weight:600;}.tdds{font-size:12px;opacity:.8;margin-top:2px;}.tdrow .chk{width:28px;height:28px;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
})(typeof globalThis !== 'undefined' ? globalThis : window);

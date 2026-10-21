/* okie-settings: the Settings app, laid out like Fast Search Card's own.
 *
 * Four tabs (General, Appearance, Filter, About), each a list of sections with a
 * caps heading and an (i) button; rows are toggles with a glass dot, or "nav" rows
 * with a value and a chevron that slide in a sub-page with Back. One search field
 * on top finds a setting by name, description or option and jumps to it, and a
 * "Changed n" badge lists everything that differs from its default.
 *
 * Rows are data; modules add their own with OkieMotor.settingsRows.push(row).
 * A row may sit on a sub-page (row.page) described in PAGES. The pure helpers
 * (getPath, rowMatches, changedRows, ...) are unit-tested.
 */
(function (g) {
  'use strict';
  var isNode = typeof module !== 'undefined' && module.exports;
  var S = isNode ? require('./okie-search.js') : g.OkieMotor.search;

  // ----------------------------------------------------------- pure ----
  function getPath(obj, path) { return path.split('.').reduce(function (o, k) { return o == null ? undefined : o[k]; }, obj); }
  function setPartial(path, value) {
    var parts = path.split('.'), root = {}, cur = root;
    parts.forEach(function (k, i) { if (i === parts.length - 1) cur[k] = value; else { cur[k] = {}; cur = cur[k]; } });
    return root;
  }
  function pick(v, lang) { return v == null ? '' : (typeof v === 'string' ? v : (v[lang] || v.en || '')); }
  function pathsOf(row) { return row.paths || (row.path ? [row.path] : []); }
  /** Does a row match the search text? Every word has to hit label, description, option labels or group. */
  function rowMatches(row, query, lang) {
    var words = S.tokens(query);
    if (!words.length) return true;
    var hay = S.tokens([pick(row.label, lang), pick(row.desc, lang), pick(row.label, 'en'), pick(row.group, lang)].concat((row.options || []).map(function (o) { return pick(o.label, lang) + ' ' + o.id; })).join(' '));
    return words.every(function (w) { return hay.some(function (t) { return S.tokenScore(w, t) >= 0.62; }); });
  }
  /** Rows whose setting differs from default+config. paths come from createSettings().changed(). */
  function changedRows(rows, changedPaths) {
    return rows.filter(function (r) {
      return pathsOf(r).some(function (p) {
        return changedPaths.some(function (c) { return c === p || c.indexOf(p + '.') === 0 || p.indexOf(c + '.') === 0; });
      });
    });
  }
  /** The value a toggle shows: inverted rows say "hide" where the setting says "include". */
  function toggleValue(row, settings) { var v = !!getPath(settings, pathsOf(row)[0]); return row.invert ? !v : v; }
  /** The partial that stores a toggle: every path of the row gets the value. */
  function togglePartial(row, shown) {
    var v = row.invert ? !shown : !!shown, out = {};
    pathsOf(row).forEach(function (p) { var part = setPartial(p, v); Object.keys(part).forEach(function (k) { out[k] = out[k] && typeof out[k] === 'object' && typeof part[k] === 'object' ? Object.assign(out[k], part[k]) : part[k]; }); });
    return out;
  }
  var yes = function (en, de) { return { en: en, de: de }; };

  // ------------------------------------------------------------ data ----
  var HOME = yes('Home screen', 'Startbildschirm'), STATUS = yes('Status & greetings', 'Status & Begrüßung'), DESIGN = yes('Design', 'Design'), DIALS = yes('Dials', 'Drehregler'), LIGHTS = yes('Lights', 'Lichter');
  var onOff = function (path) { return { path: path, on: yes('Active', 'Aktiv'), off: yes('Off', 'Aus') }; };

  /** Sub-pages. tab+group: where its nav row sits; links: more nav rows inside it. */
  var PAGES = {
    island: { tab: 'general', group: STATUS, label: yes('Island', 'Insel'), desc: yes('Morphing capsule: clock, live activities, alerts', 'Morphende Kapsel: Werte, Live-Aktivitäten, Meldungen'), value: onOff('island.show'), links: ['live'],
      info: yes('The island is the status row: weather and power on the left, an orb with the message count on the right. Tap the orb and it opens into the notification list.', 'Die Insel ist die Statuszeile: links Wetter und Verbrauch, rechts ein Orb mit der Anzahl der Mitteilungen. Tippe den Orb an und er öffnet die Mitteilungsliste.') },
    live: { tab: 'general', group: HOME, label: yes('Live activities', 'Live-Aktivitäten'), desc: yes('Strip in the island: timers, vacuums, media … + opt-in lights, switches, climate', 'Laufende Dinge in der Insel: Timer, Saugroboter, Medien … + auf Wunsch Lichter, Schalter, Klima'), value: onOff('island.liveShow') },
    widgets: { tab: 'general', group: HOME, label: yes('Configure widgets', 'Widgets einrichten'), desc: yes('Which entity appears in which Bento slot', 'Was in welchem Bento-Feld erscheint'), value: null },
    sidebar: { tab: 'general', group: yes('Sidebar', 'Seitenleiste'), label: yes('Configure items', 'Einträge einrichten'), desc: yes('Which shortcuts appear in the sidebar (Home, Energy, Schedules, …)', 'Welche Kurzbefehle in der Seitenleiste erscheinen (Start, Energie, Zeitpläne, …)'), value: null },
    suggest: { tab: 'general', group: yes('Suggestions', 'Vorschläge'), label: yes('Enable Suggestions', 'Vorschläge aktivieren'), desc: yes('Learns what you use when, and suggests it', 'Lernt, was du wann nutzt, und schlägt es vor'), value: onOff('suggest.enabled') },
    toasts: { tab: 'general', group: yes('Toasts', 'Toasts'), label: yes('Notifications', 'Mitteilungen'), desc: yes('In-app messages on events', 'Meldungen in der Karte bei Ereignissen'), value: onOff('toasts.enabled') },
    bg: { tab: 'appearance', group: DESIGN, label: yes('Background', 'Hintergrund'), desc: yes('Adjust filters and effects', 'Filter und Effekte anpassen'), value: 'changed:glass' },
    wallpaper: { tab: 'appearance', group: DESIGN, label: yes('Wallpaper', 'Wallpaper'), desc: yes('Custom background image for the whole card', 'Eigenes Hintergrundbild für die ganze Karte'), value: { path: 'wallpaper', on: yes('Active', 'Aktiv'), off: yes('Inactive', 'Inaktiv'), truthy: true } },
    glass: { tab: 'appearance', group: DESIGN, label: yes('Liquid glass', 'Liquid Glass'), desc: yes('How dark and how frosted the glass surfaces are', 'Wie dunkel und wie milchig die Glasflächen sind'), value: 'changed:glass.tint' },
    quick: { tab: 'appearance', group: yes('Quick control', 'Schnellsteuerung'), label: yes('Quick control', 'Schnellsteuerung'), desc: yes('Switch devices directly via the icon (tap). Confirm risky ones (covers, locks) by holding.', 'Geräte direkt über das Symbol schalten (Tippen). Riskante (Rollos, Schlösser) durch Halten bestätigen.'), value: onOff('quickEnabled') },
    filters: { tab: 'appearance', group: yes('Filter', 'Filter'), label: yes('Filter & sorting', 'Filter & Sortierung'), desc: yes('Toolbar filters and sort-by-time', 'Filter in der Leiste und Sortierung nach Zeit'), value: null },
    videos: { tab: 'appearance', group: yes('Video backgrounds', 'Video-Hintergründe'), label: yes('Detail view videos', 'Detailansicht-Videos'), desc: yes('Background videos in detail view', 'Hintergrund-Videos in der Detailansicht'), value: onOff('videos.enabled') },
  };
  /** Module rows that belong on a sub-page, by the English name of their group. */
  var PAGE_OF_GROUP = { 'Notifications': 'toasts', 'Quiet hours': 'toasts', 'Screensaver & deep rest': 'widgets', 'Start screen': 'widgets' };

  var INFO = {
    'General': yes('Language and clock format of the card.', 'Sprache und Uhrformat der Karte.'),
    'Status & greetings': PAGES.island.info,
    'Mobile': yes('Only on phones and small tablets.', 'Nur auf Telefonen und kleinen Tablets.'),
    'Sidebar': yes('The rail with shortcuts to Settings, To-dos, News and more, at the left of the card.', 'Die Leiste mit Kurzbefehlen zu Einstellungen, Aufgaben, Nachrichten und mehr links an der Karte.'),
    'Home screen': yes('The Bento grid below the search field: favorites, a sliding pane and two small live tiles.', 'Das Bento-Raster unter dem Suchfeld: Favoriten, ein gleitendes Panel und zwei kleine Live-Kacheln.'),
    'Design': yes('How the card looks: background overlay, tile columns, corner shape, glass and wallpaper.', 'Wie die Karte aussieht: Hintergrund-Abdunklung, Kachel-Spalten, Eckenform, Glas und Wallpaper.'),
    'Limits': yes('Keeps very large installations fast.', 'Hält sehr große Installationen schnell.'),
    'Visibility': yes('Entities that Home Assistant hides are hidden here too, unless you switch these off.', 'Entitäten, die Home Assistant versteckt, bleiben auch hier versteckt, außer du schaltest das aus.'),
    'Excluded patterns': yes('Entities matching a pattern never show up in search or on the start screen. * is a wildcard.', 'Entitäten, die zu einem Muster passen, erscheinen nie in der Suche oder auf dem Startbildschirm. * ist ein Platzhalter.'),
  };

  // The built-in rows. group = the heading of the section, tab = which tab, page = a sub-page.
  var ROWS = [
    // ---- General ----
    { id: 'language', tab: 'general', group: yes('General', 'Allgemein'), type: 'segment', path: 'language', label: yes('App language', 'Sprache'), desc: yes('Choose your preferred language', 'Wähle deine Sprache'),
      options: [{ id: 'auto', label: yes('Automatic', 'Automatisch') }, { id: 'en', label: yes('English', 'Englisch') }, { id: 'de', label: yes('Deutsch', 'Deutsch') }] },
    { id: 'timeFormat', tab: 'general', group: yes('General', 'Allgemein'), type: 'segment', path: 'timeFormat', label: yes('Time format', 'Zeitformat'), desc: yes('Choose 24-hour or AM/PM', '24 Stunden oder AM/PM'),
      options: [{ id: 'auto', label: yes('Automatic', 'Automatisch') }, { id: '12h', label: yes('AM/PM', 'AM/PM') }, { id: '24h', label: yes('24-hour', '24 Stunden') }] },
    { id: 'zen_on', tab: 'general', group: STATUS, type: 'toggle', path: 'zen.enabled', label: yes('Lock page', 'Sperrseite'), desc: yes('Clock, greeting and quote before the start screen. Swipe up, scroll or press a key to open.', 'Uhr, Gruß und Zitat vor dem Startbildschirm. Zum Öffnen nach oben wischen, scrollen oder eine Taste drücken.') },
    { id: 'zen_keep', tab: 'general', group: STATUS, type: 'toggle', path: 'zen.keepOpen', label: yes('Stay open after a refresh', 'Nach einem Neuladen offen bleiben'), desc: yes('When Home Assistant rebuilds the card (reconnect, view change, reload), it opens on the start screen instead of the lock page if you used it in the last 15 minutes.', 'Baut Home Assistant die Karte neu auf (Wiederverbindung, Ansichtswechsel, Neuladen), öffnet sie auf dem Startbildschirm statt der Sperrseite, wenn du sie in den letzten 15 Minuten benutzt hast.') },
    { id: 'zen_text', tab: 'general', group: STATUS, type: 'segment', path: 'zen.text', label: yes('Greetings', 'Begrüßung'), desc: yes('What the lock page says under the clock', 'Was die Sperrseite unter der Uhr sagt'),
      options: [{ id: 'auto', label: yes('Auto', 'Auto') }, { id: 'quote', label: yes('Quote', 'Zitat') }, { id: 'greeting', label: yes('Greeting', 'Gruß') }, { id: 'none', label: yes('Nothing', 'Nichts') }] },
    { id: 'zen_quote', tab: 'general', group: STATUS, type: 'text', path: 'zen.quoteEntity', placeholder: 'sensor.quote_of_the_day', label: yes('Quote sensor', 'Zitat-Sensor'), desc: yes('Auto shows this sensor as the quote when it exists, else a greeting', 'Auto zeigt diesen Sensor als Zitat, wenn er existiert, sonst einen Gruß') },
    { id: 'zen_name', tab: 'general', group: STATUS, type: 'text', path: 'zen.name', placeholder: 'Okie', label: yes('Your name', 'Dein Name'), desc: yes('Used in the greeting. Empty uses your Home Assistant name.', 'Wird im Gruß benutzt. Leer nimmt deinen Home-Assistant-Namen.') },
    { id: 'ctx_lines', tab: 'general', group: STATUS, type: 'toggle', path: 'search.context', label: yes('Context lines', 'Kontextzeilen'), desc: yes('The typing loop in the search field occasionally mentions what happened last', 'Die Tipp-Schleife im Suchfeld erwähnt gelegentlich, was zuletzt passiert ist') },
    { id: 'ai_on', tab: 'general', group: yes('Assistant', 'Assistent'), type: 'toggle', path: 'search.ai', label: yes('AI assistant in the search bar', 'KI-Assistent in der Suchleiste'), desc: yes('The sparkle button chats with your Home Assistant Assist agent, and a request typed into the search offers to ask it', 'Der Funkel-Knopf chattet mit deinem Home-Assistant-Assist-Agenten, und eine Anfrage in der Suche bietet an, ihn zu fragen') },
    { id: 'm_auto', tab: 'general', group: yes('Mobile', 'Mobil'), type: 'toggle', path: 'mobile.autoOpen', label: yes('Auto-open search panel', 'Suchfeld automatisch öffnen'), desc: yes('Mobile only: panel starts already expanded', 'Nur mobil: das Suchfeld startet schon geöffnet') },
    { id: 'm_haptic', tab: 'general', group: yes('Mobile', 'Mobil'), type: 'toggle', path: 'haptic', label: yes('Haptic feedback', 'Haptisches Feedback'), desc: yes('A short tap when touching a button or switch, a lighter one for each step of a slider or dial, a stronger one at its end and on errors (Android; iPhone gets a light tick)', 'Ein kurzes Tippen bei Tasten und Schaltern, ein leichteres bei jedem Schritt eines Reglers, ein stärkeres am Ende und bei Fehlern (Android; iPhone: leichter Tick)') },
    { id: 'm_sound', tab: 'general', group: yes('Mobile', 'Mobil'), type: 'toggle', path: 'sound', label: yes('Tick sound', 'Tick-Ton'), desc: yes('A very soft click with every tap and every step of a slider or dial (needs the sound on)', 'Ein ganz leises Klicken bei jedem Tippen und jedem Schritt eines Reglers (Ton muss an sein)') },
    { id: 'sb_show', tab: 'general', group: yes('Sidebar', 'Seitenleiste'), type: 'toggle', path: 'sidebar.show', label: yes('Show sidebar', 'Seitenleiste zeigen'), desc: yes('Shortcut rail with system entities (Settings, Todos, News…)', 'Leiste mit Kurzbefehlen zu System-Einträgen (Einstellungen, Aufgaben, News…)') },
    { id: 'sb_always', tab: 'general', group: yes('Sidebar', 'Seitenleiste'), type: 'toggle', path: 'sidebar.always', label: yes('Always visible', 'Immer sichtbar'), desc: yes('Off: only while the search panel or a view is open', 'Aus: nur solange das Suchfeld oder eine Ansicht offen ist') },
    { id: 'b_on', tab: 'general', group: HOME, type: 'toggle', path: 'bento.enabled', label: yes('Enable Bento Grid', 'Bento-Raster aktivieren'), desc: yes('Alternative home screen with 4 widgets below the search field', 'Alternativer Startbildschirm mit 4 Widgets unter dem Suchfeld') },

    // ---- General: island page ----
    { id: 'i_show', tab: 'general', page: 'island', group: yes('The island', 'Die Insel'), type: 'toggle', path: 'island.show', label: yes('Show the island', 'Insel zeigen'), desc: yes('Capsule top left: values, orb with message count', 'Kapsel oben links: Werte, Orb mit Mitteilungszahl') },
    { id: 'weather_entity', tab: 'general', page: 'island', group: yes('Standing values', 'Feste Werte'), type: 'entity', domain: 'weather', path: 'weather_entity', label: yes('Weather', 'Wetter'), desc: yes('Automatic: first weather entity of the device list', 'Automatisch: erste Wetter-Entität der Geräteliste') },
    { id: 'power_entity', tab: 'general', page: 'island', group: yes('Standing values', 'Feste Werte'), type: 'entity', domain: 'sensor', path: 'power_entity', label: yes('Power', 'Verbrauch'), desc: yes('Automatic: the strongest power sensor (≈ total consumption)', 'Automatisch: der stärkste Leistungs-Sensor (≈ Gesamtverbrauch)') },
    { id: 'i_fold', tab: 'general', page: 'island', group: yes('Standby', 'Ruhe'), type: 'toggle', path: 'island.fold', label: yes('Fold automatically', 'Automatisch einklappen'), desc: yes('Open panel → capsule → status line with the button; a tap brings it back', 'Offenes Panel → Kapsel → Statuszeile mit dem Knopf; ein Tippen holt sie zurück') },
    { id: 'i_cap', tab: 'general', page: 'island', group: yes('Standby', 'Ruhe'), type: 'slider', path: 'island.toCapsuleSec', min: 10, max: 300, step: 10, unit: 's', label: yes('To the capsule after', 'Zur Kapsel nach'), desc: yes('Idle without touch', 'Ruhe ohne Berührung') },
    { id: 'i_btn', tab: 'general', page: 'island', group: yes('Standby', 'Ruhe'), type: 'slider', path: 'island.toButtonSec', min: 10, max: 600, step: 10, unit: 's', label: yes('To the button after', 'Zum Knopf nach'), desc: yes('Additional wait while in the capsule', 'Zusätzliche Wartezeit in der Kapsel') },

    // ---- General: live activities page ----
    { id: 'l_show', tab: 'general', page: 'live', group: yes('Live activities', 'Live-Aktivitäten'), type: 'toggle', path: 'island.liveShow', label: yes('Show live activities', 'Live-Aktivitäten zeigen'), desc: yes('The "running" level of the island list', 'Die Stufe "Laufend" in der Insel-Liste') },
    { id: 'l_timers', tab: 'general', page: 'live', group: yes('Live activities', 'Live-Aktivitäten'), type: 'toggle', path: 'island.live.timers', label: yes('Timers', 'Timer'), desc: yes('Running timers with the time left', 'Laufende Timer mit der Restzeit') },
    { id: 'l_vacuums', tab: 'general', page: 'live', group: yes('Live activities', 'Live-Aktivitäten'), type: 'toggle', path: 'island.live.vacuums', label: yes('Vacuums', 'Saugroboter'), desc: yes('Cleaning or returning', 'Reinigen oder Rückfahrt') },
    { id: 'l_covers', tab: 'general', page: 'live', group: yes('Live activities', 'Live-Aktivitäten'), type: 'toggle', path: 'island.live.covers', label: yes('Covers', 'Rollos'), desc: yes('While opening or closing', 'Beim Öffnen oder Schließen') },
    { id: 'l_media', tab: 'general', page: 'live', group: yes('Live activities', 'Live-Aktivitäten'), type: 'toggle', path: 'island.live.media', label: yes('Media', 'Medien'), desc: yes('Players that are playing', 'Wiedergabegeräte, die gerade spielen') },
    { id: 'l_scripts', tab: 'general', page: 'live', group: yes('Live activities', 'Live-Aktivitäten'), type: 'toggle', path: 'island.live.scripts', label: yes('Scripts', 'Skripte'), desc: yes('Scripts that are running', 'Skripte, die gerade laufen') },
    { id: 'l_climate', tab: 'general', page: 'live', group: yes('Continuous states', 'Dauerzustände'), type: 'toggle', path: 'island.live.climate', label: yes('Climate (heating/cooling)', 'Klima (Heizen/Kühlen)'), desc: yes('Continuous state — off by default', 'Dauerzustand — standardmäßig aus') },
    { id: 'l_lights', tab: 'general', page: 'live', group: yes('Continuous states', 'Dauerzustände'), type: 'toggle', path: 'island.live.lights', label: yes('Lights', 'Lichter'), desc: yes('Continuous state — off by default', 'Dauerzustand — standardmäßig aus') },
    { id: 'l_switches', tab: 'general', page: 'live', group: yes('Continuous states', 'Dauerzustände'), type: 'toggle', path: 'island.live.switches', label: yes('Switches', 'Schalter'), desc: yes('Continuous state — off by default', 'Dauerzustand — standardmäßig aus') },

    // ---- General: widgets page ----
    { id: 'w1', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'toggle', path: 'bento.w1', label: yes('Large widget (left)', 'Großes Widget (links)'), desc: yes('Favorites and suggestions, full-height left', 'Favoriten und Vorschläge, links über die ganze Höhe') },
    { id: 'w1mode', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'segment', path: 'bento.w1mode', label: yes('Opens on', 'Öffnet mit'), desc: yes('Which tab the large widget starts on (Favorites fall back to Suggestions while empty)', 'Mit welchem Reiter das große Widget startet (leere Favoriten fallen auf Vorschläge zurück)'),
      options: [{ id: 'favorites', label: yes('Favorites', 'Favoriten') }, { id: 'rooms', label: yes('Rooms', 'Räume') }, { id: 'suggestions', label: yes('Suggestions', 'Vorschläge') }] },
    { id: 'w1layout', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'segment', path: 'bento.w1layout', label: yes('Large widget view', 'Ansicht des großen Widgets'), desc: yes('Tiles or list', 'Kacheln oder Liste'),
      options: [{ id: 'grid', label: yes('Tiles', 'Kacheln') }, { id: 'list', label: yes('List', 'Liste') }] },
    { id: 'w2', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'toggle', path: 'bento.w2', label: yes('Top right (auto slider)', 'Oben rechts (Auto-Slider)'), desc: yes('Medium widget that slides through its pages', 'Mittleres Widget, das durch seine Seiten gleitet') },
    { id: 'w2pages', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'multi', path: 'bento.pages', label: yes('Slider pages', 'Slider-Seiten'), desc: yes('Which pages the slider shows', 'Welche Seiten der Slider zeigt'),
      options: [{ id: 'weather', label: yes('Weather', 'Wetter') }, { id: 'todos', label: yes('To-do', 'Aufgaben') }, { id: 'news', label: yes('News', 'Nachrichten') }, { id: 'calendar', label: yes('Calendar', 'Kalender') }, { id: 'cameras', label: yes('Cameras', 'Kameras') }, { id: 'tips', label: yes('Tips', 'Tipps') }] },
    { id: 'one_widget', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'toggle', path: 'bento.oneWidget', label: yes('One swipeable card', 'Eine wischbare Karte'), desc: yes('The sliding card at the top right and the cameras, Kindle, AWTRIX and home map cards are one card: swipe through all of them. Switch off to keep the cameras card, the Kindle, the AWTRIX and the map as a separate card under it.', 'Die Schiebekarte oben rechts und die Karten Kameras, Kindle, AWTRIX und Hausplan sind eine Karte: wische durch alle. Ausschalten, um sie als eigene Karte darunter zu behalten.') },
    { id: 'cam_card', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'toggle', path: 'bento.camerasCard', label: yes('Cameras card', 'Kameras-Karte'), desc: yes('A card under the top-right slider: the last motion picture, a bell with the number of new motion events, and View Cameras. On a wide screen it takes the place of the Tasks and News tiles.', 'Eine Karte unter dem Slider oben rechts: das letzte Bewegungsbild, eine Glocke mit der Zahl neuer Bewegungen und Kameras ansehen. Auf einem breiten Bildschirm ersetzt sie die Kacheln Aufgaben und Nachrichten.') },
    { id: 'feeder_card', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'toggle', path: 'bento.feederCard', label: yes('Feeder card', 'Futter-Karte'), desc: yes('Under the cameras card on a wide screen: when the pets were last fed and one tap to feed them (the script of Home Assistant with feed in its name; a second tap is needed within 10 minutes).', 'Unter der Kameras-Karte auf einem breiten Bildschirm: wann die Tiere zuletzt gefüttert wurden und ein Tipp zum Füttern (das Skript mit feed im Namen; innerhalb von 10 Minuten braucht es einen zweiten Tipp).') },
    { id: 'feeder_design', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'segment', path: 'bento.feederDesign', label: yes('Feeder card look', 'Aussehen der Futter-Karte'), desc: yes('The row, or one of the five designs of the feeder widget of the iPhone and iPad app. You can also change it with the pencil on the card while you arrange the start screen.', 'Die Zeile oder eines der fünf Designs des Futter-Widgets der iPhone- und iPad-App. Du kannst es auch mit dem Stift an der Karte ändern, während du den Startbildschirm anordnest.'),
      options: [{ id: 'compact', label: yes('Compact', 'Kompakt') }, { id: 'classic', label: yes('Orange cat', 'Orange Katze') }, { id: 'peek', label: yes('Peeking cat', 'Spähende Katze') }, { id: 'leaves', label: yes('Green leaves', 'Grüne Blätter') }, { id: 'neon', label: yes('Neon bowl', 'Neon-Napf') }, { id: 'bowl', label: yes('Bowl', 'Napf') }] },
    { id: 'cam_last', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'text', path: 'cameras.lastEntity', placeholder: 'image.patio_last_motion', label: yes('Last motion picture entity', 'Entität des letzten Bewegungsbilds'), desc: yes('Optional. Empty picks an image entity whose name says last motion.', 'Optional. Leer nimmt eine Bild-Entität, deren Name letzte Bewegung sagt.') },
    { id: 'cam_clips', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'text', path: 'cameras.clipsUrl', placeholder: 'https://example.org/ring', label: yes('Recordings page', 'Aufnahmen-Seite'), desc: yes('Optional. Empty uses https://<this address>:8765/ring, the recordings of your server. Adds an Open recordings button to the motion history.', 'Optional. Leer nimmt https://<diese Adresse>:8765/ring, die Aufnahmen deines Servers. Fügt dem Bewegungsverlauf einen Knopf Aufnahmen öffnen hinzu.') },
    { id: 'cam_rec', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'toggle', path: 'cameras.recordings', label: yes('Tap an event to watch its recording', 'Ereignis antippen, um die Aufnahme zu sehen'), desc: yes('In the motion history a tap on an event opens the recording your server made of it, where you can watch, download, trim and keep it.', 'Im Bewegungsverlauf öffnet ein Tipp auf ein Ereignis die Aufnahme, die dein Server davon gemacht hat. Dort kannst du sie ansehen, laden, kürzen und behalten.') },
    { id: 'cam_live', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'slider', path: 'cameras.liveSeconds', min: 30, max: 600, step: 30, unit: 's', label: yes('Live view stops after', 'Live-Ansicht stoppt nach'), desc: yes('An open stream keeps a battery camera awake and blocks its motion events, so the live picture pauses by itself and waits for a tap.', 'Ein offener Stream hält eine Akku-Kamera wach und blockiert ihre Bewegungsmeldungen, darum pausiert das Live-Bild von selbst und wartet auf einen Tipp.') },
    { id: 'cam_img', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'text', path: 'cameras.image', placeholder: '/local/house.jpg', label: yes('Cameras card picture', 'Bild der Kameras-Karte'), desc: yes('Optional: always use your own picture, for example /local/house.jpg, instead of the last motion picture.', 'Optional: immer dein eigenes Bild nehmen, zum Beispiel /local/haus.jpg, statt des letzten Bewegungsbilds.') },
    { id: 'slide', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'slider', path: 'bento.slideSec', min: 3, max: 20, step: 1, unit: 's', label: yes('Slide interval', 'Wechselintervall'), desc: yes('Seconds between automatic page changes', 'Sekunden zwischen automatischen Seitenwechseln') },
    { id: 'w1h', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'slider', path: 'bento.w1height', min: 0, max: 1200, step: 10, unit: 'px', commit: 'release', label: yes('Favorites & suggestions height', 'Höhe von Favoriten & Vorschlägen'), desc: yes('On phones and short windows. 0 is automatic. You can also tap the pencil next to the view icons on the start screen and drag the line.', 'Auf Handys und niedrigen Fenstern. 0 ist automatisch. Du kannst auch den Stift neben den Ansichts-Symbolen auf dem Startbildschirm antippen und die Linie ziehen.') },
    { id: 'w3', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'segment', path: 'bento.w3', label: yes('Bottom left', 'Unten links'), desc: yes('Small widget (bottom left)', 'Kleines Widget (unten links)'),
      options: [{ id: 'todos', label: yes('To-do', 'Aufgaben') }, { id: 'news', label: yes('News', 'Nachrichten') }, { id: 'tips', label: yes('Tips', 'Tipps') }, { id: 'chronicle', label: yes('Recently in the house', 'Zuletzt im Haus') }, { id: 'none', label: yes('None', 'Keins') }] },
    { id: 'w4', tab: 'general', page: 'widgets', group: yes('Bento widgets', 'Bento-Widgets'), type: 'segment', path: 'bento.w4', label: yes('Bottom right', 'Unten rechts'), desc: yes('Small widget (bottom right)', 'Kleines Widget (unten rechts)'),
      options: [{ id: 'todos', label: yes('To-do', 'Aufgaben') }, { id: 'news', label: yes('News', 'Nachrichten') }, { id: 'tips', label: yes('Tips', 'Tipps') }, { id: 'chronicle', label: yes('Recently in the house', 'Zuletzt im Haus') }, { id: 'none', label: yes('None', 'Keins') }] },

    // ---- General: sidebar page ----
    { id: 'sidebar', tab: 'general', page: 'sidebar', group: yes('Available items', 'Verfügbare Einträge'), type: 'sidebar', path: 'sidebar.items', label: yes('Dock items', 'Dock-Einträge'), desc: yes('Choose which apps appear in the dock and in which order. Home is always there.', 'Welche Apps im Dock erscheinen und in welcher Reihenfolge. Start ist immer da.') },

    // ---- General: suggestions page ----
    { id: 'su_on', tab: 'general', page: 'suggest', group: yes('Settings', 'Einstellungen'), type: 'toggle', path: 'suggest.enabled', label: yes('Enable Suggestions', 'Vorschläge aktivieren'), desc: yes('Learns what you use when, and suggests it', 'Lernt, was du wann nutzt, und schlägt es vor') },
    { id: 'su_max', tab: 'general', page: 'suggest', group: yes('Settings', 'Einstellungen'), type: 'slider', path: 'suggest.max', min: 3, max: 20, step: 1, unit: '', label: yes('Maximum Number', 'Höchstzahl'), desc: yes('Maximum number of displayed suggestions', 'Höchstzahl der angezeigten Vorschläge') },
    { id: 'learning', tab: 'general', page: 'suggest', group: yes('Learning speed', 'Lerngeschwindigkeit'), type: 'segment', path: 'learning', label: yes('Learning Speed', 'Lerngeschwindigkeit'), desc: yes('How quickly the system adapts to new patterns', 'Wie schnell sich das System auf neue Muster einstellt'),
      options: [{ id: 'slow', label: yes('Slow', 'Langsam') }, { id: 'normal', label: yes('Normal', 'Normal') }, { id: 'fast', label: yes('Fast', 'Schnell') }] },
    { id: 'resetlearn', tab: 'general', page: 'suggest', group: yes('Learning data', 'Lerndaten'), type: 'action', label: yes('Clear learning data', 'Lerndaten löschen'), desc: yes('Reset all stored usage patterns. Suggestions will be retrained.', 'Alle gespeicherten Nutzungsmuster zurücksetzen. Die Vorschläge lernen neu.'), action: 'resetLearning', danger: true },

    // ---- General: toasts page ----
    { id: 'toasts', tab: 'general', page: 'toasts', group: yes('Toasts', 'Toasts'), type: 'toggle', path: 'toasts.enabled', label: yes('Enable toasts', 'Toasts aktivieren'), desc: yes('Master switch – disables all toasts', 'Hauptschalter – schaltet alle Toasts aus') },
    { id: 'toastclose', tab: 'general', page: 'toasts', group: yes('Toasts', 'Toasts'), type: 'toggle', path: 'toasts.closable', label: yes('Close button on toasts', 'Schließen-Knopf an Toasts'), desc: yes('Otherwise they dismiss after three seconds', 'Sonst verschwinden sie nach drei Sekunden') },

    { id: 'lightmodes_layout', tab: 'general', group: LIGHTS, type: 'segment', path: 'lightModesLayout', label: yes('Light modes layout', 'Anordnung der Lichtmodi'), desc: yes('Side by side is one row as tall as the thermostat card. Stacked puts the modes under each other, separated by lines. Icons only is a thin strip with just the pictures and the arrow.', 'Nebeneinander ist eine Reihe so hoch wie die Thermostat-Karte. Untereinander stapelt die Modi, getrennt durch Linien. Nur Symbole ist ein schmaler Streifen mit den Bildern und dem Pfeil.'),
      options: [{ id: 'horizontal', label: yes('Side by side', 'Nebeneinander') }, { id: 'vertical', label: yes('Stacked', 'Untereinander') }, { id: 'compact', label: yes('Icons only', 'Nur Symbole') }] },
    { id: 'lightmodes', tab: 'general', group: LIGHTS, type: 'lightmodes', label: yes('Light modes', 'Lichtmodi'), desc: yes('Shortcuts for your lights: cards on the Favorites tab and in the rooms you choose. Edit them, add more, put them on a schedule.', 'Kurzbefehle für deine Lichter: Karten bei den Favoriten und in den Räumen, die du wählst. Bearbeiten, ergänzen, planen.') },

    // ---- Appearance ----
    { id: 'ui_scale', tab: 'appearance', group: DESIGN, type: 'slider', path: 'scale', min: 50, max: 130, step: 1, unit: '%', commit: 'release', mobileMin: 70, mobileMax: 100, label: yes('Content size', 'Größe der Oberfläche'), desc: yes('Menu, search bar and cards scale together, the background stays. 100% is the size of Fast Search Card. Phones go from 70% to 100%. Saved on this device only.', 'Menü, Suchleiste und Karten skalieren gemeinsam, der Hintergrund bleibt. 100 % ist die Größe von Fast Search Card. Auf dem Handy von 70 % bis 100 %. Wird nur auf diesem Gerät gespeichert.') },
    { id: 'ui_textsize', tab: 'appearance', group: DESIGN, type: 'slider', path: 'textScale', min: 70, max: 140, step: 5, unit: '%', commit: 'release', label: yes('Text size', 'Textgröße'), desc: yes('Makes only the text bigger or smaller. Cards, menu and photo keep their size. 100% is the normal size. Saved on this device only.', 'Macht nur den Text größer oder kleiner. Karten, Menü und Foto behalten ihre Größe. 100 % ist die normale Größe. Gilt nur für dieses Gerät.') },
    { id: 'center_view', tab: 'appearance', group: DESIGN, type: 'toggle', path: 'centerView', label: yes('Center on the screen', 'In der Mitte des Bildschirms'), desc: yes('On a wide screen (iPad, desktop) the start screen and the lock page sit in the middle of the window instead of at the top. Saved on this device only.', 'Auf einem breiten Bildschirm (iPad, Desktop) liegen Startseite und Sperrseite in der Mitte des Fensters statt oben. Gilt nur für dieses Gerät.') },
    { id: 'bento_swap', tab: 'appearance', group: DESIGN, type: 'toggle', path: 'bento.swap', label: yes('Cameras above the slides', 'Kameras über den Folien'), desc: yes('On the start screen the cameras card sits above the sliding card (weather, tasks, news, calendar) instead of below it. Saved on this device only.', 'Auf der Startseite liegt die Kamerakarte über der Folienkarte (Wetter, Aufgaben, Nachrichten, Kalender) statt darunter. Gilt nur für dieses Gerät.') },
    { id: 'bgmode', tab: 'appearance', group: DESIGN, type: 'segment', path: 'bgMode', label: yes('Background mode', 'Hintergrund-Modus'), desc: yes('Adjust overlay for better focus', 'Abdunklung für bessere Lesbarkeit'),
      options: [{ id: 'auto', label: yes('Automatic', 'Automatisch') }, { id: 'light', label: yes('Light', 'Hell') }, { id: 'dark', label: yes('Dark', 'Dunkel') }] },
    { id: 'columns', tab: 'appearance', group: DESIGN, type: 'segment', path: 'search.columns', label: yes('Grid columns', 'Spalten'), desc: yes('Number of device cards per row', 'Gerätekarten pro Zeile (ab 1024 px Breite)'),
      options: [{ id: 4, label: yes('4 Columns', '4 Spalten'), desc: yes('Standard layout - more space per card', 'Standard - mehr Platz pro Karte') }, { id: 5, label: yes('5 Columns', '5 Spalten'), desc: yes('Compact layout - more cards at a glance', 'Kompakt - mehr Karten auf einen Blick') }, { id: 6, label: yes('6 Columns', '6 Spalten'), desc: yes('Very compact - maximum density', 'Sehr kompakt - maximale Dichte') }] },
    { id: 'squircle', tab: 'appearance', group: DESIGN, type: 'segment', path: 'squircle', label: yes('Card shape', 'Kartenform'), desc: yes('Corner rounding of device cards', 'Ecken-Rundung der Gerätekarten'), foot: yes('Squircles are more organic curves than normal rounding - the stronger, the more they deviate from the circle.', 'Squircles sind organischere Kurven als normale Rundungen - je stärker, desto mehr weichen sie vom Kreis ab.'),
      options: [{ id: 'none', label: yes('Standard', 'Standard'), desc: yes('Classic rounded corners', 'Klassische abgerundete Ecken') }, { id: 'strong', label: yes('Prominent', 'Ausgeprägt'), desc: yes('Strong, distinctive curve form', 'Starke, markante Kurvenform') }, { id: 'standard', label: yes('Balanced', 'Ausgewogen'), desc: yes('Balanced organic curves', 'Ausgewogene organische Kurven') }, { id: 'soft', label: yes('Subtle', 'Dezent'), desc: yes('Delicate soft curves', 'Zarte weiche Kurven') }] },
    { id: 'g_bright', tab: 'appearance', page: 'bg', group: yes('Background', 'Hintergrund'), type: 'slider', path: 'glass.brightness', min: 40, max: 160, step: 2, unit: '%', label: yes('Opacity', 'Deckkraft'), desc: yes('Controls the brightness of the background image (100% = Original, 0% = Black)', 'Steuert die Helligkeit des Hintergrundbildes (100% = Original)') },
    { id: 'g_contrast', tab: 'appearance', page: 'bg', group: yes('Background', 'Hintergrund'), type: 'slider', path: 'glass.contrast', min: 50, max: 160, step: 2, unit: '%', label: yes('Contrast', 'Kontrast'), desc: yes('Contrast of the glass backdrop', 'Kontrast des Glas-Hintergrunds') },
    { id: 'g_sat', tab: 'appearance', page: 'bg', group: yes('Background', 'Hintergrund'), type: 'slider', path: 'glass.saturation', min: 0, max: 300, step: 5, unit: '%', label: yes('Saturation', 'Sättigung'), desc: yes('Colour saturation of the glass backdrop', 'Farbsättigung des Glas-Hintergrunds') },
    { id: 'dl_blur', tab: 'appearance', group: DIALS, type: 'slider', path: 'thermo.glowBlur', min: 0, max: 160, step: 1, unit: ' px', label: yes('Glow softness', 'Glühen: Weichheit'), desc: yes('How soft the light around dials and sliders is. Low is sharp, high is a soft haze. Open a light or the thermostat to see it.', 'Wie weich das Licht um Regler und Schieber ist. Niedrig ist scharf, hoch ein weicher Schimmer. Öffne ein Licht oder das Thermostat, um es zu sehen.') },
    { id: 'dl_strength', tab: 'appearance', group: DIALS, type: 'slider', path: 'thermo.glowOpacity', min: 0, max: 100, step: 1, unit: '%', label: yes('Glow', 'Glühen'), desc: yes('How bright the light around dials and sliders is. 0 turns it off.', 'Wie hell das Licht um Regler und Schieber ist. 0 schaltet es aus.') },
    { id: 'dl_ticks', tab: 'appearance', group: DIALS, type: 'slider', path: 'thermo.ticks', min: 40, max: 160, step: 5, unit: '%', label: yes('Marks', 'Striche'), desc: yes('How many small marks run around a dial. 100% is the normal look.', 'Wie viele kleine Striche um einen Regler laufen. 100 % ist der normale Look.') },
    { id: 'dl_reset', tab: 'appearance', group: DIALS, type: 'action', action: 'resetDialLook', label: yes('Reset the dial look', 'Aussehen zurücksetzen'), desc: yes('Glow and ticks back to the design. The temperature colors are not touched.', 'Glühen und Striche zurück auf den Entwurf. Die Temperaturfarben bleiben.') },
    { id: 'g_gray', tab: 'appearance', page: 'bg', group: yes('Background', 'Hintergrund'), type: 'slider', path: 'glass.grayscale', min: 0, max: 100, step: 5, unit: '%', label: yes('Black & White', 'Schwarz-Weiß'), desc: yes('Drain colour from the glass backdrop', 'Farbe aus dem Glas-Hintergrund nehmen') },
    { id: 'g_look', tab: 'appearance', page: 'glass', group: yes('Pick a look', 'Look wählen'), type: 'looks', label: yes('Look', 'Look'), desc: yes('iOS 26 is the look of Apple\'s Liquid Glass. Pick one, then fine-tune below. You see it change on the menu bar, the search bar and this window.', 'iOS 26 ist der Look von Apples Liquid Glass. Eines wählen, unten feinjustieren. Du siehst es an der Menüleiste, der Suchleiste und diesem Fenster.'),
      options: [{ id: 'ios26', label: yes('iOS 26', 'iOS 26') }, { id: 'clear', label: yes('Clear', 'Klar') }, { id: 'frosted', label: yes('Frosted', 'Milchig') }, { id: 'smoky', label: yes('Smoky', 'Rauchig') }, { id: 'midnight', label: yes('Midnight', 'Mitternacht') }, { id: 'mist', label: yes('Mist', 'Dunst') }] },
    { id: 'g_tint', preview: 'panels', tab: 'appearance', page: 'glass', group: yes('Menu bar, search bar and windows', 'Menüleiste, Suchleiste und Fenster'), type: 'slider', path: 'glass.tint', min: 0, max: 80, step: 2, unit: '%', label: yes('Darkness', 'Dunkelheit'), desc: yes('How dark they are. Low shows the picture behind, high is calm and dark.', 'Wie dunkel sie sind. Niedrig zeigt das Bild dahinter, hoch ist ruhig und dunkel.') },
    { id: 'g_blur', preview: 'panels', tab: 'appearance', page: 'glass', group: yes('Menu bar, search bar and windows', 'Menüleiste, Suchleiste und Fenster'), type: 'slider', path: 'glass.blur', min: 0, max: 80, step: 2, unit: 'px', label: yes('Blurriness', 'Unschärfe'), desc: yes('How blurry they are. 0 is clear glass, more hides what is behind. This window shows it as you slide.', 'Wie unscharf sie sind. 0 ist klares Glas, mehr verbirgt, was dahinter ist. Dieses Fenster zeigt es beim Schieben.') },
    { id: 'g_cstyle', preview: 'cards', tab: 'appearance', page: 'glass', group: yes('Cards (home screen and rooms)', 'Karten (Startseite und Räume)'), type: 'inlineseg', path: 'glass.cardStyle', label: yes('Color', 'Farbe'), desc: yes('White frosted glass, or smoky dark glass. This window shows it while you change it.', 'Weißes Milchglas oder dunkles Rauchglas. Dieses Fenster zeigt es, während du es änderst.'),
      options: [{ id: 'light', label: yes('White', 'Weiß') }, { id: 'dark', label: yes('Smoky', 'Rauchig') }] },
    { id: 'g_cblur', preview: 'cards', tab: 'appearance', page: 'glass', group: yes('Cards (home screen and rooms)', 'Karten (Startseite und Räume)'), type: 'slider', path: 'glass.cardBlur', min: 0, max: 60, step: 2, unit: 'px', label: yes('Blurriness', 'Unschärfe'), desc: yes('How blurry the glass behind the cards is. 0 is see-through. While you slide, this window wears the card glass so you can see it.', 'Wie unscharf das Glas hinter den Karten ist. 0 ist durchsichtig. Beim Schieben trägt dieses Fenster das Kartenglas, damit du es siehst.') },
    { id: 'g_ctint', preview: 'cards', tab: 'appearance', page: 'glass', group: yes('Cards (home screen and rooms)', 'Karten (Startseite und Räume)'), type: 'slider', path: 'glass.cardTint', min: 0, max: 40, step: 1, unit: '%', label: yes('Strength', 'Stärke'), desc: yes('How strong the white or smoky color of the cards is.', 'Wie kräftig die weiße oder rauchige Farbe der Karten ist.') },
    { id: 'g_cedge', preview: 'cards', tab: 'appearance', page: 'glass', group: yes('Cards (home screen and rooms)', 'Karten (Startseite und Räume)'), type: 'slider', path: 'glass.cardEdge', min: 0, max: 60, step: 2, unit: '%', label: yes('Edge', 'Rand'), desc: yes('A thin light line around the cards. 0 turns it off.', 'Eine dünne helle Linie um die Karten. 0 schaltet sie aus.') },
    { id: 'wallpaper', tab: 'appearance', page: 'wallpaper', group: yes('Settings', 'Einstellungen'), type: 'wallpaper', path: 'wallpaper', label: yes('Custom wallpaper', 'Eigener Hintergrund'), desc: yes('Use any image as the card background, or pick one from your media folder.', 'Ein beliebiges Bild als Hintergrund, oder eines aus dem Medienordner wählen.') },
    { id: 'wallpaper_view', tab: 'appearance', page: 'wallpaper', group: yes('Settings', 'Einstellungen'), type: 'toggle', path: 'wallpaperView', label: yes('Cover the whole view', 'Ganze Ansicht bedecken'), desc: yes('Also paint the picture behind the header and sidebar, not only inside the card. Needs a panel view.', 'Das Bild auch hinter Kopfzeile und Seitenleiste zeigen, nicht nur in der Karte. Braucht eine Panel-Ansicht.') },
    { id: 'qc', tab: 'appearance', page: 'quick', group: yes('Settings', 'Einstellungen'), type: 'toggle', path: 'quickEnabled', label: yes('Enable quick control', 'Schnellsteuerung aktivieren'), desc: yes('The device icon is the switch: tap safe devices, hold risky ones.', 'Das Geräte-Icon ist der Schalter: sichere Geräte antippen, riskante halten.') },
    { id: 'qcdomains', tab: 'appearance', page: 'quick', group: yes('Device types', 'Gerätetypen'), type: 'quick', path: 'quickControl', label: yes('Per device type', 'Pro Gerätetyp'), desc: yes('Off, tap or hold for lights, switches, fans, covers, locks and more.', 'Aus, Tippen oder Halten für Lichter, Schalter, Ventilatoren, Rollos, Schlösser und mehr.') },
    { id: 'f_btn', tab: 'appearance', page: 'filters', group: yes('Filter', 'Filter'), type: 'toggle', path: 'search.filterButton', label: yes('Filter', 'Filter'), desc: yes('Show the filter button in the search field at all', 'Den Filter-Knopf im Suchfeld überhaupt zeigen') },
    { id: 'f_chips', tab: 'appearance', page: 'filters', group: yes('Toolbar filters', 'Filter in der Leiste'), type: 'toggle', path: 'search.chips', label: yes('By categories', 'Nach Kategorien'), desc: yes('The chip row of categories above the results', 'Die Chip-Reihe mit Kategorien über den Ergebnissen') },
    { id: 'f_count', tab: 'appearance', page: 'filters', group: yes('Toolbar filters', 'Filter in der Leiste'), type: 'toggle', path: 'search.count', label: yes('Show active count', 'Aktive Anzahl zeigen'), desc: yes('Badge with the number of devices that are on per chip (e.g. "Lights 4")', 'Zähler mit der Zahl der eingeschalteten Geräte pro Chip (z. B. "Lichter 4")') },
    { id: 'f_time', tab: 'appearance', page: 'filters', group: yes('Sort by time', 'Nach Zeit sortieren'), type: 'toggle', path: 'search.timeSort', label: yes('Sort by time', 'Nach Zeit sortieren'), desc: yes('"Recent" in the filter popup — groups devices by recent activity', '"Zuletzt" im Filter-Fenster — gruppiert Geräte nach letzter Aktivität') },
    { id: 'f_recent', tab: 'appearance', page: 'filters', group: yes('Sort by time', 'Nach Zeit sortieren'), type: 'segment', path: 'search.recent', label: yes('Time windows', 'Zeitfenster'), desc: yes('How "Recent" groups its results', 'Wie "Zuletzt" seine Ergebnisse gruppiert'),
      options: [{ id: 'fine', label: yes('Fine', 'Fein'), desc: yes('5 min · 15 min · 30 min · 1 h', '5 Min · 15 Min · 30 Min · 1 Std') }, { id: 'standard', label: yes('Standard', 'Standard'), desc: yes('15 min · 1 h · Today', '15 Min · 1 Std · Heute') }, { id: 'coarse', label: yes('Coarse', 'Grob'), desc: yes('1 h · 6 h · 12 h', '1 Std · 6 Std · 12 Std') }] },
    { id: 'v_on', tab: 'appearance', page: 'videos', group: yes('Settings', 'Einstellungen'), type: 'toggle', path: 'videos.enabled', label: yes('Enable videos', 'Videos aktivieren'), desc: yes('Show background videos in detail view', 'Hintergrund-Videos in der Detailansicht zeigen') },
    { id: 'v_mobile', tab: 'appearance', page: 'videos', group: yes('Settings', 'Einstellungen'), type: 'toggle', path: 'videos.mobile', label: yes('On mobile devices', 'Auf Mobilgeräten'), desc: yes('Also show videos on smartphones/tablets', 'Videos auch auf Smartphones/Tablets zeigen') },
    { id: 'videopath', tab: 'appearance', page: 'videos', group: yes('Video folder', 'Video-Ordner'), type: 'text', path: 'videos.path', placeholder: '/local/fast-search-videos', label: yes('Video folder', 'Video-Ordner'), desc: yes('Folder with your clips, for example /local/fast-search-videos (light_on.mp4, default_1.mp4 …)', 'Ordner mit deinen Clips, z. B. /local/fast-search-videos (light_on.mp4, default_1.mp4 …)') },

    // ---- Filter ----
    { id: 'lim_max', tab: 'filter', group: yes('Limits', 'Grenzen'), type: 'number', path: 'limits.max', min: 0, max: 5000, label: yes('Maximum number of entities', 'Höchstzahl an Entitäten'), desc: yes('Unlimited entities load (0 = Unlimited)', 'Unbegrenzt viele Entitäten laden (0 = unbegrenzt)') },
    { id: 'lim_area', tab: 'filter', group: yes('Limits', 'Grenzen'), type: 'toggle', path: 'limits.areaOnly', label: yes('Load only entities with area', 'Nur Entitäten mit Raum laden'), desc: yes('Filters out entities without area assignment', 'Entfernt Entitäten ohne Raumzuordnung') },
    { id: 'lim_unavail', tab: 'filter', group: yes('Limits', 'Grenzen'), type: 'toggle', path: 'limits.hideUnavailable', label: yes('Hide unavailable entities', 'Nicht verfügbare Entitäten ausblenden'), desc: yes('Entities that report unavailable or unknown stay out of search, suggestions and the live island', 'Entitäten, die nicht verfügbar oder unbekannt sind, bleiben aus Suche, Vorschlägen und der Insel heraus') },
    { id: 'v_hidden', tab: 'filter', group: yes('Visibility', 'Sichtbarkeit'), type: 'toggle', path: 'visibility.hidden', invert: true, label: yes('Hide hidden entities', 'Versteckte Entitäten ausblenden'), desc: yes('Do not show entities that are hidden in Home Assistant (visibility off) on the card', 'Entitäten, die in Home Assistant versteckt sind, nicht auf der Karte zeigen') },
    { id: 'v_diag', tab: 'filter', group: yes('Visibility', 'Sichtbarkeit'), type: 'toggle', paths: ['visibility.diagnostic', 'visibility.disabled'], invert: true, label: yes('Hide diagnostic & disabled entities', 'Diagnose- & deaktivierte Entitäten ausblenden'), desc: yes('Do not show diagnostic/config and HA-disabled entities on the card', 'Diagnose-/Konfigurations- und in HA deaktivierte Entitäten nicht auf der Karte zeigen') },
    { id: 'excluded', tab: 'filter', group: yes('Excluded patterns', 'Ausschlussmuster'), type: 'excluded', path: 'excluded', label: yes('Excluded patterns', 'Ausschlussmuster'), desc: yes('Wildcards like sensor.*_battery with a live preview, a template library and JSON import and export.', 'Platzhalter wie sensor.*_battery mit Live-Vorschau, Vorlagen und JSON-Import und -Export.') },

    // ---- About ----
    { id: 'a_version', tab: 'about', group: yes('About Okie Motor', 'Über den Okie Motor'), type: 'info', label: yes('Version', 'Version'), desc: yes('This tab runs the installed version', 'Dieser Tab läuft mit der installierten Version'), info: 'version' },
    { id: 'a_layout', tab: 'about', group: yes('About Okie Motor', 'Über den Okie Motor'), type: 'info', label: yes('Thermostat layout', 'Thermostat-Layout'), desc: yes('The sizes the thermostat measured (for a bug report): window, card, dial, wheel', 'Die Größen, die das Thermostat gemessen hat (für eine Fehlermeldung): Fenster, Karte, Rad'), info: 'layout' },
    { id: 'a_diag', tab: 'about', group: yes('About Okie Motor', 'Über den Okie Motor'), type: 'info', label: yes('Diagnostics', 'Diagnose'), desc: yes('What this screen and browser measure. Send a screenshot of it with a bug report.', 'Was dieser Bildschirm und Browser messen. Schick einen Screenshot davon mit einer Fehlermeldung.'), info: 'diag' },
    { id: 'a_build', tab: 'about', group: yes('About Okie Motor', 'Über den Okie Motor'), type: 'info', label: yes('Build', 'Build'), desc: yes('Build stamp of the bundle', 'Build-Stempel des Bundles'), info: 'build' },
    { id: 'a_base', tab: 'about', group: yes('About Okie Motor', 'Über den Okie Motor'), type: 'info', label: yes('Built on', 'Aufgebaut auf'), desc: yes('Thank you to fastender (Fast Search Card, the design this card comes from) and willsanderson (Hemma, the framework it was first made for). Without them it would not exist.', 'Danke an fastender (Fast Search Card, das Design, von dem diese Karte kommt) und willsanderson (Hemma, das Gerüst, für das sie zuerst gebaut wurde). Ohne sie gäbe es sie nicht.'), info: 'Fast Search Card · Hemma' },
    { id: 'a_shapes', tab: 'about', group: yes('About Okie Motor', 'Über den Okie Motor'), type: 'info', label: yes('Card shapes', 'Kartenformen'), desc: yes('Where the squircle curves come from', 'Woher die Squircle-Kurven kommen'), info: 'Fast Search Card · GPL-3.0' },
    { id: 'b_sync', tab: 'about', group: yes('Backup & sync', 'Sicherung & Abgleich'), type: 'toggle', path: 'sync.enabled', label: yes('Same settings on every screen', 'Gleiche Einstellungen auf jedem Bildschirm'), desc: yes('Favorites, rooms, design and everything you set are kept in Home Assistant for your user, so the browser, the phone app and the wall tablet show the same. The size of the card stays per screen.', 'Favoriten, Räume, Design und alles, was du einstellst, liegen in Home Assistant bei deinem Benutzer: Browser, Handy-App und Wand-Tablet zeigen dasselbe. Die Größe der Karte bleibt pro Bildschirm.') },
    { id: 'b_export', tab: 'about', group: yes('Backup & sync', 'Sicherung & Abgleich'), type: 'action', action: 'exportSettings', label: yes('Export settings', 'Einstellungen exportieren'), desc: yes('Save all your settings, favorites and arrangement as a file', 'Alle Einstellungen, Favoriten und die Anordnung als Datei sichern') },
    { id: 'b_import', tab: 'about', group: yes('Backup & sync', 'Sicherung & Abgleich'), type: 'action', action: 'importSettings', label: yes('Import settings', 'Einstellungen importieren'), desc: yes('Load a file you exported before: it replaces the settings of this card (also in another Home Assistant)', 'Eine zuvor exportierte Datei laden: sie ersetzt die Einstellungen dieser Karte (auch in einem anderen Home Assistant)') },
    { id: 'a_cache', tab: 'about', group: yes('Privacy & security', 'Datenschutz & Sicherheit'), type: 'action', label: yes('Clear Cache', 'Cache leeren'), desc: yes('Forget cached searches, forecasts and probed video files. Nothing you set is lost.', 'Zwischengespeicherte Suchen, Vorhersagen und geprüfte Videodateien vergessen. Nichts von deinen Einstellungen geht verloren.'), action: 'clearCache' },
    { id: 'a_reset', tab: 'about', group: yes('Privacy & security', 'Datenschutz & Sicherheit'), type: 'action', label: yes('Reset Data', 'Daten zurücksetzen'), desc: yes('Back to the defaults: settings, favorites, what the card learned and what you read.', 'Zurück auf die Standardwerte: Einstellungen, Favoriten, Gelerntes und Gelesenes.'), action: 'resetAll', danger: true },
  ];

  /** Every row the UI knows: built-in plus the ones modules contributed, with module rows placed on their sub-page. */
  function allRows(extra) {
    return ROWS.concat((extra || []).map(function (r) {
      if (r.page || r.onTab) return r;                          // onTab: the row sits on its tab itself, not on the group's sub-page
      var pg = PAGE_OF_GROUP[pick(r.group, 'en')];
      return pg ? Object.assign({}, r, { page: pg }) : r;
    }));
  }

  var api = { getPath: getPath, setPartial: setPartial, rowMatches: rowMatches, changedRows: changedRows, pick: pick, pathsOf: pathsOf, toggleValue: toggleValue, togglePartial: togglePartial, allRows: allRows, ROWS: ROWS, PAGES: PAGES, PAGE_OF_GROUP: PAGE_OF_GROUP, INFO: INFO };
  if (isNode) { module.exports = api; return; }
  if (typeof document === 'undefined') return;

  // ------------------------------------------------------------- UI ----
  var UI = g.OkieMotor.ui, L = g.OkieMotor.logic, CT = g.OkieMotor.controls, core = g.OkieMotor.core;
  var h = UI.h;
  g.OkieMotor.settingsRows = g.OkieMotor.settingsRows || [];

  core.registerStrings('en', {
    'app.settings': 'Settings', 's.search': 'Search settings', 's.changed': 'Changed', 's.tab.general': 'General', 's.tab.appearance': 'Appearance', 's.tab.filter': 'Filter', 's.tab.about': 'About',
    's.none': 'No settings match.', 's.nochange': 'Nothing differs from the defaults.', 's.reset': 'Reset', 's.reset_default': 'Back to the default (double-tap the slider does the same)', 's.done': 'Done', 's.back': 'Back', 's.auto': 'Automatic', 's.nothing': 'None', 's.selected': '{n} selected',
    's.confirm_reset_learning': 'This forgets what the card learned about your habits.', 's.confirm_reset_all': 'This puts every setting back to its default and forgets favorites, learned habits and what you read.',
    's.add': 'Add', 's.pattern': 'e.g. sensor.*_battery', 's.matches': '{n} match', 's.matches_n': '{n} matches', 's.import': 'Import', 's.export': 'Export', 's.templates': 'Templates', 's.invalid': 'That file is not a pattern list.',
    's.gallery': 'Gallery', 's.clear': 'Clear', 's.pick_image': 'Pick an image', 's.no_media': 'No images found in the media folder.', 's.url': 'Image address', 's.cache_cleared': 'Cache cleared', 's.filter_ent': 'Filter entities', 's.move_up': 'Move up', 's.move_down': 'Move down',
    's.info': 'More about {t}', 's.off': 'Off', 's.tap': 'Tap', 's.hold': 'Hold',
  });
  core.registerStrings('de', {
    'app.settings': 'Einstellungen', 's.search': 'Einstellungen durchsuchen', 's.changed': 'Geändert', 's.tab.general': 'Allgemein', 's.tab.appearance': 'Darstellung', 's.tab.filter': 'Filter', 's.tab.about': 'Info',
    's.none': 'Keine Einstellung gefunden.', 's.nochange': 'Nichts weicht von den Standardwerten ab.', 's.reset': 'Zurücksetzen', 's.reset_default': 'Zurück zum Standard (Regler doppelt antippen geht auch)', 's.done': 'Fertig', 's.back': 'Zurück', 's.auto': 'Automatisch', 's.nothing': 'Keins', 's.selected': '{n} gewählt',
    's.confirm_reset_learning': 'Die Karte vergisst, was sie über deine Gewohnheiten gelernt hat.', 's.confirm_reset_all': 'Das setzt jede Einstellung auf den Standard zurück und vergisst Favoriten, Gelerntes und Gelesenes.',
    's.add': 'Hinzufügen', 's.pattern': 'z. B. sensor.*_battery', 's.matches': '{n} Treffer', 's.matches_n': '{n} Treffer', 's.import': 'Importieren', 's.export': 'Exportieren', 's.templates': 'Vorlagen', 's.invalid': 'Diese Datei ist keine Musterliste.',
    's.gallery': 'Galerie', 's.clear': 'Entfernen', 's.pick_image': 'Bild wählen', 's.no_media': 'Keine Bilder im Medienordner gefunden.', 's.url': 'Bildadresse', 's.cache_cleared': 'Cache geleert', 's.filter_ent': 'Entitäten filtern', 's.move_up': 'Nach oben', 's.move_down': 'Nach unten',
    's.info': 'Mehr zu {t}', 's.off': 'Aus', 's.tap': 'Tippen', 's.hold': 'Halten',
  });

  function rows() { return allRows(g.OkieMotor.settingsRows); }

  function render(container, ctx) {
    var lang = function () { return ctx.lang(); };
    var t = function (k, v) { return core.t(k, lang(), v); };
    var P = function (v) { return pick(v, lang()); };
    var showChanged = false, query = '', tab = 'general', stack = [], flashId = null, body = null, shell = null, navs = [];

    var search = h('input.ios-search-in', { type: 'search', placeholder: t('s.search'), 'aria-label': t('s.search'), autocomplete: 'off', spellcheck: false });
    var badge = h('span.ios-badge', { hidden: true });
    var changedBtn = h('button.ios-changed', { 'aria-pressed': 'false', onclick: function () { showChanged = !showChanged; changedBtn.classList.toggle('on', showChanged); changedBtn.setAttribute('aria-pressed', showChanged ? 'true' : 'false'); draw(); } }, h('span', null, t('s.changed')), badge);
    var header = h('div.ios-head', null, h('div.ios-search', null, h('span', { html: UI.icon('search', 16) }), search), changedBtn);
    var TAB_ICON = { general: 'sliders', appearance: 'scene', filter: 'filter', about: 'info' };
    var tabsDef = ['general', 'appearance', 'filter', 'about'].map(function (id) { return { id: id, label: t('s.tab.' + id), icon: TAB_ICON[id] }; });
    shell = g.OkieMotor.appshell.create(container, ctx, {
      id: 'settings', title: t('app.settings'), subtitle: '', icon: 'gear', gradient: ['#20242c', '#3c4656'], header: header, tabs: tabsDef,
      onTab: function (id, b) { body = b; tab = id || 'general'; if (!stack.length) draw(); },
    });
    body = shell.body;

    // --------------------------------------------------- state helpers ----
    function settings() { return ctx.settings.get(); }
    function save(row, v) { ctx.settings.set(setPartial(row.path, v)); refresh(); }
    function optionLabel(row, id) { var o = (row.options || []).filter(function (x) { return String(x.id) === String(id); })[0]; return o ? P(o.label) : ''; }
    function valueText(row) {
      var v = row.path ? (row.read ? row.read(settings()) : getPath(settings(), row.path)) : null;
      switch (row.type) {
        case 'segment': return optionLabel(row, v);
        case 'multi': return t('s.selected', { n: (v || []).length });
        case 'text': case 'entity': case 'number': return v === '' || v == null ? (row.type === 'entity' ? t('s.auto') : t('s.nothing')) : (row.type === 'entity' ? friendly(v) : String(v));
        case 'sidebar': return '';
        case 'wallpaper': return v ? t('s.selected', { n: 1 }) : t('s.nothing');
        default: return '';
      }
    }
    function friendly(id) { var st = ctx.state(id); return (st && st.attributes && st.attributes.friendly_name) || id; }
    function pageValue(page) {
      var v = page.value;
      if (!v) return '';
      if (typeof v === 'string') {
        if (v.indexOf('changed:') === 0) { var p = v.slice(8); return ctx.settings.changed().some(function (c) { return c === p || c.indexOf(p + '.') === 0; }) ? (lang() === 'de' ? 'Angepasst' : 'Customized') : 'Standard'; }
        return '';
      }
      var cur = getPath(settings(), v.path);
      return (v.truthy ? !!cur : cur !== false) ? P(v.on) : P(v.off);
    }

    // ------------------------------------------------------- primitives ----
    function glassSwitch(on, label, onToggle) {
      var sw = h('button.ios-switch' + (on ? '.on' : ''), { role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-label': label }, h('span.dot'));
      sw.addEventListener('click', function (e) { e.stopPropagation(); var nv = !(sw.getAttribute('aria-checked') === 'true'); sw.classList.toggle('on', nv); sw.setAttribute('aria-checked', nv ? 'true' : 'false'); if (ctx.haptic) ctx.haptic(8); onToggle(nv); });
      return sw;
    }
    function itemBase(row, right, extraCls, onClick) {
      var left = h('div.ios-item-left', null, h('div.ios-item-content', null, h('div.ios-item-label', null, P(row.label)), row.desc ? h('div.ios-item-subtitle', null, P(row.desc)) : null));
      var it = h('div.ios-item' + (onClick ? '.ios-item-clickable' : '') + (extraCls || ''), { dataset: { row: row.id }, role: onClick ? 'button' : null, tabindex: onClick ? '0' : null }, left, h('div.ios-item-right', null, right));
      if (onClick) { it.addEventListener('click', onClick); it.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }); }
      return it;
    }
    function chevron() { return h('span.ios-chevron', { html: UI.icon('chevron', 16) }); }
    function navItem(row, valueFn, open) {
      var val = h('span.ios-item-value', null, valueFn());
      var it = itemBase(row, [val, chevron()], '', open);
      it._val = val; it._valueFn = valueFn;
      navs.push(it);
      return it;
    }

    function toggleItem(row) {
      var on = toggleValue(row, settings());
      return itemBase(row, glassSwitch(on, P(row.label), function (nv) { ctx.settings.set(togglePartial(row, nv)); refresh(); }));
    }
    function sliderCard(row) {
      var phone = !!(ctx.host && ctx.host._mobile), lo = phone && row.mobileMin != null ? row.mobileMin : row.min, hi = phone && row.mobileMax != null ? row.mobileMax : row.max;
      var unit = row.unit || '', def = ctx.settings.defaultOf(row.path);
      function inRange(v) { return Math.min(hi, Math.max(lo, v)); }
      var val = inRange(getPath(settings(), row.path));
      var out = h('span.slider-value', null, val + unit);
      var rst = h('button.slider-reset', { type: 'button', hidden: true, 'aria-label': t('s.reset_default'), title: t('s.reset_default'), html: UI.icon('refresh', 13), onclick: function (e) { e.stopPropagation(); back(); } });
      function sync(v) { rst.hidden = def == null || Number(v) === Number(def); }
      // double-tap the slider (or tap the arrow that shows once it differs): back to the value the card ships with
      function back() {
        ctx.settings.reset(row.path);
        var v = inRange(getPath(settings(), row.path));
        sl.set(v); out.textContent = v + unit; sync(v);
        out.classList.remove('flash'); void out.offsetWidth; out.classList.add('flash');
        if (ctx.haptic) ctx.haptic(12);
        refresh();
      }
      var sl = CT.createSlider({ min: lo, max: hi, step: row.step, value: val, ariaLabel: P(row.label), color: '#fff', onDoubleTap: back,
        onInput: function (v) { out.textContent = v + unit; sync(v); markPreview(row.preview); if (row.commit !== 'release') ctx.settings.set(setPartial(row.path, v)); }, onChange: function (v) { markPreview(row.preview); save(row, v); sync(v); } });
      sync(val);
      return h('div.ios-item.ios-slider', { dataset: { row: row.id } },
        h('div.ios-slider-top', null, h('div.ios-item-content', null, h('div.ios-item-label', null, P(row.label)), row.desc ? h('div.ios-item-subtitle', null, P(row.desc)) : null), h('span.slider-end', null, rst, out)), sl.el);
    }
    // The three starting points of Liquid glass: each sets the five numbers at once. The chip that matches the numbers shows as chosen; after a fine-tune none does.
    var LOOKS = {
      ios26:    { tint: 14, blur: 28, cardBlur: 40, cardTint: 16, cardStyle: 'light', cardEdge: 34 },      // Apple's Liquid Glass: bright, see-through, a lit rim
      clear:    { tint: 24, blur: 12, cardBlur: 0,  cardTint: 8,  cardStyle: 'light', cardEdge: 14 },
      frosted:  { tint: 45, blur: 24, cardBlur: 28, cardTint: 18, cardStyle: 'light', cardEdge: 14 },
      smoky:    { tint: 76, blur: 20, cardBlur: 60, cardTint: 21, cardStyle: 'dark',  cardEdge: 14 },
      midnight: { tint: 80, blur: 36, cardBlur: 36, cardTint: 30, cardStyle: 'dark',  cardEdge: 8 },
      mist:     { tint: 30, blur: 48, cardBlur: 60, cardTint: 30, cardStyle: 'light', cardEdge: 20 },
    };
    function currentLook() {
      var gl = settings().glass || {};
      return Object.keys(LOOKS).filter(function (k) { return Object.keys(LOOKS[k]).every(function (p) { return gl[p] === LOOKS[k][p]; }); })[0] || null;
    }
    function segmentRow(row, current, onPick) {
      var seg = CT.createSegment({ options: (row.options || []).map(function (o) { return { id: o.id, label: P(o.label) }; }), value: current, ariaLabel: P(row.label), onChange: function (id) { if (ctx.haptic) ctx.haptic(8); onPick(id); } });
      return h('div.ios-item.ios-seg', { dataset: { row: row.id } }, h('div.ios-item-content', null, h('div.ios-item-label', null, P(row.label)), row.desc ? h('div.ios-item-subtitle', null, P(row.desc)) : null), seg.el);
    }
    function looksItem(row) {
      var sw = { ios26: 'rgba(255,255,255,.75)', clear: 'rgba(255,255,255,.3)', frosted: 'rgba(236,236,236,.92)', smoky: '#3a3633', midnight: '#15171d', mist: '#cdd2d8' };
      var chips = CT.createChips({ options: (row.options || []).map(function (o) { return { id: o.id, label: P(o.label), swatch: sw[o.id] }; }), value: currentLook(), onChange: function (id) { if (ctx.haptic) ctx.haptic(8); ctx.settings.set({ glass: LOOKS[id] }); refresh(); } });
      return h('div.ios-item.ios-seg', { dataset: { row: row.id } }, h('div.ios-item-content', null, h('div.ios-item-label', null, P(row.label)), row.desc ? h('div.ios-item-subtitle', null, P(row.desc)) : null), chips.el);
    }
    function inlineSegItem(row) { return segmentRow(row, getPath(settings(), row.path), function (id) { markPreview(row.preview); ctx.settings.set(setPartial(row.path, id)); refresh(); }); }
    function actionItem(row) {
      var it = itemBase(row, null, row.danger ? '.danger' : '', function () { runAction(row); });
      return it;
    }
    function infoItem(row) {
      if (row.info === 'diag') return h('div.ios-item.ios-diag', null, h('div.ios-item-content', null, h('div.ios-item-label', null, P(row.label)), h('div.ios-item-subtitle', null, P(row.desc))), h('pre.diag-pre', null, g.OkieMotor.diagInfo ? g.OkieMotor.diagInfo(ctx.host) : '-'));
      var v = row.info === 'version' ? 'v' + (g.OkieMotor.version || 'dev') : (row.info === 'build' ? String(g.OkieMotor.build || '–') : (row.info === 'layout' ? (g.OkieMotor.layoutInfo ? g.OkieMotor.layoutInfo() : '–') : row.info));
      return itemBase(row, h('span.ios-item-value', null, v));
    }
    function runAction(row) {
      if (row.action === 'resetLearning') {
        ctx.sheet({ title: P(row.label), content: function (close) { return h('div', null, h('p', null, t('s.confirm_reset_learning')), h('div.actrow', null, h('button.act', { onclick: close }, t('card.close')), h('button.act.danger', { onclick: function () { ctx.engine.resetLearning(); ctx.toast('success', t('s.done')); close(); } }, t('s.reset')))); } });
      } else if (row.action === 'resetAll') {
        ctx.sheet({ title: P(row.label), content: function (close) { return h('div', null, h('p', null, t('s.confirm_reset_all')), h('div.actrow', null, h('button.act', { onclick: close }, t('card.close')), h('button.act.danger', { onclick: function () { ctx.settings.reset(); ctx.engine.resetLearning(); ctx.store.set('news.read', []); ctx.toast('success', t('s.done')); close(); refresh(); draw(); } }, t('s.reset')))); } });
      } else if (row.action === 'resetDialLook') {
        ['glowBlur', 'glowSpread', 'glowOpacity', 'ticks'].forEach(function (k) { ctx.settings.reset('thermo.' + k); });
        ctx.toast('success', P(yes('Dial look reset', 'Aussehen zurückgesetzt'))); refresh();
      } else if (row.action === 'exportSettings') {
        if (g.OkieMotor.sync) g.OkieMotor.sync.exportNow(ctx);
      } else if (row.action === 'importSettings') {
        if (g.OkieMotor.sync) g.OkieMotor.sync.importFlow(ctx);
      } else if (row.action === 'clearCache') {
        ctx.engine.setSpeed(settings().learning); ctx.bus.emit('clear-cache'); ctx.toast('success', t('s.cache_cleared'));
      }
    }

    function section(titleText, items, infoKey) {
      var infoText = infoKey && INFO[infoKey] ? P(INFO[infoKey]) : '';
      var hd = null, note = null;
      if (titleText) {
        hd = h('div.ios-section-header' + (infoText ? '.ios-section-header--info' : ''), null, h('span', null, titleText));
        if (infoText) {
          note = h('div.ios-text', { hidden: true }, infoText);
          hd.appendChild(h('button.ios-info-btn', { 'aria-label': t('s.info', { t: titleText }), 'aria-expanded': 'false', html: UI.icon('info', 15), onclick: function () { note.hidden = !note.hidden; this.setAttribute('aria-expanded', note.hidden ? 'false' : 'true'); } }));
        }
      }
      var card = h('div.ios-card');
      items.forEach(function (it, i) { if (i) card.appendChild(h('div.ios-divider')); card.appendChild(it); });
      return h('div.ios-section', null, hd, note, card);
    }

    // --------------------------------------------------------- item(row) ----
    function item(row) {
      switch (row.type) {
        case 'toggle': return toggleItem(row);
        case 'slider': return sliderCard(row);
        case 'looks': return looksItem(row);
        case 'inlineseg': return inlineSegItem(row);
        case 'action': return actionItem(row);
        case 'info': return infoItem(row);
        case 'lightmodes': return navItem(row, function () { var LM = g.OkieMotor.lightModes; return LM ? core.t('lm.count', ctx.lang(), { n: LM.modesNow(ctx).length }) : ''; }, function () { openRowPage(row); });
        default: return navItem(row, function () { return valueText(row); }, function () { openRowPage(row); });
      }
    }
    function pageItem(id) {
      var pg = PAGES[id];
      var row = { id: 'page:' + id, label: pg.label, desc: pg.desc };
      return navItem(row, function () { return pageValue(pg); }, function () { openPage(id); });
    }

    // ----------------------------------------------------------- pages ----
    // While Liquid glass is open the window itself is the preview: it wears the glass of what you are changing (the menu, search bar and windows, or the cards)
    var previewMode = 'panels';
    function markPreview(mode) { if (!mode || mode === previewMode) return; previewMode = mode; applyPreview(); }
    function applyPreview() {
      var top = stack[stack.length - 1], st = ctx.stage; if (!st || !st.dataset) return;
      if (top && top.glass) st.dataset.glassedit = previewMode; else delete st.dataset.glassedit;
    }
    function push(spec) { stack.push(spec); renderStack(1); }
    function pop() { if (!stack.length) return; stack.pop(); renderStack(-1); }
    function renderStack(dir) {
      body.innerHTML = ''; navs.length = 0; body.scrollTop = 0;
      var top = stack[stack.length - 1]; applyPreview();
      if (shell) shell.bar.style.display = top ? 'none' : '';
      header.style.display = top ? 'none' : '';
      if (top) {
        body.appendChild(h('div.ios-nav', null, h('button.ios-back', { onclick: pop }, h('span', { html: UI.icon('chevleft', 18) }), h('span', null, t('s.back'))), h('div.ios-title', null, top.title)));
        top.build(body);
      } else draw();
      if (shell) shell.refreshScroll();
      if (dir && body.animate && !(g.matchMedia && g.matchMedia('(prefers-reduced-motion: reduce)').matches)) {
        body.animate([{ opacity: 0, transform: 'translateX(' + (dir > 0 ? 28 : -28) + 'px)' }, { opacity: 1, transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.32,.72,0,1)' });
      }
      if (flashId) { var f = flashId; flashId = null; requestAnimationFrame(function () { var el = body.querySelector('[data-row="' + f + '"]'); if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1600); } }); }
    }

    function groupRows(list) {
      var order = [], map = {};
      list.forEach(function (r) { var k = P(r.group) || ''; if (!map[k]) { map[k] = { title: k, key: pick(r.group, 'en'), rows: [] }; order.push(k); } map[k].rows.push(r); });
      return order.map(function (k) { return map[k]; });
    }
    function drawGrouped(into, list, pageEntries) {
      // pageEntries: [{group, id}] nav rows to a sub-page, placed in their group's section
      var groups = groupRows(list), byGroup = {};
      groups.forEach(function (gr) { byGroup[gr.key] = gr; });
      (pageEntries || []).forEach(function (pe) {
        var key = pick(pe.group, 'en');
        if (!byGroup[key]) { byGroup[key] = { title: P(pe.group), key: key, rows: [] }; groups.push(byGroup[key]); }
        byGroup[key].pages = (byGroup[key].pages || []).concat(pe.id);
      });
      groups.forEach(function (gr) {
        var its = [];
        gr.rows.forEach(function (r) { its.push(item(r)); });
        (gr.pages || []).forEach(function (pid) { its.push(pageItem(pid)); });
        into.appendChild(section(gr.title, its, gr.key));
      });
    }

    function tabContent(tabId, into) {
      var list = rows().filter(function (r) { return r.tab === tabId && !r.page; });
      var pages = Object.keys(PAGES).filter(function (id) { return PAGES[id].tab === tabId; }).map(function (id) { return { id: id, group: PAGES[id].group }; });
      // keep FSC's section order: modules' own groups come last
      drawGrouped(into, list, pages);
    }
    function pageContent(id, into) {
      var pg = PAGES[id];
      var list = rows().filter(function (r) { return r.page === id; });
      var links = (pg.links || []).map(function (l) { return { id: l, group: yes('', '') }; });
      var n = into.children.length;
      drawGrouped(into, list, []);
      if (links.length) { var its = links.map(function (l) { return pageItem(l.id); }); into.appendChild(section('', its)); }
      var foot = pg.foot || null;
      if (foot) into.appendChild(h('div.ios-text', null, P(foot)));
    }
    function openPage(id) { previewMode = 'panels'; push({ title: P(PAGES[id].label), glass: id === 'glass', build: function (b) { pageContent(id, b); } }); }

    function openRowPage(row) {
      var title = P(row.label);
      if (row.type === 'lightmodes') return push({ title: title, build: function (b) { if (g.OkieMotor.lightModes) g.OkieMotor.lightModes.settingsPage(ctx, b); } });
      if (row.type === 'segment') return push({ title: title, build: function (b) { optionsPage(row, b); } });
      if (row.type === 'multi') return push({ title: title, build: function (b) { multiPage(row, b); } });
      if (row.type === 'entity') return push({ title: title, build: function (b) { entityPage(row, b); } });
      if (row.type === 'text' || row.type === 'number') return push({ title: title, build: function (b) { textPage(row, b); } });
      return push({ title: title, build: function (b) { b.appendChild(h('div.ios-section', null, h('div.ios-card', null, h('div.ios-item.stack', null, control(row))))); if (row.desc) b.appendChild(h('div.ios-text', null, P(row.desc))); } });
    }
    function optionsPage(row, b) {
      var cur = row.read ? row.read(settings()) : getPath(settings(), row.path), card = h('div.ios-card');
      function draw1() {
        card.innerHTML = '';
        cur = row.read ? row.read(settings()) : getPath(settings(), row.path);
        row.options.forEach(function (o, i) {
          if (i) card.appendChild(h('div.ios-divider'));
          var sel = String(o.id) === String(cur);
          card.appendChild(h('div.ios-item.ios-item-clickable' + (sel ? '.sel' : ''), { role: 'button', tabindex: '0', onclick: function () { save(row, o.id); draw1(); } },
            h('div.ios-item-left', null, h('div.ios-item-content', null, h('div.ios-item-label', null, P(o.label)), o.desc ? h('div.ios-item-subtitle', null, P(o.desc)) : null)),
            h('div.ios-item-right', null, sel ? h('span.ios-check', { html: UI.icon('check', 18) }) : null)));
        });
      }
      draw1(); b.appendChild(h('div.ios-section', null, card));
      if (row.foot) b.appendChild(h('div.ios-text', null, P(row.foot))); else if (row.desc) b.appendChild(h('div.ios-text', null, P(row.desc)));
    }
    function multiPage(row, b) {
      var cur = (getPath(settings(), row.path) || []).slice(), its = [];
      row.options.forEach(function (o) {
        var fake = { id: row.id + ':' + o.id, label: o.label, desc: null };
        its.push(itemBase(fake, glassSwitch(cur.indexOf(o.id) >= 0, P(o.label), function (nv) { var i = cur.indexOf(o.id); if (nv && i < 0) cur.push(o.id); if (!nv && i >= 0) cur.splice(i, 1); save(row, cur.slice()); })));
      });
      b.appendChild(section('', its)); if (row.desc) b.appendChild(h('div.ios-text', null, P(row.desc)));
    }
    function entityPage(row, b) {
      var cur = getPath(settings(), row.path) || '';
      var inp = h('input.ios-input', { type: 'search', placeholder: t('s.filter_ent'), 'aria-label': t('s.filter_ent'), spellcheck: false, autocomplete: 'off' });
      var card = h('div.ios-card');
      var ids = Object.keys(ctx.hass().states).filter(function (k) { return k.indexOf(row.domain + '.') === 0; }).sort();
      function draw1() {
        card.innerHTML = '';
        var q = inp.value.trim().toLowerCase();
        var list = [{ id: '', name: t('s.auto') }].concat(ids.map(function (id) { return { id: id, name: friendly(id) }; })).filter(function (e) { return !q || e.id.toLowerCase().indexOf(q) >= 0 || e.name.toLowerCase().indexOf(q) >= 0; });
        list.slice(0, 80).forEach(function (e, i) {
          if (i) card.appendChild(h('div.ios-divider'));
          var sel = e.id === cur;
          card.appendChild(h('div.ios-item.ios-item-clickable' + (sel ? '.sel' : ''), { role: 'button', tabindex: '0', onclick: function () { cur = e.id; save(row, e.id); draw1(); } },
            h('div.ios-item-left', null, h('div.ios-item-content', null, h('div.ios-item-label', null, e.name), e.id ? h('div.ios-item-subtitle', null, e.id) : null)), h('div.ios-item-right', null, sel ? h('span.ios-check', { html: UI.icon('check', 18) }) : null)));
        });
      }
      inp.addEventListener('input', draw1);
      b.appendChild(h('div.ios-section', null, inp)); draw1(); b.appendChild(h('div.ios-section', null, card));
      if (row.desc) b.appendChild(h('div.ios-text', null, P(row.desc)));
    }
    function textPage(row, b) {
      var v = getPath(settings(), row.path);
      var inp = h('input.ios-input', { type: row.type === 'number' ? 'number' : 'text', value: v == null ? '' : String(v), placeholder: row.placeholder || '', 'aria-label': P(row.label), spellcheck: false, autocapitalize: 'off',
        onchange: function () { var nv = row.type === 'number' ? Math.max(row.min || 0, Math.min(row.max || 1e9, parseInt(inp.value, 10) || 0)) : inp.value.trim(); inp.value = String(nv); save(row, nv); } });
      b.appendChild(h('div.ios-section', null, inp)); if (row.desc) b.appendChild(h('div.ios-text', null, P(row.desc)));
    }

    // ----------------------------------------------- custom controls ----
    function control(row) {
      switch (row.type) {
        case 'sidebar': return sidebarControl(row);
        case 'quick': return quickControl(row);
        case 'wallpaper': return wallpaperControl(row);
        case 'excluded': return excludedControl(row);
        default: return h('span');
      }
    }
    function sidebarControl(row) {
      var DK = g.OkieMotor.dock, wrap = h('div.ios-sb');
      function avail() { var out = ['home']; DK.DEFAULT_ORDER.forEach(function (id) { if (id === 'home') return; if (id === 'weather' ? Object.keys(ctx.hass().states).some(function (k) { return k.indexOf('weather.') === 0; }) : g.OkieMotor.apps.get(id)) out.push(id); }); return out; }
      function label(id) { var a = g.OkieMotor.apps.get(id); return id === 'home' ? t('card.home') : (id === 'weather' ? core.t('dock.weather', lang()) : (a ? (a.nameKey ? t(a.nameKey) : a.name) : id)); }
      function draw1() {
        wrap.innerHTML = '';
        var saved = settings().sidebar.items;
        var list = DK.configurable({ available: avail(), saved: saved && saved.length ? saved.map(function (x) { return String(x).replace(/^app:/, ''); }) : null });
        list.forEach(function (it, i) {
          var r = h('div.ios-sb-row', null,
            h('span.ios-sb-ic', { html: UI.icon(DK.ICON[it.id] || 'grid', 20) }), h('span.ios-sb-t', null, label(it.id)),
            h('button.ios-mini', { 'aria-label': t('s.move_up'), disabled: i <= 0, onclick: function () { move(list, i, -1); }, html: UI.icon('chevdown', 14) }),
            h('button.ios-mini.up', { 'aria-label': t('s.move_down'), disabled: i >= list.length - 1, onclick: function () { move(list, i, 1); }, html: UI.icon('chevdown', 14) }),
            it.id === 'home' ? h('span.ios-sb-fix') : glassSwitch(it.on, label(it.id), function (nv) { it.on = nv; commit(list); }));
          wrap.appendChild(r);
        });
      }
      function move(list, i, d) { var j = i + d; if (j < 0 || j >= list.length) return; var x = list.splice(i, 1)[0]; list.splice(j, 0, x); commit(list); }
      function commit(list) { ctx.settings.set({ sidebar: { items: list.filter(function (x) { return x.on; }).map(function (x) { return x.id; }) } }); refresh(); draw1(); }
      draw1(); return wrap;
    }
    function quickControl() {
      var order = ['light', 'switch', 'fan', 'input_boolean', 'media_player', 'climate', 'vacuum', 'scene', 'script', 'cover', 'lock'];
      var wrap = h('div.s-qc');
      order.forEach(function (d) {
        var lb = (S.DOMAIN_LABELS[d] || {})[lang() === 'de' ? 'de' : 'en'] || d;
        var cur = settings().quickControl[d] || 'off';
        var seg = CT.createSegment({ options: [{ id: 'off', label: t('s.off') }, { id: 'tap', label: t('s.tap') }, { id: 'hold', label: t('s.hold') }], value: cur, ariaLabel: lb, onChange: function (v) { var o = {}; o[d] = v; ctx.settings.set({ quickControl: o }); refresh(); } });
        wrap.appendChild(h('div.s-qr', null, h('span', null, lb), seg.el));
      });
      return wrap;
    }
    function wallpaperControl(row) {
      var val = getPath(settings(), row.path);
      var inp = h('input.ios-input', { type: 'text', value: val || '', placeholder: '/local/hemma/room.jpg', 'aria-label': t('s.url'), spellcheck: false, onchange: function () { ctx.settings.set({ wallpaper: inp.value.trim() }); refresh(); } });
      var gal = h('button.act', { onclick: function () { openGallery(gal, function (url) { inp.value = url; ctx.settings.set({ wallpaper: url }); refresh(); }); } }, h('span', { html: UI.icon('image', 18) }), h('span', null, t('s.gallery')));
      var clr = h('button.act', { onclick: function () { inp.value = ''; ctx.settings.set({ wallpaper: '' }); refresh(); } }, t('s.clear'));
      return h('div.s-wp', null, inp, h('div.actrow', null, gal, clr));
    }
    function openGallery(origin, onPick) {
      ctx.sheet({ title: t('s.gallery'), origin: origin, width: 'min(640px,100%)', content: function (close) {
        var grid = h('div.gal'), crumbs = h('div.crumbs');
        function load(id) {
          grid.innerHTML = ''; grid.appendChild(h('div.note-l', null, t('card.loading')));
          Promise.resolve(ctx.callWS({ type: 'media_source/browse_media', media_content_id: id })).then(function (r) {
            grid.innerHTML = '';
            var kids = (r && r.children) || [];
            crumbs.innerHTML = '';
            if (id !== 'media-source://media_source') crumbs.appendChild(h('button.act', { onclick: function () { load('media-source://media_source'); } }, '‹'));
            var shown = 0;
            kids.forEach(function (k) {
              if (k.can_expand) { grid.appendChild(h('button.gal-f', { onclick: function () { load(k.media_content_id); } }, h('span', { html: UI.icon('grid', 26) }), h('span', null, k.title))); shown++; }
              else if (k.media_class === 'image') {
                shown++;
                grid.appendChild(h('button.gal-i', { 'aria-label': k.title, style: { backgroundImage: k.thumbnail ? 'url("' + (ctx.hass().hassUrl ? ctx.hass().hassUrl(k.thumbnail) : k.thumbnail) + '")' : '' }, onclick: function () {
                  Promise.resolve(ctx.callWS({ type: 'media_source/resolve_media', media_content_id: k.media_content_id, expires: 3600 * 24 * 7 })).then(function (res) { onPick(res.url); close(); }, function () { ctx.toast('error', k.title); });
                } }));
              }
            });
            if (!shown) grid.appendChild(h('div.note-l', null, t('s.no_media')));
          }, function () { grid.innerHTML = ''; grid.appendChild(h('div.note-l', null, t('s.no_media'))); });
        }
        load('media-source://media_source');
        return h('div', null, crumbs, grid);
      } });
    }
    function excludedControl() {
      var wrap = h('div.s-ex');
      var inp = h('input.ios-input', { type: 'text', placeholder: t('s.pattern'), 'aria-label': t('s.pattern'), spellcheck: false, autocapitalize: 'off' });
      var prev = h('div.s-prev'), list = h('div.chiprow'), tpl = h('div.chiprow');
      function cur() { return settings().excluded.slice(); }
      function apply(arr) { ctx.settings.set({ excluded: arr }); redraw(); refresh(); }
      function previewFor(pat) { return ctx.engine.previewExcluded([pat]); }
      function redraw() {
        list.innerHTML = '';
        cur().forEach(function (p) { list.appendChild(h('button.cp.on', { 'aria-label': p + ' ' + t('s.clear'), onclick: function () { apply(cur().filter(function (x) { return x !== p; })); } }, p + ' ×')); });
      }
      function add() { var v = inp.value.trim(); if (!v) return; var c = cur(); if (c.indexOf(v) < 0) c.push(v); inp.value = ''; livePreview(); apply(c); }
      function livePreview() {
        var v = inp.value.trim(); prev.innerHTML = '';
        if (!v) return;
        var m = previewFor(v);
        prev.appendChild(h('div.s-pc', null, m.length === 1 ? t('s.matches', { n: 1 }) : t('s.matches_n', { n: m.length })));
        m.slice(0, 6).forEach(function (it) { prev.appendChild(h('div.s-pi', null, it.id)); });
      }
      inp.addEventListener('input', livePreview);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
      S.EXCLUDE_TEMPLATES.forEach(function (tp) { tpl.appendChild(h('button.cp', { title: tp.patterns.join(', '), onclick: function () { var c = cur(); tp.patterns.forEach(function (p) { if (c.indexOf(p) < 0) c.push(p); }); apply(c); } }, tp.label)); });
      var exp = h('button.act', { onclick: function () {
        var blob = new Blob([ctx.engine.exportExcluded()], { type: 'application/json' }), a = h('a', { href: URL.createObjectURL(blob), download: 'okie-excluded.json' }); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
      } }, t('s.export'));
      var file = h('input', { type: 'file', accept: 'application/json', hidden: true, onchange: function () {
        var f = file.files[0]; if (!f) return;
        f.text().then(function (txt) { try { var list2 = ctx.engine.importExcluded(txt); apply(list2); } catch (e) { ctx.toast('error', t('s.invalid')); } });
      } });
      var imp = h('button.act', { onclick: function () { file.click(); } }, t('s.import'));
      wrap.appendChild(h('div.s-add', null, inp, h('button.act.primary', { onclick: add }, t('s.add'))));
      wrap.appendChild(prev); wrap.appendChild(list);
      wrap.appendChild(h('div.lbl', null, t('s.templates'))); wrap.appendChild(tpl);
      wrap.appendChild(h('div.actrow', null, imp, exp, file));
      redraw(); return wrap;
    }

    // ---------------------------------------------------- root + search ----
    function refresh() {
      navs.forEach(function (n) { if (n._val && n.isConnected) n._val.textContent = n._valueFn(); });
      var n = changedRows(rows(), ctx.settings.changed()).length;
      badge.hidden = !n; badge.textContent = String(n);
    }
    function pseudoPageRows() { return Object.keys(PAGES).map(function (id) { return { id: 'page:' + id, tab: PAGES[id].tab, group: PAGES[id].group, type: 'page', page: null, pageId: id, label: PAGES[id].label, desc: PAGES[id].desc }; }); }
    function draw() {
      body.innerHTML = ''; navs.length = 0;
      refresh();
      var all = rows();
      if (query || showChanged) {
        var pool = showChanged ? all : all.concat(pseudoPageRows());
        var list = pool.filter(function (r) { return rowMatches(r, query, lang()); });
        if (showChanged) list = changedRows(list, ctx.settings.changed());
        if (!list.length) { body.appendChild(h('div.ios-empty', null, showChanged && !query ? t('s.nochange') : t('s.none'))); return; }
        var lastTab = null, card = null;
        list.forEach(function (r) {
          if (r.tab !== lastTab) { lastTab = r.tab; body.appendChild(h('div.ios-section-header', null, h('span', null, t('s.tab.' + r.tab)))); card = h('div.ios-card'); body.appendChild(h('div.ios-section', null, card)); }
          else card.appendChild(h('div.ios-divider'));
          var el = r.type === 'page' ? navItem(r, function () { return pageValue(PAGES[r.pageId]); }, function () { clearSearch(); openPage(r.pageId); }) : item(r);
          if (r.type !== 'toggle' && r.type !== 'slider' && r.type !== 'page') { /* nav rows open their sub-page directly */ }
          else if (r.type === 'toggle' || r.type === 'slider') el.addEventListener('click', function (e) { if (e.target.closest('button,input,.slider')) return; jump(r); });
          card.appendChild(el);
        });
        return;
      }
      if (tab === 'about') {
        body.appendChild(h('div.ios-about', null, h('div.ios-ab-t', null, 'Okie Motor'), h('div.ios-ab-s', null, 'v' + (g.OkieMotor.version || 'dev')),
          h('div.ios-ab-d', null, lang() === 'de' ? 'Suche, Bento-Start, Detailansichten, Zeitpläne und mehr, direkt auf Hemma aufgebaut.' : 'Search, bento start, detail views, schedules and more, built on top of Hemma.')));
      }
      tabContent(tab, body);
      if (shell) shell.refreshScroll();
    }
    function clearSearch() { search.value = ''; query = ''; showChanged = false; changedBtn.classList.remove('on'); changedBtn.setAttribute('aria-pressed', 'false'); }
    function jump(row) {
      clearSearch();
      stack = [];
      shell.showTab(row.tab);
      flashId = row.id;
      if (row.page) { stack = [{ title: P(PAGES[row.page].label), build: function (b) { pageContent(row.page, b); } }]; renderStack(1); }
      else { draw(); var f = flashId; flashId = null; requestAnimationFrame(function () { var el = body.querySelector('[data-row="' + f + '"]'); if (el) { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); el.classList.add('flash'); setTimeout(function () { el.classList.remove('flash'); }, 1600); } }); }
    }
    search.addEventListener('input', function () { query = search.value; if (stack.length) { stack = []; renderStack(0); } else draw(); });
    search.addEventListener('keydown', function (e) { if (e.key === 'Enter') { var first = rows().filter(function (r) { return rowMatches(r, query, lang()); })[0]; if (first && query) jump(first); } });
    var off = ctx.settings.on('change', function () { refresh(); });

    draw();
    return { update: function () {}, dispose: function () { off(); try { if (ctx.stage && ctx.stage.dataset) delete ctx.stage.dataset.glassedit; } catch (e) { /* closing */ } shell.dispose(); }, _jump: jump, _draw: draw, _openPage: openPage, _pop: pop, _stack: function () { return stack; } };
  }

  g.OkieMotor.apps.register({ id: 'settings', nameKey: 'app.settings', name: 'Settings', icon: 'gear', color: '#6b7a90', order: 999, category: 'system', render: render });

  var CSS = [
    '.ios-head{display:flex;gap:10px;align-items:center;margin-bottom:8px;}',
    '.ios-search{flex:1;display:flex;align-items:center;gap:8px;padding:9px 14px;border-radius:12px;background:rgba(255,255,255,.1);color:rgba(255,255,255,.6);}',
    '.ios-search-in{flex:1;min-width:0;background:none;border:0;outline:0;font-size:15px;color:var(--okie-text);}.ios-search-in::placeholder{color:rgba(255,255,255,.5);}',
    '.ios-changed{display:inline-flex;align-items:center;gap:8px;padding:9px 14px;border-radius:12px;background:rgba(255,255,255,.1);font-size:14px;font-weight:600;white-space:nowrap;}.ios-changed.on{background:rgba(255,255,255,.92);color:#1c1c1e;}',
    '.ios-badge{min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:rgb(255,159,10);color:#fff;font-size:12px;font-weight:700;line-height:20px;text-align:center;}',
    '.ios-section{margin:0 0 18px;}',
    '.ios-section-header{display:flex;align-items:center;gap:6px;padding:0 6px 7px;font-size:12.5px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:rgba(255,255,255,.55);}',
    '.ios-info-btn{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:rgba(255,255,255,.55);}.ios-info-btn:hover{color:#fff;}',
    '.ios-text{padding:0 8px 12px;font-size:12.5px;line-height:1.45;color:rgba(255,255,255,.6);}',
    '.ios-card{border-radius:20px;background:rgba(255,255,255,.08);overflow:hidden;}',
    '.ios-item{display:flex;align-items:center;justify-content:space-between;gap:14px;padding:13px 16px;min-height:50px;text-align:left;transition:background .2s;}',
    '.ios-item-clickable{cursor:pointer;}.ios-item-clickable:hover{background:rgba(255,255,255,.07);}.ios-item-clickable:active{background:rgba(255,255,255,.12);}',
    '.ios-item.stack{display:block;}',
    '.ios-item.flash{animation:ios-flash 1.6s ease;}@keyframes ios-flash{0%,60%{background:rgba(10,132,255,.35);}100%{background:transparent;}}',
    '.ios-item.danger .ios-item-label{color:#ff6b61;}',
    '.ios-item-left{min-width:0;flex:1;}.ios-item-label{font-size:15px;font-weight:600;line-height:1.25;}.ios-item-subtitle{font-size:12px;line-height:1.35;color:rgba(255,255,255,.6);margin-top:2px;}',
    '.ios-diag{flex-direction:column;align-items:stretch;gap:8px;}.diag-pre{margin:0;padding:10px 12px;border-radius:12px;background:rgba(0,0,0,.28);font:11px/1.45 ui-monospace,Menlo,monospace;white-space:pre-wrap;word-break:break-word;color:rgba(255,255,255,.85);-webkit-user-select:text;user-select:text;}',
    '.ios-item-right{display:flex;align-items:center;gap:6px;flex:none;color:rgba(255,255,255,.6);}.ios-item-value{font-size:14px;max-width:150px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.ios-chevron{display:inline-flex;opacity:.45;}.ios-check{display:inline-flex;color:#fff;}',
    '.ios-divider{height:1px;margin-left:16px;background:rgba(255,255,255,.1);}',
    '.stage[data-glassedit="cards"] .detail-wrap{background:var(--okie-card-bg,rgba(255,255,255,.1))!important;-webkit-backdrop-filter:var(--okie-card-bf,none)!important;backdrop-filter:var(--okie-card-bf,none)!important;box-shadow:var(--okie-card-edge,none)!important;}',
    '.ios-seg{flex-direction:column;align-items:stretch;gap:12px;}.ios-seg .segment{width:100%;}.ios-seg .segment .sg{flex:1;justify-content:center;}',
    // glass dot switch
    '.ios-switch{position:relative;width:51px;height:31px;border-radius:16px;background:rgba(120,120,128,.4);flex:none;transition:background .3s;}.ios-switch.on{background:rgb(52,199,89);}',
    '.ios-switch .dot{position:absolute;top:2px;left:2px;width:27px;height:27px;border-radius:50%;background:linear-gradient(180deg,#fff,#f0f0f3);box-shadow:0 2px 6px rgba(0,0,0,.28),inset 0 0 0 .5px rgba(0,0,0,.04);transition:transform .32s cubic-bezier(.34,1.3,.5,1),width .2s;}',
    '.ios-switch.on .dot{transform:translateX(20px);}.ios-switch:active .dot{width:32px;}.ios-switch.on:active .dot{transform:translateX(15px);}',
    // sliders
    '.ios-slider{display:flex;flex-direction:column;align-items:stretch;gap:12px;padding:16px;}.ios-slider-top{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;}.slider-value{font-size:14px;font-weight:600;}',
    '.ios-slider .slider{height:36px;flex:none;}',
    '.slider-end{display:inline-flex;align-items:center;gap:8px;flex:none;}.slider-reset{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.16);color:rgba(255,255,255,.9);transition:background .2s,transform .16s;}.slider-reset:hover{background:rgba(255,255,255,.28);transform:rotate(-40deg);}.slider-reset[hidden]{display:none;}',
    '.slider-value.flash{animation:slider-flash .55s ease;}@keyframes slider-flash{0%{transform:scale(1.35);color:#8ae8a0;}100%{transform:none;}}',      // in this column the base flex:1 gave it a zero-height basis, so the track vanished
    '.ios-section>.ios-item.ios-slider{border-radius:20px;background:rgba(255,255,255,.08);}',
    // sub-page chrome
    '.ios-nav{display:flex;flex-direction:column;gap:6px;margin-bottom:14px;}',
    '.ios-back{align-self:flex-start;display:inline-flex;align-items:center;gap:2px;padding:6px 12px 6px 6px;border-radius:9999px;background:rgba(255,255,255,.1);font-size:14px;font-weight:600;}.ios-back:hover{background:rgba(255,255,255,.18);}',
    '.ios-title{font-size:26px;font-weight:700;letter-spacing:-.02em;padding:2px 4px;}',
    '.ios-input{width:100%;padding:12px 16px;border-radius:14px;border:0;outline:0;background:rgba(255,255,255,.1);font-size:15px;color:var(--okie-text);}',
    '.ios-empty{padding:40px 12px;text-align:center;color:rgba(255,255,255,.6);}',
    '.ios-about{padding:4px 6px 20px;}.ios-ab-t{font-size:30px;font-weight:300;}.ios-ab-s{color:rgba(255,255,255,.6);margin-top:2px;}.ios-ab-d{margin-top:10px;font-size:13px;line-height:1.5;color:rgba(255,255,255,.7);}',
    // sidebar editor
    '.ios-sb{display:flex;flex-direction:column;gap:2px;}.ios-sb-row{display:flex;align-items:center;gap:12px;padding:8px 2px;}.ios-sb-ic{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:rgba(255,255,255,.1);flex:none;}.ios-sb-t{flex:1;font-size:15px;font-weight:600;}',
    '.ios-sb-fix{width:51px;}.ios-mini{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.1);}.ios-mini.up{transform:rotate(180deg);}.ios-mini:disabled{opacity:.25;pointer-events:none;}',
    // custom controls
    '.s-qc{display:flex;flex-direction:column;gap:8px;}.s-qr{display:flex;justify-content:space-between;align-items:center;gap:12px;font-size:14px;}.s-qr .sg{padding:7px 14px;}',
    '.s-add{display:flex;gap:8px;}.s-prev{margin:8px 0;}.s-pc{font-size:13px;color:rgba(255,255,255,.6);margin-bottom:4px;}.s-pi{font-size:12px;font-family:ui-monospace,monospace;opacity:.8;}',
    '.s-ex .lbl,.s-ex .chiprow{margin-top:10px;}.s-wp{display:flex;flex-direction:column;gap:10px;}',
    '.gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;}.gal-i{aspect-ratio:4/3;border-radius:16px;background:rgba(255,255,255,.1) center/cover;}.gal-f{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;aspect-ratio:4/3;border-radius:16px;background:rgba(255,255,255,.1);padding:8px;text-align:center;font-size:13px;}.crumbs{margin-bottom:10px;}',
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);
  g.OkieMotor.settings = { ROWS: ROWS, PAGES: PAGES, rows: rows, render: render, getPath: getPath, rowMatches: rowMatches };
})(typeof globalThis !== 'undefined' ? globalThis : window);

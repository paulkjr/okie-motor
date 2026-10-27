/* okie-bento: the start screen, FSC's "bento" under the search row.
 *
 *   W1  carousel (no card behind it): Favorites | Suggestions tabs + tile/list toggle,
 *       a 3-column scrolling grid with soft edge fades
 *   W2  rich slider: weather, to-dos, news, calendar, tips. One brand gradient per
 *       page that cross-fades, pages that slide, a pager pill with a pause button
 *   W3  W4  small live tiles that look like device cards: to-dos (blue), news (orange)
 *
 * The grid is 1.353fr | 1fr, areas "w1 w2 / w1 w34", gap 24, and steps down the
 * height ladder (data-hoehe on the stage: voll -> kompakt -> abwerfen -> boden).
 */
(function (g) {
  'use strict';
  if (typeof document === 'undefined') return;

  var UI = g.OkieMotor.ui, L = g.OkieMotor.logic, F = g.OkieMotor.feeds, core = g.OkieMotor.core, TL = g.OkieMotor.tiles;
  var h = UI.h;

  core.registerStrings('en', {
    'b.favorites': 'Favorites', 'b.suggestions': 'Suggestions', 'b.nofav': 'Tap the heart in any device to pin it here.',
    'b.add_widgets': 'Add or remove widgets', 'b.edit_cards': 'Cards on this slider', 'b.slider_name': 'Widgets', 'b.edit_hint': 'Drag the handle to change the order. Switch a card off to hide it and on to bring it back.', 'b.reset': 'Reset', 'b.done': 'Done', 'b.edit': 'Edit cards', 'b.unavailable': 'Nothing to show yet', 'b.kindle_lbl': 'Kindle Fire', 'b.weather': 'Weather', 'b.cameras': 'Cameras', 'b.calendar': 'Calendar', 'b.todos': 'To-do', 'b.news': 'News', 'b.tips': 'Tips', 'b.chronicle': 'Recently in the house',
    'b.nothing_yet': 'Nothing yet', 'b.no_events': 'No upcoming events', 'b.no_todos': 'All done', 'b.no_news': 'No articles yet', 'b.overdue': 'overdue',
    'b.no_widgets': 'No widgets to show yet. Add a weather, calendar or to-do entity.', 'b.hl': 'H:{h}°  L:{l}°', 'b.humidity': 'Humidity {h}%',
    'b.view_tiles': 'Tile view', 'b.view_list': 'List view', 'b.resize': 'Change the height of this area', 'b.grip': 'Drag to change the height, double-tap to reset', 'b.pause': 'Pause', 'b.play': 'Play', 'b.page': 'Page {n}',
    'b.incomplete': '{n} Incomplete', 'b.overdue_n': '{n} Overdue', 'b.new_articles': '{n} New Articles', 'b.feeds_n': '{n} Feeds', 'b.feed_1': '1 Feed',
    'b.unread': 'Unread', 'b.read': 'Read', 'b.new_articles_l': '{n} new articles', 'b.next': 'Next', 'b.tip_n': 'Tip {n}', 'b.open': 'Open',
  });
  core.registerStrings('de', {
    'b.favorites': 'Favoriten', 'b.suggestions': 'Vorschläge', 'b.nofav': 'Tippe in einem Gerät auf das Herz, um es hier anzuheften.',
    'b.add_widgets': 'Widgets hinzufügen oder entfernen', 'b.edit_cards': 'Karten dieses Schiebers', 'b.slider_name': 'Widgets', 'b.edit_hint': 'Am Griff ziehen, um die Reihenfolge zu ändern. Eine Karte ausschalten blendet sie aus, einschalten holt sie zurück.', 'b.reset': 'Zurücksetzen', 'b.done': 'Fertig', 'b.edit': 'Karten bearbeiten', 'b.unavailable': 'Noch nichts anzuzeigen', 'b.kindle_lbl': 'Kindle Fire', 'b.weather': 'Wetter', 'b.cameras': 'Kameras', 'b.calendar': 'Kalender', 'b.todos': 'Aufgaben', 'b.news': 'Nachrichten', 'b.tips': 'Tipps', 'b.chronicle': 'Zuletzt im Haus',
    'b.nothing_yet': 'Noch nichts', 'b.no_events': 'Keine anstehenden Termine', 'b.no_todos': 'Alles erledigt', 'b.no_news': 'Noch keine Artikel', 'b.overdue': 'überfällig',
    'b.no_widgets': 'Noch nichts anzuzeigen. Füge eine Wetter-, Kalender- oder Aufgaben-Entität hinzu.', 'b.hl': 'H:{h}°  T:{l}°', 'b.humidity': 'Feuchte {h}%',
    'b.view_tiles': 'Kachelansicht', 'b.view_list': 'Listenansicht', 'b.resize': 'Höhe dieses Bereichs ändern', 'b.grip': 'Ziehen, um die Höhe zu ändern, doppeltippen zum Zurücksetzen', 'b.pause': 'Pause', 'b.play': 'Abspielen', 'b.page': 'Seite {n}',
    'b.incomplete': '{n} Offen', 'b.overdue_n': '{n} Überfällig', 'b.new_articles': '{n} Neue Artikel', 'b.feeds_n': '{n} Feeds', 'b.feed_1': '1 Feed',
    'b.unread': 'Ungelesen', 'b.read': 'Gelesen', 'b.new_articles_l': '{n} neue Artikel', 'b.next': 'Weiter', 'b.tip_n': 'Tipp {n}', 'b.open': 'Öffnen',
  });

  // brand gradients of the W2 pages (rgb pairs from the live card)
  var BRAND = {
    weather: ['74,144,226', '42,108,178'], todos: ['255,159,10', '199,108,0'], news: ['254,59,48', '184,30,18'],
    tips: ['107,105,224', '57,53,161'], calendar: ['233,69,96', '138,21,56'], cameras: ['44,40,34', '14,13,12'],
  };

  var CSS = [
    '.bento{display:grid;grid-template-columns:1.353fr 1fr;grid-template-rows:minmax(0,1fr) var(--w34-row-height,196px);grid-template-areas:"w1 w2" "w1 w34";gap:24px;height:var(--fsc-grid-h,464px);width:100%;box-sizing:border-box;}',
    // swapped: the cameras card (area w34) on top, the sliding card (weather, tasks, news, calendar) below it, each keeps its own height
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .bento[data-swap="true"]{grid-template-rows:var(--w34-row-height,196px) minmax(0,1fr);grid-template-areas:"w1 w34" "w1 w2";}',
    '.w1{grid-area:w1;}.w2{grid-area:w2;}.w34{grid-area:w34;display:grid;grid-template-columns:1fr 1fr;gap:24px;min-height:0;}',
    '.w1,.w2,.w34>*{min-width:0;min-height:0;}',
    // the right side (the sliding card, the cameras card, the feeder card) is one box: on a wide screen it is its own grid and it scrolls when its cards do not fit; on a phone and a short window it dissolves into the stack as before
    '.wright{display:contents;}',
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .wright{display:grid;grid-column:2;grid-row:1 / span 2;min-width:0;min-height:0;gap:24px;grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,1fr) var(--w34-row-height,196px);grid-template-areas:"w2" "w34";overflow-y:auto;overscroll-behavior:contain;scrollbar-width:none;}',
    '.wright::-webkit-scrollbar{display:none;}',
    // cards moved between the columns: the right column lays out what it holds (grid areas from the card), the cards that moved left sit above the list at its width
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .wright[data-moved="on"]>*{grid-area:var(--okie-ga,auto);}',
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .wright[data-moved="on"]{align-content:start;}',      // the cards keep their own height (a row is not stretched over the free room: no gap between two cards)
    // one card: the cameras, Kindle, AWTRIX and map cards are pages of the sliding card and fill the page
    '.w2-page.deckpage{position:relative;padding:0;}.w2-page.deckpage .camcard{position:absolute;inset:0;min-height:0;height:auto;width:auto;border-radius:0;-webkit-clip-path:none;clip-path:none;grid-area:auto;padding-bottom:46px;}',
    // the pencils show only while the arrangement is open (hold a card to open it)
    '.bento:not(.arranging) .hsp-ed,.bento:not(.arranging) .w1-edit{display:none!important;}',
    '.w1-widgets{display:flex;flex-direction:column;gap:14px;margin:0 0 14px;}.w1-widgets>*{flex:none;min-width:0;grid-area:auto;}.w1-widgets>.w2{height:270px;}',
    '.stage .w1-widgets>.gdeck{height:240px;}.stage:not([data-mobile="true"]):not([data-hoehe="boden"]) .w1-widgets>.gdeck{height:240px;}',
    '.wright>.fv-item{min-width:0;}',
    '.w2,.gdeck,.fdc{position:relative;}',
    '.bento.arranging .wright>.wr-add{display:flex;}.wright>.wr-add{margin:0;}.xzone.merge{border-radius:24px;box-shadow:0 0 0 3px #fff,0 0 28px rgba(255,255,255,.5);background:rgba(255,255,255,.12);}',
    // while the arrangement is edited: a veil over the right-column cards with the arrow that takes the card to the other column
    '.bento .wm.fv-sw{display:none;z-index:30;border-radius:inherit;background:rgba(20,18,16,.8);}.bento.arranging .wm.fv-sw{display:flex;}',
    '.bento.arranging .wright>.fv-item .fv-sw{display:flex;}.bento.arranging .wright>.fv-item>:first-child{pointer-events:none;}.bento.arranging .wright>.fv-item>.fv-x{display:grid;}',
    '.bento.arranging .fv-item,.bento.arranging .wm,.bento.arranging .w2,.bento.arranging .gdeck,.bento.arranging .fdc{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;}.bento.arranging img{-webkit-user-drag:none;}',
    '.xzone{position:fixed;z-index:2999;pointer-events:none;box-sizing:border-box;border:2.5px dashed rgba(255,255,255,.55);border-radius:26px;background:rgba(255,255,255,.03);transition:background .15s,border-color .15s;}.xzone.on{border-color:#fff;background:rgba(255,255,255,.12);}',
    '.xghost{position:fixed;z-index:3000;pointer-events:none;display:flex;align-items:center;gap:10px;padding:12px 18px;border-radius:18px;background:rgba(255,255,255,.96);color:#1d1b19;font-size:15px;font-weight:700;box-shadow:0 18px 40px rgba(0,0,0,.4);transform:translate(-50%,-60%) rotate(-3deg);white-space:nowrap;max-width:240px;}.xghost span:last-child{overflow:hidden;text-overflow:ellipsis;}.xg-ic{display:grid;place-items:center;}.xg-ic svg{width:18px;height:18px;}',
    '.bento.arranging .fv-sw,.bento.arranging .wm{touch-action:pan-y;}.bento.arranging .wright[data-scrolls="false"] .fv-sw,.bento.arranging .wright[data-scrolls="false"] .wm{touch-action:none;}',
    '.xsrc{opacity:.4;}.xpicked{transform:scale(.985);transition:transform .15s ease;}',
    '.xline{position:fixed;z-index:3001;height:4px;border-radius:2px;background:#fff;box-shadow:0 0 12px rgba(255,255,255,.8);pointer-events:none;}.xline[hidden]{display:none;}',
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .bento[data-swap="true"] .wright{grid-template-rows:var(--w34-row-height,196px) minmax(0,1fr);grid-template-areas:"w34" "w2";}',
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .wright[data-feeder="on"]{grid-template-rows:minmax(250px,1fr) var(--w34-row-height,196px) var(--okie-feed-h,92px);grid-template-areas:"w2" "w34" "w5";}',
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .bento[data-swap="true"] .wright[data-feeder="on"]{grid-template-rows:var(--w34-row-height,196px) var(--okie-feed-h,92px) minmax(250px,1fr);grid-template-areas:"w34" "w5" "w2";}',
    '.stage[data-mobile="true"] .fdc,.stage[data-hoehe="boden"] .fdc,.stage[data-hoehe="abwerfen"] .fdc{display:none;}',
    // reveal stagger (the card adds .stagger for a moment after the lock page opens)
    '.bento.stagger .w1{animation:zen-cell-in .6s cubic-bezier(.22,1,.36,1) .84s both;}.bento.stagger .w2{animation:zen-cell-in .6s cubic-bezier(.22,1,.36,1) .99s both;}.bento.stagger .w34{animation:zen-cell-in .6s cubic-bezier(.22,1,.36,1) 1.14s both;}',
    '@keyframes zen-cell-in{from{opacity:0;transform:translateY(16px) scale(.97);filter:blur(8px);}to{opacity:1;transform:none;filter:blur(0);}}',
    // W1
    '.carousel{display:flex;flex-direction:column;padding:14px 16px 0;box-sizing:border-box;overflow:hidden;}',
    '.w1-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex:none;min-height:20px;padding:5px 5px 7px;border-bottom:1px solid rgba(255,255,255,.1);}',
    '.w1-tabs{display:flex;gap:8px;min-width:0;}',
    '.w1-tab{display:inline-flex;align-items:center;letter-spacing:-.01em;gap:7px;padding:7px 14px;border-radius:16px;font-size:14px;font-weight:600;white-space:nowrap;background:rgba(24,22,20,.38);-webkit-backdrop-filter:blur(14px) saturate(160%);backdrop-filter:blur(14px) saturate(160%);color:rgba(255,255,255,.96);transition:background .25s,color .25s,transform .08s cubic-bezier(.16,1,.3,1);}',
    '.w1-tab:hover{background:rgba(255,255,255,.26);}.w1-tab:active{transform:scale(.96);}.w1-tab.on{background:rgba(255,255,255,.95);color:rgb(28,28,30);}',
    '.w1-tab .cnt{border-radius:8px;font-size:12px;font-weight:500;line-height:16px;min-width:18px;padding:0 5px;text-align:center;background:rgba(0,0,0,.14);}.w1-tab:not(.on) .cnt{background:rgba(255,255,255,.16);}',
    '.w1-view{display:flex;gap:2px;padding:2px;border-radius:9px;background:rgba(24,22,20,.38);-webkit-backdrop-filter:blur(14px) saturate(160%);backdrop-filter:blur(14px) saturate(160%);flex:none;}',
    '.w1{position:relative;}',
    '.stage[data-w1grow="true"] .w1,.stage[data-w1grow="true"] .wright{align-self:start;height:calc(var(--fsc-grid-h,464px) + var(--okie-col-extra,0px));}',      // both columns get the same extra: whole cards, same length
    // a column height set with the handle (the list: bento.w1height, the right column: bento.wrheight) beats the automatic one
    '.stage[data-w1h="custom"]:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .w1{align-self:start;height:var(--okie-w1h);}',
    '.stage[data-wrh="custom"]:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .wright{align-self:start;height:var(--okie-wrh);}',
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]):not([data-hoehe="abwerfen"]) .wright{position:relative;}',
    // while the arrangement is open each column has a dashed frame (the same rounded line for both) with a handle on its bottom line: drag the handle to set the height (double tap: automatic)
    '.col-frame{position:fixed;z-index:2997;pointer-events:none;box-sizing:border-box;border:1.5px dashed rgba(255,255,255,.6);border-radius:32px;}.col-frame[hidden]{display:none;}',
    '.col-grip{position:fixed;z-index:2998;width:120px;height:40px;display:flex;align-items:center;justify-content:center;cursor:ns-resize;touch-action:none;outline:none;}.col-grip[hidden]{display:none;}',
    '.col-grip i{display:block;width:52px;height:6px;border-radius:3px;background:rgba(255,255,255,.95);box-shadow:0 1px 4px rgba(0,0,0,.4);transition:transform .2s;}.col-grip:hover i,.col-grip:focus-visible i,.col-grip:active i{transform:scaleX(1.25);}',
    '.hguide{position:fixed;z-index:2998;height:0;border-top:2px dotted rgba(255,255,255,.9);pointer-events:none;}',
    '.bento .wright>.fv-item>.fv-x{top:6px;right:6px;}',      // the cross sits inside the card in the right column (the column clips what sticks out)      // a tablet: the list reaches below the widgets at its right, so no card is cut off
    '.w1-view button.w1-edit{margin-left:4px;}',
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]) .w1-edit{display:none;}',      // the grid layouts size the area themselves: the pencil only shows where the height can change
    '.stage[data-w1h="custom"][data-mobile="true"] .w1,.stage[data-w1h="custom"][data-hoehe="boden"] .w1{height:var(--okie-w1h);max-height:none;}',
    '.w1-view button{width:26px;height:22px;border-radius:7px;display:grid;place-items:center;color:rgba(255,255,255,.95);transition:background .2s,color .2s;}.w1-view button.on{background:rgba(255,255,255,.92);color:rgb(28,28,30);}',
    '.w1-body{position:relative;flex:1;min-height:0;overflow-y:auto;overflow-x:hidden;padding:6px 8px 24px;margin:0 -6px;scrollbar-width:none;overscroll-behavior:contain;}',      // the cards at its edges fade out one by one (fadeCol): a mask on the column would hide the picture from a blurred card
    '.w1-body::-webkit-scrollbar{display:none;}',
    '.w1-body .device-grid-container{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;}',
    '.w1-body .device-card{padding:12px;min-width:0;min-height:0;}',
    '.w1-body .device-list-container{gap:10px;}',
    '.w1-hint{margin:auto;max-width:260px;text-align:center;color:rgba(255,255,255,.7);font-size:14px;padding:30px 0;}',
    // W2
    '.rich{position:relative;border-radius:24px;overflow:hidden;color:#fff;isolation:isolate;transition:transform .35s cubic-bezier(.34,1.18,.24,1);touch-action:pan-y;}',
    '.rich:hover{transform:scale(1.015);}',
    '.w2-bgs{position:absolute;inset:0;z-index:-1;}.w2-bg{position:absolute;inset:0;opacity:0;transition:opacity .5s ease;}.w2-bg.on{opacity:1;}',
    '.w2-track{position:absolute;inset:0;display:flex;transition:transform .5s cubic-bezier(.32,.72,0,1);will-change:transform;}',
    '.w2-page{flex:0 0 100%;min-width:0;height:100%;box-sizing:border-box;padding:18px 18px 52px;display:flex;flex-direction:column;overflow:hidden;}',
    '.w2-foot{position:absolute;left:18px;bottom:14px;right:140px;display:flex;flex-direction:column;gap:1px;pointer-events:none;min-width:0;}',
    '.w2-foot .f1{font-size:11.5px;color:rgba(255,255,255,.7);}.w2-foot .f2{font-size:13px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
    '.hero-slide-pager{position:absolute;right:14px;bottom:12px;display:flex;align-items:center;gap:6px;padding:7px 11px;border-radius:16px;background:rgba(0,0,0,.35);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);}',
    '.hsp-dot{position:relative;width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,.4);overflow:hidden;transition:width .4s cubic-bezier(.34,1.18,.24,1),background .3s;}',
    '.hsp-dot.on{width:36px;background:rgba(255,255,255,.35);}',
    '.hsp-dot.on::after{content:"";position:absolute;inset:0;border-radius:inherit;background:#fff;transform-origin:left;animation:w2-prog var(--slide-ms,8000ms) linear forwards;}',
    '.hero-slide-pager[data-paused="true"] .hsp-dot.on::after{animation-play-state:paused;}',
    '@keyframes w2-prog{from{transform:scaleX(0);}to{transform:scaleX(1);}}',
    '.hsp-pp{width:14px;height:14px;display:grid;place-items:center;margin-left:2px;color:#fff;}',
    '.w2.rich{cursor:pointer;}',
    '.hsp-ed{width:16px;height:16px;display:grid;place-items:center;margin-left:4px;color:#fff;opacity:.85;}',
    '.hero-slide-pager.static .hsp-dot.on::after{animation:none;}',
    '.pe-hint{font-size:13px;line-height:1.4;opacity:.7;margin:2px 2px 12px;}.pe-list{display:flex;flex-direction:column;gap:6px;position:relative;max-height:min(56vh,360px);overflow-y:auto;overscroll-behavior:contain;}',
    '.pe-row{display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:16px;background:rgba(255,255,255,.08);position:relative;}.pe-row.drag{z-index:3;background:rgba(255,255,255,.2);box-shadow:0 12px 28px rgba(0,0,0,.3);}.pe-row.off{opacity:.55;}',
    '.pe-grip{width:30px;height:34px;display:grid;place-items:center;color:inherit;opacity:.6;touch-action:none;cursor:grab;flex:none;border:0;background:none;padding:0;}',
    '.pe-ic{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:rgba(255,255,255,.12);flex:none;}',
    '.pe-t{flex:1;min-width:0;}.pe-t b{display:block;font-size:16px;font-weight:600;}.pe-t em{display:block;font-style:normal;font-size:12px;opacity:.6;margin-top:1px;}',
    '.pe-sw{position:relative;width:46px;height:28px;border-radius:14px;border:0;padding:0;background:rgba(120,120,128,.45);flex:none;transition:background .25s;}.pe-sw::after{content:"";position:absolute;left:2px;top:2px;width:24px;height:24px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:transform .25s cubic-bezier(.23,1,.32,1);}.pe-sw.on{background:rgb(52,199,89);}.pe-sw.on::after{transform:translateX(18px);}.pe-sw:disabled{opacity:.4;}',
    '.pe-foot{display:flex;gap:8px;justify-content:space-between;margin-top:14px;}.pe-foot button{border:0;border-radius:999px;padding:10px 18px;font:inherit;font-size:15px;font-weight:600;color:inherit;background:rgba(255,255,255,.14);}.pe-foot .done{background:#fff;color:#1d1b19;}',
    '.gdeck{position:relative;min-width:0;min-height:0;overflow:hidden;border-radius:24px;touch-action:pan-y;height:var(--gd-h,290px);-webkit-clip-path:inset(0 round 24px);clip-path:inset(0 round 24px);}',
    '.stage:not([data-mobile="true"]):not([data-hoehe="boden"]) .gdeck{grid-area:w34;height:auto;}.stage[data-hoehe="abwerfen"] .gdeck{display:none;}',
    '.gd-track{display:flex;height:100%;transition:transform .5s cubic-bezier(.32,.72,0,1);will-change:transform;}.gd-track>.camcard{flex:0 0 100%;min-width:0;height:100%;min-height:0;grid-area:auto;}',
    '.gd-pager{right:14px;bottom:auto;top:12px;z-index:5;}',
    '.page-head{display:flex;align-items:center;gap:10px;flex:none;margin-bottom:8px;}',
    '.ph-bubble{width:32px;height:32px;border-radius:9px;background:rgba(255,255,255,.22);display:grid;place-items:center;flex:none;}',
    '.ph-t{font-size:15px;font-weight:700;line-height:1.1;}.ph-s{font-size:12px;color:rgba(255,255,255,.8);}',
    '.ph-tabs{margin-left:auto;display:flex;gap:6px;}.ph-tab{padding:5px 13px;border-radius:14px;font-size:13px;font-weight:600;background:rgba(255,255,255,.24);color:rgba(255,255,255,.92);transition:background .2s,transform .08s cubic-bezier(.16,1,.3,1);}.ph-tab:active{transform:scale(.95);}.ph-tab.on{background:rgba(255,255,255,.96);color:var(--pg-ink,rgb(40,40,44));}',
    '.w2-page[data-page="news"]{--pg-ink:rgb(184,30,18);}.w2-page[data-page="todos"]{--pg-ink:rgb(199,108,0);}.w2-page[data-page="calendar"]{--pg-ink:rgb(138,21,56);}.w2-page[data-page="tips"]{--pg-ink:rgb(57,53,161);}',
    '.w2-page[data-page="news"] .page-head{padding-bottom:9px;border-bottom:1px solid rgba(255,255,255,.2);margin-bottom:6px;}',
    '.stage[data-hoehe="kompakt"] .w2-page[data-page="news"] .ph-bubble,.stage[data-hoehe="kompakt"] .w2-page[data-page="news"] .page-head>div:not(.ph-tabs){display:none;}.stage[data-hoehe="kompakt"] .w2-page[data-page="news"] .ph-tabs{margin-left:0;}',
    '.nw-row{gap:12px;padding:7px 0;align-items:center;}.nw-i{width:52px;height:52px;border-radius:8px;object-fit:cover;flex:none;background:rgba(255,255,255,.2);}.nw-m{min-width:0;flex:1;}.nw-t{font-size:13px;font-weight:700;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.nw-s{font-size:11px;color:rgba(255,255,255,.75);margin-top:2px;}',
    '.page-body>*{flex:none;}.page-body{flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;gap:2px;-webkit-mask-image:linear-gradient(to bottom,#000 calc(100% - 16px),transparent);mask-image:linear-gradient(to bottom,#000 calc(100% - 16px),transparent);}',
    '.empty-pg{margin:auto;color:rgba(255,255,255,.85);text-align:center;font-size:14px;}',
    // weather
    '.wx-loc{display:flex;align-items:center;gap:6px;font-size:17px;font-weight:600;cursor:pointer;width:max-content;max-width:100%;}.wx-loc span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
    '.wx-main{display:flex;align-items:center;gap:14px;margin-top:2px;min-height:0;}',
    '.wx-temp{font-size:64px;font-weight:300;line-height:1;letter-spacing:-.03em;font-variant-numeric:tabular-nums;}',
    '.wx-side{display:flex;flex-direction:column;gap:3px;min-width:0;}.wx-cond{font-size:17px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.wx-hl{font-size:14px;color:rgba(255,255,255,.85);}',
    '.wx-art{flex:1;min-height:0;position:relative;}.wx-art .wx-pic{position:absolute;inset:0;margin:auto;height:100%;width:auto;aspect-ratio:1;max-height:190px;}',
    '.w2-page[aria-hidden="true"] .wxd-star,.stage[data-scrolling="on"] .wxd-star{animation-play-state:paused;}',
    '.w2-page[data-page="weather"]{position:relative;}.wx-stars{position:absolute;inset:0;z-index:0;pointer-events:none;}.w2-page[data-page="weather"]>*:not(.wx-stars){position:relative;z-index:1;}',
    '.wx-hours{display:flex;justify-content:space-between;gap:4px;margin-top:auto;padding-top:8px;border-top:1px solid rgba(255,255,255,.22);}',
    '.wx-h{display:flex;flex-direction:column;align-items:center;gap:6px;flex:1;min-width:0;}.wx-h .tm{font-size:12px;font-weight:400;color:rgba(255,255,255,.75);}.wx-h .tp{font-size:15px;font-weight:500;}.wx-h .wxd-mini{width:26px;height:26px;}',
    // short windows (the wall tablet): the same small weather line your Fast Search Card tablet uses
    '.stage[data-hoehe="kompakt"] .wx-temp,.stage[data-hoehe="abwerfen"] .wx-temp{font-size:24px;line-height:1;}.stage[data-hoehe="kompakt"] .wx-cond,.stage[data-hoehe="abwerfen"] .wx-cond{font-size:13px;line-height:1.2;}.stage[data-hoehe="kompakt"] .wx-hl,.stage[data-hoehe="abwerfen"] .wx-hl{font-size:11px;}.stage[data-hoehe="kompakt"] .wx-main,.stage[data-hoehe="abwerfen"] .wx-main{align-items:center;}.stage[data-hoehe="kompakt"] .wx-art,.stage[data-hoehe="abwerfen"] .wx-art{position:absolute;right:12px;top:10px;flex:none;display:block;}.stage[data-hoehe="kompakt"] .wx-art .wx-pic,.stage[data-hoehe="abwerfen"] .wx-art .wx-pic{width:32px;max-height:none;}',
    // rows
    '.row-hero{padding:10px 12px;border-radius:14px;background:rgba(255,255,255,.2);cursor:pointer;transition:background .2s;}.row-hero:hover{background:rgba(255,255,255,.28);}.row-hero .t{font-size:16px;font-weight:700;}.row-hero .s{font-size:12.5px;color:rgba(255,255,255,.85);margin-top:2px;}',
    '.pg-row{display:flex;align-items:center;gap:10px;padding:6px 2px;font-size:13.5px;border-bottom:1px solid rgba(255,255,255,.14);min-height:24px;cursor:default;}',
    '.pg-row:last-child{border-bottom:0;}.pg-row .t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}.pg-row .d{font-size:12px;color:rgba(255,255,255,.8);white-space:nowrap;}',
    '.pg-row.od .d{color:#fff;background:rgba(255,59,48,.85);border-radius:8px;padding:1px 7px;}',
    '.pg-row.link{cursor:pointer;}.pg-row.link:hover .t{text-decoration:underline;}',
    '.pg-row.unread::before{content:"";width:7px;height:7px;border-radius:50%;background:#fff;flex:none;}',
    '.chk{width:20px;height:20px;border-radius:50%;border:2px solid rgba(255,255,255,.75);flex:none;display:grid;place-items:center;transition:background .2s;}.chk.on{background:#fff;color:rgb(199,108,0);}',
    '.tip-b{font-size:14px;line-height:1.35;color:rgba(255,255,255,.92);}.tip-t{font-size:17px;font-weight:700;margin-bottom:6px;}',
    '.tip-in{transition:opacity .4s ease;}.tip-in.out{opacity:0;}',
    // ladder
    '.stage[data-hoehe="abwerfen"] .bento{grid-template-areas:"w1 w2";grid-template-rows:minmax(0,1fr);}.stage[data-hoehe="abwerfen"] .w34{display:none;}',
    '.stage[data-hoehe="boden"] .bento,.stage[data-mobile="true"] .bento{display:flex;flex-direction:column;height:auto;gap:16px;}',
    '.stage[data-hoehe="boden"] .w1,.stage[data-mobile="true"] .w1{height:520px;}.stage[data-mobile="true"] .w1,.stage[data-mobile="true"] .w2{height:50vh;max-height:50vh;overflow:hidden;}.stage[data-mobile="true"] .bento{padding-bottom:110px;gap:16px;}.stage[data-hoehe="boden"] .w2,.stage[data-mobile="true"] .w2{min-height:250px;}.stage[data-hoehe="boden"] .w34,.stage[data-mobile="true"] .w34{display:grid;gap:16px;}.stage[data-mobile="true"] .w34 .device-card{min-height:150px;}',
    '.stage[data-mobile="true"] .w1-body .device-grid-container{grid-template-columns:repeat(2,minmax(0,1fr));}',
    // three tabs (Favorites, Rooms, Suggestions) and three icons must share one row on a narrow phone: smaller tabs, and only the open tab shows its count
    '@media (max-width:430px){.stage[data-mobile="true"] .w1-tabs{gap:5px;}.stage[data-mobile="true"] .w1-head{gap:6px;padding-left:2px;padding-right:2px;}.stage[data-mobile="true"] .w1-tab{padding:7px 8px;font-size:12.5px;gap:4px;letter-spacing:-.02em;}.stage[data-mobile="true"] .w1-tab:not(.on) .cnt{display:none;}.stage[data-mobile="true"] .w1-view{gap:1px;padding:2px 1px;}.stage[data-mobile="true"] .w1-view button{width:20px;}}',
    '.stage[data-mobile="true"] .w1-head{gap:8px;}.stage[data-mobile="true"] .w1-tab{padding:7px 12px;}.stage[data-mobile="true"] .w1-view button{width:24px;}.stage[data-mobile="true"] .w1-view button.w1-edit{margin-left:0;}',      // the pencil is a third icon: a little tighter on a phone so the tabs and the three icons still fit one row
  ].join('\n');
  g.OkieMotor.extraCss = (g.OkieMotor.extraCss || []).concat([CSS]);

  function CT() { return g.OkieMotor.controls; }

  function render(container, ctx) {
    var t = function (k, v) { return core.t(k, ctx.lang(), v); };
    var cfg = function () { return ctx.settings.get().bento; };
    var registry = new Map();
    var tl = TL.create(ctx, registry);
    var root = h('div.bento', { dataset: { swap: ((ctx.settings.get().bento || {}).swap !== false) ? 'true' : 'false' } });
    container.appendChild(root);
    var disposers = [], timers = [];
    function timeOpts(o) { var tf = ctx.settings.get().timeFormat; o = o || { hour: 'numeric' }; if (tf === '12h') o.hour12 = true; else if (tf === '24h') o.hour12 = false; return o; }

    // ------------------------------------------------------------ W1 ----
    var w1 = null, w1body = null, tabEls = {}, viewEls = {};
    var richW1 = [];                                         // the tall cards of the list (they repaint with the states)
    var favPicked = false;                                   // the user chose the Favorites tab: show it even when it is empty
    function w1Mode(it) { var m = cfg().w1mode; return m === 'favorites' && !it.favorites.length && !favPicked ? 'suggestions' : m; }
    function w1Items() {
      var c = cfg(), right = c.rightCards || [], favs = ctx.settings.get().favorites.filter(function (id) { return right.indexOf(id) < 0; }).map(function (id) { return ctx.engine.getItem(id); }).filter(Boolean);
      return { favorites: favs, suggestions: ctx.suggestions(10), rooms: g.OkieMotor.rooms ? g.OkieMotor.rooms.rooms(ctx) : [] };
    }
    // ---- the two columns work as one: any card, in the list or in the right column, can be pulled over to the other column and dropped between its cards, or moved inside its own ----
    //   favorites stays the list of cards (its order is the order of the list). bento.rightCards / bento.rightOrder: which favorites, and with them which right-column cards (keys w:slider, w:deck, w:feeder),
    //   are in the right column and in which order. bento.leftWidgets: right-column cards that moved above the list.
    var lw = h('div.w1-widgets'), pinNodes = {}, placedOnce = false, stacks = [], sliders = [], dAll = [], built = false;
    /** The right-column cards by id: slider, deck, s2 ... (the slider cards: the first, the second ...) and feeder. */
    function widgetIds() { var ids = stacks.map(function (s, i) { return L.stackKey(i).slice(2); }); if (feederCard) ids.push('feeder'); return ids; }
    function widgetEl(id) { if (id === 'feeder') return feederCard ? feederCard.el : null; var sl = sliders[L.stackIndex('w:' + id)]; return sl ? sl.el : null; }
    function isWKey(k) { return String(k).indexOf('w:') === 0; }
    function keyEl(k) { return isWKey(k) ? widgetEl(k.slice(2)) : (pinNodes[k] || null); }
    function leftIds() { return (cfg().leftWidgets || []).filter(function (id) { return widgetIds().indexOf(id) >= 0 && widgetEl(id); }); }
    function defaultKeys() {
      var left = leftIds(), ids = widgetIds();
      if (root.dataset.swap === 'true' && ids.length > 1) ids = ids.slice(1).concat(ids[0]);      // swapped: the first card goes last
      return ids.filter(function (k) { return widgetEl(k) && left.indexOf(k) < 0; }).map(function (k) { return 'w:' + k; });
    }
    /** The cards of the right column in their order: the saved order, then whatever is not in it yet (the right-column cards first, then the favorites that moved over). */
    function rightKeys() {
      var c = cfg(), favs = ctx.settings.get().favorites || [], def = defaultKeys(), out = [];
      var cards = (c.rightCards || []).filter(function (id) { return favs.indexOf(id) >= 0 && ctx.engine.getItem(id); });
      (Array.isArray(c.rightOrder) ? c.rightOrder : []).forEach(function (k) { if (out.indexOf(k) < 0 && (isWKey(k) ? def.indexOf(k) >= 0 : cards.indexOf(k) >= 0)) out.push(k); });
      def.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
      cards.forEach(function (k) { if (out.indexOf(k) < 0) out.push(k); });
      return out;
    }
    /**
     * place(key, side, before): put a card in the left list or the right column. key: a favorite's id or w:slider / w:deck / w:feeder. before: what it goes in front of (a key of the right column, or a
     * favorite of the list); null = at the end (in the list: after the last favorite shown there).
     */
    function place(key, side, before) {
      var wid = isWKey(key) ? key.slice(2) : null, left = leftIds().filter(function (x) { return x !== wid; });
      var keys = rightKeys().filter(function (k) { return k !== key; }), favs = (ctx.settings.get().favorites || []).slice(), patch = {};
      if (side === 'right') {
        var at = before ? keys.indexOf(before) : -1; keys.splice(at >= 0 ? at : keys.length, 0, key);
      } else if (wid) {
        left.push(wid);
      } else {
        var f = favs.filter(function (x) { return x !== key; }), ia = before ? f.indexOf(before) : -1;
        if (ia < 0) { var shown = f.filter(function (x) { return keys.indexOf(x) < 0; }); ia = shown.length ? f.indexOf(shown[shown.length - 1]) + 1 : f.length; }
        f.splice(ia, 0, key); favs = f;
      }
      patch.leftWidgets = left; patch.rightOrder = keys; patch.rightCards = keys.filter(function (k) { return !isWKey(k); });
      ctx.settings.set({ favorites: favs, bento: patch });
    }
    /** A card of the right column dropped on another one: its pages join that card (they swipe one after the other there). */
    function mergeCards(fromKey, ontoKey) { var f = L.stackIndex(fromKey), o = L.stackIndex(ontoKey); if (f < 0 || o < 0 || f === o) return; saveStacks(L.mergeStacks(stacks, f, o)); }
    function sideFor(id, dir) { return { dir: dir, onMove: function () { place(id, dir, null); } }; }

    // ---- drag and drop between the columns, while the arrangement is edited. Hold a card for a moment and pull it (or pull its handle at once): a small card with its name follows the finger, the column
    // under it is framed and a line shows where it will land between that column's cards; let go there and it moves, let go outside and nothing happens. A tap on the arrow still moves it to the end ----
    var carryOn = false;
    root.addEventListener('touchmove', function (e) { if (carryOn && e.cancelable) e.preventDefault(); }, { passive: false, capture: true });
    // a carried card does not scroll anything under it (the listener is there from the start: one added during a touch may come too late). It is on the start screen only: a listener that can cancel makes every scroll under it wait for the page, so the other screens must not carry it (a touch always goes to the element it began on, so a drag out of the columns is still covered)
    disposers.push(function () { carryOn = false; });
    var noMenu = function (e) { if (editing && e.composedPath && e.composedPath().indexOf(root) >= 0) e.preventDefault(); };      // a long press while arranging is the card being picked up, not a menu
    window.addEventListener('contextmenu', noMenu, true); disposers.push(function () { window.removeEventListener('contextmenu', noMenu, true); });
    function xlog() { /* the drag works: nothing is logged any more */ }
    /** Where a card dropped at (x, y) would land: { side, before, lineY, col } or null when the finger is far from both columns. */
    function dropTarget(x, y, key) {
      var ra = UI.screenRect(w1), rb = UI.screenRect(wr), rt = UI.screenRect(root);
      if (rb.width <= 4 || y < rt.top - 60 || y > rt.bottom + 60) return null;
      var side = x > (ra.right + rb.left) / 2 ? 'right' : 'left', col = side === 'right' ? rb : ra, before = null, lineY = null, last = null, items = [];
      if (side === 'right' && L.stackIndex(key) >= 0) {      // a card of the right column held over the middle of another one: dropping it there merges its pages into that card
        var ks = rightKeys();
        for (var m = 0; m < ks.length; m++) {
          if (ks[m] === key || L.stackIndex(ks[m]) < 0) continue;
          var me = keyEl(ks[m]); if (!me || !me.isConnected) continue;
          var mr = UI.screenRect(me), mx = mr.width * 0.18, my = mr.height * 0.22;
          if (x > mr.left + mx && x < mr.right - mx && y > mr.top + my && y < mr.bottom - my) return { side: 'right', onto: ks[m], before: null, lineY: null, col: mr };
        }
      }
      if (side === 'right') items = rightKeys().filter(function (k) { return k !== key; }).map(function (k) { return { k: k, el: keyEl(k) }; });
      else if (!isWKey(key) && curOrd && curOrd.order) items = curOrd.order.filter(function (k) { return k !== key; }).map(function (k) { return { k: k, el: curOrd.nodes[k] }; });
      for (var i = 0; i < items.length; i++) {
        var el = items[i].el; if (!el || !el.isConnected) continue;
        var r = UI.screenRect(el);
        if (y < r.top + r.height / 2) { before = items[i].k; lineY = r.top - 7; break; }
        last = r;
      }
      if (lineY == null && last) lineY = last.bottom + 7;
      if (lineY != null) lineY = Math.max(col.top, Math.min(col.bottom, lineY));
      return { side: side, before: before, lineY: lineY, col: col };
    }
    function bindCarry(el, spec, o) {
      o = o || {};
      el.addEventListener('pointerdown', function (e) {
        if (!editing || (e.button != null && e.button !== 0) || el._carrying) return;
        if (!o.free && e.target.closest && e.target.closest('.grip,.rm-seg,.fv-x,.mv:not(.fv-side)')) return;
        carryFrom(e, el, spec, o, false);
      });
    }
    /** The drag of a card, started by a touch (preselected: it is already held, as after the hold that opened the arrangement). */
    function carryFrom(e, el, spec, o, preselected) {
      {
        var from = spec.from(), pid = e.pointerId, x0 = e.clientX, y0 = e.clientY, t0 = Date.now(), dragging = false, picked = false, ghost = null, zone = null, line = null, tg = null, pickT = 0, edgeT = 0, last = null;
        xlog({ ev: 'carry-down', on: (e.target.className && e.target.className.baseVal === undefined) ? String(e.target.className).slice(0, 40) : e.target.tagName, free: !!o.free, any: !!o.any, id: spec.label, from: from, type: e.pointerType });
        if (preselected) { picked = true; carryOn = true; el.classList.add('xpicked'); }
        else pickT = setTimeout(function () {      // held: the card is picked up. From now on this touch is the card's (nothing scrolls under it), whichever way the finger goes next
          if (dragging) return; picked = true; carryOn = true; el.classList.add('xpicked'); if (ctx.haptic) ctx.haptic('tap'); xlog({ ev: 'carry-picked' });
        }, 180);
        function done() {
          clearTimeout(pickT); clearInterval(edgeT);
          window.removeEventListener('pointermove', move, true); window.removeEventListener('pointerup', up, true); window.removeEventListener('pointercancel', cancel, true);
          [ghost, zone, line].forEach(function (n) { if (n && n.parentNode) n.parentNode.removeChild(n); });
          root.classList.remove('carrying'); el.classList.remove('xsrc', 'xpicked'); el._carrying = false; carryOn = false;
        }
        function begin(ev) {
          dragging = true; el._carrying = true; carryOn = true; root.classList.add('carrying'); el.classList.add('xsrc');
          try { if (curOrd && curOrd.sorter && curOrd.sorter.end) curOrd.sorter.end(true); if (g.OkieMotor.rooms && g.OkieMotor.rooms.endDrag) g.OkieMotor.rooms.endDrag(); } catch (er) { /* the card follows the ghost anyway */ }
          ghost = h('div.xghost', null, h('span.xg-ic', { html: UI.icon(spec.icon || 'grid', 18) }), h('span', null, spec.label));
          zone = h('div.xzone'); line = h('div.xline', { hidden: true });
          ctx.stage.appendChild(zone); ctx.stage.appendChild(line); ctx.stage.appendChild(ghost);
          try { el.setPointerCapture(pid); } catch (er) { /* the window listeners still get the moves */ }
          if (ctx.haptic && !picked) ctx.haptic('switch');
          xlog({ ev: 'carry-begin', dx: Math.round(ev.clientX - x0), dy: Math.round(ev.clientY - y0), picked: picked });
        }
        function move(ev) {
          if (ev.pointerId !== pid) return;
          if (!dragging) {
            var dx = ev.clientX - x0, dy = ev.clientY - y0, ax = Math.abs(dx), ay = Math.abs(dy);
            // the handle, and every card of the right column (its bars do not scroll while the arrangement is edited): any pull. A card of the list: held, sideways (up and down is the list's own
            // sorting); not held, mostly sideways, else it is a scroll and the list gets it.
            var scrolls = from === 'right' && wr.dataset.scrolls === 'true';      // a right column that does not scroll gives every pull to the drag
            var start = (o.any || (from === 'right' && (!scrolls || picked))) ? (ax > 8 || ay > 8) : picked ? ax > 14 : (ax > 14 && ax > ay * 1.1);
            if (start) begin(ev);
            else { if (!o.any && !picked && ay > 14) { xlog({ ev: 'carry-scroll', dx: Math.round(dx), dy: Math.round(dy) }); done(); } return; }
          }
          if (ev.cancelable) ev.preventDefault();
          last = { x: ev.clientX, y: ev.clientY }; aim();
        }
        // where the card would land now: the ghost, the frame of the column and the line; near the top or bottom of a column that scrolls, it scrolls
        function aim() {
          ghost.style.left = last.x + 'px'; ghost.style.top = last.y + 'px';
          tg = dropTarget(last.x, last.y, spec.key);
          var sc = tg ? (tg.side === 'right' ? wr : w1body) : null, dir = 0;
          if (tg && sc) { dir = last.y < tg.col.top + 56 ? -1 : last.y > tg.col.bottom - 56 ? 1 : 0; }
          clearInterval(edgeT); if (dir && sc && sc.scrollHeight > sc.clientHeight + 2) edgeT = setInterval(function () { sc.scrollTop += dir * 10; aim2(); }, 30);
          paint();
        }
        function aim2() { tg = dropTarget(last.x, last.y, spec.key); paint(); }
        function paint() {
          if (tg) {
            zone.classList.toggle('merge', !!tg.onto);
            zone.style.cssText = 'left:' + tg.col.left + 'px;top:' + tg.col.top + 'px;width:' + tg.col.width + 'px;height:' + tg.col.height + 'px;'; zone.classList.add('on');
            if (tg.lineY != null) { line.hidden = false; line.style.cssText = 'left:' + (tg.col.left + 10) + 'px;width:' + (tg.col.width - 20) + 'px;top:' + tg.lineY + 'px;'; } else line.hidden = true;
          } else { zone.classList.remove('on'); line.hidden = true; }
        }
        function up(ev) {
          if (ev.pointerId !== pid) return;
          var go = dragging && tg; xlog({ ev: 'carry-up', dragging: dragging, side: tg && tg.side, before: tg && tg.before, x: Math.round(ev.clientX), y: Math.round(ev.clientY) });
          var t = tg; done();
          if (dragging) { var sw = function (c) { c.stopPropagation(); c.preventDefault(); }; window.addEventListener('click', sw, true); setTimeout(function () { window.removeEventListener('click', sw, true); }, 350); }
          if (go) { if (ctx.haptic) ctx.haptic('tap'); if (t.onto) mergeCards(spec.key, t.onto); else place(spec.key, t.side, t.before); }
        }
        function cancel(ev) { if (ev.pointerId === pid) { xlog({ ev: 'carry-cancel', dragging: dragging, picked: picked, ms: Date.now() - t0 }); done(); } }
        window.addEventListener('pointermove', move, true); window.addEventListener('pointerup', up, true); window.addEventListener('pointercancel', cancel, true);
      }
    }
    /**
     * Hold a card of the right column (the sliding card, the cameras, the feeder, a favorite there) and the arrangement opens, like holding a card of the list; keep the finger down and pull to carry it.
     */
    function holdArrange(el, spec) {
      var timer = 0, sx = 0, sy = 0, last = null;
      function clear() { clearTimeout(timer); timer = 0; }
      el.addEventListener('pointerdown', function (e) {
        if (editing || (e.button || 0) !== 0 || e.target.closest('button,a,input,select,textarea,.chk,.row-hero,.pg-row.link,.wx-loc,.cam-pill,.hero-slide-pager,.sw,.row-sw,.qc-icon,.slider,.dial,.fv-sw')) return;
        sx = e.clientX; sy = e.clientY; last = e; clear();
        timer = setTimeout(function () {
          timer = 0; el.dataset.lp = '1'; setTimeout(function () { delete el.dataset.lp; }, 500);      // the finger that holds must not also open the card
          if (ctx.haptic) ctx.haptic('switch'); setEditing(true);
          carryFrom({ pointerId: last.pointerId, clientX: last.clientX, clientY: last.clientY, pointerType: last.pointerType, target: el }, el, spec, { free: true }, true);
        }, 450);
      });
      el.addEventListener('pointermove', function (e) { if (timer) { if (Math.hypot(e.clientX - sx, e.clientY - sy) > 8) clear(); else last = e; } });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { el.addEventListener(ev, clear); });
      el.addEventListener('contextmenu', function (e) { if (timer || editing) e.preventDefault(); });
    }
    function carrySpec(key, item) {
      var w = isWKey(key), id = w ? key.slice(2) : key;
      return {
        key: key,
        from: function () { return w ? (leftIds().indexOf(id) >= 0 ? 'left' : 'right') : (rightKeys().indexOf(key) >= 0 ? 'right' : 'left'); },
        label: w ? (id === 'feeder' ? core.t('fd.title', ctx.lang()) : stackLabel(L.stackIndex(key))) : L.shortName(item.name, item.area),
        icon: w ? (id === 'feeder' ? 'grid' : stackIcon(L.stackIndex(key))) : UI.domainIcon(item.domain, item.deviceClass, 'on'),
      };
    }
    /** The bar over a right-column card while the arrangement is edited: the same as a card of the list (handle, name, arrow). */
    function ensureOverlays(left) {
      var RM = g.OkieMotor.rooms;
      widgetIds().forEach(function (id) {
        var el = widgetEl(id); if (!el || !RM) return;
        var dest = left.indexOf(id) >= 0 ? 'right' : 'left', spec = carrySpec('w:' + id);
        var wm = [].filter.call(el.children, function (c) { return c.classList && c.classList.contains('wm'); })[0];
        if (!wm) { wm = h('div.fv-sw.wm'); el.appendChild(wm); bindCarry(wm, spec); holdArrange(el, spec); }
        if (wm.dataset.dest === dest) return;
        wm.dataset.dest = dest; wm.innerHTML = '';
        var grip = RM.gripButton(ctx); bindCarry(grip, spec, { free: true, any: true });
        wm.appendChild(grip); wm.appendChild(h('b', null, spec.label));
        if (id !== 'feeder') wm.appendChild(h('button.mv.fv-edit', { type: 'button', 'aria-label': t('b.edit_cards'), title: t('b.edit_cards'), html: UI.icon('pencil', 18), onclick: function (e) { e.stopPropagation(); if (ctx.haptic) ctx.haptic(8); editStack(L.stackIndex('w:' + id)); } }));      // which pages this card shows
        if (id === 'feeder' && FDm && FDm.openPicker) wm.appendChild(h('button.mv.fv-edit', { type: 'button', 'aria-label': core.t('fd.edit', ctx.lang()), title: core.t('fd.edit', ctx.lang()), html: UI.icon('pencil', 18), onclick: function (e) { e.stopPropagation(); if (ctx.haptic) ctx.haptic(8); FDm.openPicker(ctx, feederCard); } }));      // the look of the feeder card
        wm.appendChild(RM.sideButton(ctx, { dir: dest, onMove: function () { place('w:' + id, dest, null); } }));
      });
    }
    /** Puts every card where it belongs: the right column in its order (the favorites that moved over are cards of it), the moved right-column cards above the list. */
    function drawRight() {
      var RM = g.OkieMotor.rooms, left = leftIds(), keys = rightKeys();
      Object.keys(pinNodes).forEach(function (k) { var n = pinNodes[k]; if (n && n.parentNode) n.parentNode.removeChild(n); }); pinNodes = {};
      keys.forEach(function (k) {
        if (isWKey(k)) return;
        var x = ctx.engine.getItem(k); if (!x) return;
        var node = UI.guard(function () {
          return RM ? RM.listCard(ctx, x, tl.makeRow, function () { drawW1(true); }, richW1, { onRemove: function () { ctx.favorites.toggle(x.id); }, side: sideFor(x.id, 'left'), grip: function (gp) { bindCarry(gp, carrySpec(x.id, x), { free: true, any: true }); } }) : tl.makeRow(x);
        }, { label: 'tile ' + x.id, text: x.name, compact: true, retry: t('card.retry') });
        bindCarry(node, carrySpec(x.id, x)); holdArrange(node, carrySpec(x.id, x)); pinNodes[k] = node;
      });
      left.forEach(function (id) { var el = widgetEl(id); if (el) lw.appendChild(el); });
      placedOnce = true;
      keys.forEach(function (k) { var el = keyEl(k); if (el) wr.appendChild(el); }); if (tiles.length) wr.appendChild(w34);
      wr.appendChild(addWidgetsBtn);      // shown while the arrangement is edited, like Add or remove favorites
      ensureOverlays(left); layoutRight(keys, true);
    }
    /** The grid of the right column for the cards that are in it now (the stylesheet only knows the full set). */
    function layoutRight(keys, moved) {
      keys = keys || rightKeys(); moved = true;
      wr.dataset.moved = moved ? 'on' : ''; fadeSoon();
      var lay = L.rightLayout({ order: keys, reserve: sliders.length < 2 });
      keys.forEach(function (k, i) { var el = keyEl(k); if (el) { if (moved) el.style.setProperty('--okie-ga', lay.names[i]); else el.style.removeProperty('--okie-ga'); } });
      if (!moved) { wr.style.gridTemplateRows = ''; wr.style.gridTemplateAreas = ''; return; }
      wr.style.gridTemplateAreas = lay.areas; wr.style.gridTemplateRows = lay.rows;
    }

    // ---- the height of the Favorites / Suggestions area (stacked layouts: phones and short windows) ----
    var editing = false, HMIN = 200, HMAX = 1600;
    function zoomNow() { return (ctx.host && ctx.host._zoom) || 1; }
    function showHeight(px) {
      if (px >= HMIN) { ctx.stage.style.setProperty('--okie-w1h', px + 'px'); ctx.stage.dataset.w1h = 'custom'; }
      else { ctx.stage.style.removeProperty('--okie-w1h'); delete ctx.stage.dataset.w1h; }
    }
    function applyHeight() { showHeight(Math.round(+cfg().w1height) || 0); showHeightR(Math.round(+cfg().wrheight) || 0); }
    // ---- a tablet shows whole cards: a column may reach below the other one, but it never ends in the middle of a card, and both columns have the same length ----
    var w1extra = 0, fitting = false, wrGrip = null, lGrip = null, wrFrame = null, lFrame = null;
    function colBottoms(el) {      // the bottom edge of every card of a column (the list holds a container of cards, with a tall card in front of it when there is one, or the grid of tiles)
      var out = [];
      [].slice.call(el.children).forEach(function (c) {
        if (/(^|\s)(device-list-container|device-grid-container|w1-widgets)(\s|$)/.test(c.className)) [].slice.call(c.children).forEach(function (d) { out.push(d.offsetTop + d.offsetHeight); });
        else if (c.offsetHeight > 0 && c.className.indexOf('xg') < 0) out.push(c.offsetTop + c.offsetHeight);
      });
      return out.sort(function (a, b) { return a - b; });
    }
    function wrBox() { return wr && wr.isConnected ? wr.getBoundingClientRect() : null; }
    // ---- a card that does not fit fades out at the edge of its column instead of being cut in half. Each card gets a mask of its own (a mask on the column would take the picture away from a blurred card);
    // only the cards at an edge have one, and only while the column can still scroll that way ----
    var FADE = 60, fadeQ = 0;
    function colCards(el) {      // the cards of a column, one by one (the list holds a container of cards, a tall card in front of it, or the grid of tiles)
      var out = [];
      [].slice.call(el.children).forEach(function (c) {
        if (/(^|\s)(device-list-container|device-grid-container|w1-widgets)(\s|$)/.test(c.className)) [].slice.call(c.children).forEach(function (d) { out.push(d); });
        else if (c.className.indexOf('xg') < 0 && c.className.indexOf('wr-') < 0) out.push(c);
      });
      return out;
    }
    function fadeCol(sc) {
      if (!sc || !sc.isConnected || sc.clientHeight < 8 || getComputedStyle(sc).display === 'contents') return;
      var below = sc.scrollTop + sc.clientHeight < sc.scrollHeight - 2, above = sc.scrollTop > 2, cards = colCards(sc), want = [], i;
      if (below || above) {      // all the reads first, then the writes: no layout is forced in between
        var raw = sc.getBoundingClientRect(), k = raw.height ? UI.screenRect(sc).height / raw.height : 1, fadePx = FADE / (k || 1), rects = cards.map(function (c) { return c.getBoundingClientRect(); });
        for (i = 0; i < cards.length; i++) {
          var r = rects[i], v = '';
          if (r.height > 4 && r.bottom > raw.top - 4 && r.top < raw.bottom + 4) {      // a card that is out of sight has no mask
            var f = Math.min(.9, fadePx / r.height), T = (raw.top - r.top) / r.height, V = (raw.bottom - r.top) / r.height;
            if ((above && T + f > 0) || (below && V - f < 1)) v = 'linear-gradient(to bottom,' + (above ? 'transparent ' + (T * 100).toFixed(1) + '%,#000 ' + ((T + f) * 100).toFixed(1) + '%' : '#000 0%') + ',' + (below ? '#000 ' + ((V - f) * 100).toFixed(1) + '%,transparent ' + (V * 100).toFixed(1) + '%' : '#000 100%') + ')';
          }
          want.push(v);
        }
      }
      for (i = 0; i < cards.length; i++) {
        var c = cards[i], g = c.classList.contains('fv-item') && c.firstElementChild ? c.firstElementChild : c, w = want[i] || '';
        if ((g._fade || '') === w) continue;
        g._fade = w; g.style.webkitMaskImage = w; g.style.maskImage = w;
      }
    }
    var scrollT = 0;
    function scrolling() {      // a column is being scrolled: what only decorates (the stars of the weather card) stands still meanwhile
      if (ctx.stage.dataset.scrolling !== 'on') ctx.stage.dataset.scrolling = 'on';
      clearTimeout(scrollT); scrollT = setTimeout(function () { delete ctx.stage.dataset.scrolling; }, 160);
    }
    disposers.push(function () { clearTimeout(scrollT); delete ctx.stage.dataset.scrolling; });
    function fadeSoon() { if (fadeQ) return; fadeQ = requestAnimationFrame(function () { fadeQ = 0; fadeCol(w1body); fadeCol(wr); }); }
    function markScrolls() {
      if (!wr) return;
      wr.dataset.scrolls = wr.scrollHeight > wr.clientHeight + 2 ? 'true' : 'false';      // a column that does not scroll gives every touch to the drag
      positionGrip(); fadeSoon();
    }
    function fitW1() {
      var st = ctx.stage, host = ctx.host;
      if (fitting || !w1 || !w1body || !st || !host || !host._main || !w1body.isConnected) return;
      var wide = st.dataset.mobile !== 'true' && st.dataset.hoehe !== 'boden' && st.dataset.hoehe !== 'abwerfen' && st.dataset.detail !== 'open', auto = 0, panel = 0;
      st.style.setProperty('--okie-w1-extra', '0px'); st.style.setProperty('--okie-col-extra', '0px');                  // measure without the extra
      var z = host._zoom || 1, base = host._main.offsetHeight, room = Math.max(0, Math.floor((host._avail || 0) / z - base - 28)), gridH = root.offsetHeight;
      if (wide && st.dataset.tablet === 'true') {      // a tablet uses the room under the panel: always the same height (the window minus a margin), whatever tab or list is shown, so nothing jumps when you switch; a card at the edge fades out
        auto = Math.max(0, Math.floor(room - 0.10 * (host._avail || 0) / z));
      }
      panel = auto;
      if (wide) panel = L.panelExtra(auto, gridH, room, [cfg().w1height, cfg().wrheight], HMIN);      // a height set with a handle makes the panel as tall as the taller column (see panelExtra)
      st.style.setProperty('--okie-col-extra', auto + 'px'); st.style.setProperty('--okie-w1-extra', panel + 'px');
      st.dataset.w1grow = panel !== 0 || auto > 0 ? 'true' : 'false';
      if (panel !== w1extra) { w1extra = panel; fitting = true; try { host._measure(); } finally { fitting = false; } }      // the columns got taller: centre them again
      requestAnimationFrame(markScrolls);
    }
    function showHeightR(px) {
      if (px >= HMIN) { ctx.stage.style.setProperty('--okie-wrh', px + 'px'); ctx.stage.dataset.wrh = 'custom'; }
      else { ctx.stage.style.removeProperty('--okie-wrh'); delete ctx.stage.dataset.wrh; }
    }
    function positionGrip() {      // the frame of each column and the handle on its bottom line, in screen pixels (they are in the stage, not in the zoomed columns)
      var pad = Math.round(20 * zoomNow());
      [[w1, lFrame, lGrip, 0], [wr, wrFrame, wrGrip, pad]].forEach(function (c) {
        var el = c[0], fr = c[1], gr = c[2], padX = c[3];
        if (!fr || !gr) return;
        var on = !!el && el.isConnected && editing && !(ctx.host && ctx.host._nav && ctx.host._nav.mode !== 'start') && el.getBoundingClientRect().width > 4 && getComputedStyle(el).display !== 'contents';
        fr.hidden = gr.hidden = !on; if (!on) return;
        var sr = UI.screenRect(el), x = sr.left - padX, y = sr.top - pad, w = sr.width + 2 * padX, hh = sr.height + 2 * pad;
        fr.style.left = x + 'px'; fr.style.top = y + 'px'; fr.style.width = w + 'px'; fr.style.height = hh + 'px';
        gr.style.left = (x + w / 2 - 60) + 'px'; gr.style.top = (y + hh - 20) + 'px';
      });
    }
    function mkGrip(cls) {
      var grip = h('div.col-grip.' + cls, { role: 'separator', 'aria-orientation': 'horizontal', 'aria-label': t('b.grip'), title: t('b.grip'), tabindex: '0', hidden: true }, h('i'));
      ctx.stage.appendChild(grip); disposers.push(function () { if (grip.parentNode) grip.parentNode.removeChild(grip); });
      return grip;
    }
    /** The handle under the right column, like the one under the list: drag it to set the height of the column (double tap: back to automatic). */
    function buildWrGrip() {
      var grip = mkGrip('wr-grip');
      var dragging = false, y0 = 0, h0 = 0, last = 0;
      function commit(px) { last = px; ctx.settings.set({ bento: { wrheight: px } }); }
      grip.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        dragging = true; y0 = e.clientY; h0 = wr.offsetHeight; last = h0; try { grip.setPointerCapture(e.pointerId); } catch (er) { /* the moves still arrive */ } e.preventDefault();
      });
      grip.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        last = Math.max(HMIN, Math.min(HMAX, snapped('right', Math.round(h0 + (e.clientY - y0) / zoomNow())))); showHeightR(last); fitW1();
      });
      var end = function () { if (!dragging) return; dragging = false; showGuide('right', null); lastSnap = null; commit(last); };
      grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
      grip.addEventListener('dblclick', function () { commit(0); });
      lFrame = h('div.col-frame', { hidden: true }); wrFrame = h('div.col-frame', { hidden: true });
      [lFrame, wrFrame].forEach(function (f) { ctx.stage.appendChild(f); disposers.push(function () { if (f.parentNode) f.parentNode.removeChild(f); }); });
      if (typeof ResizeObserver !== 'undefined') { var ro = new ResizeObserver(function () { positionGrip(); fadeSoon(); }); ro.observe(wr); if (w1) ro.observe(w1); disposers.push(function () { ro.disconnect(); }); }
      wr.addEventListener('scroll', function () { fadeSoon(); scrolling(); }, { passive: true });
      var again = function () { if (editing) requestAnimationFrame(positionGrip); };
      window.addEventListener('resize', again); window.addEventListener('scroll', again, true); disposers.push(function () { window.removeEventListener('resize', again); window.removeEventListener('scroll', again, true); });
      return grip;
    }
    var snap = null, curOrd = null, holder = null, editBarEl = null;      // the Reset / Done bar sits at the bottom middle of the screen (in the stage)
    function setEditing(on) {
      var was = editing;
      editing = !!on && !!w1;
      if (!w1) return;
      if (editing && !was) { var st0 = ctx.settings.get(); snap = { favorites: (st0.favorites || []).slice(), roomsOrder: (st0.roomsOrder || []).slice(), w1height: Math.round(+cfg().w1height) || 0, wrheight: Math.round(+cfg().wrheight) || 0, rightOrder: (cfg().rightOrder || null), rightCards: (cfg().rightCards || []).slice(), leftWidgets: (cfg().leftWidgets || []).slice() }; }      // what Reset goes back to
      if (!editing) snap = null;
      w1.classList.toggle('editing', editing); root.classList.toggle('arranging', editing); if (editBarEl) editBarEl.classList.toggle('on', editing);      // the right side shows its arrows too
      var pen = w1.querySelector('.w1-edit'); if (pen) { pen.classList.toggle('on', editing); pen.setAttribute('aria-pressed', editing ? 'true' : 'false'); }
      requestAnimationFrame(markScrolls);
    }
    // a tap outside the two columns (and the bar, the sheets and an open card) ends the arrangement: what was changed is saved already, so Done is not needed
    var outTap = function (e) {
      if (!editing || carryOn || (e.button != null && e.button > 0)) return;
      var path = e.composedPath ? e.composedPath() : [e.target];
      if (path.some(function (el) { return el === w1 || el === wr || el === editBarEl || (el && el.classList && (el.classList.contains('ov-layer') || el.classList.contains('detail-wrap') || el.classList.contains('col-grip'))); })) return;
      var near = [lFrame, wrFrame].some(function (f) { if (!f || f.hidden) return false; var r = f.getBoundingClientRect(); return e.clientX >= r.left - 24 && e.clientX <= r.right + 24 && e.clientY >= r.top - 24 && e.clientY <= r.bottom + 24; });      // grabbing the dashed line itself is not a tap outside
      if (near) return;
      setEditing(false);
    };
    window.addEventListener('pointerdown', outTap, true); disposers.push(function () { window.removeEventListener('pointerdown', outTap, true); });
    /**
     * The heights a column pulled with its handle sticks to: the automatic height, the height of the other column (both the same: a line shows it) and the heights that end right after a whole card.
     * side: the column that is pulled. Returns [{ v, kind }] in px of the column.
     */
    function snapTargets(side) {
      var own = side === 'left' ? w1 : wr, other = side === 'left' ? wr : w1, out = [], gridH = root.offsetHeight;
      out.push({ v: gridH, kind: 'grid' });
      if (other && other.offsetHeight > 4) out.push({ v: other.offsetHeight, kind: 'other' });
      var body = side === 'left' ? w1body : wr, head = side === 'left' ? Math.max(0, w1.offsetHeight - w1body.clientHeight) : 0;
      if (body) colBottoms(body).forEach(function (b) { out.push({ v: Math.round(head + b + 24), kind: 'card' }); });
      return out;
    }
    var guide = null;
    function showGuide(side, hit) {      // a dotted line at the bottom of the other column while the pulled one is the same height
      if (!(hit && hit.kind === 'other')) { if (guide && guide.parentNode) guide.parentNode.removeChild(guide); guide = null; return; }
      var other = side === 'left' ? wr : w1, r = UI.screenRect(other), ra = UI.screenRect(w1), rb = UI.screenRect(wr);
      if (!guide) { guide = h('div.hguide'); ctx.stage.appendChild(guide); }
      guide.style.cssText = 'left:' + Math.min(ra.left, rb.left) + 'px;width:' + (Math.max(ra.right, rb.right) - Math.min(ra.left, rb.left)) + 'px;top:' + (r.bottom - 1) + 'px;';
    }
    var lastSnap = null;
    function snapped(side, px) {      // px: the height under the finger -> the height to use
      var s0 = L.snapHeight(px, snapTargets(side), 22);
      if ((s0.hit && s0.hit.v) !== (lastSnap && lastSnap.v)) { if (s0.hit && ctx.haptic) ctx.haptic('detent'); lastSnap = s0.hit; }
      showGuide(side, s0.hit);
      return s0.h;
    }
    function wireGrip(grip) {
      var dragging = false, y0 = 0, h0 = 0, last = 0;
      function commit(px) { last = px; ctx.settings.set({ bento: { w1height: px } }); }
      grip.addEventListener('pointerdown', function (e) {
        if (e.button) return;
        dragging = true; y0 = e.clientY; h0 = w1.offsetHeight; last = h0;
        try { grip.setPointerCapture(e.pointerId); } catch (er) {}
        w1.classList.add('sizing'); e.preventDefault();
      });
      grip.addEventListener('pointermove', function (e) {
        if (!dragging) return;
        last = Math.max(HMIN, Math.min(HMAX, snapped('left', Math.round(h0 + (e.clientY - y0) / zoomNow()))));
        showHeight(last); fitW1();
      });
      var end = function () { if (!dragging) return; dragging = false; w1.classList.remove('sizing'); showGuide('left', null); lastSnap = null; commit(last); };
      grip.addEventListener('pointerup', end); grip.addEventListener('pointercancel', end);
      grip.addEventListener('dblclick', function () { commit(0); });      // back to the automatic height
      grip.addEventListener('keydown', function (e) {
        var d = e.key === 'ArrowDown' ? 24 : e.key === 'ArrowUp' ? -24 : 0;
        if (e.key === 'Home') { e.preventDefault(); commit(0); return; }
        if (!d) return;
        e.preventDefault(); commit(Math.max(HMIN, Math.min(HMAX, Math.round(w1.offsetHeight + d))));
      });
    }
    function buildW1() {
      var c = cfg();
      w1 = h('section.w1.carousel');
      var tabs = h('div.w1-tabs', { role: 'tablist' });
      ['favorites', 'rooms', 'suggestions'].forEach(function (id) {
        var cnt = h('span.cnt'), b = h('button.w1-tab' + (c.w1mode === id ? '.on' : ''), { role: 'tab', 'aria-selected': c.w1mode === id ? 'true' : 'false', onclick: function () { favPicked = id === 'favorites'; ctx.settings.set({ bento: { w1mode: id } }); drawW1(true); } }, h('span', null, t('b.' + id)), cnt);
        tabEls[id] = { btn: b, cnt: cnt }; tabs.appendChild(b);
      });
      var view = h('div.w1-view');
      [['grid', 'b.view_tiles'], ['list', 'b.view_list']].forEach(function (p) {
        var b = h('button' + (c.w1layout === p[0] ? '.on' : ''), { 'aria-label': t(p[1]), 'aria-pressed': c.w1layout === p[0] ? 'true' : 'false', onclick: function () { ctx.settings.set({ bento: { w1layout: p[0] } }); drawW1(true); }, html: UI.icon(p[0] === 'grid' ? 'grid' : 'rows', 14) });
        viewEls[p[0]] = b; view.appendChild(b);
      });
      var pen = h('button.w1-edit', { 'aria-label': t('b.resize'), title: t('b.resize'), 'aria-pressed': 'false', onclick: function () { setEditing(!editing); }, html: UI.icon('pencil', 14) });
      view.appendChild(pen);
      w1body = h('div.w1-body', { dataset: { top: 'true', bottom: 'false' } });
      w1body.addEventListener('scroll', edge, { passive: true });
      if (lGrip && lGrip.parentNode) lGrip.parentNode.removeChild(lGrip);
      var grip = lGrip = mkGrip('w1-grip');
      w1.appendChild(h('div.w1-head', null, tabs, view)); w1.appendChild(w1body);
      var AR = g.OkieMotor.arrange;
      if (AR) {
        if (editBarEl && editBarEl.parentNode) editBarEl.parentNode.removeChild(editBarEl);
        editBarEl = AR.editBar(ctx, { onDone: function () { setEditing(false); }, onReset: function () { if (!snap) return; ctx.settings.set({ favorites: snap.favorites, roomsOrder: snap.roomsOrder, bento: { w1height: snap.w1height, wrheight: snap.wrheight, rightOrder: snap.rightOrder, rightCards: snap.rightCards, leftWidgets: snap.leftWidgets } }); } });
        ctx.stage.appendChild(editBarEl); editBarEl.classList.toggle('on', editing);
        if (holder) holder.dispose();
        holder = AR.hold(ctx, w1body, { current: function () { return curOrd; }, layout: function () { return cfg().w1layout === 'list' ? 'list' : 'grid'; }, editing: function () { return editing; }, enter: function () { setEditing(true); } });
      }
      wireGrip(grip, pen);
      applyHeight();
      return w1;
    }
    function edge() {
      var el = w1body;
      el.dataset.top = el.scrollTop <= 1 ? 'true' : 'false';
      el.dataset.bottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 2 ? 'true' : 'false';
      fadeSoon(); scrolling();
    }
    var w1sig = '', w1key = '';
    function favOrdering(items) {      // dragging and the arrows over the favorites while the pencil is on
      var RM = g.OkieMotor.rooms, ids = items.map(function (x) { return x.id; }), o = { order: ids, nodes: {}, remove: function (id) { ctx.favorites.toggle(id); } };
      o.save = function (next) { ctx.settings.set({ favorites: RM.mergeOrder(ctx.settings.get().favorites, next) }); if (ctx.haptic) ctx.haptic(8); };
      o.sorter = RM.createSorter(ctx, { scroller: function () { return w1body; }, nodes: function () { return o.nodes; }, order: function () { return ids; }, apply: o.save });
      return o;
    }
    function drawW1(force) {
      var c = cfg(), it = w1Items();
      var mode = w1Mode(it);
      var sig = [mode, c.w1layout, it.favorites.map(function (x) { return x.id; }).join(','), it.suggestions.map(function (x) { return x.id; }).join(','), mode === 'rooms' && g.OkieMotor.rooms ? g.OkieMotor.rooms.signature(ctx) : '', JSON.stringify(ctx.settings.get().cardStyle || {}), (c.leftWidgets || []).join(','), (c.rightCards || []).join(','), (Array.isArray(c.rightOrder) ? c.rightOrder.join(',') : '')].join('|');
      if (!force && sig === w1sig) return;
      w1sig = sig;
      Object.keys(tabEls).forEach(function (id) { var on = mode === id; tabEls[id].btn.classList.toggle('on', on); tabEls[id].btn.setAttribute('aria-selected', on ? 'true' : 'false'); tabEls[id].cnt.textContent = String(it[id].length); });
      Object.keys(viewEls).forEach(function (id) { var on = c.w1layout === id; viewEls[id].classList.toggle('on', on); viewEls[id].setAttribute('aria-pressed', on ? 'true' : 'false'); });
      var items = it[mode], list = c.w1layout === 'list', RM = g.OkieMotor.rooms;
      var key = mode + '|' + c.w1layout, keep = key === w1key ? w1body.scrollTop : 0; w1key = key;      // the same list drawn again (a card moved, a device switched) stays where it was
      if (RM && RM.endDrag) RM.endDrag();
      registry.clear(); richW1 = []; w1body.innerHTML = ''; w1body.scrollTop = 0; curOrd = null;
      drawRight();
      if (lw.children.length) w1body.appendChild(lw);      // the cards moved over from the right sit above the list
      if (mode === 'rooms') { var rc = RM.renderCards(ctx, list ? 'list' : 'grid', w1body); curOrd = rc._order || null; w1body.appendChild(rc); w1body.scrollTop = keep; requestAnimationFrame(edge); return; }
      if (mode === 'favorites' && g.OkieMotor.lightModes) { var lms = g.OkieMotor.lightModes.strip(ctx, { favorites: true }); if (lms) w1body.appendChild(lms); }      // the light modes: fancy cards above your favorites
      if (!items.length) { w1body.appendChild(h('div.w1-hint', null, mode === 'favorites' ? t('b.nofav') : t('b.nothing_yet'))); if (mode === 'favorites' && g.OkieMotor.rooms) w1body.appendChild(g.OkieMotor.rooms.addButton(ctx, 'favorites')); edge(); return; }
      var grid = h('div.' + (list ? 'device-list-container' : 'device-grid-container'));
      var fav = mode === 'favorites' && RM ? favOrdering(items) : null; curOrd = fav;
      items.forEach(function (x) {
        var node = UI.guard(function () {
          if (list && RM) return RM.listCard(ctx, x, tl.makeRow, function () { drawW1(true); }, richW1, fav ? { onRemove: function () { ctx.favorites.toggle(x.id); }, order: fav, side: sideFor(x.id, 'right') } : null);      // the thermostat and the TV can be tall cards, as in a room
          var tile = list ? tl.makeRow(x) : tl.makeTile(x);
          if (fav) fav.side = sideFor(x.id, 'right');
          return fav ? RM.tileOrder(ctx, tile, x, fav) : tile;
        }, { label: 'tile ' + x.id, text: x.name, compact: true, retry: t('card.retry') });
        if (fav) {
          fav.nodes[x.id] = node; var spec = carrySpec(x.id, x); bindCarry(node, spec);
          var g0 = node.querySelector && node.querySelector('.fv-sw .grip'); if (g0) bindCarry(g0, spec, { free: true });      // the handle sorts up and down; pulled sideways it carries the card over
        }
        grid.appendChild(node);
      });
      w1body.appendChild(grid);
      if (mode === 'favorites' && RM) w1body.appendChild(RM.addButton(ctx, 'favorites'));      // shown while the pencil is on
      w1body.scrollTop = keep;
      requestAnimationFrame(edge);
    }

    // ------------------------------------------------------------ W2 ----
    function weatherId() {
      var hs = ctx.hass(), id = ctx.settings.get().weather_entity;
      return (id && hs.states[id]) ? id : Object.keys(hs.states).filter(function (k) { return k.indexOf('weather.') === 0; })[0];
    }
    function feeds() { return F.newsFeeds(ctx.hass().states, cfg().news_entity); }
    function readKeys() { return ctx.store.get('news.read', []); }
    var DEFAULT_PAGES = ['weather', 'todos', 'news', 'calendar', 'tips'];
    /** Every page that can be on a card of the right column, in the order the editor lists them: [{ id, label, icon, note }]. */
    function catalog() {
      var out = [['weather', 'sun'], ['todos', 'checklist'], ['news', 'newsbook'], ['calendar', 'calendar'], ['tips', 'tips']].map(function (x) { return { id: x[0], label: t('b.' + x[0]), icon: x[1], note: pageAvailable(x[0]) ? '' : t('b.unavailable') }; });
      dAll.forEach(function (x) { out.push({ id: 'd:' + x.id, label: x.label, icon: x.icon, note: '' }); });
      return out;
    }
    function pageInfo(id) { return catalog().filter(function (x) { return x.id === id; })[0] || { id: id, label: id, icon: 'grid' }; }
    function stackLabel(i) { var ids = stacks[i] || []; if (!ids.length) return t('b.slider_name'); return pageInfo(ids[0]).label + (ids.length > 1 ? ' +' + (ids.length - 1) : ''); }
    function stackIcon(i) { var ids = stacks[i] || []; return ids.length ? pageInfo(ids[0]).icon : 'grid'; }
    function allPages() { var out = []; sliders.forEach(function (sl) { out = out.concat(sl.pages); }); return out; }
    function buildPages(ids) {
      var P = [];
      ids.forEach(function (id) {
        if (id.indexOf('d:') === 0) {
          var x = dAll.filter(function (q) { return 'd:' + q.id === id; })[0];
          if (x) P.push({ id: id, icon: x.icon, label: x.label, make: function (el) { el.classList.add('deckpage'); el.appendChild(x.el); return { update: function () {} }; } });
          return;
        }
        if (id === 'weather' && weatherId()) P.push({ id: id, icon: 'sun', make: pageWeather });
        else if (id === 'todos' && F.todoEntities(ctx).length) P.push({ id: id, icon: 'checklist', make: pageTodos });
        else if (id === 'news' && feeds().length) P.push({ id: id, icon: 'newsbook', make: pageNews });
        else if (id === 'calendar' && F.calendarEntities(ctx).length) P.push({ id: id, icon: 'calendar', make: pageCalendar });
        else if (id === 'cameras' && g.OkieMotor.cameras && g.OkieMotor.cameras.cameras(ctx).length) P.push({ id: id, icon: 'camera', make: pageCameras });
        else if (id === 'tips') P.push({ id: id, icon: 'tips', make: pageTips });
      });
      return P;
    }
    /**
     * One swipeable card of the right column with the pages `ids`: one page after the other (a swipe, the dots, or by itself), the pause button, the pencil.
     * Every card has its own state, so there can be several of them. Returns { el, pages, go, update, show, drawFoot, dispose }.
     */
    function makeSlider(ids, k) {
      var el = h('section.w2.rich', { role: 'region', 'aria-roledescription': 'carousel', 'aria-label': stackLabel(k) });
      var bgs = h('div.w2-bgs'), track = h('div.w2-track'), foot = h('div.w2-foot'), pager = h('div.hero-slide-pager');
      var pages = [], idx = 0, slideTimer = 0, restT = 0, paused = false, userPaused = false;
      el.appendChild(bgs); el.appendChild(track); el.appendChild(foot); el.appendChild(pager);
      function setPaused(hover) { paused = hover; pager.dataset.paused = (hover || userPaused) ? 'true' : 'false'; }
      function labelOf(p) { return p.label || t('b.' + p.id); }
      function drawPager() {
        pager.innerHTML = ''; pager.classList.toggle('single', pages.length < 2);
        pages.forEach(function (p, i) { pager.appendChild(h('button.hsp-dot' + (i === idx ? '.on' : ''), { 'aria-label': t('b.page', { n: i + 1 }) + ', ' + labelOf(p), 'aria-current': i === idx ? 'true' : null, onclick: function () { go(i); } })); });
        if (pages.length > 1) pager.appendChild(h('button.hsp-pp', { 'aria-label': userPaused ? t('b.play') : t('b.pause'), onclick: function () { userPaused = !userPaused; setPaused(paused); drawPager(); }, html: UI.icon(userPaused ? 'play' : 'pause', 12) }));
        pager.appendChild(h('button.hsp-ed', { 'aria-label': t('b.edit'), title: t('b.edit'), onclick: function (e) { e.stopPropagation(); editStack(k); }, html: UI.icon('pencil', 13) }));
        pager.dataset.paused = (paused || userPaused) ? 'true' : 'false';
      }
      function drawFoot() {
        var p = pages[idx]; foot.innerHTML = ''; if (!p) return;
        if (p.id === 'weather' || p.id.indexOf('d:') === 0) return;      // a deck page has its own caption; the weather card says the place and the condition at the top: a caption under the hours only overlapped them (the other cards keep theirs: "To-do / 5 Incomplete")
        var sub = p.inst && p.inst.subtitle ? p.inst.subtitle() : '';
        foot.appendChild(h('span.f1', null, labelOf(p))); if (sub) foot.appendChild(h('span.f2', null, sub));
      }
      function go(i, silent) {
        if (!pages.length) return;
        idx = (i + pages.length) % pages.length;
        track.style.transform = 'translateX(' + (-100 * idx) + '%)';
        pages.forEach(function (p, kk) { p.bg.classList.toggle('on', kk === idx); p.el.setAttribute('aria-hidden', kk === idx ? 'false' : 'true'); p.el.style.visibility = ''; });
        clearTimeout(restT); restT = setTimeout(function () { pages.forEach(function (p, kk) { if (p.el) p.el.style.visibility = kk === idx ? '' : 'hidden'; }); }, 700);      // at rest only the page in view is drawn (the track is one wide layer of all of them)
        drawPager(); drawFoot();
        if (!silent) startSlide();
      }
      function startSlide() {
        clearInterval(slideTimer);
        var sec = Math.max(3, cfg().slideSec || 8);
        el.style.setProperty('--slide-ms', sec * 1000 + 'ms');
        slideTimer = setInterval(function () { if (!paused && !userPaused && pages.length > 1 && document.visibilityState !== 'hidden') go(idx + 1); }, sec * 1000);
      }
      pages = buildPages(ids);
      if (!pages.length) {
        bgs.appendChild(h('div.w2-bg.on', { style: { background: 'linear-gradient(160deg,rgb(74,144,226),rgb(42,108,178))' } })); track.appendChild(h('div.w2-page', null, h('div.empty-pg', null, t('b.no_widgets'))));
        pager.appendChild(h('button.hsp-ed', { 'aria-label': t('b.edit'), title: t('b.edit'), onclick: function (e) { e.stopPropagation(); editStack(k); }, html: UI.icon('pencil', 13) }));
      } else {
        pages.forEach(function (p) {
          var b = BRAND[p.id] || (p.id.indexOf('d:') === 0 ? BRAND.cameras : BRAND.weather);
          p.bg = h('div.w2-bg', { style: { background: 'linear-gradient(160deg,rgb(' + b[0] + '),rgb(' + b[1] + '))' } }); bgs.appendChild(p.bg);
          p.el = h('div.w2-page', { dataset: { page: p.id }, 'aria-hidden': 'true' }); track.appendChild(p.el);
          p.inst = p.make(p.el, p) || {};
        });
        el.style.setProperty('--slide-ms', Math.max(3, cfg().slideSec || 8) * 1000 + 'ms');
        go(0, true);
        // swipe (a drag of more than 50px changes the page) + pause while the pointer or focus is inside
        var sx = 0, dx = 0, drag = false;
        el.addEventListener('pointerdown', function (e) { if (e.target.closest('button,.chk,.row-hero,.pg-row.link,.wx-loc')) return; drag = true; sx = e.clientX; dx = 0; });
        el.addEventListener('pointermove', function (e) { if (drag) dx = e.clientX - sx; });
        var endDrag = function () { if (!drag) return; drag = false; if (Math.abs(dx) > 50) { el.dataset.swiped = '1'; setTimeout(function () { delete el.dataset.swiped; }, 350); go(idx + (dx < 0 ? 1 : -1)); } };
        el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', function () { drag = false; });
        el.addEventListener('pointerenter', function () { setPaused(true); }); el.addEventListener('pointerleave', function () { setPaused(false); });
        el.addEventListener('focusin', function () { setPaused(true); }); el.addEventListener('focusout', function () { setPaused(false); });
        // a tap on the card itself (not on a row, a button or a link in it) opens what the page is about: the weather, the tasks, the news ...
        el.addEventListener('click', function (e) {
          if (el.dataset.swiped || el.dataset.lp || e.target.closest('button,a,input,.chk,.row-hero,.pg-row,.nw-row,.news-r,.wx-loc,.hero-slide-pager,[role="link"],[role="button"]')) return;
          var pg = pages[idx]; if (!pg || pg.id.indexOf('d:') === 0) return;      // a deck page (cameras, Kindle ...) opens itself
          if (ctx.haptic) ctx.haptic('tap');
          if (pg.id === 'weather') { var wid = weatherId(); if (wid) ctx.openDetail(wid); }
          else ctx.openApp({ todos: 'tasks', news: 'news', calendar: 'calendar', tips: 'tips', cameras: 'cameras' }[pg.id] || pg.id);
        });
        if (pages.length > 1) startSlide();
      }
      return { el: el, pages: pages, go: go, drawFoot: drawFoot,
        update: function () { pages.forEach(function (p) { if (p.inst && p.inst.update) p.inst.update(); }); if (pages.length) drawFoot(); },
        show: function () { pages.forEach(function (p) { if (p.inst && p.inst.reload) p.inst.reload(); }); },
        dispose: function () { clearInterval(slideTimer); clearTimeout(restT); } };
    }
    function pageHead(icon, title, sub, extra) {
      return h('div.page-head', null, h('span.ph-bubble', { html: UI.icon(icon, 18) }), h('div', null, h('div.ph-t', null, title), h('div.ph-s', null, sub || '')), extra || null);
    }

    function pageWeather(el, p) {
      var WX = g.OkieMotor.weather;      // the sky (the same picture, stars at night) of the weather screen (okie-weather)
      var loc = h('span'), tEl = h('div.wx-temp'), cEl = h('div.wx-cond'), hl = h('div.wx-hl'), art = h('div.wx-art'), hours = h('div.wx-hours'), stars = WX ? WX.makeStars() : null;
      var bg0 = p && p.bg ? p.bg.style.background : '', lastKey = '';
      if (stars) { stars.classList.add('wx-stars'); el.appendChild(stars); }
      el.appendChild(h('div.wx-loc', { role: 'button', tabindex: '0', onclick: function () { var id = weatherId(); if (id) ctx.openDetail(id); } }, loc, h('span', { html: UI.icon('chevron', 14) })));
      el.appendChild(h('div.wx-main', null, tEl, h('div.wx-side', null, cEl, hl)));
      el.appendChild(art);
      el.appendChild(hours);
      var loadedH = 0, loadedD = 0, hourly = [], daily = [];
      function fetchFc(type, wid, done) {
        Promise.resolve(ctx.callWS({ type: 'call_service', domain: 'weather', service: 'get_forecasts', target: { entity_id: wid }, service_data: { type: type }, return_response: true })).then(function (r) {
          done((((r && r.response) || {})[wid] || {}).forecast || []);
        }, function () { done([]); });
      }
      function drawHours() {
        hours.innerHTML = '';
        var now = Date.now(), list = hourly.filter(function (f) { return Date.parse(f.datetime) >= now - 3600000; }).slice(0, 6);
        list.forEach(function (f) {
          var hr = new Date(f.datetime).getHours(), mini = WX ? WX.picture(WX.iconKind(f.condition, hr < 6 || hr >= 20), 'wxd-mini') : h('span', { html: UI.icon(UI.domainIcon('weather', null, f.condition), 24) });
          hours.appendChild(h('div.wx-h', null, h('span.tm', null, new Date(f.datetime).toLocaleTimeString(ctx.lang(), timeOpts({ hour: 'numeric' }))), mini, h('span.tp', null, f.temperature != null ? Math.round(f.temperature) + '°' : '–')));
        });
        hours.hidden = !list.length;
      }
      function update() {
        var hs = ctx.hass(), wid = weatherId(), st = wid && hs.states[wid]; if (!st) return;
        var a = st.attributes;
        loc.textContent = (hs.config && hs.config.location_name) || (WX ? WX.placeName(a.friendly_name) : a.friendly_name) || '';
        tEl.textContent = a.temperature != null ? Math.round(a.temperature) + '°' : '–';
        cEl.textContent = WX ? WX.condText(ctx.lang(), st.state) : ctx.formatState(st);
        var d0 = daily[0];
        hl.textContent = d0 && d0.temperature != null ? t('b.hl', { h: Math.round(d0.temperature), l: d0.templow != null ? Math.round(d0.templow) : '–' }) : (a.humidity != null ? t('b.humidity', { h: a.humidity }) : '');
        var sunSt = hs.states['sun.sun'], night = WX ? WX.isNight(sunSt && sunSt.state, st.state, new Date().getHours()) : false, key = st.state + '|' + night;
        if (WX && key !== lastKey) {
          lastKey = key; art.innerHTML = ''; art.appendChild(WX.picture(WX.iconKind(st.state, night), 'wxd-art.wx-pic'));
          el.dataset.night = String(night);
          if (p && p.bg) p.bg.style.background = night ? WX.skyBg(true, st.state) : bg0;      // day keeps the card's own blue
          if (stars) stars.style.display = night ? '' : 'none';
        }
        if (Date.now() - loadedH > 15 * 60000) { loadedH = Date.now(); fetchFc('hourly', wid, function (f) { hourly = f; drawHours(); }); }
        if (Date.now() - loadedD > 60 * 60000) { loadedD = Date.now(); fetchFc('daily', wid, function (f) { daily = f; update(); }); }
      }
      update();
      return { update: update, subtitle: function () { var st = ctx.state(weatherId()); return st ? (WX ? WX.condText(ctx.lang(), st.state) : ctx.formatState(st)) : ''; } };
    }

    function pageCalendar(el) {
      var loaded = 0, evs = [], body = h('div.page-body');
      el.appendChild(pageHead('calendar', t('b.calendar'), '')); el.appendChild(body);
      var hero = null;
      function draw() {
        body.innerHTML = '';
        var hid = F.hiddenCalendars(ctx), n = F.nextEvents(evs.filter(function (e) { return hid.indexOf(e.calendar) < 0; }), Date.now(), 5); hero = n.hero;
        if (!n.hero) { body.appendChild(h('div.empty-pg', null, t('b.no_events'))); return; }
        body.appendChild(h('div.row-hero', { role: 'button', tabindex: '0', onclick: function () { ctx.openApp('calendar'); } }, h('div.t', null, n.hero.title), h('div.s', null, F.eventLabel(n.hero, Date.now(), ctx.lang()) + (n.hero.location ? ' · ' + n.hero.location : ''))));
        n.rest.slice(0, 3).forEach(function (e) { body.appendChild(h('div.pg-row.link', { onclick: function () { ctx.openApp('calendar'); } }, h('span.t', null, e.title), h('span.d', null, F.eventLabel(e, Date.now(), ctx.lang())))); });
      }
      function load() { loaded = Date.now(); var now = Date.now(); var hid0 = F.hiddenCalendars(ctx); F.fetchEvents(ctx, now - 3600000, now + 14 * F.DAY, F.calendarEntities(ctx).filter(function (id) { return hid0.indexOf(id) < 0; })).then(function (list) { evs = list; draw(); }); }
      load(); draw();
      return { update: function () { if (Date.now() - loaded > 5 * 60000) load(); }, reload: load, subtitle: function () { return hero ? hero.title : ''; } };
    }

    function pageTodos(el) {
      var loaded = 0, items = [], sig = '', body = h('div.page-body'), head = pageHead('checklist', t('b.todos'), '');
      el.appendChild(head); el.appendChild(body);
      var view = { overdue: [], today: [], upcoming: [], undated: [] };
      function draw() {
        body.innerHTML = '';
        view = F.todoView(items, Date.now());
        var open = view.overdue.length + view.today.length + view.upcoming.length + view.undated.length;
        head.querySelector('.ph-s').textContent = t('b.incomplete', { n: open }) + (view.overdue.length ? ' · ' + t('b.overdue_n', { n: view.overdue.length }) : '');
        var rows = view.overdue.concat(view.today, view.upcoming, view.undated).slice(0, 6);
        if (!rows.length) { body.appendChild(h('div.empty-pg', null, t('b.no_todos'))); return; }
        rows.forEach(function (it) {
          var od = view.overdue.indexOf(it) >= 0;
          var chk = h('button.chk', { 'aria-label': it.summary, role: 'checkbox', 'aria-checked': 'false', onclick: function (e) {
            e.stopPropagation(); chk.classList.add('on'); chk.innerHTML = UI.icon('check', 12);
            ctx.call('todo', 'update_item', { entity_id: it.list, item: it.uid || it.summary, status: 'completed' }).then(function () { setTimeout(load, 400); }, function () { chk.classList.remove('on'); chk.innerHTML = ''; ctx.toast('error', it.summary); });
          } });
          body.appendChild(h('div.pg-row' + (od ? '.od' : ''), null, chk, h('span.t', null, it.summary), it._due ? h('span.d', null, F.dueLabel(it, Date.now(), ctx.lang())) : null));
        });
      }
      function load() { loaded = Date.now(); F.fetchTodos(ctx).then(function (list) { items = list; draw(); refreshTiles(); }); }
      load(); draw();
      return { update: function () {
        var s = F.todoEntities(ctx).map(function (id) { return id + (ctx.state(id) || {}).state; }).join('|');
        if (s !== sig) { sig = s; load(); } else if (Date.now() - loaded > 5 * 60000) load();
      }, reload: load, counts: function () { var v = view; return { open: v.overdue.length + v.today.length + v.upcoming.length + v.undated.length, overdue: v.overdue.length }; },
        subtitle: function () { var v = view, n = v.overdue.length + v.today.length + v.upcoming.length + v.undated.length; return t('b.incomplete', { n: n }); } };
    }

    function pageNews(el) {
      var tab = 'unread', body = h('div.page-body'), head;
      var tabs = h('div.ph-tabs');
      head = pageHead('newsbook', t('b.news'), '', tabs); el.appendChild(head); el.appendChild(body);
      var sig = '', times = [];
      function draw() {
        var fs = feeds(), read = readKeys(), c = F.newsCounts(fs, read);
        var sg = tab + '|' + F.newsList(fs, read, tab, 5).map(function (e) { return e.key + (e.unread ? '*' : ''); }).join(',') + '|' + c.unread + '|' + c.feeds;
        if (sg === sig) {      // nothing new: the pictures stay, only the "17 min ago" texts move on
          times.forEach(function (x) { var w = x.e.published && !isNaN(Date.parse(x.e.published)) ? L.relativeTime(Date.now() - Date.parse(x.e.published), ctx.lang()) : ''; var txt = [x.e.feed, w].filter(Boolean).join(' · '); if (x.el.textContent !== txt) x.el.textContent = txt; });
          return;
        }
        sig = sg; times = [];
        tabs.innerHTML = '';
        ['unread', 'read'].forEach(function (k) { tabs.appendChild(h('button.ph-tab' + (k === tab ? '.on' : ''), { onclick: function () { tab = k; draw(); } }, t('b.' + k))); });
        head.querySelector('.ph-s').textContent = c.unread + ' ' + t('b.unread').toLowerCase() + ' · ' + (c.feeds === 1 ? t('b.feed_1') : t('b.feeds_n', { n: c.feeds }));
        body.innerHTML = '';
        var list = F.newsList(fs, read, tab, 5);
        if (!list.length) { body.appendChild(h('div.empty-pg', null, t('b.no_news'))); return; }
        list.forEach(function (e) {
          var when = e.published && !isNaN(Date.parse(e.published)) ? L.relativeTime(Date.now() - Date.parse(e.published), ctx.lang()) : '';
          body.appendChild(h('div.pg-row.link.nw-row', { role: 'link', tabindex: '0', onclick: function () {
            if (e.unread) { var r = readKeys().slice(); r.push(e.key); ctx.store.set('news.read', r.slice(-600)); }
            if (e.link) window.open(e.link, '_blank', 'noopener'); draw();
          } }, e.image ? h('img.nw-i', { src: e.image, alt: '', loading: 'lazy', referrerpolicy: 'no-referrer' }) : null,
          h('div.nw-m', null, h('div.nw-t', null, e.title), (function () { var sEl = h('div.nw-s', null, [e.feed, when].filter(Boolean).join(' · ')); times.push({ e: e, el: sEl }); return sEl; })())));
        });
      }
      draw();
      return { update: draw, subtitle: function () { var c = F.newsCounts(feeds(), readKeys()); return t('b.new_articles_l', { n: c.unread }); } };
    }

    var tipIdx = 0;
    function pageCameras(el, p) {
      var CM = g.OkieMotor.cameras, shown = '', timer = 0;
      var pic = h('div.cam-pic'), shade = h('div.cam-pageshade');
      p.bg.appendChild(pic); p.bg.appendChild(shade);
      var badge = h('i.cam-badge', { hidden: true });
      var wrap = h('span.cam-bellwrap', { dataset: { alert: 'false' } }, h('span.cam-bell', { html: UI.icon('bell', 28) }), badge);
      var pill = h('button.cam-pill', { type: 'button', 'aria-label': t('cam.view') }, h('span.cam-pill-ic', { html: UI.icon('expand', 20) }), h('span', null, t('cam.view')));
      UI.pullPill(pill, function () { ctx.openApp('cameras'); });
      el.appendChild(h('div.cam-cluster', null, wrap, pill));
      el.addEventListener('click', function () { ctx.openApp('cameras'); });
      var list = [], alerts = 0;
      function setPicture(url, fallback) {            // preload, so a slow or failing picture never blanks the card; the built-in house is the fallback
        if (!url || url === shown) return; shown = url;
        var img = new Image();
        img.onload = function () { pic.style.backgroundImage = 'url("' + String(url).replace(/"/g, '%22') + '")'; pic.classList.add('on'); };
        img.onerror = function () { if (fallback && fallback !== url) { shown = ''; setPicture(fallback); } };
        img.src = url;
      }
      function visible() { return el.getAttribute('aria-hidden') === 'false' && document.visibilityState !== 'hidden'; }
      function refreshPicture(force) {
        var cc = ctx.settings.get().cameras || {};
        if (cc.image) { setPicture(cc.image); return; }
        var c = cc.snapshot ? list.filter(function (x) { return !x.unavailable && x.picture; })[0] : null;
        if (c) { if (force || visible()) { shown = ''; setPicture(CM.snapUrl(ctx, c.id), g.OkieMotor.cameraArt); } return; }
        setPicture(g.OkieMotor.cameraArt);
      }
      function draw() {
        list = CM.cameras(ctx);
        alerts = list.reduce(function (n, c) { return n + c.alerts.length; }, 0);
        wrap.dataset.alert = alerts ? 'true' : 'false'; badge.hidden = !alerts; badge.textContent = String(alerts);
        wrap.setAttribute('aria-label', alerts ? (alerts === 1 ? t('cam.alert_1') : t('cam.alert_n', { n: alerts })) : '');
      }
      draw(); refreshPicture(true);
      timer = setInterval(function () { draw(); refreshPicture(false); }, 30000); timers.push(timer);
      return { update: function () { draw(); if (!pic.classList.contains('on')) refreshPicture(false); }, reload: function () { draw(); refreshPicture(true); }, subtitle: function () { return CM.countLabel(ctx, list.length) + (alerts ? ' · ' + (alerts === 1 ? t('cam.alert_1') : t('cam.alert_n', { n: alerts })) : ''); } };
    }

    function pageTips(el) {
      var inner = h('div.tip-in'), body = h('div.page-body');
      el.appendChild(pageHead('tips', t('b.tips'), '')); body.appendChild(inner); el.appendChild(body);
      function show() { var tips = F.TIPS[ctx.lang() === 'de' ? 'de' : 'en'], tp = tips[tipIdx % tips.length]; inner.innerHTML = ''; inner.appendChild(h('div.tip-t', null, tp.t)); inner.appendChild(h('div.tip-b', null, tp.b)); }
      show();
      var tm = setInterval(function () { if (document.visibilityState === 'hidden') return; inner.classList.add('out'); setTimeout(function () { tipIdx++; show(); inner.classList.remove('out'); }, 350); }, 9000);
      timers.push(tm);
      el.addEventListener('click', function () { ctx.openApp('tips'); });
      return { subtitle: function () { return t('b.tip_n', { n: (tipIdx % F.TIPS.en.length) + 1 }); } };
    }

    // --------------------------------------------------------- W3, W4 ----
    var tiles = [];
    function refreshTiles() { tiles.forEach(function (x) { if (x._upd) x._upd(); }); }
    function sysTile(kind) {
      if (kind === 'todos') {
        var tt = tl.makeSystemTile({ label: t('b.todos'), icon: 'checklist', color: 'rgb(0,122,255)', open: function () { ctx.openApp('tasks'); } });
        tt._upd = function () {
          var p = allPages().filter(function (x) { return x.id === 'todos'; })[0], c = p && p.inst && p.inst.counts ? p.inst.counts() : null;
          if (!c) { F.fetchTodos(ctx).then(function (list) { var v = F.todoView(list, Date.now()); tt.set(t('b.incomplete', { n: v.overdue.length + v.today.length + v.upcoming.length + v.undated.length }), t('b.overdue_n', { n: v.overdue.length })); }); return; }
          tt.set(t('b.incomplete', { n: c.open }), t('b.overdue_n', { n: c.overdue }));
        };
        tt.set(t('b.incomplete', { n: 0 }), t('b.overdue_n', { n: 0 }));
        return tt;
      }
      if (kind === 'news') {
        var nt = tl.makeSystemTile({ label: t('b.news'), icon: 'newsbook', color: 'rgb(255,149,0)', open: function () { ctx.openApp('news'); } });
        nt._upd = function () { var c = F.newsCounts(feeds(), readKeys()); nt.set(t('b.new_articles', { n: c.unread }), c.feeds === 1 ? t('b.feed_1') : t('b.feeds_n', { n: c.feeds })); };
        nt._upd();
        return nt;
      }
      if (kind === 'tips') {
        var tp = tl.makeSystemTile({ label: t('b.tips'), icon: 'tips', color: 'rgb(107,105,224)', open: function () { ctx.openApp('tips'); } });
        tp._upd = function () { var n = F.TIPS.en.length; tp.set(t('b.tips'), t('b.tip_n', { n: (tipIdx % n) + 1 })); };
        tp._upd();
        return tp;
      }
      if (kind === 'chronicle') {
        var ch = tl.makeSystemTile({ label: t('b.chronicle'), icon: 'clock', color: 'rgb(72,72,80)', open: function () { if (g.OkieMotor.notify && g.OkieMotor.notify.openCenter) g.OkieMotor.notify.openCenter(ctx, ch, 'history'); } });
        ch._upd = function () {
          var rec = ctx.chronicle ? ctx.chronicle.recent(1)[0] : null;
          if (!rec) { ch.set(t('b.chronicle'), t('b.nothing_yet')); return; }
          ch.set(L.relativeTime(Date.now() - rec.ts, ctx.lang()), L.shortName(rec.name, rec.area) + ' · ' + rec.text);
        };
        ch._upd();
        return ch;
      }
      return null;
    }


    // ---------------------------------------------- edit the cards of a slider ----
    /**
     * A card with a list: every card the slider can show, in the order it shows them, each with a switch, and a handle to drag it to another place.
     * spec: { title, items: [{ id, label, icon, on, note }], minOn, onChange(idsOn in order), onReset() -> items }. Changes are kept at once.
     */
    function openEditor(spec) {
      var items = spec.items.slice(), RM = g.OkieMotor.rooms;
      ctx.sheet({ title: spec.title, width: 'min(440px,100%)', content: function (close) {
        var box = h('div'), list = h('div.pe-list');
        function ids() { return items.map(function (x) { return x.id; }); }
        function onIds() { return items.filter(function (x) { return x.on; }).map(function (x) { return x.id; }); }
        function save() { spec.onChange(onIds()); }
        function draw() {
          list.innerHTML = '';
          var nodes = {}, onN = onIds().length;
          items.forEach(function (x) {
            var sw = h('button.pe-sw' + (x.on ? '.on' : ''), { type: 'button', role: 'switch', 'aria-checked': x.on ? 'true' : 'false', 'aria-label': x.label, disabled: x.on && onN <= (spec.minOn == null ? 1 : spec.minOn), onclick: function () { x.on = !x.on; if (ctx.haptic) ctx.haptic('switch'); save(); draw(); } });
            var grip = h('button.pe-grip', { type: 'button', 'aria-label': x.label, html: UI.icon('rows', 18) });
            var row = h('div.pe-row' + (x.on ? '' : '.off'), { dataset: { id: x.id } }, grip, h('span.pe-ic', { html: UI.icon(x.icon || 'eye', 18) }), h('span.pe-t', null, h('b', null, x.label), x.note ? h('em', null, x.note) : null), sw);
            nodes[x.id] = row; list.appendChild(row);
          });
          if (RM && RM.createSorter) {
            var sorter = RM.createSorter(ctx, { scroller: function () { return list; }, nodes: function () { return nodes; }, order: ids, apply: function (next) { items = next.map(function (id) { return items.filter(function (x) { return x.id === id; })[0]; }); save(); draw(); } });
            Array.prototype.forEach.call(list.children, function (row) { row.firstChild.addEventListener('pointerdown', function (e) { sorter.start(e, row.dataset.id); }); });
          }
        }
        draw();
        box.appendChild(h('div.pe-hint', null, t('b.edit_hint'))); box.appendChild(list);
        box.appendChild(h('div.pe-foot', null, h('button', { type: 'button', onclick: function () { items = spec.onReset(); draw(); } }, t('b.reset')), h('button.done', { type: 'button', onclick: close }, t('b.done'))));
        return box;
      } });
    }
    // a long press on a slider (not on a button, link or chip) opens its editor too
    function longPressEdit(el, open) {
      var timer = 0, sx = 0, sy = 0;
      function clear() { clearTimeout(timer); timer = 0; }
      el.addEventListener('pointerdown', function (e) {
        if ((e.button || 0) !== 0 || e.target.closest('button,a,input,.chk,.row-hero,.pg-row.link,.wx-loc,.cam-pill,.hero-slide-pager')) return;
        sx = e.clientX; sy = e.clientY; clear();
        timer = setTimeout(function () { timer = 0; el.dataset.lp = '1'; setTimeout(function () { delete el.dataset.lp; }, 500); if (ctx.haptic) ctx.haptic('switch'); open(); }, 600);
      });
      el.addEventListener('pointermove', function (e) { if (timer && Math.hypot(e.clientX - sx, e.clientY - sy) > 8) clear(); });
      ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) { el.addEventListener(ev, clear); });
      el.addEventListener('contextmenu', function (e) { if (timer) e.preventDefault(); });
    }
    var PAGE_META = { weather: 'sun', todos: 'checklist', news: 'newsbook', calendar: 'calendar', cameras: 'camera', tips: 'tips' };
    function pageAvailable(id) {
      if (id.indexOf('d:') === 0) return true;
      if (id === 'weather') return !!weatherId();
      if (id === 'todos') return !!F.todoEntities(ctx).length;
      if (id === 'news') return !!feeds().length;
      if (id === 'calendar') return !!F.calendarEntities(ctx).length;
      if (id === 'cameras') return !!(g.OkieMotor.cameras && g.OkieMotor.cameras.cameras(ctx).length);
      return true;
    }
    /** Which cards the right column has, as the stacks of pages in the settings. */
    function loadStacks() { stacks = L.migrateStacks(cfg(), { known: catalog().map(function (x) { return x.id; }), deck: dAll.map(function (x) { return 'd:' + x.id; }), w2: !!c0.w2 }); }
    function saveStacks(next) {
      var map = L.stackMap(stacks, next), c = cfg(), left = (c.leftWidgets || []).map(function (id) { return 'w:' + id; });
      var order = Array.isArray(c.rightOrder) ? L.remapStackKeys(c.rightOrder, map) : c.rightOrder, lw2 = L.remapStackKeys(left, map).map(function (k) { return k.slice(2); });
      stacks = next; ctx.settings.set({ bento: { stacks: next, rightOrder: order, leftWidgets: lw2 } }); rebuildSliders();
    }
    /** The cards are built again (their pages, their order): the old ones go, the new ones take their place. */
    function rebuildSliders() {
      sliders.forEach(function (sl) { sl.dispose(); if (sl.el.parentNode) sl.el.parentNode.removeChild(sl.el); });
      sliders = stacks.map(function (ids, i) { return makeSlider(ids, i); });
      if (built) drawRight();      // the first time the cards are placed when the list is drawn
    }
    // Add or remove widgets: every page there is, on or off. A page switched on gets a card of its own (drop it on another card to merge them); off takes it from its card.
    function openWidgets() {
      function itemsFor() { var on = L.cleanStacks(stacks, catalog().map(function (x) { return x.id; })).reduce(function (a, st) { return a.concat(st); }, []); return catalog().map(function (x) { return Object.assign({ on: on.indexOf(x.id) >= 0 }, x); }).sort(function (a, b) { return (b.on ? 1 : 0) - (a.on ? 1 : 0); }); }
      openEditor({ title: t('b.add_widgets'), items: itemsFor(), minOn: 0,
        onChange: function (idsOn) { var next = stacks.map(function (st) { return st.slice(); }); catalog().forEach(function (x) { var on = idsOn.indexOf(x.id) >= 0, now = next.some(function (st) { return st.indexOf(x.id) >= 0; }); if (on && !now) next = L.addPage(next, x.id); else if (!on && now) next = L.removePage(next, x.id); }); saveStacks(next); },
        onReset: function () { ctx.settings.set({ bento: { stacks: null, rightOrder: null, leftWidgets: [] } }); loadStacks(); rebuildSliders(); return itemsFor(); } });
    }
    // The pages of one card: switch them on or off, and the order they come in. Pages that are on no card can be added here too.
    function editStack(k) {
      var mine = (stacks[k] || []).slice(), others = []; stacks.forEach(function (st, i) { if (i !== k) others = others.concat(st); });
      function itemsFor(on) { var rest = catalog().filter(function (x) { return on.indexOf(x.id) < 0 && others.indexOf(x.id) < 0; }); return on.map(pageInfo).map(function (x) { return Object.assign({ on: true }, x); }).concat(rest.map(function (x) { return Object.assign({ on: false }, x); })); }
      openEditor({ title: t('b.edit_cards'), items: itemsFor(mine), minOn: 1,
        onChange: function (idsOn) { var next = stacks.map(function (st) { return st.slice(); }); next[k] = idsOn.slice(); saveStacks(next.filter(function (st) { return st.length; })); },
        onReset: function () { ctx.settings.set({ bento: { stacks: null, rightOrder: null, leftWidgets: [] } }); loadStacks(); rebuildSliders(); return itemsFor((stacks[0] || []).slice()); } });
    }
    // ---------------------------------------------------------- build ----
    var c0 = cfg();
    if (c0.w1) root.appendChild(buildW1());
    var wr = h('div.wright');                                  // the right side: the sliding card, the cameras card, the feeder card
    var camCard = null, CMod = g.OkieMotor.cameras;
    if (c0.camerasCard !== false && CMod && CMod.buildCard && CMod.cameras(ctx, true).length) camCard = CMod.buildCard(ctx);
    var SNm = g.OkieMotor.sensors, sensCard = c0.sensorsCard !== false && SNm && SNm.buildCard && SNm.count(ctx) ? SNm.buildCard(ctx) : null;      // the sensors card: a page after the cameras
    // the cameras card and, beside or under it, the Kindle, the AWTRIX and the home map
    var GDm = g.OkieMotor.gadgets, gcards = c0.gadgetCards !== false && GDm && GDm.buildCards ? GDm.buildCards(ctx) : [];
    // the cameras card, the sensors card, the Kindle, the AWTRIX and the home map are pages of the cards of the right column, like the weather and the tasks
    if (camCard) dAll.push({ id: 'cameras', label: t('b.cameras'), icon: 'camera', el: camCard.el });
    if (sensCard) dAll.push({ id: 'sensors', label: core.t('app.sensors', ctx.lang()), icon: 'door', el: sensCard.el });
    gcards.forEach(function (c) { var id = c.el.dataset.gadget; dAll.push({ id: id, label: c.el.getAttribute('aria-label') || id, icon: id === 'map' ? 'home' : 'gadget', el: c.el }); });
    var addWidgetsBtn = h('button.rm-add.wr-add', { type: 'button', html: UI.icon('plus', 22) + '<span>' + t('b.add_widgets') + '</span>', onclick: function () { openWidgets(); } });
    loadStacks(); rebuildSliders();
    if (dAll.length) root.dataset.cams = 'on';
    var w34 = h('div.w34');
    [c0.w3, c0.w4].forEach(function (k) { var el = sysTile(k); if (el) { tiles.push(el); w34.appendChild(el); } });
    if (tiles.length) wr.appendChild(w34);
    var FDm = g.OkieMotor.feeder, feederCard = c0.feederCard !== false && FDm && FDm.buildCard ? FDm.buildCard(ctx) : null;      // under the cameras card
    function applyFeederHeight() { if (feederCard) wr.style.setProperty('--okie-feed-h', FDm.heightOf(feederCard.design()) + 'px'); }      // the row of the right column is as high as the design of the card
    if (feederCard) { wr.appendChild(feederCard.el); wr.dataset.feeder = 'on'; applyFeederHeight(); }
    if (wr.children.length) root.appendChild(wr);
    wrGrip = buildWrGrip();
    if (w1) drawW1(true); else drawRight();
    built = true;
    if (w1body && typeof MutationObserver === 'function') {
      var mo = new MutationObserver(function () { requestAnimationFrame(fitW1); });
      mo.observe(w1body, { childList: true });
      disposers.push(function () { mo.disconnect(); });
    }
    if (typeof ResizeObserver === 'function') {      // the start view has no size while the lock page is up: fit the list when it gets one (and again after a rotation)
      var roFit = new ResizeObserver(function () { requestAnimationFrame(fitW1); });
      roFit.observe(root); disposers.push(function () { roFit.disconnect(); });
    }
    if (ctx.bus && ctx.bus.on) { var offNav = ctx.bus.on('nav', function (n) { if (editing && n && n.mode !== 'start') setEditing(false); }); disposers.push(function () { if (typeof offNav === 'function') offNav(); }); }      // opening a card, a device or an app ends the arrangement
    if (ctx.bus && ctx.bus.on) { var offFit = ctx.bus.on('resize', function () { fitW1(); }); disposers.push(function () { if (typeof offFit === 'function') offFit(); }); }
    requestAnimationFrame(fitW1);
    timers.push(setInterval(function () { tiles.forEach(function (x) { if (x._upd) x._upd(); }); }, 30000));

    // Home Assistant's row height for the small tiles follows the grid height
    function sizeRows() { var gh = root.clientHeight; if (gh) root.style.setProperty('--w34-row-height', Math.round(Math.min(200, Math.max(150, gh * 0.42))) + 'px'); }
    var ro = null;
    if (typeof ResizeObserver === 'function') { ro = new ResizeObserver(sizeRows); ro.observe(root); }
    requestAnimationFrame(sizeRows);
    disposers.push(ctx.settings.on('change', function (p) { if (p && p.bento && p.bento.swap !== undefined) root.dataset.swap = ((ctx.settings.get().bento || {}).swap !== false) ? 'true' : 'false'; if (p && (p.favorites || p.bento || p.rooms !== undefined || p.roomEdits !== undefined || p.roomsExtra !== undefined || p.roomsHidden !== undefined || p.roomsOrder !== undefined || p.roomNames !== undefined || p.cardStyle !== undefined)) drawW1(false); if (p && p.bento && (p.bento.w1height !== undefined || p.bento.wrheight !== undefined)) { applyHeight(); fitW1(); } if (p && p.bento && p.bento.feederDesign !== undefined && feederCard) { feederCard.update(); applyFeederHeight(); fitW1(); fadeSoon(); } }));

    return {
      el: root,
      update: function () {
        registry.forEach(function (el, id) { var s = ctx.state(id); if (s && s !== el._lastState) tl.paint(el, el._item, s); });
        richW1.forEach(function (c) { c.update(); });
        sliders.forEach(function (sl) { sl.update(); });
        tiles.forEach(function (x) { if (x._upd) x._upd(); });
        drawW1(false);
        if (camCard) camCard.update(); if (sensCard) sensCard.update(); gcards.forEach(function (c) { c.update(); }); if (feederCard) feederCard.update();
      },
      show: function () { drawW1(false); sliders.forEach(function (sl) { sl.show(); }); fadeSoon(); },      // back on the start screen: the list is redrawn only when something in it changed (settings and states keep it current while it is away)
      stagger: function () { root.classList.add('stagger'); setTimeout(function () { root.classList.remove('stagger'); }, 2000); },
      dispose: function () { sliders.forEach(function (sl) { sl.dispose(); }); timers.forEach(clearInterval); if (camCard) camCard.dispose(); if (sensCard) sensCard.dispose(); if (feederCard) feederCard.dispose(); if (ro) ro.disconnect(); disposers.forEach(function (d) { d(); }); },
      _go: function (i) { if (sliders[0]) sliders[0].go(i); },
    };
  }

  g.OkieMotor.bento = { render: render, CSS: CSS };
})(typeof globalThis !== 'undefined' ? globalThis : window);

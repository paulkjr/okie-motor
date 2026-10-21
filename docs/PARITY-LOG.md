# Parity log: Okie Motor vs Fast Search Card (FSC)

How it is measured: `tools-local/rig` (outside the repo) runs the REAL FSC bundle (byte-identical to the user's server copy, plus the user's
`okie-ai-bridge.js` + `okie-default-settings.js`) and this build side by side on a snapshot of the live Home Assistant data, in the built-in
browser pane (animations and hover work there), at desktop (1512x768) and phone (393x703, the iPhone's real page size) viewports.
`cmp.snap/diff/textRows` compare every rendered element (rect, text rect, fonts, colours, radius, blur, transitions) by class name.

## Fixed (verified against the real card)
- Phone lock page: curtain was `position: fixed` (anchored under the HA header) -> anchored in the card like FSC; date/clock/status/greeting text
  rects, sizes, weights, colours identical; island placed 44px under the text block (FSC measures `--zen-island-y`, no constants).
- Lock text = `sensor.quote_of_the_day` (the user's FSC bridge replaces the greeting with it); `zen.text: auto|quote|greeting|none`.
- Phone start screen: container full width (no 10px side padding), status bar 64, notification button 40, search row 74 / paddings
  13px 61px 13px 16px, category icon 19, actions 35, carousel header/tab metrics, card grid 172.5 square, widget heights 50vh, gaps 16.
- No 1px glass border (FSC's `--glass-border-color` is not defined in the real page, so its panels have no border).
- Phone dock: first 4 items + "more" when more than 5 (FSC rule), 44px round buttons, no active-page highlight, popup in the flow above the pill
  (dock grows to 392px), 35px radius, no blur, spring entrance, backdrop INSIDE the dock under the popup.
- BUG (user report): tapping "Settings" (any row) in the phone "more" popup did nothing: the full-screen backdrop sat above the popup and caught
  every tap. Fixed by FSC's structure.
- Dock desktop: one spring (stiffness 380, damping 32) slides the pill +144px while labels open 128px + 16px margin (icons never move).
- Names like FSC: Changelog, Energy Dashboard, weather entity name, Tasks, Schedules Overview.
- Category + filter popups (FSC `Ok` morph window): small glass window right at the button (category: 353x159 at the button, close button
  36px 14px under it; filter: 280 wide, right edges aligned), grows out of the button (.52s, ease .34/1.28/.32/1), shrinks back (.5s,
  ease .45/0/.15/1), content fades in blurred after .12s, glides when the info text opens. Round choices use the browser's own button
  font like FSC (Arial in Chrome). Choosing a filter keeps the window open; choosing a category closes it. Phone padding 18/18/16 only
  under 768px, 22/22/18 above. Rects identical to the real card on 393x703 and 1280x760.
- Dim: `position: fixed` over the whole window (z 9998, rgba(20,20,24,.28), blur 2.8px) mounted in the shadow root, outside the stage's
  `overflow: hidden`, so it covers and blurs the Home Assistant toolbar and tab bar (the stage clip is the suspect behind the phone report).
  Every other sheet uses the same dim now.
- "Apps" -> "Custom" / "Benutzerdefiniert" in the category choices (the app tiles still say "Apps").

## Backlog (found, not yet done)
- Island: FSC morphs ONE element (`.island-pill`, width/min-height/padding/radius spring .46s) between knopf / mini / geraete / meldungen; mine
  swaps separate overlays. Port the morph + `island-schliesser` (29px) + live/notification columns.
- Lock context line rotates every 3 min over: next calendar event (<12h), overdue / due-today tasks, last house event (FSC `US()`).
- Suggestions ranking: FSC lists vacuum "Home Robot" before the "On" switches; mine ranks active switches first. Favorites: FSC reads
  `fsc_favorites_snapshot_v1`; import on first run.
- Search input internals (container 24, overlay 30), typewriter caret timing, tile state text ("Cooling · 70° → 70°" vs "Cooling").
- Desktop pass (dock height 429 vs 424, input offset, hero pager has no pill in FSC, tile padding 1.5px).
- Detail view, settings pages, apps (news, tasks, schedules, calendar, energy, tips, changelog), notifications, rest mode.

# FSC layout spec (measured 2026-10-06 from the user's live Fast Search Card v1.1.2471, read-only)

All numbers are "design px": FSC lays out at a 1200 px content width and scales the whole thing with CSS
`zoom` on `.main-container` for viewports >= 700 px: `zoom = clamp(0.65, 0.65 + ((vw - 1080) / 520) * 0.35, 1)`.
Below 768 px it switches to the mobile layout (no zoom, bottom dock, stacked bento).

Source of truth for further detail: the live stylesheet (2,219 rules) and `Fast-Search-Card/dist/fast-search-card.js`.
Class names are partly German (zen = lock page, `hoehe` = height, `wach/tief` = awake/deep, `dekor` = decoration).

## Fonts and tokens
- Font: `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`
- `--glass-backdrop: blur(20px) saturate(1.8) brightness(1) contrast(1) grayscale(0)` (from user filters)
- `--glass-tint-bg: radial-gradient(circle at 50% 0%, hsla(0,0%,100%,.08), hsla(0,0%,100%,.03) 70%), rgba(30,30,30,.4)`
- `.glass-panel`: border 1px hsla(0,0%,100%,.2); radius 35px; shadow `0 8px 32px rgba(0,0,0,.1)` (search panel: `0 20px 60px rgba(0,0,0,.25)`)
- accent #007aff; text .95 / .7 white; status colours: red 255,59,48; amber 255,159,10; blue 10,132,255; green 52,199,89
- `--zen-ease: cubic-bezier(.22,1,.36,1)`; spring-ish `cubic-bezier(.34,1.18,.24,1)`; panel `cubic-bezier(.32,.72,0,1)`; press `.08s cubic-bezier(.16,1,.3,1)`

## Frame
- `.main-container`: width 1200, centered, `zoom` as above. Rows: statsbar (island) min-height 60 -> search row -> content.
- `--fsc-panel-h` default 672 (user's window: 560 = availDesign - ~137); grid height `--fsc-grid-h` = panel-h - 96 (576 default, 464 at 560).
- Height ladder (`data-hoehe`): voll (grid 576) -> kompakt -> abwerfen (W3/W4 dropped, grid areas "w1 w2") -> boden (stacked floor).
- Dock (`.vision-pro-menu--desktop`): absolute, `right:100%`, `margin-right:12px`, `top: 60 + panelH/2` (vertically centred on the panel).
  Panel: 58 x 451 (10 items), radius 32, padding 12, bg rgba(18,18,18,.9) (hover: blur(10px) saturate(2.4) + radial highlight), items 34x36 radius 28 padding 7,
  icon 20px, colour rgb(179,179,179); hover/focus bg rgba(230,230,230,.2) colour #f2f2f2; li gap .5rem. On hover the dock WIDENS and labels appear (opacity 0 -> 1).
  Items (default order): Home, Changelog (</>), Energy dashboard (bolt), Weather entity, Tips (sparkle), News, Tasks, Schedules overview, Settings, Calendar. "Notifications" exists but is off by default.
  Mobile: fixed bottom, row, items round padding .75rem, "more" popup (radius 24, bg rgba(26,26,30,.93)).

## Status row (island)
- Values capsule: left, height 44, radius 34, glass, padding 0 16, font 14.5px/650, gap 12 (weather, power; tabular nums; 15px icons at .75 opacity).
- Orb: right, 44px circle glass (radius 999), shadow `0 10px 34px rgba(0,0,0,.18)`, hover scale 1.04, active .96. Badge `island-eck` 17px circle top/right -3 (blue = info, amber = warn, red = alarm), font 11/700.
- Tap orb -> morph: orb leaves right edge, capsule appears centred ("[ⓘ circle] N notifications  ›"), then tap again opens the list panel:
  radius 34 glass, ~440 wide, header (bold summary "1 info" + dim "1 notifications") + 4-step selector (! / warning / info / pulse) as white-dot slider,
  tabs row (All | Notice n), divider, list rows (dot, title 13.5/650, text 12.5, footer "1d ago" + chip, round snooze + dismiss buttons), footer link "Open notification center  ›",
  white head-ball above the pill, close X (27px) below, page dim `rgba(20,20,24,.14)` + `blur(1.4px)`. Spring `.46s cubic-bezier(.34,1.18,.24,1)`; panel-in `blur(14px) scale(.965) -> clear` .42s.
- Idle: folds to capsule after 30 s, to the button after 1 min more.

## Search row
- Panel: 94 high (mobile 74), radius 47 (pill) -> 35 when expanded (`.42s cubic-bezier(.32,.72,0,1)`), glass tint + backdrop, expanded height = panel-h.
- Wrapper: height 94, padding `16px 76px 16px 20px`, gap 12, divider line (1px rgba(255,255,255,.1), inset 20) under it.
- Category icon 24px (grid icon; chevron-back on hover when it means "back"), input 24px/30px (mobile 19px), placeholder white .7, ghost suggestion white .3, custom caret `fsc-caret` (2px, glow, blink keyframes fsc-caret-takt 1.x s) and a typewriter line (`fsc-tippzeile`, white .92) that types "Last: <entity> ..." (context lines optional).
- Filter button 44px at right 20 (icon filter); opens a morph popup: VIEW (Tiles / List) and FILTER BY (Categories / Rooms / Recent), 56px circle choices, active = white.
- Results: padding `10px 20px 40px`, max-height panel-h - 94, chips row (`subcategory-chip`: h42, padding 8x16, radius 20, font 17, bg .08, active .25 (+ count badge radius 10, font 14/500, bg .1)),
  group titles 18/500 with bottom hairline and count badge (radius 9, 13/600, bg .16), grid gap 16: >=1024: 5 cols (setting 4/5/6), 868-1023: 4, 581-867: 3, 361-580: 2, <=360: 1.
- Chips in the field: area blue (66,165,245 .18), domain purple (192,132,252), sensor green (52,211,153); selected = solid .9 + 3px ring.
- Reveal animation (after unlocking): sheen sweep across the search panel (`zen-search-sheen` .9s, delay .9s).

## Bento (zen) grid
- Grid: columns `1.353fr 1fr`, areas "w1 w2 / w1 w34", gap 24 (zen), rows `1fr var(--w34-row-height)` (clamp(.42*gridH,150,200)); w34 = 2 equal columns, gap 24.
- Widgets radius 24. Large padding 24, medium 18, small 14.
- W1 `carousel`: NO background; padding `14px 16px 0`; header: tabs (Favorites n | Suggestions n; pill radius 16, padding 7x14, 14/600; inactive bg .18 text .85; active bg .95 text rgb(28,28,30); count badge radius 8, 12px) + view toggle (radius 9, bg .1, buttons 26x22 radius 7, active bg .92);
  body: scrolling grid (`gitter`) 3 columns, gap 12, padding 6 8, each tile square (aspect 1), padding 12, text 18px; top/bottom edge blur + mask (20-24px); footer label + page dots when paged.
- W2 `rich slider`: medium 244 high at grid 464; radius 24; padding 18; brand gradient background (160deg) per page, cross-fades `.5s`; pages slide; pager pill bottom-right (`hero-slide-pager`: dots + pause, bg rgba(0,0,0,.35), blur(10px), radius 16, padding 7x11, gap 6; active dot elongated 36px);
  footer label bottom-left (dim page title / bold subtitle). Hover: scale 1.015, bg lighter. Gradients: weather (74,144,226)->(42,108,178); todos (255,159,10)->(199,108,0); news (254,59,48)->(184,30,18); versions (107,105,224)->(57,53,161); calendar (233,69,96)->(138,21,56).
  Weather page: location (17/600) + arrow, big temp 64/300 (zen: 24 in compact), condition 17/600, H/L 14, hourly strip of 6 (time 11/600, icon 24, temp 14/600) with hairline top.
  News/todos/calendar pages: header icon bubble 32px radius 9 (bg .22), name 14-15/700, counts 11.5-12; tabs (Unread | Read; All | lists) pills; rows 12.5-14.5px; todos circle checkbox, due chip (overdue red 255,59,48).
- W3/W4 `small live`: system tiles as device-cards: todos = rgb(0,122,255) "0 Incomplete / 0 Overdue", news = rgb(255,149,0) "100 New Articles / 5 Feeds"; 238 x 196 at grid 464; radius 24; padding 14.

## Tiles (`device-card`)
- aspect 1/1, bg rgba(255,255,255,.1) (hover .18 + gradient overlay), radius 24, padding 20 (12 in bento, 16 <=768, 14 <=480), min 130, overflow hidden.
- Text block: area / name(600) / state, all 18px, line-height 1.15, colour white .85/1/.85, right edge fades out via `linear-gradient(90deg, colour 80%, transparent) text`; long states marquee.
- Active (on): bg #fff, text black .6/.9/.7; icon coloured by domain.
- Quick control icon `qc-icon`: press scale .9, pop 1.12, orange ring (255,159,10) stroke 6, dasharray 289, fills in 1s linear, visible on hover/press.
- `[role=button]:active { transform: scale(.97) }`, transition `transform .08s cubic-bezier(.16,1,.3,1)`. Pending: pulsing 2px ring rgba(100,180,255,.55). content-visibility:auto.
- List item: radius 24, padding 16x20, icon circle 68, area 11/uppercase/.5 spacing, name 16/600, status 13, "..." actions button 44.

## Lock page (zen)
- Curtain: date 19/600 (.85, shadow), time 82/500 tabular (letter-spacing -2.5), status row 19/600 (icons, weather, power), greeting 45/500 (time-of-day greeting or quote), context line (46% of greeting size), grip 116x5 pill breathing (`zen-breathe` 3s).
- Animations: `zen-materialize` .8s (blur 20px -> 0 + fade) staggered .11/.18/.22/.32 s; reveal: swipe up / click grip / wheel; then island drops from translateY(220) to 0 (.62s), search row fades in (.42s, delay .62), dock (delay .74), panel cells staged (.84/.99/1.14 s).
- Deep rest (`data-ambient=tief`): only the clock stays (.72), everything else fades; night tint rgb(242,223,196).

## Detail panel
- Panel: glass 35 radius, height panel-h, content split 50/50. Left: padding 25, video background (fades .5s) or icon; top row: back (40px circle rgba(0,0,0,.5) blur 10), centred title (15/600 + area .5) with fade-out text, favourite heart (gold when active); label button bottom-left.
- Right: header (name/area 15px) + tab pill (rgba(0,0,0,.25), radius 24, padding 5, gap 6; 40px circle tabs; white sliding indicator with `0 2px 8px` shadow; active icon colour rgba(0,0,0,.85)).
- Open/close: bento and search row scale to .86 + fade (`.52s cubic-bezier(.32,.72,0,1)`, spring `linear()` curve when supported), detail content swap `fsc-detail-content-swap` .28s (translateY 8px -> 0).

## Settings (system entity "Settings" in the detail shell)
- iOS list: header with search ("Search settings") + "Changed n" pill (amber badge). Sections: caps label + (i) info button, card of rows (label 15/600, subtitle 12, value + chevron or glass-dot toggle), dividers; sub-pages with Back, title and slide.
- Tabs (icons): General, Appearance, Filter, About. Full option lists were crawled; see `okie-settings.js` schema.

# Okie Motor and Okie Home: the whole project

This is the complete description of the project in one page: what it is, how the parts fit together, where everything lives, how to build and test it, and what it does and does not do.
For installing it start with the [README](README.md) and [docs/guides/00-START-HERE.md](docs/guides/00-START-HERE.md).

## 1. What it is

A touch-first interface for [Home Assistant](https://www.home-assistant.io/) that behaves like a native app and runs everywhere you have a screen: a desktop browser, an iPhone or iPad, a wall tablet.
It has three parts that share one design:

| Part | Technology | Where |
|---|---|---|
| **Okie Motor**, the card | Plain JavaScript (no dependencies, no build tools beyond concatenation), 49 modules, about 19,700 lines | [`src/`](src), shipped as the single file [`dist/okie-motor.js`](dist/okie-motor.js) |
| **Okie Home**, the iOS app | SwiftUI, a WKWebView that loads the card, a JavaScript bridge, native WidgetKit widgets, about 6,500 lines of Swift | [`ios-app/`](ios-app) |
| **Widgets for people without Xcode** | [Scriptable](https://scriptable.app) JavaScript scripts | [`widget/`](widget) |

Around them: a browser **harness** with a mock Home Assistant, **440 unit tests** plus an end-to-end smoke script, a one-file **installer** for the [Hemma](https://github.com/willsanderson/Hemma) dashboard framework, an **offline demo**, and a mock Home Assistant server for the app.

## 2. What the user sees

* A **lock page** (clock, weather and power, greeting or quote, notification pill, a microphone that listens right there).
* A **start screen** with the search bar and two columns: favorites and suggestions on the left (with the Light modes card), a swipeable **Widgets** card, cameras and a pet-feeder card on the right. Everything arranges by touch, on every screen that shows cards (hold, drag, tap away).
* **Search** that understands typos, areas and device types, learns from use, and turns into a chat with Home Assistant's **Assist** agent, typed or spoken.
* **Detail views**: a circular dial for lights, thermostats and fans, controls for every common device type, history charts, schedules (with the Scheduler component), context (the scenes, scripts and automations that use the device).
* **Apps** inside the card: Calendar, To-do, Energy, Schedules, News, Light modes, Server links, Assistant, Tips, What's new, Settings.
* **Music cards** (Spotify, Cast ...) in three sizes: a row, a tall card and a large cover card.
* A **wall tablet mode** with screensaver, deep rest, wake sources and quiet hours.
* **Okie Home** on iOS: full screen, native sign-in, haptics, speech recognition, widgets.

See [docs/FEATURES.md](docs/FEATURES.md) for the full list and [docs/screenshots](docs/screenshots) for pictures.

## 3. How the card works

### 3.1 One file, ordered

Home Assistant loads dashboard resources in parallel, so separate scripts cannot rely on load order. `tools/build.py` therefore concatenates the modules of `src/` in the order of the `<script>` tags in `harness/index.html` into `dist/okie-motor.js`, writes `dist/okie-version.json` and builds the one-file installer `dist/okie-install.py`.
Each module attaches itself to `window.OkieMotor.<name>` and, under Node, to `module.exports`, so the pure rules (grouping, wording, layout maths, schedules) are unit-tested without a browser.

### 3.2 The `ctx` contract

The card (`okie-card.js`, the custom element `<okie-motor-card>`) builds one `ctx` object and hands it to every screen: `ctx.hass()`, `ctx.state(id)`, `ctx.call(domain, service, data)`, `ctx.callWS(msg)`, `ctx.settings` (get, set, on change), `ctx.store`, `ctx.bus` (events such as `states`, `nav`, `resize`), `ctx.openDetail(id)`, `ctx.openApp(id)`, `ctx.sheet(...)`, `ctx.toast(...)`, `ctx.haptic(kind)`, `ctx.voice` helpers. A module never reaches into another module's internals.
Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

### 3.3 State, settings and sync

* Home Assistant's `hass` object is the only source of device state; failed service calls toast and leave the state alone (no optimistic state that could drift).
* **Settings** are a nested object with defaults in the modules. The user's overrides are stored in Home Assistant's per-user storage (`frontend/set_user_data`, key `okie_motor_settings`) so every device of that user shows the same favorites, rooms, look and layout; the per-screen settings (`scale`, `rest`, `top_offset`) stay on the screen. A screen pulls on start, when it returns to the foreground and every five minutes (`okie-sync.js`). Settings can be exported to and imported from a JSON file (`{ app, format, version, settings }`).
* Rooms, card sizes and the order of cards live in the same storage.

### 3.4 Layout

* A 1200 px wide column scaled with CSS `zoom`; a height ladder (full, compact, drop the small tiles, stacked) and phone, tablet and desktop layouts.
* iOS web views report a zoomed element at its unzoomed size and draw text at its pixel size; `okie-logic.js` and the card compensate (`columnHeight`, `scaleFonts`, the `--okie-fz` variable) so numbers are not huge on an iPad.
* One **top position** for every screen: the column is placed once, from the height of the start screen, so it does not jump when an app opens. Apps grow downward and stop before the window's bottom edge.
* The two columns of the start screen are a real two-column model (`okie-bento.js`): cards move between them by dragging, each column has its own frame and height handle, and a card that does not fit fades out at the column's edge (each edge card gets its own mask so blurred cards keep their blur).

### 3.5 Arrange mode

`okie-arrange.js` and `okie-bento.js`: hold a card (450 ms) to open the arrangement. A bar at the bottom (Reset, Done), dashed frames with a handle per column, a bar over every card (grip, name, Row / Tall / Large, remove), drag within and between columns, snap points for the column heights, tap away to finish, opening anything finishes it. Rooms use the same hold and bar.

### 3.6 Design

Real `backdrop-filter` glass with settings for blur, tint, edges and card style; four corner shapes (squircle presets); one glass window for every popup (focus trap, Escape, reduced motion); video backgrounds for detail views with a fall-back chain; English and German strings (a test fails the build if they drift apart).

### 3.7 Voice

`okie-search-ui.js` listens through the Web Speech API (`SpeechRecognition`), stops by itself after about 1.5 s of quiet, and sends the words to `okie-system.js`'s assistant (Home Assistant's Conversation API), reading the answer aloud when asked. The lock page uses the same recogniser in place and shows the live words and the answer. In the iOS app a bridge supplies a `SpeechRecognition` backed by `SFSpeechRecognizer`.

## 4. The iOS app

`ios-app/` (SwiftUI, iOS 17+). It is deliberately thin: the dashboard is the card, the app adds what a web page cannot.

* **Sign-in** (`SignInView`, `Shared/HAAuth.swift`): Home Assistant's own login flow; tokens in the Keychain (`Shared/Keychain.swift`), shared with the widgets through a keychain access group.
* **Dashboard** (`App/DashboardView.swift`): a `WKWebView` that opens `<address>/okie-tablet/home` after writing the tokens into the page's `localStorage` (`hassTokens`), so there is no second login. A user script (`Resources/okie-bridge.js`) adds: a stale-version check that clears the web view's cache when the server has a newer card, pull-down-to-refresh, a `SpeechRecognition` polyfill, scroll-shield for old kiosk scripts, opening a screen from a widget link.
* **Native messages** from the card: haptics (`okieHaptic`), speech (`okieSpeech` to `SpeechBridge.swift`), settings backup through the share sheet and file picker (`okieBackup`), glass and dial look for the widgets (`okieGlass`, `okieLook`).
* **Staying put**: the page is never restarted when you return from another app; the card keeps the screen you were on, and rebuilds to it if iOS dropped the page. The lock page shows only on a fresh launch.
* **Widgets** (`Widgets/`): Thermostat, Weather, Calendar, Lights, Feeder. Their look and the entity ids are in `Widgets/widgets.json` and generated into `Shared/WidgetSpec.swift` by `tools/build-widgets.js`; the icons are generated from the card's icon table (`tools/gen-swift-icons.js`).
* **Mock server** (`mock/server.js`): a pretend Home Assistant (login flow, REST, websocket) to develop against.

## 5. Privacy and data

* The card talks only to **your Home Assistant**. There is no analytics, no account and no server of ours.
* The optional "extra weather places" feature looks up city names and forecasts with the free [Open-Meteo](https://open-meteo.com) API from the browser when you use it.
* Tokens live in the iOS Keychain (app and widgets) or in Home Assistant's own browser storage (the card); Scriptable widgets keep their long-lived token in the iPhone Keychain.
* Settings files you export contain your settings (including favorites' entity ids): look at them before you share them.

## 6. Repository map

```
README.md  PROJECT.md  CHANGELOG.md  CONTRIBUTING.md  LICENSE  NOTICE.md  hacs.json  info.md  package.json
dist/        okie-motor.js (HACS), okie-install.py (Hemma), okie-demo.html (offline demo), okie-version.json
src/         the card, 49 modules                      -> table below
tests/       39 files, 440 tests (node:test), no dependencies
harness/     browser harness: index.html (src), bundle.html (dist), mock-hass.js, smoke.js (end-to-end), zoom tests
tools/       build.py, make-demo.py, serve.js, installer_template.py, gen-squircle.py, widget and font builders
widget/      Scriptable widgets (thermostat, weather, feeder, shortcuts) and their pages
demo/        okie-demo-settings.json, okie-wall-tablet-settings.json, two example dashboards
docs/        guides/ (setup for every device), FEATURES.md, OPTIONS.md, ARCHITECTURE.md, WALL-TABLET.md, INSTALL.md, screenshots/
ios-app/     Okie Home: App/, Shared/, Widgets/, Resources/, Config/, project.yml, tools/, mock/
hemma/       edits.json: what the Hemma installer changes
.github/     workflows: test on every push, release on a tag
```

### The card's modules

| File | What it does |
|---|---|
| `okie-apps.js` | the Calendar and To-do system apps |
| `okie-appshell.js` | the shared frame for apps (Settings, Todos, Calendar, ...) |
| `okie-arrange.js` | press and hold a tile to arrange the start screen where it is |
| `okie-bento.js` | the start screen, FSC's "bento" under the search row |
| `okie-cameras-art.js` | the picture behind the slider's Cameras page (a soft, blurred porch in warm evening light, 15 KB) |
| `okie-cameras.js` | every camera Home Assistant knows, one tap from the start screen |
| `okie-card.js` | <okie-motor-card>, the Lovelace card that hosts everything |
| `okie-chronicle.js` | "what the whole house did", fed by the live state stream |
| `okie-controls.js` | reusable control widgets for the detail view |
| `okie-core.js` | shared plumbing for the Okie motor modules |
| `okie-detail.js` | the detail view. Five tabs per device: Controls, Context, |
| `okie-dock.js` | the left rail ("vision pro menu") with the shortcuts to the system |
| `okie-domains.js` | per-domain control panels for the detail view's Controls tab |
| `okie-energy.js` | the Energy app. Reads Home Assistant's own energy preferences |
| `okie-feedback.js` | the small taps and ticks the card gives back |
| `okie-feeder.js` | the "Feed the Beasts" card under the cameras on the start screen of a wide screen: when the pets were last fed, and one tap feeds them (a script of Ho |
| `okie-feeder-art.js` | the pictures of the feeder card's looks (the art of the iOS feeder widget as small WebP data URIs); generated, not edited by hand |
| `okie-feeds.js` | data rules for todos, calendar, the house chronicle and tips |
| `okie-gadgets.js` | one card (and one view with tabs) for a gadget that Home Assistant lists as dozens of entities, the Kindle Fire and the AWTRIX display |
| `okie-icons.js` | the coloured device icons on the tiles. Hand-drawn here (not FSC's): |
| `okie-island.js` | the status row. A values capsule on the left (weather, power), an |
| `okie-light-modes.js` | lighting "modes" (Cozy lights, Let's go to sleep, Turn up the lights ...) as fancy cards |
| `okie-light-sched.js` | schedules, history and context for the light modes (the tabs of the Light modes view) |
| `okie-logic.js` | the pure rules behind the UI (no DOM, fully unit-tested) |
| `okie-music.js` | the Music screen. What is playing on a music player of Home Assistant (Spotify first), drawn like the screen of Apple's new speaker: |
| `okie-notify.js` | the island's message button, the notification center, toasts |
| `okie-overlay.js` | the one glass window for every popup, toasts, undo pill |
| `okie-polish.js` | touch and accessibility details for the whole card (after Emil Kowalski's apple-design notes) |
| `okie-rest.js` | screensaver, deep rest, wake sources, display handoff, photo frame |
| `okie-robomap.js` | the robot vacuum's cleaning map drawn on OUR floor plan (the Home map), instead of the robot's own pictures |
| `okie-rooms.js` | rooms as cards |
| `okie-search-ui.js` | the search row (FSC "search panel") |
| `okie-search.js` | fuzzy search, intent parser, chip completion, predictions |
| `okie-server.js` | the Server app. How the machine under Home Assistant is doing (processor, memory, storage, network, backups, updates) |
| `okie-settings.js` | the Settings app, laid out like Fast Search Card's own |
| `okie-splash.js` | a "hello" drawn with SVG strokes (two strokes with a pen lift |
| `okie-squircle.js` | FSC's four card shapes as CSS clip-path polygons |
| `okie-sync.js` | one set of settings on every screen, and export / import of them |
| `okie-system.js` | Schedules, News, Tips, Changelog and the Assistant app |
| `okie-thermo-fonts.js` | Sora (the big number) and Manrope (the labels), the fonts of the Thermo Dial project, embedded |
| `okie-thermo-sched.js` | the weekly schedule of a thermostat (the Schedule tab of a climate device) |
| `okie-thermo.js` | the Thermo Dial (the user's own thermostat design, ../thermo-dial-project) as the Controls of a climate device |
| `okie-tiles.js` | device cards, list rows and the quick-control icon |
| `okie-ui.js` | DOM helper, icon set, glass design tokens, gestures, scrollbar |
| `okie-vac-sched.js` | the weekly schedule of a robot vacuum (the Schedule tab of a vacuum device) |
| `okie-vacuum.js` | the screen of a robot vacuum (Roomba and friends) |
| `okie-wallpaper.js` | use any image as the whole view's background |
| `okie-weather.js` | the weather screen, two pages (after the usual phone weather layout) |
| `okie-zen.js` | the lock page. Date, big clock, weather + power, a greeting or quote, |

### The iOS app's Swift files

| File | What it does |
|---|---|
| `App/BigThermostat.swift` | The sample mode's big thermostat (no Home Assistant to ask): a native look-alike of the card's thermostat screen. With a real Home Assistant |
| `App/CalendarScreen.swift` | The dates the calendar screen works with (the week starts on Monday, like the card). |
| `App/CalendarView.swift` |  |
| `App/CardSettings.swift` | One request over Home Assistant's WebSocket (connect, sign in, ask, read the answer, close): for the few things the REST API does not have,  |
| `App/DashboardView.swift` | The Okie Motor dashboard of your Home Assistant, full screen, signed in with the app's own sign-in (it hands the tokens to the page, so ther |
| `App/Demo.swift` | Sample data so the app can be looked at (and tried) without a Home Assistant: the same things the real one has. |
| `App/DetailSheet.swift` | The bigger controls of one device. |
| `App/FeederSheet.swift` | Debug page (launch argument `-feederSheet YES`): all five feeder designs, medium and small, over a bright and a dark ground, to look at them |
| `App/HALive.swift` | A WebSocket to Home Assistant: the first full list of states, then every change as it happens. Reconnects by itself. |
| `App/HomeStore.swift` | Everything the screens show: the sign-in, all entities (kept live over the WebSocket), the favourites. |
| `App/HomeView.swift` |  |
| `App/IconSheet.swift` | Every icon of the card in a grid, to compare with the card's own (launch argument -iconSheet YES). |
| `App/LightsSheet.swift` | Debug page (launch argument `-lightsSheet YES`): both lights designs, medium and small, to look at them without placing widgets. |
| `App/LockPage.swift` | The lock page of the Okie card: date, big clock, weather and indoor temperature, a greeting, the next event and a grip. A swipe up (or a tap |
| `App/OkieHomeApp.swift` |  |
| `App/RootView.swift` |  |
| `App/SignInView.swift` |  |
| `App/SpeechBridge.swift` | Speech recognition for the dashboard card. A web view has no `webkitSpeechRecognition`, so the card's microphone button did nothing in the a |
| `App/ThermostatScreen.swift` | What a tap on the thermostat widget opens: only the controls of the thermostat (the menu bubble, the wheel, the number, the modes, hold to t |
| `App/WeatherModel.swift` | Everything one place's weather page shows. |
| `App/WeatherScreen.swift` | What a tap on the weather widget opens, laid out like the iPhone's own Weather app: one page per place (the house first, then the cities add |
| `Shared/CalendarColors.swift` | The colour of a calendar and which calendars are hidden: the same on the card, in the app and in the widgets. The card keeps both in its syn |
| `Shared/DialLook.swift` | The dial look you set in the big thermostat (Settings > Dial): the four colours of the scale and where it turns from cool to warm. |
| `Shared/FeederCard.swift` | The look of the feeder card. Chosen in the widget's settings (long-press the widget > Edit Widget > Design). The colours of each are in widg |
| `Shared/GlassRule.swift` | The card's glass rule (Settings > Design > Liquid glass), as the widgets need it. The app reads the numbers you set in the card and keeps th |
| `Shared/HAAuth.swift` | Signing in the way the Home Assistant web page itself does (its login flow API), with our own client id on the same address, so nothing has  |
| `Shared/HAClient.swift` | Talks to Home Assistant's REST API with the saved sign-in; refreshes the token when it is about to run out. Used by the app and by the widge |
| `Shared/HAEntity.swift` | One Home Assistant entity state. |
| `Shared/HASession.swift` | What we keep after signing in: the address, our client id, and the tokens. |
| `Shared/Haptic.swift` | Haptics for the app and the widgets. |
| `Shared/Intents.swift` | The buttons of the widgets: they run in the widget itself, so a tap does its job at once without opening anything. |
| `Shared/JSONValue.swift` | Any JSON value (Home Assistant attributes are free-form). |
| `Shared/Keychain.swift` | A tiny keychain wrapper. The app and the widgets share one access group so the widgets can talk to Home Assistant with the same sign-in. |
| `Shared/LightsCard.swift` | The two looks of the lights card. Chosen in the widget's settings (long-press the widget > Edit Widget > Design). The colours are in widgets |
| `Shared/OkieIcons.swift` | The icons of the Okie cards, drawn as shapes on a 24 x 24 grid so they scale and take any colour. |
| `Shared/OkieSVGIcons.swift` |  |
| `Shared/Place.swift` | The name of the place Home Assistant's home is at ("Lutz"). The coordinates come from Home Assistant's own settings (GET api/config), the na |
| `Shared/SVGPath.swift` | The card's own icons (24 x 24 line icons, the same shapes as in okie-motor/src/okie-ui.js), drawn with SwiftUI. |
| `Shared/Theme.swift` | The Okie look: warm smoky glass over a room picture, white ink, a colour for what is on. |
| `Shared/Thermostat.swift` | The thermostat's face: the same rules as the dashboard card (and the old Scriptable widget): the colour follows the target temperature. |
| `Shared/WeatherGlyph.swift` | The card's weather pictures: the sun or moon behind a cloud (cut out where the cloud is), a cloud, rain, a sun, a moon. Same drawings as oki |
| `Shared/WidgetSpec.swift` |  |
| `Widgets/CalendarWidget.swift` |  |
| `Widgets/FeederWidget.swift` |  |
| `Widgets/LightsWidget.swift` | What it shows when no buttons were chosen (the ones that exist on this Home Assistant). |
| `Widgets/OkieWidgetBundle.swift` |  |
| `Widgets/ThermostatWidget.swift` |  |
| `Widgets/WeatherWidget.swift` | The weather widget cannot scroll (no widget can), so the strips have arrows: a tap on > shows the next hours (or days), a tap on < goes back |
| `Widgets/WidgetSupport.swift` | One small entity type per widget kind: the picker shows the friendly names, the widget only keeps the entity id. |

## 7. Build, test, develop

```bash
npm test                         # 440 tests; 4 installer tests need a Hemma clone and are skipped without one
npm run build                    # = python3 tools/build.py   (--no-hemma if there is no Hemma clone next to this folder)
npm run demo                     # dist/okie-demo.html: the whole card with a pretend Home Assistant, one file
npm run serve                    # http://127.0.0.1:4651/harness/index.html
```

The harness runs the card against `harness/mock-hass.js` (made-up devices). Useful query parameters of `harness/bundle.html` and `harness/index.html`:

| Parameter | Effect |
|---|---|
| `zen=0` / `zen=1` | skip / show the lock page |
| `favs=1` | fill the favorites |
| `openapp=<id>` | open an app (`calendar`, `settings`, `energy`, `server`, `lightmodes`, `room:kitchen` ...) a moment after start |
| `okie_open=<entity>` | open a device's detail screen |
| `touch=1` | answer `(pointer:coarse)` like an iPad, to get the tablet layout in a desktop browser |
| `now=2191-10-21T10:00:00` | move the page's clock (screenshots, calendar tests) |
| `arrange=1`, `music=large` | open the arrangement; show a Spotify player in the right column as a large card |
| `bridge=1` | behave like the Okie Home app (the page keeps where you were) |
| `fakevoice=1` | a fake speech recogniser that "hears" a sentence |
| `diag=1` | print zoom and font numbers (iPad text-size problems) |

The iOS simulator's Safari is real WebKit: point it at the harness (`xcrun simctl openurl booted "http://localhost:4651/harness/bundle.html?zen=0&favs=1"`) to check the Safari-only problems (CSS `zoom`, status bar, touch).

## 8. Known limits

* Everything is tested against a mock Home Assistant and on the author's own setup (a Home Assistant server, an iPad 9th generation, an iPhone, a browser). Expect rough edges on other hardware and integrations, and please report them.
* The music card's Spotify logo and name matching is by entity name; other players get the same card without the logo.
* Speech recognition needs a browser that has it (Chrome, Safari) over HTTPS, or the Okie Home app.
* No App Store build of the iOS app: you sign and install it yourself.
* Not built: Music Assistant library panel, the plugin store, 3D-printer integration, the Liquid Glass refraction effect, hundreds of hand-drawn device icons, languages beyond English and German.

## 9. History in short

The change log has 43 entries. In the earlier ones the card learned the layout of the Fast Search Card it was modelled on (measured, not copied), then got its own start screen, detail views, apps, settings and wall-tablet mode. Later versions added the Hemma installer, rooms, light modes, cameras, the feeder, the home map, the iOS app and its widgets, the arrangement mode and two-column start screen, the music card sizes, endless calendar strip, voice that sends by itself and listens on the lock page, one top position on every screen, and many iPad fixes. See [CHANGELOG.md](CHANGELOG.md).

## 10. Credits and licence

**Thank you** to [fastender](https://github.com/fastender), whose [Fast Search Card](https://github.com/fastender/Fast-Search-Card) is the design this card comes from, and to [willsanderson](https://github.com/willsanderson), whose [Hemma](https://github.com/willsanderson/Hemma) framework it was first made to live in. Without those two projects Okie Motor would not exist.

GPL-3.0-or-later ([LICENSE](LICENSE)). The four card-shape presets come from the GPL-3.0 [Fast Search Card](https://github.com/fastender/Fast-Search-Card); the sample room photo comes from the MIT-licensed [Hemma](https://github.com/willsanderson/Hemma) demo assets; Sora and Manrope are embedded under the SIL Open Font License. Details and trademarks in [NOTICE.md](NOTICE.md). Not affiliated with any of the projects or companies named.

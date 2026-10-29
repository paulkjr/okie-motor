<p align="center"><img src="docs/screenshots/showcase/hero-search-dial-done.jpg" alt="Okie Motor: search it, dial it, done" width="100%"></p>

# Okie Motor

**A search-and-control dashboard for Home Assistant that feels like an app.** One JavaScript card, plus an optional native iPhone / iPad app, an Apple Watch companion and home screen widgets.

It starts on a lock page with a clock, has one search bar that finds any device, room or app (and can ask your Assist agent, by typing or by voice), a start screen you
arrange by touch, detail views with circular dials, and its own Calendar, To-do, Energy, Schedules, News and Settings apps. It runs in a browser, in the Home Assistant
companion app, in the **Okie Home** iOS app, and on a wall tablet.

<table>
<tr>
<td width="44%"><img src="docs/screenshots/showcase/lifestyle-iphone.jpg" alt="Okie Home on an iPhone in a living room, with a wall tablet behind"></td>
<td valign="top">

### Your whole home, one calm screen.

- **One search bar** finds any device, room or app, and asks your Assist agent by typing or by voice
- **A start screen you arrange by touch**: favorites, widgets, cameras, a feeder card
- **Big circular dials** for thermostats, lights, blinds and TV volume
- **Built-in apps**: Calendar, To-do, Energy, Schedules, News and Settings
- **Everywhere you are**: browser, the Home Assistant companion app, iPhone and iPad, Apple Watch and a wall tablet

</td>
</tr>
</table>

## Start screen

<table>
<tr>
<td width="50%"><img src="docs/screenshots/showcase/home.webp" alt="Start screen with favorites, calendar and feeder card"><br><b>Your favorites at a glance.</b> A big music player, lamps, blinds and light modes on the left; a swipeable Widgets card (calendar, weather, news, tips) and the feeder card on the right.</td>
<td width="50%"><img src="docs/screenshots/showcase/home-widgets.webp" alt="Start screen with thermostat, weather and tips"><br><b>Thermostat, weather and tips.</b> Tall cards where you want them. Hold any card to arrange: drag between the columns, pick Row / Tall / Large, set the height of each column.</td>
</tr>
</table>

## Devices with real controls

<table>
<tr>
<td width="50%"><img src="docs/screenshots/showcase/thermostat.webp" alt="Thermostat with a circular dial"><br><b>Thermostat.</b> A big circular dial, heating / cooling / auto modes, history and a smart schedule.</td>
<td width="50%"><img src="docs/screenshots/showcase/music.webp" alt="Music player"><br><b>Music.</b> Cover art, progress, queue, lyrics and room selection.</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/showcase/tv-remote.webp" alt="TV remote"><br><b>TV remote.</b> A volume ring, d-pad and app shortcuts with real logos.</td>
<td width="50%"><img src="docs/screenshots/showcase/office-ac.webp" alt="Air conditioner with min and max"><br><b>Air conditioning.</b> Heat / Cool ranges, modes and one-hold power off.</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/showcase/garage.webp" alt="Garage door"><br><b>Garage and blinds.</b> The drawing follows the position, with open, stop and close.</td>
<td width="50%"><img src="docs/screenshots/showcase/sensor.webp" alt="Window sensor with recent events"><br><b>Sensors.</b> State, last update, notifications and the recent events of a door or window.</td>
</tr>
</table>

## Built-in apps

<table>
<tr>
<td width="50%"><img src="docs/screenshots/showcase/calendar.webp" alt="Calendar month view"><br><b>Calendar.</b> Day, week, month and year, with an endless date strip you scroll with a finger.</td>
<td width="50%"><img src="docs/screenshots/showcase/weather.webp" alt="Weather"><br><b>Weather.</b> Hourly, daily and every detail side by side.</td>
</tr>
<tr>
<td width="50%" colspan="2"><img src="docs/screenshots/showcase/schedules.webp" alt="Schedules overview" width="50%"><br><b>Schedules.</b> Timers, light schedules and robot vacuum cleanings in one list.</td>
</tr>
</table>

## On iPad, iPhone and Apple Watch

<table>
<tr>
<td width="50%"><img src="docs/screenshots/showcase/ipad-home.webp" alt="Okie Home on iPad"><br><b>iPad.</b> The suggestions shelf mixes lamps, climate, blinds, TV, locks and more, next to the weather card.</td>
<td width="50%"><img src="docs/screenshots/showcase/ipad-assistant.webp" alt="Ask anything"><br><b>Ask anything.</b> Your Assist agent lives in the search bar.</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/showcase/ipad-assistant-answer.webp" alt="Assistant answer with the device it touched"><br><b>Answers with devices.</b> The devices it touched appear as tiles you can use right away.</td>
<td width="50%"><img src="docs/screenshots/showcase/ipad-hero-width.webp" alt="Adjustable hero width in edit mode"><br><b>Your layout.</b> Every screen keeps its own picture width: tap the pencil and drag the grip.</td>
</tr>
<tr>
<td width="50%"><img src="docs/screenshots/showcase/ipad-lights.webp" alt="Lights screen"><br><b>Lights.</b> Tiles by room, scenes and one-tap all on / off.</td>
<td width="50%"><img src="docs/screenshots/showcase/share-iphone.jpg" alt="Okie Home on iPhone"><br><b>iPhone.</b> The whole dashboard, on a phone-sized layout.</td>
</tr>
<tr>
<td colspan="2"><img src="docs/screenshots/showcase/share-watch.jpg" alt="Okie Watch" width="50%"><br><b>Apple Watch.</b> Turn the Digital Crown to turn the thermostat wheel: one click, one degree. Lights, the robot vacuum and light modes are one swipe away.</td>
</tr>
</table>

More screenshots (rooms, energy, light modes, settings) are in [docs/screenshots](docs/screenshots).

> The pictures are the browser demo with made-up sample data. Open [`dist/okie-demo.html`](dist/okie-demo.html) (double-click, no server) to try the whole card against a pretend Home Assistant.

> **Built on the work of two other projects:** [Fast Search Card](https://github.com/fastender/Fast-Search-Card) (the design) and [Hemma](https://github.com/willsanderson/Hemma) (the framework). Without them this would not exist, see [Credits](#-credits).

## What is in this repository

| Folder | What it is |
|---|---|
| [`dist/`](dist) | The built card `okie-motor.js` (one file, no dependencies), the one-file installer `okie-install.py` for [Hemma](https://github.com/willsanderson/Hemma) users, and the offline demo `okie-demo.html`. |
| [`src/`](src) | The card's source: 49 plain JavaScript modules, concatenated by `tools/build.py`. |
| [`ios-app/`](ios-app) | **Okie Home**: a SwiftUI app that shows your dashboard full screen, signs in with Home Assistant's own login, speaks to the card (haptics, microphone, widgets) and has native widgets. Built from source with Xcode. |
| [`widget/`](widget) | Home screen widgets as [Scriptable](https://scriptable.app) scripts (thermostat, weather, feeder, shortcuts) for people who do not want to build the app. |
| [`demo/`](demo) | **Demo settings** you can import into the card, and example dashboards. |
| [`docs/`](docs) | Guides, the feature list, architecture notes. |
| [`tests/`](tests), [`harness/`](harness) | 464 unit tests and a browser harness with a mock Home Assistant. |

The whole project in one page: [PROJECT.md](PROJECT.md).

## The parts as their own projects

Each screen has its own project page with pictures, design notes and links to its code:

| | |
|---|---|
| [**Okie Thermo Dial**](https://github.com/paulkjr/okie-thermo-dial) | A circular thermostat: a wheel you drag and flick, a colour scale, a weekly schedule |
| [**Okie Calendar**](https://github.com/paulkjr/okie-calendar) | Day, week, month and year, with an endless date strip |
| [**Okie Weather**](https://github.com/paulkjr/okie-weather) | A drawn sky, the next days and every detail |
| [**Feed the Beasts**](https://github.com/paulkjr/okie-feed-the-beasts) | A pet feeder card with five designs |
| [**Okie Home**](https://github.com/paulkjr/okie-home) | The iPhone and iPad app with widgets |
| [**Okie Search + Assistant**](https://github.com/paulkjr/okie-search-assistant) | One search bar, and a chat with your Assist agent |

## Quick start on a fresh Home Assistant

The long version with every click is [docs/guides/00-START-HERE.md](docs/guides/00-START-HERE.md). The short one:

1. **Install the card.** In HACS add this repository as a custom repository (category *Dashboard*) and install **Okie Motor**; or copy `dist/okie-motor.js` to `/config/www/` and add `/local/okie-motor.js` as a JavaScript module under *Settings > Dashboards > ⋮ > Resources* ([guide](docs/guides/01-INSTALL-THE-CARD.md)).
2. **Make a dashboard.** *Settings > Dashboards > Add dashboard*, give it the URL **`okie-tablet`**, open it, ⋮ > *Raw configuration editor*, paste [`demo/dashboard-okie.yaml`](demo/dashboard-okie.yaml) ([guide](docs/guides/02-CREATE-THE-DASHBOARD.md)).
3. **Import the demo settings.** Open the card's Settings > About > *Backup & sync* > *Import settings* and choose [`demo/okie-demo-settings.json`](demo/okie-demo-settings.json) ([guide](docs/guides/03-IMPORT-THE-DEMO-SETTINGS.md)).
4. **Open it on each device:** [computer](docs/guides/04-COMPUTER-BROWSER.md), [iPhone / iPad in Safari or the companion app](docs/guides/05-IPHONE-IPAD-SAFARI-AND-COMPANION-APP.md), [the Okie Home app](docs/guides/06-OKIE-HOME-IOS-APP.md), [widgets](docs/guides/07-IOS-WIDGETS.md), [a wall tablet](docs/guides/08-WALL-TABLET-AND-FIRE-TABLET.md).

Having trouble? [docs/guides/09-TROUBLESHOOTING.md](docs/guides/09-TROUBLESHOOTING.md).

## What it does

* **Lock page and start screen**: clock, weather and power, a greeting or a quote, a status island that opens into notifications, and a start screen with your favorites and suggestions, one swipeable *Widgets* card (weather, to-dos, news, calendar, tips, cameras, Kindle, AWTRIX, home map), a cameras card and a pet-feeder card. It lays itself out for desktop, tablet and phone.
* **Arrange by touch**: hold a card, drag it to the other column, add widgets to the right column as cards of their own and drop one card on another to merge them, pick its size (Row, Tall, and a big-cover *Large* size for music players), set the height of each column; tap away to finish. Rooms arrange the same way.
* **Search that understands you**: fuzzy search, intent parsing ("kitchen light"), chip input with completion, usage learning, filters, and an **assistant** mode that talks to your Home Assistant Assist agent. The microphone sends your question by itself when you stop talking.
* **Detail views** for lights, climate (a circular thermostat dial and a weekly schedule), fans, covers, locks, media players, vacuums, cameras, sensors, weather and more, with history charts and optional video backgrounds.
* **Apps**: Calendar (day / week / month / year, create and edit events), To-do, Energy (reads HA's Energy dashboard), Schedules, News, Light modes, Server links, Assistant, Tips, What's new and a full Settings app.
* **Music**: cards for Spotify and other players in three sizes, a Music screen with synced lyrics, and a **Spotify library** (playlists, albums, artists, Liked songs; play on this tablet through Home Assistant's Spotify integration).
* **Sensors**: a Sensors menu (doors, windows, motion, water, smoke and readings, what needs a look first), a screen for each door or window sensor with its recent events, a blinds screen, and a sensors card in the slider.
* **Wall tablet mode**: screensaver, deep rest, wake on motion or a doorbell, quiet hours.
* **Same settings everywhere**: favorites, rooms, look and layout are stored in Home Assistant for your user, so the browser, the phone, the iPad and the wall tablet show the same thing.
* **Okie Home (iOS)**: full-screen app, sign in once, haptics, voice, widgets (thermostat, weather, calendar, lights, feeder), stays on the screen you were on when you come back to it.
* **English and German.**

The long list: [docs/FEATURES.md](docs/FEATURES.md). Every YAML option: [docs/OPTIONS.md](docs/OPTIONS.md).

## Requirements

* A current Home Assistant (any install type) and a user that can edit dashboards (turn on *Advanced mode* in your profile to see Resources and the raw editor).
* A modern browser (Chrome, Safari, Edge, Firefox). iOS 17+ for the Okie Home app (a Mac with Xcode to build it).
* Nothing else for the card: no card_mod, no integration, no Hemma. Some screens use what you have: a `weather.*` entity, `calendar.*` and `todo.*` entities, cameras, climate devices, an Assist pipeline for the assistant.

## Status

The author uses it every day on a Home Assistant server, an iPad, an iPhone and a browser. It is one person's project: expect rough edges, and please open an issue with what you saw and which device you used. The numbers in the settings file and the layout are tuned on an iPad (9th generation) and a recent iPhone.

## Privacy: what leaves your install

By default **nothing**: the card talks only to your own Home Assistant, there is no analytics and no account. Two optional features call a free outside service, and you can see exactly what they send:

| Feature | Service | What is sent | Default |
|---|---|---|---|
| Extra weather places (the plus on the weather screen) | [Open-Meteo](https://open-meteo.com) | the name you search for, and the coordinates of a city you chose | only when you use it |
| The name of your town on the weather screen (Settings > Standing values) | [bigdatacloud.net](https://www.bigdatacloud.net) | the latitude and longitude of your home from Home Assistant, once; the answer is kept | **off** |

The iPhone and iPad app gives your sign-in only to the page of your own Home Assistant, and only that page can use the app's haptics, microphone and backup.

## Develop

```bash
npm test             # 464 unit tests (node >= 18, no dependencies; 4 installer tests need a Hemma clone next to the folder and are skipped without one)
npm run serve        # browser harness: http://127.0.0.1:4651/harness/index.html  (add ?zen=0 to skip the lock page)
npm run build        # dist/okie-motor.js, dist/okie-version.json, dist/okie-install.py   (python3 tools/build.py --no-hemma when you have no Hemma clone)
npm run demo         # dist/okie-demo.html
```

[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) explains the modules, the `ctx` contract and how to add a setting, an app or a control. [CONTRIBUTING.md](CONTRIBUTING.md) lists the rules the tests enforce. [CHANGELOG.md](CHANGELOG.md) has the history.

## License and credits

GPL-3.0-or-later, see [LICENSE](LICENSE) and [NOTICE.md](NOTICE.md) (what is borrowed from where, fonts, trademarks). Made with thanks to [Fast Search Card](https://github.com/fastender/Fast-Search-Card) and [Hemma](https://github.com/willsanderson/Hemma). Not affiliated with Home Assistant, Nabu Casa, Apple, Spotify, Hemma or Fast Search Card.

## 🏆 Credits

* Original Fast Search concept and base implementation: [fastender](https://github.com/fastender) ([Fast Search Card](https://github.com/fastender/Fast-Search-Card)). The look of the glass panels, the search bar that finds and controls everything, the detail views and the layout of the settings are the starting point of this card; I used it as my design reference and built from there. The four card-shape presets are taken from it, which is why this project is GPL-3.0-or-later too.
* Hemma customization and ongoing tweaks: [willsanderson](https://github.com/willsanderson) ([Hemma](https://github.com/willsanderson/Hemma)). The dashboard framework this card was first made to live in; the optional installer (`dist/okie-install.py`) plugs the card into it, and the sample room photo of the demo comes from its assets.

Thank you both, without your projects Okie Motor would not exist. Please give them a star. Okie Motor is an independent project: it is not made, endorsed or supported by them (details in [NOTICE.md](NOTICE.md)).

Enjoying Okie Motor? Buy me a coffee, I wanna be a full time DJ/designer ✌️😃 it's paulkmusic bby

👉 **https://ko-fi.com/paulkmusic**

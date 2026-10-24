# Options

Every option can be set in the dashboard YAML (the starting value for a screen that has never been configured) and in the card's own **Settings** app (which wins and is kept in Home Assistant for your user, so every device shows the same).
The complete list with the default of each is `DEFAULTS` in [`src/okie-card.js`](../src/okie-card.js) and the module files that register their own defaults.

## The usual ones

```yaml
type: custom:okie-motor-card
squircle: none            # card corner shape: none (Standard) | strong (Prominent) | standard (Balanced) | soft (Subtle)
start: bento              # bento | browse (opens with the search panel expanded)
language: auto            # auto | en | de
weather_entity: weather.home      # optional; empty uses the first weather entity
weatherPlaceLookup: false          # true: look up the name of your town once (sends the home latitude and longitude to bigdatacloud.net); also a switch in Settings
power_entity: sensor.house_power  # optional; empty uses the strongest power sensor
wallpaper: /local/room.jpg        # optional
scale: 100                # content size in percent (40-130); smaller leaves more of the wallpaper visible (this screen only)
top_offset: 0             # px kept free above the card, for dashboards that keep Home Assistant's header
cameras:                  # the Cameras card on the start screen (all optional)
  image: /local/house.jpg # always use this picture (empty: the last motion picture, else a built-in one)
  lastEntity: image.patio_last_motion   # empty: an image entity whose name says last motion
  clipsUrl: https://example.org/ring     # adds an Open recordings button to the motion history
  liveSeconds: 120        # the live view pauses by itself after this long
```

Use it as the only card of a dashboard view with `type: panel`.

## Other keys

| Key | What it is |
|---|---|
| `zen: {enabled, text: quote\|greeting\|none, name, quoteEntity, keepOpen}` | the lock page |
| `search: {columns: 4\|5\|6, filterBy, recent, ai, context, typewriter, chips}` | the search bar and panel |
| `island: {show, fold, toCapsuleSec, toButtonSec, liveShow, live: {...}}` | the status island and live activities |
| `bento: {enabled, pages, slideSec, oneWidget, swap, w1mode, w1layout, camerasCard, feederCard, feederDesign, ...}` | the start screen: slider pages (`weather`, `todos`, `news`, `calendar`, `tips`), one swipeable Widgets card or separate cards |
| `rooms: [{name, area, items, icon}]` | choose exactly what is in a room (otherwise every area with devices is a room) |
| `rest: {lockAfter: '30'\|'60'\|'120'\|'300'\|'never', deepAfterSec, awaySaverAfterSec, wakeEntities, screenEntity, screenOffScript, screenOnScript, photoFolder}` | wall tablet: screensaver and deep rest ([guide](guides/08-WALL-TABLET-AND-FIRE-TABLET.md)) |
| `videos: {enabled, mobile, path}` | detail view videos |
| `sidebar: {show, always, items}` | the dock |
| `notifications: {alerts, battery, batteryThreshold, quietFrom, quietTo, versionWatch}` | notifications and quiet hours |
| `glass: {brightness, blur, contrast, saturation, grayscale, tint, cardBlur, cardTint, cardStyle, cardEdge}` | the glass look |
| `thermo: {glowBlur, glowSpread, glowOpacity, ticks, c0..c3, cool, warm}` | the thermostat dial look |
| `assistant: {agent, voiceReply}` | the Assist agent to ask (empty = the default) and whether answers are read aloud |
| `lightModes`, `lightModesLayout`, `lightModesLook` | the Light modes card |
| `haptic`, `sound`, `centerView`, `textScale`, `timeFormat` | small switches |

## Settings as a file

**Settings > About > Backup & sync** exports all settings as JSON and imports such a file again (also into another Home Assistant). Two ready-made files are in [`demo/`](../demo), see [03-IMPORT-THE-DEMO-SETTINGS](guides/03-IMPORT-THE-DEMO-SETTINGS.md).

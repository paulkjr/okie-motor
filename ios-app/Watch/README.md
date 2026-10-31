# Okie Watch (Apple Watch Ultra 3)

Native watchOS app in `Watch/`, built by the `OkieWatch` target in `project.yml` (embedded in OkieHome). State as of 2026-10-29: done for now, installed on the real watch.

## Pages (swipe sideways)
| Page | File | Notes |
|---|---|---|
| Robot vacuum (hidden, left of the thermostat, no dot) | `WatchRoomba.swift` | First `vacuum.*` in Home Assistant; Start / Stop / Dock (`return_to_base`) / Locate; state colours, red dashed ring when in error ("Stuck" if the robot's error text says stuck). |
| Thermostat (home page) | `WatchRoot.swift` | Crown turns the wheel. Tap the number: Now; tap the dial: Dial settings (with Save); tap the mode word: Conditioning. |
| One page per light | `WatchLights.swift` | List and order come from the Okie card (Lights favorites `lightsFav`, else global favorites that are lights) via the iPhone. Drag/crown dims, tap toggles. |
| Light modes (3 shortcuts) | `WatchLights.swift` (`ModesPage`) | From the card's `lightModes`, else Cozy / Sleep / Turn up. |

Dots: our own, drawn in `WatchRoot` (the hidden left page has none).

## How data gets to the watch
- Sign-in, dial look, light favourites and light modes are relayed by the iPhone (`App/WatchLink.swift`) over WatchConnectivity, because watchOS cannot open the WebSocket that reads the card's user data. The watch asks the phone for fresh lists on every refresh (`{"lights":1}`).
- Live states and service calls go straight from the watch to Home Assistant (`HAClient`).

## Settings on the iPhone (Watch app > My Watch > Okie Home)
`Settings.bundle/Root.plist`, read by `WatchPrefs.swift`: light pages on/off, lights before/after, robot and light modes placement (hidden left / after the lights / off), dial sliders (glow softness, glow brightness, number of marks). Apple only allows switches, pickers and sliders there, so no drag-to-reorder. Not yet confirmed that the page shows up on the real iPhone.

## Looks worth knowing
- Lamp: vector `LampArt` (dark pendant, straight cone, bulb-coloured beam); web card has the same design in white.
- Dial glow is drawn at 60% of the card's spread on the watch (less glare).
- Light pages change page as soon as the swipe is clear (manual flip). Letting the page view handle light swipes made them freeze; do not retry.

## Debug launch arguments (simulator, `-watchDemo YES`)
`-watchPage N` (99 = the hidden left page), `-watchVac docked|cleaning|error|returning`, `-watchTarget 69`, `-watchScreen now|dials|mode`, `-pref_glowBlur 80` etc.

## Install
```
xcodebuild -project OkieHome.xcodeproj -scheme OkieWatch -destination 'id=00008310-000D08DA3E40E01E' DEVELOPMENT_TEAM=7M62HLUGQ9 -allowProvisioningUpdates -derivedDataPath .build-watch build
xcrun devicectl device install app --device 00008310-000D08DA3E40E01E .build-watch/Build/Products/Debug-watchos/OkieWatch.app
```
Watch must be awake and unlocked; installs time out often, so retry. Then rebuild OkieHome for the iPhone and iPad. Free profile expires about 2026-11-04.

## Open
- Robot buttons and the stuck state not tried against the real robot.
- Rename of the vacuum to "Nimbus 2000" was done in Home Assistant by the user's other chat; confirm the watch shows it.
- Concept pictures for social media: `shots/okie-watch-concept2.png` (script `shots/concept2.py`).

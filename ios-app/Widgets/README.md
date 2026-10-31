# Changing the widgets

The widgets are native (WidgetKit) but their look is written down in one file, like the old Scriptable scripts: **`widgets.json`**.

1. Edit `widgets/widgets.json` (colours as `#rrggbb`, sizes in the old widgets' own units, the entity ids, the names and colours of the four light buttons, the feeder's 10-minute rule, the thermostat's colour scale and its 69 / 75 degree turning points, which calendars stay hidden).
2. Run `tools/build.sh run` (build and start on the booted simulator) or just `tools/build.sh`. It regenerates `Shared/WidgetSpec.swift` (never edit that file) and the card's icons, then builds.
3. For the real iPhone: open `OkieHome.xcodeproj` in Xcode and press Run (the build step runs `tools/build.sh`'s generators only when you run it yourself, so run it once before).

What stays in Swift code (not in the json): how a widget works (taps, timelines, the feeder's second-tap guard in `Shared/Intents.swift`), the shapes of the icons and the cat, and the text rules.

The original Scriptable scripts (`../DELIVER/okie-*-widget.js`) are still the reference for the look.

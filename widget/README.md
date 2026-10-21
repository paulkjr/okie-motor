# Thermostat widget for the iPhone

A home screen / Today view / lock screen widget that looks like the compact thermostat card of the dashboard: the mode icons at the left (the active one in the
colour of the target temperature), the name, the target as the big number, "Now 71°F · Cooling" and a coloured panel with a chevron at the right.

A tap on it opens the **big thermostat** at once, full screen, with the same five tabs as the card's detail view, each with its function:

- **Controls**: the wheel and the target (drag it, flick it, or use - and +), the modes, "Hold to turn off". It rolls out when you leave the tab and in when you come back.
- **Context**: the scenes, scripts and automations that use this thermostat and the scenes and scripts of its room, each with a Run button (it asks Home Assistant over its websocket). When nothing uses the thermostat yet, it says so and what the tab is for.
- **History**: 24 hours, 7 days or 30 days: changes, average run, active share, the timeline, time in each state, activity by hour (the card's own counting).
- **Schedule**: the weekly schedule, the same as the Schedule tab of the card and like the Google Home app (needs the Scheduler component): a tab for every weekday, the entries of that day with their name, degrees and time, a switch to turn one off, and **Add**. An entry sets a mode and degrees: *Cool to*, *Heat to*, a *Heat · Cool* range, a *Preset* such as Nest's Eco, or *Off*, on the days you pick (Every day, Mon - Fri, Weekend or any mix). **Comfort, Sleep, Eco and Away** are profiles with their own degrees (open "Comfort, Sleep, Eco & Away" at the bottom; one tap on *Update* changes every schedule of that name). The schedules live on your server, so they run when no screen is open; the profiles' degrees are remembered on this iPhone.
- **Settings**: three groups like the card's own settings. *Thermostat*: preset and fan. *Dial*: Glow, Glow softness and Marks (three sliders that change the wheel in Controls, each with a small arrow that puts it back to the usual value), *Colours* (the four colours of the scale and the two limits where it turns from cool to warm, folded away) and *Reset the dial look*. *This device*: the entity, the last change and all attributes. The dial look and the degrees of Comfort, Sleep, Eco and Away are kept in this iPhone's Keychain (the page asks the script to save them), and the colours also colour the widget on the home screen.

It does not go
through the Home Assistant page. iOS widgets cannot grow in place, so this full-screen panel (shown by Scriptable) is the closest thing; "Close" at the top leaves it.

It is a script for **Scriptable**, a free app that turns a small JavaScript file into an iOS widget. There is no app of ours to install, no Xcode and no Apple
developer account. The widget itself only *shows* the thermostat (iOS lets only real apps put buttons into a widget); the full-screen panel a tap opens is where you change it.

## Set it up (about five minutes)

1. **Scriptable**: install it from the App Store (free).
2. **The script**: put `okie-thermostat-widget.js` on the iPhone. Easiest: AirDrop it from the Mac (Finder > right click > Share > AirDrop) and choose
   *Scriptable* in the share sheet. (Or open it in Safari from the one-hour link, select all, copy, and in Scriptable tap **+** and paste.)
3. **A token** (so the widget may read the thermostat), in Home Assistant on the iPhone: tap your name (bottom of the sidebar) > **Security** > scroll to
   **Long-lived access tokens** > **Create token**, name it "iPhone widget", copy it.
4. In Scriptable tap the script, choose **Set up**, check the address, and paste the token. It is kept in the iPhone's Keychain, never in the script file.
   Then choose **Preview small** to see it, or **Open the big thermostat** to try the full-screen panel.
5. **Add the widget**: long press the home screen (or the Today view / lock screen) > **+** > **Scriptable** > pick a size > tap the new widget > set **Script**
   to this one. The *Parameter* box can hold another climate entity (for example `climate.bedroom`) for a second widget.

Small and medium sizes, and the three lock screen sizes (circle, rectangle, inline) are supported. The medium one is the card as it is on the dashboard; the small one
is the same card standing up, with the icons in a row at the bottom.

## Good to know

- The token is a key to your Home Assistant: do not share it. If the phone is lost, delete the token in Home Assistant (profile > Security) and the widget stops.
- The widget asks for a refresh every five minutes; iOS decides when it really happens, usually every 5 to 15 minutes. It is not live.
- If Home Assistant cannot be reached it shows the last temperature it saw, marked "old".
- The tap runs this same script inside Scriptable with the big thermostat (`scriptable:///run?scriptName=...&open=big`). Prefer your Okie dashboard? Change `const TAP = 'big'`
  at the top of the script to `'dashboard'`: the tap then opens `<your address>/okie-tablet/home?okie_open=climate.living_room` (needs Okie Motor 0.12.0 or newer).
- The full-screen panel has the card's own look (Sora and Manrope fonts, the wheel rolling in, the number shaking as it changes, a flick that keeps coasting). The *Close* button
  at the top left and the share button at the top right are Scriptable's own window and cannot be removed or restyled, and because Close belongs to Scriptable the wheel cannot
  roll out when you leave. If you want the real dashboard card instead (its own back arrow, the wheel rolling out), set `TAP = 'dashboard'`.
- The widget face is drawn with the card's own fonts (Sora for the number and the "Now" line, with its tabular digits like the big thermostat, Manrope for the name): a hidden web view draws the same picture and hands it back as an image. If that ever fails the widget falls back to the system fonts. The tabular digits come from `assets/fonts/Sora-tab.woff2` (`python3 tools/make-tab-font.py`, needs fonttools).
- The widget picture is made at exactly your phone's widget size and screen scale (one picture pixel per screen pixel), so it is as sharp as iOS can show it.
- The script is about 100 KB because the two fonts are inside it: AirDrop it rather than copying and pasting.
- The big thermostat page is `widget/big-page.html`; `python3 tools/make-widget.py` puts it, the fonts and the card's history code into the script. It talks to Home Assistant itself with the token; changes go out after a short pause (like the card), and it refreshes every few seconds.
- The colour of the panel and the active icon is the thermostat card's own (`src/okie-thermo.js`); `tests/widget.test.js` checks it stays the same.
- `preview.html` and `preview-big.html` (dev only) run the same script against stand-ins for Scriptable and Home Assistant, to look at the design on the Mac.

There is a weather widget too (`WEATHER-WIDGET.md`) a Feed the Beasts widget (`FEED-WIDGET.md`) and a Shortcuts widget (`SHORTCUTS-WIDGET.md`).

# iPhone home screen widgets

There are two ways. Pick one (or use both).

| | Native widgets in the Okie Home app | Scriptable widgets |
|---|---|---|
| Needs | the [Okie Home app](06-OKIE-HOME-IOS-APP.md) built with Xcode | the free **Scriptable** app, no Xcode, no developer account |
| Widgets | Thermostat, Weather, Calendar, Lights, Feeder | Thermostat, Weather, Feeder, Shortcuts |
| Buttons in the widget | yes (lights, feeder) | no (iOS lets only real apps put buttons in a widget; a tap opens a panel) |
| Looks | glass look that follows the card's settings | drawn with the card's fonts |

The native widgets are described in [06-OKIE-HOME-IOS-APP](06-OKIE-HOME-IOS-APP.md#widgets). The rest of this page is the Scriptable way.

## Scriptable widgets, step by step (about 5 minutes each)

1. Install **Scriptable** from the App Store.
2. Get a script onto the iPhone. The scripts are in [`widget/`](../../widget): `okie-thermostat-widget.js`, `okie-weather-widget.js`, `okie-feed-widget.js`, `okie-shortcuts-widget.js`.
   AirDrop it from the Mac and choose *Scriptable* in the share sheet, or open the file in Safari, select all, copy, and in Scriptable tap **+** and paste. (The thermostat and weather scripts are about 100 KB because the fonts are inside: prefer AirDrop.)
3. **Create a token** so the widget may read your devices. In Home Assistant on the iPhone: tap your name at the bottom of the sidebar > **Security** > **Long-lived access tokens** > **Create token**, name it "iPhone widget", copy it. The token is a key to your Home Assistant: do not share it. Delete it in the same place if the phone is lost.
4. In Scriptable tap the script and choose **Set up**: check the address (the scripts ship with `https://your-home-assistant.example` as a stand-in) and paste the token. It is stored in the iPhone's Keychain, never in the script.
5. **Add the widget**: long-press the home screen > **+** > **Scriptable** > a size > tap the new widget > *Script*: choose the script. The *Parameter* box can hold another entity (for example `climate.bedroom`) for a second widget.

Each widget has its own page with details: [thermostat](../../widget/README.md), [weather](../../widget/WEATHER-WIDGET.md), [feeder](../../widget/FEED-WIDGET.md), [shortcuts](../../widget/SHORTCUTS-WIDGET.md).

## Good to know

* iOS decides when a widget refreshes (every 5 to 15 minutes); it is not live. If Home Assistant cannot be reached the widget shows the last value, marked old.
* A tap on the thermostat widget opens a full-screen panel in Scriptable, or (set `const TAP = 'dashboard'` at the top of the script) your Okie dashboard on that device.
* Your Home Assistant must be reachable from the phone when you are not at home for the widgets to update away from home (Nabu Casa, Tailscale, a reverse proxy).

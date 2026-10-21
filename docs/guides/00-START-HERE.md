# Start here: Okie Motor on a fresh Home Assistant

This page takes you from a Home Assistant that was just installed to Okie Motor on your screens. Each step links to a short guide with the details.
Allow about 20 minutes for the card and the dashboard, and another 30 to 60 minutes if you also build the iPhone / iPad app.

## 0. What you need

* A running Home Assistant ([installation guide](https://www.home-assistant.io/installation/)), any install type, and an owner account.
* A way to put a file in the `config` folder (the *File editor*, *Studio Code Server* or *Samba share* add-on, or HACS, see step 2).
* For the iPhone / iPad app only: a Mac with Xcode and an Apple ID.

## 1. Prepare Home Assistant

1. **Turn on Advanced mode.** Click your name at the bottom of the sidebar, switch on **Advanced mode**. Without it the *Resources* page and the raw dashboard editor are hidden.
2. **Check your home.** *Settings > System > General*: set the location, the unit system (this decides °C or °F everywhere) and the time zone.
3. **Give the card something to show.** It adapts to what you have:

   | Screen | Needs | How to get it |
   |---|---|---|
   | Weather on the lock page and the slider | a `weather.*` entity | A new Home Assistant already has `weather.home` (Met.no). Otherwise *Settings > Devices & services > Add integration > Weather*. |
   | Calendar | `calendar.*` entities | *Add integration* > **Local Calendar** (simple) or Google Calendar. |
   | To-dos | `todo.*` entities | *Add integration* > **Local To-do** or Shopping list. |
   | Rooms | devices placed in **areas** | *Settings > Areas*; every area with devices becomes a room. |
   | Cameras, thermostat, music, vacuum ... | those integrations | Add the ones you own. |
   | Assistant (ask in the search bar, by voice) | an Assist pipeline | *Settings > Voice assistants*: the default pipeline works for simple commands; add an LLM conversation agent for free-form questions. |
   | Energy | the Energy dashboard set up | *Settings > Dashboards > Energy*. |

   **No devices yet?** Add this to `configuration.yaml` and restart Home Assistant to get Home Assistant's built-in demo devices (lights, a thermostat, covers, locks, a media player ...):

   ```yaml
   demo:
   ```

   The demo settings file in [`demo/`](../../demo) already lists some of those devices as favorites.

## 2. Install the card

Pick one, details in [01-INSTALL-THE-CARD.md](01-INSTALL-THE-CARD.md):

* **HACS** (recommended): add this repository as a custom repository, category *Dashboard*, install **Okie Motor**.
* **By hand**: copy `dist/okie-motor.js` to `/config/www/okie-motor.js` and add the resource `/local/okie-motor.js` as a *JavaScript module*.

## 3. Create the dashboard

[02-CREATE-THE-DASHBOARD.md](02-CREATE-THE-DASHBOARD.md): a new dashboard with the URL **`okie-tablet`** and the YAML from [`demo/dashboard-okie.yaml`](../../demo/dashboard-okie.yaml). Use that exact URL if you want the iOS app to find it without any setting.

## 4. Import the demo settings (optional)

[03-IMPORT-THE-DEMO-SETTINGS.md](03-IMPORT-THE-DEMO-SETTINGS.md): one file that gives you a good-looking starting point (glass, lock page, start screen, assistant on) instead of the bare defaults.

## 5. Put it on your devices

| Device | Guide |
|---|---|
| Mac, Windows or Linux computer | [04-COMPUTER-BROWSER.md](04-COMPUTER-BROWSER.md) |
| iPhone or iPad with Safari or the Home Assistant app | [05-IPHONE-IPAD-SAFARI-AND-COMPANION-APP.md](05-IPHONE-IPAD-SAFARI-AND-COMPANION-APP.md) |
| iPhone or iPad with the **Okie Home** app (full screen, haptics, voice, widgets) | [06-OKIE-HOME-IOS-APP.md](06-OKIE-HOME-IOS-APP.md) |
| iPhone home screen widgets without Xcode | [07-IOS-WIDGETS.md](07-IOS-WIDGETS.md) |
| A tablet on the wall (iPad, Android, Fire tablet) | [08-WALL-TABLET-AND-FIRE-TABLET.md](08-WALL-TABLET-AND-FIRE-TABLET.md) |

Every device shows the same favorites, rooms and look: the card keeps them in Home Assistant, in your user's storage.

## 6. If something is wrong

[09-TROUBLESHOOTING.md](09-TROUBLESHOOTING.md).

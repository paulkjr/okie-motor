# Troubleshooting

## The card does not show up

| What you see | Cause and fix |
|---|---|
| *Custom element doesn't exist: okie-motor-card* | The script is not loaded. Check **Settings > Dashboards > ⋮ > Resources**: the URL (`/local/okie-motor.js`) must open the file in the browser and the type must be **JavaScript module**. Hard refresh. |
| The file does not open at `/local/okie-motor.js` | It is not in `/config/www/`. If you just created the `www` folder, restart Home Assistant once. |
| It worked, now it looks old after an update | The browser keeps the old file. Hard refresh, or change `?v=...` of the resource URL. Phones and tablets cannot hard refresh, so change `?v=`. |
| A red error box with `okie-motor` | Open the browser's developer console (F12), copy the first red line and open an issue. |
| The card is small in a corner | The view is not a **panel** view. Use `type: panel` as in [02](02-CREATE-THE-DASHBOARD.md). |

## It shows, but something is empty

| Symptom | Cause |
|---|---|
| **Favorites** is empty | A fresh install has none. Hold a card > *Add or remove favorites*, or import [the demo settings](03-IMPORT-THE-DEMO-SETTINGS.md) (its favorites are demo devices). |
| **Rooms** is empty | Rooms come from Home Assistant **areas** that hold devices. *Settings > Areas*, assign devices. |
| Weather is missing | The card looks for `weather.home`. Set `weather_entity: weather.your_entity` in the YAML or Settings. |
| Calendar has no events | Add a calendar integration (Local Calendar, Google Calendar). Calendars can be hidden in the Calendar app's list button. |
| To-dos are empty | Add a **Local To-do** list (a `todo.*` entity). |
| Energy is empty | Set up the Energy dashboard in Home Assistant first. |
| The power value on the lock page is missing | `power_entity: sensor.your_power` in the YAML, or leave empty to use the strongest power sensor. |
| The **Home map** page of the Widgets card is missing | It only appears when a separate custom card named `floorplan-card` is installed (not part of this repository). |
| Wallpaper is the default picture | Your own: `wallpaper: /local/okie/wallpaper.jpg` or Settings > Appearance > Wallpaper. |

## The assistant and the microphone

* **"No assistant"** or the sparkle button is missing: *Settings > Voice assistants* needs a pipeline with a conversation agent. The card uses the one you choose in its Settings > General > Assistant, or the default.
* **The microphone does nothing**: browsers only allow it on `https://` or `localhost` and ask once (check the site permission). Firefox has no speech recognition. In the Okie Home app allow *Microphone* and *Speech Recognition* in iOS Settings > Okie Home.
* **It does not send when I stop talking**: it waits about a second and a half of quiet. A noisy room keeps it listening; tap the microphone again to send.

## The page keeps going back to the lock page

The card returns to the lock page after a while without touch only if the **screensaver** is on for that screen (Settings > General > *Back to the lock page after*, or `rest:` in the YAML). Set it to *never*. In the Okie Home app it does not reset when you only switch to another app.

## The layout is wrong on one device

* The size is per screen: Settings > Appearance > *Size* (40 to 130 %).
* On a tablet the column sits a little above the middle; the panel height uses the room under it.
* If one device shows an older look, it is running an older copy of the script: change `?v=` in the resource URL.

## Settings do not sync

Settings are stored in Home Assistant under your **user** (`frontend/set_user_data`, key `okie_motor_settings`), so the same user must be signed in on each device. They sync when a screen starts, when it comes back to the foreground, and every five minutes. Settings has a sync switch (*Backup & sync*) if you want a screen to keep its own.

## Still stuck

Open an issue with: what you did, what you expected, what happened, the card version (Settings > About), the device and browser, and the first red line of the console.

# Weather widget for the iPhone

A home screen widget that is the weather card of the dashboard: the sky (a cloud with the sun or the moon behind it, the card's own icons; dark with stars at night),
the place, the big temperature, the condition with the high and the low, the next six hours and, on the large size, the next six days. Small, medium and large, and the
three lock screen sizes.

A tap opens the **full-screen weather on its second page**: feels like, humidity, wind (and gusts), pressure, visibility, dew point, UV, clouds, sunrise and sunset, and the
next hours. Swipe sideways for the first page (the sky and the next days). It shows what Home Assistant knows when you tap; it is not live while open.
Prefer your Okie dashboard? Change `const TAP = 'big'` at the top of the script to `'dashboard'`: the tap then opens `<your address>/okie-tablet/home?okie_open=weather.home`.

It is a script for **Scriptable** (free in the App Store), the same one the thermostat widget uses, and it uses the **same address and token** (kept in the iPhone's Keychain),
so if the thermostat widget works, this one needs nothing more.

## Set it up

1. **The script**: put `okie-weather-widget.js` on the iPhone. Easiest: open `http://<the Mac>:4660/weather-widget` in Safari while the one-hour link is up, tap **Copy the script**,
   then in Scriptable tap **+**, paste, and name it "Okie Weather". (Or AirDrop the file to Scriptable.)
2. In Scriptable tap the script once: it asks for the address and the token the first time (skip if the thermostat widget is set up), then **Preview large** shows the widget.
3. **Add the widget**: long press the home screen > **+** > **Scriptable** > pick a size (the large one is the size of the Apple weather widget) > tap the new widget > set **Script**
   to "Okie Weather". The *Parameter* box can hold another weather entity (for example `weather.berlin`) for a second widget.

## Good to know

- The weather entity: the Parameter box, else the one saved on this iPhone, else `weather.forecast_home`; if that one does not exist the script looks through Home Assistant's entities, takes the weather one it finds (and remembers it). When nothing can be shown, the widget says why on its face.
- The widget asks for a refresh every 15 minutes; iOS decides when it really happens. If Home Assistant cannot be reached it shows the last weather it saw, marked "old".
- The forecasts come from Home Assistant's `weather.get_forecasts` (daily and hourly); a weather source without hourly forecasts shows no hours row.
- Night is when `sun.sun` says the sun is below the horizon (else the weather says clear-night, else the hour).
- The icons, the sky colours, the rows and the forecast code are the card's own (`src/okie-weather.js`): `python3 tools/make-widget.py` copies that code into the script, and
  `tests/weather-widget.test.js` checks the copy is up to date.
- `preview-weather.html` (dev only) runs the same script against stand-ins for Scriptable and Home Assistant, to look at the design on the Mac.

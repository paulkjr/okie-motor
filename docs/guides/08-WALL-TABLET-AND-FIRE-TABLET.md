# A tablet on the wall (iPad, Android, Fire tablet)

Okie Motor is built to live on a wall: it starts on a lock page with a big clock, goes back to it when nobody touches the screen, dims deeply at night, and wakes on motion, a doorbell or a critical alert.
This page is the set-up for each kind of tablet. The card's own settings are in [WALL-TABLET.md](../WALL-TABLET.md).

## 1. The dashboard and the settings (all tablets)

1. Install the card and make the dashboard as in [01](01-INSTALL-THE-CARD.md) and [02](02-CREATE-THE-DASHBOARD.md). For a wall tablet use [`demo/dashboard-wall-tablet.yaml`](../../demo/dashboard-wall-tablet.yaml): it hides Home Assistant's header and sidebar (needs the **kiosk-mode** plugin from HACS) and turns the screensaver on.
2. Open the dashboard once **on the tablet** and import [`demo/okie-wall-tablet-settings.json`](../../demo/okie-wall-tablet-settings.json) ([03](03-IMPORT-THE-DEMO-SETTINGS.md)).
3. In the card's **Settings > General** you can change what is per screen: *Back to the lock page after* (30 s, 1, 2 or 5 minutes, never), the deep rest, the wake sources. The same choices are the `rest:` block of the YAML.

```yaml
rest:
  lockAfter: '300'            # back to the lock page after 30, 60, 120 or 300 seconds without a touch, or 'never'
  deepAfterSec: 120           # then dim deeply and shift the clock every 3 minutes against burn-in
  awaySaverAfterSec: 60       # sooner when every person entity is away
  wakeEntities: binary_sensor.hall_motion, binary_sensor.doorbell     # these wake it
  screenEntity: switch.tablet_screen                                  # switched off at deep rest, on at wake (Fully Kiosk's Screen switch, for example)
  photoFolder: media-source://media_source/local/photos               # a photo frame behind the clock in deep rest
```

A critical alert (smoke, gas, water, tamper) wakes the tablet even during quiet hours. Quiet hours are in Settings > General > Notifications.

## 2. iPad

Two choices:

* **Safari Home Screen app**: [05](05-IPHONE-IPAD-SAFARI-AND-COMPANION-APP.md#option-1-safari-added-to-the-home-screen-recommended). Fast to set up, no Xcode.
* **The Okie Home app**: [06](06-OKIE-HOME-IOS-APP.md). Haptics, native microphone, stays on the screen after another app was in front.

Then, in iPadOS:
1. **Settings > Display & Brightness > Auto-Lock: Never** (the card has its own screensaver and deep rest).
2. Keep it on a charger. **Settings > Battery > Battery Health: optimized charging** or a smart plug that stops at about 80 % protects the battery.
3. **Guided Access** keeps a child or a visitor inside the app: *Settings > Accessibility > Guided Access*, switch on, set a passcode, then triple-click the top button inside the app.
4. To dim the screen at night without switching it off, deep rest does it; the screen stays on, so it can wake on a tap.

## 3. Android tablet and Amazon Fire tablet

Use a kiosk browser: **Fully Kiosk Browser** (Android Play Store; on Fire tablets from the Amazon Appstore or by installing its APK).

1. Install Fully Kiosk, open it, enter the dashboard address as the **Start URL**: `https://<your Home Assistant>/okie-tablet/home`.
2. In its settings turn on **Keep Screen On**, **Kiosk Mode** (hides the system bars; set a PIN), **Launch on Boot**, and **Reload on Network Reconnect**.
3. Optional: add the **Fully Kiosk Browser** integration to Home Assistant. It gives you a **Screen** switch (use it as `screenEntity` above, so deep rest really turns the screen off) and the camera-based motion detection as a wake source.
4. Fire tablets: if you do not use Fully Kiosk, set *Settings > Display > Screen Timeout* as long as it allows and keep the tablet on its charger.

Optional: the start screen can show **gadget cards** for a Kindle Fire tablet (`switch.kindle_fire_*`) and an AWTRIX clock (`light.awtrix_*`) when Home Assistant has such entities. They are found by their entity names; nothing to configure.

## 4. Replace an existing tablet dashboard safely

Do not point the tablet at the new card before the card is installed: an uninstalled custom card shows an error box and the wall would go blank. The order that never leaves the wall empty:

1. Install the card and hard refresh the tablet's browser.
2. Create a **second** dashboard ("Okie test") with the YAML and look at it on the tablet.
3. Back up the old dashboard (*pencil > ⋮ > Raw configuration editor*, copy everything into a file).
4. Replace the old dashboard's YAML with the new one, reload the tablet.
5. To roll back, paste the backup over it.

## 5. Tips

* **Rooms** and **favorites** arrange the same on the tablet as on any other screen (hold a card). Changes made on the tablet appear on your phone within a few minutes.
* **Videos** behind the detail screens: `.mp4` files in `/config/www/okie-videos/` (`light_on.mp4`, `binary_sensor_motion.mp4`, `default_1.mp4` ...), see [02](02-CREATE-THE-DASHBOARD.md#wallpaper-and-videos).
* A tablet keeps the page open for weeks. When Home Assistant serves a newer card, a quiet *newer version* line with a reload button shows (Hemma installs).

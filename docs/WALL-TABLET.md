# Wall tablet / kiosk

Okie Motor is built to live on a wall tablet: it starts on a lock page, falls back to it when nobody touches the
screen, dims deeply at night, and wakes on motion, a doorbell or a critical alert.

## Replace an existing tablet dashboard (safe order)

Do not point the tablet at the new card before the card is installed (see [INSTALL.md](INSTALL.md)): an uninstalled
custom card shows an error box and the wall would go blank.

1. **Install the card** (HACS, installer or by hand). Hard-refresh the tablet's browser.
2. **Try it beside the old one.** Create a new dashboard (Settings, Dashboards, Add dashboard, "Okie test"), open its
   raw configuration editor and paste `wall-tablet-dashboard.yaml`. Open it on the tablet or on a computer.
3. **Back up the old tablet dashboard.** Open it, pencil, three dots, Raw configuration editor, select all, copy into a
   file called `tablet-backup.yaml`.
4. **Replace it.** In the old dashboard's raw configuration editor select all, paste `wall-tablet-dashboard.yaml`, save.
   Reload the tablet.
5. **Roll back** by pasting `tablet-backup.yaml` over it again.

## Rooms

The Start screen has a Rooms tab (next to Favorites and Suggestions). Every room is a card; a room opens like the Tips app with a card for each device.
Without any configuration every Home Assistant area that has devices is a room. To choose exactly what is in a room, add a `rooms` list to the card:

```yaml
rooms:
  - name: Living Room
    area: Living Room                     # optional: every device Home Assistant has in this area (a list of names works too)
    items:                                # optional: devices to add, shown first, in this order
      - switch.kindle_fire_screen
      - light.awtrix_2c2c5c_matrix
  - name: Bedroom
    area: Bedroom
  - name: Patio
    items: [light.patio_light, camera.front_door_live_view]
    icon: sun                             # optional: any icon name; the default follows the room's name
```

A clip named after the room (`living-room.mp4`, `bedroom.mp4`, `patio.mp4`) in your videos folder plays behind the room's name.

You do not have to write any of this. A room made from a Home Assistant area only holds real devices (not every sensor), and in the app the pencil lets you
take devices out, add them from a searchable list, move them (to the top, or by dragging) and make or remove rooms. The same pencil in Favorites adds a plus for
the favorites and a Row / Tall card switch for the thermostat and the TV. These arrangements are stored in Home Assistant for your user (`frontend/set_user_data`,
key `okie_motor_rooms`), so every device you sign in on shows the same.

## Screensaver and deep rest

```yaml
rest:
  lockAfter: '300'              # back to the lock page after 30, 60, 120 or 300 seconds without a touch, or 'never'
                                # (the same choice is in Settings > General > "Back to the lock page after", and a choice made there wins)
  # enabled: true + saverAfterSec: 300 still work the way they did, for dashboards that already have them
  deepAfterSec: 120             # then dim deeply, shift the clock against burn-in
  awaySaverAfterSec: 60         # sooner when every person is away
  wakeEntities: binary_sensor.hall_motion, binary_sensor.doorbell
  screenEntity: switch.tablet_screen     # e.g. Fully Kiosk "Screen": off at deep rest, on at wake
  photoFolder: media-source://media_source/local/photos   # photo frame behind the clock in deep rest
```

These are also in the card's own Settings (General, Configure widgets). Quiet hours (Settings, General, Notifications)
make deep rest darker at night.

## Tips

- Fully Kiosk: set the start URL to the dashboard and turn on "Keep screen on"; use the screen switch above for sleep.
- A critical alert (smoke, gas, water, tamper) wakes the card even during quiet hours.
- Videos for the detail view go in `/config/www/fast-search-videos` (`light_on.mp4`, `default_1.mp4` and so on); the
  default folder is `/local/fast-search-videos`, the same one Fast Search Card uses.

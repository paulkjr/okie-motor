# Owlet: the sock, the camera and the nursery speaker

Okie Motor shows an Owlet Dream Sock and an Owlet camera as one baby monitor. The sock pages and the camera screen work with Home Assistant alone. The speaker (lullabies, talk), the clip recorder and the wall-tablet switch need small helpers on your server; they are **not** in this repository. Without them those buttons say they are not set up yet, and everything else keeps working.

## 1. The sock (works on its own)

Add the sock with an Owlet integration for Home Assistant. Okie finds it by its sensor names: anything like `sensor.<name>_owlet_sock_heart_rate`, `..._o2_saturation`, `..._skin_temperature`, `..._battery_percentage`, `..._sleep_state`, plus the `binary_sensor` ones (`_charging`, `_sock_off`, `_data_stale`, `_awake`).

You get:
- one **Owlet** item in Favorites with a status light (green fine, yellow check the sock, red alarm, blue charging)
- the **Owlet app** with Overview, Live, Sleep, History and Settings
- **History** for heart rate and oxygen from Home Assistant's long-term statistics

Set the baby's name, birthday and photo in the Owlet app > Settings > Profile.

## 2. The camera (works on its own)

Settings > Widgets > **Owlet camera entity**: pick your camera (for example `camera.nursery_owlet`). Its live view opens full screen with the sock's readings on glass cards. Zoom, turn and sound work with any camera Home Assistant can stream. If the camera is in the same Home Assistant area as the sock, Okie finds it by itself.

## 3. Optional helpers (your own server)

The card calls Home Assistant `rest_command` services named after the camera's object id (`camera.nursery_owlet` -> `nursery_owlet`). Make only the ones you need; without one, its button says it is not set up yet.

| Service | Data the card sends | What it should do |
|---|---|---|
| `rest_command.<cam>_snap` | `{}` | save a still picture |
| `rest_command.<cam>_clip` | `{ "seconds": 30 }`, `{ "seconds": 0 }` = stop | record a clip / stop it early |
| `rest_command.<cam>_play` | `{ "file", "loop", "timer_min" }` | play one of your songs on the camera speaker |
| `rest_command.<cam>_lullaby` | `{ "uuid", "repeat", "timeout_ms" }` | play one of the camera's built-in sounds |
| `rest_command.<cam>_stop` | `{}` | stop the sound |
| `rest_command.<cam>_volume` | `{ "percent" }` | speaker volume |
| `rest_command.<cam>_say` | `{ "file" }` | play a recorded voice clip (hold-to-talk) |

The Lullabies list comes from a sensor with these attributes: `mine` (a list of song file names), `owlet` (a list of `{ uuid, ms }`; `ms` 0 means it plays on and on), `volume` and `playing` (`{ kind, name }`). A REST sensor pointed at your helper is enough.

The **Clips** button opens the **Recordings page** you set in Settings > Widgets (for example your Jellyfin folder of clips) inside the camera screen, with an X to close it.

Songs you add with **Add a song** go to the Home Assistant media folder `owlet-sounds`; voice clips go to `owlet-talk`.

## 4. Baby monitor mode (wall tablet)

Settings > Monitoring in the Owlet app has a **Baby monitor mode** row. It switches the first `switch.*_baby_monitor` it finds. What the tablet does with it is up to your tablet setup; open the dashboard with `?okie=baby` to get the kiosk view (the Owlet camera full screen, never locks).

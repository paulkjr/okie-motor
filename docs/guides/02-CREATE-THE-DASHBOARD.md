# Create the dashboard

Okie Motor wants a whole dashboard view for itself (a *panel* view): the card draws its own sidebar-free screen with a lock page, search and apps.

## Steps

1. **Settings > Dashboards > Add dashboard > New dashboard from scratch.**
2. **Title**: `Okie` (any name). **URL**: change the suggested address to **`okie-tablet`**.
   The Okie Home iOS app opens `<your Home Assistant>/okie-tablet/home` by default, so this exact address means the app needs no setting. The URL must contain a dash.
3. Leave *Show in sidebar* on if you want to open it from the sidebar; click **Create**.
4. Open the new dashboard, click the **pencil** (edit), the **⋮** menu at the top right, **Raw configuration editor**.
5. Select everything and paste [`demo/dashboard-okie.yaml`](../../demo/dashboard-okie.yaml). **Save**, close the editor.

```yaml
title: Okie
views:
  - title: Home
    path: home                # the app opens /okie-tablet/home
    type: panel               # a panel view gives the card the whole screen
    cards:
      - type: custom:okie-motor-card
        start: bento          # bento = the start screen; browse = open with the search panel expanded
        language: auto        # auto | en | de
        squircle: standard    # card corner shape: none | strong | standard | soft
```

You should now see the lock page (a clock on a picture). Swipe up, scroll, or press a key to open the start screen. The microphone at the bottom of the lock page talks to your Assist agent.

## The header and the sidebar (recommended for the app and for tablets)

Home Assistant draws its own top bar and sidebar around a view. For a clean full-screen look (always for the Okie Home app and a wall tablet) install the **kiosk-mode**
plugin from HACS and put this at the top of the dashboard YAML (it is already in `demo/dashboard-okie.yaml`, commented out):

```yaml
kiosk_mode:
  hide_header: true
  hide_sidebar: true
```

Without the plugin Home Assistant simply ignores that key, and you keep its header and sidebar around the card. On a computer you can leave them: they are handy.

## Wallpaper and videos

* **Wallpaper**: put a picture in `config/www/okie/wallpaper.jpg` and add `wallpaper: /local/okie/wallpaper.jpg` under the card, or set it in the card's Settings > Appearance > Wallpaper.
* **Detail view videos** (optional, a short looping clip behind a device's detail screen): put `.mp4` files in `config/www/okie-videos/` named after what they show (`light_on.mp4`, `binary_sensor_motion.mp4`, `default_1.mp4` ...) and set `videos: { enabled: true, path: /local/okie-videos }`. Without them the card draws a picture of the device.

Every option is listed in [OPTIONS.md](../OPTIONS.md); every one is also in the card's own **Settings** app, where changes are kept in Home Assistant for your user.

Next: [03-IMPORT-THE-DEMO-SETTINGS.md](03-IMPORT-THE-DEMO-SETTINGS.md).

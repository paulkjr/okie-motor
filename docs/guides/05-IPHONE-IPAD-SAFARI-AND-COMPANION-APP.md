# iPhone and iPad without building the app: Safari or the Home Assistant app

You can use Okie Motor on an iPhone or iPad right away, with no Xcode. You lose the haptics, the native widgets and the "stays where you were" behaviour of the [Okie Home app](06-OKIE-HOME-IOS-APP.md), but everything else works.

## Option 1: Safari, added to the Home Screen (recommended)

1. On the device open Safari and go to `https://<your Home Assistant address>/okie-tablet/home`. Sign in and tick *keep me signed in*.
2. Tap **Share** (the square with an arrow) > **Add to Home Screen** > **Add**.
3. Open the new icon. It runs full screen without Safari's bars.

On an **iPad** this is a good wall-tablet setup too, see [08-WALL-TABLET-AND-FIRE-TABLET](08-WALL-TABLET-AND-FIRE-TABLET.md).

Tips:
* If the lock page asks for the microphone, allow it. Safari only allows the microphone on an `https://` address (a Home Assistant reached over plain `http://` on your home network cannot use it).
* An update of the card reaches the device when Home Assistant gives the file a new address: change the `?v=` number of the resource (see [01-INSTALL-THE-CARD](01-INSTALL-THE-CARD.md)), or reload the Hemma integration. A Home Screen web app keeps the old script until its address changes.
* The top of the page (status bar) shows the wallpaper: the card extends the picture underneath it on a touch screen.

## Option 2: the Home Assistant Companion app

1. Install **Home Assistant** from the App Store, sign in to your server.
2. Open the dashboard from the app's sidebar (it is listed by its title, *Okie*).
3. To hide the app's own top bar and the sidebar use the **kiosk-mode** plugin ([02-CREATE-THE-DASHBOARD](02-CREATE-THE-DASHBOARD.md)).

The companion app is a good choice if you already use it for notifications and presence.

## Which one on which device

| | Safari Home Screen app | Companion app | Okie Home app |
|---|---|---|---|
| Needs Xcode | no | no | yes |
| Full-screen look | yes | with kiosk-mode | yes |
| Haptics (taps, dials, rearranging) | no | no | yes |
| Microphone / voice | yes, over HTTPS | no (a web view has no speech recognition) | yes, with the app's own recognition |
| Home screen widgets | no (use [Scriptable](07-IOS-WIDGETS.md)) | HA's own widgets | Okie widgets |
| Stays on the screen you were on when you come back | depends on iOS | depends on iOS | yes |

# The Okie Home app (iPhone and iPad)

Okie Home is a small SwiftUI app that shows your Okie Motor dashboard full screen and adds what a web page cannot do: it signs in with Home Assistant's own login, gives **haptic** feedback,
listens with the **iOS speech recognition** (the microphone in the search bar and on the lock page), keeps you on the screen you were on when you come back to it, and has native **home screen widgets**.

There is no App Store version. You build it from the source in [`ios-app/`](../../ios-app) with Xcode and put it on your own devices. Allow 30 to 60 minutes the first time.

## What you need

* A Mac with a recent **Xcode** (the author builds with Xcode 26; the app targets iOS 17 and newer) and the command line tools.
* **XcodeGen**: `brew install xcodegen` (it generates the Xcode project from `project.yml`, so the project file is not stored in the repository).
* An **Apple ID**. A free one works, but a free signing certificate lasts 7 days (you rebuild and reinstall weekly); the paid Apple Developer Program lasts a year.
* An iPhone or iPad with iOS 17+, a cable, and **Developer Mode** switched on (*Settings > Privacy & Security > Developer Mode*, then restart).
* Your Home Assistant with the card and the dashboard from the earlier guides, the dashboard URL being `okie-tablet` and the view path `home` ([02-CREATE-THE-DASHBOARD](02-CREATE-THE-DASHBOARD.md)). The app opens `<your address>/okie-tablet/home`.
* The **kiosk-mode** plugin is recommended so Home Assistant's own header and sidebar do not show around the card.
* Home Assistant reachable from the device: on the home Wi-Fi at least; for use away from home an `https://` address (Nabu Casa, Tailscale, a reverse proxy ...).

## Build and install

1. **Make the identifiers yours.** Apple only allows one app per identifier, and `com.okiedokie` belongs to the author. Replace it everywhere (choose your own, e.g. `com.yourname`):

   ```bash
   cd ios-app
   grep -rl "com.okiedokie" . | xargs sed -i '' 's/com\.okiedokie/com.yourname/g'      # macOS sed
   ```

   This changes `project.yml`, `Config/*.entitlements`, `Config/*-Info.plist` and the helper scripts. The app and its widgets share a keychain group, so use the same prefix everywhere.
2. **Generate the project:** `xcodegen generate` (creates `OkieHome.xcodeproj`).
3. **Open it** (`open OkieHome.xcodeproj`). Select the project > target **OkieHome** > *Signing & Capabilities* > tick *Automatically manage signing* and choose your **Team**. Do the same for the target **OkieWidgets**.
4. **Plug in the device**, unlock it, choose it at the top of Xcode as the run destination and press **Run** (⌘R).
5. The first time, iOS may say the developer is not trusted: *Settings > General > VPN & Device Management > your Apple ID > Trust*. Press Run again if needed.

Prefer the command line (this is how the author installs it)?

```bash
xcodebuild -project OkieHome.xcodeproj -scheme OkieHome -destination "id=<DEVICE UDID>" \
  DEVELOPMENT_TEAM=<YOUR TEAM ID> -allowProvisioningUpdates -allowProvisioningDeviceRegistration \
  -derivedDataPath .build-device build
xcrun devicectl device install app --device <DEVICE ID> .build-device/Build/Products/Debug-iphoneos/OkieHome.app
```

(`xcrun devicectl list devices` shows the ids; the Team ID is on developer.apple.com under *Membership*.)

## First start

1. The app opens a sign-in page: your **Home Assistant address** (`https://ha.example.com` or `http://192.168.1.20:8123`), your **user name** and **password**, and the code if you use two-factor authentication. It talks to Home Assistant's own login flow; the tokens are kept in the iOS **Keychain**, never in a file.
2. Allow **Local Network** access when iOS asks (it needs it to reach a Home Assistant on your Wi-Fi), and **Microphone** and **Speech Recognition** the first time you tap the microphone.
3. The dashboard opens on the card's lock page. Swipe up.

**Sign out:** *Settings (the iOS app) > Okie Home > Sign out*, then open the app again.
**Refresh:** pull down from the top of the screen.

## How it behaves

* **Coming back to it** from another app leaves you on the screen you were on, however long you were away. The lock page shows when you open the app fresh, after you closed it.
* **After an update of the card** on your server the app notices the new version within a few seconds of opening and reloads itself once.
* **Haptics**: taps, the thermostat dial, rearranging cards, the calendar strip.
* **Voice**: the microphone in the search bar and on the lock page uses the iOS recognizer; it sends your question by itself when you stop talking.

## Widgets

The app contains native widgets (WidgetKit): **Thermostat**, **Weather**, **Calendar**, **Lights** and a pet **Feeder** button. Long-press the home screen, tap **+**, search for *Okie*, choose a widget and a size.
They read your address and tokens from the shared keychain, so they work as soon as you are signed in.

The entity ids, names and colours the widgets use are in [`ios-app/Widgets/widgets.json`](../../ios-app/Widgets/widgets.json) (the thermostat is `climate.living_room` by default). Change them for your devices, then run `ios-app/tools/build.sh` once (it needs Node and regenerates `Shared/WidgetSpec.swift`) and build again. See [`ios-app/Widgets/README.md`](../../ios-app/Widgets/README.md).

No Xcode, only widgets? Use the [Scriptable widgets](07-IOS-WIDGETS.md).

## Try it without a Home Assistant

```bash
cd ios-app
node mock/server.js                       # a pretend Home Assistant on port 8123, see mock/README.md for the test sign-in
./tools/build.sh run                      # builds for the booted iOS simulator and starts it
```

## Troubleshooting

| Problem | Try |
|---|---|
| *Failed to register bundle identifier* | The prefix is already taken: choose another in step 1 and run `xcodegen generate` again. |
| *No signing certificate / provisioning profile* | Pick your Team for both targets; connect the device once and let Xcode register it. |
| The app starts but the page stays black | Check that `https://<address>/okie-tablet/home` opens in Safari on the same device. Wrong dashboard URL is the usual reason. |
| *That address does not look right* | Type the address with `http://` or `https://`, without a path. |
| Home Assistant's header and sidebar show | Install **kiosk-mode** and use the YAML in [02-CREATE-THE-DASHBOARD](02-CREATE-THE-DASHBOARD.md). |
| The app stops opening after a week | A free Apple ID certificate expired: run it from Xcode again. |
| Widgets are empty | Open the app once and sign in; check the shared keychain group is the same for both targets (step 1). |

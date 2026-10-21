# A computer (Mac, Windows, Linux)

Open `https://<your Home Assistant address>/okie-tablet/home` in any current browser (Chrome, Edge, Safari, Firefox). Sign in as usual. The card opens on the lock page; swipe up, scroll or press any key.

## Make it feel like an app

* **Chrome / Edge**: ⋮ menu > *Cast, save and share* > **Install page as app** (Edge: *Apps > Install this site as an app*). It gets its own window and Dock / taskbar icon.
* **Safari (macOS Sonoma or newer)**: *File > Add to Dock*.
* **Full screen**: F11 (Windows / Linux) or Ctrl+Cmd+F (Mac).
* To hide Home Assistant's own header and sidebar, install the **kiosk-mode** plugin and use the YAML in [02-CREATE-THE-DASHBOARD](02-CREATE-THE-DASHBOARD.md).

## Size and position

The card scales its 1200 px wide column to the window. If you want it smaller, so more of the wallpaper shows:
**Settings > Appearance > Size** (this screen only). If the window is tall, the column sits a little above the middle; the same top position is used on every screen of the card.

## Good to know

* **After an update** of `okie-motor.js` do a hard refresh (Cmd+Shift+R / Ctrl+F5). With HACS reload the page once after it finished downloading.
* **Keyboard**: on the lock page any key opens the start screen; `Esc` closes an app or a device screen.
* **Microphone** (search bar and lock page): browsers only offer speech recognition over HTTPS or on `localhost`, and ask for permission once. Chrome and Safari work; Firefox has no speech recognition.
* **Several browsers or computers** share favorites, rooms and look through your Home Assistant user. Per-screen things (size, screensaver) stay on that screen.

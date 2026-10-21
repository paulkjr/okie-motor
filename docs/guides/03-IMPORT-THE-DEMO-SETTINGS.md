# Import the demo settings

The card keeps everything you set (look, lock page, start screen, favorites, rooms, assistant) in Home Assistant for your user, so every device shows the same thing.
You can save all of it as one file and load it again, also into another Home Assistant. This repository contains two such files:

| File | For | What it sets |
|---|---|---|
| [`demo/okie-demo-settings.json`](../../demo/okie-demo-settings.json) | any screen | A good-looking starting point: *Balanced* corners, glass look, the lock page on, the start screen with the five slider pages, the assistant and the search chips on, the dial colours, a handful of favorites. |
| [`demo/okie-wall-tablet-settings.json`](../../demo/okie-wall-tablet-settings.json) | a tablet on the wall | The same, with bigger text, no haptics, and the screensaver: back to the lock page after 5 minutes, deep rest after 2 more, sooner when everybody is away. |

Neither file contains anything personal: no addresses, no names, no passwords or tokens. The favorites are the ids of Home Assistant's built-in **Demo** integration and of the offline demo
(`light.ceiling_lights`, `climate.hvac`, `lock.front_door` ...). On your own Home Assistant favorites whose devices do not exist are simply left out, so the first thing you do is choose your own
(see below).

## Import

1. Open the card and open **Settings** (an entry in the dock and in the app list).
2. Go to the **About** tab, section **Backup & sync**, tap **Import settings**.
3. Choose the `.json` file.
   * In a **browser** a file picker opens: pick the file from your computer.
   * On an **iPhone or iPad in Safari** the Files picker opens; the file has to be in iCloud Drive or *On My iPhone* (AirDrop it to yourself, or save it from the repository page).
   * In the **Okie Home app** the same picker opens.
4. The card asks: *Replace the settings of this card with the file from <date>? It holds N favorites and M settings in all. Your current settings are kept once as a backup.* Confirm. The import **replaces** this card's settings (it does not merge), and every other screen of yours follows within a few minutes.

To go back, **Settings > About > Backup & sync > Export settings** *before* you import saves your current settings as a file you can import again later.

What is not in the file, on purpose: the size of the content on this screen (`scale`), the screensaver (`rest`, except in the wall tablet file) and the top offset. Those belong to one screen each.

## Choose your own favorites

* **Hold a card** on the start screen (or the pencil in the list header on a phone) to arrange: **Add or remove favorites** opens a searchable list of every device.
* Inside a room, hold a card to arrange it the same way.
* The list under the search bar learns from what you use (Settings > General > Learning) and offers **Suggestions**.

## Make your own demo file

Change anything in the Settings app, then **Export settings**. The file is plain JSON (`{ "app": "okie-motor", "format": 1, "settings": { ... } }`); delete what you do not want to share (entity ids, names, wallpaper paths) and publish it.

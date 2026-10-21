# Notice and attribution

**Okie Motor** is released under the GNU General Public License v3.0 or later (see `LICENSE`).

## Why GPL

The four card-shape presets in `src/okie-squircle.js` (Standard, Prominent, Balanced, Subtle) are numbers taken from
the bundled build of [Fast Search Card](https://github.com/fastender/Fast-Search-Card), which is GPL-3.0. Anything
that includes them has to be GPL-3.0-or-later too. Nothing else is copied: the rest of the code was written from
Fast Search Card's public documentation (`docs/FEATURES.md` in that repository) and from measurements of how a running
card lays out (recorded in `docs/FSC-LAYOUT-SPEC.md`: sizes, spacing, timings, option names).

## Not affiliated

This project is independent. It is not made, endorsed or supported by the authors of Fast Search Card or Hemma.
"Fast Search Card" and "Hemma" are the names of their projects. Fast Search Card's own TRADEMARKS notice asks that
forks do not present themselves as the original; Okie Motor uses its own name and does not use the original's logo
or artwork.

## Third-party

| Component | Use | License |
|---|---|---|
| [Hemma](https://github.com/willsanderson/Hemma) by willsanderson | Optional host theme/dashboard framework; the installer patches a copy of it. The sample room photo in `harness/assets/room.jpg` (resized) comes from its demo assets. | MIT |
| [Fast Search Card](https://github.com/fastender/Fast-Search-Card) by fastender | Squircle presets, design reference | GPL-3.0 |
| [Sora](https://github.com/sora-xor/sora-font), Copyright 2019 The Sora Project Authors | Embedded (latin, variable) in `src/okie-thermo-fonts.js`: the big number of the Thermo Dial | SIL Open Font License 1.1 (https://openfontlicense.org) |
| [Manrope](https://github.com/sharanda/manrope), Copyright 2018 The Manrope Project Authors | Embedded (latin, variable) in `src/okie-thermo-fonts.js`: the labels of the Thermo Dial | SIL Open Font License 1.1 (https://openfontlicense.org) |
| Inter, system fonts | Not bundled; the rest of the card uses the system font stack | n/a |

The sample data in `harness/mock-hass.js` is made up.

## Okie Home (the iOS app in `ios-app/`)

Released under the same licence (GPL-3.0-or-later). It contains the Sora and Manrope fonts (SIL Open Font License 1.1, see the table above) and no other third-party code. The sample room picture in its asset catalog
is the same resized picture as in `harness/assets/room.jpg`. Everything in `ios-app/mock/` is made up.

## Services and trademarks

* **Open-Meteo**: the optional "extra weather places" feature of the card looks up place names and forecasts with the free [Open-Meteo](https://open-meteo.com) API (data CC BY 4.0, "Weather data by Open-Meteo.com").
* **Spotify**: the large music card draws a simplified green circle logo when the name of a player contains "spotify". Spotify is a trademark of Spotify AB; this project is not affiliated with or endorsed by Spotify.
* **Home Assistant**, **HACS**, **Hemma**, **Scriptable**, **Fully Kiosk Browser**, **Apple**, **iPhone**, **iPad**, **iOS**, **Xcode**, **WidgetKit**, **Amazon Fire** and other names are trademarks of their owners and are used only to say what this project works with.
* The Okie Motor / Okie Home name, the app icon and the card's own drawings are this project's own.

## What is not included

The kiosk-mode plugin, Scriptable, Fully Kiosk Browser, the Scheduler component and HACS are separate projects that you install yourself.

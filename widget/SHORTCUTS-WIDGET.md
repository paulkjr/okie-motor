# Shortcuts widget for the iPhone

The bed light and the three light modes of the dashboard (Cozy lights, Let's go to sleep, Turn up the lights) as round buttons, in the look of the thermostat, weather and feed
widgets: warm smoky glass and the card's fonts. The buttons are dark smoky glass circles with a faint lit rim. The three light modes keep their own colour in the icon (coral flame,
violet moon, amber sun, as on the card's Light modes). The bed light has the wall tablet's light grey bulb (a round bulb with three lines under it); when it is on, its button turns white
with a lit amber bulb, like an active tile, and "On" / "Off" is written under its name.

- **Medium**: a row of four buttons. **Large**: two by two, bigger. **Small**: one button, the bed light (a small widget has a single tap).
- **Every button is its own tap.** It answers at once with a banner ("Cozy lights ..."), does the job, and the banner turns into "Cozy lights ✓" with a soft sound
  (the bed light says "bedLight on ✓" or "bedLight off ✓"; a failure says why, with a failure sound).
- The light modes run the same Home Assistant scripts as the card's light modes (`script.govee_cozy_lights`, `script.govee_lets_go_to_sleep`, `script.govee_turn_up_the_lights`);
  the bed light toggles `switch.bedlight`.

## What a tap can and cannot do

An iOS widget cannot press a button silently: only an app's own widgets can. A tap on a Scriptable widget opens Scriptable for a second, the script runs and the banner appears;
swipe home. The picture of the widget is drawn when iOS refreshes it (about every 15 minutes), so the bed light's on/off can be a little behind; the tap always asks Home Assistant
for the real state before it toggles.

## Set it up

1. In Safari (with the Mac's one-hour link up) open `http://<the Mac>:4660/shortcuts-widget`, tap **Copy the script**, then in Scriptable tap **+**, paste, and name it "Okie Shortcuts".
2. Tap the script once. It uses the same address and token as the thermostat widget. The menu has one entry per button (the same as a tap), **Preview medium** and **Preview large**.
3. Add the widget: long press the home screen > **+** > **Scriptable** > medium (or large, or small) > tap it > set **Script** to "Okie Shortcuts".

Change the buttons in `TILES` at the top of the script: a name, an icon (`bulb3` the tablet's bulb, or the card's `bulb`, `flame`, `moon`, `sun`), `kind` (`switch` for something that toggles and shows On/Off,
`script` for a script or a scene), the entity and `c0`, the colour of a mode's icon.

## Good to know

- The fonts and icons are drawn the way the other widgets do it (a hidden web view draws the face with the card's Manrope font and icons); if that fails the widget draws with the iPhone fonts and writes "card fonts: ..." at the bottom.
- `python3 tools/make-widget.py` puts the font, the card's icons and the shape code into the script; `tests/shortcuts-widget.test.js` checks the buttons, what a tap does and that nothing is switched while a widget is only drawn.
- `preview-shortcuts.html` (dev only) runs the same script against stand-ins for Scriptable and Home Assistant and outlines the tap boxes.

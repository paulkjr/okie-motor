# Feed the Beasts widget for the iPhone

A widget with the look of the thermostat and weather widgets (warm smoky glass, the card's fonts): a round amber cat badge, FEED THE BEASTS and when they were fed last.
Small and medium sizes, and the lock screen sizes (text). No button drawn on it: the widget is the button.

**A tap does the job.** It runs your Home Assistant script (`script.feed_the_beasts_2`, the one the Google Home widget runs). You see it work: at the push a banner "🐈 Feeding the beasts ..." appears at once, and a second later the same banner becomes "🐈 Fed the beasts ✓ Done at 11:14 PM" with a soft success sound (and the phone's buzz when it is not on silent). iOS itself already dims a widget for a moment when it is pressed; that part is not ours.
If the cats were fed less than 10 minutes ago it asks first ("Fed 4 min ago already. Feed the beasts again?"), so a second tap by mistake does not feed them twice
(change `AGAIN_MIN` at the top of the script). The script is also in single mode in Home Assistant, so a run that is still going ignores another start.

## What a tap can and cannot do

An iOS widget cannot press a button itself: only an app's own widgets can (that is how the Google Home widget does it without opening anything). A tap on a Scriptable
widget opens Scriptable for a second, the script runs and the notification appears; swipe home. Nothing of ours stays on the screen. If you want a tap that opens
nothing at all, the native Shortcuts widget or the Home Assistant app's own widgets can do that (in their own look).

The widget itself is a picture drawn when iOS refreshes it (about every 15 minutes, iOS decides), so "Last fed" can be a little behind; the tap always asks Home Assistant
for the real time.

## Set it up

1. In Safari (with the Mac's one-hour link up) open `http://<the Mac>:4660/feed-widget`, tap **Copy the script**, then in Scriptable tap **+**, paste, and name it "Okie Feed".
2. Tap the script once. It uses the same address and token as the thermostat widget; if that one works nothing more is asked. **Preview small** / **Preview medium** show it;
   **Feed the beasts now** is the same as a tap.
3. Add the widget: long press the home screen > **+** > **Scriptable** > small or medium > tap it > set **Script** to "Okie Feed". The *Parameter* box can hold another script
   (`script.something`).

The script is found by name: if `script.feed_the_beasts_2` does not exist, a script whose name says "feed" is used and remembered.

## Good to know

- The fonts are loaded the way the other widgets do it (a hidden web view draws the face); if that ever fails the widget draws with the iPhone fonts and writes "card fonts: ..." at the bottom.
- `python3 tools/make-widget.py` puts the two fonts into the script; `tests/feed-widget.test.js` checks the words, the safety question and that nothing feeds while a widget is only drawn.
- `preview-feed.html` (dev only) runs the same script against stand-ins for Scriptable and Home Assistant.

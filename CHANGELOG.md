# Changelog

The same entries are shown inside the card (dock > What's new). Newest first.

## 0.55.0 (2026-10-27)

**Add widgets on the right, drop cards on each other to merge, a pencil on every device screen.**
- In arrange mode the right column has Add or remove widgets under its cards, like Add or remove favorites on the left. Every page (weather, to-do, news, calendar, tips, cameras, sensors, Kindle, AWTRIX, map) can be switched on and gets a card of its own
- Pull a card of the right column over the middle of another one and let go: its pages join that card and swipe one after the other. A card with several pages loses one by switching it off in its pencil, or in Add or remove widgets, and switching it on again gives it a card of its own again
- The Split and Merge buttons of 0.54.1 are gone: the cards you have now follow your old settings
- Every device screen has a pencil next to the heart: drag the handle between the picture and the controls to make the picture bigger or smaller, rename the device, or put the size back
- View All on a door or window sensor lists every open and close, a day at a time, in a scrollable list

## 0.54.2 (2026-10-27)

**A sensor lists all its events.**
- View All on a door or window sensor opens its History tab as a scrollable list of every open and close, a day at a time, newest first, for 24 hours, 7 days or 30 days (the same rows as on the sensor screen)

## 0.54.1 (2026-10-27)

**Split or merge the cards on the right, a music card in the demo, cleaner sliders.**
- In arrange mode the Widgets card has a Split button: the cameras, sensors and other pages leave the slider and become a card of their own. A Merge button on the cards puts them back into one swipeable card
- The browser demo now starts with a large music card, the blinds and a door sensor among its favorites
- Sliders (volume, brightness and the rest) look like the iOS Control Center ones: a straight white fill on a dark frosted track, no handle and no smeared glow

## 0.54.0 (2026-10-27)

**A Sensors menu, a blinds screen and a sensors card.**
- A new Sensors item in the menu lists the doors, windows, motion, water and smoke sensors of your home and the readings (temperature, humidity and so on): the ones that need a look first, then room by room. A tap opens the sensor
- The screen of a door or window sensor shows what it says, since when, a switch for its notifications and the recent events of your doors and windows, next to a photo
- The blinds screen shows a window with its shade, what it is doing (Opening, Closing, Open) and three round keys: open, stop, close
- The sensors card is a new page of the top-right slider, like the cameras card: a photo, the door or window it shows, a bell with the number of open ones and View Sensors. Settings > Widgets can switch it off

## 0.53.0 (2026-10-27)

**Browse your Spotify and play it on the tablet.**
- The Music screen has a Library button (and a Browse your Spotify button when nothing is playing): your playlists, artists, albums, Liked songs and more. Tap a playlist or album to open it, tap a song to play it, or use Play and Shuffle on a list
- Play here sends the music to this tablet speaker; Playing on shows where it plays now
- Home Assistant only offers browsing while a Spotify device is active, so a short guide leads there: open the Spotify app on the tablet, play any song once, and the library opens by itself
- If Spotify goes to sleep the library says so instead of failing, and a link logs in to Spotify again
- The iPhone and iPad app opens the Spotify app from the Open Spotify button
- The Spotify set-up note now says that Premium is needed

## 0.52.7 (2026-10-24)

The start screen is no longer pushed to the top on a tablet.
- When you had set the height of both columns with the handles, the panel under them still filled the whole window, so a strip of nothing stayed under the columns and the block was centred as if it were taller: it sat too high. The panel now follows the columns you set
- A column you have not set still fills the room, and a short column gives a shorter panel (both then sit in the upper middle)

## 0.52.6 (2026-10-24)

Safer with values from entities, settings and the web.
- The energy server page shows the numbers and texts of the server sensor as plain text: a value that an entity reports can no longer put markup into the page
- The recordings address of the cameras card (Settings, clips address) only accepts web addresses and paths, also when it comes from an imported settings file; anything else, such as a javascript: address, is dropped
- Editing a thermostat schedule keeps everything else in that slot: only the thermostat calls the card wrote are replaced, so a fan mode, a light, a scene or another thermostat in the same slot stay
- The name of your town on the weather screen is now off by default (it sent the home coordinates to bigdatacloud.net); switch it on in Settings if you want it, a name found before is still shown
- iPhone and iPad app: the sign-in goes only to the page of your own Home Assistant, and only that page can use the haptics, the microphone and the backup of the app
- Thanks to the reviewer of the HACS submission for reading the whole card

## 0.52.5 (2026-10-21)

The Feed the Beasts card has five more looks.
- While you arrange the start screen, the Feed the Beasts card has a pencil like the other cards: tap it and pick a look. They are the five designs of the feeder widget of the iPhone and iPad app: Orange cat, Peeking cat, Green leaves, Neon bowl and Bowl, drawn the same way and with the same pictures
- Compact is the row you had before and stays the default, so nothing changes until you pick one. The designs are taller (as high as the widget), the card gives that room back to the others when you go back to Compact
- The look is also in Settings, under the widgets (Feeder card look), and it travels with your exported settings
- The About tab in Settings now says thank you to fastender (Fast Search Card, the design this card comes from) and willsanderson (Hemma, the framework it was first made for)

## 0.52.4 (2026-10-21)

The Kindle Photos page fills its view.
- The photo manager in the Kindle view was built at the height the view had before an app opens taller on a tablet, so its grid stopped short with empty room under it. It now follows the height of the view, also when that changes

## 0.52.3 (2026-10-21)

The Calendar strip has no end, and Okie Home stays where you were.
- The strip of days, weeks, months and years has no limit any more: scroll back or forward and it keeps growing (it stopped around 2017 and 2048)
- In the Okie Home app, going to another app and coming back leaves you on the screen you were on, whether it was the Home Screen, an app or a device, however long you were away. The front page shows only when the app is opened fresh after it was closed. If iOS took the page from memory meanwhile, it comes back to the same screen
- The time the page was out of sight no longer counts as idle time for the screen saver

## 0.52.2 (2026-10-21)

Scrolling the Calendar strip picks the dates as you go, with a tick.
- Scroll the strip of days, weeks, months or years and the one at its left edge becomes the shown one as it passes, bold, with a haptic tick for each. The calendar below follows when you slow down, and the strip settles on the period you stopped at
- Tapping one still goes straight to it

## 0.52.1 (2026-10-21)

The calendar strip of days, weeks, months and years scrolls with your finger.
- The strip at the top of the Calendar (days, weeks, months, years) is a long list you scroll with a finger, with a long reach both ways, instead of jumping one step at a time. Tap one to go there: the highlight moves and the strip glides to it, it no longer rebuilds and jumps
- A swipe on the strip no longer switches between Day, Week, Month and Year

## 0.52.0 (2026-10-21)

The microphone sends by itself, listens on the lock page, and the column stays where it is.
- The microphone now notices that you stopped talking: a second and a half of quiet after your words and it sends the question, no second tap. Nothing said for a few seconds and it gives up. This works in the Okie Home app too
- On the lock page the microphone no longer opens the Home Screen: it listens right there. It turns red and pulses while it listens, what it hears shows above it, then the answer shows and is said aloud. The microphone in the search bar turns red and pulses too
- The top of the column is the same on every screen, the Home Screen, its tabs, the apps and the rooms: it is placed once, from the height of the Home Screen, so nothing jumps when you open something. An app opens taller by growing downwards and never past the bottom of the screen, so the Calendar can scroll again
- On a tablet the panel has one height whatever tab you open (Favorites, Rooms, Suggestions): it uses the room under it, and a card at the edge fades out
- The Home Screen sits lower on a tablet: the panel uses the room instead of stopping at the top

## 0.51.4 (2026-10-21)

A room can be arranged like the Home Screen, and going home is quicker.
- In a room, hold a card and it arranges like on the Home Screen: the Drag to arrange bar with Reset and Done at the bottom middle, drag by the handle, Row, Tall or Large per card, and a tap away from the list ends it. Reset puts back the order, the devices and the card sizes from when you started
- Going Home no longer builds the whole list again and no longer builds the navigation rail again when it only has to show another row as active, and the page is measured with one layout instead of two
- The rail no longer animates its blur while it opens, which was what made it hitch under a finger

## 0.51.3 (2026-10-21)

Smoother scrolling and swiping.
- The fade at the edge of a scrolling column now reads the positions of all its cards first and writes after, instead of mixing them, so a scroll does a fraction of the layout work it did
- The swipeable card only draws the page that is in view once it has settled; the other eight (cameras, map, weather stars) stay out of the picture until you swipe
- The twinkling stars of the weather card stand still while a column scrolls and on pages that are not in view
- The touch handler that carries a card is on the start screen only, no longer on every screen, so scrolling the other screens does not wait for it any more
- The temporary drag log is gone

## 0.51.2 (2026-10-21)

The Light modes card can be edited while you arrange.
- Arranging covers the Light modes card with a bar like the other cards: its layout (Side by side, Stacked, Icons only) and a pencil that opens the editor with the modes, their schedules and the look
- A tap on a mode does not run it while you arrange, so a lamp no longer turns on or a mode goes Active by mistake

## 0.51.1 (2026-10-21)

Opening a card ends the arrangement, and the slider has its pencil back.
- Open a card, a device or an app while arranging and the arrangement closes by itself, so the frames and the Done bar no longer stay on top of what you opened
- The bar over the Widgets card (the swipeable card) has a pencil again, next to the arrow: tap it to choose which cards it shows and in what order. The card is called Widgets there, not Weather

## 0.51.0 (2026-10-21)

A third size for the Spotify card, and cards that fade out instead of being cut.
- Spotify (and other music players) have a third size, Large: the cover big on the left, who is playing, the song and the artist, a blue progress line with the time played and the length, and previous, play and pause, next in the middle. Tap the line to jump in the song. Switch it in the arrangement (hold a card): Row, Tall or Large
- A card that does not fit and has to be scrolled now fades out at the edge of its column, at the bottom and at the top, instead of being cut in half. Cards in the middle keep their blur

## 0.50.4 (2026-10-21)

Both columns are framed the same, and the handle sits on the line.
- The dashed frame of the list and of the right column are now the same: rounded corners all round, the same thin line, the same height and the same margin around the cards
- The handle to set a column height is the same white bar on the bottom line of both frames. Grabbing the line or the bar no longer closes the arrangement; only a tap well away from the columns does

## 0.50.3 (2026-10-21)

Arranging ends when you tap away, and the Spotify card sits right.
- Tap anywhere outside the two columns and the arrangement closes and keeps what you changed, so you do not have to press Done (Done is still there)
- The Drag to arrange bar with Reset and Done now sits at the bottom middle of the screen, out of the way of the list
- The dashed frame around the right column is a little wider than its cards, like the one around the list
- The cards of the right column keep their own height: the Spotify card no longer stretches with a gap under it and the Feed card follows right after it

## 0.50.2 (2026-10-21)

A calmer Spotify card.
- A speaker or music player (Spotify, Cast) is one row now: a bigger cover, who is playing, the song and the artist in clear letters, and a round play and pause button with next. The power button is gone from players that cannot be switched on (Spotify), and shows only while a player that can be is off
- The card is filled the moment it shows, not on the next change

## 0.50.1 (2026-10-21)

The swipeable card is the size the sliding card always was.
- The one card with the weather, tasks, news, calendar, cameras, Kindle, AWTRIX and map is no longer taller: it has the height the sliding card had before, and the room where the cameras card used to be stays free (move a favorite card over to fill it)

## 0.50.0 (2026-10-21)

One swipeable card, a calmer home map, and pencils only while you arrange.
- The sliding card at the top right and the cameras, Kindle, AWTRIX and home map cards are now one card: swipe through weather, tasks, news, calendar, tips, cameras, Kindle, AWTRIX and the map. To keep them apart again, switch off One swipeable card in Settings, Widgets
- Home map: the walls are about half as thick, the plan keeps its own shape and is no longer stretched to fill the screen, and the device names are smaller and quieter with fainter lines to them, so the plan is lighter and the text balanced
- The pencil icons are gone from the list and the slider dots: hold a card to open the arrangement, and the pencils show only while it is open (to change the pages of the card)

## 0.49.3 (2026-10-21)

The home map is drawn wide and fits its screen.
- On a tablet the floor plan is drawn in its wide shape and fills the screen below the thin bar, whole and not cut off at the bottom. It was drawn upright and the lower rooms were out of sight because the map was given a fixed height measured too early; it now takes the room the screen has

## 0.49.2 (2026-10-21)

The home map has the whole screen.
- The Home map screen no longer has the picture panel at its side: the floor plan fills the full width, with a thin bar on top for the back button and the title, so the plan is bigger and fits better

## 0.49.1 (2026-10-21)

The column heights click into place, and the right cards open the arrangement when held.
- Pulling the handle of a column now snaps: to the automatic height, to the height of the other column (a dotted line shows it, so both columns are the same height with one pull), and to heights that end right after a whole card. You feel a small tick on each stop
- Hold any card of the right column (the sliding card, the cameras, the feeder, a favorite there) for a moment and the arrangement opens, like holding a card of the list; keep your finger down and pull to move it. The pages of the sliding card and the cameras card are still edited with the pencil under them

## 0.49.0 (2026-10-20)

The iPad layout is right again: text, device screens, the side rail and the right column.
- Text and boxes match on the iPad. iOS draws the text of the zoomed column at its full pixel size while the boxes shrink, so every number was 1.7 times too big for its ring, dial or card (the 6 and 88 percent of the Server rings, the 71 of the thermostat, the brightness number, the names of the side rail). The card now measures that and sets the text to the zoom, with 11 px as the smallest size, so everything fits as designed
- A device screen (thermostat, light, TV remote) is back to the height it was designed for. The last versions opened them tall, which stretched the picture, narrowed the right side and left the remote at the top with an empty space below
- Side rail: a quick tap on an icon goes straight into the app; hold your finger on the rail for a moment and it opens (names show, the row under your finger lights up, lift on a row to go there). The names open as wide as the longest one needs, so Energy Dashboard and Forecast are no longer cut off
- Right column, arranged like the list: the same dashed frame, a handle under it to set its height (drag it, double tap for automatic), whole cards with no half card at the bottom, both columns the same length, the red cross inside the card, and it scrolls like the list. A column that does not scroll gives every touch to the card you drag

## 0.48.1 (2026-10-20)

Cards in the right column can be dragged.
- The cards in the right column (the sliding card, the cameras card, the feeder and the favorites you moved there) are picked up and moved at once, in any direction: their bar no longer lets the column scroll under your finger, which is what made the drag stop a moment after it started on the iPad. Hold or pull, then drop it between other cards or in the list
- Drag a card to the top or bottom edge of a column that scrolls and the column scrolls for you, so a card can be dropped below the fold. A long press while arranging no longer opens the system menu

## 0.48.0 (2026-10-20)

The two columns work as one: drag any card anywhere.
- While the arrangement is edited, hold any card (in the list or in the right column) for a moment, or pull its handle, and drag it: a small card with its name follows your finger, the column under it is framed and a white line shows where it will land between that column cards. Let go and it is there. It works from the list to the right column, from the right column back to the list, and inside the right column (the sliding card, the cameras card, the feeder and the favorites you moved there can be put in any order). The round arrow still moves a card to the other column with one tap
- The frame and the small card of the last version did not show on the iPad (their style was lost), so a drag looked like nothing happened. They show again. A card you hold on the right is now picked up with a small tap and the column no longer scrolls away from under your finger

## 0.47.2 (2026-10-20)

Dragging a card to the other column is easier.
- Hold a card for a moment and pull it sideways: it now carries over to the other column even when your finger drifts up or down first (before, only a quick, almost straight sideways pull counted). Drop it anywhere past the middle between the columns. The list no longer slides the card up and down while you carry it
- The bar over the cards on the right is now as solid as the one on the list, so the text of the feeder card no longer shows through it

## 0.47.1 (2026-10-20)

The right column looks and works like the list while it is arranged, and the weather card keeps its look.
- The cards on the right now show the same bar as the cards of the list: the drag handle, the name and the round arrow (a favorite also has the Row and Tall switch and the red cross). Drag a card by its handle in any direction over to the other column. In the list the handle still sorts up and down, and carries the card over when you pull it sideways
- The sliding weather card is no longer squeezed when favorites are moved to the right: it keeps the height it had and the column scrolls

## 0.47.0 (2026-10-20)

Drag cards between the columns; pull down to refresh in the app.
- While the arrangement is edited (the pencil), pull a card sideways from its dark veil or its arrow and a small card with its name follows your finger; the column it would go to gets a dashed frame. Let go there and the card moves over and takes the size of its new place, let go anywhere else and nothing changes. It works from the list to the right column, from the right column back to the list, and for the sliding card, the cameras card and the feeder. The round arrows still move a card with one tap
- In the Okie Home app, pull the whole screen down from the top (not from a list or a slider) and it refreshes: the app clears its copy of the card and loads the page again, so a new version shows at once. The Refresh button of the last version is gone from the side rail

## 0.46.1 (2026-10-20)

A Refresh button in the Okie Home app.
- At the end of the side rail, inside the Okie Home app only, there is now a Refresh button: it clears the app copy of the card and loads the page again, so a new version of the card shows at once (no need to reload Hemma first). The app also checks by itself when it opens and each time you come back to it: when the server has a newer card than the one running, it refreshes once on its own

## 0.46.0 (2026-10-20)

Move cards between the left list and the right column.
- Press the pencil above the list (or hold a card): every favorite card in the list gets a round arrow to send it to the right column, and the cards on the right (the sliding card, the cameras card, the feeder, and the favorites you moved there) get a veil with a Move to the left button. Press it and the card goes over and takes the size of its new place: a favorite on the right is a card at the width of that column (the Row and Tall switch still works), a right-hand card on the left sits above the list at the list width
- The right column re-lays itself out for what it holds: when the sliding card leaves, the cameras card takes the free height; when nothing is left on the right but moved favorites, they fill it. Done, Reset and the pencil work as before. Your choice is kept in your settings and shared with your other screens

## 0.45.0 (2026-10-20)

Motion records with a play button under every camera.
- Open a camera and under the live picture there is now a list of its motion records for the last 7 days, newest first, grouped by day (Today, Yesterday, ...). Tap a row or its round play button to watch the recording, the same player as in the motion history. A camera with no motion shows a short note

## 0.44.2 (2026-10-20)

The sliders have no ghost lines any more.
- The light that spills from the filled part of a slider into the track was a blurred layer, and the iPad drew vertical streaks into the track with it (the volume bar showed them). It is now a plain soft fade with the same look settings (glow blur, spread and strength), on every slider

## 0.44.1 (2026-10-20)

The music volume is one wide bar, with a mute button.
- The volume sheet on the Music screen squeezed the slider into a small round dot with the percentage inside. It is now one wide bar with the percentage, and a round speaker button next to it that mutes and unmutes the player

## 0.44.0 (2026-10-20)

A heart on the music card, a cleaner music screen, and pill buttons you pull open.
- Music: a heart in the top right pins the player (the Spotify card) to your favorites, like every other device
- Music: the album picture now ends above the title, the progress bar and the 3 dots, so nothing lies under them; the artist name and the times are brighter with a soft shadow, easy to read on any cover
- The round button of "View Cameras" and the pills like it (Kindle, AWTRIX, home map, the motion history) can be pulled to the right: the button follows your finger and turns, a light fills the track behind it, the word drifts away, spreads and blurs. Let go past the middle and it opens (the button runs to the end and spins once more); let go early and it springs back. A tap on the pill still opens it

## 0.43.4 (2026-10-20)

The lists and widgets scroll with a finger on the tablet again.
- The lists and widgets scroll with a finger on the tablet again: the page script of the old setup (okie-ai-bridge.js, kiosk lock) cancelled every swipe it could not match to a scroller, and it cannot look inside the card. A swipe that starts in something that scrolls now stays inside the card

## 0.43.3 (2026-10-20)

The side rail opens when you touch it on a tablet or phone, and shows which one you are touching.
- A finger has no hover, so the rail stayed icons only. Now it opens the moment you touch it (the icons grow their names with the same spring as on hover) and the row under your finger lights up across its whole width, since the finger hides the icon. Slide along the rail and the light follows; lift your finger on a row to go there, lift it off the rail to go nowhere. A mouse still opens it on hover

## 0.43.2 (2026-10-20)

The list on a tablet shows whole cards again when the first card is the light modes.
- With favorites the first thing in the list is the light modes card: the tablet fit counted only the cards after it and gave up, so the list ended in the middle of a card. It now counts every card, and fits again when the lock page goes away or the screen is turned

## 0.43.1 (2026-10-20)

Calendar colours and hidden calendars are shared; the weather card has no caption under the hours.
- The colours you pick for the calendars and the calendars you switch off are kept in your synced settings, so the Okie Home app and its widgets show the same colours and leave out the same calendars
- The weather card on the start screen no longer repeats "Weather / Sunny" at the bottom left (the place and the condition are at the top; it overlapped the hours). The other cards keep their caption

## 0.43.0 (2026-10-20)

The card and the Okie Home app are one engine: weather with cities, calendar with a movable time line.
- Weather: your place with its real name and a location arrow, a plus to add cities (Open-Meteo, no key), a swipe sideways between places, and on a phone one tall page: scroll down for the details while the sky fades to dark. Every day and every hour the forecast gives, not only 14 / 48. The cities are kept in your synced settings, so the app shows the same ones
- Calendar: Today and Search buttons next to the plus; in the Day view drag the red time pill (or tap the hours) to choose a time, and the plus starts the new event right there
- Tablet: the column sits a little above the middle on an iPad, measured right in Safari too

## 0.42.0 (2026-10-20)

A feeder card under the cameras.
- On a wide screen the right side has a third card under the cameras: Feed the beasts, when the pets were last fed and one tap to feed them (the Home Assistant script with feed in its name). Fed less than 10 minutes ago, the first tap only asks, a second one feeds anyway
- The right side scrolls when its cards do not fit the height
- Settings > Widgets: Feeder card (on by default; it needs a script with feed in its id or name)

## 0.41.0 (2026-10-20)

On a tablet the list shows whole cards and the panel reaches lower.
- The cards on the left of the start screen no longer end cut in half: the list grows below the widgets at its right until the last card that fits, so every card you see is complete (what is left scrolls)
- The panel is taller on a tablet (up to 840 px instead of 672), so the lower part of the screen is used and the column does not float at the top

## 0.40.1 (2026-10-19)

The thermostat's glow no longer has a straight edge on the phone.
- On a phone the blue (or orange) glow of the wheel was cut off in a straight line just under the tab bubble, because its box started a little lower than where the earlier soft fade (0.15.1) ends. The box now fades in softly at its own top edge

## 0.40.0 (2026-10-19)

The same settings on every screen, and Export / Import.
- Settings are kept in Home Assistant for your user (`okie_motor_settings`), newest change wins; the card size and the screensaver stay per screen
- Settings > About > Backup & sync: Export settings / Import settings (a JSON file), a switch for the sync
- Okie Home app: share sheet and Files picker for the export / import

## 0.2.3 (2026-10-06)

Smoother dock, background back, dead entities gone.
- The dock now moves like Fast Search Card: one spring (stiffness 380, damping 32) slides the pill 144 px while each label opens 128 px, so the icons stay where they are
- The wallpaper paints inside the card again on every dashboard; `wallpaperView: true` (or the "Cover the whole view" switch) also puts it behind the header and sidebar of a panel view
- Unavailable, unknown and disabled entities, and entities without a room, stay out of search, suggestions and browsing, as in Fast Search Card (`limits.hideUnavailable`, `limits.areaOnly`, both on by default; alerts and the island still see room-less sensors)
- Scripts, scenes and buttons no longer show up as "Off" on the lock page

## 0.2.2 (2026-10-06)

Phone layout fixed.
- Detail views, the search panel and the apps now fill the screen on a phone instead of stopping halfway
- Everything keeps clear of the status bar (safe area, or `top_offset` up to 48 px)
- The tab bar is centred, the status island steps aside while a panel is open, the lock-page capsule no longer sits on the quote
- The notification list no longer jumps sideways while it opens

## 0.2.1 (2026-10-06)

Closer to the live Fast Search Card.
- Lock page spacing now matches the live card line for line
- The house history is filled from the Home Assistant logbook at start, so "Last: ..." and the lock-page line are right after a reload
- Timestamp states ("last triggered") and bookkeeping entities no longer count as things that happened

## 0.2.0 (2026-10-06)

Same layout as Fast Search Card.
- The 1200 px column scales with CSS zoom like FSC, with the status island, the search row and the bento at the measured positions
- Lock page with clock, greeting or quote and a swipe, scroll or key to open
- One persistent search panel: typewriter line, chips with live counts, filter popup (Tiles / List, Categories / Rooms / Recent)
- Bento: scrolling favorites and suggestions, sliding weather, to-do, news, calendar and tips pages, blue and orange live tiles
- Status island with an orb, capsule and notification list
- Settings rebuilt as FSC lists: sections, sub-pages with Back, glass switches, search and a Changed badge
- News reads every feed sensor (fast-news-reader, feedparser) automatically

## 0.1.0 (2026-10-06)

First build of the Okie Motor.
- Fuzzy search with intent parsing, chips and ghost completion
- Bento start screen and the 576px height ladder
- Detail view with five tabs, video backgrounds and history charts
- Calendar, to-do, energy, schedules and settings apps
- Notification center, house chronicle, deep rest and photo frame

### 0.2.0, added after the first cut

- AI in the search bar: a sparkle button opens a chat with your Home Assistant Assist agent (the same conversation as the Assistant app), an "Ask the assistant" row appears when you type a request, and the devices an answer touched show as tiles.
- The demo opens on the lock page (`?zen=0` skips it).

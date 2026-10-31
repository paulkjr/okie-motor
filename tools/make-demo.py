#!/usr/bin/env python3
"""Build dist/okie-demo.html: the whole Okie Motor running against a pretend Home Assistant.

One self-contained file (bundle, mock Home Assistant, a downscaled room photo, all inlined):
double-click it, no server and no install. Use it to look at the card and click through everything, before any installer is made. URL options: see the hint line in the page.
Run tools/build.py first. The sample lights, covers, calendars and so on are fake and live only in the page.
"""
import base64
import pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
bundle = (ROOT / "dist/okie-motor.js").read_text()
mock = (ROOT / "harness/mock-hass.js").read_text()
img = base64.b64encode((ROOT / "harness/assets/room.jpg").read_bytes()).decode("ascii")
song = base64.b64encode((ROOT / "harness/assets/demo-song.m4a").read_bytes()).decode("ascii")      # tools/make-demo-song.py
song_info = (ROOT / "harness/assets/demo-song.json").read_text()

html = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Okie Motor demo</title>
<style>
html,body{margin:0;height:100%%;background:#1b1916;font-family:Inter,system-ui,-apple-system,sans-serif;}
#bg{position:fixed;inset:0;background:url(data:image/jpeg;base64,%(img)s) center/cover;filter:brightness(.78) saturate(1.05);}
#wrap{position:relative;min-height:100%%;display:flex;justify-content:center;padding-top:0;box-sizing:border-box;}
okie-motor-card{width:100%%;}
#hint{position:fixed;left:12px;bottom:10px;z-index:5;color:#fff;opacity:.55;font-size:12px;pointer-events:none;text-shadow:0 1px 4px #000;}
</style></head><body>
<div id="bg"></div><div id="wrap"><okie-motor-card id="card"></okie-motor-card></div>
<div id="hint">Okie Motor demo: sample data only. It starts on the lock page: swipe up, scroll or press a key. Add ?zen=0 to skip it, ?lang=de for German, ?squircle=standard for FSC's Balanced shape, ?splash=handwritten for the hello. Thermostat: ?f=1&amp;open=climate.living_room opens the Nest of the house (Fahrenheit) at once.</div>
<script>%(bundle)s</script>
<script>%(mock)s</script>
<script>
var q = new URLSearchParams(location.search); window.__lang = q.get('lang') || 'en';
if (q.get('fresh') === '1') { try { Object.keys(localStorage).filter(function (k) { return k.indexOf('okie:') === 0; }).forEach(function (k) { localStorage.removeItem(k); }); } catch (e) {} }   // your settings stay between visits and versions; ?fresh=1 starts clean
var card = document.getElementById('card');
var m = makeMockHass(function (h) { card.hass = h; });
card.setConfig({ squircle: q.get('squircle') || 'none', start: q.get('start') || 'bento', zen: { enabled: q.get('zen') !== '0' }, language: window.__lang, splash: q.get('splash') || 'none', power_entity: 'sensor.house_power', weather_entity: 'weather.home', videos: { enabled: false } });
// in the demo every light dims, so the brightness bars and the drag on the lamps work on all of them
Object.keys(m.hass.states).forEach(function (id) { var e = m.hass.states[id]; if (id.indexOf('light.') !== 0 || !e || !e.attributes) return; var a = e.attributes; if (!a.supported_color_modes) a.supported_color_modes = ['brightness']; if (e.state === 'on' && !a.brightness) a.brightness = 200; });
// the demo's own song (public-domain Greensleeves, played by a pretend music box) with its words: the music card plays real sound and the lyrics view runs in time
(function () {
  var info = %(song_info)s, snd = new Audio('data:audio/mp4;base64,%(song)s'), id = 'media_player.spotify_alex';
  snd.preload = 'auto';
  var st = m.hass.states[id];
  if (st) { st.state = 'paused'; Object.assign(st.attributes, { media_title: 'Greensleeves', media_artist: 'Traditional (public domain)', media_album_name: 'Demo music box', media_duration: info.duration, media_position: 0, media_position_updated_at: new Date().toISOString(), entity_picture: 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1f6f5c"/><stop offset="1" stop-color="#0d2b3a"/></linearGradient></defs><rect width="300" height="300" fill="url(#g)"/><circle cx="150" cy="150" r="96" fill="none" stroke="#9be3c4" stroke-width="2" opacity=".5"/><circle cx="150" cy="150" r="62" fill="none" stroke="#9be3c4" stroke-width="2" opacity=".5"/><path d="M118 196c-10 0-18-7-18-16s8-16 18-16c4 0 7 1 10 3V98l62-16v78c-3-2-7-3-10-3-10 0-18 7-18 16s8 16 18 16 18-7 18-16V110l-42 11v59c0 9-8 16-18 16z" fill="#f2e3b3"/></svg>') }); }
  var realFetch = window.fetch;
  window.fetch = function (u, o) {
    if (/lrclib\.net/.test(String(u))) return Promise.resolve(new Response(JSON.stringify({ syncedLyrics: info.lrc, plainLyrics: info.lrc.replace(/\[[^\]]*\]\s*/g, '') }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    return realFetch.apply(this, arguments);
  };
  setInterval(function () {                                                        // the sound follows the card's player state
    var s = card.hass && card.hass.states[id]; if (!s) return;
    var a = s.attributes, want = s.state === 'playing', pos = (a.media_position || 0) + (want ? (Date.now() - new Date(a.media_position_updated_at).getTime()) / 1000 : 0);
    if (pos >= info.duration - 0.2) { if (!snd.paused) snd.pause(); return; }
    snd.volume = a.is_volume_muted ? 0 : (a.volume_level == null ? 0.5 : a.volume_level);
    if (want) { if (Math.abs(snd.currentTime - pos) > 1.2) snd.currentTime = pos; if (snd.paused) snd.play().catch(function () { /* the browser wants a click first */ }); }
    else if (!snd.paused) snd.pause();
  }, 250);
})();
applyDemoParams(q, card, m); card.hass = m.hass;
setTimeout(function () { try { var ss = card._settings; if (ss && q.get('fresh') !== '1' && !(ss.get().favorites || []).length) ss.set({ lightsFav: ['light.living_room_lamp', 'light.living_room_floor', 'light.kitchen_island', 'light.bedroom_left', 'light.garden_path'], favorites: ['media_player.spotify_alex', 'light.living_room_lamp', 'cover.living_room_blinds', 'binary_sensor.front_door', 'light.kitchen_ceiling'], cardStyle: { 'media_player.spotify_alex': 'large' }, bento: { w1mode: 'favorites' } }); } catch (e) { /* the demo still runs without its starter favorites */ } }, 3500);      // the demo starts with a music card (large), the blinds and a door sensor among the favorites

 var hh = m.hass; hh.language = window.__lang; hh.locale = { language: hh.language };
</script></body></html>
""" % {"img": img, "song": song, "song_info": song_info, "bundle": bundle.replace("</script>", "<\\/script>"), "mock": mock.replace("</script>", "<\\/script>")}
out = ROOT / "dist/okie-demo.html"
out.write_text(html)
print("wrote", out, "(%d KB)" % (out.stat().st_size // 1024))

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

html = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Okie Motor demo</title>
<style>
html,body{margin:0;height:100%%;background:#1b1916;font-family:Inter,system-ui,-apple-system,sans-serif;}
#bg{position:fixed;inset:0;background:url(data:image/jpeg;base64,%(img)s) center/cover;filter:brightness(.78) saturate(1.05);}
#wrap{position:relative;min-height:100%%;display:flex;justify-content:center;padding-top:56px;box-sizing:border-box;}
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
applyDemoParams(q, card, m); card.hass = m.hass; var hh = m.hass; hh.language = window.__lang; hh.locale = { language: hh.language };
</script></body></html>
""" % {"img": img, "bundle": bundle.replace("</script>", "<\\/script>"), "mock": mock.replace("</script>", "<\\/script>")}
out = ROOT / "dist/okie-demo.html"
out.write_text(html)
print("wrote", out, "(%d KB)" % (out.stat().st_size // 1024))

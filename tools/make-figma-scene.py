#!/usr/bin/env python3
"""Write figma/thermostat-desktop.html: the thermostat detail of the demo as one static page, built so the DesignAgent bridge turns it into
editable Figma layers (absolute boxes, solid fills, Sora and Manrope text, the wheel as an inline SVG of real ticks).

    python3 tools/make-figma-scene.py            then send the file to Figma with html_to_design (width 1440)

The numbers are the ones of the card on a wide screen at 73 degrees Fahrenheit. They live here once so a design change made in Figma can be
read back and put into src/okie-thermo.js and src/okie-detail.js.
"""
import base64, math, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
room = base64.b64encode((ROOT / "harness/assets/room.jpg").read_bytes()).decode()

W, H = 1440, 900                       # the scene
CX0, CY0, CW, CH = 125, 80, 1190, 740  # the glass card inside it
HERO_W = 650                           # 55 % of the card
COL_W = CW - HERO_W                    # the controls column: 540
COPPER = (186, 143, 114)               # accent colour at 73 F (blend of blue and orange)
cc = "rgb(%d,%d,%d)" % COPPER

# ---- the wheel, in column coordinates (the column starts at the top left of the controls) ----
D = CH - 176                           # wheel height: 88 px under the top of the card and 88 above its bottom
S = D / 300.0                          # scene units -> px
TH_RIGHT = COL_W - 28                  # right edge of the dial box
def px(X, Y): return (TH_RIGHT + (X - 375) * S, 88 + Y * S)
cx, cy = px(425, 150)
R_OUT, R_IN, R_MAJOR = 150 * S, 137 * S, 129 * S
rot = (73 - 50) * (236 / 69.0)          # degrees the wheel is turned at 73 F
tick_step = 236 / 129.0
n = round(360 / tick_step)
ticks = []
for i in range(n):
    a = math.radians(i * tick_step + rot)
    major = i % 5 == 0
    r1 = R_MAJOR if major else R_IN
    ticks.append('<line x1="%.1f" y1="%.1f" x2="%.1f" y2="%.1f" stroke="rgba(235,200,208,0.55)" stroke-width="%s" stroke-linecap="round"/>' % (cx + r1 * math.cos(a), cy + r1 * math.sin(a), cx + R_OUT * math.cos(a), cy + R_OUT * math.sin(a), "2.4" if major else "1.8"))
shadow = ''.join('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="#000" stroke-opacity="%.3f" stroke-width="9"/>' % (cx - 13, cy + 17, R_OUT + 10 + k * 8, 0.07 * (1 - k / 8.0) ** 1.6) for k in range(8))
glow = ''.join('<circle cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="%s" stroke-opacity="%s" stroke-width="%s"/>' % (cx, cy, R_OUT + 4, cc, o, w) for w, o in [(110, .012), (74, .018), (50, .026), (32, .04), (20, .07), (11, .12), (5, .25)])
ring_svg = ('<svg id="Wheel" width="%d" height="%d" viewBox="0 0 %d %d" style="position:absolute;left:0;top:0">' % (COL_W, CH, COL_W, CH)
            + '<g id="Wheel shadow">' + shadow + '</g>'
            + '<circle id="Wheel disc" cx="%.1f" cy="%.1f" r="%.1f" fill="#0b0908" fill-opacity="0.36"/>' % (cx, cy, R_OUT + 2)
            + '<g id="Wheel glow">' + glow + '</g>'
            + '<circle id="Wheel rim" cx="%.1f" cy="%.1f" r="%.1f" fill="none" stroke="%s" stroke-width="2.2"/>' % (cx, cy, R_OUT + 4, cc)
            + '<g id="Wheel ticks">' + ''.join(ticks) + '</g></svg>')

def box(id_, x, y, w, h, css="", inner=""):
    return '<div id="%s" style="position:absolute;left:%spx;top:%spx;width:%spx;height:%spx;%s">%s</div>' % (id_, x, y, w, h, css, inner)
def text(id_, x, y, s, size, weight=600, color="#ffffff", family="Manrope", extra=""):
    return '<div id="%s" style="position:absolute;left:%spx;top:%spx;white-space:nowrap;font-family:%s;font-weight:%s;font-size:%spx;line-height:%spx;color:%s;%s">%s</div>' % (id_, x, y, family, weight, size, int(size * 1.25), color, extra, s)

I = lambda d, c="#fff", w="1.6": '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="%s" stroke-width="%s" stroke-linecap="round" stroke-linejoin="round">%s</svg>' % (c, w, d)
ICON = {
    "sliders": "<path d='M5 3v18M12 3v18M19 3v18'/><circle cx='5' cy='9' r='2' fill='#fff'/><circle cx='12' cy='15' r='2' fill='#fff'/><circle cx='19' cy='8' r='2' fill='#fff'/>",
    "spark": "<path d='M12 3l2.2 6.2L21 12l-6.8 2.8L12 21l-2.2-6.2L3 12l6.8-2.8z'/>",
    "chart": "<path d='M4 4v16h16'/><path d='M8 15l4-5 3 3 4-6'/>",
    "clock": "<circle cx='12' cy='12' r='9'/><path d='M12 7v5l3 2'/>",
    "sun": "<circle cx='12' cy='12' r='4'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2'/>",
    "drop": "<path d='M12 3c3.2 4.2 6 7 6 10.4A6 6 0 0 1 6 13.4C6 10 8.8 7.2 12 3Z'/>",
    "snow": "<path d='M12 2v20M4.5 6l15 12M19.5 6l-15 12'/>",
    "heatcool": "<circle cx='7' cy='7' r='2.2'/><path d='M7 2v1.5M7 10.5V12M2 7h1.5M10.5 7H12M3.5 3.5l1 1M9.5 9.5l1 1'/><path d='M17 11.5v11M12.3 14.2l9.4 5.6M21.7 14.2l-9.4 5.6'/>",
    "chev": "<path d='M9 5l7 7-7 7'/>",
    "back": "<path d='M15 5l-7 7 7 7'/>",
    "heart": "<path d='M12 20s-7-4.6-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.400-7 10-7 10Z'/>",
    "power": "<path d='M12 3v8'/><path d='M7 6a8 8 0 1 0 10 0'/>",
}

# ---- hero (left) ----
hero = (box("Hero (video on top)", 0, 0, HERO_W, CH, "background:#1b2638;border-radius:40px 0 0 40px;overflow:hidden;",
        '<div id="Hero placeholder" style="position:absolute;left:0;top:350px;width:%dpx;text-align:center;font-family:Inter;font-weight:600;font-size:20px;line-height:26px;color:rgba(255,255,255,0.4)">HERO VIDEO: the video of the device plays here</div>' % HERO_W
        + box("Back button", 24, 24, 44, 44, "background:rgba(20,18,16,0.55);border-radius:22px;", '<div style="position:absolute;left:12px;top:12px">%s</div>' % I(ICON["back"], "#fff", "2"))
        + text("Title", 262, 24, "Google Nest", 18, 600, "#ffffff", "Inter")
        + text("Subtitle", 196, 50, "Living Room · Cooling · 73° → 73°", 14, 400, "rgba(255,255,255,0.75)", "Inter")
        + box("Favorite button", 582, 24, 44, 44, "background:#ffffff;border-radius:22px;", '<div style="position:absolute;left:12px;top:12px">%s</div>' % I(ICON["heart"], "#e0492f", "1.8"))))

# ---- controls (right) ----
tabs = ""
for k, ic in enumerate(["sliders", "spark", "chart", "clock", "sun"]):
    on = k == 0
    tabs += box("Tab %d%s" % (k + 1, " (active)" if on else ""), 271 + k * 44, 29, 40, 40, "background:%s;border-radius:20px;" % ("#ffffff" if on else "transparent"),
                '<div style="position:absolute;left:10px;top:10px">%s</div>' % I(ICON[ic], "#1d1b19" if on else "rgba(255,255,255,0.6)", "1.7"))
modes = ""
for k, (label, ic) in enumerate([("Heat", "drop"), ("Cool", "snow"), ("Heat/Cool", "heatcool")]):
    left = 46 + k * 80
    on = label == "Cool"
    modes += box("Mode %s%s" % (label, " (selected)" if on else ""), left + 14, 357, 40, 40, "background:%s;border-radius:20px;border:1px solid %s;box-sizing:border-box;" % (cc if on else "rgba(255,255,255,0.1)", cc if on else "rgba(255,255,255,0.16)"),
                '<div style="position:absolute;left:9px;top:9px">%s</div>' % I(ICON[ic], "#fff" if on else "rgba(255,255,255,0.72)", "1.7"))
    if on:
        modes += box("Mode selected ring", left + 9, 352, 50, 50, "border:2px solid rgba(186,143,114,0.85);border-radius:25px;box-sizing:border-box;")
    modes += '<div id="Mode label %s" style="position:absolute;left:%dpx;top:402px;width:68px;text-align:center;font-family:Manrope;font-weight:600;font-size:11px;line-height:14px;color:%s">%s</div>' % (label, left, "#ffffff" if on else "rgba(255,255,255,0.62)", label)

def chip(id_, x, y, w, label, on):
    return box(id_, x, y, w, 42, "background:%s;border-radius:21px;" % ("#ffffff" if on else "rgba(255,255,255,0.1)"),
               '<div style="position:absolute;left:0;top:11px;width:%dpx;text-align:center;font-family:Inter;font-weight:600;font-size:15px;line-height:19px;color:%s">%s</div>' % (w, "#1b1917" if on else "#ffffff", label))

controls = box("Controls (Thermo Dial)", HERO_W, 0, COL_W, CH, "overflow:hidden;",
    ring_svg
    + box("Tab bar", 266, 24, 250, 50, "background:rgba(255,255,255,0.12);border-radius:25px;") + tabs
    + text("Eyebrow", 46, 106, "TEMPERATURE, °F", 12, 700, "rgba(255,255,255,0.62)", "Manrope", "letter-spacing:2.2px;")
    + text("Temperature number", 44, 144, "73", 138, 800, "#f6f5f7", "Sora", "line-height:124px;letter-spacing:-4px;")
    + text("Now", 46, 270, "Now 73°F", 26, 600, "rgba(255,255,255,0.62)", "Sora")
    + box("Schedule icon", 46, 330, 15, 15, "", '<div style="position:absolute;left:0;top:0">%s</div>' % I(ICON["clock"], cc, "1.8").replace('width="20" height="20"', 'width="15" height="15"'))
    + text("Schedule link", 68, 329, "Set smart schedule", 13, 700, cc, "Manrope")
    + box("Schedule arrow", 312, 330, 14, 14, "", I(ICON["chev"], "rgba(255,255,255,0.6)", "1.8").replace('width="20" height="20"', 'width="14" height="14"'))
    + modes
    + text("Preset label", 28, 433, "PRESET", 12, 600, "rgba(255,255,255,0.62)", "Inter", "letter-spacing:0.96px;")
    + chip("Preset none (selected)", 28, 459, 84, "none", True) + chip("Preset eco", 120, 459, 70, "eco", False)
    + text("Fan label", 28, 515, "FAN", 12, 600, "rgba(255,255,255,0.62)", "Inter", "letter-spacing:0.96px;")
    + chip("Fan on", 28, 541, 62, "on", False) + chip("Fan off (selected)", 98, 541, 66, "off", True)
    + box("Power icon", 40, 597, 26, 26, "border:2px solid %s;border-radius:13px;box-sizing:border-box;" % cc, '<div style="position:absolute;left:5px;top:5px">%s</div>' % I(ICON["power"], cc, "2").replace('width="20" height="20"', 'width="12" height="12"'))
    + text("Hold to turn off", 74, 599, "Hold to turn off", 13, 700, "rgba(255,255,255,0.72)", "Manrope"))

card = box("Detail card (glass)", CX0, CY0, CW, CH, "background:rgba(58,50,44,0.46);border:1px solid rgba(255,255,255,0.2);border-radius:40px;overflow:hidden;box-sizing:border-box;", hero + controls)
scene = box("Okie Thermostat – Desktop", 0, 0, W, H, "overflow:hidden;background:#2a2622;",
            '<img id="Wallpaper" src="data:image/jpeg;base64,%s" style="position:absolute;left:0;top:0;width:%dpx;height:%dpx;object-fit:cover"/>' % (room, W, H)
            + '<div id="Wallpaper tint" style="position:absolute;left:0;top:0;width:%dpx;height:%dpx;background:rgba(18,15,12,0.52)"></div>' % (W, H) + card)

html = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style></head><body><div style="position:relative;width:%dpx;height:%dpx">%s</div></body></html>' % (W, H, scene)
out = ROOT / "figma/thermostat-desktop.html"
out.write_text(html, encoding="utf-8")
print("wrote", out, "(%d KB), wheel D=%.0f px, centre (%.0f, %.0f), %d ticks" % (len(html) // 1024, D, cx, cy, n))

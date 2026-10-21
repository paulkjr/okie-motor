#!/usr/bin/env python3
"""Write assets/fonts/Sora-tab.woff2: Sora with its tabular numerals as the normal digits.

    python3 tools/make-tab-font.py        (needs the fonttools and brotli packages; a one-off dev step, the result is committed)

The big thermostat sets its number with font-variant-numeric: tabular-nums: Sora's tabular 1 has a foot, the digits all have one width. A canvas cannot switch that
feature on, and the widget face is drawn on a canvas (widget/okie-thermostat-widget.js, webFace). So the digits of this copy of the font ARE the tabular ones, and
the widget asks for the family "Okie Sora Tab". Same licence as Sora (SIL Open Font License 1.1, see NOTICE.md).
"""
import pathlib

from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parent.parent
font = TTFont(ROOT / "assets/fonts/Sora-latin.woff2")
gsub = font["GSUB"].table
swap = {}
for rec in gsub.FeatureList.FeatureRecord:
    if rec.FeatureTag == "tnum":
        for li in rec.Feature.LookupListIndex:
            for st in gsub.LookupList.Lookup[li].SubTable:
                swap.update(getattr(st, "mapping", None) or st.ExtSubTable.mapping)
assert swap, "no tnum feature in Sora"
n = 0
for table in font["cmap"].tables:
    for code, name in list(table.cmap.items()):
        if name in swap:
            table.cmap[code] = swap[name]
            n += 1
font.flavor = "woff2"
out = ROOT / "assets/fonts/Sora-tab.woff2"
font.save(out)
print("wrote %s (%d KB), %d code points now map to their tabular glyphs" % (out.relative_to(ROOT), out.stat().st_size // 1024, n))

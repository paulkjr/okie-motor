#!/usr/bin/env python3
"""Make the demo's own song: Greensleeves (a 16th-century English tune, public domain) played by a pretend music box,
with its public-domain words timed to the notes. Written from scratch, so nothing in it is anyone's recording or copyright.

Writes harness/assets/demo-song.m4a and harness/assets/demo-song.json (duration + synced lyrics in LRC form).
make-demo.py inlines both into dist/okie-demo.html. Needs numpy and macOS afconvert.
"""
import json
import pathlib
import subprocess
import wave

import numpy as np

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "harness/assets"
SR = 44100
UNIT = 0.30                       # one eighth note in seconds: a gentle 6/8

NOTE = {"E3": 164.81, "G3": 196.0, "G#3": 207.65, "A3": 220.0, "B3": 246.94, "C4": 261.63, "D4": 293.66, "E4": 329.63,
        "F4": 349.23, "F#3": 185.0, "F#4": 369.99, "G4": 392.0}
CH = {"Am": ("A3", "E4", "A3"), "G": ("G3", "D4", "G3"), "E": ("E3", "B3", "E3")}
HARM = [(1, 1.0, 5.5), (2, 0.45, 8.0), (3, 0.22, 11.0), (4, 0.12, 15.0), (5.4, 0.05, 22.0)]   # partial, level, decay per second

# (note, eighths); a lyric line starts at the item that carries a text
verse_a = [("A3", 2),
           ("C4", 4, "Alas, my love, you do me wrong,"), ("D4", 2), ("E4", 3), ("F4", 1), ("E4", 2), ("D4", 4), ("B3", 2),
           ("G3", 3, "To cast me off discourteously,"), ("A3", 1), ("B3", 2), ("C4", 4), ("A3", 2), ("A3", 3), ("G#3", 1), ("A3", 2), ("B3", 4), ("G#3", 2),
           ("E3", 6), ("A3", 2)]
verse_b = [("C4", 4, "For I have loved you well and long,"), ("D4", 2), ("E4", 3), ("F4", 1), ("E4", 2), ("D4", 4), ("B3", 2),
           ("G3", 3, "Delighting in your company."), ("A3", 1), ("B3", 2), ("C4", 3), ("B3", 1), ("A3", 2), ("G#3", 3), ("F#3", 1), ("G#3", 2),
           ("A3", 6)]
chorus_a = [("G4", 6, "Greensleeves was all my joy,"), ("G4", 3), ("F#4", 1), ("E4", 2), ("D4", 4), ("B3", 2),
            ("G3", 3, "Greensleeves was my delight,"), ("A3", 1), ("B3", 2), ("C4", 4), ("A3", 2), ("A3", 3), ("G#3", 1), ("A3", 2), ("B3", 4), ("G#3", 2),
            ("E3", 6)]
chorus_b = [("G4", 6, "Greensleeves was my heart of gold,"), ("G4", 3), ("F#4", 1), ("E4", 2), ("D4", 4), ("B3", 2),
            ("G3", 3, "And who but my lady Greensleeves."), ("A3", 1), ("B3", 2), ("C4", 3), ("B3", 1), ("A3", 2), ("G#3", 3), ("F#3", 1), ("G#3", 2),
            ("A3", 10)]
# the chords, one per bar of six eighths (the pickups carry none)
bars_a = ["Am", "Am", "G", "G", "Am", "Am", "E", "E"]
bars_b = ["Am", "Am", "G", "G", "Am", "E", "Am"]
bars_c = ["G", "G", "G", "G", "Am", "Am", "E", "E"]


def tone(freq, dur, amp=0.5):
    n = int(SR * (dur + 1.2))
    t = np.arange(n) / SR
    y = np.zeros(n)
    for k, lvl, dec in HARM:
        y += lvl * np.sin(2 * np.pi * freq * k * t) * np.exp(-dec * t * (1.0 if freq > 200 else 0.8))
    y *= np.minimum(1, t / 0.004)                                        # no click at the start
    return amp * y / 1.8


def main():
    melody = verse_a + verse_b + chorus_a + chorus_b
    total_units = sum(x[1] for x in melody)
    length = total_units * UNIT + 3.5
    mix = np.zeros(int(SR * length) + SR)
    lrc, t0 = [], 0.0
    for item in melody:
        n, u = item[0], item[1]
        if len(item) > 2:
            lrc.append((t0, item[2]))
        f = NOTE[n]
        y = tone(f * 2 if f < 200 else f, u * UNIT, 0.5)
        i = int(t0 * SR)
        mix[i:i + len(y)] += y[:len(mix) - i]
        t0 += u * UNIT
    # the soft rolling accompaniment: the bar's chord as root, fifth, root, fifth, root, fifth
    # the verse's second half starts after one more pickup; the chorus follows straight on
    starts = []
    pos = 2 * UNIT                                                       # the first bar's start
    for bars in (bars_a, bars_b):
        starts.append((bars, pos)); pos += len(bars) * 6 * UNIT
        if bars is bars_a:
            pos += 2 * UNIT                                              # the pickup before the second half
    for bars in (bars_c, bars_c):
        starts.append((bars, pos)); pos += len(bars) * 6 * UNIT
    for bars, st in starts:
        for b, chord in enumerate(bars):
            root, fifth, _ = CH[chord]
            for k in range(6):
                f = NOTE[root] / 2 if k % 2 == 0 else NOTE[fifth] / 2
                y = tone(f, UNIT * 2, 0.17)
                i = int((st + (b * 6 + k) * UNIT) * SR)
                if i < len(mix):
                    mix[i:i + len(y)] += y[:len(mix) - i]
    # a little room: a tail of decaying noise convolved over the music box
    rng = np.random.default_rng(7)
    ir = rng.standard_normal(int(SR * 1.4)) * np.exp(-np.arange(int(SR * 1.4)) / (SR * 0.35))
    wet = np.fft.irfft(np.fft.rfft(mix, len(mix) + len(ir)) * np.fft.rfft(ir, len(mix) + len(ir)))[:len(mix)]
    out = mix + 0.12 * wet / max(1e-6, np.abs(wet).max()) * np.abs(mix).max()
    fade = int(SR * 2.0)
    out[-fade:] *= np.linspace(1, 0, fade)
    out = out / np.abs(out).max() * 0.85
    wav = OUT / "demo-song.wav"
    with wave.open(str(wav), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((out * 32767).astype("<i2").tobytes())
    subprocess.run(["afconvert", "-f", "m4af", "-d", "aac", "-b", "96000", str(wav), str(OUT / "demo-song.m4a")], check=True)
    wav.unlink()
    dur = int(len(out) / SR)
    text = "\n".join("[%02d:%05.2f] %s" % (int(s // 60), s % 60, line) for s, line in lrc)
    (OUT / "demo-song.json").write_text(json.dumps({"duration": dur, "lrc": text}))
    print("song", dur, "s,", (OUT / "demo-song.m4a").stat().st_size // 1024, "KB;", len(lrc), "lyric lines")


main()

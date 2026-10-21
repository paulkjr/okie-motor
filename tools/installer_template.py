#!/usr/bin/env python3
"""Okie Motor installer for Hemma (one file, python3 standard library only).

    python3 okie-install.py --check            look, change nothing
    python3 okie-install.py                    install (backs everything up first)
    python3 okie-install.py --uninstall        put the originals back
    python3 okie-install.py --only-motor       install just the Okie Motor, skip the
                                               Hemma look retune (nav glass, squircle token, hero)
    python3 okie-install.py --root /config     where Home Assistant's config lives

What it does, in plain words:
  * adds scripts/okie-motor.js and scripts/okie-version.json to Hemma
  * lists the script in Hemma's const.py so Hemma registers it as a dashboard resource
  * (unless --only-motor) applies the Hemma look retune: glass desktop nav, squircle tile token,
    warm hero tint, the one-line tile clip-path in the generated templates file
Every file it edits is first copied to <file>.bak-okie (only once, so the original is never lost),
every edit needs its anchor text to match exactly once, and a failed JSON check restores the file.
Run it again any time: edits already applied are recognised and skipped.
"""
import argparse
import base64
import json
import os
import shutil
import sys
import zlib

PAYLOAD = "__PAYLOAD__"

SCRIPTS = "custom_components/hemma/scripts"
BAK = ".bak-okie"


def load_payload():
    return json.loads(zlib.decompress(base64.b64decode(PAYLOAD)).decode("utf-8"))


def read(path):
    with open(path, encoding="utf-8", newline="") as f:
        return f.read()


def write_atomic(path, text):
    tmp = path + ".okie-tmp"
    with open(tmp, "w", encoding="utf-8", newline="") as f:
        f.write(text)
    os.replace(tmp, path)


def plan_edit(root, edit):
    """-> (state, detail). state: ready | applied | missing | mismatch"""
    path = os.path.join(root, edit["file"])
    if not os.path.isfile(path):
        return ("missing", "file not found")
    text = read(path)
    # `new` usually contains `old` (an appended block keeps its anchor as a prefix), so test `new` first
    if edit["new"] in text:
        return ("applied", "")
    n = text.count(edit["old"])
    if n == 1:
        return ("ready", "")
    return ("mismatch", "anchor found %d times (expected exactly 1)" % n)


def main():
    ap = argparse.ArgumentParser(description="Install the Okie Motor into Hemma.")
    ap.add_argument("--root", default="/config")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--only-motor", action="store_true")
    args = ap.parse_args()

    pl = load_payload()
    root = args.root
    print("Okie Motor %s (build %s)" % (pl["version"], pl["build"]))
    if not os.path.isfile(os.path.join(root, "custom_components/hemma/manifest.json")):
        sys.exit("Hemma was not found under %s (no custom_components/hemma/manifest.json). Use --root." % root)

    edits = [e for e in pl["edits"] if not (args.only_motor and e["group"] == "look")]
    files = pl["files"]

    if args.uninstall:
        restored = 0
        for rel in sorted({e["file"] for e in pl["edits"]}):
            path = os.path.join(root, rel)
            if os.path.isfile(path + BAK):
                shutil.copy2(path + BAK, path)
                restored += 1
                print("restored", rel)
        for rel in files:
            path = os.path.join(root, SCRIPTS, rel)
            if os.path.isfile(path):
                os.remove(path)
                print("removed", os.path.join(SCRIPTS, rel))
        print("Done. %d file(s) restored. Restart Home Assistant." % restored)
        return

    problems = 0
    todo = []
    for e in edits:
        state, detail = plan_edit(root, e)
        label = "%-8s %s  (%s)" % (state, e["file"], e["name"])
        if state == "ready":
            todo.append(e)
        elif state in ("missing", "mismatch"):
            if e.get("optional") and state == "missing":
                label += "  [optional, skipped]"
            else:
                problems += 1
                label += "  <- " + detail
        print(label)
    for rel in files:
        print("write    %s/%s" % (SCRIPTS, rel))

    if problems:
        sys.exit("\n%d problem(s). Nothing was changed." % problems)
    if args.check:
        print("\ncheck OK: %d edit(s) would be applied, %d file(s) written." % (len(todo), len(files)))
        return

    # back up every file we are about to touch (once; the first copy is the original)
    for rel in sorted({e["file"] for e in todo}):
        path = os.path.join(root, rel)
        if not os.path.isfile(path + BAK):
            shutil.copy2(path, path + BAK)
    done = []
    try:
        by_file = {}
        for e in todo:
            by_file.setdefault(e["file"], []).append(e)
        for rel, lst in by_file.items():
            path = os.path.join(root, rel)
            text = read(path)
            for e in lst:
                if text.count(e["old"]) != 1:
                    raise RuntimeError("%s: anchor changed while installing (%s)" % (rel, e["name"]))
                text = text.replace(e["old"], e["new"], 1)
            if rel.endswith(".json"):
                json.loads(text)                      # refuse to write broken JSON
            write_atomic(path, text)
            done.append(rel)
        for rel, b64 in files.items():
            data = zlib.decompress(base64.b64decode(b64)).decode("utf-8")
            path = os.path.join(root, SCRIPTS, rel)
            write_atomic(path, data)
            if rel.endswith(".json"):
                json.loads(read(path))
    except Exception as err:                          # put everything back
        for rel in done:
            path = os.path.join(root, rel)
            if os.path.isfile(path + BAK):
                shutil.copy2(path + BAK, path)
        sys.exit("FAILED, originals restored: %s" % err)

    print("\nInstalled. Next:")
    print("  1. Restart Home Assistant once (Settings > System > Restart), or reload the Hemma integration")
    print("     (Settings > Devices & services > Hemma > menu > Reload). That gives the script a new web address, so phones and")
    print("     tablets load the new version too; they cannot hard-refresh, and a browser keeps the old file until the address changes.")
    print("  2. Computer: hard-refresh your browser (Cmd+Option+R in Safari, Cmd+Shift+R in Chrome).")
    print("  3. First time only: add a dashboard card:  type: custom:okie-motor-card")
    print("To undo:  python3 okie-install.py --uninstall")


if __name__ == "__main__":
    main()

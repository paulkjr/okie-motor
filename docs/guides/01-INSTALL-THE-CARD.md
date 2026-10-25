# Install the card

The card is one file: `dist/okie-motor.js`. It needs no integration and no other card. Choose A or B (C only if you already use Hemma).

## A. With HACS (updates with one click)

1. Install [HACS](https://hacs.xyz) if you do not have it yet (its own guide, about 10 minutes, needs a free GitHub account).
2. In Home Assistant open **HACS**, click the **⋮** menu at the top right, **Custom repositories**.
3. Paste the address of this repository, choose the category **Dashboard** (older HACS versions call it *Lovelace* / *Plugin*), click **Add**.
4. Find **Okie Motor** in HACS, open it, **Download**. HACS adds the resource for you.
5. Reload the browser page (hard refresh: Cmd+Shift+R or Ctrl+F5).

The repository follows HACS' rules for dashboard plugins: `hacs.json` and `dist/okie-motor.js` in the root of the repository. If you fork it under another name, change `filename` in `hacs.json` to `<your repository name>.js` or rename the file in `dist/`.

## B. By hand

1. Get the file `dist/okie-motor.js` (download it from the repository or from a Release).
2. Put it into your Home Assistant `config` folder as `www/okie-motor.js` (create the `www` folder if it is not there; use the File editor, Studio Code Server or the Samba share; the first time you create `www`, restart Home Assistant once so it is served).
   Inside Home Assistant the file is now reachable as `/local/okie-motor.js`.
3. Open **Settings > Dashboards**, the **⋮** menu at the top right, **Resources** (needs Advanced mode, see [00-START-HERE](00-START-HERE.md)), **Add resource**:
   * URL: `/local/okie-motor.js?v=0.52.7`
   * Resource type: **JavaScript module**
4. Hard refresh the browser.

Browsers keep the old file when you update it. Change the number after `?v=` every time you replace the file (any new value works), and that device loads the new version. Phones and tablets cannot hard refresh, so this is the way to update them.

## C. One-file installer for Hemma users

If you already run the [Hemma](https://github.com/willsanderson/Hemma) dashboard framework, `dist/okie-install.py` copies the card into it, registers it and (optionally) applies a small look retune. Python 3 only, every file it edits is first saved as `<file>.bak-okie`:

```bash
cd /config                              # in the Studio Code Server terminal, with okie-install.py dragged into /config
python3 okie-install.py --check         # shows what it would do, changes nothing
python3 okie-install.py                 # installs
python3 okie-install.py --only-motor    # only the card, no look changes to Hemma
python3 okie-install.py --uninstall     # puts every original back, byte for byte
```

Then restart Home Assistant (or reload the Hemma integration) once so the card gets a new web address, and hard refresh.

## Check that it is installed

Open any dashboard in edit mode, **Add card**, and search for **Okie Motor**. If it is not offered, open the browser's developer console: a red message about `okie-motor.js` usually means the resource path is wrong (see [09-TROUBLESHOOTING](09-TROUBLESHOOTING.md)).

Next: [02-CREATE-THE-DASHBOARD.md](02-CREATE-THE-DASHBOARD.md).

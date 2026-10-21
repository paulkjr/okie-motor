# Install

> New here? The step-by-step guides for a fresh Home Assistant and for every device are in [guides/00-START-HERE.md](guides/00-START-HERE.md). This page is the short reference.

The card is one JavaScript file, `dist/okie-motor.js`, plus an optional look retune for [Hemma](https://github.com/willsanderson/Hemma).
It needs nothing else: no Hemma, no card_mod, no integration. Pick one way.

## A. HACS (after you publish this repository)

1. Push this folder to your GitHub repository (see the end of this page).
2. In Home Assistant: HACS, three dots, **Custom repositories**, add your repository URL, category **Dashboard**.
3. Install **Okie Motor**, restart the browser (hard refresh). HACS adds the resource itself.

The repository follows HACS' rules for dashboard plugins (`hacs.json`, `dist/okie-motor.js` named after the repository).
Name the GitHub repository `okie-motor`, or change `filename` in `hacs.json` to match your repository name.

The iOS app lives in `ios-app/` inside the same repository; HACS ignores it.

## B. One-file installer for Hemma users

`dist/okie-install.py` needs Python 3 and nothing else. It copies the bundle into Hemma, registers it, and (unless you
pass `--only-motor`) applies the Hemma look retune. Every file it edits is first copied to `<file>.bak-okie`.

```
# Studio Code Server terminal, with okie-install.py dragged into /config
cd /config
python3 okie-install.py --check        # shows what it would do, changes nothing
python3 okie-install.py                # installs
python3 okie-install.py --uninstall    # puts every original back, byte for byte
```

Restart Home Assistant once and hard-refresh the browser.

## C. By hand

Copy `dist/okie-motor.js` to `/config/www/okie-motor.js`, then Settings, Dashboards, three dots, **Resources**, add
`/local/okie-motor.js` as a **JavaScript module**.

## Then add the card

Create a dashboard, open the raw configuration editor and paste `docs/okie-dashboard.yaml`. The view must be
`type: panel` so the card gets the whole view. All options are listed in the README. For a wall tablet read
[WALL-TABLET.md](WALL-TABLET.md).

## Publishing this folder to GitHub

```
cd okie-motor
git init -b main
git add .
git commit -m "Okie Motor 0.2.0"
gh repo create okie-motor --public --source . --push      # or create it on github.com and git remote add / git push
```

Tag a release (`git tag v0.2.0 && git push --tags`) and the workflow in `.github/workflows/release.yml` attaches the
bundle, the installer and the demo to it.

## Updating

Run `npm run build` after changing `src/`; commit `dist/`. A wall tablet keeps its page open for weeks, so the card
shows a quiet "newer version" line with a reload button when Home Assistant serves a newer build (Hemma installs only).

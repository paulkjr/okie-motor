# Contributing

```
npm test                 # 190+ node tests, no dependencies, about 1 second
npm run serve            # http://127.0.0.1:4651/harness/index.html   (?zen=1 lock page, ?lang=de German)
npm run build            # dist/okie-motor.js, dist/okie-install.py (python3, standard library only)
npm run demo             # dist/okie-demo.html, one self-contained file
```

In the harness page, paste `harness/smoke.js` into the browser console (or fetch and eval it) to run the end-to-end
checks against the mock Home Assistant. Run them on `harness/bundle.html?zen=1` too; that page loads the built bundle.

Rules that keep it honest:

- A rule that decides something belongs in a pure function with a node test (`src/okie-logic.js`, `okie-search.js`, `okie-feeds.js`, and the pure top halves of the other modules).
- Every user-facing string exists in English and German (`tests/i18n.test.js` fails otherwise).
- Every setting path has a default in `okie-card.js` and a row in `okie-settings.js`.
- Bump `package.json` and the first entry of `CHANGELOG` in `src/okie-system.js` together, then `npm run build` and commit `dist/`.
- Do not claim a feature the code does not have; list it under "not built" in the README instead.

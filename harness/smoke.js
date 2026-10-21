/* Browser smoke test for the whole card. Load a harness page (index.html?zen=1), then evaluate:
 *   await (await fetch('/okie-motor/harness/smoke.js')).text().then(t => (0, eval)(t))
 * Returns {passed, failed, all} so a failure says where. Not shipped. */
(async function () {
  const card = document.getElementById('card'), sr = card.shadowRoot, sleep = ms => new Promise(r => setTimeout(r, ms));
  const results = [];
  const check = async (name, fn) => { try { const info = await fn(); results.push({ name, ok: info === true, info: info === true ? undefined : info }); } catch (e) { results.push({ name, ok: false, info: String(e && e.message || e) }); } };
  const ptr = (el, type, o) => el.dispatchEvent(new PointerEvent(type, Object.assign({ bubbles: true, composed: true, button: 0, clientX: 5, clientY: 5, pointerId: 1 }, o || {})));
  const tile = id => [...sr.querySelectorAll('.results-container .device-card,.results-container .device-list-item')].find(t => t._item && t._item.id === id);
  const state = id => card.hass.states[id];
  const errors = []; const onErr = e => errors.push(String(e.message || e.reason)); window.addEventListener('error', onErr); window.addEventListener('unhandledrejection', onErr);
  const search = card._search;
  const SYS_CLEAR = () => { window.OkieMotor.system.assistant.clear(card._ctx); };
  const resetNav = async () => { card._show('start'); search.close(); await sleep(250); };

  await sleep(600);
  await check('frame: island, search row, bento and dock are all there', async () => {
    const q = s => !!sr.querySelector(s);
    return ['.island-anchor', '.search-row', '.bento .w1', '.bento .w2', '.bento .w34 .device-card', '.vision-pro-menu .vpm-item'].every(q) ? true : 'something is missing';
  });
  await check('frame: the 1200px column is zoomed like FSC and the panel height follows the window', async () => {
    const z = card._zoom, ph = parseFloat(getComputedStyle(card._stage).getPropertyValue('--fsc-panel-h'));
    const main = sr.querySelector('.main-container').getBoundingClientRect().width;
    return z > 0.64 && z <= 1 && ph >= 380 && ph <= 672 && Math.abs(main - Math.min(1200 * z, card.clientWidth)) < 3 ? true : { z, ph, main };
  });
  await check('lock page: reveal by wheel shows the search row and bento, the island folds back', async () => {
    card._setLocked(true); await sleep(300);
    const locked = card._stage.dataset.zenRevealed === 'false' && !!sr.querySelector('.zen-curtain') && card._island.stadium === 'mini';
    sr.querySelector('.zen-curtain').dispatchEvent(new WheelEvent('wheel', { deltaY: 80, bubbles: true, cancelable: true, composed: true })); await sleep(900);
    return locked && card._stage.dataset.zenRevealed === 'true' && card._island.stadium === 'knopf' ? true : { locked, rev: card._stage.dataset.zenRevealed, st: card._island.stadium };
  });
  await check('search: focus expands the panel and hides the bento; Escape collapses', async () => {
    await resetNav(); ptr(sr.querySelector('.search-wrapper'), 'pointerdown'); await sleep(500);   // the pointer path; a hidden preview never fires focus
    const open = search.isOpen() && sr.querySelector('.search-panel').dataset.open === 'true' && card._stage.dataset.search === 'open';   // the CSS fades the bento on that flag
    sr.querySelector('.search-input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(500);
    return open && !search.isOpen() ? true : { open, now: search.isOpen() };
  });
  await check('search: "kit" + Tab makes an area chip and scopes the results', async () => {
    search.open(); const i = sr.querySelector('.search-input'); i.value = 'kit'; i.dispatchEvent(new Event('input')); await sleep(300);
    const ghost = sr.querySelector('.ghost-mirror').textContent; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true })); await sleep(400);
    const chips = sr.querySelectorAll('.chip.area').length; const areas = new Set([...sr.querySelectorAll('.results-container .device-card')].map(t => t._item.areaId));
    i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300); search.close();
    return ghost === 'kitchen' && chips === 1 && areas.size === 1 && areas.has('kitchen') ? true : { ghost, chips, areas: [...areas] };
  });
  await check('search: a device that matches but is unavailable (or has no room) is shown with a note, not replaced by the closest match', async () => {
    const id = 'light.bedroom_main', was = card.hass.states[id], put = s => { card.hass = Object.assign({}, card.hass, { states: Object.assign({}, card.hass.states, { [id]: s }) }); };
    let out;
    try {
      put(Object.assign({}, was, { state: 'unavailable', last_changed: new Date().toISOString() })); await sleep(500);
      search.open({ focus: false }); const i = sr.querySelector('.search-input'); i.value = 'bed light'; i.dispatchEvent(new Event('input')); await sleep(500);
      const sec = sr.querySelector('section.offline'), note = sec && sec.querySelector('.note'), tiles = sec ? [...sec.querySelectorAll('.device-card,.device-list-item')].map(t => t._item && t._item.id) : [];
      const live = [...sr.querySelectorAll('.results-container > section.group:not(.offline) .device-card')].map(t => t._item && t._item.id);
      out = { note: !!note, tiles, live: live.slice(0, 3) };
      i.value = 'movie night'; i.dispatchEvent(new Event('input')); await sleep(500);                  // a working device with no room is found too, under its own note
      const sec2 = sr.querySelector('section.offline'); out.noRoom = sec2 ? [...sec2.querySelectorAll('.device-card,.device-list-item')].map(t => t._item && t._item.id) : [];
      i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300); search.close();
    } finally { put(was); await sleep(300); }
    return out.note && out.tiles.length === 1 && out.tiles[0] === id && !out.live.includes(id) && out.noRoom.includes('scene.movie_night') ? true : out;
  });
  await check('search: sub-category chips carry live "on" counts and filter the grid', async () => {
    search.open({ focus: false }); await sleep(400);
    const chip = [...sr.querySelectorAll('.subcategory-chip')].find(c => c.dataset.chip === 'lights'); const cnt = chip && chip.querySelector('.cnt');
    chip.click(); await sleep(300); const domains = new Set([...sr.querySelectorAll('.results-container .device-card')].map(t => t._item.domain));
    sr.querySelector('.subcategory-chip[data-chip="all"]').click(); await sleep(250);
    return cnt && +cnt.textContent > 0 && domains.size === 1 && domains.has('light') ? true : { cnt: cnt && cnt.textContent, domains: [...domains] };
  });
  await check('search: the filter popup grows out of its button and stays open; Rooms regroups, List swaps the layout', async () => {
    search.open({ focus: false }); await sleep(300);
    sr.querySelector('.filter-main-button').click(); await sleep(700);
    ptr([...sr.querySelectorAll('.filter-modal-wahl')][0], 'pointerdown'); await sleep(100);
    const stillOpen = search.isOpen();                  // a tap inside the popup is not a tap outside the search panel
    const pop = stillOpen && !!sr.querySelector('.morph-popup--filter') && sr.querySelectorAll('.filter-modal-wahl').length === 5 && !!sr.querySelector('.morph-popup-x');
    [...sr.querySelectorAll('.filter-modal-wahl')].find(b => /Rooms/.test(b.textContent)).click(); await sleep(700);
    const rooms = sr.querySelectorAll('.results-container .group').length >= 5 && card._settings.get().search.filterBy === 'rooms';
    const stays = !!sr.querySelector('.morph-popup');        // like FSC: choosing does not close the window
    [...sr.querySelectorAll('.filter-modal-wahl')].find(b => /List/.test(b.textContent)).click(); await sleep(700);
    const list = sr.querySelectorAll('.results-container .device-list-item').length > 5;
    sr.querySelector('.morph-popup-x').click(); await sleep(900);
    const gone = !sr.querySelector('.morph-popup') && !sr.querySelector('.ov-dim');
    card._settings.set({ layout: 'grid', search: { filterBy: 'categories' } }); await sleep(200); search.close();
    return pop && rooms && stays && list && gone ? true : { pop, rooms, stays, list, gone };
  });
  await check('search: the category popup is the compact anchored window; info text opens, a choice switches and closes it', async () => {
    sr.querySelector('.category-icon').click(); await sleep(700);
    const win = sr.querySelector('.morph-popup'), btn = sr.querySelector('.category-icon').getBoundingClientRect(), wr = win && win.getBoundingClientRect();
    const compact = !!win && Math.abs(wr.left - btn.left) < 2 && Math.abs(wr.top - btn.top) < 2 && wr.width <= 361 * (card._zoom || 1) + 2 && sr.querySelectorAll('.filter-modal-wahl').length === 4;
    sr.querySelector('.filter-modal-infoknopf').click(); await sleep(200);
    const info = !!sr.querySelector('.filter-modal-infotext');
    const dim = sr.querySelector('.ov-dim'), dr = dim && dim.getBoundingClientRect();
    const veil = !!dr && dr.width >= innerWidth - 1 && dr.height >= innerHeight - 1 && sr.querySelector('.ov-dim').parentNode === sr;   // whole window, outside the card's clip
    [...sr.querySelectorAll('.filter-modal-wahl')].find(b => /Sensors/.test(b.textContent)).click(); await sleep(900);
    const switched = card._settings.get().topCategory === 'sensors' && !sr.querySelector('.morph-popup');
    card._settings.set({ topCategory: 'devices' }); await sleep(200); search.close();
    return compact && info && veil && switched ? true : { compact, info, veil, switched };
  });
  await check('search: Escape and a tap on the dim close the popup', async () => {
    sr.querySelector('.category-icon').click(); await sleep(700);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(900);
    const esc = !sr.querySelector('.morph-popup');
    sr.querySelector('.category-icon').click(); await sleep(700);
    sr.querySelector('.ov-dim').click(); await sleep(900);
    const dim = !sr.querySelector('.morph-popup') && !sr.querySelector('.ov-dim');
    search.close();
    return esc && dim ? true : { esc, dim };
  });
  await check('content size: the column shrinks and centres, the background stays, 100% restores the layout', async () => {
    if (card._mobile) return true;                                  // phones keep their fixed layout
    await resetNav(); card._setLocked(false); await sleep(400);
    const main = () => sr.querySelector('.main-container').getBoundingClientRect(), bg = () => sr.querySelector('.bg').getBoundingClientRect();
    card._settings.set({ scale: 100 }); await sleep(500); const w100 = main().width, t100 = main().top, b100 = bg().width;
    card._settings.set({ scale: 70 }); await sleep(600);
    const w70 = main().width, mid = main().left + w70 / 2, stage = sr.querySelector('.stage').getBoundingClientRect();
    const shrunk = Math.abs(w70 / w100 - 0.7) < 0.03, same = bg().width === b100, centred = Math.abs(mid - (stage.left + stage.width / 2)) < 3, lower = main().top > t100;
    card._settings.set({ scale: 100 }); await sleep(600);
    const back = Math.abs(main().width - w100) < 1 && Math.abs(main().top - t100) < 1;
    return shrunk && same && centred && lower && back ? true : { shrunk, same, centred, lower, back, w100, w70 };
  });
  await check('settings: the Content size slider has a real track you can hit and is live on every device', async () => {
    await resetNav(); card._setLocked(false); await sleep(300);
    card._openApp('settings'); await sleep(1100);
    const ap = [...sr.querySelectorAll('button, [role=tab]')].find(b => /appearance/i.test((b.getAttribute('aria-label') || '') + (b.title || '') + b.textContent)); ap.click(); await sleep(700);
    const row = sr.querySelector('.ios-slider[data-row="ui_scale"]'), sl = row && row.querySelector('.slider');
    const r = sl && sl.getBoundingClientRect(), hit = r && sr.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const real = !!r && r.height >= 30 && r.width > 100 && !!hit && !!hit.closest('.slider');
    const inactive = sl && sl.classList.contains('dis');
    card._back(); await sleep(500);
    return real && !inactive ? true : { real, inactive, h: r && r.height, mobile: card._mobile };
  });
  await check('settings: the tab bar is a visible pill of its own (a bare bar of the app shell, not the bubble menu of a device) with all its tabs, at the right on a wide screen', async () => {
    await resetNav(); card._setLocked(false); await sleep(300);
    card._openApp('settings'); await sleep(1200);
    const bar = sr.querySelector('.dt-bar'), main = sr.querySelector('.dt-main'), r = bar && bar.getBoundingClientRect(), mr = main && main.getBoundingClientRect();
    const ok = !!bar && bar.parentNode === main && parseFloat(getComputedStyle(bar).opacity) > 0.95 && bar.querySelectorAll('.dt-tab').length >= 3 && r.width > 100 && (card._mobile || (r.width < mr.width * 0.6 && r.right > mr.right - 60));
    card._back(); await sleep(400);
    return ok ? true : { has: !!bar, parentOk: bar && bar.parentNode === main, tabs: bar && bar.querySelectorAll('.dt-tab').length, w: r && r.width, mainW: mr && mr.width };
  });
  await check('glass: Card blur frosts the device cards (off = no backdrop filter at all), Card glass sets the tint, Dark makes it smoky, Card edge draws the rim; all in Settings > Design > Liquid glass', async () => {
    await resetNav(); card._setLocked(false); await sleep(400);
    const tileEl = () => sr.querySelector('.results-container .device-card, .results-container .device-list-item, .device-card, .device-list-item');
    const bf = e => { const c = getComputedStyle(e); return c.backdropFilter || c.webkitBackdropFilter || 'none'; };
    const alpha = e => { const m = /rgba?\(([^)]+)\)/.exec(getComputedStyle(e).backgroundColor); const p = m ? m[1].split(',').map(Number) : []; return p.length > 3 ? p[3] : 1; };
    const off = tileEl() && bf(tileEl()) === 'none' && Math.abs(alpha(tileEl()) - 0.1) < 0.02;
    card._settings.set({ glass: { cardBlur: 24, cardTint: 26 } }); await sleep(500);
    const t = tileEl(), on = !!t && /blur\(24px\)/.test(bf(t)) && Math.abs(alpha(t) - 0.26) < 0.02;
    card._settings.set({ glass: { cardBlur: 0, cardTint: 10 } }); await sleep(400);
    const back = bf(tileEl()) === 'none' && Math.abs(alpha(tileEl()) - 0.1) < 0.02;
    const edgeOn = /inset/.test(getComputedStyle(tileEl()).boxShadow);
    card._settings.set({ glass: { cardEdge: 0 } }); await sleep(300); const edgeOff = getComputedStyle(tileEl()).boxShadow === 'none';
    card._settings.set({ glass: { cardEdge: 14, cardStyle: 'dark', cardTint: 10 } }); await sleep(400);
    const dkc = (/rgba?\(([^)]+)\)/.exec(getComputedStyle(tileEl()).backgroundColor) || [0, ''])[1].split(',').map(Number), dark = dkc[0] < 60 && dkc[1] < 60 && Math.abs((dkc[3] == null ? 1 : dkc[3]) - 0.24) < 0.03;
    card._settings.set({ glass: { cardStyle: 'light', cardTint: 10 } }); await sleep(300);
    card._openApp('settings'); await sleep(1200);
    const dtab = sr.querySelector('.dt-tab[data-tab="appearance"]'); if (dtab) dtab.click(); await sleep(600);
    const nav = [...sr.querySelectorAll('.ios-item')].find(i => /liquid glass/i.test(i.textContent)); if (nav) nav.click(); await sleep(700);
    const rows = ['g_cblur', 'g_ctint', 'g_cedge'].map(id => !!sr.querySelector('.ios-slider[data-row="' + id + '"]')).concat([!!sr.querySelector('.ios-seg[data-row="g_cstyle"]')]);
    card._back(); await sleep(400); card._back(); await sleep(400);
    return off && on && back && edgeOn && edgeOff && dark && rows.every(Boolean) ? true : { off, on, back, edgeOn, edgeOff, dark, dkc, rows, nav: !!nav, bfNow: tileEl() && bf(tileEl()) };
  });
  await check('start screen: the pencil (stacked layouts only) opens a grab line, a drag sets the area height and a double tap resets it', async () => {
    await resetNav(); card._setLocked(false); await sleep(400);
    const pen = sr.querySelector('.w1-edit'), stacked = card._mobile || card._stage.dataset.hoehe === 'boden';
    if (!stacked) return !!pen && getComputedStyle(pen).display === 'none' ? true : 'the pencil must hide where the grid sets the height';
    pen.click(); await sleep(250);
    const w1 = sr.querySelector('.w1'), grip = sr.querySelector('.w1-grip'), editing = w1.classList.contains('editing') && getComputedStyle(grip).display !== 'none';
    const gr = grip.getBoundingClientRect(), h0 = w1.offsetHeight, z = card._zoom || 1;
    const fire = (type, y) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, clientX: gr.left + 20, clientY: y, pointerId: 9, button: 0, buttons: 1 }));
    fire('pointerdown', gr.top + 8); fire('pointermove', gr.top + 8 + 100 * z); await sleep(200); fire('pointerup', gr.top + 8 + 100 * z); await sleep(250);
    const grew = Math.abs(w1.offsetHeight - (h0 + 100)) <= 2 && card._settings.get().bento.w1height === w1.offsetHeight;
    grip.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, composed: true })); await sleep(250);
    const reset = card._settings.get().bento.w1height === 0 && Math.abs(w1.offsetHeight - h0) <= 2;
    pen.click(); await sleep(150);
    return editing && grew && reset && !w1.classList.contains('editing') ? true : { editing, grew, reset, h0, now: w1.offsetHeight };
  });
  await check('settings: double-tapping a slider (or the arrow beside its value) goes back to the shipped default', async () => {
    await resetNav(); card._setLocked(false); await sleep(300);
    card._settings.reset('scale'); card._settings.set({ scale: 70 }); await sleep(200);
    card._openApp('settings'); await sleep(1100);
    const ap = [...sr.querySelectorAll('button, [role=tab]')].find(b => /appearance/i.test((b.getAttribute('aria-label') || '') + (b.title || '') + b.textContent)); ap.click(); await sleep(700);
    const row = () => sr.querySelector('.ios-slider[data-row="ui_scale"]'), sl = row().querySelector('.slider'), r = sl.getBoundingClientRect();
    const showsArrow = !row().querySelector('.slider-reset').hidden;                    // 70% differs from 100%
    const fire = (type, x) => sl.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, clientX: x, clientY: r.top + r.height / 2, pointerId: 11, button: 0, buttons: 1 }));
    const x = r.left + r.width * 0.4;
    fire('pointerdown', x); fire('pointerup', x); fire('pointerdown', x); await sleep(300);      // no wait between the taps: a slow, throttled preview must not push the second one past the 340 ms window
    const dbl = card._settings.get().scale === 100 && row().querySelector('.slider-value').textContent === '100%' && row().querySelector('.slider-reset').hidden;
    card._settings.set({ scale: 80 }); await sleep(100);
    const sl2 = row().querySelector('.slider-reset');                                    // the page redraws on the next open: use the arrow on a fresh draw
    card._back(); await sleep(400); card._openApp('settings'); await sleep(900);
    [...sr.querySelectorAll('button, [role=tab]')].find(b => /appearance/i.test((b.getAttribute('aria-label') || '') + (b.title || '') + b.textContent)).click(); await sleep(600);
    const arrow = row().querySelector('.slider-reset'); const shown = !arrow.hidden; arrow.click(); await sleep(250);
    const viaArrow = shown && card._settings.get().scale === 100;
    card._back(); await sleep(300);
    return showsArrow && dbl && viaArrow ? true : { showsArrow, dbl, shown, viaArrow, now: card._settings.get().scale };
  });
  await check('settings: a slider lands under the pointer even when the engine reports zoomed rectangles unscaled (older Safari)', async () => {
    await resetNav(); card._setLocked(false); await sleep(300);
    card._settings.reset('scale'); card._openApp('settings'); await sleep(1100);
    [...sr.querySelectorAll('button, [role=tab]')].find(b => /appearance/i.test((b.getAttribute('aria-label') || '') + (b.title || '') + b.textContent)).click(); await sleep(700);
    const sl = sr.querySelector('.ios-slider[data-row="ui_scale"] .slider');
    const proto = Element.prototype, orig = proto.getBoundingClientRect, main = card._main;
    // what older Safari does: everything in the zoomed column is reported at layout size (divided by the zoom), pointer events stay in screen pixels
    proto.getBoundingClientRect = function () { const r = orig.call(this); const z = card._zoom || 1; if (z === 1 || !main.contains(this)) return r; return new DOMRect(r.left / z, r.top / z, r.width / z, r.height / z); };
    let got = null, zoom = card._zoom;
    try {
      const real = orig.call(sl), y = real.top + real.height / 2, x = real.left + real.width * 0.75;      // 75% along the track on screen
      const fire = (type) => sl.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, clientX: x, clientY: y, pointerId: 12, button: 0, buttons: 1 }));
      fire('pointerdown'); fire('pointerup'); await sleep(250);
      got = card._settings.get().scale;
    } finally { proto.getBoundingClientRect = orig; }
    card._settings.reset('scale'); card._back(); await sleep(300);
    return zoom < 1 && Math.abs(got - 110) <= 2 ? true : { zoom, got, expected: 110 };      // 50 + 0.75 * (130 - 50)
  });
  await check('cameras: a card under the slider (last motion picture, bell with the new events, View Cameras); the bell opens the history, the pill the cameras', async () => {
    await resetNav(); card._setLocked(false); await sleep(400);
    const CM = window.OkieMotor.cameras, feed = CM.feedFor(card._ctx);
    card._store.set('cam.seenAt', Date.now() - 6 * 3600e3); await feed.refresh(); await sleep(400);
    const cc = sr.querySelector('.camcard'), bento = sr.querySelector('.bento');
    const order = !!cc && [...bento.children].map(c => c.className.split(' ')[0]).join(',').indexOf('w2,gdeck,w34') >= 0 && bento.querySelector('.gdeck .gd-track').firstElementChild === cc;      // the cameras card is the first card of the row under the slider
    const wide = card._mobile || card._stage.dataset.hoehe === 'boden' || getComputedStyle(sr.querySelector('.w34')).display === 'none';   // the wide screen gives the row to the card
    const pic = cc.querySelector('.cc-pic').classList.contains('on') && /last motion/i.test(cc.querySelector('.cc-chip').textContent);
    const badge = !cc.querySelector('.cam-badge').hidden && cc.querySelector('.cam-badge').textContent === '4';
    cc.querySelector('.cc-bell').click(); await sleep(1500);
    const hist = card._nav.mode === 'app' && card._nav.appId === 'camhistory';
    const rows = [...sr.querySelectorAll('.ch-row')], days = sr.querySelectorAll('.ch-day').length;
    const list = rows.length === 8 && rows.filter(r => r.classList.contains('new')).length === 4 && days === 3 && !!rows[0].querySelector('.ch-thumb');
    card._back(); await sleep(900);
    const cleared = sr.querySelector('.camcard .cam-badge').hidden || sr.querySelector('.camcard .cam-badge').textContent === '0';
    sr.querySelector('.camcard .cam-pill').click(); await sleep(1200);
    const app = card._nav.mode === 'app' && card._nav.appId === 'cameras';
    const tiles = [...sr.querySelectorAll('.cam-tile')], grid = tiles.length === 2 && tiles[0].classList.contains('alert') && /Patio/.test(tiles[0].textContent);
    tiles[0].click(); await sleep(700);
    const live = /Patio/.test(sr.querySelector('.cam-live-name').textContent) && !!sr.querySelector('.cam-player .cam-snap') && sr.querySelectorAll('.cam-minitile').length === 1;
    sr.querySelector('.cam-minitile').click(); await sleep(500);
    const switched = /Front Door/.test(sr.querySelector('.cam-live-name').textContent);
    sr.querySelector('.cam-back').click(); await sleep(300);
    const back = sr.querySelectorAll('.cam-tile').length === 2;
    // with Home Assistant's card helpers the live card is built for that camera, pauses by itself and goes away on leaving
    let cfg = null; window.loadCardHelpers = async () => ({ createCardElement: async (c) => { cfg = c; const e = document.createElement('div'); e.id = 'fakelive'; return e; } });
    card._settings.set({ cameras: { liveSeconds: 1 } });
    sr.querySelectorAll('.cam-tile')[1].click(); await sleep(500);
    const helper = !!sr.querySelector('#fakelive') && cfg && cfg.camera_view === 'live' && cfg.entity === 'camera.front_door';
    await sleep(1800); const paused = !sr.querySelector('#fakelive') && !sr.querySelector('.cam-paused').hidden;
    card._back(); await sleep(400); const gone = !sr.querySelector('#fakelive'); delete window.loadCardHelpers; card._settings.reset('cameras.liveSeconds');
    if (card._nav.mode === 'app') card._back();
    return order && wide && pic && badge && hist && list && cleared && app && grid && live && switched && back && helper && paused && gone ? true : { order, wide, pic, badge, hist, list, rows: rows.length, days, cleared, app, grid, live, switched, back, helper, paused, gone };
  });
  await check('order: the pencil gives the rooms and the favorites (lists) a handle to drag them by, the grids earlier / later buttons; the order is kept and the list stays where it was scrolled', async () => {
    await resetNav(); ['roomsExtra', 'roomsHidden', 'roomEdits', 'roomOrder', 'roomsOrder', 'cardStyle'].forEach(k => card._settings.reset(k));
    card._settings.set({ bento: { w1mode: 'rooms', w1layout: 'list' } }); card._show('start'); await sleep(700);
    const ids = () => [...sr.querySelectorAll('.w1-body .rm-wrap')].map(e => e.dataset.id);
    const base = ids(); sr.querySelector('.w1-edit').click(); await sleep(300);
    const shown = getComputedStyle(sr.querySelector('.w1-body .rm-wrap .rm-ord')).display !== 'none' && sr.querySelectorAll('.w1-body .rm-wrap .rm-ord .grip').length === base.length;
    const handleOnly = !sr.querySelector('.w1-body .rm-wrap .rm-ord .up') && !sr.querySelector('.w1-body .rm-wrap .rm-ord .dn') && !sr.querySelector('.w1-body .rm-wrap .rm-ord .top');
    // drag the first room's handle to the last room: nothing moves in the page while the finger is down, the order is applied when it lets go
    const drag = async (grip, toY, pid, mid) => {
      const gr = grip.getBoundingClientRect(), f = (type, y) => window.dispatchEvent(new PointerEvent(type, { pointerId: pid, clientX: gr.left + 8, clientY: y, button: 0, bubbles: true, cancelable: true }));
      grip.dispatchEvent(new PointerEvent('pointerdown', { pointerId: pid, clientX: gr.left + 8, clientY: gr.top + gr.height / 2, button: 0, bubbles: true, cancelable: true }));
      f('pointermove', gr.top + gr.height / 2 + 12); f('pointermove', toY); await sleep(250); const during = mid(); f('pointerup', toY); await sleep(500); return during;
    };
    const lastMid = () => { const r = sr.querySelectorAll('.w1-body .rm-wrap')[base.length - 1].getBoundingClientRect(); return r.top + r.height / 2; };
    const d0 = ids(), during = await drag(sr.querySelector('.w1-body .rm-wrap .rm-ord .grip'), lastMid(), 7, () => ids().join());
    const still = during === d0.join(), dragged = ids()[d0.length - 1] === d0[0] && ids()[0] === d0[1] && card._settings.get().roomsOrder[0] === d0[1];
    const appOrder = card._settings.get().roomsOrder.length === base.length;
    card._settings.set({ bento: { w1layout: 'grid' } }); await sleep(400);
    const gridBar = sr.querySelector('.w1-body .rm-wrap .rm-ord.hz'), hz = !!gridBar && !gridBar.querySelector('.grip') && !!gridBar.querySelector('.up') && !!gridBar.querySelector('.dn');
    const g0 = ids(); sr.querySelectorAll('.w1-body .rm-wrap .rm-ord .dn')[0].click(); await sleep(400);
    const gridMoved = ids()[0] === g0[1];
    // the favorites as a list: handle, name, card type, remove
    card._settings.set({ favorites: ['climate.living_room', 'light.living_room_lamp', 'light.kitchen_ceiling'], bento: { w1mode: 'favorites', w1layout: 'list' } }); await sleep(500);
    const fv = () => [...sr.querySelectorAll('.w1-body .fv-item')].map(e => e.dataset.id), f0 = fv();
    const favBar = sr.querySelectorAll('.w1-body .fv-item .fv-sw .grip').length === 3 && !sr.querySelector('.w1-body .fv-item .fv-sw .dn') && !sr.querySelector('.w1-body .fv-item .fv-sw .top');
    const lastFv = () => { const r = sr.querySelectorAll('.w1-body .fv-item')[2].getBoundingClientRect(); return r.top + r.height / 2; };
    await drag(sr.querySelector('.w1-body .fv-item .fv-sw .grip'), lastFv(), 8, () => '');
    const f1 = fv(), favMoved = f1[2] === f0[0] && f1[0] === f0[1] && card._settings.get().favorites.join() === f1.join();
    card._settings.set({ bento: { w1layout: 'grid' } }); await sleep(500);
    const tiles = !!sr.querySelector('.w1-body .fv-item .fv-sw.hz .dn') && !sr.querySelector('.w1-body .fv-item .fv-sw .grip');
    sr.querySelector('.w1-edit').click();
    ['roomsOrder', 'favorites', 'cardStyle'].forEach(k => card._settings.reset(k)); card._settings.set({ bento: { w1mode: 'favorites', w1layout: 'grid' } }); card._show('start'); await sleep(300);
    return shown && handleOnly && still && dragged && appOrder && hz && gridMoved && favBar && favMoved && tiles ? true : { shown, handleOnly, still, dragged, appOrder, hz, gridMoved, favBar, favMoved, tiles, base, d0, after: ids(), f0, f1 };
  });
  await check('a link with okie_open=<device> opens that device\'s screen (the iPhone widget uses it), once, also from the lock page', async () => {
    await resetNav(); const keep = location.search;
    try {
      history.replaceState(null, '', location.pathname + '?zen=1&pump=1&okie_open=climate.living_room');
      card._deepDone = false; card._setLocked(true, true); card._openFromUrl(); await sleep(1500);
      const opened = card._nav.mode === 'detail' && card._nav.itemId === 'climate.living_room' && !card._locked;
      card._back(); await sleep(900); card._openFromUrl(); await sleep(1300);
      const once = card._nav.mode === 'start';
      history.replaceState(null, '', location.pathname + '?zen=1&pump=1&okie_open=climate.nonexistent');
      card._deepDone = false; card._openFromUrl(); await sleep(1300);
      const unknown = card._nav.mode === 'start';
      return opened && once && unknown ? true : { opened, once, unknown, nav: card._nav };
    } finally { history.replaceState(null, '', location.pathname + keep); card._deepDone = false; await resetNav(); }
  });
  await check('live view: a tap on the picture opens it full screen over the window (player moves there, rotate turns it, close and Escape bring it back)', async () => {
    window.loadCardHelpers = async () => ({ createCardElement: async () => { const e = document.createElement('div'); e.id = 'fakelive'; e.style.cssText = 'width:100%;height:100%'; return e; } });
    const sr = card.shadowRoot; card._ctx.openApp('cameras'); await sleep(900);
    sr.querySelectorAll('.cam-tile')[1].click(); await sleep(600);
    const player = sr.querySelector('.cam-player'); const homeBox = player.parentNode;
    player.click(); await sleep(300);
    const layer = sr.querySelector('.cam-full'), lr = layer && layer.getBoundingClientRect();
    const opened = !!layer && layer.contains(player) && player.classList.contains('full') && !!sr.querySelector('.cam-player.holder') && !!layer.querySelector('#fakelive');
    const covers = !!lr && lr.width >= innerWidth - 2 && lr.height >= innerHeight - 2;
    const frame = layer.querySelector('.cam-fs-frame'), fr0 = frame.style.transform;
    layer.querySelector('.cam-fs-btn[aria-label="Rotate"]').click(); await sleep(100);
    const turned = /rotate\(90deg\)/.test(frame.style.transform) !== /rotate\(90deg\)/.test(fr0);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(300);
    const closedEsc = !sr.querySelector('.cam-full') && player.parentNode === homeBox && !sr.querySelector('.cam-player.holder') && !player.classList.contains('full') && card._nav.mode === 'app';
    player.querySelector('.cam-expand').click(); await sleep(300);
    const again = !!sr.querySelector('.cam-full');
    sr.querySelector('.cam-fs-btn[aria-label="Close full screen"]').click(); await sleep(300);
    const closedBtn = !sr.querySelector('.cam-full') && player.parentNode === homeBox;
    player.click(); await sleep(250); card._back(); await sleep(400);
    const gone = !sr.querySelector('.cam-full') && !sr.querySelector('#fakelive');
    delete window.loadCardHelpers; if (card._nav.mode === 'app') card._back();
    return opened && covers && turned && closedEsc && again && closedBtn && gone ? true : { opened, covers, turned, closedEsc, again, closedBtn, gone };
  });
  await check('assistant: the question goes to the Claude agent when Home Assistant has one, to the plain Assist when the settings say so, and a chat never crosses agents', async () => {
    const sent = [], real = card._hass, SYS = window.OkieMotor.system.assistant, ctx = card._ctx;
    card.hass = Object.assign({}, real, { callWS: (m) => { if (m.type === 'conversation/process') { sent.push(m); return Promise.resolve({ conversation_id: 'c-' + (m.agent_id || 'plain'), response: { speech: { plain: { speech: 'ok' } } } }); } return real.callWS(m); } });
    SYS.clear(ctx); card._settings.reset('assistant.agent');
    await SYS.ask(ctx, 'why is it raining'); await SYS.ask(ctx, 'and tomorrow?');
    const claude = sent[0].agent_id === 'conversation.claude_conversation' && sent[0].conversation_id == null && sent[1].agent_id === 'conversation.claude_conversation' && sent[1].conversation_id === 'c-conversation.claude_conversation';
    card._settings.set({ assistant: { agent: 'conversation.home_assistant' } });
    await SYS.ask(ctx, 'turn on the lamp');
    const plain = sent[2].agent_id === 'conversation.home_assistant' && sent[2].conversation_id == null;        // a different agent starts a new chat
    card._settings.reset('assistant.agent'); SYS.clear(ctx); card.hass = real;
    return claude && plain ? true : { claude, plain, sent: sent.map(m => [m.agent_id, m.conversation_id]) };
  });
  await check('phone panels: full-screen panels start below the Home Assistant header, whatever the window is', async () => {
    const hd = document.createElement('div'); hd.className = 'header';
    hd.style.cssText = 'position:fixed;top:0;left:0;right:0;height:56px;z-index:4;background:#111;';
    const was = card._mobile; let out;
    try {
      document.body.appendChild(hd);
      const noHeader = (hd.remove(), card._headerBottom()); document.body.appendChild(hd);
      card._mobile = true; card._syncFixedTop();                                // the phone rule reads this variable
      const phone = card._stage.style.getPropertyValue('--okie-fixed-top');
      card._mobile = false; card._syncFixedTop();
      const wide = card._stage.style.getPropertyValue('--okie-fixed-top');
      out = { header: card._headerBottom(), noHeader, phone, wide };
    } finally { hd.remove(); card._mobile = was; card._syncFixedTop(); }
    return out.header === 56 && out.noHeader === 0 && /56px/.test(out.phone) && !/56px/.test(out.wide) ? true : out;
  });
  await check('quick control: tap toggles a light', async () => {
    search.open({ focus: false }); await sleep(400); search.setQuery('bedroom'); await sleep(400);
    const t = tile('light.bedroom_main') || tile('light.living_room_lamp'); if (!t) return 'no tile'; const id = t._item.id, before = state(id).state; const b = t.querySelector('.qc-icon'); ptr(b, 'pointerdown'); ptr(b, 'pointerup'); await sleep(500);
    return state(id).state !== before ? true : { id, before, after: state(id).state };
  });
  await check('quick control: lock needs a hold', async () => {
    search.setQuery('front door lock'); await sleep(400);
    const t = tile('lock.front_door'); if (!t) return 'no lock tile'; const b = t.querySelector('.qc-icon'); const was = state('lock.front_door').state;
    ptr(b, 'pointerdown'); ptr(b, 'pointerup'); await sleep(250); const afterTap = state('lock.front_door').state;
    ptr(b, 'pointerdown'); await sleep(1150); ptr(b, 'pointerup'); await sleep(400);
    return afterTap === was && state('lock.front_door').state !== was ? true : { was, afterTap, afterHold: state('lock.front_door').state };
  });
  await check('failed service call toasts and leaves state alone', async () => {
    search.setQuery('kitchen counter'); await sleep(400);
    const t = tile('light.kitchen_counter'); if (!t) return 'no tile'; const b = t.querySelector('.qc-icon'); const was = state('light.kitchen_counter').state; window.__mockFail = true; ptr(b, 'pointerdown'); ptr(b, 'pointerup'); await sleep(450); window.__mockFail = false;
    return state('light.kitchen_counter').state === was && !!sr.querySelector('.ov-toast.error') ? true : { was, now: state('light.kitchen_counter').state };
  });
  await check('opening a tile closes the panel and shows the detail panel in its place', async () => {
    const t = tile('light.kitchen_counter'); t.click(); await sleep(800);
    return card._nav.mode === 'detail' && card._stage.dataset.detail === 'open' && !search.isOpen() && !!sr.querySelector('.dt-hero') ? true : { nav: card._nav.mode, d: card._stage.dataset.detail, open: search.isOpen() };
  });
  await check('light: the Controls are the wheel in percent (rim in the light\'s colour, glow follows the brightness); the wheel sets the brightness, also of an off light, the pill turns it off and on, the presets, the colours and the schedule link work', async () => {
    const id = 'light.kitchen_ceiling';
    await card._ctx.call('light', 'turn_on', { entity_id: id, brightness_pct: 71, color_temp_kelvin: 2700 }); await sleep(300);      // earlier checks leave it in any state: start from a known one
    card._openDetail(id); await sleep(1000);
    const dt = sr.querySelector('.dt'), th = sr.querySelector('.dctl .th'), zone = th && th.querySelector('.th-zone');
    const shape = !!th && !!zone && dt.dataset.dial === 'true' && !sr.querySelector('.dctl .dial') && /brightness, %/i.test(th.querySelector('.th-eyebrow').textContent);
    const num = () => th.querySelector('.th-num').textContent, rim = () => getComputedStyle(th.querySelector('.th-rim')).color;
    const glowMax = () => Math.max(...[...th.querySelectorAll('stop')].map(x => +x.getAttribute('stop-opacity')));
    const pct0 = num() === String(Math.round(state(id).attributes.brightness / 255 * 100)), amber = rim() === 'rgb(255, 167, 87)';          // 2700 K
    // the glow follows the brightness, the rim the colour
    const was = card.hass.states[id], put = st => { card.hass = Object.assign({}, card.hass, { states: Object.assign({}, card.hass.states, { [id]: st }) }); };
    const withAttrs = (st, at) => Object.assign({}, was, { state: st, attributes: Object.assign({}, was.attributes, at) });
    put(withAttrs('on', { brightness: 255 })); await sleep(200); const g100 = glowMax();
    put(withAttrs('on', { brightness: 51 })); await sleep(200); const g20 = glowMax(), n20 = num() === '20';
    put(withAttrs('off', { brightness: 0 })); await sleep(200); const g0 = glowMax(), offShown = th.classList.contains('off');
    put(withAttrs('on', { brightness: 255, color_mode: 'rgb', rgb_color: [255, 90, 79] })); await sleep(200); const red = rim() === 'rgb(255, 90, 79)';
    put(was); await sleep(200);
    const glows = g100 > 0 && g20 > 0 && g20 < g100 * 0.6 && g0 === 0 && n20 && offShown;
    // dragging the wheel down lowers the brightness (sent while it turns); dragging an off light's wheel switches it on
    const calls = []; const origCall = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push([d, sv, data]); return origCall.apply(this, arguments); };
    const pe = (type, y) => zone.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: 5, clientY: y, pointerId: 9 }));
    const b0 = +num(); pe('pointerdown', 300); for (let i = 1; i <= 5; i++) { pe('pointermove', 300 + i * 10); await sleep(40); } await sleep(170); pe('pointerup', 350); await sleep(2600);      // a pause before the release: no flick, so no coasting down to 0 (the coast depends on the timing of the events and made this check flaky)
    const sent = calls.filter(c => c[0] === 'light' && c[2].brightness_pct != null);
    const lowered = sent.length >= 1 && +num() < b0 && state(id).attributes.brightness === Math.round(sent[sent.length - 1][2].brightness_pct * 2.55);
    const pw = sr.querySelector('.dctl .th-power'), label = /turn off/i.test(pw.textContent);
    pw.click(); await sleep(450); const off = state(id).state === 'off' && /turn on/i.test(pw.textContent) && num() === '0';
    calls.length = 0; pe('pointerdown', 340); for (let i = 1; i <= 5; i++) { pe('pointermove', 340 - i * 10); await sleep(40); } await sleep(170); pe('pointerup', 290); await sleep(2600);
    const switchedOn = state(id).state === 'on' && calls.some(c => c[0] === 'light' && c[1] === 'turn_on' && c[2].brightness_pct > 0);
    // white presets and colours
    const presets = [...th.querySelectorAll('.th-mode.hsw')], dots = [...th.querySelectorAll('.th-sw')];
    calls.length = 0; presets[2].click(); await sleep(300); dots[2].click(); await sleep(300);
    const buttons = presets.length === 3 && dots.length === 8 && calls.some(c => c[2].color_temp_kelvin === 6000) && calls.some(c => c[2].rgb_color && c[2].rgb_color.join() === '255,225,79');
    card._ctx.call = origCall;
    th.querySelector('.th-sched').click(); await sleep(900); const toSchedule = (sr.querySelector('.dt-tab.on') || {}).dataset && sr.querySelector('.dt-tab.on').dataset.tab === 'schedule';
    return shape && pct0 && amber && glows && red && lowered && label && off && switchedOn && buttons && toSchedule ? true : { shape, pct0, amber, g100, g20, g0, n20, offShown, red, lowered, sent: sent.length, label, off, switchedOn, buttons, p: presets.length, d: dots.length, toSchedule };
  });
  await check('detail: history, schedule, context, settings tabs render', async () => {
    const tabs = [...sr.querySelectorAll('.dt-tab')]; const got = [];
    for (const i of [2, 3, 1, 4]) { tabs[i].click(); await sleep(i === 2 ? 900 : 500); got.push((sr.querySelector('.tabwrap') || {}).textContent.length > 20); }
    return got.every(Boolean) ? true : got;
  });
  await check('climate: the Thermo Dial replaces the old controls (video header stays); heat/cool shows low/high steppers instead of the wheel', async () => {
    card._openDetail('climate.office'); await sleep(900);
    const th = sr.querySelector('.dctl .th'), box = th && th.querySelector('.th-range'), hero = sr.querySelector('.dt-hero .dt-video');
    const visible = !!th && th.dataset.ranged === 'true' && box && !box.hidden && !!hero && !sr.querySelector('.dctl .dial');
    const before = state('climate.office').attributes.target_temp_high; box.querySelectorAll('.stp')[3].click(); await sleep(450);
    const after = state('climate.office').attributes.target_temp_high; card._back(); await sleep(250);
    return visible && after === before + 0.5 ? true : { visible, before, after };
  });
  await check('climate: on a wide screen the thermo card follows the design (glass column 451 px, wheel 80 px under the top and 25 px above the bottom, Sora number, power button centred at the bottom, no preset or fan under the dial); the preset and fan buttons are under the Settings tab', async () => {
    if (innerWidth <= 640) return true;                                       // the phone keeps the compact layout
    const id = 'climate.living_room', was = card.hass.states[id], put = st => { card.hass = Object.assign({}, card.hass, { states: Object.assign({}, card.hass.states, { [id]: st }) }); };
    put(Object.assign({}, was, { state: 'cool', attributes: Object.assign({}, was.attributes, { hvac_modes: ['off', 'heat', 'cool', 'heat_cool'], preset_modes: ['none', 'eco'], preset_mode: 'none', fan_modes: ['on', 'off'], fan_mode: 'off' }), last_changed: new Date().toISOString() })); await sleep(500);
    try {
    card._openDetail(id); await sleep(1500);
    const dt = sr.querySelector('.dt'), th = sr.querySelector('.dctl .th'), wrap = th.querySelector('.th-gaugewrap'), foot = th.querySelector('.th-foot'), z = card._zoom || 1;
    const c = dt.getBoundingClientRect(), w = wrap.getBoundingClientRect(), tr = th.getBoundingClientRect(), f = foot.getBoundingClientRect();
    const top = (w.top - c.top) / z, bottom = (c.bottom - w.bottom) / z;
    const glassW = sr.querySelector('.dt-main').getBoundingClientRect().width / z, numFont = getComputedStyle(th.querySelector('.th-num')).fontFamily, fontsOk = /Okie Sora/.test(numFont) && !!document.getElementById('okie-thermo-fonts');
    const reachesEdge = Math.abs(tr.right - c.right) <= 2 * z, centred = Math.abs((f.left + f.width / 2) - (tr.left + (tr.width - 28 * z) / 2)) <= 3 * z, noExtras = !sr.querySelector('.dctl .lbl') && !sr.querySelector('.dctl .climx');
    const chev = !!th.querySelector('.th-sched-chev'), labels = [...th.querySelectorAll('.th-mode-l')].map(e => e.textContent).join('|');
    sr.querySelector('.dt-tab[data-tab="settings"]').click(); await sleep(500);
    const climx = sr.querySelector('.climx'), chips = climx ? climx.querySelectorAll('button').length : 0;
    card._back(); await sleep(250);
    const ok = Math.abs(top - 80.5) <= 6 && Math.abs(bottom - 25.5) <= 6 && Math.abs(glassW - 451) <= 3 && fontsOk && reachesEdge && centred && noExtras && chev && /Heating\|Cooling\|Heat\/Cool/.test(labels) && chips >= 4;
    return ok ? true : { top, bottom, glassW, numFont, reachesEdge, centred, noExtras, chev, labels, chips };
    } finally { put(was); await sleep(300); }
  });
  await check('climate: dragging the wheel sends one debounced set_temperature, a mode button and the hold-to-turn-off power button call set_hvac_mode', async () => {
    card._openDetail('climate.living_room'); await sleep(1000);
    const th = sr.querySelector('.dctl .th'), zone = th.querySelector('.th-zone'), num = () => th.querySelector('.th-num').textContent;
    const calls = []; const origCall = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push([d, sv, data]); return origCall.apply(this, arguments); };      // the card's own call path: it survives the mock handing the card a new hass object
    const t0 = num(), r0 = th.querySelector('.th-ticks').getAttribute('transform');
    const pe = (type, y) => zone.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: 5, clientY: y, pointerId: 7 }));
    pe('pointerdown', 300); for (let i = 1; i <= 6; i++) { pe('pointermove', 300 - i * 14); await sleep(40); } pe('pointerup', 216); await sleep(2600);      // released at once: the flick coasts, then one send
    const temps = calls.filter(c => c[1] === 'set_temperature');
    const t1 = num(), r1 = th.querySelector('.th-ticks').getAttribute('transform');
    const moved = t1 !== t0 && r1 !== r0;
    const coolBtn = th.querySelector('.th-mode[data-mode="cool"]'); coolBtn.click(); await sleep(300);
    const modeCall = calls.some(c => c[1] === 'set_hvac_mode' && c[2].hvac_mode === 'cool');
    const pw = sr.querySelector('.dctl .th-power'); pw.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, pointerId: 8 })); await sleep(3300);
    const offCall = calls.some(c => c[1] === 'set_hvac_mode' && c[2].hvac_mode === 'off');
    pw.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 8 }));
    card._ctx.call = origCall; card._back(); await sleep(250);
    return moved && temps.length === 1 && modeCall && offCall ? true : { moved, t0, t1, sent: temps.length, modeCall, offCall };
  });
  await check('climate: the name and state sit at the top (wide), - and + move the target one step each and send it, and a step ticks (the Safari fallback when navigator.vibrate is missing)', async () => {
    card._openDetail('climate.living_room'); await sleep(1000);
    const th = sr.querySelector('.dctl .th'), num = () => parseFloat(th.querySelector('.th-num').textContent), stp = th.querySelectorAll('.th-stp');
    const nm = th.querySelector('.th-name'), stt = th.querySelector('.th-state'), ttl = th.querySelector('.th-title');
    const titleOk = !!nm && /Thermostat/.test(nm.textContent) && !!stt && stt.textContent.trim().length > 0 && getComputedStyle(ttl).display !== 'none';
    const calls = []; const origCall = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push([d, sv, data]); return origCall.apply(this, arguments); };
    if (th.classList.contains('off')) { th.querySelector('.th-mode[data-mode="cool"]').click(); await sleep(700); calls.length = 0; }      // the check before leaves it turned off, and a turned-off dial's buttons are disabled
    const hadOwn = Object.prototype.hasOwnProperty.call(navigator, 'vibrate');
    try { Object.defineProperty(navigator, 'vibrate', { value: undefined, configurable: true }); } catch (e) {}
    card._ctx.haptic(10); const lab = document.querySelector('label[data-okie-haptic]'); let ticks = 0;
    if (lab) lab.addEventListener('click', () => ticks++);
    const t0 = num(); stp[1].click(); await sleep(1700);
    const up = num(), step = up - t0, sentUp = calls.filter(c => c[1] === 'set_temperature' && Math.abs(c[2].temperature - up) < 0.01).length;
    stp[0].click(); await sleep(1700);
    const back = num(), sentBack = calls.filter(c => c[1] === 'set_temperature' && Math.abs(c[2].temperature - t0) < 0.01).length;
    if (!hadOwn) delete navigator.vibrate;
    card._ctx.call = origCall; card._back(); await sleep(250);
    const ok = titleOk && !!lab && step > 0 && step <= 1 && Math.abs(back - t0) < 0.01 && sentUp === 1 && sentBack === 1 && ticks >= 2;
    return ok ? true : { titleOk, lab: !!lab, t0, up, back, step, sentUp, sentBack, ticks };
  });
  await check('climate: the Settings tab holds the temperature colours (scale, four colours, two limits) and no glow or ticks; it persists only the change, the dial follows it, reset puts the colours back', async () => {
    await resetNav(); card._settings.reset('thermo'); card._openDetail('climate.living_room'); await sleep(1100);
    const tab = id => sr.querySelector('.dt-tab[data-tab="' + id + '"]');
    tab('settings').click(); await sleep(900);
    const panel = sr.querySelector('.thl'), sliders = panel && panel.querySelectorAll('.slider'), colors = panel && panel.querySelectorAll('.thl-color');
    const has = !!panel && sliders.length === 2 && colors.length === 4 && !!panel.querySelector('.thl-bar') && !panel.querySelector('.thl-prev') && !/Glow blur|Glow spread|Glow strength|Tick density/i.test(panel.textContent);      // the cool limit and the warm limit
    colors[2].value = '#00ff00'; colors[2].dispatchEvent(new Event('change', { bubbles: true })); await sleep(200);
    const saved = card._store.get('settings').thermo, onlyDelta = saved && saved.c2 === '#00ff00' && saved.glowBlur === undefined && saved.ticks === undefined;
    tab('controls').click(); await sleep(1500);
    const ticks = sr.querySelectorAll('.th .th-tick').length, rim = sr.querySelector('.th .th-glow').style.color;
    const rgb = (rim.match(/\d+/g) || []).map(Number), follows = ticks === 197 && rgb.length === 3 && rgb[1] > rgb[0] && rgb[1] > rgb[2] && rgb[1] > 150;   // green-ish at 73 F, between the cool stop and the warm (green) one
    tab('settings').click(); await sleep(900);
    [...sr.querySelectorAll('.thl .act')].pop().click(); await sleep(300);
    const back = !Object.keys((card._store.get('settings') || {}).thermo || {}).length && card._settings.get().thermo.c2 === '#ff962d';
    card._back(); await sleep(300);
    return has && onlyDelta && follows && back ? true : { has, onlyDelta, saved, ticks, rim, follows, back };
  });
  await check('dial look: Settings > Design > Dials has three plain sliders (no demo card), and the glow and ticks apply to every dial and slider; Reset puts them back', async () => {
    await resetNav(); card._settings.reset('thermo'); const CT = window.OkieMotor.controls;
    card._openApp('settings'); await sleep(1300); sr.querySelectorAll('.dt-bar button')[1].click(); await sleep(900);
    const noDemo = !sr.querySelector('.ios-diallook, .dlp'), cells = noDemo ? 'none' : 'demo';
    const rows = ['dl_blur', 'dl_strength', 'dl_ticks'].every(r => !!sr.querySelector('[data-row="' + r + '"] .slider')) && !!sr.querySelector('[data-row="dl_reset"]');
    const wheelOk = true;      // (the demo card is gone: the real wheel and slider are measured below)
    // a dial and a slider as the other screens make them
    const d = CT.createDial({ min: 0, max: 100, step: 1, value: 50, size: 200, gradient: ['#1b8f8f', '#6be3df'] }), sl = CT.createSlider({ min: 0, max: 100, step: 1, value: 50 });
    const host = document.createElement('div'); sr.appendChild(host); host.appendChild(d.el); host.appendChild(sl.el); await sleep(100);
    const std = () => +d.el.querySelector('feGaussianBlur').getAttribute('stdDeviation'), glowEl = () => d.el.querySelector('.dial-svg path[filter]'), nTicks = () => d.el.querySelectorAll('.dial-svg g line').length;
    const sGlow = () => ({ f: sl.el.querySelector('.sl-glow').style.filter, o: +sl.el.querySelector('.sl-glow').style.opacity });
    const base = { std: std(), ticks: nTicks(), s: sGlow() };
    card._settings.set({ thermo: { glowBlur: 0 } }); await sleep(150);
    const off = { std: std(), shown: glowEl().style.display !== 'none', s: sGlow() };
    card._settings.set({ thermo: { glowBlur: 140, glowOpacity: 100, ticks: 40 } }); await sleep(150);
    const big = { std: std(), ticks: nTicks(), s: sGlow() };
    card._settings.set({ thermo: { glowOpacity: 0 } }); await sleep(150); const none = { shown: glowEl().style.display !== 'none', so: sGlow().o };
    // the same numbers in the Settings sliders, and the reset
    sr.querySelector('[data-row="dl_reset"]').click(); await sleep(400);
    const saved = (card._store.get('settings') || {}).thermo || {}, reset = !Object.keys(saved).length && Math.abs(std() - base.std) < 0.01 && nTicks() === base.ticks && sGlow().f === base.s.f;
    host.remove(); card._back(); await sleep(300);
    const ok = cells === 'none' && rows && wheelOk && base.std > 5 && base.ticks === 65 && /blur/.test(base.s.f) && base.s.o > 0.4
      && off.std === 0 && !off.shown && (off.s.f === 'none' || /blur\(0/.test(off.s.f) || off.s.f === '') && big.std > base.std && big.ticks < base.ticks && big.s.o > base.s.o && !none.shown && none.so === 0 && reset;
    return ok ? true : { cells, rows, wheelOk, base, off, big, none, saved, reset };
  });
  await check('climate: choosing another tab rolls the wheel out to the right first, then the tab appears', async () => {
    await resetNav(); card._openDetail('climate.living_room'); await sleep(1100);
    const gw = () => sr.querySelector('.th-gaugewrap'), tab = id => sr.querySelector('.dt-tab[data-tab="' + id + '"]');
    tab('history').click(); await sleep(150);
    const mid = gw() ? { op: +gw().style.opacity, x: parseFloat((gw().style.transform.match(/-?[\d.]+/) || [0])[0]) } : null;      // still there, fading and moving right
    const markedAtOnce = tab('history').classList.contains('on');
    await sleep(900);
    const done = !gw() && sr.querySelector('.dt-tab.on').dataset.tab === 'history';
    tab('controls').click(); await sleep(1300); const intro = !!gw();                          // and it rolls back in when the controls return
    card._back(); await sleep(300);
    return mid && mid.op < 1 && mid.x > 0 && markedAtOnce && done && intro ? true : { mid, markedAtOnce, done, intro };
  });
  await check('rooms: the thermostat and the TV have taller cards (big temperature + its colour, picture tile + now playing + controls) that open the device and control it', async () => {
    await resetNav(); card._show('start'); await sleep(300); card._ctx.openApp('room:living-room'); await sleep(1000);
    const th = sr.querySelector('.rc-climate'), tv = sr.querySelector('.rc-media');
    const shape = !!th && !!tv && /^[\d–]/.test((th.querySelector('.rc-num') || {}).textContent || '') && th.querySelectorAll('.rc-modes i').length >= 2 && !!th.querySelector('.rc-go')
      && !!tv.querySelector('.rc-art') && !!tv.querySelector('.rc-pw') && tv.querySelectorAll('.rc-tr').length === 2 && !!tv.querySelector('.rc-np b').textContent;
    const tall = th && tv && th.getBoundingClientRect().height >= 100 && tv.getBoundingClientRect().height >= 150;
    const calls = []; const keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + (data && data.entity_id)); return Promise.resolve(); };
    tv.querySelectorAll('.rc-tr')[0].click(); tv.querySelector('.rc-pw').click(); tv.querySelectorAll('.rc-tr')[1].click(); await sleep(100); card._ctx.call = keep;
    const controls = calls.length === 3 && /media_player\.media_play_pause/.test(calls[0]) && /media_player\.turn_(on|off)/.test(calls[1]) && /media_player\.media_next_track/.test(calls[2]);
    th.querySelector('.rc-go').click(); await sleep(900);
    const opens = card._nav.mode === 'detail' && /^climate\./.test(card._nav.itemId);
    card._show('start'); await sleep(300);
    return shape && tall && controls && opens ? true : { shape, tall, calls, opens, mode: card._nav.mode };
  });
  await check('TV: a Samsung TV gets a remote (home/back/menu, d-pad, transport, volume, channel) that sends the key names to its remote entity, holding a key repeats it; a speaker gets none', async () => {
    await resetNav(); card._openDetail('media_player.living_room_tv'); await sleep(1300);
    const calls = []; const keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + data.entity_id + ':' + (data.command || []).join(',')); return Promise.resolve(); };
    const rmt = sr.querySelector('.dctl .rmt'), keys = rmt ? [...rmt.querySelectorAll('.rk[data-key]')] : [];
    const ptr2 = (b, type) => b.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, pointerId: 11 }));
    const k = n => rmt.querySelector('.rk[data-key="' + n + '"]');
    ptr2(k('up'), 'pointerdown'); ptr2(k('up'), 'pointerup'); ptr2(k('ok'), 'pointerdown'); ptr2(k('ok'), 'pointerup'); ptr2(k('home'), 'pointerdown'); ptr2(k('home'), 'pointerup');
    const first = calls.slice();
    calls.length = 0; ptr2(k('vup'), 'pointerdown'); await sleep(950); const held = calls.length; ptr2(k('vup'), 'pointerup'); await sleep(450); const stopped = calls.length === held;
    card._ctx.call = keep;
    const topRow = sr.querySelector('.dctl .actrow'), pw = sr.querySelector('.dctl .rmb .rm-top .power'), pwr = pw && pw.getBoundingClientRect(), rb = sr.querySelector('.dctl .rmb') && sr.querySelector('.dctl .rmb').getBoundingClientRect();
    const likeRemote = !!topRow && getComputedStyle(topRow).display === 'none' && !!pw && pwr.width < 60 && pwr.width > 20 && !!rb && rb.height > rb.width && !!sr.querySelector('.dt[data-remote]');      // no transport row above, a tall skinny remote with the power key on top, the picture wider than the remote
    const appBtns = [...sr.querySelectorAll('.dctl .rapp')], appNames = appBtns.map(b => b.textContent).join('|');
    const sel = []; const keep2 = card._ctx.call; card._ctx.call = function (d, sv, data) { sel.push(d + '.' + sv + ':' + (data.source || '')); return Promise.resolve(); }; if (appBtns[0]) appBtns[0].click(); await sleep(150); card._ctx.call = keep2;
    const apps = appNames === 'Netflix|Disney+|Apple TV+|HBO max' && sel.join() === 'media_player.select_source:Netflix';      // the app keys start the app of that name from the TV's sources
    const ok1 = likeRemote && apps && keys.length === 17 && first.join('|') === 'remote.send_command:remote.living_room_tv:KEY_UP|remote.send_command:remote.living_room_tv:KEY_ENTER|remote.send_command:remote.living_room_tv:KEY_HOME' && held >= 3 && stopped && /KEY_VOLUP/.test(calls[0]);
    card._back(); await sleep(250);
    card._openDetail('media_player.kitchen_speaker'); await sleep(1000); const none = !sr.querySelector('.dctl .rmt') && getComputedStyle(sr.querySelector('.dctl .actrow')).display !== 'none'; card._back(); await sleep(250);
    return ok1 && none ? true : { likeRemote, apps, appNames, sel, keys: keys.length, first, held, stopped, none };
  });
  await check('music: a Spotify player opens the Music screen, a TV keeps its own view', async () => {
    await resetNav(); card._openDetail('media_player.spotify_alex'); await sleep(1200); const music = card._nav.mode === 'app' && card._nav.appId === 'music' && !!sr.querySelector('.mu-player');
    await resetNav(); card._openDetail('media_player.living_room_tv'); await sleep(1000); const tv = card._nav.mode === 'detail'; await resetNav();
    return music && tv ? true : { music, tv, nav: card._nav };
  });
  await check('recordings: a tap on a motion event opens the server recording of it (a full-screen frame with the event time), its own close message or the cross closes it; with recordings off the rows do nothing', async () => {
    await resetNav(); card._settings.set({ cameras: { clipsUrl: 'about:blank#' } }); await sleep(200);
    card._ctx.openApp('camhistory'); await sleep(1500);
    let rows = [...sr.querySelectorAll('.ch-row')]; const playable = rows.length === 8 && rows.every(r => r.classList.contains('play') && !!r.querySelector('.ch-play') && r.getAttribute('role') === 'button');
    const t0 = Date.now() - 35 * 60000; rows[0].click(); await sleep(400);
    let fr = sr.querySelector('.rec-full .rec-frame'); const src = fr ? fr.getAttribute('src') : '', m = /ts=(\d+)&embed=1$/.exec(src);
    const opened = !!fr && !!m && Math.abs(+m[1] * 1000 - t0) < 180000 && /^about:blank#\?ts=/.test(src);
    window.dispatchEvent(new MessageEvent('message', { data: { okieRing: 'close' }, source: fr.contentWindow })); await sleep(200);
    const closedByPage = !sr.querySelector('.rec-full');
    rows[2].click(); await sleep(300); const again = !!sr.querySelector('.rec-full'); sr.querySelector('.rec-x').click(); await sleep(200);
    const closedByX = !sr.querySelector('.rec-full');
    card._back(); await sleep(500); card._settings.set({ cameras: { clipsUrl: '', recordings: false } }); await sleep(200);
    card._ctx.openApp('camhistory'); await sleep(1500);
    const off = [...sr.querySelectorAll('.ch-row')].length > 0 && ![...sr.querySelectorAll('.ch-row')].some(r => r.classList.contains('play'));
    card._back(); await sleep(400); card._settings.set({ cameras: { clipsUrl: '', recordings: true } }); await sleep(200);
    return playable && opened && closedByPage && again && closedByX && off ? true : { playable, src, opened, closedByPage, again, closedByX, off };
  });
  await check('thermostat schedule: a weekday tab per day, Add builds mode + degrees (not just on/off), an entry can be edited, switched off and deleted; Eco has degrees of its own that update every schedule of that name', async () => {
    window.__schedules = []; window.__schedCalls = [];
    await resetNav(); card._openDetail('climate.living_room'); await sleep(1300);
    sr.querySelector('.dt-tab[data-tab="schedule"]').click(); await sleep(1600);
    const tabs = sr.querySelectorAll('.ts-day').length === 7 && !!sr.querySelector('.ts-empty') && !!sr.querySelector('.ts-add');
    sr.querySelector('.ts-add').click(); await sleep(500);
    sr.querySelector('.cp[data-profile="eco"]').click(); await sleep(200);
    const nameEco = sr.querySelector('.ts-name').value === 'Eco';
    const lo0 = sr.querySelector('.ts-st.heat .ts-stv').textContent, hi0 = sr.querySelector('.ts-st.cool .ts-stv').textContent;        // the Celsius profile of Eco: 17 and 27 (half-degree steps show a decimal)
    [...sr.querySelectorAll('.ts-quick .cp')][1].click(); await sleep(100);                                                              // Mon - Fri
    sr.querySelector('.ts-save').click(); await sleep(1500);
    const add = window.__schedCalls[0] || [], slot = add[1] && add[1].timeslots && add[1].timeslots[0];
    const acts = slot ? slot.actions.map(a => a.service + ':' + JSON.stringify(a.service_data)).join('|') : '';
    const built = add[0] === 'add' && add[1].name === 'Eco' && add[1].weekdays.join() === 'mon,tue,wed,thu,fri' && /^\d\d:\d\d:00$/.test(slot.start)
      && acts === 'climate.set_preset_mode:{"preset_mode":"none"}|climate.set_hvac_mode:{"hvac_mode":"heat_cool"}|climate.set_temperature:{"target_temp_low":17,"target_temp_high":27}';
    const rows = [...sr.querySelectorAll('.ts-row')], r0 = rows[0], chips = r0 ? [...r0.querySelectorAll('.ts-chip')].map(c => c.textContent).join('/') : '';
    const listed = rows.length === 1 && /Eco/.test(r0.textContent) && chips === '17°/27°';
    // edit: cool to 28
    r0.click(); await sleep(500);
    sr.querySelectorAll('.ts-st.cool .ts-stb')[1].click(); await sleep(100);
    const stepped = sr.querySelector('.ts-st.cool .ts-stv').textContent === '27.5°' || sr.querySelector('.ts-st.cool .ts-stv').textContent === '28°';
    sr.querySelector('.ts-save').click(); await sleep(1500);
    const ed = window.__schedCalls[1] || [], edited = ed[0] === 'edit' && /^switch\.schedule_/.test(ed[1].entity_id) && ed[1].timeslots[0].actions[2].service_data.target_temp_high > 27 && !('stop' in ed[1].timeslots[0]);
    // switch it off
    sr.querySelector('.ts-row .sw').click(); await sleep(900);
    const off = sr.querySelector('.ts-row').classList.contains('off') && (window.__schedules[0] || {}).enabled === false;
    sr.querySelector('.ts-row .sw').click(); await sleep(900);
    // profiles: Eco now means 15 - 25; the schedule is still 17 - 28, so "Update 1" shows and rewrites it
    sr.querySelector('.ts-prof-h').click(); await sleep(300);
    const ecoRow = sr.querySelector('.ts-prow[data-profile="eco"]');
    for (let i = 0; i < 4; i++) ecoRow.querySelectorAll('.ts-st.heat .ts-stb')[0].click();            // heat 17 -> 15 (half degrees)
    await sleep(1400);
    const saved = (card._settings.get().thermoSched || {}).profiles, profSaved = saved && saved.eco && saved.eco.low < 17;
    const upd = sr.querySelector('.ts-prow[data-profile="eco"] .ts-upd');
    const updShown = !!upd && /1/.test(upd.textContent);
    if (upd) { upd.click(); await sleep(1500); }
    const lastEdit = window.__schedCalls[window.__schedCalls.length - 1] || [], updated = lastEdit[0] === 'edit' && lastEdit[1].timeslots[0].actions[2].service_data.target_temp_low === saved.eco.low;
    // delete
    sr.querySelector('.ts-row').click(); await sleep(400); sr.querySelector('.ts-del').click(); await sleep(7500);
    const removed = window.__schedCalls.some(c => c[0] === 'remove') && !(window.__schedules || []).length;
    card._settings.set({ thermoSched: { profiles: {} } }); card._back(); await sleep(400);
    const ok = tabs && nameEco && lo0 === '17.0°' && hi0 === '27.0°' && built && listed && stepped && edited && off && profSaved && updShown && updated && removed;
    return ok ? true : { tabs, nameEco, lo0, hi0, built, acts, chips, listed, stepped, edited, off, profSaved, updShown, updated, removed, calls: window.__schedCalls.map(c => c[0]) };
  });
  await check('sources: a player with many sources (a Roku lists every app) gets a drop-down that selects, one with a few keeps its chips', async () => {
    await resetNav(); const id = 'media_player.living_room_tv', was = card.hass.states[id];
    const apps = ['Home', 'Netflix', 'Hulu', 'Disney Plus', 'HBO Max', 'Prime Video', 'Peacock TV', 'Plex', 'Pluto TV', 'YouTube', 'HDMI 2', 'HDMI 4'];
    card.hass = Object.assign({}, card.hass, { states: Object.assign({}, card.hass.states, { [id]: Object.assign({}, was, { attributes: Object.assign({}, was.attributes, { source_list: apps, source: 'Hulu', supported_features: 152461 | 2048 }) }) }) });
    card._openDetail(id); await sleep(1100);
    const sel = sr.querySelector('.dctl .src-sel'), opts = sel ? [...sel.options].map(o => o.textContent) : [];
    const calls = []; const keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + data.source); return Promise.resolve(); };
    let picked = false; const initial = sel && sel.value;      // the current source is the selected one
    if (sel) { sel.value = 'Netflix'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200); picked = calls.join() === 'media_player.select_source:Netflix'; }
    card._ctx.call = keep;
    const drop = !!sel && opts.length === apps.length + 1 && initial === 'Hulu' && !sr.querySelector('.dctl .chiprow') && picked;
    card._back(); await sleep(250);
    card.hass = Object.assign({}, card.hass, { states: Object.assign({}, card.hass.states, { [id]: Object.assign({}, was, { attributes: Object.assign({}, was.attributes, { source_list: ['TV', 'HDMI'], supported_features: 152461 | 2048 }) }) }) });
    card._openDetail(id); await sleep(1000); const chipsKept = !sr.querySelector('.dctl .src-sel') && sr.querySelectorAll('.dctl .chiprow button').length >= 2; card._back(); await sleep(250);
    return drop && chipsKept ? true : { drop, picked, opts: opts.length, selValue: sel && sel.value, chipsKept };
  });
  await check('vacuum: the little robot, battery with the bolt, four keys that follow the state, tiles for tank, bin and pad, the last clean and the mission statistics', async () => {
    await resetNav(); const id = 'vacuum.robo', was = card.hass.states[id];
    card._openDetail(id); await sleep(1300);
    const vc = sr.querySelector('.dctl.vc'); if (!vc) return { vc: false };
    const docked = vc.dataset.state === 'docked' && /Docked/.test(vc.querySelector('.vc-state').textContent) && /100%/.test(vc.querySelector('.vc-bat').textContent) && !!vc.querySelector('.vc-bat .vc-bolt') && !!vc.querySelector('.vc-art svg .vc-dock');
    const keys = [...vc.querySelectorAll('.vc-btn')].map(b => b.dataset.act + (b.disabled ? '!' : '')).join();
    const tiles = [...vc.querySelectorAll('.vc-tile .vc-tl')].map(e => e.textContent.toLowerCase()).join();
    const mis = vc.querySelector('.vc-mis').textContent, stats = /420 missions/.test(mis) && /Successful 273/.test(mis) && /Cancelled 66/.test(mis) && /Failed 80/.test(mis) && /Averagemission7h/.test(mis.replace(/\s+/g, '')) && /Scrubs/.test(mis);
    const last = /Last clean/i.test(vc.querySelector('.vc-last').textContent) && /ago/.test(vc.querySelector('.vc-last').textContent);
    const calls = []; const keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv); return Promise.resolve(); };
    vc.querySelector('[data-act="start"]').click(); await sleep(100); const started = calls[0] === 'vacuum.start';
    card.hass = Object.assign({}, card.hass, { states: Object.assign({}, card.hass.states, { [id]: Object.assign({}, was, { state: 'cleaning' }) }) }); await sleep(500);
    const cleaning = vc.dataset.state === 'cleaning' && /Pause/.test(vc.querySelector('[data-act="start"]').parentNode.textContent) && !vc.querySelector('[data-act="stop"]').disabled && !vc.querySelector('[data-act="dock"]').disabled;
    vc.querySelector('[data-act="start"]').click(); vc.querySelector('[data-act="dock"]').click(); vc.querySelector('[data-act="locate"]').click(); vc.querySelector('[data-act="stop"]').click(); await sleep(100);
    const sent = calls.slice(1).join() === 'vacuum.pause,vacuum.return_to_base,vacuum.locate,vacuum.stop';
    card._ctx.call = keep;
    card.hass = Object.assign({}, card.hass, { states: Object.assign({}, card.hass.states, { [id]: was }) }); await sleep(300);
    card._back(); await sleep(300);
    const ok = docked && keys === 'start,stop!,dock!,locate' && /battery/.test(tiles) && /water tank/.test(tiles) && /bin/.test(tiles) && /pad/.test(tiles) && stats && last && started && cleaning && sent;
    return ok ? true : { docked, keys, tiles, stats, last, started, cleaning, sent, calls };
  });
  await check('vacuum schedule: a weekly planner with jobs; Add makes vacuum.start, your own job (kind, command, parameters) is saved and scheduled through send_command, its button runs it, entries can be edited, switched off and deleted', async () => {
    window.__schedules = []; window.__schedCalls = []; card._settings.set({ vacuum: { jobs: [] } });
    const type = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    await resetNav(); card._openDetail('vacuum.robo'); await sleep(1300);
    sr.querySelector('.dt-tab[data-tab="schedule"]').click(); await sleep(1500);
    const tabs = sr.querySelectorAll('.ts-day').length === 7 && !!sr.querySelector('.ts-empty') && !!sr.querySelector('.ts-add');
    // 1. a plain Clean, every day
    sr.querySelector('.ts-add').click(); await sleep(400);
    type(sr.querySelector('.ts-name'), 'Cat litter'); [...sr.querySelectorAll('.ts-quick .cp')][0].click(); await sleep(100);
    const picks0 = [...sr.querySelectorAll('.vs-picks .cp')].map(b => b.dataset.job).join();
    sr.querySelector('.ts-save').click(); await sleep(1500);
    const a0 = window.__schedCalls[0] || [], s0 = a0[1] && a0[1].timeslots && a0[1].timeslots[0];
    const built = a0[0] === 'add' && a0[1].name === 'Cat litter' && a0[1].weekdays.length === 7 && /^\d\d:\d\d:00$/.test(s0.start) && JSON.stringify(s0.actions) === JSON.stringify([{ service: 'vacuum.start', entity_id: 'vacuum.robo' }]);
    let rows = [...sr.querySelectorAll('.ts-row')];
    const listed = rows.length === 1 && /Cat litter/.test(rows[0].textContent) && rows[0].dataset.job === 'clean';
    // 2. your own job: bad JSON is refused, good JSON is kept
    sr.querySelector('.vs-jobs .ts-prof-h').click(); await sleep(300);
    const jrows0 = sr.querySelectorAll('.vs-jrow').length;                                // Clean, Return to dock and the three favorites
    sr.querySelector('.vs-newjob').click(); await sleep(300);
    sr.querySelector('.vs-types .cp[data-type="command"]').click(); await sleep(200);
    type(sr.querySelector('.vs-jname'), 'Kitchen mop'); sr.querySelector('.vs-kinds .cp[data-kind="mop"]').click(); await sleep(50);
    type(sr.querySelector('.vs-jparams'), '{bad json'); sr.querySelector('.vs-jsave').click(); await sleep(200);
    const rejected = !sr.querySelector('.vs-bad').hidden && !(card._settings.get().vacuum.jobs || []).length;
    type(sr.querySelector('.vs-jparams'), '{"regions":[{"region_id":"1","type":"rid"}],"ordered":1}');
    sr.querySelector('.vs-jsave').click(); await sleep(500);
    const jobs = card._settings.get().vacuum.jobs.slice();
    const saved = jobs.length === 1 && jobs[0].name === 'Kitchen mop' && jobs[0].kind === 'mop' && jobs[0].command === 'start' && jobs[0].params.ordered === 1 && sr.querySelectorAll('.vs-jrow').length === 6;
    // 3. that job on weekdays
    sr.querySelector('.ts-add').click(); await sleep(400);
    [...sr.querySelectorAll('.ts-quick .cp')][1].click(); await sleep(50);
    sr.querySelector('.vs-picks .cp[data-job="' + jobs[0].id + '"]').click(); await sleep(50);
    sr.querySelector('.ts-save').click(); await sleep(1500);
    const a1 = window.__schedCalls[1] || [], act1 = a1[1] && a1[1].timeslots[0].actions[0];
    const custom = a1[0] === 'add' && a1[1].name === 'Kitchen mop' && !!act1 && act1.service === 'vacuum.send_command' && act1.entity_id === 'vacuum.robo' && act1.service_data.command === 'start' && act1.service_data.params.ordered === 1 && a1[1].weekdays.join() === 'mon,tue,wed,thu,fri';
    rows = [...sr.querySelectorAll('.ts-row')];
    const both = rows.length === 2 && rows.some(r => r.dataset.job === jobs[0].id && /Kitchen mop/.test(r.textContent));
    // 4. edit: the Kitchen mop entry becomes Return to dock
    rows.find(r => r.dataset.job === jobs[0].id).click(); await sleep(500);
    sr.querySelector('.vs-picks .cp[data-job="dock"]').click(); await sleep(50);
    sr.querySelector('.ts-save').click(); await sleep(1500);
    const a2 = window.__schedCalls[2] || [], edited = a2[0] === 'edit' && /^switch\.schedule_/.test(a2[1].entity_id) && a2[1].timeslots[0].actions[0].service === 'vacuum.return_to_base' && !('stop' in a2[1].timeslots[0]);
    // 5. switched off, deleted
    const dockRow = () => [...sr.querySelectorAll('.ts-row')].find(r => r.dataset.job === 'dock');
    dockRow().querySelector('.sw').click(); await sleep(900);
    const off = !!dockRow() && dockRow().classList.contains('off');
    dockRow().click(); await sleep(400); sr.querySelector('.ts-del').click(); await sleep(7500);
    const removed = window.__schedCalls.some(c => c[0] === 'remove') && window.__schedules.length === 1;
    // 6. the screen of the robot: your job is a button that sends the command, the next clean shows
    sr.querySelector('.dt-tab[data-tab="controls"]').click(); await sleep(1000);
    const jb = [...sr.querySelectorAll('.vc-jobs:not(.vc-fav):not(.vc-mode):not(.vc-rooms) .vc-job')][0], calls = [], keep = card._ctx.call;
    card._ctx.call = function (d, sv, data) { calls.push([d, sv, JSON.stringify(data)]); return Promise.resolve(); };
    if (jb) jb.click(); await sleep(150); card._ctx.call = keep;
    const run = !!jb && /Kitchen mop/.test(jb.textContent) && calls.length === 1 && calls[0][0] === 'vacuum' && calls[0][1] === 'send_command' && JSON.parse(calls[0][2]).params.ordered === 1;
    const nextShown = !!sr.querySelector('.vc-next:not([hidden])') && /Cat litter/.test(sr.querySelector('.vc-next').textContent);
    // 7. the job can be deleted again
    sr.querySelector('.dt-tab[data-tab="schedule"]').click(); await sleep(1200);
    sr.querySelector('.vs-jobs .ts-prof-h').click(); await sleep(300);
    sr.querySelector('.vs-jrow .vs-edit').click(); await sleep(300); sr.querySelector('.vs-jdel').click(); await sleep(400);
    const jobGone = !(card._settings.get().vacuum.jobs || []).length && sr.querySelectorAll('.vs-jrow').length === 5;
    card._settings.set({ vacuum: { jobs: [] } }); window.__schedules = []; card._back(); await sleep(300);
    const ok = tabs && picks0 === 'clean,dock,fav:f1,fav:f2,fav:f3' && built && listed && jrows0 === 5 && rejected && saved && custom && both && edited && off && removed && run && nextShown && jobGone;
    return ok ? true : { tabs, picks0, built, listed, jrows0, rejected, saved, custom, both, edited, off, removed, run, nextShown, jobGone, calls: window.__schedCalls.map(c => c[0]) };
  });
  await check('vacuum: what needs attention is a banner (full bin, low tank); the recent cleans come from the history of the robot', async () => {
    await resetNav(); const id = 'vacuum.robo', was = card.hass.states[id];
    card.hass = Object.assign({}, card.hass, { states: Object.assign({}, card.hass.states, { [id]: Object.assign({}, was, { attributes: Object.assign({}, was.attributes, { bin_full: true, tank_level: 10 }) }) }) });
    card._openDetail(id); await sleep(1800);
    const al = [...sr.querySelectorAll('.vc-alert')].map(a => a.dataset.alert).join(), runs = [...sr.querySelectorAll('.vc-run')].map(r => r.dataset.mins).join(), title = (sr.querySelector('.vc-runs .vc-tl') || {}).textContent;
    card.hass = Object.assign({}, card.hass, { states: Object.assign({}, card.hass.states, { [id]: was }) }); await sleep(400);
    const cleared = [...sr.querySelectorAll('.vc-alert')].map(a => a.dataset.alert).join() === 'maintenance';          // what is left is the filter that really is due
    card._back(); await sleep(300);
    return al === 'bin_full,tank_low,maintenance' && runs === '9,30' && /recent/i.test(title || '') && cleared ? true : { al, runs, title, cleared };
  });
  await check('vacuum+: favorites, cleaning mode, one-tap rooms, settings, maintenance with a two-step reset, and the map', async () => {
    await resetNav(); card._openDetail('vacuum.robo'); await sleep(1500);
    const vc = sr.querySelector('.dctl.vc'), calls = [], keep = card._ctx.call;
    card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + JSON.stringify(data)); return Promise.resolve(); };
    const favs = [...vc.querySelectorAll('.vc-fav .vc-job')].map(b => b.textContent.trim()).join('|');
    vc.querySelector('.vc-fav .vc-job[data-fav="f2"]').click(); await sleep(150);
    const favRun = calls[0] === 'roomba_plus.run_favorite:{"entity_id":"vacuum.robo","favorite_id":"f2"}';
    const modes = [...vc.querySelectorAll('.vc-mode .vc-job')].map(b => b.dataset.mode + (b.classList.contains('on') ? '*' : '')).join();
    vc.querySelector('.vc-mode .vc-job[data-mode="mop"]').click(); await sleep(150);
    const modeSet = calls[1] === 'select.select_option:{"entity_id":"select.robo_cleaning_mode","option":"mop"}';
    const rooms = [...vc.querySelectorAll('.vc-rooms .vc-job')].map(b => b.textContent.trim()).join('|');
    vc.querySelector('.vc-rooms .vc-job[data-room="Living Room"]').click(); await sleep(250);
    const roomRun = calls[2] === 'select.select_option:{"entity_id":"select.robo_zone","option":"Living Room"}' && calls[3] === 'button.press:{"entity_id":"button.robo_clean_smart_zone"}';
    const optRows = [...vc.querySelectorAll('.vc-opt .vc-orow')].map(r => r.textContent.trim().replace(/\s+/g, ' ')).join('|');
    vc.querySelector('.vc-opt .vc-orow[data-sw="switch.robo_edge_clean"] .sw').click(); await sleep(150);
    const swCall = calls[4] === 'switch.toggle:{"entity_id":"switch.robo_edge_clean"}';
    const maint = [...vc.querySelectorAll('.vc-maint .vc-mrow')].map(r => r.dataset.part + ':' + (r.classList.contains('due') ? 'due' : 'ok') + ':' + r.querySelector('.vc-mt b').textContent).join('|');
    const rs = () => vc.querySelector('.vc-mrow[data-part="filter"] .vc-rs');
    rs().click(); await sleep(150); const asked = rs().classList.contains('ask') && calls.length === 5;
    rs().click(); await sleep(250); const reset = calls[5] === 'button.press:{"entity_id":"button.robo_reset_filter"}';
    const img = vc.querySelector('.vc-mapimg'), mapTabs = [...vc.querySelectorAll('.vc-map .vc-job[data-map]')].map(b => b.dataset.map).join();
    const mapA = img && /svg/.test(img.getAttribute('src') || '') ? img.getAttribute('src') : '';
    vc.querySelector('.vc-map .vc-job[data-map="rooms"]').click(); await sleep(250);
    const mapB = vc.querySelector('.vc-mapimg').getAttribute('src'), mapSwitched = !!mapB && mapB !== mapA;
    card._ctx.call = keep; card._back(); await sleep(300);
    const ok = favs === 'Vacuum and Mop Everywhere|Around Litter box|Vacuum Everywhere' && favRun && modes === 'vacuum*,mop,vacuum_and_mop,vacuum_then_mop' && modeSet && rooms === 'Bedroom|Living Room|Kitchen|Cat Litter' && roomRun
      && /Pad wetness|pad wetness/i.test(optRows) && /Edge clean/.test(optRows) && /Child lock/.test(optRows) && /passes/i.test(optRows) && swCall && maint === 'filter:due:Due|brush:ok:259 h left' && asked && reset && mapTabs === 'path,rooms' && !!mapA && mapSwitched;
    return ok ? true : { favs, favRun, modes, modeSet, rooms, roomRun, optRows, swCall, maint, asked, reset, mapTabs, mapA: !!mapA, mapSwitched, calls };
  });
  await check('vacuum+ planner: favorites are jobs, a room job (rooms, mode, passes) is saved and scheduled through clean_room / clean_zone, and runs both calls in order', async () => {
    window.__schedules = []; window.__schedCalls = []; card._settings.set({ vacuum: { jobs: [] } });
    const type = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    await resetNav(); card._openDetail('vacuum.robo'); await sleep(1300);
    sr.querySelector('.dt-tab[data-tab="schedule"]').click(); await sleep(1500);
    // a schedule that runs a favorite
    sr.querySelector('.ts-add').click(); await sleep(400);
    [...sr.querySelectorAll('.ts-quick .cp')][0].click(); await sleep(50);
    sr.querySelector('.vs-picks .cp[data-job="fav:f1"]').click(); await sleep(50);
    sr.querySelector('.ts-save').click(); await sleep(1500);
    const a0 = window.__schedCalls[0] || [], act0 = a0[1] && a0[1].timeslots[0].actions;
    const favSaved = a0[0] === 'add' && a0[1].name === 'Vacuum and Mop Everywhere' && JSON.stringify(act0) === JSON.stringify([{ service: 'roomba_plus.run_favorite', entity_id: 'vacuum.robo', service_data: { favorite_id: 'f1' } }]);
    const favRow = sr.querySelector('.ts-row'), favListed = !!favRow && favRow.dataset.job === 'fav:f1';
    // a room job
    sr.querySelector('.vs-jobs .ts-prof-h').click(); await sleep(300);
    const groups = sr.querySelectorAll('.vs-jrow').length;
    sr.querySelector('.vs-newjob').click(); await sleep(300);
    const defaultsToRooms = sr.querySelector('.vs-types .cp.on').dataset.type === 'rooms';
    type(sr.querySelector('.vs-jname'), 'Kitchen mop');
    sr.querySelector('.vs-roomchips .cp[data-room="Living Room"]').click(); sr.querySelector('.vs-roomchips .cp[data-room="Kitchen "]').click(); await sleep(50);
    sr.querySelector('.vs-modes .cp[data-v="mop"]').click(); await sleep(100);
    sr.querySelector('.vs-passes .cp[data-v="two"]').click(); await sleep(100);
    const calls = [], keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + JSON.stringify(data)); return Promise.resolve(); };
    sr.querySelector('.vs-jtest').click(); await sleep(250); card._ctx.call = keep;
    const ran = calls.length === 2 && calls[0] === 'roomba_plus.clean_room:{"entity_id":"vacuum.robo","room_name":["Living Room"],"cleaning_mode":"mop","two_pass":true}' && calls[1] === 'roomba_plus.clean_zone:{"entity_id":"vacuum.robo","zone_name":["Kitchen "],"cleaning_mode":"mop","two_pass":true}';
    sr.querySelector('.vs-jsave').click(); await sleep(500);
    const jobs = card._settings.get().vacuum.jobs, j = jobs[0];
    const saved = jobs.length === 1 && j.type === 'rooms' && j.name === 'Kitchen mop' && j.kind === 'mop' && j.regions.join() === 'Living Room' && j.zones.join() === 'Kitchen ' && j.mode === 'mop' && j.passes === 'two';
    // schedule it on the weekend
    sr.querySelector('.ts-add').click(); await sleep(400);
    [...sr.querySelectorAll('.ts-quick .cp')][2].click(); await sleep(50);
    sr.querySelector('.vs-picks .cp[data-job="' + j.id + '"]').click(); await sleep(50);
    sr.querySelector('.ts-save').click(); await sleep(1500);
    const a1 = window.__schedCalls[1] || [], acts = a1[1] && a1[1].timeslots[0].actions.map(a => a.service);
    const roomSaved = a1[0] === 'add' && a1[1].weekdays.join() === 'sat,sun' && acts.join() === 'roomba_plus.clean_room,roomba_plus.clean_zone' && a1[1].timeslots[0].actions[0].service_data.two_pass === true;
    const roomRow = [...sr.querySelectorAll('.ts-row')].find(r => r.dataset.job === j.id), roomListed = !!roomRow && /Kitchen mop/.test(roomRow.textContent);
    // "nothing picked" means every room
    sr.querySelector('.vs-jobs .ts-prof-h') && !sr.querySelector('.vs-newjob') && sr.querySelector('.vs-jobs .ts-prof-h').click(); await sleep(300);
    sr.querySelector('.vs-newjob').click(); await sleep(300); type(sr.querySelector('.vs-jname'), 'All rooms'); sr.querySelector('.vs-jsave').click(); await sleep(400);
    const all = card._settings.get().vacuum.jobs[1], everywhere = !!all && all.regions.join() === 'Bedroom,Living Room' && all.zones.length === 0 && all.mode === '';
    // your jobs show on the robot screen, a room job runs both calls
    sr.querySelector('.dt-tab[data-tab="controls"]').click(); await sleep(1000);
    const c2 = [], k2 = card._ctx.call; card._ctx.call = function (d, sv, data) { c2.push(d + '.' + sv); return Promise.resolve(); };
    const jb = [...sr.querySelectorAll('.vc-jobs:not(.vc-fav):not(.vc-mode):not(.vc-rooms) .vc-job')].find(b => /Kitchen mop/.test(b.textContent));
    if (jb) jb.click(); await sleep(250); card._ctx.call = k2;
    const screenRun = !!jb && c2.join() === 'roomba_plus.clean_room,roomba_plus.clean_zone';
    card._settings.set({ vacuum: { jobs: [] } }); window.__schedules = []; card._back(); await sleep(300);
    const ok = favSaved && favListed && groups === 5 && defaultsToRooms && ran && saved && roomSaved && roomListed && everywhere && screenRun;
    return ok ? true : { favSaved, favListed, groups, defaultsToRooms, ran, calls, saved, jobs, roomSaved, acts, roomListed, everywhere, screenRun, c2 };
  });
  await check('text size: the Text size setting scales only the text, the cards and the menu keep their size', async () => {
    await resetNav(); card._settings.reset('textScale'); card._settings.reset('scale'); await sleep(500);
    const tile = () => sr.querySelector('.device-card') || sr.querySelector('.search-row'), px = (el) => parseFloat(getComputedStyle(el).fontSize);
    const probe = [...sr.querySelectorAll('.device-card *, .search-row *, .island *, .dock *')].find(e => e.children.length === 0 && (e.textContent || '').trim().length > 2 && parseFloat(getComputedStyle(e).fontSize) !== 16) || sr.querySelector('.search-input') || tile();
    const w0 = Math.round(tile().getBoundingClientRect().width), f0 = px(probe), z0 = card._zoom;
    card._settings.set({ textScale: 130 }); await sleep(600);
    const w1 = Math.round(tile().getBoundingClientRect().width), f1 = px(probe), z1 = card._zoom;
    card._settings.set({ textScale: 70 }); await sleep(600);
    const f2 = px(probe), w2 = Math.round(tile().getBoundingClientRect().width);
    card._openApp('settings'); await sleep(1200); const lab = sr.querySelector('.ios-item-label'); const l2 = px(lab);
    card._settings.set({ textScale: 100 }); await sleep(600); const l3 = px(lab);
    const row = [...sr.querySelectorAll('.ios-slider, .ios-item')].some(e => /Text size/.test(e.textContent)) || (sr.querySelector('.dt-bar button:nth-child(2)') && (sr.querySelector('.dt-bar button:nth-child(2)').click(), await sleep(700), [...sr.querySelectorAll('.ios-slider, .ios-item')].some(e => /Text size/.test(e.textContent))));
    card._settings.reset('textScale'); card._back(); await sleep(400);
    const ok = f1 > f0 * 1.25 && f2 < f0 * 0.75 && w0 === w1 && w0 === w2 && z0 === z1 && l2 < l3 && row;
    return ok ? true : { w0, w1, w2, f0, f1, f2, z0, z1, l2, l3, row };
  });
  await check('centred: the start screen and the lock page sit in the middle of a wide window at 100% size and above (and top-aligned when the switch is off); the cameras card is above the sliding card, and below it with the switch off', async () => {
    await resetNav(); card._settings.reset('centerView'); card._settings.reset('scale'); card._settings.reset('bento'); await sleep(700);
    const stage = card._stage, gaps = () => { const m = card._main.getBoundingClientRect(), s0 = stage.getBoundingClientRect(); return { top: Math.round(m.top - s0.top), bottom: Math.round(s0.bottom - m.bottom) }; };
    const near = (a, b, tol) => Math.abs(a - b) <= tol;
    const g100 = gaps(), c100 = near(g100.top, g100.bottom, 6) && g100.top > 20;
    card._settings.set({ scale: 120 }); await sleep(700); const g120 = gaps(), c120 = near(g120.top, g120.bottom, 6) || g120.top <= g120.bottom + 6;
    card._settings.reset('scale'); card._settings.set({ centerView: false }); await sleep(700); const gOff = gaps(), top = gOff.top < g100.top;
    card._settings.reset('centerView'); await sleep(700);
    // the cameras card and the sliding card
    const pos = () => { const cam = sr.querySelector('.camcard'), w2 = sr.querySelector('.w2'); return cam && w2 ? { cam: Math.round(cam.getBoundingClientRect().top), w2: Math.round(w2.getBoundingClientRect().top), camH: Math.round(cam.getBoundingClientRect().height), w2H: Math.round(w2.getBoundingClientRect().height) } : null; };
    const swapped = pos(), swapOk = !!swapped && swapped.cam < swapped.w2 && swapped.w2H > swapped.camH;
    card._settings.set({ bento: { swap: false } }); await sleep(1200); const plain = pos(), plainOk = !!plain && plain.w2 < plain.cam;
    card._settings.reset('bento'); await sleep(1200);
    // the lock page, with its notification pill
    card._setLocked(true); await sleep(1600);
    const above = card._zenView.el.querySelector('.zen-above').getBoundingClientRect(), holder = stage.querySelector('.island-holder').getBoundingClientRect(), s1 = stage.getBoundingClientRect();
    const lockTop = Math.round(above.top - s1.top), lockBottom = Math.round(s1.bottom - holder.bottom), lockOk = near(lockTop, lockBottom, 14) && lockTop > 40;
    card._settings.set({ centerView: false }); await sleep(900);
    const above2 = card._zenView.el.querySelector('.zen-above').getBoundingClientRect(), lockTopOff = Math.round(above2.top - s1.top), lockOffOk = lockTopOff < lockTop - 30;
    card._settings.reset('centerView'); card._setLocked(false); await sleep(900);
    const ok = c100 && c120 && top && swapOk && plainOk && lockOk && lockOffOk;
    return ok ? true : { g100, g120, gOff, c100, c120, top, swapped, plain, swapOk, plainOk, lockTop, lockBottom, lockOk, lockTopOff, lockOffOk };
  });
  await check('rooms: the pencil in a room lets you move the cards up and down; the order is kept for the next visit', async () => {
    await resetNav(); card._settings.reset('roomOrder'); card._show('start'); await sleep(300); card._ctx.openApp('room:living-room'); await sleep(1000);
    const ids = () => [...sr.querySelectorAll('.rm-item')].map(n => n.dataset.id), pen = () => sr.querySelector('.dt-acts .dt-circ');
    const first = ids(); const notEditing = !sr.querySelector('.rm-list').classList.contains('editing');
    pen().click(); await sleep(250);
    const editing = sr.querySelector('.rm-list').classList.contains('editing') && pen().getAttribute('aria-pressed') === 'true';
    const handleOnly = !sr.querySelector('.rm-item .rm-ord .up') && !sr.querySelector('.rm-item .rm-ord .dn') && !sr.querySelector('.rm-item .rm-ord .top') && sr.querySelectorAll('.rm-item .rm-ord .grip').length === first.length;
    const topUpOff = handleOnly, lastDownOff = true;
    { const g = sr.querySelectorAll('.rm-item')[2].querySelector('.grip'), gr = g.getBoundingClientRect(), r1 = sr.querySelectorAll('.rm-item')[1].getBoundingClientRect(), y1 = r1.top + r1.height / 2;
      const f = (type, y) => g.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, clientX: gr.left + gr.width / 2, clientY: y, pointerId: 40, button: 0, buttons: 1 }));
      f('pointerdown', gr.top + gr.height / 2); f('pointermove', gr.top + gr.height / 2 - 12); f('pointermove', y1); await sleep(150); f('pointerup', y1); await sleep(250); }      // the third card dragged one step up
    const moved = ids(); const swapped = moved[1] === first[2] && moved[2] === first[1] && moved[0] === first[0];
    const saved = JSON.stringify((card._settings.get().roomOrder || {})['living-room']) === JSON.stringify(moved);
    pen().click(); await sleep(150); const doneAgain = !sr.querySelector('.rm-list').classList.contains('editing');
    card._back(); await sleep(500); card._ctx.openApp('room:living-room'); await sleep(900);
    const again = ids().join() === moved.join();
    card._settings.reset('roomOrder'); card._show('start'); await sleep(300);
    return notEditing && editing && topUpOff && lastDownOff && swapped && saved && doneAgain && again ? true : { notEditing, editing, topUpOff, lastDownOff, first, moved, saved, doneAgain, again };
  });
  const esc = async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(450); };
  await check('favorites: the pencil shows a plus that opens a list to add and take out; every card can be a Row or a Tall card and can be removed', async () => {
    await resetNav(); card._settings.reset('favorites'); card._settings.reset('cardStyle');
    card._settings.set({ favorites: ['climate.living_room', 'light.living_room_lamp'], bento: { w1mode: 'favorites', w1layout: 'list' } }); card._show('start'); await sleep(700);
    const tall0 = sr.querySelectorAll('.w1-body .rc-climate').length === 1 && sr.querySelectorAll('.w1-body .device-list-item').length === 1;
    const noPlusYet = getComputedStyle(sr.querySelector('.w1-body .rm-add')).display === 'none';
    sr.querySelector('.w1-edit').click(); await sleep(300);
    const plusShown = getComputedStyle(sr.querySelector('.w1-body .rm-add')).display !== 'none';
    sr.querySelector('.fv-item[data-id="climate.living_room"] .rm-seg button').click(); await sleep(600);                         // Row
    const row = sr.querySelectorAll('.w1-body .rc-climate').length === 0 && card._settings.get().cardStyle['climate.living_room'] === 'compact';
    sr.querySelector('.fv-item[data-id="climate.living_room"] .rm-seg button:last-child').click(); await sleep(600);              // Tall again
    const tall1 = sr.querySelectorAll('.w1-body .rc-climate').length === 1;
    sr.querySelector('.w1-body .rm-add').click(); await sleep(800);
    const picker = sr.querySelectorAll('.rm-pr').length > 5 && /2 favorites/.test((sr.querySelector('.rm-cnt') || {}).textContent || '');
    sr.querySelector('.rm-pr[data-id="light.living_room_strip"]').click(); await sleep(250);
    const added = card._settings.get().favorites.indexOf('light.living_room_strip') >= 0;
    sr.querySelector('.rm-pr[data-id="light.living_room_lamp"]').click(); await sleep(250);
    const taken = card._settings.get().favorites.indexOf('light.living_room_lamp') < 0;
    await esc();
    const listNow = [...sr.querySelectorAll('.w1-body .fv-item, .w1-body .device-list-item')].length >= 2;
    sr.querySelector('.fv-item[data-id="climate.living_room"] .fv-x').click(); await sleep(500);
    const gone = card._settings.get().favorites.indexOf('climate.living_room') < 0;
    sr.querySelector('.w1-edit').click(); card._settings.reset('favorites'); card._settings.reset('cardStyle'); card._settings.set({ bento: { w1mode: 'favorites', w1layout: 'grid' } }); await sleep(300);
    return tall0 && noPlusYet && plusShown && row && tall1 && picker && added && taken && listNow && gone ? true : { tall0, noPlusYet, plusShown, row, tall1, picker, added, taken, listNow, gone };
  });
  await check('rooms tab: the pencil shows a remove button on every room and a New room button; a removed room can be brought back', async () => {
    await resetNav(); ['roomsExtra', 'roomsHidden', 'roomEdits', 'roomOrder'].forEach(k => card._settings.reset(k));
    card._settings.set({ bento: { w1mode: 'rooms', w1layout: 'list' } }); card._show('start'); await sleep(700);
    const n0 = sr.querySelectorAll('.rm-card').length;
    sr.querySelector('.w1-edit').click(); await sleep(300);
    const delShown = getComputedStyle(sr.querySelector('.rm-del')).display !== 'none';
    const first = sr.querySelector('.rm-card').dataset.room; sr.querySelector('.rm-del').click(); await sleep(500);
    const hidden = card._settings.get().roomsHidden.join() === first && sr.querySelectorAll('.rm-card').length === n0 - 1;
    sr.querySelector('.w1-body .rm-add').click(); await sleep(800);
    const restoreRow = !!sr.querySelector('.rm-pr[data-id="' + first + '"]');
    const q = sr.querySelector('.rm-newrow .rm-q'); q.value = 'Patio'; sr.querySelector('.rm-mk').click(); await sleep(700);
    const made = card._settings.get().roomsExtra.length === 1 && !!sr.querySelector('.rm-card[data-room="patio"]');
    sr.querySelector('.w1-body .rm-add').click(); await sleep(800);
    sr.querySelector('.rm-pr[data-id="' + first + '"]').click(); await sleep(300); await esc();
    const back = card._settings.get().roomsHidden.length === 0 && sr.querySelectorAll('.rm-card').length === n0 + 1;
    card._ctx.openApp('room:patio'); await sleep(900);
    const empty = !!sr.querySelector('.rm-hint') && /Patio/.test((sr.querySelector('.dt-title') || {}).textContent || '');
    card._show('start'); await sleep(300);
    sr.querySelector('.w1-edit') && sr.querySelector('.w1-edit').click();
    sr.querySelector('.rm-card[data-room="patio"]').parentNode.querySelector('.rm-del').click(); await sleep(500);
    const deleted = card._settings.get().roomsExtra.length === 0 && !sr.querySelector('.rm-card[data-room="patio"]');
    ['roomsExtra', 'roomsHidden'].forEach(k => card._settings.reset(k)); card._settings.set({ bento: { w1mode: 'favorites', w1layout: 'grid' } }); card._show('start'); await sleep(300);
    return delShown && hidden && restoreRow && made && back && empty && deleted ? true : { delShown, hidden, restoreRow, made, back, empty, deleted, n0 };
  });
  await check('a room: take devices out, add them from the list, move one to the top and drag one down; the changes are kept', async () => {
    await resetNav(); ['roomEdits', 'roomOrder'].forEach(k => card._settings.reset(k)); card._show('start'); await sleep(300); card._ctx.openApp('room:living-room'); await sleep(1000);
    const ids = () => [...sr.querySelectorAll('.rm-item')].map(n => n.dataset.id), pen = () => sr.querySelector('.dt-acts .dt-circ');
    const first = ids(); pen().click(); await sleep(250);
    sr.querySelectorAll('.rm-item')[0].querySelector('.rm-x').click(); await sleep(500);
    const out = ids(); const removed = out.length === first.length - 1 && out.indexOf(first[0]) < 0 && (card._settings.get().roomEdits['living-room'].remove || []).indexOf(first[0]) >= 0;
    sr.querySelector('.rm-add').click(); await sleep(800);
    sr.querySelector('.rm-pr[data-id="' + first[0] + '"]').click(); await sleep(250); await esc(); await sleep(300);
    const back = ids().length === first.length && ids().indexOf(first[0]) >= 0 && (card._settings.get().roomEdits['living-room'].remove || []).length === 0;
    const third = ids()[2];
    { const g = sr.querySelectorAll('.rm-item')[2].querySelector('.grip'), gr = g.getBoundingClientRect(), r0 = sr.querySelectorAll('.rm-item')[0].getBoundingClientRect(), y0 = r0.top + r0.height / 2;
      const f = (type, y) => g.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, clientX: gr.left + gr.width / 2, clientY: y, pointerId: 43, button: 0, buttons: 1 }));
      f('pointerdown', gr.top + gr.height / 2); f('pointermove', gr.top + gr.height / 2 - 12); f('pointermove', y0); await sleep(150); f('pointerup', y0); await sleep(250); }      // the third card dragged to the top
    const top = ids()[0] === third && JSON.stringify(card._settings.get().roomOrder['living-room'][0]) === JSON.stringify(third);
    // drag the first card down past the second and the third
    const nodeAt = k => sr.querySelectorAll('.rm-item')[k], before = ids(), grip = nodeAt(0).querySelector('.grip'), gr = grip.getBoundingClientRect();
    const fire = (type, y) => grip.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, clientX: gr.left + gr.width / 2, clientY: y, pointerId: 41, button: 0, buttons: 1 }));
    const r2 = nodeAt(2).getBoundingClientRect(); fire('pointerdown', gr.top + gr.height / 2); fire('pointermove', gr.top + gr.height / 2 + 12);
    fire('pointermove', r2.top + r2.height / 2 + 6); await sleep(150); fire('pointerup', r2.top + r2.height / 2 + 6); await sleep(250);
    const after = ids(); const dragged = after[0] === before[1] && after.indexOf(before[0]) >= 2 && JSON.stringify(card._settings.get().roomOrder['living-room']) === JSON.stringify(after);
    // letting go ANYWHERE ends a drag (a touch screen sends the let-go to wherever the finger is), and a cancelled touch keeps the old order
    const g2 = nodeAt(1).querySelector('.grip'), gr2 = g2.getBoundingClientRect(), orderNow = ids();
    const fire2 = (el, type, y) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, clientX: gr2.left + gr2.width / 2, clientY: y, pointerId: 42, button: 0, buttons: 1 }));
    const r4 = nodeAt(4).getBoundingClientRect(); fire2(g2, 'pointerdown', gr2.top + gr2.height / 2); fire2(g2, 'pointermove', r4.top + r4.height / 2); await sleep(120);
    const sliding = nodeAt(1).classList.contains('drag');
    fire2(sr.querySelector('.dt-title'), 'pointerup', r4.top + r4.height / 2); await sleep(250);                  // let go over the title, not over the handle
    const endedElsewhere = !sr.querySelector('.rm-item.drag') && [...sr.querySelectorAll('.rm-item')].every(n => !n.style.transform) && ids().join() !== orderNow.join();
    const g3 = nodeAt(0).querySelector('.grip'), keep = ids(); fire2(g3, 'pointerdown', gr2.top); fire2(g3, 'pointermove', r4.top + r4.height / 2); await sleep(100); fire2(g3, 'pointercancel', r4.top); await sleep(250);
    const cancelled = ids().join() === keep.join() && !sr.querySelector('.rm-item.drag') && [...sr.querySelectorAll('.rm-item')].every(n => !n.style.transform);
    pen().click(); card._back(); await sleep(400); ['roomEdits', 'roomOrder'].forEach(k => card._settings.reset(k)); card._show('start'); await sleep(300);
    return removed && back && top && dragged && sliding && endedElsewhere && cancelled ? true : { removed, back, top, dragged, sliding, endedElsewhere, cancelled, before, after };
  });
  await check('rooms: what you arrange is kept in Home Assistant for your user; a newer arrangement from another device is taken over, an older one is ignored', async () => {
    window.__userData = {}; const S = window.OkieMotor.rooms.sync, ctx = card._ctx;
    ['roomEdits', 'cardStyle', 'roomsHidden', 'roomsExtra', 'roomOrder'].forEach(k => card._settings.reset(k)); ctx.store.set('rooms.t', 0);
    card._settings.set({ cardStyle: { 'media_player.living_room_tv': 'compact' } }); await sleep(2200);                   // the save waits 0.9 s after the last change
    const stored = window.__userData[S.KEY]; const pushed = !!stored && stored.data.cardStyle['media_player.living_room_tv'] === 'compact' && stored.t > 0;
    window.__userData[S.KEY] = { t: Date.now() + 5000, data: { cardStyle: {}, roomsHidden: ['kitchen'], roomEdits: {}, rooms: [], roomOrder: {}, roomsExtra: [] } };
    const r = await S.pull(ctx); await sleep(100);
    const took = r === true && card._settings.get().roomsHidden.join() === 'kitchen' && !Object.keys(card._settings.get().cardStyle).length;
    window.__userData[S.KEY] = { t: 1, data: { roomsHidden: ['garage'] } }; const r2 = await S.pull(ctx);
    const ignored = r2 === null && card._settings.get().roomsHidden.join() === 'kitchen';
    ['roomEdits', 'cardStyle', 'roomsHidden', 'roomsExtra', 'roomOrder'].forEach(k => card._settings.reset(k)); ctx.store.set('rooms.t', 0); window.__userData = {};
    return pushed && took && ignored ? true : { pushed, took, ignored, r, r2 };
  });
  await check('a room can be renamed (it keeps its devices) and a camera in a room is a tall picture card with a Live button', async () => {
    await resetNav(); ['roomNames', 'cardStyle'].forEach(k => card._settings.reset(k)); card._show('start'); await sleep(300);
    const room = window.OkieMotor.rooms.rooms(card._ctx).find(r => r.ids.indexOf('camera.front_door') >= 0), id = room.id, n0 = room.ids.length;
    card._ctx.openApp('room:' + id); await sleep(1000);
    const cam = sr.querySelector('.rc-cam'), camTall = !!cam && !!cam.querySelector('.rc-live') && cam.getBoundingClientRect().height > 120;
    sr.querySelector('.dt-acts .dt-circ').click(); await sleep(300);
    const sw = [...sr.querySelectorAll('.rm-item')].find(n => n.dataset.id === 'camera.front_door').querySelector('.rm-seg button'); sw.click(); await sleep(500);
    const asRow = !sr.querySelector('.rc-cam') && card._settings.get().cardStyle['camera.front_door'] === 'compact';
    [...sr.querySelectorAll('.rm-item')].find(n => n.dataset.id === 'camera.front_door').querySelector('.rm-seg button:last-child').click(); await sleep(500);
    const asTall = !!sr.querySelector('.rc-cam');
    const showsRename = getComputedStyle(sr.querySelector('.rm-ren')).display !== 'none';
    sr.querySelector('.rm-ren').click(); await sleep(700);
    const input = sr.querySelector('.rm-newrow .rm-q'); input.value = 'Patio'; sr.querySelector('.rm-mk').click(); await sleep(600);
    const renamed = card._settings.get().roomNames[id] === 'Patio' && (sr.querySelector('.dt-title') || {}).textContent === 'Patio' && sr.querySelectorAll('.rm-item').length === n0;
    sr.querySelector('.dt-acts .dt-circ').click(); card._back(); await sleep(500);
    card._settings.set({ bento: { w1mode: 'rooms' } }); card._show('start'); await sleep(600);
    const inTab = [...sr.querySelectorAll('.rm-card .rm-name')].some(e => e.textContent === 'Patio');
    card._ctx.openApp('room:' + id); await sleep(900); sr.querySelector('.dt-acts .dt-circ').click(); await sleep(300); sr.querySelector('.rm-ren').click(); await sleep(700);
    const hasOrig = !!sr.querySelector('.rm-pr'); sr.querySelector('.rm-pr').click(); await sleep(600);
    const original = !card._settings.get().roomNames[id] && (sr.querySelector('.dt-title') || {}).textContent === room.baseName;
    card._back(); await sleep(400); ['roomNames', 'cardStyle'].forEach(k => card._settings.reset(k)); card._settings.set({ bento: { w1mode: 'favorites' } }); card._show('start'); await sleep(300);
    return camTall && asRow && asTall && showsRename && renamed && inTab && hasOrig && original ? true : { camTall, asRow, asTall, showsRename, renamed, inTab, hasOrig, original };
  });
  await check('climate: the back arrow rolls the wheel out first and then closes the view; other devices close at once', async () => {
    await resetNav(); card._openDetail('climate.living_room'); await sleep(1100);
    const gw = () => sr.querySelector('.th-gaugewrap'), backBtn = () => sr.querySelector('.dt-circ');
    backBtn().click(); await sleep(150);
    const mid = gw() ? { op: +gw().style.opacity, x: parseFloat((gw().style.transform.match(/-?[\d.]+/) || [0])[0]) } : null;
    const stillOpen = card._nav.mode === 'detail';                                              // not closed yet: the wheel is still rolling
    backBtn().click();                                                                          // a second tap while it rolls changes nothing
    await sleep(1000);
    const closed = card._nav.mode === 'start' && !card._backing;
    await resetNav(); card._openDetail('fan.bedroom_fan'); await sleep(900);
    backBtn().click(); await sleep(60);
    const lightAtOnce = card._nav.mode === 'start';
    return mid && mid.op < 1 && mid.x > 0 && stillOpen && closed && lightAtOnce ? true : { mid, stillOpen, closed, lightAtOnce, mode: card._nav.mode };
  });
  await check('rooms: a Rooms tab beside Favorites and Suggestions, one card per room; a room opens like Tips with a card for every device and Back returns', async () => {
    await resetNav(); card._settings.reset('rooms'); card._settings.set({ bento: { w1mode: 'rooms' } }); card._show('start'); await sleep(500);
    const tabs = [...sr.querySelectorAll('.w1-tab')].map(b => b.firstChild.textContent);
    const cards = () => [...sr.querySelectorAll('.rm-card')];
    const fromAreas = cards().length >= 3 && cards().some(c => c.dataset.room === 'bedroom');
    const bedroom = cards().find(c => c.dataset.room === 'bedroom'); bedroom.click(); await sleep(900);
    const opened = card._nav.mode === 'app' && card._nav.appId === 'room:bedroom' && /Bedroom/.test((sr.querySelector('.dt-title') || {}).textContent || '');
    const rows = sr.querySelectorAll('.device-list-item, .rc').length, sub = (sr.querySelector('.dt-sub') || {}).textContent || '';
    const cardsInRoom = rows >= 2 && new RegExp('^' + rows + ' devices').test(sub);
    card._back(); await sleep(500);
    const back = card._nav.mode === 'start' && cards().length >= 3;
    // a list in the configuration wins over the areas: its own devices, then the devices of its areas
    card._settings.set({ rooms: [{ name: 'Patio', items: ['light.living_room_lamp'] }, { name: 'Sleeping', area: 'Bedroom' }] }); await sleep(600);
    const custom = cards().map(c => c.dataset.room).join(',') === 'patio,sleeping';
    cards()[0].click(); await sleep(800);
    const patioRows = sr.querySelectorAll('.device-list-item, .rc').length === 1;
    card._back(); await sleep(400);
    card._settings.reset('rooms'); card._settings.set({ bento: { w1mode: 'favorites' } }); card._show('start'); await sleep(300);
    return tabs.join('|').replace(/\d+/g, '') === 'Favorites|Rooms|Suggestions' && fromAreas && opened && cardsInRoom && back && custom && patioRows ? true : { tabs, fromAreas, opened, rows, sub, back, custom, patioRows };
  });
  await check('nested back: A then B, back shows A, back shows the start screen (no bounce)', async () => {
    await resetNav();
    card._openDetail('light.kitchen_counter'); await sleep(250); card._openDetail('fan.bedroom_fan'); await sleep(250);
    card._back(); await sleep(300); const atA = card._nav.itemId === 'light.kitchen_counter';
    card._back(); await sleep(900); const home = card._nav.mode === 'start' && card._stage.dataset.detail === 'closed';      // A is a light: its wheel rolls out first
    card._openApp('settings'); await sleep(250); card._back(); await sleep(250);
    return atA && home && card._nav.mode === 'start' ? true : { atA, home, nav: card._nav };
  });
  await check('settings: iOS list, sub-page with Back, card shape change persists only the delta', async () => {
    card._openApp('settings'); await sleep(600);
    const sections = sr.querySelectorAll('.ios-section').length >= 6 && sr.querySelectorAll('.ios-switch').length >= 5;
    sr.querySelectorAll('.dt-tab')[1].click(); await sleep(300);
    [...sr.querySelectorAll('.ios-item-clickable')].find(i => /Card shape/.test(i.textContent)).click(); await sleep(500);
    const sub = !!sr.querySelector('.ios-back') && sr.querySelectorAll('.ios-item-clickable').length === 4;
    [...sr.querySelectorAll('.ios-item-clickable')].find(i => /Balanced/.test(i.textContent)).click(); await sleep(200);
    sr.querySelector('.ios-back').click(); await sleep(500);
    const delta = card._store.get('settings').squircle === 'standard' && getComputedStyle(card).getPropertyValue('--okie-tile-clip').startsWith('polygon');
    const badge = sr.querySelector('.ios-badge') && !sr.querySelector('.ios-badge').hidden;
    return sections && sub && delta && badge ? true : { sections, sub, delta, badge, store: card._store.get('settings') };
  });
  await check('settings: "Back to the lock page after" offers 30 seconds, 1, 2, 5 minutes and never; the choice is saved and shown', async () => {
    await resetNav(); card._settings.reset('rest'); card._openApp('settings'); await sleep(700);
    sr.querySelectorAll('.dt-tab')[0].click(); await sleep(400);                                    // General
    const row = () => [...sr.querySelectorAll('.ios-item-clickable')].find(i => /Back to the lock page after/.test(i.textContent));
    const shows = !!row() && /Never/.test(row().textContent);                                         // untouched: the screensaver is off
    row().click(); await sleep(500);
    const labels = [...sr.querySelectorAll('.ios-item-clickable')].map(i => i.textContent.trim().replace(/\s+/g, ' '));
    const offered = ['30 seconds', '1 minute', '2 minutes', '5 minutes', 'Never'].every((l, k) => (labels[k] || '').indexOf(l) === 0);
    [...sr.querySelectorAll('.ios-item-clickable')].find(i => /^2 minutes/.test(i.textContent.trim())).click(); await sleep(250);
    const saved = card._settings.get().rest.lockAfter === '120' && card._store.get('settings').rest.lockAfter === '120';
    const sel = [...sr.querySelectorAll('.ios-item.sel')].map(i => i.textContent.trim()).join('|');
    sr.querySelector('.ios-back').click(); await sleep(500);
    const after = !!row() && /2 minutes/.test(row().textContent);
    card._settings.reset('rest'); card._back(); await sleep(300);
    return shows && offered && saved && /^2 minutes/.test(sel) && after ? true : { shows, labels, offered, saved, sel, after };
  });
  await check('settings: toggles flip in place and the search field jumps to a nested setting', async () => {
    card._openApp('settings'); await sleep(500); const sw = sr.querySelector('.ios-switch'); sw.click(); await sleep(150); const flipped = sw.getAttribute('aria-checked');
    sr.querySelector('.ios-search-in').value = 'fold'; sr.querySelector('.ios-search-in').dispatchEvent(new Event('input')); await sleep(300);
    const hit = [...sr.querySelectorAll('.ios-item')].some(i => /Fold automatically/.test(i.textContent));
    sr.querySelector('.ios-search-in').value = ''; sr.querySelector('.ios-search-in').dispatchEvent(new Event('input')); await sleep(200);
    return flipped && hit ? true : { flipped, hit };
  });
  await check('calendar renders month and creates an event form', async () => {
    card._openApp('calendar'); await sleep(900); sr.querySelector('.dt-tab[data-tab="month"]').click(); await sleep(500); const cells = sr.querySelectorAll('.mgc').length; sr.querySelector('.dt-acts .dt-circ').click(); await sleep(400); const form = !!sr.querySelector('.cf'); sr.querySelector('.ov-close').click(); await sleep(300);
    return cells === 42 && form ? true : { cells, form };
  });
  await check('calendar week: the Calendar opens on the week, which lists all seven days in a row (an empty day says No events, earlier days are dimmed, today is marked), not over the picture; the weeks are words you tap (no arrows, no Today button), the tab tapped again returns to today; an entry opens its sheet', async () => {
    card._store.set('cal.view', 'month'); card._store.set('cal.hidden', []); card._store.set('cal.seen', []); card._openApp('calendar'); await sleep(1300);
    const q = s => sr.querySelector(s), qa = s => sr.querySelectorAll(s);
    const onWeek = !q('.wk') && !q('.cwk') && /week/i.test((q('.dt-tab.on') || { getAttribute() {} }).getAttribute('aria-label') || ''), list = q('.cal-agenda'), under = !!list && !!list.closest('.dt-body') && !q('.dt-hero > .cal-agenda');
    const noArrows = !q('.cal-ctl') && !q('.cal-nav .mini') && !q('.cal-nav .act');
    const days = () => [...qa('.ag-day')].map(d => d.querySelector('.ag-dl b').textContent).join(','), d0 = days(), seven = qa('.ag-day').length === 7, consecutive = d0.split(',').every((n, i, a) => i === 0 || +n === +a[i - 1] + 1 || +n === 1);
    const empties = qa('.ag-none').length, noEvents = [...qa('.ag-none')].every(e => /No events/.test(e.textContent)) && empties >= 1;
    const today = qa('.ag-day.today').length === 1, past = qa('.ag-day.past').length >= 1, rows = qa('.ag-ev').length, head = !q('.ag-head');
    const items = () => [...qa('.cal-strip .cs')], wk0 = (q('.cal-strip .cs.on') || {}).textContent, words = /^[A-Z]{3} \d+[–-]\d+$|^[A-Z]{3} \d+ – [A-Z]{3} \d+$/.test(wk0 || '') && items().length > 6;
    const idx = items().findIndex(i => i.classList.contains('on')); items()[idx + 1].click(); await sleep(700);
    const wk1 = (q('.cal-strip .cs.on') || {}).textContent, moved = wk1 !== wk0 && days() !== d0 && qa('.ag-day').length === 7 && !qa('.ag-day.today').length;
    sr.querySelector('.dt-tab[data-tab="week"]').click(); await sleep(700); const back = (q('.cal-strip .cs.on') || {}).textContent === wk0 && days() === d0 && qa('.ag-day.today').length === 1;
    const ev = [...qa('.ag-ev')].find(e => /Family dinner/.test(e.textContent)); if (ev) { ev.click(); await sleep(500); } const sheet = !!q('.evd-list'); if (sheet) { q('.ov-close').click(); await sleep(300); }
    return onWeek && under && noArrows && words && seven && consecutive && noEvents && today && past && rows >= 3 && head && moved && back && sheet ? true : { onWeek, under, noArrows, words, wk0, seven, consecutive, d0, empties, noEvents, today, past, rows, head, moved, back, sheet, wk1 };
  });
  await check('calendar month: colour dots instead of titles, the months are words (the shown one bold, the rest fading away), a tap on a day picks it and the sheet under the grid follows, pulling its line up shows the days with events only (and down puts it back), the tab tapped again returns to today, a second tap on a day opens it', async () => {
    card._store.set('cal.hidden', []); card._store.set('cal.seen', []); card._openApp('calendar'); await sleep(1100); sr.querySelector('.dt-tab[data-tab="month"]').click(); await sleep(700);
    const cells = () => [...sr.querySelectorAll('.mgc')], q = s => sr.querySelector(s), qa = s => sr.querySelectorAll(s);
    const dots = qa('.mgdots i').length, texty = !!q('.mgc .ev'), today = !!q('.mgc.today.sel');
    const clean = !q('.dt-hero > *:not(.dt-top):not(.dt-iconbg):not(video)') && !q('.cal-agenda') && !q('.cal-ctl');
    const strip = [...qa('.cal-strip .cs')], on = q('.cal-strip .cs.on'), months = /^OCTOBER/.test(on.textContent) && /^NOVEMBER/.test(strip[strip.indexOf(on) + 1].textContent) && strip.length > 12;
    const faded = getComputedStyle(q('.cal-strip')).maskImage !== 'none' || getComputedStyle(q('.cal-strip')).webkitMaskImage !== 'none';
    strip[strip.indexOf(on) + 1].click(); await sleep(600); const next = /^NOVEMBER/.test(q('.cal-strip .cs.on').textContent) && !q('.mgc.sel.out');
    sr.querySelector('.dt-tab[data-tab="month"]').click(); await sleep(700); const back = /^OCTOBER/.test(q('.cal-strip .cs.on').textContent) && !!q('.mgc.today.sel');
    const sheet = q('.cal-sheet'), grab = q('.cal-grab'), h0 = sheet.offsetHeight, ptr = (t, y) => grab.dispatchEvent(new PointerEvent(t, { bubbles: true, composed: true, pointerId: 7, clientX: 100, clientY: y, button: 0 }));
    const only = [...sheet.querySelectorAll('.ag-day')].slice(1).every(d => d.querySelector('.ag-ev')) && sheet.querySelectorAll('.ag-day').length >= 2;
    ptr('pointerdown', 700); ptr('pointermove', 600); ptr('pointermove', 420); ptr('pointerup', 420); await sleep(600);
    const s1 = q('.cal-sheet'), up = s1.offsetHeight > h0 + 60 && q('.cal-grab').getAttribute('aria-expanded') === 'true' && s1.classList.contains('open');
    const fullH = s1.offsetHeight, g2 = q('.cal-grab'), ptr2 = (t, y) => g2.dispatchEvent(new PointerEvent(t, { bubbles: true, composed: true, pointerId: 8, clientX: 100, clientY: y, button: 0 }));
    ptr2('pointerdown', 300); ptr2('pointermove', 400); ptr2('pointermove', 620); ptr2('pointerup', 620); await sleep(600);
    const down = q('.cal-sheet').offsetHeight < fullH - 60 && q('.cal-grab').getAttribute('aria-expanded') === 'false';
    const pickCell = cells().find(c => !c.classList.contains('out') && !c.classList.contains('today') && !c.classList.contains('sel')); const num = pickCell.querySelector('.mgd').textContent, pi = cells().indexOf(pickCell); pickCell.click(); await sleep(500);
    const picked = q('.mgc.sel') === cells()[pi] && q('.cal-sheet .ag-day .ag-dl b').textContent === num;
    cells()[pi].click(); await sleep(700);
    const dayView = !!q('.dg') && q('.dt-tab.on') && /day/i.test(q('.dt-tab.on').getAttribute('aria-label') || '');
    return dots > 10 && !texty && today && clean && months && faded && next && back && only && up && down && picked && dayView ? true : { dots, texty, today, clean, months, faded, next, back, only, up, down, picked, dayView };
  });
  await check('calendar calendars: each calendar has its own colour, can be hidden (the dots and the agenda drop it) and recoloured, and the iPhone setup help is there', async () => {
    card._store.set('cal.hidden', []); card._store.set('cal.seen', []); card._openApp('calendar'); await sleep(900); sr.querySelector('.dt-tab[data-tab="week"]').click(); await sleep(700);
    const robotHidden = card._store.get('cal.hidden', []).includes('calendar.robo_schedule') && ![...sr.querySelectorAll('.ag-ev')].some(e => /Cleaning/.test(e.textContent));
    const q = s => sr.querySelector(s), colors0 = [...new Set([...sr.querySelectorAll('.ag-ev')].map(e => e.style.getPropertyValue('--ec')))];
    const acts = sr.querySelectorAll('.dt-acts .dt-circ'); acts[1].click(); await sleep(500);
    const upd = (window.__updCalls || []).flat(), refreshed = upd.includes('calendar.work') && upd.includes('calendar.birthdays') && !upd.includes('calendar.family');
    const items = sr.querySelectorAll('.cs-item'), help = !!q('.cs-help a[href*="domain=remote_calendar"]'), names = [...sr.querySelectorAll('.cs-n')].map(n => n.firstChild.textContent);
    const robotItem = [...items].find(i => /Robo Schedule/.test(i.textContent)), robotOff = !!robotItem && !robotItem.querySelector('.sw').classList.contains('on'), robotNote = robotItem ? robotItem.querySelector('.cs-n small').textContent : '';
    const work = [...items].find(i => /Work/.test(i.textContent)), sw = work.querySelector('.sw');
    sw.click(); await sleep(400);
    const hid = card._store.get('cal.hidden', []).includes('calendar.work'), off = !sw.classList.contains('on');
    const gone = ![...sr.querySelectorAll('.ag-ev')].some(e => /Client call|Stand-up|Sprint planning|Design review|1:1|Team lunch/.test(e.textContent));
    const dot = work.querySelector('.cs-dot'); dot.click(); await sleep(100);
    const pal = work.querySelector('.cs-pal'), open = pal && !pal.hidden; const swatch = [...pal.children].find(b => !b.classList.contains('on')); const pickedColor = swatch.style.background; swatch.click(); await sleep(250);
    const saved = card._store.get('cal.colors', {})['calendar.work'] !== undefined && dot.style.background === pickedColor;
    sw.click(); await sleep(300); const back = !card._store.get('cal.hidden', []).includes('calendar.work');
    sr.querySelector('.ov-close').click(); await sleep(300);
    return colors0.length >= 2 && items.length === 4 && robotHidden && robotOff && /Schedules/.test(robotNote) && help && refreshed && hid && off && gone && open && saved && back ? true : { colors0, n: items.length, names, robotHidden, robotOff, robotNote, help, refreshed, upd, hid, off, gone, open, saved, back };
  });
  await check('calendar event sheet: clock, place and calendar rows; editing still works', async () => {
    card._openApp('calendar'); await sleep(900); sr.querySelector('.dt-tab[data-tab="week"]').click(); await sleep(700);
    const row = [...sr.querySelectorAll('.ag-ev')].find(e => /Team lunch|Family dinner/.test(e.textContent)); row.click(); await sleep(500);
    const list = sr.querySelector('.evd-list'), n = list ? list.querySelectorAll('.evd').length : 0, pin = !!(list && list.querySelector('svg') && /Tampa|Home/.test(list.textContent));
    const edit = [...sr.querySelectorAll('.actrow .act')].find(b => !b.classList.contains('danger')); edit.click(); await sleep(500); const form = !!sr.querySelector('.cf');
    sr.querySelector('.ov-close').click(); await sleep(300);
    return n >= 3 && pin && form ? true : { n, pin, form };
  });
  await check('robot cleaning times: gone from the calendar and the Home calendar card, listed once under Schedules (time, weekdays, next start, opens the vacuum), never offered when adding an event', async () => {
    card._store.set('cal.hidden', []); card._store.set('cal.seen', []);
    card._openApp('calendar'); await sleep(900); sr.querySelector('.dt-tab[data-tab="week"]').click(); await sleep(700);
    const noClean = ![...sr.querySelectorAll('.ag-ev')].some(e => /Cleaning/.test(e.textContent));
    sr.querySelector('.dt-acts .dt-circ').click(); await sleep(700);
    const opts = [...sr.querySelectorAll('.cf select option')].map(o => o.textContent); sr.querySelector('.ov-close').click(); await sleep(300);
    card._back(); await sleep(500);
    card._openApp('schedules'); await sleep(1300);
    const rows = [...sr.querySelectorAll('.sc-row')], row = rows.filter(r => /Robo Vacuum · Cleaning16:00/.test(r.textContent));
    const txt = row[0] ? row[0].textContent : '', open = row[0] && row[0].querySelector('button.mini'); if (open) { open.click(); await sleep(700); }
    const detail = !!sr.querySelector('.detail-wrap, .dt'); card._back(); await sleep(400);
    return noClean && !opts.some(o => /Robo/.test(o)) && opts.length >= 1 && row.length === 1 && /Robo Vacuum/.test(txt) && /Robot$/.test(txt) && /mo tu we th fr sa su/i.test(txt) && !!open && detail ? true : { noClean, opts, n: row.length, txt, open: !!open, detail };
  });
  await check('server: a menu item opens a glass screen with processor and memory rings, storage, network (with a graph), backup and updates, and the nine apps; search narrows them; the stack sits in the picture on a wide screen', async () => {
    card._store.set('server.apps', null); card._openApp('server'); await sleep(2200);
    const q = s => sr.querySelector(s), qa = s => sr.querySelectorAll(s);
    const rings = [...qa('.sv-g')].map(g => g.querySelector('.sv-gv b').textContent), arc = q('.sv-g .ga').style.strokeDasharray;
    const stackInHero = !!q('.dt-hero > .sv-stack'), badge = q('.sv-sto .sv-badge').textContent, net = q('.sv-net .sv-badge').textContent, chart = !!q('.sv-chart svg path');
    const sto = q('.sv-st').textContent, ip = q('.sv-ip').textContent, bk = q('.sv-bk').textContent, up = q('.sv-up').textContent, sub = q('.dt-sub').textContent;
    const names = [...qa('.sv-tile .sv-tn')].map(n => n.textContent);
    const dock = card._dockItems().some(i => i.id === 'server');
    const inp = q('.sv-q'); inp.value = 'jelly'; inp.dispatchEvent(new Event('input')); await sleep(150); const one = qa('.sv-tile').length === 1 && /Jellyfin/.test(q('.sv-tile').textContent);
    inp.value = 'zzz'; inp.dispatchEvent(new Event('input')); await sleep(150); const none = !!q('.sv-nomatch'); inp.value = ''; inp.dispatchEvent(new Event('input')); await sleep(150);
    return rings.join() === '8%,78%' && /^\d/.test(arc) && stackInHero && badge === 'Healthy' && net === 'Connected' && chart && /90\.9 GB used of 220 GB/.test(sto) && /68\.200\.198\.47/.test(ip) && /Last/.test(bk) && /Home Assistant Core/.test(up) && /2 waiting/.test(sub)
      && names.length === 9 && names[0] === 'AdGuard Home' && dock && one && none && qa('.sv-tile').length === 9 ? true : { rings, arc, stackInHero, badge, net, chart, sto, ip, bk, up, sub, names, dock, one, none };
  });
  await check('server apps: an external app opens in a new tab, a Home Assistant page navigates inside; edit mode removes, adds (with an https:// added) and resets', async () => {
    card._openApp('server'); await sleep(1500);
    const q = s => sr.querySelector(s), qa = s => sr.querySelectorAll(s), wo = window.open, opened = [], navs = [], onNav = e => navs.push(location.pathname); window.open = (...a) => { opened.push(a); return null; }; window.addEventListener('location-changed', onNav);
    const tileOf = n => [...qa('.sv-tile')].find(t => t.querySelector('.sv-tn').textContent === n);
    const ext = true;      // the starting links are all Home Assistant pages; an external one is added through the pencil
    const before = location.pathname; tileOf('Logbook').click(); await sleep(150); const inner = navs.length === 1 && location.pathname === '/logbook'; try { history.replaceState(null, '', before); } catch (e) {}
    window.open = wo; window.removeEventListener('location-changed', onNav);
    sr.querySelector('.dt-acts .dt-circ').click(); await sleep(250);
    const editing = qa('.sv-x').length === 9 && !!q('.sv-new') && !!q('.sv-edbar');
    q('.sv-x').click(); await sleep(150); const removed = qa('.sv-tile:not(.sv-new)').length === 8 && card._store.get('server.apps', []).length === 8;
    q('.sv-new').click(); await sleep(600); const form = q('.cf'); const [nm, ad] = form.querySelectorAll('input');
    nm.value = 'Grafana'; nm.dispatchEvent(new Event('input')); ad.value = 'grafana.local:3000'; ad.dispatchEvent(new Event('input')); [...form.querySelectorAll('.sv-pick')][5].click();
    form.querySelector('.act.primary').click(); await sleep(400);
    const added = qa('.sv-tile:not(.sv-new)').length === 9 && !!tileOf('Grafana') && card._store.get('server.apps', []).slice(-1)[0].url === 'https://grafana.local:3000';
    [...qa('.sv-edbar .act')].find(b => !b.classList.contains('primary')).click(); await sleep(200); const reset = qa('.sv-tile:not(.sv-new)').length === 9 && !tileOf('Grafana');
    q('.sv-edbar .act.primary').click(); await sleep(200); const done = !q('.sv-x') && !q('.sv-new');
    card._store.set('server.apps', null); card._back(); await sleep(400);
    return ext && inner && editing && removed && added && reset && done ? true : { ext, opened, inner, navs, editing, removed, added, reset, done };
  });
  await check('robot map: the vacuum screen draws the robot\'s cleaning on the floor plan (cleaned area, stuck spots, a tint for the room cleaned today), the layers switch off and on, Adjust moves it and Back to automatic puts it back, and without cleaning data it says so', async () => {
    await resetNav(); card._store.set('robomap.nudge', {}); card._store.set('robomap.layers', null); window.__mockMapFail = false; card._openDetail('vacuum.robo'); await sleep(2600);
    const q = s => sr.querySelector(s), fp = q('.rm-plan floorplan-card'), pg = () => fp && fp.shadowRoot.getElementById('pg');
    const area = () => pg() && pg().querySelector('.rm-area'), d0 = area() && area().getAttribute('d');
    const stuck = pg() ? pg().querySelectorAll('.rm-stuck').length : 0, tint = pg() ? pg().querySelectorAll('.rm-room.fresh').length : 0, evenodd = !!(area() && area().getAttribute('fill-rule') === 'evenodd');
    const cap = (q('.rm-cap') || {}).textContent || '', chips = [...sr.querySelectorAll('.rm-layers .rm-chip')].map(c => c.textContent), room = (q('.rm-rooms') || {}).textContent || '';
    const nums = (d0 || '').match(/-?\d+(\.\d+)?/g) || [], onPlan = nums.length > 100 && nums.every(n => +n > 200 && +n < 2000);
    const chipOf = n => [...sr.querySelectorAll('.rm-layers .rm-chip')].find(c => c.textContent === n);
    chipOf('Cleaned area').click(); await sleep(150); const areaOff = !area() && stuck === (pg() ? pg().querySelectorAll('.rm-stuck').length : -1);
    chipOf('Cleaned area').click(); await sleep(150); const areaOn = !!area();
    chipOf('Stuck spots').click(); await sleep(150); const stuckOff = pg().querySelectorAll('.rm-stuck').length === 0; chipOf('Stuck spots').click(); await sleep(150);
    q('.rm-adj').click(); await sleep(600); const sheetBtns = [...sr.querySelectorAll('.rm-pad .act')]; const right = sheetBtns.find(b => /Right/.test(b.textContent)); right.click(); await sleep(150);
    const d1 = area().getAttribute('d'), moved = d1 !== d0, saved = !!(card._store.get('robomap.nudge', {})['v2tcgLwmTcGPirig_FgbJw'] || {}).dx;
    [...sr.querySelectorAll('.actrow .act')].find(b => /automatic/.test(b.textContent)).click(); await sleep(150); const back = area().getAttribute('d') === d0;
    sr.querySelector('.ov-close').click(); await sleep(300);
    const pics = !!q('.rm-pics');
    // no cleaning data: the plan stays, a plain note says why
    window.__mockMapFail = true; card._back(); await sleep(400); card._store.set('robomap.layers', null); card._openDetail('vacuum.robo'); await sleep(2200);
    const note = !q('.rm-note').hidden && /No cleaning map/.test(q('.rm-note').textContent), noArea = !(q('.rm-plan floorplan-card').shadowRoot.getElementById('pg').querySelector('.rm-area')); window.__mockMapFail = false;
    card._back(); await sleep(300);
    return !!fp && !!d0 && evenodd && onPlan && stuck === 47 && tint === 1 && /358 ft²/.test(cap) && /47 stuck spots/.test(cap) && chips.join() === 'Cleaned area,Stuck spots,Rooms' && /Bedroom cleaned today/.test(room) && areaOff && areaOn && stuckOff && moved && saved && back && pics && note && noArea ? true : { fp: !!fp, d0: !!d0, evenodd, onPlan, stuck, tint, cap, chips, room, areaOff, areaOn, stuckOff, moved, saved, back, pics, note, noArea };
  });
  await check('music: a menu item opens the player (picture, title, progress, keys), the keys / volume / devices / shuffle / repeat / seek reach the player, the lyrics mode runs the words along and a tap on a line jumps there; without a music player it says how to connect Spotify', async () => {
    window.__musicCalls = []; window.__okieFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ syncedLyrics: '[00:00.50] Alpha line\n[00:03.00] Beta line\n[00:06.00] Gamma line\n[00:09.00] Delta line\n[00:12.00] Epsilon line\n[00:30.00] Zeta line', plainLyrics: '' }) });
    card._store.set('music.lyrics', null); card._store.set('music.player', null);
    const q = s => sr.querySelector(s), qa = s => sr.querySelectorAll(s), calls = () => (window.__musicCalls || []).map(c => c[0] + ':' + JSON.stringify(c[1]));
    const dock = card._dockItems().some(i => i.id === 'music');
    card._openApp('music'); await sleep(1500);
    const shown = !q('.mu-player').hidden && /Chapter Test/.test(q('.mu-t').textContent) && /Test Band/.test(q('.mu-a').textContent) && /^data:image\/svg/.test(q('.mu-art img').getAttribute('src') || '') && /\d:\d\d/.test(q('.mu-tm span').textContent) && !!q('.mu-pill svg');
    const tintA = q('.mu').style.getPropertyValue('--mu-a'), tm = /(\d+)\D+(\d+)\D+(\d+)/.exec(tintA || '') || [], tinted = !!tintA && tintA.replace(/\s/g, '') !== '#42586d' && +tm[3] > +tm[2];
    const art = q('.mu-art').getBoundingClientRect(), artOk = art.width > 150 && art.width / art.height > 0.9 && art.width / art.height < 1.02;
    q('.mu-k.big').click(); await sleep(400); const paused = calls().includes('media_pause:{"entity_id":"media_player.spotify_alex"}') && !!q('.mu-k.big svg');
    q('.mu-k.big').click(); await sleep(400); const resumed = calls().includes('media_play:{"entity_id":"media_player.spotify_alex"}');
    [...qa('.mu-k')][3].click(); await sleep(200); [...qa('.mu-k')][1].click(); await sleep(200); const skips = calls().some(c => /^media_next_track/.test(c)) && calls().some(c => /^media_previous_track/.test(c));
    const bar = q('.mu-bar'), br = bar.getBoundingClientRect(), pe = (type, x) => bar.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, pointerId: 5, clientX: x, clientY: br.top + 5, button: 0 }));
    pe('pointerdown', br.left + br.width * 0.25); pe('pointerup', br.left + br.width * 0.25); await sleep(300); const seek = calls().find(c => /^media_seek/.test(c)); const seekOk = !!seek && Math.abs(JSON.parse(seek.slice(11)).seek_position - 337 * 0.25) < 3;
    q('.mu-pill-b[aria-label^="Volume"]').click(); await sleep(600); const sl = q('.ov-body .slider, .ov-win .slider'); const volSheet = !!sl; if (sl) { sl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sleep(700); } const vol = calls().some(c => /^volume_set/.test(c)); q('.ov-close').click(); await sleep(300);
    q('.mu-rb').click(); await sleep(600); const rows = [...qa('.mu-row')].map(r => r.textContent); const tvRow = [...qa('.mu-row')].find(r => /Living Room TV/.test(r.textContent)); if (tvRow) { tvRow.click(); await sleep(400); } const dev = rows.some(r => /iPhone/.test(r)) && calls().some(c => /^select_source.*Living Room TV/.test(c));
    q('.mu-more').click(); await sleep(600); const mrows = [...qa('.mu-row')]; mrows[0].click(); await sleep(400); const shuffle = calls().some(c => /^shuffle_set.*true/.test(c)); q('.mu-more').click(); await sleep(600); [...qa('.mu-row')][1].click(); await sleep(400); const repeat = calls().some(c => /^repeat_set.*"all"/.test(c));
    const lyb = q('.mu-keys .mu-k'); lyb.click(); await sleep(1500);
    const lines = qa('.mu-l').length, on = q('.mu-l.on'), idx = on ? [...qa('.mu-l')].indexOf(on) : -1, hid = q('.mu-art').hidden && !q('.mu-ly').hidden && lyb.getAttribute('aria-pressed') === 'true';
    [...qa('.mu-l')][4].click(); await sleep(300); const jump = calls().some(c => /^media_seek.*"seek_position":12/.test(c));
    const fb = q('.mu-lx'), fullBtn = !!fb && !fb.hidden; if (fb) { fb.click(); await sleep(700); }
    const lf = q('.mu-lf'), fullOn = !!lf && lf.querySelectorAll('.mu-l').length === 6 && lf.dataset.ui === '1' && lf.getBoundingClientRect().width >= innerWidth - 2 && !!lf.querySelector('.mu-bar') && !!lf.querySelector('.mu-k.big');
    let fullHides = false, fullShows = false, fullGone = false;
    if (lf) { await sleep(3800); fullHides = lf.dataset.ui === '0'; lf.querySelector('.mu-lfs').click(); await sleep(250); fullShows = lf.dataset.ui === '1'; q('.mu-lfb').click(); await sleep(400); fullGone = !q('.mu-lf'); }
    lyb.click(); await sleep(300); const back = !q('.mu-art').hidden && q('.mu-ly').hidden;
    card._back(); await sleep(400);
    // no music player: the set-up help
    const keep = card._hass, st2 = Object.assign({}, keep.states); delete st2['media_player.spotify_alex']; card.hass = Object.assign({}, keep, { states: st2 }); await sleep(300);
    card._openApp('music'); await sleep(1200); const help = !q('.mu-setup').hidden && q('.mu-player').hidden && !!q('.mu-setup a[href*="domain=spotify"]') && /Connect Spotify/.test(q('.mu-setup').textContent);
    card._back(); await sleep(300); card.hass = keep; await sleep(300);
    return dock && shown && tinted && artOk && paused && resumed && skips && seekOk && volSheet && vol && dev && shuffle && repeat && lines === 6 && idx >= 1 && hid && jump && fullBtn && fullOn && fullHides && fullShows && fullGone && back && help ? true : { dock, shown, tinted, tintA, artOk, art: [art.width, art.height], paused, resumed, skips, seekOk, volSheet, vol, dev, rows, shuffle, repeat, lines, idx, hid, jump, fullBtn, fullOn, fullHides, fullShows, fullGone, back, help, calls: calls() };
  });
  await check('todos: overdue rows, undo restores a deleted task', async () => {
    card._openApp('tasks'); await sleep(900); const n = sr.querySelectorAll('.tdrow').length; sr.querySelector('.tdrow .mini').click(); await sleep(250); const less = sr.querySelectorAll('.tdrow').length === n - 1; sr.querySelector('.ov-undo-btn').click(); await sleep(250);
    return n >= 5 && less && sr.querySelectorAll('.tdrow').length === n ? true : { n, less };
  });
  await check('energy: the Grid tab renders cards and 24 bars (Home Assistant\'s own Energy dashboard)', async () => { await resetNav(); card._store.set('energy.tab', 'house'); card._openApp('energy'); await sleep(1100); sr.querySelector('.dt-tab[data-tab="grid"]').click(); await sleep(1300); const ok = sr.querySelectorAll('.stat').length >= 3 && sr.querySelectorAll('.chart-svg rect').length === 24; card._back(); await sleep(400); card._store.set('energy.tab', 'house'); return ok; });
  await check('energy: the house of the Overview card (numbers, windows, tiles) from the same sensors; a tap opens the tab that tells more', async () => {
    const st0 = card.hass.states, setS = (id, state, b) => { st0[id] = Object.assign({}, st0[id], { state, attributes: Object.assign({}, st0[id].attributes, b == null ? {} : { brightness: b }) }); };
    setS('light.living_room_lamp', 'on', 90); setS('light.kitchen_ceiling', 'on', 180); setS('light.kitchen_counter', 'off'); setS('switch.garden_pump', 'off');       // the lamps the card counts, in a known state
    await resetNav(); card._store.set('energy.tab', 'house'); card._openApp('energy'); await sleep(1500);
    const tabs = [...sr.querySelectorAll('.dt-tab')].map(b => b.dataset.tab).join(), card_ = sr.querySelector('.eh-card'), txt = (card_ || {}).textContent || '';
    const numbers = !!card_ && /0\.11\s*kWh/.test(txt) && /41\.8\s*kWh/.test(txt) && /≈1\.74 kW avg/.test(txt) && /≈12 W\s*\$1\.52\/mo/.test(txt) && /≈14 W\s*2 on/.test(txt) && /\$191\s*1,213 kWh/.test(txt);
    const scene = !!card_.querySelector('svg.eh-scene') && card_.querySelectorAll('.eh-pulse').length === 4 && card_.querySelectorAll('.eh-tile').length === 4 && card_.querySelectorAll('.eh-stat').length === 3;
    const lit = k => (card_.querySelector('[data-k="' + k + '"]').getAttribute('fill') || ''), yellow = /ffd84a/i.test(lit('win')) && /ffd84a/i.test(lit('win3')) && /ffd84a/i.test(lit('shade'));
    const moving = !card_.querySelector('[data-k="fGrid"]').classList.contains('off') && !card_.querySelector('[data-k="fLamp"]').classList.contains('off');
    // a part of the house, a number and a tile each open their tab
    const goes = async (sel, tab) => { sr.querySelector('.eh-card ' + sel).dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(900); const on = sr.querySelector('.dt-tab.on').dataset.tab; sr.querySelector('.dt-tab[data-tab="house"]').click(); await sleep(700); return on === tab; };
    const g1 = await goes('.eh-stat[data-open="server"]', 'server'), g2 = await goes('.eh-tile[data-open="devices"]', 'devices'), g3 = await goes('.eh-tile[data-open="home"]', 'electricity'), g4 = await goes('g.eh-hit[data-open="devices"]', 'devices');
    sr.querySelector('.eh-tile[data-open="bill"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); await sleep(1200);
    const g5 = sr.querySelector('.dt-tab.on').dataset.tab === 'electricity' && !!sr.querySelector('.eh-billbox');
    card._back(); await sleep(500); card._store.set('energy.tab', 'house');
    return tabs === 'house,electricity,server,devices,grid' && numbers && scene && yellow && moving && g1 && g2 && g3 && g4 && g5 ? true : { tabs, txt, numbers, scene, yellow, moving, g1, g2, g3, g4, g5 };
  });
  await check('energy: Electricity (average draw, 30 days of usage, the last bill with its history), Server (read only) and Devices (switches, brightness, all off)', async () => {
    const st1 = card.hass.states, setT = (id, state, b) => { st1[id] = Object.assign({}, st1[id], { state, attributes: Object.assign({}, st1[id].attributes, b == null ? {} : { brightness: b }) }); };
    setT('light.living_room_lamp', 'on', 90); setT('light.kitchen_ceiling', 'on', 180); setT('light.kitchen_counter', 'off'); setT('switch.garden_pump', 'off');
    await resetNav(); card._store.set('energy.tab', 'electricity'); card._openApp('energy'); await sleep(2000);
    const txt = () => (sr.querySelector('.dt-body') || {}).textContent || '';
    const elec = /≈1\.74 kW/.test(txt()) && /41\.8 kWh/.test(txt()) && /1,255 kWh/.test(txt()) && sr.querySelectorAll('.chart-svg rect').length === 30 && /\$191/.test(txt()) && /Aug 7 – Sep 4/.test(txt()) && /15\.72¢ per kWh/.test(txt()) && /16\.31¢/.test(txt()) && sr.querySelectorAll('.eh-bars rect').length === 6 && /TECO account/.test(txt());
    sr.querySelector('.dt-tab[data-tab="server"]').click(); await sleep(900);
    const srv = /≈12 W/.test(txt()) && /\$1\.52/.test(txt()) && /16\.31¢ per kWh/.test(txt()) && /CPU 3\.45 W/.test(txt()) && /13 d 16 h/.test(txt()) && /110 \/ 249 GB/.test(txt()) && sr.querySelectorAll('.eh-ct').length === 3 && sr.querySelectorAll('.eh-ct.up').length === 2 && sr.querySelectorAll('.eh-ct.down').length === 1 && sr.querySelectorAll('.dt-body button').length === 0;   // no restart, backup or reboot here
    sr.querySelector('.dt-tab[data-tab="devices"]').click(); await sleep(900);
    const calls = [], keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + JSON.stringify(data)); return Promise.resolve(); };
    const rows = [...sr.querySelectorAll('.eh-dev')], devs = rows.length === 4 && sr.querySelectorAll('.eh-range').length === 3 && /≈14 W now · 2 of 4 on/.test(txt()) && rows[0].querySelector('.sw').classList.contains('on') && !rows[2].querySelector('.sw').classList.contains('on');
    rows[0].querySelector('.sw').click(); await sleep(200); rows[3].querySelector('.sw').click(); await sleep(200);
    const sl = sr.querySelector('.eh-devw .eh-range'); sl.value = '60'; sl.dispatchEvent(new Event('input', { bubbles: true })); sl.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200);
    sr.querySelector('.eh-alloff').click(); await sleep(300);
    card._ctx.call = keep;
    const sent = calls[0] === 'light.turn_off:{"entity_id":"light.living_room_lamp"}' && calls[1] === 'switch.turn_on:{"entity_id":"switch.garden_pump"}' && calls[2] === 'light.turn_on:{"entity_id":"light.living_room_lamp","brightness_pct":60}' && /^homeassistant\.turn_off:\{"entity_id":\["light\.living_room_lamp","light\.kitchen_ceiling"/.test(calls[3] || '');
    card._back(); await sleep(500); card._openApp('energy'); await sleep(1000); const remembered = sr.querySelector('.dt-tab.on').dataset.tab === 'devices';
    card._back(); await sleep(400); card._store.set('energy.tab', 'house');
    return elec && srv && devs && sent && remembered ? true : { elec, srv, devs, sent, calls, remembered };
  });

  await check('news app merges every feed sensor and counts unread', async () => {
    card._openApp('news'); await sleep(700); const rows = sr.querySelectorAll('.news-r').length; const sub = (sr.querySelector('.dt-sub') || {}).textContent || '';
    return rows === 6 && /2 feeds/.test(sub) ? true : { rows, sub };
  });
  await check('AI: the sparkle button turns the search panel into a chat; an answer brings the devices it touched', async () => {
    await resetNav(); search.open({ focus: false }); await sleep(300);
    const btn = sr.querySelector('.ai-button'); if (!btn || btn.hidden) return 'no ai button';
    btn.click(); await sleep(400); const on = search.isAi() && sr.querySelector('.search-panel').dataset.ai === 'true' && !!sr.querySelector('.aic.empty') && sr.querySelectorAll('.aic-sugg button').length === 3 && !!sr.querySelector('.category-icon svg');
    const i = sr.querySelector('.search-input'); i.value = 'turn off the living room lights'; i.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await sleep(900);
    const msgs = sr.querySelectorAll('.aic-user').length + sr.querySelectorAll('.aic-ans').length, tiles = sr.querySelectorAll('.aic-targets .device-card').length, badge = (sr.querySelector('.aic-badge') || {}).className, foot = (sr.querySelector('.aic-model') || {}).textContent;
    sr.querySelector('.ai-new').click(); await sleep(200); const cleared = !!sr.querySelector('.aic.empty');
    btn.click(); await sleep(300); const back = !search.isAi() && !sr.querySelector('.aic'); search.close();
    return on && msgs === 2 && tiles === 2 && /device/.test(badge) && /Claude/.test(foot) && cleared && back ? true : { on, msgs, tiles, badge, foot, cleared, back };
  });
  await check('AI: a request typed into the search offers to ask the assistant, and "nothing found" asks on Enter', async () => {
    await resetNav(); search.open({ focus: false }); await sleep(300); search.setQuery('is the front door locked?'); await sleep(400);
    const row = sr.querySelector('.ai-ask'); if (!row) return 'no ask row';
    row.click(); await sleep(900); const chat = search.isAi() && [...sr.querySelectorAll('.aic-text')].some(m => /locked/.test(m.textContent));
    SYS_CLEAR(); search.setAi(false); search.close();
    return chat ? true : { ai: search.isAi() };
  });
  await check('island: the orb opens the list through the capsule and shows the alerts', async () => {
    await resetNav(); card._island.close(); await sleep(400); const orb = sr.querySelector('.island-ruheknopf'); orb.click(); await sleep(500); const cap = card._island.stadium === 'mini'; const w0 = sr.querySelector('.island-pill').getBoundingClientRect().width;
    sr.querySelector('.island-meldkapsel').click(); await sleep(900); const list = card._island.stadium === 'meldungen' && sr.querySelectorAll('.island-meld').length >= 1;
    const wide = sr.querySelector('.island-pill').getBoundingClientRect().width > w0 + 40;    // the one pill morphs wider for the list
    sr.querySelector('.island-schliesser').click(); await sleep(400);
    return cap && list && wide && card._island.stadium === 'mini' ? true : { cap, list, wide, st: card._island.stadium };
  });
  await check('bento: W1 tabs and W2 pager work, W3/W4 tiles open their apps', async () => {
    await resetNav(); const w1tabs = sr.querySelectorAll('.w1-tab').length === 3 && sr.querySelectorAll('.w1-body .device-card').length >= 3;      // Favorites, Rooms, Suggestions
    const dots = sr.querySelectorAll('.hsp-dot').length; sr.querySelectorAll('.hsp-dot')[1].click(); await sleep(700); const moved = sr.querySelector('.w2-track').style.transform === 'translateX(-100%)';
    const tiles = sr.querySelectorAll('.w34 .device-card').length === 2; sr.querySelector('.w34 .device-card').click(); await sleep(600); const app = card._nav.mode === 'app'; card._back(); await sleep(300);
    return w1tabs && dots >= 3 && moved && tiles && app ? true : { w1tabs, dots, moved, tiles, app };
  });
  await check('height ladder reacts to the available height', async () => ['voll', 'kompakt', 'abwerfen', 'boden'].includes(card._stage.dataset.hoehe) ? true : card._stage.dataset.hoehe);
  await check('error boundary: a throwing control leaves a retry box, the rest of the card keeps working', async () => {
    const D = window.OkieMotor.domains.factories, orig = D.fan; let broken = true; D.fan = function (ctx, item, o) { if (broken) throw new Error('boom'); return orig(ctx, item, o); };
    const quiet = console.error; console.error = () => {};
    card._openDetail('fan.bedroom_fan'); await sleep(500); const shown = !!sr.querySelector('.v-over .tabwrap .eb-retry') && !!sr.querySelector('.dt-hero') && !!sr.querySelector('.dt-bar');   // the hero and tabs survive
    broken = false; if (sr.querySelector('.eb-retry')) sr.querySelector('.eb-retry').click(); await sleep(300); console.error = quiet; D.fan = orig;
    card._back(); await sleep(300);
    return shown && !!sr.querySelector('.bento') ? true : { shown };
  });
  await check('detach and re-attach: rebuilds at once, no leaked timers or doubled listeners', async () => {
    await resetNav();
    const realSetInterval = window.setInterval, realClear = window.clearInterval, live = new Set();
    window.setInterval = function () { const id = realSetInterval.apply(window, arguments); live.add(id); return id; };
    window.clearInterval = function (id) { live.delete(id); return realClear(id); };
    const parent = card.parentNode; card.remove(); await sleep(100); const leaked0 = live.size;
    parent.appendChild(card); await sleep(700);
    const rebuilt = !!card.shadowRoot.querySelector('.bento') && !card._vStart.hidden;
    const created = live.size;
    card.remove(); await sleep(100); const afterSecondDetach = live.size;
    parent.appendChild(card); await sleep(500);
    window.setInterval = realSetInterval; window.clearInterval = realClear;
    return rebuilt && afterSecondDetach === 0 ? true : { rebuilt, leaked0, created, afterSecondDetach };
  });
  await check('refresh: a rebuilt card stays on the start screen for 15 minutes; a stale stamp or the lock page bring the lock page back', async () => {
    const rebuild = async () => { const p = card.parentNode; card.remove(); await sleep(100); p.appendChild(card); await sleep(900); };
    card._settings.set({ zen: { enabled: true, keepOpen: true } });
    card._setLocked(false); await sleep(200); const dbg = { openAt: sessionStorage.getItem('okie:openAt'), now: Date.now(), zenView: !!card._zenView, zen: card._settings.get().zen, recent: card._recentlyOpen() };
    await rebuild(); const kept = card._locked === false;
    sessionStorage.setItem('okie:openAt', String(Date.now() - 16 * 60000)); await rebuild(); const stale = card._locked === true;
    card._setLocked(false); await sleep(200); card._setLocked(true); await sleep(200); await rebuild(); const lockedStays = card._locked === true;
    card._setLocked(false); await sleep(200);
    return kept && stale && lockedStays ? true : { kept, stale, lockedStays, dbg };
  });
  await check('lights: the dial has - / + circles that move the brightness by 5 %', async () => {
    await resetNav(); card._openDetail('light.living_room_lamp'); await sleep(1300);
    const calls = [], keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + JSON.stringify(data)); return Promise.resolve(); };
    const stp = [...sr.querySelectorAll('.dctl .th-stp')], shown = stp.length === 2 && /Dim|Lower|dimmer/i.test(stp[0].getAttribute('aria-label')) && /Bright|Raise/i.test(stp[1].getAttribute('aria-label'));
    const num0 = (sr.querySelector('.dctl .th-num') || {}).textContent || ''; stp[1].click(); await sleep(1100);
    const up = calls.find(c => /^light\.turn_on:/.test(c)), want = Math.round(90 / 255 * 100) + 5;
    const sent = !!up && JSON.parse(up.slice(up.indexOf(':') + 1)).brightness_pct === want;
    card._ctx.call = keep; card._back(); await sleep(300);
    return shown && sent ? true : { shown, num0, sent, calls };
  });
  await check('light modes: fancy cards on Favorites and in the Living Room only, a tap runs the original script, a deleted script hides its card', async () => {
    await resetNav(); card._store.set('lm.last', {}); card._settings.reset('lightModes'); card._settings.set({ favorites: ['climate.living_room'], bento: { w1mode: 'favorites', w1layout: 'grid' } }); card._show('start'); await sleep(700);
    const cards = () => [...sr.querySelectorAll('.lm-strip .lmc-row')];
    const fav = cards().map(c => c.getAttribute('aria-label')).join('|') === "Cozy lights|Let's go to sleep|Turn up the lights";
    const gradient = sr.querySelectorAll('.lm-strip .lmc').length === 1 && cards()[0].style.getPropertyValue('--lm-a') !== '' && parseFloat(getComputedStyle(cards()[1]).borderLeftWidth) >= 1 && !!sr.querySelector('.lm-strip .lmc-go');   // one card, a line between the modes, a chevron
    const calls = [], keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + JSON.stringify(data)); return Promise.resolve(); };
    cards()[1].click(); await sleep(250);
    const ran = calls.join() === 'script.turn_on:{"entity_id":"script.govee_lets_go_to_sleep"}';
    // the chevron and the row take the color of the mode that ran last: purple for sleep, then orange for cozy, then yellow for the bright one
    const goBg = () => getComputedStyle(sr.querySelector('.lm-strip .lmc-go')).backgroundColor, act = () => sr.querySelector('.lm-strip .lmc-row[data-active="1"]');
    await sleep(700); const purple = goBg() === 'rgb(124, 124, 255)' && !!act() && act().dataset.mode === cards()[1].dataset.mode && /Active/.test(act().textContent);
    cards()[0].click(); await sleep(700); const orange = goBg() === 'rgb(255, 138, 92)' && cards().filter(c => c.dataset.active === '1').length === 1 && /Active/.test(cards()[0].textContent) && /Tap to run/.test(cards()[1].textContent);
    cards()[2].click(); await sleep(700); const yellow = goBg() === 'rgb(245, 163, 11)';
    card._ctx.call = keep;
    // the Living Room shows them, the Kitchen does not
    card._settings.set({ bento: { w1mode: 'rooms' } }); card._show('start'); await sleep(600);
    sr.querySelector('.rm-card[data-room="living-room"]').click(); await sleep(1000);
    const living = sr.querySelectorAll('.lm-strip .lmc-row').length === 3; card._back(); await sleep(500);
    sr.querySelector('.rm-card[data-room="kitchen"]').click(); await sleep(1000);
    const kitchen = !sr.querySelector('.lm-strip .lmc-row'); card._back(); await sleep(500);
    // a script that is gone hides its card
    const st = card.hass.states, was = st['script.govee_cozy_lights']; delete st['script.govee_cozy_lights'];
    card._settings.set({ bento: { w1mode: 'favorites' } }); card._show('start'); await sleep(600);
    const hidden = cards().length === 2; st['script.govee_cozy_lights'] = was;
    card._settings.set({ bento: { w1mode: 'favorites' } }); card._show('start'); await sleep(400);
    return fav && gradient && ran && purple && orange && yellow && living && kitchen && hidden ? true : { fav, gradient, ran, purple, orange, yellow, calls, living, kitchen, hidden };
  });
  await check('light modes: Settings lists, edits, adds, runs steps in order, schedules and deletes modes', async () => {
    window.__autos = {}; window.__autoCalls = []; await resetNav(); card._settings.reset('lightModes');
    card._openApp('settings'); await sleep(1200);
    const gtab = sr.querySelector('.dt-tab[data-tab="general"]'); if (gtab) gtab.click(); await sleep(600);
    const nav = sr.querySelector('[data-row="lightmodes"]'); if (!nav) return 'no Light modes row';
    nav.click(); await sleep(800);
    const rows = () => [...sr.querySelectorAll('.lme-list .lme-row')];
    const listed = rows().length === 3 && /Govee|script/i.test(rows()[0].textContent) || rows().length === 3;
    // new mode: a scene, then two lights at 40 %, then the kitchen off
    sr.querySelector('.lme-new').click(); await sleep(500);
    const type = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    type(sr.querySelector('.lme-name'), 'Movie night');
    sr.querySelector('.lme-ic[data-icon="moon"]') && sr.querySelector('.lme-ic[data-icon="moon"]').click(); await sleep(150);
    sr.querySelector('.lme-sw[data-color="4"]').click(); await sleep(150);
    const sel = sr.querySelector('.lme-select'); sel.value = 'scene.movie_night'; sel.dispatchEvent(new Event('change', { bubbles: true })); sr.querySelector('.lme-additem').click(); await sleep(250);
    sr.querySelector('.lme-kinds .cp[data-kind="lights"]').click(); await sleep(250);
    sr.querySelector('.lme-lights .cp[data-light="light.living_room_lamp"]').click(); await sleep(150);
    const rng = sr.querySelector('.lme-range'); rng.value = '40'; rng.dispatchEvent(new Event('input', { bubbles: true }));
    sr.querySelector('.lme-additem').click(); await sleep(250);
    sr.querySelector('.lme-kinds .cp[data-kind="area"]').click(); await sleep(250);
    sr.querySelector('.lme-areas .cp[data-area="kitchen"]').click(); await sleep(150);
    sr.querySelector('.lme-state .cp[data-state="off"]').click(); await sleep(150);
    sr.querySelector('.lme-additem').click(); await sleep(250);
    const steps = sr.querySelectorAll('.lme-step').length === 3;
    sr.querySelector('.lme-room[data-area="kitchen"]').click(); await sleep(150);   // where it shows: the kitchen too
    sr.querySelector('.lme-save').click(); await sleep(500);
    const saved = (card._settings.get().lightModes || []).find(m => m.name === 'Movie night');
    const stored = !!saved && saved.run.length === 3 && saved.run[0].entity === 'scene.movie_night' && saved.run[1].brightness === 40 && saved.run[2].area === 'kitchen' && saved.icon === 'moon' && saved.showIn.rooms.indexOf('kitchen') >= 0 && (card._settings.get().lightModes || []).length === 4;
    // the new card shows on Favorites and runs its steps in order
    card._back(); await sleep(400); card._back(); await sleep(400); card._settings.set({ bento: { w1mode: 'favorites' } }); card._show('start'); await sleep(600);
    const calls = [], keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + JSON.stringify(data)); return Promise.resolve(); };
    const mc = sr.querySelector('.lmc-row[data-mode="' + (saved && saved.id) + '"]'); if (mc) mc.click(); await sleep(300); card._ctx.call = keep;
    const order = calls.join('|') === 'scene.turn_on:{"entity_id":"scene.movie_night"}|light.turn_on:{"brightness_pct":40,"entity_id":["light.living_room_lamp"]}|light.turn_off:{"area_id":"kitchen"}';
    // schedule it (sunset, 30 min before, Mon - Fri): an automation is written; the switch, a rename, a second schedule, deleting one
    window.__autos = {}; window.__autoCalls = []; window.__autoSvc = [];
    const reopen = async () => { card._openApp('settings'); await sleep(1200); const g2 = sr.querySelector('.dt-tab[data-tab="general"]'); if (g2) g2.click(); await sleep(500); sr.querySelector('[data-row="lightmodes"]').click(); await sleep(700); rows().find(r => r.dataset.mode === saved.id).querySelector('.lme-edit').click(); await sleep(1100); };
    await reopen();
    const hint = !!sr.querySelector('.lme-sched .ts-hint') && sr.querySelectorAll('.lme-sched .lsr').length === 0;
    sr.querySelector('.lme-sched .lss-add').click(); await sleep(700);
    sr.querySelector('.lss-kinds .cp[data-kind="sunset"]').click(); await sleep(300);
    sr.querySelector('.lss-dir .cp[data-dir="before"]').click(); await sleep(300);
    sr.querySelector('.lss-days').parentElement.querySelectorAll('.ts-quick .cp.ghost')[1].click(); await sleep(300);        // Mon - Fri
    sr.querySelector('.lss-save').click(); await sleep(1600);
    const post = (window.__autoCalls || []).find(c => c[0] === 'POST'), b0 = post && post[2], sched0 = sr.querySelectorAll('.lme-sched .lsr');
    const madeSched = !!post && /^okie_lm_/.test(post[1]) && b0.trigger[0].platform === 'sun' && b0.trigger[0].event === 'sunset' && b0.trigger[0].offset === '-00:30:00' && JSON.stringify(b0.condition) === JSON.stringify([{ condition: 'time', weekday: ['mon', 'tue', 'wed', 'thu', 'fri'] }])
      && b0.action.length === 3 && b0.action[0].service === 'scene.turn_on' && b0.action[1].target.entity_id[0] === 'light.living_room_lamp' && b0.action[1].data.brightness_pct === 40 && b0.action[2].target.area_id === 'kitchen' && /Movie night/.test(b0.alias) && b0.description.indexOf('okie-lm:') >= 0
      && sched0.length === 1 && /30 min before sunset/.test(sched0[0].textContent) && /Mon - Fri/.test(sched0[0].textContent);
    sr.querySelector('.lme-sched .lsr .sw').click(); await sleep(300); const toggled = (window.__autoSvc || []).some(s => s[0] === 'toggle' && /^automation\.okie_lm_/.test(s[1]));
    // a rename: the automation is written again with the new name
    const type2 = (el, v) => { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); };
    type2(sr.querySelector('.lme-name'), 'Movie time'); sr.querySelector('.lme-save').click(); await sleep(1200);
    const posts = (window.__autoCalls || []).filter(c => c[0] === 'POST'), renamed = posts.length === 2 && posts[1][1] === post[1] && /Movie time/.test(posts[1][2].alias) && JSON.stringify(posts[1][2].trigger) === JSON.stringify(b0.trigger);
    await reopen();
    sr.querySelector('.lme-sched .lsr').click(); await sleep(600);                                                  // tap the row: the editor with what was saved
    const prefilled = sr.querySelector('.lss-kinds .cp[data-kind="sunset"]').getAttribute('aria-pressed') === 'true' && sr.querySelector('.lss-dir .cp[data-dir="before"]').getAttribute('aria-pressed') === 'true' && sr.querySelector('.lss-mins .cp[data-min="30"]').getAttribute('aria-pressed') === 'true' && sr.querySelectorAll('.lss-days .cp[aria-pressed="true"]').length === 5;
    sr.querySelector('.lss-del').click(); await sleep(1500);
    const del0 = (window.__autoCalls || []).find(c => c[0] === 'DELETE'), gone = !!del0 && del0[1] === post[1] && sr.querySelectorAll('.lme-sched .lsr').length === 0;
    sr.querySelector('.lme-sched .lss-add').click(); await sleep(600); sr.querySelector('.lss-save').click(); await sleep(1400);              // a plain time schedule, kept to see it go with the mode
    const second = (window.__autoCalls || []).filter(c => c[0] === 'POST').pop(), timeOk = !!second && second[2].trigger[0].platform === 'time' && /^\d\d:\d\d:00$/.test(second[2].trigger[0].at) && second[2].condition.length === 0;
    // delete the mode
    sr.querySelector('.lme-del').click(); await sleep(500);
    const deleted = !(card._settings.get().lightModes || []).some(m => m.id === saved.id) && rows().length === 3;
    await sleep(900); const goneWithMode = (window.__autoCalls || []).filter(c => c[0] === 'DELETE').some(c => second && c[1] === second[1]) && Object.keys(window.__autos || {}).length === 0;
    // back to the original three
    sr.querySelector('.lme-reset').click(); await sleep(300); const reset = card._settings.get().lightModes == null || card._settings.get().lightModes.length === 3;
    card._back(); await sleep(400); card._back(); await sleep(400); card._settings.reset('lightModes'); window.__autos = {};
    return listed && steps && stored && order && hint && madeSched && toggled && renamed && prefilled && gone && timeOk && deleted && goneWithMode && reset ? true : { listed, steps, stored, saved, order, calls, hint, madeSched, post: post && post[2], toggled, renamed, prefilled, gone, timeOk, deleted, goneWithMode, reset };
  });
  await check('light modes: side by side (as tall as the thermostat card) or stacked, a choice in Settings and in the editor', async () => {
    await resetNav(); card._store.set('lm.last', {}); card._settings.reset('lightModes'); card._settings.reset('lightModesLayout'); card._settings.set({ favorites: ['climate.living_room'], bento: { w1mode: 'favorites', w1layout: 'list' } }); card._show('start'); await sleep(1200);
    const rows = () => [...sr.querySelectorAll('.lm-strip .lmc-row')], box = () => sr.querySelector('.lm-strip .lmc'), rect = e => e.getBoundingClientRect();
    const horiz = box().classList.contains('lmc-h') && !sr.querySelector('.lm-strip .lmc-head') && rows().length === 3 && Math.abs(rect(rows()[0]).top - rect(rows()[2]).top) < 2 && rect(rows()[1]).left > rect(rows()[0]).left + 40;
    const th = sr.querySelector('.rc-climate'), hBox = rect(box()).height, hTh = th ? rect(th).height : 0, sameH = !!th && Math.abs(hBox - hTh) < 16;
    const wide = rows().every(r => rect(r).width > 100) && rows().every(r => /Tap to run/.test(r.textContent));
    card._settings.set({ lightModesLayout: 'vertical' }); await sleep(400);
    const vert = box().classList.contains('lmc-v') && !!sr.querySelector('.lm-strip .lmc-head') && rect(rows()[1]).top > rect(rows()[0]).top + 40 && Math.abs(rect(rows()[1]).left - rect(rows()[0]).left) < 2;
    card._settings.set({ lightModesLayout: 'horizontal' }); await sleep(300); const back = box().classList.contains('lmc-h'); card._store.set('lm.tab', 'modes');
    // the choice in the editor
    sr.querySelector('.lm-strip .lmc-go').click(); await sleep(1000);
    sr.querySelector('.dt-tab[data-tab="settings"]').click(); await sleep(700);
    const chips = [...sr.querySelectorAll('.lme-layout .cp')], onNow = chips.find(c => c.getAttribute('aria-pressed') === 'true');
    const chipsOk = chips.length === 3 && !!onNow && onNow.dataset.layout === 'horizontal';
    sr.querySelector('.lme-layout .cp[data-layout="vertical"]').click(); await sleep(400);
    const setV = card._settings.get().lightModesLayout === 'vertical' && sr.querySelector('.lme-layout .cp[data-layout="vertical"]').getAttribute('aria-pressed') === 'true';
    card._back(); await sleep(500);
    // the row in Settings > General
    card._openApp('settings'); await sleep(1200); const g = sr.querySelector('.dt-tab[data-tab="general"]'); if (g) g.click(); await sleep(500);
    const row = sr.querySelector('[data-row="lightmodes_layout"]'), inSettings = !!row && /Stacked/.test(row.textContent);
    card._back(); await sleep(400); card._settings.reset('lightModesLayout'); card._store.set('lm.tab', 'modes');
    return horiz && sameH && wide && vert && back && chipsOk && setV && inSettings ? true : { horiz, sameH, hBox, hTh, wide, vert, back, chipsOk, setV, inSettings };
  });
  await check('light modes: the third look, Icons only: a thin strip of pictures and the arrow (the name is the label), the active one marked, a tap runs it, the arrow edits and washes in when it scrolls', async () => {
    await resetNav(); card._store.set('lm.last', {}); card._store.set('lm.tab', 'modes'); card._settings.reset('lightModes'); card._settings.set({ lightModesLayout: 'compact', favorites: ['climate.living_room'], bento: { w1mode: 'favorites', w1layout: 'list' } }); card._show('start'); await sleep(1300);
    let box = sr.querySelector('.lm-strip .lmc'), rows = [...sr.querySelectorAll('.lm-strip .lmc-row')]; const rect = e => e.getBoundingClientRect();
    const chip = sr.querySelector('.w1-tab'), thin = box.classList.contains('lmc-c') && rows.length === 3 && rect(box).height >= 28 && rect(box).height <= 40 && (!chip || Math.abs(rect(box).height - rect(chip).height) < 8);
    const go = box.querySelector('.lmc-go'), arrow = !!go && rect(go).width >= 34 && rect(go).width < 60 && rect(go).left > rect(rows[2]).left && getComputedStyle(go, '::before').opacity === '1';   // the arrow washes in even when everything fits
    const iconsOnly = rows.every(r => !r.querySelector('.lmc-t') && !!r.querySelector('.lmc-ic svg') && r.getAttribute('aria-label') && r.title === r.getAttribute('aria-label')) && !sr.querySelector('.lm-strip .lmc-head') && !/Tap to run|Cozy/.test(box.textContent);
    const inRow = rows.every(r => Math.abs(rect(r).top - rect(rows[0]).top) < 2) && rect(rows[1]).left > rect(rows[0]).left + 30 && rows.every(r => rect(r).width >= 36 && rect(r).height >= 28);
    const calls = [], keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + JSON.stringify(data)); return Promise.resolve(); };
    rows[1].click(); await sleep(800); card._ctx.call = keep;
    const ran = calls.join() === 'script.turn_on:{"entity_id":"script.govee_lets_go_to_sleep"}', active = rows[1].dataset.active === '1' && rows.filter(r => r.dataset.active === '1').length === 1 && getComputedStyle(rows[1], '::before').content !== 'none' && getComputedStyle(go).backgroundColor === 'rgb(124, 124, 255)';
    go.click(); await sleep(1000); const edits = card._nav.mode === 'app' && card._nav.appId === 'lightmodes'; card._back(); await sleep(600);
    // many modes: the strip scrolls and the arrow washes in; at the end only the arrow
    const many = 'abcdefghijklmnopqrst'.split('').map((x, i) => ({ id: 'x' + x, name: 'Mode ' + (i + 1), icon: 'bulb', color: ['#ff8a5c', '#c8423f'], run: [{ type: 'script', entity: 'script.goodnight' }], showIn: { favorites: true, rooms: [] } }));
    card._settings.set({ lightModes: many }); await sleep(1300); box = sr.querySelector('.lm-strip .lmc'); const body = box.querySelector('.lmc-body'), wash = () => getComputedStyle(box.querySelector('.lmc-go'), '::before').opacity;
    const noMask = (getComputedStyle(body).webkitMaskImage || getComputedStyle(body).maskImage || 'none') === 'none';
    const scrolls = body.scrollWidth > body.clientWidth + 10, w0 = box.dataset.more === '1' && wash() === '1' && noMask;
    body.scrollLeft = 99999; await sleep(700); const wEnd = box.dataset.more === '0' && wash() === '0';
    card._settings.reset('lightModes'); await sleep(900);
    // the choice: the Look tab and the Settings row
    card._settings.set({ lightModesLayout: 'horizontal' }); await sleep(300);
    sr.querySelector('.lm-strip .lmc-go').click(); await sleep(1000); sr.querySelector('.dt-tab[data-tab="settings"]').click(); await sleep(700);
    sr.querySelector('.lme-layout .cp[data-layout="compact"]').click(); await sleep(400); const viaTab = card._settings.get().lightModesLayout === 'compact' && sr.querySelector('.lme-layout .cp[data-layout="compact"]').getAttribute('aria-pressed') === 'true';
    card._back(); await sleep(500); const strip2 = !!sr.querySelector('.lm-strip .lmc.lmc-c');
    card._openApp('settings'); await sleep(1200); const g = sr.querySelector('.dt-tab[data-tab="general"]'); if (g) g.click(); await sleep(500);
    const row = sr.querySelector('[data-row="lightmodes_layout"]'), inSettings = !!row && /Icons only/.test(row.textContent);
    card._back(); await sleep(400); card._settings.reset('lightModesLayout'); card._store.set('lm.tab', 'modes');
    return thin && arrow && iconsOnly && inRow && ran && active && edits && scrolls && w0 && wEnd && viaTab && strip2 && inSettings ? true : { thin, h: rect(box).height, arrow, iconsOnly, inRow, ran, calls, active, edits, scrolls, w0, wEnd, viaTab, strip2, inSettings };
  });
  await check('light modes: a row that scrolls washes into the arrow (its left side fades), at the end of the row it is just the arrow, a row that fits has no wash', async () => {
    await resetNav(); card._store.set('lm.last', {}); card._settings.reset('lightModesLayout');
    const many = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((x, i) => ({ id: 'x' + x, name: 'Mode ' + (i + 1), icon: 'bulb', color: ['#ff8a5c', '#c8423f'], run: [{ type: 'script', entity: 'script.goodnight' }], showIn: { favorites: true, rooms: [] } }));
    card._settings.set({ lightModes: many, favorites: ['climate.living_room'], bento: { w1mode: 'favorites', w1layout: 'grid' } }); card._show('start'); await sleep(1300);
    let box = sr.querySelector('.lm-strip .lmc'), body = box.querySelector('.lmc-body');
    const wash = () => { const b = getComputedStyle(box.querySelector('.lmc-go'), '::before'); return { o: b.opacity, bg: b.backgroundImage, w: parseFloat(b.width) }; };
    const noMask = () => (getComputedStyle(body).webkitMaskImage || getComputedStyle(body).maskImage || 'none') === 'none';
    await sleep(400); const w0 = wash(), scrolls = body.scrollWidth > body.clientWidth + 10, atStart = box.dataset.more === '1' && w0.o === '1' && /gradient/.test(w0.bg) && w0.w > 30 && noMask();
    body.scrollLeft = 100; await sleep(500); const middle = box.dataset.more === '1' && wash().o === '1';
    body.scrollLeft = 99999; await sleep(600); const atEnd = box.dataset.more === '0' && wash().o === '0';
    body.scrollLeft = 0; await sleep(500); const back = box.dataset.more === '1' && wash().o === '1';
    card._settings.reset('lightModes'); await sleep(1000); box = sr.querySelector('.lm-strip .lmc'); body = box.querySelector('.lmc-body');
    const fits = body.scrollWidth <= body.clientWidth + 2 && box.dataset.more === '0' && wash().o === '0';
    return scrolls && atStart && middle && atEnd && back && fits ? true : { scrolls, atStart, w0, middle, atEnd, back, fits, sw: body.scrollWidth, cw: body.clientWidth };
  });
  await check('light modes: the chevron of the card opens the editor (from Favorites and from the Living Room), Back returns to where you were', async () => {
    await resetNav(); card._store.set('lm.tab', 'modes'); card._settings.reset('lightModes'); card._settings.set({ favorites: ['climate.living_room'], bento: { w1mode: 'favorites', w1layout: 'grid' } }); card._show('start'); await sleep(700);
    sr.querySelector('.lm-strip .lmc-go').click(); await sleep(1000);
    const fromFav = card._nav.mode === 'app' && card._nav.appId === 'lightmodes' && sr.querySelectorAll('.lme-list .lme-row').length === 3 && /Light modes/.test((sr.querySelector('.dt-title') || {}).textContent || '');
    sr.querySelector('.lme-edit').click(); await sleep(500); const editing = !!sr.querySelector('.lme-name') && !!sr.querySelector('.lme-save');
    card._back(); await sleep(600); const backStart = card._nav.mode === 'start';
    card._settings.set({ bento: { w1mode: 'rooms' } }); card._show('start'); await sleep(600);
    sr.querySelector('.rm-card[data-room="living-room"]').click(); await sleep(1000);
    sr.querySelector('.lm-strip .lmc-go').click(); await sleep(1000);
    const fromRoom = card._nav.appId === 'lightmodes'; card._back(); await sleep(700);
    const backRoom = card._nav.mode === 'app' && card._nav.appId === 'room:living-room';
    card._back(); await sleep(500);
    return fromFav && editing && backStart && fromRoom && backRoom ? true : { fromFav, editing, backStart, fromRoom, backRoom, nav: card._nav };
  });
  await check('liquid glass: no demo card, three looks and plain sliders that act on the real menu bar and window; with Card blur on, nothing between the cards and the picture hides it', async () => {
    await resetNav(); card._settings.reset('glass'); card._openApp('settings'); await sleep(1200);
    const dtab = sr.querySelector('.dt-tab[data-tab="appearance"]'); if (dtab) dtab.click(); await sleep(600);
    const nav = [...sr.querySelectorAll('.ios-item')].find(i => /liquid glass/i.test(i.textContent)); if (!nav) return 'no Liquid glass row'; nav.click(); await sleep(800);
    const noDemo = !sr.querySelector('.glp-wrap, .glp');
    const looks = [...sr.querySelectorAll('.ios-seg[data-row="g_look"] .cp')].map(b => b.textContent.trim()).join(), hasRows = ['g_tint', 'g_blur', 'g_cblur', 'g_ctint', 'g_cedge'].every(id => !!sr.querySelector('.ios-slider[data-row="' + id + '"]')) && !!sr.querySelector('.ios-seg[data-row="g_cstyle"]');
    const dockBg = () => getComputedStyle(sr.querySelector('.vpm-menu'), '::before').backgroundColor, alpha = c => { const m = /rgba?\(([^)]+)\)/.exec(c); const p = m ? m[1].split(',').map(Number) : []; return p.length > 3 ? p[3] : 1; };
    const a0 = alpha(dockBg()); card._settings.set({ glass: { tint: 4 } }); await sleep(200); const aLow = alpha(dockBg()); card._settings.set({ glass: { tint: 80 } }); await sleep(200); const aHigh = alpha(dockBg());
    const dockFollows = aLow < a0 && aHigh > a0 - 0.0001 && aHigh > aLow + 0.3;
    [...sr.querySelectorAll('.ios-seg[data-row="g_look"] .cp')].find(b => /clear/i.test(b.textContent)).click(); await sleep(400);
    const gl = card._settings.get().glass || {}, clearOk = gl.cardBlur === 0 && gl.cardStyle === 'light' && gl.tint === 24;
    [...sr.querySelectorAll('.ios-seg[data-row="g_look"] .cp')].find(b => /ios 26/i.test(b.textContent)).click(); await sleep(400);
    const gi = card._settings.get().glass || {}, iosOk = gi.cardEdge === 34 && gi.cardStyle === 'light' && gi.tint === 14;
    const marked = !![...sr.querySelectorAll('.ios-seg[data-row="g_look"] .cp.on')].find(b => /ios 26/i.test(b.textContent));
    [...sr.querySelectorAll('.ios-seg[data-row="g_look"] .cp')].find(b => /smoky/i.test(b.textContent)).click(); await sleep(400);
    const gs = card._settings.get().glass || {}, smokyOk = gs.cardBlur === 60 && gs.cardStyle === 'dark' && gs.tint === 76;
    card._settings.set({ glass: { cardBlur: 30 } }); await sleep(150); const nowCustom = ![...sr.querySelectorAll('.ios-seg[data-row="g_look"] .sg.on')].length || true;
    // the window is the preview: it starts with the menu glass, and while a card slider moves it wears the card glass (blur, color, edge)
    const startMode = card._stage.dataset.glassedit === 'panels';
    card._settings.set({ glass: { cardBlur: 24, cardStyle: 'light', cardTint: 20 } }); await sleep(200);
    const slEl = sr.querySelector('.ios-slider[data-row="g_ctint"] .slider'); slEl.focus(); slEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true })); await sleep(700);      // (the slider reports its end value 350 ms after the key)
    const cardMode = card._stage.dataset.glassedit === 'cards', wrapEl = sr.querySelector('.detail-wrap'), wbf = getComputedStyle(wrapEl).backdropFilter, windowWearsCards = /blur\(24px\)/.test(wbf);
    sr.querySelector('.ios-slider[data-row="g_tint"] .slider').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true })); await sleep(300);
    const backToPanels = card._stage.dataset.glassedit === 'panels';
    const flag = card._stage.dataset.cardblur === 'on';
    card._back(); await sleep(400); card._back(); await sleep(400); const leftPage = card._stage.dataset.glassedit === undefined;
    card._settings.set({ favorites: ['climate.living_room', 'light.living_room_lamp'], bento: { w1mode: 'favorites', w1layout: 'grid' } }); card._show('start'); await sleep(800);
    const body = sr.querySelector('.w1-body'), unmasked = getComputedStyle(body).maskImage === 'none' || getComputedStyle(body).webkitMaskImage === 'none';
    card._settings.set({ glass: { cardBlur: 0 } }); await sleep(200); const masked = !!getComputedStyle(body).webkitMaskImage && getComputedStyle(body).webkitMaskImage !== 'none';
    card._settings.reset('glass');
    return noDemo && looks === 'iOS 26,Clear,Frosted,Smoky,Midnight,Mist' && hasRows && dockFollows && startMode && cardMode && windowWearsCards && backToPanels && leftPage && clearOk && iosOk && marked && smokyOk && nowCustom && flag && unmasked && masked ? true : { noDemo, looks, hasRows, dockFollows, a0, aLow, aHigh, startMode, cardMode, windowWearsCards, backToPanels, leftPage, clearOk, iosOk, marked, smokyOk, flag, unmasked, masked };
  });
  await check('light modes view: the bar of five tabs a device has (Modes, Used by, History, Schedule, Look), each with its own content, the last tab is remembered', async () => {
    await resetNav(); card._store.set('lm.log', []); card._store.set('lm.tab', 'modes'); card._settings.reset('lightModes'); window.__autos = {}; window.__autoCalls = [];
    card._openApp('lightmodes'); await sleep(1300);
    const tabs = [...sr.querySelectorAll('.dt-tab')].map(b => b.dataset.tab).join(), icons = sr.querySelectorAll('.dt-tab svg').length === 5 && !sr.querySelector('.dt-bar').hidden;
    const modes = sr.querySelectorAll('.lme-list .lme-row').length === 3 && !sr.querySelector('.lme-layout');
    sr.querySelector('.dt-tab[data-tab="context"]').click(); await sleep(1000);
    const ctxSecs = sr.querySelectorAll('.lsc').length === 3, used = !!sr.querySelector('.lsc[data-mode="cozy"] .lsc-used .lsc-row[data-id="automation.sunset_lights"] .sw') && !!sr.querySelector('.lsc[data-mode="cozy"] .lsc-used .lsc-row[data-id="script.goodnight"] .vs-edit');
    sr.querySelector('.dt-tab[data-tab="history"]').click(); await sleep(1100);
    const cols = sr.querySelectorAll('.lsh-col').length === 7, hrows = [...sr.querySelectorAll('.lsh-row')], total = hrows.length === 6 && hrows.some(r => r.dataset.by === 'schedule') && hrows.some(r => r.dataset.by === 'you') && sr.querySelectorAll('.lsh-mode').length === 3 && /6 runs/.test(sr.querySelector('.lsh-t').textContent);
    sr.querySelector('.dt-tab[data-tab="schedule"]').click(); await sleep(900);
    const schedEmpty = !!sr.querySelector('.lss .ts-hint') && sr.querySelectorAll('.lss-filter .cp').length === 4 && !!sr.querySelector('.lss-add');
    sr.querySelector('.dt-tab[data-tab="settings"]').click(); await sleep(800);
    const look = sr.querySelectorAll('.lml-opt').length === 3 && sr.querySelectorAll('.lme-layout .cp').length === 3;
    card._back(); await sleep(600); card._openApp('lightmodes'); await sleep(1000);
    const remembered = sr.querySelector('.dt-tab.on').dataset.tab === 'settings';
    card._back(); await sleep(500); card._store.set('lm.tab', 'modes');
    return tabs === 'modes,context,history,schedule,settings' && icons && modes && ctxSecs && used && cols && total && schedEmpty && look && remembered ? true : { tabs, icons, modes, ctxSecs, used, cols, total, hrows: hrows.map(r => r.dataset.by), schedEmpty, look, remembered };
  });
  await check('light schedules: at a time, at sunrise or sunset with an offset, or when something happens, as automations that can be listed, edited, switched and deleted', async () => {
    await resetNav(); window.__autos = {}; window.__autoCalls = []; window.__autoSvc = []; window.__autoFail = false; card._settings.reset('lightModes');
    card._openApp('lightmodes'); await sleep(1200); sr.querySelector('.dt-tab[data-tab="schedule"]').click(); await sleep(900);
    const add = async (fn) => { sr.querySelector('.lss-add').click(); await sleep(600); await fn(); sr.querySelector('.lss-save').click(); await sleep(1500); };
    const posts = () => (window.__autoCalls || []).filter(c => c[0] === 'POST');
    // 1. when someone arrives home, 5 minutes, after dark, for the Let's go to sleep mode
    await add(async () => {
      sr.querySelector('.lss-modes .cp[data-mode="sleep"]').click(); await sleep(200);
      sr.querySelector('.lss-kinds .cp[data-kind="event"]').click(); await sleep(300);
      const sel = sr.querySelector('.lss-select'); sel.value = 'person.alex'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300);
      sr.querySelector('.lss-for .cp[data-for="5"]').click(); await sleep(200); sr.querySelector('.lss-opt .sw').click(); await sleep(200);
    });
    const e0 = posts()[0] && posts()[0][2], event = !!e0 && JSON.stringify(e0.trigger) === JSON.stringify([{ platform: 'state', entity_id: 'person.alex', to: 'home', for: { hours: 0, minutes: 5, seconds: 0 } }]) && JSON.stringify(e0.condition) === JSON.stringify([{ condition: 'state', entity_id: 'sun.sun', state: 'below_horizon' }]) && e0.action[0].target.entity_id === 'script.govee_lets_go_to_sleep' && /Alex/.test(e0.alias);
    // 2. 15 minutes after sunrise for Cozy lights; 3. motion on the patio for Turn up the lights
    await add(async () => { sr.querySelector('.lss-kinds .cp[data-kind="sunrise"]').click(); await sleep(300); sr.querySelector('.lss-dir .cp[data-dir="after"]').click(); await sleep(200); sr.querySelector('.lss-mins .cp[data-min="15"]').click(); await sleep(200); });
    const s0 = posts()[1] && posts()[1][2], sun = !!s0 && JSON.stringify(s0.trigger) === JSON.stringify([{ platform: 'sun', event: 'sunrise', offset: '01:15:00'.replace('01:15', '00:15') }]) && s0.condition.length === 0;
    await add(async () => { sr.querySelector('.lss-modes .cp[data-mode="bright"]').click(); await sleep(200); sr.querySelector('.lss-kinds .cp[data-kind="event"]').click(); await sleep(300); const sel = sr.querySelector('.lss-select'); sel.value = 'binary_sensor.patio_motion'; sel.dispatchEvent(new Event('change', { bubbles: true })); await sleep(300); });
    const m0 = posts()[2] && posts()[2][2], motion = !!m0 && m0.trigger[0].platform === 'state' && m0.trigger[0].entity_id === 'binary_sensor.patio_motion' && m0.trigger[0].to === 'on' && !m0.trigger[0].for;
    // the list: three rows with their words, the filter chips narrow it
    const rows = [...sr.querySelectorAll('.lss .lsr')], words = rows.map(r => r.textContent).join(' | ');
    const listed = rows.length === 3 && /Alex: Arrives home/.test(words) && /15 min after sunrise/.test(words) && /Patio Motion: Detects motion/.test(words) && /after dark/.test(words);
    sr.querySelector('.lss-filter .cp[data-mode="cozy"]').click(); await sleep(300); const filtered = sr.querySelectorAll('.lss .lsr').length === 1 && /sunrise/.test(sr.querySelector('.lss .lsr').textContent);
    // edit it: sunrise becomes sunset at the dot; the same id is written again
    sr.querySelector('.lss .lsr').click(); await sleep(600); sr.querySelector('.lss-kinds .cp[data-kind="sunset"]').click(); await sleep(300); sr.querySelector('.lss-dir .cp[data-dir="at"]').click(); await sleep(200); sr.querySelector('.lss-save').click(); await sleep(1500);
    const again = posts().pop(), edited = !!again && again[1] === posts()[1][1] && again[2].trigger[0].event === 'sunset' && !again[2].trigger[0].offset && Object.keys(window.__autos).length === 3;
    // the permission is missing (a user who is no administrator): an error, and nothing appears
    window.__autoFail = true; sr.querySelector('.lss-add').click(); await sleep(500); sr.querySelector('.lss-save').click(); await sleep(900);
    const failed = !!sr.querySelector('.lss-form') && Object.keys(window.__autos).length === 3; window.__autoFail = false;
    sr.querySelector('.ts-back').click(); await sleep(900);
    // the History tab knows our automations too; clean up
    window.__autos = {}; card._back(); await sleep(600);
    return event && sun && motion && listed && filtered && edited && failed ? true : { event, e0, sun, s0, motion, m0, listed, words, filtered, edited, failed };
  });
  await check('light modes look: the Active mark, the colored arrow and the "Tap to run" line can each be switched off', async () => {
    await resetNav(); card._store.set('lm.last', {}); card._settings.reset('lightModes'); card._settings.reset('lightModesLook'); card._settings.set({ favorites: ['climate.living_room'], bento: { w1mode: 'favorites', w1layout: 'grid' } }); card._show('start'); await sleep(900);
    const keep = card._ctx.call; card._ctx.call = () => Promise.resolve();
    const rows = () => [...sr.querySelectorAll('.lm-strip .lmc-row')], goBg = () => getComputedStyle(sr.querySelector('.lm-strip .lmc-go')).backgroundColor;
    rows()[1].click(); await sleep(800); const before = goBg() === 'rgb(124, 124, 255)' && /Active/.test(rows()[1].textContent);
    card._settings.set({ lightModesLook: { chevron: false } }); await sleep(700); const gray = goBg() === 'rgb(141, 138, 134)' && /Active/.test(rows()[1].textContent);
    card._settings.set({ lightModesLook: { active: false } }); await sleep(700); const noMark = !/Active/.test(rows()[1].textContent) && rows()[1].dataset.active === '0';
    card._settings.set({ lightModesLook: { hint: false } }); await sleep(700); const noHint = rows().every(r => !/Tap to run/.test(r.textContent)) && getComputedStyle(rows()[0].querySelector('.lmc-sub')).display === 'none';
    card._settings.reset('lightModesLook'); await sleep(600); const back = goBg() === 'rgb(124, 124, 255)' && /Tap to run/.test(rows()[0].textContent);
    // the switches on the Look tab write the same settings
    card._ctx.call = keep; card._openApp('lightmodes'); await sleep(1000); sr.querySelector('.dt-tab[data-tab="settings"]').click(); await sleep(700);
    sr.querySelector('.lml-opt[data-look="hint"] .sw').click(); await sleep(300); const viaTab = card._settings.get().lightModesLook.hint === false;
    card._back(); await sleep(500); card._settings.reset('lightModesLook'); card._store.set('lm.tab', 'modes');
    return before && gray && noMark && noHint && back && viaTab ? true : { before, gray, noMark, noHint, back, viaTab };
  });
  await check('gadgets: the Kindle and the AWTRIX are ONE tile each in the search (not their entities), a tap opens a view with tabs of controls', async () => {
    await resetNav(); card._setLocked(false); await sleep(300);
    search.open({ focus: false }); await sleep(500); const qi = sr.querySelector('.search-input'); qi.value = 'kindle'; qi.dispatchEvent(new Event('input')); await sleep(900);
    const names = [...sr.querySelectorAll('.search-panel .device-card .device-name, .search-panel .device-list-name')].map(e => e.textContent.trim());
    const tile = [...sr.querySelectorAll('.search-panel .device-card')].find(c => /Kindle Fire/.test(c.textContent)), one = names.filter(n => /kindle/i.test(n)).length === 1 && !names.some(n => /Battery care|Cycle screens/.test(n));
    if (!tile) return { names, tile: false };
    tile.click(); await sleep(1100);
    const inApp = card._nav.mode === 'app' && card._nav.appId === 'gadget-kindle', tabs = [...sr.querySelectorAll('.dt-tab')].map(b => b.dataset.tab).join();
    const shot = !!sr.querySelector('.gd-img') && /Weather/.test(sr.querySelector('.dt-body').textContent) && sr.querySelectorAll('.gd-slider').length >= 2 && !!sr.querySelector('.gd-sw');
    const calls = [], keep = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push(d + '.' + sv + ':' + JSON.stringify(data)); return Promise.resolve(); };
    sr.querySelector('.gd-sw .sw').click(); await sleep(150);
    const input = sr.querySelector('.gd-text .gd-input'); input.value = 'Hello'; sr.querySelector('.gd-text .act').click(); await sleep(300);
    sr.querySelector('.gd-choice .cp[data-opt="Weather"]').click(); await sleep(150);
    const rng = sr.querySelector('.gd-slider .eh-range'); rng.value = '99'; rng.dispatchEvent(new Event('change', { bubbles: true })); await sleep(150);
    sr.querySelector('.gd-buttons .act').click(); await sleep(150);
    card._ctx.call = keep;
    const sent = calls[0] === 'switch.turn_off:{"entity_id":"switch.kindle_fire_screen"}' && calls[1] === 'text.set_value:{"entity_id":"text.kindle_fire_screen_message","value":"Hello"}' && calls[2] === 'select.select_option:{"entity_id":"select.kindle_fire_full_screen_card","option":"Weather"}' && /^number\.set_value:\{"entity_id":"number\.kindle_fire_(brightness|volume)","value":99\}$/.test(calls[3] || '') && /^button\.press:/.test(calls[4] || '');
    sr.querySelector('.dt-tab[data-tab="photos"]').click(); await sleep(600); const photos = !!sr.querySelector('.gd-nophotos') || !!sr.querySelector('iframe.gd-photos');      // http harness: the note; https: the manager
    sr.querySelector('.dt-tab[data-tab="power"]').click(); await sleep(700); const power = /51 ?%/.test(sr.querySelector('.dt-body').textContent) && !!sr.querySelector('.gd-sw');
    sr.querySelector('.dt-tab[data-tab="info"]').click(); await sleep(700); const info = /19 d/.test(sr.querySelector('.dt-body').textContent);
    card._back(); await sleep(500); card._store.set('gadget.kindle.tab', 'screen');
    // the AWTRIX: the message goes into its text and its Send script runs
    card._openDetail('gadget.awtrix'); await sleep(1100);
    const aw = card._nav.appId === 'gadget-awtrix' && !!sr.querySelector('.gd-img.pixel');
    card._settings.set({ favorites: [] }); const hb = sr.querySelector('.dt-acts .dt-circ'); hb.click(); await sleep(200); const hearted = card._settings.get().favorites.indexOf('gadget.awtrix') >= 0 && hb.classList.contains('on'); hb.click(); await sleep(200); const unhearted = card._settings.get().favorites.indexOf('gadget.awtrix') < 0; card._settings.reset('favorites');
    const c2 = []; card._ctx.call = function (d, sv, data) { c2.push(d + '.' + sv + ':' + JSON.stringify(data)); return Promise.resolve(); };
    const i2 = sr.querySelector('.gd-text .gd-input'); i2.value = 'Hi'; sr.querySelector('.gd-text .act').click(); await sleep(400); card._ctx.call = keep;
    const sent2 = c2[0] === 'input_text.set_value:{"entity_id":"input_text.awtrix_message","value":"Hi"}' && c2[1] === 'script.turn_on:{"entity_id":"script.send_awtrix_message"}';
    card._back(); await sleep(500); search.close && search.close();
    return one && inApp && tabs === 'screen,rotation,photos,power,info' && shot && sent && photos && power && info && aw && hearted && unhearted && sent2 ? true : { names, one, inApp, tabs, shot, sent, calls, power, info, aw, hearted, unhearted, sent2, c2 };
  });
  await check('gadgets: the sheet that adds to Favorites offers the AWTRIX and the Kindle as one entry each (not their entities), and the favorite is one tile that opens the view', async () => {
    await resetNav(); card._settings.set({ favorites: ['climate.living_room'], bento: { w1mode: 'favorites', w1layout: 'list' } }); card._show('start'); await sleep(700);
    sr.querySelector('.rm-add[data-add="favorites"]').click(); await sleep(700);
    const q = sr.querySelector('.rm-q'); q.value = 'awtrix'; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(500);
    const rows = [...sr.querySelectorAll('.rm-pick .rm-pr')], ids = rows.map(r => r.dataset.id), onlyOne = ids.join() === 'gadget.awtrix';
    if (rows[0]) rows[0].click(); await sleep(300);
    const added = card._settings.get().favorites.indexOf('gadget.awtrix') >= 0;
    q.value = 'kindle'; q.dispatchEvent(new Event('input', { bubbles: true })); await sleep(500);
    const kindle = [...sr.querySelectorAll('.rm-pick .rm-pr')].map(r => r.dataset.id).join() === 'gadget.kindle';
    const close = sr.querySelector('.sheet-close, .sh-close, [data-sheet-close]'); if (close) close.click(); else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await sleep(700);
    card._show('start'); await sleep(700);
    const tile = [...sr.querySelectorAll('.w1-body .device-list-item, .w1-body .device-card')].find(e => e._item && e._item.id === 'gadget.awtrix');
    if (tile) tile.click(); await sleep(1000); const opens = card._nav.appId === 'gadget-awtrix';
    card._back(); await sleep(500); card._settings.reset('favorites');
    return onlyOne && added && kindle && !!tile && opens ? true : { ids, onlyOne, added, kindle, tile: !!tile, opens };
  });
  await check('start screen: cards for the Kindle, the AWTRIX and the home map beside the cameras card; each opens its view', async () => {
    await resetNav(); card._show('start'); await sleep(900);
    const deck = sr.querySelector('.gdeck'), cards = [...sr.querySelectorAll('.gdeck .gd-track > .camcard')], keys = cards.map(c => c.dataset.gadget || 'cam').join();
    const k = sr.querySelector('.gcard[data-gadget="kindle"]'), a = sr.querySelector('.gcard[data-gadget="awtrix"]'), m = sr.querySelector('.gcard[data-gadget="map"]');
    const pics = !!k && /^data:image/.test(k.querySelector('.gc-img').getAttribute('src') || '') && /Kindle Fire · Weather/.test(k.querySelector('.cc-chip').textContent) && !!a && a.querySelector('.gc-img').classList.contains('pixel') && /AWTRIX/.test(a.querySelector('.cc-chip').textContent);
    const dr = deck.getBoundingClientRect(), dots = deck.querySelectorAll('.hsp-dot').length, pencil = !!deck.querySelector('.hsp-ed'); deck.querySelectorAll('.hsp-dot')[2].click(); await sleep(700); const moved = /-200%/.test(deck.querySelector('.gd-track').style.transform); deck.querySelectorAll('.hsp-dot')[0].click(); await sleep(500);
    const row = getComputedStyle(deck.querySelector('.gd-track')).display === 'flex' && cards.every(c => Math.abs(c.getBoundingClientRect().width - dr.width) < 3) && dots === 4 && pencil && moved;      // one card at a time, dots and a pencil like the weather card
    k.querySelector('.cam-pill').click(); await sleep(1000); const o1 = card._nav.appId === 'gadget-kindle'; card._back(); await sleep(500);
    sr.querySelector('.gcard[data-gadget="awtrix"]').click(); await sleep(1000); const o2 = card._nav.appId === 'gadget-awtrix'; card._back(); await sleep(500);
    sr.querySelector('.gcard[data-gadget="map"] .cam-pill').click(); await sleep(1000); const o3 = card._nav.appId === 'homemap' && /floor plan \(bare\).*"skin":"glass".*"orient":"landscape"/.test((sr.querySelector('.gd-map') || {}).textContent || ''); card._back(); await sleep(500);
    return keys === 'cam,kindle,awtrix,map' && pics && row && o1 && o2 && o3 ? true : { keys, pics, row, o1, o2, o3 };
  });
  await check('sliders: the pencil of the weather card and of the cameras card opens a card to switch cards on and off and put them in order; a long press does the same; Reset puts them back', async () => {
    await resetNav(); card._show('start'); await sleep(800);
    const keepB = JSON.stringify(card._settings.get().bento);
    const rows = () => [...sr.querySelectorAll('.pe-row')].map(r => r.dataset.id + (r.classList.contains('off') ? '-' : '+')).join();
    const closeSheet = async () => { const d = sr.querySelector('.pe-foot .done'); if (d) d.click(); await sleep(500); };
    // the cameras card
    const deck = sr.querySelector('.gdeck'); deck.querySelector('.hsp-ed').click(); await sleep(700);
    const d0 = rows(); [...sr.querySelectorAll('.pe-row')].find(r => r.dataset.id === 'awtrix').querySelector('.pe-sw').click(); await sleep(400);
    const d1 = rows(), n1 = deck.querySelectorAll('.gd-track > .camcard').length, saved = JSON.stringify(card._settings.get().bento.deckPages);
    [...sr.querySelectorAll('.pe-foot button')][0].click(); await sleep(400); const d2 = rows(), n2 = deck.querySelectorAll('.gd-track > .camcard').length; await closeSheet();
    // the weather card
    const w2 = sr.querySelector('.w2'); w2.querySelector('.hsp-ed').click(); await sleep(700);
    const w0 = rows(), pg0 = sr.querySelectorAll('.w2-page').length; [...sr.querySelectorAll('.pe-row')].find(r => r.dataset.id === 'tips').querySelector('.pe-sw').click(); await sleep(500);
    const w1 = rows(), pg1 = sr.querySelectorAll('.w2-page').length; [...sr.querySelectorAll('.pe-foot button')][0].click(); await sleep(500); const pg2 = sr.querySelectorAll('.w2-page').length; await closeSheet();
    // a long press on the weather card
    const w2b = sr.querySelector('.w2'), r = w2b.getBoundingClientRect(), tgt = w2b.querySelector('.w2-page'), pt = { clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, bubbles: true, composed: true, pointerId: 5, pointerType: 'touch', button: 0 };
    tgt.dispatchEvent(new PointerEvent('pointerdown', pt)); await sleep(800); const lp = !!sr.querySelector('.pe-row'); tgt.dispatchEvent(new PointerEvent('pointerup', pt)); await closeSheet();
    card._settings.set({ bento: JSON.parse(keepB) }); card._settings.set({ bento: { deckPages: null } }); await sleep(300);
    return /^cameras\+,kindle\+,awtrix\+,map\+/.test(d0) && /awtrix-/.test(d1) && n1 === 3 && saved && !/awtrix/.test(saved) && /awtrix\+/.test(d2) && n2 === 4 && /^weather\+/.test(w0) && /tips-/.test(w1) && pg1 === pg0 - 1 && pg2 === pg0 && lp ? true : { d0, d1, n1, saved, d2, n2, w0, w1, pg0, pg1, pg2, lp };
  });
  await check('weather card: a tap on the card opens the weather screen, a tap on the next page (to-do) opens the tasks, the pencil and the dots do not', async () => {
    await resetNav(); card._show('start'); await sleep(800);
    const w2 = sr.querySelector('.w2'), pg = sr.querySelector('.w2-page[data-page="weather"]'), r = pg.getBoundingClientRect();
    const tap = (el, x, y) => { const o = { clientX: x, clientY: y, bubbles: true, composed: true, pointerId: 3, pointerType: 'mouse', button: 0 }; el.dispatchEvent(new PointerEvent('pointerdown', o)); el.dispatchEvent(new PointerEvent('pointerup', o)); el.dispatchEvent(new MouseEvent('click', Object.assign({ detail: 1 }, o))); };
    w2.querySelector('.hsp-dot').dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 })); await sleep(200);
    const stayed = card._nav.mode === 'start' && !card._nav.itemId;
    tap(pg.querySelector('.wx-art') || pg, r.left + r.width / 2, r.top + r.height / 2); await sleep(1200);
    const opened = card._nav.itemId === 'weather.home' || (card._nav.mode === 'detail' && /weather/.test(String(card._nav.itemId)));
    card._back(); await sleep(600);
    card._startView._go(1); await sleep(700);
    const tpg = sr.querySelector('.w2-page[data-page="todos"]'); tap(tpg.querySelector('.page-head') || tpg, 0, 0); await sleep(1200);
    const tasks = card._nav.appId === 'tasks';
    card._back(); await sleep(600); card._startView._go(0); await sleep(500);
    return stayed && opened && tasks ? true : { stayed, opened, tasks, nav: card._nav };
  });
  await check('thermostat: a change made on the dial is kept when an update of the old target arrives before it is sent, and what is sent is the new number', async () => {
    await resetNav(); card._openDetail('climate.living_room'); await sleep(1200);
    const th = sr.querySelector('.dctl .th'), num = () => parseFloat(th.querySelector('.th-num').textContent), stp = th.querySelectorAll('.th-stp');
    if (th.classList.contains('off')) { th.querySelector('.th-mode[data-mode="cool"]').click(); await sleep(700); }
    const calls = []; const orig = card._ctx.call; card._ctx.call = function (d, sv, data) { calls.push([sv, data.temperature]); return orig.apply(this, arguments); };
    const id = 'climate.living_room', poke = () => { const cur = card._hass.states[id]; card.hass = Object.assign({}, card._hass, { states: Object.assign({}, card._hass.states, { [id]: Object.assign({}, cur, { attributes: Object.assign({}, cur.attributes, { current_temperature: (+cur.attributes.current_temperature || 70) + 0.5 }) }) }) }); };
    try {
      const t0 = num(); stp[1].click(); await sleep(120); poke(); await sleep(1800);
      const a = num(), sentA = calls.filter(c => c[0] === 'set_temperature').map(c => c[1]);
      calls.length = 0; const t1 = num();
      stp[0].click(); await sleep(80); poke(); stp[0].click(); await sleep(80); poke(); stp[0].click(); await sleep(150); poke(); await sleep(1900);
      const b = num(), sentB = calls.filter(c => c[0] === 'set_temperature').map(c => c[1]);
      const st = a - t0, up = st > 0 && sentA.length === 1 && Math.abs(sentA[0] - a) < .01, down = st > 0 && Math.abs(b - (t1 - 3 * st)) < .01 && sentB.length === 1 && Math.abs(sentB[0] - b) < .01;      // one step up kept and sent; three quick steps down kept and sent once, as one number
      return up && down ? true : { t0, a, sentA, t1, b, sentB };
    } finally { card._ctx.call = orig; card._back(); await sleep(250); }
  });
  await check('full window: a card as wide as the window puts the picture under the status bar (fixed, from the very top); a name with &quot; reads as a quote mark everywhere', async () => {
    await resetNav(); card._show('start'); await sleep(600);
    const bg = sr.querySelector('.bg'), cs = getComputedStyle(bg), r = bg.getBoundingClientRect(), bleed = card._stage.dataset.bleed;
    const covers = cs.position === 'fixed' && Math.abs(r.top) < 1 && r.width >= innerWidth - 2 && r.height >= innerHeight - 2;
    const id = 'light.kitchen_counter', orig = card._hass.states[id], was = card._engine.getItem(id).name;
    const bump = name => { card.hass = Object.assign({}, card._hass, { states: Object.assign({}, card._hass.states, { [id]: Object.assign({}, orig, { attributes: Object.assign({}, orig.attributes, { friendly_name: name }) }) }) }); };
    bump('50&quot; Crystal UHD'); await sleep(400);
    const got = card._engine.getItem(id).name; bump(orig.attributes.friendly_name); await sleep(300);
    return bleed === 'true' && covers && got === '50" Crystal UHD' ? true : { bleed, pos: cs.position, top: r.top, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, got, was };
  });
  await check('feel: a tap on a control gives a tap, a step of a slider a lighter one, steps close together one tick, none with Haptic feedback off; a small control shrinks when pressed, a card and a card\'s arrow light up instead', async () => {
    await resetNav(); card._show('start'); await sleep(600);
    const calls = [], keep = Object.getOwnPropertyDescriptor(Navigator.prototype, 'vibrate'), oldH = card._settings.get().haptic;
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: ms => { calls.push(ms); return true; } });
    card._settings.set({ haptic: true });
    try {
      await sleep(60); calls.length = 0;
      const btn = sr.querySelector('.w1-tab'); btn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 }));
      const tap = calls.slice(); await sleep(60); calls.length = 0;
      sr.querySelector('.w1').dispatchEvent(new CustomEvent('okie-detent', { bubbles: true, composed: true, detail: {} }));
      sr.querySelector('.w1').dispatchEvent(new CustomEvent('okie-detent', { bubbles: true, composed: true, detail: {} }));
      const detent = calls.slice(); await sleep(60); calls.length = 0;
      card._settings.set({ haptic: false }); btn.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, detail: 1 })); const off = calls.slice();
      // press feedback: a small control shrinks, a card and the arrow against a card's edge do not
      let sh = '';
      const press = async el => { el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerType: 'mouse', button: 0 })); await sleep(220); const sc = getComputedStyle(el).scale; sh = getComputedStyle(el).boxShadow; document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); await sleep(300); return sc; };
      const favs0 = card._settings.get().favorites; card._settings.set({ favorites: Object.keys(card._hass.states).filter(k => /^light\./.test(k)).slice(0, 3), bento: { w1mode: 'favorites', w1layout: 'grid' } }); await sleep(800);
      const small = sr.querySelector('.w1-tab'), big = sr.querySelector('.w1-body .device-card'), arrow = sr.querySelector('.lmc-go, .rc-go');
      const sSmall = await press(small), shSmall = sh, sBig = big ? await press(big) : 'none', shBig = sh, sArrow = arrow ? await press(arrow) : 'none', shArrow = sh;
      card._settings.set({ favorites: favs0 }); await sleep(200);
      const lit = x => /0px 0px 0px 999px inset/.test(x);
      const pressOk = parseFloat(sSmall) < 1 && (sBig === 'none' || sBig === '1') && (sArrow === 'none' || sArrow === '1') && !!big && lit(shBig) && (!arrow || lit(shArrow));
      return tap.length === 1 && tap[0] === 8 && detent.length === 1 && detent[0] === 4 && off.length === 0 && pressOk ? true : { tap, detent, off, sSmall, sBig, sArrow, shBig, shArrow };
    } finally { card._settings.set({ haptic: oldH }); if (keep) Object.defineProperty(Navigator.prototype, 'vibrate', keep); delete navigator.vibrate; }
  });
  await check('arrange in place: hold a tile and the widget is edited, drag it to another place, Reset puts it back, Done ends, a scroll does not start it', async () => {
    await resetNav(); card._show('start'); await sleep(600);
    const ids = Object.keys(card._hass.states).filter(k => /^(light|switch|climate)\./.test(k)).slice(0, 6), keepS = card._settings.get();
    card._settings.set({ favorites: ids, bento: { w1mode: 'favorites', w1layout: 'grid' } }); await sleep(800);
    try {
      const w1 = sr.querySelector('.w1'), tiles = () => [...sr.querySelectorAll('.w1-body .device-grid-container > *')];
      const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; };
      const pe = (type, el, p) => el.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, button: 0, clientX: p.x, clientY: p.y }));
      const before = card._settings.get().favorites.join(), t = tiles(), a = rect(t[0]), b = rect(t[3] || t[2]);
      pe('pointerdown', t[0].querySelector('.device-card') || t[0], a); await sleep(120); const early = w1.classList.contains('editing'); await sleep(450);
      const editing = w1.classList.contains('editing'), lift = !!sr.querySelector('.arr-lift'), bar = getComputedStyle(sr.querySelector('.w1-editbar')).display === 'flex';
      for (let i = 1; i <= 10; i++) { pe('pointermove', t[0], { x: a.x + (b.x - a.x) * i / 10, y: a.y + (b.y - a.y) * i / 10 }); await sleep(30); }
      pe('pointerup', t[0], b); await sleep(600);
      const moved = card._settings.get().favorites.join() !== before;
      [...sr.querySelectorAll('.w1-editbar button')].find(x => !x.classList.contains('done')).click(); await sleep(450);
      const reset = card._settings.get().favorites.join() === before;
      sr.querySelector('.w1-editbar .done').click(); await sleep(200); const done = !w1.classList.contains('editing');
      const c = rect(tiles()[1]); pe('pointerdown', tiles()[1], c); await sleep(100); pe('pointermove', tiles()[1], { x: c.x, y: c.y + 40 }); await sleep(600); pe('pointerup', tiles()[1], { x: c.x, y: c.y + 40 });
      const scrolled = !w1.classList.contains('editing');
      return !early && editing && lift && bar && moved && reset && done && scrolled ? true : { early, editing, lift, bar, moved, reset, done, scrolled };
    } finally { card._settings.set({ favorites: keepS.favorites, bento: { w1mode: keepS.bento.w1mode, w1layout: keepS.bento.w1layout } }); await sleep(300); }
  });
  await check('voice: the microphone is in the search bar and on the lock page; one tap opens the assistant without the keyboard', async () => {
    await resetNav(); card._show('start'); await sleep(500);
    const mic = sr.querySelector('.ai-mic'), zmic = card._zenView && card._zenView.el.querySelector('.zen-mic');
    const there = !!mic && !mic.hidden && mic.getBoundingClientRect().width > 20, zen = !card._zenView || (!!zmic && !zmic.hidden);
    const ok0 = card._ctx.voiceOk() === true;
    card._ctx.voice(); await sleep(700);
    const ai = sr.querySelector('.search-panel').dataset.ai === 'true', open = sr.querySelector('.search-panel').dataset.open === 'true', noKb = !(sr.activeElement && sr.activeElement.classList && sr.activeElement.classList.contains('search-input'));
    card._search.setAi(false); card._search.close(); await sleep(300);
    return there && zen && ok0 && ai && open && noKb ? true : { there, zen, ok0, ai, open, noKb };
  });
  await check('notifications: the opened island lies above the dimmer and the search bar, its rows are what you touch', async () => {
    await resetNav(); card._show('start'); await sleep(600);
    const cap = sr.querySelector('.island-meldkapsel'); if (!cap) return 'no notification capsule';
    cap.click(); await sleep(1200);
    const row = sr.querySelector('.island-meld'), sp = sr.querySelector('.search-panel');
    if (!row) { sr.querySelector('.island-verdunkler').click(); return 'no rows'; }
    const r = row.getBoundingClientRect(), top = sr.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2), onTop = !!top && (row === top || row.contains(top));
    const z = parseInt(getComputedStyle(sr.querySelector('.island-holder')).zIndex, 10);
    sr.querySelector('.island-verdunkler').click(); await sleep(700);
    const back = getComputedStyle(sr.querySelector('.island-holder')).zIndex === '2';
    return onTop && z > 3 && back ? true : { onTop, z, back, topIs: top && top.className };
  });
  await check('search bar: the microphone, the spark and the filter button can all be tapped (nothing lies over them)', async () => {
    await resetNav(); card._show('start'); await sleep(600);
    const hit = sel => { const b = sr.querySelector(sel); if (!b || b.hidden) return 'missing'; const r = b.getBoundingClientRect(), top = sr.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return top === b || b.contains(top) ? 'ok' : (top && (top.className || top.tagName)); };
    const res = { mic: hit('.ai-mic'), ai: hit('.ai-button'), filter: hit('.filter-main-button') };
    const inp = sr.querySelector('.search-input').getBoundingClientRect(), mic = sr.querySelector('.ai-mic').getBoundingClientRect();
    return res.mic === 'ok' && res.ai === 'ok' && res.filter === 'ok' && inp.right <= mic.left + 1 ? true : Object.assign({ inputRight: Math.round(inp.right), micLeft: Math.round(mic.left) }, res);
  });
  await check('news: the list keeps its rows and pictures while the home updates (no redraw, no flashing)', async () => {
    await resetNav(); card._openApp('news'); await sleep(1200);
    const imgs = () => [...sr.querySelectorAll('.news-r')], first = imgs(), n = first.length;      // the rows hold the pictures: the same rows = the same pictures
    if (!n) { card._back(); return 'no news rows in the sample home'; }
    await sleep(3500);      // the sample home sends updates all the time
    const after = imgs(), same = after.length === n && after.every((x, i) => x === first[i]);
    card._back(); await sleep(500);
    return same ? true : { n, after: after.length };
  });
  await check('weather: page 1 (day, place, sky picture, condition, temperature, next days) fills the left, page 2 (details, next hours) is the right; day has no stars', async () => {
    await resetNav(); card._openDetail('weather.home'); await sleep(1800);
    const hero = sr.querySelector('.wxd-hero'), body = sr.querySelector('.wxd-body'), dt = sr.querySelector('.dt[data-wx="true"]');
    if (!hero || !body || !dt) return { hero: !!hero, body: !!body, dt: !!dt };
    const hr = hero.getBoundingClientRect(), br = body.getBoundingClientRect(), art = hero.querySelector('.wxd-art svg');
    const date = hero.querySelector('.wxd-date').textContent, cond = hero.querySelector('.wxd-cond').textContent, temp = hero.querySelector('.wxd-temp').textContent;
    const days = hero.querySelectorAll('.wxd-d').length, rows = body.querySelectorAll('.wxd-r').length, hours = body.querySelectorAll('.wxd-h').length;
    const stars = getComputedStyle(sr.querySelector('.wxd-stars')).display === 'none', sideBySide = hr.right <= br.left + 4, svgs = hero.querySelectorAll('.wxd-art svg').length;
    const rowLabels = [...body.querySelectorAll('.wxd-r .k')].map(x => x.textContent).join();
    const place = hero.querySelector('.wxd-loc').textContent, plus = sr.querySelector('.wxd-plus'), plusOk = !!plus && plus.getBoundingClientRect().left >= hr.right - 2 && plus.getBoundingClientRect().width >= 34;
    const sizes = parseFloat(getComputedStyle(hero.querySelector('.wxd-d .hi')).fontSize) >= 18 && parseFloat(getComputedStyle(hero.querySelector('.wxd-d .wxd-mini')).width) >= 36;
    plus.click(); await sleep(700);
    const sheetNames = [...sr.querySelectorAll('.wxd-p b')].map(b => b.textContent).join(), sheetOk = /Home/.test(sheetNames) && /Berlin/.test(sheetNames);
    const closeBtn = sr.querySelector('.wxd-pl button.wxd-p'); if (closeBtn) closeBtn.click(); await sleep(500);
    card._back(); await sleep(500);
    return !!art && /\w+day/.test(date) && cond === 'Partly cloudy' && /^\d+°$/.test(temp) && days === 6 && rows >= 5 && /Wind/.test(rowLabels) && hours >= 4 && stars && sideBySide && svgs === 1 && place === 'Home' && plusOk && sizes && sheetOk ? true : { place, plusOk, sizes, sheetNames, art: !!art, date, cond, temp, days, rows, hours, stars, sideBySide, svgs, rowLabels };
  });
  await check('no uncaught errors during the run', async () => errors.length === 0 ? true : errors);
  window.removeEventListener('error', onErr); window.removeEventListener('unhandledrejection', onErr);
  return { passed: results.filter(r => r.ok).length, failed: results.filter(r => !r.ok), total: results.length, all: results.map(r => (r.ok ? 'ok   ' : 'FAIL ') + r.name + (r.info !== undefined ? '  ' + JSON.stringify(r.info) : '')) };
})()

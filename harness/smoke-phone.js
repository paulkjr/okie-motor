/* Phone smoke test for the thermostat. Open the harness at phone size (393 x 852) as
 *   index.html?f=1&open=climate.living_room&zen=0&pump=1&header=1
 * then evaluate:  await (await fetch('/okie-motor/harness/smoke-phone.js')).text().then(t => (0, eval)(t))
 * Not shipped. */
(async function () {
  const card = document.getElementById('card'), sr = card.shadowRoot, sleep = ms => new Promise(r => setTimeout(r, ms));
  const out = {}, R = e => e.getBoundingClientRect();
  await sleep(1200);
  out.phone = innerWidth <= 640 && card._mobile === true;
  const glass = R(sr.querySelector('.detail-wrap')), th = R(sr.querySelector('.th')), body = R(sr.querySelector('.dt-body'));
  out.gaps = { left: Math.round(th.left - glass.left), right: Math.round(glass.right - th.right), bottom: Math.round(glass.bottom - th.bottom) };
  const gw = R(sr.querySelector('.th-gaugewrap')); out.gaps.wheelBottom = Math.round(glass.bottom - gw.bottom);
  out.fills = out.gaps.wheelBottom <= 8 && out.gaps.bottom <= 12 && Math.abs(out.gaps.right) <= 2 && Math.abs(out.gaps.left) <= 2;      // no card inside the glass: the dial runs to its edges                // no card inside the glass: the dial fills it edge to edge
  out.tall = th.height > 380;
  const num = R(sr.querySelector('.th-num'));
  out.numShare = Math.round(num.width / th.width * 100);                                                                      // the original project's number is about half the card's width
  out.bigNumber = out.numShare >= 20 && out.numShare <= 60;                                                                   // the wide design's number, in the phone's glass
  out.clearsWheel = num.right < th.left + 0.66 * th.width - 4;                                                                // the wheel's ticks start at 66 % of the width
  out.noScroll = sr.querySelector('.dt-body').scrollHeight <= sr.querySelector('.dt-body').clientHeight + 1;
  const power = R(sr.querySelector('.th-power')), modes = R(sr.querySelector('.th-modes'));
  out.insideCard = power.bottom <= th.bottom && modes.bottom <= th.bottom && power.right <= th.right;
  // where the wheel's ticks really are: the circle of the scene (centre 425,150, radius 150) mapped through the viewBox onto the card
  const vb = sr.querySelector('.th-gauge').getAttribute('viewBox').split(/\s+/).map(Number), sc = th.width / vb[2];
  const cx = th.left + (425 - vb[0]) * sc, cy = th.top + (150 - vb[1]) * sc, rr = 150 * sc;
  const arcX = y => { const d = Math.abs(y - cy); return d >= rr ? Infinity : cx - Math.sqrt(rr * rr - d * d); };
  const clear = e => { const r = R(e); return r.right < Math.min(arcX(r.top), arcX(r.bottom), arcX(Math.max(r.top, Math.min(cy, r.bottom)))) - 6; };      // 6 px air to the nearest tick
  out.schedClearsWheel = clear(sr.querySelector('.th-sched')) && clear(sr.querySelector('.th-modes')) && clear(sr.querySelector('.th-num')) && clear(sr.querySelector('.th-now'));
  out.clearDetail = ['.th-sched', '.th-modes', '.th-num', '.th-now'].map(q => { const r = R(sr.querySelector(q)); return q + ':' + Math.round(r.right) + '/' + Math.round(Math.min(arcX(r.top), arcX(r.bottom), arcX(Math.max(r.top, Math.min(cy, r.bottom))))); }).join(' ');
  // the ring of the active mode (5 px past its circle) stays clear of the label under it
  out.modeAir = [...sr.querySelectorAll('.th-mode')].every(m => R(m.querySelector('.th-mode-l')).top - R(m.querySelector('.th-mode-ic')).bottom >= 7);
  // the icons sit in the middle of their circles
  out.iconsCentred = [...sr.querySelectorAll('.th-mode-ic')].map(c => { const svg = c.querySelector('svg'), g = svg.firstElementChild; const b = svg.getBBox(); return Math.abs(b.x + b.width / 2 - 12) < 0.6 && Math.abs(b.y + b.height / 2 - 12) < 0.6; }).every(Boolean);
  const pw2 = R(sr.querySelector('.th-power')); out.powerCentred = Math.abs((pw2.left + pw2.right) / 2 - (th.left + th.right) / 2) <= 3;
  // the other tabs keep the usual padding: nothing of them touches the glass edge (only the dial runs edge to edge)
  const tabsOk = {};
  for (const id of ['history', 'schedule', 'settings']) {
    sr.querySelector('.dt-tab[data-tab="' + id + '"]').click(); await sleep(1000);
    const g2 = R(sr.querySelector('.detail-wrap')), els = [...sr.querySelectorAll('.dt-body .tabwrap > *')].filter(e => R(e).width > 0);
    tabsOk[id] = els.length > 0 && Math.min(...els.map(e => R(e).left - g2.left)) >= 12 && Math.min(...els.map(e => g2.right - R(e).right)) >= 12;
  }
  out.otherTabs = tabsOk; out.otherTabsOk = Object.values(tabsOk).every(Boolean);
  // the five tabs sit behind a round bubble: closed = only the bubble shows; a tap opens the row, a choice (or a tap elsewhere) closes it; no name/state title on a phone, the - / + buttons are there
  const menu = sr.querySelector('.dt-menu'), bub = sr.querySelector('.dt-bubble'), bar = sr.querySelector('.dt-bar'), op = e => parseFloat(getComputedStyle(e).opacity);
  const closedOk = getComputedStyle(bub).display !== 'none' && op(bar) < 0.05 && R(bub).width > 28 && R(bub).width < 40;
  bub.click(); await sleep(500);
  const openedOk = menu.classList.contains('open') && op(bar) > 0.95 && op(bub) < 0.05 && R(bar).width > 170;
  sr.querySelector('.dt-tab[data-tab="schedule"]').click(); await sleep(1000);
  const pickedOk = !menu.classList.contains('open') && sr.querySelector('.dt-tab.on').dataset.tab === 'schedule' && bub.querySelector('svg') && bub.getAttribute('aria-label').indexOf('(menu)') > 0;
  bub.click(); await sleep(400); sr.querySelector('.dt-body').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true, pointerId: 3 })); await sleep(400);
  const outsideOk = !menu.classList.contains('open');
  out.bubble = { closedOk, openedOk, pickedOk: !!pickedOk, outsideOk }; out.bubbleOk = closedOk && openedOk && !!pickedOk && outsideOk;
  sr.querySelector('.dt-tab[data-tab="controls"]').click(); await sleep(900);
  out.noTitle = getComputedStyle(sr.querySelector('.th-title')).display !== 'none' && sr.querySelectorAll('.th-stp').length === 2;      // like the wide design: the name and what it does at the top of the glass
  out.back = Math.abs(Math.round(R(sr.querySelector('.th')).left - R(sr.querySelector('.detail-wrap')).left)) <= 2;
  // Settings (the app shell) keeps a plain, visible tab bar on a phone: its options (General, Design, ...) must be reachable
  sr.querySelector('.dt-circ[aria-label]') && card._back(); await sleep(700);
  card._ctx.openApp('settings'); await sleep(1500);
  const sb = sr.querySelector('.dt-bar'), sbr = sb && sb.getBoundingClientRect();
  out.settingsBar = !!sb && !sb.closest('.dt-menu') && parseFloat(getComputedStyle(sb).opacity) > 0.95 && sb.querySelectorAll('.dt-tab').length >= 3 && sbr.width > 120 && sbr.width < 380 && sbr.height > 30 && getComputedStyle(sb).display !== 'none';
  card._back(); await sleep(700);
  // the calendar: the new-event form and the calendars list fit the phone (nothing wider than the screen), their fields are dark glass, and the month shows colour dots, not titles
  card._ctx.openApp('calendar'); await sleep(1300);
  out.calWeek = !!sr.querySelector('.cal-agenda') && !sr.querySelector('.wk') && !sr.querySelector('.cwk');      // it opens on the week, which is the day list
  sr.querySelector('.dt-tab[data-tab="month"]').click(); await sleep(700);
  out.calDots = sr.querySelectorAll('.mgdots i').length > 8 && !sr.querySelector('.mgc .ev') && !!sr.querySelector('.cal-sheet .cal-grab') && !!sr.querySelector('.cal-strip .cs.on');
  const fitIn = (sel) => { const w = sr.querySelector('.ov-win'); if (!w) return 'no sheet'; const wr = w.getBoundingClientRect(); const els = [...w.querySelectorAll(sel)].filter(e => e.getBoundingClientRect().width > 0); return wr.left >= 0 && wr.right <= innerWidth + 1 && els.every(e => { const r = e.getBoundingClientRect(); return r.left >= wr.left - 1 && r.right <= wr.right + 1; }); };
  sr.querySelector('.dt-acts .dt-circ').click(); await sleep(900);
  const formFits = fitIn('input, select, textarea, .segment, .chiprow'), fieldBg = getComputedStyle(sr.querySelector('.cf .s-text')).backgroundColor;
  sr.querySelector('.ov-close').click(); await sleep(400);
  sr.querySelectorAll('.dt-acts .dt-circ')[1].click(); await sleep(900);
  const listFits = fitIn('.cs-row, .cs-help'); sr.querySelector('.ov-close').click(); await sleep(400);
  out.calForm = { formFits, listFits, fieldBg }; out.calOk = out.calWeek && out.calDots && formFits === true && listFits === true && /rgba\(255, 255, 255, 0\.\d+\)/.test(fieldBg);
  card._back(); await sleep(700);
  // the server screen on a phone: the apps come first, then the status cards, all inside the screen width
  card._ctx.openApp('server'); await sleep(2000);
  const body0 = sr.querySelector('.dt-body'), kids = body0 ? [...body0.children].map(e => e.className) : [], bb = body0 && body0.getBoundingClientRect();
  const tilesIn = [...sr.querySelectorAll('.sv-tile, .sv-card')].every(e => { const r = e.getBoundingClientRect(); return r.width === 0 || (r.left >= bb.left - 1 && r.right <= bb.right + 1); });
  out.server = { order: kids.join('|'), tilesIn, tiles: sr.querySelectorAll('.sv-tile').length, hero: !sr.querySelector('.dt-hero > .sv-stack') };
  out.serverOk = /sv-main.*sv-stack.*sv-two/.test(out.server.order) && tilesIn && out.server.tiles === 9 && out.server.hero;
  card._back(); await sleep(700);
  // the music screen on a phone: the square picture, the keys and the pill all inside the screen
  window.__okieFetch = () => Promise.resolve({ ok: true, json: () => Promise.resolve({ syncedLyrics: '[00:00.50] Alpha line', plainLyrics: '' }) });
  card._ctx.openApp('music'); await sleep(1600);
  const mu = sr.querySelector('.mu'), mr = mu && mu.getBoundingClientRect(), art0 = sr.querySelector('.mu-art') && sr.querySelector('.mu-art').getBoundingClientRect(), keys0 = sr.querySelector('.mu-keys') && sr.querySelector('.mu-keys').getBoundingClientRect();
  out.music = { art: art0 && [Math.round(art0.width), Math.round(art0.height)], inside: !!mr && !!art0 && art0.left >= mr.left - 1 && art0.right <= mr.right + 1 && keys0.bottom <= mr.bottom + 1 && keys0.right <= mr.right + 1 };
  out.musicOk = !!art0 && art0.width >= 200 && art0.width / art0.height > 0.9 && art0.width / art0.height < 1.02 && out.music.inside;
  card._back(); await sleep(700);
  return { ok: out.musicOk && out.serverOk && out.calOk && out.settingsBar && out.bubbleOk && out.noTitle && out.otherTabsOk && out.back && out.phone && out.fills && out.tall && out.noScroll && out.insideCard && out.bigNumber && out.clearsWheel && out.schedClearsWheel && out.iconsCentred && out.modeAir && out.powerCentred, out };
})()

// Dev only: drives widget/preview-big.html: the Context tab (the websocket answer), the Dial look panel (sliders change the wheel, Reset puts it back).
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 60 && !window.__ready; i++) await sleep(100);
  await sleep(1500);
  const f = document.getElementById('f'), w = f.contentWindow, d = f.contentDocument, out = {};
  const q = s => d.querySelector(s), qa = s => [...d.querySelectorAll(s)];
  out.ticksDefault = qa('#wheel line').length;
  w.selectTab('context'); await sleep(1500);
  out.ctxRows = qa('#ctxbody .row .nm').map(n => n.textContent).join('|');
  out.ctxAsked = (window.__wsCalls[0] || {}).type === 'search/related';
  w.selectTab('settings'); await sleep(900);
  out.panel = qa('.sg-h').map(x => x.textContent).join() === 'Thermostat,Dial,This device' && qa('.sg-card .thl-r').length === 5 && qa('.thl-color').length === 4 && !q('.thl-prev');
  const set = (i, v) => { const el = qa('.sg-card .thl-r')[i]; el.value = v; el.dispatchEvent(new Event('input')); el.dispatchEvent(new Event('change')); };
  set(2, 40); await sleep(300);                                   // Marks 40 %
  out.undoShown = !q('.sg-undo').hidden || qa('.sg-undo').some(b => !b.hidden);
  const c = q('.thl-color'); c.value = '#00ff88'; c.dispatchEvent(new Event('input')); c.dispatchEvent(new Event('change')); await sleep(200);
  out.saved = JSON.parse(w.localStorage.getItem('okie_look') || '{}');
  w.selectTab('controls'); await sleep(1200);
  out.ticks40 = qa('#wheel line').length;
  w.selectTab('settings'); await sleep(900);
  q('.sg-btn').click(); await sleep(600);
  w.selectTab('controls'); await sleep(1200);
  out.ticksBack = qa('#wheel line').length;
  out.savedAfterReset = JSON.parse(w.localStorage.getItem('okie_look') || 'null');
  out.ok = out.ticksDefault === 197 && /Movie time/.test(out.ctxRows) && /Cool down/.test(out.ctxRows) && out.ctxAsked && out.panel && out.undoShown && out.saved.c0 === '#00ff88' && out.saved.ticks === 40 && out.ticks40 === 79 && out.ticksBack === 197 && Object.keys(out.savedAfterReset || {}).length === 0;
  return out;
})()

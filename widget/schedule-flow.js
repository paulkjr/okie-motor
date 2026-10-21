// Dev only: drives widget/preview-big.html (open it in a browser, then evaluate this file in the page): the whole weekly schedule - add, edit, switch, profile, delete - against the mock Home Assistant.
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  for (let i = 0; i < 60 && !window.__ready; i++) await sleep(100);
  await sleep(1500);
  const f = document.getElementById('f'), w = f.contentWindow, d = f.contentDocument, out = {};
  const q = s => d.querySelector(s), qa = s => [...d.querySelectorAll(s)];
  w.selectTab('schedule'); await sleep(1500);
  out.tabs = qa('.ts-day').length === 7 && !!q('.note') && !!q('.ts-add');
  q('.ts-add').click(); await sleep(500);
  q('.chip[data-profile="eco"]').click(); await sleep(200);
  out.nameEco = q('.ts-name').value === 'Eco';
  out.degrees = [q('.ts-st.heat .ts-stv').textContent, q('.ts-st.cool .ts-stv').textContent].join('/');
  qa('.ts-quick .chip')[1].click(); await sleep(100);
  q('.act.primary').click(); await sleep(1500);
  const add = window.__schedCalls[0] || [], slot = add[1] && add[1].timeslots && add[1].timeslots[0];
  out.acts = slot ? slot.actions.map(a => a.service + ':' + JSON.stringify(a.service_data)).join('|') : '';
  out.days = add[1] && add[1].weekdays.join();
  out.rows = qa('.ts-row').length; out.chips = qa('.ts-row .ts-chip').map(c => c.textContent).join('/'); out.name = (q('.ts-row .ts-nm') || {}).textContent;
  // edit
  q('.ts-row').click(); await sleep(500);
  qa('.ts-st.cool .ts-stb')[1].click(); await sleep(100);
  q('.act.primary').click(); await sleep(1500);
  const ed = window.__schedCalls[1] || [];
  out.edit = ed[0] === 'edit' && ed[1].timeslots[0].actions[2].service_data.target_temp_high > 27 && !('stop' in ed[1].timeslots[0]);
  // switch off and on
  q('.ts-row .sw').click(); await sleep(900);
  out.off = q('.ts-row').classList.contains('off') && window.__sched[0].enabled === false;
  q('.ts-row .sw').click(); await sleep(900);
  // profile
  q('.ts-prof-h').click(); await sleep(300);
  const row = q('.ts-prow[data-profile="eco"]');
  for (let i = 0; i < 4; i++) row.querySelectorAll('.ts-st.heat .ts-stb')[0].click();
  await sleep(1400);
  const own = JSON.parse(w.localStorage.getItem('okie_profiles') || '{}');
  out.profSaved = !!own.eco && own.eco.low < 62;
  const upd = q('.ts-prow[data-profile="eco"] .ts-upd'); out.updShown = !!upd && /1/.test(upd.textContent);
  if (upd) { upd.click(); await sleep(1500); }
  const last = window.__schedCalls[window.__schedCalls.length - 1] || [];
  out.updated = last[0] === 'edit' && own.eco && last[1].timeslots[0].actions[2].service_data.target_temp_low === own.eco.low;
  // delete
  q('.ts-row').click(); await sleep(400); q('.act.danger').click(); await sleep(5200);
  out.removed = window.__schedCalls.some(c => c[0] === 'remove') && !window.__sched.length;
  out.ok = out.tabs && out.nameEco && out.acts === 'climate.set_preset_mode:{"preset_mode":"none"}|climate.set_hvac_mode:{"hvac_mode":"heat_cool"}|climate.set_temperature:{"target_temp_low":62,"target_temp_high":80}' && out.rows === 1 && out.edit && out.off && out.profSaved && out.updShown && out.updated && out.removed;
  return out;
})()

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../src/okie-notify.js');

const item = (id, extra) => Object.assign({ id, domain: id.split('.')[0], name: id, area: 'Hall', labels: [] }, extra || {});
const st = (state, attrs, ago) => ({ state, attributes: attrs || {}, last_changed: new Date(Date.now() - (ago || 0)).toISOString() });

test('derived alerts: smoke is critical, water leak critical, problem a warning', () => {
  const items = [item('binary_sensor.smoke', { deviceClass: 'smoke' }), item('binary_sensor.leak', { deviceClass: 'moisture' }), item('binary_sensor.fault', { deviceClass: 'problem' }), item('binary_sensor.door', { deviceClass: 'door' })];
  const states = { 'binary_sensor.smoke': st('on'), 'binary_sensor.leak': st('on'), 'binary_sensor.fault': st('on'), 'binary_sensor.door': st('on') };
  const a = N.deriveAlerts(items, states, { lang: 'en' });
  assert.deepEqual(a.map(x => x.severity), ['critical', 'critical', 'warning']);
  assert.ok(a.find(x => x.text === 'Smoke detected' && x.title === 'binary_sensor.smoke'), 'device is the title, the reason the second line (like FSC)');
  assert.ok(a.find(x => x.text === 'Water leak'));
  assert.ok(!a.find(x => x.entity === 'binary_sensor.door'), 'an open door is not an alert');
});

test('derived alerts: quiet sensors, German titles, triggered alarm, jammed lock', () => {
  const items = [item('binary_sensor.smoke', { deviceClass: 'smoke' }), item('alarm_control_panel.home'), item('lock.front')];
  const states = { 'binary_sensor.smoke': st('off'), 'alarm_control_panel.home': st('triggered'), 'lock.front': st('jammed') };
  const a = N.deriveAlerts(items, states, { lang: 'de' });
  assert.deepEqual(a.map(x => x.text), ['Alarm ausgelöst', 'Schloss klemmt']);
});

test('battery sensors warn at or below the threshold only', () => {
  const items = [item('sensor.a_battery', { deviceClass: 'battery' }), item('sensor.b_battery', { deviceClass: 'battery' }), item('sensor.c_battery', { deviceClass: 'battery' })];
  const states = { 'sensor.a_battery': st('9'), 'sensor.b_battery': st('15'), 'sensor.c_battery': st('80') };
  const a = N.deriveAlerts(items, states, { lang: 'en', batteryThreshold: 15 });
  assert.deepEqual(a.map(x => x.entity).sort(), ['sensor.a_battery', 'sensor.b_battery']);
  assert.ok(a[0].text.includes('%'));
  assert.equal(N.deriveAlerts(items, states, { lang: 'en', batteryThreshold: 15, numericBattery: false }).length, 0, 'FSC has no percentage warnings: the card turns them off by default');
  assert.equal(N.deriveAlerts(items, states, { batteryThreshold: 5 }).length, 0);
});

test('excluded entities never raise alerts', () => {
  const items = [item('binary_sensor.smoke', { deviceClass: 'smoke' })];
  assert.equal(N.deriveAlerts(items, { 'binary_sensor.smoke': st('on') }, { isExcluded: () => true }).length, 0);
});

test('sorting: severity first, then newest', () => {
  const s = N.sortNotes([{ id: 1, severity: 'info', ts: 9 }, { id: 2, severity: 'critical', ts: 1 }, { id: 3, severity: 'warning', ts: 5 }, { id: 4, severity: 'warning', ts: 8 }]);
  assert.deepEqual(s.map(x => x.id), [2, 4, 3, 1]);
});

test('persistent notifications map to notes; error-ish titles become warnings', () => {
  const a = N.fromPersistent({ notification_id: 'x', title: 'Backup failed', message: 'disk full', created_at: '2026-10-05T10:00:00Z' });
  assert.equal(a.severity, 'warning'); assert.equal(a.persistent, 'x'); assert.equal(a.source, 'home-assistant');
  const b = N.fromPersistent({ notification_id: 'y', message: 'Welcome home', created_at: '2026-10-05T10:00:00Z' });
  assert.equal(b.severity, 'info'); assert.equal(b.title, 'Welcome home'); assert.equal(b.text, '');
});

test('filter by severity and source; summary capsule counts', () => {
  const list = [{ severity: 'critical', source: 'safety' }, { severity: 'warning', source: 'battery' }, { severity: 'warning', source: 'system' }, { severity: 'info', source: 'home-assistant' }];
  assert.equal(N.filterNotes(list, { severity: 'warning' }).length, 2);
  assert.equal(N.filterNotes(list, { source: 'safety' }).length, 1);
  assert.equal(N.filterNotes(list, { severity: 'warning', source: 'battery' }).length, 1);
  assert.equal(N.filterNotes(list, { severity: 'all', source: 'all' }).length, 4);
  const s = N.summary(list);
  assert.deepEqual(s.counts, { critical: 1, warning: 2, info: 1 }); assert.equal(s.top, 'critical'); assert.equal(s.total, 4);
  assert.equal(N.summary([]).top, null);
  assert.deepEqual(N.sources(list), ['battery', 'home-assistant', 'safety', 'system']);
});

test('quiet hours silence info toasts but never errors or warnings', () => {
  assert.equal(N.toastAllowed('info', true), false);
  assert.equal(N.toastAllowed('success', true), false);
  assert.equal(N.toastAllowed('error', true), true);
  assert.equal(N.toastAllowed('warning', true), true);
  assert.equal(N.toastAllowed('info', false), true);
});

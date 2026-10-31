'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const S = require('../src/okie-server.js');

const st = (state, attrs) => ({ state: String(state), attributes: attrs || {} });
const SYS = () => ({
  'sensor.system_monitor_processor_use': st(8, { unit_of_measurement: '%' }),
  'sensor.system_monitor_processor_temperature': st(96.8, { unit_of_measurement: '°F' }),
  'sensor.system_monitor_memory_usage': st(78.2, { unit_of_measurement: '%' }),
  'sensor.system_monitor_memory_use': st(12400.5, { unit_of_measurement: 'MiB' }),
  'sensor.system_monitor_memory_free': st(3456.3, { unit_of_measurement: 'MiB' }),
  'sensor.system_monitor_disk_usage': st(41.3, { unit_of_measurement: '%' }),
  'sensor.system_monitor_disk_use': st(90.9, { unit_of_measurement: 'GiB' }),
  'sensor.system_monitor_disk_free': st(129.4, { unit_of_measurement: 'GiB' }),
  'sensor.system_monitor_load_5_min': st(0.44),
  'sensor.system_monitor_uptime': st('2026-09-28T19:38:49+00:00', { device_class: 'timestamp' }),
});

test('stats: processor, memory, storage, load and uptime from the System Monitor sensors, in GB', () => {
  const now = Date.parse('2026-10-14T19:38:49+00:00'), r = S.readStats(SYS(), now);
  assert.equal(r.cpu.pct, 8); assert.deepEqual(r.temp, { v: 96.8, unit: '°F' }); assert.equal(r.load, 0.44);
  assert.equal(r.ram.pct, 78.2); assert.ok(Math.abs(r.ram.usedGiB - 12.1099) < 0.01, 'MiB become GB'); assert.ok(Math.abs(r.ram.totalGiB - (12400.5 + 3456.3) / 1024) < 0.01, 'total = used + free');
  assert.equal(r.disk.pct, 41.3); assert.ok(Math.abs(r.disk.totalGiB - 220.3) < 0.01);
  assert.equal(r.uptimeMs, 16 * 86400000);
});

test('stats: what is missing stays null; unavailable counts as missing; a percent is worked out when only sizes exist', () => {
  assert.deepEqual(S.readStats({}, 1), { cpu: null, temp: null, ram: null, disk: null, load: null, uptimeMs: null });
  const s = SYS(); s['sensor.system_monitor_processor_use'] = st('unavailable'); delete s['sensor.system_monitor_memory_usage']; delete s['sensor.system_monitor_disk_usage'];
  const r = S.readStats(s, Date.parse('2026-10-14T00:00:00Z'));
  assert.equal(r.cpu, null);
  assert.ok(Math.abs(r.ram.pct - 12400.5 / (12400.5 + 3456.3) * 100) < 0.01);
  assert.ok(Math.abs(r.disk.pct - 90.9 / 220.3 * 100) < 0.05);
  assert.equal(S.readStats({ 'sensor.processor_use': st(150, {}) }, 1).cpu.pct, 100, 'a percent never leaves 0..100');
});

test('network sensors: the busiest real interface wins, docker and bridges are ignored', () => {
  const s = {
    'sensor.system_monitor_network_throughput_in_docker0': st(5), 'sensor.system_monitor_network_throughput_out_docker0': st(5),
    'sensor.system_monitor_network_throughput_in_enp0s31f6': st(0.4), 'sensor.system_monitor_network_throughput_out_enp0s31f6': st(0.01),
    'sensor.system_monitor_network_throughput_in_br_38bd': st(9), 'sensor.system_monitor_network_throughput_out_br_38bd': st(9),
    'sensor.system_monitor_network_throughput_in_wlan0': st(0.1), 'sensor.system_monitor_network_throughput_out_wlan0': st(0),
  };
  const ids = S.netIds(s); assert.equal(ids.iface, 'enp0s31f6'); assert.equal(ids.inId, 'sensor.system_monitor_network_throughput_in_enp0s31f6');
  assert.deepEqual(S.readRates(s, ids), { inV: 0.4, outV: 0.01, unit: 'MB/s' });
  assert.equal(S.netIds({}), null); assert.equal(S.readRates({}, null), null);
  const only = { 'sensor.network_throughput_in_docker0': st(1), 'sensor.network_throughput_out_docker0': st(1) };
  assert.equal(S.netIds(only).iface, 'docker0', 'with nothing real, a virtual one is better than none');
  assert.equal(S.netIds({ 'sensor.system_monitor_network_throughput_in_eth0': st(1) }), null, 'both directions are needed');
});

test('internet and public address come from the router sensors or anything that looks like them', () => {
  assert.deepEqual(S.readNetwork({ 'binary_sensor.eero_wan_status': st('on'), 'sensor.eero_external_ip': st('68.200.198.47') }), { connected: true, publicIp: '68.200.198.47' });
  assert.deepEqual(S.readNetwork({ 'binary_sensor.eero_wan_status': st('off') }), { connected: false, publicIp: null });
  assert.deepEqual(S.readNetwork({ 'binary_sensor.fritz_internet_connection': st('on'), 'sensor.fritz_external_ip': st('1.2.3.4') }), { connected: true, publicIp: '1.2.3.4' });
  assert.deepEqual(S.readNetwork({ 'binary_sensor.eero_wan_status': st('unavailable') }), { connected: null, publicIp: null });
  assert.deepEqual(S.readNetwork({}), { connected: null, publicIp: null });
});

test('backup and updates', () => {
  const b = S.readBackup({ 'sensor.backup_last_successful_automatic_backup': st('2026-10-14T07:01:21+00:00'), 'sensor.backup_next_scheduled_automatic_backup': st('2026-10-15T07:00:00+00:00'), 'sensor.backup_backup_manager_state': st('idle') });
  assert.equal(b.last, Date.parse('2026-10-14T07:01:21+00:00')); assert.equal(b.next, Date.parse('2026-10-15T07:00:00+00:00')); assert.equal(b.state, 'idle');
  assert.equal(S.readBackup({}), null); assert.equal(S.readBackup({ 'sensor.backup_last_successful_automatic_backup': st('unknown') }), null);
  const u = S.readUpdates({ 'update.hass_n8n_update': st('on', { friendly_name: 'n8n Update', installed_version: '1.2', latest_version: '1.3' }), 'update.a': st('off', {}), 'update.core': st('on', { friendly_name: 'Home Assistant Core Update', installed_version: '1', latest_version: '2' }), 'light.x': st('on') });
  assert.deepEqual(u.map(x => x.name), ['Home Assistant Core', 'n8n']); assert.equal(u[1].latest, '1.3');
});

test('apps: the starting list is the old Server Utility links; a typed one gets https://, a unique id and a safe icon; the search is by name', () => {
  assert.equal(S.DEFAULT_APPS.length, 9); S.DEFAULT_APPS.forEach(a => { assert.ok(a.id && a.name && a.url && a.icon && a.color); });
  assert.deepEqual(S.DEFAULT_APPS.filter(a => S.isInternal(a.url)).map(a => a.id), ['files', 'n8n'], 'two open Home Assistant pages, the rest are web addresses');
  assert.equal(new Set(S.DEFAULT_APPS.map(a => a.id)).size, S.DEFAULT_APPS.length);
  const a = S.sanitizeApp({ name: ' Grafana ', url: 'grafana.local:3000', icon: 'chart' }, ['adguard']);
  assert.equal(a.name, 'Grafana'); assert.equal(a.url, 'https://grafana.local:3000'); assert.equal(a.id, 'grafana'); assert.equal(a.icon, 'chart');
  assert.equal(S.sanitizeApp({ name: 'Grafana', url: '/lovelace/x', icon: 'nonsense' }, ['grafana']).id, 'grafana-2'); assert.equal(S.sanitizeApp({ name: 'x', url: '/p', icon: 'nonsense' }, []).icon, 'server');
  assert.equal(S.sanitizeApp({ name: '', url: 'x' }), null); assert.equal(S.sanitizeApp({ name: 'x', url: '  ' }), null);
  assert.equal(S.sanitizeApp({ name: 'x', url: 'http://a.b' }).url, 'http://a.b', 'a full address is kept as typed');
  assert.deepEqual(S.appsFilter(S.DEFAULT_APPS, 'jelly').map(x => x.id), ['jellyfin']); assert.equal(S.appsFilter(S.DEFAULT_APPS, '  ').length, 9); assert.equal(S.appsFilter(S.DEFAULT_APPS, 'zzz').length, 0);
});

test('words and numbers: tones, storage state, sizes, rates, uptime, when', () => {
  assert.deepEqual([0, 69, 70, 89, 90, 100].map(S.tone), ['ok', 'ok', 'warn', 'warn', 'bad', 'bad']); assert.equal(S.tone(null), 'ok');
  assert.deepEqual([10, 84, 85, 94, 95, 99].map(S.storageState), ['healthy', 'healthy', 'filling', 'filling', 'full', 'full']);
  assert.equal(S.fmtSize(12.11), '12.1 GB'); assert.equal(S.fmtSize(220.3), '220 GB'); assert.equal(S.fmtSize(1500), '1.5 TB'); assert.equal(S.fmtSize(null), '–');
  assert.equal(S.fmtRate(0.013, 'MB/s'), '13 KB/s'); assert.equal(S.fmtRate(0.42), '420 KB/s'); assert.equal(S.fmtRate(2.5), '2.5 MB/s'); assert.equal(S.fmtRate(25), '25 MB/s'); assert.equal(S.fmtRate(500, 'kB/s'), '500 KB/s');
  assert.equal(S.fmtUptime(16 * 86400000, 'en'), '16 days'); assert.equal(S.fmtUptime(5 * 3600000, 'en'), '5 h'); assert.equal(S.fmtUptime(120000, 'de'), '2 Min.'); assert.equal(S.fmtUptime(16 * 86400000, 'de'), '16 Tage'); assert.equal(S.fmtUptime(null, 'en'), '');
  const now = new Date(2026, 9, 14, 12).getTime();
  assert.match(S.whenText(new Date(2026, 9, 14, 3, 1).getTime(), now, 'en', '12h'), /^Today 3:01\s?AM$/);
  assert.equal(S.whenText(new Date(2026, 9, 15, 15, 0).getTime(), now, 'en', '24h'), 'Tomorrow 15:00');
  assert.match(S.whenText(new Date(2026, 9, 13, 8, 0).getTime(), now, 'de', '24h'), /^Gestern 08:00$/);
  assert.match(S.whenText(new Date(2026, 9, 20, 8, 0).getTime(), now, 'en', '24h'), /^Oct 20 08:00$/);
});

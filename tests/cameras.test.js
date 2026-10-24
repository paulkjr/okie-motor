'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/okie-cameras.js');

const st = (state, attrs) => ({ state, attributes: attrs || {} });
const states = {
  'camera.front_door_live_view': st('idle', { friendly_name: 'Front Door Live view', entity_picture: '/api/camera_proxy/camera.front_door_live_view?token=x' }),
  'camera.patio': st('streaming', { friendly_name: 'Patio' }),
  'camera.garage_cam': st('unavailable', { friendly_name: 'Garage' }),
  'binary_sensor.front_door_ding': st('on', { device_class: 'occupancy' }),
  'binary_sensor.front_door_motion': st('off', { device_class: 'motion' }),
  'binary_sensor.patio_motion': st('on', { device_class: 'motion' }),
  'binary_sensor.hallway_motion': st('on', { device_class: 'motion' }),     // not near any camera
  'binary_sensor.kitchen_window': st('on', { device_class: 'window' }),
  'light.kitchen': st('on'),
};

test('cameras: the name an integration appends is stripped to match sensors', () => {
  assert.equal(C.cameraKey('camera.front_door_live_view'), 'front_door');
  assert.equal(C.cameraKey('camera.garage_cam'), 'garage');
  assert.equal(C.cameraKey('camera.driveway_snapshot_hd'), 'driveway');
  assert.equal(C.cameraKey('camera.patio'), 'patio');
  assert.equal(C.cameraKey('camera.live_view'), 'live_view');          // never strip a name down to nothing
});

test('cameras: only sensors that are on and look like motion or a ring count', () => {
  assert.equal(C.isAlertSensor('binary_sensor.patio_motion', st('on', { device_class: 'motion' })), true);
  assert.equal(C.isAlertSensor('binary_sensor.front_door_ding', st('on', {})), true);
  assert.equal(C.isAlertSensor('binary_sensor.kitchen_window', st('on', { device_class: 'window' })), false);
  assert.equal(C.isAlertSensor('light.patio_motion', st('on')), false);
});

test('cameras: a sensor belongs to the camera whose name it starts with, others to nobody', () => {
  const a = C.cameraAlerts(states, ['camera.front_door_live_view', 'camera.patio', 'camera.garage_cam']);
  assert.deepEqual(a.byCamera['camera.front_door_live_view'], ['binary_sensor.front_door_ding']);   // the motion sensor is off
  assert.deepEqual(a.byCamera['camera.patio'], ['binary_sensor.patio_motion']);
  assert.deepEqual(a.byCamera['camera.garage_cam'], []);
  assert.equal(a.total, 2);                                                                        // hallway motion is nobody's
});

test('cameras: the longer name wins when two cameras share a start', () => {
  const s = { 'camera.front': st('idle'), 'camera.front_door': st('idle'), 'binary_sensor.front_door_motion': st('on', { device_class: 'motion' }) };
  const a = C.cameraAlerts(s, ['camera.front', 'camera.front_door']);
  assert.deepEqual(a.byCamera['camera.front_door'], ['binary_sensor.front_door_motion']);
  assert.deepEqual(a.byCamera['camera.front'], []);
});

test('cameras: list order is alerts first, working next, offline last, each by name', () => {
  const list = C.listCameras(states);
  assert.deepEqual(list.map(c => c.id), ['camera.front_door_live_view', 'camera.patio', 'camera.garage_cam']);
  assert.equal(list[0].name, 'Front Door Live view');
  assert.equal(list[2].unavailable, true);
  assert.equal(list[0].alerts.length, 1);
});

test('cameras: hidden offline cameras and excluded ones drop out', () => {
  assert.deepEqual(C.listCameras(states, { hideUnavailable: true }).map(c => c.id), ['camera.front_door_live_view', 'camera.patio']);
  assert.deepEqual(C.listCameras(states, { excluded: id => id === 'camera.patio' }).map(c => c.id), ['camera.front_door_live_view', 'camera.garage_cam']);
  assert.deepEqual(C.listCameras({ 'light.a': st('on') }), []);
});

test('cameras: Home Assistant\'s Ring integration reports motion and the doorbell as event entities; they count for two minutes', () => {
  const now = Date.parse('2026-10-07T12:00:00Z');
  const s = {
    'camera.front_door_live_view': st('idle'),
    'event.front_door_ding': st('2026-10-07T11:59:30.000+00:00', { device_class: 'doorbell' }),     // 30 s ago
    'event.front_door_motion': st('2026-10-06T21:09:49.807+00:00', { device_class: 'motion' }),      // yesterday
    'event.backyard_motion': st('2026-10-07T11:59:50.000+00:00', { device_class: 'motion' }),        // fresh, but no camera of that name
    'event.front_door_other': st('unknown', { device_class: 'motion' }),
  };
  assert.equal(C.isAlertSensor('event.front_door_ding', s['event.front_door_ding'], now), true);
  assert.equal(C.isAlertSensor('event.front_door_motion', s['event.front_door_motion'], now), false);
  assert.equal(C.isAlertSensor('event.front_door_other', s['event.front_door_other'], now), false);
  const a = C.cameraAlerts(s, ['camera.front_door_live_view'], now);
  assert.deepEqual(a.byCamera['camera.front_door_live_view'], ['event.front_door_ding']);
  assert.equal(a.total, 1);
  const later = C.cameraAlerts(s, ['camera.front_door_live_view'], now + 100000);                    // 2 min 10 s after the ring
  assert.equal(later.total, 0);
  assert.equal(C.listCameras(s, { now })[0].alerts.length, 1);
});

const T0 = Date.parse('2026-10-07T15:00:00Z');
const sources = [{ id: 'event.front_door_motion', camera: 'camera.front_door_live_view' }, { id: 'event.front_door_ding', camera: 'camera.front_door_live_view' }, { id: 'binary_sensor.front_door_motion', camera: 'camera.front_door_live_view' }];
const states2 = {
  'camera.front_door_live_view': st('idle', { friendly_name: 'Front Door Live view' }),
  'event.front_door_motion': st('2026-10-07T14:30:00.000+00:00', { device_class: 'motion' }),
  'event.front_door_ding': st('2026-10-07T10:00:00.000+00:00', { device_class: 'doorbell' }),
  'binary_sensor.front_door_motion': st('off', { device_class: 'motion' }),
  'image.patio_last_motion': st('2026-10-07T14:30:05.200000+00:00', { entity_picture: '/api/image_proxy/image.patio_last_motion?token=abc', kind: 'motion' }),
  'image.awtrix_live_view': st('2026-10-07T14:59:00+00:00', { entity_picture: '/x' }),
};

test('cameras: the last motion picture is the image entity whose name says so, or the one named in the settings', () => {
  const lm = C.lastMotionImage(states2);
  assert.equal(lm.id, 'image.patio_last_motion');
  assert.equal(lm.kind, 'motion');
  assert.equal(lm.ts, Date.parse('2026-10-07T14:30:05.200Z'));
  assert.equal(lm.picture.indexOf('/api/image_proxy/') === 0, true);
  assert.equal(C.lastMotionImage(states2, 'image.awtrix_live_view').id, 'image.awtrix_live_view');   // an explicit choice wins
  assert.equal(C.lastMotionImage({ 'image.logo': st('x') }), null);
  assert.equal(C.lastMotionImage({}), null);
});

test('cameras: the sources of motion and rings for a camera are found whatever they say right now', () => {
  const src = C.alertSources(states2, ['camera.front_door_live_view']);
  assert.deepEqual(src.map(s => s.id).sort(), ['binary_sensor.front_door_motion', 'event.front_door_ding', 'event.front_door_motion']);
  assert.equal(src.every(s => s.camera === 'camera.front_door_live_view'), true);
  assert.equal(C.kindOf('event.front_door_ding', states2['event.front_door_ding']), 'ring');
  assert.equal(C.kindOf('event.front_door_motion', states2['event.front_door_motion']), 'motion');
});

test('cameras: history rows become events, newest first, and a sensor and an event of the same moment count once', () => {
  const res = {
    'event.front_door_motion': [{ s: '2026-10-07T13:00:00.000+00:00', lu: 1 }, { s: '2026-10-07T14:30:00.000+00:00', lu: 2 }],
    'event.front_door_ding': [{ s: '2026-10-07T10:00:00.000+00:00', lu: 3 }],
    'binary_sensor.front_door_motion': [{ s: 'on', lu: Date.parse('2026-10-07T14:30:01Z') / 1000 }, { s: 'off', lu: Date.parse('2026-10-07T14:31:00Z') / 1000 }],
  };
  const ev = C.eventsFromHistory(res, sources, states2);
  assert.deepEqual(ev.map(e => [new Date(e.ts).toISOString().slice(11, 16), e.kind]), [['14:30', 'motion'], ['13:00', 'motion'], ['10:00', 'ring']]);
  assert.equal(C.eventsFromHistory({}, sources, states2).length, 0);
  assert.equal(C.eventsFromHistory(null, sources, states2).length, 0);
  assert.equal(C.eventsFromHistory(res, sources, states2, 0).length, 4);                         // without the merge window the sensor counts too
});

test('cameras: events are grouped by day, newest day first', () => {
  const day = h => Date.parse('2026-10-07T00:00:00') + h * 3600000;
  const ev = [{ ts: day(14) }, { ts: day(9) }, { ts: day(-5) }, { ts: day(-30) }];
  const gr = C.groupByDay(ev, day(15));
  assert.deepEqual(gr.map(x => [x.daysAgo, x.events.length]), [[0, 2], [1, 1], [2, 1]]);
});

test('cameras: what is new is what happened after the history was last opened', () => {
  const ev = [{ ts: 300 }, { ts: 200 }, { ts: 100 }];
  assert.equal(C.unseenCount(ev, 150), 2);
  assert.equal(C.unseenCount(ev, 300), 0);
  assert.equal(C.unseenCount(ev, 0), 3);
  assert.equal(C.unseenCount([], 5), 0);
});

test('cameras: the recordings page is only the clipsUrl you set (nothing is guessed), recordings:false turns it off', () => {
  const https = { protocol: 'https:', hostname: 'home.example.org' };
  assert.equal(C.recordingsBase({}, https), '');
  assert.equal(C.recordingsBase({ clipsUrl: 'https://x.test/clips' }, https), 'https://x.test/clips');
  assert.equal(C.recordingsBase({ recordings: false }, https), '');
  assert.equal(C.recordingsBase({ recordings: false, clipsUrl: 'https://x.test' }, https), '');
  assert.equal(C.recordingsBase({}, { protocol: 'http:', hostname: 'homeassistant.local' }), '');      // plain http: no guess
  assert.equal(C.recordingsBase(undefined, undefined), '');
});

test('cameras: the link to one event carries its time in seconds and asks for the frame version of the page', () => {
  assert.equal(C.recordingLink('https://h:8765/ring', 1791679512345), 'https://h:8765/ring?ts=1791679512&embed=1');
  assert.equal(C.recordingLink('https://h/ring?x=1', 5000), 'https://h/ring?x=1&ts=5&embed=1');
  assert.equal(C.recordingLink('', 5000), '');
});

test('the recordings address from the settings: a web address or a path, never javascript: or data: (settings can be imported from a file)', () => {
  const bad = ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', ' javascript:alert(1)', 'data:text/html,<script>1</script>', 'vbscript:x', 'file:///etc/passwd', '', null, undefined, 42, {}];
  bad.forEach(v => assert.equal(C.safeHttpUrl(v), '', 'dropped: ' + String(v)));
  ['https://example.org/ring', 'http://192.0.2.5:8765/ring', '/local/clips.html', 'clips/index.html'].forEach(v => assert.equal(C.safeHttpUrl(v), v));
  const https = { protocol: 'https:', hostname: 'ha.example.org' };
  assert.equal(C.recordingsBase({ clipsUrl: 'javascript:alert(1)' }, https), '', 'a bad address is dropped, not replaced by a guess');
  assert.equal(C.recordingsBase({ clipsUrl: 'https://example.org/ring' }, https), 'https://example.org/ring');
  assert.equal(C.recordingLink('javascript:alert(1)', 1000), '', 'the link to a clip checks its base too');
  assert.match(C.recordingLink('https://example.org/ring', 1000), /^https:\/\/example\.org\/ring\?ts=1&embed=1$/);
});

'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const V = require('../src/okie-vac-sched.js');

const VAC = 'vacuum.robo_home';
const kitchen = { id: 'j1', name: 'Kitchen mop', kind: 'mop', command: 'start', params: { regions: [{ region_id: '1', type: 'rid' }], ordered: 1 } };

test('vacuum jobs: saved jobs are cleaned, broken and doubled ones dropped, built-in names are not taken', () => {
  const jobs = V.jobsFrom([kitchen, { id: 'j1', name: 'double', command: 'start' }, { id: 'j2', name: '', command: 'start' }, { id: 'j3', name: 'x', command: '  ' }, { id: 'clean', name: 'Clean', command: 'start' }, null, 'x',
    { id: 'j4', name: ' Spot ', kind: 'weird', command: ' start ', params: [] }]);
  assert.deepEqual(jobs.map(j => j.id), ['j1', 'j4']);
  assert.equal(jobs[1].name, 'Spot'); assert.equal(jobs[1].kind, 'other'); assert.equal(jobs[1].command, 'start'); assert.equal(jobs[1].params, null);
  assert.deepEqual(V.jobsFrom(undefined), []);
  assert.equal(V.cleanJob({ id: 'j', name: 'n'.repeat(80), command: 'start' }).name.length, 40);
});

test('vacuum jobs: the parameters box takes a JSON object or nothing', () => {
  assert.deepEqual(V.parseParams(''), { ok: true, value: null });
  assert.deepEqual(V.parseParams('  '), { ok: true, value: null });
  assert.deepEqual(V.parseParams('{"ordered":1}'), { ok: true, value: { ordered: 1 } });
  assert.equal(V.parseParams('[1]').ok, false);
  assert.equal(V.parseParams('"x"').ok, false);
  assert.equal(V.parseParams('{bad').ok, false);
  assert.equal(V.parseParams('null').ok, false);
});

test('vacuum jobs: the service call and the schedule actions of each job', () => {
  assert.deepEqual(V.jobCall({ id: 'clean' }, VAC), { domain: 'vacuum', service: 'start', data: { entity_id: VAC } });
  assert.deepEqual(V.jobCall({ id: 'dock' }, VAC), { domain: 'vacuum', service: 'return_to_base', data: { entity_id: VAC } });
  assert.deepEqual(V.jobCall(kitchen, VAC), { domain: 'vacuum', service: 'send_command', data: { entity_id: VAC, command: 'start', params: kitchen.params } });
  assert.deepEqual(V.jobCall({ id: 'j9', command: 'resume' }, VAC).data, { entity_id: VAC, command: 'resume' }, 'no params key when there are none');
  assert.deepEqual(V.jobActions({ id: 'clean' }, VAC), [{ service: 'vacuum.start', entity_id: VAC }]);
  assert.deepEqual(V.jobActions({ id: 'dock' }, VAC), [{ service: 'vacuum.return_to_base', entity_id: VAC }]);
  assert.deepEqual(V.jobActions(kitchen, VAC), [{ service: 'vacuum.send_command', entity_id: VAC, service_data: { command: 'start', params: kitchen.params } }]);
});

test('vacuum schedule: a slot is read back as the job that made it', () => {
  const jobs = V.jobsFrom([kitchen]);
  assert.deepEqual(V.readSlot({ actions: V.jobActions({ id: 'clean' }, VAC) }, VAC, jobs), { job: 'clean' });
  assert.deepEqual(V.readSlot({ actions: V.jobActions({ id: 'dock' }, VAC) }, VAC, jobs), { job: 'dock' });
  assert.deepEqual(V.readSlot({ actions: V.jobActions(kitchen, VAC) }, VAC, jobs), { job: 'j1' });
  // the same command with the keys in another order is still that job
  const swapped = { actions: [{ service: 'vacuum.send_command', entity_id: VAC, service_data: { params: { ordered: 1, regions: [{ type: 'rid', region_id: '1' }] }, command: 'start' } }] };
  assert.deepEqual(V.readSlot(swapped, VAC, jobs), { job: 'j1' });
  // a command that is not in the list stays readable
  const other = V.readSlot({ actions: [{ service: 'vacuum.send_command', entity_id: VAC, service_data: { command: 'start', params: { ordered: 0 } } }] }, VAC, jobs);
  assert.equal(other.job, 'other'); assert.equal(other.command, 'start');
  assert.deepEqual(V.readSlot({ actions: [{ service: 'vacuum.turn_on', entity_id: VAC }] }, VAC, jobs), { job: 'clean' });
  assert.equal(V.readSlot({ actions: [{ service: 'vacuum.locate', entity_id: VAC }] }, VAC, jobs).job, 'other');
  // not this vacuum, or not a vacuum action
  assert.equal(V.readSlot({ actions: V.jobActions({ id: 'clean' }, 'vacuum.other') }, VAC, jobs), null);
  assert.equal(V.readSlot({ actions: [{ service: 'light.turn_on', entity_id: VAC }] }, VAC, jobs), null);
  assert.equal(V.readSlot(null, VAC, jobs), null);
  // an action that names the entity inside its data (the other way the Scheduler stores it)
  assert.deepEqual(V.readSlot({ actions: [{ service: 'vacuum.start', service_data: { entity_id: VAC } }] }, VAC, jobs), { job: 'clean' });
});

test('vacuum schedule: the entries of the Scheduler list, one per slot, with days and times', () => {
  const jobs = V.jobsFrom([kitchen]);
  const list = [
    { schedule_id: 'a', entity_id: 'switch.schedule_a', name: 'Cat litter', weekdays: ['daily'], enabled: true, timeslots: [{ start: '16:00:00', actions: V.jobActions(kitchen, VAC) }] },
    { schedule_id: 'b', name: '', weekdays: ['workday'], enabled: false, timeslots: [{ start: '09:30:00', actions: V.jobActions({ id: 'clean' }, VAC) }, { start: '17:00:00', actions: V.jobActions({ id: 'dock' }, VAC) }] },
    { schedule_id: 'c', name: 'Light', weekdays: ['daily'], timeslots: [{ start: '07:00:00', actions: [{ service: 'light.turn_on', entity_id: 'light.x' }] }] },
    { schedule_id: 'd', name: 'Sun', weekdays: ['sat'], timeslots: [{ start: 'sunrise', actions: V.jobActions({ id: 'clean' }, VAC) }] },
  ];
  const e = V.entriesFor(list, VAC, jobs);
  assert.deepEqual(e.map(x => x.sid + ':' + x.job), ['a:j1', 'b:clean', 'b:dock', 'd:clean']);
  assert.equal(e[0].time, '16:00'); assert.equal(e[0].days.length, 7); assert.equal(e[0].sw, 'switch.schedule_a');
  assert.equal(e[1].sw, 'switch.schedule_b'); assert.deepEqual(e[1].days, ['mon', 'tue', 'wed', 'thu', 'fri']); assert.equal(e[1].enabled, false);
  assert.equal(e[2].slot, 1); assert.equal(e[2].slots, 2);
  assert.equal(e[3].time, null, 'a sunrise start has no clock time');
  assert.equal(V.jobOf(e[0], jobs).id, 'j1'); assert.equal(V.jobOf(e[1], jobs).id, 'clean'); assert.equal(V.jobOf({ job: 'other' }, jobs), null);
});

test('vacuum jobs: ids are new and params compare without caring about key order', () => {
  const a = V.newJobId([{ id: 'x' }]), b = V.newJobId([{ id: a }]);
  assert.ok(/^j[0-9a-z]+$/.test(a)); assert.notEqual(a, b);
  assert.equal(V.stable({ b: 1, a: [2, { d: 1, c: 2 }] }), V.stable({ a: [2, { c: 2, d: 1 }], b: 1 }));
  assert.notEqual(V.stable({ a: 1 }), V.stable({ a: 2 }));
});

test('vacuum+: favorites become jobs, with a picture from their name; they are not saved', () => {
  const f = V.favJobs([{ id: 'a', name: 'Vacuum and Mop Everywhere' }, { id: 'b', name: 'Around Litter box' }, { id: 'c', name: 'Vacuum Everywhere' }, { id: 'd', name: 'Mop the kitchen' }, { name: 'no id' }, null]);
  assert.deepEqual(f.map(j => j.id), ['fav:a', 'fav:b', 'fav:c', 'fav:d']);
  assert.deepEqual(f.map(j => j.kind), ['both', 'room', 'vacuum', 'mop']);
  assert.deepEqual(V.jobCalls(f[0], VAC), [{ domain: 'roomba_plus', service: 'run_favorite', data: { entity_id: VAC, favorite_id: 'a' } }]);
  assert.deepEqual(V.jobActions(f[0], VAC), [{ service: 'roomba_plus.run_favorite', entity_id: VAC, service_data: { favorite_id: 'a' } }]);
  assert.equal(V.cleanJob({ id: 'fav:a', name: 'x', command: 'start' }), null, 'a saved job cannot take a favorite id');
  assert.deepEqual(V.favJobs(undefined), []);
});

test('vacuum+: a room job cleans rooms and zones in a mode with one or two passes', () => {
  const room = V.cleanJob({ id: 'r1', name: 'Kitchen mop', type: 'rooms', regions: ['Living Room', 'Living Room', ' '], zones: ['Kitchen '], mode: 'mop', passes: 'two' });
  assert.deepEqual([room.type, room.kind, room.regions, room.zones, room.mode, room.passes], ['rooms', 'mop', ['Living Room'], ['Kitchen '], 'mop', 'two']);
  assert.deepEqual(V.jobCalls(room, VAC), [
    { domain: 'roomba_plus', service: 'clean_room', data: { entity_id: VAC, room_name: ['Living Room'], cleaning_mode: 'mop', two_pass: true } },
    { domain: 'roomba_plus', service: 'clean_zone', data: { entity_id: VAC, zone_name: ['Kitchen '], cleaning_mode: 'mop', two_pass: true } }]);
  const plain = V.cleanJob({ id: 'r2', name: 'Bedroom', type: 'rooms', regions: ['Bedroom'], mode: 'weird', passes: 'maybe' });
  assert.deepEqual([plain.mode, plain.passes, plain.kind], ['', '', 'room']);
  assert.deepEqual(V.jobActions(plain, VAC), [{ service: 'roomba_plus.clean_room', entity_id: VAC, service_data: { room_name: ['Bedroom'] } }], 'no mode or pass keys when they are left on default');
  assert.equal(V.cleanJob({ id: 'r3', name: 'Nothing', type: 'rooms', regions: [], zones: [] }), null);
  assert.equal(V.cleanJob({ id: 'r4', name: 'One', type: 'rooms', regions: ['A'], passes: 'one' }).passes, 'one');
  assert.equal(V.jobCalls(V.cleanJob({ id: 'r5', name: 'One', type: 'rooms', regions: ['A'], passes: 'one' }), VAC)[0].data.two_pass, false);
  assert.deepEqual(['vacuum_and_mop', 'vacuum_then_mop', 'vacuum', 'mop', ''].map(V.roomsKind), ['both', 'both', 'vacuum', 'mop', 'room']);
});

test('vacuum+: favorites and room jobs are found again in the slots they made', () => {
  const jobs = [...V.favJobs([{ id: 'a', name: 'Vacuum and Mop Everywhere' }]), V.cleanJob({ id: 'r1', name: 'Kitchen mop', type: 'rooms', regions: ['Living Room'], zones: ['Kitchen '], mode: 'mop' })];
  assert.equal(V.readSlot({ actions: V.jobActions(jobs[0], VAC) }, VAC, jobs).job, 'fav:a');
  assert.equal(V.readSlot({ actions: V.jobActions(jobs[1], VAC) }, VAC, jobs).job, 'r1', 'two actions of one job');
  const half = V.readSlot({ actions: [V.jobActions(jobs[1], VAC)[0]] }, VAC, jobs);          // only one of the two: no longer that job
  assert.equal(half.job, 'other');
  assert.equal(V.readSlot({ actions: [{ service: 'roomba_plus.run_favorite', entity_id: VAC, service_data: { favorite_id: 'zzz' } }] }, VAC, jobs).job, 'other', 'a favorite that is gone');
  // the Scheduler may put the entity inside the data, or hand it back as a list
  assert.equal(V.readSlot({ actions: [{ service: 'roomba_plus.run_favorite', service_data: { entity_id: VAC, favorite_id: 'a' } }] }, VAC, jobs).job, 'fav:a');
  assert.equal(V.readSlot({ actions: [{ service: 'roomba_plus.run_favorite', entity_id: [VAC], service_data: { favorite_id: 'a' } }] }, VAC, jobs).job, 'fav:a');
});

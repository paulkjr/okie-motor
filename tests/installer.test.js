'use strict';
// End-to-end guard for dist/okie-install.py against a PRISTINE copy of upstream Hemma:
// check, install, idempotent re-run (no duplicated block), --only-motor, uninstall (byte-for-byte restore).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const HEMMA = path.join(ROOT, '..', 'Hemma');
const INST = path.join(ROOT, 'dist', 'okie-install.py');
const have = fs.existsSync(INST) && fs.existsSync(path.join(HEMMA, '.git')) && spawnSync('python3', ['--version']).status === 0;

function pristine() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'okie-cfg-'));
  execSync(`git -C "${HEMMA}" archive HEAD custom_components themes | tar -x -C "${dir}"`);
  return dir;
}
const run = (root, ...args) => spawnSync('python3', [INST, '--root', root, ...args], { encoding: 'utf8' });
const rd = (root, rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const CORE = 'custom_components/hemma/scripts/hemma-core.js';
const FILES = [CORE, 'custom_components/hemma/const.py', 'themes/hemma/hemma.yaml', 'custom_components/hemma/panel/hemma-templates.json'];

test('installer: check changes nothing and reports six ready edits', { skip: !have }, () => {
  const root = pristine(); const before = FILES.map(f => rd(root, f));
  const r = run(root, '--check');
  assert.equal(r.status, 0, r.stderr + r.stdout);
  assert.equal((r.stdout.match(/^ready /gm) || []).length, 6);
  assert.deepEqual(FILES.map(f => rd(root, f)), before);
  assert.ok(!fs.existsSync(path.join(root, 'custom_components/hemma/scripts/okie-motor.js')));
});

test('installer: install, re-run is a no-op (no duplicated scrollbar block), uninstall restores bytes', { skip: !have }, () => {
  const root = pristine(); const orig = FILES.map(f => rd(root, f));
  assert.equal(run(root).status, 0);
  const installed = FILES.map(f => rd(root, f));
  assert.match(rd(root, 'custom_components/hemma/const.py'), /"okie-motor\.js"/);
  assert.equal((rd(root, CORE).match(/_hemmaScrollbarInit = true/g) || []).length, 1);
  assert.ok(fs.statSync(path.join(root, 'custom_components/hemma/scripts/okie-motor.js')).size > 100000);
  const again = run(root);
  assert.equal(again.status, 0);
  assert.equal((again.stdout.match(/^ready /gm) || []).length, 0, again.stdout);
  assert.deepEqual(FILES.map(f => rd(root, f)), installed, 'second run changed nothing');
  assert.equal((rd(root, CORE).match(/_hemmaScrollbarInit = true/g) || []).length, 1, 'still exactly one block');
  assert.doesNotThrow(() => JSON.parse(rd(root, 'custom_components/hemma/panel/hemma-templates.json')));
  assert.equal(run(root, '--uninstall').status, 0);
  assert.deepEqual(FILES.map(f => rd(root, f)), orig, 'originals restored byte for byte');
  assert.ok(!fs.existsSync(path.join(root, 'custom_components/hemma/scripts/okie-motor.js')));
});

test('installer: --only-motor leaves the Hemma look files alone', { skip: !have }, () => {
  const root = pristine(); const orig = FILES.map(f => rd(root, f));
  assert.equal(run(root, '--only-motor').status, 0);
  const now = FILES.map(f => rd(root, f));
  assert.notEqual(now[1], orig[1], 'const.py registers the bundle');
  [0, 2, 3].forEach(i => assert.equal(now[i], orig[i], FILES[i] + ' untouched'));
});

test('installer: refuses cleanly when Hemma is missing or a file does not match', { skip: !have }, () => {
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'okie-empty-'));
  const r = run(empty);
  assert.notEqual(r.status, 0); assert.match(r.stderr, /Hemma was not found/);
  const root = pristine();
  fs.appendFileSync(path.join(root, 'custom_components/hemma/const.py'), '\n');
  fs.writeFileSync(path.join(root, CORE), rd(root, CORE).split('width: fit-content;').join('width: max-content;'));   // every occurrence, so the anchor really changes
  const bad = run(root);
  assert.notEqual(bad.status, 0); assert.match(bad.stderr, /Nothing was changed/);
  assert.ok(!fs.existsSync(path.join(root, 'custom_components/hemma/scripts/okie-motor.js')), 'nothing written on a mismatch');
});

test('bundle: version stamp matches package.json and the changelog; the bundle parses', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const Y = require('../src/okie-system.js');
  assert.equal(Y.CHANGELOG[0].v, pkg.version, 'bump CHANGELOG in okie-system.js when package.json changes');
  const bundle = path.join(ROOT, 'dist', 'okie-motor.js');
  if (!fs.existsSync(bundle)) return;                       // run `npm run build` first
  const text = fs.readFileSync(bundle, 'utf8');
  assert.match(text, new RegExp("OkieMotor.version = \"" + pkg.version.replace(/\./g, '\\.') + "\""));
  assert.doesNotThrow(() => new Function(text));
  const v = JSON.parse(fs.readFileSync(path.join(ROOT, 'dist', 'okie-version.json'), 'utf8'));
  assert.equal(v.version, pkg.version);
  assert.ok(text.includes('OkieMotor.build = ' + v.build), 'version json and bundle share one build stamp');
});

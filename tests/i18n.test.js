'use strict';
// Static guard: every UI string key used in the source exists in BOTH languages,
// and the English and German dictionaries have exactly the same keys.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');
const files = fs.readdirSync(SRC).filter(f => f.endsWith('.js'));

function dictKeys(code, lang) {
  const keys = new Set();
  const re = new RegExp("registerStrings\\('" + lang + "', \\{([\\s\\S]*?)\\}\\);", 'g');
  let m;
  while ((m = re.exec(code))) {
    const body = m[1];
    const kr = /'([A-Za-z0-9_.\-]+)':\s*'/g; let k;
    while ((k = kr.exec(body))) keys.add(k[1]);
  }
  return keys;
}

const en = new Set(), de = new Set();
files.forEach(f => {
  const code = fs.readFileSync(path.join(SRC, f), 'utf8');
  dictKeys(code, 'en').forEach(k => en.add(k));
  dictKeys(code, 'de').forEach(k => de.add(k));
});

test('dictionaries were found', () => { assert.ok(en.size > 300, 'en keys: ' + en.size); assert.ok(de.size > 300); });

test('English and German have exactly the same keys', () => {
  const onlyEn = [...en].filter(k => !de.has(k)), onlyDe = [...de].filter(k => !en.has(k));
  assert.deepEqual(onlyEn, [], 'missing in German: ' + onlyEn.join(', '));
  assert.deepEqual(onlyDe, [], 'missing in English: ' + onlyDe.join(', '));
});

test('every literal t(...) key used in code is defined', () => {
  const used = new Map();
  files.forEach(f => {
    const code = fs.readFileSync(path.join(SRC, f), 'utf8');
    const re = /\b(?:t|T\(ctx\)|core\.t)\(\s*'([a-z]{1,3}\.[A-Za-z0-9_.\-]+)'\s*[,)]/g; let m;   // a literal key only: 't(\'c.q\' + i)' is built dynamically
    while ((m = re.exec(code))) if (!used.has(m[1])) used.set(m[1], f);
  });
  const missing = [...used.keys()].filter(k => !en.has(k));
  assert.deepEqual(missing.map(k => k + ' (' + used.get(k) + ')'), []);
  assert.ok(used.size > 150, 'checked ' + used.size + ' keys');
});

test('no German string is accidentally identical to a long English one (untranslated)', () => {
  const dict = (lang) => { const o = {}; files.forEach(f => { const code = fs.readFileSync(path.join(SRC, f), 'utf8'); const re = new RegExp("registerStrings\\('" + lang + "', \\{([\\s\\S]*?)\\}\\);", 'g'); let m; while ((m = re.exec(code))) { const kr = /'([A-Za-z0-9_.\-]+)':\s*'((?:[^'\\]|\\.)*)'/g; let k; while ((k = kr.exec(m[1]))) o[k[1]] = k[2]; } }); return o; };
  const E = dict('en'), D = dict('de');
  const same = Object.keys(E).filter(k => E[k].length > 28 && E[k] === D[k]);
  assert.deepEqual(same, [], 'untranslated: ' + same.join(', '));
});

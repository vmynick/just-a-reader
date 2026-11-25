import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EN } from '../js/i18n-en.js';

const JS = join(dirname(fileURLToPath(import.meta.url)), '..', 'js');
const UI_FILES = readdirSync(JS).filter((f) => f.endsWith('.js') && !['i18n-en.js'].includes(f));
const src = (f) => readFileSync(join(JS, f), 'utf8');
const unescape = (s) => s.replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\\\/g, '\\');
const HU_CHARS = /[áéíóöőúüűÁÉÍÓÖŐÚÜŰ]/;

/** Every string the UI translates: t('…') calls plus schema labels, theme/font names, genres, core errors. */
function usedKeys() {
  const keys = new Set();
  const add = (k) => keys.add(unescape(k));
  for (const f of UI_FILES) {
    for (const m of src(f).matchAll(/\b(?:t|tr)\(\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1]);
  }
  const controls = src('controls.js');
  for (const m of controls.matchAll(/\b(?:label|hint|aria): '((?:[^'\\]|\\.)*)'/g)) if (m[1] && !m[1].includes(' / ')) add(m[1]);
  for (const m of controls.matchAll(/\[(?:'\w+'|\d), '((?:[^'\\]|\\.)*)'\]/g)) if (/\p{L}/u.test(m[1])) add(m[1]);
  for (const m of src('settings.js').matchAll(/name: '((?:[^'\\]|\\.)*)'/g)) add(m[1]);
  for (const m of src('views.js').matchAll(/\['\w+', '(\{n\} \S+)', '(\S+)'\]/g)) { add(m[1]); add(m[2]); }
  add('{n} szöveg');
  for (const f of readdirSync(join(JS, 'core'))) {
    for (const m of readFileSync(join(JS, 'core', f), 'utf8').matchAll(/fail\(\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1]);
  }
  for (const m of src('docs.js').matchAll(/fail\(\s*'((?:[^'\\]|\\.)*)'/g)) add(m[1]);
  return keys;
}

test('every UI string has an English translation', () => {
  const missing = [...usedKeys()].filter((k) => !(k in EN));
  assert.deepEqual(missing, [], `missing English for:\n${missing.join('\n')}`);
});

test('no Hungarian text is left outside the translation layer', () => {
  const offenders = [];
  for (const f of ['views.js', 'reader.js', 'controls.js', 'ui.js', 'main.js', 'docs.js', 'fullscreen.js', 'i18n.js']) {
    let s = src(f)
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '')
      .replace(/\b(?:t|tr)\(\s*'(?:[^'\\]|\\.)*'/g, 't(KEY')
      .replace(/\b(?:label|hint|name|aria): '(?:[^'\\]|\\.)*'/g, 'X')
      .replace(/\[(?:'\w+'|\d), '(?:[^'\\]|\\.)*'(?:, 'native')?\]/g, 'X')
      .replace(/\['\w+', '\{n\} \S+', '\S+'\]/g, 'X')
      .replace(/fail\(\s*'(?:[^'\\]|\\.)*'/g, 'fail(KEY')
      .replace(/const WELCOME_HU = `[\s\S]*?`;/, '');
    for (const m of s.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      const lit = (m[1] ?? m[2]).replace(/\$\{[^}]*\}/g, '');
      if (HU_CHARS.test(lit)) offenders.push(`${f}: ${lit.trim().slice(0, 80)}`);
    }
  }
  assert.deepEqual(offenders, [], offenders.join('\n'));
});

test('plural forms and placeholders', async () => {
  // i18n.js imports settings (browser-only), so check the dictionary format directly.
  for (const [k, v] of Object.entries(EN)) {
    const ph = (x) => [...x.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');
    const forms = v.split('||');
    for (const form of forms) assert.equal(ph(form).replace(/(^|,)n(?=,|$)/, '$1n'), ph(form), k);
    assert.ok(forms.every((form) => ph(form).split(',').every((p) => !p || ph(k).split(',').includes(p))), `placeholder mismatch: ${k} → ${v}`);
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

function walk(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

test('service worker precaches every app file that exists', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const shell = [...sw.match(/const SHELL = \[([\s\S]*?)\];/)[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
  for (const f of shell.filter((x) => x !== './')) assert.ok(existsSync(join(ROOT, f)), `missing ${f}`);
  const required = [...walk(join(ROOT, 'js')), ...walk(join(ROOT, 'css')), ...walk(join(ROOT, 'fonts')).filter((f) => /\.(woff2|css)$/.test(f))]
    .map((f) => relative(ROOT, f).replace(/\\/g, '/'));
  for (const f of required) assert.ok(shell.includes(f), `sw.js SHELL is missing ${f}`);
});

test('catalog entries point at existing book files', () => {
  const cat = JSON.parse(readFileSync(join(ROOT, 'books', 'catalog.json'), 'utf8'));
  assert.ok(cat.books.length >= 10);
  const ids = new Set();
  for (const b of cat.books) {
    assert.ok(!ids.has(b.id), `duplicate id ${b.id}`);
    ids.add(b.id);
    assert.ok(existsSync(join(ROOT, b.file)), `missing ${b.file}`);
    assert.ok(['hu', 'en'].includes(b.lang) || b.lang.length === 2);
    assert.ok(b.words > 0 && b.title && b.author !== undefined);
  }
  assert.ok(cat.books.some((b) => b.preinstalled && b.lang === 'hu'));
  assert.ok(cat.books.some((b) => b.preinstalled && b.lang === 'en'));
});

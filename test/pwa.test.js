import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = new URL('../public/', import.meta.url).pathname;

test('the service worker precaches every file the game ships', () => {
  const files = [];
  (function walk(dir) {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else files.push(relative(root, p));
    }
  })(root);
  const sw = readFileSync(join(root, 'sw.js'), 'utf8');
  const shell = [...sw.matchAll(/^\s+'\.\/([^']*)',$/gm)].map((m) => m[1] || 'index.html');
  const expected = files.filter((f) => f !== 'sw.js').sort();
  assert.deepEqual(shell.sort(), expected);
});

test('the manifest icons exist', () => {
  const m = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
  for (const icon of m.icons) assert.ok(statSync(join(root, icon.src)).size > 0, icon.src);
});

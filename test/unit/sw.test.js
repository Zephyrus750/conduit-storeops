// The precache list is generated; a stale commit would ship a release cache
// missing a file, which cache-first serving turns into a broken offline app.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildPrecache, render } from '../../scripts/build-sw.js';

test('sw-precache.js is current and complete', () => {
  const p = buildPrecache();
  assert.equal(fs.readFileSync(new URL('../../sw-precache.js', import.meta.url), 'utf8'), render(p), 'run npm run sw and commit sw-precache.js');
  for (const must of ['./index.html', './js/shell.js', './client/index.js', './shared/reducers.js', './styles/shell.css', './icons.svg', './manifest.webmanifest', './icons/icon-192.png', './js/updates.js']) assert.ok(p.files.includes(must), must);
  assert.ok(!p.files.some(f => f.startsWith('./maps/')), 'maps are not app files');
  assert.ok(!p.files.some(f => f.includes('/worker/') || f.includes('/test/')), 'worker and tests are not app files');
  assert.match(p.build, /^[0-9a-f]{10}$/);
});

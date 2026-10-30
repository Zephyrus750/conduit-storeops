import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileKind, cleanEntry, visibleTo, ready, matches, FILE_EXTS } from '../../shared/resources.js';
import { TOOLS, toolForView } from '../../shared/tools.js';

test('fileKind: the allowed kinds by name; PDFs and pictures open in the browser, the rest download', () => {
  assert.deepEqual(fileKind('Evacuation Plan.PDF'), { ext: 'pdf', type: 'application/pdf', label: 'PDF', inline: true });
  assert.equal(fileKind('roster.xlsx').label, 'Excel'); assert.equal(fileKind('roster.xlsx').inline, false);
  for (const bad of ['page.html', 'logo.svg', 'run.js', 'noext', '', null]) assert.equal(fileKind(bad), null, String(bad));
  assert.ok(!FILE_EXTS.includes('html') && !FILE_EXTS.includes('svg'), 'nothing that runs script on the worker’s origin');
});

test('cleanEntry: title needed, text tidied and capped, links https only, stores all or registered ones', () => {
  assert.deepEqual(cleanEntry({ title: '  Daily  checklist ', category: 'Forms', note: 'line one\nline two' }, {}), { title: 'Daily checklist', category: 'Forms', note: 'line one line two' });
  assert.equal(cleanEntry({ title: '   ' }).error, 'a resource needs a title');
  assert.equal(cleanEntry({ title: 'x'.repeat(200) }).title.length, 80);
  assert.equal(cleanEntry({ link: 'http://example.com' }).error, 'a link starts with https://');
  assert.equal(cleanEntry({ link: 'javascript:alert(1)' }).error, 'a link starts with https://');
  assert.equal(cleanEntry({ link: 'https://example.com/form' }).link, 'https://example.com/form');
  assert.deepEqual(cleanEntry({ link: '' }), { link: '' }, 'an empty link clears it');
  assert.deepEqual(cleanEntry({ stores: ['1241', '1241', '2006'] }, { stores: ['1241', '2006'] }), { stores: ['1241', '2006'] });
  assert.match(cleanEntry({ stores: ['9999'] }, { stores: ['1241'] }).error, /9999/);
  assert.equal(cleanEntry({ stores: [] }, { stores: ['1241'] }).error, 'pick at least one store, or every store');
  assert.deepEqual(cleanEntry({ stores: 'all' }), { stores: 'all' });
  assert.deepEqual(cleanEntry({ category: 'Safety' }), { category: 'Safety' }, 'an edit sets only what it names');
});

test('visibleTo, ready and matches', () => {
  const e = { title: 'Evacuation plan', category: 'Safety', note: 'print for the staff room', stores: ['1241'], link: '', file: { name: 'evac-1241.pdf' } };
  assert.equal(visibleTo(e, '1241'), true); assert.equal(visibleTo(e, 2006), false); assert.equal(visibleTo({ ...e, stores: 'all' }, '2006'), true);
  assert.equal(ready(e), true); assert.equal(ready({ ...e, file: null }), false); assert.equal(ready({ ...e, file: null, link: 'https://x.test' }), true);
  for (const q of ['', 'evac', 'SAFETY plan', 'staff room', '1241.pdf', 'pdf']) assert.equal(matches(e, q), true, q);
  for (const q of ['roster', 'evac roster']) assert.equal(matches(e, q), false, q);
});

test('Resources is a store-wide tool the owner can switch off, with its one page', () => {
  const t = TOOLS.find(x => x.id === 'resources');
  assert.equal(t.area, 'store'); assert.deepEqual(t.events, []); assert.equal(toolForView('resources'), t);
});

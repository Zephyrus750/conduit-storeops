import { test } from 'node:test';
import assert from 'node:assert/strict';
import { otsu, wordsToRows, parseRow, ingest, filtered, locVerdict, matchPreset, extractCodes } from '../../shared/screenscan.js';

test('Otsu splits a two-tone histogram between the tones', () => {
  const h = new Array(256).fill(0); h[30] = 500; h[220] = 1500;
  const t = otsu(h, 2000); assert.ok(t >= 30 && t < 220, String(t));
});
test('words become rows by height, left to right; digits only unless kept', () => {
  const w = [{ text: '43631599', x: 80, y: 11, h: 14 }, { text: '7095', x: 10, y: 10, h: 14 }, { text: 'MUG', x: 200, y: 12, h: 14 }, { text: '7095', x: 10, y: 40, h: 14 }, { text: '4300', x: 80, y: 41, h: 14 }, { text: '1234', x: 130, y: 39, h: 14 }];
  assert.deepEqual(wordsToRows(w), ['7095 43631599', '7095 4300 1234']);
  assert.deepEqual(wordsToRows(w, true), ['7095 43631599 MUG', '7095 4300 1234']);
});
test('a row reads its location and keycode; APN fragments, headers and broken codes are handled', () => {
  assert.deepEqual(parseRow('7095 43631599 9341234567890'), { codes: ['43631599'], locs: ['7095'] });
  assert.deepEqual(parseRow('43631599 93412345'), { codes: ['43631599'], locs: [] }, 'a 6–8 run after a code is a clipped APN');
  assert.deepEqual(parseRow('4363 1599'), { codes: ['43631599'], locs: [] }, 'broken code glued');
  assert.deepEqual(parseRow('l10STORE: 1241'), { codes: [], locs: [] });
  assert.deepEqual(parseRow('4363159943631600'), { codes: ['43631599', '43631600'], locs: [] });
});
test('sightings tally across frames; the clean list drops APN-signature reads; the location verdict', () => {
  const t = { codes: {}, locs: {} };
  assert.equal(ingest(t, ['7095 43631599 9341234567890', '7095 43631600']), 2);
  assert.equal(ingest(t, ['7095 43631599', '9341234567890']), 0, 'a 13-digit APN is never a code');
  assert.equal(t.codes['43631599'].count, 2); assert.equal(t.codes['43631599'].loc, '7095');
  const raw = { codes: { 43631599: { count: 3 }, 93412345: { count: 2 }, 9341234: { count: 1 }, 9341777: { count: 3 }, 934123456789: { count: 4 }, 12345: { count: 9 } } };
  assert.deepEqual(filtered(raw), ['43631599', '9341777'], 'APN-signature 8-digit and once-seen 7-digit reads go; repeated short codes stay');
  assert.deepEqual(filtered(raw, true).length, 6);
  assert.deepEqual(locVerdict(t.locs, '07095'), { state: 'match', seen: '7095', expected: '07095' });
  assert.equal(locVerdict(t.locs, '7001').state, 'mismatch'); assert.equal(locVerdict({ 7001: 1 }, '7002').state, 'none', 'one sighting is not enough to shout');
});
test('presets match a screen size within 2%; any report yields its keycodes', () => {
  const p = { '1920x1080': { x: 0.1 }, '2560x1440': { x: 0.2 } };
  assert.deepEqual(matchPreset(p, 1920, 1080), { x: 0.1 }); assert.deepEqual(matchPreset(p, 1940, 1070), { x: 0.1 }); assert.equal(matchPreset(p, 1600, 900), null);
  assert.deepEqual(extractCodes('CLEARANCE 43631599 $5.00 qty 3\n9341234567890 43631600\n123456\nPrice 12.50 123456 sku 99\n43631599'), { codes: ['43631599', '43631600', '123456'], dups: 1 });
});

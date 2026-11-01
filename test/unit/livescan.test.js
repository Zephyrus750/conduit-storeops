// Live reading of the PDT's list: what counts as a code in one OCR pass,
// the contrast step, and when a read code goes in, waits or is held.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { codesIn, adjacent, preprocess, diffAt, twinOf, decide, misreadFix, readsNeeded } from '../../shared/livescan.js';

const w = (text, x0, y0, x1 = x0 + text.length * 10, y1 = y0 + 20, confidence = 90) => ({ text, confidence, bbox: { x0, y0, x1, y1 } });

test('codesIn: a word that is a keycode, a code split in two on one line, and a run in the text', () => {
  const words = [w('1', 0, 0), w('43307753', 40, 0), w('4330', 0, 40), w('7763', 44, 40), w('2', 0, 80), w('9876', 200, 80)];
  const got = codesIn(words, '1 43307753\n4330 7763\n2 9876\n55512345');
  const codes = got.map(x => x.code);
  assert.ok(codes.includes('43307753'), 'a whole word');
  assert.ok(codes.includes('43307763'), 'two halves a digit apart on one line join');
  assert.ok(!codes.includes('29876'), 'never a Take digit joined to a code across the gutter');
  assert.ok(codes.includes('55512345'), 'a run of eight in the line text');
  assert.deepEqual(got.find(x => x.code === '43307763').bbox, { x0: 0, y0: 40, x1: 84, y1: 60 }, 'the joined box spans both words');
});

test('codesIn: low confidence, wrong lengths and mixed words are not codes', () => {
  assert.deepEqual(codesIn([w('43307753', 0, 0, 80, 20, 40)], '').map(x => x.code), [], 'a doubtful word');
  assert.deepEqual(codesIn([w('4330775', 0, 0), w('433077531', 0, 40)], '').map(x => x.code), [], '7 and 9 digits');
  assert.deepEqual(codesIn([w('A4330775', 0, 0)], '').map(x => x.code), [], 'letters with the digits');
});

test('adjacent: same line and a small gap only', () => {
  assert.equal(adjacent(w('4330', 0, 0), w('7763', 44, 0)), true);
  assert.equal(adjacent(w('4330', 0, 0), w('7763', 44, 30)), false, 'another line');
  assert.equal(adjacent(w('4330', 0, 0), w('7763', 140, 0)), false, 'a gutter away');
  assert.equal(adjacent({ text: '1' }, w('2', 0, 0)), false, 'no box: never');
});

test('preprocess: grey, stretched around the frame mean; the mean comes back', () => {
  const px = new Uint8ClampedArray([100, 100, 100, 255, 140, 140, 140, 255]);
  const mean = preprocess(px, 2, 1);
  assert.equal(Math.round(mean), 120);
  assert.deepEqual([...px], [98, 98, 98, 255, 158, 158, 158, 255], '±20 around 120 becomes ±30 around 128');
  const dark = new Uint8ClampedArray([20, 20, 20, 255, 40, 40, 40, 255]);
  preprocess(dark, 2, 1);
  assert.ok(dark[4] > dark[0] && dark[0] >= 0, 'a dim frame keeps its contrast (the pivot is clamped, never crushed)');
});

test('diffAt and twinOf: one digit apart, same length', () => {
  assert.equal(diffAt('43307753', '43307763'), 6);
  assert.equal(diffAt('43307753', '43307753'), -1);
  assert.equal(diffAt('43307753', '43307764'), -1);
  assert.equal(diffAt('4330775', '43307753'), -1);
  assert.equal(twinOf('43307763', ['11111111', '43307753']), '43307753');
  assert.equal(twinOf('43307753', ['43307753']), null, 'itself is not its twin');
});

test('decide: today’s list goes in on one read; others need two, three when the catalogue does not know them', () => {
  const expected = new Set(['43307753']), have = new Set(['41000001']);
  assert.equal(decide({ code: '41000001', reads: 1, verdict: 'ok', have, expected }), 'already');
  assert.equal(decide({ code: '43307753', reads: 1, verdict: 'checking', have, expected }), 'add', 'on today’s list: first read');
  assert.equal(decide({ code: '42000000', reads: 5, verdict: 'checking', have, expected }), 'wait', 'still checking the catalogue');
  assert.equal(decide({ code: '42000000', reads: 1, verdict: 'ok', have, expected }), 'wait');
  assert.equal(decide({ code: '42000000', reads: 2, verdict: 'ok', have, expected }), 'add');
  assert.equal(decide({ code: '42000000', reads: 2, verdict: 'unknown', have, expected }), 'wait');
  assert.equal(decide({ code: '42000000', reads: 3, verdict: 'unknown', have, expected }), 'add');
  assert.equal(decide({ code: '42000000', reads: 2, verdict: 'error', have, expected }), 'add', 'an unreachable catalogue never slows reading');
  assert.equal(readsNeeded('unknown'), 3); assert.equal(readsNeeded('error'), 2);
});

test('decide: a code a digit from one in or on the list is held unless the catalogue knows it', () => {
  const expected = new Set(['43307753']), have = new Set(['41000001']);
  assert.equal(decide({ code: '43307763', reads: 3, verdict: 'unknown', have, expected }), 'hold', 'a digit from today’s list');
  assert.equal(decide({ code: '41000002', reads: 2, verdict: 'error', have, expected }), 'hold', 'a digit from one already in');
  assert.equal(decide({ code: '41000002', reads: 2, verdict: 'ok', have, expected }), 'add', 'a real product a digit away is never held');
});

test('misreadFix: the list code not yet in first, then one already in, with the differing digit', () => {
  const expected = new Set(['43307753', '41000001']), have = new Set(['41000001']);
  assert.deepEqual(misreadFix('43307763', { have, expected }), { use: '43307753', at: 6 });
  assert.deepEqual(misreadFix('41000002', { have, expected }), { use: '41000001', at: 7 });
  assert.equal(misreadFix('99999999', { have, expected }), null);
});

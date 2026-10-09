// Voice search (shared/voice.js): ShelfSearcher's reading of a spoken shelf
// code, its two slips fixed, and the map check that picks among guesses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spokenToCode, misheard, resolveSpoken, spokenCodes, STOP_WORDS } from '../../shared/voice.js';

// A map as shelfForLocation answers it: runs, shelves and bays.
const MAP = new Map([['A10', 'A10'], ['A16', 'A16'], ['A16S2', 'A16S2'], ['B22', 'B22'], ['B22E1', 'B22E1'], ['C5', 'C5'], ['Q15', 'Q15'], ['H27', 'H27'], ['A4', 'A4'], ['7002', 'A16S2'], ['D7', 'D7']]);
const lookup = c => MAP.get(c) || null;

test('read as ShelfSearcher read it: spaces out, number words to digits', () => {
  for (const [said, code] of [['A10', 'A10'], ['a 10', 'A10'], ['A ten', 'A10'], ['A16 S2', 'A16S2'], ['B 22', 'B22'], ['Q15 E2', 'Q15E2'], ['7002', '7002'], ['A010', 'A10']]) assert.equal(spokenToCode(said), code, said);
});

test('its slips fixed: compound and teen numbers, side and end', () => {
  assert.equal(spokenToCode('B twenty two'), 'B22', 'ShelfSearcher made this B202');
  assert.equal(spokenToCode('B twenty-two'), 'B22');
  assert.equal(spokenToCode('A eighteen'), 'A18', 'ShelfSearcher made this A8EEN');
  assert.equal(spokenToCode('A nineteen'), 'A19');
  assert.equal(spokenToCode('seven zero zero two'), '7002', 'digit by digit');
  assert.equal(spokenToCode('seven thousand and two'), '7002');
  assert.equal(spokenToCode('A sixteen side two'), 'A16S2');
  assert.equal(spokenToCode('B22 end one'), 'B22E1');
});

test('mishearings undone: letter names, number sounds, filler, 8 for A', () => {
  assert.ok(misheard('be 22').includes('B22'));
  assert.ok(misheard('queue 15').includes('Q15'));
  assert.ok(misheard('see five').includes('C5'));
  assert.ok(misheard('age 27').includes('H27'));
  assert.ok(misheard('A for').includes('A4'));
  assert.ok(misheard('find shelf A16 S2').includes('A16S2'));
  assert.ok(misheard('816').includes('A16'));
});

test('the top guess wins when it is a real shelf, so what worked before is unchanged', () => {
  assert.deepEqual(resolveSpoken(['A16 S2', 'a 16 s to'], lookup), { code: 'A16S2', heard: 'A16 S2', query: 'A16S2', how: 'heard' });
  // Even when a later guess or a correction would also be real.
  assert.equal(resolveSpoken(['A10', 'A4'], lookup).code, 'A10');
});

test('when the top guess is not on the map, the next real reading is used', () => {
  assert.equal(resolveSpoken(['be 22'], lookup).code, 'B22');
  assert.equal(resolveSpoken(['a 17', 'A16'], lookup).code, 'A16', 'a later guess the map knows');
  assert.equal(resolveSpoken(['where is see 5'], lookup).code, 'C5');
  assert.deepEqual(resolveSpoken(['seven zero zero two'], lookup), { code: 'A16S2', heard: 'seven zero zero two', query: '7002', how: 'heard' }, 'a bay answers with its shelf');
  assert.equal(resolveSpoken(['816'], lookup).code, 'A16');
});

test('nothing on the map: the top guess goes to search as it was heard', () => {
  assert.deepEqual(resolveSpoken(['42977636'], lookup), { code: null, heard: '42977636', query: '42977636', how: 'search' }, 'a keycode goes to the product search');
  assert.deepEqual(resolveSpoken(['Z 99'], lookup), { code: null, heard: 'Z 99', query: 'Z99', how: 'search' });
  assert.deepEqual(resolveSpoken([], lookup), { code: null, heard: '', query: '', how: 'search' });
});

test('pick list dictation: every code in an utterance, and the stop words', () => {
  assert.deepEqual(spokenCodes('A10 B twenty two and Q15 E2'), ['A10', 'B22', 'Q15E2']);
  assert.deepEqual(spokenCodes('A 16 S 2, 7002'), ['A16S2', '7002']);
  assert.deepEqual(spokenCodes('hello there'), []);
  assert.ok(STOP_WORDS.test('THAT\'S ALL'));
  assert.ok(!STOP_WORDS.test('A10'));
});

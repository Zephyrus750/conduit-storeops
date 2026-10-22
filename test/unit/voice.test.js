// Voice search (shared/voice.js): ShelfSearcher's reading of a spoken shelf
// code, its two slips fixed, and the map check that picks among guesses.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spokenToCode, misheard, resolveSpoken, spokenCodes, spokenStops, ofRun, STOP_WORDS } from '../../shared/voice.js';

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

test('pick list stops: checked against the map, a split side rejoined, the shelf over its run', () => {
  const STOPS = new Map([['A6', 'A6'], ['A6S1', 'A6S1'], ['C4', 'C4'], ['C4S1', 'C4S1'], ['K7', 'K7'], ['A10', 'A10'], ['B22', 'B22']]);
  const look = c => STOPS.get(c) || null;
  // Heard as on the phone in the report: the side split off with a stray letter.
  assert.deepEqual(spokenStops(['A6nS1'], look), { codes: ['A6S1'], bad: [], heard: 'A6nS1' });
  assert.deepEqual(spokenStops(['A6 S1'], look).codes, ['A6S1']);
  assert.deepEqual(spokenStops(['C4 C4 S1'], look).codes, ['C4S1'], 'the run said with its shelf gives way');
  assert.deepEqual(spokenStops(['A10 and B twenty two'], look).codes, ['A10', 'B22']);
  assert.deepEqual(spokenStops(['be 22'], look).codes, ['B22'], 'a misheard letter is tried against the map');
  // A later guess that names real shelves beats a top guess that does not.
  assert.deepEqual(spokenStops(['Z 99', 'K7'], look), { codes: ['K7'], bad: [], heard: 'K7' });
  assert.deepEqual(spokenStops(['Z 99'], look), { codes: [], bad: ['Z99'], heard: 'Z 99' });
  assert.deepEqual(spokenStops(['', 'hello'], look), { codes: [], bad: [], heard: 'hello' });
  assert.ok(ofRun('C4S1', 'C4') && ofRun('A16E2', 'A16') && !ofRun('C41', 'C4') && !ofRun('C4', 'C4'));
});

test('pick list paste: a side written apart joins its run, numbers-only runs too; a missing side is not widened', async () => {
  const { typedStops } = await import('../../shared/voice.js');
  const STOPS = new Set(['A16', 'A16S1', 'A16S2', '04', '04S2', '05', 'B7S2']);
  const canon = c => c.toUpperCase().replace(/[\s\-_.]+/g, '').replace(/([A-Z])0+(?=\d)/g, '$1');
  const look = c => (STOPS.has(canon(c)) ? canon(c) : null);
  assert.deepEqual(typedStops('04 S2', look), { codes: ['04S2'], bad: [] }, 'the Busselton case: a run named 04');
  assert.deepEqual(typedStops('A16 S1\nB7-S2, 04S2', look).codes, ['A16S1', 'B7S2', '04S2']);
  assert.deepEqual(typedStops('A16 - S1; 05', look).codes, ['A16S1', '05']);
  assert.deepEqual(typedStops('A16 S1 S2', look).codes, ['A16S1', 'A16S2'], 'two sides of one run');
  assert.deepEqual(typedStops('A16 S9 04', look), { codes: ['04'], bad: ['A16 S9'] }, 'a side the run lacks is reported, not widened to A16');
  assert.deepEqual(typedStops('Z99 A16 A16', look), { codes: ['A16'], bad: ['Z99'] });
  assert.deepEqual(typedStops('', look), { codes: [], bad: [] });
});

test('runs named by digits alone, spoken: "zero four side two", "oh four", "four side two" are 04 S2; digits said one by one are one number', () => {
  const MAP = new Set(['04', '04S2', '05E1', 'A16S1', 'A16S2', 'B22', '7012']);
  const look = c => (MAP.has(c) ? c : null);
  assert.deepEqual(spokenCodes('zero four side two'), ['04S2']);
  assert.deepEqual(spokenCodes('nought five end one'), ['05E1']);
  assert.deepEqual(spokenCodes('seven zero one two'), ['7012'], 'a bay said digit by digit');
  assert.deepEqual(spokenCodes('A one six side two'), ['A16S2']);
  assert.deepEqual(spokenCodes('A 16 S 2, 7002'), ['A16S2', '7002'], 'a side keeps its own digit');
  for (const said of ['zero four side two', '04 side 2', 'oh four side two', 'four side two'])
    assert.equal(resolveSpoken([said], look).code, '04S2', `search: ${said}`);
  assert.deepEqual(spokenStops(['oh four side two and B twenty two'], look).codes, ['04S2', 'B22'], 'pick list: several stops');
  assert.deepEqual(spokenStops(['A sixteen side one, zero four side two'], look).codes, ['A16S1', '04S2']);
  assert.deepEqual(spokenStops(['zero four', 'zero four'], look).codes, ['04'], 'the run itself, when that is what was said');
  assert.ok(ofRun('04S2', '04'));
});

test('permanent ends (P1, P2): typed, pasted and spoken like a side or an end', async () => {
  const { typedStops } = await import('../../shared/voice.js');
  const MAP = new Set(['A16', 'A16S1', 'A16P1', '16', '16P2']);
  const look = c => (MAP.has(c) ? c : null);
  assert.deepEqual(typedStops('A16 P1, 16 P2', look).codes, ['A16P1', '16P2']);
  assert.deepEqual(typedStops('A16 S1 P1', look).codes, ['A16S1', 'A16P1'], 'a side and the permanent end of one run');
  assert.equal(spokenToCode('A sixteen permanent end one'), 'A16P1');
  assert.deepEqual(spokenStops(['A sixteen P one'], look).codes, ['A16P1']);
  assert.equal(resolveSpoken(['sixteen permanent end two'], look).code, '16P2');
  assert.ok(ofRun('A16P1', 'A16'));
});

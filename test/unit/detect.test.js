// The map editor's auto-detect geometry (shared/detect.js), checked against
// how the stores' maps are actually drawn (Busselton's A11: two faces of
// three 40-unit bays, a one-module end cap at each end).
import test from 'node:test';
import assert from 'node:assert/strict';
import { learnModuleSizes, parseSizes, fitModules, runBays, planRun, coveredBy } from '../../shared/detect.js';

test('module sizes are learned from the bays the plan draws', () => {
  const bays = [40, 41, 39, 40, 40, 48, 47, 48, 49, 60, 61, 60, 22, 95];
  assert.deepEqual(learnModuleSizes(bays), [40, 48, 60], 'the recurring sizes, busiest first; one-offs ignored');
  assert.deepEqual(learnModuleSizes([40, 40]), [], 'two bays are not a pattern');
  assert.deepEqual(parseSizes('40, 48;60 0 abc 48'), [40, 48, 60]);
});

test('a run with no dividers is fitted to the size that divides it best', () => {
  assert.deepEqual(fitModules(240, [40, 48, 60]), { modules: 6, bayW: 40 });
  assert.deepEqual(fitModules(192, [40, 48, 60]), { modules: 4, bayW: 48 });
  assert.deepEqual(fitModules(300, [48, 60]), { modules: 5, bayW: 60 });
});

test('a gondola becomes S1 and S2 with an end at each end, as the maps draw them (A11)', () => {
  // The run as detected: x -230..-190 (two shelves deep), end cap, three 40 bays, end cap.
  const box = { x: -230, y: 205, w: 40, h: 160 };
  const parts = [{ x: -230, y: 205, w: 40, h: 20 }, { x: -230, y: 225, w: 40, h: 40 }, { x: -230, y: 265, w: 40, h: 40 }, { x: -230, y: 305, w: 40, h: 40 }, { x: -230, y: 345, w: 40, h: 20 }];
  const out = planRun(box, parts, { shelfDepth: 20, sizes: [40, 48, 60] });
  const pick = s => [s.subname, s.orientation, s.x, s.y, s.modules, s.bayW, s.depth];
  assert.deepEqual(out.map(pick), [
    ['S1', 'V', -230, 225, 3, 40, 20],
    ['S2', 'V', -210, 225, 3, 40, 20],
    ['E1', 'H', -230, 205, 1, 40, 20],
    ['E2', 'H', -230, 345, 1, 40, 20],
  ]);
});

test('two faces drawn as separate boxes count each bay once', () => {
  const box = { x: 0, y: 0, w: 40, h: 120 };
  const parts = [0, 40, 80].flatMap(y => [{ x: 0, y, w: 20, h: 40 }, { x: 20, y, w: 20, h: 40 }]);
  assert.deepEqual(runBays(box, parts).bays.map(b => b.len), [40, 40, 40]);
  assert.deepEqual(planRun(box, parts, { sizes: [40] }).map(s => [s.subname, s.modules, s.bayW, s.x]), [['S1', 3, 40, 0], ['S2', 3, 40, 20]]);
});

test('outlined bays, found as their insides, are measured to the middle of their divider lines', () => {
  // A 2-unit line around and between three 40-unit bays, one face 20 deep.
  const parts = [0, 40, 80].map(x => ({ x: x + 1, y: 1, w: 38, h: 18 }));
  const box = { x: 1, y: 1, w: 118, h: 18 };
  assert.deepEqual(runBays(box, parts).bays.map(b => [b.at, b.len]), [[0, 40], [40, 40], [80, 40]]);
  assert.deepEqual(planRun(box, parts, { sizes: [40] }).map(s => [s.subname, s.x, s.y, s.modules, s.bayW, s.depth]), [['', 0, 0, 3, 40, 20]]);
});

test('a horizontal single-sided run with no dividers: one face, fitted, no ends', () => {
  const out = planRun({ x: 0, y: 0, w: 297, h: 21 }, [], { shelfDepth: 20, sizes: [48, 60] });
  assert.equal(out.length, 1);
  assert.deepEqual([out[0].subname, out[0].orientation, out[0].modules, out[0].bayW, out[0].depth, out[0].x], ['', 'H', 5, 60, 21, -1], '5 × 60 fits 297 better than 6 × 48; centred on what was drawn');
  assert.deepEqual(fitModules(290, [48, 60]), { modules: 6, bayW: 48 }, 'and 6 × 48 fits 290 better');
  const noSplit = planRun({ x: 0, y: 0, w: 200, h: 40 }, [], { shelfDepth: 20, sizes: [40], sides: false });
  assert.deepEqual(noSplit.map(s => [s.subname, s.depth]), [['', 40]], 'sides off: one shelf the full depth');
});

test('bays that disagree fall back to the best fit; an end cap needs a short box at the end', () => {
  const box = { x: 0, y: 0, w: 200, h: 40 };
  const parts = [{ x: 0, y: 0, w: 40, h: 40 }, { x: 40, y: 0, w: 90, h: 40 }, { x: 130, y: 0, w: 70, h: 40 }];
  const out = planRun(box, parts, { shelfDepth: 20, sizes: [40] });
  assert.deepEqual(out.map(s => [s.subname, s.modules, s.bayW]), [['S1', 5, 40], ['S2', 5, 40]]);
});

test('a detected box already under drawn shelves is reported covered', () => {
  const box = { x: 0, y: 0, w: 100, h: 40 };
  assert.equal(coveredBy(box, [{ x: 0, y: 0, w: 100, h: 20 }, { x: 0, y: 20, w: 100, h: 20 }]), 1);
  assert.equal(coveredBy(box, [{ x: 0, y: 0, w: 30, h: 40 }]), 0.3);
  assert.equal(coveredBy(box, []), 0);
});

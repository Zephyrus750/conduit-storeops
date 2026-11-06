import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accBand, accChip } from '../../js/ui.js';

test('accuracy bands: 95 and over, 85 to 94, 70 to 84, under 70; the number only', () => {
  assert.deepEqual([100, 95, 94, 85, 84, 70, 69, 0].map(accBand), ['vg', 'vg', 'g', 'g', 'av', 'av', 'bad', 'bad']);
  assert.equal(accBand(null), ''); assert.equal(accBand(undefined), ''); assert.equal(accBand('x'), '');
  assert.equal(accChip(77), '<span class="acc acc-av">77%</span>');
  assert.equal(accChip(96.6), '<span class="acc acc-vg">97%</span>');
  assert.equal(accChip(null), '—');
  assert.doesNotMatch(accChip(88), /good|average|bad/i, 'no band words');
});

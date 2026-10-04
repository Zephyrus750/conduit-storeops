import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrMatrix, qrSvg } from '../../shared/qr.js';

// Decoding was checked against a standard reader (zxing-cpp) for v1–v7;
// these pin the structure so a change that breaks it shows here.
test('qr: picks the smallest version, draws the finder rings, refuses past 122 bytes', () => {
  assert.equal(qrMatrix('A16').size, 21);
  assert.equal(qrMatrix('https://conduit.example/?store=1241&shelf=A16S1').size, 33);
  assert.equal(qrMatrix('y'.repeat(122)).size, 45);
  assert.equal(qrMatrix('z'.repeat(123)), null);
  const { modules: M, size } = qrMatrix('A16');
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    assert.equal(M[cy][cx], true, 'centre dark');
    assert.equal(M[cy][cx + 2], false, 'white ring');
    assert.equal(M[cy][cx + 3], true, 'outer ring');
  }
  assert.equal(M[size - 8][8], true, 'dark module');
  assert.deepEqual(qrMatrix('A16').modules, M, 'deterministic');
  assert.match(qrSvg('A16'), /^<svg class="qr"/);
  assert.equal(qrSvg('z'.repeat(123)), '');
});

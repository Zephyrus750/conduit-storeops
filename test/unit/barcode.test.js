import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { code128Widths, ean13Bits, ean13Check, ean13Valid, symbologyFor, barcodeSvg } from '../../shared/barcode.js';

// Decode what we draw with ZXing (the same library the phone falls back to):
// the bars become one row of pixels, repeated.
// Loaded as the browser loads it: a classic script that sets globalThis.ZXing.
const sandbox = { console }; sandbox.globalThis = sandbox; vm.createContext(sandbox);
vm.runInContext(readFileSync(new URL('../../vendor/zxing/zxing.min.js', import.meta.url), 'utf8'), sandbox);
const ZXing = sandbox.ZXing;
function decode(bars) {
  const module = 2, quiet = 12, width = (bars.length + quiet * 2) * module, height = 20, px = new Uint8ClampedArray(width * height).fill(255);
  for (let y = 0; y < height; y++) for (let i = 0; i < bars.length; i++) if (bars[i] === '1') for (let k = 0; k < module; k++) px[y * width + (quiet + i) * module + k] = 0;
  const src = new ZXing.RGBLuminanceSource(px, width, height);
  const reader = new ZXing.MultiFormatReader(), hints = new Map();
  hints.set(ZXing.DecodeHintType.POSSIBLE_FORMATS, [ZXing.BarcodeFormat.CODE_128, ZXing.BarcodeFormat.EAN_13]); hints.set(ZXing.DecodeHintType.TRY_HARDER, true);
  reader.setHints(hints);
  return reader.decodeWithState(new ZXing.BinaryBitmap(new ZXing.HybridBinarizer(src))).getText();
}
const widthsToBits = w => w.map((n, i) => (i % 2 ? '0' : '1').repeat(n)).join('');

test('Code 128: keycodes (even and odd length), bays and text decode back to themselves', () => {
  for (const code of ['42977636', '110012345', '4297763', '7012', 'A16S1', 'BSN1240417', 'K12S1']) assert.equal(decode(widthsToBits(code128Widths(code))), code, code);
});

test('EAN-13: a valid APN decodes; the check digit is computed and verified', () => {
  assert.equal(ean13Check('930063300123'), 0); assert.equal(ean13Valid('9300633001230'), true); assert.equal(ean13Valid('9300633001234'), false);
  assert.equal(ean13Bits('9300633001230').length, 95);
  assert.equal(decode(ean13Bits('9300633001230')), '9300633001230'); assert.equal(decode(ean13Bits('5012345678900')), '5012345678900');
  assert.equal(symbologyFor('9300633001230'), 'ean13'); assert.equal(symbologyFor('9300633001234'), 'code128', 'a bad check digit falls back to Code 128');
});

test('SVG: bars, a quiet zone and the readable line, with the text escaped', () => {
  const svg = barcodeSvg('42977636');
  assert.match(svg, /^<svg class="barcode"/); assert.match(svg, />42977636<\/text>/); assert.ok((svg.match(/<rect /g) || []).length > 20);
  assert.match(barcodeSvg('A<1', { label: 'A<1' }), /A&lt;1<\/text>/);
});

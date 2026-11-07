// Decodes PNG frames with the app's own ZXing reader, with js/scan.js's hints:
//   node scripts/guide/cam/decode.mjs frame.png …   → each file and what it read, or FAIL
import { launch, ROOT } from '../lib.mjs';
import fs from 'node:fs';
const files = process.argv.slice(2);
const b = await launch();
const p = await b.newPage(); await p.setContent('<!doctype html><body></body>');
await p.addScriptTag({ path: ROOT + '/vendor/zxing/zxing.min.js' });
for (const f of files) {
  const uri = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
  const r = await p.evaluate(async uri => {
    const img = new Image(); img.src = uri; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    const Z = window.ZXing, rd = new Z.MultiFormatReader(), h = new Map();
    h.set(Z.DecodeHintType.POSSIBLE_FORMATS, [Z.BarcodeFormat.CODE_128, Z.BarcodeFormat.EAN_13, Z.BarcodeFormat.EAN_8, Z.BarcodeFormat.UPC_A, Z.BarcodeFormat.CODE_39, Z.BarcodeFormat.ITF, Z.BarcodeFormat.QR_CODE, Z.BarcodeFormat.DATA_MATRIX]); rd.setHints(h);
    try { return rd.decodeWithState(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c)))).getText(); } catch (e) { return 'FAIL'; } finally { rd.reset(); }
  }, uri);
  console.log(f.split('/').pop(), r);
}
await b.close();

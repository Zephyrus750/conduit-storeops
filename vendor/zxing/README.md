ZXing for JavaScript 0.23.0 (`@zxing/library`, `umd/index.min.js`, MIT, see
LICENSE), from the npm package, unmodified. The camera scanner (`js/scan.js`)
loads it only on devices without the built-in BarcodeDetector (iOS Safari,
older desktops); the store phones' Chrome reads barcodes natively. The unit
tests also use it to decode what `shared/barcode.js` draws.

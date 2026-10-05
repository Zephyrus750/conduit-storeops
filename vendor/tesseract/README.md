# Tesseract.js (OCR for Stockroom › Screen scan)

Self-hosted so the desk works with the CSP as it stands (no third-party
script) and loads only when Screen scan is first used. Not in the service
worker precache.

- `tesseract.min.js`, `worker.min.js`: tesseract.js 5.1.1 (Apache-2.0)
- `tesseract-core-simd-lstm.wasm.js`: tesseract.js-core 5.1.1, SIMD + LSTM build (Apache-2.0); store PCs run Chrome, which has WebAssembly SIMD
- `eng.traineddata.gz`: @tesseract.js-data/eng 1.0.0, `4.0.0_best_int` (Apache-2.0)

Compiling the WebAssembly needs `'wasm-unsafe-eval'` in `script-src` (netlify.toml).

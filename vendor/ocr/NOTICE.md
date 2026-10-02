OCR assets for the static desk. Pages serves these files. The checker uses the same traineddata.

- `tesseract.esm.min.js` and `worker.min.js` are from tesseract.js 5.1.1 (Apache-2.0). License notes: `tesseract.min.js.LICENSE.txt`, `worker.min.js.LICENSE.txt`.
- `core/tesseract-core-lstm.wasm.js` and `core/tesseract-core-simd-lstm.wasm.js` are from tesseract.js-core 5.1.1 (Apache-2.0).
- `tessdata/eng.traineddata.gz` is the English LSTM model `@tesseract.js-data/eng` 4.0.0_best_int.

Keep these copies on 5.1.1. `npm run check` fails if `package.json` pins a different tesseract.js.

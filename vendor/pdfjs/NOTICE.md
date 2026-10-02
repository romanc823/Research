Page rasterizer for scanner PDFs. Pages serves these files. The checker uses the same build from `pdfjs-dist`.

- `pdf.min.js` and `pdf.worker.min.js` are the legacy build of PDF.js 6.3.289 (Apache-2.0). License: `LICENSE`.
- `wasm/jbig2.wasm` and `wasm/jbig2_nowasm_fallback.js` decode JBIG2 and CCITT Group 3/4. Licenses: `wasm/LICENSE_JBIG2`, `wasm/LICENSE_PDFJS_JBIG2`.
- `wasm/openjpeg.wasm` and `wasm/openjpeg_nowasm_fallback.js` decode JPEG2000. Licenses: `wasm/LICENSE_OPENJPEG`, `wasm/LICENSE_PDFJS_OPENJPEG`.
- `wasm/qcms_bg.wasm` is the color-management library. Licenses: `wasm/LICENSE_QCMS`, `wasm/LICENSE_PDFJS_QCMS`.

`npm run check` fails if `package.json` pins a different pdfjs-dist, or if these copies drift from that package.

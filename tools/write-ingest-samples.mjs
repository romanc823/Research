/**
 * Write the synthetic PDF, JPEG, and PNG used by the desk and by npm run check.
 * Anonymized labels only. Do not point this at a client file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUGUSTA_PDF_LINES, REP_JPEG_LINES, SILENT_PNG_LINES } from "../js/ingest-samples.js";
import { buildTextPdf } from "../js/pdf-text.js";
import { renderLabelRaster } from "../js/raster-label.js";
import { encodeGrayJpeg } from "../js/jpeg-gray.js";
import { encodeGrayPng } from "../js/png-gray.js";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../samples/ingest");
fs.mkdirSync(dir, { recursive: true });

const pdf = buildTextPdf(AUGUSTA_PDF_LINES);
const jpegRaster = renderLabelRaster(REP_JPEG_LINES);
const jpeg = encodeGrayJpeg(jpegRaster.gray, jpegRaster.width, jpegRaster.height);
const pngRaster = renderLabelRaster(SILENT_PNG_LINES);
const png = await encodeGrayPng(pngRaster.gray, pngRaster.width, pngRaster.height);

fs.writeFileSync(path.join(dir, "synthetic-augusta.pdf"), pdf);
fs.writeFileSync(path.join(dir, "synthetic-rep-hours.jpg"), jpeg);
fs.writeFileSync(path.join(dir, "synthetic-silent-misses.png"), png);

console.log(`Wrote 3 synthetic packets in ${dir}`);

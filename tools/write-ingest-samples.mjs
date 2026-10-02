/**
 * Write the synthetic PDF, JPEG, PNG, scan, and photo used by the desk and by npm run check.
 * Anonymized labels only. Do not point this at a client file.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AUGUSTA_PDF_LINES, PHOTO_SEP_LINES, REP_JPEG_LINES, SCAN_PDF_LINES, SILENT_PNG_LINES } from "../js/ingest-samples.js";
import { buildImagePdf, buildTextPdf } from "../js/pdf-text.js";
import { renderLabelRaster } from "../js/raster-label.js";
import { encodeGrayJpeg } from "../js/jpeg-gray.js";
import { encodeGrayPng } from "../js/png-gray.js";
import { renderPacketJpeg } from "./render-photo.mjs";

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../samples/ingest");
fs.mkdirSync(dir, { recursive: true });

const pdf = buildTextPdf(AUGUSTA_PDF_LINES);
const jpegRaster = renderLabelRaster(REP_JPEG_LINES);
const jpeg = encodeGrayJpeg(jpegRaster.gray, jpegRaster.width, jpegRaster.height);
const pngRaster = renderLabelRaster(SILENT_PNG_LINES);
const png = await encodeGrayPng(pngRaster.gray, pngRaster.width, pngRaster.height);

const scan = await renderPacketJpeg(SCAN_PDF_LINES);
const photo = await renderPacketJpeg(PHOTO_SEP_LINES);
const scanPdf = buildImagePdf(scan.jpeg, scan.width, scan.height);

fs.writeFileSync(path.join(dir, "synthetic-augusta.pdf"), pdf);
fs.writeFileSync(path.join(dir, "synthetic-rep-hours.jpg"), jpeg);
fs.writeFileSync(path.join(dir, "synthetic-silent-misses.png"), png);
fs.writeFileSync(path.join(dir, "synthetic-scan-augusta.pdf"), scanPdf);
fs.writeFileSync(path.join(dir, "synthetic-photo-sep.jpg"), photo.jpeg);

console.log(`Wrote 5 synthetic packets in ${dir}`);

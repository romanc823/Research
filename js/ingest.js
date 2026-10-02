/**
 * Phase 2 ingest, plus OCR when a PDF has no text layer or a photo
 * is not the label font. JSON fixtures stay on parseFixtureText.
 * Neither path invents a zero for a blank amount.
 */

import { decodeGrayJpeg } from "./jpeg-gray.js";
import { decodeGrayPng } from "./png-gray.js";
import { extractPdfText } from "./pdf-text.js";
import { extractPdfPageImages } from "./pdf-images.js";
import { readLabelRaster } from "./raster-label.js";
import { recognizeImages } from "./ocr.js";
import { parseDocumentText } from "./ingest-fields.js";

export { CONFIDENCE_FLOOR, OCR_WATCH_FLOOR, parseDocumentText } from "./ingest-fields.js";

function sniff(name, type, bytes) {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".pdf") || type === "application/pdf" || (bytes[0] === 0x25 && bytes[1] === 0x50)) return "pdf";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg") || type === "image/jpeg" || (bytes[0] === 0xff && bytes[1] === 0xd8)) return "jpeg";
  if (lower.endsWith(".png") || type === "image/png" || (bytes[0] === 0x89 && bytes[1] === 0x50)) return "png";
  return "";
}

async function grayFromCanvas(bytes, mime) {
  if (typeof document === "undefined" || typeof createImageBitmap !== "function") return null;
  const blob = new Blob([bytes], { type: mime });
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement("canvas");
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0);
  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  const gray = new Uint8Array(canvas.width * canvas.height);
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    gray[p] = Math.round((0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]));
  }
  return { width: canvas.width, height: canvas.height, gray };
}

async function readRaster(kind, bytes) {
  try {
    if (kind === "jpeg") return await decodeGrayJpeg(bytes);
    return await decodeGrayPng(bytes);
  } catch (error) {
    const viaCanvas = await grayFromCanvas(bytes, kind === "jpeg" ? "image/jpeg" : "image/png");
    if (viaCanvas) return viaCanvas;
    throw error;
  }
}

async function tryLabeled(kind, bytes) {
  try {
    const raster = await readRaster(kind, bytes);
    return readLabelRaster(raster.gray, raster.width, raster.height);
  } catch {
    return null;
  }
}

function isNoTextLayer(error) {
  return typeof error?.message === "string" && error.message.startsWith("No text layer in this PDF.");
}

function packetFromOcr(rows, sourceKind, fileName) {
  if (!rows.length) {
    throw new Error("OCR found no labeled lines. The page was left unread. Missing amounts were not filled with zero.");
  }
  return parseDocumentText(rows.map((row) => row.text).join("\n"), {
    sourceKind,
    fileName,
    ocr: true,
    confidences: rows.map((row) => row.confidence),
  });
}

async function ocrBytes(images) {
  try {
    return await recognizeImages(images);
  } catch (error) {
    throw new Error(error.message || "OCR could not read this file. No fields were guessed.");
  }
}

export async function ingestDocument({ name = "", type = "", bytes }) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const kind = sniff(name, type, data);
  if (!kind) {
    throw new Error("Drop a fixture JSON, a PDF, or a JPEG or PNG.");
  }
  if (kind === "pdf") {
    try {
      const text = await extractPdfText(data);
      return parseDocumentText(text, { sourceKind: "pdf", fileName: name });
    } catch (error) {
      if (!isNoTextLayer(error)) throw error;
      const extracted = await extractPdfPageImages(data);
      if (!extracted.images.length) {
        const filters = extracted.unsupported.length
          ? ` Page images use ${extracted.unsupported.join(", ")}, which this desk does not decode. Export a JPEG or PNG, or a PDF whose scan is a JPEG.`
          : " It has no JPEG or FlateDecode page image to OCR.";
        throw new Error(`No text layer in this PDF.${filters} Missing amounts were not filled with zero.`);
      }
      return packetFromOcr(await ocrBytes(extracted.images.map((image) => image.bytes)), "pdf-ocr", name);
    }
  }

  const labeled = await tryLabeled(kind, data);
  if (labeled?.lines.length) {
    const packet = parseDocumentText(labeled.lines.join("\n"), { sourceKind: kind, fileName: name });
    if (labeled.rejected.length) packet.ingest.dropped = labeled.rejected.concat(packet.ingest.dropped);
    return packet;
  }

  const rows = await ocrBytes([data]);
  if (!rows.length) {
    throw new Error("No labeled anonymized lines cleared the confidence floor. OCR did not read this image. Missing amounts were not filled with zero.");
  }
  return packetFromOcr(rows, `${kind}-ocr`, name);
}

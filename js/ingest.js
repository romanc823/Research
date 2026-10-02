/**
 * Phase 2 ingest. JSON fixtures stay on parseFixtureText.
 * PDF uses the text layer. JPEG and PNG use the label-font raster.
 * Neither path invents a zero for a blank amount.
 */

import { decodeGrayJpeg } from "./jpeg-gray.js";
import { decodeGrayPng } from "./png-gray.js";
import { extractPdfText } from "./pdf-text.js";
import { readLabelRaster } from "./raster-label.js";
import { parseDocumentText } from "./ingest-fields.js";

export { CONFIDENCE_FLOOR, parseDocumentText } from "./ingest-fields.js";

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

export async function ingestDocument({ name = "", type = "", bytes }) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const kind = sniff(name, type, data);
  if (!kind) {
    throw new Error("Drop a fixture JSON, a text-layer PDF, or a labeled JPEG or PNG.");
  }
  if (kind === "pdf") {
    const text = await extractPdfText(data);
    return parseDocumentText(text, { sourceKind: "pdf", fileName: name });
  }

  let raster;
  try {
    raster = await readRaster(kind, data);
  } catch (error) {
    throw new Error(error.message || "This image was not read. No fields were guessed.");
  }
  const read = readLabelRaster(raster.gray, raster.width, raster.height);
  if (!read.lines.length) {
    throw new Error("No labeled anonymized lines cleared the confidence floor. A photo or a noisy scan is left unread.");
  }
  const packet = parseDocumentText(read.lines.join("\n"), { sourceKind: kind, fileName: name });
  if (read.rejected.length) packet.ingest.dropped = read.rejected.concat(packet.ingest.dropped);
  return packet;
}

/**
 * Synthetic Group 4 fax of the anonymized label lines.
 * Threshold 120 keeps the counters in 0 and 8 that a darker cut merges.
 * The bytes are locked by npm run check. No client page is encoded here.
 */
import { encode } from "ts-ccitt-g4-encoder";
import { buildCcittPdf } from "../js/pdf-text.js";
import { renderPacketJpeg } from "./render-photo.mjs";

export const CCITT_THRESHOLD = 120;

export function packBilevel(gray, threshold = CCITT_THRESHOLD) {
  const out = new Uint8Array(Math.ceil(gray.length / 8));
  for (let i = 0; i < gray.length; i += 1) {
    if (gray[i] < threshold) out[i >> 3] |= 0x80 >> (i & 7);
  }
  return out;
}

export async function buildFaxPdf(lines) {
  const page = await renderPacketJpeg(lines);
  const encoded = encode(packBilevel(page.gray), page.width, page.height);
  return buildCcittPdf(encoded, page.width, page.height);
}

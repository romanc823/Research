/**
 * Page images inside a PDF. JPEG (DCTDecode) and 8-bit FlateDecode
 * gray or RGB images are handed to OCR as-is. JBIG2, CCITT, and JPEG2000
 * are reported in `unsupported` so the caller can rasterize the page.
 */

import { inflateZlib } from "./inflate-zlib.js";
import { encodeGrayPng } from "./png-gray.js";
import { readPdfStreams } from "./pdf-text.js";

const SUPPORTED = new Set(["DCTDecode", "FlateDecode"]);

function filterNames(dict) {
  const array = dict.match(/\/Filter\s*\[([^\]]*)\]/);
  if (array) return [...array[1].matchAll(/\/([A-Za-z0-9]+)/g)].map((match) => match[1]);
  const one = dict.match(/\/Filter\s*\/([A-Za-z0-9]+)/);
  return one ? [one[1]] : [];
}

function dictInt(dict, name) {
  const match = dict.match(new RegExp(`/${name}\\s+(\\d+)`));
  return match ? Number(match[1]) : null;
}

function colorSpace(dict) {
  if (/\/ColorSpace\s*\/DeviceRGB/.test(dict)) return "rgb";
  if (/\/ColorSpace\s*\/DeviceGray/.test(dict)) return "gray";
  return "";
}

function writeI32(out, offset, value) {
  const n = value | 0;
  out[offset] = n & 255;
  out[offset + 1] = (n >> 8) & 255;
  out[offset + 2] = (n >> 16) & 255;
  out[offset + 3] = (n >> 24) & 255;
}

export function encodeBmp24(rgb, width, height) {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const out = new Uint8Array(54 + rowStride * height);
  out[0] = 0x42;
  out[1] = 0x4d;
  writeI32(out, 2, out.length);
  out[10] = 54;
  out[14] = 40;
  writeI32(out, 18, width);
  writeI32(out, 22, height);
  out[26] = 1;
  out[28] = 24;
  for (let y = height - 1; y >= 0; y -= 1) {
    const dest = 54 + (height - 1 - y) * rowStride;
    for (let x = 0; x < width; x += 1) {
      const src = (y * width + x) * 3;
      out[dest + x * 3] = rgb[src + 2];
      out[dest + x * 3 + 1] = rgb[src + 1];
      out[dest + x * 3 + 2] = rgb[src];
    }
  }
  return out;
}

/**
 * @returns {Promise<{ images: { bytes: Uint8Array, mime: string }[], unsupported: string[] }>}
 */
export async function extractPdfPageImages(bytes) {
  const images = [];
  const unsupported = [];
  for (const { dict, raw } of readPdfStreams(bytes)) {
    if (!/\/Subtype\s*\/Image/.test(dict)) continue;
    const filters = filterNames(dict);
    const known = filters.filter((name) => !SUPPORTED.has(name));
    if (known.length || filters.length !== 1) {
      if (filters.length) unsupported.push(filters.join("+"));
      continue;
    }
    const predictor = dict.match(/\/Predictor\s+(\d+)/);
    if (predictor && Number(predictor[1]) > 1) {
      unsupported.push("FlateDecode predictor");
      continue;
    }
    if (filters[0] === "DCTDecode") {
      if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xd8) {
        images.push({ bytes: raw, mime: "image/jpeg" });
      }
      continue;
    }

    const width = dictInt(dict, "Width");
    const height = dictInt(dict, "Height");
    const bits = dictInt(dict, "BitsPerComponent");
    const space = colorSpace(dict);
    if (!width || !height || bits !== 8 || (space !== "gray" && space !== "rgb")) {
      unsupported.push("FlateDecode");
      continue;
    }
    let pixels;
    try {
      pixels = await inflateZlib(raw);
    } catch {
      unsupported.push("FlateDecode");
      continue;
    }
    const expected = width * height * (space === "rgb" ? 3 : 1);
    if (pixels.length < expected) {
      unsupported.push("FlateDecode");
      continue;
    }
    const sample = pixels.subarray(0, expected);
    if (space === "gray") {
      images.push({ bytes: await encodeGrayPng(sample, width, height), mime: "image/png" });
    } else {
      images.push({ bytes: encodeBmp24(sample, width, height), mime: "image/bmp" });
    }
  }
  return { images, unsupported };
}

/**
 * 8-bit grayscale PNG, filter 0, no interlace.
 * Color PNGs fail here. The browser may still try the label-font reader
 * on canvas pixels; a miss stays unread.
 */

import { inflateZlib } from "./inflate-zlib.js";

const SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function u32(value) {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function readU32(bytes, pos) {
  return ((bytes[pos] << 24) | (bytes[pos + 1] << 16) | (bytes[pos + 2] << 8) | bytes[pos + 3]) >>> 0;
}

function chunk(type, data) {
  const typeBytes = Uint8Array.from(type, (ch) => ch.charCodeAt(0));
  const body = new Uint8Array(typeBytes.length + data.length);
  body.set(typeBytes, 0);
  body.set(data, typeBytes.length);
  const crc = u32(crc32(body));
  const out = new Uint8Array(4 + body.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(crc, 4 + body.length);
  return out;
}

function concat(parts) {
  const len = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export async function encodeGrayPng(gray, width, height) {
  if (gray.length !== width * height) throw new Error("Gray buffer does not match its size.");
  const { deflateSync } = await import("node:zlib");
  const raw = new Uint8Array((width + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const dest = y * (width + 1);
    raw[dest] = 0;
    raw.set(gray.subarray(y * width, (y + 1) * width), dest + 1);
  }
  const ihdr = new Uint8Array(13);
  ihdr.set(u32(width), 0);
  ihdr.set(u32(height), 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const idat = new Uint8Array(deflateSync(raw));
  return concat([
    Uint8Array.from(SIG),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

export async function decodeGrayPng(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  for (let i = 0; i < SIG.length; i += 1) {
    if (bytes[i] !== SIG[i]) throw new Error("This file is not a PNG.");
  }
  let pos = SIG.length;
  let width = 0;
  let height = 0;
  let ihdr = false;
  const idatParts = [];
  while (pos + 8 <= bytes.length) {
    const len = readU32(bytes, pos);
    const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
    const data = bytes.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === "IHDR") {
      width = readU32(data, 0);
      height = readU32(data, 4);
      const depth = data[8];
      const color = data[9];
      const interlace = data[12];
      if (depth !== 8 || color !== 0 || interlace !== 0) {
        throw new Error("This PNG is not an 8-bit grayscale labeled raster. Phase 2 does not OCR a photograph into fields.");
      }
      ihdr = true;
    } else if (type === "IDAT") {
      idatParts.push(data);
    } else if (type === "IEND") {
      break;
    }
  }
  if (!ihdr || !idatParts.length) throw new Error("PNG is missing a grayscale image.");
  const packed = concat(idatParts);
  const raw = await inflateZlib(packed);
  const stride = width + 1;
  if (raw.length < stride * height) throw new Error("PNG image data is short.");
  const gray = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * stride];
    if (filter !== 0) {
      throw new Error("This PNG uses a row filter Phase 2 does not read. No fields were guessed.");
    }
    gray.set(raw.subarray(y * stride + 1, y * stride + 1 + width), y * width);
  }
  return { width, height, gray };
}

/**
 * Baseline grayscale JPEG (SOF0, one component) for labeled rasters.
 * Solid 8×8 blocks use the DC term only, which is enough for the
 * scale-aligned glyph grid and keeps a phone photo from decoding
 * into guessed digits. Color, progressive, and subsampled files fail closed.
 */

const ZIGZAG = [
  0, 1, 8, 16, 9, 2, 3, 10,
  17, 24, 32, 25, 18, 11, 4, 5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
];

const STD_LUMA_Q = [
  16, 11, 10, 16, 24, 40, 51, 61,
  12, 12, 14, 19, 26, 58, 60, 55,
  14, 13, 16, 24, 40, 57, 69, 56,
  14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77,
  24, 35, 55, 64, 81, 104, 113, 92,
  49, 64, 78, 87, 103, 121, 120, 101,
  72, 92, 95, 98, 112, 100, 103, 99,
];

const DC_COUNTS = [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const DC_VALUES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const AC_COUNTS = [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 125];
const AC_VALUES = [
  0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07,
  0x22, 0x71, 0x14, 0x32, 0x81, 0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0,
  0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19, 0x1a, 0x25, 0x26, 0x27, 0x28,
  0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
  0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69,
  0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78, 0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89,
  0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4, 0xa5, 0xa6, 0xa7,
  0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5,
  0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2,
  0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1, 0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8,
  0xf9, 0xfa,
];

function buildCodes(counts, values) {
  const codes = new Map();
  let code = 0;
  let vi = 0;
  for (let len = 1; len <= 16; len += 1) {
    for (let i = 0; i < counts[len - 1]; i += 1) {
      codes.set(values[vi], { code, len });
      vi += 1;
      code += 1;
    }
    code <<= 1;
  }
  return codes;
}

function buildTree(counts, values) {
  const root = { one: null, zero: null, sym: null };
  let code = 0;
  let vi = 0;
  for (let len = 1; len <= 16; len += 1) {
    for (let i = 0; i < counts[len - 1]; i += 1) {
      let node = root;
      for (let bit = len - 1; bit >= 0; bit -= 1) {
        const one = ((code >> bit) & 1) === 1;
        const key = one ? "one" : "zero";
        if (bit === 0) node[key] = { one: null, zero: null, sym: values[vi] };
        else {
          if (!node[key]) node[key] = { one: null, zero: null, sym: null };
          node = node[key];
        }
      }
      vi += 1;
      code += 1;
    }
    code <<= 1;
  }
  return root;
}

const DC_CODES = buildCodes(DC_COUNTS, DC_VALUES);
const AC_CODES = buildCodes(AC_COUNTS, AC_VALUES);
const DC_TREE = buildTree(DC_COUNTS, DC_VALUES);
const AC_TREE = buildTree(AC_COUNTS, AC_VALUES);

function category(value) {
  const abs = Math.abs(value);
  if (abs === 0) return 0;
  return Math.floor(Math.log2(abs)) + 1;
}

function quantTable(quality = 75) {
  const q = Math.max(1, Math.min(95, quality));
  const scale = q < 50 ? Math.floor(5000 / q) : 200 - q * 2;
  const out = new Uint8Array(64);
  for (let natural = 0; natural < 64; natural += 1) {
    const raw = Math.round((STD_LUMA_Q[natural] * scale) / 100);
    out[natural] = Math.max(1, Math.min(255, raw));
  }
  return out;
}

class BitWriter {
  constructor() {
    this.bytes = [];
    this.acc = 0;
    this.n = 0;
  }

  write(value, length) {
    for (let i = length - 1; i >= 0; i -= 1) {
      this.acc = (this.acc << 1) | ((value >> i) & 1);
      this.n += 1;
      if (this.n === 8) this.flushByte();
    }
  }

  flushByte() {
    this.bytes.push(this.acc & 0xff);
    if (this.acc === 0xff) this.bytes.push(0x00);
    this.acc = 0;
    this.n = 0;
  }

  pad() {
    if (this.n === 0) return;
    const rest = 8 - this.n;
    this.write((1 << rest) - 1, rest);
  }

  toBytes() {
    return Uint8Array.from(this.bytes);
  }
}

function pushBytes(target, bytes) {
  for (let i = 0; i < bytes.length; i += 1) target.push(bytes[i]);
}

function u16(target, value) {
  target.push((value >> 8) & 0xff, value & 0xff);
}

function encodeBlock(pixels, ox, oy, width, quant, writer, state) {
  let uniform = true;
  const first = pixels[oy * width + ox];
  for (let y = 0; y < 8 && uniform; y += 1) {
    for (let x = 0; x < 8; x += 1) {
      if (pixels[(oy + y) * width + (ox + x)] !== first) {
        uniform = false;
        break;
      }
    }
  }

  const zz = new Int16Array(64);
  if (uniform) {
    const dc = (first - 128) * 8;
    zz[0] = Math.round(dc / quant[0]);
  } else {
    const block = new Float64Array(64);
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) block[y * 8 + x] = pixels[(oy + y) * width + (ox + x)] - 128;
    }
    for (let v = 0; v < 8; v += 1) {
      for (let u = 0; u < 8; u += 1) {
        const cu = u === 0 ? Math.SQRT1_2 : 1;
        const cv = v === 0 ? Math.SQRT1_2 : 1;
        let sum = 0;
        for (let y = 0; y < 8; y += 1) {
          for (let x = 0; x < 8; x += 1) {
            sum += block[y * 8 + x]
              * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
              * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
          }
        }
        const natural = v * 8 + u;
        const coeff = 0.25 * cu * cv * sum;
        zz[ZIGZAG.indexOf(natural)] = Math.round(coeff / quant[natural]);
      }
    }
  }

  const diff = zz[0] - state.prev;
  state.prev = zz[0];
  const dcCat = category(diff);
  const dcCode = DC_CODES.get(dcCat);
  writer.write(dcCode.code, dcCode.len);
  if (dcCat > 0) {
    const bits = diff < 0 ? diff + (1 << dcCat) - 1 : diff;
    writer.write(bits, dcCat);
  }

  let run = 0;
  for (let i = 1; i < 64; i += 1) {
    const coeff = zz[i];
    if (coeff === 0) {
      run += 1;
      continue;
    }
    while (run > 15) {
      const zrl = AC_CODES.get(0xf0);
      writer.write(zrl.code, zrl.len);
      run -= 16;
    }
    const cat = category(coeff);
    const ac = AC_CODES.get((run << 4) | cat);
    writer.write(ac.code, ac.len);
    const bits = coeff < 0 ? coeff + (1 << cat) - 1 : coeff;
    writer.write(bits, cat);
    run = 0;
  }
  if (run > 0) {
    const eob = AC_CODES.get(0x00);
    writer.write(eob.code, eob.len);
  }
}

export function encodeGrayJpeg(gray, width, height, quality = 75) {
  if (width % 8 !== 0 || height % 8 !== 0) {
    throw new Error("Labeled JPEG width and height must be multiples of 8.");
  }
  if (gray.length !== width * height) throw new Error("Gray buffer does not match its size.");

  const quant = quantTable(quality);
  const quantZz = new Uint8Array(64);
  for (let k = 0; k < 64; k += 1) quantZz[k] = quant[ZIGZAG[k]];

  const out = [];
  out.push(0xff, 0xd8);
  out.push(0xff, 0xdb);
  u16(out, 67);
  out.push(0x00);
  pushBytes(out, quantZz);

  out.push(0xff, 0xc0);
  u16(out, 11);
  out.push(8);
  u16(out, height);
  u16(out, width);
  out.push(1, 1, 0x11, 0);

  out.push(0xff, 0xc4);
  u16(out, 2 + 1 + 16 + DC_VALUES.length);
  out.push(0x00);
  pushBytes(out, DC_COUNTS);
  pushBytes(out, DC_VALUES);

  out.push(0xff, 0xc4);
  u16(out, 2 + 1 + 16 + AC_VALUES.length);
  out.push(0x10);
  pushBytes(out, AC_COUNTS);
  pushBytes(out, AC_VALUES);

  out.push(0xff, 0xda);
  u16(out, 8);
  out.push(1, 1, 0x00, 0, 63, 0);

  const writer = new BitWriter();
  const state = { prev: 0 };
  for (let y = 0; y < height; y += 8) {
    for (let x = 0; x < width; x += 8) encodeBlock(gray, x, y, width, quant, writer, state);
  }
  writer.pad();
  pushBytes(out, writer.toBytes());
  out.push(0xff, 0xd9);
  return Uint8Array.from(out);
}

function readU16(bytes, pos) {
  return (bytes[pos] << 8) | bytes[pos + 1];
}

export function decodeGrayJpeg(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes);
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) {
    throw new Error("This file is not a JPEG.");
  }

  let pos = 2;
  let width = 0;
  let height = 0;
  let quant = null;
  let seenSof = false;

  function skip(markerPos) {
    const len = readU16(bytes, markerPos);
    return markerPos + len;
  }

  while (pos < bytes.length - 1) {
    if (bytes[pos] !== 0xff) {
      pos += 1;
      continue;
    }
    while (bytes[pos] === 0xff) pos += 1;
    const marker = bytes[pos];
    pos += 1;
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === 0xd9) throw new Error("JPEG ended before the image scan.");
    if (marker === 0xda) break;
    if (pos + 2 > bytes.length) throw new Error("Truncated JPEG marker.");
    if (marker === 0xc0) {
      const len = readU16(bytes, pos);
      const precision = bytes[pos + 2];
      height = readU16(bytes, pos + 3);
      width = readU16(bytes, pos + 5);
      const components = bytes[pos + 7];
      if (precision !== 8 || components !== 1) {
        throw new Error("This JPEG is not a one-component baseline image. Phase 2 does not OCR a photograph into fields.");
      }
      const sampling = bytes[pos + 9];
      if (sampling !== 0x11) {
        throw new Error("This JPEG is subsampled. Phase 2 only reads a labeled grayscale raster.");
      }
      seenSof = true;
      pos += len;
      continue;
    }
    if (marker === 0xdb) {
      const len = readU16(bytes, pos);
      const info = bytes[pos + 2];
      if ((info >> 4) !== 0) throw new Error("16-bit JPEG quant tables are not read.");
      quant = new Uint8Array(64);
      for (let i = 0; i < 64; i += 1) quant[ZIGZAG[i]] = bytes[pos + 3 + i];
      pos += len;
      continue;
    }
    if (marker === 0xc2 || marker === 0xc1) {
      throw new Error("Progressive and extended JPEGs are not read. Phase 2 does not guess fields from a photo.");
    }
    pos = skip(pos);
  }

  if (!seenSof || !quant || width <= 0 || height <= 0) {
    throw new Error("JPEG is missing a grayscale image.");
  }
  if (width % 8 !== 0 || height % 8 !== 0) {
    throw new Error("This JPEG is not aligned to the labeled raster grid.");
  }

  const sosLen = readU16(bytes, pos);
  pos += sosLen;

  const gray = new Uint8Array(width * height);
  let bitBuf = 0;
  let bitCount = 0;
  let ended = false;

  function pullByte() {
    if (pos >= bytes.length) throw new Error("Truncated JPEG scan.");
    const value = bytes[pos];
    pos += 1;
    if (value === 0xff) {
      if (pos >= bytes.length) throw new Error("Truncated JPEG marker.");
      const next = bytes[pos];
      pos += 1;
      if (next === 0x00) return 0xff;
      if (next === 0xd9) {
        ended = true;
        return null;
      }
      throw new Error("Unexpected marker inside the JPEG scan.");
    }
    return value;
  }

  function readBit() {
    if (bitCount === 0) {
      const value = pullByte();
      if (value == null) return null;
      bitBuf = value;
      bitCount = 8;
    }
    bitCount -= 1;
    return (bitBuf >> bitCount) & 1;
  }

  function readBits(n) {
    let value = 0;
    for (let i = 0; i < n; i += 1) {
      const bit = readBit();
      if (bit == null) throw new Error("JPEG scan ended inside a coefficient.");
      value = (value << 1) | bit;
    }
    return value;
  }

  function decodeSymbol(tree) {
    let node = tree;
    while (node && node.sym == null) {
      const bit = readBit();
      if (bit == null) throw new Error("JPEG scan ended inside a Huffman code.");
      node = bit === 1 ? node.one : node.zero;
    }
    if (!node || node.sym == null) throw new Error("Bad Huffman code in JPEG scan.");
    return node.sym;
  }

  function receive(size) {
    if (size === 0) return 0;
    let value = readBits(size);
    if (value < (1 << (size - 1))) value -= (1 << size) - 1;
    return value;
  }

  let prev = 0;
  for (let by = 0; by < height; by += 8) {
    for (let bx = 0; bx < width; bx += 8) {
      const dcCat = decodeSymbol(DC_TREE);
      const diff = receive(dcCat);
      prev += diff;
      const zz = new Int16Array(64);
      zz[0] = prev;
      let k = 1;
      while (k < 64) {
        const sym = decodeSymbol(AC_TREE);
        if (sym === 0x00) break;
        if (sym === 0xf0) {
          k += 16;
          continue;
        }
        k += sym >> 4;
        const size = sym & 0x0f;
        if (k >= 64) throw new Error("JPEG block ran past 64 coefficients.");
        zz[k] = receive(size);
        k += 1;
      }

      const dc = zz[0] * quant[0];
      let ac = false;
      for (let i = 1; i < 64; i += 1) {
        if (zz[i] !== 0) {
          ac = true;
          break;
        }
      }
      if (!ac) {
        const level = Math.max(0, Math.min(255, Math.round(dc / 8 + 128)));
        for (let y = 0; y < 8; y += 1) {
          for (let x = 0; x < 8; x += 1) gray[(by + y) * width + (bx + x)] = level;
        }
        continue;
      }

      const coeff = new Float64Array(64);
      for (let i = 0; i < 64; i += 1) coeff[ZIGZAG[i]] = zz[i] * quant[ZIGZAG[i]];
      for (let y = 0; y < 8; y += 1) {
        for (let x = 0; x < 8; x += 1) {
          let sum = 0;
          for (let v = 0; v < 8; v += 1) {
            for (let u = 0; u < 8; u += 1) {
              const cu = u === 0 ? Math.SQRT1_2 : 1;
              const cv = v === 0 ? Math.SQRT1_2 : 1;
              sum += cu * cv * coeff[v * 8 + u]
                * Math.cos(((2 * x + 1) * u * Math.PI) / 16)
                * Math.cos(((2 * y + 1) * v * Math.PI) / 16);
            }
          }
          const level = Math.round(sum / 4 + 128);
          gray[(by + y) * width + (bx + x)] = Math.max(0, Math.min(255, level));
        }
      }
    }
  }

  if (!ended) {
    while (pos < bytes.length - 1) {
      if (bytes[pos] === 0xff && bytes[pos + 1] === 0xd9) break;
      pos += 1;
    }
  }

  return { width, height, gray };
}

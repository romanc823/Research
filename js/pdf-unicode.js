/**
 * Identity-H text layers. IRS form PDFs often show text as glyph ids
 * with a ToUnicode map, which the plain Tj reader does not see.
 * Unmapped glyphs are skipped. They are not turned into zeros.
 */

import { inflateZlib } from "./inflate-zlib.js";

function latin1(data) {
  let text = "";
  const size = 0x8000;
  for (let i = 0; i < data.length; i += size) {
    text += String.fromCharCode(...data.subarray(i, Math.min(data.length, i + size)));
  }
  return text;
}

export function countPdfPages(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const file = latin1(data);
  const matches = file.match(/\/Type\s*\/Page(?!s)\b/g);
  return matches ? matches.length : 0;
}

function xrefOffsets(file) {
  const startMatch = file.match(/startxref\s+(\d+)/);
  if (!startMatch) return null;
  const start = Number(startMatch[1]);
  if (!file.startsWith("xref", start)) return null;
  const lines = file.slice(start).split(/\r?\n/);
  const offsets = new Map();
  let i = 1;
  while (i < lines.length && !lines[i].startsWith("trailer")) {
    const head = lines[i].match(/^(\d+)\s+(\d+)$/);
    if (!head) {
      i += 1;
      continue;
    }
    const first = Number(head[1]);
    const count = Number(head[2]);
    i += 1;
    for (let n = 0; n < count; n += 1, i += 1) {
      const row = lines[i] || "";
      if (row[17] !== "n") continue;
      offsets.set(first + n, Number(row.slice(0, 10)));
    }
  }
  return offsets.size ? offsets : null;
}

function resolveLength(dict, file) {
  const ref = dict.match(/\/Length\s+(\d+)\s+0\s+R/);
  if (ref) {
    const found = file.match(new RegExp(`(?:^|\\n)${ref[1]}\\s+0\\s+obj\\s+(\\d+)\\s+endobj`));
    return found ? Number(found[1]) : null;
  }
  const direct = dict.match(/\/Length\s+(\d+)/);
  return direct ? Number(direct[1]) : null;
}

function readObject(file, bytes, offsets, id) {
  const at = offsets.get(id);
  if (at == null) return null;
  const head = file.slice(at, at + 48);
  const marker = head.match(/^\d+\s+0\s+obj\s*/);
  if (!marker) return null;
  const startBody = at + marker[0].length;
  const early = file.slice(startBody, startBody + 12000);
  const streamAt = early.indexOf("stream");
  const endAt = early.indexOf("endobj");
  if (streamAt >= 0 && (endAt < 0 || streamAt < endAt)) {
    const dict = early.slice(0, streamAt);
    let cursor = startBody + streamAt + 6;
    if (file[cursor] === "\r") cursor += 1;
    if (file[cursor] === "\n") cursor += 1;
    const length = resolveLength(dict, file);
    if (length == null) return { dict, raw: null, stream: true };
    return { dict, raw: bytes.subarray(cursor, cursor + length), stream: true };
  }
  const end = endAt < 0 ? early.length : endAt;
  return { dict: early.slice(0, end), raw: null, stream: false };
}

function unicodeFromHex(hex) {
  let out = "";
  const width = hex.length % 4 === 0 ? 4 : 2;
  for (let h = 0; h + width - 1 < hex.length; h += width) {
    const code = Number.parseInt(hex.slice(h, h + width), 16);
    if (Number.isFinite(code)) out += String.fromCharCode(code);
  }
  return out;
}

export function parseToUnicode(cmapText) {
  const map = new Map();
  for (const part of String(cmapText).split("beginbfchar").slice(1)) {
    const body = part.split("endbfchar")[0];
    for (const row of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      map.set(Number.parseInt(row[1], 16), unicodeFromHex(row[2]));
    }
  }
  for (const part of String(cmapText).split("beginbfrange").slice(1)) {
    const body = part.split("endbfrange")[0];
    for (const row of body.matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
      const lo = Number.parseInt(row[1], 16);
      const hi = Number.parseInt(row[2], 16);
      const dest = Number.parseInt(row[3], 16);
      for (let n = lo; n <= hi && n - lo < 4096; n += 1) {
        map.set(n, String.fromCharCode(dest + (n - lo)));
      }
    }
  }
  return map;
}

function decodeGlyphs(hex, map) {
  if (!map || !hex) return "";
  const width = hex.length % 4 === 0 ? 4 : 2;
  let text = "";
  for (let h = 0; h + width - 1 < hex.length; h += width) {
    const glyph = Number.parseInt(hex.slice(h, h + width), 16);
    const char = map.get(glyph);
    if (char) text += char;
  }
  return text;
}

function readLiteral(content, start) {
  let i = start + 1;
  let text = "";
  while (i < content.length) {
    const ch = content[i];
    if (ch === "\\") {
      const next = content[i + 1];
      const escaped = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
      text += escaped[next] || next || "";
      i += 2;
      continue;
    }
    if (ch === ")") return { text, next: i + 1 };
    text += ch;
    i += 1;
  }
  return { text, next: i };
}

function decodeArray(inner, map) {
  let text = "";
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === "<") {
      const end = inner.indexOf(">", i + 1);
      if (end < 0) break;
      text += decodeGlyphs(inner.slice(i + 1, end).replace(/\s+/g, ""), map);
      i = end + 1;
      continue;
    }
    if (inner[i] === "(") {
      const read = readLiteral(inner, i);
      text += read.text;
      i = read.next;
      continue;
    }
    i += 1;
  }
  return text;
}

export function textFromEncodedOperators(content, fonts) {
  const items = [];
  let x = 0;
  let y = 0;
  let map = null;
  let i = 0;
  while (i < content.length) {
    if (content[i] === "%") {
      while (i < content.length && content[i] !== "\n") i += 1;
      continue;
    }
    const fontOp = content.slice(i).match(/^\/([A-Za-z0-9]+)\s+[0-9.]+\s+Tf\b/);
    if (fontOp) {
      if (fonts.has(fontOp[1])) map = fonts.get(fontOp[1]);
      i += fontOp[0].length;
      continue;
    }
    const placed = content.slice(i).match(/^([0-9.+\-]+)\s+([0-9.+\-]+)\s+([0-9.+\-]+)\s+([0-9.+\-]+)\s+([0-9.+\-]+)\s+([0-9.+\-]+)\s+Tm\b/);
    if (placed) {
      x = Number(placed[5]);
      y = Number(placed[6]);
      i += placed[0].length;
      continue;
    }
    const shifted = content.slice(i).match(/^([0-9.+\-]+)\s+([0-9.+\-]+)\s+Td\b/);
    if (shifted) {
      x += Number(shifted[1]);
      y += Number(shifted[2]);
      i += shifted[0].length;
      continue;
    }
    if (content.startsWith("T*", i)) {
      y -= 14;
      i += 2;
      continue;
    }
    if (content[i] === "(") {
      const read = readLiteral(content, i);
      i = read.next;
      if (/^\s*Tj/.test(content.slice(i)) && read.text) items.push({ x, y, text: read.text });
      continue;
    }
    if (content[i] === "<" && content[i + 1] !== "<") {
      const end = content.indexOf(">", i + 1);
      if (end < 0) break;
      const text = decodeGlyphs(content.slice(i + 1, end).replace(/\s+/g, ""), map);
      i = end + 1;
      if (/^\s*Tj/.test(content.slice(i)) && text) items.push({ x, y, text });
      continue;
    }
    if (content[i] === "[") {
      const end = content.indexOf("]", i + 1);
      if (end < 0) break;
      const text = /^\s*TJ/.test(content.slice(end + 1)) ? decodeArray(content.slice(i + 1, end), map) : "";
      i = end + 1;
      if (text) items.push({ x, y, text });
      continue;
    }
    i += 1;
  }

  const rows = [];
  for (const item of items) {
    let row = rows.find((candidate) => Math.abs(candidate.y - item.y) < 1.5);
    if (!row) {
      row = { y: item.y, parts: [] };
      rows.push(row);
    }
    row.parts.push(item);
  }
  rows.sort((a, b) => b.y - a.y);
  return rows
    .map((row) => row.parts.sort((left, right) => left.x - right.x).map((part) => part.text).join(" ").replace(/[ \t]+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

async function inflateIfNeeded(dict, raw) {
  if (!raw) return null;
  if (!/FlateDecode/.test(dict)) return raw;
  try {
    return await inflateZlib(raw);
  } catch {
    return null;
  }
}

export async function extractEncodedPdfText(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 5 || data[0] !== 0x25 || data[1] !== 0x50) {
    throw new Error("This file is not a PDF.");
  }
  const file = latin1(data);
  const offsets = xrefOffsets(file);
  if (!offsets) {
    throw new Error("No text layer in this PDF. Missing amounts were not filled with zero.");
  }

  const cmapCache = new Map();
  async function cmapForFont(fontId) {
    if (cmapCache.has(fontId)) return cmapCache.get(fontId);
    const font = readObject(file, data, offsets, fontId);
    const ref = font?.dict?.match(/\/ToUnicode\s+(\d+)\s+0\s+R/);
    if (!ref) {
      cmapCache.set(fontId, null);
      return null;
    }
    const stream = readObject(file, data, offsets, Number(ref[1]));
    const raw = stream ? await inflateIfNeeded(stream.dict, stream.raw) : null;
    const map = raw ? parseToUnicode(latin1(raw)) : null;
    cmapCache.set(fontId, map && map.size ? map : null);
    return cmapCache.get(fontId);
  }

  const pageIds = [];
  for (const id of offsets.keys()) {
    const obj = readObject(file, data, offsets, id);
    if (obj?.dict && /\/Type\s*\/Page(?!s)\b/.test(obj.dict)) pageIds.push(id);
  }

  const chunks = [];
  for (const id of pageIds) {
    const page = readObject(file, data, offsets, id);
    if (!page?.dict) continue;
    const fonts = new Map();
    const fontDict = page.dict.match(/\/Font\s*<<([^>]*)>>/);
    if (fontDict) {
      for (const row of fontDict[1].matchAll(/\/([A-Za-z0-9]+)\s+(\d+)\s+0\s+R/g)) {
        fonts.set(row[1], await cmapForFont(Number(row[2])));
      }
    }
    const contents = [];
    const many = page.dict.match(/\/Contents\s*\[([^\]]+)\]/);
    const one = page.dict.match(/\/Contents\s+(\d+)\s+0\s+R/);
    if (many) {
      for (const row of many[1].matchAll(/(\d+)\s+0\s+R/g)) contents.push(Number(row[1]));
    } else if (one) contents.push(Number(one[1]));

    const pageLines = [];
    for (const contentId of contents) {
      const stream = readObject(file, data, offsets, contentId);
      if (!stream?.raw || /\/Subtype\s*\/Image/.test(stream.dict || "")) continue;
      const raw = await inflateIfNeeded(stream.dict, stream.raw);
      if (!raw) continue;
      const text = textFromEncodedOperators(latin1(raw), fonts);
      if (text.trim()) pageLines.push(text);
    }
    if (pageLines.length) chunks.push(pageLines.join("\n"));
  }

  const joined = chunks.join("\n").trim();
  if (!joined) {
    throw new Error("No text layer in this PDF. Missing amounts were not filled with zero.");
  }
  return joined;
}

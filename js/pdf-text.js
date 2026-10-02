/**
 * Text-layer PDF reader. Uncompressed streams and FlateDecode are read.
 * Image-only scans have no text operators. extractPdfText fails closed
 * so ingest can OCR the page image instead of inventing amounts.
 */

import { inflateZlib } from "./inflate-zlib.js";

function latin1(bytes) {
  let text = "";
  const size = 0x8000;
  for (let i = 0; i < bytes.length; i += size) {
    text += String.fromCharCode(...bytes.subarray(i, Math.min(bytes.length, i + size)));
  }
  return text;
}

function bytesFromLatin1(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) out[i] = text.charCodeAt(i) & 0xff;
  return out;
}

function concat(parts) {
  const chunks = parts.map((part) => (part instanceof Uint8Array ? part : bytesFromLatin1(part)));
  const len = chunks.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(len);
  let offset = 0;
  for (const part of chunks) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function escapePdf(text) {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildTextPdf(lines, options = {}) {
  const commands = ["BT", "/F1 11 Tf", "72 740 Td", "14 TL"];
  lines.forEach((line, index) => {
    if (index > 0) commands.push("T*");
    commands.push(`(${escapePdf(line)}) Tj`);
  });
  commands.push("ET");
  let stream = bytesFromLatin1(`${commands.join("\n")}\n`);
  let filter = "";
  if (options.deflate) {
    const deflated = options.deflate(stream);
    stream = deflated instanceof Uint8Array ? deflated : new Uint8Array(deflated);
    filter = "/Filter /FlateDecode ";
  }

  const parts = [];
  const offsets = [0];
  function here() {
    return parts.reduce((sum, part) => sum + (part instanceof Uint8Array ? part.length : part.length), 0);
  }
  function push(part) {
    parts.push(part);
  }
  function obj(id, body) {
    offsets[id] = here();
    push(body);
  }

  push("%PDF-1.4\n");
  obj(1, "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  obj(2, "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  obj(3, "3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>\nendobj\n");
  offsets[4] = here();
  push(`4 0 obj\n<< ${filter}/Length ${stream.length} >>\nstream\n`);
  push(stream);
  push("\nendstream\nendobj\n");
  obj(5, "5 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n");

  const xrefAt = here();
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let id = 1; id <= 5; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  push(xref);
  return concat(parts);
}

function dictEndingAt(fileText, streamAt) {
  let end = streamAt;
  while (end > 0 && /\s/.test(fileText[end - 1])) end -= 1;
  if (end < 2 || fileText[end - 2] !== ">" || fileText[end - 1] !== ">") return "";
  let depth = 0;
  for (let i = end - 2; i >= 0; i -= 1) {
    const pair = fileText.slice(i, i + 2);
    if (pair === ">>") {
      depth += 1;
      continue;
    }
    if (pair === "<<") {
      depth -= 1;
      if (depth === 0) return fileText.slice(i, end);
    }
  }
  return "";
}

function resolveLength(dict, fileText) {
  const ref = dict.match(/\/Length\s+(\d+)\s+0\s+R/);
  if (ref) {
    const found = fileText.match(new RegExp(`(?:^|\\n)${ref[1]}\\s+0\\s+obj\\s+(\\d+)\\s+endobj`));
    return found ? Number(found[1]) : null;
  }
  const direct = dict.match(/\/Length\s+(\d+)/);
  return direct ? Number(direct[1]) : null;
}

function readLiteral(content, start) {
  let i = start + 1;
  let text = "";
  while (i < content.length) {
    const ch = content[i];
    if (ch === "\\") {
      const next = content[i + 1];
      if (next == null) break;
      if (/[0-7]/.test(next)) {
        let oct = next;
        let j = i + 2;
        for (let n = 0; n < 2 && /[0-7]/.test(content[j] || ""); n += 1) {
          oct += content[j];
          j += 1;
        }
        text += String.fromCharCode(parseInt(oct, 8));
        i = j;
        continue;
      }
      const map = { n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" };
      text += map[next] || next;
      i += 2;
      continue;
    }
    if (ch === ")") return { text, next: i + 1 };
    text += ch;
    i += 1;
  }
  return { text, next: i };
}

function stringsFromArray(inner) {
  let text = "";
  let i = 0;
  while (i < inner.length) {
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

export function textFromContent(content) {
  const lines = [];
  let current = "";
  let i = 0;

  function newline() {
    if (current.length) {
      lines.push(current);
      current = "";
    }
  }

  while (i < content.length) {
    const ch = content[i];
    if (ch === "%") {
      while (i < content.length && content[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "(") {
      const read = readLiteral(content, i);
      i = read.next;
      const ahead = content.slice(i).match(/^\s*(Tj|'|")/);
      if (ahead) {
        current += read.text;
        if (ahead[1] !== "Tj") newline();
      }
      continue;
    }
    if (ch === "<" && content[i + 1] !== "<") {
      const end = content.indexOf(">", i + 1);
      if (end < 0) break;
      const hex = content.slice(i + 1, end).replace(/\s+/g, "");
      let text = "";
      for (let h = 0; h + 1 < hex.length; h += 2) {
        const code = Number.parseInt(hex.slice(h, h + 2), 16);
        if (Number.isFinite(code)) text += String.fromCharCode(code);
      }
      i = end + 1;
      if (/^\s*Tj/.test(content.slice(i))) current += text;
      continue;
    }
    if (ch === "[") {
      const end = content.indexOf("]", i + 1);
      if (end < 0) break;
      if (/^\s*TJ/.test(content.slice(end + 1))) current += stringsFromArray(content.slice(i + 1, end));
      i = end + 1;
      continue;
    }
    if (content.startsWith("T*", i)) {
      newline();
      i += 2;
      continue;
    }
    if (/[0-9.+\-]/.test(ch)) {
      const moved = content.slice(i).match(/^[0-9.+\-\s]{1,40}(Td|TD)/);
      if (moved) {
        newline();
        i += moved[0].length;
        continue;
      }
    }
    i += 1;
  }
  newline();
  return lines.join("\n");
}

/**
 * Streams whose dictionaries are short PDF objects. A binary page image
 * can contain the letters "stream"; those hits are skipped because the
 * dictionary between "<<" and the keyword is not a small object header.
 */
export function readPdfStreams(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 5 || data[0] !== 0x25 || data[1] !== 0x50) {
    throw new Error("This file is not a PDF.");
  }
  const fileText = latin1(data);
  const streams = [];
  let search = 0;
  while (search < fileText.length) {
    const at = fileText.indexOf("stream", search);
    if (at < 0) break;
    const boundary = at === 0 ? "\n" : fileText[at - 1];
    if (!/\s/.test(boundary)) {
      search = at + 6;
      continue;
    }
    let start = at + 6;
    if (fileText[start] === "\r") start += 1;
    if (fileText[start] === "\n") start += 1;
    const dict = dictEndingAt(fileText, at);
    if (!dict || dict.length > 8000) {
      search = at + 6;
      continue;
    }
    const length = resolveLength(dict, fileText);
    const endFrom = length != null ? Math.min(start + length, fileText.length) : start;
    const end = fileText.indexOf("endstream", endFrom);
    if (end < 0) break;
    const sliceEnd = length != null ? start + length : end;
    const raw = data.subarray(start, Math.min(sliceEnd, data.length));
    streams.push({ dict, raw });
    search = end + 9;
  }
  return streams;
}

export function buildImagePdf(jpeg, width, height) {
  const image = jpeg instanceof Uint8Array ? jpeg : new Uint8Array(jpeg);
  const content = bytesFromLatin1("q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ\n");
  return buildSingleImagePdf({
    content,
    dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /DCTDecode /Length ${image.length}`,
    stream: image,
  });
}

export function buildFlateGrayPdf(gray, width, height, deflate) {
  const raw = gray instanceof Uint8Array ? gray : new Uint8Array(gray);
  if (raw.length !== width * height) throw new Error("Gray buffer does not match its size.");
  const deflated = deflate(raw);
  const stream = deflated instanceof Uint8Array ? deflated : new Uint8Array(deflated);
  const content = bytesFromLatin1("q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ\n");
  return buildSingleImagePdf({
    content,
    dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /FlateDecode /Length ${stream.length}`,
    stream,
  });
}

export function buildUnsupportedImagePdf(filterName) {
  const stream = bytesFromLatin1("not-an-image");
  const content = bytesFromLatin1("q\n612 0 0 792 0 0 cm\n/Im0 Do\nQ\n");
  return buildSingleImagePdf({
    content,
    dict: `/Type /XObject /Subtype /Image /Width 8 /Height 8 /ColorSpace /DeviceGray /BitsPerComponent 8 /Filter /${filterName} /Length ${stream.length}`,
    stream,
  });
}

export function buildCcittPdf(encoded, width, height) {
  const stream = encoded instanceof Uint8Array ? encoded : new Uint8Array(encoded);
  const content = bytesFromLatin1(`q\n${width} 0 0 ${height} 0 0 cm\n/Im0 Do\nQ\n`);
  return buildSingleImagePdf({
    content,
    dict: `/Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceGray /BitsPerComponent 1 /Filter /CCITTFaxDecode /DecodeParms << /K -1 /Columns ${width} /Rows ${height} >> /Length ${stream.length}`,
    stream,
    mediaBox: `0 0 ${width} ${height}`,
  });
}

function buildSingleImagePdf({ content, dict, stream, mediaBox = "0 0 612 792" }) {
  const parts = [];
  const offsets = [0];
  function here() {
    return parts.reduce((sum, part) => sum + part.length, 0);
  }
  function push(part) {
    parts.push(part);
  }
  function obj(id, body) {
    offsets[id] = here();
    push(body);
  }

  push("%PDF-1.4\n");
  obj(1, "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n");
  obj(2, "2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n");
  obj(3, `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [${mediaBox}] /Contents 4 0 R /Resources << /XObject << /Im0 5 0 R >> >> >>\nendobj\n`);
  offsets[4] = here();
  push(`4 0 obj\n<< /Length ${content.length} >>\nstream\n`);
  push(content);
  push("\nendstream\nendobj\n");
  offsets[5] = here();
  push(`5 0 obj\n<< ${dict} >>\nstream\n`);
  push(stream);
  push("\nendstream\nendobj\n");

  const xrefAt = here();
  let xref = "xref\n0 6\n0000000000 65535 f \n";
  for (let id = 1; id <= 5; id += 1) {
    xref += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;
  push(xref);
  return concat(parts);
}

export async function extractPdfText(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (data.length < 5 || data[0] !== 0x25 || data[1] !== 0x50) {
    throw new Error("This file is not a PDF.");
  }
  const chunks = [];
  for (const { dict, raw } of readPdfStreams(data)) {
    if (/\/Subtype\s*\/Image/.test(dict)) continue;
    if (/\/Filter/.test(dict) && !/FlateDecode/.test(dict)) continue;
    const predictor = dict.match(/\/Predictor\s+(\d+)/);
    if (predictor && Number(predictor[1]) > 1) continue;

    let content = raw;
    if (/FlateDecode/.test(dict)) {
      try {
        content = await inflateZlib(raw);
      } catch {
        continue;
      }
    }
    const text = textFromContent(latin1(content));
    if (text.trim()) chunks.push(text);
  }

  const joined = chunks.join("\n").trim();
  if (!joined) {
    throw new Error("No text layer in this PDF. Missing amounts were not filled with zero.");
  }
  return joined;
}

/**
 * Photo-like grayscale page for OCR samples.
 * DejaVu Sans Mono, paper tone, and a fixed noise pattern.
 * The pitch is not the label font, so the raster reader leaves it unread.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as PImage from "pureimage";
import { encodeGrayJpeg } from "../js/jpeg-gray.js";

const fontPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../vendor/fonts/DejaVuSansMono.ttf");
let fontReady = null;

function loadFont() {
  if (!fontReady) {
    const font = PImage.registerFont(fontPath, "deskmono");
    fontReady = font.load();
  }
  return fontReady;
}

export async function renderPacketJpeg(lines, options = {}) {
  await loadFont();
  const fontSize = options.fontSize ?? 42;
  const lineH = options.lineH ?? 64;
  const padX = options.padX ?? 48;
  const padY = options.padY ?? 40;
  const width = options.width ?? 1280;
  const height = Math.ceil((padY * 2 + lines.length * lineH) / 8) * 8;
  const img = PImage.make(width, height);
  const ctx = img.getContext("2d");
  ctx.fillStyle = "#f4f1ea";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#1a1a1a";
  ctx.font = `${fontSize}pt deskmono`;
  lines.forEach((line, index) => {
    ctx.fillText(line, padX, padY + fontSize + index * lineH);
  });

  const gray = new Uint8Array(width * height);
  const data = img.data;
  const noise = options.noise !== false;
  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    let value = Math.round((0.299 * data[i]) + (0.587 * data[i + 1]) + (0.114 * data[i + 2]));
    if (noise) {
      const speck = ((p * 13) ^ (p >> 5)) & 7;
      value = Math.max(0, Math.min(255, value + (speck - 3)));
    }
    gray[p] = value;
  }
  return {
    width,
    height,
    gray,
    jpeg: encodeGrayJpeg(gray, width, height, 82),
  };
}

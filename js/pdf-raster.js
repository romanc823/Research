/**
 * Rasterize a PDF page when the text layer is missing and the page
 * image is not a JPEG or an 8-bit FlateDecode image.
 *
 * pdf.js paints JBIG2, CCITT Group 4, and JPEG2000 (and anything else
 * it can decode) onto a canvas. The PNG of that canvas is what OCR sees.
 * A JPEG or FlateDecode scan never reaches this module.
 */

export const PDFJS_VERSION = "6.3.289";
export const MAX_RASTER_PAGES = 40;

const INK_FLOOR = 64;

function isNode() {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

function copyBytes(bytes) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return copy;
}

function renderScale(width, height) {
  const long = Math.max(width, height);
  if (long >= 1200 && long <= 2400) return 1;
  if (long > 2400) return 2400 / long;
  return Math.min(3, 2000 / long);
}

function countInk(pixels) {
  let ink = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < 200) ink += 1;
  }
  return ink;
}

async function pngFromCanvas(canvas) {
  if (typeof canvas.toBuffer === "function") return new Uint8Array(canvas.toBuffer("image/png"));
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) return null;
  return new Uint8Array(await blob.arrayBuffer());
}

async function loadPdfjs() {
  if (isNode()) {
    const { createRequire } = await import("node:module");
    const { pathToFileURL } = await import("node:url");
    const path = await import("node:path");
    const require = createRequire(import.meta.url);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    const wasmDir = path.dirname(require.resolve("pdfjs-dist/package.json"));
    const wasmUrl = `${path.join(wasmDir, "wasm").replace(/\\/g, "/")}/`;
    return { pdfjs, wasmUrl, useWorkerFetch: false };
  }

  let pdfjs;
  try {
    pdfjs = await import("../vendor/pdfjs/pdf.min.js");
  } catch {
    throw new Error("The page rasterizer could not load. vendor/pdfjs is missing. No fields were guessed.");
  }
  const base = new URL("../vendor/pdfjs/", import.meta.url);
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdf.worker.min.js", base).href;
  return {
    pdfjs,
    wasmUrl: new URL("wasm/", base).href,
    useWorkerFetch: true,
  };
}

async function renderPage(page, createCanvas) {
  const base = page.getViewport({ scale: 1 });
  const viewport = page.getViewport({ scale: renderScale(base.width, base.height) });
  const width = Math.max(1, Math.ceil(viewport.width));
  const height = Math.max(1, Math.ceil(viewport.height));
  if (width * height > 8_000_000) return null;
  const canvas = createCanvas(width, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  await page.render({
    canvas,
    canvasContext: context,
    viewport,
    annotationMode: 0,
  }).promise;
  const pixels = context.getImageData(0, 0, width, height).data;
  if (countInk(pixels) < INK_FLOOR) return null;
  return pngFromCanvas(canvas);
}

/**
 * @param {Uint8Array} bytes
 * @returns {Promise<Uint8Array[]>} PNG pages that contain ink. Empty when every page is blank.
 */
export async function rasterizePdfPages(bytes) {
  const { pdfjs, wasmUrl, useWorkerFetch } = await loadPdfjs();
  const { createCanvas } = isNode()
    ? await import("@napi-rs/canvas")
    : { createCanvas: (width, height) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas;
    } };

  const task = pdfjs.getDocument({
    data: copyBytes(bytes),
    wasmUrl,
    useWorkerFetch,
    verbosity: 0,
    disableFontFace: true,
    useSystemFonts: false,
    maxImageSize: 40_000_000,
  });

  try {
    const doc = await task.promise;
    const pageCount = Math.min(doc.numPages || 0, MAX_RASTER_PAGES);
    const pngs = [];
    for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      try {
        const png = await renderPage(page, createCanvas);
        if (png) pngs.push(png);
      } catch {
        /* This page did not paint. Later pages can still be read. */
      } finally {
        page.cleanup();
      }
    }
    return pngs;
  } finally {
    await task.destroy().catch(() => {});
  }
}

/**
 * Browser OCR for a scan or a photo. GitHub Pages serves the engine
 * from vendor/ocr/. Node's checker uses the same traineddata via tesseract.js.
 * Lines come back with a 0–1 confidence. The field parser decides what to keep.
 */

const TESSERACT_VERSION = "5.1.1";

let pending = null;

function isNode() {
  return typeof process !== "undefined" && Boolean(process.versions?.node);
}

function asset(name) {
  return new URL(`../vendor/ocr/${name}`, import.meta.url);
}

async function startWorker() {
  const parameters = {
    tessedit_pageseg_mode: "6",
    preserve_interword_spaces: "1",
    user_defined_dpi: "200",
  };
  if (isNode()) {
    let createWorker;
    try {
      ({ createWorker } = await import("tesseract.js"));
    } catch {
      throw new Error("OCR needs tesseract.js. From the repo root run npm install, then npm run check. No fields were guessed.");
    }
    const { fileURLToPath } = await import("node:url");
    const path = await import("node:path");
    const langPath = path.dirname(fileURLToPath(asset("tessdata/eng.traineddata.gz")));
    const worker = await createWorker("eng", 1, {
      langPath,
      gzip: true,
      cacheMethod: "none",
    });
    await worker.setParameters(parameters);
    return worker;
  }

  let api;
  try {
    const mod = await import(asset("tesseract.esm.min.js"));
    api = mod.default?.createWorker ? mod.default : mod;
  } catch {
    throw new Error("OCR could not load on this page. vendor/ocr is missing. No fields were guessed.");
  }
  const worker = await api.createWorker("eng", 1, {
    workerPath: new URL("worker.min.js", asset("")).href,
    corePath: new URL("core/", asset("")).href,
    langPath: new URL("tessdata", asset("")).href,
    gzip: true,
    cacheMethod: "none",
  });
  await worker.setParameters(parameters);
  return worker;
}

function getWorker() {
  if (!pending) {
    pending = startWorker().catch((error) => {
      pending = null;
      throw error;
    });
  }
  return pending;
}

export async function shutdownOcr() {
  const current = pending;
  pending = null;
  if (!current) return;
  try {
    const worker = await current;
    await worker.terminate();
  } catch {
    /* The worker never started. */
  }
}

function lineRows(data) {
  const rows = [];
  for (const line of data?.lines || []) {
    const text = String(line.text || "").replace(/\s+/g, " ").trim();
    if (!text) continue;
    const confidence = Number(line.confidence);
    rows.push({
      text,
      confidence: Number.isFinite(confidence) ? confidence / 100 : 0,
    });
  }
  return rows;
}

/**
 * @param {Uint8Array[]} images JPEG, PNG, or BMP bytes
 * @returns {Promise<{ text: string, confidence: number }[]>}
 */
export async function recognizeImages(images) {
  if (!images.length) return [];
  const worker = await getWorker();
  const rows = [];
  for (const image of images) {
    const bytes = image instanceof Uint8Array ? image : new Uint8Array(image);
    const payload = isNode() ? Buffer.from(bytes) : bytes;
    const { data } = await worker.recognize(payload, {}, { text: true, blocks: true });
    rows.push(...lineRows(data));
  }
  return rows;
}

export { TESSERACT_VERSION };

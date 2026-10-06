/**
 * Proves the Tax Planning embed fills #taxPlanningDeskModal and does not
 * paint over the other tools in that slot.
 *
 * The fake-DOM cases run in plain Node. The pixel cases drive headless
 * Chrome against tools/embed-host-fixture.html, a same-origin stand-in for
 * the Planning Tools mount (this repo has no Business Valuator router).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fitEmbeddedFrame, releaseEmbeddedFrame } from "../js/embed-frame.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

class ClassList {
  constructor() { this.set = new Set(); }
  contains(name) { return this.set.has(name); }
  add(...names) { for (const name of names) this.set.add(name); }
  remove(...names) { for (const name of names) this.set.delete(name); }
}

class Style {
  constructor() { this.map = new Map(); }
  getPropertyValue(prop) { return this.map.get(prop)?.value || ""; }
  getPropertyPriority(prop) { return this.map.get(prop)?.priority || ""; }
  setProperty(prop, value, priority = "") {
    this.map.set(prop, { value: String(value).trim(), priority: priority || "" });
  }
  removeProperty(prop) { this.map.delete(prop); }
}

function createDocument() {
  const doc = {
    documentElement: null,
    body: null,
    defaultView: {
      getComputedStyle(el) {
        const inline = el.style.getPropertyValue("display").trim();
        let display = "block";
        if (el.classList.contains("modal-bg") && !el.classList.contains("open")) display = "none";
        if (el.classList.contains("open")) display = "flex";
        if (el.hidden) display = "none";
        if (inline) display = inline;
        const visibility = el.style.getPropertyValue("visibility").trim() || "visible";
        return { display, visibility };
      },
    },
  };
  return doc;
}

function createElement(doc, tag) {
  const el = {
    ownerDocument: doc,
    tagName: tag.toUpperCase(),
    nodeType: 1,
    id: "",
    hidden: false,
    classList: new ClassList(),
    style: new Style(),
    attrs: new Map(),
    parentElement: null,
    getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; },
    setAttribute(name, value) { this.attrs.set(name, String(value)); },
    removeAttribute(name) { this.attrs.delete(name); },
    hasAttribute(name) { return this.attrs.has(name); },
    append(child) {
      child.parentElement = this;
      return child;
    },
  };
  return el;
}

function buildHost({ open = false, mountId = "taxPlanningDeskModal" } = {}) {
  const doc = createDocument();
  const html = createElement(doc, "html");
  const body = createElement(doc, "body");
  const shared = createElement(doc, "div");
  shared.id = "sharedShell";
  const slot = createElement(doc, "div");
  slot.id = "toolSlot";
  const mount = createElement(doc, "div");
  mount.id = mountId;
  mount.classList.add("modal-bg");
  if (open) mount.classList.add("open");
  const inner = createElement(doc, "div");
  inner.classList.add("tp-body");
  const frame = createElement(doc, "iframe");
  frame.id = "tpDeskFrame";
  html.append(body);
  body.append(shared);
  shared.append(slot);
  slot.append(mount);
  mount.append(inner);
  inner.append(frame);
  doc.documentElement = html;
  doc.body = body;
  return { doc, shared, slot, mount, inner, frame };
}

function ownedProps(el) {
  const raw = el.getAttribute("data-tax-embed-fit");
  if (!raw) return {};
  return JSON.parse(raw);
}

function assertUntouched(el, label) {
  if (el.getAttribute("data-tax-embed-fit")) fail(`${label} was marked by the embed fit`);
  if (el.style.map.size) fail(`${label} received an inline style (${[...el.style.map.keys()].join(", ")})`);
}

function assertNoDisplay(el, label) {
  if (el.style.getPropertyValue("display")) fail(`${label} display was set to ${el.style.getPropertyValue("display")}`);
  const owned = ownedProps(el);
  if (Object.hasOwn(owned, "display")) fail(`${label} recorded a display override`);
}

function checkPolicy() {
  const closed = buildHost({ open: false });
  closed.mount.style.setProperty("display", "flex", "important");
  closed.inner.style.setProperty("display", "flex", "important");
  fitEmbeddedFrame(closed.frame);
  if (closed.mount.style.getPropertyValue("display")) fail("closed mount kept display:flex !important");
  if (closed.inner.style.getPropertyValue("display")) fail("closed inner wrapper kept display:flex !important");
  if (closed.frame.style.getPropertyValue("height")) fail("closed iframe was stretched");
  assertUntouched(closed.shared, "shared shell");
  assertUntouched(closed.slot, "tool slot");
  assertNoDisplay(closed.mount, "closed mount");

  const open = buildHost({ open: true });
  fitEmbeddedFrame(open.frame);
  for (const [el, label] of [[open.frame, "iframe"], [open.inner, "inner"], [open.mount, "mount"]]) {
    const height = el.style.getPropertyValue("height");
    const priority = el.style.getPropertyPriority("height");
    if (height !== "100%" || priority !== "important") fail(`${label} height was ${height} (${priority || "no priority"})`);
    assertNoDisplay(el, label);
  }
  if (open.frame.style.getPropertyValue("border-style") !== "none") fail("iframe border was not cleared");
  if (open.mount.style.getPropertyValue("flex-direction") !== "column") fail("mount was not a column");
  if (open.frame.style.getPropertyValue("flex-direction")) fail("iframe was given flex-direction");
  assertUntouched(open.shared, "open shared shell");
  assertUntouched(open.slot, "open tool slot");

  open.mount.classList.remove("open");
  fitEmbeddedFrame(open.frame);
  if (open.mount.style.getPropertyValue("height")) fail("switching tools left the mount height override");
  if (open.frame.style.getPropertyValue("height")) fail("switching tools left the iframe height override");
  if (open.mount.getAttribute("data-tax-embed-fit")) fail("switching tools left the mount mark");
  assertUntouched(open.slot, "slot after tool switch");

  const orphan = buildHost({ open: true, mountId: "businessValuator" });
  orphan.slot.style.setProperty("display", "flex");
  fitEmbeddedFrame(orphan.frame);
  assertUntouched(orphan.shared, "unmarked shared shell");
  assertUntouched(orphan.mount, "foreign modal");
  if (orphan.slot.getAttribute("data-tax-embed-fit")) fail("unmarked slot was marked by the embed fit");
  if (orphan.slot.style.getPropertyValue("display") !== "flex") fail("unmarked slot display was changed");
  if (orphan.slot.style.getPropertyPriority("display")) fail("unmarked slot display was forced");
  if ([...orphan.slot.style.map.keys()].some((prop) => prop !== "display")) {
    fail("unmarked slot received embed geometry");
  }
  if (orphan.frame.style.getPropertyValue("height")) fail("an iframe outside #taxPlanningDeskModal was stretched");

  const shown = buildHost({ open: false });
  shown.mount.style.setProperty("display", "flex");
  fitEmbeddedFrame(shown.frame);
  if (shown.mount.style.getPropertyPriority("display") === "important") fail("host inline display was upgraded to !important");
  if (shown.frame.style.getPropertyValue("height") !== "100%") fail("host inline display:flex did not count as open");

  const inlineHide = buildHost({ open: true });
  fitEmbeddedFrame(inlineHide.frame);
  inlineHide.mount.style.setProperty("display", "none");
  fitEmbeddedFrame(inlineHide.frame);
  if (inlineHide.mount.style.getPropertyValue("display") !== "none") fail("host display:none was replaced");
  if (inlineHide.frame.style.getPropertyValue("height")) fail("display:none mount stayed stretched");

  const hiddenAttr = buildHost({ open: true });
  fitEmbeddedFrame(hiddenAttr.frame);
  hiddenAttr.mount.hidden = true;
  fitEmbeddedFrame(hiddenAttr.frame);
  if (hiddenAttr.mount.style.getPropertyValue("height")) fail("hidden mount stayed stretched");

  hiddenAttr.mount.hidden = false;
  hiddenAttr.mount.classList.add("open");
  fitEmbeddedFrame(hiddenAttr.frame);
  releaseEmbeddedFrame(hiddenAttr.frame);
  if (hiddenAttr.frame.style.getPropertyValue("height") || hiddenAttr.mount.style.getPropertyValue("height")) {
    fail("releaseEmbeddedFrame left a stretch override");
  }

  const ancestor = buildHost({ open: true });
  ancestor.slot.hidden = true;
  fitEmbeddedFrame(ancestor.frame);
  if (ancestor.mount.style.getPropertyValue("height")) fail("a hidden slot still stretched the tax mount");
  assertUntouched(ancestor.slot, "hidden slot");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startServer(port) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["tools/serve.mjs"], {
      cwd: root,
      env: { ...process.env, PORT: String(port) },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let log = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error(`server did not listen\n${log}`));
    }, 8000);
    child.stdout.on("data", (chunk) => {
      log += chunk.toString();
      const match = log.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve({ child, origin: `http://127.0.0.1:${match[1]}`, log });
      }
    });
    child.stderr.on("data", (chunk) => { log += chunk.toString(); });
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`server exited ${code}\n${log}`));
    });
  });
}

function startChrome(url) {
  const chrome = process.env.CHROME || "google-chrome";
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "tax-embed-chrome-"));
  const child = spawn(chrome, [
    "--headless=new",
    "--no-sandbox",
    "--disable-gpu",
    "--disable-dev-shm-usage",
    `--user-data-dir=${profile}`,
    "--window-size=1280,800",
    "--remote-debugging-port=0",
    url,
  ], { stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  const browser = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`chrome did not open a debugger\n${log}`)), 15000);
    const watch = (chunk) => {
      log += chunk.toString();
      const match = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (!match) return;
      clearTimeout(timer);
      const port = new URL(match[1]).port;
      resolve({ child, profile, port, log });
    };
    child.stderr.on("data", watch);
    child.stdout.on("data", watch);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`chrome exited ${code}\n${log}`));
    });
  });
  return browser;
}

async function connectPage(port) {
  let list = [];
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      list = await new Promise((resolve, reject) => {
        http.get(`http://127.0.0.1:${port}/json/list`, (res) => {
          let body = "";
          res.on("data", (chunk) => { body += chunk; });
          res.on("end", () => {
            try { resolve(JSON.parse(body)); } catch (error) { reject(error); }
          });
        }).on("error", reject);
      });
    } catch {
      await sleep(100);
      continue;
    }
    const page = list.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (page) return page.webSocketDebuggerUrl;
    await sleep(100);
  }
  throw new Error(`no chrome page\n${JSON.stringify(list)}`);
}

function openSocket(url) {
  const ws = new WebSocket(url);
  let next = 0;
  const pending = new Map();
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve(ws));
    ws.addEventListener("error", () => reject(new Error("devtools socket failed")));
  });
  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    pending.get(message.id)(message);
    pending.delete(message.id);
  });
  async function send(method, params = {}) {
    await ready;
    const id = ++next;
    const result = new Promise((resolve) => pending.set(id, resolve));
    ws.send(JSON.stringify({ id, method, params }));
    return result;
  }
  return { ws, send, ready };
}

async function evaluate(send, expression) {
  const message = await send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  const result = message.result?.result;
  if (message.result?.exceptionDetails) {
    throw new Error(message.result.exceptionDetails.text || "evaluate failed");
  }
  return result?.value;
}

async function waitFor(send, expression, label) {
  let last;
  for (let attempt = 0; attempt < 200; attempt += 1) {
    last = await evaluate(send, expression);
    if (last) return last;
    await sleep(100);
  }
  throw new Error(`timed out waiting for ${label}: ${JSON.stringify(last)}`);
}

async function shot(send, file) {
  const message = await send("Page.captureScreenshot", { format: "png" });
  const data = message.result?.data;
  if (!data) throw new Error("screenshot failed");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(data, "base64"));
}

const MEASURE = `window.measureEmbed = () => {
  const slot = document.getElementById("toolSlot");
  const frame = document.getElementById("tpDeskFrame");
  const mount = document.getElementById("taxPlanningDeskModal");
  const shared = document.getElementById("sharedShell");
  const slotRect = slot.getBoundingClientRect();
  const frameRect = frame.getBoundingClientRect();
  const x = slotRect.left + slotRect.width / 2;
  const y = slotRect.top + Math.min(slotRect.height / 2, Math.max(slotRect.height - 40, 0));
  const hit = document.elementFromPoint(x, y);
  const doc = frame.contentDocument;
  const shell = doc && doc.querySelector(".shell");
  const text = doc && doc.body ? doc.body.innerText : "";
  const owns = (id) => !!(hit && hit.closest && hit.closest(id));
  return {
    slotH: Math.round(slotRect.height),
    frameH: Math.round(frameRect.height),
    frameW: Math.round(frameRect.width),
    mountDisplay: getComputedStyle(mount).display,
    hit: owns("#taxPlanningDeskModal") ? "tax" : owns("#bvPanel") ? "bv" : owns("#scorpPanel") ? "scorp" : (hit && (hit.id || hit.tagName)),
    sharedMarked: shared.hasAttribute("data-tax-embed-fit"),
    slotMarked: slot.hasAttribute("data-tax-embed-fit"),
    bodyMarked: document.body.hasAttribute("data-tax-embed-fit"),
    sharedStyle: shared.getAttribute("style"),
    slotStyle: slot.getAttribute("style"),
    mountDisplayInline: mount.style.getPropertyValue("display"),
    mountMarked: mount.hasAttribute("data-tax-embed-fit"),
    shellH: shell ? shell.clientHeight : 0,
    readyText: text.includes("fixtures match their expected bands"),
  };
}; true`;

function assertClosed(measure, label) {
  if (!measure) {
    fail(`${label}: no measurement`);
    return;
  }
  if (measure.mountDisplay !== "none") fail(`${label}: mount display was ${measure.mountDisplay}`);
  if (measure.mountDisplayInline) fail(`${label}: mount inline display was ${measure.mountDisplayInline}`);
  if (measure.mountMarked) fail(`${label}: hidden mount kept embed styles`);
  if (measure.hit === "tax") fail(`${label}: the pointer hit the Tax Planning desk`);
  if (measure.sharedMarked || measure.slotMarked || measure.bodyMarked) fail(`${label}: embed styles escaped the mount`);
  if (measure.sharedStyle || measure.slotStyle) fail(`${label}: shared shell or slot was restyled`);
}

function assertFilled(measure, label) {
  if (!measure) {
    fail(`${label}: no measurement`);
    return;
  }
  if (measure.mountDisplay === "none") fail(`${label}: tax mount was hidden while selected`);
  if (measure.mountDisplayInline) fail(`${label}: fit forced inline display ${measure.mountDisplayInline}`);
  const delta = Math.abs(measure.frameH - measure.slotH);
  if (delta > 8) fail(`${label}: iframe height ${measure.frameH} vs slot ${measure.slotH}`);
  if (measure.frameH < 400) fail(`${label}: iframe stayed short (${measure.frameH})`);
  if (measure.hit !== "tax") fail(`${label}: pointer hit ${measure.hit} instead of the desk`);
  if (measure.shellH < 300) fail(`${label}: desk shell was ${measure.shellH}px inside the iframe`);
  if (!measure.readyText) fail(`${label}: desk findings were not on screen`);
  if (measure.sharedMarked || measure.slotMarked || measure.bodyMarked) fail(`${label}: embed styles escaped the mount`);
  if (measure.sharedStyle || measure.slotStyle) fail(`${label}: shared shell or slot was restyled`);
}

async function checkBrowserLayout() {
  const artifacts = process.env.EMBED_ARTIFACT_DIR || "/opt/cursor/artifacts";
  let server;
  let chrome;
  let ws;
  try {
    server = await startServer(8766);
    chrome = await startChrome(`${server.origin}/tools/embed-host-fixture.html`);
    const socketUrl = await connectPage(chrome.port);
    const session = openSocket(socketUrl);
    ws = session.ws;
    await session.ready;
    await session.send("Page.enable");
    await session.send("Runtime.enable");
    await waitFor(session.send, `(() => {
      const frame = document.getElementById("tpDeskFrame");
      const doc = frame && frame.contentDocument;
      return !!(doc && doc.readyState === "complete" && doc.documentElement.classList.contains("planning-embed"));
    })()`, "embedded desk");
    await evaluate(session.send, MEASURE);

    const closed = await evaluate(session.send, "measureEmbed()");
    assertClosed(closed, "Business Valuator");

    await evaluate(session.send, `selectTool("tax"); document.getElementById("tpDeskFrame").contentWindow.dispatchEvent(new Event("resize"));`);
    const filled = await waitFor(session.send, `(() => {
      const sample = measureEmbed();
      const delta = Math.abs(sample.frameH - sample.slotH);
      return sample.readyText && sample.shellH > 300 && delta <= 8 ? sample : null;
    })()`, "tax fill");
    assertFilled(filled, "Tax Planning App");
    await shot(session.send, path.join(artifacts, "tax-planning-fills-slot.png"));

    await evaluate(session.send, `selectTool("scorp"); document.getElementById("tpDeskFrame").contentWindow.dispatchEvent(new Event("resize"));`);
    const scorp = await waitFor(session.send, `(() => {
      const sample = measureEmbed();
      return sample.mountDisplay === "none" && sample.hit === "scorp" ? sample : null;
    })()`, "S Corp isolation");
    assertClosed(scorp, "S Corp");
    await shot(session.send, path.join(artifacts, "scorp-without-tax-desk.png"));

    await evaluate(session.send, `selectTool("bv"); document.getElementById("tpDeskFrame").contentWindow.dispatchEvent(new Event("resize"));`);
    const bv = await waitFor(session.send, `(() => {
      const sample = measureEmbed();
      return sample.mountDisplay === "none" && sample.hit === "bv" ? sample : null;
    })()`, "Business Valuator isolation");
    assertClosed(bv, "Business Valuator again");
    await shot(session.send, path.join(artifacts, "business-valuator-without-tax-desk.png"));

    await evaluate(session.send, `document.getElementById("toolSlot").classList.add("legacy"); selectTool("tax"); document.getElementById("tpDeskFrame").contentWindow.dispatchEvent(new Event("resize"));`);
    const legacy = await waitFor(session.send, `(() => {
      const sample = measureEmbed();
      const delta = Math.abs(sample.frameH - sample.slotH);
      return sample.readyText && delta <= 8 && sample.frameH > 400 ? sample : null;
    })()`, "legacy slot fill");
    assertFilled(legacy, "legacy flex-end slot");
    console.log(`Embed layout: slot ${filled.slotH}px, iframe ${filled.frameH}px, shell ${filled.shellH}px; legacy iframe ${legacy.frameH}px.`);
  } finally {
    try { ws?.close(); } catch { /* already closed */ }
    const stops = [];
    for (const child of [chrome?.child, server?.child]) {
      if (!child || child.killed) continue;
      stops.push(new Promise((resolve) => {
        child.once("exit", resolve);
        child.kill("SIGTERM");
        setTimeout(resolve, 1000);
      }));
    }
    await Promise.all(stops);
    if (chrome?.profile) {
      try { fs.rmSync(chrome.profile, { recursive: true, force: true }); } catch { /* profile release is best-effort */ }
    }
  }
}

checkPolicy();
try {
  await checkBrowserLayout();
} catch (error) {
  fail(error instanceof Error ? error.stack || error.message : String(error));
}

if (failures.length) {
  console.error(`Embed isolation check failed (${failures.length})`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log("Embed isolation check passed: mount-only styles, hidden tools stay hidden, selected Tax Planning fills the slot.");

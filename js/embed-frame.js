/**
 * Planning Tools mounts this desk in an iframe inside #taxPlanningDeskModal.
 * The iframe otherwise stays at the browser default (~150px), or the host
 * sizes it with 100dvh, which is taller than the tool slot and gets clipped.
 *
 * Same-origin embeds can stretch that iframe to the slot. The stretch stops
 * at #taxPlanningDeskModal. Nothing outside that mount is written, and
 * `display` is never set: an inline `display: flex !important` beats the
 * host's tool switch and leaves this desk painted over Business Valuator
 * and the other tools. When the mount is hidden, every override from this
 * file is removed so the host cascade shows the selected tool again.
 *
 * Cross-origin embeds cannot see the parent. They keep the planning-embed
 * CSS and fill whatever height the host gives the iframe.
 */

const MOUNT_ID = "taxPlanningDeskModal";
const MARK = "data-tax-embed-fit";
const WALK_LIMIT = 12;

const HIDE_CLASS = new Set([
  "hidden",
  "is-hidden",
  "closed",
  "is-closed",
  "inactive",
  "d-none",
  "modal-closed",
]);

const BOX_PROPS = Object.freeze([
  ["box-sizing", "border-box"],
  ["flex-direction", "column"],
  ["flex", "1 1 auto"],
  ["align-self", "stretch"],
  ["width", "100%"],
  ["height", "100%"],
  ["min-height", "0"],
  ["max-height", "none"],
  ["margin", "0"],
  ["overflow", "hidden"],
]);

const FRAME_PROPS = Object.freeze([
  ...BOX_PROPS.filter(([prop]) => prop !== "flex-direction"),
  ["border-width", "0"],
  ["border-style", "none"],
]);

const watches = new WeakMap();
let fitting = false;

function resolveFrame(root) {
  if (root && root.nodeType === 1 && root.ownerDocument) return root;
  if (typeof window === "undefined") return null;
  try {
    return window.frameElement;
  } catch {
    return null;
  }
}

function readOwned(el) {
  const raw = el.getAttribute?.(MARK);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object") return parsed;
  } catch {
    /* replace a damaged mark */
  }
  return {};
}

function writeOwned(el, owned) {
  if (!owned || !Object.keys(owned).length) {
    el.removeAttribute(MARK);
    return;
  }
  el.setAttribute(MARK, JSON.stringify(owned));
}

function applyProp(el, prop, value) {
  const owned = readOwned(el);
  const current = el.style.getPropertyValue(prop).trim();
  const priority = el.style.getPropertyPriority(prop);
  const record = owned[prop];
  if (record && record.value === current && priority === "important") return;
  if (!record) owned[prop] = { prev: current, prevPriority: priority };
  el.style.setProperty(prop, value, "important");
  owned[prop].value = el.style.getPropertyValue(prop).trim() || value;
  writeOwned(el, owned);
}

function stripOwned(el) {
  if (!el?.style || !el.getAttribute?.(MARK)) return;
  const owned = readOwned(el);
  for (const [prop, info] of Object.entries(owned)) {
    if (!info || typeof info !== "object") continue;
    const current = el.style.getPropertyValue(prop).trim();
    if (info.value != null && current && current !== info.value) continue;
    if (info.prev) el.style.setProperty(prop, info.prev, info.prevPriority || "");
    else el.style.removeProperty(prop);
  }
  el.removeAttribute(MARK);
}

function clearForcedDisplay(el) {
  if (!el?.style) return;
  if (el.style.getPropertyPriority("display") !== "important") return;
  const value = el.style.getPropertyValue("display").trim();
  if (value === "flex" || value === "block") el.style.removeProperty("display");
}

function findMount(frame) {
  const doc = frame.ownerDocument;
  if (!doc) return null;
  let node = frame;
  for (let guard = 0; node && guard < WALK_LIMIT; guard += 1) {
    if (node.id === MOUNT_ID) return node;
    if (node === doc.body || node === doc.documentElement) return null;
    node = node.parentElement;
  }
  return null;
}

function chainWithinMount(frame, mount) {
  const chain = [];
  let node = frame;
  for (let guard = 0; node && guard < WALK_LIMIT; guard += 1) {
    chain.push(node);
    if (node === mount) return chain;
    node = node.parentElement;
  }
  return null;
}

function hasHideToken(el) {
  const list = el.classList;
  if (!list?.contains) return false;
  for (const name of HIDE_CLASS) {
    if (list.contains(name)) return true;
  }
  return false;
}

function cssShown(el) {
  try {
    const view = el.ownerDocument?.defaultView;
    const cs = view?.getComputedStyle?.(el);
    if (!cs) return false;
    if (cs.display === "none" || cs.visibility === "hidden" || cs.visibility === "collapse") return false;
    return true;
  } catch {
    return false;
  }
}

function hostPresents(mount) {
  const doc = mount.ownerDocument;
  let node = mount;
  while (node && node.nodeType === 1) {
    if (node.hidden) return false;
    if (node === mount) {
      if (node.getAttribute("aria-hidden") === "true") return false;
      if (node.hasAttribute("inert")) return false;
      if (hasHideToken(node)) return false;
    }
    if (!cssShown(node)) return false;
    if (node === doc.body) break;
    node = node.parentElement;
  }
  return true;
}

function propsFor(el, frame) {
  return el === frame ? FRAME_PROPS : BOX_PROPS;
}

function releaseChain(nodes) {
  if (!nodes) return;
  for (const el of nodes) {
    clearForcedDisplay(el);
    stripOwned(el);
  }
}

function watchMount(mount) {
  if (!mount || watches.has(mount)) return;
  const Observer = mount.ownerDocument?.defaultView?.MutationObserver;
  if (typeof Observer !== "function") return;
  const observer = new Observer(() => {
    fitEmbeddedFrame();
  });
  const options = {
    attributes: true,
    attributeFilter: ["class", "style", "hidden", "aria-hidden", "inert"],
  };
  const doc = mount.ownerDocument;
  let node = mount;
  while (node && node.nodeType === 1) {
    observer.observe(node, options);
    if (node === doc.body) break;
    node = node.parentElement;
  }
  watches.set(mount, observer);
}

function fitFrame(frame) {
  const mount = findMount(frame);
  if (!mount) {
    clearForcedDisplay(frame);
    stripOwned(frame);
    return;
  }
  const chain = chainWithinMount(frame, mount);
  if (!chain) {
    clearForcedDisplay(frame);
    stripOwned(frame);
    return;
  }
  for (const el of chain) clearForcedDisplay(el);
  if (!hostPresents(mount)) {
    for (const el of chain) stripOwned(el);
    watchMount(mount);
    return;
  }
  for (const el of chain) {
    for (const [prop, value] of propsFor(el, frame)) applyProp(el, prop, value);
  }
  watchMount(mount);
}

export function fitEmbeddedFrame(root) {
  if (fitting) return;
  const frame = resolveFrame(root);
  if (!frame) return;
  fitting = true;
  try {
    fitFrame(frame);
  } finally {
    fitting = false;
  }
}

export function releaseEmbeddedFrame(root) {
  const frame = resolveFrame(root);
  if (!frame) return;
  const mount = findMount(frame);
  if (!mount) {
    releaseChain([frame]);
    return;
  }
  releaseChain(chainWithinMount(frame, mount) || [frame]);
}

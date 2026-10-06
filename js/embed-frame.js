/**
 * Planning Tools mounts the desk in an iframe inside a flex column.
 * The iframe otherwise stays at the browser default (~150px) and sits at
 * the bottom of the panel, or the host sets height to 100dvh, which is
 * taller than the tool slot and gets clipped. Same-origin embeds can
 * stretch that iframe to the slot. Cross-origin embeds keep the
 * planning-embed CSS and fill whatever height the host gives.
 */

function setImportant(node, prop, value) {
  node.style.setProperty(prop, value, "important");
}

export function fitEmbeddedFrame() {
  let frame = null;
  try {
    frame = window.frameElement;
  } catch (err) {
    return;
  }
  if (!frame) return;

  const doc = frame.ownerDocument;
  if (!doc) return;

  const chain = [];
  let node = frame;
  let guard = 0;
  while (node && node !== doc.body && node !== doc.documentElement && guard < 8) {
    chain.push(node);
    guard += 1;
    if (node.classList.contains("modal-bg") || node.id === "taxPlanningDeskModal") break;
    node = node.parentElement;
  }

  for (const el of chain) {
    const isFrame = el === frame;
    setImportant(el, "box-sizing", "border-box");
    setImportant(el, "display", isFrame ? "block" : "flex");
    if (!isFrame) setImportant(el, "flex-direction", "column");
    setImportant(el, "flex", "1 1 auto");
    setImportant(el, "align-self", "stretch");
    setImportant(el, "width", "100%");
    setImportant(el, "height", "100%");
    setImportant(el, "min-height", "0");
    setImportant(el, "max-height", "none");
    setImportant(el, "margin", "0");
    setImportant(el, "overflow", "hidden");
  }
  setImportant(frame, "border", "0");
}

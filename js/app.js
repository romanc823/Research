import { evaluateFixture, matchExpectation } from "./evaluate.js";
import { ingestDocument } from "./ingest.js";
import { parseFixtureText } from "./intake.js";

const PASS_HINT = {
  "one-pass": "One-pass · about 3 min",
  "second-eye": "Second-eye · about 5 min",
  "tray-skim": "Tray skim · about 2 min",
};

const GROUP_LABEL = {
  high: "High hits",
  silent: "Silent twins",
  medium: "Medium tray",
  dropped: "Dropped packets",
};

const state = {
  manifest: [],
  typesById: {},
  selectedId: null,
  tab: "high",
  detailKey: null,
  packets: new Map(),
  checks: new Map(),
};

const rail = document.querySelector("#rail");
const stage = document.querySelector("#stage");
const checkSlot = document.querySelector("#check-status");

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

function showValue(value) {
  if (value == null || value === "") return "—";
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

async function loadJson(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Could not load ${url}`);
  return response.json();
}

function typesMap(list) {
  const map = {};
  for (const type of list) map[type.id] = type;
  return map;
}

function renderRail() {
  const groups = ["high", "silent", "medium", "dropped"];
  const options = state.manifest.map((item) => {
    const selected = item.id === state.selectedId ? " selected" : "";
    return `<option value="${esc(item.id)}"${selected}>${esc(item.label)}</option>`;
  }).join("");

  const lists = groups.map((group) => {
    const items = state.manifest.filter((item) => item.group === group);
    if (!items.length) return "";
    const buttons = items.map((item) => {
      const active = item.id === state.selectedId ? " is-active" : "";
      const packet = state.packets.get(item.id);
      const check = packet?.fixture?.expected ? state.checks.get(item.id) : null;
      const mark = check ? (check.ok ? "ok" : "bad") : "pending";
      return `<button type="button" class="fixture${active}" data-fixture="${esc(item.id)}">
        <span class="mark mark-${mark}" aria-hidden="true"></span>
        <span>
          <span class="fixture-label">${esc(item.label)}</span>
          <span class="fixture-id">${esc(item.id)}</span>
        </span>
      </button>`;
    }).join("");
    return `<section class="group"><h2>${esc(GROUP_LABEL[group])}</h2>${buttons}</section>`;
  }).join("");

  rail.innerHTML = `
    <label class="picker-label" for="fixture-select">Fixture</label>
    <select id="fixture-select">${options}</select>
    <div class="drop" id="drop-zone">
      <p><strong>Drop a packet</strong></p>
      <p>Fixture JSON, a text-layer PDF, a labeled JPEG/PNG, or a scan or photo of those same labels. OCR runs in the browser when the text layer and the label font are both missing. Low-confidence lines are omitted. Blank amounts stay blank.</p>
      <label class="file-btn">
        Choose file
        <input id="file-input" type="file" accept=".json,.pdf,.png,.jpg,.jpeg,application/json,application/pdf,image/png,image/jpeg" />
      </label>
      <div class="sample-row">
        <button type="button" data-sample="samples/ingest/synthetic-augusta.pdf">Sample PDF</button>
        <button type="button" data-sample="samples/ingest/synthetic-rep-hours.jpg">Sample JPEG</button>
        <button type="button" data-sample="samples/ingest/synthetic-silent-misses.png">Sample PNG</button>
        <button type="button" data-sample="samples/ingest/synthetic-scan-augusta.pdf">Sample scan</button>
        <button type="button" data-sample="samples/ingest/synthetic-photo-sep.jpg">Sample photo</button>
      </div>
      <p id="drop-note" class="drop-note" hidden></p>
    </div>
    <div class="fixture-list">${lists}</div>
  `;
}

function ingestValue(value) {
  if (Array.isArray(value)) return value.length ? value.join(", ") : "—";
  if (value && typeof value === "object") return JSON.stringify(value);
  return showValue(value);
}

function renderIngest(fixture) {
  const ingest = fixture.ingest;
  if (!ingest) return "";
  const kind = {
    pdf: "Text-layer PDF",
    "pdf-ocr": "Scanned PDF",
    jpeg: "Labeled JPEG",
    "jpeg-ocr": "Photo JPEG",
    png: "Labeled PNG",
    "png-ocr": "Photo PNG",
    text: "Labeled text",
  }[ingest.sourceKind] || "Ingest";
  const kept = (ingest.accepted || []).map((row) => `
    <li><span>${esc(row.evidence)}</span><span>${esc(ingestValue(row.value))} · ${esc(Number.isFinite(Number(row.confidence)) ? Number(row.confidence).toFixed(2) : row.confidence)}</span></li>
  `).join("");
  const omitted = (ingest.dropped || []).map((row) => `
    <li><span>${esc(row.evidence || "—")}</span><span>${esc(row.reason)}</span></li>
  `).join("");
  return `
    <p class="ingest-summary">${esc(kind)} · confidence floor ${esc(ingest.confidenceFloor)}${ingest.ocrWatchFloor != null ? ` · watch floor ${esc(ingest.ocrWatchFloor)} on types 13, 14, and 15` : ""} · ${Object.keys(fixture.fields || {}).length} fields kept · ${(ingest.dropped || []).length} lines omitted</p>
    <details class="silent ingest">
      <summary>Provenance — kept lines and omitted lines</summary>
      <h4>Kept</h4>
      <ul>${kept || "<li><span>No labeled field cleared the floor.</span><span></span></li>"}</ul>
      <h4>Omitted</h4>
      <ul>${omitted || "<li><span>Nothing omitted.</span><span></span></li>"}</ul>
    </details>
  `;
}

function renderEvidence(evidence) {
  const rows = Object.entries(evidence || {}).map(([key, value]) => `
    <div>
      <dt>${esc(key)}</dt>
      <dd>${esc(showValue(value))}</dd>
    </div>
  `).join("");
  return `<dl class="fields">${rows}</dl>`;
}

function renderStage() {
  const packet = state.packets.get(state.selectedId);
  if (!packet) {
    stage.innerHTML = `<p class="empty">Loading packet…</p>`;
    return;
  }
  const { fixture, evaluation } = packet;
  const cards = evaluation.cards;
  const visible = cards.filter((card) => (state.tab === "high" ? card.band === "High" : card.band === "Medium"));
  const highCount = cards.filter((card) => card.band === "High").length;
  const mediumCount = cards.filter((card) => card.band === "Medium").length;
  const silent = evaluation.scored.filter((item) => item.band === "silent");
  const detail = visible.find((card) => `${card.band}:${card.typeId}` === state.detailKey) || visible[0] || null;
  const check = state.checks.get(fixture.id);
  const forms = (fixture.forms_in_packet || []).join(" · ");

  const cardHtml = visible.length
    ? visible.map((card) => {
      const key = `${card.band}:${card.typeId}`;
      const active = detail && key === `${detail.band}:${detail.typeId}` ? " is-active" : "";
      return `<button type="button" class="card band-${card.band === "High" ? "high" : "medium"}${active}" data-card="${esc(key)}">
        <span class="card-kicker">Type ${esc(card.typeId)} · ${esc(card.band)}</span>
        <span class="card-name">${esc(card.name)}</span>
        <span class="card-pass">${esc(PASS_HINT[card.passTag] || card.passTag)}</span>
        <span class="card-copy">${esc(card.copy || card.error || "")}</span>
      </button>`;
    }).join("")
    : `<p class="empty-lane">${state.tab === "high"
      ? "No must-review flags on this packet."
      : "Nothing on the optional tray for this packet."} Silent checks stay off the card list.</p>`;

  const detailHtml = detail ? `
    <article class="detail">
      <p class="card-kicker">Type ${esc(detail.typeId)}</p>
      <h3>${esc(detail.name)}</h3>
      <dl class="meta">
        <div><dt>Lane</dt><dd>${esc(detail.lane === "must-review" ? "Must-review" : "Optional tray")}</dd></div>
        <div><dt>Cite</dt><dd>${esc(detail.cite || "—")}</dd></div>
        <div><dt>Pass tag</dt><dd>${esc(PASS_HINT[detail.passTag] || detail.passTag || "—")}</dd></div>
      </dl>
      <h4>Present copy</h4>
      <blockquote>${esc(detail.copy || detail.error || "—")}</blockquote>
      <h4>Fields that tripped the floor</h4>
      ${renderEvidence(detail.evidence)}
      <h4>Trigger</h4>
      <p class="trigger">${esc(detail.trigger)}</p>
    </article>
  ` : `<article class="detail detail-empty"><p>Select a card to read the cite, fields, and present copy.</p></article>`;

  const silentRows = silent.map((item) => {
    const meta = state.typesById[item.typeId];
    return `<li><span>Type ${esc(item.typeId)} · ${esc(meta?.name || "")}</span><span>${esc(item.reason)}</span></li>`;
  }).join("");

  const checkLine = !fixture.expected
    ? "No expectation block on this packet."
    : check?.ok
      ? "Bands match this fixture’s expectation."
      : `Expectation mismatch. High ${JSON.stringify(check?.high || [])} vs ${JSON.stringify(check?.expectedHigh || [])}. Medium ${JSON.stringify(check?.medium || [])} vs ${JSON.stringify(check?.expectedMedium || [])}.`;

  stage.innerHTML = `
    <header class="packet">
      <p class="eyebrow">${esc(fixture.filer_ref || "FILER")} · tax year ${esc(fixture.tax_year || "—")} · ${esc(fixture.group || "packet")}</p>
      <h2>${esc(fixture.label || fixture.id)}</h2>
      <p class="forms">${esc(forms || "No form list")}</p>
      <p class="scenario">${esc(fixture.scenario || "")}</p>
      ${renderIngest(fixture)}
      <p class="packet-check ${check && !check.ok ? "is-bad" : ""}">${esc(checkLine)}</p>
    </header>
    <div class="tabs" role="tablist">
      <button type="button" class="tab ${state.tab === "high" ? "is-active" : ""}" data-tab="high" role="tab" aria-selected="${state.tab === "high"}">
        Must-review <span>${highCount}</span>
      </button>
      <button type="button" class="tab ${state.tab === "medium" ? "is-active" : ""}" data-tab="medium" role="tab" aria-selected="${state.tab === "medium"}">
        Optional tray <span>${mediumCount}</span>
      </button>
    </div>
    <div class="workspace">
      <div class="cards">${cardHtml}</div>
      ${detailHtml}
    </div>
    <details class="silent">
      <summary>Silent checks (${silent.length}) — no present copy</summary>
      <ul>${silentRows}</ul>
    </details>
    <details class="silent">
      <summary>Full extract (fields only)</summary>
      <pre>${esc(JSON.stringify(evaluation.fields, null, 2))}</pre>
    </details>
  `;
}

function renderStatus() {
  const checked = [];
  for (const [id, packet] of state.packets) {
    if (!packet.fixture?.expected) continue;
    const check = state.checks.get(id);
    if (check) checked.push(check);
  }
  if (!checked.length) {
    checkSlot.textContent = "Loading fixtures…";
    return;
  }
  const good = checked.filter((item) => item.ok).length;
  checkSlot.textContent = `${good} of ${checked.length} fixtures match their expected bands`;
  checkSlot.classList.toggle("is-bad", good !== checked.length);
}

function selectFixture(id, preferTab = true) {
  const packet = state.packets.get(id);
  if (!packet) return;
  state.selectedId = id;
  if (preferTab) {
    const cards = packet.evaluation.cards;
    state.tab = cards.some((card) => card.band === "High")
      ? "high"
      : cards.some((card) => card.band === "Medium")
        ? "medium"
        : "high";
  }
  const visible = packet.evaluation.cards.filter((card) => (state.tab === "high" ? card.band === "High" : card.band === "Medium"));
  state.detailKey = visible[0] ? `${visible[0].band}:${visible[0].typeId}` : null;
  renderRail();
  renderStage();
}

function ingestFixture(fixture, group = "dropped") {
  if (!fixture.id) fixture.id = `dropped-${Date.now()}`;
  fixture.group = fixture.group || group;
  fixture.label = fixture.label || fixture.id;
  const evaluation = evaluateFixture(fixture, state.typesById);
  state.packets.set(fixture.id, { fixture, evaluation });
  state.checks.set(fixture.id, matchExpectation(fixture, evaluation.cards));
  if (!state.manifest.some((item) => item.id === fixture.id)) {
    state.manifest.push({
      id: fixture.id,
      label: fixture.label,
      group: fixture.group === "high" || fixture.group === "silent" || fixture.group === "medium" ? fixture.group : "dropped",
      file: null,
    });
  }
  renderStatus();
  selectFixture(fixture.id);
}

function showDropMessage(message, isError = false) {
  const node = document.querySelector("#drop-note");
  if (!node) return;
  node.hidden = !message;
  node.textContent = message || "";
  node.classList.toggle("is-error", Boolean(isError));
}

async function takeFile(file) {
  const lower = (file.name || "").toLowerCase();
  const json = lower.endsWith(".json") || file.type === "application/json";
  if (!json) showDropMessage("Reading packet… OCR stays in this browser.");
  const fixture = json
    ? parseFixtureText(await file.text())
    : await ingestDocument({
      name: file.name,
      type: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
    });
  ingestFixture(fixture);
}

async function boot() {
  try {
    const [manifest, registry] = await Promise.all([
      loadJson("./fixtures/manifest.json"),
      loadJson("./data/types.json"),
    ]);
    state.typesById = typesMap(registry.types || []);
    state.manifest = manifest.fixtures.slice();
    const loaded = await Promise.all(state.manifest.map(async (item) => {
      const fixture = await loadJson(`./fixtures/${item.file}`);
      return { item, fixture };
    }));
    for (const { item, fixture } of loaded) {
      fixture.group = fixture.group || item.group;
      const evaluation = evaluateFixture(fixture, state.typesById);
      state.packets.set(item.id, { fixture, evaluation });
      state.checks.set(item.id, matchExpectation(fixture, evaluation.cards));
    }
    renderStatus();
    const first = state.manifest.find((item) => item.group === "high") || state.manifest[0];
    if (first) selectFixture(first.id);
  } catch (error) {
    rail.innerHTML = "";
    stage.innerHTML = `<div class="boot-error">
      <h2>Fixtures did not load</h2>
      <p>${esc(error.message)}</p>
      <p>Open <a href="https://romanc823.github.io/Research/">https://romanc823.github.io/Research/</a>. A <code>file://</code> tab blocks the fixture fetch. For local development, from the repo root run <code>npm start</code> and open the URL that terminal prints.</p>
    </div>`;
    checkSlot.textContent = "Not loaded";
  }
}

rail.addEventListener("click", async (event) => {
  const sample = event.target.closest("[data-sample]");
  if (sample) {
    showDropMessage("Reading packet… OCR stays in this browser.");
    try {
      const response = await fetch(sample.dataset.sample);
      if (!response.ok) throw new Error(`Could not load ${sample.dataset.sample}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      const name = sample.dataset.sample.split("/").pop();
      ingestFixture(await ingestDocument({ name, type: "", bytes }));
    } catch (error) {
      showDropMessage(error.message, true);
    }
    return;
  }
  const button = event.target.closest("[data-fixture]");
  if (!button) return;
  selectFixture(button.dataset.fixture);
});

rail.addEventListener("change", (event) => {
  if (event.target.id === "fixture-select") selectFixture(event.target.value);
});

rail.addEventListener("dragover", (event) => {
  if (!event.target.closest("#drop-zone")) return;
  event.preventDefault();
  document.querySelector("#drop-zone")?.classList.add("is-hot");
});

rail.addEventListener("dragleave", (event) => {
  if (!event.target.closest("#drop-zone")) return;
  document.querySelector("#drop-zone")?.classList.remove("is-hot");
});

rail.addEventListener("drop", async (event) => {
  const zone = event.target.closest("#drop-zone");
  if (!zone) return;
  event.preventDefault();
  zone.classList.remove("is-hot");
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    await takeFile(file);
  } catch (error) {
    showDropMessage(error.message, true);
  }
});

rail.addEventListener("change", async (event) => {
  if (event.target.id !== "file-input") return;
  const file = event.target.files?.[0];
  if (!file) return;
  try {
    await takeFile(file);
  } catch (error) {
    showDropMessage(error.message, true);
  }
});

stage.addEventListener("click", (event) => {
  const tab = event.target.closest("[data-tab]");
  if (tab) {
    state.tab = tab.dataset.tab;
    const packet = state.packets.get(state.selectedId);
    const visible = packet.evaluation.cards.filter((card) => (state.tab === "high" ? card.band === "High" : card.band === "Medium"));
    state.detailKey = visible[0] ? `${visible[0].band}:${visible[0].typeId}` : null;
    renderStage();
    return;
  }
  const card = event.target.closest("[data-card]");
  if (!card) return;
  state.detailKey = card.dataset.card;
  renderStage();
});

boot();

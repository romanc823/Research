/**
 * View of cards evaluate.js already built.
 * Does not score, does not read floors, and does not write present copy.
 * A missing locked line is omitted. A missing dollar is an em dash, not zero.
 */

import { findTalkBan } from "./present.js";

/**
 * Exact sentences already in docs/TAXONOMY.md.
 * A slot this map does not lock stays null.
 */
export const LOCKED_REPORT_LINES = {
  13: {
    humanGate: "ROI is a human gate, not a score.",
  },
};

const OMIT = "—";

const money = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });

function proseBan(text, label) {
  if (!text) return;
  const ban = findTalkBan(text);
  if (ban) throw new Error(`Talk ban "${ban}" in report ${label}`);
}

export function formatReportDollars(card) {
  if (!card || card.band !== "High") return OMIT;
  const point = card.savings?.point;
  if (typeof point !== "number" || !Number.isFinite(point) || !(point > 0)) return OMIT;
  const formatted = money.format(point);
  if (formatted === "$0.00" || formatted === "$0") return OMIT;
  return formatted;
}

function lockedSlots(typeId) {
  const locked = LOCKED_REPORT_LINES[typeId] || {};
  const slots = {
    assumptions: locked.assumptions || null,
    timing: locked.timing || null,
    risks: locked.risks || null,
    humanGate: locked.humanGate || null,
  };
  for (const [key, value] of Object.entries(slots)) {
    proseBan(value, `${key} ${typeId}`);
  }
  return slots;
}

/**
 * @param {object} fixture
 * @param {{ cards?: object[] }} evaluation
 * @param {{ privateMode?: boolean }} [options]
 */
export function buildReport(fixture, evaluation, options = {}) {
  const privateMode = options.privateMode === true;
  if (!privateMode && fixture?.anon !== true) {
    throw new Error("Public report requires an anonymized packet.");
  }
  const rows = [];
  for (const card of evaluation?.cards || []) {
    if (card.band !== "High" && card.band !== "Medium") {
      throw new Error(`Report refused band ${card.band} on type ${card.typeId}`);
    }
    if (!card.copy) throw new Error(`Report has no present copy for type ${card.typeId}`);
    proseBan(card.copy, `present ${card.typeId}`);
    proseBan(card.cite, `cite ${card.typeId}`);
    proseBan(card.name, `name ${card.typeId}`);
    const dollars = formatReportDollars(card);
    const showEstimate = card.band === "High"
      && card.savings
      && typeof card.savings.point === "number"
      && card.savings.point > 0
      && dollars !== OMIT;
    let estimate = null;
    if (showEstimate) {
      proseBan(card.savings.label, `estimate label ${card.typeId}`);
      proseBan(card.savings.basis, `estimate basis ${card.typeId}`);
      estimate = {
        point: card.savings.point,
        label: card.savings.label,
        basis: card.savings.basis,
        confidence: card.savings.confidence,
      };
    }
    rows.push({
      typeId: String(card.typeId),
      name: card.name || "",
      band: card.band,
      pass: card.passTag || null,
      cite: card.cite || "",
      dollars,
      description: card.copy,
      ...lockedSlots(card.typeId),
      estimate,
    });
  }
  return {
    kind: "research-report",
    anon: fixture?.anon === true,
    ephemeral: privateMode || fixture?.ephemeral === true || fixture?.anon !== true,
    filerRef: fixture?.filer_ref || null,
    taxYear: fixture?.tax_year ?? null,
    rows,
    flags: {
      lawChange: null,
      professional: null,
    },
  };
}

export function reportProse(report) {
  const out = [];
  for (const row of report?.rows || []) {
    out.push(row.name, row.cite, row.description, row.assumptions, row.timing, row.risks, row.humanGate);
    if (row.estimate) out.push(row.estimate.label, row.estimate.basis);
  }
  return out.filter((line) => typeof line === "string" && line.length > 0);
}

function cell(value) {
  return String(value ?? "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

export function reportMarkdown(report) {
  const who = report.filerRef || (report.anon ? "FILER" : "Internal desk");
  const lines = [
    "# Tax planning research report",
    "",
    `${who} · tax year ${report.taxYear ?? OMIT}`,
    "",
    "View of score and present. No e-file. Not tax advice.",
    "",
  ];
  if (report.ephemeral) {
    lines.push("This export stays in the browser tab. It is not saved with the desk.", "");
  }
  lines.push(
    "Silent checks stay off this report.",
    "",
    "## Summary",
    "",
    "| Type | Band | Pass | Cite | $ |",
    "| --- | --- | --- | --- | --- |",
  );
  for (const row of report.rows) {
    lines.push(`| ${cell(`${row.typeId} · ${row.name}`)} | ${cell(row.band)} | ${cell(row.pass || OMIT)} | ${cell(row.cite || OMIT)} | ${cell(row.dollars)} |`);
  }
  if (!report.rows.length) {
    lines.push("", "No High or Medium cards.");
  }
  lines.push("", "## Detail", "");
  if (!report.rows.length) {
    lines.push("No High or Medium cards.", "");
  }
  for (const row of report.rows) {
    lines.push(`### ${row.typeId} · ${row.name}`, "");
    lines.push(`- Band: ${row.band}`);
    lines.push(`- Pass: ${row.pass || OMIT}`);
    lines.push(`- Cite: ${row.cite || OMIT}`);
    lines.push(`- $: ${row.dollars}`);
    lines.push(`- Present: ${row.description}`);
    if (row.assumptions) lines.push(`- Assumptions: ${row.assumptions}`);
    if (row.timing) lines.push(`- Timing: ${row.timing}`);
    if (row.risks) lines.push(`- Risks: ${row.risks}`);
    if (row.humanGate) lines.push(`- Human gate: ${row.humanGate}`);
    if (row.estimate) {
      lines.push(`- ${row.estimate.label}`);
      lines.push(`- ${row.estimate.basis}`);
    }
    lines.push("");
  }
  lines.push(
    "## Flags",
    "",
    "| Flag | Note |",
    "| --- | --- |",
    `| Law change | ${report.flags?.lawChange || OMIT} |`,
    `| Professional | ${report.flags?.professional || OMIT} |`,
    "",
  );
  return lines.join("\n");
}

export function reportJson(report) {
  return JSON.stringify(report, null, 2);
}

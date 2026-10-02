/**
 * Floor check for the Phase A stub.
 * Confirms fixture expectations, talk bans, fixed Augusta / hire-kids lines,
 * and the boundary readings in js/score.js.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractFields } from "../js/extract.js";
import { scoreAll, bandOf, TYPE_ORDER, STUB_FLOORS } from "../js/score.js";
import { FIXED_COPY } from "../js/present.js";
import { evaluateFixture, matchExpectation, copyShapeOk } from "../js/evaluate.js";
import { parseFixtureText } from "../js/intake.js";
import { ingestDocument, parseDocumentText, CONFIDENCE_FLOOR, OCR_WATCH_FLOOR } from "../js/ingest.js";
import { buildFlateGrayPdf, buildImagePdf, buildTextPdf, buildUnsupportedImagePdf, extractPdfText } from "../js/pdf-text.js";
import { extractPdfPageImages } from "../js/pdf-images.js";
import { decodeGrayPng } from "../js/png-gray.js";
import { AUGUSTA_PDF_LINES, FAX_PDF_LINES, PHOTO_SEP_LINES, REP_JPEG_LINES, SCAN_PDF_LINES, SILENT_PNG_LINES } from "../js/ingest-samples.js";
import { renderLabelRaster, readLabelRaster } from "../js/raster-label.js";
import { encodeGrayJpeg, decodeGrayJpeg } from "../js/jpeg-gray.js";
import { encodeGrayPng } from "../js/png-gray.js";
import { LOW_OCR_REASON, WATCH_OCR_REASON } from "../js/ingest-fields.js";
import { shutdownOcr, TESSERACT_VERSION } from "../js/ocr.js";
import { PDFJS_VERSION } from "../js/pdf-raster.js";
import { installPromiseWithResolvers } from "../js/promise-with-resolvers.js";
import { renderPacketJpeg } from "./render-photo.mjs";
import { buildFaxPdf } from "./ccitt-sample.mjs";
import { deflateSync } from "node:zlib";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const failures = [];

function fail(message) {
  failures.push(message);
}

function bands(fields, taxYear = 2025) {
  const fixture = { anon: true, tax_year: taxYear, filer_ref: "FILER-CASE", fields };
  return scoreAll(extractFields(fixture));
}

function expectBand(name, fields, expected, taxYear = 2025) {
  const scored = bands(fields, taxYear);
  for (const [typeId, band] of Object.entries(expected)) {
    const actual = bandOf(scored, typeId);
    if (actual !== band) {
      fail(`${name}: type ${typeId} is ${actual}, expected ${band}`);
    }
  }
}

const registry = JSON.parse(fs.readFileSync(path.join(root, "data/types.json"), "utf8"));
const typesById = Object.fromEntries(registry.types.map((type) => [type.id, type]));
const registryIds = registry.types.map((type) => type.id);
if (registryIds.join(",") !== TYPE_ORDER.join(",")) {
  fail(`types.json ids differ from TYPE_ORDER\n registry ${registryIds}\n order ${TYPE_ORDER}`);
}

const manifest = JSON.parse(fs.readFileSync(path.join(root, "fixtures/manifest.json"), "utf8"));
const ssn = /\b\d{3}-\d{2}-\d{4}\b/;
const ein = /\b\d{2}-\d{7}\b/;

for (const item of manifest.fixtures) {
  const raw = fs.readFileSync(path.join(root, "fixtures", item.file), "utf8");
  if (ssn.test(raw) || ein.test(raw)) fail(`${item.id} contains an SSN or EIN pattern`);
  if (/\bTODO\b/.test(raw)) fail(`${item.id} still has a TODO`);
  const fixture = JSON.parse(raw);
  if (fixture.anon !== true) fail(`${item.id} is not anon`);
  if (fixture.id !== item.id) fail(`${item.id} id mismatch`);
  const evaluation = evaluateFixture(fixture, typesById);
  const match = matchExpectation(fixture, evaluation.cards);
  if (!match.ok) {
    fail(`${item.id} bands High ${match.high} vs ${match.expectedHigh}; Medium ${match.medium} vs ${match.expectedMedium}; bans ${JSON.stringify(match.bans)}`);
  }
  for (const card of evaluation.cards) {
    if (!copyShapeOk(card.copy, card.typeId)) fail(`${item.id} type ${card.typeId} present copy shape`);
    if (card.typeId === "14" && card.copy !== FIXED_COPY[14]) fail(`${item.id} Augusta copy drifted`);
    if (card.typeId === "15" && card.copy !== FIXED_COPY[15]) fail(`${item.id} hire-kids copy drifted`);
  }
  const rep = evaluation.scored.find((row) => row.typeId === "18");
  if (item.id.startsWith("silent") && rep.band !== "silent") {
    fail(`${item.id} REP band is ${rep.band}`);
  }
}

if (manifest.fixtures.length < 12 || manifest.fixtures.length > 20) {
  fail(`fixture count ${manifest.fixtures.length} is outside 12–20`);
}

const empty = evaluateFixture({ anon: true, tax_year: 2025, fields: {} }, typesById);
if (empty.cards.length !== 0) fail(`empty packet presented ${empty.cards.map((card) => card.typeId)}`);
if (empty.scored.length !== TYPE_ORDER.length) fail("scoreAll did not return every type");

const dirty = extractFields({ fields: { advice: "you should claim this", schedule_c: true } });
if ("advice" in dirty) fail("extract kept a narrative field");
if (dirty.schedule_c !== true) fail("extract dropped schedule_c");

try {
  parseFixtureText(JSON.stringify({ anon: false, fields: {} }));
  fail("intake accepted anon: false");
} catch {
  /* expected */
}
try {
  parseFixtureText('{"anon":true,"fields":{},"ssn":"123-45-6789"}');
  fail("intake accepted an SSN");
} catch {
  /* expected */
}

const rejected = extractFields({
  fields: { schedule_c: true, home_ownership_doc: true, home_ownership_source: "8829" },
});
if (rejected.home_ownership_doc !== false || rejected.ownership_rejected_as_8829 !== false && rejected.ownership_rejected_as_8829 !== true) {
  fail("8829 ownership rejection flag missing");
}
if (rejected.home_ownership_doc !== false) fail("8829 was treated as ownership");

expectBand("sstb does not block a math gap", {
  qbi_fields: { qbi_income: 80000, tentative_deduction: 16000, deduction_taken: 0, sstb: true },
}, { 1: "High" });

expectBand("sstb does not raise without a gap", {
  qbi_fields: { qbi_income: 80000, tentative_deduction: 16000, deduction_taken: 16000, sstb: true },
}, { 1: "silent" });

expectBand("qbi gap below stub minimum", {
  qbi_fields: { qbi_income: 80000, tentative_deduction: 16000, deduction_taken: 15501, sstb: false },
}, { 1: "silent" });

expectBand("officer at the near-zero line", {
  s_corp: true, distributions: STUB_FLOORS.minDistributions, officer_w2: STUB_FLOORS.nearZeroOfficerW2,
}, { 2: "High" });

expectBand("officer one dollar over near-zero", {
  s_corp: true, distributions: 80000, officer_w2: STUB_FLOORS.nearZeroOfficerW2 + 1,
}, { 2: "silent" });

expectBand("se at the floor is not above it", {
  se_income: STUB_FLOORS.seIncome, retirement_deduction: 0,
}, { 3: "silent" });

expectBand("se above the floor and deduction zero", {
  se_income: STUB_FLOORS.seIncome + 1, retirement_deduction: 0, earned_income: STUB_FLOORS.seIncome + 1,
}, { 3: "High", "3b": "silent" });

expectBand("little retirement deduction is not zero", {
  se_income: 90000, retirement_deduction: 1,
}, { 3: "silent" });

expectBand("cash-balance at the hard floor stays silent", {
  earned_income: STUB_FLOORS.cbEarnedIncome, retirement_deduction: 0, se_income: 0,
}, { "3b": "silent", 3: "silent" });

expectBand("cash-balance above the hard floor", {
  earned_income: STUB_FLOORS.cbEarnedIncome + 1, retirement_deduction: 0, se_income: 0,
}, { "3b": "Medium", 3: "silent" });

expectBand("both retirement floors", {
  se_income: 300000, earned_income: 300000, retirement_deduction: 0,
}, { 3: "High", "3b": "Medium" });

expectBand("wash only", { wash_8949: true }, { 6: "High" });
expectBand("loss room only", { sch_d_loss_room: true }, { 6: "High" });
expectBand("missing lots are not a harvest", { lots_missing: true, wash_8949: false, sch_d_loss_room: false }, { 6: "silent" });

expectBand("8582 absorb", { form_8582_suspended: true, cy_passive_income: true }, { 7: "High" });
expectBand("grouping stays medium with a prior election", {
  form_8582_suspended: true,
  multiple_passive_activities: true,
  prior_grouping_election: true,
  cy_passive_income: false,
}, { "7b": "Medium", 7: "silent" });

expectBand("complete 8829", {
  schedule_c: true, form_8829: true, ho_8829_complete_no_gap: true,
}, { "8a": "silent" });

expectBand("home office context", { s_corp: true, ho_context: true }, { "8a": "Medium" });
expectBand("ownership alone", {
  home_ownership_doc: true, home_ownership_source: "deed",
}, { "8a": "silent", 14: "silent" });

expectBand("w2 unreimbursed alone", { w2_unreimbursed_only: true, vehicle_signal: true }, { "8b": "silent" });
expectBand("business vehicle", { schedule_c: true, vehicle_signal: true }, { "8b": "Medium" });

expectBand("179 absorbs", {
  section_179_bonus: { adds_cost: STUB_FLOORS.materialAdds, amount_taken: 0 },
  ti_absorbs: true,
}, { 9: "High" });

expectBand("179 adds just under material", {
  section_179_bonus: { adds_cost: STUB_FLOORS.materialAdds - 1, amount_taken: 0 },
  ti_absorbs: true,
}, { 9: "silent" });

expectBand("179 ratio at 10 percent is not little", {
  section_179_bonus: { adds_cost: 100000, amount_taken: 10000 },
  ti_absorbs: true,
}, { 9: "silent" });

expectBand("thin TI", {
  section_179_bonus: { adds_cost: 100000, amount_taken: 0 },
  ti_absorbs: false,
}, { 9: "silent" });

expectBand("edu without 1098-T", { edu_credit_gap: true, form_1098t: false }, { 12: "silent" });
expectBand("edu with 1098-T", { edu_credit_gap: true, form_1098t: true }, { 12: "High" });
expectBand("ctc without 1098-T", { ctc_odc_gap: true, form_1098t: false }, { 12: "High" });

expectBand("cost seg any basis inside the window", {
  building_basis: 1, pis_or_remodel_year: 2025, prior_cost_seg: false,
}, { 13: "High" }, 2025);

expectBand("cost seg one year outside the last three tax years", {
  building_basis: 500000, pis_or_remodel_year: 2022, prior_cost_seg: false,
}, { 13: "silent" }, 2025);

expectBand("cost seg prior study", {
  building_basis: 500000, pis_or_remodel_year: 2024, prior_cost_seg: true,
}, { 13: "silent" }, 2025);

expectBand("8829 is not Augusta ownership", {
  schedule_c: true, home_ownership_doc: true, home_ownership_source: "8829",
}, { 14: "silent" });

expectBand("k1 alone with a deed", {
  k1_only: true, home_ownership_doc: true, home_ownership_source: "deed",
}, { 14: "silent" });

expectBand("augusta 1098", {
  schedule_c: true, home_ownership_doc: true, home_ownership_source: "1098",
}, { 14: "High" });

expectBand("labeled daughter without the child flag", {
  s_corp: true, child_dependent: false, dependent_relationship: "daughter",
}, { 15: "High" });

expectBand("parent dependent is not hire-kids", {
  schedule_c: true, dependent_relationship: "parent", child_dependent: false,
}, { 15: "silent" });

expectBand("rep without hours is not medium", { hours_log_rep: null, sch_e_re_loss: true }, { 18: "silent" });
expectBand("rep hours just under 750", { hours_log_rep: STUB_FLOORS.repHours - 1, sch_e_re_loss: true }, { 18: "silent" });
expectBand("rep hours at 750", { hours_log_rep: STUB_FLOORS.repHours, sch_e_re_loss: true }, { 18: "High" });
expectBand("rep hours without a loss", { hours_log_rep: 900, sch_e_re_loss: false }, { 18: "silent" });

expectBand("refund just under large", { large_refund: STUB_FLOORS.largeRefund - 1 }, { 16: "silent" });
expectBand("refund at large", { large_refund: STUB_FLOORS.largeRefund }, { 16: "Medium" });
expectBand("estimates well above tax", { estimates_paid: 20000, total_tax: 10000, large_refund: 0 }, { 16: "Medium" });
expectBand("estimates only a little above tax", { estimates_paid: 14000, total_tax: 10000 }, { 16: "silent" });
expectBand("underpayment does not become cash drag", { form_2210_underpay: true, large_refund: 0, estimates_paid: 1000, total_tax: 9000 }, { 4: "High", 16: "silent" });

expectBand("multi-state without the returns", { multi_state_signal: true, state_returns_mismatch: false }, { 17: "Medium" });
expectBand("state returns mismatch", { state_returns_mismatch: true }, { 17: "High" });

expectBand("prior charitable just under the marker", {
  standard_deduction: true, prior_year_sch_a_charitable: STUB_FLOORS.priorYearCharitable - 1,
}, { 5: "silent" });
expectBand("prior charitable at the marker", {
  standard_deduction: true, prior_year_sch_a_charitable: STUB_FLOORS.priorYearCharitable,
}, { 5: "Medium" });
expectBand("form 8283", { form_8283: true }, { 5: "Medium" });
expectBand("schedule A charitable", { charitable_sch_a: true }, { 5: "Medium" });

expectBand("qcd age from a number", { age: 70.5, ira_or_1099r: true, charitable_pattern: true }, { "5b": "Medium" });
expectBand("qcd under age", { age: 70, ira_or_1099r: true, charitable_pattern: true }, { "5b": "silent" });

expectBand("nua one side", { nua_employer_plan_1099r: true, nua_company_stock: false }, { 23: "silent" });
expectBand("nua both", { nua_employer_plan_1099r: true, nua_company_stock: true }, { 23: "Medium" });
expectBand("entity vibe", { entity_vibe_only: true }, { 25: "silent" });
expectBand("qsbs explicit", { qsbs_c_corp_disposal: true, qsbs_five_year_or_explicit: true }, { 25: "Medium" });
expectBand("tech wages only", { tech_sch_c_wages_only: true, schedule_c: true }, { 22: "silent" });
expectBand("6765", { form_6765_or_rd_study: true }, { 22: "Medium" });

expectBand("2441 incomplete", {
  child_dependent: true, care_docs_or_fsa: true, form_2441_gap: true,
}, { 20: "High" });
expectBand("2441 complete enough for the tray", {
  child_dependent: true, care_docs_or_fsa: true, form_2441_gap: false,
}, { 20: "Medium" });

expectBand("form 8824", { form_8824: true }, { 26: "Medium" });
expectBand("large real-estate gain without the forms", { large_re_gain_no_1031: true }, { 26: "Medium" });
expectBand("roth needs both signals", { trad_ira_or_401k: true, low_ti_year: false }, { 24: "silent" });
expectBand("roth both signals", { trad_ira_or_401k: true, low_ti_year: true }, { 24: "Medium" });
expectBand("energy docs", { residential_energy_docs: true }, { 21: "Medium" });
expectBand("sehi on schedule c", { schedule_c: true, sehi_gap: true }, { 19: "Medium" });
expectBand("sehi without the business return", { sehi_gap: true }, { 19: "silent" });

function sameBytes(left, right) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (left[i] !== right[i]) return false;
  }
  return true;
}

function packetBands(packet) {
  const evaluation = evaluateFixture(packet, typesById);
  return {
    evaluation,
    high: evaluation.cards.filter((card) => card.band === "High").map((card) => card.typeId),
    medium: evaluation.cards.filter((card) => card.band === "Medium").map((card) => card.typeId),
  };
}

function idsEqual(actual, expected) {
  return actual.length === expected.length && actual.every((id, index) => id === expected[index]);
}

async function checkIngest() {
  const blank = parseDocumentText([
    "ANON: TRUE",
    "FILER: FILER-301",
    "TAX YEAR: 2025",
    "SCHEDULE C: YES",
    "SE INCOME: 88000",
    "RETIREMENT DEDUCTION:",
    "HOURS LOG REP:",
    "DEPENDENT AGES:",
    "BUILDING BASIS:",
  ].join("\n"), { sourceKind: "text" });
  if ("retirement_deduction" in blank.fields) fail("blank retirement was stored");
  if ("hours_log_rep" in blank.fields) fail("blank hours were stored");
  if ("dependent_ages" in blank.fields) fail("blank ages were stored");
  if ("building_basis" in blank.fields) fail("blank basis was stored");
  const blankFields = extractFields(blank);
  if (blankFields.retirement_deduction !== null) fail("blank retirement became a number");
  if (blankFields.hours_log_rep !== null) fail("blank hours became a number");
  if (bandOf(scoreAll(blankFields), "3") !== "silent") fail("blank retirement scored as zero");
  if (bandOf(scoreAll(blankFields), "18") !== "silent") fail("blank hours scored REP");

  const explicitZero = parseDocumentText([
    "ANON: TRUE",
    "FILER: FILER-302",
    "TAX YEAR: 2025",
    "SE INCOME: 88000",
    "RETIREMENT DEDUCTION: 0",
    "OFFICER W2: 0",
    "DISTRIBUTIONS: 80000",
    "S CORP: YES",
  ].join("\n"), { sourceKind: "text" });
  if (explicitZero.fields.retirement_deduction !== 0) fail("explicit retirement zero was dropped");
  const zeroFields = extractFields(explicitZero);
  if (bandOf(scoreAll(zeroFields), "3") !== "High") fail("explicit retirement zero did not score");
  if (bandOf(scoreAll(zeroFields), "2") !== "High") fail("explicit zero officer wage did not score");

  const partialWage = parseDocumentText([
    "ANON: TRUE",
    "FILER: FILER-303",
    "S CORP: YES",
    "DISTRIBUTIONS: 80000",
  ].join("\n"), { sourceKind: "text" });
  if ("distributions" in partialWage.fields || "officer_w2" in partialWage.fields) {
    fail("distributions without officer W-2 were kept");
  }
  if (bandOf(scoreAll(extractFields(partialWage)), "2") !== "silent") fail("missing officer wage scored as zero");

  const partialQbi = parseDocumentText([
    "ANON: TRUE",
    "FILER: FILER-304",
    "QBI INCOME: 80000",
    "TENTATIVE DEDUCTION: 16000",
  ].join("\n"), { sourceKind: "text" });
  if ("qbi_fields" in partialQbi.fields) fail("partial QBI was kept");
  if (bandOf(scoreAll(extractFields(partialQbi)), "1") !== "silent") fail("partial QBI zero-filled a deduction");

  const partial179 = parseDocumentText([
    "ANON: TRUE",
    "FILER: FILER-305",
    "SECTION 179 ADDS: 100000",
    "TI ABSORBS: YES",
  ].join("\n"), { sourceKind: "text" });
  if ("section_179_bonus" in partial179.fields) fail("one-sided section 179 was kept");
  if (bandOf(scoreAll(extractFields(partial179)), "9") !== "silent") fail("missing 179 taken was treated as zero");

  const atomic = parseDocumentText([
    "ANON: TRUE",
    "FILER: FILER-306",
    "SCHEDULE C: YES",
    "NUA: YES",
    "QSBS: YES",
    "NUA EMPLOYER PLAN 1099R: YES",
    "QSBS C CORP DISPOSAL: YES",
    "HO CONTEXT: MAYBE",
    "HOME OWNERSHIP SOURCE: 8829",
    "HOME OWNERSHIP DOC: YES",
    "EDU CREDIT GAP: YES",
    "SCH E RE LOSS: YES",
    "BUILDING BASIS: UNKNOWN",
    "PIS OR REMODEL YEAR: 2024",
    "DEPENDENT RELATIONSHIP: DAUGHTER",
    "COST SEG: MAYBE",
  ].join("\n"), { sourceKind: "text" });
  if (atomic.fields.nua_company_stock === true || atomic.fields.qsbs_five_year_or_explicit === true) {
    fail("a single NUA or QSBS line filled the other half");
  }
  if ("ho_context" in atomic.fields) fail("hedged home-office context was stored");
  if ("building_basis" in atomic.fields) fail("unknown basis was stored");
  if (atomic.fields.pis_or_remodel_year !== 2024) fail("explicit remodel year was dropped");
  const atomicFields = extractFields(atomic);
  if (atomicFields.home_ownership_doc !== false || atomicFields.ownership_rejected_as_8829 !== true) {
    fail("8829 was treated as ownership");
  }
  const atomicScored = scoreAll(atomicFields);
  if (bandOf(atomicScored, "14") !== "silent") fail("8829 ownership raised Augusta");
  if (bandOf(atomicScored, "12") !== "silent") fail("education without 1098-T raised a card");
  if (bandOf(atomicScored, "18") !== "silent") fail("REP without hours raised a card");
  if (bandOf(atomicScored, "13") !== "silent") fail("unknown basis raised cost segregation");
  if (bandOf(atomicScored, "23") !== "silent") fail("one-sided NUA raised a card");
  if (bandOf(atomicScored, "25") !== "silent") fail("one-sided QSBS raised a card");
  if (bandOf(atomicScored, "8a") !== "silent") fail("hedged home-office context raised a card");
  if (bandOf(atomicScored, "15") !== "High") fail("explicit daughter did not score hire-kids");
  if (atomic.ingest.accepted.some((row) => row.confidence < CONFIDENCE_FLOOR)) {
    fail("a field below the confidence floor was kept");
  }

  try {
    parseDocumentText("ANON: TRUE\nFILER: FILER-307\nMEMO: 123-45-6789\n", { sourceKind: "text" });
    fail("ingest accepted an SSN");
  } catch {
    /* expected */
  }
  try {
    parseDocumentText("ANON: FALSE\nFILER: FILER-308\nSCHEDULE C: YES\n", { sourceKind: "text" });
    fail("ingest accepted anon false");
  } catch {
    /* expected */
  }

  const compressed = buildTextPdf(AUGUSTA_PDF_LINES, { deflate: (bytes) => deflateSync(bytes) });
  const inflated = await extractPdfText(compressed);
  if (inflated !== AUGUSTA_PDF_LINES.join("\n")) fail("FlateDecode PDF text did not round-trip");

  const pdfPath = path.join(root, "samples/ingest/synthetic-augusta.pdf");
  const jpegPath = path.join(root, "samples/ingest/synthetic-rep-hours.jpg");
  const pngPath = path.join(root, "samples/ingest/synthetic-silent-misses.png");
  const pdfBytes = new Uint8Array(fs.readFileSync(pdfPath));
  const jpegBytes = new Uint8Array(fs.readFileSync(jpegPath));
  const pngBytes = new Uint8Array(fs.readFileSync(pngPath));
  if (!sameBytes(pdfBytes, buildTextPdf(AUGUSTA_PDF_LINES))) fail("synthetic Augusta PDF drifted from its lines");
  const jpegRaster = renderLabelRaster(REP_JPEG_LINES);
  if (!sameBytes(jpegBytes, encodeGrayJpeg(jpegRaster.gray, jpegRaster.width, jpegRaster.height))) {
    fail("synthetic REP JPEG drifted from its lines");
  }

  const pdfPacket = await ingestDocument({ name: "synthetic-augusta.pdf", bytes: pdfBytes });
  const pdfBands = packetBands(pdfPacket);
  if (!idsEqual(pdfBands.high, ["14"]) || !idsEqual(pdfBands.medium, ["8b"])) {
    fail(`Augusta PDF bands High ${pdfBands.high} Medium ${pdfBands.medium}`);
  }
  const augusta = pdfBands.evaluation.cards.find((card) => card.typeId === "14");
  if (!augusta || augusta.copy !== FIXED_COPY[14]) fail("ingested Augusta copy drifted");
  if (!("retirement_deduction" in pdfPacket.fields) && extractFields(pdfPacket).retirement_deduction !== null) {
    fail("PDF blank retirement did not stay null");
  }
  if ("retirement_deduction" in pdfPacket.fields) fail("PDF blank retirement was emitted");
  if (pdfPacket.ingest.dropped.some((row) => /SSN|EIN/.test(row.evidence || ""))) fail("sample PDF looks identified");

  const jpegPacket = await ingestDocument({ name: "synthetic-rep-hours.jpg", bytes: jpegBytes });
  const jpegBands = packetBands(jpegPacket);
  if (!idsEqual(jpegBands.high, ["18"]) || !idsEqual(jpegBands.medium, ["5"])) {
    fail(`REP JPEG bands High ${jpegBands.high} Medium ${jpegBands.medium}`);
  }
  if (jpegPacket.fields.hours_log_rep !== 820) fail("JPEG hours were not read");
  if ("building_basis" in jpegPacket.fields) fail("JPEG unknown basis was stored");
  if (extractFields(jpegPacket).home_ownership_doc !== false) fail("JPEG 8829 was treated as ownership");
  if (extractFields(jpegPacket).form_1098t !== false) fail("JPEG blank 1098-T became true");
  const repCopy = jpegBands.evaluation.cards.find((card) => card.typeId === "18");
  if (!repCopy || !copyShapeOk(repCopy.copy, "18")) fail("ingested REP present copy shape");

  const pngPacket = await ingestDocument({ name: "synthetic-silent-misses.png", bytes: pngBytes });
  const pngBands = packetBands(pngPacket);
  if (pngBands.high.length || pngBands.medium.length) {
    fail(`silent PNG raised High ${pngBands.high} Medium ${pngBands.medium}`);
  }
  const pngFields = extractFields(pngPacket);
  if (pngFields.home_ownership_doc !== false || pngFields.ownership_rejected_as_8829 !== true) {
    fail("PNG 8829 was treated as ownership");
  }
  if (pngFields.hours_log_rep !== null) fail("PNG blank hours became a number");
  if (pngFields.form_1098t !== false) fail("PNG education invented a 1098-T");
  if ("building_basis" in pngPacket.fields) fail("PNG unknown basis was stored");
  if (pngFields.nua_company_stock !== false || pngFields.qsbs_five_year_or_explicit !== false) {
    fail("PNG filled a missing NUA or QSBS half");
  }
  if (pngFields.ho_context !== false) fail("PNG hedged home-office context was stored");
  if (bandOf(scoreAll(pngFields), "12") !== "silent") fail("PNG education without 1098-T scored");
  if (bandOf(scoreAll(pngFields), "13") !== "silent") fail("PNG cost segregation overfired");
  if (bandOf(scoreAll(pngFields), "14") !== "silent") fail("PNG Augusta overfired");
  if (bandOf(scoreAll(pngFields), "15") !== "silent") fail("PNG hire-kids overfired");
  if (bandOf(scoreAll(pngFields), "18") !== "silent") fail("PNG REP without hours scored");

  const pngRaster = renderLabelRaster(SILENT_PNG_LINES);
  const encodedPng = await encodeGrayPng(pngRaster.gray, pngRaster.width, pngRaster.height);
  if (!sameBytes(pngBytes, encodedPng)) fail("synthetic silent PNG drifted from its lines");

  const noise = encodeGrayJpeg(new Uint8Array(64 * 64).fill(180), 64, 64);
  try {
    await ingestDocument({ name: "noise.jpg", bytes: noise });
    fail("a non-label JPEG produced a packet");
  } catch {
    /* expected */
  }

  const shakyLines = [
    "ANON: TRUE",
    "FILER: FILER-401",
    "TAX YEAR: 2025",
    "SCHEDULE C: YES",
    "SE INCOME: 88000",
    "RETIREMENT DEDUCTION: 0",
    "VEHICLE SIGNAL: YES",
    "HOME OWNERSHIP SOURCE: 1098",
    "BUILDING BASIS: 400000",
    "PIS OR REMODEL YEAR: 2024",
    "PRIOR COST SEG: NO",
    "DEPENDENT RELATIONSHIP: DAUGHTER",
    "LARGE REFUND: 20000",
  ];
  const shaky = parseDocumentText(shakyLines.join("\n"), {
    sourceKind: "pdf-ocr",
    ocr: true,
    confidences: [0.97, 0.97, 0.97, 0.96, 0.96, 0.96, 0.85, 0.85, 0.85, 0.85, 0.85, 0.85, 0.5],
  });
  if (shaky.fields.retirement_deduction !== 0) fail("OCR explicit retirement zero was dropped");
  if (shaky.fields.se_income !== 88000) fail("OCR self-employment income was dropped");
  if (shaky.fields.vehicle_signal !== true) fail("a non-watch line at 0.85 was dropped");
  if ("home_ownership_source" in shaky.fields || "building_basis" in shaky.fields || "pis_or_remodel_year" in shaky.fields) {
    fail("a watch-floor line was stored");
  }
  if ("dependent_relationship" in shaky.fields || "large_refund" in shaky.fields || "prior_cost_seg" in shaky.fields) {
    fail("a low-confidence Augusta, hire-kids, cost-seg, or refund line was stored");
  }
  if (shaky.ingest.ocrWatchFloor !== OCR_WATCH_FLOOR) fail("OCR watch floor was not recorded");
  if (!shaky.ingest.dropped.some((row) => row.reason === WATCH_OCR_REASON)) fail("watch-floor omission was not recorded");
  if (!shaky.ingest.dropped.some((row) => row.reason === LOW_OCR_REASON && row.evidence.startsWith("LARGE REFUND"))) {
    fail("below-floor OCR line was not omitted");
  }
  if (shaky.ingest.accepted.some((row) => row.confidence < CONFIDENCE_FLOOR)) fail("OCR kept a field below the floor");
  const shakyFields = extractFields(shaky);
  const shakyScored = scoreAll(shakyFields);
  if (bandOf(shakyScored, "3") !== "High") fail("confident explicit retirement zero did not score");
  if (bandOf(shakyScored, "8b") !== "Medium") fail("vehicle line above the floor did not score");
  if (bandOf(shakyScored, "13") !== "silent") fail("low-confidence cost segregation raised a card");
  if (bandOf(shakyScored, "14") !== "silent") fail("low-confidence Augusta raised a card");
  if (bandOf(shakyScored, "15") !== "silent") fail("low-confidence hire-kids raised a card");
  if (bandOf(shakyScored, "16") !== "silent") fail("below-floor refund was treated as a number");
  if (shakyFields.large_refund !== 0) fail("omitted refund became a stored zero");

  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (pkg.dependencies["tesseract.js"] !== TESSERACT_VERSION) {
    fail(`tesseract.js pin ${pkg.dependencies["tesseract.js"]} does not match vendor/ocr ${TESSERACT_VERSION}`);
  }
  const trained = fs.readFileSync(path.join(root, "vendor/ocr/tessdata/eng.traineddata.gz"));
  if (trained[0] !== 0x1f || trained[1] !== 0x8b) fail("English traineddata is not gzip bytes");

  const scanImage = await renderPacketJpeg(SCAN_PDF_LINES);
  const scanPdf = buildImagePdf(scanImage.jpeg, scanImage.width, scanImage.height);
  const photo = await renderPacketJpeg(PHOTO_SEP_LINES);
  const scanPath = path.join(root, "samples/ingest/synthetic-scan-augusta.pdf");
  const photoPath = path.join(root, "samples/ingest/synthetic-photo-sep.jpg");
  const scanBytes = new Uint8Array(fs.readFileSync(scanPath));
  const photoBytes = new Uint8Array(fs.readFileSync(photoPath));
  if (!sameBytes(scanBytes, scanPdf)) fail("synthetic scan PDF drifted from its page image");
  if (!sameBytes(photoBytes, photo.jpeg)) fail("synthetic photo JPEG drifted from its lines");

  try {
    await extractPdfText(scanBytes);
    fail("scan PDF exposed a text layer");
  } catch (error) {
    if (!String(error.message).startsWith("No text layer in this PDF.")) fail("scan PDF did not fail closed before OCR");
  }
  const decodedPhoto = decodeGrayJpeg(photoBytes);
  if (readLabelRaster(decodedPhoto.gray, decodedPhoto.width, decodedPhoto.height).lines.length) {
    fail("photo JPEG matched the label font");
  }

  const scanPacket = await ingestDocument({ name: "synthetic-scan-augusta.pdf", bytes: scanBytes });
  if (scanPacket.ingest.sourceKind !== "pdf-ocr") fail(`scan source was ${scanPacket.ingest.sourceKind}`);
  const scanBands = packetBands(scanPacket);
  if (!idsEqual(scanBands.high, ["14"]) || !idsEqual(scanBands.medium, ["8b"])) {
    fail(`scan PDF bands High ${scanBands.high} Medium ${scanBands.medium}`);
  }
  const scanAugusta = scanBands.evaluation.cards.find((card) => card.typeId === "14");
  if (!scanAugusta || scanAugusta.copy !== FIXED_COPY[14]) fail("scanned Augusta copy drifted");
  if ("retirement_deduction" in scanPacket.fields) fail("scan blank retirement was emitted");
  if (extractFields(scanPacket).retirement_deduction !== null) fail("scan blank retirement became a number");
  if (extractFields(scanPacket).hours_log_rep !== null) fail("scan blank hours became a number");
  if (extractFields(scanPacket).form_1098t !== false) fail("scan invented a 1098-T");
  const scanFields = extractFields(scanPacket);
  const scanScored = scoreAll(scanFields);
  if (bandOf(scanScored, "13") !== "silent") fail("scan raised cost segregation");
  if (bandOf(scanScored, "15") !== "silent") fail("scan raised hire-kids");
  if (bandOf(scanScored, "12") !== "silent") fail("scan education without 1098-T scored");
  if (scanPacket.ingest.accepted.some((row) => row.confidence < CONFIDENCE_FLOOR)) fail("scan kept a line below the floor");

  const photoPacket = await ingestDocument({ name: "synthetic-photo-sep.jpg", bytes: photoBytes });
  if (photoPacket.ingest.sourceKind !== "jpeg-ocr") fail(`photo source was ${photoPacket.ingest.sourceKind}`);
  const photoBands = packetBands(photoPacket);
  if (!idsEqual(photoBands.high, ["3"]) || photoBands.medium.length) {
    fail(`photo bands High ${photoBands.high} Medium ${photoBands.medium}`);
  }
  if (photoPacket.fields.retirement_deduction !== 0) fail("photo explicit retirement zero was not read");
  if (photoPacket.fields.se_income !== 88000) fail("photo self-employment income was not read");
  if ("hours_log_rep" in photoPacket.fields) fail("photo blank hours were stored");
  if ("building_basis" in photoPacket.fields) fail("photo blank basis was stored");
  if (extractFields(photoPacket).hours_log_rep !== null) fail("photo blank hours became a number");
  const photoFields = extractFields(photoPacket);
  const photoScored = scoreAll(photoFields);
  if (bandOf(photoScored, "13") !== "silent") fail("photo raised cost segregation");
  if (bandOf(photoScored, "14") !== "silent") fail("photo raised Augusta");
  if (bandOf(photoScored, "15") !== "silent") fail("photo raised hire-kids");
  if (photoFields.nua_company_stock !== false || photoFields.qsbs_five_year_or_explicit !== false) {
    fail("photo filled a missing NUA or QSBS half");
  }
  const sepCopy = photoBands.evaluation.cards.find((card) => card.typeId === "3");
  if (!sepCopy || !copyShapeOk(sepCopy.copy, "3")) fail("photo SEP present copy shape");

  const flatePdf = buildFlateGrayPdf(photo.gray, photo.width, photo.height, (bytes) => deflateSync(bytes));
  const flateImages = await extractPdfPageImages(flatePdf);
  if (flateImages.images.length !== 1 || flateImages.images[0].mime !== "image/png") {
    fail("FlateDecode page image was not read");
  }
  const flateGray = await decodeGrayPng(flateImages.images[0].bytes);
  if (flateGray.width !== photo.width || flateGray.height !== photo.height || !sameBytes(flateGray.gray, photo.gray)) {
    fail("FlateDecode page image did not round-trip");
  }
  const flatePacket = await ingestDocument({ name: "flate-scan.pdf", bytes: flatePdf });
  if (flatePacket.ingest.sourceKind !== "pdf-ocr") fail("FlateDecode scan did not OCR");
  if (flatePacket.fields.retirement_deduction !== 0 || flatePacket.fields.se_income !== 88000) {
    fail("FlateDecode scan did not read the explicit amounts");
  }
  if ("hours_log_rep" in flatePacket.fields || "building_basis" in flatePacket.fields) {
    fail("FlateDecode scan stored a blank amount");
  }

  if (pkg.dependencies["pdfjs-dist"] !== PDFJS_VERSION) {
    fail(`pdfjs-dist pin ${pkg.dependencies["pdfjs-dist"]} does not match pdf-raster ${PDFJS_VERSION}`);
  }
  const withResolvers = Object.getOwnPropertyDescriptor(Promise, "withResolvers");
  if (withResolvers?.configurable) {
    const saved = Promise.withResolvers;
    Object.defineProperty(Promise, "withResolvers", { configurable: true, writable: true, value: undefined });
    installPromiseWithResolvers();
    if (typeof Promise.withResolvers !== "function") fail("Promise.withResolvers polyfill did not install");
    const settled = Promise.withResolvers();
    settled.resolve("ok");
    if (await settled.promise !== "ok") fail("polyfilled Promise.withResolvers did not resolve");
    Object.defineProperty(Promise, "withResolvers", { configurable: true, writable: true, value: saved });
  } else if (typeof Promise.withResolvers !== "function") {
    installPromiseWithResolvers();
    if (typeof Promise.withResolvers !== "function") fail("Promise.withResolvers polyfill did not install");
  }
  const pdfjsPairs = [
    ["vendor/pdfjs/pdf.min.js", "node_modules/pdfjs-dist/legacy/build/pdf.min.mjs"],
    ["vendor/pdfjs/pdf.worker.min.js", "node_modules/pdfjs-dist/legacy/build/pdf.worker.min.mjs"],
    ["vendor/pdfjs/wasm/jbig2.wasm", "node_modules/pdfjs-dist/wasm/jbig2.wasm"],
    ["vendor/pdfjs/wasm/openjpeg.wasm", "node_modules/pdfjs-dist/wasm/openjpeg.wasm"],
    ["vendor/pdfjs/wasm/qcms_bg.wasm", "node_modules/pdfjs-dist/wasm/qcms_bg.wasm"],
  ];
  for (const [vendored, packaged] of pdfjsPairs) {
    const left = fs.readFileSync(path.join(root, vendored));
    const right = fs.readFileSync(path.join(root, packaged));
    if (left.length !== right.length || !left.equals(right)) fail(`${vendored} drifted from pdfjs-dist`);
  }

  const faxPdf = await buildFaxPdf(FAX_PDF_LINES);
  const faxPath = path.join(root, "samples/ingest/synthetic-fax-augusta.pdf");
  const faxBytes = new Uint8Array(fs.readFileSync(faxPath));
  if (!sameBytes(faxBytes, faxPdf)) fail("synthetic fax PDF drifted from its Group 4 image");
  const faxImages = await extractPdfPageImages(faxBytes);
  if (faxImages.images.length) fail("fax PDF was read as JPEG or FlateDecode");
  if (!faxImages.unsupported.includes("CCITTFaxDecode")) fail(`fax filter was ${faxImages.unsupported.join(", ")}`);
  try {
    await extractPdfText(faxBytes);
    fail("fax PDF exposed a text layer");
  } catch (error) {
    if (!String(error.message).startsWith("No text layer in this PDF.")) fail("fax PDF did not fail closed before raster");
  }
  const faxPacket = await ingestDocument({ name: "synthetic-fax-augusta.pdf", bytes: faxBytes });
  if (faxPacket.ingest.sourceKind !== "pdf-ocr") fail(`fax source was ${faxPacket.ingest.sourceKind}`);
  const faxBands = packetBands(faxPacket);
  if (!idsEqual(faxBands.high, ["14"]) || !idsEqual(faxBands.medium, ["8b"])) {
    fail(`fax PDF bands High ${faxBands.high} Medium ${faxBands.medium}`);
  }
  const faxAugusta = faxBands.evaluation.cards.find((card) => card.typeId === "14");
  if (!faxAugusta || faxAugusta.copy !== FIXED_COPY[14]) fail("fax Augusta copy drifted");
  if (faxPacket.fields.se_income !== 88000) fail(`fax self-employment income was ${faxPacket.fields.se_income}`);
  if (faxPacket.fields.home_ownership_source !== "1098") fail("fax did not read the 1098 ownership source");
  if (!faxPacket.forms_in_packet?.includes("FORM 1098")) fail(`fax forms were ${faxPacket.forms_in_packet}`);
  if ("retirement_deduction" in faxPacket.fields) fail("fax blank retirement was emitted");
  if (extractFields(faxPacket).retirement_deduction !== null) fail("fax blank retirement became a number");
  if (extractFields(faxPacket).hours_log_rep !== null) fail("fax blank hours became a number");
  const faxFields = extractFields(faxPacket);
  const faxScored = scoreAll(faxFields);
  if (bandOf(faxScored, "13") !== "silent") fail("fax raised cost segregation");
  if (bandOf(faxScored, "15") !== "silent") fail("fax raised hire-kids");
  if (bandOf(faxScored, "12") !== "silent") fail("fax education without 1098-T scored");
  if (faxPacket.ingest.accepted.some((row) => row.confidence < CONFIDENCE_FLOOR)) fail("fax kept a line below the floor");

  try {
    await ingestDocument({ name: "jbig2.pdf", bytes: buildUnsupportedImagePdf("JBIG2Decode") });
    fail("unreadable scan produced a packet");
  } catch (error) {
    if (!/could not be read/.test(error.message) || !/not filled with zero/.test(error.message)) {
      fail(`unreadable scan refusal was ${error.message}`);
    }
    if (/does not decode/.test(error.message)) fail("refusal still claims a codec is unsupported");
  }
}

try {
  await checkIngest();
} finally {
  await shutdownOcr();
}

const neverHigh = ["3b", "5", "5b", "7b", "8a", "8b", "16", "19", "21", "22", "23", "24", "25", "26"];
for (const item of manifest.fixtures) {
  const fixture = JSON.parse(fs.readFileSync(path.join(root, "fixtures", item.file), "utf8"));
  const { scored } = evaluateFixture(fixture, typesById);
  for (const typeId of neverHigh) {
    if (bandOf(scored, typeId) === "High") fail(`${item.id} raised ${typeId} to High`);
  }
}

if (failures.length) {
  console.error(`Self-check failed (${failures.length})`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`Self-check passed: ${manifest.fixtures.length} fixtures, floor boundaries, talk bans, fixed copy.`);

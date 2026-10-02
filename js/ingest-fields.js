/**
 * Phase 2 field parser. A line becomes a field only when the label is
 * explicit and the value clears the confidence floor. Blank amounts are
 * omitted. They are never written as zero. One fuzzy line never fills
 * both halves of NUA, QSBS, or Augusta.
 */

import { FIELD_KEYS } from "./extract.js";

export const CONFIDENCE_FLOOR = 0.8;
export const OCR_WATCH_FLOOR = 0.9;
const EXPLICIT_CONFIDENCE = 0.96;

const OCR_WATCH_FIELDS = new Set([
  "building_basis",
  "pis_or_remodel_year",
  "prior_cost_seg",
  "home_ownership_doc",
  "home_ownership_source",
  "child_dependent",
  "dependent_relationship",
  "dependents_on_return",
  "dependent_ages",
]);

export const LOW_OCR_REASON = "OCR confidence is below the floor, so the line was omitted.";
export const WATCH_OCR_REASON = "OCR confidence is below the watch floor for cost segregation, Augusta, or hire-kids, so the line was omitted.";

function roundConf(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const EIN = /\b\d{2}-\d{7}\b/;

const BANNED_KEYS = new Set([
  "SSN",
  "EIN",
  "SOCIAL SECURITY",
  "TAXPAYER NAME",
  "LEGAL NAME",
  "FIRST NAME",
  "LAST NAME",
  "CLIENT NAME",
]);

const REFUSED_KEYS = new Map([
  ["NUA", "A single NUA line does not fill employer-plan Form 1099-R or company stock."],
  ["NUA SIGNAL", "A single NUA line does not fill employer-plan Form 1099-R or company stock."],
  ["QSBS", "A single QSBS line does not fill a C corporation disposal and the five-year note."],
  ["QSBS SIGNAL", "A single QSBS line does not fill a C corporation disposal and the five-year note."],
  ["COST SEG", "Cost segregation is not inferred from a prose flag. Basis and year stay on their own lines."],
  ["AUGUSTA", "Augusta is not inferred from the word. Ownership needs an explicit source line."],
  ["KIDS", "Hire-kids needs an explicit child, son, daughter, or grandchild relationship."],
  ["CHILDREN", "Hire-kids needs an explicit child, son, daughter, or grandchild relationship."],
  ["HIRE KIDS", "Hire-kids needs an explicit child, son, daughter, or grandchild relationship."],
  ["HOURS", "Hours need the HOURS LOG REP line. A bare hours note is omitted."],
  ["OWNERSHIP", "Ownership needs HOME OWNERSHIP SOURCE or HOME OWNERSHIP DOC."],
  ["NOTE", "Notes are not fields."],
]);

const OWNERSHIP = new Map([
  ["1098", "1098"],
  ["SCH A MORTGAGE", "sch_a_mortgage"],
  ["DEED", "deed"],
  ["8829", "8829"],
  ["FORM 8829", "8829"],
]);

const RELATIONSHIPS = new Map([
  ["SON", "son"],
  ["DAUGHTER", "daughter"],
  ["CHILD", "child"],
  ["GRANDCHILD", "grandchild"],
  ["PARENT", "parent"],
]);

const FIELD_LABELS = {
  "SCHEDULE C": ["schedule_c", "bool"],
  "S CORP": ["s_corp", "bool"],
  "K1 ONLY": ["k1_only", "bool"],
  "HAS BUSINESS": ["has_business", "bool"],
  "HOME OWNERSHIP DOC": ["home_ownership_doc", "bool"],
  "HOME OWNERSHIP SOURCE": ["home_ownership_source", "ownership"],
  "BUILDING BASIS": ["building_basis", "amount"],
  "PIS OR REMODEL YEAR": ["pis_or_remodel_year", "year"],
  "PRIOR COST SEG": ["prior_cost_seg", "bool"],
  "DEPENDENTS ON RETURN": ["dependents_on_return", "bool"],
  "CHILD DEPENDENT": ["child_dependent", "bool"],
  "DEPENDENT RELATIONSHIP": ["dependent_relationship", "relationship"],
  "DEPENDENT AGES": ["dependent_ages", "ages"],
  "RETIREMENT DEDUCTION": ["retirement_deduction", "amount"],
  "SE INCOME": ["se_income", "amount"],
  "EARNED INCOME": ["earned_income", "amount"],
  "OFFICER W2": ["officer_w2", "amount"],
  "DISTRIBUTIONS": ["distributions", "amount"],
  "QBI INCOME": ["qbi_income", "amount"],
  "TENTATIVE DEDUCTION": ["tentative_deduction", "amount"],
  "DEDUCTION TAKEN": ["deduction_taken", "amount"],
  "SSTB": ["sstb", "bool"],
  "FORM 2210 UNDERPAY": ["form_2210_underpay", "bool"],
  "WASH 8949": ["wash_8949", "bool"],
  "SCH D LOSS ROOM": ["sch_d_loss_room", "bool"],
  "LOTS MISSING": ["lots_missing", "bool"],
  "FORM 8582 SUSPENDED": ["form_8582_suspended", "bool"],
  "CY PASSIVE INCOME": ["cy_passive_income", "bool"],
  "MULTIPLE PASSIVE ACTIVITIES": ["multiple_passive_activities", "bool"],
  "PRIOR GROUPING ELECTION": ["prior_grouping_election", "bool"],
  "SECTION 179 ADDS": ["adds_cost", "amount"],
  "SECTION 179 TAKEN": ["amount_taken", "amount"],
  "TI ABSORBS": ["ti_absorbs", "bool"],
  "HSA W2 8889 MISMATCH": ["hsa_w2_8889_mismatch", "bool"],
  "CTC ODC GAP": ["ctc_odc_gap", "bool"],
  "EDU CREDIT GAP": ["edu_credit_gap", "bool"],
  "FORM 1098T": ["form_1098t", "bool"],
  "HOURS LOG REP": ["hours_log_rep", "hours"],
  "SCH E RE LOSS": ["sch_e_re_loss", "bool"],
  "CHARITABLE SCH A": ["charitable_sch_a", "bool"],
  "CHARITABLE SCH A AMOUNT": ["charitable_sch_a_amount", "amount"],
  "FORM 8283": ["form_8283", "bool"],
  "STANDARD DEDUCTION": ["standard_deduction", "bool"],
  "PRIOR YEAR SCH A CHARITABLE": ["prior_year_sch_a_charitable", "amount"],
  AGE: ["age", "amount"],
  "AGE 70 5": ["age_70_5", "bool"],
  "IRA OR 1099R": ["ira_or_1099r", "bool"],
  "CHARITABLE PATTERN": ["charitable_pattern", "bool"],
  "FORM 8829": ["form_8829", "bool"],
  "HO CONTEXT": ["ho_context", "bool"],
  "HO 8829 COMPLETE NO GAP": ["ho_8829_complete_no_gap", "bool"],
  "VEHICLE SIGNAL": ["vehicle_signal", "bool"],
  "W2 UNREIMBURSED ONLY": ["w2_unreimbursed_only", "bool"],
  "LARGE REFUND": ["large_refund", "amount"],
  "ESTIMATES PAID": ["estimates_paid", "amount"],
  "TOTAL TAX": ["total_tax", "amount"],
  "MULTI STATE SIGNAL": ["multi_state_signal", "bool"],
  "STATE RETURNS MISMATCH": ["state_returns_mismatch", "bool"],
  "SEHI GAP": ["sehi_gap", "bool"],
  "FORM 2441 GAP": ["form_2441_gap", "bool"],
  "CARE DOCS OR FSA": ["care_docs_or_fsa", "bool"],
  "FORM 5695": ["form_5695", "bool"],
  "RESIDENTIAL ENERGY DOCS": ["residential_energy_docs", "bool"],
  "FORM 6765 OR RD STUDY": ["form_6765_or_rd_study", "bool"],
  "TECH SCH C WAGES ONLY": ["tech_sch_c_wages_only", "bool"],
  "NUA EMPLOYER PLAN 1099R": ["nua_employer_plan_1099r", "bool"],
  "NUA COMPANY STOCK": ["nua_company_stock", "bool"],
  "TRAD IRA OR 401K": ["trad_ira_or_401k", "bool"],
  "LOW TI YEAR": ["low_ti_year", "bool"],
  "QSBS C CORP DISPOSAL": ["qsbs_c_corp_disposal", "bool"],
  "QSBS FIVE YEAR": ["qsbs_five_year_or_explicit", "bool"],
  "ENTITY VIBE ONLY": ["entity_vibe_only", "bool"],
  "FORM 6252": ["form_6252", "bool"],
  "FORM 8824": ["form_8824", "bool"],
  "LARGE RE GAIN NO 1031": ["large_re_gain_no_1031", "bool"],
};

const ALLOWED = new Set(FIELD_KEYS);
const BLANK = /^(?:|—|-|–|n\/a|na|none|unknown|omitted|\?|blank)$/i;
const FUZZY = /about|approx|around|roughly|maybe|circa|~|over|under|between|\?|recent|thousand/i;
const YES = /^(yes|true|y|checked)$/i;
const NO = /^(no|false|n)$/i;
const MONEY = /^\$?\s*((?:\d{1,3}(?:,\d{3})+)|\d+)(?:\.(\d{1,2}))?$/;

function normalizeKey(raw) {
  return raw.trim().replace(/-/g, " ").replace(/\s+/g, " ").toUpperCase();
}

function isBlank(value) {
  return BLANK.test(value.trim());
}

function parseBool(value) {
  if (isBlank(value)) return { omit: true, reason: "Blank checkbox omitted. It was not stored as false or as zero." };
  if (YES.test(value)) return { value: true };
  if (NO.test(value)) return { value: false };
  if (FUZZY.test(value)) return { omit: true, reason: "Hedged checkbox is below the confidence floor." };
  return { omit: true, reason: "Checkbox was not an explicit yes or no." };
}

function parseAmount(value) {
  const text = value.trim();
  if (isBlank(text)) return { omit: true, reason: "Blank amount omitted; not coerced to zero." };
  if (FUZZY.test(text) || !MONEY.test(text)) {
    return { omit: true, reason: "Amount was not one explicit number, so it was omitted." };
  }
  const n = Number(text.replace(/[$,\s]/g, ""));
  if (!Number.isFinite(n)) return { omit: true, reason: "Amount did not parse and was omitted." };
  return { value: n };
}

function parseHours(value) {
  const text = value.trim();
  if (isBlank(text)) return { omit: true, reason: "Blank hours omitted; not coerced to zero." };
  if (FUZZY.test(text) || !/^\d{1,5}(?:\.\d)?$/.test(text)) {
    return { omit: true, reason: "Hours were not one explicit number, so they were omitted." };
  }
  return { value: Number(text) };
}

function parseYear(value) {
  const text = value.trim();
  if (isBlank(text)) return { omit: true, reason: "Blank year omitted." };
  if (!/^(19|20)\d{2}$/.test(text)) {
    return { omit: true, reason: "Year was not an explicit four-digit year, so it was omitted." };
  }
  return { value: Number(text) };
}

function parseOwnership(value) {
  const text = normalizeKey(value);
  if (isBlank(value)) return { omit: true, reason: "Blank ownership source omitted. It was not treated as a 1098." };
  if (!OWNERSHIP.has(text)) {
    return { omit: true, reason: "Ownership source was not an explicit 1098, mortgage, deed, or 8829 label." };
  }
  return { value: OWNERSHIP.get(text) };
}

function parseRelationship(value) {
  const text = normalizeKey(value);
  if (isBlank(value)) return { omit: true, reason: "Blank relationship omitted. Hire-kids was not inferred." };
  if (!RELATIONSHIPS.has(text)) {
    return { omit: true, reason: "Relationship was not an explicit child, grandchild, or parent label." };
  }
  return { value: RELATIONSHIPS.get(text) };
}

function parseAges(value) {
  const text = value.trim();
  if (isBlank(text)) return { omit: true, reason: "Blank ages omitted. They were not stored as zero." };
  if (FUZZY.test(text)) return { omit: true, reason: "Ages were hedged, so they were omitted." };
  const parts = text.split(/[,\s]+/).filter(Boolean);
  if (!parts.length || parts.some((part) => !/^\d{1,2}$/.test(part))) {
    return { omit: true, reason: "Ages were not an explicit list of integers, so they were omitted." };
  }
  return { value: parts.map((part) => Number(part)) };
}

const PARSERS = {
  bool: parseBool,
  amount: parseAmount,
  hours: parseHours,
  year: parseYear,
  ownership: parseOwnership,
  relationship: parseRelationship,
  ages: parseAges,
};

function dropPair(fields, accepted, dropped, keys, reason) {
  let moved = false;
  for (const key of keys) {
    if (!Object.prototype.hasOwnProperty.call(fields, key)) continue;
    moved = true;
    delete fields[key];
  }
  if (!moved) return;
  for (let i = accepted.length - 1; i >= 0; i -= 1) {
    if (keys.includes(accepted[i].field)) {
      dropped.push({ evidence: accepted[i].evidence, reason });
      accepted.splice(i, 1);
    }
  }
}

function assembleGroups(fields, accepted, dropped) {
  const qbiKeys = ["qbi_income", "tentative_deduction", "deduction_taken", "sstb"];
  const qbiNumbers = ["qbi_income", "tentative_deduction", "deduction_taken"];
  const qbiPresent = qbiNumbers.filter((key) => Object.prototype.hasOwnProperty.call(fields, key));
  if ((qbiPresent.length > 0 && qbiPresent.length < 3) || (Object.prototype.hasOwnProperty.call(fields, "sstb") && qbiPresent.length < 3)) {
    dropPair(
      fields,
      accepted,
      dropped,
      qbiKeys,
      "Partial QBI numbers were omitted so a missing deduction is not treated as zero.",
    );
  } else if (qbiPresent.length === 3) {
    fields.qbi_fields = {
      qbi_income: fields.qbi_income,
      tentative_deduction: fields.tentative_deduction,
      deduction_taken: fields.deduction_taken,
      sstb: fields.sstb === true,
    };
    for (const key of qbiKeys) delete fields[key];
  }

  const bonusKeys = ["adds_cost", "amount_taken"];
  const bonusPresent = bonusKeys.filter((key) => Object.prototype.hasOwnProperty.call(fields, key));
  if (bonusPresent.length === 1) {
    dropPair(
      fields,
      accepted,
      dropped,
      bonusKeys,
      "Section 179 needs both the addition and the amount taken. The lone number was omitted.",
    );
  } else if (bonusPresent.length === 2) {
    fields.section_179_bonus = {
      adds_cost: fields.adds_cost,
      amount_taken: fields.amount_taken,
    };
    delete fields.adds_cost;
    delete fields.amount_taken;
  }

  const wageKeys = ["distributions", "officer_w2"];
  const wages = wageKeys.filter((key) => Object.prototype.hasOwnProperty.call(fields, key));
  if (wages.length === 1) {
    dropPair(
      fields,
      accepted,
      dropped,
      wageKeys,
      "Officer W-2 and distributions are kept only when both amounts are explicit, so a missing wage is not treated as zero.",
    );
  }
}

/**
 * @param {string} text
 * @param {{ sourceKind: string, fileName?: string, ocr?: boolean, confidences?: number[] }} meta
 */
export function parseDocumentText(text, meta) {
  if (typeof text !== "string" || text.trim() === "") {
    throw new Error("The document had no readable text.");
  }
  if (SSN.test(text) || EIN.test(text)) {
    throw new Error("This file looks like it contains an SSN or EIN. Phase 2 accepts anonymized packets only.");
  }

  const fields = {};
  const accepted = [];
  const dropped = [];
  let anon = false;
  let filer = null;
  let taxYear = null;
  let taxYearConfidence = null;
  let forms = [];

  function keep(field, value, evidence, ocrConf) {
    if (Object.prototype.hasOwnProperty.call(fields, field)) {
      dropped.push({ evidence, reason: "Duplicate label ignored. The first explicit value stands." });
      return;
    }
    const confidence = ocrConf == null ? EXPLICIT_CONFIDENCE : ocrConf;
    if (confidence < CONFIDENCE_FLOOR) {
      dropped.push({ evidence, reason: LOW_OCR_REASON });
      return;
    }
    if (ocrConf != null && OCR_WATCH_FIELDS.has(field) && confidence < OCR_WATCH_FLOOR) {
      dropped.push({ evidence, reason: WATCH_OCR_REASON });
      return;
    }
    fields[field] = value;
    accepted.push({ field, value, confidence, evidence });
  }

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) continue;
    const ocrConf = meta.ocr ? roundConf(Number(meta.confidences?.[index])) : null;
    if (meta.ocr && !(ocrConf >= CONFIDENCE_FLOOR)) {
      dropped.push({ evidence: line, reason: LOW_OCR_REASON });
      continue;
    }
    const split = line.match(/^([^:]{1,60}):\s*(.*)$/);
    if (!split) {
      dropped.push({ evidence: line, reason: "Unlabeled text is not a field." });
      continue;
    }
    const key = normalizeKey(split[1]);
    const value = split[2].trim();
    const evidence = line;
    if (!/^[A-Z0-9 ]+$/.test(key)) {
      dropped.push({ evidence, reason: "Label was not a plain field name." });
      continue;
    }
    if (BANNED_KEYS.has(key)) {
      throw new Error(`Remove "${key}". Packets stay anonymized.`);
    }
    if (key === "ANON") {
      anon = YES.test(value);
      if (!anon) dropped.push({ evidence, reason: "ANON was not TRUE." });
      continue;
    }
    if (key === "FILER") {
      if (!/^FILER-\d{3,6}$/.test(value.toUpperCase())) {
        throw new Error("Packet needs a FILER-### reference. Names are not accepted.");
      }
      filer = value.toUpperCase();
      continue;
    }
    if (key === "TAX YEAR") {
      const parsed = parseYear(value);
      if (parsed.omit) dropped.push({ evidence, reason: parsed.reason });
      else {
        taxYear = parsed.value;
        taxYearConfidence = ocrConf;
      }
      continue;
    }
    if (key === "FORMS") {
      if (isBlank(value)) {
        dropped.push({ evidence, reason: "Blank form list omitted." });
        continue;
      }
      const items = value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean);
      if (!items.length || items.some((item) => !/^[A-Z0-9 /-]+$/.test(item) || item.length > 40)) {
        dropped.push({ evidence, reason: "Form list was not an explicit list of form names." });
        continue;
      }
      forms = items;
      continue;
    }
    if (key === "LABEL") continue;
    if (REFUSED_KEYS.has(key)) {
      dropped.push({ evidence, reason: REFUSED_KEYS.get(key) });
      continue;
    }
    const spec = FIELD_LABELS[key];
    if (!spec) {
      dropped.push({ evidence, reason: "Unrecognized label. It was not mapped to a field." });
      continue;
    }
    const parsed = PARSERS[spec[1]](value);
    if (parsed.omit || !Object.prototype.hasOwnProperty.call(parsed, "value")) {
      dropped.push({ evidence, reason: parsed.reason || "Omitted." });
      continue;
    }
    keep(spec[0], parsed.value, evidence, ocrConf);
  }

  if (!anon) {
    throw new Error(meta.ocr
      ? "OCR did not read ANON: TRUE above the confidence floor. The scan was not scored. Missing amounts were not filled with zero."
      : "Set ANON: TRUE. Live client packets are out of scope.");
  }
  if (!filer) {
    throw new Error(meta.ocr
      ? "OCR did not read a FILER-### reference above the confidence floor. The scan was not scored. Missing amounts were not filled with zero."
      : "Packet needs a FILER-### reference. Names are not accepted.");
  }

  assembleGroups(fields, accepted, dropped);
  if (taxYear != null) {
    fields.tax_year = taxYear;
    accepted.push({
      field: "tax_year",
      value: taxYear,
      confidence: taxYearConfidence == null ? EXPLICIT_CONFIDENCE : taxYearConfidence,
      evidence: `TAX YEAR: ${taxYear}`,
    });
  }
  if (forms.length) fields.forms_in_packet = forms;

  for (const key of Object.keys(fields)) {
    if (!ALLOWED.has(key)) throw new Error(`Ingest emitted a field outside the extract contract: ${key}`);
  }

  const kindLabel = {
    pdf: "text-layer PDF",
    "pdf-ocr": "scanned PDF",
    jpeg: "labeled JPEG",
    "jpeg-ocr": "photo JPEG",
    png: "labeled PNG",
    "png-ocr": "photo PNG",
    text: "labeled text",
  }[meta.sourceKind] || "labeled text";

  const ingest = {
    sourceKind: meta.sourceKind || "text",
    fileName: meta.fileName || "",
    confidenceFloor: CONFIDENCE_FLOOR,
    accepted,
    dropped,
  };
  if (meta.ocr) ingest.ocrWatchFloor = OCR_WATCH_FLOOR;

  return {
    id: `ingest-${filer.toLowerCase()}-${meta.sourceKind || "text"}`,
    anon: true,
    label: `${filer} · ${kindLabel}`,
    group: "dropped",
    filer_ref: filer,
    tax_year: taxYear,
    forms_in_packet: forms,
    scenario: meta.ocr
      ? "Scan OCR. Lines under the confidence floor were omitted. Blank amounts stayed blank."
      : "Phase 2 ingest. Blank amounts stayed omitted. Lines under the confidence floor were not scored.",
    fields,
    ingest,
  };
}

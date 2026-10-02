/**
 * Additive planning estimate. Sibling of a High card only.
 * Bands, pass tags, present copy, and floors stay where score.js left them.
 * A missing rate or a weak bracket guess is omitted. It is not stored as zero.
 */

import { STUB_FLOORS } from "./score.js";

export const HUMAN_GATE_LABEL = "Planning estimate for human review. Not tax advice.";
export const SAVINGS_CONFIDENCE_FLOOR = 0.85;
const SHOWN_CONFIDENCE = 0.9;
const MAX_EXPLICIT_ORDINARY_RATE = 0.37;

const ADVICE = [
  /you should/i,
  /qualif(?:y|ies)/i,
  /will save/i,
  /guaranteed/i,
  /best strategy/i,
  /tax savings/i,
];

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function explicitOrdinaryRate(value) {
  const rate = num(value);
  if (rate == null || rate <= 0 || rate > MAX_EXPLICIT_ORDINARY_RATE) return null;
  return rate;
}

/** Packet payroll rate. Not an ordinary-income rate and not a flat 15.3% factor. */
export function explicitPayrollRate(value) {
  const rate = num(value);
  if (rate == null || rate <= 0 || rate > 0.2) return null;
  return rate;
}

export function explicitWageBase(value) {
  const wageBase = num(value);
  if (wageBase == null || wageBase <= 0) return null;
  return wageBase;
}

function adviceHit(text) {
  return ADVICE.some((rule) => rule.test(text));
}

function roundMoney(value) {
  return Math.round(value * 100) / 100;
}

function payrollOn(amount, wageBase, oasdiRate, medicareRate) {
  const base = Math.max(0, amount);
  return Math.min(base, wageBase) * oasdiRate + base * medicareRate;
}

/**
 * Type 2b dollars. Omitted unless the packet has an explicit compensation
 * figure and the OASDI wage base plus separate OASDI and Medicare rates.
 * SSTB omits the figure. There is no default compensation figure.
 * @returns {null | { point: number, basis: string }}
 */
function scorpConversionEstimate(fields, fixture) {
  if (fields?.qbi_fields?.sstb === true) return null;
  const se = num(fields?.se_income);
  const rc = num(fields?.planning_rc);
  if (se == null || rc == null || rc < 0) return null;
  const wageBase = explicitWageBase(fixture?.oasdi_wage_base);
  const oasdiRate = explicitPayrollRate(fixture?.oasdi_rate);
  const medicareRate = explicitPayrollRate(fixture?.medicare_rate);
  if (wageBase == null || oasdiRate == null || medicareRate == null) return null;
  const point = roundMoney(payrollOn(se, wageBase, oasdiRate, medicareRate) - payrollOn(rc, wageBase, oasdiRate, medicareRate));
  if (!(point > 0)) return null;
  return {
    point,
    basis: "Schedule SE net earnings minus the explicit compensation figure, split by the packet OASDI wage base and the separate OASDI and Medicare rates. A person reviews this before anyone relies on it.",
  };
}

/**
 * @returns {null | { point: number, low: null, high: null, basis: string, confidence: number, label: string }}
 */
export function savingsFor(hit, fields, fixture) {
  if (!hit || hit.band !== "High") return null;
  if (hit.typeId === "14" || hit.typeId === "15") return null;

  let point = null;
  let basis = null;
  if (hit.typeId === "1") {
    const rate = explicitOrdinaryRate(fixture?.planning_rate);
    if (rate == null) return null;
    const qbi = fields?.qbi_fields || {};
    const income = num(qbi.qbi_income);
    const tentative = num(qbi.tentative_deduction);
    const taken = num(qbi.deduction_taken);
    if (income == null || tentative == null || taken == null) return null;
    const gap = tentative - taken;
    if (!(income > 0 && gap >= STUB_FLOORS.qbiGapMin)) return null;
    point = roundMoney(gap * rate);
    basis = "Unclaimed QBI deduction (tentative minus taken) multiplied by the explicit ordinary rate on the packet. Cite the Form 8995 gap and that rate. A person reviews this before anyone relies on it.";
  } else if (hit.typeId === "2b") {
    const estimate = scorpConversionEstimate(fields, fixture);
    if (!estimate) return null;
    point = estimate.point;
    basis = estimate.basis;
  } else {
    return null;
  }

  if (point == null || !Number.isFinite(point)) return null;
  const savings = {
    point,
    low: null,
    high: null,
    basis,
    confidence: SHOWN_CONFIDENCE,
    label: HUMAN_GATE_LABEL,
  };
  if (savings.confidence < SAVINGS_CONFIDENCE_FLOOR) return null;
  if (adviceHit(savings.basis) || adviceHit(savings.label)) return null;
  if (/\$\s?\d/.test(savings.basis) || /\$\s?\d/.test(savings.label)) return null;
  return savings;
}

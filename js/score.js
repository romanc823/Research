/**
 * Score layer. Bands are only "High", "Medium", or "silent".
 * Floors follow docs/TAXONOMY.md. Qualitative words the lock did not
 * quantify (near-zero, material, little, large, unnamed dollar floors)
 * are the named STUB_FLOORS below — calibrations, not new taxonomy.
 * Silent results are returned so the research UI can show that a check
 * ran. Present copy is not built here.
 */

export const STUB_FLOORS = {
  seIncome: 50_000,
  nearZeroOfficerW2: 5_000,
  minDistributions: 10_000,
  qbiGapMin: 500,
  materialAdds: 25_000,
  little179Ratio: 0.1,
  cbEarnedIncome: 250_000,
  priorYearCharitable: 5_000,
  repHours: 750,
  costSegTaxYears: 3,
  largeRefund: 10_000,
  estimatesMultiple: 1.5,
  estimatesExcess: 10_000,
};

/**
 * Locked type 2b figures. These are not STUB_FLOORS and they are not
 * read by types 1–15 or 18. A missing Schedule SE amount is not zero.
 * `seIncome` is the se-alone High. `seBandMin` is not an se-alone floor:
 * the planning_rc gap is High only on [seBandMin, seIncome).
 */
export const TYPE_2B_LOCK = {
  seIncome: 100_000,
  seBandMin: 50_000,
  rcGap: 25_000,
};

/**
 * Statute figures for new types. Not STUB_FLOORS, and not read by types 1–15 or 18.
 * N29: IRC §6654(d)(1)(C) uses 110% when prior-year AGI is over $150,000; otherwise §6654(d)(1)(B) is 100%.
 * N34: IRC §1411(b) / Form 8960 — $200,000 unmarried, $250,000 MFJ, $125,000 MFS.
 */
export const N29_HARBOR = {
  agiThreshold: 150_000,
  highAgiNumerator: 11,
  highAgiDenominator: 10,
};

export const N34_MAGI = {
  single: 200_000,
  mfj: 250_000,
  mfs: 125_000,
};

export const TYPE_ORDER = [
  "1", "2", "2b", "3", "3b", "4", "5", "5b", "6", "7", "7b",
  "8a", "8b", "9", "11", "12", "13", "14", "15", "16",
  "17", "18", "19", "20", "21", "22", "23", "24", "25", "26",
  "N27", "N28", "N29", "N30", "N31", "N32", "N34",
];

function num(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function bool(value) {
  return value === true;
}

function businessReturn(fields) {
  return bool(fields.schedule_c) || bool(fields.s_corp);
}

function qbiMathGap(fields) {
  const qbi = fields.qbi_fields || {};
  const income = num(qbi.qbi_income);
  const gap = num(qbi.tentative_deduction) - num(qbi.deduction_taken);
  return income > 0 && gap >= STUB_FLOORS.qbiGapMin;
}

function bonusParts(fields) {
  const bonus = fields.section_179_bonus || {};
  return { adds: num(bonus.adds_cost), taken: num(bonus.amount_taken) };
}

function little179(fields) {
  const { adds, taken } = bonusParts(fields);
  if (adds < STUB_FLOORS.materialAdds) return false;
  return taken / adds < STUB_FLOORS.little179Ratio;
}

function costSegWindow(fields) {
  const year = fields.pis_or_remodel_year;
  const taxYear = fields.tax_year;
  if (typeof year !== "number" || typeof taxYear !== "number") return false;
  const delta = taxYear - year;
  return delta >= 0 && delta <= STUB_FLOORS.costSegTaxYears - 1;
}

function childForHire(fields) {
  if (bool(fields.child_dependent)) return true;
  const rel = String(fields.dependent_relationship || "").toLowerCase();
  return rel === "child" || rel === "son" || rel === "daughter" || rel === "grandchild";
}

function kidsOnReturn(fields) {
  return bool(fields.child_dependent) || bool(fields.dependents_on_return) || childForHire(fields);
}

function charitablePattern(fields) {
  return bool(fields.charitable_sch_a) || bool(fields.form_8283) || bool(fields.charitable_pattern);
}

function estimatesFarAboveTax(fields) {
  const estimates = num(fields.estimates_paid);
  const tax = num(fields.total_tax);
  if (tax <= 0) return false;
  const excess = estimates - tax;
  return estimates > tax * STUB_FLOORS.estimatesMultiple && excess >= STUB_FLOORS.estimatesExcess;
}

function row(typeId, band, passTag, reason, evidence, laneOverride) {
  const lane = laneOverride || (band === "High" ? "must-review" : band === "Medium" ? "optional-tray" : "silent");
  return {
    typeId,
    band,
    lane,
    passTag: band === "silent" ? null : passTag,
    reason,
    evidence,
  };
}

function explicitMoney(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formList(fields) {
  return Array.isArray(fields.forms_in_packet) ? fields.forms_in_packet.map((item) => String(item)) : [];
}

function formsMatch(fields, pattern) {
  return formList(fields).some((item) => pattern.test(item));
}

/**
 * Type 2b only. High or silent. Never Medium.
 * W-2 Box 1 (`earned_income`) is not an input. A one-year spike is not a kill.
 * Se-alone High is `se_income` at the locked floor. The compensation gap is
 * High only inside the band below that floor, and only with an explicit
 * `planning_rc`. A missing figure is not inferred and is not treated as zero.
 */
function scoreScorpConversion(f) {
  const se = explicitMoney(f.se_income);
  const rcRaw = explicitMoney(f.planning_rc);
  const rc = rcRaw != null && rcRaw >= 0 ? rcRaw : null;
  const scheduleC = bool(f.schedule_c) || formsMatch(f, /\bschedule\s*c\b/i);
  const alreadyS = bool(f.s_corp) || formsMatch(f, /1120\s*-?\s*s\b/i);
  const partnership = bool(f.k1_only) || formsMatch(f, /\b1065\b/);
  const seForm = formsMatch(f, /\bschedule\s*se\b/i);
  const sePresent = se != null;
  const business = scheduleC || seForm || sePresent;
  const gap = se != null && rc != null ? se - rc : null;
  const evidence = {
    schedule_c: scheduleC,
    se_income: se,
    planning_rc: rc,
    business_signal: business,
    one_year_spike: bool(f.one_year_spike),
    s_corp: bool(f.s_corp),
    form_1120s: formsMatch(f, /1120\s*-?\s*s\b/i),
    multi_owner_1065: formsMatch(f, /\b1065\b/),
    k1_only: bool(f.k1_only),
    schedule_se: seForm || sePresent,
  };

  let silentReason = null;
  if (alreadyS) silentReason = "Already an S corporation or Form 1120-S is in the packet";
  else if (partnership) silentReason = "Multi-owner Form 1065 or K-1 only";
  else if (!business) silentReason = "W-2 only, with no Schedule C, no Schedule SE, and no self-employment income";
  else if (se == null) silentReason = "Schedule SE income is missing and is not treated as zero";
  else if (se <= 0) silentReason = "Loss or near-zero self-employment profit";

  const atFloor = se != null && se >= TYPE_2B_LOCK.seIncome;
  const inBand = se != null && se >= TYPE_2B_LOCK.seBandMin && se < TYPE_2B_LOCK.seIncome;
  const atGap = inBand && rc != null && gap != null && gap >= TYPE_2B_LOCK.rcGap;
  if (!silentReason && (atFloor || atGap)) {
    return row("2b", "High", "second-eye", atFloor
      ? "Schedule SE income is at the locked floor"
      : "Schedule SE income is in the compensation band with an explicit compensation figure and a locked gap", evidence);
  }
  if (!silentReason) {
    if (se < TYPE_2B_LOCK.seBandMin) {
      silentReason = "Schedule SE income is under the compensation band";
    } else if (rc == null) {
      silentReason = "Schedule SE income is in the compensation band and no explicit compensation figure is on the packet";
    } else {
      silentReason = "Schedule SE income is in the compensation band and the compensation gap is under the locked gap";
    }
  }
  return row("2b", "silent", null, silentReason, evidence);
}

/** Path P reads `py_*` only. Path R and legacy packets read the unprefixed key only. */
function pick(fields, key) {
  if (fields.packet_path === "P") return fields[`py_${key}`];
  return fields[key];
}

function filingClass(status) {
  const text = String(status || "").trim().toLowerCase().replace(/[_-]+/g, " ").replace(/\s+/g, " ");
  if (!text) return null;
  if (text === "mfj" || text === "married filing jointly" || text === "joint") return "mfj";
  if (text === "mfs" || text === "married filing separately") return "mfs";
  if (
    text === "single"
    || text === "hoh"
    || text === "head of household"
    || text === "qw"
    || text === "qualifying widow"
    || text === "qualifying widow(er)"
    || text === "qualifying surviving spouse"
  ) return "unmarried";
  return null;
}

function niitFloor(status) {
  const kind = filingClass(status);
  if (kind === "mfj") return N34_MAGI.mfj;
  if (kind === "mfs") return N34_MAGI.mfs;
  if (kind === "unmarried") return N34_MAGI.single;
  return null;
}

function scoreForeignTaxCredit(f) {
  const form1116 = bool(pick(f, "form_1116"));
  const paid = explicitMoney(pick(f, "foreign_tax_paid"));
  const deducted = bool(pick(f, "foreign_tax_deducted_sch_a"));
  const carry = bool(pick(f, "ftc_carryover"));
  const material = paid != null && paid > 0;
  const evidence = {
    form_1116: form1116,
    foreign_tax_paid: paid,
    foreign_tax_deducted_sch_a: deducted,
    ftc_carryover: carry,
  };
  if (material || (form1116 && carry) || (form1116 && deducted)) {
    return row("N27", "Medium", "tray-skim", "Foreign tax paid, a credit-versus-deduction gap, or a section 904 carryover is on the packet", evidence);
  }
  return row("N27", "silent", null, form1116 || carry || deducted
    ? "Foreign tax signal is incomplete"
    : "No foreign tax amount and no Form 1116", evidence);
}

function scoreForeignAccount(f) {
  const yes = bool(pick(f, "schedule_b_foreign_yes"));
  const thresholdMet = bool(pick(f, "form_8938_threshold_met"));
  const accountValue = explicitMoney(pick(f, "foreign_account_value_explicit"));
  const threshold = thresholdMet || (accountValue != null && accountValue > 0);
  const incomplete8938 = bool(pick(f, "form_8938_incomplete"));
  const incomplete3520 = bool(pick(f, "form_3520_incomplete"));
  const incomplete8621 = bool(pick(f, "form_8621_incomplete"));
  const incomplete = incomplete8938 || incomplete3520 || incomplete8621;
  const pfic = bool(pick(f, "pfic_or_foreign_trust_marker"));
  const form3520 = bool(pick(f, "form_3520"));
  const form8621 = bool(pick(f, "form_8621"));
  const form8938 = bool(pick(f, "form_8938"));
  const fbar = bool(pick(f, "fbar_signal"));
  const matchingComplete = (form8621 && !incomplete8621) || (form3520 && !incomplete3520);
  const pficGate = pfic && !matchingComplete;
  const evidence = {
    schedule_b_foreign_yes: yes,
    form_8938_threshold_met: thresholdMet,
    foreign_account_value_explicit: accountValue,
    form_8938: form8938,
    form_8938_incomplete: incomplete8938,
    form_3520: form3520,
    form_3520_incomplete: incomplete3520,
    form_8621: form8621,
    form_8621_incomplete: incomplete8621,
    pfic_or_foreign_trust_marker: pfic,
    fbar_signal: fbar,
  };
  if (yes && (threshold || incomplete || pficGate)) {
    return row(
      "N28",
      "High",
      "compliance-flag",
      "Schedule B Part III Yes plus a threshold, an incomplete foreign form, or a PFIC or foreign-trust gate. FinCEN 114 is not Form 8938",
      evidence,
      "compliance-only",
    );
  }
  let why = "No foreign-account signal";
  if (yes) {
    why = "Schedule B Part III Yes alone stays silent. Docs needed: a Form 8938 threshold worksheet and FinCEN 114 if the FBAR threshold is met. FinCEN 114 is not Form 8938";
  } else if (fbar || threshold || incomplete || pfic || form8938 || form3520 || form8621) {
    why = "Foreign-account markers without Schedule B Part III Yes stay silent. FinCEN 114 is not Form 8938";
  }
  return row("N28", "silent", null, why, evidence);
}

function scoreSafeHarbor(f) {
  const agi = explicitMoney(f.prior_year_agi);
  const priorTax = explicitMoney(f.prior_year_total_tax);
  const withholding = explicitMoney(f.withholding);
  const estimates = explicitMoney(f.estimates_paid);
  const esContext = withholding != null || (estimates != null && estimates > 0);
  const current = (estimates != null ? estimates : 0) + (withholding != null ? withholding : 0);
  const evidence = {
    prior_year_agi: agi,
    prior_year_total_tax: priorTax,
    estimates_paid: estimates,
    withholding,
    current_es_plus_wh: esContext ? current : null,
    form_2210_underpay: bool(f.form_2210_underpay),
    harbor: null,
  };
  const pathPReason = "Path P alone stays silent. Docs needed: a current-year estimate plan or a Path R packet with prior-year lookback. Same-year payments are not this forward harbor";
  if (f.packet_path === "P") {
    return row("N29", "silent", null, pathPReason, evidence);
  }
  if (agi == null || priorTax == null || !(priorTax > 0)) {
    const pathPBag = explicitMoney(f.py_agi) != null || explicitMoney(f.py_total_tax) != null;
    return row("N29", "silent", null, pathPBag ? pathPReason : "Prior-year AGI or total tax is missing", evidence);
  }
  if (bool(f.form_2210_underpay)) {
    return row("N29", "silent", null, "Type 4 already flags this tax year, so the forward harbor stays silent", evidence);
  }
  if (!esContext) {
    return row("N29", "silent", null, "Current-year estimates or withholding are not on the packet", evidence);
  }
  const highAgi = agi > N29_HARBOR.agiThreshold;
  const below = highAgi
    ? current * N29_HARBOR.highAgiDenominator < priorTax * N29_HARBOR.highAgiNumerator
    : current < priorTax;
  evidence.harbor = highAgi
    ? (priorTax * N29_HARBOR.highAgiNumerator) / N29_HARBOR.highAgiDenominator
    : priorTax;
  evidence.high_agi_multiple = highAgi;
  if (below) {
    return row("N29", "Medium", "tray-skim", "Current estimates plus withholding sit below the section 6654(d) harbor. This check is never must-review", evidence);
  }
  return row("N29", "silent", null, "Current estimates plus withholding meet the section 6654(d) harbor", evidence);
}

function scorePartnershipExit(f) {
  const liquidating = bool(pick(f, "k1_liquidating"));
  const disposition = bool(pick(f, "passthrough_interest_disposition"));
  const finalReturn = bool(pick(f, "form_1065_final"));
  const hot = bool(pick(f, "section_751_statement"));
  const ordinary = bool(pick(f, "k1_partnership"));
  const exit = liquidating || disposition || finalReturn;
  const support = hot || finalReturn;
  const evidence = {
    k1_partnership: ordinary,
    k1_liquidating: liquidating,
    passthrough_interest_disposition: disposition,
    section_751_statement: hot,
    form_1065_final: finalReturn,
  };
  if (exit && support) {
    return row("N30", "High", "second-eye", "Partnership exit with a section 751 statement or a final Form 1065. The desk does not choose the section 736 bucket", evidence);
  }
  return row("N30", "silent", null, ordinary && !exit
    ? "Ordinary K-1 income stays silent"
    : "Partnership disposition and a section 751 or final-return signal are not both present", evidence);
}

function scoreBackdoorRoth(f) {
  const magi = explicitMoney(pick(f, "magi"));
  const form8606 = bool(pick(f, "form_8606"));
  const nondeductible = bool(pick(f, "nondeductible_ira"));
  const box12 = bool(pick(f, "w2_box12_aftertax_or_roth"));
  const plan = bool(pick(f, "plan_doc_mega_backdoor"));
  const evidence = {
    magi,
    form_8606: form8606,
    nondeductible_ira: nondeductible,
    w2_box12_aftertax_or_roth: box12,
    plan_doc_mega_backdoor: plan,
  };
  if (magi != null && (form8606 || nondeductible) && (box12 || plan)) {
    return row("N31", "Medium", "tray-skim", "MAGI, a nondeductible IRA signal, and a plan or W-2 after-tax signal are all present", evidence);
  }
  return row("N31", "silent", null, "MAGI, Form 8606 or a nondeductible IRA, and a plan or W-2 after-tax signal are not all present", evidence);
}

function scoreStatePte(f) {
  const standard = bool(f.standard_deduction);
  const salt = bool(f.salt_sch_a_capped);
  const pte = bool(f.k1_partnership) || bool(f.s_corp);
  const state = typeof f.state_code === "string" && /^[A-Z]{2}$/.test(f.state_code) ? f.state_code : null;
  const election = bool(f.state_pte_election_form);
  const evidence = {
    standard_deduction: standard,
    salt_sch_a_capped: salt,
    k1_partnership: bool(f.k1_partnership),
    s_corp: bool(f.s_corp),
    state_code: state,
    state_pte_election_form: election,
  };
  const pathPSignal = bool(f.py_k1_partnership)
    || bool(f.py_standard_deduction)
    || bool(f.py_salt_sch_a_capped)
    || typeof f.py_state_code === "string";
  if (f.packet_path === "P") {
    return row("N32", "silent", null, pathPSignal
      ? "Path P is look-forward only. Docs needed: the current-year state PTE or BAIT election. A missing election on the filed prior year is closed history"
      : "No pass-through income or state identifier", evidence);
  }
  if (!state) return row("N32", "silent", null, "No state identifier", evidence);
  if (!pte) return row("N32", "silent", null, "No pass-through income", evidence);
  if (!(standard || salt)) {
    return row("N32", "silent", null, "Standard deduction or a capped state-and-local line is not on the packet", evidence);
  }
  if (election) return row("N32", "silent", null, "State PTE or BAIT election form is already in the packet", evidence);
  return row("N32", "Medium", "tray-skim", "Pass-through income with a standard deduction or capped state-and-local line, and the state PTE or BAIT election form is missing or incomplete", evidence);
}

function scoreNiitDisposition(f) {
  const magi = explicitMoney(pick(f, "magi"));
  const status = pick(f, "filing_status");
  const floor = niitFloor(status);
  const over = magi != null && floor != null && magi > floor;
  const schD = bool(pick(f, "form_4797_or_sch_d_disposition"));
  const pte = bool(pick(f, "passthrough_interest_disposition"));
  const prop = bool(pick(f, "prop_reg_1411_7_position"));
  const computed = bool(pick(f, "form_8960"));
  const evidence = {
    magi,
    filing_status: typeof status === "string" ? status : null,
    magi_floor: floor,
    form_8960: computed,
    form_4797_or_sch_d_disposition: schD,
    passthrough_interest_disposition: pte,
    prop_reg_1411_7_position: prop,
  };
  if (!over) {
    return row("N34", "silent", null, floor == null
      ? "Filing status or MAGI is missing, so the section 1411 floor is not applied"
      : "MAGI is not over the section 1411 threshold, or there is no MAGI figure", evidence);
  }
  if (pte || (schD && !computed) || (schD && prop)) {
    return row("N34", "Medium", "tray-skim", "A disposition or look-through gap is over the section 1411 threshold. Prop. Reg. section 1.1411-7 is proposed", evidence);
  }
  if (computed) {
    return row("N34", "silent", null, "Form 8960 already computes NIIT and there is no disposition or look-through gap", evidence);
  }
  return row("N34", "silent", null, "No disposition or look-through gap", evidence);
}

export function scoreAll(fields) {
  const f = fields || {};
  const out = [];
  const qbi = f.qbi_fields || {};
  const { adds, taken } = bonusParts(f);
  const dist = num(f.distributions);
  const officer = num(f.officer_w2);
  const se = num(f.se_income);
  const earned = num(f.earned_income);
  const retirement = f.retirement_deduction;
  const retirementIsZero = retirement === 0;
  const priorChar = num(f.prior_year_sch_a_charitable);
  const basis = num(f.building_basis);
  const hours = f.hours_log_rep;

  if (qbiMathGap(f)) {
    out.push(row("1", "High", "second-eye", "QBI math gap. SSTB does not decide the band.", {
      qbi_income: num(qbi.qbi_income),
      tentative_deduction: num(qbi.tentative_deduction),
      deduction_taken: num(qbi.deduction_taken),
      sstb: bool(qbi.sstb),
    }));
  } else {
    out.push(row("1", "silent", null, bool(qbi.sstb)
      ? "SSTB is a gate only and there is no QBI math gap"
      : "No QBI math gap", {
      qbi_income: num(qbi.qbi_income),
      deduction_taken: num(qbi.deduction_taken),
      tentative_deduction: num(qbi.tentative_deduction),
      sstb: bool(qbi.sstb),
    }));
  }

  if (bool(f.s_corp) && dist >= STUB_FLOORS.minDistributions && officer <= STUB_FLOORS.nearZeroOfficerW2) {
    out.push(row("2", "High", "second-eye", "Distributions with near-zero officer W-2", {
      s_corp: true,
      distributions: dist,
      officer_w2: officer,
    }));
  } else {
    out.push(row("2", "silent", null, "S corporation distributions and near-zero officer W-2 are not both present", {
      s_corp: bool(f.s_corp),
      distributions: dist,
      officer_w2: officer,
    }));
  }

  out.push(scoreScorpConversion(f));

  if (se > STUB_FLOORS.seIncome && retirementIsZero) {
    out.push(row("3", "High", "one-pass", "Self-employment income is above the floor and the retirement deduction is zero", {
      se_income: se,
      retirement_deduction: retirement,
    }));
  } else {
    out.push(row("3", "silent", null, retirement != null && retirement !== 0
      ? "Retirement deduction is not exactly zero"
      : "Self-employment income is not above the floor, or the retirement line is unknown", {
      se_income: se,
      retirement_deduction: retirement ?? null,
    }));
  }

  if (earned > STUB_FLOORS.cbEarnedIncome && retirementIsZero) {
    out.push(row("3b", "Medium", "tray-skim", "Earned income is above the cash-balance floor and the retirement deduction is zero", {
      earned_income: earned,
      retirement_deduction: retirement,
    }));
  } else {
    out.push(row("3b", "silent", null, "Cash-balance floor is not met, or a retirement deduction is present", {
      earned_income: earned,
      retirement_deduction: retirement ?? null,
    }));
  }

  if (bool(f.form_2210_underpay)) {
    out.push(row("4", "High", "one-pass", "Form 2210 underpayment math", { form_2210_underpay: true }));
  } else {
    out.push(row("4", "silent", null, "No Form 2210 underpayment math", { form_2210_underpay: false }));
  }

  const bunch = bool(f.charitable_sch_a)
    || bool(f.form_8283)
    || (bool(f.standard_deduction) && priorChar >= STUB_FLOORS.priorYearCharitable);
  if (bunch) {
    out.push(row("5", "Medium", "tray-skim", "Charitable bunching signal", {
      charitable_sch_a: bool(f.charitable_sch_a),
      form_8283: bool(f.form_8283),
      standard_deduction: bool(f.standard_deduction),
      prior_year_sch_a_charitable: priorChar,
    }));
  } else {
    out.push(row("5", "silent", null, "No Schedule A charitable, Form 8283, or two-year bunching marker", {
      prior_year_sch_a_charitable: priorChar,
      standard_deduction: bool(f.standard_deduction),
    }));
  }

  if (bool(f.age_70_5) && bool(f.ira_or_1099r) && charitablePattern(f)) {
    out.push(row("5b", "Medium", "tray-skim", "Age, IRA or Form 1099-R, and a charitable pattern", {
      age_70_5: true,
      ira_or_1099r: true,
      charitable_pattern: true,
    }));
  } else {
    out.push(row("5b", "silent", null, "QCD inputs are incomplete", {
      age_70_5: bool(f.age_70_5),
      ira_or_1099r: bool(f.ira_or_1099r),
      charitable_pattern: charitablePattern(f),
    }));
  }

  if (bool(f.wash_8949) || bool(f.sch_d_loss_room)) {
    out.push(row("6", "High", "one-pass", "Wash sale on Form 8949 or Schedule D loss room", {
      wash_8949: bool(f.wash_8949),
      sch_d_loss_room: bool(f.sch_d_loss_room),
    }));
  } else {
    out.push(row("6", "silent", null, "No wash sale and no Schedule D loss room. Missing lots are not a harvest flag", {
      wash_8949: false,
      sch_d_loss_room: false,
      lots_missing: bool(f.lots_missing),
    }));
  }

  if (bool(f.form_8582_suspended) && bool(f.cy_passive_income)) {
    out.push(row("7", "High", "second-eye", "Suspended passive loss and current-year passive income", {
      form_8582_suspended: true,
      cy_passive_income: true,
    }));
  } else {
    out.push(row("7", "silent", null, "Form 8582 absorb pair is not both present", {
      form_8582_suspended: bool(f.form_8582_suspended),
      cy_passive_income: bool(f.cy_passive_income),
    }));
  }

  if (bool(f.form_8582_suspended) && bool(f.multiple_passive_activities)) {
    out.push(row("7b", "Medium", "tray-skim", "Form 8582 with multiple activities. This pass does not raise grouping to must-review", {
      form_8582_suspended: true,
      multiple_passive_activities: true,
      prior_grouping_election: bool(f.prior_grouping_election),
    }));
  } else {
    out.push(row("7b", "silent", null, "Grouping tray inputs are incomplete", {
      form_8582_suspended: bool(f.form_8582_suspended),
      multiple_passive_activities: bool(f.multiple_passive_activities),
    }));
  }

  const hoSignal = bool(f.form_8829) || bool(f.ho_context);
  if (businessReturn(f) && hoSignal && !bool(f.ho_8829_complete_no_gap)) {
    out.push(row("8a", "Medium", "tray-skim", "Home-office form or context on Schedule C or an S corporation", {
      schedule_c: bool(f.schedule_c),
      s_corp: bool(f.s_corp),
      form_8829: bool(f.form_8829),
      ho_context: bool(f.ho_context),
    }));
  } else if (businessReturn(f) && bool(f.ho_8829_complete_no_gap)) {
    out.push(row("8a", "silent", null, "Form 8829 is complete with no gap", { ho_8829_complete_no_gap: true }));
  } else if (!businessReturn(f) && (bool(f.home_ownership_doc) || bool(f.form_8829) || bool(f.ho_context))) {
    out.push(row("8a", "silent", null, "Ownership alone, or Form 8829 without Schedule C or an S corporation, stays silent", {
      home_ownership_doc: bool(f.home_ownership_doc),
      form_8829: bool(f.form_8829),
      k1_only: bool(f.k1_only),
    }));
  } else {
    out.push(row("8a", "silent", null, "Schedule C or S corporation plus home-office form or context is not present", {
      form_8829: bool(f.form_8829),
      ho_context: bool(f.ho_context),
    }));
  }

  if (bool(f.w2_unreimbursed_only)) {
    out.push(row("8b", "silent", null, "W-2 unreimbursed expenses alone stay silent", {
      w2_unreimbursed_only: true,
      vehicle_signal: bool(f.vehicle_signal),
    }));
  } else if ((businessReturn(f) || bool(f.has_business)) && bool(f.vehicle_signal)) {
    out.push(row("8b", "Medium", "tray-skim", "Business activity and a vehicle signal", {
      has_business: true,
      vehicle_signal: true,
      schedule_c: bool(f.schedule_c),
      s_corp: bool(f.s_corp),
    }));
  } else {
    out.push(row("8b", "silent", null, "Business plus a vehicle signal is not present", {
      vehicle_signal: bool(f.vehicle_signal),
      has_business: bool(f.has_business),
    }));
  }

  if (little179(f) && bool(f.ti_absorbs)) {
    out.push(row("9", "High", "second-eye", "Material additions, little section 179 or bonus, and taxable income that absorbs", {
      adds_cost: adds,
      amount_taken: taken,
      ti_absorbs: true,
    }));
  } else if (little179(f) && !bool(f.ti_absorbs)) {
    out.push(row("9", "silent", null, "Taxable income does not clearly absorb. Thin TI stays silent", {
      adds_cost: adds,
      amount_taken: taken,
      ti_absorbs: false,
    }));
  } else {
    out.push(row("9", "silent", null, "Material additions with little section 179 or bonus are not present", {
      adds_cost: adds,
      amount_taken: taken,
      ti_absorbs: bool(f.ti_absorbs),
    }));
  }

  if (bool(f.hsa_w2_8889_mismatch)) {
    out.push(row("11", "High", "one-pass", "W-2 and Form 8889 mismatch", { hsa_w2_8889_mismatch: true }));
  } else {
    out.push(row("11", "silent", null, "No W-2 / Form 8889 mismatch", { hsa_w2_8889_mismatch: false }));
  }

  const eduHigh = bool(f.edu_credit_gap) && bool(f.form_1098t);
  const ctcHigh = bool(f.ctc_odc_gap);
  if (ctcHigh || eduHigh) {
    out.push(row("12", "High", "one-pass", "Dependent-credit gap, or education items with Form 1098-T in the packet", {
      ctc_odc_gap: ctcHigh,
      edu_credit_gap: bool(f.edu_credit_gap),
      form_1098t: bool(f.form_1098t),
    }));
  } else if (bool(f.edu_credit_gap) && !bool(f.form_1098t)) {
    out.push(row("12", "silent", null, "Education items without Form 1098-T stay silent", {
      edu_credit_gap: true,
      form_1098t: false,
      ctc_odc_gap: false,
    }));
  } else {
    out.push(row("12", "silent", null, "No CTC/ODC gap and no Form 1098-T education pair", {
      ctc_odc_gap: false,
      form_1098t: bool(f.form_1098t),
    }));
  }

  if (basis > 0 && costSegWindow(f) && !bool(f.prior_cost_seg)) {
    out.push(row("13", "High", "second-eye", "Building basis, recent placed-in-service or remodel, no prior cost-segregation study", {
      building_basis: basis,
      pis_or_remodel_year: f.pis_or_remodel_year,
      tax_year: f.tax_year,
      prior_cost_seg: false,
    }));
  } else {
    let why = "Cost-segregation floor is not met";
    if (basis <= 0) why = "No depreciable building basis";
    else if (bool(f.prior_cost_seg)) why = "A prior cost-segregation study is already in the packet";
    else if (!costSegWindow(f)) why = "Placed-in-service or remodel year is outside the last three tax years";
    out.push(row("13", "silent", null, why, {
      building_basis: basis,
      pis_or_remodel_year: f.pis_or_remodel_year ?? null,
      prior_cost_seg: bool(f.prior_cost_seg),
    }));
  }

  if (businessReturn(f) && bool(f.home_ownership_doc)) {
    out.push(row("14", "High", "second-eye", "Schedule C or S corporation with a home-ownership document", {
      schedule_c: bool(f.schedule_c),
      s_corp: bool(f.s_corp),
      home_ownership_doc: true,
      home_ownership_source: f.home_ownership_source,
    }));
  } else if (bool(f.k1_only)) {
    out.push(row("14", "silent", null, "K-1 alone does not open Augusta", {
      k1_only: true,
      home_ownership_doc: bool(f.home_ownership_doc),
      ownership_rejected_as_8829: bool(f.ownership_rejected_as_8829),
    }));
  } else {
    out.push(row("14", "silent", null, "Schedule C or S corporation plus an ownership document other than Form 8829 is not present", {
      schedule_c: bool(f.schedule_c),
      s_corp: bool(f.s_corp),
      home_ownership_doc: bool(f.home_ownership_doc),
      form_8829: bool(f.form_8829),
      ownership_rejected_as_8829: bool(f.ownership_rejected_as_8829),
    }));
  }

  if (businessReturn(f) && childForHire(f)) {
    out.push(row("15", "High", "second-eye", "Schedule C or S corporation with a child or grandchild dependent", {
      schedule_c: bool(f.schedule_c),
      s_corp: bool(f.s_corp),
      child_dependent: bool(f.child_dependent),
      dependent_relationship: f.dependent_relationship,
      dependent_ages: Array.isArray(f.dependent_ages) ? f.dependent_ages : [],
    }));
  } else {
    out.push(row("15", "silent", null, "Schedule C or S corporation plus a child or grandchild is not both present", {
      schedule_c: bool(f.schedule_c),
      s_corp: bool(f.s_corp),
      child_dependent: bool(f.child_dependent),
      dependent_relationship: f.dependent_relationship,
    }));
  }

  const refund = num(f.large_refund);
  if (refund >= STUB_FLOORS.largeRefund || estimatesFarAboveTax(f)) {
    out.push(row("16", "Medium", "tray-skim", "Large refund or estimates well above tax", {
      large_refund: refund,
      estimates_paid: num(f.estimates_paid),
      total_tax: num(f.total_tax),
    }));
  } else {
    out.push(row("16", "silent", null, "Refund and estimates are outside the cash-drag range. Underpayment stays on type 4", {
      large_refund: refund,
      estimates_paid: num(f.estimates_paid),
      total_tax: num(f.total_tax),
    }));
  }

  if (bool(f.state_returns_mismatch)) {
    out.push(row("17", "High", "one-pass", "State returns in the packet show a mismatch", {
      state_returns_mismatch: true,
      multi_state_signal: bool(f.multi_state_signal),
    }));
  } else if (bool(f.multi_state_signal)) {
    out.push(row("17", "Medium", "tray-skim", "Multi-state signal without a state-return mismatch in the packet", {
      multi_state_signal: true,
      state_returns_mismatch: false,
    }));
  } else {
    out.push(row("17", "silent", null, "No multi-state signal", { multi_state_signal: false }));
  }

  const hoursOk = typeof hours === "number" && hours >= STUB_FLOORS.repHours;
  if (hoursOk && bool(f.sch_e_re_loss)) {
    out.push(row("18", "High", "second-eye", "Hours log at or above 750 and Schedule E real-estate losses", {
      hours_log_rep: hours,
      sch_e_re_loss: true,
    }));
  } else {
    out.push(row("18", "silent", null, hours == null
      ? "No hours log. REP has no Medium fallback"
      : "REP hours and Schedule E real-estate losses are not both in range. No Medium fallback", {
      hours_log_rep: hours ?? null,
      sch_e_re_loss: bool(f.sch_e_re_loss),
    }));
  }

  if (businessReturn(f) && bool(f.sehi_gap)) {
    out.push(row("19", "Medium", "tray-skim", "SEHI blank or under premiums on Schedule C or an S corporation", {
      sehi_gap: true,
      schedule_c: bool(f.schedule_c),
      s_corp: bool(f.s_corp),
    }));
  } else {
    out.push(row("19", "silent", null, "SEHI gap on Schedule C or an S corporation is not present", {
      sehi_gap: bool(f.sehi_gap),
    }));
  }

  const careDocs = bool(f.care_docs_or_fsa);
  if (kidsOnReturn(f) && careDocs && bool(f.form_2441_gap)) {
    out.push(row("20", "High", "one-pass", "Form 2441 is incomplete against care documents", {
      form_2441_gap: true,
      care_docs_or_fsa: true,
      child_dependent: bool(f.child_dependent),
      dependents_on_return: bool(f.dependents_on_return),
    }));
  } else if (kidsOnReturn(f) && careDocs) {
    out.push(row("20", "Medium", "tray-skim", "Children plus care documents or an FSA, and Form 2441 is not incomplete", {
      form_2441_gap: false,
      care_docs_or_fsa: true,
      child_dependent: bool(f.child_dependent),
    }));
  } else {
    out.push(row("20", "silent", null, "Children and care documents are not both present", {
      form_2441_gap: bool(f.form_2441_gap),
      care_docs_or_fsa: careDocs,
    }));
  }

  if (bool(f.form_5695) || bool(f.residential_energy_docs)) {
    out.push(row("21", "Medium", "tray-skim", "Form 5695 or residential energy documents", {
      form_5695: bool(f.form_5695),
      residential_energy_docs: bool(f.residential_energy_docs),
    }));
  } else {
    out.push(row("21", "silent", null, "No Form 5695 or residential energy documents", {
      form_5695: false,
      residential_energy_docs: false,
    }));
  }

  if (bool(f.form_6765_or_rd_study)) {
    out.push(row("22", "Medium", "tray-skim", "Form 6765 or an R&D study is in the packet", {
      form_6765_or_rd_study: true,
    }));
  } else {
    out.push(row("22", "silent", null, bool(f.tech_sch_c_wages_only)
      ? "Technology Schedule C and wages, without Form 6765 or a study, stay silent"
      : "No Form 6765 or R&D study", {
      tech_sch_c_wages_only: bool(f.tech_sch_c_wages_only),
      form_6765_or_rd_study: false,
    }));
  }

  if (bool(f.nua_employer_plan_1099r) && bool(f.nua_company_stock)) {
    out.push(row("23", "Medium", "tray-skim", "Employer-plan Form 1099-R and a company-stock signal", {
      nua_employer_plan_1099r: true,
      nua_company_stock: true,
    }));
  } else {
    out.push(row("23", "silent", null, "NUA needs both an employer-plan Form 1099-R and company stock", {
      nua_employer_plan_1099r: bool(f.nua_employer_plan_1099r),
      nua_company_stock: bool(f.nua_company_stock),
    }));
  }

  if (bool(f.trad_ira_or_401k) && bool(f.low_ti_year)) {
    out.push(row("24", "Medium", "tray-skim", "Traditional IRA or 401(k) and a low taxable-income year signal", {
      trad_ira_or_401k: true,
      low_ti_year: true,
    }));
  } else {
    out.push(row("24", "silent", null, "Traditional IRA or 401(k) and a low-income year are not both present", {
      trad_ira_or_401k: bool(f.trad_ira_or_401k),
      low_ti_year: bool(f.low_ti_year),
    }));
  }

  if (bool(f.qsbs_c_corp_disposal) && bool(f.qsbs_five_year_or_explicit)) {
    out.push(row("25", "Medium", "tray-skim", "C corporation stock disposal with QSBS or a five-year note in the documents", {
      qsbs_c_corp_disposal: true,
      qsbs_five_year_or_explicit: true,
    }));
  } else {
    out.push(row("25", "silent", null, bool(f.entity_vibe_only)
      ? "Entity label alone stays silent"
      : "QSBS disposal plus a five-year or explicit QSBS note is not present", {
      entity_vibe_only: bool(f.entity_vibe_only),
      qsbs_c_corp_disposal: bool(f.qsbs_c_corp_disposal),
      qsbs_five_year_or_explicit: bool(f.qsbs_five_year_or_explicit),
    }));
  }

  if (bool(f.form_6252) || bool(f.form_8824) || bool(f.large_re_gain_no_1031)) {
    out.push(row("26", "Medium", "tray-skim", "Form 6252, Form 8824, or a large Schedule D real-estate gain without either", {
      form_6252: bool(f.form_6252),
      form_8824: bool(f.form_8824),
      large_re_gain_no_1031: bool(f.large_re_gain_no_1031),
    }));
  } else {
    out.push(row("26", "silent", null, "No Form 6252, Form 8824, or large real-estate gain without those forms", {
      form_6252: false,
      form_8824: false,
      large_re_gain_no_1031: false,
    }));
  }

  out.push(scoreForeignTaxCredit(f));
  out.push(scoreForeignAccount(f));
  out.push(scoreSafeHarbor(f));
  out.push(scorePartnershipExit(f));
  out.push(scoreBackdoorRoth(f));
  out.push(scoreStatePte(f));
  out.push(scoreNiitDisposition(f));

  return out;
}

export function presentable(results) {
  return results.filter((item) => item.band === "High" || item.band === "Medium");
}

export function byTypeOrder(results) {
  return [...results].sort((a, b) => TYPE_ORDER.indexOf(a.typeId) - TYPE_ORDER.indexOf(b.typeId));
}

export function bandOf(results, typeId) {
  const found = results.find((item) => item.typeId === typeId);
  return found ? found.band : "silent";
}

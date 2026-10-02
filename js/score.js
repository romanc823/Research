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
 */
export const TYPE_2B_LOCK = {
  seIncome: 100_000,
  rcGap: 25_000,
};

export const TYPE_ORDER = [
  "1", "2", "2b", "3", "3b", "4", "5", "5b", "6", "7", "7b",
  "8a", "8b", "9", "11", "12", "13", "14", "15", "16",
  "17", "18", "19", "20", "21", "22", "23", "24", "25", "26",
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

function row(typeId, band, passTag, reason, evidence) {
  const lane = band === "High" ? "must-review" : band === "Medium" ? "optional-tray" : "silent";
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
 */
function scoreScorpConversion(f) {
  const se = explicitMoney(f.se_income);
  const rcRaw = explicitMoney(f.planning_rc);
  const rc = rcRaw != null && rcRaw >= 0 ? rcRaw : null;
  const scheduleC = bool(f.schedule_c) || formsMatch(f, /\bschedule\s*c\b/i);
  const alreadyS = bool(f.s_corp) || formsMatch(f, /1120\s*-?\s*s\b/i);
  const partnership = bool(f.k1_only) || formsMatch(f, /\b1065\b/);
  const seForm = formsMatch(f, /\bschedule\s*se\b/i);
  const gap = se != null && rc != null ? se - rc : null;
  const evidence = {
    schedule_c: scheduleC,
    se_income: se,
    planning_rc: rc,
    one_year_spike: bool(f.one_year_spike),
    s_corp: bool(f.s_corp),
    form_1120s: formsMatch(f, /1120\s*-?\s*s\b/i),
    multi_owner_1065: formsMatch(f, /\b1065\b/),
    k1_only: bool(f.k1_only),
    schedule_se: se != null || seForm,
  };

  let silentReason = null;
  if (alreadyS) silentReason = "Already an S corporation or Form 1120-S is in the packet";
  else if (partnership) silentReason = "Multi-owner Form 1065 or K-1 only";
  else if (!scheduleC && se == null && !seForm) silentReason = "W-2 only, with no Schedule C and no Schedule SE";
  else if (!scheduleC) silentReason = "Schedule C is not in the packet";
  else if (se == null) silentReason = "Schedule SE income is missing and is not treated as zero";
  else if (se <= 0) silentReason = "Loss or near-zero self-employment profit";

  const atFloor = se != null && se >= TYPE_2B_LOCK.seIncome;
  const atGap = gap != null && gap >= TYPE_2B_LOCK.rcGap;
  if (!silentReason && (atFloor || atGap)) {
    return row("2b", "High", "second-eye", atFloor
      ? "Schedule SE income is at the locked floor"
      : "Explicit compensation gap is at the locked gap", evidence);
  }
  if (!silentReason) {
    silentReason = "Schedule SE income is under the locked floor and the compensation gap is under the locked gap";
  }
  return row("2b", "silent", null, silentReason, evidence);
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

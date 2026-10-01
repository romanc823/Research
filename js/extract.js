/**
 * Extract layer: fields only.
 * No narrative, no present-copy, no band. Unknown inputs stay empty
 * rather than being invented. Omitted retirement_deduction stays null
 * so a missing line is not treated as a literal zero.
 */

export const FIELD_KEYS = [
  "tax_year",
  "schedule_c",
  "s_corp",
  "k1_only",
  "has_business",
  "home_ownership_doc",
  "home_ownership_source",
  "ownership_rejected_as_8829",
  "building_basis",
  "pis_or_remodel_year",
  "prior_cost_seg",
  "dependents_on_return",
  "child_dependent",
  "dependent_relationship",
  "dependent_ages",
  "retirement_deduction",
  "se_income",
  "earned_income",
  "officer_w2",
  "distributions",
  "qbi_fields",
  "form_2210_underpay",
  "wash_8949",
  "sch_d_loss_room",
  "lots_missing",
  "form_8582_suspended",
  "cy_passive_income",
  "multiple_passive_activities",
  "prior_grouping_election",
  "section_179_bonus",
  "ti_absorbs",
  "hsa_w2_8889_mismatch",
  "ctc_odc_gap",
  "edu_credit_gap",
  "form_1098t",
  "hours_log_rep",
  "sch_e_re_loss",
  "charitable_sch_a",
  "charitable_sch_a_amount",
  "form_8283",
  "standard_deduction",
  "prior_year_sch_a_charitable",
  "age",
  "age_70_5",
  "ira_or_1099r",
  "charitable_pattern",
  "form_8829",
  "ho_context",
  "ho_8829_complete_no_gap",
  "vehicle_signal",
  "w2_unreimbursed_only",
  "large_refund",
  "estimates_paid",
  "total_tax",
  "multi_state_signal",
  "state_returns_mismatch",
  "sehi_gap",
  "form_2441_gap",
  "care_docs_or_fsa",
  "form_5695",
  "residential_energy_docs",
  "form_6765_or_rd_study",
  "tech_sch_c_wages_only",
  "nua_signal",
  "nua_employer_plan_1099r",
  "nua_company_stock",
  "trad_ira_or_401k",
  "low_ti_year",
  "qsbs_signal",
  "qsbs_c_corp_disposal",
  "qsbs_five_year_or_explicit",
  "entity_vibe_only",
  "form_6252",
  "form_8824",
  "large_re_gain_no_1031",
  "forms_in_packet",
];

function asNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function asBool(value) {
  return value === true;
}

function blank179() {
  return { adds_cost: 0, amount_taken: 0 };
}

/**
 * @param {object} fixture anonymized packet
 * @returns {object} field bag only
 */
export function extractFields(fixture) {
  const src = fixture && typeof fixture.fields === "object" && fixture.fields ? fixture.fields : {};
  const scheduleC = asBool(src.schedule_c);
  const sCorp = asBool(src.s_corp);
  const k1Only = asBool(src.k1_only) && !scheduleC && !sCorp;

  const sourceRaw = typeof src.home_ownership_source === "string" ? src.home_ownership_source : null;
  const rejected8829 = sourceRaw === "8829" || sourceRaw === "form_8829";
  const allowedSource = !rejected8829 && (sourceRaw === "1098" || sourceRaw === "sch_a_mortgage" || sourceRaw === "deed");
  const homeOwnershipDoc = !rejected8829 && (asBool(src.home_ownership_doc) || allowedSource);

  const ages = Array.isArray(src.dependent_ages)
    ? src.dependent_ages.map(asNumber).filter((n) => n != null)
    : [];

  const qbiSrc = src.qbi_fields && typeof src.qbi_fields === "object" ? src.qbi_fields : {};
  const qbi = {
    qbi_income: asNumber(qbiSrc.qbi_income) ?? 0,
    tentative_deduction: asNumber(qbiSrc.tentative_deduction) ?? 0,
    deduction_taken: asNumber(qbiSrc.deduction_taken) ?? 0,
    sstb: asBool(qbiSrc.sstb),
  };

  let bonus = blank179();
  if (src.section_179_bonus && typeof src.section_179_bonus === "object") {
    bonus = {
      adds_cost: asNumber(src.section_179_bonus.adds_cost) ?? 0,
      amount_taken: asNumber(src.section_179_bonus.amount_taken) ?? 0,
    };
  } else if (src.section_179_bonus != null) {
    bonus = { adds_cost: 0, amount_taken: asNumber(src.section_179_bonus) ?? 0 };
  }

  let nuaEmployer = asBool(src.nua_employer_plan_1099r);
  let nuaStock = asBool(src.nua_company_stock);
  if (asBool(src.nua_signal) && src.nua_employer_plan_1099r == null && src.nua_company_stock == null) {
    nuaEmployer = true;
    nuaStock = true;
  }

  let qsbsDisposal = asBool(src.qsbs_c_corp_disposal);
  let qsbsFive = asBool(src.qsbs_five_year_or_explicit);
  if (asBool(src.qsbs_signal) && src.qsbs_c_corp_disposal == null && src.qsbs_five_year_or_explicit == null) {
    qsbsDisposal = true;
    qsbsFive = true;
  }
  if (asBool(src.entity_vibe_only) && !qsbsDisposal && !qsbsFive) {
    qsbsDisposal = false;
    qsbsFive = false;
  }

  const age = asNumber(src.age);
  const age705 = asBool(src.age_70_5) || (age != null && age >= 70.5);

  const forms = Array.isArray(fixture?.forms_in_packet)
    ? fixture.forms_in_packet.map((item) => String(item))
    : Array.isArray(src.forms_in_packet)
      ? src.forms_in_packet.map((item) => String(item))
      : [];

  const fields = {
    tax_year: asNumber(fixture?.tax_year) ?? asNumber(src.tax_year),
    schedule_c: scheduleC,
    s_corp: sCorp,
    k1_only: k1Only,
    has_business: asBool(src.has_business) || scheduleC || sCorp,
    home_ownership_doc: homeOwnershipDoc,
    home_ownership_source: homeOwnershipDoc ? sourceRaw : null,
    ownership_rejected_as_8829: rejected8829,
    building_basis: asNumber(src.building_basis) ?? 0,
    pis_or_remodel_year: asNumber(src.pis_or_remodel_year),
    prior_cost_seg: asBool(src.prior_cost_seg),
    dependents_on_return: asBool(src.dependents_on_return),
    child_dependent: asBool(src.child_dependent),
    dependent_relationship: typeof src.dependent_relationship === "string" ? src.dependent_relationship : null,
    dependent_ages: ages,
    retirement_deduction: asNumber(src.retirement_deduction),
    se_income: asNumber(src.se_income) ?? 0,
    earned_income: asNumber(src.earned_income) ?? 0,
    officer_w2: asNumber(src.officer_w2) ?? 0,
    distributions: asNumber(src.distributions) ?? 0,
    qbi_fields: qbi,
    form_2210_underpay: asBool(src.form_2210_underpay),
    wash_8949: asBool(src.wash_8949),
    sch_d_loss_room: asBool(src.sch_d_loss_room),
    lots_missing: asBool(src.lots_missing),
    form_8582_suspended: asBool(src.form_8582_suspended),
    cy_passive_income: asBool(src.cy_passive_income),
    multiple_passive_activities: asBool(src.multiple_passive_activities),
    prior_grouping_election: asBool(src.prior_grouping_election),
    section_179_bonus: bonus,
    ti_absorbs: asBool(src.ti_absorbs),
    hsa_w2_8889_mismatch: asBool(src.hsa_w2_8889_mismatch),
    ctc_odc_gap: asBool(src.ctc_odc_gap),
    edu_credit_gap: asBool(src.edu_credit_gap),
    form_1098t: asBool(src.form_1098t),
    hours_log_rep: asNumber(src.hours_log_rep),
    sch_e_re_loss: asBool(src.sch_e_re_loss),
    charitable_sch_a: asBool(src.charitable_sch_a),
    charitable_sch_a_amount: asNumber(src.charitable_sch_a_amount) ?? 0,
    form_8283: asBool(src.form_8283),
    standard_deduction: asBool(src.standard_deduction),
    prior_year_sch_a_charitable: asNumber(src.prior_year_sch_a_charitable) ?? 0,
    age,
    age_70_5: age705,
    ira_or_1099r: asBool(src.ira_or_1099r),
    charitable_pattern: asBool(src.charitable_pattern),
    form_8829: asBool(src.form_8829),
    ho_context: asBool(src.ho_context),
    ho_8829_complete_no_gap: asBool(src.ho_8829_complete_no_gap),
    vehicle_signal: asBool(src.vehicle_signal),
    w2_unreimbursed_only: asBool(src.w2_unreimbursed_only),
    large_refund: asNumber(src.large_refund) ?? 0,
    estimates_paid: asNumber(src.estimates_paid) ?? 0,
    total_tax: asNumber(src.total_tax) ?? 0,
    multi_state_signal: asBool(src.multi_state_signal),
    state_returns_mismatch: asBool(src.state_returns_mismatch),
    sehi_gap: asBool(src.sehi_gap),
    form_2441_gap: asBool(src.form_2441_gap),
    care_docs_or_fsa: asBool(src.care_docs_or_fsa),
    form_5695: asBool(src.form_5695),
    residential_energy_docs: asBool(src.residential_energy_docs),
    form_6765_or_rd_study: asBool(src.form_6765_or_rd_study),
    tech_sch_c_wages_only: asBool(src.tech_sch_c_wages_only),
    nua_employer_plan_1099r: nuaEmployer,
    nua_company_stock: nuaStock,
    nua_signal: nuaEmployer && nuaStock,
    trad_ira_or_401k: asBool(src.trad_ira_or_401k),
    low_ti_year: asBool(src.low_ti_year),
    qsbs_c_corp_disposal: qsbsDisposal,
    qsbs_five_year_or_explicit: qsbsFive,
    qsbs_signal: qsbsDisposal && qsbsFive,
    entity_vibe_only: asBool(src.entity_vibe_only),
    form_6252: asBool(src.form_6252),
    form_8824: asBool(src.form_8824),
    large_re_gain_no_1031: asBool(src.large_re_gain_no_1031),
    forms_in_packet: forms,
  };

  for (const key of FIELD_KEYS) {
    if (!(key in fields)) fields[key] = null;
  }

  return fields;
}

export function assertFieldsOnly(fields) {
  const extra = Object.keys(fields).filter((key) => !FIELD_KEYS.includes(key));
  const prose = Object.entries(fields).filter(([, value]) => {
    return typeof value === "string" && value.length > 80;
  });
  return { extra, prose };
}

/**
 * Present layer. Fixed strings only — no model prose.
 * Order for ordinary cards: signal → docs → gate → next.
 * Types 14 and 15 use the locked hold-for-planner lines and nothing else.
 * Talk bans apply to every string this module returns.
 */

export const FIXED_COPY = {
  14: "Augusta possible — hold for planner.",
  15: "Hire-kids possible — hold for planner.",
};

const BANNED = [
  { re: /you should/i, label: "you should" },
  { re: /qualify for/i, label: "qualify for" },
  { re: /\bqualifies\b/i, label: "qualifies" },
  { re: /\brecommend\b/i, label: "recommend" },
  { re: /guaranteed/i, label: "guaranteed" },
  { re: /\bbest strategy\b/i, label: "best strategy" },
  { re: /save\s*\$/i, label: "save $" },
  { re: /\$\s?\d/, label: "dollar amount" },
  { re: /will save/i, label: "will save" },
  { re: /tax savings/i, label: "tax savings" },
  { re: /you(?:'ll| will)\b/i, label: "you will" },
];

export function findTalkBan(copy) {
  if (!copy) return null;
  for (const rule of BANNED) {
    if (rule.re.test(copy)) return rule.label;
  }
  return null;
}

function line(signal, docs, gate, next) {
  return `Signal: ${signal} Docs: ${docs} Gate: ${gate} Next: ${next}`;
}

const TEMPLATES = {
  1(_hit, fields) {
    const sstb = fields.qbi_fields && fields.qbi_fields.sstb === true;
    const gate = sstb
      ? "SSTB status is a planner gate and does not raise confidence."
      : "SSTB was not indicated. If it were, it would be a planner gate only and would not raise confidence.";
    return line(
      "the tentative QBI deduction is above the deduction taken on the return.",
      "Form 8995 or Form 8995-A, with Schedule C, Schedule E, or K-1 as applicable.",
      gate,
      "hold for planner review.",
    );
  },
  2() {
    return line(
      "S corporation distributions are present and officer W-2 wages are near zero.",
      "Form 1120-S officer wages and the distribution lines.",
      "reasonable-compensation judgment stays with the planner.",
      "hold for planner review.",
    );
  },
  "2b"() {
    return line(
      "Schedule SE income is at the locked floor, or it is in the compensation band with an explicit compensation figure and a locked gap.",
      "Schedule C or Schedule SE.",
      "an S corporation, Form 1120-S, a multi-owner Form 1065, K-1 only, a loss, near-zero profit, or missing Schedule SE stays silent. Income under the compensation band stays silent even with a compensation figure. Income in that band stays silent without an explicit compensation figure or without the locked gap. Wages with no Schedule C, no Schedule SE, and no self-employment income stay silent. A one-year spike does not silence this check. SSTB does not raise confidence. This check does not order the retirement-deduction review.",
      "hold for planner review.",
    );
  },
  3() {
    return line(
      "self-employment income is above the research floor and the retirement deduction is zero.",
      "Schedule SE, Schedule 1, and the business return.",
      "no retirement-plan product is selected in this pass.",
      "hold for planner review.",
    );
  },
  "3b"() {
    return line(
      "earned income is above the cash-balance research floor and the retirement deduction is zero.",
      "the earned-income lines and Schedule 1.",
      "no plan product is selected, and this pass keeps the item on the optional tray.",
      "optional tray for planner review.",
    );
  },
  4() {
    return line(
      "Form 2210 underpayment math is in the packet.",
      "Form 2210.",
      "the flag is underpayment math only.",
      "hold for planner review.",
    );
  },
  5() {
    return line(
      "Schedule A charitable contributions, Form 8283, or a standard deduction with prior-year Schedule A charitable at the two-year marker.",
      "Schedule A, Form 8283, or the prior-year Schedule A charitable line.",
      "this tray item is never a must-review flag.",
      "optional tray for planner review.",
    );
  },
  "5b"() {
    return line(
      "the filer is at least age 70 and a half, an IRA or Form 1099-R is in the packet, and a charitable pattern is present.",
      "Form 1099-R or IRA records, and the charitable lines.",
      "age, the account, and a charitable pattern are all required.",
      "optional tray for planner review.",
    );
  },
  6() {
    return line(
      "a wash sale is marked on Form 8949, or Schedule D shows loss room.",
      "Form 8949 and Schedule D.",
      "a gain with missing lots is not treated as a harvest.",
      "hold for planner review.",
    );
  },
  7() {
    return line(
      "Form 8582 shows a suspended passive loss and the current year has passive income.",
      "Form 8582 and Schedule E.",
      "activity grouping is not a must-review flag without prior election documents.",
      "hold for planner review.",
    );
  },
  "7b"() {
    return line(
      "Form 8582 is present with more than one passive activity.",
      "the Form 8582 activity list.",
      "prior election documents do not raise this above the optional tray in this pass.",
      "optional tray for planner review.",
    );
  },
  "8a"() {
    return line(
      "a Schedule C or S corporation has Form 8829 or explicit home-office context, and Form 8829 is not a complete no-gap filing.",
      "Form 8829 or the home-office note in the packet.",
      "a complete Form 8829 with no gap stays silent, and ownership alone stays silent.",
      "optional tray for planner review.",
    );
  },
  "8b"() {
    return line(
      "the packet has a business activity and a vehicle signal.",
      "Form 4562 vehicle, Schedule C car, or mileage context.",
      "W-2 unreimbursed expenses alone stay silent.",
      "optional tray for planner review.",
    );
  },
  9() {
    return line(
      "material asset additions have little section 179 or bonus depreciation, and taxable income can absorb more.",
      "Form 4562 and the taxable-income line.",
      "thin taxable income stays silent.",
      "hold for planner review.",
    );
  },
  11() {
    return line(
      "the HSA amount on Form W-2 does not match Form 8889.",
      "Form W-2 and Form 8889.",
      "the flag is the mismatch itself.",
      "hold for planner review.",
    );
  },
  12(_hit, fields) {
    const edu = fields.edu_credit_gap === true && fields.form_1098t === true;
    const ctc = fields.ctc_odc_gap === true;
    const signal = ctc && edu
      ? "a dependent-credit gap is on the return, and education items are paired with Form 1098-T."
      : edu
        ? "education items are paired with Form 1098-T in the packet."
        : "a child tax credit or other dependent credit gap is on the return.";
    return line(
      signal,
      "Schedule 8812 and, where education items are involved, Form 1098-T.",
      "education items without Form 1098-T in the packet stay silent.",
      "hold for planner review.",
    );
  },
  13() {
    return line(
      "depreciable building basis is present, placed-in-service or a major remodel falls in the last three tax years, and no prior cost-segregation study is in the packet.",
      "Form 4562 and the acquisition or remodel record.",
      "return on investment is a human gate, not a score input.",
      "hold for planner review.",
    );
  },
  16() {
    return line(
      "the refund is large, or estimated tax payments sit well above the tax on the return.",
      "the Form 1040 refund line and estimated-tax payments.",
      "underpayment math stays on the Form 2210 flag and is not repeated here.",
      "optional tray for planner review.",
    );
  },
  17(hit) {
    if (hit.band === "High") {
      return line(
        "state returns in the packet do not match the residency or work pattern.",
        "the state returns plus W-2 or K-1 state boxes.",
        "a mismatch on the state returns is what makes this a must-review item.",
        "hold for planner review.",
      );
    }
    return line(
      "a multi-state W-2 or K-1, or a difference between resident state and work state, is in the packet.",
      "W-2 or K-1 state boxes.",
      "without state returns showing a mismatch, this stays on the optional tray.",
      "optional tray for planner review.",
    );
  },
  18() {
    return line(
      "an hours log or hours context is at or above 750 and Schedule E shows real-estate losses.",
      "the hours log and Schedule E.",
      "missing hours stay silent, with no optional-tray fallback.",
      "hold for planner review.",
    );
  },
  19() {
    return line(
      "self-employed health insurance on a Schedule C or S corporation is blank or below premiums in the packet.",
      "the SEHI line and premium records.",
      "the comparison is blank-or-under versus premiums.",
      "optional tray for planner review.",
    );
  },
  20(hit) {
    if (hit.band === "High") {
      return line(
        "Form 2441 is incomplete against dependent-care documents in the packet.",
        "Form 2441 and care statements or FSA records.",
        "incompleteness against those documents is the must-review trigger.",
        "hold for planner review.",
      );
    }
    return line(
      "children are on the return and care documents or an FSA are in the packet.",
      "care statements or FSA records.",
      "Form 2441 is not incomplete against those documents, so this stays on the optional tray.",
      "optional tray for planner review.",
    );
  },
  21() {
    return line(
      "Form 5695 or residential energy documents are in the packet.",
      "Form 5695 or the energy invoices.",
      "presence of the form or the invoices is the tray signal.",
      "optional tray for planner review.",
    );
  },
  22() {
    return line(
      "Form 6765 or an R&D study is in the packet.",
      "Form 6765 or the study.",
      "a technology Schedule C with wages, and neither the form nor a study, stays silent.",
      "optional tray for planner review.",
    );
  },
  23() {
    return line(
      "a Form 1099-R for an employer plan and a company-stock signal are both present.",
      "Form 1099-R and the company-stock note.",
      "either input alone stays silent.",
      "optional tray for planner review.",
    );
  },
  24() {
    return line(
      "a traditional IRA or 401(k) is present in a year marked as low taxable income.",
      "IRA or 401(k) records and the taxable-income line.",
      "both the account and the low-income-year signal are required.",
      "optional tray for planner review.",
    );
  },
  25() {
    return line(
      "C corporation stock was disposed of, and a QSBS or five-year holding note is in the documents or the explicit context.",
      "the brokerage statement and the QSBS or holding-period note.",
      "an entity label alone stays silent.",
      "optional tray for planner review.",
    );
  },
  26() {
    return line(
      "Form 6252 or Form 8824 is in the packet, or Schedule D shows a large real-estate gain with neither form.",
      "Form 6252, Form 8824, or Schedule D.",
      "the flag is the form, or the gain without those forms.",
      "optional tray for planner review.",
    );
  },
  N27() {
    return line(
      "foreign tax paid is on the packet, or Form 1116 shows a carryover or both a credit form and a Schedule A foreign-tax deduction.",
      "Form 1116, Schedule 3, Schedule A when foreign tax was deducted, and the carryover schedule when present.",
      "limitation baskets, paid versus accrued, and treaty interaction stay with the reviewer.",
      "optional tray for planner review.",
    );
  },
  N28() {
    return line(
      "Schedule B Part III is Yes, and the packet also shows a Form 8938 threshold, an incomplete Form 8938, 3520, or 8621, or a PFIC or foreign-trust marker.",
      "FinCEN Form 114 when the FBAR threshold is met, plus Form 8938, Form 3520, or Form 8621 for the regime that applies. FinCEN 114 is not Form 8938.",
      "which regime applies, and whether the FBAR and Form 8938 thresholds are met, stays with the compliance reviewer.",
      "hold for compliance review.",
    );
  },
  N29() {
    return line(
      "prior-year AGI and total tax are on the packet, and current-year estimates plus withholding sit below the section 6654(d) harbor.",
      "the prior-year Form 1040 AGI and total tax, and the current-year estimate and withholding figures.",
      "the annualized-income exception and farmer or fisher rules stay with the reviewer. A same-year Form 2210 flag is not repeated here. This tray item is never a must-review flag.",
      "optional tray for planner review.",
    );
  },
  N30() {
    return line(
      "a partnership interest disposition or liquidating distribution is paired with a section 751 statement or a final Form 1065.",
      "the Schedule K-1, the section 751 statement, and the final Form 1065 when present.",
      "section 736(a) versus 736(b), and capital versus ordinary under section 751, stays with the planner. The desk does not choose the bucket.",
      "hold for planner review.",
    );
  },
  N31() {
    return line(
      "MAGI, Form 8606 or a nondeductible IRA signal, and a plan or Form W-2 after-tax signal are all on the packet.",
      "Form 8606 and the plan document or Form W-2 box 12.",
      "the pro-rata rule and step-transaction scrutiny stay with the reviewer.",
      "optional tray for planner review.",
    );
  },
  N32() {
    return line(
      "a standard deduction or a capped state-and-local line sits with pass-through income, and the state PTE or BAIT election form is missing or incomplete.",
      "the state election form, owner consents, and the K-1 or S corporation income.",
      "state election deadlines and owner consents stay with the reviewer. The federal SALT-cap interaction is an inference, not a federal election.",
      "optional tray for planner review.",
    );
  },
  N34() {
    return line(
      "MAGI is over the section 1411 threshold and a disposition or passthrough look-through gap is on the packet.",
      "Form 8960 when present, Schedule D or Form 4797, and the passthrough-interest records.",
      "Prop. Reg. §1.1411-7 is a proposed regulation. Whether to follow that proposed text stays with the reviewer. The desk does not treat it as final.",
      "optional tray for planner review.",
    );
  },
};

export function presentCopy(hit, fields) {
  if (!hit || hit.band === "silent") return null;
  if (hit.typeId === "14") return FIXED_COPY[14];
  if (hit.typeId === "15") return FIXED_COPY[15];
  const template = TEMPLATES[hit.typeId];
  if (!template) {
    throw new Error(`No present template for type ${hit.typeId}`);
  }
  const copy = template(hit, fields || {});
  const ban = findTalkBan(copy);
  if (ban) {
    throw new Error(`Talk ban "${ban}" in type ${hit.typeId}`);
  }
  return copy;
}

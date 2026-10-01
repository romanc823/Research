# Phase A taxonomy

Locked floors for the Intentional Accounting tax-planning research app. This file is the in-repo copy of the Phase A lock. The scorer in `js/score.js` follows it. It does not add opportunity types, and it does not promote a Medium floor to High.

Firm context: about 380 clients. The app takes a dropped packet (return, government documents, context) and flags items for a person to review.

Hard bans: no live client data, no e-file, no invented client facts, no pricing. Pricing is Phase 2.

## Pipeline

Drop → Ingest → Extract (fields only, no narrative) → Score → Present only on High (must-review) or Medium (optional tray). Silence below that. A human owns advice and sign-off.

See `docs/PIPELINE.md` for how the stub implements each stage.

## Present talk bans

These apply to High and Medium present copy:

- No "you should"
- No "save $X" and no other dollar savings claim
- No "guaranteed"
- No "qualify for"
- No "best strategy"
- No outcome claims

Order for ordinary present copy: signal → docs → gate → next.

Judgment types that carry a fixed hold-for-planner line:

- Type 14: `Augusta possible — hold for planner.`
- Type 15: `Hire-kids possible — hold for planner.`

## Pass tags

| Tag | Who | Target |
| --- | --- | --- |
| one-pass | Math or document Highs: 3, 4, 6, 11, 12. Document Highs 17 and 20 use the same tag in this stub. | about 3 minutes |
| second-eye | Judgment Highs: 1, 2, 7, 9, 13, 14, 15, 18 | about 5 minutes |
| tray-skim | Every Medium card | about 2 minutes |

## High — must-review

1. **QBI.** A math gap can be High. SSTB never raises confidence. SSTB is a gate only. It does not create a flag, and it does not block a math flag.
2. **S-corp reasonable compensation.** Distributions are present and officer W-2 is near zero.
3. **SEP / Solo.** Self-employment income is above the floor and the retirement deduction is exactly $0. A small ("little") deduction does not meet this floor. Present copy does not choose Solo versus SEP.
4. **2210 underpayment.** Underpayment math only. A balance due without Form 2210 math is not this flag.
6. **Wash / loss room.** A wash sale on Form 8949, or Schedule D loss room. Do not flag a harvest when the packet has no lot detail.
7. **Passive 8582 absorb.** Form 8582 shows a suspended loss and the current year has passive income. Do not make grouping a High without prior election documents. Grouping lives on 7b.
9. **§179 / bonus.** Material additions, little §179 or bonus taken, and taxable income that clearly absorbs. Thin taxable income stays silent.
11. **HSA.** W-2 and Form 8889 do not match.
12. **Dependents / education.** A CTC or ODC gap can be High. An education flag is High only when Form 1098-T is in the packet.
13. **Cost segregation.** Depreciable building basis is present (any amount), placed-in-service or a major remodel falls within the last three tax years on the return or Form 4562, and the packet has no prior cost-segregation study. ROI is a human gate, not a score. Second-eye.
14. **Augusta.** Schedule C or S corporation, and a home-ownership document: Form 1098, Schedule A mortgage interest, or a deed. Form 8829 is never an ownership document. A K-1 alone does not open this flag. Present copy is the fixed Augusta line. Cite §280A(g). Second-eye.
15. **Hire kids.** Schedule C or S corporation, and a dependent child or grandchild, or a dependent labeled child, son, or daughter. Age is optional enrichment, not a floor. Present copy is the fixed hire-kids line. Second-eye.
18. **REP.** High only when an hours log or hours context is at least 750 and Schedule E shows real-estate losses. No hours log means silent. There is no Medium fallback.

There is no type 10 or type 8 on the High list. Home office and auto are 8a and 8b on the tray.

## Medium — optional tray

5. **Charitable bunching / DAF.** Schedule A charitable, or Form 8283, or a standard deduction plus prior-year Schedule A charitable of at least $5,000 (two-year look). Never High.
5b. **QCD.** Age at least 70½, plus an IRA or Form 1099-R, plus a charitable pattern.
3b. **Cash-balance.** Earned income above the hard floor and the retirement deduction is exactly $0. Do not pick a product (cash-balance versus SEP). Never High without actuarial documents. This pass never emits High.
8a. **Home office.** Schedule C or S corporation, plus Form 8829 or explicit home-office context. A complete Form 8829 with no gap stays silent. Ownership alone stays silent.
8b. **Auto mileage.** A business activity plus a vehicle signal (Form 4562 vehicle, Schedule C car, or mileage context). W-2 unreimbursed expenses alone stay silent.
16. **Cash drag / overpay.** A large refund, or estimates well above the tax. Underpayment stays on type 4.
17. **Multi-state.** A multi-state W-2 or K-1, or resident state different from the work state. High only when state returns in the packet show a mismatch. Otherwise Medium.
7b. **Passive grouping.** Form 8582 plus more than one activity. Medium only. Never High without prior election documents. This pass does not emit High even when an election document is noted.
19. **SEHI.** Schedule C or S corporation, and self-employed health insurance is blank or under the premiums in the packet.
20. **Dependent care / Form 2441.** Children plus care documents or an FSA. High when Form 2441 is incomplete against those documents. Otherwise Medium.
21. **Energy / Form 5695.** Form 5695, or residential energy documents, in the packet.
22. **R&D.** Only when Form 6765 or an R&D study is in the packet. A technology Schedule C plus wages, with neither of those, stays silent.
23. **NUA.** A Form 1099-R for an employer plan and a company-stock signal, both present.
24. **Roth conversion room.** A traditional IRA or 401(k), plus a low taxable-income year signal.
25. **QSBS §1202.** A C corporation stock disposal, plus QSBS or a five-year holding note in the documents or in explicit context. An entity-type vibe alone stays silent.
26. **1031 / installment.** Form 6252 or Form 8824 is present, or Schedule D shows a large real-estate gain and neither form is in the packet.

## Extract fields

The extract layer returns fields only. Names from the lock:

`has_business`, `home_ownership_doc`, `building_basis`, `pis_or_remodel_year`, `prior_cost_seg`, `dependents_on_return`, `child_dependent`, `dependent_ages`, `retirement_deduction`, `se_income`, `officer_w2`, `distributions`, `qbi_fields`, `form_2210_underpay`, `wash_8949`, `sch_d_loss_room`, `form_8582_suspended`, `cy_passive_income`, `section_179_bonus`, `ti_absorbs`, `hsa_w2_8889_mismatch`, `form_1098t`, `hours_log_rep`, `charitable_sch_a`, `form_8283`, `age_70_5`, `form_8829`, `vehicle_signal`, `large_refund`, `multi_state_signal`, `state_returns_mismatch`, `sehi_gap`, `form_2441_gap`, `form_5695`, `form_6765_or_rd_study`, `nua_signal`, `low_ti_year`, `qsbs_signal`, `form_6252`, `form_8824`, `large_re_gain_no_1031`

The stub also carries the parts those floors need (entity checkboxes, ownership source, QBI worksheet numbers, §179 adds versus amount taken, hours as a number, and so on). The list is in `js/extract.js`. Narrative keys are dropped.

## Where a dollar figure is not in the lock

The lock already states these numbers, and the scorer uses them as written:

- Prior-year Schedule A charitable marker: $5,000
- REP hours: 750
- Retirement deduction: exactly $0, not a small positive amount
- Building basis: any amount above zero
- Cost-segregation window: the last three tax years (the return year and the two years before it)
- Education High: Form 1098-T must be in the packet

Words the lock left qualitative — "above the floor", "near-zero", "material", "little", "large", "well above" — are named constants in `STUB_FLOORS` inside `js/score.js`. Those constants are a research calibration so the stub can run. They are not new taxonomy. Change a constant in that object if the firm locks a dollar figure. Do not rewrite the rule shape to get a different band.

## Fixtures

Anonymized packets only. The pack includes a High example for each High type and silent twins for the easy-to-miss kills (SSTB without a math gap, a small retirement deduction, thin taxable income, Form 8829 or a K-1 alone, education without Form 1098-T, a prior cost-segregation study, missing lots, REP with losses and no hours). Medium examples cover the tray. No real SSNs, names, or EINs.

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
| second-eye | Judgment Highs: 1, 2, 2b, 7, 9, 13, 14, 15, 18 | about 5 minutes |
| tray-skim | Every Medium card | about 2 minutes |

## High — must-review

1. **QBI.** A math gap can be High. SSTB never raises confidence. SSTB is a gate only. It does not create a flag, and it does not block a math flag.
2. **S-corp reasonable compensation.** Distributions are present and officer W-2 is near zero.
2b. **S-corp conversion (SE).** Separate from type 2 and from type 3. High only, pass tag `second-eye`, never Medium. The business signal is `schedule_c`, or a Schedule SE form, or `se_income` present. A missing amount is not zero. Se-alone High when `se_income` is at least $100,000. In the band from $50,000 up to but not including $100,000, High only when an explicit `planning_rc` is on the packet (not a stub and not inferred) and `se_income − planning_rc` is at least $25,000. Without both, that band stays silent. `se_income` under $50,000 stays silent even when `planning_rc` is present. $50,000 of self-employment income alone is not High. The measure is `se_income` only. W-2 Box 1 is not an input. Silent when the packet is already an S corporation or contains Form 1120-S, when it is a multi-owner Form 1065 or K-1 only, when profit is a loss or zero, when Schedule SE is missing, or when the packet is W-2-only (no Schedule C, no Schedule SE, and no `se_income`). A one-year spike does not silence it. SSTB does not raise confidence and does not block the High. Dual High with type 3 is allowed. Present copy does not sequence this check with the retirement-deduction check. A dollar estimate is a High-card sibling only, and only when the packet also has an explicit compensation figure plus an OASDI wage base and separate OASDI and Medicare rates. No default compensation figure. No flat 15.3% factor. SSTB omits the dollar. The estimate does not change the band.
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

The stub also carries the parts those floors need (entity checkboxes, ownership source, QBI worksheet numbers, §179 adds versus amount taken, hours as a number, and so on). Type 2b adds `planning_rc` and `one_year_spike`. OASDI wage base, OASDI rate, and Medicare rate sit on the packet beside `planning_rate`; they are savings inputs, not score floors. The list is in `js/extract.js`. Narrative keys are dropped.

## Where a dollar figure is not in the lock

The lock already states these numbers, and the scorer uses them as written:

- Prior-year Schedule A charitable marker: $5,000
- REP hours: 750
- Retirement deduction: exactly $0, not a small positive amount
- Building basis: any amount above zero
- Cost-segregation window: the last three tax years (the return year and the two years before it)
- Education High: Form 1098-T must be in the packet
- Type 2b: Schedule SE income of at least $100,000 is High on its own. From $50,000 up to but not including $100,000, High requires an explicit `planning_rc` (not a stub and not inferred) and a gap of at least $25,000 (`se_income − planning_rc`). Under $50,000 stays silent. These are not `STUB_FLOORS`. They do not retune types 1–15 or 18. There is no flat $50,000 se-alone High and no Medium band.

Words the lock left qualitative — "above the floor", "near-zero", "material", "little", "large", "well above" — are named constants in `STUB_FLOORS` inside `js/score.js`. Those constants are a research calibration so the stub can run. They are not new taxonomy. Change a constant in that object if the firm locks a dollar figure. Do not rewrite the rule shape to get a different band.

## Fixtures

Anonymized packets only. The pack includes a High example for each High type and silent twins for the easy-to-miss kills (SSTB without a math gap, a small retirement deduction, thin taxable income, Form 8829 or a K-1 alone, education without Form 1098-T, a prior cost-segregation study, missing lots, REP with losses and no hours, type 2b in the $50,000–$100,000 band without an explicit compensation figure or without a $25,000 gap, and type 2b under $50,000 even with a compensation figure). Medium examples cover the tray. No real SSNs, names, or EINs.

## Added types (2026-10-06)

Additive only. The High floors for types 1–15 and 18 above are unchanged. There is no ROMAN UNLOCK in this section. N33 (extension / estimated-payment adequacy) is not a type. O&G stays parked. Pass tag `compliance-flag` is the filing-gap tag for N28. Present copy for these types still uses signal, then docs, then gate, then next, and the same talk bans.

N27. **Foreign tax credit / §904 / deduct-vs-credit.** Medium, tray-skim. IRC §901, §904, and §275(a)(4). Fires when foreign tax paid is a positive amount, or Form 1116 is paired with a §904 carryover or with a Schedule A foreign-tax deduction. Silent when those are absent. Baskets, paid versus accrued, and treaty interaction stay with the reviewer.

N28. **Foreign account / FBAR–8938–3520–8621.** Compliance-only High, pass tag `compliance-flag`. FBAR is FinCEN Form 114 under 31 U.S.C. §5314. That is not Form 8938 (IRC §6038D). Form 3520 is §6048. Form 8621 is §1291 and following. Compliance High only when Schedule B Part III is Yes and at least one of these is also true: an explicit Form 8938 threshold or a stated foreign-account value, an incomplete Form 8938, 3520, or 8621, or a PFIC or foreign-trust marker without a complete Form 8621 or 3520. Schedule B Yes alone stays silent and lists the threshold worksheet and FinCEN 114 as docs needed. No foreign-account signal stays silent. The compliance reviewer decides which regime applies.

N29. **Safe-harbor / ES plan after a high-AGI year.** Medium, tray-skim, look-forward only. Never High. IRC §6654(d)(1)(B)–(C). A Path P packet (the prior-year return alone) stays silent and lists a current-year estimate plan as docs needed. Path R fires only when `prior_year_agi` and `prior_year_total_tax` are present and current-year estimates plus withholding are strictly below the harbor. Harbor is 110% of prior-year total tax when prior-year AGI is over $150,000, and 100% otherwise. If type 4 / Form 2210 fires on that same year, N29 stays silent. Annualized income and farmer or fisher rules stay with the reviewer.

N30. **Partnership exit / §736, §741, §751, §708(b).** High, second-eye. Fires only when a partnership interest disposition, a liquidating distribution, or a final Form 1065 is paired with a §751 statement or that final return. Ordinary K-1 income stays silent. There is no Medium fallback. The desk does not choose a §736(a) or §736(b) bucket.

N31. **Backdoor Roth / mega backdoor.** Medium, tray-skim. IRC §408A, §219, and plan terms under §401(a) / §402. Fires only when MAGI, Form 8606 or a nondeductible IRA signal, and a plan or W-2 after-tax signal are all present. Any missing piece stays silent. Pro-rata and step-transaction review stay with the reviewer. The desk does not invent a phaseout bracket.

N32. **State PTE / BAIT election.** Medium on Path R, tray-skim. The card cites the state PTE or BAIT statute when the state return identifies the state, and it marks IRC §164(b)(6) as an inference rather than a federal election. Path R fires when a standard deduction or a capped state-and-local line, partnership or S corporation income, and a two-letter state code are present, and the state election form is missing or incomplete. Path P stays silent: a missing election on a filed prior year is closed history, and the docs needed are the current-year election. Silent without pass-through income or a state code. Deadlines and owner consents stay with the reviewer.

N34. **NIIT / §1411 on disposition.** Medium, tray-skim. IRC §1411 and Treas. Reg. §1.1411-1 and following. MAGI floors, strictly over: $200,000 single, head of household, and qualifying surviving spouse; $250,000 married filing jointly; $125,000 married filing separately (Form 8960 / §1411(b)). A blank MAGI or a blank filing status does not become zero and does not assume a status. Silent when Form 8960 already computes NIIT unless a passthrough-interest disposition or other disposition gap is still open. Silent below the MAGI floor and silent with no disposition. Prop. Reg. §1.1411-7 is labeled proposed on the card. The reviewer decides whether to follow that proposed text. The desk does not treat it as final.

Path P field names use a `py_` prefix and are not copied onto `prior_year_sch_a_charitable`, `prior_year_agi`, or `prior_year_total_tax`. Those lookback keys are written on a Path R packet only. Type 5 still scores the two-year look from `prior_year_sch_a_charitable` on Path R and stays silent on a Path P packet that carries only `py_charitable_sch_a_amount`.

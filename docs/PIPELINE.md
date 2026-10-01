# Pipeline

Phase A is one path:

```
Drop → Ingest → Extract → Score → Present
                              │
                              ├─ High    must-review card
                              ├─ Medium  optional-tray card
                              └─ silent  no card, no present copy
```

A person owns advice and sign-off. The app does not file, does not write a memo, and does not price an engagement.

## Stages in this stub

### Drop

The left rail is a fixture picker. The drop zone accepts one JSON fixture that uses the anonymized schema (`anon: true`, a `fields` object, no SSN or EIN). A PDF, a tax-software export, or a file with a real identifier is refused. Nothing is uploaded.

### Ingest

Ingest is an identity step. The JSON object is the packet. There is no OCR, no spreadsheet mapping, and no e-file ingest. `js/intake.js` is the whole stage.

### Extract

`js/extract.js` returns a field bag. It normalizes booleans and numbers, rejects Form 8829 as an ownership document, and derives `nua_signal` and `qsbs_signal` only as the AND of their parts. It does not write sentences. An omitted `retirement_deduction` stays null, so a missing line is not treated as a literal zero.

### Score

`js/score.js` runs every type in `data/types.json` and returns `High`, `Medium`, or `silent`. Rules are the floors in `docs/TAXONOMY.md`. Silent is a result, not a skipped type, so the research screen can show that the check ran.

### Present

`js/present.js` builds present copy only for High and Medium. Templates are fixed strings. Types 14 and 15 return only:

- `Augusta possible — hold for planner.`
- `Hire-kids possible — hold for planner.`

Every other card uses four clauses, in this order: signal, docs, gate, next. A banned phrase throws before the string can ship. The card still shows the type, lane, cite, tripped fields, and pass tag beside that copy.

## One-pass and second-eye

Pass tags are review effort, not a second scoring model.

| Pass tag | Types when they are High | What the reviewer is doing |
| --- | --- | --- |
| one-pass | 3, 4, 6, 11, 12, and the document Highs 17 and 20 | Compare a number or a missing form. About 3 minutes. |
| second-eye | 1, 2, 7, 9, 13, 14, 15, 18 | Judgment. About 5 minutes. SSTB, reasonable compensation, passive absorb, §179 capacity, cost-segregation ROI, Augusta, hire-kids, and REP hours all stay here. |
| tray-skim | Every Medium band | Optional tray. About 2 minutes. |

Type 1 can be High on math and still carry `second-eye`, because SSTB is a gate the reviewer has to see. The math does not promote it to a quicker pass.

Medium never uses `second-eye`. A High that the taxonomy puts on the tray only in some packets (17 and 20) uses `one-pass` when it is High and `tray-skim` when it is Medium.

## Silence

Silence means the type was scored and the floor was not met. The UI lists those checks under "Silent checks" with the floor that failed. It does not attach present copy.

These kills are intentional, not missing features:

- SSTB with no QBI math gap
- Retirement deduction of any positive amount (including a small one) for types 3 and 3b
- Thin taxable income on type 9
- Education items without Form 1098-T
- Form 8829 used as ownership, or a K-1 with no Schedule C or S corporation, for Augusta
- W-2 unreimbursed expenses alone for mileage
- A complete Form 8829 with no gap
- Ownership alone for home office
- REP with Schedule E losses and no hours log (not Medium)
- Technology Schedule C wages with no Form 6765 and no study
- A gain with missing lots and no wash sale or loss room
- A prior cost-segregation study
- Grouping, cash-balance, and charitable bunching, which stay Medium or silent and do not become High in this pass

## Stub calibrations

`STUB_FLOORS` in `js/score.js` gives numbers to words the taxonomy left open. Locked figures are not in that set of guesses; they are coded to the taxonomy ($5,000, 750 hours, exact $0, any building basis, last three tax years).

| Constant | Stub value | Taxonomy words it stands in for |
| --- | --- | --- |
| `seIncome` | 50000 | "SE above floor" — the packet must be strictly above this |
| `cbEarnedIncome` | 250000 | "earned income above hard floor" — strictly above |
| `nearZeroOfficerW2` | 5000 | "near-zero" officer W-2, at or under |
| `minDistributions` | 10000 | distributions are actually present |
| `qbiGapMin` | 500 | ignore a rounding nick on the QBI worksheet |
| `materialAdds` | 25000 | "material" additions |
| `little179Ratio` | 0.10 | "little" §179/bonus means under 10% of additions |
| `largeRefund` | 10000 | "large" refund, at or over |
| `estimatesMultiple` / `estimatesExcess` | 1.5× and 10000 | estimates "well above" the tax |

Cost-segregation window: `tax_year - pis_or_remodel_year` is 0, 1, or 2. That is the return year plus the two preceding tax years (three tax years). A remodel three years before the return year is outside. The constant is `costSegTaxYears` (3). Widen the comparison in `costSegWindow` if the firm reads the lock as a three-year span instead.

## Worked packets

**FILER-111 (High 14).** Schedule C and Form 1098. Extract sets `home_ownership_doc` from the 1098 source. Score returns High for type 14 and silent for the rest of that packet. Present copy is only the Augusta line. The card cites §280A(g) and shows the ownership fields. Pass tag is second-eye.

**FILER-117 (silent Augusta).** K-1 only, Form 8829 tagged as ownership. Extract clears the ownership bit (`ownership_rejected_as_8829`). Score stays silent for type 14 and for home office, because home office also needs Schedule C or an S corporation. Education context without Form 1098-T stays silent for type 12.

**FILER-118 (silent REP).** Schedule E losses and `hours_log_rep: null`. Type 18 is silent, not Medium. The same packet has a prior cost-segregation study, so type 13 is silent even though basis and a recent year are present.

## What is later

Phase 2, not this scaffold:

- Reading a real return (PDF, scan, or tax-software export)
- E-file or any filing integration
- Pricing, proposals, or engagement letters
- Model-written present copy
- Changing a floor's band (for example, making cash-balance High once actuarial documents exist)

Until then, add a fixture, keep it anonymized, and let `npm run check` compare the bands to `expected`.

# Pipeline

One path. Phase 2 replaces ingest only. Score and present stay frozen:

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

The left rail is a fixture picker. The drop zone accepts anonymized inputs only, and nothing is uploaded:

- Fixture JSON (`anon: true`, a `fields` object). This path is unchanged.
- A text-layer PDF.
- A JPEG or PNG drawn in the desk’s label font.
- A scan (image-only PDF) or a photo (JPEG/PNG) of those same `LABEL: VALUE` lines.

A file with an SSN or EIN pattern is refused. OCR does not guess a field the label parser would refuse, and it does not fill a blank with zero.

The buttons under the drop zone load synthetic packets from `samples/ingest/`. Those files are not fixture JSON and they are not client documents.

### Ingest

`js/intake.js` still parses fixture JSON only.

`js/ingest.js` reads a PDF text layer (uncompressed or FlateDecode) or a label-font raster first. When a PDF has no text layer, or a JPEG/PNG is not the label font, OCR runs on the page image. `js/ingest-fields.js` keeps a line only when the label is explicit and the value clears the confidence floor (0.8). Explicit labeled numbers from a text layer or the label font are 0.96. An OCR line keeps the engine’s own confidence. Anything hedged, partial, unrecognized, or under the floor is omitted and listed under Provenance.

OCR runs in the browser from `vendor/ocr/` (Tesseract.js 5.1.1 and the English LSTM model). There is no server. A text-layer PDF is not OCR’d, even if the file also contains an image. A labeled JPEG or PNG is not OCR’d when the label font reads at least one line.

OCR still refuses:

- A PDF whose only page images are JBIG2, CCITT, or JPEG2000. Export a JPEG or PNG, or a PDF whose scan is JPEG (DCTDecode) or an 8-bit FlateDecode gray or RGB image.
- A page with no line at or above 0.8, or no `ANON: TRUE` and `FILER-###` above that floor.
- An SSN or EIN pattern anywhere in the OCR text. The whole packet is refused.
- Cost segregation, Augusta, and hire-kids trigger lines under the watch floor (0.9). Those fields are omitted so types 13, 14, and 15 stay silent. Other lines between 0.8 and 0.9 can still be kept.

Rebuilding the synthetic rasters, the image-only scan, and the photo is `npm run ingest-samples` after `npm install`.

Fail-closed rules:

- A blank `retirement_deduction`, `hours_log_rep`, age, or ownership source is omitted. It is not stored as zero, and it is not stored as “has 1098.”
- An explicit `0` is kept. That is a stated zero, not a blank.
- `ho_context`, hire-kids relationship, and QSBS notes require the matching label and an explicit yes/no or relationship. Prose does not set them.
- NUA, QSBS, and Augusta are atomic. `NUA: YES` or `QSBS: YES` fills neither half. Form 8829 is not an ownership document. Cost-segregation prose does not fill basis or year.
- QBI is kept only when income, tentative deduction, and deduction taken are all explicit. Section 179 is kept only when both amounts are explicit. Officer W-2 and distributions are kept only as a pair, so a missing wage is not scored as zero.
- Below the floor, the line is dropped. Silent is preferred over a tray card.

The field bag is a subset of `js/extract.js` `FIELD_KEYS`. Extract, score, and present then run exactly as they do for a fixture. Present copy is still the fixed templates. No model writes it.

GitHub Pages is a static host. Ingest, including OCR, runs in the browser. The first scan on a page loads `vendor/ocr/` from this site. A digital PDF with a text layer still uses that text. A phone photo of the anonymized label lines can be read when OCR confidence clears the floor.

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

`STUB_FLOORS` in `js/score.js` gives numbers to words the taxonomy left open. Locked figures are not in that set of guesses; they are coded to the taxonomy ($5,000, 750 hours, exact $0, any building basis, last three tax years). These dollar calibrations stay research values. The firm has to lock them before any live client scoring. This ingest change does not retune them.

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

Not in this pass:

- Tax-software exports other than a text-layer PDF or a scan of the anonymized label lines
- E-file or any filing integration
- Pricing, proposals, or engagement letters
- Model-written present copy
- Changing a floor's band (for example, making cash-balance High once actuarial documents exist)
- Replacing `STUB_FLOORS` with firm-locked dollars

Until then, add a fixture, keep it anonymized, and let `npm run check` compare the bands to `expected`. The same command also reads the synthetic PDF, JPEG, and PNG, OCRs the scan and the photo, and checks that blanks did not become zeros. `npm install` once so the checker can load tesseract.js. The Pages site uses the copies in `vendor/ocr/` and does not need that install.

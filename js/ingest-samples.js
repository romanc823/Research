/**
 * Synthetic anonymized packets for the Phase 2 ingest demo.
 * No client names, SSNs, or EINs. These lines are rendered into
 * samples/ingest/. They are not fixture JSON and are not live returns.
 */

export const AUGUSTA_PDF_LINES = [
  "ANON: TRUE",
  "TAX YEAR: 2025",
  "FILER: FILER-201",
  "FORMS: SCHEDULE C, FORM 1098",
  "SCHEDULE C: YES",
  "SE INCOME: 88000",
  "RETIREMENT DEDUCTION:",
  "HOME OWNERSHIP SOURCE: 1098",
  "VEHICLE SIGNAL: YES",
  "EDU CREDIT GAP: YES",
  "FORM 1098T: NO",
  "SCH E RE LOSS: YES",
  "HOURS LOG REP:",
  "BUILDING BASIS:",
  "COST SEG: MAYBE",
  "NUA: YES",
  "QSBS: YES",
  "HO CONTEXT: MAYBE",
  "DEPENDENT RELATIONSHIP: PARENT",
  "NOTE: TUITION KIDS AND A HOME",
];

export const REP_JPEG_LINES = [
  "ANON: TRUE",
  "TAX YEAR: 2025",
  "FILER: FILER-202",
  "FORMS: SCHEDULE E, FORM 8283",
  "SCHEDULE C: NO",
  "SCH E RE LOSS: YES",
  "HOURS LOG REP: 820",
  "FORM 8283: YES",
  "HOME OWNERSHIP SOURCE: 8829",
  "HOME OWNERSHIP DOC: YES",
  "EDU CREDIT GAP: YES",
  "FORM 1098T:",
  "CHILD DEPENDENT: NO",
  "DEPENDENT RELATIONSHIP: PARENT",
  "RETIREMENT DEDUCTION:",
  "SE INCOME:",
  "NUA: YES",
  "QSBS: YES",
  "BUILDING BASIS: UNKNOWN",
  "PIS OR REMODEL YEAR: RECENT",
  "HO CONTEXT: MAYBE",
  "NOTE: AUGUSTA AND HIRE KIDS",
];

export const SILENT_PNG_LINES = [
  "ANON: TRUE",
  "TAX YEAR: 2025",
  "FILER: FILER-203",
  "K1 ONLY: YES",
  "SCHEDULE C: NO",
  "S CORP: NO",
  "FORM 8829: YES",
  "HOME OWNERSHIP SOURCE: 8829",
  "HOME OWNERSHIP DOC: YES",
  "EDU CREDIT GAP: YES",
  "FORM 1098T: NO",
  "SCH E RE LOSS: YES",
  "HOURS LOG REP:",
  "BUILDING BASIS: UNKNOWN",
  "PIS OR REMODEL YEAR: 2024",
  "PRIOR COST SEG: NO",
  "NUA EMPLOYER PLAN 1099R: YES",
  "QSBS C CORP DISPOSAL: YES",
  "HO CONTEXT: MAYBE",
  "NOTE: CHILDREN AT THE RESIDENCE",
];

/** Same Augusta packet as the text PDF, with its own filer. Rendered as a page image. */
export const SCAN_PDF_LINES = AUGUSTA_PDF_LINES.map((line) => (
  line === "FILER: FILER-201" ? "FILER: FILER-211" : line
));

/** Same Augusta packet again, as a Group 4 fax. FILER-213 keeps it distinct from the JPEG scan. */
export const FAX_PDF_LINES = SCAN_PDF_LINES.map((line) => (
  line === "FILER: FILER-211" ? "FILER: FILER-213" : line
));

/** Photo of an explicit retirement zero. Blanks stay blank. Parent is not hire-kids. */
export const PHOTO_SEP_LINES = [
  "ANON: TRUE",
  "TAX YEAR: 2025",
  "FILER: FILER-212",
  "FORMS: SCHEDULE C",
  "SCHEDULE C: YES",
  "SE INCOME: 88000",
  "EARNED INCOME: 88000",
  "RETIREMENT DEDUCTION: 0.00",
  "HOURS LOG REP:",
  "BUILDING BASIS:",
  "DEPENDENT RELATIONSHIP: PARENT",
  "NUA: YES",
  "QSBS: YES",
  "COST SEG: MAYBE",
];

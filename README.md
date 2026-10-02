# Intentional Accounting — tax planning research

Phase A scaffold. Drop an anonymized packet, extract fields, score them against the locked floors, and show a card only when the band is High (must-review) or Medium (optional tray). Anything below that stays silent.

This is a research desk for review, not a client portal. It does not e-file, does not talk to tax software, and does not price work.

Roman: pull `main`, then open the live page. The screen is fixture data moving through `extract → score → present`. Extend a floor by editing `js/score.js` and a fixture, not by adding a model.

## Open the desk

No local server. GitHub Pages serves this repository from `main` at the site root (`/`).

1. `git checkout main` and `git pull`.
2. Open **[https://romanc823.github.io/Research/](https://romanc823.github.io/Research/)**.

Styles, ES modules, and `fixtures/manifest.json` use paths relative to that page, so they load on the project site and under `npm start`. Do not open `index.html` with `file://`.

GitHub Free publishes Pages only from a public repository, so this repo is public. The pack is still anonymized fixtures only.

The short checklist is [docs/OPEN.md](docs/OPEN.md). `npm start` is optional local development, documented in that same file.

## Optional local development

`npm start` runs `tools/serve.mjs` (Node's built-in `http`, no installed packages) on `127.0.0.1` of the computer where the terminal is open. Use it when you want to edit the desk before a Pages rebuild. A cloud agent, Codespace, or VM that logged HTTP 200 for `http://127.0.0.1:8080` was answering on **that** machine.

1. Cursor → `File → Open Folder` → the repo root on your computer (the folder with `package.json`).
2. `Terminal → New Terminal` so the shell is that root.
3. Run `npm start` and leave the terminal open.
4. Open the URL on the last line, in Cursor Simple Browser or Chrome on this same computer:

   ```text
   Tax research scaffold at http://127.0.0.1:8080
   ```

   If the preferred port is busy, the process tries the next ports (8080–8090, or `PORT` through `PORT+10`) and prints the one that listened. Use that line.

### ERR_CONNECTION_REFUSED

Nothing on this computer is accepting that host and port. The usual causes: `npm start` is not running here, the terminal printed a different port, or the process you saw was a cloud agent. Run `npm start` locally and open the printed URL. The hosted desk does not use this port: [https://romanc823.github.io/Research/](https://romanc823.github.io/Research/).

### EADDRINUSE

The preferred port is taken, or the OS reserved it (a bind fails and Chrome still refuses the connection). `npm start` walks the next free ports and prints the URL that worked. If the whole span is busy, it exits with a one-line kill command for this OS and a `PORT=… npm start` example:

```bash
kill $(lsof -t -iTCP:8080 -sTCP:LISTEN)
PORT=8091 npm start
```

Windows Command Prompt uses `for /f "tokens=5" %a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do taskkill /F /PID %a`, then `set PORT=8091&& npm start`. Details, PowerShell, and excluded-port ranges are in [docs/OPEN.md](docs/OPEN.md).

## On the screen

The left rail lists 21 synthetic packets. Pick one. The main pane runs that packet and shows:

- **Must-review** — High cards
- **Optional tray** — Medium cards
- A card's type, lane, cite, tripped fields, pass tag, and present copy
- **Silent checks** — every other type, with the floor that failed, and no present copy

The header counts how many fixtures match the `expected` block in their JSON. That count is the same check as `npm run check`.

The drop zone accepts a local fixture JSON file, a text-layer PDF, a labeled JPEG/PNG, or a scan or photo of those same labels. OCR runs in the browser when the text layer and the label font are both missing. JPEG and FlateDecode scans go straight to OCR. Fax (CCITT), JBIG2, and JPEG2000 scans are rasterized in the browser first. It refuses an SSN or EIN pattern, a page under the confidence floor, and a page image that cannot be painted. On the public desk a PDF over 40 pages is refused. Blank amounts are omitted rather than stored as zero. Sample buttons load synthetic files from `samples/ingest/`.

## Internal desk

Public Pages stays anonymized. For a real packet on a machine you control, start the local server and open `?desk=private` (the red banner). The packet stays in the tab. It is not uploaded and it is not saved. Reload clears it. Do not commit that file, and do not drop it on the public Pages URL.

The internal desk reads W-2 boxes 1–6 and 12, SSA net benefits, 1099-R gross, and 1099-INT / 1099-DIV when the text layer states them. A blank box stays blank. The page cap is 100. Fax, JBIG2, and JPEG2000 scans still rasterize before OCR. Details, the savings rule, and the public defaults are in [docs/PHASE-2.7.md](docs/PHASE-2.7.md).

A High card can show a planning estimate when the packet has an explicit ordinary rate and a QBI gap. Type 2b can show one only when the packet has an explicit compensation figure plus an OASDI wage base and separate OASDI and Medicare rates. SSTB omits that dollar. The line is **Planning estimate for human review. Not tax advice.** It is not present copy. Medium cards do not show a dollar. Types 14 and 15 keep their fixed lines.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | Dashboard shell |
| `css/app.css` | Layout. No build step. |
| `js/app.js` | Picker, drop zone, cards |
| `js/intake.js` | JSON fixture gate |
| `js/ingest.js` | Text layer, label font, then OCR |
| `js/ingest-fields.js` | Fail-closed field parser, including the OCR floors |
| `js/form-layout.js` | Internal-desk IRS box reader. Blank stays blank |
| `js/desk-mode.js` | `?desk=private` and the page caps |
| `js/savings.js` | High-card planning estimate. Omitted when the QBI rate or the type 2b payroll split is missing |
| `js/ocr.js` | Tesseract.js in the browser and in `npm run check` |
| `js/pdf-images.js` | JPEG and FlateDecode page images |
| `js/pdf-raster.js` | PDF.js page paint for CCITT, JBIG2, and JPEG2000 |
| `vendor/ocr/` | Tesseract engine and English model served by Pages |
| `vendor/pdfjs/` | PDF.js, worker, and JBIG2 / JPEG2000 wasm served by Pages |
| `samples/ingest/` | Synthetic PDF, JPEG, PNG, scan, photo, and fax. Not fixture JSON. |
| `js/extract.js` | Fields only |
| `js/score.js` | High / Medium / silent |
| `js/present.js` | Fixed present copy and talk bans |
| `js/evaluate.js` | Runs a packet and compares it to `expected` |
| `data/types.json` | Type id, name, lane, pass tag, cite, trigger |
| `fixtures/` | Anonymized packets and `manifest.json` |
| `docs/TAXONOMY.md` | Locked floors |
| `docs/PIPELINE.md` | Drop → Ingest → Extract → Score → Present, and one-pass vs second-eye |
| `docs/OPEN.md` | Pull `main`, open the live URL. Optional local server notes. |
| `.nojekyll` | Publishes the repo as static files. Pages does not run Jekyll. |
| `tools/self-check.mjs` | Fixture expectations and floor boundaries |
| `tools/build-fixtures.mjs` | Regenerates the JSON pack |
| `tools/write-ingest-samples.mjs` | Regenerates the synthetic PDF, JPEG, PNG, scan, photo, and fax |
| `tools/render-photo.mjs` | Draws the scan and photo from DejaVu Sans Mono |
| `tools/serve.mjs` | Static server. Walks the next free ports and prints the URL. |

## Taxonomy

`docs/TAXONOMY.md` is the authority for which band a packet can earn. Do not retune a floor by "feel" in the UI. If a card looks wrong, change the fixture or fix the rule so it matches that file.

`STUB_FLOORS` in `js/score.js` only fills words the taxonomy left qualitative (near-zero wages, material additions, a large refund, the unnamed SE and cash-balance dollar floors). The locked numbers — $5,000 of prior-year charity, 750 REP hours, a retirement deduction of exactly $0, any building basis, the three-tax-year cost-segregation window — are not optional interpretations. See the table in `docs/PIPELINE.md`.

## Stub vs later

Shipped now:

- Fixture JSON in, fields out, a band, and canned present copy
- Talk bans, including the fixed Augusta and hire-kids lines
- Silent twins so a near miss does not become a card

Shipped as Phase 2 ingest, still on the frozen score and present path:

- Text-layer PDF in, and a label-font JPEG or PNG in
- OCR of an image-only PDF or a photo of the same anonymized labels, in the browser
- Page rasterizing for CCITT, JBIG2, and JPEG2000 scans, then the same OCR path
- Confidence floor, a higher watch floor for types 13, 14, and 15, provenance, and blanks left blank
- Synthetic samples only. No live client file in `samples/` or `fixtures/`

Not in this repo:

- E-file, Drake, UltraTax, ProConnect, or any other tax product
- Pricing, proposals, or engagement letters
- A model writing the card text
- Firm-locked replacements for the research dollar floors in `STUB_FLOORS`

Ingest can grow. Extract stays free of narrative, and present copy stays on the bans.

## Add a fixture

Prefer editing `tools/build-fixtures.mjs` and running:

```bash
npm run fixtures
npm run check
```

Each packet needs `anon: true`, a `filer_ref` like `FILER-121` (no personal name), `tax_year`, `forms_in_packet`, a `scenario`, `fields`, and `expected.high` / `expected.medium`. Omitted booleans are false. Omitted amounts are 0. Omitted `retirement_deduction`, `hours_log_rep`, and `se_income` stay unknown: unknown retirement is not $0, unknown hours do not flag REP, and a missing Schedule SE is not a zero-profit loss.

If the packet has Schedule C income above the SE floor and you do not want a SEP/Solo card, set `retirement_deduction` to a positive number.

## Add or adjust a type

1. Add the row to `data/types.json` (id, name, lane, pass tag, cite, trigger summary).
2. Add the id to `TYPE_ORDER` in `js/score.js` and return High, Medium, or silent.
3. Add a fixed template in `js/present.js`. Keep signal → docs → gate → next. Do not use "you should", "qualify for", "guaranteed", "best strategy", or a dollar savings claim.
4. Cover it with a fixture and a boundary case in `tools/self-check.mjs`.

Types 14 and 15 are the exception: their present copy is the single locked sentence, not the four-part line.

## Check

```bash
npm install
npm run check
```

`npm install` loads tesseract.js, pdfjs-dist, and the canvas package for the checker. Node 20 is enough: the rasterizer installs `Promise.withResolvers` before PDF.js opens a document. The Pages site does not use `node_modules`; it loads `vendor/ocr/` and `vendor/pdfjs/`.

The script fails if a fixture's bands drift, if present copy breaks a talk ban, if type 14 or 15 copy changes, if REP without hours comes back as Medium, if a fixture contains an SSN- or EIN-shaped number, or if the scan, fax, and photo samples invent a zero or raise types 13, 14, or 15 from a blank. It also fails if the public desk accepts a packet without `ANON: TRUE` or with an SSN, if the internal desk cannot score a form layout, if a Medium or silent row shows a savings dollar, or if desk code posts a packet.

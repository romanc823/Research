# Intentional Accounting — tax planning research

Phase A scaffold. Drop an anonymized packet, extract fields, score them against the locked floors, and show a card only when the band is High (must-review) or Medium (optional tray). Anything below that stays silent.

This is a research desk for review, not a client portal. It does not e-file, does not talk to tax software, and does not price work.

Roman: open this folder in Cursor **on your computer** and follow [Desktop open path](docs/OPEN.md). The screen is fixture data moving through `extract → score → present`. Extend a floor by editing `js/score.js` and a fixture, not by adding a model.

## Desktop open path

Chrome on the Desktop reaches a server only when that server is running on the Desktop. A cloud agent, Codespace, or VM that logged HTTP 200 for `http://127.0.0.1:8080` was answering on **that** machine. Start `npm start` in a terminal on your computer, then open the URL that terminal prints. The short checklist is [docs/OPEN.md](docs/OPEN.md).

1. Cursor → `File → Open Folder` → the repo root on your computer (the folder with `package.json`).
2. `Terminal → New Terminal` so the shell is that root.
3. Run `npm start` and leave the terminal open. It runs `tools/serve.mjs` (Node's built-in `http`, no installed packages) and binds `127.0.0.1`.
4. Open the URL on the last line, in Cursor Simple Browser or Chrome on this same computer:

   ```text
   Tax research scaffold at http://127.0.0.1:8080
   ```

   If the preferred port is busy, the process tries the next ports (8080–8090, or `PORT` through `PORT+10`) and prints the one that listened. Use that line. `file://` will not load the fixtures.

### ERR_CONNECTION_REFUSED

Nothing on this computer is accepting that host and port. The usual causes: `npm start` is not running here, the terminal printed a different port, or the process you saw was a cloud agent. Run `npm start` locally and open the printed URL.

### EADDRINUSE

The preferred port is taken, or the OS reserved it (a bind fails and Chrome still refuses the connection). `npm start` walks the next free ports and prints the URL that worked. If the whole span is busy, it exits with a one-line kill command for this OS and a `PORT=… npm start` example:

```bash
kill $(lsof -t -iTCP:8080 -sTCP:LISTEN)
PORT=8091 npm start
```

Windows Command Prompt uses `for /f "tokens=5" %a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do taskkill /F /PID %a`, then `set PORT=8091&& npm start`. Details, PowerShell, and excluded-port ranges are in [docs/OPEN.md](docs/OPEN.md).

## On the screen

The left rail lists 20 synthetic packets. Pick one. The main pane runs that packet and shows:

- **Must-review** — High cards
- **Optional tray** — Medium cards
- A card's type, lane, cite, tripped fields, pass tag, and present copy
- **Silent checks** — every other type, with the floor that failed, and no present copy

The header counts how many fixtures match the `expected` block in their JSON. That count is the same check as `npm run check`.

The drop zone accepts a local fixture JSON file only. It refuses PDFs, files with an SSN or EIN pattern, and objects that are not `anon: true`.

## Layout

| Path | Role |
| --- | --- |
| `index.html` | Dashboard shell |
| `css/app.css` | Layout. No build step. |
| `js/app.js` | Picker, drop zone, cards |
| `js/intake.js` | Ingest stub |
| `js/extract.js` | Fields only |
| `js/score.js` | High / Medium / silent |
| `js/present.js` | Fixed present copy and talk bans |
| `js/evaluate.js` | Runs a packet and compares it to `expected` |
| `data/types.json` | Type id, name, lane, pass tag, cite, trigger |
| `fixtures/` | Anonymized packets and `manifest.json` |
| `docs/TAXONOMY.md` | Locked floors |
| `docs/PIPELINE.md` | Drop → Ingest → Extract → Score → Present, and one-pass vs second-eye |
| `docs/OPEN.md` | Desktop open path, connection refused, port in use |
| `tools/self-check.mjs` | Fixture expectations and floor boundaries |
| `tools/build-fixtures.mjs` | Regenerates the JSON pack |
| `tools/serve.mjs` | Static server. Walks the next free ports and prints the URL. |

## Taxonomy

`docs/TAXONOMY.md` is the authority for which band a packet can earn. Do not retune a floor by "feel" in the UI. If a card looks wrong, change the fixture or fix the rule so it matches that file.

`STUB_FLOORS` in `js/score.js` only fills words the taxonomy left qualitative (near-zero wages, material additions, a large refund, the unnamed SE and cash-balance dollar floors). The locked numbers — $5,000 of prior-year charity, 750 REP hours, a retirement deduction of exactly $0, any building basis, the three-tax-year cost-segregation window — are not optional interpretations. See the table in `docs/PIPELINE.md`.

## Stub vs later

Shipped now:

- Fixture JSON in, fields out, a band, and canned present copy
- Talk bans, including the fixed Augusta and hire-kids lines
- Silent twins so a near miss does not become a card

Not in this repo:

- OCR or a parser for a real return
- E-file, Drake, UltraTax, ProConnect, or any other tax product
- Pricing, proposals, or engagement letters
- A model writing the card text

Phase 2 can replace ingest. It should keep extract free of narrative and keep present copy on the bans.

## Add a fixture

Prefer editing `tools/build-fixtures.mjs` and running:

```bash
npm run fixtures
npm run check
```

Each packet needs `anon: true`, a `filer_ref` like `FILER-121` (no personal name), `tax_year`, `forms_in_packet`, a `scenario`, `fields`, and `expected.high` / `expected.medium`. Omitted booleans are false. Omitted amounts are 0. Omitted `retirement_deduction` and `hours_log_rep` stay unknown: unknown retirement is not $0, and unknown hours do not flag REP.

If the packet has Schedule C income above the SE floor and you do not want a SEP/Solo card, set `retirement_deduction` to a positive number.

## Add or adjust a type

1. Add the row to `data/types.json` (id, name, lane, pass tag, cite, trigger summary).
2. Add the id to `TYPE_ORDER` in `js/score.js` and return High, Medium, or silent.
3. Add a fixed template in `js/present.js`. Keep signal → docs → gate → next. Do not use "you should", "qualify for", "guaranteed", "best strategy", or a dollar savings claim.
4. Cover it with a fixture and a boundary case in `tools/self-check.mjs`.

Types 14 and 15 are the exception: their present copy is the single locked sentence, not the four-part line.

## Check

```bash
npm run check
```

The script fails if a fixture's bands drift, if present copy breaks a talk ban, if type 14 or 15 copy changes, if REP without hours comes back as Medium, or if a fixture contains an SSN- or EIN-shaped number.

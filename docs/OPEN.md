# Open the research desk

## Live URL

The desk is a static site on GitHub Pages. Open it in Chrome like any other https page. You do not run `npm start`, and you do not use `localhost`.

1. On your computer, in this repo:

   ```bash
   git checkout main
   git pull
   ```

2. Open:

   [https://romanc823.github.io/Research/](https://romanc823.github.io/Research/)

Pages publishes the `main` branch from the repository root (`/`). `index.html`, `css/app.css`, `js/app.js`, `data/types.json`, and `fixtures/manifest.json` are relative to that page, so modules and fixtures load over https.

The left rail should list the anonymized fixtures. After a push to `main`, Pages rebuilds before the new files show up. If the rail still says "Loading fixtures…", wait a minute and reload.

### Drop a PDF or image

The drop zone on that page accepts a fixture JSON file, a text-layer PDF, a labeled JPEG/PNG, or a scan or photo of those same labels. The file stays in the browser. OCR uses the copies of Tesseract under `vendor/ocr/` on this site. The first scan can take a few seconds while that engine loads. Nothing is uploaded.

Six sample buttons load synthetic packets (no client data):

- **Sample PDF** — text layer. Augusta is High. A vehicle line is on the tray.
- **Sample JPEG** — label font. REP hours are High. Form 8283 is on the tray.
- **Sample PNG** — label font. The packet stays silent.
- **Sample scan** — image-only JPEG PDF. OCR should show the same Augusta card as the text PDF. Blank retirement stays blank.
- **Sample photo** — not the label font. OCR should show the SEP / Solo card from an explicit retirement zero. Blank hours and blank basis stay blank.
- **Sample fax** — the same Augusta labels as a CCITT Group 4 scan. OCR should show the same Augusta card. Blank retirement stays blank. The first fax also loads the page rasterizer.

OCR runs when a PDF has no text layer, or when a JPEG/PNG is not the label font. JPEG and FlateDecode page images go straight to OCR. CCITT, JBIG2, and JPEG2000 pages are rasterized in the browser first. A page that still cannot be read is refused, with no amounts filled in as zero. A page with no `ANON: TRUE` and `FILER-###` above the confidence floor (0.8), and any SSN or EIN pattern, is refused. The public desk also refuses a PDF over 40 pages. Lines under that floor are omitted. Lines that would raise cost segregation, Augusta, or hire-kids (types 13, 14, and 15) need 0.9. Score floors are unchanged research values; the firm still has to lock the dollar figures before live client scoring.

The internal desk is `?desk=private` on a local `npm start` URL, with the red banner. It is for a packet that stays in that tab. Do not use the public Pages URL for a live file. See [PHASE-2.7.md](PHASE-2.7.md).

Do not open `index.html` from Finder or Explorer. A `file://` tab blocks ES modules and `fetch`.

GitHub Free cannot publish Pages from a private repository, so this repository is public. The pack is still anonymized fixtures only: no live client data, no e-file, no pricing.

`.nojekyll` in the repo root tells Pages to copy the files as they are, instead of running Jekyll.

## Optional local development

`npm start` is only for editing the desk on your computer before a Pages rebuild. The process binds `127.0.0.1` on the computer where the terminal is open. A cloud agent, Codespace, or other VM that printed `http://127.0.0.1:8080` (even with HTTP 200) is a different machine.

1. On your computer, open this repo's root in Cursor (`File → Open Folder`). The folder contains `package.json` and `index.html`. Use the clone on the Desktop.
2. Open a terminal at that root (`Terminal → New Terminal`). On macOS or Linux, `pwd` should end in the repo folder. On Windows, `cd` should show that folder.
3. Start the server and leave the terminal open:

   ```bash
   npm start
   ```

   That runs `tools/serve.mjs` with Node's built-in `http` module. It binds `127.0.0.1` only. The page loads OCR from `vendor/ocr/` on that same origin. `npm install` is only for `npm run check` and for regenerating samples.

4. Read the last line. It is the only local URL to open, for example:

   ```text
   Tax research scaffold at http://127.0.0.1:8080
   ```

   If 8080 is busy, the process tries 8081, then 8082, through 8090 (or `PORT` through `PORT+10`) and prints the port that listened. `PORT=8095 npm start` starts the walk at 8095.

5. Open **that exact URL** in Cursor Simple Browser (`View → Simple Browser`) or in Chrome on the same computer.

Closing the terminal stops the local desk. The GitHub Pages URL keeps working.

### ERR_CONNECTION_REFUSED

Chrome is talking to a port on this computer where nothing is accepting connections. This applies to `npm start` only. The hosted desk is [https://romanc823.github.io/Research/](https://romanc823.github.io/Research/).

- The terminal is not running `npm start` on this Desktop. A log from a cloud agent is a log from another computer.
- The terminal printed a different port. Open the printed URL. A saved bookmark to port 8080 is the wrong address when the log says 8081 or anything else.
- The process exited. Run `npm start` again and leave that terminal open.
- The address bar says `localhost` and still refuses while the printed `127.0.0.1` URL works. Use the printed URL. This server listens on IPv4 `127.0.0.1`.

### EADDRINUSE

Something on this computer already claimed the port, or the operating system reserved it so a bind fails and a connect is still refused.

`npm start` walks the next free ports and prints the URL that worked. You only need a manual fix when every port in the span fails. The process then exits and prints both of these:

- A one-line kill command for the OS it is running on.
- A `PORT=… npm start` example for the next port after the span.

Copy the kill line from the terminal. The same commands, for port 8080:

macOS or Linux:

```bash
kill $(lsof -t -iTCP:8080 -sTCP:LISTEN)
```

Windows Command Prompt (`%a` is for an interactive prompt; a `.bat` file needs `%%a`):

```bat
for /f "tokens=5" %a in ('netstat -ano ^| findstr :8080 ^| findstr LISTENING') do taskkill /F /PID %a
```

Windows PowerShell:

```powershell
Get-NetTCPConnection -LocalPort 8080 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

Then run `npm start` again. To skip a blocked span without killing anything:

```bash
PORT=8091 npm start
```

Windows Command Prompt: `set PORT=8091&& npm start`

Windows PowerShell: `$env:PORT=8091; npm start`

On Windows, Hyper-V and similar features can reserve a block of ports. A bind then fails and Chrome still reports connection refused, because no program is listening. See the block with:

```bat
netsh interface ipv4 show excludedportrange protocol=tcp
```

`npm start` walks forward out of a short reserved block. If 8080–8090 are all reserved, set `PORT` above that block and use the URL the terminal prints.

`python3 -m http.server` binds only the port you name and does not print a fallback. Use `npm start` so the URL in the terminal is the one the server took.

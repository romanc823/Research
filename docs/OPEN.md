# Desktop open path

The desk is a static page served by a process on **your** computer. Chrome and Cursor Simple Browser on the Desktop open `127.0.0.1` on the Desktop. A cloud agent, Codespace, or other VM that printed `http://127.0.0.1:8080` (even with HTTP 200) is a different machine. Start the server in a terminal on the Desktop, then open the URL that terminal prints.

## Steps

1. On your computer, open this repo's root in Cursor (`File → Open Folder`). The folder contains `package.json` and `index.html`. Use the clone on the Desktop.
2. Open a terminal at that root (`Terminal → New Terminal`). On macOS or Linux, `pwd` should end in the repo folder. On Windows, `cd` should show that folder.
3. Start the server and leave the terminal open:

   ```bash
   npm start
   ```

   That runs `tools/serve.mjs` with Node's built-in `http` module. No packages are installed. It binds `127.0.0.1` only.

4. Read the last line. It is the only URL to open, for example:

   ```text
   Tax research scaffold at http://127.0.0.1:8080
   ```

   If 8080 is busy, the process tries 8081, then 8082, through 8090 (or `PORT` through `PORT+10`) and prints the port that listened. `PORT=8095 npm start` starts the walk at 8095.

5. Open **that exact URL** in Cursor Simple Browser (`View → Simple Browser`) or in Chrome on the same computer. `file://` cannot load the fixtures: ES modules and `fetch` need this server.

Closing the terminal stops the desk.

## ERR_CONNECTION_REFUSED

Chrome is talking to a port on this computer where nothing is accepting connections.

- The terminal is not running `npm start` on this Desktop. A log from a cloud agent is a log from another computer.
- The terminal printed a different port. Open the printed URL. A saved bookmark to port 8080 is the wrong address when the log says 8081 or anything else.
- The process exited. Run `npm start` again and leave that terminal open.
- The address bar says `localhost` and still refuses while the printed `127.0.0.1` URL works. Use the printed URL. This server listens on IPv4 `127.0.0.1`.

## EADDRINUSE

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

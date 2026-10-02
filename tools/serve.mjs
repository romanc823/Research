/**
 * Zero-dependency static server for the Phase A desk.
 *
 * Listens on 127.0.0.1 only. If the preferred port is busy, tries the next
 * ports in a span of 11 (8080–8090 unless PORT is set) and prints the URL
 * that accepted the bind. This process is reachable only on the computer
 * where it is running.
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";
const PORT_SPAN = 11;

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gz": "application/octet-stream",
  ".wasm": "application/wasm",
  ".ttf": "font/ttf",
};

function preferredPort(raw = process.env.PORT) {
  if (raw == null || String(raw).trim() === "") return 8080;
  const text = String(raw).trim();
  const n = Number(text);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    console.error(`PORT must be an integer from 1 to 65535. Got ${JSON.stringify(raw)}.`);
    console.error("Example: PORT=8080 npm start");
    process.exit(1);
  }
  return n;
}

function portsToTry(start) {
  const last = Math.min(start + PORT_SPAN - 1, 65535);
  const ports = [];
  for (let port = start; port <= last; port += 1) ports.push(port);
  return ports;
}

function killCommand(port) {
  if (process.platform === "win32") {
    return `for /f "tokens=5" %a in ('netstat -ano ^| findstr :${port} ^| findstr LISTENING') do taskkill /F /PID %a`;
  }
  return `kill $(lsof -t -iTCP:${port} -sTCP:LISTEN)`;
}

function handle(req, res) {
  let url;
  try {
    url = new URL(req.url || "/", `http://${HOST}`);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  let rel;
  try {
    rel = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (rel.endsWith("/")) rel += "index.html";
  const full = path.normalize(path.join(root, rel));
  if (full !== root && !full.startsWith(root + path.sep)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }
  fs.readFile(full, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": types[path.extname(full)] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

function listenOnce(server, port) {
  return new Promise((resolve, reject) => {
    function onError(err) {
      cleanup();
      if (err.code === "EADDRINUSE" || err.code === "EACCES") {
        resolve(err);
        return;
      }
      reject(err);
    }
    function onListening() {
      cleanup();
      resolve(null);
    }
    function cleanup() {
      server.removeListener("error", onError);
      server.removeListener("listening", onListening);
    }
    server.on("error", onError);
    server.on("listening", onListening);
    server.listen(port, HOST);
  });
}

function announce(preferred, skipped, port) {
  if (skipped.length) {
    const first = skipped[0].port;
    const last = skipped[skipped.length - 1].port;
    const span = first === last ? String(first) : `${first}–${last}`;
    const codes = [...new Set(skipped.map((item) => item.code))].join(", ");
    console.log(`Preferred port ${preferred} is busy (${codes} on ${span}).`);
  }
  console.log("Leave this terminal open. Open the URL below in Cursor Simple Browser or Chrome on this computer.");
  console.log(`Tax research scaffold at http://${HOST}:${port}`);
}

function giveUp(ports, skipped) {
  const first = ports[0];
  const last = ports[ports.length - 1];
  const span = first === last ? String(first) : `${first}–${last}`;
  const codes = [...new Set(skipped.map((item) => item.code))].join(", ");
  console.error(`No free port in ${span} on ${HOST} (${codes}).`);
  console.error(`Kill whatever holds ${first}:`);
  console.error(killCommand(first));
  if (last < 65535) {
    const next = last + 1;
    console.error("Or start on another port:");
    console.error(`PORT=${next} npm start`);
    if (process.platform === "win32") {
      console.error(`cmd: set PORT=${next}&& npm start`);
      console.error(`PowerShell: $env:PORT=${next}; npm start`);
    }
  }
  process.exit(1);
}

async function main() {
  const preferred = preferredPort();
  const ports = portsToTry(preferred);
  const server = http.createServer(handle);
  const skipped = [];

  for (const port of ports) {
    const err = await listenOnce(server, port);
    if (!err) {
      announce(preferred, skipped, port);
      server.on("error", (later) => {
        console.error(later.message);
        process.exit(1);
      });
      return;
    }
    skipped.push({ port, code: err.code });
  }

  giveUp(ports, skipped);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack || err.message : err);
  process.exit(1);
});

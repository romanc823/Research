/**
 * JSON fixture gate. Document ingest (PDF, JPEG, PNG) lives in js/ingest.js.
 * The public desk still refuses non-JSON, a missing anon flag, and any SSN or EIN.
 * The internal desk redacts those patterns in memory and does not require anon.
 */

const SSN = /\b\d{3}-\d{2}-\d{4}\b/;
const EIN = /\b\d{2}-\d{7}\b/;
const BANNED_KEYS = new Set([
  "ssn",
  "ein",
  "social_security",
  "taxpayer_name",
  "legal_name",
  "first_name",
  "last_name",
  "client_name",
]);

function findBannedKey(value, path = []) {
  if (!value || typeof value !== "object") return null;
  for (const [key, child] of Object.entries(value)) {
    if (BANNED_KEYS.has(key.toLowerCase())) return [...path, key].join(".");
    const nested = findBannedKey(child, [...path, key]);
    if (nested) return nested;
  }
  return null;
}

function redactIds(value) {
  return String(value).replace(/\b\d{3}-\d{2}-\d{4}\b/g, "[redacted]").replace(/\b\d{2}-\d{7}\b/g, "[redacted]");
}

function stripBanned(value) {
  if (Array.isArray(value)) return value.map(stripBanned);
  if (!value || typeof value !== "object") return value;
  const out = {};
  for (const [key, child] of Object.entries(value)) {
    if (BANNED_KEYS.has(key.toLowerCase())) continue;
    out[key] = stripBanned(child);
  }
  return out;
}

function redactTree(value) {
  if (typeof value === "string") return redactIds(value);
  if (Array.isArray(value)) return value.map(redactTree);
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, child] of Object.entries(value)) out[key] = redactTree(child);
    return out;
  }
  return value;
}

export function parseFixtureText(raw, options = {}) {
  const privateMode = options.privateMode === true;
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("The file was empty.");
  }
  if (!privateMode && (SSN.test(raw) || EIN.test(raw))) {
    throw new Error("This file looks like it contains an SSN or EIN. Phase A accepts anonymized fixtures only.");
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error("That file is not JSON. Drop a fixture, not a PDF or a tax-software export.");
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Fixture JSON must be one object.");
  }
  if (data.anon !== true && !privateMode) {
    throw new Error("Set anon: true. Live client packets are out of scope.");
  }
  const banned = findBannedKey(data);
  if (banned && !privateMode) {
    throw new Error(`Remove "${banned}". Fixtures stay anonymized.`);
  }
  if (!data.fields || typeof data.fields !== "object" || Array.isArray(data.fields)) {
    throw new Error("Fixture needs a fields object.");
  }
  if (privateMode) {
    const redacted = stripBanned(redactTree(data));
    redacted.ephemeral = true;
    if (redacted.anon !== true) redacted.anon = false;
    return redacted;
  }
  return data;
}

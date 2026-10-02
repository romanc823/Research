/**
 * JSON fixture gate. Document ingest (PDF, JPEG, PNG) lives in js/ingest.js.
 * This function still refuses non-JSON, a missing anon flag, and any SSN or EIN.
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

export function parseFixtureText(raw) {
  if (typeof raw !== "string" || raw.trim() === "") {
    throw new Error("The file was empty.");
  }
  if (SSN.test(raw) || EIN.test(raw)) {
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
  if (data.anon !== true) {
    throw new Error("Set anon: true. Live client packets are out of scope.");
  }
  const banned = findBannedKey(data);
  if (banned) {
    throw new Error(`Remove "${banned}". Fixtures stay anonymized.`);
  }
  if (!data.fields || typeof data.fields !== "object" || Array.isArray(data.fields)) {
    throw new Error("Fixture needs a fields object.");
  }
  return data;
}

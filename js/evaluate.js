/**
 * Glue for the research UI and the fixture checker.
 * Drop → the fixture is already a packet (ingest stub) → extract → score → present.
 */

import { extractFields, assertFieldsOnly } from "./extract.js";
import { scoreAll, presentable, byTypeOrder, TYPE_ORDER } from "./score.js";
import { presentCopy, findTalkBan, FIXED_COPY } from "./present.js";

export function evaluateFixture(fixture, typesById = {}) {
  const fields = extractFields(fixture);
  const shape = assertFieldsOnly(fields);
  const scored = byTypeOrder(scoreAll(fields));
  const cards = presentable(scored).map((hit) => {
    const meta = typesById[hit.typeId] || {};
    let copy = null;
    let error = null;
    try {
      copy = presentCopy(hit, fields);
    } catch (err) {
      error = err.message;
    }
    const ban = findTalkBan(copy);
    const fixedOk = hit.typeId !== "14" && hit.typeId !== "15"
      ? true
      : copy === FIXED_COPY[hit.typeId];
    return {
      ...hit,
      name: meta.name || `Type ${hit.typeId}`,
      cite: meta.cite || "",
      trigger: meta.trigger_summary || "",
      registryPassTag: meta.pass_tag || null,
      copy,
      ban,
      error,
      fixedOk,
    };
  });
  return { fields, shape, scored, cards };
}

function sortIds(ids) {
  return [...ids].sort((a, b) => TYPE_ORDER.indexOf(String(a)) - TYPE_ORDER.indexOf(String(b)));
}

export function matchExpectation(fixture, cards) {
  const high = sortIds(cards.filter((card) => card.band === "High").map((card) => card.typeId));
  const medium = sortIds(cards.filter((card) => card.band === "Medium").map((card) => card.typeId));
  const expectedHigh = sortIds(fixture.expected?.high || []);
  const expectedMedium = sortIds(fixture.expected?.medium || []);
  const same = (left, right) => left.length === right.length && left.every((id, index) => id === right[index]);
  const bans = cards.filter((card) => card.ban || card.error || card.fixedOk === false);
  return {
    ok: same(high, expectedHigh) && same(medium, expectedMedium) && bans.length === 0,
    high,
    medium,
    expectedHigh,
    expectedMedium,
    bans: bans.map((card) => ({
      typeId: card.typeId,
      ban: card.ban,
      error: card.error,
      fixedOk: card.fixedOk,
    })),
  };
}

export function copyShapeOk(copy, typeId) {
  if (typeId === "14") return copy === FIXED_COPY[14];
  if (typeId === "15") return copy === FIXED_COPY[15];
  if (!copy) return false;
  const signal = copy.indexOf("Signal:");
  const docs = copy.indexOf("Docs:");
  const gate = copy.indexOf("Gate:");
  const next = copy.indexOf("Next:");
  return signal === 0 && signal < docs && docs < gate && gate < next;
}

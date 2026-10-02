/**
 * Public desk is the default. Internal review is an explicit URL flag
 * (?desk=private) on a machine you control. The flag is not access control
 * and it does not upload a packet.
 */

export const PUBLIC_PAGE_CAP = 40;
export const PRIVATE_PAGE_CAP = 100;

export function isPrivateDesk(search) {
  const query = typeof search === "string" ? search : "";
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  return params.get("desk") === "private";
}

export function pageCap(privateMode) {
  return privateMode ? PRIVATE_PAGE_CAP : PUBLIC_PAGE_CAP;
}

export function pageCapMessage(pages, cap, privateMode) {
  const which = privateMode ? "internal desk" : "public desk";
  return `This PDF has ${pages} pages. The ${which} stops at ${cap} pages. The packet was not scored. Missing amounts were not filled with zero.`;
}

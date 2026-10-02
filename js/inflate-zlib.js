/**
 * zlib wrapper (RFC 1950), which is what PDF FlateDecode and PNG IDAT use.
 * Node inflates synchronously. Browsers use DecompressionStream.
 */

export async function inflateZlib(data) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (typeof process !== "undefined" && process.versions?.node) {
    const { inflateSync } = await import("node:zlib");
    return new Uint8Array(inflateSync(bytes));
  }
  if (typeof DecompressionStream !== "function") {
    throw new Error("This file is compressed, and this browser cannot inflate it.");
  }
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

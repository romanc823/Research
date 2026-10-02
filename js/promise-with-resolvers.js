/**
 * PDF.js 6 calls Promise.withResolvers while opening a document and
 * while decoding CCITT and JBIG2. Node 20 does not provide that method.
 * Install it on this global before pdf.js is loaded.
 */
export function installPromiseWithResolvers() {
  if (typeof Promise.withResolvers === "function") return;
  Object.defineProperty(Promise, "withResolvers", {
    configurable: true,
    writable: true,
    value() {
      let resolve;
      let reject;
      const promise = new Promise((res, rej) => {
        resolve = res;
        reject = rej;
      });
      return { promise, resolve, reject };
    },
  });
}

installPromiseWithResolvers();

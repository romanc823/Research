/**
 * Worker entry for Pages. The polyfill has to run in this worker
 * global before pdf.worker.min.js evaluates Promise.withResolvers.
 */
import "../../js/promise-with-resolvers.js";

export { WorkerMessageHandler } from "./pdf.worker.min.js";

// Compatibility exports for existing showcase callers. The durable queue
// implementation now lives in editorial-queue.mjs so news and showcase
// continuations share packet/state validation without sharing authorization.
export { advanceEditorialQueue, advanceShowcaseQueue } from "./editorial-queue.mjs";

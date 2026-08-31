import { windowForEditionId } from "./edition-window.mjs";

export function expectedEditorialWindow(editionId) {
  return windowForEditionId(editionId);
}

export function validateFinalizedEditorialPacket(packet, { editionId, period } = {}) {
  const errors = [];
  const expected = expectedEditorialWindow(editionId);
  if (!expected) return ["expected edition ID must match YYYY-MM-DD-am|pm|daily"];
  if (period && period !== expected.period) errors.push(`expected period ${period} does not match edition ${editionId}`);
  if (!packet || typeof packet !== "object") return [...errors, "packet must be an object"];

  const input = packet.editorialInput;
  const window = input?.window;
  if (packet.schemaVersion !== 3) errors.push("packet must use finalized schemaVersion 3");
  if (packet.mode !== "chatgpt-handoff") errors.push("packet mode must be chatgpt-handoff");
  if (!input || input.schemaVersion !== 2) errors.push("packet.editorialInput must use schemaVersion 2");
  if (!Array.isArray(input?.packages)) errors.push("packet.editorialInput.packages must be an array");
  if (!Array.isArray(input?.trackingQueue)) errors.push("packet.editorialInput.trackingQueue must be an array");
  if (!packet.outputSchema || typeof packet.outputSchema !== "object") errors.push("packet.outputSchema is required");

  if (!window || typeof window !== "object") {
    errors.push("packet.editorialInput.window is required");
  } else {
    for (const key of ["id", "period", "plannedAt", "windowStart", "windowEnd"]) {
      if (window[key] !== expected[key]) errors.push(`packet window ${key} must be ${expected[key]}`);
    }
  }

  if (packet.coverageThrough !== expected.windowEnd) {
    errors.push(`packet coverageThrough must be ${expected.windowEnd}`);
  }
  const cutoffAt = Date.parse(`${expected.windowEnd.replace(" ", "T")}:00+08:00`);
  const finalizedAt = Date.parse(packet.finalizedAt);
  if (!Number.isFinite(finalizedAt) || finalizedAt < cutoffAt) {
    errors.push("packet finalizedAt must be at or after the fixed cutoff");
  }

  return [...new Set(errors)];
}

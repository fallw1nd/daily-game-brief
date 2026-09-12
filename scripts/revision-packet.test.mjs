import { describe, expect, it } from "vitest";
import { validateRevisionPacket } from "./lib/revision-packet.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";

const sha = "a".repeat(40);
const editionId = "2026-09-11-daily";
const wake = { editionId, period: "daily", reason: "user_authorized_same_edition_revision", packetBlobSha: sha };
const state = { editionId, revisionRequest: { status: "open", reason: wake.reason }, editorial: { status: "pending" }, transitions: [{ event: "packet-ready", packetBlobSha: sha }] };
const packet = { schemaVersion: 3, mode: "chatgpt-handoff", outputSchema: {}, finalizedAt: "2026-09-11T02:11:00Z", coverageThrough: "2026-09-11 10:10", editorialInput: { schemaVersion: 2, window: expectedEditorialWindow(editionId), packages: [], trackingQueue: [] } };

describe("reusing acknowledged evidence for historical revision", () => {
  it("accepts the original immutable packet without refetching a changed feed", () => {
    expect(validateRevisionPacket(state, wake, packet)).toBe(sha);
  });
  it("rejects an unacknowledged packet or another edition's window", () => {
    expect(() => validateRevisionPacket({ ...state, transitions: [] }, wake, packet)).toThrow("never acknowledged");
    expect(() => validateRevisionPacket(state, wake, { ...packet, editorialInput: { ...packet.editorialInput, window: expectedEditorialWindow("2026-09-12-daily") } })).toThrow("window");
  });
  it("rejects packet replacement after editorial consumption or without authorization", () => {
    expect(() => validateRevisionPacket({ ...state, editorial: { status: "submitted" } }, wake, packet)).toThrow("unconsumed");
    expect(() => validateRevisionPacket(state, { ...wake, reason: "packet_missing_at_handoff" }, packet)).toThrow("authorized");
  });
});

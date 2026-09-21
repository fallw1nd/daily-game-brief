import { describe, expect, it } from "vitest";
import { applyRevisionSubjectIdentityOverrides, validateRevisionPacket } from "./lib/revision-packet.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";

const sha = "a".repeat(40);
const editionId = "2026-09-11-daily";
const wake = { editionId, period: "daily", reason: "user_authorized_same_edition_revision", packetBlobSha: sha };
const state = { editionId, revisionRequest: { status: "open", reason: wake.reason }, editorial: { status: "pending" }, transitions: [{ event: "packet-ready", packetBlobSha: sha }] };
const packet = {
  schemaVersion: 3,
  mode: "chatgpt-handoff",
  outputSchema: {},
  finalizedAt: "2026-09-11T02:11:00Z",
  coverageThrough: "2026-09-11 10:10",
  editorialInput: {
    schemaVersion: 2,
    window: expectedEditorialWindow(editionId),
    packages: [{
      eventKey: "event-1",
      eventKind: "other",
      subjectKey: null,
      subject: { kind: "topic", key: null },
      publishability: "requires_subject_identity",
      headline: "Example Game launches today",
      tier: "A",
      score: 135,
      timeRelation: "window",
      readiness: "needs-independent-report",
      sources: [{ sourceIndex: 0, status: "opened", kind: "primary", label: "Official", url: "https://example.com/game" }],
    }],
    trackingQueue: [],
  },
};

describe("reusing acknowledged evidence for historical revision", () => {
  it("accepts the original immutable packet without refetching a changed feed", () => {
    expect(validateRevisionPacket(state, wake, packet)).toBe(sha);
  });
  it("rejects an unacknowledged packet or another edition's window", () => {
    expect(() => validateRevisionPacket({ ...state, transitions: [] }, wake, packet)).toThrow("never acknowledged");
    expect(() => validateRevisionPacket(state, { ...wake, reason: "packet_missing_at_handoff" }, packet)).toThrow("authorized");
  });
  it("rejects packet replacement after editorial consumption or without authorization", () => {
    expect(() => validateRevisionPacket({ ...state, editorial: { status: "submitted" } }, wake, packet)).toThrow("unconsumed");
    expect(() => validateRevisionPacket(state, { ...wake, reason: "packet_missing_at_handoff" }, packet)).toThrow("authorized");
  });
  it("repairs only an unresolved subject identity on acknowledged evidence", () => {
    const repaired = applyRevisionSubjectIdentityOverrides(packet, {
      ...wake,
      subjectIdentityOverrides: { "event-1": { key: "example-game", kind: "game" } },
    });
    expect(repaired).not.toBe(packet);
    expect(packet.editorialInput.packages[0].publishability).toBe("requires_subject_identity");
    expect(repaired.editorialInput.packages[0]).toMatchObject({
      eventKey: "event-1",
      subjectKey: "example-game",
      subject: { kind: "game", key: "example-game" },
      publishability: "direct",
      headline: packet.editorialInput.packages[0].headline,
      sources: packet.editorialInput.packages[0].sources,
    });
  });
  it("refuses identity repair for unknown, already-direct, or evidence-less candidates", () => {
    expect(() => applyRevisionSubjectIdentityOverrides(packet, {
      ...wake,
      subjectIdentityOverrides: { missing: "missing-game" },
    })).toThrow("unknown event");
    const direct = structuredClone(packet);
    direct.editorialInput.packages[0].subjectKey = "example-game";
    direct.editorialInput.packages[0].publishability = "direct";
    expect(() => applyRevisionSubjectIdentityOverrides(direct, {
      ...wake,
      subjectIdentityOverrides: { "event-1": "example-game" },
    })).toThrow("only allowed for unresolved");
    const closed = structuredClone(packet);
    closed.editorialInput.packages[0].sources[0].status = "failed";
    expect(() => applyRevisionSubjectIdentityOverrides(closed, {
      ...wake,
      subjectIdentityOverrides: { "event-1": "example-game" },
    })).toThrow("opened evidence");
  });
});

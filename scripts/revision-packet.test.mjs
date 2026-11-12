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


describe("bound resolved-company identity correction", () => {
  function setup() {
    const original = structuredClone(packet);
    Object.assign(original.editorialInput.packages[0], { subjectKey: "ever17", publishability: "direct",
      headline: '『Ever17』の作者が新会社「Crash Keys」設立',
      sources: [{ sourceIndex: 0, status: "opened", url: "https://example.com/company", evidenceText: "株式会社Crash Keysの設立を正式に発表した。" }] });
    const override = { key: "crash-keys", kind: "entity", expectedOldSubjectKey: "ever17", expectedEntryId: `${editionId}-industry-0`,
      expectedBeijingTime: "2026-09-11 00:01", expectedSourceUrls: ["https://example.com/company"] };
    return { original, override };
  }
  it("changes only identity metadata while retaining original opened evidence and event identity", () => {
    const { original, override } = setup();
    const repaired = applyRevisionSubjectIdentityOverrides(original, { ...wake, subjectIdentityOverrides: { "event-1": override } });
    const item = repaired.editorialInput.packages[0];
    expect(item).toMatchObject({ subjectKey: "crash-keys", eventKind: "company", subject: { kind: "entity", key: "crash-keys" },
      subjectIdentityRepair: { originalPacketBlobSha: sha, previousSubjectKey: "ever17", expectedEntryId: override.expectedEntryId } });
    expect(item.sources).toEqual(original.editorialInput.packages[0].sources);
    expect(item.eventKey).toBe("event-1");
    expect(original.editorialInput.packages[0].subjectKey).toBe("ever17");
  });
  it("rejects wrong old/new identity, unverified evidence, sources, or nonmanual authorization", () => {
    for (const patch of [{ expectedOldSubjectKey: "other" }, { key: "wrong-company" }, { kind: "game" }, { expectedSourceUrls: ["https://other.example/"] }]) {
      const { original, override } = setup();
      expect(() => applyRevisionSubjectIdentityOverrides(original, { ...wake, subjectIdentityOverrides: { "event-1": { ...override, ...patch } } })).toThrow("bound, confirmed company");
    }
    const { original, override } = setup();
    expect(() => applyRevisionSubjectIdentityOverrides(original, { ...wake, reason: "editorial_continuation", subjectIdentityOverrides: { "event-1": override } })).toThrow();
    original.editorialInput.packages[0].sources[0].evidenceText = "Ever17 has a new game.";
    expect(() => applyRevisionSubjectIdentityOverrides(original, { ...wake, subjectIdentityOverrides: { "event-1": override } })).toThrow();
  });
});

describe("bound new-game identity correction", () => {
  function setup() {
    const original = structuredClone(packet);
    Object.assign(original.editorialInput.packages[0], { subjectKey: "milk inside a bag of milk inside a bag of milk", publishability: "direct", eventKind: "announcement",
      headline: '『Milk inside a bag of milk inside a bag of milk』開発者による新作『MEGALITH』発表。',
      sources: [{ sourceIndex: 0, status: "opened", url: "https://example.com/megalith", evidenceText: "Nikita Kryukov氏は11月11日、『MEGALITH』を発表した。" }] });
    const override = { key: "megalith", kind: "game", expectedOldSubjectKey: original.editorialInput.packages[0].subjectKey,
      expectedEntryId: `${editionId}-news-2`, expectedBeijingTime: "2026-09-11 00:01", expectedSourceUrls: ["https://example.com/megalith"] };
    return { original, override };
  }
  it("preserves original event and source bytes with explicit old-identity bindings", () => {
    const { original, override } = setup();
    const item = applyRevisionSubjectIdentityOverrides(original, { ...wake, subjectIdentityOverrides: { "event-1": override } }).editorialInput.packages[0];
    expect(item).toMatchObject({ eventKey: "event-1", subjectKey: "megalith", eventKind: "announcement", subject: { kind: "game", key: "megalith" },
      subjectIdentityRepair: { kind: "confirmed-new-game-announcement", originalPacketBlobSha: sha, previousSubjectKey: override.expectedOldSubjectKey } });
    expect(item.sources).toEqual(original.editorialInput.packages[0].sources);
    expect(item.headline).toBe(original.editorialInput.packages[0].headline);
  });
  it("rejects wrong kind, title, old key, source and nonmanual permission", () => {
    const { original, override } = setup();
    for (const patch of [{ kind: "entity" }, { key: "other-game" }, { expectedOldSubjectKey: "wrong" }, { expectedSourceUrls: ["https://other.example/"] }]) {
      expect(() => applyRevisionSubjectIdentityOverrides(original, { ...wake, subjectIdentityOverrides: { "event-1": { ...override, ...patch } } })).toThrow();
    }
    expect(() => applyRevisionSubjectIdentityOverrides(original, { ...wake, reason: "editorial_continuation", subjectIdentityOverrides: { "event-1": override } })).toThrow();
    original.editorialInput.packages[0].sources[0].evidenceText = original.editorialInput.packages[0].headline;
    expect(() => applyRevisionSubjectIdentityOverrides(original, { ...wake, subjectIdentityOverrides: { "event-1": override } })).toThrow();
  });
});

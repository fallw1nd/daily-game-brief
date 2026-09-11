import { describe, expect, it } from "vitest";
import { mergeShowcaseReports, refreshedShowcaseBatches } from "./lib/showcase-refresh.mjs";

describe("showcase source recovery", () => {
  const original = { window: { id: "fixed" }, events: [{ id: "direct", sources: [{ region: "jp", inventoryComplete: true, status: "parsed" }] }], announcements: [{ id: "game", factUnits: [{ id: "game:fact-0", text: "Release" }, { id: "game:fact-1", text: "Demo" }] }] };
  it("keeps fact identity across reordered paragraphs and assigns a fresh ID to new text", () => {
    const fresh = structuredClone(original);
    fresh.announcements[0].factUnits = [{ id: "game:fact-0", text: "Demo" }, { id: "game:fact-1", text: "DLC" }];
    const merged = mergeShowcaseReports(original, fresh);
    expect(merged.announcements[0].factUnits).toEqual([...original.announcements[0].factUnits, { id: "game:fact-2", text: "DLC" }]);
    expect(mergeShowcaseReports(merged, fresh).announcements).toEqual(merged.announcements);
  });
  it("retains known evidence on source failure without retaining a complete status", () => {
    const merged = mergeShowcaseReports(original, { window: original.window, events: [], announcements: [] });
    expect(merged.announcements).toEqual(original.announcements);
    expect(merged.events[0].sources[0].inventoryComplete).toBe(false);
  });
  it("rejects a refresh for a different edition window", () => {
    expect(() => mergeShowcaseReports(original, { ...original, window: { id: "later" } })).toThrow("original edition window");
  });
  it("measures the complete serialized packet and queues every announcement within the input limit", () => {
    const window = { id: "2026-09-10-daily", period: "daily", plannedAt: "2026-09-10 12:00", windowStart: "2026-09-09 10:10", windowEnd: "2026-09-10 10:10" };
    const report = { window, generatedAt: "2026-09-11T02:10:00Z", events: [{ id: "direct", sources: [] }], coverage: [], announcements: Array.from({ length: 45 }, (_, index) => ({ id: `game-${index}`, showcaseId: "direct", subjectKey: `Game ${index}`, headline: "Release announcement", publishedAt: "2026-09-09T14:00:00Z", sourceUrl: "https://www.nintendo.com/direct", evidenceText: "Verified announcement details. ".repeat(60), factUnits: [{ id: `fact-${index}`, text: "Release" }] })) };
    const batches = refreshedShowcaseBatches({ report, canonical: { id: window.id, entries: [] }, template: {}, generation: 1, maxChars: 18000 });
    expect(batches.length).toBeGreaterThan(1);
    expect(new Set(batches.flatMap(batch => batch.eventKeys)).size).toBe(45);
    expect(batches.every(batch => JSON.stringify(batch.packet.editorialInput).length <= 18000)).toBe(true);
  });
});

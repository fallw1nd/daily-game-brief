import { describe, expect, it } from "vitest";
import { aggregateCalendarLeads } from "./lib/release-calendar-identity.mjs";
import { decodeCalendarPacket, selectCalendarPacket } from "./lib/release-calendar-packet.mjs";
import { leadPlatformFamilies, rankCalendarLeads, selectCalendarLeads } from "./lib/release-calendar-selection.mjs";

const record = (title, sourceId, platform, extra = {}) => ({
  title,
  date: "2026-10-02",
  dates: ["2026-10-02"],
  dateText: "October 2",
  url: `https://example.com/${sourceId}/${encodeURIComponent(title)}`,
  announcementUrl: `https://example.com/announcements/${sourceId}`,
  sourceId,
  sourceIds: [sourceId],
  productId: `${sourceId}:${title}`,
  platforms: [platform],
  platform: platform,
  platformFamily: platform,
  region: "US",
  releaseType: "full_release",
  family: sourceId,
  kind: sourceId === "publisher" ? "primary" : "discovery",
  priority: 1,
  ...extra,
});

describe("release-calendar packet selection", () => {
  it("restores every source observation and preserves conflicts and identity metadata", () => {
    const leads = aggregateCalendarLeads([
      record("Twin Release", "publisher", "PS5", { date: "2026-10-02", dates: ["2026-10-02"] }),
      record("Twin Release", "calendar", "PS5", { date: "2026-10-03", dates: ["2026-10-03"], url: "https://example.com/calendar/twin" }),
    ]);
    expect(leads).toHaveLength(1);
    expect(leads[0]).toMatchObject({ date: null, dateConflict: true, dateConflictStatus: "conflict" });
    const packet = selectCalendarPacket({ report: { candidates: leads, reviewLinks: [] } });
    const restored = decodeCalendarPacket(packet)[0];
    expect(restored.observations.map(({ normalizedTitle, ...observation }) => observation)).toEqual(leads[0].observations.map(({ normalizedTitle, ...observation }) => observation));
    expect(restored.observations).toHaveLength(2);
    expect(restored.observations.map((item) => item.sourceId).sort()).toEqual(["calendar", "publisher"]);
    expect(restored).toMatchObject({ title: "Twin Release", date: null, dateConflictStatus: "conflict", identityStatus: "needs_verification" });
    expect(restored.observations.map((item) => item.announcementUrl)).toEqual(expect.arrayContaining([
      "https://example.com/announcements/calendar", "https://example.com/announcements/publisher",
    ]));
    expect(restored.observations.map((item) => item.productId)).toEqual(expect.arrayContaining(["calendar:Twin Release", "publisher:Twin Release"]));
    expect(packet.omissionTelemetry.platformFinalTaskCounts).toMatchObject({ PlayStation: 1 });
  });

  it("uses platform claims across observations instead of the lead's first source family", () => {
    const lead = aggregateCalendarLeads([
      record("Console Lead", "media", "PC"),
      record("Console Lead", "publisher", "Nintendo Switch"),
    ])[0];
    expect(lead.family).toBe("media");
    expect(leadPlatformFamilies(lead)).toEqual(["Nintendo", "PC"]);
  });

  it("gives a one-family console candidate a fit opportunity and skips oversized leads", () => {
    const oversized = aggregateCalendarLeads([record("Huge", "media", "PC", { url: `https://example.com/${"x".repeat(26000)}` })])[0];
    const console = aggregateCalendarLeads([record("Small Console", "publisher", "Xbox")])[0];
    const packet = selectCalendarPacket({ report: { candidates: [oversized, console], reviewLinks: [] } });
    expect(decodeCalendarPacket(packet).map((item) => item.title)).toEqual(["Small Console"]);
    expect(packet.omissionTelemetry.budgetOmittedTasks).toBe(1);
    expect(packet.omissionTelemetry.platformFinalTaskCounts.Xbox).toBe(1);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(24000);
  });

  it("keeps dated review links independent from game tasks", () => {
    const task = aggregateCalendarLeads([record("Dated Game", "publisher", "Nintendo Switch")]);
    const link = { title: "Launches October 2", url: "https://example.com/story", published: "2026-09-20", sourceId: "media" };
    const packet = selectCalendarPacket({ report: { candidates: task, reviewLinks: [link] } });
    expect(packet.candidates).toHaveLength(1);
    expect(packet.reviewLinks).toEqual([link]);
    expect(decodeCalendarPacket(packet)[0].title).toBe("Dated Game");
  });

  it("accounts for row cap omissions separately from byte omissions", () => {
    const candidates = [
      ...aggregateCalendarLeads([record("PC A", "steam", "PC")]),
      ...aggregateCalendarLeads([record("Nintendo B", "nintendo", "Nintendo Switch")]),
      ...aggregateCalendarLeads([record("Xbox C", "xbox", "Xbox")]),
    ];
    const packet = selectCalendarPacket({ report: { candidates, reviewLinks: [] }, maxCandidates: 2 });
    expect(packet.candidates).toHaveLength(2);
    expect(packet.omissionTelemetry.packetCapOmittedTasks).toBe(1);
    expect(packet.omissionTelemetry.budgetOmittedTasks).toBe(0);
    expect(packet.omittedCandidates).toBe(1);
  });

  it("keeps material date conflicts ahead of popularity tie-breakers", () => {
    const leads = [
      { title: "Popular", date: "2026-09-10", knownTitle: true, crossSource: true, priority: 3 },
      { title: "Conflict", date: null, dateConflict: true, dateConflictStatus: "conflict", priority: 0 },
      { title: "Baseline", date: "2026-09-12", inBaseline: true, priority: 0 },
    ];
    expect(rankCalendarLeads(leads).map((lead) => lead.title)).toEqual(["Conflict", "Baseline", "Popular"]);
    expect(selectCalendarLeads(leads, 1).candidates[0].title).toBe("Conflict");
  });
});

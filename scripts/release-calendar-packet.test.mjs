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
    const packet = selectCalendarPacket({ report: { candidates: [lead], reviewLinks: [] } });
    expect(packet.omissionTelemetry.platformFinalTaskCounts).toMatchObject({ Nintendo: 1, PC: 1 });
  });

  it("retains an observation's known platform family without inventing a device", () => {
    const lead = aggregateCalendarLeads([{
      title: "Nintendo unknown device",
      date: "2026-10-02",
      url: "https://nintendo.com/a",
      platforms: [],
      platformFamily: "Nintendo",
      sourceId: "nintendo",
    }])[0];
    expect(leadPlatformFamilies(lead)).toEqual(["Nintendo"]);
    expect(lead.platforms).toEqual([]);
    expect(leadPlatformFamilies({ observations: [{ family: "nintendo" }] })).toEqual([]);
    const reportCap = selectCalendarLeads([lead, { title: "A unknown", date: "2026-10-02" }], 1);
    expect(reportCap.candidates).toContain(lead);
    expect(reportCap.capOmittedTasks).toBe(1);
    const packet = selectCalendarPacket({ report: { candidates: [lead], reviewLinks: [] } });
    expect(packet.omissionTelemetry.platformFinalTaskCounts.Nintendo).toBe(1);
    expect(packet.omissionTelemetry.platformFloorOmittedFamilies).toEqual([]);
    const capped = selectCalendarPacket({ report: { candidates: [lead], reviewLinks: [] }, maxCandidates: 0 });
    expect(capped.omissionTelemetry.packetCapOmittedTasks).toBe(1);
    expect(capped.omissionTelemetry.platformCapOmittedFamilies).toEqual(["Nintendo"]);
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

  it("keeps an in-window PlayStation review link when PC task volume is high", () => {
    const tasks = aggregateCalendarLeads(Array.from({ length: 8 }, (_, index) => record(`PC Game ${index}`, "steam", "PC", index === 0 ? { url: `https://example.com/${"x".repeat(10000)}` } : {})));
    const link = { title: "Launches October 2", url: "https://example.com/story", published: "2026-09-20", sourceId: "media", dateStatus: "in_window", sourcePlatform: "PlayStation" };
    const packet = selectCalendarPacket({ report: { candidates: tasks, reviewLinks: [link] }, maxChars: 3000 });
    expect(packet.candidates.length).toBeGreaterThan(0);
    expect(packet.reviewLinks).toEqual([link]);
    expect(packet.omissionTelemetry.linkOmitted).toBe(0);
    expect(packet.omissionTelemetry.platformFinalTaskCounts.PC).toBeGreaterThan(0);
  });

  it("reserves a dated PlayStation link and a PC task before extra links", () => {
    const [pcTask] = aggregateCalendarLeads([record("PC Small task", "steam", "PC", {
      url: "https://store.steampowered.com/app/1",
    })]);
    const links = Array.from({ length: 8 }, (_, index) => ({
      title: `PS lead ${index}`,
      url: `https://blog.playstation.com/i/${"x".repeat(220)}`,
      sourcePlatform: "PlayStation",
      dateStatus: "in_window",
    }));
    const packet = selectCalendarPacket({ report: { candidates: [pcTask], reviewLinks: links }, maxChars: 2400 });
    expect(packet.candidates.map(({ title }) => title)).toEqual(["PC Small task"]);
    expect(packet.reviewLinks.length).toBeGreaterThanOrEqual(1);
    expect(packet.omissionTelemetry.platformFinalTaskCounts.PC).toBe(1);
    expect(packet.omissionTelemetry.platformFinalLinkCounts.PlayStation).toBeGreaterThanOrEqual(1);
    expect(packet.omissionTelemetry.platformFloorOmittedFamilies).toEqual([]);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(2400);
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


  it("does not add report-stage cap omissions twice", () => {
    const candidate = aggregateCalendarLeads([record("One task", "publisher", "PlayStation")]);
    const packet = selectCalendarPacket({
      report: { candidates: candidate, omittedCandidates: 5, omissionTelemetry: { capOmittedTasks: 5 }, reviewLinks: [] },
    });
    expect(packet.omissionTelemetry).toMatchObject({ capOmittedTasks: 5, packetCapOmittedTasks: 0, budgetOmittedTasks: 0 });
    expect(packet.omittedCandidates).toBe(5);
  });

  it("keeps all four represented platform families after final sizing despite repeated links", () => {
    const candidates = aggregateCalendarLeads([
      record("PC Floor", "steam", "PC"),
      record("PS Floor", "publisher", "PlayStation"),
      record("Xbox Floor", "xbox", "Xbox"),
      record("Nintendo Floor", "nintendo", "Nintendo Switch"),
      record("Huge PC", "steam", "PC", { url: `https://example.com/${"x".repeat(12000)}` }),
    ]);
    const crowdedLinks = Array.from({ length: 8 }, (_, index) => ({
      title: `PS dated link ${index}`,
      url: `https://blog.playstation.com/${index}/${"z".repeat(180)}`,
      sourcePlatform: "PlayStation",
      dateStatus: "in_window",
    }));
    const packet = selectCalendarPacket({ report: { candidates, reviewLinks: crowdedLinks }, maxChars: 5000 });
    expect(packet.omissionTelemetry.platformFinalTaskCounts).toMatchObject({ PC: 1, PlayStation: 1, Xbox: 1, Nintendo: 1 });
    expect(packet.omissionTelemetry.platformFinalLinkCounts.PlayStation).toBeGreaterThanOrEqual(1);
    expect(packet.omissionTelemetry.platformFloorOmittedFamilies).toEqual([]);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(5000);
  });
  it("bounds floor search while retaining four-family opportunities at production scale", () => {
    const families = ["PC", "PlayStation", "Xbox", "Nintendo"];
    const candidates = aggregateCalendarLeads(Array.from({ length: 100 }, (_, index) => ({
      title: "Cost probe " + index,
      date: "2026-10-02",
      url: "https://example.com/" + index,
      platforms: [families[index % families.length]],
      sourceId: "source" + index % families.length,
    })));
    const reviewLinks = Array.from({ length: 8 }, (_, index) => ({
      title: "Dated lead " + index,
      url: "https://example.com/story/" + index,
      sourcePlatform: families[index % families.length],
      dateStatus: "in_window",
    }));
    const packet = selectCalendarPacket({ report: { candidates, reviewLinks } });

    for (const family of families) expect(packet.omissionTelemetry.platformFinalTaskCounts[family]).toBeGreaterThan(0);
    expect(packet.omissionTelemetry.platformFinalLinkCounts).toMatchObject({ PC: 1, PlayStation: 1, Xbox: 1, Nintendo: 1 });
    expect(packet.reviewLinks).toHaveLength(4);
    expect(JSON.stringify(packet).length).toBeLessThanOrEqual(24000);
  });

  it("keeps material date conflicts ahead of popularity tie-breakers", () => {
    const leads = [
      { title: "Popular", date: "2026-09-10", knownTitle: true, crossSource: true, priority: 3 },
      { title: "Conflict", date: null, dateConflict: true, dateConflictStatus: "conflict", priority: 0 },
      { title: "Baseline", date: "2026-09-12", inBaseline: true, priority: 0 },
    ];
    expect(rankCalendarLeads(leads).map((lead) => lead.title)).toEqual(["Conflict", "Popular", "Baseline"]);
    expect(selectCalendarLeads(leads, 1).candidates[0].title).toBe("Conflict");
    expect(rankCalendarLeads([{ title: "uncertain", dateConflictUncertain: true }, { title: "baseline-presence", inBaseline: true, knownTitle: true, crossSource: true }])[0].title).toBe("uncertain");
  });
});

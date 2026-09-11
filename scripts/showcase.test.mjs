import { describe, expect, it } from "vitest";
import { parseShowcasePage, auditShowcase, mergeShowcaseAnnouncements, batchShowcasePackages, showcaseRetryDue } from "./lib/showcase.mjs";

const event = { id: "state-of-play-2026-09-03", kind: "state-of-play", startsAt: "2026-09-03T21:00:00Z" };
const source = { region: "us", url: "https://blog.playstation.com/recap/", inventoryComplete: true };
describe("showcase announcement accounting", () => {
  it("reads Japanese transcript narration outside its metadata container", () => {
    const html = '<main><div class="subsection"><h2>テストゲーム</h2><ul><li>プラットフォーム名：Nintendo Switch 2</li><li>発売日：2026.12.4</li></ul></div><p>新しい体験版を配信します。</p><div class="subsection"><h2>オープニング</h2></div><p>みなさん、こんにちは。</p></main>';
    const result = parseShowcasePage(html, { ...source, region: "jp" }, { ...event, kind: "nintendo-direct" });
    expect(result.announcements).toHaveLength(1);
    expect(result.announcements[0].evidenceText).toContain("新しい体験版");
    expect(result.announcements[0].evidenceText).not.toContain("こんにちは");
  });
  it("extracts separate facts from one page without navigation or accessibility labels", () => {
    const html = '<article><div class="entry-content"><h2>Game One</h2><p>A new game launches in November.</p><h2 class="screen-reader-text">Download Image</h2><p>A demo is available now.</p><h2>Game One DLC</h2><p>An expansion launches next year.</p></div><h2>Latest news</h2><p>Unrelated news here.</p></article>';
    const parsed = parseShowcasePage(html, source, event);
    expect(parsed.announcements.map(item => item.subjectKey)).toEqual(["Game One", "Game One DLC"]);
    expect(parsed.announcements[0].evidenceText).toContain("demo");
    const audit = auditShowcase(event, parsed.announcements, [{ showcaseRefs: [{ showcaseId: event.id, announcementId: parsed.announcements[0].id, factIds: parsed.announcements[0].factUnits.map(fact => fact.id) }] }]);
    expect(audit.missing).toEqual([parsed.announcements[1].id]);
    expect(audit.status).toBe("partial");
  });
  it("never certifies highlights or failed regional sources as complete", () => {
    const item = { id: "one" };
    const entries = [{ showcaseRefs: [{ showcaseId: event.id, announcementId: "one" }] }];
    const sources = ["jp", "us", "eu"].map(region => ({ ...source, region, status: "parsed" }));
    expect(auditShowcase({ ...event, sources }, [item], entries).status).toBe("complete");
    sources[0].inventoryComplete = false;
    expect(auditShowcase({ ...event, sources }, [item], entries).status).toBe("partial");
    expect(auditShowcase(event, [item], [], [{ announcementId: "one", status: "budget", reason: "full", sourceUrl: source.url }]).missing).toEqual(["one"]);
  });
  it("requires every fact increment, even when the game and page already have a story", () => {
    const sources = ["jp", "us", "eu"].map(region => ({ ...source, region, status: "parsed" }));
    const announcement = { id: "game", factUnits: [{ id: "release" }, { id: "dlc" }] };
    const entries = [{ showcaseRefs: [{ showcaseId: event.id, announcementId: "game", factIds: ["release"] }] }];
    expect(auditShowcase({ ...event, sources }, [announcement], entries).status).toBe("partial");
    entries.push({ showcaseRefs: [{ showcaseId: event.id, announcementId: "game", factIds: ["dlc"] }] });
    expect(auditShowcase({ ...event, sources }, [announcement], entries).status).toBe("complete");
  });
  it("merges only verified equivalent announcements and preserves regional facts", () => {
    const items = ["jp", "us"].map(region => ({ id: region, equivalentAnnouncementId: "shared", region, sourceUrl: source.url, locator: region, evidenceText: `${region} release date` }));
    const merged = mergeShowcaseAnnouncements(items);
    expect(merged).toHaveLength(1);
    expect(merged[0].evidence).toHaveLength(2);
    expect(mergeShowcaseAnnouncements(items.map(({ equivalentAnnouncementId, ...item }) => item))).toHaveLength(2);
  });
  it("retains every package across bounded batches and rejects oversized items", () => {
    const packages = Array.from({ length: 30 }, (_, index) => ({ eventKey: `a${index}`, text: "a".repeat(100) }));
    const batches = batchShowcasePackages(packages, 500);
    expect(batches.flat()).toEqual(packages);
    expect(batches.length).toBeGreaterThan(1);
    expect(() => batchShowcasePackages(packages, 10)).toThrow("exceeds batch");
  });
  it("schedules 30 minute, two hour and six hour recovery", () => {
    const time = "2026-09-10T04:00:00Z";
    for (const [attempt, minutes] of [30, 120, 360].entries()) {
      expect(showcaseRetryDue(time, attempt, Date.parse(time) + minutes * 60000 - 1)).toBe(false);
      expect(showcaseRetryDue(time, attempt, Date.parse(time) + minutes * 60000)).toBe(true);
    }
  });
});

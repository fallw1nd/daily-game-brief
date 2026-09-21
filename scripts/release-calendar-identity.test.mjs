// @vitest-environment node
import { describe, expect, it } from "vitest";
import { aggregateCalendarLeads } from "./lib/release-calendar-identity.mjs";

const lead = (overrides = {}) => ({
  title: "Example Game",
  sourceId: "source-a",
  family: "a",
  kind: "primary",
  url: "https://a.example/game",
  productId: "store:1",
  platforms: ["PC"],
  region: "US",
  date: "2026-09-20",
  dateText: "September 20, 2026",
  releaseType: "full",
  ...overrides,
});

describe("calendar identity aggregation", () => {
  it("retains every source observation and scopes date conflicts", () => {
    const groups = aggregateCalendarLeads([
      lead(),
      lead({ sourceId: "source-b", family: "b", url: "https://b.example/game", platforms: ["PS5"], date: "2026-09-21" }),
      lead({ sourceId: "source-c", family: "c", url: "https://c.example/game", platforms: ["Xbox"], date: "2026-09-22" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].observationCount).toBe(3);
    expect(groups[0].sources).toEqual(["source-a", "source-b", "source-c"]);
    expect(groups[0].platforms).toEqual(["PC", "PS5", "Xbox"]);
    expect(groups[0].dates).toEqual(["2026-09-20", "2026-09-21", "2026-09-22"]);
    expect(groups[0].date).toBeNull();
    expect(groups[0].dateConflict).toBe(false);
    expect(groups[0].dateConflictStatus).toBe("none");
    expect(groups[0].sourceUrls).toEqual(["https://a.example/game", "https://b.example/game", "https://c.example/game"]);
  });

  it("deduplicates only identical observations and preserves announcement URLs", () => {
    const groups = aggregateCalendarLeads([
      lead({ announcementUrl: "https://news.example/a" }),
      lead({ announcementUrl: "https://news.example/a" }),
      lead({ sourceId: "source-b", url: "https://b.example/game", announcementUrl: "https://news.example/b" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].observationCount).toBe(2);
    expect(groups[0].sourceUrls).toEqual(["https://a.example/game", "https://b.example/game", "https://news.example/a", "https://news.example/b"]);
  });

  it("uses exact unambiguous aliases without merging sequels or editions", () => {
    const titleRegistry = { translations: { example: { titleEnAliases: ["Example Game"] } } };
    const groups = aggregateCalendarLeads([
      lead(),
      lead({ title: "Example Game II", productId: "store:2", url: "https://a.example/game-ii" }),
      lead({ title: "Example Game - Deluxe Edition", productId: "store:3", url: "https://a.example/game-deluxe" }),
    ], { titleRegistry });
    expect(groups).toHaveLength(3);
    expect(groups.find((group) => group.title === "Example Game").identity.registryIds).toEqual(["example"]);
  });

  it("marks same-name different products ambiguous instead of confirming one identity", () => {
    const groups = aggregateCalendarLeads([
      lead(),
      lead({ productId: "store:2", url: "https://a.example/other" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.identityStatus === "ambiguous")).toBe(true);
    expect(groups.every((group) => group.identity.conflictProductIds.length === 2)).toBe(true);
  });

  it("merges different store products without changing the stable identity", () => {
    const one = aggregateCalendarLeads([lead({ productId: "steam:1" })]);
    const two = aggregateCalendarLeads([
      lead({ productId: "steam:1" }),
      lead({ productId: "epic:9", sourceId: "source-b", family: "b", url: "https://b.example/game" }),
    ]);
    expect(two).toHaveLength(1);
    expect(two[0].observationCount).toBe(2);
    expect(two[0].productIds).toEqual(["epic:9", "steam:1"]);
    expect(two[0].identity.key).toBe(one[0].identity.key);
    expect(two[0].identityStatus).toBe("needs_verification");
  });

  it("splits same-store product conflicts and keeps unknown products unassigned", () => {
    const groups = aggregateCalendarLeads([
      lead({ productId: "steam:1" }),
      lead({ productId: "steam:2", sourceId: "source-b", url: "https://b.example/game" }),
      lead({ productId: "epic:9", sourceId: "source-c", url: "https://c.example/game" }),
      lead({ productId: null, sourceId: "source-d", url: "https://d.example/game" }),
    ]);
    expect(groups).toHaveLength(4);
    expect(groups.filter((group) => group.identity.key.includes("|store:steam|")).map((group) => group.productId)).toEqual(["steam:1", "steam:2"]);
    expect(groups.find((group) => group.productId === "epic:9").identity.key).toBe("name:examplegame|store:epic|product:epic:9");
    expect(groups.find((group) => group.productId === null).identity.key).toBe("name:examplegame|product:unknown");
  });

  it("preserves sourceIds in observation identity and historical flags", () => {
    const groups = aggregateCalendarLeads([
      lead({ sourceId: "source-a", sourceIds: ["source-a", "source-b"], knownTitle: true }),
      lead({ sourceId: "source-a", sourceIds: ["source-a", "source-c"], inBaseline: true, url: "https://b.example/game" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].observationCount).toBe(2);
    expect(groups[0].observations.map((observation) => observation.sourceIds)).toEqual([["source-a", "source-b"], ["source-a", "source-c"]]);
    expect(groups[0].knownTitle).toBe(true);
    expect(groups[0].inBaseline).toBe(true);
  });

  it("keeps same-scope and unknown-scope date uncertainty explicit", () => {
    const samePlatform = aggregateCalendarLeads([
      lead({ date: "2026-09-20" }),
      lead({ date: "2026-09-21", sourceId: "source-b", url: "https://b.example/game" }),
    ])[0];
    expect(samePlatform.dateConflict).toBe(true);
    expect(samePlatform.dateConflictStatus).toBe("conflict");

    const unknownScope = aggregateCalendarLeads([
      lead({ platforms: ["unknown"], date: "2026-09-20" }),
      lead({ platforms: ["unknown"], date: "2026-09-21", sourceId: "source-b", url: "https://b.example/game" }),
    ])[0];
    expect(unknownScope.dateConflict).toBe(false);
    expect(unknownScope.dateConflictUncertain).toBe(true);
    expect(unknownScope.dateConflictStatus).toBe("uncertain");
  });

  it("does not count unknown family as independent corroboration", () => {
    const group = aggregateCalendarLeads([
      lead({ family: "steam" }),
      lead({ family: "unknown", sourceId: "source-b", url: "https://b.example/game" }),
    ])[0];
    expect(group.crossSource).toBe(false);
  });

  it("does not manufacture an identity for malformed titles", () => {
    expect(aggregateCalendarLeads([{ title: { value: "bad" }, sourceId: "source-a" }])).toEqual([]);
  });

  it("keeps Nintendo unknown platform observations and NSUID identity together", () => {
    const groups = aggregateCalendarLeads([
      lead({ title: "Nintendo Game", sourceId: "nintendo", family: "nintendo", productId: "nintendo:42", platforms: ["unknown"], platformFamily: "Nintendo", url: "https://nintendo.example/game" }),
      lead({ title: "Nintendo Game", sourceId: "nintendo", family: "nintendo", productId: "nintendo:42", platforms: ["Nintendo Switch 2"], platformFamily: "Nintendo", url: "https://nintendo.example/game" }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].platforms).toEqual(["Nintendo Switch 2", "unknown"]);
    expect(groups[0].observations.some((observation) => observation.platform === "unknown")).toBe(true);
  });

  it("is deterministic under input order changes and tracks baseline exact names", () => {
    const titleRegistry = { translations: { example: { titleEnAliases: ["Example Game"] } } };
    const records = [lead({ sourceId: "z", url: "https://z.example/game" }), lead({ sourceId: "a", url: "https://a.example/game" })];
    const options = { titleRegistry, baseline: [{ title: { title_en: "Example Game" } }] };
    expect(aggregateCalendarLeads(records, options)).toEqual(aggregateCalendarLeads([...records].reverse(), options));
    expect(aggregateCalendarLeads(records, options)[0].inBaseline).toBe(true);
  });
});

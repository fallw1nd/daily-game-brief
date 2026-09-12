import { describe, expect, it } from "vitest";
import { officialShowcaseSchedule, discoverShowcaseLinks, showcaseDate } from "./lib/showcase-discovery.mjs";

describe("official showcase discovery", () => {
  it("converts Pacific schedules with seasonal offsets", () => {
    expect(officialShowcaseSchedule("Nintendo Direct 9.9.2026 Tune in at 7am PT", "https://www.nintendo.com/archive").startsAt).toBe("2026-09-09T14:00:00.000Z");
    expect(officialShowcaseSchedule("Nintendo Direct 1.29.2026 Tune in at 7am PT", "https://www.nintendo.com/archive").startsAt).toBe("2026-01-29T15:00:00.000Z");
    expect(officialShowcaseSchedule("Nintendo Direct 9.9.2026", "https://www.nintendo.com/archive")).toBeNull();
  });
  it("discovers the linked Japanese full transcript without fabricating its time", () => {
    const links = discoverShowcaseLinks('<a href="../description/20260909_ja-JP.html">Nintendo Direct 2026.9.9（テキスト版）</a>', { url: "https://www.nintendo.com/jp/nintendo-direct/20260909/index.html" });
    expect(links[0]).toMatchObject({ date: "2026-09-09", schedule: null, transcript: true });
    expect(showcaseDate("Nintendo Direct – 09/09/2026")).toBe("2026-09-09");
  });
});

// @vitest-environment node
import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseReleaseSource } from "./lib/release-calendar-discovery.mjs";

const article = (title, { pubDate = "Wed, 16 Sep 2026 12:00:00 +0000", body = "", url = "https://blog.playstation.com/article" } = {}) =>
  `<item><title>${title}</title><link>${url}</link><pubDate>${pubDate}</pubDate><category>PS5</category><description><![CDATA[${body}]]></description></item>`;
const rss = (...items) => `<rss version="2.0"><channel>${items.join("")}</channel></rss>`;
const ps = { id: "playstation-blog", family: "playstation", adapter: "articles", platform: "PlayStation", kind: "primary", priority: 3, url: "https://blog.playstation.com/category/ps5/feed/" };
const parse = (xml, editionDate = "2026-09-18") => parseReleaseSource(xml, ps, editionDate);

describe("PlayStation article date discovery leads", () => {
  it("recognizes Sep, Sept, September, compact dates, and out/on/launches phrasing as review links only", () => {
    const result = parse(rss(
      article("Warbond launches Sept22"),
      article("Moomintroll launches on September18"),
      article("Control Resonant out September24"),
      article("A game releases on Sep 23"),
    ));
    expect(result.records).toEqual([]);
    const byTitle = new Map(result.reviewLinks.map(link => [link.title, link]));
    expect(byTitle.get("Warbond launches Sept22").dateHints).toEqual(["2026-09-22"]);
    expect(byTitle.get("Moomintroll launches on September18").dateHints).toEqual(["2026-09-18"]);
    expect(byTitle.get("Control Resonant out September24").dateHints).toEqual(["2026-09-24"]);
    expect(byTitle.get("A game releases on Sep 23").dateHints).toEqual(["2026-09-23"]);
    expect(result.reviewLinks.every(link => link.review === "open_primary_source_before_publication")).toBe(true);
  });

  it("does not treat a bare on-date phrase as a release lead", () => {
    const result = parse(rss(article("Developer interview on September 22")));
    expect(result.reviewLinks).toEqual([]);
  });

  it("uses pubDate only to anchor a missing year and never scans article body or footer", () => {
    const result = parse(rss(article("A game release date is coming soon", { body: "<p>September 25, 2026</p><footer>out September 26</footer>" })));
    expect(result.reviewLinks[0]).toMatchObject({ dateHints: [], dateStatus: "no_date" });
    const anchored = parse(rss(article("Game launches January 2", { pubDate: "Wed, 30 Dec 2026 12:00:00 +0000" })), "2026-12-30").reviewLinks[0];
    expect(anchored.dateHints).toEqual(["2027-01-02"]);
  });

  it("retains title and URL conflicts for primary-source review", () => {
    const url = "https://blog.playstation.com/2026/09/16/game-out-september-25/";
    const [link] = parse(rss(article("Game out September 24", { url }))).reviewLinks;
    expect(link).toMatchObject({ url, dateHints: ["2026-09-24"], dateStatus: "in_window" });
  });

  it("keeps the 2027 launch year and marks a separate live demo as mixed", () => {
    const [link] = parse(rss(article("Wo Long 2: Wings of Ember launches March 4, 2027, demo live today"))).reviewLinks;
    expect(link).toMatchObject({ dateHints: ["2027-03-04"], dateStatus: "outside_window", releaseTypeHint: "mixed" });
  });

  it("does not mark negated dates in-window or infer cancellation", () => {
    const links = parse(rss(
      article("Game no longer launches September22"),
      article("Game will not launch Sept. 22"),
      article("Game launches on Sept22"),
    )).reviewLinks;
    const byTitle = new Map(links.map(link => [link.title, link]));
    expect(byTitle.get("Game no longer launches September22")).toMatchObject({ dateHints: ["2026-09-22"], dateStatus: "ambiguous_negated", negated: true, ambiguous: true });
    expect(byTitle.get("Game will not launch Sept. 22")).toMatchObject({ dateHints: ["2026-09-22"], dateStatus: "ambiguous_negated", negated: true, ambiguous: true });
    expect(byTitle.get("Game launches on Sept22").dateStatus).toBe("in_window");
  });

  it("handles ranges, multiple dates, invalid dates/years, and expiry conservatively", () => {
    const links = parse(rss(
      article("Game launches Sept 22-24"),
      article("Game launches Sept 22 to Oct 1"),
      article("Game launches Sept 22 and releases Oct 1"),
      article("Game launches September 24, 1999"),
      article("Game launches September 24, 2100"),
      article("Game launches September 24, 20270"),
      article("Game launches September 31"),
      article("Game out September 18"),
    )).reviewLinks;
    const byTitle = new Map(links.map(link => [link.title, link]));
    expect(byTitle.get("Game launches Sept 22-24")).toMatchObject({ dateHints: ["2026-09-22"], dateStatus: "ambiguous_multiple" });
    expect(byTitle.get("Game launches Sept 22 to Oct 1")).toMatchObject({ dateHints: ["2026-09-22"], dateStatus: "ambiguous_multiple" });
    expect(byTitle.get("Game launches Sept 22 and releases Oct 1")).toMatchObject({ dateHints: ["2026-09-22", "2026-10-01"], dateStatus: "ambiguous_multiple" });
    const continuedDates = parse(rss(
      article("Game launches September 22 and September 25"),
      article("Game launches September 22 or September 25"),
      article("Game launches September 22/September 25"),
    )).reviewLinks;
    for (const title of ["Game launches September 22 and September 25", "Game launches September 22 or September 25", "Game launches September 22/September 25"]) {
      const continuedLink = continuedDates.find(link => link.title === title);
      expect(continuedLink).toMatchObject({ dateHints: ["2026-09-22", "2026-09-25"], dateStatus: "ambiguous_multiple" });
    }
    for (const title of ["Game launches September 24, 1999", "Game launches September 24, 2100", "Game launches September 24, 20270", "Game launches September 31"]) {
      expect(byTitle.get(title)).toMatchObject({ dateHints: [], dateStatus: "invalid_date" });
    }
    expect(byTitle.get("Game out September 18").dateStatus).toBe("expired");
  });

  it("prioritizes dated leads while retaining the eight-link limit", () => {
    const links = parse(rss(
      article("A game release date is coming soon"),
      ...Array.from({ length: 9 }, (_, index) => article(`Game ${index} launches Sept${20 + index}`)),
    )).reviewLinks;
    expect(links).toHaveLength(8);
    expect(links.every(link => link.dateHints.length === 1)).toBe(true);
  });

  it("parses the reduced fixture excerpt from the real PS5 feed", async () => {
    const fixture = await readFile(new URL("./fixtures/ps5-article-leads.xml", import.meta.url), "utf8");
    const links = parse(fixture).reviewLinks;
    expect(links).toHaveLength(3);
    expect(links.filter(link => link.dateHints.length > 0)).toHaveLength(3);
    expect(links.filter(link => link.dateStatus === "in_window")).toHaveLength(1);
    const silentHill = links.find(link => link.title.startsWith("Silent Hill"));
    expect(silentHill).toMatchObject({ dateHints: ["2026-09-24"], dateStatus: "in_window" });
    const moomin = links.find(link => link.title.startsWith("Moomintroll"));
    expect(moomin.dateStatus).toBe("expired");
    const woLong = links.find(link => link.title.startsWith("Wo Long"));
    expect(woLong).toMatchObject({ dateHints: ["2027-03-04"], releaseTypeHint: "mixed" });
  });
});

import { describe, expect, it } from "vitest";
import { parsePublishedTime } from "./lib/published-time.mjs";

describe("article publication time parser", () => {
  it("reads article:published_time metadata", () => {
    expect(parsePublishedTime('<meta property="article:published_time" content="2026-08-31T01:23:45+09:00">'))
      .toBe("2026-08-30T16:23:45.000Z");
  });

  it("reads datePublished from JSON-LD", () => {
    expect(parsePublishedTime('<script type="application/ld+json">{"@type":"NewsArticle","datePublished":"2026-08-31T09:10:00+08:00"}</script>'))
      .toBe("2026-08-31T01:10:00.000Z");
  });

  it("reads time datetime when structured metadata is absent", () => {
    expect(parsePublishedTime('<time datetime="2026-08-30T18:00:00Z">30 August</time>'))
      .toBe("2026-08-30T18:00:00.000Z");
  });

  it("does not treat modification time as publication time", () => {
    expect(parsePublishedTime('<meta property="article:modified_time" content="2026-08-31T02:00:00Z"><script type="application/ld+json">{"dateModified":"2026-08-31T02:00:00Z"}</script>'))
      .toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { parsePublishedTime } from "./lib/published-time.mjs";

describe("publication metadata validation", () => {
  it("ignores malformed publication values", () => {
    expect(parsePublishedTime('<meta property="article:published_time" content="not-a-date">')).toBeNull();
  });

  it("accepts itemprop datePublished metadata", () => {
    expect(parsePublishedTime('<meta itemprop="datePublished" content="2026-08-31T10:00:00+08:00">'))
      .toBe("2026-08-31T02:00:00.000Z");
  });
});

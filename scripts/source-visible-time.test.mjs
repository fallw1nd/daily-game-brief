import { describe, expect, it } from "vitest";
import { sourceVisiblePublishedAt } from "./lib/source-visible-time.mjs";

describe("source-visible publication time fallback", () => {
  it("parses the visible Beijing timestamp used by 3DM article pages", () => {
    const html = '<div class="info">时间：2026-09-01 06:12:27</div>';
    expect(sourceVisiblePublishedAt(html, { id: "3dm-news" })).toBe("2026-08-31T22:12:27.000Z");
  });

  it("accepts full-width punctuation and strips markup around the timestamp", () => {
    const html = '<p><span>发布时间</span>： <em>2026-09-01 09:18:59</em></p>';
    expect(sourceVisiblePublishedAt(html, { id: "3dm-news" })).toBe("2026-09-01T01:18:59.000Z");
  });

  it("does not infer a timezone for unrelated sources", () => {
    const html = '<div>时间：2026-09-01 09:18:59</div>';
    expect(sourceVisiblePublishedAt(html, { id: "other-source" })).toBeNull();
  });
});

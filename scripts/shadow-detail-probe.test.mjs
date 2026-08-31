import { describe, expect, it } from "vitest";
import { selectShadowDetailTargets, summarizeShadowDetailProbe } from "./lib/shadow-detail-probe.mjs";

const config = {
  sources: [
    { id: "active", label: "Active", mode: "active", url: "https://active.example/", linkPattern: "^https://active\\.example/" },
    { id: "shadow-a", label: "Shadow A", mode: "shadow", url: "https://a.example/", linkPattern: "^https://a\\.example/articles/" },
    { id: "shadow-b", label: "Shadow B", mode: "shadow", url: "https://b.example/", linkPattern: "^https://b\\.example/news/" },
  ],
};

describe("shadow detail timestamp probe", () => {
  it("selects only unknown-time registered shadow article URLs within hard bounds", () => {
    const payload = {
      shadowCandidates: [
        { appearances: [
          { sourceId: "shadow-a", url: "https://a.example/articles/1", publishedAt: null },
          { sourceId: "shadow-a", url: "https://a.example/articles/2", publishedAt: null },
          { sourceId: "shadow-a", url: "https://a.example/articles/3", publishedAt: null },
          { sourceId: "shadow-b", url: "https://b.example/news/1", publishedAt: "2026-08-31T00:00:00Z" },
          { sourceId: "active", url: "https://active.example/story", publishedAt: null },
          { sourceId: "shadow-b", url: "https://evil.example/news/2", publishedAt: null },
        ] },
        { appearances: [
          { sourceId: "shadow-b", url: "https://b.example/news/3", publishedAt: null },
        ] },
      ],
    };

    expect(selectShadowDetailTargets(payload, config, { maxPerSource: 2, maxTotal: 3 }))
      .toEqual([
        { sourceId: "shadow-a", sourceLabel: "Shadow A", url: "https://a.example/articles/1" },
        { sourceId: "shadow-a", sourceLabel: "Shadow A", url: "https://a.example/articles/2" },
        { sourceId: "shadow-b", sourceLabel: "Shadow B", url: "https://b.example/news/3" },
      ]);
  });

  it("summarizes resolved, unresolved, and limited samples per source", () => {
    const summary = summarizeShadowDetailProbe([
      { sourceId: "shadow-a", url: "https://a.example/articles/1", status: "resolved", publishedAt: "2026-08-31T00:00:00Z" },
      { sourceId: "shadow-a", url: "https://a.example/articles/2", status: "unresolved", publishedAt: null },
      { sourceId: "shadow-b", url: "https://b.example/news/3", status: "limited", publishedAt: null, error: "HTTP 403" },
    ], config);

    expect(summary).toMatchObject({ attempted: 3, resolved: 1, unresolved: 1, limited: 1 });
    expect(summary.bySource.find((item) => item.sourceId === "shadow-a")).toMatchObject({ attempted: 2, resolved: 1, unresolved: 1, limited: 0, resolutionRate: 0.5 });
    expect(summary.bySource.find((item) => item.sourceId === "shadow-b")).toMatchObject({ attempted: 1, resolved: 0, unresolved: 0, limited: 1, resolutionRate: 0 });
  });
});

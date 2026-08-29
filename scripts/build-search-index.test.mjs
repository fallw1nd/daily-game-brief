import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let searchIndex;

beforeAll(async () => {
  await import("./build-search-index.mjs");
  searchIndex = JSON.parse(await readFile(resolve("public/data/search-index.json"), "utf8"));
});

describe("search index v2", () => {
  it("includes English copy only when a validated English Overlay exists", () => {
    expect(searchIndex.schemaVersion).toBe(2);
    expect(Array.isArray(searchIndex.items)).toBe(true);
    const item = searchIndex.items.find((entry) => entry.entryId === "2026-08-21-pm-news-0");
    expect(item.availableLocales).toEqual(["zh-CN", "en"]);
    expect(item.copy["zh-CN"].headline).toBeTruthy();
    expect(item.copy.en?.headline).toBeTruthy();
    expect(item.copy.en?.summary).toBeTruthy();
  });

  it("preserves true tracking flags for archive search results", () => {
    const tracked = searchIndex.items.find((entry) => entry.entryId === "2026-08-22-pm-observations-0");
    expect(tracked?.tracking).toBe(true);
  });

  it("keeps false tracking explicit and stable in v2", () => {
    const untracked = searchIndex.items.find((entry) => entry.entryId === "2026-08-21-pm-news-0");
    expect(untracked?.tracking).toBe(false);
  });
});

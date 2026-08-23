import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let searchIndex;

beforeAll(async () => {
  await import("./build-search-index.mjs");
  searchIndex = JSON.parse(
    await readFile(resolve("public/data/search-index.json"), "utf8"),
  );
});

describe("search index tracking compatibility", () => {
  it("preserves true tracking flags for archive search results", () => {
    const tracked = searchIndex.entries.find(
      (entry) => entry.entryId === "2026-08-22-pm-observations-0",
    );
    expect(tracked?.tracking).toBe(true);
  });

  it("omits optional tracking for false or historical missing values", () => {
    const untracked = searchIndex.entries.find(
      (entry) => entry.entryId === "2026-08-21-pm-news-0",
    );
    expect(untracked).not.toHaveProperty("tracking");
  });
});

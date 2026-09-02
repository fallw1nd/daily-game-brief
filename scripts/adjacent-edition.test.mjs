import { describe, expect, it } from "vitest";
import { resolveAdjacentManifestItem } from "./lib/adjacent-edition.mjs";

const editions = [
  { id: "2026-08-31-daily", path: "archive/2026/08/2026-08-31-daily.json" },
  { id: "2026-09-01-daily", path: "archive/2026/09/2026-09-01-daily.json" },
  { id: "2026-09-02-daily", path: "archive/2026/09/2026-09-02-daily.json" },
];

describe("resolveAdjacentManifestItem", () => {
  it("uses latest when the next edition is not published yet", () => {
    expect(resolveAdjacentManifestItem({ editions, windowId: "2026-09-03-daily", latestId: "2026-09-02-daily" })?.id)
      .toBe("2026-09-02-daily");
  });

  it("uses the previous manifest edition during a same-edition revision", () => {
    expect(resolveAdjacentManifestItem({ editions, windowId: "2026-09-02-daily", latestId: "2026-09-02-daily" })?.id)
      .toBe("2026-09-01-daily");
  });

  it("uses the true previous edition for an older explicit revision", () => {
    expect(resolveAdjacentManifestItem({ editions, windowId: "2026-09-01-daily", latestId: "2026-09-02-daily" })?.id)
      .toBe("2026-08-31-daily");
  });

  it("returns no adjacent edition for the first manifest item", () => {
    expect(resolveAdjacentManifestItem({ editions, windowId: "2026-08-31-daily", latestId: "2026-09-02-daily" }))
      .toBeNull();
  });
});

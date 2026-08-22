import { describe, expect, it, vi } from "vitest";
import { edition, sourceReport } from "./brief";
import { latestBriefUrl, loadLatestEdition } from "./briefLoader";

const publishedEdition = {
  ...edition,
  schemaVersion: 1 as const,
  sourceReport,
};

describe("brief loader", () => {
  it("resolves the data path against the Vite base URL", () => {
    expect(latestBriefUrl("/daily-game-brief/")).toBe(
      "/daily-game-brief/data/latest.json",
    );
  });

  it("loads a valid published edition", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(publishedEdition), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await loadLatestEdition(undefined, fetcher);

    expect(result.source).toBe("remote");
    expect(result.edition.id).toBe(edition.id);
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("falls back when the published payload is invalid", async () => {
    const fetcher = vi.fn(async () =>
      new Response(JSON.stringify(edition), { status: 200 }),
    ) as unknown as typeof fetch;

    const result = await loadLatestEdition(undefined, fetcher);

    expect(result.source).toBe("fallback");
    expect(result.edition).toBe(edition);
    expect(result.error).toContain("schemaVersion");
  });
});

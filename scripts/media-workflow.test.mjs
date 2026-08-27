import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");

describe("media publication workflow", () => {
  it("publishes validated media without a review branch", () => {
    expect(workflow).toContain("run: npm run check");
    expect(workflow).toContain("git push origin HEAD:main");
    expect(workflow).toContain("gh workflow run deploy.yml --ref main");
    expect(workflow).not.toContain("gh pr create");
    expect(workflow).not.toContain("automation/media-");
  });
});

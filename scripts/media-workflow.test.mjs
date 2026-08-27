import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");
const enrichment = await readFile("scripts/enrich-media.mjs", "utf8");

describe("media publication workflow", () => {
  it("publishes validated media without a review branch", () => {
    expect(workflow).toContain("run: npm run check");
    expect(workflow).toContain("git push origin HEAD:main");
    expect(workflow).toContain("gh workflow run deploy.yml --ref main");
    expect(workflow).not.toContain("gh pr create");
    expect(workflow).not.toContain("automation/media-");
  });

  it("uses DeepSeek only as the final web source discovery provider", () => {
    expect(workflow).toContain("DEEPSEEK_API_KEY");
    expect(workflow).toContain("secrets.DEEPSEEK_API_KEY");
    expect(workflow).not.toContain("BRAVE_SEARCH_API_KEY");
    expect(enrichment).toContain("https://api.deepseek.com/responses");
    expect(enrichment).toContain('tools: [{ type: "web_search" }]');
    expect(enrichment).toContain('tool_choice: { type: "web_search" }');
    expect(enrichment).toContain("pageMatchesRecord");
    expect(enrichment).not.toContain("api.search.brave.com");
  });
});

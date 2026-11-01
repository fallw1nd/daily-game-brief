import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");
const publisher = await readFile("scripts/publish-verified-media.sh", "utf8");
const enrichment = await readFile("scripts/enrich-media.mjs", "utf8");

describe("media publication workflow", () => {
  it("publishes validated media without a review branch", () => {
    expect(workflow).toContain("run: npm run check");
    expect(publisher).toContain("git push origin HEAD:main");
    expect(workflow).toContain("gh workflow run deploy.yml --ref main");
    expect(workflow).not.toContain("gh pr create");
    expect(workflow).toContain("Acknowledge nonblocking media lane");
    expect(workflow).toContain("record_id:");
    expect(workflow).toContain("--revalidate-cover-id=\"$record\"");
    expect(workflow).toContain('if [ -z "$edition" ]; then');
    expect(workflow).toContain('"$edition" media-status');
    expect(workflow).toContain('edition_path="public/data/archive/${edition:0:4}/${edition:5:2}/$edition.json"');
    expect(workflow).toContain('node scripts/media-status.mjs "$edition_path"');
    expect(workflow).not.toContain('status = unresolved === 0 ? "available" : applied > 0 ? "partial" : "unavailable"');
    expect(workflow).not.toContain("automation/media-");
  });

  it("pins the first selected edition and rebuilds rather than rebasing generated data", () => {
    expect(workflow).toContain('EDITION_ID: ${{ steps.discovery.outputs.edition }}');
    expect(workflow).toContain('run: bash scripts/publish-verified-media.sh "$EDITION_ID" "$RECORD_ID"');
    expect(workflow.indexOf('- name: Upload media audit')).toBeGreaterThan(workflow.indexOf('- name: Publish verified media'));
    expect(workflow).not.toContain('edition="${{');
    expect(workflow.indexOf('echo "edition=$edition" >> "$GITHUB_OUTPUT"')).toBeGreaterThan(workflow.indexOf('Invalid edition_id'));
    expect(publisher).not.toContain('git rebase');
    expect(publisher).toContain('git reset --hard origin/main');
    expect(publisher).toContain('node scripts/enrich-media.mjs "${args[@]}"');
    expect(publisher).toContain('npm run check');
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

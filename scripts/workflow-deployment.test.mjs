import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function workflow(name) {
  return readFile(new URL(`../.github/workflows/${name}`, import.meta.url), "utf8");
}

describe("Pages deployment trigger contract", () => {
  it("keeps push deployment for external main writers and manual dispatch for workflow writers", async () => {
    const deploy = await workflow("deploy.yml");

    expect(deploy).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
    expect(deploy).toMatch(/\n\s*workflow_dispatch:\s*\n/);
  });

  it("publisher dispatches Pages once for a changed publication or an idempotent workflow retry", async () => {
    const publisher = await workflow("publish-editorial-decision.yml");

    expect(publisher).toContain(
      "if: steps.publish.outputs.changed == 'true' || github.event_name == 'workflow_dispatch'",
    );
    expect(publisher.match(/gh workflow run deploy\.yml --ref main/g)).toHaveLength(1);
  });

  it("media dispatches Pages once only after a media write changes main", async () => {
    const media = await workflow("media-enrichment.yml");

    expect(media).toContain("if: steps.media.outputs.changed == 'true'");
    expect(media.match(/gh workflow run deploy\.yml --ref main/g)).toHaveLength(1);
  });

  it("SLA recovery retains explicit Pages dispatch for both redeploy and degraded publication", async () => {
    const watchdog = await workflow("brief-sla-watchdog.yml");

    expect(watchdog.match(/gh workflow run deploy\.yml --ref main/g)).toHaveLength(2);
    expect(watchdog).toContain(
      "Repository already contains $edition; re-dispatching Pages for deployment recovery.",
    );
    expect(watchdog).toContain('git commit -m "content(brief): publish degraded $edition"');
  });
});

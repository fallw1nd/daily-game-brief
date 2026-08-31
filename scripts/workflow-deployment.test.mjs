import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

async function workflow(name) {
  return readFile(`.github/workflows/${name}`, "utf8");
}

describe("Pages deployment trigger contract", () => {
  it("keeps push deployment for external main writers and manual dispatch for workflow writers", async () => {
    const deploy = await workflow("deploy.yml");

    expect(deploy).toMatch(/push:\s*\n\s*branches:\s*\[main\]/);
    expect(deploy).toMatch(/\n\s*workflow_dispatch:\s*\n/);
  });

  it("holds a staged Daily build until its noon plannedAt without delaying legacy editions", async () => {
    const deploy = await workflow("deploy.yml");

    expect(deploy).toContain("Hold Daily release until noon");
    expect(deploy).toContain("edition.period !== 'daily'");
    expect(deploy).toContain("edition.plannedAt.replace(' ', 'T')");
    expect(deploy).toContain("Daily release is staged; waiting");
  });

  it("publisher dispatches Pages for changed data and idempotent publish retries without widening locale repair", async () => {
    const publisher = await workflow("publish-editorial-decision.yml");

    expect(publisher).toContain(
      "if: steps.publication.outputs.changed == 'true' || (github.event_name == 'workflow_dispatch' && steps.submission.outputs.mode == 'publish')",
    );
    expect(publisher.match(/gh workflow run deploy\.yml --ref main/g)).toHaveLength(1);
    expect(publisher).toContain(
      "if: failure() && github.event_name != 'workflow_dispatch' && steps.validation.outcome == 'success'",
    );
    expect(publisher).toContain(
      "gh workflow run publish-editorial-decision.yml --ref main -f edition_id=${{ steps.submission.outputs.edition }} -f publication_mode=publish",
    );
  });

  it("media dispatches Pages once only after a media write changes main", async () => {
    const media = await workflow("media-enrichment.yml");

    expect(media).toContain("if: steps.publication.outputs.changed == 'true'");
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

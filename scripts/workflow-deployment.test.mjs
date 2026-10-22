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
    expect(deploy).toContain("edition_id:");
    expect(deploy).toContain("github.event_name == 'workflow_dispatch' && inputs.edition_id != ''");
    expect(deploy).not.toContain("Unable to resolve deployed edition from public/data/latest.json");
  });

  it("serializes Pages without cancelling running releases and reconciles every successful deployment", async () => {
    const deploy = await workflow("deploy.yml");
    expect(deploy).toMatch(/concurrency:\s*\n\s*group: pages\s*\n\s*cancel-in-progress: false/);
    const success = deploy.split("- name: Acknowledge successful deployment")[1].split("- name:")[0];
    expect(success).toContain("if: steps.deployment.outcome == 'success'");
    expect(success).not.toContain("github.event_name");
    expect(success).toContain("reconcile-deployment-state-branch.sh");
    expect(success).toContain('--outcome=success --edition="$EDITION_ID" --main-sha="$DEPLOYED_SHA"');
    const failure = deploy.split("- name: Acknowledge requested deployment failure")[1];
    expect(failure).toContain("!cancelled()");
    expect(failure).toContain("steps.request.outcome == 'success'");
    expect(failure).toContain("steps.deployment.outcome != 'success'");
    expect(failure).toContain("github.event_name == 'workflow_dispatch' && inputs.edition_id != ''");
    expect(failure).toContain("--outcome=failure");
  });

  it("validates dispatch edition identity before dependency installation or deployment", async () => {
    const deploy = await workflow("deploy.yml");
    const validation = deploy.indexOf("- name: Validate requested edition");
    expect(validation).toBeGreaterThan(deploy.indexOf("- name: Checkout"));
    expect(validation).toBeLessThan(deploy.indexOf("- name: Install dependencies"));
    expect(deploy).toContain("editionStatePath(edition)");
    expect(deploy).toContain("Requested edition is not in this deployment");
    expect(deploy).not.toContain('edition="${{ inputs.edition_id }}"');
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
    expect(publisher).toContain("gh workflow run deploy.yml --ref main -f edition_id=${{ steps.submission.outputs.edition }}");
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
    expect(media).toContain('gh workflow run deploy.yml --ref main -f edition_id="$EDITION_ID"');
  });

  it("SLA recovery retains explicit Pages dispatch for both redeploy and degraded publication", async () => {
    const watchdog = await workflow("brief-sla-watchdog.yml");

    expect(watchdog.match(/gh workflow run deploy\.yml --ref main/g)).toHaveLength(2);
    expect(watchdog.match(/gh workflow run deploy\.yml --ref main -f edition_id=\$edition/g)).toHaveLength(2);
    expect(watchdog).toContain(
      "Repository already contains $edition; re-dispatching Pages for deployment recovery.",
    );
    expect(watchdog).toContain('git commit -m "content(brief): publish degraded $edition"');
    const failureReport = watchdog.slice(watchdog.indexOf('- name: Report unsuccessful publication recovery'));
    expect(failureReport).toContain("steps.fallback.outcome == 'failure'");
    expect(failureReport).toContain("steps.packet_ready.outputs.available != 'true'");
    expect(failureReport).toContain('exit 1');
    expect(watchdog.indexOf('- name: Report unsuccessful publication recovery')).toBeGreaterThan(watchdog.indexOf('- name: Upload coverage audit'));
  });
});

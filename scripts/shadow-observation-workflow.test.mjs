import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/source-shadow-observation.yml", "utf8");

describe("shadow source observation workflow", () => {
  it("is a read-only observation lane", () => {
    expect(workflow).toContain("contents: read");
    expect(workflow).toContain("node scripts/collect-news.mjs");
    expect(workflow).toContain("node scripts/probe-shadow-published-time.mjs");
    expect(workflow).toContain("actions/upload-artifact@v7");
    expect(workflow).toContain("automation/shadow-observation-*");
    expect(workflow).toContain("automation/observation-requests/**");

    for (const forbidden of [
      "git push",
      "automation/state",
      "finalize-editorial-packet",
      "persist-edition-state",
      "brief-sla-watchdog",
      "public/data/",
      "workflow_dispatches",
    ]) {
      expect(workflow).not.toContain(forbidden);
    }
  });

  it("keeps the detail timestamp probe bounded and observational", () => {
    expect(workflow).toContain("SHADOW_DETAIL_MAX_PER_SOURCE: '2'");
    expect(workflow).toContain("SHADOW_DETAIL_MAX_TOTAL: '30'");
    expect(workflow).toContain("Detail timestamp probe");
    expect(workflow).toContain("does not mutate candidates or establish production evidence");
  });

  it("makes observation-only status and timestamp confidence explicit", () => {
    expect(workflow).toContain("Observation only");
    expect(workflow).toContain("Window-qualified shadow candidates");
    expect(workflow).toContain("Unknown-time shadow candidates");
    expect(workflow).toContain("Unknown-time candidates are timestamp/parser health signals");
    expect(workflow).toContain("does not write automation state, packets, Canonical data, or publication status");
  });
});

import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const workflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");

describe("final editorial packet workflow", () => {
  it("collects at both fixed Beijing cutoffs", () => {
    expect(workflow).toContain('- cron: "10 2 * * *"');
    expect(workflow).toContain('- cron: "0 9 * * *"');
    expect(workflow).not.toContain('cron: "55 1 * * *"');
    expect(workflow).not.toContain('cron: "45 8 * * *"');
  });
});

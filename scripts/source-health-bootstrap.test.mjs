import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const run = promisify(execFile);

describe("source health bootstrap", () => {
  it("treats an empty previous-ledger file as a missing first-run ledger", async () => {
    const dir = await mkdtemp(join(tmpdir(), "source-health-bootstrap-"));
    const reportPath = join(dir, "report.json");
    const previousPath = join(dir, "previous.json");
    const outputPath = join(dir, "output.json");
    await writeFile(reportPath, JSON.stringify({
      generatedAt: "2026-08-31T02:10:00Z",
      sourceStats: [{ sourceId: "vgc-news", mode: "active", capabilities: ["news"], status: "ok", count: 3, durationMs: 100 }],
    }));
    await writeFile(previousPath, "");
    await run(process.execPath, ["scripts/update-source-health.mjs"], {
      env: {
        ...process.env,
        NEWS_SHADOW_REPORT_PATH: reportPath,
        SOURCE_HEALTH_PREVIOUS_PATH: previousPath,
        SOURCE_HEALTH_PATH: outputPath,
      },
    });
    const output = JSON.parse(await readFile(outputPath, "utf8"));
    expect(output.schemaVersion).toBe(1);
    expect(output.sources["vgc-news"].consecutiveFailures).toBe(0);
  });
});

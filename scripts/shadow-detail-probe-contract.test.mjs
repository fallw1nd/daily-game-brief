import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const script = await readFile("scripts/probe-shadow-published-time.mjs", "utf8");

describe("shadow detail probe contract", () => {
  it("writes only its dedicated observation report", () => {
    expect(script).toContain("shadow-detail-time-report.json");
    expect(script).not.toContain("writeFile(CANDIDATES_PATH");
    expect(script).not.toContain("automation/state");
    expect(script).not.toContain("public/data");
  });
});

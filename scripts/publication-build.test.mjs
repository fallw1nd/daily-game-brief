// @vitest-environment node
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runPublicationBuild } from "./lib/publication-build.mjs";

it("returns a construction error to the exact validated submission with actionable diagnostics", async () => {
  const root = await mkdtemp(join(tmpdir(), "publication-receipt-"));
  const path = join(root, "validation.json");
  const before = { valid: true, packetBlobSha: "a".repeat(40), editionId: "2026-10-02-daily", errors: [] };
  await writeFile(path, JSON.stringify(before));
  await expect(runPublicationBuild(["-e", 'console.error("leadEntryId must reference a retained entry");process.exit(1)'], path)).rejects.toThrow(/diagnostics saved/);
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual({ ...before, valid: false, stage: "publication-build", errors: ["leadEntryId must reference a retained entry"] });
  await writeFile(path, JSON.stringify(before));
  await runPublicationBuild(["-e", "process.exit(0)"], path);
  expect(JSON.parse(await readFile(path, "utf8"))).toEqual(before);
});

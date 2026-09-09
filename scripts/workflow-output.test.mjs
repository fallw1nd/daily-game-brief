import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
describe("scheduled edition output protocol", () => {
  it.each(["packet", "publication"])("keeps %s logs separate from GitHub output", async purpose => {
    const root = await mkdtemp(join(tmpdir(), "brief-output-"));
    try {
      const manifest = join(root, "manifest.json");
      const output = join(root, "output");
      await writeFile(manifest, JSON.stringify({ editions: [] }));
      const { stdout } = await exec(process.execPath, [resolve("scripts/resolve-due-edition.mjs"), "--period=daily", "--purpose=" + purpose, "--manifest=" + manifest, "--status-root=" + join(root, "missing")], {
        env: { ...process.env, BRIEF_NOW: "2026-09-08T03:00:00Z", GITHUB_OUTPUT: output },
      });
      expect(JSON.parse(stdout).window.id).toBe("2026-09-08-daily");
      const values = (await readFile(output, "utf8")).trim().split(/\r?\n/);
      expect(values.every(line => /^[a-z_]+=[^\r\n]*$/.test(line))).toBe(true);
      expect(values).toContain("edition=2026-09-08-daily");
      expect(values).toContain("reference_now=2026-09-08T02:10:00.000Z");
    } finally { await rm(root, { recursive: true, force: true }); }
  });

  it("does not redirect JSON logs into outputs and installs recovery dependencies", async () => {
    for (const file of ["brief-sla-watchdog", "news-discovery-shadow"]) {
      const workflow = (await readFile(".github/workflows/" + file + ".yml", "utf8")).replace(/\r\n/g, "\n");
      const commands = workflow.match(/node scripts\/resolve-due-edition\.mjs(?:[^\n]*\\\n)*[^\n]*/g);
      expect(commands?.length).toBeGreaterThan(0);
      for (const command of commands) expect(command).not.toContain("GITHUB_OUTPUT");
      expect(workflow).toMatch(/--edition=[^\n]+ >> "\$GITHUB_OUTPUT"/);
      if (file === "brief-sla-watchdog") {
        expect(workflow).toContain("- name: Install packet recovery dependencies\n        if: steps.sla.outputs.status != 'healthy' && steps.packet.outputs.available != 'true'\n        run: npm ci");
        expect(workflow.indexOf("Install packet recovery dependencies")).toBeLessThan(workflow.indexOf("Rebuild a missing, stale, or invalid packet"));
      }
    }
  });
});

 it("installs dependencies on both packet builders and recovers a failed collection with an exact identity", async () => {
   const packet = (await readFile(".github/workflows/news-discovery-shadow.yml", "utf8")).replace(/\r\n/g, "\n");
   const sla = (await readFile(".github/workflows/brief-sla-watchdog.yml", "utf8")).replace(/\r\n/g, "\n");
   expect(packet).toContain("- name: Install packet dependencies\n        if: steps.edition.outputs.needed != 'false'\n        run: npm ci");
   for (const workflow of [packet, sla]) expect(workflow.indexOf("run: npm ci")).toBeLessThan(workflow.indexOf("node scripts/editorialize.mjs"));
   expect(packet).toContain("if: always() && !cancelled() && needs.collect.outputs.edition != '' && needs.collect.outputs.needed != 'false' && needs.collect.outputs.revision_authorized != 'true'");
 });

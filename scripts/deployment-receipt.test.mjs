import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
import { createEditionState, applyEditionStateEvent } from "./lib/edition-state.mjs";

it("the actual recorder rejects an ancestor release arriving after the current deployment", () => {
  const root = mkdtempSync(resolve(tmpdir(), "brief-deployment-"));
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    git("init"); git("config", "user.name", "Test"); git("config", "user.email", "test@example.com");
    writeFileSync(resolve(root, "release.txt"), "old"); git("add", "."); git("commit", "-m", "old");
    const old = git("rev-parse", "HEAD");
    writeFileSync(resolve(root, "release.txt"), "new"); git("add", "."); git("commit", "-m", "new");
    const current = git("rev-parse", "HEAD");
    const id = "2026-10-02-daily";
    const state = applyEditionStateEvent(createEditionState(id), "deployment-succeeded", { mainSha: current });
    mkdirSync(resolve(root, "automation/status"), { recursive: true });
    const file = resolve(root, `automation/status/${id}.json`);
    writeFileSync(file, JSON.stringify(state));
    execFileSync(process.execPath, [resolve("scripts/record-edition-state.mjs"), `--state-root=${root}`, `--edition=${id}`, "--event=deployment-failed", `--main-sha=${old}`], { cwd: root, env: { ...process.env, GITHUB_OUTPUT: "" } });
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual(state);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it("incident selection never confuses neighboring dates returned by GitHub search", () => {
  const rows = [{ title: "English locale degraded: 2026-09-05-daily", number: 149 }, { title: "English locale degraded: 2026-09-09-daily", number: 200 }];
  const run = title => execFileSync(process.execPath, ["scripts/find-exact-incident.mjs", title, "number"], { input: JSON.stringify(rows), encoding: "utf8" });
  expect(run(rows[1].title)).toBe("200");
  expect(run("English locale degraded: 2026-09-06-daily")).toBe("");
});

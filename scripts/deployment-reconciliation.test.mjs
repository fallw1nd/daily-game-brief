import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, readdirSync, chmodSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { execFileSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";
import { createEditionState, applyEditionStateEvent } from "./lib/edition-state.mjs";

const roots = [];
const reconciler = resolve("scripts/reconcile-deployment-state.mjs");
const wrapper = resolve("scripts/reconcile-deployment-state-branch.sh");
const ids = Array.from({ length: 9 }, (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}-daily`);
const legacy = "2026-08-21-am";

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(resolve(tmpdir(), "deployment-reconcile-"));
  roots.push(root);
  const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init", "-b", "main");
  git("config", "user.name", "Test");
  git("config", "user.email", "test@example.com");
  const put = (path, value) => {
    mkdirSync(dirname(resolve(root, path)), { recursive: true });
    writeFileSync(resolve(root, path), typeof value === "string" ? value : JSON.stringify(value, null, 2) + "\n");
  };
  const editions = [...ids.slice(0, 8), legacy].map(id => ({
    id, path: `archive/${id.slice(0, 4)}/${id.slice(5, 7)}/${id}.json`,
  }));
  const manifest = { latest: ids[0], editions };
  put("public/data/manifest.json", manifest);
  for (const entry of editions) put(`public/data/${entry.path}`, { id: entry.id });
  git("add", "public");
  git("commit", "-m", "initial publication");
  const old = git("rev-parse", "HEAD");
  put("ui.txt", "deployed UI");
  git("add", "ui.txt");
  git("commit", "-m", "UI push replaces exact dispatch");
  const deployed = git("rev-parse", "HEAD");
  const stateRoot = resolve(root, "state");
  const statePath = id => resolve(stateRoot, `automation/status/${id}.json`);
  const save = state => {
    mkdirSync(dirname(statePath(state.editionId)), { recursive: true });
    writeFileSync(statePath(state.editionId), JSON.stringify(state, null, 2) + "\n");
    return state;
  };
  const load = id => JSON.parse(readFileSync(statePath(id), "utf8"));
  const published = (id, sha = old) => applyEditionStateEvent(
    applyEditionStateEvent(createEditionState(id), "editorial-timeout"),
    "publication-committed", { mainSha: sha, source: "degraded" },
  );
  const success = (state, sha = old) => applyEditionStateEvent(state, "deployment-succeeded", { mainSha: sha, runId: "prior-run" });
  const run = (args = []) => execFileSync(process.execPath, [
    reconciler, ...args, `--state-root=${stateRoot}`, `--main-sha=${deployed}`, "--outcome=success",
  ], { cwd: root, encoding: "utf8", env: { ...process.env, GITHUB_OUTPUT: "", GITHUB_RUN_ID: "actual-run" }, stdio: ["ignore", "pipe", "pipe"] });
  return { root, git, put, manifest, old, deployed, stateRoot, statePath, save, load, published, success, run };
}

describe("successful Pages deployment receipt reconciliation", () => {
  it("repairs latest and outstanding represented editions after an exact dispatch is replaced, without rewriting covered history", () => {
    const f = fixture();
    f.save(f.success(f.published(ids[0])));
    f.save(f.published(ids[1]));
    f.save(applyEditionStateEvent(f.published(ids[2]), "deployment-failed", { mainSha: f.old }));
    const covered = f.save(f.success(f.published(ids[3])));
    f.run();
    for (const id of ids.slice(0, 3)) expect(f.load(id).deployment).toMatchObject({ status: "deployed", mainSha: f.deployed, runId: "actual-run" });
    expect(f.load(ids[3])).toEqual(covered);
  });

  it("acknowledges an explicitly requested covered archive as well as latest", () => {
    const f = fixture();
    f.save(f.published(ids[0]));
    f.save(f.success(f.published(ids[1])));
    f.run([`--edition=${ids[1]}`]);
    expect(f.load(ids[1]).deployment.mainSha).toBe(f.deployed);
    expect(f.load(ids[0]).deployment.mainSha).toBe(f.deployed);
  });

  it("uses actual success transitions for replayed historical publications and is idempotent for an already recorded deployment", () => {
    const f = fixture();
    const replay = applyEditionStateEvent(f.success(f.published(ids[1])), "publication-committed", { mainSha: f.deployed, source: "degraded" });
    expect(replay.deployment).toMatchObject({ status: "deployed", mainSha: f.deployed, runId: "prior-run" });
    f.save(replay);
    f.run();
    const recorded = f.load(ids[1]);
    expect(recorded.transitions.at(-1)).toMatchObject({ event: "deployment-succeeded", mainSha: f.deployed, runId: "actual-run" });
    f.run();
    expect(f.load(ids[1])).toEqual(recorded);
  });

  it("does not synthesize missing Daily or legacy state, or acknowledge uncommitted or unrepresented editions", () => {
    const f = fixture();
    const open = f.save(createEditionState(ids[1]));
    const absent = f.save(f.published(ids[8]));
    f.run([`--edition=${ids[8]}`]);
    expect(f.load(ids[1])).toEqual(open);
    expect(f.load(ids[8])).toEqual(absent);
    expect(existsSync(f.statePath(ids[0]))).toBe(false);
    expect(existsSync(f.statePath(legacy))).toBe(false);
    expect(readdirSync(resolve(f.stateRoot, "automation/status"))).toHaveLength(2);
  });

  it("does not acknowledge newer or divergent publications, and reads the deployed manifest rather than advanced main", () => {
    const f = fixture();
    const laterManifest = { ...f.manifest, latest: ids[8], editions: [...f.manifest.editions, { id: ids[8], path: `archive/2026/09/${ids[8]}.json` }] };
    f.put("public/data/manifest.json", laterManifest);
    f.put(`public/data/archive/2026/09/${ids[8]}.json`, { id: ids[8] });
    f.git("add", "public"); f.git("commit", "-m", "new publication");
    const future = f.git("rev-parse", "HEAD");
    f.git("checkout", "-b", "divergent", f.old);
    f.put("branch.txt", "unrelated publication");
    f.git("add", "branch.txt"); f.git("commit", "-m", "divergent");
    const divergent = f.git("rev-parse", "HEAD");
    f.git("checkout", "main");
    f.save(f.published(ids[0]));
    const newer = f.save(f.published(ids[1], future));
    const other = f.save(f.published(ids[2], divergent));
    const unrepresented = f.save(f.published(ids[8]));
    f.run();
    expect(f.load(ids[0]).deployment.mainSha).toBe(f.deployed);
    expect(f.load(ids[1])).toEqual(newer);
    expect(f.load(ids[2])).toEqual(other);
    expect(f.load(ids[8])).toEqual(unrepresented);
  });

  it("preserves a newer deployment receipt when an older successful deployment finishes late", () => {
    const f = fixture();
    f.put("later.txt", "newer deployment"); f.git("add", "later.txt"); f.git("commit", "-m", "newer");
    const newer = f.save(f.success(f.published(ids[0]), f.git("rev-parse", "HEAD")));
    const output = f.run();
    expect(f.load(ids[0])).toEqual(newer);
    expect(output).toContain('"acknowledged":[]');
  });

  it.each(["missing", "wrong-id", "unsafe-path"])("refuses a %s deployed archive instead of inventing a receipt", problem => {
    const f = fixture();
    const entry = f.manifest.editions[0];
    if (problem === "missing") f.git("rm", `public/data/${entry.path}`);
    if (problem === "wrong-id") f.put(`public/data/${entry.path}`, { id: ids[1] });
    if (problem === "unsafe-path") { entry.path = "archive/../latest.json"; f.put("public/data/manifest.json", f.manifest); }
    f.git("add", "public"); f.git("commit", "-m", "bad archive");
    const bad = f.git("rev-parse", "HEAD");
    const before = f.save(f.published(ids[0]));
    expect(() => f.run([`--main-sha=${bad}`])).toThrow();
    expect(f.load(ids[0])).toEqual(before);
  });

  it("acknowledges failures only for the explicit edition and preserves real same-SHA successes", () => {
    const f = fixture();
    const latest = f.save(f.published(ids[0]));
    f.save(f.published(ids[1]));
    f.run(["--outcome=failure", `--edition=${ids[1]}`]);
    expect(f.load(ids[1]).deployment).toMatchObject({ status: "failed", mainSha: f.deployed });
    expect(f.load(ids[0])).toEqual(latest);
    f.save(f.success(f.published(ids[1]), f.deployed));
    const succeeded = f.load(ids[1]);
    f.run(["--outcome=failure", `--edition=${ids[1]}`]);
    expect(f.load(ids[1])).toEqual(succeeded);
    expect(() => f.run(["--outcome=failure"])).toThrow("requires an exact edition");
  });

  it("does not retain a false success stamp when a replayed publication's actual deployment fails", () => {
    const f = fixture();
    f.save(applyEditionStateEvent(f.success(f.published(ids[1])), "publication-committed", { mainSha: f.deployed, source: "degraded" }));
    f.run(["--outcome=failure", `--edition=${ids[1]}`]);
    expect(f.load(ids[1]).deployment).toMatchObject({ status: "failed", mainSha: f.deployed });
  });

  it("rejects an invalid requested edition before any acknowledgement", () => {
    const f = fixture();
    const before = f.save(f.published(ids[0]));
    expect(() => f.run(["--edition=2026-99-99-daily"])).toThrow();
    expect(f.load(ids[0])).toEqual(before);
  });

  it("runs the workflow's dependency-free preflight before deploying an invalid or absent exact edition", () => {
    const f = fixture();
    const workflow = readFileSync(".github/workflows/deploy.yml", "utf8");
    const step = workflow.split("- name: Validate requested edition")[1].split("- name:")[0];
    const code = step.split("node --input-type=module - <<'NODE'\n")[1].split("\n          NODE")[0]
      .replace("'./scripts/lib/edition-state.mjs'", JSON.stringify(pathToFileURL(resolve("scripts/lib/edition-state.mjs")).href));
    const preflight = edition => execFileSync(process.execPath, ["--input-type=module", "-e", code], {
      cwd: f.root, env: { ...process.env, EDITION_ID: edition }, stdio: ["ignore", "pipe", "pipe"],
    });
    expect(() => preflight(ids[0])).not.toThrow();
    expect(() => preflight("")).not.toThrow();
    expect(() => preflight("2026-99-99-daily")).toThrow();
    expect(() => preflight(ids[8])).toThrow("Requested edition is not in this deployment");
  });

  it("reselects fresh state after a real CAS conflict and cannot acknowledge a newer publication", () => {
    const f = fixture();
    const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
    const remote = resolve(f.root, "origin.git");
    f.git("init", "--bare", remote);
    f.git("remote", "add", "origin", remote);
    f.put("future.txt", "publication committed while Pages ran");
    f.git("add", "future.txt"); f.git("commit", "-m", "newer publication");
    const future = f.git("rev-parse", "HEAD");
    f.git("push", "origin", "main");

    const writer = resolve(f.root, "concurrent-writer");
    f.git("worktree", "add", "--detach", writer, f.old);
    const writerGit = (...args) => execFileSync(realGit, args, { cwd: writer, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
    writerGit("checkout", "--orphan", "state-writer");
    writerGit("rm", "-rf", ".");
    f.save(f.published(ids[0]));
    f.save(f.published(ids[1]));
    cpSync(resolve(f.stateRoot, "automation"), resolve(writer, "automation"), { recursive: true });
    writerGit("add", "automation"); writerGit("commit", "-m", "initial trusted state");
    writerGit("push", "origin", "HEAD:automation/state");

    const advanced = applyEditionStateEvent(f.load(ids[0]), "publication-committed", { mainSha: future, source: "degraded" });
    const independent = applyEditionStateEvent(f.load(ids[1]), "locale-status", { status: "available", reason: "concurrent repair" });
    writeFileSync(resolve(writer, `automation/status/${ids[0]}.json`), JSON.stringify(advanced, null, 2) + "\n");
    writeFileSync(resolve(writer, `automation/status/${ids[1]}.json`), JSON.stringify(independent, null, 2) + "\n");
    writerGit("add", "automation"); writerGit("commit", "-m", "concurrent publication and locale state");

    // The real wrapper invokes only Node built-ins and these trusted modules,
    // even when npm installation/checking failed before its failure receipt.
    for (const file of ["reconcile-deployment-state.mjs", "record-edition-state.mjs",
      "lib/edition-state.mjs", "lib/editorial-packet.mjs", "lib/edition-window.mjs"]) {
      mkdirSync(dirname(resolve(f.root, "scripts", file)), { recursive: true });
      cpSync(resolve("scripts", file), resolve(f.root, "scripts", file));
    }
    const bin = resolve(f.root, "bin");
    mkdirSync(bin);
    const shim = resolve(bin, "git");
    writeFileSync(shim, `#!/usr/bin/env bash
set -euo pipefail
if [ "\${1:-}" = "-C" ] && [ "\${3:-}" = "push" ] && [ ! -f "$CONFLICT_MARK" ]; then
  touch "$CONFLICT_MARK"
  "$REAL_GIT" -C "$CONCURRENT_WRITER" push origin HEAD:automation/state
fi
exec "$REAL_GIT" "$@"
`);
    chmodSync(shim, 0o755);
    const runnerTemp = resolve(f.root, "runner");
    mkdirSync(runnerTemp);
    const conflictMark = resolve(f.root, "conflict-injected");
    execFileSync("bash", [wrapper, "--outcome=success", `--main-sha=${f.deployed}`], {
      cwd: f.root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, REAL_GIT: realGit,
        CONCURRENT_WRITER: writer, CONFLICT_MARK: conflictMark, RUNNER_TEMP: runnerTemp,
        GITHUB_RUN_ID: "actual-cas-run", GITHUB_OUTPUT: "" },
    });
    expect(existsSync(conflictMark)).toBe(true);
    const readRemote = id => JSON.parse(f.git("--git-dir", remote, "show", `automation/state:automation/status/${id}.json`));
    expect(readRemote(ids[0])).toEqual(advanced);
    const recovered = readRemote(ids[1]);
    expect(recovered.deployment).toMatchObject({ status: "deployed", mainSha: f.deployed, runId: "actual-cas-run" });
    expect(recovered.localeEn).toEqual(independent.localeEn);
    expect(readdirSync(runnerTemp)).toEqual([]);
    expect(f.git("rev-parse", "HEAD")).toBe(future);
  }, 15_000); // Real Git subprocess integration may exceed the unit-test budget under CI contention.
});

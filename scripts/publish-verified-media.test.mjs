import { mkdtemp, mkdir, readFile, writeFile, chmod, rm, copyFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });
const script = resolve("scripts/publish-verified-media.sh");
const gitBin = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
const edition = "2026-11-01-daily";
const archive = `public/data/archive/2026/11/${edition}.json`;

async function fixture(mode = "race", record = "") {
  const root = await mkdtemp(join(tmpdir(), "media-publish-")); roots.push(root);
  const remote = join(root, "remote.git"), work = join(root, "work"), other = join(root, "other"), bin = join(root, "bin");
  const git = (cwd, ...args) => execFileSync(gitBin, args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git(root, "init", "--bare", remote); git(root, "clone", remote, work);
  git(work, "config", "user.name", "test"); git(work, "config", "user.email", "test@example.com");
  await mkdir(join(work, "public/data/archive/2026/11"), { recursive: true });
  await mkdir(join(work, "public/media"), { recursive: true });
  await mkdir(join(work, "scripts"));
  await copyFile(script, join(work, "scripts/publish-verified-media.sh"));
  const initial = { id: edition, entries: ["original"], media: false };
  await writeFile(join(work, archive), JSON.stringify(initial));
  await writeFile(join(work, "public/data/latest.json"), JSON.stringify(initial));
  await writeFile(join(work, "public/media/keep.txt"), "keep");
  git(work, "add", "."); git(work, "commit", "-m", "initial"); git(work, "branch", "-M", "main"); git(work, "push", "origin", "main");
  git(root, "clone", "--branch", "main", remote, other);
  git(other, "config", "user.name", "other"); git(other, "config", "user.email", "other@example.com");
  if (["race", "noop", "exhaust", "ci-failure", "enrich-failure", "check-failure"].includes(mode)) {
    const current = { ...initial, entries: ["original", "concurrent"], media: mode === "noop" };
    await writeFile(join(other, archive), JSON.stringify(current));
    await writeFile(join(other, "public/data/latest.json"), JSON.stringify({ id: "2026-11-02-daily", entries: ["newer"] }));
    await writeFile(join(other, "public/media/concurrent.txt"), "concurrent media");
    git(other, "add", "."); git(other, "commit", "-m", "concurrent editorial"); git(other, "push", "origin", "main");
  }
  await writeFile(join(work, archive), JSON.stringify({ ...initial, media: true }));
  await writeFile(join(work, "public/data/latest.json"), JSON.stringify({ ...initial, media: true }));
  await mkdir(bin);
  const log = join(root, "commands"), output = join(root, "output");
  await writeFile(join(bin, "npm"), '#!/bin/bash\nprintf "npm %s\\n" "$*" >> "$COMMAND_LOG"\nif [ "$MODE" = "ci-failure" ] && [ "$1" = ci ]; then exit 1; fi\nif [ "$MODE" = "check-failure" ] && [ "$1" = run ]; then exit 1; fi\n');
  await writeFile(join(bin, "node"), `#!/usr/bin/env node
const fs = require('fs');
fs.appendFileSync(process.env.COMMAND_LOG, 'node ' + process.argv.slice(2).join(' ') + '\\n');
if (process.env.MODE === 'enrich-failure') process.exit(1);
const p = ${JSON.stringify(archive)};
const current = JSON.parse(fs.readFileSync(p)); current.media = true;
fs.writeFileSync(p, JSON.stringify(current));
`);
  // Use the actual Node executable, not the shim itself.
  const nodeShim = await readFile(join(bin, "node"), "utf8");
  await writeFile(join(bin, "node"), nodeShim.replace('#!/usr/bin/env node', `#!${process.execPath}`));
  await writeFile(join(bin, "git"), `#!/bin/bash
if [ "$1" = push ]; then
  case "$MODE" in
    permission) exit 1 ;;
    uncertain) "${gitBin}" "$@"; exit 1 ;;
    exhaust)
      "${gitBin}" -C "$OTHER" pull --ff-only >/dev/null 2>&1
      "${gitBin}" -C "$OTHER" commit --allow-empty -m race >/dev/null
      "${gitBin}" -C "$OTHER" push origin main >/dev/null 2>&1
      exit 1 ;;
  esac
fi
exec "${gitBin}" "$@"
`);
  for (const name of ["npm", "node", "git"]) await chmod(join(bin, name), 0o755);
  const result = spawnSync("bash", [script, edition, record], { cwd: work, encoding: "utf8", env: { ...process.env, PATH: `${bin}:${process.env.PATH}`, GITHUB_OUTPUT: output, COMMAND_LOG: log, MODE: mode, OTHER: other } });
  return { result, git, remote, work, commands: await readFile(log, "utf8").catch(() => ""), output: await readFile(output, "utf8").catch(() => "") };
}

describe("media publication concurrent-main recovery", () => {
  it("regenerates against fresh main and preserves concurrent news and newer latest", async () => {
    const f = await fixture("race", "cover-id");
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(JSON.parse(f.git(f.remote, "show", `main:${archive}`))).toEqual({ id: edition, entries: ["original", "concurrent"], media: true });
    expect(JSON.parse(f.git(f.remote, "show", "main:public/data/latest.json")).id).toBe("2026-11-02-daily");
    expect(f.commands).toBe(`npm ci\nnode scripts/enrich-media.mjs --apply --edition=${edition} --revalidate-cover-id=cover-id\nnpm run check\n`);
    expect(f.git(f.remote, "show", "main:public/media/concurrent.txt")).toBe("concurrent media");
    expect(f.output).toContain("changed=true");
  });
  it("does not create a new commit/deploy when fresh main already has the media", async () => {
    const f = await fixture("noop");
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(f.output).toContain("changed=false");
    expect(f.git(f.remote, "log", "-1", "--format=%s", "main")).toBe("concurrent editorial");
  });
  it("stops on unchanged remote rather than retrying a permission/transport failure", async () => {
    const f = await fixture("permission");
    expect(f.result.status).toBe(1); expect(f.commands).toBe("");
    expect(f.output).not.toContain("changed=true");
  });
  it("recognizes a server-accepted push despite a lost response", async () => {
    const f = await fixture("uncertain");
    expect(f.result.status, f.result.stderr).toBe(0);
    expect(f.commands).toBe(""); expect(f.output).toContain("changed=true");
  });
  it.each(["ci-failure", "enrich-failure", "check-failure"])("fails closed when regeneration encounters %s", async mode => {
    const f = await fixture(mode);
    expect(f.result.status).toBe(1);
    expect(f.output).not.toContain("changed=true");
    expect(JSON.parse(f.git(f.remote, "show", `main:${archive}`)).media).toBe(false);
  });
  it("stops after three rejected pushes and only two rebuilds", async () => {
    const f = await fixture("exhaust");
    expect(f.result.status).toBe(1);
    expect(f.commands.match(/npm run check/g)).toHaveLength(2);
    expect(f.output).not.toContain("changed=true");
  });
});

import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyArchiveCorrection } from "./apply-archive-correction.mjs";
import { buildEnglishRepairOverlay } from "./lib/bilingual-publisher.mjs";
import { factsDigest } from "./lib/locale-digest.mjs";

const repoRoot = process.cwd();
const cli = resolve(repoRoot, "scripts/apply-archive-correction.mjs");
const editionId = "2026-10-18-daily";
const archive = `public/data/archive/2026/10/${editionId}.json`;
const overlayPath = `public/data/locales/en/archive/2026/10/${editionId}.json`;
const unrelated = "public/data/archive/2026/10/2026-10-17-daily.json";
const tracked = [archive, overlayPath, unrelated, "public/data/latest.json", "public/data/manifest.json"];
let root, request, requestPath;
const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const json = async path => JSON.parse(await readFile(resolve(repoRoot, path), "utf8"));
const snapshot = async () => Object.fromEntries(await Promise.all(tracked.map(async path => [path, await readFile(resolve(root, path), "utf8")])));
async function saveRequest() { await writeFile(requestPath, JSON.stringify(request)); }

beforeEach(async () => {
  root = await mkdtemp(resolve(tmpdir(), "dgb-correction-cli-"));
  const canonical = await json(archive), originalOverlay = await json(overlayPath), manifest = await json("public/data/manifest.json");
  const entry = canonical.entries.find(row => row.id === `${editionId}-news-3`);
  entry.region = "全球";
  originalOverlay.entries.find(row => row.entryId === entry.id).regionLabel = "Global";
  const overlay = buildEnglishRepairOverlay({ canonical, draft: { ...originalOverlay, factsDigest: factsDigest(canonical) }, retainedPresentation: null }).overlay;
  manifest.latest = editionId;
  // Only these two represented archives are needed by this isolated transaction fixture.
  manifest.editions = manifest.editions.filter(row => [editionId, "2026-10-17-daily"].includes(row.id));
  const contents = { [archive]: canonical, [overlayPath]: overlay, [unrelated]: await json(unrelated), "public/data/latest.json": canonical, "public/data/manifest.json": manifest };
  for (const [path, value] of Object.entries(contents)) {
    await mkdir(resolve(root, path, ".."), { recursive: true });
    await writeFile(resolve(root, path), JSON.stringify(value, null, 2) + "\n");
  }
  // Trusted code reads its registry from cwd; this is test-only, not a publication input.
  await symlink(resolve(repoRoot, "config"), resolve(root, "config"), "dir");
  git(["init", "-q"]); git(["config", "user.name", "Archive test"]); git(["config", "user.email", "archive-test@example.invalid"]);
  git(["add", "public"]); git(["commit", "-qm", "test: fixture"]); git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
  request = { schemaVersion: 1, kind: "archive_correction", editionId,
    expectedArchiveBlobSha: git(["rev-parse", `HEAD:${archive}`]), expectedOverlayBlobSha: git(["rev-parse", `HEAD:${overlayPath}`]),
    corrections: [{ entryId: entry.id, expected: { region: "全球" }, replacement: { region: "日本" }, englishExpected: { regionLabel: "Global" }, englishReplacement: { regionLabel: "Japan" },
      evidence: { sourceUrl: entry.sources[0].url, excerpt: "日本向けのPlayStation StoreとXboxストア", reason: "Original source describes the Japanese CERO rating." } }],
  };
  requestPath = resolve(root, "request.json"); await saveRequest();
});
afterEach(async () => { if (root) await rm(root, { recursive: true, force: true }); });

describe("archive correction CLI transaction", () => {
  it("default CLI dry-run leaves every source byte unchanged", async () => {
    const before = await snapshot();
    const output = JSON.parse(execFileSync(process.execPath, [cli, requestPath], { cwd: root, encoding: "utf8" }));
    expect(output.applied).toBe(false); expect(await snapshot()).toEqual(before); expect(git(["status", "--porcelain", "--", "public"])).toBe("");
  });
  it("explicit --apply synchronizes latest and preserves unrelated archive and manifest bytes", async () => {
    const before = await snapshot();
    const output = JSON.parse(execFileSync(process.execPath, [cli, requestPath, "--apply"], { cwd: root, encoding: "utf8" }));
    expect(output.applied).toBe(true);
    const after = await snapshot(); expect(after[archive]).toBe(after["public/data/latest.json"]);
    expect(JSON.parse(after[archive]).entries.find(row => row.id === request.corrections[0].entryId).region).toBe("日本");
    expect(JSON.parse(after[overlayPath]).entries.find(row => row.entryId === request.corrections[0].entryId).regionLabel).toBe("Japan");
    expect(after[unrelated]).toBe(before[unrelated]); expect(after["public/data/manifest.json"]).toBe(before["public/data/manifest.json"]);
  });
  it("stale overlay SHA rejects without mutations", async () => {
    request.expectedOverlayBlobSha = "c".repeat(40); await saveRequest(); const before=await snapshot();
    await expect(applyArchiveCorrection(requestPath, {root,apply:true})).rejects.toThrow("expectedOverlayBlobSha"); expect(await snapshot()).toEqual(before);
  });
  it("a later invalid patch rejects before an earlier valid patch is written", async () => {
    request.corrections.push({entryId:"missing-entry"}); await saveRequest(); const before=await snapshot();
    await expect(applyArchiveCorrection(requestPath, {root,apply:true})).rejects.toThrow(); expect(await snapshot()).toEqual(before);
  });
  it("replaying the same request after commit rejects the old pinned archive SHA", async () => {
    await applyArchiveCorrection(requestPath,{root,apply:true}); git(["add","public"]);git(["commit","-qm","test: corrected"]);git(["update-ref","refs/remotes/origin/main","HEAD"]);const before=await snapshot();
    await expect(applyArchiveCorrection(requestPath,{root,apply:true})).rejects.toThrow("expectedArchiveBlobSha");expect(await snapshot()).toEqual(before);
  });
  it("HEAD different from trusted origin/main rejects without mutations", async () => {
    git(["commit","--allow-empty","-qm","test: untrusted branch advance"]);const before=await snapshot();
    await expect(applyArchiveCorrection(requestPath,{root,apply:true})).rejects.toThrow("trusted origin/main");expect(await snapshot()).toEqual(before);
  });
  it("historical archive correction does not overwrite latest of another edition", async () => {
    const later = JSON.parse(await readFile(resolve(root,unrelated),"utf8")); await writeFile(resolve(root,"public/data/latest.json"),JSON.stringify(later,null,2)+"\n");
    const manifest=JSON.parse(await readFile(resolve(root,"public/data/manifest.json"),"utf8"));manifest.latest=later.id;await writeFile(resolve(root,"public/data/manifest.json"),JSON.stringify(manifest,null,2)+"\n");
    git(["add","public"]);git(["commit","-qm","test: independent latest"]);git(["update-ref","refs/remotes/origin/main","HEAD"]);const before=await snapshot();
    await applyArchiveCorrection(requestPath,{root,apply:true});const after=await snapshot();expect(after["public/data/latest.json"]).toBe(before["public/data/latest.json"]);expect(after[unrelated]).toBe(before[unrelated]);
  });
});

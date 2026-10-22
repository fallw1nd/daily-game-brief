// @vitest-environment node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { localeArchivePath, localeStatusPath } from "./lib/bilingual-publisher.mjs";

const exec = promisify(execFile);
const sourceRoot = resolve(".");
const editionId = "2026-09-24-daily";
const archivePath = `archive/2026/09/${editionId}.json`;
const overlayPath = localeArchivePath(editionId);
const statusPath = localeStatusPath(editionId);

async function writeJson(root, path, value) {
  const target = join(root, path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

async function publicationHashes(root) {
  return Object.fromEntries(await Promise.all([
    archivePath, "latest.json", "manifest.json", overlayPath, statusPath,
    "locales/en/index.json", "search-index.json",
  ].map(async path => {
    try {
      const bytes = await readFile(join(root, "public/data", path));
      return [path, createHash("sha256").update(bytes).digest("hex")];
    } catch (error) {
      if (error.code === "ENOENT") return [path, null];
      throw error;
    }
  })));
}

it("rechecks the exact repair baseline after validation and on publish retries without changing publication bytes", async () => {
  const root = await mkdtemp(join(tmpdir(), "locale-repair-cli-"));
  try {
    await symlink(join(sourceRoot, "scripts"), join(root, "scripts"), "dir");
    await symlink(join(sourceRoot, "config"), join(root, "config"), "dir");
    const canonical = JSON.parse(await readFile(join(sourceRoot, "public/data", archivePath), "utf8"));
    const oldOverlay = JSON.parse(await readFile(join(sourceRoot, "public/data", overlayPath), "utf8"));
    const draft = structuredClone(oldOverlay);
    const run = (script, overrides = {}) => exec(process.execPath, [`scripts/${script}.mjs`], {
      cwd: root,
      env: {
        ...process.env,
        PUBLICATION_MODE: "locale-repair",
        LOCALE_REPAIR_DRAFT_PATH: "artifacts/locale-repair.json",
        EDITORIAL_VALIDATION_PATH: "artifacts/validation.json",
        PUBLICATION_RESULT_PATH: "artifacts/result.json",
        ...overrides,
      },
    });
    const writeCanonical = async value => {
      await writeJson(root, `public/data/${archivePath}`, value);
      await writeJson(root, "public/data/latest.json", value);
    };
    await writeCanonical(canonical);
    await writeJson(root, "public/data/manifest.json", {
      latest: editionId, updatedAt: canonical.generatedAt,
      editions: [{ id: editionId, path: archivePath }],
    });
    await writeJson(root, `public/data/${overlayPath}`, oldOverlay);
    await writeJson(root, "artifacts/locale-repair.json", draft);
    await run("validate-locale-repair");

    // A same-edition fact correction can land after validation without changing stable IDs.
    const changed = structuredClone(canonical);
    const entry = changed.entries.find(item => item.id === `${editionId}-news-1`);
    entry.platforms = ["PC (Steam)"];
    expect(draft.entries.find(item => item.entryId === entry.id).summary).toContain("PS5");
    await writeCanonical(changed);
    const beforeRejectedBuild = await publicationHashes(root);
    await expect(run("publish-editorial-decision")).rejects.toThrow(/factsDigest is stale/);
    expect(await publicationHashes(root)).toEqual(beforeRejectedBuild);

    // Even a retry of an earlier accepted build must recheck facts, not restamp the draft.
    await writeCanonical(canonical);
    await run("publish-editorial-decision");
    await run("publish-editorial-decision");
    expect(JSON.parse(await readFile(join(root, "artifacts/result.json"), "utf8")).status).toBe("locale-repair-noop");
    await writeCanonical(changed);
    const beforeRetry = await publicationHashes(root);
    await expect(run("publish-editorial-decision")).rejects.toThrow(/factsDigest is stale/);
    await expect(run("validate-locale-repair")).rejects.toThrow(/factsDigest is stale/);
    expect(await publicationHashes(root)).toEqual(beforeRetry);

    // The trusted index exports the new baseline. Old retained prose cannot override
    // a complete translation reviewed against that baseline.
    await run("build-locale-index");
    const index = JSON.parse(await readFile(join(root, "public/data/locales/en/index.json"), "utf8"));
    draft.factsDigest = index.editions.find(item => item.editionId === editionId).factsDigest;
    draft.entries.find(item => item.entryId === entry.id).summary = "The current Canonical edition confirms this game only for PC via Steam.";
    await writeJson(root, "artifacts/locale-repair.json", draft);
    await writeJson(root, `public/data/${statusPath}`, {
      schemaVersion: 1, locale: "en", editionId, factsDigest: draft.factsDigest,
      reasonCode: "editorial-overlay-missing", summary: "A complete current translation is required.",
      observedAt: canonical.generatedAt, retainedPresentation: oldOverlay,
    });
    const beforeFreshRepair = await publicationHashes(root);
    await run("validate-locale-repair");
    await run("publish-editorial-decision");
    const afterFreshRepair = await publicationHashes(root);
    for (const path of [archivePath, "latest.json", "manifest.json"]) {
      expect(afterFreshRepair[path]).toBe(beforeFreshRepair[path]);
    }
    const repaired = JSON.parse(await readFile(join(root, "public/data", overlayPath), "utf8"));
    expect(repaired.factsDigest).toBe(draft.factsDigest);
    expect(repaired.entries.find(item => item.entryId === entry.id).summary).toBe(draft.entries.find(item => item.entryId === entry.id).summary);
    expect(afterFreshRepair[statusPath]).toBeNull();

    // Legacy editorial replay is not an alternate unbound locale-repair path.
    const beforeUnboundReplay = await publicationHashes(root);
    await expect(run("publish-editorial-decision", { LOCALE_REPAIR_DRAFT_PATH: "" })).rejects.toThrow(/requires LOCALE_REPAIR_DRAFT_PATH/);
    expect(await publicationHashes(root)).toEqual(beforeUnboundReplay);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}, 15000);

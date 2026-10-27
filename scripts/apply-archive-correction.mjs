import { readFile, writeFile, rename, rm, lstat } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";
import { planArchiveCorrection } from "./lib/archive-correction.mjs";

/** Stages everything first; rolls back caught I/O failures. Publication atomicity is a later single git commit. */
export async function writeCorrectionTransaction(files, io = { writeFile, rename, rm }) {
  const staged = [], written = [];
  try {
    for (const [index, file] of files.entries()) {
      const temp = `${file.path}.archive-correction-${process.pid}-${index}.tmp`;
      staged.push(temp);
      await io.writeFile(temp, file.next, { flag: "wx" });
    }
    for (const [index, file] of files.entries()) {
      await io.rename(staged[index], file.path);
      written.push(file);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const file of written.reverse()) {
      try { await io.writeFile(file.path, file.previous); } catch (rollback) { rollbackErrors.push(rollback.message); }
    }
    if (rollbackErrors.length) throw new AggregateError([error, ...rollbackErrors], "archive correction rollback failed; do not commit this checkout");
    throw error;
  } finally {
    await Promise.all(staged.map(path => io.rm(path, { force: true }).catch(() => {})));
  }
}

export async function applyArchiveCorrection(requestPath, { root = process.cwd(), apply = false } = {}) {
  const git = args => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trim();
  const request = JSON.parse(await readFile(requestPath, "utf8"));
  if (!/^\d{4}-\d{2}-\d{2}-(?:am|pm|daily)$/.test(request.editionId || "")) throw new Error("invalid edition identity");
  // Workflow must first checkout trusted origin/main; never execute request-branch code.
  const base = git(["rev-parse", "HEAD"]);
  if (base !== git(["rev-parse", "origin/main"])) throw new Error("archive correction requires trusted origin/main checkout");
  const [year, month] = request.editionId.split("-");
  const archiveRel = `public/data/archive/${year}/${month}/${request.editionId}.json`;
  const overlayRel = `public/data/locales/en/archive/${year}/${month}/${request.editionId}.json`;
  const paths = [archiveRel, overlayRel, "public/data/manifest.json", "public/data/latest.json"];
  if (git(["status", "--porcelain", "--", ...paths])) throw new Error("archive correction inputs must be clean");
  for (const relative of paths) {
    // Reject symlinks at every existing component, not merely the final JSON.
    let part = resolve(root, relative);
    while (part !== resolve(root)) {
      if ((await lstat(part)).isSymbolicLink()) throw new Error("archive correction does not follow symlinks");
      part = dirname(part);
    }
  }
  const bytes = await Promise.all(paths.map(path => readFile(resolve(root, path), "utf8")));
  const [canonical, overlay, manifest, latest] = bytes.map(JSON.parse);
  const plan = planArchiveCorrection({ canonical, overlay, manifest, request,
    archiveBlobSha: git(["rev-parse", `${base}:${archiveRel}`]), overlayBlobSha: git(["rev-parse", `${base}:${overlayRel}`]) });
  if (latest.id !== manifest.latest) throw new Error("latest/manifest identity mismatch");
  const files = [{ path: resolve(root, archiveRel), previous: bytes[0], next: JSON.stringify(plan.canonical, null, 2) + "\n" },
    { path: resolve(root, overlayRel), previous: bytes[1], next: JSON.stringify(plan.overlay, null, 2) + "\n" }];
  if (latest.id === canonical.id) {
    if (!isDeepStrictEqual(latest, canonical)) throw new Error("latest/archive mismatch");
    files.push({ path: resolve(root, paths[3]), previous: bytes[3], next: JSON.stringify(plan.canonical, null, 2) + "\n" });
  }
  // Recheck all source bytes and ref after planning; never silently apply onto concurrent work.
  if (git(["rev-parse", "HEAD"]) !== base || git(["rev-parse", "origin/main"]) !== base) throw new Error("main changed during planning");
  for (const [index, path] of paths.entries()) if (await readFile(resolve(root, path), "utf8") !== bytes[index]) throw new Error("input changed during planning");
  if (apply) await writeCorrectionTransaction(files);
  return { editionId: canonical.id, baseMainSha: base, applied: apply, paths: files.map(file => file.path) };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv[2]) throw new Error("usage: node scripts/apply-archive-correction.mjs <request.json>");
  console.log(JSON.stringify(await applyArchiveCorrection(process.argv[2], { apply: process.argv.includes("--apply") })));
}

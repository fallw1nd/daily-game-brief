import { readFile } from "node:fs/promises";
import { posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { editionStatePath, validateEditionState } from "./lib/edition-state.mjs";

function argument(name) {
  return process.argv.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
}
function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}
const verifiedCommits = new Set();
function requireCommit(sha) {
  if (!/^[a-f0-9]{40}$/u.test(String(sha || ""))) throw new Error("deployment receipt requires a full Git commit SHA");
  if (!verifiedCommits.has(sha)) {
    git("cat-file", "-e", `${sha}^{commit}`);
    verifiedCommits.add(sha);
  }
}
function isAncestor(ancestor, descendant) {
  requireCommit(ancestor);
  requireCommit(descendant);
  if (ancestor === descendant) return true;
  try { git("merge-base", "--is-ancestor", ancestor, descendant); return true; }
  catch (error) { if (error.status === 1) return false; throw error; }
}

const stateRoot = resolve(argument("state-root") || ".");
const mainSha = argument("main-sha");
const requested = argument("edition");
const outcome = argument("outcome");
if (!["success", "failure"].includes(outcome)) throw new Error("deployment outcome must be success or failure");
if (requested) editionStatePath(requested);
if (outcome === "failure" && !requested) throw new Error("failed deployment acknowledgement requires an exact edition");
requireCommit(mainSha);

// Never inspect a newer main checkout: these are the files in this deployment.
const manifest = JSON.parse(git("show", `${mainSha}:public/data/manifest.json`));
if (!Array.isArray(manifest.editions)) throw new Error("deployed manifest editions must be an array");
const results = [];
for (const entry of manifest.editions) {
  if (outcome === "failure" && entry.id !== requested) continue;
  const relativePath = editionStatePath(entry.id);
  let state;
  try { state = JSON.parse(await readFile(resolve(stateRoot, relativePath), "utf8")); }
  catch (error) { if (error.code === "ENOENT") continue; throw error; }
  // Archives predating durable state and open revisions must not acquire a
  // synthetic publication/deployment receipt from an unrelated Pages run.
  if (state.publication?.status !== "committed" || !state.publication.mainSha) continue;
  const errors = validateEditionState(state);
  if (errors.length || state.editionId !== entry.id) throw new Error(`invalid deployment state for ${entry.id}: ${errors.join("; ")}`);
  if (!isAncestor(state.publication.mainSha, mainSha)) continue;

  const lastSuccess = state.transitions.findLast(item => item.event === "deployment-succeeded");
  // publication-committed can update the lane's SHA without a real deployment.
  // Only a successful transition can prove that a replayed publication is live.
  const covered = lastSuccess?.mainSha && isAncestor(state.publication.mainSha, lastSuccess.mainSha);
  if (outcome === "success" && entry.id !== requested && entry.id !== manifest.latest
    && state.deployment.status === "deployed" && covered) continue;

  if (typeof entry.path !== "string" || !entry.path.startsWith("archive/")
    || posix.normalize(entry.path) !== entry.path || entry.path.includes("\\")) {
    throw new Error(`unsafe deployed archive path for ${entry.id}`);
  }
  const archive = JSON.parse(git("show", `${mainSha}:public/data/${entry.path}`));
  if (archive.id !== entry.id) throw new Error(`deployed archive identity does not match ${entry.id}`);
  if (outcome === "success" && state.deployment.status === "deployed"
    && state.deployment.mainSha === mainSha && lastSuccess?.mainSha === mainSha) continue;

  execFileSync(process.execPath, [
    fileURLToPath(new URL("./record-edition-state.mjs", import.meta.url)),
    `--state-root=${stateRoot}`, `--edition=${entry.id}`,
    `--event=deployment-${outcome === "success" ? "succeeded" : "failed"}`,
    `--main-sha=${mainSha}`, "--error=GitHub Pages deployment failed",
  ], { stdio: "inherit" });
  const recorded = JSON.parse(await readFile(resolve(stateRoot, relativePath), "utf8"));
  if (recorded.revision !== state.revision) results.push(entry.id);
}
console.log(JSON.stringify({ outcome, mainSha, acknowledged: results }));

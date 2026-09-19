import { execFile } from "node:child_process";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

import { applyEditionStateEvent, editionStatePath } from "./lib/edition-state.mjs";
import { persistEditorialFeedback } from "./lib/editorial-feedback-transaction.mjs";
import { advanceEditorialQueue } from "./lib/editorial-queue.mjs";

const exec = promisify(execFile);

function argumentValue(args, name) {
  return args.find(item => item.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
}

export function createEditorialBundleSmokeDriver({ root, editionId }) {
  const statePath = resolve(root, editionStatePath(editionId));

  async function git(args) {
    return exec("git", args, { cwd: root, maxBuffer: 20 * 1024 * 1024 });
  }

  async function commitState() {
    const paths = [`automation/status/${editionId}.json`, `automation/batches/${editionId}`, `automation/packets/${editionId}.json`];
    try { await access(resolve(root, "automation/ledger/events.json")); paths.push("automation/ledger/events.json"); } catch (error) { if (error.code !== "ENOENT") throw error; }
    await git(["add", ...paths]);
    let changed = true;
    try {
      await git(["diff", "--cached", "--quiet"]);
      changed = false;
    } catch {
      changed = true;
    }
    if (changed) await git(["commit", "-m", `test(automation): update ${editionId} bundle state`]);
    await git(["push", "origin", "HEAD:automation/state"]);
    await git(["update-ref", "refs/remotes/origin/automation/state", "HEAD"]);
  }

  async function readCurrentState() {
    return JSON.parse(await readFile(statePath, "utf8"));
  }

  return {
    async readState() {
      return { commit: "local-smoke", value: await readCurrentState() };
    },

    async updateState(event, args) {
      const current = await readCurrentState();
      const validationPath = argumentValue(args, "validation");
      const validation = validationPath ? JSON.parse(await readFile(resolve(root, validationPath), "utf8")) : { errors: [] };
      const next = applyEditionStateEvent(current, event, {
        editionId,
        at: argumentValue(args, "at") || new Date().toISOString(),
        packetBlobSha: argumentValue(args, "packet-blob-sha"),
        submissionSha: argumentValue(args, "submission-sha"),
        mainSha: argumentValue(args, "main-sha"),
        source: argumentValue(args, "source"),
        decisionDigest: argumentValue(args, "decision-digest"),
        status: argumentValue(args, "status"),
        reason: argumentValue(args, "reason"),
        validationErrors: validation.errors || [],
        runId: process.env.GITHUB_RUN_ID || "bundle-smoke",
        actor: "editorial-bundle-smoke-driver",
      });
      await writeFile(statePath, JSON.stringify(next, null, 2) + "\n");
      await commitState();
    },

    async advanceQueue() {
      const queuePath = resolve(root, `automation/batches/${editionId}/queue.json`);
      let queue;
      try { queue = JSON.parse(await readFile(queuePath, "utf8")); }
      catch (error) { if (error.code === "ENOENT") return; throw error; }
      const state = await readCurrentState();
      const manifest = JSON.parse(await readFile(resolve(root, "public/data/manifest.json"), "utf8"));
      const manifestItem = manifest.editions.find(item => item.id === editionId);
      if (!manifestItem) throw new Error(`bundle smoke cannot advance a missing ${editionId} manifest item`);
      const canonical = JSON.parse(await readFile(resolve(root, "public/data", manifestItem.path), "utf8"));
      const packets = Object.fromEntries(await Promise.all(queue.batches.filter(batch => batch.status !== "completed").map(async batch => [
        batch.name,
        await readFile(resolve(root, `automation/batches/${editionId}/${batch.name}`), "utf8"),
      ])));
      const result = advanceEditorialQueue({ queue, state, canonical, packets, now: new Date().toISOString() });
      await writeFile(queuePath, JSON.stringify(result.queue, null, 2) + "\n");
      if (result.packet) {
        await mkdir(resolve(root, "automation/packets"), { recursive: true });
        await writeFile(resolve(root, `automation/packets/${editionId}.json`), result.packet);
        await writeFile(statePath, JSON.stringify(result.state, null, 2) + "\n");
      }
      await commitState();
    },

    async persistFeedback({ submission, planPath, packetDir, decidedAt, decisionIdentity }) {
      const status = await persistEditorialFeedback({
        root,
        editionId,
        submissionIndex: submission.index,
        planPath,
        packetDir,
        decidedAt,
        decisionIdentity,
        runnerTemp: resolve(root, "runner-temp"),
        runId: process.env.GITHUB_RUN_ID || "bundle-smoke",
        maxAttempts: 3,
        runCommand: (file, args, options = {}) => exec(file, args, { cwd: root, maxBuffer: 20 * 1024 * 1024, ...options }),
      });
      await git(["fetch", "origin", "+refs/heads/automation/state:refs/remotes/origin/automation/state"]);
      await git(["reset", "--hard", "origin/automation/state"]);
      await git(["update-ref", "refs/remotes/origin/automation/state", "HEAD"]);
      return `production-transaction-${status}`;
    },
  };
}

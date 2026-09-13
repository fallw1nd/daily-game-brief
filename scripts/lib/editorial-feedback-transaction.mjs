import { execFile } from "node:child_process";
import { rm } from "node:fs/promises";
import { basename, isAbsolute, join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

const exec = promisify(execFile);

function safeFeedbackDirectory(parent, runId, index, attempt) {
  const path = resolve(parent, `editorial-bundle-feedback-${runId}-${index}-${attempt}`);
  const escaped = relative(parent, path);
  if (!escaped || escaped.startsWith("..") || isAbsolute(escaped) || !basename(path).startsWith("editorial-bundle-feedback-")) {
    throw new Error("refusing to use a feedback worktree outside the runner temp directory");
  }
  return path;
}

/**
 * Apply one already-published bundle decision to the durable ledger. Every
 * attempt fetches a fresh state ref and creates a fresh worktree, so a racing
 * collector or manual revision is preserved on a compare-and-retry push.
 */
export async function persistEditorialFeedback({
  root = resolve("."),
  editionId,
  submissionIndex,
  planPath,
  packetDir,
  runnerTemp = tmpdir(),
  runId = "local",
  runCommand = (file, args, options = {}) => exec(file, args, { cwd: root, maxBuffer: 20 * 1024 * 1024, ...options }),
  maxAttempts = 3,
}) {
  const parent = resolve(runnerTemp);
  const owned = new Set();
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const stateDir = safeFeedbackDirectory(parent, runId, submissionIndex, attempt);
    let worktreeAdded = false;
    try {
      await runCommand("git", ["fetch", "origin", "+refs/heads/automation/state:refs/remotes/origin/automation/state"]);
      await runCommand("git", ["worktree", "add", "--detach", stateDir, "origin/automation/state"]);
      worktreeAdded = true;
      owned.add(stateDir);
      await runCommand(process.execPath, ["scripts/apply-editorial-bundle-feedback.mjs"], {
        env: {
          ...process.env,
          EDITORIAL_BUNDLE_PATH: planPath,
          EDITORIAL_BUNDLE_PACKET_DIR: packetDir,
          EDITORIAL_BUNDLE_ONLY_INDEX: String(submissionIndex),
          EVENT_LEDGER_PATH: join(stateDir, "automation/ledger/events.json"),
        },
      });
      await runCommand("git", ["-C", stateDir, "add", "automation/ledger/events.json"]);
      let changed = true;
      try {
        await runCommand("git", ["-C", stateDir, "diff", "--cached", "--quiet"]);
        changed = false;
      } catch {
        changed = true;
      }
      if (!changed) return "already-recorded";
      await runCommand("git", ["-C", stateDir, "commit", "-m", `chore(automation): record ${editionId} bundle item ${submissionIndex}`]);
      await runCommand("git", ["-C", stateDir, "push", "origin", "HEAD:automation/state"]);
      return "recorded";
    } catch (error) {
      if (attempt === maxAttempts) throw error;
    } finally {
      const escaped = relative(parent, stateDir);
      if (worktreeAdded && owned.has(stateDir) && escaped && !escaped.startsWith("..") && !isAbsolute(escaped)) {
        try { await runCommand("git", ["worktree", "remove", "--force", stateDir]); }
        finally {
          owned.delete(stateDir);
          await rm(stateDir, { recursive: true, force: true });
        }
      }
    }
  }
  throw new Error(`failed to persist feedback for bundle item ${submissionIndex}`);
}

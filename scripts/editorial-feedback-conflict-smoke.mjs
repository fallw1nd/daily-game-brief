import { execFile } from "node:child_process";
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { gitBlobSha } from "./lib/edition-state.mjs";
import { persistEditorialFeedback } from "./lib/editorial-feedback-transaction.mjs";

const exec = promisify(execFile);
const sourceRoot = resolve(".");
const editionId = "2026-09-13-daily";
const eventKey = "feedback-conflict-fact";

async function command(cwd, file, args, options = {}) {
  return exec(file, args, { cwd, maxBuffer: 20 * 1024 * 1024, ...options });
}

function jsonText(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, jsonText(value));
}

function feedbackFixture() {
  const packet = {
    editorialInput: {
      packages: [{
        eventKey,
        subjectKey: "feedback-game",
        sources: [{ sourceIndex: 0, canonicalUrl: "https://publisher.example/feedback-conflict" }],
      }],
      trackingQueue: [],
    },
  };
  const packetText = jsonText(packet);
  const packetBlobSha = gitBlobSha(packetText);
  const editorial = {
    editionId,
    decisions: [{
      eventKey,
      decision: "include",
      tracking: false,
      reason: "冲突重试 smoke 测试。",
      headline: "《Feedback Game》确认事实",
      releaseType: "更新",
      titleKey: "feedback-game",
      sourceIndexes: [0],
    }],
  };
  return {
    packetText,
    packetBlobSha,
    plan: {
      schemaVersion: 1,
      editionId,
      submissions: [{ index: 0, packetBlobSha, editorial }],
    },
  };
}

async function seedScenario() {
  const root = await mkdtemp(join(tmpdir(), "daily-game-brief-feedback-conflict-"));
  const remote = await mkdtemp(join(tmpdir(), "daily-game-brief-feedback-conflict-remote-"));
  await command(sourceRoot, "git", ["init", "--bare", remote]);
  await command(sourceRoot, "git", ["clone", "--local", "--no-hardlinks", sourceRoot, root]);
  await command(root, "git", ["remote", "set-url", "origin", remote]);
  await command(root, "git", ["config", "user.name", "feedback-conflict-smoke"]);
  await command(root, "git", ["config", "user.email", "feedback-conflict@example.invalid"]);

  await mkdir(join(root, "scripts/lib"), { recursive: true });
  for (const file of [
    "scripts/apply-editorial-bundle-feedback.mjs",
    "scripts/lib/event-ledger.mjs",
    "scripts/lib/editorial-feedback-transaction.mjs",
  ]) {
    await cp(resolve(sourceRoot, file), resolve(root, file));
  }

  await writeJson(join(root, "automation/ledger/events.json"), {
    schemaVersion: 2,
    updatedAt: "2026-09-13T04:00:00.000Z",
    retentionDays: 45,
    totals: { events: 1, recurring: 0, tracking: 0 },
    events: {
      preserved: {
        eventKey: "preserved",
        eventKind: "news",
        subjectKey: "preserved-game",
        lastHeadline: "并发前已有记录",
        firstSeenAt: "2026-09-12T04:00:00.000Z",
        lastSeenAt: "2026-09-13T04:00:00.000Z",
        windowsSeen: ["2026-09-12-daily"],
      },
    },
  });
  await command(root, "git", ["add", "automation/ledger/events.json"]);
  await command(root, "git", ["commit", "-m", "test(automation): seed feedback conflict ledger"]);
  await command(root, "git", ["push", "origin", "HEAD:main"]);
  await command(root, "git", ["push", "origin", "HEAD:automation/state"]);
  await command(root, "git", ["fetch", "origin", "+refs/heads/automation/state:refs/remotes/origin/automation/state"]);

  const fixture = feedbackFixture();
  const packetDir = join(root, "artifacts/editorial-bundle-packets");
  const planPath = join(root, "artifacts/editorial-bundle-plan.json");
  await mkdir(packetDir, { recursive: true });
  await writeFile(join(packetDir, `${fixture.packetBlobSha}.json`), fixture.packetText);
  await writeJson(planPath, fixture.plan);
  const runnerTemp = join(root, "runner-temp");
  await mkdir(runnerTemp, { recursive: true });
  return { root, remote, packetDir, planPath, runnerTemp };
}

async function addConcurrentActorChange(scenario, attempt, actorRoots) {
  const actorRoot = await mkdtemp(join(tmpdir(), `daily-game-brief-feedback-actor-${attempt}-`));
  actorRoots.push(actorRoot);
  await command(sourceRoot, "git", ["clone", "--local", "--no-hardlinks", scenario.remote, actorRoot]);
  await command(actorRoot, "git", ["config", "user.name", `concurrent-actor-${attempt}`]);
  await command(actorRoot, "git", ["config", "user.email", `concurrent-${attempt}@example.invalid`]);
  await command(actorRoot, "git", ["fetch", "origin", "+refs/heads/automation/state:refs/remotes/origin/automation/state"]);
  await command(actorRoot, "git", ["checkout", "--detach", "refs/remotes/origin/automation/state"]);
  await writeJson(join(actorRoot, `automation/concurrent/collector-${attempt}.json`), {
    actor: "collector",
    attempt,
    preservedByLatestStateRetry: true,
  });
  await writeJson(join(actorRoot, `automation/concurrent/manual-revision-${attempt}.json`), {
    actor: "manual-revision",
    attempt,
    preservedByLatestStateRetry: true,
  });
  await command(actorRoot, "git", ["add", "automation/concurrent"]);
  await command(actorRoot, "git", ["commit", "-m", `test(automation): concurrent actor ${attempt}`]);
  await command(actorRoot, "git", ["push", "origin", "HEAD:automation/state"]);
}

function makeRunnerCommand(scenario, { injectConflicts, actorRoots }) {
  let pushCalls = 0;
  const runCommand = async (file, args, options = {}) => {
    if (injectConflicts && file === "git" && args.includes("push") && args.at(-1) === "HEAD:automation/state") {
      pushCalls += 1;
      await addConcurrentActorChange(scenario, pushCalls, actorRoots);
    }
    return command(scenario.root, file, args, options);
  };
  return { runCommand, pushCalls: () => pushCalls };
}

async function readRemoteState(scenario) {
  await command(scenario.root, "git", ["fetch", "origin", "+refs/heads/automation/state:refs/remotes/origin/automation/state"]);
  const files = (await command(scenario.root, "git", ["ls-tree", "-r", "--name-only", "refs/remotes/origin/automation/state"])).stdout
    .split(/\r?\n/u)
    .filter(Boolean);
  const ledger = JSON.parse((await command(scenario.root, "git", ["show", "refs/remotes/origin/automation/state:automation/ledger/events.json"])).stdout);
  return { files, ledger };
}

async function main() {
  const scenario = await seedScenario();
  const actorRoots = [];
  try {
    const failing = makeRunnerCommand(scenario, { injectConflicts: true, actorRoots });
    let exhaustedError = null;
    try {
      await persistEditorialFeedback({
        root: scenario.root,
        editionId,
        submissionIndex: 0,
        planPath: scenario.planPath,
        packetDir: scenario.packetDir,
        runnerTemp: scenario.runnerTemp,
        runId: "conflict-smoke",
        maxAttempts: 3,
        runCommand: failing.runCommand,
      });
    } catch (error) {
      exhaustedError = String(error.message || error);
    }
    const exhaustedState = await readRemoteState(scenario);
    const actorFilesAfterExhaustion = exhaustedState.files.filter(file => file.startsWith("automation/concurrent/"));
    if (failing.pushCalls() !== 3 || actorFilesAfterExhaustion.length !== 6 || exhaustedState.ledger.events[eventKey]) {
      throw new Error("three feedback push conflicts did not leave all concurrent changes and pending feedback intact");
    }

    const recovery = makeRunnerCommand(scenario, { injectConflicts: false, actorRoots });
    const recoveredStatus = await persistEditorialFeedback({
      root: scenario.root,
      editionId,
      submissionIndex: 0,
      planPath: scenario.planPath,
      packetDir: scenario.packetDir,
      runnerTemp: scenario.runnerTemp,
      runId: "conflict-smoke-recovery",
      maxAttempts: 3,
      runCommand: recovery.runCommand,
    });
    const recoveredState = await readRemoteState(scenario);
    const actorFilesAfterRecovery = recoveredState.files.filter(file => file.startsWith("automation/concurrent/"));
    const feedbackEvent = recoveredState.ledger.events[eventKey];
    if (recoveredStatus !== "recorded" || actorFilesAfterRecovery.length !== 6 || !feedbackEvent || !recoveredState.ledger.events.preserved) {
      throw new Error("latest-state feedback retry did not preserve concurrent actor changes");
    }
    console.log(JSON.stringify({
      maxAttempts: 3,
      conflictPushes: failing.pushCalls(),
      exhausted: { feedbackPending: true, error: exhaustedError, concurrentFiles: actorFilesAfterExhaustion.length },
      recovery: { status: recoveredStatus, feedbackRecorded: Boolean(feedbackEvent), concurrentFilesPreserved: actorFilesAfterRecovery.length, priorLedgerEventPreserved: Boolean(recoveredState.ledger.events.preserved) },
    }, null, 2));
  } finally {
    for (const actorRoot of actorRoots) await rm(actorRoot, { recursive: true, force: true });
    await rm(scenario.root, { recursive: true, force: true });
    await rm(scenario.remote, { recursive: true, force: true });
  }
}

await main();

import { execFile } from "node:child_process";
import { access, cp, mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { applyEditionStateEvent, createEditionState, gitBlobSha } from "./lib/edition-state.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";

const run = promisify(execFile);
const sourceRoot = resolve(".");
const editionId = "2026-09-17-daily";
const window = expectedEditorialWindow(editionId);
const source = {
  sourceIndex: 0,
  status: "opened",
  kind: "primary",
  independenceKey: "publisher",
  label: "Publisher",
  url: "https://publisher.example/bundle-smoke",
  canonicalUrl: "https://publisher.example/bundle-smoke",
  evidenceText: "The publisher confirms the bounded bundle smoke-test fact.",
};

function packetFor(eventKey, scope = null) {
  return {
    schemaVersion: 3,
    mode: "chatgpt-handoff",
    finalizedAt: "2026-09-17T04:00:00.000Z",
    coverageThrough: window.windowEnd,
    outputSchema: {},
    ...(scope ? { continuation: { scope, preservePublished: true } } : {}),
    editorialInput: {
      schemaVersion: 2,
      window,
      trackingQueue: [],
      packages: [{
        eventKey,
        subjectKey: "bundle-game",
        sources: [source],
        ...(scope === "showcase" ? {
          showcaseRefs: [{ showcaseId: "direct", announcementId: eventKey }],
          showcaseFacts: [{ id: `${eventKey}-fact` }],
        } : {}),
      }],
      ...(scope === "showcase" ? {
        showcases: {
          events: [{ id: "direct", kind: "nintendo-direct", date: "2026-09-17", sources: [] }],
          announcements: [{ id: eventKey, showcaseId: "direct", factUnits: [{ id: `${eventKey}-fact` }] }],
        },
      } : {}),
      budget: { maxInputChars: 120000, usedInputChars: 1000 },
    },
  };
}

function editorialFor(eventKey, packetBlobSha, scope = null) {
  return {
    contractVersion: 2,
    packetBlobSha,
    editionId,
    archiveTitle: "日报｜《Bundle Game》确认事实",
    leadEventKey: eventKey,
    decisions: [{
      eventKey,
      decision: "include",
      section: "news",
      titleKey: "bundle-game",
      titleZhCn: null,
      titleEn: "Bundle Game",
      titleZhStatus: "unavailable",
      headline: `《Bundle Game》确认${eventKey === "daily-fact" ? "首条" : "续接"}事实`,
      summary: "发行方确认了这项有界包中的事实。",
      factStatus: "official",
      timeStatus: "date_only",
      entryFlags: [],
      tracking: false,
      verification: "已打开发行方一手来源。",
      reason: "一手来源确认。",
      beijingTime: "2026-09-17 11:00",
      timeNote: "只确认日期。",
      platforms: ["PC"],
      region: "全球",
      releaseType: "更新",
      sourceIndexes: [0],
      additionalSources: [],
      ...(scope === "showcase" ? { coveredFactIds: [`${eventKey}-fact`] } : {}),
      sharedFactFrame: {
        subjectTitleKey: "bundle-game",
        dates: ["2026-09-17"],
        times: [],
        numbers: [eventKey],
        platforms: ["PC"],
        peopleAndEntities: [],
        versionsAndTerms: [],
      },
    }],
    upcomingMode: "inherit_and_patch",
    removeUpcomingIds: [],
    upcoming: [],
    checkedExtra: [],
    limitedExtra: [],
    editorialNote: "有界 bundle 编辑。",
  };
}

function jsonText(value) {
  return JSON.stringify(value, null, 2) + "\n";
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, jsonText(value));
}

async function copyRuntimeFiles(root) {
  const files = [
    "scripts/lib/editorial-queue.mjs",
    "scripts/lib/edition-state.mjs",
    "scripts/lib/editorial-bundle.mjs",
    "scripts/lib/edition-publisher.mjs",
    "scripts/lib/event-ledger.mjs",
    "scripts/lib/locale-digest.mjs",
    "scripts/lib/editorial-feedback-transaction.mjs",
    "scripts/editorial-bundle-smoke-driver.mjs",
    "scripts/prepare-editorial-bundle.mjs",
    "scripts/run-editorial-bundle.mjs",
    "scripts/apply-editorial-bundle-feedback.mjs",
    "scripts/editorial-bundle.test.mjs",
    "scripts/editorial-queue.test.mjs",
    "scripts/event-ledger.test.mjs",
  ];
  for (const file of files) {
    await mkdir(resolve(root, file, ".."), { recursive: true });
    await cp(resolve(sourceRoot, file), resolve(root, file));
  }
}

async function createScenario(label, continuationScope = "news") {
  const root = await mkdtemp(join(tmpdir(), `daily-game-brief-bundle-${label}-`));
  const remote = await mkdtemp(join(tmpdir(), `daily-game-brief-bundle-remote-${label}-`));
  await run("git", ["init", "--bare", remote], { cwd: sourceRoot });
  await run("git", ["clone", "--local", "--no-hardlinks", sourceRoot, root], { cwd: sourceRoot });
  await run("git", ["remote", "set-url", "origin", remote], { cwd: root });
  await run("git", ["config", "user.name", "bundle-smoke"], { cwd: root });
  await run("git", ["config", "user.email", "bundle-smoke@example.invalid"], { cwd: root });
  await symlink(join(sourceRoot, "node_modules"), join(root, "node_modules"), "junction");
  await copyRuntimeFiles(root);
  // The fixture edition is deliberately treated as unpublished even when the
  // source checkout already contains that historical archive after a main merge.
  const fixtureManifest = await readJson(join(root, "public/data/manifest.json"));
  fixtureManifest.editions = fixtureManifest.editions.filter(item => item.id !== editionId);
  await writeJson(join(root, "public/data/manifest.json"), fixtureManifest);

  const normalPacket = packetFor("daily-fact");
  const continuationEventKey = continuationScope === "showcase" ? "showcase-fact" : "news-fact";
  const newsPacket = packetFor(continuationEventKey, continuationScope);
  const normalPacketText = jsonText(normalPacket);
  const newsPacketText = jsonText(newsPacket);
  const normalPacketSha = gitBlobSha(normalPacketText);
  const newsPacketSha = gitBlobSha(newsPacketText);
  const normalEditorial = editorialFor("daily-fact", normalPacketSha);
  const newsEditorial = editorialFor(continuationEventKey, newsPacketSha, continuationScope);
  const stateAt = "2026-09-17T04:30:00.000Z";
  let state = createEditionState(editionId, stateAt);
  state = applyEditionStateEvent(state, "packet-ready", { packetBlobSha: normalPacketSha, at: stateAt });
  const queue = {
    schemaVersion: 1,
    editionId,
    totalAnnouncements: continuationScope === "showcase" ? 1 : 0,
    requiredFacts: continuationScope === "showcase" ? { [continuationEventKey]: [`${continuationEventKey}-fact`] } : {},
    batches: [{ name: `${continuationScope}-1.json`, scope: continuationScope, status: "pending", eventKeys: [continuationEventKey] }],
  };
  await writeJson(join(root, "automation/status", `${editionId}.json`), state);
  await writeJson(join(root, "automation/batches", editionId, "queue.json"), queue);
  await mkdir(join(root, "automation/packets"), { recursive: true });
  await writeFile(join(root, "automation/packets", `${editionId}.json`), normalPacketText);
  await writeFile(join(root, "automation/batches", editionId, `${continuationScope}-1.json`), newsPacketText);
  await writeJson(join(root, "automation/bundle-inbox", `${editionId}.json`), {
    schemaVersion: 1,
    editionId,
    submissions: [
      { requestedScope: "canonical", editorial: normalEditorial },
      { requestedScope: continuationScope, requestedBatchName: `${continuationScope}-1.json`, editorial: newsEditorial },
    ],
  });
  await run("git", ["add", "automation"], { cwd: root });
  await run("git", ["commit", "-m", `test(automation): seed ${editionId} bundle smoke`], { cwd: root });
  const stateCommit = (await run("git", ["rev-parse", "HEAD"], { cwd: root })).stdout.trim();
  await run("git", ["push", "origin", `HEAD:main`], { cwd: root });
  await run("git", ["push", "origin", `HEAD:automation/state`], { cwd: root });
  await run("git", ["update-ref", "refs/remotes/origin/automation/state", stateCommit], { cwd: root });
  return {
    root,
    remote,
    normalPacketSha,
    newsPacketSha,
    bundlePath: join(root, "automation/bundle-inbox", `${editionId}.json`),
    planPath: join(root, "artifacts/editorial-bundle-plan.json"),
    packetDir: join(root, "artifacts/editorial-bundle-packets"),
    resultPath: join(root, "artifacts/editorial-bundle-result.json"),
    statePath: join(root, "automation/status", `${editionId}.json`),
  };
}

function bundleEnv(scenario, overrides = {}) {
  return {
    ...process.env,
    EDITORIAL_BRANCH: `automation/editorial/${editionId}`,
    EDITORIAL_BUNDLE_PATH: scenario.bundlePath,
    EDITORIAL_STATE_ROOT: scenario.root,
    EDITORIAL_BUNDLE_PLAN_PATH: scenario.planPath,
    EDITORIAL_BUNDLE_PACKET_DIR: scenario.packetDir,
    EDITORIAL_BUNDLE_RESULT_PATH: scenario.resultPath,
    EDITORIAL_BUNDLE_STATE_DRIVER: join(scenario.root, "scripts/editorial-bundle-smoke-driver.mjs"),
    EDITORIAL_BUNDLE_SMOKE: "true",
    EDITORIAL_BUNDLE_MAX_MS: "720000",
    GITHUB_RUN_ID: "bundle-smoke",
    RUNNER_TEMP: join(scenario.root, "runner-temp"),
    ...overrides,
  };
}

async function prepare(scenario, overrides = {}) {
  return run(process.execPath, ["scripts/prepare-editorial-bundle.mjs"], {
    cwd: scenario.root,
    env: bundleEnv(scenario, overrides),
    maxBuffer: 20 * 1024 * 1024,
  });
}

async function runBundle(scenario, overrides = {}) {
  try {
    const result = await run(process.execPath, ["scripts/run-editorial-bundle.mjs"], {
      cwd: scenario.root,
      env: bundleEnv(scenario, overrides),
      maxBuffer: 20 * 1024 * 1024,
    });
    return { ok: true, stdout: result.stdout.trim() };
  } catch (error) {
    return { ok: false, error: String(error.stderr || error.stdout || error.message).trim() };
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function commitStateFixture(scenario, message) {
  await run("git", ["add", "automation/status"], { cwd: scenario.root });
  try {
    await access(join(scenario.root, "automation/ledger/events.json"));
    await run("git", ["add", "automation/ledger/events.json"], { cwd: scenario.root });
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  await run("git", ["commit", "-m", message], { cwd: scenario.root });
  const head = (await run("git", ["rev-parse", "HEAD"], { cwd: scenario.root })).stdout.trim();
  await run("git", ["push", "origin", "HEAD:automation/state"], { cwd: scenario.root });
  await run("git", ["update-ref", "refs/remotes/origin/automation/state", head], { cwd: scenario.root });
}

async function executeSuccess() {
  const scenario = await createScenario("success");
  try {
    await prepare(scenario);
    const plan = await readJson(scenario.planPath);
    if (plan.submissions.length !== 2 || plan.submissions[0].scope !== "canonical" || plan.submissions[1].scope !== "news") {
      throw new Error("prepare did not resolve normal Daily followed by same-edition news");
    }
    const result = await runBundle(scenario);
    if (!result.ok) throw new Error(`two-package bundle failed: ${result.error}`);
    const publication = await readJson(scenario.resultPath);
    const manualLedgerPath = join(scenario.root, "automation/ledger/events.json");
    const manualLedger = await readJson(manualLedgerPath);
    manualLedger.events["daily-fact"] = {
      ...manualLedger.events["daily-fact"],
      lastDecisionEdition: "2026-09-14-daily",
      lastDecision: "exclude",
      lastDecisionReason: "后续人工决定，bundle replay 不得覆盖。",
    };
    await writeJson(manualLedgerPath, manualLedger);
    await commitStateFixture(scenario, "test(automation): preserve later manual ledger decision");
    const rerun = await runBundle(scenario);
    if (!rerun.ok) throw new Error(`complete bundle rerun failed: ${rerun.error}`);
    const rerunPublication = await readJson(scenario.resultPath);
    const finalLedger = await readJson(manualLedgerPath);
    const state = await readJson(scenario.statePath);
    const queue = await readJson(join(scenario.root, "automation/batches", editionId, "queue.json"));
    const manifest = await readJson(join(scenario.root, "public/data/manifest.json"));
    const target = manifest.editions.find(item => item.id === editionId);
    return {
      plan: { submissions: plan.submissions.map(item => ({ index: item.index, scope: item.scope, batchName: item.batchName, packetBlobSha: item.packetBlobSha })) },
      result: { results: publication.results, changed: publication.changed },
      completeRerun: {
        results: rerunPublication.results,
        changed: rerunPublication.changed,
        allItemsIdempotent: rerunPublication.results.every(item => item.status === "already-exists"),
        feedbackStillEligible: rerunPublication.feedbackEligible === true,
      },
      feedback: {
        ledgerExists: await readFile(manualLedgerPath, "utf8").then(() => true).catch(() => false),
        laterManualDecisionPreserved: finalLedger.events["daily-fact"]?.lastDecisionEdition === "2026-09-14-daily" && finalLedger.events["daily-fact"]?.lastDecision === "exclude",
      },
      durableState: { editorial: state.editorial.status, publication: state.publication.status, revisionRequest: state.revisionRequest?.status || null },
      queue: { batch: queue.batches[0].name, status: queue.batches[0].status },
      published: { manifestHasEdition: Boolean(target), issueNumber: target?.issueNumber || null },
    };
  } finally {
    await rm(scenario.root, { recursive: true, force: true });
    await rm(scenario.remote, { recursive: true, force: true });
  }
}

async function executeShowcaseStartAndReplay() {
  const scenario = await createScenario("showcase-start", "showcase");
  try {
    await prepare(scenario);
    const plan = await readJson(scenario.planPath);
    if (plan.submissions.length !== 2 || plan.submissions[0].scope !== "canonical" || plan.submissions[1].scope !== "showcase" || plan.submissions[1].batchName !== "showcase-1.json") {
      throw new Error("prepare did not resolve a showcase continuation batch from the durable queue");
    }
    const initialRun = await runBundle(scenario);
    if (!initialRun.ok) throw new Error(`showcase-start bundle failed: ${initialRun.error}`);
    const initialResult = await readJson(scenario.resultPath);
    const queueAfterPublish = await readJson(join(scenario.root, "automation/batches", editionId, "queue.json"));
    if (queueAfterPublish.batches[0]?.status !== "completed") throw new Error("showcase batch was not completed after publication");

    await prepare(scenario);
    const replayPlan = await readJson(scenario.planPath);
    if (replayPlan.submissions[1]?.scope !== "showcase" || replayPlan.submissions[1]?.batchName !== "showcase-1.json") {
      throw new Error("prepare did not resolve the historical showcase batch during replay");
    }
    const replayRun = await runBundle(scenario);
    if (!replayRun.ok) throw new Error(`showcase replay bundle failed: ${replayRun.error}`);
    const replayResult = await readJson(scenario.resultPath);
    return {
      initialPlan: plan.submissions.map(item => ({ index: item.index, scope: item.scope, batchName: item.batchName, packetBlobSha: item.packetBlobSha })),
      replayPlan: replayPlan.submissions.map(item => ({ index: item.index, scope: item.scope, batchName: item.batchName, packetBlobSha: item.packetBlobSha })),
      initial: { results: initialResult.results, changed: initialResult.changed },
      replay: { results: replayResult.results, changed: replayResult.changed, allItemsIdempotent: replayResult.results.every(item => item.status === "already-exists") },
      queue: { batch: queueAfterPublish.batches[0].name, status: queueAfterPublish.batches[0].status },
    };
  } finally {
    await rm(scenario.root, { recursive: true, force: true });
    await rm(scenario.remote, { recursive: true, force: true });
  }
}

async function executePackageTwoRetry() {
  const scenario = await createScenario("packet-two-retry");
  try {
    await prepare(scenario);
    const initialPlan = await readJson(scenario.planPath);
    const failed = await runBundle(scenario, { EDITORIAL_BUNDLE_FAIL_INDEX: "1" });
    if (failed.ok) throw new Error("packet-two failure injection unexpectedly succeeded");
    const partialResult = await readJson(scenario.resultPath);
    const afterFailureState = await readJson(scenario.statePath);
    const manifestAfterFailure = await readJson(join(scenario.root, "public/data/manifest.json"));
    const firstWasPublished = Boolean(manifestAfterFailure.editions.find(item => item.id === editionId));
    if (!firstWasPublished || afterFailureState.packet.blobSha !== scenario.newsPacketSha || afterFailureState.revisionRequest?.status !== "open") {
      throw new Error("packet-two failure did not leave packet one published and packet two active");
    }
    const oldEditorial = structuredClone(initialPlan.submissions[1].editorial);
    oldEditorial.decisions[0].summary = "旧稿摘要，仅用于验证同 packet 重验。";
    const oldSubmissionSha = gitBlobSha(jsonText(oldEditorial));
    let staleState = await readJson(scenario.statePath);
    staleState = applyEditionStateEvent(staleState, "editorial-submitted", {
      packetBlobSha: scenario.newsPacketSha,
      submissionSha: oldSubmissionSha,
      at: "2026-09-17T05:00:00.000Z",
    });
    staleState = applyEditionStateEvent(staleState, "editorial-valid", {
      packetBlobSha: scenario.newsPacketSha,
      submissionSha: oldSubmissionSha,
      at: "2026-09-17T05:01:00.000Z",
    });
    await writeJson(scenario.statePath, staleState);
    await commitStateFixture(scenario, "test(automation): seed stale valid bundle decision");
    await prepare(scenario);
    const rerunPlan = await readJson(scenario.planPath);
    const rerun = await runBundle(scenario);
    if (!rerun.ok) throw new Error(`packet-two repair rerun failed: ${rerun.error}`);
    const result = await readJson(scenario.resultPath);
    const finalState = await readJson(scenario.statePath);
    const newsSubmissions = finalState.transitions.filter(item => item.event === "editorial-submitted" && item.packetBlobSha === scenario.newsPacketSha);
    return {
      firstRunFailure: failed.error,
      partialResult: { status: partialResult.status, publishedItems: partialResult.results.map(item => ({ index: item.index, feedbackStatus: item.feedbackStatus })) },
      rerunPlan: rerunPlan.submissions.map(item => ({ index: item.index, scope: item.scope, packetBlobSha: item.packetBlobSha })),
      rerunResults: result.results,
      packetOneWasIdempotent: result.results[0]?.status === "already-exists",
      packetTwoWasRepaired: result.results[1]?.status === "revised" || result.results[1]?.status === "built",
      changedValidWasRevalidated: newsSubmissions.length >= 2 && newsSubmissions.at(-1).submissionSha !== oldSubmissionSha,
    };
  } finally {
    await rm(scenario.root, { recursive: true, force: true });
    await rm(scenario.remote, { recursive: true, force: true });
  }
}

async function executeAckRecovery() {
  const scenario = await createScenario("ack-recovery");
  try {
    await prepare(scenario);
    const originalPlan = await readJson(scenario.planPath);
    const failed = await runBundle(scenario, { EDITORIAL_BUNDLE_FAIL_AFTER_MAIN_INDEX: "0" });
    if (failed.ok) throw new Error("ack failure injection unexpectedly succeeded");
    const partialResult = await readJson(scenario.resultPath);
    const afterFailureState = await readJson(scenario.statePath);
    const manifestAfterFailure = await readJson(join(scenario.root, "public/data/manifest.json"));
    if (!partialResult.changed || partialResult.results[0]?.mainSha == null || afterFailureState.editorial.status !== "valid" || afterFailureState.publication.status !== "pending" || !manifestAfterFailure.editions.some(item => item.id === editionId)) {
      throw new Error("main commit/state acknowledgement failure did not leave valid open state");
    }
    const changedPlan = structuredClone(originalPlan);
    changedPlan.submissions[0].editorial.decisions[0].summary = "替换稿，不应借用旧 valid。";
    delete changedPlan.serializedChars;
    await writeJson(scenario.planPath, changedPlan);
    const rejected = await runBundle(scenario);
    if (rejected.ok) throw new Error("changed same-packet valid submission unexpectedly bypassed revalidation");
    await prepare(scenario);
    const rerun = await runBundle(scenario);
    if (!rerun.ok) throw new Error(`ack recovery rerun failed: ${rerun.error}`);
    const result = await readJson(scenario.resultPath);
    return {
      firstRunFailure: failed.error,
      partialResult: { changed: partialResult.changed, committedItem: partialResult.results[0]?.index ?? null, mainSha: partialResult.results[0]?.mainSha || null },
      changedValidRejected: rejected.error.includes("different valid editorial submission"),
      rerunResults: result.results,
      firstAckWasReconciled: result.results[0]?.status === "already-exists" && /^[0-9a-f]{40}$/u.test(String(result.results[0]?.mainSha || "")),
      reconciledMainSha: result.results[0]?.mainSha || null,
      secondPacketWasPublished: result.results[1]?.status === "revised" || result.results[1]?.status === "built",
    };
  } finally {
    await rm(scenario.root, { recursive: true, force: true });
    await rm(scenario.remote, { recursive: true, force: true });
  }
}

async function executeCrossEditionReject() {
  const scenario = await createScenario("cross-edition");
  try {
    const bundle = await readJson(scenario.bundlePath);
    bundle.submissions[1].editorial.editionId = "2026-09-14-daily";
    await writeJson(scenario.bundlePath, bundle);
    try {
      await prepare(scenario);
      throw new Error("cross-edition editorial bundle unexpectedly passed prepare");
    } catch (error) {
      const message = String(error.stderr || error.stdout || error.message);
      if (!message.includes("editorial editionId") && !message.includes("does not match")) throw error;
      return { rejected: true, error: message.trim() };
    }
  } finally {
    await rm(scenario.root, { recursive: true, force: true });
    await rm(scenario.remote, { recursive: true, force: true });
  }
}

const output = {
  editionId,
  success: await executeSuccess(),
  showcaseStartAndReplay: await executeShowcaseStartAndReplay(),
  packetTwoRetry: await executePackageTwoRetry(),
  ackRecovery: await executeAckRecovery(),
  crossEdition: await executeCrossEditionReject(),
};
console.log(JSON.stringify(output, null, 2));

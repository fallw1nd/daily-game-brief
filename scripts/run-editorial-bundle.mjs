import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import { assertEditorialBundle } from "./lib/editorial-bundle.mjs";
import { editorialDecisionDigest } from "./lib/edition-publisher.mjs";
import { persistEditorialFeedback } from "./lib/editorial-feedback-transaction.mjs";

const run = promisify(execFile);
const root = resolve(".");
const planPath = resolve(process.env.EDITORIAL_BUNDLE_PLAN_PATH || "artifacts/editorial-bundle-plan.json");
const packetDir = resolve(process.env.EDITORIAL_BUNDLE_PACKET_DIR || "artifacts/editorial-bundle-packets");
const branchName = process.env.EDITORIAL_BRANCH || process.env.GITHUB_REF_NAME || "";
const bundleResultPath = resolve(process.env.EDITORIAL_BUNDLE_RESULT_PATH || "artifacts/editorial-bundle-result.json");
const maxRuntimeMs = Number(process.env.EDITORIAL_BUNDLE_MAX_MS || 12 * 60 * 1000);
const stateDriverPath = process.env.EDITORIAL_BUNDLE_STATE_DRIVER ? resolve(process.env.EDITORIAL_BUNDLE_STATE_DRIVER) : null;
if (stateDriverPath && process.env.EDITORIAL_BUNDLE_SMOKE !== "true") throw new Error("EDITORIAL_BUNDLE_STATE_DRIVER is restricted to the explicit local smoke harness");
const startedAt = Date.now();

function checkDeadline() {
  if (!Number.isFinite(maxRuntimeMs) || maxRuntimeMs <= 0) throw new Error("EDITORIAL_BUNDLE_MAX_MS must be positive");
  if (Date.now() - startedAt > maxRuntimeMs) throw new Error(`editorial bundle exceeded its ${maxRuntimeMs}ms execution budget`);
}

async function command(file, args, options = {}) {
  checkDeadline();
  return run(file, args, { cwd: root, maxBuffer: 20 * 1024 * 1024, ...options });
}

let stateDriverPromise;
async function stateDriver() {
  if (!stateDriverPath) return null;
  stateDriverPromise ||= import(pathToFileURL(stateDriverPath).href).then(module => module.createEditorialBundleSmokeDriver({ root, editionId: bundle.editionId }));
  return stateDriverPromise;
}

async function readState() {
  const driver = await stateDriver();
  if (driver) return driver.readState();
  await command("git", ["fetch", "origin", "+refs/heads/automation/state:refs/remotes/origin/automation/state"]);
  const commit = (await command("git", ["rev-parse", "refs/remotes/origin/automation/state"])).stdout.trim();
  const text = (await command("git", ["show", `refs/remotes/origin/automation/state:automation/status/${bundle.editionId}.json`])).stdout;
  return { commit, value: JSON.parse(text) };
}

async function currentPublishedDigest(editionId) {
  const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8"));
  const item = manifest.editions.find(entry => entry.id === editionId);
  if (!item) return null;
  const archive = JSON.parse(await readFile(resolve("public/data", item.path), "utf8"));
  return { digest: archive.sourceReport?.editorialDecisionDigest || null, archive };
}

async function updateState(event, args) {
  const driver = await stateDriver();
  if (driver) return driver.updateState(event, args);
  await command("bash", ["scripts/update-edition-state-branch.sh", bundle.editionId, event, ...args]);
}

async function advanceQueue() {
  const driver = await stateDriver();
  if (driver) return driver.advanceQueue();
  await command("bash", ["scripts/update-showcase-queue-branch.sh", bundle.editionId, "--no-refresh-sources"]);
}

function committedSubmissionRecord(submission, state, submissionSha) {
  const digest = editorialDecisionDigest(submission.editorial);
  return state.value.transitions?.find(item => item.event === "publication-committed" && item.source === "editorial" && item.decisionDigest === digest && item.packetBlobSha === submission.packetBlobSha && item.submissionSha === submissionSha) || null;
}

function assertBundleLaneCanProceed(state, index) {
  if (state.value.revisionRequest?.status === "open" && state.value.revisionRequest.reason === "user_authorized_same_edition_revision") {
    throw new Error(`bundle candidate ${index} cannot cross an open manual same-edition revision`);
  }
}

async function mainCommitStillPresent(record) {
  if (!/^[0-9a-f]{40}$/u.test(String(record?.mainSha || ""))) return false;
  try {
    await command("git", ["merge-base", "--is-ancestor", record.mainSha, "HEAD"]);
    return true;
  } catch {
    return false;
  }
}

async function reconcileAlreadyPublished(submission, state, submissionSha) {
  const record = committedSubmissionRecord(submission, state, submissionSha);
  const committedRecord = record && await mainCommitStillPresent(record) ? record : null;
  const published = await currentPublishedDigest(bundle.editionId);
  const currentDigestMatches = published?.digest === editorialDecisionDigest(submission.editorial)
    && state.value.packet?.blobSha === submission.packetBlobSha
    && state.value.editorial?.submissionSha === submissionSha;
  if (!committedRecord && !currentDigestMatches) return null;
  let repairedMainSha = null;
  if (state.value.publication?.status !== "committed" && currentDigestMatches) {
    const mainSha = (await command("git", ["rev-parse", "HEAD"])).stdout.trim();
    repairedMainSha = mainSha;
    const publicationAt = state.value.transitions?.find(item => item.event === "publication-committed" && item.decisionDigest === editorialDecisionDigest(submission.editorial))?.at
      || state.value.publication.updatedAt
      || new Date().toISOString();
    await updateState("publication-committed", [
      `--main-sha=${mainSha}`,
      "--source=editorial",
      `--packet-blob-sha=${submission.packetBlobSha}`,
      `--submission-sha=${submissionSha}`,
      `--decision-digest=${editorialDecisionDigest(submission.editorial)}`,
      `--at=${publicationAt}`,
    ]);
    const localePath = resolve("public/data", `locales/en/archive/${bundle.editionId.slice(0, 4)}/${bundle.editionId.slice(5, 7)}/${bundle.editionId}.json`);
    let localeStatus = "unavailable";
    try { await readFile(localePath); localeStatus = "available"; } catch (error) { if (error.code !== "ENOENT") throw error; }
    await updateState("locale-status", [`--status=${localeStatus}`, `--reason=${localeStatus === "available" ? "reconciled" : "retained-existing-state"}`]);
  }
  return {
    changed: false,
    status: "already-exists",
    feedbackEligible: true,
    mainSha: committedRecord?.mainSha || state.value.publication?.mainSha || repairedMainSha,
    feedbackAt: committedRecord?.at || state.value.publication?.updatedAt || null,
    decisionIdentity: editorialDecisionDigest(submission.editorial),
  };
}

async function publishOne(submission) {
  if (process.env.EDITORIAL_BUNDLE_FAIL_INDEX === String(submission.index)) {
    throw new Error(`intentional bundle smoke failure before submission ${submission.index}`);
  }
  const packetText = await readFile(resolve(packetDir, `${submission.packetBlobSha}.json`), "utf8");
  await mkdir(resolve("artifacts"), { recursive: true });
  await writeFile(resolve("artifacts/editorial-packet.json"), packetText);
  await writeFile(resolve("artifacts/editorial-decisions.json"), JSON.stringify(submission.editorial, null, 2) + "\n");
  const submissionSha = (await command("git", ["hash-object", "artifacts/editorial-decisions.json"])).stdout.trim();
  let state = await readState();
  assertBundleLaneCanProceed(state, submission.index);
  const reconciled = await reconcileAlreadyPublished(submission, state, submissionSha);
  if (reconciled) {
    await advanceQueue();
    return reconciled;
  }
  if (state.value.packet?.blobSha !== submission.packetBlobSha) {
    await advanceQueue();
    state = await readState();
    assertBundleLaneCanProceed(state, submission.index);
  }
  if (state.value.packet?.blobSha !== submission.packetBlobSha) throw new Error(`trusted state packet does not match bundle candidate ${submission.index}`);
  if (state.value.editorial?.packetBlobSha !== submission.packetBlobSha) throw new Error(`trusted editorial acknowledgement does not match bundle candidate ${submission.index}`);
  if (state.value.editorial?.status === "submitted") throw new Error(`bundle candidate ${submission.index} is owned by the GitHub validation lane`);
  if (!["pending", "invalid", "valid"].includes(state.value.editorial?.status)) throw new Error(`bundle candidate ${submission.index} has an unsupported editorial state`);
  const sameValidatedSubmission = state.value.editorial.status === "valid" && state.value.editorial.submissionSha === submissionSha;
  if (state.value.editorial.status === "valid" && !sameValidatedSubmission && state.value.revisionRequest?.status !== "open") {
    throw new Error(`bundle candidate ${submission.index} has a different valid editorial submission without an open revision cycle`);
  }
  if (!sameValidatedSubmission) {
    await updateState("editorial-submitted", [`--packet-blob-sha=${submission.packetBlobSha}`, `--submission-sha=${submissionSha}`]);
    try {
      await command(process.execPath, ["scripts/validate-editorial-submission.mjs"], { env: { ...process.env, EDITORIAL_BRANCH: branchName, EDITORIAL_PACKET_PATH: "artifacts/editorial-packet.json", EDITORIAL_DECISION_PATH: "artifacts/editorial-decisions.json", EDITORIAL_VALIDATION_PATH: "artifacts/editorial-validation.json" } });
    } catch (error) {
      await updateState("editorial-invalid", [`--packet-blob-sha=${submission.packetBlobSha}`, `--submission-sha=${submissionSha}`, "--validation=artifacts/editorial-validation.json"]);
      throw error;
    }
    await updateState("editorial-valid", [`--packet-blob-sha=${submission.packetBlobSha}`, `--submission-sha=${submissionSha}`]);
  }

  let publication = null;
  let mainSha = null;
  let changed = false;
  let publicationAt = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    await command(process.execPath, ["scripts/publish-editorial-decision.mjs"], { env: { ...process.env, EDITORIAL_PACKET_PATH: "artifacts/editorial-packet.json", EDITORIAL_DECISION_PATH: "artifacts/editorial-decisions.json", PUBLICATION_RESULT_PATH: "artifacts/publication-result.json" } });
    const npmFile = process.platform === "win32" ? process.execPath : "npm";
    const npmArgs = process.platform === "win32"
      ? [join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js"), "run", "check"]
      : ["run", "check"];
    await command(npmFile, npmArgs);
    publication = JSON.parse(await readFile("artifacts/publication-result.json", "utf8"));
    const diff = (await command("git", ["status", "--short", "public/data", "config/title-translations.json"])).stdout.trim();
    if (!diff) {
      mainSha = (await command("git", ["rev-parse", "HEAD"])).stdout.trim();
      break;
    }
    await command("git", ["add", "public/data", "config/title-translations.json"]);
    await command("git", ["commit", "-m", `content(brief): publish ${bundle.editionId} bundle ${submission.index}`]);
    const committedSha = (await command("git", ["rev-parse", "HEAD"])).stdout.trim();
    try {
      await command("git", ["push", "origin", "HEAD:main"]);
      mainSha = committedSha;
      changed = true;
      break;
    } catch (error) {
      if (attempt === 3) throw error;
      await command("git", ["fetch", "origin", "main"]);
      await command("git", ["reset", "--hard", "origin/main"]);
    }
  }
  if (!mainSha) throw new Error(`bundle candidate ${submission.index} did not produce a main commit`);
  publicationAt = new Date().toISOString();
  try {
    if (process.env.EDITORIAL_BUNDLE_FAIL_AFTER_MAIN_INDEX === String(submission.index)) {
      throw new Error(`intentional bundle smoke failure after main commit for submission ${submission.index}`);
    }
    await updateState("publication-committed", [
      `--main-sha=${mainSha}`,
      "--source=editorial",
      `--packet-blob-sha=${submission.packetBlobSha}`,
      `--submission-sha=${submissionSha}`,
      `--decision-digest=${editorialDecisionDigest(submission.editorial)}`,
      `--at=${publicationAt}`,
    ]);
    await updateState("locale-status", [`--status=${publication.localeStatus || "unavailable"}`, `--reason=${publication.localeReasonCode || "none"}`]);
    await advanceQueue();
  } catch (error) {
    error.bundlePublication = {
      changed,
      status: publication.status,
      mainSha,
      feedbackEligible: publication.feedbackEligible === true,
      feedbackAt: publicationAt,
      decisionIdentity: editorialDecisionDigest(submission.editorial),
    };
    throw error;
  }
  return {
    changed,
    status: publication.status,
    mainSha,
    feedbackEligible: publication.feedbackEligible === true,
    feedbackAt: publicationAt,
    decisionIdentity: editorialDecisionDigest(submission.editorial),
  };
}

const bundle = JSON.parse(await readFile(planPath, "utf8"));
const packetTexts = new Map();
for (const submission of bundle.submissions || []) packetTexts.set(submission.packetBlobSha, await readFile(resolve(packetDir, `${submission.packetBlobSha}.json`), "utf8"));
assertEditorialBundle(bundle, { branchName, packetTextsBySha: packetTexts });

const results = [];
let changed = false;
let feedbackEligible = false;

async function persistOneFeedback(submission, publicationResult) {
  if (!submission || submission.index == null) return "skipped";
  const driver = await stateDriver();
  if (driver) return driver.persistFeedback({
    submission,
    planPath,
    packetDir,
    decidedAt: publicationResult?.feedbackAt,
    decisionIdentity: publicationResult?.decisionIdentity,
  });
  return persistEditorialFeedback({
    root,
    editionId: bundle.editionId,
    submissionIndex: submission.index,
    planPath,
    packetDir,
    decidedAt: publicationResult?.feedbackAt,
    decisionIdentity: publicationResult?.decisionIdentity,
    runnerTemp: process.env.RUNNER_TEMP || tmpdir(),
    runId: process.env.GITHUB_RUN_ID || "local",
    maxAttempts: 3,
    runCommand: async (file, args, options = {}) => {
      checkDeadline();
      return command(file, args, options);
    },
  });
}

async function writeBundleResult(status, error = null) {
  const result = {
    schemaVersion: 1,
    editionId: bundle.editionId,
    status,
    changed,
    feedbackEligible,
    results,
    ...(error ? { error: String(error.message || error).slice(0, 2000) } : {}),
    elapsedMs: Date.now() - startedAt,
  };
  await writeFile(bundleResultPath, JSON.stringify(result, null, 2) + "\n");
  if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `edition=${bundle.editionId}\nchanged=${changed}\nfeedback_eligible=${feedbackEligible}\npublication_status=${status === "completed" ? results.at(-1)?.status || "already-exists" : "partial-failure"}\nmain_sha=${results.at(-1)?.mainSha || "unchanged"}\nelapsed_ms=${result.elapsedMs}\n`);
  return result;
}

let failure = null;
try {
  for (const submission of bundle.submissions) {
    checkDeadline();
    const result = await publishOne(submission);
    const resultItem = { index: submission.index, ...result, feedbackStatus: "pending" };
    results.push(resultItem);
    changed ||= result.changed === true;
    feedbackEligible ||= result.feedbackEligible === true;
    if (result.feedbackEligible === true) resultItem.feedbackStatus = await persistOneFeedback(submission, result);
    await writeBundleResult("partial");
  }
} catch (error) {
  failure = error;
  if (error.bundlePublication && !results.some(item => item.index === bundle.submissions[results.length]?.index)) {
    const submission = bundle.submissions[results.length];
    if (submission) {
      const partial = { index: submission.index, ...error.bundlePublication, feedbackStatus: "pending" };
      results.push(partial);
      changed ||= partial.changed === true;
      feedbackEligible ||= partial.feedbackEligible === true;
    }
  }
  await writeBundleResult("partial", error);
}

const result = await writeBundleResult(failure ? "partial" : "completed", failure);
if (failure) {
  console.error(JSON.stringify(result, null, 2));
  throw failure;
}
console.log(JSON.stringify(result, null, 2));

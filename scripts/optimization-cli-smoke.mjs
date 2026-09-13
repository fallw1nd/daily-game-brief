import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";

import { advanceEditorialQueue } from "./lib/editorial-queue.mjs";
import { applyEditionStateEvent, createEditionState, gitBlobSha } from "./lib/edition-state.mjs";
import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";

const exec = promisify(execFile);
const sourceRoot = resolve(".");
const tempRoot = await mkdtemp(join(tmpdir(), "daily-game-brief-optimization-cli-"));
const editionId = "2026-09-12-daily";
const window = expectedEditorialWindow(editionId);
const source = {
  sourceIndex: 0,
  status: "opened",
  kind: "primary",
  independenceKey: "publisher",
  label: "Publisher",
  url: "https://publisher.example/smoke-fact",
  canonicalUrl: "https://publisher.example/smoke-fact",
  evidenceText: "The publisher confirms the smoke-test fact.",
};

function packetFor(eventKey, scope = "news") {
  return {
    schemaVersion: 3,
    mode: "chatgpt-handoff",
    finalizedAt: "2026-09-12T04:00:00.000Z",
    coverageThrough: window.windowEnd,
    outputSchema: {},
    continuation: { scope, preservePublished: true },
    editorialInput: {
      schemaVersion: 2,
      window,
      trackingQueue: [],
      packages: [{
        eventKey,
        subjectKey: "smoke-game",
        sources: [source],
        ...(scope === "showcase" ? { showcaseRefs: [{ showcaseId: "direct", announcementId: eventKey }] } : {}),
      }],
    },
  };
}

function editorialFor(eventKey, packetBlobSha) {
  return {
    contractVersion: 2,
    packetBlobSha,
    editionId,
    archiveTitle: "日报｜《Smoke Game》新增事实",
    leadEventKey: eventKey,
    decisions: [{
      eventKey,
      decision: "include",
      section: "news",
      titleKey: "smoke-game",
      titleZhCn: null,
      titleEn: "Smoke Game",
      titleZhStatus: "unavailable",
      headline: "《Smoke Game》确认一项新增事实",
      summary: "发行方确认了这项新增信息。",
      factStatus: "official",
      timeStatus: "date_only",
      entryFlags: [],
      tracking: false,
      verification: "已打开发行方一手来源。",
      reason: "续接包中的新增事实。",
      beijingTime: "2026-09-12 09:30",
      timeNote: "只确认日期。",
      platforms: ["PC"],
      region: "全球",
      releaseType: "更新",
      sourceIndexes: [0],
      additionalSources: [],
      sharedFactFrame: {
        subjectTitleKey: "smoke-game",
        dates: [],
        times: [],
        numbers: ["smoke-2"],
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
    editorialNote: "续接包已按持久化事实范围完成编辑。",
  };
}

function basePublishedState() {
  let state = createEditionState(editionId, "2026-09-12T04:00:00.000Z");
  state = applyEditionStateEvent(state, "packet-ready", { packetBlobSha: "1".repeat(40) });
  state = applyEditionStateEvent(state, "editorial-submitted", { packetBlobSha: "1".repeat(40), submissionSha: "2".repeat(40) });
  state = applyEditionStateEvent(state, "editorial-valid", { packetBlobSha: "1".repeat(40), submissionSha: "2".repeat(40) });
  return applyEditionStateEvent(state, "publication-committed", { mainSha: "3".repeat(40), source: "editorial" });
}

function queueFixture() {
  const news = ["news-1", "news-2"];
  const showcase = ["showcase-1", "showcase-2", "showcase-3", "showcase-4"];
  return {
    schemaVersion: 1,
    editionId,
    totalAnnouncements: showcase.length,
    requiredFacts: Object.fromEntries(showcase.map(key => [key, []])),
    batches: [
      ...news.map(eventKey => ({ name: `${eventKey}.json`, scope: "news", status: "pending", eventKeys: [eventKey] })),
      ...showcase.map(eventKey => ({ name: `${eventKey}.json`, scope: "showcase", status: "pending", eventKeys: [eventKey] })),
    ],
  };
}

function capacitySimulation() {
  const showcase = ["showcase-1", "showcase-2", "showcase-3", "showcase-4"];
  const news = ["old-news-1", "old-news-2"];
  let newsSinceShowcase = 0;
  const takeQueueBatch = () => {
    const newsFirst = newsSinceShowcase < 1;
    const batch = newsFirst ? news.shift() || showcase.shift() || null : showcase.shift() || news.shift() || null;
    if (batch) newsSinceShowcase = batch.startsWith("showcase-") ? 0 : 1;
    return batch;
  };
  const days = [];
  for (let day = 1; day <= 4; day += 1) {
    const firstCall = "normal-daily-editorial";
    const firstCallQueue = takeQueueBatch();
    const secondCallQueue = [takeQueueBatch(), takeQueueBatch()].filter(Boolean);
    news.push(`daily-news-${day}-a`, `daily-news-${day}-b`);
    days.push({
      day,
      call1: [firstCall, firstCallQueue].filter(Boolean),
      call2: secondCallQueue,
      pendingNews: news.length,
      pendingShowcase: showcase.length,
      oldestShowcaseWaitDays: showcase.length ? day : 0,
    });
  }
  const recoveryNews = ["old-news-1", "old-news-2"];
  const recoveryShowcase = ["showcase-1", "showcase-2", "showcase-3", "showcase-4"];
  let recoveryNewsSinceShowcase = 0;
  const recoveryTakeQueueBatch = () => {
    const newsFirst = recoveryNewsSinceShowcase < 1;
    const batch = newsFirst ? recoveryNews.shift() || recoveryShowcase.shift() || null : recoveryShowcase.shift() || recoveryNews.shift() || null;
    if (batch) recoveryNewsSinceShowcase = batch.startsWith("showcase-") ? 0 : 1;
    return batch;
  };
  const recoveryDays = [];
  for (let day = 1; day <= 4; day += 1) {
    const call1Queue = recoveryTakeQueueBatch();
    const call2Queue = day === 1 ? [] : [recoveryTakeQueueBatch(), recoveryTakeQueueBatch()].filter(Boolean);
    recoveryNews.push(`recovery-news-${day}-a`, `recovery-news-${day}-b`);
    recoveryDays.push({
      day,
      call1: ["normal-daily-editorial", call1Queue].filter(Boolean),
      call2: day === 1 ? ["liveness-wake-or-invalid-repair"] : call2Queue,
      pendingNews: recoveryNews.length,
      pendingShowcase: recoveryShowcase.length,
    });
  }
  const maxPendingNews = Math.max(...days.map(item => item.pendingNews));
  const showcaseDrainDay = days.find(item => item.pendingShowcase === 0)?.day || null;
  const recoveryShowcaseDrainDay = recoveryDays.find(item => item.pendingShowcase === 0)?.day || null;
  return {
    assumptions: {
      dailyInvocationsPerDay: 2,
      normalDailyConsumesCall1: true,
      maxPackagesPerInvocation: 2,
      queuePackagesInCall1: 1,
      queuePackagesInCall2: 2,
      continuousNewsArrivalsPerDay: 2,
      initialOldNewsBatches: 2,
      initialShowcaseBatches: 4,
      queuePolicy: "call1 normal Daily plus one same-edition news continuation; call2 uses bounded news/showcase fairness",
    },
    firstTwoCalls: {
      call1: ["normal-daily-editorial", "old-news-1"],
      call2: ["showcase-1", "old-news-2"],
      afterCalls: { pendingNewsBeforeDailyArrivals: 0, pendingShowcase: 3, showcaseActivated: 1 },
    },
    fourDaySequence: days,
    bounds: { maxPendingNews, pendingNewsOnDay4: days.at(-1)?.pendingNews || 0, showcaseDrainDay },
    recoverySlot: {
      consumedInvocation: "call2",
      call1: ["normal-daily-editorial", "same-edition-news-continuation"],
      call2: ["liveness-wake-or-invalid-repair"],
      queueBatchesConsumed: 1,
      nextCall: ["showcase-or-news-by-current-fairness", "next-queue-batch"],
      recoverySequence: recoveryDays,
      showcaseDrainDay: recoveryShowcaseDrainDay,
      recoveryBy: "the next Daily invocation; the missed call2 slot is consumed by wake/invalid repair, the next call resumes fair queue order, and showcase drain slips by at most one day",
      note: "A missing-packet wake or durable invalid repair can consume an invocation; it is recorded separately from queue throughput and never causes a cross-edition bundle.",
    },
    conclusion: "With two new news batches arriving per day, call1 carries one same-edition news continuation and call2 carries two fair queue packets: pending news peaks at three, returns to two by day four, and does not grow without bound; the four initial showcase batches drain by day three, or day four when day-one call2 is consumed by wake/invalid repair. 30/120/360 minutes only gate retry eligibility, not completion latency.",
  };
}

async function writeJson(path, value) {
  await mkdir(resolve(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(value, null, 2) + "\n");
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function sha(path) {
  try {
    return createHash("sha256").update(await readFile(path)).digest("hex");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function snapshot(root) {
  const dataRoot = join(root, "public", "data");
  const [year, month] = editionId.split("-");
  const archivePath = join(dataRoot, "archive", year, month, `${editionId}.json`);
  const latestPath = join(dataRoot, "latest.json");
  const manifestPath = join(dataRoot, "manifest.json");
  const statusPath = join(dataRoot, "locales", "en", "status", year, month, `${editionId}.json`);
  const archive = await readJson(archivePath);
  const latest = await readJson(latestPath);
  const manifest = await readJson(manifestPath);
  let localeStatus = null;
  try { localeStatus = await readJson(statusPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
  return {
    archiveHash: await sha(archivePath),
    latestHash: await sha(latestPath),
    manifestHash: await sha(manifestPath),
    archiveEntryIds: archive.entries.map(entry => entry.id),
    latestEntryIds: latest.entries.map(entry => entry.id),
    archiveEntryCount: archive.entries.length,
    manifestLatest: manifest.latest,
    localeOverlayHash: await sha(join(dataRoot, "locales", "en", "archive", year, month, `${editionId}.json`)),
    localeStatusHash: await sha(statusPath),
    localeStatusReasonCode: localeStatus?.reasonCode || null,
    retainedPresentation: Boolean(localeStatus?.retainedPresentation),
    retainedEnglishEntryIds: localeStatus?.retainedPresentation?.entries?.map(entry => entry.entryId) || [],
  };
}

try {
  await exec("git", ["clone", "--local", "--no-hardlinks", sourceRoot, tempRoot], { cwd: sourceRoot });
  await symlink(join(sourceRoot, "node_modules"), join(tempRoot, "node_modules"), "junction");
  await exec("git", ["config", "user.name", "optimization-cli-smoke"], { cwd: tempRoot });
  await exec("git", ["config", "user.email", "optimization-cli-smoke@example.invalid"], { cwd: tempRoot });

  const primaryPacket = packetFor("news-1");
  const primaryPacketText = JSON.stringify(primaryPacket, null, 2) + "\n";
  const primaryPacketSha = gitBlobSha(primaryPacketText);
  const editorial = editorialFor("news-1", primaryPacketSha);
  const editorialText = JSON.stringify(editorial, null, 2) + "\n";
  const submissionSha = gitBlobSha(editorialText);
  const packets = Object.fromEntries([
    ["news-1.json", primaryPacket],
    ["news-2.json", packetFor("news-2")],
    ["showcase-1.json", packetFor("showcase-1", "showcase")],
    ["showcase-2.json", packetFor("showcase-2", "showcase")],
    ["showcase-3.json", packetFor("showcase-3", "showcase")],
    ["showcase-4.json", packetFor("showcase-4", "showcase")],
  ].map(([name, value]) => [name, JSON.stringify(value, null, 2) + "\n"]));
  const canonicalBefore = await readJson(join(tempRoot, "public", "data", "latest.json"));
  const queue = queueFixture();
  const activated = advanceEditorialQueue({ queue, state: basePublishedState(), canonical: canonicalBefore, packets, now: "2026-09-12T04:30:00.000Z" });
  let state = activated.state;
  state = applyEditionStateEvent(state, "editorial-submitted", { packetBlobSha: primaryPacketSha, submissionSha });
  state = applyEditionStateEvent(state, "editorial-valid", { packetBlobSha: primaryPacketSha, submissionSha });

  const statePath = join(tempRoot, "automation", "status", `${editionId}.json`);
  const queuePath = join(tempRoot, "automation", "batches", editionId, "queue.json");
  await writeJson(statePath, state);
  await writeJson(queuePath, activated.queue);
  for (const [name, text] of Object.entries(packets)) await writeFile(join(tempRoot, "automation", "batches", editionId, name), text);
  await mkdir(join(tempRoot, "artifacts"), { recursive: true });
  await writeFile(join(tempRoot, "artifacts", "editorial-packet.json"), primaryPacketText);
  await writeFile(join(tempRoot, "artifacts", "editorial-decisions.json"), editorialText);
  await exec("git", ["add", "automation"], { cwd: tempRoot });
  await exec("git", ["commit", "-m", "test: add optimization cli fixture"], { cwd: tempRoot });
  const stateCommit = (await exec("git", ["rev-parse", "HEAD"], { cwd: tempRoot })).stdout.trim();
  await exec("git", ["update-ref", "refs/remotes/origin/automation/state", stateCommit], { cwd: tempRoot });

  const env = {
    ...process.env,
    EDITORIAL_PACKET_PATH: "artifacts/editorial-packet.json",
    EDITORIAL_DECISION_PATH: "artifacts/editorial-decisions.json",
    PUBLICATION_RESULT_PATH: "artifacts/publication-result.json",
  };
  const before = await snapshot(tempRoot);
  const firstRun = await exec(process.execPath, ["scripts/publish-editorial-decision.mjs"], { cwd: tempRoot, env });
  const afterFirst = await snapshot(tempRoot);
  const firstPublication = await readJson(join(tempRoot, "artifacts", "publication-result.json"));
  const secondRun = await exec(process.execPath, ["scripts/publish-editorial-decision.mjs"], { cwd: tempRoot, env });
  const afterSecond = await snapshot(tempRoot);
  const secondPublication = await readJson(join(tempRoot, "artifacts", "publication-result.json"));

  const [year, month] = editionId.split("-");
  const statusPath = join(tempRoot, "public", "data", "locales", "en", "status", year, month, `${editionId}.json`);
  const retainedStatus = await readJson(statusPath);
  const retained = retainedStatus.retainedPresentation;
  const canonicalAfterFirst = await readJson(join(tempRoot, "public", "data", "latest.json"));
  const newEntryId = afterFirst.archiveEntryIds.find(id => !before.archiveEntryIds.includes(id));
  const repairDraft = {
    schemaVersion: 1,
    locale: "en",
    editionId,
    archiveTitle: "Daily Brief | Smoke Game confirms a new fact",
    entries: canonicalAfterFirst.entries.map(entry => {
      const old = retained.entries.find(item => item.entryId === entry.id);
      if (old) return { ...old, headline: "This draft overwrite must be ignored for retained English." };
      return {
        entryId: entry.id,
        headline: "Smoke Game Confirms a New Fact",
        summary: "The publisher confirms this newly added fact in the continuation packet.",
        verification: "The publisher source was opened and supports the fact included in the Canonical edition.",
        timeNote: "Only the date is confirmed; no undisclosed time is inferred.",
        regionLabel: "Global",
        releaseTypeLabel: "Update",
        sourceLabels: [{ sourceIndex: 0, label: "Publisher" }],
      };
    }),
    upcoming: retained.upcoming || [],
    sourceReport: null,
  };
  await writeJson(join(tempRoot, "artifacts", "locale-repair.json"), repairDraft);
  const repairBefore = await snapshot(tempRoot);
  const repairRun = await exec(process.execPath, ["scripts/publish-editorial-decision.mjs"], {
    cwd: tempRoot,
    env: { ...env, PUBLICATION_MODE: "locale-repair", LOCALE_REPAIR_DRAFT_PATH: "artifacts/locale-repair.json" },
  });
  const afterRepair = await snapshot(tempRoot);
  const repairedOverlay = await readJson(join(tempRoot, "public", "data", "locales", "en", "archive", year, month, `${editionId}.json`));
  const retainedOld = repairedOverlay.entries.find(entry => entry.entryId === before.archiveEntryIds[0]);
  const draftOld = repairDraft.entries.find(entry => entry.entryId === before.archiveEntryIds[0]);
  const repairedNew = repairedOverlay.entries.find(entry => entry.entryId === newEntryId);

  const acknowledged = applyEditionStateEvent(state, "publication-committed", { mainSha: "4".repeat(40), source: "editorial", at: "2026-09-12T05:00:00.000Z" });
  const next = advanceEditorialQueue({
    queue: activated.queue,
    state: acknowledged,
    canonical: canonicalAfterFirst,
    packets,
    now: "2026-09-12T05:01:00.000Z",
  });
  const queueReport = {
    firstActivated: activated.batch?.name,
    firstScope: activated.batch?.scope,
    afterFirstPublication: { completed: next.queue.batches.find(batch => batch.name === "news-1.json")?.status },
    secondActivated: next.batch?.name,
    afterTwoQueueCalls: next.queue.batches.map(batch => ({ name: batch.name, scope: batch.scope, status: batch.status })),
    showcaseActivatedAfterTwoCalls: next.queue.batches.filter(batch => batch.scope === "showcase" && batch.status === "editing").length,
    pendingShowcaseAfterTwoCalls: next.queue.batches.filter(batch => batch.scope === "showcase" && batch.status === "pending").length,
  };

  console.log(JSON.stringify({
    firstRun: { stdout: firstRun.stdout.trim(), status: firstPublication.status, canonicalStatus: firstPublication.canonicalStatus, feedbackEligible: firstPublication.feedbackEligible },
    secondRun: { stdout: secondRun.stdout.trim(), status: secondPublication.status, canonicalStatus: secondPublication.canonicalStatus, feedbackEligible: secondPublication.feedbackEligible },
    before,
    afterFirst,
    afterSecond,
    firstRunChanges: {
      archiveEntryCountDelta: afterFirst.archiveEntryCount - before.archiveEntryCount,
      newEntryIds: afterFirst.archiveEntryIds.filter(id => !before.archiveEntryIds.includes(id)),
      manifestLatestPreserved: afterFirst.manifestLatest === before.manifestLatest,
      retainedEnglishPresentation: afterFirst.retainedPresentation && afterFirst.retainedEnglishEntryIds.length === before.archiveEntryCount,
    },
    secondRunIdempotent: {
      canonicalFilesUnchanged: ["archiveHash", "latestHash", "manifestHash"].every(key => afterSecond[key] === afterFirst[key]),
      entryIdsUnchanged: JSON.stringify(afterSecond.archiveEntryIds) === JSON.stringify(afterFirst.archiveEntryIds),
      englishFilesUnchanged: afterSecond.localeOverlayHash === afterFirst.localeOverlayHash && afterSecond.localeStatusHash === afterFirst.localeStatusHash,
    },
    localeRepair: {
      stdout: repairRun.stdout.trim(),
      canonicalUnchanged: ["archiveHash", "latestHash", "manifestHash"].every(key => repairBefore[key] === afterRepair[key]),
      oldEnglishWasRetained: retainedOld?.headline !== draftOld?.headline && retainedOld?.headline === retained.entries.find(entry => entry.entryId === retainedOld.entryId)?.headline,
      newEntryReadable: repairedNew?.headline === "Smoke Game Confirms a New Fact" && repairedNew?.summary.includes("newly added fact"),
      overlayAvailable: afterRepair.localeOverlayHash !== null && afterRepair.localeStatusHash === null,
    },
    queueReport,
    capacityReport: capacitySimulation(),
  }, null, 2));
} finally {
  await rm(tempRoot, { recursive: true, force: true });
}

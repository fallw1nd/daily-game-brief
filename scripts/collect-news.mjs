import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { latestDueWindow } from "./lib/edition-window.mjs";
import {
  mergeCandidates,
  parseFeed,
  parseHtmlLinks,
  resemblesAdjacent,
} from "./lib/news-pipeline.mjs";
import {
  buildTitleAliasIndex,
  candidateLane,
  candidateSignals,
  publisherFamily,
  resolveKnownSubjectKey,
} from "./lib/source-expansion.mjs";

const CONFIG_PATH = resolve("config/news-sources.json");
const TITLE_REGISTRY_PATH = resolve("config/title-translations.json");
const LATEST_PATH = resolve("public/data/latest.json");
const OUTPUT_PATH = resolve(process.env.NEWS_CANDIDATES_PATH || "artifacts/news-candidates.json");
const REPORT_PATH = resolve(process.env.NEWS_SHADOW_REPORT_PATH || "artifacts/news-shadow-report.json");
const USER_AGENT = "DailyGameBriefDiscoveryBot/1.0 (+https://fallw1nd.github.io/daily-game-brief/)";
const periodArg = process.argv.find((arg) => arg.startsWith("--period="))?.split("=")[1];
const period = periodArg || process.env.BRIEF_PERIOD;

if (!new Set(["am", "pm", "daily"]).has(period)) {
  throw new Error("Pass --period=am, --period=pm, or --period=daily");
}

const [config, latest, titleRegistry] = await Promise.all([
  readFile(CONFIG_PATH, "utf8").then(JSON.parse),
  readFile(LATEST_PATH, "utf8").then(JSON.parse),
  readFile(TITLE_REGISTRY_PATH, "utf8").then(JSON.parse),
]);
const aliasIndex = buildTitleAliasIndex(titleRegistry);
const sourceById = new Map(config.sources.map((source) => [source.id, source]));
const referenceNow = process.env.BRIEF_NOW ? new Date(process.env.BRIEF_NOW) : new Date();
const window = latestDueWindow(period, referenceNow);

async function fetchSource(source) {
  if (!source.url.startsWith("https://")) throw new Error("only HTTPS sources are allowed");
  const response = await fetch(source.url, {
    redirect: "follow",
    signal: AbortSignal.timeout(config.requestTimeoutMs),
    headers: {
      Accept: source.format === "rss"
        ? "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9"
        : "text/html, application/xhtml+xml",
      "User-Agent": USER_AGENT,
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > config.maxResponseBytes) throw new Error("response exceeds configured limit");
  const text = await response.text();
  if (Buffer.byteLength(text) > config.maxResponseBytes) throw new Error("response exceeds configured limit");
  const parsed = source.format === "rss" ? parseFeed(text, source) : parseHtmlLinks(text, source);
  return parsed.slice(0, source.maxCandidates || config.maxCandidatesPerSource).map((item) => ({ ...item, source }));
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const results = new Array(items.length);
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

const fetched = await mapLimit(config.sources, 4, async (source) => {
  const startedAt = Date.now();
  try {
    const records = await fetchSource(source);
    return {
      sourceId: source.id,
      mode: source.mode || "active",
      group: source.group,
      reliability: source.reliability || null,
      capabilities: source.capabilities || [],
      publisherFamily: source.publisherFamily || source.independenceKey,
      status: "ok",
      count: records.length,
      durationMs: Date.now() - startedAt,
      records,
    };
  } catch (error) {
    return {
      sourceId: source.id,
      mode: source.mode || "active",
      group: source.group,
      reliability: source.reliability || null,
      capabilities: source.capabilities || [],
      publisherFamily: source.publisherFamily || source.independenceKey,
      status: "limited",
      count: 0,
      durationMs: Date.now() - startedAt,
      error: error.message,
      records: [],
    };
  }
});

const cutoff = referenceNow.getTime() - config.retentionHours * 60 * 60 * 1000;
const retainedRecords = fetched.flatMap((result) => result.records).filter((record) =>
  !record.publishedAt || Date.parse(record.publishedAt) >= cutoff,
);
const activeRecords = retainedRecords.filter((record) => (record.source.mode || "active") === "active");
const shadowRecords = retainedRecords.filter((record) => record.source.mode === "shadow");
const windowStartMs = Date.parse(`${window.windowStart.replace(" ", "T")}:00+08:00`);
const windowEndMs = Date.parse(`${window.windowEnd.replace(" ", "T")}:00+08:00`);

function annotate(records) {
  return mergeCandidates(records).map((candidate) => {
    const publishedMs = candidate.publishedAt ? Date.parse(candidate.publishedAt) : NaN;
    const timeRelation = !Number.isFinite(publishedMs)
      ? "unknown"
      : publishedMs > windowStartMs && publishedMs <= windowEndMs
        ? "window"
        : publishedMs > windowEndMs - 24 * 60 * 60 * 1000 && publishedMs <= windowEndMs
          ? "prior-24h-audit"
          : "outside";
    return {
      ...candidate,
      canonicalSubjectKey: resolveKnownSubjectKey(candidate.headline, aliasIndex),
      scoreSignals: candidateSignals(candidate),
      lane: candidateLane(candidate),
      publisherFamily: publisherFamily(candidate),
      timeRelation,
      adjacentMatch: resemblesAdjacent(candidate, latest.entries || []),
    };
  });
}

const candidates = annotate(activeRecords);
const shadowCandidates = annotate(shadowRecords);
const reviewable = (candidate) => candidate.tier !== "C" && candidate.timeRelation !== "outside" && !candidate.adjacentMatch;
const sourceStats = fetched.map(({ records: _records, ...result }) => result);
const healthy = sourceStats.filter((item) => item.status === "ok");
const activeStats = sourceStats.filter((item) => item.mode === "active");
const shadowStats = sourceStats.filter((item) => item.mode === "shadow");
const report = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  mode: "production-with-shadow-sources",
  window,
  adjacentEdition: latest.id,
  sourceStats,
  coverage: {
    method: "registered-source-list-and-rss",
    activeSourceIds: activeStats.map((item) => item.sourceId),
    shadowSourceIds: shadowStats.map((item) => item.sourceId),
    healthyActiveSourceIds: activeStats.filter((item) => item.status === "ok").map((item) => item.sourceId),
    checkedGroups: [...new Set(activeStats.map((item) => item.group).filter(Boolean))],
    checkedCapabilities: [...new Set(activeStats.flatMap((item) => item.capabilities || []))],
    openWebDiscovery: false,
    primaryResolver: "registry-foundation-only",
  },
  totals: {
    sources: sourceStats.length,
    activeSources: activeStats.length,
    shadowSources: shadowStats.length,
    healthySources: healthy.length,
    healthyActiveSources: activeStats.filter((item) => item.status === "ok").length,
    healthyShadowSources: shadowStats.filter((item) => item.status === "ok").length,
    limitedSources: sourceStats.filter((item) => item.status !== "ok").length,
    candidates: candidates.length,
    activeCandidates: candidates.length,
    shadowCandidates: shadowCandidates.length,
    tierA: candidates.filter((item) => item.tier === "A").length,
    tierB: candidates.filter((item) => item.tier === "B").length,
    shadowTierA: shadowCandidates.filter((item) => item.tier === "A").length,
    shadowTierB: shadowCandidates.filter((item) => item.tier === "B").length,
    adjacentMatches: candidates.filter((item) => item.adjacentMatch).length,
  },
  reviewQueue: candidates.filter(reviewable).slice(0, 80),
  shadowReviewQueue: shadowCandidates.filter(reviewable).slice(0, 80),
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await Promise.all([
  writeFile(OUTPUT_PATH, JSON.stringify({ schemaVersion: 2, generatedAt: report.generatedAt, window, candidates, shadowCandidates }, null, 2) + "\n"),
  writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n"),
]);

console.log(`News collection: active=${report.totals.activeCandidates} candidates (A=${report.totals.tierA}, B=${report.totals.tierB}); shadow=${report.totals.shadowCandidates} candidates; limited sources=${report.totals.limitedSources}`);
console.log(`Sources: active ${report.totals.healthyActiveSources}/${report.totals.activeSources} healthy; shadow ${report.totals.healthyShadowSources}/${report.totals.shadowSources} healthy`);
console.log(`Report: ${REPORT_PATH}`);

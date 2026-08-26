import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  mergeCandidates,
  parseFeed,
  parseHtmlLinks,
  plannedWindow,
  resemblesAdjacent,
} from "./lib/news-pipeline.mjs";

const CONFIG_PATH = resolve("config/news-sources.json");
const LATEST_PATH = resolve("public/data/latest.json");
const OUTPUT_PATH = resolve(process.env.NEWS_CANDIDATES_PATH || "artifacts/news-candidates.json");
const REPORT_PATH = resolve(process.env.NEWS_SHADOW_REPORT_PATH || "artifacts/news-shadow-report.json");
const USER_AGENT = "DailyGameBriefDiscoveryBot/1.0 (+https://fallw1nd.github.io/daily-game-brief/)";
const periodArg = process.argv.find((arg) => arg.startsWith("--period="))?.split("=")[1];
const period = periodArg || process.env.BRIEF_PERIOD;

if (!new Set(["am", "pm"]).has(period)) {
  throw new Error("Pass --period=am or --period=pm");
}

const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
const latest = JSON.parse(await readFile(LATEST_PATH, "utf8"));
const referenceNow = process.env.BRIEF_NOW ? new Date(process.env.BRIEF_NOW) : new Date();
const window = plannedWindow(period, referenceNow);

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
  const queue = [...items];
  const results = [];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) results.push(await worker(queue.shift()));
  });
  await Promise.all(runners);
  return results;
}

const fetched = await mapLimit(config.sources, 4, async (source) => {
  try {
    const records = await fetchSource(source);
    return { sourceId: source.id, status: "ok", count: records.length, records };
  } catch (error) {
    return { sourceId: source.id, status: "limited", count: 0, error: error.message, records: [] };
  }
});

const cutoff = referenceNow.getTime() - config.retentionHours * 60 * 60 * 1000;
const records = fetched.flatMap((result) => result.records).filter((record) =>
  !record.publishedAt || Date.parse(record.publishedAt) >= cutoff,
);
const windowStartMs = Date.parse(`${window.windowStart.replace(" ", "T")}:00+08:00`);
const windowEndMs = Date.parse(`${window.windowEnd.replace(" ", "T")}:00+08:00`);
const candidates = mergeCandidates(records).map((candidate) => {
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
    timeRelation,
    adjacentMatch: resemblesAdjacent(candidate, latest.entries || []),
  };
});
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "shadow",
  window,
  adjacentEdition: latest.id,
  sourceStats: fetched.map(({ records: _records, ...result }) => result),
  totals: {
    sources: fetched.length,
    healthySources: fetched.filter((item) => item.status === "ok").length,
    limitedSources: fetched.filter((item) => item.status !== "ok").length,
    candidates: candidates.length,
    tierA: candidates.filter((item) => item.tier === "A").length,
    tierB: candidates.filter((item) => item.tier === "B").length,
    adjacentMatches: candidates.filter((item) => item.adjacentMatch).length,
  },
  reviewQueue: candidates.filter((item) =>
    item.tier !== "C" && item.timeRelation !== "outside" && !item.adjacentMatch
  ).slice(0, 80),
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await Promise.all([
  writeFile(OUTPUT_PATH, JSON.stringify({ schemaVersion: 1, generatedAt: report.generatedAt, window, candidates }, null, 2) + "\n"),
  writeFile(REPORT_PATH, JSON.stringify(report, null, 2) + "\n"),
]);

console.log(`News shadow collection: ${report.totals.candidates} candidates; A=${report.totals.tierA}; B=${report.totals.tierB}; limited sources=${report.totals.limitedSources}`);
console.log(`Report: ${REPORT_PATH}`);

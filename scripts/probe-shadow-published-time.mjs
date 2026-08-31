import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parsePublishedTime } from "./lib/published-time.mjs";
import { selectShadowDetailTargets, summarizeShadowDetailProbe } from "./lib/shadow-detail-probe.mjs";

const CONFIG_PATH = resolve("config/news-sources.json");
const CANDIDATES_PATH = resolve(process.env.NEWS_CANDIDATES_PATH || "artifacts/shadow-observation/news-candidates.json");
const OUTPUT_PATH = resolve(process.env.SHADOW_DETAIL_REPORT_PATH || "artifacts/shadow-observation/shadow-detail-time-report.json");
const USER_AGENT = "DailyGameBriefShadowObserver/1.0 (+https://fallw1nd.github.io/daily-game-brief/)";
const MAX_PER_SOURCE = Number(process.env.SHADOW_DETAIL_MAX_PER_SOURCE || 2);
const MAX_TOTAL = Number(process.env.SHADOW_DETAIL_MAX_TOTAL || 30);

const [config, payload] = await Promise.all([
  readFile(CONFIG_PATH, "utf8").then(JSON.parse),
  readFile(CANDIDATES_PATH, "utf8").then(JSON.parse),
]);

const targets = selectShadowDetailTargets(payload, config, {
  maxPerSource: MAX_PER_SOURCE,
  maxTotal: MAX_TOTAL,
});

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

async function probe(target) {
  const startedAt = Date.now();
  try {
    const response = await fetch(target.url, {
      redirect: "follow",
      signal: AbortSignal.timeout(config.requestTimeoutMs),
      headers: {
        Accept: "text/html, application/xhtml+xml",
        "User-Agent": USER_AGENT,
      },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!response.url.startsWith("https://")) throw new Error("redirect left HTTPS");
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > config.maxResponseBytes) throw new Error("response exceeds configured limit");
    const html = await response.text();
    if (Buffer.byteLength(html) > config.maxResponseBytes) throw new Error("response exceeds configured limit");
    const publishedAt = parsePublishedTime(html);
    return {
      ...target,
      finalUrl: response.url,
      status: publishedAt ? "resolved" : "unresolved",
      publishedAt,
      durationMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      ...target,
      status: "limited",
      publishedAt: null,
      durationMs: Date.now() - startedAt,
      error: error.message,
    };
  }
}

const results = await mapLimit(targets, 4, probe);
const summary = summarizeShadowDetailProbe(results, config);
const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  mode: "shadow-detail-time-observation",
  bounds: {
    maxPerSource: MAX_PER_SOURCE,
    maxTotal: MAX_TOTAL,
    concurrency: 4,
    requestTimeoutMs: config.requestTimeoutMs,
    maxResponseBytes: config.maxResponseBytes,
  },
  ...summary,
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(report, null, 2) + "\n");

console.log(`Shadow detail timestamp probe: attempted=${report.attempted}; resolved=${report.resolved}; unresolved=${report.unresolved}; limited=${report.limited}`);
console.log(`Report: ${OUTPUT_PATH}`);

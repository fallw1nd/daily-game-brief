import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { updateSourceHealth } from "./lib/source-health.mjs";

const REPORT_PATH = resolve(process.env.NEWS_SHADOW_REPORT_PATH || "artifacts/news-shadow-report.json");
const PREVIOUS_PATH = resolve(process.env.SOURCE_HEALTH_PREVIOUS_PATH || "artifacts/source-health-previous.json");
const OUTPUT_PATH = resolve(process.env.SOURCE_HEALTH_PATH || "artifacts/source-health.json");
const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
let previous = { schemaVersion: 1, sources: {} };
try {
  const previousText = await readFile(PREVIOUS_PATH, "utf8");
  if (previousText.trim()) previous = JSON.parse(previousText);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const health = updateSourceHealth(report, previous);
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(health, null, 2) + "\n");
const limited = Object.values(health.sources).filter((item) => item.consecutiveFailures > 0).length;
console.log(`Source health: ${Object.keys(health.sources).length} tracked; ${limited} currently failing`);

const empty = Object.entries(health.sources).filter(([, item]) => item.dataStatus === "empty");
console.log("Source data: " + empty.length + " responding sources returned no parsed items: " + empty.map(([id, item]) => id + " (" + item.consecutiveEmptyResponses + " recent consecutive checks)").join(", "));
if (process.env.GITHUB_STEP_SUMMARY) {
  const rows = Object.entries(health.sources).filter(([, item]) => item.dataStatus !== "available")
    .map(([id, item]) => "- " + id + ": " + item.dataStatus + (item.dataStatus === "empty" ? " (" + item.consecutiveEmptyResponses + " consecutive empty checks in recent history)" : " (" + item.consecutiveFailures + " consecutive failures)"));
  await appendFile(process.env.GITHUB_STEP_SUMMARY, "\n### Source availability and parsed data\n\n" + (rows.join("\n") || "All tracked sources returned parsed items.") + "\n\nHTTP success and parsed items do not establish timely or complete editorial coverage. Contribution metrics apply to shadow observations only.\n");
}

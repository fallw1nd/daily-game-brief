import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { updateSourceHealth } from "./lib/source-health.mjs";

const REPORT_PATH = resolve(process.env.NEWS_SHADOW_REPORT_PATH || "artifacts/news-shadow-report.json");
const PREVIOUS_PATH = resolve(process.env.SOURCE_HEALTH_PREVIOUS_PATH || "artifacts/source-health-previous.json");
const OUTPUT_PATH = resolve(process.env.SOURCE_HEALTH_PATH || "artifacts/source-health.json");
const report = JSON.parse(await readFile(REPORT_PATH, "utf8"));
let previous = {schemaVersion:1,sources:{}};
try { previous = JSON.parse(await readFile(PREVIOUS_PATH, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const health = updateSourceHealth(report, previous);
await mkdir(dirname(OUTPUT_PATH), {recursive:true});
await writeFile(OUTPUT_PATH, JSON.stringify(health, null, 2) + "\n");
const limited = Object.values(health.sources).filter((item) => item.consecutiveFailures > 0).length;
console.log(`Source health: ${Object.keys(health.sources).length} tracked; ${limited} currently failing`);

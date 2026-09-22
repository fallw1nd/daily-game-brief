import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { collectReleaseCalendar, boundCalendarReport, updateReleaseCalendarHealth } from "./lib/release-calendar-discovery.mjs";
import { loadCanonicalUpcomingBaseline } from "./lib/upcoming-baseline.mjs";
const date = process.argv.find(arg => arg.startsWith("--date="))?.slice(7)
  || JSON.parse(await readFile(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json", "utf8")).window.id.slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("Pass --date=YYYY-MM-DD (edition date in Asia/Shanghai)");
const [config, latest, manifest, titleRegistry] = await Promise.all(["config/release-calendar-sources.json", "public/data/latest.json", "public/data/manifest.json", "config/title-translations.json"].map(path => readFile(path, "utf8").then(JSON.parse)));
let sourceHealth = { schemaVersion: 1, sources: {} };
try { sourceHealth = JSON.parse(await readFile(process.env.RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH || "artifacts/release-calendar-health-previous.json", "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const baseline = await loadCanonicalUpcomingBaseline({ latest, manifest, editionDate: date });
const report = await collectReleaseCalendar({ config, editionDate: date, baseline: baseline.items, titleRegistry, sourceHealth });
await mkdir("artifacts", { recursive: true });
await writeFile("artifacts/release-calendar-discovery.json", JSON.stringify(report, null, 2) + "\n");
await writeFile("artifacts/release-calendar-packet.json", JSON.stringify(boundCalendarReport(report), null, 2) + "\n");
await writeFile(process.env.RELEASE_CALENDAR_HEALTH_PATH || "artifacts/release-calendar-health.json", JSON.stringify(updateReleaseCalendarHealth(report, sourceHealth), null, 2) + "\n");
console.log(JSON.stringify({ window: report.window, coverage: report.coverage, platformCoverage: report.platformCoverage, candidates: report.candidates.length, missingFromBaseline: report.candidates.filter(r => !r.inBaseline).length, omittedCandidates: report.omittedCandidates, omissionStats: report.omissionStats }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\nRelease calendar: ${report.candidates.length} candidate rows; ${report.omittedCandidates} omitted. This is partial discovery and requires primary-source verification.\n`);

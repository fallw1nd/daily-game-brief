import { readFile, mkdir, writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { collectReleaseCalendar, boundCalendarReport } from "./lib/release-calendar-discovery.mjs";
import { loadCanonicalUpcomingBaseline } from "./lib/upcoming-baseline.mjs";
import { persistCalendarHealth, readOptionalJson } from "./lib/release-calendar-health-io.mjs";
const date = process.argv.find(arg => arg.startsWith("--date="))?.slice(7)
  || JSON.parse(await readFile(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json", "utf8")).window.id.slice(0, 10);
if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("Pass --date=YYYY-MM-DD (edition date in Asia/Shanghai)");
const [config, latest, manifest, titleRegistry] = await Promise.all(["config/release-calendar-sources.json", "public/data/latest.json", "public/data/manifest.json", "config/title-translations.json"].map(path => readFile(path, "utf8").then(JSON.parse)));
const baseline = await loadCanonicalUpcomingBaseline({ latest, manifest, editionDate: date });
const previousHealth = await readOptionalJson(process.env.RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH || "artifacts/release-calendar-health-previous.json", { allowMalformed: true });
const report = await collectReleaseCalendar({ config, editionDate: date, baseline: baseline.items, titleRegistry, previousHealth });
const reportPath = resolve(process.env.RELEASE_CALENDAR_REPORT_PATH || "artifacts/release-calendar-discovery.json");
const packetPath = resolve(process.env.RELEASE_CALENDAR_PACKET_PATH || "artifacts/release-calendar-packet.json");
await mkdir(dirname(reportPath), { recursive: true });
await mkdir(dirname(packetPath), { recursive: true });
await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
await persistCalendarHealth({
  previousPath: process.env.RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH || "artifacts/release-calendar-health-previous.json",
  outputPath: process.env.RELEASE_CALENDAR_HEALTH_PATH || "artifacts/release-calendar-health.json",
  report,
});
await writeFile(packetPath, JSON.stringify(boundCalendarReport(report), null, 2) + "\n");
console.log(JSON.stringify({ window: report.window, coverage: report.coverage, candidates: report.candidates.length, missingFromBaseline: report.candidates.filter(r => !r.inBaseline).length, omittedCandidates: report.omittedCandidates }, null, 2));
if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `\nRelease calendar: ${report.candidates.length} candidate rows; ${report.omittedCandidates} omitted. This is partial discovery and requires primary-source verification.\n`);

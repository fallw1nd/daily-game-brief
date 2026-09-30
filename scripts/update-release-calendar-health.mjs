import { resolve } from "node:path";
import { readOptionalJson, persistCalendarHealth } from "./lib/release-calendar-health-io.mjs";

const argument = (name, envName, fallback) => resolve(
  process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3)
  || process.env[envName]
  || fallback,
);
const previousPath = argument("previous", "RELEASE_CALENDAR_HEALTH_PREVIOUS_PATH", "artifacts/release-calendar-health-previous.json");
const reportPath = argument("report", "RELEASE_CALENDAR_REPORT_PATH", "artifacts/release-calendar-discovery.json");
const outputPath = argument("output", "RELEASE_CALENDAR_HEALTH_PATH", "artifacts/release-calendar-health.json");
const report = await readOptionalJson(reportPath);
if (!report) throw new Error(`Calendar health report is missing: ${reportPath}`);
await persistCalendarHealth({ previousPath, reportPath, outputPath, report });
console.log(`Release calendar health: ${outputPath}`);

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { resolve } from "node:path";
import { windowForEditionId } from "./lib/edition-window.mjs";
import { showcaseEvidencePackages } from "./lib/showcase.mjs";

const run = promisify(execFile);
const root = resolve("artifacts/showcase-source-rehearsal");
await mkdir(root, { recursive: true });
const cases = [
  { editionId: "2026-09-10-daily", event: { id: "nintendo-direct-2026-09-09", kind: "nintendo-direct", date: "2026-09-09", startsAt: "2026-09-09T14:00:00Z", timeBasis: "official US archive: September 9, 7 a.m. PT / 10 a.m. ET", sources: [
    { region: "jp", url: "https://www.nintendo.com/jp/nintendo-direct/description/20260909_ja-JP.html", inventoryComplete: true, inventoryBasis: "official-full-text-transcript" },
    { region: "us", url: "https://www.nintendo.com/us/nintendo-direct/9-9-2026/", inventoryComplete: false },
    { region: "eu", url: "https://www.nintendo.com/en-gb/News/Nintendo-Direct/Latest-Nintendo-Direct/Nintendo-Direct-698557.html", inventoryComplete: false },
  ] } },
  { editionId: "2026-09-04-daily", event: { id: "state-of-play-2026-09-03", kind: "state-of-play", date: "2026-09-03", startsAt: "2026-09-03T08:05:55-07:00", timeBasis: "official recap article:published_time; not a claim about broadcast start", sources: [
    { region: "us", url: "https://blog.playstation.com/2026/09/03/state-of-play-state-of-play-japan-all-announcements-trailers/", inventoryComplete: false },
  ] } },
];
const reports = [];
for (const item of cases) {
  const windowPath = resolve(root, `${item.editionId}-window.json`);
  const eventPath = resolve(root, `${item.editionId}-events.json`);
  const output = resolve(root, `${item.editionId}-evidence.json`);
  await writeFile(windowPath, JSON.stringify({ window: windowForEditionId(item.editionId) }));
  await writeFile(eventPath, JSON.stringify({ events: [item.event] }));
  await run(process.execPath, ["scripts/collect-showcases.mjs"], { timeout: 180000, env: { ...process.env, NEWS_SHADOW_REPORT_PATH: windowPath, SHOWCASE_EVENTS_PATH: eventPath, SHOWCASE_REPORT_PATH: output, SHOWCASE_SAVE_PAGES: "false" } });
  reports.push(JSON.parse(await readFile(output, "utf8")));
}
const namingEvidence = { window: reports[0].window, packages: reports.flatMap(showcaseEvidencePackages) };
await writeFile(resolve(root, "naming-evidence.json"), JSON.stringify(namingEvidence, null, 2));
await writeFile(resolve(root, "summary.json"), JSON.stringify({ status: "source-rehearsal-only", acceptanceComplete: false, cases: reports.map(report => ({ editionId: report.window.id, fragments: report.announcements.length, sources: report.events.flatMap(event => event.sources), unresolvedSubjects: report.announcements.filter(item => !item.subjectKey).length })) }, null, 2));
console.log(JSON.stringify({ cases: reports.length, fragments: reports.reduce((total, report) => total + report.announcements.length, 0), acceptanceComplete: false }));

import { appendFile, readFile } from "node:fs/promises";
import { EDITION_PERIODS, expectedEditorialWindow, latestDueWindow } from "./lib/edition-window.mjs";

const periodArg = process.argv.find((arg) => arg.startsWith("--period="))?.split("=")[1];
const editionArg = process.argv.find((arg) => arg.startsWith("--edition="))?.slice("--edition=".length) || process.env.BRIEF_EDITION || "";
const period = periodArg || process.env.BRIEF_PERIOD;
if (!EDITION_PERIODS.includes(period)) throw new Error(`Pass --period=${EDITION_PERIODS.join("|")}`);

const now = process.env.BRIEF_NOW ? new Date(process.env.BRIEF_NOW) : new Date();
const expected = editionArg ? expectedEditorialWindow(editionArg) : latestDueWindow(period, now);
if (!expected) throw new Error("Pass a valid --edition=YYYY-MM-DD-am|pm|daily");
if (expected.period !== period) throw new Error(`edition ${expected.id} does not match period ${period}`);
const manifest = JSON.parse(await readFile("public/data/manifest.json", "utf8"));
const localEdition = manifest.editions.find((edition) => edition.id === expected.id);
let status = localEdition ? "committed" : "missing";
let onlineLatest = null;
let onlineError = null;

if (localEdition && process.env.SKIP_ONLINE_CHECK !== "true") {
  try {
    const url = new URL("https://fallw1nd.github.io/daily-game-brief/data/manifest.json");
    url.searchParams.set("sla", String(Date.now()));
    const response = await fetch(url, {
      signal: AbortSignal.timeout(15000),
      headers: { Accept: "application/json", "User-Agent": "DailyGameBriefSlaBot/1.0" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const online = await response.json();
    onlineLatest = online.latest;
    status = online.editions?.some((edition) => edition.id === expected.id)
      ? "healthy"
      : "deployment-lag";
  } catch (error) {
    status = "online-check-failed";
    onlineError = error.message;
  }
}

const result = {
  checkedAt: now.toISOString(),
  expectedEdition: expected.id,
  period,
  status,
  localLatest: manifest.latest,
  onlineLatest,
  onlineError,
};

console.log(JSON.stringify(result, null, 2));
if (process.env.GITHUB_OUTPUT) {
  await appendFile(process.env.GITHUB_OUTPUT, [
    `status=${status}`,
    `expected=${expected.id}`,
    `local_latest=${manifest.latest}`,
    `online_latest=${onlineLatest || ""}`,
  ].join("\n") + "\n");
}

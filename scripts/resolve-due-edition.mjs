import { appendFile, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { latestDueWindow, plannedWindow } from "./lib/news-pipeline.mjs";

function dateRange(start, end) {
  const values = [];
  for (let cursor = Date.parse(`${start}T12:00:00+08:00`); cursor <= Date.parse(`${end}T12:00:00+08:00`); cursor += 86400000) {
    values.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return values;
}

export function resolveDueEdition({ period, now = new Date(), manifest, states = {}, purpose = "publication" }) {
  if (!new Set(["am", "pm"]).has(period)) throw new Error("period must be am or pm");
  if (!new Set(["packet", "publication"]).has(purpose)) throw new Error("purpose must be packet or publication");
  const latestDue = latestDueWindow(period, now);
  const published = new Set((manifest?.editions || []).map((item) => item.id));
  const lastPublished = [...(manifest?.editions || [])].sort((a, b) => (a.issueNumber || 0) - (b.issueNumber || 0)).at(-1);
  const startDate = lastPublished?.date || latestDue.id.slice(0, 10);
  const lastPublishedWindow = lastPublished
    ? plannedWindow(lastPublished.period, new Date(`${lastPublished.date}T12:00:00+08:00`))
    : null;
  const cutoff = (window) => Date.parse(`${window.windowEnd.replace(" ", "T")}:00+08:00`);
  const candidates = dateRange(startDate, latestDue.id.slice(0, 10))
    .map((date) => plannedWindow(period, new Date(`${date}T12:00:00+08:00`)))
    .filter((window) => cutoff(window) <= now.getTime() && (!lastPublishedWindow || cutoff(window) > cutoff(lastPublishedWindow)));
  const target = candidates.find((window) => {
    if (published.has(window.id)) return false;
    if (purpose === "packet" && states[window.id]?.packet?.status === "ready") return false;
    return true;
  });
  return { window: target || latestDue, needed: Boolean(target), purpose };
}

async function loadStates(root) {
  const states = {};
  if (!root) return states;
  try {
    for (const name of await readdir(root)) {
      if (!name.endsWith(".json")) continue;
      const state = JSON.parse(await readFile(resolve(root, name), "utf8"));
      if (state?.editionId) states[state.editionId] = state;
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return states;
}

async function main() {
  const argument = (name) => process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3) || "";
  const period = argument("period");
  const purpose = argument("purpose") || "publication";
  const now = process.env.BRIEF_NOW ? new Date(process.env.BRIEF_NOW) : new Date();
  const manifest = JSON.parse(await readFile(resolve(argument("manifest") || "public/data/manifest.json"), "utf8"));
  const states = await loadStates(argument("status-root") || process.env.EDITION_STATUS_ROOT);
  const result = resolveDueEdition({ period, now, manifest, states, purpose });
  const referenceNow = new Date(`${result.window.windowEnd.replace(" ", "T")}:00+08:00`).toISOString();
  console.log(JSON.stringify({ ...result, referenceNow }, null, 2));
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `period=${period}\nedition=${result.window.id}\nneeded=${result.needed}\nreference_now=${referenceNow}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();

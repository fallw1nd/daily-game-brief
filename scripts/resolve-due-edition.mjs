import { appendFile, readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { expectedEditorialWindow } from "./lib/editorial-packet.mjs";
import { latestDueWindow, plannedWindow } from "./lib/edition-window.mjs";

function dateRange(start, end) {
  const values = [];
  for (let cursor = Date.parse(`${start}T12:00:00+08:00`); cursor <= Date.parse(`${end}T12:00:00+08:00`); cursor += 86400000) {
    values.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return values;
}

function dailyLivenessWindow({ now, manifest, states }) {
  const latestDue = latestDueWindow("daily", now);
  const latestDueDate = latestDue.id.slice(0, 10);
  const published = new Set((manifest?.editions || []).map((item) => item.id));
  const lastDaily = [...(manifest?.editions || [])]
    .filter((item) => item.period === "daily")
    .sort((a, b) => (a.issueNumber || 0) - (b.issueNumber || 0) || String(a.date).localeCompare(String(b.date)))
    .at(-1);
  const lastDailyWindow = lastDaily
    ? plannedWindow("daily", new Date(`${lastDaily.date}T12:00:00+08:00`))
    : null;
  const startDate = lastDaily?.date || latestDueDate;
  const candidates = dateRange(startDate, latestDueDate)
    .map((date) => plannedWindow("daily", new Date(`${date}T12:00:00+08:00`)))
    .filter((window) => cutoffAt(window) <= now.getTime() && (!lastDailyWindow || cutoffAt(window) > cutoffAt(lastDailyWindow)));
  for (const window of candidates) {
    if (published.has(window.id)) continue;
    const state = states[window.id];
    if (state?.publication?.status === "committed" || state?.packet?.status === "ready") continue;
    return window;
  }
  return null;
}

function cutoffAt(window) {
  return Date.parse(`${window.windowEnd.replace(" ", "T")}:00+08:00`);
}

export function resolveDueEdition({ period, now = new Date(), manifest, states = {}, purpose = "publication" }) {
  if (!new Set(["am", "pm", "daily"]).has(period)) throw new Error("period must be am, pm, or daily");
  if (!new Set(["packet", "editorial", "publication"]).has(purpose)) throw new Error("purpose must be packet, editorial, or publication");
  const latestDue = latestDueWindow(period, now);
  const cutoff = cutoffAt;
  if (purpose === "editorial") {
    const candidates = Object.values(states)
      .map((state) => ({ state, window: expectedEditorialWindow(state?.editionId) }))
      .filter(({ state, window }) => window
        && window.period === period
        && cutoff(window) <= now.getTime()
        && state.packet?.status === "ready"
        && state.publication?.status !== "committed"
        && ["pending", "invalid"].includes(state.editorial?.status))
      ;
    const priority = (state) => {
      if (state.revisionRequest?.reason === "editorial_continuation") return 2;
      if (state.revisionRequest?.reason === "showcase_completion") return 3;
      return 1;
    };
    const normalCandidate = candidates
      .filter(({ state }) => priority(state) === 1)
      .sort((left, right) => cutoff(left.window) - cutoff(right.window))[0];
    const candidate = normalCandidate || candidates
      .sort((left, right) => priority(left.state) - priority(right.state) || cutoff(left.window) - cutoff(right.window))[0];
    if (!normalCandidate && period === "daily") {
      const livenessWindow = dailyLivenessWindow({ now, manifest, states });
      if (livenessWindow) {
        return {
          window: livenessWindow,
          needed: false,
          purpose,
          editorialMode: "liveness-wake",
          livenessWake: true,
          packetBlobSha: null,
          submissionSha: null,
          validationErrors: [],
        };
      }
    }
    const continuationReason = candidate?.state.revisionRequest?.reason;
    return {
      window: candidate?.window || latestDue,
      needed: Boolean(candidate),
      purpose,
      editorialMode: candidate
        ? candidate.state.editorial.status === "invalid"
          ? "repair-invalid"
          : continuationReason === "editorial_continuation"
            ? "editorial-continuation"
            : continuationReason === "showcase_completion"
              ? "showcase-completion"
              : "new-decision"
        : null,
      packetBlobSha: candidate?.state.packet.blobSha || null,
      submissionSha: candidate?.state.editorial.status === "invalid" ? candidate.state.editorial.submissionSha : null,
      validationErrors: candidate?.state.editorial.status === "invalid" ? (candidate.state.editorial.validationErrors || []) : [],
    };
  }
  const published = new Set((manifest?.editions || []).map((item) => item.id));
  const lastPublished = [...(manifest?.editions || [])].sort((a, b) => (a.issueNumber || 0) - (b.issueNumber || 0)).at(-1);
  const startDate = lastPublished?.date || latestDue.id.slice(0, 10);
  const lastPublishedWindow = lastPublished
    ? plannedWindow(lastPublished.period, new Date(`${lastPublished.date}T12:00:00+08:00`))
    : null;
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

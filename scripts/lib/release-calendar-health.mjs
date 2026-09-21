/**
 * Pure functions for the bounded release-calendar source health ledger.
 *
 * This module records observations made by a collector. It does not fetch,
 * parse, choose fallbacks, or claim that a source covers a platform.
 */

export const CALENDAR_HEALTH_SCHEMA_VERSION = 1;
export const MAX_RECENT_OBSERVATIONS = 30;

const KNOWN_PHASES = new Set(["success", "failed", "partial_failure", "unknown"]);
const EMPTY_LEDGER = () => ({
  schemaVersion: CALENDAR_HEALTH_SCHEMA_VERSION,
  updatedAt: null,
  sources: {},
  diagnostics: [],
});

const text = (value) => typeof value === "string" && value.trim() ? value.trim() : null;
const numberOrNull = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
};
const integerOrNull = (value) => {
  const number = numberOrNull(value);
  return number !== null && Number.isInteger(number) ? number : null;
};
const booleanOrNull = (value) => typeof value === "boolean" ? value : null;
const isoOrNull = (value) => {
  const valueText = text(value);
  if (!valueText) return null;
  const time = Date.parse(valueText);
  return Number.isFinite(time) ? new Date(time).toISOString() : null;
};
const dateOrNull = (value) => {
  const valueText = text(value);
  return valueText && /^\d{4}-\d{2}-\d{2}$/.test(valueText) && !Number.isNaN(Date.parse(`${valueText}T00:00:00Z`))
    ? valueText
    : null;
};

function phase(value) {
  const valueText = text(value)?.toLowerCase().replace(/[ -]+/g, "_");
  if (!valueText || valueText === "unknown") return "unknown";
  if (["ok", "success", "successful", "available", "http_success"].includes(valueText)) return "success";
  if (["failed", "failure", "error", "unavailable", "http_failure", "timeout"].includes(valueText)) return "failed";
  if (["partial", "partial_failure", "partially_failed"].includes(valueText)) return "partial_failure";
  return KNOWN_PHASES.has(valueText) ? valueText : "unknown";
}

function firstPresent(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function pageMetrics(entry) {
  const pages = entry.pages && typeof entry.pages === "object" ? entry.pages : {};
  return {
    attempted: integerOrNull(firstPresent(entry.pagesAttempted, pages.attempted, pages.attempts)),
    succeeded: integerOrNull(firstPresent(entry.pagesSucceeded, pages.succeeded, pages.success)),
    failed: integerOrNull(firstPresent(entry.pagesFailed, pages.failed, pages.failure)),
  };
}

function aggregateState(entry) {
  const raw = text(firstPresent(entry.status, entry.outcome, entry.state))?.toLowerCase().replace(/[ -]+/g, "_");
  const partial = booleanOrNull(firstPresent(entry.partialFailure, entry.partial_failure));
  const empty = booleanOrNull(firstPresent(entry.empty, entry.emptyResponse));
  const changed = booleanOrNull(firstPresent(entry.changed, entry.parserChanged));
  return {
    outcome: raw === "empty_or_changed" ? "empty_or_changed"
      : raw === "partial_failure" ? "partial_failure"
        : raw === "failed" || raw === "failure" ? "failed"
          : raw === "ok" || raw === "success" || raw === "successful" ? "success"
            : raw || "unknown",
    empty: empty ?? (raw === "empty" ? true : null),
    changed: changed ?? (raw === "changed" ? true : null),
    partialFailure: partial ?? (raw === "partial_failure" ? true : null),
  };
}

function sourceEntryFromReport(entry, report) {
  if (!entry || typeof entry !== "object") return null;
  const sourceId = text(firstPresent(entry.sourceId, entry.id));
  if (!sourceId) return null;
  const editionDate = dateOrNull(firstPresent(entry.editionDate, report?.editionDate, report?.window?.id?.slice?.(0, 10)));
  const fetchedAt = isoOrNull(firstPresent(entry.fetchedAt, report?.fetchedAt, report?.generatedAt));
  const fetchValue = firstPresent(entry.sourceStatus, entry.fetchStatus, entry.transportStatus, entry.fetch?.status);
  const parserValue = firstPresent(entry.parserStatus, entry.parseStatus, entry.parser?.status);
  const state = aggregateState(entry);
  const pages = pageMetrics(entry);
  const fetchStatus = phase(fetchValue);
  const parserStatus = phase(parserValue);
  const inWindowCandidates = integerOrNull(firstPresent(entry.inWindowCandidates, entry.inWindow, entry.inWindowCount));
  const usefulLeads = integerOrNull(firstPresent(entry.usefulLeads, entry.usefulLeadCount, entry.nonVerifiedLeads));
  return {
    editionDate,
    fetchedAt,
    sourceId,
    platform: text(firstPresent(entry.platform, entry.platforms?.length === 1 ? entry.platforms[0] : null)),
    family: text(firstPresent(entry.family, entry.platformFamily)),
    fetchStatus,
    parserStatus,
    pages,
    inWindowCandidates,
    usefulLeads,
    outcome: state.outcome,
    empty: state.empty,
    changed: state.changed,
    partialFailure: state.partialFailure,
    durationMs: numberOrNull(firstPresent(entry.durationMs, entry.duration)),
  };
}

function observationKey(observation) {
  return [observation.editionDate || "?", observation.fetchedAt || "?", observation.sourceId].join("|");
}

function observationOrder(observation) {
  const fetched = observation.fetchedAt ? Date.parse(observation.fetchedAt) : Number.NaN;
  if (Number.isFinite(fetched)) return fetched;
  const edition = observation.editionDate ? Date.parse(`${observation.editionDate}T00:00:00Z`) : Number.NaN;
  return Number.isFinite(edition) ? edition : Number.NEGATIVE_INFINITY;
}

function compareObservations(a, b) {
  return observationOrder(a) - observationOrder(b)
    || (a.editionDate || "").localeCompare(b.editionDate || "")
    || (a.fetchedAt || "").localeCompare(b.fetchedAt || "")
    || a.sourceId.localeCompare(b.sourceId);
}

function mergeObservation(previous, current) {
  if (!previous) return current;
  // A retry can fill fields that were absent on the first attempt. Current
  // values win, while absent current fields retain the previous observation.
  const merged = { ...previous, ...current };
  merged.pages = Object.fromEntries(["attempted", "succeeded", "failed"].map((key) => [
    key,
    current.pages[key] !== null && current.pages[key] !== undefined ? current.pages[key] : previous.pages[key] ?? null,
  ]));
  for (const key of ["platform", "family", "fetchStatus", "parserStatus", "inWindowCandidates", "usefulLeads", "outcome", "empty", "changed", "partialFailure", "durationMs"]) {
    if (current[key] === null || current[key] === "unknown") merged[key] = previous[key] ?? current[key];
  }
  return merged;
}

function sourceRecord(sourceId, observations, metadata = {}) {
  const recent = observations.sort(compareObservations).slice(-MAX_RECENT_OBSERVATIONS);
  const latest = recent.length ? recent[recent.length - 1] : null;
  return {
    sourceId,
    platform: latest?.platform ?? metadata.platform ?? null,
    family: latest?.family ?? metadata.family ?? null,
    lastObservedAt: latest?.fetchedAt ?? null,
    lastEditionDate: latest?.editionDate ?? null,
    lastFetchStatus: latest?.fetchStatus ?? "unknown",
    lastParserStatus: latest?.parserStatus ?? "unknown",
    lastOutcome: latest?.outcome ?? "unknown",
    lastInWindowCandidates: latest?.inWindowCandidates ?? null,
    lastUsefulLeads: latest?.usefulLeads ?? null,
    recent,
  };
}

function validObservation(value, sourceId) {
  if (!value || typeof value !== "object" || value.sourceId !== sourceId) return false;
  if (!KNOWN_PHASES.has(value.fetchStatus) || !KNOWN_PHASES.has(value.parserStatus)) return false;
  if (!value.pages || typeof value.pages !== "object" || Array.isArray(value.pages)) return false;
  if (["attempted", "succeeded", "failed"].some((key) => value.pages[key] !== null && (!Number.isInteger(value.pages[key]) || value.pages[key] < 0))) return false;
  if (value.editionDate !== null && dateOrNull(value.editionDate) !== value.editionDate) return false;
  if (value.fetchedAt !== null && isoOrNull(value.fetchedAt) !== value.fetchedAt) return false;
  return ["inWindowCandidates", "usefulLeads", "durationMs"].every((key) => value[key] === null || numberOrNull(value[key]) === value[key]);
}

function readPrevious(previous) {
  if (previous === undefined || previous === null || previous === "") return { ledger: EMPTY_LEDGER(), diagnostics: [] };
  if (!previous || typeof previous !== "object" || (previous.schemaVersion !== undefined && previous.schemaVersion !== CALENDAR_HEALTH_SCHEMA_VERSION) || !previous.sources || typeof previous.sources !== "object" || Array.isArray(previous.sources)) {
    const diagnostics = [{ code: "malformed_previous_ledger", message: "Previous calendar health ledger was not a supported object; rebuilt empty." }];
    return { ledger: { ...EMPTY_LEDGER(), diagnostics }, diagnostics };
  }
  const sources = {};
  for (const [sourceId, record] of Object.entries(previous.sources)) {
    if (!record || typeof record !== "object" || !Array.isArray(record.recent) || record.recent.some((item) => !validObservation(item, sourceId))) {
      const diagnostics = [{ code: "malformed_previous_ledger", message: `Source ${sourceId} had an invalid recent observation list; rebuilt empty.` }];
      return { ledger: { ...EMPTY_LEDGER(), diagnostics }, diagnostics };
    }
    sources[sourceId] = sourceRecord(sourceId, record.recent.map((item) => ({ ...item, pages: { ...item.pages } })), record);
  }
  const diagnostics = Array.isArray(previous.diagnostics) ? previous.diagnostics : [];
  return { ledger: { ...EMPTY_LEDGER(), updatedAt: isoOrNull(previous.updatedAt), sources, diagnostics }, diagnostics };
}

function reportEntries(report) {
  if (!report || typeof report !== "object") return { entries: [], diagnostics: [{ code: "invalid_report", message: "Calendar health report was not an object; no observation recorded." }] };
  const entries = Array.isArray(report.coverage) ? report.coverage
    : Array.isArray(report.sourceStats) ? report.sourceStats
      : Array.isArray(report.sources) ? report.sources : null;
  if (!entries) return { entries: [], diagnostics: [{ code: "invalid_report_entries", message: "Calendar health report had no supported source entry array." }] };
  const diagnostics = [];
  const observations = [];
  for (const entry of entries) {
    const observation = sourceEntryFromReport(entry, report);
    if (!observation) {
      diagnostics.push({ code: "invalid_source_entry", message: "Skipped a source entry without a sourceId." });
      continue;
    }
    observations.push(observation);
  }
  return { entries: observations, diagnostics };
}

/** Normalize a collector report without performing IO or mutating the input. */
export function normalizeCalendarHealthReport(report) {
  return reportEntries(report);
}

/**
 * Merge one collector report into the bounded ledger. Applying the same
 * (editionDate, fetchedAt, sourceId) observation twice is idempotent.
 */
export function updateCalendarHealth(previous, report, options = {}) {
  const prior = readPrevious(previous);
  const incoming = reportEntries(report);
  const bySource = new Map(Object.entries(prior.ledger.sources).map(([sourceId, record]) => [sourceId, record.recent]));
  const metadata = new Map(Object.entries(prior.ledger.sources));
  for (const observation of incoming.entries) {
    const existing = bySource.get(observation.sourceId) || [];
    const index = existing.findIndex((item) => observationKey(item) === observationKey(observation));
    if (index >= 0) existing[index] = mergeObservation(existing[index], observation);
    else existing.push(observation);
    bySource.set(observation.sourceId, existing);
  }
  const sources = {};
  for (const [sourceId, observations] of bySource) sources[sourceId] = sourceRecord(sourceId, observations, metadata.get(sourceId));
  const currentTime = isoOrNull(firstPresent(report?.fetchedAt, report?.generatedAt, options.now));
  const knownTimes = Object.values(sources).map((source) => source.lastObservedAt).filter(Boolean).map(Date.parse).filter(Number.isFinite);
  const updatedAt = knownTimes.length ? new Date(Math.max(...knownTimes, currentTime ? Date.parse(currentTime) : Number.NEGATIVE_INFINITY)).toISOString() : currentTime;
  return {
    schemaVersion: CALENDAR_HEALTH_SCHEMA_VERSION,
    updatedAt,
    sources,
    diagnostics: [...prior.ledger.diagnostics, ...incoming.diagnostics],
  };
}

/** Alias for callers that describe the operation as a ledger merge. */
export const mergeCalendarHealth = updateCalendarHealth;

/**
 * Return descriptive recent signals for same-platform fallback ordering.
 * No score is produced and this function never declares platform coverage.
 */
export function sourceHealthSummary(ledger, { platform = null, family = null } = {}) {
  const prior = readPrevious(ledger).ledger;
  const sources = Object.values(prior.sources)
    .filter((source) => platform === null || source.platform === platform)
    .filter((source) => family === null || source.family === family)
    .sort((a, b) => a.sourceId.localeCompare(b.sourceId))
    .map((source) => {
      const recent = source.recent;
      const count = (predicate) => recent.filter(predicate).length;
      const durations = recent.map((item) => item.durationMs).filter((value) => value !== null);
      return {
        sourceId: source.sourceId,
        platform: source.platform,
        family: source.family,
        observations: recent.length,
        lastObservedAt: source.lastObservedAt,
        lastEditionDate: source.lastEditionDate,
        lastFetchStatus: source.lastFetchStatus,
        lastParserStatus: source.lastParserStatus,
        lastOutcome: source.lastOutcome,
        fetchSuccessesRecent: count((item) => item.fetchStatus === "success"),
        fetchFailuresRecent: count((item) => item.fetchStatus === "failed" || item.fetchStatus === "partial_failure"),
        parserSuccessesRecent: count((item) => item.parserStatus === "success"),
        parserFailuresRecent: count((item) => item.parserStatus === "failed" || item.parserStatus === "partial_failure"),
        fetchKnownRateRecent: recent.filter((item) => item.fetchStatus !== "unknown").length ? count((item) => item.fetchStatus === "success") / recent.filter((item) => item.fetchStatus !== "unknown").length : null,
        parserKnownRateRecent: recent.filter((item) => item.parserStatus !== "unknown").length ? count((item) => item.parserStatus === "success") / recent.filter((item) => item.parserStatus !== "unknown").length : null,
        emptyOrChangedRecent: count((item) => item.outcome === "empty_or_changed" || item.empty === true || item.changed === true),
        partialFailuresRecent: count((item) => item.partialFailure === true || item.outcome === "partial_failure"),
        averageDurationMsRecent: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
        lastInWindowCandidates: source.lastInWindowCandidates,
        lastUsefulLeads: source.lastUsefulLeads,
      };
    });
  return { schemaVersion: CALENDAR_HEALTH_SCHEMA_VERSION, platform, family, sources };
}

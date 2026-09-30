const DAY_MS = 86400000;

function validTime(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

const HEALTH_PHASES = new Set(["success", "failed", "partial_failure", "unknown"]);

function validObservation(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (!HEALTH_PHASES.has(value.fetchStatus) || !HEALTH_PHASES.has(value.parserStatus)) return null;
  const usefulLeads = value.usefulLeads;
  if (usefulLeads !== null && usefulLeads !== undefined
    && (!Number.isInteger(usefulLeads) || usefulLeads < 0)) return null;
  return { fetchStatus: value.fetchStatus, parserStatus: value.parserStatus, usefulLeads: usefulLeads ?? null };
}

function healthFor(ledger, sourceId, now) {
  const sources = ledger?.schemaVersion === 1 && ledger.sources && typeof ledger.sources === "object" && !Array.isArray(ledger.sources)
    ? ledger.sources : null;
  const rawSource = sources?.[sourceId];
  const source = rawSource && typeof rawSource === "object" && !Array.isArray(rawSource) ? rawSource : null;
  const recent = Array.isArray(source?.recent) ? source.recent : [];
  const lastTime = validTime(source?.lastObservedAt);
  const nowTime = now instanceof Date ? now.getTime() : Number.NaN;
  const fresh = lastTime !== null && Number.isFinite(nowTime) && lastTime <= nowTime && nowTime - lastTime <= 14 * DAY_MS;
  if (!fresh || recent.length === 0) return { class: "unknown", reason: !source ? "no_history" : "stale_or_invalid_history", observations: 0, usefulLeads: 0 };
  // Keep the bounded latest window before validation, so malformed trailing entries
  // cannot make old observations look recent.
  const current = recent.slice(-5).map(validObservation).filter(Boolean);
  if (!current.length) return { class: "unknown", reason: "stale_or_invalid_history", observations: 0, usefulLeads: 0 };
  const knownFetch = current.filter((item) => item.fetchStatus !== "unknown");
  const fetchRate = knownFetch.length ? knownFetch.filter((item) => item.fetchStatus === "success").length / knownFetch.length : null;
  const knownParser = current.filter((item) => item.parserStatus !== "unknown");
  const parserFailures = knownParser.filter((item) => item.parserStatus === "failed" || item.parserStatus === "partial_failure").length;
  const usefulLeads = current.filter((item) => item.usefulLeads !== null && item.usefulLeads > 0).length;
  const lastTwo = recent.slice(-2).map(validObservation);
  const repeatedKnownZeroLeads = lastTwo.length === 2 && lastTwo.every((item) => item !== null && item.usefulLeads === 0);
  const degraded = (fetchRate !== null && fetchRate < 0.5) || parserFailures >= 2 || repeatedKnownZeroLeads;
  const healthy = !degraded && (usefulLeads > 0 || (fetchRate !== null && fetchRate >= 0.8 && parserFailures === 0));
  return {
    class: healthy ? "healthy" : degraded ? "degraded" : "unknown",
    reason: healthy ? "recent_success_or_useful_lead" : degraded ? repeatedKnownZeroLeads ? "repeated_known_zero_leads" : "repeated_failures" : "mixed_or_sparse_history",
    observations: current.length,
    fetchRate,
    parserFailures,
    usefulLeads,
    lastObservedAt: source.lastObservedAt,
  };
}

function dayOfYear(date) {
  return Math.floor((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${date.slice(0, 4)}-01-01T00:00:00Z`)) / DAY_MS) + 1;
}

/** Decide only whether to probe the configured finite fallback set; never changes lead parsing or selection. */
export function planCalendarFallbacks({ baseSources, fallbackSources = [], baseResults, ledger, editionDate, now = new Date() }) {
  const supported = new Set(["PC", "PlayStation", "Xbox", "Nintendo"]);
  const platformGaps = [];
  const fallbackDecisions = [];
  for (const platform of supported) {
    const base = baseSources.filter((source) => source.platform === platform);
    const attempted = baseResults.filter((result) => base.some((source) => source.id === result.source.id));
    const useful = attempted.reduce((sum, result) => sum + result.usefulLeads, 0);
    const problematic = attempted.some((result) => ["failed", "partial_failure", "empty_or_changed"].includes(result.status)
      || result.parserStatus === "unknown" || result.parserStatus === "failed" || result.parserStatus === "partial_failure");
    const gap = !attempted.length || useful === 0 || problematic;
    const reason = !attempted.length ? "no_base_source" : problematic ? "base_failed_partial_empty_or_parser_unknown" : useful === 0 ? "no_useful_base_lead" : "base_useful_lead";
    platformGaps.push({ platform, gap, reason, baseSources: base.map((source) => source.id), usefulBaseLeads: useful });
    for (const source of fallbackSources.filter((item) => item.platform === platform)) {
      const health = healthFor(ledger, source.id, now);
      const severeBaseFailure = attempted.some((result) => result.sourceStatus === "failed" || result.parserStatus === "failed");
      const lowFrequencyDay = dayOfYear(editionDate) % 3 === 0;
      const shouldAttempt = gap && (health.class !== "degraded" || severeBaseFailure || lowFrequencyDay);
      fallbackDecisions.push({
        sourceId: source.id, platform, attempted: shouldAttempt,
        reason: !gap ? "base_has_useful_lead" : !shouldAttempt ? "degraded_history_low_frequency_skip" : health.class === "degraded" ? "degraded_history_periodic_or_base_failure_probe" : `base_gap_${reason}`,
        health,
        lowFrequencyIntervalDays: health.class === "degraded" ? 3 : null,
      });
    }
  }
  const healthOrder = { healthy: 0, unknown: 1, degraded: 2 };
  fallbackDecisions.sort((a, b) => healthOrder[a.health.class] - healthOrder[b.health.class] || a.platform.localeCompare(b.platform) || a.sourceId.localeCompare(b.sourceId));
  return { platformGaps, fallbackDecisions };
}

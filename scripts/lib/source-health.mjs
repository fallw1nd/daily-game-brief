export function updateSourceHealth(report, previous = {schemaVersion:1,sources:{}}, options = {}) {
  const checkedAt = report.generatedAt || options.now || new Date().toISOString();
  const maxRecent = Number(options.maxRecent || 30);
  const sources = {...(previous.sources || {})};
  for (const stat of report.sourceStats || []) {
    const prior = sources[stat.sourceId] || {};
    const recent = [...(prior.recent || []), {
      at: checkedAt,
      status: stat.status,
      count: Number(stat.count || 0),
      durationMs: Number(stat.durationMs || 0),
    }].slice(-maxRecent);
    const successes = recent.filter((item) => item.status === "ok");
    const counts = recent.map((item) => item.count || 0);
    const latencies = recent.map((item) => item.durationMs || 0).filter((value) => value > 0);
    sources[stat.sourceId] = {
      mode: stat.mode || "active",
      capabilities: stat.capabilities || [],
      checks: Number(prior.checks || 0) + 1,
      successes: Number(prior.successes || 0) + (stat.status === "ok" ? 1 : 0),
      consecutiveFailures: stat.status === "ok" ? 0 : Number(prior.consecutiveFailures || 0) + 1,
      lastCheckedAt: checkedAt,
      lastSuccessAt: stat.status === "ok" ? checkedAt : prior.lastSuccessAt || null,
      lastError: stat.status === "ok" ? null : stat.error || "unknown source failure",
      successRateRecent: recent.length ? successes.length / recent.length : 0,
      averageCandidatesRecent: recent.length ? counts.reduce((sum, value) => sum + value, 0) / recent.length : 0,
      averageLatencyMsRecent: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0,
      recent,
    };
  }
  return {schemaVersion:1,updatedAt:checkedAt,sources};
}

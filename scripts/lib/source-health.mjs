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
      filteredCount: Number(stat.filteredCount || 0),
      durationMs: Number(stat.durationMs || 0),
      reviewableCount: Number(stat.shadowReviewableCandidates || 0),
      uniqueCount: Number(stat.shadowUniqueCandidates || 0),
      overlapCount: Number(stat.shadowOverlappingCandidates || 0),
      unknownTimeCount: Number(stat.shadowUnknownTimeCandidates || 0),
    }].slice(-maxRecent);
    const successes = recent.filter((item) => item.status === "ok");
    const counts = recent.map((item) => item.count || 0);
    const filteredCounts = recent.map((item) => item.filteredCount || 0);
    const latencies = recent.map((item) => item.durationMs || 0).filter((value) => value > 0);
    const reviewableCounts = recent.map((item) => item.reviewableCount || 0);
    const uniqueCounts = recent.map((item) => item.uniqueCount || 0);
    const overlapCounts = recent.map((item) => item.overlapCount || 0);
    const unknownTimeCounts = recent.map((item) => item.unknownTimeCount || 0);
    const reviewableTotal = reviewableCounts.reduce((sum, value) => sum + value, 0);
    const overlapTotal = overlapCounts.reduce((sum, value) => sum + value, 0);
    sources[stat.sourceId] = {
      mode: stat.mode || "active",
      capabilities: stat.capabilities || [],
      checks: Number(prior.checks || 0) + 1,
      successes: Number(prior.successes || 0) + (stat.status === "ok" ? 1 : 0),
      consecutiveFailures: stat.status === "ok" ? 0 : Number(prior.consecutiveFailures || 0) + 1,
      lastCheckedAt: checkedAt,
      lastSuccessAt: stat.status === "ok" ? checkedAt : prior.lastSuccessAt || null,
      lastError: stat.status === "ok" ? null : stat.error || "unknown source failure",
      lastFilteredCandidates: Number(stat.filteredCount || 0),
      lastReviewableCandidates: Number(stat.shadowReviewableCandidates || 0),
      lastUniqueCandidates: Number(stat.shadowUniqueCandidates || 0),
      lastOverlappingCandidates: Number(stat.shadowOverlappingCandidates || 0),
      lastUnknownTimeCandidates: Number(stat.shadowUnknownTimeCandidates || 0),
      successRateRecent: recent.length ? successes.length / recent.length : 0,
      averageCandidatesRecent: recent.length ? counts.reduce((sum, value) => sum + value, 0) / recent.length : 0,
      averageFilteredCandidatesRecent: recent.length ? filteredCounts.reduce((sum, value) => sum + value, 0) / recent.length : 0,
      averageReviewableCandidatesRecent: recent.length ? reviewableTotal / recent.length : 0,
      averageUniqueCandidatesRecent: recent.length ? uniqueCounts.reduce((sum, value) => sum + value, 0) / recent.length : 0,
      averageOverlapCandidatesRecent: recent.length ? overlapTotal / recent.length : 0,
      averageUnknownTimeCandidatesRecent: recent.length ? unknownTimeCounts.reduce((sum, value) => sum + value, 0) / recent.length : 0,
      overlapRateRecent: reviewableTotal ? overlapTotal / reviewableTotal : 0,
      averageLatencyMsRecent: latencies.length ? Math.round(latencies.reduce((sum, value) => sum + value, 0) / latencies.length) : 0,
      recent,
    };
  }
  return {schemaVersion:1,updatedAt:checkedAt,sources};
}

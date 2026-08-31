function omission(candidate, reason = "evidence_candidate_limit") {
  return {
    eventKey: candidate.eventKey,
    tier: candidate.tier || null,
    score: candidate.score ?? null,
    reason,
  };
}

export function selectEvidenceCandidates(reviewQueue, maxCandidates, options = {}) {
  const publisherCeiling = Number(options.publisherCeiling || Math.max(2, Math.ceil(maxCandidates * 0.25)));
  const laneCeiling = Number(options.laneCeiling || Math.max(4, Math.ceil(maxCandidates * 0.4)));
  const tierA = reviewQueue.filter((candidate) => candidate.tier === "A");
  const nonA = reviewQueue.filter((candidate) => candidate.tier !== "A");
  const selected = tierA.slice(0, maxCandidates);
  const selectedKeys = new Set(selected.map((candidate) => candidate.eventKey));
  const publisherCounts = new Map();
  const laneCounts = new Map();
  for (const candidate of selected) {
    const family = candidate.publisherFamily || candidate.source?.publisherFamily || candidate.source?.independenceKey || candidate.source?.id || "unknown";
    const lane = candidate.lane || "news";
    publisherCounts.set(family, (publisherCounts.get(family) || 0) + 1);
    laneCounts.set(lane, (laneCounts.get(lane) || 0) + 1);
  }

  const deferred = [];
  let deferredByPublisherCeiling = 0;
  let deferredByLaneCeiling = 0;
  for (const candidate of nonA) {
    if (selected.length >= maxCandidates) {
      deferred.push(candidate);
      continue;
    }
    const family = candidate.publisherFamily || candidate.source?.publisherFamily || candidate.source?.independenceKey || candidate.source?.id || "unknown";
    const lane = candidate.lane || "news";
    if ((publisherCounts.get(family) || 0) >= publisherCeiling) {
      deferredByPublisherCeiling += 1;
      deferred.push(candidate);
      continue;
    }
    if ((laneCounts.get(lane) || 0) >= laneCeiling) {
      deferredByLaneCeiling += 1;
      deferred.push(candidate);
      continue;
    }
    selected.push(candidate);
    selectedKeys.add(candidate.eventKey);
    publisherCounts.set(family, (publisherCounts.get(family) || 0) + 1);
    laneCounts.set(lane, (laneCounts.get(lane) || 0) + 1);
  }

  for (const candidate of deferred) {
    if (selected.length >= maxCandidates) break;
    if (selectedKeys.has(candidate.eventKey)) continue;
    selected.push(candidate);
    selectedKeys.add(candidate.eventKey);
  }

  const omissions = reviewQueue.filter((candidate) => !selectedKeys.has(candidate.eventKey)).map((candidate) => omission(candidate));
  return {
    selected,
    omissions,
    telemetry: {
      reviewQueueCandidates: reviewQueue.length,
      selectedCandidates: selected.length,
      protectedTierA: selected.filter((item) => item.tier === "A").length,
      omittedByCandidateLimit: omissions.length,
      omittedTierA: omissions.filter((item) => item.tier === "A").length,
      omittedTierB: omissions.filter((item) => item.tier === "B").length,
      deferredByPublisherCeiling,
      deferredByLaneCeiling,
      publisherCeiling,
      laneCeiling,
    },
  };
}

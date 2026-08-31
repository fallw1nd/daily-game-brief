export function selectEvidenceCandidates(reviewQueue, maxCandidates) {
  const selected = reviewQueue.slice(0, maxCandidates);
  const omissions = reviewQueue.slice(maxCandidates).map((candidate) => ({
    eventKey: candidate.eventKey,
    tier: candidate.tier || null,
    score: candidate.score ?? null,
    reason: "evidence_candidate_limit",
  }));
  return {
    selected,
    omissions,
    telemetry: {
      reviewQueueCandidates: reviewQueue.length,
      selectedCandidates: selected.length,
      omittedByCandidateLimit: omissions.length,
      omittedTierA: omissions.filter((item) => item.tier === "A").length,
      omittedTierB: omissions.filter((item) => item.tier === "B").length,
    },
  };
}

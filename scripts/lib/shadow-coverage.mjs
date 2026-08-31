export function shadowCandidateKey(candidate = {}) {
  const subject = candidate.canonicalSubjectKey || candidate.subjectKey;
  if (subject && candidate.eventKind && candidate.eventKind !== "other") {
    return `subject:${subject}|${candidate.eventKind}`;
  }
  return `event:${candidate.eventKey || "unknown"}`;
}

export function annotateShadowOverlap(activeCandidates = [], shadowCandidates = []) {
  const activeKeys = new Set(activeCandidates.map(shadowCandidateKey));
  return shadowCandidates.map((candidate) => ({
    ...candidate,
    overlapsActive: activeKeys.has(shadowCandidateKey(candidate)),
  }));
}

export function summarizeShadowCoverage(shadowCandidates = [], sourceStats = [], isContributionEligible = () => true) {
  const reviewable = shadowCandidates.filter(isContributionEligible);
  const unknownTime = shadowCandidates.filter((candidate) => candidate.timeRelation === "unknown");
  const overlappingCandidates = reviewable.filter((candidate) => candidate.overlapsActive);
  const uniqueCandidates = reviewable.filter((candidate) => !candidate.overlapsActive);

  const bySource = sourceStats
    .filter((stat) => stat.mode === "shadow")
    .map((stat) => {
      const sourceCandidates = reviewable.filter((candidate) =>
        (candidate.appearances || []).some((appearance) => appearance.sourceId === stat.sourceId),
      );
      const sourceUnknownTime = unknownTime.filter((candidate) =>
        (candidate.appearances || []).some((appearance) => appearance.sourceId === stat.sourceId),
      );
      const overlapping = sourceCandidates.filter((candidate) => candidate.overlapsActive).length;
      const unique = sourceCandidates.length - overlapping;
      return {
        sourceId: stat.sourceId,
        reviewableCandidates: sourceCandidates.length,
        uniqueCandidates: unique,
        overlappingCandidates: overlapping,
        unknownTimeCandidates: sourceUnknownTime.length,
        overlapRate: sourceCandidates.length ? overlapping / sourceCandidates.length : 0,
      };
    });

  return {
    reviewableCandidates: reviewable.length,
    uniqueCandidates: uniqueCandidates.length,
    overlappingCandidates: overlappingCandidates.length,
    unknownTimeCandidates: unknownTime.length,
    overlapRate: reviewable.length ? overlappingCandidates.length / reviewable.length : 0,
    bySource,
  };
}

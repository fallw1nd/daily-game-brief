function candidateEventKind(candidate = {}) {
  return candidate.eventKind && candidate.eventKind !== "other" ? candidate.eventKind : null;
}

function canonicalIdentityKey(candidate = {}) {
  const eventKind = candidateEventKind(candidate);
  if (!candidate.canonicalSubjectKey || !eventKind) return null;
  return `canonical:${candidate.canonicalSubjectKey}|${eventKind}`;
}

function subjectIdentityKey(candidate = {}) {
  const eventKind = candidateEventKind(candidate);
  if (!candidate.subjectKey || !eventKind) return null;
  return `subject:${candidate.subjectKey}|${eventKind}`;
}

export function shadowCandidateKeys(candidate = {}) {
  return [
    canonicalIdentityKey(candidate),
    subjectIdentityKey(candidate),
    candidate.eventKey ? `event:${candidate.eventKey}` : null,
  ].filter(Boolean);
}

export function shadowCandidateKey(candidate = {}) {
  return shadowCandidateKeys(candidate)[0] || "event:unknown";
}

export function hasStableShadowIdentity(candidate = {}) {
  return Boolean(canonicalIdentityKey(candidate));
}

export function annotateShadowOverlap(activeCandidates = [], shadowCandidates = []) {
  const activeKeys = new Set(activeCandidates.flatMap(shadowCandidateKeys));
  return shadowCandidates.map((candidate) => ({
    ...candidate,
    overlapsActive: shadowCandidateKeys(candidate).some((key) => activeKeys.has(key)),
    shadowIdentityStable: hasStableShadowIdentity(candidate),
  }));
}

export function summarizeShadowCoverage(shadowCandidates = [], sourceStats = [], isContributionEligible = () => true) {
  const reviewable = shadowCandidates.filter(isContributionEligible);
  const unknownTime = shadowCandidates.filter((candidate) => candidate.timeRelation === "unknown");
  const overlappingCandidates = reviewable.filter((candidate) => candidate.overlapsActive);
  const uniqueCandidates = reviewable.filter((candidate) => candidate.shadowIdentityStable && !candidate.overlapsActive);
  const identityUnresolvedCandidates = reviewable.filter((candidate) => !candidate.shadowIdentityStable && !candidate.overlapsActive);
  const evaluatedCandidates = uniqueCandidates.length + overlappingCandidates.length;

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
      const unique = sourceCandidates.filter((candidate) => candidate.shadowIdentityStable && !candidate.overlapsActive).length;
      const identityUnresolved = sourceCandidates.filter((candidate) => !candidate.shadowIdentityStable && !candidate.overlapsActive).length;
      const evaluated = unique + overlapping;
      return {
        sourceId: stat.sourceId,
        reviewableCandidates: sourceCandidates.length,
        uniqueCandidates: unique,
        overlappingCandidates: overlapping,
        identityUnresolvedCandidates: identityUnresolved,
        unknownTimeCandidates: sourceUnknownTime.length,
        overlapRate: evaluated ? overlapping / evaluated : 0,
      };
    });

  return {
    reviewableCandidates: reviewable.length,
    uniqueCandidates: uniqueCandidates.length,
    overlappingCandidates: overlappingCandidates.length,
    identityUnresolvedCandidates: identityUnresolvedCandidates.length,
    unknownTimeCandidates: unknownTime.length,
    overlapRate: evaluatedCandidates ? overlappingCandidates.length / evaluatedCandidates : 0,
    bySource,
  };
}

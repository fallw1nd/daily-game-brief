export function resolveEvidencePublishedAt({
  metadataPublishedAt = null,
  visiblePublishedAt = null,
  listingPublishedAt = null,
} = {}) {
  return metadataPublishedAt || visiblePublishedAt || listingPublishedAt || null;
}

export function classifyEvidenceReadiness(openedSources = []) {
  const opened = openedSources.filter((source) => source?.status === "opened" || source?.status === undefined);
  const hasPrimary = opened.some((source) => source.kind === "primary");
  const reliable = opened.filter((source) => source.kind === "primary" || source.kind === "secondary");
  const independentReliable = new Set(reliable.map((source) => source.independenceKey).filter(Boolean));
  const secondaryIndependent = new Set(
    opened.filter((source) => source.kind === "secondary").map((source) => source.independenceKey).filter(Boolean),
  );
  const hasDiscovery = opened.some((source) => source.kind === "discovery");

  if (hasPrimary && independentReliable.size >= 2) return "primary-plus-independent";
  if (hasPrimary) return "primary-only";
  if (secondaryIndependent.size >= 2) return "two-media-no-primary";
  if (secondaryIndependent.size === 1) return "single-media";
  if (hasDiscovery) return "discovery-only";
  return "no-opened-evidence";
}

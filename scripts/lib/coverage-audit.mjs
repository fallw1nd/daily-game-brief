import { normalizeHeadline } from "./news-pipeline.mjs";
import { mergeShowcaseRefs } from "./showcase.mjs";

function normalizedUrl(input) {
  try {
    const url = new URL(input);
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    return url.href.replace(/\/$/, "");
  } catch {
    return "";
  }
}

function isCovered(item, entries) {
  if (item.showcaseRefs?.length) {
    const published = mergeShowcaseRefs(entries.flatMap(entry => entry.showcaseRefs || []));
    return item.showcaseRefs.every(ref => {
      const match = published.find(candidate => candidate.showcaseId === ref.showcaseId && candidate.announcementId === ref.announcementId);
      const required = ref.factIds || (item.showcaseFacts || []).map(fact => fact.id);
      return Boolean(match) && required.every(id => match.factIds?.includes(id));
    });
  }
  const sourceUrls = new Set((item.sources || []).flatMap((source) => {
    const values = [source.url, source.canonicalUrl].map(normalizedUrl).filter(Boolean);
    return values;
  }));
  return entries.some((entry) => {
    if (entry.eventKey) return entry.eventKey === item.eventKey;
    // Legacy entries have no event identity. A shared game, article URL, or
    // similar headline alone cannot establish that the same fact was covered.
    const headline = normalizeHeadline(item.headline);
    return Boolean(headline) && headline === normalizeHeadline(entry.headline)
      && (entry.sources || []).some(source => sourceUrls.has(normalizedUrl(source.url)));
  });
}

function confidence(item) {
  const opened = (item.sources || []).filter((source) => source.status === "opened");
  const hasPrimary = opened.some((source) => source.kind === "primary");
  const independent = new Set(opened.filter((source) => source.kind !== "discovery")
    .map((source) => source.independenceKey || normalizedUrl(source.url)));
  if (item.timeRelation !== "window") return "out-of-window";
  if (item.tier === "A" && (hasPrimary || independent.size >= 2)) return "high";
  if (opened.length && item.tier !== "C") return "review";
  return "insufficient";
}

export function auditCoverage(evidence, edition, { decisions = [], decisionDigest = null } = {}) {
  if (!edition) {
    return {
      status: "edition-missing",
      editionId: evidence.window?.id || null,
      totals: { packages: evidence.packages?.length || 0, covered: 0, highConfidenceOmissions: 0, reviewOmissions: 0 },
      omissions: [],
    };
  }
  const boundDecisions = decisionDigest && decisionDigest === edition.sourceReport?.editorialDecisionDigest
    ? new Map(decisions.map(decision => [decision.eventKey, decision])) : new Map();
  const assessed = (evidence.packages || []).map((item) => ({
    eventKey: item.eventKey,
    headline: item.headline,
    tier: item.tier,
    readiness: item.readiness,
    confidence: confidence(item),
    covered: isCovered(item, edition.entries || []),
    disposition: boundDecisions.get(item.eventKey)?.decision || null,
    reason: boundDecisions.get(item.eventKey)?.reason || null,
    sourceUrls: (item.sources || []).filter((source) => source.status === "opened").map((source) => source.url),
  }));
  const omissions = assessed.filter((item) => !item.covered && item.disposition !== "exclude" && ["high", "review"].includes(item.confidence));
  return {
    status: "audited",
    editionId: edition.id,
    totals: {
      packages: assessed.length,
      covered: assessed.filter((item) => item.covered).length,
      explicitlyExcluded: assessed.filter(item => !item.covered && item.disposition === "exclude").length,
      awaitingReview: assessed.filter(item => !item.covered && item.disposition === "needs_review").length,
      highConfidenceOmissions: omissions.filter((item) => item.confidence === "high").length,
      reviewOmissions: omissions.filter((item) => item.confidence === "review").length,
    },
    omissions,
    assessed,
  };
}

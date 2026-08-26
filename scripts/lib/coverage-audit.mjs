import { normalizeHeadline } from "./news-pipeline.mjs";

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

function entryText(entry) {
  return normalizeHeadline([
    entry.title?.title_zh_cn,
    entry.title?.title_en,
    entry.title?.title_ja,
    entry.headline,
  ].filter(Boolean).join(" "));
}

function isCovered(item, entries) {
  const sourceUrls = new Set((item.sources || []).flatMap((source) => {
    const values = [source.url, source.canonicalUrl].map(normalizedUrl).filter(Boolean);
    return values;
  }));
  const subject = normalizeHeadline(item.subjectKey || "");
  const headlineTokens = normalizeHeadline(item.headline).split(" ").filter((token) => token.length >= 4);
  return entries.some((entry) => {
    if ((entry.sources || []).some((source) => sourceUrls.has(normalizedUrl(source.url)))) return true;
    const text = entryText(entry);
    if (subject && subject.length >= 4 && text.includes(subject)) return true;
    if (headlineTokens.length < 2) return false;
    const shared = headlineTokens.filter((token) => text.includes(token)).length;
    return shared >= Math.min(3, headlineTokens.length) && shared / headlineTokens.length >= 0.6;
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

export function auditCoverage(evidence, edition) {
  if (!edition) {
    return {
      status: "edition-missing",
      editionId: evidence.window?.id || null,
      totals: { packages: evidence.packages?.length || 0, covered: 0, highConfidenceOmissions: 0, reviewOmissions: 0 },
      omissions: [],
    };
  }
  const assessed = (evidence.packages || []).map((item) => ({
    eventKey: item.eventKey,
    headline: item.headline,
    tier: item.tier,
    readiness: item.readiness,
    confidence: confidence(item),
    covered: isCovered(item, edition.entries || []),
    sourceUrls: (item.sources || []).filter((source) => source.status === "opened").map((source) => source.url),
  }));
  const omissions = assessed.filter((item) => !item.covered && ["high", "review"].includes(item.confidence));
  return {
    status: "audited",
    editionId: edition.id,
    totals: {
      packages: assessed.length,
      covered: assessed.filter((item) => item.covered).length,
      highConfidenceOmissions: omissions.filter((item) => item.confidence === "high").length,
      reviewOmissions: omissions.filter((item) => item.confidence === "review").length,
    },
    omissions,
  };
}

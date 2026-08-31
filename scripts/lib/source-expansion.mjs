import { normalizeHeadline } from "./news-pipeline.mjs";

const chinaPattern = /(?:中国|国产|腾讯|网易|米哈游|叠纸|鹰角|莉莉丝|完美世界|Bilibili|哔哩哔哩)/i;
const significantKinds = new Set(["delay", "release-date", "launch", "company", "result"]);

function addAlias(index, value, titleKey) {
  const normalized = normalizeHeadline(value || "");
  if (normalized.length < 4) return;
  const existing = index.get(normalized);
  if (!existing) index.set(normalized, titleKey);
  else if (existing !== titleKey) index.set(normalized, null);
}

export function buildTitleAliasIndex(registry = {}) {
  const index = new Map();
  for (const [titleKey, item] of Object.entries(registry.translations || {})) {
    addAlias(index, titleKey.replaceAll("-", " "), titleKey);
    addAlias(index, item.titleZhCn, titleKey);
    for (const alias of item.titleEnAliases || []) addAlias(index, alias, titleKey);
  }
  return index;
}

export function resolveKnownSubjectKey(headline, aliasIndex) {
  const normalized = normalizeHeadline(headline || "");
  if (!normalized) return null;
  const aliases = [...aliasIndex.entries()]
    .filter(([, titleKey]) => titleKey)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [alias, titleKey] of aliases) {
    if (normalized === alias || normalized.includes(alias)) return titleKey;
  }
  return null;
}

export function candidateSignals(candidate) {
  const source = candidate.source || {};
  const reliability = source.reliability || (source.group === "official" || source.group === "event" ? "primary" : source.group === "media" ? "high" : "discovery");
  const independentCount = candidate.independentSources?.length || 1;
  let evidenceConfidence = reliability === "primary" ? 85 : reliability === "high" ? 65 : reliability === "normal" ? 50 : 30;
  if (candidate.publishedAt) evidenceConfidence += 5;
  evidenceConfidence += Math.min(10, Math.max(0, independentCount - 1) * 5);

  let editorialSignificance = significantKinds.has(candidate.eventKind) ? 70 : candidate.eventKind === "announcement" ? 55 : candidate.eventKind === "update" || candidate.eventKind === "dlc" ? 45 : 30;
  if (/(?:acquisition|layoff|lawsuit|政策|收购|裁员|诉讼|優勝|冠军|获奖)/i.test(candidate.headline || "")) editorialSignificance = Math.max(editorialSignificance, 80);
  const audienceRelevance = chinaPattern.test(candidate.headline || "") ? 80 : 50;
  return {
    evidenceConfidence: Math.min(100, evidenceConfidence),
    editorialSignificance: Math.min(100, editorialSignificance),
    audienceRelevance,
  };
}

export function candidateLane(candidate) {
  const capabilities = candidate.source?.capabilities || [];
  if (capabilities.includes("industry") || candidate.eventKind === "company") return "industry";
  if (capabilities.includes("reviews")) return "reviews";
  if (capabilities.includes("interviews")) return "interviews";
  if (capabilities.includes("rumors")) return "rumors";
  if (capabilities.includes("releases") || ["release-date", "launch"].includes(candidate.eventKind)) return "releases";
  return capabilities[0] || "news";
}

export function publisherFamily(candidate) {
  return candidate.source?.publisherFamily || candidate.source?.independenceKey || candidate.source?.id || "unknown";
}

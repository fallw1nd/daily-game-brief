import { normalizeHeadline } from "./news-pipeline.mjs";

const chinaPattern = /(?:中国|国产|腾讯|网易|米哈游|叠纸|鹰角|莉莉丝|完美世界|Bilibili|哔哩哔哩)/i;
const significantKinds = new Set(["cancel", "delay", "release-date", "launch", "company", "result", "review-score"]);
const awardPattern = /\b(?:award|awards|winner|winners|nominee|nominees|nomination|nominations|finalist|finalists|shortlist|longlist|entries open|submissions open)\b|奖项|大奖|获奖|提名|入围|长名单|短名单|报名|優勝|受賞|ノミネート/i;
const interviewPattern = /\b(?:interview|interviews|q&a|conversation with)\b|专访|采访|访谈|群访|对谈|インタビュー/i;
const reviewPattern = /\b(?:review|reviews|hands-on|impressions)\b|评测|试玩体验|体验报告|レビュー|プレイレポ/i;
const rumorPattern = /\b(?:rumou?r|leak|leaked|insider)\b|传闻|爆料|泄漏|泄露|リーク/i;
const industryPattern = /\b(?:industry|business|earnings|revenue|acquisition|layoff|lawsuit|policy|regulation|publisher|studio closure)\b|行业|产业|业界|财报|营收|收购|裁员|诉讼|监管|发行商|工作室关闭/i;
const releasePattern = /\b(?:release date|launch date|launches|available now|released)\b|发售日|上线|现已推出|定档|発売日|配信開始/i;
const platformSubjectRules = [
  {
    key: "state-of-play",
    sourceKeys: new Set(["sony-interactive-entertainment"]),
    pattern: /\bstate of play\b/i,
  },
];

function addAlias(index, value, titleKey) {
  const normalized = normalizeHeadline(value || "");
  const compactLength = normalized.replaceAll(" ", "").length;
  if (compactLength < 2) return;
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

export function resolveKnownSubjectKey(headline, aliasIndex, source = null) {
  const normalized = normalizeHeadline(headline || "");
  if (!normalized) return null;
  const aliases = [...aliasIndex.entries()]
    .filter(([, titleKey]) => titleKey)
    .sort((a, b) => b[0].length - a[0].length);
  for (const [alias, titleKey] of aliases) {
    if (normalized === alias || normalized.includes(alias)) return titleKey;
  }
  const sourceKey = source?.independenceKey || source?.publisherFamily || null;
  for (const rule of platformSubjectRules) {
    if (sourceKey && rule.sourceKeys.has(sourceKey) && rule.pattern.test(normalized)) return rule.key;
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
  if (candidate.eventKind === "review-score") editorialSignificance = Math.max(editorialSignificance, 80);
  if (awardPattern.test(candidate.headline || "")) editorialSignificance = Math.max(editorialSignificance, 70);
  if (industryPattern.test(candidate.headline || "")) editorialSignificance = Math.max(editorialSignificance, 75);
  if (/(?:acquisition|layoff|lawsuit|政策|收购|裁员|诉讼)/i.test(candidate.headline || "")) editorialSignificance = Math.max(editorialSignificance, 80);
  const audienceRelevance = chinaPattern.test(candidate.headline || "") ? 80 : 50;
  return {
    evidenceConfidence: Math.min(100, evidenceConfidence),
    editorialSignificance: Math.min(100, editorialSignificance),
    audienceRelevance,
  };
}

export function candidateLane(candidate) {
  const source = candidate.source || {};
  const capabilities = source.capabilities || [];
  const headline = candidate.headline || "";

  if (candidate.eventKind === "review-score") return "reviews";
  if (source.defaultLane === "awards" || awardPattern.test(headline)) return "awards";
  if (capabilities.includes("interviews") && interviewPattern.test(headline)) return "interviews";
  if (capabilities.includes("reviews") && reviewPattern.test(headline)) return "reviews";
  if (capabilities.includes("rumors") && rumorPattern.test(headline)) return "rumors";
  if (capabilities.includes("industry") && (industryPattern.test(headline) || candidate.eventKind === "company")) return "industry";
  if (capabilities.includes("releases") && (releasePattern.test(headline) || ["release-date", "launch"].includes(candidate.eventKind))) return "releases";

  if (source.defaultLane && capabilities.includes(source.defaultLane)) return source.defaultLane;
  if (candidate.eventKind === "company") return "industry";
  if (["release-date", "launch"].includes(candidate.eventKind)) return "releases";
  if (capabilities.includes("features") && candidate.eventKind === "other") return "features";
  return capabilities[0] || "news";
}

export function publisherFamily(candidate) {
  return candidate.source?.publisherFamily || candidate.source?.independenceKey || candidate.source?.id || "unknown";
}

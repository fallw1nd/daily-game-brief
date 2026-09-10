import { classifyTitleSource } from "./title-knowledge.mjs";
import { getRegisteredTitleTranslation } from "./title-translations.mjs";

export function normalizeTitleHintText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .trim();
}

export function titleKeyFromSubject(subjectKey) {
  return String(subjectKey || "")
    .normalize("NFKC")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function needsTitleLookup(subjectKey, eventKind) {
  if (!subjectKey) return false;
  const subject = String(subjectKey).trim();
  if (!/[a-z\u3040-\u30ff]/i.test(subject)) return false;
  const key = titleKeyFromSubject(subject);
  return !getRegisteredTitleTranslation(key, subject);
}

function excerptAround(text, needle, maxChars = 320) {
  const value = String(text || "");
  const index = value.indexOf(needle);
  if (index < 0) return "";
  const before = Math.floor((maxChars - needle.length) / 2);
  const start = Math.max(0, Math.min(index - before, value.length - maxChars));
  return value.slice(start, start + maxChars).trim();
}

export function selectTitleHintSubjects(evidence, limit = 20) {
  const seen = new Set();
  const selected = [];
  for (const item of [...(evidence?.packages || []), ...(evidence?.showcaseAnnouncements || []), ...(evidence?.upcoming || []).map(item => ({ ...item, subjectKey: item.title?.title_en || item.titleEn, titleKey: item.title?.title_key || item.titleKey })), ...(evidence?.pendingTitles || [])]) {
    const subjectKey = String(item?.subjectKey || "").trim();
    const normalized = subjectKey.toLocaleLowerCase("en-US");
    if (!needsTitleLookup(subjectKey, item?.eventKind) || seen.has(normalized)) continue;
    seen.add(normalized);
    selected.push({
      subjectKey,
      titleKey: item.titleKey || titleKeyFromSubject(subjectKey),
      headline: item?.headline || "",
      eventKind: item?.eventKind || "other",
      ...((item?.eventKey || item?.id) ? { eventKey: item.eventKey || item.id } : {}),
      subjectType: item?.eventKind === "company" ? "entity" : "game",
    });
    if (selected.length >= limit) break;
  }
  return selected;
}

export function validateTitleHintCandidate(subject, candidate, verifiedSources = []) {
  const titleZhCn = typeof candidate?.titleZhCn === "string" ? candidate.titleZhCn.trim() : "";
  const suggestedStatus = candidate?.suggestedStatus;
  if (!titleZhCn || !/[\u3400-\u9fff]/u.test(titleZhCn)) return null;
  if (!new Set(["official_simplified", "common_translation"]).has(suggestedStatus)) return null;

  const sources = verifiedSources.flatMap((source) => {
    const pageText = String(source?.pageText || "");
    if (!source?.url?.startsWith("https://") || !pageText.includes(titleZhCn)) return [];
    const classification = classifyTitleSource(source, subject, titleZhCn);
    if (!classification || classification.kind === "unverified_locale") return [];
    const { pageText: _pageText, ...safeSource } = source;
    return [{ ...safeSource, ...classification, excerpt: excerptAround(pageText, titleZhCn) }];
  });
  const independentHosts = new Set(sources.map((source) => source.family));
  if (!sources.length) return null;
  if (suggestedStatus === "official_simplified" && !sources.some(source => source.kind === "official_simplified")) return null;
  if (suggestedStatus === "common_translation" && independentHosts.size < 2) return null;

  return {
    autoAdoptable: true,
    subjectType: subject.subjectType || "game",
    titleEn: subject.titleEn || subject.subjectKey,
    subjectKey: subject.subjectKey,
    titleKey: subject.titleKey,
    titleZhCn,
    suggestedStatus,
    reason: typeof candidate.reason === "string" ? candidate.reason.slice(0, 400) : "",
    sources: sources.slice(0, 3).map((source) => ({
      label: source.label || new URL(source.url).hostname,
      url: source.url,
      hostname: new URL(source.url).hostname.toLowerCase(),
      family: source.family,
      kind: source.kind,
      pageTitle: source.pageTitle || "",
      excerpt: source.excerpt,
    })),
  };
}

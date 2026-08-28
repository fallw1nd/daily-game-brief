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
  if (!subjectKey || eventKind === "company") return false;
  const subject = String(subjectKey).trim();
  if (!/[a-z]/i.test(subject) || /[\u3400-\u9fff]/u.test(subject)) return false;
  const key = titleKeyFromSubject(subject);
  return !getRegisteredTitleTranslation(key, subject);
}

export function selectTitleHintSubjects(evidence, limit = 8) {
  const seen = new Set();
  const selected = [];
  for (const item of evidence?.packages || []) {
    const subjectKey = String(item?.subjectKey || "").trim();
    const normalized = subjectKey.toLocaleLowerCase("en-US");
    if (!needsTitleLookup(subjectKey, item?.eventKind) || seen.has(normalized)) continue;
    seen.add(normalized);
    selected.push({
      subjectKey,
      titleKey: titleKeyFromSubject(subjectKey),
      headline: item?.headline || "",
      eventKind: item?.eventKind || "other",
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

  const titleNeedle = normalizeTitleHintText(titleZhCn);
  const sources = verifiedSources.filter((source) =>
    source?.url?.startsWith("https://") &&
    normalizeTitleHintText(source?.pageText).includes(titleNeedle)
  ).map(({ pageText: _pageText, ...source }) => source);
  const independentHosts = new Set(sources.map((source) => new URL(source.url).hostname.toLowerCase()));
  if (!sources.length) return null;
  if (suggestedStatus === "common_translation" && independentHosts.size < 2) return null;

  return {
    subjectKey: subject.subjectKey,
    titleKey: subject.titleKey,
    titleZhCn,
    suggestedStatus,
    reason: typeof candidate.reason === "string" ? candidate.reason.slice(0, 400) : "",
    sources: sources.slice(0, 3).map((source) => ({
      label: source.label || new URL(source.url).hostname,
      url: source.url,
      hostname: new URL(source.url).hostname.toLowerCase(),
      pageTitle: source.pageTitle || "",
      excerpt: source.excerpt || "",
    })),
  };
}

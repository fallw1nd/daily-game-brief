import { namedNewGameSubject, normalizeHeadline } from "./news-pipeline.mjs";

// Repair only an explicit creator-of-old-work announces-new-work construction,
// corroborated by a separate affirmative sentence in already-opened evidence.
// This supplies identity, never new facts, sources or publication authority.
export function confirmedNewGameSubject(candidate, sources) {
  const name = namedNewGameSubject(candidate?.headline || "");
  if (!name) return null;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const announced = new RegExp(`[『《]${escaped}[』》]を発表した`, "u");
  const corroborated = (sources || []).some(source => source.status === "opened"
    && String(source.evidenceText || "").split(/[。！？\n]/u).some(sentence =>
      announced.test(sentence)
      && !/予定|計画|検討|構想|噂|未定|否定|していない|ではない|との噂|という噂|誤報|誤り|訂正|撤回|取り消/u.test(sentence)));
  return corroborated ? { subjectKey: normalizeHeadline(name), canonicalSubjectKey: null, eventKind: "announcement" } : null;
}

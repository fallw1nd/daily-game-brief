import { normalizeHeadline } from "./news-pipeline.mjs";

// Only explicit named-company formation constructions, independently present in
// the headline and an opened body. Prior games in a creator biography are not
// the subject of a company announcement. This does not establish event facts.
function namedCompanies(text) {
  const patterns = [
    /(?:新会社|株式会社)\s*[「“"]([^」”"\n]{2,80})[」”"](?:の|を)?設立/gu,
    /(?:成立|创立)(?:了)?新公司\s*[「“"]([^」”"\n]{2,80})[」”"]/gu,
    /\b(?:founded?|established?)\s+(?:a\s+)?(?:new\s+)?(?:company|studio)\s+[“"]([^”"\n]{2,80})[”"]/giu,
  ];
  return [...new Set(patterns.flatMap(pattern => [...String(text || "").matchAll(pattern)].map(match => match[1].trim())))];
}

function confirmsCompany(body, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const japanese = new RegExp(`(?:株式会社|新会社)\\s*[「“"]?${escaped}[」”"]?(?:の|を)?設立`, "iu");
  const english = new RegExp(`\\b${escaped}\\s+(?:was|has been)\\s+(?:founded|established)\\b`, "iu");
  return String(body || "").split(/[。！？\n]|(?<=[.!?])\s+/u).some(sentence => {
    if (/予定|計画|検討|構想|噂|未定|否定|していない|计划|打算|尚未|并未|传闻|\b(?:may|might|will|plans?|rumou?r|not|denies?|denied)\b/iu.test(sentence)) return false;
    return japanese.test(sentence) || english.test(sentence)
      || namedCompanies(sentence).some(candidate => normalizeHeadline(candidate) === normalizeHeadline(name));
  });
}

export function confirmedCompanySubject(candidate, sources) {
  const names = namedCompanies(candidate?.headline);
  if (names.length !== 1) return null;
  const [name] = names;
  const opened = (sources || []).filter(source => source.status === "opened");
  if (!opened.some(source => confirmsCompany(source.evidenceText, name))) return null;
  return { subjectKey: normalizeHeadline(name), canonicalSubjectKey: null, eventKind: "company", lane: "industry" };
}

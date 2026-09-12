import { getRegisteredTitleTranslation } from "./title-translations.mjs";

function normalize(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function containsName(text, name) {
  const needle = normalize(name);
  if (needle.length < 2) return false;
  const haystack = normalize(text);
  return /[\u3400-\u9fff]/u.test(needle)
    ? haystack.includes(needle)
    : new RegExp(`(^|[^a-z0-9])${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^a-z0-9])`, "u").test(haystack);
}

// Only identities already established by the evidence/title decision are used.
export function normalizeSubjectHeadline(headline, title, { locale = "zh", entities = [], archive = false } = {}) {
  if (typeof headline !== "string" || !headline.trim()) return headline;
  const name = locale === "en" ? title?.title_en : title?.title_zh_cn || title?.title_en;
  if (!title?.title_key || !name?.trim()) throw new Error("headline subject is missing a confirmed title identity");
  const registered = getRegisteredTitleTranslation(title.title_key, title.title_en);
  const aliases = [title.title_en, ...(locale === "en" ? [] : [title.title_zh_cn, title.title_ja]), ...(registered?.titleEnAliases || [])];
  if (aliases.some(alias => containsName(headline, alias))) return headline;
  // An institution mentioned in a time clause or platform suffix is not the headline's subject.
  if (entities.some(entity => {
    const value = normalize(entity);
    const text = normalize(headline);
    return value.length >= 2 && text.startsWith(value) && !/^(?:[a-z0-9]|\s*(?:结束后|之后|期间|版|版本|after\b|during\b|version\b))/i.test(text.slice(value.length));
  })) return headline;
  // Preserve the degraded marker at the start: recovery uses it to identify placeholders.
  const marker = headline.match(/^\[自动事实清单\]\s*/)?.[0] || "";
  const rest = headline.slice(marker.length);
  const prefix = archive ? rest.match(/^(?:日报｜|早报｜|晚报｜|Daily Brief\s*\|\s*|Morning Brief\s*\|\s*|Evening Brief\s*\|\s*)/)?.[0] || "" : "";
  const subject = locale === "en" || registered?.subjectType === "entity" ? name : `《${name}》`;
  return `${marker}${prefix}${subject}${locale === "en" ? ": " : "："}${rest.slice(prefix.length)}`;
}

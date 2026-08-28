import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const registryPath = resolve("config/title-translations.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
export const titleTranslations = Object.freeze(registry.translations ?? {});

function normalizedAlias(value) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ").toLowerCase() : "";
}

export function getRegisteredTitleTranslation(titleKey, titleEn = null) {
  if (typeof titleKey === "string" && titleKey.trim() && titleTranslations[titleKey]) return titleTranslations[titleKey];
  const alias = normalizedAlias(titleEn);
  if (!alias) return null;
  return Object.values(titleTranslations).find((item) =>
    (item.titleEnAliases || []).some((candidate) => normalizedAlias(candidate) === alias)
  ) ?? null;
}

export function resolveTitleTranslation({ titleKey, titleZhCn = null, titleZhStatus = "unavailable", titleEn = null }) {
  const explicitZh = typeof titleZhCn === "string" ? titleZhCn.trim() : "";
  if (titleZhStatus !== "unavailable" && explicitZh) {
    return { titleKey, titleZhCn: explicitZh, titleEn, titleZhStatus, source: "editorial" };
  }
  const registered = getRegisteredTitleTranslation(titleKey, titleEn);
  if (registered?.titleZhCn && registered?.titleZhStatus) {
    return { titleKey, titleZhCn: registered.titleZhCn, titleEn, titleZhStatus: registered.titleZhStatus, source: "registry" };
  }
  return { titleKey, titleZhCn: null, titleEn, titleZhStatus: "unavailable", source: "original" };
}

function titlePairs(titleEn, titleZhCn) {
  if (typeof titleEn !== "string" || typeof titleZhCn !== "string") return [];
  const enParts = titleEn.split(/\s*\/\s*/).map((value) => value.trim()).filter(Boolean);
  const zhParts = titleZhCn.split(/\s*\/\s*/).map((value) => value.trim()).filter(Boolean);
  if (enParts.length > 1 && enParts.length === zhParts.length) return enParts.map((english, index) => [english, zhParts[index]]);
  return [[titleEn.trim(), titleZhCn.trim()]];
}

export function localizeRegisteredTitles(text) {
  if (typeof text !== "string" || !text) return text;
  const pairs = Object.values(titleTranslations).flatMap((item) => {
    const chinese = typeof item.titleZhCn === "string" ? item.titleZhCn.trim() : "";
    if (!chinese) return [];
    return (item.titleEnAliases || []).map((english) => [String(english).trim(), chinese]);
  }).filter(([english, chinese]) => english && chinese && english !== chinese)
    .sort((a, b) => b[0].length - a[0].length);
  let localized = text;
  for (const [english, chinese] of pairs) localized = localized.split(english).join(chinese);
  return localized;
}

export function localizeHeadline(headline, { titleEn = null, titleZhCn = null } = {}) {
  if (typeof headline !== "string" || !headline || !titleZhCn) return headline;
  let localized = headline;
  for (const [english, chinese] of titlePairs(titleEn, titleZhCn).sort((a, b) => b[0].length - a[0].length)) {
    if (!english || !chinese || english === chinese) continue;
    localized = localized.split(english).join(chinese);
  }
  return localized;
}

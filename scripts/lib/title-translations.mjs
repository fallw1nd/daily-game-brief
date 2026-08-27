import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const registryPath = resolve("config/title-translations.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));

export const titleTranslations = Object.freeze(registry.translations ?? {});

export function getRegisteredTitleTranslation(titleKey) {
  if (typeof titleKey !== "string" || !titleKey.trim()) return null;
  return titleTranslations[titleKey] ?? null;
}

export function resolveTitleTranslation({
  titleKey,
  titleZhCn = null,
  titleZhStatus = "unavailable",
  titleEn = null,
}) {
  const explicitZh = typeof titleZhCn === "string" ? titleZhCn.trim() : "";
  if (titleZhStatus !== "unavailable" && explicitZh) {
    return {
      titleKey,
      titleZhCn: explicitZh,
      titleEn,
      titleZhStatus,
      source: "editorial",
    };
  }

  const registered = getRegisteredTitleTranslation(titleKey);
  if (registered?.titleZhCn && registered?.titleZhStatus) {
    return {
      titleKey,
      titleZhCn: registered.titleZhCn,
      titleEn,
      titleZhStatus: registered.titleZhStatus,
      source: "registry",
    };
  }

  return {
    titleKey,
    titleZhCn: null,
    titleEn,
    titleZhStatus: "unavailable",
    source: "original",
  };
}

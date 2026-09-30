import { adoptTitleHints } from "./title-knowledge.mjs";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const registryPath = resolve("config/title-translations.json");
const registry = JSON.parse(readFileSync(registryPath, "utf8"));
export let titleTranslations = Object.freeze(registry.translations ?? {});

function normalizedAlias(value) {
  return typeof value === "string" ? value.replace(/[™®]/g, "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim() : "";
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
  const preferred = getRegisteredTitleTranslation(titleKey, titleEn);
  if (preferred?.evidence?.kind === "user_provided") return { titleKey, titleZhCn: preferred.titleZhCn, titleEn, titleZhStatus: preferred.titleZhStatus, source: "registry" };
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

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function explicitTitleContentMatches(text, start, end, alias) {
  const open = text.lastIndexOf("《", start);
  const close = text.lastIndexOf("》", start);
  if (open <= close) return false;
  const markerEnd = text.indexOf("》", end);
  if (markerEnd === -1) return false;
  return normalizedAlias(text.slice(open + 1, markerEnd)) === normalizedAlias(alias);
}

function hasUnknownSequelSuffix(text, end) {
  if (/^\s*[:–—：]\s*\p{Script=Latin}/u.test(text.slice(end))) return true;
  const suffix = text.slice(end).match(/^\s*(?:[-–—:]\s*)?(\d+|[IVXLCDM]+)(?![\p{Script=Latin}\p{N}])/iu);
  if (!suffix) return false;
  const token = suffix[1].toUpperCase();
  if (/^\d+$/.test(token)) return true;
  return /^(?=.+$)M{0,3}(?:CM|CD|D?C{0,3})(?:XC|XL|L?X{0,3})(?:IX|IV|V?I{0,3})$/u.test(token);
}

function isInsideExistingTranslation(text, start, end, translations) {
  return translations.some((translation) => {
    let offset = text.indexOf(translation);
    while (offset !== -1) {
      if (start >= offset && end <= offset + translation.length) return true;
      offset = text.indexOf(translation, offset + 1);
    }
    return false;
  });
}

function singleWordAlias(alias) {
  return !/\s/u.test(alias.trim());
}

function localizeTitleMentions(text, entries, { explicitSubjectAliases = new Set() } = {}) {
  const candidates = new Map();
  for (const [alias, chinese] of entries) {
    const key = alias.trim();
    if (!key || !chinese || key.toLocaleLowerCase() === chinese.toLocaleLowerCase()) continue;
    const normalized = key.normalize("NFKC").toLocaleLowerCase();
    const candidate = candidates.get(normalized) || { aliases: new Set(), translations: new Set() };
    candidate.aliases.add(key);
    candidate.translations.add(chinese);
    candidates.set(normalized, candidate);
  }

  const aliases = [...candidates.values()].flatMap((candidate) => [...candidate.aliases])
    .sort((a, b) => b.length - a.length);
  if (!aliases.length) return text;
  const knownTranslations = [...new Set([...candidates.values()].flatMap((candidate) => [...candidate.translations]))];

  const latinOrNumber = String.raw`[\p{Script=Latin}\p{N}\p{M}]`;
  const matcher = new RegExp(`(?<!${latinOrNumber})(${aliases.map(escapeRegExp).join("|")})(?!${latinOrNumber})`, "giu");
  return text.replace(matcher, (fullMatch, matchedAlias, offset) => {
    const start = offset;
    const end = start + matchedAlias.length;
    const normalized = matchedAlias.normalize("NFKC").toLocaleLowerCase();
    const candidate = candidates.get(normalized);
    if (!candidate || candidate.translations.size !== 1 || hasUnknownSequelSuffix(text, end) || isInsideExistingTranslation(text, start, end, knownTranslations)) return fullMatch;
    const enclosedByExactTitle = explicitTitleContentMatches(text, start, end, matchedAlias);
    if (singleWordAlias(matchedAlias) && !explicitSubjectAliases.has(normalized) && !enclosedByExactTitle) return fullMatch;
    if (text.lastIndexOf("《", start) > text.lastIndexOf("》", start) && !enclosedByExactTitle) return fullMatch;
    return candidate.translations.values().next().value;
  });
}

export function localizeRegisteredTitles(text, { translations = titleTranslations, titleEn = null, titleZhCn = null } = {}) {
  if (typeof text !== "string" || !text) return text;
  const pairs = Object.values(translations).flatMap((item) => {
    const chinese = typeof item.titleZhCn === "string" ? item.titleZhCn.trim() : "";
    if (!chinese) return [];
    return (item.titleEnAliases || []).map((english) => [String(english).trim(), chinese]);
  });
  const subjectPairs = titlePairs(titleEn, titleZhCn);
  const subjectAliases = new Set(subjectPairs.map(([english]) => english.normalize("NFKC").toLocaleLowerCase()));
  const unambiguousPairs = pairs.filter(([english]) => !subjectAliases.has(english.normalize("NFKC").toLocaleLowerCase()));
  const explicitSubjectAliases = new Set(subjectPairs.map(([english]) => english.normalize("NFKC").toLocaleLowerCase()));
  return localizeTitleMentions(text, [...unambiguousPairs, ...subjectPairs], { explicitSubjectAliases });
}

export function localizeHeadline(headline, { titleEn = null, titleZhCn = null } = {}) {
  if (typeof headline !== "string" || !headline || !titleZhCn) return headline;
  const pairs = titlePairs(titleEn, titleZhCn);
  const explicitSubjectAliases = new Set(pairs.map(([english]) => english.normalize("NFKC").toLocaleLowerCase()));
  return localizeTitleMentions(headline, pairs, { explicitSubjectAliases });
}

export function persistVerifiedTitleHints(hints) {
  const current = JSON.parse(readFileSync(registryPath, "utf8"));
  const next = adoptTitleHints(current, hints || []);
  if (JSON.stringify(next.translations) === JSON.stringify(current.translations)) return false;
  writeFileSync(registryPath, JSON.stringify(next, null, 2) + "\n");
  titleTranslations = Object.freeze(next.translations);
  return true;
}

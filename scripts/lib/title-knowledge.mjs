import { resolve } from "node:path";
import { readFileSync } from "node:fs";
const normalizeIdentity = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim();

const config = JSON.parse(readFileSync(resolve("config/title-evidence-sources.json")));

// A nearby occurrence is not evidence of a translation: it may name a base
// game, sequel, edition, or related story. Compare complete bilingual labels.
function hasBoundTitlePair(text, identity, chinese) {
  const expected = normalizeIdentity(identity);
  const proposed = normalizeIdentity(chinese);
  if (!expected || !proposed) return false;
  const matches = (left, right) => {
    const a = normalizeIdentity(left);
    const b = normalizeIdentity(right);
    return (a === expected && b === proposed) || (a === proposed && b === expected);
  };
  // Explicit title markers may occur in prose. Keep the entire enclosed name
  // so punctuation, sequel numbers and edition subtitles cannot be truncated.
  for (const pair of text.matchAll(/《([^《》\n]+)》[ \t]*[（(]([^()（）\n]+)[)）]/gu)) {
    if (matches(pair[1], pair[2])) return true;
  }
  // Unmarked names must form a complete line, not a slice of arbitrary prose.
  // This deliberately leaves ambiguous pages for review instead of persisting
  // a guessed identity. Whitespace/punctuation variants still compare normally.
  for (const line of text.split(/[\r\n]+/u)) {
    const pair = line.trim().match(/^([^()（）\n]+)[（(]([^()（）\n]+)[)）][.!。！]?$/u);
    if (pair && matches(pair[1], pair[2])) return true;
    const normalized = normalizeIdentity(line);
    if (normalized === `${expected} ${proposed}` || normalized === `${proposed} ${expected}`) return true;
  }
  return false;
}

export function classifyTitleSource(source, subject, chinese, rules = config.sources) {
  const url = new URL(source.url);
  const rule = rules.find(item => item.hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)));
  if (!rule) return null;
  if (rule.kind === "media" && /(?:^|\.)(?:bbs|forum|forums|tieba)\.|\/(?:bbs|forum|forums|thread)(?:\/|-)/i.test(url.hostname + url.pathname)) return null;
  const text = String(source.pageText || "");
  if (!chinese || /转载自|本文转载|原文来自|本文来源于/.test(text)) return null;
  if (!hasBoundTitlePair(text, subject.titleEn || subject.subjectKey, chinese)) return null;
  const simplified = rule.kind === "official" && Boolean(rule.simplifiedPath && new RegExp(rule.simplifiedPath, "i").test(url.pathname + url.search));
  return { family: rule.family, kind: simplified ? "official_simplified" : rule.kind === "media" ? "media" : "unverified_locale" };
}

export function titleLookupDue(subject, record, now = Date.now()) {
  if (!record || record.titleEn !== (subject.titleEn || subject.subjectKey)) return true;
  if (subject.eventKind === "announcement" && subject.eventKey && subject.eventKey !== record.eventKey) return true;
  return !record.retryAt || Date.parse(record.retryAt) <= now;
}

export function titleLookupRecord(subject, outcome, now = Date.now()) {
  return { ...subject, titleEn: subject.titleEn || subject.subjectKey, outcome, checkedAt: new Date(now).toISOString(),
    retryAt: new Date(now + (outcome === "error" ? 6 * 3600000 : 7 * 86400000)).toISOString() };
}

export function adoptTitleHints(registry, hints, checkedAt = new Date().toISOString()) {
  const next = structuredClone(registry);
  const byKey = new Map();
  for (const hint of hints) {
    if (!hint.autoAdoptable) continue;
    const list = byKey.get(hint.titleKey) || []; list.push(hint); byKey.set(hint.titleKey, list);
  }
  for (const [key, candidates] of byKey) {
    const prior = next.translations[key];
    if (prior?.evidence?.kind === "user_provided" || prior?.titleZhStatus === "official_simplified") continue;
    const official = candidates.filter(item => item.suggestedStatus === "official_simplified");
    const eligible = official.length ? official : candidates;
    if (new Set(eligible.map(item => item.titleZhCn)).size !== 1) continue;
    const hint = eligible[0];
    if (prior?.titleZhCn && prior.titleZhCn !== hint.titleZhCn && !official.length) continue;
    next.translations[key] = { titleZhCn: hint.titleZhCn, titleZhStatus: hint.suggestedStatus,
      subjectType: hint.subjectType || prior?.subjectType || "game",
      titleEnAliases: [...new Set([...(prior?.titleEnAliases || []), hint.titleEn || hint.subjectKey])],
      evidence: { kind: "automated_verified", checkedAt, sources: hint.sources, note: hint.reason } };
  }
  next.updatedAt = checkedAt.slice(0, 10);
  return next;
}

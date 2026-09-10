import { resolve } from "node:path";
import { readFileSync } from "node:fs";
const normalizeIdentity = value => String(value || "").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, " ").trim();

const config = JSON.parse(readFileSync(resolve("config/title-evidence-sources.json")));

export function classifyTitleSource(source, subject, chinese, rules = config.sources) {
  const url = new URL(source.url);
  const rule = rules.find(item => item.hosts.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`)));
  if (!rule) return null;
  const text = String(source.pageText || "");
  const index = text.indexOf(chinese);
  if (index < 0 || /转载自|本文转载|原文来自|本文来源于/.test(text)) return null;
  const identity = subject.titleEn || subject.subjectKey;
  // Require the original full identity beside the proposed name, not in navigation/related stories.
  const context = text.slice(Math.max(0, index - 500), index + chinese.length + 500);
  const normalized = normalizeIdentity(context);
  const expected = normalizeIdentity(identity);
  if (!expected) return null;
  const escaped = expected.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (!new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`, "u").test(normalized)) return null;
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

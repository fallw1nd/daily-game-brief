import {
  isBoundaryMinute,
  resolveSelectedTimeEvidence,
  verifiedWindowTimeError,
} from "./time-window.mjs";
import { englishArchiveTitlePrefix } from "./edition-window.mjs";
import { validateJsonSchema } from "./json-schema.mjs";

const sections = ["releases", "reviews", "news", "industry", "features", "rumors", "observations"];
const factStatuses = ["official", "media_relay_official", "media_report", "multi_source_verified", "unconfirmed"];
const timeStatuses = ["verified", "date_only", "time_unverified", "uncertain"];
const titleZhStatuses = ["official_simplified", "official_traditional", "common_translation", "unavailable"];
const entryFlags = ["supplement", "rumor", "time_uncertain", "platform_difference", "region_difference"];

const sharedFactFrameSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    subjectTitleKey: { type: ["string", "null"] },
    dates: { type: "array", items: { type: "string" } },
    times: { type: "array", items: { type: "string" } },
    numbers: { type: "array", items: { type: "string" } },
    platforms: { type: "array", items: { type: "string" } },
    peopleAndEntities: { type: "array", items: { type: "string" } },
    versionsAndTerms: { type: "array", items: { type: "string" } },
  },
  required: ["subjectTitleKey", "dates", "times", "numbers", "platforms", "peopleAndEntities", "versionsAndTerms"],
};

const englishEntryDraftSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    eventKey: { type: "string" },
    headline: { type: "string" },
    summary: { type: "string" },
    verification: { type: "string" },
    timeNote: { type: "string" },
    regionLabel: { type: ["string", "null"] },
    releaseTypeLabel: { type: ["string", "null"] },
    sourceLabels: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: { sourceIndex: { type: "integer", minimum: 0 }, label: { type: "string" } },
        required: ["sourceIndex", "label"],
      },
    },
  },
  required: ["eventKey", "headline", "summary", "verification", "timeNote", "regionLabel", "releaseTypeLabel", "sourceLabels"],
};

const englishUpcomingDraftSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    upcomingId: { type: "string" },
    regionLabel: { type: ["string", "null"] },
    releaseTypeLabel: { type: ["string", "null"] },
    sourceLabel: { type: ["string", "null"] },
    coverAlt: { type: ["string", "null"] },
  },
  required: ["upcomingId", "regionLabel", "releaseTypeLabel", "sourceLabel", "coverAlt"],
};

export const editorialSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    contractVersion: { type: "integer", enum: [2] },
    packetBlobSha: { type: "string", pattern: "^[0-9a-f]{40}$" },
    editionId: { type: "string" },
    archiveTitle: { type: "string" },
    leadEventKey: { type: "string" },
    decisions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          eventKey: { type: "string" },
          decision: { type: "string", enum: ["include", "exclude", "needs_review"] },
          section: { type: ["string", "null"], enum: [...sections, null] },
          titleKey: { type: ["string", "null"] },
          titleZhCn: { type: ["string", "null"] },
          titleEn: { type: ["string", "null"] },
          titleZhStatus: { type: ["string", "null"], enum: [...titleZhStatuses, null] },
          headline: { type: ["string", "null"] },
          summary: { type: ["string", "null"] },
          factStatus: { type: ["string", "null"], enum: [...factStatuses, null] },
          timeStatus: { type: ["string", "null"], enum: [...timeStatuses, null] },
          entryFlags: { type: "array", items: { type: "string", enum: entryFlags } },
          tracking: { type: "boolean" },
          verification: { type: "string" },
          reason: { type: "string" },
          beijingTime: { type: ["string", "null"] },
          timeNote: { type: ["string", "null"] },
          platforms: { type: "array", items: { type: "string" } },
          region: { type: ["string", "null"] },
          releaseType: { type: ["string", "null"] },
          sourceIndexes: { type: "array", items: { type: "integer", minimum: 0 } },
          additionalSources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              properties: {
                label: { type: "string" },
                url: { type: "string" },
                kind: { type: "string", enum: ["primary", "secondary", "discovery"] },
              },
              required: ["label", "url", "kind"],
            },
          },
          sharedFactFrame: sharedFactFrameSchema,
        },
        required: [
          "eventKey", "decision", "section", "titleKey", "titleZhCn", "titleEn", "titleZhStatus",
          "headline", "summary", "factStatus", "timeStatus", "entryFlags", "tracking", "verification", "reason",
          "beijingTime", "timeNote", "platforms", "region", "releaseType", "sourceIndexes", "additionalSources",
        ],
      },
    },
    upcomingMode: { type: "string", enum: ["inherit_and_patch", "replace"] },
    removeUpcomingIds: { type: "array", items: { type: "string" } },
    upcoming: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          date: { type: "string" },
          titleKey: { type: "string" },
          titleZhCn: { type: ["string", "null"] },
          titleEn: { type: "string" },
          titleZhStatus: { type: "string", enum: titleZhStatuses },
          platforms: { type: "array", items: { type: "string" } },
          region: { type: "string" },
          releaseType: { type: "string" },
          source: {
            type: "object",
            additionalProperties: false,
            properties: {
              label: { type: "string" },
              url: { type: "string" },
              kind: { type: "string", enum: ["primary", "secondary"] },
            },
            required: ["label", "url", "kind"],
          },
          note: { type: "string" },
        },
        required: ["id", "date", "titleKey", "titleZhCn", "titleEn", "titleZhStatus", "platforms", "region", "releaseType", "source", "note"],
      },
    },
    locales: {
      type: "object",
      additionalProperties: false,
      properties: {
        en: {
          type: "object",
          additionalProperties: false,
          properties: {
            schemaVersion: { type: "integer", enum: [1] },
            locale: { type: "string", enum: ["en"] },
            archiveTitle: { type: "string" },
            entries: { type: "array", items: englishEntryDraftSchema },
            upcoming: { type: "array", items: englishUpcomingDraftSchema },
            sourceReport: {
              type: ["object", "null"],
              additionalProperties: false,
              properties: {
                checked: { type: "array", items: { type: "string" } },
                limited: { type: "array", items: { type: "string" } },
                note: { type: "string" },
              },
              required: ["checked", "limited", "note"],
            },
          },
          required: ["schemaVersion", "locale", "archiveTitle", "entries", "upcoming", "sourceReport"],
        },
      },
      required: ["en"],
    },
    checkedExtra: { type: "array", items: { type: "string" } },
    limitedExtra: { type: "array", items: { type: "string" } },
    editorialNote: { type: "string" },
  },
  required: [
    "contractVersion", "packetBlobSha", "editionId", "archiveTitle", "leadEventKey", "decisions", "upcomingMode", "removeUpcomingIds",
    "upcoming", "checkedExtra", "limitedExtra", "editorialNote",
  ],
};

export function buildEditorialInput(evidence, maxChars = 120000, ledger = null) {
  const packages = [];
  let usedChars = 0;
  const activeTracking = Object.values(ledger?.events || {}).filter((item) => item.tracking?.active === true);
  const activeKeys = new Set(activeTracking.map((item) => item.eventKey));
  const evidenceItems = [...(evidence.packages || [])].sort((a, b) => Number(activeKeys.has(b.eventKey)) - Number(activeKeys.has(a.eventKey)));
  const itemsWithOpenedEvidence = new Set(evidenceItems.filter((item) =>
    (item.sources || []).some((source) => source.status === "opened" && source.evidenceText)
  ).map((item) => item.eventKey));
  const trackingQueue = activeTracking.filter((item) => !itemsWithOpenedEvidence.has(item.eventKey)).map((item) => ({
    eventKey: item.eventKey,
    eventKind: item.eventKind,
    subjectKey: item.subjectKey,
    lastHeadline: item.lastHeadline,
    firstSeenAt: item.firstSeenAt,
    lastSeenAt: item.lastSeenAt,
    lastDecisionEdition: item.lastDecisionEdition,
    lastDecisionAt: item.lastDecisionAt,
    reason: item.tracking.reason,
    sourceUrls: item.sourceUrls || [],
  }));
  for (const item of trackingQueue) usedChars += JSON.stringify(item).length;
  if (usedChars > maxChars) throw new Error("active tracking queue exceeds the editorial input budget");

  let omitted = [];
  for (let itemIndex = 0; itemIndex < evidenceItems.length; itemIndex += 1) {
    const item = evidenceItems[itemIndex];
    const sources = (item.sources || []).flatMap((source, sourceIndex) => {
      if (source.status !== "opened" || !source.evidenceText) return [];
      return [{
        sourceIndex,
        status: "opened",
        kind: source.kind,
        independenceKey: source.independenceKey,
        label: source.label,
        url: source.url,
        publishedAt: source.publishedAt,
        canonicalUrl: source.canonicalUrl,
        imageUrl: source.imageUrl,
        declaredLanguage: source.declaredLanguage || "und",
        detectedLanguage: source.detectedLanguage || "und",
        languageConfidence: source.languageConfidence || "low",
        languageBasis: source.languageBasis || "unavailable",
        evidenceText: source.evidenceText,
      }];
    });
    if (!sources.length) continue;
    const compact = {
      eventKey: item.eventKey,
      eventKind: item.eventKind,
      subjectKey: item.subjectKey,
      subject: {
        kind: item.eventKind === "company" ? "entity" : item.subjectKey ? "game" : "topic",
        key: item.subjectKey || null,
      },
      publishability: item.subjectKey ? "direct" : "requires_subject_identity",
      headline: item.headline,
      tier: item.tier,
      score: item.score,
      timeRelation: item.timeRelation,
      readiness: item.readiness,
      ledger: ledger?.events?.[item.eventKey] ? {
        firstSeenAt: ledger.events[item.eventKey].firstSeenAt,
        lastSeenAt: ledger.events[item.eventKey].lastSeenAt,
        windowsSeen: ledger.events[item.eventKey].windowsSeen,
        state: ledger.events[item.eventKey].state,
        editorialState: ledger.events[item.eventKey].editorialState || null,
        lastDecision: ledger.events[item.eventKey].lastDecision || null,
        lastDecisionReason: ledger.events[item.eventKey].lastDecisionReason || null,
        tracking: ledger.events[item.eventKey].tracking || null,
      } : null,
      sources,
    };
    const size = JSON.stringify(compact).length;
    if (usedChars + size > maxChars) {
      if (activeKeys.has(item.eventKey)) throw new Error(`active tracking evidence exceeds the editorial input budget: ${item.eventKey}`);
      omitted = evidenceItems.slice(itemIndex).filter((candidate) =>
        (candidate.sources || []).some((source) => source.status === "opened" && source.evidenceText)
      );
      break;
    }
    packages.push(compact);
    usedChars += size;
  }
  return {
    schemaVersion: 2,
    window: evidence.window,
    adjacentEdition: evidence.adjacentEdition,
    packages,
    trackingQueue,
    budget: {
      maxInputChars: maxChars,
      usedInputChars: usedChars,
      estimatedInputTokens: Math.ceil(usedChars / 4),
      activeTrackingItems: activeTracking.length,
      candidateItems: evidenceItems.length,
      includedItems: packages.length,
      omittedItems: omitted.length,
      omittedTierA: omitted.filter((item) => item.tier === "A").length,
      omittedTierB: omitted.filter((item) => item.tier === "B").length,
      omittedTierAEventKeys: omitted.filter((item) => item.tier === "A").map((item) => item.eventKey),
      omissionReason: omitted.length ? "character_budget" : null,
    },
  };
}

function hasSubstantialChinese(value) {
  if (typeof value !== "string") return false;
  const chars = [...value];
  const cjk = chars.filter((char) => /[\u3400-\u9fff]/u.test(char)).length;
  return cjk >= 4 && cjk / Math.max(chars.length, 1) > 0.15;
}

export function validateEnglishEditorialLocale(output) {
  const errors = [];
  if (output?.contractVersion !== 2 || !output?.locales?.en) return errors;
  const en = output?.locales?.en;
  if (en.schemaVersion !== 1 || en.locale !== "en") return ["locales.en must use schemaVersion=1 and locale=en"];
  const included = (output.decisions || []).filter((item) => item.decision === "include");
  const includedKeys = included.map((item) => item.eventKey);
  const entryKeys = (en.entries || []).map((item) => item.eventKey);
  if (entryKeys.length !== includedKeys.length || entryKeys.some((key, index) => key !== includedKeys[index])) {
    errors.push("locales.en.entries must cover included decisions in canonical decision order");
  }
  const upcomingIds = (output.upcoming || []).map((item) => item.id);
  const localeUpcomingIds = (en.upcoming || []).map((item) => item.upcomingId);
  if (localeUpcomingIds.length !== upcomingIds.length || localeUpcomingIds.some((id, index) => id !== upcomingIds[index])) {
    errors.push("locales.en.upcoming must cover submitted upcoming items in order");
  }
  const requiredText = [en.archiveTitle, ...(en.entries || []).flatMap((item) => [item.headline, item.summary, item.verification, item.timeNote])];
  if (requiredText.some((value) => typeof value !== "string" || !value.trim())) errors.push("English locale required text must be non-empty");
  if (requiredText.some(hasSubstantialChinese)) errors.push("English locale required text must not contain substantial Chinese fallback copy");
  const period = output.editionId?.match(/-(am|pm|daily)$/)?.[1];
  if (period) {
    const prefix = englishArchiveTitlePrefix(period);
    if (!String(en.archiveTitle || "").startsWith(prefix)) errors.push(`locales.en.archiveTitle must start with ${prefix}`);
  }
  if (en.sourceReport !== null && en.sourceReport !== undefined) {
    if (!Array.isArray(en.sourceReport.checked) || !Array.isArray(en.sourceReport.limited) || typeof en.sourceReport.note !== "string") {
      errors.push("locales.en.sourceReport must be complete when present");
    }
  }
  return errors;
}

export function validateEditorialOutput(output, input) {
  const errors = [];
  if (!output || !Array.isArray(output.decisions)) return ["output.decisions must be an array"];
  const allowedKeys = new Set([...input.packages.map((item) => item.eventKey), ...(input.trackingQueue || []).map((item) => item.eventKey)]);
  errors.push(...validateJsonSchema(output, editorialSchema));
  if (output.contractVersion !== 2) errors.push("output.contractVersion must be 2");
  if (output.editionId !== input.window?.id) errors.push("output.editionId must match the immutable packet window");
  if (input.window?.period === "daily" && output.upcomingMode !== "replace") errors.push("Daily editions require upcomingMode=replace");
  const seen = new Set();
  for (const [index, item] of output.decisions.entries()) {
    const context = `decisions[${index}]`;
    if (!allowedKeys.has(item.eventKey)) errors.push(`${context}: unknown eventKey`);
    if (seen.has(item.eventKey)) errors.push(`${context}: duplicate eventKey`);
    seen.add(item.eventKey);
    if (!new Set(["include", "exclude", "needs_review"]).has(item.decision)) errors.push(`${context}: invalid decision`);
    if (typeof item.reason !== "string" || !item.reason.trim()) errors.push(`${context}: reason is required`);
    if (item.decision === "include") {
      for (const key of ["section", "titleKey", "titleEn", "headline", "summary", "factStatus", "timeStatus"]) {
        if (!item[key]) errors.push(`${context}: include requires ${key}`);
      }
      const evidenceItem = input.packages.find((candidate) => candidate.eventKey === item.eventKey);
      const validIndexes = new Set((evidenceItem?.sources || []).map((source) => source.sourceIndex));
      if ((item.sourceIndexes || []).some((sourceIndex) => !validIndexes.has(sourceIndex))) errors.push(`${context}: sourceIndexes contains an unavailable source`);
      if (evidenceItem?.publishability && evidenceItem.publishability !== "direct") {
        errors.push(`${context}: candidate requires an explicit subject identity before it can be included`);
      }
      if (!(item.sourceIndexes || []).length && !(item.additionalSources || []).length) errors.push(`${context}: include requires a selected source`);
      if (item.timeStatus === "verified" && isBoundaryMinute(item.beijingTime, input.window)) {
        const timeEvidenceAt = resolveSelectedTimeEvidence(item, evidenceItem);
        const timeError = verifiedWindowTimeError({ beijingTime: item.beijingTime, timeEvidenceAt, windowStart: input.window?.windowStart, windowEnd: input.window?.windowEnd, requireExactBoundary: true });
        if (timeError) errors.push(`${context}: ${timeError}`);
      }
      const frame = item.sharedFactFrame;
      if (!frame || !Array.isArray(frame.dates) || !Array.isArray(frame.times) || !Array.isArray(frame.numbers) || !Array.isArray(frame.platforms) || !Array.isArray(frame.peopleAndEntities) || !Array.isArray(frame.versionsAndTerms)) {
        errors.push(`${context}: contractVersion 2 include requires a complete sharedFactFrame`);
      } else {
        if (frame.subjectTitleKey !== item.titleKey) errors.push(`${context}: sharedFactFrame.subjectTitleKey must match titleKey`);
        if (JSON.stringify(frame.platforms) !== JSON.stringify(item.platforms || [])) errors.push(`${context}: sharedFactFrame.platforms must match canonical platform decision`);
      }
    }
    if (item.factStatus === "unconfirmed" && item.tracking !== true) errors.push(`${context}: unconfirmed requires tracking=true`);
    if (item.decision === "needs_review" && item.tracking !== true) errors.push(`${context}: needs_review requires tracking=true`);
    if (item.factStatus === "official") {
      const evidenceItem = input.packages.find((candidate) => candidate.eventKey === item.eventKey);
      const selectedPrimary = (evidenceItem?.sources || []).some((source) => (item.sourceIndexes || []).includes(source.sourceIndex) && source.kind === "primary") || (item.additionalSources || []).some((source) => source.kind === "primary");
      if (!selectedPrimary) errors.push(`${context}: official requires opened primary evidence`);
    }
    if (item.factStatus === "multi_source_verified") {
      const evidenceItem = input.packages.find((candidate) => candidate.eventKey === item.eventKey);
      const selected = (evidenceItem?.sources || []).filter((source) => (item.sourceIndexes || []).includes(source.sourceIndex));
      const independentSources = new Set([...selected, ...(item.additionalSources || [])].filter((source) => source.kind !== "discovery").map((source) => source.independenceKey || new URL(source.canonicalUrl || source.url).hostname));
      if (independentSources.size < 2) errors.push(`${context}: multi_source_verified requires two independent opened sources`);
    }
  }
  for (const eventKey of allowedKeys) if (!seen.has(eventKey)) errors.push(`missing decision for ${eventKey}`);
  return errors;
}

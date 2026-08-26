const sections = ["releases", "reviews", "news", "industry", "features", "rumors", "observations"];
const factStatuses = ["official", "media_relay_official", "media_report", "multi_source_verified", "unconfirmed"];
const timeStatuses = ["verified", "date_only", "time_unverified", "uncertain"];
const titleZhStatuses = ["official_simplified", "official_traditional", "common_translation", "unavailable"];
const entryFlags = ["supplement", "rumor", "time_uncertain", "platform_difference", "region_difference"];

export const editorialSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
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
    checkedExtra: { type: "array", items: { type: "string" } },
    limitedExtra: { type: "array", items: { type: "string" } },
    editorialNote: { type: "string" },
  },
  required: [
    "editionId", "archiveTitle", "leadEventKey", "decisions", "upcomingMode", "removeUpcomingIds",
    "upcoming", "checkedExtra", "limitedExtra", "editorialNote",
  ],
};

export function buildEditorialInput(evidence, maxChars = 120000, ledger = null) {
  const packages = [];
  let usedChars = 0;
  for (const item of evidence.packages || []) {
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
        evidenceText: source.evidenceText,
      }];
    });
    if (!sources.length) continue;
    const compact = {
      eventKey: item.eventKey,
      eventKind: item.eventKind,
      subjectKey: item.subjectKey,
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
      } : null,
      sources,
    };
    const size = JSON.stringify(compact).length;
    if (usedChars + size > maxChars) break;
    packages.push(compact);
    usedChars += size;
  }
  return {
    schemaVersion: 1,
    window: evidence.window,
    adjacentEdition: evidence.adjacentEdition,
    packages,
    budget: { maxInputChars: maxChars, usedInputChars: usedChars, estimatedInputTokens: Math.ceil(usedChars / 4) },
  };
}

export function validateEditorialOutput(output, input) {
  const errors = [];
  if (!output || !Array.isArray(output.decisions)) return ["output.decisions must be an array"];
  const allowedKeys = new Set(input.packages.map((item) => item.eventKey));
  const seen = new Set();
  for (const [index, item] of output.decisions.entries()) {
    const context = `decisions[${index}]`;
    const isLastMinute = String(item.eventKey || "").startsWith("last-minute:") &&
      Array.isArray(item.additionalSources) && item.additionalSources.length > 0;
    if (!allowedKeys.has(item.eventKey) && !isLastMinute) errors.push(`${context}: unknown eventKey`);
    if (seen.has(item.eventKey)) errors.push(`${context}: duplicate eventKey`);
    seen.add(item.eventKey);
    if (!new Set(["include", "exclude", "needs_review"]).has(item.decision)) errors.push(`${context}: invalid decision`);
    if (item.decision === "include") {
      for (const key of ["section", "titleKey", "titleEn", "headline", "summary", "factStatus", "timeStatus"]) {
        if (!item[key]) errors.push(`${context}: include requires ${key}`);
      }
      const evidenceItem = input.packages.find((candidate) => candidate.eventKey === item.eventKey);
      const validIndexes = new Set((evidenceItem?.sources || []).map((source) => source.sourceIndex));
      if ((item.sourceIndexes || []).some((sourceIndex) => !validIndexes.has(sourceIndex))) {
        errors.push(`${context}: sourceIndexes contains an unavailable source`);
      }
      if (!(item.sourceIndexes || []).length && !(item.additionalSources || []).length) {
        errors.push(`${context}: include requires a selected source`);
      }
    }
    if (item.factStatus === "unconfirmed" && item.tracking !== true) {
      errors.push(`${context}: unconfirmed requires tracking=true`);
    }
    if (item.factStatus === "official") {
      const evidenceItem = input.packages.find((candidate) => candidate.eventKey === item.eventKey);
      const selectedPrimary = (evidenceItem?.sources || []).some((source) =>
        (item.sourceIndexes || []).includes(source.sourceIndex) && source.kind === "primary"
      ) || (item.additionalSources || []).some((source) => source.kind === "primary");
      if (!selectedPrimary) {
        errors.push(`${context}: official requires opened primary evidence`);
      }
    }
    if (item.factStatus === "multi_source_verified") {
      const evidenceItem = input.packages.find((candidate) => candidate.eventKey === item.eventKey);
      const selected = (evidenceItem?.sources || []).filter((source) =>
        (item.sourceIndexes || []).includes(source.sourceIndex)
      );
      const independentSources = new Set([...selected, ...(item.additionalSources || [])]
        .filter((source) => source.kind !== "discovery")
        .map((source) => source.independenceKey || new URL(source.canonicalUrl || source.url).hostname));
      if (independentSources.size < 2) errors.push(`${context}: multi_source_verified requires two independent opened sources`);
    }
  }
  for (const eventKey of allowedKeys) {
    if (!seen.has(eventKey)) errors.push(`missing decision for ${eventKey}`);
  }
  return errors;
}

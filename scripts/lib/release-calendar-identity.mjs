const clean = (value) => typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";

// This is intentionally a conservative comparison key. It normalizes case,
// Unicode compatibility forms and punctuation, but never rewrites sequel
// numbers or removes edition words.
export const normalizeCalendarTitle = (value) => clean(value)
  .normalize("NFKC")
  .toLowerCase()
  .replace(/[™®©]/g, "")
  .replace(/[^\p{L}\p{N}]/gu, "");

const list = (value) => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
const unique = (values) => [...new Set(values.filter((value) => value !== undefined && value !== null && value !== ""))];
const sortValues = (values) => unique(values.map((value) => String(value))).sort((a, b) => a.localeCompare(b));

function registryAliases(titleRegistry = {}) {
  const translations = titleRegistry?.translations || titleRegistry || {};
  const aliases = new Map();
  for (const [registryId, value] of Object.entries(translations)) {
    if (!value || typeof value !== "object") continue;
    const names = [registryId, value.titleEn, value.title_en, value.titleZhCn, value.title_zh_cn, ...list(value.titleEnAliases), ...list(value.aliases)];
    for (const name of names) {
      const normalized = normalizeCalendarTitle(name);
      if (!normalized) continue;
      const ids = aliases.get(normalized) || new Set();
      ids.add(registryId);
      aliases.set(normalized, ids);
    }
  }
  return aliases;
}

function baselineNames(baseline = []) {
  const names = new Set();
  for (const item of baseline || []) {
    const values = [
      item?.title,
      item?.title_en,
      item?.title_zh_cn,
      item?.title?.title_en,
      item?.title?.title_zh_cn,
      item?.title?.en,
      item?.title?.zhCn,
    ];
    for (const value of values) {
      if (typeof value !== "string") continue;
      const normalized = normalizeCalendarTitle(value);
      if (normalized) names.add(normalized);
    }
  }
  return names;
}

function platformValues(record) {
  const values = list(record?.platforms?.length ? record.platforms : record?.platform ?? record?.platformLabel);
  return sortValues(values.map((value) => {
    if (value && typeof value === "object") return value.label ?? value.name ?? "unknown";
    return clean(value) || "unknown";
  }));
}

function normalizeObservation(record, aliases, knownNames, baselineSet) {
  const title = typeof record?.title === "string" ? clean(record.title) : "";
  if (!title) return null;
  const platforms = platformValues(record);
  const normalizedTitle = normalizeCalendarTitle(title);
  const registryIds = [...(aliases.get(normalizedTitle) || [])].sort();
  const date = record?.date || null;
  const dates = Array.isArray(record?.dates) ? record.dates.filter(Boolean).map(String) : date ? [String(date)] : [];
  const recordSourceIds = [...list(record?.sourceIds), ...list(record?.sources)];
  const sourceId = record?.sourceId ?? recordSourceIds[0] ?? null;
  const kind = clean(record?.kind) || "unknown";
  const region = clean(record?.region) || "unknown";
  const releaseType = clean(record?.releaseType) || "unknown";
  const family = clean(record?.family) || "unknown";
  const obs = {
    title,
    normalizedTitle,
    sourceId,
    sourceIds: sortValues([sourceId, ...recordSourceIds]),
    kind,
    url: record?.url ?? null,
    announcementUrl: record?.announcementUrl ?? null,
    productId: record?.productId ?? null,
    platform: platforms.length === 1 ? platforms[0] : platforms,
    platforms,
    platformFamily: record?.platformFamily ?? null,
    region,
    date,
    dates: unique(dates),
    dateText: record?.dateText ?? null,
    releaseType,
    family,
    priority: Number.isFinite(Number(record?.priority)) ? Number(record.priority) : 0,
  };
  if (record?.review !== undefined) obs.review = record.review;
  return {
    obs,
    registryIds,
    // Historical packets may have already established these flags. Keep that
    // evidence even when the current registry/baseline is incomplete.
    baseline: Boolean(record?.inBaseline) || baselineSet.has(normalizedTitle),
    known: Boolean(record?.knownTitle) || knownNames.has(normalizedTitle) || registryIds.length === 1,
  };
}

function observationKey(obs) {
  const substantive = {
    title: obs.title,
    sourceId: obs.sourceId,
    sourceIds: obs.sourceIds,
    kind: obs.kind,
    url: obs.url,
    announcementUrl: obs.announcementUrl,
    productId: obs.productId,
    platforms: obs.platforms,
    platformFamily: obs.platformFamily,
    region: obs.region,
    date: obs.date,
    dates: obs.dates,
    dateText: obs.dateText,
    releaseType: obs.releaseType,
    family: obs.family,
    priority: obs.priority,
  };
  return JSON.stringify(substantive);
}

function groupIdentity(rows) {
  const productIds = sortValues(rows.map((row) => row.obs.productId).filter(Boolean));
  const registryIds = sortValues(rows.flatMap((row) => row.registryIds));
  const ambiguousRegistry = registryIds.length > 1;
  const normalizedTitle = rows[0].obs.normalizedTitle;
  const base = registryIds.length === 1 && !ambiguousRegistry ? `registry:${registryIds[0]}` : `name:${normalizedTitle}`;
  return { base, productIds, registryIds, ambiguousRegistry };
}

function productNamespace(productId) {
  const value = clean(productId);
  if (!value) return null;
  const separator = value.indexOf(":");
  return separator > 0 ? value.slice(0, separator).toLowerCase() : value.toLowerCase();
}

function makeGroup(rows, meta, productConflictIds = []) {
  const observations = rows.map((row) => row.obs).sort((a, b) => observationKey(a).localeCompare(observationKey(b)));
  const first = observations[0];
  const dates = sortValues(observations.flatMap((row) => [...(row.dates || []), ...(row.date ? [row.date] : [])]));
  const platforms = sortValues(observations.flatMap((row) => row.platforms));
  const sources = sortValues(observations.flatMap((row) => row.sourceIds || [row.sourceId]).filter(Boolean));
  const families = sortValues(observations.map((row) => row.family));
  const corroboratingFamilies = families.filter((family) => family !== "unknown");
  const regions = sortValues(observations.map((row) => row.region));
  const releaseTypes = sortValues(observations.map((row) => row.releaseType));
  const titles = sortValues(observations.map((row) => row.title));
  const products = sortValues(observations.map((row) => row.productId).filter(Boolean));
  const dateValues = [...new Set(observations.flatMap((row) => [row.date, ...(row.dates || [])]))];
  const ambiguous = meta.ambiguousRegistry || productConflictIds.length > 1;
  const scopes = new Map();
  for (const observation of observations) {
    const scopePlatforms = observation.platforms.length ? observation.platforms : ["unknown"];
    for (const platform of scopePlatforms) {
      const key = JSON.stringify([platform, observation.region, observation.releaseType]);
      const datesForScope = scopes.get(key) || new Set();
      for (const date of [observation.date, ...(observation.dates || [])].filter(Boolean)) datesForScope.add(date);
      scopes.set(key, datesForScope);
    }
  }
  const unknownScope = observations.some((observation) => observation.platforms.length === 0 || observation.platforms.includes("unknown") || observation.region === "unknown" || observation.releaseType === "unknown");
  const scopedDateConflict = [...scopes.entries()].some(([scopeKey, scopeDates]) => scopeDates.size > 1 && JSON.parse(scopeKey).every((value) => value !== "unknown"));
  const dateConflictUncertain = !scopedDateConflict && unknownScope && dates.length > 1;
  const group = {
    // Legacy fields remain available to packet consumers.
    title: first.title,
    // Multiple observed dates never become a scalar date. dateConflict/status
    // and dates remain authoritative for review, while discovery sorting can
    // use a separate hint in a later batch without falsifying this field.
    date: dates.length === 1 ? dates[0] : null,
    url: first.url,
    announcementUrl: first.announcementUrl,
    platforms,
    region: regions.length === 1 ? regions[0] : "mixed",
    sourceId: first.sourceId,
    family: first.family,
    kind: first.kind,
    priority: Math.max(...observations.map((row) => row.priority), 0),
    productId: products.length === 1 ? products[0] : null,
    dateText: first.dateText,
    releaseType: releaseTypes.length === 1 ? releaseTypes[0] : "unknown",
    sources,
    dates,
    knownTitle: rows.some((row) => row.known),
    inBaseline: rows.some((row) => row.baseline),
    crossSource: corroboratingFamilies.length > 1,
    // Audit fields: unions are hints and every source claim stays below.
    observations,
    observationCount: observations.length,
    sourceUrls: sortValues(observations.flatMap((row) => [row.url, row.announcementUrl]).filter(Boolean)),
    platformHints: platforms,
    regions,
    releaseTypes,
    titles,
    productIds: products,
    dateValues,
    dateConflict: scopedDateConflict,
    dateConflictUncertain,
    dateConflictStatus: scopedDateConflict ? "conflict" : dateConflictUncertain ? "uncertain" : "none",
    identityStatus: ambiguous ? "ambiguous" : "needs_verification",
    identity: {
      // Product IDs from different stores are observations of one editorial
      // task. A product suffix is used only for a same-store conflict, so a
      // later cross-store observation cannot churn the stable identity.
      key: meta.identityKey || meta.base,
      status: ambiguous ? "ambiguous" : "needs_verification",
      registryIds: meta.registryIds,
      productIds: products,
      conflictProductIds: productConflictIds,
    },
  };
  if (first.review !== undefined) group.review = first.review;
  return group;
}

/**
 * Group immutable calendar observations into conservative editorial tasks.
 * This is deliberately pure so fixed discovery reports can be replayed without
 * fetching or reparsing their original sources.
 */
export function aggregateCalendarLeads(records = [], { baseline = [], titleRegistry = {} } = {}) {
  const aliases = registryAliases(titleRegistry);
  const knownNames = new Set([...aliases.keys()]);
  const baselineSet = baselineNames(baseline);
  const normalized = records.filter(Boolean).map((record) => normalizeObservation(record, aliases, knownNames, baselineSet)).filter(Boolean);
  const deduped = new Map();
  for (const row of normalized) {
    const key = observationKey(row.obs);
    const existing = deduped.get(key);
    if (!existing) {
      deduped.set(key, row);
      continue;
    }
    // Flags are evidence carried by the observation, not part of its
    // substantive identity. Keep the first row's stable payload while
    // retaining positive historical flags from every duplicate.
    existing.known ||= row.known;
    existing.baseline ||= row.baseline;
  }

  const byBase = new Map();
  for (const row of deduped.values()) {
    const meta = groupIdentity([row]);
    const rows = byBase.get(meta.base) || [];
    rows.push(row);
    byBase.set(meta.base, rows);
  }

  const groups = [];
  for (const [base, rows] of byBase) {
    const meta = groupIdentity(rows);
    const products = sortValues(rows.map((row) => row.obs.productId).filter(Boolean));
    const productNamespaces = new Map();
    for (const productId of products) {
      const namespace = productNamespace(productId);
      const ids = productNamespaces.get(namespace) || [];
      ids.push(productId);
      productNamespaces.set(namespace, ids);
    }
    const conflictingNamespaces = [...productNamespaces.entries()]
      .filter(([, ids]) => ids.length > 1)
      .map(([namespace]) => namespace);

    if (!conflictingNamespaces.length) {
      // With no same-store product collision, all observations describe one
      // research task. An unscoped observation is retained in that task and
      // is never assigned to the known product by inference.
      groups.push(makeGroup(rows, { ...meta, base, identityKey: base }, []));
      continue;
    }

    // A same-store product conflict is split conservatively. Products from a
    // store with no conflict are retained in their own shared task rather than
    // guessed into either conflicting product.
    for (const [namespace, ids] of productNamespaces) {
      if (ids.length > 1) {
        for (const productId of ids) {
          const selected = rows.filter((row) => row.obs.productId === productId);
          groups.push(makeGroup(selected, {
            ...meta,
            base,
            identityKey: `${base}|store:${namespace}|product:${productId}`,
          }, ids));
        }
      } else {
        const selected = rows.filter((row) => productNamespace(row.obs.productId) === namespace);
        groups.push(makeGroup(selected, { ...meta, base, identityKey: `${base}|store:${namespace}|product:${ids[0]}` }, []));
      }
    }
    const unknownRows = rows.filter((row) => !row.obs.productId);
    if (unknownRows.length) groups.push(makeGroup(unknownRows, { ...meta, base: `${base}|product:unknown`, identityKey: `${base}|product:unknown` }, []));
  }
  return groups.sort((a, b) => `${a.identity.key}|${a.title}`.localeCompare(`${b.identity.key}|${b.title}`));
}

export function dedupeCalendarObservations(records = []) {
  const seen = new Map();
  for (const record of records) {
    if (!record) continue;
    const row = normalizeObservation(record, new Map(), new Set(), new Set());
    if (!row) continue;
    const normalized = row.obs;
    const key = observationKey(normalized);
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...record });
      continue;
    }
    // Preserve first-seen ordering/payload while OR-ing historical flags
    // carried by later duplicate records.
    if (record.knownTitle) existing.knownTitle = true;
    if (record.inBaseline) existing.inBaseline = true;
  }
  return [...seen.values()];
}

export { observationKey };

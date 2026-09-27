import { CALENDAR_PLATFORM_FAMILIES, leadPlatformFamilies, selectCalendarLeads } from "./release-calendar-selection.mjs";

const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const jsonLength = (value) => JSON.stringify(value).length;
const sameValue = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const clone = (value) => value === undefined ? undefined : structuredClone(value);

/**
 * Keep packet fields named and human-readable. Observation values shared by
 * every observation from the same source are lifted to named defaults and
 * expanded by decode. normalizedTitle is a derived grouping key.
 */
function encodePacketLeads(leads) {
  const allObservations = leads.flatMap((lead) => lead.observations || []);
  const sourceGroups = new Map();
  for (const observation of allObservations) {
    if (!observation?.sourceId) continue;
    const group = sourceGroups.get(observation.sourceId) || [];
    group.push(observation);
    sourceGroups.set(observation.sourceId, group);
  }
  const observationDefaultsBySource = {};
  for (const [sourceId, observations] of sourceGroups) {
    const defaults = {};
    for (const [field, value] of Object.entries(observations[0])) {
      if (["normalizedTitle", "sourceId"].includes(field)) continue;
      if (observations.every((observation) => own(observation, field) && sameValue(observation[field], value))) defaults[field] = clone(value);
    }
    if (Object.keys(defaults).length) observationDefaultsBySource[sourceId] = defaults;
  }
  const urlCounts = new Map();
  for (const observation of allObservations) for (const field of ["url", "announcementUrl"]) {
    const value = observation?.[field];
    if (typeof value === "string" && !sameValue(value, observationDefaultsBySource[observation.sourceId]?.[field])) urlCounts.set(value, (urlCounts.get(value) || 0) + 1);
  }
  const sharedObservationUrls = [...urlCounts].filter(([, count]) => count > 1).map(([url]) => url);
  const sharedUrlIndexes = new Map(sharedObservationUrls.map((url, index) => [url, index]));
  const candidates = leads.map((lead) => ({
    title: lead.title,
    date: lead.date ?? null,
    dateConflictStatus: lead.dateConflict ? "conflict" : lead.dateConflictUncertain ? "uncertain" : "none",
    identityStatus: lead.identityStatus || lead.identity?.status || "needs_verification",
    identity: { key: lead.identity?.key ?? null, registryIds: clone(lead.identity?.registryIds || []), conflictProductIds: clone(lead.identity?.conflictProductIds || []) },
    knownTitle: Boolean(lead.knownTitle),
    inBaseline: Boolean(lead.inBaseline),
    crossSource: Boolean(lead.crossSource),
    observations: (lead.observations || []).map((observation) => {
      const named = {};
      const defaults = observationDefaultsBySource[observation.sourceId] || {};
      for (const [field, rawValue] of Object.entries(observation)) {
        if (["normalizedTitle", "sourceId"].includes(field)) continue;
        if (own(defaults, field) && sameValue(rawValue, defaults[field])) continue;
        if (field === "dates" && Array.isArray(rawValue) && rawValue.length === 1 && sameValue(rawValue[0], observation.date)) continue;
        if (field === "platforms" && typeof observation.platform === "string" && Array.isArray(rawValue) && rawValue.length === 1 && rawValue[0] === observation.platform) continue;
        const value = clone(rawValue);
        if (["url", "announcementUrl"].includes(field) && sharedUrlIndexes.has(value)) named[field] = { $ref: sharedUrlIndexes.get(value) };
        else named[field] = value;
      }
      return { sourceId: observation.sourceId, ...named };
    }),
  }));
  return { candidates, observationDefaultsBySource, sharedObservationUrls };
}

/** Expand named observations using per-source defaults and explicitly shared URLs. */
export function decodeCalendarPacket(packet) {
  if (!Array.isArray(packet?.candidates)) throw new Error("packet candidates are missing or invalid");
  const sharedUrls = packet.sharedObservationUrls || [];
  const defaultsBySource = packet.observationDefaultsBySource || {};
  return packet.candidates.map((candidate) => {
    const restored = clone(candidate);
    restored.observations = (candidate.observations || []).map((observation) => {
      const expanded = clone(defaultsBySource[observation.sourceId] || {});
      for (const [field, value] of Object.entries(observation)) {
        if (value && typeof value === "object" && Object.keys(value).length === 1 && own(value, "$ref")) {
          if (!Number.isInteger(value.$ref) || value.$ref < 0 || value.$ref >= sharedUrls.length) throw new Error("calendar shared URL reference is out of range");
          expanded[field] = sharedUrls[value.$ref];
        } else expanded[field] = clone(value);
      }
      if (!own(expanded, "dates") && typeof expanded.date === "string") expanded.dates = [expanded.date];
      if (!own(expanded, "platforms") && typeof expanded.platform === "string") expanded.platforms = [expanded.platform];
      return expanded;
    });
    return restored;
  });
}
function familyCounts(leads) {
  const counts = Object.fromEntries(CALENDAR_PLATFORM_FAMILIES.map((family) => [family, 0]));
  for (const lead of leads) for (const family of leadPlatformFamilies(lead)) counts[family]++;
  return counts;
}

function makePacket(report, leads, reviewLinks, telemetry) {
  const omittedCandidates = Number(report?.omittedCandidates || 0) + telemetry.packetCapOmittedTasks + telemetry.budgetOmittedTasks;
  const encoded = encodePacketLeads(leads);
  return { ...report, candidates: encoded.candidates, observationDefaultsBySource: encoded.observationDefaultsBySource, sharedObservationUrls: encoded.sharedObservationUrls, reviewLinks, omittedCandidates, omissionTelemetry: telemetry };
}

function reviewLinkPlatform(link, report) {
  const direct = link?.platform || link?.sourcePlatform;
  if (direct) return String(direct);
  const source = (report?.coverage || []).find((entry) => entry.sourceId === link?.sourceId);
  return source?.platform ? String(source.platform) : "";
}

function isInWindowReviewLink(link, report) {
  if (own(link || {}, "dateStatus")) return link.dateStatus === "in_window";
  const published = String(link?.published || "").slice(0, 10);
  const start = String(report?.window?.startInclusive || "").slice(0, 10);
  const end = String(report?.window?.endInclusive || "").slice(0, 10);
  return Boolean(published && start && end && published >= start && published <= end);
}

function telemetryFor(report, reportCandidates, selectedByCap, selectedIndexes, visibleRawRows, links, chosenLinks) {
  const budgetOmittedTasks = selectedByCap.candidates.length - selectedIndexes.length;
  const sourceTelemetry = report?.omissionTelemetry || {};
  return {
    visibleRawRows,
    uniqueTasks: Number(sourceTelemetry.uniqueTasks ?? reportCandidates.length),
    dedupeReduction: Number(sourceTelemetry.dedupeReduction ?? Math.max(0, visibleRawRows - reportCandidates.length)),
    capOmittedTasks: Number(sourceTelemetry.capOmittedTasks ?? 0),
    packetCapOmittedTasks: selectedByCap.capOmittedTasks,
    budgetOmittedTasks,
    linkOmitted: links.length - chosenLinks.length,
    platformFinalTaskCounts: familyCounts(selectedIndexes.map((index) => selectedByCap.candidates[index])),
    reportStageOmittedCandidates: Number(report?.omittedCandidates || 0),
    reportStageOmittedUnit: sourceTelemetry.legacyOmittedUnit || (sourceTelemetry.capOmittedTasks !== undefined ? "tasks" : "unknown_rows_or_groups"),
    legacyOmittedCandidates: Number(report?.omittedCandidates || 0),
    legacyOmittedUnit: sourceTelemetry.legacyOmittedUnit || "unknown_rows_or_groups",
  };
}

/** Select tasks and review links under fixed row/byte ceilings. */
export function selectCalendarPacket({ report, maxCandidates = 100, maxChars = 24000 }) {
  if (!Number.isInteger(maxCandidates) || maxCandidates < 0) throw new Error("maxCandidates must be a non-negative integer");
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error("maxChars must be a positive integer");
  const reportCandidates = Array.isArray(report?.candidates) ? report.candidates : [];
  const visibleRawRows = Number(report?.omissionTelemetry?.visibleRawRows ?? reportCandidates.length);
  const selectedByCap = selectCalendarLeads(reportCandidates, maxCandidates);
  const links = Array.isArray(report?.reviewLinks) ? report.reviewLinks : [];
  const priorityLinks = links.map((link, index) => ({ link, index }))
    .filter(({ link }) => isInWindowReviewLink(link, report) && reviewLinkPlatform(link, report))
    .sort((a, b) => {
      const af = leadPlatformFamilies({ platforms: [reviewLinkPlatform(a.link, report)] })[0] || "Unknown";
      const bf = leadPlatformFamilies({ platforms: [reviewLinkPlatform(b.link, report)] })[0] || "Unknown";
      return CALENDAR_PLATFORM_FAMILIES.indexOf(af) - CALENDAR_PLATFORM_FAMILIES.indexOf(bf) || a.index - b.index;
    });
  const familyIndexes = new Map(CALENDAR_PLATFORM_FAMILIES.map((family) => [family, []]));
  const unknownIndexes = [];
  selectedByCap.candidates.forEach((lead, index) => {
    const families = leadPlatformFamilies(lead);
    if (!families.length) unknownIndexes.push(index);
    else for (const family of families) familyIndexes.get(family).push(index);
  });
  const chosenIndexes = [];
  const chosenSet = new Set();
  const chosenLinks = [];
  const chosenLinkIndexes = new Set();
  const telemetryForTrial = (indexes, linkValues) => telemetryFor(report, reportCandidates, selectedByCap, indexes, visibleRawRows, links, linkValues);
  const fits = (indexes, linkValues) => jsonLength(makePacket(
    report,
    indexes.map((index) => selectedByCap.candidates[index]),
    linkValues,
    telemetryForTrial(indexes, linkValues),
  )) <= maxChars;
  const addTask = (index) => {
    if (chosenSet.has(index) || chosenIndexes.length >= maxCandidates) return false;
    const trial = [...chosenIndexes, index];
    if (!fits(trial, chosenLinks)) return false;
    chosenIndexes.push(index);
    chosenSet.add(index);
    return true;
  };
  const addLink = (index) => {
    if (chosenLinkIndexes.has(index)) return false;
    const trial = [...chosenLinks, links[index]];
    if (!fits(chosenIndexes, trial)) return false;
    chosenLinks.push(links[index]);
    chosenLinkIndexes.add(index);
    return true;
  };

  // Reserve the three console families and qualifying review entries before
  // admitting PC rows, so one large PC record cannot consume their fit space.
  for (const family of ["PlayStation", "Xbox", "Nintendo"]) {
    const bySize = [...familyIndexes.get(family)].sort((a, b) => JSON.stringify(selectedByCap.candidates[a]).length - JSON.stringify(selectedByCap.candidates[b]).length);
    for (const index of bySize) if (addTask(index)) break;
  }
  // Keep dated, explicitly platform-attributed review entries from being
  // starved by game rows; direct platform metadata or source coverage qualifies.
  for (const { index } of priorityLinks) addLink(index);
  const pcBySize = [...familyIndexes.get("PC")].sort((a, b) => JSON.stringify(selectedByCap.candidates[a]).length - JSON.stringify(selectedByCap.candidates[b]).length);
  for (const index of pcBySize) if (addTask(index)) break;

  let progressed = true;
  while (progressed && chosenIndexes.length < maxCandidates) {
    progressed = false;
    for (const family of [...CALENDAR_PLATFORM_FAMILIES, "Unknown"]) {
      const bucket = family === "Unknown" ? unknownIndexes : familyIndexes.get(family);
      const next = bucket.find((index) => !chosenSet.has(index));
      if (next !== undefined) progressed = addTask(next) || progressed;
    }
  }
  for (let index = 0; index < selectedByCap.candidates.length && chosenIndexes.length < maxCandidates; index++) addTask(index);
  for (let index = 0; index < links.length; index++) addLink(index);

  const telemetry = telemetryForTrial(chosenIndexes, chosenLinks);
  const packet = makePacket(report, chosenIndexes.map((index) => selectedByCap.candidates[index]), chosenLinks, telemetry);
  if (jsonLength(packet) > maxChars) throw new Error("calendar diagnostics exceed budget after candidate and link selection");
  return packet;
}

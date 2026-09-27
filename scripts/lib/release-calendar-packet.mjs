import { CALENDAR_PLATFORM_FAMILIES, leadPlatformFamilies, selectCalendarLeads } from "./release-calendar-selection.mjs";

const BASE_OBSERVATION_FIELDS = [
  "title", "sourceId", "sourceIds", "kind", "url", "announcementUrl", "productId",
  "platform", "platforms", "platformFamily", "region", "date", "dates", "dateText",
  "releaseType", "family", "priority",
];
const CANDIDATE_FIELDS = [
  "title", "date", "dateConflictStatus", "identityStatus", "identityRegistryIds",
  "identityConflictProductIds", "knownTitle", "inBaseline", "crossSource", "observationCount",
];
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const array = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const jsonLength = (value) => JSON.stringify(value).length;

function observationFields(leads) {
  const extra = new Set();
  for (const lead of leads) for (const observation of lead?.observations || []) {
    for (const field of Object.keys(observation)) if (!BASE_OBSERVATION_FIELDS.includes(field) && field !== "normalizedTitle") extra.add(field);
  }
  return [...BASE_OBSERVATION_FIELDS, ...[...extra].sort()];
}

function encodePacketLeads(leads) {
  const fields = observationFields(leads);
  const strings = [];
  const indexes = new Map();
  const stringFields = new Set();
  const arrayFields = new Set();
  const candidateStringFields = new Set();
  const candidateArrayFields = new Set();
  const intern = (value) => {
    const string = String(value);
    if (!indexes.has(string)) { indexes.set(string, strings.length); strings.push(string); }
    return indexes.get(string);
  };
  const candidates = leads.map((lead) => {
    const summary = {
      title: lead.title,
      date: lead.date ?? null,
      dateConflictStatus: lead.dateConflict ? "conflict" : lead.dateConflictUncertain ? "uncertain" : undefined,
      identityStatus: lead.identityStatus || lead.identity?.status || "needs_verification",
      identityRegistryIds: lead.identity?.registryIds?.length ? lead.identity.registryIds : undefined,
      identityConflictProductIds: lead.identity?.conflictProductIds?.length ? lead.identity.conflictProductIds : undefined,
      knownTitle: lead.knownTitle ? true : undefined,
      inBaseline: lead.inBaseline ? true : undefined,
      crossSource: lead.crossSource ? true : undefined,
      observationCount: (lead.observations || []).length,
    };
    const metadata = CANDIDATE_FIELDS.map((field, fieldIndex) => {
      if (!own(summary, field) || summary[field] === undefined) return -1;
      const value = summary[field];
      if (typeof value === "string") { candidateStringFields.add(fieldIndex); return intern(value); }
      if (Array.isArray(value)) {
        candidateArrayFields.add(fieldIndex);
        return value.map((entry) => typeof entry === "string" ? intern(entry) : entry);
      }
      return value;
    });
    const candidate = {
      metadata,
      observations: (lead.observations || []).map((observation) => fields.map((field, fieldIndex) => {
        if (!own(observation, field)) return -1;
        const value = observation[field];
        if (typeof value === "string") { stringFields.add(fieldIndex); return intern(value); }
        if (Array.isArray(value)) {
          arrayFields.add(fieldIndex);
          return value.map((entry) => typeof entry === "string" ? intern(entry) : entry);
        }
        return value;
      })),
    };
    return candidate;
  });
  return {
    candidates,
    candidateDictionary: {
      fields: CANDIDATE_FIELDS,
      stringFields: [...candidateStringFields].sort((a, b) => a - b),
      arrayFields: [...candidateArrayFields].sort((a, b) => a - b),
    },
    observationDictionary: {
      fields,
      strings,
      stringFields: [...stringFields].sort((a, b) => a - b),
      arrayFields: [...arrayFields].sort((a, b) => a - b),
    },
  };
}

/** Restore packet observation tuples to the rich, readable observation shape. */
export function decodeCalendarPacket(packet) {
  const dictionary = packet?.observationDictionary;
  if (!dictionary || !Array.isArray(dictionary.fields) || !Array.isArray(dictionary.strings)) throw new Error("packet observation dictionary is missing or invalid");
  const strings = new Set(dictionary.stringFields || []);
  const arrays = new Set(dictionary.arrayFields || []);
  const candidateDictionary = packet?.candidateDictionary;
  if (!candidateDictionary || !Array.isArray(candidateDictionary.fields)) throw new Error("packet candidate dictionary is missing or invalid");
  const candidateStrings = new Set(candidateDictionary.stringFields || []);
  const candidateArrays = new Set(candidateDictionary.arrayFields || []);
  return (packet.candidates || []).map((candidate) => ({
    ...Object.fromEntries(candidateDictionary.fields.flatMap((field, index) => {
      const value = candidate.metadata?.[index];
      if (value === undefined || value === -1) return [];
      const dereference = (reference) => {
        if (!Number.isInteger(reference) || reference < 0 || reference >= dictionary.strings.length) throw new Error("calendar string reference is out of range");
        return dictionary.strings[reference];
      };
      return [[field, candidateArrays.has(index)
        ? value.map((entry) => Number.isInteger(entry) ? dereference(entry) : entry)
        : candidateStrings.has(index) ? dereference(value) : value]];
    })),
    observations: (candidate.observations || []).map((tuple) => {
      if (!Array.isArray(tuple) || tuple.length !== dictionary.fields.length) throw new Error("calendar observation tuple does not match its dictionary");
      const observation = {};
      for (let index = 0; index < tuple.length; index++) {
        const value = tuple[index];
        if (value === -1) continue;
        const dereference = (reference) => {
          if (!Number.isInteger(reference) || reference < 0 || reference >= dictionary.strings.length) throw new Error("calendar string reference is out of range");
          return dictionary.strings[reference];
        };
        observation[dictionary.fields[index]] = arrays.has(index)
          ? value.map((entry) => Number.isInteger(entry) ? dereference(entry) : entry)
          : strings.has(index) ? dereference(value) : value;
      }
      return observation;
    }),
  }));
}

function familyCounts(leads) {
  const counts = Object.fromEntries(CALENDAR_PLATFORM_FAMILIES.map((family) => [family, 0]));
  for (const lead of leads) for (const family of leadPlatformFamilies(lead)) counts[family]++;
  return counts;
}

function makePacket(report, leads, reviewLinks, telemetry) {
  const encoded = encodePacketLeads(leads);
  return {
    ...report,
    candidates: encoded.candidates,
    candidateDictionary: encoded.candidateDictionary,
    observationDictionary: encoded.observationDictionary,
    reviewLinks,
    omittedCandidates: Number(report?.omittedCandidates || 0) + telemetry.capOmittedTasks + telemetry.budgetOmittedTasks,
    omissionTelemetry: telemetry,
  };
}

/**
 * Select and losslessly compact calendar tasks under fixed row/byte ceilings.
 * The full rich report remains untouched for artifact review.
 */
export function selectCalendarPacket({ report, maxCandidates = 100, maxChars = 24000 }) {
  if (!Number.isInteger(maxCandidates) || maxCandidates < 0) throw new Error("maxCandidates must be a non-negative integer");
  if (!Number.isInteger(maxChars) || maxChars < 1) throw new Error("maxChars must be a positive integer");
  const reportCandidates = Array.isArray(report?.candidates) ? report.candidates : [];
  const visibleRawRows = Number(report?.omissionTelemetry?.visibleRawRows ?? reportCandidates.length);
  const selectedByCap = selectCalendarLeads(reportCandidates, maxCandidates);
  const attempted = new Set();
  const selected = [];
  const selectedSet = new Set();
  const budgetOmitted = new Set();
  const buckets = new Map(CALENDAR_PLATFORM_FAMILIES.map((family) => [family, []]));
  const unknown = [];
  for (const [index, lead] of selectedByCap.candidates.entries()) {
    const families = leadPlatformFamilies(lead);
    if (!families.length) unknown.push(index);
    else for (const family of families) buckets.get(family).push(index);
  }
  const links = Array.isArray(report?.reviewLinks) ? report.reviewLinks : [];
  const order = [...CALENDAR_PLATFORM_FAMILIES, "Unknown"];
  const canFit = (candidateIndexes, candidateLinks) => {
    const candidateLeads = candidateIndexes.map((index) => selectedByCap.candidates[index]);
    const trialTelemetry = {
      visibleRawRows,
      uniqueTasks: Number(report?.omissionTelemetry?.uniqueTasks ?? reportCandidates.length),
      dedupeReduction: Number(report?.omissionTelemetry?.dedupeReduction ?? Math.max(0, visibleRawRows - reportCandidates.length)),
      capOmittedTasks: Number(report?.omissionTelemetry?.capOmittedTasks ?? selectedByCap.capOmittedTasks),
      packetCapOmittedTasks: selectedByCap.capOmittedTasks,
      budgetOmittedTasks: 0,
      linkOmitted: 0,
      platformFinalTaskCounts: familyCounts(candidateLeads),
      legacyOmittedCandidates: Number(report?.omittedCandidates || 0),
      legacyOmittedUnit: report?.omissionTelemetry?.legacyOmittedUnit || "unknown_rows_or_groups",
    };
    return jsonLength(makePacket(report, candidateLeads, candidateLinks, trialTelemetry)) <= maxChars;
  };
  const tryAdd = (index) => {
    if (attempted.has(index)) return;
    attempted.add(index);
    const next = [...selected, index];
    if (canFit(next, [])) { selected.push(index); selectedSet.add(index); }
    else budgetOmitted.add(index);
  };
  let progressed = true;
  while (progressed && selected.length < maxCandidates) {
    progressed = false;
    for (const family of order) {
      const bucket = family === "Unknown" ? unknown : buckets.get(family);
      while (bucket.length && (selectedSet.has(bucket[0]) || attempted.has(bucket[0]))) bucket.shift();
      if (!bucket.length || selected.length >= maxCandidates) continue;
      const index = bucket.shift();
      tryAdd(index);
      progressed = true;
    }
  }
  for (let index = 0; index < selectedByCap.candidates.length && selected.length < maxCandidates; index++) tryAdd(index);

  let chosenLinks = [];
  let linkOmitted = 0;
  for (const link of links) {
    if (canFit(selected, [...chosenLinks, link])) chosenLinks.push(link);
    else linkOmitted++;
  }
  const reportStageOmitted = Number(report?.omittedCandidates || 0);
  const legacyUnit = report?.omissionTelemetry?.legacyOmittedUnit
    || (report?.omissionTelemetry?.capOmittedTasks !== undefined ? "tasks" : "unknown_rows_or_groups");
  let telemetry = {
    visibleRawRows,
    uniqueTasks: Number(report?.omissionTelemetry?.uniqueTasks ?? reportCandidates.length),
    dedupeReduction: Number(report?.omissionTelemetry?.dedupeReduction ?? Math.max(0, visibleRawRows - reportCandidates.length)),
    capOmittedTasks: Number(report?.omissionTelemetry?.capOmittedTasks ?? selectedByCap.capOmittedTasks),
    packetCapOmittedTasks: selectedByCap.capOmittedTasks,
    budgetOmittedTasks: budgetOmitted.size,
    linkOmitted,
    platformFinalTaskCounts: familyCounts(selected.map((index) => selectedByCap.candidates[index])),
    reportStageOmittedCandidates: reportStageOmitted,
    reportStageOmittedUnit: legacyUnit,
    legacyOmittedCandidates: reportStageOmitted,
    legacyOmittedUnit: legacyUnit,
  };
  let final = makePacket(report, selected.map((index) => selectedByCap.candidates[index]), chosenLinks, telemetry);
  while (jsonLength(final) > maxChars && selected.length) {
    const removed = selected.pop();
    selectedSet.delete(removed);
    budgetOmitted.add(removed);
    telemetry = {
      ...telemetry,
      budgetOmittedTasks: budgetOmitted.size,
      platformFinalTaskCounts: familyCounts(selected.map((index) => selectedByCap.candidates[index])),
    };
    final = makePacket(report, selected.map((index) => selectedByCap.candidates[index]), chosenLinks, telemetry);
  }
  while (jsonLength(final) > maxChars && chosenLinks.length) {
    chosenLinks.pop();
    linkOmitted++;
    telemetry = { ...telemetry, linkOmitted };
    final = makePacket(report, selected.map((index) => selectedByCap.candidates[index]), chosenLinks, telemetry);
  }
  if (jsonLength(final) > maxChars) throw new Error("calendar diagnostics exceed budget after candidate and link selection");
  return final;
}

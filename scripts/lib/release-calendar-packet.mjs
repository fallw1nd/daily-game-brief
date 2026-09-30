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
  const opportunityCounts = Object.fromEntries(CALENDAR_PLATFORM_FAMILIES.map((family) => [family, 0]));
  const taskOpportunityCounts = Object.fromEntries(CALENDAR_PLATFORM_FAMILIES.map((family) => [family, 0]));
  const linkOpportunityCounts = Object.fromEntries(CALENDAR_PLATFORM_FAMILIES.map((family) => [family, 0]));
  for (const index of selectedIndexes) {
    for (const family of leadPlatformFamilies(selectedByCap.candidates[index])) {
      opportunityCounts[family]++;
      taskOpportunityCounts[family]++;
    }
  }
  for (const link of chosenLinks) {
    const family = leadPlatformFamilies({ platforms: [reviewLinkPlatform(link, report)] })[0];
    if (family && family !== "Unknown") {
      opportunityCounts[family]++;
      linkOpportunityCounts[family]++;
    }
  }
  const representedTaskFamilies = new Set(selectedByCap.candidates.flatMap((lead) => leadPlatformFamilies(lead)));
  const reportTaskFamilies = new Set(reportCandidates.flatMap((lead) => leadPlatformFamilies(lead)));
  const representedLinkFamilies = new Set(links.filter((link) => isInWindowReviewLink(link, report))
    .flatMap((link) => leadPlatformFamilies({ platforms: [reviewLinkPlatform(link, report)] })));
  return {
    visibleRawRows,
    uniqueTasks: Number(sourceTelemetry.uniqueTasks ?? reportCandidates.length),
    dedupeReduction: Number(sourceTelemetry.dedupeReduction ?? Math.max(0, visibleRawRows - reportCandidates.length)),
    capOmittedTasks: Number(sourceTelemetry.capOmittedTasks ?? 0),
    packetCapOmittedTasks: selectedByCap.capOmittedTasks,
    budgetOmittedTasks,
    linkOmitted: links.length - chosenLinks.length,
    platformFinalTaskCounts: familyCounts(selectedIndexes.map((index) => selectedByCap.candidates[index])),
    platformFinalLinkCounts: linkOpportunityCounts,
    platformFinalOpportunityCounts: opportunityCounts,
    platformCapOmittedFamilies: CALENDAR_PLATFORM_FAMILIES.filter((family) => reportTaskFamilies.has(family) && !representedTaskFamilies.has(family)),
    platformFloorOmittedFamilies: CALENDAR_PLATFORM_FAMILIES.filter((family) =>
      (representedTaskFamilies.has(family) && taskOpportunityCounts[family] === 0)
      || (representedLinkFamilies.has(family) && linkOpportunityCounts[family] === 0)),
    reportStageOmittedCandidates: Number(report?.omittedCandidates || 0),
    reportStageOmittedUnit: sourceTelemetry.legacyOmittedUnit || (sourceTelemetry.capOmittedTasks !== undefined ? "tasks" : "unknown_rows_or_groups"),
    legacyOmittedCandidates: Number(report?.omittedCandidates || 0),
    legacyOmittedUnit: sourceTelemetry.legacyOmittedUnit || "unknown_rows_or_groups",
  };
}

/** Select tasks and review links under fixed row/character ceilings. */
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

  // Establish one deterministic opportunity per represented family before
  // admitting any extra task or link. A dated PlayStation link is its own
  // minimum opportunity, even when a PlayStation task is also available.
  const taskItems = selectedByCap.candidates.map((lead, index) => ({
    type: "task", index, families: leadPlatformFamilies(lead), cost: JSON.stringify(lead).length,
  })).filter((item) => item.families.length);
  const linkItems = priorityLinks.map(({ link, index }) => ({
    type: "link", index,
    families: leadPlatformFamilies({ platforms: [reviewLinkPlatform(link, report)] }).filter((family) => family !== "Unknown"),
    cost: JSON.stringify(link).length,
  })).filter((item) => item.families.length);
  const itemOrder = (a, b) => a.cost - b.cost
    || (a.type === b.type ? 0 : a.type === "task" ? -1 : 1)
    || a.index - b.index;
  // Keep a small, deterministic portfolio for each family and opportunity
  // type. This preserves alternate representatives for nonlinear packet
  // compression while preventing repeated same-family candidates from
  // multiplying the search space. Multi-family candidates are retained when
  // they rank among the representatives for any family they cover.
  const representativeItems = new Set();
  for (const family of CALENDAR_PLATFORM_FAMILIES) {
    for (const items of [taskItems, linkItems]) {
      for (const item of items.filter((candidate) => candidate.families.includes(family))
        .sort(itemOrder).slice(0, 4)) representativeItems.add(item);
    }
  }
  const floorItems = [...representativeItems].sort(itemOrder);
  const familyBits = new Map(CALENDAR_PLATFORM_FAMILIES.map((family, index) => [family, 1 << index]));
  const maskFor = (item) => item.families.reduce((mask, family) => mask | ((familyBits.get(family) || 0) << (item.type === "link" ? 4 : 0)), 0);
  const representedTaskFamilies = new Set(taskItems.flatMap((item) => item.families));
  const representedLinkFamilies = new Set(linkItems.flatMap((item) => item.families));
  const requiredMask = [...representedTaskFamilies].reduce((mask, family) => mask | familyBits.get(family), 0)
    | [...representedLinkFamilies].reduce((mask, family) => mask | (familyBits.get(family) << 4), 0);
  const datedPlayStationLink = priorityLinks
    .filter(({ link }) => leadPlatformFamilies({ platforms: [reviewLinkPlatform(link, report)] }).includes("PlayStation"))
    .sort((a, b) => JSON.stringify(a.link).length - JSON.stringify(b.link).length || a.index - b.index)[0];
  const mandatoryLinkIndexes = datedPlayStationLink ? [datedPlayStationLink.index] : [];
  let floorStates = [
    {
      mask: mandatoryLinkIndexes.length ? familyBits.get("PlayStation") << 4 : 0,
      taskIndexes: [],
      linkIndexes: mandatoryLinkIndexes,
      cost: mandatoryLinkIndexes.length ? JSON.stringify(links[mandatoryLinkIndexes[0]]).length : 0,
      mandatoryLink: mandatoryLinkIndexes.length > 0,
    },
    { mask: 0, taskIndexes: [], linkIndexes: [], cost: 0, mandatoryLink: false },
  ];
  const stateLimit = 4;
  const stateOrder = (a, b) => Number(b.mandatoryLink) - Number(a.mandatoryLink) || a.cost - b.cost
    || a.taskIndexes.join(",").localeCompare(b.taskIndexes.join(","))
    || a.linkIndexes.join(",").localeCompare(b.linkIndexes.join(","));
  for (const item of floorItems) {
    if (item.type === "link" && mandatoryLinkIndexes.includes(item.index)) continue;
    const itemMask = maskFor(item);
    const next = [...floorStates];
    for (const state of floorStates) {
      const mask = state.mask | itemMask;
      if (mask === state.mask) continue;
      next.push({
        mask,
        taskIndexes: item.type === "task" ? [...state.taskIndexes, item.index] : state.taskIndexes,
        linkIndexes: item.type === "link" ? [...state.linkIndexes, item.index] : state.linkIndexes,
        cost: state.cost + item.cost,
        mandatoryLink: state.mandatoryLink,
      });
    }
    const byMask = new Map();
    for (const state of next) {
      const bucket = byMask.get(state.mask) || [];
      bucket.push(state);
      bucket.sort(stateOrder);
      if (bucket.length > stateLimit) bucket.length = stateLimit;
      byMask.set(state.mask, bucket);
    }
    floorStates = [...byMask.values()].flat();
  }
  const maskBits = (mask) => (mask & requiredMask).toString(2).replace(/0/g, "").length;
  const rankedFloorStates = floorStates
    .sort((a, b) => maskBits(b.mask) - maskBits(a.mask) || Number(b.mandatoryLink) - Number(a.mandatoryLink) || b.mask - a.mask || a.cost - b.cost)
    .slice(0, 64);
  let floorState;
  for (const state of rankedFloorStates) {
    if (fits(state.taskIndexes, state.linkIndexes.map((index) => links[index]))) {
      floorState = state;
      break;
    }
  }
  if (floorState) {
    for (const index of floorState.taskIndexes) { chosenIndexes.push(index); chosenSet.add(index); }
    for (const index of floorState.linkIndexes) { chosenLinks.push(links[index]); chosenLinkIndexes.add(index); }
  }

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

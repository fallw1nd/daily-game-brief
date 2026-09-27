export const CALENDAR_PLATFORM_FAMILIES = ["PC", "PlayStation", "Xbox", "Nintendo"];

const array = (value) => Array.isArray(value) ? value : value == null || value === "" ? [] : [value];
const unique = (values) => [...new Set(values)];

export function calendarPlatformFamily(platform) {
  const value = String(platform || "").trim();
  if (/^pc$/i.test(value)) return "PC";
  if (/^(ps|playstation)/i.test(value)) return "PlayStation";
  if (/^(xbox|xs)/i.test(value)) return "Xbox";
  if (/^(nintendo|ns)/i.test(value)) return "Nintendo";
  return "Unknown";
}

export function leadPlatformFamilies(lead) {
  const observed = array(lead?.observations).flatMap((observation) => [
    ...array(observation?.platforms), observation?.platform,
  ]);
  const values = [...array(lead?.platforms), ...array(lead?.platformHints), ...observed];
  return unique(values.map(calendarPlatformFamily).filter((family) => family !== "Unknown"));
}

function rankScore(lead) {
  // Material review work outranks popularity hints. The latter only break ties.
  const conflict = lead?.dateConflict === true || lead?.dateConflictStatus === "conflict";
  const uncertain = lead?.dateConflictUncertain === true || lead?.dateConflictStatus === "uncertain";
  const baselineChange = lead?.baselineChanged === true;
  return Number(conflict) * 8 + Number(uncertain) * 7 + Number(baselineChange) * 4
    + Number(Boolean(lead?.knownTitle)) * 0.25
    + Number(Boolean(lead?.crossSource)) * 0.25
    + Math.min(Math.max(Number(lead?.priority) || 0, 0), 3) * 0.05;
}

export function rankCalendarLeads(leads = []) {
  return [...leads].sort((a, b) => rankScore(b) - rankScore(a)
    || String(a?.date || "9999-99-99").localeCompare(String(b?.date || "9999-99-99"))
    || String(a?.title || "").localeCompare(String(b?.title || ""))
    || String(a?.identity?.key || "").localeCompare(String(b?.identity?.key || "")));
}

/** Select editorial tasks deterministically, offering each represented family a turn. */
export function selectCalendarLeads(leads = [], maxCandidates = 100) {
  const ranked = rankCalendarLeads(leads);
  const buckets = new Map(CALENDAR_PLATFORM_FAMILIES.map((family) => [family, []]));
  const unknown = [];
  for (const [index, lead] of ranked.entries()) {
    const families = leadPlatformFamilies(lead);
    if (!families.length) unknown.push(index);
    else for (const family of families) buckets.get(family).push(index);
  }
  const selected = [];
  const selectedIndexes = new Set();
  const order = [...CALENDAR_PLATFORM_FAMILIES, "Unknown"];
  while (selected.length < maxCandidates) {
    let progressed = false;
    for (const family of order) {
      const bucket = family === "Unknown" ? unknown : buckets.get(family);
      while (bucket.length && selectedIndexes.has(bucket[0])) bucket.shift();
      if (!bucket.length || selected.length >= maxCandidates) continue;
      const index = bucket.shift();
      selectedIndexes.add(index);
      selected.push(ranked[index]);
      progressed = true;
    }
    if (!progressed) break;
  }
  return { ranked, candidates: selected, capOmittedTasks: Math.max(0, ranked.length - selected.length) };
}

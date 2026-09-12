// Optional archive v2 fields use the existing data-validation boundary.
export function validateShowcaseData(edition) {
  const errors = [];
  const groups = edition.showcases;
  const entries = Array.isArray(edition.entries) ? edition.entries : [];
  if (groups !== undefined && !Array.isArray(groups)) return ["showcases must be an array"];
  const byId = new Map();
  const entryIds = new Set(entries.map(entry => entry.id));
  for (const group of groups || []) {
    if (!group || typeof group.id !== "string" || !group.id || byId.has(group.id)) {
      errors.push("showcase IDs must be nonempty and unique"); continue;
    }
    byId.set(group.id, group);
    if (!["complete", "partial"].includes(group.status)) errors.push(`${group.id}: invalid status`);
    if (![group.title, group.titleEn].every(value => typeof value === "string" && value.trim())) errors.push(`${group.id}: bilingual titles required`);
    if (![group.total, group.covered].every(value => Number.isInteger(value) && value >= 0) || group.covered > group.total) errors.push(`${group.id}: invalid coverage counts`);
    const excluded = group.nonSubstantive || 0;
    if (!Number.isInteger(excluded) || excluded < 0 || excluded + group.covered > group.total) errors.push(`${group.id}: invalid exclusion count`);
    if (group.status === "complete" && (group.total === 0 || group.covered + excluded !== group.total || group.missing?.length)) errors.push(`${group.id}: complete status contradicts coverage`);
    if (!Array.isArray(group.entryIds) || new Set(group.entryIds).size !== group.entryIds.length || group.entryIds.some(id => !entryIds.has(id))) errors.push(`${group.id}: invalid entry links`);
  }
  for (const entry of entries) {
    if (entry.showcaseRefs !== undefined && !Array.isArray(entry.showcaseRefs)) { errors.push(`${entry.id}: showcaseRefs must be an array`); continue; }
    if (entry.showcaseBrief !== undefined && typeof entry.showcaseBrief !== "boolean") errors.push(`${entry.id}: showcaseBrief must be boolean`);
    if (entry.showcaseBrief === true && !entry.showcaseRefs?.length) errors.push(`${entry.id}: showcase brief needs references`);
    const seen = new Set();
    for (const ref of entry.showcaseRefs || []) {
      const key = `${ref?.showcaseId}:${ref?.announcementId}`;
      if (!ref || !byId.has(ref.showcaseId) || typeof ref.announcementId !== "string" || !ref.announcementId || seen.has(key)) errors.push(`${entry.id}: invalid or duplicate showcase reference`);
      seen.add(key);
      if (ref?.factIds !== undefined && (!Array.isArray(ref.factIds) || new Set(ref.factIds).size !== ref.factIds.length || ref.factIds.some(id => typeof id !== "string" || !id))) errors.push(`${entry.id}: invalid fact identities`);
      if (!byId.get(ref?.showcaseId)?.entryIds?.includes(entry.id)) errors.push(`${entry.id}: missing showcase backlink`);
    }
  }
  for (const group of byId.values()) for (const id of Array.isArray(group.entryIds) ? group.entryIds : []) {
    if (!entries.find(entry => entry.id === id)?.showcaseRefs?.some(ref => ref.showcaseId === group.id)) errors.push(`${group.id}: entry link lacks reference`);
  }
  return errors;
}

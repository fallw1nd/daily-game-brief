import { buildEditorialInput } from "./editorial-contract.mjs";
import { showcaseEvidencePackages, mergeShowcaseRefs } from "./showcase.mjs";

// Keep established fact IDs when page paragraphs move. Changed text is a new
// fact requiring review; old published evidence is never silently overwritten.
export function mergeShowcaseReports(previous, fresh) {
  if (JSON.stringify(previous.window) !== JSON.stringify(fresh.window)) throw new Error("showcase refresh changed the original edition window");
  const announcements = new Map(previous.announcements.map(item => [item.id, structuredClone(item)]));
  for (const item of fresh.announcements) {
    const old = announcements.get(item.id);
    if (!old) { announcements.set(item.id, structuredClone(item)); continue; }
    const facts = [...(old.factUnits || [])];
    const usedIds = new Set(facts.map(fact => fact.id));
    for (const fact of item.factUnits || []) {
      if (facts.some(existing => existing.text === fact.text)) continue;
      let number = facts.length;
      let id = `${item.id}:fact-${number}`;
      while (usedIds.has(id)) id = `${item.id}:fact-${++number}`;
      usedIds.add(id); facts.push({ ...fact, id });
    }
    announcements.set(item.id, { ...old, ...item, factUnits: facts,
      evidence: [...(old.evidence || []), ...(item.evidence || [])].filter((source, index, all) => all.findIndex(other => other.url === source.url && other.locator === source.locator && other.text === source.text) === index) });
  }
  const events = new Map(previous.events.map(event => [event.id, { ...event, sources: event.sources.map(source => ({ ...source, inventoryComplete: false, status: "not_rechecked" })) }]));
  for (const event of fresh.events) events.set(event.id, event);
  return { ...fresh, events: [...events.values()], announcements: [...announcements.values()] };
}

export function refreshedShowcaseBatches({ report, canonical, template, generation, maxChars = 120000 }) {
  const manifest = { events: report.events, announcements: report.announcements.map(({ id, showcaseId, factUnits }) => ({ id, showcaseId, factUnits: (factUnits || []).map(({ id }) => ({ id })) })), coverage: report.coverage };
  const published = mergeShowcaseRefs(canonical.entries.flatMap(entry => entry.showcaseRefs || []));
  let remaining = showcaseEvidencePackages(report).filter(item => !item.showcaseRefs.every(ref => {
    const covered = published.find(candidate => candidate.showcaseId === ref.showcaseId && candidate.announcementId === ref.announcementId);
    return covered && item.showcaseFacts.every(fact => covered.factIds?.includes(fact.id));
  }));
  const reserve = JSON.stringify(manifest).length;
  const result = [];
  while (remaining.length) {
    let limit = maxChars - reserve;
    let input;
    while (true) {
      input = buildEditorialInput({ window: report.window, packages: remaining }, limit, null);
      if (!input.packages.length) throw new Error("refreshed showcase evidence cannot fit in a bounded packet");
      input.showcases = manifest;
      input.budget.maxInputChars = maxChars;
      const actual = JSON.stringify(input).length;
      if (actual + 32 <= maxChars) {
        input.budget.usedInputChars = actual + 32;
        input.budget.estimatedInputTokens = Math.ceil((actual + 32) / 4);
        break;
      }
      limit -= actual - maxChars + 256;
    }
    const packet = { ...template, generatedAt: report.generatedAt, finalizedAt: report.generatedAt, editorialInput: input,
      continuation: { scope: "showcase", preservePublished: true, index: result.length } };
    result.push({ name: `${canonical.id}-refresh-${generation}-${result.length}.json`, scope: "showcase", status: "pending", eventKeys: input.packages.map(item => item.eventKey), packet });
    const consumed = new Set(input.packages.map(item => item.eventKey));
    remaining = remaining.filter(item => !consumed.has(item.eventKey));
  }
  return result;
}

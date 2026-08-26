export function updateLedger(snapshot, previous = { events: {} }, options = {}) {
  const generatedAt = snapshot.generatedAt || options.now || new Date().toISOString();
  const retentionDays = Number(options.retentionDays || 45);
  const maxEvents = Number(options.maxEvents || 5000);
  const events = { ...(previous.events || {}) };
  for (const candidate of snapshot.candidates || []) {
    const prior = events[candidate.eventKey] || {};
    const windowsSeen = [...new Set([...(prior.windowsSeen || []), snapshot.window.id])].slice(-20);
    const sources = [...new Set([...(prior.sources || []), ...(candidate.appearances || []).map((item) => item.sourceId)])];
    events[candidate.eventKey] = {
      eventKey: candidate.eventKey,
      eventKind: candidate.eventKind,
      subjectKey: candidate.subjectKey,
      lastHeadline: candidate.headline,
      firstSeenAt: prior.firstSeenAt || generatedAt,
      lastSeenAt: generatedAt,
      lastPublishedAt: candidate.publishedAt || prior.lastPublishedAt || null,
      tier: candidate.tier,
      score: candidate.score,
      sources,
      windowsSeen,
      occurrences: Number(prior.occurrences || 0) + 1,
      state: candidate.adjacentMatch ? "covered-adjacent" : "candidate",
    };
  }
  const cutoff = Date.parse(generatedAt) - retentionDays * 86400000;
  const retained = Object.values(events)
    .filter((item) => Date.parse(item.lastSeenAt) >= cutoff)
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .slice(0, maxEvents);
  return {
    schemaVersion: 1,
    updatedAt: generatedAt,
    retentionDays,
    totals: { events: retained.length, recurring: retained.filter((item) => item.windowsSeen.length > 1).length },
    events: Object.fromEntries(retained.map((item) => [item.eventKey, item])),
  };
}

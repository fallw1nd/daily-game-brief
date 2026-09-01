function belongsToSnapshotWindow(candidate) {
  return !candidate.timeRelation || candidate.timeRelation === "window" || candidate.timeRelation === "unknown";
}

function retainLedgerEvent(item) {
  return item.tier !== "C" || Boolean(item.editorialState) || item.tracking?.active === true;
}

export function updateLedger(snapshot, previous = { events: {} }, options = {}) {
  const generatedAt = snapshot.generatedAt || options.now || new Date().toISOString();
  const retentionDays = Number(options.retentionDays || 45);
  const maxEvents = Number(options.maxEvents || 5000);
  const events = { ...(previous.events || {}) };
  for (const candidate of snapshot.candidates || []) {
    const prior = events[candidate.eventKey] || {};
    const priorWindows = prior.windowsSeen || [];
    const windowsSeen = belongsToSnapshotWindow(candidate)
      ? [...new Set([...priorWindows, snapshot.window.id])].slice(-20)
      : priorWindows.slice(-20);
    const sources = [...new Set([...(prior.sources || []), ...(candidate.appearances || []).map((item) => item.sourceId)])];
    events[candidate.eventKey] = {
      ...prior,
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
    .filter((item) => Math.max(Date.parse(item.lastSeenAt) || 0, Date.parse(item.lastDecisionAt) || 0) >= cutoff)
    .filter(retainLedgerEvent)
    .sort((a, b) => Math.max(Date.parse(b.lastSeenAt) || 0, Date.parse(b.lastDecisionAt) || 0) -
      Math.max(Date.parse(a.lastSeenAt) || 0, Date.parse(a.lastDecisionAt) || 0))
    .slice(0, maxEvents);
  return {
    schemaVersion: Math.max(2, Number(previous.schemaVersion || 1)),
    updatedAt: generatedAt,
    retentionDays,
    totals: {
      events: retained.length,
      recurring: retained.filter((item) => (item.windowsSeen || []).length > 1).length,
      tracking: retained.filter((item) => item.tracking?.active === true).length,
    },
    events: Object.fromEntries(retained.map((item) => [item.eventKey, item])),
  };
}

function selectedSourceUrls(decision, packetItem) {
  const selected = (packetItem?.sources || []).filter((source) =>
    (decision.sourceIndexes || []).includes(source.sourceIndex)
  ).map((source) => source.canonicalUrl || source.url);
  return [...new Set([...selected, ...(decision.additionalSources || []).map((source) => source.url)].filter(Boolean))];
}

function totals(events) {
  const values = Object.values(events);
  return {
    events: values.length,
    recurring: values.filter((item) => (item.windowsSeen || []).length > 1).length,
    tracking: values.filter((item) => item.tracking?.active === true).length,
    included: values.filter((item) => item.editorialState === "included").length,
    excluded: values.filter((item) => item.editorialState === "excluded").length,
    closed: values.filter((item) => item.editorialState === "closed").length,
  };
}

export function applyEditorialFeedback(ledger, editorial, packet, options = {}) {
  const decidedAt = options.decidedAt || new Date().toISOString();
  const editionId = editorial.editionId;
  const events = structuredClone(ledger?.events || {});
  const packages = new Map((packet?.editorialInput?.packages || []).map((item) => [item.eventKey, item]));
  const trackingItems = new Map((packet?.editorialInput?.trackingQueue || []).map((item) => [item.eventKey, item]));
  let applied = false;

  for (const decision of editorial.decisions || []) {
    const prior = events[decision.eventKey] || {};
    if (prior.lastDecisionEdition && prior.lastDecisionEdition > editionId) continue;
    applied = true;
    const reminder = trackingItems.get(decision.eventKey);
    const packetItem = packages.get(decision.eventKey);
    const wasTracking = prior.tracking?.active === true;
    const isTracking = decision.tracking === true;
    const closesTracking = wasTracking && !isTracking;
    const editorialState = isTracking
      ? "tracking"
      : closesTracking
        ? "closed"
        : decision.decision === "include" ? "included" : "excluded";
    const historyItem = {
      editionId,
      decidedAt,
      decision: decision.decision,
      tracking: isTracking,
      reason: decision.reason,
    };
    const decisionHistory = [
      ...(prior.decisionHistory || []).filter((item) => item.editionId !== editionId),
      historyItem,
    ].slice(-20);
    const sourceUrls = [...new Set([
      ...(prior.sourceUrls || []),
      ...selectedSourceUrls(decision, packetItem),
    ])];
    const tracking = isTracking
      ? {
          active: true,
          openedAt: prior.tracking?.openedAt || decidedAt,
          updatedAt: decidedAt,
          editionId,
          reason: decision.reason,
        }
      : wasTracking
        ? {
            ...prior.tracking,
            active: false,
            updatedAt: decidedAt,
            closedAt: decidedAt,
            editionId,
            reason: decision.reason,
          }
        : prior.tracking;
    const windowsSeen = [...new Set([...(prior.windowsSeen || []), editionId])].slice(-20);
    events[decision.eventKey] = {
      ...prior,
      eventKey: decision.eventKey,
      eventKind: prior.eventKind || packetItem?.eventKind || reminder?.eventKind || decision.releaseType || "editorial",
      subjectKey: prior.subjectKey || packetItem?.subjectKey || reminder?.subjectKey || decision.titleKey || decision.eventKey,
      lastHeadline: decision.headline || prior.lastHeadline || packetItem?.headline || reminder?.lastHeadline || decision.eventKey,
      firstSeenAt: prior.firstSeenAt || packetItem?.ledger?.firstSeenAt || reminder?.firstSeenAt || decidedAt,
      lastSeenAt: prior.lastSeenAt || packetItem?.ledger?.lastSeenAt || reminder?.lastSeenAt || decidedAt,
      windowsSeen,
      sourceUrls,
      editorialState,
      lastDecision: decision.decision,
      lastDecisionReason: decision.reason,
      lastDecisionEdition: editionId,
      lastDecisionAt: decidedAt,
      decisionHistory,
      ...(tracking ? { tracking } : {}),
    };
  }

  if (!applied) return ledger;

  return {
    schemaVersion: Math.max(2, Number(ledger?.schemaVersion || 1)),
    updatedAt: new Date(Math.max(Date.parse(ledger?.updatedAt) || 0, Date.parse(decidedAt) || 0)).toISOString(),
    retentionDays: Number(ledger?.retentionDays || 45),
    totals: totals(events),
    events,
  };
}

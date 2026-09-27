function parsedTime(value) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : null;
}

function packageHasOpenedEvidence(item) {
  return (item?.sources || []).some((source) => source?.status === "opened" && source?.evidenceText);
}

export function shouldQueueTrackingReminder(item, evidenceItem = null) {
  if (item?.tracking?.active !== true) return false;
  if (packageHasOpenedEvidence(evidenceItem)) return true;
  if (!item.lastDecisionAt) return true;

  const lastSeenAt = parsedTime(item.lastSeenAt);
  const lastDecisionAt = parsedTime(item.lastDecisionAt);
  // Invalid timestamps are kept actionable rather than silently suppressing review.
  if (lastSeenAt === null || lastDecisionAt === null) return true;
  return lastSeenAt > lastDecisionAt;
}

export function buildEditorialLedgerView(ledger, evidence) {
  if (!ledger || typeof ledger !== "object") {
    return { ledger, metrics: { totalActiveTracking: 0, queuedActiveTracking: 0, suppressedNoNewEvidence: 0 } };
  }

  const evidenceByKey = new Map((evidence?.packages || []).map((item) => [item.eventKey, item]));
  const events = {};
  let totalActiveTracking = 0;
  let queuedActiveTracking = 0;
  let suppressedNoNewEvidence = 0;

  for (const [key, item] of Object.entries(ledger.events || {})) {
    if (item?.tracking?.active !== true) {
      events[key] = item;
      continue;
    }

    totalActiveTracking += 1;
    if (shouldQueueTrackingReminder(item, evidenceByKey.get(item.eventKey || key))) {
      events[key] = item;
      queuedActiveTracking += 1;
    } else {
      suppressedNoNewEvidence += 1;
    }
  }

  return {
    ledger: { ...ledger, events },
    metrics: { totalActiveTracking, queuedActiveTracking, suppressedNoNewEvidence },
  };
}

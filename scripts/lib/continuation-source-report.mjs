const pendingNewsBudget = /^本编辑包还有 \d+ 个候选待编辑核验；不代表已完成收录。$/;
const union = (...groups) => [...new Set(groups.flatMap(group => group || []))];

export function isPendingNewsBudget(value) {
  return typeof value === "string" && pendingNewsBudget.test(value);
}

function combinedNotes(previous, current, { history, currentLabel, earlierLabel, scope }) {
  const currentPart = `${currentLabel}${current || ""}`;
  const old = (previous || "").split("\n\n").filter(note => note && note !== scope).join("\n\n");
  // Digest replays normally exit earlier; keep this merge idempotent as well.
  if (old.endsWith(currentPart)) return [old, scope].filter(Boolean).join("\n\n");
  const historical = old.replaceAll(currentLabel, earlierLabel);
  return [historical ? `${historical.startsWith(history) ? "" : history}${historical}` : null,
    currentPart, scope].filter(Boolean).join("\n\n");
}

// Only the trusted same-edition news-continuation path calls this. A compact
// batch replaces verdicts for its event keys, not the rest of the edition audit.
export function mergeNewsSourceReport(previous, current, { decisions, entries }) {
  if (!previous) return current;
  const decided = new Set(decisions.map(item => item.eventKey));
  const included = new Set(entries.map(item => item.eventKey).filter(Boolean));
  const eventKey = row => row.split("：", 1)[0];
  return {
    ...current,
    checked: union(previous.checked, current.checked),
    checkedGroups: union(previous.checkedGroups, current.checkedGroups),
    // Old packet budgets are not current queue state. The new news packet's
    // budget, if any, is the only pending-news count this batch can assert.
    limited: union((previous.limited || []).filter(row => !isPendingNewsBudget(row)), current.limited),
    limitedSources: union(previous.limitedSources, current.limitedSources),
    trackingResults: entries.filter(item => item.tracking).map(item => `${item.headline}：继续追踪。`),
    excludedMajorCandidates: union(
      (previous.excludedMajorCandidates || []).filter(row => !decided.has(eventKey(row)) && !included.has(eventKey(row))),
      (current.excludedMajorCandidates || []).filter(row => !included.has(eventKey(row))),
    ),
    note: combinedNotes(previous.note, current.note, {
      history: "此前审核记录（历史批次计数，不代表当前待办）：\n",
      currentLabel: "本次新闻补遗：\n", earlierLabel: "此前新闻补遗：\n",
      scope: "auditStats保留最近新闻批次口径；图片计数对应补遗后的整期新闻，来源核验与非收录说明按本期累计保留。",
    }),
  };
}

export function mergeEnglishNewsSourceReport(previous, current) {
  if (!previous) return current;
  if (!current) return previous;
  return {
    checked: union(previous.checked, current.checked),
    limited: union(previous.limited, current.limited),
    note: combinedNotes(previous.note, current.note, {
      history: "Earlier review history (past batch counts, not current pending work):\n",
      currentLabel: "Current news continuation:\n", earlierLabel: "Earlier news continuation:\n",
    }),
  };
}

import { gitBlobSha } from "./edition-state.mjs";

// Pages are supplementary calendar research leads, never verified publication
// facts. Their exact bytes are pinned inside the acknowledged Daily packet.
export function buildCalendarWorkPages(report, { maxChars = 24000 } = {}) {
  if (!Number.isInteger(maxChars) || maxChars < 1000) throw new Error("invalid calendar page budget");
  const tasks = [
    ...(report.allCandidates || report.candidates || []).map(candidate => ({ kind: "candidate", candidate })),
    ...(report.reviewLinks || []).map(link => ({ kind: "review-link", link })),
  ];
  const pages = [];
  let items = [];
  const document = items => ({ schemaVersion: 1, editionDate: report.editionDate, window: report.window, verification: "open_primary_source_before_publication", items });
  const serialize = items => JSON.stringify(document(items)) + "\n";
  const flush = () => {
    if (!items.length) return;
    const text = serialize(items);
    const name = `calendar-work-${pages.length + 1}.json`;
    pages.push({ name, blobSha: gitBlobSha(text), count: items.length, chars: text.length, text });
    items = [];
  };
  for (const task of tasks) {
    if (serialize([...items, task]).length > maxChars) flush();
    if (serialize([task]).length > maxChars) throw new Error("a calendar research task exceeds its page budget; no work was silently dropped");
    items.push(task);
  }
  flush();
  return {
    pages,
    manifest: {
      schemaVersion: 1,
      editionDate: report.editionDate,
      totalTasks: tasks.length,
      unavailableUpstreamTasks: report.allCandidates ? 0 : Number(report.omittedCandidates || 0),
      pages: pages.map(({ text, ...receipt }) => receipt),
    },
  };
}

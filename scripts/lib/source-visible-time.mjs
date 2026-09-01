const supportedSources = new Set(["3dm-news"]);

function visibleText(html) {
  return String(html || "")
    .replace(/<(script|style|svg|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function sourceVisiblePublishedAt(html, source) {
  if (!supportedSources.has(source?.id)) return null;
  const match = visibleText(html).match(/(?:发布时间|时间)\s*[:：]\s*(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/u);
  if (!match) return null;
  const parsed = Date.parse(`${match[1]}T${match[2]}+08:00`);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

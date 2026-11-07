const prefixes = { am: "早报｜", pm: "晚报｜", daily: "日报｜" };

export function archiveTitlePrefix(period) {
  return prefixes[period] || null;
}

export function hasValidArchiveTitle(title, period) {
  const prefix = archiveTitlePrefix(period);
  const value = typeof title === "string" ? title.trim() : "";
  return Boolean(prefix && value.startsWith(prefix) && [...value].length >= 8 && [...value].length <= 40);
}

// Diagnostics only: match the existing validator's counting rule without changing it.
// Bound rejected copy so an oversized submission cannot flood the next editorial turn.
export function archiveTitleDetails(title, field = "archiveTitle") {
  if (typeof title !== "string") return `${field} received ${title === null ? "null" : typeof title}; expected a string`;
  const characters = [...title.trim()];
  const count = characters.length;
  const preview = JSON.stringify(characters.slice(0, 120).join(""));
  const truncated = count > 120 ? " (preview truncated to 120 characters)" : "";
  const adjustment = count > 40 ? `; exceeds 40 by ${count - 40}` : count < 8 ? `; needs ${8 - count} more to reach 8` : "";
  return `${field}=${preview}${truncated}; characterCount=${count}${adjustment}; counted as Unicode code points after trimming, including prefix and punctuation`;
}

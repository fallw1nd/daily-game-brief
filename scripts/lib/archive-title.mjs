const prefixes = { am: "早报｜", pm: "晚报｜", daily: "日报｜" };

export function archiveTitlePrefix(period) {
  return prefixes[period] || null;
}

export function hasValidArchiveTitle(title, period) {
  const prefix = archiveTitlePrefix(period);
  const value = typeof title === "string" ? title.trim() : "";
  return Boolean(prefix && value.startsWith(prefix) && [...value].length >= 8 && [...value].length <= 40);
}

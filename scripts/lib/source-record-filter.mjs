function compilePatterns(patterns = []) {
  return patterns.map((pattern) => new RegExp(pattern, "iu"));
}

export function filterSourceRecords(records, source, filterConfig = {}) {
  const sourceFilter = filterConfig?.sources?.[source.id] || null;
  if (!sourceFilter) return { records, filteredCount: 0 };

  const headlinePatterns = compilePatterns(sourceFilter.excludeHeadlinePatterns || []);
  const urlPatterns = compilePatterns(sourceFilter.excludeUrlPatterns || []);
  const kept = records.filter((record) => {
    if (headlinePatterns.some((pattern) => pattern.test(record.headline || ""))) return false;
    if (urlPatterns.some((pattern) => pattern.test(record.url || ""))) return false;
    return true;
  });

  return {
    records: kept,
    filteredCount: records.length - kept.length,
  };
}

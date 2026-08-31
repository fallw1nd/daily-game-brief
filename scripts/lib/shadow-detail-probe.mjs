function sourceMap(config = {}) {
  return new Map((config.sources || []).map((source) => [source.id, source]));
}

function urlAllowed(urlValue, source) {
  try {
    const url = new URL(urlValue);
    if (url.protocol !== "https:") return false;
    if (source.linkPattern) return new RegExp(source.linkPattern, "i").test(url.href);
    return url.hostname === new URL(source.url).hostname;
  } catch {
    return false;
  }
}

export function selectShadowDetailTargets(payload = {}, config = {}, options = {}) {
  const maxPerSource = Math.max(1, Number(options.maxPerSource || 2));
  const maxTotal = Math.max(1, Number(options.maxTotal || 30));
  const sources = sourceMap(config);
  const bySource = new Map();

  for (const candidate of payload.shadowCandidates || []) {
    for (const appearance of candidate.appearances || []) {
      if (appearance.publishedAt) continue;
      const source = sources.get(appearance.sourceId);
      if (!source || source.mode !== "shadow" || !urlAllowed(appearance.url, source)) continue;
      const bucket = bySource.get(source.id) || new Map();
      if (!bucket.has(appearance.url)) {
        bucket.set(appearance.url, {
          sourceId: source.id,
          sourceLabel: source.label,
          url: appearance.url,
        });
      }
      bySource.set(source.id, bucket);
    }
  }

  const targets = [];
  for (const source of config.sources || []) {
    if (source.mode !== "shadow") continue;
    for (const target of [...(bySource.get(source.id)?.values() || [])].slice(0, maxPerSource)) {
      if (targets.length >= maxTotal) return targets;
      targets.push(target);
    }
  }
  return targets;
}

export function summarizeShadowDetailProbe(results = [], config = {}) {
  const sources = sourceMap(config);
  const grouped = new Map();
  for (const result of results) {
    const bucket = grouped.get(result.sourceId) || [];
    bucket.push(result);
    grouped.set(result.sourceId, bucket);
  }

  const bySource = [...grouped.entries()].map(([sourceId, items]) => {
    const resolved = items.filter((item) => item.status === "resolved").length;
    const limited = items.filter((item) => item.status === "limited").length;
    const unresolved = items.length - resolved - limited;
    return {
      sourceId,
      sourceLabel: sources.get(sourceId)?.label || sourceId,
      attempted: items.length,
      resolved,
      unresolved,
      limited,
      resolutionRate: items.length ? resolved / items.length : 0,
      samples: items,
    };
  }).sort((a, b) => b.resolutionRate - a.resolutionRate || a.sourceId.localeCompare(b.sourceId));

  return {
    attempted: results.length,
    resolved: results.filter((item) => item.status === "resolved").length,
    unresolved: results.filter((item) => item.status === "unresolved").length,
    limited: results.filter((item) => item.status === "limited").length,
    bySource,
  };
}

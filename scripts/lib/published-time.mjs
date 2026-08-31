function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]+)"|'([^']+)'|([^\\s>]+))`, "i"));
  return match?.[1] || match?.[2] || match?.[3] || "";
}

function asIso(value) {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}

const META_KEYS = new Set([
  "article:published_time",
  "datepublished",
  "date",
  "pubdate",
  "publishdate",
  "publish_date",
  "parsely-pub-date",
]);

export function parsePublishedTime(html = "") {
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const key = (attr(tag, "property") || attr(tag, "name") || attr(tag, "itemprop")).toLowerCase();
    if (!META_KEYS.has(key)) continue;
    const parsed = asIso(attr(tag, "content"));
    if (parsed) return parsed;
  }

  for (const match of html.matchAll(/["']datePublished["']\s*:\s*["']([^"']+)["']/gi)) {
    const parsed = asIso(match[1]);
    if (parsed) return parsed;
  }

  for (const tag of html.match(/<time\b[^>]*>/gi) || []) {
    const parsed = asIso(attr(tag, "datetime"));
    if (parsed) return parsed;
  }

  return null;
}

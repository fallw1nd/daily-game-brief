function hostMatches(hostname, allowedHost) {
  return hostname === allowedHost || hostname.endsWith(`.${allowedHost}`);
}

export function classifyOfficialUrl(input, registry) {
  let url;
  try { url = new URL(input); } catch { return null; }
  if (url.protocol !== "https:") return null;
  for (const item of registry.domains || []) {
    if ((item.hosts || []).some((host) => hostMatches(url.hostname, host))) {
      return {domainId:item.id,independenceKey:item.independenceKey,url:url.href};
    }
  }
  return null;
}

export function extractExplicitOfficialLinks(html, baseUrl, registry, limit = 5) {
  const found = [];
  const seen = new Set();
  for (const match of String(html || "").matchAll(/<a\b[^>]*href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/gi)) {
    const href = match[1] || match[2] || match[3];
    let absolute;
    try { absolute = new URL(href, baseUrl).href; } catch { continue; }
    const classified = classifyOfficialUrl(absolute, registry);
    if (!classified || seen.has(classified.url)) continue;
    seen.add(classified.url);
    found.push(classified);
    if (found.length >= limit) break;
  }
  return found;
}

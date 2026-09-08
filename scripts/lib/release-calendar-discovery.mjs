import { JSDOM, VirtualConsole } from "jsdom";

const DAY = 86400000;
const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
export const titleIdentity = (value) => clean(value).normalize("NFKC").toLowerCase().replace(/[™®©]/g, "").replace(/[^\p{L}\p{N}]/gu, "");
const dom = (html, xml = false) => new JSDOM(html, { virtualConsole: new VirtualConsole(), ...(xml ? { contentType: "text/xml" } : {}) });

export function releaseDate(raw, referenceDate) {
  const value = clean(raw);
  let iso;
  const exact = value.match(/^(\d{4}-\d{2}-\d{2})(?:T|$)/);
  if (exact) iso = exact[1];
  else {
    const match = value.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/i);
    if (!match) return null;
    const month = months.indexOf(match[1].slice(0, 3).toLowerCase()) + 1;
    let year = Number(match[3] || referenceDate.slice(0, 4));
    if (!match[3] && referenceDate.slice(5, 7) === "12" && month === 1) year++;
    iso = `${year}-${String(month).padStart(2, "0")}-${match[2].padStart(2, "0")}`;
  }
  const time = Date.parse(iso + "T00:00:00Z");
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === iso ? iso : null;
}

export function releaseWindow(date) {
  const start = Date.parse(date + "T00:00:00Z");
  return { startInclusive: new Date(start + DAY).toISOString().slice(0, 10), endInclusive: new Date(start + 15 * DAY).toISOString().slice(0, 10) };
}
const within = (date, window) => date && date >= window.startInclusive && date <= window.endInclusive;
const https = (value) => { try { const u = new URL(value); return u.protocol === "https:" ? u.href : null; } catch { return null; } };

export function parseReleaseSource(html, source, editionDate) {
  const document = dom(html, ["xbox", "articles"].includes(source.adapter));
  const doc = document.window.document;
  const records = [];
  const reviewLinks = [];
  const add = (title, date, url, platforms = [source.platform], extra = {}) => {
    const sourceUrl = https(url);
    if (clean(title) && sourceUrl) records.push({ title: clean(title).slice(0, 180), date, url: sourceUrl, platforms, region: "US", sourceId: source.id, family: source.family, kind: source.kind, priority: source.priority, ...extra });
  };
  try {
    if (source.adapter === "steam") {
      for (const row of doc.querySelectorAll("a.tab_item, a.search_result_row")) {
        const title = row.querySelector(".tab_item_name, .title")?.textContent;
        const raw = clean(row.querySelector(".release_date, .search_released")?.textContent);
        const appId = row.getAttribute("data-ds-appid");
        if (!/^\d+$/.test(appId || "")) continue;
        if (/\b(demo|soundtrack|supporter pack)\b/i.test(title || "")) continue;
        add(title, releaseDate(raw, editionDate), `https://store.steampowered.com/app/${appId}/`, ["PC"], { dateText: raw, productId: `steam:${appId}` });
      }
    } else if (source.adapter === "nintendo") {
      const data = JSON.parse(doc.querySelector("#__NEXT_DATA__")?.textContent || "null");
      const walk = (v) => {
        if (!v || typeof v !== "object") return;
        if (v.name && v.releaseDate && v.urlKey && v.nsuid) add(v.name, releaseDate(v.releaseDate, editionDate), `https://www.nintendo.com/us/store/products/${v.urlKey}/`, [v.platform?.label || "Nintendo Switch"], { productId: `nintendo:${v.nsuid}` });
        for (const x of Object.values(v)) walk(x);
      };
      walk(data);
    } else if (source.adapter === "calendar") {
      // Only dated game rows beneath a month/year heading; never menu links or recommendations.
      for (const heading of doc.querySelectorAll("h2, h3")) {
        const year = heading.textContent.match(/20\d{2}/)?.[0];
        if (!year) continue;
        let node = heading.nextElementSibling;
        while (node && !/^H[123]$/.test(node.tagName)) {
          for (const row of node.matches("li") ? [node] : node.querySelectorAll("li")) {
            const text = clean(row.textContent);
            const match = text.match(/^(.+?)\s*\(([^)]+)\)\s*[–—-]\s*(.+)$/);
            if (!match) continue;
            const platforms = match[2].split(/,\s*/);
            add(match[1], releaseDate(match[3], year + "-01-01"), source.url, platforms, { dateText: match[3], region: "source-listed" });
          }
          node = node.nextElementSibling;
        }
      }
    } else {
      for (const item of [...doc.querySelectorAll("item")].slice(0, 15)) {
        const published = new Date(item.querySelector("pubDate")?.textContent || "");
        if (!Number.isFinite(published.getTime())) continue;
        const reference = published.toISOString().slice(0, 10);
        const age = (Date.parse(editionDate) - Date.parse(reference)) / DAY;
        if (age < -1 || age > 21) continue;
        const title = clean(item.querySelector("title")?.textContent);
        const url = https(item.querySelector("link")?.textContent);
        const body = item.getElementsByTagName("content:encoded")[0]?.textContent || item.querySelector("description")?.textContent || "";
        const page = dom(body);
        if (source.adapter === "xbox") {
          for (const link of page.window.document.querySelectorAll("p a")) {
            const match = clean(link.textContent).match(/^(.+?)\s*[–—-]\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec).+)$/i);
            if (match) add(match[1], releaseDate(match[2], reference), link.href, ["Xbox"], { announcementUrl: url, dateText: match[2] });
          }
        }
        if (url && /launch|releas|coming|next week|out |arriv/i.test(title)) reviewLinks.push({ title: title.slice(0, 180), url, published: reference, sourceId: source.id });
        page.window.close();
      }
    }
  } finally { document.window.close(); }
  const unique = [...new Map(records.map(r => [`${r.productId || titleIdentity(r.title)}|${r.platforms.join(",")}|${r.date}`, r])).values()];
  return { records: unique, reviewLinks: reviewLinks.slice(0, 8) };
}

export async function fetchReleaseSource(source, config, fetcher = fetch) {
  const url = new URL(source.url);
  if (url.protocol !== "https:") throw new Error("HTTPS required");
  const response = await fetcher(url.href, { signal: AbortSignal.timeout(config.timeoutMs), redirect: "error", headers: { "User-Agent": "DailyGameBriefCalendar/1.0 (+https://fallw1nd.github.io/daily-game-brief/)", Accept: "text/html, application/rss+xml, application/xml" } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (Number(response.headers.get("content-length")) > config.maxResponseBytes) throw new Error("response too large");
  const reader = response.body.getReader();
  const chunks = []; let size = 0;
  try {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > config.maxResponseBytes) throw new Error("response too large"); chunks.push(value); }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(chunks).toString("utf8");
}

export async function collectReleaseCalendar({ config, editionDate, baseline = [], titleRegistry = {}, fetcher = fetch, now = new Date() }) {
  const window = releaseWindow(editionDate);
  const known = new Set(Object.entries(titleRegistry.translations || {}).flatMap(([key, v]) => [key, v.titleZhCn, ...(v.titleEnAliases || [])]).filter(Boolean).map(titleIdentity));
  const baselineNames = new Set(baseline.flatMap(v => [v.title?.title_en, v.title?.title_zh_cn]).filter(Boolean).map(titleIdentity));
  const results = [];
  // Two requests at a time, fixed source count; an outage is diagnostic, never a news publication blocker.
  for (let i = 0; i < config.sources.length; i += 2) {
    const batch = await Promise.all(config.sources.slice(i, i + 2).map(async source => {
      try {
        const parsed = { records: [], reviewLinks: [] };
        let pages = 0;
        let pageError;
        for (let page = 1; page <= (source.maxPages || 1); page++) {
          const url = new URL(source.url);
          if (page > 1) url.searchParams.set("page", String(page));
          let result;
          try { result = parseReleaseSource(await fetchReleaseSource({ ...source, url: url.href }, config, fetcher), source, editionDate); }
          catch (error) { pageError = String(error.message).slice(0, 150); break; }
          parsed.records.push(...result.records); parsed.reviewLinks.push(...result.reviewLinks); pages++;
          if (!result.records.length || result.records.some(r => r.date > window.endInclusive)) break;
        }
        const records = parsed.records.filter(r => within(r.date, window));
        return { source, ...parsed, records, pages, parsedCount: parsed.records.length, status: pageError ? (parsed.records.length ? "partial_failure" : "failed") : parsed.records.length || parsed.reviewLinks.length ? "partial" : "empty_or_changed", ...(pageError ? { error: pageError } : {}) };
      } catch (error) { return { source, records: [], reviewLinks: [], parsedCount: 0, status: "failed", error: String(error.message).slice(0, 150) }; }
    }));
    results.push(...batch);
  }
  const all = results.flatMap(r => r.records);
  const groups = new Map();
  for (const record of all) {
    const key = `${record.productId || titleIdentity(record.title)}|${record.platforms.join(",")}|${record.region}`;
    const previous = groups.get(key);
    if (previous) {
      previous.sources = [...new Set([...previous.sources, record.sourceId])];
      previous.dates = [...new Set([...previous.dates, record.date])];
      previous.priority = Math.max(previous.priority, record.priority);
    } else groups.set(key, { ...record, sources: [record.sourceId], dates: [record.date], knownTitle: known.has(titleIdentity(record.title)), inBaseline: baselineNames.has(titleIdentity(record.title)) });
  }
  const crossSource = new Map();
  for (const r of all) { const key = titleIdentity(r.title); const families = crossSource.get(key) || new Set(); families.add(r.family); crossSource.set(key, families); }
  const ranked = [...groups.values()].sort((a, b) => (Number(b.knownTitle) * 4 + Number(crossSource.get(titleIdentity(b.title)).size > 1) * 3 + b.priority + Number(!b.inBaseline)) - (Number(a.knownTitle) * 4 + Number(crossSource.get(titleIdentity(a.title)).size > 1) * 3 + a.priority + Number(!a.inBaseline)) || a.date.localeCompare(b.date));
  // Allocate across families before filling by priority so PC volume cannot evict console leads.
  const selected = []; const buckets = [...new Set(ranked.map(r => r.family))].map(family => ranked.filter(r => r.family === family));
  while (selected.length < config.maxCandidates && buckets.some(b => b.length)) for (const bucket of buckets) if (bucket.length && selected.length < config.maxCandidates) selected.push(bucket.shift());
  const coverage = results.map(r => ({ sourceId: r.source.id, url: r.source.url, platform: r.source.platform, status: r.status, pages: r.pages || 0, parsedCount: r.parsedCount, inWindow: r.records.length, reviewLinks: r.reviewLinks.length, ...(r.error ? { error: r.error } : {}) }));
  return { editionDate, window, fetchedAt: now.toISOString(), coverage, candidates: selected.map(r => ({ ...r, crossSource: crossSource.get(titleIdentity(r.title)).size > 1, review: "open_primary_source_before_publication" })), reviewLinks: results.flatMap(r => r.reviewLinks), omittedCandidates: ranked.length - selected.length, coverageNote: "Partial discovery, not a complete release database. Zero results or a successful fetch never prove platform coverage.", requiredChecks: ["Open primary pages for missing known titles and cross-source leads first.", "Check all four platform families over the entire 15-day window; search failed/empty sources with web lookup.", "Recheck existing releases for postponements, cancellations, region/platform and early-access differences.", "Treat listing date conflicts as unresolved; do not publish guessed dates or turn missing records into deletions."] };
}

export function boundCalendarReport(report, maxChars = 24000) {
  const bounded = { ...report, candidates: [...report.candidates], reviewLinks: [...report.reviewLinks] };
  while (JSON.stringify(bounded).length > maxChars && bounded.candidates.length) { bounded.candidates.pop(); bounded.omittedCandidates++; }
  while (JSON.stringify(bounded).length > maxChars && bounded.reviewLinks.length) bounded.reviewLinks.pop();
  if (JSON.stringify(bounded).length > maxChars) throw new Error("calendar diagnostics exceed budget");
  return bounded;
}

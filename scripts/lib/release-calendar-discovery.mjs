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
    const match = value.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(\d{1,2})(?:,?\s+(20\d{2}))?\b/i);
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
const PLATFORM_ORDER = ["PC", "PlayStation", "Xbox", "Nintendo"];
const platformFamilies = (platforms = []) => {
  const text = platforms.join(" ");
  return PLATFORM_ORDER.filter((platform) => (
    platform === "PC" ? /\bPC\b|Steam/i.test(text)
      : platform === "PlayStation" ? /PlayStation|\bPS[45]\b/i.test(text)
        : platform === "Xbox" ? /Xbox|Series\s*[XS]|\bXSX\b/i.test(text)
          : /Nintendo|Switch/i.test(text)
  ));
};
const priorSourceHealthScore = (sourceId, health) => {
  const item = health?.sources?.[sourceId];
  if (!item) return 0;
  if ((item.consecutiveFailures || 0) >= 2 || (item.consecutiveEmptyResponses || 0) >= 2) return -2;
  if ((item.usableResponseRateRecent || 0) >= 0.8 && (item.averageInWindowRecent || 0) >= 1) return 1;
  return 0;
};

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
        if (source.adapter === "articles" && url) {
          const datedTitle = title.match(/^(.+?)\s+(?:launches|releases|arrives|comes to|is coming to|is out|out)\b/i);
          const datedRelease = releaseDate(title, reference);
          if (datedTitle && datedRelease) add(datedTitle[1], datedRelease, url, [source.platform], { announcementUrl: url, dateText: title, leadType: "official_article_title" });
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

export async function collectReleaseCalendar({ config, editionDate, baseline = [], titleRegistry = {}, sourceHealth = null, fetcher = fetch, now = new Date() }) {
  const window = releaseWindow(editionDate);
  const known = new Set(Object.entries(titleRegistry.translations || {}).flatMap(([key, v]) => [key, v.titleZhCn, ...(v.titleEnAliases || [])]).filter(Boolean).map(titleIdentity));
  const baselineNames = new Set(baseline.flatMap(v => [v.title?.title_en, v.title?.title_zh_cn]).filter(Boolean).map(titleIdentity));
  const results = [];
  // Every configured source is still checked. Health affects ranking, never removes a platform's minimum coverage.
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
  const dateSets = new Map();
  for (const record of all) {
    const key = titleIdentity(record.title);
    const dates = dateSets.get(key) || new Set();
    dates.add(record.date);
    dateSets.set(key, dates);
  }

  // One editorial lead per title/date. Cross-store/platform hits keep all source URLs and platforms
  // instead of spending separate candidate slots on the same release fact.
  const groups = new Map();
  for (const record of all) {
    const titleKey = titleIdentity(record.title);
    const key = `${titleKey}|${record.date}`;
    const ref = { sourceId: record.sourceId, url: record.url, kind: record.kind, family: record.family };
    const previous = groups.get(key);
    if (previous) {
      previous.platforms = [...new Set([...previous.platforms, ...record.platforms])];
      previous.regions = [...new Set([...previous.regions, record.region])];
      previous.sources = [...new Set([...previous.sources, record.sourceId])];
      previous.families = [...new Set([...previous.families, record.family])];
      if (!previous.sourceRefs.some(item => item.sourceId === ref.sourceId && item.url === ref.url)) previous.sourceRefs.push(ref);
      if (record.productId) previous.productIds = [...new Set([...previous.productIds, record.productId])];
      previous.priority = Math.max(previous.priority, record.priority);
    } else {
      groups.set(key, {
        title: record.title,
        date: record.date,
        platforms: [...record.platforms],
        regions: [record.region],
        sources: [record.sourceId],
        families: [record.family],
        sourceRefs: [ref],
        productIds: record.productId ? [record.productId] : [],
        priority: record.priority,
        knownTitle: known.has(titleKey),
        inBaseline: baselineNames.has(titleKey),
      });
    }
  }

  const ranked = [...groups.values()].map((record) => {
    const crossSource = record.families.length > 1;
    const dateConflict = (dateSets.get(titleIdentity(record.title))?.size || 0) > 1;
    const primarySource = record.sourceRefs.some(ref => ref.kind === "primary");
    const healthSignals = record.sources.map(sourceId => priorSourceHealthScore(sourceId, sourceHealth));
    const healthScore = healthSignals.length ? Math.max(...healthSignals) : 0;
    const score = Number(record.knownTitle) * 3 + Number(crossSource) * 3 + Number(!record.inBaseline) * 2 + Number(primarySource) * 2 + record.priority + healthScore - Number(dateConflict);
    return { ...record, crossSource, dateConflict, primarySource, healthScore, score, platformFamilies: platformFamilies(record.platforms) };
  }).sort((a, b) => b.score - a.score || a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

  const selected = [];
  const selectedKeys = new Set();
  const selectedByPlatform = Object.fromEntries(PLATFORM_ORDER.map(platform => [platform, 0]));
  const addSelected = (candidate) => {
    const key = `${titleIdentity(candidate.title)}|${candidate.date}`;
    if (selectedKeys.has(key) || selected.length >= config.maxCandidates) return false;
    selected.push(candidate); selectedKeys.add(key);
    for (const platform of candidate.platformFamilies) selectedByPlatform[platform]++;
    return true;
  };

  const minimum = Math.max(0, Number(config.minCandidatesPerPlatform || 0));
  for (const platform of PLATFORM_ORDER) {
    while (selectedByPlatform[platform] < minimum && selected.length < config.maxCandidates) {
      const candidate = ranked.find(item => !selectedKeys.has(`${titleIdentity(item.title)}|${item.date}`) && item.platformFamilies.includes(platform));
      if (!candidate || !addSelected(candidate)) break;
    }
  }

  const familyOrder = [...new Set(ranked.flatMap(item => item.families))];
  const buckets = familyOrder.map(family => ranked.filter(item => item.families[0] === family && !selectedKeys.has(`${titleIdentity(item.title)}|${item.date}`)));
  while (selected.length < config.maxCandidates && buckets.some(bucket => bucket.length)) {
    for (const bucket of buckets) {
      while (bucket.length && selectedKeys.has(`${titleIdentity(bucket[0].title)}|${bucket[0].date}`)) bucket.shift();
      if (bucket.length && selected.length < config.maxCandidates) addSelected(bucket.shift());
    }
  }
  for (const candidate of ranked) if (selected.length < config.maxCandidates) addSelected(candidate);

  const coverage = results.map(r => ({ sourceId: r.source.id, url: r.source.url, platform: r.source.platform, status: r.status, pages: r.pages || 0, parsedCount: r.parsedCount, inWindow: r.records.length, reviewLinks: r.reviewLinks.length, ...(r.error ? { error: r.error } : {}) }));
  const discoveredByPlatform = Object.fromEntries(PLATFORM_ORDER.map(platform => [platform, ranked.filter(item => item.platformFamilies.includes(platform)).length]));
  const primaryByPlatform = Object.fromEntries(PLATFORM_ORDER.map(platform => [platform, ranked.filter(item => item.platformFamilies.includes(platform) && item.primarySource).length]));
  const platformCoverage = Object.fromEntries(PLATFORM_ORDER.map(platform => [platform, {
    discoveredCandidates: discoveredByPlatform[platform],
    selectedCandidates: selectedByPlatform[platform],
    primaryCandidates: primaryByPlatform[platform],
    status: discoveredByPlatform[platform] === 0 ? "needs_fallback" : primaryByPlatform[platform] === 0 ? "needs_primary_confirmation" : "partial",
  }]));
  const omittedByCandidateCap = Math.max(0, ranked.length - selected.length);
  const duplicateRowsMerged = Math.max(0, all.length - ranked.length);
  return {
    editionDate,
    window,
    fetchedAt: now.toISOString(),
    coverage,
    platformCoverage,
    candidates: selected,
    reviewLinks: results.flatMap(r => r.reviewLinks),
    omittedCandidates: omittedByCandidateCap,
    omissionStats: { rawInWindowRows: all.length, mergedCandidateLeads: ranked.length, duplicateRowsMerged, candidateCap: omittedByCandidateCap, packetBudget: 0, total: omittedByCandidateCap },
    coverageNote: "Partial discovery, not a complete release database. Discovery leads are not publishable calendar evidence until an official detail page is opened and identity/date/platform/region/release type are confirmed.",
    requiredChecks: ["Open primary pages for missing known titles and cross-source leads first.", "Check PC, PlayStation, Xbox and Nintendo independently across the entire 15-day window; run a narrow web fallback for needs_fallback or needs_primary_confirmation platforms.", "Recheck existing releases for postponements, cancellations, region/platform and early-access differences.", "Treat listing date conflicts as unresolved; do not publish guessed dates or turn missing records into deletions."],
  };
}

export function updateReleaseCalendarHealth(report, previous = { schemaVersion: 1, sources: {} }, checkedAt = report.fetchedAt) {
  const sources = { ...(previous.sources || {}) };
  for (const item of report.coverage || []) {
    const prior = sources[item.sourceId] || {};
    const failed = item.status === "failed";
    const empty = !failed && Number(item.inWindow || 0) === 0 && Number(item.reviewLinks || 0) === 0;
    const recent = [...(prior.recent || []), { at: checkedAt, status: item.status, inWindow: Number(item.inWindow || 0), reviewLinks: Number(item.reviewLinks || 0), pages: Number(item.pages || 0) }].slice(-14);
    const usable = recent.filter(entry => entry.status !== "failed" && (entry.inWindow > 0 || entry.reviewLinks > 0));
    sources[item.sourceId] = {
      checks: Number(prior.checks || 0) + 1,
      consecutiveFailures: failed ? Number(prior.consecutiveFailures || 0) + 1 : 0,
      consecutiveEmptyResponses: empty ? Number(prior.consecutiveEmptyResponses || 0) + 1 : 0,
      lastCheckedAt: checkedAt,
      lastSuccessAt: failed ? prior.lastSuccessAt || null : checkedAt,
      lastDataAt: empty || failed ? prior.lastDataAt || null : checkedAt,
      usableResponseRateRecent: recent.length ? usable.length / recent.length : 0,
      averageInWindowRecent: recent.length ? recent.reduce((sum, entry) => sum + entry.inWindow, 0) / recent.length : 0,
      recent,
    };
  }
  return { schemaVersion: 1, updatedAt: checkedAt, sources };
}

export function boundCalendarReport(report, maxChars = 24000) {
  const compactCandidate = (candidate) => ({
    title: candidate.title,
    date: candidate.date,
    platforms: candidate.platforms,
    ...(candidate.regions?.length === 1 ? { region: candidate.regions[0] } : { regions: candidate.regions }),
    sourceRefs: candidate.sourceRefs.map(({ sourceId, url, kind }) => ({ sourceId, url, kind })),
    ...(candidate.knownTitle ? { knownTitle: true } : {}),
    ...(candidate.inBaseline ? { inBaseline: true } : {}),
    ...(candidate.crossSource ? { crossSource: true } : {}),
    ...(candidate.dateConflict ? { dateConflict: true } : {}),
  });
  const bounded = {
    editionDate: report.editionDate,
    window: report.window,
    coverage: report.coverage,
    platformCoverage: report.platformCoverage,
    candidates: report.candidates.map(compactCandidate),
    reviewLinks: report.reviewLinks.map(({ title, url, published, sourceId }) => ({ title, url, published, sourceId })),
    omittedCandidates: report.omittedCandidates,
    omissionStats: { ...(report.omissionStats || {}), packetBudget: 0, total: report.omittedCandidates },
    coverageNote: report.coverageNote,
    requiredChecks: report.requiredChecks,
  };
  let packetBudget = 0;
  while (JSON.stringify(bounded).length > maxChars && bounded.candidates.length) { bounded.candidates.pop(); packetBudget++; }
  while (JSON.stringify(bounded).length > maxChars && bounded.reviewLinks.length) bounded.reviewLinks.pop();
  bounded.omittedCandidates = report.omittedCandidates + packetBudget;
  bounded.omissionStats.packetBudget = packetBudget;
  bounded.omissionStats.total = bounded.omittedCandidates;
  if (JSON.stringify(bounded).length > maxChars) throw new Error("calendar diagnostics exceed budget");
  return bounded;
}

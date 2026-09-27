import { JSDOM, VirtualConsole } from "jsdom";
import { aggregateCalendarLeads, dedupeCalendarObservations } from "./release-calendar-identity.mjs";
import { selectCalendarLeads } from "./release-calendar-selection.mjs";
import { selectCalendarPacket } from "./release-calendar-packet.mjs";

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
    const match = value.match(/\b(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?\s*(\d{1,2})(?:,?\s*(20\d{2})(?!\d))?\b/i);
    if (!match) return null;
    const matchEnd = (match.index || 0) + match[0].length;
    if (!match[3] && /^\s*,?\s*\d{4,}/.test(value.slice(matchEnd))) return null;
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
const articleMonth = "(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)";
const articleDateLeadPattern = new RegExp(`\\b(?:launch(?:es|ed|ing)?|release(?:s|d|ing)?|arriv(?:e|es|ed|ing)?|out)\\s+(?:on\\s+)?(${articleMonth})\\.?\\s*(\\d{1,2})(?:,?\\s*(20\\d{2})(?!\\d))?\\b`, "gi");
const articleDateLeadTestPattern = new RegExp(articleDateLeadPattern.source, "i");
const articleNegationPattern = /\b(?:no longer|will not|won['’]?t|does not|doesn['’]?t|is not|isn['’]?t|never)\b[^.!?;]{0,48}\b(?:launch(?:es|ed|ing)?|release(?:s|d|ing)?|arriv(?:e|es|ed|ing)?|out)\b/i;

function articleDateHints(text, referenceDate, window) {
  const hints = [];
  let invalid = false;
  let ambiguousRange = false;
  const negated = articleNegationPattern.test(text);
  for (const match of text.matchAll(articleDateLeadPattern)) {
    // Use the full original match's end offset; reconstructed date strings shift this boundary for compact dates like Sept22.
    const matchEnd = (match.index || 0) + match[0].length;
    const afterDate = text.slice(matchEnd);
    if (/^\s*,?\s*\d{4,}/.test(afterDate)) { invalid = true; continue; }
    const dateText = `${match[1]} ${match[2]}${match[3] ? `, ${match[3]}` : ""}`;
    const date = releaseDate(dateText, referenceDate);
    if (!date) { invalid = true; continue; }
    hints.push(date);
    if (new RegExp(`^\\s*(?:[\\u2013\\u2014-]|to)\\s*(?:${articleMonth}\\.?\\s*)?\\d{1,2}(?!\\d)`, "i").test(afterDate)) ambiguousRange = true;
    const continuationPattern = new RegExp(`^\\s*(?:,?\\s*(?:and|or)\\s+|/\\s*)(?:(${articleMonth})\\.?\\s*)?(\\d{1,2})(?:,?\\s*(20\\d{2})(?!\\d))?\\b`, "i");
    let continuation = afterDate;
    let continuationMatch;
    while ((continuationMatch = continuation.match(continuationPattern))) {
      ambiguousRange = true;
      const continuationMonth = continuationMatch[1] || match[1];
      const continuationYear = continuationMatch[3] || match[3];
      const continuationDate = releaseDate(`${continuationMonth} ${continuationMatch[2]}${continuationYear ? `, ${continuationYear}` : ""}`, referenceDate);
      if (continuationDate) hints.push(continuationDate);
      else invalid = true;
      continuation = continuation.slice(continuationMatch[0].length);
    }
  }
  const dateHints = [...new Set(hints)];
  let dateStatus;
  if (invalid && !dateHints.length) dateStatus = "invalid_date";
  else if (negated && dateHints.length) dateStatus = "ambiguous_negated";
  else if (ambiguousRange || dateHints.length > 1) dateStatus = "ambiguous_multiple";
  else if (!dateHints.length) dateStatus = "no_date";
  else if (within(dateHints[0], window)) dateStatus = "in_window";
  else if (dateHints[0] < window.startInclusive) dateStatus = "expired";
  else dateStatus = "outside_window";
  return { dateHints, dateStatus, ...(negated ? { negated: true, ambiguous: true } : {}) };
}

function articlePlatformHints(text) {
  const hints = [];
  if (/\bPS5\b|PlayStation\s*5/i.test(text)) hints.push("PS5");
  if (/\bPS4\b|PlayStation\s*4/i.test(text)) hints.push("PS4");
  if (/PlayStation\s*VR2|\bPS VR2\b/i.test(text)) hints.push("PS VR2");
  if (/\bPlayStation\b/i.test(text) && !hints.length) hints.push("PlayStation");
  return hints;
}

function articleReleaseType(text) {
  const cues = [
    ["warbond", /\bwarbond\b/gi],
    ["early_access", /\bearly access\b/gi],
    ["demo", /\b(?:demo|trial)\b/gi],
    ["update", /\b(?:update|patch|season)\b/gi],
  ];
  const markers = cues.flatMap(([type, pattern]) => [...text.matchAll(pattern)].map(match => ({ type, index: match.index || 0 })));
  const uniqueTypes = [...new Set(markers.map(({ type }) => type))];
  const dateLead = articleDateLeadPattern.exec(text);
  articleDateLeadPattern.lastIndex = 0;
  const dateEnd = dateLead ? (dateLead.index || 0) + dateLead[0].length : -1;
  if (uniqueTypes.length > 1 || (dateEnd >= 0 && markers.some(({ index }) => index > dateEnd))) return "mixed";
  if (uniqueTypes.length === 1) return uniqueTypes[0];
  if (/\b(?:launch(?:es|ed|ing)?|release(?:s|d|ing)?|arriv(?:e|es|ed|ing)?|out)\b/i.test(text)) return "game_launch";
  return "unknown";
}

export function usefulCalendarLeadCount(records, reviewLinks, window = null) {
  const names = new Set(records
    .filter(record => !window || within(record.date, window))
    .filter(record => clean(record.title))
    .map(record => titleIdentity(record.title))
    .filter(Boolean));
  const urls = new Set(reviewLinks
    .filter(link => link.dateStatus === "in_window" && https(link.url))
    .map(link => new URL(link.url).href));
  return names.size + urls.size;
}

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
        if (v.name && v.releaseDate && v.urlKey && v.nsuid) add(v.name, releaseDate(v.releaseDate, editionDate), `https://www.nintendo.com/us/store/products/${v.urlKey}/`, [clean(v.platform?.label) || "unknown"], { productId: `nintendo:${v.nsuid}`, platformFamily: "Nintendo" });
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
      const articleLinks = [];
      for (const [articleIndex, item] of [...doc.querySelectorAll("item")].slice(0, 15).entries()) {
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
        if (source.adapter === "articles" && url && (/\b(?:launch(?:es|ed|ing)?|releas(?:es|ed|ing)?|coming|next week|out|arriv(?:e|es|ed|ing)?|warbond|early access|demo|update|patch|season)\b/i.test(title) || articleDateLeadTestPattern.test(title))) {
          // Article title dates are review leads only. Article body/footer dates are intentionally not scanned.
          const dateInfo = articleDateHints(title, reference, releaseWindow(editionDate));
          const platformHints = articlePlatformHints(`${title} ${[...item.querySelectorAll("category")].map(node => node.textContent).join(" ")}`);
          const releaseTypeHint = articleReleaseType(title);
          const priority = dateInfo.dateStatus === "in_window" ? 0 : dateInfo.dateStatus === "ambiguous_multiple" || dateInfo.dateStatus === "ambiguous_negated" ? 1 : dateInfo.dateStatus === "outside_window" || dateInfo.dateStatus === "expired" ? 2 : 3;
          articleLinks.push({ title: title.slice(0, 180), url, published: reference, sourceId: source.id, dateHints: dateInfo.dateHints, dateStatus: dateInfo.dateStatus, ...(dateInfo.negated ? { negated: true, ambiguous: true } : {}), platformHints, releaseTypeHint, review: "open_primary_source_before_publication", _articleIndex: articleIndex, _priority: priority });
        }
        if (source.adapter !== "articles" && url && /launch|releas|coming|next week|out |arriv/i.test(title)) reviewLinks.push({ title: title.slice(0, 180), url, published: reference, sourceId: source.id });
        page.window.close();
      }
      if (source.adapter === "articles") {
        articleLinks.sort((a, b) => a._priority - b._priority || a._articleIndex - b._articleIndex);
        reviewLinks.push(...articleLinks.map(({ _articleIndex, _priority, ...link }) => link));
      }
    }
  } finally { document.window.close(); }
  const unique = dedupeCalendarObservations(records);
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
  const results = [];
  // Two requests at a time, fixed source count; an outage is diagnostic, never a news publication blocker.
  for (let i = 0; i < config.sources.length; i += 2) {
    const batch = await Promise.all(config.sources.slice(i, i + 2).map(async source => {
      const startedAt = Date.now();
      const parsed = { records: [], reviewLinks: [] };
      let pagesAttempted = 0;
      let pagesSucceeded = 0;
      let pagesFailed = 0;
      let parserPagesSucceeded = 0;
      let parserPagesFailed = 0;
      let sourceError;
      let parserError;
      try {
        for (let page = 1; page <= (source.maxPages || 1); page++) {
          const url = new URL(source.url);
          if (url.protocol !== "https:") throw new Error("HTTPS required");
          if (page > 1) url.searchParams.set("page", String(page));
          let body;
          pagesAttempted++;
          try {
            body = await fetchReleaseSource({ ...source, url: url.href }, config, fetcher);
            pagesSucceeded++;
          } catch (error) {
            pagesFailed++;
            sourceError = String(error?.message || error).slice(0, 150);
            break;
          }
          let result;
          try {
            result = parseReleaseSource(body, source, editionDate);
            parserPagesSucceeded++;
          } catch (error) {
            parserPagesFailed++;
            parserError = String(error?.message || error).slice(0, 150);
            break;
          }
          parsed.records.push(...result.records);
          parsed.reviewLinks.push(...result.reviewLinks);
          if (!result.records.length || result.records.some(r => r.date > window.endInclusive)) break;
        }
      } catch (error) {
        // A malformed source or an unexpected per-source processing error must not reject the batch.
        sourceError ||= String(error?.message || error).slice(0, 150);
      }
      const records = parsed.records.filter(r => within(r.date, window));
      const sourceStatus = sourceError ? (pagesSucceeded ? "partial_failure" : "failed") : "success";
      const parserStatus = parserPagesFailed ? (parserPagesSucceeded ? "partial_failure" : "failed")
        : parserPagesSucceeded && (parsed.records.length || parsed.reviewLinks.length) ? "success" : "unknown";
      const failed = Boolean(sourceError || parserError);
      const hasParsedRows = parsed.records.length > 0 || parsed.reviewLinks.length > 0;
      const status = failed ? (hasParsedRows ? "partial_failure" : "failed") : hasParsedRows ? "partial" : "empty_or_changed";
      return {
        source, ...parsed, records, parsedCount: parsed.records.length, status, sourceStatus, parserStatus,
        parserPagesSucceeded, parserPagesFailed, pagesAttempted, pagesSucceeded, pagesFailed,
        usefulLeads: usefulCalendarLeadCount(records, parsed.reviewLinks, window),
        durationMs: Date.now() - startedAt,
        ...(sourceError || parserError ? { error: sourceError || parserError } : {}),
      };
    }));
    results.push(...batch);
  }
  const all = results.flatMap(r => r.records);
  const grouped = aggregateCalendarLeads(all, { baseline, titleRegistry });
  const selection = selectCalendarLeads(grouped, config.maxCandidates);
  const coverage = results.map(r => ({
    sourceId: r.source.id, url: r.source.url, platform: r.source.platform, family: r.source.family,
    status: r.status, sourceStatus: r.sourceStatus, parserStatus: r.parserStatus,
    parserPagesSucceeded: r.parserPagesSucceeded, parserPagesFailed: r.parserPagesFailed,
    pages: r.parserPagesSucceeded, pagesAttempted: r.pagesAttempted, pagesSucceeded: r.pagesSucceeded, pagesFailed: r.pagesFailed,
    parsedCount: r.parsedCount, inWindow: r.records.length, usefulLeads: r.usefulLeads,
    durationMs: r.durationMs, reviewLinks: r.reviewLinks.length,
    ...(r.status === "empty_or_changed" ? { empty: true } : {}),
    ...(r.status === "partial_failure" ? { partialFailure: true } : {}),
    ...(r.error ? { error: r.error } : {}),
  }));
  return {
    editionDate,
    window,
    fetchedAt: now.toISOString(),
    coverage,
    candidates: selection.candidates.map(r => ({ ...r, review: "open_primary_source_before_publication" })),
    reviewLinks: results.flatMap(r => r.reviewLinks),
    omittedCandidates: selection.capOmittedTasks,
    omissionTelemetry: {
      visibleRawRows: all.length,
      uniqueTasks: grouped.length,
      dedupeReduction: Math.max(0, all.length - grouped.length),
      capOmittedTasks: selection.capOmittedTasks,
      legacyOmittedUnit: "tasks",
    },
    coverageNote: "Partial discovery, not a complete release database. Zero results or a successful fetch never prove platform coverage.",
    requiredChecks: [
      "Open primary pages for missing known titles and cross-source leads first.",
      "Check all four platform families over the entire 15-day window; search failed/empty sources with web lookup.",
      "Recheck existing releases for postponements, cancellations, region/platform and early-access differences.",
      "Treat listing date conflicts as unresolved; do not publish guessed dates or turn missing records into deletions.",
    ],
  };
}

export function boundCalendarReport(report, maxChars = 24000) {
  return selectCalendarPacket({ report, maxCandidates: 100, maxChars });
}

import { JSDOM, VirtualConsole } from "jsdom";
import { fetchReleaseSource } from "./release-calendar-discovery.mjs";
import { selectCalendarLeads, leadPlatformFamilies } from "./release-calendar-selection.mjs";

// Closed set of official hosts. Redirects are refused by fetchReleaseSource;
// discovery text must never turn the collector into an arbitrary URL fetcher.
const hosts = new Set(["store.steampowered.com", "www.nintendo.com", "www.xbox.com", "news.xbox.com", "store.playstation.com", "blog.playstation.com", "www.playstation.com"]);
export function officialCalendarUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port && hosts.has(url.hostname) ? url.href : null;
  } catch { return null; }
}

export function extractCalendarEvidence(html, url) {
  const page = new JSDOM(html, { virtualConsole: new VirtualConsole() });
  try {
    const doc = page.window.document;
    const title = doc.querySelector(".apphub_AppName, h1")?.textContent?.trim() || doc.title;
    // Preserve structured data as evidence, never as an automatically accepted
    // release. Date/platform/region/type and title still require editorial review.
    const structured = [...doc.querySelectorAll('script[type="application/ld+json"], script#__NEXT_DATA__')]
      .map(node => node.textContent).join("\n").slice(0, 5000);
    for (const node of doc.querySelectorAll("script, style, nav, footer, header, noscript")) node.remove();
    const root = doc.querySelector("#game_highlights, article, main") || doc.body;
    const text = root?.textContent?.replace(/\s+/g, " ").trim() || "";
    return { url, title: title.slice(0, 240), evidenceText: text.slice(0, 6000), structuredData: structured, truncated: text.length > 6000 || structured.length >= 5000 };
  } finally { page.window.close(); }
}

/** Fetch once per URL, keep failures explicit, and attach immutable evidence to
 * full work pages (not the small inline preview). No Canonical writes here. */
export async function collectCalendarPrimaryEvidence(report, { fetcher = fetch, baseline = [], maxRequests = 80, timeoutMs = 8000, now = new Date() } = {}) {
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || maxRequests > 160) throw new Error("invalid calendar evidence request budget");
  const candidates = report.allCandidates || report.candidates || [];
  const urlsFor = candidate => [...new Set([
    ...(candidate.sourceUrls || []),
    ...(candidate.observations || []).flatMap(row => [row.url, row.announcementUrl]),
    candidate.url,
  ].map(officialCalendarUrl).filter(Boolean))];
  // Recheck material conflicts and inherited entries first. Rotate the remaining
  // work before the platform round-robin so a daily cap cannot starve its tail.
  const urgent = candidates.filter(row => row.inBaseline || row.dateConflict || row.dateConflictUncertain);
  const rest = candidates.filter(row => !urgent.includes(row));
  const offset = rest.length ? Math.floor(Date.parse(report.editionDate) / 86400000) * 37 % rest.length : 0;
  const rotated = [...rest.slice(offset), ...rest.slice(0, offset)];
  // selectCalendarLeads provides four-family opportunities for the urgent set;
  // the remaining rotating list retains its order within each family.
  const families = ["PC", "PlayStation", "Xbox", "Nintendo", "Unknown"];
  const buckets = families.map(family => rotated.filter(row => {
    const found = leadPlatformFamilies(row);
    return found.length ? found.includes(family) : family === "Unknown";
  }));
  const balanced = new Set();
  while (buckets.some(bucket => bucket.length)) for (const bucket of buckets) if (bucket.length) balanced.add(bucket.shift());
  const ordered = [...selectCalendarLeads(urgent, urgent.length).candidates, ...balanced];
  const allUrls = [...new Set([
    ...baseline.map(item => officialCalendarUrl(item.source?.url)).filter(Boolean),
    ...(report.reviewLinks || []).map(row => officialCalendarUrl(row.url)).filter(Boolean),
    ...ordered.flatMap(urlsFor),
  ])];
  const selected = allUrls.slice(0, maxRequests);
  const evidence = new Map();
  for (let i = 0; i < selected.length; i += 2) {
    await Promise.all(selected.slice(i, i + 2).map(async url => {
      try {
        const steamId = new URL(url).hostname === "store.steampowered.com" ? new URL(url).pathname.match(/^\/app\/(\d+)(?:\/|$)/)?.[1] : null;
        const fetchedUrl = steamId ? `https://store.steampowered.com/api/appdetails?appids=${steamId}&cc=us&l=english` : url;
        const body = await fetchReleaseSource({ url: fetchedUrl }, { timeoutMs, maxResponseBytes: 2_000_000 }, fetcher);
        let extracted;
        if (steamId) {
          const response = JSON.parse(body)?.[steamId];
          if (!response?.success || String(response.data?.steam_appid) !== steamId) throw new Error("Steam returned no matching product detail");
          const data = response.data;
          const fields = { steam_appid: data.steam_appid, name: data.name, type: data.type, release_date: data.release_date, platforms: data.platforms, genres: data.genres, developers: data.developers, publishers: data.publishers, fullgame: data.fullgame, short_description: String(data.short_description || "").slice(0, 1200) };
          extracted = { url, fetchedUrl, region: "US", title: String(data.name || "").slice(0, 240), evidenceText: JSON.stringify(fields), structuredData: "", truncated: false };
        } else extracted = extractCalendarEvidence(body, url);
        const useful = extracted.evidenceText.length >= 100;
        evidence.set(url, { ...extracted, status: useful ? "opened" : "limited", openedAt: now.toISOString(), ...(!useful ? { error: "Official page has insufficient readable detail; open interactively." } : {}) });
      } catch (error) {
        evidence.set(url, { url, status: "failed", attemptedAt: now.toISOString(), error: String(error.message).slice(0, 240) });
      }
    }));
  }
  const evidenceFor = urls => urls.map(url => evidence.get(url) || { url, status: "deferred", error: "Collector request budget; editorial lookup still required." });
  const attach = candidate => ({ ...candidate, primaryEvidence: evidenceFor(urlsFor(candidate)) });
  return {
    ...report,
    allCandidates: candidates.map(attach),
    candidates: (report.candidates || []).map(attach),
    baselineChecks: baseline.map(item => ({ item, primaryEvidence: evidenceFor([officialCalendarUrl(item.source?.url)].filter(Boolean)) })),
    reviewLinks: (report.reviewLinks || []).map(link => ({ ...link, primaryEvidence: evidenceFor([officialCalendarUrl(link.url)].filter(Boolean)) })),
    primaryEvidenceSummary: { attempted: selected.length, opened: [...evidence.values()].filter(row => row.status === "opened").length, failed: [...evidence.values()].filter(row => row.status !== "opened").length, deferred: Math.max(0, allUrls.length - selected.length), maxRequests },
  };
}

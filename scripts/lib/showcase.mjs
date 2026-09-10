import { JSDOM } from "jsdom";

export const showcaseKey = value => String(value || "").normalize("NFKC").toLowerCase()
  .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "");
const clean = value => String(value || "").replace(/\s+/g, " ").trim();

export function showcaseIdentity(kind, date) {
  if (!["nintendo-direct", "state-of-play"].includes(kind) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("invalid showcase identity");
  return `${kind}-${date}`;
}

// A source fragment is one announcement; sharing an article URL is not an identity.
export function parseShowcasePage(html, source, event) {
  const document = new JSDOM(html, { url: source.url }).window.document;
  document.querySelectorAll("nav,footer,header,script,style,noscript,aside,.screen-reader-text").forEach(node => node.remove());
  const main = document.querySelector(".entry-content") || document.querySelector(".nintendo-direct-wrapper,article,main,[role=main],#page-content") || document.body;
  const announcements = [];
  const seen = new Set();
  const add = (title, text, href, locator) => {
    title = clean(title); text = clean(text);
    if (/^(オープニング|エンディング|ごあいさつ|Download Image)$/i.test(title)) return;
    if (title.length < 2 || title.length > 180 || text.length < 8 || /^(highlights|available|watch|read more|subscribe|latest|looking for|see more|related|最新|関連|動画|ソフト一覧)/i.test(title)) return;
    const key = showcaseKey(`${source.region} ${title} ${locator}`);
    if (seen.has(key)) return; seen.add(key);
    announcements.push({ id: `${event.id}:${key}`, showcaseId: event.id, region: source.region,
      subjectKey: title, titleEn: title, titleKey: showcaseKey(title), headline: text,
      evidenceText: text, sourceUrl: source.url, detailUrl: href || null, locator,
      publishedAt: event.startsAt, kind: source.kind || "primary", eventKind: "announcement" });
  };
  // Nintendo Direct landing pages present game cards, sometimes without anchors.
  if (event.kind === "nintendo-direct" && !main.querySelector(".subsection")) {
    let index = 0;
    for (const node of main.querySelectorAll("li")) {
      const text = clean(node.textContent);
      const link = node.querySelector("a[href]");
      const heading = node.querySelector("h2,h3,h4,[class*=title]");
      const title = heading?.textContent || link?.getAttribute("aria-label") || link?.textContent?.split(/Nintendo Switch|ニンテンドー|Coming |Available |Out now|Releasing |Try for free/i)[0] || text.split(/Nintendo Switch|Coming |Available |Out now|Releasing |Try for free/i)[0];
      if (!title || !text || node.querySelector("ul,ol") || !/Switch|スイッチ|発売|配信|Coming|Available/i.test(text)) continue;
      const group = clean(node.closest(".page-group-list")?.querySelector("h2")?.textContent);
      add(title, group ? `${group}: ${text}` : text, link?.href, `list-item:${index++}`);
    }
  }
  // Both hosts publish recaps with one titled section per game or announcement.
  for (const node of main.querySelectorAll("h2,h3")) {
    const parts = []; let next = node.nextElementSibling;
    while (next && !/^H[123]$/.test(next.tagName)) { parts.push(clean(next.textContent)); next = next.nextElementSibling; }
    // Japan's text transcript puts the narration after a heading/metadata wrapper.
    // Shared narration is retained as context; editorial splitting must not treat it as a new game's identity.
    if (node.parentElement.matches(".subsection")) {
      let following = node.parentElement.nextElementSibling;
      const narration = [];
      while (following && !following.matches(".subsection,h1,h2,h3")) {
        narration.push(clean(following.textContent));
        following = following.nextElementSibling;
      }
      parts.push(...narration);
    }
    const text = parts.join(" ");
    if (!text || /^(highlights|available|watch|latest|Nintendo Direct|State of Play|related|comments|leave a|looking for)/i.test(clean(node.textContent))) continue;
    if (text.length > 12000) continue; // Group heading, not an individual announcement.
    add(node.textContent, text, node.querySelector("a[href]")?.href, node.id ? `#${node.id}` : `heading:${clean(node.textContent)}`);
  }
  return { source, announcements, pageTitle: clean(document.title),
    // A parser cannot certify that an official highlights page exhausts the broadcast.
    inventoryComplete: source.inventoryComplete === true && announcements.length > 0,
    status: announcements.length ? "parsed" : "empty_or_changed" };
}

export function mergeShowcaseAnnouncements(items) {
  const byIdentity = new Map();
  for (const item of items) {
    // Explicit equivalent keys come from verified editorial mapping, never title-only fuzziness.
    const key = item.equivalentAnnouncementId || item.id;
    const prior = byIdentity.get(key);
    if (!prior) byIdentity.set(key, { ...item, id: key, regions: [item.region], evidence: [{ url: item.sourceUrl, locator: item.locator, text: item.evidenceText, region: item.region }] });
    else {
      prior.regions = [...new Set([...prior.regions, item.region])];
      if (!prior.evidence.some(source => source.url === item.sourceUrl && source.locator === item.locator)) prior.evidence.push({ url: item.sourceUrl, locator: item.locator, text: item.evidenceText, region: item.region });
    }
  }
  return [...byIdentity.values()];
}

export function auditShowcase(event, announcements, entries, dispositions = []) {
  const included = new Set(entries.flatMap(entry => (entry.showcaseRefs || []).filter(ref => ref.showcaseId === event.id).map(ref => ref.announcementId)));
  const allowedExclusions = new Set(dispositions.filter(item => item.status === "non_substantive" && item.reason && item.sourceUrl?.startsWith("https://")).map(item => item.announcementId));
  const missing = announcements.filter(item => !included.has(item.id) && !allowedExclusions.has(item.id)).map(item => item.id);
  const regionsComplete = ["jp", "us", "eu"].every(region => event.sources?.some(source => source.region === region && source.inventoryComplete === true && source.status === "parsed"));
  return { showcaseId: event.id, total: announcements.length, covered: announcements.filter(item => included.has(item.id)).length,
    nonSubstantive: announcements.filter(item => allowedExclusions.has(item.id)).length, missing,
    status: regionsComplete && announcements.length > 0 && missing.length === 0 ? "complete" : "partial" };
}

export function batchShowcasePackages(packages, maxChars = 100000) {
  const batches = []; let batch = []; let chars = 0;
  for (const item of packages) {
    const size = JSON.stringify(item).length;
    if (size > maxChars) throw new Error(`showcase announcement exceeds batch size: ${item.eventKey}`);
    if (chars + size > maxChars && batch.length) { batches.push(batch); batch = []; chars = 0; }
    batch.push(item); chars += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function showcaseEvidencePackages(report) {
  const start = Date.parse(`${report?.window?.windowStart?.replace(" ", "T")}:00+08:00`);
  const end = Date.parse(`${report?.window?.windowEnd?.replace(" ", "T")}:00+08:00`);
  const eligible = (report?.announcements || []).filter(item => {
    const time = Date.parse(item.publishedAt);
    return Number.isFinite(start) && Number.isFinite(end) && time > start && time <= end
      && report.events?.some(event => event.id === item.showcaseId)
      && (item.evidence?.length || (item.sourceUrl && item.evidenceText));
  });
  return eligible.map(item => ({
    eventKey: item.id, eventKind: item.eventKind || "announcement", subjectKey: item.subjectKey,
    headline: item.headline, tier: "B", score: 70, timeRelation: "window", readiness: "needs-independent-report",
    showcaseRefs: [{ showcaseId: item.showcaseId, announcementId: item.id }],
    sources: (item.evidence || [{ url: item.sourceUrl, text: item.evidenceText, locator: item.locator, region: item.region }]).map(source => ({
      status: "opened", kind: "primary", independenceKey: item.showcaseId.startsWith("nintendo") ? "nintendo" : "sony-interactive-entertainment",
      label: item.showcaseId.startsWith("nintendo") ? "Nintendo Direct" : "PlayStation State of Play",
      url: source.url, publishedAt: item.publishedAt, evidenceText: `${source.locator}\n${source.text}`,
      declaredLanguage: source.region === "jp" ? "ja" : "en", detectedLanguage: source.region === "jp" ? "ja" : "en", languageConfidence: "high", languageBasis: "official regional page",
    })),
  }));
}

export function showcaseRetryDue(firstPublishedAt, attempts, now = Date.now()) {
  const delays = [30, 120, 360];
  const base = Date.parse(firstPublishedAt);
  if (!Number.isFinite(base)) return false;
  const delay = attempts < delays.length ? delays[attempts] : 360 + (attempts - 2) * 360;
  return now >= base + delay * 60000;
}

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { JSDOM } from "jsdom";
import { parseShowcasePage, mergeShowcaseAnnouncements, showcaseIdentity } from "./lib/showcase.mjs";

const OUTPUT = resolve(process.env.SHOWCASE_REPORT_PATH || "artifacts/showcase-evidence.json");
const config = JSON.parse(await readFile("config/showcase-sources.json", "utf8"));
const report = JSON.parse(await readFile(process.env.NEWS_SHADOW_REPORT_PATH || "artifacts/news-shadow-report.json", "utf8"));
const allowedHosts = ["nintendo.com", "nintendo.co.jp", "nintendo.com.hk", "playstation.com"];
const coverage = [];
const openedPages = [];
async function open(url) {
  for (let redirects = 0; redirects < 6; redirects++) {
    const target = new URL(url);
    if (target.protocol !== "https:" || target.username || target.password || !allowedHosts.some(host => target.hostname === host || target.hostname.endsWith(`.${host}`))) throw new Error("untrusted showcase source");
    const response = await fetch(target, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { Accept: "text/html", "User-Agent": "DailyGameBriefShowcase/1.0" } });
    if ([301,302,303,307,308].includes(response.status)) { url = new URL(response.headers.get("location"), target).href; continue; }
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    if (Buffer.byteLength(html) > 5 * 1024 * 1024) throw new Error("showcase page exceeds 5 MB");
    return { url: target.href, html };
  }
  throw new Error("too many showcase redirects");
}
const windowStart = Date.parse(report.window.windowStart.replace(" ", "T") + ":00+08:00");
const windowEnd = Date.parse(report.window.windowEnd.replace(" ", "T") + ":00+08:00");
const inWindow = date => Number.isFinite(Date.parse(date)) && Date.parse(date) > windowStart && Date.parse(date) <= windowEnd;
let events = [];
if (process.env.SHOWCASE_EVENTS_PATH) {
  events = JSON.parse(await readFile(process.env.SHOWCASE_EVENTS_PATH, "utf8")).events;
} else {
  // Discovery is separate from inclusion. Uncertain timing remains visible instead of being backdated.
  for (const source of config.sources) {
    try {
      const root = await open(source.url);
      const document = new JSDOM(root.html, { url: root.url }).window.document;
      const links = [...document.querySelectorAll("a[href]")].filter(node => /Nintendo Direct|State of Play|ニンテンドーダイレクト/i.test(node.textContent) && /direct|state-of-play/.test(node.href));
      const urls = [...new Set([root.url, ...links.map(node => node.href)])];
      const pending = urls.slice(12);
      if (pending.length) coverage.push({ ...source, status: "discovery_queued", pendingUrls: pending });
      for (const url of urls.slice(0, 12)) {
        const page = url === root.url ? root : await open(url);
        const doc = new JSDOM(page.html, { url: page.url }).window.document;
        const timestamp = doc.querySelector('meta[property="article:published_time"],meta[name="date"]')?.getAttribute("content") || doc.querySelector("time[datetime]")?.getAttribute("datetime");
        if (!timestamp || !inWindow(timestamp)) continue;
        const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(timestamp));
        const id = showcaseIdentity(source.kind, date);
        let event = events.find(item => item.id === id);
        if (!event) { event = { id, kind: source.kind, date, startsAt: timestamp, timeBasis: "official-recap-publication", sources: [] }; events.push(event); }
        event.sources.push({ region: source.region, url: page.url, inventoryComplete: false });
        openedPages.push(page);
      }
      coverage.push({ ...source, status: "checked", discovered: events.filter(event => event.sources.some(item => item.region === source.region)).length });
    } catch (error) { coverage.push({ ...source, status: "failed", error: error.message }); }
  }
}
const announcements = [];
for (const event of events) {
  event.id ||= showcaseIdentity(event.kind, event.date);
  if (!inWindow(event.startsAt)) { coverage.push({ showcaseId: event.id, status: "outside_window_or_unverified_time" }); continue; }
  const results = [];
  for (const source of event.sources) {
    try {
      const page = openedPages.find(item => item.url === source.url) || await open(source.url);
      const parsed = parseShowcasePage(page.html, source, event);
      announcements.push(...parsed.announcements);
      results.push({ ...source, status: parsed.status, inventoryComplete: parsed.inventoryComplete });
      openedPages.push(page);
    } catch (error) { results.push({ ...source, status: "failed", inventoryComplete: false, error: error.message }); }
  }
  event.sources = results;
}
await mkdir(dirname(OUTPUT), { recursive: true });
const output = { schemaVersion: 1, window: report.window, generatedAt: new Date().toISOString(), events, announcements: mergeShowcaseAnnouncements(announcements), coverage };
await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n");
await writeFile(OUTPUT.replace(/\.json$/, "-pages.json"), JSON.stringify(openedPages, null, 2) + "\n");
console.log(`Showcase discovery: ${events.length} events; ${output.announcements.length} announcement fragments; failed=${coverage.filter(item => item.status === "failed").length}`);

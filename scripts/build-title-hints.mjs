import { titleLookupDue, titleLookupRecord } from "./lib/title-knowledge.mjs";
import { lookup } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { dirname, resolve } from "node:path";
import { stripHtml } from "./lib/news-pipeline.mjs";
import { selectTitleHintSubjects, validateTitleHintCandidate } from "./lib/title-hints.mjs";

const EVIDENCE_PATH = resolve(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json");
const OUTPUT_PATH = resolve(process.env.TITLE_HINTS_PATH || "artifacts/title-hints.json");
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim();
const MAX_SUBJECTS = Number(process.env.TITLE_HINT_LIMIT || 20);
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "DailyGameBriefTitleBot/1.0 (+https://fallw1nd.github.io/daily-game-brief/)";

function isNonPublicIp(address) {
  const value = String(address || "").toLowerCase().split("%")[0];
  if (value.startsWith("::ffff:")) return isNonPublicIp(value.slice(7));
  const family = isIP(value);
  if (family === 4) {
    const [a, b, c] = value.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && c === 0) ||
      (a === 192 && b === 0 && c === 2) ||
      (a === 198 && (b === 18 || b === 19)) ||
      (a === 198 && b === 51 && c === 100) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224;
  }
  if (family === 6) {
    return value === "::" || value === "::1" ||
      /^f[cd]/.test(value) || /^fe[89ab]/.test(value) ||
      /^ff/.test(value) || /^2001:db8(?::|$)/.test(value);
  }
  return true;
}

async function safeUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("only HTTPS title evidence is allowed");
  if (/^(localhost|.+\.local)$/i.test(url.hostname)) throw new Error("local host is not allowed");
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some(({ address }) => isNonPublicIp(address))) {
    throw new Error("non-public network target is not allowed");
  }
  return url;
}

function blockedSearchHost(hostname) {
  const host = hostname.toLowerCase();
  return ["google.com", "bing.com", "baidu.com", "search.brave.com", "deepseek.com"]
    .some((blocked) => host === blocked || host.endsWith(`.${blocked}`));
}

async function fetchTitleEvidence(input, label) {
  let url = await safeUrl(input);
  let response;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
      headers: { Accept: "text/html, application/xhtml+xml", "User-Agent": USER_AGENT },
    });
    if (![301, 302, 303, 307, 308].includes(response.status)) break;
    const location = response.headers.get("location");
    if (!location) throw new Error("redirect is missing a location");
    url = await safeUrl(new URL(location, url).href);
    if (redirects === 5) throw new Error("too many redirects");
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") || "";
  if (!/html|xhtml/i.test(contentType)) throw new Error(`unexpected content type ${contentType}`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > MAX_HTML_BYTES) throw new Error("title evidence page is too large");
  const html = await response.text();
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) throw new Error("title evidence page is too large");

  const title = stripHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
  const body = stripHtml(html
    .replace(/<(script|style|svg|nav|footer|noscript)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--([\s\S]*?)-->/g, " "));
  return {
    label,
    url: response.url || url.href,
    pageTitle: title,
    pageText: body,
    excerpt: body.slice(0, 320),
  };
}

function outputText(response) {
  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text || "")
    .join("");
}

async function searchTitle(subject) {
  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      candidates: {
        type: "array",
        maxItems: 2,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            urls: {
              type: "array",
              maxItems: 3,
              items: { type: "string" },
            },
          },
          required: ["name", "urls"],
        },
      },
    },
    required: ["candidates"],
  };

  const response = await fetch("https://api.deepseek.com/responses", {
    method: "POST",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
      "Content-Type": "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      instructions: "Find existing Chinese names for this exact game/entity, matching sequel and subtitle. Prefer mainland Simplified Chinese official/store pages; otherwise require two independent reputable Chinese media. Each name must occur verbatim on every cited page. Return page URLs only, no search links/assets. Never translate or invent names. Return empty candidates if unsupported.",
      input: JSON.stringify({ title: subject.subjectKey }),
      tools: [{ type: "web_search" }],
      tool_choice: { type: "web_search" },
      reasoning: { effort: "none" },
      max_output_tokens: 700,
      temperature: 0.1,
      text: { format: { type: "json_schema", name: "title_hint_candidates", schema } },
    }),
  });
  const body = await response.text();
  if (!response.ok) throw Object.assign(new Error(`DeepSeek title search HTTP ${response.status}`), { status: response.status });
  if (Buffer.byteLength(body) > MAX_HTML_BYTES) throw new Error("DeepSeek title search response is too large");
  const data = JSON.parse(body);
  for (const [field, key] of [["inputTokens", "input_tokens"], ["outputTokens", "output_tokens"], ["totalTokens", "total_tokens"]]) {
    if (Number.isFinite(data.usage?.[key])) apiUsage[field] = (apiUsage[field] || 0) + data.usage[key];
  }
  if (data.status === "failed") throw new Error(data.error?.message || "DeepSeek title search failed");
  const text = outputText(data);
  if (!text) throw new Error("DeepSeek title search returned no structured output");
  return (JSON.parse(text).candidates || []).map(item => ({ titleZhCn: item.name, sources: (item.urls || []).map(url => ({ url })) }));
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const output = new Array(items.length);
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      output[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return output;
}

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
const CACHE_PATH = resolve(process.env.TITLE_CACHE_PATH || "artifacts/title-lookup-cache.json");
async function optionalJson(path, fallback) { try { return JSON.parse(await readFile(path, "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; return fallback; } }
const cache = await optionalJson(CACHE_PATH, { schemaVersion: 1, records: {}, pending: [] });
const latest = await optionalJson("public/data/latest.json", { upcoming: [] });
const showcases = await optionalJson(process.env.SHOWCASE_REPORT_PATH || "artifacts/showcase-evidence.json", { announcements: [] });
const calendar = await optionalJson(process.env.RELEASE_CALENDAR_REPORT_PATH || "artifacts/release-calendar-discovery.json", { candidates: [] });
evidence.upcoming = [...(latest.upcoming || []), ...(calendar.editionDate === evidence.window.id.slice(0, 10) ? calendar.candidates.map(item => ({ titleEn: item.title, id: item.productId || item.sourceUrl })) : [])];
evidence.showcaseAnnouncements = showcases.announcements;
evidence.pendingTitles = cache.pending;
const allSubjects = selectTitleHintSubjects(evidence, Number.MAX_SAFE_INTEGER);
const pendingKeys = new Set(cache.pending.map(subject => subject.titleKey));
const due = allSubjects.filter(subject => titleLookupDue(subject, cache.records[subject.titleKey]))
  .sort((a, b) => Number(pendingKeys.has(b.titleKey)) - Number(pendingKeys.has(a.titleKey)));
const subjects = due.slice(0, Math.min(20, MAX_SUBJECTS));
cache.pending = due.slice(subjects.length);
const limited = [];
let hints = [];
let queriedSubjects = 0;
let successfulQueries = 0;
const apiUsage = {};
let providerBlocked = Date.parse(cache.provider?.retryAt || "") > Date.now();
if (!providerBlocked) delete cache.provider;

if (DEEPSEEK_API_KEY && subjects.length) {
  const results = await mapLimit(subjects, 2, async (subject) => {
    if (providerBlocked) { cache.pending.push(subject); return []; }
    try {
      queriedSubjects += 1;
      const candidates = await searchTitle(subject);
      successfulQueries += 1;
      const validated = [];
      let sourceFailed = false;
      for (const candidate of candidates) {
        const sourcePages = await mapLimit(candidate.sources || [], 2, async (source) => {
          try {
            if (!source.url?.startsWith("https://")) return null;
            const url = new URL(source.url);
            if (blockedSearchHost(url.hostname) || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)) return null;
            return await fetchTitleEvidence(url.href, source.label || url.hostname);
          } catch {
            sourceFailed = true;
            return null;
          }
        });
        const opened = sourcePages.filter(Boolean);
        const hint = validateTitleHintCandidate(subject, { ...candidate, suggestedStatus: "official_simplified" }, opened)
          || validateTitleHintCandidate(subject, { ...candidate, suggestedStatus: "common_translation" }, opened);
        if (hint) validated.push(hint);
      }
      if (!validated.length) limited.push({ subjectKey: subject.subjectKey, reason: "no source-verified Chinese title candidate" });
      const conflict = new Set(validated.map(item => item.titleZhCn)).size > 1;
      cache.records[subject.titleKey] = { ...titleLookupRecord(subject, validated.length && !conflict ? "verified" : sourceFailed ? "error" : "not-found"), hints: conflict ? [] : validated };
      return conflict ? [] : validated;
    } catch (error) {
      if ([401, 402, 403, 429].includes(error.status)) {
        providerBlocked = true;
        cache.provider = { status: "unavailable", reason: error.message, retryAt: new Date(Date.now() + 6 * 3600000).toISOString() };
      }
      cache.records[subject.titleKey] = titleLookupRecord(subject, "error");
      limited.push({ subjectKey: subject.subjectKey, reason: error.message.slice(0, 240) });
      return [];
    }
  });
  hints = results.flat();
} else if (!DEEPSEEK_API_KEY && subjects.length) {
  for (const subject of subjects) cache.records[subject.titleKey] = titleLookupRecord(subject, "error");
  limited.push(...subjects.map((subject) => ({ subjectKey: subject.subjectKey, reason: "title search provider unavailable" })));
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  searchEnabled: Boolean(DEEPSEEK_API_KEY),
  providerStatus: !DEEPSEEK_API_KEY || providerBlocked || (queriedSubjects > 0 && successfulQueries === 0) ? "unavailable" : "available",
  successfulQueries,
  apiUsage,
  ...(cache.provider ? { providerFailure: cache.provider } : {}),
  registryMisses: allSubjects.length,
  queriedSubjects,
  queuedSubjects: cache.pending.length,
  hints: [...new Map([...Object.values(cache.records).flatMap(record => record.hints || []), ...hints].filter(hint => allSubjects.some(subject => subject.titleKey === hint.titleKey)).map(hint => [`${hint.titleKey}:${hint.titleZhCn}`, hint])).values()],
  limited,
};
await mkdir(dirname(CACHE_PATH), { recursive: true });
await writeFile(CACHE_PATH, JSON.stringify(cache, null, 2) + "\n");
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
console.log(`Title hints: registry misses=${output.registryMisses}; verified hints=${output.hints.length}; limited=${output.limited.length}`);
console.log(`Report: ${OUTPUT_PATH}`);

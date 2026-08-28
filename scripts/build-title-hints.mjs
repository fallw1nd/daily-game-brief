import { lookup } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { stripHtml } from "./lib/news-pipeline.mjs";
import { selectTitleHintSubjects, validateTitleHintCandidate } from "./lib/title-hints.mjs";

const EVIDENCE_PATH = resolve(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json");
const OUTPUT_PATH = resolve(process.env.TITLE_HINTS_PATH || "artifacts/title-hints.json");
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim();
const MAX_SUBJECTS = Number(process.env.TITLE_HINT_LIMIT || 8);
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const USER_AGENT = "DailyGameBriefTitleBot/1.0 (+https://fallw1nd.github.io/daily-game-brief/)";

function isPrivateIp(address) {
  return /^(127\.|10\.|0\.|169\.254\.|192\.168\.|::1$|fc|fd|fe80)/i.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

async function safeUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("only HTTPS title evidence is allowed");
  if (/^(localhost|.+\.local)$/i.test(url.hostname)) throw new Error("local host is not allowed");
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.some(({ address }) => isPrivateIp(address))) throw new Error("private network target is not allowed");
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
            titleZhCn: { type: "string" },
            suggestedStatus: { type: "string", enum: ["official_simplified", "common_translation"] },
            reason: { type: "string" },
            sources: {
              type: "array",
              maxItems: 3,
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  url: { type: "string" },
                  label: { type: "string" },
                },
                required: ["url", "label"],
              },
            },
          },
          required: ["titleZhCn", "suggestedStatus", "reason", "sources"],
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
      instructions: [
        "You are a search-only finder for Chinese video-game title evidence.",
        "Search only the supplied game title. Do not return event facts, dates, platforms, release claims, or additional games.",
        "First look for an official Simplified Chinese name on the developer, publisher, platform, or storefront page.",
        "If no official Simplified Chinese name exists, return a common_translation only when the same Chinese name is stably used by at least two independent reputable Chinese games-media sources.",
        "Never translate, transliterate, or invent a Chinese name yourself. Return no candidate when the web evidence does not already contain one.",
        "Every titleZhCn must appear verbatim on every returned source page. Return source PAGE URLs, never search-result URLs or direct assets.",
        "The caller will open each source page and verify the Chinese string independently; your status is only a suggestion for an editor.",
      ].join(" "),
      input: JSON.stringify({ title: subject.subjectKey }),
      tools: [{ type: "web_search" }],
      tool_choice: { type: "web_search" },
      reasoning: { effort: "none" },
      max_output_tokens: 1000,
      temperature: 0.1,
      text: { format: { type: "json_schema", name: "title_hint_candidates", schema } },
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`DeepSeek title search HTTP ${response.status}`);
  if (Buffer.byteLength(body) > MAX_HTML_BYTES) throw new Error("DeepSeek title search response is too large");
  const data = JSON.parse(body);
  if (data.status === "failed") throw new Error(data.error?.message || "DeepSeek title search failed");
  const text = outputText(data);
  if (!text) throw new Error("DeepSeek title search returned no structured output");
  return JSON.parse(text).candidates || [];
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
const subjects = selectTitleHintSubjects(evidence, MAX_SUBJECTS);
const limited = [];
let hints = [];

if (DEEPSEEK_API_KEY && subjects.length) {
  const results = await mapLimit(subjects, 2, async (subject) => {
    try {
      const candidates = await searchTitle(subject);
      const validated = [];
      for (const candidate of candidates) {
        const sourcePages = await mapLimit(candidate.sources || [], 2, async (source) => {
          try {
            if (!source.url?.startsWith("https://")) return null;
            const url = new URL(source.url);
            if (blockedSearchHost(url.hostname) || /\.(?:avif|gif|jpe?g|png|webp)$/i.test(url.pathname)) return null;
            return await fetchTitleEvidence(url.href, source.label || url.hostname);
          } catch {
            return null;
          }
        });
        const hint = validateTitleHintCandidate(subject, candidate, sourcePages.filter(Boolean));
        if (hint) validated.push(hint);
      }
      if (!validated.length) limited.push({ subjectKey: subject.subjectKey, reason: "no source-verified Chinese title candidate" });
      return validated;
    } catch (error) {
      limited.push({ subjectKey: subject.subjectKey, reason: error.message.slice(0, 240) });
      return [];
    }
  });
  hints = results.flat();
} else if (!DEEPSEEK_API_KEY && subjects.length) {
  limited.push(...subjects.map((subject) => ({ subjectKey: subject.subjectKey, reason: "title search provider unavailable" })));
}

const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  searchEnabled: Boolean(DEEPSEEK_API_KEY),
  registryMisses: subjects.length,
  hints,
  limited,
};
await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
console.log(`Title hints: registry misses=${output.registryMisses}; verified hints=${output.hints.length}; limited=${output.limited.length}`);
console.log(`Report: ${OUTPUT_PATH}`);

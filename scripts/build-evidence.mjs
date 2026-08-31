import { lookup } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { selectEvidenceCandidates } from "./lib/evidence-budget.mjs";
import { decodeEntities, normalizeHeadline, stripHtml } from "./lib/news-pipeline.mjs";
import { extractExplicitOfficialLinks } from "./lib/primary-resolver.mjs";

const INPUT_PATH = resolve(process.env.NEWS_SHADOW_REPORT_PATH || "artifacts/news-shadow-report.json");
const OUTPUT_PATH = resolve(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json");
const SOURCE_CONFIG_PATH = resolve("config/news-sources.json");
const OFFICIAL_DOMAINS_PATH = resolve("config/official-domains.json");
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_EVIDENCE_CHARS = 4000;
const MAX_CANDIDATES = Number(process.env.EVIDENCE_CANDIDATE_LIMIT || 30);
const USER_AGENT = "DailyGameBriefEvidenceBot/1.0 (+https://fallw1nd.github.io/daily-game-brief/)";

function isPrivateIp(address) {
  return /^(127\.|10\.|0\.|169\.254\.|192\.168\.|::1$|fc|fd|fe80)/i.test(address) || /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

async function safeUrl(input) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("only HTTPS evidence sources are allowed");
  if (/^(localhost|.+\.local)$/i.test(url.hostname)) throw new Error("local host is not allowed");
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.some(({ address }) => isPrivateIp(address))) throw new Error("private network target is not allowed");
  return url;
}

async function fetchHtml(input) {
  let url = await safeUrl(input);
  let response;
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    response = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(15000), headers: { Accept: "text/html, application/xhtml+xml", "User-Agent": USER_AGENT } });
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
  if (declared > MAX_HTML_BYTES) throw new Error("HTML exceeds configured limit");
  const html = await response.text();
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) throw new Error("HTML exceeds configured limit");
  return { html, finalUrl: response.url || url.href };
}

function attributes(tag) {
  const result = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) result[match[1].toLowerCase()] = decodeEntities(match[2] || match[3] || match[4] || "");
  return result;
}

function normalizeLanguage(value) {
  const lang = String(value || "").trim().toLowerCase();
  if (/^zh(?:-|$)/.test(lang)) return "zh-CN";
  if (/^en(?:-|$)/.test(lang)) return "en";
  if (/^ja(?:-|$)/.test(lang)) return "ja";
  return "und";
}

function metadata(html) {
  const meta = new Map();
  for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
    const attrs = attributes(tag);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content && !meta.has(key)) meta.set(key, attrs.content);
  }
  const time = html.match(/<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i)?.[1];
  const htmlTag = html.match(/<html\b[^>]*>/i)?.[0] || "";
  return {
    pageTitle: meta.get("og:title") || stripHtml(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] || ""),
    description: meta.get("og:description") || meta.get("description") || "",
    publishedAt: meta.get("article:published_time") || meta.get("og:published_time") || time || null,
    imageUrl: meta.get("og:image:secure_url") || meta.get("og:image") || null,
    canonicalUrl: (html.match(/<link\b[^>]*rel\s*=\s*["'][^"']*canonical[^"']*["'][^>]*>/gi) || []).map(attributes).find((attrs) => attrs.href)?.href || null,
    htmlLanguage: normalizeLanguage(attributes(htmlTag).lang),
    metadataLanguage: normalizeLanguage(meta.get("content-language") || meta.get("og:locale")),
  };
}

function evidenceText(html, candidate, meta) {
  const body = html.replace(/<(script|style|svg|nav|footer|noscript)\b[\s\S]*?<\/\1>/gi, " ").replace(/<!--([\s\S]*?)-->/g, " ");
  const paragraphs = [...body.matchAll(/<(?:p|h1|h2)\b[^>]*>([\s\S]*?)<\/(?:p|h1|h2)>/gi)]
    .map((match) => stripHtml(match[1])).filter((text) => text.length >= 30 && text.length <= 1600);
  const tokens = normalizeHeadline(candidate.subjectKey || candidate.headline).split(" ").filter((token) => token.length >= 3).slice(0, 8);
  const relevant = paragraphs.filter((paragraph) => {
    const normalized = normalizeHeadline(paragraph);
    return tokens.some((token) => normalized.includes(token));
  });
  const selected = [...new Set([meta.description && stripHtml(meta.description), ...relevant.slice(0, 8), ...paragraphs.slice(0, 5)].filter(Boolean))];
  return selected.join("\n").slice(0, MAX_EVIDENCE_CHARS);
}

function detectLanguage(text) {
  const sample = String(text || "").slice(0, 4000);
  const cjk = (sample.match(/[\u3400-\u9fff]/gu) || []).length;
  const kana = (sample.match(/[\u3040-\u30ff]/gu) || []).length;
  const latinWords = (sample.match(/[A-Za-z]{3,}/g) || []).length;
  if (kana >= 8) return { language: "ja", confidence: "high" };
  if (cjk >= 20) return { language: "zh-CN", confidence: kana ? "medium" : "high" };
  if (latinWords >= 20) return { language: "en", confidence: "high" };
  if (latinWords >= 5) return { language: "en", confidence: "medium" };
  return { language: "und", confidence: "low" };
}

function languageMetadata(source, meta, text) {
  const registry = normalizeLanguage(source?.locale || source?.language || source?.declaredLanguage);
  const detected = detectLanguage(text);
  const declaredLanguage = registry !== "und" ? registry : meta.htmlLanguage !== "und" ? meta.htmlLanguage : meta.metadataLanguage;
  const detectedLanguage = detected.language;
  const agreement = declaredLanguage !== "und" && declaredLanguage === detectedLanguage;
  return {
    declaredLanguage: declaredLanguage || "und",
    detectedLanguage,
    languageConfidence: agreement ? "high" : declaredLanguage !== "und" && detectedLanguage !== "und" ? "medium" : detected.confidence,
    languageBasis: registry !== "und" ? "registry+html-lang+metadata" : meta.htmlLanguage !== "und" ? "html-lang+character-distribution" : meta.metadataLanguage !== "und" ? "metadata+character-distribution" : "character-distribution",
  };
}

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  const output = new Array(items.length);
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) { const index = cursor++; output[index] = await worker(items[index]); }
  });
  await Promise.all(runners);
  return output;
}

const [report, sourceConfig, officialDomains] = await Promise.all([
  readFile(INPUT_PATH, "utf8").then((text) => JSON.parse(text)),
  readFile(SOURCE_CONFIG_PATH, "utf8").then((text) => JSON.parse(text)),
  readFile(OFFICIAL_DOMAINS_PATH, "utf8").then((text) => JSON.parse(text)),
]);
const sourceById = new Map(sourceConfig.sources.map((source) => [source.id, source]));
const candidateBudget = selectEvidenceCandidates(report.reviewQueue, MAX_CANDIDATES);
const selectedCandidates = candidateBudget.selected;
const omittedCandidates = candidateBudget.omissions;

const packages = await mapLimit(selectedCandidates, 3, async (candidate) => {
  const appearances = candidate.appearances.slice(0, 3);
  const sources = await mapLimit(appearances, 2, async (appearance) => {
    const source = sourceById.get(appearance.sourceId);
    try {
      const { html, finalUrl } = await fetchHtml(appearance.url);
      const meta = metadata(html);
      const text = evidenceText(html, candidate, meta);
      const kind = ["official", "event"].includes(source?.group) ? "primary" : source?.group === "media" ? "secondary" : "discovery";
      const primaryCandidates = kind === "primary" ? [] : extractExplicitOfficialLinks(html, finalUrl, officialDomains, 5);
      const independenceKey = source?.independenceKey || new URL(finalUrl).hostname;
      const publisherKey = source?.publisherFamily || independenceKey;
      const observedPrimaryIndependenceKeys = [...new Set(primaryCandidates.map((item) => item.independenceKey).filter(Boolean))];
      return {
        status: "opened",
        label: appearance.label,
        url: finalUrl,
        sourceId: appearance.sourceId,
        kind,
        independenceKey,
        publisherKey,
        observedPrimaryIndependenceKeys,
        pageTitle: meta.pageTitle,
        publishedAt: meta.publishedAt,
        imageUrl: meta.imageUrl,
        canonicalUrl: meta.canonicalUrl,
        ...languageMetadata(source, meta, text),
        evidenceText: text,
        primaryCandidates,
      };
    } catch (error) {
      return { status: "limited", label: appearance.label, url: appearance.url, sourceId: appearance.sourceId, error: error.message };
    }
  });
  const opened = sources.filter((source) => source.status === "opened");
  const hasPrimary = opened.some((source) => source.kind === "primary");
  const independentReliable = new Set(opened.filter((source) => source.kind !== "discovery").map((source) => source.independenceKey));
  const readiness = hasPrimary && independentReliable.size >= 2 ? "primary-plus-independent" : hasPrimary ? "needs-independent-report" : independentReliable.size >= 2 ? "two-media-no-primary" : "needs-more-evidence";
  const primaryCandidates = [];
  const seenPrimary = new Set();
  for (const item of opened.flatMap((source) => source.primaryCandidates || [])) {
    if (seenPrimary.has(item.url)) continue;
    seenPrimary.add(item.url);
    primaryCandidates.push(item);
  }
  const publisherKeys = [...new Set(opened.map((source) => source.publisherKey).filter(Boolean))];
  const observedPrimaryIndependenceKeys = [...new Set(opened.flatMap((source) => source.observedPrimaryIndependenceKeys || []))];
  return {
    eventKey: candidate.eventKey,
    eventKind: candidate.eventKind,
    subjectKey: candidate.subjectKey,
    canonicalSubjectKey: candidate.canonicalSubjectKey || null,
    headline: candidate.headline,
    tier: candidate.tier,
    score: candidate.score,
    scoreSignals: candidate.scoreSignals || null,
    lane: candidate.lane || "news",
    publisherFamily: candidate.publisherFamily || null,
    timeRelation: candidate.timeRelation,
    readiness,
    provenanceObservation: {
      publisherKeys,
      observedPrimaryIndependenceKeys,
      affectsCorroboration: false,
      note: "Observation only: corroboration still uses opened-source independenceKey semantics.",
    },
    primaryResolution: {
      status: primaryCandidates.length ? "explicit-links-found" : "none",
      candidates: primaryCandidates,
      evidenceUpgradeAllowed: false,
    },
    sources,
  };
});

const output = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  window: report.window,
  adjacentEdition: report.adjacentEdition,
  coverage: report.coverage || null,
  limits: { candidatePackages: MAX_CANDIDATES, sourcesPerCandidate: 3, evidenceCharsPerSource: MAX_EVIDENCE_CHARS },
  totals: {
    ...candidateBudget.telemetry,
    packages: packages.length,
    primaryPlusIndependent: packages.filter((item) => item.readiness === "primary-plus-independent").length,
    needsIndependentReport: packages.filter((item) => item.readiness === "needs-independent-report").length,
    twoMediaNoPrimary: packages.filter((item) => item.readiness === "two-media-no-primary").length,
    needsMoreEvidence: packages.filter((item) => item.readiness === "needs-more-evidence").length,
    explicitPrimaryCandidates: packages.reduce((sum, item) => sum + item.primaryResolution.candidates.length, 0),
    observedPrimaryOrigins: new Set(packages.flatMap((item) => item.provenanceObservation.observedPrimaryIndependenceKeys)).size,
    limitedPages: packages.flatMap((item) => item.sources).filter((item) => item.status === "limited").length,
  },
  omissions: omittedCandidates,
  packages,
};

await mkdir(dirname(OUTPUT_PATH), { recursive: true });
await writeFile(OUTPUT_PATH, JSON.stringify(output, null, 2) + "\n");
console.log(`Evidence packages: ${output.totals.packages}; ready=${output.totals.primaryPlusIndependent}; explicit primary links=${output.totals.explicitPrimaryCandidates}; observed primary origins=${output.totals.observedPrimaryOrigins}; limited pages=${output.totals.limitedPages}; omitted=${output.totals.omittedByCandidateLimit}`);
console.log(`Report: ${OUTPUT_PATH}`);
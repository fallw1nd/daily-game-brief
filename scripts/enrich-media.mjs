import { lookup } from "node:dns/promises";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import sharp from "sharp";

const DATA_ROOT = resolve("public/data");
const PUBLIC_ROOT = resolve("public");
const REPORT_PATH = resolve("artifacts/media-audit.json");
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const TARGET_IMAGE_BYTES = 500 * 1024;
const USER_AGENT = "DailyGameBriefMediaBot/1.0 (+https://fallw1nd.github.io/daily-game-brief/)";
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY?.trim();
const args = new Set(process.argv.slice(2));

const hasArg = (name) => args.has(name) || [...args].some((arg) => arg.startsWith(name + "="));
const argValue = (name) => [...args].find((arg) => arg.startsWith(name + "="))?.slice(name.length + 1);

function isPrivateIp(address) {
  return /^(127\.|10\.|0\.|169\.254\.|192\.168\.|::1$|fc|fd|fe80)/i.test(address) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(address);
}

async function assertSafeHttps(input) {
  const url = new URL(input);
  if (url.protocol !== "https:") throw new Error("only HTTPS media is allowed");
  if (/^(localhost|.+\.local)$/i.test(url.hostname)) throw new Error("local host is not allowed");
  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.some(({ address }) => isPrivateIp(address))) throw new Error("private network target is not allowed");
  return url;
}

async function fetchLimited(input, limit, accept) {
  const url = await assertSafeHttps(input);
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(18_000),
    headers: { Accept: accept, "User-Agent": USER_AGENT },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const declared = Number(response.headers.get("content-length") || 0);
  if (declared > limit) throw new Error(`response exceeds ${limit} bytes`);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > limit) throw new Error(`response exceeds ${limit} bytes`);
  return { bytes, contentType: response.headers.get("content-type") || "", url: response.url };
}

function decodeEntities(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

function tagAttributes(tag) {
  const attrs = {};
  for (const match of tag.matchAll(/([:\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? "");
  }
  return attrs;
}

function extractMeta(html, pageUrl) {
  const values = new Map();
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    const attrs = tagAttributes(tag);
    const key = (attrs.property || attrs.name || "").toLowerCase();
    if (key && attrs.content && !values.has(key)) values.set(key, attrs.content);
  }
  const pageHost = new URL(pageUrl).hostname.toLowerCase();
  const psnImage = pageHost === "store.playstation.com"
    ? html.match(/(?:https:\\\/\\\/|https:\/\/)image\.api\.playstation\.com[^"'\\<\s]+/i)?.[0]
    : null;
  const rawImage = psnImage?.replaceAll("\\/", "/") ||
    values.get("og:image:secure_url") || values.get("og:image") ||
    values.get("twitter:image") || values.get("twitter:image:src");
  if (!rawImage) return null;
  const imageUrl = new URL(rawImage, pageUrl).href;
  if (/logo|avatar|favicon|icon[-_.]/i.test(imageUrl)) return null;
  const titleTag = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1]
  ?.replace(/<[^>]+>/g, " ")
  .replace(/\s+/g, " ")
  .trim() || "";
return {
  imageUrl,
  alt: values.get("og:image:alt") || values.get("twitter:image:alt") || "",
  pageTitle: values.get("og:title") || values.get("twitter:title") || decodeEntities(titleTag),
  description: values.get("og:description") || values.get("twitter:description") || values.get("description") || "",
};
}

const displayTitle = (record) => record.title?.title_zh_cn || record.title?.title_en || record.id;
const sourceRank = (source) => source.kind === "primary" ? 0 : source.kind === "secondary" ? 1 : 2;
function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function permittedMatchTerm(record, term) {
  const normalized = normalizeSearchText(term);
  if (!normalized || [...normalized.replaceAll(" ", "")].length < 2) return false;
  const supplied = normalizeSearchText([
    record.title?.title_zh_cn,
    record.title?.title_en,
    record.headline,
  ].filter(Boolean).join(" "));
  return supplied.includes(normalized);
}

function isBlockedSearchHost(hostname, blockedHosts) {
  const host = hostname.toLowerCase();
  return [
    "google.com",
    "bing.com",
    "baidu.com",
    "search.brave.com",
    "pinterest.com",
    ...blockedHosts,
  ].some((blocked) => host === blocked || host.endsWith("." + blocked));
}

function deepSeekOutputText(response) {
  return (response.output || [])
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text")
    .map((part) => part.text || "")
    .join("");
}

function pageMatchesRecord(record, source, meta, pageUrl) {
  if (!source.webSearch) return true;
  if (!permittedMatchTerm(record, source.matchTerm)) return false;
  const term = normalizeSearchText(source.matchTerm);
  const haystack = normalizeSearchText([
    meta.pageTitle,
    meta.description,
    pageUrl,
  ].filter(Boolean).join(" "));
  return haystack.includes(term);
}

async function discoverWebSources(record, kind, blockedHosts = []) {
  if (!DEEPSEEK_API_KEY) return [];

  const headline = record.headline || "game news";
  const personLed = /(interview|podcast|developer|designer|producer|director|采访|专访|访谈|播客|制作人|导演|设计师|开发者|编剧|创意总监|艺术总监)/i.test(headline);
  const searchGoal = kind === "cover"
    ? "Find source pages with same-title cover art, key art, or official game artwork."
    : personLed
      ? "Find source pages with a clearly identified photo of the exact person; the current interview image is preferred but another reliable photo of that person is acceptable."
      : "Find source pages with artwork, cover art, key art, or screenshots of the exact game or product named in the story.";

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      candidates: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            url: { type: "string" },
            label: { type: "string" },
            title: { type: "string" },
            matchTerm: { type: "string" },
            reason: { type: "string" },
          },
          required: ["url", "label", "title", "matchTerm", "reason"],
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
        "You are a search-only source finder for editorial media.",
        "Use web search and return source PAGE URLs, never direct image URLs or search-result URLs.",
        "Prefer official publisher/developer/platform/store pages, then reputable games/media reporting pages.",
        "Reject fan art, forums, wikis, Pinterest, image-CDN-only links, watermarked composites, reuploads, and pages whose subject identity is ambiguous.",
        "matchTerm must be copied verbatim from the supplied game title or headline and must identify the exact game/product/person shown by the candidate page.",
        "Do not claim that an image is verified; the caller will open every page and validate its metadata and image independently.",
      ].join(" "),
      input: JSON.stringify({
        kind,
        title_zh_cn: record.title?.title_zh_cn || null,
        title_en: record.title?.title_en || null,
        headline,
        searchGoal,
        maxCandidates: 8,
      }),
      tools: [{ type: "web_search" }],
      tool_choice: { type: "web_search" },
      reasoning: { effort: "none" },
      max_output_tokens: 1200,
      temperature: 0.1,
      text: {
        format: {
          type: "json_schema",
          name: "media_source_candidates",
          schema,
        },
      },
    }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`DeepSeek web search HTTP ${response.status}`);
  if (Buffer.byteLength(body) > MAX_HTML_BYTES) {
    throw new Error("DeepSeek web search response is too large");
  }
  const data = JSON.parse(body);
  if (data.status === "failed") {
    throw new Error(data.error?.message || "DeepSeek web search failed");
  }
  const output = deepSeekOutputText(data);
  if (!output) throw new Error("DeepSeek web search returned no structured output");
  const parsed = JSON.parse(output);

  return (parsed.candidates || []).flatMap((candidate) => {
    try {
      if (!candidate.url?.startsWith("https://") || !permittedMatchTerm(record, candidate.matchTerm)) return [];
      const pageUrl = new URL(candidate.url);
      if (isBlockedSearchHost(pageUrl.hostname, blockedHosts) ||
          /\.(?:avif|gif|jpe?g|png|webp)$/i.test(pageUrl.pathname)) return [];
      return [{
        label: candidate.label || pageUrl.hostname,
        url: pageUrl.href,
        kind: "discovery",
        webSearch: true,
        matchTerm: candidate.matchTerm,
        alt: candidate.title || displayTitle(record),
      }];
    } catch {
      return [];
    }
  }).slice(0, 8);
}

async function mapLimit(items, limit, worker) {
  const queue = [...items];
  const runners = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await worker(queue.shift());
  });
  await Promise.all(runners);
}

function coverPreference(source, platforms) {
  const url = new URL(source.url);
  const host = url.hostname.toLowerCase();
  const path = url.pathname.toLowerCase();
  const joined = platforms.join(" ").toLowerCase();
  const hasPlayStation = /ps[45]|playstation/.test(joined);
  const hasNintendo = /switch|nintendo/.test(joined);
  const hasXbox = /xbox/.test(joined);
  const isPsn = /(^|\.)store\.playstation\.com$/.test(host) || /playstation\.com$/.test(host) && path.includes("/product/");
  const isNintendoJp = host === "store-jp.nintendo.com";
  const isXboxStore = /(^|\.)(xbox|microsoft)\.com$/.test(host) && /\/games\/store\/|\/store\//.test(path);
  const pcOnly = !hasPlayStation && !hasNintendo && !hasXbox;

  if (hasPlayStation && isPsn) return 0;
  if (!hasPlayStation && hasNintendo && isNintendoJp) return 0;
  if (!hasPlayStation && !hasNintendo && hasXbox && isXboxStore) return 0;
  if (pcOnly && host === "store.steampowered.com") return 1;
  return 20 + sourceRank(source);
}

function eligibleCover(source) {
  return source.kind === "primary" || source.kind === "secondary" || source.webSearch === true;
}

function youtubeVideoId(input) {
  try {
    const url = new URL(input);
    if (url.hostname === "youtu.be") return url.pathname.split("/").filter(Boolean)[0] || null;
    if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname)) {
      if (url.pathname === "/watch") return url.searchParams.get("v");
      const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?#]+)/);
      return match?.[1] || null;
    }
  } catch {}
  return null;
}

const youtubeImageCandidates = (videoId) => [
  `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
  `https://img.youtube.com/vi/${videoId}/hq720.jpg`,
  `https://img.youtube.com/vi/${videoId}/sddefault.jpg`,
  `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
];

async function discoverFromSource(source, record) {
  if (source.imageUrl) {
    return {
      imageUrl: source.imageUrl,
      alt: source.alt || "",
      pageUrl: source.url,
    };
  }
  const videoId = source.kind === "primary" && youtubeVideoId(source.url);
  if (videoId) {
    const [imageUrl, ...fallbackImageUrls] = youtubeImageCandidates(videoId);
    return { imageUrl, fallbackImageUrls, alt: "", pageUrl: source.url };
  }
  const result = await fetchLimited(source.url, MAX_HTML_BYTES, "text/html,application/xhtml+xml;q=0.9");
  if (!/html|text/.test(result.contentType)) throw new Error(`not HTML (${result.contentType})`);
  const meta = extractMeta(result.bytes.toString("utf8"), result.url);
if (!meta) throw new Error("no usable social image metadata");
if (source.webSearch && !pageMatchesRecord(record, source, meta, result.url)) {
  throw new Error("searched page did not confirm the requested subject");
}
return { ...meta, pageUrl: result.url };
}

function imageAspect(width, height) {
  const ratio = width / height;
  if (ratio >= 0.9 && ratio <= 1.1) return "square";
  return ratio < 0.9 ? "portrait" : "landscape";
}

async function encodeUnderLimit(bytes, kind) {
  const metadata = await sharp(bytes, { failOn: "warning", limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height || metadata.width < 320 || metadata.height < 320) {
    throw new Error("image dimensions are too small");
  }
  const aspect = imageAspect(metadata.width, metadata.height);
  if (kind === "editorial" && metadata.width / metadata.height < 1.15) {
    throw new Error("editorial candidate is not sufficiently landscape");
  }
  const widths = kind === "editorial" ? [1280, 1120, 960, 800] : [900, 800, 700, 600];
  for (const width of widths) {
    for (const quality of [84, 78, 72, 66]) {
      let pipeline = sharp(bytes).rotate();
      pipeline = kind === "editorial"
        ? pipeline.resize({ width, height: Math.round(width * 9 / 16), fit: "cover", position: "attention" })
        : pipeline.resize({ width, height: width, fit: "inside", withoutEnlargement: true });
      const output = await pipeline.jpeg({ quality, mozjpeg: true }).toBuffer();
      if (output.length <= TARGET_IMAGE_BYTES) return { output, aspect };
    }
  }
  throw new Error("could not encode below 500 KB");
}

async function downloadCandidate(candidate, kind) {
  const urls = [candidate.imageUrl, ...(candidate.fallbackImageUrls || [])];
  let lastError;
  for (const url of urls) {
    try {
      const result = await fetchLimited(url, MAX_IMAGE_BYTES, "image/avif,image/webp,image/*");
      if (!result.contentType.startsWith("image/")) throw new Error(`not an image (${result.contentType})`);
      candidate.imageUrl = url;
      return await encodeUnderLimit(result.bytes, kind);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("no image candidate succeeded");
}

function mediaPath(edition, record, kind) {
  const slug = record.id.replace(/[^a-zA-Z0-9_-]+/g, "-");
  const relative = `media/briefs/${edition.date.slice(0, 4)}/${edition.date.slice(5, 7)}/${edition.id}/${slug}-${kind}.jpg`;
  return { relative, absolute: resolve(PUBLIC_ROOT, relative) };
}

async function resolveRecord(edition, record, kind, sourceList, apply) {
  const attempts = [];
  let reviewCandidate = null;
  for (const source of sourceList) {
    try {
      const candidate = await discoverFromSource(source, record);
      const encoded = await downloadCandidate(candidate, kind);
      const eligible = kind === "editorial"
      ? source.kind === "primary" || source.kind === "secondary" || source.webSearch === true
      : eligibleCover(source);
      const result = {
        recordId: record.id,
        kind,
        source: source.url,
        imageUrl: candidate.imageUrl,
        aspect: encoded.aspect,
        eligible,
      };
      if (!eligible) {
        reviewCandidate ||= {
          status: "candidate",
          ...result,
          attempts: [{
            label: source.label,
            url: source.url,
            error: "candidate did not pass relevance, source, or dimension checks",
          }],
        };
        continue;
      }
      if (!apply) return { status: "candidate", ...result };
      const target = mediaPath(edition, record, kind);
      await mkdir(dirname(target.absolute), { recursive: true });
      await writeFile(target.absolute, encoded.output);
      const title = displayTitle(record);
      return {
        status: "applied",
        ...result,
        asset: {
          url: target.relative,
          alt: candidate.alt || `${title}${kind === "cover"
            ? "\u6e38\u620f\u5c01\u9762"
            : `\uff1a${record.headline || "\u76f8\u5173\u6d88\u606f"}\u76f8\u5173\u914d\u56fe`
          }`,
          credit: source.label,
          sourceUrl: candidate.pageUrl,
          kind,
          aspect: encoded.aspect,
        },
      };
    } catch (error) {
      attempts.push({ label: source.label, url: source.url, error: error.message });
    }
  }
  return reviewCandidate || { status: "unavailable", recordId: record.id, kind, attempts };
}

async function resolveWithWebFallback(edition, record, kind, sources, options) {
  const initial = await resolveRecord(edition, record, kind, sources, options.apply);
  if (!DEEPSEEK_API_KEY || initial.status === "applied" || initial.eligible === true) {
    return initial;
  }

  const blockedHosts = [
    ...(options.sourcePolicy?.manualDiscoveryOnly || []),
    ...(options.sourcePolicy?.blockedForImport || []),
  ];
  let webSources;
  try {
    webSources = await discoverWebSources(record, kind, blockedHosts);
  } catch (error) {
    return {
      ...initial,
      attempts: [
        ...(initial.attempts || []),
        { label: "DeepSeek web search", url: "https://api.deepseek.com/", error: error.message },
      ],
    };
  }
  if (!webSources.length) return initial;

  const searched = await resolveRecord(edition, record, kind, webSources, options.apply);
  if (searched.status === "applied" || searched.eligible === true) return searched;
  return {
    ...(initial.status === "candidate" ? initial : searched),
    attempts: [...(initial.attempts || []), ...(searched.attempts || [])],
  };
}
const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const writeJson = async (path, value) => writeFile(path, JSON.stringify(value, null, 2) + "\n");

async function processEdition(manifestItem, options) {
  const path = resolve(DATA_ROOT, manifestItem.path);
  const edition = await readJson(path);
  let changed = false;
  const results = [];

  await mapLimit(edition.entries, 4, async (entry) => {
    if (entry.images?.some((asset) => asset.kind === "editorial" && !asset.placeholder)) return;
    const sources = [...(entry.sources || [])]
      .filter((source) => source.url?.startsWith("https://"))
      .sort((a, b) => sourceRank(a) - sourceRank(b));
    const result = await resolveWithWebFallback(edition, entry, "editorial", sources, options);
    results.push(result);
    if (result.status === "applied") {
      entry.images = [result.asset];
      entry.image_status = "verified";
      delete entry.imageNote;
      changed = true;
    }
  });

  await mapLimit(edition.upcoming || [], 4, async (item) => {
    if (item.cover?.kind === "cover" && !item.cover.placeholder) return;
    const catalogSources =
      options.catalog?.games?.[item.title?.title_key]?.mediaSources || [];
    const candidates = [
      ...catalogSources,
      ...(item.mediaSources || []),
      item.source,
    ]
      .filter((source) => source?.url?.startsWith("https://"))
      .sort((a, b) => coverPreference(a, item.platforms) - coverPreference(b, item.platforms));
    const result = await resolveWithWebFallback(edition, item, "cover", candidates, options);
    results.push(result);
    if (result.status === "applied") {
      item.cover = result.asset;
      item.cover_status = "verified";
      delete item.coverNote;
      changed = true;
    }
  });
  if (options.apply && changed) {
    edition.revised = true;
    await writeJson(path, edition);
  }
  return { edition, changed, results };
}

async function main() {
  const options = { apply: hasArg("--apply") };
  const manifest = await readJson(resolve(DATA_ROOT, "manifest.json"));
  options.catalog = await readJson(resolve("config/media-catalog.json"));
  options.sourcePolicy = await readJson(resolve("config/media-sources.json"));
  const editionArg = argValue("--edition");
  let items = hasArg("--all") ? manifest.editions : [manifest.editions.at(-1)];
  if (editionArg) items = manifest.editions.filter((item) => item.id === editionArg);
  if (!items.length) throw new Error("no matching edition found");

  const audit = { generatedAt: new Date().toISOString(), apply: options.apply, webSearchEnabled: Boolean(DEEPSEEK_API_KEY), webSearchProvider: DEEPSEEK_API_KEY ? "deepseek" : null, editions: [] };
  let latestEdition = null;
  for (const item of items) {
    const result = await processEdition(item, options);
    audit.editions.push({ id: item.id, changed: result.changed, results: result.results });
    if (item.id === manifest.latest) latestEdition = result.edition;
  }
  if (options.apply && latestEdition) await writeJson(resolve(DATA_ROOT, "latest.json"), latestEdition);
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeJson(REPORT_PATH, audit);

  const flat = audit.editions.flatMap((edition) => edition.results);
  const summary = Object.groupBy(flat, (item) => item.status);
  console.log(`Media audit: ${flat.length} item(s); applied=${summary.applied?.length || 0}; candidate=${summary.candidate?.length || 0}; unavailable=${summary.unavailable?.length || 0}`);
  console.log(`Web source search: ${DEEPSEEK_API_KEY ? "enabled (DeepSeek web_search)" : "disabled (DEEPSEEK_API_KEY unavailable)"}`);
  console.log(`Report: ${REPORT_PATH}`);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

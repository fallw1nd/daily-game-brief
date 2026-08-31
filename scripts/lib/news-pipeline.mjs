import { createHash } from "node:crypto";
import { latestDueWindow, plannedWindow } from "./edition-window.mjs";

export { latestDueWindow, plannedWindow };

const majorPatterns = [
  /\b(?:announce|announced|reveal|revealed|release date|launch|delay|delayed|cancel|cancelled|update|dlc|acquisition|layoff|lawsuit|policy|award|winner|champion)\b/i,
  /(?:公布|公开|发表|发售日|上线|延期|取消|更新|扩展|收购|裁员|诉讼|政策|获奖|冠军|世界级)/,
  /(?:発表|発売日|配信開始|延期|中止|アップデート|買収|訴訟|優勝)/,
];

const chinaPatterns = [/(?:中国|国产|腾讯|网易|米哈游|叠纸|鹰角|莉莉丝|完美世界|Bilibili|哔哩哔哩)/i];

const eventPatterns = [
  ["delay", /\b(?:delay|delayed|postpone|postponed)\b|延期|発売延期/i],
  ["release-date", /\b(?:release date|launch date|dated for|launches? on)\b|发售日|定档|発売日/i],
  ["launch", /\b(?:launch|launched|available now|released)\b|正式上线|现已推出|配信開始/i],
  ["update", /\b(?:major update|update|patch|season)\b|重大更新|版本更新|アップデート/i],
  ["dlc", /\b(?:dlc|expansion|add-on)\b|扩展|资料片|追加内容/i],
  ["company", /\b(?:acquisition|acquire|layoff|lawsuit|policy|earnings)\b|收购|裁员|诉讼|政策|财报/i],
  ["result", /\b(?:winner|champion|award)\b|冠军|获奖|優勝/i],
  ["announcement", /\b(?:announce|announced|reveal|revealed|unveil)\b|公布|公开|发表|発表/i],
];

const eventStopWords = new Set([
  "about", "after", "ahead", "also", "announced", "announces", "announcement", "available",
  "date", "dated", "debut", "details", "first", "from", "game", "games", "gets", "launch",
  "launched", "launches", "major", "more", "news", "official", "release", "released", "releases",
  "revealed", "reveals", "season", "show", "shows", "this", "trailer", "update", "with",
]);

function distinctiveTokens(value) {
  return [...new Set(normalizeHeadline(value).split(" ")
    .filter((token) => /^[a-z0-9][a-z0-9'-]*$/i.test(token))
    .filter((token) => token.length >= 3 && !eventStopWords.has(token)))];
}

function sameEventFamily(left, right) {
  if (left.eventKind === "other" || left.eventKind !== right.eventKind) return false;
  if (left.subjectKey && right.subjectKey) return left.subjectKey === right.subjectKey;
  const leftTokens = new Set(left.subjectTokens);
  const rightTokens = new Set(right.subjectTokens);
  const shared = [...leftTokens].filter((token) => rightTokens.has(token));
  if (shared.length < 2 || !shared.some((token) => token.length >= 5)) return false;
  const unionSize = new Set([...leftTokens, ...rightTokens]).size;
  const smallerSize = Math.min(leftTokens.size, rightTokens.size);
  return shared.length / unionSize >= 0.5 && shared.length / smallerSize >= 0.67;
}

export function decodeEntities(value = "") {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function stripHtml(value = "") {
  return decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeHeadline(value = "") {
  return stripHtml(value)
    .normalize("NFKC")
    .toLocaleLowerCase("zh-CN")
    .replace(/[\s\p{P}\p{S}]+/gu, " ")
    .trim();
}

export function canonicalUrl(input, base) {
  const url = new URL(input, base);
  if (url.protocol !== "https:") throw new Error("candidate URL must use HTTPS");
  for (const key of [...url.searchParams.keys()]) {
    if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
  }
  url.hash = "";
  return url.href;
}

function tagValue(block, names) {
  for (const name of names) {
    const match = block.match(new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}>`, "i"));
    if (match) return stripHtml(match[1]);
  }
  return "";
}

function feedLink(block, base) {
  const textLink = tagValue(block, ["link"]);
  if (textLink) {
    try { return canonicalUrl(textLink, base); } catch {}
  }
  for (const tag of block.match(/<link\b[^>]*>/gi) || []) {
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i)?.[1];
    if (href) {
      try { return canonicalUrl(decodeEntities(href[1]), base); } catch {}
    }
  }
  return "";
}

export function parseFeed(xml, source) {
  const blocks = [
    ...(xml.match(/<item\b[\s\S]*?<\/item>/gi) || []),
    ...(xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || []),
  ];
  return blocks.flatMap((block) => {
    const headline = tagValue(block, ["title"]);
    const url = feedLink(block, source.url);
    if (!headline || !url) return [];
    const rawDate = tagValue(block, ["pubDate", "published", "updated", "dc:date"]);
    const parsedDate = Date.parse(rawDate);
    return [{
      headline,
      url,
      summary: tagValue(block, ["description", "summary", "content:encoded"]).slice(0, 700),
      publishedAt: Number.isFinite(parsedDate) ? new Date(parsedDate).toISOString() : null,
    }];
  });
}

export function parseHtmlLinks(html, source) {
  const pattern = source.linkPattern ? new RegExp(source.linkPattern, "i") : null;
  const seen = new Set();
  const results = [];
  for (const match of html.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const href = match[1].match(/href\s*=\s*(?:"([^"]+)"|'([^']+)'|([^\s>]+))/i);
    if (!href) continue;
    let url;
    try { url = canonicalUrl(decodeEntities(href[1] || href[2] || href[3]), source.url); } catch { continue; }
    if (pattern && !pattern.test(url)) continue;
    const headline = stripHtml(match[2]);
    if (headline.length < 8 || headline.length > 240 || seen.has(url) ||
        /^(?:skip to\b.*|read more|learn more|view all|news|home|menu|privacy|terms|登录|首页|更多|ニュース)$/i.test(headline)) continue;
    seen.add(url);
    const slashDate = headline.match(/\b(\d{2})\/(\d{2})\/(\d{2})\b/);
    const isoDate = headline.match(/\b(20\d{2})[-/.](\d{2})[-/.](\d{2})\b/);
    let publishedAt = null;
    if (slashDate) {
      publishedAt = new Date(Date.UTC(2000 + Number(slashDate[3]), Number(slashDate[1]) - 1, Number(slashDate[2]), 12)).toISOString();
    } else if (isoDate) {
      publishedAt = new Date(Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3]), 12)).toISOString();
    }
    results.push({ headline, url, summary: "", publishedAt });
  }
  return results;
}

function evidenceScore(record) {
  let score = record.source.priority || 0;
  if (record.source.group === "official") score += 35;
  if (record.source.group === "event") score += 25;
  if (majorPatterns.some((pattern) => pattern.test(record.headline))) score += 25;
  if (chinaPatterns.some((pattern) => pattern.test(record.headline))) score += 15;
  if (!record.publishedAt) score -= 20;
  score += Math.min(30, Math.max(0, record.independentSources.length - 1) * 15);
  return score;
}

function tierFor(record) {
  if ((record.source.group === "official" && record.publishedAt) || record.score >= 125) return "A";
  if (record.score >= 80) return "B";
  return "C";
}

export function eventIdentity(headline) {
  const raw = stripHtml(headline);
  const normalized = normalizeHeadline(raw);
  const eventKind = eventPatterns.find(([, pattern]) => pattern.test(raw))?.[0] || "other";
  const quoted = raw.match(/[《『「“"]([^》』」”"]{2,100})[》』」”"]/)?.[1];
  let subjectKey = quoted ? normalizeHeadline(quoted) : "";
  if (!subjectKey) {
    const boundary = eventPatterns
      .flatMap(([, pattern]) => [...raw.matchAll(new RegExp(pattern.source, `${pattern.flags.includes("i") ? "i" : ""}g`))])
      .map((match) => match.index)
      .filter(Number.isInteger)
      .sort((a, b) => a - b)[0];
    if (Number.isInteger(boundary) && boundary >= 4) subjectKey = normalizeHeadline(raw.slice(0, boundary));
  }
  const usefulSubject = subjectKey.length >= 4 && subjectKey.split(" ").length <= 12;
  const material = usefulSubject && eventKind !== "other"
    ? `${subjectKey}|${eventKind}`
    : normalized;
  return {
    eventKind,
    subjectKey: usefulSubject ? subjectKey : null,
    subjectTokens: distinctiveTokens(usefulSubject ? subjectKey : raw),
    eventKey: createHash("sha256").update(material).digest("hex").slice(0, 20),
  };
}

export function mergeCandidates(records) {
  const byUrl = new Map();
  for (const record of records) {
    const previous = byUrl.get(record.url);
    if (!previous || (record.source.priority || 0) > (previous.source.priority || 0)) {
      byUrl.set(record.url, record);
    }
  }

  const clusters = [];
  for (const record of byUrl.values()) {
    const identity = eventIdentity(record.headline);
    const cluster = clusters.find((item) =>
      item.identity.eventKey === identity.eventKey || sameEventFamily(item.identity, identity)
    );
    if (cluster) cluster.records.push(record);
    else clusters.push({ identity, records: [record] });
  }

  return clusters.map(({ identity, records: cluster }) => {
    cluster.sort((a, b) => (b.source.priority || 0) - (a.source.priority || 0));
    const lead = cluster[0];
    const independentSources = [...new Set(cluster.map((item) => item.source.independenceKey))];
    const merged = {
      id: identity.eventKey,
      ...identity,
      headline: lead.headline,
      normalizedHeadline: normalizeHeadline(lead.headline),
      url: lead.url,
      summary: lead.summary,
      publishedAt: lead.publishedAt,
      source: lead.source,
      appearances: cluster.map((item) => ({
        sourceId: item.source.id,
        label: item.source.label,
        url: item.url,
        publishedAt: item.publishedAt,
      })),
      independentSources,
    };
    merged.score = evidenceScore(merged);
    merged.tier = tierFor(merged);
    return merged;
  }).sort((a, b) => b.score - a.score || a.headline.localeCompare(b.headline));
}

export function resemblesAdjacent(candidate, entries) {
  const title = candidate.normalizedHeadline;
  return entries.some((entry) => {
    const adjacent = normalizeHeadline(`${entry.title?.title_zh_cn || ""} ${entry.title?.title_en || ""} ${entry.headline || ""}`);
    if (!adjacent || !title) return false;
    if (adjacent.includes(title) || title.includes(adjacent)) return true;
    const tokens = title.split(" ").filter((token) => token.length >= 4);
    if (tokens.length < 2) return false;
    return tokens.filter((token) => adjacent.includes(token)).length >= Math.min(3, tokens.length);
  });
}

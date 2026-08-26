import { createHash } from "node:crypto";

const majorPatterns = [
  /\b(?:announce|announced|reveal|revealed|release date|launch|delay|delayed|cancel|cancelled|update|dlc|acquisition|layoff|lawsuit|policy|award|winner|champion)\b/i,
  /(?:公布|公开|发表|发售日|上线|延期|取消|更新|扩展|收购|裁员|诉讼|政策|获奖|冠军|世界级)/,
  /(?:発表|発売日|配信開始|延期|中止|アップデート|買収|訴訟|優勝)/,
];

const chinaPatterns = [/(?:中国|国产|腾讯|网易|米哈游|叠纸|鹰角|莉莉丝|完美世界|Bilibili|哔哩哔哩)/i];

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
      try { return canonicalUrl(decodeEntities(href), base); } catch {}
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

function candidateKey(item) {
  const normalized = normalizeHeadline(item.headline);
  return createHash("sha256").update(normalized).digest("hex").slice(0, 20);
}

export function mergeCandidates(records) {
  const byUrl = new Map();
  for (const record of records) {
    const previous = byUrl.get(record.url);
    if (!previous || (record.source.priority || 0) > (previous.source.priority || 0)) {
      byUrl.set(record.url, record);
    }
  }

  const clusters = new Map();
  for (const record of byUrl.values()) {
    const key = candidateKey(record);
    const cluster = clusters.get(key) || [];
    cluster.push(record);
    clusters.set(key, cluster);
  }

  return [...clusters.entries()].map(([id, cluster]) => {
    cluster.sort((a, b) => (b.source.priority || 0) - (a.source.priority || 0));
    const lead = cluster[0];
    const independentSources = [...new Set(cluster.map((item) => item.source.independenceKey))];
    const merged = {
      id,
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

export function plannedWindow(period, now = new Date()) {
  const dateFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  const end = period === "am" ? `${date} 10:10` : `${date} 17:00`;
  const endMs = Date.parse(`${end.replace(" ", "T")}:00+08:00`);
  const previousParts = Object.fromEntries(dateFormatter.formatToParts(
    new Date(endMs - 24 * 60 * 60 * 1000),
  ).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const previousDate = `${previousParts.year}-${previousParts.month}-${previousParts.day}`;
  const start = period === "am" ? `${previousDate} 17:00` : `${date} 10:10`;
  return { id: `${date}-${period}`, period, plannedAt: end, windowStart: start, windowEnd: end };
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

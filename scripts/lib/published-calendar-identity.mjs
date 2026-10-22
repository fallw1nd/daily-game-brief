import { getRegisteredTitleTranslation } from "./title-translations.mjs";

// Publication identity is stricter than discovery grouping. A roundup, search
// page, bundle or title resemblance alone must never collapse public releases.
const clean = value => String(value || "").normalize("NFKC").trim();
const titleName = item => clean(String(item.title?.title_en || item.titleEn || "").replace(/[™®©]/gu, "")).replace(/\s+/gu, " ").toLowerCase();

export function calendarProductIdentity(item) {
  if (item?.source?.kind !== "primary") return null;
  try {
    const url = new URL(item.source.url);
    if (url.protocol !== "https:" || url.username || url.password || url.port) return null;
    const path = url.pathname;
    let match;
    if (url.hostname === "store.steampowered.com" && (match = path.match(/^\/app\/(\d+)(?:\/[^/]+)?\/?$/))) return `steam:app:${match[1]}`;
    if (["www.nintendo.com", "nintendo.com"].includes(url.hostname) && (match = path.match(/^\/([a-z]{2})\/store\/products\/([a-z0-9-]+)\/?$/))) return `nintendo:${match[1]}:${match[2]}`;
    if (url.hostname === "store.playstation.com" && (match = path.match(/^\/([a-z]{2}-[a-z]{2})\/product\/([A-Za-z0-9_-]+)\/?$/))) return `playstation:${match[1]}:${match[2]}`;
    if (["www.xbox.com", "xbox.com"].includes(url.hostname) && (match = path.match(/^\/([a-z]{2}-[a-z]{2})\/games\/store\/[^/]+\/([A-Za-z0-9]{12})\/?$/))) return `xbox:${match[1]}:${match[2].toUpperCase()}`;
  } catch { /* Unrecognized URLs retain their independent identity. */ }
  return null;
}

// Stable row IDs are editorial handles, not proof that a corrected row still
// describes the same product. Media/name inheritance needs subject evidence.
export function sameCalendarSubject(left, right) {
  const name = titleName(left);
  if (!name || name !== titleName(right) || left?.source?.kind !== "primary" || right?.source?.kind !== "primary") return false;
  const leftProduct = calendarProductIdentity(left);
  const rightProduct = calendarProductIdentity(right);
  if (leftProduct || rightProduct) return Boolean(leftProduct && leftProduct === rightProduct);
  return Boolean(left.id && left.id === right.id && left.source.url === right.source.url);
}

function releaseScope(item) {
  const value = clean(item.releaseType);
  // These existing presentation labels describe launch scope, not DLC,
  // early access, upgrade packs, remasters or a separate release type.
  if (value === "多平台发售" || (item.platforms || []).some(platform => value === `${platform}版发售`)) return "platform-launch";
  return value;
}

function releaseDate(value, editionDate) {
  const date = clean(value);
  if (!editionDate || !/^\d{2}\.\d{2}$/.test(date)) return date;
  const year = Number(editionDate.slice(0, 4)) + (Number(date.slice(0, 2)) < Number(editionDate.slice(5, 7)) ? 1 : 0);
  return `${year}-${date.replace(".", "-")}`;
}

export function sameCalendarRelease(left, right, editionDate) {
  const product = calendarProductIdentity(left);
  const name = titleName(left);
  return Boolean(product && product === calendarProductIdentity(right) && name && name === titleName(right)
    && releaseDate(left.date, editionDate) === releaseDate(right.date, editionDate)
    && clean(left.region) && clean(left.region) === clean(right.region)
    && releaseScope(left) && releaseScope(left) === releaseScope(right));
}

function nameRank(title) {
  if (!title?.title_zh_cn) return 0;
  const registered = getRegisteredTitleTranslation(title.title_key, title.title_en);
  if (registered?.evidence?.kind === "user_provided" && registered.titleZhCn === title.title_zh_cn) return 5;
  return { official_simplified: 4, common_translation: 3, provisional_translation: 2 }[title.title_zh_status] || 1;
}
const verifiedCover = item => item?.cover?.kind === "cover" && item.cover.placeholder !== true;

export function retainCalendarPresentation(previous, next) {
  const title = nameRank(previous.title) >= nameRank(next.title) ? previous.title : { ...next.title, title_key: previous.title?.title_key || next.title?.title_key };
  const media = verifiedCover(previous) ? previous : verifiedCover(next) ? next : null;
  const result = { ...next, id: previous.id, title };
  if (media) {
    result.cover = media.cover;
    result.cover_status = "verified";
    delete result.coverNote;
    result.mediaSources = [...new Map([...(previous.mediaSources || []), ...(next.mediaSources || [])].map(source => [source.url, source])).values()];
  }
  return result;
}

export function mergePublishedCalendar(items) {
  const result = [];
  for (const item of items) {
    const matches = result.filter(previous => sameCalendarRelease(previous, item)
      && previous.platforms?.some(platform => item.platforms?.includes(platform)));
    if (!matches.length) { result.push(item); continue; }
    const first = matches[0];
    const merged = matches.reduce((value, previous) => retainCalendarPresentation(previous, value), item);
    merged.id = first.id;
    merged.title = matches.reduce((best, previous) => nameRank(previous.title) >= nameRank(best) ? previous.title : best, merged.title);
    merged.title = { ...merged.title, title_key: first.title?.title_key || merged.title?.title_key };
    merged.platforms = [...new Set([...matches.flatMap(previous => previous.platforms), ...item.platforms])];
    // Keep the broader published scope label when a narrower alias overlaps it.
    if (matches.some(previous => previous.releaseType === "多平台发售")) merged.releaseType = "多平台发售";
    result[result.indexOf(first)] = merged;
    for (const duplicate of matches.slice(1)) result.splice(result.indexOf(duplicate), 1);
  }
  return result;
}

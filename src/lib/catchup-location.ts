import { catchupRange, validCatchupDate, type CatchupRange } from "./catchup";
import { readingHref } from "./reading";

export type CatchupDays = 7 | 30 | "all" | "custom";
export interface CatchupLocation {
  days: CatchupDays;
  start: string;
  end: string;
  topic: string;
  limit: number;
}

const keys = ["cuDays", "cuFrom", "cuTo", "cuTopic", "cuLimit"] as const;

export function readCatchupLocation(search: string): CatchupLocation {
  const params = new URLSearchParams(search);
  const days = params.get("cuDays");
  const limit = Number(params.get("cuLimit"));
  return {
    days: days === "all" || days === "custom" ? days : days === "30" ? 30 : 7,
    start: params.get("cuFrom") ?? "",
    end: params.get("cuTo") ?? "",
    topic: params.get("cuTopic") ?? "",
    limit: Number.isSafeInteger(limit) && limit >= 12 ? Math.min(limit, 1200) : 12,
  };
}

export function catchupLocationRange(location: CatchupLocation, earliest: string, latest: string): CatchupRange {
  if (location.days === "custom") return { start: location.start, end: location.end };
  const end = validCatchupDate(location.end) ? location.end : latest;
  if (location.days === "all") return { start: validCatchupDate(location.start) ? location.start : earliest, end };
  return catchupRange(end, location.days);
}

/** Only this feature's keys are changed; edition, language and archive search survive. */
export function writeCatchupLocation(url: URL, location: CatchupLocation): URL {
  const next = new URL(url);
  keys.forEach(key => next.searchParams.delete(key));
  next.searchParams.set("catchup", "1");
  next.searchParams.set("cuDays", String(location.days));
  if (location.start) next.searchParams.set("cuFrom", location.start);
  if (location.end) next.searchParams.set("cuTo", location.end);
  if (location.topic) next.searchParams.set("cuTopic", location.topic);
  if (location.limit > 12) next.searchParams.set("cuLimit", String(location.limit));
  next.hash = "catchup";
  return next;
}

export function catchupTopicHref(topic: string, editionId: string, english: boolean): string {
  const params = new URLSearchParams(readingHref(editionId, undefined, english).split("?")[1]);
  params.set("catchup", "1");
  params.set("cuDays", "all");
  params.set("cuTopic", topic);
  return `${import.meta.env.BASE_URL}?${params}#catchup`;
}

export function catchupLanguageHref(search: string, english: boolean): string {
  const params = new URLSearchParams(search);
  params.set("view", "reading");
  if (english) params.set("lang", "en"); else params.delete("lang");
  return `${import.meta.env.BASE_URL}?${params}#catchup`;
}

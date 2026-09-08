import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DAY_MS = 86_400_000;
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

function editionDayTimestamp(date) {
  return Date.parse(`${date}T00:00:00+08:00`);
}

function dateOnly(timestamp) {
  return new Date(timestamp + SHANGHAI_OFFSET_MS).toISOString().slice(0, 10);
}

export function upcomingDateTimestamp(date, editionDate) {
  const match = String(date || "").match(/^(\d{2})\.(\d{2})$/);
  if (!match) return Number.NaN;
  const editionYear = Number(editionDate.slice(0, 4));
  const month = Number(match[1]);
  const day = Number(match[2]);
  const candidates = [editionYear - 1, editionYear, editionYear + 1]
    .map((year) => Date.parse(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00+08:00`))
    .filter(Number.isFinite);
  const anchor = editionDayTimestamp(editionDate);
  return candidates.sort((left, right) => Math.abs(left - anchor) - Math.abs(right - anchor))[0] ?? Number.NaN;
}

export function filterUpcomingWindow(items, editionDate, days = 15) {
  const start = editionDayTimestamp(editionDate);
  const end = start + days * DAY_MS;
  return (items || [])
    .filter((item) => {
      const value = upcomingDateTimestamp(item?.date, editionDate);
      return Number.isFinite(value) && value > start && value <= end;
    })
    .sort((left, right) => upcomingDateTimestamp(left.date, editionDate) - upcomingDateTimestamp(right.date, editionDate));
}

export function upcomingRefreshRange(sourceEditionId, editionDate, days = 15) {
  const targetStart = editionDayTimestamp(editionDate) + DAY_MS;
  const targetEnd = editionDayTimestamp(editionDate) + days * DAY_MS;
  // An edition date is not evidence that its calendar was exhaustively checked.
  const refreshStart = targetStart;
  return {
    startInclusive: dateOnly(refreshStart),
    endInclusive: dateOnly(targetEnd),
  };
}

export async function loadCanonicalUpcomingBaseline({ latest, manifest, editionDate, dataRoot = "public/data" }) {
  const current = filterUpcomingWindow(latest?.upcoming, editionDate);
  if (current.length) {
    const sourceEditionId = latest?.id || manifest?.latest || null;
    return {
      sourceEditionId,
      items: current,
      refreshRange: upcomingRefreshRange(sourceEditionId, editionDate),
    };
  }

  for (const item of [...(manifest?.editions || [])].reverse()) {
    if (!item?.path || item.id === latest?.id) continue;
    try {
      const archived = JSON.parse(await readFile(resolve(dataRoot, item.path), "utf8"));
      const candidates = filterUpcomingWindow(archived?.upcoming, editionDate);
      if (candidates.length) {
        const sourceEditionId = archived.id || item.id;
        return {
          sourceEditionId,
          items: candidates,
          refreshRange: upcomingRefreshRange(sourceEditionId, editionDate),
        };
      }
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }

  return {
    sourceEditionId: null,
    items: [],
    refreshRange: upcomingRefreshRange(null, editionDate),
  };
}

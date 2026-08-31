export const EDITION_PERIODS = Object.freeze(["am", "pm", "daily"]);

export function isEditionPeriod(period) {
  return EDITION_PERIODS.includes(period);
}

function beijingDateForInstant(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

export function shiftDate(date, days) {
  const [year, month, day] = String(date).split("-").map(Number);
  if (![year, month, day].every(Number.isInteger)) throw new Error(`invalid edition date: ${date}`);
  return new Date(Date.UTC(year, month - 1, day) + days * 86400000).toISOString().slice(0, 10);
}

export function editionWindowForDate(date, period) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date || ""))) throw new Error(`invalid edition date: ${date}`);
  if (!isEditionPeriod(period)) throw new Error(`period must be one of ${EDITION_PERIODS.join(", ")}`);
  if (period === "am") {
    return {
      id: `${date}-am`,
      period,
      plannedAt: `${date} 10:10`,
      windowStart: `${shiftDate(date, -1)} 17:00`,
      windowEnd: `${date} 10:10`,
    };
  }
  if (period === "pm") {
    return {
      id: `${date}-pm`,
      period,
      plannedAt: `${date} 17:00`,
      windowStart: `${date} 10:10`,
      windowEnd: `${date} 17:00`,
    };
  }
  return {
    id: `${date}-daily`,
    period,
    plannedAt: `${date} 17:00`,
    windowStart: `${shiftDate(date, -1)} 17:00`,
    windowEnd: `${date} 17:00`,
  };
}

export function expectedEditorialWindow(editionId) {
  const match = String(editionId || "").match(/^(\d{4}-\d{2}-\d{2})-(am|pm|daily)$/);
  if (!match) return null;
  const [, date, period] = match;
  return editionWindowForDate(date, period);
}

export function plannedWindow(period, now = new Date()) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) throw new Error("now must be a valid Date");
  return editionWindowForDate(beijingDateForInstant(now), period);
}

export function latestDueWindow(period, now = new Date()) {
  const current = plannedWindow(period, now);
  const currentEndMs = Date.parse(`${current.windowEnd.replace(" ", "T")}:00+08:00`);
  if (now.getTime() >= currentEndMs) return current;
  return plannedWindow(period, new Date(currentEndMs - 24 * 60 * 60 * 1000));
}

export function archiveTitlePrefix(period) {
  if (period === "am") return "早报｜";
  if (period === "pm") return "晚报｜";
  if (period === "daily") return "日报｜";
  throw new Error(`unsupported period: ${period}`);
}

export function englishArchiveTitlePrefix(period) {
  if (period === "am") return "Morning Brief |";
  if (period === "pm") return "Evening Brief |";
  if (period === "daily") return "Daily Brief |";
  throw new Error(`unsupported period: ${period}`);
}

export function nextEditionAt(window) {
  if (!window || !isEditionPeriod(window.period)) throw new Error("window must have a supported period");
  const date = window.id.slice(0, 10);
  if (window.period === "am") return `${date} 17:00`;
  if (window.period === "pm") return `${shiftDate(date, 1)} 10:10`;
  return `${shiftDate(date, 1)} 17:00`;
}

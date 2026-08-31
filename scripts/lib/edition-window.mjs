const PERIODS = new Set(["am", "pm", "daily"]);
const DAY_MS = 24 * 60 * 60 * 1000;

function beijingDateParts(now) {
  return Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function beijingDate(now) {
  const parts = beijingDateParts(now);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function previousBeijingDate(date) {
  const midday = Date.parse(`${date}T12:00:00+08:00`);
  return beijingDate(new Date(midday - DAY_MS));
}

export function assertEditionPeriod(period) {
  if (!PERIODS.has(period)) throw new Error("period must be am, pm, or daily");
  return period;
}

export function plannedWindow(period, now = new Date()) {
  assertEditionPeriod(period);
  const date = beijingDate(now);
  const previousDate = previousBeijingDate(date);
  const plannedAt = period === "am" ? `${date} 10:10` : `${date} 17:00`;
  const windowStart = period === "pm"
    ? `${date} 10:10`
    : `${previousDate} 17:00`;
  return {
    id: `${date}-${period}`,
    period,
    plannedAt,
    windowStart,
    windowEnd: plannedAt,
  };
}

export function latestDueWindow(period, now = new Date()) {
  const current = plannedWindow(period, now);
  const currentEndMs = Date.parse(`${current.windowEnd.replace(" ", "T")}:00+08:00`);
  if (now.getTime() >= currentEndMs) return current;
  return plannedWindow(period, new Date(currentEndMs - DAY_MS));
}

export function windowForEditionId(editionId) {
  const match = /^(\d{4}-\d{2}-\d{2})-(am|pm|daily)$/.exec(editionId || "");
  if (!match) return null;
  const [, date, period] = match;
  const window = plannedWindow(period, new Date(`${date}T12:00:00+08:00`));
  return window.id === editionId ? window : null;
}

export function nextEditionAtForPeriod(period, date) {
  assertEditionPeriod(period);
  if (period === "am") return `${date} 17:00`;
  const nextDate = beijingDate(new Date(Date.parse(`${date}T12:00:00+08:00`) + DAY_MS));
  return period === "pm" ? `${nextDate} 10:10` : `${nextDate} 17:00`;
}

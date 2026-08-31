const PERIODS = new Set(["am", "pm", "daily"]);
const DAY_MS = 24 * 60 * 60 * 1000;

// Authorized production cutover bridge. The final published legacy edition is
// 2026-08-30-pm ending at 17:00; the first Daily must start strictly after that
// cutoff to avoid overlapping already-published PM facts. All later Daily
// editions use the normal previous-10:10 -> current-10:10 evidence window.
const FIRST_DAILY_CUTOVER = {
  editionId: "2026-08-31-daily",
  windowStart: "2026-08-30 17:00",
};

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

  if (period === "am") {
    return {
      id: `${date}-am`,
      period: "am",
      plannedAt: `${date} 10:10`,
      windowStart: `${previousDate} 17:00`,
      windowEnd: `${date} 10:10`,
    };
  }

  if (period === "pm") {
    return {
      id: `${date}-pm`,
      period: "pm",
      plannedAt: `${date} 17:00`,
      windowStart: `${date} 10:10`,
      windowEnd: `${date} 17:00`,
    };
  }

  const editionId = `${date}-daily`;
  return {
    id: editionId,
    period: "daily",
    plannedAt: `${date} 12:00`,
    windowStart: editionId === FIRST_DAILY_CUTOVER.editionId
      ? FIRST_DAILY_CUTOVER.windowStart
      : `${previousDate} 10:10`,
    windowEnd: `${date} 10:10`,
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
  return period === "pm" ? `${nextDate} 10:10` : `${nextDate} 12:00`;
}

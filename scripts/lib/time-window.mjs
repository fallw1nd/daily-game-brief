const BEIJING_MINUTE_PATTERN = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/;
const SECOND_PRECISION_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/;

export function beijingTimestamp(value) {
  if (!BEIJING_MINUTE_PATTERN.test(value ?? "")) return NaN;
  return Date.parse(`${value.replace(" ", "T")}:00+08:00`);
}

export function beijingMinuteForInstant(value) {
  const instant = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(instant.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

export function isSecondPrecisionTimestamp(value) {
  return typeof value === "string" &&
    SECOND_PRECISION_ISO_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value));
}

export function isBoundaryMinute(value, window) {
  return Boolean(value && window && (value === window.windowStart || value === window.windowEnd));
}

export function resolveSelectedTimeEvidence(decision, packetItem) {
  if (decision?.timeStatus !== "verified" || !BEIJING_MINUTE_PATTERN.test(decision?.beijingTime ?? "")) {
    return null;
  }
  const selectedIndexes = new Set(decision.sourceIndexes || []);
  const candidates = (packetItem?.sources || [])
    .filter((source) => source.status === "opened" && selectedIndexes.has(source.sourceIndex))
    .map((source) => source.publishedAt)
    .filter(isSecondPrecisionTimestamp)
    .map((value) => new Date(Date.parse(value)).toISOString())
    .filter((value) => beijingMinuteForInstant(value) === decision.beijingTime);
  const unique = [...new Set(candidates)];
  return unique.length === 1 ? unique[0] : null;
}

export function verifiedWindowTimeError({
  beijingTime,
  timeEvidenceAt = null,
  windowStart,
  windowEnd,
  requireExactBoundary = false,
}) {
  const minuteMs = beijingTimestamp(beijingTime);
  const startMs = beijingTimestamp(windowStart);
  const endMs = beijingTimestamp(windowEnd);
  if (![minuteMs, startMs, endMs].every(Number.isFinite)) return null;

  const boundaryMinute = beijingTime === windowStart || beijingTime === windowEnd;
  if (requireExactBoundary && boundaryMinute && !timeEvidenceAt) {
    return "verified boundary-minute time requires second-precision selected-source evidence";
  }

  let eventMs = minuteMs;
  if (timeEvidenceAt) {
    if (!isSecondPrecisionTimestamp(timeEvidenceAt)) {
      return "timeEvidenceAt must be a second-precision ISO timestamp";
    }
    if (beijingMinuteForInstant(timeEvidenceAt) !== beijingTime) {
      return "timeEvidenceAt does not match the displayed Beijing minute";
    }
    eventMs = Date.parse(timeEvidenceAt);
  }

  if (eventMs <= startMs || eventMs > endMs) {
    return "verified event time falls outside the fixed window";
  }
  return null;
}

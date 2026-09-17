import { titleIdentity } from "./release-calendar-discovery.mjs";
import { getRegisteredTitleTranslation } from "./title-translations.mjs";

function slug(value) {
  const normalized = String(value || "untitled").normalize("NFKD").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 72);
  return normalized || "untitled";
}

function beijingTime(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function sectionFor(eventKind) {
  if (["release-date", "launch"].includes(eventKind)) return "releases";
  if (eventKind === "company") return "industry";
  return "news";
}

function archivePrefix(period) {
  if (period === "am") return "早报｜";
  if (period === "pm") return "晚报｜";
  if (period === "daily") return "日报｜";
  throw new Error(`unsupported degraded period: ${period}`);
}

function upcomingMode(period) {
  if (period === "am") return "replace";
  if (period === "pm" || period === "daily") return "inherit_and_patch";
  throw new Error(`unsupported degraded period: ${period}`);
}

function nullableDecision(item, reason) {
  return {
    eventKey: item.eventKey, decision: "exclude", section: null, titleKey: null, titleZhCn: null,
    titleEn: null, titleZhStatus: null, headline: null, summary: null, factStatus: null,
    timeStatus: null, entryFlags: [], tracking: false, verification: "", reason,
    beijingTime: null, timeNote: null, platforms: [], region: null, releaseType: null,
    sourceIndexes: [], additionalSources: [],
  };
}

function validHttps(value) {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function withinDiscoveryWindow(date, window) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date || "") &&
    date >= window.startInclusive && date <= window.endInclusive;
}

function sourceLabel(candidate) {
  if (candidate.family === "steam" || candidate.sourceId?.startsWith("steam")) return "Steam";
  if (candidate.family === "nintendo" || candidate.sourceId?.startsWith("nintendo")) return "Nintendo";
  if (candidate.family === "xbox" || candidate.sourceId?.startsWith("xbox")) return "Xbox";
  return candidate.sourceId || "官方商店";
}

function preferredPlatforms(candidates) {
  const values = [...new Set(candidates.flatMap((item) => item.platforms || []).filter(Boolean))];
  const switch2OnlyPage = candidates.every((item) => /switch-2(?:\/|$)/i.test(item.url || ""));
  if (switch2OnlyPage && values.includes("Nintendo Switch 2")) {
    return values.filter((value) => value !== "Nintendo Switch");
  }
  return values;
}

export function buildDegradedUpcomingPatch(input) {
  const discovery = input?.upcomingDiscovery;
  if (!discovery?.window || !Array.isArray(discovery.candidates)) return [];

  const baselineNames = new Set((input.upcomingBaseline?.items || []).flatMap((item) => [
    item?.title?.title_en,
    item?.title?.title_zh_cn,
  ]).filter(Boolean).map(titleIdentity));
  const grouped = new Map();
  for (const candidate of discovery.candidates) {
    const identity = titleIdentity(candidate?.title);
    if (!identity) continue;
    const list = grouped.get(identity) || [];
    list.push(candidate);
    grouped.set(identity, list);
  }

  const patch = [];
  for (const [identity, group] of grouped) {
    if (baselineNames.has(identity)) continue;
    const dates = new Set(group.map((item) => item?.date).filter((date) =>
      withinDiscoveryWindow(date, discovery.window)
    ));
    // A disagreement anywhere in discovery is enough to keep the title for human review.
    if (dates.size !== 1) continue;
    const [date] = dates;
    const eligible = group.filter((item) =>
      item?.kind === "primary" &&
      (item.knownTitle === true || item.crossSource === true) &&
      item.date === date &&
      validHttps(item.url)
    );
    if (!eligible.length) continue;

    const selected = [...eligible].sort((left, right) =>
      Number(right.priority || 0) - Number(left.priority || 0) ||
      String(left.sourceId || "").localeCompare(String(right.sourceId || ""))
    )[0];
    const titleKey = slug(selected.title);
    const registered = getRegisteredTitleTranslation(titleKey, selected.title);
    patch.push({
      id: `upcoming-${titleKey}`,
      date: date.slice(5).replace("-", "."),
      titleKey,
      titleZhCn: registered?.titleZhCn || null,
      titleEn: selected.title,
      titleZhStatus: registered?.titleZhCn && registered?.titleZhStatus ? registered.titleZhStatus : "unavailable",
      platforms: preferredPlatforms(eligible),
      region: selected.region === "US" ? "美国" : (selected.region || "来源地区"),
      releaseType: "正式发售",
      source: { label: sourceLabel(selected), url: selected.url, kind: "primary" },
      note: "无AI降级日历仅采用官方一手列表中的明确日期；未据此泛化其他平台、地区或版本。",
    });
  }

  return patch.sort((left, right) => left.date.localeCompare(right.date) || left.titleEn.localeCompare(right.titleEn));
}

export function buildDegradedDecision(packet, { packetBlobSha } = {}) {
  const input = packet.editorialInput;
  const packageDecisions = input.packages.map((item) => {
    const opened = item.sources.filter((source) => source.status === "opened" && source.kind !== "discovery");
    const primary = opened.filter((source) => source.kind === "primary");
    const independent = new Set(opened.map((source) => source.independenceKey || new URL(source.url).hostname));
    const eligible = item.publishability !== "requires_subject_identity" && item.subjectKey && item.tier === "A" && item.timeRelation === "window" && (primary.length > 0 || independent.size >= 2);
    if (!eligible) return nullableDecision(item, "无AI兜底只收录窗口内、A级且具一手或两家独立来源的事实。");
    const evidence = opened.map((source) => source.evidenceText).find(Boolean);
    if (!evidence) return nullableDecision(item, "来源已打开但没有可用正文证据。");
    const titleName = item.subjectKey || item.headline;
    const published = opened.map((source) => source.publishedAt).find(Boolean);
    const eventTime = beijingTime(published);
    return {
      eventKey: item.eventKey, decision: "include", section: sectionFor(item.eventKind),
      titleKey: slug(titleName), titleZhCn: null, titleEn: String(titleName).slice(0, 160),
      titleZhStatus: "unavailable", headline: `[自动事实清单] ${item.headline}`.slice(0, 180),
      summary: evidence.replace(/\s+/g, " ").trim().slice(0, 260),
      factStatus: primary.length ? "official" : "multi_source_verified",
      timeStatus: eventTime ? "verified" : "date_only", entryFlags: [], tracking: false,
      verification: primary.length ? "程序已打开一手来源并提取正文；本条为缺期时的无AI降级稿。" : "程序已打开两家独立来源；本条为缺期时的无AI降级稿。",
      reason: "满足无AI降级收录门槛。", beijingTime: eventTime,
      timeNote: eventTime ? "来源发布时间已换算为北京时间并处于固定窗口。" : "来源未披露可验证的具体时刻，仅确认属于本期窗口。",
      platforms: [], region: "全球", releaseType: item.eventKind,
      sourceIndexes: opened.map((source) => source.sourceIndex), additionalSources: [],
      sharedFactFrame: {
        subjectTitleKey: slug(titleName), dates: [], times: eventTime ? [eventTime] : [], numbers: [],
        platforms: [], peopleAndEntities: [], versionsAndTerms: [],
      },
    };
  });
  const trackingDecisions = (input.trackingQueue || []).map((item) => ({
    eventKey: item.eventKey, decision: "needs_review", section: null, titleKey: null,
    titleZhCn: null, titleEn: null, titleZhStatus: null, headline: null, summary: null,
    factStatus: null, timeStatus: null, entryFlags: [], tracking: true,
    verification: "无AI缺期兜底不关闭此前尚未解决的追踪项。",
    reason: item.reason || "等待后续正常编辑任务复查。", beijingTime: null, timeNote: null,
    platforms: [], region: null, releaseType: null, sourceIndexes: [], additionalSources: [],
  }));
  const decisions = [...packageDecisions, ...trackingDecisions];
  const included = decisions.filter((item) => item.decision === "include");
  if (!included.length) throw new Error("No high-confidence A-level event is eligible for degraded publication");
  const prefix = archivePrefix(input.window.period);
  const leadName = included[0].titleEn || "自动事实清单";
  const upcoming = input.window.period === "daily" ? buildDegradedUpcomingPatch(input) : [];
  return {
    contractVersion: 2,
    packetBlobSha,
    editionId: input.window.id,
    archiveTitle: Array.from(`${prefix}${leadName}`).slice(0, 40).join(""),
    leadEventKey: included[0].eventKey,
    decisions,
    upcomingMode: upcomingMode(input.window.period),
    removeUpcomingIds: [], upcoming,
    checkedExtra: ["无AI缺期兜底：仅使用已经打开的证据页"],
    limitedExtra: ["本期为自动事实清单，未执行中文编辑、传闻判断或最后15分钟人工式补查。"],
    editorialNote: "正常ChatGPT定时任务未在SLA前完成；系统只发布高置信事实以避免整期缺失，等待后续编辑修订。",
  };
}

import { nextEditionAtForPeriod } from "./edition-window.mjs";
import { localizeHeadline, localizeRegisteredTitles, resolveTitleTranslation } from "./title-translations.mjs";
import {
  isBoundaryMinute,
  resolveSelectedTimeEvidence,
  verifiedWindowTimeError,
} from "./time-window.mjs";
import { editorialDecisionDigest, projectionDigest } from "./locale-digest.mjs";

export { editorialDecisionDigest };

function beijingNow(now) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(now).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

function nextEditionAt(window) {
  return nextEditionAtForPeriod(window.period, window.id.slice(0, 10));
}

function archiveTitlePrefix(period) {
  if (period === "am") return "早报｜";
  if (period === "pm") return "晚报｜";
  if (period === "daily") return "日报｜";
  throw new Error(`unsupported edition period ${period}`);
}

function displayTitle(decision) {
  const resolved = resolveTitleTranslation({
    titleKey: decision.titleKey,
    titleZhCn: decision.titleZhCn,
    titleZhStatus: decision.titleZhStatus,
    titleEn: decision.titleEn,
  });
  return {
    title_key: resolved.titleKey,
    ...(resolved.titleZhCn ? { title_zh_cn: resolved.titleZhCn } : {}),
    ...(resolved.titleEn ? { title_en: resolved.titleEn } : {}),
    title_zh_status: resolved.titleZhStatus,
  };
}

function normalizedSourceUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    return url.href.replace(/\/$/, "");
  } catch { return value; }
}

function sourcesFor(decision, packetItem) {
  const selected = (packetItem?.sources || []).filter((source) =>
    (decision.sourceIndexes || []).includes(source.sourceIndex)
  ).map((source) => ({ label: source.label, url: source.canonicalUrl || source.url, kind: source.kind }));
  const all = [...selected, ...(decision.additionalSources || [])];
  const seen = new Set();
  return all.filter((source) => {
    const key = normalizedSourceUrl(source.url);
    if (!/^https:\/\//.test(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function upcomingTimestamp(editionDate, value) {
  if (!/^\d{2}\.\d{2}$/.test(value || "")) return NaN;
  const [month, day] = value.split(".").map(Number);
  const baseYear = Number(editionDate.slice(0, 4));
  const baseMonth = Number(editionDate.slice(5, 7));
  return Date.UTC(month < baseMonth ? baseYear + 1 : baseYear, month - 1, day);
}

function inUpcomingWindow(item, editionDate) {
  const start = Date.parse(`${editionDate}T00:00:00Z`) + 86400000;
  const end = start + 14 * 86400000;
  const dates = String(item.date || "").split(/[／/、,]/).map((value) => upcomingTimestamp(editionDate, value.trim()));
  return dates.length > 0 && dates.every((date) => Number.isFinite(date) && date >= start && date <= end);
}

function upcomingEntry(item, previous) {
  const verifiedMedia = previous?.cover?.kind === "cover" && previous.cover.placeholder !== true
    ? {
        cover: previous.cover,
        cover_status: "verified",
        ...(Array.isArray(previous.mediaSources) ? { mediaSources: previous.mediaSources } : {}),
      }
    : {
        cover_status: "unavailable",
        coverNote: "自动交接阶段尚未取得已验证封面，交给异步媒体流程补全。",
        mediaSources: [item.source],
      };
  return {
    id: item.id,
    date: item.date,
    title: displayTitle(item),
    platforms: item.platforms,
    region: item.region,
    releaseType: item.releaseType,
    source: item.source,
    note: item.note,
    ...verifiedMedia,
  };
}

export function buildEdition({ packet, editorial, latest, manifest, now = new Date() }) {
  const input = packet.editorialInput;
  const window = input.window;
  if (editorial.editionId !== window.id) throw new Error("editorial editionId does not match packet window");
  const existingManifestItem = manifest.editions.find((item) => item.id === window.id);
  const decisionDigest = editorialDecisionDigest(editorial);
  const degradedEdition = latest.id === window.id && (
    latest.entries?.some((item) => item.headline?.startsWith("[自动事实清单]")) ||
    latest.sourceReport?.note?.includes("正常ChatGPT定时任务未在SLA前完成")
  );
  if (existingManifestItem && !degradedEdition) {
    return { status: "already-exists", edition: null, manifest, decisionDigest, entryIdsByEvent: {} };
  }
  const prefix = archiveTitlePrefix(window.period);
  if (!editorial.archiveTitle.startsWith(prefix)) throw new Error(`archiveTitle must start with ${prefix}`);
  const packetByKey = new Map(input.packages.map((item) => [item.eventKey, item]));
  const counters = new Map();
  const entryByEvent = new Map();
  const entries = editorial.decisions.filter((item) => item.decision === "include").map((decision) => {
    const packetItem = packetByKey.get(decision.eventKey);
    if (!packetItem && !(decision.additionalSources || []).length) throw new Error(`included ${decision.eventKey} has no packet evidence`);
    const sources = sourcesFor(decision, packetItem);
    if (!sources.length) throw new Error(`included ${decision.eventKey} has no selected source`);
    const boundaryMinute = decision.timeStatus === "verified" && isBoundaryMinute(decision.beijingTime, window);
    const timeEvidenceAt = boundaryMinute ? resolveSelectedTimeEvidence(decision, packetItem) : null;
    if (boundaryMinute) {
      const timeError = verifiedWindowTimeError({
        beijingTime: decision.beijingTime,
        timeEvidenceAt,
        windowStart: window.windowStart,
        windowEnd: window.windowEnd,
        requireExactBoundary: true,
      });
      if (timeError) throw new Error(`included ${decision.eventKey}: ${timeError}`);
    }
    const index = counters.get(decision.section) || 0;
    counters.set(decision.section, index + 1);
    const id = `${window.id}-${decision.section}-${index}`;
    entryByEvent.set(decision.eventKey, id);
    const title = displayTitle(decision);
    return {
      id,
      section: decision.section,
      title,
      headline: localizeRegisteredTitles(localizeHeadline(decision.headline, { titleEn: title.title_en, titleZhCn: title.title_zh_cn })),
      summary: localizeRegisteredTitles(decision.summary),
      beijingTime: decision.beijingTime || window.windowEnd,
      ...(timeEvidenceAt ? { timeEvidenceAt } : {}),
      timeNote: decision.timeNote || "证据只支持日期或窗口归属，未反推未披露的具体时刻。",
      fact_status: decision.factStatus,
      time_status: decision.timeStatus,
      platforms: decision.platforms,
      region: decision.region || "全球",
      ...(decision.releaseType ? { releaseType: decision.releaseType } : {}),
      sources,
      verification: decision.verification,
      entry_flags: decision.entryFlags,
      tracking: decision.tracking,
      ...(decision.sharedFactFrame ? { sharedFactFrameDigest: projectionDigest(decision.sharedFactFrame) } : {}),
      imageSeed: decision.titleKey,
      image_status: "unavailable",
      imageNote: "正文先行发布；图片由异步媒体流程按一手页、官方视频和商店素材顺序自动核验补全。",
    };
  });
  if (!entries.length) throw new Error("an edition needs at least one included entry");
  const removeIds = new Set(editorial.removeUpcomingIds || []);
  const baseUpcoming = editorial.upcomingMode === "replace" ? [] : (latest.upcoming || []);
  const upcomingMap = new Map(baseUpcoming.filter((item) => !removeIds.has(item.id)).map((item) => [item.id, item]));
  const previousUpcoming = latest.upcoming || [];
  for (const item of editorial.upcoming || []) {
    const previous = previousUpcoming.find((candidate) => candidate.id === item.id || candidate.title?.title_key === item.titleKey);
    upcomingMap.set(item.id, upcomingEntry(item, previous));
  }
  const upcoming = [...upcomingMap.values()].filter((item) => inUpcomingWindow(item, window.id.slice(0, 10)))
    .sort((a, b) => upcomingTimestamp(window.id.slice(0, 10), a.date.split(/[／/、,]/)[0]) - upcomingTimestamp(window.id.slice(0, 10), b.date.split(/[／/、,]/)[0]));
  const leadEntryId = entryByEvent.get(editorial.leadEventKey) || entries[0].id;
  const leadEntry = entries.find((item) => item.id === leadEntryId) || entries[0];
  const archiveTitle = localizeRegisteredTitles(localizeHeadline(editorial.archiveTitle, { titleEn: leadEntry.title?.title_en, titleZhCn: leadEntry.title?.title_zh_cn }));
  const generatedAt = beijingNow(now);
  const limitedSources = input.packages.flatMap((item) => item.sources)
    .filter((source) => source.status === "limited")
    .map((source) => `${source.label}：${source.error}`);
  const included = editorial.decisions.filter((item) => item.decision === "include");
  const edition = {
    id: window.id,
    issueNumber: existingManifestItem?.issueNumber ?? Math.max(0, ...manifest.editions.map((item) => item.issueNumber)) + 1,
    date: window.id.slice(0, 10),
    period: window.period,
    plannedAt: window.plannedAt,
    generatedAt,
    windowStart: window.windowStart,
    windowEnd: window.windowEnd,
    timezone: "Asia/Shanghai",
    nextEditionAt: nextEditionAt(window),
    revised: Boolean(existingManifestItem),
    entries,
    upcoming,
    tracking: [],
    schemaVersion: 2,
    sourceReport: {
      checked: ["程序化来源注册表、事件账本与受限证据包", ...(editorial.checkedExtra || [])],
      limited: [...limitedSources, ...(editorial.limitedExtra || [])],
      checkedGroups: ["官方平台与厂商来源", "中英日综合媒体", "相邻期去重与持续事件账本", "截止前编辑包与最后15分钟补查"],
      trackingResults: included.filter((item) => item.tracking).map((item) => `${item.headline}：继续追踪。`),
      excludedMajorCandidates: editorial.decisions.filter((item) => item.decision !== "include").map((item) => `${item.eventKey}：${item.reason}`),
      limitedSources,
      auditStats: {
        discoveryQueries: 0,
        eventLedgerCandidates: input.packages.length,
        aLevelVerified: included.filter((item) => packetByKey.get(item.eventKey)?.tier === "A").length,
        bLevelIncluded: included.filter((item) => packetByKey.get(item.eventKey)?.tier === "B").length,
        cLevelExcluded: 0,
        trackingOpened: included.filter((item) => item.tracking).length,
        imageVerifiedEntries: 0,
        imageUnavailableEntries: entries.length,
      },
      note: editorial.editorialNote,
      editorialDecisionDigest: decisionDigest,
    },
    archiveTitle,
    leadEntryId,
  };
  const path = `archive/${edition.date.slice(0, 4)}/${edition.date.slice(5, 7)}/${edition.id}.json`;
  const manifestItem = {
    id: edition.id, issueNumber: edition.issueNumber, date: edition.date, period: edition.period,
    plannedAt: edition.plannedAt, generatedAt: edition.generatedAt, path, revised: Boolean(existingManifestItem),
    archiveTitle: edition.archiveTitle, leadEntryId: edition.leadEntryId,
  };
  return {
    status: existingManifestItem ? "revised" : "built",
    decisionDigest,
    edition,
    archivePath: path,
    entryIdsByEvent: Object.fromEntries(entryByEvent),
    manifest: {
      ...manifest,
      updatedAt: generatedAt,
      latest: edition.id,
      editions: existingManifestItem
        ? manifest.editions.map((item) => item.id === edition.id ? manifestItem : item)
        : [...manifest.editions, manifestItem],
    },
  };
}

function slug(value) {
  const normalized = String(value || "untitled").normalize("NFKD").toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 72);
  return normalized || "untitled";
}

function titleIdentity(value) {
  return String(value || "").normalize("NFKC").toLowerCase().replace(/[™®©]/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "");
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

function officialCalendarSource(candidate) {
  if (candidate?.kind !== "primary") return false;
  try {
    const host = new URL(candidate.url).hostname.toLowerCase();
    return host === "store.steampowered.com"
      || host === "www.nintendo.com" || host.endsWith(".nintendo.com")
      || host === "www.xbox.com" || host.endsWith(".xbox.com")
      || host === "blog.playstation.com";
  } catch {
    return false;
  }
}

function sourceLabel(candidate) {
  const id = String(candidate?.sourceId || "");
  if (id.startsWith("steam")) return "Steam";
  if (id.startsWith("nintendo")) return "Nintendo";
  if (id.startsWith("xbox")) return "Xbox";
  if (id.startsWith("playstation")) return "PlayStation";
  return "官方平台";
}

function normalizedPlatforms(platforms = []) {
  const unique = [...new Set(platforms.filter(Boolean))];
  if (unique.some((value) => value === "Nintendo Switch 2")) {
    return unique.filter((value) => value !== "Nintendo Switch");
  }
  return unique;
}

function degradedUpcoming(input) {
  if (input?.window?.period !== "daily") return [];
  const discovery = input.upcomingDiscovery;
  if (!discovery?.window || !Array.isArray(discovery.candidates)) return [];
  const baselineIds = new Set((input.upcomingBaseline?.items || []).flatMap((item) => [
    item?.title?.title_en, item?.title?.title_zh_cn, item?.title?.title_key,
  ]).filter(Boolean).map(titleIdentity));
  const hints = new Map((input.titleHints || []).flatMap((hint) => [hint?.titleEn, hint?.subjectKey]
    .filter(Boolean).map((value) => [titleIdentity(value), hint])));
  const groups = new Map();
  for (const candidate of discovery.candidates) {
    const key = titleIdentity(candidate?.title);
    if (!key) continue;
    const list = groups.get(key) || [];
    list.push(candidate);
    groups.set(key, list);
  }

  const output = [];
  for (const [identity, group] of groups) {
    if (baselineIds.has(identity)) continue;
    const dates = new Set(group.map((item) => item?.date).filter(Boolean));
    if (dates.size !== 1) continue;
    const date = [...dates][0];
    if (date < discovery.window.startInclusive || date > discovery.window.endInclusive) continue;
    const primaries = group.filter(officialCalendarSource);
    if (!primaries.length) continue;
    const confidence = group.some((item) => item?.knownTitle || item?.crossSource)
      || new Set(primaries.map((item) => item.family || item.sourceId)).size > 1;
    if (!confidence) continue;
    const selected = primaries.sort((a, b) => (b.priority || 0) - (a.priority || 0))[0];
    const platforms = normalizedPlatforms(primaries.flatMap((item) => item.platforms || []));
    const hint = hints.get(identity);
    output.push({
      id: `upcoming-${slug(selected.title)}`,
      date: date.slice(5).replace("-", "."),
      titleKey: slug(selected.title),
      titleZhCn: hint?.titleZhCn || null,
      titleEn: selected.title,
      titleZhStatus: hint?.suggestedStatus || "unavailable",
      platforms,
      region: selected.region === "US" ? "美国" : String(selected.region || "官方商店"),
      releaseType: "正式发售",
      source: { label: sourceLabel(selected), url: selected.url, kind: "primary" },
      note: "降级发布仅采用自动发现中日期唯一、位于完整15天窗口内且来自官方平台的一手记录；媒体线索、日期冲突和低置信单源候选不会自动写入。",
    });
  }
  return output.sort((a, b) => a.date.localeCompare(b.date) || a.titleEn.localeCompare(b.titleEn)).slice(0, 12);
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
  const upcoming = degradedUpcoming(input);
  return {
    contractVersion: 2,
    packetBlobSha,
    editionId: input.window.id,
    archiveTitle: Array.from(`${prefix}${leadName}`).slice(0, 40).join(""),
    leadEventKey: included[0].eventKey,
    decisions,
    upcomingMode: upcomingMode(input.window.period),
    removeUpcomingIds: [], upcoming,
    checkedExtra: ["无AI缺期兜底：仅使用已经打开的证据页", ...(upcoming.length ? ["未来15天日历：仅采用自动发现中的无冲突官方平台一手记录"] : [])],
    limitedExtra: ["本期为自动事实清单，未执行中文编辑、传闻判断或最后15分钟人工式补查。", ...(input.window.period === "daily" ? ["日历降级刷新不会采用媒体发现线索、日期冲突或低置信单源候选；其余项目等待正常编辑核验。"] : [])],
    editorialNote: "正常ChatGPT定时任务未在SLA前完成；系统只发布高置信事实以避免整期缺失，等待后续编辑修订。",
  };
}

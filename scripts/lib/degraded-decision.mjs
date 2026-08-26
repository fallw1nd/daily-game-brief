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

function nullableDecision(item, reason) {
  return {
    eventKey: item.eventKey, decision: "exclude", section: null, titleKey: null, titleZhCn: null,
    titleEn: null, titleZhStatus: null, headline: null, summary: null, factStatus: null,
    timeStatus: null, entryFlags: [], tracking: false, verification: "", reason,
    beijingTime: null, timeNote: null, platforms: [], region: null, releaseType: null,
    sourceIndexes: [], additionalSources: [],
  };
}

export function buildDegradedDecision(packet) {
  const input = packet.editorialInput;
  const decisions = input.packages.map((item) => {
    const opened = item.sources.filter((source) => source.status === "opened" && source.kind !== "discovery");
    const primary = opened.filter((source) => source.kind === "primary");
    const independent = new Set(opened.map((source) => source.independenceKey || new URL(source.url).hostname));
    const eligible = item.tier === "A" && item.timeRelation === "window" && (primary.length > 0 || independent.size >= 2);
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
    };
  });
  const included = decisions.filter((item) => item.decision === "include");
  if (!included.length) throw new Error("No high-confidence A-level event is eligible for degraded publication");
  const prefix = input.window.period === "am" ? "早报｜" : "晚报｜";
  const leadName = included[0].titleEn || "自动事实清单";
  return {
    editionId: input.window.id,
    archiveTitle: Array.from(`${prefix}${leadName}`).slice(0, 40).join(""),
    leadEventKey: included[0].eventKey,
    decisions,
    upcomingMode: "inherit_and_patch",
    removeUpcomingIds: [], upcoming: [],
    checkedExtra: ["无AI缺期兜底：仅使用已经打开的证据页"],
    limitedExtra: ["本期为自动事实清单，未执行中文编辑、传闻判断或最后15分钟人工式补查。"],
    editorialNote: "正常ChatGPT定时任务未在SLA前完成；系统只发布高置信事实以避免整期缺失，等待后续编辑修订。",
  };
}

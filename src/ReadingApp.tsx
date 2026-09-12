import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, ArrowUpRight, IconContext, ImageSquare, CaretDown, Check, MagnifyingGlass, Moon, NewspaperClipping, SlidersHorizontal, Sun, WarningCircle } from "@phosphor-icons/react";
import { loadArchivedEdition, loadBriefManifest, loadEnglishLocaleIndex, loadEnglishOverlay, loadLatestEdition, loadSearchIndex } from "./data/briefLoader";
import { loadEnglishSearchIndex } from "./data/englishLoader";
import { searchArchiveEntries } from "./lib/brief";
import { projectEnglishEdition } from "./lib/english-render";
import { validateEnglishOverlayForRender } from "./lib/locale";
import { loadReadingCalendar, type ReadingCalendar } from "./lib/reading-calendar";
import { readingHref, readingLead, readingWindow } from "./lib/reading";
import type { BriefEdition, BriefEntry, BriefManifest, BriefSearchIndex, FactStatus, ImageAsset, SectionKey } from "./types";
import "./reading.css";

type Theme = "light" | "dark";
type Accent = "orange" | "cobalt" | "jade" | "violet" | "rose";
const accents: Accent[] = ["orange", "cobalt", "jade", "violet", "rose"];
const sectionOrder: SectionKey[] = ["focus", "releases", "reviews", "news", "industry", "features", "rumors", "observations", "tracking", "upcoming", "search-report"];
const sectionNames: Record<SectionKey, [string, string]> = {
  focus: ["重点新闻", "In focus"], releases: ["发售与上线", "Releases"], reviews: ["新作评分", "Reviews"],
  news: ["游戏动态", "Game news"], industry: ["产业观察", "Industry"], features: ["深读与专访", "Features"],
  rumors: ["传闻与爆料", "Rumors"], observations: ["延伸观察", "Further reading"], tracking: ["持续跟踪", "Tracking"],
  upcoming: ["即将发售", "Upcoming"], "search-report": ["检索记录", "Source report"],
};
const statusNames: Record<FactStatus, [string, string]> = {
  official: ["官方消息", "Official"], multi_source_verified: ["多源核实", "Verified by multiple sources"],
  media_report: ["媒体报道", "Media report"], media_relay_official: ["媒体转述官方", "Reported official statement"], unconfirmed: ["未经证实", "Unconfirmed"],
};
const titleNames = { official_simplified: "官方简中", official_traditional: "官方繁中", common_translation: "常用译名", unavailable: "暂无官方中文名" };
const subject = (entry: BriefEntry) => entry.title.title_zh_cn || entry.title.title_en;
const label = (pair: [string, string], english: boolean) => pair[english ? 1 : 0];
const mediaUrl = (url: string) => /^https?:/.test(url) ? url : import.meta.env.BASE_URL + url.replace(/^\/+/, "");

function storedTheme(): Theme {
  try { const value = localStorage.getItem("brief-theme"); if (value === "light" || value === "dark") return value; } catch { /* Storage is optional. */ }
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}
function storedAccent(): Accent {
  try { const value = localStorage.getItem("brief-accent"); if (accents.includes(value as Accent)) return value as Accent; } catch { /* Storage is optional. */ }
  return "orange";
}

function Photo({ asset, lead = false, cover = false, english }: { asset?: ImageAsset; lead?: boolean; cover?: boolean; english: boolean }) {
  const [failedUrl, setFailedUrl] = useState("");
  const [loadedUrl, setLoadedUrl] = useState("");
  if (!asset || asset.placeholder) return null;
  if (failedUrl === asset.url && cover) return <figure className="r-photo r-photo--cover r-cover-unavailable"><ImageSquare /><span role="status">{english ? "Cover unavailable" : "封面暂不可用"}</span></figure>;
  if (failedUrl === asset.url) return <span className="r-photo-error" role="status">{english ? "Image temporarily unavailable" : "图片暂时无法加载"}</span>;
  const aspect = cover ? asset.aspect ?? "portrait" : "landscape";
  const [width, height] = !cover ? [800, 450] : aspect === "square" ? [160, 160] : aspect === "portrait" ? [114, 160] : [160, 90];
  return <figure className={`r-photo${cover ? " r-photo--cover" : ""}`}>
    <span className="r-photo-frame" style={{ "--r-photo-aspect": `${width} / ${height}` } as CSSProperties}>
      <img key={asset.url} src={mediaUrl(asset.url)} alt={asset.alt} width={width} height={height} decoding="async"
        data-loaded={loadedUrl === asset.url} loading={lead ? "eager" : "lazy"} fetchPriority={lead ? "high" : "auto"}
        onLoad={() => setLoadedUrl(asset.url)} onError={() => setFailedUrl(asset.url)} />
    </span>
    {!cover && <figcaption><span>{asset.credit}</span><a href={asset.sourceUrl} target="_blank" rel="noreferrer">{english ? "Image source" : "图源"}<ArrowUpRight aria-hidden="true" /></a></figcaption>}
  </figure>;
}

function Signals({ entry, english }: { entry: BriefEntry; english: boolean }) {
  const warning = entry.fact_status === "unconfirmed" || entry.time_status !== "verified" || entry.section === "rumors" || entry.entry_flags.includes("rumor");
  return <div className="r-signals">
    <span className={warning ? "r-warning" : "r-status"}>{warning && <WarningCircle aria-hidden="true" />}{label(statusNames[entry.fact_status], english)}</span>
    {entry.time_status !== "verified" && <span className="r-warning">{entry.time_status === "date_only" ? (english ? "Date only" : "仅核日期") : (english ? "Time unverified" : "时间待核")}</span>}
    {(entry.section === "rumors" || entry.entry_flags.includes("rumor")) && entry.fact_status !== "unconfirmed" && <span className="r-warning">{english ? "Rumor" : "传闻"}</span>}
    {entry.tracking && <span className="r-warning">{english ? "Tracking" : "持续跟踪"}</span>}
    <time>{entry.beijingTime}</time>
  </div>;
}

function Evidence({ entry, english, lead = false }: { entry: BriefEntry; english: boolean; lead?: boolean }) {
  return <div className="r-evidence">
    <div className="r-source-line">
      {entry.sources[0] && <a href={entry.sources[0].url} target="_blank" rel="noreferrer">{entry.sources[0].label}<ArrowUpRight aria-hidden="true" /></a>}
      {entry.platforms.length > 0 && <span>{entry.platforms.join(" / ")}</span>}
      {entry.region && <span>{entry.region}</span>}
    </div>
    <details><summary>{english ? "Sources & verification" : "来源与核验"}<CaretDown aria-hidden="true" /></summary>
      <div className="r-evidence-panel">
        {lead && <p><strong>{english ? "Full headline" : "完整标题"}</strong>{entry.headline}</p>}
        <p>{entry.verification}</p><p>{entry.timeNote}</p>
        {!english && <p>{subject(entry)} · {titleNames[entry.title.title_zh_status]}{entry.title.title_zh_cn ? ` · ${entry.title.title_en}` : ""}</p>}
        <ul>{entry.sources.map((source, index) => <li key={`${source.url}-${index}`}><a href={source.url} target="_blank" rel="noreferrer">{source.label}<ArrowUpRight aria-hidden="true" /></a><span>{english ? source.kind : ({ primary: "一手", secondary: "补充", discovery: "线索" }[source.kind])}</span></li>)}</ul>
        {!entry.images?.some((asset) => !asset.placeholder) && <p>{entry.imageNote || (english ? "No verified image available." : "暂无可核实配图。")}</p>}
      </div>
    </details>
  </div>;
}

function Story({ entry, english }: { entry: BriefEntry; english: boolean }) {
  const hasPhoto = entry.images?.some((asset) => !asset.placeholder);
  return <article className={`r-story${hasPhoto ? " r-story--with-photo" : ""}`} id={entry.id}>
    <div className="r-story-copy">
      <Signals entry={entry} english={english} />
      <h3>{entry.headline}</h3><p className="r-summary">{entry.summary}</p>
      <Evidence entry={entry} english={english} />
    </div>
    {hasPhoto && <Photo asset={entry.images?.find((asset) => !asset.placeholder)} english={english} />}
  </article>;
}

export interface ReadingProps {
  english?: boolean;
  initialEdition?: BriefEdition;
  initialManifest?: BriefManifest;
  initialSearchIndex?: BriefSearchIndex;
}

export default function ReadingApp({ english = false, initialEdition, initialManifest, initialSearchIndex }: ReadingProps) {
  const [edition, setEdition] = useState(initialEdition);
  const [manifest, setManifest] = useState(initialManifest);
  const [searchIndex, setSearchIndex] = useState(initialSearchIndex);
  const [englishTitles, setEnglishTitles] = useState<Record<string, string>>({});
  const [calendar, setCalendar] = useState<ReadingCalendar>();
  const [calendarState, setCalendarState] = useState<"loading" | "ready" | "error">("loading");
  const [calendarRetry, setCalendarRetry] = useState(0);
  const upcoming = edition?.upcoming.length ? edition.upcoming : calendar?.items ?? [];
  const [loadError, setLoadError] = useState("");
  const [searchError, setSearchError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [theme, setTheme] = useState<Theme>(storedTheme);
  const [accent, setAccent] = useState<Accent>(storedAccent);
  const [query, setQuery] = useState("");
  const [archiveLimit, setArchiveLimit] = useState(6);
  const [resultLimit, setResultLimit] = useState(12);
  const settingsRef = useRef<HTMLDetailsElement>(null);
  const t = (zh: string, en: string) => english ? en : zh;

  useEffect(() => {
    document.documentElement.lang = english ? "en" : "zh-CN";
    document.documentElement.dataset.theme = theme;
    document.body.classList.add("reading-page");
    try { localStorage.setItem("brief-theme", theme); localStorage.setItem("brief-accent", accent); } catch { /* Optional persistence. */ }
    return () => document.body.classList.remove("reading-page");
  }, [theme, accent, english]);

  useEffect(() => {
    const close = (event: Event) => {
      if (event instanceof KeyboardEvent && event.key === "Escape" && settingsRef.current?.open) {
        settingsRef.current.open = false;
        settingsRef.current.querySelector("summary")?.focus();
      } else if (event.type === "pointerdown" && event.target instanceof Node && !settingsRef.current?.contains(event.target) && settingsRef.current) settingsRef.current.open = false;
    };
    document.addEventListener("keydown", close); document.addEventListener("pointerdown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("pointerdown", close); };
  }, []);

  useEffect(() => {
    if (initialEdition) return;
    const controller = new AbortController();
    setLoadError("");
    void (async () => {
      try {
        const [loadedManifest, latest] = await Promise.all([loadBriefManifest(controller.signal), loadLatestEdition(controller.signal)]);
        const requestedId = new URLSearchParams(window.location.search).get("edition");
        const requested = loadedManifest.editions.find((item) => item.id === requestedId);
        if (requestedId && !requested) throw new Error(t("找不到这一期归档。", "This edition could not be found."));
        if (!requested && latest.source === "fallback") throw new Error(t("暂时无法读取最新一期。", "The latest edition could not be loaded."));
        let canonical = requested ? await loadArchivedEdition(requested, controller.signal) : latest.edition;
        if (english) {
          const locales = await loadEnglishLocaleIndex(controller.signal);
          const availability = locales.editions.find((item) => item.editionId === canonical.id);
          if (availability?.status !== "available") throw new Error("The English edition is currently unavailable. You can read the Chinese edition instead.");
          const overlay = await loadEnglishOverlay(canonical.id, controller.signal);
          const validation = await validateEnglishOverlayForRender(canonical, overlay);
          if (validation.status !== "available") throw new Error(validation.message);
          const projected = projectEnglishEdition(canonical, overlay);
          if (!projected) throw new Error("The English edition could not be displayed safely.");
          canonical = projected;
          if (!controller.signal.aborted) setEnglishTitles(Object.fromEntries(locales.editions.flatMap((item) => item.status === "available" ? [[item.editionId, item.archiveTitle]] : [])));
        }
        if (!controller.signal.aborted) { setManifest(loadedManifest); setEdition(canonical); }
      } catch (error) {
        if (!controller.signal.aborted) setLoadError(error instanceof Error ? error.message : t("简报暂时无法读取。", "The edition could not be loaded."));
      }
    })();
    return () => controller.abort();
  }, [english, initialEdition, retry]);

  useEffect(() => {
    if (!edition || !manifest) return;
    setCalendar(undefined);
    if (edition.upcoming.length) { setCalendarState("ready"); return; }
    const controller = new AbortController();
    setCalendarState("loading");
    void loadReadingCalendar(edition, manifest, english, controller.signal).then((value) => {
      if (!controller.signal.aborted) { setCalendar(value); setCalendarState("ready"); }
    }).catch(() => { if (!controller.signal.aborted) setCalendarState("error"); });
    return () => controller.abort();
  }, [edition, manifest, english, calendarRetry]);

  useEffect(() => {
    if (initialSearchIndex) return;
    const controller = new AbortController();
    setSearchError(false);
    const load = english ? loadEnglishSearchIndex : loadSearchIndex;
    void load(controller.signal).then((index) => { if (!controller.signal.aborted) setSearchIndex(index); }).catch(() => { if (!controller.signal.aborted) setSearchError(true); });
    return () => controller.abort();
  }, [english, initialSearchIndex, retry]);

  useEffect(() => {
    if (!edition) return;
    document.title = `${edition.archiveTitle || t("游戏日报", "Daily Game Brief")} · ${t("游戏圈动态", "Daily Game Brief")}`;
    let id = "";
    try { id = decodeURIComponent(window.location.hash.slice(1)); } catch { return; }
    if (id) requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: "start" }));
  }, [edition, english]);

  const lead = edition ? readingLead(edition) : undefined;
  const otherStories = edition?.entries.filter((entry) => entry.id !== lead?.id) ?? [];
  const sections = sectionOrder.map((key) => ({ key, entries: otherStories.filter((entry) => entry.section === key && !(entry.showcaseBrief && edition?.showcases?.some(showcase => showcase.entryIds.includes(entry.id)))) })).filter((section) => section.entries.length > 0);
  const results = useMemo(() => searchArchiveEntries(searchIndex?.entries ?? [], query), [query, searchIndex]);
  const archives = [...(manifest?.editions ?? [])].reverse().filter((item) => !english || englishTitles[item.id]);
  const position = archives.findIndex((item) => item.id === edition?.id);
  const previous = position >= 0 ? archives[position + 1] : undefined;
  const next = position > 0 ? archives[position - 1] : undefined;
  const currentId = edition?.id || new URLSearchParams(window.location.search).get("edition") || undefined;
  const switchHref = readingHref(currentId, window.location.hash.slice(1) || undefined, !english);
  const archiveTitle = (id: string, title?: string) => english ? englishTitles[id] : title;

  return <IconContext.Provider value={{ weight: "regular", size: 20, "aria-hidden": true, focusable: false }}><div className="reading-app" data-theme={theme} data-accent={accent}>
    <a className="r-skip" href="#content">{t("跳到新闻正文", "Skip to news")}</a>
    <header className="r-header"><div className="r-header-inner">
      <a className="r-brand" href={readingHref(undefined, undefined, english)}><NewspaperClipping aria-hidden="true" /><span>{t("游戏圈动态", "Daily Game Brief")}</span></a>
      <nav aria-label={t("主导航", "Main navigation")}><a href="#content">{t("内容", "Content")}</a><a href="#upcoming">{t("日历", "Calendar")}</a><a href="#archive">{t("归档", "Archive")}</a></nav>
      <div className="r-controls">
        <a href={switchHref} lang={english ? "zh-CN" : "en"} aria-label={t("Switch to English", "切换到中文")}>{english ? "中文" : "EN"}</a>
        <button onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label={theme === "light" ? t("切换夜间模式", "Use dark theme") : t("切换日间模式", "Use light theme")} title={t("切换明暗主题", "Toggle theme")}>{theme === "light" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}</button>
        <details ref={settingsRef} className="r-settings"><summary aria-label={t("阅读设置", "Reading settings")} title={t("阅读设置", "Reading settings")}><SlidersHorizontal aria-hidden="true" /></summary><fieldset><legend>{t("强调色", "Accent color")}</legend>{accents.map((value, index) => <label key={value} data-color={value}><input type="radio" name="reading-accent" checked={accent === value} onChange={() => setAccent(value)} /><span className="r-swatch" />{english ? ["Orange", "Cobalt", "Jade", "Violet", "Rose"][index] : ["橙", "钴蓝", "松绿", "紫", "玫红"][index]}{accent === value && <Check aria-hidden="true" />}</label>)}</fieldset></details>
      </div>
    </div></header>

    {!edition ? <main className="r-loading r-container" aria-live="polite">
      {loadError ? <><h1>{t("暂时无法打开这份简报", "This edition is unavailable")}</h1><p>{loadError}</p><div><button className="r-button" onClick={() => setRetry((value) => value + 1)}>{t("重试", "Try again")}</button><a href={english ? readingHref(currentId) : readingHref()}>{t("返回最新一期", "Read in Chinese")}<ArrowRight aria-hidden="true" /></a></div></> : <><p>{t("正在读取简报…", "Loading the edition…")}</p><div className="r-skeleton" /><div className="r-skeleton r-skeleton--short" /></>}
    </main> : <main className="r-container" id="top">
      <div className="r-edition-line"><span><time>{edition.date.replaceAll("-", ".")}</time><span>NO.{String(edition.issueNumber).padStart(3, "0")}</span><span>{t("北京时间", "Beijing time")}</span></span><a href="#edition-note" onClick={() => { const note = document.querySelector<HTMLDetailsElement>("#edition-note"); if (note) note.open = true; }}>{t("本期说明", "About this edition")}<ArrowDown aria-hidden="true" /></a></div>
      <section className="r-lead" id="content" aria-labelledby="r-edition-title">
        {lead ? <article id={lead.id} className={`r-lead-grid${lead.images?.some((asset) => !asset.placeholder) ? "" : " r-lead-grid--text"}`}>
          <div className="r-lead-copy"><div className="r-eyebrow">{t("本期头条", "The lead")}<span>{label(sectionNames[lead.section], english)}</span></div>
            <h1 id="r-edition-title">{edition.archiveTitle || lead.headline}</h1><p className="r-lead-summary">{lead.summary}</p>
            <Signals entry={lead} english={english} /><Evidence entry={lead} english={english} lead />
          </div><Photo asset={lead.images?.find((asset) => !asset.placeholder)} lead english={english} />
        </article> : <><h1 id="r-edition-title">{edition.archiveTitle || t("游戏日报", "Daily Game Brief")}</h1><p>{t("本期暂无新闻条目。", "There are no stories in this edition.")}</p></>}
      </section>

      {(sections.length > 0 || Boolean(edition.showcases?.length)) && <nav className="r-section-nav" aria-label={t("本期栏目", "Edition sections")}>{sections.map((section) => <a key={section.key} href={`#${section.key === "focus" ? "focus-news" : section.key}`}>{label(sectionNames[section.key], english)}</a>)}{edition.showcases?.map(showcase => <a key={showcase.id} href={`#${showcase.id}`}>{english ? showcase.titleEn : showcase.title}</a>)}</nav>}
      {otherStories.length > 0 && <div className="r-news-layout"><div className="r-news-flow">
        {sections.map((section) => <section className="r-department" id={section.key === "focus" ? "focus-news" : section.key} key={section.key} aria-labelledby={`r-section-${section.key}`}>
          <header><h2 id={`r-section-${section.key}`}>{label(sectionNames[section.key], english)}</h2><span>{section.entries.length.toString().padStart(2, "0")}</span></header>
          {section.key === "observations" && <p className="r-department-note">{t("补遗与跨窗口观察，不计入本轮新增。", "Supplements and cross-window observations, separate from new reports.")}</p>}
          {section.entries.map((entry) => <Story key={entry.id} entry={entry} english={english} />)}
        </section>)}
      </div><aside className="r-overview"><div className="r-overview-sticky"><h2>{t("本期速览", "In this edition")}</h2><p>{t(`${edition.entries.length} 条新闻`, `${edition.entries.length} stories`)}</p><ol>{otherStories.slice(0, 5).map((entry) => <li key={entry.id}><a href={`#${entry.id}`}><small>{label(sectionNames[entry.section], english)}</small><span>{entry.headline}</span><ArrowDown aria-hidden="true" /></a></li>)}</ol><a className="r-overview-archive" href="#archive"><MagnifyingGlass aria-hidden="true" />{t("查找往期新闻", "Search past stories")}</a></div></aside></div>}

      {edition.showcases?.map(showcase => <section className="r-department r-showcase" id={showcase.id} key={showcase.id} aria-labelledby={`heading-${showcase.id}`}>
        <header><h2 id={`heading-${showcase.id}`}>{english ? showcase.titleEn : showcase.title}</h2><span>{showcase.covered}</span></header>
        <p className="r-department-note">{showcase.status === "complete" ? t("本场实质公告已全部收录；重复展示已合并。", "All substantive announcements covered; repeated presentations merged.") : t("本场内容尚在补齐，地区版本与未核验公告仍在核对。", "Coverage is still being completed, including regional broadcasts and unverified announcements.")}</p>
        {showcase.entryIds.map(id => edition.entries.find(entry => entry.id === id)).filter((entry): entry is BriefEntry => Boolean(entry)).map(entry => entry.showcaseBrief && entry.id !== lead?.id && edition.showcases?.find(group => group.entryIds.includes(entry.id))?.id === showcase.id ? <Story key={entry.id} entry={entry} english={english} /> : <p className="r-showcase-link" key={entry.id}><a href={`#${entry.id}`}>{entry.headline}<ArrowUpRight aria-hidden="true" /></a></p>)}
      </section>)}

      {<section className="r-calendar" id="upcoming" aria-labelledby="r-calendar-title"><header className="r-section-heading"><div><span className="r-eyebrow">{t("发售日历", "Release calendar")}</span><h2 id="r-calendar-title">{t("未来15天发售", "The next 15 days")}</h2></div><span>{t(`${upcoming.length} 款作品`, `${upcoming.length} games`)}</span></header>
        <p className="r-calendar-note">{t(`以本期 ${edition.date} 为基准，展示次日起15天内的发售计划。`, `Scheduled releases in the 15 days after this edition, ${edition.date}.`)}</p>
        {calendar && upcoming.length > 0 && <p className="r-calendar-note r-warning">{t(`沿用 ${calendar.sourceDate} 收录的计划，本期未重新核验；日期如有调整，请以来源公告为准。`, `Plans recorded on ${calendar.sourceDate}, not reverified for this edition. Check the linked sources for schedule changes.`)} <a href={readingHref(calendar.sourceId, "upcoming", english)}>{t("查看原期日历", "View source edition")}<ArrowRight /></a></p>}
        {!upcoming.length && <div className="r-calendar-empty" role="status">{calendarState === "loading" ? t("正在读取发售日历…", "Loading release calendar…") : calendarState === "error" ? <>{t("发售日历暂时无法读取。", "The release calendar could not be loaded.")} <button className="r-button" onClick={() => setCalendarRetry((value) => value + 1)}>{t("重试", "Try again")}</button></> : t("这15天内暂无已收录的发售计划，不代表没有游戏发售。", "No release plans recorded for this window. This does not mean no games are releasing.")}</div>}
        <div className="r-calendar-list">{upcoming.map((item) => <article key={item.id} className="r-calendar-item">
        {item.cover && !item.cover.placeholder ? <Photo asset={item.cover} cover english={english} /> : <div className="r-cover-unavailable"><ImageSquare /><span>{t("暂无核实封面", "No verified cover")}</span></div>}<div><time className="r-calendar-date" dateTime={item.date.length === 10 ? item.date : undefined} title={item.date}>{item.date.length === 10 ? item.date.slice(5).replace("-", ".") : item.date}</time><h3>{item.title.title_zh_cn || item.title.title_en}</h3><p>{[item.platforms.join(" / "), item.region, item.releaseType].filter(Boolean).join(" · ")}</p>{item.note && !english && <p>{item.note}</p>}<a href={item.source.url} target="_blank" rel="noreferrer">{item.source.label}<ArrowUpRight aria-hidden="true" /></a>{!item.cover && <small>{english ? "No verified cover available" : item.coverNote || "暂无可核实封面"}</small>}</div>
      </article>)}</div></section>}

      <nav className="r-pager" aria-label={t("期次导航", "Edition navigation")}>
        {previous ? <a href={readingHref(previous.id, undefined, english)}><small>{t("上一期", "Previous edition")} · {previous.date}</small><span><ArrowLeft />{archiveTitle(previous.id, previous.archiveTitle)}</span></a> : <span className="r-pager-boundary">{t("已是最早一期", "First edition")}</span>}
        {next ? <a href={readingHref(next.id, undefined, english)}><small>{t("下一期", "Next edition")} · {next.date}</small><span>{archiveTitle(next.id, next.archiveTitle)}<ArrowRight aria-hidden="true" /></span></a> : <span className="r-pager-boundary">{t("已是最新一期", "Latest edition")}<small>{t("下期计划：", "Next scheduled: ")}{edition.nextEditionAt}</small></span>}
      </nav>

      <section id="archive" className="r-archive" aria-labelledby="r-archive-title"><header className="r-section-heading"><div><span className="r-eyebrow">{t("继续探索", "Explore the archive")}</span><h2 id="r-archive-title">{t("往期简报", "Past editions")}</h2></div><span>{t(`${archives.length} 期归档`, `${archives.length} editions`)}</span></header>
        <label className="r-search"><MagnifyingGlass aria-hidden="true" /><span className="r-sr-only">{t("搜索所有期次的游戏、平台或事件", "Search all editions by game, platform or event")}</span><input type="search" value={query} placeholder={t("搜索游戏、平台或事件", "Search games, platforms or events")} onChange={(event) => { setQuery(event.target.value); setResultLimit(12); }} /></label>
        {query.trim() ? <div className="r-search-results"><p className="r-result-count" role="status">{searchError ? t("搜索暂时不可用。", "Search is temporarily unavailable.") : !searchIndex ? t("正在读取搜索索引…", "Loading search…") : t(`找到 ${results.length} 条新闻`, `${results.length} matching stories`)}</p>{searchError && <button className="r-button" onClick={() => setRetry((value) => value + 1)}>{t("重新加载", "Retry")}</button>}{results.slice(0, resultLimit).map((item) => <a key={`${item.editionId}-${item.entryId}`} className="r-search-result" href={readingHref(item.editionId, item.entryId, english)}><small>{item.date} · NO.{String(item.issueNumber).padStart(3, "0")} · {label(statusNames[item.factStatus], english)}{item.tracking ? t(" · 持续跟踪", " · Tracking") : ""}</small><h3>{item.headline}</h3><p>{item.summary}</p><ArrowRight aria-hidden="true" /></a>)}{searchIndex && !results.length && <p>{t("没有匹配的新闻，试试更短的关键词。", "No matching stories. Try a shorter keyword.")}</p>}{results.length > resultLimit && <button className="r-button" onClick={() => setResultLimit((value) => value + 12)}>{t("显示更多结果", "Show more results")}</button>}</div> : <><div className="r-archive-list">{archives.slice(0, archiveLimit).map((item) => <a href={readingHref(item.id, undefined, english)} className={item.id === edition.id ? "is-current" : ""} key={item.id} aria-current={item.id === edition.id ? "page" : undefined}><span className="r-archive-meta"><time>{item.date}</time><span>NO.{String(item.issueNumber).padStart(3, "0")}</span>{item.id === edition.id && <small>{t("当前阅读", "Reading")}</small>}</span><strong>{archiveTitle(item.id, item.archiveTitle) || t("本期简报", "Edition")}</strong><ArrowRight aria-hidden="true" /></a>)}</div>{archives.length > archiveLimit && <button className="r-button" onClick={() => setArchiveLimit((value) => value + 12)}>{t("浏览更多期次", "More editions")}<ArrowDown aria-hidden="true" /></button>}</>}
      </section>

      <details className="r-edition-note" id="edition-note"><summary>{t("本期说明与检索记录", "Edition details & source report")}<CaretDown aria-hidden="true" /></summary><div><dl><div><dt>{t("信息窗口", "Evidence window")}</dt><dd>{readingWindow(edition)}</dd></div><div><dt>{t("计划发布", "Scheduled release")}</dt><dd>{edition.plannedAt}</dd></div><div><dt>{t("生成时间", "Generated")}</dt><dd>{edition.generatedAt}</dd></div></dl>{edition.sourceReport && <><h3>{t("已检查来源", "Sources checked")}</h3><p>{edition.sourceReport.checked.join(" / ")}</p><h3>{t("访问受限", "Limited access")}</h3><p>{edition.sourceReport.limited.join(" / ") || t("无", "None")}</p><p>{edition.sourceReport.note}</p></>}</div></details>
    </main>}
    <footer className="r-footer r-container"><div><strong>{t("游戏圈动态", "Daily Game Brief")}</strong><p>{t("编辑与维护 · Fallw1nd-津秋", "Edited and maintained by Fallw1nd-津秋")}</p></div><div><a href="https://space.bilibili.com/11108421" target="_blank" rel="noreferrer">B站<ArrowUpRight aria-hidden="true" /></a><a href="https://xiaoheihe.cn/app/user/profile/16936553" target="_blank" rel="noreferrer">{t("小黑盒", "HeyBox")}<ArrowUpRight aria-hidden="true" /></a><span>{t("微信公众号：芳墨集", "WeChat: 芳墨集")}</span><a href="#top">{t("返回顶部", "Back to top")}<ArrowUp /></a></div></footer>
  </div></IconContext.Provider>;
}

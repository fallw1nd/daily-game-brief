import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import {
  ArrowRight,
  ArrowUpRight,
  ChatsCircle,
  CheckCircle,
  GameController,
  List,
  MagnifyingGlass,
  Moon,
  Palette,
  PlayCircle,
  Sun,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { edition as fallbackEdition, sourceReport as fallbackSourceReport } from "./data/brief";
import {
  loadArchivedEdition,
  loadBriefManifest,
  loadLatestEdition,
  loadSearchIndex,
} from "./data/briefLoader";
import {
  entriesForSection,
  searchArchiveEntries,
} from "./lib/brief";
import type {
  BriefEdition,
  BriefEntry,
  BriefManifest,
  BriefManifestItem,
  BriefSearchIndex,
  FactStatus,
  ImageAsset,
  SectionKey,
  SourceLink,
  UpcomingEntry,
} from "./types";

gsap.registerPlugin(useGSAP, ScrollTrigger);

type Theme = "light" | "dark";
type Accent = "orange" | "cobalt" | "jade" | "violet" | "rose";

type AppProps = {
  initialEdition?: BriefEdition;
  initialManifest?: BriefManifest | null;
  initialSearchIndex?: BriefSearchIndex | null;
  initialTheme?: Theme;
  initialAccent?: Accent;
  initialQuery?: string;
};

const accentOptions: Array<{ id: Accent; label: string }> = [
  { id: "orange", label: "熔岩橙" },
  { id: "cobalt", label: "钴蓝" },
  { id: "jade", label: "松石绿" },
  { id: "violet", label: "暮紫" },
  { id: "rose", label: "\u6a31\u7c89" },
];

const statusLabels: Record<FactStatus, string> = {
  official: "官方",
  multi_source_verified: "多源核实",
  media_report: "媒体报道",
  media_relay_official: "媒体转述官方",
  unconfirmed: "未经证实",
};

const titleStatusLabels = {
  official_simplified: "官方简中",
  official_traditional: "官方繁中",
  common_translation: "常用译名",
  unavailable: "暂无官方中文名",
};

const sourceKindLabels = { primary: "一手", secondary: "补充", discovery: "线索" };

const periodLabels = {
  am: { edition: "早报", english: "MORNING", nextTime: "今日 17:00", nextEdition: "游戏晚报" },
  pm: { edition: "晚报", english: "EVENING", nextTime: "明日 10:10", nextEdition: "游戏早报" },
} as const;

const storySectionDefinitions: Array<{
  id: string;
  label: string;
  title: string;
  section: SectionKey;
  note?: string;
}> = [
  { id: "releases", label: "发售", title: "今日发售与新上线", section: "releases" },
  { id: "reviews", label: "评分", title: "新游戏评分", section: "reviews" },
  { id: "news", label: "新闻", title: "热点新闻", section: "news" },
  { id: "industry", label: "产业", title: "公司与产业动向", section: "industry" },
  { id: "features", label: "深读", title: "深度文章与专访", section: "features" },
  { id: "rumors", label: "传闻", title: "泄漏、爆料与传闻", section: "rumors" },
  {
    id: "observations",
    label: "观察",
    title: "延伸观察",
    section: "observations",
    note: "补遗与跨窗口观察单独列示，不计入本轮新增。",
  },
];

const timeOnly = (value: string) => value.slice(11);
const storyTitle = (entry: BriefEntry) =>
  entry.title.title_zh_cn ? "《" + entry.title.title_zh_cn + "》" : entry.title.title_en;

const archiveEditionTitle = (item: BriefManifestItem) =>
  item.archiveTitle?.trim() ||
  `${item.period === "am" ? "早报" : "晚报"}｜本期简报`;

function resolveMediaUrl(url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return import.meta.env.BASE_URL + url.replace(/^\/+/, "");
}

function preferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem("brief-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function preferredAccent(): Accent {
  if (typeof window === "undefined") return "orange";
  try {
    const stored = window.localStorage.getItem("brief-accent");
    if (stored === "orange" || stored === "cobalt" || stored === "jade" || stored === "violet" || stored === "rose") {
      return stored;
    }
  } catch {
    // Storage can be unavailable in privacy-restricted contexts.
  }
  return "orange";
}

function editionHref(editionId: string, entryId = "top"): string {
  const params = new URLSearchParams({ edition: editionId });
  return import.meta.env.BASE_URL + "?" + params.toString() + "#" + encodeURIComponent(entryId);
}

function EditorialImage({
  asset,
  kind,
  title,
  unavailableNote,
  eager = false,
}: {
  asset?: ImageAsset;
  kind: "editorial" | "cover";
  title: string;
  unavailableNote?: string;
  eager?: boolean;
}) {
  const fallback = import.meta.env.BASE_URL +
    (kind === "cover" ? "media/fallback/cover.svg" : "media/fallback/editorial.svg");
  const requested = asset?.url ? resolveMediaUrl(asset.url) : fallback;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [requested]);
  const isPlaceholder = !asset || asset.placeholder === true || failed;

  return (
    <figure
      className={`media-slot media-slot--${kind} media-slot--aspect-${
        asset?.aspect ?? (kind === "cover" ? "portrait" : "landscape")
      }`}
    >
      <img
        src={failed ? fallback : requested}
        alt={isPlaceholder ? title + "：暂无可核实配图" : asset.alt}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        onError={() => setFailed(true)}
      />
      {!isPlaceholder && kind === "editorial" && (
        <figcaption>
          <span>{asset.credit}</span>
          <a href={asset.sourceUrl} target="_blank" rel="noreferrer">
            图源<ArrowUpRight aria-hidden="true" />
          </a>
        </figcaption>
      )}
      {isPlaceholder && (
        <span className="media-pending" title={unavailableNote}>
          暂无可核实配图
        </span>
      )}
    </figure>
  );
}

function StatusMark({ status, timeStatus }: { status: FactStatus; timeStatus: BriefEntry["time_status"] }) {
  const uncertain = status === "unconfirmed" || timeStatus !== "verified";
  return (
    <span className={"status-mark " + (uncertain ? "status-mark--warning" : "")}>
      {uncertain
        ? <WarningCircle weight="fill" aria-hidden="true" />
        : <CheckCircle weight="fill" aria-hidden="true" />}
      {statusLabels[status]}
      {timeStatus === "date_only" && " / 仅核日期"}
      {timeStatus === "time_unverified" && " / 时间待核"}
    </span>
  );
}

function SourceLinks({ sources }: { sources: SourceLink[] }) {
  return (
    <div className="source-list">
      {sources.map((source) => (
        <a key={source.kind + source.url} href={source.url} target="_blank" rel="noreferrer">
          <span>{sourceKindLabels[source.kind]}</span>
          {source.label}
          <ArrowUpRight aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function StoryIdentity({ entry }: { entry: BriefEntry }) {
  return (
    <div className="story-identity">
      <strong className="story-identity__primary">{storyTitle(entry)}</strong>
      <div className="story-identity__meta">
        {entry.title.title_zh_cn && <span>{entry.title.title_en}</span>}
        <span>{titleStatusLabels[entry.title.title_zh_status]}</span>
      </div>
    </div>
  );
}

function LeadStory({ entry }: { entry: BriefEntry }) {
  return (
    <article className="lead-story" id={"lead-" + entry.id}>
      <EditorialImage
        asset={entry.images?.[0]}
        kind="editorial"
        title={storyTitle(entry)}
        unavailableNote={entry.imageNote}
        eager
      />
      <div className="lead-story__body">
        <div className="story-kicker">
          <time>{entry.beijingTime}</time>
          <StatusMark status={entry.fact_status} timeStatus={entry.time_status} />
        </div>
        <StoryIdentity entry={entry} />
        <h2>{entry.headline}</h2>
        <p>{entry.summary}</p>
        <a className="read-link" href={"#" + entry.id}>
          阅读核验记录<ArrowRight aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function FocusItem({ entry, rank }: { entry: BriefEntry; rank: number }) {
  return (
    <a className="focus-item" href={"#" + entry.id}>
      <span className="focus-item__rank">{String(rank).padStart(2, "0")}</span>
      <EditorialImage
        asset={entry.images?.[0]}
        kind="editorial"
        title={storyTitle(entry)}
        unavailableNote={entry.imageNote}
      />
      <span className="focus-item__copy">
        <small>{storyTitle(entry)}</small>
        <strong>{entry.headline}</strong>
        <span>{statusLabels[entry.fact_status]}</span>
      </span>
    </a>
  );
}

function StoryRow({ entry, index }: { entry: BriefEntry; index: number }) {
  return (
    <article className="story-row reveal-row" id={entry.id}>
      <span className="story-row__number">{String(index + 1).padStart(2, "0")}</span>
      <div className="story-row__body">
        <div className="story-kicker">
          <time>{entry.beijingTime}</time><span>{entry.timeNote}</span>
        </div>
        <StoryIdentity entry={entry} />
        <h3>{entry.headline}</h3>
        <p className="story-summary">{entry.summary}</p>
        <div className="story-facts">
          <StatusMark status={entry.fact_status} timeStatus={entry.time_status} />
          <span>{entry.platforms.join(" / ")}</span>
          <span>{entry.region}</span>
          {entry.releaseType && <span>{entry.releaseType}</span>}
        </div>
      </div>
      <EditorialImage
        asset={entry.images?.[0]}
        kind="editorial"
        title={storyTitle(entry)}
        unavailableNote={entry.imageNote}
      />
      <aside className="story-row__evidence">
        <SourceLinks sources={entry.sources} />
        <details>
          <summary>核验说明</summary>
          <p>{entry.verification}</p>
        </details>
      </aside>
    </article>
  );
}

function SectionHeader({ number, title, count, id }: { number: string; title: string; count: number; id: string }) {
  return (
    <header className="section-header">
      <span>{number}</span>
      <h2 id={id}>{title}</h2>
      <small>{String(count).padStart(2, "0")} ITEMS</small>
    </header>
  );
}

function StorySection({
  id,
  number,
  title,
  entries,
  note,
}: {
  id: string;
  number: string;
  title: string;
  entries: BriefEntry[];
  note?: string;
}) {
  return (
    <section className="editorial-section" id={id} aria-labelledby={id + "-title"}>
      <SectionHeader number={number} title={title} count={entries.length} id={id + "-title"} />
      {note && <p className="section-note">{note}</p>}
      <div className="story-list">
        {entries.map((entry, index) => <StoryRow key={entry.id} entry={entry} index={index} />)}
      </div>
    </section>
  );
}

function UpcomingItem({ item }: { item: UpcomingEntry }) {
  const title = item.title.title_zh_cn ? "《" + item.title.title_zh_cn + "》" : item.title.title_en;
  return (
    <article className="upcoming-item">
      <EditorialImage
        asset={item.cover}
        kind="cover"
        title={title}
        unavailableNote={item.coverNote}
      />
      <div className="upcoming-item__body">
        <time>{item.date}</time>
        <h3>{title}</h3>
        {item.title.title_zh_cn && <p>{item.title.title_en}</p>}
        <div>
          <span>{item.platforms.join(" / ")}</span>
          <span>{item.releaseType}</span>
          <span>{item.region}</span>
        </div>
        <a href={item.source.url} target="_blank" rel="noreferrer">
          {item.source.label}<ArrowUpRight aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function uniqueEntries(entries: Array<BriefEntry | undefined>): BriefEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry): entry is BriefEntry => {
    if (!entry || seen.has(entry.id)) return false;
    seen.add(entry.id);
    return true;
  });
}

function App({
  initialEdition = fallbackEdition,
  initialManifest = null,
  initialSearchIndex = null,
  initialTheme,
  initialAccent,
  initialQuery,
}: AppProps = {}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const accentPickerRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [accentPickerOpen, setAccentPickerOpen] = useState(false);
  const [theme, setTheme] = useState<Theme>(() => initialTheme ?? preferredTheme());
  const [accent, setAccent] = useState<Accent>(() => initialAccent ?? preferredAccent());
  const [query, setQuery] = useState(() => {
    if (initialQuery !== undefined) return initialQuery;
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  const [edition, setEdition] = useState(initialEdition);
  const [manifest, setManifest] = useState<BriefManifest | null>(initialManifest);
  const [searchIndex, setSearchIndex] = useState<BriefSearchIndex | null>(initialSearchIndex);
  const [archiveError, setArchiveError] = useState("");

  const sourceReport = edition.sourceReport ?? fallbackSourceReport;
  const period = periodLabels[edition.period];

  const visibleStorySections = storySectionDefinitions
    .map((definition) => ({
      ...definition,
      entries: entriesForSection(edition.entries, definition.section),
    }))
    .filter((section) => section.entries.length > 0)
    .map((section, index) => ({
      ...section,
      number: String(index + 2).padStart(2, "0"),
    }));

  let nextSectionNumber = visibleStorySections.length + 2;
  const upcomingNumber = String(nextSectionNumber).padStart(2, "0");
  if (edition.upcoming.length > 0) nextSectionNumber += 1;
  const trackingNumber = String(nextSectionNumber).padStart(2, "0");
  if (edition.tracking.length > 0) nextSectionNumber += 1;
  const sourceReportNumber = String(nextSectionNumber).padStart(2, "0");
  const archiveNumber = String(nextSectionNumber + 1).padStart(2, "0");

  const sectionsByKey = Object.fromEntries(
    visibleStorySections.map((section) => [section.section, section.entries]),
  ) as Partial<Record<SectionKey, BriefEntry[]>>;
  const featured = entriesForSection(edition.entries, "focus");
  const focusEntries = uniqueEntries([
    ...featured,
    ...(sectionsByKey.news ?? []),
    ...(sectionsByKey.releases ?? []),
    ...(sectionsByKey.industry ?? []),
    ...(sectionsByKey.reviews ?? []),
    ...edition.entries,
  ]).slice(0, 5);
  const manifestEdition = manifest?.editions.find((item) => item.id === edition.id);
  const pageTitle = edition.archiveTitle?.trim() ||
    manifestEdition?.archiveTitle?.trim() ||
    `${period.edition}｜${focusEntries[0]?.headline ?? "本期简报"}`;

  const directoryItems = [
    ...visibleStorySections.map((section) => ({
      number: section.number,
      label: section.label,
      count: section.entries.length,
      href: "#" + section.id,
    })),
    ...(edition.upcoming.length > 0
      ? [{ number: upcomingNumber, label: "日历", count: edition.upcoming.length, href: "#upcoming" }]
      : []),
  ];

  const primaryLinks = [
    { href: "#content", label: "\u5185\u5bb9" },
    ...(edition.upcoming.length > 0 ? [{ href: "#upcoming", label: "\u65e5\u5386" }] : []),
    { href: "#archive", label: "\u5f52\u6863" },
  ];

  const archiveEditions = useMemo(
    () => [...(manifest?.editions ?? [])].reverse(),
    [manifest],
  );
  const archiveCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const entry of searchIndex?.entries ?? []) {
      counts.set(entry.editionId, (counts.get(entry.editionId) ?? 0) + 1);
    }
    return counts;
  }, [searchIndex]);
  const searchResults = useMemo(
    () => searchArchiveEntries(searchIndex?.entries ?? [], query),
    [query, searchIndex],
  );
  const visibleSearchResults = searchResults.slice(0, 100);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem("brief-theme", theme);
    } catch {
      // Keep the selected theme for this session when storage is unavailable.
    }
  }, [theme]);

  useEffect(() => {
    document.documentElement.dataset.accent = accent;
    try {
      window.localStorage.setItem("brief-accent", accent);
    } catch {
      // Keep the selected accent for this session when storage is unavailable.
    }
  }, [accent]);

  useEffect(() => {
    if (!accentPickerOpen) return;

    const closeOnPointer = (event: PointerEvent) => {
      if (!accentPickerRef.current?.contains(event.target as Node)) {
        setAccentPickerOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setAccentPickerOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accentPickerOpen]);

  useEffect(() => {
    const controller = new AbortController();

    void (async () => {
      const [latestResult, manifestResult, indexResult] = await Promise.allSettled([
        loadLatestEdition(controller.signal),
        loadBriefManifest(controller.signal),
        loadSearchIndex(controller.signal),
      ]);

      if (controller.signal.aborted) return;

      if (manifestResult.status === "fulfilled") {
        setManifest(manifestResult.value);
      } else {
        setArchiveError("归档清单暂时无法读取。");
      }

      if (indexResult.status === "fulfilled") {
        setSearchIndex(indexResult.value);
      } else {
        setArchiveError((current) => current || "跨期搜索索引暂时无法读取。");
      }

      const latest = latestResult.status === "fulfilled"
        ? latestResult.value.edition
        : initialEdition;
      const requestedId = new URLSearchParams(window.location.search).get("edition");
      const requestedItem = manifestResult.status === "fulfilled"
        ? manifestResult.value.editions.find((item) => item.id === requestedId)
        : undefined;

      if (requestedItem) {
        try {
          const archived = await loadArchivedEdition(
            requestedItem,
            controller.signal,
          );
          if (!controller.signal.aborted) setEdition(archived);
        } catch {
          if (!controller.signal.aborted) {
            setEdition(latest);
            setArchiveError("指定归档暂时无法读取，已显示最新一期。");
          }
        }
      } else {
        setEdition(latest);
      }
    })();

    return () => controller.abort();
  }, [initialEdition]);

  useEffect(() => {
    const target = decodeURIComponent(window.location.hash.slice(1));
    if (!target || !edition.entries.some((entry) => entry.id === target)) return;
    window.requestAnimationFrame(() => {
      document.getElementById(target)?.scrollIntoView({ block: "start" });
    });
  }, [edition.id, edition.entries]);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.from(".masthead-reveal", {
      y: 18,
      opacity: 0,
      duration: 0.72,
      stagger: 0.07,
      ease: "power3.out",
    });
    gsap.from(".accent-signal", {
      scaleX: 0,
      duration: 0.86,
      transformOrigin: "left center",
      ease: "power3.out",
    });
    gsap.utils.toArray<HTMLElement>(".reveal-row").forEach((row) => {
      gsap.from(row, {
        y: 20,
        opacity: 0,
        duration: 0.55,
        ease: "power2.out",
        scrollTrigger: { trigger: row, start: "top 92%", once: true },
      });
    });
  }, { scope: rootRef, dependencies: [edition.id], revertOnUpdate: true });

  return (
    <div className="site-shell" data-theme={theme} data-accent={accent} ref={rootRef}>
      <a className="skip-link" href="#today">跳到今日简报</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="游戏圈动态首页">
          <span>游戏圈动态</span><small>DAILY GAME BRIEF</small>
        </a>
        <div className="topbar__edition">
          <span>NO.{String(edition.issueNumber).padStart(3, "0")}</span>
          <span>{edition.date}</span>
          <span>{period.english}</span>
        </div>
        <div className="accent-picker" ref={accentPickerRef}>
          <button
            className="accent-toggle interaction-state"
            type="button"
            aria-label={`切换主题强调色，当前为${accentOptions.find((option) => option.id === accent)?.label}`}
            aria-expanded={accentPickerOpen}
            aria-controls="accent-options"
            onClick={() => setAccentPickerOpen((open) => !open)}
          >
            <Palette aria-hidden="true" />
            <span>配色</span>
          </button>
          <div className="accent-options" id="accent-options" hidden={!accentPickerOpen}>
            <p>主题强调色</p>
            <div role="radiogroup" aria-label="选择主题强调色">
              {accentOptions.map((option) => (
                <button
                  key={option.id}
                  className={`accent-option accent-option--${option.id}`}
                  type="button"
                  role="radio"
                  aria-checked={accent === option.id}
                  onClick={() => {
                    setAccent(option.id);
                    setAccentPickerOpen(false);
                  }}
                >
                  <span className="accent-swatch" aria-hidden="true" />
                  <span>{option.label}</span>
                  {accent === option.id && <CheckCircle aria-hidden="true" />}
                </button>
              ))}
            </div>
          </div>
        </div>
        <button
          className="theme-toggle interaction-state"
          type="button"
          aria-label={theme === "dark" ? "切换到日间模式" : "切换到夜间模式"}
          title={theme === "dark" ? "切换到日间模式" : "切换到夜间模式"}
          onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}
        >
          {theme === "dark"
            ? <Sun aria-hidden="true" />
            : <Moon aria-hidden="true" />}
          <span>{theme === "dark" ? "日间" : "夜间"}</span>
        </button>
        <button
          className="menu-button interaction-state"
          type="button"
          aria-label={menuOpen ? "关闭目录" : "打开目录"}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <List aria-hidden="true" />}
          <span>目录</span>
        </button>
        <nav id="primary-navigation" className={menuOpen ? "is-open" : ""} aria-label="最高级目录">
          {primaryLinks.map((link) => (
            <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>
              {link.label}
            </a>
          ))}
        </nav>
        <span className="accent-signal" aria-hidden="true" />
      </header>

      <main id="top">
        <section className="edition-masthead" aria-labelledby="page-title">
          <div className="edition-masthead__title masthead-reveal">
            <span>DAILY EDITION</span>
            <h1 id="page-title">{pageTitle}</h1>
            <p>{edition.date.replaceAll("-", ".")} / 北京时间</p>
          </div>
          <dl className="edition-facts masthead-reveal" aria-label="本期基础信息">
            <div><dt>信息窗口</dt><dd>{timeOnly(edition.windowStart)}—{timeOnly(edition.windowEnd)}</dd></div>
            <div><dt>计划运行</dt><dd>{edition.plannedAt}</dd></div>
            <div><dt>实际生成</dt><dd>{edition.generatedAt}</dd></div>
            <div><dt>下一期</dt><dd>{period.nextTime}</dd></div>
          </dl>
        </section>

        <section className="lead-desk masthead-reveal" id="today" aria-labelledby="lead-title">
          <header className="desk-label">
            <span>01</span><h2 id="lead-title">今日重点</h2><small>EDITOR'S ORDER</small>
          </header>
          {focusEntries[0] ? (
            <div className="lead-grid">
              <LeadStory entry={focusEntries[0]} />
              <div className="focus-list">
                {focusEntries.slice(1).map((entry, index) => (
                  <FocusItem key={entry.id} entry={entry} rank={index + 2} />
                ))}
              </div>
            </div>
          ) : <p className="empty-line">本期暂无重点条目。</p>}
        </section>

        {directoryItems.length > 0 && (
          <div className="edition-directory" aria-label="本期非空栏目">
            {directoryItems.map((item) => (
              <a key={item.href} href={item.href}>
                <span>{item.number}</span>
                <strong>{item.label}</strong>
                <small>{String(item.count).padStart(2, "0")}</small>
              </a>
            ))}
          </div>
        )}

        <div className="edition-content" id="content">
          {visibleStorySections.map((section) => (
            <StorySection
              key={section.id}
              id={section.id}
              number={section.number}
              title={section.title}
              entries={section.entries}
              note={section.note}
            />
          ))}

          {edition.upcoming.length > 0 && (
            <section className="editorial-section upcoming-section" id="upcoming" aria-labelledby="upcoming-title">
              <SectionHeader
                number={upcomingNumber}
                title="未来15天发售"
                count={edition.upcoming.length}
                id="upcoming-title"
              />
              <div className="upcoming-grid">
                {edition.upcoming.map((item) => <UpcomingItem key={item.id} item={item} />)}
              </div>
            </section>
          )}

          {edition.tracking.length > 0 && (
            <section className="editorial-section tracking-section" id="tracking" aria-labelledby="tracking-title">
              <SectionHeader
                number={trackingNumber}
                title="仍需追踪"
                count={edition.tracking.length}
                id="tracking-title"
              />
              <ol>
                {edition.tracking.map((item, index) => (
                  <li key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}

          <section className="editorial-section source-report" id="source-report" aria-labelledby="source-report-title">
            <SectionHeader
              number={sourceReportNumber}
              title="检索记录"
              count={sourceReport.checked.length}
              id="source-report-title"
            />
            <div>
              <section><h3>已检查</h3><p>{sourceReport.checked.join(" / ")}</p></section>
              <section><h3>访问受限</h3><p>{sourceReport.limited.join(" / ") || "无"}</p></section>
              <p>{sourceReport.note}</p>
            </div>
          </section>
        </div>

        <section className="archive-section" id="archive" aria-labelledby="archive-title">
          <header>
            <span>{archiveNumber}</span>
            <div>
              <h2 id="archive-title">往期早晚报</h2>
              <p>
                {manifest
                  ? "已归档" + manifest.editions.length + "期，可按期次浏览或跨期检索新闻。"
                  : "正在读取归档清单。"}
              </p>
            </div>
            <label className="search-field">
              <span>搜索所有期次的游戏、平台或事件</span>
              <div>
                <MagnifyingGlass aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="输入新闻关键词"
                />
              </div>
            </label>
          </header>

          {archiveError && <p className="archive-status">{archiveError}</p>}

          {query.trim() && (
            <section className="archive-search" aria-labelledby="archive-search-title">
              <header className="archive-subhead">
                <h3 id="archive-search-title">新闻搜索结果</h3>
                <span>{searchResults.length} 条匹配</span>
              </header>
              <div className="archive-search-results" aria-live="polite">
                {visibleSearchResults.map((item) => (
                  <a key={item.editionId + item.entryId} href={editionHref(item.editionId, item.entryId)}>
                    <span className="archive-result__issue">
                      NO.{String(item.issueNumber).padStart(3, "0")}
                      <small>{item.date} · {item.period === "am" ? "早报" : "晚报"}</small>
                    </span>
                    <span className="archive-result__copy">
                      <small>{item.titleZhCn || item.titleEn}</small>
                      <strong>{item.headline}</strong>
                      <span>{item.summary}</span>
                    </span>
                    <small>{statusLabels[item.factStatus]} · 打开原文</small>
                  </a>
                ))}
                {searchResults.length === 0 && (
                  <p className="empty-line">所有已归档简报中均无匹配条目。</p>
                )}
              </div>
              {searchResults.length > visibleSearchResults.length && (
                <p className="archive-status">结果较多，当前显示前100条，请缩小关键词范围。</p>
              )}
            </section>
          )}

          <section className="archive-editions" aria-labelledby="archive-editions-title">
            <header className="archive-subhead">
              <h3 id="archive-editions-title">全部期次</h3>
              <span>{archiveEditions.length} EDITIONS</span>
            </header>
            <div className="archive-edition-list">
              {archiveEditions.map((item) => (
                <a
                  key={item.id}
                  className={item.id === edition.id ? "is-current" : ""}
                  href={editionHref(item.id)}
                  aria-current={item.id === edition.id ? "page" : undefined}
                >
                  <span>NO.{String(item.issueNumber).padStart(3, "0")}</span>
                  <time>{item.date}</time>
                  <strong>{archiveEditionTitle(item)}</strong>
                  <small>{archiveCounts.get(item.id) ?? "—"} 条新闻 · {item.generatedAt}</small>
                  <span>{item.id === edition.id ? "当前阅读" : "打开本期"}<ArrowRight aria-hidden="true" /></span>
                </a>
              ))}
              {manifest && archiveEditions.length === 0 && (
                <p className="empty-line">尚无可用归档。</p>
              )}
            </div>
          </section>
        </section>

      </main>

      <footer className="site-footer">
        <div className="brand"><span>游戏圈动态</span><small>DAILY GAME BRIEF</small></div>
        <p>编辑：Fallw1nd-津秋</p>
        <div className="footer-links">
          <a href="https://space.bilibili.com/11108421" target="_blank" rel="noreferrer">
            <PlayCircle aria-hidden="true" /><span>B站</span>
          </a>
          <span><ChatsCircle aria-hidden="true" />微信公众号：芳墨集</span>
          <a href="https://xiaoheihe.cn/app/user/profile/16936553" target="_blank" rel="noreferrer">
            <GameController aria-hidden="true" /><span>小黑盒</span>
          </a>
        </div>
      </footer>
    </div>
  );
}

export default App;

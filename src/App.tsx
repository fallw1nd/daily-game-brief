import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { ArrowUpRight, CheckCircle, List, MagnifyingGlass, WarningCircle, X } from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { edition as fallbackEdition, sourceReport as fallbackSourceReport } from "./data/brief";
import { loadLatestEdition } from "./data/briefLoader";
import { entriesForSection, searchEntries } from "./lib/brief";
import type { BriefEntry, FactStatus, ImageAsset, SourceLink, UpcomingEntry } from "./types";

gsap.registerPlugin(useGSAP, ScrollTrigger);

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

const sectionLinks = [
  { href: "#today", label: "今日" },
  { href: "#releases", label: "发售" },
  { href: "#news", label: "新闻" },
  { href: "#upcoming", label: "日历" },
  { href: "#archive", label: "归档" },
  { href: "#about", label: "关于" },
];

const timeOnly = (value: string) => value.slice(11);
const storyTitle = (entry: BriefEntry) =>
  entry.title.title_zh_cn ? "《" + entry.title.title_zh_cn + "》" : entry.title.title_en;

function resolveMediaUrl(url: string): string {
  if (/^(https?:|data:|blob:)/.test(url)) return url;
  return import.meta.env.BASE_URL + url.replace(/^\/+/, "");
}

function EditorialImage({
  asset,
  kind,
  title,
  eager = false,
}: {
  asset?: ImageAsset;
  kind: "editorial" | "cover";
  title: string;
  eager?: boolean;
}) {
  const fallback = import.meta.env.BASE_URL +
    (kind === "cover" ? "media/fallback/cover.svg" : "media/fallback/editorial.svg");
  const requested = asset?.url ? resolveMediaUrl(asset.url) : fallback;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [requested]);
  const isPlaceholder = !asset || asset.placeholder === true || failed;

  return (
    <figure className={"media-slot media-slot--" + kind}>
      <img
        src={failed ? fallback : requested}
        alt={isPlaceholder ? title + "：暂无可核实配图" : asset.alt}
        loading={eager ? "eager" : "lazy"}
        fetchPriority={eager ? "high" : "auto"}
        onError={() => setFailed(true)}
      />
      {!isPlaceholder && (
        <figcaption>
          <span>{asset.credit}</span>
          <a href={asset.sourceUrl} target="_blank" rel="noreferrer">图源<ArrowUpRight aria-hidden="true" /></a>
        </figcaption>
      )}
      {isPlaceholder && <span className="media-pending">IMAGE PENDING</span>}
    </figure>
  );
}

function StatusMark({ status, timeStatus }: { status: FactStatus; timeStatus: BriefEntry["time_status"] }) {
  const uncertain = status === "unconfirmed" || timeStatus !== "verified";
  return (
    <span className={"status-mark " + (uncertain ? "status-mark--warning" : "")}>
      {uncertain ? <WarningCircle weight="fill" /> : <CheckCircle weight="fill" />}
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
          <span>{sourceKindLabels[source.kind]}</span>{source.label}<ArrowUpRight aria-hidden="true" />
        </a>
      ))}
    </div>
  );
}

function StoryIdentity({ entry }: { entry: BriefEntry }) {
  return (
    <div className="story-identity">
      <span>{storyTitle(entry)}</span>
      <span>{entry.title.title_en}</span>
      <span>{titleStatusLabels[entry.title.title_zh_status]}</span>
    </div>
  );
}

function LeadStory({ entry }: { entry: BriefEntry }) {
  return (
    <article className="lead-story" id={"lead-" + entry.id}>
      <EditorialImage asset={entry.images?.[0]} kind="editorial" title={storyTitle(entry)} eager />
      <div className="lead-story__body">
        <div className="story-kicker">
          <time>{entry.beijingTime}</time>
          <StatusMark status={entry.fact_status} timeStatus={entry.time_status} />
        </div>
        <StoryIdentity entry={entry} />
        <h2>{entry.headline}</h2>
        <p>{entry.summary}</p>
        <a className="read-link" href={"#" + entry.id}>阅读核验记录<span aria-hidden="true">→</span></a>
      </div>
    </article>
  );
}

function FocusItem({ entry, rank }: { entry: BriefEntry; rank: number }) {
  return (
    <a className="focus-item" href={"#" + entry.id}>
      <span className="focus-item__rank">{String(rank).padStart(2, "0")}</span>
      <EditorialImage asset={entry.images?.[0]} kind="editorial" title={storyTitle(entry)} />
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
        <div className="story-kicker"><time>{entry.beijingTime}</time><span>{entry.timeNote}</span></div>
        <StoryIdentity entry={entry} />
        <h3>{entry.headline}</h3>
        <p className="story-summary">{entry.summary}</p>
        <div className="story-facts">
          <StatusMark status={entry.fact_status} timeStatus={entry.time_status} />
          <span>{entry.platforms.join(" / ")}</span><span>{entry.region}</span>
          {entry.releaseType && <span>{entry.releaseType}</span>}
        </div>
      </div>
      <EditorialImage asset={entry.images?.[0]} kind="editorial" title={storyTitle(entry)} />
      <aside className="story-row__evidence">
        <SourceLinks sources={entry.sources} />
        <details><summary>核验说明</summary><p>{entry.verification}</p></details>
      </aside>
    </article>
  );
}

function SectionHeader({ number, title, count, id }: { number: string; title: string; count: number; id: string }) {
  return (
    <header className="section-header">
      <span>{number}</span><h2 id={id}>{title}</h2><small>{String(count).padStart(2, "0")} ITEMS</small>
    </header>
  );
}

function StorySection({
  id, number, title, entries, note,
}: {
  id: string; number: string; title: string; entries: BriefEntry[]; note?: string;
}) {
  return (
    <section className="editorial-section" id={id} aria-labelledby={id + "-title"}>
      <SectionHeader number={number} title={title} count={entries.length} id={id + "-title"} />
      {note && <p className="section-note">{note}</p>}
      {entries.length > 0 ? (
        <div className="story-list">
          {entries.map((entry, index) => <StoryRow key={entry.id} entry={entry} index={index} />)}
        </div>
      ) : <p className="empty-line">本时段未发现可靠新增。</p>}
    </section>
  );
}

function UpcomingItem({ item }: { item: UpcomingEntry }) {
  const title = item.title.title_zh_cn ? "《" + item.title.title_zh_cn + "》" : item.title.title_en;
  return (
    <article className="upcoming-item">
      <EditorialImage asset={item.cover} kind="cover" title={title} />
      <div className="upcoming-item__body">
        <time>{item.date}</time><h3>{title}</h3>
        {item.title.title_zh_cn && <p>{item.title.title_en}</p>}
        <div><span>{item.platforms.join(" / ")}</span><span>{item.releaseType}</span><span>{item.region}</span></div>
        <a href={item.source.url} target="_blank" rel="noreferrer">{item.source.label}<ArrowUpRight aria-hidden="true" /></a>
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

function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [edition, setEdition] = useState(fallbackEdition);
  const sourceReport = edition.sourceReport ?? fallbackSourceReport;
  const period = periodLabels[edition.period];
  const sections = {
    releases: entriesForSection(edition.entries, "releases"),
    reviews: entriesForSection(edition.entries, "reviews"),
    news: entriesForSection(edition.entries, "news"),
    industry: entriesForSection(edition.entries, "industry"),
    features: entriesForSection(edition.entries, "features"),
    rumors: entriesForSection(edition.entries, "rumors"),
    observations: entriesForSection(edition.entries, "observations"),
  };
  const featured = entriesForSection(edition.entries, "focus");
  const focusEntries = uniqueEntries([
    ...featured, ...sections.news, ...sections.releases, ...sections.industry, ...sections.reviews,
  ]).slice(0, 5);
  const filteredEntries = useMemo(() => searchEntries(edition.entries, query), [edition.entries, query]);

  useEffect(() => {
    const controller = new AbortController();
    void loadLatestEdition(controller.signal)
      .then((result) => { if (!controller.signal.aborted) setEdition(result.edition); })
      .catch((error: unknown) => { if (!controller.signal.aborted) console.error("Unable to load brief", error); });
    return () => controller.abort();
  }, []);

  useGSAP(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.from(".masthead-reveal", { y: 18, opacity: 0, duration: 0.72, stagger: 0.07, ease: "power3.out" });
    gsap.utils.toArray<HTMLElement>(".reveal-row").forEach((row) => {
      gsap.from(row, {
        y: 20, opacity: 0, duration: 0.55, ease: "power2.out",
        scrollTrigger: { trigger: row, start: "top 92%", once: true },
      });
    });
  }, { scope: rootRef, dependencies: [edition.id], revertOnUpdate: true });

  return (
    <div className="site-shell" ref={rootRef}>
      <a className="skip-link" href="#today">跳到今日简报</a>
      <header className="topbar">
        <a className="brand" href="#top" aria-label="游戏圈动态首页"><span>游戏圈动态</span><small>DAILY GAME BRIEF</small></a>
        <div className="topbar__edition"><span>NO.{String(edition.issueNumber).padStart(3, "0")}</span><span>{edition.date}</span><span>{period.english}</span></div>
        <button className="menu-button" type="button" aria-label={menuOpen ? "关闭目录" : "打开目录"} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}>
          {menuOpen ? <X aria-hidden="true" /> : <List aria-hidden="true" />}<span>目录</span>
        </button>
        <nav id="primary-navigation" className={menuOpen ? "is-open" : ""} aria-label="最高级目录">
          {sectionLinks.map((link) => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}>{link.label}</a>)}
        </nav>
      </header>

      <main id="top">
        <section className="edition-masthead" aria-labelledby="page-title">
          <div className="edition-masthead__title masthead-reveal">
            <span>ISSUE {String(edition.issueNumber).padStart(3, "0")}</span>
            <h1 id="page-title">游戏{period.edition}</h1>
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
          <header className="desk-label"><span>01</span><h2 id="lead-title">今日重点</h2><small>EDITOR'S ORDER</small></header>
          {focusEntries[0] ? (
            <div className="lead-grid">
              <LeadStory entry={focusEntries[0]} />
              <div className="focus-list">{focusEntries.slice(1).map((entry, index) => <FocusItem key={entry.id} entry={entry} rank={index + 2} />)}</div>
            </div>
          ) : <p className="empty-line">本期暂无重点条目。</p>}
        </section>

        <div className="edition-directory" aria-label="本期栏目">
          {[
            ["02", "发售", sections.releases.length, "#releases"], ["03", "评分", sections.reviews.length, "#reviews"],
            ["04", "新闻", sections.news.length, "#news"], ["05", "产业", sections.industry.length, "#industry"],
            ["06", "深读", sections.features.length, "#features"], ["07", "传闻", sections.rumors.length, "#rumors"],
            ["08", "观察", sections.observations.length, "#observations"],
          ].map(([number, label, count, href]) => (
            <a key={String(href)} href={String(href)}><span>{number}</span><strong>{label}</strong><small>{String(count).padStart(2, "0")}</small></a>
          ))}
        </div>

        <div className="edition-content">
          <StorySection id="releases" number="02" title="今日发售与新上线" entries={sections.releases} />
          <StorySection id="reviews" number="03" title="新游戏评分" entries={sections.reviews} />
          <StorySection id="news" number="04" title="热点新闻" entries={sections.news} />
          <StorySection id="industry" number="05" title="公司与产业动向" entries={sections.industry} />
          <StorySection id="features" number="06" title="深度文章与专访" entries={sections.features} />
          <StorySection id="rumors" number="07" title="泄漏、爆料与传闻" entries={sections.rumors} />
          <StorySection id="observations" number="08" title="延伸观察" entries={sections.observations} note="补遗与跨窗口观察单独列示，不计入本轮新增。" />

          <section className="editorial-section upcoming-section" id="upcoming" aria-labelledby="upcoming-title">
            <SectionHeader number="09" title="未来15天发售" count={edition.upcoming.length} id="upcoming-title" />
            {edition.upcoming.length > 0 ? <div className="upcoming-grid">{edition.upcoming.map((item) => <UpcomingItem key={item.id} item={item} />)}</div> : <p className="empty-line">本期没有新增发售前瞻。</p>}
          </section>

          <section className="editorial-section tracking-section" id="tracking" aria-labelledby="tracking-title">
            <SectionHeader number="10" title="仍需追踪" count={edition.tracking.length} id="tracking-title" />
            <ol>{edition.tracking.map((item, index) => <li key={item}><span>{String(index + 1).padStart(2, "0")}</span><p>{item}</p></li>)}</ol>
          </section>

          <section className="editorial-section source-report" id="source-report" aria-labelledby="source-report-title">
            <SectionHeader number="11" title="检索记录" count={sourceReport.checked.length} id="source-report-title" />
            <div><section><h3>已检查</h3><p>{sourceReport.checked.join(" / ")}</p></section><section><h3>访问受限</h3><p>{sourceReport.limited.join(" / ") || "无"}</p></section><p>{sourceReport.note}</p></div>
          </section>
        </div>

        <section className="archive-section" id="archive" aria-labelledby="archive-title">
          <header><span>12</span><div><h2 id="archive-title">本期归档检索</h2><p>当前索引第{edition.issueNumber}期，共{edition.entries.length}条记录。</p></div>
            <label className="search-field"><span>搜索游戏、平台或事件</span><div><MagnifyingGlass aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="输入关键词" /></div></label>
          </header>
          <div className="archive-list" aria-live="polite">
            {filteredEntries.map((entry) => <a key={entry.id} href={"#" + entry.id}><time>{entry.beijingTime.slice(5)}</time><span>{storyTitle(entry)}</span><strong>{entry.headline}</strong><small>{statusLabels[entry.fact_status]}</small></a>)}
            {filteredEntries.length === 0 && <p className="empty-line">没有匹配条目。</p>}
          </div>
        </section>

        <section className="publication-strip" id="about" aria-labelledby="about-title">
          <div><span>ABOUT / 关于</span><h2 id="about-title">游戏圈动态</h2></div>
          <p>每日北京时间10:10与17:00更新。新闻、发售、产业信息与来源核验共同归档。</p>
          <dl><div><dt>下一期</dt><dd>{period.nextTime} · {period.nextEdition}</dd></div><div><dt>时区</dt><dd>Asia/Shanghai</dd></div></dl>
        </section>
      </main>

      <footer className="site-footer">
        <div className="brand"><span>游戏圈动态</span><small>DAILY GAME BRIEF</small></div><p>编辑：Fallw1nd-津秋</p>
        <div className="footer-links"><a href="https://space.bilibili.com/11108421" target="_blank" rel="noreferrer">B站</a><span>微信公众号：芳墨集</span><a href="https://xiaoheihe.cn/app/user/profile/16936553" target="_blank" rel="noreferrer">小黑盒</a></div>
      </footer>
    </div>
  );
}

export default App;

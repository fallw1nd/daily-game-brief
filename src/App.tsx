import { useEffect, useMemo, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CalendarDots,
  CheckCircle,
  ClockCountdown,
  List,
  MagnifyingGlass,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { edition as fallbackEdition, sectionOrder, sourceReport as fallbackSourceReport } from "./data/brief";
import { loadLatestEdition } from "./data/briefLoader";
import { entriesForSection, searchEntries } from "./lib/brief";
import type { BriefEntry, FactStatus, SourceLink } from "./types";

gsap.registerPlugin(useGSAP, ScrollTrigger);

const statusLabels: Record<FactStatus, string> = {
  official: "官方",
  multi_source_verified: "多源核实",
  media_report: "媒体报道",
  media_relay_official: "媒体转述官方信息",
  unconfirmed: "未经证实",
};

const titleStatusLabels = {
  official_simplified: "官方简中",
  official_traditional: "官方繁中",
  common_translation: "常用译名",
  unavailable: "暂无可核实的官方中文名",
};

const periodLabels = {
  am: {
    edition: "\u65e9\u95f4\u7248",
    headline: "\u65e9\u62a5",
    english: "MORNING EDITION",
    nextTime: "\u4eca\u65e5 17:00",
    nextHeadline: "\u6e38\u620f\u665a\u62a5",
  },
  pm: {
    edition: "\u665a\u95f4\u7248",
    headline: "\u665a\u62a5",
    english: "EVENING EDITION",
    nextTime: "\u660e\u65e5 10:10",
    nextHeadline: "\u6e38\u620f\u65e9\u62a5",
  },
} as const;

const timeOnly = (value: string) => value.slice(11);

const sourceKindLabels = {
  primary: "一手来源",
  secondary: "补充报道",
  discovery: "发现来源",
};

const editorialNotes = [
  {
    title: "一手来源先行",
    body: "只有直接打开厂商、平台或原作者页面后，条目才会被标记为“官方”。",
  },
  {
    title: "窗口边界固定",
    body: "每期按计划时间计算开闭边界，任务延迟不会移动窗口。",
  },
  {
    title: "补遗保持可见",
    body: "错过窗口但完成核验的信息会注明原始时间和延迟原因，不伪装成本轮新增。",
  },
];

function TitleBlock({ entry, compact = false }: { entry: BriefEntry; compact?: boolean }) {
  return (
    <div className={`title-block ${compact ? "title-block--compact" : ""}`}>
      <p className="game-title-zh">
        {entry.title.title_zh_cn ? `《${entry.title.title_zh_cn}》` : entry.title.title_en}
      </p>
      {entry.title.title_zh_cn && <p className="game-title-en">{entry.title.title_en}</p>}
      <p className="title-status">{titleStatusLabels[entry.title.title_zh_status]}</p>
      {entry.title.edition_zh && <p className="edition-name">版本：{entry.title.edition_zh}</p>}
    </div>
  );
}

function FactBadge({ status, timeStatus }: { status: FactStatus; timeStatus: BriefEntry["time_status"] }) {
  const uncertain = status === "unconfirmed" || timeStatus !== "verified";
  return (
    <span className={`fact-badge ${uncertain ? "fact-badge--warning" : ""}`}>
      {uncertain ? <WarningCircle weight="fill" /> : <CheckCircle weight="fill" />}
      {statusLabels[status]}
      {timeStatus === "date_only" && " · 仅核到日期"}
      {timeStatus === "time_unverified" && " · 时间待核"}
    </span>
  );
}

function SourceLinks({ sources }: { sources: SourceLink[] }) {
  const groups = (["primary", "secondary", "discovery"] as const)
    .map((kind) => ({ kind, items: sources.filter((source) => source.kind === kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="source-groups">
      {groups.map((group) => (
        <div className="source-group" key={group.kind}>
          <span>{sourceKindLabels[group.kind]}</span>
          <div>
            {group.items.map((source) => (
              <a key={source.url} href={source.url} target="_blank" rel="noreferrer">
                {source.label}
                <ArrowUpRight aria-hidden="true" />
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FocusCard({ entry, lead = false, rank }: { entry: BriefEntry; lead?: boolean; rank: number }) {
  return (
    <article className={`focus-card ${lead ? "focus-card--lead" : ""}`}>
      <div className="focus-card__visual" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="focus-card__content">
        <div className="focus-card__meta">
          <span>{String(rank).padStart(2, "0")}</span>
          <FactBadge status={entry.fact_status} timeStatus={entry.time_status} />
        </div>
        <TitleBlock entry={entry} compact={!lead} />
        <h3>{entry.headline}</h3>
        {lead && <p className="focus-card__summary">{entry.summary}</p>}
        <a className="text-link" href={`#${entry.id}`}>
          查看完整条目
          <ArrowRight aria-hidden="true" />
        </a>
      </div>
    </article>
  );
}

function StorySheet({ entry, index }: { entry: BriefEntry; index: number }) {
  return (
    <article className="story-sheet" id={entry.id} style={{ zIndex: index + 1 }}>
      <div className="story-sheet__number">{String(index + 1).padStart(2, "0")}</div>
      <div className="story-sheet__main">
        <div className="story-sheet__time">
          <time>{entry.beijingTime}</time>
          <span>{entry.timeNote}</span>
        </div>
        <TitleBlock entry={entry} />
        <h3>{entry.headline}</h3>
        <p className="story-sheet__summary">{entry.summary}</p>
        <div className="story-sheet__facts">
          <FactBadge status={entry.fact_status} timeStatus={entry.time_status} />
          <span>{entry.platforms.join(" · ")}</span>
          <span>{entry.region}</span>
          {entry.releaseType && <span>{entry.releaseType}</span>}
        </div>
      </div>
      <div className="story-sheet__aside">
        <SourceLinks sources={entry.sources} />
        <details>
          <summary>来源与时间核验详情</summary>
          <p>{entry.verification}</p>
        </details>
      </div>
    </article>
  );
}

function EmptySection({ id, title, number }: { id: string; title: string; number: string }) {
  return (
    <section className="empty-section content-section" id={id} aria-labelledby={`${id}-title`}>
      <div className="section-heading">
        <span>{number}</span>
        <h2 id={`${id}-title`}>{title}</h2>
      </div>
      <p>本时段未发现可靠新增。</p>
    </section>
  );
}

function SectionHeading({ number, title, id }: { number: string; title: string; id: string }) {
  return (
    <div className="section-heading">
      <span>{number}</span>
      <h2 id={id}>{title}</h2>
    </div>
  );
}

function EntrySection({
  id,
  title,
  number,
  entries,
}: {
  id: string;
  title: string;
  number: string;
  entries: BriefEntry[];
}) {
  if (entries.length === 0) return <EmptySection id={id} title={title} number={number} />;

  return (
    <section className="story-section content-section" id={id} aria-labelledby={`${id}-title`}>
      <SectionHeading number={number} title={title} id={`${id}-title`} />
      <div className="story-stack">
        {entries.map((entry, index) => <StorySheet key={entry.id} entry={entry} index={index} />)}
      </div>
    </section>
  );
}

function App() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [noteIndex, setNoteIndex] = useState(0);
  const [query, setQuery] = useState("");
  const [edition, setEdition] = useState(fallbackEdition);
  const sourceReport = edition.sourceReport ?? fallbackSourceReport;
  const periodLabel = periodLabels[edition.period];
  const filteredEntries = useMemo(() => searchEntries(edition.entries, query), [edition.entries, query]);

  const releases = entriesForSection(edition.entries, "releases");
  const reviews = entriesForSection(edition.entries, "reviews");
  const news = entriesForSection(edition.entries, "news");
  const industry = entriesForSection(edition.entries, "industry");
  const features = entriesForSection(edition.entries, "features");
  const rumors = entriesForSection(edition.entries, "rumors");
  const observations = entriesForSection(edition.entries, "observations");
  const featured = entriesForSection(edition.entries, "focus");
  const focusEntries = featured.length > 0 ? featured : [news[0], releases[1], releases[0], news[1], observations[0]].filter(Boolean);

  useEffect(() => {
    const controller = new AbortController();
    void loadLatestEdition(controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) setEdition(result.edition);
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) console.error("Unable to load brief", error);
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const timer = window.setInterval(
      () => setNoteIndex((current) => (current + 1) % editorialNotes.length),
      6500,
    );
    return () => window.clearInterval(timer);
  }, []);

  useGSAP(
    () => {
      gsap.from(".hero-copy > *", {
        y: 46,
        opacity: 0,
        duration: 1.05,
        stagger: 0.1,
        ease: "power3.out",
      });
      gsap.from(".hero-media", {
        clipPath: "inset(10% 8% 10% 8% round 28px)",
        y: 24,
        duration: 1.05,
        ease: "power3.out",
      });

      const media = gsap.matchMedia();
      media.add("(min-width: 1100px) and (prefers-reduced-motion: no-preference)", () => {
        ScrollTrigger.create({
          trigger: ".edition-layout",
          start: "top 104px",
          end: "bottom bottom",
          pin: ".section-rail",
          pinSpacing: false,
        });

        gsap.utils.toArray<HTMLElement>(".story-sheet").forEach((sheet) => {
          gsap.fromTo(
            sheet,
            { y: 34, scale: 0.985, opacity: 0.72 },
            {
              y: 0,
              scale: 1,
              opacity: 1,
              ease: "none",
              scrollTrigger: {
                trigger: sheet,
                start: "top 86%",
                end: "top 22%",
                scrub: true,
              },
            },
          );
          gsap.to(sheet, {
            scale: 0.988,
            opacity: 0.82,
            ease: "none",
            scrollTrigger: {
              trigger: sheet,
              start: "bottom 26%",
              end: "bottom 8%",
              scrub: true,
            },
          });
        });
      });
      return () => media.revert();
    },
    { scope: rootRef },
  );

  const advanceNote = (direction: number) => {
    setNoteIndex((current) =>
      (current + direction + editorialNotes.length) % editorialNotes.length,
    );
  };

  return (
    <div className="site-shell" ref={rootRef}>
      <a className="skip-link" href="#today">跳到今日简报</a>

      <header className="site-header">
        <a className="brand" href="#top" aria-label="游戏圈动态首页">
          <span>游戏圈动态</span>
          <small>DAILY GAME BRIEF</small>
        </a>
        <p className="header-time">北京时间 {edition.generatedAt} 更新</p>
        <button
          className="menu-button"
          type="button"
          aria-label={menuOpen ? "关闭菜单" : "打开菜单"}
          aria-expanded={menuOpen}
          aria-controls="primary-navigation"
          onClick={() => setMenuOpen((open) => !open)}
        >
          {menuOpen ? <X aria-hidden="true" /> : <List aria-hidden="true" />}
          <span>{menuOpen ? "关闭" : "菜单"}</span>
        </button>
        <nav id="primary-navigation" className={menuOpen ? "nav-open" : ""} aria-label="主导航">
          <a href="#today" onClick={() => setMenuOpen(false)}>今日简报</a>
          <a href="#upcoming" onClick={() => setMenuOpen(false)}>发售日历</a>
          <a href="#archive" onClick={() => setMenuOpen(false)}>历史归档</a>
          <a href="#about" onClick={() => setMenuOpen(false)}>关于</a>
        </nav>
      </header>

      <main id="top">
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="hero-edition">第{edition.issueNumber}期 · {periodLabel.edition} · 北京时间</p>
            <h1 id="hero-title">
              <span>游戏</span>
              <span>{periodLabel.headline}</span>
            </h1>
            <p className="hero-deck">发售、评分、新闻、产业与深读，浓缩成一份可追溯的一手简报。</p>
            <a className="primary-action" href="#today">
              阅读本期
              <ArrowRight aria-hidden="true" />
            </a>
          </div>
          <div className="hero-media">
            <div className="hero-orbit" aria-hidden="true">
              <span />
              <span />
              <span />
            </div>
            <div className="edition-card" aria-label={"当前第" + edition.issueNumber + "期" + periodLabel.edition}>
              <div className="edition-card__topline">
                <span>当前期次</span>
                <span>已发布</span>
              </div>
              <div className="edition-card__identity">
                <strong>{String(edition.issueNumber).padStart(2, "0")}</strong>
                <div>
                  <p>{periodLabel.edition}</p>
                  <span>{periodLabel.english}</span>
                </div>
              </div>
              <dl>
                <div>
                  <dt>日期</dt>
                  <dd>{edition.date.replaceAll("-", ".")}</dd>
                </div>
                <div>
                  <dt>时间窗口</dt>
                  <dd>{timeOnly(edition.windowStart)}—{timeOnly(edition.windowEnd)}</dd>
                </div>
                <div>
                  <dt>时区</dt>
                  <dd>Asia/Shanghai</dd>
                </div>
              </dl>
              <a href="#today">
                打开完整简报
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
          </div>
        </section>

        <section className="edition-ledger" aria-label="本期基础信息">
          <div>
            <span>信息窗口</span>
            <strong>{timeOnly(edition.windowStart)}（不含）—{timeOnly(edition.windowEnd)}（含）</strong>
          </div>
          <div>
            <span>计划运行</span>
            <strong>{edition.plannedAt}</strong>
          </div>
          <div>
            <span>实际生成</span>
            <strong>{edition.generatedAt}</strong>
          </div>
          <div>
            <span>下一期</span>
            <strong>{periodLabel.nextTime}</strong>
          </div>
        </section>

        <div className="source-marquee" aria-label="来源网络">
          <div>
            {["STEAM", "PLAYSTATION BLOG", "4GAMER", "厂商新闻稿", "官方社交账号", "公司 IR", "原始评测", "STEAM", "PLAYSTATION BLOG", "4GAMER", "厂商新闻稿", "官方社交账号", "公司 IR", "原始评测"].map((item, index) => (
              <span key={`${item}-${index}`}>{item}</span>
            ))}
          </div>
        </div>

        <section className="focus-section content-section" id="today" aria-labelledby="focus-title">
          <SectionHeading number="01" title="最值得关注" id="focus-title" />
          <p className="section-intro">五条导读，按影响力排序。每一条都能定位到本期完整核验记录。</p>
          <div className="focus-grid">
            {focusEntries.slice(0, 3).map((entry, index) => (
              <FocusCard key={entry.id} entry={entry} rank={index + 1} lead={index === 0} />
            ))}
          </div>
          <ol className="focus-tail" start={4}>
            {focusEntries.slice(3).map((entry) => (
              <li key={entry.id}>
                <a href={`#${entry.id}`}>
                  <span>{entry.title.title_zh_cn ?? entry.title.title_en}</span>
                  <strong>{entry.headline}</strong>
                  <ArrowRight aria-hidden="true" />
                </a>
              </li>
            ))}
          </ol>
        </section>

        <div className="edition-layout">
          <aside className="section-rail" aria-label="本期栏目导航">
            <p>本期目录</p>
            <ol>
              {sectionOrder.map((section, index) => (
                <li key={section.key}>
                  <a href={`#${section.key}`}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </aside>

          <div className="edition-body">
            <section className="story-section content-section" id="releases" aria-labelledby="releases-title">
              <SectionHeading number="02" title="今日发售与新上线" id="releases-title" />
              <div className="story-stack">
                {releases.map((entry, index) => <StorySheet key={entry.id} entry={entry} index={index} />)}
              </div>
            </section>

            <EntrySection id="reviews" title="新游戏评分" number="03" entries={reviews} />

            <section className="story-section content-section" id="news" aria-labelledby="news-title">
              <SectionHeading number="04" title="热点新闻" id="news-title" />
              <div className="story-stack">
                {news.map((entry, index) => <StorySheet key={entry.id} entry={entry} index={index} />)}
              </div>
            </section>

            <EntrySection id="industry" title="公司与产业动向" number="05" entries={industry} />
            <EntrySection id="features" title="深度文章与专访" number="06" entries={features} />
            <EntrySection id="rumors" title="泄漏、爆料与传闻" number="07" entries={rumors} />

            <section className="story-section content-section" id="observations" aria-labelledby="observations-title">
              <SectionHeading number="08" title="延伸观察" id="observations-title" />
              <p className="supplement-note">本条为补遗，不计入当前时间窗口新增新闻。</p>
              <div className="story-stack">
                {observations.map((entry, index) => <StorySheet key={entry.id} entry={entry} index={index} />)}
              </div>
            </section>

            <section className="upcoming-section content-section" id="upcoming" aria-labelledby="upcoming-title">
              <SectionHeading number="09" title="未来15天发售前瞻" id="upcoming-title" />
              <p className="section-intro">滚动窗口基于本期数据。地区差异并列展示，不强行归一。</p>
              <div className="upcoming-list">
                {edition.upcoming.map((item) => (
                  <article key={item.id}>
                    <time>{item.date}</time>
                    <div>
                      <h3>{item.title.title_zh_cn ? `《${item.title.title_zh_cn}》` : item.title.title_en}</h3>
                      {item.title.title_zh_cn && <p className="game-title-en">{item.title.title_en}</p>}
                    </div>
                    <div className="upcoming-meta">
                      <span>{item.platforms.join(" · ")}</span>
                      <span>{item.releaseType}</span>
                      <span>{item.region}</span>
                    </div>
                    <div className="upcoming-source">
                      <a href={item.source.url} target="_blank" rel="noreferrer">
                        {item.source.label}
                        <ArrowUpRight aria-hidden="true" />
                      </a>
                      <p>{item.note}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="tracking-section content-section" id="tracking" aria-labelledby="tracking-title">
              <SectionHeading number="10" title="仍需追踪" id="tracking-title" />
              <ol>
                {edition.tracking.map((item, index) => (
                  <li key={item}>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    <p>{item}</p>
                    <ClockCountdown aria-hidden="true" />
                  </li>
                ))}
              </ol>
            </section>

            <section className="search-report content-section" id="search-report" aria-labelledby="search-report-title">
              <SectionHeading number="11" title="本轮检索说明" id="search-report-title" />
              <div className="report-grid">
                <div>
                  <h3>已实际检查</h3>
                  <p>{sourceReport.checked.join(" · ")}</p>
                </div>
                <div>
                  <h3>访问受限</h3>
                  <p>{sourceReport.limited.join("；")}</p>
                </div>
              </div>
              <p className="report-note">{sourceReport.note}</p>
            </section>
          </div>
        </div>

        <section className="editorial-method content-section" aria-labelledby="method-title">
          <div>
            <p className="method-kicker">简报方法</p>
            <h2 id="method-title">读者不必相信我们，只需沿着证据返回原文。</h2>
          </div>
          <div className="note-carousel" aria-live="polite">
            <div className="note-carousel__index">{String(noteIndex + 1).padStart(2, "0")} / 03</div>
            <h3>{editorialNotes[noteIndex].title}</h3>
            <p>{editorialNotes[noteIndex].body}</p>
            <div>
              <button type="button" onClick={() => advanceNote(-1)} aria-label="上一条方法说明">
                <ArrowLeft aria-hidden="true" />
              </button>
              <button type="button" onClick={() => advanceNote(1)} aria-label="下一条方法说明">
                <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>

        <section className="archive-section" id="archive" aria-labelledby="archive-title">
          <div className="archive-heading">
            <div>
              <p>永久保存 · 跨期检索</p>
              <h2 id="archive-title">
                热点
                <span className="inline-image" aria-hidden="true" />
                资料库
              </h2>
            </div>
            <label className="search-field">
              <span>搜索游戏、平台或事件</span>
              <div>
                <MagnifyingGlass aria-hidden="true" />
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="例如：Steam、乐园追放"
                />
              </div>
            </label>
          </div>
          <div className="archive-results" aria-live="polite">
            <p>{query ? "找到 " + filteredEntries.length + " 条结果" : "当前展示第" + edition.issueNumber + "期的 " + filteredEntries.length + " 条已归档记录"}</p>
            {filteredEntries.map((entry) => (
              <a key={entry.id} href={`#${entry.id}`}>
                <time>{entry.beijingTime.slice(5)}</time>
                <span>{entry.title.title_zh_cn ?? entry.title.title_en}</span>
                <strong>{entry.headline}</strong>
                <FactBadge status={entry.fact_status} timeStatus={entry.time_status} />
                <ArrowRight aria-hidden="true" />
              </a>
            ))}
            {filteredEntries.length === 0 && <div className="no-results">没有匹配条目，请尝试游戏英文名、平台或事件关键词。</div>}
          </div>
        </section>

        <section className="next-edition" id="about" aria-labelledby="next-title">
          <div>
            <CalendarDots aria-hidden="true" />
            <p>下一期 · 北京时间</p>
            <h2 id="next-title">{periodLabel.nextTime}<br />{periodLabel.nextHeadline}</h2>
          </div>
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
            返回顶部
            <ArrowRight aria-hidden="true" />
          </button>
        </section>
      </main>

      <footer className="site-footer">
        <div className="brand">
          <span>游戏圈动态</span>
          <small>DAILY GAME BRIEF</small>
        </div>
        <p>每日10:10与17:00更新 · 北京时间</p>
        <p>编辑：Fallw1nd-津秋</p>
        <div className="footer-links">
          <a href="https://space.bilibili.com/11108421" target="_blank" rel="noreferrer">B站</a>
          <span>微信公众号：芳墨集</span>
          <a href="https://xiaoheihe.cn/app/user/profile/16936553" target="_blank" rel="noreferrer">小黑盒</a>
        </div>
      </footer>
    </div>
  );
}

export default App;

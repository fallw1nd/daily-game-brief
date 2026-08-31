import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Archive,
  CalendarBlank,
  CaretDown,
  CheckCircle,
  List,
  MagnifyingGlass,
  Moon,
  NewspaperClipping,
  Palette,
  Sun,
  WarningCircle,
  X,
} from "@phosphor-icons/react";
import { EditionPager } from "./components/EditionPager";
import {
  loadArchivedEdition,
  loadBriefManifest,
  loadEnglishLocaleIndex,
  loadEnglishOverlay,
  loadLatestEdition,
} from "./data/briefLoader";
import { loadEnglishSearchIndex } from "./data/englishLoader";
import { entriesForSection, searchArchiveEntries } from "./lib/brief";
import { projectEnglishEdition } from "./lib/english-render";
import { validateEnglishOverlayForRender } from "./lib/locale";
import { useEditorialMotion } from "./lib/useEditorialMotion";
import type {
  BriefEdition,
  BriefEntry,
  BriefManifest,
  BriefSearchIndex,
  EditionPeriod,
  EnglishLocaleIndex,
  FactStatus,
  ImageAsset,
  SectionKey,
  SourceLink,
  UpcomingEntry,
} from "./types";

type Theme = "light" | "dark";
type Accent = "orange" | "cobalt" | "jade" | "violet" | "rose";

const accentOptions: Array<{ id: Accent; label: string }> = [
  { id: "orange", label: "Lava orange" },
  { id: "cobalt", label: "Cobalt" },
  { id: "jade", label: "Jade" },
  { id: "violet", label: "Violet" },
  { id: "rose", label: "Rose" },
];

const statusLabels: Record<FactStatus, string> = {
  official: "Official",
  multi_source_verified: "Multi-source verified",
  media_report: "Media report",
  media_relay_official: "Media relay of official statement",
  unconfirmed: "Unconfirmed",
};

const sourceKindLabels = { primary: "Primary", secondary: "Secondary", discovery: "Discovery" };

const periodLabels: Record<EditionPeriod, { edition: string; short: string; nextTime: string; nextEdition: string; archive: string }> = {
  am: { edition: "Morning Brief", short: "MORNING", nextTime: "Today 17:00", nextEdition: "Evening Brief", archive: "Morning" },
  pm: { edition: "Evening Brief", short: "EVENING", nextTime: "Tomorrow 10:10", nextEdition: "Morning Brief", archive: "Evening" },
  daily: { edition: "Daily Brief", short: "DAILY", nextTime: "Tomorrow 12:00", nextEdition: "Daily Brief", archive: "Daily" },
};

const storySectionDefinitions: Array<{
  id: string;
  label: string;
  title: string;
  section: SectionKey;
  note?: string;
}> = [
  { id: "releases", label: "Releases", title: "Releases and launches", section: "releases" },
  { id: "reviews", label: "Reviews", title: "New game reviews", section: "reviews" },
  { id: "news", label: "News", title: "News", section: "news" },
  { id: "industry", label: "Industry", title: "Companies and industry", section: "industry" },
  { id: "features", label: "Features", title: "Features and interviews", section: "features" },
  { id: "rumors", label: "Rumors", title: "Leaks and rumors", section: "rumors" },
  {
    id: "observations",
    label: "Further",
    title: "Further observations",
    section: "observations",
    note: "Supplements and cross-window observations are listed separately and are not counted as new items for this edition.",
  },
];

function preferredTheme(): Theme {
  if (typeof window === "undefined") return "light";
  try {
    const stored = window.localStorage.getItem("brief-theme");
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Use system preference when storage is unavailable.
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function preferredAccent(): Accent {
  if (typeof window === "undefined") return "orange";
  try {
    const stored = window.localStorage.getItem("brief-accent");
    if (["orange", "cobalt", "jade", "violet", "rose"].includes(stored || "")) return stored as Accent;
  } catch {
    // Keep default accent when storage is unavailable.
  }
  return "orange";
}

function timeOnly(value: string): string { return value.slice(11); }
function storyTitle(entry: BriefEntry): string { return entry.title.title_en; }
function periodArchiveLabel(period: EditionPeriod): string { return periodLabels[period].archive; }
function resolveMediaUrl(url: string): string { if (/^(https?:|data:|blob:)/.test(url)) return url; return import.meta.env.BASE_URL + url.replace(/^\/+/, ""); }
function editionHref(editionId: string, entryId = "top"): string { const params = new URLSearchParams({ edition: editionId, lang: "en" }); return import.meta.env.BASE_URL + "?" + params.toString() + "#" + encodeURIComponent(entryId); }
function uniqueEntries(entries: Array<BriefEntry | undefined>): BriefEntry[] { const seen = new Set<string>(); return entries.filter((entry): entry is BriefEntry => { if (!entry || seen.has(entry.id)) return false; seen.add(entry.id); return true; }); }

function EditorialImage({ asset, kind, presentation = kind === "cover" ? "cover" : "standard", title, unavailableNote, eager = false }: { asset?: ImageAsset; kind: "editorial" | "cover"; presentation?: "lead" | "feature" | "standard" | "cover"; title: string; unavailableNote?: string; eager?: boolean; }) {
  const fallback = import.meta.env.BASE_URL + (kind === "cover" ? "media/fallback/cover.svg" : "media/fallback/editorial.svg");
  const requested = asset?.url ? resolveMediaUrl(asset.url) : fallback;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [requested]);
  const isPlaceholder = !asset || asset.placeholder === true || failed;
  return <figure className={`media-slot media-slot--${kind} media-slot--role-${presentation} ${isPlaceholder ? "media-slot--placeholder" : ""} media-slot--aspect-${asset?.aspect ?? (kind === "cover" ? "portrait" : "landscape")}`}><span className="media-slot__visual"><img src={failed ? fallback : requested} alt={isPlaceholder ? `${title}: no verified image available` : asset.alt} loading={eager ? "eager" : "lazy"} fetchPriority={eager ? "high" : "auto"} onError={() => setFailed(true)} />{isPlaceholder && <span className="media-pending" title={unavailableNote}>No verified image</span>}</span>{!isPlaceholder && kind === "editorial" && <figcaption><span>{asset.credit}</span><a href={asset.sourceUrl} target="_blank" rel="noreferrer">Image source<ArrowUpRight aria-hidden="true" /></a></figcaption>}</figure>;
}

function StatusMark({ status, timeStatus }: { status: FactStatus; timeStatus: BriefEntry["time_status"] }) { const uncertain = status === "unconfirmed" || timeStatus !== "verified"; return <span className={"status-mark " + (uncertain ? "status-mark--warning" : "")}>{uncertain ? <WarningCircle weight="fill" aria-hidden="true" /> : <CheckCircle weight="fill" aria-hidden="true" />}{statusLabels[status]}{timeStatus === "date_only" && " / Date only"}{timeStatus === "time_unverified" && " / Time unverified"}</span>; }
function PendingMark({ tracking }: Pick<BriefEntry, "tracking">) { return tracking === true ? <span className="pending-mark">Tracking</span> : null; }
function SourceLinks({ sources }: { sources: SourceLink[] }) { return <div className="source-list">{sources.map((source) => <a key={source.kind + source.url} href={source.url} target="_blank" rel="noreferrer"><span>{sourceKindLabels[source.kind]}</span>{source.label}<ArrowUpRight aria-hidden="true" /></a>)}</div>; }
function StoryIdentity({ entry }: { entry: BriefEntry }) { return <div className="story-identity"><strong className="story-identity__primary">{storyTitle(entry)}</strong></div>; }
function LeadStory({ entry }: { entry: BriefEntry }) { return <article className="lead-story" id={"lead-" + entry.id}><EditorialImage asset={entry.images?.[0]} kind="editorial" presentation="lead" title={storyTitle(entry)} unavailableNote={entry.imageNote} eager /><div className="lead-story__body"><div className="story-kicker"><time>{entry.beijingTime}</time><PendingMark tracking={entry.tracking} /><StatusMark status={entry.fact_status} timeStatus={entry.time_status} /></div><StoryIdentity entry={entry} /><h2>{entry.headline}</h2><p>{entry.summary}</p><a className="read-link" href={"#" + entry.id}>Read verification record<ArrowRight aria-hidden="true" /></a></div></article>; }
function FocusItem({ entry, rank }: { entry: BriefEntry; rank: number }) { return <a className="focus-item" href={"#" + entry.id}><span className="focus-item__rank">{String(rank).padStart(2, "0")}</span><span className="focus-item__copy"><small>{storyTitle(entry)}</small><strong>{entry.headline}</strong><span className="focus-item__state"><PendingMark tracking={entry.tracking} /><span>{statusLabels[entry.fact_status]}</span></span></span></a>; }
function StoryRow({ entry, index }: { entry: BriefEntry; index: number }) { return <article className="story-row reveal-row" id={entry.id}><span className="story-row__number">{String(index + 1).padStart(2, "0")}</span><div className="story-row__body"><div className="story-kicker"><time>{entry.beijingTime}</time><span>{entry.timeNote}</span></div><StoryIdentity entry={entry} /><h3>{entry.headline}</h3><p className="story-summary">{entry.summary}</p><div className="story-facts"><PendingMark tracking={entry.tracking} /><StatusMark status={entry.fact_status} timeStatus={entry.time_status} /><span>{entry.platforms.join(" / ")}</span><span>{entry.region}</span>{entry.releaseType && <span>{entry.releaseType}</span>}</div></div><aside className="story-row__support"><EditorialImage asset={entry.images?.[0]} kind="editorial" presentation={index === 0 ? "feature" : "standard"} title={storyTitle(entry)} unavailableNote={entry.imageNote} /><div className="story-row__evidence"><SourceLinks sources={entry.sources} /><details><summary>Verification</summary><p>{entry.verification}</p></details></div></aside></article>; }
function SectionHeader({ number, title, count, id }: { number: string; title: string; count: number; id: string }) { return <header className="section-header"><span>{number}</span><h2 id={id}>{title}</h2><small>{String(count).padStart(2, "0")} ITEMS</small></header>; }
function StorySection({ id, number, title, entries, note }: { id: string; number: string; title: string; entries: BriefEntry[]; note?: string; }) { return <section className="editorial-section" id={id} aria-labelledby={id + "-title"}><SectionHeader number={number} title={title} count={entries.length} id={id + "-title"} />{note && <p className="section-note">{note}</p>}<div className="story-list">{entries.map((entry, index) => <StoryRow key={entry.id} entry={entry} index={index} />)}</div></section>; }
function UpcomingItem({ item }: { item: UpcomingEntry }) { const title = item.title.title_en; return <article className="upcoming-item"><EditorialImage asset={item.cover} kind="cover" presentation="cover" title={title} unavailableNote={item.coverNote} /><div className="upcoming-item__body"><time>{item.date}</time><h3>{title}</h3><div><span>{item.platforms.join(" / ")}</span><span>{item.releaseType}</span><span>{item.region}</span></div><a href={item.source.url} target="_blank" rel="noreferrer">{item.source.label}<ArrowUpRight aria-hidden="true" /></a></div></article>; }

function EnglishUnavailable({ message }: { message: string }) { const params = new URLSearchParams(window.location.search); params.delete("lang"); return <div className="site-shell" data-theme={preferredTheme()} data-accent={preferredAccent()}><main id="top"><section className="edition-masthead" aria-labelledby="page-title"><div className="edition-masthead__title"><span>DAILY GAME BRIEF</span><h1 id="page-title">English version unavailable</h1><p>{message}</p><a className="read-link" href={import.meta.env.BASE_URL + "?" + params.toString()}>Read the Simplified Chinese edition<ArrowRight aria-hidden="true" /></a></div></section></main></div>; }

export default function EnglishApp() {
  const rootRef = useRef<HTMLDivElement>(null);
  const accentPickerRef = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<Theme>(() => preferredTheme());
  const [accent, setAccent] = useState<Accent>(() => preferredAccent());
  const [accentPickerOpen, setAccentPickerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [edition, setEdition] = useState<BriefEdition | null>(null);
  const [manifest, setManifest] = useState<BriefManifest | null>(null);
  const [localeIndex, setLocaleIndex] = useState<EnglishLocaleIndex | null>(null);
  const [searchIndex, setSearchIndex] = useState<BriefSearchIndex | null>(null);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [archiveExpanded, setArchiveExpanded] = useState(false);

  useEffect(() => { document.documentElement.lang = "en"; document.documentElement.dataset.theme = theme; document.documentElement.dataset.accent = accent; try { window.localStorage.setItem("brief-theme", theme); window.localStorage.setItem("brief-accent", accent); } catch {} }, [theme, accent]);
  useEffect(() => { if (!accentPickerOpen) return; const closeOnPointer = (event: PointerEvent) => { if (!accentPickerRef.current?.contains(event.target as Node)) setAccentPickerOpen(false); }; const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setAccentPickerOpen(false); }; document.addEventListener("pointerdown", closeOnPointer); document.addEventListener("keydown", closeOnEscape); return () => { document.removeEventListener("pointerdown", closeOnPointer); document.removeEventListener("keydown", closeOnEscape); }; }, [accentPickerOpen]);
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      const [latestResult, manifestResult, localeResult, searchResult] = await Promise.allSettled([loadLatestEdition(controller.signal), loadBriefManifest(controller.signal), loadEnglishLocaleIndex(controller.signal), loadEnglishSearchIndex(controller.signal)]);
      if (controller.signal.aborted) return;
      if (manifestResult.status !== "fulfilled" || localeResult.status !== "fulfilled") { setLoadError("The English archive index is temporarily unavailable."); return; }
      setManifest(manifestResult.value); setLocaleIndex(localeResult.value); if (searchResult.status === "fulfilled") setSearchIndex(searchResult.value);
      const latest = latestResult.status === "fulfilled" ? latestResult.value.edition : null;
      const requestedId = new URLSearchParams(window.location.search).get("edition");
      const requestedItem = manifestResult.value.editions.find((item) => item.id === requestedId);
      let canonical: BriefEdition | null = latest;
      if (requestedItem) { try { canonical = await loadArchivedEdition(requestedItem, controller.signal); } catch { setLoadError("The requested archive edition could not be loaded."); return; } }
      if (!canonical) { setLoadError("The canonical edition could not be loaded."); return; }
      const availability = localeResult.value.editions.find((item) => item.editionId === canonical!.id);
      if (!availability || availability.status !== "available") { setLoadError(availability?.status === "unavailable" ? availability.summary : "No validated English Overlay exists for this edition."); return; }
      try { const overlay = await loadEnglishOverlay(canonical.id, controller.signal); const validation = await validateEnglishOverlayForRender(canonical, overlay); if (validation.status !== "available") { setLoadError(validation.message); return; } const projected = projectEnglishEdition(canonical, overlay); if (!projected) { setLoadError("The English Overlay could not be projected safely onto the canonical edition."); return; } setEdition(projected); } catch { setLoadError("The validated English Overlay could not be loaded."); }
    })();
    return () => controller.abort();
  }, []);

  const archiveEditions = useMemo(() => [...(manifest?.editions ?? [])].reverse(), [manifest]);
  const englishArchiveTitles = useMemo(() => { const result = new Map<string, string>(); for (const item of localeIndex?.editions ?? []) if (item.status === "available") result.set(item.editionId, item.archiveTitle); return result; }, [localeIndex]);
  const archiveCounts = useMemo(() => { const counts = new Map<string, number>(); for (const entry of searchIndex?.entries ?? []) counts.set(entry.editionId, (counts.get(entry.editionId) ?? 0) + 1); return counts; }, [searchIndex]);
  const visibleArchiveEditions = archiveExpanded ? archiveEditions : archiveEditions.slice(0, 5);
  const hiddenArchiveCount = Math.max(archiveEditions.length - 5, 0);
  const searchResults = useMemo(() => searchArchiveEntries(searchIndex?.entries ?? [], query), [query, searchIndex]);
  const visibleSearchResults = searchResults.slice(0, 100);
  useEditorialMotion(rootRef, edition?.id ?? "english-loading");
  if (loadError) return <EnglishUnavailable message={loadError} />;
  if (!edition) return <EnglishUnavailable message="Loading the validated English edition…" />;

  const period = periodLabels[edition.period];
  const visibleStorySections = storySectionDefinitions.map((definition) => ({ ...definition, entries: entriesForSection(edition.entries, definition.section) })).filter((section) => section.entries.length > 0).map((section, index) => ({ ...section, number: String(index + 2).padStart(2, "0") }));
  let nextSectionNumber = visibleStorySections.length + 2;
  const upcomingNumber = String(nextSectionNumber).padStart(2, "0"); if (edition.upcoming.length > 0) nextSectionNumber += 1;
  const sourceReportNumber = String(nextSectionNumber).padStart(2, "0"); if (edition.sourceReport) nextSectionNumber += 1;
  const archiveNumber = String(nextSectionNumber).padStart(2, "0");
  const sectionsByKey = Object.fromEntries(visibleStorySections.map((section) => [section.section, section.entries])) as Partial<Record<SectionKey, BriefEntry[]>>;
  const featured = entriesForSection(edition.entries, "focus");
  const focusEntries = uniqueEntries([...featured, ...(sectionsByKey.news ?? []), ...(sectionsByKey.releases ?? []), ...(sectionsByKey.industry ?? []), ...(sectionsByKey.reviews ?? []), ...edition.entries]).slice(0, 5);
  const directoryItems = [...visibleStorySections.map((section) => ({ number: section.number, label: section.label, count: section.entries.length, href: "#" + section.id })), ...(edition.upcoming.length > 0 ? [{ number: upcomingNumber, label: "Calendar", count: edition.upcoming.length, href: "#upcoming" }] : [])];
  const primaryLinks = [{ href: "#content", label: "Content", icon: NewspaperClipping }, ...(edition.upcoming.length > 0 ? [{ href: "#upcoming", label: "Calendar", icon: CalendarBlank }] : []), { href: "#archive", label: "Archive", icon: Archive }];
  const englishEditionSequence = (manifest?.editions ?? []).filter((item) => englishArchiveTitles.has(item.id));
  const englishEditionIndex = englishEditionSequence.findIndex((item) => item.id === edition.id);
  const previousEnglishEdition = englishEditionIndex > 0 ? englishEditionSequence[englishEditionIndex - 1] : undefined;
  const nextEnglishEdition = englishEditionIndex >= 0 && englishEditionIndex < englishEditionSequence.length - 1 ? englishEditionSequence[englishEditionIndex + 1] : undefined;

  return <div className="site-shell" data-theme={theme} data-accent={accent} ref={rootRef}>
    <a className="skip-link" href="#today">Skip to today&apos;s brief</a>
    <header className="topbar"><a className="brand" href={import.meta.env.BASE_URL + "?lang=en#top"} aria-label="Daily Game Brief home"><span>GAME BRIEF</span><small>DAILY GAME BRIEF</small></a><div className="topbar__edition"><span>NO.{String(edition.issueNumber).padStart(3, "0")}</span><span>{edition.date}</span><span>{period.short}</span></div><div className="accent-picker" ref={accentPickerRef}><button className="accent-toggle interaction-state" type="button" aria-label={"Change accent color. Current: " + accentOptions.find((option) => option.id === accent)?.label} aria-expanded={accentPickerOpen} aria-controls="accent-options" onClick={() => setAccentPickerOpen((open) => !open)}><Palette aria-hidden="true" /><span>Accent</span></button><div className="accent-options" id="accent-options" hidden={!accentPickerOpen}><p>Accent color</p><div role="radiogroup" aria-label="Choose accent color">{accentOptions.map((option) => <button key={option.id} className={"accent-option accent-option--" + option.id} type="button" role="radio" aria-checked={accent === option.id} onClick={() => { setAccent(option.id); setAccentPickerOpen(false); }}><span className="accent-swatch" aria-hidden="true" /><span>{option.label}</span>{accent === option.id && <CheckCircle aria-hidden="true" />}</button>)}</div></div></div><button className="theme-toggle interaction-state" type="button" aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} onClick={() => setTheme((current) => current === "dark" ? "light" : "dark")}>{theme === "dark" ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}<span>{theme === "dark" ? "Light" : "Dark"}</span></button><button className="menu-button interaction-state" type="button" aria-label={menuOpen ? "Close directory" : "Open directory"} aria-expanded={menuOpen} aria-controls="primary-navigation" onClick={() => setMenuOpen((open) => !open)}>{menuOpen ? <X aria-hidden="true" /> : <List aria-hidden="true" />}<span>Menu</span></button><nav id="primary-navigation" className={menuOpen ? "is-open" : ""} aria-label="Primary navigation">{primaryLinks.map((link) => <a key={link.href} href={link.href} onClick={() => setMenuOpen(false)}><link.icon aria-hidden="true" /><span>{link.label}</span></a>)}</nav><span className="accent-signal" aria-hidden="true" /></header>
    <main id="top"><section className="edition-masthead" aria-labelledby="page-title"><div className="edition-masthead__title masthead-reveal"><span>DAILY EDITION</span><h1 id="page-title">{edition.archiveTitle || period.edition}</h1><p>{edition.date.replaceAll("-", ".")} / Beijing Time</p></div><dl className="edition-facts masthead-reveal" aria-label="Edition information"><div><dt>Window</dt><dd>{timeOnly(edition.windowStart)}-{timeOnly(edition.windowEnd)}</dd></div><div><dt>Scheduled</dt><dd>{edition.plannedAt}</dd></div><div><dt>Generated</dt><dd>{edition.generatedAt}</dd></div><div><dt>Next edition</dt><dd>{period.nextTime}</dd></div></dl></section>
      <section className="lead-desk masthead-reveal" id="today" aria-labelledby="lead-title"><header className="desk-label"><span>01</span><h2 id="lead-title">Today&apos;s focus</h2><small>EDITOR&apos;S ORDER</small></header>{focusEntries[0] ? <div className="lead-grid"><LeadStory entry={focusEntries[0]} /><div className="focus-list">{focusEntries.slice(1).map((entry, index) => <FocusItem key={entry.id} entry={entry} rank={index + 2} />)}</div></div> : <p className="empty-line">No focus item in this edition.</p>}</section>
      {directoryItems.length > 0 && <div className="edition-directory" aria-label="Non-empty sections">{directoryItems.map((item) => <a key={item.href} href={item.href}><span>{item.number}</span><strong>{item.label}</strong><small>{String(item.count).padStart(2, "0")}</small></a>)}</div>}
      <div className="edition-content" id="content">{visibleStorySections.map((section) => <StorySection key={section.id} id={section.id} number={section.number} title={section.title} entries={section.entries} note={section.note} />)}{edition.upcoming.length > 0 && <section className="editorial-section upcoming-section" id="upcoming" aria-labelledby="upcoming-title"><SectionHeader number={upcomingNumber} title="Releases in the next 15 days" count={edition.upcoming.length} id="upcoming-title" /><div className="upcoming-grid">{edition.upcoming.map((item) => <UpcomingItem key={item.id} item={item} />)}</div><EditionPager ariaLabel="Edition navigation" previousLabel="Previous edition" nextLabel="Next edition" previousBoundary="First available edition" nextBoundary="Latest available edition" previous={previousEnglishEdition ? { href: editionHref(previousEnglishEdition.id), issue: "NO." + String(previousEnglishEdition.issueNumber).padStart(3, "0") + " · " + periodArchiveLabel(previousEnglishEdition.period), title: englishArchiveTitles.get(previousEnglishEdition.id) ?? "English edition" } : undefined} next={nextEnglishEdition ? { href: editionHref(nextEnglishEdition.id), issue: "NO." + String(nextEnglishEdition.issueNumber).padStart(3, "0") + " · " + periodArchiveLabel(nextEnglishEdition.period), title: englishArchiveTitles.get(nextEnglishEdition.id) ?? "English edition" } : undefined} /></section>}{edition.sourceReport && <section className="editorial-section source-report" id="source-report" aria-labelledby="source-report-title"><SectionHeader number={sourceReportNumber} title="Source review" count={edition.sourceReport.checked.length} id="source-report-title" /><div><section><h3>Checked</h3><p>{edition.sourceReport.checked.join(" / ")}</p></section><section><h3>Access limited</h3><p>{edition.sourceReport.limited.join(" / ") || "None"}</p></section><p>{edition.sourceReport.note}</p></div></section>}</div>
      <section className="archive-section" id="archive" aria-labelledby="archive-title"><header><span>{archiveNumber}</span><div><h2 id="archive-title">Brief archive</h2><p>{manifest ? `${manifest.editions.length} editions archived. Browse by edition or search across validated English copy.` : "Loading archive index."}</p></div><label className="search-field"><span>Search games, platforms or events across English editions</span><div><MagnifyingGlass aria-hidden="true" /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search the archive" /></div></label></header>{query.trim() && <section className="archive-search" aria-labelledby="archive-search-title"><header className="archive-subhead"><h3 id="archive-search-title">Search results</h3><span>{searchResults.length} matches</span></header><div className="archive-search-results" aria-live="polite">{visibleSearchResults.map((item) => <a key={item.editionId + item.entryId} href={editionHref(item.editionId, item.entryId)}><span className="archive-result__issue">NO.{String(item.issueNumber).padStart(3, "0")}<small>{item.date} · {periodArchiveLabel(item.period)}</small></span><span className="archive-result__copy"><small>{item.titleEn}</small><strong>{item.headline}</strong><PendingMark tracking={item.tracking} /><span className="archive-result__summary">{item.summary}</span></span><span className="archive-result__action"><small>{statusLabels[item.factStatus]}</small><span>Open edition<ArrowUpRight aria-hidden="true" /></span></span></a>)}{searchResults.length === 0 && <p className="empty-line">No matching entry in the validated English archive.</p>}</div>{searchResults.length > visibleSearchResults.length && <p className="archive-status">Showing the first 100 matches. Narrow the query for more precise results.</p>}</section>}<section className="archive-editions" aria-labelledby="archive-editions-title"><header className="archive-subhead"><h3 id="archive-editions-title">All editions</h3><span>{archiveEditions.length} EDITIONS</span></header><div className="archive-edition-list" id="archive-edition-list">{visibleArchiveEditions.map((item) => { const title = englishArchiveTitles.get(item.id); const available = Boolean(title); return available ? <a key={item.id} className={item.id === edition.id ? "is-current" : ""} href={editionHref(item.id)} aria-current={item.id === edition.id ? "page" : undefined}><span>NO.{String(item.issueNumber).padStart(3, "0")}</span><time>{item.date}</time><strong>{title}</strong><small>{archiveCounts.get(item.id) ?? "-"} stories · {item.generatedAt}</small><span>{item.id === edition.id ? "Reading now" : "Open edition"}<ArrowRight aria-hidden="true" /></span></a> : null; })}</div>{hiddenArchiveCount > 0 && <button className="archive-toggle interaction-state" type="button" aria-expanded={archiveExpanded} aria-controls="archive-edition-list" onClick={() => setArchiveExpanded((expanded) => !expanded)}><span>{archiveExpanded ? "Collapse to the latest 5 editions" : `Show ${hiddenArchiveCount} more editions`}</span><CaretDown aria-hidden="true" /></button>}</section></section>
    </main>
    <footer className="site-footer"><div className="footer-identity"><div className="brand"><span>GAME BRIEF</span><small>DAILY GAME BRIEF</small></div><p>Twice-daily, evidence-checked video-game industry news.</p></div><div className="footer-meta"><span>Edited and maintained by</span><strong>Fallw1nd-津秋</strong><small>Updated at 10:10 / 17:00 Beijing Time</small></div><div className="footer-metrics" aria-label="Archive scale"><span><strong>{manifest?.editions.length ?? "-"}</strong> editions</span><span><strong>{searchIndex?.entries.length ?? "-"}</strong> searchable stories</span></div></footer>
  </div>;
}

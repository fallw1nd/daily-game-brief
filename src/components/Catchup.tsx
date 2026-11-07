import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, ClockCounterClockwise, Link } from "@phosphor-icons/react";
import type { BriefSearchIndex, FactStatus } from "../types";
import { catchupTopics, filterCatchup, topicKey, topicLabel, validCatchupDate } from "../lib/catchup";
import { readingHref } from "../lib/reading";
import { catchupLocationRange, readCatchupLocation, writeCatchupLocation, type CatchupDays, type CatchupLocation } from "../lib/catchup-location";
import "./catchup.css";

export function Catchup({ index, english, error, onRetry, onClose, onLocationChange, reviewOnly = false }: { reviewOnly?: boolean; index?: BriefSearchIndex; english: boolean; error: boolean; onRetry: () => void; onClose: () => void; onLocationChange?: (search: string) => void }) {
  const t = (zh: string, en: string) => english ? en : zh;
  const entries = index?.entries ?? [];
  const latest = entries.reduce((max, entry) => validCatchupDate(entry.date) && entry.date > max ? entry.date : max, "");
  const earliest = entries.reduce((min, entry) => validCatchupDate(entry.date) && (!min || entry.date < min) ? entry.date : min, "");
  const [location, setLocation] = useState(() => readCatchupLocation(window.location.search));
  const { days, topic, limit } = location;
  const range = catchupLocationRange(location, earliest, latest);
  const valid = validCatchupDate(range.start) && validCatchupDate(range.end) && range.start <= range.end;
  const topics = useMemo(() => catchupTopics(entries, english), [entries, english]);
  const inRange = filterCatchup(entries, range);
  const periodTopics = catchupTopics(inRange, english);
  const periodCounts = new Map(periodTopics.map(item => [item.key, item.count]));
  const results = filterCatchup(entries, { ...range, topic });
  const selected = topics.find(item => item.key === topic);
  const [shareStatus, setShareStatus] = useState<"" | "copied" | "manual">("");
  const [shareUrl, setShareUrl] = useState("");
  const copyAttempt = useRef(0);
  const restorePending = useRef(true);
  const locationChangeRef = useRef(onLocationChange);
  locationChangeRef.current = onLocationChange;
  function updateLocation(next: CatchupLocation) {
    copyAttempt.current += 1;
    setShareStatus(""); setShareUrl("");
    setLocation(next);
    const url = writeCatchupLocation(new URL(window.location.href), next);
    window.history.replaceState({ ...window.history.state, catchupPosition: null }, "", url);
    locationChangeRef.current?.(url.search);
  }
  useEffect(() => {
    const restore = () => {
      restorePending.current = true;
      copyAttempt.current += 1;
      setShareStatus(""); setShareUrl("");
      setLocation(readCatchupLocation(window.location.search));
    };
    window.addEventListener("popstate", restore);
    return () => { window.removeEventListener("popstate", restore); copyAttempt.current += 1; };
  }, []);
  useEffect(() => {
    if (!index || !restorePending.current) return;
    const saved = window.history.state?.catchupPosition;
    if (saved?.search !== window.location.search || !Number.isFinite(saved?.y) || saved.y < 0) { restorePending.current = false; return; }
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => { restorePending.current = false; window.scrollTo({ top: saved.y, behavior: "instant" }); }); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [index, location]);
  function savePosition() {
    const pinned = { ...location, ...range };
    const url = writeCatchupLocation(new URL(window.location.href), pinned);
    window.history.replaceState({ ...window.history.state, catchupPosition: { search: url.search, y: window.scrollY } }, "", url);
    locationChangeRef.current?.(url.search);
  }
  async function copyLink() {
    const attempt = ++copyAttempt.current;
    const url = writeCatchupLocation(new URL(window.location.href), { ...location, ...range });
    window.history.replaceState(window.history.state, "", url);
    locationChangeRef.current?.(url.search);
    try {
      await navigator.clipboard.writeText(url.href);
      if (attempt === copyAttempt.current) setShareStatus("copied");
    } catch {
      if (attempt === copyAttempt.current) { setShareUrl(url.href); setShareStatus("manual"); }
    }
  }
  const uncertain = results.filter(item => item.factStatus === "unconfirmed" || item.section === "rumors").length;
  const status: Record<FactStatus, string> = { official: t("官方消息", "Official"), multi_source_verified: t("多源核实", "Multi-source verified"), media_report: t("媒体报道", "Media report"), media_relay_official: t("媒体转述官方", "Reported official statement"), unconfirmed: t("未经证实", "Unconfirmed") };
  function chooseDays(value: CatchupDays) {
    const next = { ...location, days: value, start: "", end: "", limit: 12 };
    updateLocation({ ...next, ...(value === "custom" ? range : catchupLocationRange(next, earliest, latest)) });
  }
  function chooseTopic(value: string) { updateLocation({ ...location, ...range, topic: value, limit: 12 }); }
  return <section className="cu" id="catchup" aria-labelledby="cu-title">
    <div className="cu-top"><button className="cu-back" onClick={onClose}><ArrowLeft />{t("回到日报", "Back to the daily brief")}</button><span>{reviewOnly ? t("功能预览 · 独立审阅快照", "Feature preview · review snapshot") : t("从已发布日报中整理", "From published editions")}</span></div>
    <header className="cu-intro"><div className="cu-eyebrow"><ClockCounterClockwise />{t("离线补课", "THE CATCH-UP")}</div><h1 id="cu-title">{t("不必每天追，\n回来就能看懂。", "Away for a while?\nPick up the thread.")}</h1><p>{t("选一段时间，把散落在日报里的消息，按时间重新读一遍。", "Choose a period and follow the stories across our daily editions.")}</p></header>
    {error ? <div className="cu-empty" role="alert"><h2>{t("补课索引暂时不可用", "The catch-up index is unavailable")}</h2><p>{t("日报仍可正常阅读。这里不会用旧结论代替缺失数据。", "You can still read the daily brief. No conclusions are inferred from missing data.")}</p><button className="r-button" onClick={onRetry}>{t("重试", "Retry")}</button></div> : !index ? <p role="status" className="cu-empty">{t("正在整理已收录的新闻…", "Loading indexed stories…")}</p> : <>
    <div className="cu-controls">
      <fieldset><legend>{t("01 / 选择时间", "01 / TIME WINDOW")}</legend><div className="cu-presets">{([7, 30, "all", "custom"] as const).map(value => <button key={value} aria-pressed={days === value} onClick={() => chooseDays(value)}>{value === "custom" ? t("自定义", "Custom") : value === "all" ? t("全部收录", "All indexed") : t(`近 ${value} 天`, `Last ${value} days`)}</button>)}</div>{days === "custom" && <div className="cu-dates"><label>{t("开始", "From")}<input type="date" value={location.start} onChange={event => updateLocation({ ...location, start: event.target.value, limit: 12 })} /></label><label>{t("结束", "To")}<input type="date" value={location.end} onChange={event => updateLocation({ ...location, end: event.target.value, limit: 12 })} /></label></div>}<p>{t("快捷选择以索引最新日期为终点；链接保留所选日期，起止日均包含。", "Presets end on the latest indexed date; links keep your dates. Both boundaries are inclusive.")}</p></fieldset>
      <label className="cu-topic-select"><span>{t("02 / 选择主题", "02 / TOPIC")}</span><select value={topic} onChange={event => chooseTopic(event.target.value)}><option value="">{t("全部主题", "All topics")}</option>{topic && !selected && <option value={topic}>{t("此主题未收录", "Topic not indexed")}</option>}{topics.map(item => <option key={item.key} value={item.key}>{item.label} · {periodCounts.get(item.key) ?? 0}</option>)}</select><small>{t("数字为所选期间的条数；主题包含游戏、公司与活动。", "Counts are for your selected dates. Topics include games, companies and events.")}</small></label>
    </div>
    <div className="cu-layout"><div className="cu-timeline">
      <header className="cu-results-heading"><div><span className="cu-eyebrow">{topic ? t("主题档案", "TOPIC DOSSIER") : t("这段时间，发生了什么", "WHAT HAPPENED")}</span><h2>{selected?.label ?? (topic ? t("此主题未收录", "Topic not indexed") : t("按时间，补上这一段", "Catch up in order"))}</h2></div>{topic && <button className="cu-text-button" onClick={() => chooseTopic("")}>{t("全部主题", "All topics")}</button>}</header>
      <div className="cu-share"><button className="cu-text-button" disabled={!valid} onClick={() => void copyLink()}><Link />{t("复制这份补课", "Copy catch-up link")}</button><span role="status">{shareStatus === "copied" ? t("链接已复制，所选日期与主题已保留", "Link copied with your dates and topic") : shareStatus === "manual" ? t("请复制下方链接", "Copy the link below") : ""}</span>{shareUrl && <input readOnly aria-label={t("补课链接", "Catch-up link")} value={shareUrl} onFocus={event => event.currentTarget.select()} />}</div>
      <p className="cu-range" role="status">{valid ? `${range.start} — ${range.end} · ${results.length} ${t("条记录", "stories")}` : !entries.length ? t("索引中暂无可用记录。", "No indexed stories are available.") : t("请选择有效的起止日期，开始不能晚于结束。", "Choose valid dates, with the start no later than the end.")}</p>
      {valid && !results.length && <div className="cu-empty"><BookOpen /><h3>{t("这一段，尚无收录", "No indexed stories in this window")}</h3><p>{t("不代表没有新消息。试试扩大日期范围，或切换到全部主题。", "This does not mean nothing happened. Try a wider date range or all topics.")}</p></div>}
      {results.slice(0, limit).map(item => { const rumor = item.factStatus === "unconfirmed" || item.section === "rumors"; return <article className="cu-story" key={`${item.editionId}-${item.entryId}`}><div className="cu-date"><time>{item.date.slice(5).replace("-", ".")}</time><span>{item.date.slice(0, 4)}</span></div><div><div className="cu-story-meta"><button onClick={() => chooseTopic(topicKey(item))}>{topicLabel(item, english)}</button>{!english && item.titleStatus === "provisional_translation" && <span className="cu-rumor">译名：助手暂译（非官方）</span>}<span className={rumor ? "cu-rumor" : ""}>{rumor ? t("传闻 / 未证实", "Rumor / unconfirmed") : status[item.factStatus]}</span></div><h3>{item.headline}</h3><p>{item.summary}</p><div className="cu-story-links"><a href={readingHref(item.editionId, item.entryId, english)} onClick={savePosition} onAuxClick={savePosition}>{t("原期与来源核验", "Original edition & sources")}<ArrowUpRight /></a><small>NO.{String(item.issueNumber).padStart(3, "0")}{item.platforms.length ? ` · ${item.platforms.join(" / ")}` : ""}</small></div></div></article>; })}
      {results.length > limit && <button className="r-button" onClick={() => updateLocation({ ...location, ...range, limit: limit + 12 })}>{t(`再看 12 条（剩余 ${results.length - limit} 条）`, `Show 12 more (${results.length - limit} remaining)`)}<ArrowRight /></button>}
    </div><aside className="cu-sidebar"><div className="cu-note"><BookOpen /><h2>{t("一份有边界的补课", "A bounded catch-up")}</h2><p>{t("这里整理的是已发布摘要，不是重新生成的结论，也不判断游戏是否值得回坑。", "These are published summaries, not newly generated conclusions or advice on returning to a game.")}</p><dl><div><dt>{t("所选记录", "Selected stories")}</dt><dd>{results.length}</dd></div><div><dt>{t("传闻 / 未证实", "Rumor / unconfirmed")}</dt><dd>{uncertain}</dd></div><div><dt>{t("期间主题", "Topics in period")}</dt><dd>{periodTopics.length}</dd></div></dl><p>{t("媒体报道保留原证据标签，不自动升级为“已确认”。", "Media reports retain their evidence labels; they are not automatically treated as confirmed.")}</p></div><div className="cu-coverage"><h3>{t("收录范围", "Coverage")}</h3><p>{earliest || "—"} — {latest || "—"}</p><p>{t("按日报日期排列，并非事件发生时间。仅覆盖当前语言可用索引；收录不等于全网覆盖。", "Ordered by edition date, not event time. Coverage is limited to the index available in this language, not the entire news landscape.")}</p><p>{t("同名或旧别名可能分列，暂不自动合并。助手暂译明确标示；译名等级与消息核验状态分别呈现。", "Older aliases may remain separate; no automatic alias merging.")}</p></div></aside></div>
    </>}
  </section>;
}

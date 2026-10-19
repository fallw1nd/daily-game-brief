import { useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, ClockCounterClockwise } from "@phosphor-icons/react";
import type { BriefSearchIndex, FactStatus } from "../types";
import { catchupRange, catchupTopics, filterCatchup, topicKey, topicLabel, validCatchupDate } from "../lib/catchup";
import { readingHref } from "../lib/reading";
import "./catchup.css";

export function Catchup({ index, english, error, onRetry, onClose, reviewOnly = false }: { reviewOnly?: boolean; index?: BriefSearchIndex; english: boolean; error: boolean; onRetry: () => void; onClose: () => void }) {
  const t = (zh: string, en: string) => english ? en : zh;
  const entries = index?.entries ?? [];
  const latest = entries.reduce((max, entry) => validCatchupDate(entry.date) && entry.date > max ? entry.date : max, "");
  const earliest = entries.reduce((min, entry) => validCatchupDate(entry.date) && (!min || entry.date < min) ? entry.date : min, "");
  const [days, setDays] = useState<7 | 30 | "custom">(7);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [topic, setTopic] = useState("");
  const [limit, setLimit] = useState(12);
  const range = days === "custom" ? { start: customStart, end: customEnd } : catchupRange(latest, days);
  const valid = validCatchupDate(range.start) && validCatchupDate(range.end) && range.start <= range.end;
  const topics = useMemo(() => catchupTopics(entries, english), [entries, english]);
  const inRange = filterCatchup(entries, range);
  const results = filterCatchup(entries, { ...range, topic });
  const selected = topics.find(item => item.key === topic);
  const uncertain = results.filter(item => item.factStatus === "unconfirmed" || item.section === "rumors").length;
  const status: Record<FactStatus, string> = { official: t("官方消息", "Official"), multi_source_verified: t("多源核实", "Multi-source verified"), media_report: t("媒体报道", "Media report"), media_relay_official: t("媒体转述官方", "Reported official statement"), unconfirmed: t("未经证实", "Unconfirmed") };
  function chooseDays(value: 7 | 30 | "custom") { if (value === "custom") { setCustomStart(range.start); setCustomEnd(range.end); } setDays(value); setLimit(12); }
  function chooseTopic(value: string) { setTopic(value); setLimit(12); }
  return <section className="cu" id="catchup" aria-labelledby="cu-title">
    <div className="cu-top"><button className="cu-back" onClick={onClose}><ArrowLeft />{t("回到日报", "Back to the daily brief")}</button><span>{reviewOnly ? t("功能预览 · 独立审阅快照", "Feature preview · review snapshot") : t("从已发布日报中整理", "From published editions")}</span></div>
    <header className="cu-intro"><div className="cu-eyebrow"><ClockCounterClockwise />{t("离线补课", "THE CATCH-UP")}</div><h1 id="cu-title">{t("不必每天追，\n回来就能看懂。", "Away for a while?\nPick up the thread.")}</h1><p>{t("选一段时间，把散落在日报里的消息，按时间重新读一遍。", "Choose a period and follow the stories across our daily editions.")}</p></header>
    {error ? <div className="cu-empty" role="alert"><h2>{t("补课索引暂时不可用", "The catch-up index is unavailable")}</h2><p>{t("日报仍可正常阅读。这里不会用旧结论代替缺失数据。", "You can still read the daily brief. No conclusions are inferred from missing data.")}</p><button className="r-button" onClick={onRetry}>{t("重试", "Retry")}</button></div> : !index ? <p role="status" className="cu-empty">{t("正在整理已收录的新闻…", "Loading indexed stories…")}</p> : <>
    <div className="cu-controls">
      <fieldset><legend>{t("01 / 选择时间", "01 / TIME WINDOW")}</legend><div className="cu-presets">{([7, 30, "custom"] as const).map(value => <button key={value} aria-pressed={days === value} onClick={() => chooseDays(value)}>{value === "custom" ? t("自定义", "Custom") : t(`近 ${value} 天`, `Last ${value} days`)}</button>)}</div>{days === "custom" && <div className="cu-dates"><label>{t("开始", "From")}<input type="date" value={customStart} onChange={event => { setCustomStart(event.target.value); setLimit(12); }} /></label><label>{t("结束", "To")}<input type="date" value={customEnd} onChange={event => { setCustomEnd(event.target.value); setLimit(12); }} /></label></div>}<p>{t("以索引最新收录日期为终点；起止日均包含。", "Presets end on the latest indexed date; both boundaries are inclusive.")}</p></fieldset>
      <label className="cu-topic-select"><span>{t("02 / 选择主题", "02 / TOPIC")}</span><select value={topic} onChange={event => chooseTopic(event.target.value)}><option value="">{t("全部主题", "All topics")}</option>{topics.map(item => <option key={item.key} value={item.key}>{item.label} · {item.count}</option>)}</select><small>{t("主题包含游戏、公司与活动，不代表游戏清单。", "Topics include games, companies and events, not just games.")}</small></label>
    </div>
    <div className="cu-layout"><div className="cu-timeline">
      <header className="cu-results-heading"><div><span className="cu-eyebrow">{selected ? t("主题档案", "TOPIC DOSSIER") : t("这段时间，发生了什么", "WHAT HAPPENED")}</span><h2>{selected?.label ?? t("按时间，补上这一段", "Catch up in order")}</h2></div>{selected && <button className="cu-text-button" onClick={() => chooseTopic("")}>{t("全部主题", "All topics")}</button>}</header>
      <p className="cu-range" role="status">{valid ? `${range.start} — ${range.end} · ${results.length} ${t("条记录", "stories")}` : !entries.length ? t("索引中暂无可用记录。", "No indexed stories are available.") : t("请选择有效的起止日期，开始不能晚于结束。", "Choose valid dates, with the start no later than the end.")}</p>
      {valid && !results.length && <div className="cu-empty"><BookOpen /><h3>{t("这一段，尚无收录", "No indexed stories in this window")}</h3><p>{t("不代表没有新消息。试试扩大日期范围，或切换到全部主题。", "This does not mean nothing happened. Try a wider date range or all topics.")}</p></div>}
      {results.slice(0, limit).map(item => { const rumor = item.factStatus === "unconfirmed" || item.section === "rumors"; return <article className="cu-story" key={`${item.editionId}-${item.entryId}`}><div className="cu-date"><time>{item.date.slice(5).replace("-", ".")}</time><span>{item.date.slice(0, 4)}</span></div><div><div className="cu-story-meta"><button onClick={() => chooseTopic(topicKey(item))}>{topicLabel(item, english)}</button>{!english && item.titleStatus === "provisional_translation" && <span className="cu-rumor">译名：助手暂译（非官方）</span>}<span className={rumor ? "cu-rumor" : ""}>{rumor ? t("传闻 / 未证实", "Rumor / unconfirmed") : status[item.factStatus]}</span></div><h3>{item.headline}</h3><p>{item.summary}</p><div className="cu-story-links"><a href={readingHref(item.editionId, item.entryId, english)}>{t("原期与来源核验", "Original edition & sources")}<ArrowUpRight /></a><small>NO.{String(item.issueNumber).padStart(3, "0")}{item.platforms.length ? ` · ${item.platforms.join(" / ")}` : ""}</small></div></div></article>; })}
      {results.length > limit && <button className="r-button" onClick={() => setLimit(value => value + 12)}>{t(`再看 12 条（剩余 ${results.length - limit} 条）`, `Show 12 more (${results.length - limit} remaining)`)}<ArrowRight /></button>}
    </div><aside className="cu-sidebar"><div className="cu-note"><BookOpen /><h2>{t("一份有边界的补课", "A bounded catch-up")}</h2><p>{t("这里整理的是已发布摘要，不是重新生成的结论，也不判断游戏是否值得回坑。", "These are published summaries, not newly generated conclusions or advice on returning to a game.")}</p><dl><div><dt>{t("所选记录", "Selected stories")}</dt><dd>{results.length}</dd></div><div><dt>{t("传闻 / 未证实", "Rumor / unconfirmed")}</dt><dd>{uncertain}</dd></div><div><dt>{t("期间主题", "Topics in period")}</dt><dd>{catchupTopics(inRange, english).length}</dd></div></dl><p>{t("媒体报道保留原证据标签，不自动升级为“已确认”。", "Media reports retain their evidence labels; they are not automatically treated as confirmed.")}</p></div><div className="cu-coverage"><h3>{t("收录范围", "Coverage")}</h3><p>{earliest || "—"} — {latest || "—"}</p><p>{t("按日报日期排列，并非事件发生时间。仅覆盖当前语言可用索引；收录不等于全网覆盖。", "Ordered by edition date, not event time. Coverage is limited to the index available in this language, not the entire news landscape.")}</p><p>{t("同名或旧别名可能分列，暂不自动合并。助手暂译明确标示；译名等级与消息核验状态分别呈现。", "Older aliases may remain separate; no automatic alias merging.")}</p></div></aside></div>
    </>}
  </section>;
}

import type { useCalendarFocus } from "../lib/calendar-focus";

export function CalendarFocusControl({ focus, english = false }: { focus: ReturnType<typeof useCalendarFocus>; english?: boolean }) {
  if (focus.status === "archive") return null;
  if (focus.status === "unavailable") return <p className="r-calendar-note">{english ? "Focus selection is unavailable or out of date. Showing all recorded release plans." : "重点筛选暂不可用或已过期，当前展示全部已收录发售计划。"}</p>;
  return <div className="calendar-focus-control">
    <p className="r-calendar-note">{english ? `${focus.selected.length} focus releases / ${focus.total} recorded plans. Based on this site’s recent substantive game coverage, not a quality ranking or a complete release database.` : `重点 ${focus.selected.length} 项 / 已收录 ${focus.total} 项。根据本站近期实质游戏报道筛选，不是品质排名，也不代表完整发售数据库。`}</p>
    <button className="r-button" type="button" aria-pressed={focus.expanded} onClick={focus.toggle}>{focus.expanded ? (english ? "Show focus releases only" : "只看重点发售") : (english ? `Show all recorded releases (${focus.total})` : `查看全部已收录发售（${focus.total}）`)}</button>
    {!focus.expanded && focus.selected.length === 0 && <p role="status" className="r-calendar-note">{english ? "No releases currently match the focus criteria. You can still view every recorded plan." : "暂无符合重点条件的发售项目，仍可展开查看全部已收录计划。"}</p>}
  </div>;
}

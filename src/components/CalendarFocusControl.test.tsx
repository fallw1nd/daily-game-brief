import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
const { metadata } = vi.hoisted(() => ({ metadata: {} as Record<string, unknown> }));
vi.mock("../generated/calendar-focus.json", () => ({ default: metadata }));
import { calendarSnapshot, resolveCalendarFocus, useCalendarFocus } from "../lib/calendar-focus";
import { CalendarFocusControl } from "./CalendarFocusControl";
import ReadingApp from "../ReadingApp";
import fixture from "../../public/data/archive/2026/09/2026-09-07-daily.json";
import type { BriefEdition, BriefManifest, UpcomingEntry } from "../types";
const items = ["Focus", "Other"].map((name, index) => ({ id: String(index), date: "2026-10-24", title: { title_key: name, title_en: name, title_zh_status: "unavailable" }, platforms: ["PC"], region: "Global", releaseType: "Full", source: { label: "Official", url: "https://example.com", kind: "primary" } })) as UpcomingEntry[];
const valid = () => ({ version: 1, status: "available", editionId: "latest", snapshot: calendarSnapshot(items), selectedIds: ["0"] });
function Harness({ editionId = "latest", english = false }: { editionId?: string; english?: boolean }) {
  const focus = useCalendarFocus(items, editionId, "latest");
  return <><CalendarFocusControl focus={focus} english={english} /><ul>{focus.items.map(item => <li key={item.id}>{item.title.title_en}</li>)}</ul></>;
}
let root: Root;
async function render(editionId = "latest", english = false) {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  if (!root) { document.body.innerHTML = '<div id="test-root"></div>'; root = createRoot(document.getElementById("test-root")!); }
  await act(async () => root.render(<Harness editionId={editionId} english={english} />));
}
afterEach(async () => { if (root) await act(async () => root.unmount()); root = undefined as unknown as Root; document.body.innerHTML = ""; Object.keys(metadata).forEach(key => delete metadata[key]); });
describe("calendar focus", () => {
  it("filters the real reading calendar and retains all rows for historical editions", async () => {
    Object.assign(metadata, valid());
    await render();
    const edition = { ...fixture, id: "latest", upcoming: items } as BriefEdition;
    const manifest = { schemaVersion: 1, updatedAt: "now", latest: "latest", editions: [] } as BriefManifest;
    await act(async () => root.render(<ReadingApp initialEdition={edition} initialManifest={manifest} />));
    expect(document.querySelectorAll(".r-calendar-item")).toHaveLength(1);
    const toggle = document.querySelector<HTMLButtonElement>(".calendar-focus-control button")!;
    await act(async () => toggle.click());
    expect(document.querySelectorAll(".r-calendar-item")).toHaveLength(2);
    await act(async () => root.render(<ReadingApp initialEdition={{ ...edition, id: "archive" }} initialManifest={manifest} />));
    expect(document.querySelectorAll(".r-calendar-item")).toHaveLength(2);
    expect(document.querySelector(".calendar-focus-control")).toBeNull();
  });

  it("defaults latest to focus, toggles all, preserves native keyboard access and English labels", async () => {
    Object.assign(metadata, valid()); await render("latest", true);
    expect(document.querySelectorAll("li")).toHaveLength(1);
    const button = document.querySelector("button")!;
    expect(button.textContent).toBe("Show all recorded releases (2)");
    expect(button.type).toBe("button"); expect(button.tabIndex).toBe(0);
    button.focus(); expect(document.activeElement).toBe(button);
    await act(async () => button.click());
    expect(document.querySelectorAll("li")).toHaveLength(2); expect(button.getAttribute("aria-pressed")).toBe("true");
    await act(async () => button.click()); expect(document.querySelectorAll("li")).toHaveLength(1);
  });
  it("never filters archives", async () => {
    Object.assign(metadata, valid()); await render("archive"); expect(document.querySelectorAll("li")).toHaveLength(2); expect(document.querySelector("button")).toBeNull();
  });
  it("honestly shows no focus results with an all-recorded escape", async () => {
    Object.assign(metadata, valid(), { selectedIds: [] }); await render();
    expect(document.querySelectorAll("li")).toHaveLength(0); expect(document.body.textContent).toContain("暂无符合重点条件");
    await act(async () => document.querySelector("button")!.click()); expect(document.querySelectorAll("li")).toHaveLength(2);
  });
  it("falls back on missing, malformed or same-edition stale metadata", async () => {
    for (const bad of [null, {}, { ...valid(), selectedIds: ["unknown"] }, { ...valid(), selectedIds: ["0", "0"] }, { ...valid(), snapshot: "old" }, { ...valid(), status: "unavailable" }]) {
      const result = resolveCalendarFocus(items, "latest", "latest", bad); expect(result.status).toBe("unavailable"); expect(result.selected).toEqual(items);
    }
    Object.assign(metadata, valid(), { snapshot: "old" }); await render();
    expect(document.querySelectorAll("li")).toHaveLength(2); expect(document.body.textContent).toContain("重点筛选暂不可用或已过期");
    expect(resolveCalendarFocus([...items, { ...items[0], id: "new" }], "latest", "latest", valid()).status).toBe("unavailable");
    expect(resolveCalendarFocus(items.map(item => ({ ...item, source: { ...item.source, url: "https://example.com/different-product" } })), "latest", "latest", valid()).status).toBe("unavailable");
    expect(resolveCalendarFocus(items.map(item => ({ ...item, title: { ...item.title, title_en: "Changed" } })), "latest", "latest", valid()).status).toBe("unavailable");
  });
});

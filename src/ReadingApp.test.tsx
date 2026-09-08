import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ReadingApp from "./ReadingApp";
import * as loaders from "./data/briefLoader";
import * as englishLoader from "./data/englishLoader";
import { readingHref, readingLead, readingWindow } from "./lib/reading";
import latest from "../public/data/archive/2026/09/2026-09-07-daily.json";
import manifestData from "../public/data/manifest.json";
import calendarSnapshot from "../public/data/archive/2026/08/2026-08-31-daily.json";
import { calendarDate, calendarWindow, loadReadingCalendar } from "./lib/reading-calendar";
import legacy from "../public/data/archive/2026/08/2026-08-21-pm.json";
import type { BriefEdition, BriefManifest, BriefSearchIndex } from "./types";

const edition = latest as BriefEdition;
const manifest = manifestData as BriefManifest;
const search: BriefSearchIndex = { schemaVersion: 1, updatedAt: edition.generatedAt, entries: [
  { editionId: "2026-08-21-pm", issueNumber: 2, date: "2026-08-21", period: "pm", entryId: "historical-anchor", titleEn: "Archive", titleZhCn: "历史游戏", headline: "历史游戏跨期新闻", summary: "历史归档中的测试内容", platforms: ["PC"], region: "全球", factStatus: "unconfirmed", tracking: true },
] };
const render = (value = edition, english = false) => {
  document.body.innerHTML = renderToStaticMarkup(<ReadingApp initialEdition={value} initialManifest={manifest} initialSearchIndex={search} english={english} />);
};
let root: Root | undefined;

beforeEach(() => {
  vi.spyOn(loaders, "loadArchivedEdition").mockResolvedValue(calendarSnapshot as BriefEdition);
  localStorage.clear();
  window.history.replaceState(null, "", "/daily-game-brief/?view=reading");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  Object.defineProperty(window, "matchMedia", { configurable: true, value: () => ({ matches: false }) });
});
afterEach(async () => { if (root) { await act(async () => root?.unmount()); root = undefined; } document.body.innerHTML = ""; vi.restoreAllMocks(); });

describe("reading sample", () => {
  it("uses the editorial lead even when the first news item is different, without duplicating its article", () => {
    expect(edition.entries[0].id).not.toBe(edition.leadEntryId);
    expect(readingLead(edition)?.id).toBe(edition.leadEntryId);
    render();
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
    expect(document.querySelector(".r-lead article")?.id).toBe(edition.leadEntryId);
    expect(document.querySelectorAll(`article[id="${edition.leadEntryId}"]`)).toHaveLength(1);
    for (const entry of edition.entries) expect(document.querySelectorAll(`article[id="${entry.id}"]`)).toHaveLength(1);
  });

  it("preserves both dates for Daily, legacy and cross-month windows", () => {
    expect(readingWindow(edition)).toBe("2026-09-06 10:10 → 2026-09-07 10:10 (Asia/Shanghai)");
    const old = legacy as BriefEdition;
    expect(readingWindow(old)).toContain(old.windowStart);
    expect(readingWindow(old)).toContain(old.windowEnd);
    expect(readingWindow({ ...edition, windowStart: "2026-08-31 10:10", windowEnd: "2026-09-01 10:10" })).toContain("2026-08-31 10:10 → 2026-09-01 10:10");
    render();
    const note = document.querySelector("#edition-note");
    expect(note?.hasAttribute("open")).toBe(false);
    expect(note?.textContent).toContain(readingWindow(edition));
    expect(document.querySelector(".r-edition-line")?.textContent).not.toContain("计划运行");
  });

  it("keeps uncertainty visible while secondary naming and time details are collapsed", () => {
    const uncertain = { ...edition.entries[0], fact_status: "unconfirmed" as const, time_status: "date_only" as const, tracking: true };
    render({ ...edition, entries: [uncertain], leadEntryId: uncertain.id });
    const signals = document.querySelector(".r-signals")!;
    expect(signals.textContent).toContain("未经证实");
    expect(signals.textContent).toContain("仅核日期");
    expect(signals.textContent).toContain("持续跟踪");
    expect(signals.closest("details")).toBeNull();
    expect(document.querySelector(".r-evidence-panel")?.textContent).toContain(uncertain.timeNote);
    expect(document.querySelector(".r-evidence details")?.hasAttribute("open")).toBe(false);
  });

  it("renders missing media as text without a large artificial image, and keeps empty departments absent", () => {
    const entry = { ...edition.entries[0], images: undefined, imageNote: "来源没有公开可核实配图" };
    render({ ...edition, entries: [entry], leadEntryId: entry.id, upcoming: [] });
    expect(document.querySelector(".r-lead img")).toBeNull();
    expect(document.querySelector(".r-lead")?.textContent).toContain(entry.imageNote);
    expect(document.querySelectorAll(".r-department")).toHaveLength(0);
    expect(document.querySelector('nav a[href="#upcoming"]')).not.toBeNull();
    expect(document.querySelector(".r-pager")).not.toBeNull();
  });

  it("preserves archive dates, full titles and source anchors in sample links", () => {
    render();
    const row = document.querySelector<HTMLAnchorElement>(".r-archive-list a")!;
    expect(row.querySelector("time")?.textContent).toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(row.querySelector("strong")?.textContent).toBe(manifest.editions.at(-1)?.archiveTitle);
    expect(row.href).toContain("view=reading");
    expect(readingHref("2026-08-21-pm", "historical-anchor", true)).toBe("/daily-game-brief/?view=reading&edition=2026-08-21-pm&lang=en#historical-anchor");
  });

  it("preserves the calendar for historical editions, including verified source links", () => {
    const old = legacy as BriefEdition;
    expect(old.upcoming.length).toBeGreaterThan(0);
    render(old);
    expect(document.querySelectorAll(".r-calendar-item")).toHaveLength(old.upcoming.length);
    const first = document.querySelector(".r-calendar-item");
    expect(first?.querySelector("a")?.getAttribute("href")).toBe(old.upcoming[0].source.url);
    expect(first?.querySelector("h3")?.textContent).toBe(old.upcoming[0].title.title_zh_cn || old.upcoming[0].title.title_en);
    expect(document.querySelector(".r-photo--cover figcaption")).toBeNull();
  });

  it("supports theme and accent persistence, disclosure, and cross-edition search", async () => {
    const container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<ReadingApp initialEdition={edition} initialManifest={manifest} initialSearchIndex={search} />));
    const dark = container.querySelector<HTMLButtonElement>('button[aria-label="切换夜间模式"]')!;
    await act(async () => dark.click());
    expect(container.querySelector(".reading-app")?.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("brief-theme")).toBe("dark");
    const jade = container.querySelector<HTMLInputElement>('[data-color="jade"] input')!;
    await act(async () => jade.click());
    expect(localStorage.getItem("brief-accent")).toBe("jade");
    const about = container.querySelector<HTMLAnchorElement>('.r-edition-line a')!;
    await act(async () => about.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
    expect(container.querySelector<HTMLDetailsElement>("#edition-note")?.open).toBe(true);
    const input = container.querySelector<HTMLInputElement>('input[type="search"]')!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "历史游戏");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const result = container.querySelector<HTMLAnchorElement>(".r-search-result")!;
    expect(result.textContent).toContain("未经证实");
    expect(result.href).toContain("edition=2026-08-21-pm#historical-anchor");
  });

  it("replaces a failed image with an honest message while retaining the article", async () => {
    const container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<ReadingApp initialEdition={edition} initialManifest={manifest} initialSearchIndex={search} />));
    const photo = container.querySelector<HTMLImageElement>(".r-lead img")!;
    expect(photo).not.toBeNull();
    await act(async () => photo.dispatchEvent(new Event("error")));
    expect(container.querySelector(".r-lead img")).toBeNull();
    expect(container.querySelector(".r-lead .r-photo-error")?.textContent).toBe("图片暂时无法加载");
    expect(container.querySelector("h1")?.textContent).toBe(edition.archiveTitle);
  });

  it("does not silently show Chinese content when the requested English overlay is unavailable", async () => {
    vi.spyOn(loaders, "loadBriefManifest").mockResolvedValue(manifest);
    vi.spyOn(loaders, "loadLatestEdition").mockResolvedValue({ edition, source: "remote" });
    vi.spyOn(loaders, "loadEnglishLocaleIndex").mockResolvedValue({ schemaVersion: 1, locale: "en", updatedAt: edition.generatedAt, latestCanonicalEditionId: edition.id, latestAvailableEditionId: null, editions: [] });
    const overlay = vi.spyOn(loaders, "loadEnglishOverlay");
    vi.spyOn(englishLoader, "loadEnglishSearchIndex").mockResolvedValue(search);
    const container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<ReadingApp english />));
    expect(container.querySelector("h1")?.textContent).toBe("This edition is unavailable");
    expect(container.querySelector(".r-lead")).toBeNull();
    expect(container.textContent).toContain("Read in Chinese");
    expect(overlay).not.toHaveBeenCalled();
  });
  it("retains cover intrinsic ratios inside the shared frame and keeps editorial images at 16:9", () => {
    const old = legacy as BriefEdition;
    const item = old.upcoming.find((game) => game.cover)!;
    expect(item.cover).toBeDefined();
    for (const aspect of ["square", "portrait", "landscape"] as const) {
      render({ ...old, upcoming: [{ ...item, cover: { ...item.cover!, aspect } }] });
      const image = document.querySelector<HTMLImageElement>(".r-photo--cover img")!;
      const ratio = Number(image.getAttribute("width")) / Number(image.getAttribute("height"));
      expect(ratio).toBeCloseTo(aspect === "square" ? 1 : aspect === "portrait" ? 57 / 80 : 16 / 9);
      expect(image.parentElement?.style.getPropertyValue("--r-photo-aspect")).toBe(image.getAttribute("width") + " / " + image.getAttribute("height"));
    }
    render();
    const lead = document.querySelector<HTMLImageElement>(".r-lead img")!;
    expect(Number(lead.width) / Number(lead.height)).toBeCloseTo(16 / 9);
    expect(lead.getAttribute("loading")).toBe("eager");
    expect(lead.getAttribute("fetchPriority")).toBe("high");
    expect(lead.getAttribute("decoding")).toBe("async");
  });

  it("keeps icons decorative and outside keyboard order, with no text-glyph substitute", () => {
    render();
    const icons = [...document.querySelectorAll(".reading-app svg")];
    expect(icons.length).toBeGreaterThan(10);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden")).toBe("true");
      expect(icon.getAttribute("focusable")).toBe("false");
    }
    const back = document.querySelector('.r-footer a[href="#top"]')!;
    expect(back.querySelector("svg")).not.toBeNull();
    expect(back.textContent).not.toContain("↑");
  });

  it("marks media ready on load and restores focus when closing reading settings with Escape", async () => {
    const container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<ReadingApp initialEdition={edition} initialManifest={manifest} initialSearchIndex={search} />));
    const photo = container.querySelector<HTMLImageElement>(".r-lead img")!;
    await act(async () => photo.dispatchEvent(new Event("load")));
    expect(photo.dataset.loaded).toBe("true");
    const settings = container.querySelector<HTMLDetailsElement>(".r-settings")!;
    settings.open = true;
    settings.querySelector<HTMLInputElement>("input")!.focus();
    await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(settings.open).toBe(false);
    expect(document.activeElement).toBe(settings.querySelector("summary"));
  });

  it("keeps English content in the same lead and evidence structure", () => {
    const lead = readingLead(edition)!;
    const englishEdition = { ...edition, archiveTitle: "Daily | Test English headline", entries: [{ ...lead, headline: "English headline", summary: "English summary" }] };
    render(englishEdition, true);
    expect(document.querySelector("h1")?.textContent).toBe(englishEdition.archiveTitle);
    expect(document.querySelector(".r-lead-summary")?.textContent).toBe("English summary");
    expect(document.querySelector(".r-evidence summary")?.textContent).toBe("Sources & verification");
    expect(document.querySelector(".r-controls a")?.getAttribute("href")).not.toContain("lang=en");
  });
});


describe("restored release calendar", () => {
  it("filters past and out-of-window releases with cross-year dates", () => {
    const item = (calendarSnapshot as BriefEdition).upcoming[0];
    const items = ["12.30", "12.31", "01.14", "01.15", "02.30"].map((date) => ({ ...item, date }));
    expect(calendarWindow(items, "2026-12-30", "2026-12-30").map((entry) => entry.date)).toEqual(["2026-12-31", "2027-01-14"]);
    expect(calendarDate("02.30", "2026-02-01")).toBeUndefined();
    expect(calendarDate("2026-09-08", "2026-09-07")).toBe("2026-09-08");
  });

  it("uses the latest nonempty snapshot without merging superseded records", async () => {
    const snapshot = calendarSnapshot as BriefEdition;
    vi.mocked(loaders.loadArchivedEdition).mockResolvedValueOnce({ ...edition, upcoming: [] }).mockResolvedValueOnce(snapshot);
    const result = await loadReadingCalendar(edition, manifest, false);
    expect(result?.sourceId).toBe(snapshot.id);
    expect(result?.items.length).toBeGreaterThan(0);
    expect(result?.items.every((item) => item.date > "2026-09-07" && item.date <= "2026-09-22")).toBe(true);
    expect(loaders.loadArchivedEdition).toHaveBeenCalledTimes(2);
    expect(edition.upcoming).toEqual([]);
  });

  it("restores visible games and discloses their archive provenance", async () => {
    const container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<ReadingApp initialEdition={edition} initialManifest={manifest} initialSearchIndex={search} />));
    const section = container.querySelector("#upcoming")!;
    expect(section.querySelectorAll(".r-calendar-item").length).toBeGreaterThan(0);
    expect(section.textContent).toContain("本期未重新核验");
    expect(section.textContent).toContain("2026-08-31");
    expect(section.querySelector('a[href*="edition=2026-08-31-daily#upcoming"]')).not.toBeNull();
  });

  it("keeps failures distinct from an empty release calendar and supports retry", async () => {
    vi.mocked(loaders.loadArchivedEdition).mockRejectedValueOnce(new Error("network"));
    const container = document.createElement("div"); document.body.append(container);
    root = createRoot(container);
    await act(async () => root!.render(<ReadingApp initialEdition={edition} initialManifest={manifest} initialSearchIndex={search} />));
    expect(container.querySelector("#upcoming")?.textContent).toContain("暂时无法读取");
    await act(async () => container.querySelector<HTMLButtonElement>(".r-calendar-empty button")!.click());
    expect(container.querySelectorAll(".r-calendar-item").length).toBeGreaterThan(0);
  });
});


it("keeps a readable calendar item and a stable cover slot after cover load failure", async () => {
  const old = legacy as BriefEdition;
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(<ReadingApp initialEdition={old} initialManifest={manifest} initialSearchIndex={search} />));
  const image = container.querySelector<HTMLImageElement>(".r-photo--cover img")!;
  const item = image.closest(".r-calendar-item")!;
  const title = item.querySelector("h3")?.textContent;
  await act(async () => image.dispatchEvent(new Event("error")));
  expect(item.querySelector(".r-cover-unavailable")?.textContent).toContain("封面暂不可用");
  expect(item.querySelector("h3")?.textContent).toBe(title);
  expect(item.querySelector(".r-calendar-date")).not.toBeNull();
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Catchup } from "./Catchup";
import ReadingApp from "../ReadingApp";
import { catchupTopics, filterCatchup, resolveCatchupTopic } from "../lib/catchup";
import type { BriefEdition, BriefManifest, BriefSearchEntry, BriefSearchIndex, EnglishLocaleOverlay } from "../types";
import october21 from "../../public/data/archive/2026/10/2026-10-21-daily.json";
import october22 from "../../public/data/archive/2026/10/2026-10-22-daily.json";
import october23 from "../../public/data/archive/2026/10/2026-10-23-daily.json";
import october26 from "../../public/data/archive/2026/10/2026-10-26-daily.json";
import october29 from "../../public/data/archive/2026/10/2026-10-29-daily.json";
import november3 from "../../public/data/archive/2026/11/2026-11-03-daily.json";
import english21 from "../../public/data/locales/en/archive/2026/10/2026-10-21-daily.json";
import english22 from "../../public/data/locales/en/archive/2026/10/2026-10-22-daily.json";
import english23 from "../../public/data/locales/en/archive/2026/10/2026-10-23-daily.json";
import english26 from "../../public/data/locales/en/archive/2026/10/2026-10-26-daily.json";
import english29 from "../../public/data/locales/en/archive/2026/10/2026-10-29-daily.json";
import englishNovember3 from "../../public/data/locales/en/archive/2026/11/2026-11-03-daily.json";
import manifest from "../../public/data/manifest.json";

const snapshots = [october21, october22, october23, october26, october29, november3] as BriefEdition[];
const overlays = [english21, english22, english23, english26, english29, englishNovember3] as EnglishLocaleOverlay[];
const groups = [
  { canonical: "phantom-blade-zero", aliases: ["phantom blade zero", "phantom-blade-zero", "steam-4115450"], titleEn: "Phantom Blade Zero", titleZhCn: "影之刃零", ids: ["2026-10-23-daily-news-5", "2026-10-26-daily-reviews-0", "2026-10-29-daily-features-1", "2026-10-29-daily-industry-0", "2026-10-29-daily-releases-3", "2026-11-03-daily-industry-0"], distinct: ["steam-2493660", "steam-4115450-demo", "phantom-blade-executioners", "phantom-line", "phantom-line-prologue", "phantom-of-inferno", "phantom-blade-zero-2", "s-game", "Phantom-Blade-Zero", "title:phantom blade zero"] },
  { canonical: "cyberpunk-2077", aliases: ["cyberpunk-2077", "from the anime to the game free"], titleEn: "Cyberpunk 2077", titleZhCn: "赛博朋克2077", ids: ["2026-10-22-daily-news-2", "2026-10-23-daily-news-0"], distinct: ["cyberpunk-edgerunners-2", "cyberpunk-2077-phantom-liberty", "cyberpunk-2", "cd-projekt-red", "from-the-anime-to-the-game-free", "Cyberpunk-2077", "title:cyberpunk 2077"] },
];
const reviewedKeys = groups.flatMap(group => group.aliases);

// Use the archived copy and matching English overlay, not invented replacement facts.
function archivedEntries(english: boolean): BriefSearchEntry[] {
  return snapshots.flatMap((edition, i) => edition.entries.filter(story => reviewedKeys.includes(story.title.title_key) || story.title.title_key === "cyberpunk-edgerunners-2").map(story => {
    const copy = overlays[i].entries.find(item => item.entryId === story.id)!;
    expect(copy).toBeDefined();
    return { editionId: edition.id, issueNumber: edition.issueNumber, date: edition.date, period: edition.period, entryId: story.id, titleKey: story.title.title_key, titleEn: story.title.title_en, titleZhCn: story.title.title_zh_cn, titleStatus: story.title.title_zh_status, headline: english ? copy.headline : story.headline, summary: english ? copy.summary : story.summary, factStatus: story.fact_status, section: story.section, platforms: story.platforms, region: story.region, tracking: story.tracking };
  }));
}

let root: Root | undefined;
beforeEach(() => {
  document.body.innerHTML = '<div id="root"></div>';
  window.history.replaceState(null, "", "/daily-game-brief/?catchup=1&cuDays=all");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
});
afterEach(async () => { if (root) await act(async () => root!.unmount()); root = undefined; vi.restoreAllMocks(); });

it.each(groups.flatMap(group => group.aliases.flatMap(alias => [false, true].map(english => ({ group, alias, english })))))("joins the reviewed $alias history with original copy and anchors (English=$english)", async ({ group, alias, english }) => {
  const entries = archivedEntries(english);
  const before = structuredClone(entries);
  const url = new URL(window.location.href);
  url.searchParams.set("cuTopic", alias);
  if (english) url.searchParams.set("lang", "en");
  window.history.replaceState(null, "", url);
  const index: BriefSearchIndex = { schemaVersion: 1, updatedAt: "2026-11-07", entries };
  root = createRoot(document.getElementById("root")!);
  await act(async () => root!.render(<Catchup index={index} english={english} error={false} onRetry={() => {}} onClose={() => {}} />));
  expect(document.querySelector("select")?.value).toBe(group.canonical);
  expect([...document.querySelectorAll("option")].filter(option => group.aliases.includes(option.value))).toHaveLength(1);
  expect(document.querySelector(".cu-results-heading h2")?.textContent).toBe(english ? group.titleEn : group.titleZhCn);
  expect(document.querySelectorAll(".cu-story")).toHaveLength(group.ids.length);
  const links = [...document.querySelectorAll<HTMLAnchorElement>(".cu-story-links a")];
  expect(links.map(link => new URL(link.href).hash.slice(1))).toEqual(group.ids);
  links.forEach(link => {
    const target = new URL(link.href);
    const original = entries.find(item => item.entryId === target.hash.slice(1))!;
    expect(target.searchParams.get("edition")).toBe(original.editionId);
    expect(target.searchParams.get("lang")).toBe(english ? "en" : null);
    const labels: Record<string, string> = english
      ? { official: "Official", media_report: "Media report", media_relay_official: "Reported official statement" }
      : { official: "官方消息", media_report: "媒体报道", media_relay_official: "媒体转述官方" };
    expect(link.closest(".cu-story")?.querySelector(".cu-story-meta > span:last-child")?.textContent).toBe(labels[original.factStatus]);
    expect(document.querySelector(".cu-timeline")?.textContent).toContain(original.headline);
    expect(document.querySelector(".cu-timeline")?.textContent).toContain(original.summary);
  });
  expect(document.querySelector(".cu-timeline")?.textContent).toContain(english ? "Reported official statement" : "媒体转述官方");
  expect(document.querySelector(".cu-timeline")?.textContent).toContain(english ? "Official" : "官方消息");
  const copy = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  const copyButton = [...document.querySelectorAll("button")].find(button => button.textContent === (english ? "Copy catch-up link" : "复制这份补课"))!;
  await act(async () => copyButton.click());
  const shared = new URL(copy.mock.calls[0][0]);
  expect(shared.searchParams.get("cuTopic")).toBe(group.canonical);
  expect(shared.searchParams.get("cuFrom")).toBe("2026-10-21");
  expect(shared.searchParams.get("cuTo")).toBe("2026-11-03");
  expect(shared.searchParams.get("lang")).toBe(english ? "en" : null);
  expect(entries).toEqual(before);
});

it.each(groups.flatMap(group => [false, true].map(english => ({ group, english }))))("keeps unreviewed entities separate from $group.canonical even with identical names (English=$english)", ({ group, english }) => {
  const originals = archivedEntries(english);
  const synthetic = group.distinct.map(titleKey => ({ ...originals[0], titleKey, titleEn: group.titleEn, titleZhCn: group.titleZhCn }));
  const range = { start: "2026-10-21", end: "2026-11-07" };
  for (const key of group.distinct) expect(resolveCatchupTopic(key)).toBe(key);
  const filtered = filterCatchup([...originals, ...synthetic], { ...range, topic: group.canonical });
  expect(filtered.map(story => story.entryId)).toEqual(group.ids);
  expect(catchupTopics(synthetic, english)).toHaveLength(group.distinct.length);
  const anime = originals.filter(story => story.titleKey === "cyberpunk-edgerunners-2");
  expect(anime).toHaveLength(1);
  expect(filterCatchup(originals, { ...range, topic: "cyberpunk-edgerunners-2" })).toEqual(anime);
  expect(filterCatchup(originals, { start: "2026-10-29", end: "2026-10-29", topic: "steam-4115450" })).toHaveLength(3);
  expect(filterCatchup(originals, { start: "2026-10-23", end: "2026-10-23", topic: "from the anime to the game free" }).map(story => story.entryId)).toEqual(["2026-10-23-daily-news-0"]);
});

it.each([false, true])("links all eight original articles to their own reviewed topic without changing archives (English=%s)", english => {
  window.history.replaceState(null, "", "/daily-game-brief/?view=reading");
  const before = structuredClone(snapshots);
  let checked = 0;
  for (const edition of snapshots) {
    document.body.innerHTML = renderToStaticMarkup(<ReadingApp initialEdition={edition} initialManifest={manifest as BriefManifest} english={english} />);
    for (const story of edition.entries) {
      const group = groups.find(item => item.aliases.includes(story.title.title_key));
      if (!group) continue;
      const link = document.querySelector<HTMLAnchorElement>(`article[id="${story.id}"] .r-topic-link`)!;
      const href = new URL(link.href);
      expect(href.searchParams.get("cuTopic")).toBe(group.canonical);
      expect(href.searchParams.get("edition")).toBe(edition.id);
      expect(href.searchParams.get("lang")).toBe(english ? "en" : null);
      checked += 1;
    }
  }
  expect(checked).toBe(8);
  expect(snapshots).toEqual(before);
});

import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { edition } from "./data/brief";
import type { BriefManifest, BriefSearchIndex } from "./types";

vi.hoisted(() => {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }),
  });
});

const manifest: BriefManifest = {
  schemaVersion: 1,
  updatedAt: edition.generatedAt,
  latest: edition.id,
  editions: [
    {
      archiveTitle: "早报｜《GTA VI》泄漏片段疑云升级",
      leadEntryId: "2026-08-21-am-rumors-0",
      id: "2026-08-21-am",
      issueNumber: 1,
      date: "2026-08-21",
      period: "am",
      generatedAt: "2026-08-21 10:12",
      revised: false,
      path: "archive/2026/08/2026-08-21-am.json",
    },
    {
      archiveTitle: "晚报｜《潜行者2》大型扩展与2.0更新上线",
      leadEntryId: "2026-08-21-pm-releases-2",
      id: edition.id,
      issueNumber: edition.issueNumber,
      date: edition.date,
      period: edition.period,
      generatedAt: edition.generatedAt,
      revised: false,
      path: "archive/2026/08/" + edition.id + ".json",
    },
  ],
};

const searchIndex: BriefSearchIndex = {
  schemaVersion: 1,
  updatedAt: edition.generatedAt,
  entries: [{
    editionId: "2026-08-21-am",
    issueNumber: 1,
    date: "2026-08-21",
    period: "am",
    entryId: "archive-story",
    titleZhCn: "跨期测试游戏",
    titleEn: "Archive Test Game",
    headline: "跨期搜索可以打开原始早报",
    summary: "这是用于验证归档搜索直达能力的新闻内容。",
    platforms: ["PC"],
    region: "全球",
    factStatus: "official",
  }],
};

describe("brief page regression", () => {
  beforeEach(() => {
    document.body.innerHTML = renderToStaticMarkup(
      <App initialTheme="light" />,
    );
  });

  it("keeps a single editorial page heading and removes the former slogans", () => {
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.body.textContent).not.toContain("简报方法");
    expect(document.body.textContent).not.toContain(
      "发售、评分、新闻、产业与深读，浓缩成一份可追溯的一手简报。",
    );
    expect(document.body.textContent).not.toContain(
      "读者不必相信我们，只需沿着证据返回原文。",
    );
  });

  it("renders publication chrome, theme control, directory, about, and footer", () => {
    expect(document.querySelector("header.topbar")).not.toBeNull();
    expect(document.querySelector(".site-shell")?.getAttribute("data-theme")).toBe("light");
    expect(document.querySelector('button[aria-label="切换到夜间模式"]')).not.toBeNull();
    expect(document.querySelector(".edition-directory")).not.toBeNull();
    expect(document.querySelector("#about")).not.toBeNull();
    expect(document.querySelector("footer.site-footer")).not.toBeNull();
  });

  it("omits empty editorial departments from content and directory", () => {
    const newsOnlyEdition = {
      ...edition,
      entries: edition.entries.map((entry) => ({ ...entry, section: "news" as const })),
    };
    document.body.innerHTML = renderToStaticMarkup(
      <App initialEdition={newsOnlyEdition} initialTheme="dark" />,
    );

    expect(document.querySelector("#news")).not.toBeNull();
    expect(document.querySelector("#releases")).toBeNull();
    expect(document.querySelector("#reviews")).toBeNull();
    expect(document.querySelector('.edition-directory a[href="#releases"]')).toBeNull();
    expect(document.body.textContent).not.toContain("本时段未发现可靠新增");
  });

  it("renders an editorial image slot for every story", () => {
    const stories = [...document.querySelectorAll<HTMLElement>(".story-row")];

    expect(stories).toHaveLength(edition.entries.length);
    for (const story of stories) {
      expect(story.id).not.toBe("");
      expect(story.querySelector(".media-slot--editorial > img")).not.toBeNull();
    }
  });

  it("renders a cover image slot for every upcoming game", () => {
    const upcomingGames = [
      ...document.querySelectorAll<HTMLElement>(".upcoming-item"),
    ];

    expect(upcomingGames).toHaveLength(edition.upcoming.length);
    for (const game of upcomingGames) {
      expect(game.querySelector(".media-slot--cover > img")).not.toBeNull();
    }
  });

  it("lists editions instead of current entries and links search results to source briefs", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <App
        initialManifest={manifest}
        initialSearchIndex={searchIndex}
        initialTheme="light"
        initialQuery="跨期"
      />,
    );

    expect(document.querySelectorAll(".archive-edition-list > a")).toHaveLength(2);
    const editionTitles = [
      ...document.querySelectorAll<HTMLElement>(".archive-edition-list strong"),
    ].map((node) => node.textContent);
    expect(editionTitles).toContain("早报｜《GTA VI》泄漏片段疑云升级");
    expect(editionTitles).toContain("晚报｜《潜行者2》大型扩展与2.0更新上线");
    expect(editionTitles).not.toContain("游戏早报");
    expect(editionTitles).not.toContain("游戏晚报");
    expect(document.querySelectorAll(".archive-search-results > a")).toHaveLength(1);
    const result = document.querySelector<HTMLAnchorElement>(".archive-search-results > a");
    expect(result?.getAttribute("href")).toContain("edition=2026-08-21-am");
    expect(result?.getAttribute("href")).toContain("#archive-story");
  });
});

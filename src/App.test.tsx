import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { edition } from "./data/brief";
import type { BriefManifest, BriefSearchIndex } from "./types";

vi.mock("@gsap/react", () => ({ useGSAP: () => undefined }));
vi.mock("gsap", () => ({
  default: {
    registerPlugin: () => undefined,
    from: () => undefined,
    utils: { toArray: () => [] },
  },
}));
vi.mock("gsap/ScrollTrigger", () => ({ ScrollTrigger: {} }));

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
    tracking: true,
  }],
};

describe("brief page regression", () => {
  beforeEach(() => {
    document.body.innerHTML = renderToStaticMarkup(
      <App initialTheme="light" />,
    );
  });

  it("uses the distinctive archive title as the single page heading", () => {
    expect(document.querySelectorAll("h1")).toHaveLength(1);
    expect(document.querySelector("h1")?.textContent).toMatch(/^晚报｜.+/);
    expect(document.querySelector("h1")?.textContent).not.toBe("游戏晚报");
    expect(document.body.textContent).not.toContain("简报方法");
    expect(document.body.textContent).not.toContain(
      "发售、评分、新闻、产业与深读，浓缩成一份可追溯的一手简报。",
    );
    expect(document.body.textContent).not.toContain(
      "读者不必相信我们，只需沿着证据返回原文。",
    );
    expect(document.body.textContent).not.toContain("ABOUT / 关于");
    expect(document.body.textContent).not.toContain("出版信息");
  });

  it("renders topbar controls, directory, and a single publication footer", () => {
    expect(document.querySelector("header.topbar")).not.toBeNull();
    expect(document.querySelector(".site-shell")?.getAttribute("data-theme")).toBe("light");
    expect(document.querySelector(".site-shell")?.getAttribute("data-accent")).toBe("orange");
    expect(document.querySelector('button[aria-label="切换到夜间模式"]')).not.toBeNull();
    expect(document.querySelector('button[aria-controls="accent-options"]')).not.toBeNull();
    expect(document.querySelector(".edition-directory")).not.toBeNull();
    expect(document.querySelector(".publication-strip")).toBeNull();
    expect(document.querySelector("#about")).toBeNull();
    expect(document.querySelector('nav a[href="#about"]')).toBeNull();
    expect([...document.querySelectorAll("nav a")].map((link) => link.textContent)).toEqual(["\u5185\u5bb9", "\u65e5\u5386", "\u5f52\u6863"]);
    expect(document.querySelector('nav a[href="#content"]')).not.toBeNull();
    expect(document.querySelector("#content")).not.toBeNull();
    expect(document.querySelector(".edition-masthead__title > span")?.textContent).toBe("DAILY EDITION");
    expect(document.querySelector("footer.site-footer")).not.toBeNull();
  });

  it("renders five named accent choices with an explicit selected state", () => {
    document.body.innerHTML = renderToStaticMarkup(
      <App initialTheme="dark" initialAccent="violet" />,
    );

    expect(document.querySelector(".site-shell")?.getAttribute("data-accent")).toBe("violet");
    expect(document.querySelectorAll('.accent-option[role="radio"]')).toHaveLength(5);
    expect(document.querySelector('.accent-option--violet')?.getAttribute("aria-checked")).toBe("true");
    expect(document.body.textContent).toContain("熔岩橙");
    expect(document.body.textContent).toContain("钴蓝");
    expect(document.body.textContent).toContain("松石绿");
    expect(document.body.textContent).toContain("暮紫");
    expect(document.body.textContent).toContain("\u6a31\u7c89");
  });

  it("integrates pending items into lead, focus, and section cards without a tracking board", () => {
    const pendingEdition = {
      ...edition,
      entries: edition.entries.map((entry, index) => ({
        ...entry,
        tracking: index < 2 ? true : undefined,
      })),
    };
    document.body.innerHTML = renderToStaticMarkup(
      <App initialEdition={pendingEdition} initialTheme="light" />,
    );

    expect(document.querySelector("#tracking")).toBeNull();
    expect(document.body.textContent).not.toContain("\u4ecd\u9700\u8ffd\u8e2a");
    expect(document.body.textContent).not.toContain(edition.tracking[0]);
    expect(document.querySelectorAll(".lead-story .pending-mark")).toHaveLength(1);
    expect(document.querySelectorAll(".focus-item .pending-mark")).toHaveLength(1);
    expect(document.querySelectorAll(".story-row .pending-mark")).toHaveLength(2);
    expect(
      [...document.querySelectorAll(".pending-mark")].every(
        (mark) => mark.textContent === "\u4ecd\u5f85\u786e\u8ba4",
      ),
    ).toBe(true);

    const sectionNumbers = [
      ...document.querySelectorAll<HTMLElement>(
        ".desk-label > span, .edition-content .section-header > span, .archive-section > header > span",
      ),
    ].map((node) => node.textContent);
    expect(sectionNumbers).toEqual(
      sectionNumbers.map((_, index) => String(index + 1).padStart(2, "0")),
    );
  });

  it("does not render a pending mark for false or missing tracking fields", () => {
    const settledEdition = {
      ...edition,
      entries: edition.entries.map((entry, index) => ({
        ...entry,
        tracking: index === 0 ? false : undefined,
      })),
    };
    document.body.innerHTML = renderToStaticMarkup(
      <App initialEdition={settledEdition} initialTheme="dark" />,
    );

    expect(document.querySelectorAll(".pending-mark")).toHaveLength(0);
    expect(document.querySelector("#tracking")).toBeNull();
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
      expect(story.querySelector(".story-identity__primary")).not.toBeNull();
    }
  });

  it("renders a cover image slot for every upcoming game", () => {
    const upcomingGames = [
      ...document.querySelectorAll<HTMLElement>(".upcoming-item"),
    ];

    expect(upcomingGames).toHaveLength(edition.upcoming.length);
    for (const game of upcomingGames) {
      expect(game.querySelector(".media-slot--cover > img")).not.toBeNull();
      expect(game.querySelector(".media-slot--cover figcaption")).toBeNull();
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
    expect(document.querySelector("h1")?.textContent).toBe("晚报｜《潜行者2》大型扩展与2.0更新上线");
    expect(document.querySelectorAll(".archive-search-results > a")).toHaveLength(1);
    const result = document.querySelector<HTMLAnchorElement>(".archive-search-results > a");
    expect(result?.querySelector(".pending-mark")?.textContent).toBe("\u4ecd\u5f85\u786e\u8ba4");
    expect(result?.getAttribute("href")).toContain("edition=2026-08-21-am");
    expect(result?.getAttribute("href")).toContain("#archive-story");
  });

  it("keeps the archive compact by showing only the latest five editions", () => {
    const extendedManifest: BriefManifest = {
      ...manifest,
      editions: Array.from({ length: 7 }, (_, index) => ({
        ...manifest.editions[0],
        id: `2026-08-${String(20 + index).padStart(2, "0")}-am`,
        issueNumber: index + 1,
        date: `2026-08-${String(20 + index).padStart(2, "0")}`,
        archiveTitle: `早报｜第${index + 1}期归档测试标题`,
        path: `archive/2026/08/archive-${index + 1}.json`,
      })),
    };

    document.body.innerHTML = renderToStaticMarkup(
      <App initialManifest={extendedManifest} initialTheme="light" />,
    );

    expect(document.querySelectorAll(".archive-edition-list > a")).toHaveLength(5);
    const toggle = document.querySelector<HTMLButtonElement>(".archive-toggle");
    expect(toggle?.textContent).toContain("展开其余2期");
    expect(toggle?.getAttribute("aria-expanded")).toBe("false");
    expect(toggle?.getAttribute("aria-controls")).toBe("archive-edition-list");
  });
});

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import { edition } from "./data/brief";

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

describe("Daily edition presentation", () => {
  it("shows the Daily cadence without rewriting legacy AM/PM footer copy", () => {
    const dailyEdition = {
      ...edition,
      id: "2026-09-01-daily",
      date: "2026-09-01",
      period: "daily" as const,
      plannedAt: "2026-09-01 12:00",
      windowStart: "2026-08-31 10:10",
      windowEnd: "2026-09-01 10:10",
      nextEditionAt: "2026-09-02 12:00",
      archiveTitle: "日报｜Daily UI regression",
    };

    document.body.innerHTML = renderToStaticMarkup(
      <App initialEdition={dailyEdition} initialTheme="light" />,
    );

    expect(document.querySelector(".topbar__edition")?.textContent).toContain("DAILY");
    expect(document.querySelector("h1")?.textContent).toBe("日报｜Daily UI regression");
    expect(document.querySelector("footer.site-footer")?.textContent).toContain("每天一期，整理值得核验的游戏行业动态。");
    expect(document.querySelector("footer.site-footer")?.textContent).toContain("北京时间 12:00 更新");
    expect(document.querySelector("footer.site-footer")?.textContent).not.toContain("每天两次");
    expect(document.querySelector("footer.site-footer")?.textContent).not.toContain("10:10 / 17:00");

    document.body.innerHTML = renderToStaticMarkup(
      <App initialEdition={edition} initialTheme="light" />,
    );
    expect(document.querySelector("footer.site-footer")?.textContent).toContain("每天两次，整理值得核验的游戏行业动态。");
    expect(document.querySelector("footer.site-footer")?.textContent).toContain("北京时间 10:10 / 17:00 更新");
  });
});

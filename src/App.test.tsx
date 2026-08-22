import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import { edition } from "./data/brief";
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

describe("brief page regression", () => {
  beforeEach(() => {
    document.body.innerHTML = renderToStaticMarkup(<App />);
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

  it("renders the publication chrome, directory, about information, and footer", () => {
    expect(document.querySelector("header.topbar")).not.toBeNull();
    expect(document.querySelector(".edition-directory")).not.toBeNull();
    expect(document.querySelector("#about")).not.toBeNull();
    expect(document.querySelector("footer.site-footer")).not.toBeNull();
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
});

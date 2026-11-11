import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { UpcomingItem as ChineseItem } from "./App";
import { UpcomingItem as EnglishItem } from "./EnglishApp";
import { calendarCards } from "./lib/calendar-cards";
import fixture from "../public/data/archive/2026/11/2026-11-11-daily.json";
import type { UpcomingEntry } from "./types";

vi.mock("./lib/useEditorialMotion", () => ({ useEditorialMotion: () => undefined }));

describe("classic calendar grouping", () => {
  it("keeps both platform source rows beneath one title in both classic views", () => {
    const rows = (fixture.upcoming as UpcomingEntry[]).filter(item => item.title.title_key === "where-winds-meet");
    const group = calendarCards(rows)[0];
    for (const Component of [ChineseItem, EnglishItem]) {
      document.body.innerHTML = renderToStaticMarkup(<Component {...group} />);
      expect(document.querySelectorAll(".upcoming-item")).toHaveLength(1);
      expect(document.querySelectorAll("h3")).toHaveLength(1);
      expect(document.querySelectorAll(".upcoming-item__body > .calendar-platform-record > div")).toHaveLength(2);
      expect(document.querySelectorAll(".upcoming-item__body > .calendar-platform-record > a svg")).toHaveLength(2);
      for (const row of rows) {
        const el = document.querySelector(`[data-calendar-record="${row.id}"]`)!;
        expect(el.textContent).toContain(row.platforms[0]);
        expect(el.textContent).toContain(row.releaseType);
        expect(el.querySelector("a")?.getAttribute("href")).toBe(row.source.url);
      }
    }
  });
});

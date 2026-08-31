import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const packetWorkflow = await readFile(".github/workflows/news-discovery-shadow.yml", "utf8");
const slaWorkflow = await readFile(".github/workflows/brief-sla-watchdog.yml", "utf8");
const publisherWorkflow = await readFile(".github/workflows/publish-editorial-decision.yml", "utf8");
const mediaWorkflow = await readFile(".github/workflows/media-enrichment.yml", "utf8");
const chineseApp = await readFile("src/App.tsx", "utf8");
const englishApp = await readFile("src/EnglishApp.tsx", "utf8");
const styles = await readFile("src/styles.css", "utf8");

describe("Daily Edition precutover workflow and presentation contract", () => {
  it("keeps every legacy scheduled cron while exposing Daily only to manual inputs", () => {
    expect(packetWorkflow).toContain('- cron: "10 2 * * *"');
    expect(packetWorkflow).toContain('- cron: "0 9 * * *"');
    expect(slaWorkflow).toContain('- cron: "0 3 * * *"');
    expect(slaWorkflow).toContain('- cron: "50 9 * * *"');
    expect(mediaWorkflow).toContain('- cron: "10 3 * * *"');
    expect(mediaWorkflow).toContain('- cron: "0 10 * * *"');

    expect(packetWorkflow).toContain("          - daily");
    expect(slaWorkflow).toContain("          - daily");
    expect(packetWorkflow).toContain("github.event.schedule == '10 2 * * *' && 'am' || 'pm'");
    expect(slaWorkflow).toContain("github.event.schedule == '0 3 * * *' && 'am' || 'pm'");
    expect(packetWorkflow).not.toContain("period=\"daily\"");
  });

  it("accepts Daily exact-edition publication and media identities without a Daily schedule", () => {
    expect(publisherWorkflow).toContain("(am|pm|daily)");
    expect(mediaWorkflow).toContain("(am|pm|daily)");
    expect(mediaWorkflow.match(/- cron:/g)).toHaveLength(2);
  });

  it("renders Daily labels while preserving legacy copy until Daily exists in the manifest", () => {
    expect(chineseApp).toContain('daily: { edition: "日报", english: "DAILY", nextTime: "明日 17:00", nextEdition: "游戏日报" }');
    expect(chineseApp).toContain('hasDailyHistory ? "往期简报" : "往期早晚报"');
    expect(chineseApp).toContain('hasDailyHistory ? "每日整理值得核验的游戏行业动态。" : "每天两次，整理值得核验的游戏行业动态。"');
    expect(englishApp).toContain('daily: { edition: "Daily Brief", short: "DAILY", nextTime: "Tomorrow 17:00", nextEdition: "Daily Brief" }');
    expect(englishApp).toContain('hasDailyHistory ? "Daily, evidence-checked video-game industry news." : "Twice-daily, evidence-checked video-game industry news."');
  });

  it("retains responsive, theme and keyboard-visible styling for a 390px viewport", () => {
    // The existing 820px responsive breakpoint covers the required 390px acceptance viewport.
    expect(styles).toMatch(/@media\s*\(max-width:\s*820px\)/);
    expect(styles).toContain("color-scheme: dark");
    expect(styles).toContain(':root[data-theme="light"]');
    expect(styles).toContain(":focus-visible");
  });
});

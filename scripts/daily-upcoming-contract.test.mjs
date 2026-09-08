import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const contract = await readFile("docs/SCHEDULED_TASK_PROMPT.md", "utf8");
const editorialize = await readFile("scripts/editorialize.mjs", "utf8");
const publisher = await readFile("scripts/publish-editorial-decision.mjs", "utf8");

describe("Daily rolling upcoming contract", () => {
  it("uses inherit-and-patch instead of destructive Daily replacement", () => {
    expect(contract).toContain('Daily uses `upcomingMode:"inherit_and_patch"`');
    expect(contract).toContain("carries the newest verified Canonical calendar forward");
    expect(contract).toContain("strict future-15-day window");
    expect(editorialize).toContain("日报必须使用 upcomingMode=inherit_and_patch");
    expect(editorialize).toContain("不要因为本次 packet 没有新的发售证据而提交空表覆盖历史");
  });

  it("restores the baseline in trusted publisher code, not in the model", () => {
    expect(publisher).toContain("loadCanonicalUpcomingBaseline");
    expect(publisher).toContain('packet?.editorialInput?.window?.period === "daily"');
    expect(publisher).toContain('editorial.upcomingMode === "inherit_and_patch"');
    expect(publisher).toContain("publisherLatest = { ...latest, upcoming: baseline.items }");
  });
});

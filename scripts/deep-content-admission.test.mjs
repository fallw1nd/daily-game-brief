import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";

const editorialize = await readFile("scripts/editorialize.mjs", "utf8");

describe("deep-content editorial admission", () => {
  it("allows substantive deep content by publication time without relaxing old-event truth boundaries", () => {
    expect(editorialize).toContain("lane=interviews、features、industry、reviews、awards");
    expect(editorialize).toContain("首次发布的时间");
    expect(editorialize).toContain("明确的信息增量");
    expect(editorialize).toContain("普通观点、推荐、促销软文、无新增信息的旧闻复述仍应 exclude");
    expect(editorialize).toContain("不得把窗口外旧事件伪装成窗口内 breaking news");
  });
});

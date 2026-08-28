import { describe, expect, it } from "vitest";
import { selectTitleHintSubjects, validateTitleHintCandidate } from "./lib/title-hints.mjs";

function pkg(subjectKey, eventKind = "announcement") {
  return { subjectKey, eventKind, headline: `${subjectKey} test event` };
}

function source(url, pageText, extra = {}) {
  return {
    url,
    pageText,
    label: extra.label || new URL(url).hostname,
    pageTitle: extra.pageTitle || "",
    excerpt: extra.excerpt || "",
  };
}

describe("title hint subject selection", () => {
  it("does not search titles already registered, including the 2026-08-28 regressions", () => {
    const evidence = {
      packages: [
        pkg("Gravhounds"),
        pkg("Militsioner"),
        pkg("Whisper of the House"),
        pkg("FOUNTAINS"),
        pkg("FINAL FANTASY VII EVER CRISIS"),
      ],
    };

    expect(selectTitleHintSubjects(evidence)).toEqual([]);
  });

  it("selects only unique unregistered English game subjects and ignores company subjects", () => {
    const evidence = {
      packages: [
        pkg("Unregistered Example Game"),
        pkg("Unregistered Example Game", "release"),
        pkg("Example Holdings", "company"),
        pkg("中文游戏"),
      ],
    };

    expect(selectTitleHintSubjects(evidence)).toEqual([
      {
        subjectKey: "Unregistered Example Game",
        titleKey: "unregistered-example-game",
        headline: "Unregistered Example Game test event",
        eventKind: "announcement",
      },
    ]);
  });
});

describe("title hint candidate verification", () => {
  const subject = { subjectKey: "Unregistered Example Game", titleKey: "unregistered-example-game" };

  it("accepts an official Simplified Chinese candidate only when an opened page contains the name", () => {
    const hint = validateTitleHintCandidate(subject, {
      titleZhCn: "示例游戏",
      suggestedStatus: "official_simplified",
      reason: "Official store page uses this title.",
    }, [source("https://store.example.com/game", `${"页面前文。".repeat(80)}欢迎来到《示例游戏》的官方页面。`)]);

    expect(hint).toMatchObject({
      titleZhCn: "示例游戏",
      suggestedStatus: "official_simplified",
      sources: [{ hostname: "store.example.com" }],
    });
    expect(hint.sources[0]).not.toHaveProperty("pageText");
    expect(hint.sources[0].excerpt).toContain("示例游戏");
    expect(hint.sources[0].excerpt.length).toBeLessThanOrEqual(320);
  });

  it("requires two independent verified hosts for a common translation", () => {
    const candidate = {
      titleZhCn: "示例译名",
      suggestedStatus: "common_translation",
      reason: "Stable media usage.",
    };

    expect(validateTitleHintCandidate(subject, candidate, [
      source("https://media-a.example/game", "我们称本作为《示例译名》。"),
      source("https://media-a.example/preview", "《示例译名》试玩。"),
    ])).toBeNull();

    expect(validateTitleHintCandidate(subject, candidate, [
      source("https://media-a.example/game", "我们称本作为《示例译名》。"),
      source("https://media-b.example/preview", "《示例译名》试玩。"),
    ])).toMatchObject({ titleZhCn: "示例译名", suggestedStatus: "common_translation" });
  });

  it("rejects invented, non-Chinese, unsupported-status, and unverified candidates", () => {
    expect(validateTitleHintCandidate(subject, {
      titleZhCn: "凭空译名",
      suggestedStatus: "official_simplified",
    }, [source("https://store.example.com/game", "This page never contains the proposed Chinese title.")])).toBeNull();

    expect(validateTitleHintCandidate(subject, {
      titleZhCn: "Example Game",
      suggestedStatus: "official_simplified",
    }, [source("https://store.example.com/game", "Example Game")])).toBeNull();

    expect(validateTitleHintCandidate(subject, {
      titleZhCn: "示例游戏",
      suggestedStatus: "machine_translation",
    }, [source("https://store.example.com/game", "示例游戏")])).toBeNull();
  });

  it.each([
    ["Gravhounds", "重力猎犬", "common_translation", ["https://media-a.example/gravhounds", "https://media-b.example/gravhounds"]],
    ["Militsioner", "警目如炬", "official_simplified", ["https://store.example.com/militsioner"]],
    ["Whisper of the House", "呓语小镇", "official_simplified", ["https://store.example.com/whisper"]],
    ["FOUNTAINS", "永泉传说", "official_simplified", ["https://store.example.com/fountains"]],
    ["FINAL FANTASY VII EVER CRISIS", "最终幻想7：永恒危机", "official_simplified", ["https://store.example.com/ff7ec"]],
  ])("validates known regression evidence for %s", (subjectKey, titleZhCn, suggestedStatus, urls) => {
    const knownSubject = { subjectKey, titleKey: subjectKey.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") };
    const verified = urls.map((url) => source(url, `页面明确使用《${titleZhCn}》作为作品名称。`));
    expect(validateTitleHintCandidate(knownSubject, {
      titleZhCn,
      suggestedStatus,
      reason: "Regression fixture",
    }, verified)).toMatchObject({ titleZhCn, suggestedStatus });
  });
});

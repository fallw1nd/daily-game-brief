import { describe, expect, it } from "vitest";
import { localizeHeadline, resolveTitleTranslation } from "./lib/title-translations.mjs";

describe("Chinese title translation fallback", () => {
  it("uses a registered title when editorial output is unavailable", () => {
    expect(resolveTitleTranslation({
      titleKey: "fable",
      titleZhCn: null,
      titleZhStatus: "unavailable",
      titleEn: "Fable",
    })).toMatchObject({
      titleZhCn: "神鬼寓言",
      titleZhStatus: "official_simplified",
      source: "registry",
    });
  });

  it("preserves an explicit editorial translation", () => {
    expect(resolveTitleTranslation({
      titleKey: "fable",
      titleZhCn: "编辑确认名",
      titleZhStatus: "common_translation",
      titleEn: "Fable",
    })).toMatchObject({
      titleZhCn: "编辑确认名",
      titleZhStatus: "common_translation",
      source: "editorial",
    });
  });

  it("keeps the original title when no registered Chinese name exists", () => {
    expect(resolveTitleTranslation({
      titleKey: "unknown-untranslated-game",
      titleZhCn: null,
      titleZhStatus: "unavailable",
      titleEn: "Unknown Untranslated Game",
    })).toMatchObject({
      titleZhCn: null,
      titleZhStatus: "unavailable",
      source: "original",
    });
  });

it("resolves a registered alias even when the generated title key differs", () => {
  expect(resolveTitleTranslation({ titleKey: "generated-key-that-differs", titleZhCn: null, titleZhStatus: "unavailable", titleEn: "Alien Isolation 2" })).toMatchObject({
    titleZhCn: "异形：隔离 2", titleZhStatus: "official_simplified", source: "registry",
  });
});

it("localizes exact and combined English game subjects in headlines", () => {
  expect(localizeHeadline("《Fallout 76》首次开放测试", { titleEn: "Fallout 76", titleZhCn: "辐射76" })).toBe("《辐射76》首次开放测试");
  expect(localizeHeadline("Capcom公开《Mega Man: Dual Override》与《Dragon’s Dogma 2: Dark Arisen》试玩", {
    titleEn: "Mega Man: Dual Override / Dragon’s Dogma 2: Dark Arisen",
    titleZhCn: "洛克人：双重超控 / 龙之信条2：黑暗觉者",
  })).toBe("Capcom公开《洛克人：双重超控》与《龙之信条2：黑暗觉者》试玩");
});

});

import { describe, expect, it } from "vitest";
import { resolveTitleTranslation } from "./lib/title-translations.mjs";

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
});

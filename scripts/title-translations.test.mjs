import { describe, expect, it } from "vitest";
import {
  getRegisteredTitleTranslation,
  localizeHeadline,
  localizeRegisteredTitles,
  resolveTitleTranslation,
} from "./lib/title-translations.mjs";

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
    expect(resolveTitleTranslation({
      titleKey: "generated-key-that-differs",
      titleZhCn: null,
      titleZhStatus: "unavailable",
      titleEn: "Alien Isolation 2",
    })).toMatchObject({
      titleZhCn: "异形：隔离 2",
      titleZhStatus: "official_simplified",
      source: "registry",
    });
  });

  it("localizes exact and combined English game subjects in headlines", () => {
    expect(localizeHeadline("《Fallout 76》首次开放测试", {
      titleEn: "Fallout 76",
      titleZhCn: "辐射76",
    })).toBe("《辐射76》首次开放测试");
    expect(localizeHeadline("Capcom公开《Mega Man: Dual Override》与《Dragon’s Dogma 2: Dark Arisen》试玩", {
      titleEn: "Mega Man: Dual Override / Dragon’s Dogma 2: Dark Arisen",
      titleZhCn: "洛克人：双重超控 / 龙之信条2：黑暗觉者",
    })).toBe("Capcom公开《洛克人：双重超控》与《龙之信条2：黑暗觉者》试玩");
  });

  it("uses structured subject context for a single-word headline title without consuming unknown sequels", () => {
    expect(localizeHeadline("Fountains 发布首支预告", {
      titleEn: "Fountains",
      titleZhCn: "永泉传说",
    })).toBe("永泉传说 发布首支预告");
    expect(localizeHeadline("《Diablo VI》消息", {
      titleEn: "Diablo",
      titleZhCn: "暗黑破坏神",
    })).toBe("《Diablo VI》消息");
    expect(localizeHeadline("《FOUNTAINS2》消息", {
      titleEn: "FOUNTAINS",
      titleZhCn: "永泉传说",
    })).toBe("《FOUNTAINS2》消息");
    expect(localizeHeadline("EXODUS：公布更新", {
      titleEn: "EXODUS",
      titleZhCn: "出埃及记",
    })).toBe("出埃及记：公布更新");
  });
});

describe("registered title copy localization", () => {
  it("resolves the supplied current-edition titles", () => {
    expect(getRegisteredTitleTranslation("whisper-of-the-house", "Whisper of the House")?.titleZhCn).toBe("呓语小镇");
    expect(getRegisteredTitleTranslation("gravhounds", "Gravhounds")?.titleZhCn).toBe("重力猎犬");
    expect(getRegisteredTitleTranslation("militsioner", "Militsioner")?.titleZhCn).toBe("警目如炬");
  });

  it("localizes secondary game and DLC names inside body copy", () => {
    expect(localizeRegisteredTitles("《FOUNTAINS》推出 Shattered Shape DLC")).toBe("《永泉传说》推出 破碎之形 DLC");
    expect(localizeRegisteredTitles("FINAL FANTASY VII EVER CRISIS 更新")).toBe("最终幻想7：永恒危机 更新");
  });

  it("preserves the reported ordinary-word, substring, sequel, and suffix examples", () => {
    const reportedHeadline = "FOUNTAINSIDE and FOUNTAINS, Shattered Shapes; FINAL FANTASY VII EVER CRISIS2";
    expect(localizeRegisteredTitles(reportedHeadline)).toBe(reportedHeadline);
    const ordinaryCopy = "The Marathon training ends near the Fountains.";
    expect(localizeRegisteredTitles(ordinaryCopy)).toBe(ordinaryCopy);
  });

  it("keeps common single-word aliases out of ordinary prose and protects Latin and numeric continuations", () => {
    const translations = Object.fromEntries(["Control", "Inside", "Journey", "EXODUS", "Fountains"].map((alias) => [alias.toLowerCase(), {
      titleZhCn: `译名${alias}`,
      titleEnAliases: [alias],
    }]));
    expect(localizeRegisteredTitles("Control the inside journey to exodus; fountains are nearby.", { translations }))
      .toBe("Control the inside journey to exodus; fountains are nearby.");
    expect(localizeRegisteredTitles("《Control》与《Journey》发布更新", { translations }))
      .toBe("《译名Control》与《译名Journey》发布更新");
    expect(localizeRegisteredTitles("《FOUNTAINSIDE》、FOUNTAINS2、FOUNTAINSé 与 FOUNTAINŚ", { translations: { fountains: translations.fountains } }))
      .toBe("《FOUNTAINSIDE》、FOUNTAINS2、FOUNTAINSé 与 FOUNTAINŚ");
    expect(localizeRegisteredTitles("《Shattered Shape: New Dawn》 announces a change", { translations: {
      dlc: { titleZhCn: "破碎之形", titleEnAliases: ["Shattered Shape"] },
    } })).toBe("《Shattered Shape: New Dawn》 announces a change");
    expect(localizeRegisteredTitles("Shattered Shape: New Dawn", { translations: {
      dlc: { titleZhCn: "破碎之形", titleEnAliases: ["Shattered Shape"] },
    } })).toBe("Shattered Shape: New Dawn");
    expect(localizeRegisteredTitles("中文紧邻Shattered Shape公布", {
      translations: { dlc: { titleZhCn: "破碎之形", titleEnAliases: ["Shattered Shape"] } },
      titleEn: "Shattered Shape",
      titleZhCn: "破碎之形",
    })).toBe("中文紧邻破碎之形公布");
  });

  it("chooses complete aliases once and skips ambiguous spellings", () => {
    const translations = {
      fountains: { titleZhCn: "永泉传说", titleEnAliases: ["FOUNTAINS"] },
      fountainsDlc: { titleZhCn: "破碎之形", titleEnAliases: ["Shattered Shape"] },
      long: { titleZhCn: "组合名称", titleEnAliases: ["FOUNTAINS Shattered Shape"] },
      ambiguousA: { titleZhCn: "译名甲", titleEnAliases: ["Shared Alias"] },
      ambiguousB: { titleZhCn: "译名乙", titleEnAliases: ["Shared Alias"] },
    };
    expect(localizeRegisteredTitles("FOUNTAINS Shattered Shape / 《FOUNTAINS》 + Shattered Shape / Shared Alias", { translations }))
      .toBe("组合名称 / 《永泉传说》 + 破碎之形 / Shared Alias");
    expect(localizeRegisteredTitles("《Shattered Shape: New Dawn》 与 Shattered Shape DLC", { translations }))
      .toBe("《Shattered Shape: New Dawn》 与 破碎之形 DLC");
  });

  it("lets an explicit subject translation take precedence over its registry entry", () => {
    const translations = { fable: { titleZhCn: "注册旧译名", titleEnAliases: ["Fable"] } };
    expect(localizeRegisteredTitles("Fable publishes a trailer", {
      translations,
      titleEn: "Fable",
      titleZhCn: "编辑确认译名",
    })).toBe("编辑确认译名 publishes a trailer");
  });

  it("is idempotent for registry translations containing their English aliases", () => {
    const copy = "Crescent Tower: RISING; BALL x PIT; B.L.U.E. NOVA";
    const localized = localizeRegisteredTitles(copy);
    expect(localized).toBe("Crescent Tower: RISING ～新月之塔 崛起～; BALL x PIT — 球比伦战记; B.L.U.E. NOVA 苍蓝之愿");
    expect(localizeRegisteredTitles(localized)).toBe(localized);
    const headline = localizeHeadline("《Crescent Tower: RISING》公布", {
      titleEn: "Crescent Tower: RISING",
      titleZhCn: "Crescent Tower: RISING ～新月之塔 崛起～",
    });
    expect(headline).toBe("《Crescent Tower: RISING ～新月之塔 崛起～》公布");
    expect(localizeHeadline(headline, {
      titleEn: "Crescent Tower: RISING",
      titleZhCn: "Crescent Tower: RISING ～新月之塔 崛起～",
    })).toBe(headline);
  });
});

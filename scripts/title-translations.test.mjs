import { describe, expect, it } from "vitest";
import { getRegisteredTitleTranslation, localizeRegisteredTitles } from "./lib/title-translations.mjs";

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
});

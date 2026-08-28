import { describe, expect, it } from "vitest";
import { generatedEditorialAlt, refreshGeneratedEditorialAlts } from "./lib/media-alt.mjs";
import { localizeRegisteredTitles } from "./lib/title-translations.mjs";

describe("generated editorial alt synchronization", () => {
  it("refreshes a stale generated alt after a registered title is localized", () => {
    const record = {
      id: "2026-08-28-am-news-0",
      title: {
        title_key: "gravhounds",
        title_en: "Gravhounds",
        title_zh_cn: "重力猎犬",
        title_zh_status: "common_translation",
      },
      headline: "《重力猎犬》公布：四人合作建设外星据点，11月2日进入Game Preview",
      images: [{
        kind: "editorial",
        alt: "Gravhounds：《Gravhounds》公布：四人合作建设外星据点，11月2日进入Game Preview相关配图",
      }],
    };

    expect(refreshGeneratedEditorialAlts(record, localizeRegisteredTitles)).toBe(1);
    expect(record.images[0].alt).toBe(generatedEditorialAlt(record));
    expect(record.images[0].alt).toBe("重力猎犬：《重力猎犬》公布：四人合作建设外星据点，11月2日进入Game Preview相关配图");
  });

  it("also refreshes secondary registered names inside the generated headline portion", () => {
    const record = {
      id: "2026-08-28-am-releases-3",
      title: {
        title_key: "fountains",
        title_en: "FOUNTAINS",
        title_zh_cn: "永泉传说",
        title_zh_status: "official_simplified",
      },
      headline: "《永泉传说》9月17日登陆主机，同日推出“破碎之形”DLC",
      images: [{
        kind: "editorial",
        alt: "FOUNTAINS：《FOUNTAINS》9月17日登陆主机，同日推出“Shattered Shape”DLC相关配图",
      }],
    };

    expect(refreshGeneratedEditorialAlts(record, localizeRegisteredTitles)).toBe(1);
    expect(record.images[0].alt).toBe("永泉传说：《永泉传说》9月17日登陆主机，同日推出“破碎之形”DLC相关配图");
  });

  it("does not overwrite source or manually authored descriptions", () => {
    const manualAlt = "Gravhounds四只生化改造犬在外星基地前集结";
    const record = {
      id: "2026-08-28-am-news-0",
      title: {
        title_key: "gravhounds",
        title_en: "Gravhounds",
        title_zh_cn: "重力猎犬",
        title_zh_status: "common_translation",
      },
      headline: "《重力猎犬》公布：四人合作建设外星据点，11月2日进入Game Preview",
      images: [
        { kind: "editorial", alt: manualAlt },
        { kind: "cover", alt: "Gravhounds官方商店封面" },
      ],
    };

    expect(refreshGeneratedEditorialAlts(record, localizeRegisteredTitles)).toBe(0);
    expect(record.images[0].alt).toBe(manualAlt);
    expect(record.images[1].alt).toBe("Gravhounds官方商店封面");
  });
});

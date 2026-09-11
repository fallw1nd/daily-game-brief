import { describe, expect, it } from "vitest";
import { normalizeSubjectHeadline as headline } from "./lib/headline-subject.mjs";

const title = { title_key: "fable", title_en: "Fable", title_zh_cn: "神鬼寓言" };
describe("standalone headline subjects", () => {
  it("repairs the actual missing-subject case, once", () => {
    const result = headline("官方播客详谈新一代阿尔比恩的战斗", title);
    expect(result).toBe("《神鬼寓言》：官方播客详谈新一代阿尔比恩的战斗");
    expect(headline(result, title)).toBe(result);
  });
  it("preserves established subjects and evidence-named people", () => {
    expect(headline("《神鬼寓言》公开实机", title)).toBe("《神鬼寓言》公开实机");
    expect(headline("Playground Games详谈战斗", title, { entities: ["Playground Games"] })).toBe("Playground Games详谈战斗");
  });
  it("does not mistake partial English words for names", () => {
    expect(headline("An ineffable new world", title, { locale: "en" })).toBe("Fable: An ineffable new world");
  });
  it("does not accept institutions mentioned only as timing context", () => {
    expect(headline("Switch 2版在Nintendo Direct结束后上线", title, { entities: ["Nintendo Direct"] })).toBe("《神鬼寓言》：Switch 2版在Nintendo Direct结束后上线");
    expect(headline("Nintendo Direct结束后上线", title, { entities: ["Nintendo Direct"] })).toBe("《神鬼寓言》：Nintendo Direct结束后上线");
  });
  it("retains archive and degraded recovery markers", () => {
    expect(headline("日报｜全新世界亮相", title, { archive: true })).toBe("日报｜《神鬼寓言》：全新世界亮相");
    expect(headline("[自动事实清单] 新内容公布", title)).toBe("[自动事实清单] 《神鬼寓言》：新内容公布");
    expect(headline("Daily Brief | New world revealed", title, { locale: "en", archive: true })).toBe("Daily Brief | Fable: New world revealed");
  });
  it("rejects unknown identity rather than inventing one", () => {
    expect(() => headline("新作公布", {})).toThrow("confirmed title identity");
  });
});

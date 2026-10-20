import { describe, expect, it } from "vitest";
import { stripHtml } from "./lib/news-pipeline.mjs";
import { classifyTitleSource, titleLookupDue, titleLookupRecord, adoptTitleHints } from "./lib/title-knowledge.mjs";
import { selectTitleHintSubjects, validateTitleHintCandidate } from "./lib/title-hints.mjs";

const subject = { titleKey: "example-2", subjectKey: "Example 2" };
const page = (url, pageText) => ({ url, pageText });
describe("persistent title evidence", () => {
  it("does not confuse sequel numbers or accept a reprint", () => {
    expect(classifyTitleSource(page("https://www.gamersky.com/news/a", "示例二 Example 20"), subject, "示例二")).toBeNull();
    expect(classifyTitleSource(page("https://www.gamersky.com/news/a", "示例二 Example 2 本文转载"), subject, "示例二")).toBeNull();
    expect(classifyTitleSource(page("https://bbs.3dmgame.com/thread-1-1.html", "示例二 Example 2"), subject, "示例二")).toBeNull();
    expect(classifyTitleSource(page("https://www.gamersky.com/news/a", "示例二（Example 2）"), subject, "示例二")?.kind).toBe("media");
  });
  it.each([
    ["Example", "示例二（Example II）"],
    ["Example", "示例二（Example 2）"],
    ["Example 2", "示例二豪华版（Example 2 Deluxe Edition）"],
    ["Example 2", "《示例二豪华版》（Example 2: Deluxe Edition）"],
    ["Example", "示例二（Example II）\n相关推荐：Example"],
    ["Example", "Example\n示例二（Another Game）"],
    ["Example", "示例二（Exampleé）"],
    ["Example", "示例二（Example\u0301）"],
    ["Example", "示例二（Example２）"],
    ["テスト", "示例二（テストゲーム）"],
    ["Example", "《前缀示例二》（Example）"],
    ["Example", "前缀：示例二（Example）"],
    ["Example", "前缀·示例二（Example）"],
    ["Example", "前缀 示例二（Example）"],
    ["Example", "News: 示例二（Example） is now available."],
  ])("does not persist unbound or longer identities: %s / %s", (identity, text) => {
    const target = { titleKey: "regression-target", subjectKey: identity };
    const chinese = text.includes("豪华") ? "示例二豪华版" : "示例二";
    const sources = [page("https://store.steampowered.com/app/10/?l=schinese", text)];
    expect(classifyTitleSource(sources[0], target, chinese)).toBeNull();
    const hint = validateTitleHintCandidate(target, { titleZhCn: chinese, suggestedStatus: "official_simplified" }, sources);
    expect(hint).toBeNull();
    const registry = { translations: {} };
    expect(adoptTitleHints(registry, hint ? [hint] : []).translations).toEqual({});
    expect(registry.translations).toEqual({});
  });
  it.each([
    ["Example II", "示例二（Example II）"],
    ["Example 2 Deluxe Edition", "《示例二》（Example 2 Deluxe Edition）发布"],
    ["Example 2: Deluxe Edition", "《Example 2: Deluxe Edition》（示例二）"],
    ["Example 2", "示例二（ＥＸＡＭＰＬＥ　２）"],
    ["テストゲーム", "示例二（テストゲーム）"],
    ["Example 2", "示例二 Example 2"],
    ["Example 2", "Example 2（示例二）"],
  ])("adopts complete exact bilingual identities: %s", (identity, text) => {
    const target = { titleKey: "regression-target", subjectKey: identity };
    const hint = validateTitleHintCandidate(target, { titleZhCn: "示例二", suggestedStatus: "official_simplified" },
      [page("https://store.steampowered.com/app/10/?l=schinese", text)]);
    expect(hint).toMatchObject({ autoAdoptable: true });
    expect(adoptTitleHints({ translations: {} }, [hint]).translations[target.titleKey]).toMatchObject({
      titleZhCn: "示例二", titleEnAliases: [identity], titleZhStatus: "official_simplified",
    });
  });
  it("does not let two independent media families legitimize a wrong identity", () => {
    expect(validateTitleHintCandidate(subject, { titleZhCn: "示例二", suggestedStatus: "common_translation" }, [
      page("https://www.gamersky.com/news/a", "示例二（Example 2 Deluxe Edition）"),
      page("https://www.3dmgame.com/news/a", "示例二（Example 2 Deluxe Edition）"),
    ])).toBeNull();
  });
  it("uses an explicit original identity and preserves existing verified aliases", () => {
    const target = { ...subject, subjectKey: "Unverified shortcut", titleEn: "Example 2" };
    const hint = validateTitleHintCandidate(target, { titleZhCn: "示例二", suggestedStatus: "official_simplified" },
      [page("https://store.steampowered.com/app/10/?l=schinese", "《示例二》（Example 2）")]);
    const registry = { translations: { "example-2": { titleEnAliases: ["Verified Original Alias"] } } };
    expect(adoptTitleHints(registry, [hint]).translations["example-2"].titleEnAliases).toEqual(["Verified Original Alias", "Example 2"]);
    expect(classifyTitleSource(page("https://store.steampowered.com/app/10/?l=schinese", "示例二（Unverified shortcut）"), target, "示例二")).toBeNull();
  });
  it("fails closed on ambiguous flattened HTML but keeps explicit bilingual labels", () => {
    const target = { titleKey: "example", subjectKey: "Example" };
    const official = text => page("https://store.steampowered.com/app/10/?l=schinese", stripHtml(text));
    expect(classifyTitleSource(official("<header>Store</header><h1>Example（示例二）</h1><main>Buy now</main>"), target, "示例二")).toBeNull();
    expect(classifyTitleSource(official("<header>Store</header><h1>《示例二》（Example）</h1><main>Buy now</main>"), target, "示例二")?.kind).toBe("official_simplified");
  });
  it("requires distinct media families, not distinct subdomains", () => {
    const candidate = { titleZhCn: "示例二", suggestedStatus: "common_translation" };
    expect(validateTitleHintCandidate(subject, candidate, [
      page("https://www.gamersky.com/news/a", "示例二 Example 2"),
      page("https://wap.gamersky.com/news/b", "示例二 Example 2"),
    ])).toBeNull();
  });
  it("retries network failures after six hours and misses after seven days", () => {
    const now = Date.parse("2026-09-10T00:00:00Z");
    const failed = titleLookupRecord(subject, "error", now);
    const missed = titleLookupRecord(subject, "not-found", now);
    expect(titleLookupDue(subject, failed, now + 5 * 3600000)).toBe(false);
    expect(titleLookupDue(subject, failed, now + 6 * 3600000)).toBe(true);
    expect(titleLookupDue(subject, missed, now + 6 * 86400000)).toBe(false);
    expect(titleLookupDue(subject, missed, now + 7 * 86400000)).toBe(true);
    expect(titleLookupDue({ ...subject, eventKind: "announcement", eventKey: "new" }, missed, now)).toBe(true);
  });
  it("queries Japanese original names and carries announcement identity", () => {
    expect(selectTitleHintSubjects({ showcaseAnnouncements: [{ id: "direct:game", subjectKey: "テストゲーム", eventKind: "announcement" }] })[0]).toMatchObject({ eventKey: "direct:game", subjectType: "game" });
  });
  it("preserves user names and holds conflicting automatic candidates", () => {
    const hint = { ...subject, autoAdoptable: true, titleZhCn: "自动名", suggestedStatus: "common_translation", sources: [] };
    const registry = { translations: { "example-2": { titleZhCn: "用户名", evidence: { kind: "user_provided" } } } };
    expect(adoptTitleHints(registry, [hint]).translations["example-2"].titleZhCn).toBe("用户名");
    expect(adoptTitleHints({ translations: {} }, [hint, { ...hint, titleZhCn: "冲突名" }]).translations).toEqual({});
  });
});

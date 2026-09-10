import { describe, expect, it } from "vitest";
import { classifyTitleSource, titleLookupDue, titleLookupRecord, adoptTitleHints } from "./lib/title-knowledge.mjs";
import { selectTitleHintSubjects, validateTitleHintCandidate } from "./lib/title-hints.mjs";

const subject = { titleKey: "example-2", subjectKey: "Example 2" };
const page = (url, pageText) => ({ url, pageText });
describe("persistent title evidence", () => {
  it("does not confuse sequel numbers or accept a reprint", () => {
    expect(classifyTitleSource(page("https://www.gamersky.com/news/a", "示例二 Example 20"), subject, "示例二")).toBeNull();
    expect(classifyTitleSource(page("https://www.gamersky.com/news/a", "示例二 Example 2 本文转载"), subject, "示例二")).toBeNull();
    expect(classifyTitleSource(page("https://www.gamersky.com/news/a", "示例二（Example 2）"), subject, "示例二")?.kind).toBe("media");
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

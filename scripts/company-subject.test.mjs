import { describe, expect, it } from "vitest";
import { confirmedCompanySubject } from "./lib/company-subject.mjs";

const candidate = {
  eventKey: "unchanged-window-event", subjectKey: "ever17", canonicalSubjectKey: "ever17", eventKind: "other",
  headline: "『Ever17』『AI: ソムニウム ファイル』の打越鋼太郎氏が新会社「Crash Keys」設立。“1年半手がけたゲームの開発中止”を経て、予定外の急出航に",
};
const opened = evidenceText => [{ status: "opened", evidenceText }];

describe("explicit company formation subject", () => {
  it("prioritizes the company corroborated in an opened body over the creator's earlier games", () => {
    const correction = confirmedCompanySubject(candidate, opened("打越鋼太郎氏は10月15日、株式会社Crash Keysの設立を正式に発表した。"));
    expect(correction).toEqual({ subjectKey: "crash keys", canonicalSubjectKey: null, eventKind: "company", lane: "industry" });
    expect(correction).not.toHaveProperty("eventKey");
    expect(candidate.subjectKey).toBe("ever17");
  });
  it("requires an opened corroborating body, not a feed title or a mere company mention", () => {
    expect(confirmedCompanySubject(candidate, [{ status: "limited", evidenceText: "株式会社Crash Keysの設立を発表した。" }])).toBeNull();
    expect(confirmedCompanySubject(candidate, opened("Crash Keys and Ever17 are mentioned in an interview."))).toBeNull();
    expect(confirmedCompanySubject(candidate, opened("株式会社Other Keysの設立を発表した。"))).toBeNull();
  });
  it("does not infer a game announcement, unnamed company, or ambiguous two-company story", () => {
    for (const headline of ["『Ever17』の新作を発表", "新会社設立を発表", "新会社「Crash Keys」設立、新会社「Other Keys」設立"]) {
      expect(confirmedCompanySubject({ headline }, opened("株式会社Crash Keysの設立を発表した。"))).toBeNull();
    }
  });
  it("leaves plans, denial and rumors unresolved", () => {
    for (const body of ["株式会社Crash Keysの設立を計画している。", "株式会社Crash Keysの設立という噂を否定。", "Crash Keys was not founded."]) {
      expect(confirmedCompanySubject(candidate, opened(body))).toBeNull();
    }
  });
  it("supports explicit quoted English and Chinese company names without taking facts from the classifier", () => {
    expect(confirmedCompanySubject({ headline: 'Ever17 creator founded a new company "Crash Keys"' }, opened("Crash Keys was founded by the creator."))).toMatchObject({ subjectKey: "crash keys", eventKind: "company" });
    expect(confirmedCompanySubject({ headline: '《Ever17》制作人成立新公司“Crash Keys”' }, opened("制作人成立新公司“Crash Keys”。"))).toMatchObject({ subjectKey: "crash keys" });
  });
});

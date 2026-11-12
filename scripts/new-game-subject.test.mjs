import { describe, expect, it } from "vitest";
import { confirmedNewGameSubject } from "./lib/new-game-subject.mjs";
const candidate = { headline: '『Milk inside a bag of milk inside a bag of milk』開発者による新作『MEGALITH』発表。地球最後の人間が冬の終末世界を巡る旅' };
const opened = evidenceText => [{ status: "opened", evidenceText }];
describe("bounded new-game identity evidence", () => {
  it("requires independent affirmative opened-body corroboration", () => {
    expect(confirmedNewGameSubject(candidate, opened("Nikita Kryukov氏は11月11日、『MEGALITH』を発表した。"))).toMatchObject({ subjectKey: "megalith", eventKind: "announcement" });
  });
  it.each([candidate.headline, "『Other』を発表した。", "『MEGALITH』を発表したという噂だ。", "『MEGALITH』を発表したわけではない。", "MEGALITH is mentioned."])("rejects unsupported, wrong or uncertain evidence: %s", body => {
    expect(confirmedNewGameSubject(candidate, opened(body))).toBeNull();
  });
  it("rejects unopened evidence and unrelated headlines", () => {
    expect(confirmedNewGameSubject(candidate, [{ status: "limited", evidenceText: "『MEGALITH』を発表した。" }])).toBeNull();
    expect(confirmedNewGameSubject({ headline: "MEGALITH interview" }, opened("『MEGALITH』を発表した。"))).toBeNull();
  });
});

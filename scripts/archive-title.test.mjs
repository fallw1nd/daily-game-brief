import { describe, expect, it } from "vitest";
import { archiveTitleDetails, hasValidArchiveTitle } from "./lib/archive-title.mjs";

describe("bounded archive-title feedback", () => {
  it.each([7, 8, 40, 41])("uses the same trimmed Unicode count at %i characters", count => {
    const title = ` \n早报｜${"🎮".repeat(count - 3)}\t `;
    expect(hasValidArchiveTitle(title, "am")).toBe(count >= 8 && count <= 40);
    expect(archiveTitleDetails(title)).toContain(`characterCount=${count}`);
    expect(archiveTitleDetails(title)).toContain(`archiveTitle=${JSON.stringify(title.trim())}`);
    expect(archiveTitleDetails(title)).toContain("Unicode code points after trimming, including prefix and punctuation");
  });
  it("reports exact shortfall or overflow without suggesting shortening for a prefix-only failure", () => {
    expect(archiveTitleDetails("日报｜短标题")).toContain("needs 2 more to reach 8");
    expect(archiveTitleDetails("日报｜" + "字".repeat(38))).toContain("exceeds 40 by 1");
    const wrongPrefix = "晚报｜这是一条完整标题";
    expect(hasValidArchiveTitle(wrongPrefix, "daily")).toBe(false);
    expect(archiveTitleDetails(wrongPrefix)).not.toMatch(/needs|exceeds|shorten/);
  });
  it.each([undefined, null, 123, {}, []])("does not coerce an invalid input %j into a title", value => {
    expect(hasValidArchiveTitle(value, "am")).toBe(false);
    expect(archiveTitleDetails(value)).toContain("expected a string");
    expect(archiveTitleDetails(value)).not.toContain("[object Object]");
  });
  it("bounds diagnostic copy while counting the complete rejected value", () => {
    const title = "日报｜" + "🎮".repeat(10000);
    const details = archiveTitleDetails(title, "normalizedTitle");
    expect(details).toContain("characterCount=10003; exceeds 40 by 9963");
    expect(details).toContain("preview truncated to 120 characters");
    expect([...details].length).toBeLessThan(350);
    expect(details).toContain(`normalizedTitle=${JSON.stringify([...title].slice(0, 120).join(""))}`);
  });
  it("escapes quotes and control characters so feedback remains one diagnostic line", () => {
    const title = '日报｜标题"引用"\n后续信息';
    const details = archiveTitleDetails(title);
    expect(details).toContain(JSON.stringify(title));
    expect(details).not.toContain("\n");
  });
});

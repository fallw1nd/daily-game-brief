import { describe, expect, it } from "vitest";
import { buildTitleAliasIndex, candidateSignals, resolveKnownSubjectKey } from "./lib/source-expansion.mjs";

describe("source expansion observability", () => {
  it("maps known multilingual title aliases to one canonical title key without inventing names", () => {
    const index = buildTitleAliasIndex({translations:{"game-x":{titleZhCn:"游戏X",titleEnAliases:["Game X"]}}});
    expect(resolveKnownSubjectKey("《游戏X》公布发售日", index)).toBe("game-x");
    expect(resolveKnownSubjectKey("Game X release date announced", index)).toBe("game-x");
    expect(resolveKnownSubjectKey("Completely Unknown Game announced", index)).toBeNull();
  });

  it("resolves a platform-owned recurring news subject only for the owning source", () => {
    const index = new Map();
    const playStation = { independenceKey: "sony-interactive-entertainment" };
    const unrelated = { independenceKey: "other-publisher" };
    const headline = "State of Play & State of Play Japan return on September 3";
    expect(resolveKnownSubjectKey(headline, index, playStation)).toBe("state-of-play");
    expect(resolveKnownSubjectKey("State of play in the market", index, unrelated)).toBeNull();
  });

  it("separates evidence confidence from editorial significance", () => {
    const lowValueOfficial = candidateSignals({eventKind:"other",headline:"Publisher posts a wallpaper",publishedAt:"2026-08-31T00:00:00Z",independentSources:["publisher"],source:{reliability:"primary"}});
    const industryReport = candidateSignals({eventKind:"company",headline:"Studio announces layoffs",publishedAt:"2026-08-31T00:00:00Z",independentSources:["media-a","media-b"],source:{reliability:"high"}});
    expect(lowValueOfficial.evidenceConfidence).toBeGreaterThan(lowValueOfficial.editorialSignificance);
    expect(industryReport.editorialSignificance).toBeGreaterThanOrEqual(80);
  });
});

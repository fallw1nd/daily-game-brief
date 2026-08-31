import { describe, expect, it } from "vitest";
import { candidateLane } from "./lib/source-expansion.mjs";

describe("phase 2 source lanes", () => {
  it("routes official award sources into the awards lane", () => {
    expect(candidateLane({
      headline: "The Game Awards nominees announced",
      eventKind: "announcement",
      source: { capabilities: ["awards"], defaultLane: "awards" },
    })).toBe("awards");
  });

  it("uses semantic interview and review signals before source defaults", () => {
    expect(candidateLane({
      headline: "独立游戏发行商究竟在做什么工作？IndieArk群访",
      eventKind: "other",
      source: { capabilities: ["industry", "interviews", "features"], defaultLane: "industry" },
    })).toBe("interviews");
    expect(candidateLane({
      headline: "某游戏评测：值得一试",
      eventKind: "other",
      source: { capabilities: ["reviews", "features"], defaultLane: "reviews" },
    })).toBe("reviews");
  });

  it("keeps broad deep-content sources in features when no stronger semantic signal exists", () => {
    expect(candidateLane({
      headline: "列车必须准点，而期望永不满足",
      eventKind: "other",
      source: { capabilities: ["industry", "interviews", "features", "culture"], defaultLane: "features" },
    })).toBe("features");
  });
});

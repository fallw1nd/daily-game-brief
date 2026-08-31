import { describe, expect, it } from "vitest";
import { eventIdentity } from "./lib/news-pipeline.mjs";
import { candidateSignals } from "./lib/source-expansion.mjs";

describe("multilingual event identity hardening", () => {
  it("recognizes Japanese release cancellation as a material event", () => {
    const identity = eventIdentity("新たな非対称PvP殺人鬼ホラー『Halloween: The Game』PS5国内版が発売中止に、CEROレーティングを取得できず");
    expect(identity.eventKind).toBe("cancel");
    expect(identity.subjectKey).toBe("halloween the game");
  });

  it("prefers game-title brackets over an earlier character quote", () => {
    const identity = eventIdentity("「マイケル」を操作できる『ハロウィン』新作ゲーム、PS5版が日本で発売中止に。CEROレーティングを取得できず");
    expect(identity.eventKind).toBe("cancel");
    expect(identity.subjectKey).toBe("ハロウィン");
  });

  it("treats cancellation as editorially significant", () => {
    const signals = candidateSignals({
      eventKind: "cancel",
      headline: "Game X cancelled for PS5",
      publishedAt: "2026-08-31T01:00:00.000Z",
      source: {reliability:"high"},
      independentSources: ["one"],
    });
    expect(signals.editorialSignificance).toBeGreaterThanOrEqual(70);
  });
});

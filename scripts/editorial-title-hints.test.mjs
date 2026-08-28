import { describe, expect, it } from "vitest";
import { validateFinalizedEditorialPacket } from "./lib/editorial-packet.mjs";

function packet(titleHints) {
  return {
    schemaVersion: 3,
    mode: "chatgpt-handoff",
    finalizedAt: "2026-08-28T09:00:01.000Z",
    coverageThrough: "2026-08-28 17:00",
    outputSchema: { type: "object" },
    editorialInput: {
      schemaVersion: 2,
      window: {
        id: "2026-08-28-pm",
        period: "pm",
        plannedAt: "2026-08-28 17:00",
        windowStart: "2026-08-28 10:10",
        windowEnd: "2026-08-28 17:00",
      },
      packages: [],
      trackingQueue: [],
      titleHints,
    },
  };
}

describe("finalized packet title hint compatibility", () => {
  it("accepts optional titleHints without changing editorialInput schemaVersion 2", () => {
    const errors = validateFinalizedEditorialPacket(packet([{
      subjectKey: "Example Game",
      titleKey: "example-game",
      titleZhCn: "示例游戏",
      suggestedStatus: "official_simplified",
      sources: [{
        label: "Example Store",
        url: "https://store.example/game",
        hostname: "store.example",
        pageTitle: "示例游戏",
        excerpt: "《示例游戏》官方页面",
      }],
    }]), { editionId: "2026-08-28-pm", period: "pm" });

    expect(errors).toEqual([]);
  });
});

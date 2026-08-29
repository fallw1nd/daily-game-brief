import { describe, expect, it } from "vitest";
import {
  MAX_EARLY_RECOVERY_MS,
  resolvePacketDispatchTarget,
} from "./resolve-packet-dispatch.mjs";

describe("packet recovery dispatch target", () => {
  it("keeps an early same-day AM recovery on today's edition instead of falling back a day", () => {
    const target = resolvePacketDispatchTarget({
      period: "am",
      now: new Date("2026-08-29T02:08:48.000Z"),
    });

    expect(target.window).toMatchObject({
      id: "2026-08-29-am",
      windowStart: "2026-08-28 17:00",
      windowEnd: "2026-08-29 10:10",
    });
    expect(target.waitMs).toBe(72_000);
    expect(target.waitMs).toBeLessThan(MAX_EARLY_RECOVERY_MS);
  });

  it("honors an explicit edition even when the recovery runs much later", () => {
    const target = resolvePacketDispatchTarget({
      period: "pm",
      edition: "2026-08-28-pm",
      now: new Date("2026-08-29T03:56:36.000Z"),
    });

    expect(target.window).toMatchObject({
      id: "2026-08-28-pm",
      windowStart: "2026-08-28 10:10",
      windowEnd: "2026-08-28 17:00",
    });
    expect(target.waitMs).toBeLessThan(0);
    expect(target.explicit).toBe(true);
  });

  it("rejects an edition whose suffix does not match the requested period", () => {
    expect(() => resolvePacketDispatchTarget({
      period: "am",
      edition: "2026-08-29-pm",
      now: new Date("2026-08-29T02:10:00.000Z"),
    })).toThrow("does not match period am");
  });

  it("makes a severely early legacy period-only dispatch fail-safe instead of selecting yesterday", () => {
    const target = resolvePacketDispatchTarget({
      period: "pm",
      now: new Date("2026-08-29T03:00:00.000Z"),
    });

    expect(target.window.id).toBe("2026-08-29-pm");
    expect(target.waitMs).toBeGreaterThan(MAX_EARLY_RECOVERY_MS);
  });
});

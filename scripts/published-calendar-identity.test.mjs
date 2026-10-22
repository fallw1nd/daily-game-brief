import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { calendarProductIdentity, mergePublishedCalendar, sameCalendarRelease } from "./lib/published-calendar-identity.mjs";

const release = (changes = {}) => ({ id: "old-slug", date: "10.28", title: { title_key: "phantom-blade-zero", title_en: "Phantom Blade Zero", title_zh_cn: "影之刃零", title_zh_status: "official_simplified" }, platforms: ["PC"], region: "美国", releaseType: "PC版发售", source: { kind: "primary", label: "Steam", url: "https://store.steampowered.com/app/4115450/" }, ...changes });

describe("published calendar semantic identity", () => {
  it("repairs the five exact 10/19 and 10/22 alias regressions without losing platforms or stronger translations", () => {
    const items = JSON.parse(readFileSync("scripts/fixtures/calendar-identity-regressions.json", "utf8"));
    const result = mergePublishedCalendar(items);
    expect(items).toHaveLength(10);
    expect(result).toHaveLength(5);
    expect(result[0]).toMatchObject({ id: "upcoming-nintendo-switch-sports-resort-nintendo-switch-2-us", title: { title_key: "nintendo-switch-sports-resort", title_zh_status: "common_translation" } });
    expect(result.find(item => item.title.title_en.toLowerCase() === "anomalith").platforms).toEqual(["Nintendo Switch 2", "PC", "PS5"]);
    expect(result.every(item => item.cover_status === "verified")).toBe(true);
    expect(mergePublishedCalendar(result)).toEqual(result);
  });
  it("retains stable identity, stronger naming and verified art across store-ID aliases", () => {
    const first = release({ cover_status: "verified", cover: { kind: "cover", url: "verified.jpg" } });
    const next = release({ id: "store-4115450", title: { title_key: "steam-4115450", title_en: "Phantom Blade Zero", title_zh_status: "unavailable" } });
    expect(mergePublishedCalendar([first, next])).toEqual([expect.objectContaining({ id: first.id, title: first.title, cover: first.cover, cover_status: "verified" })]);
  });
  it("does not confuse roundup games, bundles, distinct store products or nonprimary pages", () => {
    for (const url of ["https://news.xbox.com/next-week-on-xbox/", "https://store.steampowered.com/bundle/4115450/", "https://store.steampowered.com/sub/4115450/"]) {
      const first = release({ source: { kind: "primary", url } });
      expect(calendarProductIdentity(first)).toBeNull();
      expect(mergePublishedCalendar([first, { ...first, id: "another" }])).toHaveLength(2);
    }
    expect(sameCalendarRelease(release(), release({ source: { kind: "primary", url: "https://store.steampowered.com/app/4115451/" } }))).toBe(false);
    expect(sameCalendarRelease(release(), release({ source: { kind: "media", url: release().source.url } }))).toBe(false);
    expect(sameCalendarRelease(release(), release({ title: { title_en: "Phantom Blade Zero Deluxe Edition" } }))).toBe(false);
  });
  it("keeps different dates, regions, types and disjoint platform releases independent", () => {
    for (const changes of [{ date: "10.29" }, { region: "日本" }, { releaseType: "DLC发售" }, { releaseType: "抢先体验" }, { platforms: ["PS5"] }]) {
      expect(mergePublishedCalendar([release(), release({ ...changes, id: "new" })])).toHaveLength(2);
    }
    expect(sameCalendarRelease(release(), release({ date: "2026-10-28" }), "2026-10-22")).toBe(true);
    expect(sameCalendarRelease(release(), release({ date: "2027-10-28" }), "2026-10-22")).toBe(false);
  });
  it("merges overlapping platform coverage without losing the nonoverlapping platforms", () => {
    const first = release({ platforms: ["PC", "PS5"], releaseType: "多平台发售" });
    const next = release({ id: "other", platforms: ["PC", "Nintendo Switch 2"], releaseType: "多平台发售" });
    expect(mergePublishedCalendar([first, next])[0]).toMatchObject({ id: "old-slug", platforms: ["PC", "PS5", "Nintendo Switch 2"] });
  });
  it("recognizes exact supported single-product store paths, never a lookalike host", () => {
    for (const url of ["https://www.nintendo.com/us/store/products/minecraft-switch-2/", "https://store.playstation.com/en-us/product/UP0001-CUSA00001_00-BASEGAME", "https://www.xbox.com/en-us/games/store/game/9NBLGGH4R315"]) expect(calendarProductIdentity(release({ source: { kind: "primary", url } }))).toBeTruthy();
    expect(calendarProductIdentity(release({ source: { kind: "primary", url: "https://store.steampowered.com.evil.test/app/4115450/" } }))).toBeNull();
  });
});

import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildEdition } from "./lib/edition-publisher.mjs";
import { loadCanonicalUpcomingBaseline } from "./lib/upcoming-baseline.mjs";

const temporaryRoots = [];
const item = (id, date) => ({
  id,
  date,
  title: { title_key: id, title_en: id, title_zh_status: "unavailable" },
  platforms: ["PC"],
  region: "全球",
  releaseType: "正式发售",
  source: { label: "合成测试官方页面", url: `https://calendar.example/${id}`, kind: "primary" },
  note: "合成回归测试日历项，不代表真实发售事实。",
  cover_status: "unavailable",
  coverNote: "合成测试未提供封面。",
});

function addDays(date, days) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dailyPacket(date) {
  return {
    editorialInput: {
      window: {
        id: `${date}-daily`,
        period: "daily",
        plannedAt: `${date} 12:00`,
        windowStart: `${addDays(date, -1)} 10:10`,
        windowEnd: `${date} 10:10`,
      },
      packages: [{
        eventKey: "synthetic-news",
        tier: "A",
        sources: [{ sourceIndex: 0, status: "opened", kind: "primary", label: "合成新闻来源", url: "https://news.example/item" }],
      }],
      upcomingDiscovery: { candidates: [], coverage: [{ status: "failed", source: "synthetic discovery failure" }] },
    },
  };
}

function dailyEditorial(date, { upcoming = [], removeUpcomingIds = [] } = {}) {
  return {
    editionId: `${date}-daily`,
    archiveTitle: "日报｜《合成测试作品》公布新消息",
    leadEventKey: "synthetic-news",
    decisions: [{
      eventKey: "synthetic-news",
      decision: "include",
      section: "news",
      titleKey: "synthetic-news",
      titleZhCn: null,
      titleEn: "Synthetic News",
      titleZhStatus: "unavailable",
      headline: "《Synthetic News》公布新消息",
      summary: "合成测试证据确认一条独立新闻。",
      factStatus: "official",
      timeStatus: "date_only",
      entryFlags: [],
      tracking: false,
      verification: "仅供测试的合成来源。",
      reason: "测试 publisher 路径。",
      beijingTime: `${date} 09:30`,
      timeNote: "合成测试日期。",
      platforms: ["PC"],
      region: "全球",
      releaseType: "新闻",
      sourceIndexes: [0],
      additionalSources: [],
    }],
    upcomingMode: "inherit_and_patch",
    removeUpcomingIds,
    upcoming,
    checkedExtra: [],
    limitedExtra: [],
    editorialNote: "合成回归测试数据。",
  };
}

function publish(date, latest, { upcoming = [], removeUpcomingIds = [] } = {}) {
  return buildEdition({
    packet: dailyPacket(date),
    editorial: dailyEditorial(date, { upcoming, removeUpcomingIds }),
    latest,
    manifest: {
      schemaVersion: 1,
      updatedAt: `${addDays(date, -1)} 12:00`,
      latest: latest.id,
      editions: [{ id: latest.id, issueNumber: latest.issueNumber || 1 }],
    },
    now: new Date(`${date}T04:00:00Z`),
  });
}

function patch(id, date, fields = {}) {
  return {
    id,
    date,
    titleKey: id,
    titleZhCn: null,
    titleEn: id,
    titleZhStatus: "unavailable",
    platforms: ["PC"],
    region: "全球",
    releaseType: "正式发售",
    source: { label: "合成测试官方公告", url: `https://publisher.example/${id}/${date}`, kind: "primary" },
    note: "合成测试补丁，字段来自真实 upcoming schema。",
    ...fields,
  };
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("rolling Daily release calendar behavior", () => {
  it.each(["2026-09-30", "2026-12-31"])("refreshes all 15 days across consecutive editions beginning %s", async (firstDate) => {
    const dayAfter = addDays(firstDate, 1);
    const firstEnd = addDays(firstDate, 15);
    const secondEnd = addDays(dayAfter, 15);
    const oldDay = item("expires-on-day-two", addDays(firstDate, 1));
    const overlapEnd = item("overlap-end", firstEnd);
    const first = publish(firstDate, { id: addDays(firstDate, -1) + "-daily", issueNumber: 1, upcoming: [oldDay, overlapEnd] });
    expect(first.status).toBe("built");
    expect(first.edition.upcoming.map(({ id }) => id)).toEqual(["expires-on-day-two", "overlap-end"]);

    const firstBaseline = await loadCanonicalUpcomingBaseline({ latest: first.edition, manifest: { latest: first.edition.id, editions: [] }, editionDate: firstDate });
    expect(firstBaseline.refreshRange).toEqual({ startInclusive: addDays(firstDate, 1), endInclusive: firstEnd });
    expect(firstBaseline.items.map(({ id }) => id)).toEqual(["expires-on-day-two", "overlap-end"]);

    const tail = patch("new-tail", secondEnd);
    const second = publish(dayAfter, first.edition, { upcoming: [tail] });
    expect(second.status).toBe("built");
    expect(second.edition.upcoming.map(({ id, date }) => [id, date])).toEqual([
      ["overlap-end", firstEnd.slice(5).replace("-", ".")],
      ["new-tail", secondEnd.slice(5).replace("-", ".")],
    ]);

    const secondBaseline = await loadCanonicalUpcomingBaseline({ latest: second.edition, manifest: { latest: second.edition.id, editions: [] }, editionDate: dayAfter });
    expect(secondBaseline.refreshRange).toEqual({ startInclusive: addDays(dayAfter, 1), endInclusive: secondEnd });
    expect(secondBaseline.items.map(({ id }) => id)).toEqual(["overlap-end", "new-tail"]);
  });

  it("keeps reliable Canonical entries after empty or failed discovery until an explicit removal", async () => {
    const root = await mkdtemp(join(tmpdir(), "synthetic-calendar-rolling-"));
    temporaryRoots.push(root);
    await mkdir(join(root, "archive/2026/09"), { recursive: true });
    const archived = {
      id: "2026-09-29-daily",
      issueNumber: 28,
      upcoming: [item("verified-release", "10.12")],
    };
    await writeFile(join(root, "archive/2026/09/2026-09-29-daily.json"), JSON.stringify(archived));
    const baseline = await loadCanonicalUpcomingBaseline({
      latest: { id: "2026-09-30-daily", upcoming: [] },
      manifest: {
        latest: "2026-09-30-daily",
        editions: [{ id: archived.id, path: "archive/2026/09/2026-09-29-daily.json" }, { id: "2026-09-30-daily" }],
      },
      editionDate: "2026-09-30",
      dataRoot: root,
    });
    expect(baseline.items.map(({ id }) => id)).toEqual(["verified-release"]);

    const inherited = publish("2026-10-01", { id: "2026-09-30-daily", issueNumber: 29, upcoming: baseline.items });
    expect(inherited.edition.upcoming.map(({ id }) => id)).toEqual(["verified-release"]);

    const removed = publish("2026-10-02", inherited.edition, { removeUpcomingIds: ["verified-release"] });
    expect(removed.edition.upcoming).toEqual([]);
  });

  it("patches one stable ID earlier and later, updates supported metadata, then expires it beyond the window", () => {
    const original = item("known-release", "10.12");
    const unrelated = item("unrelated-release", "10.13");
    const first = publish("2026-09-30", { id: "2026-09-29-daily", issueNumber: 1, upcoming: [original, unrelated] });
    const advanced = publish("2026-10-01", first.edition, {
      upcoming: [patch("known-release", "2026-10-05", { platforms: ["PC", "PS5"], releaseType: "抢先体验" })],
    });
    expect(advanced.edition.upcoming.map(({ id }) => id)).toEqual(["known-release", "unrelated-release"]);
    expect(advanced.edition.upcoming[0]).toMatchObject({ id: "known-release", date: "10.05", platforms: ["PC", "PS5"], releaseType: "抢先体验" });

    const delayed = publish("2026-10-02", advanced.edition, {
      upcoming: [patch("known-release", "2026-10-14", { platforms: ["PC"], releaseType: "正式发售" })],
    });
    expect(delayed.edition.upcoming.map(({ id }) => id)).toEqual(["unrelated-release", "known-release"]);
    expect(delayed.edition.upcoming.find(({ id }) => id === "known-release")).toMatchObject({ id: "known-release", date: "10.14", platforms: ["PC"], releaseType: "正式发售" });

    const outside = publish("2026-10-03", delayed.edition, { upcoming: [patch("known-release", "2026-10-19")] });
    expect(outside.edition.upcoming.map(({ id }) => id)).toEqual(["unrelated-release"]);
  });
});

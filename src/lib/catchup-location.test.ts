import { describe, expect, it } from "vitest";
import { catchupLanguageHref, catchupLocationRange, catchupTopicHref, readCatchupLocation, writeCatchupLocation } from "./catchup-location";

describe("catch-up location", () => {
  it("safely parses absent and malformed pagination and presets", () => {
    expect(readCatchupLocation("")).toEqual({ days: 7, start: "", end: "", topic: "", limit: 12 });
    for (const limit of ["NaN", "Infinity", "-1", "12.5", "0"]) expect(readCatchupLocation(`?cuLimit=${limit}&cuDays=bad`).limit).toBe(12);
    expect(readCatchupLocation("?cuLimit=9999999999").limit).toBe(1200);
    expect(readCatchupLocation("?cuDays=30&cuTopic=game%26company&cuLimit=24")).toMatchObject({ days: 30, topic: "game&company", limit: 24 });
  });
  it("pins shared presets and full coverage while leaving fresh presets current", () => {
    const range = (query: string) => catchupLocationRange(readCatchupLocation(query), "2026-08-01", "2026-11-07");
    expect(range("")).toEqual({ start: "2026-11-01", end: "2026-11-07" });
    expect(range("?cuTo=2026-11-01")).toEqual({ start: "2026-10-26", end: "2026-11-01" });
    expect(range("?cuDays=all")).toEqual({ start: "2026-08-01", end: "2026-11-07" });
    expect(range("?cuDays=all&cuFrom=2026-09-01&cuTo=2026-10-01")).toEqual({ start: "2026-09-01", end: "2026-10-01" });
    expect(range("?cuDays=custom&cuFrom=2026-99-01")).toEqual({ start: "2026-99-01", end: "" });
    expect(range("?cuTo=2026-99-01")).toEqual(range(""));
  });
  it("round trips dates, exact identity and limit without losing other reader state", () => {
    const original = new URL("https://example.com/daily-game-brief/?edition=old&lang=en&q=test&results=24#archive");
    const location = { days: "custom" as const, start: "2026-09-01", end: "2026-10-01", topic: "title:alpha & β", limit: 36 };
    const next = writeCatchupLocation(original, location);
    expect(readCatchupLocation(next.search)).toEqual(location);
    expect(next.searchParams.get("q")).toBe("test");
    expect(next.searchParams.get("edition")).toBe("old");
    expect(next.searchParams.get("lang")).toBe("en");
    expect(next.hash).toBe("#catchup");
    expect(original.hash).toBe("#archive");
    const reset = writeCatchupLocation(next, { ...location, topic: "", limit: 12 });
    expect(reset.searchParams.has("cuTopic")).toBe(false);
    expect(reset.searchParams.has("cuLimit")).toBe(false);
  });
  it("links story topics and language changes without fuzzy names or lost filters", () => {
    const href = catchupTopicHref("studio:a/b & c", "2026-11-07-daily", false);
    const params = new URL(href, "https://example.com").searchParams;
    expect(params.get("cuTopic")).toBe("studio:a/b & c");
    expect(params.get("cuDays")).toBe("all");
    expect(params.get("edition")).toBe("2026-11-07-daily");
    const switched = new URL(catchupLanguageHref(params.toString(), true), "https://example.com");
    expect(switched.searchParams.get("cuTopic")).toBe("studio:a/b & c");
    expect(switched.searchParams.get("lang")).toBe("en");
    expect(new URL(catchupLanguageHref(switched.search, false), "https://example.com").searchParams.has("lang")).toBe(false);
  });
});


it.each([false, true])("keeps old reviewed links, copy links and language switches on the same identity (English=%s)", english => {
  const old = new URL("https://example.com/daily-game-brief/?catchup=1&edition=2026-11-07-daily&cuDays=custom&cuFrom=2026-11-06&cuTo=2026-11-07&cuTopic=gta-6&cuLimit=24#catchup");
  const location = readCatchupLocation(old.search);
  expect(location).toEqual({ days: "custom", start: "2026-11-06", end: "2026-11-07", topic: "grand-theft-auto-vi", limit: 24 });
  const copy = writeCatchupLocation(old, { ...location, topic: "gta-6" });
  expect(copy.searchParams.get("cuTopic")).toBe("grand-theft-auto-vi");
  expect(readCatchupLocation(copy.search)).toEqual(location);
  const switched = new URL(catchupLanguageHref(old.search, english), old);
  expect(switched.searchParams.get("cuTopic")).toBe("grand-theft-auto-vi");
  expect(readCatchupLocation(switched.search)).toEqual(location);
  const href = new URL(catchupTopicHref("gta-6", "2026-11-07-daily", english), old);
  expect(href.searchParams.get("cuTopic")).toBe("grand-theft-auto-vi");
  expect(href.searchParams.get("edition")).toBe("2026-11-07-daily");
  expect(href.searchParams.get("lang")).toBe(english ? "en" : null);
});

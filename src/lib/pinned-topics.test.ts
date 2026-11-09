import { afterEach, expect, it, vi } from "vitest";
import { parsePinnedTopics, pinnedTopicsLimit, readPinnedTopics } from "./pinned-topics";

afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); });
it.each([null, "", "{", "null", "true", "{}", '"game"', "x".repeat(8193)])("safely ignores malformed or oversized storage: %s", value => {
  expect(parsePinnedTopics(value)).toEqual([]);
});
it("keeps exact distinct identities, resolving only existing reviewed aliases", () => {
  expect(parsePinnedTopics(JSON.stringify(["gta-6", "grand-theft-auto-vi", "gta-online", "GTA-6", "__proto__", "unknown", "unknown"])))
    .toEqual(["grand-theft-auto-vi", "gta-online", "GTA-6", "__proto__", "unknown"]);
});
it("filters invalid keys without converting values and bounds the list", () => {
  expect(parsePinnedTopics(JSON.stringify([null, 1, {}, [], "", " padded ", "line\nbreak", "x".repeat(257), "valid"]))).toEqual(["valid"]);
  expect(parsePinnedTopics(JSON.stringify(Array.from({ length: 20 }, (_, i) => `topic-${i}`)))).toHaveLength(pinnedTopicsLimit);
});
it("reports unavailable storage without throwing", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new DOMException("Blocked", "SecurityError"); });
  expect(readPinnedTopics()).toEqual({ keys: [], persistent: false });
});

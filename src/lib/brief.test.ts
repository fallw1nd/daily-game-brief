import { describe, expect, it } from "vitest";
import { edition } from "../data/brief";
import {
  isEntryInsideEditionWindow,
  searchEntries,
  validateEdition,
} from "./brief";

describe("brief integrity", () => {
  it("keeps official entries backed by primary sources", () => {
    expect(validateEdition(edition)).toEqual([]);
  });

  it("excludes supplements from the current time window", () => {
    const supplement = edition.entries.find((entry) =>
      entry.entry_flags.includes("supplement"),
    );

    expect(supplement).toBeDefined();
    expect(isEntryInsideEditionWindow(supplement!, edition)).toBe(false);
  });

  it("uses an open-start, closed-end edition window", () => {
    const base = edition.entries[0];
    expect(
      isEntryInsideEditionWindow(
        { ...base, beijingTime: edition.windowStart },
        edition,
      ),
    ).toBe(false);
    expect(
      isEntryInsideEditionWindow(
        { ...base, beijingTime: edition.windowEnd },
        edition,
      ),
    ).toBe(true);
  });

  it("searches Chinese names, English names, and platforms", () => {
    expect(searchEntries(edition.entries, "乐园追放")).toHaveLength(1);
    expect(searchEntries(edition.entries, "Chronoscript")).toHaveLength(1);
    expect(searchEntries(edition.entries, "Netflix")).toHaveLength(1);
  });
});

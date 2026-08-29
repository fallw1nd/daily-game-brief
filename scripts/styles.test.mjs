import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let styles;
let localeStyles;

beforeAll(async () => {
  [styles, localeStyles] = await Promise.all([
    readFile(resolve("src/styles.css"), "utf8"),
    readFile(resolve("src/locale.css"), "utf8"),
  ]);
});

describe("pending marker layout", () => {
  it("prevents page-level overflow at mobile widths", () => {
    expect(styles).toMatch(/\.site-shell\s*\{[^}]*overflow:\s*clip/s);
    expect(styles).toMatch(/\.pending-mark\s*\{[^}]*max-width:\s*100%/s);
    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.pending-mark/);
  });
});

describe("focus desk layout", () => {
  it("fills the desktop row according to the actual number of secondary focus stories", () => {
    expect(localeStyles).toMatch(/\.focus-list\s*\{[^}]*repeat\(auto-fit,\s*minmax\(min\(100%,\s*260px\),\s*1fr\)\)/s);
  });

  it("keeps the medium layout balanced for one or three secondary stories", () => {
    expect(localeStyles).toMatch(/@media \(max-width: 1180px\)[\s\S]*?\.focus-list:has\(> \.focus-item:only-child\)[^}]*grid-template-columns:\s*1fr/s);
    expect(localeStyles).toMatch(/\.focus-list:has\(> \.focus-item:nth-child\(3\):last-child\) > \.focus-item:last-child\s*\{[^}]*grid-column:\s*1 \/ -1/s);
  });

  it("keeps focus cards single-column on narrow screens", () => {
    expect(localeStyles).toMatch(/@media \(max-width: 820px\)[\s\S]*?\.focus-list\s*\{[^}]*grid-template-columns:\s*1fr/s);
  });
});

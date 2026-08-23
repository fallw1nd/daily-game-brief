import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

let styles;

beforeAll(async () => {
  styles = await readFile(resolve("src/styles.css"), "utf8");
});

describe("pending marker layout", () => {
  it("prevents page-level overflow at mobile widths", () => {
    expect(styles).toMatch(/\.site-shell\s*\{[^}]*overflow:\s*clip/s);
    expect(styles).toMatch(/\.pending-mark\s*\{[^}]*max-width:\s*100%/s);
    expect(styles).toMatch(/@media \(max-width: 640px\)[\s\S]*?\.pending-mark/);
  });
});

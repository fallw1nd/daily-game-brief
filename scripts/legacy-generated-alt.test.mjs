import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { repairLegacyGeneratedAlts } from "./lib/legacy-generated-alt.mjs";
import { generatedEditorialAlt } from "./lib/media-alt.mjs";
import { processEdition } from "./enrich-media.mjs";

const fixture = JSON.parse(await readFile("scripts/fixtures/legacy-generated-alts.json", "utf8"));
const roots = [];
afterEach(async () => { await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true }))); });

describe("exact historical generated-alt repair", () => {
  for (const original of fixture.entries) {
    it(`repairs only the generated description of ${original.id}, once`, () => {
      const entry = structuredClone(original);
      const expected = structuredClone(original);
      expected.images[0].alt = generatedEditorialAlt(entry);
      expect(repairLegacyGeneratedAlts(fixture.id, entry, { apply: true })).toHaveLength(1);
      expect(entry).toEqual(expected);
      expect(repairLegacyGeneratedAlts(fixture.id, entry, { apply: true })).toEqual([]);
    });
  }
  for (const [label, mutate] of [
    ["altered alt", e => { e.images[0].alt += " edited"; }],
    ["custom description", e => { e.images[0].alt = "游戏角色站在城堡前"; }],
    ["wrong source", e => { e.images[0].sourceUrl += "?other=1"; }],
    ["wrong image", e => { e.images[0].url += ".other.jpg"; }],
    ["wrong entry", e => { e.id += "-other"; }],
    ["wrong subject", e => { e.title.title_key += "-other"; }],
    ["cover", e => { e.images[0].kind = "cover"; }],
    ["placeholder", e => { e.images[0].placeholder = true; }],
    ["unverified image", e => { e.image_status = "unavailable"; }],
  ]) it(`preserves ${label}`, () => {
    for (const original of fixture.entries) {
      const entry = structuredClone(original); mutate(entry);
      const before = structuredClone(entry);
      expect(repairLegacyGeneratedAlts(fixture.id, entry, { apply: true })).toEqual([]);
      expect(entry).toEqual(before);
    }
  });
  it("preserves a wrong edition", () => {
    const entry = structuredClone(fixture.entries[0]);
    expect(repairLegacyGeneratedAlts("2026-09-03-daily", entry, { apply: true })).toEqual([]);
    expect(entry).toEqual(fixture.entries[0]);
  });
  it("reports dry-run candidates without mutation or writes, and applies before the existing-image early return", async () => {
    const root = await mkdtemp(join(tmpdir(), "legacy-alt-")); roots.push(root);
    const path = join(root, "edition.json");
    const bytes = JSON.stringify(fixture, null, 2) + "\n";
    await writeFile(path, bytes);
    const manifestItem = { id: fixture.id, path: "edition.json" };
    const dry = await processEdition(manifestItem, { dataRoot: root, apply: false });
    expect(dry.changed).toBe(false);
    expect(dry.results.map(r => r.status)).toEqual(["candidate", "candidate"]);
    expect(dry.edition).toEqual(fixture);
    expect(await readFile(path, "utf8")).toBe(bytes);
    const applied = await processEdition(manifestItem, { dataRoot: root, apply: true });
    expect(applied.changed).toBe(true);
    expect(applied.results.map(r => r.status)).toEqual(["applied", "applied"]);
    const expected = structuredClone(fixture);
    expected.revised = true;
    for (const entry of expected.entries) entry.images[0].alt = generatedEditorialAlt(entry);
    expect(JSON.parse(await readFile(path, "utf8"))).toEqual(expected);
    const once = await readFile(path, "utf8");
    const again = await processEdition(manifestItem, { dataRoot: root, apply: true });
    expect(again.changed).toBe(false);
    expect(again.results).toEqual([]);
    expect(await readFile(path, "utf8")).toBe(once);
  });
});

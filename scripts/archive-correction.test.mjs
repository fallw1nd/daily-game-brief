import { resolve } from "node:path";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { planArchiveCorrection } from "./lib/archive-correction.mjs";
import { writeCorrectionTransaction } from "./apply-archive-correction.mjs";
import { buildEnglishRepairOverlay } from "./lib/bilingual-publisher.mjs";
import { factsDigest } from "./lib/locale-digest.mjs";
import { validateEnglishOverlay } from "./lib/locale-overlay.mjs";
const json = path => JSON.parse(readFileSync(resolve("public/data", path), "utf8"));
function fixture() {
  const canonical = json("archive/2026/10/2026-10-18-daily.json");
  let overlay = json("locales/en/archive/2026/10/2026-10-18-daily.json");
  const entry = canonical.entries.find(row => row.id.endsWith("news-3"));
  // Normalize the fixture baseline: production may already have been corrected.
  entry.region = "全球";
  overlay.entries.find(row => row.entryId === entry.id).regionLabel = "Global";
  overlay = buildEnglishRepairOverlay({canonical, draft:{...overlay, factsDigest:factsDigest(canonical)}, retainedPresentation:null}).overlay;
  const en = overlay.entries.find(row => row.entryId === entry.id);
  return { canonical, overlay, manifest: json("manifest.json"), archiveBlobSha: "a".repeat(40), overlayBlobSha: "b".repeat(40), request: {
    schemaVersion: 1, kind: "archive_correction", editionId: canonical.id,
    expectedArchiveBlobSha: "a".repeat(40), expectedOverlayBlobSha: "b".repeat(40), corrections: [{
      entryId: entry.id, expected: { region: entry.region }, replacement: { region: "日本" }, englishExpected: { regionLabel: en.regionLabel ?? null }, englishReplacement: { regionLabel: "Japan" },
      evidence: { sourceUrl: entry.sources[0].url, excerpt: "日本向けのPlayStation StoreとXboxストア", reason: "Original opened source scopes CERO rating to Japan, not a global rating." },
    }],
  } };
}

describe("bounded archive correction", () => {
  it("preserves valid legacy presentation without normalizing unrelated old title identities", () => {
    const input = fixture();
    input.canonical = json("archive/2026/08/2026-08-26-pm.json");
    input.overlay = json("locales/en/archive/2026/08/2026-08-26-pm.json");
    input.request.editionId = input.canonical.id;
    const entry = input.canonical.entries.find(row => row.id.endsWith("industry-1"));
    const en = input.overlay.entries.find(row => row.entryId === entry.id);
    input.request.corrections = [{ entryId: entry.id,
      expected: { summary: entry.summary }, replacement: { summary: entry.summary + "（文字校正）" },
      englishExpected: { summary: en.summary }, englishReplacement: { summary: en.summary + " (copy clarification)" },
      evidence: { sourceUrl: entry.sources[0].url, excerpt: "6,541日間", reason: "Clarify elapsed service duration, without adding facts." } }];
    const result = planArchiveCorrection(input);
    expect(result.canonical.entries.filter(row => row.id !== entry.id)).toEqual(input.canonical.entries.filter(row => row.id !== entry.id));
    expect(result.overlay.entries.filter(row => row.entryId !== entry.id)).toEqual(input.overlay.entries.filter(row => row.entryId !== entry.id));
    expect(validateEnglishOverlay(result.canonical, result.overlay).valid).toBe(true);
  });
  it("changes only reviewed region and coherent English, without mutating inputs", () => {
    const input = fixture(), before = structuredClone(input), result = planArchiveCorrection(input);
    expect(input).toEqual(before);
    const old = input.canonical.entries.find(row => row.id === input.request.corrections[0].entryId);
    expect(result.canonical.entries.find(row => row.id === old.id)).toEqual({ ...old, region: "日本" });
    expect(result.canonical.upcoming).toEqual(input.canonical.upcoming);
    expect(result.canonical.tracking).toEqual(input.canonical.tracking);
    expect(result.canonical.issueNumber).toBe(input.canonical.issueNumber);
    expect(validateEnglishOverlay(result.canonical, result.overlay).valid).toBe(true);
  });
  it("updates reviewed summary even when factual digest is unchanged", () => {
    const x=fixture(), c=x.request.corrections[0], e=x.canonical.entries.find(e=>e.id===c.entryId), en=x.overlay.entries.find(e=>e.entryId===c.entryId);
    c.expected={summary:e.summary};c.replacement={summary:e.summary+"（仅限日本商店。）"};c.englishExpected={summary:en.summary};c.englishReplacement={summary:en.summary+" This concerns Japanese stores only."};
    const result=planArchiveCorrection(x);expect(result.overlay.entries.find(e=>e.entryId===c.entryId).summary).toBe(c.englishReplacement.summary);
    expect(result.overlay.factsDigest).toBe(x.overlay.factsDigest);
  });
  it("changes non-lead headline and exact generated alt, preserving media provenance", () => {
    const x=fixture(), c=x.request.corrections[0], e=x.canonical.entries.find(e=>e.id!==x.canonical.leadEntryId), en=x.overlay.entries.find(row=>row.entryId===e.id);
    c.entryId=e.id;c.expected={headline:e.headline};c.replacement={headline:e.headline+"（内容说明）"};c.englishExpected={headline:en.headline};c.englishReplacement={headline:en.headline+" (details)"};c.evidence.sourceUrl=e.sources[0].url;
    const result=planArchiveCorrection(x), updated=result.canonical.entries.find(row=>row.id===e.id);
    expect(updated.headline).toBe(c.replacement.headline);
    for(let i=0;i<(e.images||[]).length;i++) {const old=e.images[i], next=updated.images[i];expect({...next,alt:old.alt}).toEqual(old);if(old.alt.includes(e.headline))expect(next.alt).toBe(old.alt.replaceAll(e.headline,c.replacement.headline));}
  });
  it("accepts already correct English while correcting Chinese headline", () => {
    const x=fixture(), c=x.request.corrections[0], e=x.canonical.entries.find(e=>e.id!==x.canonical.leadEntryId), en=x.overlay.entries.find(row=>row.entryId===e.id);
    c.entryId=e.id;c.expected={headline:e.headline};c.replacement={headline:e.headline+"（内容说明）"};c.englishExpected={headline:en.headline};c.englishReplacement={headline:en.headline};c.evidence.sourceUrl=e.sources[0].url;
    const result=planArchiveCorrection(x);expect(result.overlay.entries.find(row=>row.entryId===e.id).headline).toBe(en.headline);
  });
  it.each([
    ["stale archive", x => x.request.expectedArchiveBlobSha = "c".repeat(40)],
    ["stale locale", x => x.request.expectedOverlayBlobSha = "c".repeat(40)],
    ["wrong edition", x => x.request.editionId = "2026-10-17-daily"],
    ["duplicate manifest path", x => x.manifest.editions[0].path = x.manifest.editions[1].path],
    ["wrong issue", x => x.canonical.issueNumber++],
    ["unknown key", x => x.request.force = true],
    ["unknown correction field", x => x.request.corrections[0].replacement.platforms = []],
    ["duplicate correction", x => x.request.corrections.push(structuredClone(x.request.corrections[0]))],
    ["unknown entry", x => x.request.corrections[0].entryId = "unknown"],
    ["stale value", x => x.request.corrections[0].expected.region = "美国"],
    ["stale English", x => x.request.corrections[0].englishExpected.regionLabel = "Europe"],
    ["wrong English region", x => x.request.corrections[0].englishReplacement.regionLabel = "Europe"],
    ["missing English", x => x.request.corrections[0].englishReplacement = {}],
    ["external evidence", x => x.request.corrections[0].evidence.sourceUrl = "https://unreviewed.example"],
    ["empty evidence", x => x.request.corrections[0].evidence.excerpt = ""],
    ["stale overlay digest", x => x.overlay.factsDigest = "sha256:" + "0".repeat(64)],
    ["lead headline", x => { const c=x.request.corrections[0],e=x.canonical.entries.find(e=>e.id===c.entryId),en=x.overlay.entries.find(e=>e.entryId===c.entryId); c.expected={headline:e.headline};c.replacement={headline:e.headline+"修订"};c.englishExpected={headline:en.headline};c.englishReplacement={headline:en.headline+" revised"}; }],
  ])("rejects %s before mutations", (_name, mutate) => {
    const input = fixture(); mutate(input); const before = structuredClone(input);
    expect(() => planArchiveCorrection(input)).toThrow(); expect(input).toEqual(before);
  });
  it("a later invalid correction prevents a partial plan", () => {
    const input = fixture(); input.request.corrections.push({ entryId: "missing" }); const before=structuredClone(input);
    expect(() => planArchiveCorrection(input)).toThrow(); expect(input).toEqual(before);
  });
  it("rolls back first rename if a later rename fails", async () => {
    const disk = new Map([["a", "oldA"], ["b", "oldB"]]); let calls=0;
    const io = { writeFile: async(p,v)=>disk.set(p,v), rename: async(a,b)=>{if(++calls===2)throw new Error("disk failure");disk.set(b,disk.get(a));disk.delete(a);}, rm:async p=>disk.delete(p) };
    await expect(writeCorrectionTransaction([{path:"a",previous:"oldA",next:"newA"},{path:"b",previous:"oldB",next:"newB"}],io)).rejects.toThrow("disk failure");
    expect([...disk.entries()]).toEqual([["a","oldA"],["b","oldB"]]);
  });
});

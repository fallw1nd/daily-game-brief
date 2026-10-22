// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

const cli = resolve("scripts/backfill-title-translations.mjs");
const registry = JSON.parse(await readFile("config/title-translations.json", "utf8"));
const historical = await Promise.all(["2026-10-04", "2026-10-19"].map(async date => {
  const edition = JSON.parse(await readFile(`public/data/archive/2026/10/${date}-daily.json`, "utf8"));
  edition.entries = edition.entries.filter(entry => ["rs4", "c64-spectrum-handheld", "rta-in-japan"].includes(entry.title?.title_key));
  edition.upcoming = [];
  return edition;
}));

async function fixture(run) {
  const root = await mkdtemp(join(tmpdir(), "title-backfill-scope-"));
  const put = async (name, value) => { const file = join(root, name); await mkdir(resolve(file, ".."), { recursive: true }); await writeFile(file, JSON.stringify(value, null, 2) + "\n"); };
  const get = async name => JSON.parse(await readFile(join(root, name), "utf8"));
  const invoke = () => execFileSync(process.execPath, [cli], { cwd: root, encoding: "utf8" });
  try {
    await put("config/title-evidence-sources.json", JSON.parse(await readFile("config/title-evidence-sources.json", "utf8")));
    await run({ root, put, get, invoke });
  } finally { await rm(root, { recursive: true, force: true }); }
}

describe("title backfill scope and idempotency", () => {
  it("leaves already translated RS4, C64 and RTA editorial text byte-identical", async () => fixture(async ({ root, put, invoke }) => {
    await put("config/title-translations.json", registry);
    const files = [];
    for (const edition of historical) {
      const file = `public/data/archive/2026/10/${edition.id}.json`;
      await put(file, edition); files.push(file);
    }
    const before = await Promise.all(files.map(file => readFile(join(root, file), "utf8")));
    expect(invoke()).toContain("0 title occurrence(s)");
    const after = await Promise.all(files.map(file => readFile(join(root, file), "utf8")));
    expect(after).toEqual(before);
  }));

  it("fills only missing matched titles, synchronizes their display fields, and is a no-op on replay", async () => fixture(async ({ root, put, get, invoke }) => {
    const registered = { titleZhCn: "测试新作", titleZhStatus: "official_simplified", titleEnAliases: ["New Adventure", "Adventure Alias"] };
    await put("config/title-translations.json", { ...registry, translations: { ...registry.translations, "new-adventure": registered, "unrelated-example": { titleZhCn: "无关别名", titleZhStatus: "common_translation", titleEnAliases: ["Unrelated Example"] } } });
    const entry = { id: "new-entry", title: { title_key: "different-key", title_en: "Adventure Alias", title_zh_status: "unavailable" }, headline: "《Adventure Alias》公布，Unrelated Example 未变", summary: "New Adventure 即将推出；Unrelated Example 保持编辑原文。", images: [{ kind: "editorial", alt: "Adventure Alias：《Adventure Alias》公布，Unrelated Example 未变相关配图" }, { kind: "editorial", alt: "Adventure Alias 的手写图片说明" }] };
    const edition = { id: "2026-10-22-daily", issueNumber: 73, windowStart: "fixed-start", windowEnd: "fixed-end", leadEntryId: entry.id, archiveTitle: "日报｜《Adventure Alias》公布", entries: [entry, ...historical[0].entries], upcoming: [{ id: "calendar", title: { title_key: "new-adventure", title_en: "New Adventure", title_zh_status: "unavailable" } }] };
    const archive = "public/data/archive/2026/10/2026-10-22-daily.json";
    await put(archive, edition); await put("public/data/latest.json", edition);
    await put("public/data/manifest.json", { latest: edition.id, editions: [{ id: edition.id, issueNumber: 73, archiveTitle: edition.archiveTitle }] });
    invoke();
    const updated = await get(archive);
    expect(updated.entries[0].title).toMatchObject({ title_zh_cn: "测试新作", title_zh_status: "official_simplified" });
    expect(updated.entries[0].headline).toBe("《测试新作》公布，Unrelated Example 未变");
    expect(updated.entries[0].summary).toBe("测试新作 即将推出；Unrelated Example 保持编辑原文。");
    expect(updated.entries[0].images[0].alt).toBe("测试新作：《测试新作》公布，Unrelated Example 未变相关配图");
    expect(updated.entries[0].images[1].alt).toBe(entry.images[1].alt);
    expect(updated.entries.slice(1)).toEqual(historical[0].entries);
    expect(updated.upcoming[0].title.title_zh_cn).toBe("测试新作");
    expect(updated).toMatchObject({ id: edition.id, issueNumber: 73, windowStart: "fixed-start", windowEnd: "fixed-end", archiveTitle: "日报｜《测试新作》公布" });
    expect(await get("public/data/latest.json")).toEqual(updated);
    expect((await get("public/data/manifest.json")).editions[0].archiveTitle).toBe(updated.archiveTitle);
    const files = [archive, "public/data/latest.json", "public/data/manifest.json"];
    const before = await Promise.all(files.map(file => readFile(join(root, file), "utf8")));
    expect(invoke()).toContain("0 title occurrence(s)");
    expect(await Promise.all(files.map(file => readFile(join(root, file), "utf8")))).toEqual(before);
  }));
});

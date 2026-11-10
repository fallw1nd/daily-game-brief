import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { discoverFromSource, processEdition } from "./enrich-media.mjs";
import { identifyProductTitle } from "./lib/media-product-identity.mjs";

const sku = "EP1004-PPSA01547_00-GTAVISTANDARD001";
const psnUrl = `https://store.playstation.com/zh-hans-hk/product/${sku}`;
const imageUrl = "https://image.api.playstation.com/vulcan/ap/rnd/cover.png";
const title = "Grand Theft Auto VI (韩语, 简体中文, 繁体中文, 英语)";
const record = {
  id: "2026-11-19-grand-theft-auto-vi-ps5-xsx",
  title: { title_key: "grand-theft-auto-vi", title_en: "Grand Theft Auto VI", title_zh_cn: "侠盗猎车手VI" },
  platforms: ["PS5", "Xbox Series X|S"],
  date: "11.19",
  cover_status: "unavailable",
  coverNote: "未取得封面",
};
const source = { label: "PlayStation Store 香港（简体中文）", url: psnUrl, kind: "primary" };
const fixture = (product = {}, pageTitle = title) => `
<link rel="preconnect" href="https://image.api.playstation.com">
<script type="application/json">{"background":"https://image.api.playstation.com/vulcan/background.png"}</script>
<script id="mfe-jsonld-tags" type="application/ld+json">${JSON.stringify({ "@type": "Product", sku, name: title, image: imageUrl, ...product })}</script>
<title>${pageTitle}</title>`;
const pageFetcher = (html) => async (url) => ({ bytes: Buffer.from(html), contentType: "text/html", url });

let roots = [];
afterEach(async () => {
  await Promise.all(roots.map(root => rm(root, { recursive: true, force: true })));
  roots = [];
});

describe("PlayStation language chrome", () => {
  it.each([
    "Grand Theft Auto VI (韩语, 简体中文, 繁体中文, 英语)",
    "Grand Theft Auto VI (中英韩文版)",
    "Grand Theft Auto VI（中英韓文版）",
    "Grand Theft Auto VI (English/Chinese/Korean Ver.)",
  ])("accepts only language availability after the exact name: %s", name => {
    expect(identifyProductTitle(record, { documentTitle: name }, psnUrl).status).toBe("match");
    expect(identifyProductTitle(record, { documentTitle: name }, "https://example.com/game").status).toBe("mismatch");
  });

  it.each([
    "Grand Theft Auto VI：终极版 (中英韩文版)",
    "Grand Theft Auto VI (Ultimate Edition)",
    "Grand Theft Auto VI (English/Deluxe Ver.)",
    "Grand Theft Auto VI：终极版升级 (中英韩文版)",
    "Grand Theft Auto V (中英韩文版)",
  ])("retains edition, add-on, and sequel distinctions: %s", name => {
    expect(identifyProductTitle(record, { documentTitle: name }, psnUrl).status).toBe("mismatch");
  });
});

describe("PlayStation product image extraction", () => {
  it("reads the exact SKU image, never the preconnect host or an unrelated background", async () => {
    const result = await discoverFromSource(source, record, { kind: "cover", fetchPage: pageFetcher(fixture()) });
    expect(result.imageUrl).toBe(imageUrl);
    expect(result.pageUrl).toBe(psnUrl);
  });

  it("rejects an upsell SKU, non-product data, ambiguous products, and untrusted image hosts", async () => {
    for (const html of [
      fixture({ sku: "EP1004-PPSA01547_00-GTAVIULTIMATE001" }),
      fixture({ "@type": "Article" }),
      fixture() + fixture(),
      fixture({ image: "https://images.example/cover.png" }),
      fixture({ image: "https://image.api.playstation.com" }),
    ]) {
      await expect(discoverFromSource(source, record, { kind: "cover", fetchPage: pageFetcher(html) })).rejects.toThrow("no usable social image");
    }
  });

  it("requires structured and document names to agree and match the requested edition", async () => {
    for (const html of [
      fixture({ name: "Grand Theft Auto V" }),
      fixture({}, "Grand Theft Auto VI：终极版 (中英韩文版)"),
      fixture({ name: "Grand Theft Auto VI：终极版 (中英韩文版)" }, "Grand Theft Auto VI：终极版 (中英韩文版)"),
    ]) {
      await expect(discoverFromSource(source, record, { kind: "cover", fetchPage: pageFetcher(html) })).rejects.toThrow(/no definitive product title|does not match/);
    }
  });

  it("uses one exact-title concept Product but still rejects a different edition", async () => {
    const concept = { ...source, url: "https://store.playstation.com/zh-hans-hk/concept/10000730" };
    expect((await discoverFromSource(concept, record, { kind: "cover", fetchPage: pageFetcher(fixture()) })).imageUrl).toBe(imageUrl);
    await expect(discoverFromSource(concept, record, { kind: "cover", fetchPage: pageFetcher(fixture({name: "Grand Theft Auto VI Ultimate Edition"}, "Grand Theft Auto VI Ultimate Edition")) })).rejects.toThrow("does not match");
  });

  it("retains normal social metadata fallback without accepting arbitrary page images", async () => {
    const html = `<script type="application/ld+json">not json</script><title>Grand Theft Auto VI</title><meta property="og:image" content="${imageUrl}">`;
    expect((await discoverFromSource(source, record, { kind: "cover", fetchPage: pageFetcher(html) })).imageUrl).toBe(imageUrl);
    await expect(discoverFromSource({...source,url:"https://example.com/product/game"}, record, {kind:"cover",fetchPage:pageFetcher(fixture())})).rejects.toThrow("no usable social image");
  });
});

async function repairFixture({ failSources = [], apply = true } = {}) {
  const root = await mkdtemp(join(tmpdir(), "daily-game-brief-psn-"));
  roots.push(root);
  const fallbackUrls = [
    "https://store.playstation.com/en-hk/product/game",
    "https://store.playstation.com/en-us/product/game",
    "https://www.nintendo.com/us/store/products/game/",
    "https://www.xbox.com/en-us/games/store/game/id",
    "https://publisher.example/game",
  ];
  const mediaSources = fallbackUrls.slice().reverse().map(url => ({ label: "Official store", url, kind: "primary" }));
  const edition = {
    id: "2026-11-10-daily", date: "2026-11-10", issueNumber: 92,
    entries: [{ id: "untouched-news", headline: "Untouched news" }],
    upcoming: [{ ...record, mediaSources }, { id: "untouched-calendar", title: { title_en: "Other Game" } }],
  };
  await writeFile(join(root, "edition.json"), JSON.stringify(edition));
  const png = await sharp({ create: { width: 600, height: 600, channels: 3, background: "#aabbcc" } }).png().toBuffer();
  const opened = [];
  const result = await processEdition({ id: edition.id, path: "edition.json" }, {
    apply, dataRoot: root, publicRoot: join(root, "public"), recordId: record.id, revalidateCoverId: record.id,
    catalog: { games: { "grand-theft-auto-vi": { mediaSources: [source] } } },
    fetchPage: async url => {
      opened.push(url);
      if (failSources.includes(url)) throw new Error("source unavailable");
      return pageFetcher(url === psnUrl ? fixture() : `<title>Grand Theft Auto VI</title><meta property="og:image" content="${imageUrl}">`)(url);
    },
    fetchImage: async url => ({ bytes: png, contentType: "image/png", url }),
  });
  return { result, opened, edition, fallbackUrls, saved: JSON.parse(await readFile(join(root, "edition.json"), "utf8")) };
}

describe("bounded missing-cover repair", () => {
  it("fills an absent cover from preferred Hong Kong Simplified Chinese without touching other records", async () => {
    const { result, opened, edition, saved } = await repairFixture();
    expect(result.results).toHaveLength(1);
    expect(result.results[0].status).toBe("applied");
    expect(opened).toEqual([psnUrl]);
    expect(saved.upcoming[0].cover).toMatchObject({ sourceUrl: psnUrl, aspect: "square", alt: "侠盗猎车手VI游戏封面" });
    expect(saved.upcoming[0].cover_status).toBe("verified");
    expect(saved.upcoming[0].coverNote).toBeUndefined();
    expect(saved.entries).toEqual(edition.entries);
    expect(saved.upcoming[1]).toEqual(edition.upcoming[1]);
    const {cover, cover_status, coverNote, ...facts} = saved.upcoming[0];
    const {cover_status: beforeStatus, coverNote: beforeNote, ...beforeFacts} = edition.upcoming[0];
    expect(facts).toEqual(beforeFacts);
    expect(saved.issueNumber).toBe(edition.issueNumber);
  });

  it("falls back through other PSN regions, Nintendo, then Xbox without a search", async () => {
    const otherPsn = ["https://store.playstation.com/en-hk/product/game", "https://store.playstation.com/en-us/product/game"];
    const nintendo = "https://www.nintendo.com/us/store/products/game/";
    const { opened, saved } = await repairFixture({failSources:[psnUrl,...otherPsn,nintendo]});
    expect(opened).toEqual([psnUrl, ...otherPsn, nintendo, "https://www.xbox.com/en-us/games/store/game/id"]);
    expect(saved.upcoming[0].cover.sourceUrl).toBe(opened.at(-1));
  });

  it("keeps missing-cover audit read-only", async () => {
    const { result, saved, edition } = await repairFixture({ apply: false });
    expect(result.changed).toBe(false);
    expect(result.results[0].status).toBe("candidate");
    expect(saved).toEqual(edition);
  });
});

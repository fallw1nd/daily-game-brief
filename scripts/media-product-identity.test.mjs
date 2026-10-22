import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { discoverFromSource, processEdition, resolveRecord } from "./enrich-media.mjs";
import { identifyProductTitle } from "./lib/media-product-identity.mjs";

it("ignores trademark marks before compatibility normalization and PSN platform chrome", () => {
  expect(identifyProductTitle({title:{title_en:"Helldivers 2"}}, {openGraphTitle:"HELLDIVERS™ 2"}, "https://store.playstation.com/en-us/concept/10000657").status).toBe("match");
  const metadata = {openGraphTitle:"Resident Evil 4 Gold Edition PS4 & PS5"};
  expect(identifyProductTitle({title:{title_en:"Resident Evil 4 Gold Edition"}}, metadata, "https://store.playstation.com/en-us/product/game").status).toBe("match");
  expect(identifyProductTitle({title:{title_en:"Resident Evil 4"}}, metadata, "https://store.playstation.com/en-us/product/game").status).toBe("mismatch");
});

describe("Xbox product chrome", () => {
  const record = { title: { title_en: "CyberBot: Zero" } };
  it("strips Buy and platform chrome only on Xbox", () => {
    const metadata = { documentTitle: "Buy CyberBot: Zero (Xbox Series) | XBOX" };
    expect(identifyProductTitle(record, metadata, "https://www.xbox.com/en-us/games/store/game/id").status).toBe("match");
    expect(identifyProductTitle(record, metadata, "https://example.com/game").status).toBe("mismatch");
    expect(identifyProductTitle(record, {documentTitle:"Buy CyberBot: Zero Deluxe Edition | XBOX"}, "https://www.xbox.com/en-us/games/store/game/id").status).toBe("mismatch");
  });
});

it("uses the verified Warrior Cats alias without admitting a different edition", () => {
  const record = {title:{title_en:"Warrior Cats: Clan of the Forest"},titleAliases:["Warrior Cats: Clans of the Forest"]};
  const url = "https://www.xbox.com/en-us/games/store/warrior-cats-clans-of-the-forest/9n9rtllldnd7";
  expect(identifyProductTitle(record,{documentTitle:"Buy Warrior Cats: Clans of the Forest | XBOX"},url).status).toBe("match");
  expect(identifyProductTitle(record,{documentTitle:"Buy Warrior Cats: Clans of the Forest Deluxe Edition | XBOX"},url).status).toBe("mismatch");
});

describe("Nintendo platform suffixes", () => {
  const record = { title: { title_en: "Tales of Eternia Remastered" } };
  it("accepts matching Nintendo titles with platform chrome across metadata fields", () => {
    expect(identifyProductTitle(record, {
      openGraphTitle: "Tales of Eternia Remastered for Nintendo Switch 2",
      documentTitle: "Tales of Eternia Remastered for Nintendo Switch 2 - Nintendo Official Site",
    }, "https://www.nintendo.com/us/store/products/tales-of-eternia-remastered-switch-2/").status).toBe("match");
    expect(identifyProductTitle({title:{title_en:"Nintendo Switch Sports Resort"}}, {
      documentTitle: "Nintendo Switch Sports Resort – Nintendo Switch 2 Exclusive - Nintendo Official Site",
    }, "https://www.nintendo.com/us/store/products/nintendo-switch-sports-resort-switch-2/").status).toBe("match");
  });
  it("does not erase edition differences or normalize a different host", () => {
    const metadata = {documentTitle:"Tales of Eternia Remastered Deluxe Edition for Nintendo Switch 2 - Nintendo Official Site"};
    expect(identifyProductTitle(record, metadata, "https://www.nintendo.com/us/store/products/game/").status).toBe("mismatch");
    expect(identifyProductTitle(record, {documentTitle:"Tales of Eternia Remastered for Nintendo Switch 2"}, "https://example.com/game").status).toBe("mismatch");
  });
});

const wrongSteamUrl = "https://store.steampowered.com/app/1966720/End_of_Abyss/";
const correctStoreUrl = "https://www.xbox.com/en-us/games/store/end-of-abyss/9n7qx8c7nsh2";
const game = {
  id: "upcoming-end-of-abyss",
  title: { title_key: "end-of-abyss", title_en: "End of Abyss" },
};

const htmlFixture = ({
  productTitle,
  steamAppName = productTitle.replace(/\s+on\s+Steam$/i, ""),
  documentTitle = productTitle,
  description = "",
  imageUrl = "https://images.example/cover.jpg",
}) => Buffer.from(`<!doctype html>
<html><head>
  <meta property="og:title" content="${productTitle}">
  <meta property="og:description" content="${description}">
  <meta property="og:image" content="${imageUrl}">
  <title>${documentTitle}</title>
</head><body>${steamAppName ? `<div class="apphub_AppName">${steamAppName}</div>` : ""}</body></html>`);

const wrongGameHtml = htmlFixture({
  productTitle: "End of Abyss on Steam",
  steamAppName: "Lethal Company",
  description: "End of Abyss release news and details",
});
const matchingGameHtml = htmlFixture({ productTitle: "End of Abyss on Steam", steamAppName: "End of Abyss" });
const sequelHtml = htmlFixture({
  productTitle: "End of Abyss II on Steam",
  steamAppName: "End of Abyss II",
  description: "The original End of Abyss is also available.",
});

let tempRoots = [];
async function temporaryRoot() {
  const root = await mkdtemp(join(tmpdir(), "daily-game-brief-media-identity-"));
  tempRoots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(tempRoots.map((path) => rm(path, { recursive: true, force: true })));
  tempRoots = [];
});

function fixtureFetchPage(pages) {
  return async (url) => {
    const value = pages.get(url);
    if (value instanceof Error) throw value;
    if (!value) throw new Error(`offline fixture has no page for ${url}`);
    return { bytes: value, contentType: "text/html; charset=utf-8", url };
  };
}

async function coverResolver(sourceUrl, page, { kind = "primary", webSearch = false, imageUrl = null } = {}) {
  const root = await temporaryRoot();
  const png = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#345678" } }).png().toBuffer();
  return resolveRecord(
    { id: "2026-09-29-daily", date: "2026-09-29" },
    game,
    "cover",
    [{ label: "Product store", url: sourceUrl, kind, webSearch, ...(imageUrl ? { imageUrl } : {}) }],
    true,
    {
      publicRoot: join(root, "public"),
      fetchPage: fixtureFetchPage(new Map([[sourceUrl, page]])),
      fetchImage: async (url) => ({ bytes: png, contentType: "image/png", url }),
    },
  );
}

describe("cover identity through the media resolver", () => {
  it("follows an exact roundup link but verifies the opened product independently", async () => {
    const roundup = "https://news.xbox.com/en-us/2026/10/16/next-week-on-xbox/";
    const pages = new Map([[roundup, Buffer.from(`<title>Next Week on Xbox</title><a href="${correctStoreUrl}">End of Abyss – October 22</a>`)],[correctStoreUrl,htmlFixture({productTitle:"Buy End of Abyss | XBOX"})]]);
    const result = await discoverFromSource({url:roundup,kind:"primary"},game,{kind:"cover",fetchPage:fixtureFetchPage(pages)});
    expect(result.pageUrl).toBe(correctStoreUrl);
    pages.set(correctStoreUrl,htmlFixture({productTitle:"Buy End of Abyss Deluxe Edition | XBOX"}));
    await expect(discoverFromSource({url:roundup,kind:"primary"},game,{kind:"cover",fetchPage:fixtureFetchPage(pages)})).rejects.toThrow("does not match");
  });

  it("reads Xbox product box art without social metadata and requests usable dimensions", async () => {
    const result = await coverResolver(correctStoreUrl, Buffer.from(`<title>Buy End of Abyss | XBOX</title><img data-testID="ProductDetailsHeaderBoxArt" src="https://store-images.s-microsoft.com/image/apps.exact?w=177&amp;h=265" alt="End of Abyss">`));
    expect(result.status).toBe("applied");
    expect(result.imageUrl).toBe("https://store-images.s-microsoft.com/image/apps.exact?w=600&h=900");
    const wrong = await coverResolver(correctStoreUrl, Buffer.from(`<title>Buy Other Game | XBOX</title><img data-testID="ProductDetailsHeaderBoxArt" src="https://store-images.s-microsoft.com/image/apps.exact?w=177&amp;h=265">`));
    expect(wrong.status).toBe("unavailable");
  });
  it("decodes numeric apostrophe entities before exact identity checks", async () => {
    const result = await coverResolver(correctStoreUrl, htmlFixture({productTitle:"End of Abyss&#x27;",documentTitle:"End of Abyss&#39;"}));
    expect(result.status).toBe("applied");
  });

  it("rejects Steam app 1966720 even when its URL slug and description say End of Abyss", async () => {
    const results = await Promise.all([
      coverResolver(wrongSteamUrl, wrongGameHtml, { kind: "primary" }), // catalog source
      coverResolver(wrongSteamUrl, wrongGameHtml, { kind: "secondary" }), // direct record source
      coverResolver("https://images.example/End_of_Abyss.jpg", wrongGameHtml, {
        kind: "primary",
        imageUrl: "https://images.example/End_of_Abyss.jpg",
      }),
    ]);

    for (const result of results.slice(0, 2)) {
      expect(result.status).toBe("unavailable");
      expect(result.attempts[0].error).toContain("Lethal Company");
    }
    expect(results[2].status).toBe("unavailable");
    expect(results[2].attempts[0].error).toContain("opened product page");
  });

  it("accepts the exact product page title", async () => {
    const result = await coverResolver(wrongSteamUrl, matchingGameHtml, { kind: "primary" });

    expect(result.status).toBe("applied");
    expect(result.asset.sourceUrl).toBe(wrongSteamUrl);
  });

  it("does not accept a partial sequel match from the description", async () => {
    const result = await coverResolver(wrongSteamUrl, sequelHtml, { kind: "primary" });

    expect(result.status).toBe("unavailable");
    expect(result.attempts[0].error).toContain("End of Abyss II");
  });
});

function editionFixture(oldSourceUrl = wrongSteamUrl) {
  const untouched = {
    id: "upcoming-other-game",
    title: { title_key: "other-game", title_en: "Other Game" },
    cover_status: "verified",
    cover: { url: "media/other.jpg", sourceUrl: "https://store.example/other", kind: "cover" },
  };
  return {
    id: "2026-09-29-daily",
    date: "2026-09-29",
    entries: [],
    upcoming: [{
      ...game,
      platforms: ["Xbox"],
      source: { label: "Xbox Store", url: correctStoreUrl, kind: "primary" },
      mediaSources: [{ label: "Xbox Store", url: correctStoreUrl, kind: "primary" }],
      cover_status: "verified",
      cover: { url: "media/wrong.jpg", sourceUrl: oldSourceUrl, kind: "cover", aspect: "landscape" },
    }, untouched],
  };
}

async function runRevalidation({
  oldPage = wrongGameHtml,
  oldSourceUrl = wrongSteamUrl,
  replacementPage = htmlFixture({ productTitle: "End of Abyss | Xbox" }),
} = {}) {
  const root = await temporaryRoot();
  const dataRoot = join(root, "data");
  const publicRoot = join(root, "public");
  const edition = editionFixture(oldSourceUrl);
  await writeFile(join(root, "edition.json"), JSON.stringify(edition));
  const png = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#765432" } }).png().toBuffer();
  const options = {
    apply: true,
    recordId: game.id,
    revalidateCoverId: game.id,
    dataRoot,
    publicRoot,
    catalog: { games: {} },
    sourcePolicy: {},
    fetchPage: fixtureFetchPage(new Map([
      [oldSourceUrl, oldPage],
      [correctStoreUrl, replacementPage],
    ])),
    fetchImage: async (url) => ({ bytes: png, contentType: "image/png", url }),
  };
  const result = await processEdition({ id: edition.id, path: "../edition.json" }, options);
  const saved = JSON.parse(await readFile(join(root, "edition.json"), "utf8"));
  return { result, saved, edition };
}

describe("bounded single-record cover revalidation", () => {
  it("replaces a confirmed wrong-game cover and leaves every other record untouched", async () => {
    const { result, saved, edition } = await runRevalidation();

    expect(result.results).toHaveLength(1);
    expect(result.results[0]).toMatchObject({ status: "applied", identityMismatch: "Lethal Company" });
    expect(saved.upcoming[0].cover_status).toBe("verified");
    expect(saved.upcoming[0].cover.sourceUrl).toBe(correctStoreUrl);
    expect(saved.upcoming[0].cover.url).toContain("2026/09/2026-09-29-daily");
    expect(saved.upcoming[0].cover.url).not.toContain("2026-09-26-daily");
    expect(saved.upcoming[1]).toEqual(edition.upcoming[1]);
  });

  it("keeps an existing verified cover when its source page cannot be fetched", async () => {
    const root = await temporaryRoot();
    const edition = editionFixture();
    const originalCover = structuredClone(edition.upcoming[0].cover);
    await writeFile(join(root, "edition.json"), JSON.stringify(edition));
    const result = await processEdition({ id: edition.id, path: "../edition.json" }, {
      apply: true,
      recordId: game.id,
      revalidateCoverId: game.id,
      dataRoot: join(root, "data"),
      publicRoot: join(root, "public"),
      catalog: { games: {} },
      sourcePolicy: {},
      fetchPage: async () => { throw new Error("offline network"); },
    });

    expect(result.changed).toBe(false);
    expect(result.results[0]).toMatchObject({ status: "preserved", error: expect.stringContaining("retained it") });
    const saved = JSON.parse(await readFile(join(root, "edition.json"), "utf8"));
    expect(saved.upcoming[0].cover_status).toBe("verified");
    expect(saved.upcoming[0].cover).toEqual(originalCover);
    expect(saved.upcoming[1]).toEqual(edition.upcoming[1]);
  });

  it.each(["Access Denied", "Age Check", "Checking your browser", "Error 403"])(
    "keeps an existing verified cover when a 200 response is an interstitial/error page (%s)",
    async (documentTitle) => {
      const { result, saved, edition } = await runRevalidation({
        oldPage: htmlFixture({ productTitle: "End of Abyss on Steam", steamAppName: "", documentTitle }),
      });

      expect(result.changed).toBe(false);
      expect(result.results[0].status).toBe("preserved");
      expect(result.results[0].error).toContain("retained the verified cover");
      expect(saved.upcoming[0].cover_status).toBe("verified");
      expect(saved.upcoming[0].cover).toEqual(edition.upcoming[0].cover);
      expect(saved.upcoming[1]).toEqual(edition.upcoming[1]);
    },
  );

  it("keeps the old cover when open-graph and document product titles conflict", async () => {
    const oldSourceUrl = "https://www.xbox.com/en-us/games/store/old-cover-source";
    const { result, saved, edition } = await runRevalidation({
      oldSourceUrl,
      oldPage: htmlFixture({ productTitle: "End of Abyss", documentTitle: "Lethal Company" }),
    });

    expect(result.changed).toBe(false);
    expect(result.results[0]).toMatchObject({ status: "preserved", error: expect.stringContaining("no definitive product title") });
    expect(saved.upcoming[0].cover_status).toBe("verified");
    expect(saved.upcoming[0].cover).toEqual(edition.upcoming[0].cover);
    expect(saved.upcoming[1]).toEqual(edition.upcoming[1]);
  });

  it("marks only the selected cover unavailable when mismatch is certain but replacements fail", async () => {
    const { result, saved, edition } = await runRevalidation({
      replacementPage: htmlFixture({ productTitle: "Another Product | Xbox" }),
    });

    expect(result.results[0]).toMatchObject({ status: "unavailable", identityMismatch: "Lethal Company" });
    expect(saved.upcoming[0].cover).toBeUndefined();
    expect(saved.upcoming[0].cover_status).toBe("unavailable");
    expect(saved.upcoming[0].coverNote).toContain("Lethal Company");
    expect(saved.upcoming[1]).toEqual(edition.upcoming[1]);
  });
});

describe("persisted unavailable media reasons", () => {
  it("persists stable story and cover failure notes, is idempotent, and stays within record scope", async () => {
    const root = await temporaryRoot();
    const storyUrl = "https://news.example/story";
    const verifiedStory = {
      id: "story-with-verified-image",
      headline: "Verified story",
      images: [{ url: "media/verified.jpg", kind: "editorial", sourceUrl: "https://news.example/verified" }],
      image_status: "verified",
    };
    const verifiedCover = {
      id: "upcoming-verified-game",
      title: { title_key: "verified-game", title_en: "Verified Game" },
      cover_status: "verified",
      cover: { url: "media/verified-cover.jpg", sourceUrl: "https://store.example/verified", kind: "cover" },
    };
    const outsideRecord = { id: "upcoming-outside-scope", cover_status: "unavailable", coverNote: "existing note" };
    const edition = {
      id: "2026-09-29-daily",
      date: "2026-09-29",
      entries: [
        { id: "story-failure", headline: "A game update", sources: [{ label: "News page", url: storyUrl, kind: "secondary" }] },
        verifiedStory,
      ],
      upcoming: [
        {
          ...game,
          platforms: ["Xbox"],
          source: { label: "Xbox Store", url: correctStoreUrl, kind: "primary" },
          mediaSources: [{ label: "Xbox Store", url: correctStoreUrl, kind: "primary" }],
        },
        verifiedCover,
        outsideRecord,
      ],
    };
    await writeFile(join(root, "edition.json"), JSON.stringify(edition));
    const pageWithoutImage = Buffer.from("<html><head><title>Story</title></head><body>News</body></html>");
    const png = await sharp({ create: { width: 400, height: 600, channels: 3, background: "#765432" } }).png().toBuffer();
    const options = {
      apply: true,
      dataRoot: join(root, "data"),
      publicRoot: join(root, "public"),
      catalog: { games: {} },
      sourcePolicy: {},
      fetchPage: fixtureFetchPage(new Map([
        [storyUrl, pageWithoutImage],
        [correctStoreUrl, htmlFixture({ productTitle: "Another Product | Xbox", steamAppName: "" })],
      ])),
      fetchImage: async (url) => ({ bytes: png, contentType: "image/png", url }),
    };
    const manifestItem = { id: edition.id, path: "../edition.json" };

    const storyFirst = await processEdition(manifestItem, { ...options, recordId: "story-failure" });
    expect(storyFirst.changed).toBe(true);
    expect(storyFirst.results[0].status).toBe("unavailable");
    const afterStory = JSON.parse(await readFile(join(root, "edition.json"), "utf8"));
    expect(afterStory.entries[0]).toMatchObject({
      image_status: "unavailable",
      imageNote: "未能取得已核验配图：来源页面没有可用图片。",
    });
    expect(afterStory.entries[0].imageNote).not.toContain("交给异步媒体流程补全");

    const storyAgain = await processEdition(manifestItem, { ...options, recordId: "story-failure" });
    expect(storyAgain.changed).toBe(false);
    expect(storyAgain.results[0].status).toBe("unavailable");

    const coverFirst = await processEdition(manifestItem, { ...options, recordId: game.id });
    expect(coverFirst.changed).toBe(true);
    expect(coverFirst.results[0].status).toBe("unavailable");
    const afterCover = JSON.parse(await readFile(join(root, "edition.json"), "utf8"));
    expect(afterCover.upcoming[0]).toMatchObject({
      cover_status: "unavailable",
      coverNote: "未能取得已核验封面：来源页面商品身份与记录不符。",
    });
    expect(afterCover.upcoming[0].coverNote).not.toContain("Lethal Company");

    const coverAgain = await processEdition(manifestItem, { ...options, recordId: game.id });
    expect(coverAgain.changed).toBe(false);
    expect(coverAgain.results[0].status).toBe("unavailable");
    const final = JSON.parse(await readFile(join(root, "edition.json"), "utf8"));
    expect(final.entries[1]).toEqual(verifiedStory);
    expect(final.upcoming[1]).toEqual(verifiedCover);
    expect(final.upcoming[2]).toEqual(outsideRecord);
  });

  it("does not turn a review candidate into an unavailable note", async () => {
    const root = await temporaryRoot();
    const edition = {
      id: "2026-09-29-daily",
      date: "2026-09-29",
      entries: [{
        id: "story-candidate",
        headline: "A game update",
        sources: [{ label: "Unreviewed source", url: "https://news.example/candidate", kind: "discovery" }],
      }],
      upcoming: [],
    };
    await writeFile(join(root, "edition.json"), JSON.stringify(edition));
    const png = await sharp({ create: { width: 640, height: 360, channels: 3, background: "#123456" } }).png().toBuffer();
    const result = await processEdition({ id: edition.id, path: "../edition.json" }, {
      apply: true,
      recordId: "story-candidate",
      dataRoot: join(root, "data"),
      publicRoot: join(root, "public"),
      catalog: { games: {} },
      sourcePolicy: {},
      fetchPage: fixtureFetchPage(new Map([[
        "https://news.example/candidate",
        htmlFixture({ productTitle: "A game update" }),
      ]])),
      fetchImage: async (url) => ({ bytes: png, contentType: "image/png", url }),
    });

    expect(result.results[0].status).toBe("candidate");
    expect(result.changed).toBe(false);
    const saved = JSON.parse(await readFile(join(root, "edition.json"), "utf8"));
    expect(saved.entries[0]).toEqual(edition.entries[0]);
  });
});

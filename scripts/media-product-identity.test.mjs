import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";
import { processEdition, resolveRecord } from "./enrich-media.mjs";

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

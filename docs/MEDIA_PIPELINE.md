# Media Pipeline

The media pipeline enriches an edition after publication, opens listed source pages, validates the image response, converts accepted assets to JPEG, and publishes the validated data and files directly to `main`. It then dispatches the normal Pages deployment.

## Cover priority

For multi-platform games, use the first verified source available in this order:

1. PlayStation Store (prefer Hong Kong and Simplified Chinese) product art.
2. Nintendo eShop Japan or another traceable Nintendo product page.
3. Microsoft/Xbox Store, Steam, publisher stores, and media rooms.
4. The user-supplied discovery sites for edition identification.
5. Open-web image search when the listed chain produces no usable result.

Storefront URLs belong in config/media-catalog.json for reuse or in an upcoming item's mediaSources. Query parameters may be removed only on known PlayStation, Nintendo, and Microsoft image CDNs. Keep the original product page as sourceUrl.

Source order is a reliability preference, not an eligibility gate or a shape requirement. Accept square, portrait, or landscape covers and preserve the source orientation. Official storefront banners, publisher key art, official screenshots, and Steam header art are valid covers when they clearly depict the same title.

If official storefronts and publisher pages yield no usable asset, a reputable media report, reliable retailer, or recognized game database may supply same-title artwork when the exact source page is opened, the game/edition match is checked, and the rights holder can be credited. Prefer downloading these assets into the repository instead of hotlinking the third-party host. Credit the actual developer, publisher, or rights holder—not merely the page host.

Search results must use the original image URL and source page, never a search-engine thumbnail. Fan art, unrelated images, watermarked composites, and images without an accessible source page remain prohibited. Cover credit remains in JSON but is not rendered as a visible caption.

The repository script can use Brave Image Search after listed sources fail when `BRAVE_SEARCH_API_KEY` is present. Without that variable it safely continues with item-level sources supplied by the scheduled ChatGPT task.

MobyGames, LaunchBox Games Database, Glitchwave, Gavas, and Refuge are not automatic image sources. MobyGames requires its licensed API plan and attribution; Gavas prohibits unapproved reproduction and image hotlinking; the remaining sites lack a confirmed machine-readable reuse permission or block automation. They may help a human identify an edition, but the final asset must resolve to an approved original source.

## Editorial fallback ladder

For news images, stop after the first verified match in this order:

1. The exact official news page's social image.
2. The thumbnail of the exact primary official YouTube upload.
3. Official key art, cover, store art, or screenshot for the same game or company.
4. A specific unavailable note when no candidate passes validation.

An exact official-upload thumbnail is not a search-result thumbnail. The source must be the opened primary video URL, the script must derive the video ID, and the image response must pass type, size, and dimension checks. The downloader tries `maxresdefault`, `hq720`, `sddefault`, then `hqdefault` and saves the first valid result locally. Do not use another channel's reupload or a merely similar game image.

## Automatic checks

Run npm run media:audit for a read-only report or npm run media:enrich for the latest edition. The tool:

- accepts HTTPS only and rejects local/private network targets;
- limits HTML to 3 MB and images to 15 MB;
- requires at least 320×320 pixels;
- crops editorial images to 16:9;
- preserves cover orientation as square, portrait, or landscape;
- encodes JPEG at no more than 500 KB;
- writes to public/media/briefs/YYYY/MM/<edition-id>/;
- records a specific unavailable reason instead of forcing a mismatch.

The editorial publisher dispatches the workflow for the exact edition immediately after publication. Scheduled runs at 10:35 and 17:25 Asia/Shanghai remain as idempotent recovery checks. A media update reaches `main` only after source, image, schema, test, type, data, and build checks succeed.

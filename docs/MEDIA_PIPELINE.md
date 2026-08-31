# Media Pipeline

The media pipeline enriches an edition after Canonical publication, opens listed source pages, validates the image response, converts accepted assets to JPEG, and publishes the validated data and files directly to `main`. It then dispatches the normal Pages deployment.

For the future Daily cadence, Canonical publication is intentionally scheduled ahead of the 12:00 public release so exact-edition media enrichment can run in the staging interval. Daily evidence closes at 10:10, the editorial handoff runs at 10:20, Canonical SLA recovery is 11:00, scheduled media recovery is 11:10, and Pages holds the Daily deployment until `plannedAt=12:00`. This timing is precutover-only until formal production authorization; legacy AM/PM schedules remain active meanwhile.

## Cover priority

For multi-platform games, use the first verified source available in this order:

1. PlayStation Store (prefer Hong Kong and Simplified Chinese) product art.
2. Nintendo eShop Japan or another traceable Nintendo product page.
3. Microsoft/Xbox Store, Steam, publisher stores, and media rooms.
4. The user-supplied discovery sites for edition identification.
5. DeepSeek-assisted open-web source discovery when the listed chain produces no usable result.

Storefront URLs belong in config/media-catalog.json for reuse or in an upcoming item's mediaSources. Query parameters may be removed only on known PlayStation, Nintendo, and Microsoft image CDNs. Keep the original product page as sourceUrl.

Source order is a reliability preference, not an eligibility gate or a shape requirement. Accept square, portrait, or landscape covers and preserve the source orientation. Official storefront banners, publisher key art, official screenshots, and Steam header art are valid covers when they clearly depict the same title.

If official storefronts and publisher pages yield no usable asset, a reputable media report, reliable retailer, or recognized game database may supply same-title artwork when the exact source page is opened, the game/edition match is checked, and the rights holder can be credited. Prefer downloading these assets into the repository instead of hotlinking the third-party host. Credit the actual developer, publisher, or rights holder—not merely the page host.

Search results must use the original image URL and source page, never a search-engine thumbnail. Fan art, unrelated images, watermarked composites, and images without an accessible source page remain prohibited. Cover credit remains in JSON but is not rendered as a visible caption.

The repository script can use DeepSeek's Responses API `web_search` only after all listed sources fail, when `DEEPSEEK_API_KEY` is present. DeepSeek is used only to discover candidate **source pages**; it never supplies a trusted image directly. The script opens each returned HTTPS page itself, requires an exact subject term copied from the edition title/headline to be confirmed in the page metadata, extracts that page's `og:image`/Twitter image, and then applies the normal HTTPS, size, dimension, format, and local-normalization checks. If the secret is absent or search fails, the pipeline safely continues without this last-resort layer.

MobyGames, LaunchBox Games Database, Glitchwave, Gavas, and Refuge are not automatic image sources. MobyGames requires its licensed API plan and attribution; Gavas prohibits unapproved reproduction and image hotlinking; the remaining sites lack a confirmed machine-readable reuse permission or block automation. They may help a human identify an edition, but the final asset must resolve to an approved original source.

## Editorial fallback ladder

The goal is to avoid empty story art whenever a clearly related, traceable image exists. Relevance is to the **subject of the story**, not only the exact event page. Stop after the first verified match in this order:

1. The exact official source page's image, or the exact reliable secondary report page's image when that report is already one of the story's evidence sources. Secondary-source images may be accepted automatically only from the article page attached to that same story; they are not a license to pull arbitrary third-party imagery.
2. The thumbnail of the exact primary official YouTube upload.
3. For a person-led story such as an interview, podcast, developer comment, or designer profile: another clearly identified, traceable photo of that same person from an official page or reliable media source. The photo does not need to come from the current interview.
4. For a game-led story: official key art, game cover/store art, official screenshot, or other publisher/platform artwork for that same game. A game cover is an acceptable fallback for a news item about that game's update, release, test, interview, delay, or other new development.
5. DeepSeek-assisted open-web source discovery for the same story subject when the listed sources produce no usable asset. Person-led stories search for the named person first; game-led stories search for the game and allow cover/key art/screenshot source pages. DeepSeek returns only candidate page URLs. The repository then opens and validates those pages itself before accepting any image.
6. Only then record a specific unavailable reason.

A fallback image is not required to depict the exact event, but it must depict the correct subject. Do not use a merely similar developer, another game in the series without an explicit relationship, generic convention photography, logos presented as editorial art, or an image whose identity cannot be verified. Prefer a relevant fallback over `unavailable`, but prefer `unavailable` over a plausible-looking mismatch.

An exact official-upload thumbnail is not a search-result thumbnail. The source must be the opened primary video URL, the script must derive the video ID, and the image response must pass type, size, and dimension checks. The downloader tries `maxresdefault`, `hq720`, `sddefault`, then `hqdefault` and saves the first valid result locally. Do not use another channel's reupload.

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

The editorial publisher dispatches the workflow for the exact edition immediately after Canonical publication. Legacy scheduled runs at 11:10 and 18:00 Asia/Shanghai are idempotent recovery checks and remain unchanged during precutover. After formal Daily cutover, 11:10 becomes the single scheduled Daily media recovery point and the legacy 18:00 recovery is removed/disabled. Exact-edition enrichment remains event-driven and should normally finish before the 12:00 release gate; the scheduled recovery does not replace or delay it. A media update reaches `main` only after source, image, schema, test, type, data, and build checks succeed.

Media remains a nonblocking lane. The noon release cannot fabricate or force an image merely to meet the clock: any unresolved record must carry the explicit unavailable reason required by the Canonical contract. Verified media found later may revise only the media state/assets of that same edition and trigger a later Pages update.

## DeepSeek search configuration

Create a repository-level GitHub Actions secret named `DEEPSEEK_API_KEY`. The media workflow exposes it only to the enrichment step, which calls `https://api.deepseek.com/responses` with `deepseek-v4-flash` and forces the server-side `web_search` tool. No key means no paid web-search fallback; all free listed-source fallbacks still run normally. Because this is the last fallback layer, API calls occur only for records still missing verified media after the deterministic source chain has been exhausted.

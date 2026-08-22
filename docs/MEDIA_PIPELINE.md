# Media Pipeline

The media pipeline is deliberately conservative. It enriches the latest edition after publication, opens listed source pages, validates the image response, converts accepted assets to JPEG, and opens a review PR. It never merges or deploys automatically.

## Cover priority

For multi-platform games, use the first verified source available in this order:

1. PlayStation Store (prefer Hong Kong and Simplified Chinese), square product image.
2. Nintendo eShop Japan, square product image; only use a physical vertical cover when the Japanese eShop has no listing.
3. Microsoft/Xbox Store, official rectangular product image.
4. PC-only games: Xbox Store when included with Game Pass, otherwise an official store rectangle such as Steam.

Storefront URLs belong in config/media-catalog.json for reuse or in an upcoming item's mediaSources. Query parameters may be removed only on known PlayStation, Nintendo, and Microsoft image CDNs. Keep the original product page as sourceUrl.

MobyGames, LaunchBox Games Database, Glitchwave, Gavas, and Refuge are not automatic image sources. MobyGames requires its licensed API plan and attribution; Gavas prohibits unapproved reproduction and image hotlinking; the remaining sites lack a confirmed machine-readable reuse permission or block automation. They may help a human identify an edition, but the final asset must resolve to an approved original source.

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

Scheduled runs at 10:35 and 17:25 Asia/Shanghai create or update automation/media-<edition-id> and open a PR. Review the crop, Chinese alt, credit, source page, product edition, and unavailable notes before merging.

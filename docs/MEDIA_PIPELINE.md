# Media Pipeline

Media enrichment runs after Canonical publication and is nonblocking. It opens traceable source pages, verifies subject/image identity, normalizes accepted assets, updates the same edition, and dispatches Pages when data changes.

Current recovery schedule is 11:10 `Asia/Shanghai`; exact-edition enrichment is also dispatched immediately after Canonical publication. Production timing belongs in `docs/SCHEDULED_TASK_PROMPT.md`, not historical migration notes.

## Required state

New v2 news/calendar items need either:

- verified media with meaningful Chinese `alt`, `credit`, HTTPS `sourceUrl`, `kind`, and verified `aspect` when relevant; or
- explicit `image_status` / `cover_status: "unavailable"` with a specific reason.

Store repository assets under `public/media/briefs/YYYY/MM/<edition-id>/`; prefer JPEG/WebP below 500 KB. News art is normalized to 16:9. Covers preserve their source orientation.

## Source order

### Covers

Prefer the first verified same-title source available:

1. PlayStation Store, preferably Hong Kong/Simplified Chinese when appropriate;
2. Nintendo eShop / official Nintendo product page;
3. Microsoft/Xbox Store, Steam, publisher store/media room;
4. reliable retailer/media/game database only when the exact source page is opened and subject/edition identity is clear;
5. bounded web-search discovery as a last resort when configured.

The order is a reliability preference, not a shape requirement. Square, portrait, and landscape art are all valid when identity/provenance is verified.

### Editorial images

Stop at the first valid match:

1. image from the exact official or selected reliable report page;
2. thumbnail from the exact primary official YouTube upload;
3. same-person verified photo for person-led stories;
4. official same-game key art, cover, screenshot, or platform/publisher artwork;
5. bounded web-search discovery of source pages;
6. explicit unavailable reason.

Fallback art may depict the confirmed subject rather than the exact event, but never a merely similar person/game, unrelated stock, fan art, watermarked composite, or search thumbnail.

## Search-assisted discovery

When configured, DeepSeek/web search is discovery only. It returns candidate **source pages**; repository code still opens each HTTPS page, confirms the story subject, extracts the page image, and applies normal response/type/size/dimension checks. Search output never becomes trusted media by itself.

MobyGames, LaunchBox, Glitchwave, Gavas, Refuge, and similar databases may help identify an edition but are not automatically approved asset origins. Final media still needs an opened, traceable source with acceptable reuse/provenance.

## Automatic checks

`npm run media:audit` is read-only; `npm run media:enrich` applies to the selected/latest edition.

The tool:

- accepts HTTPS only and rejects local/private targets;
- limits HTML/image response sizes;
- requires usable dimensions;
- crops news art to 16:9;
- preserves cover orientation;
- normalizes accepted assets into the repository when possible;
- records a specific unavailable reason instead of forcing a mismatch.

A media failure must not block a valid Canonical edition or alter facts. Verified media found later may revise only media state/assets for that same edition.

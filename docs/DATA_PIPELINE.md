# Scheduled Brief Data Pipeline

The staged programmatic migration and reliability ownership are defined in [`AUTOMATION_ARCHITECTURE.md`](./AUTOMATION_ARCHITECTURE.md). Until its cutover criteria pass, the existing ChatGPT tasks remain the publisher and the new collector stays in shadow mode.

The website reads `public/data/latest.json` at runtime. Every published edition is also stored under `public/data/archive/YYYY/MM/`, while `public/data/manifest.json` is the ordered archive index. A malformed payload never replaces the bundled fallback edition.

## ChatGPT task handoff

The scheduled ChatGPT task must finish its research first, then use its connected GitHub capability to commit one atomic change to `fallw1nd/daily-game-brief` on `main`:

1. Add `public/data/archive/YYYY/MM/YYYY-MM-DD-am.json` or `...-pm.json`.
2. Copy the exact same JSON to `public/data/latest.json`.
3. Append one item to `public/data/manifest.json` and update `latest` and `updatedAt`. The item must copy the edition's `archiveTitle` and `leadEntryId`.
4. Open and verify every primary source before using `fact_status: "official"`.
5. Never modify or delete an older archive file. Corrections create a revision commit without changing the issue number.

Every newly scheduled edition must use `schemaVersion: 2`, `timezone: "Asia/Shanghai"`, a continuous positive `issueNumber`, and an `id` equal to `date + "-" + period`. Schema version 1 is reserved for existing legacy archives only. Each new edition must include `entries`, `upcoming`, `tracking`, and `sourceReport`, plus the image fields defined below. Keep the existing field names, including `fact_status`, `time_status`, and `title_key`.

Each v2 edition also requires an `archiveTitle` and `leadEntryId`. The title must start with `早报｜` or `晚报｜` to match `period`, contain 8–40 characters, and summarize one real, high-impact entry without overstating its verification status. Prefer a major game, publisher/platform decision, or broadly discussed event. `leadEntryId` must reference that entry in the same edition. Copy both fields into the appended manifest item. The four legacy manifest items contain an approved one-time metadata backfill; do not rewrite legacy archive JSON or later alter historical titles without an explicit correction.

## Chinese title resolution

Game names use a deterministic three-level fallback. Reuse `config/title-translations.json` first; otherwise prefer an official Simplified Chinese name from the publisher, developer, platform, or storefront. If no official Simplified Chinese name exists, a stable and broadly used Chinese community/media name may be used with `title_zh_status: "common_translation"`. Only when neither exists should the original name remain with `title_zh_status: "unavailable"` and no `title_zh_cn` field.

The registry is cumulative: once a title and its evidence have been confirmed, later editions must reuse that registered decision instead of researching or guessing the same name again. New confirmed names may be appended after title-only verification without changing previously published facts.

Never machine-translate, literally translate, or invent a Chinese title merely to fill the field. A narrow open-web lookup is allowed solely to determine the game name and its status; it must not introduce new event facts, times, platforms, release claims, or candidates outside the finalized editorial packet. The publisher applies the registry again before serialization so a known translation is not lost when an editorial decision mistakenly leaves the title unavailable. Historical title-field corrections use `npm run titles:backfill`; the command fills currently unavailable title fields without overwriting an existing official/common translation, then normalizes visible story headlines and lead archive titles so a resolved Chinese game name does not remain English in display copy. The original English name stays in `title_en` metadata.

Before committing, the task should run or request the equivalent of:

```bash
npm run validate:data
npm run check
```

Pushing the data commit starts the Pages workflow. The workflow validates the archive, generates `public/data/search-index.json` from every manifest-listed edition, builds the site, and deploys it. The generated search index is not committed; it is reproduced by `npm run build:search`, `npm run dev`, and `npm run build`. No OpenAI or GitHub token is exposed in browser code.

## Image publishing

Starting with `schemaVersion: 2`, every news entry and upcoming game must explicitly resolve its media state. Prefer at least one verified `images` item for news and one verified `cover` for upcoming games. When no relevant, traceable image exists, use `image_status: "unavailable"` with `imageNote`, or `cover_status: "unavailable"` with `coverNote`; never force an unrelated image. Existing v1 archives remain valid. Use this shape:

```json
{
  "url": "media/briefs/2026/08/2026-08-22-pm/story-id.webp",
  "alt": "Meaningful Chinese description of the visible image",
  "credit": "Publisher or photographer",
  "sourceUrl": "https://official.example.com/original-page",
  "kind": "editorial"
}
```

For game covers, set `kind` to `cover` and `aspect` to `square`, `portrait`, or `landscape`. Prefer PSN Hong Kong square images, Nintendo eShop Japan square images, then Microsoft/Xbox Store rectangles; for PC-only games use Xbox when present in Game Pass, otherwise a directly traceable official store rectangle. Store reusable product pages in `config/media-catalog.json` or an upcoming item's `mediaSources`.

The store order is a discovery preference, not an aspect-ratio requirement. After listed sources fail, search the open web and accept a clearly matching square, portrait, or landscape original image whose source page is traceable; never store a search thumbnail. Preserve `credit` and `sourceUrl` for every cover, but the frontend does not display a cover source caption.

Download accepted assets to `public/media/briefs/YYYY/MM/<edition-id>/`, convert them to WebP or JPEG, and keep files below 500 KB. The JSON path is relative to `public/` and must not begin with `/`. If the connected GitHub tool cannot upload binary media, a durable official HTTPS CDN URL is acceptable. Do not use scraped search thumbnails, unrelated stock imagery, hotlinked fan art, or an image whose source page was not opened. Image credit does not replace source verification.

Before publishing, confirm that every supplied image URL loads and that `alt`, `credit`, and `sourceUrl` are present. CI rejects an unresolved media state on new editions: each item needs either valid media or a specific unavailable reason.

## Failure behavior

If GitHub is unavailable, the task should report the prepared edition without pretending it was published. If `latest.json` is missing or invalid, the deployed app shows its bundled fallback data. CI rejects schema errors, discontinuous issue numbers, metadata mismatches, and deleted archive files.

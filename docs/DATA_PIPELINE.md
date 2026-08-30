# Scheduled Brief Data Pipeline

The production migration described in [`AUTOMATION_ARCHITECTURE.md`](./AUTOMATION_ARCHITECTURE.md) is active. The two existing ChatGPT Scheduled Tasks remain the evidence-bounded editorial layer; trusted GitHub Actions code on `main` is the only publisher of Canonical data and English locale state.

The website reads `public/data/latest.json` at runtime. Every published Canonical edition is also stored under `public/data/archive/YYYY/MM/`, while `public/data/manifest.json` is the ordered archive index. A malformed payload never replaces the bundled fallback edition. English presentation is stored separately under `public/data/locales/en/` and never becomes an independent fact store.

## ChatGPT task handoff

The scheduled ChatGPT task does **not** write archive/latest/manifest or recovery state. It selects the oldest acknowledged pending edition from `automation/status/`, consumes the exact finalized packet by the state's immutable Git blob SHA, applies the live editorial contract, and commits only one structured decision to `automation/inbox/<edition-id>.json` on `automation/editorial/<edition-id>`.

For new normal submissions:

1. use `contractVersion: 2`;
2. copy the state's exact packet SHA to top-level `packetBlobSha`, then output exactly one `include`, `exclude`, or `needs_review` decision for every packet item;
3. give every included event a complete language-neutral `sharedFactFrame` covering the subject title key, dates, times, numbers, platforms, people/entities, versions, and proper terms supported by the selected evidence;
4. draft the Simplified Chinese Canonical presentation under the existing Chinese editorial rules;
5. produce `locales.en` from the same decisions and `sharedFactFrame` when a complete English presentation can be written safely;
6. never calculate issue numbers, final `entryId`, `factsDigest`, `canonicalCopyDigest`, or `localeDigest`; trusted publisher code owns those values;
7. if English cannot be completed without uncertainty or fact drift, omit `locales.en` rather than weakening or suppressing the Simplified Chinese Canonical decision.

The task stops after the editorial handoff commit succeeds. `.github/workflows/publish-editorial-decision.yml` restores the packet by `packetBlobSha`, records submitted/valid/invalid state, validates the complete schema and Canonical evidence contract, builds the edition, computes identities/digests, resolves English availability, runs `npm run check`, and publishes atomically. Normal pre-cutover or stale submissions are rejected; `locale-repair` remains a narrowly scoped compatibility path that cannot mutate Canonical bytes.

## Canonical edition contract

Every newly scheduled Canonical edition uses `schemaVersion: 2`, `timezone: "Asia/Shanghai"`, a continuous positive `issueNumber`, and an `id` equal to `date + "-" + period`. Schema version 1 is reserved for existing legacy archives only. Each new edition includes `entries`, `upcoming`, `tracking`, and `sourceReport`, plus the media state defined below. Keep the existing field names, including `fact_status`, `time_status`, and `title_key`.

Each v2 edition also requires an `archiveTitle` and `leadEntryId`. The title starts with `早报｜` or `晚报｜` to match `period`, contains 8–40 characters, and summarizes one real, high-impact entry without overstating its verification status. `leadEntryId` references that entry in the same Canonical edition. The publisher copies both fields into the manifest item. Historical archive JSON remains append-only except for the repository's explicit same-edition revision path; revisions never change the issue number.

The fixed windows remain:

- AM: previous day 17:00 **exclusive** → current day 10:10 **inclusive**;
- PM: current day 10:10 **exclusive** → current day 17:00 **inclusive**.

Neither English generation, locale repair, media enrichment, nor retry logic may alter these windows or issue sequencing.

## English Overlay contract

Simplified Chinese Canonical data remains the sole factual authority. A valid English edition is a presentation Overlay stored at:

`public/data/locales/en/archive/YYYY/MM/<edition-id>.json`

The Overlay binds to Canonical identities and may contain English presentation fields such as archive title, headline, summary, verification copy, time note, source labels, region/release-type labels, and media alt text. It must not own or override Canonical fact status, time status, tracking, source URLs, platforms, dates, issue numbers, section/order, or media identity.

Trusted publisher code computes three SHA-256 digests after the Canonical edition is built:

- `factsDigest`: stable projection of factual Canonical fields;
- `canonicalCopyDigest`: Simplified Chinese presentation projection;
- `localeDigest`: English Overlay presentation projection.

A mismatched `factsDigest` makes an Overlay stale and unavailable. A changed Chinese presentation digest is observable but does not by itself mean the shared facts changed. `public/data/locales/en/index.json` is generated state that reports per-edition `available` or explicit `unavailable` status.

English is non-blocking. If a submitted English draft is missing or fails Overlay validation, the trusted publisher still publishes a valid Simplified Chinese Canonical edition and writes machine-readable English unavailable state with a reason and the current `factsDigest`. A later trusted `locale-repair` may add or replace only English Overlay/availability state; the workflow hashes Canonical archive/latest/manifest before and after repair and fails if those bytes change.

Search Index v2 may expose copy in both locales, but Canonical metadata and factual filters continue to originate from the Chinese Canonical edition. The frontend loader remains compatible with older search-index payloads during the migration.

## Chinese title resolution

Game names use a deterministic three-level fallback. Reuse `config/title-translations.json` first; otherwise prefer an official Simplified Chinese name from the publisher, developer, platform, or storefront. If no official Simplified Chinese name exists, a stable and broadly used Chinese community/media name may be used with `title_zh_status: "common_translation"`. Only when neither exists should the original name remain with `title_zh_status: "unavailable"` and no `title_zh_cn` field.

The registry is cumulative: once a title and its evidence have been confirmed, later editions reuse that registered decision instead of researching or guessing the same name again. New confirmed names may be appended after title-only verification without changing previously published facts.

For a registry miss, the finalized-packet workflow may build a bounded `editorialInput.titleHints` list before ChatGPT review. The title-hint phase searches only the supplied game subject and must not discover or add events. A search provider may propose a Chinese name and source-page URLs, but code must open every accepted page and verify that the proposed Chinese name appears verbatim in the opened page text. `official_simplified` is only a suggested status for the editor; `common_translation` hints require the same name on at least two independently hosted verified pages. Registry hits never enter this search phase.

A title hint is naming evidence only. Its source pages must not be used to add or change event facts, times, platforms, release claims, source classification, tracking decisions, or candidate events. Hints do not write `config/title-translations.json` and do not automatically determine the final title status; ChatGPT still chooses `official_simplified`, `common_translation`, or `unavailable` under the editorial contract. The packet retains only compact source metadata and an excerpt around the verified Chinese name, not the fetched page body.

Never machine-translate, literally translate, or invent a Chinese title merely to fill the field. A narrow open-web lookup is allowed solely to determine the game name and its status; it must not introduce new event facts, times, platforms, release claims, or candidates outside the finalized editorial packet. The publisher applies the registry again before serialization so a known translation is not lost when an editorial decision mistakenly leaves the title unavailable. Historical title-field corrections use `npm run titles:backfill`; the command fills currently unavailable title fields without overwriting an existing official/common translation, then normalizes visible story headlines and lead archive titles so a resolved Chinese game name does not remain English in display copy. The original English name stays in `title_en` metadata.

### Mainland Simplified Chinese terminology

For a game with an official mainland-China Simplified Chinese channel or site, visible Chinese copy prefers that official mainland terminology for named version subtitles, characters/agents, classes/professions, modes, mechanics, and other proper in-game terms. Overseas media translations or literal English-to-Chinese renderings must not override an available mainland official term. This rule is separate from the cumulative game-title registry because version and system terminology can be release-specific.

If the finalized event evidence is foreign-language or overseas media, the editor may perform a narrow terminology-only lookup against an official mainland Simplified Chinese source. That lookup may normalize wording only: it must not add or change event facts, times, platforms, release claims, source classification, tracking decisions, or candidate events. A terminology source does not upgrade `fact_status` or become event evidence unless it independently supports the event claim under the normal source rules.

English terminology follows the same fact boundary. Opened English primary evidence may supply official English proper names and natural phrasing, but it may not introduce an event detail absent from the selected evidence/`sharedFactFrame`. If no reliable English term can be established, the English presentation should omit or conservatively render that presentation element rather than alter Canonical facts.

## Validation and publication

The Scheduled Task does not run the production publication itself. Trusted workflows execute the equivalent of:

```bash
npm run validate:data
npm run validate:locales
npm run check
```

For a normal changed edition, publisher code writes Canonical archive/latest/manifest plus either a valid English Overlay or explicit English unavailable state, rebuilds the generated search/locale indexes, and commits the resulting production data in one trusted publication step. A concurrent `main` advance causes the same committed editorial decision to be rebuilt from current `main` and retried rather than rebasing stale generated data.

Pushing a production commit starts or explicitly dispatches the Pages workflow. The workflow validates the append-only archive, regenerates derived indexes, builds the site, uploads the artifact, and deploys it. Generated search and locale indexes are reproducible build outputs where configured; no OpenAI or GitHub token is exposed in browser code.

## Image publishing

Starting with `schemaVersion: 2`, every news entry and upcoming game explicitly resolves its media state. Prefer at least one verified `images` item for news and one verified `cover` for upcoming games. When no relevant, traceable image exists, use `image_status: "unavailable"` with `imageNote`, or `cover_status: "unavailable"` with `coverNote`; never force an unrelated image. Existing v1 archives remain valid. Use this shape:

```json
{
  "url": "media/briefs/2026/08/2026-08-22-pm/story-id.webp",
  "alt": "Meaningful Simplified Chinese description of the visible image",
  "credit": "Publisher or photographer",
  "sourceUrl": "https://official.example.com/original-page",
  "kind": "editorial"
}
```

For game covers, set `kind` to `cover` and `aspect` to `square`, `portrait`, or `landscape`. Prefer PSN Hong Kong square images, Nintendo eShop Japan square images, then Microsoft/Xbox Store rectangles; for PC-only games use Xbox when present in Game Pass, otherwise a directly traceable official store rectangle. Store reusable product pages in `config/media-catalog.json` or an upcoming item's `mediaSources`.

The store order is a discovery preference, not an aspect-ratio requirement. After listed sources fail, search the open web and accept a clearly matching square, portrait, or landscape original image whose source page is traceable; never store a search thumbnail. Preserve `credit` and `sourceUrl` for every cover, but the frontend does not display a cover source caption.

Download accepted assets to `public/media/briefs/YYYY/MM/<edition-id>/`, convert them to WebP or JPEG, and keep files below 500 KB. The JSON path is relative to `public/` and must not begin with `/`. If the connected GitHub tool cannot upload binary media, a durable official HTTPS CDN URL is acceptable. Do not use scraped search thumbnails, unrelated stock imagery, hotlinked fan art, or an image whose source page was not opened. Image credit does not replace source verification.

Before publishing, confirm that every supplied image URL loads and that Simplified Chinese `alt`, `credit`, and `sourceUrl` are present. English media alt text belongs to the English Overlay; it does not alter the Canonical media asset or its traceability. CI rejects an unresolved media state on new Canonical editions: each item needs either valid media or a specific unavailable reason.

## Failure behavior

Canonical fact-verification, time-window, schema, issue-number, source, or publication failures are hard failures and must not be disguised as successful publication. English presentation failure is different: when Canonical data is valid, English may degrade to explicit `unavailable` without blocking Chinese publication. Media may similarly use its documented unavailable state.

If GitHub is unavailable, the task reports the handoff failure without pretending the edition was published. If `latest.json` is missing or invalid, the deployed app shows its bundled fallback data. CI rejects schema errors, discontinuous issue numbers, Canonical metadata mismatches, stale/invalid locale overlays, and deleted archive files.

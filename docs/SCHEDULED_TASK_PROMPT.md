# Scheduled Task Prompt — Efficient Discovery, Verification, Media, and Publish

Use this contract for both existing ChatGPT tasks. Keep their current schedules and enabled state; do not create duplicate tasks. The repository's current `AGENTS.md`, `docs/DATA_PIPELINE.md`, schema, and validators remain authoritative.

## Shared execution contract

1. Read only main HEAD, `public/data/manifest.json`, and `public/data/latest.json` first. Derive the next issue number, fixed Beijing window, adjacent entries, top-level tracking, and entries with `tracking:true`. Load other repository rules only when needed. Re-read state immediately before writing.
2. Preserve continuous issue numbering, the planned window, adjacent-edition deduplication, `schemaVersion:2`, title normalization, source statuses, tracking, append-only archives, and atomic GitHub publication.
3. Review every open tracking event. Keep it unless resolved, disproved, or unchanged for 72 hours; record the closure evidence and reason in `sourceReport.trackingResults`.

## Low-token news pipeline

Use three passes and normally 8–12 composite searches, with an absolute maximum of 14.

### Pass A — discovery

Read RSS, search results, list headlines, official schedules, and brief summaries before opening articles. Cover English, Japanese, and Chinese general media; platform/publisher/developer official feeds; current showcases and esports; and the scoring/interview/policy/finance/legal/leak radar. Combine Chinese and English names, abbreviations, and subject names. Raise China-related teams, studios, games, and players by one priority level.

Deduplicate by `subject + event`. Do not open duplicate rewrites.

### Pass B — event ledger and verification

Create a compact event ledger with one row per identifiable announcement:

- A: official new title, release/date/delay, launch, major update/DLC, platform/business decision, major event result, or three-media concentration. No count cap.
- B: useful secondary development. At most six.
- C: duplicate, low impact, outside window, source-poor, or unverifiable. Keep only its exclusion reason.

For each A item, open one primary source plus one independent reliable report. For B, open at most two sources. For disputes, lawsuits, and leaks, open at most three. Stop after the evidence threshold is met.

During a showcase, Direct, earnings call, or similar burst, open the official full stream/run-of-show once and one strong liveblog/roundup once, then fan out the ledger. Never hide an A item inside a generic combined “roundup” entry. Each official new title, date/delay, launch, major update/DLC, or material corporate decision must be its own `BriefEntry`. If a prior leak becomes official in the same window, replace the rumor state with the official entry instead of leaving it excluded.

Use `official` only after opening the primary page. Without a primary source, require two independent reliable reports and use `multi_source_verified` or `media_report`. Rumors only confirm who made what claim, which reliable media reported it, and whether the subject responded; use `unconfirmed` and `tracking:true`.

### Pass C — omission audit

Before JSON generation, compare the candidate ledger with:

- the official event schedule or run-of-show when an event is active;
- at least three broad media headline lists from the past 24 hours;
- adjacent archive entries.

Every high-frequency missing topic needs one explicit disposition: included, duplicate, outside window, supplement, low impact, insufficient source, or unverifiable. If an official A item or a three-media cluster is absent, return to Pass B. Record `checkedGroups`, `trackingResults`, `excludedMajorCandidates`, `limitedSources`, and ledger statistics in `sourceReport`.

## Time and upcoming rules

Apply the fixed planned Beijing window even when execution starts late. Also audit the prior 24 hours; a major missed item from the adjacent window may be added as `supplement` with its original time and omission reason.

The morning task fully rebuilds the next-15-day release list. The evening task only checks new announcements, delays, cancellations, and date changes; it does not revalidate the full table.

## Deterministic media pipeline

Finish news verification before any media work. For each news entry, try only:

1. exact official news-page `og:image`;
2. thumbnail from the exact opened primary official YouTube upload;
3. same-title official store art, key art, cover, or screenshot;
4. `image_status:"unavailable"` plus a concrete note and traceable sources.

The exact official-video thumbnail is valid; a search-results thumbnail is not. The repository downloader derives the video ID, validates the response as an image, tries high-to-lower official resolutions, and stores an optimized local JPEG. Do not use reuploads, fan art, unrelated titles, watermarked composites, or merely similar subjects.

For upcoming covers, use the current repository source priority as preference, not a shape gate. Accept verified same-title square, portrait, or landscape official/store/publisher art; use the approved third-party fallback only after opening the source page and confirming the edition and rights holder.

Do not perform expensive open-web image search during brief generation and do not run `media:backfill`. When the deterministic ladder fails, leave detailed `unavailable` or `mediaSources` for the scheduled review PR workflow.

## Publish and report

Write the archive, byte-identical `latest.json` when current, and an appended/revised manifest item in one fast-forward commit. Never rewrite old issue numbers or archives and never manually edit `search-index.json`. Run `npm run validate:data` and `npm run check`, wait for the commit's Actions/Pages success, then verify the site, latest, archive, manifest, search index, and every used media URL.

Report the issue, commit, Actions, live links, separate news/image and upcoming/cover coverage, unavailable reasons, and any media review PR. Do not claim publication success before every required check passes.

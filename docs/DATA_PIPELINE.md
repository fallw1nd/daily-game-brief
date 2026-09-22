# Production Data Pipeline

Daily is the only active production cadence. Trusted GitHub code on `main` is the publisher; the ChatGPT task submits evidence-bounded editorial decisions only.

## Canonical layout

- current edition: `public/data/latest.json`
- archive: `public/data/archive/YYYY/MM/<edition-id>.json`
- ordered index: `public/data/manifest.json`
- English Overlay: `public/data/locales/en/`
- search/locale indexes: generated outputs

New Canonical editions use schema v2, continuous positive `issueNumber`, `Asia/Shanghai`, a period-prefixed `archiveTitle`, and a valid `leadEntryId`. Historical archives stay append-only except through explicit same-edition revision flows; revisions never allocate a new issue number.

## Daily window

Normal Daily: previous day 10:10 **exclusive** → current day 10:10 **inclusive**, planned release 12:00 Beijing time. Facts first published after 10:10 belong to the next Daily.

Historical AM/PM window helpers and workflow inputs remain only for old-edition recovery/revision. The first Daily bridge is a hard-coded historical compatibility case and must not be generalized.

## Editorial handoff

The task reads `automation/status/<edition-id>.json`, restores the exact finalized packet by its acknowledged Git blob SHA, and copies that SHA to `packetBlobSha`.

For every packet item it returns exactly one `include`, `exclude`, or `needs_review`. Each include carries a complete language-neutral `sharedFactFrame` covering subject identity, dates/times, numbers, platforms, people/entities, versions, and proper terms supported by selected evidence.

The task never calculates issue numbers, final entry IDs, or digests. It commits only the supported editorial/locale inbox files; trusted workflows validate and publish.

## Evidence threshold

Evidence composition does not itself decide publication:

- opened primary → may support `official`;
- one opened curated media source → may support bounded `media_report` when subject, window, and core facts are clear;
- a curated media source explicitly relaying an identifiable official announcement/interview/statement → may support `media_relay_official`;
- two independent reliable sources → required only for `multi_source_verified`;
- credible unconfirmed reporting → may publish in `rumors` with `unconfirmed` status and active tracking.

Use `needs_review` for material blockers: unresolved subject identity, contradictory evidence, unprovable fixed-window placement, mutable aggregate values without the required snapshot, or evidence too incomplete to write a bounded claim. One-source coverage alone is not a blocker.

Article metadata or visible publication time is preferred. When an opened article omits time, the trusted RSS/feed timestamp that admitted the same appearance to the fixed window may be retained.

## Chinese names and terminology

Resolution order:

1. user-provided verified name;
2. `config/title-translations.json`;
3. verified packet `titleHints`;
4. narrow title-only lookup.

Prefer official mainland Simplified Chinese names. A stable widely used name may use `common_translation`. Otherwise keep the original title with unavailable Chinese status. Never machine-translate or invent a title.

Title/terminology research is naming evidence only. It cannot add event facts, times, platforms, release claims, source authority, tracking decisions, or candidates. For games with an official mainland channel, visible Chinese copy should use its official version/character/class/mode/mechanic terminology when available.

## Release calendar

Daily uses `upcomingMode:"inherit_and_patch"`. Trusted publisher code carries the newest verified Canonical calendar forward and expires entries outside the strict future-15-day range.

`upcomingBaseline.refreshRange` is the only calendar-only research exception. Candidate discovery is a lead, not evidence: the editor must open official developer/publisher/platform pages and confirm title identity, date, platform, region, and release type. Discovery failure or disappearance from a list never deletes an existing verified calendar item.

Detailed discovery behavior lives in `docs/RELEASE_CALENDAR.md`.

## English Overlay

Simplified Chinese Canonical is the factual authority. English Overlay may change presentation fields only and is bound to Canonical identities/fact digests.

If English is missing or invalid, a valid Chinese Canonical edition still publishes with explicit English-unavailable state. A later locale repair may modify only English Overlay/availability and must hash-guard Canonical archive/latest/manifest bytes.

## Media

Every new story/calendar item resolves to verified media or an explicit unavailable reason. Media provenance, source priority, image normalization, and recovery are defined only in `docs/MEDIA_PIPELINE.md`; do not duplicate those rules here.

Media is nonblocking: failure cannot change Canonical facts or force unrelated artwork.

## Same-edition revision

An authorized same-edition revision is an overlay, not a rebuild from an incomplete packet. It preserves previously published entries, stable matching entry IDs, verified media, tracking, and the current calendar baseline unless an explicit supported change replaces/removes them. New verified stories append without deleting unrelated published content.

## Publication and failure behavior

`publish-editorial-decision.yml` restores the immutable packet, validates the submission, runs `npm run check`, rebuilds on current `main` if necessary, and publishes atomically. Exact-edition Pages/media workflows are then dispatched.

Canonical fact/source/time/schema/issue failures are hard failures. English and media may degrade independently. Silent disappearance is never success; machine-readable state and incidents remain GitHub-owned.

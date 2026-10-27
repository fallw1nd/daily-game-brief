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

The user-authorized 2026-10-19 archive review may record `provisional_translation` after official/common-name research is inconclusive. This status means an explicitly labeled assistant translation, not an official or established name; preserve `title_en`/`title_ja` for search and keep naming evidence in the review ledger. It does not enable automatic translation or change the normal discovery workflow.

Copy localization matches complete aliases at ASCII/Unicode Latin, combining-mark, and numeric boundaries, so adjacent Chinese text is allowed while longer Latin words and sequel numbers stay intact. Registered single-word aliases are localized only inside explicit `《...》` title markers; a confirmed structured subject may also localize its own single-word name in its headline, summary, and generated media alt. Unknown sequel suffixes and aliases with conflicting registered translations are left unchanged. Localization scans once and skips aliases already embedded in their full Chinese translation, so rerunning it is idempotent.

Title/terminology research is naming evidence only. It cannot add event facts, times, platforms, release claims, source authority, tracking decisions, or candidates. For games with an official mainland channel, visible Chinese copy should use its official version/character/class/mode/mechanic terminology when available.

## Release calendar

Daily uses `upcomingMode:"inherit_and_patch"`. Trusted publisher code carries the newest verified Canonical calendar forward and expires entries outside the strict future-15-day range.

`upcomingBaseline.refreshRange` is the only calendar-only research exception. Candidate discovery is a lead, not evidence: the editor must open official developer/publisher/platform pages and confirm title identity, date, platform, region, and release type. Discovery failure or disappearance from a list never deletes an existing verified calendar item.

Detailed discovery behavior lives in `docs/RELEASE_CALENDAR.md`.

## English Overlay

Simplified Chinese Canonical is the factual authority. English Overlay may change presentation fields only and is bound to Canonical identities/fact digests.

If English is missing or invalid, a valid Chinese Canonical edition still publishes with explicit English-unavailable state. A later locale repair may modify only English Overlay/availability and must hash-guard Canonical archive/latest/manifest bytes.

Locale-only repair requires a complete draft with `schemaVersion:1`, `locale:"en"`, the exact `editionId`, and a top-level `factsDigest` binding the reviewed copy to the current Canonical facts. Copy that digest unchanged from the top-level field in `public/data/locales/en/status/YYYY/MM/<edition-id>.json`, reading the status and Canonical archive at the same pinned `main` commit. Do not use `retainedPresentation.factsDigest`: it may describe an older baseline. When no current status is available, trusted code can run `npm run build:locales` on that checkout and export the matching edition's `factsDigest` from the generated `public/data/locales/en/index.json`; that index is generated, not tracked on `main`. The editor never calculates or guesses digests.

Commit the complete presentation to `automation/locale-inbox/<edition-id>.json` on `automation/locale/en/<edition-id>`. Both push and manual `publication_mode:locale-repair` dispatch read this inbox; replaying an ordinary editorial submission as an unbound locale repair is not supported. Validation, publication construction, and every concurrent-main rebuild compare the draft's unchanged digest with current Canonical facts. A missing, malformed, or stale digest stops repair before publication writes. On staleness, reread Canonical and the trusted baseline and review the complete translation, rather than merely replacing its digest. Old retained English can be copied into the reviewed draft where still accurate, but cannot automatically override it unless bound to the same current facts. Normal `locales.en` editorial submissions remain unchanged and do not supply digests.

## Media

Every new story/calendar item resolves to verified media or an explicit unavailable reason. Media provenance, source priority, image normalization, and recovery are defined only in `docs/MEDIA_PIPELINE.md`; do not duplicate those rules here.

Media is nonblocking: failure cannot change Canonical facts or force unrelated artwork.

## Same-edition revision

An authorized same-edition revision is an overlay, not a rebuild from an incomplete packet. It preserves previously published entries, stable matching entry IDs, verified media, tracking, and the current calendar baseline unless an explicit supported change replaces/removes them. New verified stories append without deleting unrelated published content.

Explicit user-authorized manual repair may coalesce exact historical duplicate stories, retaining the lead ID or the first stable ID and recording removed-to-retained IDs. Factual/editorial fields must agree; distinct event keys and showcase associations are not coalesced. Automatic continuations never perform this cleanup. An explicit existing entry ID may also correct verification text only when headline, summary, subject, shared fact frame, selected sources, time, status, platforms, region, and release type still identify the exact published fact.

Resolved subject overrides remain prohibited except for an incidental game key misclassifying a named-company formation. The original acknowledged packet must independently corroborate the same uniquely named company in its headline and opened evidence. The manual wake binds the expected old subject, entry ID, Beijing time, and original selected source URLs. Trusted restoration records internal provenance and GitHub acknowledges a new packet blob before publication. The publisher rechecks those bindings, the stable event key, and the otherwise unchanged shared fact frame; only subject key, image seed, and the corresponding fact-frame digest change. Identity-only repair preserves edition title, lead, calendar, and all unrelated entries. This is not permission to add event facts or perform arbitrary cross-key replacement.


Explicit historical text/region corrections may also use the narrowly bound `archive_correction` adapter in `docs/SECOND_PUBLISH.md`, including legacy archives without durable packets. It requires current archive/English blob leases, exact old values and selected-source review, and preserves all other published identity/fact fields. It is not a replacement for packet-based new-content revisions.

## Publication and failure behavior

`publish-editorial-decision.yml` restores the immutable packet, validates the submission, runs `npm run check`, rebuilds on current `main` if necessary, and publishes atomically. Exact-edition Pages/media workflows are then dispatched.

Canonical fact/source/time/schema/issue failures are hard failures. English and media may degrade independently. Silent disappearance is never success; machine-readable state and incidents remain GitHub-owned.

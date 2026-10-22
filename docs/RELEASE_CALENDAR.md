# Release Calendar

The Daily packet includes a rolling future-15-day release calendar. Discovery is automated; adoption is evidence-bounded and performed through the normal editorial/publisher flow.

## Flow

1. Build the next 15 Beijing-date days.
2. Query the configured cross-platform discovery sources.
3. Merge editorial identities while retaining every source observation, platform, product, region and date conflict.
4. Prioritize date conflicts and uncertain conflicts, reserve platform opportunities, then use known-title and cross-source hints. Baseline membership is not proof of a detected change.
5. Open official developer/publisher/platform pages before adoption.
6. Submit only verified additions/changes through Daily `upcomingMode:"inherit_and_patch"`.

### Official detail evidence and unfinished work

GitHub opens at most 80 unique official detail URLs per collection, two concurrently, with an 8-second timeout and 2 MB response limit. The closed host list covers Steam, Nintendo, Xbox and PlayStation; arbitrary hosts and redirects are not followed. Inherited entries are rechecked even when absent from discovery. Conflicts/baseline leads precede a rotating, platform-balanced remainder. URLs not fetched under the budget and failed/limited responses remain explicit. Unsupported developer hosts still require the editor's bounded lookup.

Full SHA-pinned work pages contain deduplicated `primary-evidence` snapshots and `baseline-check` tasks. The 24,000-character inline preview excludes the snapshots. Fetch success never automatically publishes a release: the editor must verify identity/date/platform/region/type from the text/structured data or open the official page when insufficient. A sufficient already-opened snapshot must not be deferred solely because the editor has not repeated its fetch.

Every new Daily with calendar pages also creates a calendar-only continuation in the existing durable queue. GitHub skips it when the initial submission reviewed every page and all four platforms; otherwise it activates the exact pinned work after publication. No new scheduled task or invocation is added. Calendar continuations cannot change news/tracking/headlines/issue/window, use the normal edition inbox, and remain awaiting retry after partial review. Their receipts are carried to the public calendar so inherited plans cannot masquerade as a freshly completed review. Global completeness is never implied by reviewing configured sources. Calendar partial-review retries retain the pinned packet and unresolved receipts. Their existing retry delays are measured from the last completed calendar attempt, not the edition’s original publication; this prevents old editions immediately reopening after every partial publication. The global queue sweep orders eligible calendar turns by never-attempted first, then least-recently attempted due retry (edition order breaks ties), without moving non-calendar activation positions or interrupting an open revision. A delay is not evidence recovery: missing/truncated official details still need the authorized bounded editorial lookup, or a separately designed trusted collector refresh. No calendar packet refresh is implied by queue activation.

If Daily enters the degraded publication fallback, calendar discovery remains review-only. The fallback emits an empty `upcoming` patch with `removeUpcomingIds:[]` and `upcomingMode:"inherit_and_patch"`; it preserves the verified Canonical baseline and the publisher naturally removes entries outside the rolling 15-day window. Calendar-only final official detail verification is deferred, and known-title hints or cross-source discovery matches are not evidence.

Discovery never writes `public/data` directly.

## Discovery sources

Current source families include Steam upcoming/date listings, Nintendo coming-soon data, Xbox Wire release roundups, PlayStation Blog leads, and an independent cross-platform calendar. Configuration lives in `config/release-calendar-sources.json`.

The six base sources are still checked every Daily across the full 15-day range. Two configured, one-page official RSS fallbacks (PlayStation's PS5 category and Xbox News) are considered only when that platform's base sources fail, are partial/empty/parser-unknown, or produce no useful lead. The fallback set is closed; discovery does not search for more publishers. Base requests remain capped at nine (Steam calendar four pages, five other base pages); selected fallbacks add at most two requests, with no more than two requests in flight.

The calendar-only health ledger affects fallback probes. Its strategy reader accepts only object observations with known fetch/parser states and a nonnegative integer or null/absent lead count; malformed entries, invalid state values, and unknown/null metrics never count as success or known zero. It considers at most the latest five ledger entries, and history is unknown if its observation time is invalid, in the future, or older than 14 days. Unknown and stale history gets a safe limited probe. Recent useful leads or at least 80% known fetch success with no parser failures rank as healthy, unless degraded criteria apply. History is degraded when known fetch success is below 50%, at least two parser failures occur in the latest five entries, or the latest two entries both explicitly report zero useful leads. Degraded history is retried on editions whose UTC day-of-year is divisible by three, and immediately when the matching base source has a hard fetch/parser failure. Thus one older useful lead cannot override two recent known zero-lead observations, while missing lead counts do not become false zeroes. Health never suppresses a base source. Fallback output remains review links and is excluded from candidate aggregation; RSS publication dates are not treated as release dates. Health persists only sources actually attempted. Telemetry records the four platform gaps, each fallback's trigger/skip reason, and actual attempts. A fetch success or zero parsed rows does not establish coverage.

A discovery page is not proof of a release fact. Before adoption verify:

- exact game identity;
- date;
- platform;
- region when material;
- release type: full launch, early access, port, DLC, or update.

Dates that conflict remain unresolved. Platform/region-specific dates are not merged blindly. A failed source, missing listing, or parser returning zero results never removes an existing verified item.

## Coverage and limits

The collector rechecks the full future-15-day range every Daily rather than only the newly added tail date. PC, PlayStation, Xbox, and Nintendo gaps remain explicit.

Network/parser outcomes distinguish success, partial coverage, empty/changed pages, and failure. Candidate and character limits are observable; omitted candidates stay visible in telemetry. Source failure does not block news packet generation.

The packet's `upcomingBaseline.refreshRange` is calendar-only authority. Calendar research cannot alter news candidates/facts/tracking. Verified existing Canonical calendar entries remain the baseline unless supported evidence changes or removes them.

## Packet and operational verification

The packet has at most 100 editorial tasks and 24,000 serialized JSON characters, within the unchanged 120,000-character editorial input budget. Named observations share source defaults and repeated URLs; offline replay expands them and verifies selected observations without loss. Unknown Nintendo device information remains unknown while its Nintendo discovery family can receive a selection opportunity. The bounded platform representative search is deterministic, not mathematically optimal.

PlayStation Blog titles with explicit launch/out dates support Sep, Sept and September as discovery leads only. Conflicting, negated and multiple dates remain review work. Official details still establish identity, date, platform, region and release type before publication.

GitHub performs fetching, parsing, deduplication, ranking, calendar health and packet generation. The existing Scheduled Task performs final official verification, ambiguity resolution and Canonical patches; no task or invocation time is added. Calendar health keeps at most 30 observations per source, separating fetch and parser outcomes. Report reuse does not fetch again or add a duplicate observation.

See [offline replay](RELEASE_CALENDAR_REPLAY.md) for measured packet gains and provenance. These samples do not establish live discovery recall or recovery of upstream-cap omissions. On the next natural Daily, inspect per-platform task/link counts, cap and character-budget omissions, actual fallback requests, parser failures and known-zero versus unknown health. Rolling tests cover expiry, the new tail day, advance/postponement, explicit cancellation, platform/type changes and retention after discovery failure.

## Calendar name presentation

The calendar presents a researched Chinese name as the primary line and its distinct original name as smaller supporting text. English views and titles with unavailable Chinese names use the original alone. Identical Chinese/original strings do not produce a duplicate line. Intentionally English brands remain original-only; lack of official Chinese naming does not by itself prove that a provisional translation should be discarded.

The shared `calendarTitle` presentation helper uses structured naming status and the exact original title to separate the legacy `中文（Original，暂译）` format. It does not use broad parenthesis stripping, invent translations, or rewrite Canonical names, registry evidence, or naming status. The existing provisional research remains explicitly non-official internally. This calendar-only presentation preference supersedes the older audit's combined visible-title convention, not the normal evidence-based naming policy.

## Media

Calendar covers follow `docs/MEDIA_PIPELINE.md`. Missing art is not a reason to omit a verified release; use an explicit unavailable state.

## Local check

```bash
npm run calendar:discover -- --date=YYYY-MM-DD
npm run check
```

Coverage is intentionally conservative: the project reduces omissions but does not claim a complete global release database.

## Published release identity

A new editorial ID is not proof of a new release. The publisher coalesces aliases only when an exact supported primary single-product store identity, original name (case/width/whitespace/trademark normalization only), region, date, release scope and overlapping platform coverage agree. It retains the first published ID, strongest available Chinese name and verified art, and unions only already supplied platform coverage. The known labels `多平台发售` and an exact listed platform plus `版发售` share a launch scope; DLC, early access and other release types remain independent. Distinct editions, bundles, roundup URLs, cross-store title guesses, conflicting dates and disjoint platforms are not automatically collapsed. An ISO date matches a short date only with the edition's rolling year context.

English incoming alias IDs are mapped to the retained Canonical ID; public field names and locale identity validation do not change. News-only same-edition continuations do not perform unrelated calendar cleanup. Historical cleanup still requires a trusted same-edition request against its pinned packet, with explicit calendar patch/removal decisions and normal Canonical/English/media validation; never edit old archives or durable state directly.

## Editorial-interest admission before detail verification

New candidates pass a separate deterministic interest gate before official detail collection. Credibility and interest remain separate: an official store listing verifies neither audience interest nor the final release date. Existing published entries always retain their baseline recheck; lack of interest, failed sources, or changed naming never deletes them.

`config/release-calendar-sources.json` configures the initial policy. One strong signal or two independent medium source families admits a new candidate. Prior substantive game news from the local 120-day archive is strong; a configured editorial release calendar and dedicated PlayStation Blog articles are medium. A GamesRadar row is strong only when its parser preserves an explicit `BIGGEST GAMES OF <month> <year>` section and the configured source URL; ordinary month lists and historical rows without that evidence remain medium. A store's ordinary upcoming list, Xbox's full weekly listing, the `steam-popular` source name, translation-registry membership, cross-platform presence, private wishlist counts and post-launch reviews are not interest signals. A later strong signal supersedes a medium signal from the same family; duplicate sources do not multiply votes. Historical interest matches exact normalized game titles, excludes entity/topic/industry/rumor entries, accepts untyped legacy rows only with an exact quoted game subject plus game-content terminology (platform presence alone is insufficient), and never reads `upcoming` as evidence of coverage. Missing history or source status is explicitly unknown/partial, not a quality score.

The starting budgets are four exploratory candidates and four review links per Daily, adjustable after replay rather than claimed as optimal. Exploratory candidates favor one positive editorial signal while reserving a cold-start opportunity; deterministic daily rotation and platform opportunities avoid a permanent tail. These are research budgets, not a requirement to publish four unknown games or fill a 20–30-item display target. Every admitted/exploratory item still needs normal primary evidence, identity and media review. No new external service, schedule, or manual whitelist is required.

The discovery report keeps `allCandidates` as the complete *observed* pool with explicit `importance` reasons/signals. `admittedCandidates` is the selected research scope consumed by the primary collector and full work pages. `needsAttention` marks unadmitted rows with an editorial signal or cross-platform discovery as potential omission risks, without mistaking platform breadth for popularity. Candidates deferred only for insufficient interest are not failed verification work and do not create perpetual continuation debt. `deferredReviewLinks` and full candidate reasons remain in the internal report; neither is copied into the bounded editorial packet. `importanceSummary` records discovered/admitted/candidate-only counts, history availability, configured source status, and budgets. Source coverage remains partial and the pool is not a complete release database.

The selected calendar scope does not reopen historical packets or change public Canonical fields. Existing verification/publisher gates still own adoption. A new gate changes prospective work only; an inherited entry remains available until normal expiry or evidence-backed correction/removal.

Run `node scripts/replay-calendar-importance.mjs` for a network-free comparison of the checked-in Daily 18/19/21/30 snapshots. It groups the older raw rows using the current identity registry and uses only earlier-dated news from the current archive. This is not an immutable historical backtest: source caps and later archive revisions limit recall claims. The report includes every keep/defer reason, platform opportunities, official URL opportunities, and unavailable source-state evidence; lower counts do not establish quality or prove that an important indie or a never-covered major release was retained.

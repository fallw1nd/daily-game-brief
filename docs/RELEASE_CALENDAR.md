# Release Calendar

The Daily packet includes a rolling future-15-day release calendar. Discovery is automated; adoption is evidence-bounded and performed through the normal editorial/publisher flow.

## Flow

1. Build the next 15 Beijing-date days.
2. Query the configured cross-platform discovery sources.
3. Normalize title/platform/date identities and surface conflicts.
4. Prioritize known titles, cross-source leads, missing-baseline items, and platform coverage gaps.
5. Open official developer/publisher/platform pages before adoption.
6. Submit only verified additions/changes through Daily `upcomingMode:"inherit_and_patch"`.

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

## Media

Calendar covers follow `docs/MEDIA_PIPELINE.md`. Missing art is not a reason to omit a verified release; use an explicit unavailable state.

## Local check

```bash
npm run calendar:discover -- --date=YYYY-MM-DD
npm run check
```

Coverage is intentionally conservative: the project reduces omissions but does not claim a complete global release database.

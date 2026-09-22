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

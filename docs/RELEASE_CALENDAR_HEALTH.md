# Release calendar source health ledger

`scripts/lib/release-calendar-health.mjs` is a small pure-function ledger for
future calendar collectors. It records what a collector observed; it does not
fetch pages, parse HTML, choose fallbacks, or promote a calendar row to an
editorial fact. Workflow wiring is intentionally a separate change.

The main API is:

```js
import {
  updateCalendarHealth,
  sourceHealthSummary,
} from "./scripts/lib/release-calendar-health.mjs";

const next = updateCalendarHealth(previousLedger, report);
const pcSources = sourceHealthSummary(next, { platform: "PC" });
```

`updateCalendarHealth(previous, report)` accepts a report with `editionDate`,
`fetchedAt`, and `coverage`. Each coverage entry should identify a `sourceId`
and provide the phase fields below. `sourceStatus` describes transport/HTTP
work independently from `parserStatus`; each is `success`, `failed`,
`partial_failure`, or `unknown`. The collector should provide
`pagesAttempted`, `pagesSucceeded`, `pagesFailed`, `inWindow`, `usefulLeads`,
and `durationMs` when those values are measured. `usefulLeads` is reserved for
dated, non-verified research leads; it does not mean confirmed coverage.

The optional `status`/`outcome` field describes the aggregate result. Use
`empty_or_changed` when transport succeeded but a parser returned no usable
rows or the source shape changed. Add explicit `empty`, `changed`, and
`partialFailure` booleans when the collector can distinguish them. A legacy
coverage record containing only `status`, `pages`, or `inWindow` cannot prove
either phase succeeded, so the ledger stores both phase statuses as
`unknown`.

An observation is identified by the tuple `(editionDate, fetchedAt, sourceId)`.
Replaying the same report replaces the observation in place and does not add a
second check. Reports arriving out of order are retained in chronological
`recent` history, but the source's `last*` fields continue to describe the
newest observation. History is bounded to the latest 30 observations per
source. A retry may fill previously missing fields for the same tuple.

The returned ledger has `schemaVersion`, `updatedAt`, `sources`, and
`diagnostics`. If the previous ledger is malformed, the function rebuilds from
the current report and records a `malformed_previous_ledger` diagnostic rather
than throwing into discovery. Invalid source entries are skipped with an
`invalid_source_entry` diagnostic. Callers can persist the returned plain JSON
object directly.

`sourceHealthSummary` returns descriptive recent counts and the latest phase
signals. A caller may use it to order eligible fallbacks within the same
platform, with its own explicit policy for latency, parser failures, empty
results, and useful leads. The API intentionally emits no composite health
score and does not remove a platform from probing or claim that any source is
complete.

The module has no network or filesystem side effects. Its focused tests are in
`scripts/release-calendar-health.test.mjs`; the existing fixed replay tests
remain the evidence that legacy reports preserve unknown phase metadata.

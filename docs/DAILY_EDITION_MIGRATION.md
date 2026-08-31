# Daily Edition Migration

Status: **precutover compatibility only**. This document describes code that may understand a future `daily` edition without changing the current AM/PM production cadence. Formal production cutover requires separate explicit authorization.

## Daily canonical contract

- `period`: `daily`
- edition ID: `YYYY-MM-DD-daily`
- Canonical `schemaVersion`: `2`
- finalized packet `schemaVersion`: `3` (unchanged)
- window: previous day 17:00 **exclusive** through current day 17:00 **inclusive**, `Asia/Shanghai`
- `plannedAt`: current day 17:00
- `windowEnd`: current day 17:00
- `nextEditionAt`: next day 17:00
- Chinese `archiveTitle`: starts with `日报｜`
- English `archiveTitle`: starts with `Daily Brief |`
- `upcomingMode`: `replace`
- `issueNumber`: `max(manifest.editions.issueNumber) + 1` for a new edition
- archive path: `archive/YYYY/MM/YYYY-MM-DD-daily.json`

Historical `am` and `pm` editions, IDs, issue numbers, paths, titles, windows, and published links remain immutable. The manifest stays schema v1; durable edition state stays schema v1; editorial input stays schema v2; editorial decision stays `contractVersion:2`; English Overlay stays schema v1.

## Precutover behavior

The compatibility branch must accept `am | pm | daily` explicitly in shared window, resolver, packet, publisher, validator, locale, media, search/UI, and manual workflow paths. No `else => pm` or `else => morning` fallback may define Daily semantics.

The existing production schedules remain unchanged during precutover:

- Final packet: 10:10 AM and 17:00 PM Beijing time.
- SLA watchdog: 11:00 AM and 17:50 PM.
- Scheduled media recovery: 11:10 AM and 18:00 PM.
- Existing ChatGPT Scheduled Tasks remain AM 10:20 and PM 17:10.

Manual workflow inputs may accept an exact Daily edition so compatibility can be validated without enabling a Daily production cron. `main`, production archives, `latest.json`, `manifest.json`, and external ChatGPT Scheduled Tasks are not changed by precutover work.

## Reliability invariants

- GitHub remains the only durable orchestrator and publisher.
- ChatGPT remains a bounded editorial worker and may consume only acknowledged immutable packet evidence.
- `submitted` and `valid` remain GitHub publication-lane states; `timed_out` remains GitHub SLA-lane state.
- Invalid editorial output can only be repaired for the same edition and same `packetBlobSha`.
- Normal Canonical preflight remains authoritative even if durable state lags.
- Publisher remains idempotent and may replace only the same degraded edition without allocating a new issue number.
- English and media remain nonblocking presentation/enrichment lanes.
- Exact-edition SLA runs must not cancel one another.
- Active tracking must never be silently truncated by the editorial-input budget.

## Candidate and packet budgets

The editorial packet remains capped at 120,000 characters. Candidate pressure is expected to rise under a 24-hour Daily window, so omissions must be observable rather than silent.

Evidence extraction records candidates omitted by its package limit, including A/B counts. Editorial-input construction records included and omitted candidate counts plus per-event omission reason. Active tracking still fails visibly if it cannot fit. Precutover tests should cover representative 10/20/40/80-candidate pressure, including visible A-level omissions.

## Cutover gate

Do not enable Daily production until all of the following are true:

1. Precutover Verify passes `npm run check` with AM/PM regressions and Daily compatibility tests.
2. The last legacy PM edition is a healthy normal Canonical edition with publication/deployment state complete enough to establish a clean boundary.
3. Historical archive hashes remain unchanged.
4. The exact production cron and external Scheduled Task changes are reviewed together.

At formal cutover, the intended production cadence is:

- Final packet: 17:00 Asia/Shanghai (`0 9 * * *`), mapped to `daily`.
- ChatGPT Daily editorial handoff: 17:10 Asia/Shanghai.
- SLA: 17:50 Asia/Shanghai (`50 9 * * *`).
- Scheduled media recovery: 18:00 Asia/Shanghai (`0 10 * * *`).
- Packet-triggered delayed exact-edition SLA remains enabled.

The existing PM ChatGPT task is converted to Daily. The AM task is disabled, not replaced by a third long-lived task. Production cron removal/change and external task mutation are **cutover actions**, not precutover actions.

## Boundary transition

If the final legacy edition is `D-pm`, its window is `(D 10:10, D 17:00]`. The first Daily edition is `D+1-daily` with `(D 17:00, D+1 17:00]`. Therefore the exact `D 17:00` boundary belongs only to the final PM edition, while the first Daily starts strictly after it. Adjacent-edition dedupe uses the final PM as the first Daily's neighbor.

No calendar date is hardcoded as the migration date. Due-edition selection derives the next eligible window from the last published cutoff.

## Rollback

- Before a Daily cutoff creates/owns work, restore the legacy schedules.
- If a Daily cutoff has passed and the same Daily has acknowledged packet/editorial/recovery work in progress, finish that exact Daily through GitHub-owned recovery before changing cadence.
- If the latest successful edition is `D-daily`, the first rollback edition is `D+1-am` with `(D 17:00, D+1 10:10]`, followed by `D+1-pm`. Never create `D-pm` after a published `D-daily`.
- A published Daily edition is never renamed, deleted, or split into historical AM/PM editions.

## Production acceptance

`npm run check` proves compatibility, not production completion. The migration is not considered production-verified until the first real Daily publishes correctly and at least three consecutive Daily editions complete without manual publication intervention. Prefer seven days without publication intervention before closing the migration maintenance item.

Editorial Discovery Expansion is intentionally out of scope for cadence migration. Any subject taxonomy such as `game | company | platform | person | topic`, or any Canonical schema change motivated by non-game subjects, must be proposed and tested independently.

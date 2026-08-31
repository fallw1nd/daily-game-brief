# Daily Edition Migration

Status: **production cutover authorized 2026-08-31**. Daily is the active production cadence. The first real Daily is also the cutover validation run; production acceptance remains open until the real publication path and subsequent unattended editions are verified.

## Daily canonical contract

The Daily edition is scheduled for **12:00 Asia/Shanghai**. Its factual evidence window normally closes at 10:10 so editorial, trusted publication, media enrichment, validation, and deployment can complete before public release.

- `period`: `daily`
- edition ID: `YYYY-MM-DD-daily`
- Canonical `schemaVersion`: `2`
- finalized packet `schemaVersion`: `3`
- editorial input: v2
- editorial decision: `contractVersion:2`
- durable state: v1
- manifest: v1
- English Overlay: v1
- normal evidence window: previous day 10:10 **exclusive** through current day 10:10 **inclusive**, `Asia/Shanghai`
- `windowEnd`: current day 10:10
- `plannedAt`: current day 12:00
- `nextEditionAt`: next day 12:00
- Chinese `archiveTitle`: `日报｜...`
- English `archiveTitle`: `Daily Brief | ...`
- `upcomingMode`: `replace`
- new `issueNumber`: `max(manifest.editions.issueNumber) + 1`
- archive path: `archive/YYYY/MM/YYYY-MM-DD-daily.json`

Facts first published after 10:10 belong to the next Daily edition. Historical AM/PM editions remain immutable.

## Production timeline

1. **10:10** — close evidence and start `Final editorial packet` (`10 2 * * *`, UTC).
2. **10:20** — active Daily ChatGPT editorial task. If the exact acknowledged packet is missing, it may write only `automation/wake/<edition-id>.json` on `automation/editorial/<edition-id>` and stop. GitHub performs recovery.
3. **11:00** — Canonical publication SLA / degraded recovery (`0 3 * * *`, UTC). Packet collection also schedules exact-edition SLA verification, so GitHub cron is not the sole liveness path.
4. **Immediately after Canonical publication** — exact-edition media enrichment.
5. **11:10** — scheduled media recovery (`10 3 * * *`, UTC).
6. **12:00** — planned public release. Daily Pages observes `plannedAt` as the release gate.

The former PM ChatGPT task is disabled. The legacy 17:00 packet, 17:50 SLA, and 18:00 media schedules are removed. No third long-lived ChatGPT task exists.

## First production bridge

Actual production state at authorization differed from the earlier preferred final-AM cutover plan: the latest published Canonical was `2026-08-30-pm` (issue 20), ending at **2026-08-30 17:00**, and no healthy `2026-08-31-am` had been published.

Using the normal Daily window for `2026-08-31-daily` would have overlapped already-published PM facts from 10:10–17:00. Therefore the authorized first Daily has one deterministic migration bridge:

- `2026-08-31-daily`
- window: **(2026-08-30 17:00, 2026-08-31 10:10]**
- `plannedAt`: **2026-08-31 12:00**
- expected issue: **21**

From `2026-09-01-daily` onward the standard 24-hour Daily window resumes: `(previous 10:10, current 10:10]`.

This date-specific exception is deliberately encoded in the shared edition-window helper so packet construction, immutable packet validation, publication validation, UI, and recovery resolve the same first-edition boundary. It is not a reusable fallback.

## Reliability invariants

- GitHub is the durable orchestrator, recovery executor, validator, publisher, deployer, and incident owner.
- ChatGPT is a bounded editorial worker. The exact-edition wake file is only a liveness signal, not recovery state or content.
- Wake identity comes from current `main` Canonical succession, never Actions start time or wall-clock guessing.
- `submitted` / `valid` remain GitHub publication-lane states; `timed_out` remains GitHub SLA-lane state.
- Invalid editorial output may only be repaired for the same edition and immutable `packetBlobSha`.
- Current `main` Canonical is authoritative even if durable state lags.
- Publisher remains idempotent and may replace only the same degraded edition without allocating a new issue number.
- English and media remain nonblocking.
- Exact-edition SLA runs do not cancel one another.
- Active tracking must not be silently truncated by input budgets.
- Candidate/package budget omissions remain visible telemetry.

## Cutover actions

The formal cutover consists of these coordinated changes:

- map the 10:10 packet schedule to `daily` and remove the 17:00 packet cron;
- map the 11:00 SLA schedule to `daily` and remove the 17:50 SLA cron;
- keep 11:10 as the only scheduled media recovery and remove the 18:00 recovery cron;
- convert the existing AM ChatGPT task to the Daily task at 10:20;
- disable the existing PM ChatGPT task;
- activate the Daily root contract and period-aware UI copy;
- retain manual `am | pm | daily` workflow inputs only for explicit historical recovery/rollback compatibility;
- preserve all historical Canonical data unchanged.

## Rollback

If rollback is authorized after a successful `D-daily`, resume with `D-pm` using `(D 10:10, D 17:00]`, then continue normal legacy AM/PM semantics. Never create an AM ending at a cutoff already owned by a published Daily. Published Daily editions are never renamed, deleted, or split.

The one-time `2026-08-31-daily` bridge must remain immutable after publication even if cadence is later rolled back.

## Production acceptance

Static `npm run check` is necessary but not sufficient. The cutover is not considered fully production-verified until:

1. the real `2026-08-31-daily` completes packet → editorial decision → Canonical → deployment → media with its bridge window intact;
2. online `latest.json`, archive, manifest, search index, and relevant media URLs are validated;
3. the active Daily task remains enabled at 10:20 and the former PM task remains disabled;
4. the wake/SLA liveness route is verified without creating a second recovery owner;
5. at least **three consecutive Daily editions** complete without manual publication intervention; prefer seven days before closing the migration maintenance item.

The first real edition is an authorized migration execution and may publish later than its nominal 12:00 target because formal cutover began after noon. That lateness is recorded as cutover evidence; it does not redefine the normal Daily SLA.

Editorial Discovery Expansion and unrelated schema changes remain out of scope.

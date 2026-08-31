# Daily Edition Migration

Status: **precutover compatibility only**. This document describes code that may understand a future `daily` edition without changing the current AM/PM production cadence. Formal production cutover requires separate explicit authorization.

## Daily canonical contract

The Daily edition is scheduled for **12:00 Asia/Shanghai**, but its factual evidence window closes earlier so editorial, publication, media enrichment, validation, and deployment can finish before the public release target.

- `period`: `daily`
- edition ID: `YYYY-MM-DD-daily`
- Canonical `schemaVersion`: `2`
- finalized packet `schemaVersion`: `3` (unchanged)
- evidence window: previous day 10:10 **exclusive** through current day 10:10 **inclusive**, `Asia/Shanghai`
- `windowEnd` / evidence cutoff: current day 10:10
- `plannedAt`: current day 12:00
- `nextEditionAt`: next day 12:00
- Chinese `archiveTitle`: starts with `日报｜`
- English `archiveTitle`: starts with `Daily Brief |`
- `upcomingMode`: `replace`
- `issueNumber`: `max(manifest.editions.issueNumber) + 1` for a new edition
- archive path: `archive/YYYY/MM/YYYY-MM-DD-daily.json`

Information first published after 10:10 belongs to the next Daily edition. The 10:10–12:00 production interval is deliberately reserved for bounded editorial processing, trusted publication, media work, validation, and release preparation; it is not part of the current edition's fact window.

Historical `am` and `pm` editions, IDs, issue numbers, paths, titles, windows, and published links remain immutable. The manifest stays schema v1; durable edition state stays schema v1; editorial input stays schema v2; editorial decision stays `contractVersion:2`; English Overlay stays schema v1.

## Noon production timeline

After formal cutover, the intended Daily production sequence is:

1. **10:10** — close the 24-hour evidence window and start `Final editorial packet` (`10 2 * * *`, UTC).
2. **10:20** — run the Daily ChatGPT editorial handoff. The existing AM long-lived task is converted to Daily; no third task is created. If the exact acknowledged Daily packet is missing, the task may create only an exact-edition `automation/wake/<edition-id>.json` on `automation/editorial/<edition-id>` and stop. That push wakes the existing GitHub packet workflow; ChatGPT does not collect, build, validate, or publish recovery data itself.
3. **11:00** — Canonical publication SLA / GitHub-owned degraded recovery (`0 3 * * *`, UTC). A normal valid editorial decision may publish earlier; the SLA is the recovery deadline, not the public release time. A packet run started by the 10:20 wake signal also schedules this exact-edition SLA verification, so GitHub cron delay is not the only liveness path.
4. **Immediately after Canonical publication** — dispatch exact-edition media enrichment. This remains event-driven and should normally complete before the public release.
5. **11:10** — scheduled media recovery (`10 3 * * *`, UTC) for any exact-edition enrichment that did not complete normally.
6. **12:00** — planned public Daily release. Daily Pages deployment is held until the edition's `plannedAt`, so early Canonical/media commits can stage safely without exposing the new edition before noon.

Media remains nonblocking: a story or upcoming item may still publish with the contract's explicit `unavailable` media state if no traceable asset can be verified in time. A later verified media enrichment may update that same edition without changing its facts or issue number.

## Precutover behavior

The compatibility branch must accept `am | pm | daily` explicitly in shared window, resolver, packet, publisher, validator, locale, media, search/UI, and manual workflow paths. No `else => pm` or `else => morning` fallback may define Daily semantics.

The existing production schedules remain unchanged during precutover:

- Final packet: 10:10 AM and 17:00 PM Beijing time.
- SLA watchdog: 11:00 AM and 17:50 PM.
- Scheduled media recovery: 11:10 AM and 18:00 PM.
- Existing ChatGPT Scheduled Tasks remain AM 10:20 and PM 17:10.

Manual workflow inputs may accept an exact Daily edition so compatibility can be validated without enabling a Daily production cron. The Daily wake push trigger may also exist before cutover, but it is inert because legacy AM/PM task prompts never write `automation/wake/*.json` and the trigger accepts only `automation/editorial/*-daily`. `main`, production archives, `latest.json`, `manifest.json`, and external ChatGPT Scheduled Tasks are not changed by precutover work.

## Reliability invariants

- GitHub remains the only durable orchestrator, recovery executor, validator, and publisher.
- ChatGPT remains a bounded editorial worker. The only liveness exception is an exact-edition Daily wake file when the acknowledged packet is missing; the wake is a trigger, not recovery state or content.
- The wake target must come from the immediate successor of current `main` Canonical state, never from Actions start time or wall-clock guessing. The GitHub resolver independently rejects a mismatched or too-early exact edition.
- `submitted` and `valid` remain GitHub publication-lane states; `timed_out` remains GitHub SLA-lane state.
- Invalid editorial output can only be repaired for the same edition and same `packetBlobSha`.
- Normal Canonical preflight remains authoritative even if durable state lags.
- Publisher remains idempotent and may replace only the same degraded edition without allocating a new issue number.
- English and media remain nonblocking presentation/enrichment lanes.
- Exact-edition SLA runs must not cancel one another.
- Active tracking must never be silently truncated by the editorial-input budget.
- Daily `plannedAt` is not the same concept as `windowEnd`: 10:10 closes evidence; 12:00 schedules public release.

## Candidate and packet budgets

The editorial packet remains capped at 120,000 characters. Candidate pressure is expected to rise under a 24-hour Daily window, so omissions must be observable rather than silent.

Evidence extraction records candidates omitted by its package limit, including A/B counts. Editorial-input construction records included and omitted candidate counts plus per-event omission reason. Active tracking still fails visibly if it cannot fit. Precutover tests should cover representative 10/20/40/80-candidate pressure, including visible A-level omissions.

## Cutover gate

Do not enable Daily production until all of the following are true:

1. Precutover Verify passes `npm run check` with AM/PM regressions, Daily compatibility tests, and the exact-edition wake-path regression.
2. The **last legacy edition is a healthy AM edition** whose 10:10 cutoff and publication/deployment state establish the clean migration boundary.
3. The legacy PM run for that cutover date is disabled before its 17:00 cutoff; it must not publish after Daily ownership begins.
4. Historical archive hashes remain unchanged.
5. The exact production workflow changes and external Scheduled Task changes are reviewed together.
6. The Daily UI and root `AGENTS.md` no longer describe the active Daily edition as a twice-daily 10:10/17:00 product.

At formal cutover:

- the existing **AM ChatGPT task** is converted to the Daily task and remains at 10:20, including the bounded missing-packet wake rule;
- the existing PM ChatGPT task is disabled;
- the 10:10 packet schedule is mapped to `daily` and the legacy 17:00 packet schedule is removed/disabled;
- the 11:00 SLA schedule is mapped to `daily` and the legacy 17:50 SLA schedule is removed/disabled;
- the 11:10 media recovery schedule remains as the Daily recovery point and the legacy 18:00 recovery is removed/disabled;
- Daily Pages deployment observes the 12:00 `plannedAt` release gate.

Production cron removal/change and external task mutation are **cutover actions**, not precutover actions.

## Boundary transition

The noon design intentionally aligns Daily evidence with the legacy AM cutoff, eliminating the special bridge window that a 12:00 evidence cutoff would require.

If the final legacy edition is `D-am`, its window is `(D-1 17:00, D 10:10]`. The first Daily edition is `D+1-daily` with `(D 10:10, D+1 10:10]`, planned for public release at `D+1 12:00`. Therefore the exact `D 10:10` boundary belongs only to the final AM edition, while the first Daily starts strictly after it. Adjacent-edition dedupe uses the final AM as the first Daily's neighbor.

No calendar date is hardcoded as the migration date. Due-edition selection derives the next eligible evidence window from the last published cutoff.

## Rollback

- Before a Daily 10:10 cutoff creates/owns work, restore the legacy schedules.
- If a Daily cutoff has passed and the same Daily has acknowledged packet/editorial/recovery work in progress, finish that exact Daily through GitHub-owned recovery before changing cadence.
- If the latest successful edition is `D-daily`, rollback can resume with `D-pm` using `(D 10:10, D 17:00]`, followed by the normal next AM window. If rollback is authorized before 17:00, PM waits for its fixed cutoff; if authorized after 17:00, the resolver may process that exact PM as backlog.
- Never create an AM edition ending at the same `D 10:10` cutoff already owned by `D-daily`.
- A published Daily edition is never renamed, deleted, or split into historical AM/PM editions.

## Production acceptance

`npm run check` proves compatibility, not production completion. The migration is not considered production-verified until the first real Daily publishes correctly around the noon release target and at least three consecutive Daily editions complete without manual publication intervention. The first real Daily acceptance must explicitly verify both normal packet availability and the independent wake/SLA liveness path. Prefer seven days without publication intervention before closing the migration maintenance item.

Editorial Discovery Expansion is intentionally out of scope for cadence migration. Any subject taxonomy such as `game | company | platform | person | topic`, or any Canonical schema change motivated by non-game subjects, must be proposed and tested independently.

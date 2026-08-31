# Scheduled Task Editorial Contract

Use this prompt only for the two existing ChatGPT tasks: AM at 10:20 and PM at 17:10, `Asia/Shanghai`. Handoff time never changes edition identity or the fixed 10:10 AM / 17:00 PM evidence cutoffs. Precutover production remains unchanged; at formal cutover the AM task becomes Daily at 10:20 and PM is disabled. Daily closes evidence at 10:10 and is planned for public release at 12:00.

## 1. Resolve input and Canonical state

1. On `automation/state`, select the oldest already-due edition for this period with `packet.status:"ready"`, uncommitted publication, and `editorial.status` of `pending` or `invalid`. `pending` starts a decision; `invalid` repairs one. `submitted`/`valid` belong to GitHub's publication lane and `timed_out` to its SLA lane; never select or re-edit them. Never skip backlog or derive identity from runner time.
2. If no eligible state exists, AM/PM reports no work and stops. Daily after formal cutover may use one missing-packet wake path only: read current `main` manifest/latest, derive only the immediate successor of the latest published healthy AM or Daily edition, and require that candidate Canonical to be absent. Never infer the edition from Actions timing or wall-clock date. Create or reuse `automation/editorial/<edition-id>` from current `main`; if the exact wake file does not already exist, commit only `automation/wake/<edition-id>.json` as `{"schemaVersion":1,"editionId":"<edition-id>","period":"daily","reason":"packet_missing_at_handoff"}`. Then stop. The push only wakes GitHub's exact-edition recovery; it is not recovery performed by ChatGPT.
3. For normal ready work, read `automation/status/<edition-id>.json`. Require schema v1 and a 40-character `packet.blobSha`. For `invalid`, require durable `validationErrors` and `submissionSha`, then repair only those errors and consequential consistency for the same edition and immutable packet.
4. Read the packet by its Git blob SHA—not `latest-*`, artifacts, branch timing, or Actions. Copy it unchanged to `packetBlobSha`. Require packet schema v3, `mode:"chatgpt-handoff"`, editorial input v2, exact edition/period/planned time/window, cutoff coverage, and post-cutoff finalization. On mismatch, report and stop.
5. After packet preflight, read current `main` `AGENTS.md`, this contract, manifest/latest, `config/title-translations.json`, and this edition's archive if listed. `main` is authoritative even when durable state lags. If a normal Canonical exists, verify and stop before drafting or submitting. Continue only if absent or `[自动事实清单]`; revise that same degraded edition and issue number.

Do not inspect or poll Actions, create/delete workflows, edit `automation/state`, publish, advance editions, or modify either long-lived task. Except for the bounded Daily wake file above, do not create recovery triggers. GitHub Actions alone owns collection recovery, validation, publication, deployment, and incidents.

## 2. Produce one bounded decision

- Return one `include`, `exclude`, or `needs_review` decision for every `packages` and `trackingQueue` item. Do not add events outside the packet.
- Use only opened evidence. `official` needs an opened primary source; `multi_source_verified` needs two independent reliable sources. Keep rumors `unconfirmed` and `needs_review` tracked with a concrete next check.
- Follow live `AGENTS.md` for Chinese titles, mainland terminology, sources, time boundaries, copy, and uncertainty. Narrow naming lookups cannot change facts. Never invent a subject marked `requires_subject_identity`.
- AM uses `upcomingMode:"replace"`; PM uses `upcomingMode:"inherit_and_patch"`; Daily uses `upcomingMode:"replace"`.
- Daily uses `(previous day 10:10, current day 10:10]`, `plannedAt` current day 12:00. Never admit facts first published after 10:10.

Use `contractVersion:2` and the exact `packetBlobSha`. Each include needs a complete language-neutral `sharedFactFrame`. Do not invent issue numbers, final `entryId`, or digests. English is optional and nonblocking; omit `locales.en` if complete natural English cannot stay inside the same evidence and fact frame.

## 3. Submit and stop

1. Only after the Canonical check and decision, create or reuse `automation/editorial/<edition-id>` from current `main`.
2. Commit only `automation/inbox/<edition-id>.json`.
3. After the decision commit succeeds, report edition and decision counts, then stop. GitHub Actions handles later stages.

A failure must never pause, disable, rename, reschedule, or otherwise mutate either long-lived ChatGPT task.

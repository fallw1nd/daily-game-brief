# Scheduled Task Editorial Contract

Use this prompt only for the two existing ChatGPT tasks: AM at 10:20 and PM at 17:10, `Asia/Shanghai`. Handoff time does not change edition identity or the fixed 10:10 AM / 17:00 PM evidence cutoffs. During Daily precutover these production tasks remain unchanged; at formal cutover the existing AM task is converted to Daily at 10:20 and the PM task is disabled. Daily closes evidence at 10:10 and is planned for public release at 12:00.

## 1. Resolve input and Canonical state

1. On `automation/state`, select the oldest already-due edition for this period with `packet.status:"ready"`, uncommitted publication, and `editorial.status` of `pending` or `invalid`. `pending` starts a decision; `invalid` repairs one. `submitted`/`valid` belong to GitHub's publication lane and `timed_out` to its SLA lane; never select or re-edit them. Never skip backlog or derive identity from runtime. If none exists, report no work and stop.
2. Read `automation/status/<edition-id>.json`. Require schema v1 and a 40-character `packet.blobSha`. For `invalid`, require durable `validationErrors` and `submissionSha`, then read that prior decision. Fix only those errors and consequential consistency in the same edition with the same immutable `packetBlobSha`. Never rediscover events, change packet, or advance.
3. Read the packet by its Git blob SHA—not `latest-*`, artifacts, branch timing, or Actions. Copy it unchanged to `packetBlobSha`. Require packet schema v3, `mode:"chatgpt-handoff"`, editorial input v2, and exact edition, period, planned time, fixed window, cutoff coverage, and post-cutoff finalization. On mismatch, report and stop.
4. After packet preflight, read current `main` `AGENTS.md`, this contract, `public/data/manifest.json`, `public/data/latest.json`, `config/title-translations.json`, and this edition's archive if listed. `main` is authoritative even when durable state lags. If a normal Canonical exists, verify and stop before drafting or submitting. Continue only if absent or `[自动事实清单]`; revise that same degraded edition and issue number.

Do not inspect or poll Actions, dispatch recovery, create or delete workflows, edit `automation/state`, publish, advance editions, or modify either long-lived task. GitHub Actions alone owns recovery, validation, publication, deployment, and incidents.

## 2. Produce one bounded decision

- Return one `include`, `exclude`, or `needs_review` decision for every `packages` and `trackingQueue` item. Do not add events outside the packet.
- Use only opened evidence. `official` needs an opened primary source; `multi_source_verified` needs two independent reliable sources. Keep rumors `unconfirmed` and `needs_review` tracked with a concrete next check.
- Follow live `AGENTS.md` for Chinese titles, mainland terminology, sources, time boundaries, copy, and uncertainty. Its narrow naming lookups cannot change facts. Never invent a subject marked `requires_subject_identity`.
- AM uses `upcomingMode:"replace"`; PM uses `upcomingMode:"inherit_and_patch"`; Daily uses `upcomingMode:"replace"`.
- Daily uses the immutable evidence window `(previous day 10:10, current day 10:10]`, `plannedAt` current day 12:00. Never add facts first published after 10:10 merely because the editorial task runs at 10:20.

Use `contractVersion:2` and the exact `packetBlobSha`. Each included item needs a complete language-neutral `sharedFactFrame`. Do not invent issue numbers, final entry IDs, or digests.

English is optional and nonblocking. Include `locales.en` only when complete natural English stays within the evidence and `sharedFactFrame`; otherwise omit it. Never weaken or suppress Simplified Chinese Canonical because English is missing or invalid.

## 3. Submit and stop

1. Only after the Canonical check and decision, create or reuse `automation/editorial/<edition-id>` from current `main`.
2. Commit only `automation/inbox/<edition-id>.json`.
3. After the decision commit succeeds, report the edition and decision counts, then stop. GitHub Actions handles later stages.

A failure must never pause, disable, rename, reschedule, or otherwise mutate either long-lived ChatGPT task.

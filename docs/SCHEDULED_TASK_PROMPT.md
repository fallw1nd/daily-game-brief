# Scheduled Task Editorial Contract

Use this prompt for the two existing ChatGPT tasks only: AM at 10:20 and PM at 17:10, `Asia/Shanghai`. These are handoff times. Edition identity and evidence cutoffs remain fixed at 10:10 AM and 17:00 PM.

## 1. Resolve immutable input

1. On `automation/state`, select the oldest already-due edition for this task's period whose `packet.status` is `ready`, `editorial.status` is `pending`, and `publication.status` is not `committed`. Never skip backlog or derive the edition from actual runtime. If none exists, report no work and stop.
2. Read `automation/status/<edition-id>.json`. Require schema v1 and a 40-character `packet.blobSha`. Read the packet by that Git blob SHA—never through a `latest-*` pointer, artifact list, branch timing, or Actions run. Copy the SHA unchanged to decision field `packetBlobSha`.
3. Require packet schema v3, `mode:"chatgpt-handoff"`, editorial input schema v2, and exact edition, period, planned time, fixed window, cutoff coverage, and post-cutoff finalization. On any mismatch, report the edition and state, then stop.
4. Only after the packet passes preflight, read current `main` versions of `AGENTS.md`, this contract, `public/data/manifest.json`, `public/data/latest.json`, and `config/title-translations.json`. Live repository rules and packet `outputSchema` are authoritative.

Do not inspect or poll Actions, dispatch recovery, create or delete workflow files, edit `automation/state`, publish content, advance to another edition, or modify either long-lived task. GitHub Actions alone owns packet recovery, validation, publication, deployment, and incidents.

## 2. Produce one bounded decision

- Return exactly one `include`, `exclude`, or `needs_review` decision for every `packages` and `trackingQueue` item. Do not add events outside the packet.
- Use only selected opened evidence. `official` requires an opened primary source; `multi_source_verified` requires two independent reliable sources. Rumors remain `unconfirmed` and tracked. `needs_review` remains tracked with a concrete next check.
- Follow live `AGENTS.md` for Chinese titles, mainland Simplified Chinese terminology, source rules, time boundaries, visible copy, and uncertainty. The only permitted external lookups are its narrow title-name and terminology-only exceptions; they cannot add or change event facts.
- Respect packet subject taxonomy. An item marked `requires_subject_identity` cannot be included by inventing a game/title identity.
- AM uses `upcomingMode:"replace"`; PM uses `upcomingMode:"inherit_and_patch"`.

The decision must use `contractVersion:2` and the exact `packetBlobSha`. Every included item needs a complete `sharedFactFrame` containing only the language-neutral facts shared by all presentations. Do not invent issue numbers, final entry IDs, or digests.

English is optional and nonblocking. Include `locales.en` only when a complete natural English presentation stays within the same evidence and `sharedFactFrame`; otherwise omit it. Never weaken or suppress the Simplified Chinese Canonical decision because English is missing or invalid.

## 3. Submit and stop

1. From current `main`, create or reuse `automation/editorial/<edition-id>`.
2. Commit only `automation/inbox/<edition-id>.json`.
3. If the normal Canonical edition already exists, verify it and stop. If it is an `[自动事实清单]`, submit a same-edition revision without changing its issue number.
4. After the decision commit succeeds, report the edition and include/exclude/review counts, then stop. GitHub Actions handles every later stage.

A failure in this run must never pause, disable, rename, reschedule, or otherwise mutate either long-lived ChatGPT task.

# Scheduled Task Editorial Contract

Production uses one active long-lived ChatGPT editorial task: Daily at 10:20, `Asia/Shanghai`. The former PM task is disabled. Daily closes evidence at 10:10 and is planned for public release at 12:00. The first production Daily, `2026-08-31-daily`, is a one-time bridge `(2026-08-30 17:00, 2026-08-31 10:10]` from the final published legacy PM; later Daily editions use `(previous day 10:10, current day 10:10]`.

The task has two bounded responsibilities in order: **current Canonical editorial work first**, then **at most one already-published English repair**. English must never delay, weaken, or change verified Simplified Chinese Canonical facts, but an unavailable English lane is also not allowed to disappear silently or remain permanently unconsumed.

## 1. Resolve current Canonical work

1. On `automation/state`, select the oldest already-due Daily edition with `packet.status:"ready"`, uncommitted publication, and `editorial.status` of `pending` or `invalid`. `pending` starts a decision; `invalid` repairs one. `submitted`/`valid` belong to GitHub's publication lane and `timed_out` to its SLA lane; never select or re-edit them. Never skip backlog or derive identity from runner time.
2. If no eligible Canonical state exists, do not immediately stop. First continue to section 4 (English repair backlog). Only if there is neither Canonical work nor eligible English repair may the bounded missing-packet wake be used: read current `main` manifest/latest, derive only the immediate next `daily` edition after the latest published Canonical, and require that candidate Canonical to be absent. Never infer the edition from Actions timing or wall-clock date. Create or reuse `automation/editorial/<edition-id>` from current `main`; if the exact wake file does not already exist, commit only `automation/wake/<edition-id>.json` as `{"schemaVersion":1,"editionId":"<edition-id>","period":"daily","reason":"packet_missing_at_handoff"}`. Then stop.
3. For normal ready work, read `automation/status/<edition-id>.json`. Require schema v1 and a 40-character `packet.blobSha`. For `invalid`, require durable `validationErrors` and `submissionSha`, then repair only those errors and consequential consistency for the same edition and immutable packet.
4. Read the packet by its Git blob SHA—not `latest-*`, artifacts, branch timing, or Actions. Copy it unchanged to `packetBlobSha`. Require packet schema v3, `mode:"chatgpt-handoff"`, editorial input v2, exact edition/period/planned time/window, cutoff coverage, and post-cutoff finalization. On mismatch, report and stop.
5. After packet preflight, read current `main` `AGENTS.md`, this contract, manifest/latest, `config/title-translations.json`, and this edition's archive if listed. `main` is authoritative even when durable state lags. If a normal Canonical already exists, do not create a second Canonical decision; continue to section 4 instead. Only an absent Canonical or an existing `[自动事实清单]` may proceed through the same-edition Canonical revision path.

Do not inspect or poll Actions, create/delete workflows, edit `automation/state`, publish Canonical directly, advance editions, or mutate long-lived task configuration. Except for the bounded Daily wake file and the bounded English repair file described below, do not create recovery triggers. GitHub Actions owns collection recovery, validation, trusted publication, deployment, state acknowledgement, and incidents.

## 2. Produce one bounded Canonical decision

- Return exactly one `include`, `exclude`, or `needs_review` decision for every `packages` and `trackingQueue` item. Do not add events outside the packet.
- Use only opened evidence. `official` needs an opened primary source; `multi_source_verified` needs two independent reliable sources. Keep rumors `unconfirmed` and `needs_review` tracked with a concrete next check.
- Follow live `AGENTS.md` for Chinese titles, mainland terminology, sources, time boundaries, copy, and uncertainty. Narrow naming lookups cannot change facts. Never invent a subject marked `requires_subject_identity`.
- Daily uses `upcomingMode:"replace"`.
- Never admit facts outside the exact packet window. For `2026-08-31-daily` use the persisted bridge window; later Daily editions use the normal 24-hour window ending 10:10.

Use `contractVersion:2` and the exact `packetBlobSha`. Each include needs a complete language-neutral `sharedFactFrame`. Do not invent issue numbers, final `entryId`, or digests.

### English for a new Canonical submission

For every normal Daily submission, **attempt a complete `locales.en` in the same handoff by default**. English remains nonblocking, but omission is an exception rather than the normal path.

- `locales.en.entries` must cover all included decisions in the same order; `locales.en.upcoming` must cover the submitted upcoming items in order.
- Write natural editorial English independently inside the same evidence and `sharedFactFrame`; do not add dates, numbers, platforms, people, entities, versions, mechanisms, source authority, or certainty absent from Canonical evidence.
- Prefer official English title/terminology already present in opened English evidence. Chinese-only evidence may be naturally restated without enlarging the fact boundary.
- Never use Chinese body copy as an English fallback and never invent facts merely to make English complete.
- If a complete English presentation cannot safely be produced, omit `locales.en`; Canonical may still publish and GitHub records a machine-readable unavailable state for later repair.

## 3. Submit Canonical decision

1. Only after Canonical checks and decision completion, create or reuse `automation/editorial/<edition-id>` from current `main`.
2. Commit only `automation/inbox/<edition-id>.json`.
3. After the commit succeeds, do not inspect or poll its workflow. Continue only to the bounded English repair check in section 4; do not submit another Canonical edition in the same run.

## 4. Repair at most one published English backlog item

After handling the current Canonical decision, or when there was no eligible Canonical decision, repair **at most one** already-published English item. This lane is presentation-only and must not depend on mutable revision event keys.

1. Consider published editions from `2026-08-31-daily` onward whose current `main` English state is explicitly unavailable with `reasonCode` `editorial-overlay-missing` or `editorial-overlay-invalid`. Prefer the oldest such Daily edition so backlog drains deterministically. Ignore editions already carrying a valid English Overlay.
2. Read that edition's current Canonical archive from `main`. The final Canonical `entryId` / ordering is authoritative, including entries preserved through a same-edition revision even when their old `eventKey` no longer exists in the latest packet.
3. Draft a complete locale-repair payload with schema v1:
   - top level: `schemaVersion:1`, `locale:"en"`, exact `editionId`, English `archiveTitle`, `entries`, `upcoming`, and optional `sourceReport`;
   - each `entries` item uses the **final Canonical `entryId`** and supplies `headline`, `summary`, `verification`, `timeNote`, plus presentation-only labels when needed;
   - `entries` must cover every current Canonical entry exactly once and in current Canonical order;
   - `upcoming` must cover every current Canonical upcoming item exactly once using its stable locale identity;
   - do not provide or calculate `factsDigest`, `canonicalCopyDigest`, `localeDigest`, issue numbers, fact/time status, source URLs, platforms, dates, tracking, or any other Canonical authority field. Trusted publisher code calculates digests and rejects factual fields.
4. English repair may use the current Canonical copy and the edition's already-accepted evidence/decision solely to restate existing facts naturally. It must not rediscover the news, introduce later facts, or revise Canonical judgment.
5. Create or reuse `automation/locale/en/<edition-id>` from current `main` and commit only `automation/locale-inbox/<edition-id>.json`. The push is the sole repair trigger. Trusted GitHub code validates against current Canonical IDs and factsDigest, hash-guards archive/latest/manifest, writes only the English Overlay/availability state, updates durable locale state, deploys Pages if data changed, and closes the matching degraded-English incident after success.
6. After that one locale-repair commit succeeds, stop. Do not poll Actions.

A single Canonical or locale failure must never pause, disable, rename, reschedule, or otherwise mutate the active Daily task.

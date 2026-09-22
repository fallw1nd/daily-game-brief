# Scheduled Task Editorial Contract

Production has one enabled ChatGPT editorial task, invoked at 10:20 and 11:20 `Asia/Shanghai`. Daily evidence closes at 10:10, GitHub degraded fallback is due at 11:40, and public release is planned for 12:00. The task edits; GitHub owns collection recovery, validation, publication, deployment, state, and incidents.

Priority: new Canonical work → current Daily liveness wake → oldest ready `editorial_continuation` → ready `showcase_completion` → one English repair.

## 1. Resolve exact work

1. Select the oldest due Daily with acknowledged `packet.status:"ready"`, uncommitted publication, editorial `pending` or `invalid`, and no active continuation/showcase request. `pending` starts a decision; `invalid` repairs the same packet using durable `validationErrors` and `submissionSha`. Never edit `submitted`, `valid`, or `timed_out`.
2. Read `automation/status/<edition-id>.json`, then the packet by its exact Git blob SHA. Copy that SHA unchanged to `packetBlobSha`. Require packet v3, `mode:"chatgpt-handoff"`, editorial input v2, matching edition/window, cutoff coverage, and post-cutoff finalization.
3. Read current `main` `AGENTS.md` plus only the focused docs/data needed for this edition. Current Canonical is authoritative even if durable state lags.
4. If no Canonical work exists after 10:10 and the immediate next Daily lacks an acknowledged ready packet, commit only `automation/wake/<edition-id>.json` with `reason:"packet_missing_at_handoff"` on its editorial branch. Do not wait or poll. That invocation may still consume one continuation that was already ready before the wake.
5. For continuation/showcase work, use only the queue-authorized packet/blob/event identities. A trusted initial bundle may contain at most the Daily packet plus one next-news packet; otherwise use the single-inbox path. Never choose packet or event identity yourself.

## 2. Decide within the packet

- Return one `include`/`exclude`/`needs_review` per packet item; add nothing outside the packet.
- Follow `AGENTS.md` evidence thresholds. `official` needs primary evidence; two independent reliable sources are required only for `multi_source_verified`; `needs_review` requires a material blocker. Never invent a `requires_subject_identity` subject.
- Continuations preserve the edition, existing published content, issue/window, and scoped identities. News continuations cannot add calendar/showcase facts. Showcase completion follows `docs/SHOWCASE_RECOVERY.md`.
- Daily uses `upcomingMode:"inherit_and_patch"`. Calendar-only research is limited to `upcomingBaseline.refreshRange`; discovery failure cannot delete existing entries or alter news decisions.
- Every include needs a complete `sharedFactFrame`. Names, dates, numbers, platforms, people/entities, versions, and proper terms must come from selected evidence. Do not calculate issue numbers, final IDs, or digests.
- Attempt complete `locales.en` from the same fact frame. English is nonblocking; omit it if safe complete copy is not possible.

Commit `automation/inbox/<edition-id>.json` on `automation/editorial/<edition-id>`, or the trusted ordered bundle when explicitly authorized. After the commit succeeds, stop.

## 3. English repair

If no higher-priority work exists, repair one oldest published Daily whose English is unavailable for an editorial overlay reason. Final Canonical IDs/order are authoritative. Commit only the locale repair to `automation/locale/en/<edition-id>`; do not rediscover or change facts.

Do not poll Actions; create/delete workflows; edit `automation/state`; publish Canonical directly; advance editions; or mutate any Scheduled Task. A single failure must never change the task schedule or enable/disable state.

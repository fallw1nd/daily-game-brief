# Scheduled Task Editorial Contract

The deployment target is one enabled ChatGPT editorial task, invoked at 10:20 and 11:20 `Asia/Shanghai`. Daily evidence closes at 10:10, GitHub degraded fallback is due at 11:40, and public release is planned for 12:00. Task enabled status and actual starts must be verified in runtime receipts; this document is not proof of either. The task edits; GitHub owns collection recovery, validation, publication, deployment, state, and incidents.

Priority: new Canonical work → current Daily liveness wake → oldest ready `editorial_continuation` → ready `showcase_completion` → one English repair.

## 1. Resolve exact work

1. Read the contract, `AGENTS.md`, focused docs, and Canonical data from Git ref `main`. Read durable `automation/status/<edition-id>.json` and any already-authorized batch/queue paths from Git ref `automation/state`. `automation/state` is a branch name, not a file or path prefix. Always pass the ref explicitly when fetching durable files; a `404` from `main` says nothing about whether the file exists on `automation/state`. Do not use code search on `main` to decide that durable state is absent.
   Example (placeholders only; never use this as a fixed production edition): `fetch_file(path="automation/status/<edition-id>.json", ref="automation/state")`.
2. Select the oldest due Daily with acknowledged `packet.status:"ready"`, uncommitted publication, editorial `pending` or `invalid`, and no active continuation/showcase request. `pending` starts a decision; `invalid` repairs the same packet using durable `validationErrors` and `submissionSha`. Never edit `submitted`, `valid`, or `timed_out`.
3. Read the packet by its exact Git blob SHA recorded in durable state. Copy that SHA unchanged to `packetBlobSha`. Require packet v3, `mode:"chatgpt-handoff"`, editorial input v2, matching edition/window, cutoff coverage, and post-cutoff finalization. Do not substitute a branch-relative or latest packet for the acknowledged blob.
4. First confirm Git ref `automation/state` is readable. If it is readable and the immediate next Daily status fetch returns `404`, or its status has no acknowledged ready packet, apply the existing Step 5 liveness conditions. If the ref is unreadable or access fails, report the exact ref, path, and error, then stop; that failure does not prove the packet is missing. Never guess a packet or bypass a gate.
5. If no Canonical work exists after 10:10 and the immediate next Daily lacks an acknowledged ready packet, commit only `automation/wake/<edition-id>.json` with `reason:"packet_missing_at_handoff"` on its editorial branch. After a successful wake, re-read that exact durable status at 45–60 second intervals for at most 10 minutes. As soon as its acknowledged packet is ready, continue Steps 2–3 and finish the Daily in this same invocation. Do not keep writing wake commits. If the wait expires, report the wake commit and last observed state as pending, never as delivered.
6. For continuation/showcase work, use only the queue-authorized packet/blob/event identities. A trusted initial bundle may contain at most the Daily packet plus one next-news packet; otherwise use the single-inbox path. Never choose packet or event identity yourself.

## 2. Decide within the packet

- Return one `include`/`exclude`/`needs_review` per packet item; add nothing outside the packet.
- Follow `AGENTS.md` evidence thresholds. `official` needs primary evidence; two independent reliable sources are required only for `multi_source_verified`; `needs_review` requires a material blocker. Never invent a `requires_subject_identity` subject.
- Continuations preserve the edition, existing published content, issue/window, and scoped identities. News continuations cannot add calendar/showcase facts. Showcase completion follows `docs/SHOWCASE_RECOVERY.md`.
- Daily uses `upcomingMode:"inherit_and_patch"`. Calendar-only research is limited to `upcomingBaseline.refreshRange`; discovery failure cannot delete existing entries or alter news decisions. Read every `editorialInput.calendarWork.pages` blob by its pinned SHA (path hint: `automation/batches/<edition-id>/<name>`, ref `automation/state`). The inline discovery is only a preview. Return `calendarReview.pages` keyed by each blob SHA and `calendarReview.platforms` keyed by PC/PlayStation/Xbox/Nintendo: each has status `reviewed` or `deferred` and a concrete reason describing actual checks or the blocker. Deferred work must remain explicit; never claim complete coverage.
- Every include needs a complete `sharedFactFrame`. Names, dates, numbers, platforms, people/entities, versions, and proper terms must come from selected evidence. Do not calculate issue numbers, final IDs, or digests.
- Attempt complete `locales.en` from the same fact frame. English is nonblocking; omit it if safe complete copy is not possible.

Commit `automation/inbox/<edition-id>.json` on `automation/editorial/<edition-id>`, or the trusted ordered bundle when explicitly authorized. After committing, observe only the same edition status at 45–60 second intervals for at most 10 minutes. If the exact submission becomes `invalid`, repair its reported errors once against the same packet; never overwrite a newer submission. A committed publication is delivery evidence; deployment remains pending until its receipt succeeds. Report commit/packet/publication/deployment separately. If the wait expires, report pending and the exact last status.

## 3. English repair

If no higher-priority work exists, repair one oldest published Daily whose English is unavailable for an editorial overlay reason. Final Canonical IDs/order are authoritative. Commit only the locale repair to `automation/locale/en/<edition-id>`; do not rediscover or change facts.

Do not poll Actions logs (only the bounded durable-state checks above); create/delete workflows; edit `automation/state`; publish Canonical directly; advance editions; or mutate any Scheduled Task. A single failure must never change the task schedule or enable/disable state.

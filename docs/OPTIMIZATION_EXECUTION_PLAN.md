# Optimization closeout execution plan

## Baseline and scope

- Working branch: `codex/optimization-closeout`.
- Local baseline: `82edca6` (`origin/main` at checkout time, 2026-09-13 Asia/Shanghai).
- `git fetch origin main` was attempted twice; GitHub returned `Recv failure: Connection was reset`. The local remote-tracking ref is therefore evidence of the checked-out baseline, not proof that remote `main` is newer.
- The work must preserve the Daily edition window, continuous issue/archive identity, packet-bound evidence, existing publisher ownership, Phosphor/UI rules, and one long-lived editorial task with two invocations. No merge, production push, schedule mutation, or historical correction is authorized here.

## Checkpoints

### 1. Baseline / production stability

- [x] Read the live automation contract, state schema, packet/editorial/publisher/SLA workflows, and current tests.
- [ ] Resolve the scheduler-source question: compare repository contracts with the actual configured task/automation times; record any inaccessible or contradictory evidence rather than inferring from docs.
- [ ] Build a read-only state table for all current Daily editions: packet, editorial, publication, deployment, locale, backlog age, and immutable packet identity.
- [ ] Reproduce the known failure paths locally: missing/invalid packet, failed degraded publication, timed-out recovery, same-edition revision, and stale/newer edition selection.
- [x] Fix only state/identity propagation defects that block later work. Do not relax source, identity, or evidence validation to make a story publish.
- [ ] Record normal and large-run timings, source failures, backlog count, provider/cache token fields, and the limits of local evidence.

### 2. Bounded throughput and cost

- [x] Trace the one-packet-per-call path from `editorialize.mjs` and batch artifacts through scheduled-task instructions, branch commits, publisher acknowledgement, and recovery.
- [x] Measure how many bounded continuation/showcase batches a pair of Daily invocations can hand off without losing edition identity or starving the current edition.
- [x] If a change is required, implement resumable bounded multi-package handoff compatible with the existing trusted GitHub publication lane; keep per-packet limits and make unprocessed work explicit and recoverable.
- [x] Keep old tracking state minimal and distinguish provider tokens, cache reuse, character estimates, actual token usage, and actual monetary cost. Never label a soft budget as a hard cap.
- [x] Add regression coverage for partial handoff, retry, concurrent revision, backlog priority, and no starvation before changing the maintenance status.

### 3. Showcase / release-calendar / naming evidence

- [ ] For Nintendo Direct and a recent State of Play with full official material, create an independent human-style fact checklist from opened official full-event sources before comparing extractor output.
- [ ] Re-run the extractor and reconcile every substantive announcement by game/region/duplicate fact, with a packet entry, brief/merge target, or evidence-backed non-substantive exclusion. Highlights alone cannot close coverage.
- [ ] Validate the existing title-hint flow with real positive adoption, wrong-sequel/identity rejection, same-organization independence rejection, provider failure/cache behavior, and persistence into the next editorial packet. No hard-coded fixture counts as production adoption.
- [ ] Validate the next-15-day calendar flow across PC, PlayStation, Xbox, and Nintendo, including delay/region/port rules and explicit partial-coverage gaps; do not rewrite old archives.
- [ ] Keep missing-provider, 30/120/360-minute retry/expiry semantics and real consumption capability visible. Do not claim full coverage from HTTP success or model output alone.

### 4. Regression and acceptance

- [x] Run affected tests after each functional change and `npm run check` once on the final implementation.
- [x] Produce `docs/OPTIMIZATION_ACCEPTANCE.md` with exact base/head SHAs, changed files, before/after outcomes, commands/results, real source URLs and fetch times, independent announcement checklist path, token/cost sample and measurement definition, failure/backlog recovery evidence, residual risks, and unmet criteria.
- [x] Update existing maintenance entries in `docs/MAINTENANCE_LOG.md`; do not prematurely mark natural-run or cost-dependent items resolved and do not open duplicate root-cause items.
- [x] If UI changes are unavoidable, provide manual 1440/820/390px, two-theme, keyboard/focus/anchor and reduced-motion checks; otherwise keep the UI untouched.
- [x] Send each phase result to the parent task with commit/PR and evidence paths. Final handoff must say `待 Astra 验收` and identify anything that still requires natural production observation.

## Initial evidence gaps

The repository currently documents two active Daily invocations at 10:20 and 11:20, while `docs/AUTOMATION_ARCHITECTURE.md` still contains legacy 10:20/17:10 wording in its packet section. The actual Codex scheduler configuration and GitHub run history are not present in this checkout. These are evidence gaps to reconcile, not assumptions to paper over. The latest maintenance log also states that the title-provider run had 0 accepted names and that showcase completeness, natural no-intervention recovery, and measured cost remain open.

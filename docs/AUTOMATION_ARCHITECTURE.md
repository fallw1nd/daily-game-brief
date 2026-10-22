# Production Automation Architecture

Daily is the active production cadence. GitHub Actions is the durable orchestrator and only trusted publisher; the configured single ChatGPT task is intended to perform bounded editorial decisions from immutable packets.

## Current timeline

| Beijing time | Owner | Action |
| --- | --- | --- |
| 10:10 | GitHub | Close the Daily evidence window and build the final packet. |
| 10:20 | ChatGPT | Primary editorial invocation. |
| 11:00 | GitHub | SLA preflight / packet recovery check. |
| 11:10 | GitHub | Scheduled media recovery. |
| 11:20 | ChatGPT | Second editorial invocation for current/recovery/continuation work. |
| 11:40 | GitHub | Degraded publication fallback deadline. |
| 12:00 | Pages | Planned Daily release gate. |

GitHub cron is a liveness signal, not an identity source. Exact edition/window identity comes from the shared edition-window helpers and durable state.

## Ownership

GitHub owns deterministic work: source collection, scoring, evidence extraction, fixed windows, state transitions, issue/entry identity, schema validation, English/media availability, atomic publication, deployment, retries, and incidents.

ChatGPT owns editorial judgment inside a finalized packet: include/exclude/review decisions, concise Chinese copy, `sharedFactFrame`, English presentation when safe, fact/time/tracking choices, and uncertainty wording. It never calculates issue numbers or digests, writes Canonical data directly, edits `automation/state`, or declares deployment success.

## Packet and evidence flow

1. `config/news-sources.json` defines curated discovery sources.
2. `scripts/collect-news.mjs` creates normalized A/B/C candidates for the fixed Daily window.
3. `scripts/build-evidence.mjs` opens only shortlisted pages and produces bounded evidence packages. Readiness describes evidence composition, not publication eligibility. Article metadata/visible time is preferred; a trusted RSS/feed timestamp may be retained when the article template omits time.
4. `scripts/editorialize.mjs` builds packet v3 / editorial input v2 after cutoff. Provider-facing input is capped at 120,000 characters per packet. Title hints and the release-calendar discovery stay fact-bounded. The full deduplicated calendar work set is retained in SHA-pinned pages under automation/batches, outside the inline 24,000-character preview. Every new Daily decision records a reviewed/deferred receipt for each page and platform; fallback explicitly defers all calendar research.
5. The packet and its Git blob SHA are acknowledged on `automation/state`. Mutable latest pointers are convenience views only.

## Durable state

Each edition has `automation/status/<edition-id>.json` with independent lanes for packet, editorial, publication, deployment, English, and media.

These durable files, plus existing authorized batch/queue files, live on Git branch `automation/state`. Fetch them with GitHub ref `automation/state`; the branch name is not part of the file path. Contracts, focused documentation, and Canonical data are read from `main`. A missing file or `404` on one ref is not evidence about another ref. Resolve packet contents only by the exact Git blob SHA acknowledged in state; mutable latest pointers are convenience views, not substitutes.

- packet: `pending → ready | failed`
- editorial: `pending → submitted → valid | invalid`, or GitHub-owned `timed_out`
- publication: `pending → committed | failed`
- deployment: `pending → deployed | failed`
- English/media: independent `pending | available | partial | unavailable`

`invalid` may be repaired only against the same immutable packet. `submitted`, `valid`, and `timed_out` are not model-editable states.

The persistent 45-day event ledger keeps discovery and editorial fields separate. Active tracking items return to editorial input until explicitly continued or closed.

## Liveness, recovery, and fallback

If the active task finds the immediate next Daily missing a ready packet after cutoff, it may write the exact `packet_missing_at_handoff` wake file. The wake only asks GitHub to build/acknowledge the packet; it is not recovery state. The cloud editor waits on the exact durable status for at most ten minutes and consumes the acknowledged packet in that same invocation, then observes its own publication receipt with a separate ten-minute bound. A timeout is pending work, never a successful delivery. This removes dependence on the next editorial slot but does not guarantee external scheduler punctuality.

The SLA watchdog restores the acknowledged packet first. If it is missing/stale/invalid, GitHub rebuilds collection → ledger → evidence → packet and acknowledges the replacement before further action. At the degraded deadline, fallback publication admits only conservative A-level facts supported by an opened primary source or two independent opened reliable sources. It never invents translations, rumors, or analysis.

## Continuations and revisions

A published edition may receive queue-authorized same-edition continuations without changing its issue/window.

- `editorial_continuation`: bounded news packet with exact event-key scope and `preservePublished:true`.
- `editorial_continuation` with `batchScope:"calendar"`: an empty-news packet scoped to the exact calendar page blob SHAs in its queue entry. Preserves published news/tracking/title/issue/window; applies only calendar patches and review receipts. Unfinished calendar work stays queued ahead of English repair, using the existing task slots and recovery sweep.
- `showcase_completion`: bounded showcase/fact supplement; see `docs/SHOWCASE_RECOVERY.md`.
- user-authorized same-edition revision: explicit wake/revision authorization tied to the existing edition and packet rules.

An initial trusted bundle may contain the Daily packet plus one next-news continuation. GitHub re-resolves all packet/event identities before serial publication. Later continuations use the single inbox. Partial/replayed publication is idempotent and does not reopen already committed facts.

An explicit manual revision may take over an open news/calendar continuation only with a ready, SHA-bound packet while editorial remains pending with no submission and publication remains pending with no commit. The trusted recorder verifies the exact active queue/batch scope and pinned packet, then atomically returns that batch to `pending` and opens the manual revision with the original `previousMainSha`. Batch bytes, page identities, review receipts and retry history are retained; normal queue advancement resumes the unfinished work after manual publication. Pending packet collection, consumed, failed, or publishing work is not replaced.

Same-edition revision overlays preserve previously published entries, stable matching entry IDs, existing verified media, tracking, and the current release-calendar baseline unless an explicit supported change removes/updates them. Manual overlays, including latest-edition repairs (identified from trusted revision state and committed digest receipts) and insertions do not feed compact editorial decisions back into the current global event ledger, including no-op and digest-matching replays; English replay remains independent. First publication and ordinary latest/older continuation feedback retain their ordinary behavior, including no-include news batches. Manual repair authorization does not supply a separate fresh global tracking verdict: even explicitly included cosmetic targets do not implicitly reopen or close tracking or replace ledger history. Targeted queue advancement is independent of feedback eligibility.

The existing publisher feedback transaction contains a fixed, idempotent repair for the 2026-10-22 historical-overlay incident. It resolves the two audited feedback commits and their exact parents from Git, verifies ancestry of the current state, and restores only 26 named unintended event changes when each current event still exactly matches its bad snapshot. The two intentional headline edits and legitimate October continuations are excluded. Concurrently changed records are preserved, and subsequent runs are no-ops. This is not a general ledger override interface; no extra request or publication is needed to run it on the next successful publication.

## Canonical, English, media, and deployment

Simplified Chinese Canonical lives in `public/data/archive/`, `latest.json`, and `manifest.json`. English is a fact-bound Overlay under `public/data/locales/en/`; it can degrade independently without blocking valid Chinese Canonical. Media is likewise nonblocking and may be enriched later with verified assets.

The publisher validates the submission against the acknowledged packet, rebuilds from current `main` on concurrent advances, runs `npm run check`, commits atomically, and dispatches exact-edition Pages/media work. Pages holds a staged Daily until `plannedAt`.

Pages deployments share one non-cancelling concurrency group. Every successful deployment, including a main push or a dispatch without an edition, reconciles receipts from its own immutable manifest/archive files. It acknowledges the requested/latest edition and outstanding represented committed editions, never synthesizing missing durable state. A real success transition must cover the publication commit; a publication replay's mutable deployment SHA is not proof of deployment. Publication ancestry and existing newer-deployment protection prevent acknowledging content not in that release. Selection and recording use one fresh `automation/state` transaction on each bounded retry. Failed runs acknowledge only an explicitly requested represented edition, never all archives.

## Compatibility

Historical AM/PM archives and manual `am|pm|daily` workflow inputs remain supported for explicit historical recovery/revision. They are not the current production cadence. The one-time first-Daily bridge window is encoded in shared window helpers and remains immutable historical compatibility, not an operational rule.

## Operations

Primary commands:

```bash
npm run news:collect:daily
npm run news:evidence
npm run news:packet
npm run brief:validate-submission
npm run brief:publish-decision
npm run brief:sla:daily
npm run validate:data
npm run validate:locales
npm run check
```

Historical AM/PM command variants remain for recovery tooling only.

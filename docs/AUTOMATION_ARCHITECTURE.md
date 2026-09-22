# Production Automation Architecture

Daily is the active production cadence. GitHub Actions is the durable orchestrator and only trusted publisher; the single enabled ChatGPT task performs bounded editorial decisions from immutable packets.

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
4. `scripts/editorialize.mjs` builds packet v3 / editorial input v2 after cutoff. Provider-facing input is capped at 120,000 characters per packet. Title hints and the release-calendar discovery stay fact-bounded.
5. The packet and its Git blob SHA are acknowledged on `automation/state`. Mutable latest pointers are convenience views only.

## Durable state

Each edition has `automation/status/<edition-id>.json` with independent lanes for packet, editorial, publication, deployment, English, and media.

- packet: `pending → ready | failed`
- editorial: `pending → submitted → valid | invalid`, or GitHub-owned `timed_out`
- publication: `pending → committed | failed`
- deployment: `pending → deployed | failed`
- English/media: independent `pending | available | partial | unavailable`

`invalid` may be repaired only against the same immutable packet. `submitted`, `valid`, and `timed_out` are not model-editable states.

The persistent 45-day event ledger keeps discovery and editorial fields separate. Active tracking items return to editorial input until explicitly continued or closed.

## Liveness, recovery, and fallback

If the active task finds the immediate next Daily missing a ready packet after cutoff, it may write the exact `packet_missing_at_handoff` wake file. The wake only asks GitHub to build/acknowledge the packet; it is not recovery state.

The SLA watchdog restores the acknowledged packet first. If it is missing/stale/invalid, GitHub rebuilds collection → ledger → evidence → packet and acknowledges the replacement before further action. At the degraded deadline, fallback publication admits only conservative A-level facts supported by an opened primary source or two independent opened reliable sources. It never invents translations, rumors, or analysis.

## Continuations and revisions

A published edition may receive queue-authorized same-edition continuations without changing its issue/window.

- `editorial_continuation`: bounded news packet with exact event-key scope and `preservePublished:true`.
- `showcase_completion`: bounded showcase/fact supplement; see `docs/SHOWCASE_RECOVERY.md`.
- user-authorized same-edition revision: explicit wake/revision authorization tied to the existing edition and packet rules.

An initial trusted bundle may contain the Daily packet plus one next-news continuation. GitHub re-resolves all packet/event identities before serial publication. Later continuations use the single inbox. Partial/replayed publication is idempotent and does not reopen already committed facts.

Same-edition revision overlays preserve previously published entries, stable matching entry IDs, existing verified media, tracking, and the current release-calendar baseline unless an explicit supported change removes/updates them.

## Canonical, English, media, and deployment

Simplified Chinese Canonical lives in `public/data/archive/`, `latest.json`, and `manifest.json`. English is a fact-bound Overlay under `public/data/locales/en/`; it can degrade independently without blocking valid Chinese Canonical. Media is likewise nonblocking and may be enriched later with verified assets.

The publisher validates the submission against the acknowledged packet, rebuilds from current `main` on concurrent advances, runs `npm run check`, commits atomically, and dispatches exact-edition Pages/media work. Pages holds a staged Daily until `plannedAt`.

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

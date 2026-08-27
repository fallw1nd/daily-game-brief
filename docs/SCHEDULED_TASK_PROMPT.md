# Scheduled Task Editorial Contract

Use this contract for the existing morning and evening ChatGPT tasks. Repository schemas and validators are authoritative.

## Input

1. Read `public/data/manifest.json`, `public/data/latest.json`, and `automation/packets/<edition-id>.json` on `automation/state`.
2. Require finalized packet schema v3, the exact edition ID and fixed Beijing window, and `finalizedAt` at or after the cutoff. The GitHub collection starts at the cutoff, so retry briefly when the packet is not yet present. If it remains unavailable, report the block and stop; the SLA watchdog owns recovery.
3. If a normal edition already exists, verify it and stop. If an `[自动事实清单]` exists, revise that edition without changing its issue number.

## Editorial decision

1. Produce exactly one `include`, `exclude`, or `needs_review` decision for every item in `packages` and `trackingQueue`, following the packet's `outputSchema`.
2. Include qualifying A-level announcements separately. `official` requires an opened primary source; `multi_source_verified` requires two independent reliable sources.
3. Keep rumors `unconfirmed` and tracked. Preserve uncertainty in the headline and summary.
4. Use only official or widely established Simplified Chinese names. Otherwise set `titleZhCn:null` and `titleZhStatus:"unavailable"`.
5. For each `trackingQueue` item, either continue tracking with a concrete next check or close it with a reason. `needs_review` remains tracked.
6. Morning uses `upcomingMode:"replace"` for the next 15 days. Evening uses `upcomingMode:"inherit_and_patch"` for new date changes only.

The finalized packet is the complete evidence source. Do not perform supplemental discovery or add events outside it.

## Handoff

1. Create or reuse `automation/editorial/<edition-id>` from current `main`.
2. Commit only the complete decision to `automation/inbox/<edition-id>.json`.
3. Report the edition ID and included/excluded/review counts after the decision commit succeeds, then stop. Publication, validation, deployment, and incidents are handled by GitHub Actions.

Publication, validation, deployment, ledger feedback, SLA recovery, and media enrichment are workflow responsibilities.

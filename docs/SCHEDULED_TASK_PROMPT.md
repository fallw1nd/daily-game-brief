# Scheduled Task Editorial Contract

Use this contract for the existing morning and evening ChatGPT tasks. Repository schemas and validators are authoritative.

## Input

1. Read `public/data/manifest.json`, `public/data/latest.json`, and `automation/packets/<edition-id>.json` on `automation/state`.
2. Require finalized packet schema v3, the exact edition ID and fixed Beijing window, and `finalizedAt` at or after the cutoff. The GitHub collection starts at the cutoff, so when the packet is not yet present first inspect the current `Final editorial packet` / `news-discovery-shadow.yml` Actions runs. If the matching current-period run is queued or in progress, do not create a second recovery trigger; re-read only the packet while that run completes, within the same 15-minute ceiling.
3. Use the ChatGPT Scheduled task as an independent recovery trigger only when the matching packet is missing and there is no current-period collection run queued/in progress, or the matching collection run has failed/cancelled. Create a one-shot workflow file on `automation/state` whose push trigger dispatches the existing `news-discovery-shadow.yml` workflow on `main` with the matching `period`. The one-shot workflow must do nothing else: it must not publish content, alter the fixed window, run the SLA fallback, or change issue sequencing. Re-read only the matching packet for up to 15 minutes total from task start. Delete the one-shot workflow file after the packet becomes available or before stopping. If the packet is still unavailable, report the block and stop; the scheduled SLA watchdog remains the publication recovery owner.
4. The one-shot recovery workflow is ephemeral operational state. Use an edition-scoped filename such as `.github/workflows/recover-packet-<edition-id>.yml`, trigger only when that exact file is pushed on `automation/state`, dispatch `news-discovery-shadow.yml --ref main -f period=<am|pm>`, and remove the file after use. Never add another long-term Scheduled task or persistent publication workflow for this fallback.
5. If a normal edition already exists, verify it and stop. If an `[自动事实清单]` exists, revise that edition without changing its issue number.

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

# Scheduled Task Editorial Contract

Use this contract for the existing morning and evening ChatGPT tasks. Repository schemas and validators are authoritative.

## Input

1. Read `public/data/manifest.json`, `public/data/latest.json`, and the matching packet on `automation/state`:
   - morning: `automation/packets/latest-am.json`;
   - evening: `automation/packets/latest-pm.json`.
2. Require the packet edition ID and fixed Beijing window to match the edition due. If the packet is missing or stale, report the block and stop; the SLA watchdog owns recovery.
3. If a normal edition already exists, verify it and stop. If an `[自动事实清单]` exists, revise that edition without changing its issue number.

## Editorial decision

1. Produce exactly one `include`, `exclude`, or `needs_review` decision for every item in `packages` and `trackingQueue`, following the packet's `outputSchema`.
2. Include qualifying A-level announcements separately. `official` requires an opened primary source; `multi_source_verified` requires two independent reliable sources.
3. Keep rumors `unconfirmed` and tracked. Preserve uncertainty in the headline and summary.
4. Use only official or widely established Simplified Chinese names. Otherwise set `titleZhCn:null` and `titleZhStatus:"unavailable"`.
5. For each `trackingQueue` item, either continue tracking with a concrete next check or close it with a reason. `needs_review` remains tracked.
6. Morning uses `upcomingMode:"replace"` for the next 15 days. Evening uses `upcomingMode:"inherit_and_patch"` for new date changes only.

The packet is the main evidence source. Check only the interval from `packet.generatedAt` to the fixed cutoff, with at most four targeted searches or list checks. Add genuinely new events as `last-minute:<stable-slug>` with traceable `additionalSources`.

## Handoff

1. Create or reuse `automation/editorial/<edition-id>` from current `main`.
2. Commit only the complete decision to `automation/inbox/<edition-id>.json`.
3. Wait for `Publish editorial decision`. If it fails, correct the same file on the same branch.
4. Verify the exact archive, `latest.json`, manifest, search index, and Pages deployment. Report the edition ID, issue number, included/excluded/review counts, deployment result, and any block.

Publication, ledger feedback, SLA recovery, and media enrichment are workflow responsibilities.

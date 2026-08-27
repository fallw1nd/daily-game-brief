# Scheduled Task Editorial Contract

Use this contract for the existing morning and evening ChatGPT tasks. Repository schemas and validators are authoritative.

## Input

1. Read `public/data/manifest.json`, `public/data/latest.json`, `config/title-translations.json`, and `automation/packets/<edition-id>.json` on `automation/state`.
2. Require a usable finalized packet: schema v3, `mode:"chatgpt-handoff"`, editorial input schema v2, the exact edition ID/period/planned time/fixed Beijing window, `coverageThrough` equal to the fixed cutoff, and `finalizedAt` at or after that cutoff. These checks mirror `scripts/validate-editorial-packet.mjs`. Treat a packet that exists but fails any of these checks exactly like a missing packet; never make editorial decisions from it.
3. The GitHub collection starts at the cutoff. When the matching packet is missing or invalid, first inspect the current `Final editorial packet` / `news-discovery-shadow.yml` Actions runs. If the matching current-period run is queued or in progress, do not create a second recovery trigger; re-read only the matching packet while that run completes, within the same 15-minute ceiling.
4. Use the ChatGPT Scheduled task as an independent recovery trigger only when the matching packet is missing/invalid and there is no current-period collection run queued/in progress, or the matching collection run has failed/cancelled. Create a one-shot workflow file on `automation/state` whose push trigger dispatches the existing `news-discovery-shadow.yml` workflow on `main` with the matching `period`. The one-shot workflow must do nothing else: it must not publish content, alter the fixed window, run the SLA fallback, or change issue sequencing. Re-read only the matching packet for up to 15 minutes total from task start. Delete the one-shot workflow file after a usable packet becomes available or before stopping. If the packet remains unavailable/invalid, report the block and stop; the scheduled SLA watchdog remains the publication recovery owner.
5. The one-shot recovery workflow is ephemeral operational state. Use an edition-scoped filename such as `.github/workflows/recover-packet-<edition-id>.yml`, trigger only when that exact file is pushed on `automation/state`, dispatch `news-discovery-shadow.yml --ref main -f period=<am|pm>`, and remove the file after use. Never add another long-term Scheduled task or persistent publication workflow for this fallback.
6. If a normal edition already exists, verify it and stop. If an `[自动事实清单]` exists, revise that edition without changing its issue number.

## Editorial decision

1. Produce exactly one `include`, `exclude`, or `needs_review` decision for every item in `packages` and `trackingQueue`, following the packet's `outputSchema`.
2. Include qualifying A-level announcements separately. `official` requires an opened primary source; `multi_source_verified` requires two independent reliable sources.
3. Keep rumors `unconfirmed` and tracked. Preserve uncertainty in the headline and summary.
4. Resolve game Chinese names in this strict order:
   - Reuse a matching entry from `config/title-translations.json` when present.
   - Otherwise prefer an official Simplified Chinese title from the publisher/developer/platform/store source.
   - If no official Simplified Chinese title exists, perform a narrow title-only open-web lookup for a stable, widely used Chinese community/media name. Use it with `titleZhStatus:"common_translation"`.
   - If neither an official nor a stable common translation exists, keep the original name with `titleZhCn:null` and `titleZhStatus:"unavailable"`.
   - Never machine-translate, literally translate, or invent a Chinese game name merely to fill the field.
   - Once `titleZhCn` is resolved, use that same Chinese name wherever the game subject appears in `headline` and the lead `archiveTitle`; keep the English original in `titleEn` metadata rather than repeating it as the visible story subject.
5. Title-name lookup is the only exception to the finalized packet's complete-evidence rule. It may be used solely to determine `titleZhCn` / `titleZhStatus`; it must not introduce a new event, fact, time, platform, release claim, source classification, or tracking decision.
6. For each `trackingQueue` item, either continue tracking with a concrete next check or close it with a reason. `needs_review` remains tracked.
7. Morning uses `upcomingMode:"replace"` for the next 15 days. Evening uses `upcomingMode:"inherit_and_patch"` for new date changes only.

The finalized packet is the complete evidence source for event content. Do not perform supplemental event discovery or add events outside it; only the narrow title-name lookup described above is allowed.

## Handoff

1. Create or reuse `automation/editorial/<edition-id>` from current `main`.
2. Commit only the complete decision to `automation/inbox/<edition-id>.json`.
3. Report the edition ID and included/excluded/review counts after the decision commit succeeds, then stop. Publication, validation, deployment, and incidents are handled by GitHub Actions.

The trusted publisher validates the committed decision against the exact finalized packet. If a validated publication run fails, the workflow queues at most one `workflow_dispatch` retry for the same committed decision. Each publication attempt may rebuild from the latest `main` up to three times when another writer advances `main`; this retry must never create a new issue number or alter the fixed edition window.

Publication, validation, deployment, ledger feedback, SLA recovery, and media enrichment are workflow responsibilities.

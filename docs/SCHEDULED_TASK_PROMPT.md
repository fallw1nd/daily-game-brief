# Scheduled Task Prompt — Zero-cost Editorial Handoff

Use this contract for both existing ChatGPT tasks. Keep their current schedules and enabled state; do not create duplicates. The repository's `AGENTS.md`, schema, and validators remain authoritative. No paid model API or `OPENAI_API_KEY` may be introduced.

## Shared execution contract

1. Work on `fallw1nd/daily-game-brief` `main`. Read only `public/data/manifest.json`, `public/data/latest.json`, and the matching prebuilt packet from `automation/state` first:
   - morning: `automation/packets/latest-am.json`;
   - evening: `automation/packets/latest-pm.json`.
2. Confirm `editorialInput.window.id`, fixed `windowStart`, `windowEnd`, and `plannedAt` match the edition due in `Asia/Shanghai`. Never move a window because execution started late.
3. If the edition already exists and is not an `[自动事实清单]` degraded edition, verify it and stop idempotently. If it is degraded, revise the same archive and manifest item; keep the issue number and set `revised:true`.
4. The packet is the main evidence source. Do not repeat broad discovery or reopen every page. For each packet event output exactly one `include`, `exclude`, or `needs_review` decision matching the packet's `outputSchema`.

## Editorial rules

- Include every qualifying A-level announcement separately. Never hide official new titles, dates/delays, launches, major updates/DLC, material company decisions, or major results inside a generic roundup.
- `official` requires a selected opened primary source. Without one, use two independent reliable sources and the correct non-official status. Rumors remain `unconfirmed`, use `tracking:true`, and preserve uncertainty in headline and summary.
- Do not machine-translate names. Without an official or widely established Simplified Chinese name, use `titleZhCn:null` and `titleZhStatus:"unavailable"`.
- Select only evidence-backed source indexes. Explain exclusions and evidence limits compactly.
- Morning: fully rebuild the next 15 days using official/store dates and `upcomingMode:"replace"`. Evening: inherit the morning table and only apply newly announced date changes, delays, or cancellations.

## Last-minute delta check

The packet is generated about 15 minutes before cutoff. Search only the interval from `packet.generatedAt` to the fixed cutoff, using at most four targeted queries/list checks. Prefer official feeds and the strongest broad-media headline lists. Open only pages for genuinely new candidates.

- Add a new event only as `last-minute:<stable-slug>` with traceable `additionalSources`.
- If nothing material appeared, record that result and stop searching.
- Do not repeat the packet's full discovery pass.

## Deterministic publication

1. Save the structured result as `artifacts/editorial-decisions.json` alongside `artifacts/editorial-packet.json`.
2. Run `npm run brief:publish-decision`, then `npm run validate:data` and `npm run check`.
3. Re-read `main` before writing. Publish the archive, byte-identical `latest.json`, manifest, and generated search index in one fast-forward commit. Never renumber or rewrite unrelated archives.
4. News text must not wait for images. Leave verified missing media as `unavailable`; the existing 10:35/17:25 media workflow will attempt official news art, exact official-video thumbnails, and official store/title art asynchronously.
5. Verify the commit workflow, Pages deployment, live archive/latest/manifest/search index, and report unavailable reasons. If a transient failure occurs, retry the failed deterministic step; do not restart discovery.

The 10:45/17:35 SLA watchdog may publish a conservative no-AI fact list if this task has not completed. A later normal run must revise that same edition rather than create another issue.

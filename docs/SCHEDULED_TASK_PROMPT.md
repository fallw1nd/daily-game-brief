# Scheduled Task Editorial Contract

Use this contract for the existing morning and evening ChatGPT tasks. Repository schemas and validators are authoritative.

Operational timing is deliberately separated from the evidence cutoff. The morning ChatGPT task starts at **10:20 Asia/Shanghai** and the evening ChatGPT task starts at **17:10 Asia/Shanghai**. These are editorial handoff start times only. Canonical `plannedAt`, edition identity, and fixed evidence cutoffs remain **10:10 for AM** and **17:00 for PM**; the ten-minute buffer must never widen either evidence window or admit post-cutoff information. `Final editorial packet` remains scheduled at the fixed 10:10/17:00 cutoffs, while the SLA watchdog runs at 11:00/17:50. Scheduled media recovery runs later at 11:10/18:00; normal publisher-triggered media enrichment remains immediate.

## Target edition resolution

Never derive the edition date from the task's actual execution calendar date alone. For the task's AM or PM period, inspect `automation/status/` on `automation/state` and select the oldest already-due edition whose `editorial.status` is `pending` and whose `publication.status` is not `committed`. Do not skip an older pending edition in favor of today's edition. The durable state file's edition ID and packet acknowledgement are authoritative. The target's `plannedAt`, `windowStart`, `windowEnd`, and `coverageThrough` remain fixed and never follow delayed runtime. If no acknowledged pending edition exists, report that there is no editorial work and stop.

## Input

1. Read only `automation/status/<edition-id>.json` on `automation/state` for the selected edition. Require schema v1, `packet.status:"ready"`, a 40-character `packet.blobSha`, and `editorial.status:"pending"`. Copy that exact `packet.blobSha` into the submitted decision as top-level `packetBlobSha`.
2. Read the packet by the acknowledged Git blob SHA, not through `automation/packets/latest-am.json`, `latest-pm.json`, a mutable branch path, an artifact list, or a recently observed Actions run. Require packet schema v3, `mode:"chatgpt-handoff"`, editorial input schema v2, the exact edition ID/period/planned time/fixed Beijing window, `coverageThrough` equal to the fixed cutoff, and `finalizedAt` at or after that cutoff. Never make editorial decisions from a missing, mismatched, or invalid packet.
3. If the state or exact blob is unavailable or invalid, report the edition and machine state, then stop the current run. Do not inspect or poll Actions, create or delete workflow files, dispatch recovery, edit `automation/state`, publish degraded content, or advance to another edition. GitHub Actions is the sole packet and publication recovery owner.
4. After a usable packet is available, read current `main` `AGENTS.md`, `docs/SCHEDULED_TASK_PROMPT.md`, `public/data/manifest.json`, `public/data/latest.json`, and `config/title-translations.json`; then use the already-validated exact packet as the complete editorial input. If the live contract has materially changed from the task prompt, the live repository contract wins.
5. If a normal Canonical edition already exists, verify it and stop. If an `[自动事实清单]` exists, revise that exact edition without changing its issue number.
6. A single-edition failure, missing packet, recovery timeout, validation failure, or publication failure must never disable, pause, reschedule, rename, or otherwise modify either of the two long-lived ChatGPT Scheduled tasks. Stop only the current run and report the blocker. Persistent task state may change only through an explicit user request or an explicit maintenance operation after the underlying problem is addressed.

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
   - For games with an official mainland-China Simplified Chinese channel or site, visible version subtitles, characters/agents, classes/professions, named modes/mechanics, and other proper in-game terms must use the official mainland Simplified Chinese wording when available. If packet wording comes from a foreign-language or overseas source, perform only a narrow terminology-only lookup against an official mainland Simplified Chinese source.
   - Once `titleZhCn` is resolved, use that same Chinese name wherever the game subject appears in `headline` and the lead `archiveTitle`; keep the English original in `titleEn` metadata rather than repeating it as the visible story subject.
5. Title-name lookup and mainland-Chinese terminology lookup are the only exceptions to the finalized packet's complete-evidence rule. Title lookup may determine only `titleZhCn` / `titleZhStatus`; terminology-only lookup may normalize only official mainland Simplified Chinese wording for an already-present event. Neither lookup may introduce a new event, fact, time, platform, release claim, source classification, tracking decision, or candidate.
6. For each `trackingQueue` item, either continue tracking with a concrete next check or close it with a reason. `needs_review` remains tracked.
7. Morning uses `upcomingMode:"replace"` for the next 15 days. Evening uses `upcomingMode:"inherit_and_patch"` for new date changes only.

The finalized packet is the complete evidence source for event content. Do not perform supplemental event discovery or add events outside it; only the narrow title-name lookup described above is allowed.

## Bilingual handoff — active

1. New normal submissions must use `contractVersion:2` and every `include` decision must contain a complete `sharedFactFrame`. The frame is the language-neutral fact boundary shared by Simplified Chinese and English: subject title key, dates, times, numbers, platforms, people/entities, versions and proper terms. It must not contain presentation-only wording or facts that exist in only one language version.
2. Produce `locales.en` whenever a complete English presentation can be written from the same selected evidence and `sharedFactFrame`. English copy is an independent editorial rendering, not a sentence-by-sentence translation of Chinese. Prefer official English terminology from opened English primary evidence when available; otherwise render the same verified facts naturally in English without enlarging the fact boundary.
3. `locales.en.entries` follows included decision order and binds by `eventKey`; `locales.en.upcoming` follows submitted upcoming order and binds by `upcomingId`. Morning English archive titles start with `Morning Brief |`; evening titles start with `Evening Brief |`. Required English copy must not use Chinese body text as fallback.
4. Do not calculate or invent final `entryId`, `factsDigest`, `canonicalCopyDigest`, or `localeDigest`. The trusted publisher binds final Canonical IDs and computes all digests after the Canonical edition is built.
5. English is non-blocking. If a complete valid `locales.en` draft cannot be produced within the verified fact boundary, omit `locales.en` rather than weakening, changing, or suppressing the Canonical Chinese editorial decision. The trusted publisher must still publish the Canonical edition and record English as machine-readable `unavailable`; a later `locale-repair` may repair English without changing Canonical archive/latest/manifest bytes.
6. English-only validation problems are presentation failures, not fact-verification failures. `sharedFactFrame`, source selection, time/window rules, issue sequencing, tracking and all Canonical fields remain hard gates.

## Handoff

1. Create or reuse `automation/editorial/<edition-id>` from current `main`.
2. Commit only the complete decision to `automation/inbox/<edition-id>.json`. It must include `contractVersion:2` and `packetBlobSha` copied exactly from the durable edition state.
3. Report the edition ID and included/excluded/review counts after the decision commit succeeds, then stop. Publication, validation, deployment, and incidents are handled by GitHub Actions.

The trusted publisher validates the committed Canonical decision against the exact finalized packet. English Overlay validation runs after the Canonical decision clears its hard gates. If a validated publication run fails, the workflow queues at most one `workflow_dispatch` retry for the same committed decision. Each publication attempt may rebuild from the latest `main` up to three times when another writer advances `main`; this retry must never create a new issue number or alter the fixed edition window.

Publication, bilingual Overlay validation/degradation, validation, deployment, ledger feedback, SLA recovery, and media enrichment are workflow responsibilities.

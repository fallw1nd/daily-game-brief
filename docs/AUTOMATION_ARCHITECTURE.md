# Programmatic Brief Automation

GitHub Actions prepares bounded evidence and deterministic state. The existing ChatGPT tasks perform the evidence-bounded editorial decision and submit a structured bilingual handoff; trusted code on `main` remains the only production publisher.

## Reliability boundary

Code owns deterministic work:

- fixed Beijing windows and expected edition IDs;
- incremental source-list/RSS discovery;
- URL normalization, candidate deduplication, and adjacent-edition comparison;
- source/time/media/schema validation;
- media download, conversion, and caching;
- Canonical entry identity, issue numbering, digest calculation, English Overlay validation, and explicit locale availability state;
- atomic Git publication, deployment checks, retries, locale repair, and SLA incidents.

The existing ChatGPT scheduled tasks own only evidence-bounded editorial work:

- candidate prioritization after deterministic scoring;
- concise Simplified Chinese headline, summary, verification, and time-note drafting;
- a language-neutral `sharedFactFrame` for every included event;
- natural English presentation copy from the same selected evidence and shared fact boundary when it can be completed safely;
- structured `fact_status`, `time_status`, and `tracking` suggestions;
- careful wording for rumors, disputes, interviews, and legal reports.

The model must never calculate issue numbers, final entry IDs, `factsDigest`, `canonicalCopyDigest`, or `localeDigest`; mutate manifests directly; download media; invent facts for English; or decide that a failed deployment succeeded. English is a presentation layer: an incomplete or invalid English draft must not suppress an otherwise valid Simplified Chinese Canonical edition.

## Components

### Validation and SLA

- `scripts/validate-data.mjs` enforces fixed windows, enums, primary-source requirements, source independence for `multi_source_verified`, tracking for unconfirmed entries, the next-15-day range, detailed audits, and byte-identical latest/archive data.
- `scripts/validate-editorial-packet.mjs` rejects stale or malformed finalized packets before either ChatGPT or the SLA watchdog treats them as usable. It checks packet/input schema versions, mode, exact edition/period/planned time/window, `coverageThrough`, and post-cutoff finalization.
- `scripts/validate-locales.mjs` and the English Overlay validator enforce stable Canonical identities, fact digests, copy digests, locale digests, complete English presentation fields, and explicit unavailable states without making English a Canonical fact gate.
- Media proposals preserve the validated branch and audit artifact when repository settings block PR creation. The workflow creates a visible fallback incident instead of misreporting the failure as an enrichment error.
- `Brief publication SLA watchdog` checks each expected edition after its deadline and opens or updates an incident when the archive or deployed manifest is missing.

### Final-window discovery

`Final editorial packet` starts at the fixed 10:10/17:00 Asia/Shanghai cutoffs and captures the complete edition window. It does not alter archives.

1. `config/news-sources.json` is the curated source registry.
2. `scripts/collect-news.mjs` reads RSS and list pages without opening article bodies.
3. Candidates are normalized, scored, compared with the adjacent edition, and split into A/B/C review levels.
4. `scripts/build-evidence.mjs` records declared/detected source-language metadata together with the bounded evidence text; language metadata guides presentation only and never upgrades factual authority.
5. The artifact records every limited source so coverage failures remain visible.

Artifacts and the persistent state branch measure:

- official A-level items absent from the corresponding edition;
- three-source clusters absent from the edition;
- false-positive A/B candidates;
- source availability and average candidate volume;
- candidates found by the shadow collector but not by the ChatGPT task, and vice versa.

`scripts/audit-news-coverage.mjs` independently compares opened A/B evidence with the expected archive using normalized source URLs, subject keys, and conservative headline overlap. It reports high-confidence and review omissions without mutating an edition.

### Evidence extraction and ledger

`scripts/build-evidence.mjs` opens only shortlisted A/B pages, extracts publication time, traceable media metadata, source-language metadata, and relevant passages, and creates compact evidence packages. Each package is bounded to three source pages and 4,000 evidence characters per source. No model call receives an unbounded page or the complete archive history.

### ChatGPT editorial handoff

`scripts/editorialize.mjs` builds a compact, finalized editorial packet for the existing 10:10/17:00 ChatGPT tasks. Each edition is capped at 120,000 evidence characters (roughly 30,000 reading tokens), carries the active `contractVersion: 2` decision schema, records coverage through the fixed cutoff, and is persisted on `automation/state`. The ChatGPT task may wait briefly for this same-time GitHub job, but it performs no supplemental event discovery.

A matching packet is usable only when it passes the same finalized-packet checks as `scripts/validate-editorial-packet.mjs`. A packet that exists but is stale, pre-cutoff, malformed, or tied to the wrong fixed window is treated as missing for recovery purposes. The ChatGPT task first avoids racing any matching queued/in-progress collection run; otherwise it may use its edition-scoped one-shot recovery trigger to dispatch the existing collector.

For every included decision, `sharedFactFrame` is the language-neutral boundary for subject title key, dates, times, numbers, platforms, people/entities, versions, and proper terms. Simplified Chinese Canonical copy and `locales.en` must stay inside this frame. English is independently edited rather than sentence-by-sentence translated; official English terminology is preferred when opened English evidence provides it. When complete English copy cannot be produced safely, the task omits `locales.en` instead of weakening or changing the Canonical decision.

### Canonical data and English Overlay

The Simplified Chinese edition under `public/data/archive/YYYY/MM/<edition-id>.json`, plus `latest.json` and `manifest.json`, remains the sole fact authority. English is stored separately under `public/data/locales/en/archive/YYYY/MM/<edition-id>.json` as a presentation Overlay that references Canonical identities and contains no independent fact-status, time-status, tracking, source URL, platform, date, issue, or ordering authority.

The trusted publisher binds the editorial `eventKey` handoff to final Canonical `entryId` values after the edition is built. It then computes:

- `factsDigest` from the stable Canonical fact projection;
- `canonicalCopyDigest` from Simplified Chinese presentation copy;
- `localeDigest` from the English Overlay presentation payload.

A stale `factsDigest` makes the English Overlay unavailable. A changed Simplified Chinese copy digest is observable but does not by itself imply factual staleness. `public/data/locales/en/index.json` is generated state describing which Canonical editions have a valid English Overlay and which are explicitly unavailable.

### Idempotent publisher

`scripts/publish-editorial-decision.mjs` validates the structured Canonical decision against the packet, builds the archive, preserves continuous issue numbers, updates latest/manifest/search index, and exits without Canonical mutation when a normal edition already exists. If the SLA fallback published an `[自动事实清单]`, the normal task may revise that same edition and issue number. Media failures degrade to explicit unavailable states; fact-verification failures exclude the story.

The ChatGPT task never needs a repository shell. It writes only `automation/inbox/<edition-id>.json` on `automation/editorial/<edition-id>` and stops after the commit succeeds. `.github/workflows/publish-editorial-decision.yml` runs trusted publisher code from `main`, restores the exact finalized packet from `automation/state`, validates all edition identities and cutoff coverage, performs the complete check, and publishes the result.

Normal publication has three observable locale outcomes:

- **bilingual** — Canonical publication and a valid English Overlay are committed together;
- **Chinese-first degraded** — Canonical publication succeeds while English is recorded as machine-readable unavailable because the English draft is missing or invalid;
- **locale repair** — a later trusted `locale-repair` run may add/replace only English Overlay/availability state. The workflow guards hashes of the Canonical archive, `latest.json`, and `manifest.json` so repair cannot silently mutate factual data.

Publication is concurrency-safe against other `main` writers. If a push is rejected because `main` advanced after the edition was built, the workflow resets to the current `origin/main`, rebuilds the same committed editorial decision, reruns the full repository check, and retries up to three times. This preserves concurrent media changes instead of rebasing a stale generated `latest.json` over them. If a validated publication workflow still fails, the original push-triggered run queues at most one `workflow_dispatch` retry for the same committed decision. The retry path is semantically idempotent: an edition that already reached `main` is detected as `already-exists`, keeps its issue number, and can still re-dispatch Pages/media and finish ledger feedback.

After a changed edition reaches `main`, the publisher dispatches `deploy.yml` and `media-enrichment.yml` with the exact edition ID. A workflow-dispatch retry also re-dispatches these downstream workflows even when the content commit already exists, covering the case where the original run failed after the `main` push but before downstream dispatch. Deployment verification and incidents remain GitHub responsibilities.

After the edition dispatches, the publisher writes every structured decision back to the persistent 45-day ledger on `automation/state`. Discovery fields and editorial fields remain separate so a later collection cannot erase an editorial result. Records distinguish included, excluded, actively tracked, and closed tracking states, keep a bounded decision history, and use edition identity to prevent an older rerun from replacing newer judgment. A formal revision replaces the degraded decision for the same edition.

Active tracking records are mandatory editorial input. When fresh opened evidence exists, the event is prioritized in the normal package list; otherwise a compact `trackingQueue` reminder carries its last decision, reason, source URLs, and dates. The ChatGPT task must explicitly continue or close every reminder. Tracking reminders count against the same 120,000-character budget and fail visibly rather than disappearing when the budget cannot contain them.

The 10:45/17:35 SLA watchdog first restores the matching packet from `automation/state` and validates the complete finalized-packet contract, not only the edition ID. If the packet is missing, stale, malformed, or pre-cutoff while the edition is unhealthy, the watchdog reruns collection, ledger update, evidence extraction, and packet construction in its own Node environment. A recovered packet is preserved back to the state branch on a best-effort basis and remains usable locally even if that persistence races another run.

The watchdog then uses `scripts/build-degraded-decision.mjs` only when an edition is missing. It admits only windowed A-level events with an opened primary source or two independent opened sources, preserves source-language facts, and does not invent translations, rumors, or analysis. Its `main` publication uses the same rebuild-on-current-main retry principle for up to three attempts. If the repository already contains the edition but Pages is still unhealthy, the watchdog re-dispatches Pages rather than treating the absence of a new data diff as sufficient recovery. If collection fails or no event meets the threshold, it opens an incident instead of fabricating an edition.

### Observation and refinement

Keep the existing 10:10/17:00 ChatGPT tasks enabled as the normal editorial handoff. Before exposing a public English route, observe real bilingual AM/PM production outputs and confirm that the Canonical edition remains correct when English succeeds, degrades, or is later repaired. Review omission audits, source health, degraded fallbacks, locale outcomes, and media outcomes before widening the public surface.

## Operational states

Every due edition must end in one observable state:

`collecting → verifying → drafted → committed → deployed`

with the locale state independently observable as `available` or `unavailable`.

`degraded` — publishable Canonical facts completed; optional media, English presentation, or a noncritical source failed.

`failed` — archive missing, Canonical source contract invalid, commit rejected, or deployment not visible; an incident is opened and the fixed window is retained for recovery.

Silent disappearance is never a valid state.

## Commands

```bash
npm run news:collect:am
npm run news:collect:pm
npm run news:ledger
npm run news:ledger-feedback
npm run news:evidence
npm run news:packet
node scripts/validate-editorial-packet.mjs --edition=YYYY-MM-DD-am --period=am
npm run brief:publish-decision
npm run brief:validate-submission
npm run brief:degraded-decision
npm run brief:sla:am
npm run brief:sla:pm
npm run validate:data
npm run validate:locales
npm run check
```

The discovery and SLA scripts use only Node.js built-ins. They can run before `npm ci` when diagnosing a dependency outage.

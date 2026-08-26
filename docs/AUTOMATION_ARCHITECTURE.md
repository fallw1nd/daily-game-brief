# Programmatic Brief Automation

This document defines the migration from an all-in-one ChatGPT scheduled run to a deterministic zero-extra-API-cost pipeline. GitHub Actions prepares bounded evidence and deterministic state; the user's existing ChatGPT tasks perform only the final editorial handoff. No paid model API is called by the repository.

## Reliability boundary

Code owns deterministic work:

- fixed Beijing windows and expected edition IDs;
- incremental source-list/RSS discovery;
- URL normalization, candidate deduplication, and adjacent-edition comparison;
- source/time/media/schema validation;
- media download, conversion, and caching;
- atomic Git publication, deployment checks, retries, and SLA incidents.

The existing ChatGPT scheduled tasks own only evidence-bounded work:

- candidate prioritization after deterministic scoring;
- concise Chinese headline and summary drafting;
- structured `fact_status`, `time_status`, and `tracking` suggestions;
- careful wording for rumors, disputes, interviews, and legal reports.

The model must never calculate issue numbers, mutate manifests directly, download media, or decide that a failed deployment succeeded.

## Current migration stages

### Stage 0 — hardening (active)

- `scripts/validate-data.mjs` enforces fixed windows, enums, primary-source requirements, source independence for `multi_source_verified`, tracking for unconfirmed entries, the next-15-day range, detailed audits, and byte-identical latest/archive data.
- Media proposals preserve the validated branch and audit artifact when repository settings block PR creation. The workflow creates a visible fallback incident instead of misreporting the failure as an enrichment error.
- `Brief publication SLA watchdog` checks each expected edition after its deadline and opens or updates an incident when the archive or deployed manifest is missing.

### Stage 1 — pre-cutoff discovery (active)

`Shadow news discovery` runs at 09:55/16:45 Asia/Shanghai, before the fixed 10:10/17:00 editorial tasks. It does not alter archives.

1. `config/news-sources.json` is the curated source registry.
2. `scripts/collect-news.mjs` reads RSS and list pages without opening article bodies.
3. Candidates are normalized, scored, compared with the adjacent edition, and split into A/B/C review levels.
4. The artifact records every limited source so coverage failures remain visible.

Artifacts and the persistent state branch measure:

- official A-level items absent from the corresponding edition;
- three-source clusters absent from the edition;
- false-positive A/B candidates;
- source availability and average candidate volume;
- candidates found by the shadow collector but not by the ChatGPT task, and vice versa.

`scripts/audit-news-coverage.mjs` independently compares opened A/B evidence with the expected archive using normalized source URLs, subject keys, and conservative headline overlap. It reports high-confidence and review omissions without mutating an edition.

### Stage 2 — evidence extraction and ledger (active)

`scripts/build-evidence.mjs` opens only shortlisted A/B pages, extracts publication time, traceable media metadata, and relevant passages, and creates compact evidence packages. Each package is bounded to three source pages and 4,000 evidence characters per source. No model call receives an unbounded page or the complete archive history.

### Stage 3 — ChatGPT editorial handoff (active, no paid API)

`scripts/editorialize.mjs` builds a compact editorial packet for the existing 10:10/17:00 ChatGPT tasks. Each edition is capped at 120,000 evidence characters (roughly 30,000 reading tokens), carries the strict decision schema, and is persisted on `automation/state`. No repository secret, model API, or additional API billing is used.

### Stage 4 — idempotent publisher (active)

`scripts/publish-editorial-decision.mjs` validates the structured decision against the packet, builds the archive, preserves continuous issue numbers, updates latest/manifest/search index, and exits without mutation when a normal edition already exists. If the SLA fallback published an `[自动事实清单]`, the normal task may revise that same edition and issue number. Media failures degrade to explicit unavailable states; fact-verification failures exclude the story.

The ChatGPT task never needs a repository shell. It writes only `automation/inbox/<edition-id>.json` on `automation/editorial/<edition-id>`. `.github/workflows/publish-editorial-decision.yml` runs trusted publisher code from `main`, restores the exact packet from `automation/state`, validates all three edition identities, performs the complete check, pushes data atomically, and explicitly dispatches Pages because commits created with the workflow token do not recursively trigger other workflows.

The 10:45/17:35 SLA watchdog uses `scripts/build-degraded-decision.mjs` only when an edition is missing. It admits only windowed A-level events with an opened primary source or two independent opened sources, preserves source-language facts, and does not invent translations, rumors, or analysis. If no event meets the threshold, it opens an incident instead of fabricating an edition.

### Stage 5 — observation and refinement

Keep the 10:10/17:00 ChatGPT tasks enabled as the normal publisher. Review omission audits, source health, degraded fallbacks, and media outcomes for seven consecutive days, then tune the deterministic source registry and thresholds without expanding the prompt.

## Operational states

Every due edition must end in one observable state:

`collecting → verifying → drafted → committed → deployed`

or:

`degraded` — publishable facts completed; optional media or a noncritical source failed.

`failed` — archive missing, source contract invalid, commit rejected, or deployment not visible; an incident is opened and the fixed window is retained for recovery.

Silent disappearance is never a valid state.

## Commands

```bash
npm run news:collect:am
npm run news:collect:pm
npm run news:ledger
npm run news:evidence
npm run news:packet
npm run brief:publish-decision
npm run brief:validate-submission
npm run brief:degraded-decision
npm run brief:sla:am
npm run brief:sla:pm
npm run validate:data
npm run check
```

The discovery and SLA scripts use only Node.js built-ins. They can run before `npm ci` when diagnosing a dependency outage.

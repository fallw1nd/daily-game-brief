# Programmatic Brief Automation

This document defines the migration from an all-in-one ChatGPT scheduled run to a deterministic pipeline with a narrow editorial model step. The existing morning and evening tasks remain enabled until the shadow pipeline passes seven consecutive days of coverage review.

## Reliability boundary

Code owns deterministic work:

- fixed Beijing windows and expected edition IDs;
- incremental source-list/RSS discovery;
- URL normalization, candidate deduplication, and adjacent-edition comparison;
- source/time/media/schema validation;
- media download, conversion, and caching;
- atomic Git publication, deployment checks, retries, and SLA incidents.

An editorial model may later own only evidence-bounded work:

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

### Stage 1 — shadow discovery (active)

`Shadow news discovery` runs after each fixed cutoff and produces artifacts only. It does not alter archives.

1. `config/news-sources.json` is the curated source registry.
2. `scripts/collect-news.mjs` reads RSS and list pages without opening article bodies.
3. Candidates are normalized, scored, compared with the adjacent edition, and split into A/B/C review levels.
4. The artifact records every limited source so coverage failures remain visible.

Use seven days of artifacts to measure:

- official A-level items absent from the corresponding edition;
- three-source clusters absent from the edition;
- false-positive A/B candidates;
- source availability and average candidate volume;
- candidates found by the shadow collector but not by the ChatGPT task, and vice versa.

### Stage 2 — evidence extraction (active in shadow mode)

`scripts/build-evidence.mjs` opens only shortlisted A/B pages, extracts publication time, traceable media metadata, and relevant passages, and creates compact evidence packages. Each package is bounded to three source pages and 4,000 evidence characters per source. No model call receives an unbounded page or the complete archive history.

### Stage 3 — structured editorial API (dry-run contract active; live call requires a secret)

`scripts/editorialize.mjs` now builds a dry-run Responses API request with strict JSON Schema output and post-response evidence checks. Each edition is capped at 120,000 evidence characters (roughly 30,000 input tokens before prompt overhead). The default model is `gpt-5-mini`, configurable with `OPENAI_EDITOR_MODEL`. Live shadow calls remain disabled until repository variable `ENABLE_EDITORIAL_SHADOW=true` and secret `OPENAI_API_KEY` are both configured.

### Stage 4 — idempotent publisher (planned)

Generate a draft on an automation branch, validate it, and fast-forward `main` only when the expected edition is still absent and HEAD has not changed. Publication must be idempotent by edition ID. Media failures degrade to explicit unavailable states; fact-verification failures exclude the story.

### Stage 5 — cutover

After seven consecutive shadow days without unexplained A-level omissions:

1. enable programmatic publication for one period;
2. keep the corresponding ChatGPT task as a watchdog for three more days;
3. compare output and deployment health;
4. move both ChatGPT tasks to concise exception-reporting prompts only after both periods pass.

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
npm run brief:sla:am
npm run brief:sla:pm
npm run validate:data
npm run check
```

The discovery and SLA scripts use only Node.js built-ins. They can run before `npm ci` when diagnosing a dependency outage.

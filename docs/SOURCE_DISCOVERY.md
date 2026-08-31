# Source Discovery and Promotion

The Daily discovery system separates **where an item is discovered** from **what evidence may establish a published fact**.

## Source modes

- `active`: may contribute candidates to the production review queue and evidence packet.
- `shadow`: fetched and measured on the production runner, but excluded from the production review queue, event ledger, evidence packet, editorial packet, and Canonical publication.

A source is promoted from `shadow` to `active` only after real GitHub-runner observations show acceptable availability, parser stability, candidate yield, duplicate/noise rate, and editorial usefulness. Static CI proves contract safety but never counts as source activation evidence.

## Reliability roles

- `primary`: official platform, company, event, or award source. It can establish official facts only after the exact page has been opened successfully.
- `high`: established editorial media. It can support facts as secondary evidence.
- `discovery`: useful for finding stories but cannot by itself establish a verified fact.

A well-known brand is not automatically `high`: mixed editorial/community platforms remain `discovery` until the pipeline can distinguish editorial content from user submissions reliably.

## Content lanes

Lanes describe editorial value, not factual confidence. Current lanes include `news`, `releases`, `industry`, `interviews`, `reviews`, `features`, `rumors`, and `awards`.

Lane selection uses headline semantics plus source capabilities and a source-specific default. A broad source is not assigned wholesale to one lane just because it can publish that kind of content.

Substantive interviews, investigations, technical analysis, industry analysis, reviews, and award material may be admitted based on the publication time of that content itself. The underlying background event does not have to occur in the same Daily window. The content must add concrete information; ordinary opinion, recommendation copy, promotion, and repackaged old news remain excluded.

## Phase 1 shadow pool

- 4Gamer News Topics
- 4Gamer Interviews
- 4Gamer Reviews
- VGC News
- GAME Watch
- 電ファミニコゲーマー News
- 電ファミニコゲーマー Interviews
- Game Developer
- PC Gamer

Where a publisher exposes a stable first-party RSS/Atom feed with publication timestamps, the shadow registry prefers that feed over broad HTML navigation scraping. VGC News, 電ファミ News/Interviews, Game Developer, and PC Gamer therefore use feed endpoints while remaining shadow-only. Separate feeds from the same publisher retain the same `independenceKey` / `publisherFamily`, so splitting discovery lanes never creates false corroboration.

## Phase 2 shadow pool

Chinese deep-content discovery:

- 机核资讯 — discovery only while editorial and user-submitted items share the same article system.
- 机核文章 — discovery only; intended for industry, interviews, features, and cultural analysis.
- UCG 业界论道 — high-reliability media candidate source for industry, interviews, and features.
- UCG 游戏评测 — high-reliability media candidate source for reviews and features.

Official award discovery:

- The Game Awards News
- BAFTA Games Awards Press Room
- D.I.C.E. Awards / Academy of Interactive Arts & Sciences

These award sources are registered as `official` + `primary`, but remain `shadow` until the production runner confirms stable discovery and usable publication timestamps.

## Shadow contribution metrics

Shadow promotion is based on contribution, not raw article volume. A shadow candidate earns same-window contribution credit only when its listing evidence already supplies a publication time that falls inside the exact edition window. The collector records how many such window-qualified events overlap an active-source event, how many remain unique to the shadow pool, and a per-source overlap rate. Candidates whose listing time is unknown are tracked separately as timestamp/parser health signals and never inflate same-window unique contribution.

The durable source-health ledger keeps recent averages of window-qualified, unique, overlapping, and unknown-time candidates so a high-volume duplicate feed does not look more useful than a smaller source that consistently finds otherwise-missed stories, and a source with weak timestamp extraction does not appear productive merely because it exposes a large archive.

Cross-source overlap uses a known canonical title key plus event kind when available; otherwise it falls back to the existing event key. These metrics are observational and do not merge shadow candidates into the active event ledger or publication path. Production review remains broader: an active candidate with an unknown listing time can still be investigated and have its time established later from opened evidence. Promotion reviews must consider contribution metrics together with parser health and editorial sampling; no single threshold automatically promotes a source.

## Read-only observation lane

`.github/workflows/source-shadow-observation.yml` is the safe maintenance path for collecting real GitHub-hosted runner samples without replaying a production packet. It runs the same registered-source collector with `contents: read`, writes only runner-local artifacts, uploads the observation report, and never persists `automation/state`, finalizes a packet, dispatches SLA recovery, edits Canonical data, or publishes Pages.

When a shadow listing exposes candidate URLs but no publication time, the observer may run a bounded detail-page timestamp probe. It opens at most two registered candidate URLs per shadow source and at most 30 pages in total, accepts only HTTPS URLs that still match the source registry, and extracts standard article publication metadata such as `article:published_time`, `datePublished`, or `<time datetime>`. Probe output is written to the observation artifact only. It does not modify the candidate list, establish production evidence, upgrade `fact_status`, or grant same-window contribution credit.

A manual observation is useful for parser health, accessibility, candidate yield, active-vs-shadow overlap, and determining whether listing-time gaps can be repaired safely from article metadata. It is not itself a production edition and cannot automatically promote a source. Promotion still requires editorial sampling and, where timing behavior matters, normal Daily collector evidence across appropriate windows.

## Primary-source resolution

Opened secondary/discovery pages are scanned only for explicit links to registered official domains. Those links are recorded as resolver candidates. Discovery of a link does **not** mean the primary page has been opened and does not upgrade `fact_status`.

Evidence packages also record publisher identity and any explicitly observed primary-source identities. This provenance is observation-only for now: `multi_source_verified` continues to use the existing opened-source independence rules until enough real data exists to safely distinguish publisher independence from shared-origin dependence.

## Promotion checklist

Before changing a source from `shadow` to `active`, inspect at least:

1. GitHub-hosted runner success rate and consecutive failures.
2. Parser stability and publication-time extraction.
3. Candidate yield and percentage of candidates actually inside the Daily window.
4. Duplicate rate against existing active sources.
5. Unique high-value stories that would otherwise have been missed.
6. Noise, promotional content, community submissions, and stale listing entries.
7. Whether the source should establish evidence (`high`/`primary`) or remain discovery-only.
8. Whether source-specific filters are needed before activation.

Do not promote sources merely to increase source count. The first activation review should use at least one real Daily collector result from the production runner, and preferably several consecutive runs before changing high-volume or mixed-content sources.

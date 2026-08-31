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

## First selectively promoted cohort

After six read-only GitHub-hosted runner observations through run `33398534759`, the first bounded cohort is promoted for a formal same-edition production acceptance run:

- 4Gamer News Topics — stable first-party RSS with publication timestamps; the existing source-specific filter continues to remove recurring low-value columns before review.
- 4Gamer Interviews — stable dedicated RSS for interview/feature discovery.
- 4Gamer Reviews — stable dedicated RSS for review discovery.
- VGC News — stable first-party News RSS with publication timestamps and a clean news/industry/rumor discovery role.
- Game Developer — stable RSS with publication timestamps for industry, development, interview, feature, and technical material.

Promotion means these sources may now enter the production review/evidence pipeline; it does **not** make their stories automatically publishable or official. Every included story still requires opened evidence and the normal editorial admission rules. All three 4Gamer lanes retain the same `independenceKey` / `publisherFamily`, so separate feeds never create false corroboration.

The first formal acceptance rerun deliberately keeps noisier or technically incomplete sources in shadow rather than increasing source count for its own sake.

## Remaining Phase 1 shadow pool

- GAME Watch — listing discovery works, but publication time still needs a safe listing adapter or opened-detail fallback before activation.
- 電ファミニコゲーマー News — News RSS is stable, but promotional/general-entertainment mix still needs more production sampling.
- 電ファミニコゲーマー Interviews — the previously configured `/category/interview/feed` did not represent the intended interview archive. Discovery now uses the real `/category/interview` HTML archive and only `/interview/...` article URLs; it remains shadow until this corrected adapter is observed on the runner.
- PC Gamer — RSS and publication times are stable, but the volume and mixed hardware/opinion/news profile still require conservative sampling.

Where a publisher exposes a stable first-party RSS/Atom feed with publication timestamps, the registry prefers that feed over broad HTML navigation scraping. VGC News, Game Developer, PC Gamer, and 電ファミ News therefore use feed endpoints. Separate feeds from the same publisher retain the same `independenceKey` / `publisherFamily`, so splitting discovery lanes never creates false corroboration.

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

These award sources are registered as `official` + `primary`, but remain `shadow` until the production runner confirms stable discovery and usable publication timestamps. Current blockers are client-rendered discovery for TGA and runner access restrictions for BAFTA/D.I.C.E.; their primary reliability classification does not override those discovery failures.

## Shadow contribution metrics

Shadow promotion is based on contribution, not raw article volume. A shadow candidate earns same-window contribution credit only when its listing evidence already supplies a publication time that falls inside the exact edition window. Candidates whose listing time is unknown are tracked separately as timestamp/parser health signals and never inflate same-window contribution.

A candidate is counted as **unique** only when its canonical subject identity and material event kind are stable enough to compare safely. If the system cannot establish that identity, the candidate is reported as `identity-unresolved` rather than being treated as unique merely because no active key matched. This conservative rule was added after a real observation showed a Japanese report of an already-covered cancellation being misclassified as unique.

The durable source-health ledger keeps recent averages of window-qualified, unique, overlapping, identity-unresolved, and unknown-time candidates so a high-volume duplicate feed does not look more useful than a smaller source that consistently finds otherwise-missed stories, and a source with weak identity or timestamp extraction does not appear productive merely because it exposes a large archive.

Cross-source overlap uses a known canonical title key plus event kind when available. Exact stable fallback keys may prove overlap, but an unresolved identity can never prove uniqueness. These metrics are observational and do not merge shadow candidates into the active event ledger or publication path. Production review remains broader: an active candidate with an unknown listing time can still be investigated and have its time established later from opened evidence. Promotion reviews must consider contribution metrics together with parser health and editorial sampling; no single threshold automatically promotes a source.

## Read-only observation lane

`.github/workflows/source-shadow-observation.yml` is the safe maintenance path for collecting real GitHub-hosted runner samples without replaying a production packet. It runs the same registered-source collector with `contents: read`, writes only runner-local artifacts, uploads the observation report, and never persists `automation/state`, finalizes a packet, dispatches SLA recovery, edits Canonical data, or publishes Pages.

When a shadow listing exposes candidate URLs but no publication time, the observer may run a bounded detail-page timestamp probe. It opens at most two registered candidate URLs per shadow source and at most 30 pages in total, accepts only HTTPS URLs that still match the source registry, and extracts standard article publication metadata such as `article:published_time`, `datePublished`, or `<time datetime>`. Probe output is written to the observation artifact only. It does not modify the candidate list, establish production evidence, upgrade `fact_status`, or grant same-window contribution credit.

A manual observation is useful for parser health, accessibility, candidate yield, active-vs-shadow overlap, and determining whether listing-time gaps can be repaired safely from article metadata. It is not itself a production edition and cannot automatically promote a source. The first promoted cohort therefore proceeds to a user-authorized formal production acceptance rerun before its rollout is treated as fully accepted.

## Primary-source resolution

Opened secondary/discovery pages are scanned only for explicit links to registered official domains. Those links are recorded as resolver candidates. Discovery of a link does **not** mean the primary page has been opened and does not upgrade `fact_status`.

Evidence packages also record publisher identity and any explicitly observed primary-source identities. This provenance is observation-only for now: `multi_source_verified` continues to use the existing opened-source independence rules until enough real data exists to safely distinguish publisher independence from shared-origin dependence.

## Promotion checklist

Before changing a source from `shadow` to `active`, inspect at least:

1. GitHub-hosted runner success rate and consecutive failures.
2. Parser stability and publication-time extraction.
3. Candidate yield and percentage of candidates actually inside the Daily window.
4. Duplicate rate against existing active sources.
5. Stable-identity high-value stories that would otherwise have been missed; unresolved identities never count as unique.
6. Noise, promotional content, community submissions, and stale listing entries.
7. Whether the source should establish evidence (`high`/`primary`) or remain discovery-only.
8. Whether source-specific filters are needed before activation.

Do not promote sources merely to increase source count. Prefer small cohorts that can be tested in a real production packet and rolled back independently if their candidate quality is not acceptable.

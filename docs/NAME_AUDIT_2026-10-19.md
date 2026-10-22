# Chinese proper-name review — 2026-10-19

Status: scoped changes applied and validated on the local review branch. Nothing has been published. The evidence inventory distinguishes source-backed decisions, assistant translations, intentional identifiers and unresolved identity exceptions.

## Authorized boundary

The user requested a comprehensive naming pass before deciding whether to launch the Catchup feature. Work is isolated on `review/chinese-names-20261019`, based on main `33b5e856f6aa0a9becbb0f8cfe63cdce783ff83e`. No main push, merge, deployment, scheduler, or new automated translator is authorized by this review. The existing Catchup preview is preserved separately.

Scope: all 70 Chinese archives, their latest mirror and manifest titles, historical calendar items, and named secondary entities in displayed prose. The initial structured inventory contains 767 stories, 1,644 historical calendar occurrences, 878 title keys and 846 normalized research candidates. Research grouping is not a change to topic identity.

## Resolution policy

1. Open official Chinese naming evidence, preferring mainland Simplified Chinese.
2. If unavailable, seek established mainland media/community usage.
3. Under the user's explicit request for this audit, use an assistant translation only after those searches are inconclusive. Mark it `provisional_translation`, visibly include the original name and `暂译`, and never label it official or established usage.
4. Preserve deliberately primary official brands when supported by Chinese-context evidence; a Latin spelling alone or an obscure name is not enough to skip fallback research.
5. If identity cannot safely be resolved, retain the original and list the identity issue separately. Failure to find current web evidence never proves the historical subject did not exist.

Source logos, source labels, URLs, timestamps and factual assertions are not naming lookup targets. Technical terms and source-URL fragments are transparently excluded from the proper-name denominator. Names in prose and generated image descriptions are in scope. Named DLC, installments, companies, people and places are distinguished rather than merged merely because their words overlap.

## Revision method

Research records contain the source URL, actual query, name tier, decision and occurrences, including unchanged source-backed decisions. The resulting local patch is a list of exact JSON paths and before/after strings, not a repository-wide string replacement. Each operation is tied to naming evidence, fails on stale input, and is restricted to Chinese presentation fields. Original `title_key`, `title_en` / `title_ja`, entry IDs, event keys, issue numbers, windows, dates, platforms, source URLs and shared fact digests remain unchanged.

The minimal additive `provisional_translation` status is necessary because the existing validator forbids a nonempty Chinese name with `unavailable`; `common_translation` would falsely imply established usage. Existing title-label maps display “助手暂译（非官方）”. No facts projection or identifier version changes, and no automatic fallback workflow is added.

English prose remains unchanged. Only `canonicalCopyDigest` and the consequently derived `localeDigest` may be refreshed to bind existing English overlays to the reviewed Chinese presentation. `factsDigest` must stay identical. Latest and manifest mirrors are regenerated only from the exact same revised archive editions.

## Review findings

- Official names were missing despite existing Chinese store/publisher evidence.
- Several prior registry links lead to unrelated or insufficient evidence; old `official` claims are not accepted merely because they were registered.
- Repeated localization created duplicated Chinese suffixes for BALL x PIT, B.L.U.E. NOVA and Crescent Tower. Corrections are scoped to their known occurrences.
- Some historical topic keys describe a different subject from the article, such as `ever17` carrying the company Crash Keys. These are listed for a separate identity migration plan, not silently merged or rewritten here.

## Verification

Contract-only checkpoint: `npm run check` passed with 105 test files and 591 tests, canonical/locales validation and production build. This checkpoint predates data edits; a new complete check and invariant report are required after the final reviewed patch.

Final local verification: `npm run check` passed (105 test files, 591 tests), all 70 archives and English locale infrastructure validated, production build passed. A separate invariant check confirms that original keys, English/Japanese source names, shared facts, issue numbers, dates, windows and source URLs are unchanged. English prose is byte-equivalent after excluding the two digest metadata fields. Latest is identical to the latest canonical archive.

## Final review scope and exceptions

- 878 structured keys, 855 scoped research decisions, all with recorded searches. These are research groups, not a semantic key migration.
- 241 official Simplified Chinese, 13 other official Chinese, 181 mainland/common, 379 explicitly provisional and 41 intentionally original-brand decisions. 236 keys required no structured naming change; unchanged decisions are retained in the evidence ledger, not discarded from coverage.
- 5,629 exact-path archive edits across all 70 archives. 61 existing English overlays update only canonical/locale digest metadata. Registry proposal covers 835 eligible keys; original-brand and identity exceptions are not mechanically rewritten.
- Manual review covers every final changed prose/edition-name pair, including captions and calendar notes. Intermediate malformed substitutions were corrected before archive application. Two archive titles keep a shorter “暂译” label to meet the existing 40-character limit; the complete original names remain in the linked article and structured title.
- Secondary extraction starts with 1,510 prose rows plus 961 caption/edition rows. These overlap and are not 2,471 unique identities. The accompanying review evidence report provides occurrence-deduplicated coverage and separates opened evidence from search-result-only evidence.
- Cyberleek remains a researched, identity-uncertain public handle, retained exactly without inferring a person/company or real-world identity. Pendra/Pendola source-spelling ambiguity remains unchanged. The `ever17` key actually describes Crash Keys; a separate key migration is proposed, not applied. Pre-existing factual discrepancies (including KICK gameplay context and a cooking-description mismatch) are noted without unrelated factual rewrites.
- Source labels/URLs, ordinary technical words, extraction fragments and explicitly retained identifiers are not falsely counted as verified Chinese translations. Current web absence is not treated as historical nonexistence.

## Important implementation updates

The additive provisional status is backward-compatible and has validation/display tests. This review adds no automated translator, publication workflow, job or schedule. The audit patch uses explicit source-field/occurrence spans, protects longer names and preserved originals, and checks parentheses, duplicate substitutions and factual digests. Full source evidence and exact edit provenance are provided in the standalone audit package; raw search cache and internal coordination are excluded from that user deliverable.

The local Catchup preview must be refreshed separately from this branch. At the review checkpoint, publication required a later user decision. On 2026-10-19 the user authorized production launch, with naming revisions first and Catchup separately afterward.

## Authorized production release

On 2026-10-19 the user approved publishing the completed naming audit before the previously previewed Catchup feature. The release is a name-only same-edition revision on refreshed `main`; no Catchup implementation, workflow, schedule, window, ID or factual change is included. The reviewed base remains `33b5e856f6aa0a9becbb0f8cfe63cdce783ff83e`, confirmed against the remote immediately before release preparation. Final checks and exact GitHub Pages receipts are recorded after publication.

The final evidence reconciliation resolves the 22 outstanding naming-proof records without changing the reviewed translation patch. Across 1,008 source-attributed decisions, 733 have opened-page evidence or an explicit opening record, 251 have search-result-only evidence, 14 have Steam API evidence, 9 have saved HTML evidence, and 1 is an identity-based composite. Six complete display strings remain qualified as component/composite evidence; Cyberleek remains an unresolved public-handle identity. These categories do not imply every name is official Chinese.

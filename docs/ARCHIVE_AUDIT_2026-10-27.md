# Archive audit and corrections — 2026-10-27

## Scope and baseline

Initial main: `6b0eb041e4a2c5230adb3bbf22d6221eddbd12af`. All 78 editions (58 Daily, 10 AM, 10 PM), August 21–October 27: 886 stories and 2,127 calendar rows.

Checked schema/index/latest identity, fixed windows, positive stable issue IDs, English coverage and ordering, duplicate IDs/headlines/calendar identities, source/status consistency, rumor tracking, registered naming status, media metadata and 2,725 local media references. A systematic regional/time/service-change text scan selected 58 candidates for manual review. Nine distinct flagged original source pages were reopened across the focused reviews. This is not independent external re-verification of all 886 stories or every historical store value/image.

Baseline structural checks passed. English: 77/78 valid; only October 24 unavailable. Story media: 844 verified, 42 explicit unavailable; calendar covers: 2,019 verified, 108 explicit unavailable. No missing local referenced media files. All 11 unconfirmed stories retain tracking. No empty story source lists; no official story lacks a primary-kind source; no multi-source story has fewer than two source hosts (host count alone does not prove independence).

## Confirmed repairs

| Edition / record | Error and evidence | Bounded action |
| --- | --- | --- |
| October 24 English | Calendar grew 41→43 but no-English continuation path retained 41 English rows. | Complete bound 43-row locale draft; translated two custom regions; reconciler now tracks Canonical calendar identities/order. Unsupported labels still fail closed. |
| August 26 PM / industry-1 | [Original AVA notice](https://ava.pmang.jp/new_notices/11527) thanks players for 6,541 days, announces October 28 closure. Chinese said closure was 6,541 days in the future; Global conflicted with existing Japan-service headline. | Clarify elapsed service history, retain announced closure/update/new-game facts, region Japan; synchronize English. |
| September 22 / news-3 | [Selected AUTOMATON report](https://automaton-media.com/articles/newsjp/20260922-469245/) and existing summary specify Japan time 02:00; headline omitted timezone. | Add 日本时间 only; English already correct. Refresh exact generated alt. |
| September 24 / news-7 | [Selected report](https://automaton-media.com/articles/newsjp/scp-idle-20260924-469569/) and acknowledged packet distinguish announced October 29 / October 30 Japan, without an hour proving Beijing date. | Remove unsupported Beijing-date claim; retain both supported dates; English already correct. Refresh exact generated alt. |
| October 16 / news-6 | [Selected report](https://automaton-media.com/articles/newsjp/20261015-473733/) concerns Japanese Nintendo Store CERO classification; original secondary decision omitted region and publisher invented Global. | Region Japan, English Japan; preserve rating facts, speculation attribution and original shared fact frame. |
| October 18 / news-3 | [Selected report](https://news.denfaminicogamer.jp/news/261017h) explicitly concerns Japanese store CERO Z; original editorial decision incorrectly supplied Global. | Region Japan and matching English; no headline/lead/story rewrite. |
| October 19 / news-1 | [Selected 4Gamer report](https://www.4gamer.net/games/867/G086701/20261018005/) describes the reported event; existing summary explicitly declines to infer synchronized other-region rollout, conflicting with Global metadata. | Source-stated scope, not an unsupported Japan-only inference; matching English. |

All content corrections preserve original issue number, edition/window, entry IDs, title identity, selected sources, time/status/platforms, tracking, calendar and shared fact-frame digests. No new events or source authority upgrades. The explicit Secondary adapter exists because legacy AM/PM lack acknowledged packets and continuation guards intentionally preserve published stories; it does not fabricate recovery state or weaken automatic continuation safety.

## Verification and publication

October 24 locale inbox commit `c180b3e9f85727570d6e33fccde58d959aba410d`; trusted publisher [40462007994](https://github.com/fallw1nd/daily-game-brief/actions/runs/40462007994) succeeded, remote main `0ac359094200900e16692e44f29a74cd6c3cb442`, Pages [40462151594](https://github.com/fallw1nd/daily-game-brief/actions/runs/40462151594) succeeded. Live English index reports available; live overlay equals remote data (20 stories, 43 calendar rows). Issue #247 automatically closed. Canonical archive/latest/manifest unchanged by locale repair.

Final code check passed: 126 test files / 973 tests, typecheck, all 78 data/locale validations and production build. Local resource contention caused earlier fixture timeouts; the complete final run used two Vitest workers and passed without changing test timeouts. Final publication and six historical correction/deployment receipts will be appended after execution. No pending workflow is described as complete.

## Resolved false positives

- Eight historical outside-window timestamps are explicitly supplement-marked; preserved.
- September 25 boundary-minute story has exact evidence at 10:10:54, legitimately after the exclusive 10:10 boundary.
- ISO timestamps must be parsed, not compared lexically to space-delimited window strings.
- Identical August 22 AM release headlines identify different games in title cards, not duplicate stories.
- Calendar rows sharing a title key may describe different platforms/regions/SKUs (including Warrior Cats editions); no unsupported coalescing.
- Repeated game subjects often report different interviews/releases/reviews; no exact duplicate facts found.

## Remaining uncertainty and legacy presentation debt

- RTA in Japan's Tokyo venue does not prove Japan-only scope because the selected report also allows online participation. Kept unchanged.
- Ace Combat 8 foreign review scores tagged Japan and Infection Girl shutdown tagged Global warrant scope caution; reopened sources do not justify replacing them with an invented worldwide/Japan-only claim. No speculative change.
- Some earliest AM/PM headlines omit the subject, while title cards identify it. A heuristic flags 54 early records, including aliases and entity names; this is legacy presentation debt, not 54 proven factual errors. No gratuitous bulk rewrite.
- Historical original-pass `sourceReport.note` remains original-pass provenance; later calendar review receipts describe subsequent work. It should not be interpreted as the current calendar row count. No historical evidence notes deleted merely because a later page became available.
- Unavailable/provisional names were not invented or promoted. Media availability/provenance fields and files were audited, not every asset independently visually reverified. External pages may change after their historical snapshot.
- Existing warning: August 26 PM discoveryQueries exceeds the later cap of 14; a historical count is not rewritten to hide it.

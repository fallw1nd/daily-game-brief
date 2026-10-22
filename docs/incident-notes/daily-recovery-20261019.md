# October 16–19 Daily recovery

## Cause and evidence

All four editorial invocations submitted the documented minimal wake containing `schemaVersion`, `editionId`, and `reason`. Both inline validators in `news-discovery-shadow.yml` additionally required `period: "daily"`. The October 19 failed [collect job](https://github.com/fallw1nd/daily-game-brief/actions/runs/39189372836) reports `invalid Daily wake payload` before any collection step. The original October 16 wake has the same three-field structure.

The scheduled packet workflows eventually started around 14:52–15:10 Beijing time on October 16–18, after the editorial slots. October 16/17 consequently published only the automatic fallback (two/four entries), without English. October 18's [SLA run](https://github.com/fallw1nd/daily-game-brief/actions/runs/39110963550) correctly refused fallback with `No high-confidence A-level event is eligible for degraded publication`; this did not mean there were no normally editable, trustworthy media reports. October 19 had no acknowledged packet before this repair.

## Repair

- Commit `fc3a07de` accepts omitted `period` on the exact validated Daily branch/edition and still rejects an explicitly conflicting period. No evidence gate or schedule changed.
- A regression executes both actual inline validators against the observed minimal wake, explicit Daily, and conflicting PM. Full check passed 105 files / 589 tests, data/locales and production build.
- Correcting the October 19 payload successfully produced acknowledged packet `ef9559096713860744cf971d9a3d59d9d3fa145f` in [run 39191685503](https://github.com/fallw1nd/daily-game-brief/actions/runs/39191685503) at 10:49 Beijing time. This is live evidence that the collection/recovery route works.
- Published October 16/17 revisions use their original pinned packets. October 18 uses the existing explicitly authorized `recover_failed_publication` dispatch, not a revision-opened event: revision-opened correctly requires an already committed edition. No manual edits to Canonical or `automation/state` were used.
- During recovery, multiple pending packet requests displaced each other under GitHub's one-pending-run concurrency rule. Resume them serially; a cancelled pre-start request is not evidence of state change or delivery.

## Trusted publication receipts

| Daily | Issue | News | Packet blob | Publisher |
| --- | --- | --- | --- | --- |
| October 16 | 67 | 7 | `07fc49cb741c442245b3b3a98748c2f6c522d7c3` | [39192972621](https://github.com/fallw1nd/daily-game-brief/actions/runs/39192972621) |
| October 17 | 68 | 5 | `ceae38fb2ee680100abb393e8455dffbaee01960` | [39192698790](https://github.com/fallw1nd/daily-game-brief/actions/runs/39192698790) |
| October 18 | 69 | 9 | `b199a47e9e79ee53f653faa45b54aa3a43e09a11` | [39192854928](https://github.com/fallw1nd/daily-game-brief/actions/runs/39192854928) |
| October 19 | 70 | 4 | `ef9559096713860744cf971d9a3d59d9d3fa145f` | [39193072398](https://github.com/fallw1nd/daily-game-brief/actions/runs/39193072398) |

All four trusted publishers passed their submission validation, full project check and exact-fact audit. English overlays have matching 7/5/9/4 entries. Existing entries/media were retained through revision overlays, with raw fallback copy replaced by bounded Chinese copy. Windows remain `(previous day 10:10, current day 10:10]`; issue identities were preserved, and latest is October 19.

The October 19 Love and Deepspace candidate has conflicting source metadata (October 10 versus the packet's window flag) and remains under review. It was not admitted by ignoring the conflict. The Planet Zoo research report retains its unreviewed-preprint and correlation limitations. Title-only lookup for Stella Sora uses its [official mainland site](https://stellasora.yostar.cn/) and adds no event facts.

## Deployment and remaining work

At 11:10 Beijing time, the latest Pages artifact was waiting at the existing October 19 noon release gate. Repository commits are not an online-success receipt.

New queued calendar/news continuations may reset the mutable editorial/publication lane to pending after a successful publication. Use the immutable publication transitions above, not that pending follow-up lane, to determine delivery. Calendar work deferred by these submissions remains distinct from news recovery; this report does not claim all calendar pages were reviewed. At 11:10 news media was verified for 24 of 25 entries, with the remaining item explicitly unavailable; later media enrichment resolved that item too.

### Final online verification

- [Pages 39194802235](https://github.com/fallw1nd/daily-game-brief/actions/runs/39194802235) successfully released the four Chinese repairs after noon.
- During the wait, the existing October 19 calendar continuation published 57 additional items (16 → 73) in `606b1561`. This correctly preserved news, but invalidated the retained English calendar presentation. Restore English through the existing locale-only inbox: reuse the four retained news translations and provide the exact current 73 upcoming identities and translated region/release labels. No Canonical bytes were modified by this repair.
- [Locale publisher 39197369406](https://github.com/fallw1nd/daily-game-brief/actions/runs/39197369406) succeeded as `962cbe5cf6ad9e9d7d960cfaeb525c911e0529ab`; [final Pages 39197480043](https://github.com/fallw1nd/daily-game-brief/actions/runs/39197480043) succeeded.
- After deployment, HTTP reads of all four Chinese and English archive URLs returned 200 and matched main exactly. News counts are 7/5/9/4; English news counts are identical; calendar counts are 16/16/16/73 with matching English identities. No `[自动事实清单]` headline remains in these editions. Latest is `2026-10-19-daily`, issue 70. All 25 news entries have verified media.

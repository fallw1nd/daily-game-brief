# Calendar interest admission: initial offline comparison

Run `node scripts/replay-calendar-importance.mjs` from the repository root. No network requests are made. The JSON output contains every decision and its reason rather than only successful examples.

The checked-in Daily 18/19/21/30 discovery snapshots predate the new gate. They are grouped with the current identity registry; only earlier-dated substantive news entries from the current archive contribute interest. Later revisions of those archive files cannot be reconstructed, and capped/missing original discovery is not recovered. Thus this is a bounded operational comparison, not a historical recall benchmark.

| Fixture | Original rows | Grouped observed tasks | Admitted: selected + exploration | Official URL opportunities before → after |
| --- | ---: | ---: | ---: | ---: |
| Daily 18 | 82 | 65 | 6 + 4 | 63 → 12 |
| Daily 19 | 100 | 76 | 8 + 4 | 79 → 18 |
| Daily 21 | 100 | 74 | 17 + 4 | 75 → 28 |
| Daily 30 | 75 | 75 | 13 + 4 | 58 → 8 |

Counts are candidate tasks and eligible configured-host URL opportunities, not unique games, actual paid requests, quality percentages, or independently verified launches. Some admitted leads have no eligible official URL and still need normal bounded editorial verification. Existing baseline URLs supplied separately at runtime remain mandatory rechecks. All four platform families have admitted opportunities in these samples, but that does not prove complete coverage.

## Findings and limits

- Ace Combat 8 has an exact, substantive September 15 news story. Its old `platforms:[]` initially hid that signal; the history classifier now accepts the exact quoted game title with game-specific content while continuing to reject company/topic/platform stories. It is selected in all four applicable samples.
- EA SPORTS FC 27 is present in the earlier discovery snapshots but has no earlier substantive news entry before the September 19 article. September 17/18 calendar mentions are not recycled as popularity. It remains candidate-only with an attention flag in Daily 18/19, then is selected by real news history in Daily 21. This is a genuine limitation of available signals, not evidence that the game is unimportant.
- Graveyard Keeper 2 and Well Dweller are not excluded for being independent productions. Their existing baseline checks survive in later snapshots; earlier unreported candidates may remain pending. No claim of complete indie recall follows.
- Ordinary names such as PixelPop 2087, Backrooms: Code Yellow, and other store-only entries cannot qualify simply through naming-registry presence or an official store URL. Some unknown titles still receive bounded rotating exploration.
- Historical GamesRadar rows lack explicit spotlight-section evidence and therefore stay medium. New parser tests establish that an explicit `BIGGEST GAMES OF <month> <year>` row can provide a strong signal, while ordinary month headings, menus, invalid dates and mismatched source URLs cannot. This test is not a claim that a live page was fetched by the replay.
- The candidate pool and attention flags are internal workflow records, not a confidentiality guarantee and not a public complete release calendar. Previously verified public entries are not deleted by this gate.

Initial policy remains configurable. Monitor concrete missed names and available evidence rather than optimizing only for lower counts. An unreported major release can still be missed; verified entries remain available through the full collected-calendar view even when not shown in the default focus view.

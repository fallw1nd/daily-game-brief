# Release calendar offline replay

Replay the two immutable report/packet samples and an optional read-only holdout. No source fetch or discovery run occurs.

```text
node scripts/replay-release-calendar.mjs
node scripts/replay-release-calendar.mjs daily18 daily19 --holdout=../daily21
```

The holdout reads `../daily21/release-calendar-discovery.json` and `../daily21/editorial-packet.json` in place. It does not copy or rewrite those artifacts. `RELEASE_CALENDAR_REPLAY_FIXTURES` can point the first two editions at another local fixture root.

## Round-trip and size comparison

Before reporting proposed packet metrics, replay aggregates the real saved report rows, selects the bounded packet, expands it with `decodeCalendarPacket`, and deep-compares every selected observation against the source observations. The comparison checks all observation fields other than the derived `normalizedTitle`, including null values, `dates` and `platforms` arrays, `announcementUrl`, identity keys and conflicts. A failed comparison stops replay before it reports gains.

Candidates and observations use named fields. Repeated values are shared only through human-readable per-source defaults and an explicit shared URL list; singleton `dates: [date]` and `platforms: [platform]` values are expanded by the decoder. The packet remains within 100 candidates and 24,000 serialized JSON characters. Character counts below include the complete calendar packet, its coverage and metadata, shared defaults, URL list, candidates, review links, and telemetry. Per-task characters divide that complete packet size by its unique task count.

| Edition | Historical packet tasks / chars | Current packet tasks / chars | Tasks gained | Historical / current chars per task | Unique tasks available | Omitted accounting: report + packet cap + byte budget | Final family task counts (PC / PS / Xbox / Nintendo) |
| --- | ---: | ---: | ---: | ---: | --- | ---: | --- |
| 2026-09-18 | 30 / 23,608 | 37 / 23,917 | +7 | 786.93 / 646.41 | 65 | 0 + 0 + 28 = 28 | 26 / 14 / 11 / 18 |
| 2026-09-19 | 24 / 23,600 | 33 / 23,890 | +9 | 983.33 / 723.94 | 76 | 101 + 0 + 43 = 144 | 21 / 14 / 17 / 16 |
| 2026-09-21 holdout | 24 / 23,621 | 33 / 23,943 | +9 | 984.21 / 725.55 | 74 | 36 + 0 + 41 = 77 | 22 / 14 / 17 / 16 |

Family counts include a multi-platform task once in every family it claims. The holdout and fixtures each round-trip every selected task. The earlier 2026-09-19 report-stage omission of 101 and daily21 omission of 36 retain unknown upstream units; this replay does not recover or claim to restore those entries. Daily18/19 fixture provenance records production commits `1b7ff947e94ccda1c0610917919e9cf44f416e3a` and `df6791cfb4d0486329ae38064b9b1ba5b2cc45bf`, respectively.

## Fixture provenance

| Edition | Historical production commit | Run | Artifact | Packet blob | Source archive ZIP SHA-256 |
| --- | --- | ---: | ---: | --- | --- |
| 2026-09-18 | `1b7ff947e94ccda1c0610917919e9cf44f416e3a` | 35298971607 | 10529495407 | `7f967b9693d276aeb1aefa07c2cd376bd602bb1b` | `beaabf607091496bf482e9ad0fe37ec7dc835fad016130fd39c0105aad176c2c` |
| 2026-09-19 | `df6791cfb4d0486329ae38064b9b1ba5b2cc45bf` | 35415477492 | 10575244312 | `eb7cef4eec599f0ae58094d67b8eb84e859d9dca` | `961d813f9eea6495de9f8bb87b38b1d5078fbd8cb34361d4b39197aff2c50139` |
## Omission and evidence limits

The new packet's `omittedCandidates` is the report-stage total plus packet-cap omissions plus byte-budget omissions. `omissionTelemetry.capOmittedTasks` describes upstream report omissions; it is not added a second time. The report's historical omitted-unit labels remain unchanged (`unknown_rows_or_groups` where the saved source did not establish a unit).

`reportedInWindowRows` sums the saved `coverage[].inWindow` values. These are source-internal deduplicated rows, not raw HTML counts. Platform family metrics count each normalized task once per claimed family. The old coverage status field cannot distinguish fetch failures from parser failures; where `sourceStatus` and `parserStatus` are absent, replay labels each phase unknown.

The reports are bounded saved observations, not raw source archives. Replay cannot prove parser recall, global release coverage, or recovery of upstream-capped entries. It also cannot turn a discovery row into verified publication evidence. Calendar items still require opened first-party evidence and explicit checks of identity, date, platform, region, and release type.

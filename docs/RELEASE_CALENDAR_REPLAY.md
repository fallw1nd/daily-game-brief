# Release calendar offline replay baseline

This baseline replays two fixed production observations from the natural Daily wake runs. The checked-in fixture contains only the calendar report fields, the calendar fragment from `editorialInput.upcomingDiscovery`, and provenance; it does not copy the complete news packet. Replay reads these files locally and never fetches sources or reruns discovery.

The audit snapshot used to review the replay is `15bb0100277fd4f9b5e0ef67e56fdba2ed2f81e7`. The historical runs executed different production commits:

| Edition | Historical production commit | Run | Artifact | Packet blob | Source archive ZIP SHA-256 |
| --- | --- | ---: | ---: | --- | --- |
| 2026-09-18 | `1b7ff947e94ccda1c0610917919e9cf44f416e3a` | 35298971607 | 10529495407 | `7f967b9693d276aeb1aefa07c2cd376bd602bb1b` | `beaabf607091496bf482e9ad0fe37ec7dc835fad016130fd39c0105aad176c2c` |
| 2026-09-19 | `df6791cfb4d0486329ae38064b9b1ba5b2cc45bf` | 35415477492 | 10575244312 | `eb7cef4eec599f0ae58094d67b8eb84e859d9dca` | `961d813f9eea6495de9f8bb87b38b1d5078fbd8cb34361d4b39197aff2c50139` |

Run it with:

```text
node scripts/replay-release-calendar.mjs
```

The fixed-input comparison reruns conservative task grouping and the current packet selector without fetching sources. The extra holdout can be replayed read-only from its existing sibling directory:

```text
node scripts/replay-release-calendar.mjs --holdout=../daily21
```

The holdout command reads `release-calendar-discovery.json` and `editorial-packet.json`; it does not copy or rewrite either artifact.

The command prints JSON with `mode: "offline"` and `fetched: false`. A fixture directory can be supplied through `RELEASE_CALENDAR_REPLAY_FIXTURES`, and specific fixture names can be passed as positional arguments.

## Omission accounting

Historical `report.omittedCandidates` and `packet.omittedCandidates` remain available for compatibility. The older artifacts do not prove whether their cap omission counts mean rows or groups, so replay labels those units `unknown_rows_or_groups`; the 101 omitted at the 2026-09-19 cap cannot be recovered. The historical row-budget loss is separately counted as visible report rows minus packet rows (38 and 57). `reconciles` is a numeric compatibility check only; it does not resolve the old omission unit. New runs emit explicit task units in `omissionTelemetry`.

The historical report carries `omittedCandidates: 101` for 2026-09-19 and `36` in the daily21 holdout. Their unit is unknown and the artifacts contain no raw source material from which the omitted entries can be reconstructed, so replay reports `capOmissionRecovery: "unknown"`.

| Natural edition | Visible report rows | Unique tasks | Dedupe reduction | Historical packet rows / names | New packet tasks | Visible tasks left out | New calendar chars / chars per task |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-09-18 | 82 | 65 | 17 (20.7%) | 44 / 30 | 65 | 0 | 20,634 / 252.91 |
| 2026-09-19 | 100 | 76 | 24 (24.0%) | 43 / 24 | 76 | 0 | 23,931 / 266.45 |
| 2026-09-21 holdout | 100 | 74 | 26 (26.0%) | 43 / 24 | 74 | 0 | 23,747 / 267.91 |

The first two rows use immutable replay fixtures; the holdout row reads `../daily21` locally. Every available unique task fit while retaining all source observations. The proposal increases packet tasks by 35, 52, and 50 respectively. The old packet contained 14, 19, and 19 extra same-name rows. The historical omitted counts 101 and 36 retain unknown upstream units and unknown recovery. These results measure available-input packet use, not source/parser recall or global release coverage.

## Coverage and packet observations

`reportedInWindowRows` sums the saved `coverage[].inWindow` values. Those values are source-internal deduplicated report rows, not raw HTML rows: 82 for 2026-09-18 and 253 for 2026-09-19.

Platform labels are retained in `byPlatform`. `byFamily` counts each normalized lead once per family, so multiple labels such as `Nintendo Switch`, `Nintendo Switch 2`, `NS`, and `NS2` do not inflate the Nintendo family count.

| Natural edition | Report family leads (PC / PlayStation / Xbox / Nintendo) | Platform lead counts | Primary rows / leads | Discovery rows / leads |
| --- | --- | --- | ---: | ---: |
| 2026-09-18 | 51 / 14 / 11 / 21 | `PC=20`, `PS5=10`, `XSX=8`, `Nintendo Switch=8`, `Nintendo Switch 2=7`, `NS2=7`, `NS=3` in packet | 30 / 23 | 14 / 14 |
| 2026-09-19 | 38 / 14 / 38 / 21 | `PC=14`, `Xbox=11`, `PS5=9`, `XSX=7`, `Nintendo Switch=6`, `NS2=5`, `Nintendo Switch 2=4`, `NS=2` in packet | 32 / 21 | 11 / 11 |

The new packet family task counts (PC / PlayStation / Xbox / Nintendo) are `51 / 14 / 11 / 21`, `38 / 14 / 38 / 21`, and `38 / 15 / 37 / 22`. A multi-platform task counts once for each family it claims. The output reports separate visible-row, unique-task, dedupe, cap, byte-budget, review-link, and final family task counts.

The historical `coverage.status` field is aggregate metadata and cannot distinguish source transport/fetch failure from parser failure. Because both historical reports lack `sourceStatus` and `parserStatus`, replay reports each phase as `{ known: 0, unknown: 6, failed: null }`. This records that failure was not observed; it does not turn an unknown phase into a successful one.

The full rich report remains the audit artifact. The packet stores compact candidate metadata and every source observation through `candidateDictionary` and `observationDictionary`; `decodeCalendarPacket` restores each observation, including source IDs, URLs, announcement URLs, dates, platform, region, release type, product ID, and conflict fields. Shared strings reduce repeated source metadata without collapsing observations.

## Provenance and limits

Each fixture keeps a `provenance.json` with the historical production commit, audit base, natural wake trigger, run/artifact IDs, packet blob SHA, and SHA-256 of the supplied source archive. The supplied reports and packet fragments are the only calendar inputs. The original raw HTML was not retained, so this replay can reproduce report-level counts and saved metadata but cannot prove parser recall, complete global platform coverage, or recovery of omitted cap entries. It also cannot turn a discovery row into verified publication evidence.

The replay library accepts a replacement `leadKey` function so later lead aggregation experiments can be measured against the same immutable fixture. Replay never rewrites fixture files.

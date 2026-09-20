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

The command prints JSON with `mode: "offline"` and `fetched: false`. A fixture directory can be supplied through `RELEASE_CALENDAR_REPLAY_FIXTURES`, and specific fixture names can be passed as positional arguments.

## Omission accounting

The report's `candidates` are the available report rows. The report cap-before total is derived as `candidates.length + report.omittedCandidates`. The packet's `omittedCandidates` is cumulative, so budget omission is derived as `packet.omittedCandidates - report.omittedCandidates`; the report cap omission is never added a second time. `reconciles` checks that packet rows plus cumulative packet omissions equal the cap-before total.

The 101 groups omitted by the 2026-09-19 report cap are observed report metadata. The historical artifact contains no raw source material from which their recovery can be reconstructed, so replay reports `capOmissionRecovery: "unknown"`.

| Natural edition | Report rows | Cap-before groups | Cap omitted | Packet rows | Budget omitted | Packet normalized-name leads |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 2026-09-18 | 82 | 82 | 0 | 44 | 38 | 30 |
| 2026-09-19 | 100 | 201 | 101 | 43 | 57 | 24 |

## Coverage and packet observations

`reportedInWindowRows` sums the saved `coverage[].inWindow` values. Those values are source-internal deduplicated report rows, not raw HTML rows: 82 for 2026-09-18 and 253 for 2026-09-19.

Platform labels are retained in `byPlatform`. `byFamily` counts each normalized lead once per family, so multiple labels such as `Nintendo Switch`, `Nintendo Switch 2`, `NS`, and `NS2` do not inflate the Nintendo family count.

| Natural edition | Report family leads (PC / PlayStation / Xbox / Nintendo) | Platform lead counts | Primary rows / leads | Discovery rows / leads |
| --- | --- | --- | ---: | ---: |
| 2026-09-18 | 51 / 14 / 11 / 21 | `PC=20`, `PS5=10`, `XSX=8`, `Nintendo Switch=8`, `Nintendo Switch 2=7`, `NS2=7`, `NS=3` in packet | 30 / 23 | 14 / 14 |
| 2026-09-19 | 38 / 14 / 38 / 21 | `PC=14`, `Xbox=11`, `PS5=9`, `XSX=7`, `Nintendo Switch=6`, `NS2=5`, `Nintendo Switch 2=4`, `NS=2` in packet | 32 / 21 | 11 / 11 |

The historical `coverage.status` field is aggregate metadata and cannot distinguish source transport/fetch failure from parser failure. Because both historical reports lack `sourceStatus` and `parserStatus`, replay reports each phase as `{ known: 0, unknown: 6, failed: null }`. This records that failure was not observed; it does not turn an unknown phase into a successful one.

## Provenance and limits

Each fixture keeps a `provenance.json` with the historical production commit, audit base, natural wake trigger, run/artifact IDs, packet blob SHA, and SHA-256 of the supplied source archive. The supplied reports and packet fragments are the only calendar inputs. The original raw HTML was not retained, so this replay can reproduce report-level counts and saved metadata but cannot prove parser recall, complete global platform coverage, or recovery of the 101 omitted cap groups. It also cannot turn a discovery row into verified publication evidence.

The replay library accepts a replacement `leadKey` function so later lead aggregation experiments can be measured against the same immutable fixture. Replay never rewrites fixture files.
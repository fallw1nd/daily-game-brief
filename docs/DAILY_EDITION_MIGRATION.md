# Daily Edition Migration

Status: **precutover compatibility only**. This document does not authorize a production cadence change.

## Contract

Daily editions extend the existing period model rather than replacing historical AM/PM parsing.

- Period: `daily`
- Edition ID: `YYYY-MM-DD-daily`
- Canonical schema: `schemaVersion: 2`
- Timezone: `Asia/Shanghai`
- Fixed window: previous day 17:00 exclusive → edition date 17:00 inclusive
- `plannedAt`: edition date 17:00
- `nextEditionAt`: next day 17:00
- Chinese archive title prefix: `日报｜`
- English archive title prefix: `Daily Brief |`
- `upcomingMode`: `replace`
- Issue number: maximum published manifest issue + 1
- Archive, locale, media and search identities keep the exact Daily edition ID.

The finalized editorial packet remains packet schemaVersion 3 with editorial input schemaVersion 2 and editorial output contractVersion 2. Durable edition state remains schemaVersion 1 and manifest remains schemaVersion 1.

Historical AM/PM editions, paths, issue numbers, titles, windows and URLs are immutable compatibility data.

## Ownership

GitHub continues to own orchestration, durable state, immutable packet storage, validation, publication, SLA recovery, deployment, media, English repair and incidents. ChatGPT remains a bounded editorial worker operating only on an acknowledged immutable packet.

`submitted` and `valid` belong to the GitHub publication lane. `timed_out` belongs to the GitHub SLA lane. The editorial worker may select only the oldest already-due Daily whose packet is ready, publication is not committed, and editorial status is `pending` or `invalid`.

## Precutover State

Precutover code may:

- parse and validate `am | pm | daily`;
- create/test Daily state and packets;
- allow exact manual Daily workflow dispatch;
- render mixed AM/PM/Daily manifests;
- validate Daily locale/media/search paths;
- exercise transition and rollback fixtures.

Precutover code must not:

- replace or remove the existing AM/PM production cron;
- enable a scheduled Daily production run;
- change, disable or create external ChatGPT Scheduled Tasks;
- publish the first real Daily Canonical;
- modify historical `public/data/archive` files;
- hardcode a cutover date.

## Production Cutover — Not Yet Authorized

A formal cutover requires separate explicit user authorization and must start only after the latest successfully published Canonical is a PM edition.

Let that last legacy edition be `D-pm`. The first Daily must be derived from the live manifest/window resolver as `D+1-daily`.

Boundary invariant:

- last PM: `(D 10:10, D 17:00]`
- first Daily: `(D 17:00, D+1 17:00]`
- `lastPM.windowEnd === firstDaily.windowStart`
- 17:00 belongs only to the last PM because Daily start is exclusive
- no gap, no overlap
- first Daily performs adjacent dedupe against the last PM
- no historical archive is rewritten.

### Target production schedule

After authorization only:

- Final packet: 17:00 Asia/Shanghai / `0 9 * * *` UTC
- ChatGPT editorial handoff: 17:10 Asia/Shanghai
- Publication SLA: 17:50 Asia/Shanghai / `50 9 * * *` UTC
- Scheduled media recovery: 18:00 Asia/Shanghai / `0 10 * * *` UTC
- Preserve the event-driven exact-edition SLA dispatch after packet production.

The packet collector should converge on `news-discovery-state-daily` with `cancel-in-progress:false`. Before cutover, review the SLA watchdog concurrency separately: scheduled and event-driven exact-edition runs must not cancel recovery for the same Daily edition.

## External Scheduled Task Cutover

Do not create a third long-lived task.

At formal cutover:

1. Convert the existing PM ChatGPT task to the Daily contract and retain its 17:10 Asia/Shanghai schedule.
2. Disable the existing AM ChatGPT task.
3. Confirm exactly one enabled editorial task remains at 17:10.
4. Keep the disabled AM task available for rollback; do not delete it.

### Exact Daily Scheduled Task prompt

```text
你负责 fallw1nd/daily-game-brief 的唯一 Daily Edition ChatGPT editorial handoff。生产分支是 main，时区固定为 Asia/Shanghai。不要依赖聊天历史；每次运行先读取当前 main 的 AGENTS.md 与 docs/SCHEDULED_TASK_PROMPT.md，以仓库中的实时契约为准。

只处理 period=daily。从 durable edition state 中选择固定 cutoff 已到、packet.status=ready、publication.status!=committed，且 editorial.status 为 pending 或 invalid 的最旧 Daily Edition。不得因为运行时间、当前日期或 latest.json 自行推导或跳过 backlog。

读取 automation/status/<edition-id>.json，从 state.packet.blobSha 获取该期已经确认的 immutable packet，并按该 Git blob SHA 读取 packet。把同一个 SHA 原样写入提交结果顶层 packetBlobSha。packet 必须属于 YYYY-MM-DD-daily，其固定窗口必须是前一日17:00 exclusive 至当日17:00 inclusive，plannedAt 与 cutoff 均为当日17:00。若 identity、period、window 或 packet SHA 不一致，停止，不自行恢复或换包。

packet preflight 通过后，读取当前 main 的 manifest、latest 与该 edition archive。若正常 Canonical 已存在，以 main 为准并停止，不得再次编辑。只有 Canonical 缺失，或同一期仍是允许被正常编辑稿替换的 degraded [自动事实清单] 时才继续。

只依据 immutable packet 中的 evidence、trackingQueue 和允许的窄范围命名查询完成一次 bounded editorial decision。不得发现或加入 packet 之外的新事件。输出 contractVersion:2，完整填写 language-neutral sharedFactFrame。Daily 的 archiveTitle 必须以 日报｜ 开头，upcomingMode 必须为 replace，重新构建未来15天 upcoming。

English 是 optional、nonblocking presentation layer。能够在完全相同事实边界内可靠完成时，English archiveTitle 以 Daily Brief | 开头；否则省略 English，不得削弱或阻塞 Simplified Chinese Canonical。

若 durable state 为 invalid，只能依据该 state 的 validationErrors 和 submissionSha 修复同一期、同一个 immutable packetBlobSha；不得重新发现事件、换 packet 或前进到下一期。submitted、valid 属于 GitHub publication lane；timed_out 属于 GitHub SLA lane，均不得选择或重新编辑。

创建或复用 automation/editorial/<edition-id>，只提交 automation/inbox/<edition-id>.json。提交成功后停止。不得修改 automation/state，不得修改 workflow、cron、生产 archive、manifest 或 latest，不得 dispatch recovery、poll Actions、直接 publish、推进 edition，也不得暂停、重命名、创建、删除或修改任何 ChatGPT Scheduled Task。GitHub Actions 独占 validation、publication、recovery、deployment、media、English repair 与 SLA incidents。
```

The currently active AM/PM `docs/SCHEDULED_TASK_PROMPT.md` remains the production contract until formal cutover. At cutover it must be updated atomically with the external task change; do not make the active production prompt Daily ahead of the schedule transition.

## Packet Capacity

Keep the editorial character budget at 120,000 during migration. Do not double it just because the window becomes 24 hours.

Observability must distinguish:

- discovery candidates;
- review-queue candidates;
- evidence candidates selected under the existing candidate cap;
- candidate-cap omissions, including Tier A/B counts and Tier A event keys;
- packet character-budget omissions, including Tier A/B counts and Tier A event keys;
- active tracking count.

Active tracking must never be silently truncated. If active tracking exceeds the packet budget, fail visibly. Stress fixtures cover 10/20/40/80 candidate/package shapes before production cutover.

## Rollback

Rollback depends on whether Daily has taken ownership of a fixed window.

### No Daily window ownership yet

If no Daily cutoff has been reached/acknowledged and no Daily packet has been consumed, restore the legacy workflow schedule and keep using the original AM/PM tasks.

### Daily window already owned but Canonical incomplete

If the Daily cutoff has passed and the Daily packet/state already owns that fixed window, GitHub-owned recovery must finish that exact Daily edition first. Do not abandon the 24-hour window and split it retroactively.

### Latest successful Canonical is `D-daily`

The first rollback edition must be `D+1-am` with `(D 17:00, D+1 10:10]`, followed by `D+1-pm` with `(D+1 10:10, D+1 17:00]`.

Never publish `D-pm`. A published Daily is never renamed, deleted or split.

## Production Acceptance

`npm run check` is a precutover verification gate, not proof of a completed migration.

The first real Daily acceptance must verify:

- Daily ID/period/schema/window/plannedAt/issue continuity;
- immutable packet blob acknowledgement and publisher commit;
- manifest/latest/archive consistency and Pages deployment;
- PM→Daily adjacent dedupe;
- Daily `upcomingMode=replace`;
- media verified or explicit unavailable;
- English available or explicitly nonblocking unavailable;
- AM task disabled and exactly one Daily editorial task enabled;
- no extra long-lived task.

Do not call the production migration accepted until at least three consecutive real Daily editions complete without manual backfill. Recommended closure is seven consecutive days without manual publication intervention.

## Editorial Discovery Expansion

Cadence migration does not expand editorial subject semantics. `requires_subject_identity` remains fail-closed and non-game subjects must not be disguised as game titles.

Interview/feature/analysis/technical analysis/industry research/data report discovery and a possible `game | company | platform | person | topic` subject taxonomy require a separate data-design decision. A future subject-model change may justify a Canonical schemaVersion 3; Daily cadence alone does not.

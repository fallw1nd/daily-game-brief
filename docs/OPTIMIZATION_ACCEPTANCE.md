# 优化收口验收记录

**状态：功能实现已完成本地验收，待 Astra 验收；未合并、未部署。**

## 基准、提交与范围

- 分支：`codex/optimization-closeout`。
- 本地基准：`82edca62302f0bb0fb179ea10b41e17dde011c07`（checkout 时的 `origin/main`，2026-09-13 Asia/Shanghai）。
- 功能实现 head：`96b28273cf539456a24022417eabe6a2fffe36c0`，提交 `fix(automation): bound same-edition editorial bundles`。
- `git fetch origin main` 曾尝试两次，均因 `Recv failure: Connection was reset` 失败；因此没有把本地 remote-tracking ref 当作远端当前状态，也没有在本分支执行生产推送。
- 功能提交涉及 24 个文件：新增同 edition bundle workflow、bundle schema/解析/执行/反馈事务及三个隔离演练脚本；扩展 state publication identity、queue fairness、workflow contract、scheduled prompt 和 showcase recovery 文档/测试。收口文档另修改本计划、维护日志并新增本文件。
- 未修改 `public/data/**`、UI、固定 cron、实际 Codex Scheduled Task、历史归档或生产分支；没有历史修订、merge、deploy 或 PR 操作。

## 本轮完成的行为

| 项目 | 原路径 | 本轮结果 |
| --- | --- | --- |
| 编辑交接 | 一次只交接一个 packet | 一个 trusted same-edition bundle 最多 2 个 submission；slot 0 为 normal Daily，slot 1 只能是 GitHub 解析出的 news continuation |
| 身份 | 编辑输入可携带请求字段 | prepare 从 `automation/state`、packet Git blob 和 queue 解析 `packetBlobSha`、scope、batch、event keys、state/queue snapshot；不接受编辑自选身份 |
| 发布 | 后续包需要下一次独立恢复 | serial publish；每包重新读取 state；失败停止，未处理包保留 pending；第一包可在重跑时 `already-exists` |
| 队列 | news 优先但可能长期压住 showcase | 首轮偏向 news，消费一个 news 后下一轮保留 showcase；无 showcase 才继续 news；每个 state transaction 仍只激活一个包 |
| 反馈 | main 已提交与 state ledger 可能 split-brain | 每个已发布包写反馈；state feedback 使用 fresh fetch、独立 worktree、最多 3 次 compare-and-retry push；冲突耗尽落为 pending，可用 exact-edition `workflow_dispatch` 恢复 |
| 输入限制 | 没有 bundle 级边界 | 每 packet 序列化输入最多 120,000 字符，每 bundle 最多 240,000 字符；这是输入/安全限制，不是 provider token、缓存或费用测量 |

## 验证命令与结果

### 回归测试

目标测试命令：

```text
npm test -- --run scripts/editorial-bundle.test.mjs scripts/editorial-bundle-workflow.test.mjs scripts/editorial-queue.test.mjs scripts/edition-state.test.mjs scripts/publish-editorial-workflow.test.mjs scripts/scheduled-task-contract.test.mjs
```

结果：6 个测试文件、67 项测试通过。后续补回日历契约措辞后，`scripts/daily-upcoming-contract.test.mjs` 与 `scripts/scheduled-task-contract.test.mjs` 额外 14 项通过。

### 真实代码路径的隔离演练

`node scripts/editorial-bundle-smoke.mjs` 通过，使用临时 bare remote、真实 `prepare-editorial-bundle.mjs`、真实 `run-editorial-bundle.mjs`、真实 publisher 和每个包的 `npm run check`，不是本地绕过反馈事务。结果摘要：

- 正常双包：canonical packet blob `86d5213b4eb4773b0cd0d42d21eeb2c275380371` 为 `built`，news packet blob `fb52d82b2ff4cbe15d72fc5abecd690d716e695a` 为 `revised`；两包均 `feedbackStatus: production-transaction-recorded`。
- 完整同 plan 重跑：两包均 `already-exists`、`changed:false`，反馈仍可安全重放；后来人工写入的 `daily-fact` ledger decision 保持不变。
- 第二包故障/恢复：第一包已发布且反馈已记录；重跑第一包为 `already-exists`，只修复第二包；同 packet 的旧 `valid` submission 被重新提交而非静默复用。
- main 已提交但 state ack 注入故障：partial result 写入 `changed:true`、包 index 和 main SHA，durable state 保持 `editorial:valid`、`publication:pending`；重跑先 reconcile 第一包并返回已存在 main SHA，再发布第二包。此前捕获边界缺口已由 smoke 发现并修复。
- cross-edition editorial request 被 prepare/assert 拒绝；无跨 edition 发布。

`node scripts/editorial-feedback-conflict-smoke.mjs` 的本地 bare-remote 演练通过：3 次推送冲突后 `feedbackPending:true`、6 个并发 actor 文件全部保留；恢复事务状态为 `recorded`，反馈事件、原有 ledger 事件和 6 个并发文件均保留。

`node scripts/optimization-cli-smoke.mjs` 通过：真实隔离 publisher 首次为 `revised`、第二次为 `already-exists`；locale repair 不改变 Canonical archive/latest/manifest；队列先消费 news、下一轮消费 showcase。

### 容量与公平性结论

这是有明确输入假设的本地有限模拟，不是生产吞吐承诺：每日仍只有两次编辑 invocation；每次最多 2 个 package；call 1 预留一个 queue slot，call 2 最多两个 queue slot；每天新增 2 个 news batch；初始 backlog 为 2 个 news + 4 个 showcase。

| 模拟日 | pending news | pending showcase |
| --- | ---: | ---: |
| day 1 | 2 | 3 |
| day 2 | 3 | 1 |
| day 3 | 3 | 0 |
| day 4 | 2 | 0 |

在该有限输入下，news 峰值为 3、day 4 回落到 2，未出现无界增长；4 个 showcase 在 day 3 清空。如果 day 1 的 call 2 被 liveness wake 或 invalid repair 占用，showcase 清空推迟至 day 4，属于最多一日的有限延迟。30/120/360 分钟只决定 retry eligibility，不代表在该分钟完成消费。

### 最终项目检查

2026-09-13 12:45（Asia/Shanghai）最终执行 `npm run check` 通过：

- `tsc -b --pretty false` 通过。
- Vitest：83 个测试文件、410 项测试全部通过。
- data validation：33 个 archived edition 通过；保留既有 warning：`archive/2026/08/2026-08-26-pm.json: historical discoveryQueries exceeded 14`。
- English locale validation：33 个 Canonical edition 通过，build 生成 `33/33` available。
- Vite production build：4594 modules transformed，构建成功。

此前一次检查发现 scheduled prompt 的精确日历契约措辞缺失，已恢复并由 14 项相关测试覆盖。最终 `git diff --check` 仅出现 Git 的 LF/CRLF 提示，没有 whitespace error。

## 外部来源与未完成验收

本轮 bundle 改动没有重新发现或扩展事件事实。已有 source rehearsal 于 `2026-09-12T18:55:16.770Z` / `2026-09-12T18:55:18.445Z` UTC（北京时间 2026-09-13 02:55）生成在 `artifacts/showcase-source-rehearsal/summary.json`，明确标记 `acceptanceComplete:false`：

- Nintendo Direct：官方日文全文 `https://www.nintendo.com/jp/nintendo-direct/description/20260909_ja-JP.html`、美国页 `https://www.nintendo.com/us/nintendo-direct/9-9-2026/`、欧洲页 `https://www.nintendo.com/en-gb/News/Nintendo-Direct/Latest-Nintendo-Direct/Nintendo-Direct-698557.html`；共 137 个片段，只有日文源被标为完整 inventory，27 个 subject 未确认。
- State of Play：官方 PlayStation recap `https://blog.playstation.com/2026/09/03/state-of-play-state-of-play-japan-all-announcements-trailers/`；34 个片段，但 inventory 仍非完整。

因此以下项保持未通过，不因本地 bundle smoke 变绿：

- 没有 live GitHub Actions workflow run、Pages/media deployment 或线上产物验证；workflow 只做静态 contract test。
- 没有真实 scheduled task 的连续两次自然 invocation、11:40 前接管或无人干预后续期次证据；实际 scheduler 配置不可从本 checkout 读取，文档仍记录 10:20/11:20 与旧 10:20/17:10 描述的证据差异。
- 没有 provider token/cache/实际 monetary cost 的本轮样本；120k/240k 是字符安全边界，不能当作费用下降或 token hard cap。已有 provider 记录显示调用可能超过软预算。
- Nintendo Direct 与 State of Play 没有完成独立人类式全量事实 checklist、逐公告对账、视频章节/独立总结回查；source rehearsal 只证明抓取和片段生成。
- title-hint 没有真实正向采用、错误续作/同机构独立性、失败缓存到下一 packet 的生产验收；既有记录仍为 0 accepted names。
- 下一 15 日跨 PC、PlayStation、Xbox、Nintendo 的自然 calendar 验证及 partial-coverage 证据未完成。
- 真实 provider 缺失与 30/120/360 retry/expiry 消费能力尚未在自然运行中证明；本地队列模拟不替代它。

本分支仅交付代码、回归和隔离证据，候选仍需父任务/Astra 验收后才能上线。最终 handoff：**待 Astra 验收**。

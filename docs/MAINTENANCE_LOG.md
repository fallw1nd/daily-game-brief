# Maintenance Issue Log

本文件是项目长期维护的“问题发现 → 处理 → 验证 → 关闭”账本，不是版本发布日志，也不替代 GitHub Issues / Pull Requests。

项目事实仍以当前 `main`、生产数据、Actions 日志和线上结果为准。PR 描述与专题文档负责解释某次修改，本文件负责保留“为什么需要修改、目前是否真正解决”的连续历史。

## 维护规则

- 发现会持续影响生产可靠性、数据质量、编辑质量、成本、可观测性或维护负担的问题时，先新增或更新本文件中的条目。
- 已解决条目不得删除。状态只能继续演进，并补充最终 PR、commit、Actions run、线上验证或其他关闭证据。
- 同一个根因不得因为多次出现而创建多个重复条目；在原条目追加新的复现证据。
- 修复 PR 必须引用对应 `MNT-YYYYMMDD-NN`，并在合并后回写 `resolution` 与 `verification`。
- 只有满足条目中的关闭条件后才能标记 `resolved`；“代码已写”不等于“生产已验证”。
- 若调查证明原判断不成立，状态改为 `wont_fix` 或 `invalid`，并保留原因。
- 日期均按 `Asia/Shanghai` 记录；固定早晚报窗口仍以计划时间而非 runner 实际启动时间为准。

### 状态

- `open`：问题已确认，尚未进入实施。
- `investigating`：现象已确认，但根因或安全修复边界仍需验证。
- `planned`：方案已明确，尚未实施。
- `in_progress`：已有修复分支 / PR。
- `resolved`：修复已合并且满足关闭条件。
- `wont_fix`：确认存在但决定不处理，并保留理由。
- `invalid`：后续证据证明原问题判断不成立。

### 优先级

- `P0`：可能错期、提前/错误发布、污染历史数据或破坏固定窗口，应优先处理。
- `P1`：会造成漏报、明显延迟、重复生产、持续人工返工或主要质量下降。
- `P2`：不会立即破坏生产，但会误导判断、积累技术债或削弱长期质量。
- `P3`：成本、日志、可观测性和无害冗余优化。

---

## Open / planned issues

### MNT-20260828-01 — 延迟 cron 跨日后按 runner 日期错算 edition

- **Discovered:** 2026-08-28
- **Priority:** P0
- **Area:** scheduling / SLA / packet collection
- **Status:** open
- **Evidence:** `Brief publication SLA watchdog` 的 PM cron 配置为 `35 9 * * *`（北京时间 17:35），但 run [33110883167](https://github.com/fallw1nd/daily-game-brief/actions/runs/33110883167) 实际到 2026-08-28 03:56 左右才启动。workflow 仍正确识别 `period=pm`，但 `scripts/check-brief-sla.mjs` 使用 runner 实际 `new Date()` 调用 `plannedWindow(period, now)`，因此把这次迟到的 2026-08-27 PM 检查算成了尚未到截止时间的 `2026-08-28-pm`。随后产生了错误 incident [#26](https://github.com/fallw1nd/daily-game-brief/issues/26)。`scripts/editorialize.mjs` 的 cutoff guard 阻止了未来期 packet 被提前 finalized，因此生产数据未被污染。
- **Risk:** 任何只传 `period`、再按 runner 实际日期计算窗口的 schedule 入口都可能在严重延迟并跨日时漂移期次；不只 SLA，`Final editorial packet` 也属于同类风险。当前 cutoff 校验能阻止部分污染，但会产生假报警、无效恢复和未来期错误尝试。
- **Proposed resolution:** 抽出统一的“最近一个已经到期的固定窗口”解析逻辑，例如 `latestDueWindow(period, now)`，schedule 入口不得用“当前自然日 + period”直接推断 edition。手动 `workflow_dispatch` 仍应使用显式 edition/period 契约。
- **Close when:** 增加跨午夜和长延迟测试；例如北京时间 2026-08-28 03:56 执行 `pm` 必须解析为 `2026-08-27-pm`，不得创建或恢复 `2026-08-28-pm`；AM/PM 正常时点与手动 dispatch 回归通过；生产至少一次迟到/模拟迟到验证不再产生未来期 incident。
- **Resolution:** pending.
- **Verification:** pending.

### MNT-20260828-02 — Pages 下游触发是否存在可消除的重复执行

- **Discovered:** 2026-08-28
- **Priority:** P1
- **Area:** deployment / workflow orchestration
- **Status:** investigating
- **Evidence:** `deploy.yml` 同时声明 `push: main` 与 `workflow_dispatch`；publisher 与 media workflow 又存在显式 `gh workflow run deploy.yml --ref main`。近期生产中观察到相邻 Deploy run 被取消后由后续 Deploy 替代。另一方面，GitHub `GITHUB_TOKEN` 产生的 push 通常不会递归触发新的 workflow，因此不能仅凭 `push: main` 就删除显式 dispatch；需要先确认每个实际 Deploy run 的 `event` 与触发来源。
- **Risk:** 如果确有双触发，会浪费 Actions、制造 cancel noise，并让运维日志更难判断；如果错误删除显式 dispatch，则可能直接导致自动发布不再部署 Pages。
- **Proposed resolution:** 先为连续两期记录 Deploy run 的 `event`、head SHA、调用方和取消原因，建立正常正文提交、媒体提交、恢复重部署三类触发矩阵。只有被生产证据证明冗余的 dispatch 才移除；恢复路径的显式 dispatch 保留。
- **Close when:** 触发矩阵与测试覆盖正常 publisher、media、workflow retry、SLA deployment recovery；每次有效 `main` 变化只有一个必要的 Pages 发布链，且 workflow-token push 情况仍能部署。
- **Resolution:** pending investigation; do not remove dispatch yet.
- **Verification:** pending.

### MNT-20260828-03 — Scheduled Task 缺 packet 时的 preflight 仍可前置

- **Discovered:** 2026-08-28
- **Priority:** P1
- **Area:** ChatGPT Scheduled / packet recovery latency
- **Status:** planned
- **Evidence:** 2026-08-28 AM 固定截止为 10:10，但正常 GitHub packet schedule 没有及时提供 packet；ChatGPT 独立恢复最终触发 `Final editorial packet` run [33135297994](https://github.com/fallw1nd/daily-game-brief/actions/runs/33135297994)，该 run 在约 10:14:21 开始，约 10:14:32 已把 packet 写入 `automation/state`。collector 本身只需数秒，主要延迟发生在 Scheduled Task 先读取其他状态再判断是否需要 recovery 的阶段。
- **Risk:** GitHub schedule 缺失时会无意义地增加几分钟开刊延迟，同时消耗更多 ChatGPT 读取/判断步骤。
- **Proposed resolution:** 将 Scheduled Task 输入阶段拆成极速 preflight：先检查 exact packet 是否存在且合法，再检查 matching collector 是否 queued/in_progress；两者都没有时立即执行已有 edition-scoped one-shot recovery。packet 可用后才读取 manifest/latest/title registry 和完整编辑输入。保持 15 分钟总上限、race guard 与固定窗口不变。
- **Close when:** 契约文档更新；模拟 packet missing + no active run 时 recovery 在最小读取集合后立即触发；packet present / run active 两条路径不产生重复 collector；生产下一次缺 packet 时记录恢复启动延迟。
- **Resolution:** pending.
- **Verification:** pending.

### MNT-20260828-04 — 新作品首次出现时中文名解析仍依赖编辑层临时查询

- **Discovered:** 2026-08-28
- **Priority:** P1
- **Area:** title resolution / editorial input
- **Status:** planned
- **Evidence:** 2026-08-28 AM 初始 editorial decision 将 `Gravhounds`、`Militsioner`、`Whisper of the House`、`FOUNTAINS`、`FINAL FANTASY VII EVER CRISIS` 等多项保持为 `unavailable`；随后 PR [#27](https://github.com/fallw1nd/daily-game-brief/pull/27) 才补入《重力猎犬》《警目如炬》《呓语小镇》《永泉传说》《最终幻想7：永恒危机》等已确认名称。现有 registry 能稳定复用“已经知道的名称”，但首次遇到的新 title 仍可能漏掉已有官方简中名。
- **Risk:** 新作第一次进入日报时更容易以英文名发布，之后再 backfill，形成不必要的人工返工与 revision。
- **Proposed resolution:** 在 packet 前加入受限 `titleHints` 阶段：registry miss 时只查询作品名，优先官方简中发行商/平台/商店页；返回候选中文名、status 和证据 URL，不允许借此加入任何事件事实、时间、平台或新候选。ChatGPT 仍负责最终采用 `official_simplified` / `common_translation` / `unavailable`。
- **Close when:** 新 title 的 hint 有明确 schema 与来源边界；registry hit 不重复查询；至少用本期上述已知案例回归，能够在不扩展事件证据的情况下命中官方名；不存在机器直译自动入库路径。
- **Resolution:** pending.
- **Verification:** pending.

### MNT-20260828-05 — title backfill 后自动生成图片 alt 可能保留旧英文标题

- **Discovered:** 2026-08-28
- **Priority:** P2
- **Area:** media metadata / accessibility / localization
- **Status:** open
- **Evidence:** 当前 `2026-08-28-am` 的 `gravhounds` 条目已经改为 `title_zh_cn: "重力猎犬"`、headline 也已经是《重力猎犬》，但同一 verified image 的 `alt` 仍为 `Gravhounds：《Gravhounds》公布……相关配图`。这是 title 修订后媒体元数据没有同步更新的直接实例。
- **Risk:** 图片加载失败文本、屏幕阅读器文本与正文语言不一致，也违反仓库“meaningful Chinese alt”的媒体契约精神。
- **Proposed resolution:** 对系统自动生成的模板型 alt 建立可识别格式或 provenance；title/headline backfill 时同步重建这类 alt。人工撰写或具有额外视觉描述的信息不得被机械覆盖。
- **Close when:** 本期已确认 stale alt 被修正；测试区分 auto-generated 与 manual alt；未来 title backfill 后不存在旧英文主体残留的自动 alt。
- **Resolution:** pending.
- **Verification:** pending.

### MNT-20260828-06 — `localizeRegisteredTitles()` 全局字符串替换存在误伤风险

- **Discovered:** 2026-08-28
- **Priority:** P2
- **Area:** title localization / text transformation
- **Status:** open
- **Evidence:** 当前 `scripts/lib/title-translations.mjs` 会遍历全部 `titleEnAliases`，按长度排序后对任意正文执行 `localized.split(english).join(chinese)`。随着 registry 增长，如果未来加入 `Control`、`Inside`、`Journey` 等同时是普通英文词的作品名，可能替换非作品语境文本。
- **Risk:** silent text corruption；越大的 title registry 风险越高，而且可能波及历史 backfill。
- **Proposed resolution:** 优先改为每条 entry 的结构化 `mentionedTitles` / 受限 alias 集，只替换该条已知出现的作品；若暂不改 schema，至少增加语境边界、书名号/明确 title mention 检查和高风险短词 deny/explicit opt-in。
- **Close when:** 加入普通词冲突测试；不会把非作品语境的 `Control` 等普通词替换；已确认多作品摘要（例如 FOUNTAINS + DLC）仍能正确本地化。
- **Resolution:** pending.
- **Verification:** pending.

### MNT-20260828-07 — Evidence 日志中的 `ready` 与实际可发布条件语义不一致

- **Discovered:** 2026-08-28
- **Priority:** P2
- **Area:** evidence / observability
- **Status:** open
- **Evidence:** 2026-08-28 AM collector run [33135297994](https://github.com/fallw1nd/daily-game-brief/actions/runs/33135297994) 输出 `Evidence packages: 30; ready=0; limited pages=1`，但同一 packet 中存在多个已打开官方一手来源并最终合法发布为 `fact_status: official` 的事件。代码里的 `ready` 实际只统计 `primary-plus-independent`；而 editorial contract 对 `official` 只要求已打开 primary，只有 `multi_source_verified` 才要求两个独立来源。
- **Risk:** 运维与编辑层会被 `ready=0` 误导为“全部证据不足”，降低日志可解释性。
- **Proposed resolution:** 不改变事实验证门槛，只重命名/拆分指标，例如 `primarySufficient`、`primaryPlusIndependent`、`twoIndependentMedia`、`insufficient`，summary 使用 `publishable` 或明确列出每类数量。
- **Close when:** 日志字段与 editorial contract 一一对应；官方单一一手来源不会再显示为笼统的 not-ready；测试锁定各 readiness 分类。
- **Resolution:** pending.
- **Verification:** pending.

### MNT-20260828-08 — 漏报 coverage audit 过度依赖同样可能迟到的 SLA cron

- **Discovered:** 2026-08-28
- **Priority:** P2
- **Area:** coverage audit / publication QA
- **Status:** planned
- **Evidence:** 当前主要的 `audit-news-coverage.mjs` 执行点位于 `Brief publication SLA watchdog`；MNT-20260828-01 已证明该 schedule 可能出现数小时甚至跨日延迟。正常 publisher 成功时缺少一个立即、只读的漏报审计闭环。
- **Risk:** 内容已经正常发布时，仍可能因为 watchdog 迟到而无法及时发现高置信 A 级候选遗漏；SLA 健康与编辑覆盖质量被耦合到同一个不精确 cron。
- **Proposed resolution:** 在正常 publication 成功后增加只读 coverage audit，生成 artifact / step summary，不在第一阶段阻塞发布。SLA 保留独立恢复审计。积累真实 omission 数据后再决定是否将某些条件升级为阻塞。
- **Close when:** 正常 publisher 每期都生成可追溯 coverage audit；不重复修改 archive；SLA 迟到不影响当期漏报数据可见性；至少观察若干期后确认 false positive 可接受。
- **Resolution:** pending.
- **Verification:** pending.

### MNT-20260828-09 — DeepSeek fallback 缺少真实调用量与结果级可观测性

- **Discovered:** 2026-08-28
- **Priority:** P3
- **Area:** media / paid fallback observability
- **Status:** open
- **Evidence:** 当前 media audit 能记录 `webSearchEnabled` 与 `webSearchProvider: "deepseek"`，控制台也能显示 provider enabled；但不能直接区分“配置了 key 但 0 次调用”和“实际调用 N 次、返回 M 个候选、接受 K 个”。此前 key wiring 验证因为当期没有 unresolved media，只证明 secret 注入和 enabled code path，没有发生真实 `web_search` 请求。
- **Risk:** 难以判断付费 fallback 的实际使用频率、失败率、价值和成本，也不利于排查“为何仍 unavailable”。
- **Proposed resolution:** audit 增加 `webSearchCalls`、`webSearchErrors`、`candidatePagesReturned`、`candidatePagesOpened`、`acceptedFromWebSearch` 等不含敏感信息的计数；按 edition 汇总并在 step summary 输出。
- **Close when:** 0-call 与真实调用可以从 audit 明确区分；错误不会打印 secret；一次受控测试或真实 unresolved item 验证计数正确。
- **Resolution:** pending.
- **Verification:** pending.

### MNT-20260828-10 — 定时 media recovery 在无缺图时仍执行完整重流程

- **Discovered:** 2026-08-28
- **Priority:** P3
- **Area:** media / Actions efficiency
- **Status:** planned
- **Evidence:** `media-enrichment.yml` 的 schedule 作为 10:35/17:25 恢复检查保留；当前 workflow 在确定是否真的需要 enrichment 前仍要 checkout、setup Node、`npm ci`，随后再进入 enrich/check。对于当期已经全部 verified 的恢复 run，这些工作大多是 no-op 成本。
- **Risk:** 每天固定增加无效 runner 时间与日志噪音；随着 `npm run check` 变重，恢复任务成本继续上升。
- **Proposed resolution:** 在安装依赖和完整 media pipeline 前加入零/低依赖 JSON preflight，仅判断目标 edition 是否存在 `image_status/cover_status != verified` 或其他明确待恢复状态。无待处理项的 scheduled run 直接成功退出；显式 workflow_dispatch 可保留强制完整审计选项。
- **Close when:** 已全 verified edition 的 schedule 可在轻量 preflight 后退出；真正缺图时仍进入完整校验与发布；workflow_dispatch 行为明确且有测试。
- **Resolution:** pending.
- **Verification:** pending.

---

## Resolved baseline from recent changes

以下不是完整 changelog，而是建立本账本时对最近关键维护工作的基线索引。后续新发现的问题从上面的 `MNT-*` 条目持续维护，不再只依赖 PR 描述回忆历史。

| Area | Result | Evidence | Status |
| --- | --- | --- | --- |
| 自动媒体发布 | verified media 从审核 PR 改为通过完整检查后自动写入 `main` | [PR #15](https://github.com/fallw1nd/daily-game-brief/pull/15), `docs/MEDIA_PIPELINE.md` | resolved |
| Scheduled 决策层隔离 | 固定窗口结束后生成 finalized packet，ChatGPT 只做结构化编辑决策 | [PR #16](https://github.com/fallw1nd/daily-game-brief/pull/16), `docs/AUTOMATION_ARCHITECTURE.md` | resolved |
| 独立 packet 恢复与 race guard | Scheduled Task 可在 GitHub packet 缺失时使用 edition-scoped one-shot trigger，并避免与 active collector 重复 | [PR #17](https://github.com/fallw1nd/daily-game-brief/pull/17), [PR #18](https://github.com/fallw1nd/daily-game-brief/pull/18), `docs/SCHEDULED_TASK_PROMPT.md` | resolved |
| 媒体 subject fallback | 新闻图从 exact-event 扩展到同主体可追溯图片，同题 secondary cover/story image 可自动接受 | [PR #19](https://github.com/fallw1nd/daily-game-brief/pull/19), [PR #20](https://github.com/fallw1nd/daily-game-brief/pull/20), [PR #21](https://github.com/fallw1nd/daily-game-brief/pull/21) | resolved |
| DeepSeek 媒体搜索 | Brave 最终 fallback 替换为 DeepSeek source-page discovery，模型不直接判定图片 | [PR #22](https://github.com/fallw1nd/daily-game-brief/pull/22), `docs/MEDIA_PIPELINE.md` | resolved |
| 中文名 registry / backfill | 增加可复用中文名登记、官方/常用译名回退与历史补齐 | [PR #23](https://github.com/fallw1nd/daily-game-brief/pull/23), `docs/DATA_PIPELINE.md` | resolved |
| 可见标题中文化 | 已解析中文名同步用于 headline/archiveTitle，并持续补齐当期名称 | [PR #24](https://github.com/fallw1nd/daily-game-brief/pull/24), [PR #27](https://github.com/fallw1nd/daily-game-brief/pull/27) | resolved; follow-ups tracked by MNT-20260828-04/05/06 |
| packet / publication recovery hardening | 完整 packet 校验、当前 main 重建重试、一次幂等 workflow retry、SLA deployment recovery | [PR #25](https://github.com/fallw1nd/daily-game-brief/pull/25), `docs/AUTOMATION_ARCHITECTURE.md` | resolved; delayed-cron follow-up tracked by MNT-20260828-01 |

## Entry template

新增问题时复制下面模板，并保持 ID 单调追加：

```md
### MNT-YYYYMMDD-NN — concise problem title

- **Discovered:** YYYY-MM-DD
- **Priority:** P0 / P1 / P2 / P3
- **Area:** ...
- **Status:** open / investigating / planned / in_progress / resolved / wont_fix / invalid
- **Evidence:** reproducible production/log/code evidence and links.
- **Risk:** what can go wrong if left unchanged.
- **Proposed resolution:** bounded fix; do not silently widen project responsibilities.
- **Close when:** objective verification / exit criteria.
- **Resolution:** PR / commit / design decision after implementation.
- **Verification:** tests, Actions run, production edition, online result.
```

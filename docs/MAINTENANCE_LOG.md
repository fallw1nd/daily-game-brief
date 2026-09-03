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

### MNT-20260828-01 — period-only 入口按 runner 时刻错算 edition

- **Discovered:** 2026-08-28
- **Priority:** P0
- **Area:** scheduling / SLA / packet collection
- **Status:** in_progress
- **Evidence:** `Brief publication SLA watchdog` 的 PM cron 配置为 `35 9 * * *`（北京时间 17:35），但 run [33110883167](https://github.com/fallw1nd/daily-game-brief/actions/runs/33110883167) 实际到 2026-08-28 03:56 左右才启动。workflow 仍正确识别 `period=pm`，但 `scripts/check-brief-sla.mjs` 使用 runner 实际 `new Date()` 调用 `plannedWindow(period, now)`，因此把这次迟到的 2026-08-27 PM 检查算成了尚未到截止时间的 `2026-08-28-pm`。随后产生了错误 incident [#26](https://github.com/fallw1nd/daily-game-brief/issues/26)。`scripts/editorialize.mjs` 的 cutoff guard 阻止了未来期 packet 被提前 finalized，因此生产数据未被污染。2026-08-29 AM 再次暴露同一根因的另一侧：ChatGPT 一次性恢复在固定 10:10 截止前启动 `Final editorial packet` run [33228209388](https://github.com/fallw1nd/daily-game-brief/actions/runs/33228209388)，run 于北京时间约 10:08:48 开始且所有步骤最终成功，但 `workflow_dispatch` 只传 `period=am`，`scripts/collect-news.mjs` 因而按当时的 `latestDueWindow()` 选择最近已到期的 `2026-08-28-am`。持久化日志明确提交了 `chore(automation): persist 2026-08-28-am editorial packet`，而 `automation/packets/2026-08-29-am.json` 始终不存在，导致 2026-08-29 早报在 15 分钟上限后停止。该次恢复没有改动 `main` 或生产数据。
- **Risk:** 任何只传 `period`、再按 runner 实际日期/时刻计算窗口的入口都可能在严重延迟、跨日或截止前抖动时漂移期次。静态 cutoff 校验能阻止部分错误发布，但不能保证 recovery 生成的是请求的 exact edition；结果可能是假成功、错误 state packet、空跑和漏期。
- **Proposed resolution:** schedule 入口继续使用统一 `latestDueWindow(period, now)`，用于吸收 GitHub cron 延迟；manual/recovery `workflow_dispatch` 必须支持并优先使用显式 `edition + period`，且两者必须一致。为兼容尚未更新的现有 period-only recovery prompt，dispatch 仅可锁定 runner 当天同 period 的计划 edition：若距离其 cutoff 不超过五分钟则等待到截止再采集，若更早则显式失败，绝不回退到前一天。新 recovery 契约一律传 exact edition。
- **Close when:** 原跨午夜迟到 cron 回归仍解析为最近已到期 edition；北京时间 2026-08-29 10:08:48 的 period-only AM recovery 锁定 `2026-08-29-am` 并等待截止，不得写 `2026-08-28-am`；显式 edition 在跨日迟到时仍保持原目标；period/edition 不一致和明显过早调用 fail closed；完整 Verify 通过；恢复链至少一次用 exact edition 或安全 legacy fallback 生成正确生产 packet 后再标记 `resolved`。
- **Resolution:** [PR #29](https://github.com/fallw1nd/daily-game-brief/pull/29) / commit [`855f7b7`](https://github.com/fallw1nd/daily-game-brief/commit/855f7b7b335948077f86231724a58a181b4d3885) 先为 schedule/SLA 路径增加统一 `latestDueWindow(period, now)`；2026-08-29 生产复发证明 manual recovery 的 exact-edition 部分并未完成，因此本条重新打开。[PR #40](https://github.com/fallw1nd/daily-game-brief/pull/40) / commit [`3e880a4`](https://github.com/fallw1nd/daily-game-brief/commit/3e880a40cf9ca2482c9880b880abcba840fbdeaa) 补齐 manual/recovery 路径：`workflow_dispatch` 可接收 exact `edition`，新 recovery 契约要求同时传 `period + edition`；旧 period-only 调用只锁定 runner 当天同 period 的计划 edition，截止前五分钟内等待到 cutoff，更早则 fail closed。正常 schedule 仍使用 `latestDueWindow()`。未修改固定 cron、Scheduled Task、生产数据或 schema。
- **Verification:** PR #29 Verify run [33150626972](https://github.com/fallw1nd/daily-game-brief/actions/runs/33150626972) 与 Pages run [33150718591](https://github.com/fallw1nd/daily-game-brief/actions/runs/33150718591) 均成功，但 2026-08-29 run [33228209388](https://github.com/fallw1nd/daily-game-brief/actions/runs/33228209388) 证明原关闭条件只覆盖了迟到 schedule，未覆盖 early manual recovery，因此原 `resolved` 状态撤回。PR #40 Verify run [33235305863](https://github.com/fallw1nd/daily-game-brief/actions/runs/33235305863) 通过完整 `npm run check`；回归直接使用北京时间 2026-08-29 10:08:48，确认 legacy AM recovery 目标为 `2026-08-29-am` 且等待 72 秒，并覆盖显式 edition 跨日迟到、period/edition 不匹配和明显过早调用。合并后 Pages run [33235357282](https://github.com/fallw1nd/daily-game-brief/actions/runs/33235357282) 的 append-only guard、`Check and build` 与 Deploy 全部成功。尚未人为重跑已失败的 2026-08-29 AM 生产恢复，以避免修改当前 state；等待下一次真实 recovery 生成正确 packet 后再满足最后关闭条件。

### MNT-20260828-02 — Pages 下游触发是否存在可消除的重复执行

- **Discovered:** 2026-08-28
- **Priority:** P1
- **Area:** deployment / workflow orchestration
- **Status:** resolved
- **Evidence:** 连续两期生产运行已经给出一致矩阵。2026-08-27 PM 正文提交 [`a0a83ae`](https://github.com/fallw1nd/daily-game-brief/commit/a0a83aebda0e842fa0b54a0764c8136f571d9ec6) 对应 Pages run [33061474829](https://github.com/fallw1nd/daily-game-brief/actions/runs/33061474829)，`event=workflow_dispatch`；随后媒体提交 [`746c36d`](https://github.com/fallw1nd/daily-game-brief/commit/746c36d49587d0bb5589df5c11d838a335a2bf35) 对应 Pages run [33061540376](https://github.com/fallw1nd/daily-game-brief/actions/runs/33061540376)，同样为 `workflow_dispatch`。2026-08-28 AM 正文提交 [`210fa1e`](https://github.com/fallw1nd/daily-game-brief/commit/210fa1e19f2c014b00cd654b7814c24241aafafb) 对应 Pages run [33135543262](https://github.com/fallw1nd/daily-game-brief/actions/runs/33135543262)，媒体提交 [`f761fd5`](https://github.com/fallw1nd/daily-game-brief/commit/f761fd5575f6dadb5f3b0c4667dafd3ff3109da9) 对应 Pages run [33135578470](https://github.com/fallw1nd/daily-game-brief/actions/runs/33135578470)，也均为 `workflow_dispatch`；没有观察到这些 `GITHUB_TOKEN` 机器人提交再产生 `push` 型 Deploy。AM 正文 Deploy 被随后媒体提交的 Deploy 通过 `pages` concurrency 取消，属于新 `main` 提交替代旧提交，不是同一 SHA 的双触发。`Brief publication SLA watchdog` 还在“正文已在仓库但线上未恢复”和“degraded fallback 新写入 main”两条恢复分支显式 dispatch Pages。
- **Risk:** 如果把不同 `main` 写入对应的显式 dispatch 误判为重复并删除，workflow-token 写入将可能不再部署；如果以后同一写入路径真的新增第二个 Pages 请求，又会产生无意义 Actions 与 cancel noise。
- **Proposed resolution:** 保留现有三类必要路径：外部/人工 `main` push 由 `deploy.yml` 的 `push` 触发；publisher 与 media 的 workflow-token 写入分别在各自成功写入后显式 dispatch；workflow retry 与 SLA deployment recovery 保留显式重部署能力。新增静态契约测试锁定每条路径的触发数量和条件，后续若要移除 dispatch 必须先改变写入凭据或部署编排并同步测试。
- **Close when:** 触发矩阵与测试覆盖正常 publisher、media、workflow retry、SLA deployment recovery；每次有效 `main` 变化只有一个必要的 Pages 发布链，且 workflow-token push 情况仍能部署。
- **Resolution:** [PR #31](https://github.com/fallw1nd/daily-game-brief/pull/31) / commit [`dd8bd6b`](https://github.com/fallw1nd/daily-game-brief/commit/dd8bd6bcf5926edb1d28a71178a2c3c0fececae3) 确认不存在可安全删除的同一写入重复 dispatch，并新增 `scripts/workflow-deployment.test.mjs` 锁定外部 `main` push、publisher/幂等 retry、media 与 SLA recovery 的部署触发契约。保留 workflow-token 写入后的显式 Pages dispatch；未修改生产 workflow、Scheduled Task、固定窗口或生产数据。
- **Verification:** PR #31 最终 Verify run [33158003944](https://github.com/fallw1nd/daily-game-brief/actions/runs/33158003944) 通过完整 `npm run check`；两期生产矩阵确认 publisher/media 的 workflow-token 写入各自通过单一显式 dispatch 部署，没有同 SHA 的 `push` 双触发。合并后 commit `dd8bd6b` 作为外部 `main` push 自动触发 Pages run [33158067630](https://github.com/fallw1nd/daily-game-brief/actions/runs/33158067630)，完整 `Check and build` 与 `Deploy` 成功，证明两类触发职责均可工作，关闭该条目。

### MNT-20260828-03 — Scheduled Task 缺 packet 时的 preflight 仍可前置

- **Discovered:** 2026-08-28
- **Priority:** P1
- **Area:** ChatGPT Scheduled / packet recovery latency
- **Status:** in_progress
- **Evidence:** 2026-08-28 AM 固定截止为 10:10，但正常 GitHub packet schedule 没有及时提供 packet；ChatGPT 独立恢复最终触发 `Final editorial packet` run [33135297994](https://github.com/fallw1nd/daily-game-brief/actions/runs/33135297994)，该 run 在约 10:14:21 开始，约 10:14:32 已把 packet 写入 `automation/state`。collector 本身只需数秒，主要延迟发生在 Scheduled Task 先读取其他状态再判断是否需要 recovery 的阶段。
- **Risk:** GitHub schedule 缺失时会无意义地增加几分钟开刊延迟，同时消耗更多 ChatGPT 读取/判断步骤。
- **Proposed resolution:** 将 Scheduled Task 输入阶段拆成极速 preflight：先检查 exact packet 是否存在且合法，再检查 matching collector 是否 queued/in_progress；两者都没有时立即执行已有 edition-scoped one-shot recovery。packet 可用后才读取 manifest/latest/title registry 和完整编辑输入。保持 15 分钟总上限、race guard 与固定窗口不变。
- **Close when:** 契约文档更新；模拟 packet missing + no active run 时 recovery 在最小读取集合后立即触发；packet present / run active 两条路径不产生重复 collector；生产下一次缺 packet 时记录恢复启动延迟。
- **Resolution:** [PR #33](https://github.com/fallw1nd/daily-game-brief/pull/33) / commit [`f121e74`](https://github.com/fallw1nd/daily-game-brief/commit/f121e743deeaadcbe315df12c3d2750eb37edb03) 将 `docs/SCHEDULED_TASK_PROMPT.md` 改为 packet-first preflight，并新增 `scripts/scheduled-task-contract.test.mjs` 锁定 packet present、active collector 与 missing packet recovery 三条路径。随后直接更新现有早报 Scheduled Task `6a86ccc265fc8191a6c72a6bab1cdcea` 与晚报 Scheduled Task `6a86cce353708191be251b6cf545fcc9` 的 prompt：第一阶段只读 exact packet；仅在 packet 缺失/非法时检查 matching collector；packet 可用后才加载 AGENTS / contract / manifest / latest / title registry。未改变任务数量、启用状态、Asia/Shanghai 时区、10:10/17:00 执行时间、固定窗口或生产数据。
- **Verification:** PR #33 Verify run [33159527832](https://github.com/fallw1nd/daily-game-brief/actions/runs/33159527832) 通过完整 `npm run check`；合并后 Pages run [33159595929](https://github.com/fallw1nd/daily-game-brief/actions/runs/33159595929) 成功。Scheduled 配置回读确认早报仍为 `DTSTART;TZID=Asia/Shanghai:20260821T101000`、晚报仍为 `DTSTART;TZID=Asia/Shanghai:20260821T170000`，两者均 `exact_schedule` 且 `is_enabled=true`。静态契约已满足前置读取与不重复触发条件；仍需等待下一次真实 packet missing 生产事件记录 recovery 启动延迟后才能按 Close when 标记 `resolved`。

### MNT-20260828-04 — 新作品首次出现时中文名解析仍依赖编辑层临时查询

- **Discovered:** 2026-08-28
- **Priority:** P1
- **Area:** title resolution / editorial input
- **Status:** in_progress
- **Evidence:** 2026-08-28 AM 初始 editorial decision 将 `Gravhounds`、`Militsioner`、`Whisper of the House`、`FOUNTAINS`、`FINAL FANTASY VII EVER CRISIS` 等多项保持为 `unavailable`；随后 PR [#27](https://github.com/fallw1nd/daily-game-brief/pull/27) 才补入《重力猎犬》《警目如炬》《呓语小镇》《永泉传说》《最终幻想7：永恒危机》等已确认名称。现有 registry 能稳定复用“已经知道的名称”，但首次遇到的新 title 仍可能漏掉已有官方简中名。
- **Risk:** 新作第一次进入日报时更容易以英文名发布，之后再 backfill，形成不必要的人工返工与 revision。
- **Proposed resolution:** 在 packet 前加入受限 `titleHints` 阶段：registry miss 时只查询作品名，优先官方简中发行商/平台/商店页；返回候选中文名、status 和证据 URL，不允许借此加入任何事件事实、时间、平台或新候选。ChatGPT 仍负责最终采用 `official_simplified` / `common_translation` / `unavailable`。
- **Close when:** 新 title 的 hint 有明确 schema 与来源边界；registry hit 不重复查询；至少用本期上述已知案例回归，能够在不扩展事件证据的情况下命中官方名；不存在机器直译自动入库路径。
- **Resolution:** [PR #35](https://github.com/fallw1nd/daily-game-brief/pull/35) / commit [`f859315`](https://github.com/fallw1nd/daily-game-brief/commit/f859315491d9420496d4988575db690ef9394b49) 已在 `Final editorial packet` 的 evidence → editorialize 之间加入受限 title-only hint 阶段。只对 registry miss 搜索，复用既有 DeepSeek Responses/Web Search 作为候选来源页发现器；每个接受的页面由代码打开并要求候选中文名逐字出现在正文中，`common_translation` 至少需要两个不同 hostname。输出仅以紧凑 naming evidence 加入 `editorialInput.titleHints`，不自动写入 registry，`suggestedStatus` 只供编辑判断，ChatGPT 仍决定 `official_simplified` / `common_translation` / `unavailable`。hint 来源不得补充事件事实、时间、平台、发行信息、source classification、tracking 或新候选。保持 finalized packet schema v3、editorialInput schema v2 与既有输入预算；未修改 Scheduled Task、固定窗口或 `public/data`。
- **Verification:** PR #35 最终 Verify run [33161253861](https://github.com/fallw1nd/daily-game-brief/actions/runs/33161253861) 通过完整 `npm run check`。回归覆盖上述五个 2026-08-28 已知名称、registry hit 不重复搜索、未知英文标题才进入 hint、候选中文名必须在已打开页面逐字命中、`common_translation` 双独立 host、拒绝 machine_translation/无证据候选、命中名称可见摘录，以及带可选 `titleHints` 的 finalized packet 仍通过现有 preflight validator。合并后 Pages run [33161354443](https://github.com/fallw1nd/daily-game-brief/actions/runs/33161354443) 成功。尚未人为重跑已发布的 2026-08-28 PM collector，以避免为测试覆盖当前 `automation/state`；等待下一次正常生产出现 registry miss 后观察真实 hint 产出与编辑采用结果，再决定是否满足关闭条件。

### MNT-20260828-05 — title backfill 后自动生成图片 alt 可能保留旧英文标题

- **Discovered:** 2026-08-28
- **Priority:** P2
- **Area:** media metadata / accessibility / localization
- **Status:** in_progress
- **Evidence:** 当前 `2026-08-28-am` 的 `gravhounds` 条目已经改为 `title_zh_cn: "重力猎犬"`、headline 也已经是《重力猎犬》，但同一 verified image 的 `alt` 仍为 `Gravhounds：《Gravhounds》公布……相关配图`。这是 title 修订后媒体元数据没有同步更新的直接实例。
- **Risk:** 图片加载失败文本、屏幕阅读器文本与正文语言不一致，也违反仓库“meaningful Chinese alt”的媒体契约精神。
- **Proposed resolution:** 对系统自动生成的模板型 alt 建立可识别格式或 provenance；title/headline backfill 时同步重建这类 alt。人工撰写或具有额外视觉描述的信息不得被机械覆盖。
- **Close when:** 本期已确认 stale alt 被修正；测试区分 auto-generated 与 manual alt；未来 title backfill 后不存在旧英文主体残留的自动 alt。
- **Resolution:** [PR #37](https://github.com/fallw1nd/daily-game-brief/pull/37) / commit [`2e04cc4`](https://github.com/fallw1nd/daily-game-brief/commit/2e04cc4bde91830966697879a0834460475e690c) 已实现后续防复发路径：新增 `scripts/lib/media-alt.mjs` 识别当前系统生成的 editorial alt 模板，并在 `titles:backfill` 完成 title/headline/summary 本地化后同步刷新。只有现有 `kind: "editorial"` alt 经既有标题本地化后精确等于当前自动模板时才重建；人工或来源自带的视觉描述、cover alt 均不覆盖。未修改 Scheduled Task、固定窗口、schema、title/fact/time status 或历史生产数据。
- **Verification:** PR #37 最终 Verify run [33163086458](https://github.com/fallw1nd/daily-game-brief/actions/runs/33163086458) 通过完整检查；回归覆盖真实 `Gravhounds`、`FOUNTAINS` / `Shattered Shape` stale 模板，并验证 manual editorial alt 与 cover alt 保持不变。合并后 Pages run [33163142898](https://github.com/fallw1nd/daily-game-brief/actions/runs/33163142898) 成功。实施过程中曾尝试直接修正 `2026-08-28-am` 历史 JSON，但 diff review 发现同时带入一处无关 cover sourceUrl 变化，因此该数据改动在合并前整体撤销，最终 PR 不包含任何 `public/data` 变更。已发布的已知 stale alt 因而仍未满足本条 `Close when`，本条保持 `in_progress`，后续须通过可独立验证的安全数据路径修正后才能关闭。

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

### MNT-20260829-01 — verified 边界分钟丢失秒级精度

- **Discovered:** 2026-08-29
- **Priority:** P0
- **Area:** editorial handoff / time validation / fixed windows
- **Status:** resolved
- **Evidence:** 2026-08-29 AM 补发的 publisher run [33236844373](https://github.com/fallw1nd/daily-game-brief/actions/runs/33236844373) 在构建后被 `validate:data` 拒绝，报 `2026-08-29-am-releases-2: verified event time falls outside the fixed window`。该事件选中来源的原始 `publishedAt` 为 `2026-08-28T09:00:11Z`，即北京时间 17:00:11，实际满足 AM 窗口 `(前一日17:00, 当日10:10]`；但 editorial/public `beijingTime` 仅保留到分钟，序列化为 `2026-08-28 17:00` 后被验证器按 17:00:00 处理，错误落在排除边界。最终补发只能暂时降级为 `time_unverified` 才完成发布。
- **Risk:** exclusive start 后首 59 秒的合法事件会被误拒；如果粗暴放行整个边界分钟，则又会错误接纳 exact-start 事件以及 inclusive end 后 1–59 秒的越界事件，直接破坏固定窗口。
- **Proposed resolution:** 保持 `beijingTime` 分钟级展示兼容；对 `verified` 且位于 start/end 边界分钟的决策，只从该条实际选中的 opened source `publishedAt` 自动导出唯一秒级证据，并由 publisher 持久化为可选 `timeEvidenceAt`。提交验证和最终数据验证用精确 instant 约束 `(windowStart, windowEnd]`；只有分钟精度或存在多义性的边界证据不得标 `verified`，继续使用 `time_unverified`。
- **Close when:** 回归覆盖 AM/PM exclusive start、inclusive end、真实 17:00:11 事故、minute-only 边界与 `time_unverified`；完整 Verify 与合并后 Pages 成功；不改固定窗口、期号、历史 archive 或既有时间状态。
- **Resolution:** [PR #43](https://github.com/fallw1nd/daily-game-brief/pull/43) / commit [`47d8411`](https://github.com/fallw1nd/daily-game-brief/commit/47d841169c6d099c6dadf73a223a7d3eb2e3a64f) 已新增受信任的 `timeEvidenceAt` 边界证据路径：`beijingTime` 继续只承担分钟级展示；边界分钟的 `verified` 决策由代码从实际选中的 opened source 自动导出唯一秒级 `publishedAt`，publisher 持久化 exact evidence，提交校验、最终数据校验与前端 window helper 均按 `(windowStart, windowEnd]` 精确判定。分钟级或多义边界证据 fail closed，可安全保留 `time_unverified`。未修改固定 10:10/17:00 窗口、期号、历史 archive、Scheduled Task 或生产数据。
- **Verification:** PR #43 最终 head `4d2c5aa` 的 Verify run [33241793194](https://github.com/fallw1nd/daily-game-brief/actions/runs/33241793194) 通过完整 `npm run check`。回归覆盖真实事故 `2026-08-28T09:00:11Z`、AM/PM exclusive start、PM inclusive end、minute-only 边界 fail closed、`time_unverified` fallback，以及消费端 `isEntryInsideEditionWindow()` 对 exact evidence 的一致处理。合并后 Pages run [33241850641](https://github.com/fallw1nd/daily-game-brief/actions/runs/33241850641) 的 append-only guard、`Check and build`、Upload artifact 与 Deploy 全部成功；关闭条件满足。

### MNT-20260829-02 — 海外事件源未回查中国游戏官方简中术语

- **Discovered:** 2026-08-29
- **Priority:** P1
- **Area:** editorial localization / mainland Chinese terminology
- **Status:** resolved
- **Evidence:** 当前 `2026-08-29-am` 的《绝区零》3.2 条目虽然游戏名已是 `official_simplified`，正文却沿用海外二手来源写成版本名 `Their Secret Histories`、职业 `Armorer/装甲师`、角色 `Claret/Roxy`；中国大陆官方简中命名应为版本“她与她的隐秘往事”、职业“锋御”、角色“克拉蕾/洛克茜”。说明现有规则只约束游戏标题，没有约束中国游戏的版本名、职业/角色等可见术语。
- **Risk:** 面向中国大陆读者的简报会出现官方已有中文名却仍使用英文或海外直译的情况，造成事实表达不专业、搜索与读者认知不一致，并持续产生人工纠错。
- **Proposed resolution:** 对拥有中国大陆官方简中渠道的游戏，正文可见专名优先采用大陆官方简中命名；当 finalized packet 来自海外/外语来源时，仅允许增加受限 terminology-only 核验来统一版本副标题、角色/代理人、职业、模式与机制名，不得借此新增或改变事件事实、时间、平台、发行主张、来源分类、tracking 或候选。当前《绝区零》条目以 revision 方式只修正文案、alt 与相关说明，不改期号、窗口、fact/time status 或事件来源。
- **Close when:** `2026-08-29-am` archive 与 latest 同步使用“她与她的隐秘往事”“锋御”“克拉蕾”“洛克茜”；Scheduled/editorial contract 与数据规范明确 mainland terminology-only 边界并有回归测试；完整 Verify 与合并后 Pages 成功，且无无关生产数据变化。
- **Resolution:** [PR #45](https://github.com/fallw1nd/daily-game-brief/pull/45) / commit [`bb67102`](https://github.com/fallw1nd/daily-game-brief/commit/bb6710203b9178598a304f05226c78119c81f1a8) 已将 `2026-08-29-am` 正文与 upcoming 中《绝区零》3.2 的可见术语统一为中国大陆官方简中命名：版本“她与她的隐秘往事”、职业“锋御”、角色“克拉蕾/洛克茜”，并同步修正图片 alt 与 sourceReport 说明。与此同时在 `AGENTS.md`、`docs/DATA_PIPELINE.md`、`docs/SCHEDULED_TASK_PROMPT.md` 建立 mainland terminology-only 规则：海外/外语事件源可额外查中国大陆官方简中来源来统一版本副标题、角色/代理人、职业、模式和机制等专名，但不得据此新增事件事实、时间、平台、发行主张、来源分类、tracking 或候选。未修改期号、固定窗口、fact/time status、事件来源分类、manifest、schema 或 Scheduled Task 配置。
- **Verification:** PR #45 Verify run [33242651626](https://github.com/fallw1nd/daily-game-brief/actions/runs/33242651626) 通过完整 `npm run check`；PR diff 仅包含两份同版生产 JSON、三份规则/契约文档、契约测试与本维护账本，archive/latest 的《绝区零》修订保持一致。合并后 Pages run [33242690995](https://github.com/fallw1nd/daily-game-brief/actions/runs/33242690995) 的 append-only guard、`Check and build`、Upload artifact 与 Deploy 全部成功。中国大陆官方《绝区零》3.2 前瞻明确使用版本名“她与她的隐秘往事”和角色名“克拉蕾/洛克茜”；本次编辑纠错同时采用官方简中职业名“锋御”。关闭条件满足。

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

## MNT-20260829-03 — 晚报误认延迟早报 collector 并在单次失败后自停

- **Discovered:** 2026-08-29
- **Priority:** P1
- **Area:** Scheduled task / packet recovery / Actions concurrency / task lifecycle
- **Status:** resolved
- **Evidence:** 2026-08-29 晚报等待 `automation/packets/2026-08-29-pm.json` 15 分钟后停止，并把原晚报 Scheduled Task 暂停。其认定为“matching collector”的 `Final editorial packet` run [33244366704](https://github.com/fallw1nd/daily-game-brief/actions/runs/33244366704) 实际是严重延迟执行的 AM cron：日志明确按 `10 2 * * *` 选择 `period=am`，最终持久化 `2026-08-29-am`，不可能生成 PM packet。原 workflow 同时让 AM/PM 共用同一个 `news-discovery-state` concurrency group，延迟的相反时段 run 也存在互相取消风险。
- **Risk:** Scheduled Task 若按实际启动时间或“接近当前截止时间”把相反时段的延迟 run 当作 matching，会错误抑制 exact-edition recovery，造成当期 packet 永久缺失；而单次失败后自停长期任务会把一次事故扩大成后续每日持续漏跑。
- **Root cause:** matching collector 缺少可在 job 启动前验证的目标 period/edition 身份，ChatGPT preflight 约束也未明确禁止用 `created_at` / `run_started_at` / 当前时钟推断 period；同时任务生命周期契约没有禁止单次故障修改长期 Scheduled Task 的 enabled 状态。Actions 侧 AM/PM 还共享同一个 concurrency group。
- **Resolution:** [PR #47](https://github.com/fallw1nd/daily-game-brief/pull/47) / commit [`deee843`](https://github.com/fallw1nd/daily-game-brief/commit/deee84349004c804d58df5f2a9318abfb2937f7a) 为 `Final editorial packet` 增加目标 period/edition 可见的 run name，并把 collector concurrency 按 AM/PM 隔离；`docs/SCHEDULED_TASK_PROMPT.md` 规定只有目标 period/edition 被明确证明时才算 matching，禁止按实际运行时间猜测，无法证明或相反时段的 run 必须视为 non-matching 并允许 exact-edition recovery；同时明确任何单期 packet/recovery/validation/publication 故障都不得 disable、pause、改名或改时间两个长期 Scheduled Task。两个实际 ChatGPT 任务提示词已同步该规则，原晚报任务 `6a86cce353708191be251b6cf545fcc9` 已恢复启用，仍为每天17:00 Asia/Shanghai，早报任务保持10:10启用，没有新增长期任务。
- **Recovery:** edition-scoped recovery 以 `period=pm` + `edition=2026-08-29-pm` 精确触发 `Final editorial packet` run [33250011711](https://github.com/fallw1nd/daily-game-brief/actions/runs/33250011711)，成功生成 schema v3 的 `automation/packets/2026-08-29-pm.json`；随后按 finalized packet 提交完整编辑决定，trusted publisher run [33250378016](https://github.com/fallw1nd/daily-game-brief/actions/runs/33250378016) 成功发布第18期，主发布 commit [`3c143c2`](https://github.com/fallw1nd/daily-game-brief/commit/3c143c26e729be84dbd3cfa391a48d51288255ca)。媒体流程 run [33250414256](https://github.com/fallw1nd/daily-game-brief/actions/runs/33250414256) 成功，并以 commit [`418f2bb`](https://github.com/fallw1nd/daily-game-brief/commit/418f2bb2935b182fbc7ee7fb5f53226c496da97c) 为3条正文补齐已验证图片。
- **Close when:** matching-run 规则与 AM/PM concurrency 有回归测试；修复 PR Verify 成功；缺失 PM packet 通过 exact-edition 路径恢复且正常 publisher 发布；Pages 部署成功；线上 latest/archive/manifest/search-index 与本期媒体均完成实际 HTTP 验收；两个长期 Scheduled Task 均保持启用；一次性 recovery/verification workflow 和维护工作分支全部清理。
- **Verification:** PR #47 Verify run [33250085760](https://github.com/fallw1nd/daily-game-brief/actions/runs/33250085760) 成功。最终 Pages run [33250441905](https://github.com/fallw1nd/daily-game-brief/actions/runs/33250441905) 成功部署 media commit `418f2bb`。一次性生产验收 run [33250559581](https://github.com/fallw1nd/daily-game-brief/actions/runs/33250559581) 从 GitHub runner 直接请求线上资源，确认 `latest.json`、manifest 末项和 archive 均为 `2026-08-29-pm` / issue 18，latest 与 archive byte-identical，`search-index.json` 含3条本期正文记录，3张本期正文图片均返回 HTTP 200。原 recovery workflow 与 live-verification workflow 均已从 `automation/state` 删除；早报/晚报两个长期 Scheduled Task 均已确认 `is_enabled:true`。关闭条件满足。

---

## MNT-20260830-01 — 跨调度器缺少逐期耐久回执与单一恢复责任

- **Discovered:** 2026-08-30
- **Priority:** P0
- **Area:** scheduling / orchestration / publication identity / observability
- **Status:** in_progress
- **Evidence:** 从零审计确认两个外部 ChatGPT Scheduled Tasks 与八个 GitHub schedules 之间只通过 mutable packet path、分支观察和运行日志协作；没有逐期 packet blob、editorial validation、publication commit、deployment result 的共同耐久状态。旧 ChatGPT prompt 还允许自行检查 Actions 并动态创建 one-shot workflow，形成两个恢复 owner。后续契约复核又发现 `editorial.invalid` 不在任务选择集，且 normal Canonical 检查晚于 inbox 提交；前者会把可修复 decision 留给 degraded SLA，后者会在 `automation/state` 落后 `main` 时产生不必要的重复编辑。2026-08-31 上线前复核进一步确认“GitHub schedule 本身”不能作为 12:00 硬发布承诺：`Final editorial packet` AM run [33301136497](https://github.com/fallw1nd/daily-game-brief/actions/runs/33301136497) 对应 10:10 计划点却到北京时间约16:15才启动，PM run [33315900986](https://github.com/fallw1nd/daily-game-brief/actions/runs/33315900986) 对应17:00计划点也到约22:05才启动；因此 Daily 若只依赖 GitHub cron，10:10 packet、11:00 SLA 都可能被同一调度器一起拖延。
- **Risk:** cron 延迟、跨日、重复执行、并发 push、旧分支提交、invalid decision 或部分成功会造成漏期、错期、重复编辑、重复恢复或“内容已提交但下游不知道”的 split-brain；可选英文/媒体失败还可能被误认为 Canonical 发布失败。Daily 额外存在单调度器 liveness 风险：若 10:10 packet 与11:00 SLA 都因 GitHub schedule 严重迟到，现有10:20 ChatGPT handoff 又只能读取 ready packet，则12:00公开发布没有独立唤醒路径。
- **Proposed resolution:** 在 `automation/status/<edition-id>.json` 建立 schema v1 状态机，用 Git blob SHA 绑定 finalized packet，用 submission/main SHA 绑定验证与发布；所有 state 写入使用三次 fetch/rebuild/push；GitHub Actions 独占 packet/degraded recovery；ChatGPT 按最旧顺序消费 `pending`，或依据 durable `validationErrors` 对同一期、同一 packet 的 `invalid` decision 做修复，明确排除 `submitted`/`valid`/`timed_out`；packet preflight 后以 current `main` Canonical 做生成前幂等检查；collector 成功后延迟 dispatch exact-edition SLA，cron 只作冗余唤醒；英文和媒体保持独立非阻塞 lane。Daily 正式切换后再启用一个受限 liveness backstop：10:20 Daily task 若没有 acknowledged ready packet，只能从 current `main` 推导“最新健康 AM/Daily 的直接后继”，在该 edition-scoped editorial branch 写入固定 schema v1 的 `automation/wake/<edition-id>.json` 后立即停止；现有 GitHub packet workflow 只接受 `automation/editorial/*-daily` + wake path，重新校验 branch edition / payload，并用 exact `period=daily + edition` 调用 resolver。wake 只是第二调度器信号，真正 collection、state、SLA、degraded publication、deployment 仍全部归 GitHub Actions。
- **Close when:** 状态机/积压/迟到/重复/错误 SHA/invalid/degraded/locale/media 场景测试通过；完整 `npm run check` 通过；两个现有 ChatGPT task prompt 同步到新 contract 且保持启用；至少一组真实 AM/PM 生产运行写出 packet、editorial、publication、deployment 终态并验证 Pages；Daily 正式切换后至少一次验证正常 packet path，并至少一次受控验证 exact wake → packet acknowledgement → exact SLA 的独立 liveness 路径；首份真实 Daily 在12:00 release gate正确公开，随后至少3期无人干预成功；确认没有第三个长期任务、动态 workflow 或遗留 recovery 分支。
- **Resolution:** `codex/production-reliability-state-machine` 已实现 durable 架构；后续 Scheduled Task Contract 修复补上 invalid same-packet repair、GitHub-owned in-flight lane 隔离与生成前 Canonical 幂等检查。当前 draft [PR #61](https://github.com/fallw1nd/daily-game-brief/pull/61) / `codex/daily-edition-precutover` 在不切换生产的前提下继续把同一耐久编排泛化到 `am | pm | daily`：Daily 使用 `(前日10:10, 当日10:10]` 的证据窗口、`plannedAt=12:00`，保留 Canonical v2 / packet v3 / editorialInput v2 / decision v2 / state v1 / manifest v1；11:00 SLA 能识别“Canonical 已在 main、Pages 正等待12:00 release gate”的合法 staging 状态，正文发布后立即触发 exact-edition media，11:10 作为媒体恢复点。证据30项 package cap 与120k editorial-input budget 都增加可观测 omission telemetry。上线前补强又加入 Daily-only exact wake push trigger，避免把12:00 liveness 完全押在 GitHub cron 上；`AGENTS.md` 已加入 Daily 10:10 cutoff / 12:00 plannedAt / `日报｜` 契约，中英文 UI footer 按 period 动态显示 Daily 或 legacy cadence。precutover 仍保留当前 AM/PM 生产 cron、两个外部 ChatGPT Scheduled Task 和全部历史/public data 不变。
- **Verification:** 状态机、resolver 与 thin-prompt 契约已增加 invalid repair、lane ownership、state/main 不同步、Canonical 检查顺序、Daily exact wake branch/path/payload、以及中英文 Daily footer 回归测试；PR #61 head `96ca426` 的 Verify run [33362994941](https://github.com/fallw1nd/daily-game-brief/actions/runs/33362994941) 完整 `npm run check` 通过：33 个测试文件、209 项测试全部通过，20期 Canonical 数据与20期 locale infrastructure 验证通过，search index 为153条/20期，Vite production build 成功；仅保留既有 `2026-08-26-pm` historical discoveryQueries warning。当前 PR compare 仍无 `public/data` 变更，生产 cron 与两个外部 ChatGPT Scheduled Task 也未修改。Daily 的真实12:00生产发布、正式 task 切换、wake 生产验收和连续无人干预运行证据仍 pending，因此本条保持 `in_progress`，不得标记 resolved。
- **2026-09-01 production follow-up:** Daily 切换后已真实走过 normal editorial、SLA degraded fallback、同版 revision、English degradation 与 locale-only repair。英文“非阻塞”原先只有降级记录而没有后续消费方，导致已发布 Canonical 会让 ChatGPT 直接停止、`editorial-overlay-missing` 永久积压；[PR #89](https://github.com/fallw1nd/daily-game-brief/pull/89) / merge commit `0d11367495b6d407fd9ba433d9b86b01650c5b99` 将 Canonical stable `entryId` 作为 locale repair 身份，引入 `automation/locale/en/<edition>` + `automation/locale-inbox/<edition>.json` 的有界 lane，并继续复用同一个 trusted publisher、Canonical hash guard、Overlay validator、Pages 与 incident 关闭路径。现行 Daily Scheduled Task contract 也改为 Canonical 优先、每次至多消费一个已发布 Daily 英文 backlog，正常 Daily 默认尝试完整 `locales.en`。
- **2026-09-01 legacy locale compatibility:** [PR #90](https://github.com/fallw1nd/daily-game-brief/pull/90) / merge commit `5b0d24e07dcb44a70e56ad50e8fa560a10506b0e` 允许状态机上线前的历史 AM/PM 做 locale-only repair 时跳过不存在的 durable state acknowledgement，但 Daily 缺 state 继续 fail closed，避免为了补英文而伪造历史状态。
- **2026-09-01 English verification:** `2026-08-31-daily` 与 `2026-09-01-daily` 的 durable `localeEn` 已为 `available`；`2026-08-30-am` 也通过 legacy-safe locale-only repair 写入英文 Overlay，最终 main 为 `adb15d4b43359b4a42f0432434dd8d10df2e4be4`，Pages run [33475262351](https://github.com/fallw1nd/daily-game-brief/actions/runs/33475262351) 成功。英文 degradation incidents #59/#66/#86 均已关闭。原先仍开放的 publication-failure incidents #58/#81/#88 经复核后续 trusted publisher runs [33295191227](https://github.com/fallw1nd/daily-game-brief/actions/runs/33295191227)、[33414479274](https://github.com/fallw1nd/daily-game-brief/actions/runs/33414479274)、[33469814246](https://github.com/fallw1nd/daily-game-brief/actions/runs/33469814246) 已成功，于 2026-09-01 手工补充恢复说明并关闭。
- **2026-09-01 remaining observability gap:** `automation/status/2026-08-31-daily.json` 当前顶层 `deployment.status` 仍显示 `failed`，指向后续通用 Pages run，而其 transitions 中存在此前成功部署、且该期之后的英文 locale repair 也已成功。这说明“当前 latest edition”可能被与该 edition Canonical commit 无关的后续 Pages acknowledgement 覆写 deployment lane，并在 edition 变成历史后留下误导终态；另外 publication failure incident 在后续成功恢复后此前不会自动关闭。两者都不是当前线上故障，但属于 MNT-20260830-01 的耐久回执/incident 生命周期剩余缺口。
- **2026-09-01 close-state update:** 本条继续保持 `in_progress`。正常 Daily、degraded fallback、same-edition revision 与 locale repair 已有真实生产证据，但仍需修复 deployment acknowledgement 的 edition/commit 归属和 publication incident 自动收敛，并满足 exact wake 生产验收与连续无人干预 Daily 的既定关闭条件后才能 `resolved`。

---

## MNT-20260901-01 — event ledger 错记窗口并漏识别平台级主体

- **Discovered:** 2026-09-01
- **Priority:** P1
- **Area:** discovery / event ledger / subject identity
- **Status:** resolved
- **Evidence:** 2026-08-31 同版采集暴露两类独立但同属 discovery identity/observability 的缺陷：`timeRelation:"outside"` 或 `prior-24h-audit` 的候选仍把当前 edition 写入 durable `windowsSeen`；同时 PlayStation Blog 的 State of Play 一手新闻虽已打开 primary evidence，却因不是游戏标题 registry 中的作品而停在 `requires_subject_identity`。长期还存在 undecided Tier-C unknown-time 页面持续污染 durable ledger 的噪音。
- **Risk:** `windowsSeen` 会错误暗示候选属于已经截止的 edition，Tier-C 噪音削弱长期 ledger 可读性；平台级 recurring topic 即使有高质量一手证据也可能被 subject gate 压住，形成真实漏报风险。
- **Proposed resolution:** `windowsSeen` 只对 `window`、`unknown` 或 legacy 缺失 relation 的 snapshot 追加；未做编辑决定且未 active tracking 的 Tier-C 不进入 durable ledger；平台 recurring subject 采用 source-scoped resolver，不能把普通文本中的相同短语跨来源误判为主体。
- **Close when:** outside/prior-audit 不再占用 edition window；下一正确 window 能正常追加；Tier-C undecided 噪音被清理；State of Play 只在 Sony/PlayStation owning source 下解析为 canonical subject；完整 Verify 通过并在真实 2026-09-01 Daily packet 中恢复为可直接编辑候选。
- **Resolution:** [PR #83](https://github.com/fallw1nd/daily-game-brief/pull/83) / merge commit `c76eb4dec9fb4ab4850ddf967d920f2999784c16` 已实现 source-scoped `state-of-play` identity、缺失 subject 时的 canonical fallback、`windowsSeen` relation guard、Tier-C durable pruning 与回归测试。没有改 production archive、固定窗口、cron、Scheduled Task 或 schema；已存活 A/B 事件过去被错误写入的历史 `windowsSeen` 不做追溯重写，避免为可观测性字段修改历史事实数据。
- **Verification:** PR #83 Verify run [33464583326](https://github.com/fallw1nd/daily-game-brief/actions/runs/33464583326) 通过；同日重新生成的 exact `2026-09-01-daily` packet 中，State of Play 获得 `subjectKey:"state-of-play"`、A-tier、window、opened PlayStation Blog primary evidence，并进入正常 Daily 编辑/发布链。关闭条件满足。

## MNT-20260901-02 — Daily degraded fallback 误用 PM 标题与 upcoming 契约

- **Discovered:** 2026-09-01
- **Priority:** P0
- **Area:** Daily SLA / degraded publication
- **Status:** resolved
- **Evidence:** `2026-09-01-daily` 的 11:00 SLA run [33464596564](https://github.com/fallw1nd/daily-game-brief/actions/runs/33464596564) 已选出一个符合 degraded 门槛的 A-level event，但生成 `晚报｜Young Suns`，被 publisher 以 Daily archiveTitle 必须 `日报｜` 拒绝；同一旧二分支还把 Daily upcoming mode 设为 PM 的 `inherit_and_patch`。
- **Risk:** 当 ChatGPT editorial 未在 SLA 前完成时，Daily 的零 AI 兜底会在已有高置信证据的情况下仍无法出版，直接破坏 12:00 liveness；若只修标题而不修 upcoming mode，还可能让 Daily 日历继承语义偏离正式契约。
- **Proposed resolution:** degraded period 显式三分支映射：AM=`早报｜`、PM=`晚报｜`、Daily=`日报｜`；AM/Daily=`replace`、PM=`inherit_and_patch`；未知 period fail closed，并保留 AM/PM 回归。
- **Close when:** Daily 与 legacy AM/PM 回归全部通过；exact-edition SLA 用当前 main 重跑后能成功写出 degraded Daily baseline；不改变固定窗口、schema、Scheduled Task 或正常 editorial 决策。
- **Resolution:** [PR #85](https://github.com/fallw1nd/daily-game-brief/pull/85) / merge commit `47d0840d65d2a59e26f6aebca46a9997288dc4fa` 将 archive prefix 与 upcoming mode 改为显式 period mapping，并对未知 period fail closed。
- **Verification:** PR #85 Verify run [33464922054](https://github.com/fallw1nd/daily-game-brief/actions/runs/33464922054) 通过；随后重跑同一 exact-edition SLA job，成功创建 `2026-09-01-daily` degraded Canonical baseline，之后同版授权 revision 再恢复为正常编辑版。关闭条件满足。

## MNT-20260901-03 — degraded placeholder 在正式同版 revision 后残留

- **Discovered:** 2026-09-01
- **Priority:** P1
- **Area:** publisher / same-edition revision / data quality
- **Status:** resolved
- **Evidence:** `2026-09-01-daily` 的 SLA degraded baseline 先生成了 Young Suns 的 `[自动事实清单]` 条目，并错误将文章 slug `rebuilding-better-together-for-the-1-0` 当作主体 `title_key`。随后正式 editorial revision 使用安全 overlay 语义：旧 Canonical 默认保留、只有相同 `title_key` 才替换。由于 degraded placeholder 的主体识别已错，正式 revision 无法匹配它，导致该英文摘录式 placeholder 与正式中文新闻并存到 NO.022 页面。
- **Risk:** degraded 只应是 SLA 保底状态，却可能永久穿透到正式编辑版；错误 `title_key`、`[自动事实清单]` headline、截断英文摘要和内部枚举会破坏最终版编辑一致性。若直接改成“revision 中未提到的旧条目全部删除”，又会破坏现有防误删安全语义。
- **Proposed resolution:** 普通 Canonical 仍保持 omission-preserving；只有 headline 以 `[自动事实清单]` 开头的 degraded placeholder 进入清理路径。正式 include 先按 `title_key` 匹配；若 degraded 阶段识别错主体，则允许唯一 exact primary source URL 匹配，并复用原 entry ID / verified media；未被正式 editorial 重新确认的 degraded placeholder 删除。
- **Close when:** 回归覆盖 unmatched degraded placeholder cleanup、source-URL replacement 与 stable entry/media preservation；完整 Verify 通过；NO.022 同版 revision 不改 issueNumber 或固定窗口，且生产 Canonical 不再含 `[自动事实清单]` / Young Suns 错误条目；Pages 成功部署最终修订。
- **Resolution:** [PR #87](https://github.com/fallw1nd/daily-game-brief/pull/87) / merge commit `eca8407648059b7a76f1df0fac2e7fae3a57af08` 将 degraded placeholder 与普通 Canonical 分流，增加唯一 source-URL replacement fallback，并保留普通条目的 omission-preserving 语义与已验证媒体复用。
- **Verification:** PR #87 head `4f017ec82c307ba3e2d89c3057c753836f4a7b97` 的 Verify run [33469021421](https://github.com/fallw1nd/daily-game-brief/actions/runs/33469021421) 通过；随后 exact `2026-09-01-daily` cleanup revision 由 trusted publisher 成功写回 NO.022，issueNumber 仍为 22、固定窗口仍为 `(2026-08-31 10:10, 2026-09-01 10:10]`，正式 Canonical 保留 7 条编辑新闻并移除 Young Suns degraded placeholder；最终 Pages run [33469873521](https://github.com/fallw1nd/daily-game-brief/actions/runs/33469873521) 成功。关闭条件满足。

## MNT-20260901-04 — 知名评分事件缺少原媒体直采，导致依赖二手转述

- **Discovered:** 2026-09-01
- **Priority:** P1
- **Area:** discovery / reviews / source provenance
- **Status:** resolved
- **Evidence:** `2026-09-01-daily` 漏报修订中，《鬼武者 Way of the Sword》IGN 10 分最初只能由 active 的 3DM discovery 页面进入 immutable packet；当时 `config/news-sources.json` 已有 GameSpot 直采 RSS 与 reviews capability，却没有 IGN 直采源，因此最终稿只能按 3DM 转述的 `media_report` 边界处理。新增 IGN RSS 后，read-only GitHub runner observation [33488938868](https://github.com/fallw1nd/daily-game-brief/actions/runs/33488938868) 直接取得 `Onimusha: Way of the Sword Review` 与 `The Blood of Dawnwalker Review`，两篇均带 `2026-08-31T15:00:00Z` 发布时间并处在该 Daily 窗口内；过滤前 IGN 20 条候选、unknown-time 为 0。加入仅针对 Best Buy/Amazon/deal/pre-order 的 bounded commerce filter 后，第二次 observation [33489262329](https://github.com/fallw1nd/daily-game-brief/actions/runs/33489262329) 仍成功，IGN 保留 18 条、过滤 2 条、两篇目标 Review 均保留，unknown-time 仍为 0。
- **Risk:** 若重量级评分媒体没有原站 discovery，简报会依赖中文或第三方转述是否恰好命中，既可能漏报，也会把本可直接核验的评分降成 relay/discovery provenance；同一问题会反复出现在 IGN 等媒体的高关注大作开分。
- **Proposed resolution:** 将 IGN Games RSS 以 `media + high`、`news/reviews/features/interviews` capabilities 接入，先 shadow 实测再升 active；保留 GameSpot 现有 active 直采。对 IGN feed 只过滤明确购物/促销噪音，不把普通 Review 一律误分类成 `review-score`；只有标题明确出现评分解禁/开分/聚合分等信号时使用特殊事件类型。Metacritic/OpenCritic 不以普通 HTML/RSS 源冒充“开分时间”来源：聚合分是可变状态，后续应采用 durable snapshot/change detection 的 score-surface observer 后再进入固定窗口生产链。
- **Close when:** 两次 GitHub-hosted shadow observation 均证明 IGN RSS 可用且时间稳定；bounded filter 保留目标 Review；IGN source promotion 与 filter 有回归测试；完整 `npm run check` 通过；修复合并后至少一次 read-only/production collector 以 `mode=active` 看到 IGN healthy 且能直接形成 Review candidates；不修改 Daily 固定窗口、schema、历史 Canonical 或 Scheduled Task。
- **Resolution:** [PR #98](https://github.com/fallw1nd/daily-game-brief/pull/98) / merge commit `485fc3ba0474a8a2ae98ad72879c354e484184b3` 将 `ign-games` 以 `media + high`、`news/reviews/features/interviews` capabilities 正式升为 active，保留 GameSpot 现有 active 直采，并加入 bounded commerce filter、source registry / filter 回归测试与来源策略文档；普通单篇 Review 仍按 `reviews` lane 处理，不因来源品牌自动升级为 `review-score`。Metacritic/OpenCritic 的聚合分继续明确留给后续 durable snapshot/change-detection score-surface 机制，避免用当前页面状态伪造固定窗口内的“开分时间”。
- **Verification:** shadow observation runs [33488938868](https://github.com/fallw1nd/daily-game-brief/actions/runs/33488938868) 与 [33489262329](https://github.com/fallw1nd/daily-game-brief/actions/runs/33489262329) 均成功；PR #98 最终 Verify run [33490339002](https://github.com/fallw1nd/daily-game-brief/actions/runs/33490339002) 通过完整 `npm run check` 并合并到 `main`。合并后 read-only acceptance run [33494171240](https://github.com/fallw1nd/daily-game-brief/actions/runs/33494171240) 成功：19/19 active sources healthy，`ign-games` 为 `mode:"active"` / `status:"ok"`，直接形成 `Onimusha: Way of the Sword Review` 与 `The Blood of Dawnwalker Review` 两条 `reviews` lane 候选，两者均保留 `2026-08-31T15:00:00Z` 精确发布时间并位于目标 Daily window。此次验收没有写入 automation state、packet、Canonical、public data、固定窗口、schema 或 Scheduled Task，关闭条件全部满足。

---

## 2026-09-02 append-only follow-up

### Follow-up — MNT-20260830-01

本段是既有 `MNT-20260830-01` 的追加记录，不是新问题。

- **2026-09-02 production evidence:** `2026-09-02-daily` 再次验证单一 GitHub scheduler liveness 风险：10:10 collector 与后续 SLA 均发生明显延迟，而 10:20 的长期 ChatGPT Daily 任务当时按旧 contract 先消费历史 English backlog，再检查 missing-packet wake，因此当天独立 wake 机会被历史 locale 工作占用，NO.023 最终先进入 degraded publication。该现象属于本条既有“跨调度器缺包时必须保留独立 liveness backstop”的同一根因，不另开重复 MNT。
- **2026-09-02 resolution follow-up:** [PR #100](https://github.com/fallw1nd/daily-game-brief/pull/100) / merge commit `519a06c8287a450a2121fa9c751810c969926da3` 将 Daily Scheduled Task contract 的顺序调整为 Canonical → 当前 Daily missing-packet wake → 至多一个历史 English repair，保证历史 locale backlog 不再抢占当天 liveness 机会；同时保留 GitHub 对 collection、SLA、publication、deployment 的单一恢复责任。现有长期 Scheduled Task 已同步读取当前 `main` contract，没有新增第二个 Daily task。
- **2026-09-02 close-state update:** 本条继续保持 `in_progress`。这次事故证明修复必要，但发生故障时旧顺序尚未触发 exact wake，因此仍缺“真实生产中由 10:20 backstop 写 wake → exact packet acknowledgement → exact SLA/normal publication”的关闭证据；既定连续无人干预 Daily 条件也仍需自然积累，不人为制造缺包事故。

## MNT-20260902-01 — 同版 revision 把当前 degraded edition 当作 adjacent edition

- **Discovered:** 2026-09-02
- **Priority:** P1
- **Area:** discovery / same-edition revision / adjacent deduplication
- **Status:** resolved
- **Evidence:** NO.023 先由 SLA degraded fallback 发布后，授权同版 revision 的 collector 仍用 `public/data/latest.json` 作为 adjacent edition。由于 latest 已经是 `2026-09-02-daily` 本身，collector 会把当前 degraded Canonical 中已经出现的事件当成“上一期已报道”并去重，导致《No Rest for the Wicked》等应进入正式 revision 的候选被隐藏。
- **Risk:** degraded baseline 一旦成为 latest，同版正式修订会对自己去重，造成高价值候选漏入 packet；最终版可能无法替换/清理 degraded 内容，即使上游来源和时间窗口都正确。
- **Proposed resolution:** same-edition revision 必须从 manifest 找到当前 edition 的真实前一 edition 作为 adjacent；新期仍使用 latest，历史期按 manifest 邻接关系解析。Scheduled liveness 顺序问题继续归 `MNT-20260830-01`，不与本条混合关闭条件。
- **Close when:** new/same-edition/historical/first-edition adjacency 回归通过；完整 Verify 通过；真实 `2026-09-02-daily` revision packet 的 `adjacentEdition` 为 `2026-09-01-daily`，并恢复 degraded edition 中被自去重的窗口内候选；正式 revision 成功发布且 Pages 部署成功。
- **Resolution:** [PR #100](https://github.com/fallw1nd/daily-game-brief/pull/100) / merge commit `519a06c8287a450a2121fa9c751810c969926da3` 修正 published same-edition revision 的 adjacent resolver，并加入 `scripts/adjacent-edition.test.mjs` 回归；未修改固定窗口、schema、期号或历史 archive。
- **Verification:** PR #100 合并后重新生成的 immutable packet blob `aac6bd99abf3bceaf8b4210b58071c551e1b3ed6` 明确记录 `editorialInput.adjacentEdition:"2026-09-01-daily"`，并重新包含《No Rest for the Wicked》延期、Turok: Origins 等 NO.023 正式 revision 候选。trusted publisher run [33604611326](https://github.com/fallw1nd/daily-game-brief/actions/runs/33604611326) 验证通过并以 commit `4f9ac246a4a6b5473cbc9398ab2fde462c34ed96` 写回 issue 23；媒体后续 commit `08e2eb38032ef8497699a785815c85f18b3f48a7` 成功补图，最终生产 Pages 在 locale repair 后以 main `706891f5737c78482f5615e4b2a79b86ce5cdfb9` / run [33605065664](https://github.com/fallw1nd/daily-game-brief/actions/runs/33605065664) 成功部署。关闭条件满足。

## MNT-20260902-02 — 同版 revision 英文 Overlay 未按最终稳定 Canonical ID 顺序生成

- **Discovered:** 2026-09-02
- **Priority:** P1
- **Area:** i18n / trusted publisher / same-edition revision
- **Status:** resolved
- **Evidence:** NO.023 正式 same-edition revision 中，Canonical 正确复用了 degraded baseline 的稳定 entry ID 与已有 edition 顺序；但 normal English planner 先按 editorial include/eventKey 顺序生成 Overlay。validator 因此报 `entryId/order does not match canonical entry`，中文 Canonical 正常发布而 `localeEn` 降级为 `editorial-overlay-invalid`，需要额外 locale-only repair 才恢复英文。
- **Risk:** 每次同版 revision 只要发生 stable-ID 复用或最终 Canonical 顺序与当前 editorial include 顺序不同，英文首轮都会无谓降级，产生额外 workflow、incident、Pages 部署和人工恢复负担；中文事实不受影响，但 bilingual 交付不能一次完成。
- **Proposed resolution:** normal English planner 在 eventKey → stable `entryId` 绑定后，按最终 Canonical entries 顺序重排 Overlay；未知或无法映射的 ID 仍保留给现有 validator fail closed，不能通过排序掩盖非法 draft。locale-repair 继续直接使用 Canonical ID，不改变其安全边界。
- **Close when:** 回归复现 preserved stable IDs 与 editorial include 顺序不同的 same-edition revision 并首轮生成 valid Overlay；完整 Verify 通过；修复合并；下一次真实同版 revision 在 normal publisher 首轮直接得到 `localeEn=available`，无需单独 locale-repair。不得为验收人为修改已完成的 NO.023。
- **Resolution:** [PR #102](https://github.com/fallw1nd/daily-game-brief/pull/102) / squash merge commit `c3b2d9219ae13db53d51390aae9a8626f57a034f` 已将 `buildEnglishOverlay()` 的 eventKey 草稿在 stable ID 解析后按最终 Canonical 顺序排序，并新增 `scripts/bilingual-revision-order.test.mjs`；不修改 Canonical、固定窗口、期号、schema、Scheduled Task 或生产数据。
- **Verification:** PR #102 head `b64055904597716569d4edb41fef395196df48cd` 的 Verify run [33605873758](https://github.com/fallw1nd/daily-game-brief/actions/runs/33605873758) 完整通过 `Validate, test, and build`。本次 NO.023 的实际英文已在修复合并前通过 locale-only trusted repair 恢复：main `706891f5737c78482f5615e4b2a79b86ce5cdfb9`、durable `localeEn.status:"available"`、最终 Pages run [33605065664](https://github.com/fallw1nd/daily-game-brief/actions/runs/33605065664) 成功。由于这条生产修复走的是 locale-repair 而非 PR #102 修改后的 normal revision path，最后一个生产关闭条件尚未满足，本条保持 `in_progress`。
- **2026-09-03 production close verification:** `2026-09-03-daily` 是 PR #102 合并后的下一次真实 same-edition revision。normal trusted publisher run [33738320922](https://github.com/fallw1nd/daily-game-brief/actions/runs/33738320922) 在首轮完成 evidence validation、build、atomic publication 与 Canonical/locale acknowledgement；`Acknowledge repaired English locale` 与 degraded-English incident 步骤均未运行，durable state 直接记录 `localeEn.status:"available"`。最终 production state 保持 `editorial:"valid"`、`publication:"committed"`、`localeEn:"available"`，无需 locale-only repair，满足本条最后一个生产关闭条件。

---

## 2026-09-03 append-only follow-up

### Follow-up — MNT-20260830-01

本段是既有 `MNT-20260830-01` 的追加记录，不是新问题。

- **2026-09-03 production evidence:** 10:20 长期 ChatGPT Daily 任务在北京时间约10:24正常执行并成功写入 exact `automation/wake/2026-09-03-daily.json`；GitHub 随后于10:26将 `2026-09-03-daily` packet 持久化为 ready。但当时 contract 要求 wake invocation 提交后立即停止，且同一长期任务当天没有第二次运行机会，因此 ready packet 一直没有 Canonical submission，11:00 旧 SLA 将其标为 `timed_out` 并发布 degraded NO.024。这证明“wake 成功”本身不足以保证 SLA 前完成编辑，仍需要独立的后续 editor pass。
- **2026-09-03 resolution follow-up:** [PR #103](https://github.com/fallw1nd/daily-game-brief/pull/103) 先建立 one-task second-pass contract；ChatGPT Tasks 平台随后明确拒绝同一任务10:20/10:32的一小时内双运行，因此最终 production commit [`d155f0b`](https://github.com/fallw1nd/daily-game-brief/commit/d155f0b24c2619449f2ed5c28622a1adb02a5c32) 将唯一长期任务改为10:20与11:20两个 exact invocation，并把 GitHub 11:00 watchdog 限定为 packet/recovery preflight、真正 degraded fallback 延后至11:40。实际 task `6a86ccc265fc8191a6c72a6bab1cdcea` 已原地更新，仍为唯一启用 Daily task；未创建第二个长期任务。
- **2026-09-03 close-state update:** 本条继续保持 `in_progress`。9月3日事故提供了“10:20 wake → exact packet acknowledgement”的真实证据，但新10:20/11:20结构是在事故后上线，尚缺一次自然生产中“10:20需要 wake → GitHub packet ready → 11:20 safety pass 正常提交 → 11:40前 normal publisher 接管”的闭环，以及既定连续无人干预 Daily 证据；不人为制造缺包事故来凑关闭条件。

### Follow-up — MNT-20260828-05

本段是既有 `MNT-20260828-05` 的追加记录，不是新问题。

- **2026-09-03 recurrence:** NO.024 从 degraded baseline 正式 same-edition revision 后，`Another Eden Begins` 正文已变为正常中文编辑稿，但 publisher 复用已验证图片时原样复制 degraded 阶段自动生成的 alt，导致 alt 仍含 `[自动事实清单]`。这说明 PR #37 只覆盖 title backfill，尚未覆盖 same-edition revision 的 verified-media reuse 路径。
- **2026-09-03 resolution follow-up:** [PR #105](https://github.com/fallw1nd/daily-game-brief/pull/105) / merge commit `d86ebb10041b6e55ce7e0e26b8cb09da36669c6f` 扩展媒体复用逻辑：只有旧 alt 精确等于旧 entry 的 deterministic generated editorial alt 时，才按新 title/headline 重建；manual/source-authored alt 保持不变。回归覆盖 degraded source-URL replacement 与 manual alt preservation；同时只修正 NO.024 latest/archive 的这一处 accessibility alt，不改变事实、期号、窗口、来源、图片二进制或英文 Overlay。one-shot bounded run [33741973599](https://github.com/fallw1nd/daily-game-brief/actions/runs/33741973599) 与标准 PR Verify run [33742315538](https://github.com/fallw1nd/daily-game-brief/actions/runs/33742315538) 均通过完整 `npm run check`，Pages run [33742426044](https://github.com/fallw1nd/daily-game-brief/actions/runs/33742426044) 成功；NO.024 latest/archive 当前为同一 blob，修正后的 alt 已与正式 headline 同步。
- **2026-09-03 close-state update:** 本条仍保持 `in_progress`。新的 same-edition revision 防复发与 NO.024 当前数据已经修正，但原 Close when 还要求已知 `2026-08-28-am` Gravhounds 历史 stale alt 被安全修正；本次授权范围是今天的生产事故，不顺带修改该历史 archive。

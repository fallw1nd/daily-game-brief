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
- **Resolution:** [PR #29](https://github.com/fallw1nd/daily-game-brief/pull/29) / commit [`855f7b7`](https://github.com/fallw1nd/daily-game-brief/commit/855f7b7b335948077f86231724a58a181b4d3885) 先为 schedule/SLA 路径增加统一 `latestDueWindow(period, now)`；2026-08-29 生产复发证明 manual recovery 的 exact-edition 部分并未完成，因此本条重新打开。[PR #40](https://github.com/fallw1nd/daily-game-brief/pull/40) / commit [`3e880a4`](https://github.com/fallw1nd/daily-game-brief/commit/3e880a40cf9ca2482c9880b880abcba840fbdeaa) 补齐 manual/recovery 路径：`workflow_dispatch` 可接收 exact `edition`，新 recovery 契约要求同时传 `period + edition`；旧 period-only 调用只锁定 runner 当天同 period 的计划 edition，截止前五分钟内等待到 cutoff，更早则 fail closed。正常 schedule 仍使用 `latestDueWindow()`。未修改固定 cron、Scheduled Task 配置、生产数据或 schema。
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

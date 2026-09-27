# 二次发布（Secondary Publication）

“二次发布”是一次**人工复查 + 同期修订 + 译名补全 + 内容回填 + 发布验收**的完整维护行为，不是重新生成一期日报，也不是放宽事实窗口。

当用户明确说“二次发布”时，视为授权执行本文件的全部步骤，包括对符合条件的已发布 Daily 做同一期 revision、修复缺失/降级稿、补充译名并运行历史 title backfill。该授权**不**允许改变原 issueNumber、fixed window、期次 ID，不能把窗口外事实塞回旧期，也不能绕过 trusted publisher/state/validator。

## 1. 先审计生产状态

1. 重新读取最新 `main`、根 `AGENTS.md` 和本文件；聊天历史不作为仓库事实。
2. 检查最近 4 个 Daily 的 `manifest/latest/archive` 与 `automation/status`；同时继续向前检查任何仍为以下状态的旧期：
   - ready `editorial_continuation` / `showcase_completion`；
   - Canonical 缺失且 publication failed；
   - `[自动事实清单]` 等 degraded Canonical；
   - English/media/deployment 未完成或状态与 `main` 不一致。
3. 形成逐期表：原窗口、issueNumber、Canonical 状态、packet SHA、待处理 continuation/revision、locale/media/deployment。

处理顺序：**最旧未完成内容 → 缺失正式稿 → degraded 正式化 → 译名补全 → English/media/Pages 验收**。

## 2. 内容回填

### A. 已有 continuation/showcase

消费 durable state 已授权的精确 packet。新闻只能来自该 packet 的原始 fixed window；保留已发布正文、标题、头条、issue/window 与日历基线。`requires_subject_identity` 不得从标题猜主体。

### B. 已发布 degraded 期次

写入 `user_authorized_same_edition_revision` wake，等待 GitHub 重新确认同一期 immutable packet，再提交正式编辑稿。revision 是 overlay：保留未被本次新决定替换的既有条目、媒体、日历和稳定 entry ID。

### C. Canonical 缺失且自动 fallback 已失败

`user_authorized_failed_publication_recovery` 只用于 state 明确为 `editorial:timed_out` + `publication:failed`、目标 Canonical 仍缺失，且 **尚未发布任何日期更晚的 Canonical edition** 的情况。此时仍使用原 packet/window，不能通过新抓取事实“补造”旧期。

如果目标缺刊之后已经发布了更新期次，则直接恢复会重新分配 issueNumber 或把 `manifest.latest/latest.json` 回退到旧日期，属于生产身份破坏；“二次发布”必须把它标成 blocker，不能强行补成功，也不能重排已经公开的后续 issueNumber。只有另行设计并授权历史缺刊插入/编号迁移方案后才能处理。

### D. 编辑门槛

沿用 `AGENTS.md`：一手可 `official`，单一可信媒体可做有界 `media_report`，明确转述官方可 `media_relay_official`，只有 `multi_source_verified` 必须两家独立可靠来源。`needs_review` 只用于实质阻塞。

没有新打开证据的 tracking reminder 不应挤占新候选预算。二次发布默认 `trackingPolicy:"close_stale"`：以 packet finalization 为基准，连续 **72 小时**无新 `lastSeenAt` 证据的 reminder 关闭跟踪；不足 72 小时的保持 `needs_review + tracking=true`。关闭不等于永久排除，后续出现新证据仍可重新进入发现流程。

## 3. 译名补全

1. 扫描本轮相关 Daily、当前未来 15 天日历和待回填条目中 `title_zh_status:"unavailable"` 的游戏。
2. 依次查：用户指定名 → 已有 registry → 官方简中页面/商店 → 两个独立可靠中文来源形成稳定常用译名。
3. 官方简中记 `official_simplified`；稳定常用译名记 `common_translation`；找不到可靠中文名则保持原文，不机翻。
4. 名称研究只用于名字/术语，不得给旧 packet 增加事件事实、日期、平台或来源等级。
5. 通过 `kind:"title_backfill"` 的 secondary request 合入 `config/title-translations.json`；已存在且冲突的 registry 决定必须报错，不能静默覆盖。
6. 运行 `npm run titles:backfill`：只填补原本 unavailable 的匹配项，并同步相关 headline/summary/archiveTitle、generated image alt、latest 与 manifest；随后完整 `npm run check`。

## 4. Secondary request 入口

人工二次发布使用临时分支 `automation/secondary/<request-id>` 和同名 `automation/secondary/<request-id>.json`。

### edition request

- `kind:"edition"`；
- `editionId` 与分支/request ID 相同；
- 必须绑定 durable state 当前 `packet.blobSha`；
- compact request 只手工决定 `editorialInput.packages`；workflow 按上述 72 小时规则确定 `trackingQueue` 的 carry/close，再用正常 validator 校验完整输出；
- workflow 将通过校验的完整 inbox 写入 `automation/editorial/<edition-id>`，随后 dispatch trusted publisher；
- failed-publication recovery 只有显式 `recoverFailedPublication:true`、state 为 `timed_out + failed`、Canonical 缺失且没有更晚 edition 已发布时可用；workflow 会硬性拒绝历史缺刊直接恢复。

### title_backfill request

- `kind:"title_backfill"`；
- 每个新增 registry 项必须携带 `titleZhCn`、`titleZhStatus`、英文 aliases（如有）和证据；
- workflow 合并 registry、执行 `titles:backfill`、完整 `npm run check`，再提交 `main`；主分支 push 触发正常 Pages 部署。

该 workflow 不是长期定时任务，只响应显式的人工 secondary request。

## 5. 验收与停止条件

每一期必须确认：

- archive 存在且保持原 edition ID / issueNumber / fixed window；
- 正式 revision 不再错误显示 `[自动事实清单]`；
- state 的 editorial/publication/deployment 与 `main` 一致；
- English 缺失时明确记录 unavailable 或完成 repair，不伪装 bilingual；
- media available 或有具体 unavailable reason；
- `manifest/latest/search/locale` 与 archive 一致；
- publisher、`npm run check`、Pages 均成功。

若 packet 身份、revision 授权、主体身份、窗口归属、历史缺刊编号安全或 registry 冲突无法证明，停止该项并报告 blocker；不得绕过安全边界。

## 6. 完成报告

每次“二次发布”结束都汇总：

- 检查了哪些期次及原状态；
- 回填了哪些新闻、排除了哪些高价值候选及原因；
- 新增/复用哪些中文译名及证据等级；
- 关闭/保留多少 tracking；
- 修复了哪些 degraded/missing/locale/media 状态；
- 最终 main commit、publisher/Verify/Pages 结果；
- 仍存在的 blocker。

# 优化收尾与维护记录（2026-09-19）

本次范围是发布可靠性与有界补充队列。已合并生产基线 69ba3b4（9 月 19 日日报、用户译名、日历修复）；不改 UI、历史内容或每日两次编辑频率。发布审查与部署证据集中记录在 [PR #133](https://github.com/fallw1nd/daily-game-brief/pull/133) 及其 Actions；维护时先核对 PR 的最终合并和部署状态。

## 已完成修改

- 普通新闻补充包进入持久队列，使用独立 continuation 授权、精确事件身份和原期窗口。新一期及缺包唤醒优先；SLA 按跨日期队列扫描，单次最多激活一包、刷新一包。
- 初次日报交接可携带下一批普通新闻，最多两包串行发布。只有计划与当前状态一致，且 main 和目标编辑分支都含 bundle workflow 时才使用；旧分支、缺失/过期计划和后续补充继续单 inbox。没有实现后续双队列计划自动更新，不承诺每日四包吞吐。
- 每包独立确认发布结果，失败保留未消费包；已提交 main 但未确认 state 可以恢复，部分提交也触发部署。反馈最多三次重新读取最新 state 后提交；重放保留后来的同一期人工决策。
- 同一游戏不再等同于同一新闻：复用旧 entry 必须满足事实摘要和事件身份，旧数据缺事件身份时还需正文完全匹配。
- 编辑提交与数据校验共用期标题 8–40 Unicode 字符规则；发布器再次检查主语/译名规范化后的标题。构建失败也记录 publication-failed，避免停在 valid/pending 却没有失败信息。
- 编辑输入上限仍为每包 120,000 字符、两包 240,000；完整 JSON 与编辑响应的传输上限分别为 240,000/480,000。字符限制不是实测 token 或费用节省。

## 验证

- 最终功能提交 e699781；最终 npm run check：83 个测试文件、419 项测试通过；40 期归档和英文校验通过，40/40 英文可用，生产构建成功。
- 同游戏不同事实、人工反馈重放、超长标题、构建失败状态、补充队列与预算边界有回归覆盖。
- editorial-feedback-conflict-smoke：注入三次 push 冲突后保留 pending；恢复成功，六个并发文件及已有账本记录全部保留。
- editorial-bundle-smoke：使用临时 bare remote 与真实 publisher/check，覆盖正常双包、重复执行、第二包失败、main/state 确认失败、跨期拒绝。完整演练通过（重复发布不改数据、同一期人工反馈保留、第二包修复、确认恢复和跨期拒绝）。演练随后发现确认恢复缺少反馈时间，e699781 改为保留原校验时间并持久化；其针对性复验结果记录在 PR #133。
- 本地日志位于 artifacts/closeout-final-check.log、closeout-feedback-smoke.log、closeout-bundle-smoke.log、closeout-ack-final-smoke.log（不提交生成日志）。此前 9 月 13 日验收只适用于旧提交 96b2827，不能代替本轮验证。

## 恢复步骤

1. 从 automation/state 的 status、queue 和 packet SHA 判断阻塞属于哪个期次；不要改写已确认的证据身份。
2. invalid：按 validationErrors 修正原包。构建或发布失败：查看对应 Actions 日志，修复根因后使用现有 exact-edition publisher workflow_dispatch；不要以手写状态跳过校验。
3. bundle 部分成功或反馈待恢复：对同一期运行 publish-editorial-bundle.yml 的 workflow_dispatch。它重查已提交记录，只恢复剩余步骤；不得用新窗口事实补旧期。
4. 旧编辑分支没有新 workflow、计划已过期或只有补充包：提交单 automation/inbox/<edition-id>.json。不能仅因为 main 已有 workflow 就认为旧分支 push 会触发它。
5. 修改代码后运行 npm run check；涉及串行发布/反馈事务时运行上述隔离演练。临时仓库只指向本地 bare remote，不需生产 API 密钥。

## 仍未达到的整体验收

Nintendo Direct/State of Play 独立全场清单与日美欧并集 100% 对账、真实译名正向采用、实际 provider token/费用下降，以及连续自然期次的两次调用吞吐仍未验收。旧有限容量模拟依赖“第二次可处理两包”，本次不提供该能力，因此不能据此承诺积压消退。保留相关维护项开放。

9 月 16 日 formal archive 已由生产 acaf72d 补回，本轮不重复改写该期。最初失败证据仍见 Actions 35051724442；这次修复针对同类问题的预防及失败状态可见性。

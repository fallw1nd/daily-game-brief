# 2026-10-15 日报复查与二次发布

审计基线：main `acdf6567`，durable state 来自 `origin/automation/state`。重点检查 10 月 12—15 日（第 63—66 期），向前扫描全部 Daily 的未完成状态。逐期原始状态、窗口、issueNumber、packet SHA 与英文错误保存在本轮本地 `artifacts/second-publish-20261015/audit.json`。

## 已确认的问题

- 10 月 10—15 日英文不可用。共同原因是日历使用的英国、未限定及五种平台发售标签未进入英文词典，导致已有英文正文被整期拒绝。10 月 13 日另有英文 releaseTypeLabel 仍直接使用中文；须通过 locale-repair 提交翻译后的表达。
- 10 月 15 日 news continuation 仍 pending，当前 ready packet 为 `cbfa42fcf4f0549964a9276cc71c5c05b6b962cd`。其中战争机器模组报道主体明确；另外五条标为 requires_subject_identity，不能从标题自行补定规范主体。
- 10 月 6、7 日 calendar continuation 仍 open，各有 28、33 个固定 SHA 工作页。两期中文正文已经存在；pending publication 表示后续批次尚未完成，不是缺刊。
- 10 月 14、15 日归档标题仅主体和日期，未概括主要事实。后续需通过精确原 packet 的授权 revision 修订，不能直接编辑 archive/manifest。
- 部分较早 Daily 的 deployment 仍 pending/failed，不能仅凭新首页已上线把旧期状态改成 deployed；需要受信 exact-edition 部署回执。
- 近期缺失译名中，RimWorld 和 Risk of Rain 2 可从 Steam 简中产品页确认《边缘世界》《雨中冒险 2》；名称证据仅用于译名。

## 修复与验收

补齐确定性日历英文词典，并增加从实际英文 repair builder 到完整 overlay 校验的回归测试。英文恢复、新闻回填、译名补全分别走既有 locale inbox、secondary edition request 和 secondary title_backfill request。保留原期次、窗口、编号与已发布内容。

发布回执和未完成项在本次操作完成后追加。

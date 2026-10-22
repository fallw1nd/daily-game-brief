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

发布回执和未完成项见下。

## 执行结果（2026-10-15）

| 期次 | 编号 | 原始北京时间窗口 | 原状态/问题 | 本轮结果 |
| --- | --- | --- | --- | --- |
| 2026-10-12-daily | 63 | (10-11 10:10, 10-12 10:10] | 中文7条，英文日历标签校验失败 | 恢复英文；中文7条保留 |
| 2026-10-13-daily | 64 | (10-12 10:10, 10-13 10:10] | 中文14条，英文缺失；多个releaseTypeLabel仍是中文 | 恢复英文，补齐标签；归档标题中的RimWorld补为边缘世界 |
| 2026-10-14-daily | 65 | (10-13 10:10, 10-14 10:10] | 中文6条，英文失败；归档标题仅主体与日期 | 精确原packet b2e57183b7573e80e40e5aa6ae68e2598ed74795修订为“日报｜《绝地潜兵2》新战争债券10月20日上线”，中文6条和英文均保留 |
| 2026-10-15-daily | 66 | (10-14 10:10, 10-15 10:10] | 中文8条，news continuation pending；英文日历标签失败 | 通过secondary request追加1条Incursion模组新闻，共9条，恢复含增量的完整英文 |

- 最近4期issueNumber、edition ID与原始窗口经修订前后比对不变；保留原8条新闻的稳定ID，新增条目为2026-10-15-daily-news-5。
- October 15 news packet六条候选中收录1条，另五条因requires_subject_identity排除：塞尔达时之笛重制版变化、GTA IV回顾、GTA VI泄漏及开发周期报道、Jiaohun预告。未从标题猜测规范主体，也未将这些事件写入Canonical。其eventKey保存在secondary request。
- October 14原packet按close_stale和packet finalization时间基准关闭6条陈旧tracking，保留20条；包内6条include、9条exclude、11条needs_review沿用原稿边界。October 15 news continuation无tracking reminder。
- 新增两个official_simplified译名：边缘世界（RimWorld）、雨中冒险 2（Risk of Rain 2）。证据为本次打开的Steam简中产品页；受信titles:backfill更新12期归档以及latest/manifest，只填补原unavailable名称并同步文案/图片alt，没有新增事件事实。
- 最近4期共36条新闻全部有图。日历仍有39个封面显式unavailable，分别11/9/10/9个；未用不匹配图片替代。
- 根因代码修复c4601c10，本地完整check通过105文件/585测试；各受信publisher及title-backfill再次执行完整check。
- 本轮内容/媒体部署验收基线：main ee275f7dac2c0fc0516fd22a1cb2d2e63d6f7223。

### 云端证据

- October 15 secondary request：[38672541482](https://github.com/fallw1nd/daily-game-brief/actions/runs/38672541482)；trusted publisher：[38672567112](https://github.com/fallw1nd/daily-game-brief/actions/runs/38672567112)，均success。
- 译名backfill：[38672565488](https://github.com/fallw1nd/daily-game-brief/actions/runs/38672565488)，在并发main推进导致两次安全拒绝后，第三次success。
- English repair：[Oct12 38672441854](https://github.com/fallw1nd/daily-game-brief/actions/runs/38672441854)、[Oct13 38672851095](https://github.com/fallw1nd/daily-game-brief/actions/runs/38672851095)、[Oct14 38673501664](https://github.com/fallw1nd/daily-game-brief/actions/runs/38673501664)、[Oct15 38693583470](https://github.com/fallw1nd/daily-game-brief/actions/runs/38693583470)，均success。
- October 14原packet授权：[38673135866](https://github.com/fallw1nd/daily-game-brief/actions/runs/38673135866)；secondary request：[38693856537](https://github.com/fallw1nd/daily-game-brief/actions/runs/38693856537)；publisher：[38693894141](https://github.com/fallw1nd/daily-game-brief/actions/runs/38693894141)，均success。
- 最终内容Pages：[38694226240](https://github.com/fallw1nd/daily-game-brief/actions/runs/38694226240)，success。线上latest确认2026-10-15-daily/NO.66/9条/包含新增eventKey f67e05dbcca64f2d0868；最近四期archive与English文件均存在。
- 本轮直接main/受信分支发布，无PR，因此没有独立Verify PR运行；完整检查证据来自本地和publisher/Pages，不能将缺失的Verify运行写成成功。

### 尚未完成

1. October 6/7历史calendar continuation仍open（28/33个固定SHA工作页）；October 15新闻回填完成后激活23页calendar continuation，October 14正式修订后也再次激活原29页calendar continuation。页面含已打开、仅月份日期、跨平台日期差异、截断和未抓取证据，当前未证明全量复核完成。不得把partial直接改成reviewed。
2. October 15归档标题仍为“日报｜《火焰纹章：万缕千丝》：2026年10月15日”。当前open calendar continuation使新的same-edition revision不能抢占；标题问题保留，不直接编辑archive/manifest绕过。
3. 早期English不可用期次：09-04/05/06/07/08/09/15/16/20、10-10/11。现有分支不能为部分旧期提供覆盖全部Canonical条目的完整英文草稿；10-11还存在sourceIndex/来源标签错误。没有将自动生成标题、缺条目草稿或宽松校验冒充恢复。
4. 较早deployment pending/failed回执仍有历史遗留。线上文件存在和最新Pages成功不等同于已补齐每期exact-edition回执。
5. 运行中观察到共享发布队列会取消尚未启动的请求、title-backfill推送会因并发main推进而失败，以及采集workflow的SLA等待会占用人工revision队列。本轮用顺序提交和安全重试完成已执行项，未修改编排规则。曾尝试取消已完成采集的等待运行，但自动审批拒绝，实际未执行；该运行随后自然完成。

以上未完成项保留为问题记录，本轮不声明所有历史欠项或全局日历完整性已解决。

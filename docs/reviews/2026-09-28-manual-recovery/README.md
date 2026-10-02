# 2026-09-28 人工补刊审阅稿与历史插入方案

本次是人工聊天执行，验证分支读取修复并完成原包编辑稿；不是 Scheduled Task 自然调度恢复证明。未提交生产 inbox、secondary request、wake，未 dispatch publisher，未修改任务、调度、状态、窗口、公开编号、public schema、已有 archive 或 latest。

## 读取与身份

- 最新 main：`03e786481eace94ec153b0d7bddf778ecf5d3fe8`。从 ref=`main` 读取 AGENTS.md、docs/SCHEDULED_TASK_PROMPT.md、docs/SECOND_PUBLISH.md；另读取 AUTOMATION_ARCHITECTURE.md 和实际 validator/publisher 实现。
- 状态：path=`automation/status/2026-09-28-daily.json`，显式 ref=`automation/state`，成功；状态文件 blob=`5c572a5db07c553a45a32b99d4b27c8455b82bd8`。该分支当时 HEAD=`0fa6cdc1edec0e02ad94872f93b671c83575ff8b`。
- state 的 packet.status=`ready`，editorial=`timed_out`，publication=`failed`，revision=7；错误为 `SLA degraded publisher failed`。
- 直接调用 GitHub fetch_blob，以 state 中精确 SHA 读取不可变 packet：`e409438ca5d33aa86236898ecff1bf3fe425b63a`。本地 `git hash-object packet.json` 复核完全一致，未采用 branch-relative packet。
- packet v3，mode=`chatgpt-handoff`，editorialInput v2；窗口 `(2026-09-27 10:10, 2026-09-28 10:10]`，Asia/Shanghai。coverageThrough=`2026-09-28 10:10`；finalizedAt=`2026-09-28T08:38:42.565Z`，晚于 cutoff。

## 编辑稿

`editorial.json` 为完整 contractVersion=2 输出：30 个 packages 与 1 个 tracking 均恰好一个决定；include=7、exclude=10、needs_review=14（含1个原有跟踪）。附与全部7条收录对应的完整英文稿、sharedFactFrame 和来源索引。

拟收录：Seikyu: Let's Go! 公告、Sakura Wars 三十周年怀表、网球王子两作DLC宣传片、World's Edge裁员新增披露、鬼武者时代剧/战斗体验分析、日本PS5 Pro购买申请、Build A Rocket Boy管理程序产业报道。文章时间与实际事件日期分开表述；不把管理程序等同清算，不采用抓取正文无法支持的取消项目说法或完整购买资格条件。

不新增原packet之外的事件事实。原包未提供可靠中文译名的主体保留原文/unavailable；鬼武者名称复用main registry。日历不提交新增或删除，明确记录本轮未完成历史15天日历重新研究；inherit_and_patch继续由受信publisher处理，不宣称全量覆盖。原有跟踪距packet finalization不足72小时，保留，不重复发新闻。

## 实际校验

- `npm run brief:validate-submission`，环境中 branch身份=`automation/editorial/2026-09-28-daily`（仅validator参数，未创建该生产分支）；精确packet和完整editorial输入：通过，`validation.json` valid=true/errors=[]。
- `validateEnglishEditorialLocale`：通过，`english-validation.json` valid=true/errors=[]。
- 最新main checkout执行 `npm run check`：退出0；98个测试文件、554项测试通过；50期Canonical及英文基础设施校验通过；TypeScript与生产build通过。详见 `check.log`。
- 首次完整check因依赖目录缺少tsc而失败，`npm ci --prefer-offline`安装155个包后重跑全部通过；不是跳过check。首轮稿件validator指出英文regionLabel/releaseTypeLabel/sourceLabels缺失，已补全后重跑通过。
- 对现有secondary workflow中的恢复前置条件作只读求值：ready、timed_out、failed、目标缺刊均成立，但已有更晚Canonical：9月29日#48、9月30日#49、10月1日#50。因此 direct recovery 禁止，详见 `recovery-gate.json`。没有为了制造失败记录而启动生产workflow。

## 历史插入的具体方案（提案，未实现/未授权发布）

9月27日已是#47、9月29日已是#48。当前public schema要求正整数issueNumber；47与48之间没有可用整数。既保留后续公开编号，又要求日期顺序连续编号，在现契约下不能同时成立；不得重排#48—#50或偷偷占用已有号。

可采用“历史日期、补刊时新编号”的受信插入方式：新增期保持id与原窗口，publisher在事务内分配执行时下一个未使用编号（当前快照是#51，仅为示例，不在稿件写死）；已发布编号和已有archive保持逐字不变。新编号按实际发布顺序排入manifest，页面按日期展示，latest依然是时间上最新的10月1日或执行时更新期次。该方式不更改public字段/类型，但需要显式授权新的历史补刊编号语义和代码修改。

所需变更：

1. 在现有人工secondary入口新增显式历史插入授权模式，绑定editionId、原packet SHA、审阅稿digest和审批时main SHA；只接受Canonical缺失、timed_out+failed、已有更晚期次的特定缺刊。保持现有普通failed recovery gate，不能给一般请求开口子。
2. 由GitHub受信state/publisher处理新模式；不要人工改state。对packet身份、窗口、原证据和完整稿继续运行正常submission validator；重读当前main检查并发进展，在事务内分配唯一新编号，幂等重试保留首次分配值。
3. 修改 `scripts/lib/edition-publisher.mjs` 及 `scripts/publish-editorial-decision.mjs` 的显式授权路径：只新增目标archive与其manifest记录，不回写latest，不用目标缺失时的普通新期发布路径；使用原packet适用的历史日历基线，禁止当前日历误回填到旧窗口。
4. 修改 `scripts/validate-data.mjs` 中“latest必须是manifest最后一项”规则：仍严格校验编号唯一与发布顺序连续，但latest须指向日期/窗口最新的Canonical，并与其archive逐字一致。另检查所有last-item/reverse/issueNumber隐式代表时间顺序的使用点：ReadingApp、其他归档与上下期导航、搜索/locale索引、reading-calendar、SLA/调度/恢复选择。显式按日期窗口排序或按manifest.latest解析，避免#51旧日期误成新期或日历基线。
5. 对新增路径验证：已有archive/公开编号哈希不变、latest哈希不变、窗口不变、只插入一次、并发新期不会占号、重放幂等、未授权插入拒绝、普通恢复拒绝不受影响、中英/媒体索引正确。完整 `npm run check` 后由trusted publisher原子提交main，正常Pages与exact-edition媒体/状态验收。

如果坚持“编号必须按原日期连续递增”，则需要迁移9月29日及后续公开编号，与本次明确约束冲突，本方案不采用。当前只完成可审阅补刊稿，缺刊公开发布尚未完成。

## 文件

packet.json（原字节）、state.json、editorial.json、validation.json、english-validation.json、recovery-gate.json、check.log、draft.md。所有文件仅在独立审阅分支；不位于任何自动提交/发布入口路径。

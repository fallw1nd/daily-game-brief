# 阅读样例方案与验收

当前状态：ReadingApp 已于 2026-09-08 成为默认首页，经典版使用 `?view=classic`。下文保留最初样例方案与历次验收记录；“未上线”等表述仅描述对应历史阶段。

本版是面向日常扫读的独立视觉样例，依据 2026-09-07 的审阅建议实现，不以既有 DESIGN.md 为视觉限制。真实编辑数据、证据状态、媒体来源、期号和历史窗口不变。

## 查看方式

在本工作目录运行 `npm run dev -- --host 127.0.0.1 --port 5180 --strictPort`。

- 新样例：`http://127.0.0.1:5180/daily-game-brief/?view=reading`
- 现有版本：`http://127.0.0.1:5180/daily-game-brief/`
- 英文：样例右上角 EN，继续使用已校验英文 Overlay。
- 历史日历：`http://127.0.0.1:5180/daily-game-brief/?view=reading&edition=2026-08-21-pm#upcoming`

## 具体设计取舍

| 区域 | 当前问题 | 样例方案 | 验收结果目标 |
| --- | --- | --- | --- |
| 页头 | 工具与生产信息占据阅读入口 | 保留品牌、主导航；日期/期号合并成一行；配色收进阅读设置 | 手机始终能找到内容、归档与明暗切换 |
| 头条 | H1 与重点首条可能不是同一事件 | 使用 leadEntryId；H1、摘要和主图组成唯一头条；完整原新闻标题保留在核验详情 | 9月7日以 DON’T NOD 为唯一视觉头条 |
| 正文 | 同一新闻在重点区和栏目重复；标签先于事件 | 头条从后续列表移除；其他新闻仅有简短状态、标题、摘要、来源；核验展开 | 每条完整 article 只出现一次，所有原 entry 锚点保留 |
| 栏目 | 字号、边框、装饰同时争夺注意力 | 24px 栏目、22px 桌面新闻标题、16px 正文；统一细分隔线和缩略图 | 层级主要由字体、间距和内容构成 |
| 手机 | 序号列与操作列挤压标题 | 正文满宽；标题21px、行高1.5；归档日期/期号在第一行，完整标题在第二行 | 390px 和320px不出现页面级横向滚动 |
| 图片 | 多重相框、奇偶错位；缺图占位过大 | 头条16:9；普通图统一对齐；缺图改为文字布局；封面保持比例且无可见来源说明 | 信息优先于装饰，真实 alt/来源保留 |
| 证据 | 时间说明与译名状态增加扫描负担 | 状态、传闻和时间不确定性直接可见；完整来源、译名状态、核验说明展开 | 不以视觉简化掩盖证据边界 |
| 归档 | 日期在手机被隐藏；全文标题空间不足 | 手机两行式条目；整行可点击；实时跨期检索与源锚点 | 日期不隐藏，搜索能打开对应历史新闻 |
| 日历 | 需与新闻不同的浏览节奏 | 日期、封面与游戏信息组成紧凑列表 | 用有日历的历史期次检查，不为今天虚构作品 |
| 本期说明 | 跨日窗口显示成10:10-10:10 | 显示完整起止日期、时区；生产信息和检索记录按需展开 | Daily、AM/PM、跨月均明确 |

## 视觉参数

- 方向：新闻出版物，暖白纸面与深灰文字；设计变化6/10，动效2/10，信息密度4/10。
- 宽度：桌面上限1240px；主新闻流与260px速览侧栏；880px以下隐藏重复的侧栏索引，改用栏目快捷链接。
- 字体：优先使用平台中文无衬线字体，避免以英文 webfont 决定中文阅读效果；不新增远程字体依赖。
- 头条：桌面32–44px，手机28–31px；多行中文行高1.25–1.33。
- 主题：独立浅色/深色语义变量；保留橙、蓝、绿、紫、玫红五种强调色与本地持久化。
- 动效：头条220ms小幅进入、链接与展开反馈；reduced motion 下关闭。

## 实现与发布范围

入口由 `view=reading` 选择，原站默认入口保留；样例组件懒加载。两种语言共用布局，英文沿用现有 digest/顺序/字段映射校验。未修改 public/data、schema、生产 Actions 或定时任务；未发布生产。

对应已发现的问题为 MNT-20260907-03（指定头条）和 MNT-20260907-04（跨日窗口）。本地样例修正不等于生产问题已关闭。

## 验证

自动验证覆盖：指定头条不在首位、唯一正文与锚点、跨日/跨月/legacy窗口、可见不确定性、缺图/空栏目、历史日历、主题/配色持久化、核验展开、跨期搜索与中英文共享结构。最终 `npm run check` 通过：64个测试文件、315项测试（含13项样例行为测试）、28期数据与英文校验、生产构建。既有8月26日晚报 discoveryQueries 警告未改动。

本地预览HTML、样例模块和最新数据端点均HTTP 200。两主题与五强调色的文本色值在页面/次级背景上最低对比度分别为4.62:1和6.68:1；这是色值检查，不是完整无障碍验收。完整检查前临时将一个现有工作流恢复LF以避开已确认的CRLF字符串测试问题，检查后已恢复原有本地格式。

浏览器实屏验收未执行：仓库禁止 Windows 浏览器沙箱，当前浏览器工具也无法启动。类型、DOM交互测试、数据校验、构建与CSS色值检查不能替代截图或真实浏览器测量。

请在打开的样例中核对：

- 桌面1440/1280、820、390、320px；两种语言和主题；五种强调色。
- 头条主题一致，标题/摘要没有截断或遮挡；200%文字和400%缩放可读。
- Tab可见焦点；Enter展开核验；Esc关闭阅读设置并返回焦点；配色单选可用方向键。
- 搜索历史游戏后打开源期次与新闻锚点；上一期/下一期、日历、返回顶部工作正常。
- 无图、英文不可用、网络失败状态；系统减少动态效果。
- 9月7日内容与原站一致；8月21日晚报封面比例、来源链接、日期正确。

## 2026-09-08 图片、图标与动效细化

- 图片尺寸实测：NO.028 五张新闻图均1280×720，约55–116KB；保留原图，不生成重复素材。手机普通图限制到320px宽且保持16:9，移除与比例冲突的高度上限。封面按square/portrait/landscape预留比例空间并contain显示；主图eager/high，其余lazy，统一async解码。
- Phosphor：通过IconContext显式采用Regular字重；去掉品牌duotone例外与文本箭头。所有图标从同一变量同时取得宽高；正文/来源16px、工具20px、品牌24px。外链用斜箭头，站内文章用右箭头，上下期与返回顶部使用相应方向；图标均aria-hidden且不进入Tab顺序。
- 反馈：按钮颜色/边框与按压150ms；图片加载淡入、设置菜单和核验内容展开180ms；鼠标精确指针下箭头移动1–2px。静态新闻图不因hover缩放，避免暗示可点击放大。
- 减少动态：关闭进入与过渡动画，取消箭头/按钮位移；保留展开箭头的即时方向变化，不能为了关闭动效丢掉状态指示。没有增加滚动劫持、循环动画或新动效库。
- 本轮人工检查重点：390/640px图像不额外裁切，历史横/竖/方封面加载前后占位稳定；深浅主题图标无拉伸；鼠标hover、触屏按压、Tab/Enter/Esc、系统减少动态均符合预期。尚未执行浏览器实屏检查。

## 2026-09-08 恢复未来15天发售

当前9月7日期次upcoming为空，9月1日至7日均为空；最近非空快照为8月31日。样例恢复固定日历入口，在本期无清单时读取最近15天内最新的非空历史快照，仅保留本期日期之后第1–15天的计划并排序。当前可恢复10条。明确展示原收录日期、未重新核验提示及原期链接；不修改历史数据，不拼接更旧的失效日期。历史页面以其期次日期计算，英文沿用来源期次已校验的翻译。保留平台、地区、发售类型、图片和来源。读取失败提供重试；无记录时说明不代表无游戏发售。

人工验收新增：桌面及390px日历日期/封面/长游戏名换行，两主题提示文字和键盘重试焦点，原期链接、来源准确性。未做实屏验收。

本轮完整检查：npm run check通过，64个文件、319项测试（17项样例测试），28期数据及英文校验、构建；本地预览HTTP 200。

## 2026-09-08 上线集成

新版成为默认首页；原有view=reading链接继续有效，view=classic保留原版中英文入口。已同步origin/main的9月8日数据与媒体，发布改动不包含public/data、public/media、schema、采集脚本、Actions或依赖更新。新旧样式通过reading-page与r-*隔离，新版仅按需加载。此前独立的AGENTS.md精简工作不包含在本次视觉上线中。

上线前同步main a88377f后的完整检查通过：319项测试、29期数据及英文校验、构建。

## 2026-10-03 reader interaction follow-up

- Search terms and expanded result counts use URL parameters; returning from a result restores the saved scroll position. History updates replace the current entry while typing.
- The search index loads when archive approaches the viewport, the search input receives focus, or a URL contains a query.
- The non-modal settings panel closes when focus leaves. Loading reserves viewport space to avoid the footer jumping out of the first screen.
- A complete collapsible edition directory precedes the lead. The sidebar explicitly labels its five-story selection. Navigation advertises archive search; mobile source/caption text is larger.
- Technical calendar notes are retained in a labelled disclosure. General notes remain visible. A failed latest-edition request offers a recent archive when its manifest is available.
- GitHub alternatives reviewed: [nuqs](https://github.com/47ng/nuqs), [Radix Popover](https://github.com/radix-ui/primitives), [React Loading Skeleton](https://github.com/dvtng/react-loading-skeleton). Existing History/React/details/CSS capabilities cover this limited scope without adding dependencies.
- Validation: 573 tests, production build, 20 Chrome responsive/theme/language layouts; actual 13th-result navigation and back restores 24 results and the same scroll position; focus dismissal, unavailable-latest recovery and calendar disclosure verified. Local 390px loading shift measured approximately 0.0011 (lab observation, not a field percentile).
- Safari, physical devices, screen readers and full zoom conformance remain separate acceptance work; large-text preferences were an optional research recommendation, not introduced here.


## 2026-11-07 可恢复的主题补课

- 新闻的“同主题前情”使用现有准确 title key 进入全部已收录时间线，不做模糊合并，不将公司、活动误当成游戏。
- 补课的日期、主题、展开条数保存在 URL；刷新、返回原期前的补课页、切换语言不再清空筛选。筛选使用 replaceState，避免每次输入都增加历史记录；打开/关闭补课和原期导航仍使用普通浏览器历史。
- “复制这份补课”固定所选日期，保留主题及展开条数；剪贴板不可用时提供可手动复制的链接。未知或当前语言不可用的主题明确显示无收录，不以其他主题代替。
- 主题数字按所选日期计算；新增“全部收录”。打开原期前记录滚动位置，索引载入后恢复。所有摘要、传闻/媒体证据标签和原期来源锚点沿用既有索引。
- 零新增模型调用、采集源、搜索请求、运行依赖或定时任务；不修改 Canonical、编号、历史窗口或发布流程。

## 2026-11-07 已审核的主题别名（仅展示层）

“同主题前情”上线后的实测发现，《侠盗猎车手VI》在11月6日使用 `grand-theft-auto-vi`，11月7日使用 `gta-6`，使同一游戏分别出现15条与2条补课记录。复核既有原始标题、归档与译名证据后，仅将下列三个明确旧键映射到展示主题 `grand-theft-auto-vi`：

- `gta-6`：10月18日 `2026-10-18-daily-news-3`（原名GTA6，日本评级报道）和11月7日 `2026-11-07-daily-observations-0`（原名Grand Theft Auto VI，德国课程报道）。
- `gta 6 all the major new details`：9月30日 `2026-09-30-daily-news-7`，原名Grand Theft Auto VI；其IGN来源同样明确为GTA 6细节报道。
- `twitch ceo says gta 6 multiplayer will`：9月18日 `2026-09-18-daily-rumors-0`，原名Grand Theft Auto VI；其PC Gamer来源为多人模式传闻，合组后仍保留未证实标签。

复核范围是8月21日至11月7日的既有归档，合计19条；四组均有有效英文展示。相关来源链接保留在各条原期正文中，译名证据仍位于 `config/title-translations.json` 对应键。本映射不修改该译名登记表，也不从它自动推导其他身份关系。

`src/lib/catchup.ts` 的显式映射只影响主题分组与链接。旧主题链接、日期筛选、复制链接和中英切换共用同一解析；原始title key、条目ID、摘要、证据等级、原期锚点、期号和事实窗口全部保留。GTA Online、其他作品、公司、活动、大小写变体及未审核同名键不会因名称相似而合并；新增映射须另行核对具体归档身份。

### 影之刃零与赛博朋克2077的补充审计

同日逐条复核既有归档的原名、正文与已存来源，线上中英文也复现相同拆分。仅增加以下三条展示映射，不进行新的新闻检索或按名称自动推断：

- `phantom blade zero` → `phantom-blade-zero`：10月23日 `2026-10-23-daily-news-5`，原名Phantom Blade Zero，[Gematsu上市预告及PS5实体版报道](https://www.gematsu.com/2026/10/phantom-blade-zero-launch-trailer-ps5-physical-editions-launch-in-2027)。规范键原有10月26日 `2026-10-26-daily-reviews-0`，[电Fami首批评分报道](https://news.denfaminicogamer.jp/news/261026h)。
- `steam-4115450` → `phantom-blade-zero`：10月29日 `2026-10-29-daily-features-1` 的[PlayStation Blog武器专题](https://blog.playstation.com/2026/10/28/phantom-blade-zero-how-boss-weapons-transform-combat-and-exploration/)、`2026-10-29-daily-industry-0` 的[AUTOMATON预购估算](https://automaton-media.com/articles/newsjp/20261028-476178/)、`2026-10-29-daily-releases-3` 的[电Fami发售报道](https://news.denfaminicogamer.jp/news/2610292w)，以及11月3日 `2026-11-03-daily-industry-0` 的[4Gamer销量报道](https://www.4gamer.net/games/709/G070944/20261102007/)，四条原名均为Phantom Blade Zero。合组共6条，不按eventKey去重，也不把10月13日至27日的15条历史日历记录计作新闻。
- `from the anime to the game free` → `cyberpunk-2077`：10月23日 `2026-10-23-daily-news-0`，[Xbox Wire游戏免费更新稿](https://news.xbox.com/en-us/2026/10/22/cyberpunk-2077-edgerunners-2-update/)，原名Cyberpunk 2077；与10月22日 `2026-10-22-daily-news-2` 的[Gematsu更新详情](https://www.gematsu.com/2026/10/cyberpunk-2077-version-2-5-edgerunners-ii-update-detailed)合计2条，未合入动画作品。

上述5期英文Overlay均为available，8条新闻有匹配英文内容。测试使用这些真实归档及英文文案，覆盖全部旧键、来源期次锚点、复制链接、语言切换、日期筛选、事实状态与原数据不变。

`steam-4115450` 在这里仅作为已核对的历史不透明键：11月3日配图来源URL另含Steam app/2493660，不能据此宣称两个商店ID相同或新增 `steam-2493660` 别名。实际动画键 `cyberpunk-edgerunners-2` 的4条消息保持独立；Phantom Line、Phantom Line: Prologue、PHANTOM OF INFERNO、其他作品/扩展、公司和未知同名键均不因词形相近而归组。没有修改译名表、日历、Canonical或发布流程。

## 2026-11-08 补课导航与键盘焦点

线上浏览器复现：从补课点击顶部“日历”或“归档与搜索”，会先插入 `#top`、再插入目标锚点，导致返回两次才能回到补课。导航现只写入一个真实目标，等原日报显示后再定位并聚焦栏目；链接本身也移除 `catchup=1`，修饰键/新标签页使用原生链接行为并保留期次、语言与筛选参数。

键盘打开补课后聚焦其标题，关闭后回到补课入口；标题不加入常规Tab顺序。仅对读者主动打开/关闭移动焦点，不在初始加载或浏览器前进/后退时抢焦点。主动导航的新历史条目清除旧归档搜索的滚动恢复位置，避免随后被拉回旧搜索处；原历史条目仍保持不变。自动回归覆盖三处主导航、一次返回/前进、中英重复开关与修饰键点击。

本轮线上日期检查确认原生键盘编辑能同步筛选与URL，逆序日期禁用复制；复制的自定义日期链接与语言切换保留筛选。没有新增模型调用、检索、依赖、调度或历史内容修改。

# Scheduled Task Prompt — Search, Images, Archive, and Publish

Use the following prompt to update both existing ChatGPT tasks. Keep their current schedules and enabled state; do not create duplicate tasks.

```text
请升级现有“游戏圈双时段热点简报”定时任务的检索与 GitHub 发布流程。保留当前早报每天10:10、晚报每天17:00、Asia/Shanghai、连续期号、时间窗口、一手来源核验、相邻期去重和追加式归档规则；更新现有两个任务，不要创建重复任务。

一、检索与栏目
1. 先读取仓库 main 的 public/data/manifest.json 与 latest.json，确定下一期号、相邻期内容和本次计划窗口。
2. 按发售与上线、评分、热点新闻、公司与产业、深度文章与专访、泄漏与传闻、延伸观察分别检索，但不得为了填满栏目而降低事实或来源标准。
3. 某栏目没有可靠新增时，不写占位条目、不编写概括性空新闻；保留空数组或不产生该 section 的条目，网页会自动隐藏空栏目。
4. 继续执行北京时间窗口、补遗标记、官方中文名状态、fact_status、time_status、一手来源和标题归一化规则。只有亲自打开一手来源后才能标记 official。

二、图片
1. 新简报使用 schemaVersion: 2。为每条新闻主动寻找与该事件直接相关的官方新闻图、发行商媒体素材、开发商截图或官方商店素材；未来15天游戏优先使用官方封面。
2. 有合规图片时填写 images 或 cover。每个图片对象必须包含：
   - url：优先上传到 public/media/briefs/YYYY/MM/<edition-id>/<entry-or-game-id>.webp 或 .jpg，JSON 使用不以斜杠开头的 media/briefs/... 路径；无法上传二进制时可使用已验证可访问的官方 HTTPS 媒体/CDN 地址。
   - alt：准确描述可见内容的中文替代文本。
   - credit：开发商、发行商、摄影师或版权方。
   - sourceUrl：已亲自打开核验的官方图片来源页面，必须为 HTTPS。
   - kind：新闻为 editorial，封面为 cover。
3. 新闻图按16:9、游戏封面按3:4选择，仓库文件尽量使用WebP/JPEG并控制在500KB以下。
4. 禁止使用搜索结果缩略图、无关图库照片、粉丝创作、无法追溯来源的图片，禁止为了满足“每条有图”而强行错配。
5. 如果经过检索仍没有可核实、相关且适合使用的图片：新闻省略 images，写 image_status: "unavailable" 与具体 imageNote；游戏省略 cover，写 cover_status: "unavailable" 与具体 coverNote。不得伪造图片，也不得因此降回 schemaVersion: 1。

三、原子发布
1. 如有本地媒体，上传到 public/media/briefs/YYYY/MM/<edition-id>/。
2. 新增 public/data/archive/YYYY/MM/<edition-id>.json。
3. 让 public/data/latest.json 与新归档 JSON 完全一致。
4. 只追加 public/data/manifest.json，更新 latest 和 updatedAt；不得删除、改号或覆盖旧归档。
5. 不要手工维护 public/data/search-index.json；npm 构建会根据全部归档自动生成跨期搜索索引。
6. 运行 npm run validate:data 和 npm run check。任何失败都先修复，不得推送半成品。
7. 推送 main 后等待 GitHub Actions 成功，验证线上 latest.json、当期归档、manifest、搜索索引以及所有实际使用的图片 URL 均返回 HTTP 200。
8. 只有以上验证全部通过后才报告发布成功，并列出提交、Actions、期次与线上地址。

若 GitHub、来源或图片上传受限，明确报告受限项目。没有合规图片不阻止新闻发布，但必须使用 unavailable 状态说明，绝不能用无关图片替代。
```

The repository-side contract remains authoritative in `AGENTS.md`, `docs/DATA_PIPELINE.md`, and `scripts/validate-data.mjs`.

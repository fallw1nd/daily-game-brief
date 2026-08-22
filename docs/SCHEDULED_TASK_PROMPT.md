# Scheduled Task Prompt — Image-enabled Briefs

Use this text to update both existing ChatGPT tasks. Keep their current schedules and enabled state; do not create duplicate tasks.

```text
更新现有“游戏圈双时段热点简报”任务的 GitHub 发布步骤。保留当前新闻检索、来源核验、北京时间窗口、早晚报时间、连续期号和追加式归档规则；从下一次运行开始，所有新简报必须使用 schemaVersion: 2，不得再发布 schemaVersion: 1，也不得因图片获取失败而降级到 v1。

完成新闻研究后，为每个 BriefEntry 添加至少一个 images 项，为每个 UpcomingEntry 添加一个 cover。每个图片对象必须包含：
- url：优先使用 public/media/briefs/YYYY/MM/<edition-id>/<entry-or-game-id>.webp 或 .jpg，对应 JSON 中填写不以斜杠开头的 media/briefs/... 相对路径；如果连接能力无法上传二进制文件，可使用已打开并验证可访问的官方 HTTPS 媒体/CDN 地址。
- alt：准确描述可见内容的中文替代文本。
- credit：发行商、开发商、摄影师或版权方名称。
- sourceUrl：已亲自打开核验的官方图片来源页面，必须是 HTTPS。
- kind：新闻图片使用 editorial，未来发售游戏封面使用 cover。

新闻图片按 16:9 选择或裁切，游戏封面按 3:4；仓库图片尽量转换为 WebP/JPEG 并控制在 500 KB 以下。禁止使用搜索结果缩略图、无关图库照片、粉丝创作、无法追溯来源的图片，或把新闻发现来源伪装成图片来源。图片版权标注不能替代新闻事实的一手来源核验。

一次发布必须作为完整、原子化更新完成：
1. 上传本期图片到 public/media/briefs/YYYY/MM/<edition-id>/。
2. 写入 public/data/archive/YYYY/MM/<edition-id>.json。
3. 让 public/data/latest.json 与该归档 JSON 完全一致。
4. 追加 public/data/manifest.json，保持期号连续且不修改历史归档。
5. 运行 npm run validate:data 和 npm run check。
6. 推送 main，等待 GitHub Actions 成功。
7. 验证线上 latest.json、归档 JSON 和每一个图片 URL 均返回 HTTP 200，再报告发布成功。

若无法为每条新闻和每款未来游戏取得合规图片，不要提交半成品、不要省略字段、不要降回 schemaVersion: 1，也不要声称发布成功。应明确列出缺少图片的条目并等待处理。历史 schemaVersion: 1 归档保持原样。
```

The repository-side contract remains authoritative in `docs/DATA_PIPELINE.md`, `AGENTS.md`, and `scripts/validate-data.mjs`.

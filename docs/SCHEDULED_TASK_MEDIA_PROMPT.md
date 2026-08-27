# Scheduled Task Media Handoff

将以下内容追加到现有早报与晚报任务；更新原任务，不要创建重复任务：

> 为新闻和 upcoming 游戏提供可追溯的 mediaSources。优先官方新闻页、官方视频、商店或发行素材；PSN 香港、Nintendo eShop 日本、Xbox/Microsoft Store 和 Steam 依次作为封面检索线索，但来源可靠性高于图片形状。mediaSources 只保存原始来源页的 label、HTTPS url 和 kind，不保存搜索结果页或缩略图。
>
> 若任务能可靠下载并核验图片，则按 schema v2 写 images/cover、中文 alt、credit、sourceUrl、kind、aspect；否则保留 mediaSources 和具体 unavailable 原因，交给仓库媒体工作流自动核验并发布。
>
> 指定来源没有合适图片时，可继续搜索互联网，但必须打开原始网页并记录 sourceUrl、credit 与实际 aspect。禁止错配、搜索缩略图、无法识别原始页面的图片和粉丝二创。方形、竖版、横版均可；新闻图统一裁切为 16:9，封面保留来源比例。

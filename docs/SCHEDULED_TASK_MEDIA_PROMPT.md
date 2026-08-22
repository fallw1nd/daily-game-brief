# Scheduled Task Media Handoff

将以下内容追加到现有早报与晚报任务；更新原任务，不要创建重复任务：

> 为每个 upcoming 游戏新增 mediaSources 候选列表。必须亲自打开商品页并按 PSN 香港（优先简体中文方图）→ Nintendo eShop 日服（方图）→ Xbox/Microsoft Store（矩形）的顺序查找；多平台游戏在找到更高优先级来源后停止。纯 PC 游戏若进入 XGP 则优先 Xbox，否则可使用 Steam 等官方商店矩形图。mediaSources 每项只保存商品页：label、HTTPS url、kind: primary，不保存搜索结果页或缩略图。Nintendo 日服无商品页时才可记录可追溯的实体竖版封面。
>
> 新闻图片继续优先官方新闻稿、开发商/发行商媒体素材和官方截图。若任务能可靠下载并核验图片，则按 schema v2 写 images/cover、中文 alt、credit、sourceUrl、kind、aspect；若不能上传二进制文件，保留 mediaSources 和具体 unavailable 原因，让仓库的 Propose verified media 工作流在 10:35/17:25 生成候选 PR。
>
> MobyGames、LaunchBox Games Database、Glitchwave、Gavas、Refuge 只能帮助人工确认版本，不得直接抓图或热链。不得使用搜索缩略图、粉丝图、无关宣传图；不得为了配图降低来源标准。发布新闻数据后仍执行 npm run validate:data 和 npm run check；媒体候选 PR 必须经人工检查裁切、版本、中文 alt、署名和来源页后再合并。

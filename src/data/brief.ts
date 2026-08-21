import type { BriefEdition, BriefEntry, SourceLink } from "../types";

const primary = (label: string, url: string): SourceLink => ({
  label,
  url,
  kind: "primary",
});

const secondary = (label: string, url: string): SourceLink => ({
  label,
  url,
  kind: "secondary",
});

export const entries: BriefEntry[] = [
  {
    id: "2026-08-21-pm-news-0",
    section: "news",
    title: {
      title_key: "expelled-from-paradise-stellar-angel",
      title_zh_cn: "乐园追放",
      title_en: "Expelled from Paradise: The Stellar Angel",
      title_zh_status: "common_translation",
    },
    headline: "定档11月26日",
    summary:
      "东映动画与 Studio51 宣布系列首款游戏将登陆 Switch 与 PC，并支持日英双语。作品连接2014年电影与2026年新电影《心之共鸣》，以选择分支驱动多结局。",
    beijingTime: "2026-08-21 11:00",
    timeNote: "日本新闻稿12:00换算",
    fact_status: "official",
    time_status: "verified",
    entry_flags: [],
    platforms: ["Nintendo Switch", "PC"],
    region: "日本／全球商店",
    sources: [
      primary(
        "Studio51 新闻稿",
        "https://prtimes.jp/main/html/rd/p/000000022.000121400.html",
      ),
      primary(
        "Steam 商店",
        "https://store.steampowered.com/app/4607420/_The_Stellar_Angel/",
      ),
    ],
    verification: "新闻稿与 Steam 商店均已打开；平台、语言和发售日相互一致。",
    imageSeed: "stellar-angel-visual-novel",
  },
  {
    id: "2026-08-21-pm-releases-1",
    section: "releases",
    title: {
      title_key: "chronoscript-endless-end",
      title_en: "Chronoscript: The Endless End",
      title_zh_status: "unavailable",
    },
    headline: "Steam试玩版开放",
    summary:
      "试玩版从编辑被困入手稿的序章开始，可体验2D墨绘世界与3D宅邸之间的探索；完成主体后还会解锁额外首领挑战。",
    beijingTime: "2026-08-21 10:51",
    timeNote: "以日本媒体发布时间换算",
    fact_status: "multi_source_verified",
    time_status: "verified",
    entry_flags: [],
    platforms: ["PC（Steam）"],
    region: "全球",
    releaseType: "免费试玩版",
    sources: [
      primary(
        "Steam 商店",
        "https://store.steampowered.com/app/4018380/Chronoscript_The_Endless_End/",
      ),
      secondary("4Gamer", "https://www.4gamer.net/games/948/G094806/20260821005/"),
    ],
    verification: "Steam 已直接提供试玩下载；4Gamer 用于补充开放时间。",
    imageSeed: "ink-manuscript-mansion",
  },
  {
    id: "2026-08-21-pm-releases-0",
    section: "releases",
    title: {
      title_key: "lazy-witchs-factory",
      title_en: "Lazy Witch’s Factory",
      title_zh_status: "unavailable",
    },
    headline: "Steam抢先体验版上线",
    summary:
      "MELTCLOCK 的 Roguelite 工厂模拟游戏已经可购买。首发版本提供三组赞助公司组合与数十小时内容，开发团队计划至少进行六个月抢先体验。",
    beijingTime: "2026-08-21 14:47",
    timeNote: "以日本媒体发布时间换算",
    fact_status: "multi_source_verified",
    time_status: "verified",
    entry_flags: ["region_difference"],
    platforms: ["PC（Steam）"],
    region: "全球／商店地区日期不同",
    releaseType: "抢先体验",
    sources: [
      primary(
        "Steam 商店",
        "https://store.steampowered.com/app/3971650/Lazy_Witchs_Factory/",
      ),
      secondary("4Gamer", "https://www.4gamer.net/games/939/G093964/20260821025/"),
    ],
    verification: "Steam 显示8月20日，Phoenixx 日本公告按8月21日记载；保留地区差异。",
    tracking: true,
    imageSeed: "witch-factory-alchemy",
  },
  {
    id: "2026-08-21-pm-releases-2",
    section: "releases",
    title: {
      title_key: "stalker-2",
      title_zh_cn: "潜行者2：切尔诺贝利之心",
      title_en: "S.T.A.L.K.E.R. 2: Heart of Chornobyl",
      title_zh_status: "official_simplified",
      edition_zh: "希望的代价",
    },
    headline: "大型扩展与2.0更新已上线",
    summary:
      "官方 Steam 新闻确认大型扩展和免费2.0更新已发布。扩展加入两个区域与数十小时内容，2.0将引擎迁移至 UE 5.5.4，并调整光照、AI与生态。",
    beijingTime: "2026-08-21 14:48",
    timeNote: "全球解锁边界待核",
    fact_status: "official",
    time_status: "time_unverified",
    entry_flags: ["region_difference"],
    platforms: ["PS5", "Xbox Series", "PC"],
    region: "全球解锁边界待核",
    releaseType: "大型DLC＋免费更新",
    sources: [
      primary(
        "Steam 官方新闻",
        "https://store.steampowered.com/news/app/1643320/view/677381523352060037",
      ),
      secondary("4Gamer", "https://www.4gamer.net/games/127/G012714/20260821027/"),
    ],
    verification: "发布事实已确认；官方站、Steam和日本公告缺少统一时区标注。",
    tracking: true,
    imageSeed: "chernobyl-zone-anomaly",
  },
  {
    id: "2026-08-21-pm-news-1",
    section: "news",
    title: {
      title_key: "astrae-oratio",
      title_en: "Astrae Oratio",
      title_zh_status: "unavailable",
    },
    headline: "确认参加东京电玩展2026",
    summary:
      "NC 确认 Dynamis One 开发的幻想 RPG 将于9月17日至21日在幕张展览馆设置独立展位，运营方式与节目表将在后续专题页公布。",
    beijingTime: "2026-08-21 11:17",
    timeNote: "以韩国媒体发布时间换算",
    fact_status: "multi_source_verified",
    time_status: "verified",
    entry_flags: [],
    platforms: ["待公布"],
    region: "日本",
    sources: [
      primary("官方 X", "https://x.com/Asora_KR/status/2090619904835670509"),
      secondary("GameMeca", "https://www.gamemeca.com/en/mv.php?gid=1779424"),
      secondary("4Gamer", "https://www.4gamer.net/games/975/G097529/20260821010/"),
    ],
    verification: "官方账号原帖已打开；两家媒体用于补充展位与时间信息。",
    imageSeed: "fantasy-constellation-rpg",
  },
  {
    id: "2026-08-21-pm-observations-0",
    section: "observations",
    title: {
      title_key: "cyberpunk-edgerunners-2",
      title_en: "Cyberpunk: Edgerunners 2",
      title_zh_status: "unavailable",
    },
    headline: "确定10月20日Netflix首播",
    summary:
      "本轮已打开 CD PROJEKT RED 新闻稿与 Netflix 官方预告，确认第二部为独立的10集故事。原始发布早于本轮窗口，因此作为延迟收录补遗。",
    beijingTime: "2026-08-21 07:39",
    timeNote: "官方页面仅标日期",
    fact_status: "official",
    time_status: "date_only",
    entry_flags: ["supplement"],
    platforms: ["Netflix"],
    region: "全球",
    sources: [
      primary(
        "CD PROJEKT RED 新闻稿",
        "https://press.cdprojektred.com/en/news/1837/cyberpunk-edgerunners-2-premiere-date-announced-alongside-new-trailer",
      ),
      primary("Netflix 官方预告", "https://www.youtube.com/watch?v=SyeHKMfswHk"),
    ],
    verification: "一手页面已核验；本条为补遗，不计入当前窗口新增新闻。",
    imageSeed: "cyberpunk-night-city-neon",
  },
];

export const edition: BriefEdition = {
  id: "2026-08-21-pm",
  issueNumber: 2,
  date: "2026-08-21",
  period: "pm",
  plannedAt: "2026-08-21 17:00",
  generatedAt: "2026-08-21 17:06",
  windowStart: "2026-08-21 10:10",
  windowEnd: "2026-08-21 17:00",
  timezone: "Asia/Shanghai",
  nextEditionAt: "2026-08-22 10:10",
  revised: false,
  entries,
  upcoming: [
    {
      id: "upcoming-once-human-console",
      date: "08.26",
      title: {
        title_key: "once-human",
        title_zh_cn: "七日世界",
        title_en: "Once Human",
        title_zh_status: "official_simplified",
        edition_zh: "主机版",
      },
      platforms: ["PS5", "Xbox Series"],
      region: "全球／地区日期不同",
      releaseType: "主机移植版",
      source: primary(
        "NetEase 投资者关系",
        "https://ir.netease.com/news-releases/news-release-details/once-human-sets-august-25-launch-date-ps5-and-xbox-new-first",
      ),
      note: "厂商按太平洋时间标8月25日，PS商店对应北京时间8月26日。",
    },
    {
      id: "upcoming-apidya",
      date: "08.25",
      title: {
        title_key: "apidya-special",
        title_en: "Apidya’ Special",
        title_zh_status: "unavailable",
      },
      platforms: ["PS5", "Xbox Series", "Switch", "PC"],
      region: "全球／商店时区不同",
      releaseType: "重制版正式发售",
      source: primary(
        "ININ Games",
        "https://iningames.com/blogs/news/apidya-special-33-years-in-the-making",
      ),
      note: "发行商口径为8月25日；Steam部分地区显示8月24日。",
    },
    {
      id: "upcoming-aliens-fireteam-2",
      date: "08.25",
      title: {
        title_key: "aliens-fireteam-elite-2",
        title_en: "Aliens: Fireteam Elite 2",
        title_zh_status: "unavailable",
      },
      platforms: ["PS5", "Xbox Series", "PC"],
      region: "全球",
      releaseType: "正式发售",
      source: primary(
        "Steam",
        "https://store.steampowered.com/app/3448650/Aliens_Fireteam_Elite_2/",
      ),
      note: "以 Steam 官方商店日期为准。",
    },
    {
      id: "upcoming-lous-lagoon",
      date: "08.27",
      title: {
        title_key: "lous-lagoon",
        title_zh_cn: "卢湖采风",
        title_en: "Lou’s Lagoon",
        title_zh_status: "official_simplified",
      },
      platforms: ["PS5", "Xbox Series", "Switch", "PC"],
      region: "全球",
      releaseType: "正式发售",
      source: primary(
        "PlayStation Blog",
        "https://blog.playstation.com/2026/07/22/fresh-look-at-lous-lagoon-coming-to-ps5-on-august-27/",
      ),
      note: "PlayStation Blog 与 Steam 日期一致。",
    },
    {
      id: "upcoming-mgs-master-2",
      date: "08.27",
      title: {
        title_key: "mgs-master-collection-2",
        title_en: "METAL GEAR SOLID: MASTER COLLECTION Vol.2",
        title_zh_status: "unavailable",
      },
      platforms: ["PS5", "Xbox Series", "Switch / Switch 2", "PC"],
      region: "全球／部分地区预购时间不同",
      releaseType: "合集正式发售",
      source: primary("KONAMI 公告", "https://www.konami.com/games/us/en/topics/3095/"),
      note: "以 KONAMI 官网8月27日口径为准。",
    },
  ],
  tracking: [
    "《S.T.A.L.K.E.R. 2》扩展的全球解锁时刻仍缺少统一时区标注。",
    "《Lazy Witch’s Factory》Steam 与日本公告存在8月20日／21日差异。",
    "《GTA VI》泄漏继续等待 Rockstar、Take-Two 回应与素材技术核验。",
  ],
};

export const sectionOrder = [
  { key: "focus", title: "最值得关注" },
  { key: "releases", title: "今日发售与新上线" },
  { key: "reviews", title: "新游戏评分" },
  { key: "news", title: "热点新闻" },
  { key: "industry", title: "公司与产业动向" },
  { key: "features", title: "深度文章与专访" },
  { key: "rumors", title: "泄漏、爆料与传闻" },
  { key: "observations", title: "延伸观察" },
  { key: "upcoming", title: "未来15天发售前瞻" },
  { key: "tracking", title: "仍需追踪" },
  { key: "search-report", title: "本轮检索说明" },
] as const;

export const sourceReport = {
  checked: ["IGN", "3DM", "机核", "Steam", "PlayStation Blog", "厂商新闻稿"],
  limited: [
    "Game Calendar：仅返回 JavaScript 占位",
    "MobyGames：返回 403",
  ],
  note: "发现来源只用于建立线索；‘官方’状态只在一手原页实际打开后使用。",
};

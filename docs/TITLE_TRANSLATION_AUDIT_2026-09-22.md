# 归档游戏中文译名审计（2026-09-22）

## 范围与原则

- 范围：`public/data/archive` 下 43 份归档，2026-08-21 至 2026-09-22。
- 比较基线：`74a8a375b29e962c5688b14608adf2f6f8909360`；本轮收口前 HEAD：`7795ef8b0d247b6a74874cc5293b82372e511363`。
- 优先级：官方简体中文名称 > 官方中文地区名称 > 大陆稳定常用译名 > 保留原名。
- 不机器直译、不为清空 `unavailable` 强造中文名；官方中文页仍使用英文/拉丁字母名称时，原名即为核验结果。
- 中国游戏除游戏名外，同时检查公司、版本名、角色名和展示层图片说明；来源 URL、原始来源标签等证据字段不改写。

## 本轮新增/校正的译名登记

相对任务开始时的 registry，本轮共净新增 **71** 个 title key。下表为完整新增项；`config/title-translations.json` 是机器可读的长期汇总。

| title_key | 中文显示名 | 依据类型 | 依据 |
| --- | --- | --- | --- |
| `ace-combat-8-wings-of-theve` | 空战奇兵8 希孚之翼 | 官方简中/官方中文区名称 | [依据](https://www.playstation.com/zh-hans-hk/games/ace-combat-8-wings-of-theve/) |
| `aeterna-lucis` | 光之永恒 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/2710920/Aeterna_Lucis/?l=schinese) |
| `aion2` | 永恒之塔2 | 常用译名 | [依据](https://www.gamersky.com/z/aion2/) |
| `ammossum` | 西部鼠仔 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/2659600/Ammossum/?l=schinese) |
| `aniimo` | 伊莫 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/4126040/Aniimo/?l=schinese) |
| `ball-x-pit` | BALL x PIT — 球比伦战记 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/2062430/BALL_x_PIT/?l=schinese) |
| `blue-nova` | B.L.U.E. NOVA 苍蓝之愿 | 官方简中/官方中文区名称 | [依据](https://bluenova-thegame.com/zh-cn/) |
| `cairn` | 孤山独影 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/1588550/Cairn/?l=schinese) |
| `call-of-duty-black-ops-7` | 使命召唤：黑色行动7 | 官方简中/官方中文区名称 | [依据](https://www.callofduty.com/cn/zh/blackops7) |
| `cassette-beasts-2002` | 磁带妖怪2002 | 常用译名 | [依据](https://www.gamersky.com/z/cassette-beasts-2002/) |
| `castlevania-belmonts-curse` | 恶魔城：贝尔蒙特的诅咒 | 常用译名 | 编辑部核验 |
| `chronoscript-endless-end` | 时之书：无尽终章 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/4018380/Chronoscript_The_Endless_End/?l=schinese) |
| `conquista-tide-of-wills` | 征服纪：臣民之心 | 常用译名 | [依据](https://www.3dmgame.com/news_32_53/) |
| `crescent-tower-rising` | Crescent Tower: RISING ～新月之塔 崛起～ | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/5019630/Crescent_Tower_RISING/?l=schinese) |
| `crisis-core-final-fantasy-vii-reunion` | 最终幻想7：核心危机 重聚 | 常用译名 | [依据](https://www.gamersky.com/z/crisiscore/) |
| `dead-or-alive-6-last-round` | 死或生6 Last Round | 常用译名 | 编辑部核验 |
| `diablo-iv` | 暗黑破坏神IV | 官方简中/官方中文区名称 | [依据](https://d4.blizzard.cn/) |
| `diablo-v` | 暗黑破坏神V | 常用译名 | 编辑部核验 |
| `exodus` | 大迁离 | 官方简中/官方中文区名称 | [依据](https://www.exodusgame.com/zh-CN) |
| `final-fantasy-resonance` | 最终幻想：共鸣 | 常用译名 | [依据](https://ku.gamersky.com/2026/final-fantasy-resonance/) |
| `football-manager-27` | 足球经理 27 | 常用译名 | 编辑部核验 |
| `gran-turismo-7` | 跑车浪漫旅 7 | 官方简中/官方中文区名称 | [依据](https://www.playstation.com/zh-hans-hk/games/gran-turismo-7/) |
| `halloween-the-game` | 月光光心慌慌 | 常用译名 | [依据](https://ku.gamersky.com/2026/halloween/) |
| `hela-of-mice-and-magic` | Hela：魔鼠无敌 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/3161310/Hela_of_Mice__Magic/?l=schinese) |
| `holy-horror-mansion` | 幽幽灵公寓 | 常用译名 | [依据](https://gnn.gamer.com.tw/detail.php?sn=311503) |
| `honkai-star-rail` | 崩坏：星穹铁道 | 官方简中/官方中文区名称 | [依据](https://sr.mihoyo.com/) |
| `kernel-hearts` | 内核之心 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/2902170/Kernel_Hearts?l=schinese) |
| `kingdom-come-deliverance-ii-royal-edition` | 天国：拯救2 皇家版 | 官方简中/官方中文区名称 | [依据](https://steamcommunity.com/app/1771300/announcements/?l=schinese) |
| `kingdom-iii-rising-realms` | 王国III：开疆拓土 | 常用译名 | [依据](https://www.3dmgame.com/games/zq_4/) |
| `kirby-and-the-world-beyond` | 星之卡比：跃然世界 | 常用译名 | [依据](https://www.gamersky.com/news/202609/2206624.shtml) |
| `league-of-legends-mmo` | 英雄联盟 MMO | 常用译名 | 既有归档 |
| `lufia-i-ii-the-sinistrals-saga` | 四狂神战记：I&II | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/4027620/?l=schinese) |
| `megami-ibunroku-persona` | 女神异闻录Persona | 常用译名 | 编辑部核验 |
| `metal-slug-ultimate-collection` | 合金弹头 终极合集 | 常用译名 | [依据](https://www.gamersky.com/news/202609/2206622.shtml) |
| `monster-hunter-now` | 怪物猎人Now | 常用译名 | [依据](https://www.gamersky.com/z/monster-hunter-now) |
| `no-rest-for-the-wicked` | 恶意不息 | 官方简中/官方中文区名称 | [依据](https://steamcommunity.com/app/1371980?l=schinese) |
| `paper-mario` | 纸片马力欧 | 常用译名 | 编辑部核验 |
| `pikmin-3-deluxe` | 皮克敏3 豪华版 | 官方简中/官方中文区名称 | 编辑部核验 |
| `pokemon-unite` | 宝可梦大集结 | 官方简中/官方中文区名称 | [依据](https://unite.qq.com/) |
| `powerwash-simulator` | 冲就完事模拟器 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/1290000/PowerWash_Simulator/?l=schinese) |
| `professor-layton-and-the-curious-village-remake` | 雷顿教授与不可思议的小镇 重制版 | 常用译名 | 编辑部核验 |
| `runescape-dragonwilds` | 符文世界：龙之荒野 | 官方简中/官方中文区名称 | [依据](https://www.xbox.com/zh-cn/games/store/runescape-dragonwilds-%E7%AC%A6%E6%96%87%E4%B8%96%E7%95%8C-%E9%BE%99%E4%B9%8B%E8%8D%92%E9%87%8E/9p402rwr63h4) |
| `sameowrai-silver-winged-cat-samurai` | Sa[meow]rai: 银翼的猫侍 | 常用译名 | 既有归档 |
| `shadow-of-the-road` | 暗影之路 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/1173980/Shadow_of_the_Road/?l=schinese) |
| `stellar-blade-complete-edition` | 剑星 完整版 | 官方简中/官方中文区名称 | [依据](https://store.playstation.com/zh-hans-hk/product/HP9000-PPSA13198_00-STELLARBLADECE00) |
| `stranded-deep-2` | 深陷荒境2 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/3976770/Stranded_Deep_2/?l=schinese) |
| `street fighter 6` | 街头霸王6 | 常用译名 | 编辑部核验 |
| `the-idolmaster-sidem` | 偶像大师 SideM | 常用译名 | 编辑部核验 |
| `the-witcher-3-wild-hunt-remastered` | 巫师 3：狂猎 — 重制版 | 官方简中/官方中文区名称 | [依据](https://www.bilibili.com/video/BV1XAhL65E5h/) |
| `under-night-in-birth-ii-sys-celes` | 夜下降生 II Sys:Celes | 官方简中/官方中文区名称 | [依据](https://www.arcsystemworks.jp/uni2celes/zh-hans/game/) |
| `until-dawn-2` | 直到黎明2 | 常用译名 | [依据](https://www.gamersky.com/news/202606/2151359.shtml) |
| `what-goes-up` | 越垒越高 | 常用译名 | [依据](https://www.3dmgame.com/news/202608/3951755.html) |
| `ylems-cat` | 伊始之猫 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/5123770/?l=schinese) |
| `yo-kai-watch-2-hadou` | 妖怪手表2：霸道 | 常用译名 | 编辑部核验 |
| `うみねこのなく頃に` | 海猫鸣泣之时 | 常用译名 | 编辑部核验 |
| `カリアのアトリエ` | 卡莉娅的炼金工房 ～夜之王国与追忆路标～ | 官方简中/官方中文区名称 | 既有归档 |
| `カリギュラ` | 卡里古拉 | 常用译名 | 编辑部核验 |
| `シドマイヤーズ シヴィライゼーション vii` | 席德·梅尔的文明VII | 官方简中/官方中文区名称 | [依据](https://store.2k.com/zh-CN/game/buy-civilization-7) |
| `ステラーコード` | 星辰密文 | 常用译名 | [依据](https://ku.gamersky.com/2024/stellar-code/) |
| `ダンジョンセトラーズ` | 地城拓荒 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/2798330/Dungeon_Settlers/?l=schinese) |
| `テトリス` | 俄罗斯方块 | 常用译名 | 编辑部核验 |
| `ドラゴンズドグマ 2 ダークアリズン` | 龙之信条2：黑暗觉者 | 常用译名 | [依据](https://www.gamersky.com/news/202606/2154155.shtml) |
| `メルブラ` | 月姬格斗：Twi-Lumina | 常用译名 | [依据](https://ku.gamersky.com/2026/melty-blood-twi-lumina/) |
| `モンスターハンターワイルズ アセンダンス` | 怪物猎人：荒野 凌越 | 常用译名 | [依据](https://www.gamersky.com/news/202609/2211466.shtml) |
| `ヨッシーアイランド` | 超级马力欧 耀西岛 | 常用译名 | 编辑部核验 |
| `ライフ イズ ストレンジ` | 奇异人生 | 常用译名 | 编辑部核验 |
| `uncanyon` | 未境峡谷 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/3372610/Uncanyon/?l=schinese) |
| `shapez` | 谜题工厂 - 异形工厂系列 | 官方简中/官方中文区名称 | [依据](https://puzzlez-game.io/) |
| `camp-dawn` | 黎明营地 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/5138140/Camp_Dawn_Acampamento_do_Amanhecer/?l=schinese) |
| `poko-a-pokemon` | Pokémon Pokopia | 官方简中/官方中文区名称 | [依据](https://www.pocoapokemon.jp/sc/) |
| `dust-till-dawn` | 清扫至天明 | 官方简中/官方中文区名称 | [依据](https://store.steampowered.com/app/4694470/Dust_till_Dawn/?l=schinese) |

## 收口补充

- `Uncanyon` → **未境峡谷**（Steam 简中正文）。
- `puzzlez - a shapez game` → **谜题工厂 - 异形工厂系列**（游戏官网 FAQ 明确给出 Chinese title）。
- `Camp Dawn` → **黎明营地**（Steam 简中商店名《Camp Dawn 黎明营地》）。
- `Dust till Dawn` → **清扫至天明**（Steam 简中本地化名称）。
- `ぽこ あ ポケモン` → **Pokémon Pokopia**（宝可梦官方简体中文网站商品名称；官方中文名本身为拉丁字母）。
- 2026-09-06 的 `Halloween: The Game` 因 title_key 变体未吸收既有 registry，本次补齐为 **月光光心慌慌**。

## 中国游戏全文中文化

- 《伊始之猫》：Molly / Mio → **莫莉 / 米欧**；图片说明与工作室署名同步中文化。
- 《源初之结》：HoYoverse → **米哈游**；Unreal Engine 5 → **虚幻引擎5**；展示层图片说明/署名同步中文化。
- 《无限大》：发行方显示为 **网易游戏**，开发团队显示为 **裸雨工作室**。
- 《洛克王国：世界》：MoreFun Studios → **腾讯魔方工作室群**。
- 《怪物猎人：旅人》：TiMi Studio Group / Capcom → **腾讯天美工作室群 / 卡普空**。
- 《原神》：miHoYo → **米哈游**，版本名使用中文。
- 《崩坏：星穹铁道》：miHoYo、版本副标题、地区/机构与角色名均改为中文展示。
- 《鸣潮》：3.7 版本名统一为 **“镜锁妄世，心照红尘”**；Hsin / Suoming → **“心” / “锁暝”**。

## 已检索但保留原名

以下游戏在本轮复核中未找到足够可靠、稳定的大陆中文译名，或官方简体中文/中文地区页面本身仍使用原名，因此不擅自造译名：

- iRacing Arcade
- DayZ: Cool Edition
- Panic Bomber W / Super Bomberman Collection
- 2XKO
- Lazy Witch’s Factory
- Astrae Oratio
- Apidya’ Special
- VHOLUME
- Warrior Spirits
- Mireglow
- Horror Prison: Escape
- Rizz Dungeon: Skeleton Key to My Heart
- PHANTOM OF INFERNO / NITRO ARCHIVE
- Isle of Reveries
- Withering Realms
- Marsupilami 2 – Salsa Palombia
- Mythmon: Mythic Monsters
- Culdcept The First Saturn Tribute
- Surviving Mars: Relaunched
- Dokimon Quest
- Sanitarium Enhanced
- Alien Breed 35th Anniversary Collection
- PUBG: DED.NET
- LEGO Skylines
- Exterminauts
- Afterworld
- Little Lake
- Wiz Generation
- Keroro军曹☆ Hachamecha TV Show
- DRAPLINE
- PixelJunk Monsters 3
- Volvy’s Adventure: Reslimed
- Escape from Playtime
- Sweetheart
- DNA NEMESIS
- Dumpster Gang
- Scott Pilgrim EX
- Alien Deathstorm
- Rogue Fortune
- Wishseeker
- 越え
- Caladrius2/Dark Element
- Iron Man
- 魔女の庭
- Avatar Legends: The Fighting Game
- NBA 2K27
- DRAGON BALL GEKISHIN SQUADRA
- Fate/EXTRA Record
- Warrior Cats: Clans of the Forest
- BOMBANANA!
- Rhapsody in Scarlet
- Echoes of Aincrad: Sword Art Online
- Bodycam
- Wreck Runners
- EA SPORTS NHL 27
- Project ZETA
- 東方紅魔郷：New Classic
- RULES OF RESIDENCE
- Thief Simulator 3: First Loot
- Lightspeed Lina
- Jupiter & Mars: Definitive Edition
- WARDOGS
- Hazard Pay
- Fit Boxing Touken Ranbu: Shutsujin! Exercise Honmaru
- Metroid Ravenous
- Chill with You: SHIOI’s Sparkling Scenes
- ほの暮しの庭
- CHEEKY CHEERHYTHM
- クレアラ・セレクト
- SUPER GAHAKU
- Infinity: HexaDome Tactics
- Living on Plain Pasta
- Dumb Ways to Build
- 歌マクロス
- 車で走れメロス
- VELVET CANDY TINT KISS
- 山食いドワーフ
- Romancing SaGa 3: Destiny United
- Summer Days
- Mary-san（メァリーさん）
- ベオグラードメトロの子供たち
- Road to Jukai
- Rogue Braver | 勇者ローグ
- ノロイあやし
- NOYAKI — CONTROLLED BURN
- EA SPORTS FC 27
- Bloomwalker
- Faraday Blues
- PHYSINT
- SophieChat:AI
- Get Us Out
- BrainWash: Zombie Cleanup
- パールインブルー
- KAELIS: Seraph Protocol
- CRACK
- BELTFED
- Shangri-La Frontier: Nanatsu no Saikyoshu
- World of Warcraft: Forever
- Rivage
- Farming Camp
- Dream Club ZERO R+
- Really Illegal Golf
- WANE
- Loftia
- Fish & Ships

其中 `EA SPORTS FC 27`、`EA SPORTS NHL 27`、`NBA 2K27`、`2XKO`、`Fate/EXTRA Record`、`Pokémon Pokopia` 等属于“中文地区官方页面仍使用原名/拉丁字母名”的典型情况；这不视为漏译。

## 不属于游戏译名对象

下列 `title_key` 实际是公司、活动、服务、硬件、行业事件或技术项目，不应为了消除 `unavailable` 而伪造“游戏中文名”：

- Compulsion Games
- Nintendo Switch 2（英国价格条目）
- Famitsu Japan Sales Chart
- gamescom 2026
- Xbox Layoffs Union Rally
- Nintendo Switch emulator repositories
- SNK Corporation
- thatgamepublisher
- PlayStation Plus Monthly Games
- Xbox 25th Anniversary Collection
- SEGA gamescom 2026 lineup
- Xbox × IKEA YXSTABY Collection
- Xbox disc-to-digital entitlement
- Unreal Engine 5 City Sample
- Xbox Free Play Days
- Sony Music Entertainment Japan / GungHo Online Entertainment
- Steam 数据泄漏
- State of Play
- Live TV on PS5
- Rovio Copenhagen
- Xbox Game Pass
- Supercell–Metacore acquisition
- Battlestate Games Publishing
- Double Fine Productions
- Bungie
- Nova Games Foundation
- Xbox Insider Console Features
- Rockstar Games labor tribunal
- LEVEL5
- SCP Foundation / V/H/S: SCP
- HORI Arcade Classic Pro
- Capcom
- PlayStation Pulse / Pulse Edge
- CD Projekt Red engine strategy
- Nex Playground

## 后续约束

新刊继续优先查询 registry；只有拿到官方简中/官方中文地区名称或稳定通行译名时才写入 `title_zh_cn`。中文游戏的公司、版本、角色与活动名称也应优先使用官方中文表达。

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { adoptTitleHints } from "./lib/title-knowledge.mjs";

const MODE = process.argv[2] || "prepare";
const ARCHIVE_ROOT = "public/data/archive";
const SNAPSHOT = "artifacts/title-translation-audit-snapshot.json";
const EVIDENCE = "artifacts/title-translation-audit-evidence.json";
const CACHE = "artifacts/title-translation-audit-cache.json";
const HINTS = "artifacts/title-translation-audit-hints.json";
const REPORT = "docs/TITLE_TRANSLATION_AUDIT_2026-09-22.md";
const REGISTRY = "config/title-translations.json";

const nonGameKeys = new Set([
  "compulsion-games","nintendo-switch-2-uk-price","famitsu-japan-sales-2026-08-03-16","gamescom-2026",
  "xbox-layoffs-union-rally","nintendo-switch-emulation-dmca","snk-corporation","thatgamepublisher",
  "playstation-plus-september-2026","xbox-25th-anniversary-collection","sega-gamescom-2026","xbox-ikea-yxstaby",
  "xbox-disc-digital-entitlement","unreal-engine-5-city-sample","xbox-free-play-days-2026-08-27",
  "sony-music-japan-gungho-alliance","steam2-data-leak","state-of-play","live-tv-on-ps5-app","rovio-copenhagen",
  "xbox-game-pass","supercell-metacore-acquisition","battlestate-games-publishing","xbox-tcl-partnership","double-fine",
  "bungie","microsd expressカード","nintendo direct 2026 9 9","nova-games-foundation","xbox-insider-console-features",
  "never-fight-alone","rockstar-games-labor-tribunal","level-5","scp-foundation-vhs-scp-film","hori-arcade-classic-pro",
  "capcom","playstation-pulse-headsets","cd-projekt-red-engine-strategy","nex-playground","sony-music-japan-gungho-alliance"
]);

const official = (titleZhCn, url, note) => ({ titleZhCn, titleZhStatus: "official_simplified", subjectType: "game",
  evidence: { kind: "official_source", url, note } });
const common = (titleZhCn, note, url = undefined) => ({ titleZhCn, titleZhStatus: "common_translation", subjectType: "game",
  evidence: { kind: "common_usage", ...(url ? { url } : {}), note } });
const existing = (titleZhCn, note) => ({ titleZhCn, titleZhStatus: "common_translation", subjectType: "game",
  evidence: { kind: "existing_archive", note } });

const seedTranslations = {
  "ylems-cat": official("伊始之猫", "https://store.steampowered.com/app/5123770/?l=schinese", "Steam 官方简体中文商店名；开发/发行方为钻石猫。"),
  "exodus": official("大迁离", "https://www.exodusgame.com/zh-CN", "官方简体中文站 FAQ 使用《大迁离》。"),
  "crescent-tower-rising": official("新月之塔 崛起", "https://store.steampowered.com/app/5019630/Crescent_Tower_RISING/?l=schinese", "Steam 官方简体中文商店名。"),
  "no-rest-for-the-wicked": official("恶意不息", "https://store.steampowered.com/app/1371980/No_Rest_for_the_Wicked/?l=schinese", "Steam 官方简体中文商店名。"),
  "powerwash-simulator": official("冲就完事模拟器", "https://store.steampowered.com/app/1290000/PowerWash_Simulator/?l=schinese", "Steam 官方简体中文商店名。"),
  "シドマイヤーズ シヴィライゼーション vii": official("席德·梅尔的文明VII", "https://store.2k.com/zh-CN/civilization", "2K 中国官方商店使用该简体中文名。"),
  "gran-turismo-7": official("跑车浪漫旅 7", "https://www.playstation.com/zh-hans-hk/games/gran-turismo-7/", "PlayStation 香港简体中文官方页。"),
  "call-of-duty-black-ops-7": official("使命召唤：黑色行动 7", "https://store.steampowered.com/app/3606480/Call_of_Duty_Black_Ops_7/?l=schinese", "Steam 官方简体中文页面使用该中文名。"),
  "pokemon-unite": official("宝可梦大集结", "https://www.pokemon.cn/game/16559.html", "宝可梦中国大陆官方网站。"),
  "aeterna-lucis": official("光之永恒", "https://store.steampowered.com/app/2710920/Aeterna_Lucis/?l=schinese", "Steam 官方简体中文正文明确使用《光之永恒》。"),
  "stranded-deep-2": official("深陷荒境2", "https://store.steampowered.com/app/3976770/Stranded_Deep_2/?l=schinese", "Steam 官方简体中文正文明确使用《深陷荒境2》。"),
  "hela-of-mice-and-magic": official("Hela：鼠术之间", "https://store.steampowered.com/app/3161310/Hela/?l=schinese", "Steam 官方简体中文正文使用《Hela：鼠术之间》。"),
  "ace-combat-8-wings-of-theve": official("空战奇兵8 希孚之翼", "https://www.playstation.com/zh-hans-hk/games/ace-combat-8-wings-of-theve/", "PlayStation 香港简体中文官方页。"),
  "stellar-blade-complete-edition": official("剑星 完整版", "https://www.playstation.com/zh-hans-hk/games/stellar-blade/", "PlayStation 香港简体中文官方页使用《剑星》与“完整版”。"),
  "ball-x-pit": official("球比伦战记", "https://store.steampowered.com/app/2062430/BALL_x_PIT/?l=schinese", "Steam 官方简体中文商店名为“BALL x PIT — 球比伦战记”。"),
  "cairn": official("孤山独影", "https://store.steampowered.com/app/1588550/Cairn/?l=schinese", "Steam 官方简体中文商店名。"),
  "honkai-star-rail": official("崩坏：星穹铁道", "https://www.bilibili.com/video/BV1rhei64EVA/", "《崩坏：星穹铁道》官方账号 4.6 版本 PV 使用该简体中文名。"),
  "code vein ii": existing("噬血代码II", "沿用仓库已登记的 code-vein-ii 中文名。"),
  "ドラゴンズドグマ 2 ダークアリズン": existing("龙之信条2：黑暗觉者", "沿用仓库已确认的同作中文名。"),
  "diablo-iv": existing("暗黑破坏神 IV", "同条历史正文已经使用该稳定中文名。"),
  "ディアブロ iv 憎悪の時代": existing("暗黑破坏神 IV", "同条历史正文已经使用该稳定中文名；“憎悪の時代”为版本/合集信息。"),
  "diablo-v": existing("暗黑破坏神 V", "同条历史正文已经使用该稳定中文名。"),
  "the-idolmaster-sidem": existing("偶像大师 SideM", "同条历史正文已经使用该稳定中文名。"),
  "カリアのアトリエ": existing("卡莉娅的炼金工房 ～夜之王国与追忆路标～", "同条历史正文已给出完整中文名。")
};

function archiveFiles() {
  const out = [];
  for (const year of fs.readdirSync(ARCHIVE_ROOT)) {
    const y = path.join(ARCHIVE_ROOT, year); if (!fs.statSync(y).isDirectory()) continue;
    for (const month of fs.readdirSync(y)) {
      const m = path.join(y, month); if (!fs.statSync(m).isDirectory()) continue;
      for (const name of fs.readdirSync(m)) if (name.endsWith(".json")) out.push(path.join(m, name));
    }
  }
  return out.sort();
}
function subjectName(item) {
  if (item?.title?.title_en) return item.title.title_en;
  const match = String(item?.headline || "").match(/《([^》]+)》/u);
  return match?.[1] || item?.title?.title_key || "";
}
function scanUnavailable() {
  const records = new Map();
  for (const file of archiveFiles()) {
    const doc = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const section of ["entries","upcoming"]) for (const item of doc[section] || []) {
      const title = item.title || {};
      if (title.title_zh_status !== "unavailable") continue;
      const key = title.title_key || title.title_en || item.id;
      if (!records.has(key)) records.set(key, { titleKey:key, titleEn:subjectName(item), titleEnVariants:[], occurrences:0, entryOccurrences:0, upcomingOccurrences:0, examples:[] });
      const record = records.get(key);
      const subject = subjectName(item);
      if (subject && !record.titleEnVariants.includes(subject)) record.titleEnVariants.push(subject);
      if (!record.titleEn && subject) record.titleEn = subject;
      record.occurrences += 1;
      if (section === "entries") record.entryOccurrences += 1; else record.upcomingOccurrences += 1;
      if (record.examples.length < 3) record.examples.push({ file, id:item.id, section, headline:item.headline || null });
    }
  }
  return [...records.values()].sort((a,b)=>a.titleKey.localeCompare(b.titleKey));
}
function writeJson(file, value) { fs.mkdirSync(path.dirname(file), {recursive:true}); fs.writeFileSync(file, JSON.stringify(value,null,2)+"\n"); }
function seedRegistry() {
  const registry = JSON.parse(fs.readFileSync(REGISTRY,"utf8"));
  for (const [key,value] of Object.entries(seedTranslations)) {
    if (registry.translations[key]?.evidence?.kind === "user_provided") continue;
    registry.translations[key] = { ...(registry.translations[key] || {}), ...value };
  }
  registry.updatedAt = "2026-09-22";
  const ordered = Object.fromEntries(Object.entries(registry.translations).sort(([a],[b])=>a.localeCompare(b)));
  registry.translations = ordered;
  writeJson(REGISTRY, registry);
}
function prepare() {
  const items = scanUnavailable();
  const files = archiveFiles();
  writeJson(SNAPSHOT, { generatedAt:new Date().toISOString(), archiveFileCount:files.length, items });
  seedRegistry();
  const packages = items.filter(item=>!nonGameKeys.has(item.titleKey)).map(item=>({
    eventKey:"title-audit:"+item.titleKey, eventKind:"game", titleKey:item.titleKey, subjectKey:item.titleEn
  })).filter(item=>item.subjectKey);
  writeJson(EVIDENCE, { schemaVersion:2, window:{id:"2026-09-22-title-audit"}, packages });
  console.log(`Prepared title audit: archives=${files.length}; unavailable keys=${items.length}; game candidates=${packages.length}; non-game=${items.length-packages.length}`);
}
function replaceVisibleStrings(entry, replacements) {
  for (const field of ["headline","summary"]) if (typeof entry[field] === "string") {
    for (const [from,to] of replacements) entry[field] = entry[field].split(from).join(to);
  }
  for (const image of entry.images || []) if (typeof image.alt === "string") {
    for (const [from,to] of replacements) image.alt = image.alt.split(from).join(to);
  }
}
function patchEntry(file,id,{headline,summary,replacements=[]}) {
  const doc = JSON.parse(fs.readFileSync(file,"utf8"));
  const entry = (doc.entries || []).find(item=>item.id===id);
  if (!entry) throw new Error(`Missing Chinese-localization target ${id} in ${file}`);
  if (headline) entry.headline = headline;
  if (summary) entry.summary = summary;
  replaceVisibleStrings(entry,replacements);
  writeJson(file,doc);
}
function patchChineseGames() {
  patchEntry("public/data/archive/2026/08/2026-08-25-pm.json","2026-08-25-pm-news-1",{
    headline:"少女与变形猫共斗的《伊始之猫》公布",
    summary:"中国团队钻石猫公开单人动作冒险游戏《伊始之猫》，玩家将扮演寻找失踪母亲的少女莫莉，与能变形的猫米欧协作战斗和探索濒死星球。Steam页面已上线，确认支持简体中文；目前仅公布PC版，尚无发售日期。",
    replacements:[["Ylem’s Cat","伊始之猫"],["Ylem's Cat","伊始之猫"],["Molly","莫莉"],["Mio","米欧"]]
  });
  patchEntry("public/data/archive/2026/08/2026-08-26-am.json","2026-08-26-am-news-0",{
    headline:"米哈游公布写实奇幻合作动作新作《源初之结》",
    summary:"米哈游首次公开采用虚幻引擎5的多人合作动作新作：玩家扮演“织者”，在神权崩塌的写实黑暗奇幻世界对抗神话生物；平台与日期尚未公布。",
    replacements:[["HoYoverse","米哈游"],["Unreal Engine 5","虚幻引擎5"]]
  });
  patchEntry("public/data/archive/2026/08/2026-08-26-am.json","2026-08-26-am-releases-0",{
    summary:"网易游戏雷火事业群旗下开发团队宣布，免费都市开放世界RPG《无限大》将登陆PS5、PC、iOS与Android；新预告展示以上海、杭州和东京为灵感的城市、载具、社交影响力与多角色切换。",
    replacements:[["Naked Rain","网易游戏雷火事业群旗下开发团队"]]
  });
  patchEntry("public/data/archive/2026/08/2026-08-26-am.json","2026-08-26-am-news-3",{
    summary:"腾讯魔方工作室群宣布全球版覆盖PS5、Xbox Series、PC、iOS与Android；封闭测试10月27日在PC与移动端开启，报名已开放，正式上线日尚未公布。",
    replacements:[["MoreFun Studios","魔方工作室群"]]
  });
  patchEntry("public/data/archive/2026/08/2026-08-26-am.json","2026-08-26-am-news-15",{
    summary:"腾讯天美工作室群与卡普空在新素材中首次展示本作原创古龙级怪物；项目面向iOS与Android，仍未公布正式上线日。",
    replacements:[["TiMi Studio Group","腾讯天美工作室群"],["Capcom","卡普空"]]
  });
  patchEntry("public/data/archive/2026/09/2026-09-13-daily.json","2026-09-13-daily-news-4",{
    summary:"据Gematsu转述米哈游公告，《原神》7.1版本“往冥府的安魂歌”将于2026年9月23日上线。",
    replacements:[["miHoYo","米哈游"]]
  });
  patchEntry("public/data/archive/2026/09/2026-09-21-daily.json","2026-09-21-daily-news-7",{
    headline:"《崩坏：星穹铁道》4.6版本定于9月28日上线",
    summary:"Gematsu报道，米哈游公布《崩坏：星穹铁道》4.6版本“月升之前，与兽共舞”，定于9月28日上线。新版本将推进开拓任务并开放全新场景“生研院”，同时加入5星冰属性欢愉角色真珠及新活动。",
    replacements:[["Honkai: Star Rail","崩坏：星穹铁道"],["miHoYo","米哈游"],["Dance With the Beast Before Moonrise","月升之前，与兽共舞"],["Pearl","真珠"]]
  });
}
function applyHints() {
  const registryBefore = JSON.parse(fs.readFileSync(REGISTRY,"utf8"));
  const hintReport = fs.existsSync(HINTS) ? JSON.parse(fs.readFileSync(HINTS,"utf8")) : {hints:[]};
  let registry = adoptTitleHints(registryBefore, hintReport.hints || [], "2026-09-22T00:00:00.000Z");
  // Avoid broad prose replacement side effects: exact title keys are sufficient for this historical backfill.
  for (const hint of hintReport.hints || []) {
    if (registry.translations[hint.titleKey]?.evidence?.kind === "automated_verified") delete registry.translations[hint.titleKey].titleEnAliases;
  }
  registry.updatedAt = "2026-09-22";
  registry.translations = Object.fromEntries(Object.entries(registry.translations).sort(([a],[b])=>a.localeCompare(b)));
  writeJson(REGISTRY,registry);
  execFileSync(process.platform==="win32"?"npm.cmd":"npm",["run","titles:backfill"],{stdio:"inherit"});
  patchChineseGames();
  buildReport();
}
function resolveRegistry(registry, item) {
  if (registry.translations[item.titleKey]) return registry.translations[item.titleKey];
  const norm = v=>String(v||"").replace(/[™®]/g,"").normalize("NFKC").toLowerCase().replace(/[\s\p{P}\p{S}]+/gu," ").trim();
  const name=norm(item.titleEn);
  return Object.values(registry.translations).find(v=>(v.titleEnAliases||[]).some(a=>norm(a)===name)) || null;
}
function md(value){ return String(value ?? "").replace(/\|/g,"\\|").replace(/\n/g," "); }
function buildReport() {
  const snap=JSON.parse(fs.readFileSync(SNAPSHOT,"utf8"));
  const registry=JSON.parse(fs.readFileSync(REGISTRY,"utf8"));
  const cache=fs.existsSync(CACHE)?JSON.parse(fs.readFileSync(CACHE,"utf8")):{records:{}};
  const rows=snap.items.filter(x=>!nonGameKeys.has(x.titleKey)).map(item=>{
    const hit=resolveRegistry(registry,item);
    const lookup=cache.records?.[item.titleKey];
    return {...item, hit, lookup};
  });
  const resolved=rows.filter(x=>x.hit?.titleZhCn);
  const officialRows=resolved.filter(x=>x.hit.titleZhStatus==="official_simplified");
  const commonRows=resolved.filter(x=>x.hit.titleZhStatus==="common_translation");
  const unresolved=rows.filter(x=>!x.hit?.titleZhCn);
  const resolvedOccurrences=resolved.reduce((n,x)=>n+x.occurrences,0);
  const nonGame=snap.items.filter(x=>nonGameKeys.has(x.titleKey));
  const sourceText = x => {
    const e=x.hit?.evidence || {};
    if (e.kind==="automated_verified") return (e.sources||[]).map(s=>s.url).join("<br>") || "自动核验来源";
    return e.url || e.note || "";
  };
  const lines=[];
  lines.push("# 历史归档游戏中文名审计（2026-09-22）","");
  lines.push("## 范围与口径","");
  lines.push(`- 扫描归档：${snap.archiveFileCount} 份。`);
  lines.push(`- 扫描时发现 \`title_zh_status: unavailable\` 的唯一键：${snap.items.length} 个；其中按归档语义判定为游戏/游戏版本候选 ${rows.length} 个，非游戏主题/公司/服务/硬件 ${nonGame.length} 个。`);
  lines.push(`- 本轮确认并登记中文名：${resolved.length} 个唯一游戏键（官方简体中文 ${officialRows.length}，稳定常用译名 ${commonRows.length}），覆盖历史归档中的 ${resolvedOccurrences} 次标题出现。`);
  lines.push(`- 检索后仍保留原名：${unresolved.length} 个唯一游戏键。保留原因统一为：未确认可靠的官方简中名或稳定常用译名；不做机器直译、不自造译名。`);
  lines.push("- 自动检索只用于游戏名称：候选来源必须被实际打开，中文名必须逐字出现在来源页面；官方简中优先，常用译名要求独立来源交叉验证。","");
  lines.push("## 已确认并替换","");
  lines.push("| 原名 / title_key | 中文名 | 状态 | 出现次数 | 依据 |","|---|---|---|---:|---|");
  for(const x of resolved) lines.push(`| ${md(x.titleEn || x.titleKey)}<br>\`${md(x.titleKey)}\` | ${md(x.hit.titleZhCn)} | ${x.hit.titleZhStatus==="official_simplified"?"官方简中":"常用译名"} | ${x.occurrences} | ${md(sourceText(x))} |`);
  lines.push("","## 检索后保留原名","");
  lines.push("| 原名 / title_key | 出现次数 | 检索结果 |","|---|---:|---|");
  for(const x of unresolved) {
    const outcome=x.lookup?.outcome || "not-found";
    const label=outcome==="error"?"检索受限/来源验证失败；未据此采用译名":"未找到通过来源验证的官方简中名或双来源稳定常用译名";
    lines.push(`| ${md(x.titleEn || x.titleKey)}<br>\`${md(x.titleKey)}\` | ${x.occurrences} | ${label} |`);
  }
  lines.push("","## 中国游戏可见信息中文化","");
  lines.push("- 《伊始之猫》：游戏名改用官方简中；Molly → 莫莉，Mio → 米欧；开发/发行方保持官方中文“钻石猫”。");
  lines.push("- 《源初之结》：HoYoverse → 米哈游；Unreal Engine 5 → 虚幻引擎5。");
  lines.push("- 《无限大》：不自造 Naked Rain 的中文公司名，改写为“网易游戏雷火事业群旗下开发团队”，避免正文残留英文工作室名。");
  lines.push("- 《洛克王国：世界》：MoreFun Studios → 腾讯魔方工作室群。");
  lines.push("- 《怪物猎人：旅人》：TiMi Studio Group → 腾讯天美工作室群；Capcom → 卡普空。");
  lines.push("- 《原神》：miHoYo → 米哈游。");
  lines.push("- 《崩坏：星穹铁道》：Honkai: Star Rail → 崩坏：星穹铁道；miHoYo → 米哈游；4.6版本副标题改为“月升之前，与兽共舞”；Pearl → 真珠；场景使用官方中文“生研院”。","");
  lines.push("## 非游戏键","");
  lines.push("以下 unavailable 键属于公司、活动、硬件、服务或行业主题，不作为“游戏译名缺失”强行翻译：");
  lines.push(nonGame.map(x=>`\`${x.titleKey}\``).join("、") + "。","");
  lines.push("## 修改边界","");
  lines.push("- 保留 \`title_en\`、来源 URL、来源标签、事实状态、时间状态、期号、时间窗口和事件事实不变。");
  lines.push("- 只补齐已核验的 \`title_zh_cn/title_zh_status\`，并由现有 \`titles:backfill\` 同步标题、摘要、生成式图片 alt 与 lead archiveTitle。");
  lines.push("- 中国游戏专项只改可见中文表述，不改证据字段；没有可靠官方中文称呼的专名不擅自造词。","");
  fs.writeFileSync(REPORT,lines.join("\n")+"\n");
  console.log(`Audit report: resolved=${resolved.length}; unresolved=${unresolved.length}; report=${REPORT}`);
}
if (MODE==="prepare") prepare();
else if (MODE==="apply") applyHints();
else throw new Error("mode must be prepare or apply");

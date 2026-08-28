import fs from "node:fs";

function replaceOnce(text, before, after, label) {
  if (!text.includes(before)) throw new Error(`Patch target not found: ${label}`);
  return text.replace(before, after);
}

const registryPath = "config/title-translations.json";
const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
registry.updatedAt = "2026-08-28";
Object.assign(registry.translations, {
  "whisper-of-the-house": {
    titleZhCn: "呓语小镇",
    titleZhStatus: "official_simplified",
    titleEnAliases: ["Whisper of the House"],
    evidence: {
      kind: "official_source",
      url: "https://store.steampowered.com/app/2589500/Whisper_of_the_House/?l=schinese",
      note: "Steam 官方简体中文商店名"
    }
  },
  "fountains": {
    titleZhCn: "永泉传说",
    titleZhStatus: "official_simplified",
    titleEnAliases: ["FOUNTAINS", "Fountains"],
    evidence: {
      kind: "official_source",
      url: "https://store.steampowered.com/app/1841240/FOUNTAINS?l=schinese",
      note: "Steam 官方简中名称显示为‘永泉传说 FOUNTAINS’，中文显示名取其官方中文部分"
    }
  },
  "shattered-shape": {
    titleZhCn: "破碎之形",
    titleZhStatus: "official_simplified",
    titleEnAliases: ["Shattered Shape"],
    evidence: {
      kind: "official_source",
      url: "https://store.steampowered.com/app/1841240/FOUNTAINS?l=schinese",
      note: "Steam 官方简中 FOUNTAINS 页面列出 DLC‘永泉传说 —— 破碎之形’"
    }
  },
  "final-fantasy-vii-ever-crisis": {
    titleZhCn: "最终幻想7：永恒危机",
    titleZhStatus: "official_simplified",
    titleEnAliases: ["FINAL FANTASY VII EVER CRISIS", "Final Fantasy VII Ever Crisis", "Final Fantasy VII: Ever Crisis"],
    evidence: {
      kind: "official_source",
      url: "https://play.google.com/store/apps/details?hl=zh&id=com.square_enix.android_googleplay.ff7ecww",
      note: "Square Enix 的 Google Play 中文页面正文使用《最终幻想7：永恒危机》"
    }
  },
  "gravhounds": {
    titleZhCn: "重力猎犬",
    titleZhStatus: "common_translation",
    titleEnAliases: ["Gravhounds", "GRAVHOUNDS"],
    evidence: {
      kind: "common_usage",
      url: "https://store.steampowered.com/app/2440760/GRAVHOUNDS?l=schinese",
      note: "编辑部确认的常用译名；Steam 当前未提供中文名称"
    }
  },
  "militsioner": {
    titleZhCn: "警目如炬",
    titleZhStatus: "official_simplified",
    titleEnAliases: ["Militsioner"],
    evidence: {
      kind: "official_source",
      url: "https://store.steampowered.com/app/1373530/Militsioner/?l=schinese",
      note: "Steam 官方简体中文商店名"
    }
  }
});
registry.translations = Object.fromEntries(Object.entries(registry.translations).sort(([a], [b]) => a.localeCompare(b)));
fs.writeFileSync(registryPath, `${JSON.stringify(registry, null, 2)}\n`);

const helperPath = "scripts/lib/title-translations.mjs";
let helper = fs.readFileSync(helperPath, "utf8");
helper = replaceOnce(helper,
`export function localizeHeadline(headline, { titleEn = null, titleZhCn = null } = {}) {\n`,
`export function localizeRegisteredTitles(text) {\n  if (typeof text !== "string" || !text) return text;\n  const pairs = Object.values(titleTranslations).flatMap((item) => {\n    const chinese = typeof item.titleZhCn === "string" ? item.titleZhCn.trim() : "";\n    if (!chinese) return [];\n    return (item.titleEnAliases || []).map((english) => [String(english).trim(), chinese]);\n  }).filter(([english, chinese]) => english && chinese && english !== chinese)\n    .sort((a, b) => b[0].length - a[0].length);\n  let localized = text;\n  for (const [english, chinese] of pairs) localized = localized.split(english).join(chinese);\n  return localized;\n}\n\nexport function localizeHeadline(headline, { titleEn = null, titleZhCn = null } = {}) {\n`, "registered title localizer");
fs.writeFileSync(helperPath, helper);

const backfillPath = "scripts/backfill-title-translations.mjs";
let backfill = fs.readFileSync(backfillPath, "utf8");
backfill = replaceOnce(backfill,
`import { getRegisteredTitleTranslation, localizeHeadline } from "./lib/title-translations.mjs";`,
`import { getRegisteredTitleTranslation, localizeHeadline, localizeRegisteredTitles } from "./lib/title-translations.mjs";`, "backfill import");
backfill = replaceOnce(backfill,
`  const next = localizeHeadline(entry.headline, { titleEn: entry.title?.title_en, titleZhCn: entry.title?.title_zh_cn });\n  if (next !== entry.headline) {\n    entry.headline = next;\n    stats.headlines += 1;\n    stats.headlineKeys.add(entry.title?.title_key || entry.id);\n    changed = true;\n  }\n  return changed;`,
`  const next = localizeRegisteredTitles(localizeHeadline(entry.headline, { titleEn: entry.title?.title_en, titleZhCn: entry.title?.title_zh_cn }));\n  if (next !== entry.headline) {\n    entry.headline = next;\n    stats.headlines += 1;\n    stats.headlineKeys.add(entry.title?.title_key || entry.id);\n    changed = true;\n  }\n  const nextSummary = localizeRegisteredTitles(entry.summary);\n  if (nextSummary !== entry.summary) {\n    entry.summary = nextSummary;\n    stats.summaries += 1;\n    changed = true;\n  }\n  return changed;`, "backfill headline and summary");
backfill = replaceOnce(backfill,
`    const next = localizeHeadline(document.archiveTitle, { titleEn: lead.title?.title_en, titleZhCn: lead.title?.title_zh_cn });`,
`    const next = localizeRegisteredTitles(localizeHeadline(document.archiveTitle, { titleEn: lead.title?.title_en, titleZhCn: lead.title?.title_zh_cn }));`, "archive title localization");
backfill = replaceOnce(backfill,
`const makeStats = () => ({ files:0, occurrences:0, keys:new Set(), headlines:0, headlineKeys:new Set(), archiveTitles:0 });`,
`const makeStats = () => ({ files:0, occurrences:0, keys:new Set(), headlines:0, headlineKeys:new Set(), summaries:0, archiveTitles:0 });`, "summary stats");
backfill = replaceOnce(backfill,
`console.log(\`Title backfill: \${archiveStats.keys.size} key(s), \${archiveStats.occurrences} title occurrence(s), \${archiveStats.headlines} headline(s), \${archiveStats.archiveTitles} archive title(s), \${archiveStats.files} archive file(s).\`);\nconsole.log(\`Latest: \${latestStats.occurrences} title(s), \${latestStats.headlines} headline(s), \${latestStats.archiveTitles} archive title(s), changed=\${latestStats.files > 0}.\`);`,
`console.log(\`Title backfill: \${archiveStats.keys.size} key(s), \${archiveStats.occurrences} title occurrence(s), \${archiveStats.headlines} headline(s), \${archiveStats.summaries} summary(s), \${archiveStats.archiveTitles} archive title(s), \${archiveStats.files} archive file(s).\`);\nconsole.log(\`Latest: \${latestStats.occurrences} title(s), \${latestStats.headlines} headline(s), \${latestStats.summaries} summary(s), \${latestStats.archiveTitles} archive title(s), changed=\${latestStats.files > 0}.\`);`, "backfill log");
fs.writeFileSync(backfillPath, backfill);

const publisherPath = "scripts/lib/edition-publisher.mjs";
let publisher = fs.readFileSync(publisherPath, "utf8");
publisher = replaceOnce(publisher,
`import { localizeHeadline, resolveTitleTranslation } from "./title-translations.mjs";`,
`import { localizeHeadline, localizeRegisteredTitles, resolveTitleTranslation } from "./title-translations.mjs";`, "publisher import");
publisher = replaceOnce(publisher,
`      headline: localizeHeadline(decision.headline, { titleEn: title.title_en, titleZhCn: title.title_zh_cn }),\n      summary: decision.summary,`,
`      headline: localizeRegisteredTitles(localizeHeadline(decision.headline, { titleEn: title.title_en, titleZhCn: title.title_zh_cn })),\n      summary: localizeRegisteredTitles(decision.summary),`, "publisher visible copy");
publisher = replaceOnce(publisher,
`  const archiveTitle = localizeHeadline(editorial.archiveTitle, { titleEn: leadEntry.title?.title_en, titleZhCn: leadEntry.title?.title_zh_cn });`,
`  const archiveTitle = localizeRegisteredTitles(localizeHeadline(editorial.archiveTitle, { titleEn: leadEntry.title?.title_en, titleZhCn: leadEntry.title?.title_zh_cn }));`, "publisher archive title");
fs.writeFileSync(publisherPath, publisher);

const testPath = "scripts/title-translations.test.mjs";
fs.writeFileSync(testPath, `import { describe, expect, it } from "vitest";\nimport { getRegisteredTitleTranslation, localizeRegisteredTitles } from "./lib/title-translations.mjs";\n\ndescribe("registered title copy localization", () => {\n  it("resolves the supplied current-edition titles", () => {\n    expect(getRegisteredTitleTranslation("whisper-of-the-house", "Whisper of the House")?.titleZhCn).toBe("呓语小镇");\n    expect(getRegisteredTitleTranslation("gravhounds", "Gravhounds")?.titleZhCn).toBe("重力猎犬");\n    expect(getRegisteredTitleTranslation("militsioner", "Militsioner")?.titleZhCn).toBe("警目如炬");\n  });\n\n  it("localizes secondary game and DLC names inside body copy", () => {\n    expect(localizeRegisteredTitles("《FOUNTAINS》推出 Shattered Shape DLC")).toBe("《永泉传说》推出 破碎之形 DLC");\n    expect(localizeRegisteredTitles("FINAL FANTASY VII EVER CRISIS 更新")).toBe("最终幻想7：永恒危机 更新");\n  });\n});\n`);

console.log("Applied supplied title translations and visible-copy localization patches.");

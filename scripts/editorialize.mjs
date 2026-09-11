import { showcaseEvidencePackages } from "./lib/showcase.mjs";
import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildEditorialInput, editorialSchema } from "./lib/editorial-contract.mjs";
import { collectReleaseCalendar, boundCalendarReport } from "./lib/release-calendar-discovery.mjs";
import { loadCanonicalUpcomingBaseline } from "./lib/upcoming-baseline.mjs";

const EVIDENCE_PATH = resolve(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json");
const LEDGER_PATH = resolve(process.env.EVENT_LEDGER_PATH || "artifacts/event-ledger.json");
const TITLE_HINTS_PATH = resolve(process.env.TITLE_HINTS_PATH || "artifacts/title-hints.json");
const PACKET_PATH = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");
const MAX_INPUT_CHARS = Number(process.env.EDITORIAL_MAX_INPUT_CHARS || 120000);

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
let ledger = null;
try { ledger = JSON.parse(await readFile(LEDGER_PATH, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
let titleHintReport = null;
try { titleHintReport = JSON.parse(await readFile(TITLE_HINTS_PATH, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}

const evidenceSubjects = new Set((evidence.packages || [])
  .map((item) => String(item.subjectKey || "").trim().toLocaleLowerCase("en-US"))
  .filter(Boolean));
const eligibleTitleHints = titleHintReport?.hints || [];
const titleHintReserve = eligibleTitleHints.length ? JSON.stringify(eligibleTitleHints).length : 0;
if (titleHintReserve >= MAX_INPUT_CHARS) throw new Error("title hints exceed the editorial input budget");

let calendarBaseline;
let calendarDiscovery;
if (evidence.window.period === "daily") {
  const [latest, manifest, config, titleRegistry] = await Promise.all([
    "public/data/latest.json", "public/data/manifest.json", "config/release-calendar-sources.json", "config/title-translations.json",
  ].map(path => readFile(path, "utf8").then(JSON.parse)));
  const editionDate = evidence.window.id.slice(0, 10);
  calendarBaseline = await loadCanonicalUpcomingBaseline({ latest, manifest, editionDate });
  const reportPath = resolve(process.env.RELEASE_CALENDAR_REPORT_PATH || "artifacts/release-calendar-discovery.json");
  let report;
  if (process.env.REUSE_RELEASE_CALENDAR_REPORT === "true") {
    report = JSON.parse(await readFile(reportPath, "utf8"));
    if (report.editionDate !== editionDate) throw new Error("release calendar discovery belongs to a different edition date");
  } else report = await collectReleaseCalendar({ config, editionDate, baseline: calendarBaseline.items, titleRegistry });
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n");
  calendarDiscovery = boundCalendarReport(report);
  console.log("Calendar coverage: " + JSON.stringify(report.coverage));
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, "\n### Release calendar discovery\n\n" + report.coverage.map(s => `- ${s.sourceId}: ${s.status}, ${s.inWindow} rows in window`).join("\n") + `\n\n${calendarDiscovery.candidates.length} candidate rows in packet; ${calendarDiscovery.omittedCandidates} omitted by limits. Discovery requires primary-source verification.\n`);
}
const calendarReserve = calendarBaseline ? JSON.stringify(calendarBaseline).length + JSON.stringify(calendarDiscovery).length : 0;
let showcaseReport = { events: [], announcements: [], coverage: [] };
try { showcaseReport = JSON.parse(await readFile(process.env.SHOWCASE_REPORT_PATH || "artifacts/showcase-evidence.json", "utf8")); } catch (error) { if (error.code !== "ENOENT") throw error; }
const showcaseManifest = { events: showcaseReport.events, announcements: showcaseReport.announcements.map(({ id, showcaseId, factUnits }) => ({ id, showcaseId, ...(factUnits ? { factUnits: factUnits.map(({ id }) => ({ id })) } : {}) })), coverage: showcaseReport.coverage };
const showcaseReserve = showcaseManifest.events.length ? JSON.stringify(showcaseManifest).length : 0;
const extraPackages = showcaseEvidencePackages(showcaseReport);
const combinedEvidence = { ...evidence, packages: [...evidence.packages, ...extraPackages].sort((a, b) => Number(b.tier === "A") - Number(a.tier === "A") || (b.score || 0) - (a.score || 0)) };
const inputLimit = MAX_INPUT_CHARS - titleHintReserve - calendarReserve - showcaseReserve;
const editorialInput = buildEditorialInput(combinedEvidence, inputLimit, ledger);
if (showcaseManifest.events.length) editorialInput.showcases = showcaseManifest;
const delivered = new Set(editorialInput.packages.map(item => item.eventKey));
let remaining = combinedEvidence.packages.filter(item => !delivered.has(item.eventKey) && item.sources?.some(source => source.status === "opened" && source.evidenceText));
const continuationInputs = [];
while (remaining.length) {
  const showcaseRemaining = remaining.filter(item => item.showcaseRefs?.length);
  const input = buildEditorialInput({ ...evidence, packages: showcaseRemaining.length ? showcaseRemaining : remaining }, inputLimit, null);
  if (!input.packages.length) throw new Error("an evidence item cannot fit in a bounded continuation packet");
  if (showcaseManifest.events.length) input.showcases = showcaseManifest;
  continuationInputs.push(input);
  const consumed = new Set(input.packages.map(item => item.eventKey));
  remaining = remaining.filter(item => !consumed.has(item.eventKey));
}
// The lookup report already limits hints to current news/calendar/queued names.
// Keep calendar hints even when the same game has no news in this packet.
const titleHints = eligibleTitleHints;
const titleHintChars = titleHints.length ? JSON.stringify(titleHints).length : 0;
editorialInput.titleHints = titleHints;
editorialInput.budget.maxInputChars = MAX_INPUT_CHARS;
editorialInput.budget.usedInputChars += titleHintChars + showcaseReserve;
editorialInput.budget.estimatedInputTokens = Math.ceil(editorialInput.budget.usedInputChars / 4);
editorialInput.budget.titleHintItems = titleHints.length;

if (calendarBaseline) {
  editorialInput.upcomingBaseline = calendarBaseline;
  editorialInput.upcomingDiscovery = calendarDiscovery;
  editorialInput.budget.usedInputChars += calendarReserve;
  editorialInput.budget.estimatedInputTokens = Math.ceil(editorialInput.budget.usedInputChars / 4);
}

if (editorialInput.budget.usedInputChars > MAX_INPUT_CHARS) {
  throw new Error("editorial input exceeds the character budget after title hints and upcoming baseline");
}

const generatedAt = new Date().toISOString();
const cutoffAt = new Date(`${editorialInput.window.windowEnd.replace(" ", "T")}:00+08:00`).toISOString();
if (Date.parse(generatedAt) < Date.parse(cutoffAt)) {
  throw new Error(`Cannot finalize ${editorialInput.window.id} before ${cutoffAt}`);
}
const instructions = [
  "发布会条目须用coveredFactIds登记正文或简讯实际覆盖的showcaseFacts；同一页面、同一游戏不等于全部事实已覆盖。未核验事实继续needs_review，不因热度或预算排除。",
  "输出 contractVersion=2。你是游戏行业简报编辑；事件事实仅来自已打开的 packet 证据。对 packages 和 trackingQueue 每个 eventKey 恰好给一个 include/exclude/needs_review。needs_review 必须 tracking=true；跟踪项无新证据也须明确继续或关闭，关闭时 tracking=false 且 reason 写依据。",
  "从 automation/status/<edition-id>.json 原样复制 packet.blobSha 到 packetBlobSha；不得使用可变分支 HEAD。publishability=requires_subject_identity 只能 exclude/needs_review，不得从标题虚构 titleKey/titleEn。",
  "lane=interviews、features、industry、reviews、awards 可按文章/采访/评测/分析/奖项信息本身首次发布的时间准入，但必须有明确的信息增量（首次披露、独立采访、调查、技术/产业分析、正式评分或奖项变化）。普通观点、推荐、促销软文、无新增信息的旧闻复述仍应 exclude。不得把窗口外旧事件伪装成窗口内 breaking news；标题摘要须体现本次新增内容。",
  "official 要求已打开一手来源；multi_source_verified 要求两家独立可靠来源，A级也不豁免时间/来源要求。未确认内容仅进 rumors，tracking=true，标题摘要保留不确定性。中英文新闻标题和archiveTitle须自带明确的游戏、公司或人物主语，离开上方主体栏仍能独立理解。中文直述具体事实，verification 说明证据边界，不用宣传套话。",
  "每个 include 决定必须填写完整 sharedFactFrame，作为两种语言共用的事实边界；subjectTitleKey/platforms 必须与最终 Canonical 决定一致，日期、时刻、数字、人物机构、版本专名只能来自所选证据，不得新增。",
  "中文游戏名依次查 config/title-translations.json、editorialInput.titleHints，仍缺才做 title-only open-web lookup。优先官方简中，其次已查证广泛使用的 common_translation；否则保留原名，titleZhCn=null、titleZhStatus=unavailable。禁止机翻/自造名称。有官方大陆简中渠道的游戏，版本、角色、职业、模式、机制等采用大陆官方术语。所有名称/术语查询仅规范名称，不得增加事件事实、时间、平台、发行信息、来源分类、tracking 或候选。",
  "默认尝试完整 locales.en：在相同 include/sharedFactFrame 内独立写自然英文，优先英文一手证据正式专名；只有中文证据也不得扩充事实。entries 按 include 顺序以 eventKey 对应，upcoming 仅按 upcomingId 对应本次 patch，继承项不重复。headline/summary/verification/timeNote 必须完整英文，无中文 fallback；sourceReport 完整英文或 null，其余显示字段按需提供英文。",
  "如果无法在事实边界内可靠完成完整英文稿，可以省略 locales.en；publisher 标记 unavailable，不能削弱中文 Canonical 来迁就英文。不要填写 factsDigest/canonicalCopyDigest/localeDigest 或猜最终 entryId，均由 trusted publisher 生成绑定。",
  "archiveTitle 对应 period：日报｜、早报｜、晚报｜；英文对应 Daily Brief |、Morning Brief |、Evening Brief |。Daily 窗口为前日10:10 exclusive 至当日10:10 inclusive，plannedAt=当日12:00；10:10—12:00 新事实属于下一期，历史迁移窗口以 packet 为准。",
  "早报 upcomingMode=replace 重建未来15天；晚报 inherit_and_patch。日报必须使用 upcomingMode=inherit_and_patch，不复制 upcomingBaseline.items；不要因为本次 packet 没有新的发售证据而提交空表覆盖历史。trusted publisher 继承 Canonical 基线并剔除当日及15天窗口外项。仅提交新增/变更 upcoming 或有证据支持延期取消的 removeUpcomingIds，必须有 HTTPS 来源。",
  "upcomingBaseline.refreshRange 是 packet-only 的唯一日历例外：每天核验完整 startInclusive—endInclusive，不把旧期次当作已完成核验。打开开发商/发行商公告或 PlayStation/Nintendo/Xbox/Steam 官方页面；新查事实仅用于日历，不得改变新闻 packages/trackingQueue 决定、正文、时间、factStatus、来源分类或 tracking。无可靠来源不填充，不因发现失败删除条目。",
  "upcomingDiscovery 仅是线索。优先 knownTitle、crossSource、inBaseline=false；采用前打开官方详情，核对完整游戏身份、日期、平台、地区和正式版/抢先体验/移植/DLC。日期冲突不可猜选，reviewLinks 是待阅读文章而非游戏项。对 PC/PlayStation/Xbox/Nintendo 分别检查完整15天；coverage 为 failed/empty_or_changed、列表不全或 omittedCandidates>0 时针对补查，并在 sourceReport 记录实际检查和缺口，不得声称全量覆盖。"
].join("\n");
const packet = {
  schemaVersion: 3,
  generatedAt,
  finalizedAt: generatedAt,
  coverageThrough: editorialInput.window.windowEnd,
  mode: "chatgpt-handoff",
  instructions,
  outputSchema: editorialSchema,
  editorialInput,
};
await mkdir(dirname(PACKET_PATH), { recursive: true });
await writeFile(PACKET_PATH, JSON.stringify(packet, null, 2) + "\n");
const batchDirectory = resolve(dirname(PACKET_PATH), "editorial-batches");
await mkdir(batchDirectory, { recursive: true });
await writeFile(resolve(batchDirectory, "showcase-evidence.json"), JSON.stringify(showcaseReport, null, 2) + "\n");
const queue = { schemaVersion: 1, editionId: editorialInput.window.id, totalAnnouncements: showcaseManifest.announcements.length, initialEventKeys: editorialInput.packages.map(item => item.eventKey), batches: [] };
queue.requiredFacts = Object.fromEntries(showcaseManifest.announcements.map(item => [item.id, (item.factUnits || []).map(fact => fact.id)]));
const initialShowcase = editorialInput.packages.filter(item => item.showcaseRefs?.length);
if (initialShowcase.length) {
  const name = `${editorialInput.window.id}-showcase-initial.json`;
  const input = { ...editorialInput, packages: initialShowcase, trackingQueue: [] };
  delete input.upcomingBaseline;
  delete input.upcomingDiscovery;
  await writeFile(resolve(batchDirectory, name), JSON.stringify({ ...packet, editorialInput: input, continuation: { index: 0, scope: "showcase", preservePublished: true } }, null, 2) + "\n");
  queue.batches.push({ name, scope: "showcase", status: "awaiting_retry", eventKeys: initialShowcase.map(item => item.eventKey) });
}
for (const [index, input] of continuationInputs.entries()) {
  input.titleHints = eligibleTitleHints;
  input.budget.usedInputChars += titleHintReserve + showcaseReserve;
  input.budget.maxInputChars = MAX_INPUT_CHARS;
  const continuation = { ...packet, editorialInput: input, continuation: { index: index + 1, scope: input.packages.every(item => item.showcaseRefs?.length) ? "showcase" : "news", preservePublished: true } };
  const name = `${editorialInput.window.id}-${index + 1}.json`;
  await writeFile(resolve(batchDirectory, name), JSON.stringify(continuation, null, 2) + "\n");
  queue.batches.push({ name, scope: continuation.continuation.scope, status: "pending", eventKeys: input.packages.map(item => item.eventKey) });
}
await writeFile(resolve(batchDirectory, "queue.json"), JSON.stringify(queue, null, 2) + "\n");
console.log(`Editorial packet: ${editorialInput.packages.length} packages; title hints=${titleHints.length}; estimated reading=${editorialInput.budget.estimatedInputTokens} tokens`);
console.log(`Packet: ${PACKET_PATH}`);

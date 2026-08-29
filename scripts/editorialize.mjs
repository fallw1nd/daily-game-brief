import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildEditorialInput, editorialSchema } from "./lib/editorial-contract.mjs";

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
const eligibleTitleHints = (titleHintReport?.hints || []).filter((hint) =>
  evidenceSubjects.has(String(hint?.subjectKey || "").trim().toLocaleLowerCase("en-US"))
);
const titleHintReserve = eligibleTitleHints.length ? JSON.stringify(eligibleTitleHints).length : 0;
if (titleHintReserve >= MAX_INPUT_CHARS) throw new Error("title hints exceed the editorial input budget");

const editorialInput = buildEditorialInput(evidence, MAX_INPUT_CHARS - titleHintReserve, ledger);
const packetSubjects = new Set(editorialInput.packages
  .map((item) => String(item.subjectKey || "").trim().toLocaleLowerCase("en-US"))
  .filter(Boolean));
const titleHints = eligibleTitleHints.filter((hint) =>
  packetSubjects.has(String(hint?.subjectKey || "").trim().toLocaleLowerCase("en-US"))
);
const titleHintChars = titleHints.length ? JSON.stringify(titleHints).length : 0;
editorialInput.titleHints = titleHints;
editorialInput.budget.maxInputChars = MAX_INPUT_CHARS;
editorialInput.budget.usedInputChars += titleHintChars;
editorialInput.budget.estimatedInputTokens = Math.ceil(editorialInput.budget.usedInputChars / 4);
editorialInput.budget.titleHintItems = titleHints.length;
if (editorialInput.budget.usedInputChars > MAX_INPUT_CHARS) {
  throw new Error("editorial input exceeds the character budget after title hints");
}

const generatedAt = new Date().toISOString();
const cutoffAt = new Date(`${editorialInput.window.windowEnd.replace(" ", "T")}:00+08:00`).toISOString();
if (Date.parse(generatedAt) < Date.parse(cutoffAt)) {
  throw new Error(`Cannot finalize ${editorialInput.window.id} before ${cutoffAt}`);
}
const instructions = [
  "你是游戏行业简报编辑。事件事实只能依据证据包判断，不得补写证据中没有的事实。",
  "输出 contractVersion=2。每个事件给出 include、exclude 或 needs_review；A级事实也必须满足来源与时间要求。",
  "每个 include 决定必须填写完整 sharedFactFrame；它是中英文共同的事实边界，subjectTitleKey、日期、时刻、数字、平台、人物/机构、版本/专名只能来自已选证据与该决定本身，不得加入任何语言版本独有的新事实。",
  "官方状态必须存在已打开的一手来源；只有两家独立可靠来源才可标 multi_source_verified。未确认内容只能进入 rumors，必须 tracking=true，并在标题与摘要中保留不确定性。",
  "游戏中文名先复用 config/title-translations.json。registry miss 时先检查 editorialInput.titleHints；候选名只可作为作品名称证据。没有可用 titleHint 时，才允许做窄范围 title-only open-web lookup：优先官方简中名称；否则仅采用稳定、广泛使用的 common_translation；两者都没有则保留原名并设 titleZhCn=null、titleZhStatus=unavailable。严禁机器直译或临时自造译名。",
  "titleHints 与标题查询绝不能补充事件事实、时间、平台、发行信息、source classification、tracking 决策或新候选。",
  "对于存在官方中国大陆简体中文渠道/站点的游戏，版本副标题、角色/干员、职业、模式、机制等专名优先采用官方大陆简中写法；术语查询只能规范已经存在于证据中的专名，不能扩展事实。",
  "中文 headline、summary、verification、timeNote 保持当前中文编辑规范：标题直述事件，摘要写具体信息，verification说明证据边界，不使用宣传语和套话。",
  "尽力同时生成 locales.en。英文不是逐句翻译中文，而是在完全相同的 include 决定与 sharedFactFrame 内独立写成自然、简洁的英文编辑文案；有英文一手证据时优先参考其正式专名，只有中文证据时可自然转述，但不得改变事实范围。",
  "locales.en.entries 必须按 include 决定的顺序，以 eventKey 一一对应；locales.en.upcoming 必须按本次提交的 upcoming 顺序，以 upcomingId 一一对应。英文 archiveTitle 早报以 'Morning Brief |' 开头，晚报以 'Evening Brief |' 开头。",
  "英文 headline、summary、verification、timeNote 必须是完整英文，不得用中文正文作 fallback；sourceReport 若提供必须完整英文，否则设为 null。source label、region/releaseType 等只有需要人工英文显示时才填写对应文案。",
  "不要计算或填写 factsDigest、canonicalCopyDigest、localeDigest，也不要猜最终 entryId；可信 publisher 会在 Canonical entry ID 确定后绑定并计算 digest。",
  "英文是非阻塞展示层：如果无法在事实边界内可靠完成完整英文稿，可以省略 locales.en；绝不能为了让英文通过而削弱、改写或丢弃已验证的中文 Canonical 决定。publisher 会将该期英文明确标记为 unavailable，中文仍正常发布。",
  "早报必须以 upcomingMode=replace 重建未来15天；晚报使用 inherit_and_patch，只处理新日期变化。",
  "对 packages 与 trackingQueue 中的每个 eventKey 恰好输出一次决定；trackingQueue 无新证据时必须明确继续追踪或关闭。needs_review 必须 tracking=true；已解决或不再需要跟踪时 tracking=false，并在 reason 写明关闭依据。",
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
console.log(`Editorial packet: ${editorialInput.packages.length} packages; title hints=${titleHints.length}; estimated reading=${editorialInput.budget.estimatedInputTokens} tokens`);
console.log(`Packet: ${PACKET_PATH}`);

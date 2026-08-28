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
  "每个事件给出 include、exclude 或 needs_review；A级事实也必须满足来源与时间要求。",
  "官方状态必须存在已打开的一手来源；只有两家独立可靠来源才可标 multi_source_verified。",
  "未确认内容只能进入 rumors，必须 tracking=true，并在标题与摘要中保留不确定性。",
  "游戏中文名先复用 config/title-translations.json。registry miss 时先检查 editorialInput.titleHints；其中候选中文名已经过来源页面打开与字符串命中校验，但 suggestedStatus 仅是编辑提示，最终仍由你判断 official_simplified、common_translation 或 unavailable。",
  "titleHints 的 sources 只能作为作品名称证据，绝不能作为事件事实、时间、平台、发行信息、source classification 或 tracking 决策的补充证据。",
  "没有可用 titleHint 时，才允许做窄范围 title-only open-web lookup：优先官方简中名称；没有官方名时，仅在存在稳定、广泛使用的中文常用译名时标 common_translation；两者都没有则保留原名并设 titleZhCn=null、titleZhStatus=unavailable。严禁机器直译或临时自造译名。",
  "只要 titleZhCn 已确认，headline 中作为作品主体出现的同一英文名必须使用该中文名；英文原名只保留在 titleEn 元数据中。",
  "标题直述事件，摘要写具体信息；verification说明证据边界，不使用宣传语和套话。",
  "早报必须以 upcomingMode=replace 重建未来15天；晚报使用 inherit_and_patch，只处理新日期变化。",
  "对 packages 与 trackingQueue 中的每个 eventKey 恰好输出一次决定；trackingQueue 无新证据时必须补查后明确继续追踪或关闭。",
  "needs_review 必须 tracking=true；已解决或不再需要跟踪时 tracking=false，并在 reason 写明关闭依据。",
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
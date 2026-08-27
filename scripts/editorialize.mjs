import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildEditorialInput, editorialSchema } from "./lib/editorial-contract.mjs";

const EVIDENCE_PATH = resolve(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json");
const LEDGER_PATH = resolve(process.env.EVENT_LEDGER_PATH || "artifacts/event-ledger.json");
const PACKET_PATH = resolve(process.env.EDITORIAL_PACKET_PATH || "artifacts/editorial-packet.json");
const MAX_INPUT_CHARS = Number(process.env.EDITORIAL_MAX_INPUT_CHARS || 120000);

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
let ledger = null;
try { ledger = JSON.parse(await readFile(LEDGER_PATH, "utf8")); } catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const editorialInput = buildEditorialInput(evidence, MAX_INPUT_CHARS, ledger);
const instructions = [
  "你是游戏行业简报编辑，只能依据证据包判断，不得补写证据中没有的事实。",
  "每个事件给出 include、exclude 或 needs_review；A级事实也必须满足来源与时间要求。",
  "官方状态必须存在已打开的一手来源；只有两家独立可靠来源才可标 multi_source_verified。",
  "未确认内容只能进入 rumors，必须 tracking=true，并在标题与摘要中保留不确定性。",
  "中文名不得机器直译：无官方名或广泛通行译名时 titleZhCn=null、titleZhStatus=unavailable。",
  "标题直述事件，摘要写具体信息；verification说明证据边界，不使用宣传语和套话。",
  "早报必须以 upcomingMode=replace 重建未来15天；晚报使用 inherit_and_patch，只处理新日期变化。",
  "对 packages 与 trackingQueue 中的每个 eventKey 恰好输出一次决定；trackingQueue 无新证据时必须补查后明确继续追踪或关闭。",
  "needs_review 必须 tracking=true；已解决或不再需要跟踪时 tracking=false，并在 reason 写明关闭依据。",
].join("\n");
const packet = {
  schemaVersion: 2,
  generatedAt: new Date().toISOString(),
  mode: "chatgpt-handoff",
  instructions,
  outputSchema: editorialSchema,
  editorialInput,
};
await mkdir(dirname(PACKET_PATH), { recursive: true });
await writeFile(PACKET_PATH, JSON.stringify(packet, null, 2) + "\n");
console.log(`Editorial packet: ${editorialInput.packages.length} packages; estimated reading=${editorialInput.budget.estimatedInputTokens} tokens`);
console.log(`Packet: ${PACKET_PATH}`);

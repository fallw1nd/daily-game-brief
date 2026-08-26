import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildEditorialInput, editorialSchema, validateEditorialOutput } from "./lib/editorial-contract.mjs";

const EVIDENCE_PATH = resolve(process.env.NEWS_EVIDENCE_PATH || "artifacts/news-evidence.json");
const REQUEST_PATH = resolve(process.env.EDITORIAL_REQUEST_PATH || "artifacts/news-editorial-request.json");
const OUTPUT_PATH = resolve(process.env.EDITORIAL_OUTPUT_PATH || "artifacts/news-editorial-output.json");
const MODEL = process.env.OPENAI_EDITOR_MODEL || "gpt-5-mini";
const MAX_INPUT_CHARS = Number(process.env.EDITORIAL_MAX_INPUT_CHARS || 120000);
const shouldRun = process.argv.includes("--run");

const evidence = JSON.parse(await readFile(EVIDENCE_PATH, "utf8"));
const editorialInput = buildEditorialInput(evidence, MAX_INPUT_CHARS);
const instructions = [
  "你是游戏行业简报编辑，只能依据证据包判断，不得补写证据中没有的事实。",
  "每个事件给出 include、exclude 或 needs_review；A级事实也必须满足来源与时间要求。",
  "官方状态必须存在已打开的一手来源；只有两家独立可靠来源才可标 multi_source_verified。",
  "未确认内容只能进入 rumors，必须 tracking=true，并在标题与摘要中保留不确定性。",
  "中文名不得机器直译：无官方名或广泛通行译名时 titleZhCn=null、titleZhStatus=unavailable。",
  "标题直述事件，摘要写具体信息；verification说明证据边界，不使用宣传语和套话。",
  "对每个输入 eventKey 恰好输出一次决定。",
].join("\n");
const requestBody = {
  model: MODEL,
  store: false,
  reasoning: { effort: "low" },
  max_output_tokens: 8000,
  input: [
    { role: "system", content: instructions },
    { role: "user", content: JSON.stringify(editorialInput) },
  ],
  text: {
    format: {
      type: "json_schema",
      name: "daily_game_brief_editorial_decisions",
      strict: true,
      schema: editorialSchema,
    },
  },
};

await mkdir(dirname(REQUEST_PATH), { recursive: true });
await writeFile(REQUEST_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), editorialInput, requestBody }, null, 2) + "\n");
console.log(`Editorial request: ${editorialInput.packages.length} packages; estimated input=${editorialInput.budget.estimatedInputTokens} tokens`);

if (!shouldRun) {
  console.log(`Dry run only: ${REQUEST_PATH}`);
  process.exit(0);
}
if (!process.env.OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is required with --run");

const response = await fetch("https://api.openai.com/v1/responses", {
  method: "POST",
  signal: AbortSignal.timeout(120000),
  headers: {
    Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(requestBody),
});
if (!response.ok) throw new Error(`OpenAI Responses API HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
const result = await response.json();
const outputText = (result.output || []).flatMap((item) => item.content || [])
  .filter((item) => item.type === "output_text")
  .map((item) => item.text)
  .join("");
if (!outputText) throw new Error(`OpenAI response did not contain output_text; status=${result.status || "unknown"}`);
const editorialOutput = JSON.parse(outputText);
const errors = validateEditorialOutput(editorialOutput, editorialInput);
if (errors.length) throw new Error(`Editorial output failed validation:\n- ${errors.join("\n- ")}`);
await writeFile(OUTPUT_PATH, JSON.stringify({ generatedAt: new Date().toISOString(), model: MODEL, responseId: result.id, usage: result.usage, ...editorialOutput }, null, 2) + "\n");
console.log(`Editorial output: ${editorialOutput.decisions.length} decisions; ${OUTPUT_PATH}`);

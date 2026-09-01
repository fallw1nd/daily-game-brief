import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { buildEnglishRepairOverlay } from "./lib/bilingual-publisher.mjs";

const DRAFT_PATH = resolve(process.env.LOCALE_REPAIR_DRAFT_PATH || "artifacts/locale-repair.json");
const RESULT_PATH = resolve(process.env.EDITORIAL_VALIDATION_PATH || "artifacts/editorial-validation.json");
const [draftText, manifestText] = await Promise.all([
  readFile(DRAFT_PATH, "utf8"),
  readFile("public/data/manifest.json", "utf8"),
]);
const draft = JSON.parse(draftText);
const manifest = JSON.parse(manifestText);
const item = (manifest.editions || []).find((edition) => edition.id === draft.editionId);
const errors = [];
let warnings = [];
if (!item) {
  errors.push(`locale repair edition is not published: ${String(draft.editionId || "")}`);
} else {
  const canonical = JSON.parse(await readFile(resolve("public/data", item.path), "utf8"));
  const result = buildEnglishRepairOverlay({ canonical, draft });
  warnings = result.warnings || [];
  if (result.status !== "available") errors.push(...(result.errors || [result.summary]));
}
await mkdir(dirname(RESULT_PATH), { recursive: true });
await writeFile(RESULT_PATH, JSON.stringify({
  schemaVersion: 1,
  editionId: draft?.editionId || null,
  valid: errors.length === 0,
  errors,
  warnings,
}, null, 2) + "\n");
if (errors.length) throw new Error(`English locale repair is invalid:\n- ${errors.join("\n- ")}`);
console.log(`Validated English locale repair ${draft.editionId}.`);

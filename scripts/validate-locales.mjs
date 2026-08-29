import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { buildEnglishLocaleIndex } from "./lib/locale-index.mjs";

const index = await buildEnglishLocaleIndex({ write: false });
const allowedUnavailable = new Set([
  "overlay-missing",
  "editorial-overlay-missing",
  "editorial-overlay-invalid",
]);
const invalid = index.editions.filter((item) => item.reasonCode && !allowedUnavailable.has(item.reasonCode));
if (invalid.length) {
  throw new Error(`Locale validation failed:\n- ${invalid.map((item) => `${item.editionId}: ${item.reasonCode} — ${item.summary}`).join("\n- ")}`);
}
const generatedPath = resolve("public/data/locales/en/index.json");
try {
  const generated = JSON.parse(await readFile(generatedPath, "utf8"));
  if (generated.schemaVersion !== 1 || generated.locale !== "en") {
    throw new Error("generated English locale index has an invalid envelope");
  }
} catch (error) {
  if (error?.code !== "ENOENT") throw error;
}
console.log(`Validated English locale infrastructure for ${index.editions.length} canonical editions.`);
